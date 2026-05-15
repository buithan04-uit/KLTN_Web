const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false, // STARTTLS
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

const APP_NAME = 'IoT Telehealth';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';

const safe = (value) => String(value ?? '').replace(/[<>&"']/g, (m) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&#39;',
}[m]));

const buildEmailShell = ({ title, intro, bodyHtml, footerHtml }) => `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 8px;">
  <h2 style="color: #1976d2; margin-top: 0;">${safe(title)}</h2>
  <p>${intro}</p>
  ${bodyHtml}
  <p style="margin-top: 24px; color: #888; font-size: 13px; line-height: 1.5;">
    ${footerHtml}
  </p>
</div>
`;

const sendMail = async ({ to, subject, html, text }) => {
    try {
        const from = process.env.EMAIL_FROM || process.env.SMTP_USER;

        if (!to) {
            throw new Error('Missing recipient email');
        }

        if (!from) {
            throw new Error('Missing EMAIL_FROM/SMTP_USER configuration');
        }

        await transporter.sendMail({
            from,
            to,
            subject,
            html,
            text,
        });
    } catch (error) {
        console.error('sendMail error:', error.message);
        throw error;
    }
};

/**
 * Gửi email reset mật khẩu chứa link và code OTP
 * @param {string} toEmail - Email người nhận
 * @param {string} resetToken - Token dạng plaintext (chưa hash)
 * @param {string} otpCode - Mã 6 chữ số để xác nhận trực tiếp
 */
const sendPasswordResetEmail = async (toEmail, resetToken, otpCode) => {
    const resetLink = `${FRONTEND_URL}/reset-password?token=${encodeURIComponent(resetToken)}`;

    const html = buildEmailShell({
        title: 'Dat lai mat khau',
        intro: 'Chung toi nhan duoc yeu cau dat lai mat khau cho tai khoan cua ban.',
        bodyHtml: `
            <p><strong>Cach 1 - Nhan vao link ben duoi:</strong></p>
            <a href="${resetLink}"
               style="display:inline-block; padding: 12px 24px; background-color: #1976d2; color: white; text-decoration: none; border-radius: 4px;">
               Dat lai mat khau
            </a>
            <p style="font-size: 12px; color: #666; margin-top: 8px;">Hoac copy link: ${safe(resetLink)}</p>

            <hr style="margin: 24px 0;" />

            <p><strong>Cach 2 - Nhap ma xac nhan OTP:</strong></p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1976d2; padding: 16px; background: #e3f2fd; border-radius: 4px; text-align: center;">
                ${safe(otpCode)}
            </div>
        `,
        footerHtml: `Link va ma co hieu luc trong <strong>15 phut</strong>.<br>Neu ban khong yeu cau, hay bo qua email nay.`,
    });

    const text = [
        `${APP_NAME} - Dat lai mat khau`,
        '',
        'Chung toi nhan duoc yeu cau dat lai mat khau cho tai khoan cua ban.',
        `Link dat lai mat khau: ${resetLink}`,
        `Ma OTP: ${otpCode}`,
        'Link va ma co hieu luc trong 15 phut.',
        'Neu ban khong yeu cau, hay bo qua email nay.',
    ].join('\n');

    await sendMail({
        to: toEmail,
        subject: `[${APP_NAME}] Dat lai mat khau`,
        html,
        text,
    });
};

/**
 * Gui email thong bao khi patient tao consent code.
 */
