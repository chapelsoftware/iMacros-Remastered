/**
 * Additional unit tests for shared/src/commands/system.ts
 *
 * These tests target the remaining uncovered branches to bring branch coverage
 * from 92.1% to 100%. The uncovered branches are:
 *
 * 1. Line 269: `current[i] || 0` fallback when version arrays differ in length
 * 2. Line 317: `actionParam ? ... : 'START'` - the default 'START' fallback
 * 3. Line 499: `String(error)` branch in CMDLINE catch for non-Error throws
 * 4. Line 553: `String(error)` branch in DISCONNECT catch for non-Error throws
 * 5. Line 612: `String(error)` branch in REDIAL catch for non-Error throws
 * 6. Line 643: `if (handler)` falsy branch in registerSystemHandlers
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  versionHandler,
  stopwatchHandler,
  cmdlineHandler,
  execHandler,
  disconnectHandler,
  redialHandler,
  systemHandlers,
  registerSystemHandlers,
  setVersionInfo,
  clearAllStopwatches,
  setCmdlineExecutor,
  setNetworkManager,
} from '../../../shared/src/commands/system';
import { IMACROS_ERROR_CODES } from '../../../shared/src/executor';

// ===== Test Helpers =====

/**
 * Create a mock CommandContext for direct handler invocation.
 */
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
      setVariable: (name: string, value: any) => {
        vars.set(name.toUpperCase(), value);
      },
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

beforeEach(() => {
  clearAllStopwatches();
  setVersionInfo({
    major: 8,
    minor: 9,
    patch: 7,
    version: '8.9.7',
    platform: 'firefox',
  });
});

afterEach(() => {
  setCmdlineExecutor(null as any);
  setNetworkManager(null as any);
  clearAllStopwatches();
});

// ===== Branch: VERSION BUILD comparison with mismatched version segment lengths =====

