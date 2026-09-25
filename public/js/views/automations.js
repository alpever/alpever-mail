/**
 * Scheduled Drip Automations Controller
 */

let currentAutoPage = 1;
let currentAutoLimit = 6;
let currentAutoSearch = '';
let currentAutoStatus = 'all';
let autoSearchDebounceTimer = null;

let currentViewingAutoId = null;
let currentViewingAutoLogsPage = 1;
let currentViewingAutoLogsStatus = '';

async function loadAutomationsView() {
  await loadAutomationsList();
}

function handleAutomationSearch(val) {
  clearTimeout(autoSearchDebounceTimer);
  autoSearchDebounceTimer = setTimeout(() => {
    currentAutoSearch = (val || '').trim();
    currentAutoPage = 1;
    loadAutomationsList();
  }, 300);
}

function handleAutomationStatusFilter(status) {
  currentAutoStatus = status || 'all';
  currentAutoPage = 1;
  loadAutomationsList();
}

function handleAutomationLimitChange(limit) {
  currentAutoLimit = parseInt(limit, 10) || 6;
  currentAutoPage = 1;
  loadAutomationsList();
}

function goToAutomationsPage(page) {
  currentAutoPage = page;
  loadAutomationsList();
}

async function loadAutomationsList() {
  const container = document.getElementById('automations-grid');
  const paginationContainer = document.getElementById('automations-pagination');
  if (!container) return;

  container.innerHTML = `<div style="grid-column: 1 / -1; padding: 30px; text-align: center; color: var(--text-muted);">Loading automations...</div>`;

  try {
    let url = `/automations?page=${currentAutoPage}&limit=${currentAutoLimit}`;
    if (currentAutoSearch) url += `&search=${encodeURIComponent(currentAutoSearch)}`;
    if (currentAutoStatus && currentAutoStatus !== 'all') url += `&status=${encodeURIComponent(currentAutoStatus)}`;

    const res = await api.get(url);
    const automations = Array.isArray(res) ? res : (res.automations || []);
    const total = Array.isArray(res) ? automations.length : (res.total || 0);
    const totalPages = Array.isArray(res) ? 1 : (res.totalPages || 1);

    if (!automations.length) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-subtle);">
          <div style="width: 48px; height: 48px; margin: 0 auto 12px; display: flex; align-items: center; justify-content: center; border-radius: 12px; background: rgba(249, 115, 22, 0.1); color: var(--brand-orange);">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="18" cy="18" r="3"></circle>
              <circle cx="6" cy="6" r="3"></circle>
              <path d="M6 9v12"></path>
              <path d="M18 9a9 9 0 0 0-9 9"></path>
            </svg>
          </div>
          <h3 style="font-size: 16px; color: var(--text-main); margin-bottom: 6px;">
            ${currentAutoSearch || currentAutoStatus !== 'all' ? 'No Matching Automations' : 'No Scheduled Automations Yet'}
          </h3>
          <p style="font-size: 13px; color: var(--text-dim); max-width: 480px; margin: 0 auto 18px;">
            ${currentAutoSearch || currentAutoStatus !== 'all'
              ? 'Try adjusting your search query or filter selection.'
              : 'Create your first daily drip automation to dispatch custom batches (e.g. 10 or 20 emails) every day at your exact preferred time.'}
          </p>
          ${!currentAutoSearch && currentAutoStatus === 'all' ? `
            <button class="btn btn-primary btn-sm" onclick="openCreateAutomationModal()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Create First Automation
            </button>
          ` : ''}
        </div>
      `;
      if (paginationContainer) paginationContainer.innerHTML = '';
      return;
    }

    container.innerHTML = automations.map(a => {
      const isCompleted = a.status === 'completed';
      const isPaused = a.status === 'paused';
      const statusBadge = isCompleted
        ? '<span class="badge badge-success">Completed</span>'
        : (isPaused ? '<span class="badge badge-warning">Paused</span>' : '<span class="badge badge-info">Active Daily</span>');

      return `
        <div class="card" style="display: flex; flex-direction: column; justify-content: space-between; border-top: 3px solid ${isCompleted ? 'var(--color-success)' : (isPaused ? 'var(--color-warning)' : 'var(--brand-orange)')};">
          <div>
            <!-- Header Line -->
            <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 10px; gap: 8px;">
              <h3 style="font-size: 16px; font-weight: 700; color: var(--text-main); margin: 0; line-height: 1.3;">
                ${escapeHtml(a.name)}
              </h3>
              ${statusBadge}
            </div>

            <!-- Schedule Badge Pill -->
            <div style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 6px; background: #fff7ed; border: 1px solid #ffedd5; font-size: 12px; font-weight: 700; color: #c2410c; margin-bottom: 12px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <span>Daily at ${escapeHtml(a.send_time)} &bull; ${a.daily_limit} emails/day</span>
            </div>

            <!-- Context Info -->
            <div style="font-size: 12px; color: var(--text-muted); display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px;">
              <div><strong>Audience:</strong> ${escapeHtml(a.list_name || 'Audience List')} (${Number(a.total_count || 0).toLocaleString()} contacts)</div>
              <div><strong>Template:</strong> ${escapeHtml(a.template_name || 'Template')}</div>
              <div><strong>Sender:</strong> ${escapeHtml(a.from_name)} &lt;${escapeHtml(a.from_email)}&gt;</div>
            </div>

            <!-- Progress Bar -->
            <div style="margin-bottom: 14px;">
              <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 600; margin-bottom: 4px;">
                <span style="color: var(--text-main);">${Number(a.sent_count || 0).toLocaleString()} of ${Number(a.total_count || 0).toLocaleString()} sent</span>
                <span style="color: var(--brand-orange);">${a.percentage || 0}%</span>
              </div>
              <div class="progress-bar-wrap" style="height: 8px;">
                <div class="progress-bar-fill ${a.status === 'active' ? 'animated' : ''}" style="width: ${a.percentage || 0}%;"></div>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-dim); margin-top: 4px;">
                <span>${a.pending_count || 0} pending in queue</span>
                <span style="color: #10b981; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                  ${Number(a.opened_count || 0).toLocaleString()} opened (${a.openRate || 0}%)
                </span>
              </div>
            </div>

            <!-- Last Run Status -->
            <div style="font-size: 11px; color: var(--text-muted); background: #f8fafc; padding: 6px 10px; border-radius: 6px; margin-bottom: 16px; display: flex; align-items: center; gap: 6px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              <span><strong>Last Batch:</strong> ${a.last_run_date ? `Sent on ${a.last_run_date}` : 'Not dispatched yet'}</span>
            </div>
          </div>

          <!-- Bottom Action Buttons (Matching sleek line icons) -->
          <div style="display: flex; flex-wrap: wrap; gap: 6px; padding-top: 12px; border-top: 1px solid var(--border-subtle); justify-content: space-between; align-items: center;">
            <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
              ${!isCompleted ? `
                <button type="button" class="btn btn-secondary btn-sm" onclick="triggerAutomationNow(${a.id})" title="Dispatch today's batch right now">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="17" y1="10" x2="3" y2="10"></line>
                    <path d="m13 6 4 4-4 4"></path>
                    <line x1="7" y1="14" x2="21" y2="14"></line>
                    <path d="m11 18-4-4 4-4"></path>
                  </svg>
                  Send Batch Now
                </button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="toggleAutomationPause(${a.id}, '${a.status}')" title="${isPaused ? 'Resume automation' : 'Pause automation'}">
                  ${isPaused ? `
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                    Resume
                  ` : `
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="6" y="4" width="4" height="16" rx="1"></rect>
                      <rect x="14" y="4" width="4" height="16" rx="1"></rect>
                    </svg>
                    Pause
                  `}
                </button>
              ` : ''}
              <button type="button" class="btn btn-secondary btn-sm" onclick="openEditAutomationModal(${a.id})" title="Edit time & quantity">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                Edit
              </button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="viewAutomationLogs(${a.id})" title="View recipient delivery logs">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                </svg>
                Logs
              </button>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" style="color: #ef4444; border-color: #fee2e2; background: #fff5f5; padding: 6px 10px;" onclick="deleteAutomation(${a.id})" title="Delete automation">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Render modern pagination
    if (window.renderPaginationControls && paginationContainer) {
      window.renderPaginationControls({
        containerId: 'automations-pagination',
        currentPage: currentAutoPage,
        totalPages,
        totalItems: total,
        limit: currentAutoLimit,
        onPageChangeName: 'goToAutomationsPage',
        itemName: 'automations'
      });
    }
  } catch (err) {
    container.innerHTML = `<div style="color: var(--color-danger); padding: 20px;">Failed to load automations: ${escapeHtml(err.message)}</div>`;
  }
}

