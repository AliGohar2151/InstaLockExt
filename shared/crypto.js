/**
 * Instagram Lock - Cryptographic Utilities
 * Uses Web Crypto API (PBKDF2 with SHA-256) for offline secure password hashing.
 */

import { CRYPTO_CONFIG, PASSWORD_POLICY } from './constants.js';

/**
 * Converts a Uint8Array or ArrayBuffer to a lowercase hexadecimal string.
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {string}
 */
export function bufferToHex(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Converts a hexadecimal string back to a Uint8Array.
 * @param {string} hex
 * @returns {Uint8Array}
 */
export function hexToBuffer(hex) {
  if (typeof hex !== 'string' || hex.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Generates a cryptographically secure random salt as a hex string.
 * @param {number} numBytes Default 16 bytes (128-bit)
 * @returns {string}
 */
export function generateSaltHex(numBytes = CRYPTO_CONFIG.SALT_BYTES) {
  const randomBytes = new Uint8Array(numBytes);
  crypto.getRandomValues(randomBytes);
  return bufferToHex(randomBytes);
}

/**
 * Generates a cryptographically secure 16-character alphanumeric recovery key (XXXX-XXXX-XXXX-XXXX).
 * Uses unambiguous characters to avoid transcription errors.
 * @returns {string}
 */
export function generateRecoveryKey() {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 32 chars (unbiased modulo with 256)
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let key = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) key += '-';
    key += alphabet[bytes[i] % alphabet.length];
  }
  return key;
}

/**
 * Derives a PBKDF2 key from password and salt using SHA-256.
 * @param {string} password
 * @param {string} saltHex
 * @param {number} iterations
 * @returns {Promise<string>} Hex-encoded derived key hash
 */
export async function hashPassword(password, saltHex, iterations = CRYPTO_CONFIG.ITERATIONS) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string');
  }
  if (password.length > PASSWORD_POLICY.MAX_LENGTH) {
    throw new Error(`Password exceeds maximum allowed length of ${PASSWORD_POLICY.MAX_LENGTH} characters`);
  }

  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const saltBytes = hexToBuffer(saltHex);

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: iterations,
      hash: CRYPTO_CONFIG.HASH_ALGO
    },
    passwordKey,
    CRYPTO_CONFIG.KEY_LENGTH_BITS
  );

  return bufferToHex(derivedBits);
}

/**
 * Compares two strings in constant time to prevent timing attacks.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  const length = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length;

  for (let i = 0; i < length; i++) {
    const charA = i < a.length ? a.charCodeAt(i) : 0;
    const charB = i < b.length ? b.charCodeAt(i) : 0;
    mismatch |= (charA ^ charB);
  }

  return mismatch === 0;
}

/**
 * Verifies a candidate password against a known salt and expected hash.
 * @param {string} candidatePassword
 * @param {string} saltHex
 * @param {string} expectedHashHex
 * @param {number} iterations
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(
  candidatePassword,
  saltHex,
  expectedHashHex,
  iterations = CRYPTO_CONFIG.ITERATIONS
) {
  try {
    const candidateHash = await hashPassword(candidatePassword, saltHex, iterations);
    return timingSafeEqual(candidateHash, expectedHashHex);
  } catch (error) {
    console.error('[IG-Lock Crypto] Verification failed with error:', error);
    return false;
  }
}
