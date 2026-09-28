// ========================================
// UI - CUSTOM MODAL SYSTEM
// Drop-in replacement for alert(), confirm(), prompt()
// Matches the Task Earn dark theme (#0b0e1a / #00d4ff)
// ========================================

(function injectModalStyles() {
  if (document.getElementById('te-ui-styles')) return;
  const style = document.createElement('style');
  style.id = 'te-ui-styles';
  style.textContent = `
    .te-modal-overlay {
      position: fixed; inset: 0;
      background: rgba(3, 6, 16, 0.72);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      z-index: 99999;
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
      opacity: 0;
      animation: teFadeIn 0.18s ease forwards;
    }
    .te-modal-overlay.closing { animation: teFadeOut 0.16s ease forwards; }

    @keyframes teFadeIn  { from { opacity: 0; } to { opacity: 1; } }
    @keyframes teFadeOut { from { opacity: 1; } to { opacity: 0; } }
    @keyframes tePopIn {
      from { opacity: 0; transform: translateY(14px) scale(0.96); }
      to   { opacity: 1; transform: translateY(0)    scale(1);    }
    }
    @keyframes tePopOut {
      from { opacity: 1; transform: translateY(0)    scale(1);    }
      to   { opacity: 0; transform: translateY(8px)  scale(0.97); }
    }

    .te-modal {
      background: #141a26;
      border: 1px solid #1e2537;
      border-radius: 18px;
      width: 100%; max-width: 420px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(0, 212, 255, 0.05);
      overflow: hidden;
      animation: tePopIn 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.2) forwards;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }
    .te-modal-overlay.closing .te-modal { animation: tePopOut 0.16s ease forwards; }

    .te-modal-header {
      display: flex; align-items: center; gap: 12px;
      padding: 20px 22px 6px;
    }
    .te-modal-icon {
      width: 40px; height: 40px; flex-shrink: 0;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 17px;
    }
    .te-modal-icon.info    { background: rgba(0, 212, 255, 0.12); color: #00d4ff; }
    .te-modal-icon.success { background: rgba(81, 207, 102, 0.12); color: #51cf66; }
    .te-modal-icon.warn    { background: rgba(255, 179, 71, 0.12); color: #ffb347; }
    .te-modal-icon.danger  { background: rgba(255, 107, 107, 0.12); color: #ff6b6b; }

    .te-modal-title {
      font-size: 16px; font-weight: 700; color: #e6f1ff; line-height: 1.3;
    }
    .te-modal-body {
      padding: 6px 22px 4px;
      font-size: 13.5px; color: #ccd6f6; line-height: 1.55;
      word-break: break-word;
    }
    .te-modal-body p { margin: 0 0 8px; }
    .te-modal-body p:last-child { margin-bottom: 0; }
    .te-modal-body strong { color: #e6f1ff; }
    .te-modal-body .te-amount { color: #00d4ff; font-weight: 700; }
    .te-modal-body .te-danger-text { color: #ff6b6b; font-weight: 600; }
    .te-modal-body .te-success-text { color: #51cf66; font-weight: 600; }
    .te-modal-body em { color: #8892b0; font-style: italic; }

    .te-modal-input {
      width: 100%;
      margin-top: 12px;
      background: #0b0e1a;
      border: 1px solid #1e2537;
      border-radius: 10px;
      padding: 11px 14px;
      color: #e6f1ff;
      font-size: 14px;
      font-family: inherit;
      outline: none;
      resize: vertical;
      min-height: 44px;
      box-sizing: border-box;
    }
    .te-modal-input:focus { border-color: #00d4ff; }
    textarea.te-modal-input { min-height: 84px; line-height: 1.5; }

    .te-modal-actions {
      display: flex; gap: 10px;
      padding: 18px 22px 20px;
    }
    .te-modal-btn {
      flex: 1;
      padding: 12px 16px;
      border: none; border-radius: 10px;
      font-size: 14px; font-weight: 600;
      cursor: pointer;
      transition: transform 0.12s ease, filter 0.15s ease, background 0.15s ease;
      font-family: inherit;
    }
    .te-modal-btn:active { transform: scale(0.97); }
    .te-modal-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .te-modal-btn.cancel {
      background: #1e2537;
      color: #8892b0;
    }
    .te-modal-btn.cancel:hover { background: #263049; color: #ccd6f6; }

    .te-modal-btn.primary {
      background: linear-gradient(135deg, #00c6ff 0%, #0072ff 100%);
      color: #fff;
      box-shadow: 0 4px 16px rgba(0, 114, 255, 0.28);
    }
    .te-modal-btn.primary:hover { filter: brightness(1.08); }

    .te-modal-btn.success {
      background: linear-gradient(135deg, #51cf66 0%, #2f9e44 100%);
      color: #fff;
      box-shadow: 0 4px 16px rgba(47, 158, 68, 0.28);
    }
    .te-modal-btn.success:hover { filter: brightness(1.08); }

    .te-modal-btn.danger {
      background: linear-gradient(135deg, #ff6b6b 0%, #c92a2a 100%);
      color: #fff;
      box-shadow: 0 4px 16px rgba(201, 42, 42, 0.28);
    }
    .te-modal-btn.danger:hover { filter: brightness(1.08); }

    .te-modal-actions.single .te-modal-btn { max-width: 160px; margin: 0 auto; }
  `;
  document.head.appendChild(style);
})();

