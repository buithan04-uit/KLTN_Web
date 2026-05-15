/**
 * Middleware kiểm tra quyền theo role.
 * Dùng sau verifyToken.
 * @param {...string} roles - Các role được phép, ví dụ: 'admin', 'doctor'
 */
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Chưa xác thực' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác này' });
        }
        next();
    };
};

module.exports = { requireRole };
