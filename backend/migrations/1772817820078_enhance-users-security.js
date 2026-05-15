exports.shorthands = undefined;

exports.up = (pgm) => {
    pgm.addColumns('users', {
        phone: { type: 'text' },
        is_active: { type: 'boolean', default: true, notNull: true },
        is_verified: { type: 'boolean', default: false, notNull: true },
        last_login_at: { type: 'timestamptz' },
        updated_at: { type: 'timestamptz', default: pgm.func('NOW()') },
        failed_login_attempts: { type: 'integer', default: 0, notNull: true },
        locked_until: { type: 'timestamptz' },
    });
};

exports.down = (pgm) => {
    pgm.dropColumns('users', [
        'phone',
        'is_active',
        'is_verified',
        'last_login_at',
        'updated_at',
        'failed_login_attempts',
        'locked_until',
    ]);
};
