require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const devices = await client.query(
    `SELECT device_id, owner_id, is_active
     FROM devices
     ORDER BY updated_at DESC NULLS LAST, created_at DESC
     LIMIT 20`
  );

  const latestByDevice = await client.query(
      `SELECT device_id, time, heart_rate, spo2, temperature, ecg_value,
        CASE WHEN ecg_points IS NULL THEN 0 ELSE jsonb_array_length(ecg_points) END AS ecg_points_len
     FROM health_data
     ORDER BY time DESC
     LIMIT 30`
  );

  const dev01 = await client.query(
      `SELECT device_id, time, heart_rate, spo2, temperature, ecg_value,
        CASE WHEN ecg_points IS NULL THEN 0 ELSE jsonb_array_length(ecg_points) END AS ecg_points_len
     FROM health_data
     WHERE device_id = 'DEV_01'
     ORDER BY time DESC
     LIMIT 10`
  );

  console.log('devices_top20=', devices.rows);
  console.log('latest_health_top30=', latestByDevice.rows);
  console.log('dev01_latest10=', dev01.rows);

  await client.end();
})().catch((err) => {
  console.error('check-realtime-sync error:', err.message);
  process.exit(1);
});
