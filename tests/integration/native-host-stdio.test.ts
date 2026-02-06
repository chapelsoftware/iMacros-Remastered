/**
 * Native Host stdio Integration Tests
 *
 * These tests spawn the actual native-host.js process and communicate
 * with it over stdin/stdout using Chrome's native messaging protocol
 * (32-bit little-endian length prefix + JSON).
 *
 * This verifies end-to-end that:
 * - The shell wrapper can launch the native host
 * - Messages are correctly encoded with 32-bit LE length prefix
 * - Messages are correctly decoded from the length-prefixed stream
 * - Ping/pong handshake works over the real stdio transport
 * - Multiple sequential messages work correctly
 * - The host sends a "ready" message on startup
 */
import { describe, it, expect, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

const NATIVE_HOST_JS = path.resolve(__dirname, '../../native-host/native-host.js');
const NATIVE_HOST_SH = path.resolve(__dirname, '../../native-host/native-host.sh');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Encode a JSON message using Chrome's native messaging binary protocol.
 * Format: 4-byte little-endian unsigned integer (message length) + UTF-8 JSON.
 */
function encodeNativeMessage(message: object): Buffer {
  const jsonString = JSON.stringify(message);
  const jsonBuffer = Buffer.from(jsonString, 'utf8');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32LE(jsonBuffer.length, 0);
  return Buffer.concat([lengthBuffer, jsonBuffer]);
}

/**
 * Decode one or more native messages from a raw buffer.
 * Returns an array of parsed message objects and remaining unconsumed bytes.
 */
function decodeNativeMessages(buffer: Buffer): { messages: object[]; remaining: Buffer } {
  const messages: object[] = [];
  let offset = 0;

  while (offset + 4 <= buffer.length) {
    const messageLength = buffer.readUInt32LE(offset);
    if (offset + 4 + messageLength > buffer.length) {
      break; // incomplete message
    }
    const jsonBuffer = buffer.slice(offset + 4, offset + 4 + messageLength);
    messages.push(JSON.parse(jsonBuffer.toString('utf8')));
    offset += 4 + messageLength;
  }

  return { messages, remaining: buffer.slice(offset) };
}

/**
 * Spawn native-host.js as a child process and provide helpers to
 * send/receive length-prefixed messages.
 */
function spawnNativeHost(entryPoint: string = NATIVE_HOST_JS): {
  child: ChildProcess;
  send: (msg: object) => void;
  receiveAll: (timeoutMs?: number) => Promise<object[]>;
  receiveOne: (timeoutMs?: number) => Promise<object>;
  kill: () => void;
} {
  const args = entryPoint.endsWith('.js') ? ['node', [entryPoint]] : [entryPoint, []] as const;
  const child = spawn(args[0], args[1] as string[], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: path.dirname(entryPoint),
  });

  let stdoutBuffer = Buffer.alloc(0);
  const messageQueue: object[] = [];
  let waitingResolve: ((msgs: object[]) => void) | null = null;

  child.stdout!.on('data', (chunk: Buffer) => {
    stdoutBuffer = Buffer.concat([stdoutBuffer, chunk]);
    const { messages, remaining } = decodeNativeMessages(stdoutBuffer);
    stdoutBuffer = remaining;
    for (const msg of messages) {
      messageQueue.push(msg);
    }
    if (waitingResolve && messageQueue.length > 0) {
      const resolve = waitingResolve;
      waitingResolve = null;
      resolve([...messageQueue.splice(0)]);
    }
  });

  return {
    child,

    send(msg: object) {
      child.stdin!.write(encodeNativeMessage(msg));
    },

    /**
     * Wait until at least one message is available (or timeout).
     * Returns all messages received so far.
     */
    receiveAll(timeoutMs = 3000): Promise<object[]> {
      if (messageQueue.length > 0) {
        return Promise.resolve([...messageQueue.splice(0)]);
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waitingResolve = null;
          reject(new Error(`Timed out waiting for messages after ${timeoutMs}ms`));
        }, timeoutMs);
        waitingResolve = (msgs) => {
          clearTimeout(timer);
          resolve(msgs);
        };
      });
    },

    /**
     * Wait for exactly one new message.
     */
    async receiveOne(timeoutMs = 3000): Promise<object> {
      if (messageQueue.length > 0) {
        return messageQueue.shift()!;
      }
      const msgs = await this.receiveAll(timeoutMs);
      // Put extras back
      for (let i = 1; i < msgs.length; i++) {
        messageQueue.unshift(msgs[i]);
      }
      return msgs[0];
    },

    kill() {
      try {
        child.stdin!.end();
        child.kill();
      } catch {
        // ignore
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Native Host stdio Integration Tests', () => {
  let host: ReturnType<typeof spawnNativeHost> | null = null;

  afterEach(() => {
    if (host) {
      host.kill();
      host = null;
    }
  });

  // --- Encoding / Decoding Unit Tests ---

  describe('32-bit length-prefix encoding/decoding', () => {
    it('encodes a message with correct 4-byte LE length prefix', () => {
      const msg = { type: 'ping', id: '1', timestamp: 12345 };
      const encoded = encodeNativeMessage(msg);
      const jsonBytes = Buffer.from(JSON.stringify(msg), 'utf8');

      // First 4 bytes = length as uint32 LE
      expect(encoded.readUInt32LE(0)).toBe(jsonBytes.length);
      // Remaining bytes = JSON
      expect(encoded.slice(4).toString('utf8')).toBe(JSON.stringify(msg));
      // Total length
      expect(encoded.length).toBe(4 + jsonBytes.length);
    });

    it('decodes a single length-prefixed message', () => {
      const msg = { type: 'pong', id: '2', timestamp: 67890 };
      const encoded = encodeNativeMessage(msg);
      const { messages, remaining } = decodeNativeMessages(encoded);

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(msg);
      expect(remaining.length).toBe(0);
    });

    it('decodes multiple concatenated messages', () => {
      const msg1 = { type: 'ping', id: '1' };
      const msg2 = { type: 'pong', id: '2' };
      const msg3 = { type: 'result', id: '3', payload: { ok: true } };
      const combined = Buffer.concat([
        encodeNativeMessage(msg1),
        encodeNativeMessage(msg2),
        encodeNativeMessage(msg3),
      ]);

      const { messages, remaining } = decodeNativeMessages(combined);

      expect(messages).toHaveLength(3);
      expect(messages[0]).toEqual(msg1);
      expect(messages[1]).toEqual(msg2);
      expect(messages[2]).toEqual(msg3);
      expect(remaining.length).toBe(0);
    });

    it('returns incomplete buffer as remaining when message is truncated', () => {
      const msg = { type: 'ping', id: 'trunc' };
      const encoded = encodeNativeMessage(msg);
      // Cut off last 3 bytes so body is incomplete
      const truncated = encoded.slice(0, encoded.length - 3);

      const { messages, remaining } = decodeNativeMessages(truncated);

      expect(messages).toHaveLength(0);
      expect(remaining.length).toBe(truncated.length);
    });

    it('returns empty array for buffer smaller than 4 bytes', () => {
      const tiny = Buffer.from([0x01, 0x02]);
      const { messages, remaining } = decodeNativeMessages(tiny);

      expect(messages).toHaveLength(0);
      expect(remaining.length).toBe(2);
    });

    it('handles multi-byte UTF-8 characters correctly', () => {
      const msg = { text: 'Hello \u4e16\u754c \u{1F30D}' }; // Chinese + globe emoji
      const encoded = encodeNativeMessage(msg);
      const jsonBytes = Buffer.from(JSON.stringify(msg), 'utf8');

      // The length prefix must reflect byte length, not character count
      expect(encoded.readUInt32LE(0)).toBe(jsonBytes.length);

      const { messages } = decodeNativeMessages(encoded);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(msg);
    });

    it('round-trips a large message', () => {
      const largePayload = 'A'.repeat(100_000);
      const msg = { type: 'result', data: largePayload };
      const encoded = encodeNativeMessage(msg);
      const { messages } = decodeNativeMessages(encoded);

      expect(messages).toHaveLength(1);
      expect((messages[0] as any).data).toBe(largePayload);
    });
  });

  // --- Process-level Integration Tests ---

  describe('Process stdio round-trip (native-host.js)', () => {
    it('receives a ready message on startup', async () => {
      host = spawnNativeHost(NATIVE_HOST_JS);
      const ready = await host.receiveOne(5000) as any;

      expect(ready.type).toBe('ready');
      expect(ready.version).toBe('1.0.0');
      expect(ready.platform).toBe(process.platform);
    });

    it('responds to ping with pong', async () => {
      host = spawnNativeHost(NATIVE_HOST_JS);

      // Consume the ready message first
      const ready = await host.receiveOne(5000) as any;
      expect(ready.type).toBe('ready');

      // Send ping
      host.send({ type: 'ping', id: 'ping-001', timestamp: Date.now() });

      const pong = await host.receiveOne(3000) as any;
      expect(pong.type).toBe('pong');
      expect(pong.id).toBe('ping-001');
      expect(pong.payload).toBeDefined();
      expect(pong.payload.timestamp).toBeGreaterThan(0);
    });

    it('handles multiple sequential ping/pong exchanges', async () => {
      host = spawnNativeHost(NATIVE_HOST_JS);

      // Consume ready
      await host.receiveOne(5000);

      for (let i = 0; i < 5; i++) {
        host.send({ type: 'ping', id: `seq-${i}`, timestamp: Date.now() });
        const pong = await host.receiveOne(3000) as any;
        expect(pong.type).toBe('pong');
        expect(pong.id).toBe(`seq-${i}`);
      }
    });

    it('responds to get_settings with settings data', async () => {
      host = spawnNativeHost(NATIVE_HOST_JS);
      await host.receiveOne(5000); // ready

      host.send({ type: 'get_settings', id: 'settings-1', timestamp: Date.now() });
      const resp = await host.receiveOne(3000) as any;

      expect(resp.type).toBe('settings');
      expect(resp.id).toBe('settings-1');
      expect(resp.payload).toBeDefined();
      expect(resp.payload.macrosFolder).toBeDefined();
      expect(resp.payload.defaultTimeout).toBe(30);
    });

    it('returns error for unknown message type', async () => {
      host = spawnNativeHost(NATIVE_HOST_JS);
      await host.receiveOne(5000); // ready

      host.send({ type: 'totally_bogus', id: 'err-1', timestamp: Date.now() });
      const resp = await host.receiveOne(3000) as any;

      expect(resp.type).toBe('error');
      expect(resp.id).toBe('err-1');
    });

    it('handles rapid-fire messages correctly', async () => {
      host = spawnNativeHost(NATIVE_HOST_JS);
      await host.receiveOne(5000); // ready

      const count = 20;
      // Send all pings at once
      for (let i = 0; i < count; i++) {
        host.send({ type: 'ping', id: `rapid-${i}`, timestamp: Date.now() });
      }

      // Collect all responses
      const responses: any[] = [];
      while (responses.length < count) {
        const msg = await host.receiveOne(5000);
        responses.push(msg);
      }

      expect(responses).toHaveLength(count);
      const ids = responses.map((r: any) => r.id).sort();
      for (let i = 0; i < count; i++) {
        expect(responses[i].type).toBe('pong');
      }
      for (let i = 0; i < count; i++) {
        expect(ids).toContain(`rapid-${i}`);
      }
    });

    it('full round-trip: encode ping -> send via stdio -> decode pong', async () => {
      host = spawnNativeHost(NATIVE_HOST_JS);
      await host.receiveOne(5000); // ready

      // Manually encode and write a ping
      const pingMsg = { type: 'ping', id: 'roundtrip-1', timestamp: Date.now() };
      const encoded = encodeNativeMessage(pingMsg);
      host.child.stdin!.write(encoded);

      // Read and decode the response
      const pong = await host.receiveOne(3000) as any;
      expect(pong.type).toBe('pong');
      expect(pong.id).toBe('roundtrip-1');
      expect(typeof pong.timestamp).toBe('number');
    });
  });

  describe('Process stdio round-trip (native-host.sh wrapper)', () => {
    it('responds to ping with pong through shell wrapper', async () => {
      host = spawnNativeHost(NATIVE_HOST_SH);

      // Consume ready
      const ready = await host.receiveOne(5000) as any;
      expect(ready.type).toBe('ready');

      // Send ping
      host.send({ type: 'ping', id: 'sh-ping-1', timestamp: Date.now() });
      const pong = await host.receiveOne(3000) as any;

      expect(pong.type).toBe('pong');
      expect(pong.id).toBe('sh-ping-1');
    });
  });

  describe('Manifest validation', () => {
    it('manifest points to an existing executable wrapper script', async () => {
      const fs = await import('fs');
      const manifestPath = path.resolve(__dirname, '../../native-host/com.imacros.nativehost.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      expect(manifest.name).toBe('com.imacros.nativehost');
      expect(manifest.type).toBe('stdio');
      expect(manifest.allowed_origins).toBeInstanceOf(Array);
      expect(manifest.allowed_origins.length).toBeGreaterThan(0);

      // Path must be absolute (Chrome requirement on Linux/macOS)
      expect(path.isAbsolute(manifest.path)).toBe(true);

      // The file the manifest points to must exist and be executable
      expect(fs.existsSync(manifest.path)).toBe(true);
      const stats = fs.statSync(manifest.path);
      // Check user-execute bit
      const isExecutable = (stats.mode & 0o100) !== 0;
      expect(isExecutable).toBe(true);
    });

    it('manifest wrapper script launches native-host.js', async () => {
      const fs = await import('fs');
      const manifestPath = path.resolve(__dirname, '../../native-host/com.imacros.nativehost.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      // Read wrapper script content
      const wrapperContent = fs.readFileSync(manifest.path, 'utf8');

      // Should reference native-host.js
      expect(wrapperContent).toContain('native-host.js');
      // Should invoke node
      expect(wrapperContent).toContain('node');
    });
  });
});
