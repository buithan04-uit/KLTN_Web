const jwt = require('jsonwebtoken');
const ConsentModel = require('../models/consent.model');

const getConsentSessionToken = (req) => {
    const headerToken = req.headers['x-consent-session-token'];
    if (headerToken) return String(headerToken);

    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Consent ')) {
        return authHeader.slice('Consent '.length).trim();
    }

    return null;
};

const requireConsentSessionForDoctorByDeviceParam = (paramName = 'deviceId') => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Chưa xác thực' });
            }

            // Admin bypasses consent gate for operations/incident handling
            if (req.user.role === 'admin') {
                return next();
            }

            // Only doctors require temporary consent session token
            if (req.user.role !== 'doctor') {
                return next();
            }

            const token = getConsentSessionToken(req);
            if (!token) {
                return res.status(403).json({ error: 'Thiếu consent session token' });
            }

            let decoded;
            try {
                decoded = jwt.verify(token, process.env.JWT_SECRET);
            } catch (err) {
                return res.status(403).json({ error: 'Consent session token không hợp lệ hoặc đã hết hạn' });
            }

            if (decoded.type !== 'consent_session' || !decoded.session_id) {
                return res.status(403).json({ error: 'Consent session token không đúng định dạng' });
            }

            if (decoded.doctor_id !== req.user.id) {
                return res.status(403).json({ error: 'Consent session token không thuộc bác sĩ hiện tại' });
            }

            const activeSession = await ConsentModel.findActiveSessionById(decoded.session_id);
            if (!activeSession) {
                return res.status(403).json({ error: 'Consent session đã bị thu hồi hoặc hết hạn' });
            }

            const requestedDeviceId = req.params[paramName];
            if (requestedDeviceId && activeSession.device_id !== requestedDeviceId) {
                return res.status(403).json({ error: 'Consent session không có quyền với thiết bị này' });
            }

            req.consentSession = activeSession;
            return next();
        } catch (err) {
            console.error('consent middleware error:', err.message);
            return res.status(500).json({ error: 'Lỗi server' });
        }
    };
};

const requireConsentSessionForDoctorBySessionParam = (paramName = 'sessionId') => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Chưa xác thực' });
            }

            if (req.user.role === 'admin') {
                return next();
            }

            if (req.user.role !== 'doctor') {
                return next();
            }

            const token = getConsentSessionToken(req);
            if (!token) {
                return res.status(403).json({ error: 'Thiếu consent session token' });
            }

            let decoded;
            try {
                decoded = jwt.verify(token, process.env.JWT_SECRET);
            } catch (err) {
                return res.status(403).json({ error: 'Consent session token không hợp lệ hoặc đã hết hạn' });
            }

            if (decoded.type !== 'consent_session' || !decoded.session_id) {
                return res.status(403).json({ error: 'Consent session token không đúng định dạng' });
            }

            if (decoded.doctor_id !== req.user.id) {
                return res.status(403).json({ error: 'Consent session token không thuộc bác sĩ hiện tại' });
            }

            const requestedSessionId = req.params[paramName];
            if (requestedSessionId && decoded.session_id !== requestedSessionId) {
                return res.status(403).json({ error: 'Không có quyền truy cập phiên đo này' });
            }

            const activeSession = await ConsentModel.findActiveSessionById(decoded.session_id);
            if (!activeSession) {
                return res.status(403).json({ error: 'Consent session đã bị thu hồi hoặc hết hạn' });
            }

            req.consentSession = activeSession;
            return next();
        } catch (err) {
            console.error('consent middleware error:', err.message);
            return res.status(500).json({ error: 'Lỗi server' });
        }
    };
};

module.exports = {
    getConsentSessionToken,
    requireConsentSessionForDoctorByDeviceParam,
    requireConsentSessionForDoctorBySessionParam,
};
