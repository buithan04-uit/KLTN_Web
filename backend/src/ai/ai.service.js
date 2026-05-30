const vitalsAiService = require('./vitals-ai.service');
const ecgAiService = require('./ecg-ai.service');

const AI_DISCLAIMER = 'Kết quả AI chỉ để bác sĩ tham khảo trong quá trình khám chữa bệnh, không thay thế chẩn đoán chuyên môn.';

const predictFromHealthRecord = async ({ healthRecord, patientProfile } = {}) => {
    const results = {};

    if (!healthRecord) {
        return results;
    }

    const vitalsResult = await vitalsAiService.predict({ healthRecord, patientProfile });
    if (vitalsResult) {
        results.vitals_risk = vitalsResult;
    }

    const ecgResult = await ecgAiService.predict({ healthRecord });
    if (ecgResult) {
        results.ecg_arrhythmia = ecgResult;
    }

    return results;
};

const getStatus = () => ({
    vitals_risk: vitalsAiService.getStatus(),
    ecg_arrhythmia: ecgAiService.getStatus(),
    disclaimer: AI_DISCLAIMER,
});

module.exports = {
    AI_DISCLAIMER,
    predictFromHealthRecord,
    getStatus,
    vitalsAiService,
    ecgAiService,
};
