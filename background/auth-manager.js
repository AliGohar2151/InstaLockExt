/**
 * Instagram Lock - Authentication Manager
 * Handles password setup, PBKDF2 hashing, mutex-serialized verification,
 * exponential lockout delays, iteration upgrades, and recovery key validation.
 */

import {
  STORAGE_KEYS,
  CRYPTO_CONFIG,
  PASSWORD_POLICY,
  getLockoutDuration,
  validatePasswordPolicy
} from '../shared/constants.js';
import {
  generateSaltHex,
  generateRecoveryKey,
  hashPassword,
  verifyPassword
} from '../shared/crypto.js';
import {
  getLocal,
  setLocalMulti,
  getStoredCredentials,
  saveCredentials,
  saveRecoveryCredentials,
  getRecoveryCredentials
} from '../shared/storage.js';

// Mutex queue to serialize authentication attempts and eliminate TOCTOU race conditions (SEC-05)
let authMutexQueue = Promise.resolve();

function runSerialized(fn) {
  const next = authMutexQueue.then(() => fn());
  authMutexQueue = next.catch(() => {});
  return next;
}

export class AuthManager {
  /**
   * Checks if an initial master password has been configured.
   * @returns {Promise<boolean>}
   */
  static async isConfigured() {
    const { isConfigured } = await getStoredCredentials();
    return isConfigured;
  }

