const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
    tweetId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Tweet', required: true },
    authorId:        { type: String, required: true },
    authorAvatar:    { type: String, required: true },
    authorAvatarUrl: { type: String, default: null },
    content:         { type: String, required: true, maxlength: 280 },
    likes:           { type: Number, default: 0 },
    likedBy:         [{ type: String }],
    createdAt:       { type: Date, default: Date.now }
});

const Comment = mongoose.model('Comment', commentSchema);

module.exports = Comment;