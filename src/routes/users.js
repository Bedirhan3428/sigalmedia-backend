const express = require('express');
const router  = express.Router();
const uc      = require('../controllers/userController');

router.get('/avatars',                   uc.getAvatars);
router.post('/init-user',                uc.initUser);
router.get('/user/:deviceId',            uc.getUser);
router.put('/user/:deviceId',            uc.updateUser);
router.get('/public-user/:deviceId',     uc.getPublicUser);
router.post('/follow',                   uc.follow);
router.delete('/follow',                 uc.unfollow);
router.get('/following-ids/:deviceId',   uc.getFollowingIds);
router.get('/followers/:deviceId',       uc.getFollowers);
router.get('/following/:deviceId',       uc.getFollowing);
router.get('/liked-ids/:deviceId',       uc.getLikedIds);
router.get('/my-likes/:deviceId',        uc.getMyLikes);

module.exports = router;