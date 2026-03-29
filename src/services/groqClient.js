// Placeholder Groq client.
// Here we only shape the prompts; you will later plug in real Groq API calls.

async function callGroq(prompt) {
  // TODO: replace this with real Groq HTTP request using axios and process.env.GROQ_API_KEY
  // For now, just return something simple to let the system run.
  return `FAKE_GROQ_RESPONSE: ${prompt.slice(0, 120)}`;
}

async function generatePersona() {
  const prompt = `
Sen Türkiye'de okuyan 16-18 yaş arası bir lise öğrencisi gibi davran.
Türkçe konuş. Küfür yok, hafif samimi bir dil kullan.
Rastgele bir sosyal medya hesabı personası üret ve aşağıdaki JSON formatında dön:
{
  "username": "...",
  "displayName": "...",
  "bio": "...",
  "avatarUrl": "https://example.com/avatar1.png",
  "interests": ["...","..."]
}
Sadece geçerli JSON döndür.
`;

  const raw = await callGroq(prompt);

  // For now, return a static persona when using fake client
  try {
    const parsed = JSON.parse(raw);
    return parsed;
  } catch {
    return {
      username: 'lise_' + Math.floor(Math.random() * 100000),
      displayName: 'Lise Bot',
      bio: 'Lise öğrencisi, sosyal medyada takılan bot 🤖',
      avatarUrl: 'https://example.com/avatar-placeholder.png',
      interests: ['müzik', 'oyun', 'sosyal medya'],
    };
  }
}

async function generateTweet(account, examples) {
  const exampleText = examples
    .slice(0, 5)
    .map((t, idx) => `${idx + 1}) ${t}`)
    .join('\n');

  const prompt = `
Sen Türkiye'de okuyan 16-18 yaşlarında bir lise öğrencisisin.
Türkçe yaz, samimi ama küfürsüz bir dil kullan.
Aşağıdaki örnek tweetlerin stilini taklit ederek yeni bir tweet üret.
Aynı cümleleri kopyalama, sadece tarzı al.

Örnekler:
${exampleText || '(Henüz örnek yok, tamamen sen üret.)'}

Hesap bilgileri:
Kullanıcı adı: ${account.username}
Bio: ${account.bio}
İlgi alanları: ${(account.interests || []).join(', ')}

Çıktı: Sadece tek bir tweet metni döndür, başka hiçbir açıklama yazma.
`;

  const raw = await callGroq(prompt);
  return raw;
}

async function generateComment(account, targetTweet, examples) {
  const exampleText = examples
    .slice(0, 5)
    .map((t, idx) => `${idx + 1}) ${t}`)
    .join('\n');

  const prompt = `
Sen Türkiye'de okuyan 16-18 yaşlarında bir lise öğrencisisin.
Türkçe yaz, samimi ama küfürsüz bir dil kullan.
Aşağıdaki tweet'e kısa ve doğal bir yorum yap.

Tweet:
${targetTweet.text}

Örnek yorum stili:
${exampleText || '(Henüz örnek yok, tamamen sen üret.)'}

Hesap bilgileri:
Kullanıcı adı: ${account.username}
Bio: ${account.bio}

Çıktı: Sadece yorum metnini döndür, başka hiçbir açıklama yazma.
`;

  const raw = await callGroq(prompt);
  return raw;
}

module.exports = {
  generatePersona,
  generateTweet,
  generateComment,
};

