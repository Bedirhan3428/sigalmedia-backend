// src/routes/userSearch.js
// Kullanıcı arama endpointi (Keşfet + DM yeni konuşma için)

const express  = require('express');
const router   = express.Router();
const { User } = require('../models/User');

// ─── GET /api/users/search?q=... ─────────────────────────────────────────────
router.get('/users/search', async (req, res) => {
  try {
    const { q = '', limit = 20 } = req.query;
    if (!q.trim()) return res.json([]);

    const sanitized = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex     = new RegExp(sanitized, 'i');

    const users = await User.find(
      {
        isBot: { $ne: true },
        $or:   [{ username: regex }, { avatar: regex }],
      },
      { deviceId: 1, username: 1, avatar: 1, avatarUrl: 1, followers: 1, bio: 1 }
    )
    .limit(Math.min(parseInt(limit), 50))
    .lean();

    const results = users.map(u => ({
      deviceId:     u.deviceId,
      username:     u.username || u.avatar,
      avatarUrl:    u.avatarUrl || null,
      followerCount: u.followers?.length || 0,
      bio:          u.bio || null,
    }));

    res.json(results);
  } catch (err) {
    console.error('users/search hatası:', err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// ─── GET /api/users/suggested/:deviceId ──────────────────────────────────────
// Takip önerileri: henüz takip edilmeyenlerden rastgele 10 kişi
router.get('/users/suggested/:deviceId', async (req, res) => {
  try {
    const user = await User.findOne({ deviceId: req.params.deviceId }, { following: 1 }).lean();
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

    const excluded = [...(user.following || []), req.params.deviceId];

    const suggested = await User.aggregate([
      {
        $match: {
          deviceId: { $nin: excluded },
          isBot:    { $ne: true },
        }
      },
      { $sample: { size: 10 } },
      {
        $project: {
          deviceId: 1, username: 1, avatar: 1, avatarUrl: 1,
          followerCount: { $size: { $ifNull: ['$followers', []] } },
        }
      },
    ]);

    res.json(suggested.map(u => ({
      deviceId:     u.deviceId,
      username:     u.username || u.avatar,
      avatarUrl:    u.avatarUrl || null,
      followerCount: u.followerCount || 0,
    })));
  } catch (err) {
    console.error('users/suggested hatası:', err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

module.exports = router;
