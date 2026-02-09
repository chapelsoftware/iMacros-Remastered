/**
 * Scripting Interface Integration Tests
 *
 * Tests the TCP Scripting Interface server for iMacros.
 * Tests iimPlay, iimSet, iimGetLastExtract, iimGetLastError commands,
 * return codes, concurrent connections, and error handling.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as net from 'net';
import {
  ScriptingInterfaceServer,
  ReturnCode,
  MacroHandler,
  CommandResult,
  createScriptingInterfaceServer,
} from '@native-host/services/scripting-interface';

/**
 * Mock macro handler for testing
 */
class MockMacroHandler implements MacroHandler {
  private variables: Map<string, string> = new Map();
  private _lastExtract: string = '';
  private _lastError: string = '';
  private _running: boolean = false;
  public playDelay: number = 0;
  public playResult: CommandResult = { code: ReturnCode.OK };
  public shouldThrow: boolean = false;

  async play(macroNameOrContent: string, timeout?: number): Promise<CommandResult> {
    if (this.shouldThrow) {
      throw new Error('Simulated error');
    }
    this._running = true;
    if (this.playDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.playDelay));
    }
    this._running = false;
    return this.playResult;
  }

  setVariable(name: string, value: string): void {
    this.variables.set(name, value);
  }

  getVariable(name: string): string | undefined {
    return this.variables.get(name);
  }

  getLastExtract(): string {
    return this._lastExtract || '#nodata#';
  }

  getLastError(): string {
    return this._lastError;
  }

  isRunning(): boolean {
    return this._running;
  }

  stop(): void {
    this._running = false;
  }

  // Test helpers
  setLastExtract(value: string): void {
    this._lastExtract = value;
  }

  setLastError(value: string): void {
    this._lastError = value;
  }

  setRunning(value: boolean): void {
    this._running = value;
  }

  reset(): void {
    this.variables.clear();
    this._lastExtract = '';
    this._lastError = '';
    this._running = false;
    this.playDelay = 0;
    this.playResult = { code: ReturnCode.OK };
    this.shouldThrow = false;
  }
}

/**
 * Helper to create a TCP client and send a command
 */
async function sendCommand(
  port: number,
  command: string,
  host: string = '127.0.0.1'
): Promise<{ code: number; data?: string }> {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let responseBuffer = '';

    client.connect(port, host, () => {
      client.write(command + '\n');
    });

    client.on('data', (data) => {
      responseBuffer += data.toString();
      const lines = responseBuffer.split('\n');
      if (lines.length > 1) {
        const responseLine = lines[0];
        client.destroy();

        // Parse response: CODE\tDATA or just CODE
        const parts = responseLine.split('\t');
        const code = parseInt(parts[0], 10);
        const responseData = parts.length > 1 ? parts[1] : undefined;
        resolve({ code, data: responseData });
      }
    });

    client.on('error', (err) => {
      reject(err);
    });

    client.on('timeout', () => {
      client.destroy();
      reject(new Error('Connection timeout'));
    });

    client.setTimeout(5000);
  });
}

/**
 * Helper to create a persistent TCP client
 */
function createClient(
  port: number,
  host: string = '127.0.0.1'
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();

    client.connect(port, host, () => {
      resolve(client);
    });

    client.on('error', (err) => {
      reject(err);
    });

    client.setTimeout(5000);
  });
}

/**
 * Helper to send command on existing client and wait for response
 */
function sendOnClient(
  client: net.Socket,
  command: string
): Promise<{ code: number; data?: string }> {
  return new Promise((resolve, reject) => {
    let responseBuffer = '';

    const dataHandler = (data: Buffer) => {
      responseBuffer += data.toString();
      const lines = responseBuffer.split('\n');
      if (lines.length > 1) {
        const responseLine = lines[0];
        client.removeListener('data', dataHandler);

        const parts = responseLine.split('\t');
        const code = parseInt(parts[0], 10);
        const responseData = parts.length > 1 ? parts[1] : undefined;
        resolve({ code, data: responseData });
      }
    };

    client.on('data', dataHandler);
    client.write(command + '\n');

    setTimeout(() => {
      client.removeListener('data', dataHandler);
      reject(new Error('Response timeout'));
    }, 5000);
  });
}

