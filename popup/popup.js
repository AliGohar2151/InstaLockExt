/**
 * Instagram Lock - Popup Controller
 * Supports live status sync via chrome.storage.onChanged and direct unlock (UX-10).
 */

import { ACTIONS, LOCK_SCOPES } from '../shared/constants.js';
import { sendExtensionMessage } from '../shared/messaging.js';

const SCOPE_LABELS = {
  [LOCK_SCOPES.FULL]: 'Full Site',
  [LOCK_SCOPES.REELS_EXPLORE]: 'Reels & Explore',
  [LOCK_SCOPES.DMS]: 'Direct Messages'
};

document.addEventListener('DOMContentLoaded', async () => {
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const statusSubtext = document.getElementById('status-subtext');
  const unlockSection = document.getElementById('unlock-section');
  const lockSection = document.getElementById('lock-section');
  const unlockForm = document.getElementById('popup-unlock-form');
  const pwInput = document.getElementById('popup-pw-input');
  const unlockError = document.getElementById('popup-unlock-error');
  const btnPopupUnlock = document.getElementById('btn-popup-unlock');

  const btnLockNow = document.getElementById('btn-lock-now');
  const btnSettings = document.getElementById('btn-settings');
  const infoScope = document.getElementById('info-scope');
  const infoTimeout = document.getElementById('info-timeout');
  const toggleLockClose = document.getElementById('popup-toggle-lock-close');

  let currentStatus = null;
  let lockoutTimer = null;

  async function refreshStatus() {
    try {
      const response = await sendExtensionMessage(ACTIONS.GET_STATUS);
      if (response && response.success) {
        currentStatus = response.data;
        render(currentStatus);
      } else {
        showErrorState();
      }
    } catch (e) {
      console.error('Error fetching popup status:', e);
      showErrorState();
    }
  }

  function render(status) {
    statusDot.className = 'dot';

    const timeout = status.timeoutMinutes;
    infoTimeout.textContent = timeout > 0 ? `${timeout} min` : 'Never';
    if (toggleLockClose) {
      toggleLockClose.checked = Boolean(status.lockOnClose);
    }
    if (infoScope) {
      infoScope.textContent = SCOPE_LABELS[status.lockScope] || 'Full Site';
    }

    if (!status.isConfigured) {
      statusDot.classList.add('unconfigured');
      statusText.textContent = 'Setup Required';
      statusSubtext.textContent = 'Click Settings to create your master password.';
      unlockSection.classList.add('hidden');
      lockSection.classList.remove('hidden');
      btnLockNow.disabled = true;
      return;
    }

    if (status.isUnlocked) {
      statusDot.classList.add('unlocked');
      statusText.textContent = 'Session Unlocked';
      statusSubtext.textContent = 'Instagram is unlocked in this browser session.';
      unlockSection.classList.add('hidden');
      lockSection.classList.remove('hidden');
      btnLockNow.disabled = false;
      clearLockoutTimer();
    } else {
      statusDot.classList.add('locked');
      statusText.textContent = 'Session Locked';
      statusSubtext.textContent = 'Enter your password below or on any Instagram tab.';
      unlockSection.classList.remove('hidden');
      lockSection.classList.add('hidden');
      btnLockNow.disabled = true;

      if (status.isLockedOut && status.lockoutSeconds > 0) {
        startPopupLockout(status.lockoutSeconds);
      }
    }
  }

  function showErrorState() {
    statusDot.className = 'dot locked';
    statusText.textContent = 'Status Unavailable';
    statusSubtext.textContent = 'Unable to communicate with background service.';
    btnLockNow.disabled = true;
  }

  function clearLockoutTimer() {
    if (lockoutTimer) {
      clearInterval(lockoutTimer);
      lockoutTimer = null;
    }
    unlockError.classList.add('hidden');
    pwInput.disabled = false;
    btnPopupUnlock.disabled = false;
  }

  function startPopupLockout(seconds) {
    clearLockoutTimer();
    let remaining = seconds;
    pwInput.disabled = true;
    btnPopupUnlock.disabled = true;

    const update = () => {
      unlockError.textContent = `Too many failed attempts. Wait ${remaining}s.`;
      unlockError.classList.remove('hidden');
    };
    update();

    lockoutTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearLockoutTimer();
      } else {
        update();
      }
    }, 1000);
  }

  // Direct Unlock Form Submit
  unlockForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = pwInput.value;
    if (!password) return;

    btnPopupUnlock.disabled = true;
    unlockError.classList.add('hidden');

    try {
      const res = await sendExtensionMessage(ACTIONS.VERIFY_PASSWORD, { password });
      if (res && res.success) {
        pwInput.value = '';
        await refreshStatus();
      } else {
        pwInput.value = '';
        pwInput.focus();
        if (res?.lockoutSeconds > 0) {
          startPopupLockout(res.lockoutSeconds);
        } else {
          unlockError.textContent = res?.error || 'Incorrect password.';
          unlockError.classList.remove('hidden');
        }
      }
    } catch {
      unlockError.textContent = 'Error verifying password.';
      unlockError.classList.remove('hidden');
    } finally {
      if (!lockoutTimer) btnPopupUnlock.disabled = false;
    }
  });

  // Lock Now Button Event
  btnLockNow.addEventListener('click', async () => {
    btnLockNow.disabled = true;
    try {
      const res = await sendExtensionMessage(ACTIONS.LOCK_NOW);
      if (res && res.success) {
        await refreshStatus();
      }
    } catch (err) {
      console.error('Failed to lock now:', err);
    }
  });

  // Settings Button
  btnSettings.addEventListener('click', () => {
    if (currentStatus && !currentStatus.isConfigured) {
      chrome.tabs.create({ url: chrome.runtime.getURL('pages/setup.html') });
    } else {
      chrome.runtime.openOptionsPage();
    }
  });

  // Quick Toggle Lock on Reopen directly from popup
  if (toggleLockClose) {
    toggleLockClose.addEventListener('change', async () => {
      try {
        await sendExtensionMessage(ACTIONS.UPDATE_SETTINGS, {
          settings: { lockOnClose: toggleLockClose.checked }
        });
      } catch (err) {
        console.error('Failed to toggle lockOnClose:', err);
      }
    });
  }

  // UX-10: Listen for live storage changes to keep popup synced
  chrome.storage.onChanged.addListener(() => {
    refreshStatus();
  });

  await refreshStatus();
});
