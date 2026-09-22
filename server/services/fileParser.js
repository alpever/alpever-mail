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

  // Parse customMapping if passed as JSON string
  let mappingObj = customMapping;
  if (typeof customMapping === 'string') {
    try {
      mappingObj = JSON.parse(customMapping);
    } catch (e) {
      mappingObj = null;
    }
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
  const mapping = mappingObj || identifyColumns(detectedHeaders, cleanedRows);

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

    // Collect custom_fields
    const customFields = {};

    // 1. If explicit customFields mappings were provided (e.g. { role: 'Designation', place: 'City' })
    if (mapping.customFields && typeof mapping.customFields === 'object') {
      for (const [targetVar, sourceHeader] of Object.entries(mapping.customFields)) {
        if (sourceHeader && row[sourceHeader] !== undefined) {
          const cleanVal = cleanString(row[sourceHeader]);
          if (cleanVal !== '') {
            customFields[targetVar] = cleanVal;
          }
        }
      }
    }

    // 2. Also keep all remaining row columns in custom_fields so no data is lost
    for (const [key, val] of Object.entries(row)) {
      if (key !== mapping.email && key !== mapping.name && key !== mapping.company) {
        const cleanVal = cleanString(val);
        if (cleanVal !== '' && customFields[key.trim()] === undefined) {
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
 * Parse raw rows from file without standardizing or filtering out records
 */
async function parseRawFile(filePath, originalFilename) {
  const ext = (originalFilename.split('.').pop() || '').toLowerCase();
  let rows = [];

  if (ext === 'csv' || ext === 'txt' || ext === 'tsv') {
    const separator = ext === 'tsv' ? '\t' : detectDelimiter(filePath);
    rows = await new Promise((resolve, reject) => {
      const results = [];
      fs.createReadStream(filePath)
        .pipe(csv({
          separator,
          mapHeaders: ({ header }) => cleanString(header)
        }))
        .on('data', (data) => results.push(data))
        .on('end', () => {
          if (results.length > 0) return resolve(results);
          try {
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const parsed = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
            resolve(parsed);
          } catch (e) {
            resolve([]);
          }
        })
        .on('error', () => {
          try {
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const parsed = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
            resolve(parsed);
          } catch (e) {
            resolve([]);
          }
        });
    });
  } else if (['xlsx', 'xls'].includes(ext)) {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
  } else if (ext === 'json') {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    rows = Array.isArray(parsed) ? parsed : (parsed.contacts || parsed.data || []);
  } else {
    try {
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
    } catch (e) {
      throw new Error(`Unsupported file type: .${ext}. Please upload .csv, .xlsx, .xls, or .json`);
    }
  }

  // Clean row keys
  const cleanedRows = rows.map(r => {
    const cleanRow = {};
    for (const [k, v] of Object.entries(r)) {
      cleanRow[cleanString(k)] = cleanString(v);
    }
    return cleanRow;
  });

  const detectedHeaders = cleanedRows.length > 0 ? Object.keys(cleanedRows[0]) : [];
  const suggestedMapping = identifyColumns(detectedHeaders, cleanedRows);

  return {
    detectedHeaders,
    totalRows: cleanedRows.length,
    sampleRows: cleanedRows.slice(0, 10),
    rawRows: cleanedRows,
    suggestedMapping
  };
}

/**
 * Smart matching of Excel headers to template variables
 */
function autoMatchVariables(headers = [], templateVars = []) {
  const mapping = {};
  const lowerHeaders = headers.map(h => ({
    raw: h,
    lower: h.toLowerCase().trim(),
    clean: h.toLowerCase().replace(/[\s_-]+/g, '')
  }));

  const synonyms = {
    email: ['email', 'e-mail', 'mail', 'contact_email', 'work_email', 'email_address', 'primary_email'],
    name: ['name', 'fullname', 'full_name', 'customer_name', 'client_name', 'contact_name', 'first_name', 'firstname', 'fname', 'person', 'recipient'],
    company: ['company', 'company_name', 'organization', 'org', 'business', 'employer', 'firm', 'agency', 'enterprise'],
    place: ['place', 'city', 'location', 'state', 'town', 'address', 'country'],
    city: ['city', 'place', 'location', 'town', 'state'],
    role: ['role', 'designation', 'title', 'position', 'job_title', 'job', 'occupation'],
    phone: ['phone', 'mobile', 'tel', 'cell', 'whatsapp', 'number', 'phone_number', 'contact_number'],
    discount: ['discount', 'coupon', 'promo', 'offer', 'code', 'promo_code', 'voucher'],
    website: ['website', 'site', 'url', 'link', 'domain']
  };

  for (const v of templateVars) {
    const cleanVar = v.toLowerCase().trim();
    const noUnderscore = cleanVar.replace(/[\s_-]+/g, '');
    let matched = '';

    // 1. Direct exact or clean match
    for (const h of lowerHeaders) {
      if (h.lower === cleanVar || h.clean === noUnderscore) {
        matched = h.raw;
        break;
      }
    }

    // 2. Synonyms match
    if (!matched && synonyms[cleanVar]) {
      for (const syn of synonyms[cleanVar]) {
        for (const h of lowerHeaders) {
          if (h.lower === syn || h.clean === syn.replace(/[\s_-]+/g, '') || h.lower.includes(syn)) {
            matched = h.raw;
            break;
          }
        }
        if (matched) break;
      }
    }

    // 3. Substring match
    if (!matched) {
      for (const h of lowerHeaders) {
        if (h.clean.includes(noUnderscore) || noUnderscore.includes(h.clean)) {
          matched = h.raw;
          break;
        }
      }
    }

    mapping[v] = matched;
  }

  return mapping;
}

/**
 * Parse file based on extension (CSV, XLSX, XLS, JSON)
 */
async function parseUploadedFile(filePath, originalFilename, customMapping = null) {
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
          if (results.length > 0) {
            resolve(standardizeRows(results, customMapping));
          } else {
            try {
              const workbook = xlsx.readFile(filePath);
              const sheetName = workbook.SheetNames[0];
              const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
              resolve(standardizeRows(rows, customMapping));
            } catch (xlsxErr) {
              resolve({ contacts: [], invalidRows: [], detectedHeaders: [] });
            }
          }
        })
        .on('error', () => {
          try {
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
            resolve(standardizeRows(rows, customMapping));
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
    return standardizeRows(rows, customMapping);
  } else if (ext === 'json') {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed : (parsed.contacts || parsed.data || []);
    return standardizeRows(rows, customMapping);
  } else {
    try {
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
      return standardizeRows(rows, customMapping);
    } catch (e) {
      throw new Error(`Unsupported file type: .${ext}. Please upload .csv, .xlsx, .xls, or .json`);
    }
  }
}

module.exports = {
  parseUploadedFile,
  parseRawFile,
  standardizeRows,
  identifyColumns,
  autoMatchVariables
};
