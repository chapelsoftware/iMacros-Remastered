/**
 * Web Request Handlers Unit Tests
 *
 * Tests for extension/src/background/web-request-handlers.ts covering:
 * - Auth credential queue (set, clear, get, FIFO consumption)
 * - Filter rules (images, flash, popups, declarativeNetRequest rule content)
 * - Popup permissions (save/restore via contentSettings)
 * - Proxy backup/restore (direct, system, http, socks4, socks5, https, per-protocol, bypass)
 * - handleAuthRequired FIFO credential consumption via captured listener
 * - Error handling paths (chrome.runtime.lastError, API unavailability)
 * - handleLoginConfig / handleSetFilter message handlers
 * - initWebRequestHandlers initialization
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chrome APIs before importing the module
const mockAddListener = vi.fn();
const mockUpdateDynamicRules = vi.fn().mockResolvedValue(undefined);
const mockGetDynamicRules = vi.fn().mockResolvedValue([]);
const mockContentSettingsPopupsGet = vi.fn();
const mockContentSettingsPopupsSet = vi.fn();
const mockContentSettingsPopupsClear = vi.fn();
const mockProxySettingsGet = vi.fn();
const mockProxySettingsSet = vi.fn();
const mockProxySettingsClear = vi.fn();

(globalThis as any).chrome = {
  webRequest: {
    onAuthRequired: {
      addListener: mockAddListener,
    },
  },
  declarativeNetRequest: {
    updateDynamicRules: mockUpdateDynamicRules,
    getDynamicRules: mockGetDynamicRules,
  },
  contentSettings: {
    popups: {
      get: mockContentSettingsPopupsGet,
      set: mockContentSettingsPopupsSet,
      clear: mockContentSettingsPopupsClear,
    },
  },
  proxy: {
    settings: {
      get: mockProxySettingsGet,
      set: mockProxySettingsSet,
      clear: mockProxySettingsClear,
    },
  },
  runtime: {
    lastError: null as { message: string } | null,
  },
};

import {
  setAuthCredentials,
  clearAuthCredentials,
  getAuthCredentials,
  setFilter,
  disableAllFilters,
  getFilterState,
  initFilterRules,
  initAuthHandler,
  handleLoginConfig,
  handleSetFilter,
  handleSetPopupAllowed,
  handleRestorePopupSettings,
  handleSetProxy,
  handleRestoreProxy,
  initWebRequestHandlers,
} from '@extension/background/web-request-handlers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Capture the listener registered by initAuthHandler */
function captureAuthListener(): Function {
  mockAddListener.mockClear();
  initAuthHandler();
  expect(mockAddListener).toHaveBeenCalledTimes(1);
  return mockAddListener.mock.calls[0][0];
}

/** Create a minimal WebAuthenticationChallengeDetails mock */
function authDetails(url = 'https://example.com/secret'): chrome.webRequest.WebAuthenticationChallengeDetails {
  return {
    url,
    challenger: { host: 'example.com', port: 443 },
    isProxy: false,
    scheme: 'basic',
    realm: 'Restricted',
    requestId: '1',
    frameId: 0,
    parentFrameId: -1,
    tabId: 1,
    type: 'main_frame' as chrome.webRequest.ResourceType,
    timeStamp: Date.now(),
    method: 'GET',
    statusCode: 401,
    statusLine: 'HTTP/1.1 401 Unauthorized',
    responseHeaders: [],
    documentId: 'doc1',
    documentLifecycle: 'active' as chrome.webRequest.DocumentLifecycleType,
    frameType: 'outermost_frame' as chrome.webRequest.FrameType,
  };
}

