-- Seed data: chỉ tạo 1 tài khoản admin
-- Account: than.95.cvan@gmail.com / Th06092k4@

BEGIN;

INSERT INTO users (
  email, password, role, full_name, phone,
  is_active, is_verified
)
VALUES (
  'than.95.cvan@gmail.com',
  '$2b$10$zA29qC/C3xOi4CWThIDIZO1NLX1hz5QajD5mpsfZjkdxGioMRQEu.', -- Th06092k4@
  'admin',
  'System Admin',
  '0900000001',
  true,
  true
)
ON CONFLICT (email)
DO UPDATE SET
  password    = EXCLUDED.password,
  role        = EXCLUDED.role,
  full_name   = EXCLUDED.full_name,
  phone       = EXCLUDED.phone,
  is_active   = EXCLUDED.is_active,
  is_verified = EXCLUDED.is_verified,
  updated_at  = NOW();

COMMIT;
