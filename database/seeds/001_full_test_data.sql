-- Full seed data for multi-flow testing
-- Accounts:
--   admin01@telehealth.test  / Admin@123
--   doctor01@telehealth.test / Doctor@123
--   doctor02@telehealth.test / Doctor@123
--   patient01@telehealth.test / Patient@123
--   patient02@telehealth.test / Patient@123

BEGIN;

-- 1) Users (including v2 profile fields: first_name/last_name, patient-health, doctor-pro, admin-dept)
INSERT INTO users (
  email, password, role, full_name, phone, gender, is_active, is_verified,
  first_name, last_name, date_of_birth,
  blood_type, height, weight, underlying_conditions,
  specialty, license_number, workplace, bio,
  department
)
VALUES
  (
    'admin01@telehealth.test',
    '$2b$10$0nm5liRaod/WAcIck38IMuWboA5c4AVklr3Lisfp.TCjpCHSrywea',
    'admin', 'System Admin', '0900000001', 'other', true, true,
    'System', 'Admin', NULL,
    NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, 'Quản trị viên hệ thống TeleHealth.',
    'CNTT - Vận hành hệ thống'
  ),
  (
    'doctor01@telehealth.test',
    '$2b$10$w9ZPqSzxk6gmwuIGMjnUXO.tf..lqe1furR0GZGPsT38.Ay2C9XEy',
    'doctor', 'Doctor One', '0900000002', 'male', true, true,
    'Nguyễn Văn', 'Bác Sĩ', '1980-05-15',
    NULL, NULL, NULL, NULL,
    'Tim mạch', '001234/BYT-CCHN', 'Bệnh viện Bạch Mai', 'Chuyên gia tim mạch với 15 năm kinh nghiệm.',
    NULL
  ),
  (
    'doctor02@telehealth.test',
    '$2b$10$w9ZPqSzxk6gmwuIGMjnUXO.tf..lqe1furR0GZGPsT38.Ay2C9XEy',
    'doctor', 'Doctor Two', '0900000003', 'female', true, true,
    'Trần Thị', 'Y Khoa', '1985-08-20',
    NULL, NULL, NULL, NULL,
    'Nội tâm mạch', '005678/BYT-CCHN', 'Bệnh viện Chợ Rẫy', 'Bác sĩ nội trú chuyên nội tâm mạch.',
    NULL
  ),
  (
    'patient01@telehealth.test',
    '$2b$10$9UYOWuQD790TY0RTJIFaIu06a6RBUL5uZOM3t3lXmVuL9JIoosJmO',
    'patient', 'Patient One', '0900000004', 'male', true, true,
    'Lê Văn', 'Bệnh Nhân', '1990-03-10',
    'A+', 170.5, 68.0, 'Tiểu đường type 2, Huyết áp cao',
    NULL, NULL, NULL, NULL,
    NULL
  ),
  (
    'patient02@telehealth.test',
    '$2b$10$9UYOWuQD790TY0RTJIFaIu06a6RBUL5uZOM3t3lXmVuL9JIoosJmO',
    'patient', 'Patient Two', '0900000005', 'female', true, true,
    'Phạm Thị', 'Hai', '1995-11-25',
    'O-', 162.0, 55.5, 'Hen suyễn nhẹ',
    NULL, NULL, NULL, NULL,
    NULL
  ),
  -- patient03: active, has DEV_05 (long offline), no doctor session yet → "no monitoring" scenario
  (
    'patient03@telehealth.test',
    '$2b$10$w9ZPqSzxk6gmwuIGMjnUXO.tf..lqe1furR0GZGPsT38.Ay2C9XEy',
    'patient', 'Patient Three', '0900000006', 'female', true, true,
    'Nguyễn Thị', 'Ba', '1988-07-22',
    'B+', 165.0, 60.0, 'Tiểu đường type 1',
    NULL, NULL, NULL, NULL,
    NULL
  ),
  -- patient04: is_active=false → locked/disabled account scenario
  (
    'patient04@telehealth.test',
    '$2b$10$w9ZPqSzxk6gmwuIGMjnUXO.tf..lqe1furR0GZGPsT38.Ay2C9XEy',
    'patient', 'Patient Four', '0900000007', 'male', false, true,
    'Hoàng Văn', 'Bốn', '2000-01-15',
    'AB+', 175.0, 72.0, NULL,
    NULL, NULL, NULL, NULL,
    NULL
  ),
  -- doctor03: active, no current monitoring sessions → empty doctor-monitor scenario
  (
    'doctor03@telehealth.test',
    '$2b$10$w9ZPqSzxk6gmwuIGMjnUXO.tf..lqe1furR0GZGPsT38.Ay2C9XEy',
    'doctor', 'Doctor Three', '0900000008', 'female', true, true,
    'Lê Thị', 'Ba', '1978-09-10',
    NULL, NULL, NULL, NULL,
    'Nội khoa', '009012/BYT-CCHN', 'Bệnh viện Việt Đức', 'Bác sĩ nội khoa.',
    NULL
  )
