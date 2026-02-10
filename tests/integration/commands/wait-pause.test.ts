/**
 * WAIT and PAUSE Command Integration Tests
 *
 * Tests both the executor's built-in WAIT/PAUSE handlers and the
 * standalone flow.ts handlers to verify correct behavior:
 *
 * - WAIT SECONDS=n delays execution for the given duration
 * - WAIT supports decimal seconds, variable expansion, and validation
 * - PAUSE shows a UI prompt and resumes on user confirmation
 * - PAUSE returns USER_ABORT when the dialog is cancelled
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MacroExecutor,
  createExecutor,
  executeMacro,
  IMACROS_ERROR_CODES,
} from '@shared/executor';
import {
  waitHandler,
  pauseHandler,
  setFlowControlUI,
  resetFlowControlUI,
  FlowControlUI,
} from '@shared/commands/flow';

// ---------------------------------------------------------------------------
// A. Tests for the executor's built-in WAIT and PAUSE handlers
//    (registered automatically inside MacroExecutor.registerBuiltinHandlers)
// ---------------------------------------------------------------------------

describe('Executor built-in WAIT handler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should delay execution for the requested integer seconds', async () => {
    const executor = createExecutor();
    executor.loadMacro('WAIT SECONDS=2');

    const resultPromise = executor.execute();

    // Advance past the 2-second delay
    await vi.advanceTimersByTimeAsync(2000);

    const result = await resultPromise;
    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  it('should delay execution for decimal seconds (0.5)', async () => {
    const executor = createExecutor();
    executor.loadMacro('WAIT SECONDS=0.5');

    const resultPromise = executor.execute();

    // Advance past 500ms
    await vi.advanceTimersByTimeAsync(500);

    const result = await resultPromise;
    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  it('should expand variables in the SECONDS parameter', async () => {
    const executor = createExecutor();
    // Use SET to define the variable before WAIT so it survives resetForExecution
    executor.loadMacro('SET !VAR1 1\nWAIT SECONDS={{!VAR1}}');

    const resultPromise = executor.execute();

    // The expanded value is 1 second = 1000ms
    await vi.advanceTimersByTimeAsync(1000);

    const result = await resultPromise;
    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  it('should fail when SECONDS parameter is missing', async () => {
    // The built-in handler calls getRequiredParam which throws, so the
    // executor wraps it as a SCRIPT_ERROR.
    const executor = createExecutor();
    executor.loadMacro('WAIT');

    const result = await executor.execute();
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
  });

  it('should fail when SECONDS is negative', async () => {
    const executor = createExecutor();
    executor.loadMacro('WAIT SECONDS=-1');

    const result = await executor.execute();
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
  });

  it('should fail when SECONDS is not a number', async () => {
    const executor = createExecutor();
    executor.loadMacro('WAIT SECONDS=abc');

    const result = await executor.execute();
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
  });

  it('should handle WAIT SECONDS=0 by clamping to 10ms (yield behavior)', async () => {
    // SECONDS=0 is clamped to 10ms matching original iMacros 8.9.7 yield behavior
    const executor = createExecutor();
    executor.loadMacro('WAIT SECONDS=0');

    const resultPromise = executor.execute();
    // 0 is clamped to 10ms, advance past it
    await vi.advanceTimersByTimeAsync(100);

    const result = await resultPromise;
    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });
});

// ---------------------------------------------------------------------------
// B. Tests for the executor's built-in PAUSE handler
//    (sets this.pauseFlag = true, requires external resume() call)
// ---------------------------------------------------------------------------

describe('Executor built-in PAUSE handler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should pause execution and resume when resume() is called', async () => {
    const executor = createExecutor();
    // Two commands: PAUSE then a VERSION (no-op). Execution should stall
    // after PAUSE until we call resume().
    executor.loadMacro('PAUSE\nVERSION BUILD=1');

    const resultPromise = executor.execute();

    // Let the executor run until it hits the pause
    await vi.advanceTimersByTimeAsync(0);

    // Executor should now be paused
    // Resume execution
    executor.resume();

    // Advance timers to let execution complete
    await vi.advanceTimersByTimeAsync(0);

    const result = await resultPromise;
    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  it('should stop execution when stop() is called during pause', async () => {
    const executor = createExecutor();
    executor.loadMacro('PAUSE\nVERSION BUILD=1');

    const resultPromise = executor.execute();

    // Let the executor reach the pause point
    await vi.advanceTimersByTimeAsync(0);

    // Stop instead of resume
    executor.stop();

    await vi.advanceTimersByTimeAsync(0);

    const result = await resultPromise;
    // Stopping aborts execution; the built-in PAUSE returns success but
    // the executor loop detects the abort flag and completes.
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// C. Tests for the flow.ts standalone waitHandler
//    (used when registered via registerFlowHandlers or manually)
// ---------------------------------------------------------------------------

describe('flow.ts waitHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should delay for the specified seconds via the executor', async () => {
    const executor = createExecutor();
    // Override built-in WAIT with the flow.ts handler
    executor.registerHandler('WAIT', waitHandler);
    executor.loadMacro('WAIT SECONDS=3');

    const resultPromise = executor.execute();

    await vi.advanceTimersByTimeAsync(3000);

    const result = await resultPromise;
    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  it('should handle decimal seconds (0.5)', async () => {
    const executor = createExecutor();
    executor.registerHandler('WAIT', waitHandler);
    executor.loadMacro('WAIT SECONDS=0.5');

    const resultPromise = executor.execute();

    await vi.advanceTimersByTimeAsync(500);

    const result = await resultPromise;
    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  it('should expand variables in the SECONDS parameter', async () => {
    const executor = createExecutor();
    executor.registerHandler('WAIT', waitHandler);
    // Use SET to define the variable before WAIT so it survives resetForExecution
    executor.loadMacro('SET !VAR2 2\nWAIT SECONDS={{!VAR2}}');

    const resultPromise = executor.execute();

    await vi.advanceTimersByTimeAsync(2000);

    const result = await resultPromise;
    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  it('should return MISSING_PARAMETER error when SECONDS is absent', async () => {
    const executor = createExecutor();
    executor.registerHandler('WAIT', waitHandler);
    executor.setErrorIgnore(false);
    executor.loadMacro('WAIT');

    // WAIT without SECONDS parsed by parser results in no SECONDS param.
    // However, the parser validation would flag it. The handler still runs
    // because we loaded without strict validation errors stopping execution.
    // The waitHandler from flow.ts checks getParam('SECONDS') which returns
    // undefined, so it returns MISSING_PARAMETER.
    const result = await executor.execute();
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
  });

  it('should return INVALID_PARAMETER for negative seconds', async () => {
    const executor = createExecutor();
    executor.registerHandler('WAIT', waitHandler);
    executor.loadMacro('WAIT SECONDS=-5');

    const result = await executor.execute();
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
  });

  it('should cap wait time when !TIMEOUT_STEP is set lower', async () => {
    const executor = createExecutor();
    executor.registerHandler('WAIT', waitHandler);
    // Set !TIMEOUT_STEP to 2, request WAIT SECONDS=10
    // The handler should cap at 2s
    executor.loadMacro('SET !TIMEOUT_STEP 2\nWAIT SECONDS=10');

    const resultPromise = executor.execute();

    // The WAIT should be capped at 2 seconds (2000ms)
    await vi.advanceTimersByTimeAsync(2000);

    const result = await resultPromise;
    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });
});

// ---------------------------------------------------------------------------
// D. Tests for the flow.ts pauseHandler
//    (uses FlowControlUI.showPause callback)
// ---------------------------------------------------------------------------

describe('flow.ts pauseHandler', () => {
  afterEach(() => {
    resetFlowControlUI();
  });

  it('should call showPause and succeed when resolved', async () => {
    const mockUI: FlowControlUI = {
      showPause: vi.fn().mockResolvedValue(undefined),
      showPrompt: vi.fn().mockResolvedValue(''),
      showAlert: vi.fn().mockResolvedValue(undefined),
    };
    setFlowControlUI(mockUI);

    const executor = createExecutor();
    // Override the built-in PAUSE with the flow.ts handler
    executor.registerHandler('PAUSE', pauseHandler);
    executor.loadMacro('PAUSE');

    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    expect(mockUI.showPause).toHaveBeenCalledTimes(1);
    expect(mockUI.showPause).toHaveBeenCalledWith(
      'Macro execution paused. Click OK to continue.'
    );
  });

  it('should return USER_ABORT when showPause is rejected (user cancelled)', async () => {
    const mockUI: FlowControlUI = {
      showPause: vi.fn().mockRejectedValue(new Error('User cancelled')),
      showPrompt: vi.fn().mockResolvedValue(''),
      showAlert: vi.fn().mockResolvedValue(undefined),
    };
    setFlowControlUI(mockUI);

    const executor = createExecutor();
    executor.registerHandler('PAUSE', pauseHandler);
    executor.loadMacro('PAUSE');

    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.USER_ABORT);
    expect(mockUI.showPause).toHaveBeenCalledTimes(1);
  });

  it('should stop execution after cancelled PAUSE (stopExecution flag)', async () => {
    const mockUI: FlowControlUI = {
      showPause: vi.fn().mockRejectedValue(new Error('cancelled')),
      showPrompt: vi.fn().mockResolvedValue(''),
      showAlert: vi.fn().mockResolvedValue(undefined),
    };
    setFlowControlUI(mockUI);

    const executor = createExecutor();
    executor.registerHandler('PAUSE', pauseHandler);
    // PAUSE followed by another command -- the second should NOT run
    executor.loadMacro('PAUSE\nVERSION BUILD=1');

    const result = await executor.execute();

    // The pauseHandler returns stopExecution: true on cancel,
    // so executor stops and reports success (the handler returned
    // stopExecution which the executor treats as intentional stop).
    // Actually, looking at the code: the executor checks result.success
    // first. If !success and !errorIgnore, it returns the error result.
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.USER_ABORT);
  });

  it('should use default no-op UI in headless mode (no UI set)', async () => {
    // Reset to default UI which is a no-op (resolves immediately)
    resetFlowControlUI();

    const executor = createExecutor();
    executor.registerHandler('PAUSE', pauseHandler);
    executor.loadMacro('PAUSE');

    const result = await executor.execute();

    // Default UI resolves showPause immediately, so it should succeed
    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });
});

// ---------------------------------------------------------------------------
// E. End-to-end: multi-command macros mixing WAIT and PAUSE
// ---------------------------------------------------------------------------

describe('WAIT and PAUSE in multi-command macros', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetFlowControlUI();
  });

  it('should execute SET then WAIT then SET successfully', async () => {
    const executor = createExecutor();
    executor.loadMacro(
      'SET !VAR1 before\nWAIT SECONDS=1\nSET !VAR2 after'
    );

    const resultPromise = executor.execute();

    await vi.advanceTimersByTimeAsync(1000);

    const result = await resultPromise;
    expect(result.success).toBe(true);
    expect(result.variables['!VAR1']).toBe('before');
    expect(result.variables['!VAR2']).toBe('after');
  });

  it('should execute multiple WAIT commands in sequence', async () => {
    const executor = createExecutor();
    executor.loadMacro('WAIT SECONDS=1\nWAIT SECONDS=2');

    const resultPromise = executor.execute();

    // First WAIT: 1s
    await vi.advanceTimersByTimeAsync(1000);
    // Second WAIT: 2s
    await vi.advanceTimersByTimeAsync(2000);

    const result = await resultPromise;
    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  it('should handle WAIT with flow.ts pauseHandler in same macro', async () => {
    const mockUI: FlowControlUI = {
      showPause: vi.fn().mockResolvedValue(undefined),
      showPrompt: vi.fn().mockResolvedValue(''),
      showAlert: vi.fn().mockResolvedValue(undefined),
    };
    setFlowControlUI(mockUI);

    const executor = createExecutor();
    executor.registerHandler('PAUSE', pauseHandler);
    executor.loadMacro('WAIT SECONDS=1\nPAUSE');

    const resultPromise = executor.execute();

    // Advance past the WAIT
    await vi.advanceTimersByTimeAsync(1000);

    const result = await resultPromise;
    expect(result.success).toBe(true);
    expect(mockUI.showPause).toHaveBeenCalledTimes(1);
  });

  it('should handle a macro with three consecutive WAIT commands', async () => {
    const executor = createExecutor();
    executor.loadMacro('WAIT SECONDS=1\nWAIT SECONDS=1\nWAIT SECONDS=1');

    const resultPromise = executor.execute();

    // Advance past all three WAITs (3 seconds total)
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    const result = await resultPromise;
    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  it('should handle WAIT with very small decimal value (0.1)', async () => {
    const executor = createExecutor();
    executor.loadMacro('WAIT SECONDS=0.1');

    const resultPromise = executor.execute();

    await vi.advanceTimersByTimeAsync(100);

    const result = await resultPromise;
    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  it('should set variable before and after WAIT', async () => {
    const executor = createExecutor();
    executor.loadMacro(
      'SET !VAR1 before\nSET !VAR2 also-before\nWAIT SECONDS=1\nSET !VAR3 after'
    );

    const resultPromise = executor.execute();

    await vi.advanceTimersByTimeAsync(1000);

    const result = await resultPromise;
    expect(result.success).toBe(true);
    expect(result.variables['!VAR1']).toBe('before');
    expect(result.variables['!VAR2']).toBe('also-before');
    expect(result.variables['!VAR3']).toBe('after');
  });
});
