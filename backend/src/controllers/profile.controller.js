const path = require('path');
const multer = require('multer');
const UserModel = require('../models/user.model');

// ── Multer: lưu ảnh vào uploads/avatars/ ────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../../uploads/avatars'));
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `user_${req.user.id}_${Date.now()}${ext}`);
    },
});

const fileFilter = (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file ảnh JPEG, PNG hoặc WEBP'), false);
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
});

// ── GET /api/profile ─────────────────────────────────────────────────────────
const getProfile = async (req, res) => {
    try {
        const profile = await UserModel.getProfile(req.user.id);
        if (!profile) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
        res.json(profile);
    } catch (err) {
        console.error('getProfile error:', err.message);
        res.status(500).json({ error: 'Lỗi server' });
    }
};

// ── PUT /api/profile ─────────────────────────────────────────────────────────
const updateProfile = async (req, res) => {
    const body = req.body || {};
    const hasField = (field) => Object.prototype.hasOwnProperty.call(body, field);

    const pick = (snake, camel) => {
        if (hasField(snake)) return body[snake];
        if (hasField(camel)) return body[camel];
        return undefined;
    };

    const first_name = pick('first_name', 'firstName');
    const last_name = pick('last_name', 'lastName');
    const phone = body.phone;
    const date_of_birth_raw = pick('date_of_birth', 'dateOfBirth');
    const blood_type = pick('blood_type', 'bloodType');
    const height = body.height;
    const weight = body.weight;
    const underlying_conditions_raw = pick('underlying_conditions', 'underlyingConditions');

    const date_of_birth = date_of_birth_raw === '' ? null : date_of_birth_raw;
    const underlying_conditions = underlying_conditions_raw === '' ? null : underlying_conditions_raw;

    const VALID_BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    if (blood_type && !VALID_BLOOD_TYPES.includes(blood_type)) {
        return res.status(400).json({ error: 'Nhóm máu không hợp lệ' });
    }

    const payload = {};
    if (first_name !== undefined) payload.first_name = first_name;
    if (last_name !== undefined) payload.last_name = last_name;
    if (phone !== undefined) payload.phone = phone;
    if (date_of_birth !== undefined) payload.date_of_birth = date_of_birth;
    if (blood_type !== undefined) payload.blood_type = blood_type;
    if (height !== undefined) payload.height = height;
    if (weight !== undefined) payload.weight = weight;
    if (underlying_conditions !== undefined) payload.underlying_conditions = underlying_conditions;

    const specialty = body.specialty;
    const license_number = pick('license_number', 'licenseNumber');
    const workplace = body.workplace;
    const bio = body.bio;
    const department = body.department;

    if (specialty !== undefined) payload.specialty = specialty;
    if (license_number !== undefined) payload.license_number = license_number;
    if (workplace !== undefined) payload.workplace = workplace;
    if (bio !== undefined) payload.bio = bio;
    if (department !== undefined) payload.department = department;

    if (Object.keys(payload).length === 0) {
        return res.status(400).json({ error: 'Không có dữ liệu để cập nhật' });
    }

    try {
        const updated = await UserModel.updateProfile(req.user.id, payload);
        res.json({ message: 'Cập nhật hồ sơ thành công', profile: updated });
    } catch (err) {
        console.error('updateProfile error:', err.message);
        res.status(500).json({ error: 'Lỗi server' });
    }
};

// ── POST /api/profile/avatar ─────────────────────────────────────────────────
const uploadAvatar = [
    upload.single('avatar'),
    async (req, res) => {
        if (!req.file) return res.status(400).json({ error: 'Không có file ảnh' });
        try {
            const avatarUrl = `/uploads/avatars/${req.file.filename}`;
            await UserModel.updateAvatar(req.user.id, avatarUrl);
            res.json({ message: 'Cập nhật ảnh đại diện thành công', avatar_url: avatarUrl });
        } catch (err) {
            console.error('uploadAvatar error:', err.message);
            res.status(500).json({ error: 'Lỗi server' });
        }
    },
];

module.exports = { getProfile, updateProfile, uploadAvatar };
