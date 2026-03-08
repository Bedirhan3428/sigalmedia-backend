const rateLimit = require('express-rate-limit');

// ─── Genel Limiter (tüm route'lara) ─────────────────────────────────────────
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 400,
    validate: { ip: false }, // IPv6 hatasını çözen satır
    message: "Çok fazla deneme yaptınız, lütfen biraz bekleyip tekrar deneyin."
});

// ─── Tweet Limiter (deviceId bazlı) ─────────────────────────────────────────
const tweetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 7,
    validate: { ip: false }, // IPv6 hatasını çözen satır
    keyGenerator: (req) => req.body?.deviceId || req.ip,
    message: "Saatte en fazla 7 tweet denemesi yapılabilir."
});

// ─── Yorum Limiter ───────────────────────────────────────────────────────────
const commentLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 15,
    validate: { ip: false }, // IPv6 hatasını çözen satır
    keyGenerator: (req) => req.body?.deviceId || req.ip,
    message: "Çok hızlı yorum yapıyorsunuz, biraz bekleyin."
});

// ─── Şikayet Limiter (spam şikayeti engeller) ────────────────────────────────
const reportLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    validate: { ip: false }, // IPv6 hatasını çözen satır
    keyGenerator: (req) => req.body?.deviceId || req.ip,
    message: "Saatte en fazla 10 şikayet yapılabilir."
});

// ─── Admin Limiter ───────────────────────────────────────────────────────────
const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    validate: { ip: false }, // IPv6 hatasını çözen satır
    keyGenerator: (req) => req.body?.deviceId || req.headers['x-admin-id'] || req.ip,
    message: "Admin işlemleri için çok fazla deneme."
});

module.exports = { generalLimiter, tweetLimiter, commentLimiter, reportLimiter, adminLimiter };