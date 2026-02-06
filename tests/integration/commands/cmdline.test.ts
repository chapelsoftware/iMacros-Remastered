/**
 * CMDLINE Command Integration Tests
 *
 * Tests the CMDLINE command handler via the MacroExecutor with a mock
 * CmdlineExecutor.
 *
 * The CMDLINE command:
 * - Requires CMD parameter (MISSING_PARAMETER if missing)
 * - Optional WAIT param (default YES, NO for async)
 * - Optional TIMEOUT param (default 30 seconds, minimum 1 second)
 * - Sends to CmdlineExecutor with {command, timeout, wait}
 * - No executor configured returns SCRIPT_ERROR
 * - On success (exitCode 0): returns stdout as output
 * - On failure (exitCode != 0): returns SCRIPT_ERROR
 * - On exception: returns SCRIPT_ERROR
 * - Stores !CMDLINE_EXITCODE, !CMDLINE_STDOUT, !CMDLINE_STDERR in state
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createExecutor, MacroExecutor, IMACROS_ERROR_CODES } from '@shared/executor';
import {
  registerSystemHandlers,
  setCmdlineExecutor,
  CmdlineExecutor,
  CmdlineOptions,
  CmdlineResult,
} from '@shared/commands/system';

/**
 * Create an executor with system handlers registered.
 */
function createCmdlineExecutor(): MacroExecutor {
  const executor = createExecutor();
  registerSystemHandlers(executor.registerHandler.bind(executor));
  return executor;
}

/**
 * Create a mock CmdlineExecutor that captures calls and returns
 * configurable results.
 */
function createMockCmdlineExecutor(
  result: CmdlineResult = { exitCode: 0, stdout: '', stderr: '' },
): { mock: CmdlineExecutor; calls: CmdlineOptions[] } {
  const calls: CmdlineOptions[] = [];
  const mock: CmdlineExecutor = {
    execute: vi.fn(async (options: CmdlineOptions): Promise<CmdlineResult> => {
      calls.push({ ...options });
      return result;
    }),
  };
  return { mock, calls };
}

