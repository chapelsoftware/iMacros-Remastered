/**
 * Unsupported Command Handlers for iMacros
 *
 * These commands were present in the original iMacros Firefox 8.9.7 but are not
 * supported in this extension-based implementation. They return a proper
 * UNSUPPORTED_COMMAND error code (-915) matching the original behavior, rather
 * than silently failing or crashing.
 *
 * Commands handled:
 * - IMAGECLICK: Image-based click (Windows-only, requires native host)
 * - ONCERTIFICATEDIALOG: Certificate dialog handling (not available in extensions)
 * - ONPRINT: Print dialog handling (not available in extensions)
 * - ONSECURITYDIALOG: Security dialog handling (not available in extensions)
 * - ONWEBPAGEDIALOG: Web page dialog handling (not available in extensions)
 * - PRINT: Print page command (not available in extensions)
 * - SIZE: Resize browser window (not reliably available in extensions)
 * - WINCLICK: Windows desktop click (requires native host winclick-service)
 * - DISCONNECT: Network disconnect (requires OS-specific implementation)
 * - REDIAL: Network reconnect (requires OS-specific implementation)
 * - EXTRACT (standalone): Extract without TAG (not meaningful without element)
 * - IMAGESEARCH: Image search on screen (non-Windows, requires native host)
 *
 * Note: Some of these have native host implementations (winclick-service,
 * image-search) that could be enabled later as enhancements beyond parity.
 */

import {
  CommandHandler,
  CommandContext,
  CommandResult,
  IMACROS_ERROR_CODES,
} from '../executor';
import type { CommandType } from '../parser';

/**
 * Create an unsupported command handler with a specific message.
 *
 * Returns a handler that logs a warning and returns the UNSUPPORTED_COMMAND
 * error code (-915), matching the behavior of the original iMacros Firefox
 * extension for commands it did not support.
 */
export function createUnsupportedHandler(
  commandName: string,
  reason: string
): CommandHandler {
  return async (ctx: CommandContext): Promise<CommandResult> => {
    ctx.log('warn', `Unsupported command: ${commandName} - ${reason}`);
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.UNSUPPORTED_COMMAND,
      errorMessage: `${commandName} is not supported: ${reason}`,
    };
  };
}

// ===== Individual Unsupported Command Handlers =====

/**
 * IMAGECLICK command handler (unsupported)
 *
 * IMAGECLICK requires native image recognition capabilities that are only
 * available on Windows with the native host. This could be enabled later
 * via the native host image-search service.
 */
export const imageClickHandler: CommandHandler = createUnsupportedHandler(
  'IMAGECLICK',
  'Image recognition requires the native host (Windows only)'
);

/**
 * ONCERTIFICATEDIALOG command handler (unsupported)
 *
 * Browser extensions cannot intercept SSL certificate dialogs.
 * The browser handles certificate validation at a lower level than
 * extensions can access.
 */
export const onCertificateDialogUnsupportedHandler: CommandHandler = createUnsupportedHandler(
  'ONCERTIFICATEDIALOG',
  'Certificate dialog handling is not available in browser extensions'
);

/**
 * ONPRINT command handler (unsupported)
 *
 * Browser extensions cannot intercept or control the native print dialog.
 */
export const onPrintUnsupportedHandler: CommandHandler = createUnsupportedHandler(
  'ONPRINT',
  'Print dialog handling is not available in browser extensions'
);

/**
 * ONSECURITYDIALOG command handler (unsupported)
 *
 * Browser extensions cannot intercept security dialogs that are handled
 * by the browser at a level below extension APIs.
 */
export const onSecurityDialogUnsupportedHandler: CommandHandler = createUnsupportedHandler(
  'ONSECURITYDIALOG',
  'Security dialog handling is not available in browser extensions'
);

/**
 * ONWEBPAGEDIALOG command handler (unsupported)
 *
 * While ONDIALOG handles standard JS dialogs (alert/confirm/prompt),
 * ONWEBPAGEDIALOG targeted custom modal dialogs that require different
 * interception mechanisms not available in extensions.
 */
export const onWebPageDialogUnsupportedHandler: CommandHandler = createUnsupportedHandler(
  'ONWEBPAGEDIALOG',
  'Web page dialog handling is not available in browser extensions'
);

/**
 * PRINT command handler (unsupported)
 *
 * The PRINT command triggers the browser print function. Browser extensions
 * cannot reliably trigger or control printing.
 */
