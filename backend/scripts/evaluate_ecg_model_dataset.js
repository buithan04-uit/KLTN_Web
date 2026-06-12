#!/usr/bin/env node
/**
 * Evaluate the TFJS ECG model on exported MIT-BIH Lead II/MLII beats.
 *
 * First export data:
 *   py backend/scripts/prepare_mitbih_lead2_eval.py --dataset-dir mit-bih-arrhythmia-database-1.0.0
 *
 * Then evaluate:
 *   node backend/scripts/evaluate_ecg_model_dataset.js backend/scripts/mitbih_lead2_eval.jsonl
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { loadTensorflow } = require('../src/ai/tensorflow');
const { graphModelFileHandler } = require('../src/ai/filesystem-io');

const MODEL_DIR = path.join(__dirname, '..', 'src', 'ai', 'models', 'ecg-arrhythmia');
const MODEL_JSON = path.join(MODEL_DIR, 'model.json');
const SCALER_JSON = path.join(MODEL_DIR, 'scaler_ecg.json');
const METADATA_JSON = path.join(MODEL_DIR, 'metadata.json');

const DEFAULT_CLASSES = ['N', 'S', 'V', 'F', 'Q'];
const DEFAULT_MEAN = -0.28766632142632625;
const DEFAULT_STD = 0.5241760803999351;

const readJsonIfExists = (filePath) => {
  if (!fs.existsSync(filePath)) return {};
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

const toNumber = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const resample = (points, targetCount) => {
  if (points.length === targetCount) return points;
  if (points.length < 2) return Array.from({ length: targetCount }, () => points[0] || 0);
  const last = points.length - 1;
  return Array.from({ length: targetCount }, (_, i) => {
    const pos = (i * last) / Math.max(targetCount - 1, 1);
    const left = Math.floor(pos);
    const right = Math.min(left + 1, last);
    const ratio = pos - left;
    return points[left] * (1 - ratio) + points[right] * ratio;
  });
};

const normalizeProbabilities = (values) => {
  const nums = values.map(Number).filter(Number.isFinite);
  const sum = nums.reduce((a, b) => a + b, 0);
  if (sum > 0.99 && sum < 1.01 && nums.every((v) => v >= 0 && v <= 1)) return nums;
  const max = Math.max(...nums);
  const exp = nums.map((v) => Math.exp(v - max));
  const expSum = exp.reduce((a, b) => a + b, 0);
  return exp.map((v) => v / expSum);
};

const loadRows = (filePath) => fs.readFileSync(filePath, 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const increment = (obj, key) => {
  obj[key] = (obj[key] || 0) + 1;
};

const main = async () => {
  const datasetPath = process.argv[2] || path.join(__dirname, 'mitbih_lead2_eval.jsonl');
  const rows = loadRows(datasetPath);
  if (!rows.length) throw new Error(`No rows in ${datasetPath}`);

  const scaler = readJsonIfExists(SCALER_JSON);
  const metadata = readJsonIfExists(METADATA_JSON);
  const classes = normalizeClasses(metadata.classes || scaler.classes || DEFAULT_CLASSES);
  const mean = toNumber(scaler.mean ?? scaler.ecg_mean ?? metadata.mean ?? metadata.ecg_mean, DEFAULT_MEAN);
  const std = toNumber(scaler.std ?? scaler.scale ?? scaler.ecg_std ?? metadata.std ?? metadata.ecg_std, DEFAULT_STD);
  const windowSize = toNumber(scaler.window_size ?? scaler.input_length ?? metadata.window_size ?? metadata.input_length, rows[0].ecg_points.length);

  const { tf, error } = loadTensorflow();
  if (error) throw new Error(error);

  const fileHandler = tf.io?.fileSystem
    ? tf.io.fileSystem(MODEL_JSON)
    : graphModelFileHandler(tf, MODEL_JSON);
  const model = await tf.loadGraphModel(fileHandler).catch(() => tf.loadLayersModel(pathToFileURL(MODEL_JSON).href));

  const confusion = {};
  const predictedCounts = {};
  const truthCounts = {};
  let correct = 0;
  let lowConfidence = 0;

  for (const row of rows) {
    const raw = resample(row.ecg_points.map(Number), windowSize);
    const normalized = raw.map((value) => (value - mean) / std);
    const input = tf.tensor3d(normalized, [1, windowSize, 1]);
    const output = model.predict(input);
    const tensor = Array.isArray(output) ? output[0] : output;
    const values = Array.from(await tensor.data());
    input.dispose();
    if (Array.isArray(output)) output.forEach((t) => t.dispose?.());
    else output.dispose?.();

    const probs = normalizeProbabilities(values);
    const confidence = Math.max(...probs);
    const pred = classes[probs.indexOf(confidence)] || String(probs.indexOf(confidence));
    const truth = row.label;

    if (!confusion[truth]) confusion[truth] = {};
    increment(confusion[truth], pred);
    increment(truthCounts, truth);
    increment(predictedCounts, pred);
    if (pred === truth) correct += 1;
    if (confidence < 0.60) lowConfidence += 1;
  }

  console.log('Dataset:', datasetPath);
  console.log('Rows:', rows.length);
  console.log('Classes:', classes);
  console.log('Window size:', windowSize, 'mean:', mean, 'std:', std);
  console.log('Accuracy:', `${((correct / rows.length) * 100).toFixed(2)}%`);
  console.log('Low confidence (<0.60):', lowConfidence);
  console.log('Truth counts:', truthCounts);
  console.log('Predicted counts:', predictedCounts);
  console.log('Confusion matrix:', JSON.stringify(confusion, null, 2));
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
