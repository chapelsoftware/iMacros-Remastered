/**
 * Dialog Command Handlers for iMacros
 *
 * Implements handlers for dialog-related commands:
 * - ONDIALOG: Handle alert/confirm/prompt dialogs with BUTTON=OK/CANCEL/YES/NO
 * - ONLOGIN: Handle HTTP authentication with USER= PASSWORD=
 * - ONCERTIFICATEDIALOG: Handle SSL certificate dialogs
 * - ONERRORDIALOG: Handle error dialogs
 * - ONSECURITYDIALOG: Handle security dialogs
 * - ONWEBPAGEDIALOG: Handle web page dialogs
 * - ONPRINT: Handle print dialogs
 *
 * These commands configure dialog interception behavior for content scripts.
 */

import {
  CommandHandler,
  CommandContext,
  CommandResult,
  IMACROS_ERROR_CODES,
} from '../executor';
import type { CommandType } from '../parser';

// ===== Dialog Message Types =====

/**
 * Types of dialog messages for content script communication
 */
export type DialogMessageType =
  | 'DIALOG_CONFIG'
  | 'LOGIN_CONFIG'
  | 'CERTIFICATE_CONFIG'
  | 'ERROR_DIALOG_CONFIG'
  | 'SECURITY_DIALOG_CONFIG'
  | 'WEBPAGE_DIALOG_CONFIG'
  | 'PRINT_CONFIG';

/**
 * Base message interface for dialog configuration
 */
export interface DialogMessage {
  /** Unique message ID */
  id: string;
  /** Message type */
  type: DialogMessageType;
  /** Timestamp */
  timestamp: number;
}

/**
 * Button types for ONDIALOG command
 */
export type DialogButton = 'OK' | 'CANCEL' | 'YES' | 'NO';

/**
 * Dialog types that can be intercepted
 */
export type DialogType = 'alert' | 'confirm' | 'prompt' | 'beforeunload';

/**
 * Configuration for ONDIALOG command
 */
export interface DialogConfig {
  /** Position indicator (usually 1) */
  pos: number;
  /** Button to click when dialog appears */
  button: DialogButton;
  /** Value to enter in prompt dialogs */
  content?: string;
  /** Whether this config is active */
  active: boolean;
}

/**
 * Message for configuring dialog interception
 */
export interface DialogConfigMessage extends DialogMessage {
  type: 'DIALOG_CONFIG';
  payload: {
    /** Dialog configuration */
    config: DialogConfig;
    /** Which dialog types to intercept */
    dialogTypes: DialogType[];
  };
}

/**
 * Configuration for ONLOGIN command (HTTP authentication)
 */
export interface LoginConfig {
  /** Username for HTTP auth */
  user: string;
  /** Password for HTTP auth */
  password: string;
  /** Whether this config is active */
  active: boolean;
}

/**
 * Message for configuring HTTP authentication
 */
export interface LoginConfigMessage extends DialogMessage {
  type: 'LOGIN_CONFIG';
  payload: {
    /** Login configuration */
    config: LoginConfig;
  };
}

/**
 * Configuration for ONCERTIFICATEDIALOG command
 */
export interface CertificateDialogConfig {
  /** Button to click (OK to accept, CANCEL to reject) */
  button: DialogButton;
  /** Whether to remember the decision */
  remember?: boolean;
  /** Whether this config is active */
  active: boolean;
}

/**
 * Message for configuring certificate dialog handling
 */
export interface CertificateConfigMessage extends DialogMessage {
  type: 'CERTIFICATE_CONFIG';
  payload: {
    /** Certificate dialog configuration */
    config: CertificateDialogConfig;
  };
}

/**
 * Configuration for ONERRORDIALOG command
 */
export interface ErrorDialogConfig {
  /** Button to click to dismiss error */
  button: DialogButton;
  /** Whether this config is active */
  active: boolean;
}

/**
 * Message for configuring error dialog handling
 */
export interface ErrorDialogConfigMessage extends DialogMessage {
  type: 'ERROR_DIALOG_CONFIG';
  payload: {
    /** Error dialog configuration */
    config: ErrorDialogConfig;
  };
}

/**
 * Configuration for ONSECURITYDIALOG command
 */