ON CONFLICT (email)
DO UPDATE SET
  password = EXCLUDED.password,
  role = EXCLUDED.role,
  full_name = EXCLUDED.full_name,
  phone = EXCLUDED.phone,
  gender = EXCLUDED.gender,
  is_active = EXCLUDED.is_active,
  is_verified = EXCLUDED.is_verified,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  date_of_birth = EXCLUDED.date_of_birth,
  blood_type = EXCLUDED.blood_type,
  height = EXCLUDED.height,
  weight = EXCLUDED.weight,
  underlying_conditions = EXCLUDED.underlying_conditions,
  specialty = EXCLUDED.specialty,
  license_number = EXCLUDED.license_number,
  workplace = EXCLUDED.workplace,
  bio = EXCLUDED.bio,
  department = EXCLUDED.department,
  updated_at = NOW();

-- 2) Devices
WITH p1 AS (
  SELECT id AS owner_id FROM users WHERE email = 'patient01@telehealth.test'
),
p2 AS (
  SELECT id AS owner_id FROM users WHERE email = 'patient02@telehealth.test'
),
p3 AS (
  SELECT id AS owner_id FROM users WHERE email = 'patient03@telehealth.test'
)
INSERT INTO devices (device_id, owner_id, name, type, status, firmware_version, is_active, last_seen_at)
VALUES
  ('DEV_01', (SELECT owner_id FROM p1), 'Patient One Main Wearable', 'wearable', 'online', '1.2.0', true, NOW() - INTERVAL '30 seconds'),
  ('DEV_02', (SELECT owner_id FROM p1), 'Patient One Backup Sensor', 'wearable', 'offline', '1.1.5', true, NOW() - INTERVAL '3 hours'),
  ('DEV_03', (SELECT owner_id FROM p2), 'Patient Two Smart Band', 'wearable', 'online', '1.3.1', true, NOW() - INTERVAL '20 seconds'),
  ('DEV_04', NULL, 'Unassigned Demo Device', 'wearable', 'offline', '1.0.9', false, NOW() - INTERVAL '2 days'),
  -- DEV_05: patient03's device, offline for 2 days → historical data only scenario
  ('DEV_05', (SELECT owner_id FROM p3), 'Patient Three Smart Watch', 'wearable', 'offline', '1.2.5', true, NOW() - INTERVAL '2 days'),
  -- DEV_06: patient01's second device, offline 2 hours → recently went offline scenario
  ('DEV_06', (SELECT owner_id FROM p1), 'Patient One Extra Sensor', 'wearable', 'offline', '1.1.0', true, NOW() - INTERVAL '2 hours')
ON CONFLICT (device_id)
DO UPDATE SET
  owner_id = EXCLUDED.owner_id,
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  status = EXCLUDED.status,
  firmware_version = EXCLUDED.firmware_version,
  is_active = EXCLUDED.is_active,
  last_seen_at = EXCLUDED.last_seen_at,
  updated_at = NOW();

