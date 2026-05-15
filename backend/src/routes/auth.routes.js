const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const passwordResetController = require('../controllers/password-reset.controller');
const  validateMiddleware = require('../middlewares/validate.middleware');

router.post('/register', validateMiddleware.validateRegister, authController.register);
router.post('/login', validateMiddleware.validateLogin, authController.login);
router.post('/forgot-password', validateMiddleware.validateForgotPassword, passwordResetController.forgotPassword);
router.post('/verify-reset-token', passwordResetController.verifyResetToken);
router.post('/reset-password', validateMiddleware.validateResetPassword, passwordResetController.resetPassword);

module.exports = router;
