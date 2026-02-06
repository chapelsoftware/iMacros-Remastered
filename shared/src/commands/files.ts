/**
 * File Command Handlers for iMacros
 *
 * Implements handlers for file-related commands:
 * - FILEDELETE NAME=<path> (delete file or directory)
 *
 * These handlers communicate with the native host file service via messaging.
 */

import {
  CommandHandler,
  CommandContext,
  CommandResult,
  IMACROS_ERROR_CODES,
  IMacrosErrorCode,
} from '../executor';
import type { CommandType } from '../parser';

// ===== File Message Types =====

/**
 * Message types for file operations
 */
export type FileMessageType =
  | 'fileDelete';

/**
 * Base message for file operations
 */
export interface FileMessage {
  type: FileMessageType;
  id: string;
  timestamp: number;
}

/**
 * Delete file/directory message
 */
export interface FileDeleteMessage extends FileMessage {
  type: 'fileDelete';
  path: string;
}

/**
 * Union type for all file messages
 */
export type FileOperationMessage =
  | FileDeleteMessage;

/**
 * Response from file operation
 */
export interface FileOperationResponse {
  success: boolean;
  error?: string;
  data?: {
    path?: string;
  };
}

// ===== File Bridge Interface =====

/**
 * Interface for sending messages to the native host for file operations
 * This should be implemented by the extension/native messaging layer
 */
export interface FileBridge {
  /**
   * Send a file message to the native host and wait for response
   */
  sendMessage(message: FileOperationMessage): Promise<FileOperationResponse>;
}

/**
 * Current file bridge instance
 */
let currentFileBridge: FileBridge | null = null;

/**
 * Set the file bridge for file commands
 */
export function setFileBridge(bridge: FileBridge): void {
  currentFileBridge = bridge;
}

/**
 * Get the current file bridge
 */
export function getFileBridge(): FileBridge | null {
  return currentFileBridge;
}

/**
 * Create a unique message ID
 */
function createMessageId(): string {
  return `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Message payload types without id and timestamp
 */
type FileDeletePayload = {
  type: 'fileDelete';
  path: string;
};

type FileMessagePayload =
  | FileDeletePayload;

/**
 * Send a file message and get the response
 */
async function sendFileMessage(
  message: FileMessagePayload,
  ctx: CommandContext
): Promise<FileOperationResponse> {
  const fullMessage = {
    ...message,
    id: createMessageId(),
    timestamp: Date.now(),
  } as FileOperationMessage;

  if (!currentFileBridge) {
    ctx.log('warn', `No file bridge configured for ${message.type} operation`);
    // Return failure when no bridge is configured
    return {
      success: false,
      error: 'File operations require native messaging support. No file bridge configured.',
    };
  }

  try {
    return await currentFileBridge.sendMessage(fullMessage);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    ctx.log('error', `File operation failed: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

// ===== FILEDELETE Command Handler =====

/**
 * Handler for FILEDELETE command
 *
 * Syntax:
 * - FILEDELETE NAME=<path>
 *
 * Deletes a file or directory at the specified path.
 * If the path is a directory, it will be deleted recursively.
 *
 * Examples:
 * - FILEDELETE NAME=C:\temp\file.txt
 * - FILEDELETE NAME={{!FOLDER_DATASOURCE}}output.csv
 * - FILEDELETE NAME=/tmp/testdir
 */
export const filedeleteHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const nameParam = ctx.getParam('NAME');

  if (!nameParam) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'FILEDELETE requires NAME parameter',
    };
  }

  // Expand variables in the path
  const filePath = ctx.expand(nameParam);

  if (!filePath || filePath.trim() === '') {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
      errorMessage: 'FILEDELETE NAME parameter cannot be empty',
    };
  }

  ctx.log('info', `Deleting: ${filePath}`);

  // Send delete request to native host
  const response = await sendFileMessage(
    {
      type: 'fileDelete',
      path: filePath,
    },
    ctx
  );

  if (!response.success) {
    // Determine specific error code based on error message
    let errorCode: IMacrosErrorCode = IMACROS_ERROR_CODES.FILE_ERROR;
    const errorLower = (response.error || '').toLowerCase();

    if (errorLower.includes('not found') || errorLower.includes('enoent')) {
      errorCode = IMACROS_ERROR_CODES.FILE_NOT_FOUND;
    } else if (errorLower.includes('permission') || errorLower.includes('access') || errorLower.includes('eacces')) {
      errorCode = IMACROS_ERROR_CODES.FILE_ACCESS_DENIED;
    }

    return {
      success: false,
      errorCode,
      errorMessage: response.error || `Failed to delete: ${filePath}`,
    };
  }

  ctx.log('info', `Deleted: ${filePath}`);

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
    output: filePath,
  };
};

// ===== Handler Registration =====

/**
 * All file command handlers
 */
export const fileHandlers: Partial<Record<CommandType, CommandHandler>> = {
  FILEDELETE: filedeleteHandler,
};

/**
 * Register file handlers with an executor
 */
export function registerFileHandlers(
  registerFn: (type: CommandType, handler: CommandHandler) => void
): void {
  for (const [type, handler] of Object.entries(fileHandlers)) {
    if (handler) {
      registerFn(type as CommandType, handler);
    }
  }
}

/**
 * Create file handlers map for direct use
 */
export function createFileHandlers(): Record<string, CommandHandler> {
  return { ...fileHandlers };
}

// ===== Exports =====

export type { CommandHandler, CommandContext, CommandResult };