-- 3) Health data (clean old seed rows first)
DELETE FROM health_data
WHERE device_id IN ('DEV_01', 'DEV_02', 'DEV_03', 'DEV_05', 'DEV_06')
  AND note = 'seed.full-test-data';

INSERT INTO health_data (time, device_id, heart_rate, spo2, temperature, ecg_value, systolic_bp, diastolic_bp, map, session_id, is_abnormal, note)
SELECT
  ts,
  device_id,
  hr,
  spo2,
  temp,
  ecg,
  120,
  80,
  93.3,
  session_uuid,
  (hr < 55 OR hr > 120 OR spo2 < 93 OR temp > 38.2) AS is_abnormal,
  'seed.full-test-data' AS note
FROM (
  SELECT
    gs AS ts,
    d.device_id,
    CASE
      WHEN d.device_id = 'DEV_01' THEN ROUND((75 + 20 * SIN(EXTRACT(EPOCH FROM gs) / 1800))::numeric, 1)
      WHEN d.device_id = 'DEV_02' THEN ROUND((82 + 25 * SIN(EXTRACT(EPOCH FROM gs) / 1600))::numeric, 1)
      ELSE ROUND((72 + 18 * SIN(EXTRACT(EPOCH FROM gs) / 1700))::numeric, 1)
    END AS hr,
    CASE
      WHEN d.device_id = 'DEV_01' THEN ROUND((97 - ABS(2 * SIN(EXTRACT(EPOCH FROM gs) / 2200)))::numeric, 1)
      WHEN d.device_id = 'DEV_02' THEN ROUND((95 - ABS(3 * SIN(EXTRACT(EPOCH FROM gs) / 2000)))::numeric, 1)
      ELSE ROUND((98 - ABS(2 * SIN(EXTRACT(EPOCH FROM gs) / 2400)))::numeric, 1)
    END AS spo2,
    CASE
      WHEN d.device_id = 'DEV_02' THEN ROUND((37.0 + 1.4 * ABS(SIN(EXTRACT(EPOCH FROM gs) / 2600)))::numeric, 2)
      ELSE ROUND((36.5 + 0.8 * ABS(SIN(EXTRACT(EPOCH FROM gs) / 2800)))::numeric, 2)
    END AS temp,
    ROUND((0.9 * SIN(EXTRACT(EPOCH FROM gs) / 12))::numeric, 4) AS ecg,
    CASE
      WHEN d.device_id = 'DEV_01' THEN '11111111-1111-1111-1111-111111111111'::uuid
      WHEN d.device_id = 'DEV_02' THEN '22222222-2222-2222-2222-222222222222'::uuid
      ELSE '33333333-3333-3333-3333-333333333333'::uuid
    END AS session_uuid
  FROM generate_series(NOW() - INTERVAL '24 hours', NOW(), INTERVAL '5 minutes') AS gs
  CROSS JOIN (VALUES ('DEV_01'), ('DEV_02'), ('DEV_03')) AS d(device_id)
) x;

-- 3b) DEV_01: critical alarm scenario — last 30 min with dangerous vitals
INSERT INTO health_data (time, device_id, heart_rate, spo2, temperature, ecg_value, systolic_bp, diastolic_bp, map, session_id, is_abnormal, note)
SELECT
  gs AS time,
  'DEV_01' AS device_id,
  ROUND((138 + 12 * SIN(EXTRACT(EPOCH FROM gs) / 90))::numeric, 1) AS heart_rate,
  ROUND((88 + 4 * ABS(SIN(EXTRACT(EPOCH FROM gs) / 120)))::numeric, 1) AS spo2,
  ROUND((39.4 + 0.6 * ABS(SIN(EXTRACT(EPOCH FROM gs) / 200)))::numeric, 2) AS temperature,
  ROUND((1.2 * SIN(EXTRACT(EPOCH FROM gs) / 12))::numeric, 4) AS ecg_value,
  145 AS systolic_bp,
  95 AS diastolic_bp,
  111.7 AS map,
  '11111111-1111-1111-1111-111111111111'::uuid AS session_id,
  true AS is_abnormal,
  'seed.full-test-data' AS note
