/**
 * Instagram Lock - Storage Utilities
 * Safe async wrappers around chrome.storage.local and chrome.storage.session.
 */

import { STORAGE_KEYS, DEFAULTS, CRYPTO_CONFIG } from './constants.js';

/**
 * Gets a value from chrome.storage.local with a fallback.
 */
export async function getLocal(key, defaultValue = null) {
  try {
    const result = await chrome.storage.local.get(key);
    return result[key] !== undefined ? result[key] : defaultValue;
  } catch (error) {
    console.error(`[IG-Lock Storage] Failed to get local key "${key}":`, error);
    return defaultValue;
  }
}

/**
 * Sets a key-value pair in chrome.storage.local.
 */
export async function setLocal(key, value) {
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch (error) {
    console.error(`[IG-Lock Storage] Failed to set local key "${key}":`, error);
    throw error;
  }
}

/**
 * Sets multiple keys in chrome.storage.local.
 */
export async function setLocalMulti(items) {
  try {
    await chrome.storage.local.set(items);
  } catch (error) {
    console.error('[IG-Lock Storage] Failed to set local items:', error);
    throw error;
  }
}

/**
 * Gets a value from chrome.storage.session with a fallback.
 */
export async function getSession(key, defaultValue = null) {
  try {
    const result = await chrome.storage.session.get(key);
    return result[key] !== undefined ? result[key] : defaultValue;
  } catch (error) {
    console.error(`[IG-Lock Storage] Failed to get session key "${key}":`, error);
    return defaultValue;
  }
}

/**
 * Sets a key-value pair in chrome.storage.session.
 */
export async function setSession(key, value) {
  try {
    await chrome.storage.session.set({ [key]: value });
  } catch (error) {
    console.error(`[IG-Lock Storage] Failed to set session key "${key}":`, error);
    throw error;
  }
}

/**
 * Sets multiple keys in chrome.storage.session.
 */
export async function setSessionMulti(items) {
  try {
    await chrome.storage.session.set(items);
  } catch (error) {
    console.error('[IG-Lock Storage] Failed to set session items:', error);
    throw error;
  }
}

/**
 * Clears authentication state in chrome.storage.session.
 */
export async function clearSessionAuth() {
  try {
    await chrome.storage.session.remove([
      STORAGE_KEYS.SESSION.IS_AUTHENTICATED,
      STORAGE_KEYS.SESSION.LAST_ACTIVITY,
      STORAGE_KEYS.SESSION.UNLOCKED_AT
    ]);
  } catch (error) {
    console.error('[IG-Lock Storage] Failed to clear session auth:', error);
    throw error;
  }
}

/**
 * Fetches stored password credentials from local storage.
 */
export async function getStoredCredentials() {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.LOCAL.PASSWORD_HASH,
    STORAGE_KEYS.LOCAL.PASSWORD_SALT,
    STORAGE_KEYS.LOCAL.PASSWORD_ITERATIONS,
    STORAGE_KEYS.LOCAL.IS_CONFIGURED
  ]);
  return {
    hash: result[STORAGE_KEYS.LOCAL.PASSWORD_HASH] || null,
    salt: result[STORAGE_KEYS.LOCAL.PASSWORD_SALT] || null,
    iterations: result[STORAGE_KEYS.LOCAL.PASSWORD_ITERATIONS] || CRYPTO_CONFIG.LEGACY_ITERATIONS,
    isConfigured: Boolean(result[STORAGE_KEYS.LOCAL.IS_CONFIGURED])
  };
}

/**
 * Saves new password credentials into local storage.
 */
export async function saveCredentials(hash, salt, iterations = CRYPTO_CONFIG.ITERATIONS) {
  await setLocalMulti({
    [STORAGE_KEYS.LOCAL.PASSWORD_HASH]: hash,
    [STORAGE_KEYS.LOCAL.PASSWORD_SALT]: salt,
    [STORAGE_KEYS.LOCAL.PASSWORD_ITERATIONS]: iterations,
    [STORAGE_KEYS.LOCAL.IS_CONFIGURED]: true,
    [STORAGE_KEYS.LOCAL.FAILED_ATTEMPTS]: 0,
    [STORAGE_KEYS.LOCAL.LOCKOUT_UNTIL]: 0,
    [STORAGE_KEYS.LOCAL.LOCKOUT_STARTED_AT]: 0
  });
}

/**
 * Saves emergency recovery key hash and salt.
 */
export async function saveRecoveryCredentials(hash, salt) {
  await setLocalMulti({
    [STORAGE_KEYS.LOCAL.RECOVERY_HASH]: hash,
    [STORAGE_KEYS.LOCAL.RECOVERY_SALT]: salt
  });
}

