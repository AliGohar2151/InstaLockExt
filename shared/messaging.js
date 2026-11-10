/**
 * Instagram Lock - Messaging Utilities
 * Provides validated, typed message communication across extension components.
 */

/**
 * Sends a message to the background service worker and returns a Promise.
 * @param {string} action
 * @param {object} payload
 * @returns {Promise<any>}
 */
export async function sendExtensionMessage(action, payload = {}) {
  try {
    if (!chrome.runtime?.id) {
      throw new Error('Extension context invalidated');
    }
    const response = await chrome.runtime.sendMessage({ action, ...payload });
    return response;
  } catch (error) {
    console.error(`[IG-Lock Messaging] Error sending action "${action}":`, error);
    return { success: false, error: error.message, contextInvalidated: !chrome.runtime?.id || error.message?.includes('Extension context invalidated') };
  }
}

/**
 * Validates whether a message came from a trusted extension context (content script or extension page).
 * Rejects external web page contexts or mismatched extension IDs.
 * @param {chrome.runtime.MessageSender} sender
 * @returns {boolean}
 */
export function isTrustedSender(sender) {
  if (!sender) return false;
  if (sender.id !== chrome.runtime.id) {
    console.warn('[IG-Lock Security] Untrusted sender ID rejected:', sender.id);
    return false;
  }
  return true;
}

/**
 * Validates whether a message originated specifically from a privileged extension page
 * (popup, options, or setup) rather than a content script injected into a web tab.
 * @param {chrome.runtime.MessageSender} sender
 * @returns {boolean}
 */
export function isPrivilegedExtensionContext(sender) {
  if (!isTrustedSender(sender)) return false;
  const extPrefix = `chrome-extension://${chrome.runtime.id}/`;
  return Boolean(sender.url) && sender.url.startsWith(extPrefix);
}

/**
 * Broadcasts a message to all active Instagram tabs.
 * Called exclusively from background service worker.
 * @param {object} message
 */
export async function broadcastToInstagramTabs(message) {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://*.instagram.com/*' });
    const promises = tabs.map(async tab => {
      if (!tab.id) return;
      try {
        await chrome.tabs.sendMessage(tab.id, message);
      } catch (err) {
        // Tab might still be loading or lack a listener; loading tabs will converge via GET_STATUS
      }
    });
    await Promise.all(promises);
  } catch (error) {
    console.error('[IG-Lock Messaging] Failed to broadcast to Instagram tabs:', error);
  }
}
