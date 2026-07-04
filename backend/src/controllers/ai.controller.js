const aiService = require('../ai');
const AiPredictionModel = require('../models/ai-prediction.model');
const DeviceModel = require('../models/device.model');
const HealthModel = require('../models/health.model');
const UserModel = require('../models/user.model');

const canAccessDevice = async (req, deviceId) => {
    const device = await DeviceModel.findById(deviceId);
    if (!device) {
        return { ok: false, status: 404, error: 'Không tìm thấy thiết bị' };
    }

    if (req.user.role === 'admin') {
        return { ok: true, device };
    }

    if (req.user.role === 'patient') {
        if (Number(device.owner_id) === Number(req.user.id)) {
            return { ok: true, device };
        }
        return { ok: false, status: 403, error: 'Bạn không có quyền xem chẩn đoán AI của thiết bị này' };
    }

    if (req.user.role !== 'doctor') {
        return { ok: false, status: 403, error: 'Không có quyền truy cập chẩn đoán AI' };
    }

    return { ok: true, device };
};

const normalizeLabel = (value) => String(value || '').trim();

const getPredictionStatus = (modelName, label, confidence = null) => {
    const normalized = normalizeLabel(label);
    const lower = normalized.toLowerCase();
    // Number(null) === 0, which is finite — must check typeof first or a missing
    // confidence (the normal case for rule-based-only results) gets treated as
    // "confidence exactly 0" instead of "unknown", silently downgrading severity below.
    const hasConfidence = typeof confidence === 'number' && Number.isFinite(confidence);
    const conf = confidence;

    if (!normalized) return 'unknown';

    if (modelName === 'vitals-risk' || modelName === 'vitals-risk-assessment') {
        if (lower.includes('high') || lower.includes('danger') || lower.includes('risk cao')) {
            return !hasConfidence || conf >= 0.75 ? 'danger' : 'warning';
        }
        if (lower.includes('medium') || lower.includes('moderate') || lower.includes('risk trung')) return 'warning';
        if (lower.includes('low') || lower.includes('normal')) return 'normal';
        return 'warning';
    }

    if (modelName === 'ecg-arrhythmia') {
        if (lower.includes('uncertain') || lower.includes('low_confidence')) return 'unknown';
        if (lower.includes('possible')) return 'warning';
        if (normalized === 'N' || lower.includes('normal')) return 'normal';
        if (['V', 'F'].includes(normalized)) {
            if (hasConfidence && conf < 0.6) return 'unknown';
            return !hasConfidence || conf >= 0.8 ? 'danger' : 'warning';
        }
        if (['S', 'Q'].includes(normalized)) return hasConfidence && conf < 0.6 ? 'unknown' : 'warning';
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
            reason: 'Chưa có kết quả dự đoán hợp lệ trong cửa sổ dữ liệu',
        };
    }

    const dangerRatio = danger / total;
    const abnormalRatio = (danger + warning) / total;

    if (danger >= 3 || dangerRatio >= 0.35) {
        return {
            status: 'danger',
            reason: `${danger}/${total} kết quả gần đây ở mức cần chú ý cao`,
        };
    }

    if (danger >= 1 || abnormalRatio >= 0.3) {
        return {
            status: 'warning',
            reason: `${danger + warning}/${total} kết quả gần đây có dấu hiệu cần theo dõi`,
        };
    }

    return {
        status: 'normal',
        reason: `Đa số ${total} kết quả gần đây trong ngưỡng ổn định`,
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
        const status = getPredictionStatus(modelName, label, row.confidence);
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

    const riskHeadlineByStatus = {
        danger: 'Cần chú ý: AI ghi nhận nguy cơ sinh hiệu cao trong cửa sổ dữ liệu gần đây',
        warning: 'Theo dõi thêm: AI ghi nhận một số dấu hiệu sinh hiệu cần đối chiếu',
        normal: 'Ổn định: AI chưa ghi nhận nguy cơ sinh hiệu rõ trong cửa sổ dữ liệu gần đây',
        unknown: 'Chưa đủ dữ liệu để tổng hợp đánh giá nguy cơ AI',
    };

    const riskSummaryByStatus = {
        danger: 'Kết quả được tổng hợp từ rule-based score và mô hình khi đủ dữ liệu; không phải cảnh báo chẩn đoán tức thời.',
        warning: 'Cần đối chiếu với triệu chứng, tiền sử bệnh, tình trạng cảm biến và dữ liệu đo thực tế.',
        normal: 'Tiếp tục theo dõi định kỳ; kết quả AI chỉ có giá trị hỗ trợ theo dõi.',
        unknown: 'Cần thêm dữ liệu sinh hiệu hợp lệ để AI có thể đánh giá nguy cơ.',
    };

    return {
        overall_status,
        headline: riskHeadlineByStatus[overall_status],
        summary: riskSummaryByStatus[overall_status],
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
            return res.status(404).json({ error: 'Chưa có dữ liệu sức khỏe cho thiết bị này' });
        }

        const patientProfile = access.device.owner_id
            ? await UserModel.getProfile(access.device.owner_id)
            : null;

        const predictions = await aiService.predictFromHealthRecord({
            healthRecord: latest,
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
        return res.status(500).json({ error: 'Lỗi server' });
    }
};

const recordManualBloodPressure = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const access = await canAccessDevice(req, deviceId);
        if (!access.ok) {
            return res.status(access.status).json({ error: access.error });
        }

        const systolic = Number(req.body?.systolic_bp ?? req.body?.systolic);
        const diastolic = Number(req.body?.diastolic_bp ?? req.body?.diastolic);

        if (!Number.isFinite(systolic) || systolic < 50 || systolic > 260) {
            return res.status(400).json({ error: 'Huyết áp tâm thu phải nằm trong khoảng 50-260 mmHg' });
        }
        if (!Number.isFinite(diastolic) || diastolic < 30 || diastolic > 180) {
            return res.status(400).json({ error: 'Huyết áp tâm trương phải nằm trong khoảng 30-180 mmHg' });
        }
        if (diastolic >= systolic) {
            return res.status(400).json({ error: 'Huyết áp tâm trương phải nhỏ hơn huyết áp tâm thu' });
        }

        const map = (systolic + 2 * diastolic) / 3;
        const inserted = await HealthModel.attachManualBloodPressureToLatest({
            device_id: deviceId,
            systolic_bp: systolic,
            diastolic_bp: diastolic,
            map,
        });

        return res.status(201).json({
            data: inserted,
            source: 'manual_input',
            message: 'Đã lưu huyết áp nhập ngoài cho thiết bị',
            disclaimer: aiService.AI_DISCLAIMER,
        });
    } catch (err) {
        console.error('recordManualBloodPressure AI error:', err.message);
        return res.status(500).json({ error: 'Lỗi server' });
    }
};