const sendConsentCodeEmail = async ({ toEmail, code, expiresInMinutes = 10, deviceId }) => {
    const html = buildEmailShell({
        title: 'Ma truy cap du lieu suc khoe',
        intro: 'Ban vua tao ma truy cap tam thoi de cap quyen xem du lieu cho bac si.',
        bodyHtml: `
            <p><strong>Ma truy cap:</strong></p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1976d2; padding: 16px; background: #e3f2fd; border-radius: 4px; text-align: center;">
                ${safe(code)}
            </div>
            <p style="margin-top: 16px;"><strong>Thiet bi:</strong> <span style="font-family: monospace;">${safe(deviceId)}</span></p>
        `,
        footerHtml: `Ma co hieu luc trong <strong>${safe(expiresInMinutes)} phut</strong>.<br>Khong chia se ma nay cho nguoi khong lien quan.`,
    });

    const text = [
        `${APP_NAME} - Ma truy cap du lieu suc khoe`,
        `Ma truy cap: ${code}`,
        `Thiet bi: ${deviceId}`,
        `Hieu luc: ${expiresInMinutes} phut`,
        'Khong chia se ma nay cho nguoi khong lien quan.',
    ].join('\n');

    await sendMail({
        to: toEmail,
        subject: `[${APP_NAME}] Ma truy cap du lieu suc khoe`,
        html,
        text,
    });
};

/**
 * Gui email thong bao khi consent session bi revoke.
 */
const sendConsentRevokedEmail = async ({ toEmail, doctorEmail, deviceId, revokedAt = new Date() }) => {
    const revokedAtText = new Date(revokedAt).toLocaleString('vi-VN');

    const html = buildEmailShell({
        title: 'Consent session da bi thu hoi',
        intro: 'Quyen truy cap du lieu tam thoi da duoc thu hoi thanh cong.',
        bodyHtml: `
            <ul style="padding-left: 20px; line-height: 1.6;">
                <li><strong>Bac si:</strong> ${safe(doctorEmail || 'N/A')}</li>
                <li><strong>Thiet bi:</strong> <span style="font-family: monospace;">${safe(deviceId || 'N/A')}</span></li>
                <li><strong>Thoi gian:</strong> ${safe(revokedAtText)}</li>
            </ul>
        `,
        footerHtml: 'Neu day khong phai hanh dong cua ban, vui long lien he quan tri he thong ngay lap tuc.',
    });

    const text = [
        `${APP_NAME} - Consent session da bi thu hoi`,
        `Bac si: ${doctorEmail || 'N/A'}`,
        `Thiet bi: ${deviceId || 'N/A'}`,
        `Thoi gian: ${revokedAtText}`,
    ].join('\n');

    await sendMail({
        to: toEmail,
        subject: `[${APP_NAME}] Consent session da bi thu hoi`,
        html,
        text,
    });
};

/**
 * Gui email thong bao khi bac si bat dau consent session.
 */
const sendConsentSessionStartedEmail = async ({ toEmail, doctorEmail, deviceId, expiresAt }) => {
    const expiresText = expiresAt ? new Date(expiresAt).toLocaleString('vi-VN') : 'N/A';

    const html = buildEmailShell({
        title: 'Consent session da duoc kich hoat',
        intro: 'He thong ghi nhan bac si da duoc cap quyen tam thoi de xem du lieu suc khoe.',
        bodyHtml: `
            <ul style="padding-left: 20px; line-height: 1.6;">
                <li><strong>Bac si:</strong> ${safe(doctorEmail || 'N/A')}</li>
                <li><strong>Thiet bi:</strong> <span style="font-family: monospace;">${safe(deviceId || 'N/A')}</span></li>
                <li><strong>Het han session:</strong> ${safe(expiresText)}</li>
            </ul>
        `,
        footerHtml: 'Ban co the thu hoi session bat ky luc nao trong Privacy Center.',
    });

    const text = [
        `${APP_NAME} - Consent session da duoc kich hoat`,
        `Bac si: ${doctorEmail || 'N/A'}`,
        `Thiet bi: ${deviceId || 'N/A'}`,
        `Het han: ${expiresText}`,
    ].join('\n');

    await sendMail({
        to: toEmail,
        subject: `[${APP_NAME}] Consent session da duoc kich hoat`,
        html,
        text,
    });
};

module.exports = {
    sendPasswordResetEmail,
    sendConsentCodeEmail,
    sendConsentSessionStartedEmail,
    sendConsentRevokedEmail,
};
