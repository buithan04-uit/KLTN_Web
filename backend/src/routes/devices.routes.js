const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const devicesController = require('../controllers/devices.controller');

router.use(authMiddleware.verifyToken);

router.get('/my', devicesController.listMyDevices);
router.get('/available', devicesController.listAvailableDevices);
router.post('/register', devicesController.registerDevice);
router.patch('/:deviceId', devicesController.updateMyDevice);
router.delete('/:deviceId/unlink', devicesController.unlinkMyDevice);

module.exports = router;
