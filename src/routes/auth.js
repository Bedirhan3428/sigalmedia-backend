// src/routes/auth.js
// Resend ile mail doğrulama + kayıt endpointi

const express  = require('express');
const router   = express.Router();
const admin    = require('firebase-admin');
const { User } = require('../models/User');
const { VerificationToken } = require('../models/VerificationToken');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');

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
          dailyLimit:    10,
          emailVerified: false,
        }
      },
      { upsert: true, new: true }
    );

    // Resend ile doğrulama maili
    const { success, token } = await sendVerificationEmail(email, uid);

    // DB'ye token kaydet
    if (success && token) {
      await VerificationToken.deleteOne({ uid }); // Eskisini temizle
      await new VerificationToken({ token, uid, email }).save();
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
      await VerificationToken.deleteOne({ uid });
      await new VerificationToken({ token, uid, email }).save();
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
    if (!token || !uid) {
      return res.status(400).json({ error: 'Geçersiz veya eksik link.' });
    }

    const entry = await VerificationToken.findOne({ token, uid });
    if (!entry) {
      return res.status(400).json({ error: 'Doğrulama linki geçersiz veya süresi dolmuş.' });
    }

    // Update MongoDB
    await User.findOneAndUpdate(
      { deviceId: uid },
      { $set: { emailVerified: true } }
    );

    // Update Firebase Auth (Core emailVerified field)
    try {
      await admin.auth().updateUser(uid, { emailVerified: true });
      // Opsiyonel: Custom claim de kalsın
      await admin.auth().setCustomUserClaims(uid, { emailVerified: true });
    } catch (firebaseErr) {
      console.error('Firebase update hatası:', firebaseErr);
    }

    // Token'ı sil
    await VerificationToken.deleteOne({ _id: entry._id });

    res.json({ success: true, message: 'E-posta adresiniz başarıyla doğrulandı.' });
  } catch (err) {
    console.error('verify hatası:', err);
    res.status(500).json({ error: 'Doğrulama sırasında bir hata oluştu.' });
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