  /**
   * Returns current lockout information if the user is currently rate-limited.
   * Includes clock-rollback tamper detection using lockoutStartedAt (SEC-07).
   * @returns {Promise<{ isLockedOut: boolean, remainingSeconds: number }>}
   */
  static async checkLockout() {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.LOCAL.LOCKOUT_UNTIL,
      STORAGE_KEYS.LOCAL.LOCKOUT_STARTED_AT
    ]);
    const lockoutUntil = Number(result[STORAGE_KEYS.LOCAL.LOCKOUT_UNTIL]) || 0;
    const lockoutStartedAt = Number(result[STORAGE_KEYS.LOCAL.LOCKOUT_STARTED_AT]) || 0;
    const now = Date.now();

    if (lockoutUntil > 0) {
      // Detect backward system clock tampering
      if (lockoutStartedAt > 0 && now < lockoutStartedAt) {
        const remainingSeconds = Math.ceil((lockoutUntil - lockoutStartedAt) / 1000);
        return { isLockedOut: true, remainingSeconds: Math.max(remainingSeconds, 30) };
      }

      if (lockoutUntil > now) {
        const remainingSeconds = Math.ceil((lockoutUntil - now) / 1000);
        return { isLockedOut: true, remainingSeconds };
      }
    }

    return { isLockedOut: false, remainingSeconds: 0 };
  }

  /**
   * Sets the initial master password and generates an offline emergency recovery key.
   * Fails if already configured (must use changePassword or recoverWithKey instead).
   * @param {string} password
   * @returns {Promise<{ recoveryKey: string }>}
   */
  static async setInitialPassword(password) {
    return runSerialized(async () => {
      const configured = await this.isConfigured();
      if (configured) {
        throw new Error('Extension already has a password configured. Use changePassword instead.');
      }

      const policyCheck = validatePasswordPolicy(password);
      if (!policyCheck.valid) {
        throw new Error(policyCheck.error);
      }

      const salt = generateSaltHex();
      const hash = await hashPassword(password, salt, CRYPTO_CONFIG.ITERATIONS);
      await saveCredentials(hash, salt, CRYPTO_CONFIG.ITERATIONS);

      // Generate and store PBKDF2-hashed emergency recovery key
      const recoveryKey = generateRecoveryKey();
      const recSalt = generateSaltHex();
      const recHash = await hashPassword(recoveryKey, recSalt, CRYPTO_CONFIG.ITERATIONS);
      await saveRecoveryCredentials(recHash, recSalt);

      return { recoveryKey };
    });
  }

  /**
   * Verifies candidate password against stored credentials atomically via mutex.
   * Enforces exponential lockout delays on failed attempts.
   * Transparently upgrades legacy 100k-iteration hashes to 600k iterations on success.
   * @param {string} candidatePassword
   * @returns {Promise<{ success: boolean, error?: string, lockoutSeconds?: number }>}
   */
  static async verify(candidatePassword) {
    return runSerialized(async () => {
      if (typeof candidatePassword !== 'string' || candidatePassword.length === 0) {
        return { success: false, error: 'Please enter a password.' };
      }
      if (candidatePassword.length > PASSWORD_POLICY.MAX_LENGTH) {
        return { success: false, error: 'Password exceeds maximum allowed length.' };
      }

      const lockout = await this.checkLockout();
      if (lockout.isLockedOut) {
        return {
          success: false,
          error: `Too many failed attempts. Please wait ${lockout.remainingSeconds}s.`,
          lockoutSeconds: lockout.remainingSeconds
        };
      }

      const { hash, salt, iterations, isConfigured } = await getStoredCredentials();
      if (!isConfigured || !hash || !salt) {
        return {
          success: false,
          error: 'Password has not been set up yet.'
        };
      }

      const isValid = await verifyPassword(candidatePassword, salt, hash, iterations);

      if (isValid) {
        // Transparently upgrade legacy 100k hashes to current OWASP iteration count (SEC-11)
        if (iterations < CRYPTO_CONFIG.ITERATIONS) {
          const newSalt = generateSaltHex();
          const newHash = await hashPassword(candidatePassword, newSalt, CRYPTO_CONFIG.ITERATIONS);
          await saveCredentials(newHash, newSalt, CRYPTO_CONFIG.ITERATIONS);
        } else {
          await setLocalMulti({
            [STORAGE_KEYS.LOCAL.FAILED_ATTEMPTS]: 0,
            [STORAGE_KEYS.LOCAL.LOCKOUT_UNTIL]: 0,
            [STORAGE_KEYS.LOCAL.LOCKOUT_STARTED_AT]: 0
          });
        }
        return { success: true };
      } else {
        const failedAttempts = (await getLocal(STORAGE_KEYS.LOCAL.FAILED_ATTEMPTS, 0)) + 1;
        const penaltySeconds = getLockoutDuration(failedAttempts);
        const now = Date.now();
        const lockoutUntil = penaltySeconds > 0 ? now + penaltySeconds * 1000 : 0;
        const lockoutStartedAt = penaltySeconds > 0 ? now : 0;

        await setLocalMulti({
          [STORAGE_KEYS.LOCAL.FAILED_ATTEMPTS]: failedAttempts,
          [STORAGE_KEYS.LOCAL.LOCKOUT_UNTIL]: lockoutUntil,
          [STORAGE_KEYS.LOCAL.LOCKOUT_STARTED_AT]: lockoutStartedAt
        });

        return {
          success: false,
          error: penaltySeconds > 0
            ? `Incorrect password. Locked out for ${penaltySeconds}s.`
            : 'Incorrect password. Please try again.',
          lockoutSeconds: penaltySeconds
        };
      }
    });
  }

  /**
   * Securely changes the master password by requiring current password verification first.
   * @param {string} currentPassword
   * @param {string} newPassword
   */
  static async changePassword(currentPassword, newPassword) {
    const policyCheck = validatePasswordPolicy(newPassword);
    if (!policyCheck.valid) {
      throw new Error(policyCheck.error);
    }

    const verification = await this.verify(currentPassword);
    if (!verification.success) {
      throw new Error(verification.error || 'Current password is incorrect.');
    }

    return runSerialized(async () => {
      const newSalt = generateSaltHex();
      const newHash = await hashPassword(newPassword, newSalt, CRYPTO_CONFIG.ITERATIONS);
      await saveCredentials(newHash, newSalt, CRYPTO_CONFIG.ITERATIONS);
      return true;
    });
  }

  /**
   * Generates a fresh emergency recovery key after verifying current master password.
   * @param {string} currentPassword
   * @returns {Promise<{ recoveryKey: string }>}
   */
  static async regenerateRecoveryKey(currentPassword) {
    const verification = await this.verify(currentPassword);
    if (!verification.success) {
      throw new Error(verification.error || 'Current password is incorrect.');
    }

    return runSerialized(async () => {
      const recoveryKey = generateRecoveryKey();
      const recSalt = generateSaltHex();
      const recHash = await hashPassword(recoveryKey, recSalt, CRYPTO_CONFIG.ITERATIONS);
      await saveRecoveryCredentials(recHash, recSalt);
      return { recoveryKey };
    });
  }

  /**
   * Resets master password using the offline emergency recovery key.
   * Protected by the same mutex and lockout schedule.
   * @param {string} recoveryKeyInput
   * @param {string} newPassword
   * @returns {Promise<{ success: boolean, newRecoveryKey?: string, error?: string, lockoutSeconds?: number }>}
   */
  static async recoverWithKey(recoveryKeyInput, newPassword) {
    return runSerialized(async () => {
      const lockout = await this.checkLockout();
      if (lockout.isLockedOut) {
        return {
          success: false,
          error: `Too many failed attempts. Please wait ${lockout.remainingSeconds}s.`,
          lockoutSeconds: lockout.remainingSeconds
        };
      }

      const policyCheck = validatePasswordPolicy(newPassword);
      if (!policyCheck.valid) {
        return { success: false, error: policyCheck.error };
      }

      if (typeof recoveryKeyInput !== 'string' || recoveryKeyInput.trim().length === 0) {
        return { success: false, error: 'Please enter your recovery key.' };
      }

      const normalizedKey = recoveryKeyInput.trim().toUpperCase();
      if (normalizedKey.length > PASSWORD_POLICY.MAX_LENGTH) {
        return { success: false, error: 'Invalid recovery key format.' };
      }

      const { hash, salt } = await getRecoveryCredentials();
      if (!hash || !salt) {
        return { success: false, error: 'No recovery key was generated for this account.' };
      }

      const isValid = await verifyPassword(normalizedKey, salt, hash, CRYPTO_CONFIG.ITERATIONS);
      if (!isValid) {
        const failedAttempts = (await getLocal(STORAGE_KEYS.LOCAL.FAILED_ATTEMPTS, 0)) + 1;
        const penaltySeconds = getLockoutDuration(failedAttempts);
        const now = Date.now();
        await setLocalMulti({
          [STORAGE_KEYS.LOCAL.FAILED_ATTEMPTS]: failedAttempts,
          [STORAGE_KEYS.LOCAL.LOCKOUT_UNTIL]: penaltySeconds > 0 ? now + penaltySeconds * 1000 : 0,
          [STORAGE_KEYS.LOCAL.LOCKOUT_STARTED_AT]: penaltySeconds > 0 ? now : 0
        });

        return {
          success: false,
          error: penaltySeconds > 0
            ? `Invalid recovery key. Locked out for ${penaltySeconds}s.`
            : 'Invalid recovery key.',
          lockoutSeconds: penaltySeconds
        };
      }

      // Valid recovery key: set new password and rotate recovery key
      const newSalt = generateSaltHex();
      const newHash = await hashPassword(newPassword, newSalt, CRYPTO_CONFIG.ITERATIONS);
      await saveCredentials(newHash, newSalt, CRYPTO_CONFIG.ITERATIONS);

      const newRecoveryKey = generateRecoveryKey();
      const newRecSalt = generateSaltHex();
      const newRecHash = await hashPassword(newRecoveryKey, newRecSalt, CRYPTO_CONFIG.ITERATIONS);
      await saveRecoveryCredentials(newRecHash, newRecSalt);

      return { success: true, newRecoveryKey };
    });
  }
}
