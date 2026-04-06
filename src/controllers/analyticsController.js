const { ActivityLog } = require('../models/ActivityLog');
const { Tweet }       = require('../models/Tweet');

// ─── POST /api/analytics/batch ───────────────────────────────────────────────
// Frontend her 10sn'de biriktirdiği event'leri toplu gönderir
exports.trackBatch = async (req, res) => {
    try {
        const { events } = req.body;
        if (!Array.isArray(events) || events.length === 0)
            return res.status(400).json({ error: 'events dizisi gerekli.' });

        // Maks 50 event / istek
        const batch = events.slice(0, 50).map(e => ({
            userId:     e.userId || 'anonymous',
            action:     e.action,
            targetId:   e.targetId || null,
            targetType: e.targetType || null,
            metadata: {
                duration:   e.duration   ?? null,
                percentage: e.percentage ?? null,
                source:     e.source     ?? null,
            },
            timestamp: e.timestamp ? new Date(e.timestamp) : new Date(),
        }));

        await ActivityLog.insertMany(batch, { ordered: false });

        // View event'leri için Tweet.viewCount'u toplu güncelle
        const viewTargets = batch
            .filter(e => (e.action === 'view' || e.action === 'reel_watch') && e.targetId)
            .map(e => e.targetId);

        if (viewTargets.length > 0) {
            const counts = {};
            viewTargets.forEach(id => { counts[id] = (counts[id] || 0) + 1; });
            const bulkOps = Object.entries(counts).map(([id, count]) => ({
                updateOne: {
                    filter: { _id: id },
                    update: { $inc: { viewCount: count } },
                }
            }));
            await Tweet.bulkWrite(bulkOps, { ordered: false }).catch(() => {});
        }

        res.json({ ok: true, count: batch.length });
    } catch (err) {
        console.error('analytics batch hatası:', err.message);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
};

// ─── GET /api/analytics/post/:postId ─────────────────────────────────────────
// Gönderi sahibi veya herkes için: view count, unique viewers, avg duration
exports.getPostAnalytics = async (req, res) => {
    try {
        const { postId } = req.params;

        const [viewStats, likeCount, shareCount] = await Promise.all([
            ActivityLog.aggregate([
                { $match: { targetId: postId, action: { $in: ['view', 'reel_watch'] } } },
                { $group: {
                    _id: null,
                    totalViews:    { $sum: 1 },
                    uniqueViewers: { $addToSet: '$userId' },
                    avgDuration:   { $avg: '$metadata.duration' },
                    avgPercentage: { $avg: '$metadata.percentage' },
                }},
            ]),
            ActivityLog.countDocuments({ targetId: postId, action: 'like' }),
            ActivityLog.countDocuments({ targetId: postId, action: 'share' }),
        ]);

        const stats = viewStats[0] || { totalViews: 0, uniqueViewers: [], avgDuration: 0, avgPercentage: 0 };

        res.json({
            views:          stats.totalViews,
            uniqueViewers:  stats.uniqueViewers.length,
            avgDuration:    Math.round((stats.avgDuration || 0) * 10) / 10,
            avgPercentage:  Math.round(stats.avgPercentage || 0),
            likes:          likeCount,
            shares:         shareCount,
        });
    } catch (err) {
        console.error('post analytics hatası:', err.message);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
};

// ─── GET /api/admin/analytics/overview ──────────────────────────────────────
exports.getOverview = async (req, res) => {
    try {
        const now   = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const week  = new Date(today.getTime() - 7 * 86400000);

        const [
            totalEvents, todayEvents, weekEvents,
            todayActiveUsers, weekActiveUsers,
            actionBreakdown, topPosts
        ] = await Promise.all([
            ActivityLog.countDocuments({}),
            ActivityLog.countDocuments({ timestamp: { $gte: today } }),
            ActivityLog.countDocuments({ timestamp: { $gte: week } }),
            ActivityLog.distinct('userId', { timestamp: { $gte: today } }).then(r => r.length),
            ActivityLog.distinct('userId', { timestamp: { $gte: week } }).then(r => r.length),
            ActivityLog.aggregate([
                { $match: { timestamp: { $gte: week } } },
                { $group: { _id: '$action', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
            ]),
            ActivityLog.aggregate([
                { $match: { action: { $in: ['view', 'reel_watch'] }, timestamp: { $gte: week } } },
                { $group: {
                    _id: '$targetId',
                    views:       { $sum: 1 },
                    avgDuration: { $avg: '$metadata.duration' },
                }},
                { $sort: { views: -1 } },
                { $limit: 10 },
            ]),
        ]);

        // Top post detaylarını çek
        const topPostIds = topPosts.map(p => p._id).filter(Boolean);
        const tweets = topPostIds.length > 0
            ? await Tweet.find({ _id: { $in: topPostIds } }, { content: 1, authorAvatar: 1, authorAvatarUrl: 1, imageUrl: 1, mediaType: 1, viewCount: 1, likes: 1 }).lean()
            : [];

        const tweetMap = {};
        tweets.forEach(t => { tweetMap[t._id.toString()] = t; });

        const enrichedTopPosts = topPosts.map(p => ({
            ...p,
            tweet: tweetMap[p._id] || null,
        }));

        res.json({
            totalEvents,
            todayEvents,
            weekEvents,
            todayActiveUsers,
            weekActiveUsers,
            actionBreakdown,
            topPosts: enrichedTopPosts,
        });
    } catch (err) {
        console.error('admin analytics overview hatası:', err.message);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
};
