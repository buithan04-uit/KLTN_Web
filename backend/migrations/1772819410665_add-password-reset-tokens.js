/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.up = (pgm) => {
    pgm.createTable('password_reset_tokens', {
        id: { type: 'serial', primaryKey: true },
        user_id: {
            type: 'integer',
            notNull: true,
            references: 'users(id)',
            onDelete: 'CASCADE'
        },
        // Lưu hash của token, không lưu plaintext
        token_hash: { type: 'text', notNull: true, unique: true },
        expires_at: { type: 'timestamptz', notNull: true },
        used_at: { type: 'timestamptz' },
        created_at: { type: 'timestamptz', default: pgm.func('NOW()') }
    });

    pgm.createIndex('password_reset_tokens', 'user_id', {
        name: 'idx_prt_user_id'
    });
    pgm.createIndex('password_reset_tokens', 'expires_at', {
        name: 'idx_prt_expires_at'
    });
};

exports.down = (pgm) => {
    pgm.dropTable('password_reset_tokens');
};
