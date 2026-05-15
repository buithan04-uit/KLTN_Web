const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth.middleware');
const roleMiddleware = require('../../middlewares/role.middleware');
const systemController = require('../../controllers/admin.system.controller');

router.use(authMiddleware.verifyToken);
router.use(roleMiddleware.requireRole('admin'));

router.get('/overview', systemController.getOverview);
router.get('/audit-logs', systemController.listAuditLogs);
router.post('/devices', systemController.createDevice);
router.get('/devices', systemController.listDevices);
router.patch('/devices/:deviceId/active', systemController.setDeviceActive);
router.patch('/devices/:deviceId/owner', systemController.assignDeviceOwner);
router.get('/users', systemController.listUsers);

module.exports = router;
