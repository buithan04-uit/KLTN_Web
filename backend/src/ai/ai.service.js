const vitalsAiService = require('./vitals-ai.service');
const ecgAiService = require('./ecg-ai.service');

const AI_DISCLAIMER = 'Kết quả AI chỉ hỗ trợ theo dõi và đánh giá nguy cơ sinh hiệu, không thay thế chẩn đoán, chỉ định điều trị hoặc quyết định chuyên môn của nhân viên y tế.';

const predictFromHealthRecord = async ({ healthRecord, patientProfile } = {}) => {
    const results = {};

    if (!healthRecord) {
        return results;
    }

    const vitalsResult = await vitalsAiService.predict({ healthRecord, patientProfile });
    if (vitalsResult) {
        results.vitals_risk_assessment = vitalsResult;
    }

    const ecgResult = await ecgAiService.predict({ healthRecord });
    if (ecgResult) {
        results.ecg_arrhythmia = ecgResult;
    }

    return results;
};

const getStatus = () => ({
    vitals_risk_assessment: vitalsAiService.getStatus(),
    ecg_arrhythmia: ecgAiService.getStatus(),
    disclaimer: AI_DISCLAIMER,
});

// Load both TF models into memory once at startup so the first real-time
// prediction after a server (re)start doesn't pay the disk-load latency
// inline with the MQTT ingest path.
const warmup = async () => {
    await Promise.all([
        vitalsAiService.loadModel().catch(() => null),
        ecgAiService.loadModel().catch(() => null),
    ]);
};

module.exports = {
    AI_DISCLAIMER,
    predictFromHealthRecord,
    getStatus,
    warmup,
    vitalsAiService,
    ecgAiService,
};
