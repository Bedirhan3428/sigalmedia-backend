const mongoose = require('mongoose');

// ─── Aegis Durum Sabitleri ───────────────────────────────────────────────────
// 'active'        → Yayında, normal tweet
// 'quarantine'    → Şikayet eşiği aşıldı, Military Audit bekleniyor
// 'suspended'     → Military Audit: UNSAFE kararı — Admin onayı bekleniyor
// 'cleared'       → Military Audit: SAFE kararı, karantinadan çıkarıldı
// 'removed'       → Admin tarafından silindi (DB'de tutulur, gizlenir)
const AEGIS_STATUSES = ['active', 'quarantine', 'suspended', 'cleared', 'removed'];

// ─── Sosyal Embed Şeması ─────────────────────────────────────────────────────
const socialEmbedSchema = new mongoose.Schema({
    platform:     { type: String, enum: ['instagram', 'tiktok', 'youtube', 'twitter'], default: null },
    originalUrl:  { type: String, default: null },
    title:        { type: String, default: null },
    description:  { type: String, default: null },
    thumbnailUrl: { type: String, default: null },
}, { _id: false });

// ─── Detaylı Şikayet Şeması ──────────────────────────────────────────────────
const reportSchema = new mongoose.Schema({
    by:     { type: String, required: true },
    reason: { type: String, default: 'Belirtilmedi' },
    date:   { type: Date,   default: Date.now },
}, { _id: false });

const tweetSchema = new mongoose.Schema({
    authorId:        { type: String, required: true },
    authorAvatar:    { type: String, required: true },
    authorAvatarUrl: { type: String, default: null },
    content:         { type: String, default: '' },
    imageUrl:        { type: String, default: null },
    imagePath:       { type: String, default: null },
    mediaType:       { type: String, enum: ['image', 'video', 'story', null], default: null },
    likes:           { type: Number, default: 0 },
    likedBy:         [{ type: String }],
    commentCount:    { type: Number, default: 0 },
    score:           { type: Number, default: 5 },
    createdAt:       { type: Date,   default: Date.now },

    // ── Sosyal Embed (Instagram / TikTok link önizlemesi) ────────────────────
    socialEmbed:     { type: socialEmbedSchema, default: null },

    // ── Admin Aksiyon Kaydı (silinme / askıya alınma bildirimi) ─────────────
    adminAction: {
        type: {
            action:  { type: String },  // 'removed' | 'restored'
            reason:  { type: String },  // Admin'in belirttiği neden
            by:      { type: String },  // Admin deviceId
            at:      { type: Date, default: Date.now },
        },
        default: null,
        _id: false,
    },

    // ── Aegis Güvenlik Sistemi ───────────────────────────────────────────────
    aegisStatus:     { type: String, enum: AEGIS_STATUSES, default: 'active' },
    reportCount:     { type: Number, default: 0 },
    reportedBy:      [{ type: String }],
    reports:         [reportSchema],
    aegisAuditLog:   [{
        action:    { type: String },
        reason:    { type: String },
        modelUsed: { type: String },
        score:     { type: Number },
        by:        { type: String },
        at:        { type: Date, default: Date.now },
    }],
});

const Tweet = mongoose.model('Tweet', tweetSchema);

module.exports = { Tweet, AEGIS_STATUSES };