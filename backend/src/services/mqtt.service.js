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

const normalizeEcgPoints = (points, maxPoints = 256) => {
    if (!Array.isArray(points)) return null;
    const normalized = points
        .map((v) => parseNumeric(v))
        .filter((v) => v !== null)
        .slice(0, maxPoints);
    return normalized.length ? normalized : null;
};

const normalizeEcgFrame = (payload) => {
    if (payload?.type !== 'ecg_frame') return null;

    const mvPoints = normalizeEcgPoints(payload?.mv, 1000);
    const yPoints = normalizeEcgPoints(payload?.y, 1000);
    const points = mvPoints || yPoints;
    const expectedLength = Math.round(parseNumeric(payload?.n) || points?.length || 0);

    if (!points || !expectedLength || points.length !== expectedLength) {
        return {
            error: `Invalid ECG frame length for device ${payload?.device_id || 'unknown'}`,
        };
    }

    return {
        value: {
            points,
            lcd_points: yPoints,
            source: mvPoints ? 'mv' : 'y',
            mode: typeof payload?.mode === 'string' ? payload.mode : null,
            unit: mvPoints ? (payload?.unit || 'mV') : 'lcd_y',
            display: payload?.display || null,
            sampling_rate: parseNumeric(payload?.fs),
            n: expectedLength,
            seq: parseNumeric(payload?.seq),
            start_ms: parseNumeric(payload?.start_ms),
            min_mv: parseNumeric(payload?.min_mv ?? payload?.min),
            max_mv: parseNumeric(payload?.max_mv ?? payload?.max),
            p2p_mv: parseNumeric(payload?.p2p_mv ?? payload?.p2p),
            clip_pct: parseNumeric(payload?.clip_pct ?? payload?.clip ?? payload?.clip_percent),
            hr_ecg: parseNumeric(payload?.hr_ecg),
            hr_ppg: parseNumeric(payload?.hr_ppg),
            hr_source: typeof payload?.hr_source === 'string' ? payload.hr_source : null,
        },
    };
};

const normalizeEcgAiWindow = (payload) => {
    const hasWindow = Array.isArray(payload?.window);
    if (payload?.type !== 'ecg_ai_window' && payload?.mode !== 'ecg_ai' && !hasWindow) return null;

    const windowPoints = normalizeEcgPoints(payload?.window);
    const expectedLength = Math.round(parseNumeric(payload?.n) || windowPoints?.length || 0);
    const rPeakIndex = parseNumeric(payload?.r_peak_index);
    const samplingRate = parseNumeric(payload?.fs);

    if (!windowPoints || !expectedLength || windowPoints.length !== expectedLength) {
        return {
            error: `Invalid ECG AI window length for device ${payload?.device_id || 'unknown'}`,
        };
    }

    return {
        value: {
            points: windowPoints,
            normalized: payload?.normalized === true,
            r_peak_index: rPeakIndex,
            sampling_rate: samplingRate,
            mean: parseNumeric(payload?.mean),
            std: parseNumeric(payload?.std),
            beat: parseNumeric(payload?.beat),
        },
    };
};

const summarizePoints = (points) => {
    if (!Array.isArray(points) || points.length === 0) {
        return { min: null, max: null };
    }
    return {
        min: Math.min(...points),
        max: Math.max(...points),
    };
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

    const heart_rate = clampRange(parseNumeric(payload?.hr ?? payload?.heart_rate ?? payload?.bpm), 20, 250);
    const spo2 = clampRange(parseNumeric(payload?.spo2 ?? payload?.SpO2), 50, 100);
    const temperature = clampRange(parseNumeric(payload?.temp ?? payload?.temperature ?? payload?.body_temp), 25, 45);
    const ecg_value = parseNumeric(payload?.ecg ?? payload?.ecg_value);
    const systolic_bp = clampRange(parseNumeric(payload?.systolic_bp ?? payload?.systolic ?? payload?.sbp), 50, 260);
    const diastolic_bp = clampRange(parseNumeric(payload?.diastolic_bp ?? payload?.diastolic ?? payload?.dbp), 30, 180);
    const explicitMap = clampRange(parseNumeric(payload?.map ?? payload?.MAP), 40, 200);
    const map = clampRange(deriveMap(systolic_bp, diastolic_bp, explicitMap), 40, 200);
    const ecgFrame = normalizeEcgFrame(payload);
    if (ecgFrame?.error) return { error: ecgFrame.error };
    const ecgAiWindow = normalizeEcgAiWindow(payload);
    if (ecgAiWindow?.error) return { error: ecgAiWindow.error };
    const ecg_points = ecgFrame?.value?.points || ecgAiWindow?.value?.points || normalizeEcgPoints(payload?.ecg_points);
    const session_id = payload?.session_id ? String(payload.session_id) : null;
    const hasVitals = heart_rate !== null || spo2 !== null || temperature !== null
        || ecg_value !== null || ecg_points !== null || systolic_bp !== null
        || diastolic_bp !== null || map !== null;

    if (!hasVitals) {
        const keys = payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 16).join(',') : '';
        return {
            error: `No valid vitals fields for device ${device_id} (type=${payload?.type || '-'}, mode=${payload?.mode || '-'}, window_len=${Array.isArray(payload?.window) ? payload.window.length : 0}, keys=${keys})`,
        };
    }

    return {
        value: {
            device_id,
            payload_type: typeof payload?.type === 'string' ? payload.type : null,
            heart_rate,
            spo2,
            temperature,
            ecg_value,
            ecg_points,
            note: ecgFrame?.value ? 'ecg_frame' : ecgAiWindow?.value?.normalized ? 'ecg_ai_window_normalized' : null,
            ecg_frame: ecgFrame?.value || null,
            ecg_ai_window: ecgAiWindow?.value || null,
            systolic_bp,
            diastolic_bp,
            map,
            session_id,
        },
    };
};

