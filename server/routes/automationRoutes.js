const express = require('express');
const router = express.Router();
const { getPool } = require('../db/pool');
const { getStoredSetting } = require('./settingsRoutes');
const { runAutomationBatch, getCurrentTimeString } = require('../services/automationService');

// GET /api/automations - List automations with pagination & filters
router.get('/', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  const hasPagination = req.query.page !== undefined || req.query.limit !== undefined;
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.max(1, parseInt(req.query.limit || '10', 10));
  const offset = (page - 1) * limit;
  const search = (req.query.search || '').trim();
  const statusFilter = (req.query.status || '').trim();

  try {
    let countQuery = 'SELECT COUNT(*) as total FROM automations a';
    let dataQuery = `
      SELECT a.*, 
        t.name as template_name,
        l.name as list_name,
        (SELECT COUNT(*) FROM automation_logs al WHERE al.automation_id = a.id AND al.status = 'pending') as pending_count
      FROM automations a
      LEFT JOIN templates t ON a.template_id = t.id
      LEFT JOIN contact_lists l ON a.list_id = l.id
    `;

    const conditions = [];
    const params = [];
    const countParams = [];

    if (search) {
      conditions.push('(a.name LIKE ? OR a.from_name LIKE ? OR a.from_email LIKE ?)');
      const sp = `%${search}%`;
      countParams.push(sp, sp, sp);
      params.push(sp, sp, sp);
    }

    if (statusFilter && statusFilter !== 'all') {
      conditions.push('a.status = ?');
      countParams.push(statusFilter);
      params.push(statusFilter);
    }

    if (conditions.length) {
      const whereClause = ' WHERE ' + conditions.join(' AND ');
      countQuery += whereClause;
      dataQuery += whereClause;
    }

    let total = 0;
    if (hasPagination) {
      const [countResult] = await pool.query(countQuery, countParams);
      total = countResult[0].total;

      dataQuery += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
    } else {
      dataQuery += ' ORDER BY a.created_at DESC';
    }

    const [rows] = await pool.query(dataQuery, params);

    const enriched = rows.map(a => {
      const sent = Number(a.sent_count || 0);
      const failed = Number(a.failed_count || 0);
      const opened = Number(a.opened_count || 0);
      const openRate = sent > 0 ? Math.round((opened / sent) * 100) : 0;
      const percentage = a.total_count > 0 ? Math.round(((sent + failed) / a.total_count) * 100) : 0;

      return {
        ...a,
        sent_count: sent,
        failed_count: failed,
        opened_count: opened,
        openRate,
        percentage
      };
    });

    if (hasPagination) {
      res.json({
        automations: enriched,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        currentTime: getCurrentTimeString()
      });
    } else {
      res.json(enriched);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/automations/:id - Single automation details
router.get('/:id', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    const [rows] = await pool.query(`
      SELECT a.*, 
        t.name as template_name,
        l.name as list_name,
        (SELECT COUNT(*) FROM automation_logs al WHERE al.automation_id = a.id AND al.status = 'pending') as pending_count
      FROM automations a
      LEFT JOIN templates t ON a.template_id = t.id
      LEFT JOIN contact_lists l ON a.list_id = l.id
      WHERE a.id = ?
    `, [req.params.id]);

    if (!rows.length) return res.status(404).json({ error: 'Automation not found' });
    const a = rows[0];
    const sent = Number(a.sent_count || 0);
    const failed = Number(a.failed_count || 0);
    const opened = Number(a.opened_count || 0);
    const openRate = sent > 0 ? Math.round((opened / sent) * 100) : 0;
    const percentage = a.total_count > 0 ? Math.round(((sent + failed) / a.total_count) * 100) : 0;

    res.json({
      ...a,
      sent_count: sent,
      failed_count: failed,
      opened_count: opened,
      openRate,
      percentage,
      currentTime: getCurrentTimeString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function normalizeTime(t) {
  if (!t) return '10:00';
  const parts = String(t).trim().split(':');
  if (parts.length >= 2) {
    const hh = String(parseInt(parts[0], 10) || 0).padStart(2, '0');
    const mm = String(parseInt(parts[1], 10) || 0).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  return '10:00';
}

// POST /api/automations - Create new automation & populate recipient queue
router.post('/', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    const { name, template_id, list_id, from_name, from_email, reply_to, daily_limit, send_time } = req.body;

    if (!name || !template_id || !list_id) {
      return res.status(400).json({ error: 'Name, Template, and Audience List are required.' });
    }

    const senderName = from_name || (await getStoredSetting('DEFAULT_FROM_NAME', 'Alpever AI'));
    const senderEmail = from_email || (await getStoredSetting('DEFAULT_FROM_EMAIL', 'onboarding@resend.dev'));
    const limit = Math.max(1, parseInt(daily_limit || '10', 10));
    const time = normalizeTime(send_time);

    // Fetch active contacts from list
    const [contacts] = await pool.query(
      'SELECT id, email, name FROM contacts WHERE list_id = ? AND status = "active" ORDER BY id ASC',
      [list_id]
    );

    if (!contacts.length) {
      return res.status(400).json({ error: 'Selected contact list has no active contacts.' });
    }

    // Insert Automation
    const [aResult] = await pool.query(
      `INSERT INTO automations 
       (name, template_id, list_id, from_name, from_email, reply_to, daily_limit, send_time, status, total_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [name, template_id, list_id, senderName, senderEmail, reply_to || null, limit, time, contacts.length]
    );

    const automationId = aResult.insertId;

    // Bulk insert initial pending logs in chunks of 500
    const CHUNK_SIZE = 500;
    for (let i = 0; i < contacts.length; i += CHUNK_SIZE) {
      const chunk = contacts.slice(i, i + CHUNK_SIZE);
      const values = chunk.map(c => [
        automationId,
        c.id,
        c.email,
        c.name || null,
        'pending'
      ]);

      await pool.query(
        'INSERT INTO automation_logs (automation_id, contact_id, email, recipient_name, status) VALUES ?',
        [values]
      );
    }

    res.json({
      success: true,
      automationId,
      message: `Automation "${name}" created! Scheduled to send ${limit} emails daily at ${time}.`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/automations/:id - Edit automation settings (Time, Quantity, Sender info)
router.put('/:id', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    const { name, daily_limit, send_time, from_name, from_email, reply_to } = req.body;
    const updates = [];
    const params = [];

    if (name) { updates.push('name = ?'); params.push(name.trim()); }
    if (daily_limit !== undefined) { updates.push('daily_limit = ?'); params.push(Math.max(1, parseInt(daily_limit, 10))); }
    if (send_time) { updates.push('send_time = ?'); params.push(normalizeTime(send_time)); }
    if (from_name) { updates.push('from_name = ?'); params.push(from_name.trim()); }
    if (from_email) { updates.push('from_email = ?'); params.push(from_email.trim()); }
    if (reply_to !== undefined) { updates.push('reply_to = ?'); params.push(reply_to ? reply_to.trim() : null); }

    if (!updates.length) {
      return res.status(400).json({ error: 'No fields provided to update.' });
    }

    params.push(req.params.id);
    await pool.query(`UPDATE automations SET ${updates.join(', ')} WHERE id = ?`, params);

    res.json({ success: true, message: 'Automation settings updated successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/automations/:id/pause
router.post('/:id/pause', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    await pool.query('UPDATE automations SET status = "paused" WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Automation paused' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/automations/:id/resume
router.post('/:id/resume', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    await pool.query('UPDATE automations SET status = "active" WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Automation resumed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/automations/:id/trigger-now - Manually dispatch today's batch right now
router.post('/:id/trigger-now', async (req, res) => {
  try {
    const result = await runAutomationBatch(req.params.id, { isManual: true });
    if (!result.success && result.error) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/automations/:id/logs - Recipient delivery logs with pagination
router.get('/:id/logs', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  const automationId = req.params.id;
  const statusFilter = req.query.status;
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.max(1, parseInt(req.query.limit || '50', 10));
  const offset = (page - 1) * limit;

  try {
    let countQuery = 'SELECT COUNT(*) as total FROM automation_logs WHERE automation_id = ?';
    let dataQuery = 'SELECT * FROM automation_logs WHERE automation_id = ?';
    const params = [automationId];

    if (statusFilter === 'opened') {
      countQuery += ' AND opened_at IS NOT NULL';
      dataQuery += ' AND opened_at IS NOT NULL';
    } else if (statusFilter && ['sent', 'failed', 'pending'].includes(statusFilter)) {
      countQuery += ' AND status = ?';
      dataQuery += ' AND status = ?';
      params.push(statusFilter);
    }

    const [totalRows] = await pool.query(countQuery, params);
    const total = totalRows[0].total;

    dataQuery += ' ORDER BY id ASC LIMIT ? OFFSET ?';
    const [logs] = await pool.query(dataQuery, [...params, limit, offset]);

    res.json({
      automationId,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      logs
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/automations/:id
router.delete('/:id', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    await pool.query('DELETE FROM automations WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Automation and its logs removed.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
