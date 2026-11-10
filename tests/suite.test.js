/**
 * Comprehensive Integration & Unit Test Suite for Instagram Lock
 * Tests Constants, Storage, Messaging, AuthManager (TOCTOU, Lockout, Upgrade, Recovery),
 * SessionManager, and InactivityManager using mocked Chrome Extension APIs.
 */

import { createChromeMock } from './mocks/chrome-mock.js';

// Install global chrome mock BEFORE importing modules that read chrome.*
const mockChrome = createChromeMock('test-ext-id-12345');
globalThis.chrome = mockChrome;

import {
  LOCK_SCOPES,
  THEME_MODES,
  CRYPTO_CONFIG,
  STORAGE_KEYS,
  ACTIONS,
  validatePasswordPolicy,
  getLockoutDuration,
  shouldLockRoute
} from '../shared/constants.js';
import { hashPassword, generateSaltHex } from '../shared/crypto.js';
import {
  getSettings,
  saveSettings,
  clearSessionAuth,
  getStoredCredentials,
  appendAuditLog,
  getAuditLog
} from '../shared/storage.js';
import { isTrustedSender, isPrivilegedExtensionContext } from '../shared/messaging.js';
import { AuthManager } from '../background/auth-manager.js';
import { SessionManager } from '../background/session-manager.js';
import { InactivityManager } from '../background/inactivity-manager.js';
import { runCryptoTests } from './crypto.test.js';

let total = 0;
let passed = 0;

function assert(condition, label) {
  total++;
  if (!condition) {
    console.error(`❌ FAIL: ${label}`);
    process.exitCode = 1;
  } else {
    passed++;
    console.log(`✅ PASS: ${label}`);
  }
}

async function assertRejects(fn, label) {
  let rejected = false;
  try {
    await fn();
  } catch {
    rejected = true;
  }
  assert(rejected, label);
}

