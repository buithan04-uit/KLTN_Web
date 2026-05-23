# Vitals Risk Model

Copy the exported TensorFlow.js vitals model files here.

Expected files:

```text
model.json
group*.bin
scaler_mlp.json
risk_encoder.json
```

The current training notebook expects these input features in order:

```text
Oxygen Saturation
Body Temperature
Heart Rate
Derived_MAP
Age
Weight (kg)
Height (m)
Derived_BMI
Gender_encoded
```

Notes:

- `Derived_MAP` can be derived from systolic/diastolic when map is not provided.
- Height is expected in meters, weight in kg.
