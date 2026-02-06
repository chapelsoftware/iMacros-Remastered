/**
 * Browser Command Handlers for iMacros
 *
 * Implements handlers for browser-related commands:
 * - CLEAR (cookies, cache, history, sessions)
 * - FILTER TYPE=IMAGES/FLASH/POPUPS (content blocking)
 * - PROXY ADDRESS=host:port (proxy configuration)
 * - SCREENSHOT TYPE=BROWSER/PAGE (capture visible area or full page)
 *
 * These handlers communicate with the browser extension via browser APIs.
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
export type BrowserCommandMessageType =
  | 'clearData'
  | 'setFilter'
  | 'setProxy'
  | 'screenshot';

/**
 * Base message for browser operations
 */
export interface BrowserCommandMessage {
  type: BrowserCommandMessageType;
  id: string;
  timestamp: number;
}

// ===== CLEAR Command Types =====

/**
 * Data types that can be cleared
 */
export type ClearDataType =
  | 'cookies'
  | 'cache'
  | 'history'
  | 'formData'
  | 'passwords'
  | 'downloads'
  | 'localStorage'
  | 'sessionStorage'
  | 'indexedDB'
  | 'all';

/**
 * Clear browser data message
 */
export interface ClearDataMessage extends BrowserCommandMessage {
  type: 'clearData';
  /** Data types to clear */
  dataTypes: ClearDataType[];
  /** Time range in milliseconds (0 = all time) */
  since?: number;
  /** Optional origin to clear data for (specific site) */
  origin?: string;
}

// ===== FILTER Command Types =====

/**
 * Content filter types
 */
export type FilterType =
  | 'IMAGES'
  | 'FLASH'
  | 'POPUPS'
  | 'NONE';

/**
 * Filter status
 */
export type FilterStatus = 'ON' | 'OFF';

/**
 * Set content filter message
 */
export interface SetFilterMessage extends BrowserCommandMessage {
  type: 'setFilter';
  /** Type of content to filter */
  filterType: FilterType;
  /** Whether to enable or disable the filter */
  status: FilterStatus;
}

// ===== PROXY Command Types =====

/**
 * Proxy configuration types
 */
export type ProxyType =
  | 'direct'    // No proxy
  | 'http'      // HTTP proxy
  | 'https'     // HTTPS proxy
  | 'socks4'    // SOCKS4 proxy
  | 'socks5'    // SOCKS5 proxy
  | 'system';   // Use system proxy settings

/**
 * Set proxy configuration message
 */
export interface SetProxyMessage extends BrowserCommandMessage {
  type: 'setProxy';
  /** Proxy configuration type */
  proxyType: ProxyType;
  /** Proxy address (host:port) */
  address?: string;
  /** Host portion */
  host?: string;
  /** Port number */
  port?: number;
  /** Username for proxy authentication */
  username?: string;
  /** Password for proxy authentication */
  password?: string;
  /** List of hosts to bypass proxy for */
  bypass?: string[];
}

// ===== SCREENSHOT Command Types =====

/**
 * Screenshot capture types
 */
export type ScreenshotType =
  | 'BROWSER'   // Visible viewport only
  | 'PAGE';     // Full scrollable page

/**
 * Screenshot format
 */
export type ScreenshotFormat = 'png' | 'jpeg';

/**
 * Screenshot capture message
 */
export interface ScreenshotMessage extends BrowserCommandMessage {
  type: 'screenshot';
  /** Capture type */
  captureType: ScreenshotType;
  /** Output format */
  format: ScreenshotFormat;
  /** JPEG quality (0-100), only for jpeg format */
  quality?: number;
  /** Output folder path */
  folder?: string;
  /** Output filename */
  file: string;
  /** Optional element selector to capture */
  selector?: string;
}

// ===== Union Types =====

/**
 * Union type for all browser command messages
 */
export type BrowserCommandOperationMessage =
  | ClearDataMessage
  | SetFilterMessage
  | SetProxyMessage
  | ScreenshotMessage;

