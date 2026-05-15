const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profile.controller');
const authMiddleware = require('../middlewares/auth.middleware');

/**
 * @swagger
 * /api/profile:
 *   get:
 *     summary: Lấy hồ sơ của người dùng hiện tại
 *     tags: [Profile]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Hồ sơ người dùng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: integer }
 *                 email: { type: string }
 *                 role: { type: string }
 *                 full_name: { type: string }
 *                 first_name: { type: string }
 *                 last_name: { type: string }
 *                 phone: { type: string }
 *                 date_of_birth: { type: string, format: date }
 *                 blood_type: { type: string }
 *                 height: { type: number }
 *                 weight: { type: number }
 *                 underlying_conditions: { type: string }
 *                 avatar_url: { type: string, nullable: true }
 *                 is_active: { type: boolean }
 *                 is_verified: { type: boolean }
 *                 created_at: { type: string, format: date-time }
 *       401:
 *         description: Chưa xác thực
 *   put:
 *     summary: Cập nhật hồ sơ
 *     tags: [Profile]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name: { type: string }
 *               last_name: { type: string }
 *               phone: { type: string }
 *               date_of_birth: { type: string, format: date }
 *               blood_type: { type: string, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] }
 *               height: { type: number }
 *               weight: { type: number }
 *               underlying_conditions: { type: string }
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 * /api/profile/avatar:
 *   post:
 *     summary: Upload ảnh đại diện
 *     tags: [Profile]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - avatar
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Upload thành công
 *       400:
 *         description: File không hợp lệ
 *       401:
 *         description: Chưa xác thực
 */

// Tất cả profile routes yêu cầu xác thực
router.get('/',             authMiddleware.verifyToken, profileController.getProfile);
router.put('/',             authMiddleware.verifyToken, profileController.updateProfile);
router.post('/avatar',      authMiddleware.verifyToken, profileController.uploadAvatar);

module.exports = router;
