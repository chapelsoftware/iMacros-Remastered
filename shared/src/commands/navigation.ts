/**
 * Navigation Command Handlers for iMacros
 *
 * Implements handlers for navigation-related commands:
 * - URL GOTO=url and URL CURRENT
 * - BACK command
 * - REFRESH command
 * - TAB T=n, TAB OPEN, TAB CLOSE, TAB CLOSEALLOTHERS
 * - FRAME F=n for frame selection
 *
 * These handlers communicate with the browser extension for actual browser operations.
 */

import {
  CommandHandler,
  CommandContext,
  CommandResult,
  IMACROS_ERROR_CODES,
} from '../executor';

// ===== Browser Message Types =====

/**
 * Message types for browser operations
 */
export type BrowserMessageType =
  | 'navigate'
  | 'getCurrentUrl'
  | 'goBack'
  | 'refresh'
  | 'switchTab'
  | 'openTab'
  | 'closeTab'
  | 'closeOtherTabs'
  | 'selectFrame';

/**
 * Base message for browser operations
 */
export interface BrowserMessage {
  type: BrowserMessageType;
  id: string;
  timestamp: number;
}

/**
 * Navigate to URL message
 */
export interface NavigateMessage extends BrowserMessage {
  type: 'navigate';
  url: string;
}

/**
 * Get current URL message
 */
export interface GetCurrentUrlMessage extends BrowserMessage {
  type: 'getCurrentUrl';
}

/**
 * Go back message
 */
export interface GoBackMessage extends BrowserMessage {
  type: 'goBack';
}

/**
 * Refresh message
 */
export interface RefreshMessage extends BrowserMessage {
  type: 'refresh';
}

/**
 * Switch tab message
 */
export interface SwitchTabMessage extends BrowserMessage {
  type: 'switchTab';
  tabIndex: number;
}

/**
 * Open new tab message
 */
export interface OpenTabMessage extends BrowserMessage {
  type: 'openTab';
  url?: string;
}

/**
 * Close tab message
 */
export interface CloseTabMessage extends BrowserMessage {
  type: 'closeTab';
}

/**
 * Close other tabs message
 */
export interface CloseOtherTabsMessage extends BrowserMessage {
  type: 'closeOtherTabs';
}

/**
 * Select frame message
 */
export interface SelectFrameMessage extends BrowserMessage {
  type: 'selectFrame';
  frameIndex?: number;
  frameName?: string;
}

/**
 * Union type for all browser messages
 */
export type BrowserOperationMessage =
  | NavigateMessage
  | GetCurrentUrlMessage
  | GoBackMessage
  | RefreshMessage
  | SwitchTabMessage
  | OpenTabMessage
  | CloseTabMessage
  | CloseOtherTabsMessage
  | SelectFrameMessage;

/**
 * Response from browser operation
 */
export interface BrowserOperationResponse {
  success: boolean;
  error?: string;
  data?: {
    url?: string;
    tabIndex?: number;
    frameIndex?: number;
  };
}

// ===== Browser Communication Interface =====

/**
 * Interface for sending messages to the browser extension
 * This should be implemented by the extension/native host layer
 */
export interface BrowserBridge {
  /**
   * Send a message to the browser extension and wait for response
   */
  sendMessage(message: BrowserOperationMessage): Promise<BrowserOperationResponse>;
}

/**
 * Default browser bridge that logs warnings (for testing without extension)
 */
let currentBridge: BrowserBridge | null = null;

/**
 * Set the browser bridge for navigation commands
 */
export function setBrowserBridge(bridge: BrowserBridge): void {
  currentBridge = bridge;
}

/**
 * Get the current browser bridge
 */
export function getBrowserBridge(): BrowserBridge | null {
  return currentBridge;
}

/**
 * Create a unique message ID
 */
function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Message payload types without id and timestamp
 */
type NavigatePayload = { type: 'navigate'; url: string };
type GetCurrentUrlPayload = { type: 'getCurrentUrl' };
type GoBackPayload = { type: 'goBack' };
type RefreshPayload = { type: 'refresh' };
type SwitchTabPayload = { type: 'switchTab'; tabIndex: number };
type OpenTabPayload = { type: 'openTab'; url?: string };
type CloseTabPayload = { type: 'closeTab' };
type CloseOtherTabsPayload = { type: 'closeOtherTabs' };
type SelectFramePayload = { type: 'selectFrame'; frameIndex?: number; frameName?: string };

type BrowserMessagePayload =
  | NavigatePayload
  | GetCurrentUrlPayload
  | GoBackPayload
  | RefreshPayload
  | SwitchTabPayload
  | OpenTabPayload
  | CloseTabPayload
  | CloseOtherTabsPayload
  | SelectFramePayload;

/**
 * Send a browser message and get the response
 */
