exports.up = (pgm) => {
    pgm.addColumns('health_data', {
        ecg_points: { type: 'jsonb' },
    });
};

exports.down = (pgm) => {
    pgm.dropColumns('health_data', ['ecg_points']);
};
