const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const healthRoutes = require('./health.routes');
const profileRoutes = require('./profile.routes');
const devicesRoutes = require('./devices.routes');
const adminUsersRoutes = require('./admin/users.routes');
const adminSystemRoutes = require('./admin/system.routes');
const consentRoutes = require('./consent.routes');

router.use('/auth', authRoutes);
router.use('/health', healthRoutes);
router.use('/profile', profileRoutes);
router.use('/devices', devicesRoutes);
router.use('/admin/users', adminUsersRoutes);
router.use('/admin/system', adminSystemRoutes);
router.use('/consent', consentRoutes);

module.exports = router;
