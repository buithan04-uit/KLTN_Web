/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
    // Kích hoạt TimescaleDB
    pgm.sql('CREATE EXTENSION IF NOT EXISTS timescaledb');

    // Bảng người dùng
    pgm.createTable('users', {
        id: 'id', // SERIAL PRIMARY KEY
        email: { type: 'text', notNull: true, unique: true },
        password: { type: 'text', notNull: true },
        role: { type: 'varchar(20)', default: "'patient'" },
        full_name: { type: 'text' },
    });

    // Bảng thiết bị
    pgm.createTable('devices', {
        device_id: { type: 'text', primaryKey: true },
        owner_id: { type: 'integer', references: 'users' },
        status: { type: 'text', default: "'offline'" },
    });

    // Bảng mã truy cập
    pgm.createTable('access_codes', {
        code: { type: 'varchar(6)', primaryKey: true },
        device_id: { type: 'text', references: 'devices' },
        expires_at: { type: 'timestamptz', notNull: true },
    });

    // Bảng sinh hiệu
    pgm.createTable('health_data', {
        time: { type: 'timestamptz', notNull: true },
        device_id: { type: 'text', notNull: true },
        heart_rate: { type: 'double precision' },
        spo2: { type: 'double precision' },
        temperature: { type: 'double precision' },
        ecg_value: { type: 'double precision' },
    });

    // Biến health_data thành Hypertable
    pgm.sql("SELECT create_hypertable('health_data', 'time')");
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
    pgm.dropTable('health_data');
    pgm.dropTable('access_codes');
    pgm.dropTable('devices');
    pgm.dropTable('users');
};
