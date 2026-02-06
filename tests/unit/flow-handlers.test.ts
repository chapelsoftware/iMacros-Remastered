/**
 * Unit Tests for Flow Control Command Handlers
 *
 * Tests the flow control handlers in shared/src/commands/flow.ts:
 * - WAIT: Delay execution for specified seconds
 * - PAUSE: Show dialog and wait for user confirmation
 * - PROMPT: Show input dialog and store result in variable
 * - setFlowControlUI / getFlowControlUI / resetFlowControlUI
 * - getTimeoutRetryConfig / executeWithTimeoutRetry
 * - registerFlowHandlers
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
  TimeoutRetryConfig,
  CommandContext,
} from '../../shared/src/commands/flow';
import {
  createExecutor,
  MacroExecutor,
  IMACROS_ERROR_CODES,
} from '../../shared/src/executor';

// ===== Test Helpers =====

/**
 * Create an executor with flow handlers registered.
 */
function setupExecutor(): MacroExecutor {
  const executor = createExecutor();
  registerFlowHandlers(executor.registerHandler.bind(executor));
  return executor;
}

/**
 * Execute a single macro line and return the result.
 * Uses the executor to parse and run the command through
 * registered handlers (including flow handlers).
 */
async function runLine(executor: MacroExecutor, line: string) {
  executor.loadMacro(line);
  return executor.execute();
}

/**
 * Build a minimal CommandContext for direct handler testing.
 * Uses the real executor state for variables that are recognized
 * system variables (like !VAR0-!VAR9).
 */
function buildCtx(
  executor: MacroExecutor,
  overrides: {
    type?: string;
    params?: Array<{ key: string; value: string; rawValue?: string }>;
    raw?: string;
    getParam?: (key: string) => string | undefined;
    expand?: (text: string) => string;
  } = {},
): CommandContext {
  const state = executor.getState();
  const variables = state.getVariables();

  const params = (overrides.params ?? []).map(p => ({
    key: p.key,
    value: p.value,
    rawValue: p.rawValue ?? p.value,
    variables: [],
  }));

  return {
    command: {
      type: (overrides.type ?? 'WAIT') as any,
      parameters: params,
      raw: overrides.raw ?? '',
      lineNumber: 1,
      variables: [],
    },
    variables,
    state,
    getParam: overrides.getParam ?? ((key: string) => {
      const p = params.find(param => param.key.toUpperCase() === key.toUpperCase());
      return p?.value;
    }),
    getRequiredParam: (key: string) => {
      const getter = overrides.getParam ?? ((k: string) => {
        const p = params.find(param => param.key.toUpperCase() === k.toUpperCase());
        return p?.value;
      });
      const val = getter(key);
      if (val === undefined) throw new Error(`Missing required parameter: ${key}`);
      return val;
    },
    expand: overrides.expand ?? ((t: string) => {
      const result = variables.expand(t);
      return result.expanded;
    }),
    log: vi.fn(),
  };
}

/**
 * Build a CommandContext with a mocked StateManager, allowing us to control
 * what getVariable returns (needed for !TIMEOUT_TAG and !INPUT which are
 * not recognized system variables in the parser).
 */
function buildMockCtx(
  executor: MacroExecutor,
  variableOverrides: Record<string, any> = {},
  overrides: {
    type?: string;
    params?: Array<{ key: string; value: string; rawValue?: string }>;
    raw?: string;
    getParam?: (key: string) => string | undefined;
    expand?: (text: string) => string;
  } = {},
): CommandContext {
  const realState = executor.getState();
  const variables = realState.getVariables();

  // Create a proxy state that intercepts getVariable and setVariable
  const setVariableStore: Record<string, any> = {};
  const mockState = {
    ...realState,
    getVariable: (name: string) => {
      const upper = name.toUpperCase();
      if (upper in variableOverrides) return variableOverrides[upper];
      if (upper in setVariableStore) return setVariableStore[upper];
      return realState.getVariable(name);
    },
    setVariable: (name: string, value: any) => {
      const upper = name.toUpperCase();
      setVariableStore[upper] = value;
      // Also try the real state (works for recognized system variables)
      realState.setVariable(name, value);
    },
    getVariables: () => variables,
  } as any;

  const params = (overrides.params ?? []).map(p => ({
    key: p.key,
    value: p.value,
    rawValue: p.rawValue ?? p.value,
    variables: [],
  }));

  return {
    command: {
      type: (overrides.type ?? 'TAG') as any,
      parameters: params,
      raw: overrides.raw ?? '',
      lineNumber: 1,
      variables: [],
    },
    variables,
    state: mockState,
    getParam: overrides.getParam ?? ((key: string) => {
      const p = params.find(param => param.key.toUpperCase() === key.toUpperCase());
      return p?.value;
    }),
    getRequiredParam: (key: string) => {
      const getter = overrides.getParam ?? ((k: string) => {
        const p = params.find(param => param.key.toUpperCase() === k.toUpperCase());
        return p?.value;
      });
      const val = getter(key);
      if (val === undefined) throw new Error(`Missing required parameter: ${key}`);
      return val;
    },
    expand: overrides.expand ?? ((t: string) => {
      const result = variables.expand(t);
      return result.expanded;
    }),
    log: vi.fn(),
  };
}

