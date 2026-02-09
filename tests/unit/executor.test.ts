/**
 * Unit Tests for iMacros Macro Executor
 *
 * Tests the MacroExecutor class including handler registration,
 * macro loading, command execution, built-in handlers (SET, ADD, WAIT,
 * VERSION, CLEAR, PAUSE), loop execution, error handling, progress
 * reporting, pause/resume/stop control, factory/utility functions,
 * and edge cases.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MacroExecutor,
  createExecutor,
  executeMacro,
  getErrorMessage,
  isRecoverableError,
  IMACROS_ERROR_CODES,
  ExecutionStatus,
  CommandHandler,
  CommandResult,
} from '../../shared/src/executor';

describe('MacroExecutor', () => {
  let executor: MacroExecutor;

  beforeEach(() => {
    executor = createExecutor();
  });

  // ===== 1. Handler Registration =====

  describe('Handler registration', () => {
    it('should register a custom handler via registerHandler', () => {
      const handler: CommandHandler = async () => ({
        success: true,
        errorCode: IMACROS_ERROR_CODES.OK,
      });
      executor.registerHandler('URL', handler);
      expect(executor.getHandler('URL')).toBe(handler);
    });

    it('should register multiple handlers via registerHandlers', () => {
      const urlHandler: CommandHandler = async () => ({
        success: true,
        errorCode: IMACROS_ERROR_CODES.OK,
      });
      const tagHandler: CommandHandler = async () => ({
        success: true,
        errorCode: IMACROS_ERROR_CODES.OK,
      });
      executor.registerHandlers({ URL: urlHandler, TAG: tagHandler });
      expect(executor.getHandler('URL')).toBe(urlHandler);
      expect(executor.getHandler('TAG')).toBe(tagHandler);
    });

    it('should return the default handler for unregistered command types', async () => {
      const handler = executor.getHandler('NAVIGATE');
      // The default handler should succeed with a warning
      const result = await handler({
        command: { type: 'NAVIGATE', parameters: [], raw: 'NAVIGATE', lineNumber: 1, variables: [] },
        variables: executor.getState().getVariables(),
        state: executor.getState(),
        getParam: () => undefined,
        getRequiredParam: () => { throw new Error('missing'); },
        expand: (t) => t,
        log: () => {},
      });
      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    });

    it('should override a built-in handler when re-registered', () => {
      const customSet: CommandHandler = async () => ({
        success: true,
        errorCode: IMACROS_ERROR_CODES.OK,
        output: 'custom',
      });
      executor.registerHandler('SET', customSet);
      expect(executor.getHandler('SET')).toBe(customSet);
    });

    it('should skip undefined handlers in registerHandlers', () => {
      const urlHandler: CommandHandler = async () => ({
        success: true,
        errorCode: IMACROS_ERROR_CODES.OK,
      });
      // Passing undefined for TAG should not register it
      executor.registerHandlers({ URL: urlHandler, TAG: undefined as any });
      expect(executor.getHandler('URL')).toBe(urlHandler);
      // TAG should still be the default
      const tagHandler = executor.getHandler('TAG');
      expect(tagHandler).not.toBe(urlHandler);
    });
  });

  // ===== 2. Macro Loading =====

  describe('Macro loading', () => {
    it('should load a valid macro script', () => {
      const macro = executor.loadMacro('SET !VAR0 "hello"');
      expect(macro).toBeDefined();
      expect(macro.commands.length).toBe(1);
      expect(macro.commands[0].type).toBe('SET');
    });

    it('should return the loaded macro via getMacro()', () => {
      expect(executor.getMacro()).toBeNull();
      executor.loadMacro('VERSION BUILD=1');
      expect(executor.getMacro()).not.toBeNull();
      expect(executor.getMacro()!.commands[0].type).toBe('VERSION');
    });

    it('should load an empty script with zero commands', () => {
      const macro = executor.loadMacro('');
      expect(macro.commands.length).toBe(0);
    });

    it('should load a script with only comments', () => {
      const macro = executor.loadMacro("' This is a comment\n' Another comment");
      expect(macro.commands.length).toBe(0);
      expect(macro.comments.length).toBe(2);
    });

    it('should report parse errors on invalid commands when validate=true', () => {
      const logFn = vi.fn();
      const ex = createExecutor({ onLog: logFn });
      const macro = ex.loadMacro('URL', true);
      // URL without GOTO is a validation error
      expect(macro.errors.length).toBeGreaterThan(0);
    });

    it('should skip validation when validate=false', () => {
      const macro = executor.loadMacro('URL', false);
      expect(macro.errors.length).toBe(0);
    });

    it('should load a multi-line macro', () => {
      const script = 'SET !VAR0 a\nSET !VAR1 b\nSET !VAR2 c';
      const macro = executor.loadMacro(script);
      expect(macro.commands.length).toBe(3);
    });
  });

  // ===== 3. Single Command Execution =====

  describe('Single command execution', () => {
    it('should execute a mock handler that returns success', async () => {
      executor.registerHandler('URL', async () => ({
        success: true,
        errorCode: IMACROS_ERROR_CODES.OK,
        output: 'navigated',
      }));
      executor.loadMacro('URL GOTO=https://example.com');
      const result = await executor.execute();
      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    });

    it('should execute a mock handler that returns an error', async () => {
      executor.registerHandler('URL', async () => ({
        success: false,
        errorCode: IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND,
        errorMessage: 'not found',
      }));
      executor.loadMacro('URL GOTO=https://example.com');
      const result = await executor.execute();
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND);
      expect(result.errorMessage).toBe('not found');
    });

    it('should report the correct errorLine on failure', async () => {
      executor.registerHandler('URL', async () => ({
        success: false,
        errorCode: IMACROS_ERROR_CODES.TIMEOUT,
        errorMessage: 'timed out',
      }));
      executor.loadMacro('SET !VAR0 ok\nURL GOTO=http://example.com');
      const result = await executor.execute();
      expect(result.success).toBe(false);
      expect(result.errorLine).toBe(2);
    });
  });

  // ===== 4. Built-in SET Handler =====

  describe('Built-in SET handler', () => {
    it('should set a variable with SET !VAR0 hello', async () => {
      executor.loadMacro('SET !VAR0 hello');
      const result = await executor.execute();
      expect(result.success).toBe(true);
      expect(result.variables['!VAR0']).toBe('hello');
    });

    it('should set a quoted variable (rawValue preserves quotes)', async () => {
      // The SET handler uses rawValue which includes the enclosing quotes
      executor.loadMacro('SET !VAR0 "hello"');
      const result = await executor.execute();
      expect(result.success).toBe(true);
      // rawValue is '"hello"' which is what gets stored
      expect(result.variables['!VAR0']).toBe('"hello"');
    });

    it('should set multiple variables', async () => {
      executor.loadMacro('SET !VAR0 alpha\nSET !VAR1 beta');
      const result = await executor.execute();
      expect(result.success).toBe(true);
      expect(result.variables['!VAR0']).toBe('alpha');
      expect(result.variables['!VAR1']).toBe('beta');
    });

    it('should fail SET with too few parameters', async () => {
      // SET with no args - parse it without validation so the command goes through,
      // then the SET handler itself should report MISSING_PARAMETER.
      executor.loadMacro('SET !VAR0', false);
      const result = await executor.execute();
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    });

    it('should overwrite a previously set variable', async () => {
      executor.loadMacro('SET !VAR0 first\nSET !VAR0 second');
      const result = await executor.execute();
      expect(result.success).toBe(true);
      expect(result.variables['!VAR0']).toBe('second');
    });
  });

  // ===== 5. Built-in ADD Handler =====

  describe('Built-in ADD handler', () => {
    it('should add a value to a variable', async () => {
      executor.loadMacro('SET !VAR0 10\nADD !VAR0 5');
      const result = await executor.execute();
      expect(result.success).toBe(true);
      expect(result.variables['!VAR0']).toBe(15);
    });

    it('should add to an initially empty variable (treated as 0)', async () => {
      executor.loadMacro('ADD !VAR0 7');
      const result = await executor.execute();
      expect(result.success).toBe(true);
      expect(result.variables['!VAR0']).toBe(7);
    });

    it('should fail ADD with too few parameters', async () => {
      executor.loadMacro('ADD !VAR0', false);
      const result = await executor.execute();
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    });

    it('should concatenate ADD with non-numeric value (iMacros 8.9.7 behavior)', async () => {
      executor.loadMacro('SET !VAR0 prefix_\nADD !VAR0 abc', false);
      const result = await executor.execute();
      expect(result.success).toBe(true);
      expect(result.variables['!VAR0']).toBe('prefix_abc');
    });
  });

  // ===== 6. Built-in WAIT Handler =====

  describe('Built-in WAIT handler', () => {
    it('should wait for the specified number of seconds', async () => {
      executor.loadMacro('WAIT SECONDS=0.01');
      const start = Date.now();
      const result = await executor.execute();
      const elapsed = Date.now() - start;
      expect(result.success).toBe(true);
      expect(elapsed).toBeGreaterThanOrEqual(5); // at least ~10ms (loose tolerance)
    });

    it('should fail WAIT with invalid SECONDS value', async () => {
      executor.loadMacro('WAIT SECONDS=abc', false);
      const result = await executor.execute();
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    });

    it('should fail WAIT with negative SECONDS', async () => {
      executor.loadMacro('WAIT SECONDS=-5', false);
      const result = await executor.execute();
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    });

    it('should fail WAIT when SECONDS parameter is missing', async () => {
      // WAIT with no SECONDS will throw from getRequiredParam
      executor.loadMacro('WAIT', false);
      const result = await executor.execute();
      expect(result.success).toBe(false);
    });
  });

  // ===== 7. Built-in VERSION Handler =====

  describe('Built-in VERSION handler', () => {
    it('should succeed silently for VERSION command', async () => {
      executor.loadMacro('VERSION BUILD=1');
      const result = await executor.execute();
      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    });
  });

  // ===== 8. Built-in CLEAR Handler =====

  describe('Built-in CLEAR handler', () => {
    it('should succeed silently for CLEAR command', async () => {
      executor.loadMacro('CLEAR');
      const result = await executor.execute();
      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    });
  });

  // ===== 9. Loop Execution =====

  describe('Loop execution', () => {
    it('should execute the macro maxLoops times', async () => {
      const callCount = vi.fn();
      const ex = createExecutor({ maxLoops: 3 });
      ex.registerHandler('URL', async () => {
        callCount();
        return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
      });
      ex.loadMacro('URL GOTO=http://example.com');
      const result = await ex.execute();
      expect(result.success).toBe(true);
      expect(callCount).toHaveBeenCalledTimes(3);
      expect(result.loopsCompleted).toBe(3);
    });

    it('should increment the loop counter each iteration', async () => {
      const loopValues: number[] = [];
      const ex = createExecutor({ maxLoops: 3 });
      ex.registerHandler('URL', async (ctx) => {
        loopValues.push(ctx.state.getLoopCounter());
        return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
      });
      ex.loadMacro('URL GOTO=http://example.com');
      await ex.execute();
      expect(loopValues).toEqual([1, 2, 3]);
    });

    it('should default to maxLoops=1', async () => {
      const callCount = vi.fn();
      executor.registerHandler('URL', async () => {
        callCount();
        return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
      });
      executor.loadMacro('URL GOTO=http://example.com');
      await executor.execute();
      expect(callCount).toHaveBeenCalledTimes(1);
    });

    it('should handle skipToNextLoop in command result', async () => {
      const loopValues: number[] = [];
      const ex = createExecutor({ maxLoops: 3 });
      ex.registerHandler('URL', async (ctx) => {
        loopValues.push(ctx.state.getLoopCounter());
        return { success: true, errorCode: IMACROS_ERROR_CODES.OK, skipToNextLoop: true };
      });
      // Second command should not execute because first skips
      ex.registerHandler('TAG', async () => {
        return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
      });
      ex.loadMacro('URL GOTO=http://example.com\nTAG POS=1 TYPE=INPUT ATTR=TXT:*');
      const result = await ex.execute();
      expect(result.success).toBe(true);
      expect(loopValues).toEqual([1, 2, 3]);
    });

    it('should handle stopExecution in command result', async () => {
      const ex = createExecutor({ maxLoops: 3 });
      const callCount = vi.fn();
      ex.registerHandler('URL', async () => {
        callCount();
        return { success: true, errorCode: IMACROS_ERROR_CODES.OK, stopExecution: true };
      });
      ex.loadMacro('URL GOTO=http://example.com');
      const result = await ex.execute();
      expect(result.success).toBe(true);
      expect(callCount).toHaveBeenCalledTimes(1); // stopped after first
    });

    it('should handle jumpToLine in command result', async () => {
      const lines: number[] = [];
      const ex = createExecutor({ maxLoops: 1 });
      let jumpCount = 0;
      ex.registerHandler('URL', async (ctx) => {
        lines.push(ctx.state.getCurrentLine());
        jumpCount++;
        if (jumpCount === 1) {
          // Jump back to line 1 once
          return { success: true, errorCode: IMACROS_ERROR_CODES.OK, jumpToLine: 1 };
        }
        return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
      });
      ex.registerHandler('TAG', async (ctx) => {
        lines.push(ctx.state.getCurrentLine());
        return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
      });
      ex.loadMacro('URL GOTO=http://example.com\nTAG POS=1 TYPE=INPUT ATTR=TXT:*');
      await ex.execute();
      // First URL at line 1, then jump back to line 1 (URL again), then TAG at line 2
      expect(lines).toEqual([1, 1, 2]);
    });
  });

  // ===== 10. Error Handling =====

  describe('Error handling', () => {
    it('should skip errors when !ERRORIGNORE=YES is set', async () => {
      executor.loadMacro('SET !ERRORIGNORE YES\nURL GOTO=http://example.com\nSET !VAR0 done', false);
      executor.registerHandler('URL', async () => ({
        success: false,
        errorCode: IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND,
        errorMessage: 'not found',
      }));
      const result = await executor.execute();
      expect(result.success).toBe(true);
      expect(result.variables['!VAR0']).toBe('done');
    });

    it('should skip errors when errorIgnore option is set', async () => {
      const ex = createExecutor({ errorIgnore: true });
      ex.registerHandler('URL', async () => ({
        success: false,
        errorCode: IMACROS_ERROR_CODES.TIMEOUT,
        errorMessage: 'timeout',
      }));
      ex.loadMacro('URL GOTO=http://example.com\nSET !VAR0 after');
      const result = await ex.execute();
      expect(result.success).toBe(true);
      expect(result.variables['!VAR0']).toBe('after');
    });

    it('should skip to next loop when !ERRORLOOP=YES is set', async () => {
      const ex = createExecutor({ maxLoops: 2 });
      ex.registerHandler('URL', async () => ({
        success: false,
        errorCode: IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND,
        errorMessage: 'not found',
      }));
      ex.loadMacro('SET !ERRORLOOP YES\nURL GOTO=http://example.com\nSET !VAR0 done', false);
      const result = await ex.execute();
      // Both loops should complete (error skips to next loop)
      expect(result.success).toBe(true);
      expect(result.loopsCompleted).toBe(2);
    });

    it('should stop execution on fatal error (no ERRORIGNORE or ERRORLOOP)', async () => {
      executor.registerHandler('URL', async () => ({
        success: false,
        errorCode: IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND,
        errorMessage: 'fatal error',
      }));
      executor.loadMacro('URL GOTO=http://example.com');
      const result = await executor.execute();
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('fatal error');
    });

    it('should catch handler exceptions and return SCRIPT_ERROR', async () => {
      executor.registerHandler('URL', async () => {
        throw new Error('handler crashed');
      });
      executor.loadMacro('URL GOTO=http://example.com');
      const result = await executor.execute();
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toContain('handler crashed');
    });
  });

  // ===== 11. Progress Reporting =====

  describe('Progress reporting', () => {
    it('should call onProgress callback during execution', async () => {
      const progressFn = vi.fn();
      const ex = createExecutor({ onProgress: progressFn });
      ex.loadMacro('SET !VAR0 a\nSET !VAR1 b');
      await ex.execute();
      expect(progressFn).toHaveBeenCalled();
      // Should have been called once per command
      expect(progressFn.mock.calls.length).toBe(2);
    });

    it('should report correct totalLines in progress', async () => {
      const progressFn = vi.fn();
      const ex = createExecutor({ onProgress: progressFn });
      ex.loadMacro('SET !VAR0 a\nSET !VAR1 b\nSET !VAR2 c');
      await ex.execute();
      const firstCall = progressFn.mock.calls[0][0];
      expect(firstCall.totalLines).toBe(3);
    });

    it('should report correct currentLoop in progress', async () => {
      const progressFn = vi.fn();
      const ex = createExecutor({ onProgress: progressFn, maxLoops: 2 });
      ex.loadMacro('SET !VAR0 a');
      await ex.execute();
      const firstCallLoop = progressFn.mock.calls[0][0].currentLoop;
      const secondCallLoop = progressFn.mock.calls[1][0].currentLoop;
      expect(firstCallLoop).toBe(1);
      expect(secondCallLoop).toBe(2);
    });

    it('should return correct progress from getProgress()', () => {
      executor.loadMacro('SET !VAR0 a\nSET !VAR1 b');
      const progress = executor.getProgress();
      expect(progress.totalLines).toBe(2);
      expect(progress.maxLoops).toBe(1);
      expect(progress.status).toBe(ExecutionStatus.IDLE);
    });
  });

  // ===== 12. Execution Control (pause/resume/stop) =====

  describe('Execution control', () => {
    it('should stop execution when stop() is called', async () => {
      const ex = createExecutor({ maxLoops: 1 });
      ex.registerHandler('WAIT', async () => {
        await new Promise(r => setTimeout(r, 200));
        return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
      });
      ex.loadMacro('WAIT SECONDS=5');
      const execPromise = ex.execute();
      await new Promise(r => setTimeout(r, 50));
      ex.stop();
      const result = await execPromise;
      // The abortFlag should have stopped execution
      expect(result.success).toBe(true); // execute catches abort and completes
    });

    it('should pause and resume execution', async () => {
      const commandsExecuted: string[] = [];
      const ex = createExecutor({ maxLoops: 1 });
      ex.registerHandler('URL', async () => {
        commandsExecuted.push('URL');
        return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
      });
      ex.registerHandler('TAG', async () => {
        commandsExecuted.push('TAG');
        return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
      });

      // Use the PAUSE built-in command which sets pauseFlag
      ex.loadMacro('URL GOTO=http://example.com\nPAUSE\nTAG POS=1 TYPE=INPUT ATTR=TXT:test', false);
      const execPromise = ex.execute();

      // Give it time to hit PAUSE
      await new Promise(r => setTimeout(r, 50));

      // Resume to continue
      ex.resume();
      const result = await execPromise;
      expect(result.success).toBe(true);
      expect(commandsExecuted).toContain('URL');
      expect(commandsExecuted).toContain('TAG');
    });

    it('should stop during a paused state', async () => {
      const ex = createExecutor({ maxLoops: 1 });
      ex.loadMacro('PAUSE\nSET !VAR0 after', false);
      const execPromise = ex.execute();

      // Give it time to hit PAUSE
      await new Promise(r => setTimeout(r, 50));
      ex.stop();
      const result = await execPromise;
      // Should not have executed the SET after PAUSE
      expect(result.variables['!VAR0']).not.toBe('after');
    });

    it('should set and get execution status', () => {
      expect(executor.getStatus()).toBe(ExecutionStatus.IDLE);
    });

    it('should set single-step mode', () => {
      executor.setSingleStep(true);
      const vars = executor.getState().getAllVariables();
      expect(vars['!SINGLESTEP']).toBe('YES');
    });

    it('should set error-ignore mode', () => {
      executor.setErrorIgnore(true);
      const vars = executor.getState().getAllVariables();
      expect(vars['!ERRORIGNORE']).toBe('YES');
    });
  });

  // ===== 13. executeMacro Convenience Function =====

  describe('executeMacro convenience function', () => {
    it('should execute a script directly and return result', async () => {
      const result = await executeMacro('SET !VAR0 quick');
      expect(result.success).toBe(true);
      expect(result.variables['!VAR0']).toBe('quick');
    });

    it('should accept options', async () => {
      const result = await executeMacro('SET !VAR0 test', { maxLoops: 2 });
      expect(result.success).toBe(true);
      expect(result.loopsCompleted).toBe(2);
    });

    it('should report errors from executeMacro', async () => {
      // WAIT without SECONDS is a parse error but the executor tries to run it
      // Actually the command goes through but getRequiredParam throws
      const result = await executeMacro('WAIT', { });
      // WAIT with no SECONDS will fail during validation in loadMacro
      // but the command is still present. Handler will throw from getRequiredParam.
      expect(result.success).toBe(false);
    });
  });

  // ===== 14. getErrorMessage and isRecoverableError Utilities =====

  describe('Utility functions', () => {
    it('should return correct error messages for known codes', () => {
      expect(getErrorMessage(IMACROS_ERROR_CODES.OK)).toBe('OK');
      expect(getErrorMessage(IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND)).toBe('Element not found');
      expect(getErrorMessage(IMACROS_ERROR_CODES.TIMEOUT)).toBe('Timeout');
      expect(getErrorMessage(IMACROS_ERROR_CODES.SCRIPT_ERROR)).toBe('Script error');
      expect(getErrorMessage(IMACROS_ERROR_CODES.USER_ABORT)).toBe('Aborted by user');
      expect(getErrorMessage(IMACROS_ERROR_CODES.SYNTAX_ERROR)).toBe('Syntax error');
    });

    it('should return "Unknown error" for unrecognized codes', () => {
      expect(getErrorMessage(-12345 as any)).toBe('Unknown error');
    });

    it('should identify recoverable errors correctly', () => {
      expect(isRecoverableError(IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND)).toBe(true);
      expect(isRecoverableError(IMACROS_ERROR_CODES.ELEMENT_NOT_VISIBLE)).toBe(true);
      expect(isRecoverableError(IMACROS_ERROR_CODES.TIMEOUT)).toBe(true);
      expect(isRecoverableError(IMACROS_ERROR_CODES.PAGE_TIMEOUT)).toBe(true);
      expect(isRecoverableError(IMACROS_ERROR_CODES.STEP_TIMEOUT)).toBe(true);
      expect(isRecoverableError(IMACROS_ERROR_CODES.FRAME_NOT_FOUND)).toBe(true);
      expect(isRecoverableError(IMACROS_ERROR_CODES.DATASOURCE_END)).toBe(true);
      expect(isRecoverableError(IMACROS_ERROR_CODES.USER_PAUSE)).toBe(true);
    });

    it('should identify non-recoverable errors correctly', () => {
      expect(isRecoverableError(IMACROS_ERROR_CODES.SYNTAX_ERROR)).toBe(false);
      expect(isRecoverableError(IMACROS_ERROR_CODES.SCRIPT_ERROR)).toBe(false);
      expect(isRecoverableError(IMACROS_ERROR_CODES.FILE_ERROR)).toBe(false);
      expect(isRecoverableError(IMACROS_ERROR_CODES.OK)).toBe(false);
      expect(isRecoverableError(IMACROS_ERROR_CODES.USER_ABORT)).toBe(false);
    });
  });

  // ===== 15. Execute with No Macro Loaded =====

  describe('Execute with no macro loaded', () => {
    it('should return an error result when no macro is loaded', async () => {
      const result = await executor.execute();
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toBe('No macro loaded');
      expect(result.loopsCompleted).toBe(0);
      expect(result.executionTimeMs).toBe(0);
      expect(result.extractData).toEqual([]);
    });
  });

  // ===== 16. Handler Exception Handling =====

  describe('Handler exception handling', () => {
    it('should catch a thrown Error and return SCRIPT_ERROR', async () => {
      executor.registerHandler('URL', async () => {
        throw new Error('unexpected failure');
      });
      executor.loadMacro('URL GOTO=http://example.com');
      const result = await executor.execute();
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toContain('unexpected failure');
    });

    it('should catch a thrown string and return SCRIPT_ERROR', async () => {
      executor.registerHandler('URL', async () => {
        throw 'string error';
      });
      executor.loadMacro('URL GOTO=http://example.com');
      const result = await executor.execute();
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toContain('string error');
    });
  });

  // ===== Additional Tests =====

  describe('Variable expansion in commands', () => {
    it('should expand variables referenced with {{var}} syntax', async () => {
      const capturedValue = vi.fn();
      executor.registerHandler('URL', async (ctx) => {
        capturedValue(ctx.expand('{{!VAR0}}'));
        return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
      });
      executor.loadMacro('SET !VAR0 expanded\nURL GOTO=http://example.com');
      await executor.execute();
      expect(capturedValue).toHaveBeenCalledWith('expanded');
    });
  });

  describe('Initial variables', () => {
    it('should apply initialVariables to execution', async () => {
      const ex = createExecutor({ initialVariables: { '!VAR0': 'initial' } });
      ex.loadMacro('SET !VAR1 test');
      const result = await ex.execute();
      expect(result.success).toBe(true);
      expect(result.variables['!VAR0']).toBe('initial');
      expect(result.variables['!VAR1']).toBe('test');
    });
  });

  describe('onLog callback', () => {
    it('should invoke the log callback during execution', async () => {
      const logFn = vi.fn();
      const ex = createExecutor({ onLog: logFn });
      ex.loadMacro('SET !VAR0 hi');
      await ex.execute();
      expect(logFn).toHaveBeenCalled();
      // Should have at least an info log about starting
      const infoCalls = logFn.mock.calls.filter((c: any[]) => c[0] === 'info');
      expect(infoCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Command delay', () => {
    it('should delay between commands when commandDelayMs is set', async () => {
      const ex = createExecutor({ commandDelayMs: 20 });
      ex.loadMacro('SET !VAR0 a\nSET !VAR1 b');
      const start = Date.now();
      await ex.execute();
      const elapsed = Date.now() - start;
      // Should have at least ~40ms delay (2 commands x 20ms)
      expect(elapsed).toBeGreaterThanOrEqual(30);
    });
  });

  describe('createExecutor factory', () => {
    it('should create an executor with default options', () => {
      const ex = createExecutor();
      expect(ex).toBeInstanceOf(MacroExecutor);
      expect(ex.getStatus()).toBe(ExecutionStatus.IDLE);
    });

    it('should create an executor with macroName', () => {
      const ex = createExecutor({ macroName: 'test.iim' });
      expect(ex.getState().getMacroName()).toBe('test.iim');
    });
  });

  describe('IMACROS_ERROR_CODES', () => {
    it('should have the correct constant values', () => {
      expect(IMACROS_ERROR_CODES.OK).toBe(0);
      expect(IMACROS_ERROR_CODES.SYNTAX_ERROR).toBe(-910);
      expect(IMACROS_ERROR_CODES.INVALID_COMMAND).toBe(-911);
      expect(IMACROS_ERROR_CODES.INVALID_PARAMETER).toBe(-912);
      expect(IMACROS_ERROR_CODES.MISSING_PARAMETER).toBe(-913);
      expect(IMACROS_ERROR_CODES.UNSUPPORTED_COMMAND).toBe(-915);
      expect(IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND).toBe(-920);
      expect(IMACROS_ERROR_CODES.TIMEOUT).toBe(-930);
      expect(IMACROS_ERROR_CODES.SCRIPT_ERROR).toBe(-970);
      expect(IMACROS_ERROR_CODES.USER_ABORT).toBe(-100);
      expect(IMACROS_ERROR_CODES.UNKNOWN_ERROR).toBe(-999);
    });
  });

  describe('MacroResult structure', () => {
    it('should include extractData as an empty array by default', async () => {
      executor.loadMacro('SET !VAR0 x');
      const result = await executor.execute();
      expect(result.extractData).toEqual([]);
    });

    it('should include executionTimeMs', async () => {
      executor.loadMacro('WAIT SECONDS=0.01');
      const result = await executor.execute();
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should include loopsCompleted', async () => {
      const ex = createExecutor({ maxLoops: 2 });
      ex.loadMacro('SET !VAR0 x');
      const result = await ex.execute();
      expect(result.loopsCompleted).toBe(2);
    });
  });

  describe('getState()', () => {
    it('should return the state manager', () => {
      const state = executor.getState();
      expect(state).toBeDefined();
      expect(state.getStatus()).toBe(ExecutionStatus.IDLE);
    });
  });
});