describe('Web Request Handlers', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    clearAuthCredentials();
    await disableAllFilters();
    chrome.runtime.lastError = null;

    // Reset popup saved state: mock callbacks so restorePopupSettings can run
    mockContentSettingsPopupsSet.mockImplementation((_d: any, cb: Function) => cb());
    mockContentSettingsPopupsClear.mockImplementation((_d: any, cb: Function) => cb());
    await handleRestorePopupSettings();

    // Reset proxy saved state
    mockProxySettingsSet.mockImplementation((_d: any, cb: Function) => cb());
    mockProxySettingsClear.mockImplementation((_d: any, cb: Function) => cb());
    await handleRestoreProxy();

    // Clear mocks again after reset calls
    vi.clearAllMocks();
    chrome.runtime.lastError = null;
  });

  // =========================================================================
  // Auth Credentials Queue
  // =========================================================================

  describe('Auth Credentials', () => {
    it('should start with empty credentials queue', () => {
      expect(getAuthCredentials()).toEqual([]);
    });

    it('should set credentials (replace mode)', () => {
      setAuthCredentials('user1', 'pass1');
      const creds = getAuthCredentials();
      expect(creds).toHaveLength(1);
      expect(creds[0]).toEqual({ username: 'user1', active: true });
    });

    it('should replace queue when append=false (default)', () => {
      setAuthCredentials('user1', 'pass1');
      setAuthCredentials('user2', 'pass2');
      const creds = getAuthCredentials();
      expect(creds).toHaveLength(1);
      expect(creds[0].username).toBe('user2');
    });

    it('should append to queue when append=true', () => {
      setAuthCredentials('user1', 'pass1');
      setAuthCredentials('user2', 'pass2', undefined, undefined, true);
      const creds = getAuthCredentials();
      expect(creds).toHaveLength(2);
      expect(creds[0].username).toBe('user1');
      expect(creds[1].username).toBe('user2');
    });

    it('should build a multi-entry FIFO queue', () => {
      setAuthCredentials('a', 'pa');
      setAuthCredentials('b', 'pb', undefined, undefined, true);
      setAuthCredentials('c', 'pc', undefined, undefined, true);
      const creds = getAuthCredentials();
      expect(creds).toHaveLength(3);
      expect(creds.map(c => c.username)).toEqual(['a', 'b', 'c']);
    });

    it('should clear all credentials', () => {
      setAuthCredentials('user1', 'pass1');
      setAuthCredentials('user2', 'pass2', undefined, undefined, true);
      clearAuthCredentials();
      expect(getAuthCredentials()).toEqual([]);
    });

    it('should support URL pattern parameter', () => {
      setAuthCredentials('user1', 'pass1', 'example\\.com');
      const creds = getAuthCredentials();
      expect(creds).toHaveLength(1);
      expect(creds[0].active).toBe(true);
    });

    it('should support timeout parameter', () => {
      setAuthCredentials('user1', 'pass1', undefined, 30);
      expect(getAuthCredentials()).toHaveLength(1);
    });

    it('should only expose username and active in getAuthCredentials', () => {
      setAuthCredentials('user1', 'secret', 'pattern', 60);
      const creds = getAuthCredentials();
      expect(Object.keys(creds[0])).toEqual(['username', 'active']);
    });
  });

  // =========================================================================
  // FIFO Credential Consumption (handleAuthRequired via listener)
  // =========================================================================

  describe('FIFO Credential Consumption', () => {
    it('should provide first credential and remove it from queue', () => {
      const listener = captureAuthListener();
      setAuthCredentials('user1', 'pass1');
      setAuthCredentials('user2', 'pass2', undefined, undefined, true);

      const callback = vi.fn();
      listener(authDetails(), callback);

      expect(callback).toHaveBeenCalledWith({
        authCredentials: { username: 'user1', password: 'pass1' },
      });
      // user1 consumed, user2 remains
      expect(getAuthCredentials()).toHaveLength(1);
      expect(getAuthCredentials()[0].username).toBe('user2');
    });

    it('should consume credentials in FIFO order across multiple requests', () => {
      const listener = captureAuthListener();
      setAuthCredentials('first', 'p1');
      setAuthCredentials('second', 'p2', undefined, undefined, true);
      setAuthCredentials('third', 'p3', undefined, undefined, true);

      const cb1 = vi.fn();
      const cb2 = vi.fn();
      const cb3 = vi.fn();

      listener(authDetails(), cb1);
      listener(authDetails(), cb2);
      listener(authDetails(), cb3);

      expect(cb1).toHaveBeenCalledWith(expect.objectContaining({
        authCredentials: { username: 'first', password: 'p1' },
      }));
      expect(cb2).toHaveBeenCalledWith(expect.objectContaining({
        authCredentials: { username: 'second', password: 'p2' },
      }));
      expect(cb3).toHaveBeenCalledWith(expect.objectContaining({
        authCredentials: { username: 'third', password: 'p3' },
      }));
      expect(getAuthCredentials()).toHaveLength(0);
    });

    it('should return empty response when queue is empty', () => {
      const listener = captureAuthListener();
      const callback = vi.fn();
      listener(authDetails(), callback);
      expect(callback).toHaveBeenCalledWith({});
    });

    it('should return empty response when no callback and queue empty', () => {
      const listener = captureAuthListener();
      const result = listener(authDetails());
      // Without callback, returns the response directly
      expect(result).toEqual({});
    });

    it('should return auth response synchronously without callback', () => {
      const listener = captureAuthListener();
      setAuthCredentials('syncuser', 'syncpass');
      const result = listener(authDetails());
      expect(result).toEqual({
        authCredentials: { username: 'syncuser', password: 'syncpass' },
      });
    });

    it('should match URL pattern when provided', () => {
      const listener = captureAuthListener();
      setAuthCredentials('matched', 'mp', 'example\\.com');
      const callback = vi.fn();
      listener(authDetails('https://example.com/page'), callback);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        authCredentials: { username: 'matched', password: 'mp' },
      }));
    });

    it('should skip credentials whose URL pattern does not match', () => {
      const listener = captureAuthListener();
      // First cred only matches other.com, second matches any URL
      setAuthCredentials('wrong', 'wp', 'other\\.com');
      setAuthCredentials('right', 'rp', undefined, undefined, true);

      const callback = vi.fn();
      listener(authDetails('https://example.com/page'), callback);

      // Should skip 'wrong' (pattern doesn't match) and use 'right'
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        authCredentials: { username: 'right', password: 'rp' },
      }));
      // 'wrong' is still in queue (not consumed), 'right' was consumed
      expect(getAuthCredentials()).toHaveLength(1);
      expect(getAuthCredentials()[0].username).toBe('wrong');
    });

    it('should still match when URL pattern regex is invalid', () => {
      const listener = captureAuthListener();
      // Invalid regex — the catch block allows matching anyway
      setAuthCredentials('user', 'pass', '[invalid(');
      const callback = vi.fn();
      listener(authDetails('https://example.com'), callback);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        authCredentials: { username: 'user', password: 'pass' },
      }));
    });
  });

  // =========================================================================
  // Filter State
  // =========================================================================

  describe('Filter State', () => {
    it('should start with all filters disabled', () => {
      const state = getFilterState();
      expect(state.images).toBe(false);
      expect(state.flash).toBe(false);
      expect(state.popups).toBe(false);
    });

    it('should enable image filter', async () => {
      await setFilter('IMAGES', 'ON');
      expect(getFilterState().images).toBe(true);
      expect(mockUpdateDynamicRules).toHaveBeenCalled();
    });

    it('should disable image filter', async () => {
      await setFilter('IMAGES', 'ON');
      await setFilter('IMAGES', 'OFF');
      expect(getFilterState().images).toBe(false);
    });

    it('should enable flash filter', async () => {
      await setFilter('FLASH', 'ON');
      expect(getFilterState().flash).toBe(true);
      expect(mockUpdateDynamicRules).toHaveBeenCalled();
    });

    it('should handle popup filter without calling declarativeNetRequest', async () => {
      mockUpdateDynamicRules.mockClear();
      await setFilter('POPUPS', 'ON');
      expect(getFilterState().popups).toBe(true);
      // POPUPS returns early before updateFilterRules, so no new calls
      expect(mockUpdateDynamicRules).not.toHaveBeenCalled();
    });

    it('should disable all filters', async () => {
      await setFilter('IMAGES', 'ON');
      await setFilter('FLASH', 'ON');
      await setFilter('POPUPS', 'ON');
      await disableAllFilters();
      const state = getFilterState();
      expect(state.images).toBe(false);
      expect(state.flash).toBe(false);
      expect(state.popups).toBe(false);
    });

    it('should return a copy of filter state (not a reference)', () => {
      const state1 = getFilterState();
      const state2 = getFilterState();
      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });

    it('should enable both image and flash filters simultaneously', async () => {
      await setFilter('IMAGES', 'ON');
      await setFilter('FLASH', 'ON');
      expect(getFilterState().images).toBe(true);
      expect(getFilterState().flash).toBe(true);
    });
  });

  // =========================================================================
  // Filter Rules Content Verification
  // =========================================================================

  describe('Filter Rules Content', () => {
    it('should add image block rule with correct structure', async () => {
      await setFilter('IMAGES', 'ON');
      const calls = mockUpdateDynamicRules.mock.calls;
      const lastCall = calls[calls.length - 1][0];
      const addedRules = lastCall.addRules || [];
      const imageRule = addedRules.find((r: any) => r.id === 1000);
      expect(imageRule).toBeDefined();
      expect(imageRule.priority).toBe(1);
      expect(imageRule.action.type).toBe('block');
      expect(imageRule.condition.resourceTypes).toEqual(['image']);
    });

    it('should remove image rule ID when disabling images', async () => {
      await setFilter('IMAGES', 'ON');
      mockUpdateDynamicRules.mockClear();
      await setFilter('IMAGES', 'OFF');
      const lastCall = mockUpdateDynamicRules.mock.calls[mockUpdateDynamicRules.mock.calls.length - 1][0];
      expect(lastCall.removeRuleIds).toContain(1000);
    });

    it('should add media and object block rules for flash filter', async () => {
      await setFilter('FLASH', 'ON');
      const calls = mockUpdateDynamicRules.mock.calls;
      const lastCall = calls[calls.length - 1][0];
      const addedRules = lastCall.addRules || [];
      const mediaRule = addedRules.find((r: any) => r.id === 2001);
      const objectRule = addedRules.find((r: any) => r.id === 2002);
      expect(mediaRule).toBeDefined();
      expect(mediaRule.condition.resourceTypes).toEqual(['media']);
      expect(objectRule).toBeDefined();
      expect(objectRule.condition.resourceTypes).toEqual(['object']);
    });

    it('should remove media and object rule IDs when disabling flash', async () => {
      await setFilter('FLASH', 'ON');
      mockUpdateDynamicRules.mockClear();
      await setFilter('FLASH', 'OFF');
      const lastCall = mockUpdateDynamicRules.mock.calls[mockUpdateDynamicRules.mock.calls.length - 1][0];
      expect(lastCall.removeRuleIds).toContain(2001);
      expect(lastCall.removeRuleIds).toContain(2002);
    });

    it('should propagate error when updateDynamicRules fails', async () => {
      mockUpdateDynamicRules.mockRejectedValueOnce(new Error('Rule update failed'));
      await expect(setFilter('IMAGES', 'ON')).rejects.toThrow('Rule update failed');
    });
  });

  // =========================================================================
  // Init Filter Rules
  // =========================================================================

  describe('initFilterRules', () => {
    it('should clear existing dynamic rules on init', async () => {
      mockGetDynamicRules.mockResolvedValue([
        { id: 1000 },
        { id: 2001 },
      ]);
      await initFilterRules();
      expect(mockUpdateDynamicRules).toHaveBeenCalledWith({
        removeRuleIds: [1000, 2001],
      });
    });

    it('should not call updateDynamicRules when no existing rules match', async () => {
      mockGetDynamicRules.mockResolvedValue([]);
      mockUpdateDynamicRules.mockClear();
      await initFilterRules();
      expect(mockUpdateDynamicRules).not.toHaveBeenCalled();
    });

    it('should only remove our rule IDs, not foreign ones', async () => {
      mockGetDynamicRules.mockResolvedValue([
        { id: 1000 },
        { id: 9999 }, // foreign rule
      ]);
      await initFilterRules();
      expect(mockUpdateDynamicRules).toHaveBeenCalledWith({
        removeRuleIds: [1000],
      });
    });

    it('should handle API unavailability gracefully', async () => {
      const original = chrome.declarativeNetRequest;
      (chrome as any).declarativeNetRequest = undefined;
      await expect(initFilterRules()).resolves.toBeUndefined();
      (chrome as any).declarativeNetRequest = original;
    });

    it('should handle getDynamicRules error gracefully', async () => {
      mockGetDynamicRules.mockRejectedValueOnce(new Error('API error'));
      // Should not throw — caught internally
      await expect(initFilterRules()).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // Init Auth Handler
  // =========================================================================

  describe('initAuthHandler', () => {
    it('should register onAuthRequired listener with asyncBlocking', () => {
      initAuthHandler();
      expect(mockAddListener).toHaveBeenCalledWith(
        expect.any(Function),
        { urls: ['<all_urls>'] },
        ['asyncBlocking'],
      );
    });

    it('should not throw when webRequest API is unavailable', () => {
      const original = chrome.webRequest;
      (chrome as any).webRequest = undefined;
      expect(() => initAuthHandler()).not.toThrow();
      (chrome as any).webRequest = original;
    });

    it('should not throw when onAuthRequired is unavailable', () => {
      const original = chrome.webRequest.onAuthRequired;
      (chrome as any).webRequest.onAuthRequired = undefined;
      expect(() => initAuthHandler()).not.toThrow();
      (chrome as any).webRequest.onAuthRequired = original;
    });
  });

  // =========================================================================
  // handleLoginConfig
  // =========================================================================

  describe('handleLoginConfig', () => {
    it('should set credentials when active', () => {
      const result = handleLoginConfig({
        config: { user: 'testuser', password: 'testpass', active: true },
      });
      expect(result.success).toBe(true);
      expect(getAuthCredentials()).toHaveLength(1);
      expect(getAuthCredentials()[0].username).toBe('testuser');
    });

    it('should clear credentials when not active', () => {
      setAuthCredentials('old', 'pass');
      const result = handleLoginConfig({
        config: { user: '', password: '', active: false },
      });
      expect(result.success).toBe(true);
      expect(getAuthCredentials()).toHaveLength(0);
    });

    it('should append credentials when append=true', () => {
      setAuthCredentials('user1', 'pass1');
      handleLoginConfig({
        config: { user: 'user2', password: 'pass2', active: true },
        append: true,
      });
      expect(getAuthCredentials()).toHaveLength(2);
    });

    it('should replace credentials when append=false', () => {
      setAuthCredentials('user1', 'pass1');
      handleLoginConfig({
        config: { user: 'user2', password: 'pass2', active: true },
        append: false,
      });
      expect(getAuthCredentials()).toHaveLength(1);
      expect(getAuthCredentials()[0].username).toBe('user2');
    });

    it('should default append to false when not provided', () => {
      setAuthCredentials('user1', 'pass1');
      handleLoginConfig({
        config: { user: 'user2', password: 'pass2', active: true },
      });
      expect(getAuthCredentials()).toHaveLength(1);
    });

    it('should pass timeout to setAuthCredentials', () => {
      handleLoginConfig({
        config: { user: 'u', password: 'p', active: true, timeout: 45 },
      });
      expect(getAuthCredentials()).toHaveLength(1);
    });
  });

  // =========================================================================
  // handleSetFilter
  // =========================================================================

  describe('handleSetFilter', () => {
    it('should enable image filter', async () => {
      const result = await handleSetFilter({ filterType: 'IMAGES', status: 'ON' });
      expect(result.success).toBe(true);
      expect(getFilterState().images).toBe(true);
    });

    it('should disable flash filter', async () => {
      await setFilter('FLASH', 'ON');
      const result = await handleSetFilter({ filterType: 'FLASH', status: 'OFF' });
      expect(result.success).toBe(true);
      expect(getFilterState().flash).toBe(false);
    });

    it('should enable popup filter', async () => {
      const result = await handleSetFilter({ filterType: 'POPUPS', status: 'ON' });
      expect(result.success).toBe(true);
      expect(getFilterState().popups).toBe(true);
    });

    it('should return error when updateDynamicRules fails', async () => {
      mockUpdateDynamicRules.mockRejectedValueOnce(new Error('Network error'));
      const result = await handleSetFilter({ filterType: 'IMAGES', status: 'ON' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  // =========================================================================
  // handleSetPopupAllowed
  // =========================================================================

  describe('handleSetPopupAllowed', () => {
    it('should save current setting and allow popups', async () => {
      mockContentSettingsPopupsGet.mockImplementation((_details: any, callback: Function) => {
        callback({ setting: 'block' });
      });
      mockContentSettingsPopupsSet.mockImplementation((_details: any, callback: Function) => {
        callback();
      });

      const result = await handleSetPopupAllowed('https://example.com/*');
      expect(result.success).toBe(true);
      expect(mockContentSettingsPopupsGet).toHaveBeenCalledWith(
        { primaryUrl: 'https://example.com/' },
        expect.any(Function),
      );
      expect(mockContentSettingsPopupsSet).toHaveBeenCalledWith(
        { primaryPattern: 'https://example.com/*', setting: 'allow' },
        expect.any(Function),
      );
    });

    it('should not re-save setting for same pattern on second call', async () => {
      mockContentSettingsPopupsGet.mockImplementation((_details: any, callback: Function) => {
        callback({ setting: 'block' });
      });
      mockContentSettingsPopupsSet.mockImplementation((_details: any, callback: Function) => {
        callback();
      });

      await handleSetPopupAllowed('https://same.com/*');
      mockContentSettingsPopupsGet.mockClear();
      await handleSetPopupAllowed('https://same.com/*');
      // Should NOT call get again for the same pattern
      expect(mockContentSettingsPopupsGet).not.toHaveBeenCalled();
    });

    it('should handle null setting from popups.get', async () => {
      mockContentSettingsPopupsGet.mockImplementation((_details: any, callback: Function) => {
        callback({ setting: null });
      });
      mockContentSettingsPopupsSet.mockImplementation((_details: any, callback: Function) => {
        callback();
      });

      const result = await handleSetPopupAllowed('https://null-setting.com/*');
      expect(result.success).toBe(true);
    });

    it('should handle chrome.runtime.lastError on get', async () => {
      mockContentSettingsPopupsGet.mockImplementation((_details: any, callback: Function) => {
        chrome.runtime.lastError = { message: 'Permission denied' };
        callback({});
        chrome.runtime.lastError = null;
      });
      mockContentSettingsPopupsSet.mockImplementation((_details: any, callback: Function) => {
        callback();
      });

      const result = await handleSetPopupAllowed('https://error-get.com/*');
      // Should still succeed — get error is non-fatal (saves null)
      expect(result.success).toBe(true);
    });

    it('should return error on chrome.runtime.lastError during set', async () => {
      mockContentSettingsPopupsGet.mockImplementation((_details: any, callback: Function) => {
        callback({ setting: 'block' });
      });
      mockContentSettingsPopupsSet.mockImplementation((_details: any, callback: Function) => {
        chrome.runtime.lastError = { message: 'Set failed' };
        callback();
        chrome.runtime.lastError = null;
      });

      const result = await handleSetPopupAllowed('https://error-set.com/*');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Set failed');
    });

    it('should return error when contentSettings API is not available', async () => {
      const original = chrome.contentSettings;
      (chrome as any).contentSettings = null;
      const result = await handleSetPopupAllowed('https://example.com/*');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
      (chrome as any).contentSettings = original;
    });

    it('should return error when popups sub-API is missing', async () => {
      const original = chrome.contentSettings;
      (chrome as any).contentSettings = {};
      const result = await handleSetPopupAllowed('https://example.com/*');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
      (chrome as any).contentSettings = original;
    });
  });

  // =========================================================================
  // handleRestorePopupSettings
  // =========================================================================

  describe('handleRestorePopupSettings', () => {
    it('should succeed with no saved settings', async () => {
      const result = await handleRestorePopupSettings();
      expect(result.success).toBe(true);
    });

    it('should restore original block setting after allowing popups', async () => {
      // Set up: save 'block' then allow
      mockContentSettingsPopupsGet.mockImplementation((_details: any, callback: Function) => {
        callback({ setting: 'block' });
      });
      mockContentSettingsPopupsSet.mockImplementation((_details: any, callback: Function) => {
        callback();
      });
      await handleSetPopupAllowed('https://restore-test.com/*');

      // Now restore
      const result = await handleRestorePopupSettings();
      expect(result.success).toBe(true);
      expect(mockContentSettingsPopupsSet).toHaveBeenCalledWith(
        { primaryPattern: 'https://restore-test.com/*', setting: 'block' },
        expect.any(Function),
      );
    });

    it('should clear override when original setting was null', async () => {
      mockContentSettingsPopupsGet.mockImplementation((_details: any, callback: Function) => {
        callback({});
      });
      mockContentSettingsPopupsSet.mockImplementation((_details: any, callback: Function) => {
        callback();
      });
      await handleSetPopupAllowed('https://null-restore.com/*');

      mockContentSettingsPopupsClear.mockImplementation((_details: any, callback: Function) => {
        callback();
      });

      const result = await handleRestorePopupSettings();
      expect(result.success).toBe(true);
      expect(mockContentSettingsPopupsClear).toHaveBeenCalled();
    });

    it('should succeed when contentSettings API is unavailable during restore', async () => {
      // First set a popup allowed to create saved state
      mockContentSettingsPopupsGet.mockImplementation((_details: any, callback: Function) => {
        callback({ setting: 'block' });
      });
      mockContentSettingsPopupsSet.mockImplementation((_details: any, callback: Function) => {
        callback();
      });
      await handleSetPopupAllowed('https://unavail-restore.com/*');

      // Remove API
      const original = chrome.contentSettings;
      (chrome as any).contentSettings = null;
      const result = await handleRestorePopupSettings();
      expect(result.success).toBe(true);
      (chrome as any).contentSettings = original;
    });

    it('should handle error during restore of individual pattern gracefully', async () => {
      mockContentSettingsPopupsGet.mockImplementation((_details: any, callback: Function) => {
        callback({ setting: 'allow' });
      });
      mockContentSettingsPopupsSet.mockImplementation((_details: any, callback: Function) => {
        callback();
      });
      await handleSetPopupAllowed('https://fail-restore.com/*');

      // Make set fail during restore
      mockContentSettingsPopupsSet.mockImplementation((_details: any, callback: Function) => {
        chrome.runtime.lastError = { message: 'Restore failed' };
        callback();
        chrome.runtime.lastError = null;
      });

      // Should still succeed overall (individual errors are warned, not thrown)
      const result = await handleRestorePopupSettings();
      expect(result.success).toBe(true);
    });
  });

  // =========================================================================
  // handleSetProxy
  // =========================================================================

  describe('handleSetProxy', () => {
    beforeEach(() => {
      mockProxySettingsSet.mockImplementation((_details: any, callback: Function) => {
        callback();
      });
    });

    it('should set direct proxy mode', async () => {
      const result = await handleSetProxy({ proxyType: 'direct' });
      expect(result.success).toBe(true);
      expect(mockProxySettingsSet).toHaveBeenCalledWith(
        { value: { mode: 'direct' } },
        expect.any(Function),
      );
    });

    it('should set system proxy mode', async () => {
      const result = await handleSetProxy({ proxyType: 'system' });
      expect(result.success).toBe(true);
      expect(mockProxySettingsSet).toHaveBeenCalledWith(
        { value: { mode: 'system' } },
        expect.any(Function),
      );
    });

    it('should set HTTP proxy with host and port', async () => {
      const result = await handleSetProxy({
        proxyType: 'http',
        host: 'proxy.example.com',
        port: 8080,
      });
      expect(result.success).toBe(true);
      expect(mockProxySettingsSet).toHaveBeenCalledWith(
        {
          value: {
            mode: 'fixed_servers',
            rules: {
              singleProxy: { scheme: 'http', host: 'proxy.example.com', port: 8080 },
            },
          },
        },
        expect.any(Function),
      );
    });

    it('should set HTTPS proxy', async () => {
      const result = await handleSetProxy({
        proxyType: 'https',
        host: 'secure-proxy.example.com',
        port: 443,
      });
      expect(result.success).toBe(true);
      expect(mockProxySettingsSet).toHaveBeenCalledWith(
        {
          value: {
            mode: 'fixed_servers',
            rules: {
              singleProxy: { scheme: 'https', host: 'secure-proxy.example.com', port: 443 },
            },
          },
        },
        expect.any(Function),
      );
    });

    it('should set SOCKS4 proxy', async () => {
      const result = await handleSetProxy({
        proxyType: 'socks4',
        host: 'socks4.example.com',
        port: 1080,
      });
      expect(result.success).toBe(true);
      expect(mockProxySettingsSet).toHaveBeenCalledWith(
        {
          value: {
            mode: 'fixed_servers',
            rules: {
              singleProxy: { scheme: 'socks4', host: 'socks4.example.com', port: 1080 },
            },
          },
        },
        expect.any(Function),
      );
    });

    it('should set SOCKS5 proxy', async () => {
      const result = await handleSetProxy({
        proxyType: 'socks5',
        host: 'socks5.example.com',
        port: 1080,
      });
      expect(result.success).toBe(true);
      expect(mockProxySettingsSet).toHaveBeenCalledWith(
        {
          value: {
            mode: 'fixed_servers',
            rules: {
              singleProxy: { scheme: 'socks5', host: 'socks5.example.com', port: 1080 },
            },
          },
        },
        expect.any(Function),
      );
    });

    it('should set per-protocol proxy for HTTP only', async () => {
      const result = await handleSetProxy({
        proxyType: 'http',
        host: 'proxy.example.com',
        port: 8080,
        protocol: 'http',
      });
      expect(result.success).toBe(true);
      expect(mockProxySettingsSet).toHaveBeenCalledWith(
        {
          value: {
            mode: 'fixed_servers',
            rules: {
              proxyForHttp: { scheme: 'http', host: 'proxy.example.com', port: 8080 },
            },
          },
        },
        expect.any(Function),
      );
    });

    it('should set per-protocol proxy for HTTPS only', async () => {
      const result = await handleSetProxy({
        proxyType: 'http',
        host: 'proxy.example.com',
        port: 8080,
        protocol: 'https',
      });
      expect(result.success).toBe(true);
      expect(mockProxySettingsSet).toHaveBeenCalledWith(
        {
          value: {
            mode: 'fixed_servers',
            rules: {
              proxyForHttps: { scheme: 'http', host: 'proxy.example.com', port: 8080 },
            },
          },
        },
        expect.any(Function),
      );
    });

    it('should set proxy with bypass list', async () => {
      const result = await handleSetProxy({
        proxyType: 'http',
        host: 'proxy.example.com',
        port: 8080,
        bypass: ['localhost', '127.0.0.1', '*.local'],
      });
      expect(result.success).toBe(true);
      expect(mockProxySettingsSet).toHaveBeenCalledWith(
        {
          value: {
            mode: 'fixed_servers',
            rules: {
              singleProxy: { scheme: 'http', host: 'proxy.example.com', port: 8080 },
              bypassList: ['localhost', '127.0.0.1', '*.local'],
            },
          },
        },
        expect.any(Function),
      );
    });

    it('should not include bypass list when empty', async () => {
      const result = await handleSetProxy({
        proxyType: 'http',
        host: 'proxy.example.com',
        port: 8080,
        bypass: [],
      });
      expect(result.success).toBe(true);
      const setArg = mockProxySettingsSet.mock.calls[0][0];
      expect(setArg.value.rules.bypassList).toBeUndefined();
    });

    it('should default host to empty string when not provided', async () => {
      const result = await handleSetProxy({ proxyType: 'http', port: 8080 });
      expect(result.success).toBe(true);
      const setArg = mockProxySettingsSet.mock.calls[0][0];
      expect(setArg.value.rules.singleProxy.host).toBe('');
    });

    it('should backup proxy settings when backupFirst=true', async () => {
      mockProxySettingsGet.mockImplementation((_details: any, callback: Function) => {
        callback({ value: { mode: 'system' } });
      });

      const result = await handleSetProxy({
        proxyType: 'direct',
        backupFirst: true,
      });
      expect(result.success).toBe(true);
      expect(mockProxySettingsGet).toHaveBeenCalled();
    });

    it('should not backup when backupFirst is false', async () => {
      const result = await handleSetProxy({
        proxyType: 'direct',
        backupFirst: false,
      });
      expect(result.success).toBe(true);
      expect(mockProxySettingsGet).not.toHaveBeenCalled();
    });

    it('should return error on chrome.runtime.lastError during set', async () => {
      mockProxySettingsSet.mockImplementation((_details: any, callback: Function) => {
        chrome.runtime.lastError = { message: 'Proxy set failed' };
        callback();
        chrome.runtime.lastError = null;
      });

      const result = await handleSetProxy({ proxyType: 'direct' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Proxy set failed');
    });

    it('should succeed when proxy API is unavailable', async () => {
      const original = chrome.proxy;
      (chrome as any).proxy = undefined;
      const result = await handleSetProxy({ proxyType: 'direct' });
      expect(result.success).toBe(true);
      (chrome as any).proxy = original;
    });
  });

  // =========================================================================
  // handleRestoreProxy
  // =========================================================================

  describe('handleRestoreProxy', () => {
    it('should clear to defaults when no backup exists', async () => {
      mockProxySettingsClear.mockImplementation((_details: any, callback: Function) => {
        callback();
      });

      const result = await handleRestoreProxy();
      expect(result.success).toBe(true);
      expect(mockProxySettingsClear).toHaveBeenCalled();
    });

    it('should restore backed up settings', async () => {
      mockProxySettingsGet.mockImplementation((_details: any, callback: Function) => {
        callback({ value: { mode: 'system' } });
      });
      mockProxySettingsSet.mockImplementation((_details: any, callback: Function) => {
        callback();
      });

      await handleSetProxy({ proxyType: 'direct', backupFirst: true });

      const result = await handleRestoreProxy();
      expect(result.success).toBe(true);
      expect(mockProxySettingsSet).toHaveBeenLastCalledWith(
        { value: { mode: 'system' } },
        expect.any(Function),
      );
    });

    it('should restore complex fixed_servers config', async () => {
      const complexConfig = {
        mode: 'fixed_servers',
        rules: {
          singleProxy: { scheme: 'http', host: 'old-proxy.com', port: 3128 },
          bypassList: ['localhost'],
        },
      };
      mockProxySettingsGet.mockImplementation((_details: any, callback: Function) => {
        callback({ value: complexConfig });
      });
      mockProxySettingsSet.mockImplementation((_details: any, callback: Function) => {
        callback();
      });

      await handleSetProxy({ proxyType: 'direct', backupFirst: true });

      const result = await handleRestoreProxy();
      expect(result.success).toBe(true);
      expect(mockProxySettingsSet).toHaveBeenLastCalledWith(
        { value: complexConfig },
        expect.any(Function),
      );
    });

    it('should null out savedProxyConfig after restore', async () => {
      mockProxySettingsGet.mockImplementation((_details: any, callback: Function) => {
        callback({ value: { mode: 'system' } });
      });
      mockProxySettingsSet.mockImplementation((_details: any, callback: Function) => {
        callback();
      });

      await handleSetProxy({ proxyType: 'direct', backupFirst: true });
      await handleRestoreProxy();

      // Second restore should clear (no backup)
      mockProxySettingsClear.mockImplementation((_details: any, callback: Function) => {
        callback();
      });
      const result = await handleRestoreProxy();
      expect(result.success).toBe(true);
      expect(mockProxySettingsClear).toHaveBeenCalled();
    });

    it('should return error on chrome.runtime.lastError during restore set', async () => {
      mockProxySettingsGet.mockImplementation((_details: any, callback: Function) => {
        callback({ value: { mode: 'system' } });
      });
      mockProxySettingsSet.mockImplementation((_details: any, callback: Function) => {
        callback();
      });
      await handleSetProxy({ proxyType: 'direct', backupFirst: true });

      // Make restore set fail
      mockProxySettingsSet.mockImplementation((_details: any, callback: Function) => {
        chrome.runtime.lastError = { message: 'Restore set failed' };
        callback();
        chrome.runtime.lastError = null;
      });

      const result = await handleRestoreProxy();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Restore set failed');
    });

    it('should return error on chrome.runtime.lastError during clear', async () => {
      mockProxySettingsClear.mockImplementation((_details: any, callback: Function) => {
        chrome.runtime.lastError = { message: 'Clear failed' };
        callback();
        chrome.runtime.lastError = null;
      });

      const result = await handleRestoreProxy();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Clear failed');
    });

    it('should succeed when proxy API is unavailable', async () => {
      const original = chrome.proxy;
      (chrome as any).proxy = undefined;
      const result = await handleRestoreProxy();
      expect(result.success).toBe(true);
      (chrome as any).proxy = original;
    });
  });

  // =========================================================================
  // initWebRequestHandlers
  // =========================================================================

  describe('initWebRequestHandlers', () => {
    it('should initialize auth handler and filter rules', async () => {
      await initWebRequestHandlers();
      expect(mockAddListener).toHaveBeenCalled();
      expect(mockGetDynamicRules).toHaveBeenCalled();
    });
  });
});