FROM generate_series(NOW() - INTERVAL '30 minutes', NOW(), INTERVAL '2 minutes') AS gs;

-- 3c) DEV_05: historical data from 7 to 5 days ago (patient offline since) — normal values
INSERT INTO health_data (time, device_id, heart_rate, spo2, temperature, ecg_value, systolic_bp, diastolic_bp, map, session_id, is_abnormal, note)
SELECT
  gs AS time,
  'DEV_05' AS device_id,
  ROUND((71 + 10 * SIN(EXTRACT(EPOCH FROM gs) / 1800))::numeric, 1) AS heart_rate,
  ROUND((97 - ABS(SIN(EXTRACT(EPOCH FROM gs) / 2400)))::numeric, 1) AS spo2,
  ROUND((36.6 + 0.5 * ABS(SIN(EXTRACT(EPOCH FROM gs) / 2800)))::numeric, 2) AS temperature,
  ROUND((0.85 * SIN(EXTRACT(EPOCH FROM gs) / 12))::numeric, 4) AS ecg_value,
  118 AS systolic_bp,
  76 AS diastolic_bp,
  90 AS map,
  NULL AS session_id,
  false AS is_abnormal,
  'seed.full-test-data' AS note
FROM generate_series(NOW() - INTERVAL '7 days', NOW() - INTERVAL '5 days', INTERVAL '10 minutes') AS gs;

-- 3d) DEV_06: data from 4 hours ago to 2 hours ago (went offline after) — mostly normal
INSERT INTO health_data (time, device_id, heart_rate, spo2, temperature, ecg_value, systolic_bp, diastolic_bp, map, session_id, is_abnormal, note)
SELECT
  gs AS time,
  'DEV_06' AS device_id,
  ROUND((79 + 14 * SIN(EXTRACT(EPOCH FROM gs) / 1600))::numeric, 1) AS heart_rate,
  ROUND((97 - ABS(1.5 * SIN(EXTRACT(EPOCH FROM gs) / 2200)))::numeric, 1) AS spo2,
  ROUND((36.8 + 0.4 * ABS(SIN(EXTRACT(EPOCH FROM gs) / 2600)))::numeric, 2) AS temperature,
  ROUND((0.9 * SIN(EXTRACT(EPOCH FROM gs) / 12))::numeric, 4) AS ecg_value,
  122 AS systolic_bp,
  78 AS diastolic_bp,
  92.7 AS map,
  'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid AS session_id,
  false AS is_abnormal,
  'seed.full-test-data' AS note
FROM generate_series(NOW() - INTERVAL '4 hours', NOW() - INTERVAL '2 hours', INTERVAL '5 minutes') AS gs;

-- 4) Access codes
WITH p1 AS (SELECT id AS patient_id FROM users WHERE email = 'patient01@telehealth.test'),
     p2 AS (SELECT id AS patient_id FROM users WHERE email = 'patient02@telehealth.test'),
     p3 AS (SELECT id AS patient_id FROM users WHERE email = 'patient03@telehealth.test')