/**
 * Response from browser command operation
 */
export interface BrowserCommandResponse {
  success: boolean;
  error?: string;
  data?: {
    /** For screenshot: base64 data or file path */
    screenshotData?: string;
    screenshotPath?: string;
    /** For clear: items cleared count */
    clearedItems?: number;
    /** For proxy: current proxy config */
    proxyConfig?: {
      type: ProxyType;
      address?: string;
    };
    /** For filter: current filter status */
    filterStatus?: Record<FilterType, FilterStatus>;
  };
}

// ===== Browser Command Bridge Interface =====

/**
 * Interface for sending browser command messages to the extension
 */
export interface BrowserCommandBridge {
  /**
   * Send a browser command message and wait for response
   */
  sendMessage(message: BrowserCommandOperationMessage): Promise<BrowserCommandResponse>;
}

/**
 * Current browser command bridge instance
 */
let currentBrowserCommandBridge: BrowserCommandBridge | null = null;

/**
 * Set the browser command bridge
 */
export function setBrowserCommandBridge(bridge: BrowserCommandBridge): void {
  currentBrowserCommandBridge = bridge;
}

/**
 * Get the current browser command bridge
 */
export function getBrowserCommandBridge(): BrowserCommandBridge | null {
  return currentBrowserCommandBridge;
}

/**
 * Create a unique message ID
 */
function createMessageId(): string {
  return `bc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Message payload types without id and timestamp
 */
type ClearDataPayload = {
  type: 'clearData';
  dataTypes: ClearDataType[];
  since?: number;
  origin?: string;
};

type SetFilterPayload = {
  type: 'setFilter';
  filterType: FilterType;
  status: FilterStatus;
};

type SetProxyPayload = {
  type: 'setProxy';
  proxyType: ProxyType;
  address?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  bypass?: string[];
};

type ScreenshotPayload = {
  type: 'screenshot';
  captureType: ScreenshotType;
  format: ScreenshotFormat;
  quality?: number;
  folder?: string;
  file: string;
  selector?: string;
};

type BrowserCommandPayload =
  | ClearDataPayload
  | SetFilterPayload
  | SetProxyPayload
  | ScreenshotPayload;

/**
 * Send a browser command message and get the response
 */
async function sendBrowserCommandMessage(
  message: BrowserCommandPayload,
  ctx: CommandContext
): Promise<BrowserCommandResponse> {
  const fullMessage = {
    ...message,
    id: createMessageId(),
    timestamp: Date.now(),
  } as BrowserCommandOperationMessage;

  if (!currentBrowserCommandBridge) {
    ctx.log('warn', `No browser command bridge configured for ${message.type} operation`);
    // Return success for testing/development without extension
    return { success: true };
  }

  try {
    return await currentBrowserCommandBridge.sendMessage(fullMessage);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    ctx.log('error', `Browser command operation failed: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

// ===== CLEAR Command Handler =====

/**
 * Parse CLEAR command parameters to determine what to clear
 *
 * iMacros CLEAR syntax:
 * - CLEAR (clears cookies for current domain)
 * - CLEAR COOKIES (clears all cookies)
 * - CLEAR CACHE (clears browser cache)
 * - CLEAR HISTORY (clears browsing history)
 * - CLEAR ALL (clears everything)
 */
function parseClearDataTypes(ctx: CommandContext): ClearDataType[] {
  const params = ctx.command.parameters;

  // No parameters = clear cookies (default)
  if (params.length === 0) {
    return ['cookies'];
  }

  const dataTypes: ClearDataType[] = [];

  for (const param of params) {
    const key = param.key.toUpperCase();
    switch (key) {
      case 'COOKIES':
        dataTypes.push('cookies');
        break;
      case 'CACHE':
        dataTypes.push('cache');
        break;
      case 'HISTORY':
        dataTypes.push('history');
        break;
      case 'FORMDATA':
      case 'FORMS':
        dataTypes.push('formData');
        break;
      case 'PASSWORDS':
        dataTypes.push('passwords');
        break;
      case 'DOWNLOADS':
        dataTypes.push('downloads');
        break;
      case 'LOCALSTORAGE':
        dataTypes.push('localStorage');
        break;
      case 'SESSIONSTORAGE':
        dataTypes.push('sessionStorage');
        break;
      case 'INDEXEDDB':
        dataTypes.push('indexedDB');
        break;
      case 'ALL':
        return ['all'];
      default:
        // Unknown parameter, might be a custom flag
        break;
    }
  }

  // If no recognized parameters, default to cookies
  return dataTypes.length > 0 ? dataTypes : ['cookies'];
}

/**
 * Handler for CLEAR command
 *
 * Syntax:
 * - CLEAR - Clear cookies for current domain
 * - CLEAR COOKIES - Clear all cookies
 * - CLEAR CACHE - Clear browser cache
 * - CLEAR HISTORY - Clear browsing history
 * - CLEAR ALL - Clear everything
 *
 * Uses browser.browsingData API in the extension.
 */
export const clearHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const dataTypes = parseClearDataTypes(ctx);

  ctx.log('info', `Clearing browser data: ${dataTypes.join(', ')}`);

  const response = await sendBrowserCommandMessage(
    {
      type: 'clearData',
      dataTypes,
    },
    ctx
  );

  if (!response.success) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: response.error || 'Failed to clear browser data',
    };
  }

  ctx.log('info', `Cleared browser data: ${dataTypes.join(', ')}`);

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
  };
};

