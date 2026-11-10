/**
 * Instagram Lock - Session Manager
 * Manages active browser session authentication state using chrome.storage.session.
 * Session state is cleared automatically when all browser windows are closed.
 */

import { STORAGE_KEYS } from '../shared/constants.js';
import { getSession, setSessionMulti, clearSessionAuth } from '../shared/storage.js';

export class SessionManager {
  /**
   * Checks if the current session is unlocked.
   * @returns {Promise<boolean>}
   */
  static async isUnlocked() {
    const isAuth = await getSession(STORAGE_KEYS.SESSION.IS_AUTHENTICATED, false);
    return Boolean(isAuth);
  }

  /**
   * Marks the session as authenticated and starts tracking activity.
   */
  static async unlock() {
    const now = Date.now();
    await setSessionMulti({
      [STORAGE_KEYS.SESSION.IS_AUTHENTICATED]: true,
      [STORAGE_KEYS.SESSION.UNLOCKED_AT]: now,
      [STORAGE_KEYS.SESSION.LAST_ACTIVITY]: now
    });
  }

  /**
   * Locks the active session immediately.
   */
  static async lock() {
    await clearSessionAuth();
  }

  /**
   * Updates the timestamp of the most recent user activity.
   */
  static async updateActivity() {
    const isAuth = await this.isUnlocked();
    if (isAuth) {
      await chrome.storage.session.set({
        [STORAGE_KEYS.SESSION.LAST_ACTIVITY]: Date.now()
      });
    }
  }

  /**
   * Returns the timestamp of the last recorded user interaction.
   * @returns {Promise<number>}
   */
  static async getLastActivity() {
    const last = await getSession(STORAGE_KEYS.SESSION.LAST_ACTIVITY, 0);
    return Number(last) || 0;
  }
}
