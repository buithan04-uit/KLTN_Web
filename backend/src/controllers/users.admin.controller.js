const UserModel = require('../models/user.model');
const bcrypt = require('bcryptjs');

const ADMIN_RESET_DEFAULT_PASSWORD = '123456';

// ── GET /api/admin/users — List all users with pagination & filters ────────
const listUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const role = req.query.role || '';
    const status = req.query.status || '';

    const result = await UserModel.getAll(page, limit, { search, role, status });

    res.json({
      message: 'Danh sách người dùng',
      data: result.data,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error('listUsers error:', err.message);
    res.status(500).json({ error: 'Lỗi server' });
  }
};

// ── GET /api/admin/users/:id — Get user detail ──────────────────────────────
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await UserModel.getProfile(parseInt(id));

    if (!user) {
      return res.status(404).json({ error: 'Người dùng không tồn tại' });
    }

    res.json({ message: 'Chi tiết người dùng', user });
  } catch (err) {
    console.error('getUserById error:', err.message);
    res.status(500).json({ error: 'Lỗi server' });
  }
};

// ── POST /api/admin/users — Create new user ────────────────────────────────
const createUser = async (req, res) => {
  try {
    const { email, password, role, full_name, phone } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ errors: ['Email và mật khẩu là bắt buộc'] });
    }

    if (!['patient', 'doctor', 'admin'].includes(role)) {
      return res.status(400).json({ errors: ['Role không hợp lệ'] });
    }

    // Check email exists
    const existingUser = await UserModel.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ errors: ['Email đã được sử dụng'] });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = await UserModel.create({
      email,
      password: hashedPassword,
      role,
      full_name: full_name || '',
      phone: phone || '',
    });

    res.status(201).json({
      message: 'Tạo người dùng thành công',
      user: newUser,
    });
  } catch (err) {
    console.error('createUser error:', err.message);
    res.status(500).json({ error: 'Lỗi server' });
  }
};

// ── PUT /api/admin/users/:id — Update user info ────────────────────────────
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, email, phone, role, is_active } = req.body;

    // Validate role
    if (role && !['patient', 'doctor', 'admin'].includes(role)) {
      return res.status(400).json({ errors: ['Role không hợp lệ'] });
    }

    // Check if email is already used by another user
    if (email) {
      const existingUser = await UserModel.findByEmail(email);
      if (existingUser && existingUser.id !== parseInt(id)) {
        return res.status(400).json({ errors: ['Email đã được sử dụng'] });
      }
    }

    const updatedUser = await UserModel.adminUpdate(parseInt(id), {
      full_name,
      email,
      phone,
      role,
      is_active,
    });

    if (!updatedUser) {
      return res.status(404).json({ error: 'Người dùng không tồn tại' });
    }

    res.json({
      message: 'Cập nhật người dùng thành công',
      user: updatedUser,
    });
  } catch (err) {
    console.error('updateUser error:', err.message);
    res.status(500).json({ error: 'Lỗi server' });
  }
};

// ── DELETE /api/admin/users/:id — Deactivate user ──────────────────────────
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await UserModel.deleteById(parseInt(id));

    if (!result) {
      return res.status(404).json({ error: 'Người dùng không tồn tại' });
    }

    res.json({ message: 'Vô hiệu hóa người dùng thành công' });
  } catch (err) {
    console.error('deleteUser error:', err.message);
    res.status(500).json({ error: 'Lỗi server' });
  }
};

// ── PATCH /api/admin/users/:id/role — Change user role ──────────────────────
const changeRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['patient', 'doctor', 'admin'].includes(role)) {
      return res.status(400).json({ errors: ['Role không hợp lệ'] });
    }

    const updatedUser = await UserModel.changeRole(parseInt(id), role);

    if (!updatedUser) {
      return res.status(404).json({ error: 'Người dùng không tồn tại' });
    }

    res.json({
      message: 'Cập nhật vai trò thành công',
      user: updatedUser,
    });
  } catch (err) {
    console.error('changeRole error:', err.message);
    res.status(500).json({ error: 'Lỗi server' });
  }
};

// ── PATCH /api/admin/users/:id/status — Toggle active status ────────────────
const changeStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ errors: ['is_active phải là boolean'] });
    }

    const updatedUser = await UserModel.adminUpdate(parseInt(id), { is_active });

    if (!updatedUser) {
      return res.status(404).json({ error: 'Người dùng không tồn tại' });
    }

    res.json({
      message: `${is_active ? 'Kích hoạt' : 'Vô hiệu hóa'} người dùng thành công`,
      user: updatedUser,
    });
  } catch (err) {
    console.error('changeStatus error:', err.message);
    res.status(500).json({ error: 'Lỗi server' });
  }
};

// ── POST /api/admin/users/:id/reset-password — Generate new password ────────
const resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id);

    const target = await UserModel.findById(userId);
    if (!target) {
      return res.status(404).json({ error: 'Người dùng không tồn tại' });
    }

    const newPassword = ADMIN_RESET_DEFAULT_PASSWORD;
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const updated = await UserModel.updatePassword(userId, hashedPassword);
    if (!updated) {
      return res.status(404).json({ error: 'Người dùng không tồn tại' });
    }

    res.json({
      message: 'Đặt lại mật khẩu thành công',
      tempPassword: newPassword,
      note: 'Mật khẩu tạm thời này. Yêu cầu người dùng đổi mật khẩu sau khi đăng nhập.',
    });
  } catch (err) {
    console.error('resetPassword error:', err.message);
    res.status(500).json({ error: 'Lỗi server' });
  }
};

module.exports = {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  changeRole,
  changeStatus,
  resetPassword,
};
