/**
 * Instagram Lock - Content Script Main Entrypoint
 * Coordinates anti-flash veil dismissal, closed Shadow DOM lock screen mounting,
 * multi-tab synchronization, port monitoring, SPA route protection, and DOM tamper defense.
 */

import { ACTIONS, LOCK_SCOPES, THEME_MODES, shouldLockRoute } from '../shared/constants.js';
import { sendExtensionMessage } from '../shared/messaging.js';
import { LockScreenManager } from './lock-screen.js';
import { ActivityTracker } from './activity-tracker.js';

let lockScreen = null;
let activityTracker = null;
let isOverlayActive = true;
let sessionUnlocked = false;
let isExtensionConfigured = false;
let activeLockScope = LOCK_SCOPES.FULL;
let activeThemeMode = THEME_MODES.AUTO;
let activeLockoutSeconds = 0;
let lastObservedUrl = window.location.href;
let monitorPort = null;

/**
 * Smoothly dismisses the initial anti-FOUC preloader veil.
 */
function removePreloaderShield() {
  const overlay = document.getElementById('ig-lock-preloader-overlay');
  const style = document.getElementById('ig-lock-preloader-shield');

  if (overlay) {
    overlay.classList.add('ig-lock-fade-out');
    setTimeout(() => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (style && style.parentNode) style.parentNode.removeChild(style);
    }, 200);
  } else if (style) {
    style.remove();
  }
}

/**
 * Evaluates whether the current route requires the lock screen given session status and lockScope.
 */
function evaluateRouteProtection(lockoutSeconds = 0) {
  const routeRequiresLock = shouldLockRoute(window.location.pathname, activeLockScope);

  if (!isExtensionConfigured || (!sessionUnlocked && routeRequiresLock)) {
    applyLock(isExtensionConfigured, lockoutSeconds || activeLockoutSeconds);
  } else {
    applyUnlock();
  }
}

/**
 * Applies locked state to this tab.
 */
function applyLock(isConfigured = true, lockoutSeconds = 0) {
  isOverlayActive = true;
  activityTracker.stop();
  lockScreen.mount(isConfigured, lockoutSeconds, activeThemeMode);
  removePreloaderShield();
}

/**
 * Applies unlocked state to this tab.
 */
function applyUnlock() {
  isOverlayActive = false;
  lockScreen.unmount();
  if (sessionUnlocked) {
    activityTracker.start();
  } else {
    activityTracker.stop();
  }
  removePreloaderShield();
}

/**
 * Handles extension context invalidation (EDG-01).
 */
function handleContextInvalidation() {
  isOverlayActive = true;
  activityTracker.stop();
  lockScreen.mountContextInvalidated();
  removePreloaderShield();
}

/**
 * Refreshes status from background worker and applies lock/unlock accordingly.
 */
async function syncStatusFromBackground() {
  try {
    const response = await sendExtensionMessage(ACTIONS.GET_STATUS);

    if (response && response.contextInvalidated) {
      handleContextInvalidation();
      return;
    }

    if (response && response.success && response.data) {
      const data = response.data;
      isExtensionConfigured = Boolean(data.isConfigured);
      sessionUnlocked = Boolean(data.isUnlocked);
      activeLockScope = data.lockScope || LOCK_SCOPES.FULL;
      activeThemeMode = data.themeMode || THEME_MODES.AUTO;
      activeLockoutSeconds = Number(data.lockoutSeconds) || 0;

      activityTracker.configure(data.timeoutMinutes, data.autoLockEnabled);
      evaluateRouteProtection(activeLockoutSeconds);
    } else {
      // Fail closed
      applyLock(true, 0);
    }
  } catch (err) {
    console.error('[IG-Lock] Failed to check status on startup:', err);
    applyLock(true, 0);
  }
}

/**
 * Initializes the content script.
 */
export async function init() {
  activityTracker = new ActivityTracker(() => handleContextInvalidation());
  lockScreen = new LockScreenManager(() => {
    sessionUnlocked = true;
    activeLockoutSeconds = 0;
    applyUnlock();
  });

  // Establish lifecycle port for lockOnClose monitoring without 'tabs' permission (MV3-02)
  try {
    monitorPort = chrome.runtime.connect({ name: 'ig-tab-monitor' });
    monitorPort.onDisconnect.addListener(() => {
      // If runtime.id is gone, extension was reloaded/disabled -> trigger fail-closed curtain
      if (!chrome.runtime?.id) {
        handleContextInvalidation();
      }
    });
  } catch (err) {
    console.warn('[IG-Lock] Monitor port warning:', err);
  }

  await syncStatusFromBackground();

  // --- Multi-tab Synchronization Listener ---
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || !message.action) return;

    switch (message.action) {
      case ACTIONS.SYNC_LOCK:
        sessionUnlocked = false;
        syncStatusFromBackground();
        break;

      case ACTIONS.SYNC_UNLOCK:
        sessionUnlocked = true;
        activeLockoutSeconds = 0;
        syncStatusFromBackground();
        break;

      case ACTIONS.SYNC_LOCKOUT:
        if (isOverlayActive && message.lockoutSeconds > 0) {
          activeLockoutSeconds = message.lockoutSeconds;
          lockScreen.syncLockout(message.lockoutSeconds);
        }
        break;
    }
  });

  // --- SPA Route & Tamper Protection ---
  setupDomAndRouteGuard();
}

/**
 * Handles SPA route updates (EDG-05) and prevents lock screen removal or CSS hiding (SEC-02).
 */
function onRouteChanged() {
  const currentUrl = window.location.href;
  if (currentUrl !== lastObservedUrl) {
    lastObservedUrl = currentUrl;
    evaluateRouteProtection(0);
    if (sessionUnlocked) {
      sendExtensionMessage(ACTIONS.RECORD_ACTIVITY);
    }
  }
}

function setupDomAndRouteGuard() {
  let isCheckingMutation = false;

  // SEC-02: Observe entire document tree (subtree: true) and visibility attributes
  const observer = new MutationObserver(() => {
    if (isCheckingMutation) return;
    isCheckingMutation = true;

    try {
      // Check for SPA history.pushState URL transitions (EDG-05)
      if (window.location.href !== lastObservedUrl) {
        onRouteChanged();
      }

      if (isOverlayActive) {
        const host = document.getElementById('ig-lock-screen-host');
        if (!host || !document.contains(host)) {
          console.warn('[IG-Lock Guard] Lock host detached while locked. Re-mounting.');
          lockScreen.mount(isExtensionConfigured, activeLockoutSeconds, activeThemeMode);
        } else if (!lockScreen.isEffectivelyMounted()) {
          console.warn('[IG-Lock Guard] Lock host visibility tampered. Restoring.');
          lockScreen.restoreVisibility();
        }
      }
    } finally {
      isCheckingMutation = false;
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden']
  });

  // Intercept popstate and modern Navigation API (EDG-05)
  window.addEventListener('popstate', () => onRouteChanged());
  if ('navigation' in window && window.navigation && typeof window.navigation.addEventListener === 'function') {
    window.navigation.addEventListener('navigatesuccess', () => onRouteChanged());
  }
}
