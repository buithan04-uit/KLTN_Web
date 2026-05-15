exports.up = (pgm) => {
    pgm.addColumns('devices', {
        name: { type: 'text' },
        type: { type: 'varchar(30)', default: 'wearable' },
        firmware_version: { type: 'text' },
        last_seen_at: { type: 'timestamptz' },
        is_active: { type: 'boolean', notNull: true, default: true },
        created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
        updated_at: { type: 'timestamptz', default: pgm.func('NOW()') }
    });
};

exports.down = (pgm) => {
    pgm.dropColumns('devices', [
        'name', 'type', 'firmware_version', 'last_seen_at',
        'is_active', 'created_at', 'updated_at'
    ]);
};
