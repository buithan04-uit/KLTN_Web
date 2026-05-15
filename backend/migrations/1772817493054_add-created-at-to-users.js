exports.shorthands = undefined;

// UP = thêm cột created_at, mặc định là thời gian hiện tại
exports.up = (pgm) => {
    pgm.addColumns('users', {
        created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
    });
};

// DOWN = xóa cột created_at (hoàn tác)
exports.down = (pgm) => {
    pgm.dropColumns('users', ['created_at']);
};
