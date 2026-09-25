/**
 * History & Detailed Audit Logs Controller
 */

let selectedCampaignForLogs = null;
let currentLogsPage = 1;
let currentLogsStatusFilter = '';

async function loadHistoryView() {
  await populateCampaignsDropdownForLogs();
  await loadCampaignLogsTable();
}

async function populateCampaignsDropdownForLogs() {
  const select = document.getElementById('history-campaign-select');
  if (!select) return;

  try {
    const campaigns = await api.get('/campaigns');
    if (!campaigns.length) {
      select.innerHTML = '<option value="">No campaigns available</option>';
      return;
    }

    select.innerHTML = campaigns.map(c => `
      <option value="${c.id}" ${c.id === selectedCampaignForLogs ? 'selected' : ''}>
        ${escapeHtml(c.name)} (${c.sent_count || 0} sent • ${c.opened_count || 0} opened) - ${new Date(c.created_at).toLocaleDateString()}
      </option>
    `).join('');

    if (!selectedCampaignForLogs && campaigns.length) {
      selectedCampaignForLogs = campaigns[0].id;
    }
  } catch (err) {
    console.error('History campaign select load error:', err);
  }
}

async function onHistoryCampaignChange() {
  const select = document.getElementById('history-campaign-select');
  selectedCampaignForLogs = select.value;
  currentLogsPage = 1;
  await loadCampaignLogsTable();
}

function filterLogsByStatus(status) {
  currentLogsStatusFilter = status;
  currentLogsPage = 1;

  // Update filter buttons styling
  document.querySelectorAll('.log-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === status);
  });

  loadCampaignLogsTable();
}

async function loadCampaignLogsTable() {
  const tbody = document.getElementById('history-logs-tbody');
  const pagination = document.getElementById('history-logs-pagination');
  if (!tbody) return;

  if (!selectedCampaignForLogs) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 30px;">Select a campaign to view delivery audit logs.</td></tr>`;
    return;
  }

  tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px;">Loading logs...</td></tr>`;

  try {
    let url = `/campaigns/${selectedCampaignForLogs}/logs?page=${currentLogsPage}&limit=30`;
    if (currentLogsStatusFilter) url += `&status=${currentLogsStatusFilter}`;

    const data = await api.get(url);
    const logs = data.logs || [];

    if (!logs.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 30px;">No logs match the current filter.</td></tr>`;
      pagination.innerHTML = '';
      return;
    }

    tbody.innerHTML = logs.map(l => {
      const badgeClass = {
        sent: 'badge-success',
        failed: 'badge-danger',
        pending: 'badge-secondary'
      }[l.status] || 'badge-secondary';

      const isOpened = Boolean(l.opened_at);
      const openHtml = isOpened ? `
        <div>
          <div style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 6px; background: rgba(16, 185, 129, 0.12); color: #10b981; font-weight: 600; font-size: 11px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            Opened (${l.open_count || 1}x)
          </div>
          <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">
            ${new Date(l.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ${new Date(l.opened_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
          </div>
        </div>
      ` : `
        <span style="color: var(--text-dim); font-size: 11px; padding: 2px 7px; border-radius: 4px; background: rgba(148, 163, 184, 0.08);">
          Unopened
        </span>
      `;

      return `
        <tr>
          <td>#${l.id}</td>
          <td><strong>${escapeHtml(l.recipient_name || '—')}</strong></td>
          <td><code>${escapeHtml(l.email)}</code></td>
          <td><span class="badge ${badgeClass}">${l.status}</span></td>
          <td>${openHtml}</td>
          <td>
            ${l.resend_id ? `<span style="font-family: var(--font-mono); font-size: 11px; color: #a5b4fc;">${escapeHtml(l.resend_id)}</span>` : '<span style="color: var(--text-dim);">—</span>'}
            ${l.error_message ? `<div style="font-size: 11px; color: var(--color-danger); margin-top: 3px;">${escapeHtml(l.error_message)}</div>` : ''}
          </td>
          <td style="font-size: 12px; color: var(--text-dim);">
            ${l.sent_at ? new Date(l.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Pending'}
          </td>
        </tr>
      `;
    }).join('');

    // Render modern pagination
    if (window.renderPaginationControls && pagination) {
      window.renderPaginationControls({
        containerId: 'history-logs-pagination',
        currentPage: data.page,
        totalPages: data.totalPages,
        totalItems: data.total,
        limit: data.limit,
        onPageChangeName: 'changeLogsPage',
        itemName: 'recipient logs'
      });
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="color: var(--color-danger); padding: 20px;">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function changeLogsPage(page) {
  currentLogsPage = page;
  loadCampaignLogsTable();
}

function exportCampaignLogsCSV() {
  if (!selectedCampaignForLogs) {
    showToast('Please select a campaign first', 'warning');
    return;
  }
  window.open(`/api/campaigns/${selectedCampaignForLogs}/export`, '_blank');
}

function viewCampaignDetails(campaignId) {
  selectedCampaignForLogs = campaignId;
  navigateTo('history');
}

window.loadHistoryView = loadHistoryView;
window.onHistoryCampaignChange = onHistoryCampaignChange;
window.filterLogsByStatus = filterLogsByStatus;
window.changeLogsPage = changeLogsPage;
window.exportCampaignLogsCSV = exportCampaignLogsCSV;
window.viewCampaignDetails = viewCampaignDetails;
