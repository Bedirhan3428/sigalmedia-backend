const { Tweet }              = require('../models/Tweet');
const { User }               = require('../models/User');
const Comment                = require('../models/Comment');
const { deleteFromStorage }  = require('../config/firebase');
const { sentinelScanText, sentinelScanImage, processCommunityReport } = require('../middlewares/aegis');

// ─── Sosyal Embed URL Tespiti ────────────────────────────────────────────────
function detectSocialEmbed(content) {
    if (!content) return null;

    const patterns = [
        {
            platform: 'instagram',
            regex: /https?:\/\/(www\.)?instagram\.com\/(p|reel|tv|stories|s)\/([A-Za-z0-9_\-]+)\/?[^\s]*/i,
        },
        {
            platform: 'tiktok',
            regex: /https?:\/\/((www\.)?tiktok\.com\/@[^\s/]+\/video\/\d+|vm\.tiktok\.com\/[A-Za-z0-9]+)[^\s]*/i,
        },
        {
            platform: 'youtube',
            regex: /https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_\-]+)[^\s]*/i,
        },
        {
            platform: 'twitter',
            regex: /https?:\/\/(www\.)?(twitter|x)\.com\/[^\s/]+\/status\/\d+[^\s]*/i,
        },
    ];

    for (const { platform, regex } of patterns) {
        const match = content.match(regex);
        if (match) {
            return {
                platform,
                originalUrl:  match[0],
                title:        null,
                description:  null,
                thumbnailUrl: null,
            };
        }
    }
    return null;
}

// POST /api/tweet
exports.createTweet = async (req, res) => {
    try {
        const { deviceId, content, imageUrl, imagePath } = req.body;

        console.log('📩 /api/tweet isteği:', {
            deviceId, contentLen: content?.length ?? 0,
            hasImage: typeof imageUrl === 'string' && imageUrl.length > 0,
        });

        const hasText  = typeof content === 'string' && content.trim().length > 0;
        const hasImage = typeof imageUrl === 'string' && imageUrl.startsWith('https://');

        if (!hasText && !hasImage)
            return res.status(400).json({ error: 'Tweet boş olamaz.' });
        if (hasText && content.length > 280)
            return res.status(400).json({ error: 'Metin maks. 280 karakter.' });

        const user = await User.findOne({ deviceId });
        if (!user) {
            if (hasImage) await deleteFromStorage(imagePath);
            return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
        }
        if (user.dailyLimit <= 0) {
            if (hasImage) await deleteFromStorage(imagePath);
            return res.status(403).json({ error: 'Bugünlük 3 tweet hakkın bitti!' });
        }

        const [textResult, imageResult] = await Promise.all([
            hasText  ? sentinelScanText(content.trim()) : Promise.resolve({ blocked: false }),
            hasImage ? sentinelScanImage(imageUrl)      : Promise.resolve({ blocked: false }),
        ]);

        if (textResult.blocked) {
            if (hasImage) await deleteFromStorage(imagePath);
            return res.status(400).json({
                error: 'Metinde kurallara aykırı içerik sezdik. Hakkın düşmedi.',
                aegisLayer: 1,
            });
        }
        if (imageResult.blocked) {
            await deleteFromStorage(imagePath);
            return res.status(400).json({
                error: 'Görsel YZ denetiminden geçemedi: uygunsuz içerik tespit edildi. Hakkın düşmedi.',
                aegisLayer: 1,
            });
        }

        const socialEmbed = hasText ? detectSocialEmbed(content.trim()) : null;

        if (socialEmbed) {
            console.log(`🔗 Sosyal embed tespit edildi → ${socialEmbed.platform}: ${socialEmbed.originalUrl}`);
        }

        const [tweet] = await Promise.all([
            Tweet.create({
                authorId:        deviceId,
                authorAvatar:    user.username || user.avatar,
                authorAvatarUrl: user.avatarUrl || null,
                content:         hasText ? content.trim() : '',
                imageUrl:        hasImage ? imageUrl  : null,
                imagePath:       hasImage ? imagePath : null,
                socialEmbed:     socialEmbed,
            }),
            User.updateOne({ deviceId }, { $inc: { dailyLimit: -1 } }),
        ]);

        console.log('✅ Tweet kaydedildi:', tweet._id);
        res.json({ message: 'Tweet gönderildi!', remainingLimit: user.dailyLimit - 1, tweetId: tweet._id });
    } catch (err) {
        console.error('🔥 Tweet endpoint hatası:', err);
        res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
    }
};

