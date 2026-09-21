/**
 * Resend API Service
 * Handles single email dispatch, batch dispatch (up to 100 emails per call),
 * and API key validation.
 */

const RESEND_BASE_URL = 'https://api.resend.com';

/**
 * Validate Resend API key by fetching registered domains or API key details
 */
async function verifyApiKey(apiKey) {
  if (!apiKey) {
    return { valid: false, message: 'API key is empty' };
  }

  try {
    const res = await fetch(`${RESEND_BASE_URL}/domains`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await res.json();

    if (res.ok) {
      return {
        valid: true,
        domains: data.data || [],
        message: 'Resend API key is valid!'
      };
    } else {
      return {
        valid: false,
        message: data.message || `Resend rejected API key (Status: ${res.status})`
      };
    }
  } catch (err) {
    return {
      valid: false,
      message: `Could not connect to Resend API: ${err.message}`
    };
  }
}

/**
 * Send a single email through Resend API
 */
async function sendSingleEmail(apiKey, { from, to, subject, html, text, reply_to }) {
  if (!apiKey) {
    throw new Error('Resend API key is missing. Please configure it in Settings or .env');
  }

  const payload = {
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html
  };

  if (text) payload.text = text;
  if (reply_to) payload.reply_to = reply_to;

  const res = await fetch(`${RESEND_BASE_URL}/emails`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();

  if (!res.ok) {
    const errorMsg = data.message || `Resend Error (${res.status}): ${JSON.stringify(data)}`;
    const error = new Error(errorMsg);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data; // { id: '...' }
}

/**
 * Send a batch of emails through Resend Batch API (/emails/batch)
 * Max 100 emails per batch call
 * @param {string} apiKey 
 * @param {Array<{ from, to, subject, html, text, reply_to }>} emails 
 */
async function sendBatchEmails(apiKey, emails = []) {
  if (!apiKey) {
    throw new Error('Resend API key is missing.');
  }

  if (!emails.length) return { data: [] };

  const formattedEmails = emails.map(e => ({
    from: e.from,
    to: Array.isArray(e.to) ? e.to : [e.to],
    subject: e.subject,
    html: e.html,
    ...(e.text ? { text: e.text } : {}),
    ...(e.reply_to ? { reply_to: e.reply_to } : {})
  }));

  const res = await fetch(`${RESEND_BASE_URL}/emails/batch`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(formattedEmails)
  });

  const data = await res.json();

  if (!res.ok) {
    const errorMsg = data.message || `Resend Batch Error (${res.status}): ${JSON.stringify(data)}`;
    const error = new Error(errorMsg);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data; // { data: [ { id: '...' }, ... ] }
}

module.exports = {
  verifyApiKey,
  sendSingleEmail,
  sendBatchEmails
};
