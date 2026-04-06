const express = require('express');
const router  = express.Router();
const ac      = require('../controllers/analyticsController');
const { requireMod } = require('../middlewares/adminAuth');

// ─── Public (herkes) ─────────────────────────────────────────────────────────
router.post('/analytics/batch',             ac.trackBatch);
router.get('/analytics/post/:postId',       ac.getPostAnalytics);

// ─── Admin ───────────────────────────────────────────────────────────────────
router.get('/admin/analytics/overview',     requireMod, ac.getOverview);

module.exports = router;
