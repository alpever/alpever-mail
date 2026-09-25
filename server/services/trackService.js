const { getPool } = require('../db/pool');

/**
 * Standard 43-byte base64 encoded 1x1 transparent GIF image
 */
const TRANSPARENT_1X1_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

/**
 * Generate a URL-safe base64 token representing a log entry and campaign
 */
function generateTrackingToken(logId, campaignId = 0) {
  const payload = `${logId}:${campaignId}`;
  return Buffer.from(payload, 'utf8').toString('base64url');
}

/**
 * Parse and decode tracking token safely
 */
function parseTrackingToken(token = '') {
  if (!token) return { logId: null, campaignId: null, isAutomation: false };
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const [logIdStr, campIdStr] = raw.split(':');
    const isAuto = logIdStr ? logIdStr.startsWith('auto_') : false;
    const cleanLogIdStr = isAuto ? logIdStr.replace('auto_', '') : logIdStr;
    const logId = parseInt(cleanLogIdStr, 10);
    const campaignId = parseInt(campIdStr, 10);
    return {
      logId: isNaN(logId) ? null : logId,
      campaignId: isNaN(campaignId) ? null : campaignId,
      isAutomation: isAuto
    };
  } catch (e) {
    return { logId: null, campaignId: null, isAutomation: false };
  }
}

/**
 * Generate an invisible 1x1 tracking pixel <img> tag for an email
 */
function generateTrackingPixel(logId, campaignId = 0) {
  const appUrl = (process.env.APP_URL || '').trim().replace(/\/$/, '') || 'https://mailer.alpever.com';
  const token = generateTrackingToken(logId, campaignId);
  const trackingUrl = `${appUrl}/api/track/open/${token}`;

  return `<img src="${trackingUrl}" width="1" height="1" style="display:none!important;width:1px!important;height:1px!important;max-height:0!important;max-width:0!important;opacity:0!important;overflow:hidden!important;mso-hide:all;" alt="" border="0" />`;
}

/**
 * Record an email open event in MySQL database (supports both campaigns and automations)
 */
async function recordOpenEvent(logId, campaignId, { userAgent = '', ipAddress = '', isAutomation = false } = {}) {
  if (!logId) return { success: false, reason: 'No logId' };

  const pool = getPool();
  if (!pool) return { success: false, reason: 'Database not connected' };

  try {
    const cleanUa = (userAgent || '').substring(0, 500);
    const cleanIp = (ipAddress || '').substring(0, 100);

    if (isAutomation) {
      // 1. Update automation recipient log
      await pool.query(
        `UPDATE automation_logs 
         SET open_count = open_count + 1,
             opened_at = COALESCE(opened_at, NOW()),
             user_agent = COALESCE(user_agent, ?),
             ip_address = COALESCE(ip_address, ?)
         WHERE id = ?`,
        [cleanUa, cleanIp, logId]
      );

      // Resolve automation_id if missing or 0
      let autoId = campaignId;
      if (!autoId) {
        const [aRows] = await pool.query('SELECT automation_id FROM automation_logs WHERE id = ?', [logId]);
        if (aRows.length) autoId = aRows[0].automation_id;
      }

      // 2. Update automation summary opened count
      if (autoId) {
        await pool.query(
          `UPDATE automations 
           SET opened_count = (SELECT COUNT(DISTINCT id) FROM automation_logs WHERE automation_id = ? AND opened_at IS NOT NULL)
           WHERE id = ?`,
          [autoId, autoId]
        );
      }
    } else {
      // 1. Update individual campaign recipient log
      await pool.query(
        `UPDATE campaign_logs 
         SET open_count = open_count + 1,
             opened_at = COALESCE(opened_at, NOW()),
             user_agent = COALESCE(user_agent, ?),
             ip_address = COALESCE(ip_address, ?)
         WHERE id = ?`,
        [cleanUa, cleanIp, logId]
      );

      // Resolve campaign_id if missing or 0
      let campId = campaignId;
      if (!campId) {
        const [cRows] = await pool.query('SELECT campaign_id FROM campaign_logs WHERE id = ?', [logId]);
        if (cRows.length) campId = cRows[0].campaign_id;
      }

      // 2. Update campaign opened_count summary
      if (campId) {
        await pool.query(
          `UPDATE campaigns 
           SET opened_count = (SELECT COUNT(DISTINCT id) FROM campaign_logs WHERE campaign_id = ? AND opened_at IS NOT NULL)
           WHERE id = ?`,
          [campId, campId]
        );
      }
    }

    return { success: true };
  } catch (err) {
    console.warn(`[Tracking Error] Failed to record open for logId ${logId}:`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  TRANSPARENT_1X1_GIF,
  generateTrackingToken,
  parseTrackingToken,
  generateTrackingPixel,
  recordOpenEvent
};
