# ECG Arrhythmia Model

Copy the exported TensorFlow.js ECG model files here.

Expected files:

```text
model.json
group*.bin
metadata.json
```

The current training notebook expects an ECG window with shape `(100, 1)`.

The backend can aggregate recent packets to reach 100 points when a single MQTT payload has fewer samples.
