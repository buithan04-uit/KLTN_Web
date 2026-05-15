exports.up = (pgm) => {
    // Thêm cột id SERIAL làm PK mới
    pgm.addColumns('access_codes', {
        id: { type: 'serial' }
    });

    // Bỏ PK cũ (code) và chuyển sang id
    pgm.dropConstraint('access_codes', 'access_codes_pkey');
    pgm.addConstraint('access_codes', 'access_codes_pkey', { primaryKey: 'id' });
    pgm.createIndex('access_codes', 'code', { unique: true });

    // Thêm các cột tracking
    pgm.addColumns('access_codes', {
        created_by: {
            type: 'integer',
            references: 'users(id)',
            onDelete: 'SET NULL'
        },
        used_by: {
            type: 'integer',
            references: 'users(id)',
            onDelete: 'SET NULL'
        },
        used_at: { type: 'timestamptz' },
        is_used: { type: 'boolean', notNull: true, default: false },
        created_at: { type: 'timestamptz', default: pgm.func('NOW()') }
    });
};

exports.down = (pgm) => {
    pgm.dropColumns('access_codes', [
        'created_by', 'used_by', 'used_at', 'is_used', 'created_at'
    ]);

    pgm.dropIndex('access_codes', 'code');
    pgm.dropConstraint('access_codes', 'access_codes_pkey');
    pgm.addConstraint('access_codes', 'access_codes_pkey', { primaryKey: 'code' });

    pgm.dropColumns('access_codes', ['id']);
};