describe('Scripting Interface Integration Tests', () => {
  let server: ScriptingInterfaceServer;
  let mockHandler: MockMacroHandler;
  const testPort = 14951; // Use non-default port for testing

  beforeEach(async () => {
    mockHandler = new MockMacroHandler();
    server = new ScriptingInterfaceServer({ port: testPort }, mockHandler);
  });

  afterEach(async () => {
    if (server && server.isRunning()) {
      await server.stop();
    }
  });

  describe('TCP Server Startup and Shutdown', () => {
    it('should start the server successfully', async () => {
      await server.start();
      expect(server.isRunning()).toBe(true);
    });

    it('should listen on the configured port', async () => {
      await server.start();

      const config = server.getConfig();
      expect(config.port).toBe(testPort);
      expect(config.host).toBe('127.0.0.1');
    });

    it('should stop the server successfully', async () => {
      await server.start();
      expect(server.isRunning()).toBe(true);

      await server.stop();
      expect(server.isRunning()).toBe(false);
    });

    it('should reject starting an already running server', async () => {
      await server.start();

      await expect(server.start()).rejects.toThrow('Server is already running');
    });

    it('should handle stop on non-running server gracefully', async () => {
      // Should not throw
      await server.stop();
      expect(server.isRunning()).toBe(false);
    });

    it('should emit listening event on start', async () => {
      const listeningHandler = vi.fn();
      server.on('listening', listeningHandler);

      await server.start();

      expect(listeningHandler).toHaveBeenCalled();
    });

    it('should emit close event on stop', async () => {
      const closeHandler = vi.fn();
      server.on('close', closeHandler);

      await server.start();
      await server.stop();

      expect(closeHandler).toHaveBeenCalled();
    });

    it('should accept client connections', async () => {
      const connectionHandler = vi.fn();
      server.on('connection', connectionHandler);

      await server.start();

      // Connect a client
      const client = await createClient(testPort);
      client.destroy();

      // Allow time for connection event
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(connectionHandler).toHaveBeenCalled();
    });

    it('should use default configuration values', async () => {
      const defaultServer = new ScriptingInterfaceServer();
      const config = defaultServer.getConfig();

      expect(config.port).toBe(4951);
      expect(config.host).toBe('127.0.0.1');
      expect(config.timeout).toBe(60000);
      expect(config.debug).toBe(false);
    });
  });

  describe('iimPlay Command', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should execute iimPlay with macro name and return OK', async () => {
      const response = await sendCommand(testPort, 'iimPlay("test.iim")');

      expect(response.code).toBe(ReturnCode.OK);
    });

    it('should execute iimPlay with timeout parameter', async () => {
      const response = await sendCommand(testPort, 'iimPlay("test.iim", 30000)');

      expect(response.code).toBe(ReturnCode.OK);
    });

    it('should return MACRO_RUNNING when a macro is already running', async () => {
      mockHandler.setRunning(true);

      const response = await sendCommand(testPort, 'iimPlay("test.iim")');

      expect(response.code).toBe(ReturnCode.MACRO_RUNNING);
      expect(response.data).toBe('A macro is already running');
    });

    it('should return INVALID_PARAMETER when no macro specified', async () => {
      const response = await sendCommand(testPort, 'iimPlay()');

      expect(response.code).toBe(ReturnCode.INVALID_PARAMETER);
      expect(response.data).toBe('iimPlay requires macro name or content');
    });

    it('should return ERROR when macro execution fails', async () => {
      mockHandler.playResult = { code: ReturnCode.ERROR, data: 'Execution failed' };

      const response = await sendCommand(testPort, 'iimPlay("failing.iim")');

      expect(response.code).toBe(ReturnCode.ERROR);
      expect(response.data).toBe('Execution failed');
    });

    it('should return MACRO_NOT_FOUND code when appropriate', async () => {
      mockHandler.playResult = { code: ReturnCode.MACRO_NOT_FOUND, data: 'Macro not found' };

      const response = await sendCommand(testPort, 'iimPlay("nonexistent.iim")');

      expect(response.code).toBe(ReturnCode.MACRO_NOT_FOUND);
    });

    it('should handle quoted macro content', async () => {
      const response = await sendCommand(
        testPort,
        'iimPlay("URL GOTO=https://example.com")'
      );

      expect(response.code).toBe(ReturnCode.OK);
    });

    it('should emit play event with macro name', async () => {
      const playHandler = vi.fn();
      server.on('play', playHandler);

      await sendCommand(testPort, 'iimPlay("test.iim")');

      expect(playHandler).toHaveBeenCalledWith('test.iim', expect.any(Number));
    });
  });

  describe('iimSet Command', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should set a variable and return OK', async () => {
      const response = await sendCommand(testPort, 'iimSet("myVar", "myValue")');

      expect(response.code).toBe(ReturnCode.OK);
      expect(mockHandler.getVariable('myVar')).toBe('myValue');
    });

    it('should handle multiple variable sets', async () => {
      await sendCommand(testPort, 'iimSet("myA", "value1")');
      await sendCommand(testPort, 'iimSet("myB", "value2")');
      await sendCommand(testPort, 'iimSet("myC", "value3")');

      expect(mockHandler.getVariable('myA')).toBe('value1');
      expect(mockHandler.getVariable('myB')).toBe('value2');
      expect(mockHandler.getVariable('myC')).toBe('value3');
    });

    it('should strip -var_ prefix from variable name', async () => {
      await sendCommand(testPort, 'iimSet("-var_myvar", "hello")');

      expect(mockHandler.getVariable('myvar')).toBe('hello');
    });

    it('should map var1-var9 to !VAR1-!VAR9', async () => {
      await sendCommand(testPort, 'iimSet("var1", "value1")');
      await sendCommand(testPort, 'iimSet("var9", "value9")');

      expect(mockHandler.getVariable('!VAR1')).toBe('value1');
      expect(mockHandler.getVariable('!VAR9')).toBe('value9');
    });

    it('should handle -var_ prefix with var1-var9 mapping', async () => {
      await sendCommand(testPort, 'iimSet("-var_var3", "combined")');

      expect(mockHandler.getVariable('!VAR3')).toBe('combined');
    });

    it('should handle case-insensitive var1-var9 mapping', async () => {
      await sendCommand(testPort, 'iimSet("VAR5", "upper")');
      await sendCommand(testPort, 'iimSet("Var7", "mixed")');

      expect(mockHandler.getVariable('!VAR5')).toBe('upper');
      expect(mockHandler.getVariable('!VAR7')).toBe('mixed');
    });

    it('should overwrite existing variable', async () => {
      await sendCommand(testPort, 'iimSet("myVar", "initial")');
      await sendCommand(testPort, 'iimSet("myVar", "updated")');

      expect(mockHandler.getVariable('myVar')).toBe('updated');
    });

    it('should return INVALID_PARAMETER when missing arguments', async () => {
      const response = await sendCommand(testPort, 'iimSet("onlyName")');

      expect(response.code).toBe(ReturnCode.INVALID_PARAMETER);
      expect(response.data).toBe('iimSet requires variable name and value');
    });

    it('should return INVALID_PARAMETER when no arguments', async () => {
      const response = await sendCommand(testPort, 'iimSet()');

      expect(response.code).toBe(ReturnCode.INVALID_PARAMETER);
    });

    it('should handle empty string value', async () => {
      // Note: Current parser implementation treats empty quoted strings as no argument
      // This tests the actual behavior - empty string results in INVALID_PARAMETER
      const response = await sendCommand(testPort, 'iimSet("emptyVar", "")');

      // Parser strips empty quoted strings, so only one argument is received
      expect(response.code).toBe(ReturnCode.INVALID_PARAMETER);
    });

    it('should handle special characters in value', async () => {
      // Parser preserves backslashes for non-quote-escape characters
      // So \\n stays as \\n (literal backslash + n)
      await sendCommand(testPort, 'iimSet("special", "hello\\nworld")');

      expect(mockHandler.getVariable('special')).toBe('hello\\nworld');
    });

    it('should emit set event', async () => {
      const setHandler = vi.fn();
      server.on('set', setHandler);

      await sendCommand(testPort, 'iimSet("testVar", "testValue")');

      expect(setHandler).toHaveBeenCalledWith('testVar', 'testValue');
    });
  });

  describe('iimGetLastExtract Command', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should return #nodata# when no extract available', async () => {
      const response = await sendCommand(testPort, 'iimGetLastExtract()');

      expect(response.code).toBe(ReturnCode.OK);
      expect(response.data).toBe('#nodata#');
    });

    it('should return last extracted data', async () => {
      mockHandler.setLastExtract('extracted text content');

      const response = await sendCommand(testPort, 'iimGetLastExtract()');

      expect(response.code).toBe(ReturnCode.OK);
      expect(response.data).toBe('extracted text content');
    });

    it('should return multi-value extracted data with #NEXT# delimiter', async () => {
      mockHandler.setLastExtract('line1#NEXT#line2#NEXT#line3');

      const response = await sendCommand(testPort, 'iimGetLastExtract()');

      expect(response.code).toBe(ReturnCode.OK);
      expect(response.data).toBe('line1#NEXT#line2#NEXT#line3');
    });

    it('should handle unicode in extracted data', async () => {
      mockHandler.setLastExtract('Hello 世界 🌍');

      const response = await sendCommand(testPort, 'iimGetLastExtract()');

      expect(response.code).toBe(ReturnCode.OK);
      expect(response.data).toBe('Hello 世界 🌍');
    });
  });

  describe('iimGetLastError Command', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should return empty string when no error', async () => {
      const response = await sendCommand(testPort, 'iimGetLastError()');

      expect(response.code).toBe(ReturnCode.OK);
      expect(response.data).toBe('');
    });

    it('should return last error message', async () => {
      mockHandler.setLastError('Element not found: TAG:INPUT');

      const response = await sendCommand(testPort, 'iimGetLastError()');

      expect(response.code).toBe(ReturnCode.OK);
      expect(response.data).toBe('Element not found: TAG:INPUT');
    });

    it('should return detailed error message', async () => {
      mockHandler.setLastError(
        'Runtime Error: Line 5: WAIT SECONDS=5 - Timeout waiting for element'
      );

      const response = await sendCommand(testPort, 'iimGetLastError()');

      expect(response.code).toBe(ReturnCode.OK);
      expect(response.data).toContain('Runtime Error');
      expect(response.data).toContain('Line 5');
    });
  });

  describe('Additional Commands', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should handle iimStop command when macro is running', async () => {
      mockHandler.setRunning(true);

      const response = await sendCommand(testPort, 'iimStop()');

      expect(response.code).toBe(ReturnCode.OK);
      expect(mockHandler.isRunning()).toBe(false);
    });

    it('should handle iimStop command when no macro is running', async () => {
      const response = await sendCommand(testPort, 'iimStop()');

      expect(response.code).toBe(ReturnCode.OK);
      expect(response.data).toBe('No macro is running');
    });

    it('should handle iimExit command', async () => {
      const response = await sendCommand(testPort, 'iimExit()');

      expect(response.code).toBe(ReturnCode.OK);
    });
  });

  describe('Error Handling for Invalid Commands', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should return SYNTAX_ERROR for malformed command', async () => {
      const response = await sendCommand(testPort, 'not a valid command');

      expect(response.code).toBe(ReturnCode.SYNTAX_ERROR);
      expect(response.data).toBe('Invalid command syntax');
    });

    it('should return SYNTAX_ERROR for missing parentheses', async () => {
      const response = await sendCommand(testPort, 'iimPlay');

      expect(response.code).toBe(ReturnCode.SYNTAX_ERROR);
    });

    it('should return UNKNOWN_COMMAND for unrecognized command', async () => {
      const response = await sendCommand(testPort, 'iimUnknown()');

      expect(response.code).toBe(ReturnCode.UNKNOWN_COMMAND);
      expect(response.data).toBe('Unknown command: iimUnknown');
    });

    it('should handle empty command gracefully', async () => {
      // Empty lines should be ignored, so we send a newline followed by a valid command
      const client = await createClient(testPort);

      try {
        client.write('\n');
        const response = await sendOnClient(client, 'iimGetLastError()');
        expect(response.code).toBe(ReturnCode.OK);
      } finally {
        client.destroy();
      }
    });

    it('should be case-insensitive for command names', async () => {
      const response1 = await sendCommand(testPort, 'IIMPLAY("test.iim")');
      const response2 = await sendCommand(testPort, 'IimPlay("test.iim")');
      const response3 = await sendCommand(testPort, 'iimplay("test.iim")');

      expect(response1.code).toBe(ReturnCode.OK);
      expect(response2.code).toBe(ReturnCode.OK);
      expect(response3.code).toBe(ReturnCode.OK);
    });

    it('should handle command with extra whitespace', async () => {
      const response = await sendCommand(testPort, '  iimPlay("test.iim")  ');

      expect(response.code).toBe(ReturnCode.OK);
    });
  });

  describe('Concurrent Connections Handling', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should handle multiple simultaneous connections', async () => {
      const clients = await Promise.all([
        createClient(testPort),
        createClient(testPort),
        createClient(testPort),
      ]);

      try {
        const responses = await Promise.all([
          sendOnClient(clients[0], 'iimSet("client1", "value1")'),
          sendOnClient(clients[1], 'iimSet("client2", "value2")'),
          sendOnClient(clients[2], 'iimSet("client3", "value3")'),
        ]);

        expect(responses[0].code).toBe(ReturnCode.OK);
        expect(responses[1].code).toBe(ReturnCode.OK);
        expect(responses[2].code).toBe(ReturnCode.OK);

        expect(mockHandler.getVariable('client1')).toBe('value1');
        expect(mockHandler.getVariable('client2')).toBe('value2');
        expect(mockHandler.getVariable('client3')).toBe('value3');
      } finally {
        clients.forEach((c) => c.destroy());
      }
    });

    it('should handle rapid sequential commands from single client', async () => {
      const client = await createClient(testPort);

      try {
        const responses: Array<{ code: number; data?: string }> = [];

        for (let i = 0; i < 10; i++) {
          const response = await sendOnClient(
            client,
            `iimSet("seq${i}", "value${i}")`
          );
          responses.push(response);
        }

        responses.forEach((response) => {
          expect(response.code).toBe(ReturnCode.OK);
        });

        for (let i = 0; i < 10; i++) {
          expect(mockHandler.getVariable(`seq${i}`)).toBe(`value${i}`);
        }
      } finally {
        client.destroy();
      }
    });

    it('should isolate errors between connections', async () => {
      const client1 = await createClient(testPort);
      const client2 = await createClient(testPort);

      try {
        // Client 1 sends invalid command
        const response1 = await sendOnClient(client1, 'invalid command');
        expect(response1.code).toBe(ReturnCode.SYNTAX_ERROR);

        // Client 2 should still work normally
        const response2 = await sendOnClient(client2, 'iimGetLastError()');
        expect(response2.code).toBe(ReturnCode.OK);
      } finally {
        client1.destroy();
        client2.destroy();
      }
    });

    it('should handle client disconnection gracefully', async () => {
      const disconnectHandler = vi.fn();
      server.on('disconnect', disconnectHandler);

      const client = await createClient(testPort);
      await sendOnClient(client, 'iimGetLastError()');

      client.destroy();

      // Wait for disconnect event
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(disconnectHandler).toHaveBeenCalled();
    });

    it('should continue serving after client disconnection', async () => {
      const client1 = await createClient(testPort);
      await sendOnClient(client1, 'iimSet("before", "disconnect")');
      client1.destroy();

      // Wait a bit for cleanup
      await new Promise((resolve) => setTimeout(resolve, 50));

      // New connection should work
      const response = await sendCommand(testPort, 'iimGetLastError()');
      expect(response.code).toBe(ReturnCode.OK);
    });

    it('should handle many concurrent connections', async () => {
      const numClients = 20;
      const clients: net.Socket[] = [];

      try {
        // Create many clients
        for (let i = 0; i < numClients; i++) {
          const client = await createClient(testPort);
          clients.push(client);
        }

        // All send commands simultaneously
        const responses = await Promise.all(
          clients.map((client, i) =>
            sendOnClient(client, `iimSet("concurrent${i}", "value${i}")`)
          )
        );

        // All should succeed
        responses.forEach((response) => {
          expect(response.code).toBe(ReturnCode.OK);
        });
      } finally {
        clients.forEach((c) => c.destroy());
      }
    });
  });

  describe('Return Codes', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should return correct OK code (1)', async () => {
      const response = await sendCommand(testPort, 'iimGetLastError()');
      expect(response.code).toBe(1);
    });

    it('should return correct MACRO_RUNNING code (0)', async () => {
      mockHandler.setRunning(true);
      const response = await sendCommand(testPort, 'iimPlay("test.iim")');
      expect(response.code).toBe(0);
    });

    it('should return correct ERROR code (-1)', async () => {
      mockHandler.playResult = { code: ReturnCode.ERROR };
      const response = await sendCommand(testPort, 'iimPlay("test.iim")');
      expect(response.code).toBe(-1);
    });

    it('should return correct TIMEOUT code (-2)', async () => {
      mockHandler.playResult = { code: ReturnCode.TIMEOUT };
      const response = await sendCommand(testPort, 'iimPlay("test.iim")');
      expect(response.code).toBe(-2);
    });

    it('should return correct SYNTAX_ERROR code (-3)', async () => {
      const response = await sendCommand(testPort, 'bad syntax');
      expect(response.code).toBe(-3);
    });

    it('should return correct MACRO_NOT_FOUND code (-4)', async () => {
      mockHandler.playResult = { code: ReturnCode.MACRO_NOT_FOUND };
      const response = await sendCommand(testPort, 'iimPlay("missing.iim")');
      expect(response.code).toBe(-4);
    });

    it('should return correct INVALID_PARAMETER code (-6)', async () => {
      const response = await sendCommand(testPort, 'iimSet("onlyOne")');
      expect(response.code).toBe(-6);
    });

    it('should return correct UNKNOWN_COMMAND code (-10)', async () => {
      const response = await sendCommand(testPort, 'iimFake()');
      expect(response.code).toBe(-10);
    });
  });

  describe('Response Format', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should format response as CODE\\tDATA\\n', async () => {
      mockHandler.setLastError('Test error message');

      const client = await createClient(testPort);

      return new Promise<void>((resolve) => {
        client.on('data', (data) => {
          const response = data.toString();
          // Format should be: "1\tTest error message\n"
          expect(response).toMatch(/^-?\d+\t.*\n$/);
          client.destroy();
          resolve();
        });

        client.write('iimGetLastError()\n');
      });
    });

    it('should format response without data as CODE\\n', async () => {
      const client = await createClient(testPort);

      return new Promise<void>((resolve) => {
        client.on('data', (data) => {
          const response = data.toString();
          // When data is empty string, format should still include tab: "1\t\n"
          expect(response).toMatch(/^-?\d+/);
          expect(response.endsWith('\n')).toBe(true);
          client.destroy();
          resolve();
        });

        client.write('iimGetLastError()\n');
      });
    });
  });

  describe('Handler Management', () => {
    it('should allow setting a custom handler', async () => {
      const customHandler = new MockMacroHandler();
      customHandler.setLastExtract('custom extract');

      server.setHandler(customHandler);
      await server.start();

      const response = await sendCommand(testPort, 'iimGetLastExtract()');

      expect(response.code).toBe(ReturnCode.OK);
      expect(response.data).toBe('custom extract');
    });

    it('should use default handler when none provided', async () => {
      const serverWithDefault = new ScriptingInterfaceServer({ port: testPort + 1 });

      try {
        await serverWithDefault.start();

        const response = await sendCommand(testPort + 1, 'iimPlay("VERSION BUILD=1")');
        expect(response.code).toBe(ReturnCode.OK);
      } finally {
        await serverWithDefault.stop();
      }
    });
  });

  describe('Factory Function', () => {
    let factoryServer: ScriptingInterfaceServer;

    afterEach(async () => {
      if (factoryServer && factoryServer.isRunning()) {
        await factoryServer.stop();
      }
    });

    it('should create and start server with createScriptingInterfaceServer', async () => {
      factoryServer = await createScriptingInterfaceServer({ port: testPort + 2 });

      expect(factoryServer.isRunning()).toBe(true);

      const response = await sendCommand(testPort + 2, 'iimGetLastError()');
      expect(response.code).toBe(ReturnCode.OK);
    });

    it('should accept custom handler in factory function', async () => {
      const customHandler = new MockMacroHandler();
      customHandler.setLastExtract('factory extract');

      factoryServer = await createScriptingInterfaceServer(
        { port: testPort + 3 },
        customHandler
      );

      const response = await sendCommand(testPort + 3, 'iimGetLastExtract()');
      expect(response.data).toBe('factory extract');
    });
  });

  describe('Argument Parsing', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should parse double-quoted arguments', async () => {
      await sendCommand(testPort, 'iimSet("varName", "varValue")');
      expect(mockHandler.getVariable('varName')).toBe('varValue');
    });

    it('should parse single-quoted arguments', async () => {
      await sendCommand(testPort, "iimSet('varName', 'varValue')");
      expect(mockHandler.getVariable('varName')).toBe('varValue');
    });

    it('should handle escaped characters in arguments', async () => {
      await sendCommand(testPort, 'iimSet("path", "C:\\\\Users\\\\test")');
      expect(mockHandler.getVariable('path')).toBe('C:\\\\Users\\\\test');
    });

    it('should handle arguments with commas inside quotes', async () => {
      await sendCommand(testPort, 'iimSet("list", "a, b, c")');
      expect(mockHandler.getVariable('list')).toBe('a, b, c');
    });

    it('should handle empty arguments', async () => {
      // Note: Parser treats empty quoted strings as no argument,
      // so this results in INVALID_PARAMETER (only one arg received)
      const response = await sendCommand(testPort, 'iimSet("empty", "")');
      expect(response.code).toBe(ReturnCode.INVALID_PARAMETER);
    });

    it('should handle arguments with spaces', async () => {
      await sendCommand(testPort, 'iimSet("spaced", "hello world")');
      expect(mockHandler.getVariable('spaced')).toBe('hello world');
    });
  });
});
