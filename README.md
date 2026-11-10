<div align="center">

# 🔒 Instagram Lock

**A hardened, session-based password protection extension for Instagram Web**

![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)
![Crypto](<https://img.shields.io/badge/Crypto-PBKDF2--SHA256%20(600k)-e1306c>)
![Offline](https://img.shields.io/badge/Backend-100%25%20Offline-52c41a)
![Tests](https://img.shields.io/badge/Tests-58%2F58%20Passing-success)
[![GitHub Repo](https://img.shields.io/badge/GitHub-AliGohar2151%2FInstaLockExt-181717?logo=github)](https://github.com/AliGohar2151/InstaLockExt)

_Protect your Instagram direct messages, feed, and Reels on shared or unattended computers—completely offline, with zero external tracking or backend servers._

</div>

---

## Table of Contents

1. [Overview](#overview)
2. [Key Features](#key-features)
3. [Architecture & File Structure](#architecture--file-structure)
4. [Security & Cryptography](#security--cryptography)
5. [Installation](#installation)
6. [Development & Build](#development--build)
7. [Testing & Verification](#testing--verification)
8. [Known Limitations](#known-limitations)

---

## Overview

**Instagram Lock** secures Instagram Web (`https://*.instagram.com/*`) behind a master password. Authenticate once per browser session, and Instagram remains unlocked until:

1. **Browser Close / Restart** - ephemeral session state resets automatically via `chrome.storage.session` and `chrome.runtime.onStartup`.
2. **Workstation Screen Lock** - locking your OS (`Win + L` / `Cmd + Ctrl + Q`) triggers immediate lockdown via `chrome.idle`.
3. **Inactivity Timeout** - automatically locks all open Instagram tabs after `1`, `5`, `10`, `15`, or `30` minutes of inactivity.
4. **All Instagram Tabs Closed** - optional **Lock on Reopen** mode locks immediately when the last Instagram tab closes or navigates away.
5. **Manual Lock / Shortcut** - click **Lock Instagram Now** in the popup or press **`Alt + Shift + L`** anytime.

---

## Key Features

- **Fail-Closed Blurred Anti-FOUC Veil**: Injects a blurred backdrop overlay synchronously at `document_start` to prevent peeking before authentication without layout flicker.
- **Closed Shadow DOM Lock Screen**: Encapsulated in a `mode: 'closed'` Shadow DOM container with `subtree: true` DOM tamper defense, CSS visibility enforcement, and WCAG 2.1 AA focus trapping.
- **OWASP-Aligned PBKDF2 Cryptography**: Uses `600,000` iterations of PBKDF2-HMAC-SHA256 with a 128-bit CSPRNG salt, transparent 100k-to-600k legacy hash upgrades, and mutex-serialized verification.
- **Selective Protection Modes**:
  - **Full Site Lock** _(Default)_: Protects all of Instagram Web.
  - **Reels & Explore Blocker**: Locks `/reels/*` and `/explore/*` to curb distractions while keeping Direct Messages accessible.
  - **DM Privacy Lock**: Locks `/direct/*` messages while allowing public feed browsing.
- **Direct Popup Unlock & Live Sync**: Unlock, lock, or toggle **Lock on Reopen** straight from the toolbar popup with real-time `chrome.storage.onChanged` updates across all tabs.
- **Offline Emergency Recovery Key**: Generates a 16-character recovery key (`XXXX-XXXX-XXXX-XXXX`) during onboarding so forgotten passwords can be reset locally without any server.
- **Dynamic Light/Dark Theme Matching**: Automatically adapts to Instagram's or your system's color scheme (or force Dark/Light in Settings).
- **Exponential Brute-Force Protection & Audit Log**: Escalating lockout penalties (`30s → 1m → 5m → 15m → 30m → 24h`) with clock-rollback detection, synchronized across tabs and reloads, plus a local 30-event security log.
- **Least-Privilege Permissions & Split Incognito**: Operates without the broad `tabs` permission (`"storage"`, `"alarms"`, `"idle"` only) and isolates incognito sessions via `"incognito": "split"`.

---

## Architecture & File Structure

```text
InstaLockExt/
├── manifest.json                 # Manifest V3 config (split incognito, commands, all_frames)
├── background/
│   ├── service-worker.js         # Role-validated IPC router, port monitor, tab & idle hooks
│   ├── auth-manager.js           # Mutex-serialized PBKDF2 auth, lockout, recovery key reset
│   ├── session-manager.js        # Ephemeral authentication state in chrome.storage.session
│   └── inactivity-manager.js     # Alarm scheduling, immediate OS lock, timeout checks
├── content/
│   ├── content-loader.js         # document_start blurred fail-closed anti-FOUC veil
│   ├── content-bundle.js         # Synchronously injected Isolated World bundle (no web_accessible_resources)
│   ├── content-main.js           # Content orchestrator, port monitor, SPA route & DOM guard
│   ├── lock-screen.js            # Closed Shadow DOM modal, WCAG focus trap, recovery UI
│   └── activity-tracker.js       # Throttled input observer, local timeout fallback, context guard
├── shared/
│   ├── constants.js              # Actions, storage keys, password policy, route matcher, icons
│   ├── crypto.js                 # Web Crypto PBKDF2 hashing, recovery key gen, timing-safe compare
│   ├── messaging.js              # Origin-validated IPC helpers & tab broadcasting
│   └── storage.js                # Schema-validated storage wrappers & bounded audit log
├── popup/                        # Direct unlock, Lock Now, Lock on Reopen toggle, live sync
├── options/                      # Auto-saved preferences, strength meter, recovery regen, audit log
├── pages/                        # First-time onboarding & emergency recovery key setup
├── scripts/
│   └── build-content.mjs         # Zero-dependency content script bundler
└── tests/
    ├── mocks/chrome-mock.js      # In-memory MV3 Chrome API mock
    ├── crypto.test.js            # Standalone Web Crypto unit tests (16 assertions)
    ├── suite.test.js             # Full unit & integration test suite (58 assertions)
    └── runner.html               # In-browser Web Crypto test runner
```

---

## Security & Cryptography

| Security Control      | Implementation Details                                                                                                                                                             |
| :-------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Key Derivation**    | PBKDF2-HMAC-SHA256, `600,000` iterations, 128-bit `crypto.getRandomValues()` salt, 256-bit key                                                                                     |
| **Password Policy**   | `8–128` characters, minimum 2 character classes (rejects oversized inputs to prevent CPU DoS)                                                                                      |
| **Verification**      | Constant-time `timingSafeEqual()` serialized under an async mutex queue (prevents TOCTOU races)                                                                                    |
| **DOM Isolation**     | `attachShadow({ mode: 'closed' })` + `subtree: true` `MutationObserver` visibility guard                                                                                           |
| **IPC Authorization** | Admin actions (`SET_PASSWORD`, `CHANGE_PASSWORD`, `UPDATE_SETTINGS`, `GET_SETTINGS`, `GET_AUDIT_LOG`, `REGENERATE_RECOVERY_KEY`) reject callers outside `chrome-extension://<id>/` |
| **Session Isolation** | `chrome.storage.session` + `"incognito": "split"` + `chrome.runtime.onStartup` lockdown                                                                                            |
| **Lockout Defense**   | Exponential delays (`30s` to `24h`) with `lockoutStartedAt` clock-rollback detection                                                                                               |

---

## Installation

1. **Clone this repository**:
   ```bash
   git clone https://github.com/AliGohar2151/InstaLockExt.git
   ```
2. Open **Google Chrome** (or any Chromium-based browser) and navigate to:
   ```text
   chrome://extensions
   ```
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the cloned `InstaLockExt` folder.
5. The **Master Password Setup** page (`pages/setup.html`) opens automatically—set your master password and store your **Emergency Recovery Key** safely offline.

---

## Development & Build

`content/content-bundle.js` is pre-built and tracked in the repository so users can load the unpacked extension directly without a build step. If you modify any file in `content/` or `shared/`, regenerate the content bundle using Node.js (zero npm dependencies required):

```bash
node scripts/build-content.mjs
```

---

## Testing & Verification

### 1. Automated Unit & Integration Suite (Node.js)

Run all **58 assertions** covering Web Crypto, password policy, route matching, storage schema validation, IPC origin separation, mutex concurrency, exponential lockouts, recovery keys, and inactivity/workstation locking:

```bash
node tests/suite.test.js
```

Run standalone cryptographic tests (16 assertions):

```bash
node tests/crypto.test.js
```

### 2. Browser Verification Runner

Open `tests/runner.html` directly in Chrome to execute the 16 Web Crypto assertions natively inside the browser engine.

### 3. Manual Verification Matrix

| Scenario                    | Steps                                                                | Expected Result                                                                             |
| :-------------------------- | :------------------------------------------------------------------- | :------------------------------------------------------------------------------------------ |
| **First-Run Onboarding**    | Load unpacked extension.                                             | `pages/setup.html` opens; enforces 8+ char mixed password and outputs 16-char Recovery Key. |
| **Anti-FOUC & Lock Screen** | Visit `https://www.instagram.com`.                                   | Blurred veil appears at `document_start`, followed by closed Shadow DOM modal.              |
| **Lockout & Tab Sync**      | Enter 3 wrong passwords across Tab A & Tab B.                        | Shake animation + ARIA alert; `30s` timer syncs across tabs and persists across reloads.    |
| **Direct Popup Unlock**     | Click toolbar icon while locked and submit password.                 | Unlocks all open Instagram tabs directly from the popup.                                    |
| **Quick Lock Shortcut**     | Press `Alt + Shift + L` while unlocked.                              | Immediately locks every open Instagram tab.                                                 |
| **Workstation OS Lock**     | Lock your computer (`Win + L`) and unlock OS.                        | Instagram tabs lock immediately regardless of elapsed timeout.                              |
| **Selective Locking**       | Switch Protection Mode to **DM Privacy** in Options.                 | Feed/Explore stay accessible; opening `/direct/inbox/` triggers the lock screen.            |
| **Lock on Reopen**          | Enable **Lock on Reopen** in popup/options, close IG tab, reopen IG. | Session locks immediately on tab closure; reopened tab prompts for password.                |
| **Emergency Recovery**      | Click _"Forgot password? Use recovery key"_ on lock screen.          | Resets master password offline, issues a rotated recovery key, and unlocks.                 |

---

## Known Limitations

- **Browser Profile Access**: Anyone with physical access to an unlocked OS user session can open `chrome://extensions` to disable or uninstall browser extensions unless restricted by enterprise policy. Always lock your computer (`Win + L` / `Cmd + Ctrl + Q`) when stepping away.
- **Chrome DevTools**: Users with unrestricted DevTools access can inspect or modify client scripts locally in Developer Mode.
- **Incognito Mode**: Extensions only run in Incognito windows if _"Allow in Incognito"_ is explicitly enabled in `chrome://extensions` details (`"incognito": "split"` isolates normal and private sessions).
