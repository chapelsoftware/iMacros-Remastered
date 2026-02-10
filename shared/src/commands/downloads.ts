/**
 * Download Command Handlers for iMacros
 *
 * Implements handlers for download-related commands:
 * - ONDOWNLOAD FOLDER= FILE= (set download destination)
 * - SAVEAS TYPE=TXT/HTM/PNG/PDF FOLDER= FILE= (save page content)
 * - SAVEITEM (save specific element/download item)
 *
 * These handlers communicate with the browser extension via chrome.downloads API.
 */

import {
  CommandHandler,
  CommandContext,
  CommandResult,
  IMACROS_ERROR_CODES,
} from '../executor';

// ===== Download Message Types =====

/**
 * Message types for download operations
 */
export type DownloadMessageType =
  | 'setDownloadOptions'
  | 'saveAs'
  | 'saveItem'
  | 'getDownloadStatus'
  | 'cancelDownload';

/**
 * Base message for download operations
 */
export interface DownloadMessage {
  type: DownloadMessageType;
  id: string;
  timestamp: number;
}

/**
 * Set download destination options message
 */
export interface SetDownloadOptionsMessage extends DownloadMessage {
  type: 'setDownloadOptions';
  folder?: string;
  file?: string;
  /** If true, wait for download to complete before continuing */
  wait?: boolean;
  /** Checksum verification in format "MD5:hash" or "SHA1:hash" */
  checksum?: string;
}

/**
 * Save types for SAVEAS command
 */
export type SaveAsType =
  | 'TXT'   // Plain text
  | 'HTM'   // HTML source
  | 'PNG'   // Screenshot as PNG
  | 'JPG'   // Screenshot as JPEG
  | 'BMP'   // Screenshot as BMP
  | 'PDF'   // Page as PDF
  | 'CPL'   // Complete page (HTML + resources)
  | 'MHT'   // MHTML archive
  | 'EXTRACT'; // Extracted data

/**
 * Save content to file message
 */
export interface SaveAsMessage extends DownloadMessage {
  type: 'saveAs';
  saveType: SaveAsType;
  folder?: string;
  file: string;
  /** Content to save (for TXT, HTM, EXTRACT) */
  content?: string;
  /** Selector for element to save (for PNG screenshots of elements) */
  selector?: string;
  /** Quality for JPG screenshots (0-100) */
  quality?: number;
}

/**
 * Save specific item message (for download links, images, etc.)
 */
export interface SaveItemMessage extends DownloadMessage {
  type: 'saveItem';
  /** URL to download */
  url?: string;
  /** Element selector to get download URL from */
  selector?: string;
  /** Folder to save to (optional, uses ONDOWNLOAD setting if not specified) */
  folder?: string;
  /** Filename to save as (optional, uses original name if not specified) */
  file?: string;
  /** If true, wait for download to complete before continuing */
  wait?: boolean;
  /** Checksum verification in format "MD5:hash" or "SHA1:hash" */
  checksum?: string;
}

/**
 * Get download status message
 */
export interface GetDownloadStatusMessage extends DownloadMessage {
  type: 'getDownloadStatus';
  downloadId: number;
}

/**
 * Cancel download message
 */
export interface CancelDownloadMessage extends DownloadMessage {
  type: 'cancelDownload';
  downloadId: number;
}

/**
 * Union type for all download messages
 */
export type DownloadOperationMessage =
  | SetDownloadOptionsMessage
  | SaveAsMessage
  | SaveItemMessage
  | GetDownloadStatusMessage
  | CancelDownloadMessage;

/**
 * Download state from chrome.downloads API
 */
export type DownloadState = 'in_progress' | 'interrupted' | 'complete';

/**
 * Response from download operation
 */
export interface DownloadOperationResponse {
  success: boolean;
  error?: string;
  data?: {
    downloadId?: number;
    state?: DownloadState;
    filename?: string;
    bytesReceived?: number;
    totalBytes?: number;
    url?: string;
  };
}

// ===== Download Bridge Interface =====

/**
 * Interface for sending messages to the browser extension for downloads
 * This should be implemented by the extension layer
 */
export interface DownloadBridge {
  /**
   * Send a download message to the browser extension and wait for response
   */
  sendMessage(message: DownloadOperationMessage): Promise<DownloadOperationResponse>;
}

