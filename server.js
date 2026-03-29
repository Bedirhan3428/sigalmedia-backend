// server.js — Şigal Medya Backend v3
require('dotenv').config();

const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');

// ─── Config & Infra ──────────────────────────────────────────────────────────
const { initFirebase }   = require('./src/config/firebase');
const { connectDB }      = require('./src/config/db');
const { startCronJobs }  = require('./src/jobs/cronJobs');
const { generalLimiter } = require('./src/middlewares/rateLimiters');

// ─── Routes ──────────────────────────────────────────────────────────────────
const userRoutes      = require('./src/routes/users');
const tweetRoutes     = require('./src/routes/tweets');
const commentRoutes   = require('./src/routes/comments');
const feedRoutes      = require('./src/routes/feed');
const adminRoutes     = require('./src/routes/admin');
const safetyRoute     = require('./src/routes/safety');
const authRoutes      = require('./src/routes/auth');       // NEW: Resend
const userSearchRoutes = require('./src/routes/userSearch'); // NEW: Search
const exploreRoutes   = require('./src/routes/explore');    // NEW: Explore algo

// ─── App ─────────────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' })); // Increased for video thumbnails

app.use(cors({
  origin: [
    'https://sigalmedia.site',
    'https://www.sigalmedia.site',
    'https://sigalmedia.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173',
  ],
  optionsSuccessStatus: 200,
}));

app.use(generalLimiter);

// ─── Auth verify redirect (before /api prefix) ─────────────────────────────
app.get('/verify', (req, res) => {
  const { token, uid } = req.query;
  res.redirect(`/api/auth/verify?token=${token}&uid=${uid}`);
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api', authRoutes);       // POST /api/auth/register, /api/auth/verify...
app.use('/api', userSearchRoutes); // GET  /api/users/search, /api/users/suggested
app.use('/api', exploreRoutes);    // GET  /api/explore, /api/explore/hashtag/:tag
app.use('/api', userRoutes);
app.use('/api', tweetRoutes);
app.use('/api', commentRoutes);
app.use('/api', feedRoutes);
app.use('/api', adminRoutes);
app.use('/api', safetyRoute);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString(), version: '3.0' }));

// ─── Boot Sequence ────────────────────────────────────────────────────────────
async function boot() {
  initFirebase();
  await connectDB();

  const { Tweet } = require('./src/models/Tweet');
  const { User }  = require('./src/models/User');
  const Comment   = require('./src/models/Comment');

  await Promise.all([
    Tweet.collection.createIndex({ score: -1, createdAt: -1 }),
    Tweet.collection.createIndex({ authorId: 1, createdAt: -1 }),
    Tweet.collection.createIndex({ createdAt: -1 }),
    Tweet.collection.createIndex({ likedBy: 1 }),
    Tweet.collection.createIndex({ createdAt: 1 }),
    Tweet.collection.createIndex({ aegisStatus: 1, reportCount: -1 }),
    Tweet.collection.createIndex({ content: 'text' }), // NEW: text search for hashtags
    Comment.collection.createIndex({ tweetId: 1 }),
    Comment.collection.createIndex({ likedBy: 1 }),
    User.collection.createIndex({ deviceId: 1 }, { unique: true }),
    User.collection.createIndex({ username: 1 }),
    User.collection.createIndex({ username: 'text' }), // NEW: search index
  ]);
  console.log("✅ Index'ler hazır.");

  startCronJobs();

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`🚀 Sigal Media Backend v3 — Port: ${PORT}`));
}

boot().catch(err => {
  console.error('❌ Boot hatası:', err);
  process.exit(1);
});

// ─── ENV variables needed ─────────────────────────────────────────────────────
// MONGODB_URI
// FIREBASE_SERVICE_ACCOUNT_JSON
// FIREBASE_STORAGE_BUCKET
// GROQ_API_KEY
// GROQ_BOT_API_KEY
// RESEND_API_KEY          ← NEW
// PORT (optional, default 5000)
