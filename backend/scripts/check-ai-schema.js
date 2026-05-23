require('dotenv').config();
const db = require('../src/config/db');

const main = async () => {
    const result = await db.query(`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('users', 'health_data', 'ai_predictions')
          AND column_name IN ('gender', 'map', 'systolic_bp', 'diastolic_bp', 'prediction_label')
        ORDER BY table_name, column_name
    `);

    console.log(JSON.stringify(result.rows, null, 2));
};

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
