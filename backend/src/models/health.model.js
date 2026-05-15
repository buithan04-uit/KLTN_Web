const db = require('../config/db');

const normalizeEcgPoints = (ecg_points) => {
    if (!Array.isArray(ecg_points)) return null;
    const normalized = ecg_points
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v));
    if (normalized.length === 0) return null;
    return normalized;
};

const HealthModel = {
    insert: async ({ device_id, heart_rate, spo2, temperature, ecg_value, ecg_points, session_id }) => {
        const normalizedPoints = normalizeEcgPoints(ecg_points);
        const derivedEcgValue = normalizedPoints
            ? normalizedPoints[normalizedPoints.length - 1]
            : (Number.isFinite(Number(ecg_value)) ? Number(ecg_value) : null);

        const result = await db.query(
            `INSERT INTO health_data (time, device_id, heart_rate, spo2, temperature, ecg_value, ecg_points, session_id)
             VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [
                device_id,
                heart_rate,
                spo2,
                temperature,
                derivedEcgValue,
                normalizedPoints ? JSON.stringify(normalizedPoints) : null,
                session_id,
            ]
        );
        return result.rows[0];
    },

    getHistory: async (device_id, limit = 50, since = null) => {
        const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Number(limit), 500)) : 50;
        const sinceDate = since ? new Date(since) : null;

        const result = sinceDate && !Number.isNaN(sinceDate.getTime())
            ? await db.query(
                `SELECT time, device_id, heart_rate, spo2, temperature, ecg_value, ecg_points, session_id, is_abnormal, note
                 FROM health_data
                 WHERE device_id = $1
                   AND time >= $3
                 ORDER BY time DESC
                 LIMIT $2`,
                [device_id, safeLimit, sinceDate]
            )
            : await db.query(
                `SELECT time, device_id, heart_rate, spo2, temperature, ecg_value, ecg_points, session_id, is_abnormal, note
                 FROM health_data
                 WHERE device_id = $1
                 ORDER BY time DESC
                 LIMIT $2`,
                [device_id, safeLimit]
            );
        return result.rows;
    },

    getBySession: async (session_id) => {
        const result = await db.query(
            `SELECT time, device_id, heart_rate, spo2, temperature, ecg_value, ecg_points, session_id, is_abnormal, note
             FROM health_data
             WHERE session_id = $1
             ORDER BY time ASC`,
            [session_id]
        );
        return result.rows;
    },

    getAbnormal: async (device_id, since = null) => {
        const sinceDate = since ? new Date(since) : null;
        const result = sinceDate && !Number.isNaN(sinceDate.getTime())
            ? await db.query(
                `SELECT time, device_id, heart_rate, spo2, temperature, ecg_value, ecg_points, session_id, is_abnormal, note
                 FROM health_data
                 WHERE device_id = $1
                   AND is_abnormal = true
                   AND time >= $2
                 ORDER BY time DESC`,
                [device_id, sinceDate]
            )
            : await db.query(
                `SELECT time, device_id, heart_rate, spo2, temperature, ecg_value, ecg_points, session_id, is_abnormal, note
                 FROM health_data
                 WHERE device_id = $1 AND is_abnormal = true
                 ORDER BY time DESC`,
                [device_id]
            );
        return result.rows;
    },

    getTrends: async (device_id, hours = 24, bucket_minutes = 15, since = null) => {
        const safeHours = Number.isFinite(hours) ? Math.max(1, Math.min(hours, 168)) : 24;
        const safeBucket = Number.isFinite(bucket_minutes) ? Math.max(1, Math.min(bucket_minutes, 60)) : 15;

        const result = await db.query(
            `SELECT bucket_time, avg_heart_rate, min_spo2, avg_temperature, ecg_samples, abnormal_count
             FROM get_health_trends($1, $2, $3)`,
            [device_id, safeHours, safeBucket]
        );
        const sinceDate = since ? new Date(since) : null;
        if (sinceDate && !Number.isNaN(sinceDate.getTime())) {
            return result.rows.filter((row) => {
                if (!row.bucket_time) return false;
                return new Date(row.bucket_time).getTime() >= sinceDate.getTime();
            });
        }
        return result.rows;
    },

    getClinicalSummary: async (device_id, hours = 24, since = null) => {
        const safeHours = Number.isFinite(hours) ? Math.max(1, Math.min(hours, 168)) : 24;
        const sinceDate = since ? new Date(since) : null;
        const hasValidSince = Boolean(sinceDate && !Number.isNaN(sinceDate.getTime()));

        const latestResult = hasValidSince
            ? await db.query(
                `SELECT time, device_id, heart_rate, spo2, temperature, ecg_value, ecg_points, is_abnormal, note, session_id
                 FROM health_data
                 WHERE device_id = $1
                   AND time >= $2
                 ORDER BY time DESC
                 LIMIT 1`,
                [device_id, sinceDate]
            )
            : await db.query(
                `SELECT time, device_id, heart_rate, spo2, temperature, ecg_value, ecg_points, is_abnormal, note, session_id
                 FROM health_data
                 WHERE device_id = $1
                 ORDER BY time DESC
                 LIMIT 1`,
                [device_id]
            );

        const statsResult = hasValidSince
            ? await db.query(
                `SELECT
                    COUNT(*) AS sample_count,
                    COUNT(*) FILTER (WHERE is_abnormal = true) AS abnormal_count,
                    AVG(heart_rate) AS avg_heart_rate,
                    MIN(spo2) AS min_spo2,
                    MAX(temperature) AS max_temperature
                 FROM health_data
                 WHERE device_id = $1
                   AND time >= NOW() - make_interval(hours => $2)
                   AND time >= $3`,
                [device_id, safeHours, sinceDate]
            )
            : await db.query(
                `SELECT
                    COUNT(*) AS sample_count,
                    COUNT(*) FILTER (WHERE is_abnormal = true) AS abnormal_count,
                    AVG(heart_rate) AS avg_heart_rate,
                    MIN(spo2) AS min_spo2,
                    MAX(temperature) AS max_temperature
                 FROM health_data
                 WHERE device_id = $1
                   AND time >= NOW() - make_interval(hours => $2)`,
                [device_id, safeHours]
            );

        return {
            latest: latestResult.rows[0] || null,
            stats: statsResult.rows[0] || null,
        };
    },

    markAbnormal: async (time, device_id, note) => {
        await db.query(
            `UPDATE health_data
             SET is_abnormal = true, note = $3
             WHERE time = $1 AND device_id = $2`,
            [time, device_id, note]
        );
    }
};

module.exports = HealthModel;
