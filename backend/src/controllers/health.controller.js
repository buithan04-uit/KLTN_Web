const HealthModel = require('../models/health.model');
const DeviceModel = require('../models/device.model');

const calcRiskScore = ({ latest, stats }) => {
    if (!latest && !stats) return 0;

    let score = 1;

    const hr = latest?.heart_rate ?? stats?.avg_heart_rate;
    const spo2 = latest?.spo2 ?? stats?.min_spo2;
    const temp = latest?.temperature ?? stats?.max_temperature;
    const abnormalCount = Number(stats?.abnormal_count || 0);

    if (hr !== null && hr !== undefined) {
        if (hr < 50 || hr > 130) score += 3;
        else if (hr < 60 || hr > 110) score += 2;
    }

    if (spo2 !== null && spo2 !== undefined) {
        if (spo2 < 90) score += 3;
        else if (spo2 < 94) score += 2;
    }

    if (temp !== null && temp !== undefined) {
        if (temp >= 39) score += 3;
        else if (temp >= 38) score += 2;
    }

    if (abnormalCount >= 5) score += 2;
    else if (abnormalCount >= 2) score += 1;

    return Math.max(1, Math.min(10, score));
};

const classifyRhythm = (heartRate) => {
    if (heartRate === null || heartRate === undefined) return 'Unknown';
    if (heartRate < 50) return 'Bradycardia';
    if (heartRate > 120) return 'Tachycardia';
    return 'Normal Sinus';
};

const getDoctorConsentSince = (req) => {
    if (req.user?.role !== 'doctor') return null;
    return req.consentSession?.issued_at || null;
};

const getHistory = async (req, res) => {
    try {
        // Bệnh nhân chỉ được xem lịch sử thiết bị của chính mình
        if (req.user.role === 'patient') {
            const device = await DeviceModel.findById(req.params.deviceId);
            if (!device || device.owner_id !== req.user.id) {
                return res.status(403).json({ error: 'Không có quyền xem dữ liệu thiết bị này' });
            }
        }
        const limit = parseInt(req.query.limit) || 50;
        const since = getDoctorConsentSince(req);
        const rows = await HealthModel.getHistory(req.params.deviceId, limit, since);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const getBySession = async (req, res) => {
    try {
        // Bệnh nhân chỉ được xem session của chính mình
        if (req.user.role === 'patient') {
            const rows = await HealthModel.getBySession(req.params.sessionId);
            const first = rows[0];
            if (first) {
                const device = await DeviceModel.findById(first.device_id);
                if (!device || device.owner_id !== req.user.id) {
                    return res.status(403).json({ error: 'Không có quyền xem phiên đo này' });
                }
            }
            return res.json(rows);
        }
        const rows = await HealthModel.getBySession(req.params.sessionId);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const getAbnormal = async (req, res) => {
    try {
        const since = getDoctorConsentSince(req);
        const rows = await HealthModel.getAbnormal(req.params.deviceId, since);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const getTrends = async (req, res) => {
    try {
        // Bệnh nhân chỉ được xem xu hướng thiết bị của chính mình
        if (req.user.role === 'patient') {
            const device = await DeviceModel.findById(req.params.deviceId);
            if (!device || device.owner_id !== req.user.id) {
                return res.status(403).json({ error: 'Không có quyền xem dữ liệu thiết bị này' });
            }
        }
        const hours = parseInt(req.query.hours, 10) || 24;
        const bucketMinutes = parseInt(req.query.bucket_minutes, 10) || 15;
        const since = getDoctorConsentSince(req);
        const rows = await HealthModel.getTrends(req.params.deviceId, hours, bucketMinutes, since);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const getClinicalSummary = async (req, res) => {
    try {
        const hours = parseInt(req.query.hours, 10) || 24;
        const since = getDoctorConsentSince(req);
        const data = await HealthModel.getClinicalSummary(req.params.deviceId, hours, since);

        const risk_score = calcRiskScore(data);
        const rhythm = classifyRhythm(data.latest?.heart_rate);

        let clinical_alert = 'Theo dõi định kỳ';
        if (risk_score >= 8) clinical_alert = 'Nguy cơ cao - cần kiểm tra ngay';
        else if (risk_score >= 5) clinical_alert = 'Nguy cơ trung bình - cần theo dõi sát';

        res.json({
            device_id: req.params.deviceId,
            latest: data.latest,
            stats: data.stats,
            ai_summary: {
                rhythm,
                risk_score,
                clinical_alert,
            },
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = { getHistory, getBySession, getAbnormal, getTrends, getClinicalSummary };
