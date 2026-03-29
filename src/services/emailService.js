// src/services/emailService.js
// Resend ile doğrulama ve bildirim mailleri

const { Resend } = require('resend');

if (!process.env.RESEND_API_KEY) {
  console.warn('⚠️  RESEND_API_KEY eksik — mail servisi devre dışı.');
}

const resend = new Resend(process.env.RESEND_API_KEY || 'dummy');

const FROM_EMAIL  = 'Şigal Medya <noreply@sigalmedia.site>';
const APP_URL     = 'https://sigalmedia.site';

// ─── Doğrulama maili ──────────────────────────────────────────────────────────
async function sendVerificationEmail(email, uid) {
  const token     = Buffer.from(`${uid}:${Date.now()}`).toString('base64url');
  const verifyUrl = `${APP_URL}/verify-email/action?token=${token}&uid=${uid}`;

  try {
    const { data, error } = await resend.emails.send({
      from:    FROM_EMAIL,
      to:      email,
      subject: 'Şigal Medya — E-posta Adresini Doğrula',
      html: `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>E-posta Doğrulama</title>
</head>
<body style="margin:0;padding:0;background:#000000;font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:40px 20px;">

    <!-- Logo -->
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="font-size:28px;font-weight:800;margin:0;color:#F5F5F5;letter-spacing:-0.5px;">
        <span style="background:linear-gradient(45deg,#FCAF45,#E1306C,#833AB4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">Şigal</span>
        <span style="color:#F5F5F5;"> Medya</span>
      </h1>
    </div>

    <!-- Card -->
    <div style="background:#121212;border:1px solid #262626;border-radius:16px;padding:32px 28px;">
      <h2 style="font-size:20px;font-weight:700;color:#F5F5F5;margin:0 0 12px;">
        Hoş geldin! 👋
      </h2>
      <p style="font-size:15px;color:#A8A8A8;line-height:1.6;margin:0 0 24px;">
        Hesabını doğrulamak için aşağıdaki butona tıkla.
        Bu link <strong style="color:#F5F5F5;">24 saat</strong> geçerlidir.
      </p>

      <a href="${verifyUrl}"
         style="display:block;text-align:center;background:#0095F6;color:#fff;
                text-decoration:none;border-radius:10px;padding:14px 24px;
                font-size:15px;font-weight:700;margin-bottom:20px;">
        E-postamı Doğrula →
      </a>

      <p style="font-size:12px;color:#737373;text-align:center;margin:0;">
        Butona tıklayamazsan bu linki kopyala:<br/>
        <span style="color:#0095F6;word-break:break-all;">${verifyUrl}</span>
      </p>
    </div>

    <!-- Footer -->
    <p style="text-align:center;font-size:12px;color:#363636;margin-top:24px;">
      Bu maili kendin talep etmediysen görmezden gelebilirsin.
      <br/>© 2026 Şigal Medya
    </p>
  </div>
</body>
</html>`,
    });

    if (error) throw error;
    console.log(`✅ Doğrulama maili gönderildi: ${email}`);
    return { success: true, token };
  } catch (err) {
    console.error('❌ Mail gönderme hatası:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── Şifre sıfırlama maili ────────────────────────────────────────────────────
async function sendPasswordResetEmail(email, resetUrl) {
  try {
    await resend.emails.send({
      from:    FROM_EMAIL,
      to:      email,
      subject: 'Şigal Medya — Şifre Sıfırlama',
      html: `
<!DOCTYPE html>
<html lang="tr">
<body style="margin:0;padding:0;background:#000000;font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="font-size:28px;font-weight:800;margin:0;">
        <span style="background:linear-gradient(45deg,#FCAF45,#E1306C,#833AB4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">Şigal</span>
        <span style="color:#F5F5F5;"> Medya</span>
      </h1>
    </div>
    <div style="background:#121212;border:1px solid #262626;border-radius:16px;padding:32px 28px;">
      <h2 style="font-size:20px;font-weight:700;color:#F5F5F5;margin:0 0 12px;">Şifre Sıfırlama</h2>
      <p style="font-size:15px;color:#A8A8A8;line-height:1.6;margin:0 0 24px;">
        Şifreni sıfırlamak için aşağıdaki butona tıkla. Link 1 saat geçerlidir.
      </p>
      <a href="${resetUrl}" style="display:block;text-align:center;background:#0095F6;color:#fff;text-decoration:none;border-radius:10px;padding:14px 24px;font-size:15px;font-weight:700;margin-bottom:20px;">
        Şifremi Sıfırla →
      </a>
    </div>
    <p style="text-align:center;font-size:12px;color:#363636;margin-top:24px;">
      Bu isteği kendin yapmadıysan görmezden gelebilirsin.<br/>© 2026 Şigal Medya
    </p>
  </div>
</body>
</html>`,
    });
    console.log(`✅ Şifre sıfırlama maili gönderildi: ${email}`);
    return { success: true };
  } catch (err) {
    console.error('❌ Reset mail hatası:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
