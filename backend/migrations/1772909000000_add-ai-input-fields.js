exports.up = (pgm) => {
    pgm.addColumns('users', {
        gender: { type: 'varchar(20)' },
    });

    pgm.addColumns('health_data', {
        systolic_bp: { type: 'double precision' },
        diastolic_bp: { type: 'double precision' },
        map: { type: 'double precision' },
    });

    pgm.createIndex('health_data', ['device_id', 'time', 'map'], {
        name: 'idx_health_data_device_time_map',
    });
};

exports.down = (pgm) => {
    pgm.dropIndex('health_data', ['device_id', 'time', 'map'], {
        name: 'idx_health_data_device_time_map',
        ifExists: true,
    });
    pgm.dropColumns('health_data', ['systolic_bp', 'diastolic_bp', 'map']);
    pgm.dropColumns('users', ['gender']);
};
