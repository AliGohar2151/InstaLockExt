/**
 * Instagram Lock - Lock Screen Manager
 * Mounts an isolated, closed Shadow DOM overlay covering Instagram Web.
 * Supports dark/light theme matching, WCAG 2.1 AA accessibility, lockout syncing,
 * emergency recovery key reset, and context invalidation protection.
 */

import { ACTIONS, ICONS, THEME_MODES } from '../shared/constants.js';
import { sendExtensionMessage } from '../shared/messaging.js';

export class LockScreenManager {
  constructor(onAuthenticated) {
    this.onAuthenticated = onAuthenticated;
    this.hostElement = null;
    this._shadowRoot = null;
    this.countdownInterval = null;
    this.lockoutSecondsRemaining = 0;
    this.themeMode = THEME_MODES.AUTO;
  }

  /**
   * Resolves whether light theme should be applied.
   */
  isLightTheme(themeMode) {
    if (themeMode === THEME_MODES.LIGHT) return true;
    if (themeMode === THEME_MODES.DARK) return false;
    // Auto detect from Instagram DOM or OS preference
    if (document.documentElement.classList.contains('__fb-light-mode')) return true;
    if (document.documentElement.classList.contains('__fb-dark-mode')) return false;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  }

  /**
   * Mounts the lock screen if not already present.
   */
  mount(isConfigured = true, initialLockoutSeconds = 0, themeMode = THEME_MODES.AUTO) {
    this.themeMode = themeMode;

    if (this.hostElement && document.contains(this.hostElement)) {
      if (initialLockoutSeconds > 0 && this.lockoutSecondsRemaining <= 0) {
        this.syncLockout(initialLockoutSeconds);
      }
      return;
    }

    // Freeze page scroll
    document.documentElement.style.setProperty('overflow', 'hidden', 'important');
    if (document.body) {
      document.body.style.setProperty('overflow', 'hidden', 'important');
    }

    // Create host element
    this.hostElement = document.createElement('div');
    this.hostElement.id = 'ig-lock-screen-host';
    this.hostElement.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      z-index: 2147483647 !important;
      pointer-events: auto !important;
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      all: initial !important;
    `;
    // Enforce visibility properties after all:initial reset
    this.hostElement.style.setProperty('position', 'fixed', 'important');
    this.hostElement.style.setProperty('inset', '0', 'important');
    this.hostElement.style.setProperty('width', '100vw', 'important');
    this.hostElement.style.setProperty('height', '100vh', 'important');
    this.hostElement.style.setProperty('z-index', '2147483647', 'important');
    this.hostElement.style.setProperty('display', 'block', 'important');
    this.hostElement.style.setProperty('visibility', 'visible', 'important');
    this.hostElement.style.setProperty('opacity', '1', 'important');

    // SEC-01: Closed Shadow DOM prevents webpage JS from accessing password input via host.shadowRoot
    this._shadowRoot = this.hostElement.attachShadow({ mode: 'closed' });
    this.render(isConfigured);

    // Mount directly to documentElement so body mutations cannot easily detach it
    const target = document.body || document.documentElement;
    target.appendChild(this.hostElement);

    if (initialLockoutSeconds > 0) {
      this.syncLockout(initialLockoutSeconds);
    }

    // Auto-focus input
    requestAnimationFrame(() => {
      if (!this._shadowRoot) return;
      const input = this._shadowRoot.querySelector('#ig-lock-input');
      if (input && !input.disabled) input.focus();
    });
  }

  /**
   * Mounts a fail-closed recovery curtain when extension context is invalidated (EDG-01).
   */
  mountContextInvalidated() {
    this.unmount();

    document.documentElement.style.setProperty('overflow', 'hidden', 'important');
    this.hostElement = document.createElement('div');
    this.hostElement.id = 'ig-lock-screen-host';
    this.hostElement.style.cssText = `
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      z-index: 2147483647 !important;
      display: block !important;
    `;

    this._shadowRoot = this.hostElement.attachShadow({ mode: 'closed' });
    this._shadowRoot.innerHTML = `
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        .overlay {
          position: fixed; inset: 0; background: rgba(0, 0, 0, 0.94);
          backdrop-filter: blur(28px); -webkit-backdrop-filter: blur(28px);
          display: flex; align-items: center; justify-content: center;
        }
        .card {
          width: 390px; max-width: 90vw; background: #121212; border: 1px solid #2b2b2b;
          border-radius: 18px; padding: 32px; text-align: center; color: #f5f5f5;
        }
        h1 { font-size: 20px; margin-bottom: 10px; }
        p { font-size: 14px; color: #a8a8a8; line-height: 1.45; margin-bottom: 22px; }
        button {
          width: 100%; height: 44px; border: none; border-radius: 10px; color: #fff; font-weight: 600;
          font-size: 14px; cursor: pointer;
          background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);
        }
      </style>
      <div class="overlay" role="alertdialog" aria-modal="true">
        <div class="card">
          <h1>Extension Updated</h1>
          <p>Instagram Lock was reloaded or updated. Please refresh this tab to restore protection.</p>
          <button id="ig-reload-btn" type="button">Refresh Tab</button>
        </div>
      </div>
    `;
    this._shadowRoot.querySelector('#ig-reload-btn').addEventListener('click', () => {
      window.location.reload();
    });

    (document.body || document.documentElement).appendChild(this.hostElement);
  }

  /**
   * Synchronizes an active lockout countdown across tabs (UX-03, UX-04).
   */
  syncLockout(seconds) {
    if (!this._shadowRoot || seconds <= 0) return;
    const errorBanner = this._shadowRoot.querySelector('#ig-error-banner');
    const unlockBtn = this._shadowRoot.querySelector('#ig-unlock-btn');
    const input = this._shadowRoot.querySelector('#ig-lock-input');
    if (errorBanner && unlockBtn && input) {
      this.startLockoutCountdown(seconds, errorBanner, unlockBtn, input);
    }
  }

  /**
   * Unmounts the lock screen and restores page scrolling.
   */
  unmount() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    this.lockoutSecondsRemaining = 0;

    if (this.hostElement && this.hostElement.parentNode) {
      this.hostElement.parentNode.removeChild(this.hostElement);
    }
    this.hostElement = null;
    this._shadowRoot = null;

    document.documentElement.style.removeProperty('overflow');
    if (document.body) {
      document.body.style.removeProperty('overflow');
    }
  }

  /**
   * Checks if the lock screen is currently mounted and effectively visible (SEC-02).
   */
  isEffectivelyMounted() {
    if (!this.hostElement || !document.contains(this.hostElement)) {
      return false;
    }
    const computed = window.getComputedStyle(this.hostElement);
    if (
      computed.display === 'none' ||
      computed.visibility === 'hidden' ||
      parseFloat(computed.opacity) < 0.9
    ) {
      return false;
    }
    return true;
  }

  /**
   * Enforces host element visibility attributes if tampered via CSS.
   */
  restoreVisibility() {
    if (!this.hostElement) return;
    this.hostElement.style.setProperty('display', 'block', 'important');
    this.hostElement.style.setProperty('visibility', 'visible', 'important');
    this.hostElement.style.setProperty('opacity', '1', 'important');
    this.hostElement.style.setProperty('z-index', '2147483647', 'important');
    this.hostElement.style.setProperty('pointer-events', 'auto', 'important');
  }

  render(isConfigured) {
    const light = this.isLightTheme(this.themeMode);

    this._shadowRoot.innerHTML = `
      <style>
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }

