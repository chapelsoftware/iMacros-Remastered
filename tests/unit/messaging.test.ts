/**
 * Unit Tests for native-host/src/messaging.ts
 *
 * Covers the uncovered code paths:
 * - writeMessage (lines 155-158)
 * - initNativeMessaging error handling (lines 66-87)
 * - createNativeHost (lines 172-177)
 *
 * Also includes additional edge-case tests for parseMessage and encodeMessage.
 *
 * NOTE: The messaging module uses require('native-messaging') (CJS), which
 * vi.mock does not intercept. We install a mock in require.cache before
 * dynamically importing the messaging module.
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import type { Message, ResponseMessage } from '@shared/index';
// Static import for parseMessage/encodeMessage which don't depend on native-messaging
import { parseMessage, encodeMessage } from '@native-host/messaging';

// ─── Mock state for native-messaging ──────────────────────────────────────────

const mockState = {
  capturedHandler: null as ((message: Message) => void) | null,
  sendMessage: vi.fn(),
};

function installNativeMessagingMock(): void {
  const resolvedPath = require.resolve('native-messaging');
  delete require.cache[resolvedPath];
  require.cache[resolvedPath] = {
    id: resolvedPath,
    filename: resolvedPath,
    loaded: true,
    exports: (handler: (message: Message) => void) => {
      mockState.capturedHandler = handler;
      return mockState.sendMessage;
    },
    parent: null,
    children: [],
    path: '',
    paths: [],
    isPreloading: false,
  } as unknown as NodeJS.Module;
}

// Dynamically loaded messaging functions that depend on native-messaging mock
let writeMessage: (message: ResponseMessage) => void;
let initNativeMessaging: (
  onMessage: (message: Message) => ResponseMessage | Promise<ResponseMessage>,
) => { send: (message: ResponseMessage) => void; close: () => void };
let createNativeHost: (handler: (message: Message) => ResponseMessage) => void;

describe('messaging.ts unit tests', () => {
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    // Install mock before importing the messaging module so that
    // require('native-messaging') inside messaging.ts picks up our mock.
    installNativeMessagingMock();

    // Dynamically import the messaging module with a cache-busting query.
    // This forces vitest to re-evaluate the module, picking up our mock.
    const mod = await import('@native-host/messaging?mock');
    writeMessage = mod.writeMessage;
    initNativeMessaging = mod.initNativeMessaging;
    createNativeHost = mod.createNativeHost;
  });

  beforeEach(() => {
    mockState.capturedHandler = null;
    mockState.sendMessage.mockClear();
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
  });

  // ─── writeMessage ───────────────────────────────────────────────────────────

  describe('writeMessage', () => {
    it('should encode message and write to stdout', () => {
      const message: ResponseMessage = {
        type: 'pong',
        id: 'write-test-1',
        timestamp: 1700000000000,
      };

      writeMessage(message);

      expect(stdoutWriteSpy).toHaveBeenCalledTimes(1);
      const writtenBuffer = stdoutWriteSpy.mock.calls[0][0] as Buffer;
      expect(Buffer.isBuffer(writtenBuffer)).toBe(true);

      // Verify the buffer is a valid native-messaging frame
      const parsed = parseMessage(writtenBuffer);
      expect(parsed).not.toBeNull();
      expect(parsed!.message).toEqual(message);
    });

    it('should produce a buffer with correct 4-byte LE length prefix', () => {
      const message: ResponseMessage = {
        type: 'result',
        id: 'write-test-2',
        timestamp: 1700000000001,
        payload: { value: 42 },
      };

      writeMessage(message);

      const writtenBuffer = stdoutWriteSpy.mock.calls[0][0] as Buffer;
      const jsonLength = Buffer.from(JSON.stringify(message), 'utf8').length;
      expect(writtenBuffer.readUInt32LE(0)).toBe(jsonLength);
      expect(writtenBuffer.length).toBe(4 + jsonLength);
    });

    it('should write error messages with the error field', () => {
      const message: ResponseMessage = {
        type: 'error',
        id: 'write-err-1',
        timestamp: 1700000000002,
        error: 'Something failed',
      };

      writeMessage(message);

      const writtenBuffer = stdoutWriteSpy.mock.calls[0][0] as Buffer;
      const parsed = parseMessage(writtenBuffer);
      expect(parsed).not.toBeNull();
      expect((parsed!.message as ResponseMessage).error).toBe('Something failed');
    });
  });

  // ─── parseMessage (additional edge cases) ───────────────────────────────────

  describe('parseMessage edge cases', () => {
    it('should return null when buffer has fewer than 4 bytes', () => {
      expect(parseMessage(Buffer.alloc(0))).toBeNull();
      expect(parseMessage(Buffer.alloc(1))).toBeNull();
      expect(parseMessage(Buffer.alloc(2))).toBeNull();
      expect(parseMessage(Buffer.alloc(3))).toBeNull();
    });

    it('should return null when buffer has exactly 4 bytes but message is incomplete', () => {
      // Write a length of 100 but only provide the 4-byte header
      const buf = Buffer.alloc(4);
      buf.writeUInt32LE(100, 0);
      expect(parseMessage(buf)).toBeNull();
    });

    it('should return null when buffer has header + partial body', () => {
      const json = JSON.stringify({ type: 'ping', id: 'x', timestamp: 1 });
      const jsonBuf = Buffer.from(json, 'utf8');
      const header = Buffer.alloc(4);
      header.writeUInt32LE(jsonBuf.length, 0);

      // Provide only half the body bytes
      const partial = Buffer.concat([header, jsonBuf.subarray(0, Math.floor(jsonBuf.length / 2))]);
      expect(parseMessage(partial)).toBeNull();
    });

    it('should parse a valid message and report correct bytesConsumed', () => {
      const msg: Message = { type: 'ping', id: 'edge-1', timestamp: 999 };
      const json = JSON.stringify(msg);
      const jsonBuf = Buffer.from(json, 'utf8');
      const header = Buffer.alloc(4);
      header.writeUInt32LE(jsonBuf.length, 0);
      const full = Buffer.concat([header, jsonBuf]);

      const result = parseMessage(full);
      expect(result).not.toBeNull();
      expect(result!.message).toEqual(msg);
      expect(result!.bytesConsumed).toBe(4 + jsonBuf.length);
    });

    it('should throw on invalid JSON in message body', () => {
      const garbage = Buffer.from('{not json!!!', 'utf8');
      const header = Buffer.alloc(4);
      header.writeUInt32LE(garbage.length, 0);
      const buf = Buffer.concat([header, garbage]);

      expect(() => parseMessage(buf)).toThrow();
    });
  });

  // ─── encodeMessage (additional edge cases) ──────────────────────────────────

  describe('encodeMessage edge cases', () => {
    it('should handle messages with special characters', () => {
      const message: ResponseMessage = {
        type: 'result',
        id: 'special-chars',
        timestamp: 1700000000003,
        payload: {
          html: '<div class="test">&amp; \' "quotes"</div>',
          unicode: '\u00e9\u00e8\u00ea\u00eb \u00fc\u00f6\u00e4',
          newlines: 'line1\nline2\ttab',
        },
      };

      const encoded = encodeMessage(message);
      const parsed = parseMessage(encoded);
      expect(parsed).not.toBeNull();
      expect(parsed!.message).toEqual(message);
    });

    it('should round-trip: encodeMessage then parseMessage returns same message', () => {
      const messages: ResponseMessage[] = [
        { type: 'pong', id: 'rt-1', timestamp: 1 },
        { type: 'result', id: 'rt-2', timestamp: 2, payload: { nested: { deep: [1, 2, 3] } } },
        { type: 'error', id: 'rt-3', timestamp: 3, error: 'fail' },
        { type: 'result', id: 'rt-4', timestamp: 4, payload: null },
      ];

      for (const msg of messages) {
        const encoded = encodeMessage(msg);
        const decoded = parseMessage(encoded);
        expect(decoded).not.toBeNull();
        expect(decoded!.message).toEqual(msg);
        expect(decoded!.bytesConsumed).toBe(encoded.length);
      }
    });

    it('should handle message with empty string payload', () => {
      const message: ResponseMessage = {
        type: 'result',
        id: 'empty-payload',
        timestamp: 5,
        payload: '',
      };

      const encoded = encodeMessage(message);
      const parsed = parseMessage(encoded);
      expect(parsed).not.toBeNull();
      expect((parsed!.message as ResponseMessage).payload).toBe('');
    });
  });

  // ─── initNativeMessaging ────────────────────────────────────────────────────

  describe('initNativeMessaging', () => {
    it('should call nativeMessaging with a callback and return a connection', () => {
      const handler = vi.fn();
      const connection = initNativeMessaging(handler);

      // The mock should have captured a handler
      expect(mockState.capturedHandler).toBeTypeOf('function');
      expect(connection).toHaveProperty('send');
      expect(connection).toHaveProperty('close');
    });

    it('should call sendMessage with the handler response when handler succeeds', async () => {
      const response: ResponseMessage = {
        type: 'pong',
        id: 'resp-1',
        timestamp: 1700000000010,
      };
      const handler = vi.fn().mockResolvedValue(response);

      initNativeMessaging(handler);

      // Simulate an incoming message by invoking the captured handler
      const incomingMessage: Message = {
        type: 'ping',
        id: 'msg-1',
        timestamp: 1700000000009,
      };
      await mockState.capturedHandler!(incomingMessage);

      expect(handler).toHaveBeenCalledWith(incomingMessage);
      expect(mockState.sendMessage).toHaveBeenCalledWith(response);
    });

    it('should call sendMessage with handler response for sync handlers', async () => {
      const response: ResponseMessage = {
        type: 'result',
        id: 'resp-sync',
        timestamp: 1700000000020,
        payload: { ok: true },
      };
      // Sync return value (not a promise)
      const handler = vi.fn().mockReturnValue(response);

      initNativeMessaging(handler);

      const incomingMessage: Message = {
        type: 'execute',
        id: 'msg-sync',
        timestamp: 1700000000019,
      };
      await mockState.capturedHandler!(incomingMessage);

      expect(handler).toHaveBeenCalledWith(incomingMessage);
      expect(mockState.sendMessage).toHaveBeenCalledWith(response);
    });

    it('should send error response when handler throws an Error', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('handler exploded'));

      initNativeMessaging(handler);

      const incomingMessage: Message = {
        type: 'execute',
        id: 'err-msg-1',
        timestamp: 1700000000030,
      };

      // Use a fixed timestamp via vi.spyOn so we can assert
      const fixedNow = 1700000099999;
      const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(fixedNow);

      await mockState.capturedHandler!(incomingMessage);

      expect(mockState.sendMessage).toHaveBeenCalledWith({
        type: 'error',
        id: 'err-msg-1',
        timestamp: fixedNow,
        error: 'handler exploded',
      });

      dateNowSpy.mockRestore();
    });

    it('should send error response with String(error) when handler throws a non-Error', async () => {
      const handler = vi.fn().mockRejectedValue('string error value');

      initNativeMessaging(handler);

      const incomingMessage: Message = {
        type: 'execute',
        id: 'err-msg-2',
        timestamp: 1700000000040,
      };

      const fixedNow = 1700000088888;
      const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(fixedNow);

      await mockState.capturedHandler!(incomingMessage);

      expect(mockState.sendMessage).toHaveBeenCalledWith({
        type: 'error',
        id: 'err-msg-2',
        timestamp: fixedNow,
        error: 'string error value',
      });

      dateNowSpy.mockRestore();
    });

    it('should send error response with "unknown" id when message has no id', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('no id'));

      initNativeMessaging(handler);

      // Message without an id field
      const incomingMessage = {
        type: 'execute',
        timestamp: 1700000000050,
      } as unknown as Message;

      const fixedNow = 1700000077777;
      const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(fixedNow);

      await mockState.capturedHandler!(incomingMessage);

      expect(mockState.sendMessage).toHaveBeenCalledWith({
        type: 'error',
        id: 'unknown',
        timestamp: fixedNow,
        error: 'no id',
      });

      dateNowSpy.mockRestore();
    });

    it('should send error when handler throws a number', async () => {
      const handler = vi.fn().mockRejectedValue(42);

      initNativeMessaging(handler);

      const incomingMessage: Message = {
        type: 'ping',
        id: 'err-num',
        timestamp: 1700000000060,
      };

      await mockState.capturedHandler!(incomingMessage);

      expect(mockState.sendMessage).toHaveBeenCalledTimes(1);
      const sentArg = mockState.sendMessage.mock.calls[0][0] as ResponseMessage;
      expect(sentArg.type).toBe('error');
      expect(sentArg.id).toBe('err-num');
      expect(sentArg.error).toBe('42');
    });

    it('connection.send should call sendMessage', () => {
      const handler = vi.fn();
      const connection = initNativeMessaging(handler);

      const outgoing: ResponseMessage = {
        type: 'result',
        id: 'send-test',
        timestamp: 1700000000070,
        payload: { data: 'hello' },
      };

      connection.send(outgoing);

      expect(mockState.sendMessage).toHaveBeenCalledWith(outgoing);
    });

    it('connection.close should call process.exit(0)', () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      const handler = vi.fn();
      const connection = initNativeMessaging(handler);

      connection.close();

      expect(exitSpy).toHaveBeenCalledWith(0);

      exitSpy.mockRestore();
    });
  });

  // ─── createNativeHost ───────────────────────────────────────────────────────

  describe('createNativeHost', () => {
    it('should call nativeMessaging with a callback', () => {
      const handler = vi.fn();
      createNativeHost(handler);

      // The mock captured the callback
      expect(mockState.capturedHandler).toBeTypeOf('function');
    });

    it('should invoke handler and writeMessage when callback fires', () => {
      const response: ResponseMessage = {
        type: 'result',
        id: 'host-resp-1',
        timestamp: 1700000000080,
        payload: { status: 'ok' },
      };
      const handler = vi.fn().mockReturnValue(response);

      createNativeHost(handler);

      // Simulate an incoming message
      const incomingMessage: Message = {
        type: 'execute',
        id: 'host-msg-1',
        timestamp: 1700000000079,
      };
      mockState.capturedHandler!(incomingMessage);

      // handler was called with the message
      expect(handler).toHaveBeenCalledWith(incomingMessage);

      // writeMessage was called (process.stdout.write)
      expect(stdoutWriteSpy).toHaveBeenCalledTimes(1);

      // Verify the written buffer decodes to the response
      const writtenBuffer = stdoutWriteSpy.mock.calls[0][0] as Buffer;
      const parsed = parseMessage(writtenBuffer);
      expect(parsed).not.toBeNull();
      expect(parsed!.message).toEqual(response);
    });

    it('should handle multiple messages sequentially', () => {
      let callCount = 0;
      const handler = vi.fn().mockImplementation((msg: Message) => {
        callCount++;
        return {
          type: 'result' as const,
          id: msg.id,
          timestamp: Date.now(),
          payload: { seq: callCount },
        };
      });

      createNativeHost(handler);

      // Send three messages
      for (let i = 0; i < 3; i++) {
        const msg: Message = {
          type: 'execute',
          id: `seq-${i}`,
          timestamp: 1700000000090 + i,
        };
        mockState.capturedHandler!(msg);
      }

      expect(handler).toHaveBeenCalledTimes(3);
      expect(stdoutWriteSpy).toHaveBeenCalledTimes(3);

      // Verify each response has the correct sequence number
      for (let i = 0; i < 3; i++) {
        const writtenBuffer = stdoutWriteSpy.mock.calls[i][0] as Buffer;
        const parsed = parseMessage(writtenBuffer);
        expect(parsed).not.toBeNull();
        expect((parsed!.message as ResponseMessage).payload).toEqual({ seq: i + 1 });
      }
    });
  });
});
