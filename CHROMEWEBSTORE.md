# Chrome Web Store Metadata & Listing

## Basic Information
- **Extension Name**: Instagram Lock - Password Protection
- **Version**: 1.1.0
- **Category**: Productivity / Privacy & Security
- **Language**: English
- **Last Updated**: 2026-11-10

## Store Copy

### Short Description (Max 132 characters)
Password-protect your Instagram Web session with automatic inactivity locking, selective section locks, and multi-tab sync.

### Detailed Description
Protect your Instagram Web privacy with master password authentication, selective section locking, and automatic inactivity protection.

Whether you share a computer at home, work in an open office, or frequently leave your browser unattended, Instagram Lock ensures that your Instagram direct messages, private profile, Reels, and feed remain inaccessible until you provide your master password.

### Key Features
- **Session-Based Master Password Protection**: Authenticate once per browser session. Your Instagram stays accessible as long as your browser is open and you remain active.
- **Selective Protection Modes**: Choose to lock the entire Instagram site, block only **Reels & Explore** to curb distractions, or protect only **Direct Messages (DMs)** for private messaging security.
- **Instant Blurred Anti-Peek Shield**: Pages are covered immediately upon loading without jarring flickers, preventing momentary peeks at your messages or feed.
- **Smart Inactivity & Workstation Auto-Lock**: Automatically locks all Instagram tabs when no mouse, keyboard, or scroll activity is detected (1–30 minutes), when you lock your computer screen, or when all Instagram tabs are closed.
- **Multi-Tab Synchronization & Direct Popup Unlock**: Unlock directly from the extension popup or any tab to unlock all open Instagram tabs simultaneously. Press `Alt+Shift+L` anytime to lock instantly.
- **Zero Cloud Footprint & Offline Recovery**: All password verification and emergency recovery keys run 100% offline on your device. No personal details, browsing history, or passwords are ever sent to outside servers.
- **Brute-Force Protection & Audit Log**: Exponential delay timers automatically engage after repeated incorrect passwords, with a local security log of recent lock and unlock events.

---

## Permissions Justification

| Permission / Host | Plain-English Review Justification |
| :--- | :--- |
| `storage` | Required to store user preferences, local security audit logs, and cryptographic credentials (salt and PBKDF2 hash), as well as ephemeral session authentication state that resets when the browser closes. |
| `alarms` | Required to monitor background inactivity intervals and automatically trigger a lock event when the user has been inactive for the configured timeout. |
| `idle` | Required to detect when the operating system enters an idle or locked state so the extension can automatically re-lock Instagram immediately when the user locks their computer. |
| `https://*.instagram.com/*` | Required to display the password lock screen on Instagram Web, monitor user activity within Instagram tabs to prevent premature timeouts, synchronize lock/unlock messages across open Instagram tabs, and prevent unauthorized viewing of Instagram content. |

*(Note: Broad `tabs` permission is intentionally omitted; tab synchronization and closure detection operate strictly within the scoped `https://*.instagram.com/*` host permission.)*

---

## Privacy & Data Use Disclosure
- **Does this extension collect user personal data?** No.
- **Does this extension transmit data to external servers or third parties?** No. The extension operates 100% offline.
- **Single Purpose Declaration**: The single purpose of this extension is to protect the user's Instagram Web session with password authentication, selective section locking, and inactivity protection.

---

## Version History
- **v1.1.0** (Security Hardening & Feature Update):
  - Closed Shadow DOM encapsulation, role-based IPC verification, atomic verification mutex, and OWASP 600,000 PBKDF2 iterations.
  - Immediate workstation OS screen lock (`chrome.idle` locked state) and `Alt+Shift+L` Quick Lock shortcut.
  - Selective feature blocking (Full Site, Reels & Explore, Direct Messages).
  - Direct popup unlock, dynamic light/dark theme matching, offline emergency recovery keys, and local security activity log.
  - Removed unnecessary `tabs` permission and enforced incognito split isolation.
- **v1.0.0** (Initial Release):
  - Master password onboarding and PBKDF2 encryption.
  - Shadow DOM lock screen with zero-flash preloader shield.
  - Multi-tab synchronization and inactivity timer.
  - Popup and options management interfaces.
