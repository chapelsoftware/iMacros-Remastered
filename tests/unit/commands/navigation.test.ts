/**
 * Unit tests for shared/src/commands/navigation.ts
 *
 * Covers uncovered branches:
 * - Lines 411-417: getTabRetryTimeout fallback to !TIMEOUT when !TIMEOUT_TAG not set
 * - Line 492: tabHandler closeAllOthers bridge failure path
 * - Line 601: getFrameRetryTimeout returning 0 when !TIMEOUT_STEP is not set
 *
 * Also provides comprehensive coverage for:
 * - URL GOTO auto-prefix http:// and invalid URL validation
 * - URL CURRENT with and without bridge
 * - BACK/REFRESH bridge failure paths
 * - TAB T= with retry timeout and ERRORIGNORE
 * - FRAME F= and NAME= with retry logic
 * - Registration functions
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  urlHandler,
  backHandler,
  refreshHandler,
  tabHandler,
  frameHandler,
  setBrowserBridge,
  getBrowserBridge,
  navigationHandlers,
  registerNavigationHandlers,
} from '../../../shared/src/commands/navigation';
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
      setUrl: (type: string, url: string) => {
        if (type === 'current') vars.set('!URLCURRENT', url);
      },
    },
    state: {
      setVariable: (name: string, value: any) => vars.set(name.toUpperCase(), value),
      getVariable: (name: string) => vars.get(name.toUpperCase()) ?? null,
      setStartTabIndex: (idx: number) => vars.set('__START_TAB_INDEX__', idx),
      getStartTabIndex: () => vars.get('__START_TAB_INDEX__') ?? 0,
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

// ===== Setup / Teardown =====

let mockBridge: { sendMessage: ReturnType<typeof vi.fn> };

beforeEach(() => {
  mockBridge = {
    sendMessage: vi.fn(),
  };
  setBrowserBridge(mockBridge);
});

afterEach(() => {
  setBrowserBridge(null as any);
  vi.restoreAllMocks();
});

// ===== URL Handler Tests =====

describe('urlHandler', () => {
  describe('URL GOTO', () => {
    it('should navigate to a valid URL', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ GOTO: 'https://example.com' });
      const result = await urlHandler(ctx);
      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(mockBridge.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'navigate', url: 'https://example.com' }),
      );
    });

    it('should auto-prefix http:// when URL has no scheme', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ GOTO: 'www.example.com' });
      const result = await urlHandler(ctx);
      expect(result.success).toBe(true);
      expect(mockBridge.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'navigate', url: 'http://www.example.com' }),
      );
    });

    it('should not prefix http:// for URLs with a scheme (mailto:, javascript:, etc.)', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ GOTO: 'mailto:user@example.com' });
      const result = await urlHandler(ctx);
      expect(result.success).toBe(true);
      expect(mockBridge.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'navigate', url: 'mailto:user@example.com' }),
      );
    });

    it('should return INVALID_PARAMETER for an invalid URL', async () => {
      const ctx = createMockContext({ GOTO: ':::invalid' });
      const result = await urlHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(result.errorMessage).toContain('Invalid URL');
    });

    it('should return PAGE_TIMEOUT when bridge navigate fails', async () => {
      mockBridge.sendMessage.mockResolvedValue({
        success: false,
        error: 'Connection refused',
      });
      const ctx = createMockContext({ GOTO: 'https://example.com' });
      const result = await urlHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.PAGE_TIMEOUT);
      expect(result.errorMessage).toBe('Connection refused');
    });

    it('should use default error message when bridge fails without error text', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: false });
      const ctx = createMockContext({ GOTO: 'https://example.com' });
      const result = await urlHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Failed to navigate to');
    });

    it('should update !URLCURRENT after successful navigation', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: true });
      const vars = new Map<string, any>();
      const ctx = createMockContext({ GOTO: 'https://example.com' }, vars);
      await urlHandler(ctx);
      expect(vars.get('!URLCURRENT')).toBe('https://example.com');
    });

    it('should store !DOCUMENT_TITLE when response includes title', async () => {
      mockBridge.sendMessage.mockResolvedValue({
        success: true,
        data: { title: 'Example Page' },
      });
      const vars = new Map<string, any>();
      const ctx = createMockContext({ GOTO: 'https://example.com' }, vars);
      await urlHandler(ctx);
      expect(vars.get('!DOCUMENT_TITLE')).toBe('Example Page');
    });

    it('should not set !DOCUMENT_TITLE when response title is empty', async () => {
      mockBridge.sendMessage.mockResolvedValue({
        success: true,
        data: { title: '' },
      });
      const vars = new Map<string, any>();
      const ctx = createMockContext({ GOTO: 'https://example.com' }, vars);
      await urlHandler(ctx);
      expect(vars.has('!DOCUMENT_TITLE')).toBe(false);
    });
  });

  describe('URL CURRENT', () => {
    it('should get current URL from bridge', async () => {
      mockBridge.sendMessage.mockResolvedValue({
        success: true,
        data: { url: 'https://current.example.com', title: 'Current Page' },
      });
      const vars = new Map<string, any>();
      const ctx = createMockContext({ CURRENT: '' }, vars);
      const result = await urlHandler(ctx);
      expect(result.success).toBe(true);
      expect(result.output).toBe('https://current.example.com');
      expect(vars.get('!URLCURRENT')).toBe('https://current.example.com');
      expect(vars.get('!DOCUMENT_TITLE')).toBe('Current Page');
    });

    it('should return empty string when bridge returns no URL data', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: true });
      const vars = new Map<string, any>();
      const ctx = createMockContext({ CURRENT: '' }, vars);
      const result = await urlHandler(ctx);
      expect(result.success).toBe(true);
      expect(result.output).toBe('');
      expect(vars.get('!URLCURRENT')).toBe('');
    });

    it('should return SCRIPT_ERROR when bridge getCurrentUrl fails', async () => {
      mockBridge.sendMessage.mockResolvedValue({
        success: false,
        error: 'Tab not available',
      });
      const ctx = createMockContext({ CURRENT: '' });
      const result = await urlHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toBe('Tab not available');
    });

    it('should use default error message when bridge getCurrentUrl fails without error text', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: false });
      const ctx = createMockContext({ CURRENT: '' });
      const result = await urlHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Failed to get current URL');
    });

    it('should succeed without bridge (no bridge configured)', async () => {
      setBrowserBridge(null as any);
      const vars = new Map<string, any>();
      const ctx = createMockContext({ CURRENT: '' }, vars);
      const result = await urlHandler(ctx);
      // sendBrowserMessage returns { success: true } when no bridge
      expect(result.success).toBe(true);
      expect(result.output).toBe('');
    });
  });

  describe('URL missing parameter', () => {
    it('should return MISSING_PARAMETER when no GOTO or CURRENT', async () => {
      const ctx = createMockContext({});
      const result = await urlHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(result.errorMessage).toContain('URL command requires GOTO or CURRENT');
    });
  });
});

// ===== BACK Handler Tests =====

describe('backHandler', () => {
  it('should navigate back successfully', async () => {
    mockBridge.sendMessage.mockResolvedValue({ success: true });
    const ctx = createMockContext();
    const result = await backHandler(ctx);
    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'goBack' }),
    );
  });

  it('should return SCRIPT_ERROR when bridge goBack fails', async () => {
    mockBridge.sendMessage.mockResolvedValue({
      success: false,
      error: 'No history entry',
    });
    const ctx = createMockContext();
    const result = await backHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toBe('No history entry');
  });

  it('should use default error message when bridge goBack fails without error text', async () => {
    mockBridge.sendMessage.mockResolvedValue({ success: false });
    const ctx = createMockContext();
    const result = await backHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('Failed to navigate back');
  });

  it('should handle bridge exception gracefully', async () => {
    mockBridge.sendMessage.mockRejectedValue(new Error('Bridge disconnected'));
    const ctx = createMockContext();
    const result = await backHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
  });
});

// ===== REFRESH Handler Tests =====

describe('refreshHandler', () => {
  it('should refresh page successfully', async () => {
    mockBridge.sendMessage.mockResolvedValue({ success: true });
    const ctx = createMockContext();
    const result = await refreshHandler(ctx);
    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'refresh' }),
    );
  });

  it('should return SCRIPT_ERROR when bridge refresh fails', async () => {
    mockBridge.sendMessage.mockResolvedValue({
      success: false,
      error: 'Page unresponsive',
    });
    const ctx = createMockContext();
    const result = await refreshHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toBe('Page unresponsive');
  });

  it('should use default error message when bridge refresh fails without error text', async () => {
    mockBridge.sendMessage.mockResolvedValue({ success: false });
    const ctx = createMockContext();
    const result = await refreshHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('Failed to refresh page');
  });

  it('should handle bridge exception gracefully', async () => {
    mockBridge.sendMessage.mockRejectedValue(new Error('Bridge disconnected'));
    const ctx = createMockContext();
    const result = await refreshHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
  });
});

// ===== TAB Handler Tests =====

describe('tabHandler', () => {
  describe('TAB T=n (switch tab)', () => {
    it('should switch to tab on first attempt', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ T: '2' });
      const result = await tabHandler(ctx);
      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(mockBridge.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'switchTab', tabIndex: 1 }),
      );
    });

    it('should use startTabIndex to compute absolute tab index', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: true });
      const vars = new Map<string, any>();
      vars.set('__START_TAB_INDEX__', 3);
      const ctx = createMockContext({ T: '2' }, vars);
      const result = await tabHandler(ctx);
      expect(result.success).toBe(true);
      // Absolute index = startTabIndex(3) + T(2) - 1 = 4
      expect(mockBridge.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'switchTab', tabIndex: 4 }),
      );
    });

    it('should return INVALID_PARAMETER for non-numeric tab index', async () => {
      const ctx = createMockContext({ T: 'abc' });
      const result = await tabHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(result.errorMessage).toContain('Invalid tab index');
    });

    it('should return INVALID_PARAMETER for tab index < 1', async () => {
      const ctx = createMockContext({ T: '0' });
      const result = await tabHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    });

    it('should retry and return SCRIPT_EXCEPTION when tab not found after timeout', async () => {
      mockBridge.sendMessage.mockResolvedValue({
        success: false,
        error: 'Tab not found',
      });
      // Set !TIMEOUT_TAG to 0 so we don't actually retry (immediate timeout)
      const vars = new Map<string, any>();
      vars.set('!TIMEOUT_TAG', 0);
      const ctx = createMockContext({ T: '5' }, vars);
      const result = await tabHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_EXCEPTION);
      // Bridge error is used when available
      expect(result.errorMessage).toBe('Tab not found');
    });

    it('should use default error message when bridge returns no error text on tab switch', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: false });
      const vars = new Map<string, any>();
      vars.set('!TIMEOUT_TAG', 0);
      const ctx = createMockContext({ T: '5' }, vars);
      const result = await tabHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_EXCEPTION);
      // Default message uses absolute index + 1: startTabIndex(0) + T(5) - 1 = 4, then 4+1 = 5
      expect(result.errorMessage).toBe('Tab 5 does not exist');
    });

    it('should suppress error when !ERRORIGNORE=YES and tab not found', async () => {
      mockBridge.sendMessage.mockResolvedValue({
        success: false,
        error: 'Tab not found',
      });
      const vars = new Map<string, any>();
      vars.set('!TIMEOUT_TAG', 0);
      vars.set('!ERRORIGNORE', 'YES');
      const ctx = createMockContext({ T: '5' }, vars);
      const result = await tabHandler(ctx);
      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    });

    it('should succeed on retry when tab becomes available', async () => {
      // First call fails, second succeeds
      mockBridge.sendMessage
        .mockResolvedValueOnce({ success: false, error: 'Tab not found' })
        .mockResolvedValueOnce({ success: true });
      const vars = new Map<string, any>();
      vars.set('!TIMEOUT_TAG', 1); // 1 second timeout allows retries
      const ctx = createMockContext({ T: '2' }, vars);
      const result = await tabHandler(ctx);
      expect(result.success).toBe(true);
      expect(mockBridge.sendMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe('getTabRetryTimeout (lines 411-417)', () => {
    it('should use !TIMEOUT_TAG as number', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: false, error: 'fail' });
      const vars = new Map<string, any>();
      vars.set('!TIMEOUT_TAG', 0);
      const ctx = createMockContext({ T: '2' }, vars);
      const result = await tabHandler(ctx);
      // With timeout 0, it should fail immediately (no retries)
      expect(result.success).toBe(false);
      // Only the initial attempt
      expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('should parse !TIMEOUT_TAG as string', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: false, error: 'fail' });
      const vars = new Map<string, any>();
      vars.set('!TIMEOUT_TAG', '0');
      const ctx = createMockContext({ T: '2' }, vars);
      const result = await tabHandler(ctx);
      expect(result.success).toBe(false);
      expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('should fallback to !TIMEOUT / 10 when !TIMEOUT_TAG not set and !TIMEOUT is a string (line 413-415)', async () => {
      // This specifically covers the uncovered branch at lines 413-415
      mockBridge.sendMessage.mockResolvedValue({ success: false, error: 'fail' });
      const vars = new Map<string, any>();
      // No !TIMEOUT_TAG set, !TIMEOUT as string "10" => timeout = 10/10 = 1 second
      vars.set('!TIMEOUT', '10');
      const ctx = createMockContext({ T: '2' }, vars);
      const startTime = Date.now();
      const result = await tabHandler(ctx);
      const elapsed = Date.now() - startTime;
      expect(result.success).toBe(false);
      // Should have retried for approximately 1 second (10/10 = 1s)
      expect(elapsed).toBeGreaterThanOrEqual(500); // At least some retries
      expect(mockBridge.sendMessage.mock.calls.length).toBeGreaterThan(1);
    });

    it('should fallback to !TIMEOUT / 10 when !TIMEOUT_TAG not set and !TIMEOUT is a number (line 412)', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: false, error: 'fail' });
      const vars = new Map<string, any>();
      // No !TIMEOUT_TAG set, !TIMEOUT as number 0 => timeout = 0/10 = 0 seconds
      vars.set('!TIMEOUT', 0);
      const ctx = createMockContext({ T: '2' }, vars);
      const result = await tabHandler(ctx);
      expect(result.success).toBe(false);
      // With 0 timeout, only the initial attempt
      expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('should fallback to !TIMEOUT string NaN and use default 6 seconds', async () => {
      // !TIMEOUT is a string that can't be parsed => falls through to default
      mockBridge.sendMessage.mockResolvedValue({ success: false, error: 'fail' });
      const vars = new Map<string, any>();
      vars.set('!TIMEOUT', 'notanumber');
      const ctx = createMockContext({ T: '2' }, vars);
      // We don't want to wait 6 seconds; override with ERRORIGNORE to check that it didn't throw
      vars.set('!ERRORIGNORE', 'YES');
      const result = await tabHandler(ctx);
      // It will retry for 6 seconds then return OK due to ERRORIGNORE
      expect(result.success).toBe(true);
    }, 10000);

    it('should default to 6 when neither !TIMEOUT_TAG nor !TIMEOUT is set (line 417)', async () => {
      // Neither variable set => getTabRetryTimeout returns 6
      mockBridge.sendMessage.mockResolvedValue({ success: false, error: 'fail' });
      const vars = new Map<string, any>();
      // Set ERRORIGNORE to avoid waiting full 6 seconds before checking
      vars.set('!ERRORIGNORE', 'YES');
      const ctx = createMockContext({ T: '2' }, vars);
      const startTime = Date.now();
      const result = await tabHandler(ctx);
      const elapsed = Date.now() - startTime;
      // Default timeout is 6s; should have retried and taken some time
      expect(elapsed).toBeGreaterThanOrEqual(3000);
      expect(result.success).toBe(true); // Suppressed by ERRORIGNORE
    }, 10000);

    it('should handle !TIMEOUT_TAG as invalid string and fall through to !TIMEOUT', async () => {
      // !TIMEOUT_TAG is NaN string, should fall through to !TIMEOUT
      mockBridge.sendMessage.mockResolvedValue({ success: false, error: 'fail' });
      const vars = new Map<string, any>();
      vars.set('!TIMEOUT_TAG', 'invalid');
      vars.set('!TIMEOUT', 0);
      const ctx = createMockContext({ T: '2' }, vars);
      const result = await tabHandler(ctx);
      expect(result.success).toBe(false);
      // timeout = 0/10 = 0, so only initial attempt
      expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('should handle negative !TIMEOUT_TAG number and fall through', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: false, error: 'fail' });
      const vars = new Map<string, any>();
      vars.set('!TIMEOUT_TAG', -1);
      vars.set('!TIMEOUT', 0);
      const ctx = createMockContext({ T: '2' }, vars);
      const result = await tabHandler(ctx);
      expect(result.success).toBe(false);
      expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('TAB OPEN', () => {
    it('should open a new tab', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ OPEN: '' });
      const result = await tabHandler(ctx);
      expect(result.success).toBe(true);
      expect(mockBridge.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'openTab' }),
      );
    });

    it('should open a new tab with URL', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ OPEN: '', URL: 'https://example.com' });
      const result = await tabHandler(ctx);
      expect(result.success).toBe(true);
      expect(mockBridge.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'openTab', url: 'https://example.com' }),
      );
    });

    it('should return SCRIPT_ERROR when bridge openTab fails', async () => {
      mockBridge.sendMessage.mockResolvedValue({
        success: false,
        error: 'Cannot open tab',
      });
      const ctx = createMockContext({ OPEN: '' });
      const result = await tabHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toBe('Cannot open tab');
    });

    it('should use default error message when bridge openTab fails without error text', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: false });
      const ctx = createMockContext({ OPEN: '' });
      const result = await tabHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Failed to open new tab');
    });
  });

  describe('TAB NEW OPEN (alternative syntax)', () => {
    it('should handle TAB NEW without T param as TAB OPEN', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ NEW: '' });
      const result = await tabHandler(ctx);
      expect(result.success).toBe(true);
      expect(mockBridge.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'openTab' }),
      );
    });
  });

  describe('TAB CLOSE', () => {
    it('should close current tab', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ CLOSE: '' });
      const result = await tabHandler(ctx);
      expect(result.success).toBe(true);
      expect(mockBridge.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'closeTab' }),
      );
    });

    it('should return SCRIPT_ERROR when bridge closeTab fails', async () => {
      mockBridge.sendMessage.mockResolvedValue({
        success: false,
        error: 'Cannot close last tab',
      });
      const ctx = createMockContext({ CLOSE: '' });
      const result = await tabHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toBe('Cannot close last tab');
    });

    it('should use default error message when bridge closeTab fails without error text', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: false });
      const ctx = createMockContext({ CLOSE: '' });
      const result = await tabHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Failed to close tab');
    });
  });

  describe('TAB CLOSEALLOTHERS (line 492)', () => {
    it('should close all other tabs', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: true });
      const vars = new Map<string, any>();
      vars.set('__START_TAB_INDEX__', 5);
      const ctx = createMockContext({ CLOSEALLOTHERS: '' }, vars);
      const result = await tabHandler(ctx);
      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(mockBridge.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'closeOtherTabs' }),
      );
      // Should reset startTabIndex to 0
      expect(vars.get('__START_TAB_INDEX__')).toBe(0);
    });

    it('should return SCRIPT_ERROR when bridge closeOtherTabs fails (line 492)', async () => {
      mockBridge.sendMessage.mockResolvedValue({
        success: false,
        error: 'Permission denied',
      });
      const ctx = createMockContext({ CLOSEALLOTHERS: '' });
      const result = await tabHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toBe('Permission denied');
    });

    it('should use default error message when bridge closeOtherTabs fails without error text', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: false });
      const ctx = createMockContext({ CLOSEALLOTHERS: '' });
      const result = await tabHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Failed to close other tabs');
    });
  });

  describe('TAB missing parameter', () => {
    it('should return MISSING_PARAMETER when no T, OPEN, CLOSE, or CLOSEALLOTHERS', async () => {
      const ctx = createMockContext({});
      const result = await tabHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(result.errorMessage).toContain('TAB command requires');
    });
  });
});

// ===== FRAME Handler Tests =====

describe('frameHandler', () => {
  describe('FRAME F=n', () => {
    it('should select main document with F=0', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ F: '0' });
      const result = await frameHandler(ctx);
      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(mockBridge.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'selectFrame', frameIndex: 0 }),
      );
    });

    it('should select frame by index', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ F: '2' });
      const result = await frameHandler(ctx);
      expect(result.success).toBe(true);
      expect(mockBridge.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'selectFrame', frameIndex: 2 }),
      );
    });

    it('should return INVALID_PARAMETER for invalid frame index', async () => {
      const ctx = createMockContext({ F: 'abc' });
      const result = await frameHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(result.errorMessage).toContain('Invalid frame index');
    });

    it('should return INVALID_PARAMETER for negative frame index', async () => {
      const ctx = createMockContext({ F: '-1' });
      const result = await frameHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    });

    it('should return FRAME_NOT_FOUND when frame does not exist', async () => {
      mockBridge.sendMessage.mockResolvedValue({
        success: false,
        error: 'Frame index out of range',
      });
      const vars = new Map<string, any>();
      vars.set('!TIMEOUT_STEP', 0);
      const ctx = createMockContext({ F: '99' }, vars);
      const result = await frameHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.FRAME_NOT_FOUND);
      expect(result.errorMessage).toBe('Frame index out of range');
    });

    it('should use default error label when bridge returns no error text', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: false });
      const vars = new Map<string, any>();
      vars.set('!TIMEOUT_STEP', 0);
      const ctx = createMockContext({ F: '5' }, vars);
      const result = await frameHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Frame 5 not found');
    });

    it('should reset to main frame on failure', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: false, error: 'not found' });
      const vars = new Map<string, any>();
      vars.set('!TIMEOUT_STEP', 0);
      const ctx = createMockContext({ F: '3' }, vars);
      await frameHandler(ctx);
      // The last call to sendMessage should be the reset to main frame
      const calls = mockBridge.sendMessage.mock.calls;
      const lastCall = calls[calls.length - 1][0];
      expect(lastCall.type).toBe('selectFrame');
      expect(lastCall.frameIndex).toBe(0);
    });

    it('should retry and succeed when frame becomes available', async () => {
      mockBridge.sendMessage
        .mockResolvedValueOnce({ success: false, error: 'not found' })
        .mockResolvedValueOnce({ success: true });
      const vars = new Map<string, any>();
      vars.set('!TIMEOUT_STEP', 2);
      const ctx = createMockContext({ F: '1' }, vars);
      const result = await frameHandler(ctx);
      expect(result.success).toBe(true);
      expect(mockBridge.sendMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe('FRAME NAME=', () => {
    it('should select frame by name', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ NAME: 'myFrame' });
      const result = await frameHandler(ctx);
      expect(result.success).toBe(true);
      expect(mockBridge.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'selectFrame', frameName: 'myFrame' }),
      );
    });

    it('should return FRAME_NOT_FOUND when named frame does not exist', async () => {
      mockBridge.sendMessage.mockResolvedValue({
        success: false,
        error: 'Frame not found',
      });
      const vars = new Map<string, any>();
      vars.set('!TIMEOUT_STEP', 0);
      const ctx = createMockContext({ NAME: 'nonexistent' }, vars);
      const result = await frameHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.FRAME_NOT_FOUND);
    });

    it('should use default error label for named frame failure', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: false });
      const vars = new Map<string, any>();
      vars.set('!TIMEOUT_STEP', 0);
      const ctx = createMockContext({ NAME: 'content' }, vars);
      const result = await frameHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Frame "content" not found');
    });
  });

  describe('getFrameRetryTimeout (line 601)', () => {
    it('should return 0 when !TIMEOUT_STEP is not set (line 601)', async () => {
      // No !TIMEOUT_STEP set => getFrameRetryTimeout returns 0 => no retry
      mockBridge.sendMessage.mockResolvedValue({ success: false, error: 'not found' });
      const vars = new Map<string, any>();
      // Deliberately do NOT set !TIMEOUT_STEP
      const ctx = createMockContext({ F: '1' }, vars);
      const result = await frameHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.FRAME_NOT_FOUND);
      // With 0 timeout: initial attempt + reset-to-main = 2 calls
      expect(mockBridge.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('should use !TIMEOUT_STEP as number for retry timeout', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: false, error: 'not found' });
      const vars = new Map<string, any>();
      vars.set('!TIMEOUT_STEP', 0);
      const ctx = createMockContext({ F: '1' }, vars);
      await frameHandler(ctx);
      // 0 timeout: initial attempt + reset call
      expect(mockBridge.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('should parse !TIMEOUT_STEP as string for retry timeout', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: false, error: 'not found' });
      const vars = new Map<string, any>();
      vars.set('!TIMEOUT_STEP', '0');
      const ctx = createMockContext({ F: '1' }, vars);
      await frameHandler(ctx);
      // 0 timeout: initial attempt + reset call
      expect(mockBridge.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('should return 0 when !TIMEOUT_STEP is an unparseable string', async () => {
      mockBridge.sendMessage.mockResolvedValue({ success: false, error: 'not found' });
      const vars = new Map<string, any>();
      vars.set('!TIMEOUT_STEP', 'notanumber');
      const ctx = createMockContext({ F: '1' }, vars);
      await frameHandler(ctx);
      // NaN string => 0 timeout: initial attempt + reset call
      expect(mockBridge.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('should retry for !TIMEOUT_STEP seconds when set as number', async () => {
      mockBridge.sendMessage
        .mockResolvedValueOnce({ success: false, error: 'not found' })
        .mockResolvedValueOnce({ success: false, error: 'not found' })
        .mockResolvedValueOnce({ success: true });
      const vars = new Map<string, any>();
      vars.set('!TIMEOUT_STEP', 5);
      const ctx = createMockContext({ F: '1' }, vars);
      const result = await frameHandler(ctx);
      expect(result.success).toBe(true);
      expect(mockBridge.sendMessage).toHaveBeenCalledTimes(3);
    });
  });

  describe('FRAME missing parameter', () => {
    it('should return MISSING_PARAMETER when no F or NAME', async () => {
      const ctx = createMockContext({});
      const result = await frameHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(result.errorMessage).toContain('FRAME command requires F or NAME');
    });
  });
});

// ===== Bridge Setup Tests =====

describe('setBrowserBridge / getBrowserBridge', () => {
  it('should set and get the browser bridge', () => {
    const bridge = { sendMessage: vi.fn() };
    setBrowserBridge(bridge);
    expect(getBrowserBridge()).toBe(bridge);
  });

  it('should handle null bridge (no bridge configured)', async () => {
    setBrowserBridge(null as any);
    expect(getBrowserBridge()).toBeNull();
    // sendBrowserMessage should return { success: true } and log a warning
    const ctx = createMockContext({ GOTO: 'https://example.com' });
    const result = await urlHandler(ctx);
    expect(result.success).toBe(true);
    const warnLog = ctx._logs.find(
      (l: { level: string }) => l.level === 'warn',
    );
    expect(warnLog).toBeDefined();
    expect(warnLog.message).toContain('No browser bridge configured');
  });
});

// ===== sendBrowserMessage exception handling =====

describe('sendBrowserMessage exception handling', () => {
  it('should catch bridge exceptions and return failure', async () => {
    mockBridge.sendMessage.mockRejectedValue(new Error('Bridge crashed'));
    const ctx = createMockContext({ GOTO: 'https://example.com' });
    const result = await urlHandler(ctx);
    expect(result.success).toBe(false);
    const errorLog = ctx._logs.find(
      (l: { level: string }) => l.level === 'error',
    );
    expect(errorLog).toBeDefined();
    expect(errorLog.message).toContain('Browser operation failed');
  });

  it('should handle non-Error thrown values via String()', async () => {
    mockBridge.sendMessage.mockRejectedValue('string error');
    const ctx = createMockContext({ GOTO: 'https://example.com' });
    const result = await urlHandler(ctx);
    expect(result.success).toBe(false);
    const errorLog = ctx._logs.find(
      (l: { level: string }) => l.level === 'error',
    );
    expect(errorLog).toBeDefined();
    expect(errorLog.message).toContain('string error');
  });
});

// ===== Registration Tests =====

describe('navigationHandlers', () => {
  it('should export all navigation handler entries', () => {
    expect(navigationHandlers.URL).toBe(urlHandler);
    expect(navigationHandlers.BACK).toBe(backHandler);
    expect(navigationHandlers.REFRESH).toBe(refreshHandler);
    expect(navigationHandlers.TAB).toBe(tabHandler);
    expect(navigationHandlers.FRAME).toBe(frameHandler);
  });
});

describe('registerNavigationHandlers', () => {
  it('should register all handlers with the executor', () => {
    const mockExecutor = {
      registerHandler: vi.fn(),
    };
    registerNavigationHandlers(mockExecutor);
    expect(mockExecutor.registerHandler).toHaveBeenCalledTimes(5);
    expect(mockExecutor.registerHandler).toHaveBeenCalledWith('URL', urlHandler);
    expect(mockExecutor.registerHandler).toHaveBeenCalledWith('BACK', backHandler);
    expect(mockExecutor.registerHandler).toHaveBeenCalledWith('REFRESH', refreshHandler);
    expect(mockExecutor.registerHandler).toHaveBeenCalledWith('TAB', tabHandler);
    expect(mockExecutor.registerHandler).toHaveBeenCalledWith('FRAME', frameHandler);
  });
});