export interface SecurityDialogConfig {
  /** Button to click (OK to allow, CANCEL to block) */
  button: DialogButton;
  /** Whether this config is active */
  active: boolean;
}

/**
 * Message for configuring security dialog handling
 */
export interface SecurityDialogConfigMessage extends DialogMessage {
  type: 'SECURITY_DIALOG_CONFIG';
  payload: {
    /** Security dialog configuration */
    config: SecurityDialogConfig;
  };
}

/**
 * Configuration for ONWEBPAGEDIALOG command
 */
export interface WebPageDialogConfig {
  /** Button to click */
  button: DialogButton;
  /** Content/value to enter if applicable */
  content?: string;
  /** Whether this config is active */
  active: boolean;
}

/**
 * Message for configuring web page dialog handling
 */
export interface WebPageDialogConfigMessage extends DialogMessage {
  type: 'WEBPAGE_DIALOG_CONFIG';
  payload: {
    /** Web page dialog configuration */
    config: WebPageDialogConfig;
  };
}

/**
 * Configuration for ONPRINT command
 */
export interface PrintConfig {
  /** Button to click (OK to print, CANCEL to cancel) */
  button: DialogButton;
  /** Whether this config is active */
  active: boolean;
}

/**
 * Message for configuring print dialog handling
 */
export interface PrintConfigMessage extends DialogMessage {
  type: 'PRINT_CONFIG';
  payload: {
    /** Print dialog configuration */
    config: PrintConfig;
  };
}

/**
 * Union type for all dialog configuration messages
 */
export type DialogOperationMessage =
  | DialogConfigMessage
  | LoginConfigMessage
  | CertificateConfigMessage
  | ErrorDialogConfigMessage
  | SecurityDialogConfigMessage
  | WebPageDialogConfigMessage
  | PrintConfigMessage;

/**
 * Response from dialog configuration
 */
export interface DialogConfigResponse {
  /** Whether the configuration was accepted */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

// ===== Dialog Bridge Interface =====

/**
 * Interface for sending dialog configuration to content scripts/extension
 * This should be implemented by the extension layer
 */
export interface DialogBridge {
  /**
   * Send a dialog configuration message
   */
  sendMessage(message: DialogOperationMessage): Promise<DialogConfigResponse>;
}

/**
 * Default dialog bridge (for testing without extension)
 */
let currentDialogBridge: DialogBridge | null = null;

/**
 * Set the dialog bridge for dialog commands
 */
export function setDialogBridge(bridge: DialogBridge): void {
  currentDialogBridge = bridge;
}

/**
 * Get the current dialog bridge
 */
export function getDialogBridge(): DialogBridge | null {
  return currentDialogBridge;
}

/**
 * Create a unique message ID
 */
function createMessageId(): string {
  return `dialog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Send a dialog configuration message
 */
async function sendDialogMessage(
  message: Omit<DialogOperationMessage, 'id' | 'timestamp'>,
  ctx: CommandContext
): Promise<DialogConfigResponse> {
  const fullMessage = {
    ...message,
    id: createMessageId(),
    timestamp: Date.now(),
  } as DialogOperationMessage;

  if (!currentDialogBridge) {
    ctx.log('warn', `No dialog bridge configured for ${message.type} operation`);
    // Return success for testing/development without extension
    return { success: true };
  }

  try {
    return await currentDialogBridge.sendMessage(fullMessage);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    ctx.log('error', `Dialog configuration failed: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

/**
 * Parse button parameter value
 */
function parseButton(buttonStr: string): DialogButton {
  const upper = buttonStr.toUpperCase().trim();
  switch (upper) {
    case 'OK':
    case 'YES':
    case 'NO':
    case 'CANCEL':
      return upper as DialogButton;
    default:
      return 'OK';
  }
}

// ===== Command Handlers =====

/**
 * ONDIALOG command handler
 *
 * Configures automatic handling of alert/confirm/prompt dialogs.
 *
 * Syntax:
 * - ONDIALOG POS=1 BUTTON=OK
 * - ONDIALOG POS=1 BUTTON=CANCEL
 * - ONDIALOG POS=1 BUTTON=YES CONTENT="response text"
 */
export const onDialogHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  // Get POS parameter (usually 1, indicates dialog position/count)
  const posStr = ctx.getParam('POS');
  const buttonStr = ctx.getParam('BUTTON');

  if (!posStr || !buttonStr) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'ONDIALOG command requires POS and BUTTON parameters',
    };
  }

  const pos = parseInt(ctx.expand(posStr), 10);
  if (isNaN(pos) || pos < 1) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
      errorMessage: `Invalid POS value: ${posStr}`,
    };
  }

  const button = parseButton(ctx.expand(buttonStr));
  const contentStr = ctx.getParam('CONTENT');
  const content = contentStr ? ctx.expand(contentStr) : undefined;

  ctx.log('info', `Configuring dialog handler: POS=${pos}, BUTTON=${button}${content ? `, CONTENT=${content}` : ''}`);

  // Store configuration in state for content script to use
  ctx.state.setVariable('!DIALOG_POS', pos.toString());
  ctx.state.setVariable('!DIALOG_BUTTON', button);
  if (content) {
    ctx.state.setVariable('!DIALOG_CONTENT', content);
  }

  // Send configuration to content script
  const response = await sendDialogMessage(
    {
      type: 'DIALOG_CONFIG',
      payload: {
        config: {
          pos,
          button,
          content,
          active: true,
        },
        dialogTypes: ['alert', 'confirm', 'prompt', 'beforeunload'],
      },
    },
    ctx
  );

  if (!response.success) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: response.error || 'Failed to configure dialog handler',
    };
  }

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
  };
};

