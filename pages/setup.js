/**
 * Instagram Lock - Setup Page Logic
 */

import { ACTIONS, ICONS, validatePasswordPolicy } from '../shared/constants.js';
import { sendExtensionMessage } from '../shared/messaging.js';

document.addEventListener('DOMContentLoaded', async () => {
  const setupFormView = document.getElementById('setup-form-view');
  const alreadySetupView = document.getElementById('already-setup-view');
  const successView = document.getElementById('success-view');

  const setupForm = document.getElementById('setup-form');
  const newPasswordInput = document.getElementById('new-password');
  const confirmPasswordInput = document.getElementById('confirm-password');
  const strengthFill = document.getElementById('strength-fill');
  const strengthLabel = document.getElementById('strength-label');
  const errorBanner = document.getElementById('setup-error');
  const submitBtn = document.getElementById('btn-submit-setup');
  const btnText = submitBtn.querySelector('.btn-text');
  const spinner = submitBtn.querySelector('.spinner');

  const recoveryKeyDisplay = document.getElementById('recovery-key-display');
  const btnCopyRecovery = document.getElementById('btn-copy-recovery');
  const btnGotoSettings = document.getElementById('btn-goto-settings');
  const btnOpenInstagram = document.getElementById('btn-open-instagram');

  // Check initial configuration status
  try {
    const res = await sendExtensionMessage(ACTIONS.GET_STATUS);
    if (res && res.success && res.data.isConfigured) {
      setupFormView.classList.add('hidden');
      alreadySetupView.classList.remove('hidden');
    }
  } catch (e) {
    console.error('Failed to get setup status:', e);
  }

  // Toggle eye visibility buttons with real SVG icon swap & aria-pressed
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
  newPasswordInput.addEventListener('input', () => {
    const val = newPasswordInput.value;
    const strength = evaluateStrength(val);
    strengthFill.style.width = strength.percent + '%';
    strengthFill.style.backgroundColor = strength.color;
    strengthLabel.textContent = strength.text;
    strengthLabel.style.color = strength.color;
  });

  // Setup Form Submission
  setupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();

    const newPass = newPasswordInput.value;
    const confirmPass = confirmPasswordInput.value;

    const policy = validatePasswordPolicy(newPass);
    if (!policy.valid) {
      showError(policy.error);
      newPasswordInput.focus();
      return;
    }

    if (newPass !== confirmPass) {
      showError('Passwords do not match. Please re-enter.');
      confirmPasswordInput.focus();
      return;
    }

    // Set loading
    submitBtn.disabled = true;
    btnText.classList.add('hidden');
    spinner.classList.remove('hidden');

    try {
      const response = await sendExtensionMessage(ACTIONS.SET_PASSWORD, { password: newPass });

      if (response && response.success) {
        setupFormView.classList.add('hidden');
        successView.classList.remove('hidden');
        if (recoveryKeyDisplay && response.data?.recoveryKey) {
          recoveryKeyDisplay.textContent = response.data.recoveryKey;
        }
      } else {
        showError(response?.error || 'Failed to set password. Please try again.');
      }
    } catch (err) {
      showError('Unexpected error occurred.');
    } finally {
      submitBtn.disabled = false;
      btnText.classList.remove('hidden');
      spinner.classList.add('hidden');
    }
  });

  if (btnCopyRecovery) {
    btnCopyRecovery.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(recoveryKeyDisplay.textContent);
        btnCopyRecovery.textContent = 'Copied!';
        setTimeout(() => {
          btnCopyRecovery.textContent = 'Copy Recovery Key';
        }, 2000);
      } catch {
        btnCopyRecovery.textContent = 'Select & Copy Manually';
      }
    });
  }

  // Navigation Buttons
  if (btnGotoSettings) {
    btnGotoSettings.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  if (btnOpenInstagram) {
    btnOpenInstagram.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://www.instagram.com' });
    });
  }

  function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.classList.remove('hidden');
  }

  function clearError() {
    errorBanner.textContent = '';
    errorBanner.classList.add('hidden');
  }

  function evaluateStrength(pwd) {
    if (!pwd) {
      return { percent: 0, color: '#333333', text: 'Enter password' };
    }
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;

    if (score <= 2) return { percent: 30, color: '#ff7875', text: 'Weak (add length or symbols)' };
    if (score <= 3) return { percent: 65, color: '#faad14', text: 'Moderate' };
    return { percent: 100, color: '#52c41a', text: 'Strong' };
  }
});
