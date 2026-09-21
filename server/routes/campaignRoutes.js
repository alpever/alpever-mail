const express = require('express');
const router = express.Router();
const { getPool } = require('../db/pool');
const { getStoredSetting } = require('./settingsRoutes');
const { renderEmail } = require('../services/templateEngine');
const { sendSingleEmail } = require('../services/resendService');
const {
  executeCampaign,
  getCampaignProgress,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign
} = require('../services/queueService');

// GET /api/campaigns - List all campaigns
router.get('/', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    const [rows] = await pool.query(`
      SELECT c.*, 
        t.name as template_name,
        l.name as list_name
      FROM campaigns c
      LEFT JOIN templates t ON c.template_id = t.id
      LEFT JOIN contact_lists l ON c.list_id = l.id
      ORDER BY c.created_at DESC
    `);

    // Check if any is currently running in memory
    const enriched = rows.map(camp => {
      const active = getCampaignProgress(camp.id);
      if (active) {
        return {
          ...camp,
          status: active.status,
          sent_count: active.sent,
          failed_count: active.failed,
          percentage: active.percentage,
          etaSeconds: active.etaSeconds
        };
      }
      return {
        ...camp,
        percentage: camp.total_count > 0 ? Math.round(((camp.sent_count + camp.failed_count) / camp.total_count) * 100) : 0
      };
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/campaigns/:id - Single campaign info
router.get('/:id', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    const [rows] = await pool.query(`
      SELECT c.*, 
        t.name as template_name, t.subject, t.body_html,
        l.name as list_name
      FROM campaigns c
      LEFT JOIN templates t ON c.template_id = t.id
      LEFT JOIN contact_lists l ON c.list_id = l.id
      WHERE c.id = ?
    `, [req.params.id]);

    if (!rows.length) return res.status(404).json({ error: 'Campaign not found' });
    const camp = rows[0];

    const active = getCampaignProgress(camp.id);
    if (active) {
      camp.status = active.status;
      camp.sent_count = active.sent;
      camp.failed_count = active.failed;
      camp.percentage = active.percentage;
      camp.etaSeconds = active.etaSeconds;
    } else {
      camp.percentage = camp.total_count > 0 ? Math.round(((camp.sent_count + camp.failed_count) / camp.total_count) * 100) : 0;
    }

    res.json(camp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/campaigns/:id/progress - Live progress stream/polling
router.get('/:id/progress', async (req, res) => {
  const campaignId = req.params.id;
  const active = getCampaignProgress(campaignId);

  if (active) {
    return res.json(active);
  }

  // Fallback to database
  const pool = getPool();
  if (!pool) return res.json({ status: 'unknown' });

  const [rows] = await pool.query(
    'SELECT status, total_count, sent_count, failed_count FROM campaigns WHERE id = ?',
    [campaignId]
  );

  if (!rows.length) return res.status(404).json({ error: 'Campaign not found' });
  const c = rows[0];

  res.json({
    id: campaignId,
    status: c.status,
    total: c.total_count,
    sent: c.sent_count,
    failed: c.failed_count,
    percentage: c.total_count > 0 ? Math.round(((c.sent_count + c.failed_count) / c.total_count) * 100) : 0,
    etaSeconds: null
  });
});

// POST /api/campaigns - Create a new campaign and populate recipient logs
router.post('/', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    const { name, template_id, list_id, from_name, from_email, reply_to } = req.body;

    if (!name || !template_id || !list_id) {
      return res.status(400).json({ error: 'Name, Template, and Contact List are required.' });
    }

    // Default sender info if not provided
    const senderName = from_name || (await getStoredSetting('DEFAULT_FROM_NAME', 'Alpever AI'));
    const senderEmail = from_email || (await getStoredSetting('DEFAULT_FROM_EMAIL', 'onboarding@resend.dev'));

    // Count contacts in the list
    const [contacts] = await pool.query(
      'SELECT id, email, name FROM contacts WHERE list_id = ? AND status = "active"',
      [list_id]
    );

    if (!contacts.length) {
      return res.status(400).json({ error: 'Selected contact list has no active contacts.' });
    }

    // Insert Campaign
    const [cResult] = await pool.query(
      `INSERT INTO campaigns (name, template_id, list_id, from_name, from_email, reply_to, status, total_count)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)`,
      [name, template_id, list_id, senderName, senderEmail, reply_to || null, contacts.length]
    );
    const campaignId = cResult.insertId;

    // Bulk insert initial pending logs in chunks of 500
    const CHUNK_SIZE = 500;
    for (let i = 0; i < contacts.length; i += CHUNK_SIZE) {
      const chunk = contacts.slice(i, i + CHUNK_SIZE);
      const values = chunk.map(c => [
        campaignId,
        c.id,
        c.email,
        c.name || null,
        'pending'
      ]);

      await pool.query(
        'INSERT INTO campaign_logs (campaign_id, contact_id, email, recipient_name, status) VALUES ?',
        [values]
      );
    }

    res.json({
      success: true,
      campaignId,
      name,
      totalRecipients: contacts.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/campaigns/test-send-direct - Send 1 test email from wizard before campaign creation
router.post('/test-send-direct', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    const { templateId, listId, testEmail, fromName, fromEmail, replyTo } = req.body;

    if (!testEmail) {
      return res.status(400).json({ error: 'Target test email address is required.' });
    }
    if (!templateId) {
      return res.status(400).json({ error: 'Template is required to send a test email.' });
    }

    const apiKey = await getStoredSetting('RESEND_API_KEY');
    if (!apiKey) {
      return res.status(400).json({ error: 'Resend API key is not configured. Please add it in Settings.' });
    }

    const [tRows] = await pool.query('SELECT * FROM templates WHERE id = ?', [templateId]);
    if (!tRows.length) {
      return res.status(404).json({ error: 'Template not found' });
    }
    const template = tRows[0];

    // Pick first contact from list if provided for realistic variable replacement
    let sample = {
      name: 'Valued Partner',
      company: 'Sample Enterprise',
      email: testEmail
    };

    if (listId) {
      const [sampleContacts] = await pool.query(
        'SELECT * FROM contacts WHERE list_id = ? LIMIT 1',
        [listId]
      );
      if (sampleContacts.length) {
        sample = { ...sampleContacts[0], email: testEmail };
      }
    }

    const senderName = fromName || (await getStoredSetting('DEFAULT_FROM_NAME', 'Alpever AI'));
    const senderEmail = fromEmail || (await getStoredSetting('DEFAULT_FROM_EMAIL', 'connect@flow.alpever.com'));

    const rendered = renderEmail(
      { subject: template.subject, body_html: template.body_html, body_text: template.body_text },
      sample,
      { sender_name: senderName }
    );

    const result = await sendSingleEmail(apiKey, {
      from: `${senderName} <${senderEmail}>`,
      to: testEmail,
      subject: `[TEST] ${rendered.subject}`,
      html: rendered.html,
      reply_to: replyTo || undefined
    });

    res.json({
      success: true,
      resendId: result.id,
      message: `Test email successfully dispatched to ${testEmail}`
    });
  } catch (err) {
    console.error('Test email send error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/campaigns/:id/test-send - Send 1 test email
router.post('/:id/test-send', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    const { testEmail } = req.body;
    if (!testEmail) {
      return res.status(400).json({ error: 'Target test email address is required.' });
    }

    const apiKey = await getStoredSetting('RESEND_API_KEY');
    if (!apiKey) {
      return res.status(400).json({ error: 'Resend API key is not configured. Please add it in Settings.' });
    }

    const [cRows] = await pool.query(`
      SELECT c.*, t.subject, t.body_html, t.body_text
      FROM campaigns c
      JOIN templates t ON c.template_id = t.id
      WHERE c.id = ?
    `, [req.params.id]);

    if (!cRows.length) return res.status(404).json({ error: 'Campaign not found' });
    const camp = cRows[0];

    // Pick first contact from list for realistic preview substitution
    const [sampleContacts] = await pool.query(
      'SELECT * FROM contacts WHERE list_id = ? LIMIT 1',
      [camp.list_id]
    );

    const sample = sampleContacts[0] || {
      name: 'Valued Partner',
      company: 'Sample Enterprise',
      email: testEmail
    };

    // Render with test email recipient
    const rendered = renderEmail(
      { subject: camp.subject, body_html: camp.body_html, body_text: camp.body_text },
      { ...sample, email: testEmail },
      { sender_name: camp.from_name }
    );

    const result = await sendSingleEmail(apiKey, {
      from: `${camp.from_name} <${camp.from_email}>`,
      to: testEmail,
      subject: `[TEST] ${rendered.subject}`,
      html: rendered.html,
      reply_to: camp.reply_to || undefined
    });

    res.json({
      success: true,
      resendId: result.id,
      message: `Test email successfully dispatched to ${testEmail}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/campaigns/:id/launch - Launch mass email delivery
router.post('/:id/launch', async (req, res) => {
  try {
    const apiKey = await getStoredSetting('RESEND_API_KEY');
    if (!apiKey) {
      return res.status(400).json({
        error: 'Resend API key is missing. Please configure your API key in Settings before launching.'
      });
    }

    const campaignId = req.params.id;
    await executeCampaign(campaignId, apiKey);

    res.json({
      success: true,
      campaignId,
      message: 'Campaign has been launched into the delivery queue!'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/campaigns/:id/pause
router.post('/:id/pause', (req, res) => {
  const success = pauseCampaign(req.params.id);
  res.json({ success, message: success ? 'Campaign paused' : 'Could not pause campaign' });
});

// POST /api/campaigns/:id/resume
router.post('/:id/resume', async (req, res) => {
  const apiKey = await getStoredSetting('RESEND_API_KEY');
  const success = await resumeCampaign(req.params.id, apiKey);
  res.json({ success, message: success ? 'Campaign resumed' : 'Could not resume campaign' });
});

// POST /api/campaigns/:id/cancel
router.post('/:id/cancel', (req, res) => {
  const success = cancelCampaign(req.params.id);
  res.json({ success, message: success ? 'Campaign cancelled' : 'Could not cancel campaign' });
});

// GET /api/campaigns/:id/logs - Delivery logs with pagination & filters
router.get('/:id/logs', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  const campaignId = req.params.id;
  const statusFilter = req.query.status; // 'sent', 'failed', 'pending', or null for all
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '50', 10);
  const offset = (page - 1) * limit;

  try {
    let countQuery = 'SELECT COUNT(*) as total FROM campaign_logs WHERE campaign_id = ?';
    let dataQuery = 'SELECT * FROM campaign_logs WHERE campaign_id = ?';
    const params = [campaignId];

    if (statusFilter && ['sent', 'failed', 'pending'].includes(statusFilter)) {
      countQuery += ' AND status = ?';
      dataQuery += ' AND status = ?';
      params.push(statusFilter);
    }

    const [totalRows] = await pool.query(countQuery, params);
    const total = totalRows[0].total;

    dataQuery += ' ORDER BY id ASC LIMIT ? OFFSET ?';
    const [logs] = await pool.query(dataQuery, [...params, limit, offset]);

    res.json({
      campaignId,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      logs
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/campaigns/:id/export - Download delivery report as CSV
router.get('/:id/export', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    const [cRows] = await pool.query('SELECT name FROM campaigns WHERE id = ?', [req.params.id]);
    const campaignName = cRows.length ? cRows[0].name.replace(/[^a-zA-Z0-9_-]/g, '_') : `campaign_${req.params.id}`;

    const [logs] = await pool.query(
      'SELECT id, email, recipient_name, status, resend_id, error_message, sent_at FROM campaign_logs WHERE campaign_id = ? ORDER BY id ASC',
      [req.params.id]
    );

    const headers = ['Log ID', 'Email', 'Recipient Name', 'Status', 'Resend ID', 'Error Reason', 'Sent Timestamp'];
    const rows = logs.map(l => [
      l.id,
      `"${(l.email || '').replace(/"/g, '""')}"`,
      `"${(l.recipient_name || '').replace(/"/g, '""')}"`,
      l.status,
      l.resend_id || '',
      `"${(l.error_message || '').replace(/"/g, '""')}"`,
      l.sent_at ? new Date(l.sent_at).toISOString() : ''
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${campaignName}_delivery_report.csv"`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
