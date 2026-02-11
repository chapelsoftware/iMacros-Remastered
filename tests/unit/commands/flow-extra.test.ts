/**
 * Extra Unit Tests for Flow Control Command Handlers
 *
 * Targets uncovered branches in shared/src/commands/flow.ts:
 * - Line 85:  getFlowControlUI() returns activeUI
 * - Line 173: executeWithTimeoutRetry fallback return after for loop
 * - Line 205: pauseAwareDelay pause-aware loop (ExecutionStatus.PAUSED)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  waitHandler,
  pauseHandler,
  promptHandler,
  setFlowControlUI,
  getFlowControlUI,
  resetFlowControlUI,
  getTimeoutRetryConfig,
  executeWithTimeoutRetry,
  flowHandlers,
  registerFlowHandlers,
  FlowControlUI,
} from '../../../shared/src/commands/flow';
import { IMACROS_ERROR_CODES, ExecutionStatus } from '../../../shared/src/executor';

// ===== Test Helpers =====

function createMockContext(
  params: Record<string, string> = {},
  vars: Map<string, any> = new Map(),
): any {
  const mockLogs: Array<{ level: string; message: string }> = [];
  let status = 'running';
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
      getStatus: () => status,
      _setStatus: (s: string) => { status = s; },
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

// ===== Tests =====

describe('Flow Control - Extra Coverage Tests', () => {
  beforeEach(() => {
    resetFlowControlUI();
  });

  afterEach(() => {
    resetFlowControlUI();
    vi.useRealTimers();
  });

  // ===== getFlowControlUI (line 85) =====

  describe('getFlowControlUI', () => {
    it('should return the default UI when nothing has been set', () => {
      const ui = getFlowControlUI();
      expect(ui).toBeDefined();
      expect(typeof ui.showPause).toBe('function');
      expect(typeof ui.showPrompt).toBe('function');
      expect(typeof ui.showAlert).toBe('function');
    });

    it('should return the custom UI after setFlowControlUI', () => {
      const customUI: FlowControlUI = {
        showPause: vi.fn().mockResolvedValue(undefined),
        showPrompt: vi.fn().mockResolvedValue('test'),
        showAlert: vi.fn().mockResolvedValue(undefined),
      };
      setFlowControlUI(customUI);

      const result = getFlowControlUI();
      expect(result).toBe(customUI);
    });

    it('should return the default UI after resetFlowControlUI', async () => {
      const customUI: FlowControlUI = {
        showPause: vi.fn(),
        showPrompt: vi.fn(),
        showAlert: vi.fn(),
      };
      setFlowControlUI(customUI);
      resetFlowControlUI();

      const result = getFlowControlUI();
      expect(result).not.toBe(customUI);
      // Verify it is functional (default returns empty string for prompt)
      await expect(result.showPrompt('test')).resolves.toBe('');
    });
  });

  // ===== setFlowControlUI / resetFlowControlUI =====

  describe('setFlowControlUI and resetFlowControlUI', () => {
    it('should replace and then restore the UI', async () => {
      const customUI: FlowControlUI = {
        showPause: vi.fn().mockResolvedValue(undefined),
        showPrompt: vi.fn().mockResolvedValue('custom-input'),
        showAlert: vi.fn().mockResolvedValue(undefined),
      };
      setFlowControlUI(customUI);
      expect(getFlowControlUI()).toBe(customUI);

      resetFlowControlUI();
      expect(getFlowControlUI()).not.toBe(customUI);

      // Default showPrompt returns defaultValue or empty string
      const defaultResult = await getFlowControlUI().showPrompt('msg', 'fallback');
      expect(defaultResult).toBe('fallback');

      const noDefaultResult = await getFlowControlUI().showPrompt('msg');
      expect(noDefaultResult).toBe('');
    });
  });

  // ===== getTimeoutRetryConfig =====

  describe('getTimeoutRetryConfig', () => {
    it('should use numeric !TIMEOUT_TAG directly', () => {
      const vars = new Map<string, any>([['!TIMEOUT_TAG', 5]]);
      const ctx = createMockContext({}, vars);
      const config = getTimeoutRetryConfig(ctx);

      expect(config.maxRetries).toBe(5);
      expect(config.retryDelayMs).toBe(1000);
      expect(config.currentRetry).toBe(0);
    });

    it('should parse string !TIMEOUT_TAG', () => {
      const vars = new Map<string, any>([['!TIMEOUT_TAG', '3']]);
      const ctx = createMockContext({}, vars);
      const config = getTimeoutRetryConfig(ctx);

      expect(config.maxRetries).toBe(3);
    });

    it('should parse fractional string !TIMEOUT_TAG and ceil', () => {
      const vars = new Map<string, any>([['!TIMEOUT_TAG', '2.3']]);
      const ctx = createMockContext({}, vars);
      const config = getTimeoutRetryConfig(ctx);

      expect(config.maxRetries).toBe(3); // ceil(2.3) = 3
    });

    it('should default to 10 when !TIMEOUT_TAG is not set', () => {
      const ctx = createMockContext();
      const config = getTimeoutRetryConfig(ctx);

      expect(config.maxRetries).toBe(10);
    });

    it('should default to 10 when !TIMEOUT_TAG is a non-number, non-string type', () => {
      const vars = new Map<string, any>([['!TIMEOUT_TAG', true]]);
      const ctx = createMockContext({}, vars);
      const config = getTimeoutRetryConfig(ctx);

      expect(config.maxRetries).toBe(10);
    });

    it('should clamp to at least 1 retry for very small values', () => {
      const vars = new Map<string, any>([['!TIMEOUT_TAG', 0.01]]);
      const ctx = createMockContext({}, vars);
      const config = getTimeoutRetryConfig(ctx);

      expect(config.maxRetries).toBe(1); // max(1, ceil(0.01)) = 1
    });
  });

  // ===== executeWithTimeoutRetry =====

  describe('executeWithTimeoutRetry', () => {
    it('should return success on first try', async () => {
      const vars = new Map<string, any>([['!TIMEOUT_TAG', 3]]);
      const ctx = createMockContext({}, vars);

      const operation = vi.fn().mockResolvedValue({
        success: true,
        errorCode: IMACROS_ERROR_CODES.OK,
      });

      const result = await executeWithTimeoutRetry(ctx, operation);

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable error then succeed', async () => {
      vi.useFakeTimers();
      const vars = new Map<string, any>([['!TIMEOUT_TAG', 5]]);
      const ctx = createMockContext({}, vars);

      let callCount = 0;
      const operation = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          return {
            success: false,
            errorCode: IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND,
            errorMessage: 'Element not found',
          };
        }
        return {
          success: true,
          errorCode: IMACROS_ERROR_CODES.OK,
        };
      });

      const promise = executeWithTimeoutRetry(ctx, operation);
      // Advance timers to let retries complete
      await vi.advanceTimersByTimeAsync(10000);
      const result = await promise;

      expect(result.success).toBe(true);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should return immediately on non-retryable error', async () => {
      const vars = new Map<string, any>([['!TIMEOUT_TAG', 5]]);
      const ctx = createMockContext({}, vars);

      const operation = vi.fn().mockResolvedValue({
        success: false,
        errorCode: IMACROS_ERROR_CODES.SYNTAX_ERROR,
        errorMessage: 'Syntax error in command',
      });

      const result = await executeWithTimeoutRetry(ctx, operation);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SYNTAX_ERROR);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should exhaust retries and return timeout error (line 173 area)', async () => {
      vi.useFakeTimers();
      const vars = new Map<string, any>([['!TIMEOUT_TAG', 2]]);
      const ctx = createMockContext({}, vars);

      const operation = vi.fn().mockResolvedValue({
        success: false,
        errorCode: IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND,
        errorMessage: 'Element not found on page',
      });

      const promise = executeWithTimeoutRetry(ctx, operation);
      await vi.advanceTimersByTimeAsync(10000);
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.TIMEOUT);
      expect(result.errorMessage).toContain('Timeout waiting for element');
      expect(result.errorMessage).toContain('Element not found on page');
    });

    it('should use custom isRetryableError predicate', async () => {
      vi.useFakeTimers();
      const vars = new Map<string, any>([['!TIMEOUT_TAG', 3]]);
      const ctx = createMockContext({}, vars);

      const operation = vi.fn().mockResolvedValue({
        success: false,
        errorCode: IMACROS_ERROR_CODES.SYNTAX_ERROR,
        errorMessage: 'Custom retryable',
      });

      // Custom predicate that treats SYNTAX_ERROR as retryable
      const isRetryable = (r: any) => r.errorCode === IMACROS_ERROR_CODES.SYNTAX_ERROR;

      const promise = executeWithTimeoutRetry(ctx, operation, isRetryable);
      await vi.advanceTimersByTimeAsync(10000);
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.TIMEOUT);
      // Should have retried multiple times
      expect(operation.mock.calls.length).toBeGreaterThan(1);
    });

    it('should handle timeout retry with TIMEOUT error code', async () => {
      vi.useFakeTimers();
      const vars = new Map<string, any>([['!TIMEOUT_TAG', 1]]);
      const ctx = createMockContext({}, vars);

      const operation = vi.fn().mockResolvedValue({
        success: false,
        errorCode: IMACROS_ERROR_CODES.TIMEOUT,
        errorMessage: 'Timed out',
      });

      const promise = executeWithTimeoutRetry(ctx, operation);
      await vi.advanceTimersByTimeAsync(5000);
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.TIMEOUT);
    });
  });

  // ===== waitHandler =====

  describe('waitHandler', () => {
    it('should succeed with valid SECONDS', async () => {
      vi.useFakeTimers();
      const ctx = createMockContext({ SECONDS: '0.1' });

      const promise = waitHandler(ctx);
      await vi.advanceTimersByTimeAsync(500);
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    });

    it('should fail when SECONDS is missing', async () => {
      const ctx = createMockContext({});

      const result = await waitHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(result.errorMessage).toContain('SECONDS');
    });

    it('should fail when SECONDS is invalid (non-numeric)', async () => {
      const ctx = createMockContext({ SECONDS: 'abc' });

      const result = await waitHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(result.errorMessage).toContain('Invalid SECONDS');
    });

    it('should cap when SECONDS exceeds !TIMEOUT_STEP', async () => {
      vi.useFakeTimers();
      const vars = new Map<string, any>([['!TIMEOUT_STEP', 0.01]]);
      const ctx = createMockContext({ SECONDS: '10' }, vars);

      const promise = waitHandler(ctx);
      await vi.advanceTimersByTimeAsync(500);
      const result = await promise;

      expect(result.success).toBe(true);
      // Should have logged a warning about capping
      const warnLogs = ctx._logs.filter((l: any) => l.level === 'warn');
      expect(warnLogs.length).toBeGreaterThan(0);
      expect(warnLogs[0].message).toContain('exceeds !TIMEOUT_STEP');
    });

    it('should parse string !TIMEOUT_STEP', async () => {
      vi.useFakeTimers();
      const vars = new Map<string, any>([['!TIMEOUT_STEP', '0.01']]);
      const ctx = createMockContext({ SECONDS: '5' }, vars);

      const promise = waitHandler(ctx);
      await vi.advanceTimersByTimeAsync(500);
      const result = await promise;

      expect(result.success).toBe(true);
      const warnLogs = ctx._logs.filter((l: any) => l.level === 'warn');
      expect(warnLogs.length).toBeGreaterThan(0);
    });

    it('should quantize to 100ms increments with 10ms floor', async () => {
      vi.useFakeTimers();
      // 0.001 seconds = 1ms, quantized to max(10, round(1/100)*100) = max(10, 0) = 10ms
      const ctx = createMockContext({ SECONDS: '0.001' });

      const promise = waitHandler(ctx);
      await vi.advanceTimersByTimeAsync(100);
      const result = await promise;

      expect(result.success).toBe(true);
    });
  });

  // ===== pauseHandler =====

  describe('pauseHandler', () => {
    it('should succeed when user confirms pause dialog', async () => {
      const customUI: FlowControlUI = {
        showPause: vi.fn().mockResolvedValue(undefined),
        showPrompt: vi.fn(),
        showAlert: vi.fn(),
      };
      setFlowControlUI(customUI);

      const ctx = createMockContext();
      const result = await pauseHandler(ctx);

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(customUI.showPause).toHaveBeenCalledWith(
        'Macro execution paused. Click OK to continue.',
      );
    });

    it('should return USER_ABORT when user cancels pause dialog', async () => {
      const customUI: FlowControlUI = {
        showPause: vi.fn().mockRejectedValue(new Error('User cancelled')),
        showPrompt: vi.fn(),
        showAlert: vi.fn(),
      };
      setFlowControlUI(customUI);

      const ctx = createMockContext();
      const result = await pauseHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.USER_ABORT);
      expect(result.stopExecution).toBe(true);
    });
  });

  // ===== promptHandler =====

  describe('promptHandler', () => {
    it('should use named params (MESSAGE/VAR/DEFAULT)', async () => {
      const customUI: FlowControlUI = {
        showPause: vi.fn(),
        showPrompt: vi.fn().mockResolvedValue('user-typed'),
        showAlert: vi.fn(),
      };
      setFlowControlUI(customUI);

      const vars = new Map<string, any>();
      const ctx = createMockContext(
        { MESSAGE: 'Enter name', VAR: '!VAR1', DEFAULT: 'John' },
        vars,
      );

      const result = await promptHandler(ctx);

      expect(result.success).toBe(true);
      expect(result.output).toBe('user-typed');
      expect(customUI.showPrompt).toHaveBeenCalledWith('Enter name', 'John');
      expect(vars.get('!VAR1')).toBe('user-typed');
    });

    it('should handle positional params', async () => {
      const customUI: FlowControlUI = {
        showPause: vi.fn(),
        showPrompt: vi.fn().mockResolvedValue('answer'),
        showAlert: vi.fn(),
      };
      setFlowControlUI(customUI);

      const vars = new Map<string, any>();
      // Positional params: parser puts token text in key
      const ctx: any = {
        command: {
          type: 'PROMPT',
          parameters: [
            { key: 'Enter your name', value: 'true', rawValue: 'true', variables: [] },
            { key: '!VAR1', value: 'true', rawValue: 'true', variables: [] },
            { key: 'DefaultName', value: 'true', rawValue: 'true', variables: [] },
          ],
          raw: 'PROMPT "Enter your name" !VAR1 DefaultName',
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
          getStatus: () => 'running',
        },
        getParam: (key: string) => {
          // Named params not present in positional mode
          if (['MESSAGE', 'VAR', 'DEFAULT'].includes(key.toUpperCase())) return undefined;
          return undefined;
        },
        getRequiredParam: (key: string) => {
          throw new Error(`Missing required parameter: ${key}`);
        },
        expand: (t: string) => t,
        log: vi.fn(),
      };

      const result = await promptHandler(ctx);

      expect(result.success).toBe(true);
      expect(result.output).toBe('answer');
      expect(customUI.showPrompt).toHaveBeenCalledWith('Enter your name', 'DefaultName');
      expect(vars.get('!VAR1')).toBe('answer');
    });

    it('should show alert-only when no VAR is specified', async () => {
      const customUI: FlowControlUI = {
        showPause: vi.fn(),
        showPrompt: vi.fn(),
        showAlert: vi.fn().mockResolvedValue(undefined),
      };
      setFlowControlUI(customUI);

      const ctx = createMockContext({ MESSAGE: 'Hello!' });

      const result = await promptHandler(ctx);

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(customUI.showAlert).toHaveBeenCalledWith('Hello!');
      expect(customUI.showPrompt).not.toHaveBeenCalled();
    });

    it('should handle user cancel on prompt (returns success with no output)', async () => {
      const customUI: FlowControlUI = {
        showPause: vi.fn(),
        showPrompt: vi.fn().mockRejectedValue(new Error('Cancelled')),
        showAlert: vi.fn(),
      };
      setFlowControlUI(customUI);

      const vars = new Map<string, any>();
      const ctx = createMockContext(
        { MESSAGE: 'Enter value', VAR: '!VAR1' },
        vars,
      );

      const result = await promptHandler(ctx);

      // Cancel continues silently
      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(result.output).toBeUndefined();
      // Variable should NOT be set
      expect(vars.has('!VAR1')).toBe(false);
    });

    it('should fail when message is missing', async () => {
      const ctx = createMockContext({});

      const result = await promptHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(result.errorMessage).toContain('message');
    });
  });

  // ===== flowHandlers and registerFlowHandlers =====

  describe('flowHandlers map and registerFlowHandlers', () => {
    it('should contain WAIT, PAUSE, and PROMPT handlers', () => {
      expect(flowHandlers.WAIT).toBe(waitHandler);
      expect(flowHandlers.PAUSE).toBe(pauseHandler);
      expect(flowHandlers.PROMPT).toBe(promptHandler);
    });

    it('should register all handlers via registerFlowHandlers', () => {
      const registered: Array<{ type: string; handler: any }> = [];
      const registerFn = vi.fn((type: string, handler: any) => {
        registered.push({ type, handler });
      });

      registerFlowHandlers(registerFn);

      expect(registerFn).toHaveBeenCalledTimes(3);
      const types = registered.map((r) => r.type);
      expect(types).toContain('WAIT');
      expect(types).toContain('PAUSE');
      expect(types).toContain('PROMPT');
    });
  });

  // ===== pauseAwareDelay with PAUSED status (line 205) =====

  describe('WAIT with pauseAwareDelay pause-aware behavior (line 205)', () => {
    it('should wait while status is PAUSED then continue when RUNNING', async () => {
      vi.useFakeTimers();

      // getStatus returns PAUSED for first 3 calls, then RUNNING
      let callCount = 0;
      const getStatusMock = vi.fn(() => {
        callCount++;
        if (callCount <= 3) {
          return ExecutionStatus.PAUSED;
        }
        return ExecutionStatus.RUNNING;
      });

      const vars = new Map<string, any>();
      const ctx: any = {
        command: {
          type: 'WAIT',
          parameters: [
            { key: 'SECONDS', value: '0.1', rawValue: '0.1', variables: [] },
          ],
          raw: 'WAIT SECONDS=0.1',
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
          getStatus: getStatusMock,
        },
        getParam: (key: string) => {
          if (key.toUpperCase() === 'SECONDS') return '0.1';
          return undefined;
        },
        getRequiredParam: (key: string) => {
          if (key.toUpperCase() === 'SECONDS') return '0.1';
          throw new Error(`Missing required parameter: ${key}`);
        },
        expand: (t: string) => t,
        log: vi.fn(),
      };

      const promise = waitHandler(ctx);

      // Advance time to let the pause-aware delay run through
      // The while loop checks getStatus, sees PAUSED, delays 50ms, checks again
      // After 3 PAUSED returns, it returns RUNNING and proceeds
      await vi.advanceTimersByTimeAsync(1000);

      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      // getStatus should have been called at least once with PAUSED returned
      expect(getStatusMock).toHaveBeenCalled();
      const pausedCalls = getStatusMock.mock.results.filter(
        (r: any) => r.value === ExecutionStatus.PAUSED,
      );
      expect(pausedCalls.length).toBeGreaterThan(0);
    });

    it('should handle status being PAUSED for the entire first chunk then resuming', async () => {
      vi.useFakeTimers();

      // First 5 calls PAUSED, then RUNNING forever
      let callCount = 0;
      const getStatusMock = vi.fn(() => {
        callCount++;
        if (callCount <= 5) {
          return ExecutionStatus.PAUSED;
        }
        return ExecutionStatus.RUNNING;
      });

      const vars = new Map<string, any>();
      const ctx: any = {
        command: {
          type: 'WAIT',
          parameters: [
            { key: 'SECONDS', value: '0.1', rawValue: '0.1', variables: [] },
          ],
          raw: 'WAIT SECONDS=0.1',
          lineNumber: 1,
          variables: [],
        },
        variables: {
          get: (name: string) => vars.get(name.toUpperCase()) ?? null,
          set: (name: string, value: any) => {
            vars.set(name.toUpperCase(), value);
          },
          expand: (t: string) => ({ expanded: t, variables: [] }),
        },
        state: {
          setVariable: (name: string, value: any) => vars.set(name.toUpperCase(), value),
          getVariable: (name: string) => vars.get(name.toUpperCase()) ?? null,
          getStatus: getStatusMock,
        },
        getParam: (key: string) => {
          if (key.toUpperCase() === 'SECONDS') return '0.1';
          return undefined;
        },
        getRequiredParam: (key: string) => {
          if (key.toUpperCase() === 'SECONDS') return '0.1';
          throw new Error(`Missing required parameter: ${key}`);
        },
        expand: (t: string) => t,
        log: vi.fn(),
      };

      const promise = waitHandler(ctx);
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;

      expect(result.success).toBe(true);
      // Verify that pause loop was entered
      const pausedCalls = getStatusMock.mock.results.filter(
        (r: any) => r.value === ExecutionStatus.PAUSED,
      );
      expect(pausedCalls.length).toBe(5);
    });
  });
});
