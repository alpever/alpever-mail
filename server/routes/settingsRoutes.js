const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { initDB, getPool, getStatus } = require('../db/pool');
const { verifyApiKey } = require('../services/resendService');

/**
 * Helper to sync key-values directly to .env file on disk
 */
function updateEnvFile(updates = {}) {
  const envPath = path.join(__dirname, '../../.env');
  let content = '';
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8');
  }

  const lines = content.split(/\r?\n/);
  const handled = new Set();
  const newLines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      if (updates[key] !== undefined) {
        handled.add(key);
        return `${key}=${updates[key]}`;
      }
    }
    return line;
  });

  // Append any keys that weren't already in .env
  for (const [key, val] of Object.entries(updates)) {
    if (!handled.has(key)) {
      newLines.push(`${key}=${val}`);
    }
    process.env[key] = String(val);
  }

  fs.writeFileSync(envPath, newLines.join('\n'), 'utf8');
}

/**
 * Helper to get/set settings from .env first, then DB
 */
async function getStoredSetting(key, fallback = '') {
  if (process.env[key] !== undefined && process.env[key] !== '') {
    return process.env[key];
  }
  const pool = getPool();
  if (pool) {
    try {
      const [rows] = await pool.query('SELECT value_text FROM settings WHERE key_name = ?', [key]);
      if (rows.length && rows[0].value_text !== null) {
        return rows[0].value_text;
      }
    } catch (e) {}
  }
  return fallback;
}

async function setStoredSetting(key, val) {
  // 1. Update .env file on disk
  updateEnvFile({ [key]: val });

  // 2. Also update MySQL settings table
  const pool = getPool();
  if (pool) {
    try {
      await pool.query(
        'INSERT INTO settings (key_name, value_text) VALUES (?, ?) ON DUPLICATE KEY UPDATE value_text = VALUES(value_text)',
        [key, val]
      );
    } catch (e) {}
  }
}

// GET /api/settings
router.get('/', async (req, res) => {
  const apiKey = await getStoredSetting('RESEND_API_KEY');
  const fromName = await getStoredSetting('DEFAULT_FROM_NAME', 'Alpever AI');
  const fromEmail = await getStoredSetting('DEFAULT_FROM_EMAIL', 'onboarding@resend.dev');
  const replyTo = await getStoredSetting('DEFAULT_REPLY_TO', '');
  const dbStatus = getStatus();

  res.json({
    resendApiKey: apiKey ? (apiKey.length > 8 ? `${apiKey.substring(0, 6)}...${apiKey.substring(apiKey.length - 4)}` : 'configured') : '',
    hasApiKey: Boolean(apiKey),
    fromName,
    fromEmail,
    replyTo,
    db: {
      connected: dbStatus.connected,
      message: dbStatus.message,
      error: dbStatus.error,
      config: dbStatus.config
    }
  });
});

// POST /api/settings
router.post('/', async (req, res) => {
  try {
    const { resendApiKey, fromName, fromEmail, replyTo } = req.body;

    if (resendApiKey && !resendApiKey.includes('...')) {
      await setStoredSetting('RESEND_API_KEY', resendApiKey.trim());
    }
    if (fromName !== undefined) {
      await setStoredSetting('DEFAULT_FROM_NAME', fromName.trim());
    }
    if (fromEmail !== undefined) {
      await setStoredSetting('DEFAULT_FROM_EMAIL', fromEmail.trim());
    }
    if (replyTo !== undefined) {
      await setStoredSetting('DEFAULT_REPLY_TO', replyTo.trim());
    }

    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/verify-resend
router.post('/verify-resend', async (req, res) => {
  try {
    let { apiKey } = req.body;
    if (!apiKey || apiKey.includes('...')) {
      apiKey = await getStoredSetting('RESEND_API_KEY');
    }

    if (!apiKey) {
      return res.status(400).json({ valid: false, message: 'Please provide a Resend API key.' });
    }

    const result = await verifyApiKey(apiKey);
    if (result.valid) {
      await setStoredSetting('RESEND_API_KEY', apiKey);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ valid: false, message: err.message });
  }
});

// POST /api/settings/test-db
router.post('/test-db', async (req, res) => {
  try {
    const { host, port, user, password, database } = req.body;
    const result = await initDB({
      host: host || '127.0.0.1',
      port: port ? parseInt(port, 10) : 3306,
      user: user || 'root',
      password: password !== undefined ? password : '',
      database: database || 'mass_mailer_db'
    });

    if (result.success) {
      // Also update process.env and .env file
      updateEnvFile({
        DB_HOST: host || '127.0.0.1',
        DB_PORT: String(port || 3307),
        DB_USER: user || 'root',
        DB_PASSWORD: password !== undefined ? password : '',
        DB_NAME: database || 'mass_mailer_db'
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = {
  router,
  getStoredSetting
};
