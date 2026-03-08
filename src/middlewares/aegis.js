/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║           AEGIS KADEMELI SAVUNMA PROTOKOLÜ                   ║
 * ║   Sigal Media — İçerik Güvenlik Kalkanı                     ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  1. Katman → Sentinel Scan    (Sadece Kırmızı Çizgi)        ║
 * ║  2. Katman → Community Signal (5 Şikayet → Karantina)       ║
 * ║  3. Katman → Military Audit   (Derin Analiz → Suspended)    ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

const groq      = require('../config/groq');
const { Tweet } = require('../models/Tweet');

const REPORT_THRESHOLD = 5;
const SENTINEL_MODEL   = 'llama-3.1-8b-instant';
const AUDIT_MODEL      = 'llama-3.3-70b-versatile';
const VISION_MODEL     = 'llama-3.2-11b-vision-preview';

// ════════════════════════════════════════════════════════════════════════════
// KATMAN 1 — SENTINEL SCAN (ÇOK GEVŞETİLMİŞ)
// Sadece 2 durumda engeller, başka HİÇBİR ŞEYDE ENGELLEME YOK.
// ════════════════════════════════════════════════════════════════════════════
async function sentinelScanText(text) {
    if (!text?.trim()) return { blocked: false };

    try {
        const res = await groq.chat.completions.create({
            model: SENTINEL_MODEL,
            max_tokens: 10,
            messages: [
                {
                    role: 'system',
                    content: `Sadece 2 durumda "BLOCK" yaz, diğer HER ŞEYDE "PASS" yaz:
1. Açık ölüm tehdidi: "seni öldüreceğim", "öldürcem", "kanını dökeceğim" gibi net cümleler
2. Açık uyuşturucu/silah satışı: "satılık esrar", "tabanca satıyorum"

Küfür, hakaret, argo, gençlik dili, dedikodu, eleştiri, şikayet, espri, abartı → her zaman PASS
Sadece "BLOCK" veya "PASS" yaz.`,
                },
                { role: 'user', content: text },
            ],
        });

        const verdict = res.choices[0].message.content.trim().toUpperCase();
        const blocked = verdict.startsWith('BLOCK');
        console.log(`🛡️ Sentinel → ${blocked ? '🚫 BLOCK' : '✅ PASS'}`);
        return { blocked };
    } catch (err) {
        console.error('⚠️ Sentinel hatası (geçildi):', err.message);
        return { blocked: false };
    }
}

async function sentinelScanImage(imageUrl) {
    if (!imageUrl) return { blocked: false };

    try {
        const res = await groq.chat.completions.create({
            model: VISION_MODEL,
            max_tokens: 10,
            messages: [{
                role: 'user',
                content: [
                    { type: 'image_url', image_url: { url: imageUrl } },
                    {
                        type: 'text',
                        text: `Sadece "RED" veya "ONAY" yaz.
RED: Açık çıplaklık/müstehcenlik veya ağır kan/şiddet varsa.
ONAY: Normal fotoğraf, selfie, ekran görüntüsü, metin vb.`,
                    },
                ],
            }],
        });

        const answer  = res.choices[0].message.content.trim().toUpperCase();
        const blocked = answer.startsWith('RED');
        console.log(`🖼️ Sentinel Görsel → ${blocked ? '🚫 RED' : '✅ ONAY'}`);
        return { blocked };
    } catch (err) {
        console.error('⚠️ Sentinel Görsel hatası (geçildi):', err.message);
        return { blocked: false };
    }
}

// ════════════════════════════════════════════════════════════════════════════
// KATMAN 2 — COMMUNITY SIGNAL
// ════════════════════════════════════════════════════════════════════════════
async function processCommunityReport(tweetId, reporterDeviceId, reason = '') {
    const tweet = await Tweet.findById(tweetId, {
        reportedBy: 1, reportCount: 1, aegisStatus: 1, content: 1, imageUrl: 1,
    });

    if (!tweet)
        return { error: 'Tweet bulunamadı.', status: 404 };
    if (['removed', 'suspended'].includes(tweet.aegisStatus))
        return { error: 'Bu tweet zaten inceleme altında.', status: 400 };
    if (tweet.reportedBy.includes(reporterDeviceId))
        return { error: 'Bu tweeti zaten şikayet ettin.', status: 400 };

    const newCount         = (tweet.reportCount || 0) + 1;
    const shouldQuarantine = newCount >= REPORT_THRESHOLD && tweet.aegisStatus === 'active';

    const update = {
        $push: {
            reportedBy: reporterDeviceId,
            reports:    { by: reporterDeviceId, reason: reason || 'Belirtilmedi', date: new Date() },
        },
        $inc: { reportCount: 1 },
    };

    if (shouldQuarantine) {
        update.$set = { aegisStatus: 'quarantine' };
        update.$push.aegisAuditLog = {
            action: 'quarantine',
            reason: `${newCount} şikayet — ${reason || 'Belirtilmedi'}`,
            modelUsed: 'community', score: null, by: 'system', at: new Date(),
        };
    }

    await Tweet.findByIdAndUpdate(tweetId, update);

    if (shouldQuarantine) {
        console.log(`🔒 Karantina → ${tweetId} (${newCount} şikayet)`);
        setImmediate(() => militaryAudit(tweetId).catch(console.error));
    }

    return { reported: true, newCount, quarantined: shouldQuarantine };
}

