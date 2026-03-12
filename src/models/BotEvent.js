const mongoose = require('mongoose');

// Adminın girdiği etkinlik takvimi — botlar bu tarihlere göre içerik üretir
const botEventSchema = new mongoose.Schema({
    title:       { type: String, required: true, maxlength: 80 },
    date:        { type: Date,   required: true },       // etkinlik tarihi
    type: {
        type:    String,
        enum:    ['exam', 'holiday', 'special', 'other'],
        default: 'other',
    },
    description: { type: String, default: '', maxlength: 200 }, // isteğe bağlı ek bağlam
    active:      { type: Boolean, default: true },
    addedBy:     { type: String,  default: 'system' },
    createdAt:   { type: Date,    default: Date.now },
});

module.exports = mongoose.model('BotEvent', botEventSchema);