async function sendBrowserMessage(
  message: BrowserMessagePayload,
  ctx: CommandContext
): Promise<BrowserOperationResponse> {
  const fullMessage = {
    ...message,
    id: createMessageId(),
    timestamp: Date.now(),
  } as BrowserOperationMessage;

  if (!currentBridge) {
    ctx.log('warn', `No browser bridge configured for ${message.type} operation`);
    // Return success for testing/development without extension
    return { success: true };
  }

  try {
    return await currentBridge.sendMessage(fullMessage);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    ctx.log('error', `Browser operation failed: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

// ===== URL Command Handler =====

/**
 * Handler for URL command
 *
 * Syntax:
 * - URL GOTO=<url> - Navigate to the specified URL
 * - URL CURRENT - Get the current URL (stores in !URLCURRENT)
 */
export const urlHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const gotoParam = ctx.getParam('GOTO');
  const currentParam = ctx.command.parameters.some(
    p => p.key.toUpperCase() === 'CURRENT'
  );

  if (currentParam) {
    // URL CURRENT - get current URL
    ctx.log('debug', 'Getting current URL');

    const response = await sendBrowserMessage({ type: 'getCurrentUrl' }, ctx);

    if (!response.success) {
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
        errorMessage: response.error || 'Failed to get current URL',
      };
    }

    // Store in !URLCURRENT variable (use setUrl to bypass read-only check)
    const url = response.data?.url || '';
    ctx.variables.setUrl('current', url);
    ctx.log('info', `Current URL: ${url}`);

    return {
      success: true,
      errorCode: IMACROS_ERROR_CODES.OK,
      output: url,
    };
  }

  if (gotoParam) {
    // URL GOTO=<url> - navigate to URL
    const url = ctx.expand(gotoParam);
    ctx.log('info', `Navigating to: ${url}`);

    const response = await sendBrowserMessage({ type: 'navigate', url }, ctx);

    if (!response.success) {
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.PAGE_TIMEOUT,
        errorMessage: response.error || `Failed to navigate to ${url}`,
      };
    }

    // Update !URLCURRENT after navigation (use setUrl to bypass read-only check)
    ctx.variables.setUrl('current', url);

    return {
      success: true,
      errorCode: IMACROS_ERROR_CODES.OK,
    };
  }

  return {
    success: false,
    errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
    errorMessage: 'URL command requires GOTO or CURRENT parameter',
  };
};

// ===== BACK Command Handler =====

/**
 * Handler for BACK command
 *
 * Syntax: BACK
 * Navigates to the previous page in browser history
 */
export const backHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  ctx.log('info', 'Navigating back');

  const response = await sendBrowserMessage({ type: 'goBack' }, ctx);

  if (!response.success) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: response.error || 'Failed to navigate back',
    };
  }

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
  };
};

// ===== REFRESH Command Handler =====

/**
 * Handler for REFRESH command
 *
 * Syntax: REFRESH
 * Refreshes/reloads the current page
 */
export const refreshHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  ctx.log('info', 'Refreshing page');

  const response = await sendBrowserMessage({ type: 'refresh' }, ctx);

  if (!response.success) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: response.error || 'Failed to refresh page',
    };
  }

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
  };
};

// ===== TAB Command Handler =====

/**
 * Handler for TAB command
 *
 * Syntax:
 * - TAB T=<n> - Switch to tab number n (1-based)
 * - TAB OPEN [URL=<url>] - Open a new tab
 * - TAB CLOSE - Close the current tab
 * - TAB CLOSEALLOTHERS - Close all tabs except the current one
 */
export const tabHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const tParam = ctx.getParam('T');
  const openParam = ctx.command.parameters.some(
    p => p.key.toUpperCase() === 'OPEN'
  );
  const closeParam = ctx.command.parameters.some(
    p => p.key.toUpperCase() === 'CLOSE'
  );
  const closeAllOthersParam = ctx.command.parameters.some(
    p => p.key.toUpperCase() === 'CLOSEALLOTHERS'
  );

  if (closeAllOthersParam) {
    // TAB CLOSEALLOTHERS - close all other tabs
    ctx.log('info', 'Closing all other tabs');

    const response = await sendBrowserMessage({ type: 'closeOtherTabs' }, ctx);

    if (!response.success) {
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
        errorMessage: response.error || 'Failed to close other tabs',
      };
    }

    return {
      success: true,
      errorCode: IMACROS_ERROR_CODES.OK,
    };
  }

  if (closeParam) {
    // TAB CLOSE - close current tab
    ctx.log('info', 'Closing current tab');

    const response = await sendBrowserMessage({ type: 'closeTab' }, ctx);

    if (!response.success) {
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
        errorMessage: response.error || 'Failed to close tab',
      };
    }

    return {
      success: true,
      errorCode: IMACROS_ERROR_CODES.OK,
    };
  }

  if (openParam) {
    // TAB OPEN - open new tab
    const urlParam = ctx.getParam('URL');
    const url = urlParam ? ctx.expand(urlParam) : undefined;

    ctx.log('info', url ? `Opening new tab with URL: ${url}` : 'Opening new tab');

    const response = await sendBrowserMessage({ type: 'openTab', url }, ctx);

    if (!response.success) {
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
        errorMessage: response.error || 'Failed to open new tab',
      };
    }

    return {
      success: true,
      errorCode: IMACROS_ERROR_CODES.OK,
    };
  }

  if (tParam) {
    // TAB T=<n> - switch to tab n
    const tabIndex = parseInt(ctx.expand(tParam), 10);

    if (isNaN(tabIndex) || tabIndex < 1) {
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
        errorMessage: `Invalid tab index: ${tParam}`,
      };
    }

    ctx.log('info', `Switching to tab ${tabIndex}`);

    // Convert to 0-based index for browser API
    const response = await sendBrowserMessage(
      { type: 'switchTab', tabIndex: tabIndex - 1 },
      ctx
    );

    if (!response.success) {
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
        errorMessage: response.error || `Failed to switch to tab ${tabIndex}`,
      };
    }

    return {
      success: true,
      errorCode: IMACROS_ERROR_CODES.OK,
    };
  }

  return {
    success: false,
    errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
    errorMessage: 'TAB command requires T, OPEN, CLOSE, or CLOSEALLOTHERS parameter',
  };
};

// ===== FRAME Command Handler =====

/**
 * Helper to sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get the timeout in seconds for frame retry from !TIMEOUT_STEP variable.
 * Returns 0 if the variable is not set or invalid (no retry).
 */
function getFrameRetryTimeout(ctx: CommandContext): number {
  const timeoutStep = ctx.state.getVariable('!TIMEOUT_STEP');
  if (typeof timeoutStep === 'number') return timeoutStep;
  if (typeof timeoutStep === 'string') {
    const parsed = parseFloat(timeoutStep);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * Attempt to select a frame with retry logic.
 * Retries every 500ms up to !TIMEOUT_STEP seconds.
 * On failure, resets to main frame (iMacros 8.9.7 compat).
 */
async function selectFrameWithRetry(
  message: SelectFramePayload,
  ctx: CommandContext,
  errorLabel: string
): Promise<CommandResult> {
  const timeoutSeconds = getFrameRetryTimeout(ctx);
  const retryIntervalMs = 500;
  const deadline = Date.now() + timeoutSeconds * 1000;

  // First attempt
  let response = await sendBrowserMessage(message, ctx);
  if (response.success) {
    return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
  }

  // Retry until timeout
  while (Date.now() < deadline) {
    ctx.log('debug', `Frame not found, retrying... (${Math.ceil((deadline - Date.now()) / 1000)}s remaining)`);
    await sleep(retryIntervalMs);
    response = await sendBrowserMessage(message, ctx);
    if (response.success) {
      return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
    }
  }

  // Failed: reset to main frame (iMacros 8.9.7 compat)
  ctx.log('debug', 'Frame selection failed, resetting to main frame');
  await sendBrowserMessage({ type: 'selectFrame', frameIndex: 0 }, ctx);

  return {
    success: false,
    errorCode: IMACROS_ERROR_CODES.FRAME_NOT_FOUND,
    errorMessage: response.error || errorLabel,
  };
}

/**
 * Handler for FRAME command
 *
 * Syntax:
 * - FRAME F=<n> - Select frame by index (0 = main document)
 * - FRAME NAME=<name> - Select frame by name (supports * wildcard)
 *
 * iMacros 8.9.7 compatibility:
 * - Wildcards (*) in NAME are auto-converted to regex
 * - Retries with polling up to !TIMEOUT_STEP seconds
 * - Resets to main frame on failure
 * - Uses error code -922 for frame not found
 */
export const frameHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const fParam = ctx.getParam('F');
  const nameParam = ctx.getParam('NAME');

  if (fParam !== undefined) {
    // FRAME F=<n> - select frame by index
    const frameIndex = parseInt(ctx.expand(fParam), 10);

    if (isNaN(frameIndex) || frameIndex < 0) {
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
        errorMessage: `Invalid frame index: ${fParam}`,
      };
    }

    ctx.log('info', frameIndex === 0 ? 'Selecting main document' : `Selecting frame ${frameIndex}`);

    return selectFrameWithRetry(
      { type: 'selectFrame', frameIndex },
      ctx,
      `Frame ${frameIndex} not found`
    );
  }

  if (nameParam) {
    // FRAME NAME=<name> - select frame by name
    const frameName = ctx.expand(nameParam);

    ctx.log('info', `Selecting frame by name: ${frameName}`);

    return selectFrameWithRetry(
      { type: 'selectFrame', frameName },
      ctx,
      `Frame "${frameName}" not found`
    );
  }

  return {
    success: false,
    errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
    errorMessage: 'FRAME command requires F or NAME parameter',
  };
};

// ===== Handler Registration =====

/**
 * All navigation command handlers
 */
export const navigationHandlers = {
  URL: urlHandler,
  BACK: backHandler,
  REFRESH: refreshHandler,
  TAB: tabHandler,
  FRAME: frameHandler,
} as const;

/**
 * Register all navigation handlers with the executor
 */
export function registerNavigationHandlers(executor: {
  registerHandler: (type: string, handler: CommandHandler) => void;
}): void {
  for (const [type, handler] of Object.entries(navigationHandlers)) {
    executor.registerHandler(type, handler);
  }
}
