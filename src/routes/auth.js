// src/routes/auth.js
// Resend ile mail doğrulama + kayıt endpointi

const express  = require('express');
const router   = express.Router();
const admin    = require('firebase-admin');
const { User } = require('../models/User');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');

// Basit token store (production'da Redis kullanılmalı)
const verifyTokens = new Map(); // token -> { uid, email, createdAt }

// ─── POST /api/auth/register ──────────────────────────────────────────────────
// Firebase Auth'da hesap oluşturulduktan sonra çağrılır.
// Kullanıcıyı DB'ye kaydeder + Resend ile doğrulama maili gönderir.
router.post('/auth/register', async (req, res) => {
  try {
    const { uid, email, username } = req.body;
    if (!uid || !email) return res.status(400).json({ error: 'uid ve email gerekli.' });

    const trimName = (username || email.split('@')[0]).trim().slice(0, 30);

    // Kullanıcı adı çakışması kontrolü
    const exists = await User.exists({ username: trimName, deviceId: { $ne: uid } });
    if (exists) {
      return res.status(400).json({ error: 'Bu kullanıcı adı zaten alınmış.' });
    }

    // Upsert user
    await User.findOneAndUpdate(
      { deviceId: uid },
      { $setOnInsert: {
          deviceId:      uid,
          username:      trimName,
          avatar:        trimName,
          avatarUrl:     null,
          dailyLimit:    3,
          emailVerified: false,
        }
      },
      { upsert: true, new: true }
    );

    // Resend ile doğrulama maili
    const { success, token } = await sendVerificationEmail(email, uid);

    if (success && token) {
      verifyTokens.set(token, { uid, email, createdAt: Date.now() });
      // Auto-expire in 24h
      setTimeout(() => verifyTokens.delete(token), 24 * 60 * 60 * 1000);
    }

    res.json({ message: 'Kayıt başarılı. Doğrulama maili gönderildi.' });
  } catch (err) {
    console.error('auth/register hatası:', err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// ─── POST /api/auth/send-verification ────────────────────────────────────────
// Doğrulama mailini tekrar gönder
router.post('/auth/send-verification', async (req, res) => {
  try {
    const { uid, email } = req.body;
    if (!uid || !email) return res.status(400).json({ error: 'uid ve email gerekli.' });

    const { success, token } = await sendVerificationEmail(email, uid);

    if (success && token) {
      verifyTokens.set(token, { uid, email, createdAt: Date.now() });
      setTimeout(() => verifyTokens.delete(token), 24 * 60 * 60 * 1000);
    }

    res.json({ success, message: 'Doğrulama maili gönderildi.' });
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// ─── GET /api/auth/verify?token=...&uid=... ───────────────────────────────────
// Doğrulama linkine tıklandığında çağrılır
router.get('/auth/verify', async (req, res) => {
  try {
    const { token, uid } = req.query;
    if (!token || !uid) return res.redirect(`https://sigalmedia.site/verify-email?status=invalid`);

    const entry = verifyTokens.get(token);
    if (!entry || entry.uid !== uid) {
      return res.redirect(`https://sigalmedia.site/verify-email?status=expired`);
    }

    // Expire check: 24h
    if (Date.now() - entry.createdAt > 24 * 60 * 60 * 1000) {
      verifyTokens.delete(token);
      return res.redirect(`https://sigalmedia.site/verify-email?status=expired`);
    }

    // Update DB
    await User.findOneAndUpdate(
      { deviceId: uid },
      { $set: { emailVerified: true } }
    );

    // Also update Firebase Auth custom claims
    try {
      await admin.auth().setCustomUserClaims(uid, { emailVerified: true });
    } catch {}

    verifyTokens.delete(token);
    res.redirect(`https://sigalmedia.site/?verified=1`);
  } catch (err) {
    console.error('verify hatası:', err);
    res.redirect(`https://sigalmedia.site/verify-email?status=error`);
  }
});

// ─── POST /api/auth/reset-password ────────────────────────────────────────────
router.post('/auth/reset-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email gerekli.' });

    // Generate Firebase password reset link
    const link = await admin.auth().generatePasswordResetLink(email, {
      url: 'https://sigalmedia.site/verify-email/action',
    });

    const { success } = await sendPasswordResetEmail(email, link);
    res.json({ success, message: 'Şifre sıfırlama maili gönderildi.' });
  } catch (err) {
    // Don't reveal if email exists
    res.json({ success: true, message: 'Eğer hesap varsa mail gönderildi.' });
  }
});

// ─── GET /api/auth/status/:uid ────────────────────────────────────────────────
router.get('/auth/status/:uid', async (req, res) => {
  try {
    const user = await User.findOne({ deviceId: req.params.uid }, { emailVerified: 1 }).lean();
    res.json({ emailVerified: user?.emailVerified || false });
  } catch {
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

module.exports = router;