        :host {
          all: initial;
        }

        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        .overlay {
          --overlay-bg: ${light ? 'radial-gradient(circle at 50% 20%, #ffffff 0%, #efefef 85%)' : 'radial-gradient(circle at 50% 20%, #1a1a1a 0%, #000000 80%)'};
          --card-bg: ${light ? '#ffffff' : '#121212'};
          --card-border: ${light ? '#dbdbdb' : '#262626'};
          --text-primary: ${light ? '#1c1c1c' : '#f5f5f5'};
          --text-secondary: ${light ? '#555555' : '#a8a8a8'};
          --input-bg: ${light ? '#fafafa' : '#1c1c1c'};
          --input-border: ${light ? '#dbdbdb' : '#363636'};
          --error-bg: ${light ? '#fff1f0' : '#2a1215'};
          --error-border: ${light ? '#ffa39e' : '#5c2228'};
          --error-text: ${light ? '#cf1322' : '#ff7875'};

          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          background: var(--overlay-bg);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          z-index: 2147483647;
          user-select: none;
        }

        .card {
          width: 396px;
          max-width: 92vw;
          max-height: 92vh;
          overflow-y: auto;
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: 18px;
          padding: 34px 30px;
          display: flex;
          flex-direction: column;
          align-items: center;
          box-shadow: 0 20px 48px rgba(0, 0, 0, ${light ? '0.15' : '0.75'});
          text-align: center;
          animation: fadeIn 0.22s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }

