// src/routes/explore.js
// Keşfet algoritması — kişiselleştirilmiş feed

const express  = require('express');
const router   = express.Router();
const { Tweet } = require('../models/Tweet');
const { User }  = require('../models/User');
const Comment   = require('../models/Comment');

const ACTIVE_FILTER = {
  $or: [
    { aegisStatus: { $exists: false } },
    { aegisStatus: { $in: ['active', 'cleared'] } },
  ],
};

// ─── GET /api/explore ─────────────────────────────────────────────────────────
// Gelişmiş keşfet algoritması:
// 1. Kullanıcının takip ettiği kişilerin recent tweetleri (30%)
// 2. Yüksek etkileşimli içerikler (40%)
// 3. Yeni içerikler (30%)
// Tümünü karıştır, duplicate'leri kaldır, paginate et.
router.get('/explore', async (req, res) => {
  try {
    const { deviceId, page = 1, limit = 30 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let followingIds = [];
    if (deviceId) {
      const user = await User.findOne({ deviceId }, { following: 1 }).lean();
      followingIds = user?.following || [];
    }

    const sevenDaysAgo  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const threeDaysAgo  = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    const [trending, followingFeed, fresh] = await Promise.all([
      // 1. Trending: high interaction last 7 days
      Tweet.aggregate([
        {
          $match: {
            ...ACTIVE_FILTER,
            createdAt: { $gte: sevenDaysAgo },
          }
        },
        {
          $addFields: {
            interaction: {
              $add: [{ $multiply: ['$likes', 2] }, { $ifNull: ['$commentCount', 0] }]
            }
          }
        },
        { $sort: { interaction: -1 } },
        { $limit: 50 },
        { $sample: { size: Math.round(parseInt(limit) * 0.4) } },
        { $project: { likedBy: 0, reportedBy: 0 } },
      ]),

      // 2. Following feed (if logged in)
      followingIds.length > 0
        ? Tweet.find(
            { authorId: { $in: followingIds }, ...ACTIVE_FILTER, createdAt: { $gte: threeDaysAgo } },
            { likedBy: 0, reportedBy: 0 }
          ).sort({ createdAt: -1 }).limit(Math.round(parseInt(limit) * 0.3)).lean()
        : Promise.resolve([]),

      // 3. Fresh content
      Tweet.find(
        { ...ACTIVE_FILTER },
        { likedBy: 0, reportedBy: 0 }
      ).sort({ createdAt: -1 }).limit(Math.round(parseInt(limit) * 0.3)).lean(),
    ]);

    // Merge, deduplicate, shuffle
    const seen  = new Set();
    const merged = [...followingFeed, ...trending, ...fresh].filter(t => {
      const id = t._id.toString();
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    // Fisher-Yates shuffle
    for (let i = merged.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [merged[i], merged[j]] = [merged[j], merged[i]];
    }

    // Paginate
    const paginated = merged.slice(skip, skip + parseInt(limit));

    res.json({
      posts: paginated,
      page:  parseInt(page),
      hasMore: paginated.length === parseInt(limit),
    });
  } catch (err) {
    console.error('explore hatası:', err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// ─── GET /api/explore/hashtag/:tag ───────────────────────────────────────────
router.get('/explore/hashtag/:tag', async (req, res) => {
  try {
    const tag   = decodeURIComponent(req.params.tag).replace(/^#/, '');
    const regex = new RegExp(`#${tag}`, 'i');

    const posts = await Tweet.find(
      { ...ACTIVE_FILTER, content: regex },
      { likedBy: 0, reportedBy: 0 }
    ).sort({ score: -1, createdAt: -1 }).limit(50).lean();

    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// ─── GET /api/explore/trending-tags ──────────────────────────────────────────
router.get('/explore/trending-tags', async (req, res) => {
  try {
    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    // Extract hashtags from recent tweets
    const tweets = await Tweet.find(
      { ...ACTIVE_FILTER, createdAt: { $gte: since }, content: /#[\wğüşıöçĞÜŞİÖÇ]+/i },
      { content: 1 }
    ).limit(500).lean();

    const tagCounts = {};
    tweets.forEach(t => {
      const tags = (t.content || '').match(/#[\wğüşıöçĞÜŞİÖÇ]+/gi) || [];
      tags.forEach(tag => {
        const key = tag.toLowerCase();
        tagCounts[key] = (tagCounts[key] || 0) + 1;
      });
    });

    const sorted = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([tag, count]) => ({ tag, count }));

    res.json(sorted);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

module.exports = router;
