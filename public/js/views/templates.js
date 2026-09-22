/**
 * Dynamic Templates View Controller & Visual WYSIWYG Studio
 */

let editingTemplateId = null;
let currentPreviewDevice = 'desktop';
let currentEditorMode = 'visual'; // 'visual' | 'code'

const sampleCustomers = [
  { name: 'Rahul Sharma', email: 'rahul.sharma@example.com', company: 'TechCorp India', custom_fields: { role: 'Head of Growth', city: 'Bengaluru', place: 'Bengaluru', discount: '25%' } },
  { name: 'Priya Patel', email: 'priya.patel@example.com', company: 'Nexus Systems', custom_fields: { role: 'CTO', city: 'Mumbai', place: 'Mumbai', discount: '30%' } },
  { name: 'Amit Verma', email: 'amit.verma@example.com', company: 'Alpha Logistics', custom_fields: { role: 'Operations Director', city: 'Delhi', place: 'Delhi', discount: '20%' } }
];

async function loadTemplatesView() {
  await loadTemplatesGrid();
  setupLivePreviewListeners();
}

async function loadTemplatesGrid() {
  const container = document.getElementById('templates-grid');
  if (!container) return;

  try {
    const templates = await api.get('/templates');
    if (!templates.length) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted); background: #ffffff; border: 1px solid var(--border-subtle); border-radius: var(--radius-lg);">
          <p>No email templates found. Click <strong>"+ New Template"</strong> to create one!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = templates.map(t => {
      const vars = t.variables || [];
      const varPills = vars.map(v => `<span class="tag-pill" style="padding: 2px 8px; font-size: 11px;">{{${escapeHtml(v)}}}</span>`).join('');

      return `
        <div class="card" style="display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px;">
              <div class="stat-icon purple" style="width: 44px; height: 44px; font-size: 20px;">✉️</div>
              <button class="btn btn-secondary btn-sm" onclick="editTemplate(${t.id})">Edit Studio</button>
            </div>
            <h3 style="font-size: 16px; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
              ${escapeHtml(t.name)}
            </h3>
            <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px; font-family: var(--font-mono);">
              Subject: ${escapeHtml(t.subject)}
            </p>
            <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px;">
              ${varPills || '<span style="font-size: 11px; color: var(--text-dim);">Static template</span>'}
            </div>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 14px; border-top: 1px solid var(--border-subtle);">
            <span style="font-size: 11px; color: var(--text-dim);">${new Date(t.created_at).toLocaleDateString()}</span>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-secondary btn-sm" onclick="quickPreviewTemplate(${t.id})">Preview</button>
              <button class="btn btn-secondary btn-sm" style="color: var(--color-danger);" onclick="deleteTemplate(${t.id})">🗑</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div style="color: var(--color-danger);">Failed to load templates: ${escapeHtml(err.message)}</div>`;
  }
}

function openTemplateEditor(template = null) {
  editingTemplateId = template ? template.id : null;
  const titleEl = document.getElementById('template-editor-title');
  if (titleEl) {
    titleEl.textContent = template ? template.name : 'New Template';
  }

  document.getElementById('tpl-input-name').value = template ? template.name : '';
  document.getElementById('tpl-input-subject').value = template ? template.subject : '';

  const initialHtml = template ? template.body_html : getDefaultStarterHtml();
  document.getElementById('tpl-input-html').value = initialHtml;

  // Set visual canvas content
  const visualEditor = document.getElementById('tpl-visual-editor');
  if (visualEditor) {
    visualEditor.innerHTML = initialHtml;
  }

  // Switch to Visual mode by default
  switchEditorMode('visual');

  navigateTo('template-studio');
  setupLivePreviewListeners();
  updateLivePreview();
}

function closeTemplateStudio() {
  navigateTo('templates');
}

async function editTemplate(id) {
  try {
    const template = await api.get(`/templates/${id}`);
    openTemplateEditor(template);
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function quickPreviewTemplate(id) {
  await editTemplate(id);
}

async function deleteTemplate(id) {
  if (!confirm('Are you sure you want to delete this template?')) return;
  try {
    await api.delete(`/templates/${id}`);
    showToast('Template deleted successfully', 'success');
    await loadTemplatesGrid();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

/**
 * Editor Mode Switcher: Visual WYSIWYG vs Raw HTML Code
 */
function switchEditorMode(mode) {
  currentEditorMode = mode;
  const visualContainer = document.getElementById('visual-editor-container');
  const codeContainer = document.getElementById('code-editor-container');
  const btnVisual = document.getElementById('btn-tab-visual');
  const btnCode = document.getElementById('btn-tab-code');
  const visualEditor = document.getElementById('tpl-visual-editor');
  const codeEditor = document.getElementById('tpl-input-html');
  const modeLabel = document.getElementById('editor-mode-label');

  if (mode === 'visual') {
    // Sync Code -> Visual
    if (codeEditor && visualEditor) {
      visualEditor.innerHTML = codeEditor.value;
    }
    if (visualContainer) visualContainer.style.display = 'block';
    if (codeContainer) codeContainer.style.display = 'none';
    if (btnVisual) btnVisual.classList.add('active');
    if (btnCode) btnCode.classList.remove('active');
    if (modeLabel) modeLabel.textContent = 'Email Content (Visual Mode):';
  } else {
    // Sync Visual -> Code
    if (visualEditor && codeEditor) {
      codeEditor.value = visualEditor.innerHTML;
    }
    if (visualContainer) visualContainer.style.display = 'none';
    if (codeContainer) codeContainer.style.display = 'block';
    if (btnVisual) btnVisual.classList.remove('active');
    if (btnCode) btnCode.classList.add('active');
    if (modeLabel) modeLabel.textContent = 'Email HTML Source Code:';
  }

  updateLivePreview();
}

/**
 * Execute Rich Text Formatting Commands
 */
function execVisualCmd(command, value = null) {
  const visualEditor = document.getElementById('tpl-visual-editor');
  if (!visualEditor) return;

  visualEditor.focus();
  document.execCommand(command, false, value);
  syncVisualToCode();
  updateLivePreview();
}

function applyBlockStyle(tag) {
  const visualEditor = document.getElementById('tpl-visual-editor');
  if (!visualEditor) return;

  visualEditor.focus();
  document.execCommand('formatBlock', false, `<${tag}>`);
  syncVisualToCode();
  updateLivePreview();
}

function insertLinkPrompt() {
  const url = prompt('Enter website link (URL):', 'https://');
  if (url && url !== 'https://') {
    execVisualCmd('createLink', url);
  }
}

function insertCtaButtonPrompt() {
  const text = prompt('Enter button text (e.g. Schedule Call / Claim Offer):', 'Schedule a Call');
  if (!text) return;

  const url = prompt('Enter button destination link (URL):', 'https://alpever.com');
  if (!url) return;

  const buttonHtml = `
    <div style="text-align: center; margin: 24px 0;">
      <a href="${escapeHtml(url)}" style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px; display: inline-block; box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);">
        ${escapeHtml(text)} &rarr;
      </a>
    </div>
  `;

  execVisualCmd('insertHTML', buttonHtml);
}

/**
 * Sync from Visual Canvas to Hidden/Code Textarea
 */
function syncVisualToCode() {
  const visualEditor = document.getElementById('tpl-visual-editor');
  const codeEditor = document.getElementById('tpl-input-html');
  if (visualEditor && codeEditor) {
    codeEditor.value = visualEditor.innerHTML;
  }
}

/**
 * Setup Real-time Keystroke Listeners
 */
function setupLivePreviewListeners() {
  const subjectInput = document.getElementById('tpl-input-subject');
  const htmlInput = document.getElementById('tpl-input-html');
  const visualEditor = document.getElementById('tpl-visual-editor');
  const sampleSelect = document.getElementById('preview-sample-select');

  // Real-time synchronization on every keystroke, spacebar, input, or paste!
  if (visualEditor) {
    ['input', 'keyup', 'change', 'paste'].forEach(evt => {
      visualEditor.addEventListener(evt, () => {
        syncVisualToCode();
        updateLivePreview();
      });
    });
  }

  if (htmlInput) {
    ['input', 'keyup', 'change', 'paste'].forEach(evt => {
      htmlInput.addEventListener(evt, () => {
        if (visualEditor && currentEditorMode === 'code') {
          visualEditor.innerHTML = htmlInput.value;
        }
        updateLivePreview();
      });
    });
  }

  const nameInput = document.getElementById('tpl-input-name');
  if (nameInput) {
    nameInput.addEventListener('input', () => {
      const titleEl = document.getElementById('template-editor-title');
      if (titleEl) {
        titleEl.textContent = nameInput.value.trim() || 'Untitled Template';
      }
    });
  }

  if (subjectInput) {
    ['input', 'keyup', 'change'].forEach(evt => {
      subjectInput.addEventListener(evt, updateLivePreview);
    });
  }

  if (sampleSelect) {
    sampleSelect.addEventListener('change', updateLivePreview);
  }
}

/**
 * Insert Dynamic Tag Pill (+ {{name}}, + {{company}}, etc.)
 */
function insertVariableTag(tag) {
  if (currentEditorMode === 'visual') {
    const visualEditor = document.getElementById('tpl-visual-editor');
    if (!visualEditor) return;

    visualEditor.focus();
    // Insert pill tag HTML or text
    const pillHtml = `<strong>${tag}</strong>&nbsp;`;
    if (!document.execCommand('insertHTML', false, pillHtml)) {
      visualEditor.innerHTML += pillHtml;
    }
    syncVisualToCode();
  } else {
    const target = document.getElementById('tpl-input-html');
    if (!target) return;
    const start = target.selectionStart || 0;
    const end = target.selectionEnd || 0;
    const text = target.value;
    target.value = text.substring(0, start) + tag + text.substring(end);
    target.focus();
    target.selectionStart = target.selectionEnd = start + tag.length;
  }

  updateLivePreview();
}

/**
 * Client-side Instant Template Interpolation (0ms Latency Live Sync)
 */
function clientInterpolate(template = '', contact = {}) {
  if (!template) return '';

  const data = {
    name: contact.name || '',
    email: contact.email || '',
    company: contact.company || ''
  };

  if (contact.custom_fields) {
    for (const [k, v] of Object.entries(contact.custom_fields)) {
      data[k.toLowerCase().trim()] = v;
      data[k.toLowerCase().replace(/[\s_-]+/g, '')] = v;
    }
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

/**
 * Update Live Preview Pane Instantly
 */
function updateLivePreview() {
  const subjectInput = document.getElementById('tpl-input-subject');
  const codeEditor = document.getElementById('tpl-input-html');
  const visualEditor = document.getElementById('tpl-visual-editor');
  const sampleSelect = document.getElementById('preview-sample-select');

  const subject = subjectInput ? subjectInput.value : '';
  let content = '';

  if (currentEditorMode === 'visual' && visualEditor) {
    content = visualEditor.innerHTML;
  } else if (codeEditor) {
    content = codeEditor.value;
  }

  const sampleIndex = sampleSelect ? parseInt(sampleSelect.value || '0', 10) : 0;
  const sampleContact = sampleCustomers[sampleIndex] || sampleCustomers[0];

  // Perform client-side instant interpolation
  const renderedSubject = clientInterpolate(subject, sampleContact);
  const renderedBody = clientInterpolate(content, sampleContact);

  // Update Envelope Subject and Recipient with crisp contrast
  const previewSubject = document.getElementById('preview-envelope-subject');
  const previewTo = document.getElementById('preview-envelope-to');

  if (previewSubject) {
    previewSubject.textContent = renderedSubject || '(No subject provided)';
  }
  if (previewTo) {
    previewTo.textContent = `${sampleContact.name} <${sampleContact.email}>`;
  }
  const previewAvatar = document.getElementById('preview-avatar');
  if (previewAvatar && sampleContact && sampleContact.name) {
    const initials = sampleContact.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    previewAvatar.textContent = initials;
  }

  // Wrap in responsive clean email styling so plain text or visual HTML looks gorgeous
  const fullHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <style>
        * { box-sizing: border-box; }
        body {
          margin: 0;
          padding: 24px 20px;
          background-color: #ffffff;
          color: #1e293b;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          font-size: 15px;
          line-height: 1.65;
          word-break: break-word;
        }
        p { margin: 0 0 16px 0; }
        p:last-child { margin-bottom: 0; }
        h1, h2, h3 { color: #0f172a; margin: 20px 0 10px 0; font-weight: 700; line-height: 1.3; }
        h1:first-child, h2:first-child, h3:first-child { margin-top: 0; }
        a { color: #f97316; }
        hr { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
        ul, ol { margin: 0 0 16px 0; padding-left: 24px; }
        li { margin-bottom: 6px; }
        blockquote {
          border-left: 4px solid #f97316;
          background: #f8fafc;
          padding: 12px 18px;
          margin: 18px 0;
          border-radius: 6px;
          color: #334155;
        }
      </style>
    </head>
    <body>
      ${renderedBody || '<p style="color: #94a3b8; font-style: italic;">Start typing in the editor on the left to see your live email preview...</p>'}
    </body>
    </html>
  `;

  const iframe = document.getElementById('template-preview-frame');
  if (iframe) {
    iframe.srcdoc = fullHtml;
  }
}

function setPreviewDevice(device) {
  currentPreviewDevice = device;
  const wrapper = document.getElementById('preview-frame-wrapper');
  const desktopBtn = document.getElementById('btn-preview-desktop');
  const mobileBtn = document.getElementById('btn-preview-mobile');

  if (device === 'mobile') {
    wrapper.classList.add('mobile-mode');
    desktopBtn.classList.remove('active');
    mobileBtn.classList.add('active');
  } else {
    wrapper.classList.remove('mobile-mode');
    desktopBtn.classList.add('active');
    mobileBtn.classList.remove('active');
  }
}

async function saveTemplateFromStudio() {
  const name = document.getElementById('tpl-input-name').value.trim();
  const subject = document.getElementById('tpl-input-subject').value.trim();

  // Sync visual editor if in visual mode
  if (currentEditorMode === 'visual') {
    syncVisualToCode();
  }

  const body_html = document.getElementById('tpl-input-html').value.trim();

  if (!name || !subject || !body_html) {
    showToast('Please provide Template Name, Subject, and Email Content', 'warning');
    return;
  }

  try {
    if (editingTemplateId) {
      await api.put(`/templates/${editingTemplateId}`, { name, subject, body_html });
      showToast('Template updated successfully!', 'success');
    } else {
      await api.post('/templates', { name, subject, body_html });
      showToast('Template created successfully!', 'success');
    }

    closeTemplateStudio();
    await loadTemplatesGrid();
    if (window.loadDashboardView) window.loadDashboardView();
  } catch (err) {
    showToast(`Failed to save template: ${err.message}`, 'error');
  }
}

function getDefaultStarterHtml() {
  return `<p>Hi <strong>{{name}}</strong>,</p>
<p>I came across your work at <strong>{{company | "your company"}}</strong> and wanted to reach out directly. We've been helping teams in your industry streamline customer communications and scale outreach.</p>
<blockquote>"We'd love to share how teams are driving 3x higher reply rates with personalized communication."</blockquote>
<p>Would you be open to a quick 5-minute chat this week?</p>
<div style="text-align: center; margin: 24px 0;">
  <a href="https://alpever.com" style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px; display: inline-block;">
    Schedule a Quick Call &rarr;
  </a>
</div>
<hr/>
<p style="font-size: 12px; color: #94a3b8;">
  Best regards,<br/>
  <strong>Alpever AI Team</strong>
</p>`;
}

function promptCustomVariableTag() {
  const tagName = prompt('Enter your Excel/CSV column header name (e.g. place, discount, plan, invoice):', 'place');
  if (!tagName) return;
  const cleanTag = tagName.trim().replace(/[{}]/g, '');
  if (!cleanTag) return;

  const tag = `{{${cleanTag}}}`;

  // Add pill to toolbar if not already present
  const wrap = document.getElementById('tag-pills-wrap');
  if (wrap) {
    const newPill = document.createElement('span');
    newPill.className = 'tag-pill';
    newPill.textContent = `+ ${tag}`;
    newPill.onclick = () => insertVariableTag(tag);
    wrap.insertBefore(newPill, wrap.lastElementChild);
  }

  insertVariableTag(tag);
}

window.loadTemplatesView = loadTemplatesView;
window.openTemplateEditor = openTemplateEditor;
window.closeTemplateStudio = closeTemplateStudio;
window.setupLivePreviewListeners = setupLivePreviewListeners;
window.editTemplate = editTemplate;
window.quickPreviewTemplate = quickPreviewTemplate;
window.deleteTemplate = deleteTemplate;
window.insertVariableTag = insertVariableTag;
window.setPreviewDevice = setPreviewDevice;
window.saveTemplateFromStudio = saveTemplateFromStudio;
window.updateLivePreview = updateLivePreview;
window.switchEditorMode = switchEditorMode;
window.execVisualCmd = execVisualCmd;
window.applyBlockStyle = applyBlockStyle;
window.insertLinkPrompt = insertLinkPrompt;
window.insertCtaButtonPrompt = insertCtaButtonPrompt;
window.promptCustomVariableTag = promptCustomVariableTag;
