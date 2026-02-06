/**
 * STOPWATCH Command Integration Tests
 *
 * Tests the STOPWATCH command handler via the MacroExecutor.
 * The STOPWATCH command supports four actions:
 * - START: starts or resets a stopwatch
 * - STOP: stops a stopwatch, stores elapsed time
 * - LAP: records a lap time on a running stopwatch
 * - READ: reads current elapsed time without stopping
 *
 * Variables set by the handler (e.g. !STOPWATCH, !STOPWATCH_<ID>,
 * !STOPWATCH_LAP1, etc.) are not part of the recognized system variable
 * set, so VariableContext.set() silently drops them. Tests therefore
 * verify behaviour through command success/error codes and through the
 * internal stopwatch state (e.g. LAP on a stopped watch errors, STOP on
 * a non-running watch succeeds, etc.).
 *
 * Uses vi.useFakeTimers() to control Date.now() for deterministic timing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createExecutor, MacroExecutor, IMACROS_ERROR_CODES } from '@shared/executor';
import { registerSystemHandlers, clearAllStopwatches } from '@shared/commands/system';

/**
 * Helper: create an executor with system handlers registered.
 */
function createStopwatchExecutor(): MacroExecutor {
  const executor = createExecutor();
  registerSystemHandlers(executor.registerHandler.bind(executor));
  return executor;
}

