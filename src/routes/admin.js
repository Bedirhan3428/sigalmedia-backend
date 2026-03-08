const express = require('express');
const router  = express.Router();
const ac      = require('../controllers/adminController');
const { requireMod, requireSuperAdmin } = require('../middlewares/adminAuth');
const { adminLimiter } = require('../middlewares/rateLimiters');

router.use(adminLimiter);

// ─── Moderatör + Super Admin ──────────────────────────────────────────────
router.get('/admin/stats',                       requireMod, ac.getStats);
router.get('/admin/quarantine',                  requireMod, ac.getQuarantine);
router.get('/admin/suspended',                   requireMod, ac.getSuspended);
router.get('/admin/all-tweets',                  requireMod, ac.getAllTweets);
router.get('/admin/audit-log',                   requireMod, ac.getAuditLog);
router.post('/admin/decision/:tweetId',          requireMod, ac.makeDecision);
router.delete('/admin/tweet/:tweetId',           requireMod, ac.adminDeleteTweet);

// ─── Sadece Super Admin ──────────────────────────────────────────────────
router.post('/admin/force-audit/:tweetId',       requireSuperAdmin, ac.forceAudit);
router.put('/admin/user-role',                   requireSuperAdmin, ac.updateUserRole);

module.exports = router;