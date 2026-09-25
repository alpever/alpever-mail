/**
 * Dashboard View Controller with Time Interval Filtering
 */

let currentDashboardInterval = '7d';
let customStartDate = '';
let customEndDate = '';

async function loadDashboardView(interval = currentDashboardInterval, extraParams = {}) {
  try {
    currentDashboardInterval = interval;
    let url = `/stats?interval=${encodeURIComponent(interval)}`;
    if (interval === 'custom') {
      const s = extraParams.startDate || customStartDate;
      const e = extraParams.endDate || customEndDate;
      if (s) url += `&startDate=${encodeURIComponent(s)}`;
      if (e) url += `&endDate=${encodeURIComponent(e)}`;
    }
    const stats = await api.get(url);

    // Update stat metrics safely
    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setTxt('stat-total-contacts', Number(stats.totalContacts || 0).toLocaleString());
    setTxt('stat-total-lists', Number(stats.totalLists || 0).toLocaleString());
    setTxt('stat-total-templates', Number(stats.totalTemplates || 0).toLocaleString());
    setTxt('stat-total-campaigns', Number(stats.totalCampaigns || 0).toLocaleString());
    setTxt('stat-total-sent', Number(stats.totalSent || 0).toLocaleString());

    const openedNum = Number(stats.totalOpened || 0);
    const sentNum = Number(stats.totalSent || 0);
    const openPct = sentNum > 0 ? Math.round((openedNum / sentNum) * 100) : 0;
    setTxt('stat-total-opened', `${openedNum.toLocaleString()} (${openPct}%)`);
    setTxt('stat-success-rate', `${stats.successRate || 100}%`);

    // Update Header Status Pill
    const dbDot = document.getElementById('header-db-dot');
    const dbText = document.getElementById('header-db-text');

    if (dbDot && dbText) {
      if (stats.dbConnected) {
        dbDot.className = 'status-dot online';
        dbText.textContent = 'MySQL Connected';
      } else {
        dbDot.className = 'status-dot offline';
        dbText.textContent = 'MySQL Needs Setup';
      }
    }

    // Load Recent Campaigns in dashboard
    loadRecentCampaigns();
  } catch (err) {
    console.error('Error loading dashboard stats:', err);
  }
}

function toggleTimeIntervalMenu() {
  const btn = document.getElementById('btn-time-interval');
  const menu = document.getElementById('menu-time-interval');
  if (!btn || !menu) return;

  const isOpen = menu.classList.contains('show');
  if (isOpen) {
    menu.classList.remove('show');
    btn.classList.remove('active');
  } else {
    menu.classList.add('show');
    btn.classList.add('active');

    // Close on outside click
    const closeListener = (e) => {
      if (!btn.contains(e.target) && !menu.contains(e.target)) {
        menu.classList.remove('show');
        btn.classList.remove('active');
        document.removeEventListener('click', closeListener);
      }
    };
    setTimeout(() => document.addEventListener('click', closeListener), 10);
  }
}

function selectTimeInterval(intervalKey, labelText, extraParams = {}) {
  const btn = document.getElementById('btn-time-interval');
  const menu = document.getElementById('menu-time-interval');
  const labelSpan = document.getElementById('selected-interval-text');

  if (labelSpan) labelSpan.textContent = labelText;

  // Update checkmark state
  document.querySelectorAll('.time-interval-item').forEach(item => {
    item.classList.toggle('selected', item.dataset.val === intervalKey);
  });

  if (menu) menu.classList.remove('show');
  if (btn) btn.classList.remove('active');

  // Reload stats with selected interval
  loadDashboardView(intervalKey, extraParams);
}

function openCustomDateModal() {
  const menu = document.getElementById('menu-time-interval');
  const btn = document.getElementById('btn-time-interval');
  if (menu) menu.classList.remove('show');
  if (btn) btn.classList.remove('active');

  const startInput = document.getElementById('custom-range-start');
  const endInput = document.getElementById('custom-range-end');
  
  if (startInput && !startInput.value) {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    startInput.value = d.toISOString().split('T')[0];
  }
  if (endInput && !endInput.value) {
    endInput.value = new Date().toISOString().split('T')[0];
  }

  if (typeof openModal === 'function') {
    openModal('modal-custom-date-range');
  }
}

function applyCustomDateRange() {
  const startInput = document.getElementById('custom-range-start');
  const endInput = document.getElementById('custom-range-end');

  customStartDate = startInput?.value || '';
  customEndDate = endInput?.value || '';

  if (!customStartDate && !customEndDate) {
    if (typeof showToast === 'function') {
      showToast('Please select at least one date', 'warning');
    }
    return;
  }

  if (typeof closeModal === 'function') {
    closeModal('modal-custom-date-range');
  }

  const label = customStartDate && customEndDate 
    ? `${customStartDate} → ${customEndDate}` 
    : (customStartDate ? `From ${customStartDate}` : `Until ${customEndDate}`);

  selectTimeInterval('custom', label, { startDate: customStartDate, endDate: customEndDate });
}

async function loadRecentCampaigns() {
  const container = document.getElementById('dashboard-campaigns-list');
  if (!container) return;

  try {
    const campaigns = await api.get('/campaigns');
    if (!campaigns.length) {
      container.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-dim); padding: 30px;">
            No campaigns yet. Click <strong>"Launch Campaign"</strong> to start your first personalized email blast!
          </td>
        </tr>
      `;
      return;
    }

    container.innerHTML = campaigns.slice(0, 5).map(c => {
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
          <td><strong>${escapeHtml(c.name)}</strong></td>
          <td>${escapeHtml(c.template_name || 'Custom')}</td>
          <td>${Number(c.total_count || 0).toLocaleString()} contacts</td>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <div class="progress-bar-wrap" style="width: 90px; height: 8px;">
                <div class="progress-bar-fill ${c.status === 'processing' ? 'animated' : ''}" style="width: ${c.percentage || 0}%;"></div>
              </div>
              <span style="font-size: 11px; font-weight: 600;">${c.percentage || 0}%</span>
            </div>
          </td>
          <td><span class="badge ${badgeClass}">${c.status}</span></td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="viewCampaignDetails(${c.id})">
              View Logs
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<tr><td colspan="6" style="color: var(--color-danger); padding: 20px;">Failed to load campaigns: ${escapeHtml(err.message)}</td></tr>`;
  }
}

window.loadDashboardView = loadDashboardView;
window.toggleTimeIntervalMenu = toggleTimeIntervalMenu;
window.selectTimeInterval = selectTimeInterval;
window.openCustomDateModal = openCustomDateModal;
window.applyCustomDateRange = applyCustomDateRange;
