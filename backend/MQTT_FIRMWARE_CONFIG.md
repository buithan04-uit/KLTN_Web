# MQTT Firmware Configuration Standard

This document defines the recommended MQTT configuration and payload contract for firmware devices publishing to VitalCare backend.

## 1. Broker and credentials

Use these fields from firmware web config:

- host: LAN IP of the machine running Mosquitto (example: 192.168.1.20)
- port: 1883
- username: device
- password: device password created by setup script
- topic: vitals/{DEVICE_ID}/data

Important:

- Do not use localhost from ESP32.
- DEVICE_ID must match an active device_id in database table devices.
- Backend account is server and must be configured only in backend env.

## 2. Topic contract

Publish only to:

vitals/{DEVICE_ID}/data

Backend subscribes using wildcard:

vitals/+/data

## 3. Payload contract

All fields are optional except device identity via topic or payload. Backend accepts partial payloads.

Preferred payload:

```json
{
  "device_id": "DEV_01",
  "hr": 78,
  "spo2": 97.4,
  "temp": 36.8,
  "ecg": 0.123,
  "ecg_points": [0.11, 0.12, 0.1, 0.13],
  "session_id": null,
  "ts": "2026-04-17T09:30:00Z"
}
```

### Single-sensor modes

Only MLX90614:

```json
{ "device_id": "DEV_01", "temp": 36.8, "ts": "2026-04-17T09:30:00Z" }
```

Only MAX30102:

```json
{ "device_id": "DEV_01", "hr": 78, "spo2": 97.4, "ts": "2026-04-17T09:30:00Z" }
```

Only ECG:

```json
{
  "device_id": "DEV_01",
  "ecg": 0.123,
  "ecg_points": [0.11, 0.12, 0.1],
  "ts": "2026-04-17T09:30:00Z"
}
```

## 4. Parallel MLX90614 + MAX30102 strategy

Recommended architecture:

- run each sensor in its own sampling task
- keep latest values in shared snapshot state
- publish one merged packet every 500-1000 ms
- for stale sensor values, either omit field or send null after timeout

Recommended intervals:

- MAX30102 processing: 100-250 ms internal updates, publish merged output at 500-1000 ms
- MLX90614 sampling: 250-1000 ms
- ECG points batch: 16-64 samples per publish

## 5. Backend validation behavior

Backend currently validates and normalizes incoming values before DB insert:

- hr accepted range: 20..250
- spo2 accepted range: 50..100
- temp accepted range: 25..45
- ecg accepted range: -5..5
- ecg_points: numeric array, max 256 points per message

Payload with no valid vital fields is rejected.

## 6. Security minimum

- avoid shared password across all production devices
- do not expose port 1883 publicly to Internet
- rotate default credentials immediately
- for Internet deployments, use mqtts on 8883 with TLS

## 7. Quick connectivity test

From host machine:

```bash
mosquitto_pub -h localhost -p 1883 -u device -P "<DEVICE_PASSWORD>" -t vitals/DEV_01/data -m '{"device_id":"DEV_01","hr":80,"spo2":98,"temp":36.8}'
```

Then verify:

- backend logs show message processed
- health_data table gets new row
- realtime dashboard updates

## 8. Firmware publish pattern (ESP32)

Use this sequence in firmware code:

1. Load MQTT config from web settings (host, port, user, pass, device_id).
2. Build topic once: vitals/{device_id}/data.
3. Connect MQTT with random client_id and clean session true.
4. Reconnect with exponential backoff when disconnected.
5. Publish merged snapshot every 500-1000 ms.

Reference skeleton (PubSubClient style):

```cpp
String topic = "vitals/" + deviceId + "/data";

bool mqttConnect() {
  String clientId = "esp32-" + deviceId + "-" + String((uint32_t)esp_random(), HEX);
  return mqttClient.connect(clientId.c_str(), mqttUser.c_str(), mqttPass.c_str());
}

void publishSnapshot(float hr, float spo2, float temp, float ecg, const String& tsIso) {
  StaticJsonDocument<512> doc;
  doc["device_id"] = deviceId;
  if (!isnan(hr)) doc["hr"] = hr;
  if (!isnan(spo2)) doc["spo2"] = spo2;
  if (!isnan(temp)) doc["temp"] = temp;
  if (!isnan(ecg)) doc["ecg"] = ecg;
  doc["ts"] = tsIso;

  char payload[512];
  size_t n = serializeJson(doc, payload, sizeof(payload));
  mqttClient.publish(topic.c_str(), payload, n);
}
```

For ECG points batch:

- add ecg_points as numeric array
- cap points per packet at 256
- keep packet size under broker limits (recommended under 4 KB)
