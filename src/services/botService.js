const { generatePersona, generateTweet, generateComment } = require('./groqClient');

function getTodayDateKey() {
  const now = new Date();
  return now.toISOString().slice(0, 10); // YYYY-MM-DD
}

async function createDailyAccountIfNeeded(store) {
  const todayKey = getTodayDateKey();
  const hasTodayAccount = store.accounts.some(
    (acc) => acc.createdDate === todayKey
  );

  if (hasTodayAccount) {
    return;
  }

  const persona = await generatePersona();

  const newAccount = {
    id: Date.now() + Math.random(),
    username: persona.username,
    displayName: persona.displayName,
    bio: persona.bio,
    avatarUrl: persona.avatarUrl,
    interests: persona.interests || [],
    createdDate: todayKey,
    isActive: true,
  };

  // TODO: here you would actually call the platform API to register the account

  store.accounts.push(newAccount);
  store.logs.push({
    id: Date.now() + Math.random(),
    type: 'create_account',
    accountId: newAccount.id,
    createdAt: new Date().toISOString(),
    details: { username: newAccount.username },
  });

  console.log('Created daily bot account', newAccount.username);
}

async function runInteractionCycle(store) {
  const activeAccounts = store.accounts.filter((a) => a.isActive);
  if (activeAccounts.length === 0) {
    console.log('No active bot accounts yet, skipping interaction cycle.');
    return;
  }

  const account =
    activeAccounts[Math.floor(Math.random() * activeAccounts.length)];

  const actions = ['tweet', 'comment', 'like'];
  const chosen = actions[Math.floor(Math.random() * actions.length)];

  if (chosen === 'tweet') {
    await handleTweet(store, account);
  } else if (chosen === 'comment') {
    await handleComment(store, account);
  } else {
    await handleLike(store, account);
  }
}

async function handleTweet(store, account) {
  const examples = store.templates.tweet.map((t) => t.text);
  const tweetText = await generateTweet(account, examples);

  // TODO: call platform tweet API here
  const fakeTweetId = 'tw_' + Date.now();

  store.logs.push({
    id: Date.now() + Math.random(),
    type: 'tweet',
    accountId: account.id,
    createdAt: new Date().toISOString(),
    details: { tweetId: fakeTweetId, text: tweetText },
  });

  console.log(
    `Account ${account.username} tweeted: ${tweetText.substring(0, 120)}`
  );
}

async function handleComment(store, account) {
  const examples = store.templates.comment.map((t) => t.text);

  // TODO: fetch a real target tweet from platform
  const targetTweet = {
    id: 'target_' + Date.now(),
    text: 'Bu, hedef tweet metni için bir placeholder.',
  };

  const commentText = await generateComment(account, targetTweet, examples);

  // TODO: call platform comment API here

  store.logs.push({
    id: Date.now() + Math.random(),
    type: 'comment',
    accountId: account.id,
    createdAt: new Date().toISOString(),
    details: { targetTweetId: targetTweet.id, text: commentText },
  });

  console.log(
    `Account ${account.username} commented on ${targetTweet.id}: ${commentText.substring(
      0,
      120
    )}`
  );
}

async function handleLike(store, account) {
  // TODO: fetch a real target tweet from platform
  const targetTweet = {
    id: 'target_' + Date.now(),
    text: 'Bu, like için sahte bir hedef tweet.',
  };

  // TODO: call platform like API here

  store.logs.push({
    id: Date.now() + Math.random(),
    type: 'like',
    accountId: account.id,
    createdAt: new Date().toISOString(),
    details: { targetTweetId: targetTweet.id },
  });

  console.log(
    `Account ${account.username} liked tweet ${targetTweet.id}`
  );
}

module.exports = {
  createDailyAccountIfNeeded,
  runInteractionCycle,
};

