/**
 * Unit tests for shared/src/commands/browser.ts
 *
 * Covers uncovered branches at lines 832, 849, 1108 plus comprehensive
 * coverage of all browser command handlers:
 *
 * - Line 832: proxyHandler __none__ with bridge failure
 * - Line 849: proxyHandler invalid address with non-direct/non-system type
 * - Line 1108: createBrowserCommandHandlers() function
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  clearHandler,
  filterHandler,
  proxyHandler,
  screenshotHandler,
  setBrowserCommandBridge,
  getBrowserCommandBridge,
  resetProxyBackupState,
  hasProxyBackup,
  resetPopupSettingsState,
  hasPopupModifications,
  markPopupSettingsModified,
  restoreProxySettings,
  restorePopupSettings,
  sendSetPopupAllowed,
  browserCommandHandlers,
  registerBrowserCommandHandlers,
  createBrowserCommandHandlers,
} from '../../../shared/src/commands/browser';
import { IMACROS_ERROR_CODES } from '../../../shared/src/executor';

// ===== Test Helpers =====

function createMockContext(
  params: Record<string, string> = {},
  vars: Map<string, any> = new Map(),
): any {
  const mockLogs: Array<{ level: string; message: string }> = [];
  return {
    command: {
      type: 'TEST',
      parameters: Object.entries(params).map(([key, value]) => ({
        key: key.toUpperCase(),
        value,
        rawValue: value,
        variables: [],
      })),
      raw: 'TEST',
      lineNumber: 1,
      variables: [],
    },
    variables: {
      get: (name: string) => vars.get(name.toUpperCase()) ?? null,
      set: (name: string, value: any) => {
        vars.set(name.toUpperCase(), value);
        return { success: true, previousValue: null, newValue: value };
      },
      expand: (t: string) => ({ expanded: t, variables: [] }),
    },
    state: {
      setVariable: (name: string, value: any) => vars.set(name.toUpperCase(), value),
      getVariable: (name: string) => vars.get(name.toUpperCase()) ?? null,
    },
    getParam: (key: string) => {
      const upperKey = key.toUpperCase();
      const entry = Object.entries(params).find(([k]) => k.toUpperCase() === upperKey);
      return entry ? entry[1] : undefined;
    },
    getRequiredParam: (key: string) => {
      const upperKey = key.toUpperCase();
      const entry = Object.entries(params).find(([k]) => k.toUpperCase() === upperKey);
      if (!entry) throw new Error(`Missing required parameter: ${key}`);
      return entry[1];
    },
    expand: (t: string) => t,
    log: (level: string, message: string) => mockLogs.push({ level, message }),
    _logs: mockLogs,
    _vars: vars,
  };
}

// ===== Setup =====

const mockBridge = {
  sendMessage: vi.fn(),
};

beforeEach(() => {
  mockBridge.sendMessage.mockReset();
  mockBridge.sendMessage.mockResolvedValue({ success: true });
  setBrowserCommandBridge(mockBridge);
  resetProxyBackupState();
  resetPopupSettingsState();
});

afterEach(() => {
  setBrowserCommandBridge(null as any);
});

// ===== Bridge get/set =====

describe('setBrowserCommandBridge / getBrowserCommandBridge', () => {
  it('should set and get the bridge', () => {
    const bridge = { sendMessage: vi.fn() };
    setBrowserCommandBridge(bridge);
    expect(getBrowserCommandBridge()).toBe(bridge);
  });

  it('should return null when bridge is cleared', () => {
    setBrowserCommandBridge(null as any);
    expect(getBrowserCommandBridge()).toBeNull();
  });
});

// ===== CLEAR handler =====

describe('clearHandler', () => {
  it('should clear cache and cookies by default (no params)', async () => {
    const ctx = createMockContext({});
    const result = await clearHandler(ctx);
    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'clearData',
        dataTypes: ['cache', 'cookies'],
      }),
    );
  });

  it('should clear COOKIES when specified', async () => {
    const ctx = createMockContext({ COOKIES: '' });
    const result = await clearHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ dataTypes: ['cookies'] }),
    );
  });

  it('should clear CACHE when specified', async () => {
    const ctx = createMockContext({ CACHE: '' });
    const result = await clearHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ dataTypes: ['cache'] }),
    );
  });

  it('should clear HISTORY when specified', async () => {
    const ctx = createMockContext({ HISTORY: '' });
    const result = await clearHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ dataTypes: ['history'] }),
    );
  });

  it('should clear FORMDATA when specified', async () => {
    const ctx = createMockContext({ FORMDATA: '' });
    const result = await clearHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ dataTypes: ['formData'] }),
    );
  });

  it('should clear FORMS (alias for formData)', async () => {
    const ctx = createMockContext({ FORMS: '' });
    const result = await clearHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ dataTypes: ['formData'] }),
    );
  });

  it('should clear PASSWORDS when specified', async () => {
    const ctx = createMockContext({ PASSWORDS: '' });
    const result = await clearHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ dataTypes: ['passwords'] }),
    );
  });

  it('should clear DOWNLOADS when specified', async () => {
    const ctx = createMockContext({ DOWNLOADS: '' });
    const result = await clearHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ dataTypes: ['downloads'] }),
    );
  });

  it('should clear LOCALSTORAGE when specified', async () => {
    const ctx = createMockContext({ LOCALSTORAGE: '' });
    const result = await clearHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ dataTypes: ['localStorage'] }),
    );
  });

  it('should clear SESSIONSTORAGE when specified', async () => {
    const ctx = createMockContext({ SESSIONSTORAGE: '' });
    const result = await clearHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ dataTypes: ['sessionStorage'] }),
    );
  });

  it('should clear INDEXEDDB when specified', async () => {
    const ctx = createMockContext({ INDEXEDDB: '' });
    const result = await clearHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ dataTypes: ['indexedDB'] }),
    );
  });

  it('should clear ALL when specified', async () => {
    const ctx = createMockContext({ ALL: '' });
    const result = await clearHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ dataTypes: ['all'] }),
    );
  });

  it('should default to cookies for unknown param', async () => {
    const ctx = createMockContext({ UNKNOWN_PARAM: '' });
    const result = await clearHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ dataTypes: ['cookies'] }),
    );
  });

  it('should return error when bridge fails', async () => {
    mockBridge.sendMessage.mockResolvedValue({ success: false, error: 'Clear failed' });
    const ctx = createMockContext({});
    const result = await clearHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toBe('Clear failed');
  });

  it('should use fallback error message when bridge fails without error text', async () => {
    mockBridge.sendMessage.mockResolvedValue({ success: false });
    const ctx = createMockContext({});
    const result = await clearHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('Failed to clear browser data');
  });

  it('should work without bridge (returns success)', async () => {
    setBrowserCommandBridge(null as any);
    const ctx = createMockContext({});
    const result = await clearHandler(ctx);
    expect(result.success).toBe(true);
  });
});

// ===== FILTER handler =====

describe('filterHandler', () => {
  it('should return MISSING_PARAMETER when TYPE is not provided', async () => {
    const ctx = createMockContext({});
    const result = await filterHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    expect(result.errorMessage).toContain('TYPE');
  });

  it('should return INVALID_PARAMETER for invalid TYPE', async () => {
    const ctx = createMockContext({ TYPE: 'INVALID' });
    const result = await filterHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    expect(result.errorMessage).toContain('INVALID');
  });

  it('should set IMAGES filter to ON by default', async () => {
    const ctx = createMockContext({ TYPE: 'IMAGES' });
    const result = await filterHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'setFilter',
        filterType: 'IMAGES',
        status: 'ON',
      }),
    );
  });

  it('should set IMAGES filter to OFF when STATUS=OFF', async () => {
    const ctx = createMockContext({ TYPE: 'IMAGES', STATUS: 'OFF' });
    const result = await filterHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        filterType: 'IMAGES',
        status: 'OFF',
      }),
    );
  });

  it('should set FLASH filter', async () => {
    const ctx = createMockContext({ TYPE: 'FLASH', STATUS: 'ON' });
    const result = await filterHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ filterType: 'FLASH', status: 'ON' }),
    );
  });

  it('should set POPUPS filter', async () => {
    const ctx = createMockContext({ TYPE: 'POPUPS', STATUS: 'ON' });
    const result = await filterHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ filterType: 'POPUPS', status: 'ON' }),
    );
  });

  it('should disable all filters for TYPE=NONE', async () => {
    const ctx = createMockContext({ TYPE: 'NONE' });
    const result = await filterHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledTimes(3);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ filterType: 'IMAGES', status: 'OFF' }),
    );
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ filterType: 'FLASH', status: 'OFF' }),
    );
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ filterType: 'POPUPS', status: 'OFF' }),
    );
  });

  it('should log warning when NONE sub-filter fails', async () => {
    mockBridge.sendMessage.mockResolvedValue({ success: false, error: 'fail' });
    const ctx = createMockContext({ TYPE: 'NONE' });
    const result = await filterHandler(ctx);
    // Still returns success even if individual filters fail
    expect(result.success).toBe(true);
    expect(ctx._logs.some((l: any) => l.level === 'warn' && l.message.includes('Failed to disable'))).toBe(true);
  });

  it('should return error when bridge fails for specific filter', async () => {
    mockBridge.sendMessage.mockResolvedValue({ success: false, error: 'Bridge error' });
    const ctx = createMockContext({ TYPE: 'FLASH', STATUS: 'ON' });
    const result = await filterHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toBe('Bridge error');
  });

  it('should use fallback error message when bridge returns no error text', async () => {
    mockBridge.sendMessage.mockResolvedValue({ success: false });
    const ctx = createMockContext({ TYPE: 'FLASH', STATUS: 'ON' });
    const result = await filterHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('Failed to set FLASH filter');
  });

  it('should skip IMAGES filter when !IMAGEFILTER is OFF', async () => {
    const vars = new Map<string, any>();
    vars.set('!IMAGEFILTER', 'OFF');
    const ctx = createMockContext({ TYPE: 'IMAGES', STATUS: 'ON' }, vars);
    const result = await filterHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).not.toHaveBeenCalled();
    expect(ctx._logs.some((l: any) => l.message.includes('skipped'))).toBe(true);
  });

  it('should skip IMAGES filter when !IMAGEFILTER is NO', async () => {
    const vars = new Map<string, any>();
    vars.set('!IMAGEFILTER', 'no');
    const ctx = createMockContext({ TYPE: 'IMAGES', STATUS: 'ON' }, vars);
    const result = await filterHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).not.toHaveBeenCalled();
  });

  it('should NOT skip IMAGES filter when !IMAGEFILTER is unset', async () => {
    const ctx = createMockContext({ TYPE: 'IMAGES', STATUS: 'ON' });
    const result = await filterHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalled();
  });

  it('should NOT skip IMAGES filter when !IMAGEFILTER is ON', async () => {
    const vars = new Map<string, any>();
    vars.set('!IMAGEFILTER', 'ON');
    const ctx = createMockContext({ TYPE: 'IMAGES', STATUS: 'ON' }, vars);
    const result = await filterHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalled();
  });
});

// ===== PROXY handler =====

describe('proxyHandler', () => {
  it('should return MISSING_PARAMETER when ADDRESS is not provided', async () => {
    const ctx = createMockContext({});
    const result = await proxyHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    expect(result.errorMessage).toContain('ADDRESS');
  });

  it('should set proxy with host:port format', async () => {
    const ctx = createMockContext({ ADDRESS: '192.168.1.1:8080' });
    const result = await proxyHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'setProxy',
        proxyType: 'http',
        host: '192.168.1.1',
        port: 8080,
      }),
    );
  });

  it('should set direct connection for empty ADDRESS', async () => {
    const ctx = createMockContext({ ADDRESS: '' });
    const result = await proxyHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ proxyType: 'direct' }),
    );
  });

  it('should restore browser defaults for __default__', async () => {
    const ctx = createMockContext({ ADDRESS: '__default__' });
    const result = await proxyHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'setProxy', proxyType: 'system' }),
    );
  });

  it('should return error when __default__ bridge call fails', async () => {
    mockBridge.sendMessage.mockResolvedValue({ success: false, error: 'Restore failed' });
    const ctx = createMockContext({ ADDRESS: '__default__' });
    const result = await proxyHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toBe('Restore failed');
  });

  it('should use fallback error for __default__ bridge failure without error text', async () => {
    mockBridge.sendMessage.mockResolvedValue({ success: false });
    const ctx = createMockContext({ ADDRESS: '__default__' });
    const result = await proxyHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('Failed to restore default proxy settings');
  });

  it('should disable proxy for __none__', async () => {
    const ctx = createMockContext({ ADDRESS: '__none__' });
    const result = await proxyHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'setProxy', proxyType: 'direct' }),
    );
  });

  // Line 832: __none__ with bridge failure
  it('should return error when __none__ bridge call fails (line 832)', async () => {
    mockBridge.sendMessage.mockResolvedValue({ success: false });
    const ctx = createMockContext({ ADDRESS: '__none__' });
    const result = await proxyHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toBe('Failed to disable proxy');
  });

  it('should return bridge error text for __none__ failure', async () => {
    mockBridge.sendMessage.mockResolvedValue({ success: false, error: 'Proxy disable error' });
    const ctx = createMockContext({ ADDRESS: '__none__' });
    const result = await proxyHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('Proxy disable error');
  });

  // Line 849: invalid address with non-direct/non-system type
  it('should return INVALID_PARAMETER for unparseable address with TYPE=HTTP (line 849)', async () => {
    const ctx = createMockContext({ ADDRESS: 'invalid:format:bad', TYPE: 'HTTP' });
    const result = await proxyHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    expect(result.errorMessage).toContain('server name or IP address');
  });

  it('should return INVALID_PARAMETER for unparseable address with TYPE=SOCKS5', async () => {
    const ctx = createMockContext({ ADDRESS: 'a:b:c', TYPE: 'SOCKS5' });
    const result = await proxyHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
  });

  it('should handle bypass list', async () => {
    const ctx = createMockContext({ ADDRESS: 'proxy:8080', BYPASS: 'localhost,127.0.0.1' });
    const result = await proxyHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        bypass: ['localhost', '127.0.0.1'],
        bypassAppend: true,
      }),
    );
  });

  it('should clear bypass list when BYPASS=null', async () => {
    const ctx = createMockContext({ ADDRESS: 'proxy:8080', BYPASS: 'null' });
    const result = await proxyHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        bypass: [],
        bypassAppend: false,
      }),
    );
  });

  it('should pass authentication credentials', async () => {
    const ctx = createMockContext({
      ADDRESS: 'proxy:8080',
      USER: 'admin',
      PASSWORD: 'secret',
    });
    const result = await proxyHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'admin',
        password: 'secret',
      }),
    );
  });

  it('should handle protocol-specific proxy (http=host:port)', async () => {
    const ctx = createMockContext({ ADDRESS: 'http=myproxy:9090' });
    const result = await proxyHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'myproxy',
        port: 9090,
        protocol: 'http',
      }),
    );
  });

  it('should handle protocol-specific proxy (https=host:port)', async () => {
    const ctx = createMockContext({ ADDRESS: 'https=secproxy:443' });
    const result = await proxyHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'secproxy',
        port: 443,
        protocol: 'https',
      }),
    );
  });

  it('should backup proxy settings on first use', async () => {
    const ctx = createMockContext({ ADDRESS: 'proxy:8080' });
    const result = await proxyHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ backupFirst: true }),
    );
  });

  it('should not backup on subsequent uses', async () => {
    const ctx1 = createMockContext({ ADDRESS: 'proxy:8080' });
    await proxyHandler(ctx1);

    const ctx2 = createMockContext({ ADDRESS: 'proxy:9090' });
    await proxyHandler(ctx2);
    expect(mockBridge.sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ backupFirst: false }),
    );
  });

  it('should set TYPE=SOCKS4', async () => {
    const ctx = createMockContext({ ADDRESS: 'proxy:1080', TYPE: 'SOCKS4' });
    const result = await proxyHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ proxyType: 'socks4' }),
    );
  });

  it('should set TYPE=SOCKS5', async () => {
    const ctx = createMockContext({ ADDRESS: 'proxy:1080', TYPE: 'SOCKS5' });
    const result = await proxyHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ proxyType: 'socks5' }),
    );
  });

  it('should set TYPE=DIRECT', async () => {
    const ctx = createMockContext({ ADDRESS: '', TYPE: 'DIRECT' });
    const result = await proxyHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ proxyType: 'direct' }),
    );
  });

  it('should set TYPE=SYSTEM', async () => {
    const ctx = createMockContext({ ADDRESS: '', TYPE: 'SYSTEM' });
    const result = await proxyHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ proxyType: 'system' }),
    );
  });

  it('should set TYPE=NONE as direct', async () => {
    const ctx = createMockContext({ ADDRESS: '', TYPE: 'NONE' });
    const result = await proxyHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ proxyType: 'direct' }),
    );
  });

  it('should set TYPE=HTTPS', async () => {
    const ctx = createMockContext({ ADDRESS: 'proxy:443', TYPE: 'HTTPS' });
    const result = await proxyHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ proxyType: 'https' }),
    );
  });

  it('should default unknown TYPE to http', async () => {
    const ctx = createMockContext({ ADDRESS: 'proxy:8080', TYPE: 'UNKNOWN' });
    const result = await proxyHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ proxyType: 'http' }),
    );
  });

  it('should return error when sendMessage fails for regular proxy', async () => {
    mockBridge.sendMessage.mockResolvedValue({ success: false, error: 'Proxy failed' });
    const ctx = createMockContext({ ADDRESS: 'proxy:8080' });
    const result = await proxyHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toBe('Proxy failed');
  });

  it('should use fallback error for regular proxy failure without error text', async () => {
    mockBridge.sendMessage.mockResolvedValue({ success: false });
    const ctx = createMockContext({ ADDRESS: 'proxy:8080' });
    const result = await proxyHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('Failed to set proxy');
  });

  it('should default to port 8080 for host-only address', async () => {
    const ctx = createMockContext({ ADDRESS: 'myproxy' });
    const result = await proxyHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'myproxy', port: 8080 }),
    );
  });

  it('should handle bridge exception gracefully', async () => {
    mockBridge.sendMessage.mockRejectedValue(new Error('Network error'));
    const ctx = createMockContext({ ADDRESS: 'proxy:8080' });
    const result = await proxyHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('Network error');
  });
});

// ===== SCREENSHOT handler =====

describe('screenshotHandler', () => {
  it('should return MISSING_PARAMETER when TYPE is missing', async () => {
    const ctx = createMockContext({ FILE: 'test.png' });
    const result = await screenshotHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    expect(result.errorMessage).toContain('TYPE');
  });

  it('should return INVALID_PARAMETER for invalid TYPE', async () => {
    const ctx = createMockContext({ TYPE: 'INVALID', FILE: 'test.png' });
    const result = await screenshotHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    expect(result.errorMessage).toContain('INVALID');
  });

  it('should return MISSING_PARAMETER when FILE is missing', async () => {
    const ctx = createMockContext({ TYPE: 'BROWSER' });
    const result = await screenshotHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    expect(result.errorMessage).toContain('FILE');
  });

  it('should capture BROWSER screenshot (png)', async () => {
    mockBridge.sendMessage.mockResolvedValue({
      success: true,
      data: { screenshotPath: '/tmp/test.png' },
    });
    const ctx = createMockContext({ TYPE: 'BROWSER', FILE: 'test.png' });
    const result = await screenshotHandler(ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBe('/tmp/test.png');
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'screenshot',
        captureType: 'BROWSER',
        format: 'png',
        file: 'test.png',
      }),
    );
  });

  it('should capture PAGE screenshot', async () => {
    const ctx = createMockContext({ TYPE: 'PAGE', FILE: 'page.png' });
    const result = await screenshotHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ captureType: 'PAGE' }),
    );
  });

  it('should use jpeg format for .jpg file', async () => {
    const ctx = createMockContext({ TYPE: 'BROWSER', FILE: 'test.jpg' });
    const result = await screenshotHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'jpeg', quality: 92 }),
    );
  });

  it('should use jpeg format for .jpeg file', async () => {
    const ctx = createMockContext({ TYPE: 'BROWSER', FILE: 'test.jpeg' });
    const result = await screenshotHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'jpeg', quality: 92 }),
    );
  });

  it('should set JPEG quality when provided', async () => {
    const ctx = createMockContext({ TYPE: 'BROWSER', FILE: 'test.jpg', QUALITY: '80' });
    const result = await screenshotHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ quality: 80 }),
    );
  });

  it('should return INVALID_PARAMETER for out-of-range QUALITY', async () => {
    const ctx = createMockContext({ TYPE: 'BROWSER', FILE: 'test.jpg', QUALITY: '150' });
    const result = await screenshotHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    expect(result.errorMessage).toContain('QUALITY');
  });

  it('should return INVALID_PARAMETER for non-numeric QUALITY', async () => {
    const ctx = createMockContext({ TYPE: 'BROWSER', FILE: 'test.jpg', QUALITY: 'abc' });
    const result = await screenshotHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
  });

  it('should return INVALID_PARAMETER for negative QUALITY', async () => {
    const ctx = createMockContext({ TYPE: 'BROWSER', FILE: 'test.jpg', QUALITY: '-5' });
    const result = await screenshotHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
  });

  it('should resolve FILE=* wildcard from URL', async () => {
    const vars = new Map<string, any>();
    vars.set('!URLCURRENT', 'https://www.example.com/page');
    const ctx = createMockContext({ TYPE: 'BROWSER', FILE: '*' }, vars);
    const result = await screenshotHandler(ctx);
    expect(result.success).toBe(true);
    // The file should be derived from URL with .png extension
    const sentMessage = mockBridge.sendMessage.mock.calls[0][0];
    expect(sentMessage.file).toMatch(/\.png$/);
  });

  it('should resolve FILE=+suffix from URL', async () => {
    const vars = new Map<string, any>();
    vars.set('!URLCURRENT', 'https://www.example.com/page');
    const ctx = createMockContext({ TYPE: 'BROWSER', FILE: '+_extra.png' }, vars);
    const result = await screenshotHandler(ctx);
    expect(result.success).toBe(true);
    const sentMessage = mockBridge.sendMessage.mock.calls[0][0];
    expect(sentMessage.file).toContain('_extra.png');
  });

  it('should return error for folder path with null byte', async () => {
    const ctx = createMockContext({ TYPE: 'BROWSER', FOLDER: '/tmp/\0bad', FILE: 'test.png' });
    const result = await screenshotHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    expect(result.errorMessage).toContain('null byte');
  });

  it('should pass FOLDER=* as undefined (browser default)', async () => {
    const ctx = createMockContext({ TYPE: 'BROWSER', FOLDER: '*', FILE: 'test.png' });
    const result = await screenshotHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ folder: undefined }),
    );
  });

  it('should pass FOLDER when specified', async () => {
    const ctx = createMockContext({ TYPE: 'BROWSER', FOLDER: '/tmp/shots', FILE: 'test.png' });
    const result = await screenshotHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ folder: '/tmp/shots' }),
    );
  });

  it('should pass SELECTOR when specified', async () => {
    const ctx = createMockContext({ TYPE: 'BROWSER', FILE: 'test.png', SELECTOR: '#main' });
    const result = await screenshotHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ selector: '#main' }),
    );
  });

  it('should return error when bridge fails', async () => {
    mockBridge.sendMessage.mockResolvedValue({ success: false, error: 'Capture failed' });
    const ctx = createMockContext({ TYPE: 'BROWSER', FILE: 'test.png' });
    const result = await screenshotHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.FILE_WRITE_ERROR);
    expect(result.errorMessage).toBe('Capture failed');
  });

  it('should use fallback error when bridge fails without error text', async () => {
    mockBridge.sendMessage.mockResolvedValue({ success: false });
    const ctx = createMockContext({ TYPE: 'BROWSER', FILE: 'test.png' });
    const result = await screenshotHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('Failed to capture browser screenshot');
  });

  it('should fall back to filename when screenshotPath is not in response', async () => {
    mockBridge.sendMessage.mockResolvedValue({ success: true });
    const ctx = createMockContext({ TYPE: 'BROWSER', FILE: 'test.png' });
    const result = await screenshotHandler(ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBe('test.png');
  });

  it('should not include quality for png screenshots even when QUALITY is provided', async () => {
    const ctx = createMockContext({ TYPE: 'BROWSER', FILE: 'test.png', QUALITY: '50' });
    const result = await screenshotHandler(ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'png', quality: undefined }),
    );
  });
});

// ===== createBrowserCommandHandlers (line 1108) =====

describe('createBrowserCommandHandlers', () => {
  it('should return a record with all handler keys', () => {
    const handlers = createBrowserCommandHandlers();
    expect(handlers).toHaveProperty('CLEAR');
    expect(handlers).toHaveProperty('FILTER');
    expect(handlers).toHaveProperty('PROXY');
    expect(handlers).toHaveProperty('SCREENSHOT');
    expect(typeof handlers.CLEAR).toBe('function');
    expect(typeof handlers.FILTER).toBe('function');
    expect(typeof handlers.PROXY).toBe('function');
    expect(typeof handlers.SCREENSHOT).toBe('function');
  });

  it('should return a new object (not the same reference)', () => {
    const handlers = createBrowserCommandHandlers();
    expect(handlers).not.toBe(browserCommandHandlers);
    expect(handlers).toEqual(browserCommandHandlers);
  });
});

// ===== registerBrowserCommandHandlers =====

describe('registerBrowserCommandHandlers', () => {
  it('should register all handlers with the executor', () => {
    const registerHandler = vi.fn();
    registerBrowserCommandHandlers({ registerHandler });
    expect(registerHandler).toHaveBeenCalledWith('CLEAR', clearHandler);
    expect(registerHandler).toHaveBeenCalledWith('FILTER', filterHandler);
    expect(registerHandler).toHaveBeenCalledWith('PROXY', proxyHandler);
    expect(registerHandler).toHaveBeenCalledWith('SCREENSHOT', screenshotHandler);
    expect(registerHandler).toHaveBeenCalledTimes(4);
  });

  it('should register cleanup callbacks when registerCleanup is provided', () => {
    const registerHandler = vi.fn();
    const registerCleanup = vi.fn();
    registerBrowserCommandHandlers({ registerHandler, registerCleanup });
    expect(registerCleanup).toHaveBeenCalledTimes(2);
    expect(registerCleanup).toHaveBeenCalledWith(restoreProxySettings);
    expect(registerCleanup).toHaveBeenCalledWith(restorePopupSettings);
  });

  it('should not fail when registerCleanup is not provided', () => {
    const registerHandler = vi.fn();
    expect(() => registerBrowserCommandHandlers({ registerHandler })).not.toThrow();
  });
});

// ===== Proxy backup state =====

describe('proxy backup state', () => {
  it('should start as not backed up', () => {
    expect(hasProxyBackup()).toBe(false);
  });

  it('should be marked as backed up after proxy handler runs', async () => {
    const ctx = createMockContext({ ADDRESS: 'proxy:8080' });
    await proxyHandler(ctx);
    expect(hasProxyBackup()).toBe(true);
  });

  it('should reset backup state', async () => {
    const ctx = createMockContext({ ADDRESS: 'proxy:8080' });
    await proxyHandler(ctx);
    expect(hasProxyBackup()).toBe(true);
    resetProxyBackupState();
    expect(hasProxyBackup()).toBe(false);
  });
});

// ===== Popup settings state =====

describe('popup settings state', () => {
  it('should start as not modified', () => {
    expect(hasPopupModifications()).toBe(false);
  });

  it('should be marked as modified after markPopupSettingsModified', () => {
    markPopupSettingsModified();
    expect(hasPopupModifications()).toBe(true);
  });

  it('should reset modification state', () => {
    markPopupSettingsModified();
    expect(hasPopupModifications()).toBe(true);
    resetPopupSettingsState();
    expect(hasPopupModifications()).toBe(false);
  });
});

// ===== restoreProxySettings =====

describe('restoreProxySettings', () => {
  it('should be a no-op when proxy was not backed up', async () => {
    const ctx = createMockContext({});
    await restoreProxySettings(ctx);
    expect(mockBridge.sendMessage).not.toHaveBeenCalled();
  });

  it('should send restoreProxy message when proxy was backed up', async () => {
    // First, trigger a proxy backup
    const ctx1 = createMockContext({ ADDRESS: 'proxy:8080' });
    await proxyHandler(ctx1);
    mockBridge.sendMessage.mockClear();

    const ctx2 = createMockContext({});
    await restoreProxySettings(ctx2);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'restoreProxy' }),
    );
  });

  it('should reset backup state after restoring', async () => {
    const ctx1 = createMockContext({ ADDRESS: 'proxy:8080' });
    await proxyHandler(ctx1);
    expect(hasProxyBackup()).toBe(true);

    const ctx2 = createMockContext({});
    await restoreProxySettings(ctx2);
    expect(hasProxyBackup()).toBe(false);
  });
});

// ===== restorePopupSettings =====

describe('restorePopupSettings', () => {
  it('should be a no-op when popup settings were not modified', async () => {
    const ctx = createMockContext({});
    await restorePopupSettings(ctx);
    expect(mockBridge.sendMessage).not.toHaveBeenCalled();
  });

  it('should send restorePopupSettings message when modified', async () => {
    markPopupSettingsModified();
    const ctx = createMockContext({});
    await restorePopupSettings(ctx);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'restorePopupSettings' }),
    );
  });

  it('should reset modification state after restoring', async () => {
    markPopupSettingsModified();
    expect(hasPopupModifications()).toBe(true);

    const ctx = createMockContext({});
    await restorePopupSettings(ctx);
    expect(hasPopupModifications()).toBe(false);
  });
});

// ===== sendSetPopupAllowed =====

describe('sendSetPopupAllowed', () => {
  it('should send setPopupAllowed message with URL pattern', async () => {
    const ctx = createMockContext({});
    const result = await sendSetPopupAllowed('https://example.com/page', ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'setPopupAllowed',
        primaryPattern: 'https://example.com/*',
      }),
    );
  });

  it('should prepend http:// when no scheme is provided', async () => {
    const ctx = createMockContext({});
    const result = await sendSetPopupAllowed('example.com', ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryPattern: 'http://example.com/*',
      }),
    );
  });

  it('should return error for invalid URL', async () => {
    const ctx = createMockContext({});
    // Pass a URL that will fail new URL() parsing even with http:// prepended
    const result = await sendSetPopupAllowed('://', ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Wrong URL');
  });

  it('should mark popup settings as modified', async () => {
    resetPopupSettingsState();
    const ctx = createMockContext({});
    await sendSetPopupAllowed('https://example.com', ctx);
    expect(hasPopupModifications()).toBe(true);
  });

  it('should trim whitespace from URL', async () => {
    const ctx = createMockContext({});
    const result = await sendSetPopupAllowed('  https://example.com  ', ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryPattern: 'https://example.com/*',
      }),
    );
  });

  it('should include port in pattern if present', async () => {
    const ctx = createMockContext({});
    const result = await sendSetPopupAllowed('https://example.com:8443/page', ctx);
    expect(result.success).toBe(true);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryPattern: 'https://example.com:8443/*',
      }),
    );
  });
});

// ===== browserCommandHandlers constant =====

describe('browserCommandHandlers', () => {
  it('should contain all four handler entries', () => {
    expect(Object.keys(browserCommandHandlers)).toEqual(
      expect.arrayContaining(['CLEAR', 'FILTER', 'PROXY', 'SCREENSHOT']),
    );
    expect(Object.keys(browserCommandHandlers)).toHaveLength(4);
  });
});
