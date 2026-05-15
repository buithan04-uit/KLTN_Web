const db = require('../config/db');

const ConsentModel = {
    findPatientDevices: async (patientId) => {
        const result = await db.query(
            `SELECT device_id, name, status, owner_id, is_active
             FROM devices
             WHERE owner_id = $1 AND is_active = true
             ORDER BY created_at DESC`,
            [patientId]
        );
        return result.rows;
    },

    findAllPatientDevices: async (patientId) => {
        const result = await db.query(
            `SELECT device_id, name, status, owner_id, is_active
             FROM devices
             WHERE owner_id = $1
             ORDER BY created_at DESC`,
            [patientId]
        );
        return result.rows;
    },

    revokeOldCodesForDevice: async (patientId, deviceId) => {
        await db.query(
            `UPDATE access_codes
             SET revoked_at = NOW()
             WHERE patient_id = $1
               AND device_id = $2
               AND revoked_at IS NULL
               AND is_used = false
               AND expires_at > NOW()`,
            [patientId, deviceId]
        );
    },

    revokePendingCodesForPatient: async (patientId, exceptCodeId = null) => {
        if (exceptCodeId) {
            await db.query(
                `UPDATE access_codes
                 SET revoked_at = NOW()
                 WHERE patient_id = $1
                   AND id <> $2
                   AND revoked_at IS NULL
                   AND is_used = false
                   AND expires_at > NOW()`,
                [patientId, exceptCodeId]
            );
            return;
        }

        await db.query(
            `UPDATE access_codes
             SET revoked_at = NOW()
             WHERE patient_id = $1
               AND revoked_at IS NULL
               AND is_used = false
               AND expires_at > NOW()`,
            [patientId]
        );
    },

    createAccessCode: async ({ code, patientId, deviceId, expiresAt, createdBy }) => {
        const result = await db.query(
            `INSERT INTO access_codes (code, device_id, patient_id, created_by, expires_at, is_used)
             VALUES ($1, $2, $3, $4, $5, false)
             RETURNING id, code, device_id, patient_id, created_at, expires_at, revoked_at`,
            [code, deviceId, patientId, createdBy, expiresAt]
        );
        return result.rows[0] || null;
    },

    findActiveCodeByValue: async (code) => {
        const result = await db.query(
            `SELECT ac.id, ac.code, ac.device_id, ac.patient_id, ac.expires_at, ac.revoked_at,
                    u.full_name AS patient_name, u.date_of_birth,
                    d.name AS device_name, d.status AS device_status
             FROM access_codes ac
             JOIN users u ON u.id = ac.patient_id
             JOIN devices d ON d.device_id = ac.device_id
             WHERE ac.code = $1
               AND ac.revoked_at IS NULL
               AND ac.is_used = false
               AND ac.expires_at > NOW()
             ORDER BY ac.created_at DESC
             LIMIT 1`,
            [code]
        );
        return result.rows[0] || null;
    },

    touchAccessCodeUsage: async (accessCodeId, doctorId) => {
        await db.query(
            `UPDATE access_codes
             SET used_by = $1,
                 used_at = NOW(),
                 is_used = true,
                 revoked_at = NOW()
             WHERE id = $2`,
            [doctorId, accessCodeId]
        );
    },

    createDoctorSession: async ({ sessionId, doctorId, patientId, deviceId, accessCodeId, expiresAt }) => {
        const result = await db.query(
            `INSERT INTO doctor_access_sessions (session_id, doctor_id, patient_id, device_id, access_code_id, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING session_id, doctor_id, patient_id, device_id, access_code_id, issued_at, expires_at, revoked_at`,
            [sessionId, doctorId, patientId, deviceId, accessCodeId, expiresAt]
        );
        return result.rows[0] || null;
    },

    findActiveSessionById: async (sessionId) => {
        const result = await db.query(
            `SELECT session_id, doctor_id, patient_id, device_id, access_code_id, issued_at, expires_at, revoked_at
             FROM doctor_access_sessions
             WHERE session_id = $1
               AND revoked_at IS NULL
               AND expires_at > NOW()
             LIMIT 1`,
            [sessionId]
        );
        return result.rows[0] || null;
    },

    listActiveCodesByPatient: async (patientId, deviceId = '') => {
        const hasDeviceFilter = Boolean(deviceId);
        const params = hasDeviceFilter ? [patientId, deviceId] : [patientId];
        const deviceClause = hasDeviceFilter ? 'AND device_id = $2' : '';

        const result = await db.query(
            `SELECT id, code, device_id, created_at, expires_at
             FROM access_codes
             WHERE patient_id = $1
               ${deviceClause}
               AND revoked_at IS NULL
               AND is_used = false
               AND expires_at > NOW()
             ORDER BY created_at DESC`,
            params
        );
        return result.rows;
    },

    listActiveSessionsByPatient: async (patientId) => {
        const result = await db.query(
            `SELECT s.session_id, s.doctor_id, s.patient_id, s.device_id, s.issued_at, s.expires_at,
                    u.full_name AS doctor_name, u.email AS doctor_email
             FROM doctor_access_sessions s
             JOIN users u ON u.id = s.doctor_id
             WHERE s.patient_id = $1
               AND s.revoked_at IS NULL
               AND s.expires_at > NOW()
             ORDER BY s.issued_at DESC`,
            [patientId]
        );
        return result.rows;
    },

    revokeSessionByPatient: async ({ sessionId, patientId, revokedBy, reason }) => {
        const result = await db.query(
            `UPDATE doctor_access_sessions
             SET revoked_at = NOW(), revoked_by = $1, revoke_reason = $2
             WHERE session_id = $3
               AND patient_id = $4
               AND revoked_at IS NULL
             RETURNING session_id, doctor_id, patient_id, device_id, issued_at, expires_at, revoked_at`,
            [revokedBy, reason || null, sessionId, patientId]
        );
        return result.rows[0] || null;
    },

    revokeSessionByDoctor: async ({ sessionId, doctorId, revokedBy, reason }) => {
        const result = await db.query(
            `UPDATE doctor_access_sessions
             SET revoked_at = NOW(), revoked_by = $1, revoke_reason = $2
             WHERE session_id = $3
               AND doctor_id = $4
               AND revoked_at IS NULL
             RETURNING session_id, doctor_id, patient_id, device_id, issued_at, expires_at, revoked_at`,
            [revokedBy, reason || null, sessionId, doctorId]
        );
        return result.rows[0] || null;
    },

    revokeSessionByAdmin: async ({ sessionId, revokedBy, reason }) => {
        const result = await db.query(
            `UPDATE doctor_access_sessions
             SET revoked_at = NOW(), revoked_by = $1, revoke_reason = $2
             WHERE session_id = $3
               AND revoked_at IS NULL
             RETURNING session_id, doctor_id, patient_id, device_id, issued_at, expires_at, revoked_at`,
            [revokedBy, reason || null, sessionId]
        );
        return result.rows[0] || null;
    },

    writeAuditLog: async ({ actorId, actorRole, action, targetType, targetId, ip, userAgent, meta }) => {
        await db.query(
            `INSERT INTO audit_logs (actor_id, actor_role, action, target_type, target_id, ip, user_agent, meta)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                actorId || null,
                actorRole || null,
                action,
                targetType || null,
                targetId || null,
                ip || null,
                userAgent || null,
                meta ? JSON.stringify(meta) : null,
            ]
        );
    },
};

module.exports = ConsentModel;
