/**
 * Instagram Lock - Shared Constants
 * Centralizes message types, storage keys, password policy, SVG icons, and configuration defaults.
 */

export const ACTIONS = Object.freeze({
  // Authentication & Status
  GET_STATUS: 'IG_LOCK_GET_STATUS',
  VERIFY_PASSWORD: 'IG_LOCK_VERIFY_PASSWORD',
  SET_PASSWORD: 'IG_LOCK_SET_PASSWORD',
  CHANGE_PASSWORD: 'IG_LOCK_CHANGE_PASSWORD',
  LOCK_NOW: 'IG_LOCK_LOCK_NOW',
  OPEN_SETUP_PAGE: 'IG_LOCK_OPEN_SETUP_PAGE',

  // Recovery
  RECOVER_WITH_KEY: 'IG_LOCK_RECOVER_WITH_KEY',
  REGENERATE_RECOVERY_KEY: 'IG_LOCK_REGENERATE_RECOVERY_KEY',

  // Activity & Settings
  RECORD_ACTIVITY: 'IG_LOCK_RECORD_ACTIVITY',
  CHECK_INACTIVITY: 'IG_LOCK_CHECK_INACTIVITY',
  GET_SETTINGS: 'IG_LOCK_GET_SETTINGS',
  UPDATE_SETTINGS: 'IG_LOCK_UPDATE_SETTINGS',

  // Security Audit Log
  GET_AUDIT_LOG: 'IG_LOCK_GET_AUDIT_LOG',
  CLEAR_AUDIT_LOG: 'IG_LOCK_CLEAR_AUDIT_LOG',

  // Tab Sync Broadcasts
  SYNC_LOCK: 'IG_LOCK_SYNC_LOCK',
  SYNC_UNLOCK: 'IG_LOCK_SYNC_UNLOCK',
  SYNC_LOCKOUT: 'IG_LOCK_SYNC_LOCKOUT'
});

export const STORAGE_KEYS = Object.freeze({
  LOCAL: {
    PASSWORD_HASH: 'ig_lock_password_hash',
    PASSWORD_SALT: 'ig_lock_password_salt',
    PASSWORD_ITERATIONS: 'ig_lock_password_iterations',
    RECOVERY_HASH: 'ig_lock_recovery_hash',
    RECOVERY_SALT: 'ig_lock_recovery_salt',
    IS_CONFIGURED: 'ig_lock_is_configured',
    FAILED_ATTEMPTS: 'ig_lock_failed_attempts',
    LOCKOUT_UNTIL: 'ig_lock_lockout_until',
    LOCKOUT_STARTED_AT: 'ig_lock_lockout_started_at',
    SETTINGS: 'ig_lock_settings',
    AUDIT_LOG: 'ig_lock_audit_log'
  },
  SESSION: {
    IS_AUTHENTICATED: 'ig_lock_session_authenticated',
    LAST_ACTIVITY: 'ig_lock_session_last_activity',
    UNLOCKED_AT: 'ig_lock_session_unlocked_at'
  }
});

export const LOCK_SCOPES = Object.freeze({
  FULL: 'full',
  REELS_EXPLORE: 'reels_explore',
  DMS: 'dms'
});

export const THEME_MODES = Object.freeze({
  AUTO: 'auto',
  DARK: 'dark',
  LIGHT: 'light'
});

export const DEFAULTS = Object.freeze({
  TIMEOUT_MINUTES: 5,
  AUTO_LOCK_ENABLED: true,
  LOCK_ON_CLOSE: false,
  LOCK_SCOPE: LOCK_SCOPES.FULL,
  THEME_MODE: THEME_MODES.AUTO,
  // 0 represents 'Never'
  TIMEOUT_OPTIONS: [1, 5, 10, 15, 30, 0],
  ALLOWED_SCOPES: [LOCK_SCOPES.FULL, LOCK_SCOPES.REELS_EXPLORE, LOCK_SCOPES.DMS],
  ALLOWED_THEMES: [THEME_MODES.AUTO, THEME_MODES.DARK, THEME_MODES.LIGHT],
  MAX_AUDIT_ENTRIES: 30
});

export const ALARMS = Object.freeze({
  INACTIVITY_CHECK: 'ig_lock_inactivity_check'
});

export const CRYPTO_CONFIG = Object.freeze({
  ITERATIONS: 600000,
  LEGACY_ITERATIONS: 100000,
  SALT_BYTES: 16,
  HASH_ALGO: 'SHA-256',
  KEY_LENGTH_BITS: 256
});

export const PASSWORD_POLICY = Object.freeze({
  MIN_LENGTH: 8,
  MAX_LENGTH: 128
});

export const ICONS = Object.freeze({
  LOCK_PATH: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z',
  EYE_OPEN_PATH: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z',
  EYE_SLASH_PATH: 'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z'
});

/**
 * Validates whether a new password satisfies security complexity and length limits.
 * @param {string} password
 * @returns {{ valid: boolean, error?: string }}
 */
export function validatePasswordPolicy(password) {
  if (typeof password !== 'string') {
    return { valid: false, error: 'Password must be a string.' };
  }
  if (password.length < PASSWORD_POLICY.MIN_LENGTH) {
    return {
      valid: false,
      error: `Password must be at least ${PASSWORD_POLICY.MIN_LENGTH} characters long.`
    };
  }
  if (password.length > PASSWORD_POLICY.MAX_LENGTH) {
    return {
      valid: false,
      error: `Password must not exceed ${PASSWORD_POLICY.MAX_LENGTH} characters.`
    };
  }

  let classes = 0;
  if (/[a-z]/.test(password)) classes++;
  if (/[A-Z]/.test(password)) classes++;
  if (/[0-9]/.test(password)) classes++;
  if (/[^A-Za-z0-9]/.test(password)) classes++;

  if (classes < 2) {
    return {
      valid: false,
      error: 'Password must include at least 2 character types (e.g., letters and numbers or symbols).'
    };
  }

  return { valid: true };
}

/**
 * Returns lockout duration in seconds using exponential backoff.
 * 1-2 fails: 0s
 * 3 fails: 30s
 * 4 fails: 60s (1m)
 * 5 fails: 300s (5m)
 * 6 fails: 900s (15m)
 * 7 fails: 1800s (30m)
 * 8+ fails: 86400s (24h)
 */
export function getLockoutDuration(failedAttempts) {
  if (failedAttempts < 3) return 0;
  if (failedAttempts === 3) return 30;
  if (failedAttempts === 4) return 60;
  if (failedAttempts === 5) return 300;
  if (failedAttempts === 6) return 900;
  if (failedAttempts === 7) return 1800;
  return 86400;
}

/**
 * Determines whether a given Instagram pathname should be protected under the active lockScope.
 * @param {string} pathname
 * @param {string} lockScope
 * @returns {boolean}
 */
export function shouldLockRoute(pathname, lockScope = LOCK_SCOPES.FULL) {
  const path = (pathname || '/').toLowerCase();
  if (lockScope === LOCK_SCOPES.REELS_EXPLORE) {
    return path.startsWith('/reels') || path.startsWith('/reel/') || path.startsWith('/explore');
  }
  if (lockScope === LOCK_SCOPES.DMS) {
    return path.startsWith('/direct');
  }
  return true; // FULL
}