/**
 * ONLOGIN command handler
 *
 * Configures automatic handling of HTTP authentication dialogs.
 *
 * Syntax:
 * - ONLOGIN USER=username PASSWORD=password
 */
export const onLoginHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const userStr = ctx.getParam('USER');
  const passwordStr = ctx.getParam('PASSWORD');

  if (!userStr || !passwordStr) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'ONLOGIN command requires USER and PASSWORD parameters',
    };
  }

  const user = ctx.expand(userStr);
  const password = ctx.expand(passwordStr);

  ctx.log('info', `Configuring HTTP auth handler: USER=${user}`);

  // Store configuration in state
  ctx.state.setVariable('!LOGIN_USER', user);
  ctx.state.setVariable('!LOGIN_PASSWORD', password);

  // Send configuration to extension
  const response = await sendDialogMessage(
    {
      type: 'LOGIN_CONFIG',
      payload: {
        config: {
          user,
          password,
          active: true,
        },
      },
    },
    ctx
  );

  if (!response.success) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: response.error || 'Failed to configure login handler',
    };
  }

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
  };
};

/**
 * ONCERTIFICATEDIALOG command handler
 *
 * Configures automatic handling of SSL certificate dialogs.
 *
 * Syntax:
 * - ONCERTIFICATEDIALOG BUTTON=OK
 * - ONCERTIFICATEDIALOG BUTTON=CANCEL
 */
export const onCertificateDialogHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const buttonStr = ctx.getParam('BUTTON');
  const button = buttonStr ? parseButton(ctx.expand(buttonStr)) : 'OK';

  ctx.log('info', `Configuring certificate dialog handler: BUTTON=${button}`);

  // Store configuration in state
  ctx.state.setVariable('!CERTIFICATE_BUTTON', button);

  // Send configuration to extension
  const response = await sendDialogMessage(
    {
      type: 'CERTIFICATE_CONFIG',
      payload: {
        config: {
          button,
          active: true,
        },
      },
    },
    ctx
  );

  if (!response.success) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: response.error || 'Failed to configure certificate dialog handler',
    };
  }

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
  };
};

/**
 * ONERRORDIALOG command handler
 *
 * Configures automatic handling of error dialogs.
 *
 * Syntax:
 * - ONERRORDIALOG BUTTON=OK
 */
export const onErrorDialogHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const buttonStr = ctx.getParam('BUTTON');
  const button = buttonStr ? parseButton(ctx.expand(buttonStr)) : 'OK';

  ctx.log('info', `Configuring error dialog handler: BUTTON=${button}`);

  // Store configuration in state
  ctx.state.setVariable('!ERROR_DIALOG_BUTTON', button);

  // Send configuration to extension
  const response = await sendDialogMessage(
    {
      type: 'ERROR_DIALOG_CONFIG',
      payload: {
        config: {
          button,
          active: true,
        },
      },
    },
    ctx
  );

  if (!response.success) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: response.error || 'Failed to configure error dialog handler',
    };
  }

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
  };
};

