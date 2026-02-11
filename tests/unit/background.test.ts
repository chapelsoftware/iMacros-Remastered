/**
 * Background Service Worker Unit Tests
 *
 * Tests for extension/src/background.ts covering:
 * - Listener registration (messages, tabs, navigation, etc.)
 * - handleMessage routing for various message types
 * - Tab management operations
 * - Recording state management
 * - Auth & filter passthrough
 * - Playback control
 * - Download handling
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to ensure chrome is available BEFORE background.ts module-level code runs.
// vi.hoisted runs before any imports, so chrome will be defined when background.ts loads.
const {
  tabListeners, webNavListeners,
  messageListenerRef, externalConnectListenerRef,
  installedListenerRef, startupListenerRef,
  actionClickedListenerRef, downloadCreatedListenerRef,
  mockConnectNative, mockTabsQuery, mockTabsGet, mockTabsCreate,
  mockTabsUpdate, mockTabsRemove, mockTabsGoBack, mockTabsGoForward,
  mockTabsReload, mockTabsSendMessage, mockTabsCaptureVisibleTab,
  mockWindowsUpdate, mockBrowsingDataRemove,
  mockWebNavGetAllFrames, mockDownloadsDownload, mockRuntimeGetURL,
} = vi.hoisted(() => {
  const tl: Record<string, Function[]> = {
    onCreated: [], onRemoved: [], onUpdated: [], onActivated: [],
  };
  const wl: Record<string, Function[]> = {
    onCommitted: [], onCompleted: [],
  };
  const mlRef = { current: null as Function | null };
  const ecRef = { current: null as Function | null };
  const ilRef = { current: null as Function | null };
  const slRef = { current: null as Function | null };
  const acRef = { current: null as Function | null };
  const dcRef = { current: null as Function | null };

  const _mockConnectNative = vi.fn(() => ({
    onMessage: { addListener: vi.fn() },
    onDisconnect: { addListener: vi.fn() },
    postMessage: vi.fn(),
    disconnect: vi.fn(),
  }));
  const _mockTabsQuery = vi.fn().mockResolvedValue([{ id: 1, url: 'https://example.com', active: true }]);
  const _mockTabsGet = vi.fn().mockResolvedValue({ id: 1, url: 'https://example.com', title: 'Example', status: 'complete' });
  const _mockTabsCreate = vi.fn().mockResolvedValue({ id: 2, url: 'about:blank' });
  const _mockTabsUpdate = vi.fn().mockResolvedValue({ id: 1, url: 'https://example.com', windowId: 1 });
  const _mockTabsRemove = vi.fn().mockResolvedValue(undefined);
  const _mockTabsGoBack = vi.fn().mockResolvedValue(undefined);
  const _mockTabsGoForward = vi.fn().mockResolvedValue(undefined);
  const _mockTabsReload = vi.fn().mockResolvedValue(undefined);
  const _mockTabsSendMessage = vi.fn().mockResolvedValue({ success: true });
  const _mockTabsCaptureVisibleTab = vi.fn().mockResolvedValue('data:image/png;base64,test');
  const _mockWindowsUpdate = vi.fn().mockResolvedValue(undefined);
  const _mockBrowsingDataRemove = vi.fn().mockResolvedValue(undefined);
  const _mockStorageLocalGet = vi.fn().mockResolvedValue({});
  const _mockWebNavGetAllFrames = vi.fn().mockResolvedValue([{ frameId: 0 }]);
  const _mockDownloadsDownload = vi.fn((_opts: any, cb: Function) => cb(123));
  const _mockRuntimeGetURL = vi.fn((path: string) => `chrome-extension://abc/${path}`);

  // Install chrome globally BEFORE any module code runs
  (globalThis as any).chrome = {
    runtime: {
      connectNative: _mockConnectNative,
      onMessage: { addListener: vi.fn((l: any) => { mlRef.current = l; }) },
      onConnectExternal: { addListener: vi.fn((l: any) => { ecRef.current = l; }) },
      onInstalled: { addListener: vi.fn((l: any) => { ilRef.current = l; }) },
      onStartup: { addListener: vi.fn((l: any) => { slRef.current = l; }) },
      sendMessage: vi.fn().mockResolvedValue(undefined),
      getURL: _mockRuntimeGetURL,
      lastError: null,
    },
    tabs: {
      query: _mockTabsQuery,
      get: _mockTabsGet,
      create: _mockTabsCreate,
      update: _mockTabsUpdate,
      remove: _mockTabsRemove,
      goBack: _mockTabsGoBack,
      goForward: _mockTabsGoForward,
      reload: _mockTabsReload,
      sendMessage: _mockTabsSendMessage,
      captureVisibleTab: _mockTabsCaptureVisibleTab,
      onCreated: { addListener: vi.fn((l: any) => tl.onCreated.push(l)) },
      onRemoved: { addListener: vi.fn((l: any) => tl.onRemoved.push(l)) },
      onUpdated: { addListener: vi.fn((l: any) => tl.onUpdated.push(l)) },
      onActivated: { addListener: vi.fn((l: any) => tl.onActivated.push(l)) },
    },
    webNavigation: {
      getAllFrames: _mockWebNavGetAllFrames,
      onCommitted: { addListener: vi.fn((l: any) => wl.onCommitted.push(l)) },
      onCompleted: { addListener: vi.fn((l: any) => wl.onCompleted.push(l)) },
    },
    windows: { update: _mockWindowsUpdate },
    sidePanel: { open: vi.fn().mockResolvedValue(undefined), setOptions: vi.fn() },
    action: { onClicked: { addListener: vi.fn((l: any) => { acRef.current = l; }) } },
    downloads: {
      download: _mockDownloadsDownload,
      onCreated: { addListener: vi.fn((l: any) => { dcRef.current = l; }) },
    },
    scripting: { executeScript: vi.fn().mockResolvedValue([{ result: '<html></html>' }]) },
    browsingData: { remove: _mockBrowsingDataRemove },
    storage: { local: { get: _mockStorageLocalGet } },
    declarativeNetRequest: {
      updateDynamicRules: vi.fn().mockResolvedValue(undefined),
      getDynamicRules: vi.fn().mockResolvedValue([]),
    },
    webRequest: { onAuthRequired: { addListener: vi.fn() } },
    contentSettings: { popups: { get: vi.fn(), set: vi.fn(), clear: vi.fn() } },
    proxy: { settings: { get: vi.fn(), set: vi.fn(), clear: vi.fn() } },
  };

  return {
    tabListeners: tl, webNavListeners: wl,
    messageListenerRef: mlRef, externalConnectListenerRef: ecRef,
    installedListenerRef: ilRef, startupListenerRef: slRef,
    actionClickedListenerRef: acRef, downloadCreatedListenerRef: dcRef,
    mockConnectNative: _mockConnectNative,
    mockTabsQuery: _mockTabsQuery, mockTabsGet: _mockTabsGet,
    mockTabsCreate: _mockTabsCreate, mockTabsUpdate: _mockTabsUpdate,
    mockTabsRemove: _mockTabsRemove, mockTabsGoBack: _mockTabsGoBack,
    mockTabsGoForward: _mockTabsGoForward, mockTabsReload: _mockTabsReload,
    mockTabsSendMessage: _mockTabsSendMessage,
    mockTabsCaptureVisibleTab: _mockTabsCaptureVisibleTab,
    mockWindowsUpdate: _mockWindowsUpdate,
    mockBrowsingDataRemove: _mockBrowsingDataRemove,
    mockWebNavGetAllFrames: _mockWebNavGetAllFrames,
    mockDownloadsDownload: _mockDownloadsDownload,
    mockRuntimeGetURL: _mockRuntimeGetURL,
  };
});

// Now import background.ts - it will register listeners using the chrome mock
import '@extension/background.ts';

// Helper to send a message through the listener
async function sendMessage(
  message: any,
  sender: Partial<chrome.runtime.MessageSender> = {}
): Promise<any> {
  return new Promise((resolve) => {
    const listener = messageListenerRef.current;
    if (!listener) throw new Error('No message listener registered');
    listener(
      message,
      { tab: { id: 1 } as chrome.tabs.Tab, frameId: 0, ...sender } as chrome.runtime.MessageSender,
      resolve,
    );
  });
}

describe('Background Service Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chrome.runtime.lastError = null;
  });

  // ===== Listener Registration =====

  describe('Listener Registration', () => {
    it('should register runtime.onMessage listener', () => {
      expect(messageListenerRef.current).not.toBeNull();
    });

    it('should register tab event listeners', () => {
      expect(tabListeners.onCreated.length).toBeGreaterThan(0);
      expect(tabListeners.onRemoved.length).toBeGreaterThan(0);
      expect(tabListeners.onUpdated.length).toBeGreaterThan(0);
      expect(tabListeners.onActivated.length).toBeGreaterThan(0);
    });

    it('should register webNavigation listeners', () => {
      expect(webNavListeners.onCommitted.length).toBeGreaterThan(0);
      expect(webNavListeners.onCompleted.length).toBeGreaterThan(0);
    });

    it('should register onConnectExternal listener', () => {
      expect(externalConnectListenerRef.current).not.toBeNull();
    });

    it('should register onInstalled listener', () => {
      expect(installedListenerRef.current).not.toBeNull();
    });

    it('should register onStartup listener', () => {
      expect(startupListenerRef.current).not.toBeNull();
    });

    it('should register action.onClicked listener', () => {
      expect(actionClickedListenerRef.current).not.toBeNull();
    });

    it('should register downloads.onCreated listener', () => {
      expect(downloadCreatedListenerRef.current).not.toBeNull();
    });
  });

  // ===== Connection Management Messages =====

  describe('Connection Management', () => {
    it('should handle CONNECT message', async () => {
      const result = await sendMessage({ type: 'CONNECT' });
      expect(result.success).toBe(true);
      expect(result.connected).toBe(true);
    });

    it('should handle DISCONNECT message', async () => {
      const result = await sendMessage({ type: 'DISCONNECT' });
      expect(result.success).toBe(true);
      expect(result.connected).toBe(false);
    });

    it('should handle CONNECTION_STATUS message', async () => {
      const result = await sendMessage({ type: 'CONNECTION_STATUS' });
      expect(result.success).toBe(true);
      expect(result).toHaveProperty('connected');
    });
  });

  // ===== Tab Operations =====

  describe('Tab Operations', () => {
    it('should handle TAB_CREATE', async () => {
      const result = await sendMessage({ type: 'TAB_CREATE', payload: { url: 'https://test.com' } });
      expect(result.success).toBe(true);
      expect(mockTabsCreate).toHaveBeenCalled();
    });

    it('should handle TAB_CLOSE', async () => {
      const result = await sendMessage({ type: 'TAB_CLOSE', payload: { tabId: 1 } });
      expect(result.success).toBe(true);
      expect(mockTabsRemove).toHaveBeenCalledWith(1);
    });

    it('should handle TAB_GET', async () => {
      const result = await sendMessage({ type: 'TAB_GET', payload: { tabId: 1 } });
      expect(result.success).toBe(true);
      expect(result.tab).toBeDefined();
    });

    it('should handle TAB_QUERY', async () => {
      const result = await sendMessage({ type: 'TAB_QUERY', payload: {} });
      expect(result.success).toBe(true);
      expect(result.tabs).toBeDefined();
    });

    it('should handle TAB_NAVIGATE', async () => {
      const result = await sendMessage({ type: 'TAB_NAVIGATE', payload: { tabId: 1, url: 'https://test.com' } });
      expect(result.success).toBe(true);
      expect(mockTabsUpdate).toHaveBeenCalledWith(1, { url: 'https://test.com' });
    });

    it('should handle TAB_RELOAD', async () => {
      const result = await sendMessage({ type: 'TAB_RELOAD', payload: { tabId: 1 } });
      expect(result.success).toBe(true);
      expect(mockTabsReload).toHaveBeenCalled();
    });

    it('should handle TAB_BACK', async () => {
      const result = await sendMessage({ type: 'TAB_BACK', payload: { tabId: 1 } });
      expect(result.success).toBe(true);
      expect(mockTabsGoBack).toHaveBeenCalledWith(1);
    });

    it('should handle TAB_FORWARD', async () => {
      const result = await sendMessage({ type: 'TAB_FORWARD', payload: { tabId: 1 } });
      expect(result.success).toBe(true);
      expect(mockTabsGoForward).toHaveBeenCalledWith(1);
    });
  });

  // ===== Recording Messages =====

  describe('Recording Messages', () => {
    it('should handle RECORD_START', async () => {
      const result = await sendMessage({ type: 'RECORD_START', payload: {} });
      expect(result.success).toBe(true);
    });

    it('should handle RECORD_STOP', async () => {
      const result = await sendMessage({ type: 'RECORD_STOP', payload: {} });
      expect(result.success).toBe(true);
    });

    it('should handle RECORD_EVENT with frame context', async () => {
      await sendMessage({ type: 'RECORD_START', payload: {} });
      const result = await sendMessage({
        type: 'RECORD_EVENT',
        payload: {
          command: 'TAG POS=1 TYPE=INPUT ATTR=NAME:test CONTENT=hello',
          frameContext: { inFrame: false, frameIndex: 0, frameName: null },
        },
      });
      expect(result.success).toBe(true);
    });
  });

  // ===== Auth & Filter Messages =====

  describe('Auth & Filter Messages', () => {
    it('should handle SET_AUTH_CREDENTIALS', async () => {
      const result = await sendMessage({
        type: 'SET_AUTH_CREDENTIALS',
        payload: { username: 'user', password: 'pass' },
      });
      expect(result.success).toBe(true);
    });

    it('should handle CLEAR_AUTH_CREDENTIALS', async () => {
      const result = await sendMessage({ type: 'CLEAR_AUTH_CREDENTIALS' });
      expect(result.success).toBe(true);
    });

    it('should handle GET_AUTH_STATUS', async () => {
      const result = await sendMessage({ type: 'GET_AUTH_STATUS' });
      expect(result.success).toBe(true);
      expect(result).toHaveProperty('credentials');
    });

    it('should handle DISABLE_ALL_FILTERS', async () => {
      const result = await sendMessage({ type: 'DISABLE_ALL_FILTERS' });
      expect(result.success).toBe(true);
    });

    it('should handle GET_FILTER_STATUS', async () => {
      const result = await sendMessage({ type: 'GET_FILTER_STATUS' });
      expect(result.success).toBe(true);
      expect(result).toHaveProperty('filters');
    });
  });

  // ===== Playback Control =====

  describe('Playback Control', () => {
    it('should handle STOP_MACRO', async () => {
      const result = await sendMessage({ type: 'STOP_MACRO' });
      expect(result.success).toBe(true);
    });

    it('should handle PAUSE_MACRO', async () => {
      const result = await sendMessage({ type: 'PAUSE_MACRO' });
      expect(result.success).toBe(true);
    });

    it('should handle RESUME_MACRO', async () => {
      const result = await sendMessage({ type: 'RESUME_MACRO' });
      expect(result.success).toBe(true);
    });
  });

  // ===== Utility Messages =====

  describe('Utility Messages', () => {
    it('should handle OPEN_SETTINGS', async () => {
      const result = await sendMessage({ type: 'OPEN_SETTINGS' });
      expect(result.success).toBe(true);
      expect(mockTabsCreate).toHaveBeenCalled();
    });

    it('should handle OPEN_EDITOR', async () => {
      const result = await sendMessage({ type: 'OPEN_EDITOR', payload: { path: 'test.iim' } });
      expect(result.success).toBe(true);
      expect(mockTabsCreate).toHaveBeenCalled();
    });

    it('should handle CLEAR_CACHE', async () => {
      const result = await sendMessage({ type: 'CLEAR_CACHE' });
      expect(result.success).toBe(true);
      expect(mockBrowsingDataRemove).toHaveBeenCalled();
    });

    it('should handle BROADCAST', async () => {
      const result = await sendMessage({ type: 'BROADCAST', payload: { test: true } });
      expect(result.success).toBe(true);
    });

    it('should handle unknown message type', async () => {
      const result = await sendMessage({ type: 'UNKNOWN_TYPE' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown message type');
    });
  });

  // ===== Download Messages =====

  describe('Download Messages', () => {
    it('should handle DOWNLOAD_URL', async () => {
      const result = await sendMessage({
        type: 'DOWNLOAD_URL',
        payload: { url: 'https://example.com/file.zip' },
      });
      expect(result.success).toBe(true);
      expect(result.downloadId).toBe(123);
    });

    it('should handle saveItem', async () => {
      const result = await sendMessage({
        type: 'saveItem',
        payload: { url: 'https://example.com/file.zip', file: 'file.zip' },
      });
      expect(result.success).toBe(true);
    });

    it('should fail saveItem without URL', async () => {
      const result = await sendMessage({
        type: 'saveItem',
        payload: {},
      });
      expect(result.success).toBe(false);
    });

    it('should handle setDownloadOptions', async () => {
      const result = await sendMessage({
        type: 'setDownloadOptions',
        payload: { folder: '/downloads', file: 'test.zip' },
      });
      expect(result.success).toBe(true);
    });
  });

  // ===== Tab Event Listeners =====

  describe('Tab Event Listeners', () => {
    it('should track tab creation', () => {
      for (const listener of tabListeners.onCreated) {
        listener({ id: 42, url: 'https://test.com' });
      }
    });

    it('should track tab removal', () => {
      for (const listener of tabListeners.onRemoved) {
        listener(42);
      }
    });

    it('should track tab updates', () => {
      for (const listener of tabListeners.onUpdated) {
        listener(1, { status: 'complete' }, { id: 1, url: 'https://test.com' });
      }
    });
  });
});
