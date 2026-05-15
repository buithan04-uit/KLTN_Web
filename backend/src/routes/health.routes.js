const express = require('express');
const router = express.Router();
const healthController = require('../controllers/health.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const roleMiddleware = require('../middlewares/role.middleware');
const consentMiddleware = require('../middlewares/consent.middleware');

router.get('/', (req, res) => {
	res.status(200).json({ status: 'OK', message: 'Health check passed' });
});

// Lịch sử́ đo — bệnh nhân/bác sĩ/admin đều xem được
router.get(
	'/history/:deviceId',
	authMiddleware.verifyToken,
	consentMiddleware.requireConsentSessionForDoctorByDeviceParam('deviceId'),
	healthController.getHistory
);

// Dữ liệu theo phiên đo
router.get(
	'/session/:sessionId',
	authMiddleware.verifyToken,
	consentMiddleware.requireConsentSessionForDoctorBySessionParam('sessionId'),
	healthController.getBySession
);

// Dữ liệu bất thường — chỉ bác sĩ và admin
router.get(
	'/abnormal/:deviceId',
	authMiddleware.verifyToken,
	roleMiddleware.requireRole('admin', 'doctor'),
	consentMiddleware.requireConsentSessionForDoctorByDeviceParam('deviceId'),
	healthController.getAbnormal
);

// Xu hướng dữ liệu theo khoảng thời gian (cho dashboard lâm sàng)
router.get(
	'/trends/:deviceId',
	authMiddleware.verifyToken,
	consentMiddleware.requireConsentSessionForDoctorByDeviceParam('deviceId'),
	healthController.getTrends
);

// Tóm tắt lâm sàng + AI rule-based
router.get(
	'/clinical-summary/:deviceId',
	authMiddleware.verifyToken,
	roleMiddleware.requireRole('admin', 'doctor'),
	consentMiddleware.requireConsentSessionForDoctorByDeviceParam('deviceId'),
	healthController.getClinicalSummary
);

module.exports = router;