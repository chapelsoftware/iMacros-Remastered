/**
 * Flow Control Command Handlers for iMacros
 *
 * Implements handlers for flow control commands:
 * - WAIT SECONDS=n: Delay execution for specified seconds
 * - PAUSE: Show dialog and wait for user confirmation
 * - PROMPT message: Show input dialog and store result in variable
 * - !TIMEOUT_TAG retry logic: Automatic retry for element wait timeout
 */

import {
  CommandHandler,
  CommandContext,
  CommandResult,
  IMACROS_ERROR_CODES,
} from '../executor';
import type { CommandType } from '../parser';

// ===== UI Callback Types =====

/**
 * Callback for showing pause dialog
 * Should return a promise that resolves when user clicks OK/Continue
 * or rejects if user cancels
 */
export type PauseDialogCallback = (message?: string) => Promise<void>;

/**
 * Callback for showing prompt dialog
 * Should return a promise that resolves with user input string
 * or rejects if user cancels
 */
export type PromptDialogCallback = (message: string, defaultValue?: string) => Promise<string>;

/**
 * Callback for showing alert/message dialog
 */
export type AlertDialogCallback = (message: string, title?: string) => Promise<void>;

/**
 * Interface for UI callbacks used by flow control commands
 */
export interface FlowControlUI {
  /** Show pause dialog */
  showPause: PauseDialogCallback;
  /** Show prompt dialog for user input */
  showPrompt: PromptDialogCallback;
  /** Show alert message */
  showAlert: AlertDialogCallback;
}

/**
 * Default no-op UI callbacks for testing/headless mode
 */
const defaultUI: FlowControlUI = {
  showPause: async () => {
    // No-op in headless mode - returns immediately
  },
  showPrompt: async (message: string, defaultValue?: string) => {
    // Return default value or empty string in headless mode
    return defaultValue ?? '';
  },
  showAlert: async () => {
    // No-op in headless mode
  },
};

/**
 * Active UI callbacks (can be set by extension)
 */
let activeUI: FlowControlUI = defaultUI;

/**
 * Set the UI callbacks for flow control commands
 */
export function setFlowControlUI(ui: FlowControlUI): void {
  activeUI = ui;
}

/**
 * Get the current UI callbacks
 */
export function getFlowControlUI(): FlowControlUI {
  return activeUI;
}

/**
 * Reset UI to default (for testing)
 */
export function resetFlowControlUI(): void {
  activeUI = defaultUI;
}

// ===== Timeout Tag Retry Logic =====

/**
 * Configuration for timeout retry behavior
 */
export interface TimeoutRetryConfig {
  /** Maximum number of retries (from !TIMEOUT_TAG) */
  maxRetries: number;
  /** Delay between retries in milliseconds */
  retryDelayMs: number;
  /** Current retry count */
  currentRetry: number;
}

/**
 * Get timeout retry configuration from state variables
 */
export function getTimeoutRetryConfig(ctx: CommandContext): TimeoutRetryConfig {
  // !TIMEOUT_TAG sets max wait time for element operations (seconds)
  const timeoutTag = ctx.state.getVariable('!TIMEOUT_TAG');
  const timeoutSeconds = typeof timeoutTag === 'number' ? timeoutTag :
    typeof timeoutTag === 'string' ? parseFloat(timeoutTag) : 10;

  // Calculate retries based on timeout (retry every 1 second by default)
  const retryDelayMs = 1000;
  const maxRetries = Math.max(1, Math.ceil(timeoutSeconds));

  return {
    maxRetries,
    retryDelayMs,
    currentRetry: 0,
  };
}

/**
 * Execute a command with timeout retry logic
 * Used for TAG and other element-finding commands
 */
export async function executeWithTimeoutRetry(
  ctx: CommandContext,
  operation: () => Promise<CommandResult>,
  isRetryableError: (result: CommandResult) => boolean = (r) =>
    r.errorCode === IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND ||
    r.errorCode === IMACROS_ERROR_CODES.TIMEOUT
): Promise<CommandResult> {
  const config = getTimeoutRetryConfig(ctx);

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    const result = await operation();

    // Success - return immediately
    if (result.success) {
      return result;
    }

    // Check if error is retryable
    if (!isRetryableError(result)) {
      return result;
    }

    // Last attempt - return the error
    if (attempt >= config.maxRetries) {
      ctx.log('warn', `Timeout after ${config.maxRetries} retries`);
      return {
        ...result,
        errorCode: IMACROS_ERROR_CODES.TIMEOUT,
        errorMessage: `Timeout waiting for element (${config.maxRetries}s): ${result.errorMessage || 'Element not found'}`,
      };
    }

    // Log retry attempt
    ctx.log('debug', `Retry ${attempt + 1}/${config.maxRetries}: ${result.errorMessage}`);

    // Wait before retry
    await delay(config.retryDelayMs);
  }

  // Should not reach here, but return timeout error just in case
  return {
    success: false,
    errorCode: IMACROS_ERROR_CODES.TIMEOUT,
    errorMessage: 'Timeout retry logic exhausted',
  };
}

// ===== Helper Functions =====

/**
 * Delay execution for specified milliseconds
 */
function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Parse seconds value from string, supporting decimal values
 */
function parseSeconds(value: string): number {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0 : Math.max(0, parsed);
}

// ===== Command Handlers =====

