/**
 * Dynamic Template Engine
 * Supports {{variable}}, {{ variable }}, and fallback syntax {{ variable | "default" }}
 */

/**
 * Extract all unique variables referenced in a subject and body template
 * @param {string} text 
 * @returns {string[]}
 */
function extractVariables(text = '') {
  if (!text) return [];
  const regex = /\{\{\s*([a-zA-Z0-9_-]+)(?:\s*\|\s*["']([^"']*)["'])?\s*\}\}/g;
  const vars = new Set();
  let match;
  while ((match = regex.exec(text)) !== null) {
    vars.add(match[1].toLowerCase());
  }
  return Array.from(vars);
}

/**
 * Interpolate a string with contact data
 * @param {string} template 
 * @param {Object} contact 
 * @param {Object} extraVars
 * @returns {string}
 */
function interpolate(template = '', contact = {}, extraVars = {}) {
  if (!template) return '';

  // Merge direct fields and custom fields
  const data = {};

  // Standard fields
  if (contact.email) data.email = contact.email;
  if (contact.name) data.name = contact.name;
  if (contact.company) data.company = contact.company;

  // Custom fields
  if (contact.custom_fields) {
    let custom = contact.custom_fields;
    if (typeof custom === 'string') {
      try {
        custom = JSON.parse(custom);
      } catch (e) {
        custom = {};
      }
    }
    for (const [k, v] of Object.entries(custom || {})) {
      data[k.toLowerCase().trim()] = v;
      // also alias normalized key without spaces or underscores
      data[k.toLowerCase().replace(/[\s_-]+/g, '')] = v;
    }
  }

  // Any extra vars (e.g. sender_name, app_name)
  for (const [k, v] of Object.entries(extraVars || {})) {
    data[k.toLowerCase().trim()] = v;
  }

  // Handle common aliases
  if (!data.name) {
    if (data.fullname) data.name = data.fullname;
    else if (data.firstname && data.lastname) data.name = `${data.firstname} ${data.lastname}`.trim();
    else if (data.firstname) data.name = data.firstname;
    else if (data.customername) data.name = data.customername;
  }

  // Match: {{ varName }} OR {{ varName | "default text" }} OR {{ varName | 'default text' }}
  const pattern = /\{\{\s*([a-zA-Z0-9_-]+)(?:\s*\|\s*["']([^"']*)["'])?\s*\}\}/g;

  return template.replace(pattern, (match, varName, defaultValue) => {
    const key = varName.toLowerCase().trim();
    const cleanKey = key.replace(/[\s_-]+/g, '');

    const value = data[key] ?? data[cleanKey];

    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value);
    }

    if (defaultValue !== undefined) {
      return defaultValue;
    }

    // If no value and no default provided, keep blank or fallback to capitalized variable name
    return '';
  });
}

/**
 * Render complete email object (subject + html) for a given contact
 */
function renderEmail(template, contact, extraVars = {}) {
  const subject = interpolate(template.subject || '', contact, extraVars);
  const html = interpolate(template.body_html || '', contact, extraVars);
  const text = template.body_text ? interpolate(template.body_text, contact, extraVars) : undefined;

  return {
    to: contact.email,
    subject,
    html,
    text
  };
}

module.exports = {
  extractVariables,
  interpolate,
  renderEmail
};
