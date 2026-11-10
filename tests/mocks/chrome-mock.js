/**
 * In-Memory Mock for Chrome Extension APIs (Manifest V3)
 * Enables standalone Node.js unit testing of background managers and storage utilities.
 */

export function createChromeMock(extensionId = 'test-ext-id-12345') {
  const localStore = new Map();
  const sessionStore = new Map();
  const alarmsStore = new Map();
  let mockTabs = [];
  let shouldThrowOnSessionRemove = false;

  const storageArea = (map, isSession = false) => ({
    async get(keys) {
      const result = {};
      if (keys === null || keys === undefined) {
        for (const [k, v] of map.entries()) result[k] = v;
        return result;
      }
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) {
        if (map.has(k)) result[k] = map.get(k);
      }
      return result;
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) {
        map.set(k, structuredClone(v));
      }
    },
    async remove(keys) {
      if (isSession && shouldThrowOnSessionRemove) {
        throw new Error('Simulated session remove failure');
      }
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) map.delete(k);
    },
    async clear() {
      map.clear();
    }
  });

  const sentTabMessages = [];

  const mockChrome = {
    runtime: {
      id: extensionId,
      getURL: (path) => `chrome-extension://${extensionId}/${path}`,
      onInstalled: { addListener: () => {} },
      onStartup: { addListener: () => {} },
      onMessage: { addListener: () => {} },
      onConnect: { addListener: () => {} },
      sendMessage: async () => ({ success: true })
    },
    storage: {
      local: storageArea(localStore, false),
      session: storageArea(sessionStore, true),
      onChanged: { addListener: () => {} }
    },
    alarms: {
      async create(name, info) {
        alarmsStore.set(name, info);
      },
      async clear(name) {
        return alarmsStore.delete(name);
      },
      async get(name) {
        return alarmsStore.get(name) || null;
      },
      onAlarm: { addListener: () => {} }
    },
    tabs: {
      async query(queryInfo) {
        if (queryInfo?.url && queryInfo.url.includes('instagram.com')) {
          return mockTabs.filter(t => t.url && t.url.includes('instagram.com'));
        }
        return mockTabs;
      },
      async sendMessage(tabId, message) {
        sentTabMessages.push({ tabId, message });
      },
      async create() {},
      onActivated: { addListener: () => {} },
      onRemoved: { addListener: () => {} }
    },
    windows: {
      WINDOW_ID_NONE: -1,
      onFocusChanged: { addListener: () => {} }
    },
    idle: {
      onStateChanged: { addListener: () => {} }
    },
    commands: {
      onCommand: { addListener: () => {} }
    },
    // Test helpers
    __test: {
      reset() {
        localStore.clear();
        sessionStore.clear();
        alarmsStore.clear();
        mockTabs = [];
        sentTabMessages.length = 0;
        shouldThrowOnSessionRemove = false;
      },
      setTabs(tabs) {
        mockTabs = tabs;
      },
      getSentTabMessages() {
        return sentTabMessages;
      },
      setThrowOnSessionRemove(flag) {
        shouldThrowOnSessionRemove = flag;
      },
      getLocalStore() {
        return localStore;
      },
      getSessionStore() {
        return sessionStore;
      }
    }
  };

  return mockChrome;
}
