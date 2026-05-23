require('dotenv').config();
const aiService = require('../src/ai');
const DeviceModel = require('../src/models/device.model');
const UserModel = require('../src/models/user.model');

const main = async () => {
    const deviceId = process.argv[2] || 'DEV_01';
    const device = await DeviceModel.findById(deviceId);
    if (!device) {
        throw new Error(`Device ${deviceId} not found`);
    }

    const profile = device.owner_id ? await UserModel.getProfile(device.owner_id) : null;
    const enrichedProfile = {
        ...profile,
        gender: profile?.gender || 'male',
    };

    const healthRecord = {
        device_id: deviceId,
        heart_rate: 82,
        spo2: 97,
        temperature: 36.8,
        map: 94,
        ecg_points: Array.from({ length: 100 }, (_, i) => Math.sin(i / 10) * 0.4),
    };

    const predictions = await aiService.predictFromHealthRecord({
        healthRecord,
        patientProfile: enrichedProfile,
    });

    console.log(JSON.stringify({
        device_id: deviceId,
        owner_id: device.owner_id,
        profile_has_gender: Boolean(profile?.gender),
        profile_gender_used: enrichedProfile.gender,
        predictions,
    }, null, 2));
};

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
