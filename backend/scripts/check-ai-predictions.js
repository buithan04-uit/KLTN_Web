require('dotenv').config();
const AiPredictionModel = require('../src/models/ai-prediction.model');

const main = async () => {
    const deviceId = process.argv[2] || 'DEV_01';
    const modelName = process.argv[3] || '';
    const result = await AiPredictionModel.listByDevice(deviceId, {
        page: 1,
        limit: 10,
        model_name: modelName,
    });

    console.log(JSON.stringify(result, null, 2));
};

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
