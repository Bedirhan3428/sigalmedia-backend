const mongoose = require('mongoose');

const ACTIONS = [
    'view', 'like', 'unlike', 'comment', 'share', 'save',
    'follow', 'unfollow', 'story_view', 'reel_watch',
    'profile_visit', 'search', 'post_create',
];

const TARGET_TYPES = ['post', 'user', 'story', 'reel', 'hashtag'];

const activityLogSchema = new mongoose.Schema({
    userId:     { type: String, required: true },
    action:     { type: String, enum: ACTIONS, required: true },
    targetId:   { type: String, default: null },
    targetType: { type: String, enum: TARGET_TYPES, default: null },
    metadata: {
        duration:   { type: Number, default: null },   // saniye
        percentage: { type: Number, default: null },   // video izlenme %
        source:     { type: String, default: null },   // feed, explore, profile, reels
    },
    timestamp:  { type: Date, default: Date.now },
});

// 90 gün sonra otomatik sil (TTL index)
activityLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 });
activityLogSchema.index({ userId: 1, timestamp: -1 });
activityLogSchema.index({ targetId: 1, action: 1 });
activityLogSchema.index({ action: 1, timestamp: -1 });

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

module.exports = { ActivityLog, ACTIONS, TARGET_TYPES };