export const printHandler: CommandHandler = createUnsupportedHandler(
  'PRINT',
  'Print command is not available in browser extensions'
);

/**
 * SIZE command handler (unsupported)
 *
 * The SIZE command resizes the browser window. Browser extensions have very
 * limited window management capabilities and cannot reliably resize windows.
 */
export const sizeHandler: CommandHandler = createUnsupportedHandler(
  'SIZE',
  'Window resize is not reliably available in browser extensions'
);

/**
 * WINCLICK command handler (unsupported)
 *
 * WINCLICK performs desktop-level mouse clicks outside the browser.
 * This requires the native host winclick-service which is Windows-only.
 */
export const winClickHandler: CommandHandler = createUnsupportedHandler(
  'WINCLICK',
  'Desktop click requires the native host winclick-service (Windows only)'
);

/**
 * DISCONNECT command handler (unsupported)
 *
 * DISCONNECT controls network connections at the OS level.
 * This requires an OS-specific native implementation.
 */
export const disconnectUnsupportedHandler: CommandHandler = createUnsupportedHandler(
  'DISCONNECT',
  'Network disconnect requires OS-specific native support'
);

/**
 * REDIAL command handler (unsupported)
 *
 * REDIAL reconnects network connections at the OS level.
 * This requires an OS-specific native implementation.
 */
export const redialUnsupportedHandler: CommandHandler = createUnsupportedHandler(
  'REDIAL',
  'Network redial requires OS-specific native support'
);

/**
 * Standalone EXTRACT command handler (unsupported)
 *
 * EXTRACT without a preceding TAG command has no element context to extract
 * from. In the original iMacros, standalone EXTRACT was not supported.
 * Use TAG ... EXTRACT=TXT instead.
 */
export const extractStandaloneUnsupportedHandler: CommandHandler = createUnsupportedHandler(
  'EXTRACT',
  'Standalone EXTRACT is not supported. Use TAG with EXTRACT parameter instead'
);

/**
 * IMAGESEARCH command handler (unsupported on non-Windows)
 *
 * IMAGESEARCH requires native image recognition capabilities.
 * On non-Windows platforms, this is not available. Could be enabled
 * later via the native host image-search service on Windows.
 */
export const imageSearchHandler: CommandHandler = createUnsupportedHandler(
  'IMAGESEARCH',
  'Image search requires the native host (Windows only)'
);

// ===== Handler Registration =====

/**
 * All unsupported command handlers mapped to their command types.
 *
 * Note: DISCONNECT and REDIAL override the handlers in system.ts that
 * attempt to use a network manager. Since no network manager is available
 * in the extension context, these return UNSUPPORTED_COMMAND instead of
 * SCRIPT_ERROR, which matches the original iMacros behavior.
 *
 * Similarly, ONCERTIFICATEDIALOG, ONPRINT, ONSECURITYDIALOG, and
 * ONWEBPAGEDIALOG override the handlers in dialogs.ts since those dialog
 * types cannot actually be intercepted by browser extensions.
 */
export const unsupportedHandlers: Partial<Record<CommandType, CommandHandler>> = {
  IMAGECLICK: imageClickHandler,
  ONCERTIFICATEDIALOG: onCertificateDialogUnsupportedHandler,
  ONPRINT: onPrintUnsupportedHandler,
  ONSECURITYDIALOG: onSecurityDialogUnsupportedHandler,
  ONWEBPAGEDIALOG: onWebPageDialogUnsupportedHandler,
  PRINT: printHandler,
  SIZE: sizeHandler,
  WINCLICK: winClickHandler,
  DISCONNECT: disconnectUnsupportedHandler,
  REDIAL: redialUnsupportedHandler,
  EXTRACT: extractStandaloneUnsupportedHandler,
  IMAGESEARCH: imageSearchHandler,
};

/**
 * Register all unsupported command handlers with an executor.
 *
 * These should be registered AFTER other handlers so they serve as
 * the default behavior when no platform-specific implementation
 * overrides them.
 */
export function registerUnsupportedHandlers(
  registerFn: (type: CommandType, handler: CommandHandler) => void
): void {
  for (const [type, handler] of Object.entries(unsupportedHandlers)) {
    if (handler) {
      registerFn(type as CommandType, handler);
    }
  }
}
