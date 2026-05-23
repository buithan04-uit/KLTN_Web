let cachedTf = null;
let loadError = null;

const loadTensorflow = () => {
    if (cachedTf || loadError) {
        return { tf: cachedTf, error: loadError };
    }

    try {
        cachedTf = require('@tensorflow/tfjs-node');
        return { tf: cachedTf, error: null };
    } catch (nodeErr) {
        try {
            cachedTf = require('@tensorflow/tfjs');
            cachedTf._nodeLoadError = nodeErr.message || 'tfjs-node failed to load';
            return { tf: cachedTf, error: null };
        } catch (webErr) {
            loadError = nodeErr.message || webErr.message || 'TensorFlow.js is not installed';
            return { tf: null, error: loadError };
        }
    }
};

module.exports = {
    loadTensorflow,
};
