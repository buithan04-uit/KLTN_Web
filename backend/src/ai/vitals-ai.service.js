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
        name: 'vitals-risk',
        ready: !error && missing.length === 0,
        tensorflow_available: !error,
        tensorflow_error: error,
        missing_files: missing,
        model_dir: MODEL_DIR,
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

const buildFeatureVector = ({ healthRecord, patientProfile } = {}) => {
    const spo2 = toFiniteNumber(healthRecord?.spo2);
    const temperature = toFiniteNumber(healthRecord?.temperature);
    const heartRate = toFiniteNumber(healthRecord?.heart_rate);
    const map = toFiniteNumber(healthRecord?.map)
        ?? calculateMap(healthRecord?.systolic_bp, healthRecord?.diastolic_bp);
    const systolicBp = toFiniteNumber(healthRecord?.systolic_bp);
    const diastolicBp = toFiniteNumber(healthRecord?.diastolic_bp);
    const age = calculateAge(patientProfile?.date_of_birth);
    const weight = toFiniteNumber(patientProfile?.weight);
    const heightRaw = toFiniteNumber(patientProfile?.height);
    const heightM = heightRaw && heightRaw > 3 ? heightRaw / 100 : heightRaw;
    const bmi = calculateBmi(weight, heightRaw);
    const gender = normalizeGender(patientProfile?.gender);

    const raw = {
        spo2,
        temperature,
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

    if (featureVector.some((value) => value === null || value === undefined)) {
        return { raw, featureVector, reason: 'missing_required_features' };
    }

    return { raw, featureVector, reason: null };
};

const predict = async ({ healthRecord, patientProfile } = {}) => {
    const status = getStatus();
    if (!status.ready) {
        return { skipped: true, reason: 'model_unavailable', status };
    }

    const { raw, featureVector, reason } = buildFeatureVector({ healthRecord, patientProfile });
    if (reason) {
        return { skipped: true, reason, required_features: [
            'spo2', 'temperature', 'heart_rate', 'map_or_systolic_diastolic_bp',
            'date_of_birth', 'weight', 'height', 'gender',
        ] };
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
    const output = model.predict(input);
    const outputTensor = Array.isArray(output) ? output[0] : output;
    const values = Array.from(await outputTensor.data());

    input.dispose();
    if (Array.isArray(output)) output.forEach((tensor) => tensor.dispose?.());
    else output.dispose?.();

    const classes = encoderCache?.classes || ['High Risk', 'Low Risk'];
    const sigmoidProbability = values.length === 1 ? values[0] : null;
    const classProbabilities = sigmoidProbability !== null
        ? [1 - sigmoidProbability, sigmoidProbability]
        : values;
    const confidence = Math.max(...classProbabilities);
    const classIndex = classProbabilities.indexOf(confidence);
    const label = classes[classIndex] || String(classIndex);

    return {
        model_name: 'vitals-risk',
        label,
        confidence,
        probabilities: classProbabilities,
        input_snapshot: {
            raw,
            feature_order: ['spo2', 'temperature', 'heart_rate', 'map', 'age', 'weight', 'height_m', 'bmi', 'gender'],
            model_output: values,
            scaled,
        },
    };
};

module.exports = {
    predict,
    getStatus,
    buildFeatureVector,
};
