#!/usr/bin/env python3
"""
Export MIT-BIH Arrhythmia beats from Lead II/MLII for ECG model evaluation.

Input dataset folder should contain WFDB files such as:
  100.dat, 100.hea, 100.atr, ...

MIT-BIH commonly names the Lead II-like channel as "MLII". This script uses
MLII first, then II/Lead II if present, and skips records without a compatible
lead. It exports raw beat windows centered on annotation samples; the Node
evaluation script applies the same ECG scaling as the backend model.

Install dependency:
  py -m pip install wfdb numpy

Example:
  py backend/scripts/prepare_mitbih_lead2_eval.py ^
    --dataset-dir mit-bih-arrhythmia-database-1.0.0 ^
    --output backend/scripts/mitbih_lead2_eval.jsonl ^
    --window-size 128 --max-per-class 500
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

try:
    import wfdb
except ImportError as exc:
    raise SystemExit("Missing wfdb. Install with: py -m pip install wfdb numpy") from exc


AAMI_MAP = {
    "N": "N", "L": "N", "R": "N", "e": "N", "j": "N",
    "A": "S", "a": "S", "J": "S", "S": "S",
    "V": "V", "E": "V",
    "F": "F",
    "/": "Q", "f": "Q", "Q": "Q", "?": "Q",
}

LEAD_CANDIDATES = {"MLII", "II", "LEAD II", "LEAD_II"}


def get_records(dataset_dir: Path) -> list[str]:
    records_file = dataset_dir / "RECORDS"
    if records_file.exists():
        return [
            line.strip()
            for line in records_file.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.startswith("#")
        ]
    return sorted(path.stem for path in dataset_dir.glob("*.hea"))


def find_lead_index(sig_names: list[str]) -> tuple[int | None, str | None]:
    normalized = [name.strip().upper().replace("-", " ") for name in sig_names]
    for preferred in ("MLII", "II", "LEAD II", "LEAD_II"):
        for idx, name in enumerate(normalized):
            if name == preferred:
                return idx, sig_names[idx]
    for idx, name in enumerate(normalized):
        if name in LEAD_CANDIDATES or "MLII" in name or name.endswith(" II"):
            return idx, sig_names[idx]
    return None, None


def export_beats(args: argparse.Namespace) -> Counter:
    dataset_dir = Path(args.dataset_dir)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    allowed_labels = {item.strip() for item in args.labels.split(",") if item.strip()}

    records = get_records(dataset_dir)
    half = args.window_size // 2
    counts: Counter = Counter()
    per_class_counts: defaultdict[str, int] = defaultdict(int)
    skipped: Counter = Counter()

    with output_path.open("w", encoding="utf-8") as out:
        for record_name in records:
            record_path = str(dataset_dir / record_name)
            try:
                record = wfdb.rdrecord(record_path)
                annotation = wfdb.rdann(record_path, "atr")
            except Exception as exc:
                skipped[f"read_error:{record_name}"] += 1
                print(f"Skip {record_name}: {exc}")
                continue

            lead_index, lead_name = find_lead_index(record.sig_name)
            if lead_index is None:
                skipped["missing_lead_ii"] += 1
                print(f"Skip {record_name}: no MLII/Lead II in {record.sig_name}")
                continue

            signal = record.p_signal[:, lead_index]
            for sample, symbol in zip(annotation.sample, annotation.symbol):
                label = AAMI_MAP.get(symbol)
                if not label:
                    skipped[f"symbol:{symbol}"] += 1
                    continue
                if allowed_labels and label not in allowed_labels:
                    skipped[f"label:{label}"] += 1
                    continue
                if args.max_per_class and per_class_counts[label] >= args.max_per_class:
                    continue

                start = int(sample) - half
                end = start + args.window_size
                if start < 0 or end > len(signal):
                    skipped["boundary"] += 1
                    continue

                points = [round(float(value), 6) for value in signal[start:end]]
                row = {
                    "record": record_name,
                    "sample": int(sample),
                    "symbol": symbol,
                    "label": label,
                    "lead_name": lead_name,
                    "sampling_rate": float(record.fs),
                    "window_size": args.window_size,
                    "ecg_points": points,
                }
                out.write(json.dumps(row, separators=(",", ":")) + "\n")
                counts[label] += 1
                per_class_counts[label] += 1

    print(f"Exported: {output_path}")
    print("Counts:", dict(counts))
    if skipped:
        print("Skipped:", dict(skipped))
    return counts


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-dir", default="mit-bih-arrhythmia-database-1.0.0")
    parser.add_argument("--output", default="backend/scripts/mitbih_lead2_eval.jsonl")
    parser.add_argument("--window-size", type=int, default=128)
    parser.add_argument("--max-per-class", type=int, default=500)
    parser.add_argument(
        "--labels",
        default="N,S,V,F",
        help="Comma-separated AAMI labels to export. Default matches current ECG model classes: N,S,V,F.",
    )
    args = parser.parse_args()

    export_beats(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
