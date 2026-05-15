const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const UserModel = require('../models/user.model');
const PasswordResetModel = require('../models/password-reset.model');
const { sendPasswordResetEmail } = require('../services/email.service');

const RESET_TOKEN_EXPIRY_MINUTES = 15;

// Tạo token ngẫu nhiên và OTP 6 số từ cùng 1 secret
const generateResetCredentials = () => {
    // Token dạng hex 32 bytes — dùng trong link
    const plainToken = crypto.randomBytes(32).toString('hex');
    // OTP 6 chữ số — dùng nhập tay trên app
    const otpCode = crypto.randomInt(100000, 999999).toString();
    return { plainToken, otpCode };
};

const hashToken = (plain) =>
    crypto.createHash('sha256').update(plain).digest('hex');

// ────────────────────────────────────────────
// POST /api/auth/forgot-password
// ────────────────────────────────────────────
const forgotPassword = async (req, res) => {
    const { email } = req.body;
    try {
        const user = await UserModel.findByEmail(email);

        // Luôn trả 200 để tránh user enumeration
        if (!user || !user.is_active) {
            return res.json({ message: 'Nếu email tồn tại, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu' });
        }

        const { plainToken, otpCode } = generateResetCredentials();
        const tokenHash = hashToken(plainToken);
        const otpHash = hashToken(otpCode);
        const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000);

        // Vô hiệu hóa token cũ
        await PasswordResetModel.invalidateExisting(user.id);

        // Lưu cả 2 hash (token link và OTP) — lưu như 2 record riêng
        await PasswordResetModel.create({ user_id: user.id, token_hash: tokenHash, expires_at: expiresAt });
        await PasswordResetModel.create({ user_id: user.id, token_hash: otpHash, expires_at: expiresAt });

        try {
            await sendPasswordResetEmail(user.email, plainToken, otpCode);
        } catch (emailErr) {
            console.error('[Email] Gửi email thất bại:', emailErr.message);
            if (process.env.NODE_ENV !== 'production') {
                console.log(`[DEV] Reset token: ${plainToken}`);
                console.log(`[DEV] OTP code:    ${otpCode}`);
            }
        }

        res.json({ message: 'Nếu email tồn tại, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu' });
    } catch (err) {
        console.error('forgotPassword error:', err.message);
        res.status(500).json({ error: 'Lỗi server' });
    }
};

// ────────────────────────────────────────────
// POST /api/auth/verify-reset-token
// Kiểm tra token (link hoặc OTP) còn hợp lệ không
// ────────────────────────────────────────────
const verifyResetToken = async (req, res) => {
    const { token } = req.body;
    try {
        if (!token) return res.status(400).json({ error: 'Token là bắt buộc' });

        const tokenHash = hashToken(token.trim());
        const record = await PasswordResetModel.findValidByHash(tokenHash);

        if (!record) {
            return res.status(400).json({ error: 'Token không hợp lệ hoặc đã hết hạn' });
        }

        res.json({
            message: 'Token hợp lệ',
            email: record.email, // Frontend dùng để hiển thị
        });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
};

// ────────────────────────────────────────────
// POST /api/auth/reset-password
// Đặt lại mật khẩu sau khi xác thực token
// ────────────────────────────────────────────
const resetPassword = async (req, res) => {
    const { token, new_password } = req.body;
    try {
        if (!token || !new_password) {
            return res.status(400).json({ error: 'Token và mật khẩu mới là bắt buộc' });
        }

        const tokenHash = hashToken(token.trim());
        const record = await PasswordResetModel.findValidByHash(tokenHash);

        if (!record) {
            return res.status(400).json({ error: 'Token không hợp lệ hoặc đã hết hạn' });
        }

        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(new_password, salt);

        // Cập nhật mật khẩu và reset trạng thái khóa
        await UserModel.updatePassword(record.user_id, hashedPassword);

        // Vô hiệu hóa tất cả token reset của user này (bao gồm record hiện tại)
        await PasswordResetModel.invalidateExisting(record.user_id);

        res.json({ message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại' });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
};

module.exports = { forgotPassword, verifyResetToken, resetPassword };