/**
 * Fetches emergency recovery credentials.
 */
export async function getRecoveryCredentials() {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.LOCAL.RECOVERY_HASH,
    STORAGE_KEYS.LOCAL.RECOVERY_SALT
  ]);
  return {
    hash: result[STORAGE_KEYS.LOCAL.RECOVERY_HASH] || null,
    salt: result[STORAGE_KEYS.LOCAL.RECOVERY_SALT] || null
  };
}

/**
 * Reads user settings with defaults.
 */
export async function getSettings() {
  const saved = await getLocal(STORAGE_KEYS.LOCAL.SETTINGS, {});
  return {
    timeoutMinutes: DEFAULTS.TIMEOUT_OPTIONS.includes(saved?.timeoutMinutes)
      ? saved.timeoutMinutes
      : DEFAULTS.TIMEOUT_MINUTES,
    autoLockEnabled: typeof saved?.autoLockEnabled === 'boolean'
      ? saved.autoLockEnabled
      : DEFAULTS.AUTO_LOCK_ENABLED,
    lockOnClose: typeof saved?.lockOnClose === 'boolean'
      ? saved.lockOnClose
      : DEFAULTS.LOCK_ON_CLOSE,
    lockScope: DEFAULTS.ALLOWED_SCOPES.includes(saved?.lockScope)
      ? saved.lockScope
      : DEFAULTS.LOCK_SCOPE,
    themeMode: DEFAULTS.ALLOWED_THEMES.includes(saved?.themeMode)
      ? saved.themeMode
      : DEFAULTS.THEME_MODE
  };
}

/**
 * Validates and updates user settings against strict schema rules.
 */
export async function saveSettings(incoming) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    throw new Error('Invalid settings payload.');
  }

  const current = await getSettings();
  const next = { ...current };

  if (incoming.timeoutMinutes !== undefined) {
    if (typeof incoming.timeoutMinutes !== 'number' || !DEFAULTS.TIMEOUT_OPTIONS.includes(incoming.timeoutMinutes)) {
      throw new Error('Invalid timeoutMinutes setting.');
    }
    next.timeoutMinutes = incoming.timeoutMinutes;
  }

  if (incoming.autoLockEnabled !== undefined) {
    if (typeof incoming.autoLockEnabled !== 'boolean') {
      throw new Error('Invalid autoLockEnabled setting.');
    }
    next.autoLockEnabled = incoming.autoLockEnabled;
  }

  if (incoming.lockOnClose !== undefined) {
    if (typeof incoming.lockOnClose !== 'boolean') {
      throw new Error('Invalid lockOnClose setting.');
    }
    next.lockOnClose = incoming.lockOnClose;
  }

  if (incoming.lockScope !== undefined) {
    if (!DEFAULTS.ALLOWED_SCOPES.includes(incoming.lockScope)) {
      throw new Error('Invalid lockScope setting.');
    }
    next.lockScope = incoming.lockScope;
  }

  if (incoming.themeMode !== undefined) {
    if (!DEFAULTS.ALLOWED_THEMES.includes(incoming.themeMode)) {
      throw new Error('Invalid themeMode setting.');
    }
    next.themeMode = incoming.themeMode;
  }

  await setLocal(STORAGE_KEYS.LOCAL.SETTINGS, next);
  return next;
}

/**
 * Appends an entry to the bounded security audit log (max 30 entries).
 */
export async function appendAuditLog(event, origin, success) {
  try {
    const log = await getLocal(STORAGE_KEYS.LOCAL.AUDIT_LOG, []);
    const entries = Array.isArray(log) ? log : [];
    entries.unshift({
      timestamp: Date.now(),
      event: String(event),
      origin: String(origin),
      success: Boolean(success)
    });
    if (entries.length > DEFAULTS.MAX_AUDIT_ENTRIES) {
      entries.length = DEFAULTS.MAX_AUDIT_ENTRIES;
    }
    await setLocal(STORAGE_KEYS.LOCAL.AUDIT_LOG, entries);
  } catch (err) {
    console.error('[IG-Lock Storage] Failed to append audit log:', err);
  }
}

/**
 * Retrieves security audit log entries.
 */
export async function getAuditLog() {
  const log = await getLocal(STORAGE_KEYS.LOCAL.AUDIT_LOG, []);
  return Array.isArray(log) ? log : [];
}

/**
 * Clears all security audit log entries.
 */
export async function clearAuditLog() {
  await setLocal(STORAGE_KEYS.LOCAL.AUDIT_LOG, []);
}
