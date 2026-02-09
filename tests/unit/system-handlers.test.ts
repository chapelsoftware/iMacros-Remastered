/**
 * System Command Handlers Unit Tests
 *
 * Tests the system-level command handlers defined in shared/src/commands/system.ts:
 * - VERSION: Version checking and version variable storage
 * - STOPWATCH: Start/stop/lap/read timing functionality
 * - CMDLINE: Shell command execution via injected executor
 * - DISCONNECT: Network disconnection via injected network manager
 * - REDIAL: Network reconnection via injected network manager
 *
 * Also tests the module-level helpers:
 * - setVersionInfo / getVersionInfo
 * - clearStopwatch / clearAllStopwatches / getStopwatchElapsed
 * - setCmdlineExecutor / getCmdlineExecutor
 * - setNetworkManager / getNetworkManager
 * - registerSystemHandlers
 *
 * Tests that need to verify variable storage use direct handler invocation
 * with a mock context, because the VariableContext's validation rejects
 * system variables not in the known SYSTEM_VARIABLES list (e.g. !VERSION,
 * !CMDLINE_EXITCODE). Tests that only verify success/failure and error codes
 * use the full executor pipeline.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MacroExecutor,
  createExecutor,
  IMACROS_ERROR_CODES,
} from '../../shared/src/executor';
import {
  versionHandler,
  stopwatchHandler,
  cmdlineHandler,
  execHandler,
  disconnectHandler,
  redialHandler,
  setVersionInfo,
  getVersionInfo,
  clearStopwatch,
  clearAllStopwatches,
  getStopwatchElapsed,
  setCmdlineExecutor,
  getCmdlineExecutor,
  setNetworkManager,
  getNetworkManager,
  registerSystemHandlers,
} from '../../shared/src/commands/system';

// ===== Test Helpers =====

let executor: MacroExecutor;
let logs: Array<{ level: string; message: string }>;

beforeEach(() => {
  logs = [];
  executor = createExecutor({
    onLog: (level, message) => logs.push({ level, message }),
  });
  registerSystemHandlers(executor.registerHandler.bind(executor));
  clearAllStopwatches();

  // Reset version info to default
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

/**
 * Helper: execute a macro string via the full executor pipeline.
 */
async function run(macroText: string) {
  executor.loadMacro(macroText);
  return executor.execute();
}

