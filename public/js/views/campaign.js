/**
 * Campaign Studio & Live Execution Controller
 */

// Global Wizard State
let activeCampaignProgressInterval = null;
let currentCreatedCampaignId = null;
let wizardSource = 'upload'; // 'upload' | 'existing'
let wizardUploadedFile = null;
let wizardParsedData = null; // { detectedHeaders, totalRows, sampleRows }
let wizardExistingListData = null; // { detectedHeaders, sampleContacts, totalRows }
let wizardTemplates = [];
let wizardSelectedTemplate = null;
let wizardActiveMapping = {};
let wizardPreviewIndex = 0;
let wizardFinalListId = null;
let wizardFinalListCount = 0;

let currentCampaignsPage = 1;
let currentCampaignsLimit = 10;
let currentCampaignsSearch = '';
let currentCampaignsStatus = 'all';
let campaignsSearchDebounceTimer = null;

async function loadCampaignsView() {
  await loadCampaignsList();
  await populateWizardDropdowns();
}

function handleCampaignSearch(val) {
  clearTimeout(campaignsSearchDebounceTimer);
  campaignsSearchDebounceTimer = setTimeout(() => {
    currentCampaignsSearch = (val || '').trim();
    currentCampaignsPage = 1;
    loadCampaignsList();
  }, 300);
}

function handleCampaignStatusFilter(status) {
  currentCampaignsStatus = status || 'all';
  currentCampaignsPage = 1;
  loadCampaignsList();
}

function handleCampaignLimitChange(limit) {
  currentCampaignsLimit = parseInt(limit, 10) || 10;
  currentCampaignsPage = 1;
  loadCampaignsList();
}

function goToCampaignsPage(page) {
  currentCampaignsPage = page;
  loadCampaignsList();
}

