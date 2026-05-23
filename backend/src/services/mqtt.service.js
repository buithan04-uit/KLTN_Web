const mqtt = require('mqtt');
const HealthModel = require('../models/health.model');
const DeviceModel = require('../models/device.model');
const UserModel = require('../models/user.model');
const AiPredictionModel = require('../models/ai-prediction.model');
const aiService = require('../ai');
const {
    setConnected,
    setSubscribedTopic,
    markMessageSuccess,
    markMessageFailure,
} = require('./mqtt.runtime');

const DEFAULT_TOPIC = 'vitals/+/data';
const AI_MIN_INTERVAL_MS = Number(process.env.AI_MIN_INTERVAL_MS || 30_000);
const aiRuntime = {
    inFlightByDevice: new Set(),
    lastRunAtByDevice: new Map(),
    lastHealthTimeByDevice: new Map(),
};

const shouldSkipAi = (deviceId, healthTimeMs) => {
    if (aiRuntime.inFlightByDevice.has(deviceId)) return 'in_flight';
    const lastRunAt = aiRuntime.lastRunAtByDevice.get(deviceId);
    if (lastRunAt && Date.now() - lastRunAt < AI_MIN_INTERVAL_MS) return 'rate_limited';
    const lastHealthTime = aiRuntime.lastHealthTimeByDevice.get(deviceId);
    if (lastHealthTime && healthTimeMs <= lastHealthTime) return 'stale_health_record';
    return null;
};

const parseNumeric = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

const clampRange = (value, min, max) => {
    if (value === null) return null;
    if (value < min || value > max) return null;
    return value;
};

const deriveMap = (systolic, diastolic, explicitMap) => {
    if (explicitMap !== null) return explicitMap;
    if (systolic === null || diastolic === null) return null;
    return (systolic + 2 * diastolic) / 3;
};

const normalizeEcgPoints = (points) => {
    if (!Array.isArray(points)) return null;
    const normalized = points
        .map((v) => parseNumeric(v))
        .filter((v) => v !== null)
        .slice(0, 256);
    return normalized.length ? normalized : null;
};

const normalizePayload = (payload, deviceIdFromTopic) => {
    const payloadDeviceId = payload?.device_id ? String(payload.device_id) : null;
    if (deviceIdFromTopic && payloadDeviceId && deviceIdFromTopic !== payloadDeviceId) {
        return { error: `Mismatch device_id topic=${deviceIdFromTopic} payload=${payloadDeviceId}` };
    }

    const device_id = deviceIdFromTopic || payloadDeviceId;
    if (!device_id) {
        return { error: 'Missing device_id in topic and payload' };
    }

    const heart_rate = clampRange(parseNumeric(payload?.hr), 20, 250);
    const spo2 = clampRange(parseNumeric(payload?.spo2), 50, 100);
    const temperature = clampRange(parseNumeric(payload?.temp), 25, 45);
    const ecg_value = clampRange(parseNumeric(payload?.ecg), -5, 5);
    const systolic_bp = clampRange(parseNumeric(payload?.systolic_bp ?? payload?.systolic ?? payload?.sbp), 50, 260);
    const diastolic_bp = clampRange(parseNumeric(payload?.diastolic_bp ?? payload?.diastolic ?? payload?.dbp), 30, 180);
    const explicitMap = clampRange(parseNumeric(payload?.map ?? payload?.MAP), 40, 200);
    const map = clampRange(deriveMap(systolic_bp, diastolic_bp, explicitMap), 40, 200);
    const ecg_points = normalizeEcgPoints(payload?.ecg_points);
    const session_id = payload?.session_id ? String(payload.session_id) : null;
    const hasVitals = heart_rate !== null || spo2 !== null || temperature !== null
        || ecg_value !== null || ecg_points !== null || systolic_bp !== null
        || diastolic_bp !== null || map !== null;

    if (!hasVitals) {
        return { error: `No valid vitals fields for device ${device_id}` };
    }

    return {
        value: {
            device_id,
            heart_rate,
            spo2,
            temperature,
            ecg_value,
            ecg_points,
            systolic_bp,
            diastolic_bp,
            map,
            session_id,
        },
    };
};

const runAiForInsertedRecord = async ({ io, inserted, device }) => {
    try {
        if (!inserted || !device?.owner_id) return;

        const deviceId = inserted.device_id;
        const healthTimeMs = inserted.time ? new Date(inserted.time).getTime() : Date.now();
        const skipReason = shouldSkipAi(deviceId, healthTimeMs);
        if (skipReason) return;

        aiRuntime.inFlightByDevice.add(deviceId);
        aiRuntime.lastRunAtByDevice.set(deviceId, Date.now());

        const patientProfile = await UserModel.getProfile(device.owner_id);
        let healthRecordForAi = inserted;
        if (!Array.isArray(inserted.ecg_points) || inserted.ecg_points.length < 100) {
            const ecgPoints = await HealthModel.getRecentEcgPoints(inserted.device_id, 8);
            if (ecgPoints.length >= 100) {
                healthRecordForAi = {
                    ...inserted,
                    ecg_points: ecgPoints.slice(-256),
                };
            }
        }

        const predictions = await aiService.predictFromHealthRecord({
            healthRecord: healthRecordForAi,
            patientProfile,
        });

        const saved = [];
        for (const prediction of Object.values(predictions)) {
            if (!prediction || prediction.skipped) continue;
            const row = await AiPredictionModel.create({
                health_time: inserted.time,
                device_id: inserted.device_id,
                model_name: prediction.model_name,
                prediction_label: prediction.label,
                confidence: prediction.confidence,
                probabilities: prediction.probabilities,
                input_snapshot: prediction.input_snapshot,
            });
            if (row) saved.push(row);
        }

        const payload = {
            device_id: inserted.device_id,
            predictions,
            persisted_count: saved.length,
            disclaimer: aiService.AI_DISCLAIMER,
            ts: new Date().toISOString(),
        };

        io.to(`device:${inserted.device_id}`).emit('ai-predictions', payload);
        io.emit(`ai-predictions-${inserted.device_id}`, payload);
        aiRuntime.lastHealthTimeByDevice.set(deviceId, healthTimeMs);
    } catch (err) {
        console.warn(`AI inference skipped for ${inserted?.device_id || 'unknown'}: ${err.message}`);
    } finally {
        if (inserted?.device_id) {
            aiRuntime.inFlightByDevice.delete(inserted.device_id);
        }
    }
};

