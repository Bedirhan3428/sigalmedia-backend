const express      = require('express');
const router       = express.Router();
const tc           = require('../controllers/tweetController');
const { tweetLimiter, reportLimiter } = require('../middlewares/rateLimiters');

router.post('/tweet',                           tweetLimiter, tc.createTweet);
router.delete('/tweet/:tweetId',                tc.deleteTweet);
router.post('/like/:tweetId',                   tc.likeTweet);
router.delete('/like/:tweetId',                 tc.unlikeTweet);
// ── Aegis Katman 2: Community Signal ────────────────────────────────────────
router.post('/report/:tweetId',                 reportLimiter, tc.reportTweet);
router.get('/my-tweets/:deviceId',              tc.getMyTweets);

module.exports = router;