// ===== FILTER Command Handler =====

/**
 * Valid filter types
 */
const VALID_FILTER_TYPES: Set<string> = new Set(['IMAGES', 'FLASH', 'POPUPS', 'NONE']);

/**
 * Handler for FILTER command
 *
 * Syntax:
 * - FILTER TYPE=IMAGES STATUS=ON/OFF - Block/allow images
 * - FILTER TYPE=FLASH STATUS=ON/OFF - Block/allow Flash content
 * - FILTER TYPE=POPUPS STATUS=ON/OFF - Block/allow popups
 * - FILTER TYPE=NONE - Disable all filters
 *
 * Uses browser.webRequest API for blocking, browser.contentSettings for permissions.
 */
export const filterHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const typeParam = ctx.getParam('TYPE');
  const statusParam = ctx.getParam('STATUS');

  // TYPE is required
  if (!typeParam) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'FILTER requires TYPE parameter (IMAGES, FLASH, POPUPS, or NONE)',
    };
  }

  const filterType = typeParam.toUpperCase() as FilterType;

  // Validate filter type
  if (!VALID_FILTER_TYPES.has(filterType)) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
      errorMessage: `Invalid TYPE: ${typeParam}. Valid types are: IMAGES, FLASH, POPUPS, NONE`,
    };
  }

  // For NONE type, disable all filters
  if (filterType === 'NONE') {
    ctx.log('info', 'Disabling all content filters');

    // Send messages to disable each filter type
    const filterTypes: FilterType[] = ['IMAGES', 'FLASH', 'POPUPS'];
    for (const ft of filterTypes) {
      const response = await sendBrowserCommandMessage(
        {
          type: 'setFilter',
          filterType: ft,
          status: 'OFF',
        },
        ctx
      );

      if (!response.success) {
        ctx.log('warn', `Failed to disable ${ft} filter: ${response.error}`);
      }
    }

    return {
      success: true,
      errorCode: IMACROS_ERROR_CODES.OK,
    };
  }

  // STATUS defaults to ON if not specified
  const status: FilterStatus = statusParam?.toUpperCase() === 'OFF' ? 'OFF' : 'ON';

  ctx.log('info', `Setting ${filterType} filter to ${status}`);

  const response = await sendBrowserCommandMessage(
    {
      type: 'setFilter',
      filterType,
      status,
    },
    ctx
  );

  if (!response.success) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: response.error || `Failed to set ${filterType} filter`,
    };
  }

  ctx.log('info', `${filterType} filter set to ${status}`);

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
  };
};

