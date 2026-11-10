/**
 * Instagram Lock - Background Service Worker
 * Central event orchestrator, role-validated message router, and session lifecycle manager.
 */

import { ACTIONS, ALARMS } from '../shared/constants.js';
import {
  isTrustedSender,
  isPrivilegedExtensionContext,
  broadcastToInstagramTabs
} from '../shared/messaging.js';
import {
  getSettings,
  saveSettings,
  appendAuditLog,
  getAuditLog,
  clearAuditLog
} from '../shared/storage.js';
import { AuthManager } from './auth-manager.js';
import { SessionManager } from './session-manager.js';
import { InactivityManager } from './inactivity-manager.js';

// Actions restricted strictly to privileged extension pages (popup, options, setup)
const PRIVILEGED_ACTIONS = new Set([
  ACTIONS.SET_PASSWORD,
  ACTIONS.CHANGE_PASSWORD,
  ACTIONS.UPDATE_SETTINGS,
  ACTIONS.GET_SETTINGS,
  ACTIONS.GET_AUDIT_LOG,
  ACTIONS.CLEAR_AUDIT_LOG,
  ACTIONS.REGENERATE_RECOVERY_KEY
]);

/**
 * Helper to lock session when all Instagram tabs are closed/navigated away and lockOnClose is enabled.
 */
async function evaluateLockOnClose(closedTabId = null) {
  try {
    const settings = await getSettings();
    if (!settings.lockOnClose) return;

    const isUnlocked = await SessionManager.isUnlocked();
    if (!isUnlocked) return;

    const openInstagramTabs = await chrome.tabs.query({ url: 'https://*.instagram.com/*' });
    const remainingTabs = closedTabId !== null
      ? openInstagramTabs.filter(tab => tab.id !== closedTabId)
      : openInstagramTabs;

    if (remainingTabs.length === 0) {
      console.log('[IG-Lock] All Instagram tabs closed. Locking session (lockOnClose active).');
      await SessionManager.lock();
      await InactivityManager.syncAlarm();
      await appendAuditLog('Auto-Lock (Tabs Closed)', 'Tab Lifecycle', true);
    }
  } catch (err) {
    console.error('[IG-Lock] Error evaluating lockOnClose:', err);
  }
}

// --- Lifecycle: Extension Installation ---
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[IG-Lock ServiceWorker] Installed / Updated event:', details.reason);
  const isConfigured = await AuthManager.isConfigured();

  if (!isConfigured) {
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/setup.html') });
  }

  await InactivityManager.syncAlarm();
});

// --- Lifecycle: Browser Startup (MV3-01) ---
chrome.runtime.onStartup.addListener(async () => {
  console.log('[IG-Lock ServiceWorker] Browser startup detected. Enforcing clean locked state.');
  await SessionManager.lock();
  await InactivityManager.syncAlarm();
});

// --- Port Monitor for Tab Closure / Navigation Away without 'tabs' permission (MV3-02) ---
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'ig-tab-monitor') {
    port.onDisconnect.addListener(() => {
      // Short delay distinguishes page refresh from closing or navigating away
      setTimeout(() => {
        evaluateLockOnClose();
      }, 250);
    });
  }
});

