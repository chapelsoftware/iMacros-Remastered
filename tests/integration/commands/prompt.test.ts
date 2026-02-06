/**
 * PROMPT Command Integration Tests
 *
 * Tests the PROMPT command from flow.ts which displays a message to the user
 * and stores the response in a variable.
 *
 * - PROMPT MESSAGE="text" shows a prompt and stores input in !INPUT (default)
 * - PROMPT MESSAGE="text" VAR=!VAR1 stores input in the specified variable
 * - PROMPT MESSAGE="text" DEFAULT="val" passes a default to the prompt UI
 * - Variable expansion is supported in the message text
 * - Cancelling the prompt stores '' and returns USER_ABORT with stopExecution
 * - PROMPT without a message returns MISSING_PARAMETER error
 *
 * NOTE: The default storage variable '!INPUT' is not a registered system variable
 * in the VariableContext, so setVariable('!INPUT', ...) silently fails. Tests
 * that need to verify stored values use explicit VAR=!VARx parameters instead.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  MacroExecutor,
  createExecutor,
  IMACROS_ERROR_CODES,
} from '@shared/executor';
import {
  promptHandler,
  setFlowControlUI,
  resetFlowControlUI,
  FlowControlUI,
} from '@shared/commands/flow';

/**
 * Helper: create a MacroExecutor with the PROMPT handler registered.
 * The executor does not register PROMPT by default, so we add it manually.
 */
function createPromptExecutor(): MacroExecutor {
  const executor = createExecutor();
  executor.registerHandler('PROMPT', promptHandler);
  return executor;
}

/**
 * Helper: build a mock FlowControlUI with configurable showPrompt behavior.
 */