async function loadCampaignsList() {
  const container = document.getElementById('campaigns-table-tbody');
  const paginationContainer = document.getElementById('campaigns-pagination');
  if (!container) return;

  container.innerHTML = `
    <tr>
      <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">
        Loading campaigns...
      </td>
    </tr>
  `;

  try {
    let url = `/campaigns?page=${currentCampaignsPage}&limit=${currentCampaignsLimit}`;
    if (currentCampaignsSearch) url += `&search=${encodeURIComponent(currentCampaignsSearch)}`;
    if (currentCampaignsStatus && currentCampaignsStatus !== 'all') url += `&status=${encodeURIComponent(currentCampaignsStatus)}`;

    const res = await api.get(url);
    const campaigns = Array.isArray(res) ? res : (res.campaigns || []);
    const total = Array.isArray(res) ? campaigns.length : (res.total || 0);
    const totalPages = Array.isArray(res) ? 1 : (res.totalPages || 1);

    if (!campaigns.length) {
      container.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; color: var(--text-dim); padding: 40px;">
            ${currentCampaignsSearch || currentCampaignsStatus !== 'all' 
              ? 'No campaigns match your search/filter criteria.' 
              : 'No campaigns launched yet. Click <strong>"Launch New Campaign"</strong> to get started!'}
          </td>
        </tr>
      `;
      if (paginationContainer) paginationContainer.innerHTML = '';
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
          <td>
            <div style="font-weight: 700; color: #10b981; font-size: 13px;">
              👁️ ${Number(c.opened_count || 0).toLocaleString()} opened
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
              ${(c.sent_count || 0) > 0 ? `${c.openRate || 0}% open rate` : '0%'}
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

    // Render modern pagination
    if (window.renderPaginationControls && paginationContainer) {
      window.renderPaginationControls({
        containerId: 'campaigns-pagination',
        currentPage: currentCampaignsPage,
        totalPages,
        totalItems: total,
        limit: currentCampaignsLimit,
        onPageChangeName: 'goToCampaignsPage',
        itemName: 'campaigns'
      });
    }
  } catch (err) {
    container.innerHTML = `<tr><td colspan="8" style="color: var(--color-danger); padding: 20px;">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

/**
 * Self-contained Client Interpolation for Live Previews
 */
function interpolateTemplateString(template = '', contact = {}, extraVars = {}) {
  if (!template) return '';
  const data = {};
  if (contact.email) data.email = contact.email;
  if (contact.name) data.name = contact.name;
  if (contact.company) data.company = contact.company;

  if (contact.custom_fields) {
    let custom = contact.custom_fields;
    if (typeof custom === 'string') {
      try { custom = JSON.parse(custom); } catch (e) { custom = {}; }
    }
    for (const [k, v] of Object.entries(custom || {})) {
      data[k.toLowerCase().trim()] = v;
      data[k.toLowerCase().replace(/[\s_-]+/g, '')] = v;
    }
  }

  for (const [k, v] of Object.entries(extraVars || {})) {
    data[k.toLowerCase().trim()] = v;
  }

  if (!data.name) {
    if (data.fullname) data.name = data.fullname;
    else if (data.firstname && data.lastname) data.name = `${data.firstname} ${data.lastname}`.trim();
    else if (data.firstname) data.name = data.firstname;
  }

  const pattern = /\{\{\s*([a-zA-Z0-9_-]+)(?:\s*\|\s*["']([^"']*)["'])?\s*\}\}/g;
  return template.replace(pattern, (match, varName, defaultValue) => {
    const key = varName.toLowerCase().trim();
    const cleanKey = key.replace(/[\s_-]+/g, '');
    const val = data[key] ?? data[cleanKey];

    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val);
    }
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    return '';
  });
}

function extractTemplateVariables(subject = '', body = '') {
  const text = `${subject} ${body}`;
  const regex = /\{\{\s*([a-zA-Z0-9_-]+)(?:\s*\|\s*["']([^"']*)["'])?\s*\}\}/g;
  const vars = new Set();
  let match;
  while ((match = regex.exec(text)) !== null) {
    vars.add(match[1].toLowerCase().trim());
  }
  return Array.from(vars);
}

function matchHeaderForVariable(variableName, headers = []) {
  const cleanVar = variableName.toLowerCase().trim();
  const noUnderscore = cleanVar.replace(/[\s_-]+/g, '');

  const synonyms = {
    email: ['email', 'e-mail', 'mail', 'contact_email', 'work_email', 'email_address', 'primary_email', 'user_email'],
    name: ['name', 'fullname', 'full_name', 'customer_name', 'client_name', 'contact_name', 'first_name', 'firstname', 'fname', 'person', 'recipient'],
    company: ['company', 'company_name', 'organization', 'org', 'business', 'employer', 'firm', 'agency', 'enterprise'],
    place: ['place', 'city', 'location', 'state', 'town', 'address', 'country'],
    city: ['city', 'place', 'location', 'town', 'state'],
    role: ['role', 'designation', 'title', 'position', 'job_title', 'job', 'occupation'],
    phone: ['phone', 'mobile', 'tel', 'cell', 'whatsapp', 'number', 'phone_number'],
    discount: ['discount', 'coupon', 'promo', 'offer', 'code', 'promo_code', 'voucher'],
    website: ['website', 'site', 'url', 'link', 'domain']
  };

  // 1. Exact match
  for (const h of headers) {
    const lower = h.toLowerCase().trim();
    const clean = lower.replace(/[\s_-]+/g, '');
    if (lower === cleanVar || clean === noUnderscore) return h;
  }

  // 2. Synonyms match
  if (synonyms[cleanVar]) {
    for (const syn of synonyms[cleanVar]) {
      for (const h of headers) {
        const lower = h.toLowerCase().trim();
        const clean = lower.replace(/[\s_-]+/g, '');
        if (lower === syn || clean === syn.replace(/[\s_-]+/g, '') || lower.includes(syn)) return h;
      }
    }
  }

  // 3. Substring match
  for (const h of headers) {
    const clean = h.toLowerCase().replace(/[\s_-]+/g, '');
    if (clean.includes(noUnderscore) || noUnderscore.includes(clean)) return h;
  }

  return '';
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

    wizardTemplates = templates || [];

    // Populate Lists
    listSelect.innerHTML = lists.length
      ? lists.map(l => `<option value="${l.id}">${escapeHtml(l.name)} (${l.total_contacts} contacts)</option>`).join('')
      : '<option value="">No lists available</option>';

    // Populate Templates
    tplSelect.innerHTML = templates.length
      ? templates.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')
      : '<option value="">No templates available - create one first</option>';

    if (templates.length > 0) {
      wizardSelectedTemplate = templates[0];
      const subjectBox = document.getElementById('wizard-template-info-box');
      const subjectSpan = document.getElementById('wizard-selected-tpl-subject');
      if (subjectBox && subjectSpan) {
        subjectSpan.textContent = templates[0].subject || '(No subject)';
        subjectBox.style.display = 'block';
      }
    }

    // Default Sender values from settings
    if (settings.fromName) document.getElementById('wizard-from-name').value = settings.fromName;
    if (settings.fromEmail) document.getElementById('wizard-from-email').value = settings.fromEmail;
    if (settings.replyTo) document.getElementById('wizard-reply-to').value = settings.replyTo;

    // Listeners for template & list dropdown changes
    tplSelect.onchange = () => {
      const selectedId = tplSelect.value;
      wizardSelectedTemplate = wizardTemplates.find(t => t.id == selectedId) || null;
      const subjectBox = document.getElementById('wizard-template-info-box');
      const subjectSpan = document.getElementById('wizard-selected-tpl-subject');
      if (subjectBox && subjectSpan && wizardSelectedTemplate) {
        subjectSpan.textContent = wizardSelectedTemplate.subject || '(No subject)';
        subjectBox.style.display = 'block';
      }
      updateWizardMappingSection();
    };

    listSelect.onchange = async () => {
      if (wizardSource === 'existing' && listSelect.value) {
        await loadExistingListSample(listSelect.value);
        updateWizardMappingSection();
      }
    };
  } catch (err) {
    console.error('Wizard dropdown load error:', err);
  }
}

