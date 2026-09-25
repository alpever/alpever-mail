const express = require('express');
const router = express.Router();
const {
  TRANSPARENT_1X1_GIF,
  parseTrackingToken,
  recordOpenEvent
} = require('../services/trackService');

/**
 * GET /api/track/open/:token? - Open Tracking Pixel Endpoint
 * Serves a 1x1 transparent GIF and records email read/open event in MySQL
 */
router.get('/open/:token?', async (req, res) => {
  // Always respond with no-cache headers so repeat opens can be accurately counted
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Content-Length', TRANSPARENT_1X1_GIF.length);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.end(TRANSPARENT_1X1_GIF);

  // Parse token from URL param or query string
  const token = req.params.token || req.query.t || '';
  let logId = null;
  let campaignId = null;

  if (token) {
    const parsed = parseTrackingToken(token);
    logId = parsed.logId;
    campaignId = parsed.campaignId;
  } else if (req.query.l) {
    logId = parseInt(req.query.l, 10);
    campaignId = parseInt(req.query.c || '0', 10);
  }

  if (logId) {
    const userAgent = req.headers['user-agent'] || '';
    const ipAddress = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();

    // Asynchronously record open event in database
    recordOpenEvent(logId, campaignId, { userAgent, ipAddress }).catch(err => {
      console.warn('Failed to record open event:', err.message);
    });
  }
});

module.exports = router;
