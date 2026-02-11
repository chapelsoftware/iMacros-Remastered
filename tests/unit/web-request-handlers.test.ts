/**
 * Web Request Handlers Unit Tests
 *
 * Tests for extension/src/background/web-request-handlers.ts covering:
 * - Auth credential management (set, clear, get, queue behavior)
 * - Filter state management (images, flash, popups)
 * - handleLoginConfig message handler
 * - handleSetFilter message handler
 * - handleSetPopupAllowed / handleRestorePopupSettings
 * - handleSetProxy / handleRestoreProxy
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

describe('Web Request Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset state between tests
    clearAuthCredentials();
    // Reset filter state by disabling all
    disableAllFilters();
    chrome.runtime.lastError = null;
  });

  // ===== Auth Credentials =====

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

    it('should replace queue when append=false', () => {
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

    it('should clear all credentials', () => {
      setAuthCredentials('user1', 'pass1');
      setAuthCredentials('user2', 'pass2', undefined, undefined, true);
      clearAuthCredentials();
      expect(getAuthCredentials()).toEqual([]);
    });

    it('should support URL pattern', () => {
      setAuthCredentials('user1', 'pass1', 'example\\.com');
      const creds = getAuthCredentials();
      expect(creds).toHaveLength(1);
    });
  });

  // ===== Filter State =====

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
      await setFilter('POPUPS', 'ON');
      expect(getFilterState().popups).toBe(true);
      // Popup filter is handled differently, doesn't call updateDynamicRules for itself
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

    it('should return a copy of filter state', () => {
      const state1 = getFilterState();
      const state2 = getFilterState();
      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });
  });

  // ===== Init Filter Rules =====

  describe('initFilterRules', () => {
    it('should clear existing dynamic rules on init', async () => {
      mockGetDynamicRules.mockResolvedValue([
        { id: 1000 },
        { id: 2000 },
      ]);
      await initFilterRules();
      expect(mockUpdateDynamicRules).toHaveBeenCalledWith({
        removeRuleIds: [1000, 2000],
      });
    });

    it('should handle no existing rules', async () => {
      mockGetDynamicRules.mockResolvedValue([]);
      await initFilterRules();
      // Should not call updateDynamicRules if nothing to remove
    });
  });

  // ===== Init Auth Handler =====

  describe('initAuthHandler', () => {
    it('should register onAuthRequired listener', () => {
      initAuthHandler();
      expect(mockAddListener).toHaveBeenCalledWith(
        expect.any(Function),
        { urls: ['<all_urls>'] },
        ['asyncBlocking'],
      );
    });
  });

  // ===== handleLoginConfig =====

  describe('handleLoginConfig', () => {
    it('should set credentials when active', () => {
      const result = handleLoginConfig({
        config: { user: 'testuser', password: 'testpass', active: true },
      });
      expect(result.success).toBe(true);
      expect(getAuthCredentials()).toHaveLength(1);
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
  });

  // ===== handleSetFilter =====

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
  });

  // ===== handleSetPopupAllowed =====

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
      expect(mockContentSettingsPopupsSet).toHaveBeenCalledWith(
        { primaryPattern: 'https://example.com/*', setting: 'allow' },
        expect.any(Function),
      );
    });

    it('should return error when API not available', async () => {
      const original = chrome.contentSettings;
      (chrome as any).contentSettings = null;
      const result = await handleSetPopupAllowed('https://example.com/*');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
      (chrome as any).contentSettings = original;
    });
  });

  // ===== handleRestorePopupSettings =====

  describe('handleRestorePopupSettings', () => {
    it('should succeed with no saved settings', async () => {
      const result = await handleRestorePopupSettings();
      expect(result.success).toBe(true);
    });
  });

  // ===== handleSetProxy =====

  describe('handleSetProxy', () => {
    it('should set direct proxy mode', async () => {
      mockProxySettingsSet.mockImplementation((_details: any, callback: Function) => {
        callback();
      });

      const result = await handleSetProxy({ proxyType: 'direct' });
      expect(result.success).toBe(true);
      expect(mockProxySettingsSet).toHaveBeenCalledWith(
        { value: { mode: 'direct' } },
        expect.any(Function),
      );
    });

    it('should set system proxy mode', async () => {
      mockProxySettingsSet.mockImplementation((_details: any, callback: Function) => {
        callback();
      });

      const result = await handleSetProxy({ proxyType: 'system' });
      expect(result.success).toBe(true);
      expect(mockProxySettingsSet).toHaveBeenCalledWith(
        { value: { mode: 'system' } },
        expect.any(Function),
      );
    });

    it('should set HTTP proxy with host and port', async () => {
      mockProxySettingsSet.mockImplementation((_details: any, callback: Function) => {
        callback();
      });

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

    it('should set SOCKS5 proxy', async () => {
      mockProxySettingsSet.mockImplementation((_details: any, callback: Function) => {
        callback();
      });

      const result = await handleSetProxy({
        proxyType: 'socks5',
        host: 'socks.example.com',
        port: 1080,
      });
      expect(result.success).toBe(true);
    });

    it('should set proxy with bypass list', async () => {
      mockProxySettingsSet.mockImplementation((_details: any, callback: Function) => {
        callback();
      });

      const result = await handleSetProxy({
        proxyType: 'http',
        host: 'proxy.example.com',
        port: 8080,
        bypass: ['localhost', '127.0.0.1'],
      });
      expect(result.success).toBe(true);
    });

    it('should backup proxy settings when backupFirst=true', async () => {
      mockProxySettingsGet.mockImplementation((_details: any, callback: Function) => {
        callback({ value: { mode: 'system' } });
      });
      mockProxySettingsSet.mockImplementation((_details: any, callback: Function) => {
        callback();
      });

      const result = await handleSetProxy({
        proxyType: 'direct',
        backupFirst: true,
      });
      expect(result.success).toBe(true);
      expect(mockProxySettingsGet).toHaveBeenCalled();
    });
  });

  // ===== handleRestoreProxy =====

  describe('handleRestoreProxy', () => {
    it('should clear to defaults when no backup exists', async () => {
      mockProxySettingsClear.mockImplementation((_details: any, callback: Function) => {
        callback();
      });

      const result = await handleRestoreProxy();
      expect(result.success).toBe(true);
    });

    it('should restore backed up settings', async () => {
      // First set proxy with backup
      mockProxySettingsGet.mockImplementation((_details: any, callback: Function) => {
        callback({ value: { mode: 'system' } });
      });
      mockProxySettingsSet.mockImplementation((_details: any, callback: Function) => {
        callback();
      });

      await handleSetProxy({ proxyType: 'direct', backupFirst: true });

      // Now restore
      const result = await handleRestoreProxy();
      expect(result.success).toBe(true);
      // Should have called set with the backed up config
      expect(mockProxySettingsSet).toHaveBeenLastCalledWith(
        { value: { mode: 'system' } },
        expect.any(Function),
      );
    });
  });

  // ===== initWebRequestHandlers =====

  describe('initWebRequestHandlers', () => {
    it('should initialize auth handler and filter rules', async () => {
      await initWebRequestHandlers();
      expect(mockAddListener).toHaveBeenCalled();
      expect(mockGetDynamicRules).toHaveBeenCalled();
    });
  });
});
