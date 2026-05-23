require('dotenv').config();
const mqtt = require('mqtt');

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const parseArgs = () => {
    const args = process.argv.slice(2);
    const options = {
        deviceId: 'DEV_01',
        count: 3,
        intervalMs: 1000,
        mode: 'normal',
    };

    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        const next = args[i + 1];
        if (arg === '--device' || arg === '--deviceId') {
            options.deviceId = next || options.deviceId;
            i += 1;
        } else if (arg === '--count') {
            options.count = Math.max(1, parseInt(next, 10) || options.count);
            i += 1;
        } else if (arg === '--interval') {
            options.intervalMs = Math.max(100, parseInt(next, 10) || options.intervalMs);
            i += 1;
        } else if (arg === '--mode') {
            options.mode = next || options.mode;
            i += 1;
        }
    }

    return options;
};

const buildEcgPoints = (sampleIndex, mode) => {
    const points = [];
    const amplitude = mode === 'high-risk' ? 0.75 : 0.4;
    const frequency = mode === 'high-risk' ? 0.22 : 0.12;

    for (let i = 0; i < 128; i += 1) {
        const phase = sampleIndex * 0.4 + i * frequency;
        const value = amplitude * Math.sin(phase) + 0.08 * Math.sin(phase * 3);
        points.push(Number(clamp(value, -2, 2).toFixed(4)));
    }
    return points;
};

const buildPayload = ({ deviceId, index, mode }) => {
    const highRisk = mode === 'high-risk';
    const systolic = highRisk ? 148 : 120;
    const diastolic = highRisk ? 96 : 80;
    const map = (systolic + 2 * diastolic) / 3;

    return {
        device_id: deviceId,
        hr: highRisk ? 138 + (index % 5) : 78 + (index % 4),
        spo2: highRisk ? 89 + (index % 2) : 97.2,
        temp: highRisk ? 39.1 : 36.8,
        systolic_bp: systolic,
        diastolic_bp: diastolic,
        map: Number(map.toFixed(1)),
        ecg: 0.1,
        ecg_points: buildEcgPoints(index, mode),
        session_id: null,
        ts: new Date().toISOString(),
    };
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const main = async () => {
    const options = parseArgs();
    const brokerUrl = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
    const topic = `vitals/${options.deviceId}/data`;

    const client = mqtt.connect(brokerUrl, {
        username: process.env.MQTT_USERNAME,
        password: process.env.MQTT_PASSWORD,
        clientId: `ai_test_${Date.now().toString(16)}`,
        clean: true,
        connectTimeout: 10_000,
    });

    await new Promise((resolve, reject) => {
        client.once('connect', resolve);
        client.once('error', reject);
    });

    console.log(`MQTT connected: ${brokerUrl}`);
    console.log(`Publishing ${options.count} AI test messages to ${topic}`);

    for (let i = 0; i < options.count; i += 1) {
        const payload = buildPayload({ deviceId: options.deviceId, index: i, mode: options.mode });
        await new Promise((resolve, reject) => {
            client.publish(topic, JSON.stringify(payload), { qos: 0 }, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log(`Published ${i + 1}/${options.count}: HR=${payload.hr}, SpO2=${payload.spo2}, Temp=${payload.temp}, MAP=${payload.map}, ECG points=${payload.ecg_points.length}`);
        if (i < options.count - 1) {
            await delay(options.intervalMs);
        }
    }

    client.end(true);
    console.log('Done. Check backend logs and ai_predictions for generated diagnoses.');
};

if (require.main === module) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = {
    buildPayload,
    buildEcgPoints,
};
