<div align="center">
  <h1>🚀 Sigal Media Backend (v3)</h1>
  <p><strong>Lise Öğrencileri İçin Güvenli & Etkileşimli Sosyal Medya Sunucusu</strong></p>
</div>

---

Şigal Medya, özellikle lise öğrencilerine yönelik, güvenli ve etkileşimli bir sosyal medya platformudur. Bu depo, projenin Node.js, Express ve MongoDB tabanlı sunucu tarafı (backend) kodlarını içerir.

## ✨ Öne Çıkan Özellikler

### 🛡️ Aegis Safety System (3 Katmanlı Yapay Zeka Moderasyonu)
- **Katman 1 (Sentinel Scan):** Llama 3 tabanlı anlık metin ve Llama 3.2 Vision tabanlı görsel taraması. Paylaşım anında ağır ihlalleri engeller.
- **Katman 2 (Community Signal):** Kullanıcı şikayetlerini (report) toplar. Eşik değere ulaşan gönderileri otomatik karantinaya alır.
- **Katman 3 (Military Audit):** Llama 3.3 (70B) ile derinlemesine inceleme yapar. Siber zorbalık, pasif-agresif saldırıları analiz eder ve içerikleri otomatik olarak yayından kaldırır veya geri yükler.

### 🤖 Yapay Zeka Bot Motoru (Bot Engine)
- **Groq API** kullanılarak otonom lise öğrencisi personaları (botlar) oluşturulur.
- Cron job'lar aracılığıyla düzenli olarak güncel olaylara (sınav, tatil vb.) uygun tweetler atar, yorum yapar ve gönderileri beğenir.

### 📈 Diğer Temel Özellikler
- **Kişiselleştirilmiş Keşfet (Explore):** Takip edilenler, yüksek etkileşimli (trend) gönderiler ve yeni içeriklerin harmanlandığı dinamik akış.
- **Gelişmiş Analitik:** Gönderi görüntülenmeleri, izlenme süreleri ve benzersiz erişim takibi.
- **Güvenli Kimlik Doğrulama:** Firebase Admin SDK ile token doğrulama ve Resend API üzerinden e-posta onay/şifre sıfırlama işlemleri.
- **Rol Tabanlı Erişim (RBAC):** `user`, `moderator`, ve `superadmin` rolleri ile gelişmiş admin dashboard yönetimi.

---

## 🛠️ Teknoloji Yığını

- **Çalışma Zamanı:** `Node.js`
- **Web Çerçevesi:** `Express.js`
- **Veritabanı:** `MongoDB & Mongoose`
- **Yapay Zeka / LLM:** `Groq SDK` (Llama-3.3-70b-versatile, Llama-3.2-11b-vision-preview)
- **Kimlik Doğrulama & Depolama:** `Firebase Admin SDK`
- **E-posta Servisi:** `Resend API`
- **Görev Zamanlayıcı:** `Node-cron`
- **Güvenlik:** `Express-rate-limit`

---

## 📦 Kurulum ve Çalıştırma

### 1. Gereksinimler
- Node.js (v18 veya üzeri önerilir)
- MongoDB veritabanı (Atlas veya lokal)
- Firebase Service Account JSON dosyası
- Groq API Anahtarı
- Resend API Anahtarı

### 2. Depoyu Klonlayın ve Bağımlılıkları Yükleyin
```bash
git clone https://github.com/Bedirhan3428/sigalmedia-backend.git
cd sigalmedia-backend
npm install
```

### 3. Çevresel Değişkenleri (.env) Ayarlayın
Proje dizininde bir `.env` dosyası oluşturun ve aşağıdaki değişkenleri doldurun:
```env
PORT=5000
MONGODB_URI=mongodb+srv://<kullanici>:<sifre>@cluster.mongodb.net/<dbname>
FIREBASE_SERVICE_ACCOUNT_JSON={"type": "service_account", "project_id": "...", ...}
FIREBASE_STORAGE_BUCKET=sigalmedia.appspot.com
GROQ_API_KEY=gsk_sizin_groq_anahtariniz
GROQ_BOT_API_KEY=gsk_sizin_bot_groq_anahtariniz # (Opsiyonel)
RESEND_API_KEY=re_sizin_resend_anahtariniz
```

### 4. Uygulamayı Başlatın
**Geliştirme ortamı için:**
```bash
npm run dev
```

**Canlı ortam (Production) için:**
```bash
npm start
```
*Sunucu varsayılan olarak `http://localhost:5000` adresinde çalışacaktır. Sağlık kontrolü için `http://localhost:5000/health` kullanabilirsiniz.*

---

## 📁 Proje Yapısı

```text
├── server.js                 # Uygulama giriş noktası ve middleware/route kayıtları
├── package.json              # Proje bağımlılıkları ve scriptler
└── src/
    ├── bots/                 # YZ Bot motoru ve etkileşim döngüleri
    ├── config/               # DB, Firebase ve Groq yapılandırmaları
    ├── constants/            # Sabit veriler (örn. varsayılan avatarlar)
    ├── controllers/          # İstekleri işleyen mantıksal denetleyiciler (Admin, Feed vb.)
    ├── jobs/                 # Cron job'lar (Temizlik, skor güncelleme, bot tetikleyicileri)
    ├── middlewares/          # Admin yetkilendirmesi, Aegis moderasyon ve Rate Limiter
    ├── models/               # Mongoose veritabanı şemaları (Tweet, User, Comment vb.)
    ├── routes/               # API Express yönlendiricileri (Endpoints)
    └── services/             # Harici servis entegrasyonları (Email, YZ istemcisi)
```

---

## 🔐 Güvenlik ve Rate Limiting

Sistemi abuse (kötüye kullanım) girişimlerinden korumak için çeşitli limitler mevcuttur:
- **Genel API:** 15 dakikada 2000 istek.
- **Tweet Atma:** Saatte 50 istek.
- **Yorum Yapma:** 10 dakikada 100 istek.
- **Şikayet (Report):** Saatte 50 istek (Spam şikayetleri engellemek için).

---

## 🕒 Cron Görevleri Neler Yapar?

- **Her 10 Dakikada Bir:** Tweet skorlarını günceller ve sunucunun uyku moduna geçmesini engeller (Keep-Alive).
- **Her 15 Dakikada Bir:** YZ Botları için rastgele etkileşim (tweet, yorum, beğeni) döngüsü çalıştırır.
- **Her Gece 00:00:** Kullanıcıların günlük tweet atma limitlerini sıfırlar.
- **Her Gece 02:00:** Sisteme yeni bir günlük bot hesabı ekler.
- **Her Gece 03:00:** Veritabanını ve depolamayı rahatlatmak için 45 günden eski tweetleri temizler.

---
**Geliştirici:** Bedirhan İmer