// ===== Tests =====

describe('Flow Control Handlers', () => {
  let executor: MacroExecutor;

  beforeEach(() => {
    executor = setupExecutor();
    resetFlowControlUI();
  });

  afterEach(() => {
    resetFlowControlUI();
  });

  // ===== 1. WAIT Handler =====

  describe('WAIT handler', () => {
    it('should succeed with WAIT SECONDS=0.01', async () => {
      const result = await runLine(executor, 'WAIT SECONDS=0.01');
      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    });

    it('should return MISSING_PARAMETER when SECONDS is missing', async () => {
      const ctx = buildCtx(executor, {
        type: 'WAIT',
        params: [],
        raw: 'WAIT',
      });

      const result = await waitHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(result.errorMessage).toContain('SECONDS');
    });

    it('should return INVALID_PARAMETER for WAIT SECONDS=0', async () => {
      const ctx = buildCtx(executor, {
        type: 'WAIT',
        params: [{ key: 'SECONDS', value: '0' }],
        raw: 'WAIT SECONDS=0',
      });

      const result = await waitHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    });

    it('should return INVALID_PARAMETER for WAIT SECONDS=abc', async () => {
      const ctx = buildCtx(executor, {
        type: 'WAIT',
        params: [{ key: 'SECONDS', value: 'abc' }],
        raw: 'WAIT SECONDS=abc',
      });

      const result = await waitHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    });

    it('should actually delay execution (verify with timing)', async () => {
      const ctx = buildCtx(executor, {
        type: 'WAIT',
        params: [{ key: 'SECONDS', value: '0.05' }],
        raw: 'WAIT SECONDS=0.05',
        expand: (t: string) => t,
      });

      const start = Date.now();
      const result = await waitHandler(ctx);
      const elapsed = Date.now() - start;

      expect(result.success).toBe(true);
      // 50ms wait - should take at least 40ms (10ms tolerance)
      expect(elapsed).toBeGreaterThanOrEqual(40);
    });

    it('should support variable expansion in SECONDS value', async () => {
      const state = executor.getState();
      state.setVariable('!VAR1', '0.01');

      const ctx = buildCtx(executor, {
        type: 'WAIT',
        params: [{ key: 'SECONDS', value: '{{!VAR1}}' }],
        raw: 'WAIT SECONDS={{!VAR1}}',
      });

      const result = await waitHandler(ctx);
      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    });

    it('should succeed with decimal values like WAIT SECONDS=0.01', async () => {
      const ctx = buildCtx(executor, {
        type: 'WAIT',
        params: [{ key: 'SECONDS', value: '0.01' }],
        raw: 'WAIT SECONDS=0.01',
        expand: (t: string) => t,
      });

      const result = await waitHandler(ctx);
      expect(result.success).toBe(true);
    });
  });

  // ===== 2. PAUSE Handler =====

  describe('PAUSE handler', () => {
    it('should return success with default UI (headless mode)', async () => {
      const ctx = buildCtx(executor, {
        type: 'PAUSE',
        params: [],
        raw: 'PAUSE',
      });

      const result = await pauseHandler(ctx);
      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    });

    it('should return success when custom UI showPause resolves', async () => {
      const customUI: FlowControlUI = {
        showPause: vi.fn().mockResolvedValue(undefined),
        showPrompt: vi.fn().mockResolvedValue(''),
        showAlert: vi.fn().mockResolvedValue(undefined),
      };
      setFlowControlUI(customUI);

      const ctx = buildCtx(executor, {
        type: 'PAUSE',
        params: [],
        raw: 'PAUSE',
      });

      const result = await pauseHandler(ctx);
      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(customUI.showPause).toHaveBeenCalledWith(
        'Macro execution paused. Click OK to continue.'
      );
    });

    it('should return USER_ABORT with stopExecution when custom UI showPause rejects', async () => {
      const customUI: FlowControlUI = {
        showPause: vi.fn().mockRejectedValue(new Error('User cancelled')),
        showPrompt: vi.fn().mockResolvedValue(''),
        showAlert: vi.fn().mockResolvedValue(undefined),
      };
      setFlowControlUI(customUI);

      const ctx = buildCtx(executor, {
        type: 'PAUSE',
        params: [],
        raw: 'PAUSE',
      });

      const result = await pauseHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.USER_ABORT);
      expect(result.stopExecution).toBe(true);
    });
  });

  // ===== 3. PROMPT Handler =====

  describe('PROMPT handler', () => {
    it('should return empty string output with default UI when no DEFAULT given', async () => {
      const ctx = buildMockCtx(executor, {}, {
        type: 'PROMPT',
        params: [{ key: 'MESSAGE', value: 'Enter name:' }],
        raw: 'PROMPT MESSAGE="Enter name:"',
      });

      const result = await promptHandler(ctx);
      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      // Default UI returns defaultValue ?? '' (no default given, so '')
      expect(result.output).toBe('');
      // The handler calls ctx.state.setVariable('!INPUT', '') which stores
      // in our mock state
      expect(ctx.state.getVariable('!INPUT')).toBe('');
    });

    it('should prompt with MESSAGE and store in !INPUT by default', async () => {
      const customUI: FlowControlUI = {
        showPause: vi.fn().mockResolvedValue(undefined),
        showPrompt: vi.fn().mockResolvedValue('user-answer'),
        showAlert: vi.fn().mockResolvedValue(undefined),
      };
      setFlowControlUI(customUI);

      const ctx = buildMockCtx(executor, {}, {
        type: 'PROMPT',
        params: [{ key: 'MESSAGE', value: 'question' }],
        raw: 'PROMPT MESSAGE=question',
      });

      const result = await promptHandler(ctx);
      expect(result.success).toBe(true);
      expect(result.output).toBe('user-answer');
      // Stored via mock state
      expect(ctx.state.getVariable('!INPUT')).toBe('user-answer');
      expect(customUI.showPrompt).toHaveBeenCalledWith('question', undefined);
    });

    it('should use DEFAULT value and store in custom VAR', async () => {
      const customUI: FlowControlUI = {
        showPause: vi.fn().mockResolvedValue(undefined),
        showPrompt: vi.fn().mockResolvedValue('custom-input'),
        showAlert: vi.fn().mockResolvedValue(undefined),
      };
      setFlowControlUI(customUI);

      const ctx = buildCtx(executor, {
        type: 'PROMPT',
        params: [
          { key: 'MESSAGE', value: 'question' },
          { key: 'DEFAULT', value: 'answer' },
          { key: 'VAR', value: '!VAR1' },
        ],
        raw: 'PROMPT MESSAGE=question DEFAULT=answer VAR=!VAR1',
        expand: (t: string) => t,
      });

      const result = await promptHandler(ctx);
      expect(result.success).toBe(true);
      expect(result.output).toBe('custom-input');
      // !VAR1 IS a recognized system variable, so state.setVariable works
      expect(executor.getState().getVariable('!VAR1')).toBe('custom-input');
      expect(customUI.showPrompt).toHaveBeenCalledWith('question', 'answer');
    });

    it('should return default value from default UI when DEFAULT is set', async () => {
      const ctx = buildMockCtx(executor, {}, {
        type: 'PROMPT',
        params: [
          { key: 'MESSAGE', value: 'question' },
          { key: 'DEFAULT', value: 'my-default' },
        ],
        raw: 'PROMPT MESSAGE=question DEFAULT=my-default',
        expand: (t: string) => t,
      });

      const result = await promptHandler(ctx);
      expect(result.success).toBe(true);
      // Default UI returns defaultValue when provided
      expect(result.output).toBe('my-default');
      // Stored via mock state into !INPUT
      expect(ctx.state.getVariable('!INPUT')).toBe('my-default');
    });

    it('should return USER_ABORT and store empty string when user cancels', async () => {
      const customUI: FlowControlUI = {
        showPause: vi.fn().mockResolvedValue(undefined),
        showPrompt: vi.fn().mockRejectedValue(new Error('User cancelled')),
        showAlert: vi.fn().mockResolvedValue(undefined),
      };
      setFlowControlUI(customUI);

      const ctx = buildMockCtx(executor, {}, {
        type: 'PROMPT',
        params: [{ key: 'MESSAGE', value: 'Enter something' }],
        raw: 'PROMPT MESSAGE="Enter something"',
      });

      const result = await promptHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.USER_ABORT);
      expect(result.stopExecution).toBe(true);
      // Should store empty string on cancel via mock state
      expect(ctx.state.getVariable('!INPUT')).toBe('');
    });

    it('should return MISSING_PARAMETER when no message is provided', async () => {
      const ctx = buildCtx(executor, {
        type: 'PROMPT',
        params: [],
        raw: 'PROMPT',
      });

      const result = await promptHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    });

    it('should use the first positional param key as message when MESSAGE is not given', async () => {
      const customUI: FlowControlUI = {
        showPause: vi.fn().mockResolvedValue(undefined),
        showPrompt: vi.fn().mockResolvedValue('response'),
        showAlert: vi.fn().mockResolvedValue(undefined),
      };
      setFlowControlUI(customUI);

      // Simulate: PROMPT "What is your name?"
      // The parser puts the quoted string as param key with empty value
      const ctx = buildMockCtx(executor, {}, {
        type: 'PROMPT',
        params: [{ key: 'What is your name?', value: '' }],
        raw: 'PROMPT "What is your name?"',
        // getParam should not match MESSAGE, DEFAULT, or VAR
        getParam: () => undefined,
      });

      const result = await promptHandler(ctx);
      expect(result.success).toBe(true);
      // The handler uses params[0].value || params[0].key as message
      expect(customUI.showPrompt).toHaveBeenCalledWith('What is your name?', undefined);
    });

    it('should store empty string in custom VAR when user cancels', async () => {
      const customUI: FlowControlUI = {
        showPause: vi.fn().mockResolvedValue(undefined),
        showPrompt: vi.fn().mockRejectedValue(new Error('cancelled')),
        showAlert: vi.fn().mockResolvedValue(undefined),
      };
      setFlowControlUI(customUI);

      // Use !VAR2 which IS a recognized system variable
      const ctx = buildCtx(executor, {
        type: 'PROMPT',
        params: [
          { key: 'MESSAGE', value: 'question' },
          { key: 'VAR', value: '!VAR2' },
        ],
        raw: 'PROMPT MESSAGE=question VAR=!VAR2',
        expand: (t: string) => t,
      });

      const result = await promptHandler(ctx);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.USER_ABORT);
      // !VAR2 is recognized, so state.setVariable stores it
      expect(executor.getState().getVariable('!VAR2')).toBe('');
    });

    it('should store user input in custom VAR when prompt succeeds', async () => {
      const customUI: FlowControlUI = {
        showPause: vi.fn().mockResolvedValue(undefined),
        showPrompt: vi.fn().mockResolvedValue('typed-value'),
        showAlert: vi.fn().mockResolvedValue(undefined),
      };
      setFlowControlUI(customUI);

      const ctx = buildCtx(executor, {
        type: 'PROMPT',
        params: [
          { key: 'MESSAGE', value: 'Enter data' },
          { key: 'DEFAULT', value: 'fallback' },
          { key: 'VAR', value: '!VAR3' },
        ],
        raw: 'PROMPT MESSAGE="Enter data" DEFAULT=fallback VAR=!VAR3',
        expand: (t: string) => t,
      });

      const result = await promptHandler(ctx);
      expect(result.success).toBe(true);
      expect(result.output).toBe('typed-value');
      expect(executor.getState().getVariable('!VAR3')).toBe('typed-value');
      expect(customUI.showPrompt).toHaveBeenCalledWith('Enter data', 'fallback');
    });
  });

  // ===== 4. setFlowControlUI / getFlowControlUI / resetFlowControlUI =====

  describe('FlowControlUI management', () => {
    it('should set custom UI and retrieve it', () => {
      const customUI: FlowControlUI = {
        showPause: vi.fn().mockResolvedValue(undefined),
        showPrompt: vi.fn().mockResolvedValue('test'),
        showAlert: vi.fn().mockResolvedValue(undefined),
      };

      setFlowControlUI(customUI);
      const retrieved = getFlowControlUI();
      expect(retrieved).toBe(customUI);
    });

    it('should return default UI initially', () => {
      const ui = getFlowControlUI();
      expect(ui).toBeDefined();
      expect(typeof ui.showPause).toBe('function');
      expect(typeof ui.showPrompt).toBe('function');
      expect(typeof ui.showAlert).toBe('function');
    });

    it('should reset to default UI after resetFlowControlUI', async () => {
      const customUI: FlowControlUI = {
        showPause: vi.fn().mockResolvedValue(undefined),
        showPrompt: vi.fn().mockResolvedValue('custom'),
        showAlert: vi.fn().mockResolvedValue(undefined),
      };

      setFlowControlUI(customUI);
      expect(getFlowControlUI()).toBe(customUI);

      resetFlowControlUI();
      const ui = getFlowControlUI();
      expect(ui).not.toBe(customUI);

      // Default showPrompt returns default value or empty string
      const result = await ui.showPrompt('test', 'default-val');
      expect(result).toBe('default-val');
    });

    it('default UI showPause resolves immediately', async () => {
      const ui = getFlowControlUI();
      await expect(ui.showPause()).resolves.toBeUndefined();
    });

    it('default UI showPrompt returns empty string when no default', async () => {
      const ui = getFlowControlUI();
      const result = await ui.showPrompt('Enter something');
      expect(result).toBe('');
    });

    it('default UI showAlert resolves immediately', async () => {
      const ui = getFlowControlUI();
      await expect(ui.showAlert('test message')).resolves.toBeUndefined();
    });
  });

  // ===== 5. getTimeoutRetryConfig =====

  describe('getTimeoutRetryConfig', () => {
    it('should return default 6s config when no !TIMEOUT_TAG is set', () => {
      // Default !TIMEOUT_TAG is 6 (defined in shared/src/variables.ts)
      const ctx = buildCtx(executor, { type: 'TAG', raw: 'TAG' });

      const config = getTimeoutRetryConfig(ctx);
      expect(config.maxRetries).toBe(6);
      expect(config.retryDelayMs).toBe(1000);
      expect(config.currentRetry).toBe(0);
    });

    it('should use !TIMEOUT_TAG numeric value', () => {
      // !TIMEOUT_TAG is not a recognized system variable, so we use a mock state
      const ctx = buildMockCtx(executor, { '!TIMEOUT_TAG': 5 }, {
        type: 'TAG',
        raw: 'TAG',
      });

      const config = getTimeoutRetryConfig(ctx);
      expect(config.maxRetries).toBe(5);
    });

    it('should handle string !TIMEOUT_TAG value', () => {
      const ctx = buildMockCtx(executor, { '!TIMEOUT_TAG': '3' }, {
        type: 'TAG',
        raw: 'TAG',
      });

      const config = getTimeoutRetryConfig(ctx);
      expect(config.maxRetries).toBe(3);
    });

    it('should enforce minimum of 1 retry', () => {
      const ctx = buildMockCtx(executor, { '!TIMEOUT_TAG': 0 }, {
        type: 'TAG',
        raw: 'TAG',
      });

      const config = getTimeoutRetryConfig(ctx);
      expect(config.maxRetries).toBeGreaterThanOrEqual(1);
    });

    it('should ceil fractional timeout values', () => {
      const ctx = buildMockCtx(executor, { '!TIMEOUT_TAG': '2.3' }, {
        type: 'TAG',
        raw: 'TAG',
      });

      const config = getTimeoutRetryConfig(ctx);
      expect(config.maxRetries).toBe(3); // Math.ceil(2.3)
    });

    it('should produce NaN maxRetries when !TIMEOUT_TAG is an unparseable string', () => {
      // When !TIMEOUT_TAG is a string, the code always parses it with parseFloat.
      // If parseFloat returns NaN, Math.ceil(NaN) is NaN and Math.max(1, NaN) is NaN.
      const ctx = buildMockCtx(executor, { '!TIMEOUT_TAG': 'invalid' }, {
        type: 'TAG',
        raw: 'TAG',
      });

      const config = getTimeoutRetryConfig(ctx);
      expect(config.maxRetries).toBeNaN();
    });

    it('should default to 10 when !TIMEOUT_TAG is null (unset)', () => {
      // When the variable is null (not set), the code falls through to the default of 10
      const ctx = buildMockCtx(executor, { '!TIMEOUT_TAG': null }, {
        type: 'TAG',
        raw: 'TAG',
      });

      const config = getTimeoutRetryConfig(ctx);
      expect(config.maxRetries).toBe(10);
    });
  });

  // ===== 6. executeWithTimeoutRetry =====

  describe('executeWithTimeoutRetry', () => {
    /**
     * Build a mock context with a controlled !TIMEOUT_TAG value
     * for executeWithTimeoutRetry tests.
     */
    function makeCtx(timeoutTag?: number | string) {
      const overrides: Record<string, any> = {};
      if (timeoutTag !== undefined) {
        overrides['!TIMEOUT_TAG'] = timeoutTag;
      }
      return buildMockCtx(executor, overrides, {
        type: 'TAG',
        raw: 'TAG',
      });
    }

    it('should return immediately on first-attempt success', async () => {
      const ctx = makeCtx(1);
      const operation = vi.fn().mockResolvedValue({
        success: true,
        errorCode: IMACROS_ERROR_CODES.OK,
      });

      const result = await executeWithTimeoutRetry(ctx, operation);
      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should return immediately on non-retryable error', async () => {
      const ctx = makeCtx(1);
      const operation = vi.fn().mockResolvedValue({
        success: false,
        errorCode: IMACROS_ERROR_CODES.SYNTAX_ERROR,
        errorMessage: 'Bad syntax',
      });

      const result = await executeWithTimeoutRetry(ctx, operation);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SYNTAX_ERROR);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on ELEMENT_NOT_FOUND and eventually succeed', async () => {
      // With !TIMEOUT_TAG=1, maxRetries=1, loop runs attempts 0 and 1
      const ctx = makeCtx(1);
      let callCount = 0;
      const operation = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 2) {
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

      vi.useFakeTimers();
      const promise = executeWithTimeoutRetry(ctx, operation);
      // Advance timers to allow retry delay (1000ms)
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;
      vi.useRealTimers();

      expect(result.success).toBe(true);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should return TIMEOUT error after maxRetries exhausted', async () => {
      // With !TIMEOUT_TAG=1, maxRetries=1
      const ctx = makeCtx(1);
      const operation = vi.fn().mockResolvedValue({
        success: false,
        errorCode: IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND,
        errorMessage: 'Element not found',
      });

      vi.useFakeTimers();
      const promise = executeWithTimeoutRetry(ctx, operation);
      // Advance enough time for all retries (1 retry * 1000ms delay + extra)
      await vi.advanceTimersByTimeAsync(5000);
      const result = await promise;
      vi.useRealTimers();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.TIMEOUT);
      expect(result.errorMessage).toContain('Timeout');
    });

    it('should use custom isRetryableError function', async () => {
      const ctx = makeCtx(1);
      let callCount = 0;
      const operation = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 2) {
          return {
            success: false,
            errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
            errorMessage: 'Custom retryable error',
          };
        }
        return {
          success: true,
          errorCode: IMACROS_ERROR_CODES.OK,
        };
      });

      // Custom function that treats SCRIPT_ERROR as retryable
      const customRetryable = (r: { errorCode: number }) =>
        r.errorCode === IMACROS_ERROR_CODES.SCRIPT_ERROR;

      vi.useFakeTimers();
      const promise = executeWithTimeoutRetry(ctx, operation, customRetryable);
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;
      vi.useRealTimers();

      expect(result.success).toBe(true);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should not retry when custom isRetryableError returns false', async () => {
      const ctx = makeCtx(2);
      const operation = vi.fn().mockResolvedValue({
        success: false,
        errorCode: IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND,
        errorMessage: 'Element not found',
      });

      // Custom function that treats nothing as retryable
      const neverRetry = () => false;

      const result = await executeWithTimeoutRetry(ctx, operation, neverRetry);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND);
      // Should only be called once since nothing is retryable
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on TIMEOUT error code by default', async () => {
      const ctx = makeCtx(1);
      let callCount = 0;
      const operation = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 2) {
          return {
            success: false,
            errorCode: IMACROS_ERROR_CODES.TIMEOUT,
            errorMessage: 'Timed out',
          };
        }
        return {
          success: true,
          errorCode: IMACROS_ERROR_CODES.OK,
        };
      });

      vi.useFakeTimers();
      const promise = executeWithTimeoutRetry(ctx, operation);
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;
      vi.useRealTimers();

      expect(result.success).toBe(true);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should log retry attempts', async () => {
      const ctx = makeCtx(2);
      let callCount = 0;
      const operation = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          return {
            success: false,
            errorCode: IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND,
            errorMessage: 'Not found',
          };
        }
        return {
          success: true,
          errorCode: IMACROS_ERROR_CODES.OK,
        };
      });

      vi.useFakeTimers();
      const promise = executeWithTimeoutRetry(ctx, operation);
      await vi.advanceTimersByTimeAsync(5000);
      const result = await promise;
      vi.useRealTimers();

      expect(result.success).toBe(true);
      // The log function should have been called with debug-level retry messages
      expect(ctx.log).toHaveBeenCalled();
      const debugCalls = (ctx.log as any).mock.calls.filter(
        (c: any[]) => c[0] === 'debug'
      );
      expect(debugCalls.length).toBeGreaterThan(0);
    });
  });

  // ===== 7. registerFlowHandlers =====

  describe('registerFlowHandlers', () => {
    it('should register all 3 handlers (WAIT, PAUSE, PROMPT)', () => {
      const registered: Record<string, unknown> = {};
      const mockRegister = vi.fn((type: string, handler: unknown) => {
        registered[type] = handler;
      });

      registerFlowHandlers(mockRegister);

      expect(mockRegister).toHaveBeenCalledTimes(3);
      expect(registered).toHaveProperty('WAIT');
      expect(registered).toHaveProperty('PAUSE');
      expect(registered).toHaveProperty('PROMPT');
    });

    it('should register the correct handler functions', () => {
      const registered: Record<string, unknown> = {};
      const mockRegister = vi.fn((type: string, handler: unknown) => {
        registered[type] = handler;
      });

      registerFlowHandlers(mockRegister);

      expect(registered['WAIT']).toBe(waitHandler);
      expect(registered['PAUSE']).toBe(pauseHandler);
      expect(registered['PROMPT']).toBe(promptHandler);
    });
  });

  // ===== 8. flowHandlers export =====

  describe('flowHandlers export', () => {
    it('should contain WAIT, PAUSE, and PROMPT handlers', () => {
      expect(flowHandlers).toHaveProperty('WAIT', waitHandler);
      expect(flowHandlers).toHaveProperty('PAUSE', pauseHandler);
      expect(flowHandlers).toHaveProperty('PROMPT', promptHandler);
    });

    it('should only contain 3 handlers', () => {
      const keys = Object.keys(flowHandlers);
      expect(keys).toHaveLength(3);
    });
  });

  // ===== 9. Executor Integration =====

  describe('Executor integration', () => {
    it('should execute WAIT through the executor', async () => {
      const result = await runLine(executor, 'WAIT SECONDS=0.01');
      expect(result.success).toBe(true);
    });

    it('should execute PAUSE through the executor in headless mode', async () => {
      const result = await runLine(executor, 'PAUSE');
      expect(result.success).toBe(true);
    });

    it('should override built-in WAIT handler when flow handlers are registered', () => {
      const handler = executor.getHandler('WAIT');
      expect(handler).toBe(waitHandler);
    });

    it('should override built-in PAUSE handler when flow handlers are registered', () => {
      const handler = executor.getHandler('PAUSE');
      expect(handler).toBe(pauseHandler);
    });
  });
});
