const db = require('../config/db');

const isMissingTableError = (err) => err?.code === '42P01';

const AiPredictionModel = {
    create: async ({
        health_time,
        device_id,
        model_name,
        prediction_label,
        confidence = null,
        probabilities = null,
        input_snapshot = null,
    }) => {
        try {
            const result = await db.query(
                `INSERT INTO ai_predictions
                    (health_time, device_id, model_name, prediction_label, confidence, probabilities, input_snapshot)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING *`,
                [
                    health_time || null,
                    device_id,
                    model_name,
                    prediction_label,
                    confidence,
                    probabilities ? JSON.stringify(probabilities) : null,
                    input_snapshot ? JSON.stringify(input_snapshot) : null,
                ]
            );
            return result.rows[0] || null;
        } catch (err) {
            if (isMissingTableError(err)) return null;
            throw err;
        }
    },

    listByDevice: async (device_id, {
        page = 1,
        limit = 20,
        model_name = '',
        requireEvidence = false,
    } = {}) => {
        const safePage = Math.max(Number(page) || 1, 1);
        const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
        const offset = (safePage - 1) * safeLimit;
        const params = [device_id];
        let where = 'WHERE device_id = $1';
        let idx = 2;

        if (model_name) {
            where += ` AND model_name = $${idx++}`;
            params.push(model_name);
        }

        if (requireEvidence) {
            where += ' AND input_snapshot IS NOT NULL';
        }

        try {
            const count = await db.query(
                `SELECT COUNT(*)::int AS count FROM ai_predictions ${where}`,
                params
            );

            params.push(safeLimit, offset);
            const rows = await db.query(
                `SELECT id, health_time, device_id, model_name, prediction_label,
                        confidence, probabilities, input_snapshot, created_at
                 FROM ai_predictions
                 ${where}
                 ORDER BY created_at DESC
                 LIMIT $${idx} OFFSET $${idx + 1}`,
                params
            );

            return {
                data: rows.rows,
                pagination: {
                    page: safePage,
                    limit: safeLimit,
                    total: count.rows[0]?.count || 0,
                    pages: Math.ceil((count.rows[0]?.count || 0) / safeLimit),
                },
            };
        } catch (err) {
            if (isMissingTableError(err)) {
                return {
                    data: [],
                    pagination: { page: safePage, limit: safeLimit, total: 0, pages: 0 },
                    warning: 'ai_predictions table is not migrated yet',
                };
            }
            throw err;
        }
    },
};

module.exports = AiPredictionModel;