/**
 * Create a mock CommandContext for direct handler invocation.
 * The mock state.setVariable stores values in the provided vars map
 * without the system variable validation that the real VariableContext does.
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

// ===== VERSION Handler Tests =====

describe('VERSION handler', () => {
  it('VERSION BUILD=8.0.0 succeeds when current version (8.9.7) is higher', async () => {
    const result = await run('VERSION BUILD=8.0.0');

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  it('VERSION BUILD=8.9.7 succeeds when current version equals required', async () => {
    const result = await run('VERSION BUILD=8.9.7');

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  it('VERSION BUILD=99.0.0 fails when required version is higher than current', async () => {
    const result = await run('VERSION BUILD=99.0.0');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('99.0.0');
    expect(result.errorMessage).toContain('8.9.7');
  });

  it('VERSION BUILD=8.10.0 fails when minor version is higher', async () => {
    const result = await run('VERSION BUILD=8.10.0');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
  });

  it('VERSION without BUILD succeeds', async () => {
    const result = await run('VERSION');

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  it('sets !VERSION variable via handler', async () => {
    const vars = new Map<string, any>();
    const ctx = createMockContext({}, vars);
    await versionHandler(ctx);

    expect(vars.get('!VERSION')).toBe('8.9.7');
  });

  it('sets !VERSION_MAJOR variable via handler', async () => {
    const vars = new Map<string, any>();
    const ctx = createMockContext({}, vars);
    await versionHandler(ctx);

    expect(vars.get('!VERSION_MAJOR')).toBe(8);
  });

  it('sets !VERSION_MINOR variable via handler', async () => {
    const vars = new Map<string, any>();
    const ctx = createMockContext({}, vars);
    await versionHandler(ctx);

    expect(vars.get('!VERSION_MINOR')).toBe(9);
  });

  it('sets !VERSION_PATCH variable via handler', async () => {
    const vars = new Map<string, any>();
    const ctx = createMockContext({}, vars);
    await versionHandler(ctx);

    expect(vars.get('!VERSION_PATCH')).toBe(7);
  });

  it('sets !PLATFORM variable via handler', async () => {
    const vars = new Map<string, any>();
    const ctx = createMockContext({}, vars);
    await versionHandler(ctx);

    expect(vars.get('!PLATFORM')).toBe('firefox');
  });

  it('VERSION BUILD comparison works when current major is higher', async () => {
    setVersionInfo({ major: 9, minor: 0, patch: 0, version: '9.0.0' });

    const result = await run('VERSION BUILD=8.9.7');

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  it('VERSION BUILD check passes via direct handler invocation', async () => {
    const ctx = createMockContext({ BUILD: '8.0.0' });
    const result = await versionHandler(ctx);

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  it('VERSION BUILD check fails via direct handler when version too high', async () => {
    const ctx = createMockContext({ BUILD: '99.0.0' });
    const result = await versionHandler(ctx);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('99.0.0');
  });

  it('returns the version string as output', async () => {
    const ctx = createMockContext({});
    const result = await versionHandler(ctx);

    expect(result.output).toBe('8.9.7');
  });
});

// ===== setVersionInfo / getVersionInfo Tests =====

describe('setVersionInfo / getVersionInfo', () => {
  it('getVersionInfo returns the current version info', () => {
    const info = getVersionInfo();

    expect(info.major).toBe(8);
    expect(info.minor).toBe(9);
    expect(info.patch).toBe(7);
    expect(info.version).toBe('8.9.7');
    expect(info.platform).toBe('firefox');
  });

  it('setVersionInfo updates partial fields', () => {
    setVersionInfo({ platform: 'chrome' });

    const info = getVersionInfo();
    expect(info.platform).toBe('chrome');
    // Other fields should be preserved
    expect(info.major).toBe(8);
    expect(info.version).toBe('8.9.7');
  });

  it('setVersionInfo updates all fields', () => {
    setVersionInfo({
      major: 10,
      minor: 1,
      patch: 2,
      version: '10.1.2',
      platform: 'chrome',
      build: '1234',
    });

    const info = getVersionInfo();
    expect(info.major).toBe(10);
    expect(info.minor).toBe(1);
    expect(info.patch).toBe(2);
    expect(info.version).toBe('10.1.2');
    expect(info.platform).toBe('chrome');
    expect(info.build).toBe('1234');
  });

  it('getVersionInfo returns a copy (not a reference)', () => {
    const info1 = getVersionInfo();
    info1.major = 999;

    const info2 = getVersionInfo();
    expect(info2.major).not.toBe(999);
  });

  it('custom version info is used by VERSION handler for variables', async () => {
    setVersionInfo({
      major: 10,
      minor: 0,
      patch: 0,
      version: '10.0.0',
      platform: 'chrome',
    });

    const vars = new Map<string, any>();
    const ctx = createMockContext({}, vars);
    await versionHandler(ctx);

    expect(vars.get('!VERSION')).toBe('10.0.0');
    expect(vars.get('!VERSION_MAJOR')).toBe(10);
    expect(vars.get('!PLATFORM')).toBe('chrome');
  });

  it('custom version info is used by VERSION handler for BUILD check', async () => {
    setVersionInfo({
      major: 10,
      minor: 0,
      patch: 0,
      version: '10.0.0',
      platform: 'chrome',
    });

    const ctx = createMockContext({ BUILD: '9.0.0' });
    const result = await versionHandler(ctx);

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });
});

// ===== STOPWATCH Handler Tests =====

describe('STOPWATCH handler', () => {
  it('STOPWATCH ACTION=START starts the default stopwatch', async () => {
    const result = await run('STOPWATCH ACTION=START');

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  it('STOPWATCH ID=timer1 ACTION=START starts a named stopwatch', async () => {
    const result = await run('STOPWATCH ID=timer1 ACTION=START');

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  it('STOPWATCH ACTION=STOP stops and returns elapsed time', async () => {
    const macro = [
      'STOPWATCH ACTION=START',
      'STOPWATCH ACTION=STOP',
    ].join('\n');

    const result = await run(macro);

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  it('STOPWATCH ACTION=STOP sets the elapsed time in !STOPWATCH variable', async () => {
    // Use direct handler invocation to bypass variable system validation
    const vars = new Map<string, any>();
    const ctxStart = createMockContext({ ACTION: 'START' }, vars);
    await stopwatchHandler(ctxStart);

    const ctxStop = createMockContext({ ACTION: 'STOP' }, vars);
    await stopwatchHandler(ctxStop);

    const elapsed = vars.get('!STOPWATCH');
    expect(typeof elapsed).toBe('number');
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });

  it('STOPWATCH ACTION=STOP when not running returns success (warn)', async () => {
    const result = await run('STOPWATCH ACTION=STOP');

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    // Should have logged a warning
    const warnings = logs.filter(
      l => l.level === 'warn' && l.message.includes('not running')
    );
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('STOPWATCH ACTION=LAP records a lap time', async () => {
    const macro = [
      'STOPWATCH ACTION=START',
      'STOPWATCH ACTION=LAP',
    ].join('\n');

    const result = await run(macro);

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  it('STOPWATCH ACTION=LAP sets !STOPWATCH_LAP1 variable via handler', async () => {
    const vars = new Map<string, any>();
    const ctxStart = createMockContext({ ACTION: 'START' }, vars);
    await stopwatchHandler(ctxStart);

    const ctxLap = createMockContext({ ACTION: 'LAP' }, vars);
    await stopwatchHandler(ctxLap);

    const lap1 = vars.get('!STOPWATCH_LAP1');
    expect(typeof lap1).toBe('number');
    expect(lap1).toBeGreaterThanOrEqual(0);
  });

  it('STOPWATCH ACTION=LAP when not running returns error', async () => {
    const result = await run('STOPWATCH ACTION=LAP');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('not running');
  });

  it('STOPWATCH ACTION=READ returns current elapsed time while running', async () => {
    const macro = [
      'STOPWATCH ACTION=START',
      'STOPWATCH ACTION=READ',
    ].join('\n');

    const result = await run(macro);

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  it('STOPWATCH ACTION=READ returns accumulated time when stopped', async () => {
    const vars = new Map<string, any>();
    const ctxStart = createMockContext({ ACTION: 'START' }, vars);
    await stopwatchHandler(ctxStart);

    const ctxStop = createMockContext({ ACTION: 'STOP' }, vars);
    await stopwatchHandler(ctxStop);

    const ctxRead = createMockContext({ ACTION: 'READ' }, vars);
    const result = await stopwatchHandler(ctxRead);

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    const elapsed = vars.get('!STOPWATCH');
    expect(typeof elapsed).toBe('number');
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });

  it('STOPWATCH ACTION=INVALID returns INVALID_PARAMETER error', async () => {
    // Start first via executor, then test INVALID via direct invocation
    const macro = [
      'STOPWATCH ACTION=START',
      'STOPWATCH ACTION=INVALID',
    ].join('\n');

    const result = await run(macro);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    expect(result.errorMessage).toContain('Invalid STOPWATCH action');
    expect(result.errorMessage).toContain('INVALID');
  });

  it('named stopwatch stores value in !STOPWATCH_<ID> variable via handler', async () => {
    const vars = new Map<string, any>();
    const ctxStart = createMockContext({ ID: 'timer1', ACTION: 'START' }, vars);
    await stopwatchHandler(ctxStart);

    const ctxStop = createMockContext({ ID: 'timer1', ACTION: 'STOP' }, vars);
    await stopwatchHandler(ctxStop);

    const elapsed = vars.get('!STOPWATCH_TIMER1');
    expect(typeof elapsed).toBe('number');
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });

  it('multiple named stopwatches operate independently via handler', async () => {
    const vars = new Map<string, any>();

    await stopwatchHandler(createMockContext({ ID: 'fast', ACTION: 'START' }, vars));
    await stopwatchHandler(createMockContext({ ID: 'slow', ACTION: 'START' }, vars));
    await stopwatchHandler(createMockContext({ ID: 'fast', ACTION: 'STOP' }, vars));
    await stopwatchHandler(createMockContext({ ID: 'slow', ACTION: 'STOP' }, vars));

    const fastElapsed = vars.get('!STOPWATCH_FAST');
    const slowElapsed = vars.get('!STOPWATCH_SLOW');
    expect(typeof fastElapsed).toBe('number');
    expect(typeof slowElapsed).toBe('number');
  });

  it('multiple laps create sequential !STOPWATCH_LAP variables via handler', async () => {
    const vars = new Map<string, any>();

    await stopwatchHandler(createMockContext({ ACTION: 'START' }, vars));
    await stopwatchHandler(createMockContext({ ACTION: 'LAP' }, vars));
    await stopwatchHandler(createMockContext({ ACTION: 'LAP' }, vars));

    const lap1 = vars.get('!STOPWATCH_LAP1');
    const lap2 = vars.get('!STOPWATCH_LAP2');
    expect(typeof lap1).toBe('number');
    expect(typeof lap2).toBe('number');
    // Lap 2 should be >= Lap 1
    expect(lap2).toBeGreaterThanOrEqual(lap1);
  });

  it('STOPWATCH START sets !STOPWATCH to 0', async () => {
    const vars = new Map<string, any>();
    await stopwatchHandler(createMockContext({ ACTION: 'START' }, vars));

    expect(vars.get('!STOPWATCH')).toBe(0);
  });

  it('STOPWATCH STOP returns elapsed as output string', async () => {
    const vars = new Map<string, any>();
    await stopwatchHandler(createMockContext({ ACTION: 'START' }, vars));
    const result = await stopwatchHandler(createMockContext({ ACTION: 'STOP' }, vars));

    expect(result.output).toBeDefined();
    const elapsed = parseInt(result.output!, 10);
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });

  it('STOPWATCH LAP returns lap time as output string', async () => {
    const vars = new Map<string, any>();
    await stopwatchHandler(createMockContext({ ACTION: 'START' }, vars));
    const result = await stopwatchHandler(createMockContext({ ACTION: 'LAP' }, vars));

    expect(result.output).toBeDefined();
    const lapTime = parseInt(result.output!, 10);
    expect(lapTime).toBeGreaterThanOrEqual(0);
  });

  it('STOPWATCH READ returns elapsed as output string', async () => {
    const vars = new Map<string, any>();
    await stopwatchHandler(createMockContext({ ACTION: 'START' }, vars));
    const result = await stopwatchHandler(createMockContext({ ACTION: 'READ' }, vars));

    expect(result.output).toBeDefined();
    const elapsed = parseInt(result.output!, 10);
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });
});

// ===== clearStopwatch / clearAllStopwatches / getStopwatchElapsed Tests =====

describe('Stopwatch helper functions', () => {
  it('clearStopwatch removes a specific stopwatch by ID', async () => {
    await run('STOPWATCH ID=myTimer ACTION=START');

    clearStopwatch('myTimer');

    expect(getStopwatchElapsed('myTimer')).toBe(0);
  });

  it('clearStopwatch without ID removes the default stopwatch', async () => {
    await run('STOPWATCH ACTION=START');

    clearStopwatch();

    expect(getStopwatchElapsed()).toBe(0);
  });

  it('clearAllStopwatches removes all stopwatches', async () => {
    const macro = [
      'STOPWATCH ID=a ACTION=START',
      'STOPWATCH ID=b ACTION=START',
      'STOPWATCH ACTION=START',
    ].join('\n');
    await run(macro);

    clearAllStopwatches();

    expect(getStopwatchElapsed('a')).toBe(0);
    expect(getStopwatchElapsed('b')).toBe(0);
    expect(getStopwatchElapsed()).toBe(0);
  });

  it('getStopwatchElapsed returns 0 for non-existent stopwatch', () => {
    expect(getStopwatchElapsed('nonexistent')).toBe(0);
  });

  it('getStopwatchElapsed returns elapsed time for a running stopwatch', async () => {
    await run('STOPWATCH ACTION=START');

    const elapsed = getStopwatchElapsed();
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });

  it('getStopwatchElapsed returns accumulated time for a stopped stopwatch', async () => {
    const macro = [
      'STOPWATCH ACTION=START',
      'STOPWATCH ACTION=STOP',
    ].join('\n');
    await run(macro);

    const elapsed = getStopwatchElapsed();
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });
});

// ===== EXEC Handler Tests =====

describe('EXEC handler', () => {
  it('succeeds with mock executor returning exit code 0', async () => {
    const mockExecutor = {
      execute: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: 'hello',
        stderr: '',
      }),
    };
    setCmdlineExecutor(mockExecutor);

    const result = await run('EXEC CMD="echo hello"');

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  it('stores !CMDLINE_EXITCODE on success via handler', async () => {
    const mockExecutor = {
      execute: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: 'output text',
        stderr: '',
      }),
    };
    setCmdlineExecutor(mockExecutor);

    const vars = new Map<string, any>();
    const ctx = createMockContext({ CMD: 'echo hello' }, vars);
    await execHandler(ctx);

    expect(vars.get('!CMDLINE_EXITCODE')).toBe(0);
  });

  it('stores !CMDLINE_STDOUT on success via handler', async () => {
    const mockExecutor = {
      execute: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: 'output text',
        stderr: '',
      }),
    };
    setCmdlineExecutor(mockExecutor);

    const vars = new Map<string, any>();
    const ctx = createMockContext({ CMD: 'echo hello' }, vars);
    await execHandler(ctx);

    expect(vars.get('!CMDLINE_STDOUT')).toBe('output text');
  });

  it('stores !CMDLINE_STDERR on success via handler', async () => {
    const mockExecutor = {
      execute: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: 'warning msg',
      }),
    };
    setCmdlineExecutor(mockExecutor);

    const vars = new Map<string, any>();
    const ctx = createMockContext({ CMD: 'echo hello' }, vars);
    await execHandler(ctx);

    expect(vars.get('!CMDLINE_STDERR')).toBe('warning msg');
  });

  it('missing CMD parameter returns MISSING_PARAMETER error', async () => {
    const mockExecutor = {
      execute: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
    };
    setCmdlineExecutor(mockExecutor);

    const result = await run('EXEC');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
  });

  it('no executor configured returns SCRIPT_ERROR', async () => {
    // cmdlineExecutor is null by default (reset in afterEach)
    const result = await run('EXEC CMD="echo hello"');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('executor');
  });

  it('non-zero exit code returns SCRIPT_ERROR', async () => {
    const mockExecutor = {
      execute: vi.fn().mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'command failed',
      }),
    };
    setCmdlineExecutor(mockExecutor);

    const result = await run('EXEC CMD="false"');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('exit code');
  });

  it('non-zero exit code stores exit code in !CMDLINE_EXITCODE via handler', async () => {
    const mockExecutor = {
      execute: vi.fn().mockResolvedValue({
        exitCode: 127,
        stdout: '',
        stderr: 'not found',
      }),
    };
    setCmdlineExecutor(mockExecutor);

    const vars = new Map<string, any>();
    const ctx = createMockContext({ CMD: 'badcmd' }, vars);
    await execHandler(ctx);

    expect(vars.get('!CMDLINE_EXITCODE')).toBe(127);
  });

  it('executor throwing returns SCRIPT_ERROR', async () => {
    const mockExecutor = {
      execute: vi.fn().mockRejectedValue(new Error('execution failed')),
    };
    setCmdlineExecutor(mockExecutor);

    const result = await run('EXEC CMD="crash"');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('execution failed');
  });

  it('executor throwing stores -1 exit code via handler', async () => {
    const mockExecutor = {
      execute: vi.fn().mockRejectedValue(new Error('execution failed')),
    };
    setCmdlineExecutor(mockExecutor);

    const vars = new Map<string, any>();
    const ctx = createMockContext({ CMD: 'crash' }, vars);
    await execHandler(ctx);

    expect(vars.get('!CMDLINE_EXITCODE')).toBe(-1);
  });

  it('executor throwing stores empty stdout and error message in stderr via handler', async () => {
    const mockExecutor = {
      execute: vi.fn().mockRejectedValue(new Error('boom')),
    };
    setCmdlineExecutor(mockExecutor);

    const vars = new Map<string, any>();
    const ctx = createMockContext({ CMD: 'crash' }, vars);
    await execHandler(ctx);

    expect(vars.get('!CMDLINE_STDOUT')).toBe('');
    expect(vars.get('!CMDLINE_STDERR')).toBe('boom');
  });

  it('WAIT=NO parameter is passed to executor', async () => {
    const mockExecutor = {
      execute: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      }),
    };
    setCmdlineExecutor(mockExecutor);

    await run('EXEC CMD="notepad" WAIT=NO');

    expect(mockExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({ wait: false })
    );
  });

  it('WAIT=YES parameter is passed to executor (default)', async () => {
    const mockExecutor = {
      execute: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      }),
    };
    setCmdlineExecutor(mockExecutor);

    await run('EXEC CMD="echo test" WAIT=YES');

    expect(mockExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({ wait: true })
    );
  });

  it('TIMEOUT parameter is passed to executor in milliseconds', async () => {
    const mockExecutor = {
      execute: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      }),
    };
    setCmdlineExecutor(mockExecutor);

    await run('EXEC CMD="slow" TIMEOUT=10');

    expect(mockExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 10000 })
    );
  });

  it('default timeout is 30 seconds (30000ms)', async () => {
    const mockExecutor = {
      execute: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      }),
    };
    setCmdlineExecutor(mockExecutor);

    await run('EXEC CMD="test"');

    expect(mockExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 30000 })
    );
  });

  it('timeout has a minimum of 1000ms', async () => {
    const mockExecutor = {
      execute: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      }),
    };
    setCmdlineExecutor(mockExecutor);

    await run('EXEC CMD="test" TIMEOUT=0.1');

    // 0.1 * 1000 = 100, but Math.max(1000, 100) = 1000
    expect(mockExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 1000 })
    );
  });

  it('variable expansion works in CMD parameter', async () => {
    const mockExecutor = {
      execute: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      }),
    };
    setCmdlineExecutor(mockExecutor);

    // Set a variable then use it in EXEC
    const macro = [
      'SET !VAR1 myfile.txt',
      'EXEC CMD="cat {{!VAR1}}"',
    ].join('\n');

    await run(macro);

    expect(mockExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'cat myfile.txt' })
    );
  });

  it('EXEC handler returns stdout as output on success', async () => {
    const mockExecutor = {
      execute: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: 'output data',
        stderr: '',
      }),
    };
    setCmdlineExecutor(mockExecutor);

    const vars = new Map<string, any>();
    const ctx = createMockContext({ CMD: 'echo test' }, vars);
    const result = await execHandler(ctx);

    expect(result.output).toBe('output data');
  });

  it('no CMD parameter via direct handler returns MISSING_PARAMETER', async () => {
    const ctx = createMockContext({});
    const result = await execHandler(ctx);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
  });

  it('no executor via direct handler returns SCRIPT_ERROR', async () => {
    // Executor is null after afterEach, but we're in a fresh state
    setCmdlineExecutor(null as any);

    const ctx = createMockContext({ CMD: 'echo test' });
    const result = await execHandler(ctx);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
  });
});

// ===== CMDLINE Handler Tests (variable-setting semantics) =====

describe('CMDLINE handler (variable-setting)', () => {
  /**
   * Create a mock context with positional parameters for CMDLINE.
   * CMDLINE uses positional params: first key = variable name, second key = value.
   */
  function createCmdlineMockContext(
    positionalParams: string[],
    vars: Map<string, any> = new Map(),
  ): any {
    const mockLogs: Array<{ level: string; message: string }> = [];
    return {
      command: {
        type: 'CMDLINE',
        parameters: positionalParams.map(p => ({
          key: p,
          value: 'true',
          rawValue: p,
          variables: [],
        })),
        raw: `CMDLINE ${positionalParams.join(' ')}`,
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
        const found = positionalParams.find(p => p.toUpperCase() === upperKey);
        return found || undefined;
      },
      getRequiredParam: (key: string) => {
        const upperKey = key.toUpperCase();
        const found = positionalParams.find(p => p.toUpperCase() === upperKey);
        if (!found) throw new Error(`Missing required parameter: ${key}`);
        return found;
      },
      expand: (t: string) => t,
      log: (level: string, message: string) => mockLogs.push({ level, message }),
      _logs: mockLogs,
      _vars: vars,
    };
  }

  it('sets !VAR1 to a string value', async () => {
    const vars = new Map<string, any>();
    const ctx = createCmdlineMockContext(['!VAR1', 'hello'], vars);
    const result = await cmdlineHandler(ctx);

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    expect(vars.get('!VAR1')).toBe('hello');
  });

  it('sets !VAR0 to a numeric string', async () => {
    const vars = new Map<string, any>();
    const ctx = createCmdlineMockContext(['!VAR0', '42'], vars);
    const result = await cmdlineHandler(ctx);

    expect(result.success).toBe(true);
    expect(vars.get('!VAR0')).toBe('42');
  });

  it('sets !TIMEOUT to a numeric value', async () => {
    const vars = new Map<string, any>();
    const ctx = createCmdlineMockContext(['!TIMEOUT', '30'], vars);
    const result = await cmdlineHandler(ctx);

    expect(result.success).toBe(true);
    expect(vars.get('!TIMEOUT')).toBe(30);
  });

  it('sets !LOOP to an integer value', async () => {
    const vars = new Map<string, any>();
    const ctx = createCmdlineMockContext(['!LOOP', '5'], vars);
    const result = await cmdlineHandler(ctx);

    expect(result.success).toBe(true);
    expect(vars.get('!LOOP')).toBe(5);
  });

  it('sets !DATASOURCE to a file path', async () => {
    const vars = new Map<string, any>();
    const ctx = createCmdlineMockContext(['!DATASOURCE', 'data.csv'], vars);
    const result = await cmdlineHandler(ctx);

    expect(result.success).toBe(true);
    expect(vars.get('!DATASOURCE')).toBe('data.csv');
  });

  it('returns INVALID_PARAMETER for unsupported system variable', async () => {
    const vars = new Map<string, any>();
    const ctx = createCmdlineMockContext(['!URLCURRENT', 'http://test.com'], vars);
    const result = await cmdlineHandler(ctx);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    expect(result.errorMessage).toContain('Unsupported system variable');
  });

  it('returns MISSING_PARAMETER when less than 2 params', async () => {
    const vars = new Map<string, any>();
    const ctx = createCmdlineMockContext(['!VAR1'], vars);
    const result = await cmdlineHandler(ctx);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
  });

  it('returns MISSING_PARAMETER when no params', async () => {
    const vars = new Map<string, any>();
    const ctx = createCmdlineMockContext([], vars);
    const result = await cmdlineHandler(ctx);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
  });

  it('sets existing user variable', async () => {
    const vars = new Map<string, any>();
    // Pre-set the variable to simulate it was created by SET
    vars.set('MYVAR', 'oldvalue');
    const ctx = createCmdlineMockContext(['myvar', 'newvalue'], vars);
    const result = await cmdlineHandler(ctx);

    expect(result.success).toBe(true);
    expect(vars.get('MYVAR')).toBe('newvalue');
  });

  it('returns SCRIPT_ERROR for non-existent user variable', async () => {
    const vars = new Map<string, any>();
    const ctx = createCmdlineMockContext(['nonexistent', 'somevalue'], vars);
    const result = await cmdlineHandler(ctx);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('Unknown variable');
  });

  it('returns INVALID_PARAMETER for invalid timeout value', async () => {
    const vars = new Map<string, any>();
    const ctx = createCmdlineMockContext(['!TIMEOUT', 'abc'], vars);
    const result = await cmdlineHandler(ctx);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    expect(result.errorMessage).toContain('Invalid timeout');
  });

  it('returns INVALID_PARAMETER for zero timeout', async () => {
    const vars = new Map<string, any>();
    const ctx = createCmdlineMockContext(['!TIMEOUT', '0'], vars);
    const result = await cmdlineHandler(ctx);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
  });

  it('returns INVALID_PARAMETER for invalid loop value', async () => {
    const vars = new Map<string, any>();
    const ctx = createCmdlineMockContext(['!LOOP', 'notanumber'], vars);
    const result = await cmdlineHandler(ctx);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    expect(result.errorMessage).toContain('Invalid loop');
  });

  it('sets all !VAR0 through !VAR9', async () => {
    for (let i = 0; i <= 9; i++) {
      const vars = new Map<string, any>();
      const ctx = createCmdlineMockContext([`!VAR${i}`, `value${i}`], vars);
      const result = await cmdlineHandler(ctx);

      expect(result.success).toBe(true);
      expect(vars.get(`!VAR${i}`)).toBe(`value${i}`);
    }
  });

  it('CMDLINE via executor pipeline sets !VAR1', async () => {
    const result = await run('CMDLINE !VAR1 testvalue');

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  it('CMDLINE via executor pipeline fails for unsupported system var', async () => {
    const result = await run('CMDLINE !EXTRACT somedata');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
  });
});