// --- Message Router ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isTrustedSender(sender)) {
    sendResponse({ success: false, error: 'Unauthorized sender context.' });
    return false;
  }

  const { action } = message || {};
  if (!action || typeof action !== 'string') {
    sendResponse({ success: false, error: 'Invalid message format.' });
    return false;
  }

  // Enforce Role-Based Context Separation (SEC-04)
  if (PRIVILEGED_ACTIONS.has(action) && !isPrivilegedExtensionContext(sender)) {
    console.warn(`[IG-Lock Security] Rejected privileged action "${action}" from unprivileged context:`, sender.url);
    sendResponse({ success: false, error: 'Action requires privileged extension context.' });
    return false;
  }

  const originLabel = isPrivilegedExtensionContext(sender) ? 'Extension UI' : 'Instagram Tab';

  (async () => {
    try {
      switch (action) {
        case ACTIONS.GET_STATUS: {
          const isConfigured = await AuthManager.isConfigured();
          const isUnlocked = await SessionManager.isUnlocked();
          const lockout = await AuthManager.checkLockout();
          const settings = await getSettings();

          sendResponse({
            success: true,
            data: {
              isConfigured,
              isUnlocked,
              isLockedOut: lockout.isLockedOut,
              lockoutSeconds: lockout.remainingSeconds,
              timeoutMinutes: settings.timeoutMinutes,
              autoLockEnabled: settings.autoLockEnabled,
              lockOnClose: settings.lockOnClose,
              lockScope: settings.lockScope,
              themeMode: settings.themeMode
            }
          });
          break;
        }

        case ACTIONS.OPEN_SETUP_PAGE: {
          const isConfigured = await AuthManager.isConfigured();
          if (!isConfigured) {
            chrome.tabs.create({ url: chrome.runtime.getURL('pages/setup.html') });
          }
          sendResponse({ success: true });
          break;
        }

        case ACTIONS.SET_PASSWORD: {
          const { password } = message;
          const { recoveryKey } = await AuthManager.setInitialPassword(password);
          await SessionManager.unlock();
          await InactivityManager.syncAlarm();
          await appendAuditLog('Initial Setup & Unlock', originLabel, true);
          await broadcastToInstagramTabs({ action: ACTIONS.SYNC_UNLOCK });

          sendResponse({ success: true, data: { recoveryKey } });
          break;
        }

        case ACTIONS.VERIFY_PASSWORD: {
          const { password } = message;
          const result = await AuthManager.verify(password);

          if (result.success) {
            await SessionManager.unlock();
            await InactivityManager.syncAlarm();
            await appendAuditLog('Unlock Attempt', originLabel, true);
            await broadcastToInstagramTabs({ action: ACTIONS.SYNC_UNLOCK });
            sendResponse({ success: true });
          } else {
            await appendAuditLog('Unlock Attempt', originLabel, false);
            if (result.lockoutSeconds > 0) {
              await broadcastToInstagramTabs({
                action: ACTIONS.SYNC_LOCKOUT,
                lockoutSeconds: result.lockoutSeconds
              });
            }
            sendResponse({
              success: false,
              error: result.error,
              lockoutSeconds: result.lockoutSeconds || 0
            });
          }
          break;
        }

        case ACTIONS.RECOVER_WITH_KEY: {
          const { recoveryKey, newPassword } = message;
          const result = await AuthManager.recoverWithKey(recoveryKey, newPassword);

          if (result.success) {
            await SessionManager.unlock();
            await InactivityManager.syncAlarm();
            await appendAuditLog('Password Recovery Reset', originLabel, true);
            await broadcastToInstagramTabs({ action: ACTIONS.SYNC_UNLOCK });
            sendResponse({ success: true, data: { newRecoveryKey: result.newRecoveryKey } });
          } else {
            await appendAuditLog('Password Recovery Attempt', originLabel, false);
            if (result.lockoutSeconds > 0) {
              await broadcastToInstagramTabs({
                action: ACTIONS.SYNC_LOCKOUT,
                lockoutSeconds: result.lockoutSeconds
              });
            }
            sendResponse({
              success: false,
              error: result.error,
              lockoutSeconds: result.lockoutSeconds || 0
            });
          }
          break;
        }

        case ACTIONS.REGENERATE_RECOVERY_KEY: {
          const { currentPassword } = message;
          const { recoveryKey } = await AuthManager.regenerateRecoveryKey(currentPassword);
          await appendAuditLog('Recovery Key Regenerated', originLabel, true);
          sendResponse({ success: true, data: { recoveryKey } });
          break;
        }

        case ACTIONS.LOCK_NOW: {
          await SessionManager.lock();
          await InactivityManager.syncAlarm();
          await appendAuditLog('Manual Lock', originLabel, true);
          await broadcastToInstagramTabs({ action: ACTIONS.SYNC_LOCK });
          sendResponse({ success: true });
          break;
        }

        case ACTIONS.CHANGE_PASSWORD: {
          const { currentPassword, newPassword } = message;
          await AuthManager.changePassword(currentPassword, newPassword);
          await appendAuditLog('Password Changed', originLabel, true);
          sendResponse({ success: true });
          break;
        }

        case ACTIONS.RECORD_ACTIVITY: {
          await SessionManager.updateActivity();
          sendResponse({ success: true });
          break;
        }

        case ACTIONS.CHECK_INACTIVITY: {
          const didLock = await InactivityManager.checkInactivity();
          sendResponse({ success: true, data: { didLock } });
          break;
        }

        case ACTIONS.GET_SETTINGS: {
          const settings = await getSettings();
          sendResponse({ success: true, data: settings });
          break;
        }

        case ACTIONS.UPDATE_SETTINGS: {
          const { settings } = message;
          const updated = await saveSettings(settings);
          await InactivityManager.syncAlarm();
          // Re-evaluate lock scope or theme on active tabs if needed
          const isUnlocked = await SessionManager.isUnlocked();
          if (!isUnlocked) {
            await broadcastToInstagramTabs({ action: ACTIONS.SYNC_LOCK });
          } else {
            await broadcastToInstagramTabs({ action: ACTIONS.SYNC_UNLOCK });
          }
          sendResponse({ success: true, data: updated });
          break;
        }

        case ACTIONS.GET_AUDIT_LOG: {
          const log = await getAuditLog();
          sendResponse({ success: true, data: log });
          break;
        }

        case ACTIONS.CLEAR_AUDIT_LOG: {
          await clearAuditLog();
          sendResponse({ success: true });
          break;
        }

        default:
          sendResponse({ success: false, error: `Unknown action: ${action}` });
      }
    } catch (err) {
      console.error(`[IG-Lock ServiceWorker] Error processing action "${action}":`, err);
      sendResponse({ success: false, error: err.message || 'Internal error' });
    }
  })();

  return true;
});

// --- Keyboard Shortcut Quick Lock Command (P0) ---
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'quick-lock') {
    const isUnlocked = await SessionManager.isUnlocked();
    if (isUnlocked) {
      await SessionManager.lock();
      await InactivityManager.syncAlarm();
      await appendAuditLog('Quick Lock Shortcut', 'Keyboard Command', true);
      await broadcastToInstagramTabs({ action: ACTIONS.SYNC_LOCK });
    }
  }
});

// --- Inactivity Alarms ---
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARMS.INACTIVITY_CHECK) {
    await InactivityManager.checkInactivity();
  }
});

// --- Tab Focus & Activation Hooks ---
chrome.tabs.onActivated.addListener(async () => {
  await InactivityManager.onFocusOrTabSwitch();
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    await InactivityManager.onFocusOrTabSwitch();
  }
});

// --- Tab Closure Hook ---
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await evaluateLockOnClose(tabId);
});

// --- System Idle & Workstation Lock Hooks ---
chrome.idle.onStateChanged.addListener(async (newState) => {
  await InactivityManager.onIdleStateChanged(newState);
});
