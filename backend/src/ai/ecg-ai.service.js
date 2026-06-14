const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { loadTensorflow } = require('./tensorflow');
const { graphModelFileHandler } = require('./filesystem-io');
const { toFiniteNumber } = require('./preprocessing');

const MODEL_DIR = path.join(__dirname, 'models', 'ecg-arrhythmia');
const MODEL_JSON = path.join(MODEL_DIR, 'model.json');
const SCALER_JSON = path.join(MODEL_DIR, 'scaler_ecg.json');
const METADATA_JSON = path.join(MODEL_DIR, 'metadata.json');

const DEFAULT_CLASSES = ['N', 'S', 'V', 'F', 'Q'];
const DEFAULT_WINDOW_SIZE = 100;
const DEFAULT_ECG_MEAN = -0.28766632142632625;
const DEFAULT_ECG_STD = 0.5241760803999351;
const DEFAULT_EXPECTED_SAMPLING_RATE = 360;

const CONFIDENCE_THRESHOLDS = {
    minimum: 0.60,
    clinical_alert: 0.80,
};

let modelPromise = null;
let scalerCache = null;
let metadataCache = null;

const readJsonIfExists = (filePath) => {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

const normalizeClasses = (classes) => {
    if (!Array.isArray(classes) || !classes.length) return DEFAULT_CLASSES;
    return classes.map((item, index) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') return item.code || item.label || String(item.id ?? index);
        return String(item ?? index);
    });
};

const pickNumber = (...values) => {
    for (const value of values) {
        const parsed = toFiniteNumber(value);
        if (parsed !== null) return parsed;
    }
    return null;
};

const getScaler = () => {
    scalerCache = scalerCache || readJsonIfExists(SCALER_JSON) || {};
    metadataCache = metadataCache || readJsonIfExists(METADATA_JSON) || {};

    const mean = pickNumber(
        scalerCache.mean,
        scalerCache.ecg_mean,
        scalerCache.train_mean,
        metadataCache.mean,
        metadataCache.ecg_mean,
        DEFAULT_ECG_MEAN,
    );
    const std = pickNumber(
        scalerCache.std,
        scalerCache.scale,
        scalerCache.ecg_std,
        scalerCache.train_std,
        metadataCache.std,
        metadataCache.ecg_std,
        DEFAULT_ECG_STD,
    );
    const windowSize = pickNumber(
        scalerCache.window_size,
        scalerCache.input_length,
        metadataCache.window_size,
        metadataCache.input_length,
        DEFAULT_WINDOW_SIZE,
    );
    const expectedSamplingRate = pickNumber(
        scalerCache.expected_sampling_rate,
        scalerCache.sampling_rate,
        metadataCache.expected_sampling_rate,
        metadataCache.sampling_rate,
        metadataCache.sampling_rate_hz,
        DEFAULT_EXPECTED_SAMPLING_RATE,
    );

    return {
        mean: mean ?? DEFAULT_ECG_MEAN,
        std: std || DEFAULT_ECG_STD,
        windowSize: Math.max(1, Math.round(windowSize || DEFAULT_WINDOW_SIZE)),
        expectedSamplingRate: expectedSamplingRate || DEFAULT_EXPECTED_SAMPLING_RATE,
        classes: normalizeClasses(metadataCache.classes || scalerCache.classes || DEFAULT_CLASSES),
    };
};