const initMQTT = (io) => {
    const brokerUrl = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
    const subscribeTopic = process.env.MQTT_SUBSCRIBE_TOPIC || DEFAULT_TOPIC;
    // mqtts:// → bật TLS (HiveMQ Cloud, VerneMQ, EMQX trên port 8883)
    const isTLS = brokerUrl.startsWith('mqtts://');

    const mqttClient = mqtt.connect(brokerUrl, {
        // Xác thực username / password — thiết lập bằng setup-mqtt-auth.ps1
        username: process.env.MQTT_USERNAME,
        password: process.env.MQTT_PASSWORD,
        // clientId duy nhất tránh xung đột khi backend restart
        clientId: `server_${Date.now().toString(16)}`,
        clean: true,
        reconnectPeriod: 5_000,   // tự kết nối lại sau 5s nếu mất kết nối
        connectTimeout: 10_000,
        ...(isTLS ? { rejectUnauthorized: true } : {}),
    });

    mqttClient.on('connect', () => {
        console.log('📡 MQTT: Đã kết nối Broker');
        setConnected(true);
        setSubscribedTopic(subscribeTopic);
        mqttClient.subscribe(subscribeTopic, (err) => {
            if (err) {
                markMessageFailure(`subscribe error: ${err.message}`);
                console.error('❌ MQTT subscribe error:', err.message);
            }
        });
    });

    mqttClient.on('error', (err) => {
        markMessageFailure(err.message);
        console.error('❌ MQTT error:', err.message);
    });

    mqttClient.on('reconnect', () => {
        console.log('🔄 MQTT: Đang kết nối lại broker...');
    });

    mqttClient.on('offline', () => {
        setConnected(false);
        console.warn('📴 MQTT: Mất kết nối với broker');
    });

    mqttClient.on('close', () => {
        setConnected(false);
    });

    mqttClient.on('message', async (topic, message) => {
        try {
            // Extract device_id from topic pattern: vitals/{deviceId}/data
            const topicParts = topic.split('/');
            const topicDeviceId = topicParts.length === 3 ? topicParts[1] : null;
            const payload = JSON.parse(message.toString());
            const normalized = normalizePayload(payload, topicDeviceId);

            if (normalized.error) {
                markMessageFailure(normalized.error);
                console.warn(`⚠️ MQTT: ${normalized.error}, topic=${topic}`);
                return;
            }

            const data = normalized.value;
            const device_id = data.device_id;

            // Kiểm tra thiết bị tồn tại và đang hoạt động trong DB
            // Ngăn chặn dữ liệu giả từ thiết bị chưa đăng ký
            const device = await DeviceModel.findById(device_id);
            if (!device) {
                console.warn(`⚠️ MQTT: Thiết bị ${device_id} chưa đăng ký, bỏ qua`);
                return;
            }
            if (!device.is_active) {
                console.warn(`⚠️ MQTT: Thiết bị ${device_id} đã bị vô hiệu hoá, bỏ qua`);
                return;
            }

            const inserted = await HealthModel.insert({
                device_id,
                heart_rate: data.heart_rate,
                spo2: data.spo2,
                temperature: data.temperature,
                ecg_value: data.ecg_value,
                ecg_points: data.ecg_points,
                systolic_bp: data.systolic_bp,
                diastolic_bp: data.diastolic_bp,
                map: data.map,
                session_id: data.session_id,
            });

            const realtimePayload = {
                device_id,
                hr: inserted?.heart_rate ?? null,
                spo2: inserted?.spo2 ?? null,
                temp: inserted?.temperature ?? null,
                ecg: inserted?.ecg_value ?? null,
                systolic_bp: inserted?.systolic_bp ?? null,
                diastolic_bp: inserted?.diastolic_bp ?? null,
                map: inserted?.map ?? null,
                session_id: inserted?.session_id || null,
                ts: inserted?.time ? new Date(inserted.time).toISOString() : new Date().toISOString(),
            };

            markMessageSuccess();

            // Cập nhật last_seen_at cho thiết bị
            await DeviceModel.updateLastSeen(device_id);

            // Thông báo thiết bị online cho tất cả listeners
            io.emit(`device-status-${device_id}`, { device_id, status: 'online' });
            io.to(`device:${device_id}`).emit('device-status', { device_id, status: 'online' });

            // New secured room channel (consent-gated socket subscription)
            io.to(`device:${device_id}`).emit('vitals', realtimePayload);

            // Backward-compatible channel for existing clients
            io.emit(`realtime-${device_id}`, realtimePayload);

            runAiForInsertedRecord({ io, inserted, device });
        } catch (err) {
            markMessageFailure(err.message);
            console.error('❌ Lỗi xử lý MQTT:', err.message);
        }
    });
};

module.exports = initMQTT;
