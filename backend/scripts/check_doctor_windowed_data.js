require('dotenv').config();

const API = process.env.BACKEND_URL || 'http://localhost:5000';

async function login(email, password) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.token) throw new Error(`Login failed: ${email}`);
  return json.token;
}

(async () => {
  const patientToken = await login('patient01@telehealth.test', 'Patient@123');
  const doctorToken = await login('doctor01@telehealth.test', 'Doctor@123');

  const createCodeRes = await fetch(`${API}/api/consent/codes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${patientToken}`,
    },
    body: JSON.stringify({ device_id: 'DEV_01', ttl_minutes: 5 }),
  });
  const createCodeJson = await createCodeRes.json();
  const code = createCodeJson?.data?.code;

  const verifyRes = await fetch(`${API}/api/consent/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${doctorToken}`,
    },
    body: JSON.stringify({ code }),
  });
  const verifyJson = await verifyRes.json();
  const consentToken = verifyJson?.data?.session_token;

  const [historyRes, trendsRes, clinicalRes] = await Promise.all([
    fetch(`${API}/api/health/history/DEV_01?limit=50`, {
      headers: {
        Authorization: `Bearer ${doctorToken}`,
        'x-consent-session-token': consentToken,
      },
    }),
    fetch(`${API}/api/health/trends/DEV_01?hours=24&bucket_minutes=15`, {
      headers: {
        Authorization: `Bearer ${doctorToken}`,
        'x-consent-session-token': consentToken,
      },
    }),
    fetch(`${API}/api/health/clinical-summary/DEV_01?hours=24`, {
      headers: {
        Authorization: `Bearer ${doctorToken}`,
        'x-consent-session-token': consentToken,
      },
    }),
  ]);

  const history = await historyRes.json();
  const trends = await trendsRes.json();
  const clinical = await clinicalRes.json();

  console.log(JSON.stringify({
    code,
    verifyStatus: verifyRes.status,
    historyCount: Array.isArray(history) ? history.length : null,
    trendCount: Array.isArray(trends) ? trends.length : null,
    latestHistoryTime: Array.isArray(history) && history[0] ? history[0].time : null,
    firstTrendBucket: Array.isArray(trends) && trends[0] ? trends[0].bucket_time : null,
    clinicalLatestTime: clinical?.latest?.time || null,
    clinicalSampleCount: clinical?.stats?.sample_count || null,
  }, null, 2));
})().catch((err) => {
  console.error('check_doctor_windowed_data failed:', err.message);
  process.exit(1);
});