// ===== setCmdlineExecutor / getCmdlineExecutor Tests =====

describe('setCmdlineExecutor / getCmdlineExecutor', () => {
  it('getCmdlineExecutor returns null when not set', () => {
    expect(getCmdlineExecutor()).toBeNull();
  });

  it('setCmdlineExecutor sets the executor', () => {
    const mockExecutor = { execute: vi.fn() };
    setCmdlineExecutor(mockExecutor);

    expect(getCmdlineExecutor()).toBe(mockExecutor);
  });

  it('setCmdlineExecutor(null) clears the executor', () => {
    const mockExecutor = { execute: vi.fn() };
    setCmdlineExecutor(mockExecutor);
    setCmdlineExecutor(null as any);

    expect(getCmdlineExecutor()).toBeNull();
  });
});

// ===== DISCONNECT Handler Tests =====

describe('DISCONNECT handler', () => {
  it('succeeds with mock network manager returning true', async () => {
    const mockManager = {
      disconnect: vi.fn().mockResolvedValue(true),
      redial: vi.fn().mockResolvedValue(true),
    };
    setNetworkManager(mockManager);

    const result = await run('DISCONNECT');

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    expect(mockManager.disconnect).toHaveBeenCalledOnce();
  });

  it('returns SCRIPT_ERROR when network manager returns false', async () => {
    const mockManager = {
      disconnect: vi.fn().mockResolvedValue(false),
      redial: vi.fn().mockResolvedValue(true),
    };
    setNetworkManager(mockManager);

    const result = await run('DISCONNECT');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('disconnect');
  });

  it('returns SCRIPT_ERROR when network manager throws', async () => {
    const mockManager = {
      disconnect: vi.fn().mockRejectedValue(new Error('network error')),
      redial: vi.fn().mockResolvedValue(true),
    };
    setNetworkManager(mockManager);

    const result = await run('DISCONNECT');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('network error');
  });

  it('returns SCRIPT_ERROR when no network manager configured', async () => {
    // networkManager is null by default
    const result = await run('DISCONNECT');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('network manager');
  });

  it('via direct handler invocation succeeds when manager returns true', async () => {
    const mockManager = {
      disconnect: vi.fn().mockResolvedValue(true),
      redial: vi.fn().mockResolvedValue(true),
    };
    setNetworkManager(mockManager);

    const ctx = createMockContext();
    const result = await disconnectHandler(ctx);

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  it('via direct handler invocation fails when manager returns false', async () => {
    const mockManager = {
      disconnect: vi.fn().mockResolvedValue(false),
      redial: vi.fn().mockResolvedValue(true),
    };
    setNetworkManager(mockManager);

    const ctx = createMockContext();
    const result = await disconnectHandler(ctx);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
  });

  it('via direct handler invocation catches thrown errors', async () => {
    const mockManager = {
      disconnect: vi.fn().mockRejectedValue(new Error('adapter failure')),
      redial: vi.fn().mockResolvedValue(true),
    };
    setNetworkManager(mockManager);

    const ctx = createMockContext();
    const result = await disconnectHandler(ctx);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('adapter failure');
  });
});

// ===== REDIAL Handler Tests =====

describe('REDIAL handler', () => {
  it('succeeds with mock network manager returning true', async () => {
    const mockManager = {
      disconnect: vi.fn().mockResolvedValue(true),
      redial: vi.fn().mockResolvedValue(true),
    };
    setNetworkManager(mockManager);

    const result = await run('REDIAL');

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    expect(mockManager.redial).toHaveBeenCalledOnce();
  });

  it('REDIAL CONNECTION=vpn1 succeeds', async () => {
    const mockManager = {
      disconnect: vi.fn().mockResolvedValue(true),
      redial: vi.fn().mockResolvedValue(true),
    };
    setNetworkManager(mockManager);

    const result = await run('REDIAL CONNECTION=vpn1');

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    expect(mockManager.redial).toHaveBeenCalledOnce();
  });

  it('returns SCRIPT_ERROR when network manager returns false', async () => {
    const mockManager = {
      disconnect: vi.fn().mockResolvedValue(true),
      redial: vi.fn().mockResolvedValue(false),
    };
    setNetworkManager(mockManager);

    const result = await run('REDIAL');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('redial');
  });

  it('returns SCRIPT_ERROR when network manager throws', async () => {
    const mockManager = {
      disconnect: vi.fn().mockResolvedValue(true),
      redial: vi.fn().mockRejectedValue(new Error('connection timeout')),
    };
    setNetworkManager(mockManager);

    const result = await run('REDIAL');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('connection timeout');
  });

  it('returns SCRIPT_ERROR when no network manager configured', async () => {
    const result = await run('REDIAL');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('network manager');
  });

  it('via direct handler invocation succeeds when manager returns true', async () => {
    const mockManager = {
      disconnect: vi.fn().mockResolvedValue(true),
      redial: vi.fn().mockResolvedValue(true),
    };
    setNetworkManager(mockManager);

    const ctx = createMockContext();
    const result = await redialHandler(ctx);

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  it('via direct handler invocation fails when manager returns false', async () => {
    const mockManager = {
      disconnect: vi.fn().mockResolvedValue(true),
      redial: vi.fn().mockResolvedValue(false),
    };
    setNetworkManager(mockManager);

    const ctx = createMockContext();
    const result = await redialHandler(ctx);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
  });

  it('via direct handler invocation catches thrown errors', async () => {
    const mockManager = {
      disconnect: vi.fn().mockResolvedValue(true),
      redial: vi.fn().mockRejectedValue(new Error('vpn failure')),
    };
    setNetworkManager(mockManager);

    const ctx = createMockContext();
    const result = await redialHandler(ctx);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('vpn failure');
  });

  it('REDIAL CONNECTION param is logged via handler', async () => {
    const mockManager = {
      disconnect: vi.fn().mockResolvedValue(true),
      redial: vi.fn().mockResolvedValue(true),
    };
    setNetworkManager(mockManager);

    const ctx = createMockContext({ CONNECTION: 'myVpn' });
    await redialHandler(ctx);

    const infoLogs = ctx._logs.filter(
      (l: any) => l.level === 'info' && l.message.includes('myVpn')
    );
    expect(infoLogs.length).toBeGreaterThan(0);
  });
});

// ===== setNetworkManager / getNetworkManager Tests =====

describe('setNetworkManager / getNetworkManager', () => {
  it('getNetworkManager returns null when not set', () => {
    expect(getNetworkManager()).toBeNull();
  });

  it('setNetworkManager sets the manager', () => {
    const mockManager = {
      disconnect: vi.fn(),
      redial: vi.fn(),
    };
    setNetworkManager(mockManager);

    expect(getNetworkManager()).toBe(mockManager);
  });

  it('setNetworkManager(null) clears the manager', () => {
    const mockManager = {
      disconnect: vi.fn(),
      redial: vi.fn(),
    };
    setNetworkManager(mockManager);
    setNetworkManager(null as any);

    expect(getNetworkManager()).toBeNull();
  });
});

// ===== registerSystemHandlers Tests =====

describe('registerSystemHandlers', () => {
  it('registers all 6 system command handlers', () => {
    const registered: string[] = [];
    const mockRegisterFn = (type: string, _handler: any) => {
      registered.push(type);
    };

    registerSystemHandlers(mockRegisterFn as any);

    expect(registered).toContain('VERSION');
    expect(registered).toContain('STOPWATCH');
    expect(registered).toContain('CMDLINE');
    expect(registered).toContain('EXEC');
    expect(registered).toContain('DISCONNECT');
    expect(registered).toContain('REDIAL');
    expect(registered).toHaveLength(6);
  });

  it('registers actual handler functions (not undefined)', () => {
    const handlers: Array<{ type: string; handler: any }> = [];
    const mockRegisterFn = (type: string, handler: any) => {
      handlers.push({ type, handler });
    };

    registerSystemHandlers(mockRegisterFn as any);

    for (const { handler } of handlers) {
      expect(typeof handler).toBe('function');
    }
  });

  it('registered VERSION handler matches versionHandler export', () => {
    const handlers = new Map<string, any>();
    const mockRegisterFn = (type: string, handler: any) => {
      handlers.set(type, handler);
    };

    registerSystemHandlers(mockRegisterFn as any);

    expect(handlers.get('VERSION')).toBe(versionHandler);
  });

  it('registered STOPWATCH handler matches stopwatchHandler export', () => {
    const handlers = new Map<string, any>();
    const mockRegisterFn = (type: string, handler: any) => {
      handlers.set(type, handler);
    };

    registerSystemHandlers(mockRegisterFn as any);

    expect(handlers.get('STOPWATCH')).toBe(stopwatchHandler);
  });

  it('registered CMDLINE handler matches cmdlineHandler export', () => {
    const handlers = new Map<string, any>();
    const mockRegisterFn = (type: string, handler: any) => {
      handlers.set(type, handler);
    };

    registerSystemHandlers(mockRegisterFn as any);

    expect(handlers.get('CMDLINE')).toBe(cmdlineHandler);
  });

  it('registered EXEC handler matches execHandler export', () => {
    const handlers = new Map<string, any>();
    const mockRegisterFn = (type: string, handler: any) => {
      handlers.set(type, handler);
    };

    registerSystemHandlers(mockRegisterFn as any);

    expect(handlers.get('EXEC')).toBe(execHandler);
  });

  it('registered DISCONNECT handler matches disconnectHandler export', () => {
    const handlers = new Map<string, any>();
    const mockRegisterFn = (type: string, handler: any) => {
      handlers.set(type, handler);
    };

    registerSystemHandlers(mockRegisterFn as any);

    expect(handlers.get('DISCONNECT')).toBe(disconnectHandler);
  });

  it('registered REDIAL handler matches redialHandler export', () => {
    const handlers = new Map<string, any>();
    const mockRegisterFn = (type: string, handler: any) => {
      handlers.set(type, handler);
    };

    registerSystemHandlers(mockRegisterFn as any);

    expect(handlers.get('REDIAL')).toBe(redialHandler);
  });
});

// ===== Exported Handler References =====

describe('Exported handler references', () => {
  it('versionHandler is a function', () => {
    expect(typeof versionHandler).toBe('function');
  });

  it('stopwatchHandler is a function', () => {
    expect(typeof stopwatchHandler).toBe('function');
  });

  it('cmdlineHandler is a function', () => {
    expect(typeof cmdlineHandler).toBe('function');
  });

  it('execHandler is a function', () => {
    expect(typeof execHandler).toBe('function');
  });

  it('disconnectHandler is a function', () => {
    expect(typeof disconnectHandler).toBe('function');
  });

  it('redialHandler is a function', () => {
    expect(typeof redialHandler).toBe('function');
  });
});