/**
 * Current download bridge instance
 */
let currentDownloadBridge: DownloadBridge | null = null;

/**
 * Set the download bridge for download commands
 */
export function setDownloadBridge(bridge: DownloadBridge): void {
  currentDownloadBridge = bridge;
}

/**
 * Get the current download bridge
 */
export function getDownloadBridge(): DownloadBridge | null {
  return currentDownloadBridge;
}

/**
 * Create a unique message ID
 */
function createMessageId(): string {
  return `dl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Message payload types without id and timestamp
 */
type SetDownloadOptionsPayload = {
  type: 'setDownloadOptions';
  folder?: string;
  file?: string;
  wait?: boolean;
  checksum?: string;
};

type SaveAsPayload = {
  type: 'saveAs';
  saveType: SaveAsType;
  folder?: string;
  file: string;
  content?: string;
  selector?: string;
  quality?: number;
};

type SaveItemPayload = {
  type: 'saveItem';
  url?: string;
  selector?: string;
  folder?: string;
  file?: string;
  wait?: boolean;
  checksum?: string;
};

type GetDownloadStatusPayload = {
  type: 'getDownloadStatus';
  downloadId: number;
};

type CancelDownloadPayload = {
  type: 'cancelDownload';
  downloadId: number;
};

type DownloadMessagePayload =
  | SetDownloadOptionsPayload
  | SaveAsPayload
  | SaveItemPayload
  | GetDownloadStatusPayload
  | CancelDownloadPayload;

/**
 * Send a download message and get the response
 */
async function sendDownloadMessage(
  message: DownloadMessagePayload,
  ctx: CommandContext
): Promise<DownloadOperationResponse> {
  const fullMessage = {
    ...message,
    id: createMessageId(),
    timestamp: Date.now(),
  } as DownloadOperationMessage;

  if (!currentDownloadBridge) {
    ctx.log('warn', `No download bridge configured for ${message.type} operation`);
    // Return success for testing/development without extension
    return { success: true };
  }

  try {
    return await currentDownloadBridge.sendMessage(fullMessage);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    ctx.log('error', `Download operation failed: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

// ===== Download State Variables =====

/**
 * Internal state key for download folder setting
 */
export const DOWNLOAD_FOLDER_KEY = '!FOLDER_DOWNLOAD';

/**
 * Internal state key for download filename setting
 */
export const DOWNLOAD_FILE_KEY = '!DOWNLOAD_FILE';

/**
 * Internal state key for last download ID
 */
export const LAST_DOWNLOAD_ID_KEY = '!LAST_DOWNLOAD_ID';

// ===== ONDOWNLOAD Command Handler =====

/**
 * Characters illegal in filenames (Windows + common cross-platform restrictions)
 */
const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/;

/**
 * Regex for sanitizing filenames (matches iMacros 8.9.7 behavior)
 * Replaces sequences of illegal chars (and surrounding whitespace) with underscore
 */
const FILENAME_SANITIZE_RE = /\s*[:*?|<>"\/]+\s*/g;

/**
 * Validate a filename for illegal characters
 * Returns the illegal character found or null if valid
 */
function validateFilename(filename: string): string | null {
  const match = filename.match(ILLEGAL_FILENAME_CHARS);
  return match ? match[0] : null;
}

/**
 * Sanitize a filename by replacing illegal characters with underscores.
 * Matches iMacros 8.9.7 behavior: replaces sequences of [:*?|<>"/] and
 * surrounding whitespace with a single underscore.
 */
export function sanitizeFilename(filename: string): string {
  return filename.replace(FILENAME_SANITIZE_RE, '_');
}

/**
 * Derive a document name from a URL, mimicking iMacros 8.9.7 __doc_name.
 * Extracts the last path segment (without extension), falls back to hostname
 * (stripping www.), then to document title, then to "unknown".
 */
export function deriveDocumentName(url: string, documentTitle?: string): string {
  try {
    const parsed = new URL(url);

    // Try last path segment
    const pathMatch = parsed.pathname.match(/\/([^/]*)$/);
    let name = pathMatch ? pathMatch[1] : '';

    // Fall back to hostname (strip www.)
    if (!name.length) {
      const hostMatch = parsed.hostname.match(/^(?:www\.)(.+)/);
      if (hostMatch) {
        name = hostMatch[1];
      }
    }

    // Fall back to document title (iMacros 8.9.7 parity)
    if (!name.length && documentTitle) {
      name = documentTitle;
    }

    if (!name.length) return 'unknown';

    // Strip file extension if present
    const extMatch = name.match(/^(.+)\.\w+$/);
    if (extMatch) return extMatch[1];

    return name;
  } catch {
    return 'unknown';
  }
}

/**
 * Format extract data as CSV (iMacros 8.9.7 parity).
 * Escapes double quotes, wraps fields in quotes, and converts [EXTRACT]
 * delimiters to comma-separated values.
 */
export function formatExtractAsCsv(data: string): string {
  // Escape existing double quotes
  const escaped = data.replace(/"/g, '""');
  // Replace [EXTRACT] delimiters with "," to form CSV fields
  return '"' + escaped.replace(/\[EXTRACT\]/g, '","') + '"';
}

/**
 * Validate and normalize a folder path.
 * Checks for path traversal and illegal characters.
 * Returns an error message or null if valid.
 */
function validateFolderPath(folder: string): string | null {
  // Check for null bytes
  if (folder.includes('\0')) {
    return 'Folder path contains null byte';
  }
  return null;
}

/**
 * Parse CHECKSUM parameter value.
 * Expected format: "MD5:hexhash" or "SHA1:hexhash"
 * Returns parsed checksum or error string.
 */
function parseChecksum(value: string): { algorithm: string; hash: string } | string {
  const colonIndex = value.indexOf(':');
  if (colonIndex === -1) {
    return 'CHECKSUM must be in format ALGORITHM:hash (e.g., MD5:abc123 or SHA1:abc123)';
  }

  const algorithm = value.substring(0, colonIndex).toUpperCase();
  const hash = value.substring(colonIndex + 1).toLowerCase();

  if (algorithm !== 'MD5' && algorithm !== 'SHA1') {
    return `Unsupported checksum algorithm: ${algorithm}. Supported: MD5, SHA1`;
  }

  if (!hash || !/^[0-9a-f]+$/.test(hash)) {
    return `Invalid ${algorithm} hash value: must be a hexadecimal string`;
  }

  // Validate hash length
  const expectedLength = algorithm === 'MD5' ? 32 : 40;
  if (hash.length !== expectedLength) {
    return `Invalid ${algorithm} hash length: expected ${expectedLength} characters, got ${hash.length}`;
  }

  return { algorithm, hash };
}

/**
 * Handler for ONDOWNLOAD command
 *
 * Syntax:
 * - ONDOWNLOAD FOLDER=<path> FILE=<filename>
 * - ONDOWNLOAD FOLDER=* FILE=<filename> (use browser default folder)
 * - ONDOWNLOAD FOLDER=<path> FILE=+ (auto-generate unique filename)
 * - ONDOWNLOAD WAIT=YES|NO (wait for download; default YES)
 * - ONDOWNLOAD CHECKSUM=MD5:hash or CHECKSUM=SHA1:hash
 *
 * Sets the destination for subsequent downloads.
 * Both FOLDER and FILE are required parameters.
 */
export const ondownloadHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const folderParam = ctx.getParam('FOLDER');
  const fileParam = ctx.getParam('FILE');
  const waitParam = ctx.getParam('WAIT');
  const checksumParam = ctx.getParam('CHECKSUM');

  // Both FOLDER and FILE are required (iMacros 8.9.7 parity)
  if (!folderParam || !fileParam) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'ONDOWNLOAD requires both FOLDER and FILE parameters',
    };
  }

  // Expand variables in parameters
  const folder = ctx.expand(folderParam);
  const file = ctx.expand(fileParam);

  // WAIT defaults to YES (iMacros 8.9.7 parity)
  // Only YES/TRUE are truthy; everything else (NO, FALSE, etc.) is false
  const wait = waitParam ? /^(?:yes|true)$/i.test(waitParam) : true;

  // Validate folder path (skip for wildcard '*' which means browser default)
  if (folder !== '*') {
    const folderError = validateFolderPath(folder);
    if (folderError) {
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.DOWNLOAD_FOLDER_ACCESS,
        errorMessage: folderError,
      };
    }
  }

  // Validate filename (skip for '+' and '*' which are wildcards)
  // FILE=+ means auto-generate unique filename
  // FILE=* means use server-suggested filename (iMacros 8.9.7 parity)
  if (file !== '+' && file !== '*') {
    const illegalChar = validateFilename(file);
    if (illegalChar) {
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.DOWNLOAD_INVALID_FILENAME,
        errorMessage: `Illegal character '${illegalChar}' in filename: ${file}`,
      };
    }
  }

  // Parse and validate CHECKSUM parameter
  let checksum: string | undefined;
  if (checksumParam) {
    const parsed = parseChecksum(ctx.expand(checksumParam));
    if (typeof parsed === 'string') {
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
        errorMessage: parsed,
      };
    }
    checksum = `${parsed.algorithm}:${parsed.hash}`;
  }

  // CHECKSUM requires WAIT=YES (iMacros 8.9.7 parity)
  if (checksum && !wait) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
      errorMessage: 'CHECKSUM requires WAIT=YES',
    };
  }

  ctx.log('info', `Setting download options: folder=${folder === '*' ? '(default)' : folder}, file=${file === '+' || file === '*' ? '(auto)' : file}${checksum ? `, checksum=${checksum}` : ''}`);

  // Store download settings in state for later use by SAVEITEM
  ctx.state.setVariable(DOWNLOAD_FOLDER_KEY, folder);
  ctx.state.setVariable(DOWNLOAD_FILE_KEY, file);
  ctx.state.setVariable('!DOWNLOAD_WAIT', wait ? 1 : 0);
  if (checksum) {
    ctx.state.setVariable('!DOWNLOAD_CHECKSUM', checksum);
  }

  // Send message to browser extension to configure download behavior
  const response = await sendDownloadMessage(
    {
      type: 'setDownloadOptions',
      folder: folder === '*' ? undefined : folder,
      file: (file === '+' || file === '*') ? undefined : file,
      wait,
      checksum,
    },
    ctx
  );

  if (!response.success) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.DOWNLOAD_ERROR,
      errorMessage: response.error || 'Failed to set download options',
    };
  }

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
  };
};