function setupWizardDropzone() {
  const dropzone = document.getElementById('wizard-dropzone');
  const fileInput = document.getElementById('wizard-file-input');
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
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
      handleWizardFileSelected(e.dataTransfer.files[0]);
    }
  };

  fileInput.onchange = () => {
    if (fileInput.files && fileInput.files.length) {
      handleWizardFileSelected(fileInput.files[0]);
      fileInput.value = '';
    }
  };
}

function triggerWizardFileInput() {
  const fileInput = document.getElementById('wizard-file-input');
  if (fileInput) fileInput.click();
}

async function handleWizardFileSelected(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['xlsx', 'xls', 'csv'].includes(ext)) {
    showToast('Please upload an Excel (.xlsx, .xls) or CSV file.', 'warning');
    return;
  }

  showToast(`Parsing ${file.name}...`, 'info');

  const formData = new FormData();
  formData.append('file', file);

  try {
    const result = await api.upload('/contacts/parse-file', formData);

    wizardUploadedFile = file;
    wizardParsedData = result;
    wizardPreviewIndex = 0;

    // Update UI badge
    const fileLoadedCard = document.getElementById('wizard-file-loaded');
    const dropzone = document.getElementById('wizard-dropzone');
    const filenameLabel = document.getElementById('wizard-loaded-filename');
    const rowcountLabel = document.getElementById('wizard-loaded-rowcount');

    if (filenameLabel) filenameLabel.textContent = file.name;
    if (rowcountLabel) rowcountLabel.textContent = `${Number(result.totalRows).toLocaleString()} contacts detected • ${result.detectedHeaders.length} columns found`;

    if (fileLoadedCard) fileLoadedCard.style.display = 'flex';
    if (dropzone) dropzone.style.display = 'none';

    // Auto-populate campaign name if blank
    const nameInput = document.getElementById('wizard-campaign-name');
    if (nameInput && (!nameInput.value || nameInput.value.startsWith('Campaign -'))) {
      const cleanBase = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      nameInput.value = `Campaign - ${cleanBase}`;
    }

    showToast(`✅ Loaded ${result.totalRows} contacts from ${file.name}!`, 'success');

    // Update mapping section
    updateWizardMappingSection();
  } catch (err) {
    showToast(`Failed to parse file: ${err.message}`, 'error', 6000);
  }
}

