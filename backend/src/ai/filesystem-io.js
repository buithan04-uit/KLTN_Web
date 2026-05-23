const fs = require('fs');
const path = require('path');

const readWeights = (modelDir, weightsManifest = []) => {
    const weightSpecs = [];
    const buffers = [];

    for (const group of weightsManifest) {
        for (const weight of group.weights || []) {
            weightSpecs.push(weight);
        }

        for (const relativePath of group.paths || []) {
            const weightPath = path.join(modelDir, relativePath);
            buffers.push(fs.readFileSync(weightPath));
        }
    }

    const totalLength = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const buffer of buffers) {
        merged.set(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength), offset);
        offset += buffer.byteLength;
    }

    return {
        weightSpecs,
        weightData: merged.buffer,
    };
};

const graphModelFileHandler = (tf, modelJsonPath) => {
    const modelDir = path.dirname(modelJsonPath);

    return {
        load: async () => {
            const modelJson = JSON.parse(fs.readFileSync(modelJsonPath, 'utf8'));
            const weights = readWeights(modelDir, modelJson.weightsManifest || []);

            return {
                modelTopology: modelJson.modelTopology,
                weightSpecs: weights.weightSpecs,
                weightData: weights.weightData,
                format: modelJson.format,
                generatedBy: modelJson.generatedBy,
                convertedBy: modelJson.convertedBy,
                signature: modelJson.signature,
                userDefinedMetadata: modelJson.userDefinedMetadata,
            };
        },
    };
};

module.exports = {
    graphModelFileHandler,
};