function buildModal({ title, message, type = 'info', input = null, confirmText = 'OK', cancelText = 'Cancel', confirmStyle = 'primary' }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'te-modal-overlay';

    const iconMap = {
      info:    'fa-circle-info',
      success: 'fa-circle-check',
      warn:    'fa-triangle-exclamation',
      danger:  'fa-triangle-exclamation'
    };

    const inputHtml = input
      ? (input.multiline
          ? `<textarea class="te-modal-input" id="teModalInput" maxlength="${input.maxLength || 500}" placeholder="${input.placeholder || ''}">${input.value || ''}</textarea>`
          : `<input class="te-modal-input" id="teModalInput" type="${input.type || 'text'}" maxlength="${input.maxLength || 500}" placeholder="${input.placeholder || ''}" value="${input.value || ''}" />`)
      : '';

    const showCancel = confirmText !== null;

    overlay.innerHTML = `
      <div class="te-modal" role="dialog" aria-modal="true">
        <div class="te-modal-header">
          <div class="te-modal-icon ${type}"><i class="fas ${iconMap[type] || iconMap.info}"></i></div>
          <div class="te-modal-title">${title || ''}</div>
        </div>
        <div class="te-modal-body">
          ${message || ''}
          ${inputHtml}
        </div>
        <div class="te-modal-actions ${showCancel ? '' : 'single'}">
          ${showCancel ? `<button class="te-modal-btn cancel" data-act="cancel">${cancelText}</button>` : ''}
          <button class="te-modal-btn ${confirmStyle}" data-act="confirm">${confirmText || 'OK'}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const inputEl = overlay.querySelector('#teModalInput');
    const confirmBtn = overlay.querySelector('[data-act="confirm"]');
    const cancelBtn  = overlay.querySelector('[data-act="cancel"]');

    requestAnimationFrame(() => {
      if (inputEl) { inputEl.focus(); if (inputEl.select) inputEl.select(); }
      else confirmBtn?.focus();
    });

    function close(result) {
      overlay.classList.add('closing');
      setTimeout(() => overlay.remove(), 160);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }

    function onConfirm() {
      if (inputEl) {
        const val = inputEl.value.trim();
        if (input.required !== false && !val) {
          inputEl.style.borderColor = '#ff6b6b';
          inputEl.focus();
          return;
        }
        close(val);
      } else {
        close(true);
      }
    }

    function onCancel() { close(inputEl ? null : false); }

    confirmBtn?.addEventListener('click', onConfirm);
    cancelBtn?.addEventListener('click', onCancel);

    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) onCancel();
    });

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      if (e.key === 'Enter' && inputEl && !inputEl.multiline) { e.preventDefault(); onConfirm(); }
      if (e.key === 'Enter' && inputEl && inputEl.multiline && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onConfirm(); }
    }
    document.addEventListener('keydown', onKey);
  });
}

export function uiAlert({ title = 'Notice', message = '', type = 'info', buttonText = 'OK' } = {}) {
  return buildModal({ title, message, type, confirmText: buttonText, cancelText: null, confirmStyle: type === 'danger' ? 'danger' : 'primary' });
}

export function uiConfirm({
  title = 'Are you sure?',
  message = '',
  type = 'warn',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmStyle = 'primary'
} = {}) {
  return buildModal({ title, message, type, confirmText, cancelText, confirmStyle }).then(v => v === true);
}

export function uiPrompt({
  title = 'Enter value',
  message = '',
  placeholder = '',
  value = '',
  multiline = false,
  required = true,
  confirmText = 'Submit',
  cancelText = 'Cancel',
  maxLength = 500
} = {}) {
  return buildModal({
    title, message, type: 'info',
    input: { placeholder, value, multiline, required, maxLength },
    confirmText, cancelText, confirmStyle: 'primary'
  });
}