/**
 * ONSECURITYDIALOG command handler
 *
 * Configures automatic handling of security dialogs.
 *
 * Syntax:
 * - ONSECURITYDIALOG BUTTON=OK
 * - ONSECURITYDIALOG BUTTON=CANCEL
 */
export const onSecurityDialogHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const buttonStr = ctx.getParam('BUTTON');
  const button = buttonStr ? parseButton(ctx.expand(buttonStr)) : 'OK';

  ctx.log('info', `Configuring security dialog handler: BUTTON=${button}`);

  // Store configuration in state
  ctx.state.setVariable('!SECURITY_DIALOG_BUTTON', button);

  // Send configuration to extension
  const response = await sendDialogMessage(
    {
      type: 'SECURITY_DIALOG_CONFIG',
      payload: {
        config: {
          button,
          active: true,
        },
      },
    },
    ctx
  );

  if (!response.success) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: response.error || 'Failed to configure security dialog handler',
    };
  }

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
  };
};

/**
 * ONWEBPAGEDIALOG command handler
 *
 * Configures automatic handling of web page dialogs (modal dialogs from pages).
 *
 * Syntax:
 * - ONWEBPAGEDIALOG BUTTON=OK
 * - ONWEBPAGEDIALOG BUTTON=CANCEL CONTENT="response"
 */
export const onWebPageDialogHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const buttonStr = ctx.getParam('BUTTON');
  const button = buttonStr ? parseButton(ctx.expand(buttonStr)) : 'OK';
  const contentStr = ctx.getParam('CONTENT');
  const content = contentStr ? ctx.expand(contentStr) : undefined;

  ctx.log('info', `Configuring web page dialog handler: BUTTON=${button}${content ? `, CONTENT=${content}` : ''}`);

  // Store configuration in state
  ctx.state.setVariable('!WEBPAGE_DIALOG_BUTTON', button);
  if (content) {
    ctx.state.setVariable('!WEBPAGE_DIALOG_CONTENT', content);
  }

  // Send configuration to extension
  const response = await sendDialogMessage(
    {
      type: 'WEBPAGE_DIALOG_CONFIG',
      payload: {
        config: {
          button,
          content,
          active: true,
        },
      },
    },
    ctx
  );

  if (!response.success) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: response.error || 'Failed to configure web page dialog handler',
    };
  }

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
  };
};

/**
 * ONPRINT command handler
 *
 * Configures automatic handling of print dialogs.
 *
 * Syntax:
 * - ONPRINT BUTTON=OK
 * - ONPRINT BUTTON=CANCEL
 */
export const onPrintHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const buttonStr = ctx.getParam('BUTTON');
  const button = buttonStr ? parseButton(ctx.expand(buttonStr)) : 'OK';

  ctx.log('info', `Configuring print dialog handler: BUTTON=${button}`);

  // Store configuration in state
  ctx.state.setVariable('!PRINT_BUTTON', button);

  // Send configuration to extension
  const response = await sendDialogMessage(
    {
      type: 'PRINT_CONFIG',
      payload: {
        config: {
          button,
          active: true,
        },
      },
    },
    ctx
  );

  if (!response.success) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: response.error || 'Failed to configure print dialog handler',
    };
  }

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
  };
};

// ===== Handler Registration =====

/**
 * All dialog command handlers
 */
export const dialogHandlers: Partial<Record<CommandType, CommandHandler>> = {
  ONDIALOG: onDialogHandler,
  ONLOGIN: onLoginHandler,
  ONCERTIFICATEDIALOG: onCertificateDialogHandler,
  ONERRORDIALOG: onErrorDialogHandler,
  ONSECURITYDIALOG: onSecurityDialogHandler,
  ONWEBPAGEDIALOG: onWebPageDialogHandler,
  ONPRINT: onPrintHandler,
};

/**
 * Register all dialog handlers with the executor
 */
export function registerDialogHandlers(
  registerFn: (type: CommandType, handler: CommandHandler) => void
): void {
  for (const [type, handler] of Object.entries(dialogHandlers)) {
    if (handler) {
      registerFn(type as CommandType, handler);
    }
  }
}