async function openCreateAutomationModal() {
  try {
    const [templates, lists, settings] = await Promise.all([
      api.get('/templates'),
      api.get('/contacts/lists'),
      api.get('/settings')
    ]);

    const tplSelect = document.getElementById('auto-create-template');
    const listSelect = document.getElementById('auto-create-list');
    const fromNameInput = document.getElementById('auto-create-from-name');
    const fromEmailInput = document.getElementById('auto-create-from-email');

    if (tplSelect) {
      tplSelect.innerHTML = templates.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('') || '<option value="">No templates found</option>';
    }

    if (listSelect) {
      const listsArr = Array.isArray(lists) ? lists : (lists.lists || []);
      listSelect.innerHTML = listsArr.map(l => `<option value="${l.id}">${escapeHtml(l.name)} (${Number(l.total_contacts || 0).toLocaleString()} contacts)</option>`).join('') || '<option value="">No audience lists found</option>';
    }

    if (fromNameInput) fromNameInput.value = settings.fromName || 'Alpever AI';
    if (fromEmailInput) fromEmailInput.value = settings.fromEmail || 'onboarding@resend.dev';

    openModal('modal-create-automation');
  } catch (err) {
    showToast(`Error initializing automation wizard: ${err.message}`, 'error');
  }
}

async function submitCreateAutomation() {
  const name = document.getElementById('auto-create-name')?.value?.trim();
  const template_id = document.getElementById('auto-create-template')?.value;
  const list_id = document.getElementById('auto-create-list')?.value;
  const from_name = document.getElementById('auto-create-from-name')?.value?.trim();
  const from_email = document.getElementById('auto-create-from-email')?.value?.trim();
  const daily_limit = parseInt(document.getElementById('auto-create-limit')?.value || '10', 10);
  const send_time = document.getElementById('auto-create-time')?.value || '10:00';

  if (!name) {
    showToast('Please enter an automation name', 'warning');
    return;
  }
  if (!template_id || !list_id) {
    showToast('Please select a template and audience list', 'warning');
    return;
  }

  const submitBtn = document.getElementById('btn-submit-create-auto');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating Queue...';
  }

  try {
    const res = await api.post('/automations', {
      name,
      template_id,
      list_id,
      from_name,
      from_email,
      daily_limit,
      send_time
    });

    showToast(res.message || 'Automation created successfully!', 'success');
    closeModal('modal-create-automation');
    document.getElementById('auto-create-name').value = '';
    loadAutomationsList();
  } catch (err) {
    showToast(`Failed to create automation: ${err.message}`, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Launch Automation →';
    }
  }
}

