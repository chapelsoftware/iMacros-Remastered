/**
 * Native host entry point for Electron/Node.js
 *
 * This module initializes the native messaging protocol and handles
 * messages from the browser extension.
 */
import { Message, ResponseMessage, createMessageId, createTimestamp } from '@shared/index';
import { initNativeMessaging, NativeMessagingConnection } from './messaging';

// Export messaging module for external use
export * from './messaging';

/**
 * Handle incoming messages from the extension
 */
export function handleMessage(message: Message): ResponseMessage {
  switch (message.type) {
    case 'ping':
      return {
        type: 'pong',
        id: createMessageId(),
        timestamp: createTimestamp(),
      };
    case 'execute':
      return {
        type: 'result',
        id: createMessageId(),
        timestamp: createTimestamp(),
        payload: { success: true },
      };
    default:
      return {
        type: 'error',
        id: createMessageId(),
        timestamp: createTimestamp(),
        error: 'Unknown message type',
      };
  }
}

/**
 * Start the native messaging host
 *
 * Initializes the Chrome native messaging protocol and begins
 * listening for messages from the browser extension.
 *
 * @returns The native messaging connection object
 */
export function startNativeHost(): NativeMessagingConnection {
  return initNativeMessaging((message) => {
    return handleMessage(message);
  });
}

// Auto-start when running as the main module
if (require.main === module) {
  startNativeHost();
}