async function runSuite() {
  const cryptoRes = await runCryptoTests();
  total += cryptoRes.total;
  passed += cryptoRes.passed;

  console.log('--- Running Constants, Policy & Route Tests ---');
  assert(validatePasswordPolicy('abc1').valid === false, 'Rejects 4-char password (<8 chars)');
  assert(validatePasswordPolicy('onlyletters').valid === false, 'Rejects single-class password (only lowercase)');
  assert(validatePasswordPolicy('12345678').valid === false, 'Rejects single-class password (only digits)');
  assert(validatePasswordPolicy('Pass1234').valid === true, 'Accepts 8-char mixed-class password');
  assert(validatePasswordPolicy('a1'.repeat(70)).valid === false, 'Rejects >128 char password');

  assert(getLockoutDuration(2) === 0, '2 fails = 0s lockout');
  assert(getLockoutDuration(3) === 30, '3 fails = 30s lockout');
  assert(getLockoutDuration(5) === 300, '5 fails = 300s (5m) lockout');
  assert(getLockoutDuration(8) === 86400, '8 fails = 86400s (24h) lockout');

  assert(shouldLockRoute('/', LOCK_SCOPES.FULL) === true, 'FULL scope locks /');
  assert(shouldLockRoute('/direct/inbox/', LOCK_SCOPES.DMS) === true, 'DMS scope locks /direct/inbox/');
  assert(shouldLockRoute('/explore/', LOCK_SCOPES.DMS) === false, 'DMS scope does not lock /explore/');
  assert(shouldLockRoute('/reels/123/', LOCK_SCOPES.REELS_EXPLORE) === true, 'REELS_EXPLORE locks /reels/123/');
  assert(shouldLockRoute('/direct/inbox/', LOCK_SCOPES.REELS_EXPLORE) === false, 'REELS_EXPLORE does not lock DMs');

  console.log('\n--- Running Storage & Schema Validation Tests ---');
  mockChrome.__test.reset();
  const defaults = await getSettings();
  assert(defaults.timeoutMinutes === 5 && defaults.lockScope === 'full', 'getSettings returns clean defaults');

  const updated = await saveSettings({ timeoutMinutes: 15, lockOnClose: true, lockScope: 'dms', themeMode: 'light' });
  assert(updated.timeoutMinutes === 15 && updated.lockOnClose === true && updated.lockScope === 'dms' && updated.themeMode === 'light', 'saveSettings persists valid settings');

  await assertRejects(() => saveSettings({ timeoutMinutes: 999 }), 'saveSettings rejects invalid timeoutMinutes');
  await assertRejects(() => saveSettings({ lockScope: 'invalid_scope' }), 'saveSettings rejects invalid lockScope');
  await assertRejects(() => saveSettings({ autoLockEnabled: 'yes' }), 'saveSettings rejects non-boolean autoLockEnabled');

  mockChrome.__test.setThrowOnSessionRemove(true);
  await assertRejects(() => clearSessionAuth(), 'clearSessionAuth propagates storage errors (CQ-02)');
  mockChrome.__test.setThrowOnSessionRemove(false);

  for (let i = 0; i < 35; i++) {
    await appendAuditLog(`Event ${i}`, 'Test', true);
  }
  const auditLog = await getAuditLog();
  assert(auditLog.length === 30 && auditLog[0].event === 'Event 34', 'Audit log capped at 30 newest entries');

  console.log('\n--- Running Messaging Role-Separation Tests ---');
  assert(isTrustedSender({ id: 'test-ext-id-12345', tab: { id: 1 } }) === true, 'isTrustedSender allows matching extension ID');
  assert(isTrustedSender({ id: 'malicious-ext-id' }) === false, 'isTrustedSender rejects foreign extension ID');
  assert(
    isPrivilegedExtensionContext({ id: 'test-ext-id-12345', tab: { id: 1 }, url: 'https://www.instagram.com/' }) === false,
    'isPrivilegedExtensionContext rejects content script on instagram.com (SEC-04)'
  );
  assert(
    isPrivilegedExtensionContext({ id: 'test-ext-id-12345', url: 'chrome-extension://test-ext-id-12345/popup/popup.html' }) === true,
    'isPrivilegedExtensionContext allows popup.html without sender.tab'
  );
  assert(
    isPrivilegedExtensionContext({ id: 'test-ext-id-12345', tab: { id: 2 }, url: 'chrome-extension://test-ext-id-12345/pages/setup.html' }) === true,
    'isPrivilegedExtensionContext allows setup.html opened inside a browser tab'
  );
  assert(
    isPrivilegedExtensionContext({ id: 'test-ext-id-12345', tab: { id: 3 }, url: 'chrome-extension://test-ext-id-12345/options/options.html' }) === true,
    'isPrivilegedExtensionContext allows options.html opened inside a browser tab'
  );

  console.log('\n--- Running AuthManager (Mutex, Lockout, Clock Tamper, Upgrade, Recovery) Tests ---');
  mockChrome.__test.reset();
  const { recoveryKey } = await AuthManager.setInitialPassword('MasterPass1!');
  assert(typeof recoveryKey === 'string' && recoveryKey.length === 19, 'setInitialPassword returns formatted recovery key');
  await assertRejects(() => AuthManager.setInitialPassword('OtherPass1!'), 'setInitialPassword rejects overwrite when already configured');

  const okVerify = await AuthManager.verify('MasterPass1!');
  assert(okVerify.success === true, 'AuthManager.verify succeeds with correct password');

  // Test TOCTOU Mutex: fire 5 parallel wrong attempts concurrently
  const parallelResults = await Promise.all([
    AuthManager.verify('WrongPass1!'),
    AuthManager.verify('WrongPass2!'),
    AuthManager.verify('WrongPass3!'),
    AuthManager.verify('WrongPass4!'),
    AuthManager.verify('WrongPass5!')
  ]);
  const storedFails = mockChrome.__test.getLocalStore().get(STORAGE_KEYS.LOCAL.FAILED_ATTEMPTS);
  assert(storedFails === 3, `Mutex serialized concurrent requests cleanly (stopped at lockout on attempt 3: storedFails=${storedFails})`);
  assert(parallelResults[2].lockoutSeconds === 30 && parallelResults[3].error.includes('wait'), '4th & 5th concurrent requests hit active lockout');

  // Test backward clock-tampering defense (SEC-07)
  const localStore = mockChrome.__test.getLocalStore();
  const futureStart = Date.now() + 600000;
  localStore.set(STORAGE_KEYS.LOCAL.LOCKOUT_STARTED_AT, futureStart);
  localStore.set(STORAGE_KEYS.LOCAL.LOCKOUT_UNTIL, futureStart + 60000);
  const clockTamperRes = await AuthManager.verify('MasterPass1!');
  assert(clockTamperRes.success === false && clockTamperRes.lockoutSeconds > 0, 'Clock rollback tamper detected and remains locked out');

  // Test legacy 100k -> 600k transparent upgrade (SEC-11)
  mockChrome.__test.reset();
  const legacySalt = generateSaltHex();
  const legacyHash = await hashPassword('LegacyPass1!', legacySalt, CRYPTO_CONFIG.LEGACY_ITERATIONS);
  await chrome.storage.local.set({
    [STORAGE_KEYS.LOCAL.PASSWORD_HASH]: legacyHash,
    [STORAGE_KEYS.LOCAL.PASSWORD_SALT]: legacySalt,
    [STORAGE_KEYS.LOCAL.IS_CONFIGURED]: true
  });
  const legacyCheck = await AuthManager.verify('LegacyPass1!');
  assert(legacyCheck.success === true, 'Legacy 100k password verifies successfully');
  const upgradedCreds = await getStoredCredentials();
  assert(upgradedCreds.iterations === CRYPTO_CONFIG.ITERATIONS, 'Legacy 100k hash transparently upgraded to 600,000 iterations');

  // Test Emergency Recovery Key reset flow
  mockChrome.__test.reset();
  const setupRes = await AuthManager.setInitialPassword('InitialPass1!');
  const recReset = await AuthManager.recoverWithKey(setupRes.recoveryKey, 'RecoveredPass9!');
  assert(recReset.success === true && recReset.newRecoveryKey !== setupRes.recoveryKey, 'recoverWithKey resets password and rotates recovery key');
  assert((await AuthManager.verify('InitialPass1!')).success === false, 'Old password rejected after recovery');
  assert((await AuthManager.verify('RecoveredPass9!')).success === true, 'New password works after recovery');

  console.log('\n--- Running SessionManager & InactivityManager Tests ---');
  mockChrome.__test.reset();
  mockChrome.__test.setTabs([{ id: 101, url: 'https://www.instagram.com/' }]);
  await SessionManager.unlock();
  assert((await SessionManager.isUnlocked()) === true, 'SessionManager unlocks session');

  // UX-02: Immediate lock on workstation OS screen lock even with 0ms elapsed inactivity
  await InactivityManager.onIdleStateChanged('locked');
  assert((await SessionManager.isUnlocked()) === false, 'onIdleStateChanged("locked") secures session immediately');
  const msgs = mockChrome.__test.getSentTabMessages();
  assert(msgs.some(m => m.tabId === 101 && m.message.action === ACTIONS.SYNC_LOCK), 'Broadcasts SYNC_LOCK to Instagram tab on workstation lock');

  // Elapsed inactivity timeout
  await SessionManager.unlock();
  await chrome.storage.session.set({
    [STORAGE_KEYS.SESSION.LAST_ACTIVITY]: Date.now() - (6 * 60 * 1000) // 6 mins ago > 5 min default
  });
  const didLock = await InactivityManager.checkInactivity();
  assert(didLock === true && (await SessionManager.isUnlocked()) === false, 'checkInactivity locks session when timeout exceeded');

  console.log(`\n========================================`);
  console.log(`ALL TESTS SUMMARY: ${passed}/${total} passed.`);
  console.log(`========================================`);
}

runSuite().catch(err => {
  console.error('Test suite fatal error:', err);
  process.exit(1);
});
