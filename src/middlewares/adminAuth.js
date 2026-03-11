const admin    = require('firebase-admin');
const { User } = require('../models/User');

// ─── RBAC: Firebase ID Token + Rol Kontrolü ──────────────────────────────────
// FIX #2: Artık sadece deviceId değil, Firebase ID Token doğrulanıyor.
// Frontend her istekte Authorization: Bearer <idToken> göndermeli.
// idToken'dan uid alınır, DB'de rolü kontrol edilir.

function requireRole(...allowedRoles) {
    return async (req, res, next) => {
        // 1) Authorization header'dan token al
        const authHeader = req.headers['authorization'] || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

        if (!token) {
            return res.status(401).json({ error: 'Yetkilendirme token\'ı eksik.' });
        }

        try {
            // 2) Firebase Admin ile token'ı doğrula
            const decoded = await admin.auth().verifyIdToken(token);
            const uid = decoded.uid;

            // 3) DB'den rolü oku
            const user = await User.findOne({ deviceId: uid }, { role: 1, username: 1 }).lean();
            if (!user) {
                return res.status(401).json({ error: 'Kullanıcı bulunamadı.' });
            }

            if (!allowedRoles.includes(user.role)) {
                return res.status(403).json({ error: 'Bu işlem için yetkiniz yok.' });
            }

            // 4) Sonraki handler'lara taşı
            req.adminRole     = user.role;
            req.adminDeviceId = uid;
            next();
        } catch (err) {
            console.error('adminAuth token doğrulama hatası:', err.code || err.message);

            // Token süresi dolmuş veya geçersiz
            if (err.code === 'auth/id-token-expired') {
                return res.status(401).json({ error: 'Oturum süresi doldu, tekrar giriş yapın.' });
            }
            return res.status(401).json({ error: 'Geçersiz yetkilendirme token\'ı.' });
        }
    };
}

const requireMod        = requireRole('moderator', 'superadmin');
const requireSuperAdmin = requireRole('superadmin');

module.exports = { requireRole, requireMod, requireSuperAdmin };