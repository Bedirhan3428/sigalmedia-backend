const { Tweet }        = require('../models/Tweet');
const { User }         = require('../models/User');
const Comment          = require('../models/Comment');
const { modDecision, militaryAudit } = require('../middlewares/aegis');

// ─── GET /api/admin/quarantine ───────────────────────────────────────────────
exports.getQuarantine = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [tweets, total] = await Promise.all([
            Tweet.find(
                { aegisStatus: { $in: ['quarantine', 'suspended'] } },
                { likedBy: 0 }
            ).sort({ reportCount: -1, createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
            Tweet.countDocuments({ aegisStatus: { $in: ['quarantine', 'suspended'] } }),
        ]);

        res.json({ tweets, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (err) {
        console.error("admin quarantine hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// ─── GET /api/admin/suspended ────────────────────────────────────────────────
// Military Audit'te UNSAFE çıkan, admin onayı bekleyen tweetler
exports.getSuspended = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [tweets, total] = await Promise.all([
            Tweet.find(
                { aegisStatus: 'suspended' },
                { likedBy: 0 }
            ).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
            Tweet.countDocuments({ aegisStatus: 'suspended' }),
        ]);

        res.json({ tweets, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (err) {
        console.error("admin suspended hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// ─── GET /api/admin/all-tweets ───────────────────────────────────────────────
// Tüm tweetleri admin için listeler
exports.getAllTweets = async (req, res) => {
    try {
        const { page = 1, limit = 30, status } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const filter = status ? { aegisStatus: status } : {};

        const [tweets, total] = await Promise.all([
            Tweet.find(filter, { likedBy: 0, reportedBy: 0 })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Tweet.countDocuments(filter),
        ]);

        res.json({ tweets, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (err) {
        console.error("admin all-tweets hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// ─── GET /api/admin/audit-log ────────────────────────────────────────────────
exports.getAuditLog = async (req, res) => {
    try {
        const { limit = 50 } = req.query;

        const tweets = await Tweet.find(
            { 'aegisAuditLog.0': { $exists: true } },
            { content: 1, authorId: 1, authorAvatar: 1, aegisStatus: 1, aegisAuditLog: 1, reportCount: 1, createdAt: 1 }
        ).sort({ 'aegisAuditLog.at': -1 }).limit(parseInt(limit)).lean();

        const log = tweets.map(t => ({
            tweetId:     t._id,
            content:     t.content?.slice(0, 100),
            author:      t.authorAvatar,
            status:      t.aegisStatus,
            reportCount: t.reportCount,
            lastAction:  t.aegisAuditLog[t.aegisAuditLog.length - 1],
        }));

        res.json(log);
    } catch (err) {
        console.error("admin audit-log hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// ─── POST /api/admin/decision/:tweetId ───────────────────────────────────────
// Mod kararı: 'active' (restore), 'removed' (sil + neden), 'cleared'
exports.makeDecision = async (req, res) => {
    try {
        const { decision, reason } = req.body;

        if (!['removed', 'cleared', 'active'].includes(decision))
            return res.status(400).json({ error: "Geçersiz karar." });

        const tweet = await Tweet.findById(req.params.tweetId).lean();
        if (!tweet) return res.status(404).json({ error: "Tweet bulunamadı." });

        await Tweet.findByIdAndUpdate(req.params.tweetId, {
            $set: {
                aegisStatus: decision,
                ...(decision === 'removed' ? {
                    adminAction: {
                        action: 'removed',
                        reason: reason || 'Topluluk kurallarına aykırı içerik.',
                        by:     req.adminDeviceId,
                        at:     new Date(),
                    }
                } : {}),
                ...(decision === 'active' ? {
                    adminAction: {
                        action: 'restored',
                        reason: reason || 'İçerik incelendi, yayına alındı.',
                        by:     req.adminDeviceId,
                        at:     new Date(),
                    }
                } : {}),
            },
            $push: { aegisAuditLog: {
                action:    decision,
                reason:    reason || `Moderatör kararı: ${decision}`,
                modelUsed: 'human',
                score:     100,
                by:        req.adminDeviceId,
                at:        new Date(),
            }}
        });

        console.log(`⚖️ Mod Kararı → ${req.params.tweetId} | ${decision} | by: ${req.adminDeviceId}`);
        res.json({ message: `Tweet durumu güncellendi: ${decision}`, aegisStatus: decision });
    } catch (err) {
        console.error("admin decision hatası:", err);
        res.status(500).json({ error: err.message });
    }
};

// ─── POST /api/admin/force-audit/:tweetId ────────────────────────────────────
exports.forceAudit = async (req, res) => {
    try {
        const tweet = await Tweet.findById(req.params.tweetId, { aegisStatus: 1 }).lean();
        if (!tweet) return res.status(404).json({ error: "Tweet bulunamadı." });

        setImmediate(() => militaryAudit(req.params.tweetId).catch(console.error));
        res.json({ message: "Military Audit başlatıldı. Sonuç birkaç saniye içinde uygulanacak." });
    } catch (err) {
        console.error("force-audit hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// ─── GET /api/admin/stats ─────────────────────────────────────────────────────
exports.getStats = async (req, res) => {
    try {
        const [
            totalTweets, activeTweets, quarantineTweets, suspendedTweets,
            removedTweets, clearedTweets, totalUsers, totalComments
        ] = await Promise.all([
            Tweet.countDocuments({}),
            Tweet.countDocuments({ aegisStatus: 'active' }),
            Tweet.countDocuments({ aegisStatus: 'quarantine' }),
            Tweet.countDocuments({ aegisStatus: 'suspended' }),
            Tweet.countDocuments({ aegisStatus: 'removed' }),
            Tweet.countDocuments({ aegisStatus: 'cleared' }),
            User.countDocuments({}),
            Comment.countDocuments({}),
        ]);

        res.json({
            tweets: {
                total: totalTweets, active: activeTweets,
                quarantine: quarantineTweets, suspended: suspendedTweets,
                removed: removedTweets, cleared: clearedTweets
            },
            users:    { total: totalUsers },
            comments: { total: totalComments },
        });
    } catch (err) {
        console.error("admin stats hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// ─── PUT /api/admin/user-role ─────────────────────────────────────────────────
exports.updateUserRole = async (req, res) => {
    try {
        const { targetDeviceId, newRole } = req.body;
        const VALID_ROLES = ['user', 'moderator', 'superadmin'];

        if (!VALID_ROLES.includes(newRole))
            return res.status(400).json({ error: `Geçersiz rol.` });

        const user = await User.findOneAndUpdate(
            { deviceId: targetDeviceId },
            { $set: { role: newRole } },
            { new: true, select: 'deviceId username role' }
        ).lean();

        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });

        console.log(`👑 Rol güncellendi: ${targetDeviceId} → ${newRole} | by: ${req.adminDeviceId}`);
        res.json({ message: `${user.username} artık ${newRole}.`, user });
    } catch (err) {
        console.error("user-role hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// ─── DELETE /api/admin/tweet/:tweetId ────────────────────────────────────────
// Admin tweeti siler + sebep belirtir (tweet DB'de removed olarak işaretlenir)
exports.adminDeleteTweet = async (req, res) => {
    try {
        const { reason = 'Topluluk kurallarına aykırı içerik.' } = req.body;

        const tweet = await Tweet.findById(req.params.tweetId).lean();
        if (!tweet) return res.status(404).json({ error: "Tweet bulunamadı." });

        // Tweet'i silmek yerine 'removed' yap + neden kaydet (kullanıcı görebilsin)
        await Tweet.findByIdAndUpdate(req.params.tweetId, {
            $set: {
                aegisStatus: 'removed',
                adminAction: {
                    action: 'removed',
                    reason,
                    by:  req.adminDeviceId,
                    at:  new Date(),
                },
            },
            $push: { aegisAuditLog: {
                action:    'removed',
                reason,
                modelUsed: 'human',
                score:     100,
                by:        req.adminDeviceId,
                at:        new Date(),
            }}
        });

        console.log(`🗑️ Admin sildi tweet: ${req.params.tweetId} | reason: ${reason} | by: ${req.adminDeviceId}`);
        res.json({ message: "Tweet kaldırıldı.", reason });
    } catch (err) {
        console.error("admin delete tweet hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};