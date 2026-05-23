const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { loadTensorflow } = require('./tensorflow');
const { graphModelFileHandler } = require('./filesystem-io');
const { buildEcgWindow } = require('./preprocessing');

const MODEL_DIR = path.join(__dirname, 'models', 'ecg-arrhythmia');
const MODEL_JSON = path.join(MODEL_DIR, 'model.json');
const METADATA_JSON = path.join(MODEL_DIR, 'metadata.json');

let modelPromise = null;
let metadataCache = null;

const readMetadata = () => {
    metadataCache = metadataCache || JSON.parse(fs.readFileSync(METADATA_JSON, 'utf8'));
    return metadataCache;
};

const getStatus = () => {
    const { error } = loadTensorflow();
    const missing = [MODEL_JSON, METADATA_JSON]
        .filter((filePath) => !fs.existsSync(filePath))
        .map((filePath) => path.basename(filePath));

    return {
        name: 'ecg-arrhythmia',
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

const predict = async ({ healthRecord } = {}) => {
    const status = getStatus();
    if (!status.ready) {
        return { skipped: true, reason: 'model_unavailable', status };
    }

    const metadata = readMetadata();
    const windowSize = Number(metadata.window_size || metadata.windowSize || 100);
    const mean = Number(metadata.mean);
    const std = Number(metadata.std);
    const expectedSamplingRate = Number(metadata.sampling_rate_hz || metadata.fs || 360);
    const samplingRate = Number(healthRecord?.ecg_sampling_rate || healthRecord?.sampling_rate || 0) || null;
    const ecgInput = buildEcgWindow(healthRecord?.ecg_points, {
        windowSize,
        mean,
        std,
        samplingRate,
        expectedSamplingRate,
    });

    if (!ecgInput) {
        return { skipped: true, reason: 'missing_or_invalid_ecg_points', required_window_size: windowSize };
    }

    const { tf } = loadTensorflow();
    const model = await loadModel();
    if (!model) {
        return { skipped: true, reason: 'model_load_failed' };
    }

    const input = tf.tensor3d([ecgInput.window], [1, windowSize, 1]);
    const output = model.predict(input);
    const outputTensor = Array.isArray(output) ? output[0] : output;
    const probabilities = Array.from(await outputTensor.data());

    input.dispose();
    if (Array.isArray(output)) output.forEach((tensor) => tensor.dispose?.());
    else output.dispose?.();

    const confidence = Math.max(...probabilities);
    const classIndex = probabilities.indexOf(confidence);
    const classInfo = (metadata.classes || []).find((item) => Number(item.id) === classIndex);

    const rawContext = {
        heart_rate: healthRecord?.heart_rate ?? null,
        spo2: healthRecord?.spo2 ?? null,
        temperature: healthRecord?.temperature ?? null,
        systolic_bp: healthRecord?.systolic_bp ?? null,
        diastolic_bp: healthRecord?.diastolic_bp ?? null,
        map: healthRecord?.map ?? null,
        sampling_rate: samplingRate,
        ecg_points_count: Array.isArray(healthRecord?.ecg_points) ? healthRecord.ecg_points.length : 0,
        window_size: windowSize,
        ecg_quality: ecgInput.quality,
    };

    return {
        model_name: 'ecg-arrhythmia',
        label: classInfo?.code || String(classIndex),
        description: classInfo?.label || null,
        confidence,
        probabilities,
        input_snapshot: {
            raw: rawContext,
            ecg_points_count: Array.isArray(healthRecord?.ecg_points) ? healthRecord.ecg_points.length : 0,
            window_size: windowSize,
            preprocessing: 'peak_centered_window_then_global_standardization',
            ecg_quality: ecgInput.quality,
        },
    };
};

module.exports = {
    predict,
    getStatus,
};