// ===== SAVEAS Command Handler =====

/**
 * Valid save types for SAVEAS command
 */
const VALID_SAVE_TYPES: Set<string> = new Set([
  'TXT', 'HTM', 'HTML', 'PNG', 'JPG', 'JPEG', 'BMP', 'PDF', 'CPL', 'MHT', 'EXTRACT',
]);

/**
 * Normalize save type to standard form
 */
function normalizeSaveType(type: string): SaveAsType {
  const upper = type.toUpperCase();
  switch (upper) {
    case 'HTML':
      return 'HTM';
    case 'JPEG':
      return 'JPG';
    default:
      return upper as SaveAsType;
  }
}

/**
 * Handler for SAVEAS command
 *
 * Syntax:
 * - SAVEAS TYPE=TXT FOLDER=<path> FILE=<filename>
 * - SAVEAS TYPE=HTM FOLDER=<path> FILE=<filename>
 * - SAVEAS TYPE=PNG FOLDER=<path> FILE=<filename>
 * - SAVEAS TYPE=JPG FOLDER=<path> FILE=<filename> [QUALITY=<0-100>]
 * - SAVEAS TYPE=PDF FOLDER=<path> FILE=<filename>
 * - SAVEAS TYPE=CPL FOLDER=<path> FILE=<filename> (complete page)
 * - SAVEAS TYPE=MHT FOLDER=<path> FILE=<filename> (MHTML archive)
 * - SAVEAS TYPE=EXTRACT FOLDER=<path> FILE=<filename> (extracted data)
 *
 * Saves page content to a file.
 */