INSERT INTO access_codes (code, device_id, patient_id, created_by, expires_at, is_used, created_at, used_by, used_at, revoked_at, note)
VALUES
  -- Active codes (ready to use for demo)
  ('123456', 'DEV_01', (SELECT patient_id FROM p1), (SELECT patient_id FROM p1), NOW() + INTERVAL '20 minutes', false, NOW() - INTERVAL '5 minutes', NULL, NULL, NULL, 'active seed code'),
  ('654321', 'DEV_03', (SELECT patient_id FROM p2), (SELECT patient_id FROM p2), NOW() + INTERVAL '15 minutes', false, NOW() - INTERVAL '2 minutes', NULL, NULL, NULL, 'active seed code'),
  ('333444', 'DEV_05', (SELECT patient_id FROM p3), (SELECT patient_id FROM p3), NOW() + INTERVAL '25 minutes', false, NOW() - INTERVAL '3 minutes', NULL, NULL, NULL, 'active seed code p3'),
  ('777888', 'DEV_06', (SELECT patient_id FROM p1), (SELECT patient_id FROM p1), NOW() + INTERVAL '20 minutes', false, NOW() - INTERVAL '1 minute', NULL, NULL, NULL, 'active seed code p1-dev6'),
  -- Expired code (test expiry check)
  ('111222', 'DEV_02', (SELECT patient_id FROM p1), (SELECT patient_id FROM p1), NOW() - INTERVAL '1 hour', true, NOW() - INTERVAL '3 hours', NULL, NOW() - INTERVAL '2 hours', NULL, 'expired seed code'),
  -- Used code (created the cccc session for doctor01 → DEV_06)
  ('444555', 'DEV_06', (SELECT patient_id FROM p1), (SELECT patient_id FROM p1), NOW() + INTERVAL '8 hours', true, NOW() - INTERVAL '3 hours', (SELECT patient_id FROM p1), NOW() - INTERVAL '3 hours', NULL, 'used seed code — created session cccc')
ON CONFLICT (code)
DO UPDATE SET
  device_id = EXCLUDED.device_id,
  patient_id = EXCLUDED.patient_id,
  created_by = EXCLUDED.created_by,
  expires_at = EXCLUDED.expires_at,
  is_used = EXCLUDED.is_used,
  created_at = EXCLUDED.created_at,
  used_by = EXCLUDED.used_by,
  used_at = EXCLUDED.used_at,
  revoked_at = EXCLUDED.revoked_at,
  note = EXCLUDED.note;

-- 5) Doctor access sessions
WITH d1 AS (SELECT id AS doctor_id FROM users WHERE email = 'doctor01@telehealth.test'),
     d2 AS (SELECT id AS doctor_id FROM users WHERE email = 'doctor02@telehealth.test'),
     p1 AS (SELECT id AS patient_id FROM users WHERE email = 'patient01@telehealth.test'),
     p2 AS (SELECT id AS patient_id FROM users WHERE email = 'patient02@telehealth.test'),
     ac1 AS (SELECT id FROM access_codes WHERE code = '123456'),
     ac2 AS (SELECT id FROM access_codes WHERE code = '654321'),
     ac3 AS (SELECT id FROM access_codes WHERE code = '444555')
INSERT INTO doctor_access_sessions (session_id, doctor_id, patient_id, device_id, access_code_id, issued_at, expires_at, revoked_at, revoked_by, revoke_reason, created_at)
VALUES
  -- aaaa: doctor01 → patient01 → DEV_01, active session (current monitoring)
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, (SELECT doctor_id FROM d1), (SELECT patient_id FROM p1), 'DEV_01', (SELECT id FROM ac1), NOW() - INTERVAL '10 minutes', NOW() + INTERVAL '20 minutes', NULL, NULL, NULL, NOW() - INTERVAL '10 minutes'),
  -- bbbb: doctor02 → patient02 → DEV_03, revoked session (tests revoke flow)
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, (SELECT doctor_id FROM d2), (SELECT patient_id FROM p2), 'DEV_03', (SELECT id FROM ac2), NOW() - INTERVAL '2 hours', NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '1 hour', (SELECT patient_id FROM p2), 'seed revoke', NOW() - INTERVAL '2 hours'),
  -- cccc: doctor01 → patient01 → DEV_06, active second session (multi-session scenario)
  ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, (SELECT doctor_id FROM d1), (SELECT patient_id FROM p1), 'DEV_06', (SELECT id FROM ac3), NOW() - INTERVAL '3 hours', NOW() + INTERVAL '5 hours', NULL, NULL, NULL, NOW() - INTERVAL '3 hours')
