const { getPool } = require('../db/pool');
const { renderEmail } = require('./templateEngine');
const { sendBatchEmails, sendSingleEmail } = require('./resendService');

// Active campaigns in-memory state for live monitoring
const activeCampaigns = new Map();

/**
 * Sleep helper
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Get active campaign runtime progress
 */
function getCampaignProgress(campaignId) {
  const active = activeCampaigns.get(Number(campaignId));
  if (active) {
    return {
      id: campaignId,
      status: active.status,
      total: active.total,
      sent: active.sent,
      failed: active.failed,
      currentBatch: active.currentBatch,
      totalBatches: active.totalBatches,
      percentage: active.total > 0 ? Math.round(((active.sent + active.failed) / active.total) * 100) : 0,
      startedAt: active.startedAt,
      etaSeconds: calculateETA(active),
      lastError: active.lastError
    };
  }
  return null;
}

function calculateETA(active) {
  if (!active.startedAt || (active.sent + active.failed) === 0) return null;
  const elapsed = (Date.now() - active.startedAt) / 1000;
  const processed = active.sent + active.failed;
  const remaining = active.total - processed;
  if (remaining <= 0) return 0;
  const rate = processed / elapsed; // per second
  return Math.round(remaining / (rate || 1));
}

/**
 * Pause an active campaign
 */
function pauseCampaign(campaignId) {
  const active = activeCampaigns.get(Number(campaignId));
  if (active && active.status === 'processing') {
    active.status = 'paused';
    return true;
  }
  return false;
}

/**
 * Resume a paused campaign
 */
async function resumeCampaign(campaignId, apiKey) {
  const active = activeCampaigns.get(Number(campaignId));
  if (active && active.status === 'paused') {
    active.status = 'processing';
    return true;
  }
  return false;
}

/**
 * Cancel an active campaign
 */
function cancelCampaign(campaignId) {
  const active = activeCampaigns.get(Number(campaignId));
  if (active) {
    active.status = 'cancelled';
    return true;
  }
  return false;
}

/**
 * Start and execute a campaign
 */