const getStatus = () => {
    const { error } = loadTensorflow();
    const missing = [MODEL_JSON]
        .filter((filePath) => !fs.existsSync(filePath))
        .map((filePath) => path.basename(filePath));

    return {
        name: 'ecg-arrhythmia',
        ready: !error && missing.length === 0,
        tensorflow_available: !error,
        tensorflow_error: error,
        missing_files: missing,
        model_dir: MODEL_DIR,
        confidence_thresholds: CONFIDENCE_THRESHOLDS,
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

const normalizeProbabilities = (values) => {
    const numeric = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
    if (!numeric.length) return [];

    const sum = numeric.reduce((total, value) => total + value, 0);
    if (sum > 0.99 && sum < 1.01 && numeric.every((value) => value >= 0 && value <= 1)) {
        return numeric;
    }

    const max = Math.max(...numeric);
    const exp = numeric.map((value) => Math.exp(value - max));
    const expSum = exp.reduce((total, value) => total + value, 0);
    return exp.map((value) => value / expSum);
};

const classifyOutput = ({ probabilities, classes }) => {
    if (!probabilities.length) {
        return {
            label: 'Uncertain',
            raw_label: null,
            confidence: null,
            confidence_status: 'invalid_output',
            clinical_actionable: false,
        };
    }

    const confidence = Math.max(...probabilities);
    const classIndex = probabilities.indexOf(confidence);
    const rawLabel = classes[classIndex] || String(classIndex);

    if (confidence < CONFIDENCE_THRESHOLDS.minimum) {
        return {
            label: 'Uncertain',
            raw_label: rawLabel,
            confidence,
            confidence_status: 'low_confidence',
            clinical_actionable: false,
        };
    }

    if (confidence < CONFIDENCE_THRESHOLDS.clinical_alert) {
        return {
            label: `Possible ${rawLabel}`,
            raw_label: rawLabel,
            confidence,
            confidence_status: 'needs_review',
            clinical_actionable: false,
        };
    }

    return {
        label: rawLabel,
        raw_label: rawLabel,
        confidence,
        confidence_status: 'confident',
        clinical_actionable: rawLabel !== 'N',
    };
};

const toNumericArray = (points) => {
    if (!Array.isArray(points)) return [];
    return points
        .map((value) => toFiniteNumber(value))
        .filter((value) => value !== null);
};

const buildPreprocessedEcgWindow = (healthRecord, scaler) => {
    const aiWindow = healthRecord?.ecg_ai_window;
    const candidate = Array.isArray(aiWindow?.points)
        ? aiWindow.points
        : healthRecord?.ecg_points;
    const normalized = aiWindow?.normalized === true
        || healthRecord?.normalized === true
        || healthRecord?.note === 'ecg_ai_window_normalized'
        || healthRecord?.type === 'ecg_ai_window';

    if (!normalized) return null;

    const numeric = toNumericArray(candidate);
    if (numeric.length !== scaler.windowSize) {
        return {
            error: 'ecg_ai_window_size_mismatch',
            received_points: numeric.length,
            required_points: scaler.windowSize,
        };
    }

    const rPeakIndex = pickNumber(
        aiWindow?.r_peak_index,
        healthRecord?.r_peak_index,
        Math.floor(scaler.windowSize / 2),
    );
    const samplingRate = pickNumber(
        aiWindow?.sampling_rate,
        healthRecord?.ecg_sampling_rate,
        healthRecord?.sampling_rate,
    );

    return {
        window: numeric.map((value) => [Math.max(-8, Math.min(8, value))]),
        raw_window: numeric,
        quality: {
            points_count: numeric.length,
            window_size: scaler.windowSize,
            selected_start: 0,
            selected_peak_index: rPeakIndex,
            selection: 'firmware_r_peak_centered',
            sampling_rate: samplingRate || null,
            expected_sampling_rate: scaler.expectedSamplingRate,
            normalized: true,
            mean: pickNumber(aiWindow?.mean, healthRecord?.ecg_mean),
            std: pickNumber(aiWindow?.std, healthRecord?.ecg_std),
            issues: samplingRate && scaler.expectedSamplingRate && Math.abs(samplingRate - scaler.expectedSamplingRate) > 1
                ? ['sampling_rate_mismatch']
                : [],
            usable: !samplingRate || !scaler.expectedSamplingRate || Math.abs(samplingRate - scaler.expectedSamplingRate) <= 1,
        },
    };
};

const predict = async ({ healthRecord } = {}) => {
    const status = getStatus();
    if (!status.ready) {
        return { skipped: true, reason: 'model_unavailable', status };
    }

    // Only trust windows the firmware itself extracted and normalized
    // (ecg_ai_window). Raw ecg_points from ecg_frame are display-scale
    // samples from a different filter chain with an unknown gain relative
    // to MIT-BIH — feeding them through buildEcgWindow produced inputs far
    // outside the model's training distribution, so that fallback has been
    // removed.
    const scaler = getScaler();
    const preprocessedWindow = buildPreprocessedEcgWindow(healthRecord, scaler);
    if (preprocessedWindow?.error) {
        return {
            skipped: true,
            reason: preprocessedWindow.error,
            required_points: preprocessedWindow.required_points,
            received_points: preprocessedWindow.received_points,
        };
    }

    if (!preprocessedWindow?.window) {
        return { skipped: true, reason: 'ecg_ai_window_required' };
    }

    const ecgWindow = preprocessedWindow;
    const ecgPoints = ecgWindow.raw_window;
    const samplingRate = ecgWindow.quality?.sampling_rate ?? null;

    const { tf } = loadTensorflow();
    const model = await loadModel();
    if (!model) {
        return { skipped: true, reason: 'model_load_failed' };
    }

    const input = tf.tensor3d([ecgWindow.window], [1, scaler.windowSize, 1]);
    const output = model.predict(input);
    const outputTensor = Array.isArray(output) ? output[0] : output;
    const values = Array.from(await outputTensor.data());

    input.dispose();
    if (Array.isArray(output)) output.forEach((tensor) => tensor.dispose?.());
    else output.dispose?.();

    const probabilities = normalizeProbabilities(values);
    const classification = classifyOutput({
        probabilities,
        classes: scaler.classes,
    });

    return {
        model_name: 'ecg-arrhythmia',
        label: classification.label,
        confidence: classification.confidence,
        probabilities,
        input_snapshot: {
            raw: {
                device_id: healthRecord?.device_id,
                points_count: ecgPoints.length,
                window_size: scaler.windowSize,
                sampling_rate: ecgWindow.quality?.sampling_rate ?? samplingRate,
                expected_sampling_rate: scaler.expectedSamplingRate,
                ecg_quality: ecgWindow.quality,
                ecg_points_count: ecgPoints.length,
                preprocessed_window: Boolean(preprocessedWindow),
                r_peak_index: ecgWindow.quality?.selected_peak_index ?? null,
                raw_label: classification.raw_label,
                confidence_status: classification.confidence_status,
                clinical_actionable: classification.clinical_actionable,
            },
            feature_order: ['ecg_window'],
            raw_window: ecgWindow.raw_window,
            quality: ecgWindow.quality,
            model_output: values,
            probabilities,
            classes: scaler.classes,
            thresholds: CONFIDENCE_THRESHOLDS,
            note: 'Low-confidence ECG outputs are stored as Uncertain/Possible and must not be treated as clinical diagnosis.',
        },
    };
};

module.exports = {
    predict,
    getStatus,
};
