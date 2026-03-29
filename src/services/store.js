const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'store.json');

function ensureDirExists(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadStore() {
  try {
    ensureDirExists(path.dirname(DATA_FILE));
    if (!fs.existsSync(DATA_FILE)) {
      const initial = {
        accounts: [],
        templates: {
          tweet: [],
          comment: [],
        },
        logs: [],
      };
      fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf8');
      return initial;
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load store.json, using empty store.', e);
    return {
      accounts: [],
      templates: {
        tweet: [],
        comment: [],
      },
      logs: [],
    };
  }
}

function saveStore(store) {
  ensureDirExists(path.dirname(DATA_FILE));
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
}

module.exports = {
  loadStore,
  saveStore,
};

