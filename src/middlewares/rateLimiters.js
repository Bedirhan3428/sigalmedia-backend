const rateLimit            = require('express-rate-limit');
const { ipKeyGenerator }   = require('express-rate-limit');

// ─── Genel Limiter (tüm route'lara) ─────────────────────────────────────────
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 2000,
    validate: { xForwardedForHeader: false },
    message: "Çok fazla deneme yaptınız, lütfen biraz bekleyip tekrar deneyin.",
});

// ─── Tweet Limiter (deviceId bazlı) ─────────────────────────────────────────
const tweetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 50,
    keyGenerator: (req, res) => req.body?.deviceId || ipKeyGenerator(req, res),
    validate: { xForwardedForHeader: false },
    message: "Saatte en fazla 50 tweet denemesi yapılabilir.",
});

// ─── Yorum Limiter ───────────────────────────────────────────────────────────
const commentLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 100,
    keyGenerator: (req, res) => req.body?.deviceId || ipKeyGenerator(req, res),
    validate: { xForwardedForHeader: false },
    message: "Çok hızlı yorum yapıyorsunuz, biraz bekleyin.",
});

// ─── Şikayet Limiter (spam şikayeti engeller) ────────────────────────────────
const reportLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 50,
    keyGenerator: (req, res) => req.body?.deviceId || ipKeyGenerator(req, res),
    validate: { xForwardedForHeader: false },
    message: "Saatte en fazla 50 şikayet yapılabilir.",
});

// ─── Admin Limiter ───────────────────────────────────────────────────────────
const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    keyGenerator: (req, res) => req.body?.deviceId || req.headers['x-admin-id'] || ipKeyGenerator(req, res),
    validate: { xForwardedForHeader: false },
    message: "Admin işlemleri için çok fazla deneme.",
});

module.exports = { generalLimiter, tweetLimiter, commentLimiter, reportLimiter, adminLimiter };