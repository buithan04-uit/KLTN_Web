const aiService = require('../ai');
const AiPredictionModel = require('../models/ai-prediction.model');
const DeviceModel = require('../models/device.model');
const HealthModel = require('../models/health.model');
const UserModel = require('../models/user.model');

const canAccessDevice = async (req, deviceId) => {
    const device = await DeviceModel.findById(deviceId);
    if (!device) {
        return { ok: false, status: 404, error: 'Khong tim thay thiet bi' };
    }

    if (req.user.role === 'admin') {
        return { ok: true, device };
    }

    if (req.user.role === 'patient') {
        if (Number(device.owner_id) === Number(req.user.id)) {
            return { ok: true, device };
        }
        return { ok: false, status: 403, error: 'Ban khong co quyen xem chan doan AI cua thiet bi nay' };
    }

    if (req.user.role !== 'doctor') {
        return { ok: false, status: 403, error: 'Khong co quyen truy cap chan doan AI' };
    }

    return { ok: true, device };
};

const normalizeLabel = (value) => String(value || '').trim();

const getPredictionStatus = (modelName, label) => {
    const normalized = normalizeLabel(label);
    const lower = normalized.toLowerCase();

    if (!normalized) return 'unknown';

    if (modelName === 'vitals-risk') {
        if (lower.includes('high') || lower.includes('danger') || lower.includes('risk cao')) return 'danger';
        if (lower.includes('medium') || lower.includes('moderate') || lower.includes('risk trung')) return 'warning';
        if (lower.includes('low') || lower.includes('normal')) return 'normal';
        return 'warning';
    }

    if (modelName === 'ecg-arrhythmia') {
        if (normalized === 'N' || lower.includes('normal')) return 'normal';
        if (['V', 'F'].includes(normalized)) return 'danger';
        if (['S', 'Q'].includes(normalized)) return 'warning';
        return 'warning';
    }

    return 'unknown';
};

const statusWeight = {
    unknown: 0,
    normal: 1,
    warning: 2,
    danger: 3,
};

const pickHigherStatus = (current, next) => (
    (statusWeight[next] || 0) > (statusWeight[current] || 0) ? next : current
);

const statusFromDistribution = ({ danger = 0, warning = 0, total = 0 }) => {
    if (!total) {
        return {
            status: 'unknown',
            reason: 'Chua co ket qua du doan hop le trong cua so du lieu',
        };
    }

    const dangerRatio = danger / total;
    const abnormalRatio = (danger + warning) / total;

    if (danger >= 3 || dangerRatio >= 0.35) {
        return {
            status: 'danger',
            reason: `${danger}/${total} ket qua gan day o muc can chu y cao`,
        };
    }

    if (danger >= 1 || abnormalRatio >= 0.3) {
        return {
            status: 'warning',
            reason: `${danger + warning}/${total} ket qua gan day co dau hieu can theo doi`,
        };
    }

    return {
        status: 'normal',
        reason: `Da so ${total} ket qua gan day trong nguong on dinh`,
    };
};

const buildAiSummary = (predictions, limit) => {
    const rows = Array.isArray(predictions) ? predictions : [];
    const models = {};

    for (const row of rows) {
        const modelName = row.model_name || 'unknown';
        if (!models[modelName]) {
            models[modelName] = {
                latest: row,
                status: 'unknown',
                status_reason: '',
                counts: {},
                status_counts: { normal: 0, warning: 0, danger: 0, unknown: 0 },
                sample_count: 0,
            };
        }

        const model = models[modelName];
        const label = normalizeLabel(row.prediction_label) || 'Unknown';
        const status = getPredictionStatus(modelName, label);
        model.counts[label] = (model.counts[label] || 0) + 1;
        model.status_counts[status] = (model.status_counts[status] || 0) + 1;
        model.sample_count += 1;
    }

    let overall_status = rows.length ? 'normal' : 'unknown';
    const overallCounts = { normal: 0, warning: 0, danger: 0, unknown: 0 };

    for (const model of Object.values(models)) {
        const distribution = statusFromDistribution({
            danger: model.status_counts.danger,
            warning: model.status_counts.warning,
            total: model.sample_count,
        });
        model.status = distribution.status;
        model.status_reason = distribution.reason;
        overall_status = pickHigherStatus(overall_status, model.status);

        for (const [status, count] of Object.entries(model.status_counts)) {
            overallCounts[status] = (overallCounts[status] || 0) + count;
        }
    }

    const times = rows
        .map((row) => row.health_time || row.created_at)
        .filter(Boolean)
        .sort();

    const headlineByStatus = {
        danger: 'Can chu y: AI phat hien dau hieu bat thuong trong cua so du lieu gan day',
        warning: 'Theo doi them: AI ghi nhan mot so dau hieu can bac si xem xet',
        normal: 'On dinh: AI chua ghi nhan dau hieu bat thuong ro trong cua so du lieu gan day',
        unknown: 'Chua du du lieu de tong hop chan doan AI',
    };

    const summaryByStatus = {
        danger: 'Ket qua nay duoc tong hop tu nhieu phien du lieu gan day, khong phai canh bao tuc thoi tung mau.',
        warning: 'Nen doi chieu voi trieu chung, tien su benh va du lieu do thuc te truoc khi dua ra ket luan.',
        normal: 'Tiep tuc theo doi dinh ky; ket qua AI chi co gia tri tham khao.',
        unknown: 'Can them du lieu sinh hieu/ECG hop le de AI co the danh gia.',
    };

    return {
        overall_status,
        headline: headlineByStatus[overall_status],
        summary: summaryByStatus[overall_status],
        status_reason: statusFromDistribution({
            danger: overallCounts.danger,
            warning: overallCounts.warning,
            total: rows.length,
        }).reason,
        window: {
            limit,
            sample_count: rows.length,
            from: times[0] || null,
            to: times[times.length - 1] || null,
        },
        models,
    };
};

