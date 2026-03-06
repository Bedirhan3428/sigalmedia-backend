require('dotenv').config();
const express   = require('express');
const mongoose  = require('mongoose');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const cron      = require('node-cron');
const Groq      = require('groq-sdk');
const admin     = require('firebase-admin');

// ─── FİREBASE ADMIN ─────────────────────────────────────────────────────────
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'sigalmedia.firebasestorage.app',
    });
    console.log('✅ Firebase Admin başlatıldı.');
} catch (err) {
    console.warn('⚠️ Firebase Admin başlatılamadı (Storage silme devre dışı):', err.message);
}

async function deleteFromStorage(imagePath) {
    if (!imagePath) return;
    try {
        await admin.storage().bucket().file(imagePath).delete();
        console.log('🗑️ Storage silindi:', imagePath);
    } catch (err) {
        console.warn('⚠️ Storage silinemedi:', imagePath, err.message);
    }
}

// ─── APP & GROQ ─────────────────────────────────────────────────────────────
const app  = express();
app.set('trust proxy', 1);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.use(express.json({ limit: '1mb' }));

const corsOptions = {
  origin: [
    'https://sigalmedia.site', 
    'https://www.sigalmedia.site',
    'http://localhost:3000', // Kendi bilgisayarında test yapabilmek için
    'http://localhost:5173'  // Vite kullanıyorsan bu portu da ekle
  ],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// ─── RATE LİMİTERLAR ────────────────────────────────────────────────────────
// Genel limiter
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 400,
    message: "Çok fazla deneme yaptınız, lütfen biraz bekleyip tekrar deneyin."
});
app.use(generalLimiter);

// Tweet'e özel sıkı limiter (deviceId bazlı)
const tweetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 saat
    max: 7,
    keyGenerator: (req) => req.body?.deviceId || req.ip,
    message: "Saatte en fazla 7 tweet denemesi yapılabilir."
});

// Yorum'a özel limiter
const commentLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 dakika
    max: 15,
    keyGenerator: (req) => req.body?.deviceId || req.ip,
    message: "Çok hızlı yorum yapıyorsunuz, biraz bekleyin."
});

// ─── MONGODB BAĞLANTISI ──────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('✅ MongoDB Bağlantısı Başarılı!');
        // Index'leri garantiye al
        await Promise.all([
            Tweet.collection.createIndex({ score: -1, createdAt: -1 }),
            Tweet.collection.createIndex({ authorId: 1, createdAt: -1 }),
            Tweet.collection.createIndex({ createdAt: -1 }),
            Tweet.collection.createIndex({ likedBy: 1 }),
            Tweet.collection.createIndex({ createdAt: 1 }), // temizlik cron için
            Comment.collection.createIndex({ tweetId: 1 }),
            Comment.collection.createIndex({ likedBy: 1 }),
            User.collection.createIndex({ deviceId: 1 }, { unique: true }),
            User.collection.createIndex({ username: 1 }),
        ]);
        console.log('✅ Index\'ler hazır.');
    })
    .catch(err => console.error('❌ Veritabanı Hatası:', err));

