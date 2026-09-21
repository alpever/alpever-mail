/**
 * Campaign Studio & Live Execution Controller
 */

let activeCampaignProgressInterval = null;
let currentCreatedCampaignId = null;

async function loadCampaignsView() {
  await loadCampaignsList();
  await populateWizardDropdowns();
}

async function loadCampaignsList() {
  const container = document.getElementById('campaigns-table-tbody');
  if (!container) return;

  try {
    const campaigns = await api.get('/campaigns');
    if (!campaigns.length) {
      container.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--text-dim); padding: 40px;">
            No campaigns launched yet. Click <strong>"Create New Campaign"</strong> to get started!
          </td>
        </tr>
      `;
      return;
    }

    container.innerHTML = campaigns.map(c => {
      const badgeClass = {
        draft: 'badge-secondary',
        queued: 'badge-warning',
        processing: 'badge-info',
        completed: 'badge-success',
        paused: 'badge-warning',
        failed: 'badge-danger'
      }[c.status] || 'badge-secondary';

      return `
        <tr>
          <td>
            <strong>${escapeHtml(c.name)}</strong>
            <div style="font-size: 11px; color: var(--text-dim); margin-top: 2px;">
              From: ${escapeHtml(c.from_name)} &lt;${escapeHtml(c.from_email)}&gt;
            </div>
          </td>
          <td>${escapeHtml(c.list_name || 'Audience')}</td>
          <td>${escapeHtml(c.template_name || 'Template')}</td>
          <td>${Number(c.total_count || 0).toLocaleString()}</td>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <div class="progress-bar-wrap" style="width: 100px; height: 8px;">
                <div class="progress-bar-fill ${c.status === 'processing' ? 'animated' : ''}" style="width: ${c.percentage || 0}%;"></div>
              </div>
              <span style="font-size: 11px; font-weight: 700;">${c.percentage || 0}%</span>
            </div>
            <div style="font-size: 11px; color: var(--text-dim); margin-top: 4px;">
              <span style="color: var(--color-success);">${c.sent_count || 0} sent</span> / 
              <span style="color: var(--color-danger);">${c.failed_count || 0} failed</span>
            </div>
          </td>
          <td><span class="badge ${badgeClass}">${c.status}</span></td>
          <td>
            <div style="display: flex; gap: 6px;">
              ${c.status === 'processing' ? `
                <button class="btn btn-primary btn-sm" onclick="monitorActiveCampaign(${c.id}, '${escapeHtml(c.name)}')">
                  Live Monitor
                </button>
              ` : `
                <button class="btn btn-secondary btn-sm" onclick="viewCampaignDetails(${c.id})">
                  View Logs
                </button>
              `}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<tr><td colspan="7" style="color: var(--color-danger); padding: 20px;">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function populateWizardDropdowns() {
  const listSelect = document.getElementById('wizard-list-select');
  const tplSelect = document.getElementById('wizard-template-select');
  if (!listSelect || !tplSelect) return;

  try {
    const [lists, templates, settings] = await Promise.all([
      api.get('/contacts/lists'),
      api.get('/templates'),
      api.get('/settings')
    ]);

    // Populate Lists
    listSelect.innerHTML = lists.length
      ? lists.map(l => `<option value="${l.id}">${escapeHtml(l.name)} (${l.total_contacts} contacts)</option>`).join('')
      : '<option value="">No lists available - upload contacts first</option>';

    // Populate Templates
    tplSelect.innerHTML = templates.length
      ? templates.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')
      : '<option value="">No templates available - create one first</option>';

    // Default Sender values from settings
    if (settings.fromName) document.getElementById('wizard-from-name').value = settings.fromName;
    if (settings.fromEmail) document.getElementById('wizard-from-email').value = settings.fromEmail;
    if (settings.replyTo) document.getElementById('wizard-reply-to').value = settings.replyTo;
  } catch (err) {
    console.error('Wizard dropdown load error:', err);
  }
}

function openCreateCampaignModal() {
  populateWizardDropdowns();
  setWizardStep(1);
  openModal('modal-campaign-wizard');
}

function setWizardStep(step) {
  for (let i = 1; i <= 3; i++) {
    const stepPane = document.getElementById(`wizard-step-pane-${i}`);
    const stepIndicator = document.getElementById(`wizard-step-indicator-${i}`);
    if (stepPane) stepPane.style.display = i === step ? 'block' : 'none';
    if (stepIndicator) {
      if (i === step) {
        stepIndicator.className = 'wizard-step active';
      } else if (i < step) {
        stepIndicator.className = 'wizard-step completed';
      } else {
        stepIndicator.className = 'wizard-step';
      }
    }
  }

  if (step === 3) {
    updateWizardConfirmationPreview();
  }
}

function updateWizardConfirmationPreview() {
  const name = document.getElementById('wizard-campaign-name').value || 'Untitled Campaign';
  const listSelect = document.getElementById('wizard-list-select');
  const tplSelect = document.getElementById('wizard-template-select');
  const fromName = document.getElementById('wizard-from-name').value || 'Sender';
  const fromEmail = document.getElementById('wizard-from-email').value || 'sender@example.com';

  document.getElementById('confirm-camp-name').textContent = name;
  document.getElementById('confirm-camp-list').textContent = listSelect.options[listSelect.selectedIndex]?.text || 'N/A';
  document.getElementById('confirm-camp-template').textContent = tplSelect.options[tplSelect.selectedIndex]?.text || 'N/A';
  document.getElementById('confirm-camp-sender').textContent = `${fromName} <${fromEmail}>`;
}

async function sendTestEmailFromWizard() {
  const testEmail = document.getElementById('wizard-test-email').value.trim();
  const tplSelect = document.getElementById('wizard-template-select');
  const templateId = tplSelect ? tplSelect.value : null;
  const listSelect = document.getElementById('wizard-list-select');
  const listId = listSelect ? listSelect.value : null;

  if (!testEmail) {
    showToast('Please enter an email address to send test email to.', 'warning');
    return;
  }

  if (!templateId) {
    showToast('Please select a template first.', 'warning');
    return;
  }

  const btn = document.getElementById('btn-send-test-email');
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    const fromName = document.getElementById('wizard-from-name').value.trim();
    const fromEmail = document.getElementById('wizard-from-email').value.trim();
    const replyTo = document.getElementById('wizard-reply-to').value.trim();

    const result = await api.post('/campaigns/test-send-direct', {
      templateId,
      listId,
      testEmail,
      fromName,
      fromEmail,
      replyTo
    });

    showToast(result.message || `Dispatched test email to ${testEmail}!`, 'success');
  } catch (err) {
    showToast(`Test send failed: ${err.message}`, 'error', 6000);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send Test Email';
  }
}

async function confirmAndLaunchCampaign() {
  const name = document.getElementById('wizard-campaign-name').value.trim();
  const list_id = document.getElementById('wizard-list-select').value;
  const template_id = document.getElementById('wizard-template-select').value;
  const from_name = document.getElementById('wizard-from-name').value.trim();
  const from_email = document.getElementById('wizard-from-email').value.trim();
  const reply_to = document.getElementById('wizard-reply-to').value.trim();

  if (!name || !list_id || !template_id) {
    showToast('Please fill out all required campaign details.', 'warning');
    return;
  }

  const launchBtn = document.getElementById('btn-confirm-launch');
  launchBtn.disabled = true;
  launchBtn.textContent = 'Launching...';

  try {
    // 1. Create campaign in DB
    const camp = await api.post('/campaigns', {
      name,
      list_id,
      template_id,
      from_name,
      from_email,
      reply_to
    });

    closeModal('modal-campaign-wizard');
    showToast(`Campaign "${name}" initialized with ${camp.totalRecipients} recipients!`, 'success');

    // 2. Trigger Queue Launch
    await api.post(`/campaigns/${camp.campaignId}/launch`);
    showToast('Mass email delivery engine started!', 'info');

    // 3. Open Live Monitor Modal
    monitorActiveCampaign(camp.campaignId, name);

    // Refresh campaigns list & dashboard
    loadCampaignsList();
    if (window.loadDashboardView) window.loadDashboardView();
  } catch (err) {
    showToast(`Launch failed: ${err.message}`, 'error', 6000);
  } finally {
    launchBtn.disabled = false;
    launchBtn.textContent = '🚀 Launch Mass Campaign Now';
  }
}

function monitorActiveCampaign(campaignId, campaignName = 'Campaign') {
  currentCreatedCampaignId = campaignId;
  document.getElementById('monitor-modal-title').textContent = `Live Monitor: ${campaignName}`;
  openModal('modal-campaign-monitor');

  // Start polling every 1.2 seconds
  if (activeCampaignProgressInterval) clearInterval(activeCampaignProgressInterval);

  pollProgress();
  activeCampaignProgressInterval = setInterval(pollProgress, 1200);

  async function pollProgress() {
    try {
      const data = await api.get(`/campaigns/${campaignId}/progress`);
      const total = data.total || 0;
      const sent = data.sent || 0;
      const failed = data.failed || 0;
      const pct = data.percentage || 0;

      document.getElementById('monitor-progress-bar').style.width = `${pct}%`;
      document.getElementById('monitor-pct-text').textContent = `${pct}%`;
      document.getElementById('monitor-sent-count').textContent = Number(sent).toLocaleString();
      document.getElementById('monitor-failed-count').textContent = Number(failed).toLocaleString();
      document.getElementById('monitor-total-count').textContent = Number(total).toLocaleString();

      const etaElem = document.getElementById('monitor-eta');
      if (data.etaSeconds !== null && data.etaSeconds > 0) {
        etaElem.textContent = `Estimated remaining: ~${data.etaSeconds}s`;
      } else if (data.status === 'completed') {
        etaElem.textContent = 'All emails processed!';
      } else {
        etaElem.textContent = 'Calculating speed...';
      }

      const statusBadge = document.getElementById('monitor-status-badge');
      statusBadge.textContent = data.status.toUpperCase();
      statusBadge.className = `badge ${data.status === 'completed' ? 'badge-success' : 'badge-info'}`;

      if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
        clearInterval(activeCampaignProgressInterval);
        loadCampaignsList();
        if (window.loadDashboardView) window.loadDashboardView();
      }
    } catch (e) {
      console.error('Progress poll error:', e);
    }
  }
}

