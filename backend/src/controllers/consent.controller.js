const jwt = require('jsonwebtoken');
const { randomInt, randomUUID } = require('crypto');
const ConsentModel = require('../models/consent.model');
const UserModel = require('../models/user.model');
const { getIO } = require('../config/io');
const {
    sendConsentCodeEmail,
    sendConsentSessionStartedEmail,
    sendConsentRevokedEmail,
} = require('../services/email.service');

const CODE_LENGTH = 6;
const DEFAULT_CODE_TTL_MINUTES = 30;
const MAX_CODE_TTL_MINUTES = 60;
const DEFAULT_SESSION_TTL_MINUTES = 30;

const runInBackground = (label, task) => {
    Promise.resolve()
        .then(task)
        .catch((err) => {
            console.error(`${label} error:`, err.message);
        });
};

const getClientIp = (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
};

const calcAge = (dateOfBirth) => {
    if (!dateOfBirth) return null;
    const dob = new Date(dateOfBirth);
    if (Number.isNaN(dob.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age >= 0 ? age : null;
};

const generateCode = () => String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');

const createAccessCode = async (req, res) => {
    try {
        if (req.user.role !== 'patient') {
            return res.status(403).json({ error: 'Chỉ bệnh nhân được tạo mã truy cập' });
        }

        const patientId = req.user.id;
        const { device_id, ttl_minutes } = req.body || {};

        const patientDevices = await ConsentModel.findPatientDevices(patientId);
        if (!patientDevices.length) {
            return res.status(400).json({ error: 'Bạn chưa có thiết bị nào đang hoạt động' });
        }

        const selectedDevice = device_id
            ? patientDevices.find((d) => d.device_id === device_id)
            : patientDevices[0];

        if (!selectedDevice) {
            if (device_id) {
                const allDevices = await ConsentModel.findAllPatientDevices(patientId);
                const owned = allDevices.find((d) => d.device_id === device_id);
                if (owned) {
                    return res.status(400).json({ error: 'Thiết bị đã bị vô hiệu hoá, không thể tạo mã truy cập' });
                }
            }
            return res.status(404).json({ error: 'Thiết bị không thuộc quyền sở hữu của bạn' });
        }

        const ttl = Math.min(
            Math.max(parseInt(ttl_minutes, 10) || DEFAULT_CODE_TTL_MINUTES, 1),
            MAX_CODE_TTL_MINUTES
        );
        const expiresAt = new Date(Date.now() + ttl * 60 * 1000);

        // Keep only one active code per patient to avoid confusing code switching in UI.
        await ConsentModel.revokePendingCodesForPatient(patientId);

        let created = null;
        for (let i = 0; i < 5; i++) {
            const code = generateCode();
            try {
                created = await ConsentModel.createAccessCode({
                    code,
                    patientId,
                    deviceId: selectedDevice.device_id,
                    expiresAt,
                    createdBy: patientId,
                });
                break;
            } catch (err) {
                if (err.code !== '23505') throw err;
            }
        }

        if (!created) {
            return res.status(500).json({ error: 'Không thể tạo mã truy cập, vui lòng thử lại' });
        }

        await ConsentModel.writeAuditLog({
            actorId: patientId,
            actorRole: req.user.role,
            action: 'consent.code.create',
            targetType: 'access_code',
            targetId: String(created.id),
            ip: getClientIp(req),
            userAgent: req.headers['user-agent'],
            meta: { device_id: created.device_id, expires_at: created.expires_at },
        });

        runInBackground('createAccessCode notification email', async () => {
            const patient = await UserModel.findById(patientId);
            if (!patient?.email) return;

            const diffMs = new Date(created.expires_at).getTime() - Date.now();
            const expiresInMinutes = Math.max(1, Math.ceil(diffMs / 60000));

            await sendConsentCodeEmail({
                toEmail: patient.email,
                code: created.code,
                expiresInMinutes,
                deviceId: created.device_id,
            });
        });

        return res.status(201).json({
            message: 'Tạo mã truy cập thành công',
            data: created,
        });
    } catch (err) {
        console.error('createAccessCode error:', err.message);
        return res.status(500).json({ error: 'Lỗi server' });
    }
};

const verifyAccessCode = async (req, res) => {
    try {
        if (!['doctor', 'admin'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Chỉ bác sĩ hoặc admin được xác thực mã' });
        }

        const { code } = req.body || {};
        if (!code || !/^\d{6}$/.test(String(code))) {
            return res.status(400).json({ error: 'Mã truy cập phải gồm đúng 6 chữ số' });
        }

        const found = await ConsentModel.findActiveCodeByValue(String(code));
        if (!found) {
            return res.status(404).json({ error: 'Mã truy cập không hợp lệ hoặc đã hết hạn' });
        }

        const sessionId = randomUUID();
        // Session TTL must not exceed the access-code remaining validity.
        const nowMs = Date.now();
        const codeExpiresMs = new Date(found.expires_at).getTime();
        const codeRemainingMs = Math.max(0, codeExpiresMs - nowMs);
        const defaultSessionMs = DEFAULT_SESSION_TTL_MINUTES * 60 * 1000;
        const effectiveSessionMs = Math.min(codeRemainingMs, defaultSessionMs);

        if (effectiveSessionMs <= 0) {
            return res.status(404).json({ error: 'Mã truy cập không hợp lệ hoặc đã hết hạn' });
        }

        const expiresAt = new Date(nowMs + effectiveSessionMs);
        const tokenExpiresInSeconds = Math.max(1, Math.floor(effectiveSessionMs / 1000));

        const session = await ConsentModel.createDoctorSession({
            sessionId,
            doctorId: req.user.id,
            patientId: found.patient_id,
            deviceId: found.device_id,
            accessCodeId: found.id,
            expiresAt,
        });

        await ConsentModel.touchAccessCodeUsage(found.id, req.user.id);
        // Revoke any other pending code of this patient once a doctor is granted access.
        await ConsentModel.revokePendingCodesForPatient(found.patient_id, found.id);

        const sessionToken = jwt.sign(
            {
                type: 'consent_session',
                session_id: session.session_id,
                doctor_id: session.doctor_id,
                patient_id: session.patient_id,
                device_id: session.device_id,
                role: req.user.role,
            },
            process.env.JWT_SECRET,
            { expiresIn: `${tokenExpiresInSeconds}s` }
        );

        await ConsentModel.writeAuditLog({
            actorId: req.user.id,
            actorRole: req.user.role,
            action: 'consent.code.verify',
            targetType: 'access_code',
            targetId: String(found.id),
            ip: getClientIp(req),
            userAgent: req.headers['user-agent'],
            meta: { patient_id: found.patient_id, device_id: found.device_id, session_id: session.session_id },
        });

        runInBackground('verifyAccessCode notification email', async () => {
            const patient = await UserModel.findById(found.patient_id);
            const actor = await UserModel.findById(req.user.id);
            if (!patient?.email) return;

            await sendConsentSessionStartedEmail({
                toEmail: patient.email,
                doctorEmail: actor?.email || `${req.user.role}#${req.user.id}`,
                deviceId: found.device_id,
                expiresAt: session.expires_at,
            });
        });

        return res.json({
            message: 'Xác thực mã thành công',
            data: {
                session_token: sessionToken,
                session,
                patient_summary: {
                    id: found.patient_id,
                    full_name: found.patient_name,
                    age: calcAge(found.date_of_birth),
                    device_id: found.device_id,
                    device_name: found.device_name,
                    device_status: found.device_status,
                },
            },
        });
    } catch (err) {
        console.error('verifyAccessCode error:', err.message);
        return res.status(500).json({ error: 'Lỗi server' });
    }
};

const listActiveCodes = async (req, res) => {
    try {
        if (req.user.role !== 'patient') {
            return res.status(403).json({ error: 'Chỉ bệnh nhân được xem danh sách mã truy cập' });
        }

        const deviceId = String(req.query.device_id || '').trim();
        const rows = await ConsentModel.listActiveCodesByPatient(req.user.id, deviceId);
        return res.json({ data: rows });
    } catch (err) {
        console.error('listActiveCodes error:', err.message);
        return res.status(500).json({ error: 'Lỗi server' });
    }
};

const listActiveSessions = async (req, res) => {
    try {
        if (req.user.role !== 'patient') {
            return res.status(403).json({ error: 'Chỉ bệnh nhân được xem phiên truy cập' });
        }

        const rows = await ConsentModel.listActiveSessionsByPatient(req.user.id);
        return res.json({ data: rows });
    } catch (err) {
        console.error('listActiveSessions error:', err.message);
        return res.status(500).json({ error: 'Lỗi server' });
    }
};

const revokeSession = async (req, res) => {
    try {
        if (!['patient', 'doctor', 'admin'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Không có quyền thu hồi phiên truy cập' });
        }

        const { sessionId } = req.params;
        const { reason } = req.body || {};

        let revoked = null;
        let action = 'consent.session.revoke';

        if (req.user.role === 'patient') {
            revoked = await ConsentModel.revokeSessionByPatient({
                sessionId,
                patientId: req.user.id,
                revokedBy: req.user.id,
                reason,
            });
            action = 'consent.session.revoke';
        } else if (req.user.role === 'doctor') {
            revoked = await ConsentModel.revokeSessionByDoctor({
                sessionId,
                doctorId: req.user.id,
                revokedBy: req.user.id,
                reason: reason || 'Doctor ended monitoring session',
            });
            action = 'consent.session.end-by-doctor';
        } else {
            revoked = await ConsentModel.revokeSessionByAdmin({
                sessionId,
                revokedBy: req.user.id,
                reason: reason || 'Admin revoked monitoring session',
            });
            action = 'consent.session.revoke-by-admin';
        }

        if (!revoked) {
            return res.status(404).json({ error: 'Không tìm thấy phiên truy cập còn hiệu lực' });
        }

        // Notify the doctor's monitor in real-time that the session was revoked
        getIO()?.to(`device:${revoked.device_id}`).emit('session-revoked', {
            session_id: revoked.session_id,
            device_id: revoked.device_id,
            message: 'Bệnh nhân đã thu hồi quyền truy cập',
        });

        await ConsentModel.writeAuditLog({
            actorId: req.user.id,
            actorRole: req.user.role,
            action,
            targetType: 'doctor_access_session',
            targetId: String(revoked.session_id),
            ip: getClientIp(req),
            userAgent: req.headers['user-agent'],
            meta: { device_id: revoked.device_id, doctor_id: revoked.doctor_id, reason: reason || null },
        });

        runInBackground('revokeSession notification email', async () => {
            const patient = await UserModel.findById(revoked.patient_id);
            const doctor = await UserModel.findById(revoked.doctor_id);
            if (!patient?.email) return;

            await sendConsentRevokedEmail({
                toEmail: patient.email,
                doctorEmail: doctor?.email || `doctor#${revoked.doctor_id}`,
                deviceId: revoked.device_id,
                revokedAt: revoked.revoked_at,
            });
        });

        return res.json({ message: 'Đã thu hồi quyền truy cập', data: revoked });
    } catch (err) {
        console.error('revokeSession error:', err.message);
        return res.status(500).json({ error: 'Lỗi server' });
    }
};

module.exports = {
    createAccessCode,
    verifyAccessCode,
    listActiveCodes,
    listActiveSessions,
    revokeSession,
};
