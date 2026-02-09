/**
 * PROMPT Command Integration Tests
 *
 * Tests the PROMPT command from flow.ts with iMacros 8.9.7 compatible behavior:
 *
 * Positional syntax: PROMPT message [varname] [default]
 * Named syntax:      PROMPT MESSAGE="text" [VAR=!VARx] [DEFAULT="value"]
 *
 * Behavior:
 * - When no variable is specified, shows an alert-only dialog (no input field)
 * - When a variable is specified, shows an input prompt and stores the result
 * - Cancel continues execution silently without storing any value
 * - No default variable (no automatic !INPUT storage)
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
  showPromptImpl: FlowControlUI['showPrompt'] = vi.fn().mockResolvedValue(''),
  showAlertImpl: FlowControlUI['showAlert'] = vi.fn().mockResolvedValue(undefined),
): FlowControlUI & { showPrompt: ReturnType<typeof vi.fn>; showAlert: ReturnType<typeof vi.fn> } {
  return {
    showPause: vi.fn().mockResolvedValue(undefined),
    showPrompt: showPromptImpl as unknown as ReturnType<typeof vi.fn>,
    showAlert: showAlertImpl as unknown as ReturnType<typeof vi.fn>,
  };
}

// ---------------------------------------------------------------------------
// Clean up the global UI after every test
// ---------------------------------------------------------------------------
afterEach(() => {
  resetFlowControlUI();
});

// ---------------------------------------------------------------------------
// A. Alert-only mode -- MESSAGE without VAR calls showAlert
// ---------------------------------------------------------------------------
describe('PROMPT alert-only mode (no variable specified)', () => {
  it('should call showAlert when MESSAGE is given without VAR', async () => {
    const mockUI = createMockUI();
    setFlowControlUI(mockUI);

    const executor = createPromptExecutor();
    executor.loadMacro('PROMPT MESSAGE="Hello user!"');

    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    expect(mockUI.showAlert).toHaveBeenCalledTimes(1);
    expect(mockUI.showPrompt).not.toHaveBeenCalled();
  });

  it('should call showAlert with positional message-only syntax', async () => {
    const mockUI = createMockUI();
    setFlowControlUI(mockUI);

    const executor = createPromptExecutor();
    executor.loadMacro('PROMPT "Just a message"');

    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(mockUI.showAlert).toHaveBeenCalledTimes(1);
    expect(mockUI.showPrompt).not.toHaveBeenCalled();
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
// E. PROMPT cancel -- continues silently without storing value
// ---------------------------------------------------------------------------
describe('PROMPT cancel behavior', () => {
  it('should continue silently when prompt is cancelled', async () => {
    const mockUI = createMockUI(
      vi.fn().mockRejectedValue(new Error('User cancelled'))
    );
    setFlowControlUI(mockUI);

    const executor = createPromptExecutor();
    executor.loadMacro('PROMPT MESSAGE="Cancel me" VAR=!VAR1');

    const result = await executor.execute();

    // Cancel continues silently — success, no value stored
    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  it('should not overwrite existing variable value on cancel', async () => {
    const mockUI = createMockUI(
      vi.fn().mockRejectedValue(new Error('cancelled'))
    );
    setFlowControlUI(mockUI);

    const executor = createPromptExecutor();
    executor.loadMacro('SET !VAR5 original\nPROMPT MESSAGE="Cancel me" VAR=!VAR5');

    const result = await executor.execute();

    expect(result.success).toBe(true);
    // Original value should be preserved since cancel doesn't store
    expect(result.variables['!VAR5']).toBe('original');
  });

  it('should continue execution after cancel', async () => {
    const mockUI = createMockUI(
      vi.fn().mockRejectedValue(new Error('cancelled'))
    );
    setFlowControlUI(mockUI);

    const executor = createPromptExecutor();
    // Cancel should NOT stop execution — SET !VAR2 should still run
    executor.loadMacro('PROMPT MESSAGE="Cancel me" VAR=!VAR1\nSET !VAR2 should_run');

    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    // !VAR2 should have been set because execution continued
    expect(result.variables['!VAR2']).toBe('should_run');
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

// ---------------------------------------------------------------------------
// H. Positional syntax: PROMPT message varname default
// ---------------------------------------------------------------------------
describe('PROMPT positional syntax', () => {
  it('should support PROMPT "message" !VAR1 syntax', async () => {
    const mockUI = createMockUI(vi.fn().mockResolvedValue('answer'));
    setFlowControlUI(mockUI);

    const executor = createPromptExecutor();
    executor.loadMacro('PROMPT "Enter name" !VAR1');

    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.variables['!VAR1']).toBe('answer');
  });

  it('should support PROMPT "message" !VAR1 defaultValue syntax', async () => {
    const mockUI = createMockUI(vi.fn().mockResolvedValue('typed'));
    setFlowControlUI(mockUI);

    const executor = createPromptExecutor();
    executor.loadMacro('PROMPT "Enter a Page Name" !VAR1 NoName');

    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(mockUI.showPrompt).toHaveBeenCalledWith('Enter a Page Name', 'NoName');
    expect(result.variables['!VAR1']).toBe('typed');
  });
});
