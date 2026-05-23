# AI Integration

This folder is reserved for model inference code and exported model artifacts.

## Folder layout

```text
src/ai/
  index.js
  ai.service.js
  vitals-ai.service.js
  ecg-ai.service.js
  preprocessing.js

  models/
    vitals-risk/
      model.json
      group*.bin
      scaler_mlp.json
      risk_encoder.json

    ecg-arrhythmia/
      model.json
      group*.bin
      metadata.json
```

## Expected model exports

Vitals risk model:

- Export TensorFlow.js model from `BMP_SPO2_TEMP.ipynb`.
- Copy `model.json` and `group*.bin` into `models/vitals-risk/`.
- Copy `scaler_mlp.json` and `risk_encoder.json` into `models/vitals-risk/`.

ECG arrhythmia model:

- Export TensorFlow.js model from `ECG_Lead_II.ipynb`.
- Copy `model.json` and `group*.bin` into `models/ecg-arrhythmia/`.
- Keep `metadata.json` aligned with the training configuration.

## ECG integration constraints

`ECG_Lead_II.ipynb` trains on MIT-BIH beats cut as 100 samples centered on annotated R-peaks at 360 Hz. Live MQTT data does not include annotation labels, so runtime preprocessing selects the strongest ECG deflection that can be centered in a 100-sample window, then applies the same global standardization parameters from `metadata.json`.

This is still an approximation. Production-quality ECG diagnosis needs device sampling rate, lead identity, filtering, R-peak detection, and validation on real device data. The `confidence` stored in `ai_predictions` is the model output probability for one prediction, not the test accuracy or clinical reliability score.

## Runtime note

Do not make MQTT ingestion fail if AI inference is unavailable. The AI layer should skip prediction when model files or required input features are missing.

## Runtime endpoints

Backend exposes:

- `GET /api/ai/status`
- `GET /api/ai/summary/:deviceId`
- `GET /api/ai/predictions/:deviceId`
- `POST /api/ai/predict/latest/:deviceId`
