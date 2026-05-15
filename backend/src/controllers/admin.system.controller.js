const DeviceModel = require('../models/device.model');
const { getMqttRuntimeStatus } = require('../services/mqtt.runtime');

const DEVICE_ID_REGEX = /^[A-Za-z0-9_-]{3,64}$/;
const ALLOWED_TYPES = new Set(['wearable', 'patch', 'gateway', 'sensor', 'other']);

const createDevice = async (req, res) => {
    try {
        const { device_id, name, type } = req.body || {};
        const normalizedDeviceId = String(device_id || '').trim();
        const normalizedName = String(name || '').trim();
        const normalizedTypeRaw = String(type || '').trim().toLowerCase();
        const normalizedType = normalizedTypeRaw || 'wearable';

        if (!DEVICE_ID_REGEX.test(normalizedDeviceId)) {
            return res.status(400).json({ error: 'device_id không hợp lệ (3-64 ký tự, chỉ gồm chữ/số/_/-)' });
        }
        if (!normalizedName) {
            return res.status(400).json({ error: 'name là bắt buộc' });
        }
        if (!ALLOWED_TYPES.has(normalizedType)) {
            return res.status(400).json({ error: 'type không hợp lệ' });
        }

        const created = await DeviceModel.createUnownedByAdmin({
            device_id: normalizedDeviceId,
            name: normalizedName,
            type: normalizedType,
        });

        return res.status(201).json({ message: 'Thêm thiết bị vào hệ thống thành công', device: created });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'device_id đã tồn tại trong hệ thống' });
        }
        console.error('createDevice error:', err.message);
        return res.status(500).json({ error: 'Lỗi server' });
    }
};

const listDevices = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
        const status = String(req.query.status || '').trim();
        const search = String(req.query.search || '').trim();

        const data = await DeviceModel.listAdminDevices({ page, limit, status, search });
        return res.json(data);
    } catch (err) {
        console.error('listDevices error:', err.message);
        return res.status(500).json({ error: 'Lỗi server' });
    }
};

const setDeviceActive = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { is_active } = req.body || {};

        if (typeof is_active !== 'boolean') {
            return res.status(400).json({ error: 'is_active phải là boolean' });
        }

        const updated = await DeviceModel.setActive(deviceId, is_active);
        if (!updated) {
            return res.status(404).json({ error: 'Không tìm thấy thiết bị' });
        }

        return res.json({ message: 'Cập nhật trạng thái thiết bị thành công', device: updated });
    } catch (err) {
        console.error('setDeviceActive error:', err.message);
        return res.status(500).json({ error: 'Lỗi server' });
    }
};

const assignDeviceOwner = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { owner_id } = req.body || {};

        if (owner_id !== null && owner_id !== undefined && !Number.isInteger(owner_id)) {
            return res.status(400).json({ error: 'owner_id phải là số nguyên hoặc null' });
        }

        const updated = await DeviceModel.assignOwner(deviceId, owner_id ?? null);
        if (!updated) {
            return res.status(404).json({ error: 'Không tìm thấy thiết bị hoặc owner không hợp lệ' });
        }

        return res.json({ message: 'Cập nhật owner thiết bị thành công', device: updated });
    } catch (err) {
        console.error('assignDeviceOwner error:', err.message);
        return res.status(500).json({ error: 'Lỗi server' });
    }
};

const getOverview = async (req, res) => {
    try {
        const overview = await DeviceModel.getAdminOverview();
        return res.json({
            ...overview,
            mqtt: getMqttRuntimeStatus(),
            server: {
                uptime_seconds: Math.floor(process.uptime()),
                timestamp: new Date().toISOString(),
            },
        });
    } catch (err) {
        console.error('getOverview error:', err.message);
        return res.status(500).json({ error: 'Lỗi server' });
    }
};

const listAuditLogs = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
        const action = String(req.query.action || '').trim();
        const actor_role = String(req.query.actor_role || '').trim();

        const data = await DeviceModel.listAuditLogs({ page, limit, action, actor_role });
        return res.json(data);
    } catch (err) {
        console.error('listAuditLogs error:', err.message);
        return res.status(500).json({ error: 'Lỗi server' });
    }
};

// Add a method to fetch users with filters
const listUsers = async (req, res) => {
    try {
        const { name, email, phone, page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const filters = [];
        const values = [];

        if (name) {
            filters.push("name ILIKE $" + (values.length + 1));
            values.push(`%${name}%`);
        }
        if (email) {
            filters.push("email ILIKE $" + (values.length + 1));
            values.push(`%${email}%`);
        }
        if (phone) {
            filters.push("phone ILIKE $" + (values.length + 1));
            values.push(`%${phone}%`);
        }

        const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
        const query = `SELECT id, name, email, phone FROM users ${whereClause} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;

        values.push(limit, offset);

        const result = await db.query(query, values);
        res.json({ users: result.rows });
    } catch (err) {
        console.error("listUsers error:", err.message);
        res.status(500).json({ error: "Lỗi server" });
    }
};

module.exports = {
    createDevice,
    listDevices,
    setDeviceActive,
    assignDeviceOwner,
    getOverview,
    listAuditLogs,
    listUsers,
};