async function loadExistingListSample(listId) {
  if (!listId) return;
  try {
    const res = await api.get(`/contacts/list/${listId}/sample`);
    wizardExistingListData = res;
    wizardPreviewIndex = 0;
  } catch (e) {
    console.error('Failed to load list sample:', e);
  }
}

function switchAudienceSource(source) {
  wizardSource = source;
  const btnUpload = document.getElementById('btn-src-upload');
  const btnExisting = document.getElementById('btn-src-existing');
  const uploadContainer = document.getElementById('wizard-upload-container');
  const existingContainer = document.getElementById('wizard-existing-container');

  if (source === 'upload') {
    if (btnUpload) btnUpload.classList.add('active');
    if (btnExisting) btnExisting.classList.remove('active');
    if (uploadContainer) uploadContainer.style.display = 'block';
    if (existingContainer) existingContainer.style.display = 'none';
  } else {
    if (btnUpload) btnUpload.classList.remove('active');
    if (btnExisting) btnExisting.classList.add('active');
    if (uploadContainer) uploadContainer.style.display = 'none';
    if (existingContainer) existingContainer.style.display = 'block';

    const listSelect = document.getElementById('wizard-list-select');
    if (listSelect && listSelect.value) {
      loadExistingListSample(listSelect.value).then(() => updateWizardMappingSection());
    }
  }

  updateWizardMappingSection();
}

