require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const app = require('./src/app');
const initMQTT = require('./src/services/mqtt.service');
const ConsentModel = require('./src/models/consent.model');
const db = require('./src/config/db');
const { setIO } = require('./src/config/io');

const server = http.createServer(app);

// Khởi tạo Socket.io
const io = new Server(server, {
    cors: {
        origin: [
            process.env.FRONTEND_URL,
            'http://64.176.80.227',
        ].filter(Boolean),
        credentials: true
    }
});

// Expose io to controllers via singleton
setIO(io);

io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth?.consentToken || socket.handshake.headers['x-consent-session-token'];
        if (!token) {
            socket.data.consent = null;
            return next();
        }

        const decoded = jwt.verify(String(token), process.env.JWT_SECRET);
        if (decoded.type !== 'consent_session' || !decoded.session_id) {
            return next(new Error('Invalid consent session token'));
        }

        const activeSession = await ConsentModel.findActiveSessionById(decoded.session_id);
        if (!activeSession) {
            return next(new Error('Consent session expired or revoked'));
        }

        socket.data.consent = {
            session_id: activeSession.session_id,
            doctor_id: activeSession.doctor_id,
            patient_id: activeSession.patient_id,
            device_id: activeSession.device_id,
        };
        return next();
    } catch (err) {
        return next(new Error('Socket auth failed'));
    }
});

io.on('connection', (socket) => {
    socket.on('subscribe-device', (deviceId) => {
        const consent = socket.data.consent;
        if (!consent) {
            socket.emit('subscription-error', { message: 'Missing consent session token' });
            return;
        }
        if (consent.device_id !== deviceId) {
            socket.emit('subscription-error', { message: 'No consent for this device' });
            return;
        }

        socket.join(`device:${deviceId}`);
        socket.emit('subscription-ok', { device_id: deviceId });
    });

    socket.on('disconnect', () => {
        // No-op. Reserved for audit hooks in next iteration.
    });
});

// Khởi động dịch vụ lắng nghe MQTT
initMQTT(io);

// Watchdog: đánh dấu thiết bị offline sau khi không nhận dữ liệu
const OFFLINE_THRESHOLD_S = parseInt(process.env.DEVICE_OFFLINE_THRESHOLD_S || '60', 10);
setInterval(async () => {
    try {
        const res = await db.query(
            `UPDATE devices
             SET status = 'offline', updated_at = NOW()
             WHERE status = 'online'
               AND last_seen_at < NOW() - ($1 * INTERVAL '1 second')
             RETURNING device_id`,
            [OFFLINE_THRESHOLD_S]
        );
        for (const { device_id } of res.rows) {
            // Unguarded channel — patient's own dashboard
            io.emit(`device-status-${device_id}`, { device_id, status: 'offline' });
            // Consent-gated room — doctor monitor
            io.to(`device:${device_id}`).emit('device-status', { device_id, status: 'offline' });
            console.log(`📴 Device ${device_id} went offline`);
        }
    } catch (err) {
        console.error('❌ Device offline watchdog error:', err.message);
    }
}, 30_000);

// Khởi động Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại cổng ${PORT}`);
    console.log(`📑 Tài liệu API: http://localhost:5000/api-docs`);
});