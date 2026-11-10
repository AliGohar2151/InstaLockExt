/**
 * Instagram Lock - Options & Settings Controller
 */

import { ACTIONS, ICONS, validatePasswordPolicy } from '../shared/constants.js';
import { sendExtensionMessage } from '../shared/messaging.js';

document.addEventListener('DOMContentLoaded', async () => {
  const selectLockScope = document.getElementById('select-lock-scope');
  const toggleAutolock = document.getElementById('toggle-autolock');
  const toggleLockOnClose = document.getElementById('toggle-lock-on-close');
  const selectTimeout = document.getElementById('select-timeout');
  const selectThemeMode = document.getElementById('select-theme-mode');
  const autosaveToast = document.getElementById('autosave-toast');

  const changePwForm = document.getElementById('change-pw-form');
  const currentPwInput = document.getElementById('current-password');
  const newPwInput = document.getElementById('new-password');
  const confirmNewPwInput = document.getElementById('confirm-new-password');
  const strengthFill = document.getElementById('strength-fill');
  const strengthLabel = document.getElementById('strength-label');
  const changePwError = document.getElementById('change-pw-error');
  const changePwSuccess = document.getElementById('change-pw-success');
  const btnChangePw = document.getElementById('btn-change-pw');

  const recoveryGenForm = document.getElementById('recovery-gen-form');
  const recCurrentPw = document.getElementById('rec-current-pw');
  const recGenError = document.getElementById('rec-gen-error');
  const recGenResult = document.getElementById('rec-gen-result');
  const recGenCode = document.getElementById('rec-gen-code');
  const btnCopyNewRec = document.getElementById('btn-copy-new-rec');
  const btnGenRec = document.getElementById('btn-gen-rec');

  const auditLogContainer = document.getElementById('audit-log-container');
  const btnClearLog = document.getElementById('btn-clear-log');

  let toastTimeout = null;

  // Load initial settings
  async function loadSettings() {
    try {
      const res = await sendExtensionMessage(ACTIONS.GET_SETTINGS);
      if (res && res.success && res.data) {
        selectLockScope.value = res.data.lockScope || 'full';
        toggleAutolock.checked = Boolean(res.data.autoLockEnabled);
        toggleLockOnClose.checked = Boolean(res.data.lockOnClose);
        selectTimeout.value = String(res.data.timeoutMinutes);
        selectThemeMode.value = res.data.themeMode || 'auto';
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }

  // UX-09: Auto-save preferences on change
  async function autoSaveSettings() {
    const settings = {
      lockScope: selectLockScope.value,
      autoLockEnabled: toggleAutolock.checked,
      lockOnClose: toggleLockOnClose.checked,
      timeoutMinutes: parseInt(selectTimeout.value, 10),
      themeMode: selectThemeMode.value
    };

    try {
      const res = await sendExtensionMessage(ACTIONS.UPDATE_SETTINGS, { settings });
      if (res && res.success) {
        autosaveToast.classList.remove('hidden');
        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
          autosaveToast.classList.add('hidden');
        }, 2000);
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }

  [selectLockScope, toggleAutolock, toggleLockOnClose, selectTimeout, selectThemeMode].forEach(el => {
    el.addEventListener('change', autoSaveSettings);
  });

  // Eye toggles for password change form (UX-09 & UX-07)
  document.querySelectorAll('.btn-toggle-eye').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      const pathEl = btn.querySelector('path');
      if (!input) return;

      const isPass = input.type === 'password';
      input.type = isPass ? 'text' : 'password';
      btn.setAttribute('aria-pressed', String(isPass));
      if (pathEl) {
        pathEl.setAttribute('d', isPass ? ICONS.EYE_SLASH_PATH : ICONS.EYE_OPEN_PATH);
      }
    });
  });

  // Password strength meter
  newPwInput.addEventListener('input', () => {
    const pwd = newPwInput.value;
    if (!pwd) {
      strengthFill.style.width = '0%';
      strengthLabel.textContent = 'Password strength';
      strengthLabel.style.color = '#9a9a9a';
      return;
    }
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;

    let state;
    if (score <= 2) state = { percent: 30, color: '#ff7875', text: 'Weak (add length or symbols)' };
    else if (score <= 3) state = { percent: 65, color: '#faad14', text: 'Moderate' };
    else state = { percent: 100, color: '#52c41a', text: 'Strong' };

    strengthFill.style.width = state.percent + '%';
    strengthFill.style.backgroundColor = state.color;
    strengthLabel.textContent = state.text;
    strengthLabel.style.color = state.color;
  });

  // Change Password Form
  changePwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    changePwError.classList.add('hidden');
    changePwSuccess.classList.add('hidden');

    const currentPassword = currentPwInput.value;
    const newPassword = newPwInput.value;
    const confirmNewPassword = confirmNewPwInput.value;

    if (!currentPassword) {
      showPwError('Please enter your current password.');
      currentPwInput.focus();
      return;
    }

    const policy = validatePasswordPolicy(newPassword);
    if (!policy.valid) {
      showPwError(policy.error);
      newPwInput.focus();
      return;
    }

    if (newPassword !== confirmNewPassword) {
      showPwError('New passwords do not match. Please verify.');
      confirmNewPwInput.focus();
      return;
    }

    btnChangePw.disabled = true;

    try {
      const res = await sendExtensionMessage(ACTIONS.CHANGE_PASSWORD, {
        currentPassword,
        newPassword
      });

      if (res && res.success) {
        changePwSuccess.classList.remove('hidden');
        currentPwInput.value = '';
        newPwInput.value = '';
        confirmNewPwInput.value = '';
        strengthFill.style.width = '0%';
        strengthLabel.textContent = 'Password strength';
        strengthLabel.style.color = '#9a9a9a';
        await loadAuditLog();
      } else {
        showPwError(res?.error || 'Failed to update password.');
      }
    } catch {
      showPwError('An unexpected error occurred.');
    } finally {
      btnChangePw.disabled = false;
    }
  });

  // Regenerate Recovery Key
  recoveryGenForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    recGenError.classList.add('hidden');
    recGenResult.classList.add('hidden');

    const currentPassword = recCurrentPw.value;
    if (!currentPassword) {
      recGenError.textContent = 'Please enter your current master password.';
      recGenError.classList.remove('hidden');
      return;
    }

    btnGenRec.disabled = true;
    try {
      const res = await sendExtensionMessage(ACTIONS.REGENERATE_RECOVERY_KEY, { currentPassword });
      if (res && res.success && res.data?.recoveryKey) {
        recCurrentPw.value = '';
        recGenCode.textContent = res.data.recoveryKey;
        recGenResult.classList.remove('hidden');
        await loadAuditLog();
      } else {
        recGenError.textContent = res?.error || 'Failed to regenerate recovery key.';
        recGenError.classList.remove('hidden');
      }
    } catch {
      recGenError.textContent = 'Unexpected error.';
      recGenError.classList.remove('hidden');
    } finally {
      btnGenRec.disabled = false;
    }
  });

  btnCopyNewRec.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(recGenCode.textContent);
      btnCopyNewRec.textContent = 'Copied!';
      setTimeout(() => { btnCopyNewRec.textContent = 'Copy Key'; }, 2000);
    } catch {
      btnCopyNewRec.textContent = 'Copy Manually';
    }
  });

  // Security Audit Log
  async function loadAuditLog() {
    try {
      const res = await sendExtensionMessage(ACTIONS.GET_AUDIT_LOG);
      if (!res || !res.success || !Array.isArray(res.data)) return;

      auditLogContainer.innerHTML = '';
      if (res.data.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'empty-log';
        empty.textContent = 'No activity recorded yet.';
        auditLogContainer.appendChild(empty);
        return;
      }

      res.data.forEach(entry => {
        const item = document.createElement('div');
        item.className = 'audit-item';

        const left = document.createElement('div');
        left.className = 'audit-left';

        const ev = document.createElement('span');
        ev.className = 'audit-event';
        ev.textContent = entry.event;

        const meta = document.createElement('span');
        meta.className = 'audit-meta';
        meta.textContent = `${new Date(entry.timestamp).toLocaleString()} • ${entry.origin}`;

        left.appendChild(ev);
        left.appendChild(meta);

        const badge = document.createElement('span');
        badge.className = `audit-badge ${entry.success ? 'ok' : 'fail'}`;
        badge.textContent = entry.success ? 'Success' : 'Failed';

        item.appendChild(left);
        item.appendChild(badge);
        auditLogContainer.appendChild(item);
      });
    } catch (err) {
      console.error('Failed to load audit log:', err);
    }
  }

  btnClearLog.addEventListener('click', async () => {
    await sendExtensionMessage(ACTIONS.CLEAR_AUDIT_LOG);
    await loadAuditLog();
  });

  chrome.storage.onChanged.addListener(() => {
    loadAuditLog();
  });

  function showPwError(msg) {
    changePwError.textContent = msg;
    changePwError.classList.remove('hidden');
  }

  await loadSettings();
  await loadAuditLog();
});