const getStatus = async (req, res) => {
    return res.json(aiService.getStatus());
};

const predictLatest = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const access = await canAccessDevice(req, deviceId);
        if (!access.ok) {
            return res.status(access.status).json({ error: access.error });
        }

        const rows = await HealthModel.getHistory(deviceId, 1, req.user.role === 'doctor' ? req.consentSession?.issued_at : null);
        const latest = rows[0] || null;
        if (!latest) {
            return res.status(404).json({ error: 'Chua co du lieu suc khoe cho thiet bi nay' });
        }

        let healthRecordForAi = latest;
        if (!Array.isArray(latest.ecg_points) || latest.ecg_points.length < 100) {
            const ecgPoints = await HealthModel.getRecentEcgPoints(deviceId, 8);
            if (ecgPoints.length >= 100) {
                healthRecordForAi = {
                    ...latest,
                    ecg_points: ecgPoints.slice(-256),
                };
            }
        }

        const patientProfile = access.device.owner_id
            ? await UserModel.getProfile(access.device.owner_id)
            : null;

        const predictions = await aiService.predictFromHealthRecord({
            healthRecord: healthRecordForAi,
            patientProfile,
        });

        const persisted = [];
        for (const prediction of Object.values(predictions)) {
            if (!prediction || prediction.skipped) continue;
            const saved = await AiPredictionModel.create({
                health_time: latest.time,
                device_id: latest.device_id,
                model_name: prediction.model_name,
                prediction_label: prediction.label,
                confidence: prediction.confidence,
                probabilities: prediction.probabilities,
                input_snapshot: prediction.input_snapshot,
            });
            if (saved) persisted.push(saved);
        }

        return res.json({
            device_id: deviceId,
            latest,
            predictions,
            persisted_count: persisted.length,
            disclaimer: aiService.AI_DISCLAIMER,
        });
    } catch (err) {
        console.error('predictLatest AI error:', err.message);
        return res.status(500).json({ error: 'Loi server' });
    }
};

const listPredictions = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const access = await canAccessDevice(req, deviceId);
        if (!access.ok) {
            return res.status(access.status).json({ error: access.error });
        }

        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const model_name = String(req.query.model_name || '').trim();
        const data = await AiPredictionModel.listByDevice(deviceId, {
            page,
            limit,
            model_name,
            requireEvidence: req.user.role === 'doctor',
        });
        return res.json({
            ...data,
            disclaimer: aiService.AI_DISCLAIMER,
        });
    } catch (err) {
        console.error('listPredictions AI error:', err.message);
        return res.status(500).json({ error: 'Loi server' });
    }
};

const getSummary = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const access = await canAccessDevice(req, deviceId);
        if (!access.ok) {
            return res.status(access.status).json({ error: access.error });
        }

        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
        const data = await AiPredictionModel.listByDevice(deviceId, {
            page: 1,
            limit,
            requireEvidence: req.user.role === 'doctor',
        });
        const summary = buildAiSummary(data.data, limit);

        return res.json({
            device_id: deviceId,
            ...summary,
            disclaimer: aiService.AI_DISCLAIMER,
        });
    } catch (err) {
        console.error('getSummary AI error:', err.message);
        return res.status(500).json({ error: 'Loi server' });
    }
};

module.exports = {
    getStatus,
    predictLatest,
    listPredictions,
    getSummary,
};
