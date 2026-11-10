/**
 * Instagram Lock - Activity Tracker
 * Observes user interaction events, reports activity to background with throttling,
 * maintains a secondary local inactivity timer (MV3-03), and protects against
 * orphaned context invalidation (EDG-01).
 */

import { ACTIONS } from '../shared/constants.js';
import { sendExtensionMessage } from '../shared/messaging.js';

const THROTTLE_INTERVAL_MS = 15000; // 15 seconds IPC throttle
const LOCAL_CHECK_INTERVAL_MS = 5000; // Evaluate local timer every 5 seconds

export class ActivityTracker {
  constructor(onContextInvalidated) {
    this.isActive = false;
    this.lastReported = 0;
    this.lastLocalInteraction = 0;
    this.timeoutMinutes = 0;
    this.autoLockEnabled = true;
    this.localCheckTimer = null;
    this.onContextInvalidated = onContextInvalidated;
    this.handleUserEvent = this.handleUserEvent.bind(this);
  }

  /**
   * Configures inactivity thresholds from status payload.
   */
  configure(timeoutMinutes, autoLockEnabled) {
    this.timeoutMinutes = Number(timeoutMinutes) || 0;
    this.autoLockEnabled = Boolean(autoLockEnabled);
  }

  start() {
    if (this.isActive) return;
    this.isActive = true;
    const now = Date.now();
    this.lastReported = now;
    this.lastLocalInteraction = now;

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(eventName => {
      window.addEventListener(eventName, this.handleUserEvent, { passive: true, capture: true });
    });

    // Secondary local timer to overcome chrome.alarms 1-minute jitter (MV3-03)
    this.localCheckTimer = setInterval(() => this.evaluateLocalTimeout(), LOCAL_CHECK_INTERVAL_MS);
  }

  stop() {
    if (!this.isActive) return;
    this.isActive = false;

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(eventName => {
      window.removeEventListener(eventName, this.handleUserEvent, { capture: true });
    });

    if (this.localCheckTimer) {
      clearInterval(this.localCheckTimer);
      this.localCheckTimer = null;
    }
  }

  async handleUserEvent() {
    // Check extension context health (EDG-01)
    if (!chrome.runtime?.id) {
      this.triggerContextInvalidated();
      return;
    }

    const now = Date.now();
    this.lastLocalInteraction = now;

    if (now - this.lastReported >= THROTTLE_INTERVAL_MS) {
      this.lastReported = now;
      const res = await sendExtensionMessage(ACTIONS.RECORD_ACTIVITY);
      if (res && res.contextInvalidated) {
        this.triggerContextInvalidated();
      }
    }
  }

  async evaluateLocalTimeout() {
    if (!this.isActive) return;

    if (!chrome.runtime?.id) {
      this.triggerContextInvalidated();
      return;
    }

    if (!this.autoLockEnabled || this.timeoutMinutes <= 0) return;

    const elapsedMs = Date.now() - this.lastLocalInteraction;
    const thresholdMs = this.timeoutMinutes * 60 * 1000;

    if (elapsedMs >= thresholdMs) {
      const res = await sendExtensionMessage(ACTIONS.CHECK_INACTIVITY);
      if (res && res.contextInvalidated) {
        this.triggerContextInvalidated();
      }
    }
  }

  triggerContextInvalidated() {
    this.stop();
    if (typeof this.onContextInvalidated === 'function') {
      this.onContextInvalidated();
    }
  }
}
