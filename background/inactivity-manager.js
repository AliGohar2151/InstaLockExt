/**
 * Instagram Lock - Inactivity Manager
 * Monitors user inactivity using timestamps, chrome.alarms, and chrome.idle.
 * Automatically locks the session across all tabs when the timeout expires
 * or when the OS workstation is locked.
 */

import { ALARMS, ACTIONS } from '../shared/constants.js';
import { getSettings, appendAuditLog } from '../shared/storage.js';
import { broadcastToInstagramTabs } from '../shared/messaging.js';
import { SessionManager } from './session-manager.js';

export class InactivityManager {
  /**
   * Initializes or refreshes the periodic alarm.
   */
  static async syncAlarm() {
    const isAuth = await SessionManager.isUnlocked();
    const settings = await getSettings();

    if (!isAuth || !settings.autoLockEnabled || settings.timeoutMinutes <= 0) {
      await chrome.alarms.clear(ALARMS.INACTIVITY_CHECK);
      return;
    }

    // Chrome Alarms minimum period is 1 minute
    await chrome.alarms.create(ALARMS.INACTIVITY_CHECK, {
      periodInMinutes: 1
    });
  }

  /**
   * Evaluates if the current session has exceeded the configured inactivity threshold.
   * If expired, triggers immediate lock and tab broadcast.
   * @returns {Promise<boolean>} true if session was locked
   */
  static async checkInactivity() {
    const isAuth = await SessionManager.isUnlocked();
    if (!isAuth) return false;

    const settings = await getSettings();
    if (!settings.autoLockEnabled || settings.timeoutMinutes <= 0) {
      return false;
    }

    const lastActivity = await SessionManager.getLastActivity();
    if (!lastActivity) return false;

    const elapsedMs = Date.now() - lastActivity;
    const timeoutMs = settings.timeoutMinutes * 60 * 1000;

    if (elapsedMs >= timeoutMs) {
      console.log(`[IG-Lock Inactivity] Timeout reached (${elapsedMs}ms >= ${timeoutMs}ms). Locking session.`);
      await SessionManager.lock();
      await chrome.alarms.clear(ALARMS.INACTIVITY_CHECK);
      await appendAuditLog('Auto-Lock (Inactivity)', 'Background Alarm', true);
      await broadcastToInstagramTabs({ action: ACTIONS.SYNC_LOCK });
      return true;
    }
    return false;
  }

  /**
   * Called when an Instagram tab receives focus or system idle triggers.
   */
  static async onFocusOrTabSwitch() {
    await this.checkInactivity();
  }

  /**
   * System idle listener callback.
   * Immediately locks when workstation screen is locked (UX-02).
   * @param {'active'|'idle'|'locked'} newState
   */
  static async onIdleStateChanged(newState) {
    if (newState === 'locked') {
      const isAuth = await SessionManager.isUnlocked();
      if (isAuth) {
        console.log('[IG-Lock] Workstation locked. Securing session immediately.');
        await SessionManager.lock();
        await chrome.alarms.clear(ALARMS.INACTIVITY_CHECK);
        await appendAuditLog('Auto-Lock (OS Locked)', 'System Idle', true);
        await broadcastToInstagramTabs({ action: ACTIONS.SYNC_LOCK });
      }
    } else if (newState === 'idle') {
      await this.checkInactivity();
    }
  }
}
