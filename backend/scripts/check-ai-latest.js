require('dotenv').config();
const aiService = require('../src/ai');
const DeviceModel = require('../src/models/device.model');
const HealthModel = require('../src/models/health.model');
const UserModel = require('../src/models/user.model');

const main = async () => {
    const deviceId = process.argv[2] || 'DEV_01';
    const device = await DeviceModel.findById(deviceId);
    if (!device) throw new Error(`Device ${deviceId} not found`);

    const rows = await HealthModel.getHistory(deviceId, 1);
    const latest = rows[0];
    if (!latest) throw new Error(`No health_data rows for ${deviceId}`);

    const profile = device.owner_id ? await UserModel.getProfile(device.owner_id) : null;
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

    const predictions = await aiService.predictFromHealthRecord({
        healthRecord: healthRecordForAi,
        patientProfile: profile,
    });

    console.log(JSON.stringify({
        device_id: deviceId,
        latest: {
            time: latest.time,
            heart_rate: latest.heart_rate,
            spo2: latest.spo2,
            temperature: latest.temperature,
            map: latest.map,
            ecg_points_count: Array.isArray(latest.ecg_points) ? latest.ecg_points.length : 0,
            ai_ecg_points_count: Array.isArray(healthRecordForAi.ecg_points) ? healthRecordForAi.ecg_points.length : 0,
        },
        profile: {
            owner_id: device.owner_id,
            gender: profile?.gender || null,
            date_of_birth: profile?.date_of_birth || null,
            height: profile?.height || null,
            weight: profile?.weight || null,
        },
        predictions,
    }, null, 2));
};

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
