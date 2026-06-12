const vitalsAiService = require('./vitals-ai.service');
const ecgAiService = require('./ecg-ai.service');

const AI_DISCLAIMER = 'Ket qua AI chi ho tro theo doi va danh gia nguy co sinh hieu, khong thay the chan doan, chi dinh dieu tri hoac quyet dinh chuyen mon cua nhan vien y te.';

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

module.exports = {
    AI_DISCLAIMER,
    predictFromHealthRecord,
    getStatus,
    vitalsAiService,
    ecgAiService,
};
