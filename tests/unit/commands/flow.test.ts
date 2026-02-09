/**
 * Additional Unit Tests for Flow Control Command Handlers
 *
 * Targets uncovered branches in shared/src/commands/flow.ts:
 * - WAIT handler: !TIMEOUT_STEP capping logic (string, number, exceeding)
 * - WAIT handler: singular "second" in log message
 * - executeWithTimeoutRetry: errorMessage fallback to 'Element not found'
 * - PROMPT handler: positional param with value present
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  waitHandler,
  promptHandler,
  setFlowControlUI,
  resetFlowControlUI,
  getTimeoutRetryConfig,
  executeWithTimeoutRetry,
  flowHandlers,
  registerFlowHandlers,
  FlowControlUI,
  CommandContext,
} from '../../../shared/src/commands/flow';
import {
  createExecutor,
  MacroExecutor,
  IMACROS_ERROR_CODES,
} from '../../../shared/src/executor';

// ===== Test Helpers =====

function setupExecutor(): MacroExecutor {
  const executor = createExecutor();
  registerFlowHandlers(executor.registerHandler.bind(executor));
  return executor;
}

/**
 * Build a CommandContext with a mocked StateManager for controlling
 * getVariable return values (needed for !TIMEOUT_STEP, !TIMEOUT_TAG, etc.).
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
      type: (overrides.type ?? 'WAIT') as any,
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

describe('Flow Control - Uncovered Branch Tests', () => {
  let executor: MacroExecutor;

  beforeEach(() => {
    executor = setupExecutor();
    resetFlowControlUI();
  });

  afterEach(() => {
    resetFlowControlUI();
  });

  // ===== WAIT handler: !TIMEOUT_STEP branches =====

  describe('WAIT handler with !TIMEOUT_STEP', () => {
    it('should cap wait time when SECONDS exceeds numeric !TIMEOUT_STEP', async () => {
      // Covers branches 12 (typeof timeoutStep === 'number'), 14 (seconds > maxWait),
      // and branch 16 (maxWait > 0 ternary)
      const ctx = buildMockCtx(executor, { '!TIMEOUT_STEP': 0.01 }, {
        type: 'WAIT',
        params: [{ key: 'SECONDS', value: '5' }],
        raw: 'WAIT SECONDS=5',
        expand: (t: string) => t,
      });

      const start = Date.now();
      const result = await waitHandler(ctx);
      const elapsed = Date.now() - start;

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      // Should have capped to 0.01s (10ms) instead of waiting 5s
      expect(elapsed).toBeLessThan(1000);
      // Should have logged a warning about exceeding !TIMEOUT_STEP
      expect(ctx.log).toHaveBeenCalledWith('warn', expect.stringContaining('exceeds !TIMEOUT_STEP'));
    });

    it('should cap wait time when SECONDS exceeds string !TIMEOUT_STEP', async () => {
      // Covers branch 13 (typeof timeoutStep === 'string' => parseFloat)
      const ctx = buildMockCtx(executor, { '!TIMEOUT_STEP': '0.01' }, {
        type: 'WAIT',
        params: [{ key: 'SECONDS', value: '5' }],
        raw: 'WAIT SECONDS=5',
        expand: (t: string) => t,
      });

      const start = Date.now();
      const result = await waitHandler(ctx);
      const elapsed = Date.now() - start;

      expect(result.success).toBe(true);
      // Capped at 0.01s, should complete quickly
      expect(elapsed).toBeLessThan(1000);
      expect(ctx.log).toHaveBeenCalledWith('warn', expect.stringContaining('exceeds !TIMEOUT_STEP'));
    });

    it('should not cap when SECONDS is within !TIMEOUT_STEP', async () => {
      // Branch 14 else: seconds <= maxWait
      const ctx = buildMockCtx(executor, { '!TIMEOUT_STEP': 10 }, {
        type: 'WAIT',
        params: [{ key: 'SECONDS', value: '0.01' }],
        raw: 'WAIT SECONDS=0.01',
        expand: (t: string) => t,
      });

      const result = await waitHandler(ctx);
      expect(result.success).toBe(true);
      // Should NOT log the warning about exceeding timeout step
      const warnCalls = (ctx.log as any).mock.calls.filter(
        (c: any[]) => c[0] === 'warn'
      );
      expect(warnCalls.length).toBe(0);
    });

    it('should not cap when !TIMEOUT_STEP is 0 (maxWait > 0 is false)', async () => {
      // Covers branch 15/16: maxWait is 0, so maxWait > 0 is false
      // and branch 16 ternary goes to the else (seconds itself)
      const ctx = buildMockCtx(executor, { '!TIMEOUT_STEP': 0 }, {
        type: 'WAIT',
        params: [{ key: 'SECONDS', value: '0.01' }],
        raw: 'WAIT SECONDS=0.01',
        expand: (t: string) => t,
      });

      const result = await waitHandler(ctx);
      expect(result.success).toBe(true);
      // No warning because condition is seconds > maxWait && maxWait > 0
      // maxWait = 0, so maxWait > 0 is false
      const warnCalls = (ctx.log as any).mock.calls.filter(
        (c: any[]) => c[0] === 'warn'
      );
      expect(warnCalls.length).toBe(0);
    });

    it('should use Infinity as maxWait when !TIMEOUT_STEP is not set (falls to default)', async () => {
      // Branch 12/13 else: neither number nor string => Infinity
      // This is the existing default path but confirms the Infinity branch
      const ctx = buildMockCtx(executor, {}, {
        type: 'WAIT',
        params: [{ key: 'SECONDS', value: '0.01' }],
        raw: 'WAIT SECONDS=0.01',
        expand: (t: string) => t,
      });

      const result = await waitHandler(ctx);
      expect(result.success).toBe(true);
    });

    it('should log singular "second" when wait is exactly 1', async () => {
      // Covers branch 17: actualWait === 1 => 's' is not appended
      const ctx = buildMockCtx(executor, { '!TIMEOUT_STEP': 1 }, {
        type: 'WAIT',
        params: [{ key: 'SECONDS', value: '1' }],
        raw: 'WAIT SECONDS=1',
        expand: (t: string) => t,
      });

      const result = await waitHandler(ctx);
      expect(result.success).toBe(true);
      expect(ctx.log).toHaveBeenCalledWith('info', 'Waiting 1 second...');
    });
  });

  // ===== executeWithTimeoutRetry: errorMessage fallback =====

  describe('executeWithTimeoutRetry - errorMessage fallback', () => {
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

    it('should use "Element not found" fallback when errorMessage is empty', async () => {
      // Covers branch 8: result.errorMessage is falsy => 'Element not found'
      const ctx = makeCtx(1);
      const operation = vi.fn().mockResolvedValue({
        success: false,
        errorCode: IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND,
        errorMessage: '', // empty string => falsy
      });

      vi.useFakeTimers();
      const promise = executeWithTimeoutRetry(ctx, operation);
      // Advance past all retries
      await vi.advanceTimersByTimeAsync(5000);
      const result = await promise;
      vi.useRealTimers();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.TIMEOUT);
      expect(result.errorMessage).toContain('Element not found');
    });

    it('should use "Element not found" fallback when errorMessage is undefined', async () => {
      const ctx = makeCtx(1);
      const operation = vi.fn().mockResolvedValue({
        success: false,
        errorCode: IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND,
        // errorMessage not set at all
      });

      vi.useFakeTimers();
      const promise = executeWithTimeoutRetry(ctx, operation);
      await vi.advanceTimersByTimeAsync(5000);
      const result = await promise;
      vi.useRealTimers();

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Element not found');
    });

    it('should use actual errorMessage when present', async () => {
      const ctx = makeCtx(1);
      const operation = vi.fn().mockResolvedValue({
        success: false,
        errorCode: IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND,
        errorMessage: 'Specific error occurred',
      });

      vi.useFakeTimers();
      const promise = executeWithTimeoutRetry(ctx, operation);
      await vi.advanceTimersByTimeAsync(5000);
      const result = await promise;
      vi.useRealTimers();

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Specific error occurred');
    });
  });

  // ===== PROMPT handler: positional param with value =====

  describe('PROMPT handler - positional param with value', () => {
    it('should use positional param key as message for alert-only when no var specified', async () => {
      // Single positional param (message only, no variable) triggers alert-only mode
      // Parser puts the token text in key, with value='true' for flag-style params
      const customUI: FlowControlUI = {
        showPause: vi.fn().mockResolvedValue(undefined),
        showPrompt: vi.fn().mockResolvedValue('reply'),
        showAlert: vi.fn().mockResolvedValue(undefined),
      };
      setFlowControlUI(customUI);

      const ctx = buildMockCtx(executor, {}, {
        type: 'PROMPT',
        params: [{ key: 'My prompt message', value: 'true' }],
        raw: 'PROMPT "My prompt message"',
        getParam: (key: string) => {
          if (key === 'DEFAULT' || key === 'VAR' || key === 'MESSAGE') return undefined;
          return undefined;
        },
      });

      const result = await promptHandler(ctx);
      expect(result.success).toBe(true);
      // Alert-only mode: calls showAlert, not showPrompt
      expect(customUI.showAlert).toHaveBeenCalledWith('My prompt message');
      expect(customUI.showPrompt).not.toHaveBeenCalled();
    });
  });

  // ===== WAIT handler: !TIMEOUT_STEP with non-number, non-string value =====

  describe('WAIT handler with non-standard !TIMEOUT_STEP type', () => {
    it('should default to Infinity when !TIMEOUT_STEP is a boolean', async () => {
      // Covers branch 13 else: typeof is neither 'number' nor 'string' => Infinity
      const ctx = buildMockCtx(executor, { '!TIMEOUT_STEP': true }, {
        type: 'WAIT',
        params: [{ key: 'SECONDS', value: '0.01' }],
        raw: 'WAIT SECONDS=0.01',
        expand: (t: string) => t,
      });

      const result = await waitHandler(ctx);
      expect(result.success).toBe(true);
      // With Infinity as maxWait, no capping occurs, no warning
      const warnCalls = (ctx.log as any).mock.calls.filter(
        (c: any[]) => c[0] === 'warn'
      );
      expect(warnCalls.length).toBe(0);
    });

    it('should default to Infinity when !TIMEOUT_STEP is an object', async () => {
      const ctx = buildMockCtx(executor, { '!TIMEOUT_STEP': { value: 5 } }, {
        type: 'WAIT',
        params: [{ key: 'SECONDS', value: '0.01' }],
        raw: 'WAIT SECONDS=0.01',
        expand: (t: string) => t,
      });

      const result = await waitHandler(ctx);
      expect(result.success).toBe(true);
    });
  });

  // ===== registerFlowHandlers: falsy handler branch =====

  describe('registerFlowHandlers with falsy handler entry', () => {
    it('should skip undefined handler entries', () => {
      // Temporarily add an undefined entry to flowHandlers to cover
      // the if (handler) false branch at line 391
      const original = (flowHandlers as any)['_FAKE_CMD'];
      (flowHandlers as any)['_FAKE_CMD'] = undefined;

      try {
        const registered: string[] = [];
        const mockRegister = vi.fn((type: string) => {
          registered.push(type);
        });

        registerFlowHandlers(mockRegister);

        // Should register WAIT, PAUSE, PROMPT but NOT _FAKE_CMD
        expect(registered).toContain('WAIT');
        expect(registered).toContain('PAUSE');
        expect(registered).toContain('PROMPT');
        expect(registered).not.toContain('_FAKE_CMD');
        expect(mockRegister).toHaveBeenCalledTimes(3);
      } finally {
        // Clean up
        delete (flowHandlers as any)['_FAKE_CMD'];
      }
    });
  });
});