/**
 * WAIT command handler
 *
 * Syntax: WAIT SECONDS=n
 * Delays macro execution for n seconds (supports decimals)
 *
 * Examples:
 * - WAIT SECONDS=5     - Wait 5 seconds
 * - WAIT SECONDS=0.5   - Wait 500 milliseconds
 * - WAIT SECONDS={{VAR}} - Wait using variable value
 */
export const waitHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const secondsParam = ctx.getParam('SECONDS');

  if (!secondsParam) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'WAIT command requires SECONDS parameter',
    };
  }

  const expandedValue = ctx.expand(secondsParam);
  const seconds = parseSeconds(expandedValue);

  if (seconds <= 0) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
      errorMessage: `Invalid SECONDS value: ${secondsParam} (expanded: ${expandedValue})`,
    };
  }

  // Respect !TIMEOUT_STEP if set and waiting would exceed it
  const timeoutStep = ctx.state.getVariable('!TIMEOUT_STEP');
  const maxWait = typeof timeoutStep === 'number' ? timeoutStep :
    typeof timeoutStep === 'string' ? parseFloat(timeoutStep) : Infinity;

  if (seconds > maxWait && maxWait > 0) {
    ctx.log('warn', `WAIT ${seconds}s exceeds !TIMEOUT_STEP (${maxWait}s), capping wait time`);
  }

  const actualWait = Math.min(seconds, maxWait > 0 ? maxWait : seconds);
  const waitMs = actualWait * 1000;

  ctx.log('info', `Waiting ${actualWait} second${actualWait !== 1 ? 's' : ''}...`);

  await delay(waitMs);

  ctx.log('debug', `Wait completed (${actualWait}s)`);

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
  };
};

/**
 * PAUSE command handler
 *
 * Syntax: PAUSE
 * Shows a dialog and waits for user confirmation before continuing.
 * The macro is suspended until the user clicks OK/Continue.
 *
 * In headless mode, PAUSE is a no-op (continues immediately).
 */
export const pauseHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  ctx.log('info', 'Macro paused - waiting for user confirmation');

  try {
    // Show pause dialog
    await activeUI.showPause('Macro execution paused. Click OK to continue.');

    ctx.log('info', 'User confirmed - resuming macro');

    return {
      success: true,
      errorCode: IMACROS_ERROR_CODES.OK,
    };
  } catch (error) {
    // User cancelled or dialog was dismissed
    ctx.log('info', 'User cancelled pause dialog');

    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.USER_ABORT,
      errorMessage: 'User cancelled the pause dialog',
      stopExecution: true,
    };
  }
};

/**
 * PROMPT command handler
 *
 * Syntax: PROMPT message [DEFAULT=value] [VAR=varname]
 * Shows an input dialog and stores the result in a variable.
 *
 * Parameters:
 * - message: The prompt message to display (first parameter or MESSAGE param)
 * - DEFAULT: Optional default value for the input field
 * - VAR: Variable to store result (defaults to !INPUT)
 *
 * Examples:
 * - PROMPT "Enter your username:"
 * - PROMPT MESSAGE="Enter password:" VAR=!VAR1
 * - PROMPT "Search term:" DEFAULT="default search" VAR=!VAR2
 */
export const promptHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  // Get the message - can be first positional param or MESSAGE param
  let message = ctx.getParam('MESSAGE');

  // If no MESSAGE param, check first parameter (positional)
  if (!message) {
    const params = ctx.command.parameters;
    if (params.length > 0 && params[0].key !== 'MESSAGE' &&
        params[0].key !== 'DEFAULT' && params[0].key !== 'VAR') {
      // First param is the message itself
      message = params[0].value || params[0].key;
    }
  }

  if (!message) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'PROMPT command requires a message',
    };
  }

  // Expand variables in message
  const expandedMessage = ctx.expand(message);

  // Get optional default value
  const defaultParam = ctx.getParam('DEFAULT');
  const defaultValue = defaultParam ? ctx.expand(defaultParam) : undefined;

  // Get variable name to store result (defaults to !INPUT)
  const varParam = ctx.getParam('VAR');
  const varName = varParam ? ctx.expand(varParam) : '!INPUT';

  ctx.log('info', `Prompting user: "${expandedMessage}"`);

  try {
    // Show prompt dialog
    const userInput = await activeUI.showPrompt(expandedMessage, defaultValue);

    // Store result in specified variable
    ctx.state.setVariable(varName, userInput);

    ctx.log('info', `User input stored in ${varName}: "${userInput}"`);

    return {
      success: true,
      errorCode: IMACROS_ERROR_CODES.OK,
      output: userInput,
    };
  } catch (error) {
    // User cancelled the prompt
    ctx.log('info', 'User cancelled prompt dialog');

    // Store empty string on cancel
    ctx.state.setVariable(varName, '');

    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.USER_ABORT,
      errorMessage: 'User cancelled the prompt dialog',
      stopExecution: true,
    };
  }
};

// ===== Handler Registration =====

/**
 * All flow control command handlers
 */
export const flowHandlers: Partial<Record<CommandType, CommandHandler>> = {
  WAIT: waitHandler,
  PAUSE: pauseHandler,
  PROMPT: promptHandler,
};

/**
 * Register flow control handlers with an executor
 */
export function registerFlowHandlers(
  registerFn: (type: CommandType, handler: CommandHandler) => void
): void {
  for (const [type, handler] of Object.entries(flowHandlers)) {
    if (handler) {
      registerFn(type as CommandType, handler);
    }
  }
}

// ===== Exports =====

export type { CommandHandler, CommandContext, CommandResult };
