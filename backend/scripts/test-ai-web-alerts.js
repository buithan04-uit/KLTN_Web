require('dotenv').config();
const mqtt = require('mqtt');

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseArgs = () => {
    const args = process.argv.slice(2);
    const options = {
        deviceId: 'DEV_01',
        scenario: 'mixed',
        count: 8,
        intervalMs: 1000,
    };

    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        const next = args[i + 1];
        if (arg === '--device' || arg === '--deviceId') {
            options.deviceId = next || options.deviceId;
            i += 1;
        } else if (arg === '--scenario' || arg === '--mode') {
            options.scenario = next || options.scenario;
            i += 1;
        } else if (arg === '--count') {
            options.count = Math.max(1, parseInt(next, 10) || options.count);
            i += 1;
        } else if (arg === '--interval') {
            options.intervalMs = Math.max(200, parseInt(next, 10) || options.intervalMs);
            i += 1;
        }
    }

    return options;
};

const ecgNormal = (index) => {
    const points = [];
    for (let i = 0; i < 256; i += 1) {
        const phase = index * 0.2 + i * 0.11;
        const value = 0.35 * Math.sin(phase) + 0.04 * Math.sin(phase * 3);
        points.push(Number(clamp(value, -1.5, 1.5).toFixed(4)));
    }
    return points;
};

const ecgArrhythmiaLike = (index) => {
    const points = [];
    for (let i = 0; i < 256; i += 1) {
        const phase = index * 0.35 + i * 0.18;
        const base = 0.45 * Math.sin(phase) + 0.16 * Math.sin(phase * 2.7);
        const spike = i % 48 < 4 ? 1.15 - (i % 48) * 0.22 : 0;
        const dip = i % 61 < 3 ? -0.75 + (i % 61) * 0.18 : 0;
        points.push(Number(clamp(base + spike + dip, -2, 2).toFixed(4)));
    }
    return points;
};

const phaseConfig = {
    normal: {
        label: 'NORMAL',
        hr: (i) => 76 + (i % 4),
        spo2: () => 97.4,
        temp: () => 36.7,
        systolic: () => 118,
        diastolic: () => 78,
        ecg: ecgNormal,
    },
    warning: {
        label: 'WARNING_VITALS',
        hr: (i) => 112 + (i % 4),
        spo2: () => 93.5,
        temp: () => 37.8,
        systolic: () => 138,
        diastolic: () => 88,
        ecg: ecgNormal,
    },
    danger: {
        label: 'DANGER_VITALS_ECG',
        hr: (i) => 136 + (i % 6),
        spo2: () => 88.5,
        temp: () => 39.1,
        systolic: () => 156,
        diastolic: () => 98,
        ecg: ecgArrhythmiaLike,
    },
    ecg: {
        label: 'ECG_ONLY',
        hr: (i) => 82 + (i % 3),
        spo2: () => 96.8,
        temp: () => 36.9,
        systolic: () => 122,
        diastolic: () => 80,
        ecg: ecgArrhythmiaLike,
    },
};

const buildPayload = ({ deviceId, phase, index }) => {
    const cfg = phaseConfig[phase] || phaseConfig.normal;
    const systolic = cfg.systolic(index);
    const diastolic = cfg.diastolic(index);
    const map = (systolic + 2 * diastolic) / 3;
    const ecgPoints = cfg.ecg(index);

    return {
        device_id: deviceId,
        hr: cfg.hr(index),
        spo2: cfg.spo2(index),
        temp: cfg.temp(index),
        systolic_bp: systolic,
        diastolic_bp: diastolic,
        map: Number(map.toFixed(1)),
        gender: 'male',
        ecg: ecgPoints[ecgPoints.length - 1],
        ecg_points: ecgPoints,
        session_id: `ai-web-test-${phase}`,
        ts: new Date().toISOString(),
    };
};

const resolvePhases = (scenario) => {
    if (scenario === 'normal') return ['normal'];
    if (scenario === 'warning') return ['warning'];
    if (scenario === 'danger') return ['danger'];
    if (scenario === 'ecg') return ['ecg'];
    if (scenario === 'recovery') return ['danger', 'normal'];
    return ['normal', 'danger'];
};

const connectMqtt = async () => {
    const brokerUrl = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
    const client = mqtt.connect(brokerUrl, {
        username: process.env.MQTT_DEVICE_USERNAME || process.env.MQTT_USERNAME,
        password: process.env.MQTT_DEVICE_PASSWORD || process.env.MQTT_PASSWORD,
        clientId: `ai_web_alert_test_${Date.now().toString(16)}`,
        clean: true,
        connectTimeout: 10_000,
    });

    await new Promise((resolve, reject) => {
        client.once('connect', resolve);
        client.once('error', reject);
    });

    return { client, brokerUrl };
};

const publish = (client, topic, payload) => new Promise((resolve, reject) => {
    client.publish(topic, JSON.stringify(payload), { qos: 0 }, (err) => {
        if (err) reject(err);
        else resolve();
    });
});

const main = async () => {
    const options = parseArgs();
    const phases = resolvePhases(options.scenario);
    const topic = `vitals/${options.deviceId}/data`;
    const { client, brokerUrl } = await connectMqtt();

    console.log(`MQTT connected: ${brokerUrl}`);
    console.log(`Topic: ${topic}`);
    console.log(`Scenario: ${options.scenario} -> ${phases.join(' -> ')}`);
    console.log('Open the web dashboard and watch "Tong hop AI chan doan".');

    try {
        for (const phase of phases) {
            const cfg = phaseConfig[phase] || phaseConfig.normal;
            console.log(`\nPhase ${cfg.label}: sending ${options.count} samples`);

            for (let i = 0; i < options.count; i += 1) {
                const payload = buildPayload({ deviceId: options.deviceId, phase, index: i });
                await publish(client, topic, payload);
                console.log(
                    `[${cfg.label}] ${i + 1}/${options.count} ` +
                    `HR=${payload.hr} SpO2=${payload.spo2} Temp=${payload.temp} ` +
                    `BP=${payload.systolic_bp}/${payload.diastolic_bp} MAP=${payload.map} ECG=${payload.ecg_points.length}pts`
                );

                if (i < options.count - 1) {
                    await delay(options.intervalMs);
                }
            }

            if (phases.length > 1 && phase !== phases[phases.length - 1]) {
                console.log('\nWaiting 3s before next phase...');
                await delay(3000);
            }
        }
    } finally {
        client.end(true);
    }

    console.log('\nDone.');
    console.log('If backend is running, AI predictions should be stored and the web summary should refresh within about 30 seconds.');
    console.log(`Optional DB check: npm exec -- node scripts/check-ai-predictions.js ${options.deviceId}`);
};

if (require.main === module) {
    main().catch((err) => {
        console.error('AI web alert test failed:', err.message);
        process.exit(1);
    });
}

module.exports = {
    buildPayload,
    resolvePhases,
};