async function pauseActiveCampaign() {
  if (!currentCreatedCampaignId) return;
  try {
    await api.post(`/campaigns/${currentCreatedCampaignId}/pause`);
    showToast('Campaign paused', 'info');
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function resumeActiveCampaign() {
  if (!currentCreatedCampaignId) return;
  try {
    await api.post(`/campaigns/${currentCreatedCampaignId}/resume`);
    showToast('Campaign resumed', 'success');
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function cancelActiveCampaign() {
  if (!currentCreatedCampaignId) return;
  if (!confirm('Are you sure you want to stop this campaign? Any unsent emails will not be sent.')) return;
  try {
    await api.post(`/campaigns/${currentCreatedCampaignId}/cancel`);
    showToast('Campaign cancelled', 'warning');
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

window.loadCampaignsView = loadCampaignsView;
window.openCreateCampaignModal = openCreateCampaignModal;
window.setWizardStep = setWizardStep;
window.sendTestEmailFromWizard = sendTestEmailFromWizard;
window.confirmAndLaunchCampaign = confirmAndLaunchCampaign;
window.monitorActiveCampaign = monitorActiveCampaign;
window.pauseActiveCampaign = pauseActiveCampaign;
window.resumeActiveCampaign = resumeActiveCampaign;
window.cancelActiveCampaign = cancelActiveCampaign;
