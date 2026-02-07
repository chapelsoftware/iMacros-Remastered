/**
 * Native host entry point for Electron/Node.js
 *
 * This module initializes the native messaging protocol and handles
 * messages from the browser extension.
 */
import { Message, ResponseMessage, createMessageId, createTimestamp, parseMacro, createExecutor } from '@shared/index';
import { initNativeMessaging, NativeMessagingConnection } from './messaging';

// Export messaging module for external use
export * from './messaging';

/**
 * Handle incoming messages from the extension
 */
export async function handleMessage(message: Message): Promise<ResponseMessage> {
  switch (message.type) {
    case 'ping':
      return {
        type: 'pong',
        id: createMessageId(),
        timestamp: createTimestamp(),
      };
    case 'execute': {
      try {
        const script = (message as any).payload?.script;
        if (!script) {
          return {
            type: 'error',
            id: createMessageId(),
            timestamp: createTimestamp(),
            error: 'No script provided',
          };
        }
        const parsed = parseMacro(script);
        if (parsed.errors.length > 0) {
          const firstError = parsed.errors[0];
          return {
            type: 'error',
            id: createMessageId(),
            timestamp: createTimestamp(),
            error: `Parse error line ${firstError.lineNumber}: ${firstError.message}`,
          };
        }
        const executor = createExecutor();
        executor.loadMacro(script);
        const result = await executor.execute();
        return {
          type: 'result',
          id: createMessageId(),
          timestamp: createTimestamp(),
          payload: {
            success: result.success,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
            extractData: result.extractData,
            runtime: result.executionTimeMs,
          },
        };
      } catch (err: any) {
        return {
          type: 'error',
          id: createMessageId(),
          timestamp: createTimestamp(),
          error: err.message || String(err),
        };
      }
    }
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
  return initNativeMessaging(async (message) => {
    return handleMessage(message);
  });
}

// Auto-start when running as the main module
if (require.main === module) {
  startNativeHost();
}