const parseDateParam = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

// Status (danger/warning/normal/unknown) is derived from label+confidence, not a DB column,
// so it can't be pushed into the SQL WHERE clause without duplicating getPredictionStatus's
// logic there too. Instead, when a status filter is requested, pull a bounded recent window
// (STATUS_FILTER_SCAN_LIMIT rows matching device/model/date) and filter+paginate in JS. This
// is correct for any realistic per-device history size in this project but is not an
// all-time-accurate count if a single device ever exceeds the scan limit.
const STATUS_FILTER_SCAN_LIMIT = 300;

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
        const from = parseDateParam(req.query.from);
        const to = parseDateParam(req.query.to);
        const status = String(req.query.status || '').trim().toLowerCase();
        const requireEvidence = req.user.role === 'doctor';

        if (!status) {
            const data = await AiPredictionModel.listByDevice(deviceId, {
                page,
                limit,
                model_name,
                from,
                to,
                requireEvidence,
            });
            return res.json({
                ...data,
                disclaimer: aiService.AI_DISCLAIMER,
            });
        }

        const scanned = await AiPredictionModel.listByDevice(deviceId, {
            page: 1,
            limit: STATUS_FILTER_SCAN_LIMIT,
            model_name,
            from,
            to,
            requireEvidence,
        });
        const matching = scanned.data.filter(
            (row) => getPredictionStatus(row.model_name, row.prediction_label, row.confidence) === status
        );
        const total = matching.length;
        const pages = Math.max(1, Math.ceil(total / limit));
        const offset = (Math.max(page, 1) - 1) * limit;

        return res.json({
            data: matching.slice(offset, offset + limit),
            pagination: { page, limit, total, pages },
            disclaimer: aiService.AI_DISCLAIMER,
        });
    } catch (err) {
        console.error('listPredictions AI error:', err.message);
        return res.status(500).json({ error: 'Lỗi server' });
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
        return res.status(500).json({ error: 'Lỗi server' });
    }
};

module.exports = {
    getStatus,
    predictLatest,
    recordManualBloodPressure,
    listPredictions,
    getSummary,
};
