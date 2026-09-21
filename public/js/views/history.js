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
        ${escapeHtml(c.name)} (${c.sent_count || 0}/${c.total_count || 0} sent) - ${new Date(c.created_at).toLocaleDateString()}
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
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 30px;">Select a campaign to view delivery audit logs.</td></tr>`;
    return;
  }

  tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px;">Loading logs...</td></tr>`;

  try {
    let url = `/campaigns/${selectedCampaignForLogs}/logs?page=${currentLogsPage}&limit=30`;
    if (currentLogsStatusFilter) url += `&status=${currentLogsStatusFilter}`;

    const data = await api.get(url);
    const logs = data.logs || [];

    if (!logs.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 30px;">No logs match the current filter.</td></tr>`;
      pagination.innerHTML = '';
      return;
    }

    tbody.innerHTML = logs.map(l => {
      const badgeClass = {
        sent: 'badge-success',
        failed: 'badge-danger',
        pending: 'badge-secondary'
      }[l.status] || 'badge-secondary';

      return `
        <tr>
          <td>#${l.id}</td>
          <td><strong>${escapeHtml(l.recipient_name || '—')}</strong></td>
          <td><code>${escapeHtml(l.email)}</code></td>
          <td><span class="badge ${badgeClass}">${l.status}</span></td>
          <td>
            ${l.resend_id ? `<span style="font-family: var(--font-mono); font-size: 11px; color: #a5b4fc;">${escapeHtml(l.resend_id)}</span>` : '<span style="color: var(--text-dim);">—</span>'}
            ${l.error_message ? `<div style="font-size: 11px; color: var(--color-danger); margin-top: 3px;">${escapeHtml(l.error_message)}</div>` : ''}
          </td>
          <td style="font-size: 12px; color: var(--text-dim);">
            ${l.sent_at ? new Date(l.sent_at).toLocaleTimeString() : 'Pending'}
          </td>
        </tr>
      `;
    }).join('');

    // Pagination
    pagination.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; margin-top: 14px;">
        <span style="font-size: 12px; color: var(--text-muted);">
          Page ${data.page} of ${data.totalPages || 1} (${data.total} logs)
        </span>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-secondary btn-sm" ${data.page <= 1 ? 'disabled' : ''} onclick="changeLogsPage(${data.page - 1})">
            Previous
          </button>
          <button class="btn btn-secondary btn-sm" ${data.page >= data.totalPages ? 'disabled' : ''} onclick="changeLogsPage(${data.page + 1})">
            Next
          </button>
        </div>
      </div>
    `;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color: var(--color-danger); padding: 20px;">Error: ${escapeHtml(err.message)}</td></tr>`;
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
