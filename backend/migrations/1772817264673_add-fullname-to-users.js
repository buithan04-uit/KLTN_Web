/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

// UP = áp dụng thay đổi
exports.up = (pgm) => {
    pgm.addColumns('users', {
        full_name: { type: 'text' },
    });
};

// DOWN = hoàn tác (rollback)
exports.down = (pgm) => {
    pgm.dropColumns('users', ['full_name']);
};
