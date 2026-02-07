/**
 * Shared types for iMacros native messaging between extension and native host
 */

// Re-export parser module
export * from './parser';

// Re-export variables module
export * from './variables';

// Re-export expression evaluator module
export * from './expression-evaluator';

// Re-export state manager module
export * from './state-manager';

// Re-export datasource module
export * from './datasource';

// Re-export encryption module
export * from './encryption';

// Re-export executor module
export * from './executor';

// Re-export command handlers
export * from './commands';

// Re-export settings module
export * from './settings';

// Re-export security module
export * from './security';

/**
 * Message types for native messaging protocol
 */
export type RequestMessageType =
  | 'ping'
  | 'execute'
  | 'dialog_event'
  | 'record_event'
  | 'record_start'
  | 'record_stop'
  | 'load_macro'
  | 'save_macro'
  | 'play_macro'
  | 'stop_macro'
  | 'pause_macro'
  | 'resume_macro'
  | 'settings_update'
  | 'browse_folder'
  | 'get_settings'
  | 'get_macros'
  | 'browser_command_response'
  | 'create_folder'
  | 'rename_file'
  | 'delete_file'
  | 'move_file';

export type ResponseMessageType =
  | 'pong'
  | 'result'
  | 'error'
  | 'ready'
  | 'STATUS_UPDATE'
  | 'MACRO_PROGRESS'
  | 'MACRO_COMPLETE'
  | 'MACRO_ERROR'
  | 'MACRO_PAUSED'
  | 'MACRO_RESUMED'
  | 'RECORDING_LINE'
  | 'RECORDING_SAVED'
  | 'browser_command';

export type MessageType = RequestMessageType | ResponseMessageType;

/**
 * Base message interface for native messaging
 */
export interface BaseMessage {
  type: string;
  id: string;
  timestamp: number;
}

/**
 * Request message from extension to native host
 */
export interface RequestMessage extends BaseMessage {
  type: RequestMessageType;
  payload?: unknown;
}

/**
 * Response message from native host to extension
 */
export interface ResponseMessage extends BaseMessage {
  type: ResponseMessageType;
  payload?: unknown;
  error?: string;
}

/**
 * Union type for all messages
 */
export type Message = RequestMessage | ResponseMessage;

/**
 * Configuration options shared between extension and native host
 */
export interface SharedConfig {
  debug: boolean;
  timeout: number;
  version: string;
}

/**
 * Helper to create a unique message ID
 */
export function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Helper to create a timestamp
 */
export function createTimestamp(): number {
  return Date.now();
}
