/**
 * Contacts & Audience View Controller
 */

let currentViewingListId = null;
let currentContactsPage = 1;

async function loadContactsView() {
  await loadAudienceLists();
  setupDropzone();
}

async function loadAudienceLists() {
  const container = document.getElementById('audience-lists-grid');
  if (!container) return;

  try {
    const lists = await api.get('/contacts/lists');
    if (!lists.length) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-subtle);">
          <div style="font-size: 32px; margin-bottom: 12px;">📂</div>
          <h3 style="font-size: 16px; color: var(--text-main); margin-bottom: 6px;">No Audience Lists Found</h3>
          <p style="font-size: 13px; color: var(--text-dim); max-width: 450px; margin: 0 auto 16px;">
            Upload your first customer CSV/Excel file or generate a sample customer list to test personalized sending.
          </p>
          <button class="btn btn-primary btn-sm" onclick="downloadSampleCSV()">
            📥 Download Sample 10-Customer CSV
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = lists.map(l => `
      <div class="card" style="display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px;">
            <div style="font-size: 24px; padding: 10px; background: rgba(99, 102, 241, 0.1); border-radius: var(--radius-md);">👥</div>
            <span class="badge badge-info">${Number(l.total_contacts || 0).toLocaleString()} contacts</span>
          </div>
          <h3 style="font-size: 16px; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
            ${escapeHtml(l.name)}
          </h3>
          <p style="font-size: 13px; color: var(--text-muted); line-height: 1.5; margin-bottom: 16px;">
            ${escapeHtml(l.description || 'No description')}
          </p>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 14px; border-top: 1px solid var(--border-subtle);">
          <span style="font-size: 11px; color: var(--text-dim);">
            ${new Date(l.created_at).toLocaleDateString()}
          </span>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary btn-sm" onclick="viewContactsModal(${l.id}, '${escapeHtml(l.name)}')">
              View Data
            </button>
            <button class="btn btn-secondary btn-sm" style="color: var(--color-danger);" onclick="deleteAudienceList(${l.id})">
              🗑
            </button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div style="color: var(--color-danger); padding: 20px;">Failed to load lists: ${escapeHtml(err.message)}</div>`;
  }
}