// ─── AVATAR LİSTESİ ─────────────────────────────────────────────────────────
const AVATARS = [
    // --- ERKEK KARAKTERLER ---
    { id: 'av1',  url: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Felix&accessories=prescription01' },
    { id: 'av2',  url: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Jack&mouth=serious' },
    { id: 'av3',  url: 'https://api.dicebear.com/9.x/avataaars/svg?seed=George&eyes=wink' },
    // av4 Düzenlendi: "shortHair" yerine "shortHairShortFlat" kullanıldı (Daha uyumlu)
    { id: 'av4',  url: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Harvey&top=shortHairShortFlat' }, 
    { id: 'av5',  url: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Liam&top=shaggy' },
    { id: 'av6',  url: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Mason&accessories=round' },
    { id: 'av7',  url: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Noah&facialHair=beardLight' },
    { id: 'av8',  url: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Ethan&mouth=smile' },

    // --- KIZ KARAKTERLER ---
    { id: 'av9',  url: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Lily&accessories=prescription02' },
    { id: 'av10', url: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Aneka&eyes=surprised' },
    { id: 'av11', url: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Zoe&mouth=smile' },
    // av12 Düzenlendi: "longHair" yerine spesifik "longHairNotTooLong" eklendi
    { id: 'av12', url: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Sasha&top=longHairNotTooLong' },
    { id: 'av13', url: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Willow&top=bob' },
    { id: 'av14', url: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Aria&accessories=round' },
    { id: 'av15', url: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Luna&top=curvy' },
    { id: 'av16', url: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Maya&mouth=tongue' },

    // --- PERSONAS & LORELEI ---
    { id: 'av17', url: 'https://api.dicebear.com/9.x/personas/svg?seed=Leo' },
    { id: 'av18', url: 'https://api.dicebear.com/9.x/personas/svg?seed=Sophie' },
    { id: 'av19', url: 'https://api.dicebear.com/9.x/lorelei/svg?seed=Bastian' },
    { id: 'av20', url: 'https://api.dicebear.com/9.x/lorelei/svg?seed=Mila' },
    // av21 ve av22 Düzenlendi: Noto-emoji yerine daha stabil olan "bottts" veya "open-peeps" eklenebilir ama 
    // isteğin üzerine emoji kütüphanesini daha basit bir seed ile güncelledim:
    { id: 'av21', url: 'https://api.dicebear.com/9.x/noto-emoji/svg?seed=Grin' }, 
    { id: 'av22', url: 'https://api.dicebear.com/9.x/noto-emoji/svg?seed=Cool' }, 
    { id: 'av23', url: 'https://api.dicebear.com/9.x/pixel-art/svg?seed=Hero' },
    { id: 'av24', url: 'https://api.dicebear.com/9.x/pixel-art/svg?seed=Princess' }
];

// ─── ŞEMALAR ────────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
    deviceId:      { type: String, required: true, unique: true },
    username:      { type: String, default: 'Anonim' },
    avatar:        { type: String, default: 'Anonim' },
    avatarUrl:     { type: String, default: null },
    dailyLimit:    { type: Number, default: 3 },
    lastResetDate: { type: Date,   default: Date.now },
    followers:     [{ type: String }],
    following:     [{ type: String }],
});
const User = mongoose.model('User', userSchema);

const commentSchema = new mongoose.Schema({
    tweetId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Tweet', required: true },
    authorId:        { type: String, required: true },
    authorAvatar:    { type: String, required: true },
    authorAvatarUrl: { type: String, default: null },
    content:         { type: String, required: true, maxlength: 280 },
    likes:           { type: Number, default: 0 },
    likedBy:         [{ type: String }],
    createdAt:       { type: Date, default: Date.now }
});
const Comment = mongoose.model('Comment', commentSchema);

const tweetSchema = new mongoose.Schema({
    authorId:        { type: String, required: true },
    authorAvatar:    { type: String, required: true },
    authorAvatarUrl: { type: String, default: null },
    content:         { type: String, default: '' },
    imageUrl:        { type: String, default: null },
    imagePath:       { type: String, default: null },
    likes:           { type: Number, default: 0 },
    likedBy:         [{ type: String }],
    commentCount:    { type: Number, default: 0 },
    score:           { type: Number, default: 5 },
    createdAt:       { type: Date, default: Date.now }
});
const Tweet = mongoose.model('Tweet', tweetSchema);

// ─── MODERATION HELPERs ─────────────────────────────────────────────────────
async function moderateText(text) {
    const res = await groq.chat.completions.create({
        messages: [
            {
                role: "system",
                content: "Sen lise öğrencileri için bir moderatörsün. Metinde ağır küfür, hakaret, zorbalık veya nefret söylemi varsa sadece 'VAR' yaz. Yoksa 'YOK' yaz. Başka kelime yazma."
            },
            { role: "user", content: text }
        ],
        model: "llama-3.3-70b-versatile",
    });
    return res.choices[0].message.content.trim().toUpperCase().includes("VAR");
}

async function moderateImageUrl(imageUrl) {
    try {
        const res = await groq.chat.completions.create({
            messages: [{
                role: "user",
                content: [
                    {
                        type: "image_url",
                        image_url: { url: imageUrl }
                    },
                    {
                        type: "text",
                        text: `Bu görseli analiz et. Aşağıdaki durumlardan HERHANGİ BİRİ varsa sadece "RED" yaz:
1. Bir insan yüzü veya net seçilebilen gerçek bir insan bedeni
2. Çıplaklık veya müstehcenlik
3. Kan, şiddet veya vahşet
4. Ekran görüntüsünde açıkça görünen gerçek isim, soyisim veya telefon/TC numarası

Yukarıdakilerin HİÇBİRİ yoksa (mekan, nesne, meme, sticker, ekran görüntüsü vb.) sadece "ONAY" yaz.
SADECE tek kelime: RED veya ONAY`
                    }
                ]
            }],
            model: "llama-3.2-11b-vision-preview",
            max_tokens: 10,
        });
        const answer = res.choices[0].message.content.trim().toUpperCase();
        console.log(`🖼️ Görsel denetim → ${answer}`);
        return answer.includes("RED");
    } catch (err) {
        console.error("⚠️ Görsel moderasyon hatası (geçildi):", err.message);
        return false;
    }
}

// ─── ENDPOINTS ──────────────────────────────────────────────────────────────

// 0. Avatar listesi
app.get('/api/avatars', (req, res) => {
    res.json(AVATARS);
});

// 1. Kullanıcı Başlatma / Kayıt
app.post('/api/init-user', async (req, res) => {
    try {
        const { deviceId, username, avatarUrl } = req.body;
        let user = await User.findOne({ deviceId }).lean();
        if (!user) {
            if (username) {
                const exists = await User.exists({ username: username.trim() });
                if (exists) return res.status(400).json({ error: "Bu kullanıcı adı zaten alınmış." });
            }
            const name = (username || 'Anonim').trim();
            user = await User.create({
                deviceId,
                username:  name,
                avatar:    name,
                avatarUrl: avatarUrl || null,
            });
        }
        res.json({ message: "Kullanıcı hazır!", user });
    } catch (err) {
        console.error("init-user hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
});

// 2. Kullanıcı Bilgisi
app.get('/api/user/:deviceId', async (req, res) => {
    try {
        const user = await User.findOne({ deviceId: req.params.deviceId }).lean();
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        res.json({ user });
    } catch (err) {
        console.error("user get hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
});

// 2a. Profil Güncelle (username + avatarUrl)
app.put('/api/user/:deviceId', async (req, res) => {
    try {
        const { username, avatarUrl } = req.body;
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

        const user = await User.findOneAndUpdate(
            { deviceId },
            { $set: update },
            { new: true }
        ).lean();
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });

        // Tweet ve yorumları paralel güncelle — bulkWrite ile
        if (username || avatarUrl !== undefined) {
            const tweetUpdate = {};
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
                Tweet.updateMany({ authorId: deviceId }, { $set: tweetUpdate }),
                Comment.updateMany({ authorId: deviceId }, { $set: commentUpdate }),
            ]);
        }

        res.json({ user });
    } catch (err) {
        console.error("user put hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
});

// 2b. Herkese açık profil
app.get('/api/public-user/:deviceId', async (req, res) => {
    try {
        const user = await User.findOne(
            { deviceId: req.params.deviceId },
            { deviceId: 1, username: 1, avatar: 1, avatarUrl: 1, followers: 1, following: 1 }
        ).lean();
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        res.json({
            deviceId:       user.deviceId,
            username:       user.username || user.avatar,
            avatarUrl:      user.avatarUrl || null,
            followerCount:  user.followers.length,
            followingCount: user.following.length,
        });
    } catch (err) {
        console.error("public-user hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
});

// 2c. Takip Et
app.post('/api/follow', async (req, res) => {
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
});

// 2d. Takibi Bırak
app.delete('/api/follow', async (req, res) => {
    try {
        const { followerId, targetId } = req.body;
        if (!followerId || !targetId)
            return res.status(400).json({ error: "Geçersiz istek." });

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
});

// 2e. Takip edilen kişilerin ID'leri
app.get('/api/following-ids/:deviceId', async (req, res) => {
    try {
        const user = await User.findOne({ deviceId: req.params.deviceId }, { following: 1 }).lean();
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        res.json({ followingIds: user.following || [] });
    } catch (err) {
        console.error("following-ids hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
});

// 2g. Takipçi listesi
app.get('/api/followers/:deviceId', async (req, res) => {
    try {
        const user = await User.findOne({ deviceId: req.params.deviceId }, { followers: 1 }).lean();
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        const users = await User.find(
            { deviceId: { $in: user.followers } },
            { deviceId: 1, username: 1, avatar: 1, avatarUrl: 1, followers: 1 }
        ).lean();
        res.json(users.map(u => ({
            deviceId:      u.deviceId,
            username:      u.username || u.avatar,
            avatarUrl:     u.avatarUrl || null,
            followerCount: u.followers.length,
        })));
    } catch (err) {
        console.error("followers hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
});

// 2h. Takip edilenler listesi
app.get('/api/following/:deviceId', async (req, res) => {
    try {
        const user = await User.findOne({ deviceId: req.params.deviceId }, { following: 1 }).lean();
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        const users = await User.find(
            { deviceId: { $in: user.following } },
            { deviceId: 1, username: 1, avatar: 1, avatarUrl: 1, followers: 1 }
        ).lean();
        res.json(users.map(u => ({
            deviceId:      u.deviceId,
            username:      u.username || u.avatar,
            avatarUrl:     u.avatarUrl || null,
            followerCount: u.followers.length,
        })));
    } catch (err) {
        console.error("following hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
});

// 2f. Takip edilen kişilerin tweetleri (Following feed)
app.get('/api/feed/following/:deviceId', async (req, res) => {
    try {
        const user = await User.findOne({ deviceId: req.params.deviceId }, { following: 1 }).lean();
        if (!user || !user.following.length) return res.json([]);

        const { sort = 'new' } = req.query;
        const query = { authorId: { $in: user.following } };

        let tweets;
        if (sort === 'hot') {
            tweets = await Tweet.aggregate([
                { $match: query },
                { $sort: { score: -1, createdAt: -1 } },
                { $limit: 50 },
                { $sample: { size: 15 } },
                { $project: { likedBy: 0 } },
            ]);
        } else {
            tweets = await Tweet.find(query, { likedBy: 0 })
                .sort({ createdAt: -1 })
                .limit(30)
                .lean();
        }
        res.json(tweets);
    } catch (err) {
        console.error("feed/following hatası:", err);
        res.status(500).json({ error: "Yüklenemedi!" });
    }
});

// 3. Beğenilen ID'ler
app.get('/api/liked-ids/:deviceId', async (req, res) => {
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
});

// 4. Beğenilen Tweetler + Yorumlar
app.get('/api/my-likes/:deviceId', async (req, res) => {
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
});

// 5. Tweet Gönder
app.post('/api/tweet', tweetLimiter, async (req, res) => {
    try {
        const { deviceId, content, imageUrl, imagePath } = req.body;

        console.log('📩 /api/tweet isteği:', {
            deviceId,
            contentLen: content?.length ?? 0,
            hasImage:   typeof imageUrl === 'string' && imageUrl.length > 0,
            imageUrl:   imageUrl?.slice(0, 60) ?? 'yok',
        });

        const hasText  = typeof content === 'string' && content.trim().length > 0;
        const hasImage = typeof imageUrl === 'string' && imageUrl.startsWith('https://');

        if (!hasText && !hasImage)
            return res.status(400).json({ error: "Tweet boş olamaz." });
        if (hasText && content.length > 280)
            return res.status(400).json({ error: "Metin maks. 280 karakter." });

        const user = await User.findOne({ deviceId });
        if (!user) {
            if (hasImage) await deleteFromStorage(imagePath);
            return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        }
        if (user.dailyLimit <= 0) {
            if (hasImage) await deleteFromStorage(imagePath);
            return res.status(403).json({ error: "Bugünlük 3 tweet hakkın bitti!" });
        }

        // Metin ve görsel moderasyonunu paralel başlat
        const [textBad, imageBad] = await Promise.all([
            hasText  ? moderateText(content.trim())  : Promise.resolve(false),
            hasImage ? moderateImageUrl(imageUrl)    : Promise.resolve(false),
        ]);

        if (textBad) {
            if (hasImage) await deleteFromStorage(imagePath);
            return res.status(400).json({ error: "Metinde kurallara aykırı içerik sezdik. Hakkın düşmedi." });
        }
        if (imageBad) {
            await deleteFromStorage(imagePath);
            return res.status(400).json({
                error: "Görsel YZ denetiminden geçemedi: İnsan yüzü, uygunsuz içerik veya kişisel bilgi tespit edildi. Hakkın düşmedi."
            });
        }

        const [tweet] = await Promise.all([
            Tweet.create({
                authorId:        deviceId,
                authorAvatar:    user.username || user.avatar,
                authorAvatarUrl: user.avatarUrl || null,
                content:         hasText ? content.trim() : '',
                imageUrl:        hasImage ? imageUrl  : null,
                imagePath:       hasImage ? imagePath : null,
            }),
            User.updateOne({ deviceId }, { $inc: { dailyLimit: -1 } }),
        ]);

        console.log('✅ Tweet kaydedildi:', tweet._id);
        res.json({ message: "Tweet gönderildi!", remainingLimit: user.dailyLimit - 1 });
    } catch (err) {
        console.error("🔥 Tweet endpoint hatası:", err);
        res.status(500).json({ error: "Sunucu hatası: " + err.message });
    }
});

// 6. Tweet Sil
app.delete('/api/tweet/:tweetId', async (req, res) => {
    try {
        const { deviceId } = req.body;
        const tweet = await Tweet.findById(req.params.tweetId).lean();
        if (!tweet)                      return res.status(404).json({ error: "Tweet bulunamadı." });
        if (tweet.authorId !== deviceId) return res.status(403).json({ error: "Yetkin yok." });

        await Promise.all([
            tweet.imagePath ? deleteFromStorage(tweet.imagePath) : Promise.resolve(),
            Tweet.findByIdAndDelete(req.params.tweetId),
            Comment.deleteMany({ tweetId: req.params.tweetId }),
        ]);

        // Limiti geri ver (max 3)
        await User.updateOne(
            { deviceId, dailyLimit: { $lt: 3 } },
            { $inc: { dailyLimit: 1 } }
        );

        res.json({ message: "Tweet silindi." });
    } catch (err) {
        console.error("tweet sil hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
});

// 7. Tweet Beğen
app.post('/api/like/:tweetId', async (req, res) => {
    try {
        const { deviceId } = req.body;
        const tweet = await Tweet.findById(req.params.tweetId, { authorId: 1, likedBy: 1, likes: 1 });
        if (!tweet)                           return res.status(404).json({ error: "Tweet bulunamadı." });
        if (tweet.authorId === deviceId)      return res.status(400).json({ error: "Kendi tweetini beğenemezsin." });
        if (tweet.likedBy.includes(deviceId)) return res.status(400).json({ error: "Zaten beğendin." });

        const updated = await Tweet.findByIdAndUpdate(
            req.params.tweetId,
            { $inc: { likes: 1 }, $push: { likedBy: deviceId } },
            { new: true, select: 'likes' }
        ).lean();
        res.json({ likes: updated.likes });
    } catch (err) {
        console.error("like hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
});

// 8. Tweet Beğeniyi Geri Çek
app.delete('/api/like/:tweetId', async (req, res) => {
    try {
        const { deviceId } = req.body;
        const tweet = await Tweet.findById(req.params.tweetId, { likedBy: 1, likes: 1 });
        if (!tweet)                            return res.status(404).json({ error: "Tweet bulunamadı." });
        if (!tweet.likedBy.includes(deviceId)) return res.status(400).json({ error: "Beğenmemişsin." });

        const updated = await Tweet.findByIdAndUpdate(
            req.params.tweetId,
            { $inc: { likes: -1 }, $pull: { likedBy: deviceId } },
            { new: true, select: 'likes' }
        ).lean();
        res.json({ likes: Math.max(0, updated.likes) });
    } catch (err) {
        console.error("unlike hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
});

// 9. Yorum Yap
app.post('/api/comment/:tweetId', commentLimiter, async (req, res) => {
    try {
        const { deviceId, content } = req.body;
        if (!content?.trim())     return res.status(400).json({ error: "Yorum boş olamaz." });
        if (content.length > 280) return res.status(400).json({ error: "Yorum çok uzun." });

        const [user, tweetExists] = await Promise.all([
            User.findOne({ deviceId }, { username: 1, avatar: 1, avatarUrl: 1 }).lean(),
            Tweet.exists({ _id: req.params.tweetId }),
        ]);
        if (!user)       return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        if (!tweetExists) return res.status(404).json({ error: "Tweet bulunamadı." });

        if (await moderateText(content))
            return res.status(400).json({ error: "Yorumunda uygunsuz içerik tespit edildi." });

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
});

// 10. Yorumları Getir
app.get('/api/comments/:tweetId', async (req, res) => {
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
});

// 11. Yorum Sil
app.delete('/api/comment/:commentId', async (req, res) => {
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
});

// 12. Yorum Beğen
app.post('/api/like-comment/:commentId', async (req, res) => {
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
});

// 13. Yorum Beğeniyi Geri Çek
app.delete('/api/like-comment/:commentId', async (req, res) => {
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
});

// 14. Vitrin Feed
app.get('/api/feed', async (req, res) => {
    try {
        const feed = await Tweet.aggregate([
            { $sort: { score: -1, createdAt: -1 } },
            { $limit: 50 },
            { $sample: { size: 10 } },
            { $project: { likedBy: 0 } },
        ]);
        res.json(feed);
    } catch (err) {
        console.error("feed hatası:", err);
        res.status(500).json({ error: "Yüklenemedi!" });
    }
});

// 15. Yeni Tweetler
app.get('/api/feed/new', async (req, res) => {
    try {
        const tweets = await Tweet.find({}, { likedBy: 0 }).sort({ createdAt: -1 }).limit(20).lean();
        res.json(tweets);
    } catch (err) {
        console.error("feed/new hatası:", err);
        res.status(500).json({ error: "Yüklenemedi!" });
    }
});

// 16. Günün Bomba Olayı
app.get('/api/bomb-tweet', async (req, res) => {
    try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const tweets = await Tweet.aggregate([
            { $match: { createdAt: { $gte: since } } },
            { $addFields: {
                totalInteraction: {
                    $add: [{ $multiply: ['$likes', 2] }, { $ifNull: ['$commentCount', 0] }]
                }
            }},
            { $sort: { totalInteraction: -1 } },
            { $limit: 1 },
            { $project: { likedBy: 0 } },
        ]);
        res.json(tweets[0] || null);
    } catch (err) {
        console.error("bomb-tweet hatası:", err);
        res.status(500).json({ error: "Yüklenemedi!" });
    }
});

// 17. Kendi Tweetleri
app.get('/api/my-tweets/:deviceId', async (req, res) => {
    try {
        const tweets = await Tweet.find(
            { authorId: req.params.deviceId },
            { likedBy: 0 }
        ).sort({ createdAt: -1 }).lean();
        res.json(tweets);
    } catch (err) {
        console.error("my-tweets hatası:", err);
        res.status(500).json({ error: "Sunucu hatası!" });
    }
});

// ─── CRON JOBS ──────────────────────────────────────────────────────────────

// Her 10 dakikada skor güncelle — bulkWrite + .lean() ile optimize
cron.schedule('*/10 * * * *', async () => {
    try {
        // Sadece son 30 günün tweetlerini işle, gereksiz field'ları çekme
        const tweets = await Tweet.find(
            { createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
            { _id: 1, likes: 1, commentCount: 1, authorId: 1, createdAt: 1 }
        ).lean();

        if (!tweets.length) return;

        const authorIds = [...new Set(tweets.map(t => t.authorId))];

        // Yorum beğenilerini ve takipçileri paralel çek
        const [commentLikes, authorUsers] = await Promise.all([
            Comment.aggregate([
                { $match: { tweetId: { $in: tweets.map(t => t._id) } } },
                { $group: { _id: '$tweetId', total: { $sum: '$likes' } } },
            ]),
            User.find(
                { deviceId: { $in: authorIds } },
                { deviceId: 1, followers: 1 }
            ).lean(),
        ]);

        const commentLikeMap = Object.fromEntries(
            commentLikes.map(c => [c._id.toString(), c.total])
        );
        const followerMap = Object.fromEntries(
            authorUsers.map(u => [u.deviceId, u.followers.length])
        );

        const now = new Date();
        const bulkOps = tweets.map(tweet => {
            const hoursPassed       = Math.max(1, (now - tweet.createdAt) / 36e5);
            const commentLikesTotal = commentLikeMap[tweet._id.toString()] || 0;
            const interaction       = (tweet.likes * 2) + (tweet.commentCount || 0) + commentLikesTotal;
            const followerBonus     = 1 + Math.min((followerMap[tweet.authorId] || 0) / 10, 10) * 0.1;
            const score             = ((interaction * 10) / Math.pow(hoursPassed, 1.5)) * followerBonus;

            return {
                updateOne: {
                    filter: { _id: tweet._id },
                    update: { $set: { score } },
                }
            };
        });

        await Tweet.bulkWrite(bulkOps, { ordered: false });
        console.log(`✅ ${bulkOps.length} tweet skoru güncellendi.`);
    } catch (err) {
        console.error("Skor güncelleme hatası:", err);
    }
});

// Her gece 03:00 — 45 günden eski tweetleri + Storage görsellerini sil
cron.schedule('0 3 * * *', async () => {
    try {
        const cutoff    = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
        const oldTweets = await Tweet.find(
            { createdAt: { $lt: cutoff } },
            { _id: 1, imagePath: 1 }
        ).lean();

        if (!oldTweets.length) {
            console.log('🧹 45 günlük temizlik: silinecek tweet yok.');
            return;
        }

        // Storage silmelerini paralel yap (hata olursa devam et)
        const storageResults = await Promise.allSettled(
            oldTweets.filter(t => t.imagePath).map(t => deleteFromStorage(t.imagePath))
        );
        const storageDeleted = storageResults.filter(r => r.status === 'fulfilled').length;

        const tweetIds = oldTweets.map(t => t._id);
        await Promise.all([
            Comment.deleteMany({ tweetId: { $in: tweetIds } }),
            Tweet.deleteMany({ _id: { $in: tweetIds } }),
        ]);

        console.log(`🧹 45 günlük temizlik: ${oldTweets.length} tweet, ${storageDeleted} görsel silindi.`);
    } catch (err) {
        console.error('❌ 45 günlük temizlik hatası:', err);
    }
});

// Her gece 00:00 — günlük limitleri sıfırla
cron.schedule('0 0 * * *', async () => {
    try {
        await User.updateMany({}, { $set: { dailyLimit: 3 } });
        console.log("✅ Günlük limitler sıfırlandı.");
    } catch (err) {
        console.error("Limit sıfırlama hatası:", err);
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Sunucu çalışıyor! Port: ${PORT}`));