function updateWizardMappingSection() {
  const mappingSection = document.getElementById('wizard-mapping-section');
  const mappingRows = document.getElementById('wizard-mapping-rows');
  if (!mappingSection || !mappingRows) return;

  // Determine current active headers and samples
  let headers = [];
  let sampleRows = [];

  if (wizardSource === 'upload' && wizardParsedData) {
    headers = wizardParsedData.detectedHeaders || [];
    sampleRows = wizardParsedData.sampleRows || [];
  } else if (wizardSource === 'existing' && wizardExistingListData) {
    headers = wizardExistingListData.detectedHeaders || [];
    sampleRows = wizardExistingListData.sampleContacts || [];
  }

  if (!headers.length || !wizardSelectedTemplate) {
    mappingSection.style.display = 'none';
    return;
  }

  mappingSection.style.display = 'block';

  // Extract variables from template
  const templateVars = extractTemplateVariables(
    wizardSelectedTemplate.subject || '',
    wizardSelectedTemplate.body_html || ''
  );

  // Core variables list (email is always required)
  const allVars = [
    { key: 'email', label: 'Email Address', required: true, icon: '✉️' },
    { key: 'name', label: 'Recipient Name ({{name}})', required: false, icon: '👤' },
    { key: 'company', label: 'Company ({{company}})', required: false, icon: '🏢' }
  ];

  // Add any custom tags found in template that aren't email/name/company
  templateVars.forEach(v => {
    if (!['email', 'name', 'company', 'sender_name'].includes(v)) {
      allVars.push({ key: v, label: `{{${v}}}`, required: false, icon: '🏷️' });
    }
  });

  // Auto match mappings
  wizardActiveMapping = {};
  allVars.forEach(item => {
    const matched = matchHeaderForVariable(item.key, headers);
    wizardActiveMapping[item.key] = matched;
  });

  // Render Mapping Rows
  mappingRows.innerHTML = allVars.map(item => {
    const matchedHeader = wizardActiveMapping[item.key] || '';
    const firstSampleVal = getSampleValueForRow(sampleRows[0] || {}, matchedHeader);

    return `
      <div class="mapping-row">
        <div style="display: flex; align-items: center;">
          <span class="mapping-tag-badge">
            ${item.icon} ${escapeHtml(item.label)}
          </span>
          ${item.required ? '<span style="color: var(--color-danger); margin-left: 4px; font-weight: 700;">*</span>' : ''}
        </div>
        <div>
          <select class="form-select wizard-col-select" data-var="${item.key}">
            <option value="">-- None / Use Fallback --</option>
            ${headers.map(h => `
              <option value="${escapeHtml(h)}" ${h === matchedHeader ? 'selected' : ''}>
                ${escapeHtml(h)}
              </option>
            `).join('')}
          </select>
        </div>
        <div>
          <span class="mapping-sample-badge" id="wizard-sample-badge-${item.key}">
            Sample: "${escapeHtml(firstSampleVal || '—')}"
          </span>
        </div>
      </div>
    `;
  }).join('');

  // Bind change listeners to selects
  const selects = mappingRows.querySelectorAll('.wizard-col-select');
  selects.forEach(sel => {
    sel.addEventListener('change', () => {
      const varKey = sel.getAttribute('data-var');
      const chosenCol = sel.value;
      wizardActiveMapping[varKey] = chosenCol;

      // Update sample badge
      const badge = document.getElementById(`wizard-sample-badge-${varKey}`);
      if (badge) {
        const val = getSampleValueForRow(sampleRows[wizardPreviewIndex] || sampleRows[0] || {}, chosenCol);
        badge.textContent = `Sample: "${val || '—'}"`;
      }

      renderWizardLivePreview();
    });
  });

  renderWizardLivePreview();
}

function autoMatchCurrentTemplateAndHeaders() {
  updateWizardMappingSection();
  showToast('Column auto-match refreshed!', 'success');
}

function getSampleValueForRow(row = {}, header = '') {
  if (!header || !row) return '';
  if (row[header] !== undefined) return String(row[header]);

  // If row has custom_fields
  if (row.custom_fields && typeof row.custom_fields === 'object') {
    if (row.custom_fields[header] !== undefined) return String(row.custom_fields[header]);
  }

  // Case-insensitive fallback
  for (const [k, v] of Object.entries(row)) {
    if (k.toLowerCase().trim() === header.toLowerCase().trim()) return String(v);
  }
  return '';
}

