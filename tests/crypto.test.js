/**
 * Unit tests for shared/crypto.js
 */

import {
  generateSaltHex,
  generateRecoveryKey,
  hashPassword,
  verifyPassword,
  timingSafeEqual,
  bufferToHex,
  hexToBuffer
} from '../shared/crypto.js';
import { CRYPTO_CONFIG, PASSWORD_POLICY } from '../shared/constants.js';

export async function runCryptoTests() {
  let totalTests = 0;
  let passedTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (!condition) {
      console.error(`❌ FAIL: ${message}`);
      process.exitCode = 1;
    } else {
      passedTests++;
      console.log(`✅ PASS: ${message}`);
    }
  }

  console.log('--- Running Crypto Unit Tests ---');

  // Test 1: Buffer <-> Hex round trip (preserving leading zeroes)
  const original = new Uint8Array([0, 15, 255, 128, 42]);
  const hex = bufferToHex(original);
  assert(hex === '000fff802a', `bufferToHex output: ${hex}`);
  const restored = hexToBuffer(hex);
  assert(
    restored.length === original.length && restored.every((val, i) => val === original[i]),
    'hexToBuffer restored identical bytes'
  );

  // Test 2: Salt generation
  const salt1 = generateSaltHex(16);
  const salt2 = generateSaltHex(16);
  assert(salt1.length === 32, '16-byte salt produces 32-character hex string');
  assert(salt1 !== salt2, 'Consecutive salts are cryptographically distinct');

  // Test 3: Recovery key generation
  const rec1 = generateRecoveryKey();
  const rec2 = generateRecoveryKey();
  assert(/^[2-9A-HJ-NP-Z]{4}(-[2-9A-HJ-NP-Z]{4}){3}$/.test(rec1), `Recovery key matches format: ${rec1}`);
  assert(rec1 !== rec2, 'Consecutive recovery keys are distinct');

  // Test 4: Password hashing & verification (600,000 iterations)
  const password = 'SuperSecurePassword!2026';
  const salt = generateSaltHex(16);
  const hash = await hashPassword(password, salt, CRYPTO_CONFIG.ITERATIONS);
  assert(typeof hash === 'string' && hash.length === 64, 'Hash is 64 hex characters (256 bits)');

  const isValid = await verifyPassword(password, salt, hash, CRYPTO_CONFIG.ITERATIONS);
  assert(isValid === true, 'verifyPassword returns true for correct password (600k iterations)');

  const isInvalid = await verifyPassword('WrongPassword1!', salt, hash, CRYPTO_CONFIG.ITERATIONS);
  assert(isInvalid === false, 'verifyPassword returns false for wrong password');

  const isInvalidTamperedSalt = await verifyPassword(password, generateSaltHex(16), hash, CRYPTO_CONFIG.ITERATIONS);
  assert(isInvalidTamperedSalt === false, 'verifyPassword returns false with wrong salt');

  // Test 5: Legacy 100k verification backward compatibility
  const legacyHash = await hashPassword(password, salt, CRYPTO_CONFIG.LEGACY_ITERATIONS);
  const isLegacyValid = await verifyPassword(password, salt, legacyHash, CRYPTO_CONFIG.LEGACY_ITERATIONS);
  assert(isLegacyValid === true, 'verifyPassword supports legacy 100k iterations');

  // Test 6: Timing safe equality
  assert(timingSafeEqual('abcdef123', 'abcdef123') === true, 'timingSafeEqual returns true on matching strings');
  assert(timingSafeEqual('abcdef123', 'abcdef124') === false, 'timingSafeEqual returns false on single char diff');
  assert(timingSafeEqual('abc', 'abcdef') === false, 'timingSafeEqual returns false on length diff');

  // Test 7: Empty and oversized password validation
  let caughtEmpty = false;
  try {
    await hashPassword('', salt);
  } catch {
    caughtEmpty = true;
  }
  assert(caughtEmpty === true, 'hashPassword rejects empty password');

  let caughtOversized = false;
  try {
    await hashPassword('a'.repeat(PASSWORD_POLICY.MAX_LENGTH + 1), salt);
  } catch {
    caughtOversized = true;
  }
  assert(caughtOversized === true, 'hashPassword rejects oversized password (>128 chars)');

  console.log(`Crypto Tests finished: ${passedTests}/${totalTests} passed.\n`);
  return { passed: passedTests, total: totalTests };
}

// Run automatically if executed directly
const isMain = process.argv[1] && process.argv[1].endsWith('crypto.test.js');
if (isMain) {
  runCryptoTests().catch(err => {
    console.error('Unhandled test exception:', err);
    process.exit(1);
  });
}
