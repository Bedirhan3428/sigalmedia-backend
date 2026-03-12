const mongoose = require('mongoose');

const botExampleSchema = new mongoose.Schema({
    type:      { type: String, enum: ['tweet', 'comment'], required: true },
    content:   { type: String, required: true, maxlength: 280 },
    active:    { type: Boolean, default: true },
    addedBy:   { type: String, default: 'system' },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('BotExample', botExampleSchema);