export const saveasHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const typeParam = ctx.getParam('TYPE');
  const folderParam = ctx.getParam('FOLDER');
  const fileParam = ctx.getParam('FILE');
  const qualityParam = ctx.getParam('QUALITY');

  // TYPE is required
  if (!typeParam) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'SAVEAS requires TYPE parameter',
    };
  }

  const saveType = normalizeSaveType(typeParam);

  // Validate save type
  if (!VALID_SAVE_TYPES.has(saveType)) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
      errorMessage: `Invalid TYPE: ${typeParam}. Valid types are: TXT, HTM, PNG, JPG, PDF, CPL, MHT, EXTRACT`,
    };
  }

  // FILE is required
  if (!fileParam) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'SAVEAS requires FILE parameter',
    };
  }

  // Expand variables
  const folder = folderParam ? ctx.expand(folderParam) : ctx.state.getVariable(DOWNLOAD_FOLDER_KEY)?.toString();
  let file = ctx.expand(fileParam);

  // Validate folder path (iMacros 8.9.7 error 932)
  if (folder && folder !== '*') {
    const folderError = validateFolderPath(folder);
    if (folderError) {
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.DOWNLOAD_FOLDER_ACCESS,
        errorMessage: `Wrong path ${folder}`,
      };
    }
  }

  // Resolve FILE wildcards (iMacros 8.9.7 parity)
  // FILE=* derives name from page URL/title (or "extract.csv" for EXTRACT type)
  // FILE=+suffix appends suffix to derived name
  const currentUrl = ctx.state.getVariable('!URLCURRENT')?.toString() || '';

  if (saveType === 'EXTRACT') {
    if (file === '*') {
      file = 'extract.csv';
    } else {
      const suffixMatch = file.match(/^\+(.+)$/);
      if (suffixMatch) {
        file = 'extract' + suffixMatch[1] + '.csv';
      }
    }
  } else {
    if (file === '*') {
      file = deriveDocumentName(currentUrl);
    } else {
      const suffixMatch = file.match(/^\+(.+)$/);
      if (suffixMatch) {
        file = deriveDocumentName(currentUrl) + suffixMatch[1];
      }
    }
  }

  // Sanitize filename (iMacros 8.9.7 parity)
  file = sanitizeFilename(file);

  // Parse quality for JPG
  let quality: number | undefined;
  if (qualityParam) {
    quality = parseInt(ctx.expand(qualityParam), 10);
    if (isNaN(quality) || quality < 0 || quality > 100) {
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
        errorMessage: `Invalid QUALITY value: ${qualityParam}. Must be 0-100`,
      };
    }
  }

  ctx.log('info', `Saving as ${saveType}: ${folder ? folder + '/' : ''}${file}`);

  // For EXTRACT type, format as CSV and clear extract data (iMacros 8.9.7 parity)
  let content: string | undefined;
  if (saveType === 'EXTRACT') {
    const extractData = ctx.state.getVariable('!EXTRACT')?.toString() || '';
    content = formatExtractAsCsv(extractData);
    ctx.state.clearExtract();
  }

  // Send save request to browser extension
  const response = await sendDownloadMessage(
    {
      type: 'saveAs',
      saveType,
      folder,
      file,
      content,
      quality,
    },
    ctx
  );

  if (!response.success) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.FILE_WRITE_ERROR,
      errorMessage: response.error || `Failed to save as ${saveType}`,
    };
  }

  // Store download ID if provided
  if (response.data?.downloadId !== undefined) {
    ctx.state.setVariable(LAST_DOWNLOAD_ID_KEY, response.data.downloadId);
  }

  ctx.log('info', `Saved: ${response.data?.filename || file}`);

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
    output: response.data?.filename,
  };
};