function setupDropzone() {
  const dropzone = document.getElementById('contact-dropzone');
  const fileInput = document.getElementById('contact-file-input');

  if (!dropzone || !fileInput) return;

  dropzone.onclick = () => fileInput.click();

  dropzone.ondragover = (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  };

  dropzone.ondragleave = () => {
    dropzone.classList.remove('dragover');
  };

  dropzone.ondrop = (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  fileInput.onchange = () => {
    if (fileInput.files.length) {
      handleFileUpload(fileInput.files[0]);
      fileInput.value = '';
    }
  };
}

async function handleFileUpload(file) {
  const listName = prompt('Enter a name for this Audience List:', file.name.replace(/\.[^/.]+$/, ''));
  if (listName === null) return;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('listName', listName || file.name);

  showToast(`Uploading and parsing ${file.name}...`, 'info');

  try {
    const result = await api.upload('/contacts/upload', formData);
    showToast(`Successfully imported ${result.totalImported} contacts!`, 'success');
    await loadAudienceLists();
    if (window.loadDashboardView) window.loadDashboardView();
  } catch (err) {
    showToast(`Upload failed: ${err.message}`, 'error', 6000);
  }
}

async function viewContactsModal(listId, listName, page = 1) {
  currentViewingListId = listId;
  currentContactsPage = page;

  document.getElementById('modal-contacts-title').textContent = `Audience: ${listName}`;
  const tableHead = document.getElementById('modal-contacts-thead');
  const tableBody = document.getElementById('modal-contacts-tbody');
  const pagination = document.getElementById('modal-contacts-pagination');

  tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px;">Loading contacts...</td></tr>`;
  openModal('modal-contacts');

  const search = document.getElementById('modal-contacts-search').value || '';

  try {
    const data = await api.get(`/contacts/list/${listId}?page=${page}&limit=20&search=${encodeURIComponent(search)}`);
    const contacts = data.contacts || [];

    if (!contacts.length) {
      tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 30px; color: var(--text-dim);">No contacts found</td></tr>`;
      pagination.innerHTML = '';
      return;
    }

    tableBody.innerHTML = contacts.map(c => {
      const customKeys = Object.keys(c.custom_fields || {});
      const customBadges = customKeys.slice(0, 3).map(k => `
        <span class="chip" style="font-size: 10px;">${escapeHtml(k)}: ${escapeHtml(String(c.custom_fields[k]))}</span>
      `).join('');

      return `
        <tr>
          <td><strong>${escapeHtml(c.name || '—')}</strong></td>
          <td><code>${escapeHtml(c.email)}</code></td>
          <td>${escapeHtml(c.company || '—')}</td>
          <td>${customBadges || '<span style="color: var(--text-dim); font-size: 11px;">none</span>'}</td>
          <td>
            <button class="btn btn-secondary btn-sm" style="color: var(--color-danger); padding: 2px 8px;" onclick="deleteSingleContact(${c.id})">×</button>
          </td>
        </tr>
      `;
    }).join('');

    // Pagination
    pagination.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; margin-top: 14px;">
        <span style="font-size: 12px; color: var(--text-muted);">
          Showing Page ${data.page} of ${data.totalPages || 1} (${data.total} total contacts)
        </span>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-secondary btn-sm" ${data.page <= 1 ? 'disabled' : ''} onclick="viewContactsModal(${listId}, '${escapeHtml(listName)}', ${data.page - 1})">
            Previous
          </button>
          <button class="btn btn-secondary btn-sm" ${data.page >= data.totalPages ? 'disabled' : ''} onclick="viewContactsModal(${listId}, '${escapeHtml(listName)}', ${data.page + 1})">
            Next
          </button>
        </div>
      </div>
    `;
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="5" style="color: var(--color-danger); padding: 20px;">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function deleteSingleContact(contactId) {
  if (!confirm('Are you sure you want to remove this contact?')) return;
  try {
    await api.delete(`/contacts/${contactId}`);
    showToast('Contact removed', 'success');
    const title = document.getElementById('modal-contacts-title').textContent.replace('Audience: ', '');
    viewContactsModal(currentViewingListId, title, currentContactsPage);
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function deleteAudienceList(listId) {
  if (!confirm('Are you sure you want to delete this audience list and all its contacts?')) return;
  try {
    await api.delete(`/contacts/list/${listId}`);
    showToast('Audience list deleted', 'success');
    await loadAudienceLists();
    if (window.loadDashboardView) window.loadDashboardView();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

/**
 * 1-Click Sample CSV generator
 */
function downloadSampleCSV() {
  const csvContent = [
    'email,name,company,role,city,discount',
    'rahul.sharma@example.com,Rahul Sharma,TechCorp India,Head of Growth,Bengaluru,25%',
    'priya.patel@example.com,Priya Patel,Nexus Systems,CTO,Mumbai,30%',
    'amit.verma@example.com,Amit Verma,Alpha Logistics,Operations Director,Delhi,20%',
    'sneha.reddy@example.com,Sneha Reddy,CloudScale Solutions,Product Manager,Hyderabad,25%',
    'vikram.singh@example.com,Vikram Singh,Zenith Retail,Founder & CEO,Jaipur,35%',
    'ananya.das@example.com,Ananya Das,Creative Hive,Marketing Lead,Kolkata,20%',
    'rohit.mehta@example.com,Rohit Mehta,FinEdge Capital,Managing Director,Pune,30%',
    'pooja.nair@example.com,Pooja Nair,BioHealth Labs,VP Research,Chennai,25%',
    'karan.malhotra@example.com,Karan Malhotra,Apex Global,Strategy Head,Gurugram,20%',
    'neha.gupta@example.com,Neha Gupta,Gupta Enterprises,Operations Lead,Noida,25%'
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'sample_10_customers.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast('Downloaded sample_10_customers.csv! Drag & drop it into the upload box.', 'info');
}

window.loadContactsView = loadContactsView;
window.viewContactsModal = viewContactsModal;
window.deleteSingleContact = deleteSingleContact;
window.deleteAudienceList = deleteAudienceList;
window.downloadSampleCSV = downloadSampleCSV;
