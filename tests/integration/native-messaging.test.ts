/**
 * Native Messaging Integration Tests
 *
 * Tests the message relay between extension and native host,
 * including the binary protocol with 32-bit length prefix.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Readable, Writable, PassThrough } from 'stream';
import { EventEmitter } from 'events';
import {
  parseMessage,
  encodeMessage,
} from '@native-host/messaging';
import { handleMessage } from '@native-host/index';
import { sendMessage, processResponse } from '@extension/index';
import {
  Message,
  RequestMessage,
  ResponseMessage,
  createMessageId,
  createTimestamp,
} from '@shared/index';

/**
 * Helper to create a message buffer with 32-bit length prefix
 */
function createMessageBuffer(message: object): Buffer {
  const jsonString = JSON.stringify(message);
  const jsonBuffer = Buffer.from(jsonString, 'utf8');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32LE(jsonBuffer.length, 0);
  return Buffer.concat([lengthBuffer, jsonBuffer]);
}

/**
 * Helper to extract message from buffer (removes length prefix)
 */
function extractMessageFromBuffer(buffer: Buffer): object {
  const messageLength = buffer.readUInt32LE(0);
  const jsonBuffer = buffer.slice(4, 4 + messageLength);
  return JSON.parse(jsonBuffer.toString('utf8'));
}

