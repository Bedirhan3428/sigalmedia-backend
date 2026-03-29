require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const bodyParser = require('body-parser');

const { loadStore, saveStore } = require('./store');
const { runInteractionCycle, createDailyAccountIfNeeded } = require('./botService');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(bodyParser.json());

// Simple in-file JSON store is loaded into memory on startup
const store = loadStore();

// inject store into request for routes
app.use((req, res, next) => {
  req.store = store;
  next();
});

// Admin routes for uploading templates (tweet/comment examples)
app.post('/admin/templates', (req, res) => {
  const { type, examples } = req.body;

  if (!type || !['tweet', 'comment'].includes(type)) {
    return res.status(400).json({ error: 'type must be tweet or comment' });
  }

  if (!Array.isArray(examples) || examples.length === 0) {
    return res.status(400).json({ error: 'examples must be a non-empty array' });
  }

  store.templates[type] = store.templates[type].concat(
    examples.map((text) => ({ id: Date.now() + Math.random(), text }))
  );

  saveStore(store);

  res.json({ success: true, count: store.templates[type].length });
});

app.get('/admin/templates', (req, res) => {
  res.json(store.templates);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// Schedule: every day at 00:05 create one account if missing
cron.schedule('5 0 * * *', () => {
  createDailyAccountIfNeeded(store)
    .then(() => {
      saveStore(store);
    })
    .catch((err) => {
      console.error('Error in daily account job', err);
    });
});

// Schedule: every 15 minutes run interaction cycle
cron.schedule('*/15 * * * *', () => {
  runInteractionCycle(store)
    .then(() => {
      saveStore(store);
    })
    .catch((err) => {
      console.error('Error in interaction cycle', err);
    });
});

app.listen(PORT, () => {
  console.log(`Bot service listening on port ${PORT}`);
});

