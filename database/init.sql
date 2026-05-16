-- Kích hoạt TimescaleDB
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Bảng người dùng
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
    locked_until TIMESTAMPTZ
);

-- Bảng thiết bị
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

-- Bảng mã truy cập (Access Code)
CREATE TABLE access_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(6) UNIQUE NOT NULL,
    device_id TEXT REFERENCES devices(device_id),
    expires_at TIMESTAMPTZ NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    used_at TIMESTAMPTZ,
    is_used BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bảng sinh hiệu (Hypertable cho ECG)
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

-- Index cho health_data
CREATE INDEX idx_health_data_session_id ON health_data (session_id);
CREATE INDEX idx_health_data_is_abnormal ON health_data (is_abnormal);

-- Bảng token đặt lại mật khẩu
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
-- Consent-based access (Privacy Control)
-- ============================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE access_codes
    ADD COLUMN IF NOT EXISTS patient_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS note TEXT;

CREATE INDEX IF NOT EXISTS idx_access_codes_patient_id ON access_codes(patient_id);
CREATE INDEX IF NOT EXISTS idx_access_codes_code_expires ON access_codes(code, expires_at);

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
ALTER USER admin WITH PASSWORD '123456';
