const cron    = require('node-cron');
const axios   = require('axios'); // Sunucuyu dürtmek için gerekli
const { Tweet }             = require('../models/Tweet');
const { User }              = require('../models/User');
const Comment               = require('../models/Comment');
const { deleteFromStorage } = require('../config/firebase');
const { createDailyBotAccount, runBotAction, initBotSystem } = require('../bots/botEngine');

function startCronJobs() {

    // ── RENDER / RAILWAY KEEP-ALIVE (UYKU ÖNLEYİCİ) ──────────────────────────
    // Her 10 dakikada bir kendi kendine istek atarak sunucunun kapanmasını engeller.
    cron.schedule('*/10 * * * *', async () => {
        try {
            const url = 'https://sigalmedia-backend-1.onrender.com';
            await axios.get(url);
            console.log(`📡 Keep-Alive: Sunucu uyandırıldı (${new Date().toLocaleTimeString('tr-TR')})`);
        } catch (err) {
            // Hata alsa bile (mesela sayfa 404 dönse bile) istek ulaştığı için Render uyanır.
            console.log(`📡 Keep-Alive Sinyali Gönderildi (Durum: ${err.message})`);
        }
    });

    // ── Her 10 dakika: Skor güncelle ─────────────────────────────────────────
    cron.schedule('*/10 * * * *', async () => {
        try {
            const tweets = await Tweet.find(
                { createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
                { _id: 1, likes: 1, commentCount: 1, authorId: 1, createdAt: 1 }
            ).lean();

            if (!tweets.length) return;

            const authorIds = [...new Set(tweets.map(t => t.authorId))];
            const [commentLikes, authorUsers] = await Promise.all([
                Comment.aggregate([
                    { $match: { tweetId: { $in: tweets.map(t => t._id) } } },
                    { $group: { _id: '$tweetId', total: { $sum: '$likes' } } },
                ]),
                User.find({ deviceId: { $in: authorIds } }, { deviceId: 1, followers: 1 }).lean(),
            ]);

            const commentLikeMap = Object.fromEntries(commentLikes.map(c => [c._id.toString(), c.total]));
            const followerMap    = Object.fromEntries(authorUsers.map(u => [u.deviceId, u.followers.length]));

            const now     = new Date();
            const bulkOps = tweets.map(tweet => {
                const hoursPassed       = Math.max(1, (now - tweet.createdAt) / 36e5);
                const commentLikesTotal = commentLikeMap[tweet._id.toString()] || 0;
                const interaction       = (tweet.likes * 2) + (tweet.commentCount || 0) + commentLikesTotal;
                const followerBonus     = 1 + Math.min((followerMap[tweet.authorId] || 0) / 10, 10) * 0.1;
                const score             = ((interaction * 10) / Math.pow(hoursPassed, 1.5)) * followerBonus;
                return { updateOne: { filter: { _id: tweet._id }, update: { $set: { score } } } };
            });

            await Tweet.bulkWrite(bulkOps, { ordered: false });
            console.log(`✅ ${bulkOps.length} tweet skoru güncellendi.`);
        } catch (err) {
            console.error("Skor güncelleme hatası:", err);
        }
    });

    // ── Her 15 dakika: Bot aksiyonu ──────────────────────────────────────────
    cron.schedule('*/15 * * * *', async () => {
        try {
            await runBotAction();
        } catch (err) {
            console.error('🤖 Bot aksiyon cron hatası:', err.message);
        }
    });

    // ── Her gece 02:00 — Yeni bot hesabı oluştur ────────────────────────────
    cron.schedule('0 2 * * *', async () => {
        try {
            await createDailyBotAccount();
        } catch (err) {
            console.error('🤖 Bot hesap oluşturma cron hatası:', err.message);
        }
    });

    // ── Her gece 03:00 — 45 günden eski tweetleri temizle ───────────────────
    cron.schedule('0 3 * * *', async () => {
        try {
            const cutoff    = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
            const oldTweets = await Tweet.find({ createdAt: { $lt: cutoff } }, { _id: 1, imagePath: 1 }).lean();

            if (!oldTweets.length) {
                console.log('🧹 45 günlük temizlik: silinecek tweet yok.');
                return;
            }

            const storageResults = await Promise.allSettled(
                oldTweets.filter(t => t.imagePath).map(t => deleteFromStorage(t.imagePath))
            );
            const storageDeleted = storageResults.filter(r => r.status === 'fulfilled').length;
            const tweetIds       = oldTweets.map(t => t._id);

            await Promise.all([
                Comment.deleteMany({ tweetId: { $in: tweetIds } }),
                Tweet.deleteMany({ _id: { $in: tweetIds } }),
            ]);

            console.log(`🧹 45 günlük temizlik: ${oldTweets.length} tweet, ${storageDeleted} görsel silindi.`);
        } catch (err) {
            console.error('❌ 45 günlük temizlik hatası:', err);
        }
    });

    // ── Her gece 00:00 — Günlük limitleri sıfırla ───────────────────────────
    cron.schedule('0 0 * * *', async () => {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const result = await User.updateMany(
                { lastResetDate: { $lt: today }, isBot: { $ne: true } },
                { $set: { dailyLimit: 10, lastResetDate: today } }
            );

            console.log(`✅ Günlük limitler sıfırlandı. (${result.modifiedCount} kullanıcı)`);
        } catch (err) {
            console.error("Limit sıfırlama hatası:", err);
        }
    });

    // ── Boot'ta da kontrol et ─────────────────────────────────────────────────
    (async () => {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const result = await User.updateMany(
                { lastResetDate: { $lt: today }, isBot: { $ne: true } },
                { $set: { dailyLimit: 10, lastResetDate: today } }
            );

            if (result.modifiedCount > 0) {
                console.log(`✅ Boot limit kontrolü: ${result.modifiedCount} kullanıcı sıfırlandı.`);
            }

            await initBotSystem();
        } catch (err) {
            console.error("Boot kontrol hatası:", err);
        }
    })();

    console.log("⏰ Cron job'lar başlatıldı. (Bot: 15dk, Skor: 10dk, Keep-Alive: 10dk)");
}

module.exports = { startCronJobs };