ON CONFLICT (session_id)
DO UPDATE SET
  doctor_id = EXCLUDED.doctor_id,
  patient_id = EXCLUDED.patient_id,
  device_id = EXCLUDED.device_id,
  access_code_id = EXCLUDED.access_code_id,
  issued_at = EXCLUDED.issued_at,
  expires_at = EXCLUDED.expires_at,
  revoked_at = EXCLUDED.revoked_at,
  revoked_by = EXCLUDED.revoked_by,
  revoke_reason = EXCLUDED.revoke_reason,
  created_at = EXCLUDED.created_at;

-- 6) Audit logs
DELETE FROM audit_logs WHERE action LIKE 'seed.%';

WITH a  AS (SELECT id FROM users WHERE email = 'admin01@telehealth.test'),
     d1 AS (SELECT id FROM users WHERE email = 'doctor01@telehealth.test'),
     d2 AS (SELECT id FROM users WHERE email = 'doctor02@telehealth.test'),
     p1 AS (SELECT id FROM users WHERE email = 'patient01@telehealth.test'),
     p3 AS (SELECT id FROM users WHERE email = 'patient03@telehealth.test')
INSERT INTO audit_logs (actor_id, actor_role, action, target_type, target_id, ip, user_agent, meta, created_at)
VALUES
  -- Consent flow: patient creates code, doctor verifies
  ((SELECT id FROM p1), 'patient', 'seed.consent.code.create', 'access_code', '123456', '127.0.0.1', 'seed-script', '{"device_id":"DEV_01"}', NOW() - INTERVAL '5 minutes'),
  ((SELECT id FROM d1), 'doctor',  'seed.consent.code.verify', 'access_code', '123456', '127.0.0.1', 'seed-script', '{"session_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', NOW() - INTERVAL '4 minutes'),
  -- Consent for DEV_06 (multi-session)
  ((SELECT id FROM p1), 'patient', 'seed.consent.code.create', 'access_code', '444555', '127.0.0.1', 'seed-script', '{"device_id":"DEV_06"}', NOW() - INTERVAL '3 hours 5 minutes'),
  ((SELECT id FROM d1), 'doctor',  'seed.consent.code.verify', 'access_code', '444555', '127.0.0.1', 'seed-script', '{"session_id":"cccccccc-cccc-cccc-cccc-cccccccccccc"}', NOW() - INTERVAL '3 hours'),
  -- Session revoke: patient02 revokes doctor02 access
  ((SELECT id FROM p3), 'patient', 'seed.consent.code.create', 'access_code', '333444', '127.0.0.1', 'seed-script', '{"device_id":"DEV_05"}', NOW() - INTERVAL '3 minutes'),
  -- Admin actions
  ((SELECT id FROM a), 'admin',   'seed.device.owner.assign', 'device', 'DEV_01', '127.0.0.1', 'seed-script', '{"owner_id":"patient01@telehealth.test"}', NOW() - INTERVAL '1 day'),
  ((SELECT id FROM a), 'admin',   'seed.device.owner.assign', 'device', 'DEV_05', '127.0.0.1', 'seed-script', '{"owner_id":"patient03@telehealth.test"}', NOW() - INTERVAL '8 days'),
  ((SELECT id FROM a), 'admin',   'seed.user.deactivate',     'user',   'patient04@telehealth.test', '127.0.0.1', 'seed-script', '{"reason":"account locked for testing"}', NOW() - INTERVAL '2 days'),
  -- Doctor profile update
  ((SELECT id FROM d1), 'doctor', 'seed.profile.update',      'user',   NULL, '127.0.0.1', 'seed-script', '{"fields":["bio","specialty"]}', NOW() - INTERVAL '12 hours'),
  -- Revoked session log
  ((SELECT id FROM d2), 'doctor', 'seed.consent.session.revoke', 'doctor_access_session', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '127.0.0.1', 'seed-script', '{"reason":"seed revoke"}', NOW() - INTERVAL '1 hour');

COMMIT;