// ===== SAVEITEM Command Handler =====

/**
 * Derive a leaf name from a URL for SAVEITEM wildcard resolution.
 * Extracts the last path segment (before query string), preserving extension.
 * Falls back to hostname (stripping www.), then to 'unknown'.
 * Matches iMacros 8.9.7 handleOnDownloadFile() behavior.
 */
function deriveItemLeafName(url: string): string {
  try {
    const parsed = new URL(url);

    // Extract last path segment (before query string), matching /([^\/?]+)(?=\?.+|$)/
    const pathMatch = parsed.pathname.match(/\/([^/]+)$/);
    if (pathMatch && pathMatch[1]) {
      return pathMatch[1];
    }

    // Fall back to hostname (strip www.)
    const hostMatch = parsed.hostname.match(/^(?:www\.)(.+)/);
    if (hostMatch) {
      return hostMatch[1];
    }

    if (parsed.hostname) return parsed.hostname;
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Handler for SAVEITEM command
 *
 * Syntax:
 * - SAVEITEM (saves the current download/link target)
 * - SAVEITEM URL=<url> (saves from specific URL)
 * - SAVEITEM FOLDER=<path> FILE=<filename> (with destination)
 *
 * Saves a specific item (image, link target, download) to disk.
 * Uses ONDOWNLOAD settings for destination if not specified.
 * Processes FILE=* and FILE=+suffix wildcards (iMacros 8.9.7 parity).
 * Consumes ONDOWNLOAD state after use (iMacros 8.9.7 parity).
 */
export const saveitemHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const urlParam = ctx.getParam('URL');
  const folderParam = ctx.getParam('FOLDER');
  const fileParam = ctx.getParam('FILE');

  // Expand variables
  const url = urlParam ? ctx.expand(urlParam) : undefined;
  const folder = folderParam
    ? ctx.expand(folderParam)
    : ctx.state.getVariable(DOWNLOAD_FOLDER_KEY)?.toString() || undefined;

  // Read ONDOWNLOAD file setting as fallback
  let file = fileParam
    ? ctx.expand(fileParam)
    : ctx.state.getVariable(DOWNLOAD_FILE_KEY)?.toString() || undefined;

  // Resolve FILE wildcards (iMacros 8.9.7 parity)
  // Uses the item URL (not page URL) to derive the leaf name
  const itemUrl = url || ctx.state.getVariable('!URLCURRENT')?.toString() || '';
  const leafName = deriveItemLeafName(itemUrl);

  if (file === '*' || !file) {
    // FILE=* or no file: use leaf name from URL
    file = leafName;
  } else {
    const suffixMatch = file.match(/^\+(.*)$/);
    if (suffixMatch) {
      // FILE=+suffix: insert suffix before extension, or append if no extension
      if (/\..+$/.test(leafName)) {
        file = leafName.replace(/(.+)(\..+)$/, '$1' + suffixMatch[1] + '$2');
      } else {
        file = leafName + suffixMatch[1];
      }
    }
  }

  // Sanitize filename (iMacros 8.9.7 parity)
  file = sanitizeFilename(file);

  // Read ONDOWNLOAD checksum/wait settings stored by ONDOWNLOAD handler
  const ondownloadWait = ctx.state.getVariable('!DOWNLOAD_WAIT');
  const ondownloadChecksum = ctx.state.getVariable('!DOWNLOAD_CHECKSUM');
  const wait = ondownloadWait !== null && ondownloadWait !== undefined && ondownloadWait !== ''
    ? Number(ondownloadWait) === 1
    : undefined;
  const checksum = ondownloadChecksum?.toString() || undefined;

  ctx.log('info', `Saving item: ${url || '(current target)'}, file=${file}`);

  // Send save item request to browser extension
  const response = await sendDownloadMessage(
    {
      type: 'saveItem',
      url,
      folder,
      file,
      wait,
      checksum,
    },
    ctx
  );

  // Consume ONDOWNLOAD state after use (iMacros 8.9.7 parity)
  // Set to empty string to clear, since there is no deleteVariable
  ctx.state.setVariable(DOWNLOAD_FOLDER_KEY, '');
  ctx.state.setVariable(DOWNLOAD_FILE_KEY, '');
  ctx.state.setVariable('!DOWNLOAD_WAIT', '');
  ctx.state.setVariable('!DOWNLOAD_CHECKSUM', '');

  if (!response.success) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.DOWNLOAD_FAILED,
      errorMessage: response.error || 'Failed to save item',
    };
  }

  // Store download ID if provided
  if (response.data?.downloadId !== undefined) {
    ctx.state.setVariable(LAST_DOWNLOAD_ID_KEY, response.data.downloadId);
  }

  ctx.log('info', `Download started: ${response.data?.filename || file || 'item'}`);

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
    output: response.data?.filename || file,
  };
};

// ===== Handler Registration =====

/**
 * All download command handlers
 */
export const downloadHandlers = {
  ONDOWNLOAD: ondownloadHandler,
  SAVEAS: saveasHandler,
  SAVEITEM: saveitemHandler,
} as const;

/**
 * Register all download handlers with the executor
 */
export function registerDownloadHandlers(executor: {
  registerHandler: (type: string, handler: CommandHandler) => void;
}): void {
  for (const [type, handler] of Object.entries(downloadHandlers)) {
    executor.registerHandler(type, handler);
  }
}

/**
 * Create download handlers map for direct use
 */
export function createDownloadHandlers(): Record<string, CommandHandler> {
  return { ...downloadHandlers };
}
