require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const columns = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'health_data'
    ORDER BY ordinal_position
  `);
  console.log('health_data columns:', columns.rows);

  const sql = `
    SELECT
      device_id,
      COUNT(*) AS total,
      MAX(time) AS last_time,
      COUNT(*) FILTER (WHERE ecg_points IS NOT NULL) AS with_points
    FROM health_data
    WHERE time > NOW() - INTERVAL '30 minutes'
    GROUP BY device_id
    ORDER BY MAX(time) DESC
    LIMIT 10
  `;

  const result = await client.query(sql);
  console.log(result.rows);
  await client.end();
})().catch((err) => {
  console.error('DB check failed:', err.message);
  process.exit(1);
});
