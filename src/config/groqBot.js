const Groq = require('groq-sdk');

if (!process.env.GROQ_BOT_API_KEY) {
    console.warn('⚠️  GROQ_BOT_API_KEY eksik — bot içerik üretimi devre dışı.');
}

const groqBot = new Groq({
    apiKey: process.env.GROQ_BOT_API_KEY || process.env.GROQ_API_KEY,
});

module.exports = groqBot;