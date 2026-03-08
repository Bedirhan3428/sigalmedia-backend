const { Tweet } = require('../models/Tweet');
const { User }  = require('../models/User');

// ─── Feed Filtresi ────────────────────────────────────────────────────────────
// aegisStatus alanı olmayan ESKİ tweetler ($exists: false) de dahil edilir.
// Bu olmadan MongoDB yeni şemadan önce eklenen tweetleri göstermez.
const ACTIVE_FILTER = {
    $or: [
        { aegisStatus: { $exists: false } },          // eski tweetler (şema öncesi)
        { aegisStatus: { $in: ['active', 'cleared'] } }, // yeni tweetler
    ],
};

// GET /api/feed
exports.getFeed = async (req, res) => {
    try {
        const feed = await Tweet.aggregate([
            { $match: ACTIVE_FILTER },
            { $sort: { score: -1, createdAt: -1 } },
            { $limit: 50 },
            { $sample: { size: 10 } },
            { $project: { likedBy: 0, reportedBy: 0 } },
        ]);
        res.json(feed);
    } catch (err) {
        console.error('feed hatası:', err);
        res.status(500).json({ error: 'Yüklenemedi!' });
    }
};

// GET /api/feed/new
exports.getNewFeed = async (req, res) => {
    try {
        const tweets = await Tweet.find(ACTIVE_FILTER, { likedBy: 0, reportedBy: 0 })
            .sort({ createdAt: -1 }).limit(20).lean();
        res.json(tweets);
    } catch (err) {
        console.error('feed/new hatası:', err);
        res.status(500).json({ error: 'Yüklenemedi!' });
    }
};

// GET /api/bomb-tweet
exports.getBombTweet = async (req, res) => {
    try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const tweets = await Tweet.aggregate([
            { $match: { ...ACTIVE_FILTER, createdAt: { $gte: since } } },
            { $addFields: {
                totalInteraction: { $add: [{ $multiply: ['$likes', 2] }, { $ifNull: ['$commentCount', 0] }] }
            }},
            { $sort: { totalInteraction: -1 } },
            { $limit: 1 },
            { $project: { likedBy: 0, reportedBy: 0 } },
        ]);
        res.json(tweets[0] || null);
    } catch (err) {
        console.error('bomb-tweet hatası:', err);
        res.status(500).json({ error: 'Yüklenemedi!' });
    }
};

// GET /api/feed/following/:deviceId
exports.getFollowingFeed = async (req, res) => {
    try {
        const user = await User.findOne({ deviceId: req.params.deviceId }, { following: 1 }).lean();
        if (!user || !user.following.length) return res.json([]);

        const { sort = 'new' } = req.query;
        const query = { authorId: { $in: user.following }, ...ACTIVE_FILTER };

        let tweets;
        if (sort === 'hot') {
            tweets = await Tweet.aggregate([
                { $match: query },
                { $sort: { score: -1, createdAt: -1 } },
                { $limit: 50 },
                { $sample: { size: 15 } },
                { $project: { likedBy: 0, reportedBy: 0 } },
            ]);
        } else {
            tweets = await Tweet.find(query, { likedBy: 0, reportedBy: 0 })
                .sort({ createdAt: -1 }).limit(30).lean();
        }
        res.json(tweets);
    } catch (err) {
        console.error('feed/following hatası:', err);
        res.status(500).json({ error: 'Yüklenemedi!' });
    }
};

// GET /api/my-tweets/:deviceId
exports.getMyTweets = async (req, res) => {
    try {
        const tweets = await Tweet.find(
            { authorId: req.params.deviceId },
            { likedBy: 0, reportedBy: 0 }
        ).sort({ createdAt: -1 }).lean();
        res.json(tweets);
    } catch (err) {
        console.error('my-tweets hatası:', err);
        res.status(500).json({ error: 'Sunucu hatası!' });
    }
};