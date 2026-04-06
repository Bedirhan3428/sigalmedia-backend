const { Tweet }        = require('../models/Tweet');
const { User }         = require('../models/User');
const Comment          = require('../models/Comment');
const BotExample       = require('../models/BotExample');
const BotEvent         = require('../models/BotEvent');
const { modDecision, militaryAudit } = require('../middlewares/aegis');

// ─── GET /api/admin/pending ──────────────────────────────────────────────────
exports.getPending = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [tweets, total] = await Promise.all([
            Tweet.find(
                { aegisStatus: 'pending' },
                { likedBy: 0, reportedBy: 0 }
            ).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
            Tweet.countDocuments({ aegisStatus: 'pending' }),
        ]);

        res.json({ tweets, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (err) {
        console.error("admin pending hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

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
            totalTweets, pendingTweets, activeTweets, quarantineTweets, suspendedTweets,
            removedTweets, clearedTweets, totalUsers, totalComments, totalBots
        ] = await Promise.all([
            Tweet.countDocuments({}),
            Tweet.countDocuments({ aegisStatus: 'pending' }),
            Tweet.countDocuments({ aegisStatus: 'active' }),
            Tweet.countDocuments({ aegisStatus: 'quarantine' }),
            Tweet.countDocuments({ aegisStatus: 'suspended' }),
            Tweet.countDocuments({ aegisStatus: 'removed' }),
            Tweet.countDocuments({ aegisStatus: 'cleared' }),
            User.countDocuments({ isBot: { $ne: true } }),
            Comment.countDocuments({}),
            User.countDocuments({ isBot: true }),
        ]);

        res.json({
            tweets: {
                total: totalTweets, pending: pendingTweets, active: activeTweets,
                quarantine: quarantineTweets, suspended: suspendedTweets,
                removed: removedTweets, cleared: clearedTweets
            },
            users:    { total: totalUsers, bots: totalBots },
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
exports.adminDeleteTweet = async (req, res) => {
    try {
        const { reason = 'Topluluk kurallarına aykırı içerik.' } = req.body;

        const tweet = await Tweet.findById(req.params.tweetId).lean();
        if (!tweet) return res.status(404).json({ error: "Tweet bulunamadı." });

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

// ════════════════════════════════════════════════════════════════════════════
// BOT EXAMPLE CRUD (Super Admin)
// ════════════════════════════════════════════════════════════════════════════

// ─── GET /api/admin/bot-examples ─────────────────────────────────────────────
exports.getBotExamples = async (req, res) => {
    try {
        const { type } = req.query;
        const filter = { active: true };
        if (type && ['tweet', 'comment'].includes(type)) filter.type = type;

        const examples = await BotExample.find(filter)
            .sort({ createdAt: -1 })
            .lean();

        res.json({ examples });
    } catch (err) {
        console.error("bot-examples get hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// ─── POST /api/admin/bot-examples ────────────────────────────────────────────
exports.addBotExample = async (req, res) => {
    try {
        const { type, content } = req.body;

        if (!['tweet', 'comment'].includes(type))
            return res.status(400).json({ error: "Geçersiz tür. 'tweet' veya 'comment' olmalı." });
        if (!content?.trim())
            return res.status(400).json({ error: "İçerik boş olamaz." });
        if (content.trim().length > 280)
            return res.status(400).json({ error: "İçerik 280 karakteri geçemez." });

        const example = await BotExample.create({
            type,
            content:  content.trim(),
            addedBy:  req.adminDeviceId,
        });

        console.log(`🤖 Yeni bot örneği eklendi: [${type}] "${content.slice(0, 40)}" by: ${req.adminDeviceId}`);
        res.json(example);
    } catch (err) {
        console.error("bot-examples post hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// ─── DELETE /api/admin/bot-examples/:id ──────────────────────────────────────
exports.deleteBotExample = async (req, res) => {
    try {
        const example = await BotExample.findByIdAndUpdate(
            req.params.id,
            { $set: { active: false } },
            { new: true }
        ).lean();

        if (!example) return res.status(404).json({ error: "Örnek bulunamadı." });

        console.log(`🤖 Bot örneği silindi: ${req.params.id} by: ${req.adminDeviceId}`);
        res.json({ message: "Örnek silindi." });
    } catch (err) {
        console.error("bot-examples delete hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// ════════════════════════════════════════════════════════════════════════════
// BOT EVENT CRUD (Super Admin) — tarih bazlı etkinlik takvimi
// ════════════════════════════════════════════════════════════════════════════

// ─── GET /api/admin/bot-events ────────────────────────────────────────────────
exports.getBotEvents = async (req, res) => {
    try {
        const { past } = req.query;
        const filter = { active: true };

        if (past !== '1') {
            // Varsayılan: sadece gelecek + bugün
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            filter.date = { $gte: todayStart };
        }

        const events = await BotEvent.find(filter)
            .sort({ date: 1 })
            .lean();

        res.json({ events });
    } catch (err) {
        console.error("bot-events get hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// ─── POST /api/admin/bot-events ───────────────────────────────────────────────
exports.addBotEvent = async (req, res) => {
    try {
        const { title, date, type = 'other', description = '' } = req.body;

        if (!title?.trim())
            return res.status(400).json({ error: "Etkinlik başlığı boş olamaz." });
        if (!date)
            return res.status(400).json({ error: "Tarih zorunludur." });
        if (!['exam', 'holiday', 'special', 'other'].includes(type))
            return res.status(400).json({ error: "Geçersiz etkinlik türü." });

        const event = await BotEvent.create({
            title:       title.trim(),
            date:        new Date(date),
            type,
            description: description.trim().slice(0, 200),
            addedBy:     req.adminDeviceId,
        });

        console.log(`📅 Yeni bot etkinliği: "${title}" @ ${date} by: ${req.adminDeviceId}`);
        res.json({ event });
    } catch (err) {
        console.error("bot-events post hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// ─── DELETE /api/admin/bot-events/:id ────────────────────────────────────────
exports.deleteBotEvent = async (req, res) => {
    try {
        const event = await BotEvent.findByIdAndUpdate(
            req.params.id,
            { $set: { active: false } },
            { new: true }
        ).lean();

        if (!event) return res.status(404).json({ error: "Etkinlik bulunamadı." });

        console.log(`📅 Bot etkinliği silindi: ${req.params.id} by: ${req.adminDeviceId}`);
        res.json({ message: "Etkinlik silindi." });
    } catch (err) {
        console.error("bot-events delete hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// ─── PUT /api/admin/bot/:botId/toggle ────────────────────────────────────────
exports.toggleBot = async (req, res) => {
    try {
        const bot = await User.findOne({ _id: req.params.botId, isBot: true });
        if (!bot) return res.status(404).json({ error: "Bot bulunamadı." });

        bot.isActive = !bot.isActive;
        await bot.save();

        console.log(`🤖 Bot ${bot.isActive ? 'açıldı' : 'kapatıldı'}: ${bot.username}`);
        res.json({ message: `Bot ${bot.isActive ? 'aktif' : 'devre dışı'}.`, isActive: bot.isActive });
    } catch (err) {
        console.error("toggleBot hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// ─── PUT /api/admin/bots/disable-all ─────────────────────────────────────────
exports.disableAllBots = async (req, res) => {
    try {
        const { active } = req.body; // true = hepsini aç, false = hepsini kapat
        const result = await User.updateMany(
            { isBot: true },
            { $set: { isActive: !!active } }
        );

        console.log(`🤖 Tüm botlar ${active ? 'açıldı' : 'kapatıldı'}: ${result.modifiedCount} bot`);
        res.json({ message: `${result.modifiedCount} bot ${active ? 'aktif' : 'devre dışı'}.` });
    } catch (err) {
        console.error("disableAllBots hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// ─── GET /api/admin/bots ──────────────────────────────────────────────────────
exports.getBots = async (req, res) => {
    try {
        const bots = await User.find(
            { isBot: true },
            { deviceId: 1, username: 1, avatar: 1, isActive: 1, createdAt: 1 }
        ).sort({ createdAt: -1 }).lean();

        res.json({ bots });
    } catch (err) {
        console.error("getBots hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};