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

const path = require('path');
const fs = require('fs');

const cdnUrlCache = new Map();
const reverseCdnCache = new Map();

// Register known/cached CDN URLs for uploaded images
function registerImageUrlMapping(localPath, publicUrl) {
  if (localPath && publicUrl) {
    cdnUrlCache.set(localPath, publicUrl);
    reverseCdnCache.set(publicUrl, localPath);
  }
}

// Pre-register existing test banner
registerImageUrlMapping(
  '/uploads/images/WhatsApp_Image_2026-07-16_at_10_19_04_AM-1790164357775-457190661-1790164363378-644113515-1790164369786-121711946-1790164371585-553455974.jpg',
  'https://iili.io/nAo6aa9.jpg'
);

/**
 * Resolves local/relative image URLs for email clients:
 * - If APP_URL is configured (e.g. https://my-domain.com), prepends APP_URL to /uploads/ paths.
 * - Auto-repairs any legacy freeimage.host / iili.io links by pointing to local disk copies.
 * - Otherwise (or on localhost without public domain), embeds as Base64 data URLs.
 */
function resolveEmailImages(html = '') {
  if (!html) return '';

  const appUrl = (process.env.APP_URL || '').trim().replace(/\/$/, '');

  // 1. First, rescue any legacy freeimage.host or iili.io links
  html = html.replace(/src=["'](https?:\/\/(?:iili\.io|freeimage\.host)[^"']+)["']/gi, (match, fullUrl) => {
    // Check if we have registered local mapping
    const localRel = reverseCdnCache.get(fullUrl);
    if (localRel) {
      if (appUrl && !appUrl.includes('localhost') && !appUrl.includes('127.0.0.1')) {
        return `src="${appUrl}${localRel}"`;
      }
      return `src="${localRel}"`;
    }

    // Try finding the most recent uploaded image on disk as fallback
    try {
      const uploadsDir = path.join(__dirname, '../../uploads/images');
      if (fs.existsSync(uploadsDir)) {
        const files = fs.readdirSync(uploadsDir).filter(f => f.match(/\.(png|jpe?g|webp|gif)$/i));
        if (files.length > 0) {
          files.sort((a, b) => fs.statSync(path.join(uploadsDir, b)).mtimeMs - fs.statSync(path.join(uploadsDir, a)).mtimeMs);
          const fallbackRel = `/uploads/images/${files[0]}`;
          if (appUrl && !appUrl.includes('localhost') && !appUrl.includes('127.0.0.1')) {
            return `src="${appUrl}${fallbackRel}"`;
          }
          return `src="${fallbackRel}"`;
        }
      }
    } catch (e) {}

    return match;
  });

  // 2. Resolve /uploads/ relative URLs
  return html.replace(/src=["'](\/uploads\/[^"']+)["']/gi, (match, relPath) => {
    // A. If public domain APP_URL is set, use the full public URL
    if (appUrl && !appUrl.includes('localhost') && !appUrl.includes('127.0.0.1')) {
      return `src="${appUrl}${relPath}"`;
    }

    // B. Check if a public CDN URL is mapped (non-broken)
    if (cdnUrlCache.has(relPath)) {
      const cdnUrl = cdnUrlCache.get(relPath);
      if (!cdnUrl.includes('iili.io') && !cdnUrl.includes('freeimage.host')) {
        return `src="${cdnUrl}"`;
      }
    }

    // C. Otherwise, embed as Base64 data URL for clients that support it
    try {
      const cleanRel = relPath.replace(/^\//, '').replace(/\//g, path.sep);
      const fullPath = path.join(__dirname, '../../', cleanRel);
      if (fs.existsSync(fullPath)) {
        const ext = path.extname(fullPath).toLowerCase();
        let mime = 'image/png';
        if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
        else if (ext === '.gif') mime = 'image/gif';
        else if (ext === '.webp') mime = 'image/webp';
        else if (ext === '.svg') mime = 'image/svg+xml';

        const fileBuf = fs.readFileSync(fullPath);
        const b64 = fileBuf.toString('base64');
        return `src="data:${mime};base64,${b64}"`;
      }
    } catch (e) {
      console.warn('Could not read image file for base64 fallback:', e.message);
    }

    if (appUrl) {
      return `src="${appUrl}${relPath}"`;
    }

    return match;
  });
}

/**
 * Render complete email object (subject + html) for a given contact
 */
function renderEmail(template, contact, extraVars = {}) {
  const subject = interpolate(template.subject || '', contact, extraVars);
  let html = interpolate(template.body_html || '', contact, extraVars);
  const text = template.body_text ? interpolate(template.body_text, contact, extraVars) : undefined;

  // Ensure all image URLs are email-client safe
  html = resolveEmailImages(html);

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
  renderEmail,
  resolveEmailImages,
  registerImageUrlMapping
};
