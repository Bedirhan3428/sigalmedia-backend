const Comment                = require('../models/Comment');
const { Tweet }              = require('../models/Tweet');
const { User }               = require('../models/User');
// sentinelScanText yerine sentinelScanComment'i import ediyoruz
const { sentinelScanComment } = require('../middlewares/aegis'); 

// POST /api/comment/:tweetId
exports.createComment = async (req, res) => {
    try {
        const { deviceId, content } = req.body;
        if (!content?.trim())     return res.status(400).json({ error: "Yorum boş olamaz." });
        if (content.length > 280) return res.status(400).json({ error: "Yorum çok uzun." });

        const [user, tweetExists] = await Promise.all([
            User.findOne({ deviceId }, { username: 1, avatar: 1, avatarUrl: 1 }).lean(),
            Tweet.exists({ _id: req.params.tweetId, aegisStatus: { $ne: 'removed' } }),
        ]);
        if (!user)        return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        if (!tweetExists) return res.status(404).json({ error: "Tweet bulunamadı." });

        // Sentinel Scan (Artık yorumlara özel olan fonksiyonu kullanıyor)
        const { blocked } = await sentinelScanComment(content);
        if (blocked) return res.status(400).json({ error: "Yorumunda uygunsuz içerik tespit edildi." });

        const [comment] = await Promise.all([
            Comment.create({
                tweetId:         req.params.tweetId,
                authorId:        deviceId,
                authorAvatar:    user.username || user.avatar,
                authorAvatarUrl: user.avatarUrl || null,
                content:         content.trim(),
            }),
            Tweet.findByIdAndUpdate(req.params.tweetId, { $inc: { commentCount: 1 } }),
        ]);

        res.json({ comment });
    } catch (err) {
        console.error("Yorum hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// GET /api/comments/:tweetId
exports.getComments = async (req, res) => {
    try {
        const comments = await Comment.find(
            { tweetId: req.params.tweetId },
            { likedBy: 0 }
        ).sort({ createdAt: 1 }).lean();
        res.json(comments);
    } catch (err) {
        console.error("comments get hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// DELETE /api/comment/:commentId
exports.deleteComment = async (req, res) => {
    try {
        const { deviceId } = req.body;
        const comment = await Comment.findById(req.params.commentId).lean();
        if (!comment)                      return res.status(404).json({ error: "Yorum bulunamadı." });
        if (comment.authorId !== deviceId) return res.status(403).json({ error: "Yetkin yok." });

        await Promise.all([
            Comment.findByIdAndDelete(req.params.commentId),
            Tweet.findByIdAndUpdate(comment.tweetId, { $inc: { commentCount: -1 } }),
        ]);
        res.json({ message: "Yorum silindi." });
    } catch (err) {
        console.error("yorum sil hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// POST /api/like-comment/:commentId
exports.likeComment = async (req, res) => {
    try {
        const { deviceId } = req.body;
        const comment = await Comment.findById(req.params.commentId, { authorId: 1, likedBy: 1 });
        if (!comment)                           return res.status(404).json({ error: "Yorum bulunamadı." });
        if (comment.authorId === deviceId)      return res.status(400).json({ error: "Kendi yorumunu beğenemezsin." });
        if (comment.likedBy.includes(deviceId)) return res.status(400).json({ error: "Zaten beğendin." });

        const updated = await Comment.findByIdAndUpdate(
            req.params.commentId,
            { $inc: { likes: 1 }, $push: { likedBy: deviceId } },
            { new: true, select: 'likes' }
        ).lean();
        res.json({ likes: updated.likes });
    } catch (err) {
        console.error("like-comment hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};

// DELETE /api/like-comment/:commentId
exports.unlikeComment = async (req, res) => {
    try {
        const { deviceId } = req.body;
        const comment = await Comment.findById(req.params.commentId, { likedBy: 1, likes: 1 });
        if (!comment)                            return res.status(404).json({ error: "Yorum bulunamadı." });
        if (!comment.likedBy.includes(deviceId)) return res.status(400).json({ error: "Beğenmemişsin." });

        const updated = await Comment.findByIdAndUpdate(
            req.params.commentId,
            { $inc: { likes: -1 }, $pull: { likedBy: deviceId } },
            { new: true, select: 'likes' }
        ).lean();
        res.json({ likes: Math.max(0, updated.likes) });
    } catch (err) {
        console.error("unlike-comment hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
};