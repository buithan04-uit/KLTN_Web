exports.up = (pgm) => {
    pgm.addColumns('health_data', {
        session_id: { type: 'uuid' },
        is_abnormal: { type: 'boolean', notNull: true, default: false },
        note: { type: 'text' }
    });

    // Index để query nhanh theo session
    pgm.createIndex('health_data', 'session_id', {
        name: 'idx_health_data_session_id',
        ifNotExists: true
    });

    // Index để lọc nhanh các bản ghi bất thường
    pgm.createIndex('health_data', 'is_abnormal', {
        name: 'idx_health_data_is_abnormal',
        ifNotExists: true,
        method: 'btree'
    });
};

exports.down = (pgm) => {
    pgm.dropIndex('health_data', 'session_id', { name: 'idx_health_data_session_id' });
    pgm.dropIndex('health_data', 'is_abnormal', { name: 'idx_health_data_is_abnormal' });
    pgm.dropColumns('health_data', ['session_id', 'is_abnormal', 'note']);
};