async function openEditAutomationModal(id) {
  try {
    const auto = await api.get(`/automations/${id}`);
    document.getElementById('auto-edit-id').value = auto.id;
    document.getElementById('auto-edit-name').value = auto.name || '';
    document.getElementById('auto-edit-limit').value = auto.daily_limit || 10;
    document.getElementById('auto-edit-time').value = auto.send_time || '10:00';
    document.getElementById('auto-edit-from-name').value = auto.from_name || '';

    openModal('modal-edit-automation');
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function submitEditAutomation() {
  const id = document.getElementById('auto-edit-id')?.value;
  const name = document.getElementById('auto-edit-name')?.value?.trim();
  const daily_limit = parseInt(document.getElementById('auto-edit-limit')?.value || '10', 10);
  const send_time = document.getElementById('auto-edit-time')?.value || '10:00';
  const from_name = document.getElementById('auto-edit-from-name')?.value?.trim();

  if (!id) return;

  try {
    await api.put(`/automations/${id}`, {
      name,
      daily_limit,
      send_time,
      from_name
    });

    showToast('Automation settings updated successfully!', 'success');
    closeModal('modal-edit-automation');
    loadAutomationsList();
  } catch (err) {
    showToast(`Failed to update: ${err.message}`, 'error');
  }
}

async function toggleAutomationPause(id, currentStatus) {
  const endpoint = currentStatus === 'paused' ? `/automations/${id}/resume` : `/automations/${id}/pause`;
  try {
    await api.post(endpoint);
    showToast(currentStatus === 'paused' ? 'Automation resumed!' : 'Automation paused!', 'info');
    loadAutomationsList();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function triggerAutomationNow(id) {
  if (!confirm('Dispatch the next scheduled batch of emails right now?')) return;

  showToast('Dispatching batch...', 'info');
  try {
    const res = await api.post(`/automations/${id}/trigger-now`);
    if (res.completed) {
      showToast('All contacts have been sent! Automation completed.', 'success');
    } else {
      showToast(`Batch dispatched! Sent: ${res.sentCount}, Failed: ${res.failedCount}`, 'success');
    }
    loadAutomationsList();
  } catch (err) {
    showToast(`Trigger failed: ${err.message}`, 'error');
  }
}

async function deleteAutomation(id) {
  if (!confirm('Are you sure you want to delete this automation and its recipient queue?')) return;
  try {
    await api.delete(`/automations/${id}`);
    showToast('Automation deleted', 'success');
    loadAutomationsList();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function viewAutomationLogs(id, page = 1) {
  currentViewingAutoId = id;
  currentViewingAutoLogsPage = page;

  openModal('modal-automation-logs');
  const tbody = document.getElementById('auto-logs-tbody');
  const pagination = document.getElementById('auto-logs-pagination');
  const summary = document.getElementById('auto-logs-stats-summary');

  tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px;">Loading logs...</td></tr>`;

  try {
    let url = `/automations/${id}/logs?page=${page}&limit=20`;
    if (currentViewingAutoLogsStatus) url += `&status=${currentViewingAutoLogsStatus}`;

    const data = await api.get(url);
    const logs = data.logs || [];

    if (summary) {
      summary.textContent = `Total Recipient Logs: ${Number(data.total || 0).toLocaleString()}`;
    }

    if (!logs.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-dim); padding: 30px;">No logs match this filter.</td></tr>`;
      if (pagination) pagination.innerHTML = '';
      return;
    }

    tbody.innerHTML = logs.map(l => {
      const badgeClass = {
        sent: 'badge-success',
        failed: 'badge-danger',
        pending: 'badge-secondary'
      }[l.status] || 'badge-secondary';

      const openHtml = l.opened_at
        ? `<span style="color: #10b981; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            Opened (${l.open_count}x)
          </span>`
        : '<span style="color: var(--text-dim);">Unread</span>';

      return `
        <tr>
          <td><strong>${escapeHtml(l.recipient_name || '—')}</strong></td>
          <td><code>${escapeHtml(l.email)}</code></td>
          <td><span class="badge ${badgeClass}">${l.status}</span></td>
          <td>${openHtml}</td>
          <td style="font-size: 12px; color: var(--text-dim);">
            ${l.sent_at ? new Date(l.sent_at).toLocaleString() : 'Pending in queue'}
          </td>
        </tr>
      `;
    }).join('');

    if (window.renderPaginationControls && pagination) {
      window.renderPaginationControls({
        containerId: 'auto-logs-pagination',
        currentPage: data.page,
        totalPages: data.totalPages,
        totalItems: data.total,
        limit: data.limit,
        onPageChangeName: 'goToAutoLogsPage',
        itemName: 'recipient logs'
      });
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="color: var(--color-danger); padding: 20px;">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function filterAutoLogs(status) {
  currentViewingAutoLogsStatus = status;
  currentViewingAutoLogsPage = 1;

  document.querySelectorAll('.auto-log-filter').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === status);
  });

  if (currentViewingAutoId) {
    viewAutomationLogs(currentViewingAutoId, 1);
  }
}

function goToAutoLogsPage(page) {
  if (currentViewingAutoId) {
    viewAutomationLogs(currentViewingAutoId, page);
  }
}

window.loadAutomationsView = loadAutomationsView;
window.handleAutomationSearch = handleAutomationSearch;
window.handleAutomationStatusFilter = handleAutomationStatusFilter;
window.handleAutomationLimitChange = handleAutomationLimitChange;
window.goToAutomationsPage = goToAutomationsPage;
window.openCreateAutomationModal = openCreateAutomationModal;
window.submitCreateAutomation = submitCreateAutomation;
window.openEditAutomationModal = openEditAutomationModal;
window.submitEditAutomation = submitEditAutomation;
window.toggleAutomationPause = toggleAutomationPause;
window.triggerAutomationNow = triggerAutomationNow;
window.deleteAutomation = deleteAutomation;
window.viewAutomationLogs = viewAutomationLogs;
window.filterAutoLogs = filterAutoLogs;
window.goToAutoLogsPage = goToAutoLogsPage;