// ===== PROXY Command Handler =====

/**
 * Parse proxy address string into host and port
 */
function parseProxyAddress(address: string): { host: string; port: number } | null {
  // Handle empty address (direct connection)
  if (!address || address === '' || address === 'DIRECT') {
    return null;
  }

  // Parse host:port format
  const match = address.match(/^([^:]+):(\d+)$/);
  if (match) {
    return {
      host: match[1],
      port: parseInt(match[2], 10),
    };
  }

  // Try to parse just as host (default port 8080)
  if (!address.includes(':')) {
    return {
      host: address,
      port: 8080,
    };
  }

  return null;
}

/**
 * Determine proxy type from address or explicit parameter
 */
function determineProxyType(ctx: CommandContext, address: string): ProxyType {
  const typeParam = ctx.getParam('TYPE');

  if (typeParam) {
    const type = typeParam.toUpperCase();
    switch (type) {
      case 'HTTP':
        return 'http';
      case 'HTTPS':
        return 'https';
      case 'SOCKS4':
        return 'socks4';
      case 'SOCKS5':
        return 'socks5';
      case 'DIRECT':
      case 'NONE':
        return 'direct';
      case 'SYSTEM':
        return 'system';
      default:
        return 'http';
    }
  }

  // Default to direct if no address, otherwise http
  if (!address || address === '' || address.toUpperCase() === 'DIRECT') {
    return 'direct';
  }

  return 'http';
}

/**
 * Handler for PROXY command
 *
 * Syntax:
 * - PROXY ADDRESS=host:port - Set HTTP proxy
 * - PROXY ADDRESS=host:port TYPE=SOCKS5 - Set SOCKS5 proxy
 * - PROXY ADDRESS= - Clear proxy (direct connection)
 * - PROXY ADDRESS=DIRECT - Clear proxy (direct connection)
 * - PROXY ADDRESS=host:port BYPASS=localhost,127.0.0.1 - Set proxy with bypass list
 * - PROXY ADDRESS=host:port USER=username PASSWORD=password - Authenticated proxy
 *
 * Uses browser.proxy API in the extension.
 */
export const proxyHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const addressParam = ctx.getParam('ADDRESS');
  const bypassParam = ctx.getParam('BYPASS');
  const userParam = ctx.getParam('USER');
  const passwordParam = ctx.getParam('PASSWORD');

  // ADDRESS is required
  if (addressParam === undefined) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'PROXY requires ADDRESS parameter',
    };
  }

  const address = ctx.expand(addressParam);
  const proxyType = determineProxyType(ctx, address);

  // Parse address
  const parsed = parseProxyAddress(address);

  // Parse bypass list
  const bypass = bypassParam
    ? ctx.expand(bypassParam).split(',').map(h => h.trim())
    : undefined;

  // Get credentials
  const username = userParam ? ctx.expand(userParam) : undefined;
  const password = passwordParam ? ctx.expand(passwordParam) : undefined;

  if (proxyType === 'direct') {
    ctx.log('info', 'Setting direct connection (no proxy)');
  } else {
    ctx.log('info', `Setting ${proxyType} proxy: ${address}`);
  }

  const response = await sendBrowserCommandMessage(
    {
      type: 'setProxy',
      proxyType,
      address: parsed ? address : undefined,
      host: parsed?.host,
      port: parsed?.port,
      username,
      password,
      bypass,
    },
    ctx
  );

  if (!response.success) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: response.error || 'Failed to set proxy',
    };
  }

  if (proxyType === 'direct') {
    ctx.log('info', 'Proxy cleared, using direct connection');
  } else {
    ctx.log('info', `Proxy set to ${proxyType}://${address}`);
  }

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
  };
};

// ===== SCREENSHOT Command Handler =====

