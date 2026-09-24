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
  initImageResizerSystem();
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
  initImageResizerSystem();
  updateLivePreview();
}

function closeTemplateStudio() {
  if (typeof deselectImage === 'function') deselectImage();
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
  if (typeof deselectImage === 'function') deselectImage();
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
 * Caret & Selection Persistence for Visual Editor
 * Ensures images, CTA buttons, and tags insert EXACTLY where the user clicked!
 */
let savedVisualEditorRange = null;
let lastClickedEditorBlock = null;
let lastRecordedTarget = null;

function updateCaretTracking(e) {
  const visualEditor = document.getElementById('tpl-visual-editor');
  if (!visualEditor) return;

  // 1. If clicked or interacted with a specific child inside visualEditor
  if (e && e.target && visualEditor.contains(e.target) && e.target !== visualEditor) {
    let el = e.target;
    while (el && el.parentElement && el.parentElement !== visualEditor && el.parentElement.tagName !== 'DIV') {
      el = el.parentElement;
    }
    lastRecordedTarget = el;
    lastClickedEditorBlock = el;
  } else if (e && e.target === visualEditor) {
    // 2. Clicked in the blank area of visualEditor!
    const children = Array.from(visualEditor.children).filter(c => 
      !c.classList.contains('image-resizer-overlay') && c.tagName !== 'SCRIPT' && c.tagName !== 'STYLE'
    );
    
    if (children.length > 0) {
      if (e.clientY) {
        let targetChild = children[children.length - 1]; // default to last child
        for (let i = 0; i < children.length; i++) {
          const rect = children[i].getBoundingClientRect();
          if (e.clientY < rect.top) {
            targetChild = i > 0 ? children[i - 1] : children[0];
            break;
          }
        }
        lastRecordedTarget = targetChild;
        lastClickedEditorBlock = targetChild;
      } else {
        lastRecordedTarget = children[children.length - 1];
        lastClickedEditorBlock = children[children.length - 1];
      }
    }
  }

  saveVisualEditorCaret();
}

function saveVisualEditorCaret() {
  const visualEditor = document.getElementById('tpl-visual-editor');
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && visualEditor) {
    const range = sel.getRangeAt(0);
    if (visualEditor.contains(range.commonAncestorContainer) || range.commonAncestorContainer === visualEditor) {
      savedVisualEditorRange = range.cloneRange();
      let node = range.startContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
      if (node && visualEditor.contains(node) && node !== visualEditor) {
        lastClickedEditorBlock = node;
        lastRecordedTarget = node;
      }
    }
  }
}

function restoreVisualEditorCaret() {
  const visualEditor = document.getElementById('tpl-visual-editor');
  if (!visualEditor) return false;

  if (savedVisualEditorRange) {
    try {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedVisualEditorRange);
      return true;
    } catch (e) {
      console.warn('Could not restore caret range:', e);
    }
  }
  return false;
}

/**
 * Inserts an image block at the exact position clicked by the user
 */
function insertImageAtUserPosition(imgElement, alignContainerStyle) {
  const visualEditor = document.getElementById('tpl-visual-editor');
  if (!visualEditor) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'email-image-block';
  wrapper.style.cssText = alignContainerStyle;
  wrapper.appendChild(imgElement);

  const spacerP = document.createElement('p');
  spacerP.innerHTML = '<br/>';

  let inserted = false;

  // 1. Try splitting at exact savedVisualEditorRange (ONLY if inside an actual child element, NOT visualEditor root!)
  if (savedVisualEditorRange) {
    try {
      const range = savedVisualEditorRange;
      const container = range.startContainer;

      // CRITICAL: If container IS visualEditor itself (empty space clicked), DO NOT use range.insertNode at offset 0!
      if (container && container !== visualEditor && visualEditor.contains(container)) {
        let parentEl = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;

        // Find enclosing block (P, DIV, H1-H6, BLOCKQUOTE, etc.)
        let enclosingBlock = parentEl;
        while (enclosingBlock && enclosingBlock.parentNode && enclosingBlock.parentNode !== visualEditor && enclosingBlock.tagName !== 'DIV' && enclosingBlock.tagName !== 'P' && !/^H[1-6]$/.test(enclosingBlock.tagName)) {
          enclosingBlock = enclosingBlock.parentElement;
        }

        if (enclosingBlock && enclosingBlock !== visualEditor && visualEditor.contains(enclosingBlock)) {
          const textLength = enclosingBlock.textContent ? enclosingBlock.textContent.length : 0;
          const isAtEnd = (container.nodeType === Node.TEXT_NODE && range.startOffset >= (container.length || 0)) ||
                          (range.startOffset >= textLength);

          if (isAtEnd) {
            // Cursor is at end of the block - insert right after it!
            enclosingBlock.parentNode.insertBefore(wrapper, enclosingBlock.nextSibling);
            enclosingBlock.parentNode.insertBefore(spacerP, wrapper.nextSibling);
            inserted = true;
          } else {
            // Cursor is in the middle - split block at range!
            try {
              const endRange = document.createRange();
              endRange.setStart(range.startContainer, range.startOffset);
              endRange.setEndAfter(enclosingBlock.lastChild || enclosingBlock);

              const extractedFrag = endRange.extractContents();

              enclosingBlock.parentNode.insertBefore(wrapper, enclosingBlock.nextSibling);

              const afterBlock = document.createElement(enclosingBlock.tagName || 'p');
              if (enclosingBlock.style.cssText) afterBlock.style.cssText = enclosingBlock.style.cssText;
              if (extractedFrag && extractedFrag.childNodes.length > 0) {
                afterBlock.appendChild(extractedFrag);
              } else {
                afterBlock.innerHTML = '<br/>';
              }

              wrapper.parentNode.insertBefore(afterBlock, wrapper.nextSibling);
              inserted = true;
            } catch (splitErr) {
              enclosingBlock.parentNode.insertBefore(wrapper, enclosingBlock.nextSibling);
              enclosingBlock.parentNode.insertBefore(spacerP, wrapper.nextSibling);
              inserted = true;
            }
          }
        }
      }
    } catch (err) {
      console.warn('Range insertion error:', err);
    }
  }

  // 2. Fallback to lastRecordedTarget or lastClickedEditorBlock (inserts right after that element)
  const targetNode = lastRecordedTarget || lastClickedEditorBlock;
  if (!inserted && targetNode && visualEditor.contains(targetNode) && targetNode !== visualEditor) {
    let block = targetNode;
    while (block.parentNode && block.parentNode !== visualEditor && block.parentNode.tagName !== 'DIV') {
      block = block.parentNode;
    }
    if (block && block.parentNode) {
      block.parentNode.insertBefore(wrapper, block.nextSibling);
      block.parentNode.insertBefore(spacerP, wrapper.nextSibling);
      inserted = true;
    }
  }

  // 3. Absolute fallback: append to the end of the email content (NEVER at the top!)
  if (!inserted) {
    const targetParent = (visualEditor.firstElementChild && visualEditor.firstElementChild.tagName === 'DIV' && !visualEditor.firstElementChild.classList.contains('email-image-block'))
      ? visualEditor.firstElementChild
      : visualEditor;

    targetParent.appendChild(wrapper);
    targetParent.appendChild(spacerP);
    inserted = true;
  }

  // Set the newly inserted wrapper as the active position
  lastRecordedTarget = wrapper;
  lastClickedEditorBlock = wrapper;

  syncVisualToCode();
  updateLivePreview();
}