// ════════════════════════════════════════════════════════════════════════════
// KATMAN 3 — MILITARY AUDIT
// UNSAFE → 'suspended' (otomatik silinmez, admin onaylar)
// ════════════════════════════════════════════════════════════════════════════
async function militaryAudit(tweetId) {
    const tweet = await Tweet.findById(tweetId, {
        content: 1, imageUrl: 1, aegisStatus: 1,
    }).lean();

    if (!tweet || ['removed', 'suspended'].includes(tweet.aegisStatus)) return;

    console.log(`⚔️ Military Audit başladı → ${tweetId}`);

    let verdict    = 'SAFE';
    let reason     = 'İçerik topluluk standartlarına uygun.';
    let auditScore = 0;

    try {
        if (tweet.content?.trim()) {
            const res = await groq.chat.completions.create({
                model: AUDIT_MODEL,
                max_tokens: 100,
                messages: [
                    {
                        role: 'system',
                        content: `Lise öğrencileri platformu. 5 kişi şikayet etti, derin analiz yap.

UNSAFE (bunlardan BİRİ varsa):
- Üstü kapalı tehdit: "sonunda göreceksin", "pişman ederim seni", "hesap sorarım"
- Kişisel zorbalık: belirli biri hedef alınarak sistematik aşağılama
- Ağır nefret söylemi: köken/dış görünüş/cinsiyet hedefli
- Ağır hakaret (anne/baba sövgüsü tarzı)

SAFE (bunların hepsi):
- Dedikodu, eleştiri, şikayet, argo, küfür (kişi hedefsiz)
- "Bu okul berbat", "müdür saçmaladı" gibi genel sitemler
- Hayal kırıklığı, kızgınlık ifadesi

JSON: {"verdict":"SAFE","score":0,"reason":"açıklama"}`,
                    },
                    { role: 'user', content: tweet.content },
                ],
            });

            const raw = res.choices[0].message.content.trim();
            try {
                const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
                verdict    = parsed.verdict?.toUpperCase() === 'UNSAFE' ? 'UNSAFE' : 'SAFE';
                auditScore = parsed.score  || 0;
                reason     = parsed.reason || reason;
            } catch {
                console.warn('⚠️ Military Audit parse hatası:', raw);
            }
        }

        if (tweet.imageUrl && verdict === 'SAFE') {
            const imgRes = await sentinelScanImage(tweet.imageUrl);
            if (imgRes.blocked) {
                verdict = 'UNSAFE'; reason = 'Görsel uygunsuz içerik.'; auditScore = 95;
            }
        }
    } catch (err) {
        console.error('⚠️ Military Audit hatası:', err.message);
        return;
    }

    const newStatus = verdict === 'UNSAFE' ? 'suspended' : 'cleared';

    await Tweet.findByIdAndUpdate(tweetId, {
        $set:  { aegisStatus: newStatus },
        $push: { aegisAuditLog: {
            action: newStatus, reason,
            modelUsed: AUDIT_MODEL, score: auditScore, by: 'system', at: new Date(),
        }},
    });

    console.log(`⚔️ Military Audit → ${tweetId} | ${verdict} → ${newStatus} (${auditScore}%)`);
}

async function modDecision(tweetId, decision, modDeviceId, reason = '') {
    if (!['removed', 'cleared', 'active'].includes(decision))
        throw new Error("Geçersiz karar.");

    const tweet = await Tweet.findByIdAndUpdate(
        tweetId,
        {
            $set:  { aegisStatus: decision },
            $push: { aegisAuditLog: {
                action: decision, reason: reason || `Moderatör: ${decision}`,
                modelUsed: 'human', score: 100, by: modDeviceId, at: new Date(),
            }},
        },
        { new: true, select: 'aegisStatus' }
    );

    if (!tweet) throw new Error('Tweet bulunamadı.');
    console.log(`⚖️ Mod → ${tweetId} | ${decision} | by: ${modDeviceId}`);
    return tweet;
}

module.exports = {
    sentinelScanText,
    sentinelScanImage,
    processCommunityReport,
    militaryAudit,
    modDecision,
    REPORT_THRESHOLD,
};