// DELETE /api/tweet/:tweetId
exports.deleteTweet = async (req, res) => {
    try {
        const { deviceId } = req.body;
        const tweet = await Tweet.findById(req.params.tweetId).lean();
        if (!tweet)                      return res.status(404).json({ error: 'Tweet bulunamadı.' });
        if (tweet.authorId !== deviceId) return res.status(403).json({ error: 'Yetkin yok.' });

        await Promise.all([
            tweet.imagePath ? deleteFromStorage(tweet.imagePath) : Promise.resolve(),
            Tweet.findByIdAndDelete(req.params.tweetId),
            Comment.deleteMany({ tweetId: req.params.tweetId }),
        ]);
        await User.updateOne({ deviceId, dailyLimit: { $lt: 3 } }, { $inc: { dailyLimit: 1 } });
        res.json({ message: 'Tweet silindi.' });
    } catch (err) {
        console.error('tweet sil hatası:', err);
        res.status(500).json({ error: 'Sunucu hatası!' });
    }
};

// POST /api/like/:tweetId
exports.likeTweet = async (req, res) => {
    try {
        const { deviceId } = req.body;
        const tweet = await Tweet.findById(req.params.tweetId, { authorId: 1, likedBy: 1, likes: 1 });
        if (!tweet)                           return res.status(404).json({ error: 'Tweet bulunamadı.' });
        if (tweet.authorId === deviceId)      return res.status(400).json({ error: 'Kendi tweetini beğenemezsin.' });
        if (tweet.likedBy.includes(deviceId)) return res.status(400).json({ error: 'Zaten beğendin.' });

        const updated = await Tweet.findByIdAndUpdate(
            req.params.tweetId,
            { $inc: { likes: 1 }, $push: { likedBy: deviceId } },
            { new: true, select: 'likes' }
        ).lean();
        res.json({ likes: updated.likes });
    } catch (err) {
        console.error('like hatası:', err);
        res.status(500).json({ error: 'Sunucu hatası!' });
    }
};

// DELETE /api/like/:tweetId
exports.unlikeTweet = async (req, res) => {
    try {
        const { deviceId } = req.body;
        const tweet = await Tweet.findById(req.params.tweetId, { likedBy: 1, likes: 1 });
        if (!tweet)                            return res.status(404).json({ error: 'Tweet bulunamadı.' });
        if (!tweet.likedBy.includes(deviceId)) return res.status(400).json({ error: 'Beğenmemişsin.' });

        const updated = await Tweet.findByIdAndUpdate(
            req.params.tweetId,
            { $inc: { likes: -1 }, $pull: { likedBy: deviceId } },
            { new: true, select: 'likes' }
        ).lean();
        res.json({ likes: Math.max(0, updated.likes) });
    } catch (err) {
        console.error('unlike hatası:', err);
        res.status(500).json({ error: 'Sunucu hatası!' });
    }
};

// POST /api/report/:tweetId
exports.reportTweet = async (req, res) => {
    try {
        const { deviceId, reason } = req.body;

        if (!deviceId) return res.status(400).json({ error: 'deviceId gerekli.' });

        const VALID_REASONS = ['Küfür/Hakaret', 'Spam', 'Kişisel Gizlilik İhlali', 'Diğer'];
        const sanitizedReason = VALID_REASONS.includes(reason) ? reason : 'Diğer';

        const result = await processCommunityReport(
            req.params.tweetId,
            deviceId,
            sanitizedReason,
        );

        if (result.error) return res.status(result.status).json({ error: result.error });

        res.json({
            message:     result.quarantined
                ? 'Şikayetin alındı. Bu tweet şimdi inceleme havuzunda.'
                : 'Şikayetin alındı.',
            reportCount: result.newCount,
            quarantined: result.quarantined,
        });
    } catch (err) {
        console.error('report hatası:', err);
        res.status(500).json({ error: 'Sunucu hatası!' });
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

// GET /api/posts/:id
exports.getPostById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id.match(/^[a-f\d]{24}$/i)) {
            return res.status(400).json({ error: 'Geçersiz gönderi ID formatı.' });
        }

        const tweet = await Tweet.findById(id, { likedBy: 0, reportedBy: 0 }).lean();

        if (!tweet) {
            return res.status(404).json({ error: 'Gönderi bulunamadı.' });
        }

        // FIX #3: quarantine da eklendi — zararlı olabilecek tweetler herkese açık dönmemeli
        if (['removed', 'suspended', 'quarantine'].includes(tweet.aegisStatus)) {
            return res.status(403).json({
                error: 'Bu gönderi kaldırıldı veya inceleme altında.',
            });
        }

        res.json(tweet);
    } catch (err) {
        console.error('getPostById hatası:', err);
        res.status(500).json({ error: 'Sunucu hatası!' });
    }
};