describe('VERSION handler - version segment length mismatch', () => {
  it('BUILD with more segments than current version pads with 0 (e.g. 8.9.7 vs 8.9.7.0)', async () => {
    // current = [8,9,7], required = [8,9,7,0]
    // At i=3: current[3] is undefined -> falls back to 0; required[3] = 0 -> equal, pass
    const ctx = createMockContext({ BUILD: '8.9.7.0' });
    const result = await versionHandler(ctx);

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  it('BUILD with more segments fails when extra segment exceeds 0 (e.g. 8.9.7 vs 8.9.7.1)', async () => {
    // current = [8,9,7], required = [8,9,7,1]
    // At i=3: current[3] is undefined -> 0; required[3] = 1 -> 0 < 1, fail
    const ctx = createMockContext({ BUILD: '8.9.7.1' });
    const result = await versionHandler(ctx);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('8.9.7.1');
  });

  it('current version with more segments than required passes (e.g. 8.9.7.5 vs 8.9.7)', async () => {
    setVersionInfo({ major: 8, minor: 9, patch: 7, version: '8.9.7.5' });
    // current = [8,9,7,5], required = [8,9,7]
    // At i=3: current[3] = 5, required[3] is undefined -> 0; 5 > 0 -> break (higher)
    const ctx = createMockContext({ BUILD: '8.9.7' });
    const result = await versionHandler(ctx);

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });
});

// ===== Branch: STOPWATCH toggle behavior (no ACTION param) =====

describe('STOPWATCH handler - toggle behavior', () => {
  it('toggles to START when no ACTION parameter is provided and stopwatch not running', async () => {
    const vars = new Map<string, any>();
    const ctx = createMockContext({}, vars);
    const result = await stopwatchHandler(ctx);

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    // Toggle on non-running stopwatch starts it, setting variable to 0
    expect(vars.get('!STOPWATCH')).toBe(0);
  });

  it('toggles to START with only ID parameter on non-running stopwatch', async () => {
    const vars = new Map<string, any>();
    const ctx = createMockContext({ ID: 'myTimer' }, vars);
    const result = await stopwatchHandler(ctx);

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    expect(vars.get('!STOPWATCH_MYTIMER')).toBe(0);
  });
});

// ===== Branch: EXEC catch with non-Error thrown value =====

describe('EXEC handler - non-Error thrown value', () => {
  it('handles a thrown string (not an Error instance)', async () => {
    const mockExecutor = {
      execute: vi.fn().mockRejectedValue('plain string error'),
    };
    setCmdlineExecutor(mockExecutor);

    const vars = new Map<string, any>();
    const ctx = createMockContext({ CMD: 'test' }, vars);
    const result = await execHandler(ctx);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('plain string error');
    expect(vars.get('!CMDLINE_EXITCODE')).toBe(-1);
    expect(vars.get('!CMDLINE_STDOUT')).toBe('');
    expect(vars.get('!CMDLINE_STDERR')).toBe('plain string error');
  });

  it('handles a thrown number', async () => {
    const mockExecutor = {
      execute: vi.fn().mockRejectedValue(42),
    };
    setCmdlineExecutor(mockExecutor);

    const vars = new Map<string, any>();
    const ctx = createMockContext({ CMD: 'test' }, vars);
    const result = await execHandler(ctx);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('42');
    expect(vars.get('!CMDLINE_STDERR')).toBe('42');
  });

  it('handles a thrown null', async () => {
    const mockExecutor = {
      execute: vi.fn().mockRejectedValue(null),
    };
    setCmdlineExecutor(mockExecutor);

    const vars = new Map<string, any>();
    const ctx = createMockContext({ CMD: 'test' }, vars);
    const result = await execHandler(ctx);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(vars.get('!CMDLINE_STDERR')).toBe('null');
  });
});

// ===== Branch: DISCONNECT catch with non-Error thrown value =====

describe('DISCONNECT handler - non-Error thrown value', () => {
  it('handles a thrown string (not an Error instance)', async () => {
    const mockManager = {
      disconnect: vi.fn().mockRejectedValue('disconnect string error'),
      redial: vi.fn().mockResolvedValue(true),
    };
    setNetworkManager(mockManager);

    const ctx = createMockContext();
    const result = await disconnectHandler(ctx);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('disconnect string error');
  });

  it('handles a thrown number', async () => {
    const mockManager = {
      disconnect: vi.fn().mockRejectedValue(500),
      redial: vi.fn().mockResolvedValue(true),
    };
    setNetworkManager(mockManager);

    const ctx = createMockContext();
    const result = await disconnectHandler(ctx);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('500');
  });
});

// ===== Branch: REDIAL catch with non-Error thrown value =====

describe('REDIAL handler - non-Error thrown value', () => {
  it('handles a thrown string (not an Error instance)', async () => {
    const mockManager = {
      disconnect: vi.fn().mockResolvedValue(true),
      redial: vi.fn().mockRejectedValue('redial string error'),
    };
    setNetworkManager(mockManager);

    const ctx = createMockContext();
    const result = await redialHandler(ctx);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('redial string error');
  });

  it('handles a thrown number', async () => {
    const mockManager = {
      disconnect: vi.fn().mockResolvedValue(true),
      redial: vi.fn().mockRejectedValue(408),
    };
    setNetworkManager(mockManager);

    const ctx = createMockContext();
    const result = await redialHandler(ctx);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('408');
  });
});

// ===== Branch: registerSystemHandlers skips undefined/null handlers =====

describe('registerSystemHandlers - falsy handler branch', () => {
  it('skips entries where handler is undefined', () => {
    // Temporarily modify the systemHandlers record to include an undefined value
    // We test this by directly manipulating the exported systemHandlers object
    const originalVersion = systemHandlers.VERSION;
    // Set a handler to undefined to trigger the falsy branch
    (systemHandlers as any).VERSION = undefined;

    const registered: string[] = [];
    const mockRegisterFn = (type: string, _handler: any) => {
      registered.push(type);
    };

    try {
      registerSystemHandlers(mockRegisterFn as any);

      // VERSION should NOT be registered since we set it to undefined
      expect(registered).not.toContain('VERSION');
      // The other 5 should still be registered
      expect(registered).toContain('STOPWATCH');
      expect(registered).toContain('CMDLINE');
      expect(registered).toContain('EXEC');
      expect(registered).toContain('DISCONNECT');
      expect(registered).toContain('REDIAL');
      expect(registered).toHaveLength(5);
    } finally {
      // Restore the original handler
      (systemHandlers as any).VERSION = originalVersion;
    }
  });

  it('skips entries where handler is null', () => {
    const originalStopwatch = systemHandlers.STOPWATCH;
    (systemHandlers as any).STOPWATCH = null;

    const registered: string[] = [];
    const mockRegisterFn = (type: string, _handler: any) => {
      registered.push(type);
    };

    try {
      registerSystemHandlers(mockRegisterFn as any);

      expect(registered).not.toContain('STOPWATCH');
      expect(registered).toContain('VERSION');
      expect(registered).toContain('CMDLINE');
      expect(registered).toContain('EXEC');
      expect(registered).toContain('DISCONNECT');
      expect(registered).toContain('REDIAL');
      expect(registered).toHaveLength(5);
    } finally {
      (systemHandlers as any).STOPWATCH = originalStopwatch;
    }
  });
});
