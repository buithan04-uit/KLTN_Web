const db = require('../config/db');

const UserModel = {
    findByEmail: async (email) => {
        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        return result.rows[0] || null;
    },

    findById: async (id) => {
        const result = await db.query(
            'SELECT id, email, role, full_name, phone, is_active, is_verified, created_at FROM users WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    },

    create: async ({ email, password, role = 'patient', full_name, phone }) => {
        const result = await db.query(
            `INSERT INTO users (email, password, role, full_name, phone)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, email, role, full_name, phone, is_active, is_verified, created_at`,
            [email, password, role, full_name, phone]
        );
        return result.rows[0];
    },

    updateLastLogin: async (id) => {
        await db.query(
            'UPDATE users SET last_login_at = NOW(), failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = $1',
            [id]
        );
    },

    incrementFailedAttempts: async (id) => {
        const result = await db.query(
            `UPDATE users
             SET failed_login_attempts = failed_login_attempts + 1, updated_at = NOW()
             WHERE id = $1
             RETURNING failed_login_attempts`,
            [id]
        );
        return result.rows[0].failed_login_attempts;
    },

    // Khóa tài khoản tạm thời (mặc định 15 phút)
    lockAccount: async (id, minutes = 15) => {
        const safeMins = Number.isInteger(minutes) && minutes > 0 ? minutes : 15;
        await db.query(
            `UPDATE users
             SET locked_until = NOW() + make_interval(mins => $1), updated_at = NOW()
             WHERE id = $2`,
            [safeMins, id]
        );
    },

    setActive: async (id, is_active) => {
        await db.query(
            'UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2',
            [is_active, id]
        );
    },

    setVerified: async (id) => {
        await db.query(
            'UPDATE users SET is_verified = true, updated_at = NOW() WHERE id = $1',
            [id]
        );
    },

    updatePassword: async (id, hashedPassword) => {
        const result = await db.query(
            `UPDATE users
             SET password = $1,
                 updated_at = NOW(),
                 failed_login_attempts = 0,
                 locked_until = NULL
             WHERE id = $2`,
            [hashedPassword, id]
        );
        return (result.rowCount || 0) > 0;
    },

    getProfile: async (id) => {
        const result = await db.query(
            `SELECT id, email, role, full_name, first_name, last_name, phone,
                    gender, date_of_birth, blood_type, height, weight,
                    underlying_conditions, avatar_url,
                    specialty, license_number, workplace, bio, department,
                    is_active, is_verified, created_at
             FROM users WHERE id = $1`,
            [id]
        );
        return result.rows[0] || null;
    },

    updateProfile: async (id, payload = {}) => {
        const updates = [];
        const params = [];
        let paramIndex = 1;

        const hasField = (field) => Object.prototype.hasOwnProperty.call(payload, field);

        if (hasField('first_name')) {
            updates.push(`first_name = $${paramIndex++}`);
            params.push(payload.first_name);
        }

        if (hasField('last_name')) {
            updates.push(`last_name = $${paramIndex++}`);
            params.push(payload.last_name);
        }

        if (hasField('phone')) {
            updates.push(`phone = $${paramIndex++}`);
            params.push(payload.phone);
        }

        if (hasField('gender')) {
            updates.push(`gender = $${paramIndex++}`);
            params.push(payload.gender);
        }

        if (hasField('date_of_birth')) {
            updates.push(`date_of_birth = $${paramIndex++}`);
            params.push(payload.date_of_birth);
        }

        if (hasField('blood_type')) {
            updates.push(`blood_type = $${paramIndex++}`);
            params.push(payload.blood_type);
        }

        if (hasField('height')) {
            updates.push(`height = $${paramIndex++}`);
            params.push(payload.height);
        }

        if (hasField('weight')) {
            updates.push(`weight = $${paramIndex++}`);
            params.push(payload.weight);
        }

        if (hasField('underlying_conditions')) {
            updates.push(`underlying_conditions = $${paramIndex++}`);
            params.push(payload.underlying_conditions);
        }

        if (hasField('specialty')) {
            updates.push(`specialty = $${paramIndex++}`);
            params.push(payload.specialty);
        }

        if (hasField('license_number')) {
            updates.push(`license_number = $${paramIndex++}`);
            params.push(payload.license_number);
        }

        if (hasField('workplace')) {
            updates.push(`workplace = $${paramIndex++}`);
            params.push(payload.workplace);
        }

        if (hasField('bio')) {
            updates.push(`bio = $${paramIndex++}`);
            params.push(payload.bio);
        }

        if (hasField('department')) {
            updates.push(`department = $${paramIndex++}`);
            params.push(payload.department);
        }

        if (hasField('first_name') || hasField('last_name')) {
            updates.push(`full_name = TRIM(CONCAT(COALESCE(last_name, ''), ' ', COALESCE(first_name, '')))`);
        }

        if (updates.length === 0) {
            return this.getProfile(id);
        }

        updates.push('updated_at = NOW()');
        params.push(id);

        const result = await db.query(
            `UPDATE users
             SET ${updates.join(', ')}
             WHERE id = $${paramIndex}
             RETURNING id, email, role, full_name, first_name, last_name, phone,
                       gender, date_of_birth, blood_type, height, weight, underlying_conditions, avatar_url,
                       specialty, license_number, workplace, bio, department`,
            params
        );
        return result.rows[0] || null;
    },

    updateAvatar: async (id, avatar_url) => {
        const result = await db.query(
            'UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2 RETURNING avatar_url',
            [avatar_url, id]
        );
        return result.rows[0];
    },

    // ── Admin: List users with pagination, search, filters ────────────────
    getAll: async (page = 1, limit = 20, { search = '', role = '', status = '' } = {}) => {
        const offset = (page - 1) * limit;
        const searchParam = `%${search}%`;
        
        let whereClause = `WHERE (email ILIKE $1 OR full_name ILIKE $1)`;
        const params = [searchParam];
        let paramIndex = 2;

        if (role) {
            whereClause += ` AND role = $${paramIndex}`;
            params.push(role);
            paramIndex++;
        }

        if (status === 'active') {
            whereClause += ` AND is_active = true`;
        } else if (status === 'inactive') {
            whereClause += ` AND is_active = false`;
        }

        if (status === 'verified') {
            whereClause += ` AND is_verified = true`;
        } else if (status === 'unverified') {
            whereClause += ` AND is_verified = false`;
        }

        // Total count
        const countResult = await db.query(
            `SELECT COUNT(*) as count FROM users ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count);

        // Paginated results
        params.push(limit);
        params.push(offset);
        
        const result = await db.query(
            `SELECT id, email, role, full_name, phone, is_active, is_verified, 
                    first_name, last_name, created_at, updated_at
             FROM users
             ${whereClause}
             ORDER BY created_at DESC
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            params
        );

        return {
            data: result.rows,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        };
    },

    // ── Change user role ────────────────────────────────────────────────────
    changeRole: async (id, newRole) => {
        const result = await db.query(
            'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, role, full_name',
            [newRole, id]
        );
        return result.rows[0] || null;
    },

    // ── Update user by admin ────────────────────────────────────────────────
    adminUpdate: async (id, { full_name, email, phone, role, is_active }) => {
        const updates = [];
        const params = [];
        let paramIndex = 1;

        if (full_name !== undefined) {
            updates.push(`full_name = $${paramIndex++}`);
            params.push(full_name);
        }
        if (email !== undefined) {
            updates.push(`email = $${paramIndex++}`);
            params.push(email);
        }
        if (phone !== undefined) {
            updates.push(`phone = $${paramIndex++}`);
            params.push(phone);
        }
        if (role !== undefined) {
            updates.push(`role = $${paramIndex++}`);
            params.push(role);
        }
        if (is_active !== undefined) {
            updates.push(`is_active = $${paramIndex++}`);
            params.push(is_active);
        }

        if (updates.length === 0) {
            return this.findById(id);
        }

        updates.push(`updated_at = NOW()`);
        params.push(id);

        const result = await db.query(
            `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} 
             RETURNING id, email, role, full_name, phone, is_active, is_verified, created_at`,
            params
        );
        return result.rows[0] || null;
    },

    // ── Delete user (soft delete by deactivating) ────────────────────────────
    deleteById: async (id) => {
        const result = await db.query(
            'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id',
            [id]
        );
        return result.rows[0] || null;
    },
};

module.exports = UserModel;
