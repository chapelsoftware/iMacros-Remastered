/**
 * VERSION Command Integration Tests
 *
 * Tests the VERSION command handler via the MacroExecutor.
 * The VERSION command:
 * - Returns the current version string as output
 * - Stores version info in state variables (!VERSION, !VERSION_MAJOR, etc.)
 *   -- though these are not in the recognized SYSTEM_VARIABLES list,
 *      so setVariable() silently drops them
 * - Accepts an optional BUILD param for minimum version checking:
 *   - If current version >= BUILD, succeeds with OK
 *   - If current version < BUILD, fails with SCRIPT_ERROR
 * - Default version: 8.9.7, platform: firefox
 * - setVersionInfo() can override the default version
 *
 * Tests focus on the return value (success/errorCode/output) since the
 * version-related system variables (!VERSION etc.) are not part of the
 * recognized SYSTEM_VARIABLES list and are silently dropped by the
 * VariableContext.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createExecutor, MacroExecutor, IMACROS_ERROR_CODES } from '@shared/executor';
import { registerSystemHandlers, setVersionInfo, getVersionInfo } from '@shared/commands/system';

/**
 * Helper: create an executor with system handlers registered.
 */
function createVersionExecutor(): MacroExecutor {
  const executor = createExecutor();
  registerSystemHandlers(executor.registerHandler.bind(executor));
  return executor;
}

/**
 * Helper: execute a single-line VERSION macro and return the result.
 */
async function executeVersionMacro(macro: string) {
  const executor = createVersionExecutor();
  executor.loadMacro(macro);
  return executor.execute();
}

describe('VERSION command integration tests', () => {
  // Save and restore the original version info around each test so that
  // tests using setVersionInfo() do not leak into other tests.
  let originalVersionInfo: ReturnType<typeof getVersionInfo>;

  beforeEach(() => {
    originalVersionInfo = getVersionInfo();
  });

  afterEach(() => {
    // Restore the default version info
    setVersionInfo(originalVersionInfo);
  });

  // -----------------------------------------------------------------------
  // 1. VERSION without BUILD param succeeds and returns version string
  // -----------------------------------------------------------------------
  it('should succeed without BUILD param and return the version string', async () => {
    const result = await executeVersionMacro('VERSION');

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  // -----------------------------------------------------------------------
  // 2. VERSION BUILD=8.0.0 succeeds (current 8.9.7 >= 8.0.0)
  // -----------------------------------------------------------------------
  it('should succeed when BUILD=8.0.0 (current 8.9.7 >= 8.0.0)', async () => {
    const result = await executeVersionMacro('VERSION BUILD=8.0.0');

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  // -----------------------------------------------------------------------
  // 3. VERSION BUILD=8.9.7 succeeds (equal version)
  // -----------------------------------------------------------------------
  it('should succeed when BUILD=8.9.7 (equal to current version)', async () => {
    const result = await executeVersionMacro('VERSION BUILD=8.9.7');

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  // -----------------------------------------------------------------------
  // 4. VERSION BUILD=9.0.0 returns SCRIPT_ERROR (current too low)
  // -----------------------------------------------------------------------
  it('should return SCRIPT_ERROR when BUILD=9.0.0 (current 8.9.7 < 9.0.0)', async () => {
    const result = await executeVersionMacro('VERSION BUILD=9.0.0');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
  });

  // -----------------------------------------------------------------------
  // 5. VERSION BUILD=8.9.8 returns SCRIPT_ERROR (patch too low)
  // -----------------------------------------------------------------------
  it('should return SCRIPT_ERROR when BUILD=8.9.8 (patch version too low)', async () => {
    const result = await executeVersionMacro('VERSION BUILD=8.9.8');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
  });

  // -----------------------------------------------------------------------
  // 6. VERSION BUILD=8.10.0 returns SCRIPT_ERROR (minor too low: 10 > 9)
  // -----------------------------------------------------------------------
  it('should return SCRIPT_ERROR when BUILD=8.10.0 (minor version too low)', async () => {
    const result = await executeVersionMacro('VERSION BUILD=8.10.0');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
  });

  // -----------------------------------------------------------------------
  // 7. VERSION BUILD=7.0.0 succeeds (major version higher)
  // -----------------------------------------------------------------------
  it('should succeed when BUILD=7.0.0 (current major 8 > required 7)', async () => {
    const result = await executeVersionMacro('VERSION BUILD=7.0.0');

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  // -----------------------------------------------------------------------
  // 8. setVersionInfo overrides version, and comparison uses new version
  // -----------------------------------------------------------------------
  it('should use overridden version from setVersionInfo for BUILD comparison', async () => {
    setVersionInfo({ major: 10, minor: 0, patch: 0, version: '10.0.0' });

    // BUILD=9.0.0 should now succeed because current is 10.0.0
    const result = await executeVersionMacro('VERSION BUILD=9.0.0');

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    // BUILD=11.0.0 should fail because current 10.0.0 < 11.0.0
    const result2 = await executeVersionMacro('VERSION BUILD=11.0.0');

    expect(result2.success).toBe(false);
    expect(result2.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
  });

  // -----------------------------------------------------------------------
  // 9. Variable expansion in BUILD param
  // -----------------------------------------------------------------------
  it('should expand variables in the BUILD parameter', async () => {
    const executor = createVersionExecutor();
    executor.loadMacro([
      'SET !VAR1 7.0.0',
      'VERSION BUILD={{!VAR1}}',
    ].join('\n'));

    const result = await executor.execute();

    // 8.9.7 >= 7.0.0 => success
    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  // -----------------------------------------------------------------------
  // 10. VERSION returns version as output string
  // -----------------------------------------------------------------------
  it('should return the version string as output', async () => {
    // Use a single-command macro so the last command's output is accessible
    const executor = createVersionExecutor();
    executor.loadMacro('VERSION');

    // We need to capture the command-level output. Since MacroResult does
    // not expose per-command output, we verify indirectly by checking that
    // the handler itself returns the version. We can do this by running
    // the handler directly through the executor's handler registry.
    const handler = executor.getHandler('VERSION');

    // Build a minimal context to invoke the handler directly
    const state = executor.getState();
    const variables = state.getVariables();
    const ctx = {
      command: {
        type: 'VERSION' as const,
        parameters: [],
        raw: 'VERSION',
        lineNumber: 1,
        variables: [],
      },
      variables,
      state,
      getParam: (_key: string) => undefined,
      getRequiredParam: (key: string) => { throw new Error(`Missing: ${key}`); },
      expand: (text: string) => variables.expand(text).expanded,
      log: (_level: 'info' | 'warn' | 'error' | 'debug', _message: string) => {},
    };

    const cmdResult = await handler(ctx);

    expect(cmdResult.success).toBe(true);
    expect(cmdResult.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    expect(cmdResult.output).toBe('8.9.7');
  });
});
