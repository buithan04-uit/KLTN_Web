const mqtt = require('mqtt');
const HealthModel = require('../models/health.model');
const DeviceModel = require('../models/device.model');
const {
    setConnected,
    setSubscribedTopic,
    markMessageSuccess,
    markMessageFailure,
} = require('./mqtt.runtime');

const DEFAULT_TOPIC = 'vitals/+/data';

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
    const ecg_points = normalizeEcgPoints(payload?.ecg_points);
    const session_id = payload?.session_id ? String(payload.session_id) : null;
    const hasVitals = heart_rate !== null || spo2 !== null || temperature !== null || ecg_value !== null || ecg_points !== null;

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
            session_id,
        },
    };
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
                session_id: data.session_id,
            });

            const realtimePayload = {
                device_id,
                hr: inserted?.heart_rate ?? null,
                spo2: inserted?.spo2 ?? null,
                temp: inserted?.temperature ?? null,
                ecg: inserted?.ecg_value ?? null,
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
        } catch (err) {
            markMessageFailure(err.message);
            console.error('❌ Lỗi xử lý MQTT:', err.message);
        }
    });
};

module.exports = initMQTT;