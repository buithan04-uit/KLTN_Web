#!/usr/bin/env python3
"""Simulate IoT vital signals and publish to MQTT for realtime web monitoring.

Usage example:
  python simulate_device_mqtt.py --device-id DEV_01 --host localhost --port 1883
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import signal
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

try:
    import paho.mqtt.client as mqtt
except ImportError:
    print("Missing dependency: paho-mqtt")
    print("Install with: pip install paho-mqtt")
    sys.exit(1)


def load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def load_env_defaults() -> None:
    script_dir = Path(__file__).resolve().parent
    backend_dir = script_dir.parent
    candidates = [
        backend_dir / ".env",
        Path.cwd() / ".env",
    ]
    for env_path in candidates:
        load_env_file(env_path)


def parse_broker_url(broker_url: str | None) -> tuple[str, int]:
    if not broker_url:
        return "localhost", 1883

    parsed = urlparse(broker_url)
    host = parsed.hostname or "localhost"
    if parsed.port:
        return host, parsed.port

    if parsed.scheme == "mqtts":
        return host, 8883
    return host, 1883


def env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def parse_args() -> argparse.Namespace:
    load_env_defaults()
    broker_default = os.getenv("MQTT_BROKER")
    broker_host, broker_port = parse_broker_url(broker_default)
    default_device_user = os.getenv("SIM_MQTT_USER") or os.getenv("MQTT_DEVICE_USERNAME") or "device"
    default_device_pass = os.getenv("SIM_MQTT_PASS") or os.getenv("MQTT_DEVICE_PASSWORD")

    parser = argparse.ArgumentParser(
        description="Simulate vital signals from a device and publish to MQTT."
    )
    parser.add_argument(
        "--broker",
        default=broker_default,
        help="Broker URL, e.g. mqtt://localhost:1883 (default from MQTT_BROKER)",
    )
    parser.add_argument("--host", default=broker_host, help="MQTT broker host")
    parser.add_argument("--port", type=int, default=env_int("SIM_MQTT_PORT", broker_port), help="MQTT broker port")
    parser.add_argument("--username", default=default_device_user, help="MQTT username")
    parser.add_argument("--password", default=default_device_pass, help="MQTT password")
    parser.add_argument("--device-id", default=os.getenv("SIM_DEVICE_ID", "DEV_01"), help="Device ID")
    parser.add_argument(
        "--devices",
        default=os.getenv("SIM_DEVICES"),
        help="Comma-separated device IDs, e.g. DEV_01,DEV_02",
    )
    parser.add_argument(
        "--patient-devices",
        default=os.getenv("SIM_PATIENT_DEVICES"),
        help=(
            "Patient to devices mapping, format: "
            "PAT_01:DEV_01|DEV_02,PAT_02:DEV_03"
        ),
    )
    parser.add_argument(
        "--topic",
        default=os.getenv("SIM_TOPIC"),
        help=(
            "Custom topic template. Use {device_id} and optionally {patient_id}. "
            "Default: vitals/<device-id>/data"
        ),
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=env_float("SIM_INTERVAL", 1.0),
        help="Seconds between messages",
    )
    parser.add_argument(
        "--abnormal-rate",
        type=float,
        default=env_float("SIM_ABNORMAL_RATE", 0.1),
        help="Probability [0..1] to generate abnormal values",
    )
    parser.add_argument(
        "--session-id",
        default=os.getenv("SIM_SESSION_ID"),
        help="Optional session_id to include in payload",
    )
    parser.add_argument(
        "--device-stagger-ms",
        type=int,
        default=env_int("SIM_DEVICE_STAGGER_MS", 0),
        help="Delay between publishes of devices in same cycle (milliseconds)",
    )
    return parser.parse_args()


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def parse_csv_devices(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [part.strip() for part in raw.split(",") if part.strip()]


def parse_patient_devices(raw: str | None) -> list[dict]:
    """Parse format: PAT_01:DEV_01|DEV_02,PAT_02:DEV_03"""
    streams = []
    if not raw:
        return streams

    chunks = [item.strip() for item in raw.split(",") if item.strip()]
    for chunk in chunks:
        if ":" not in chunk:
            raise ValueError(
                "Invalid --patient-devices format. Expected PATIENT:DEV1|DEV2"
            )
        patient_id, device_part = chunk.split(":", 1)
        patient_id = patient_id.strip()
        if not patient_id:
            raise ValueError("patient_id in --patient-devices cannot be empty")

        devices = [d.strip() for d in device_part.split("|") if d.strip()]
        if not devices:
            raise ValueError(f"Patient {patient_id} has no device IDs")

        for device_id in devices:
            streams.append({"patient_id": patient_id, "device_id": device_id})
    return streams


def build_streams(args: argparse.Namespace) -> list[dict]:
    patient_streams = parse_patient_devices(args.patient_devices)
    if patient_streams:
        return patient_streams

    devices = parse_csv_devices(args.devices)
    if devices:
        return [{"patient_id": None, "device_id": d} for d in devices]

    return [{"patient_id": None, "device_id": args.device_id}]


def resolve_topic(topic_template: str | None, device_id: str, patient_id: str | None) -> str:
    if not topic_template:
        return f"vitals/{device_id}/data"
    return (
        topic_template.replace("{device_id}", device_id)
        .replace("{patient_id}", patient_id or "")
    )


def create_mqtt_client() -> mqtt.Client:
    # paho-mqtt >= 2 has CallbackAPIVersion; older versions do not.
    if hasattr(mqtt, "CallbackAPIVersion"):
        return mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    return mqtt.Client()


def generate_payload(
    device_id: str,
    session_id: str | None,
    t: float,
    abnormal_rate: float,
    patient_id: str | None = None,
) -> dict:
    # Base waveform to make signal look realistic over time.
    hr = 78 + 8 * math.sin(t / 6.0) + random.uniform(-2.5, 2.5)
    spo2 = 97.8 + 0.7 * math.sin(t / 9.0) + random.uniform(-0.4, 0.4)
    temp = 36.8 + 0.15 * math.sin(t / 15.0) + random.uniform(-0.05, 0.05)
    ecg = 0.12 * math.sin(t * 6.0) + random.uniform(-0.03, 0.03)

    # ECG waveform points for this second (sample window)
    ecg_points = []
    for i in range(32):
        phase = t * 6.0 + i * 0.18
        point = 0.14 * math.sin(phase) + 0.02 * math.sin(phase * 3.0) + random.uniform(-0.01, 0.01)
        ecg_points.append(round(clamp(point, -2.0, 2.0), 3))

    # Inject occasional abnormal episodes for alert testing.
    if random.random() < abnormal_rate:
        mode = random.choice(["tachy", "brady", "hypoxia", "fever"])
        if mode == "tachy":
            hr = random.uniform(125, 155)
        elif mode == "brady":
            hr = random.uniform(38, 48)
        elif mode == "hypoxia":
            spo2 = random.uniform(84, 91)
        elif mode == "fever":
            temp = random.uniform(38.3, 39.7)

    payload = {
        "device_id": device_id,
        "patient_id": patient_id,
        "hr": int(round(clamp(hr, 30, 220))),
        "spo2": round(clamp(spo2, 70, 100), 1),
        "temp": round(clamp(temp, 34.0, 42.0), 2),
        "ecg": round(clamp(ecg, -2.0, 2.0), 3),
        "ecg_points": ecg_points,
        "session_id": session_id,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    return payload


def main() -> int:
    args = parse_args()
    if args.broker:
        broker_host, broker_port = parse_broker_url(args.broker)
        if not any(opt in sys.argv for opt in ("--host",)):
            args.host = broker_host
        if not any(opt in sys.argv for opt in ("--port",)):
            args.port = broker_port

    try:
        streams = build_streams(args)
    except ValueError as exc:
        print(f"Argument error: {exc}")
        return 2

    if args.topic and "{device_id}" not in args.topic and len(streams) > 1:
        print(
            "Warning: --topic has no {device_id}; all devices will publish to same topic."
        )

    client = create_mqtt_client()
    if args.username:
        client.username_pw_set(args.username, args.password)

    stop = {"flag": False}

    def handle_stop(signum, frame):
        _ = (signum, frame)
        stop["flag"] = True

    signal.signal(signal.SIGINT, handle_stop)
    signal.signal(signal.SIGTERM, handle_stop)

    print(f"Connecting MQTT: {args.host}:{args.port}")
    client.connect(args.host, args.port, keepalive=60)
    client.loop_start()

    print(f"Simulating {len(streams)} device stream(s)")
    for stream in streams:
        topic = resolve_topic(args.topic, stream["device_id"], stream["patient_id"])
        patient_view = stream["patient_id"] or "N/A"
        print(f"  patient={patient_view} device={stream['device_id']} topic={topic}")
    print("Press Ctrl+C to stop.")

    t0 = time.time()
    count = 0
    phases = {
        stream["device_id"]: random.uniform(0.0, 1000.0)
        for stream in streams
    }

    try:
        while not stop["flag"]:
            cycle_start = time.time()
            abnormal_rate = clamp(args.abnormal_rate, 0.0, 1.0)

            for stream in streams:
                t = (time.time() - t0) + phases[stream["device_id"]]
                payload = generate_payload(
                    device_id=stream["device_id"],
                    session_id=args.session_id,
                    t=t,
                    abnormal_rate=abnormal_rate,
                    patient_id=stream["patient_id"],
                )
                message = json.dumps(payload, separators=(",", ":"))
                topic = resolve_topic(args.topic, stream["device_id"], stream["patient_id"])
                info = client.publish(topic, message, qos=0, retain=False)
                info.wait_for_publish()

                count += 1
                patient_view = stream["patient_id"] or "N/A"
                print(
                    f"[{count:05d}] patient={patient_view} device={stream['device_id']} "
                    f"topic={topic} payload={message}"
                )

                if args.device_stagger_ms > 0:
                    time.sleep(args.device_stagger_ms / 1000.0)

            elapsed = time.time() - cycle_start
            sleep_time = max(args.interval - elapsed, 0.05)
            time.sleep(sleep_time)
    finally:
        client.loop_stop()
        client.disconnect()
        print("Stopped.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