function createMockUI(
  showPromptImpl: FlowControlUI['showPrompt'] = vi.fn().mockResolvedValue('')
): FlowControlUI & { showPrompt: ReturnType<typeof vi.fn> } {
  return {
    showPause: vi.fn().mockResolvedValue(undefined),
    showPrompt: showPromptImpl as unknown as ReturnType<typeof vi.fn>,
    showAlert: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Clean up the global UI after every test
// ---------------------------------------------------------------------------
afterEach(() => {
  resetFlowControlUI();
});

// ---------------------------------------------------------------------------
// A. Basic PROMPT with MESSAGE param -- calls showPrompt correctly
// ---------------------------------------------------------------------------
describe('PROMPT with MESSAGE param calls showPrompt and returns success', () => {
  it('should call showPrompt with the message text and succeed', async () => {
    const mockUI = createMockUI(vi.fn().mockResolvedValue('Alice'));
    setFlowControlUI(mockUI);

    const executor = createPromptExecutor();
    executor.loadMacro('PROMPT MESSAGE="Enter your name:"');

    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    expect(mockUI.showPrompt).toHaveBeenCalledTimes(1);
    expect(mockUI.showPrompt).toHaveBeenCalledWith('Enter your name:', undefined);
  });

  it('should succeed even when the user submits empty input', async () => {
    const mockUI = createMockUI(vi.fn().mockResolvedValue(''));
    setFlowControlUI(mockUI);

    const executor = createPromptExecutor();
    executor.loadMacro('PROMPT MESSAGE="Enter something:"');

    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    expect(mockUI.showPrompt).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// B. PROMPT with VAR param -- stores in the specified variable
// ---------------------------------------------------------------------------
describe('PROMPT with VAR param stores in specified variable', () => {
  it('should store the input in the variable named by VAR', async () => {
    const mockUI = createMockUI(vi.fn().mockResolvedValue('Bob'));
    setFlowControlUI(mockUI);

    const executor = createPromptExecutor();
    executor.loadMacro('PROMPT MESSAGE="Who are you?" VAR=!VAR1');

    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    expect(result.variables['!VAR1']).toBe('Bob');
  });

  it('should store a different value in a different variable', async () => {
    const mockUI = createMockUI(vi.fn().mockResolvedValue('searchterm'));
    setFlowControlUI(mockUI);

    const executor = createPromptExecutor();
    executor.loadMacro('PROMPT MESSAGE="Search for:" VAR=!VAR2');

    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.variables['!VAR2']).toBe('searchterm');
  });

  it('should overwrite a previously set variable', async () => {
    const mockUI = createMockUI(vi.fn().mockResolvedValue('new_value'));
    setFlowControlUI(mockUI);

    const executor = createPromptExecutor();
    executor.loadMacro('SET !VAR3 old_value\nPROMPT MESSAGE="Update:" VAR=!VAR3');

    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.variables['!VAR3']).toBe('new_value');
  });
});

// ---------------------------------------------------------------------------
// C. PROMPT with DEFAULT param -- passes default to showPrompt
// ---------------------------------------------------------------------------
describe('PROMPT with DEFAULT param', () => {
  it('should pass the default value to showPrompt', async () => {
    const mockUI = createMockUI(vi.fn().mockResolvedValue('custom'));
    setFlowControlUI(mockUI);

    const executor = createPromptExecutor();
    executor.loadMacro('PROMPT MESSAGE="Search:" DEFAULT="google" VAR=!VAR1');

    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(mockUI.showPrompt).toHaveBeenCalledWith('Search:', 'google');
    expect(result.variables['!VAR1']).toBe('custom');
  });

  it('should pass undefined when DEFAULT is not provided', async () => {
    const mockUI = createMockUI(vi.fn().mockResolvedValue('x'));
    setFlowControlUI(mockUI);

    const executor = createPromptExecutor();
    executor.loadMacro('PROMPT MESSAGE="No default" VAR=!VAR1');

    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(mockUI.showPrompt).toHaveBeenCalledWith('No default', undefined);
  });

  it('should combine DEFAULT and VAR together', async () => {
    const mockUI = createMockUI(vi.fn().mockResolvedValue('result'));
    setFlowControlUI(mockUI);

    const executor = createPromptExecutor();
    executor.loadMacro('PROMPT MESSAGE="Input:" DEFAULT="fallback" VAR=!VAR3');

    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(mockUI.showPrompt).toHaveBeenCalledWith('Input:', 'fallback');
    expect(result.variables['!VAR3']).toBe('result');
  });
});

// ---------------------------------------------------------------------------
// D. Variable expansion in the prompt message
// ---------------------------------------------------------------------------
describe('PROMPT with variable expansion in message', () => {
  it('should expand variables in the MESSAGE text', async () => {
    const mockUI = createMockUI(vi.fn().mockResolvedValue('done'));
    setFlowControlUI(mockUI);

    const executor = createPromptExecutor();
    executor.loadMacro(
      'SET !VAR1 World\nPROMPT MESSAGE="Hello {{!VAR1}}, enter input:" VAR=!VAR2'
    );

    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(mockUI.showPrompt).toHaveBeenCalledWith(
      'Hello World, enter input:',
      undefined
    );
    expect(result.variables['!VAR2']).toBe('done');
  });

  it('should expand variables in the DEFAULT text', async () => {
    const mockUI = createMockUI(vi.fn().mockResolvedValue('final'));
    setFlowControlUI(mockUI);

    const executor = createPromptExecutor();
    executor.loadMacro(
      'SET !VAR1 mydefault\nPROMPT MESSAGE="Prompt:" DEFAULT="{{!VAR1}}" VAR=!VAR2'
    );

    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(mockUI.showPrompt).toHaveBeenCalledWith('Prompt:', 'mydefault');
    expect(result.variables['!VAR2']).toBe('final');
  });
});

// ---------------------------------------------------------------------------
// E. PROMPT cancel -- user rejects the prompt
// ---------------------------------------------------------------------------
describe('PROMPT cancel behavior', () => {
  it('should return USER_ABORT when prompt is cancelled', async () => {
    const mockUI = createMockUI(
      vi.fn().mockRejectedValue(new Error('User cancelled'))
    );
    setFlowControlUI(mockUI);

    const executor = createPromptExecutor();
    executor.loadMacro('PROMPT MESSAGE="Cancel me" VAR=!VAR1');

    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.USER_ABORT);
    // On cancel the handler stores '' in the target variable
    expect(result.variables['!VAR1']).toBe('');
  });

  it('should store empty string in specified VAR on cancel', async () => {
    const mockUI = createMockUI(
      vi.fn().mockRejectedValue(new Error('cancelled'))
    );
    setFlowControlUI(mockUI);

    const executor = createPromptExecutor();
    executor.loadMacro('SET !VAR5 original\nPROMPT MESSAGE="Cancel me" VAR=!VAR5');

    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.USER_ABORT);
    expect(result.variables['!VAR5']).toBe('');
  });

  it('should stop execution after cancel (stopExecution flag)', async () => {
    const mockUI = createMockUI(
      vi.fn().mockRejectedValue(new Error('cancelled'))
    );
    setFlowControlUI(mockUI);

    const executor = createPromptExecutor();
    // PROMPT cancel sets stopExecution=true so SET !VAR2 should NOT run.
    // However, the executor sees !success first and (without errorIgnore)
    // returns the error immediately, so SET !VAR2 is never reached either way.
    // !VAR1 gets '' from the cancel handler. !VAR2 stays at its default ''.
    executor.loadMacro('PROMPT MESSAGE="Cancel me" VAR=!VAR1\nSET !VAR2 should_not_run');

    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.USER_ABORT);
    // !VAR1 was set to '' by the cancel handler
    expect(result.variables['!VAR1']).toBe('');
    // !VAR2 should still be at its default '' -- NOT 'should_not_run'
    expect(result.variables['!VAR2']).toBe('');
    expect(result.variables['!VAR2']).not.toBe('should_not_run');
  });
});

// ---------------------------------------------------------------------------
// F. PROMPT without a message -- returns MISSING_PARAMETER
// ---------------------------------------------------------------------------
describe('PROMPT without message', () => {
  it('should return MISSING_PARAMETER when no message is provided', async () => {
    const mockUI = createMockUI(vi.fn().mockResolvedValue('ignored'));
    setFlowControlUI(mockUI);

    const executor = createPromptExecutor();
    // PROMPT with no parameters at all
    executor.loadMacro('PROMPT');

    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    // showPrompt should not have been called
    expect(mockUI.showPrompt).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// G. Multi-command macros with PROMPT
// ---------------------------------------------------------------------------
describe('PROMPT in multi-command macros', () => {
  it('should execute SET, PROMPT, SET in sequence', async () => {
    const mockUI = createMockUI(vi.fn().mockResolvedValue('user_input'));
    setFlowControlUI(mockUI);

    const executor = createPromptExecutor();
    executor.loadMacro(
      'SET !VAR1 before\nPROMPT MESSAGE="Enter:" VAR=!VAR2\nSET !VAR3 after'
    );

    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.variables['!VAR1']).toBe('before');
    expect(result.variables['!VAR2']).toBe('user_input');
    expect(result.variables['!VAR3']).toBe('after');
  });

  it('should use headless default UI when no UI is set (returns default value)', async () => {
    // Reset to default UI which returns defaultValue or '' for showPrompt
    resetFlowControlUI();

    const executor = createPromptExecutor();
    executor.loadMacro('PROMPT MESSAGE="Headless test" DEFAULT="headless_default" VAR=!VAR1');

    const result = await executor.execute();

    // Default headless UI returns the default value
    expect(result.success).toBe(true);
    expect(result.variables['!VAR1']).toBe('headless_default');
  });

  it('should return empty string from headless UI when no default is set', async () => {
    resetFlowControlUI();

    const executor = createPromptExecutor();
    executor.loadMacro('PROMPT MESSAGE="Headless no default" VAR=!VAR1');

    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.variables['!VAR1']).toBe('');
  });

  it('should handle multiple PROMPT commands in sequence', async () => {
    let callCount = 0;
    const responses = ['first', 'second'];
    const mockUI = createMockUI(
      vi.fn().mockImplementation(async () => {
        return responses[callCount++];
      })
    );
    setFlowControlUI(mockUI);

    const executor = createPromptExecutor();
    executor.loadMacro(
      'PROMPT MESSAGE="First:" VAR=!VAR1\nPROMPT MESSAGE="Second:" VAR=!VAR2'
    );

    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(mockUI.showPrompt).toHaveBeenCalledTimes(2);
    expect(result.variables['!VAR1']).toBe('first');
    expect(result.variables['!VAR2']).toBe('second');
  });
});
