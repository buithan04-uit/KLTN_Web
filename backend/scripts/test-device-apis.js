require('dotenv').config();

const http = require('http');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');
const app = require('../src/app');

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const patientId = (await db.query("SELECT id FROM users WHERE email = 'patient01@telehealth.test' LIMIT 1")).rows[0]?.id;
  const adminId = (await db.query("SELECT id FROM users WHERE email = 'admin01@telehealth.test' LIMIT 1")).rows[0]?.id;
  await db.end();

  const patientToken = jwt.sign({ id: patientId, role: 'patient' }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const adminToken = jwt.sign({ id: adminId, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '10m' });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(5057, resolve));

  try {
    const myResp = await fetch('http://localhost:5057/api/devices/my', {
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    const myJson = await myResp.json();

    const registerResp = await fetch('http://localhost:5057/api/devices/register', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${patientToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        device_id: 'DEV_TEST_99',
        name: 'Test Device 99',
        type: 'wearable',
        firmware_version: '0.1.0',
      }),
    });
    const registerJson = await registerResp.json();

    const adminDevicesResp = await fetch('http://localhost:5057/api/admin/system/devices?page=1&limit=5', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminDevicesJson = await adminDevicesResp.json();

    console.log('device-my-status', myResp.status, 'count', myJson?.data?.length || 0);
    console.log('register-status', registerResp.status, 'device', registerJson?.device?.device_id || registerJson?.error);
    console.log('admin-list-status', adminDevicesResp.status, 'count', adminDevicesJson?.data?.length || 0);
  } finally {
    server.close();
  }
})().catch((err) => {
  console.error('test-device-apis-error', err.message);
  process.exit(1);
});