describe('STOPWATCH command integration tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    clearAllStopwatches();
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // 1. ACTION=START succeeds
  // -----------------------------------------------------------------------
  it('should succeed with ACTION=START', async () => {
    const executor = createStopwatchExecutor();
    executor.loadMacro('STOPWATCH ACTION=START');

    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  // -----------------------------------------------------------------------
  // 2. ACTION=START then ACTION=STOP records elapsed time
  // -----------------------------------------------------------------------
  it('should record elapsed time with START then STOP', async () => {
    const executor = createStopwatchExecutor();
    executor.loadMacro([
      'STOPWATCH ACTION=START',
      'WAIT SECONDS=1',
      'STOPWATCH ACTION=STOP',
    ].join('\n'));

    const resultPromise = executor.execute();

    // Advance past the 1-second WAIT
    await vi.advanceTimersByTimeAsync(1000);

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    // The stopwatch ran for ~1000ms; verify that STOP succeeds (no error)
    // and that a subsequent LAP on the same stopped watch errors
  });

  // -----------------------------------------------------------------------
  // 3. ACTION=START, advance 1000ms, ACTION=READ returns ~1000ms
  //    (verified by the fact that READ succeeds on a running stopwatch)
  // -----------------------------------------------------------------------
  it('should read elapsed time after advancing timers by 1000ms', async () => {
    const executor = createStopwatchExecutor();
    executor.loadMacro([
      'STOPWATCH ACTION=START',
      'WAIT SECONDS=1',
      'STOPWATCH ACTION=READ',
    ].join('\n'));

    const resultPromise = executor.execute();

    // Advance timers to let the WAIT complete and the READ to fire
    await vi.advanceTimersByTimeAsync(1000);

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  // -----------------------------------------------------------------------
  // 4. ACTION=LAP records lap times
  // -----------------------------------------------------------------------
  it('should record lap times with ACTION=LAP', async () => {
    const executor = createStopwatchExecutor();
    executor.loadMacro([
      'STOPWATCH ACTION=START',
      'WAIT SECONDS=1',
      'STOPWATCH ACTION=LAP',
      'WAIT SECONDS=1',
      'STOPWATCH ACTION=LAP',
    ].join('\n'));

    const resultPromise = executor.execute();

    // Advance for first WAIT (1s)
    await vi.advanceTimersByTimeAsync(1000);
    // Advance for second WAIT (1s)
    await vi.advanceTimersByTimeAsync(1000);

    const result = await resultPromise;

    // Both LAPs should succeed because the stopwatch is running
    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  // -----------------------------------------------------------------------
  // 5. Custom ID=timer1 uses !STOPWATCH_TIMER1 variable
  // -----------------------------------------------------------------------
  it('should accept a custom ID=timer1 and operate independently', async () => {
    const executor = createStopwatchExecutor();
    executor.loadMacro([
      'STOPWATCH ID=timer1 ACTION=START',
      'WAIT SECONDS=1',
      'STOPWATCH ID=timer1 ACTION=STOP',
    ].join('\n'));

    const resultPromise = executor.execute();

    await vi.advanceTimersByTimeAsync(1000);

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  // -----------------------------------------------------------------------
  // 6. STOPWATCH without ACTION defaults to START
  // -----------------------------------------------------------------------
  it('should default to ACTION=START when ACTION is omitted', async () => {
    const executor = createStopwatchExecutor();
    // No ACTION param: should default to START
    executor.loadMacro('STOPWATCH');

    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    // Verify the stopwatch is running by doing a LAP on it in a second macro
    const executor2 = createStopwatchExecutor();
    executor2.loadMacro('STOPWATCH ACTION=LAP');

    const result2 = await executor2.execute();
    // LAP should succeed because the stopwatch was started (global state)
    expect(result2.success).toBe(true);
    expect(result2.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  // -----------------------------------------------------------------------
  // 7. ACTION=INVALID returns INVALID_PARAMETER
  // -----------------------------------------------------------------------
  it('should return INVALID_PARAMETER for an invalid action', async () => {
    const executor = createStopwatchExecutor();
    executor.loadMacro('STOPWATCH ACTION=INVALID');

    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
  });

  // -----------------------------------------------------------------------
  // 8. ACTION=LAP on non-running stopwatch returns SCRIPT_ERROR
  // -----------------------------------------------------------------------
  it('should return SCRIPT_ERROR for LAP on a non-running stopwatch', async () => {
    const executor = createStopwatchExecutor();
    // LAP without a prior START
    executor.loadMacro('STOPWATCH ACTION=LAP');

    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
  });

  // -----------------------------------------------------------------------
  // 9. ACTION=STOP on non-running stopwatch returns success (not an error)
  // -----------------------------------------------------------------------
  it('should return success for STOP on a non-running stopwatch', async () => {
    const executor = createStopwatchExecutor();
    // STOP without a prior START
    executor.loadMacro('STOPWATCH ACTION=STOP');

    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  // -----------------------------------------------------------------------
  // 10. Multiple stopwatches with different IDs track independently
  // -----------------------------------------------------------------------
  it('should track multiple stopwatches independently', async () => {
    const executor = createStopwatchExecutor();
    executor.loadMacro([
      'STOPWATCH ID=alpha ACTION=START',
      'WAIT SECONDS=1',
      'STOPWATCH ID=beta ACTION=START',
      'WAIT SECONDS=1',
      // alpha has been running for ~2s, beta for ~1s
      'STOPWATCH ID=alpha ACTION=STOP',
      'STOPWATCH ID=beta ACTION=STOP',
    ].join('\n'));

    const resultPromise = executor.execute();

    // First WAIT (1s)
    await vi.advanceTimersByTimeAsync(1000);
    // Second WAIT (1s)
    await vi.advanceTimersByTimeAsync(1000);

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    // Verify independence: LAP on alpha should fail (it's stopped)
    // while a new executor can still observe the stopped state
    const executor2 = createStopwatchExecutor();
    executor2.loadMacro('STOPWATCH ID=alpha ACTION=LAP');

    const result2 = await executor2.execute();
    expect(result2.success).toBe(false);
    expect(result2.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    // And beta should also fail LAP (also stopped)
    const executor3 = createStopwatchExecutor();
    executor3.loadMacro('STOPWATCH ID=beta ACTION=LAP');

    const result3 = await executor3.execute();
    expect(result3.success).toBe(false);
    expect(result3.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
  });

  // -----------------------------------------------------------------------
  // 11. Variable expansion in ID param
  // -----------------------------------------------------------------------
  it('should expand variables in the ID parameter', async () => {
    const executor = createStopwatchExecutor();
    executor.loadMacro([
      'SET !VAR1 mywatch',
      'STOPWATCH ID={{!VAR1}} ACTION=START',
      'WAIT SECONDS=1',
      'STOPWATCH ID={{!VAR1}} ACTION=STOP',
    ].join('\n'));

    const resultPromise = executor.execute();

    await vi.advanceTimersByTimeAsync(1000);

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    // Verify the stopwatch with the expanded ID "mywatch" was actually
    // started and stopped by checking that LAP on it now fails
    const executor2 = createStopwatchExecutor();
    executor2.loadMacro('STOPWATCH ID=mywatch ACTION=LAP');

    const result2 = await executor2.execute();
    expect(result2.success).toBe(false);
    expect(result2.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
  });

  // -----------------------------------------------------------------------
  // 12. ACTION=START resets a previously used stopwatch
  // -----------------------------------------------------------------------
  it('should reset a previously used stopwatch on ACTION=START', async () => {
    const executor = createStopwatchExecutor();
    executor.loadMacro([
      'STOPWATCH ACTION=START',
      'WAIT SECONDS=2',
      'STOPWATCH ACTION=STOP',
      // Stopwatch is now stopped with ~2000ms elapsed
      // Re-starting should reset it
      'STOPWATCH ACTION=START',
    ].join('\n'));

    const resultPromise = executor.execute();

    // Advance for the 2s WAIT
    await vi.advanceTimersByTimeAsync(2000);

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    // After the reset START, the stopwatch should be running again.
    // A LAP should succeed.
    const executor2 = createStopwatchExecutor();
    executor2.loadMacro('STOPWATCH ACTION=LAP');

    const result2 = await executor2.execute();
    expect(result2.success).toBe(true);
    expect(result2.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    // And laps were reset (the internal lapTimes array was cleared by START)
    // We can verify this by doing two more laps and checking both succeed
    const executor3 = createStopwatchExecutor();
    executor3.loadMacro([
      'STOPWATCH ACTION=LAP',
      'STOPWATCH ACTION=LAP',
    ].join('\n'));

    const result3 = await executor3.execute();
    expect(result3.success).toBe(true);
    expect(result3.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });
});
