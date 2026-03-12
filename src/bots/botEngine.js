const { Tweet }   = require('../models/Tweet');
const { User }    = require('../models/User');
const Comment     = require('../models/Comment');
const BotExample  = require('../models/BotExample');
const BotEvent    = require('../models/BotEvent');
const AVATARS     = require('../constants/avatars');
const groqBot     = require('../config/groqBot');
const { sentinelScanText } = require('../middlewares/aegis');

// ─── Sabitler ─────────────────────────────────────────────────────────────────
const BOT_MODEL = 'llama-3.3-70b-versatile';

// Anonim / kurgusal kullanıcı adı parçaları
// (gerçek isim yok — oyun karakteri, film/dizi referansı, anonim kelime karışımı)
const BOT_PREFIXES = [
    // Oyun karakterleri & evrenler
    'kratos', 'ezio', 'geralt', 'arthur', 'joel', 'ellie', 'aloy',
    'cloud', 'tifa', 'noctis', 'link', 'zelda', 'samus', 'master',
    'cortana', 'ghost', 'soap', 'price', 'sparrow', 'draven',
    'jinx', 'arcane', 'vi_', 'ekko', 'silco', 'cait',
    'naruto', 'sasuke', 'itachi', 'gojo', 'levi', 'mikasa', 'zoro',
    'luffy', 'shanks', 'killua', 'gon', 'kurapika',
    // Film / dizi
    'neo_', 'trinity', 'morpheus', 'cipher_', 'tyler_d', 'marla',
    'heisenberg', 'pinkman', 'saul', 'tony_s', 'arya_s', 'jon_s',
    'walter_w', 'jesse_', 'dexter_', 'raylan', 'rust_c', 'marty_b',
    'vito_c', 'michael_c', 'hansolo', 'rey__', 'vader_',
    // Anonim / genel
    'unknown_', 'nobody_', 'ghost_', 'anon_', 'void_', 'dark_',
    'shadow_', 'phantom_', 'cipher_', 'null_', 'error_', 'lost_',
    'silent_', 'rogue_', 'neon_', 'pixel_', 'glitch_', 'static_',
];

// ─── Yardımcılar ──────────────────────────────────────────────────────────────
function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function genDeviceId() {
    return 'bot_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ─── SEED DATA ────────────────────────────────────────────────────────────────
const SEED_TWEETS = [
    'bugün matematik sınavı zindan gibiydi, sorular bambaşka bir yerden çıktı ya 💀',
    'okul kantininin fiyatları her ay artıyor, tost için kredi mi çekeceğiz',
    '3. derste uyuya kaldım öğretmen görmedi sanırım, büyük kurtuluş',
    'o kişi yine aynı koridorda geçti ve yine bakışamadım, korkaklık bu ya',
    'neden her güzel hava okul gününe denk geliyor ciddi anlamıyorum',
    'sınavda hiç çalışmamıştım 60 aldım, normal çalışsam acaba ne alırdım',
    'okul wifisi bugün yine çalışmıyor, 4G paketi de bitti 😭',
    'öğretmen ödevi 3 gün önce verdi bugün toplayacak, kimse yapmadı klasik',
    'teneffüste koridorda yürüyemiyorsun bu kalabalıkta, insanlar birbirine çarpıyor',
    'sabah 7de okul olması insanlık suçu ciddi',
    'o kişinin bana baktığını gördüm ama dönünce zaten başka tarafa bakıyordu, hayal mi',
    'bugün öğretmen çok sinirliydi sınıf bi bok anlamadı dersden',
    'son ders 10 dakika uzun gelen o 10 dakika hiç geçmedi',
    'müzik dersinde şarkı söyletiyorlar knk bu çağda hala',
    'beden dersinde yoruldum eve gidince yatacağım kalkmayacağım',
];

const SEED_COMMENTS = [
    'aynen lan',
    'biliyorum ya 😭',
    'aynısı başıma geldi',
    'klasik bu okul',
    'hahaha gerçekten',
    'katılıyorum be',
    'ya sende mi?',
    '😭😭',
    'ne diyeyim ki',
    'haklısın ya',
    'dur dur dur tam olarak böyle',
    'geçmiş olsun 💀',
    'knk sen hiç yalnız değilsin',
    'bu okul bence',
    'ya neden hep böyle',
    'bide ben vardım o gün',
    'of ya',
    'ahahaha fena değil',
];

// ─── 1. GÜNLÜK BOT HESABI OLUŞTUR ─────────────────────────────────────────────
async function createDailyBotAccount() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Bugün zaten bot oluşturuldu mu?
    const alreadyToday = await User.findOne({ isBot: true, createdAt: { $gte: today } }).lean();
    if (alreadyToday) {
        console.log('🤖 Bot: Bugün hesap zaten oluşturulmuş.');
        return alreadyToday;
    }

    const prefix    = pick(BOT_PREFIXES).replace(/[_]+$/, ''); // sondaki _ temizle
    const num       = Math.floor(100 + Math.random() * 900);   // 3 haneli yeterli
    let   username  = `${prefix}_${num}`;
    const avatar    = pick(AVATARS);
    const deviceId  = genDeviceId();

    // Username çakışması kontrolü
    const exists = await User.exists({ username });
    if (exists) username = username + 'x';

    const user = await User.create({
        deviceId,
        username,
        avatar:     username,
        avatarUrl:  avatar.url,
        dailyLimit: 999,
        isBot:      true,
        createdAt:  new Date(),
    });

    console.log(`🤖 Yeni bot hesabı: @${username} | ${deviceId}`);
    return user;
}

