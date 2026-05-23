const vitalsAiService = require('./vitals-ai.service');
const ecgAiService = require('./ecg-ai.service');

const AI_DISCLAIMER = 'Ket qua AI chi de bac si tham khao trong qua trinh kham chua benh, khong thay the chan doan chuyen mon.';

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
