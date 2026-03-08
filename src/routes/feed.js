const express = require('express');
const router  = express.Router();
const fc      = require('../controllers/feedController');

router.get('/feed',                    fc.getFeed);
router.get('/feed/new',                fc.getNewFeed);
router.get('/bomb-tweet',              fc.getBombTweet);
router.get('/feed/following/:deviceId', fc.getFollowingFeed);

module.exports = router;