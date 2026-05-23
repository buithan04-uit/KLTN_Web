exports.up = (pgm) => {
    pgm.createTable('ai_predictions', {
        id: 'id',
        health_time: { type: 'timestamptz' },
        device_id: { type: 'text', notNull: true, references: 'devices(device_id)', onDelete: 'CASCADE' },
        model_name: { type: 'text', notNull: true },
        prediction_label: { type: 'text', notNull: true },
        confidence: { type: 'double precision' },
        probabilities: { type: 'jsonb' },
        input_snapshot: { type: 'jsonb' },
        created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    });

    pgm.createIndex('ai_predictions', ['device_id', 'created_at']);
    pgm.createIndex('ai_predictions', ['model_name', 'created_at']);
};

exports.down = (pgm) => {
    pgm.dropTable('ai_predictions');
};
