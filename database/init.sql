-- Kích hoạt TimescaleDB
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- Bảng người dùng
-- ============================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role VARCHAR(20) DEFAULT 'patient', -- admin, doctor, patient
    full_name TEXT,
    phone TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    -- Profile fields
    first_name TEXT,
    last_name TEXT,
    date_of_birth DATE,
    avatar_url TEXT,
    -- Patient fields
    blood_type VARCHAR(10),
    height DOUBLE PRECISION,
    weight DOUBLE PRECISION,
    underlying_conditions TEXT,
    -- Doctor fields
    specialty TEXT,
    license_number TEXT,
    workplace TEXT,
    bio TEXT,
    -- Admin fields
    department TEXT
);

-- ============================================
-- Bảng thiết bị
-- ============================================
CREATE TABLE devices (
    device_id TEXT PRIMARY KEY,
    owner_id INTEGER REFERENCES users(id),
    name TEXT,
    type VARCHAR(30) DEFAULT 'wearable',
    status TEXT DEFAULT 'offline',
    firmware_version TEXT,
    last_seen_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Bảng mã truy cập (Access Code)
-- ============================================
CREATE TABLE access_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(6) UNIQUE NOT NULL,
    device_id TEXT REFERENCES devices(device_id),
    expires_at TIMESTAMPTZ NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    used_at TIMESTAMPTZ,
    is_used BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- Consent fields
    patient_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    revoked_at TIMESTAMPTZ,
    note TEXT
);

CREATE INDEX IF NOT EXISTS idx_access_codes_patient_id ON access_codes(patient_id);
CREATE INDEX IF NOT EXISTS idx_access_codes_code_expires ON access_codes(code, expires_at);
CREATE INDEX IF NOT EXISTS idx_access_codes_active ON access_codes(patient_id, revoked_at, expires_at);

-- ============================================
-- Bảng sinh hiệu (Hypertable cho ECG)
-- ============================================
CREATE TABLE health_data (
    time TIMESTAMPTZ NOT NULL,
    device_id TEXT NOT NULL,
    heart_rate DOUBLE PRECISION,
    spo2 DOUBLE PRECISION,
    temperature DOUBLE PRECISION,
    ecg_value DOUBLE PRECISION,
    ecg_points JSONB,
    session_id UUID,
    is_abnormal BOOLEAN NOT NULL DEFAULT false,
    note TEXT
);

-- Biến bảng health_data thành Hypertable
SELECT create_hypertable('health_data', 'time');

CREATE INDEX idx_health_data_session_id ON health_data (session_id);
CREATE INDEX idx_health_data_is_abnormal ON health_data (is_abnormal);
CREATE INDEX IF NOT EXISTS idx_health_data_device_time_desc ON health_data (device_id, time DESC);

-- ============================================
-- Bảng token đặt lại mật khẩu
-- ============================================
CREATE TABLE password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_prt_user_id ON password_reset_tokens (user_id);
CREATE INDEX idx_prt_token_hash ON password_reset_tokens (token_hash);

-- ============================================
-- Doctor access sessions (Consent-based)
-- ============================================
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

-- ============================================
-- Audit logs
-- ============================================
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

-- ============================================
-- Clinical analytics
-- ============================================
CREATE OR REPLACE FUNCTION get_health_trends(
  p_device_id TEXT,
  p_hours INTEGER DEFAULT 24,
  p_bucket_minutes INTEGER DEFAULT 15
)
RETURNS TABLE (
  bucket_time TIMESTAMPTZ,
  avg_heart_rate DOUBLE PRECISION,
  min_spo2 DOUBLE PRECISION,
  avg_temperature DOUBLE PRECISION,
  ecg_samples BIGINT,
  abnormal_count BIGINT
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    time_bucket(make_interval(mins => GREATEST(p_bucket_minutes, 1)), time) AS bucket_time,
    AVG(heart_rate) AS avg_heart_rate,
    MIN(spo2) AS min_spo2,
    AVG(temperature) AS avg_temperature,
    COUNT(ecg_value) AS ecg_samples,
    COUNT(*) FILTER (WHERE is_abnormal = true) AS abnormal_count
  FROM health_data
  WHERE device_id = p_device_id
    AND time >= NOW() - make_interval(hours => GREATEST(p_hours, 1))
  GROUP BY 1
  ORDER BY 1 ASC;
$$;

-- Đảm bảo password DB đúng
ALTER USER admin WITH PASSWORD '123456';
