require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const seedFile = path.resolve(__dirname, '../../database/seeds/001_full_test_data.sql');

(async () => {
  const sql = fs.readFileSync(seedFile, 'utf8');
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  await client.connect();
  await client.query(sql);

  const summary = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM devices) AS devices,
      (SELECT COUNT(*) FROM health_data WHERE note = 'seed.full-test-data') AS seed_vitals,
      (SELECT COUNT(*) FROM access_codes WHERE note LIKE 'active seed%') AS active_codes,
      (SELECT COUNT(*) FROM doctor_access_sessions WHERE revoked_at IS NULL AND expires_at > NOW()) AS active_sessions,
      (SELECT COUNT(*) FROM audit_logs WHERE action LIKE 'seed.%') AS seed_audits
  `);

  console.log('seed-summary', summary.rows[0]);
  await client.end();
})().catch((err) => {
  console.error('seed-error', err.message);
  process.exit(1);
});
