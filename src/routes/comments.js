const express      = require('express');
const router       = express.Router();
const cc           = require('../controllers/commentController');
const { commentLimiter } = require('../middlewares/rateLimiters');

router.post('/comment/:tweetId',         commentLimiter, cc.createComment);
router.get('/comments/:tweetId',                         cc.getComments);
router.delete('/comment/:commentId',                     cc.deleteComment);
router.post('/like-comment/:commentId',                  cc.likeComment);
router.delete('/like-comment/:commentId',                cc.unlikeComment);

module.exports = router;