// ─── 2. RASTGELE BOT SEÇ ──────────────────────────────────────────────────────
async function getRandomBot() {
    const bots = await User.find(
        { isBot: true, isActive: true },
        { deviceId: 1, username: 1, avatarUrl: 1 }
    ).lean();
    if (!bots.length) return null;
    return pick(bots);
}

// ─── YARDIMCI: Aktif etkinlikleri çek (bugün ±2 gün) ─────────────────────────
async function getRelevantEvents() {
    const now  = new Date();
    const from = new Date(now); from.setDate(from.getDate() - 1); from.setHours(0,0,0,0);
    const to   = new Date(now); to.setDate(to.getDate() + 3);   to.setHours(23,59,59,999);

    const events = await BotEvent.find({
        active: true,
        date:   { $gte: from, $lte: to },
    }).sort({ date: 1 }).lean();

    if (!events.length) return null;

    const TYPE_LABEL = { exam: 'Sınav', holiday: 'Tatil/Özel Gün', special: 'Özel Etkinlik', other: 'Etkinlik' };
    const lines = events.map(e => {
        const d     = new Date(e.date);
        const today = new Date(); today.setHours(0,0,0,0);
        const diff  = Math.round((d - today) / 86400000);
        const when  = diff === 0 ? 'BUGÜN' : diff === 1 ? 'YARIN' : diff === -1 ? 'DÜN' : `${Math.abs(diff)} gün ${diff > 0 ? 'sonra' : 'önce'}`;
        const label = TYPE_LABEL[e.type] || 'Etkinlik';
        return `- ${label}: "${e.title}" (${when}${e.description ? ' — ' + e.description : ''})`;
    });

    return lines.join('\n');
}