function renderWizardLivePreview() {
  const previewSubject = document.getElementById('wizard-preview-subject');
  const previewBody = document.getElementById('wizard-preview-body');
  const counterSpan = document.getElementById('wizard-preview-contact-counter');

  if (!previewSubject || !previewBody || !wizardSelectedTemplate) return;

  let sampleRows = [];
  let totalCount = 0;

  if (wizardSource === 'upload' && wizardParsedData) {
    sampleRows = wizardParsedData.sampleRows || [];
    totalCount = wizardParsedData.totalRows || 0;
  } else if (wizardSource === 'existing' && wizardExistingListData) {
    sampleRows = wizardExistingListData.sampleContacts || [];
    totalCount = wizardExistingListData.totalRows || 0;
  }

  if (!sampleRows.length) {
    previewSubject.textContent = wizardSelectedTemplate.subject || '—';
    previewBody.innerHTML = wizardSelectedTemplate.body_html || '<p style="color: var(--text-dim);">No preview available</p>';
    if (counterSpan) counterSpan.textContent = '0 contacts';
    return;
  }

  if (wizardPreviewIndex >= sampleRows.length) wizardPreviewIndex = 0;
  if (wizardPreviewIndex < 0) wizardPreviewIndex = sampleRows.length - 1;

  const rawRow = sampleRows[wizardPreviewIndex];

  // Construct standardized contact using active mapping
  const contact = {
    email: getSampleValueForRow(rawRow, wizardActiveMapping.email) || 'preview@example.com',
    name: getSampleValueForRow(rawRow, wizardActiveMapping.name) || '',
    company: getSampleValueForRow(rawRow, wizardActiveMapping.company) || '',
    custom_fields: {}
  };

  // Populate custom fields from mapping
  for (const [varKey, header] of Object.entries(wizardActiveMapping)) {
    if (!['email', 'name', 'company'].includes(varKey) && header) {
      contact.custom_fields[varKey] = getSampleValueForRow(rawRow, header);
    }
  }

  const senderName = document.getElementById('wizard-from-name')?.value || 'Alpever AI';
  const renderedSubject = interpolateTemplateString(wizardSelectedTemplate.subject || '', contact, { sender_name: senderName });
  const renderedBodyHtml = interpolateTemplateString(wizardSelectedTemplate.body_html || '', contact, { sender_name: senderName });

  previewSubject.textContent = renderedSubject || '(No subject provided)';
  previewBody.innerHTML = renderedBodyHtml || '<p style="color: var(--text-dim);">Empty template body</p>';

  if (counterSpan) {
    const contactIdentifier = contact.name ? `${contact.name} (${contact.email})` : contact.email;
    counterSpan.textContent = `Row ${wizardPreviewIndex + 1} of ${totalCount} • ${contactIdentifier}`;
  }
}

function changeWizardPreviewContact(delta) {
  let sampleRows = [];
  if (wizardSource === 'upload' && wizardParsedData) {
    sampleRows = wizardParsedData.sampleRows || [];
  } else if (wizardSource === 'existing' && wizardExistingListData) {
    sampleRows = wizardExistingListData.sampleContacts || [];
  }

  if (!sampleRows.length) return;
  wizardPreviewIndex = (wizardPreviewIndex + delta + sampleRows.length) % sampleRows.length;
  renderWizardLivePreview();
}

async function validateStep2AndProceed() {
  if (!wizardSelectedTemplate) {
    showToast('Please select a Dynamic Email Template.', 'warning');
    return;
  }

  const nextBtn = document.getElementById('btn-wizard-to-step3');

  if (wizardSource === 'upload') {
    if (!wizardUploadedFile || !wizardParsedData) {
      showToast('Please select or drag-and-drop an Excel or CSV file first.', 'warning');
      return;
    }

    if (!wizardActiveMapping.email) {
      showToast('Please map the Email Address column from your spreadsheet.', 'warning');
      return;
    }

    // Build customFields mapping object
    const customFieldsMap = {};
    for (const [k, v] of Object.entries(wizardActiveMapping)) {
      if (!['email', 'name', 'company'].includes(k) && v) {
        customFieldsMap[k] = v;
      }
    }

    const finalMapping = {
      email: wizardActiveMapping.email || null,
      name: wizardActiveMapping.name || null,
      company: wizardActiveMapping.company || null,
      customFields: customFieldsMap
    };

    const campaignName = document.getElementById('wizard-campaign-name').value.trim() || 'Mass Campaign';
    const listName = `${campaignName} Audience`;

    // Upload & Save to Database with mapping
    nextBtn.disabled = true;
    nextBtn.textContent = 'Saving Audience & Mapping...';

    try {
      const formData = new FormData();
      formData.append('file', wizardUploadedFile);
      formData.append('listName', listName);
      formData.append('mapping', JSON.stringify(finalMapping));

      const uploadResult = await api.upload('/contacts/upload', formData);
      wizardFinalListId = uploadResult.listId;
      wizardFinalListCount = uploadResult.totalImported;

      showToast(`Audience list "${listName}" saved with ${uploadResult.totalImported} contacts!`, 'success');
      setWizardStep(3);
    } catch (err) {
      showToast(`Failed to save audience: ${err.message}`, 'error', 6000);
    } finally {
      nextBtn.disabled = false;
      nextBtn.textContent = 'Next: Review & Test →';
    }
  } else {
    // Existing list
    const listSelect = document.getElementById('wizard-list-select');
    if (!listSelect || !listSelect.value) {
      showToast('Please select an existing audience list.', 'warning');
      return;
    }

    wizardFinalListId = listSelect.value;
    wizardFinalListCount = wizardExistingListData?.totalRows || 0;
    setWizardStep(3);
  }
}

