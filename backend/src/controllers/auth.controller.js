const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/user.model');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;

// API: Đăng ký người dùng mới
// (Kiểm tra email tồn tại thực + chưa đăng ký đã được thực hiện ở validate.middleware.js)
const register = async (req, res) => {
    const { email, password, role, full_name, phone } = req.body;
    try {
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await UserModel.create({ email, password: hashedPassword, role, full_name, phone });
        res.status(201).json({ message: 'Tạo tài khoản thành công', user });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
};

// API: Đăng nhập
const login = async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await UserModel.findByEmail(email);
        // Trả về cùng 1 thông báo để tránh user enumeration
        if (!user) return res.status(401).json({ error: 'Sai email hoặc mật khẩu' });

        // Kiểm tra tài khoản bị vô hiệu hóa
        if (!user.is_active) {
            return res.status(403).json({ error: 'Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên' });
        }

        // Kiểm tra tài khoản đang bị khóa tạm thời
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
            return res.status(429).json({
                error: `Tài khoản đang bị khóa. Thử lại sau ${minutesLeft} phút`
            });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            const attempts = await UserModel.incrementFailedAttempts(user.id);
            if (attempts >= MAX_FAILED_ATTEMPTS) {
                await UserModel.lockAccount(user.id, LOCK_DURATION_MINUTES);
                return res.status(429).json({
                    error: `Sai mật khẩu quá ${MAX_FAILED_ATTEMPTS} lần. Tài khoản bị khóa ${LOCK_DURATION_MINUTES} phút`
                });
            }
            return res.status(401).json({
                error: `Sai email hoặc mật khẩu (còn ${MAX_FAILED_ATTEMPTS - attempts} lần thử)`
            });
        }

        // Đăng nhập thành công
        await UserModel.updateLastLogin(user.id);

        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({
            message: 'Đăng nhập thành công',
            token,
            user: { id: user.id, email: user.email, role: user.role, full_name: user.full_name }
        });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
};

module.exports = { register, login };