/**
 * Determine screenshot format from filename
 */
function getScreenshotFormat(filename: string): ScreenshotFormat {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'jpg' || ext === 'jpeg') {
    return 'jpeg';
  }
  return 'png';
}

/**
 * Handler for SCREENSHOT command
 *
 * Syntax:
 * - SCREENSHOT TYPE=BROWSER FOLDER=<path> FILE=<filename> - Capture visible viewport
 * - SCREENSHOT TYPE=PAGE FOLDER=<path> FILE=<filename> - Capture full page
 * - SCREENSHOT TYPE=BROWSER FILE=screenshot.png - Capture with default folder
 * - SCREENSHOT TYPE=PAGE FILE=fullpage.jpg QUALITY=80 - JPEG with quality setting
 *
 * Uses browser.tabs.captureVisibleTab for BROWSER type.
 * Uses extension scrolling capture for PAGE type.
 */
export const screenshotHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const typeParam = ctx.getParam('TYPE');
  const folderParam = ctx.getParam('FOLDER');
  const fileParam = ctx.getParam('FILE');
  const qualityParam = ctx.getParam('QUALITY');
  const selectorParam = ctx.getParam('SELECTOR');

  // TYPE is required
  if (!typeParam) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'SCREENSHOT requires TYPE parameter (BROWSER or PAGE)',
    };
  }

  const captureType = typeParam.toUpperCase() as ScreenshotType;

  // Validate capture type
  if (captureType !== 'BROWSER' && captureType !== 'PAGE') {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
      errorMessage: `Invalid TYPE: ${typeParam}. Valid types are: BROWSER, PAGE`,
    };
  }

  // FILE is required
  if (!fileParam) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'SCREENSHOT requires FILE parameter',
    };
  }

  // Expand variables
  const folder = folderParam ? ctx.expand(folderParam) : undefined;
  const file = ctx.expand(fileParam);
  const selector = selectorParam ? ctx.expand(selectorParam) : undefined;

  // Determine format from filename
  const format = getScreenshotFormat(file);

  // Parse quality for JPEG
  let quality: number | undefined;
  if (format === 'jpeg') {
    if (qualityParam) {
      quality = parseInt(ctx.expand(qualityParam), 10);
      if (isNaN(quality) || quality < 0 || quality > 100) {
        return {
          success: false,
          errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
          errorMessage: `Invalid QUALITY value: ${qualityParam}. Must be 0-100`,
        };
      }
    } else {
      quality = 92; // Default JPEG quality
    }
  }

  ctx.log('info', `Taking ${captureType.toLowerCase()} screenshot: ${folder ? folder + '/' : ''}${file}`);

  const response = await sendBrowserCommandMessage(
    {
      type: 'screenshot',
      captureType,
      format,
      quality,
      folder,
      file,
      selector,
    },
    ctx
  );

  if (!response.success) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.FILE_WRITE_ERROR,
      errorMessage: response.error || `Failed to capture ${captureType.toLowerCase()} screenshot`,
    };
  }

  const savedPath = response.data?.screenshotPath || file;
  ctx.log('info', `Screenshot saved: ${savedPath}`);

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
    output: savedPath,
  };
};

// ===== Handler Registration =====

/**
 * All browser command handlers
 */
export const browserCommandHandlers = {
  CLEAR: clearHandler,
  FILTER: filterHandler,
  PROXY: proxyHandler,
  SCREENSHOT: screenshotHandler,
} as const;

/**
 * Register all browser command handlers with the executor
 */
export function registerBrowserCommandHandlers(executor: {
  registerHandler: (type: string, handler: CommandHandler) => void;
}): void {
  for (const [type, handler] of Object.entries(browserCommandHandlers)) {
    executor.registerHandler(type, handler);
  }
}

/**
 * Create browser command handlers map for direct use
 */
export function createBrowserCommandHandlers(): Record<string, CommandHandler> {
  return { ...browserCommandHandlers };
}
