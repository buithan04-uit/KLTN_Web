const dns = require('dns').promises;
const UserModel = require('../models/user.model');

const validateRegister = async (req, res, next) => {
    const { email, password, role } = req.body;
    const errors = [];

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        errors.push('Email không hợp lệ');
    }

    if (!password || password.length < 8) {
        errors.push('Mật khẩu phải có ít nhất 8 ký tự');
    }

    // Yêu cầu ít nhất 1 chữ hoa, 1 chữ thường, 1 số
    if (password && !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
        errors.push('Mật khẩu phải có ít nhất 1 chữ hoa, 1 chữ thường và 1 số');
    }

    // Public registration chỉ cho phép 'patient'.
    // Tài khoản admin/doctor phải được tạo bởi admin qua endpoint riêng.
    if (role && role !== 'patient') {
        errors.push('Không thể tự đăng ký với role này. Liên hệ quản trị viên');
    }

    // Trả lỗi sớm nếu format/role sai — tránh gọi DB/DNS khi không cần
    if (errors.length > 0) {
        return res.status(400).json({ errors });
    }

    // Kiểm tra domain email có MX record không (xác minh email domain tồn tại thực)
    try {
        const domain = email.split('@')[1];
        const mxRecords = await dns.resolveMx(domain);
        if (!mxRecords || mxRecords.length === 0) {
            return res.status(400).json({ errors: ['Email không tồn tại thực (domain không có mail server)'] });
        }
    } catch {
        return res.status(400).json({ errors: ['Email không tồn tại thực (domain không hợp lệ hoặc không thể xác minh)'] });
    }

    // Kiểm tra email đã được đăng ký chưa
    try {
        const existing = await UserModel.findByEmail(email);
        if (existing) {
            return res.status(409).json({ error: 'Email đã được sử dụng' });
        }
    } catch {
        return res.status(500).json({ error: 'Lỗi server khi kiểm tra email' });
    }

    next();
};

const validateLogin = (req, res, next) => {
    const { email, password } = req.body;
    const errors = [];

    if (!email) errors.push('Email là bắt buộc');
    if (!password) errors.push('Mật khẩu là bắt buộc');

    if (errors.length > 0) {
        return res.status(400).json({ errors });
    }

    next();
};

const validateForgotPassword = (req, res, next) => {
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ errors: ['Email không hợp lệ'] });
    }
    next();
};

const validateResetPassword = (req, res, next) => {
    const { token, new_password } = req.body;
    const errors = [];

    if (!token) errors.push('Token là bắt buộc');

    if (!new_password || new_password.length < 8) {
        errors.push('Mật khẩu phải có ít nhất 8 ký tự');
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(new_password)) {
        errors.push('Mật khẩu phải có ít nhất 1 chữ hoa, 1 chữ thường và 1 số');
    }

    if (errors.length > 0) {
        return res.status(400).json({ errors });
    }

    next();
};

module.exports = { validateRegister, validateLogin, validateForgotPassword, validateResetPassword };

