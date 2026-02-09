/**
 * STOPWATCH Command Integration Tests
 *
 * Tests the STOPWATCH command handler via the MacroExecutor.
 * Supports original iMacros 8.9.7 syntax and behavior:
 * - Toggle: STOPWATCH ID=x (start if not running, stop if running)
 * - Explicit: STOPWATCH START ID=x / STOPWATCH STOP ID=x
 * - Extended: STOPWATCH ID=x ACTION=START/STOP/LAP/READ
 * - Label: STOPWATCH LABEL=name (record timestamp)
 * - !STOPWATCHTIME: set on stop and label operations
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

    await vi.advanceTimersByTimeAsync(1000);

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  // -----------------------------------------------------------------------
  // 3. ACTION=READ succeeds on a running stopwatch
  // -----------------------------------------------------------------------
  it('should read elapsed time after advancing timers by 1000ms', async () => {
    const executor = createStopwatchExecutor();
    executor.loadMacro([
      'STOPWATCH ACTION=START',
      'WAIT SECONDS=1',
      'STOPWATCH ACTION=READ',
    ].join('\n'));

    const resultPromise = executor.execute();

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

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  // -----------------------------------------------------------------------
  // 5. Custom ID=timer1
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
  // 6. Bare STOPWATCH toggles (starts on first call)
  // -----------------------------------------------------------------------
  it('should toggle: start on first call, stop on second', async () => {
    const executor = createStopwatchExecutor();
    // First bare STOPWATCH: toggles → starts (not running)
    executor.loadMacro('STOPWATCH');

    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    // Verify it's running by doing a LAP
    const executor2 = createStopwatchExecutor();
    executor2.loadMacro('STOPWATCH ACTION=LAP');

    const result2 = await executor2.execute();
    expect(result2.success).toBe(true);
    expect(result2.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    // Second bare STOPWATCH: toggles → stops (was running)
    const executor3 = createStopwatchExecutor();
    executor3.loadMacro('STOPWATCH');

    const result3 = await executor3.execute();
    expect(result3.success).toBe(true);
    expect(result3.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    // Verify it's stopped: LAP should now fail
    const executor4 = createStopwatchExecutor();
    executor4.loadMacro('STOPWATCH ACTION=LAP');

    const result4 = await executor4.execute();
    expect(result4.success).toBe(false);
    expect(result4.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
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
    executor.loadMacro('STOPWATCH ACTION=LAP');

    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
  });

  // -----------------------------------------------------------------------
  // 9. Explicit STOP on non-running stopwatch returns error (original 962)
  // -----------------------------------------------------------------------
  it('should return SCRIPT_ERROR for explicit STOP on a non-running stopwatch', async () => {
    const executor = createStopwatchExecutor();
    executor.loadMacro('STOPWATCH ACTION=STOP');

    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
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
      'STOPWATCH ID=alpha ACTION=STOP',
      'STOPWATCH ID=beta ACTION=STOP',
    ].join('\n'));

    const resultPromise = executor.execute();

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    // LAP on alpha should fail (it's stopped)
    const executor2 = createStopwatchExecutor();
    executor2.loadMacro('STOPWATCH ID=alpha ACTION=LAP');

    const result2 = await executor2.execute();
    expect(result2.success).toBe(false);
    expect(result2.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
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

    // Verify the stopwatch with the expanded ID was stopped
    const executor2 = createStopwatchExecutor();
    executor2.loadMacro('STOPWATCH ID=MYWATCH ACTION=LAP');

    const result2 = await executor2.execute();
    expect(result2.success).toBe(false);
    expect(result2.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
  });

  // -----------------------------------------------------------------------
  // 12. ACTION=START on already-running stopwatch returns error (original 961)
  // -----------------------------------------------------------------------
  it('should return SCRIPT_ERROR for START on already-running stopwatch', async () => {
    const executor = createStopwatchExecutor();
    executor.loadMacro([
      'STOPWATCH ACTION=START',
      'STOPWATCH ACTION=START',
    ].join('\n'));

    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
  });

  // -----------------------------------------------------------------------
  // 13. PREFIX SYNTAX: STOPWATCH START ID=timer1
  // -----------------------------------------------------------------------
  it('should support START ID=x prefix syntax', async () => {
    const executor = createStopwatchExecutor();
    executor.loadMacro([
      'STOPWATCH START ID=timer1',
      'WAIT SECONDS=1',
      'STOPWATCH STOP ID=timer1',
    ].join('\n'));

    const resultPromise = executor.execute();

    await vi.advanceTimersByTimeAsync(1000);

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  // -----------------------------------------------------------------------
  // 14. LABEL parameter records a timestamp
  // -----------------------------------------------------------------------
  it('should support LABEL parameter', async () => {
    const executor = createStopwatchExecutor();
    executor.loadMacro([
      'STOPWATCH ACTION=START',
      'WAIT SECONDS=1',
      'STOPWATCH LABEL=checkpoint1',
    ].join('\n'));

    const resultPromise = executor.execute();

    await vi.advanceTimersByTimeAsync(1000);

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  // -----------------------------------------------------------------------
  // 15. Toggle with ID (original sample macro pattern)
  // -----------------------------------------------------------------------
  it('should toggle stopwatch with ID (start then stop)', async () => {
    const executor = createStopwatchExecutor();
    executor.loadMacro([
      'STOPWATCH ID=Total',          // Toggle → start (not running)
      'STOPWATCH ID=Firstpage',      // Toggle → start
      'WAIT SECONDS=1',
      'STOPWATCH ID=Firstpage',      // Toggle → stop (was running)
      'STOPWATCH ID=Total',          // Toggle → stop (was running)
    ].join('\n'));

    const resultPromise = executor.execute();

    await vi.advanceTimersByTimeAsync(1000);

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  // -----------------------------------------------------------------------
  // 16. Explicit START after STOP works (restart)
  // -----------------------------------------------------------------------
  it('should allow explicit START after STOP', async () => {
    const executor = createStopwatchExecutor();
    executor.loadMacro([
      'STOPWATCH ACTION=START',
      'WAIT SECONDS=1',
      'STOPWATCH ACTION=STOP',
      'STOPWATCH ACTION=START',
    ].join('\n'));

    const resultPromise = executor.execute();

    await vi.advanceTimersByTimeAsync(1000);

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    // Verify the stopwatch is running again
    const executor2 = createStopwatchExecutor();
    executor2.loadMacro('STOPWATCH ACTION=LAP');

    const result2 = await executor2.execute();
    expect(result2.success).toBe(true);
    expect(result2.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  // -----------------------------------------------------------------------
  // 17. PREFIX SYNTAX: STOP on non-started errors
  // -----------------------------------------------------------------------
  it('should error on prefix STOP for non-started stopwatch', async () => {
    const executor = createStopwatchExecutor();
    executor.loadMacro('STOPWATCH STOP ID=nonexistent');

    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
  });

  // -----------------------------------------------------------------------
  // 18. PREFIX SYNTAX: START on already-running errors
  // -----------------------------------------------------------------------
  it('should error on prefix START for already-running stopwatch', async () => {
    const executor = createStopwatchExecutor();
    executor.loadMacro([
      'STOPWATCH START ID=timer1',
      'STOPWATCH START ID=timer1',
    ].join('\n'));

    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
  });
});