function insertHtmlAtCaret(html) {
  const visualEditor = document.getElementById('tpl-visual-editor');
  if (!visualEditor) return;

  restoreVisualEditorCaret();

  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    if (visualEditor.contains(range.commonAncestorContainer) || range.commonAncestorContainer === visualEditor) {
      const success = document.execCommand('insertHTML', false, html);
      if (!success) {
        range.deleteContents();
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        const frag = document.createDocumentFragment();
        let node, lastNode;
        while ((node = tempDiv.firstChild)) {
          lastNode = frag.appendChild(node);
        }
        range.insertNode(frag);
        if (lastNode) {
          range.setStartAfter(lastNode);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
      saveVisualEditorCaret();
      return;
    }
  }

  // Fallback
  visualEditor.focus();
  document.execCommand('insertHTML', false, html);
  saveVisualEditorCaret();
}

/**
 * Execute Rich Text Formatting Commands
 */
function execVisualCmd(command, value = null) {
  const visualEditor = document.getElementById('tpl-visual-editor');
  if (!visualEditor) return;

  restoreVisualEditorCaret();
  visualEditor.focus();
  document.execCommand(command, false, value);
  saveVisualEditorCaret();
  syncVisualToCode();
  updateLivePreview();
}

function applyBlockStyle(tag) {
  const visualEditor = document.getElementById('tpl-visual-editor');
  if (!visualEditor) return;

  restoreVisualEditorCaret();
  visualEditor.focus();
  document.execCommand('formatBlock', false, `<${tag}>`);
  saveVisualEditorCaret();
  syncVisualToCode();
  updateLivePreview();
}

function insertLinkPrompt() {
  saveVisualEditorCaret();
  const url = prompt('Enter website link (URL):', 'https://');
  if (url && url !== 'https://') {
    restoreVisualEditorCaret();
    execVisualCmd('createLink', url);
  }
}

function insertCtaButtonPrompt() {
  saveVisualEditorCaret();
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

  insertHtmlAtCaret(buttonHtml);
  syncVisualToCode();
  updateLivePreview();
}

/**
 * Sync from Visual Canvas to Hidden/Code Textarea
 */
function syncVisualToCode() {
  const visualEditor = document.getElementById('tpl-visual-editor');
  const codeEditor = document.getElementById('tpl-input-html');
  if (visualEditor && codeEditor) {
    // Ensure all cropped/sized images have their exact aspect-ratio persisted for email clients
    visualEditor.querySelectorAll('img').forEach(img => {
      if (img.style.objectFit === 'cover' || (img.style.height && img.style.height !== 'auto')) {
        const w = Math.round(parseFloat(img.style.width) || img.getBoundingClientRect().width);
        const h = Math.round(parseFloat(img.style.height) || img.getBoundingClientRect().height);
        if (w > 0 && h > 0) {
          img.style.aspectRatio = `${w} / ${h}`;
          if (!img.getAttribute('width')) img.setAttribute('width', w);
          if (!img.getAttribute('height')) img.setAttribute('height', h);
        }
      }
    });

    let cleanHtml = visualEditor.innerHTML;
    cleanHtml = cleanHtml.replace(/\s*class="selected-img"/g, '');
    codeEditor.value = cleanHtml;
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
    ['click', 'mouseup', 'keyup', 'focus', 'input', 'select', 'touchend'].forEach(evt => {
      visualEditor.addEventListener(evt, updateCaretTracking);
    });

    document.addEventListener('selectionchange', () => {
      saveVisualEditorCaret();
    });

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

    const pillHtml = `<strong>${tag}</strong>&nbsp;`;
    insertHtmlAtCaret(pillHtml);
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
  let renderedBody = clientInterpolate(content, sampleContact);

  // Preserve identical crop frame aspect ratio and positioning across both Desktop and Mobile previews
  renderedBody = renderedBody.replace(/<img\b([^>]*?)>/gi, (match, attrs) => {
    if (/aspect-ratio\s*:/i.test(attrs)) return match;
    const widthMatch = attrs.match(/style=["'][^"']*?\bwidth:\s*(\d+(?:\.\d+)?)(px)?/i) || attrs.match(/\bwidth=["']?(\d+)/i);
    const heightMatch = attrs.match(/style=["'][^"']*?\bheight:\s*(\d+(?:\.\d+)?)(px)?/i) || attrs.match(/\bheight=["']?(\d+)/i);
    if (widthMatch && heightMatch) {
      const w = Math.round(parseFloat(widthMatch[1]));
      const h = Math.round(parseFloat(heightMatch[1]));
      if (w > 0 && h > 0) {
        if (/style=["']/i.test(attrs)) {
          return `<img ${attrs.replace(/style=(["'])/i, `style=$1aspect-ratio: ${w} / ${h}; `)}>`;
        } else {
          return `<img style="aspect-ratio: ${w} / ${h};" ${attrs}>`;
        }
      }
    }
    return match;
  });

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
        img {
          max-width: 100%;
        }
        img[style*="object-fit"] {
          max-width: 100%;
          height: auto !important;
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
  updateLivePreview();
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

/**
 * ========================================================
 * Image Upload & Interactive Resizing System for Studio
 * ========================================================
 */
let activeSelectedImage = null;
let isResizingImage = false;
let isPositioningImage = false;
let selectedImageFile = null;
let currentImageModalTab = 'upload';
let imageSystemInitialized = false;
let isAspectRatioLocked = false;

/**
 * Computes whether the image is cropped inside its frame under object-fit: cover,
 * and the available excess pixels horizontally and vertically.
 */
function getImageCropData(img) {
  if (!img) return null;
  const natW = img.naturalWidth || parseFloat(img.getAttribute('width')) || img.clientWidth;
  const natH = img.naturalHeight || parseFloat(img.getAttribute('height')) || img.clientHeight;
  const rect = img.getBoundingClientRect();
  const frameW = rect.width;
  const frameH = rect.height;

  if (!natW || !natH || frameW <= 0 || frameH <= 0) return null;

  // Uniform scale factor under object-fit: cover
  const scale = Math.max(frameW / natW, frameH / natH);
  const renderedW = natW * scale;
  const renderedH = natH * scale;

  const excessX = Math.max(0, renderedW - frameW);
  const excessY = Math.max(0, renderedH - frameH);
  const isCropped = (excessX >= 1 || excessY >= 1);

  return {
    natW,
    natH,
    frameW,
    frameH,
    renderedW,
    renderedH,
    excessX,
    excessY,
    isCropped
  };
}

/**
 * Extracts current object-position coordinates (in percentages: 0 to 100)
 */
function getCurrentImageObjectPosition(img) {
  const defaultPos = { x: 50, y: 50 };
  if (!img) return defaultPos;

  const raw = (img.style.objectPosition || '').trim();
  if (!raw) return defaultPos;

  const parts = raw.split(/\s+/);
  if (parts.length === 0) return defaultPos;

  function parsePart(part, axis) {
    if (!part) return 50;
    const lower = part.toLowerCase();
    if (lower === 'center') return 50;
    if (lower === 'left' || lower === 'top') return 0;
    if (lower === 'right' || lower === 'bottom') return 100;
    if (lower.endsWith('%')) {
      const num = parseFloat(lower);
      return isNaN(num) ? 50 : Math.max(0, Math.min(100, num));
    }
    if (lower.endsWith('px')) {
      const px = parseFloat(lower);
      const crop = getImageCropData(img);
      const excess = crop ? (axis === 'x' ? crop.excessX : crop.excessY) : 0;
      if (excess > 0) {
        return Math.max(0, Math.min(100, (-px / excess) * 100));
      }
      return 50;
    }
    const num = parseFloat(lower);
    return isNaN(num) ? 50 : Math.max(0, Math.min(100, num));
  }

  const posX = parsePart(parts[0], 'x');
  const posY = parts.length > 1 ? parsePart(parts[1], 'y') : 50;
  return { x: posX, y: posY };
}

function openImageModal() {
  saveVisualEditorCaret();
  selectedImageFile = null;
  currentImageModalTab = 'upload';

  const fileInput = document.getElementById('img-file-input');
  if (fileInput) fileInput.value = '';
  const urlInput = document.getElementById('img-url-input');
  if (urlInput) urlInput.value = '';
  const altInput = document.getElementById('img-modal-alt');
  if (altInput) altInput.value = '';
  const linkInput = document.getElementById('img-modal-link');
  if (linkInput) linkInput.value = '';

  const previewCard = document.getElementById('img-file-preview-card');
  if (previewCard) previewCard.style.display = 'none';
  const urlPreview = document.getElementById('img-url-preview-wrap');
  if (urlPreview) urlPreview.style.display = 'none';
  const dropzone = document.getElementById('img-upload-dropzone');
  if (dropzone) dropzone.style.display = 'block';

  switchImageModalTab('upload');
  openModal('modal-insert-image');
}

function closeImageModal() {
  closeModal('modal-insert-image');
  selectedImageFile = null;
}

function switchImageModalTab(tab) {
  currentImageModalTab = tab;
  const tabBtnUpload = document.getElementById('tab-btn-img-upload');
  const tabBtnUrl = document.getElementById('tab-btn-img-url');
  const paneUpload = document.getElementById('pane-img-upload');
  const paneUrl = document.getElementById('pane-img-url');

  if (tab === 'upload') {
    if (tabBtnUpload) tabBtnUpload.classList.add('active');
    if (tabBtnUrl) tabBtnUrl.classList.remove('active');
    if (paneUpload) paneUpload.style.display = 'block';
    if (paneUrl) paneUrl.style.display = 'none';
  } else {
    if (tabBtnUpload) tabBtnUpload.classList.remove('active');
    if (tabBtnUrl) tabBtnUrl.classList.add('active');
    if (paneUpload) paneUpload.style.display = 'none';
    if (paneUrl) paneUrl.style.display = 'block';
  }
}

function handleImageFileSelected(file) {
  if (!file) return;
  if (!file.type || !file.type.startsWith('image/')) {
    showToast('Please select a valid image file (PNG, JPG, WebP, GIF, SVG)', 'warning');
    return;
  }

  selectedImageFile = file;

  const previewCard = document.getElementById('img-file-preview-card');
  const previewThumb = document.getElementById('img-file-preview-thumb');
  const fileName = document.getElementById('img-file-name');
  const fileMeta = document.getElementById('img-file-meta');
  const dropzone = document.getElementById('img-upload-dropzone');

  if (fileName) fileName.textContent = file.name;
  if (fileMeta) fileMeta.textContent = `${(file.size / 1024).toFixed(1)} KB • ${file.type}`;

  const reader = new FileReader();
  reader.onload = (e) => {
    if (previewThumb) previewThumb.src = e.target.result;
    if (previewCard) previewCard.style.display = 'block';
    if (dropzone) dropzone.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function clearImageUploadSelection() {
  selectedImageFile = null;
  const fileInput = document.getElementById('img-file-input');
  if (fileInput) fileInput.value = '';
  const previewCard = document.getElementById('img-file-preview-card');
  if (previewCard) previewCard.style.display = 'none';
  const dropzone = document.getElementById('img-upload-dropzone');
  if (dropzone) dropzone.style.display = 'block';
}

function handleImageUrlInput(url) {
  const previewWrap = document.getElementById('img-url-preview-wrap');
  const previewThumb = document.getElementById('img-url-preview-thumb');
  const cleanUrl = (url || '').trim();

  if (cleanUrl.match(/^https?:\/\/.+/i) || cleanUrl.startsWith('data:image')) {
    if (previewThumb) previewThumb.src = cleanUrl;
    if (previewWrap) previewWrap.style.display = 'block';
  } else {
    if (previewWrap) previewWrap.style.display = 'none';
  }
}

async function submitInsertImage() {
  const submitBtn = document.getElementById('btn-insert-image-submit');
  const alt = (document.getElementById('img-modal-alt')?.value || '').trim();
  const link = (document.getElementById('img-modal-link')?.value || '').trim();
  const widthSelect = document.getElementById('img-modal-width-select')?.value || '50%';
  const align = document.getElementById('img-modal-align-select')?.value || 'center';

  let finalImageUrl = '';

  if (currentImageModalTab === 'upload') {
    if (!selectedImageFile) {
      showToast('Please select or drop an image file first!', 'warning');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Uploading...';
    }

    try {
      const formData = new FormData();
      formData.append('image', selectedImageFile);

      const res = await fetch('/api/templates/upload-image', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to upload image to server');
      }

      finalImageUrl = data.url;
    } catch (uploadErr) {
      console.warn('Server upload failed, falling back to embedded data URL:', uploadErr);
      finalImageUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(selectedImageFile);
      });
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Insert Image →';
      }
    }
  } else {
    finalImageUrl = (document.getElementById('img-url-input')?.value || '').trim();
    if (!finalImageUrl) {
      showToast('Please enter an image URL!', 'warning');
      return;
    }
  }

  insertImageToEditor({
    url: finalImageUrl,
    alt,
    width: widthSelect,
    align,
    link
  });

  closeImageModal();
  showToast('Image inserted successfully!', 'success');
}

function insertImageToEditor({ url, alt = '', width = '50%', align = 'center', link = '' }) {
  const visualEditor = document.getElementById('tpl-visual-editor');
  if (!visualEditor) return;

  visualEditor.focus();

  let widthStyle = 'width: 50%; max-width: 100%;';
  let attrWidth = '400';
  if (width === '100%') {
    widthStyle = 'width: 100%; max-width: 100%;';
    attrWidth = '600';
  } else if (width === '75%') {
    widthStyle = 'width: 75%; max-width: 100%;';
    attrWidth = '500';
  } else if (width === '50%') {
    widthStyle = 'width: 50%; max-width: 100%;';
    attrWidth = '400';
  } else if (width === '25%') {
    widthStyle = 'width: 25%; max-width: 100%;';
    attrWidth = '200';
  } else if (width === 'custom') {
    widthStyle = 'width: 400px; max-width: 100%;';
    attrWidth = '400';
  }

  let alignContainerStyle = 'text-align: center; margin: 18px 0;';
  let imgMarginStyle = 'margin: 0 auto; display: block;';
  if (align === 'left') {
    alignContainerStyle = 'text-align: left; margin: 18px 0;';
    imgMarginStyle = 'margin: 0 auto 0 0; display: block;';
  } else if (align === 'right') {
    alignContainerStyle = 'text-align: right; margin: 18px 0;';
    imgMarginStyle = 'margin: 0 0 0 auto; display: block;';
  }

  const escapedUrl = escapeHtml(url);
  const escapedAlt = escapeHtml(alt);

  const img = document.createElement('img');
  img.src = escapedUrl;
  img.alt = escapedAlt;
  img.setAttribute('width', attrWidth);
  img.style.cssText = `${widthStyle} height: auto; ${imgMarginStyle} border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);`;

  let insertElem = img;
  if (link && link.trim()) {
    const a = document.createElement('a');
    a.href = escapeHtml(link.trim());
    a.target = '_blank';
    a.style.cssText = 'text-decoration: none; display: inline-block;';
    a.appendChild(img);
    insertElem = a;
  }

  insertImageAtUserPosition(insertElem, alignContainerStyle);

  setTimeout(() => {
    selectImageForResize(img);
  }, 60);
}

function selectImageForResize(img) {
  if (!img) return;
  activeSelectedImage = img;

  const visualEditor = document.getElementById('tpl-visual-editor');
  if (visualEditor) {
    visualEditor.querySelectorAll('img').forEach(el => el.classList.remove('selected-img'));
  }
  img.classList.add('selected-img');

  const overlay = document.getElementById('image-resizer-overlay');
  if (overlay) {
    overlay.style.display = 'block';
  }

  updateResizerOverlayPosition();
  updateFloatingToolbarValues();
}

function deselectImage() {
  if (activeSelectedImage) {
    activeSelectedImage.classList.remove('selected-img');
    activeSelectedImage.style.cursor = '';
    activeSelectedImage = null;
  }
  isPositioningImage = false;
  document.body.style.cursor = '';
  const overlay = document.getElementById('image-resizer-overlay');
  if (overlay) {
    overlay.style.display = 'none';
    overlay.classList.remove('is-cropped', 'is-positioning');
    overlay.style.pointerEvents = 'none';
    overlay.removeAttribute('title');
  }
}

function updateResizerOverlayPosition() {
  if (!activeSelectedImage || !activeSelectedImage.isConnected) {
    deselectImage();
    return;
  }

  const overlay = document.getElementById('image-resizer-overlay');
  const container = document.getElementById('visual-editor-container');
  if (!overlay || !container) return;

  const imgRect = activeSelectedImage.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  const top = imgRect.top - containerRect.top;
  const left = imgRect.left - containerRect.left;

  overlay.style.top = `${top}px`;
  overlay.style.left = `${left}px`;
  overlay.style.width = `${imgRect.width}px`;
  overlay.style.height = `${imgRect.height}px`;

  const badge = document.getElementById('image-dimension-badge');
  if (badge) {
    badge.textContent = `${Math.round(imgRect.width)} × ${Math.round(imgRect.height)} px`;
  }

  // Update in-frame position dragging state & cursor
  const crop = getImageCropData(activeSelectedImage);
  if (crop && crop.isCropped) {
    overlay.classList.add('is-cropped');
    overlay.style.pointerEvents = 'auto';
    overlay.style.cursor = isPositioningImage ? 'grabbing' : 'grab';
    overlay.setAttribute('title', 'Drag to reposition image inside frame');
  } else {
    overlay.classList.remove('is-cropped');
    if (!isPositioningImage) {
      overlay.style.pointerEvents = 'none';
      overlay.style.cursor = 'default';
      overlay.removeAttribute('title');
    }
  }
}

function updateFloatingToolbarValues() {
  if (!activeSelectedImage) return;

  const imgRect = activeSelectedImage.getBoundingClientRect();
  const widthInput = document.getElementById('img-custom-width-input');
  if (widthInput) {
    widthInput.value = Math.round(imgRect.width);
  }

  const heightInput = document.getElementById('img-custom-height-input');
  if (heightInput) {
    if (activeSelectedImage.style.height && activeSelectedImage.style.height !== 'auto') {
      heightInput.value = Math.round(imgRect.height);
    } else {
      heightInput.value = '';
      heightInput.placeholder = `${Math.round(imgRect.height)} (auto)`;
    }
  }

  const btnAutoH = document.getElementById('btn-img-auto-height');
  if (btnAutoH) {
    const isAuto = !activeSelectedImage.style.height || activeSelectedImage.style.height === 'auto';
    btnAutoH.classList.toggle('active', isAuto);
  }

  const btnLock = document.getElementById('btn-img-ratio-lock');
  if (btnLock) {
    btnLock.textContent = isAspectRatioLocked ? '🔒 Lock' : '🔓 Free';
    btnLock.classList.toggle('active', isAspectRatioLocked);
  }

  const btnLeft = document.getElementById('btn-img-align-left');
  const btnCenter = document.getElementById('btn-img-align-center');
  const btnRight = document.getElementById('btn-img-align-right');

  [btnLeft, btnCenter, btnRight].forEach(b => b?.classList.remove('active'));

  const parent = activeSelectedImage.parentElement;
  const grandParent = parent?.parentElement;
  const textAlign = (parent?.style?.textAlign || grandParent?.style?.textAlign || '').toLowerCase();
  const margin = activeSelectedImage.style.margin || '';

  if (textAlign === 'left' || activeSelectedImage.style.marginLeft === '0px' || margin.includes('0 auto 0 0')) {
    btnLeft?.classList.add('active');
  } else if (textAlign === 'right' || activeSelectedImage.style.marginRight === '0px' || margin.includes('0 0 0 auto')) {
    btnRight?.classList.add('active');
  } else {
    btnCenter?.classList.add('active');
  }
}

function toggleAspectRatioLock() {
  isAspectRatioLocked = !isAspectRatioLocked;
  const btn = document.getElementById('btn-img-ratio-lock');
  if (btn) {
    btn.textContent = isAspectRatioLocked ? '🔒 Lock' : '🔓 Free';
    btn.classList.toggle('active', isAspectRatioLocked);
  }
  showToast(isAspectRatioLocked ? 'Aspect Ratio Locked (Proportional)' : 'Aspect Ratio Unlocked (Free Resize)', 'info');
}

function setImagePresetWidth(preset) {
  if (!activeSelectedImage) return;

  activeSelectedImage.style.width = preset;
  activeSelectedImage.style.maxWidth = '100%';

  const visualEditor = document.getElementById('tpl-visual-editor');
  const canvasWidth = visualEditor ? visualEditor.clientWidth - 72 : 600;
  const approxPx = Math.round(canvasWidth * (parseInt(preset, 10) / 100));
  activeSelectedImage.setAttribute('width', approxPx);

  // If height was not explicitly fixed, keep it auto, otherwise preserve banner height
  if (!activeSelectedImage.style.height) {
    activeSelectedImage.style.height = 'auto';
  }

  updateResizerOverlayPosition();
  updateFloatingToolbarValues();
  syncVisualToCode();
  updateLivePreview();
}

function setImagePixelWidth(val) {
  if (!activeSelectedImage) return;
  const px = parseInt(val, 10);
  if (isNaN(px) || px < 30) return;

  activeSelectedImage.style.width = `${px}px`;
  activeSelectedImage.style.maxWidth = '100%';
  activeSelectedImage.setAttribute('width', px);

  const curH = parseFloat(activeSelectedImage.style.height) || (activeSelectedImage.style.objectFit === 'cover' ? activeSelectedImage.getBoundingClientRect().height : 0);
  if (curH > 0 && px > 0) {
    activeSelectedImage.style.aspectRatio = `${px} / ${Math.round(curH)}`;
  }

  updateResizerOverlayPosition();
  updateFloatingToolbarValues();
  syncVisualToCode();
  updateLivePreview();
}

function setImagePixelHeight(val) {
  if (!activeSelectedImage) return;
  const px = parseInt(val, 10);
  if (isNaN(px) || px < 20) return;

  activeSelectedImage.style.height = `${px}px`;
  activeSelectedImage.setAttribute('height', px);
  activeSelectedImage.style.objectFit = 'cover';

  const curW = parseFloat(activeSelectedImage.style.width) || activeSelectedImage.getBoundingClientRect().width;
  if (curW > 0 && px > 0) {
    activeSelectedImage.style.aspectRatio = `${Math.round(curW)} / ${px}`;
  }

  updateResizerOverlayPosition();
  updateFloatingToolbarValues();
  syncVisualToCode();
  updateLivePreview();
}

function resetImageHeightAuto() {
  if (!activeSelectedImage) return;

  activeSelectedImage.style.height = 'auto';
  activeSelectedImage.removeAttribute('height');
  activeSelectedImage.style.objectFit = '';
  activeSelectedImage.style.objectPosition = '';
  activeSelectedImage.style.aspectRatio = '';

  updateResizerOverlayPosition();
  updateFloatingToolbarValues();
  syncVisualToCode();
  updateLivePreview();
  showToast('Image height reset to auto (proportional)', 'info');
}

function setImageAlignment(align) {
  if (!activeSelectedImage) return;

  let block = activeSelectedImage.closest('.email-image-block');
  if (!block && activeSelectedImage.parentElement && activeSelectedImage.parentElement.tagName === 'DIV') {
    block = activeSelectedImage.parentElement;
  }

  if (align === 'center') {
    if (block) block.style.textAlign = 'center';
    activeSelectedImage.style.display = 'block';
    activeSelectedImage.style.marginLeft = 'auto';
    activeSelectedImage.style.marginRight = 'auto';
  } else if (align === 'left') {
    if (block) block.style.textAlign = 'left';
    activeSelectedImage.style.display = 'block';
    activeSelectedImage.style.marginLeft = '0';
    activeSelectedImage.style.marginRight = 'auto';
  } else if (align === 'right') {
    if (block) block.style.textAlign = 'right';
    activeSelectedImage.style.display = 'block';
    activeSelectedImage.style.marginLeft = 'auto';
    activeSelectedImage.style.marginRight = '0';
  }

  updateResizerOverlayPosition();
  updateFloatingToolbarValues();
  syncVisualToCode();
  updateLivePreview();
}

function promptImageLink() {
  if (!activeSelectedImage) return;

  const parent = activeSelectedImage.parentElement;
  const isLinked = parent && parent.tagName === 'A';
  const currentHref = isLinked ? parent.getAttribute('href') || '' : '';

  const newUrl = prompt('Enter destination link (URL) for this image:', currentHref || 'https://');
  if (newUrl === null) return;

  const clean = newUrl.trim();
  if (clean && clean !== 'https://') {
    if (isLinked) {
      parent.setAttribute('href', clean);
      parent.setAttribute('target', '_blank');
    } else {
      const a = document.createElement('a');
      a.href = clean;
      a.target = '_blank';
      a.style.textDecoration = 'none';
      a.style.display = 'inline-block';
      activeSelectedImage.parentNode.insertBefore(a, activeSelectedImage);
      a.appendChild(activeSelectedImage);
    }
    showToast('Image link attached!', 'success');
  } else if (isLinked && (!clean || clean === 'https://')) {
    parent.parentNode.insertBefore(activeSelectedImage, parent);
    parent.remove();
    showToast('Image link removed', 'info');
  }

  updateResizerOverlayPosition();
  syncVisualToCode();
  updateLivePreview();
}

function deleteSelectedImage() {
  if (!activeSelectedImage) return;

  const parent = activeSelectedImage.parentElement;
  const block = activeSelectedImage.closest('.email-image-block');

  if (block && block.children.length <= 1) {
    block.remove();
  } else if (parent && parent.tagName === 'A' && parent.children.length <= 1) {
    parent.remove();
  } else {
    activeSelectedImage.remove();
  }

  deselectImage();
  syncVisualToCode();
  updateLivePreview();
  showToast('Image removed', 'info');
}

function setupImageDragResizing() {
  const overlay = document.getElementById('image-resizer-overlay');
  if (!overlay) return;

  const handles = overlay.querySelectorAll('.resizer-handle');
  handles.forEach(handle => {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!activeSelectedImage) return;

      isResizingImage = true;
      const handleType = handle.getAttribute('data-handle');
      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = activeSelectedImage.getBoundingClientRect().width;
      const startHeight = activeSelectedImage.getBoundingClientRect().height;
      const aspectRatio = startWidth / (startHeight || 1);

      const visualEditor = document.getElementById('tpl-visual-editor');
      const maxAllowedWidth = visualEditor ? visualEditor.clientWidth - 50 : 1200;

      const onMouseMove = (moveEvt) => {
        if (!isResizingImage || !activeSelectedImage) return;
        moveEvt.preventDefault();

        const deltaX = moveEvt.clientX - startX;
        const deltaY = moveEvt.clientY - startY;

        let newWidth = startWidth;
        let newHeight = startHeight;

        // 1. WIDTH ONLY RESIZING (East or West handles)
        if (handleType === 'e') {
          newWidth = startWidth + deltaX;
          if (newWidth < 40) newWidth = 40;
          if (newWidth > maxAllowedWidth) newWidth = maxAllowedWidth;

          activeSelectedImage.style.width = `${Math.round(newWidth)}px`;
          activeSelectedImage.setAttribute('width', Math.round(newWidth));
          // Explicitly keep height unchanged as requested!
          activeSelectedImage.style.height = `${Math.round(startHeight)}px`;
          activeSelectedImage.setAttribute('height', Math.round(startHeight));
          activeSelectedImage.style.objectFit = 'cover';
        } else if (handleType === 'w') {
          newWidth = startWidth - deltaX;
          if (newWidth < 40) newWidth = 40;
          if (newWidth > maxAllowedWidth) newWidth = maxAllowedWidth;

          activeSelectedImage.style.width = `${Math.round(newWidth)}px`;
          activeSelectedImage.setAttribute('width', Math.round(newWidth));
          // Explicitly keep height unchanged as requested!
          activeSelectedImage.style.height = `${Math.round(startHeight)}px`;
          activeSelectedImage.setAttribute('height', Math.round(startHeight));
          activeSelectedImage.style.objectFit = 'cover';
        }
        // 2. HEIGHT ONLY RESIZING (North or South handles)
        else if (handleType === 's') {
          newHeight = startHeight + deltaY;
          if (newHeight < 25) newHeight = 25;

          activeSelectedImage.style.height = `${Math.round(newHeight)}px`;
          activeSelectedImage.setAttribute('height', Math.round(newHeight));
          // Width stays unchanged!
          activeSelectedImage.style.width = `${Math.round(startWidth)}px`;
          activeSelectedImage.setAttribute('width', Math.round(startWidth));
          activeSelectedImage.style.objectFit = 'cover';
        } else if (handleType === 'n') {
          newHeight = startHeight - deltaY;
          if (newHeight < 25) newHeight = 25;

          activeSelectedImage.style.height = `${Math.round(newHeight)}px`;
          activeSelectedImage.setAttribute('height', Math.round(newHeight));
          // Width stays unchanged!
          activeSelectedImage.style.width = `${Math.round(startWidth)}px`;
          activeSelectedImage.setAttribute('width', Math.round(startWidth));
          activeSelectedImage.style.objectFit = 'cover';
        }
        // 3. CORNER HANDLES (nw, ne, se, sw)
        else {
          if (handleType === 'se' || handleType === 'ne') {
            newWidth = startWidth + deltaX;
          } else {
            newWidth = startWidth - deltaX;
          }

          if (newWidth < 40) newWidth = 40;
          if (newWidth > maxAllowedWidth) newWidth = maxAllowedWidth;

          if (isAspectRatioLocked && !moveEvt.shiftKey) {
            newHeight = newWidth / aspectRatio;
            activeSelectedImage.style.width = `${Math.round(newWidth)}px`;
            activeSelectedImage.setAttribute('width', Math.round(newWidth));
            activeSelectedImage.style.height = `${Math.round(newHeight)}px`;
            activeSelectedImage.setAttribute('height', Math.round(newHeight));
          } else {
            // Free 2D resizing!
            if (handleType === 'se' || handleType === 'sw') {
              newHeight = startHeight + deltaY;
            } else {
              newHeight = startHeight - deltaY;
            }
            if (newHeight < 25) newHeight = 25;

            activeSelectedImage.style.width = `${Math.round(newWidth)}px`;
            activeSelectedImage.setAttribute('width', Math.round(newWidth));
            activeSelectedImage.style.height = `${Math.round(newHeight)}px`;
            activeSelectedImage.setAttribute('height', Math.round(newHeight));
            activeSelectedImage.style.objectFit = 'cover';
          }
        }

        if (newWidth > 0 && newHeight > 0) {
          activeSelectedImage.style.aspectRatio = `${Math.round(newWidth)} / ${Math.round(newHeight)}`;
        }
        activeSelectedImage.style.maxWidth = '100%';
        updateResizerOverlayPosition();

        const badge = document.getElementById('image-dimension-badge');
        if (badge) {
          const curW = Math.round(activeSelectedImage.getBoundingClientRect().width);
          const curH = Math.round(activeSelectedImage.getBoundingClientRect().height);
          badge.textContent = `${curW} × ${curH} px`;
        }
      };

      const onMouseUp = () => {
        isResizingImage = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        updateFloatingToolbarValues();
        syncVisualToCode();
        updateLivePreview();
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  });
}

function setupImagePositionDragging() {
  const overlay = document.getElementById('image-resizer-overlay');
  const visualEditor = document.getElementById('tpl-visual-editor');

  function startDragSession(e, targetImg) {
    if (isResizingImage) return;

    // Do not initiate reposition drag if clicking a resize handle or floating toolbar
    if (e.target && (e.target.closest('.resizer-handle') || e.target.closest('.image-floating-toolbar'))) {
      return;
    }

    const img = targetImg || activeSelectedImage;
    if (!img) return;

    const crop = getImageCropData(img);
    if (!crop || !crop.isCropped) return;

    // Ensure image is selected
    if (activeSelectedImage !== img) {
      selectImageForResize(img);
    }

    // Ensure object-fit: cover is applied so frame remains fixed & image stays clipped
    img.style.objectFit = 'cover';

    isPositioningImage = true;
    const isTouch = !!(e.touches && e.touches.length);
    const startX = isTouch ? e.touches[0].clientX : e.clientX;
    const startY = isTouch ? e.touches[0].clientY : e.clientY;
    const startPos = getCurrentImageObjectPosition(img);
    let hasMoved = false;
    const moveThreshold = 2; // px

    if (e.cancelable) e.preventDefault();

    document.body.style.cursor = 'grabbing';
    if (overlay) {
      overlay.classList.add('is-positioning');
      overlay.style.cursor = 'grabbing';
    }
    img.style.cursor = 'grabbing';

    const onMove = (moveEvt) => {
      if (!isPositioningImage || !activeSelectedImage) return;

      const moveIsTouch = !!(moveEvt.touches && moveEvt.touches.length);
      const currentX = moveIsTouch ? moveEvt.touches[0].clientX : moveEvt.clientX;
      const currentY = moveIsTouch ? moveEvt.touches[0].clientY : moveEvt.clientY;
      if (currentX === undefined || currentY === undefined) return;

      const deltaX = currentX - startX;
      const deltaY = currentY - startY;

      if (!hasMoved) {
        if (Math.hypot(deltaX, deltaY) >= moveThreshold) {
          hasMoved = true;
        } else {
          return;
        }
      }

      if (moveEvt.cancelable) moveEvt.preventDefault();

      let newPosX = startPos.x;
      let newPosY = startPos.y;

      // Allow movement horizontally according to available cropped area
      if (crop.excessX >= 1) {
        newPosX = startPos.x - (deltaX / crop.excessX) * 100;
        newPosX = Math.max(0, Math.min(100, newPosX));
      }

      // Allow movement vertically according to available cropped area
      if (crop.excessY >= 1) {
        newPosY = startPos.y - (deltaY / crop.excessY) * 100;
        newPosY = Math.max(0, Math.min(100, newPosY));
      }

      const roundX = Math.round(newPosX * 10) / 10;
      const roundY = Math.round(newPosY * 10) / 10;
      activeSelectedImage.style.objectPosition = `${roundX}% ${roundY}%`;

      updateLivePreview();
    };

    const onEnd = () => {
      if (!isPositioningImage) return;
      isPositioningImage = false;

      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);

      document.body.style.cursor = '';
      if (overlay) {
        overlay.classList.remove('is-positioning');
      }
      if (activeSelectedImage) {
        activeSelectedImage.style.cursor = '';
        const currentCrop = getImageCropData(activeSelectedImage);
        if (overlay) {
          overlay.style.cursor = (currentCrop && currentCrop.isCropped) ? 'grab' : 'default';
        }
      }

      if (hasMoved) {
        syncVisualToCode();
        updateLivePreview();
      }
    };

    document.addEventListener('mousemove', onMove, { passive: false });
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
  }

  // 1. Listen on overlay for mouse and touch interactions
  if (overlay) {
    overlay.addEventListener('mousedown', (e) => {
      startDragSession(e, activeSelectedImage);
    });
    overlay.addEventListener('touchstart', (e) => {
      startDragSession(e, activeSelectedImage);
    }, { passive: false });
  }

  // 2. Listen on visual editor canvas (for direct clicks/touches on IMG elements)
  if (visualEditor) {
    visualEditor.addEventListener('mousedown', (e) => {
      if (e.target && e.target.tagName === 'IMG') {
        const crop = getImageCropData(e.target);
        if (crop && crop.isCropped) {
          startDragSession(e, e.target);
        }
      }
    });

    visualEditor.addEventListener('touchstart', (e) => {
      if (e.target && e.target.tagName === 'IMG') {
        const crop = getImageCropData(e.target);
        if (crop && crop.isCropped) {
          startDragSession(e, e.target);
        }
      }
    }, { passive: false });

    // Prevent default browser ghost-image drag
    visualEditor.addEventListener('dragstart', (e) => {
      if (e.target && e.target.tagName === 'IMG') {
        e.preventDefault();
      }
    });
  }
}

function initImageResizerSystem() {
  if (imageSystemInitialized) return;
  imageSystemInitialized = true;

  const visualEditor = document.getElementById('tpl-visual-editor');
  const editorPane = document.querySelector('.editor-pane');

  if (visualEditor) {
    visualEditor.addEventListener('click', (e) => {
      if (e.target && e.target.tagName === 'IMG') {
        selectImageForResize(e.target);
      } else {
        deselectImage();
      }
    });

    visualEditor.addEventListener('paste', (e) => {
      const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          const file = items[i].getAsFile();
          if (file) {
            handleImageFileSelected(file);
            submitInsertImage();
          }
          return;
        }
      }
    });

    visualEditor.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    visualEditor.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        const file = e.dataTransfer.files[0];
        if (file && file.type && file.type.startsWith('image/')) {
          e.preventDefault();
          if (document.caretRangeFromPoint) {
            savedVisualEditorRange = document.caretRangeFromPoint(e.clientX, e.clientY);
          } else if (document.caretPositionFromPoint) {
            const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
            if (pos) {
              savedVisualEditorRange = document.createRange();
              savedVisualEditorRange.setStart(pos.offsetNode, pos.offset);
              savedVisualEditorRange.collapse(true);
            }
          }
          handleImageFileSelected(file);
          submitInsertImage();
        }
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (activeSelectedImage) {
      if (e.key === 'Escape') {
        deselectImage();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
          e.preventDefault();
          deleteSelectedImage();
        }
      }
    }
  });

  if (editorPane) {
    editorPane.addEventListener('scroll', () => {
      if (activeSelectedImage) updateResizerOverlayPosition();
    });
  }

  if (visualEditor) {
    visualEditor.addEventListener('scroll', () => {
      if (activeSelectedImage) updateResizerOverlayPosition();
    });
  }

  window.addEventListener('resize', () => {
    if (activeSelectedImage) updateResizerOverlayPosition();
  });

  setupImageDragResizing();
  setupImagePositionDragging();

  const modalDropzone = document.getElementById('img-upload-dropzone');
  if (modalDropzone) {
    modalDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      modalDropzone.classList.add('drag-over');
    });
    modalDropzone.addEventListener('dragleave', () => {
      modalDropzone.classList.remove('drag-over');
    });
    modalDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      modalDropzone.classList.remove('drag-over');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        handleImageFileSelected(e.dataTransfer.files[0]);
      }
    });
  }
}

// Window Global Exports
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

// Image System Exports
window.openImageModal = openImageModal;
window.closeImageModal = closeImageModal;
window.switchImageModalTab = switchImageModalTab;
window.handleImageFileSelected = handleImageFileSelected;
window.clearImageUploadSelection = clearImageUploadSelection;
window.handleImageUrlInput = handleImageUrlInput;
window.submitInsertImage = submitInsertImage;
window.setImagePresetWidth = setImagePresetWidth;
window.setImagePixelWidth = setImagePixelWidth;
window.setImagePixelHeight = setImagePixelHeight;
window.resetImageHeightAuto = resetImageHeightAuto;
window.toggleAspectRatioLock = toggleAspectRatioLock;
window.setImageAlignment = setImageAlignment;
window.promptImageLink = promptImageLink;
window.deleteSelectedImage = deleteSelectedImage;
window.deselectImage = deselectImage;
window.initImageResizerSystem = initImageResizerSystem;
window.setupImagePositionDragging = setupImagePositionDragging;
window.getImageCropData = getImageCropData;
window.getCurrentImageObjectPosition = getCurrentImageObjectPosition;

