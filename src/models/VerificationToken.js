const mongoose = require('mongoose');

const verificationTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true
  },
  uid: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 3600 // 1 hour in seconds
  }
});

const VerificationToken = mongoose.model('VerificationToken', verificationTokenSchema);

module.exports = { VerificationToken };