function openCreateCampaignModal() {
  wizardUploadedFile = null;
  wizardParsedData = null;
  wizardExistingListData = null;
  wizardActiveMapping = {};
  wizardPreviewIndex = 0;
  wizardFinalListId = null;

  // Reset Dropzone UI
  const fileLoadedCard = document.getElementById('wizard-file-loaded');
  const dropzone = document.getElementById('wizard-dropzone');
  const mappingSection = document.getElementById('wizard-mapping-section');

  if (fileLoadedCard) fileLoadedCard.style.display = 'none';
  if (dropzone) dropzone.style.display = 'block';
  if (mappingSection) mappingSection.style.display = 'none';

  switchAudienceSource('upload');
  setupWizardDropzone();
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
  const fromName = document.getElementById('wizard-from-name').value || 'Sender';
  const fromEmail = document.getElementById('wizard-from-email').value || 'sender@example.com';

  const audienceLabel = wizardSource === 'upload'
    ? `${wizardUploadedFile ? wizardUploadedFile.name : 'Uploaded File'} (${wizardFinalListCount} contacts)`
    : (document.getElementById('wizard-list-select')?.options[document.getElementById('wizard-list-select')?.selectedIndex]?.text || 'Saved Audience');

  document.getElementById('confirm-camp-name').textContent = name;
  document.getElementById('confirm-camp-list').textContent = audienceLabel;
  document.getElementById('confirm-camp-template').textContent = wizardSelectedTemplate?.name || 'N/A';
  document.getElementById('confirm-camp-sender').textContent = `${fromName} <${fromEmail}>`;

  const countBadge = document.getElementById('confirm-camp-count');
  if (countBadge) countBadge.textContent = `${Number(wizardFinalListCount).toLocaleString()} recipients`;
}

async function sendTestEmailFromWizard() {
  const testEmail = document.getElementById('wizard-test-email').value.trim();
  const templateId = wizardSelectedTemplate ? wizardSelectedTemplate.id : null;
  const listId = wizardFinalListId;

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
    btn.textContent = 'Send Test';
  }
}

async function confirmAndLaunchCampaign() {
  const name = document.getElementById('wizard-campaign-name').value.trim();
  const list_id = wizardFinalListId;
  const template_id = wizardSelectedTemplate?.id;
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
window.handleCampaignSearch = handleCampaignSearch;
window.handleCampaignStatusFilter = handleCampaignStatusFilter;
window.handleCampaignLimitChange = handleCampaignLimitChange;
window.goToCampaignsPage = goToCampaignsPage;
window.openCreateCampaignModal = openCreateCampaignModal;
window.setWizardStep = setWizardStep;
window.switchAudienceSource = switchAudienceSource;
window.triggerWizardFileInput = triggerWizardFileInput;
window.autoMatchCurrentTemplateAndHeaders = autoMatchCurrentTemplateAndHeaders;
window.changeWizardPreviewContact = changeWizardPreviewContact;
window.validateStep2AndProceed = validateStep2AndProceed;
window.sendTestEmailFromWizard = sendTestEmailFromWizard;
window.confirmAndLaunchCampaign = confirmAndLaunchCampaign;
window.monitorActiveCampaign = monitorActiveCampaign;
window.pauseActiveCampaign = pauseActiveCampaign;
window.resumeActiveCampaign = resumeActiveCampaign;
window.cancelActiveCampaign = cancelActiveCampaign;
