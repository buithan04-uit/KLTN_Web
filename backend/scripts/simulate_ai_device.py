#!/usr/bin/env python3
"""Publish AI-ready device data to MQTT.

This script is intended for manual testing of both AI diagnosis flows:
- vitals-risk: HR, SpO2, temperature, systolic/diastolic BP, MAP
- ecg-arrhythmia: ECG points with an R-peak-like window

Default usage:
  python scripts/simulate_ai_device.py

By default it runs continuously for DEV_01 in dual-ai mode, meaning every
message carries stable vitals and ECG points in parallel.
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
STABLE_ECG_POINTS_PER_MESSAGE = 256
DEFAULT_ECG_TEMPLATE_FILE = Path(__file__).resolve().parent / "ecg_templates.json"
ECG_TEMPLATES: dict[str, list[list[float]]] = {}
ECG_TEMPLATE_SCALE = "raw"
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
        choices=["auto", "normal", "stable-both", "dual-ai", "ecg-stable", "high-risk", "ecg-abnormal", "mixed"],
        default=os.getenv("SIM_AI_MODE", "dual-ai"),
        help="Data scenario. dual-ai sends vitals and ECG together continuously.",
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
        "--ecg-template-file",
        default=os.getenv("SIM_ECG_TEMPLATE_FILE", str(DEFAULT_ECG_TEMPLATE_FILE)),
        help=(
            "Optional JSON templates exported from train/test ECG data. "
            "Format: {'scale':'raw'|'normalized','templates':{'N':[[...]],'V':[[...]]}} "
            "or {'N':[...], 'V':[...]}."
        ),
    )
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

    allowed = {"normal", "stable-both", "dual-ai", "ecg-stable", "high-risk", "ecg-abnormal"}
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


def resample_points(points: list[float], target_count: int) -> list[float]:
    if len(points) == target_count:
        return points
    if len(points) < 2:
        return [points[0] if points else 0.0] * target_count

    result: list[float] = []
    last = len(points) - 1
    for i in range(target_count):
        position = (i * last) / max(target_count - 1, 1)
        left = int(math.floor(position))
        right = min(left + 1, last)
        ratio = position - left
        result.append(points[left] * (1 - ratio) + points[right] * ratio)
    return result


def normalize_template_collection(value) -> list[list[float]]:
    if not value:
        return []

    if isinstance(value, list) and value and all(isinstance(item, (int, float)) for item in value):
        return [[float(item) for item in value]]

    templates: list[list[float]] = []
    if isinstance(value, list):
        for item in value:
            if isinstance(item, list):
                numeric = [float(v) for v in item if isinstance(v, (int, float))]
                if numeric:
                    templates.append(numeric)
    return templates


def load_ecg_templates(path_raw: str | None) -> tuple[dict[str, list[list[float]]], str]:
    if not path_raw:
        return {}, "raw"

    path = Path(path_raw)
    if not path.exists():
        return {}, "raw"

    data = json.loads(path.read_text(encoding="utf-8"))
    scale = str(data.get("scale", "raw")).strip().lower() if isinstance(data, dict) else "raw"
    source = data.get("templates", data) if isinstance(data, dict) else data
    templates: dict[str, list[list[float]]] = {}

    if isinstance(source, dict):
        for label, collection in source.items():
            normalized = normalize_template_collection(collection)
            if normalized:
                templates[str(label)] = normalized

    return templates, scale if scale in {"raw", "normalized"} else "raw"


def select_ecg_template(label: str, index: int, sample_count: int) -> list[float] | None:
    templates = ECG_TEMPLATES.get(label) or ECG_TEMPLATES.get(label.upper())
    if not templates:
        return None

    template = templates[index % len(templates)]
    points = resample_points(template, sample_count)
    if ECG_TEMPLATE_SCALE == "normalized":
        points = [normalized_to_raw_ecg(value) for value in points]

    # Tiny jitter prevents duplicate rows while preserving the train/test shape.
    return [round(clamp(value + random.uniform(-0.002, 0.002), -5.0, 5.0), 4) for value in points]


def gaussian(x: float, center: float, width: float, amplitude: float) -> float:
    return amplitude * math.exp(-((x - center) ** 2) / width)


def ecg_label_for_scenario(scenario: str, index: int = 0) -> str:
    if scenario == "ecg-abnormal":
        return "V"
    if scenario == "dual-ai" and (index // 5) % 2 == 1:
        return "V"
    return "N"


def build_ecg_points(index: int, scenario: str, sample_count: int = ECG_POINTS_PER_MESSAGE) -> list[float]:
    """Create a MIT-BIH-like raw ECG window.

    The ECG model was trained on MIT-BIH beats centered on annotated R-peaks.
    We therefore build a beat in normalized training space first, then invert the
    notebook scaling so the backend can apply the same normalization again:
        normalized = (raw - ECG_TRAIN_MEAN) / ECG_TRAIN_STD

    This is for integration testing, not clinical validation.
    """

    points = []
    peak_center = sample_count // 2
    label = ecg_label_for_scenario(scenario, index)
    template_points = select_ecg_template(label, index, sample_count)
    if template_points:
        return template_points

    for i in range(sample_count):
        x = i - peak_center
        baseline = 0.04 * math.sin((index * 0.5) + i * 0.045)

        if label == "V":
            # Wider QRS-like complex. Kept in normalized train space.
            z = (
                baseline
                + gaussian(x, -30, 130, 0.08)
                + gaussian(x, -10, 42, -0.55)
                + gaussian(x, 0, 58, 2.35)
                + gaussian(x, 18, 86, -0.95)
                + gaussian(x, 44, 220, 0.24)
                + random.uniform(-0.025, 0.025)
            )
        else:
            # Normal-beat-like morphology: narrow R peak centered in the window.
            # stable-both/ecg-stable use lower noise and a longer window so ECG preprocessing
            # has enough clean points while preserving the same morphology.
            noise_span = 0.006 if scenario in ("stable-both", "dual-ai", "ecg-stable") else 0.018
            z = (
                (baseline * 0.35)
                + gaussian(x, -24, 75, 0.10)
                + gaussian(x, -3, 6, -0.16)
                + gaussian(x, 0, 2.8, 1.05)
                + gaussian(x, 4, 8, -0.22)
                + gaussian(x, 34, 160, 0.18)
                + random.uniform(-noise_span, noise_span)
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
    elif scenario in ("stable-both", "dual-ai", "ecg-stable"):
        # Stable values close to the trained scaler mean. This mode is meant to
        # verify that both AI flows receive coherent, low-noise input.
        hr = VITALS_SCALER_MEAN["heart_rate"] + random.uniform(-0.12, 0.12) * VITALS_SCALER_SCALE["heart_rate"]
        spo2 = VITALS_SCALER_MEAN["spo2"] + random.uniform(-0.08, 0.08) * VITALS_SCALER_SCALE["spo2"]
        temp = VITALS_SCALER_MEAN["temperature"] + random.uniform(-0.08, 0.08) * VITALS_SCALER_SCALE["temperature"]
        target_map = VITALS_SCALER_MEAN["map"] + random.uniform(-0.10, 0.10) * VITALS_SCALER_SCALE["map"]
        diastolic = 78 + (index % 2)
        systolic = (3 * target_map) - (2 * diastolic)
    else:
        hr = VITALS_SCALER_MEAN["heart_rate"] + random.uniform(-0.35, 0.35) * VITALS_SCALER_SCALE["heart_rate"]
        spo2 = VITALS_SCALER_MEAN["spo2"] + random.uniform(-0.25, 0.25) * VITALS_SCALER_SCALE["spo2"]
        temp = VITALS_SCALER_MEAN["temperature"] + random.uniform(-0.25, 0.25) * VITALS_SCALER_SCALE["temperature"]
        target_map = VITALS_SCALER_MEAN["map"] + random.uniform(-0.35, 0.35) * VITALS_SCALER_SCALE["map"]
        diastolic = 78 + (index % 3)
        systolic = (3 * target_map) - (2 * diastolic)

    mean_arterial_pressure = map_bp(systolic, diastolic)
    ecg_sample_count = (
        STABLE_ECG_POINTS_PER_MESSAGE
        if scenario in ("stable-both", "dual-ai", "ecg-stable", "ecg-abnormal")
        else ECG_POINTS_PER_MESSAGE
    )
    ecg_points = build_ecg_points(index, scenario, sample_count=ecg_sample_count)

    heart_rate = int(round(hr))
    temperature = round(temp, 2)
    systolic_bp = int(round(systolic))
    diastolic_bp = int(round(diastolic))
    ecg_value = ecg_points[-1]

    return {
        "device_id": device_id,
        # Legacy fields used by the current realtime/MQTT flow.
        "hr": heart_rate,
        "spo2": round(spo2, 1),
        "temp": temperature,
        "ecg": ecg_value,
        # Explicit AI-friendly aliases used by newer preprocessing.
        "heart_rate": heart_rate,
        "temperature": temperature,
        "ecg_value": ecg_value,
        "systolic_bp": systolic_bp,
        "diastolic_bp": diastolic_bp,
        "map": round(mean_arterial_pressure, 1),
        "blood_pressure_source": "manual_test_input",
        "ecg_points": ecg_points,
        "sampling_rate": ECG_SAMPLING_RATE_HZ,
        "expected_sampling_rate": ECG_SAMPLING_RATE_HZ,
        "ecg_sampling_rate": ECG_SAMPLING_RATE_HZ,
        "ecg_lead": "II",
        "temperature_corrected": False,
        "temperature_calibration_version": None,
        "ecg_train_scale": {
            "mean": ECG_TRAIN_MEAN,
            "std": ECG_TRAIN_STD,
            "note": "payload is raw ECG; backend applies (raw - mean) / std",
        },
        "ecg_expected_label": ecg_label_for_scenario(scenario, index),
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
    global ECG_TEMPLATES, ECG_TEMPLATE_SCALE

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

    ECG_TEMPLATES, ECG_TEMPLATE_SCALE = load_ecg_templates(args.ecg_template_file)
    if ECG_TEMPLATES:
        labels = ", ".join(f"{label}:{len(items)}" for label, items in sorted(ECG_TEMPLATES.items()))
        print(f"Loaded ECG templates from {args.ecg_template_file} ({ECG_TEMPLATE_SCALE}): {labels}")
    else:
        print("No ECG template file loaded; falling back to synthetic ECG generator.")

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