async function executeCampaign(campaignId, apiKey) {
  const pool = getPool();
  if (!pool) throw new Error('Database connection pool is not available.');

  // 1. Fetch Campaign Details
  const [cRows] = await pool.query(
    `SELECT c.*, t.subject, t.body_html, t.body_text 
     FROM campaigns c 
     JOIN templates t ON c.template_id = t.id 
     WHERE c.id = ?`,
    [campaignId]
  );

  if (!cRows.length) throw new Error(`Campaign ID ${campaignId} not found`);
  const campaign = cRows[0];

  // 2. Fetch pending logs / contacts for this campaign
  const [logs] = await pool.query(
    `SELECT cl.*, c.name, c.company, c.custom_fields 
     FROM campaign_logs cl
     LEFT JOIN contacts c ON cl.contact_id = c.id
     WHERE cl.campaign_id = ? AND cl.status = 'pending'`,
    [campaignId]
  );

  if (!logs.length) {
    // Check if any sent or failed
    const [stats] = await pool.query(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
       FROM campaign_logs WHERE campaign_id = ?`,
      [campaignId]
    );
    const total = stats[0].total || 0;
    const sent = Number(stats[0].sent) || 0;
    const failed = Number(stats[0].failed) || 0;

    await pool.query(
      'UPDATE campaigns SET status = ?, sent_count = ?, failed_count = ?, finished_at = NOW() WHERE id = ?',
      ['completed', sent, failed, campaignId]
    );
    return;
  }

  // Batch configuration: 50 emails per batch (safe for Resend batch endpoint limit of 100)
  const BATCH_SIZE = 50;
  const DELAY_BETWEEN_BATCHES_MS = 600; // prevents 429 rate limit errors

  const state = {
    campaignId,
    status: 'processing',
    total: logs.length,
    sent: 0,
    failed: 0,
    startedAt: Date.now(),
    currentBatch: 0,
    totalBatches: Math.ceil(logs.length / BATCH_SIZE),
    lastError: null
  };

  activeCampaigns.set(Number(campaignId), state);

  await pool.query(
    'UPDATE campaigns SET status = "processing", started_at = NOW() WHERE id = ?',
    [campaignId]
  );

  // Background async loop
  (async () => {
    try {
      for (let i = 0; i < logs.length; i += BATCH_SIZE) {
        // Check if paused or cancelled
        if (state.status === 'paused') {
          while (state.status === 'paused') {
            await sleep(1000);
          }
        }
        if (state.status === 'cancelled') {
          await pool.query('UPDATE campaigns SET status = "cancelled" WHERE id = ?', [campaignId]);
          break;
        }

        state.currentBatch = Math.floor(i / BATCH_SIZE) + 1;
        const chunk = logs.slice(i, i + BATCH_SIZE);

        const emailBatch = [];
        const recipientMapping = [];

        for (const logItem of chunk) {
          const contactData = {
            email: logItem.email,
            name: logItem.recipient_name || logItem.name,
            company: logItem.company,
            custom_fields: logItem.custom_fields
          };

          const rendered = renderEmail(
            { subject: campaign.subject, body_html: campaign.body_html, body_text: campaign.body_text },
            contactData,
            { sender_name: campaign.from_name }
          );

          emailBatch.push({
            from: `${campaign.from_name} <${campaign.from_email}>`,
            to: logItem.email,
            subject: rendered.subject,
            html: rendered.html,
            ...(campaign.reply_to ? { reply_to: campaign.reply_to } : {})
          });

          recipientMapping.push(logItem);
        }

        // Send chunk via Resend
        try {
          const response = await sendBatchEmails(apiKey, emailBatch);
          const results = response.data || [];

          for (let j = 0; j < recipientMapping.length; j++) {
            const logItem = recipientMapping[j];
            const resItem = results[j];

            if (resItem && resItem.id) {
              await pool.query(
                'UPDATE campaign_logs SET status = "sent", resend_id = ?, sent_at = NOW() WHERE id = ?',
                [resItem.id, logItem.id]
              );
              state.sent++;
            } else {
              // Individual item failure or fallback
              await pool.query(
                'UPDATE campaign_logs SET status = "failed", error_message = ?, sent_at = NOW() WHERE id = ?',
                ['No ID returned by Resend batch dispatch', logItem.id]
              );
              state.failed++;
            }
          }
        } catch (batchErr) {
          console.warn(`[Batch ${state.currentBatch} Error]:`, batchErr.message);

          // If rate limit (429), wait and retry once
          if (batchErr.status === 429) {
            console.log('Rate limit hit (429), waiting 2.5 seconds before retrying chunk...');
            await sleep(2500);

            try {
              const retryResponse = await sendBatchEmails(apiKey, emailBatch);
              const retryResults = retryResponse.data || [];

              for (let j = 0; j < recipientMapping.length; j++) {
                const logItem = recipientMapping[j];
                const resItem = retryResults[j];

                if (resItem && resItem.id) {
                  await pool.query(
                    'UPDATE campaign_logs SET status = "sent", resend_id = ?, sent_at = NOW() WHERE id = ?',
                    [resItem.id, logItem.id]
                  );
                  state.sent++;
                } else {
                  await pool.query(
                    'UPDATE campaign_logs SET status = "failed", error_message = ?, sent_at = NOW() WHERE id = ?',
                    ['Retry failed: ' + batchErr.message, logItem.id]
                  );
                  state.failed++;
                }
              }
              continue;
            } catch (retryErr) {
              batchErr = retryErr;
            }
          }

          // Fallback to sequential send for this batch if batch API fails
          for (let k = 0; k < recipientMapping.length; k++) {
            const logItem = recipientMapping[k];
            const emailObj = emailBatch[k];
            try {
              const singleRes = await sendSingleEmail(apiKey, emailObj);
              await pool.query(
                'UPDATE campaign_logs SET status = "sent", resend_id = ?, sent_at = NOW() WHERE id = ?',
                [singleRes.id, logItem.id]
              );
              state.sent++;
              await sleep(400); // 400ms throttle between singles
            } catch (singleErr) {
              await pool.query(
                'UPDATE campaign_logs SET status = "failed", error_message = ?, sent_at = NOW() WHERE id = ?',
                [singleErr.message || 'Failed to dispatch', logItem.id]
              );
              state.failed++;
            }
          }
        }

        // Update campaign progress in database
        await pool.query(
          'UPDATE campaigns SET sent_count = ?, failed_count = ? WHERE id = ?',
          [state.sent, state.failed, campaignId]
        );

        // Throttle next batch
        if (i + BATCH_SIZE < logs.length) {
          await sleep(DELAY_BETWEEN_BATCHES_MS);
        }
      }

      state.status = 'completed';
      await pool.query(
        'UPDATE campaigns SET status = "completed", sent_count = ?, failed_count = ?, finished_at = NOW() WHERE id = ?',
        [state.sent, state.failed, campaignId]
      );
    } catch (criticalErr) {
      console.error('[Critical Campaign Queue Error]:', criticalErr);
      state.status = 'failed';
      state.lastError = criticalErr.message;
      await pool.query(
        'UPDATE campaigns SET status = "failed", finished_at = NOW() WHERE id = ?',
        [campaignId]
      );
    } finally {
      // Keep in cache for 5 minutes then remove
      setTimeout(() => {
        activeCampaigns.delete(Number(campaignId));
      }, 5 * 60 * 1000);
    }
  })();

  return { success: true, message: 'Campaign execution started in background' };
}

module.exports = {
  executeCampaign,
  getCampaignProgress,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign
};
