require('dotenv').config();
const db = require('../src/config/db');

const main = async () => {
    await db.query(`
        UPDATE users
        SET gender = CASE email
            WHEN 'admin01@telehealth.test' THEN 'other'
            WHEN 'doctor01@telehealth.test' THEN 'male'
            WHEN 'doctor02@telehealth.test' THEN 'female'
            WHEN 'doctor03@telehealth.test' THEN 'female'
            WHEN 'patient01@telehealth.test' THEN 'male'
            WHEN 'patient02@telehealth.test' THEN 'female'
            WHEN 'patient03@telehealth.test' THEN 'female'
            WHEN 'patient04@telehealth.test' THEN 'male'
            ELSE gender
        END
        WHERE email IN (
            'admin01@telehealth.test',
            'doctor01@telehealth.test',
            'doctor02@telehealth.test',
            'doctor03@telehealth.test',
            'patient01@telehealth.test',
            'patient02@telehealth.test',
            'patient03@telehealth.test',
            'patient04@telehealth.test'
        )
    `);

    await db.query(`
        UPDATE health_data
        SET systolic_bp = COALESCE(systolic_bp, CASE WHEN is_abnormal THEN 145 ELSE 120 END),
            diastolic_bp = COALESCE(diastolic_bp, CASE WHEN is_abnormal THEN 95 ELSE 80 END),
            map = COALESCE(map, CASE WHEN is_abnormal THEN 111.7 ELSE 93.3 END)
        WHERE device_id IN ('DEV_01', 'DEV_02', 'DEV_03', 'DEV_05', 'DEV_06')
    `);

    console.log('AI demo data backfilled');
};

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
