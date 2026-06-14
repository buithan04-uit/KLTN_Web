const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { loadTensorflow } = require('./tensorflow');
const { graphModelFileHandler } = require('./filesystem-io');
const {
    calculateAge,
    calculateBmi,
    calculateMap,
    normalizeGender,
    standardScale,
    toFiniteNumber,
} = require('./preprocessing');

const MODEL_DIR = path.join(__dirname, 'models', 'vitals-risk');
const MODEL_JSON = path.join(MODEL_DIR, 'model.json');
const SCALER_JSON = path.join(MODEL_DIR, 'scaler_mlp.json');
const ENCODER_JSON = path.join(MODEL_DIR, 'risk_encoder.json');

const SENSOR_FIELDS = ['spo2', 'heart_rate', 'temperature'];
const MODEL_REQUIRED_FIELDS = [
    'spo2',
    'temperature',
    'heart_rate',
    'systolic_bp',
    'diastolic_bp',
    'date_of_birth',
    'weight',
    'height',
    'gender',
];

let modelPromise = null;
let scalerCache = null;
let encoderCache = null;

const readJsonIfExists = (filePath) => {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

const getStatus = () => {
    const { error } = loadTensorflow();
    const missing = [MODEL_JSON, SCALER_JSON, ENCODER_JSON]
        .filter((filePath) => !fs.existsSync(filePath))
        .map((filePath) => path.basename(filePath));

    return {
        name: 'vitals-risk-assessment',
        ready: !error && missing.length === 0,
        tensorflow_available: !error,
        tensorflow_error: error,
        missing_files: missing,
        model_dir: MODEL_DIR,
        assessment: {
            rule_based_always_available: true,
            model_requires: MODEL_REQUIRED_FIELDS,
        },
    };
};

const loadModel = async () => {
    const status = getStatus();
    if (!status.ready) return null;

    const { tf } = loadTensorflow();
    if (!modelPromise) {
        const fileHandler = tf.io?.fileSystem
            ? tf.io.fileSystem(MODEL_JSON)
            : graphModelFileHandler(tf, MODEL_JSON);
        modelPromise = tf.loadGraphModel(fileHandler).catch(() => tf.loadLayersModel(pathToFileURL(MODEL_JSON).href));
    }
    return modelPromise;
};

const hasValue = (value) => value !== null && value !== undefined;

const scoreBand = (value, bands) => {
    if (!hasValue(value)) return null;
    for (const band of bands) {
        if (value >= band.min && value <= band.max) return band.score;
    }
    return null;
};

const assessRuleBasedRisk = (raw) => {
    const components = [];

    const spo2Score = scoreBand(raw.spo2, [
        { min: 96, max: Infinity, score: 0 },
        { min: 94, max: 95, score: 1 },
        { min: 92, max: 93, score: 2 },
        { min: -Infinity, max: 91, score: 3 },
    ]);
    if (spo2Score !== null) {
        components.push({
            field: 'spo2',
            label: 'SpO2',
            value: raw.spo2,
            unit: '%',
            score: spo2Score,
            source: 'sensor',
        });
    }

    const heartRateScore = scoreBand(raw.heart_rate, [
        { min: 51, max: 90, score: 0 },
        { min: 41, max: 50, score: 1 },
        { min: 91, max: 110, score: 1 },
        { min: 111, max: 130, score: 2 },
        { min: -Infinity, max: 40, score: 3 },
        { min: 131, max: Infinity, score: 3 },
    ]);
    if (heartRateScore !== null) {
        components.push({
            field: 'heart_rate',
            label: 'Nhip tim',
            value: raw.heart_rate,
            unit: 'bpm',
            score: heartRateScore,
            source: 'sensor',
        });
    }

    const temperatureScore = scoreBand(raw.temperature, [
        { min: 36.1, max: 38.0, score: 0 },
        { min: 35.1, max: 36.0, score: 1 },
        { min: 38.1, max: 39.0, score: 1 },
        { min: -Infinity, max: 35.0, score: 3 },
        { min: 39.1, max: Infinity, score: 2 },
    ]);
    if (temperatureScore !== null) {
        components.push({
            field: 'temperature',
            label: 'Nhiet do',
            value: raw.temperature,
            unit: 'C',
            score: temperatureScore,
            source: 'sensor',
            calibration: {
                version: raw.temperature_calibration_version || null,
                mode: raw.temperature_corrected ? 'corrected' : 'raw_or_unknown',
            },
        });
    }

    const systolicScore = scoreBand(raw.systolic_bp, [
        { min: 111, max: 219, score: 0 },
        { min: 101, max: 110, score: 1 },
        { min: 91, max: 100, score: 2 },
        { min: -Infinity, max: 90, score: 3 },
        { min: 220, max: Infinity, score: 3 },
    ]);
    if (systolicScore !== null) {
        components.push({
            field: 'systolic_bp',
            label: 'Huyet ap tam thu',
            value: raw.systolic_bp,
            unit: 'mmHg',
            score: systolicScore,
            source: 'manual_input',
        });
    }

    const totalScore = components.reduce((sum, item) => sum + item.score, 0);
    const highestSingleScore = components.reduce((max, item) => Math.max(max, item.score), 0);
    let status = 'normal';
    let label = 'Low Risk';
    let interpretation = 'Nguy co thap theo du lieu sinh hieu hien co.';

    if (totalScore >= 5 || highestSingleScore >= 3) {
        status = 'danger';
        label = 'High Risk';
        interpretation = 'Nguy co cao, can duoc nhan vien y te xem xet cung boi canh lam sang.';
    } else if (totalScore >= 3) {
        status = 'warning';
        label = 'Moderate Risk';
        interpretation = 'Co dau hieu can theo doi va doi chieu them.';
    }

    return {
        methodology: 'partial_news2_inspired_vitals_score',
        total_score: totalScore,
        highest_single_score: highestSingleScore,
        status,
        label,
        interpretation,
        components,
        limitations: [
            'Khong tinh NEWS2 day du vi thieu tan so tho, tri giac/AVPU, oxy bo sung va mot so thong so lam sang.',
            'Huyet ap tam thu la du lieu nhap ngoai, khong phai du lieu cam bien truc tiep cua thiet bi hien tai.',
        ],
    };
};

const buildFeatureVector = ({ healthRecord, patientProfile } = {}) => {
    const spo2 = toFiniteNumber(healthRecord?.spo2);
    const temperature = toFiniteNumber(healthRecord?.temperature);
    const heartRate = toFiniteNumber(healthRecord?.heart_rate);
    const systolicBp = toFiniteNumber(healthRecord?.systolic_bp);
    const diastolicBp = toFiniteNumber(healthRecord?.diastolic_bp);
    const map = toFiniteNumber(healthRecord?.map) ?? calculateMap(systolicBp, diastolicBp);
    const age = calculateAge(patientProfile?.date_of_birth);
    const weight = toFiniteNumber(patientProfile?.weight);
    const heightRaw = toFiniteNumber(patientProfile?.height);
    const heightM = heightRaw && heightRaw > 3 ? heightRaw / 100 : heightRaw;
    const bmi = calculateBmi(weight, heightRaw);
    const gender = normalizeGender(patientProfile?.gender);

    const raw = {
        spo2,
        temperature,
        temperature_corrected: Boolean(healthRecord?.temperature_corrected),
        temperature_calibration_version: healthRecord?.temperature_calibration_version || null,
        heart_rate: heartRate,
        systolic_bp: systolicBp,
        diastolic_bp: diastolicBp,
        map,
        age,
        weight,
        height_m: heightM,
        bmi,
        gender,
    };
    const featureVector = [
        raw.spo2,
        raw.temperature,
        raw.heart_rate,
        raw.map,
        raw.age,
        raw.weight,
        raw.height_m,
        raw.bmi,
        raw.gender,
    ];

    const availableFields = [];
    if (hasValue(raw.spo2)) availableFields.push('spo2');
    if (hasValue(raw.temperature)) availableFields.push('temperature');
    if (hasValue(raw.heart_rate)) availableFields.push('heart_rate');
    if (hasValue(raw.systolic_bp)) availableFields.push('systolic_bp');
    if (hasValue(raw.diastolic_bp)) availableFields.push('diastolic_bp');
    if (hasValue(raw.age)) availableFields.push('date_of_birth');
    if (hasValue(raw.weight)) availableFields.push('weight');
    if (hasValue(heightRaw)) availableFields.push('height');
    if (hasValue(raw.gender)) availableFields.push('gender');

    const missingFields = MODEL_REQUIRED_FIELDS.filter((field) => !availableFields.includes(field));
    const hasAnySensorData = SENSOR_FIELDS.some((field) => hasValue(raw[field]));
    const hasManualBloodPressure = hasValue(raw.systolic_bp) || hasValue(raw.diastolic_bp);
    const mode = missingFields.length === 0
        ? 'full'
        : hasManualBloodPressure || availableFields.length > SENSOR_FIELDS.filter((field) => availableFields.includes(field)).length
            ? 'partial'
            : 'sensor-only';

    return {
        raw,
        featureVector,
        coverage: {
            mode,
            available_fields: availableFields,
            missing_fields: missingFields,
            sensor_fields: SENSOR_FIELDS,
            manual_fields: ['systolic_bp', 'diastolic_bp'],
            model_required_fields: MODEL_REQUIRED_FIELDS,
            has_any_sensor_data: hasAnySensorData,
            has_manual_blood_pressure: hasManualBloodPressure,
        },
    };
};

const runModel = async ({ featureVector, raw }) => {
    const status = getStatus();
    if (!status.ready) {
        return { skipped: true, reason: 'model_unavailable', status };
    }

    scalerCache = scalerCache || readJsonIfExists(SCALER_JSON);
    encoderCache = encoderCache || readJsonIfExists(ENCODER_JSON);

    const scaled = standardScale(featureVector, scalerCache);
    if (!scaled || scaled.some((value) => value === null)) {
        return { skipped: true, reason: 'invalid_scaler_or_features' };
    }

    const { tf } = loadTensorflow();
    const model = await loadModel();
    if (!model) {
        return { skipped: true, reason: 'model_load_failed' };
    }

    const input = tf.tensor2d([scaled], [1, scaled.length]);
    let output;
    let values;
    try {
        output = model.predict(input);
        const outputTensor = Array.isArray(output) ? output[0] : output;
        values = Array.from(await outputTensor.data());
    } finally {
        input.dispose();
        if (Array.isArray(output)) output.forEach((tensor) => tensor.dispose?.());
        else output?.dispose?.();
    }

    const classes = encoderCache?.classes || ['High Risk', 'Low Risk'];
    const sigmoidProbability = values.length === 1 ? values[0] : null;
    const classProbabilities = sigmoidProbability !== null
        ? [1 - sigmoidProbability, sigmoidProbability]
        : values;
    const confidence = Math.max(...classProbabilities);
    const classIndex = classProbabilities.indexOf(confidence);
    const label = classes[classIndex] || String(classIndex);

    return {
        skipped: false,
        label,
        confidence,
        probabilities: classProbabilities,
        raw,
        feature_order: ['spo2', 'temperature', 'heart_rate', 'map', 'age', 'weight', 'height_m', 'bmi', 'gender'],
        model_output: values,
        scaled,
    };
};

const predict = async ({ healthRecord, patientProfile } = {}) => {
    const { raw, featureVector, coverage } = buildFeatureVector({ healthRecord, patientProfile });

    if (!coverage.has_any_sensor_data && !coverage.has_manual_blood_pressure) {
        return {
            skipped: true,
            reason: 'no_vitals_data',
            required_features: MODEL_REQUIRED_FIELDS,
        };
    }

    const ruleBased = assessRuleBasedRisk(raw);
    const modelPrediction = coverage.mode === 'full'
        ? await runModel({ featureVector, raw })
        : {
            skipped: true,
            reason: 'model_requires_full_profile_and_blood_pressure',
            missing_fields: coverage.missing_fields,
        };

    const combinedLabel = modelPrediction?.skipped
        ? ruleBased.label
        : `${ruleBased.label} / Model: ${modelPrediction.label}`;

    const confidence = modelPrediction?.skipped ? null : modelPrediction.confidence;

    return {
        model_name: 'vitals-risk-assessment',
        label: combinedLabel,
        confidence,
        probabilities: modelPrediction?.skipped ? null : modelPrediction.probabilities,
        input_snapshot: {
            raw,
            coverage,
            rule_based: ruleBased,
            model_prediction: modelPrediction,
            result_scope: coverage.mode,
            disclaimer: 'Ho tro theo doi nguy co sinh hieu, khong phai chan doan benh doc lap.',
        },
    };
};

module.exports = {
    predict,
    getStatus,
    loadModel,
    buildFeatureVector,
    assessRuleBasedRisk,
};
