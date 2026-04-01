const groq      = require('../config/groq');
const { Tweet } = require('../models/Tweet');

const REPORT_THRESHOLD = 5;
const SENTINEL_MODEL   = 'llama-3.3-70b-versatile';
const AUDIT_MODEL      = 'llama-3.3-70b-versatile';
const VISION_MODEL     = 'llama-3.2-11b-vision-preview';

// ════════════════════════════════════════════════════════════════════════════
// KATMAN 1 — SENTINEL SCAN (TWEET)
// ════════════════════════════════════════════════════════════════════════════
async function sentinelScanText(text) {
    if (!text?.trim()) return { blocked: false };

    try {
        const res = await groq.chat.completions.create({
            model: SENTINEL_MODEL,
            temperature: 0.0,
            max_tokens: 5,
            messages: [
                {
                    role: 'system',
                    content: `Sen son derece esnek ve rahat bir yapay zeka filtresisin. Neredeyse her şeye "PASS" demelisin. YALNIZCA "BLOCK" veya "PASS" kelimelerinden birini yaz. Başka hiçbir harf kullanma.\n\nKURAL: Sadece ama SADECE %100 gerçek bir silah veya terör satışı yapılıyorsa "BLOCK" yaz.\n\nBUNLAR KESİNLİKLE "PASS" ALMALIDIR:\n- Ağır küfürler, hakaretler, argo, sataşmalar\n- Okul, öğretmen, sistem eleştirileri, dedikodu veya sitemler\n- Şakalar, ironiler, troller\n- Günlük konuşmalar`
                },
                { role: 'user', content: text },
            ],
        });

        const verdict = res.choices[0].message.content.trim().toUpperCase();
        const blocked = verdict.includes('BLOCK');
        console.log(`🛡️ Sentinel Tweet → ${blocked ? '🚫 BLOCK' : '✅ PASS'} | Text: "${text.substring(0, 15)}..."`);
        return { blocked };
    } catch (err) {
        console.error('⚠️ Sentinel hatası (geçildi):', err.message);
        return { blocked: false };
    }
}

// ════════════════════════════════════════════════════════════════════════════
// KATMAN 1.5 — SENTINEL SCAN (YORUM)
// ════════════════════════════════════════════════════════════════════════════
async function sentinelScanComment(text) {
    if (!text?.trim()) return { blocked: false };

    try {
        const res = await groq.chat.completions.create({
            model: SENTINEL_MODEL,
            temperature: 0.0,
            max_tokens: 5,
            messages: [
                {
                    role: 'system',
                    content: `Sen son derece esnek bir yorum denetleyicisisin. Sadece "BLOCK" veya "PASS" döndür.\nKURAL: %99 her şeye (ağır küfür, hakaret, argo, tartışma dahil) PASS de.\nYalnızca açık kanlı terör propagandası varsa BLOCK de.`
                },
                { role: 'user', content: text },
            ],
        });

        const verdict = res.choices[0].message.content.trim().toUpperCase();
        const blocked = verdict.includes('BLOCK');
        console.log(`💬 Sentinel Yorum → ${blocked ? '🚫 BLOCK' : '✅ PASS'} | Text: "${text.substring(0, 15)}..."`);
        return { blocked };
    } catch (err) {
        console.error('⚠️ Sentinel Yorum hatası (geçildi):', err.message);
        return { blocked: false };
    }
}

// ════════════════════════════════════════════════════════════════════════════
// KATMAN 1.5 — SENTINEL SCAN (GÖRSEL)
// ════════════════════════════════════════════════════════════════════════════
async function sentinelScanImage(imageUrl) {
    if (!imageUrl) return { blocked: false };

    try {
        const res = await groq.chat.completions.create({
            model: VISION_MODEL,
            temperature: 0.0,
            max_tokens: 5,
            messages: [{
                role: 'user',
                content: [
                    { type: 'image_url', image_url: { url: imageUrl } },
                    {
                        type: 'text',
                        text: `Sen bir görsel güvenlik filtresisin. YALNIZCA "RED" veya "ONAY" yaz. Başka hiçbir şey yazma.\nKURAL: Sadece açık çıplaklık/porno veya ağır kanlı/parçalanmış ceset görüntüsü varsa "RED" yaz.\nNormal insan fotoğrafları, yüzler, manzaralar, oyun ekran görüntüleri, capsler, internet şakaları, üzerinde yazı olan resimler KESİNLİKLE "ONAY" almalıdır.`,
                    },
                ],
            }],
        });

        const answer  = res.choices[0].message.content.trim().toUpperCase();
        const blocked = answer.includes('RED');
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
// FIX #7: Prompt artık Sentinel ile tutarlı — aile küfürü ve ağır hakaret
// her iki katmanda da UNSAFE/BLOCK sayılıyor.
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
                        content: `Lise öğrencileri platformu. Çok hassas olma, esnek davran.
                        
UNSAFE (bunlardan BİRİ varsa):
- Ağır terör propagandası veya yasadışı silah satışı

SAFE (bunların hepsi):
- Ağır küfür, aileye küfür, kişisel zorbalık, hakaret
- Dedikodu, eleştiri, şikayet
- Argo, troll, kara mizah

JSON: {"verdict":"SAFE","score":0,"reason":"açıklama"}`
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

        // Tüm medyaları tara
        if (verdict === 'SAFE') {
            const mediaItems = tweet.media || [];
            if (mediaItems.length === 0 && tweet.imageUrl) {
                mediaItems.push({ url: tweet.imageUrl, type: 'image' });
            }

            for (const item of mediaItems) {
                if (item.type === 'image') {
                    const imgRes = await sentinelScanImage(item.url);
                    if (imgRes.blocked) {
                        verdict = 'UNSAFE'; 
                        reason = 'Görsellerden biri uygunsuz içerik barındırıyor.'; 
                        auditScore = 95;
                        break;
                    }
                }
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
    sentinelScanComment,
    processCommunityReport,
    militaryAudit,
    modDecision,
    REPORT_THRESHOLD,
};