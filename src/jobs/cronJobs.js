const cron    = require('node-cron');
const { Tweet }             = require('../models/Tweet');
const { User }              = require('../models/User');
const Comment               = require('../models/Comment');
const { deleteFromStorage } = require('../config/firebase');

function startCronJobs() {

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
            await User.updateMany({}, { $set: { dailyLimit: 3 } });
            console.log("✅ Günlük limitler sıfırlandı.");
        } catch (err) {
            console.error("Limit sıfırlama hatası:", err);
        }
    });

    console.log('⏰ Cron job\'lar başlatıldı.');
}

module.exports = { startCronJobs };