        .card.shake {
          animation: shake 0.4s ease-in-out;
        }

        .icon-container {
          width: 68px;
          height: 68px;
          border-radius: 50%;
          background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
          flex-shrink: 0;
          box-shadow: 0 4px 18px rgba(225, 48, 108, 0.35);
        }

        .icon-inner {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: var(--card-bg);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .icon-inner svg {
          width: 28px;
          height: 28px;
          fill: var(--text-primary);
        }

        .title {
          font-size: 22px;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.3px;
          margin-bottom: 8px;
        }

        .subtitle {
          font-size: 14px;
          color: var(--text-secondary);
          line-height: 1.45;
          margin-bottom: 24px;
        }

        .form {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .form.hidden, .hidden {
          display: none !important;
        }

        .input-group {
          position: relative;
          width: 100%;
        }

        .input-field {
          width: 100%;
          height: 46px;
          background: var(--input-bg);
          border: 1px solid var(--input-border);
          border-radius: 10px;
          color: var(--text-primary);
          font-size: 15px;
          padding: 0 44px 0 14px;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .input-field:focus {
          border-color: #e1306c;
          box-shadow: 0 0 0 2px rgba(225, 48, 108, 0.25);
        }

        .toggle-btn {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          padding: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
        }

        .toggle-btn:hover, .toggle-btn:focus-visible {
          color: var(--text-primary);
          outline: 2px solid rgba(225, 48, 108, 0.5);
        }

        .toggle-btn svg {
          width: 18px;
          height: 18px;
          fill: currentColor;
        }

        .error-msg {
          font-size: 13px;
          color: var(--error-text);
          background: var(--error-bg);
          border: 1px solid var(--error-border);
          border-radius: 8px;
          padding: 10px 12px;
          text-align: left;
          line-height: 1.4;
          display: none;
        }

        .error-msg.visible {
          display: block;
        }

        .btn-unlock {
          width: 100%;
          height: 46px;
          background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);
          border: none;
          border-radius: 10px;
          color: #ffffff;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: opacity 0.2s, transform 0.1s;
        }

        .btn-unlock:hover:not(:disabled) {
          opacity: 0.92;
        }

        .btn-unlock:active:not(:disabled) {
          transform: scale(0.99);
        }

        .btn-unlock:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .link-btn {
          background: none;
          border: none;
          color: var(--text-secondary);
          font-size: 12px;
          margin-top: 10px;
          cursor: pointer;
          text-decoration: underline;
          padding: 4px;
        }

        .link-btn:hover {
          color: var(--text-primary);
        }

        .recovery-key-box {
          background: var(--input-bg);
          border: 1px dashed #e1306c;
          border-radius: 10px;
          padding: 14px;
          font-family: monospace;
          font-size: 16px;
          font-weight: 700;
          letter-spacing: 1px;
          color: var(--text-primary);
          margin: 12px 0;
          user-select: all;
        }

        .spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          display: none;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .btn-unlock.loading .spinner {
          display: inline-block;
        }

        .btn-unlock.loading .btn-text {
          display: none;
        }

        .setup-notice {
          font-size: 13px;
          color: var(--text-secondary);
          margin-top: 14px;
        }

        .setup-link {
          color: #e1306c;
          text-decoration: underline;
          cursor: pointer;
          background: none;
          border: none;
          font-size: 13px;
        }
      </style>

      <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="lock-title">
        <div class="card" id="ig-card">
          <div class="icon-container" aria-hidden="true">
            <div class="icon-inner">
              <svg viewBox="0 0 24 24">
                <path d="${ICONS.LOCK_PATH}"/>
              </svg>
            </div>
          </div>

          <h1 class="title" id="lock-title">Instagram Locked</h1>
          <p class="subtitle" id="lock-subtitle">
            ${isConfigured
              ? 'Enter your master password to access Instagram.'
              : 'Master password has not been configured yet.'}
          </p>

          ${isConfigured ? `
            <!-- Standard Unlock Form -->
            <form class="form" id="ig-lock-form">
              <div class="input-group">
                <label for="ig-lock-input" class="sr-only">Master password</label>
                <input
                  type="password"
                  class="input-field"
                  id="ig-lock-input"
                  placeholder="Master password"
                  aria-label="Master password"
                  autocomplete="current-password"
                  maxlength="128"
                  required
                />
                <button
                  type="button"
                  class="toggle-btn"
                  id="ig-toggle-pw"
                  title="Show password"
                  aria-label="Toggle password visibility"
                  aria-pressed="false"
                >
                  <svg viewBox="0 0 24 24">
                    <path id="ig-eye-path" d="${ICONS.EYE_OPEN_PATH}"/>
                  </svg>
                </button>
              </div>

              <div class="error-msg" id="ig-error-banner" role="alert" aria-live="polite"></div>

              <button type="submit" class="btn-unlock" id="ig-unlock-btn">
                <span class="btn-text">Unlock Session</span>
                <span class="spinner"></span>
              </button>

              <button type="button" class="link-btn" id="ig-show-recovery">
                Forgot password? Use recovery key
              </button>
            </form>

            <!-- Offline Recovery Key Form -->
            <form class="form hidden" id="ig-recovery-form">
              <div class="input-group">
                <label for="ig-rec-key-input" class="sr-only">Emergency Recovery Key</label>
                <input
                  type="text"
                  class="input-field"
                  id="ig-rec-key-input"
                  placeholder="Recovery Key (XXXX-XXXX-XXXX-XXXX)"
                  aria-label="Emergency Recovery Key"
                  maxlength="32"
                  required
                />
              </div>
              <div class="input-group">
                <label for="ig-rec-new-pw" class="sr-only">New master password</label>
                <input
                  type="password"
                  class="input-field"
                  id="ig-rec-new-pw"
                  placeholder="New password (min 8 chars, mixed types)"
                  aria-label="New master password"
                  autocomplete="new-password"
                  maxlength="128"
                  required
                />
              </div>

              <div class="error-msg" id="ig-rec-error" role="alert" aria-live="polite"></div>

              <button type="submit" class="btn-unlock" id="ig-rec-submit">
                <span class="btn-text">Reset Password & Unlock</span>
                <span class="spinner"></span>
              </button>

              <button type="button" class="link-btn" id="ig-back-login">
                Back to password unlock
              </button>
            </form>

            <!-- New Rotated Recovery Key Confirmation -->
            <div class="form hidden" id="ig-recovery-success">
              <p class="subtitle" style="margin-bottom:8px;">
                Password reset complete! Save your <strong>new</strong> recovery key before continuing:
              </p>
              <div class="recovery-key-box" id="ig-new-rec-key"></div>
              <button type="button" class="btn-unlock" id="ig-rec-continue">
                Copy Key & Open Instagram
              </button>
            </div>
          ` : `
            <p class="setup-notice">
              Please <button type="button" class="setup-link" id="ig-open-setup">click here to set up your master password</button>.
            </p>
          `}
        </div>
      </div>
    `;

    this.bindEvents(isConfigured);
  }

  bindEvents(isConfigured) {
    if (!isConfigured) {
      const setupLink = this._shadowRoot.querySelector('#ig-open-setup');
      if (setupLink) {
        setupLink.addEventListener('click', async () => {
          try {
            await sendExtensionMessage(ACTIONS.OPEN_SETUP_PAGE);
          } catch (err) {
            console.error('[IG-Lock] Failed to open setup page:', err);
          }
        });
      }
      return;
    }

    const form = this._shadowRoot.querySelector('#ig-lock-form');
    const input = this._shadowRoot.querySelector('#ig-lock-input');
    const toggleBtn = this._shadowRoot.querySelector('#ig-toggle-pw');
    const eyePath = this._shadowRoot.querySelector('#ig-eye-path');
    const unlockBtn = this._shadowRoot.querySelector('#ig-unlock-btn');
    const errorBanner = this._shadowRoot.querySelector('#ig-error-banner');
    const card = this._shadowRoot.querySelector('#ig-card');
    const subtitle = this._shadowRoot.querySelector('#lock-subtitle');

    const showRecoveryBtn = this._shadowRoot.querySelector('#ig-show-recovery');
    const recoveryForm = this._shadowRoot.querySelector('#ig-recovery-form');
    const backLoginBtn = this._shadowRoot.querySelector('#ig-back-login');
    const recKeyInput = this._shadowRoot.querySelector('#ig-rec-key-input');
    const recNewPwInput = this._shadowRoot.querySelector('#ig-rec-new-pw');
    const recError = this._shadowRoot.querySelector('#ig-rec-error');
    const recSubmit = this._shadowRoot.querySelector('#ig-rec-submit');
    const recSuccessView = this._shadowRoot.querySelector('#ig-recovery-success');
    const newRecKeyEl = this._shadowRoot.querySelector('#ig-new-rec-key');
    const recContinueBtn = this._shadowRoot.querySelector('#ig-rec-continue');

    // UX-07 & UX-06: Toggle password visibility with eye/eye-slash icon & aria-pressed
    if (toggleBtn && input && eyePath) {
      toggleBtn.addEventListener('click', () => {
        const isCurrentlyHidden = input.type === 'password';
        input.type = isCurrentlyHidden ? 'text' : 'password';
        eyePath.setAttribute('d', isCurrentlyHidden ? ICONS.EYE_SLASH_PATH : ICONS.EYE_OPEN_PATH);
        toggleBtn.setAttribute('aria-pressed', String(isCurrentlyHidden));
        toggleBtn.setAttribute('title', isCurrentlyHidden ? 'Hide password' : 'Show password');
      });
    }

    // Switch to recovery form
    showRecoveryBtn.addEventListener('click', () => {
      form.classList.add('hidden');
      recoveryForm.classList.remove('hidden');
      subtitle.textContent = 'Enter your 16-character recovery key and choose a new password.';
      recKeyInput.focus();
    });

    // Switch back to unlock form
    backLoginBtn.addEventListener('click', () => {
      recoveryForm.classList.add('hidden');
      form.classList.remove('hidden');
      subtitle.textContent = 'Enter your master password to access Instagram.';
      input.focus();
    });

    // Submit unlock form
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = input.value;
      if (!password) return;

      unlockBtn.disabled = true;
      unlockBtn.classList.add('loading');
      this.clearError(errorBanner);

      try {
        const response = await sendExtensionMessage(ACTIONS.VERIFY_PASSWORD, { password });

        if (response && response.success) {
          this.unmount();
          if (this.onAuthenticated) {
            this.onAuthenticated();
          }
        } else {
          card.classList.remove('shake');
          void card.offsetWidth;
          card.classList.add('shake');

          input.value = '';
          input.focus();

          const lockoutSeconds = response?.lockoutSeconds || 0;
          if (lockoutSeconds > 0) {
            this.startLockoutCountdown(lockoutSeconds, errorBanner, unlockBtn, input);
          } else {
            this.showError(errorBanner, response?.error || 'Incorrect password.');
          }
        }
      } catch (err) {
        this.showError(errorBanner, 'An error occurred. Please try again.');
      } finally {
        if (this.lockoutSecondsRemaining <= 0) {
          unlockBtn.disabled = false;
        }
        unlockBtn.classList.remove('loading');
      }
    });

    // Submit recovery form
    recoveryForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.clearError(recError);

      const recoveryKey = recKeyInput.value.trim();
      const newPassword = recNewPwInput.value;

      if (!recoveryKey || !newPassword) return;

      recSubmit.disabled = true;
      recSubmit.classList.add('loading');

      try {
        const res = await sendExtensionMessage(ACTIONS.RECOVER_WITH_KEY, {
          recoveryKey,
          newPassword
        });

        if (res && res.success) {
          recoveryForm.classList.add('hidden');
          recSuccessView.classList.remove('hidden');
          newRecKeyEl.textContent = res.data.newRecoveryKey;
        } else {
          this.showError(recError, res?.error || 'Recovery failed.');
        }
      } catch (err) {
        this.showError(recError, 'Recovery error occurred.');
      } finally {
        recSubmit.disabled = false;
        recSubmit.classList.remove('loading');
      }
    });

    // Continue after recovery
    recContinueBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(newRecKeyEl.textContent);
      } catch {
        // Clipboard permission optional
      }
      this.unmount();
      if (this.onAuthenticated) {
        this.onAuthenticated();
      }
    });

    this.trapFocus();
  }

  /**
   * UX-01: Focus trap correctly inspecting this._shadowRoot.activeElement.
   */
  trapFocus() {
    this._shadowRoot.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;

      const focusable = Array.from(
        this._shadowRoot.querySelectorAll('input:not(:disabled), button:not(:disabled), a[href]')
      ).filter(el => el.offsetParent !== null);

      if (focusable.length === 0) return;

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];
      const currentActive = this._shadowRoot.activeElement;

      if (e.shiftKey && currentActive === firstElement) {
        lastElement.focus();
        e.preventDefault();
      } else if (!e.shiftKey && currentActive === lastElement) {
        firstElement.focus();
        e.preventDefault();
      } else if (!currentActive) {
        firstElement.focus();
        e.preventDefault();
      }
    });
  }

  showError(banner, message) {
    if (!banner) return;
    banner.textContent = message;
    banner.classList.add('visible');
  }

  clearError(banner) {
    if (!banner) return;
    banner.textContent = '';
    banner.classList.remove('visible');
  }

  startLockoutCountdown(seconds, banner, unlockBtn, input) {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }

    this.lockoutSecondsRemaining = seconds;
    unlockBtn.disabled = true;
    input.disabled = true;

    const updateText = () => {
      this.showError(
        banner,
        `Too many failed attempts. Try again in ${this.lockoutSecondsRemaining}s.`
      );
    };

    updateText();

    this.countdownInterval = setInterval(() => {
      this.lockoutSecondsRemaining--;
      if (this.lockoutSecondsRemaining <= 0) {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
        this.clearError(banner);
        unlockBtn.disabled = false;
        input.disabled = false;
        input.focus();
      } else {
        updateText();
      }
    }, 1000);
  }
}
