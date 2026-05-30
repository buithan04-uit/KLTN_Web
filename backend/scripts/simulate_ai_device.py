#!/usr/bin/env python3
"""Publish AI-ready device data to MQTT.

This script is intended for manual testing of both AI diagnosis flows:
- vitals-risk: HR, SpO2, temperature, systolic/diastolic BP, MAP
- ecg-arrhythmia: ECG points with an R-peak-like window

Default usage:
  python scripts/simulate_ai_device.py

By default it runs continuously for DEV_01 and cycles through long phases:
normal baseline, high-risk vitals, recovery, ECG abnormal, recovery.
Each phase lasts long enough for the AI summary window to see a coherent trend.
Press Ctrl+C to stop.

Install dependency when needed:
  pip install paho-mqtt
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ECG_SAMPLING_RATE_HZ = 360
ECG_POINTS_PER_MESSAGE = 128
DEFAULT_PHASE_PLAN = [
    ("normal", 60),
    ("high-risk", 60),
    ("normal", 30),
    ("ecg-abnormal", 60),
    ("normal", 30),
]
ECG_TRAIN_MEAN = -0.28766632142632625
ECG_TRAIN_STD = 0.5241760803999351

# Feature order used by backend/src/ai/vitals-ai.service.js and scaler_mlp.json:
# spo2, temperature, heart_rate, map, age, weight, height_m, bmi, gender
VITALS_SCALER_MEAN = {
    "spo2": 97.50437242701845,
    "temperature": 36.748352906934606,
    "heart_rate": 79.53374662533747,
    "map": 94.47907375929073,
    "age": 53.44627537246275,
    "weight": 74.99641903297447,
    "height_m": 1.750031024435754,
    "bmi": 25.003624968646605,
    "gender": 0.49946505349465053,
}
VITALS_SCALER_SCALE = {
    "spo2": 1.442594334814316,
    "temperature": 0.43328918255366045,
    "heart_rate": 11.55286497724597,
    "map": 4.797878880416905,
}


def load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def load_env_defaults() -> None:
    script_dir = Path(__file__).resolve().parent
    backend_dir = script_dir.parent
    repo_dir = backend_dir.parent
    for env_path in (backend_dir / ".env", repo_dir / ".env", Path.cwd() / ".env"):
        load_env_file(env_path)


def parse_broker_url(raw: str | None) -> tuple[str, int, bool]:
    if not raw:
        return "localhost", 1883, False

    parsed = urlparse(raw)
    host = parsed.hostname or "localhost"
    is_tls = parsed.scheme == "mqtts"
    port = parsed.port or (8883 if is_tls else 1883)
    return host, port, is_tls


def parse_args() -> argparse.Namespace:
    load_env_defaults()
    broker = os.getenv("MQTT_BROKER")
    host, port, is_tls = parse_broker_url(broker)

    parser = argparse.ArgumentParser(
        description="Simulate an AI-ready IoT device and publish data to MQTT."
    )
    parser.add_argument("--broker", default=broker, help="MQTT URL, e.g. mqtt://localhost:1883")
    parser.add_argument("--host", default=host, help="MQTT host")
    parser.add_argument("--port", type=int, default=port, help="MQTT port")
    parser.add_argument("--tls", action="store_true", default=is_tls, help="Use TLS MQTT connection")
    parser.add_argument(
        "--username",
        default=os.getenv("MQTT_DEVICE_USERNAME") or os.getenv("SIM_MQTT_USER") or os.getenv("MQTT_USERNAME"),
        help="MQTT username",
    )
    parser.add_argument(
        "--password",
        default=os.getenv("MQTT_DEVICE_PASSWORD") or os.getenv("SIM_MQTT_PASS") or os.getenv("MQTT_PASSWORD"),
        help="MQTT password",
    )
    parser.add_argument("--device-id", default=os.getenv("SIM_DEVICE_ID", "DEV_01"), help="Registered device_id")
    parser.add_argument("--session-id", default=os.getenv("SIM_SESSION_ID"), help="Optional health session ID")
    parser.add_argument(
        "--mode",
        choices=["auto", "normal", "high-risk", "ecg-abnormal", "mixed"],
        default=os.getenv("SIM_AI_MODE", "auto"),
        help="Data scenario. auto runs long phases; mixed keeps the old short cycle.",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=int(os.getenv("SIM_AI_COUNT", "0")),
        help="Number of messages to publish. 0 means run continuously.",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=float(os.getenv("SIM_AI_INTERVAL", "1.0")),
        help="Seconds between messages",
    )
    parser.add_argument("--seed", type=int, default=None, help="Random seed for repeatable test data")
    parser.add_argument(
        "--phase-plan",
        default=os.getenv("SIM_AI_PHASE_PLAN"),
        help=(
            "Custom auto plan, e.g. normal:60,high-risk:60,normal:30,ecg-abnormal:60. "
            "Only used when --mode auto."
        ),
    )
    parser.add_argument(
        "--topic",
        default=None,
        help="MQTT topic template. Default: vitals/{device_id}/data",
    )
    return parser.parse_args()


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def resolve_topic(template: str | None, device_id: str) -> str:
    if not template:
        return f"vitals/{device_id}/data"
    return template.replace("{device_id}", device_id)


def map_bp(systolic: float, diastolic: float) -> float:
    return (systolic + 2 * diastolic) / 3


def scenario_for_index(mode: str, index: int) -> str:
    if mode == "auto":
        scenario, _, _ = phase_for_index(index, DEFAULT_PHASE_PLAN)
        return scenario

    if mode != "mixed":
        return mode

    # Repeating test plan:
    # - 3 stable packets so dashboards show an ordinary baseline
    # - 2 vital-risk packets for vitals-risk
    # - 2 ECG-abnormal packets for ECG-arrhythmia
    # - 1 recovery packet
    cycle = index % 8
    if cycle in (0, 1, 2, 7):
        return "normal"
    if cycle in (3, 4):
        return "high-risk"
    return "ecg-abnormal"


def parse_phase_plan(raw: str | None) -> list[tuple[str, int]]:
    if not raw:
        return DEFAULT_PHASE_PLAN

    allowed = {"normal", "high-risk", "ecg-abnormal"}
    plan: list[tuple[str, int]] = []
    for chunk in raw.split(","):
        item = chunk.strip()
        if not item:
            continue
        if ":" not in item:
            raise ValueError(f"Invalid phase entry '{item}'. Expected scenario:count")
        scenario, count_raw = item.split(":", 1)
        scenario = scenario.strip()
        if scenario not in allowed:
            raise ValueError(f"Invalid scenario '{scenario}' in phase plan")
        count = int(count_raw.strip())
        if count <= 0:
            raise ValueError("Phase count must be > 0")
        plan.append((scenario, count))

    if not plan:
        raise ValueError("Phase plan cannot be empty")
    return plan


def phase_for_index(index: int, plan: list[tuple[str, int]]) -> tuple[str, int, int]:
    total = sum(length for _, length in plan)
    position = index % total
    offset = 0
    for phase_index, (scenario, length) in enumerate(plan):
        if position < offset + length:
            return scenario, phase_index, position - offset + 1
        offset += length
    scenario, length = plan[-1]
    return scenario, len(plan) - 1, length


def normalized_to_raw_ecg(value: float) -> float:
    return value * ECG_TRAIN_STD + ECG_TRAIN_MEAN


def gaussian(x: float, center: float, width: float, amplitude: float) -> float:
    return amplitude * math.exp(-((x - center) ** 2) / width)


def ecg_label_for_scenario(scenario: str) -> str:
    if scenario == "ecg-abnormal":
        return "V"
    return "N"


def build_ecg_points(index: int, scenario: str) -> list[float]:
    """Create a MIT-BIH-like raw ECG window.

    The ECG model was trained on MIT-BIH beats centered on annotated R-peaks.
    We therefore build a beat in normalized training space first, then invert the
    notebook scaling so the backend can apply the same normalization again:
        normalized = (raw - ECG_TRAIN_MEAN) / ECG_TRAIN_STD

    This is for integration testing, not clinical validation.
    """

    points = []
    peak_center = ECG_POINTS_PER_MESSAGE // 2
    label = ecg_label_for_scenario(scenario)

    for i in range(ECG_POINTS_PER_MESSAGE):
        x = i - peak_center
        baseline = 0.04 * math.sin((index * 0.5) + i * 0.045)

        if label == "V":
            # Wider QRS-like complex. Kept in normalized train space.
            z = (
                baseline
                + gaussian(x, -28, 90, 0.10)
                + gaussian(x, -8, 26, -0.45)
                + gaussian(x, 0, 34, 2.15)
                + gaussian(x, 13, 48, -0.75)
                + gaussian(x, 36, 170, 0.28)
                + random.uniform(-0.025, 0.025)
            )
        else:
            # Normal-beat-like morphology: narrow R peak centered in the window.
            z = (
                baseline
                + gaussian(x, -23, 70, 0.16)
                + gaussian(x, -4, 8, -0.35)
                + gaussian(x, 0, 4.8, 2.35)
                + gaussian(x, 5, 11, -0.52)
                + gaussian(x, 29, 120, 0.36)
                + random.uniform(-0.018, 0.018)
            )

        raw = normalized_to_raw_ecg(z)
        points.append(round(clamp(raw, -5.0, 5.0), 4))

    return points


def build_payload(device_id: str, session_id: str | None, mode: str, index: int) -> dict:
    scenario = scenario_for_index(mode, index)
    return build_payload_for_scenario(device_id, session_id, scenario, index)


def build_payload_for_scenario(device_id: str, session_id: str | None, scenario: str, index: int) -> dict:

    if scenario == "high-risk":
        hr = VITALS_SCALER_MEAN["heart_rate"] + (4.7 * VITALS_SCALER_SCALE["heart_rate"]) + (index % 4)
        spo2 = VITALS_SCALER_MEAN["spo2"] - (5.8 * VITALS_SCALER_SCALE["spo2"]) + (index % 2) * 0.4
        temp = VITALS_SCALER_MEAN["temperature"] + (5.3 * VITALS_SCALER_SCALE["temperature"]) + (index % 3) * 0.1
        target_map = VITALS_SCALER_MEAN["map"] + (4.4 * VITALS_SCALER_SCALE["map"])
        diastolic = 96 + (index % 3)
        systolic = (3 * target_map) - (2 * diastolic)
    else:
        hr = VITALS_SCALER_MEAN["heart_rate"] + random.uniform(-0.35, 0.35) * VITALS_SCALER_SCALE["heart_rate"]
        spo2 = VITALS_SCALER_MEAN["spo2"] + random.uniform(-0.25, 0.25) * VITALS_SCALER_SCALE["spo2"]
        temp = VITALS_SCALER_MEAN["temperature"] + random.uniform(-0.25, 0.25) * VITALS_SCALER_SCALE["temperature"]
        target_map = VITALS_SCALER_MEAN["map"] + random.uniform(-0.35, 0.35) * VITALS_SCALER_SCALE["map"]
        diastolic = 78 + (index % 3)
        systolic = (3 * target_map) - (2 * diastolic)

    mean_arterial_pressure = map_bp(systolic, diastolic)
    ecg_points = build_ecg_points(index, scenario)

    return {
        "device_id": device_id,
        "hr": int(round(hr)),
        "spo2": round(spo2, 1),
        "temp": round(temp, 2),
        "systolic_bp": int(round(systolic)),
        "diastolic_bp": int(round(diastolic)),
        "map": round(mean_arterial_pressure, 1),
        "ecg": ecg_points[-1],
        "ecg_points": ecg_points,
        "ecg_sampling_rate": ECG_SAMPLING_RATE_HZ,
        "ecg_lead": "II",
        "ecg_train_scale": {
            "mean": ECG_TRAIN_MEAN,
            "std": ECG_TRAIN_STD,
            "note": "payload is raw ECG; backend applies (raw - mean) / std",
        },
        "ecg_expected_label": ecg_label_for_scenario(scenario),
        "scenario": scenario,
        "session_id": session_id,
        "ts": datetime.now(timezone.utc).isoformat(),
    }


def load_mqtt_module():
    try:
        import paho.mqtt.client as mqtt
    except ImportError:
        print("Missing dependency: paho-mqtt")
        print("Install with: pip install paho-mqtt")
        sys.exit(1)
    return mqtt


def create_client(mqtt_module):
    if hasattr(mqtt_module, "CallbackAPIVersion"):
        return mqtt_module.Client(mqtt_module.CallbackAPIVersion.VERSION2)
    return mqtt_module.Client()


def main() -> int:
    args = parse_args()
    if args.broker:
        host, port, is_tls = parse_broker_url(args.broker)
        args.host = host
        args.port = port
        args.tls = args.tls or is_tls

    if args.seed is not None:
        random.seed(args.seed)

    try:
        phase_plan = parse_phase_plan(args.phase_plan)
    except ValueError as exc:
        print(f"Invalid phase plan: {exc}")
        return 2

    topic = resolve_topic(args.topic, args.device_id)
    mqtt_module = load_mqtt_module()
    client = create_client(mqtt_module)
    if args.username:
        client.username_pw_set(args.username, args.password)
    if args.tls:
        client.tls_set()

    print(f"Connecting MQTT {args.host}:{args.port}")
    client.connect(args.host, args.port, keepalive=60)
    client.loop_start()

    try:
        run_forever = args.count <= 0
        total_label = "continuous" if run_forever else str(args.count)
        print(f"Publishing {total_label} AI-ready message(s) to {topic}")
        if args.mode == "auto":
            plan_text = " -> ".join(f"{scenario}({length})" for scenario, length in phase_plan)
            print(f"Auto phase plan: {plan_text}")
            print("Each phase is intentionally long so AI summaries see a coherent trend.")
        else:
            print(
                "Scenario cycle: normal -> high-risk vitals -> ECG abnormal -> recovery. "
                "Press Ctrl+C to stop."
            )

        index = 0
        while run_forever or index < args.count:
            if args.mode == "auto":
                scenario, phase_index, phase_position = phase_for_index(index, phase_plan)
                phase_length = phase_plan[phase_index][1]
                payload = build_payload_for_scenario(args.device_id, args.session_id, scenario, index)
                phase_label = f"phase={phase_index + 1}/{len(phase_plan)} {phase_position}/{phase_length}"
            else:
                payload = build_payload(args.device_id, args.session_id, args.mode, index)
                phase_label = "phase=n/a"

            message = json.dumps(payload, separators=(",", ":"))
            info = client.publish(topic, message, qos=0, retain=False)
            info.wait_for_publish()

            counter = f"{index + 1:05d}" if run_forever else f"{index + 1:03d}/{args.count:03d}"
            print(
                f"[{counter}] "
                f"{phase_label} "
                f"scenario={payload['scenario']} "
                f"HR={payload['hr']} SpO2={payload['spo2']} Temp={payload['temp']} "
                f"BP={payload['systolic_bp']}/{payload['diastolic_bp']} "
                f"MAP={payload['map']} ECG={len(payload['ecg_points'])}pts"
            )

            index += 1
            if run_forever or index < args.count:
                time.sleep(max(args.interval, 0.05))
    except KeyboardInterrupt:
        print("\nStopping by user request...")
    finally:
        client.loop_stop()
        client.disconnect()
        print("Done. Check AI Diagnosis page or ai_predictions table.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
