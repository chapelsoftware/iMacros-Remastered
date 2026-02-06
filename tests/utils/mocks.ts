/**
 * Mock utilities for testing
 */
import { vi } from 'vitest';

/**
 * Mock Chrome extension APIs
 */
export function createMockChromeRuntime() {
  return {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(),
    },
    connect: vi.fn(() => ({
      postMessage: vi.fn(),
      disconnect: vi.fn(),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      onDisconnect: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    })),
    connectNative: vi.fn(() => ({
      postMessage: vi.fn(),
      disconnect: vi.fn(),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      onDisconnect: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    })),
    getManifest: vi.fn(() => ({
      manifest_version: 3,
      name: 'iMacros Test',
      version: '1.0.0',
    })),
    id: 'mock-extension-id',
    lastError: null,
  };
}

/**
 * Mock Chrome storage API
 */
export function createMockChromeStorage() {
  const storage = new Map<string, any>();

  return {
    local: {
      get: vi.fn((keys: string | string[] | null) => {
        if (keys === null) {
          return Promise.resolve(Object.fromEntries(storage));
        }
        const keyList = Array.isArray(keys) ? keys : [keys];
        const result: Record<string, any> = {};
        keyList.forEach(key => {
          if (storage.has(key)) {
            result[key] = storage.get(key);
          }
        });
        return Promise.resolve(result);
      }),
      set: vi.fn((items: Record<string, any>) => {
        Object.entries(items).forEach(([key, value]) => {
          storage.set(key, value);
        });
        return Promise.resolve();
      }),
      remove: vi.fn((keys: string | string[]) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        keyList.forEach(key => storage.delete(key));
        return Promise.resolve();
      }),
      clear: vi.fn(() => {
        storage.clear();
        return Promise.resolve();
      }),
    },
    sync: {
      get: vi.fn(() => Promise.resolve({})),
      set: vi.fn(() => Promise.resolve()),
      remove: vi.fn(() => Promise.resolve()),
      clear: vi.fn(() => Promise.resolve()),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  };
}

/**
 * Mock Chrome tabs API
 */
export function createMockChromeTabs() {
  return {
    query: vi.fn(() => Promise.resolve([])),
    get: vi.fn((tabId: number) =>
      Promise.resolve({
        id: tabId,
        url: 'https://example.com',
        title: 'Example',
        active: true,
        windowId: 1,
      })
    ),
    create: vi.fn((props: any) =>
      Promise.resolve({
        id: 1,
        ...props,
      })
    ),
    update: vi.fn((tabId: number, props: any) =>
      Promise.resolve({
        id: tabId,
        ...props,
      })
    ),
    remove: vi.fn(() => Promise.resolve()),
    sendMessage: vi.fn(),
    onUpdated: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onRemoved: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  };
}

/**
 * Create full mock Chrome API
 */
export function createMockChrome() {
  return {
    runtime: createMockChromeRuntime(),
    storage: createMockChromeStorage(),
    tabs: createMockChromeTabs(),
  };
}

/**
 * Install mock Chrome globally
 */
export function installMockChrome(): () => void {
  const mockChrome = createMockChrome();
  (globalThis as any).chrome = mockChrome;

  return () => {
    delete (globalThis as any).chrome;
  };
}

/**
 * Create a mock native messaging port
 */
export function createMockNativePort() {
  const messageHandlers: ((message: any) => void)[] = [];
  const disconnectHandlers: (() => void)[] = [];

  return {
    port: {
      postMessage: vi.fn(),
      disconnect: vi.fn(() => {
        disconnectHandlers.forEach(handler => handler());
      }),
      onMessage: {
        addListener: vi.fn((handler: (message: any) => void) => {
          messageHandlers.push(handler);
        }),
        removeListener: vi.fn((handler: (message: any) => void) => {
          const index = messageHandlers.indexOf(handler);
          if (index !== -1) {
            messageHandlers.splice(index, 1);
          }
        }),
      },
      onDisconnect: {
        addListener: vi.fn((handler: () => void) => {
          disconnectHandlers.push(handler);
        }),
        removeListener: vi.fn((handler: () => void) => {
          const index = disconnectHandlers.indexOf(handler);
          if (index !== -1) {
            disconnectHandlers.splice(index, 1);
          }
        }),
      },
    },
    simulateMessage: (message: any) => {
      messageHandlers.forEach(handler => handler(message));
    },
    simulateDisconnect: () => {
      disconnectHandlers.forEach(handler => handler());
    },
  };
}

/**
 * Mock iMacros message for testing
 */
export function createMockMessage(overrides: Partial<{
  type: string;
  id: string;
  timestamp: number;
  payload: any;
}> = {}) {
  return {
    type: 'test',
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    timestamp: Date.now(),
    ...overrides,
  };
}