const shouldRunAiForPayload = (data) => {
    if (data?.ecg_ai_window) return true;
    if (data?.ecg_frame) return false;
    if (data?.payload_type === 'ecg_sample') return false;
    return data?.heart_rate !== null
        || data?.spo2 !== null
        || data?.temperature !== null
        || data?.systolic_bp !== null
        || data?.diastolic_bp !== null
        || data?.map !== null;
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
        if (!healthRecordForAi.ecg_ai_window && (!Array.isArray(inserted.ecg_points) || inserted.ecg_points.length < 100)) {
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
                note: data.note,
                systolic_bp: data.systolic_bp,
                diastolic_bp: data.diastolic_bp,
                map: data.map,
                session_id: data.session_id,
            });

            if (data.ecg_ai_window) {
                const { min, max } = summarizePoints(data.ecg_ai_window.points);
                console.log(
                    `[MQTT][ecg_ai_window] device=${device_id} n=${data.ecg_ai_window.points.length} `
                    + `fs=${data.ecg_ai_window.sampling_rate ?? '-'} r=${data.ecg_ai_window.r_peak_index ?? '-'} `
                    + `normalized=${data.ecg_ai_window.normalized} min=${min?.toFixed?.(3) ?? '-'} max=${max?.toFixed?.(3) ?? '-'}`
                );
            }
            if (data.ecg_frame) {
                const { min, max } = summarizePoints(data.ecg_frame.points);
                console.log(
                    `[MQTT][ecg_frame] device=${device_id} n=${data.ecg_frame.points.length} `
                    + `fs=${data.ecg_frame.sampling_rate ?? '-'} source=${data.ecg_frame.source} `
                    + `lcd=${data.ecg_frame.lcd_points?.length ?? 0} `
                    + `clip=${data.ecg_frame.clip_pct ?? '-'}% p2p=${data.ecg_frame.p2p_mv ?? '-'} `
                    + `hr=${data.heart_rate ?? '-'} range=${min?.toFixed?.(1) ?? '-'}..${max?.toFixed?.(1) ?? '-'}`
                );
            }

            const realtimePayload = {
                device_id,
                hr: inserted?.heart_rate ?? null,
                spo2: inserted?.spo2 ?? null,
                temp: inserted?.temperature ?? null,
                ecg: inserted?.ecg_value ?? null,
                ecg_points: data.ecg_points,
                ecg_lcd_points: data.ecg_frame?.lcd_points ?? null,
                type: data.ecg_frame ? 'ecg_frame' : data.ecg_ai_window ? 'ecg_ai_window' : data.payload_type || undefined,
                mode: data.ecg_frame?.mode ?? (data.ecg_ai_window ? 'ecg_ai' : undefined),
                fs: data.ecg_frame?.sampling_rate ?? data.ecg_ai_window?.sampling_rate ?? null,
                n: data.ecg_frame?.points?.length ?? data.ecg_ai_window?.points?.length ?? null,
                r_peak_index: data.ecg_ai_window?.r_peak_index ?? null,
                normalized: data.ecg_ai_window?.normalized ?? null,
                ecg_unit: data.ecg_frame?.unit ?? null,
                ecg_source: data.ecg_frame?.source ?? null,
                ecg_display: data.ecg_frame?.display ?? null,
                ecg_seq: data.ecg_frame?.seq ?? null,
                ecg_start_ms: data.ecg_frame?.start_ms ?? null,
                min_mv: data.ecg_frame?.min_mv ?? null,
                max_mv: data.ecg_frame?.max_mv ?? null,
                p2p_mv: data.ecg_frame?.p2p_mv ?? null,
                clip_pct: data.ecg_frame?.clip_pct ?? null,
                hr_ecg: data.ecg_frame?.hr_ecg ?? null,
                hr_ppg: data.ecg_frame?.hr_ppg ?? null,
                hr_source: data.ecg_frame?.hr_source ?? null,
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

            if (shouldRunAiForPayload(data)) {
                runAiForInsertedRecord({
                    io,
                    inserted: data.ecg_ai_window
                        ? {
                            ...inserted,
                            ecg_ai_window: data.ecg_ai_window,
                            ecg_sampling_rate: data.ecg_ai_window.sampling_rate,
                        }
                        : inserted,
                    device,
                });
            }
        } catch (err) {
            markMessageFailure(err.message);
            console.error('❌ Lỗi xử lý MQTT:', err.message);
        }
    });
};

module.exports = initMQTT;
