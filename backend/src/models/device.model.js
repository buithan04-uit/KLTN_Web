const db = require('../config/db');

const parsedOfflineThreshold = parseInt(process.env.DEVICE_OFFLINE_THRESHOLD_S || '60', 10);
const OFFLINE_THRESHOLD_S = Number.isFinite(parsedOfflineThreshold) && parsedOfflineThreshold > 0
        ? parsedOfflineThreshold
        : 60;

const effectiveStatusSql = (alias) => `
        CASE
            WHEN ${alias}.is_active = false THEN 'offline'
            WHEN ${alias}.last_seen_at IS NULL THEN 'offline'
            WHEN ${alias}.last_seen_at >= NOW() - INTERVAL '${OFFLINE_THRESHOLD_S} seconds' THEN 'online'
            ELSE 'offline'
        END
`;

const DeviceModel = {
    findById: async (device_id) => {
        const result = await db.query('SELECT * FROM devices WHERE device_id = $1', [device_id]);
        return result.rows[0] || null;
    },

    findByOwner: async (owner_id) => {
        const result = await db.query(
            'SELECT * FROM devices WHERE owner_id = $1 AND is_active = true ORDER BY created_at DESC',
            [owner_id]
        );
        return result.rows;
    },

    findOwnedDevices: async (owner_id, includeInactive = true) => {
        const query = includeInactive
            ? `SELECT d.*, ${effectiveStatusSql('d')} AS effective_status
               FROM devices d
               WHERE d.owner_id = $1
               ORDER BY d.created_at DESC`
            : `SELECT d.*, ${effectiveStatusSql('d')} AS effective_status
               FROM devices d
               WHERE d.owner_id = $1 AND d.is_active = true
               ORDER BY d.created_at DESC`;
        const result = await db.query(query, [owner_id]);
        return result.rows.map(({ effective_status, ...row }) => ({
            ...row,
            status: effective_status || row.status,
        }));
    },

    create: async ({ device_id, owner_id, name, type = 'wearable', firmware_version }) => {
        const result = await db.query(
            `INSERT INTO devices (device_id, owner_id, name, type, firmware_version)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [device_id, owner_id, name, type, firmware_version]
        );
        return result.rows[0];
    },

    createUnownedByAdmin: async ({ device_id, name, type = 'wearable' }) => {
        const result = await db.query(
            `INSERT INTO devices (device_id, owner_id, name, type)
             VALUES ($1, NULL, $2, $3)
             RETURNING *`,
            [device_id, name, type]
        );
        return result.rows[0] || null;
    },

    createOrClaim: async ({ device_id, owner_id, name, type = 'wearable', firmware_version }) => {
        const existing = await db.query('SELECT * FROM devices WHERE device_id = $1 LIMIT 1', [device_id]);
        const row = existing.rows[0];

        if (!row) {
            const created = await db.query(
                `INSERT INTO devices (device_id, owner_id, name, type, firmware_version)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING *`,
                [device_id, owner_id, name, type, firmware_version]
            );
            return created.rows[0] || null;
        }

        if (row.owner_id && row.owner_id !== owner_id) {
            return null;
        }

        const updated = await db.query(
            `UPDATE devices
             SET owner_id = $1,
                 name = COALESCE($2, name),
                 type = COALESCE($3, type),
                 firmware_version = COALESCE($4, firmware_version),
                 is_active = true,
                 updated_at = NOW()
             WHERE device_id = $5
             RETURNING *`,
            [owner_id, name || null, type || null, firmware_version || null, device_id]
        );
        return updated.rows[0] || null;
    },

    updateOwned: async ({ device_id, owner_id, name, type, firmware_version, is_active }) => {
        const updates = [];
        const params = [];
        let idx = 1;

        if (name !== undefined) {
            updates.push(`name = $${idx++}`);
            params.push(name);
        }
        if (type !== undefined) {
            updates.push(`type = $${idx++}`);
            params.push(type);
        }
        if (firmware_version !== undefined) {
            updates.push(`firmware_version = $${idx++}`);
            params.push(firmware_version);
        }
        if (is_active !== undefined) {
            updates.push(`is_active = $${idx++}`);
            params.push(is_active);
        }

        if (!updates.length) {
            const found = await db.query('SELECT * FROM devices WHERE device_id = $1 AND owner_id = $2', [device_id, owner_id]);
            return found.rows[0] || null;
        }

        updates.push('updated_at = NOW()');
        params.push(device_id, owner_id);

        const result = await db.query(
            `UPDATE devices
             SET ${updates.join(', ')}
             WHERE device_id = $${idx++}
               AND owner_id = $${idx}
             RETURNING *`,
            params
        );
        return result.rows[0] || null;
    },

    updateLastSeen: async (device_id) => {
        await db.query(
            `UPDATE devices
             SET last_seen_at = NOW(), status = 'online', updated_at = NOW()
             WHERE device_id = $1`,
            [device_id]
        );
    },

    updateStatus: async (device_id, status) => {
        await db.query(
            'UPDATE devices SET status = $1, updated_at = NOW() WHERE device_id = $2',
            [status, device_id]
        );
    },

    setActive: async (device_id, is_active) => {
        const result = await db.query(
            `UPDATE devices d
             SET is_active = $1, updated_at = NOW()
             FROM users u
             WHERE d.device_id = $2
               AND (d.owner_id = u.id OR d.owner_id IS NULL OR u.id IS NULL)
             RETURNING d.*, u.email AS owner_email, u.full_name AS owner_name`,
            [is_active, device_id]
        );
        return result.rows[0] || null;
    },

    listAdminDevices: async ({ page = 1, limit = 10, status = '', search = '' } = {}) => {
        const offset = (page - 1) * limit;
        const params = [];
        let where = 'WHERE 1=1';
        let idx = 1;

        if (status === 'online' || status === 'offline') {
            where += ` AND ${effectiveStatusSql('d')} = $${idx++}`;
            params.push(status);
        }

        if (search) {
            where += ` AND (d.device_id ILIKE $${idx} OR d.name ILIKE $${idx} OR u.email ILIKE $${idx})`;
            params.push(`%${search}%`);
            idx++;
        }

        const countResult = await db.query(
            `SELECT COUNT(*)::int AS count
             FROM devices d
             LEFT JOIN users u ON u.id = d.owner_id
             ${where}`,
            params
        );

        params.push(limit, offset);
        const rows = await db.query(
            `SELECT d.device_id, d.name, d.type, ${effectiveStatusSql('d')} AS status, d.firmware_version,
                    d.last_seen_at, d.is_active, d.owner_id, d.created_at, d.updated_at,
                    u.email AS owner_email, u.full_name AS owner_name
             FROM devices d
             LEFT JOIN users u ON u.id = d.owner_id
             ${where}
             ORDER BY d.created_at DESC
             LIMIT $${idx} OFFSET $${idx + 1}`,
            params
        );

        return {
            data: rows.rows,
            pagination: {
                page,
                limit,
                total: countResult.rows[0]?.count || 0,
                pages: Math.ceil((countResult.rows[0]?.count || 0) / limit),
            },
        };
    },

    assignOwner: async (device_id, owner_id) => {
        // PostgreSQL cannot infer $1 type from ($1 IS NULL) alone — split into two queries
        if (owner_id === null) {
            const result = await db.query(
                `UPDATE devices SET owner_id = NULL, updated_at = NOW()
                 WHERE device_id = $1
                 RETURNING *, NULL::text AS owner_email, NULL::text AS owner_name`,
                [device_id]
            );
            return result.rows[0] || null;
        }
        const result = await db.query(
            `WITH upd AS (
                 UPDATE devices SET owner_id = $1, updated_at = NOW()
                 WHERE device_id = $2 AND EXISTS (SELECT 1 FROM users WHERE id = $1)
                 RETURNING *
             )
             SELECT upd.*, u.email AS owner_email, u.full_name AS owner_name
             FROM upd
             LEFT JOIN users u ON u.id = upd.owner_id`,
            [owner_id, device_id]
        );
        return result.rows[0] || null;
    },

    unlinkOwned: async (device_id, owner_id) => {
        const result = await db.query(
            `UPDATE devices SET owner_id = NULL, updated_at = NOW()
             WHERE device_id = $1 AND owner_id = $2
             RETURNING *`,
            [device_id, owner_id]
        );
        return result.rows[0] || null;
    },

    listAvailable: async () => {
        const result = await db.query(
            `SELECT device_id, name, type, firmware_version, created_at
             FROM devices
             WHERE owner_id IS NULL AND is_active = true
             ORDER BY created_at DESC`
        );
        return result.rows;
    },

    getAdminOverview: async () => {
        const [users, devices, vitals, abnormal, consent, database] = await Promise.all([
            db.query(
                `SELECT COUNT(*)::int AS total_users,
                        COUNT(*) FILTER (WHERE is_active = true)::int AS active_users,
                        COUNT(*) FILTER (WHERE role = 'doctor')::int AS doctors,
                        COUNT(*) FILTER (WHERE role = 'patient')::int AS patients
                 FROM users`
            ),
            db.query(
                `SELECT COUNT(*)::int AS total_devices,
                        COUNT(*) FILTER (WHERE is_active = true)::int AS active_devices,
                        COUNT(*) FILTER (WHERE ${effectiveStatusSql('d')} = 'online')::int AS online_devices
                  FROM devices d`
            ),
            db.query(
                `SELECT COUNT(*)::int AS total_vitals,
                        COUNT(*) FILTER (WHERE time >= NOW() - INTERVAL '1 hour')::int AS vitals_last_hour
                 FROM health_data`
            ),
            db.query(
                `SELECT COUNT(*)::int AS abnormal_last_24h
                 FROM health_data
                 WHERE is_abnormal = true
                   AND time >= NOW() - INTERVAL '24 hour'`
            ),
            db.query(
                `SELECT COUNT(*)::int AS active_consent_sessions
                 FROM doctor_access_sessions
                 WHERE revoked_at IS NULL
                   AND expires_at > NOW()`
            ),
            db.query(`SELECT pg_database_size(current_database())::bigint AS database_size_bytes`),
        ]);

        return {
            users: users.rows[0],
            devices: devices.rows[0],
            vitals: vitals.rows[0],
            abnormal: abnormal.rows[0],
            consent: consent.rows[0],
            database: database.rows[0],
        };
    },

    listAuditLogs: async ({ page = 1, limit = 10, action = '', actor_role = '' } = {}) => {
        const offset = (page - 1) * limit;
        const params = [];
        let where = 'WHERE 1=1';
        let idx = 1;

        if (action) {
            where += ` AND action ILIKE $${idx++}`;
            params.push(`%${action}%`);
        }

        if (actor_role) {
            where += ` AND actor_role = $${idx++}`;
            params.push(actor_role);
        }

        const count = await db.query(`SELECT COUNT(*)::int AS count FROM audit_logs ${where}`, params);
        params.push(limit, offset);

        const rows = await db.query(
            `SELECT id, actor_id, actor_role, action, target_type, target_id, ip, user_agent, meta, created_at
             FROM audit_logs
             ${where}
             ORDER BY created_at DESC
             LIMIT $${idx} OFFSET $${idx + 1}`,
            params
        );

        return {
            data: rows.rows,
            pagination: {
                page,
                limit,
                total: count.rows[0]?.count || 0,
                pages: Math.ceil((count.rows[0]?.count || 0) / limit),
            },
        };
    }
};

module.exports = DeviceModel;