// ─── 3. TWEET İÇERİĞİ ÜRET ───────────────────────────────────────────────────
async function generateTweetContent() {
    // Örnekleri her zaman DB'den al
    const examples = await BotExample.aggregate([
        { $match: { type: 'tweet', active: true } },
        { $sample: { size: 6 } },
    ]);

    if (!examples.length) {
        console.log('🤖 Tweet: DB\'de örnek yok, atlandı.');
        return null;
    }

    const exTxt     = examples.map((e, i) => `${i + 1}. ${e.content}`).join('\n');
    const eventCtx  = await getRelevantEvents();
    const eventPart = eventCtx
        ? `\n\nTakvimde yakın tarihli etkinlikler var (uygun görürsen bunlardan birine değin, ama zorla ekleme):\n${eventCtx}`
        : '';

    try {
        const res = await groqBot.chat.completions.create({
            model:       BOT_MODEL,
            temperature: 0.93,
            max_tokens:  120,
            messages: [
                {
                    role: 'system',
                    content: `Sen Türk lisesinde okuyan 16-18 yaşında sıradan bir öğrencisin. Sosyal medyada çok samimi, doğal yazıyorsun. Argo kullanabilirsin, emoji ekleyebilirsin. SADECE tweet metnini yaz. Tırnak işareti koyma. Başka hiçbir şey ekleme. Kesinlikle uydurma tarih, not, sınav puanı yazma — sadece takvimde gerçekten olan etkinliklere değin.`,
                },
                {
                    role: 'user',
                    content: `Aşağıdaki örneklere benzer ama farklı, yeni ve özgün bir tweet yaz. Aynısını kopyalama, ilham al.${eventPart}\n\nÖrnekler:\n${exTxt}\n\nYeni tweet:`,
                },
            ],
        });

        const raw = res.choices[0].message.content.trim();
        return raw.replace(/^["'`]|["'`]$/g, '').trim().slice(0, 280);
    } catch (err) {
        console.error('🤖 Tweet üretim hatası:', err.message);
        return null;
    }
}

// ─── 4. YORUM İÇERİĞİ ÜRET ───────────────────────────────────────────────────
async function generateCommentContent(tweetContent) {
    const examples = await BotExample.aggregate([
        { $match: { type: 'comment', active: true } },
        { $sample: { size: 5 } },
    ]);

    if (!examples.length) {
        console.log('🤖 Yorum: DB\'de örnek yok, atlandı.');
        return null;
    }

    const exTxt = examples.map((e, i) => `${i + 1}. ${e.content}`).join('\n');

    try {
        const res = await groqBot.chat.completions.create({
            model:       BOT_MODEL,
            temperature: 0.93,
            max_tokens:  60,
            messages: [
                {
                    role: 'system',
                    content: `Sen Türk lisesinde okuyan 16-18 yaşında birisin. Sosyal medyada kısa, samimi yorumlar yapıyorsun. Bazen 1-2 kelime, bazen 1 kısa cümle. Argo olabilir. SADECE yorum metnini yaz. Kesinlikle uydurma tarih veya bilgi ekleme. Başka hiçbir şey ekleme.`,
                },
                {
                    role: 'user',
                    content: `Bu tweete yorum yap: "${tweetContent.slice(0, 150)}"\n\nBu tarz yorumlardan ilham al:\n${exTxt}\n\nYorumun:`,
                },
            ],
        });

        const raw = res.choices[0].message.content.trim();
        return raw.replace(/^["'`]|["'`]$/g, '').trim().slice(0, 280);
    } catch (err) {
        console.error('🤖 Yorum üretim hatası:', err.message);
        return null;
    }
}

// ─── 5. BOT TWEET AT ──────────────────────────────────────────────────────────
async function botTweet() {
    const bot = await getRandomBot();
    if (!bot) return console.log('🤖 Tweet: hiç bot hesabı yok');

    const content = await generateTweetContent();
    if (!content?.trim()) return console.log('🤖 Tweet: içerik üretilemedi');

    // Aegis Sentinel kontrolü
    const { blocked } = await sentinelScanText(content);
    if (blocked) return console.log('🤖 Tweet sentinel engelledi, bu tur atlandı');

    const tweet = await Tweet.create({
        authorId:        bot.deviceId,
        authorAvatar:    bot.username,
        authorAvatarUrl: bot.avatarUrl || null,
        content,
    });

    console.log(`🤖 Bot tweet: @${bot.username} → "${content.slice(0, 60)}..."`);
    return tweet;
}

// ─── 6. BOT YORUM YAP ─────────────────────────────────────────────────────────
async function botComment() {
    const bot = await getRandomBot();
    if (!bot) return;

    // Botun kendi tweetleri olmayan, aktif bir tweet seç
    const tweets = await Tweet.aggregate([
        {
            $match: {
                aegisStatus: { $in: ['active', 'cleared'] },
                authorId:    { $ne: bot.deviceId },
                content:     { $ne: '' },
            },
        },
        { $sample: { size: 1 } },
    ]);

    if (!tweets.length) return console.log('🤖 Yorum: uygun tweet bulunamadı');
    const tweet = tweets[0];

    const content = await generateCommentContent(tweet.content);
    if (!content?.trim()) return;

    const { blocked } = await sentinelScanText(content);
    if (blocked) return;

    await Promise.all([
        Comment.create({
            tweetId:         tweet._id,
            authorId:        bot.deviceId,
            authorAvatar:    bot.username,
            authorAvatarUrl: bot.avatarUrl || null,
            content,
        }),
        Tweet.findByIdAndUpdate(tweet._id, { $inc: { commentCount: 1 } }),
    ]);

    console.log(`🤖 Bot yorum: @${bot.username} → "${content.slice(0, 50)}"`);
}

// ─── 7. BOT BEĞEN ─────────────────────────────────────────────────────────────
async function botLike() {
    const bot = await getRandomBot();
    if (!bot) return;

    // Daha önce beğenilmemiş, kendisinin olmayan aktif tweet
    const tweets = await Tweet.aggregate([
        {
            $match: {
                aegisStatus: { $in: ['active', 'cleared'] },
                authorId:    { $ne: bot.deviceId },
                likedBy:     { $ne: bot.deviceId },
            },
        },
        { $sample: { size: 1 } },
    ]);

    if (!tweets.length) return console.log('🤖 Beğeni: uygun tweet bulunamadı');

    await Tweet.findByIdAndUpdate(tweets[0]._id, {
        $inc:  { likes: 1 },
        $push: { likedBy: bot.deviceId },
    });

    console.log(`🤖 Bot beğendi: @${bot.username} → tweet ${tweets[0]._id}`);
}

// ─── 8. RASTGELE AKSİYON ──────────────────────────────────────────────────────
async function runBotAction() {
    const actions = [botTweet, botComment, botLike];
    const action  = pick(actions);
    try {
        await action();
    } catch (err) {
        console.error('🤖 Bot aksiyon hatası:', err.message);
    }
}

// ─── 9. SEED + INIT ───────────────────────────────────────────────────────────
async function seedBotExamples() {
    const count = await BotExample.countDocuments();
    if (count > 0) return; // Zaten seed edilmiş

    const docs = [
        ...SEED_TWEETS.map(c  => ({ type: 'tweet',   content: c, addedBy: 'system' })),
        ...SEED_COMMENTS.map(c => ({ type: 'comment', content: c, addedBy: 'system' })),
    ];
    await BotExample.insertMany(docs);
    console.log(`🤖 ${docs.length} bot örneği seed edildi (${SEED_TWEETS.length} tweet, ${SEED_COMMENTS.length} yorum).`);
}

async function initBotSystem() {
    try {
        await seedBotExamples();

        const botCount = await User.countDocuments({ isBot: true });
        if (botCount === 0) {
            console.log('🤖 İlk bot hesabı oluşturuluyor...');
            await createDailyBotAccount();
        } else {
            console.log(`🤖 Bot sistemi hazır. Mevcut bot sayısı: ${botCount}`);
        }
    } catch (err) {
        console.error('🤖 Bot init hatası:', err.message);
    }
}

module.exports = {
    createDailyBotAccount,
    runBotAction,
    initBotSystem,
};