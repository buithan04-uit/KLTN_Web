const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth.middleware');
const roleMiddleware = require('../../middlewares/role.middleware');
const usersController = require('../../controllers/users.admin.controller');

// All admin routes require authentication and admin role
router.use(authMiddleware.verifyToken);
router.use(roleMiddleware.requireRole('admin'));

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Danh sách người dùng (phân trang, tìm kiếm, lọc)
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Tìm kiếm theo email hoặc tên
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: ['admin', 'doctor', 'patient'] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: ['active', 'inactive', 'verified', 'unverified'] }
 *     responses:
 *       200:
 *         description: Danh sách người dùng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 'Danh sách người dùng' }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền
 *   post:
 *     summary: Tạo người dùng mới
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - role
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               role: { type: string, enum: ['admin', 'doctor', 'patient'] }
 *               full_name: { type: string }
 *               phone: { type: string }
 *     responses:
 *       201:
 *         description: Tạo thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       403:
 *         description: Không có quyền
 * /api/admin/users/{id}:
 *   get:
 *     summary: Chi tiết người dùng
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Chi tiết người dùng
 *       404:
 *         description: Người dùng không tồn tại
 *       403:
 *         description: Không có quyền
 *   put:
 *     summary: Cập nhật thông tin người dùng
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name: { type: string }
 *               email: { type: string, format: email }
 *               phone: { type: string }
 *               role: { type: string, enum: ['admin', 'doctor', 'patient'] }
 *               is_active: { type: boolean }
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       403:
 *         description: Không có quyền
 *   delete:
 *     summary: Vô hiệu hóa người dùng
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Vô hiệu hóa thành công
 *       403:
 *         description: Không có quyền
 * /api/admin/users/{id}/role:
 *   patch:
 *     summary: Thay đổi vai trò người dùng
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role: { type: string, enum: ['admin', 'doctor', 'patient'] }
 *     responses:
 *       200:
 *         description: Cập nhật vai trò thành công
 *       403:
 *         description: Không có quyền
 * /api/admin/users/{id}/status:
 *   patch:
 *     summary: Bật/tắt trạng thái người dùng
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [is_active]
 *             properties:
 *               is_active: { type: boolean }
 *     responses:
 *       200:
 *         description: Cập nhật trạng thái thành công
 *       403:
 *         description: Không có quyền
 * /api/admin/users/{id}/reset-password:
 *   post:
 *     summary: Đặt lại mật khẩu người dùng
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: |
 *           Mật khẩu tạm thời đã được tạo.
 *           Người dùng phải đổi mật khẩu sau khi đăng nhập.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 tempPassword: { type: string, example: '123456' }
 *                 note: { type: string }
 *       404:
 *         description: Người dùng không tồn tại
 *       403:
 *         description: Không có quyền
 */

router.get('/', usersController.listUsers);
router.get('/:id', usersController.getUserById);
router.post('/', usersController.createUser);
router.put('/:id', usersController.updateUser);
router.delete('/:id', usersController.deleteUser);
router.patch('/:id/role', usersController.changeRole);
router.patch('/:id/status', usersController.changeStatus);
router.post('/:id/reset-password', usersController.resetPassword);

module.exports = router;
