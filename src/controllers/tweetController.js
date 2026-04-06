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
        const { deviceId, content, media, mediaType } = req.body;

        // Geriye dönük uyumluluk için tekil görsel desteği (opsiyonel ama iyi olur)
        let mediaItems = media || [];
        if (!media && req.body.imageUrl) {
            // Hikaye (story) ise item tipi 'image' veya 'video' olmalı (schema kısıtı)
            let itemType = req.body.mediaType || 'image';
            if (itemType === 'story') {
                // stories/videos/... şeklinde geldiği için '/' kontrolünü kaldırıyoruz
                itemType = req.body.imagePath?.includes('videos') ? 'video' : 'image';
            }
            mediaItems = [{ url: req.body.imageUrl, path: req.body.imagePath, type: itemType }];
            
            console.log('📝 Story media infer sonucu:', { original: req.body.mediaType, inferred: itemType, path: req.body.imagePath });
        }

        console.log('📩 /api/tweet isteği:', {
            deviceId, contentLen: content?.length ?? 0,
            mediaCount: mediaItems.length,
        });

        const hasText  = typeof content === 'string' && content.trim().length > 0;
        const hasMedia = mediaItems.length > 0;

        if (!hasText && !hasMedia)
            return res.status(400).json({ error: 'Gönderi boş olamaz.' });
        if (hasText && content.length > 280)
            return res.status(400).json({ error: 'Metin maks. 280 karakter.' });

        const user = await User.findOne({ deviceId });
        if (!user) {
            for (const item of mediaItems) await deleteFromStorage(item.path);
            return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
        }
        if (user.dailyLimit <= 0) {
            for (const item of mediaItems) await deleteFromStorage(item.path);
            return res.status(403).json({ error: 'Bugünlük 10 gönderi hakkın bitti!' });
        }

        // Metin taraması
        const textResult = hasText ? await sentinelScanText(content.trim()) : { blocked: false };
        if (textResult.blocked) {
            for (const item of mediaItems) await deleteFromStorage(item.path);
            return res.status(400).json({
                error: 'Metinde kurallara aykırı içerik sezdik. Hakkın düşmedi.',
                aegisLayer: 1,
            });
        }

        // Tüm medyaları tara
        for (const item of mediaItems) {
            if (item.type === 'image') {
                const imgResult = await sentinelScanImage(item.url);
                if (imgResult.blocked) {
                    // Hepsi silinsin
                    for (const m of mediaItems) await deleteFromStorage(m.path);
                    return res.status(400).json({
                        error: 'Görsellerden biri YZ denetiminden geçemedi. Hakkın düşmedi.',
                        aegisLayer: 1,
                    });
                }
            }
        }

        const socialEmbed = hasText ? detectSocialEmbed(content.trim()) : null;

        // Bot postları direkt yayına, gerçek kullanıcı postları onay havuzuna
        const initialStatus = user.isBot ? 'active' : 'pending';

        const [tweet] = await Promise.all([
            Tweet.create({
                authorId:        deviceId,
                authorAvatar:    user.username || user.avatar,
                authorAvatarUrl: user.avatarUrl || null,
                content:         hasText ? content.trim() : '',
                media:           mediaItems,
                // İlk görseli geriye dönük uyumluluk için ana alanlara da koyalım
                imageUrl:        mediaItems[0]?.url || null,
                imagePath:       mediaItems[0]?.path || null,
                mediaType:       mediaType || (mediaItems.length > 1 ? 'multi' : (mediaItems[0]?.type || null)),
                socialEmbed:     socialEmbed,
                aegisStatus:     initialStatus,
            }),
            User.updateOne({ deviceId }, { $inc: { dailyLimit: -1 } }),
        ]);

        console.log(`✅ Tweet kaydedildi: ${tweet._id} | status: ${initialStatus}`);
        res.json({ message: 'Tweet gönderildi!', remainingLimit: user.dailyLimit - 1, tweetId: tweet._id });
    } catch (err) {
        console.error('🔥 Tweet endpoint hatası:', err.message);
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

        const deletePromises = [
            Tweet.findByIdAndDelete(req.params.tweetId),
            Comment.deleteMany({ tweetId: req.params.tweetId }),
        ];

        // Tüm medyaları sil
        if (tweet.media && tweet.media.length > 0) {
            tweet.media.forEach(m => {
                if (m.path) deletePromises.push(deleteFromStorage(m.path));
            });
        } else if (tweet.imagePath) {
            // Eski tip tekil görsel
            deletePromises.push(deleteFromStorage(tweet.imagePath));
        }

        await Promise.all(deletePromises);
        await User.updateOne({ deviceId, dailyLimit: { $lt: 10 } }, { $inc: { dailyLimit: 1 } });
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
            { authorId: req.params.deviceId, mediaType: { $ne: 'story' } },
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

// POST /api/tweet/:tweetId/view
exports.viewStory = async (req, res) => {
    try {
        const { deviceId } = req.body;
        if (!deviceId) return res.status(400).json({ error: 'deviceId gerekli.' });

        await Tweet.findByIdAndUpdate(
            req.params.tweetId,
            { $addToSet: { viewers: deviceId } }
        );
        res.json({ success: true });
    } catch (err) {
        console.error('viewStory hatası:', err);
        res.status(500).json({ error: 'Sunucu hatası!' });
    }
};