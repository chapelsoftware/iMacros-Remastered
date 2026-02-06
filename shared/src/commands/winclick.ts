/**
 * WINCLICK Command Handler for iMacros
 *
 * Performs OS-level mouse clicks at absolute screen coordinates.
 * Unlike the browser CLICK command which operates within the page viewport,
 * WINCLICK works at the desktop level and can click outside the browser window.
 *
 * Syntax:
 *   WINCLICK X=<x> Y=<y> [BUTTON=LEFT|RIGHT|MIDDLE]
 *
 * Parameters:
 *   - X: Absolute screen X coordinate (required)
 *   - Y: Absolute screen Y coordinate (required)
 *   - BUTTON: Mouse button to click (optional, defaults to LEFT)
 *     - LEFT: Left mouse button
 *     - RIGHT: Right mouse button
 *     - MIDDLE: Middle mouse button (scroll wheel)
 *
 * Examples:
 *   WINCLICK X=100 Y=200
 *   WINCLICK X=500 Y=300 BUTTON=RIGHT
 *   WINCLICK X=250 Y=150 BUTTON=MIDDLE
 *
 * Notes:
 *   - Coordinates are absolute screen coordinates, not relative to browser
 *   - This command requires the native host to be installed and running
 *   - Works cross-platform (Windows, macOS, Linux) via nut.js
 */

import {
  CommandHandler,
  CommandContext,
  CommandResult,
  IMACROS_ERROR_CODES,
} from '../executor';
import type { CommandType } from '../parser';

// ===== WinClick Service Interface =====

/**
 * Options for WinClick operations
 */
export interface WinClickOptions {
  /** X coordinate (absolute screen position) */
  x: number;
  /** Y coordinate (absolute screen position) */
  y: number;
  /** Mouse button to click */
  button?: 'left' | 'right' | 'middle';
}

/**
 * Result of WinClick operations
 */
export interface WinClickResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Final position after click */
  position?: { x: number; y: number };
}

/**
 * Interface for WinClick service
 * This should be implemented by the native host
 */
export interface WinClickService {
  /**
   * Perform a click at the specified screen coordinates
   */
  click(options: WinClickOptions): Promise<WinClickResult>;
}

/**
 * Default no-op service (returns error when not configured)
 */
const noopWinClickService: WinClickService = {
  async click(_options: WinClickOptions): Promise<WinClickResult> {
    return {
      success: false,
      error: 'WINCLICK requires the native host to be installed and running',
    };
  },
};

/**
 * Active WinClick service (set by native host)
 */
let activeWinClickService: WinClickService = noopWinClickService;

/**
 * Set the active WinClick service
 */
export function setWinClickService(service: WinClickService): void {
  activeWinClickService = service;
}

/**
 * Get the active WinClick service
 */
export function getWinClickService(): WinClickService {
  return activeWinClickService;
}

/**
 * Check if a WinClick service is configured
 */
export function isWinClickServiceConfigured(): boolean {
  return activeWinClickService !== noopWinClickService;
}

// ===== Command Handler =====

/**
 * WINCLICK command handler
 *
 * WINCLICK X=100 Y=200
 * WINCLICK X=500 Y=300 BUTTON=RIGHT
 * WINCLICK X=250 Y=150 BUTTON=MIDDLE
 */
export const winClickHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  // Get X coordinate (required)
  const xStr = ctx.getParam('X');
  if (!xStr) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'WINCLICK command requires X parameter',
    };
  }

  // Get Y coordinate (required)
  const yStr = ctx.getParam('Y');
  if (!yStr) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'WINCLICK command requires Y parameter',
    };
  }

  // Parse coordinates
  const x = parseInt(ctx.expand(xStr), 10);
  const y = parseInt(ctx.expand(yStr), 10);

  if (isNaN(x)) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
      errorMessage: `Invalid X coordinate: ${xStr}`,
    };
  }

  if (isNaN(y)) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
      errorMessage: `Invalid Y coordinate: ${yStr}`,
    };
  }

  // Validate coordinates are non-negative
  if (x < 0) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
      errorMessage: `X coordinate must be non-negative: ${x}`,
    };
  }

  if (y < 0) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
      errorMessage: `Y coordinate must be non-negative: ${y}`,
    };
  }

  // Get button (optional, defaults to LEFT)
  let button: 'left' | 'right' | 'middle' = 'left';
  const buttonStr = ctx.getParam('BUTTON');
  if (buttonStr) {
    const buttonUpper = ctx.expand(buttonStr).toUpperCase();
    switch (buttonUpper) {
      case 'LEFT':
        button = 'left';
        break;
      case 'RIGHT':
        button = 'right';
        break;
      case 'MIDDLE':
      case 'CENTER':
        button = 'middle';
        break;
      default:
        return {
          success: false,
          errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
          errorMessage: `Invalid BUTTON value: ${buttonStr}. Valid values: LEFT, RIGHT, MIDDLE`,
        };
    }
  }

  ctx.log('info', `WINCLICK: X=${x}, Y=${y}, button=${button}`);

  try {
    const result = await activeWinClickService.click({ x, y, button });

    if (!result.success) {
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
        errorMessage: result.error || 'WINCLICK failed',
      };
    }

    ctx.log('debug', `WINCLICK successful at (${x}, ${y})`);

    return {
      success: true,
      errorCode: IMACROS_ERROR_CODES.OK,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    ctx.log('error', `WINCLICK error: ${errorMessage}`);

    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: `WINCLICK command failed: ${errorMessage}`,
    };
  }
};

// ===== Handler Registration =====

/**
 * All WINCLICK command handlers
 */
export const winClickHandlers: Partial<Record<CommandType, CommandHandler>> = {
  WINCLICK: winClickHandler,
};

/**
 * Register WINCLICK handlers with an executor
 */
export function registerWinClickHandlers(
  registerFn: (type: CommandType, handler: CommandHandler) => void
): void {
  for (const [type, handler] of Object.entries(winClickHandlers)) {
    if (handler) {
      registerFn(type as CommandType, handler);
    }
  }
}
