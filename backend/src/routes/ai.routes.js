const express = require('express');
const router = express.Router();
const aiController = require('../controllers/ai.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const consentMiddleware = require('../middlewares/consent.middleware');

router.use(authMiddleware.verifyToken);

router.get('/status', aiController.getStatus);

router.post(
    '/predict/latest/:deviceId',
    consentMiddleware.requireConsentSessionForDoctorByDeviceParam('deviceId'),
    aiController.predictLatest
);

router.get(
    '/summary/:deviceId',
    consentMiddleware.requireConsentSessionForDoctorByDeviceParam('deviceId'),
    aiController.getSummary
);

router.get(
    '/predictions/:deviceId',
    consentMiddleware.requireConsentSessionForDoctorByDeviceParam('deviceId'),
    aiController.listPredictions
);

module.exports = router;
