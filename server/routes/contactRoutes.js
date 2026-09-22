const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getPool } = require('../db/pool');
const { parseUploadedFile, parseRawFile, standardizeRows, autoMatchVariables } = require('../services/fileParser');

// Configure multer for file uploads
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max
});

// GET /api/contacts/lists - Get all lists
router.get('/lists', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    const [rows] = await pool.query(`
      SELECT l.*, 
        (SELECT COUNT(*) FROM contacts c WHERE c.list_id = l.id) as total_contacts
      FROM contact_lists l 
      ORDER BY l.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/contacts/parse-file - Parse file instantly for wizard preview without persisting
router.post('/parse-file', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = req.file.path;
  const originalName = req.file.originalname;

  try {
    const parsed = await parseRawFile(filePath, originalName);
    fs.unlink(filePath, () => {});

    if (!parsed.totalRows) {
      return res.status(400).json({
        error: 'The uploaded file appears to be empty. Please upload an Excel or CSV file with contact rows.'
      });
    }

    res.json({
      success: true,
      fileName: originalName,
      detectedHeaders: parsed.detectedHeaders,
      totalRows: parsed.totalRows,
      sampleRows: parsed.sampleRows,
      suggestedMapping: parsed.suggestedMapping
    });
  } catch (err) {
    fs.unlink(filePath, () => {});
    res.status(500).json({ error: err.message });
  }
});

// POST /api/contacts/auto-match - Auto-match Excel headers to template variables
router.post('/auto-match', (req, res) => {
  const { headers, templateVars } = req.body;
  if (!Array.isArray(headers) || !Array.isArray(templateVars)) {
    return res.status(400).json({ error: 'headers and templateVars arrays are required' });
  }
  const matched = autoMatchVariables(headers, templateVars);
  res.json({ success: true, mapping: matched });
});

// POST /api/contacts/upload - Upload file with optional custom mapping
router.post('/upload', upload.single('file'), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = req.file.path;
  const originalName = req.file.originalname;
  const listName = req.body.listName || path.basename(originalName, path.extname(originalName)) || 'Uploaded Audience';
  const description = req.body.description || `Uploaded from ${originalName} on ${new Date().toLocaleDateString()}`;

  let mapping = null;
  if (req.body.mapping) {
    try {
      mapping = typeof req.body.mapping === 'string' ? JSON.parse(req.body.mapping) : req.body.mapping;
    } catch (e) {
      mapping = null;
    }
  }

  try {
    const parsed = await parseUploadedFile(filePath, originalName, mapping);

    console.log(`[Upload Processed] File: ${originalName}, Detected Headers: [${parsed.detectedHeaders.join(', ')}], Contacts Found: ${parsed.contacts.length}, Invalid Rows: ${parsed.invalidRows.length}`);

    if (!parsed.contacts.length) {
      fs.unlink(filePath, () => {});
      const headerList = parsed.detectedHeaders.length ? `Headers detected: [${parsed.detectedHeaders.join(', ')}]. ` : '';
      return res.status(400).json({
        error: `No valid contacts found in file. ${headerList}Please ensure the mapped column contains valid email addresses.`,
        detectedHeaders: parsed.detectedHeaders,
        invalidRows: parsed.invalidRows.slice(0, 5)
      });
    }

    // 1. Create list
    const [listResult] = await pool.query(
      'INSERT INTO contact_lists (name, description, total_contacts) VALUES (?, ?, ?)',
      [listName, description, parsed.contacts.length]
    );
    const listId = listResult.insertId;

    // 2. Bulk insert contacts in chunks of 500
    const CHUNK_SIZE = 500;
    for (let i = 0; i < parsed.contacts.length; i += CHUNK_SIZE) {
      const chunk = parsed.contacts.slice(i, i + CHUNK_SIZE);
      const values = chunk.map(c => [
        listId,
        c.email,
        c.name || null,
        c.company || null,
        c.custom_fields && Object.keys(c.custom_fields).length ? JSON.stringify(c.custom_fields) : null,
        'active'
      ]);

      await pool.query(
        'INSERT INTO contacts (list_id, email, name, company, custom_fields, status) VALUES ?',
        [values]
      );
    }

    // Cleanup temp file
    fs.unlink(filePath, () => {});

    res.json({
      success: true,
      listId,
      listName,
      totalImported: parsed.contacts.length,
      invalidCount: parsed.invalidRows.length,
      detectedHeaders: parsed.detectedHeaders,
      mapping: parsed.mapping,
      sampleContacts: parsed.contacts.slice(0, 5)
    });
  } catch (err) {
    fs.unlink(filePath, () => {});
    res.status(500).json({ error: err.message });
  }
});

// POST /api/contacts/manual - Create list from manual JSON rows or pasted CSV
router.post('/manual', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    const { listName, description, contacts } = req.body;
    if (!contacts || !Array.isArray(contacts) || !contacts.length) {
      return res.status(400).json({ error: 'Contacts array is required' });
    }

    const standardized = standardizeRows(contacts);
    if (!standardized.contacts.length) {
      return res.status(400).json({ error: 'No valid email addresses found' });
    }

    const [listResult] = await pool.query(
      'INSERT INTO contact_lists (name, description, total_contacts) VALUES (?, ?, ?)',
      [listName || 'Manual List', description || 'Manually entered contacts', standardized.contacts.length]
    );
    const listId = listResult.insertId;

    const values = standardized.contacts.map(c => [
      listId,
      c.email,
      c.name || null,
      c.company || null,
      c.custom_fields && Object.keys(c.custom_fields).length ? JSON.stringify(c.custom_fields) : null,
      'active'
    ]);

    await pool.query(
      'INSERT INTO contacts (list_id, email, name, company, custom_fields, status) VALUES ?',
      [values]
    );

    res.json({
      success: true,
      listId,
      totalImported: standardized.contacts.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/contacts/list/:id - Get contacts in a list with search & pagination
router.get('/list/:id', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  const listId = req.params.id;
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '50', 10);
  const search = req.query.search ? `%${req.query.search.trim()}%` : null;
  const offset = (page - 1) * limit;

  try {
    const [listRows] = await pool.query('SELECT * FROM contact_lists WHERE id = ?', [listId]);
    if (!listRows.length) return res.status(404).json({ error: 'Contact list not found' });

    let countQuery = 'SELECT COUNT(*) as total FROM contacts WHERE list_id = ?';
    let dataQuery = 'SELECT * FROM contacts WHERE list_id = ?';
    const params = [listId];

    if (search) {
      countQuery += ' AND (email LIKE ? OR name LIKE ? OR company LIKE ?)';
      dataQuery += ' AND (email LIKE ? OR name LIKE ? OR company LIKE ?)';
      params.push(search, search, search);
    }

    const [totalRows] = await pool.query(countQuery, params);
    const total = totalRows[0].total;

    dataQuery += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    const queryParams = [...params, limit, offset];
    const [contacts] = await pool.query(dataQuery, queryParams);

    // Parse JSON custom_fields for clean response
    const formatted = contacts.map(c => ({
      ...c,
      custom_fields: typeof c.custom_fields === 'string' ? JSON.parse(c.custom_fields || '{}') : (c.custom_fields || {})
    }));

    res.json({
      list: listRows[0],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      contacts: formatted
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/contacts/list/:id/sample - Get sample contacts and detected headers for wizard mapping & preview
router.get('/list/:id/sample', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    const [listRows] = await pool.query('SELECT * FROM contact_lists WHERE id = ?', [req.params.id]);
    if (!listRows.length) return res.status(404).json({ error: 'Contact list not found' });

    const [contacts] = await pool.query('SELECT * FROM contacts WHERE list_id = ? ORDER BY id ASC LIMIT 10', [req.params.id]);

    const formatted = contacts.map(c => {
      let custom = c.custom_fields;
      if (typeof custom === 'string') {
        try { custom = JSON.parse(custom); } catch (e) { custom = {}; }
      }
      return {
        id: c.id,
        email: c.email,
        name: c.name || '',
        company: c.company || '',
        custom_fields: custom || {}
      };
    });

    const headerSet = new Set(['Email', 'Name', 'Company']);
    formatted.forEach(c => {
      Object.keys(c.custom_fields || {}).forEach(k => headerSet.add(k));
    });

    res.json({
      success: true,
      list: listRows[0],
      detectedHeaders: Array.from(headerSet),
      sampleContacts: formatted,
      totalRows: listRows[0].total_contacts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/contacts/list/:id - Delete list and all contacts
router.delete('/list/:id', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    await pool.query('DELETE FROM contact_lists WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Audience list deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/contacts/:id - Delete single contact
router.delete('/:id', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    await pool.query('DELETE FROM contacts WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Contact deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
