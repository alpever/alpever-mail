const express = require('express');
const router = express.Router();
const { getPool } = require('../db/pool');
const { extractVariables, renderEmail, interpolate } = require('../services/templateEngine');

// GET /api/templates - List all templates
router.get('/', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    const [rows] = await pool.query('SELECT * FROM templates ORDER BY updated_at DESC');
    const formatted = rows.map(t => ({
      ...t,
      variables: typeof t.variables === 'string' ? JSON.parse(t.variables || '[]') : (t.variables || [])
    }));
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/templates/:id - Get single template
router.get('/:id', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    const [rows] = await pool.query('SELECT * FROM templates WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Template not found' });
    const template = rows[0];
    template.variables = typeof template.variables === 'string' ? JSON.parse(template.variables || '[]') : (template.variables || []);
    res.json(template);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/templates - Create template
router.post('/', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    const { name, subject, body_html, body_text } = req.body;
    if (!name || !subject || !body_html) {
      return res.status(400).json({ error: 'Template Name, Subject, and HTML Content are required.' });
    }

    const detectedVars = extractVariables(`${subject} ${body_html} ${body_text || ''}`);

    const [result] = await pool.query(
      'INSERT INTO templates (name, subject, body_html, body_text, variables) VALUES (?, ?, ?, ?, ?)',
      [name, subject, body_html, body_text || null, JSON.stringify(detectedVars)]
    );

    res.json({
      success: true,
      id: result.insertId,
      name,
      variables: detectedVars
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/templates/:id - Update template
router.put('/:id', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    const { name, subject, body_html, body_text } = req.body;
    if (!name || !subject || !body_html) {
      return res.status(400).json({ error: 'Template Name, Subject, and HTML Content are required.' });
    }

    const detectedVars = extractVariables(`${subject} ${body_html} ${body_text || ''}`);

    await pool.query(
      'UPDATE templates SET name = ?, subject = ?, body_html = ?, body_text = ?, variables = ? WHERE id = ?',
      [name, subject, body_html, body_text || null, JSON.stringify(detectedVars), req.params.id]
    );

    res.json({
      success: true,
      id: req.params.id,
      variables: detectedVars
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/templates/:id - Delete template
router.delete('/:id', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    await pool.query('DELETE FROM templates WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Template deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/templates/preview - Live preview rendering
router.post('/preview', async (req, res) => {
  try {
    const { subject, body_html, body_text, contact, extraVars } = req.body;

    const sampleContact = contact || {
      email: 'alex.smith@example.com',
      name: 'Alex Smith',
      company: 'Apex Solutions Inc',
      custom_fields: { role: 'Chief Marketing Officer', city: 'San Francisco', discount: '25%' }
    };

    const rendered = renderEmail(
      { subject: subject || '', body_html: body_html || '', body_text: body_text || '' },
      sampleContact,
      extraVars || { sender_name: 'Alpever Team' }
    );

    const detectedVars = extractVariables(`${subject || ''} ${body_html || ''}`);

    res.json({
      renderedSubject: rendered.subject,
      renderedHtml: rendered.html,
      detectedVariables: detectedVars,
      sampleUsed: sampleContact
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
