const { User } = require('../models/User');

// ─── RBAC: Rol bazlı erişim kontrolü ────────────────────────────────────────
// Kullanıcının rolünü DB'den okur ve yetki kontrolü yapar.
// Header: x-admin-id: <deviceId>

function requireRole(...allowedRoles) {
    return async (req, res, next) => {
        const deviceId = req.headers['x-admin-id'] || req.body?.deviceId;
        if (!deviceId)
            return res.status(401).json({ error: "Kimlik doğrulama gerekli." });

        try {
            const user = await User.findOne({ deviceId }, { role: 1 }).lean();
            if (!user)
                return res.status(401).json({ error: "Kullanıcı bulunamadı." });

            if (!allowedRoles.includes(user.role))
                return res.status(403).json({ error: "Bu işlem için yetkiniz yok." });

            // Rolü sonraki handler'lara taşı
            req.adminRole = user.role;
            req.adminDeviceId = deviceId;
            next();
        } catch (err) {
            console.error("adminAuth hatası:", err);
            res.status(500).json({ error: "Yetki kontrolü başarısız." });
        }
    };
}

const requireMod        = requireRole('moderator', 'superadmin');
const requireSuperAdmin = requireRole('superadmin');

module.exports = { requireRole, requireMod, requireSuperAdmin };