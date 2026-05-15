const DeviceModel = require('../models/device.model');

const DEVICE_ID_REGEX = /^[A-Za-z0-9_-]{3,64}$/;

const listMyDevices = async (req, res) => {
    try {
        const includeInactive = String(req.query.include_inactive || 'true') === 'true';
        const rows = await DeviceModel.findOwnedDevices(req.user.id, includeInactive);
        return res.json({ data: rows });
    } catch (err) {
        console.error('listMyDevices error:', err.message);
        return res.status(500).json({ error: 'Lỗi server' });
    }
};

const registerDevice = async (req, res) => {
    try {
        if (!['patient', 'doctor', 'admin'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Chỉ bệnh nhân, bác sĩ hoặc admin được thao tác thiết bị' });
        }

        const { device_id, name, type, firmware_version } = req.body || {};
        const normalizedDeviceId = String(device_id || '').trim();

        if (!normalizedDeviceId || !DEVICE_ID_REGEX.test(normalizedDeviceId)) {
            return res.status(400).json({ error: 'device_id không hợp lệ' });
        }

        const isAdmin = req.user.role === 'admin';
        if (!isAdmin) {
            const existing = await DeviceModel.findById(normalizedDeviceId);
            if (!existing) {
                return res.status(404).json({ error: 'Thiết bị chưa có trong hệ thống, chỉ admin mới được thêm mới' });
            }
        }

        const device = await DeviceModel.createOrClaim({
            device_id: normalizedDeviceId,
            owner_id: req.user.id,
            name: isAdmin && name ? String(name).trim() : null,
            type: isAdmin && type ? String(type).trim() : 'wearable',
            firmware_version: isAdmin && firmware_version ? String(firmware_version).trim() : null,
        });

        if (!device) {
            return res.status(409).json({ error: 'Thiết bị đã thuộc sở hữu người dùng khác' });
        }

        return res.status(201).json({ message: 'Đăng ký thiết bị thành công', device });
    } catch (err) {
        console.error('registerDevice error:', err.message);
        return res.status(500).json({ error: 'Lỗi server' });
    }
};

const updateMyDevice = async (req, res) => {
    try {
        if (!['patient', 'doctor', 'admin'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Không có quyền cập nhật thiết bị' });
        }

        const { deviceId } = req.params;
        const { name, type, firmware_version, is_active } = req.body || {};

        const isAdmin = req.user.role === 'admin';
        if (!isAdmin && (name !== undefined || type !== undefined || firmware_version !== undefined)) {
            return res.status(403).json({
                error: 'Chỉ admin mới được đổi thông tin định danh thiết bị (name/type/firmware_version)',
            });
        }

        const updated = await DeviceModel.updateOwned({
            device_id: deviceId,
            owner_id: req.user.id,
            name: isAdmin ? name : undefined,
            type: isAdmin ? type : undefined,
            firmware_version: isAdmin ? firmware_version : undefined,
            is_active,
        });

        if (!updated) {
            return res.status(404).json({ error: 'Không tìm thấy thiết bị của bạn' });
        }

        return res.json({ message: 'Cập nhật thiết bị thành công', device: updated });
    } catch (err) {
        console.error('updateMyDevice error:', err.message);
        return res.status(500).json({ error: 'Lỗi server' });
    }
};

const unlinkMyDevice = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const device = await DeviceModel.unlinkOwned(deviceId, req.user.id);
        if (!device) {
            return res.status(404).json({ error: 'Không tìm thấy thiết bị hoặc bạn không phải chủ sở hữu' });
        }
        return res.json({ message: 'Đã huỷ liên kết thiết bị', device });
    } catch (err) {
        console.error('unlinkMyDevice error:', err.message);
        return res.status(500).json({ error: 'Lỗi server' });
    }
};

const listAvailableDevices = async (req, res) => {
    try {
        const devices = await DeviceModel.listAvailable();
        return res.json({ data: devices });
    } catch (err) {
        console.error('listAvailableDevices error:', err.message);
        return res.status(500).json({ error: 'Lỗi server' });
    }
};

module.exports = {
    listMyDevices,
    registerDevice,
    updateMyDevice,
    unlinkMyDevice,
    listAvailableDevices,
};
