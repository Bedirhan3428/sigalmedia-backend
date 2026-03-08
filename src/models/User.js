const mongoose = require('mongoose');

// ─── RBAC: Rol sabitleri ─────────────────────────────────────────────────────
// 'user'       → Standart üye
// 'moderator'  → Karantina kararlarını onaylayabilir / reddedebilir
// 'superadmin' → Tüm yetkilere sahip, kullanıcı rollerini değiştirebilir
const ROLES = ['user', 'moderator', 'superadmin'];

const userSchema = new mongoose.Schema({
    deviceId:      { type: String, required: true, unique: true },
    username:      { type: String, default: 'Anonim' },
    avatar:        { type: String, default: 'Anonim' },
    avatarUrl:     { type: String, default: null },
    dailyLimit:    { type: Number, default: 3 },
    lastResetDate: { type: Date,   default: Date.now },
    followers:     [{ type: String }],
    following:     [{ type: String }],
    role:          { type: String, enum: ROLES, default: 'user' },
});

const User = mongoose.model('User', userSchema);

module.exports = { User, ROLES };