/**
 * PRINT Command Handler for iMacros
 *
 * Prints the current page. When native host is available, uses Puppeteer
 * for silent printing with full control over print settings. When native
 * host is not available, falls back to window.print() which shows the
 * browser's print dialog.
 *
 * Syntax:
 *   PRINT
 *
 * Notes:
 *   - Silent printing (no dialog) requires the native host to be installed
 *   - The native host uses Puppeteer's PDF generation and system print commands
 *   - Fallback mode shows the browser print dialog
 *   - ONPRINT command can be used to configure print behavior beforehand
 */

import {
  CommandHandler,
  CommandContext,
  CommandResult,
  IMACROS_ERROR_CODES,
} from '../executor';
import type { CommandType } from '../parser';

// ===== Print Service Interface =====

/**
 * Options for print operations
 */
export interface PrintOptions {
  /** URL to print (defaults to current page URL) */
  url?: string;
  /** Print to a physical printer (vs just generating PDF) */
  toPrinter?: boolean;
  /** Printer name (uses system default if not specified) */
  printerName?: string;
  /** Whether to wait for network idle before printing */
  waitForNetworkIdle?: boolean;
  /** Additional wait time in ms after page load */
  waitAfterLoad?: number;
}

/**
 * Result of print operations
 */
export interface PrintResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Path to generated PDF (if applicable) */
  pdfPath?: string;
  /** Whether fallback was used */
  usedFallback?: boolean;
}

/**
 * Interface for Print service
 * This should be implemented by the native host
 */
export interface PrintService {
  /**
   * Print the current page or a specified URL
   */
  print(options: PrintOptions): Promise<PrintResult>;

  /**
   * Check if the service is available
   */
  isAvailable(): boolean;
}

/**
 * Default no-op service (returns that native host is not available)
 * This is used when the native host is not connected
 */
const noopPrintService: PrintService = {
  async print(_options: PrintOptions): Promise<PrintResult> {
    return {
      success: false,
      error: 'PRINT requires the native host for silent printing',
    };
  },
  isAvailable(): boolean {
    return false;
  },
};

/**
 * Active Print service (set by native host)
 */
let activePrintService: PrintService = noopPrintService;

/**
 * Set the active Print service
 */
export function setPrintService(service: PrintService): void {
  activePrintService = service;
}

/**
 * Get the active Print service
 */
export function getPrintService(): PrintService {
  return activePrintService;
}

/**
 * Check if a Print service is configured (native host connected)
 */
export function isPrintServiceConfigured(): boolean {
  return activePrintService !== noopPrintService && activePrintService.isAvailable();
}

// ===== Fallback Print Function =====

/**
 * Fallback print function interface (for browser environment)
 * This is called when native host is not available
 */
export type FallbackPrintFunction = () => Promise<PrintResult>;

/**
 * Default fallback that returns an error (for non-browser environments)
 */
const defaultFallbackPrint: FallbackPrintFunction = async () => {
  return {
    success: false,
    error: 'No print fallback available (not in browser context)',
  };
};

/**
 * Active fallback print function
 */
let fallbackPrintFunction: FallbackPrintFunction = defaultFallbackPrint;

/**
 * Set the fallback print function (typically window.print() wrapper)
 */
export function setFallbackPrintFunction(fn: FallbackPrintFunction): void {
  fallbackPrintFunction = fn;
}

/**
 * Get the fallback print function
 */
export function getFallbackPrintFunction(): FallbackPrintFunction {
  return fallbackPrintFunction;
}

// ===== Command Handler =====

/**
 * PRINT command handler
 *
 * Prints the current page. Tries native host first for silent printing,
 * falls back to browser print dialog if native host is not available.
 *
 * Examples:
 *   PRINT
 */
export const printHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  // Get the current URL from state
  const currentUrl = ctx.state.getVariable('!URLCURRENT') as string | undefined;

  ctx.log('info', 'PRINT: Starting print operation');

  // Check if native host is available for silent printing
  if (isPrintServiceConfigured()) {
    ctx.log('debug', 'PRINT: Using native host for silent printing');

    try {
      const result = await activePrintService.print({
        url: currentUrl,
        toPrinter: true,
        waitForNetworkIdle: true,
      });

      if (!result.success) {
        return {
          success: false,
          errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
          errorMessage: result.error || 'PRINT failed',
        };
      }

      ctx.log('info', 'PRINT: Page printed successfully (silent mode)');

      return {
        success: true,
        errorCode: IMACROS_ERROR_CODES.OK,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      ctx.log('error', `PRINT error: ${errorMessage}`);

      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
        errorMessage: `PRINT command failed: ${errorMessage}`,
      };
    }
  }

  // Fallback to browser print dialog
  ctx.log('warn', 'PRINT: Native host not available. Falling back to browser print dialog. For silent printing, install the native host.');

  try {
    const result = await fallbackPrintFunction();

    if (!result.success) {
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
        errorMessage: result.error || 'PRINT fallback failed',
      };
    }

    ctx.log('info', 'PRINT: Browser print dialog triggered');

    return {
      success: true,
      errorCode: IMACROS_ERROR_CODES.OK,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    ctx.log('error', `PRINT fallback error: ${errorMessage}`);

    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: `PRINT command failed: ${errorMessage}`,
    };
  }
};

// ===== Handler Registration =====

/**
 * All PRINT command handlers
 */
export const printHandlers: Partial<Record<CommandType, CommandHandler>> = {
  PRINT: printHandler,
};

/**
 * Register PRINT handlers with an executor
 */
export function registerPrintHandlers(
  registerFn: (type: CommandType, handler: CommandHandler) => void
): void {
  for (const [type, handler] of Object.entries(printHandlers)) {
    if (handler) {
      registerFn(type as CommandType, handler);
    }
  }
}
