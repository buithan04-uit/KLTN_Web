const db = require('../config/db');

const PasswordResetModel = {
    // Vô hiệu hóa tất cả token cũ chưa dùng của user
    invalidateExisting: async (user_id) => {
        await db.query(
            `UPDATE password_reset_tokens
             SET used_at = NOW()
             WHERE user_id = $1 AND used_at IS NULL`,
            [user_id]
        );
    },

    create: async ({ user_id, token_hash, expires_at }) => {
        const result = await db.query(
            `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
             VALUES ($1, $2, $3)
             RETURNING id`,
            [user_id, token_hash, expires_at]
        );
        return result.rows[0];
    },

    findValidByHash: async (token_hash) => {
        const result = await db.query(
            `SELECT prt.*, u.email, u.id as user_id
             FROM password_reset_tokens prt
             JOIN users u ON u.id = prt.user_id
             WHERE prt.token_hash = $1
               AND prt.used_at IS NULL
               AND prt.expires_at > NOW()`,
            [token_hash]
        );
        return result.rows[0] || null;
    },

    markUsed: async (id) => {
        await db.query(
            'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
            [id]
        );
    },
};

module.exports = PasswordResetModel;
