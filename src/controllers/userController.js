const { User }  = require('../models/User');
const { Tweet } = require('../models/Tweet');
const Comment   = require('../models/Comment');
const AVATARS   = require('../constants/avatars');

// GET /api/avatars
exports.getAvatars = (req, res) => {
    res.json(AVATARS);
};

// POST /api/init-user
exports.initUser = async (req, res) => {
    try {
        const { deviceId, username, avatarUrl } = req.body;
        let user = await User.findOne({ deviceId }).lean();

        if (!user) {
            if (username) {
                const exists = await User.exists({ username: username.trim() });
                if (exists) return res.status(400).json({ error: "Bu kullanıcı adı zaten alınmış." });
            }
            const name = (username || 'Anonim').trim();
            user = await User.create({ deviceId, username: name, avatar: name, avatarUrl: avatarUrl || null });
        }

        res.json({ message: "Kullanıcı hazır!", user });
    } catch (err) {
        console.error("init-user hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// GET /api/user/:deviceId
exports.getUser = async (req, res) => {
    try {
        const user = await User.findOne({ deviceId: req.params.deviceId }).lean();
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        res.json({ user });
    } catch (err) {
        console.error("user get hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// PUT /api/user/:deviceId
exports.updateUser = async (req, res) => {
    try {
        const { username, avatarUrl, bio } = req.body;
        const { deviceId } = req.params;

        if (username) {
            const trimmed = username.trim();
            if (trimmed.length < 2 || trimmed.length > 30)
                return res.status(400).json({ error: "Kullanıcı adı 2-30 karakter olmalı." });
            const exists = await User.exists({ username: trimmed, deviceId: { $ne: deviceId } });
            if (exists) return res.status(400).json({ error: "Bu kullanıcı adı zaten alınmış." });
        }

        const update = {};
        if (username)                { update.username = username.trim(); update.avatar = username.trim(); }
        if (avatarUrl !== undefined) { update.avatarUrl = avatarUrl; }
        if (bio !== undefined)       { update.bio = (bio || '').slice(0, 150); }

        const user = await User.findOneAndUpdate({ deviceId }, { $set: update }, { new: true }).lean();
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });

        if (username || avatarUrl !== undefined) {
            const tweetUpdate   = {};
            const commentUpdate = {};
            if (username) {
                tweetUpdate.authorAvatar   = username.trim();
                commentUpdate.authorAvatar = username.trim();
            }
            if (avatarUrl !== undefined) {
                tweetUpdate.authorAvatarUrl   = avatarUrl;
                commentUpdate.authorAvatarUrl = avatarUrl;
            }
            await Promise.all([
                Tweet.updateMany({ authorId: deviceId },   { $set: tweetUpdate }),
                Comment.updateMany({ authorId: deviceId }, { $set: commentUpdate }),
            ]);
        }

        res.json({ user });
    } catch (err) {
        console.error("user put hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// POST /api/save/:tweetId
exports.savePost = async (req, res) => {
    try {
        const { deviceId } = req.body;
        if (!deviceId) return res.status(400).json({ error: "deviceId gerekli." });

        const tweet = await Tweet.findById(req.params.tweetId, { _id: 1 }).lean();
        if (!tweet) return res.status(404).json({ error: "Gönderi bulunamadı." });

        const user = await User.findOne({ deviceId }, { savedPosts: 1 }).lean();
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        if (user.savedPosts?.includes(req.params.tweetId))
            return res.status(400).json({ error: "Zaten kaydedilmiş." });

        await User.updateOne({ deviceId }, { $push: { savedPosts: req.params.tweetId } });
        res.json({ message: "Kaydedildi." });
    } catch (err) {
        console.error("save hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// DELETE /api/save/:tweetId
exports.unsavePost = async (req, res) => {
    try {
        const { deviceId } = req.body;
        if (!deviceId) return res.status(400).json({ error: "deviceId gerekli." });

        await User.updateOne({ deviceId }, { $pull: { savedPosts: req.params.tweetId } });
        res.json({ message: "Kayıt kaldırıldı." });
    } catch (err) {
        console.error("unsave hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// GET /api/saved-posts/:deviceId
exports.getSavedPosts = async (req, res) => {
    try {
        const user = await User.findOne({ deviceId: req.params.deviceId }, { savedPosts: 1 }).lean();
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });

        const savedIds = user.savedPosts || [];
        if (savedIds.length === 0) return res.json([]);

        const tweets = await Tweet.find(
            { _id: { $in: savedIds }, aegisStatus: { $in: ['active', 'cleared'] } },
            { likedBy: 0, reportedBy: 0 }
        ).sort({ createdAt: -1 }).lean();
        res.json(tweets);
    } catch (err) {
        console.error("saved-posts hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// GET /api/saved-ids/:deviceId
exports.getSavedIds = async (req, res) => {
    try {
        const user = await User.findOne({ deviceId: req.params.deviceId }, { savedPosts: 1 }).lean();
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        res.json({ savedIds: user.savedPosts || [] });
    } catch (err) {
        console.error("saved-ids hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// GET /api/public-user/:deviceId?viewer=<viewerDeviceId>
exports.getPublicUser = async (req, res) => {
    try {
        const user = await User.findOne(
            { deviceId: req.params.deviceId },
            { deviceId: 1, username: 1, avatar: 1, avatarUrl: 1, followers: 1, following: 1 }
        ).lean();
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });

        const viewerId = req.query.viewer || '';
        const isMutual = viewerId
            && user.followers.includes(viewerId)
            && user.following.includes(viewerId);

        res.json({
            deviceId:       user.deviceId,
            username:       user.username || user.avatar,
            avatarUrl:      user.avatarUrl || null,
            followerCount:  user.followers.length,
            followingCount: user.following.length,
            followers:      isMutual ? user.followers : [],
            following:      isMutual ? user.following : [],
            isMutual:       !!isMutual,
        });
    } catch (err) {
        console.error("public-user hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// POST /api/follow
exports.follow = async (req, res) => {
    try {
        const { followerId, targetId } = req.body;
        if (!followerId || !targetId || followerId === targetId)
            return res.status(400).json({ error: "Geçersiz istek." });

        const [follower, target] = await Promise.all([
            User.findOne({ deviceId: followerId }),
            User.findOne({ deviceId: targetId }),
        ]);
        if (!follower || !target) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        if (follower.following.includes(targetId))
            return res.status(400).json({ error: "Zaten takip ediyorsun." });

        await Promise.all([
            User.updateOne({ deviceId: followerId }, { $push: { following: targetId } }),
            User.updateOne({ deviceId: targetId },   { $push: { followers: followerId } }),
        ]);
        res.json({ followerCount: target.followers.length + 1 });
    } catch (err) {
        console.error("follow hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// DELETE /api/follow
exports.unfollow = async (req, res) => {
    try {
        const { followerId, targetId } = req.body;
        if (!followerId || !targetId) return res.status(400).json({ error: "Geçersiz istek." });

        const target = await User.findOne({ deviceId: targetId }, { followers: 1 }).lean();
        if (!target) return res.status(404).json({ error: "Kullanıcı bulunamadı." });

        await Promise.all([
            User.updateOne({ deviceId: followerId }, { $pull: { following: targetId } }),
            User.updateOne({ deviceId: targetId },   { $pull: { followers: followerId } }),
        ]);
        res.json({ followerCount: Math.max(0, target.followers.length - 1) });
    } catch (err) {
        console.error("unfollow hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// GET /api/following-ids/:deviceId
exports.getFollowingIds = async (req, res) => {
    try {
        const user = await User.findOne({ deviceId: req.params.deviceId }, { following: 1 }).lean();
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        res.json({ followingIds: user.following || [] });
    } catch (err) {
        console.error("following-ids hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// GET /api/followers/:deviceId
exports.getFollowers = async (req, res) => {
    try {
        const user = await User.findOne({ deviceId: req.params.deviceId }, { followers: 1 }).lean();
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        const users = await User.find(
            { deviceId: { $in: user.followers } },
            { deviceId: 1, username: 1, avatar: 1, avatarUrl: 1, followers: 1 }
        ).lean();
        res.json(users.map(u => ({
            deviceId: u.deviceId, username: u.username || u.avatar,
            avatarUrl: u.avatarUrl || null, followerCount: u.followers.length,
        })));
    } catch (err) {
        console.error("followers hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// GET /api/following/:deviceId
exports.getFollowing = async (req, res) => {
    try {
        const user = await User.findOne({ deviceId: req.params.deviceId }, { following: 1 }).lean();
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        const users = await User.find(
            { deviceId: { $in: user.following } },
            { deviceId: 1, username: 1, avatar: 1, avatarUrl: 1, followers: 1 }
        ).lean();
        res.json(users.map(u => ({
            deviceId: u.deviceId, username: u.username || u.avatar,
            avatarUrl: u.avatarUrl || null, followerCount: u.followers.length,
        })));
    } catch (err) {
        console.error("following hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// GET /api/liked-ids/:deviceId
exports.getLikedIds = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const [tweets, comments] = await Promise.all([
            Tweet.find({ likedBy: deviceId }, { _id: 1 }).lean(),
            Comment.find({ likedBy: deviceId }, { _id: 1 }).lean(),
        ]);
        res.json({
            tweetIds:   tweets.map(t => t._id.toString()),
            commentIds: comments.map(c => c._id.toString()),
        });
    } catch (err) {
        console.error("liked-ids hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// GET /api/my-likes/:deviceId
exports.getMyLikes = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const [likedTweets, likedComments] = await Promise.all([
            Tweet.find({ likedBy: deviceId }, { likedBy: 0 }).sort({ createdAt: -1 }).lean(),
            Comment.find({ likedBy: deviceId }, { likedBy: 0 }).sort({ createdAt: -1 }).lean(),
        ]);
        res.json({ likedTweets, likedComments });
    } catch (err) {
        console.error("my-likes hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};