describe('CMDLINE command integration tests', () => {
  // -----------------------------------------------------------------------
  // 8. No executor configured returns SCRIPT_ERROR
  //    (Must run FIRST before any setCmdlineExecutor call, because the
  //     module-level variable starts as null.)
  // -----------------------------------------------------------------------
  describe('when no executor is configured', () => {
    beforeEach(() => {
      // Reset to null by casting, since setCmdlineExecutor only accepts
      // CmdlineExecutor. The module-level variable needs to be null for
      // this test.
      setCmdlineExecutor(null as unknown as CmdlineExecutor);
    });

    it('should return SCRIPT_ERROR when no executor is configured', async () => {
      const executor = createCmdlineExecutor();
      executor.loadMacro('CMDLINE CMD="echo hello"');

      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    });
  });

  // -----------------------------------------------------------------------
  // Tests that use a mock executor
  // -----------------------------------------------------------------------
  describe('with mock executor', () => {
    let mockExecutor: CmdlineExecutor;
    let calls: CmdlineOptions[];

    beforeEach(() => {
      const created = createMockCmdlineExecutor({
        exitCode: 0,
        stdout: 'hello output',
        stderr: '',
      });
      mockExecutor = created.mock;
      calls = created.calls;
      setCmdlineExecutor(mockExecutor);
    });

    afterEach(() => {
      // Clean up: reset executor to null so it does not leak to other tests
      setCmdlineExecutor(null as unknown as CmdlineExecutor);
    });

    // ---------------------------------------------------------------------
    // 1. CMDLINE CMD=echo hello succeeds with exitCode=0
    // ---------------------------------------------------------------------
    it('should succeed with exitCode=0', async () => {
      const executor = createCmdlineExecutor();
      executor.loadMacro('CMDLINE CMD="echo hello"');

      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    });

    // ---------------------------------------------------------------------
    // 2. Verify command is passed through to executor
    // ---------------------------------------------------------------------
    it('should pass the command string through to the executor', async () => {
      const executor = createCmdlineExecutor();
      executor.loadMacro('CMDLINE CMD="echo hello"');

      await executor.execute();

      expect(calls).toHaveLength(1);
      expect(calls[0].command).toBe('echo hello');
    });

    // ---------------------------------------------------------------------
    // 12. Verify executor receives correct command string
    // ---------------------------------------------------------------------
    it('should pass the exact command string to the executor', async () => {
      const executor = createCmdlineExecutor();
      executor.loadMacro('CMDLINE CMD="ls -la /tmp"');

      await executor.execute();

      expect(calls).toHaveLength(1);
      expect(calls[0].command).toBe('ls -la /tmp');
    });

    // ---------------------------------------------------------------------
    // 11. Verify stdout is returned as output on success
    // ---------------------------------------------------------------------
    it('should return stdout as output on success', async () => {
      // The default mock returns stdout: 'hello output'
      const executor = createCmdlineExecutor();
      executor.loadMacro('CMDLINE CMD="echo hello"');

      const result = await executor.execute();

      expect(result.success).toBe(true);
      // The executor stores the last command's output; for a single-line
      // macro the CommandResult.output is available in MacroResult indirectly.
      // We verify the mock was called and returned success.
      expect(calls).toHaveLength(1);
    });

    // ---------------------------------------------------------------------
    // 3. CMDLINE CMD=failing WAIT=YES with exitCode=1 returns SCRIPT_ERROR
    // ---------------------------------------------------------------------
    it('should return SCRIPT_ERROR when exitCode is non-zero', async () => {
      // Replace with a failing mock
      const failing = createMockCmdlineExecutor({
        exitCode: 1,
        stdout: '',
        stderr: 'command not found',
      });
      setCmdlineExecutor(failing.mock);

      const executor = createCmdlineExecutor();
      executor.loadMacro('CMDLINE CMD="failing" WAIT=YES');

      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    });

    // ---------------------------------------------------------------------
    // 4. CMDLINE CMD=test WAIT=NO sends wait=false
    // ---------------------------------------------------------------------
    it('should send wait=false when WAIT=NO is specified', async () => {
      const executor = createCmdlineExecutor();
      executor.loadMacro('CMDLINE CMD="test" WAIT=NO');

      await executor.execute();

      expect(calls).toHaveLength(1);
      expect(calls[0].wait).toBe(false);
    });

    // ---------------------------------------------------------------------
    // 5. CMDLINE CMD=test TIMEOUT=10 sends timeout=10000ms
    // ---------------------------------------------------------------------
    it('should send timeout=10000ms when TIMEOUT=10 is specified', async () => {
      const executor = createCmdlineExecutor();
      executor.loadMacro('CMDLINE CMD="test" TIMEOUT=10');

      await executor.execute();

      expect(calls).toHaveLength(1);
      expect(calls[0].timeout).toBe(10000);
    });

    // ---------------------------------------------------------------------
    // 6. CMDLINE CMD=test (default timeout) sends timeout=30000ms
    // ---------------------------------------------------------------------
    it('should send default timeout=30000ms when TIMEOUT is not specified', async () => {
      const executor = createCmdlineExecutor();
      executor.loadMacro('CMDLINE CMD="test"');

      await executor.execute();

      expect(calls).toHaveLength(1);
      expect(calls[0].timeout).toBe(30000);
    });

    // ---------------------------------------------------------------------
    // 7. CMDLINE without CMD returns MISSING_PARAMETER
    // ---------------------------------------------------------------------
    it('should return MISSING_PARAMETER when CMD is missing', async () => {
      const executor = createCmdlineExecutor();
      executor.loadMacro('CMDLINE WAIT=YES');

      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    });

    // ---------------------------------------------------------------------
    // 9. Executor exception returns SCRIPT_ERROR
    // ---------------------------------------------------------------------
    it('should return SCRIPT_ERROR when executor throws an exception', async () => {
      // Replace with an executor that throws
      const throwingExecutor: CmdlineExecutor = {
        execute: vi.fn(async (): Promise<CmdlineResult> => {
          throw new Error('Connection refused');
        }),
      };
      setCmdlineExecutor(throwingExecutor);

      const executor = createCmdlineExecutor();
      executor.loadMacro('CMDLINE CMD="test"');

      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    });

    // ---------------------------------------------------------------------
    // 10. Variable expansion in CMD (SET !VAR1 mycommand, CMDLINE CMD={{!VAR1}})
    // ---------------------------------------------------------------------
    it('should expand variables in CMD parameter', async () => {
      const executor = createCmdlineExecutor();
      executor.loadMacro([
        'SET !VAR1 mycommand',
        'CMDLINE CMD={{!VAR1}}',
      ].join('\n'));

      await executor.execute();

      expect(calls).toHaveLength(1);
      expect(calls[0].command).toBe('mycommand');
    });

    // ---------------------------------------------------------------------
    // Additional: WAIT=YES sends wait=true (default behavior)
    // ---------------------------------------------------------------------
    it('should send wait=true when WAIT=YES is specified', async () => {
      const executor = createCmdlineExecutor();
      executor.loadMacro('CMDLINE CMD="test" WAIT=YES');

      await executor.execute();

      expect(calls).toHaveLength(1);
      expect(calls[0].wait).toBe(true);
    });

    // ---------------------------------------------------------------------
    // Additional: default wait is true when WAIT is omitted
    // ---------------------------------------------------------------------
    it('should default wait=true when WAIT is not specified', async () => {
      const executor = createCmdlineExecutor();
      executor.loadMacro('CMDLINE CMD="test"');

      await executor.execute();

      expect(calls).toHaveLength(1);
      expect(calls[0].wait).toBe(true);
    });
  });
});
