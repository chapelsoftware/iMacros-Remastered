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
 * Handler for ONDOWNLOAD command
 *
 * Syntax:
 * - ONDOWNLOAD FOLDER=<path> FILE=<filename>
 * - ONDOWNLOAD FOLDER=* (use browser default folder)
 * - ONDOWNLOAD FILE=+ (auto-generate unique filename)
 * - ONDOWNLOAD WAIT=YES (wait for download to complete)
 *
 * Sets the destination for subsequent downloads.
 */
export const ondownloadHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const folderParam = ctx.getParam('FOLDER');
  const fileParam = ctx.getParam('FILE');
  const waitParam = ctx.getParam('WAIT');

  // At least one of FOLDER or FILE should be specified
  if (!folderParam && !fileParam) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'ONDOWNLOAD requires FOLDER and/or FILE parameter',
    };
  }

  // Expand variables in parameters
  const folder = folderParam ? ctx.expand(folderParam) : undefined;
  const file = fileParam ? ctx.expand(fileParam) : undefined;
  const wait = waitParam?.toUpperCase() === 'YES';

  ctx.log('info', `Setting download options: folder=${folder || '(default)'}, file=${file || '(auto)'}`);

  // Store download settings in state for later use
  if (folder) {
    ctx.state.setVariable(DOWNLOAD_FOLDER_KEY, folder);
  }
  if (file) {
    ctx.state.setVariable(DOWNLOAD_FILE_KEY, file);
  }

  // Send message to browser extension to configure download behavior
  const response = await sendDownloadMessage(
    {
      type: 'setDownloadOptions',
      folder: folder === '*' ? undefined : folder,
      file: file === '+' ? undefined : file,
      wait,
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
  const file = ctx.expand(fileParam);

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

  // For EXTRACT type, get the content from !EXTRACT variable
  let content: string | undefined;
  if (saveType === 'EXTRACT') {
    content = ctx.state.getVariable('!EXTRACT')?.toString() || '';
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
 * Handler for SAVEITEM command
 *
 * Syntax:
 * - SAVEITEM (saves the current download/link target)
 * - SAVEITEM URL=<url> (saves from specific URL)
 * - SAVEITEM FOLDER=<path> FILE=<filename> (with destination)
 *
 * Saves a specific item (image, link target, download) to disk.
 * Uses ONDOWNLOAD settings for destination if not specified.
 */
export const saveitemHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const urlParam = ctx.getParam('URL');
  const folderParam = ctx.getParam('FOLDER');
  const fileParam = ctx.getParam('FILE');

  // Expand variables
  const url = urlParam ? ctx.expand(urlParam) : undefined;
  const folder = folderParam
    ? ctx.expand(folderParam)
    : ctx.state.getVariable(DOWNLOAD_FOLDER_KEY)?.toString();
  const file = fileParam ? ctx.expand(fileParam) : undefined;

  ctx.log('info', `Saving item: ${url || '(current target)'}`);

  // Send save item request to browser extension
  const response = await sendDownloadMessage(
    {
      type: 'saveItem',
      url,
      folder,
      file,
    },
    ctx
  );

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

  ctx.log('info', `Download started: ${response.data?.filename || response.data?.url || 'item'}`);

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
    output: response.data?.filename,
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
