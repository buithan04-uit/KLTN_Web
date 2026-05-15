const express = require('express');
const router = express.Router();
const consentController = require('../controllers/consent.controller');
const authMiddleware = require('../middlewares/auth.middleware');

router.use(authMiddleware.verifyToken);

// Patient: create/list consent codes and active sessions
router.post('/codes', consentController.createAccessCode);
router.get('/codes/active', consentController.listActiveCodes);
router.get('/sessions/active', consentController.listActiveSessions);
router.post('/sessions/:sessionId/revoke', consentController.revokeSession);

// Doctor/Admin: verify code to receive temporary consent session token
router.post('/verify', consentController.verifyAccessCode);

module.exports = router;
