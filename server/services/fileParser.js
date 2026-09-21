const fs = require('fs');
const xlsx = require('xlsx');
const csv = require('csv-parser');

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

function cleanString(val) {
  if (val === undefined || val === null) return '';
  return String(val).replace(/^\ufeff/, '').trim();
}

/**
 * Identify primary column names for email, name, company
 */
function identifyColumns(headers = [], sampleRows = []) {
  const mapping = {
    email: null,
    name: null,
    company: null
  };

  const cleanedHeaders = headers.map(h => ({
    raw: h,
    clean: cleanString(h).toLowerCase().replace(/[\s_-]+/g, '')
  }));

  // 1. Find Email by header name
  for (const h of cleanedHeaders) {
    if (
      h.clean.includes('email') ||
      h.clean.includes('mail') ||
      h.clean === 'e' ||
      h.clean === 'user' ||
      h.clean === 'contact'
    ) {
      mapping.email = h.raw;
      break;
    }
  }

  // If email column header not found, inspect actual row values
  if (!mapping.email && sampleRows.length > 0) {
    for (const header of headers) {
      for (const row of sampleRows.slice(0, 10)) {
        const val = cleanString(row[header]);
        if (EMAIL_REGEX.test(val)) {
          mapping.email = header;
          break;
        }
      }
      if (mapping.email) break;
    }
  }

  // 2. Find Name
  for (const h of cleanedHeaders) {
    if (
      ['name', 'fullname', 'customername', 'clientname', 'contactname', 'firstname', 'fname', 'person', 'recipient'].includes(h.clean) ||
      h.clean.includes('name')
    ) {
      mapping.name = h.raw;
      break;
    }
  }

  // 3. Find Company
  for (const h of cleanedHeaders) {
    if (
      ['company', 'companyname', 'organization', 'org', 'business', 'employer', 'account', 'firm', 'agency'].includes(h.clean) ||
      h.clean.includes('company') ||
      h.clean.includes('org')
    ) {
      mapping.company = h.raw;
      break;
    }
  }

  return mapping;
}

/**
 * Parse raw rows array into standardized contacts
 */
function standardizeRows(rows = [], customMapping = null) {
  if (!rows.length) {
    return { contacts: [], invalidRows: [], detectedHeaders: [] };
  }

  // Clean row keys (strip BOM from keys)
  const cleanedRows = rows.map(r => {
    const cleanRow = {};
    for (const [k, v] of Object.entries(r)) {
      cleanRow[cleanString(k)] = v;
    }
    return cleanRow;
  });

  const detectedHeaders = Object.keys(cleanedRows[0] || {});
  const mapping = customMapping || identifyColumns(detectedHeaders, cleanedRows);

  const contacts = [];
  const invalidRows = [];
  const seenEmails = new Set();

  for (let i = 0; i < cleanedRows.length; i++) {
    const row = cleanedRows[i];
    let rawEmail = mapping.email ? cleanString(row[mapping.email]) : '';

    // If mapped column was empty, look for any field in this row with an email
    if (!rawEmail || !EMAIL_REGEX.test(rawEmail)) {
      for (const val of Object.values(row)) {
        const match = cleanString(val).match(EMAIL_REGEX);
        if (match) {
          rawEmail = match[0];
          break;
        }
      }
    }

    const emailMatch = rawEmail.match(EMAIL_REGEX);
    if (!emailMatch) {
      invalidRows.push({ rowNumber: i + 1, data: row, reason: 'Invalid or missing email address' });
      continue;
    }

    const email = emailMatch[0].toLowerCase();
    if (seenEmails.has(email)) {
      invalidRows.push({ rowNumber: i + 1, data: row, reason: 'Duplicate email in uploaded file' });
      continue;
    }
    seenEmails.add(email);

    const name = mapping.name ? cleanString(row[mapping.name]) : '';
    const company = mapping.company ? cleanString(row[mapping.company]) : '';

    // Collect all other attributes as custom_fields
    const customFields = {};
    for (const [key, val] of Object.entries(row)) {
      if (key !== mapping.email && key !== mapping.name && key !== mapping.company) {
        const cleanVal = cleanString(val);
        if (cleanVal !== '') {
          customFields[key.trim()] = cleanVal;
        }
      }
    }

    contacts.push({
      email,
      name: name || undefined,
      company: company || undefined,
      custom_fields: customFields
    });
  }

  return {
    contacts,
    invalidRows,
    detectedHeaders,
    mapping
  };
}

/**
 * Detect delimiter from first few lines of CSV
 */
function detectDelimiter(filePath) {
  try {
    const buffer = Buffer.alloc(2048);
    const fd = fs.openSync(filePath, 'r');
    const bytesRead = fs.readSync(fd, buffer, 0, 2048, 0);
    fs.closeSync(fd);
    const content = buffer.toString('utf8', 0, bytesRead);
    const firstLine = content.split(/\r?\n/)[0] || '';

    const commas = (firstLine.match(/,/g) || []).length;
    const semicolons = (firstLine.match(/;/g) || []).length;
    const tabs = (firstLine.match(/\t/g) || []).length;

    if (semicolons > commas && semicolons > tabs) return ';';
    if (tabs > commas && tabs > semicolons) return '\t';
    return ',';
  } catch (e) {
    return ',';
  }
}

/**
 * Parse file based on extension (CSV, XLSX, XLS, JSON)
 */
async function parseUploadedFile(filePath, originalFilename) {
  const ext = (originalFilename.split('.').pop() || '').toLowerCase();

  if (ext === 'csv' || ext === 'txt' || ext === 'tsv') {
    const separator = ext === 'tsv' ? '\t' : detectDelimiter(filePath);

    return new Promise((resolve, reject) => {
      const results = [];
      fs.createReadStream(filePath)
        .pipe(csv({
          separator,
          mapHeaders: ({ header }) => cleanString(header)
        }))
        .on('data', (data) => results.push(data))
        .on('end', () => {
          // If csv-parser got rows, standardize them
          if (results.length > 0) {
            resolve(standardizeRows(results));
          } else {
            // Fallback to xlsx library which natively parses any CSV/TSV
            try {
              const workbook = xlsx.readFile(filePath);
              const sheetName = workbook.SheetNames[0];
              const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
              resolve(standardizeRows(rows));
            } catch (xlsxErr) {
              resolve({ contacts: [], invalidRows: [], detectedHeaders: [] });
            }
          }
        })
        .on('error', () => {
          // Fallback to xlsx
          try {
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
            resolve(standardizeRows(rows));
          } catch (xlsxErr) {
            reject(xlsxErr);
          }
        });
    });
  } else if (['xlsx', 'xls'].includes(ext)) {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet);
    return standardizeRows(rows);
  } else if (ext === 'json') {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed : (parsed.contacts || parsed.data || []);
    return standardizeRows(rows);
  } else {
    // Try xlsx as universal fallback
    try {
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
      return standardizeRows(rows);
    } catch (e) {
      throw new Error(`Unsupported file type: .${ext}. Please upload .csv, .xlsx, .xls, or .json`);
    }
  }
}

module.exports = {
  parseUploadedFile,
  standardizeRows,
  identifyColumns
};
