/**
 * Main Application Router & Controller
 */

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
window.escapeHtml = escapeHtml;

function navigateTo(viewName) {
  // Update sidebar active state
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewName);
  });

  // Switch visible section
  document.querySelectorAll('.view-section').forEach(sec => {
    sec.classList.remove('active');
  });

  const targetSection = document.getElementById(`view-${viewName}`);
  if (targetSection) {
    targetSection.classList.add('active');
  }

  // Update Page Title in Top Header
  const titles = {
    dashboard: 'Dashboard Overview',
    contacts: 'Audience & Contacts',
    templates: 'Dynamic Template Studio',
    campaigns: 'Mass Campaigns & Dispatch',
    history: 'Audit Logs & Delivery Reports'
  };

  const validView = titles[viewName] ? viewName : 'dashboard';
  const titleElem = document.getElementById('top-page-title');
  if (titleElem) titleElem.textContent = titles[validView] || 'Mass Mailer';

  // Trigger view data loaders
  if (validView === 'dashboard' && window.loadDashboardView) window.loadDashboardView();
  if (validView === 'contacts' && window.loadContactsView) window.loadContactsView();
  if (validView === 'templates' && window.loadTemplatesView) window.loadTemplatesView();
  if (validView === 'campaigns' && window.loadCampaignsView) window.loadCampaignsView();
  if (validView === 'history' && window.loadHistoryView) window.loadHistoryView();

  window.location.hash = validView;
}
window.navigateTo = navigateTo;

async function updateHeaderDbStatus() {
  try {
    const stats = await api.get('/stats');
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
  } catch (e) {}
}
window.updateHeaderDbStatus = updateHeaderDbStatus;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  // Update header status immediately
  updateHeaderDbStatus();

  // Setup nav click listeners
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const view = item.dataset.view;
      if (view) navigateTo(view);
    });
  });

  // Initial view based on hash or default to dashboard
  const initialView = window.location.hash.replace('#', '') || 'dashboard';
  navigateTo(initialView);

  // Background stats and DB status refresh every 10s
  setInterval(() => {
    updateHeaderDbStatus();
    if (window.location.hash === '#dashboard' || !window.location.hash) {
      if (window.loadDashboardView) window.loadDashboardView();
    }
  }, 10000);
});
