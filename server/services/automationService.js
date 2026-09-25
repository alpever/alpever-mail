const { getPool } = require('../db/pool');
const { getStoredSetting } = require('../routes/settingsRoutes');
const { renderEmail } = require('./templateEngine');
const { sendSingleEmail } = require('./resendService');
const { generateTrackingPixel } = require('./trackService');

let schedulerIntervalTimer = null;
let isSchedulerRunning = false;

/**
 * Run a daily batch for a given automation
 * Sends up to `daily_limit` pending recipients sequentially
 */
async function runAutomationBatch(automationId, { isManual = false } = {}) {
  const pool = getPool();
  if (!pool) return { success: false, error: 'Database not connected' };

  try {
    // 1. Fetch automation details with template and sender info
    const [autoRows] = await pool.query(`
      SELECT a.*, 
        t.subject as template_subject, t.body_html as template_html, t.body_text as template_text
      FROM automations a
      LEFT JOIN templates t ON a.template_id = t.id
      WHERE a.id = ?
    `, [automationId]);

    if (!autoRows.length) return { success: false, error: 'Automation not found' };
    const automation = autoRows[0];

    if (!isManual && automation.status !== 'active') {
      return { success: false, skipped: true, reason: `Automation is ${automation.status}` };
    }

    // 2. Fetch API key
    const apiKey = await getStoredSetting('RESEND_API_KEY');
    if (!apiKey) {
      console.warn(`[Automation ${automation.id}] Resend API key missing. Skipping run.`);
      return { success: false, error: 'Resend API key missing' };
    }

    // 3. Fetch up to `daily_limit` pending contacts in sequential order
    const limit = Math.max(1, parseInt(automation.daily_limit || 10, 10));
    const [pendingLogs] = await pool.query(`
      SELECT al.*, c.company, c.custom_fields
      FROM automation_logs al
      LEFT JOIN contacts c ON al.contact_id = c.id
      WHERE al.automation_id = ? AND al.status = 'pending'
      ORDER BY al.id ASC
      LIMIT ?
    `, [automationId, limit]);

    if (!pendingLogs.length) {
      // All contacts have been sent! Mark completed.
      await pool.query('UPDATE automations SET status = "completed" WHERE id = ?', [automationId]);
      return { success: true, completed: true, processed: 0, message: 'All contacts already sent. Automation marked as completed.' };
    }

    console.log(`[Automation ${automation.id}: "${automation.name}"] Dispatching daily batch of ${pendingLogs.length} emails...`);

    let sentSuccess = 0;
    let failedCount = 0;

    // 4. Send each email in sequence with rate limit protection
    for (const log of pendingLogs) {
      try {
        let customData = {};
        if (log.custom_fields) {
          try {
            customData = typeof log.custom_fields === 'string' ? JSON.parse(log.custom_fields) : log.custom_fields;
          } catch (e) {
            customData = {};
          }
        }

        const contactData = {
          ...customData,
          name: log.recipient_name || '',
          email: log.email || '',
          company: log.company || customData.company || ''
        };

        const rendered = renderEmail(
          {
            subject: automation.template_subject || automation.name,
            body_html: automation.template_html || '',
            body_text: automation.template_text || ''
          },
          contactData,
          { sender_name: automation.from_name }
        );

        // Inject open tracking pixel with automation prefix
        const trackingPixel = generateTrackingPixel(`auto_${log.id}`, automation.id);
        const finalHtml = rendered.html.includes('</body>')
          ? rendered.html.replace('</body>', `${trackingPixel}</body>`)
          : `${rendered.html}${trackingPixel}`;

        // Send via Resend
        const sendRes = await sendSingleEmail(apiKey, {
          from: `${automation.from_name} <${automation.from_email}>`,
          to: log.email,
          subject: rendered.subject,
          html: finalHtml,
          text: rendered.text,
          reply_to: automation.reply_to || undefined
        });

        // Mark log as sent
        await pool.query(
          `UPDATE automation_logs 
           SET status = 'sent', resend_id = ?, sent_at = NOW(), error_message = NULL 
           WHERE id = ?`,
          [sendRes.id || null, log.id]
        );
        sentSuccess++;
      } catch (err) {
        console.warn(`[Automation ${automation.id}] Email to ${log.email} failed:`, err.message);
        await pool.query(
          `UPDATE automation_logs 
           SET status = 'failed', error_message = ?, sent_at = NOW() 
           WHERE id = ?`,
          [err.message, log.id]
        );
        failedCount++;
      }

      // 150ms gentle pause to protect API rate limits
      await new Promise(r => setTimeout(r, 150));
    }

    // 5. Update automation run stats & check completion
    const todayStr = getTodayDateString();

    await pool.query(`
      UPDATE automations
      SET sent_count = (SELECT COUNT(*) FROM automation_logs WHERE automation_id = ? AND status = 'sent'),
          failed_count = (SELECT COUNT(*) FROM automation_logs WHERE automation_id = ? AND status = 'failed'),
          last_run_at = NOW(),
          last_run_date = ?,
          status = CASE 
            WHEN (SELECT COUNT(*) FROM automation_logs WHERE automation_id = ? AND status = 'pending') = 0 
            THEN 'completed' 
            ELSE status 
          END
      WHERE id = ?
    `, [automationId, automationId, todayStr, automationId, automationId]);

    console.log(`[Automation ${automation.id}] Batch finished: ${sentSuccess} sent, ${failedCount} failed.`);

    return {
      success: true,
      processed: pendingLogs.length,
      sentCount: sentSuccess,
      failedCount: failedCount
    };
  } catch (err) {
    console.error(`[Automation Error] Batch execution failed for ID ${automationId}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Returns today's date in YYYY-MM-DD format (local/IST)
 */
function getTodayDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns current local time in HH:MM format
 */
function getCurrentTimeString() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Background tick: checks if any active automations match the current time
 */
async function checkAndRunScheduledAutomations() {
  if (isSchedulerRunning) return;
  isSchedulerRunning = true;

  const pool = getPool();
  if (!pool) {
    isSchedulerRunning = false;
    return;
  }

  try {
    const currentHM = getCurrentTimeString();
    const todayStr = getTodayDateString();

    // Find active automations scheduled for this exact minute that haven't run today
    const [dueAutomations] = await pool.query(`
      SELECT id, name, send_time, daily_limit, last_run_date
      FROM automations
      WHERE status = 'active'
        AND send_time = ?
        AND (last_run_date IS NULL OR last_run_date != ?)
    `, [currentHM, todayStr]);

    if (dueAutomations.length) {
      console.log(`⏰ [Automation Scheduler] Found ${dueAutomations.length} automation(s) scheduled for ${currentHM}:`, dueAutomations.map(a => a.name));

      for (const auto of dueAutomations) {
        try {
          await runAutomationBatch(auto.id);
        } catch (e) {
          console.error(`Error executing scheduled automation ${auto.id}:`, e);
        }
      }
    }
  } catch (err) {
    console.error('[Automation Scheduler Error]:', err.message);
  } finally {
    isSchedulerRunning = false;
  }
}

/**
 * Start the background 30-second cron ticker
 */
function startAutomationScheduler() {
  if (schedulerIntervalTimer) return;
  console.log('⚡ [Automation Scheduler] Initialized background drip engine (30s interval check)');
  // Check immediately once, then every 30 seconds
  checkAndRunScheduledAutomations();
  schedulerIntervalTimer = setInterval(checkAndRunScheduledAutomations, 30000);
}

/**
 * Stop scheduler
 */
function stopAutomationScheduler() {
  if (schedulerIntervalTimer) {
    clearInterval(schedulerIntervalTimer);
    schedulerIntervalTimer = null;
  }
}

module.exports = {
  runAutomationBatch,
  checkAndRunScheduledAutomations,
  startAutomationScheduler,
  stopAutomationScheduler,
  getCurrentTimeString,
  getTodayDateString
};
