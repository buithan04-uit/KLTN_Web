/* Migration to seed admin and sample patient accounts */

const bcrypt = require('bcryptjs');

exports.shorthands = undefined;

exports.up = async (pgm) => {
  // Hash passwords synchronously
  const adminPassword = bcrypt.hashSync('admin123', 10);
  const doctorPassword = bcrypt.hashSync('doctor123', 10);
  const patientPassword = bcrypt.hashSync('patient123', 10);

  // Helper to escape single quotes in SQL strings
  const escape = (str) => str?.replace(/'/g, "''") ?? '';

  // Insert admin account
  await pgm.db.query(`
    INSERT INTO users (
      email, password, full_name, role, is_verified, is_active,
      first_name, last_name, phone, date_of_birth, blood_type, height, weight,
      underlying_conditions, avatar_url, created_at, updated_at
    ) VALUES (
      'admin@iotHealth.local',
      '${escape(adminPassword)}',
      'Administrator',
      'admin',
      true,
      true,
      'Admin',
      'System',
      '0900000000',
      '1990-01-01',
      'O+',
      170.0,
      70.0,
      'None',
      NULL,
      NOW(),
      NOW()
    )
    ON CONFLICT (email) DO NOTHING;
  `);

  // Insert sample doctor account
  await pgm.db.query(`
    INSERT INTO users (
      email, password, full_name, role, is_verified, is_active,
      first_name, last_name, phone, date_of_birth, blood_type, height, weight,
      underlying_conditions, avatar_url, created_at, updated_at
    ) VALUES (
      'doctor@iotHealth.local',
      '${escape(doctorPassword)}',
      'Th.S Bác sĩ Nguyễn Văn A',
      'doctor',
      true,
      true,
      'Nguyễn',
      'Văn A',
      '0901234567',
      '1985-05-15',
      'A+',
      175.0,
      72.0,
      'None',
      NULL,
      NOW(),
      NOW()
    )
    ON CONFLICT (email) DO NOTHING;
  `);

  // Insert sample patient account
  await pgm.db.query(`
    INSERT INTO users (
      email, password, full_name, role, is_verified, is_active,
      first_name, last_name, phone, date_of_birth, blood_type, height, weight,
      underlying_conditions, avatar_url, created_at, updated_at
    ) VALUES (
      'patient@iotHealth.local',
      '${escape(patientPassword)}',
      'Trần Thị B',
      'patient',
      true,
      true,
      'Trần',
      'Thị B',
      '0987654321',
      '1995-08-20',
      'B+',
      160.0,
      55.0,
      'Tiểu đường type 2, Huyết áp cao',
      NULL,
      NOW(),
      NOW()
    )
    ON CONFLICT (email) DO NOTHING;
  `);

  console.log('✓ Seeded admin, doctor, and patient accounts');
};

exports.down = async (pgm) => {
  await pgm.sql(`
    DELETE FROM users WHERE email IN (
      'admin@iotHealth.local',
      'doctor@iotHealth.local',
      'patient@iotHealth.local'
    );
  `);
  console.log('✓ Removed seed accounts');
};