describe('Native Messaging Integration Tests', () => {
  describe('Message Encoding/Decoding (32-bit Length Prefix)', () => {
    it('should encode a message with correct 32-bit little-endian length prefix', () => {
      const message: ResponseMessage = {
        type: 'pong',
        id: 'test-123',
        timestamp: 1234567890,
      };

      const encoded = encodeMessage(message);

      // Check length prefix (first 4 bytes)
      const expectedLength = Buffer.from(JSON.stringify(message), 'utf8').length;
      expect(encoded.readUInt32LE(0)).toBe(expectedLength);

      // Check total buffer length
      expect(encoded.length).toBe(4 + expectedLength);
    });

    it('should decode a message with 32-bit little-endian length prefix', () => {
      const originalMessage: Message = {
        type: 'ping',
        id: 'test-456',
        timestamp: 1234567890,
      };

      const buffer = createMessageBuffer(originalMessage);
      const result = parseMessage(buffer);

      expect(result).not.toBeNull();
      expect(result!.message).toEqual(originalMessage);
      expect(result!.bytesConsumed).toBe(buffer.length);
    });

    it('should return null for incomplete length prefix (less than 4 bytes)', () => {
      const buffer = Buffer.alloc(3);

      const result = parseMessage(buffer);

      expect(result).toBeNull();
    });

    it('should return null for incomplete message body', () => {
      const message = { type: 'ping', id: 'test', timestamp: 123 };
      const jsonBuffer = Buffer.from(JSON.stringify(message), 'utf8');

      // Create buffer with correct length but incomplete body
      const lengthBuffer = Buffer.alloc(4);
      lengthBuffer.writeUInt32LE(jsonBuffer.length, 0);
      const incompleteBuffer = Buffer.concat([lengthBuffer, jsonBuffer.slice(0, 5)]);

      const result = parseMessage(incompleteBuffer);

      expect(result).toBeNull();
    });

    it('should correctly handle multi-byte characters in messages', () => {
      const message: ResponseMessage = {
        type: 'result',
        id: 'unicode-test',
        timestamp: Date.now(),
        payload: { text: 'Hello \u4e16\u754c \ud83c\udf0d' }, // "Hello World" with Chinese and emoji
      };

      const encoded = encodeMessage(message);
      const result = parseMessage(encoded);

      expect(result).not.toBeNull();
      expect(result!.message).toEqual(message);
    });

    it('should handle large messages correctly', () => {
      const largePayload = 'x'.repeat(100000);
      const message: ResponseMessage = {
        type: 'result',
        id: 'large-test',
        timestamp: Date.now(),
        payload: largePayload,
      };

      const encoded = encodeMessage(message);
      const result = parseMessage(encoded);

      expect(result).not.toBeNull();
      expect((result!.message as ResponseMessage).payload).toBe(largePayload);
    });

    it('should encode and decode round-trip correctly for all message types', () => {
      const messageTypes: Message[] = [
        { type: 'ping', id: createMessageId(), timestamp: createTimestamp() },
        { type: 'pong', id: createMessageId(), timestamp: createTimestamp() },
        {
          type: 'execute',
          id: createMessageId(),
          timestamp: createTimestamp(),
          payload: { command: 'test' },
        },
        {
          type: 'result',
          id: createMessageId(),
          timestamp: createTimestamp(),
          payload: { data: [1, 2, 3] },
        },
        {
          type: 'error',
          id: createMessageId(),
          timestamp: createTimestamp(),
          error: 'Something went wrong',
        },
      ];

      for (const message of messageTypes) {
        const encoded = encodeMessage(message as ResponseMessage);
        const decoded = parseMessage(encoded);

        expect(decoded).not.toBeNull();
        expect(decoded!.message).toEqual(message);
      }
    });
  });

  describe('Connection Establishment', () => {
    it('should handle ping/pong handshake for connection verification', () => {
      const pingMessage: RequestMessage = {
        type: 'ping',
        id: createMessageId(),
        timestamp: createTimestamp(),
      };

      const response = handleMessage(pingMessage);

      expect(response.type).toBe('pong');
      expect(response.timestamp).toBeDefined();
      expect(response.id).toBeDefined();
    });

    it('should respond immediately to ping requests', () => {
      const beforeTimestamp = Date.now();
      const pingMessage: RequestMessage = {
        type: 'ping',
        id: createMessageId(),
        timestamp: createTimestamp(),
      };

      const response = handleMessage(pingMessage);
      const afterTimestamp = Date.now();

      expect(response.type).toBe('pong');
      expect(response.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(response.timestamp).toBeLessThanOrEqual(afterTimestamp);
    });

    it('should handle multiple sequential connection requests', () => {
      const responses: ResponseMessage[] = [];

      for (let i = 0; i < 5; i++) {
        const pingMessage: RequestMessage = {
          type: 'ping',
          id: `ping-${i}`,
          timestamp: createTimestamp(),
        };
        responses.push(handleMessage(pingMessage));
      }

      expect(responses.length).toBe(5);
      responses.forEach(response => {
        expect(response.type).toBe('pong');
      });
    });
  });

  describe('Message Relay Between Extension and Host', () => {
    it('should relay ping message from extension to host and return pong', () => {
      // Extension creates a ping message
      const extensionMessage = sendMessage('ping');
      expect(extensionMessage.type).toBe('ping');
      expect(extensionMessage.id).toBeDefined();
      expect(extensionMessage.timestamp).toBeDefined();

      // Host receives and processes the message
      const hostResponse = handleMessage(extensionMessage);
      expect(hostResponse.type).toBe('pong');
    });

    it('should relay execute message from extension to host and return result', () => {
      // Extension creates an execute message with payload
      const extensionMessage = sendMessage('execute', { script: 'test.iim' });
      expect(extensionMessage.type).toBe('execute');
      expect(extensionMessage.payload).toEqual({ script: 'test.iim' });

      // Host receives and processes the message
      const hostResponse = handleMessage(extensionMessage);
      expect(hostResponse.type).toBe('result');
      expect(hostResponse.payload).toBeDefined();
    });

    it('should process response correctly in extension', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const successResponse: ResponseMessage = {
        type: 'result',
        id: createMessageId(),
        timestamp: createTimestamp(),
        payload: { data: 'test result' },
      };

      processResponse(successResponse);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Response received:',
        'result',
        { data: 'test result' }
      );
    });

    it('should handle error response correctly in extension', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const errorResponse: ResponseMessage = {
        type: 'error',
        id: createMessageId(),
        timestamp: createTimestamp(),
        error: 'Script not found',
      };

      processResponse(errorResponse);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Native host error:',
        'Script not found'
      );
    });

    it('should complete full round-trip message relay', () => {
      // Simulate full message flow:
      // 1. Extension creates message
      const requestMessage = sendMessage('execute', { action: 'run' });

      // 2. Encode for transport (as if sending over stdin)
      const encodedRequest = encodeMessage(requestMessage as ResponseMessage);

      // 3. Decode on host side
      const parsedRequest = parseMessage(encodedRequest);
      expect(parsedRequest).not.toBeNull();

      // 4. Host processes message
      const response = handleMessage(parsedRequest!.message);

      // 5. Encode response for transport (as if sending over stdout)
      const encodedResponse = encodeMessage(response);

      // 6. Decode on extension side
      const parsedResponse = parseMessage(encodedResponse);
      expect(parsedResponse).not.toBeNull();
      expect(parsedResponse!.message.type).toBe('result');
    });
  });

  describe('Error Handling for Malformed Messages', () => {
    it('should handle unknown message type gracefully', () => {
      const unknownMessage = {
        type: 'unknown',
        id: createMessageId(),
        timestamp: createTimestamp(),
      } as unknown as Message;

      const response = handleMessage(unknownMessage);

      expect(response.type).toBe('error');
      expect(response.error).toBe('Unknown message type');
    });

    it('should throw error when parsing invalid JSON', () => {
      const invalidJson = 'not valid json';
      const jsonBuffer = Buffer.from(invalidJson, 'utf8');
      const lengthBuffer = Buffer.alloc(4);
      lengthBuffer.writeUInt32LE(jsonBuffer.length, 0);
      const buffer = Buffer.concat([lengthBuffer, jsonBuffer]);

      expect(() => parseMessage(buffer)).toThrow();
    });

    it('should handle message with missing required fields', () => {
      // Message without type field
      const incompleteMessage = {
        id: createMessageId(),
        timestamp: createTimestamp(),
      } as Message;

      // The handleMessage should handle this gracefully
      const response = handleMessage(incompleteMessage);

      // Should return error for undefined message type
      expect(response.type).toBe('error');
    });

    it('should handle message with null payload gracefully', () => {
      const messageWithNullPayload: RequestMessage = {
        type: 'execute',
        id: createMessageId(),
        timestamp: createTimestamp(),
        payload: null,
      };

      const response = handleMessage(messageWithNullPayload);

      // Should still process the message
      expect(['result', 'error']).toContain(response.type);
    });

    it('should handle empty message buffer', () => {
      const emptyBuffer = Buffer.alloc(0);

      const result = parseMessage(emptyBuffer);

      expect(result).toBeNull();
    });

    it('should handle message with zero length prefix', () => {
      const lengthBuffer = Buffer.alloc(4);
      lengthBuffer.writeUInt32LE(0, 0);

      // Zero length means empty JSON, which is invalid
      expect(() => parseMessage(lengthBuffer)).toThrow();
    });

    it('should handle extremely large length prefix', () => {
      const lengthBuffer = Buffer.alloc(4);
      lengthBuffer.writeUInt32LE(0xFFFFFFFF, 0); // Max uint32

      // Should return null because buffer doesn't contain enough data
      const result = parseMessage(lengthBuffer);

      expect(result).toBeNull();
    });
  });

  describe('Connection Lifecycle (Connect, Message, Disconnect)', () => {
    let mockStdin: PassThrough;
    let mockStdout: PassThrough;
    let capturedOutput: Buffer[];

    beforeEach(() => {
      mockStdin = new PassThrough();
      mockStdout = new PassThrough();
      capturedOutput = [];

      // Capture stdout writes
      mockStdout.on('data', (chunk: Buffer) => {
        capturedOutput.push(chunk);
      });
    });

    afterEach(() => {
      mockStdin.destroy();
      mockStdout.destroy();
    });

    it('should establish connection with initial ping', async () => {
      // Simulate connection establishment
      const pingMessage: RequestMessage = {
        type: 'ping',
        id: 'init-ping',
        timestamp: createTimestamp(),
      };

      const response = handleMessage(pingMessage);

      expect(response.type).toBe('pong');
    });

    it('should maintain connection through multiple message exchanges', () => {
      const messages: Message[] = [
        { type: 'ping', id: '1', timestamp: createTimestamp() },
        { type: 'execute', id: '2', timestamp: createTimestamp(), payload: {} },
        { type: 'ping', id: '3', timestamp: createTimestamp() },
        { type: 'execute', id: '4', timestamp: createTimestamp(), payload: { cmd: 'test' } },
      ];

      const responses = messages.map(msg => handleMessage(msg));

      expect(responses[0].type).toBe('pong');
      expect(responses[1].type).toBe('result');
      expect(responses[2].type).toBe('pong');
      expect(responses[3].type).toBe('result');
    });

    it('should handle rapid sequential messages', async () => {
      const messageCount = 100;
      const responses: ResponseMessage[] = [];

      for (let i = 0; i < messageCount; i++) {
        const message: RequestMessage = {
          type: i % 2 === 0 ? 'ping' : 'execute',
          id: `rapid-${i}`,
          timestamp: createTimestamp(),
          payload: i % 2 === 1 ? { index: i } : undefined,
        };
        responses.push(handleMessage(message));
      }

      expect(responses.length).toBe(messageCount);

      // Verify alternating response types
      responses.forEach((response, index) => {
        expect(response.type).toBe(index % 2 === 0 ? 'pong' : 'result');
      });
    });

    it('should handle connection state after error', () => {
      // Send a message that triggers error
      const errorMessage = {
        type: 'invalid',
        id: 'error-test',
        timestamp: createTimestamp(),
      } as unknown as Message;

      const errorResponse = handleMessage(errorMessage);
      expect(errorResponse.type).toBe('error');

      // Verify connection still works after error
      const pingMessage: RequestMessage = {
        type: 'ping',
        id: 'recovery-ping',
        timestamp: createTimestamp(),
      };

      const recoveryResponse = handleMessage(pingMessage);
      expect(recoveryResponse.type).toBe('pong');
    });

    it('should handle interleaved message types', () => {
      const sequence = [
        { type: 'ping', expected: 'pong' },
        { type: 'execute', expected: 'result' },
        { type: 'ping', expected: 'pong' },
        { type: 'invalid', expected: 'error' },
        { type: 'execute', expected: 'result' },
        { type: 'ping', expected: 'pong' },
      ];

      sequence.forEach(({ type, expected }, index) => {
        const message = {
          type,
          id: `seq-${index}`,
          timestamp: createTimestamp(),
          payload: type === 'execute' ? { data: index } : undefined,
        } as Message;

        const response = handleMessage(message);
        expect(response.type).toBe(expected);
      });
    });
  });

  describe('Message Buffer Handling', () => {
    it('should handle multiple messages in single buffer', () => {
      const message1: Message = {
        type: 'ping',
        id: 'multi-1',
        timestamp: createTimestamp(),
      };
      const message2: Message = {
        type: 'execute',
        id: 'multi-2',
        timestamp: createTimestamp(),
        payload: { test: true },
      };

      const buffer1 = createMessageBuffer(message1);
      const buffer2 = createMessageBuffer(message2);
      const combinedBuffer = Buffer.concat([buffer1, buffer2]);

      // Parse first message
      const result1 = parseMessage(combinedBuffer);
      expect(result1).not.toBeNull();
      expect(result1!.message).toEqual(message1);

      // Parse second message from remaining buffer
      const remainingBuffer = combinedBuffer.slice(result1!.bytesConsumed);
      const result2 = parseMessage(remainingBuffer);
      expect(result2).not.toBeNull();
      expect(result2!.message).toEqual(message2);
    });

    it('should correctly report bytes consumed', () => {
      const message: Message = {
        type: 'result',
        id: 'bytes-test',
        timestamp: createTimestamp(),
        payload: { data: 'test data' },
      };

      const buffer = createMessageBuffer(message);
      const result = parseMessage(buffer);

      expect(result).not.toBeNull();
      expect(result!.bytesConsumed).toBe(buffer.length);
    });

    it('should handle buffer with trailing data', () => {
      const message: Message = {
        type: 'ping',
        id: 'trailing-test',
        timestamp: createTimestamp(),
      };

      const messageBuffer = createMessageBuffer(message);
      const trailingData = Buffer.from('trailing garbage data');
      const bufferWithTrailing = Buffer.concat([messageBuffer, trailingData]);

      const result = parseMessage(bufferWithTrailing);

      expect(result).not.toBeNull();
      expect(result!.message).toEqual(message);
      expect(result!.bytesConsumed).toBe(messageBuffer.length);

      // Verify trailing data is preserved
      const remaining = bufferWithTrailing.slice(result!.bytesConsumed);
      expect(remaining.toString()).toBe('trailing garbage data');
    });
  });

  describe('All Message Types', () => {
    it('should handle ping message type', () => {
      const message: RequestMessage = {
        type: 'ping',
        id: createMessageId(),
        timestamp: createTimestamp(),
      };

      const response = handleMessage(message);
      expect(response.type).toBe('pong');
    });

    it('should handle execute message type', () => {
      const message: RequestMessage = {
        type: 'execute',
        id: createMessageId(),
        timestamp: createTimestamp(),
        payload: {
          script: 'test.iim',
          variables: { VAR1: 'value1' },
        },
      };

      const response = handleMessage(message);
      expect(response.type).toBe('result');
      expect(response.payload).toBeDefined();
    });

    it('should handle pong message type (for relay)', () => {
      const message: ResponseMessage = {
        type: 'pong',
        id: createMessageId(),
        timestamp: createTimestamp(),
      };

      // Encoding/decoding works for response types too
      const encoded = encodeMessage(message);
      const decoded = parseMessage(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.message.type).toBe('pong');
    });

    it('should handle result message type (for relay)', () => {
      const message: ResponseMessage = {
        type: 'result',
        id: createMessageId(),
        timestamp: createTimestamp(),
        payload: { success: true, returnValue: 42 },
      };

      const encoded = encodeMessage(message);
      const decoded = parseMessage(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.message.type).toBe('result');
      expect((decoded!.message as ResponseMessage).payload).toEqual({
        success: true,
        returnValue: 42,
      });
    });

    it('should handle error message type (for relay)', () => {
      const message: ResponseMessage = {
        type: 'error',
        id: createMessageId(),
        timestamp: createTimestamp(),
        error: 'Script execution failed: line 10',
      };

      const encoded = encodeMessage(message);
      const decoded = parseMessage(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.message.type).toBe('error');
      expect((decoded!.message as ResponseMessage).error).toBe(
        'Script execution failed: line 10'
      );
    });
  });
});
