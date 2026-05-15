-- Consent-Based Access migration
-- Apply to existing database: telehealth_system

BEGIN;

-- Ensure extension for UUID support
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Extend access_codes table for patient consent flow
ALTER TABLE access_codes
  ADD COLUMN IF NOT EXISTS patient_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS note TEXT;

-- Backward-compat: if old rows do not have patient_id, derive from device owner when possible
UPDATE access_codes ac
SET patient_id = d.owner_id
FROM devices d
WHERE ac.device_id = d.device_id
  AND ac.patient_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_access_codes_patient_id ON access_codes(patient_id);
CREATE INDEX IF NOT EXISTS idx_access_codes_code_expires ON access_codes(code, expires_at);
CREATE INDEX IF NOT EXISTS idx_access_codes_active ON access_codes(patient_id, revoked_at, expires_at);

-- Doctor temporary sessions created from consent code verification
CREATE TABLE IF NOT EXISTS doctor_access_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  access_code_id INTEGER REFERENCES access_codes(id) ON DELETE SET NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  revoke_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doctor_sessions_doctor ON doctor_access_sessions(doctor_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_doctor_sessions_patient ON doctor_access_sessions(patient_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_doctor_sessions_device ON doctor_access_sessions(device_id, expires_at);

-- Security and compliance audit trail
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(20),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  ip TEXT,
  user_agent TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

COMMIT;
