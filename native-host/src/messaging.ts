/**
 * Chrome Native Messaging Protocol Implementation
 *
 * Handles the binary protocol for Chrome/Firefox native messaging:
 * - 32-bit little-endian length prefix
 * - JSON encoding/decoding over stdin/stdout
 *
 * Uses the native-messaging npm package for protocol handling.
 */
import { Message, ResponseMessage } from '@shared/index';

// Type declaration for native-messaging module (no @types available)
type MessageHandler = (message: Message) => void;
type SendMessageFn = (message: ResponseMessage) => void;
type NativeMessagingInit = (handler: MessageHandler) => SendMessageFn;

// Import native-messaging module
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nativeMessaging: NativeMessagingInit = require('native-messaging');

/**
 * Callback type for handling incoming messages
 */
export type OnMessageCallback = (message: Message) => ResponseMessage | Promise<ResponseMessage>;

/**
 * Native messaging connection interface
 */
export interface NativeMessagingConnection {
  /**
   * Send a message to the extension
   */
  send: (message: ResponseMessage) => void;

  /**
   * Close the connection (terminates the process)
   */
  close: () => void;
}

/**
 * Initialize the native messaging protocol handler
 *
 * This sets up stdin/stdout communication with the browser extension
 * using the Chrome native messaging binary protocol:
 * - Reads: 4-byte little-endian length prefix + JSON payload
 * - Writes: 4-byte little-endian length prefix + JSON payload
 *
 * @param onMessage - Callback function to handle incoming messages
 * @returns NativeMessagingConnection object with send and close methods
 *
 * @example
 * ```typescript
 * const connection = initNativeMessaging(async (message) => {
 *   if (message.type === 'ping') {
 *     return { type: 'pong', id: message.id, timestamp: Date.now() };
 *   }
 *   return { type: 'error', id: message.id, timestamp: Date.now(), error: 'Unknown message' };
 * });
 * ```
 */
export function initNativeMessaging(onMessage: OnMessageCallback): NativeMessagingConnection {
  let sendMessage: SendMessageFn;

  // Initialize native-messaging with our message handler
  sendMessage = nativeMessaging(async (message: Message) => {
    try {
      const response = await onMessage(message);
      sendMessage(response);
    } catch (error) {
      // Send error response if message handling fails
      const errorResponse: ResponseMessage = {
        type: 'error',
        id: message.id || 'unknown',
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      };
      sendMessage(errorResponse);
    }
  });

  return {
    send: (message: ResponseMessage) => {
      sendMessage(message);
    },
    close: () => {
      process.exit(0);
    },
  };
}

/**
 * Low-level function to read a single message from stdin
 *
 * This implements the Chrome native messaging binary protocol:
 * - First 4 bytes: message length as 32-bit little-endian unsigned integer
 * - Remaining bytes: JSON-encoded message
 *
 * @param buffer - Buffer containing the raw message data
 * @returns Parsed message object or null if buffer is incomplete
 */
export function parseMessage(buffer: Buffer): { message: Message; bytesConsumed: number } | null {
  // Need at least 4 bytes for the length prefix
  if (buffer.length < 4) {
    return null;
  }

  // Read the message length (32-bit little-endian)
  const messageLength = buffer.readUInt32LE(0);
  const totalLength = 4 + messageLength;

  // Check if we have the complete message
  if (buffer.length < totalLength) {
    return null;
  }

  // Extract and parse the JSON payload
  const jsonBuffer = buffer.slice(4, totalLength);
  const message = JSON.parse(jsonBuffer.toString('utf8')) as Message;

  return {
    message,
    bytesConsumed: totalLength,
  };
}

/**
 * Low-level function to encode a message for stdout
 *
 * This implements the Chrome native messaging binary protocol:
 * - First 4 bytes: message length as 32-bit little-endian unsigned integer
 * - Remaining bytes: JSON-encoded message
 *
 * @param message - Message object to encode
 * @returns Buffer containing the encoded message with length prefix
 */
export function encodeMessage(message: ResponseMessage): Buffer {
  // Convert message to JSON string
  const jsonString = JSON.stringify(message);
  const jsonBuffer = Buffer.from(jsonString, 'utf8');

  // Create length prefix (4 bytes, little-endian)
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32LE(jsonBuffer.length, 0);

  // Concatenate length prefix and message
  return Buffer.concat([lengthBuffer, jsonBuffer]);
}

/**
 * Write a message directly to stdout using the native messaging protocol
 *
 * @param message - Message to send
 */
export function writeMessage(message: ResponseMessage): void {
  const encoded = encodeMessage(message);
  process.stdout.write(encoded);
}

/**
 * Create a simple native messaging host that uses the callback-based API
 *
 * @param handler - Function that processes messages and returns responses
 *
 * @example
 * ```typescript
 * createNativeHost((message) => {
 *   return handleMessage(message);
 * });
 * ```
 */
export function createNativeHost(handler: (message: Message) => ResponseMessage): void {
  nativeMessaging((message: Message) => {
    const response = handler(message);
    writeMessage(response);
  });
}
