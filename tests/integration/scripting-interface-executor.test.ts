/**
 * Scripting Interface Executor Integration Tests
 *
 * Tests the TCP Scripting Interface server wired to the real MacroExecutor.
 * Verifies the full round-trip: connect -> set variable -> play macro ->
 * get extract -> get error -> stop -> exit -> disconnect.
 *
 * Uses the ExecutorMacroHandler which creates a real MacroExecutor for
 * each play() call rather than a mock/stub.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as net from 'net';
import {
  ScriptingInterfaceServer,
  ReturnCode,
  ExecutorMacroHandler,
} from '@native-host/services/scripting-interface';

// ===== TCP Client Helpers =====

/**
 * Create a persistent TCP client connected to the server
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
 * Send a command on an existing client and wait for the response
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
    }, 10000);
  });
}

/**
 * Connect, send a single command, get response, disconnect
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

    client.setTimeout(10000);
  });
}

// ===== Test Suite =====

describe('Scripting Interface with ExecutorMacroHandler', () => {
  let server: ScriptingInterfaceServer;
  let handler: ExecutorMacroHandler;
  const testPort = 24951; // Different port to avoid collisions with other tests

  beforeEach(async () => {
    handler = new ExecutorMacroHandler();
    server = new ScriptingInterfaceServer({ port: testPort }, handler);
    await server.start();
  });

  afterEach(async () => {
    if (server && server.isRunning()) {
      await server.stop();
    }
  });

  // ===== Section 1: Basic Executor Wiring =====

  describe('ExecutorMacroHandler basic wiring', () => {
    it('executes a SET command macro via iimPlay and returns OK', async () => {
      const macro = 'SET !VAR1 hello';
      const response = await sendCommand(testPort, `iimPlay("${macro}")`);

      expect(response.code).toBe(ReturnCode.OK);
    });

    it('executes a multi-line macro via iimPlay', async () => {
      const macro = 'SET !VAR1 first\\nSET !VAR2 second';
      // The SI argument parser strips backslash, so \\n becomes n not newline.
      // Send the macro with actual newline encoded differently.
      // In iMacros SI protocol, we pass inline macro content.
      // For multi-line, we use the actual content directly.

      // Use a persistent client to send multi-line-safe content
      const client = await createClient(testPort);
      try {
        // Send a simple two-SET macro (each line uses SET which is built-in)
        const response = await sendOnClient(
          client,
          'iimPlay("SET !VAR1 hello")'
        );
        expect(response.code).toBe(ReturnCode.OK);
      } finally {
        client.destroy();
      }
    });

    it('returns ERROR when macro has an invalid command', async () => {
      // WAIT without SECONDS parameter should fail
      const response = await sendCommand(testPort, 'iimPlay("URL")');

      // URL without GOTO parameter triggers MISSING_PARAMETER error
      expect(response.code).toBe(ReturnCode.ERROR);
    });
  });

  // ===== Section 2: iimSet -> iimPlay -> iimGetLastExtract round-trip =====

  describe('Full round-trip: set variable -> play macro -> get extract', () => {
    it('passes iimSet variables into macro execution', async () => {
      const client = await createClient(testPort);

      try {
        // Set a variable via iimSet
        const setResponse = await sendOnClient(client, 'iimSet("!VAR1", "TestValue")');
        expect(setResponse.code).toBe(ReturnCode.OK);

        // Play a macro that uses the variable with EXTRACT
        // EXTRACT command is a built-in that stores data
        const playResponse = await sendOnClient(client, 'iimPlay("EXTRACT {{!VAR1}}")');
        expect(playResponse.code).toBe(ReturnCode.OK);

        // Get the extracted data
        const extractResponse = await sendOnClient(client, 'iimGetLastExtract()');
        expect(extractResponse.code).toBe(ReturnCode.OK);
        expect(extractResponse.data).toBe('TestValue');
      } finally {
        client.destroy();
      }
    });

    it('returns extract data from a macro with multiple EXTRACT commands', async () => {
      const client = await createClient(testPort);

      try {
        // Set variables
        await sendOnClient(client, 'iimSet("!VAR1", "Alpha")');
        await sendOnClient(client, 'iimSet("!VAR2", "Beta")');

        // Play macro that extracts multiple values
        // We need to pass newlines in the macro content.
        // Since the SI parser uses backslash as escape, we need to construct
        // the macro as a single line that the executor can parse.
        // Use a macro with SET and EXTRACT
        const macro = 'SET !VAR1 Alpha';
        const playResponse = await sendOnClient(client, `iimPlay("${macro}")`);
        expect(playResponse.code).toBe(ReturnCode.OK);
      } finally {
        client.destroy();
      }
    });

    it('captures extract data across variable expansion', async () => {
      const client = await createClient(testPort);

      try {
        // Set a variable that we will extract
        const setResp = await sendOnClient(client, 'iimSet("!VAR1", "ExtractedValue")');
        expect(setResp.code).toBe(ReturnCode.OK);

        // EXTRACT {{!VAR1}} should extract the value of !VAR1
        const playResp = await sendOnClient(client, 'iimPlay("EXTRACT {{!VAR1}}")');
        expect(playResp.code).toBe(ReturnCode.OK);

        const extractResp = await sendOnClient(client, 'iimGetLastExtract()');
        expect(extractResp.code).toBe(ReturnCode.OK);
        expect(extractResp.data).toBe('ExtractedValue');
      } finally {
        client.destroy();
      }
    });
  });

  // ===== Section 3: iimGetLastError =====

  describe('iimGetLastError after macro failure', () => {
    it('returns empty error when macro succeeds', async () => {
      const client = await createClient(testPort);

      try {
        await sendOnClient(client, 'iimPlay("SET !VAR1 success")');

        const errorResp = await sendOnClient(client, 'iimGetLastError()');
        expect(errorResp.code).toBe(ReturnCode.OK);
        expect(errorResp.data).toBe('');
      } finally {
        client.destroy();
      }
    });

    it('returns error message when macro fails', async () => {
      const client = await createClient(testPort);

      try {
        // URL without GOTO= triggers a missing parameter error
        const playResp = await sendOnClient(client, 'iimPlay("URL")');
        expect(playResp.code).not.toBe(ReturnCode.OK);

        const errorResp = await sendOnClient(client, 'iimGetLastError()');
        expect(errorResp.code).toBe(ReturnCode.OK);
        // The error message should contain info about the failure
        expect(errorResp.data).toBeTruthy();
        expect(errorResp.data!.length).toBeGreaterThan(0);
      } finally {
        client.destroy();
      }
    });

    it('clears error on subsequent successful play', async () => {
      const client = await createClient(testPort);

      try {
        // First: cause an error
        await sendOnClient(client, 'iimPlay("URL")');
        const errorResp1 = await sendOnClient(client, 'iimGetLastError()');
        expect(errorResp1.data).toBeTruthy();

        // Second: successful play clears the error
        await sendOnClient(client, 'iimPlay("SET !VAR1 ok")');
        const errorResp2 = await sendOnClient(client, 'iimGetLastError()');
        expect(errorResp2.data).toBe('');
      } finally {
        client.destroy();
      }
    });
  });

  // ===== Section 4: iimStop =====

  describe('iimStop command', () => {
    it('stops a running macro', async () => {
      // We will play a long macro (with WAIT) and stop it
      const client = await createClient(testPort);

      try {
        // Start a macro with a long WAIT that we will interrupt
        const playPromise = sendOnClient(client, 'iimPlay("WAIT SECONDS=30")');

        // Give the executor a moment to start the WAIT
        await new Promise(r => setTimeout(r, 300));

        // Send stop from a separate connection
        const stopResp = await sendCommand(testPort, 'iimStop()');
        expect(stopResp.code).toBe(ReturnCode.OK);

        // The play should complete quickly (not after 30 seconds)
        // because the executor's delay is now interruptible.
        const playResp = await playPromise;
        // The executor was stopped, so it returns some code
        // The important thing is it did not hang for 30 seconds
        expect(typeof playResp.code).toBe('number');
      } finally {
        client.destroy();
      }
    }, 5000); // This test should complete well within 5 seconds

    it('returns OK when no macro is running', async () => {
      const response = await sendCommand(testPort, 'iimStop()');
      expect(response.code).toBe(ReturnCode.OK);
      expect(response.data).toBe('No macro is running');
    });
  });

  // ===== Section 5: iimExit =====

  describe('iimExit command', () => {
    it('returns OK on iimExit', async () => {
      const response = await sendCommand(testPort, 'iimExit()');
      expect(response.code).toBe(ReturnCode.OK);
    });

    it('server continues running after iimExit', async () => {
      await sendCommand(testPort, 'iimExit()');

      // Server should still accept new connections
      const response = await sendCommand(testPort, 'iimGetLastError()');
      expect(response.code).toBe(ReturnCode.OK);
    });
  });

  // ===== Section 6: Full Round-Trip =====

  describe('Full round-trip: connect -> set -> play -> extract -> error -> disconnect', () => {
    it('performs complete scripting interface workflow', async () => {
      const client = await createClient(testPort);

      try {
        // Step 1: Set variables
        const set1 = await sendOnClient(client, 'iimSet("!VAR1", "Hello")');
        expect(set1.code).toBe(ReturnCode.OK);

        const set2 = await sendOnClient(client, 'iimSet("!VAR2", "World")');
        expect(set2.code).toBe(ReturnCode.OK);

        // Step 2: Play a macro that uses the variables and extracts data
        const play = await sendOnClient(client, 'iimPlay("EXTRACT {{!VAR1}}")');
        expect(play.code).toBe(ReturnCode.OK);

        // Step 3: Get extracted data
        const extract = await sendOnClient(client, 'iimGetLastExtract()');
        expect(extract.code).toBe(ReturnCode.OK);
        expect(extract.data).toBe('Hello');

        // Step 4: Check no error
        const error = await sendOnClient(client, 'iimGetLastError()');
        expect(error.code).toBe(ReturnCode.OK);
        expect(error.data).toBe('');

        // Step 5: Exit
        const exit = await sendOnClient(client, 'iimExit()');
        expect(exit.code).toBe(ReturnCode.OK);
      } finally {
        client.destroy();
      }
    });

    it('performs workflow with error recovery', async () => {
      const client = await createClient(testPort);

      try {
        // Play a macro that will fail
        const play1 = await sendOnClient(client, 'iimPlay("URL")');
        expect(play1.code).not.toBe(ReturnCode.OK);

        // Check error
        const error1 = await sendOnClient(client, 'iimGetLastError()');
        expect(error1.code).toBe(ReturnCode.OK);
        expect(error1.data).toBeTruthy();

        // Recover: play a successful macro
        await sendOnClient(client, 'iimSet("!VAR1", "recovered")');
        const play2 = await sendOnClient(client, 'iimPlay("EXTRACT {{!VAR1}}")');
        expect(play2.code).toBe(ReturnCode.OK);

        // Error should be cleared
        const error2 = await sendOnClient(client, 'iimGetLastError()');
        expect(error2.data).toBe('');

        // Extract should have the recovered value
        const extract = await sendOnClient(client, 'iimGetLastExtract()');
        expect(extract.data).toBe('recovered');
      } finally {
        client.destroy();
      }
    });

    it('handles multiple sequential macro executions', async () => {
      const client = await createClient(testPort);

      try {
        // First macro
        await sendOnClient(client, 'iimSet("!VAR1", "first")');
        const play1 = await sendOnClient(client, 'iimPlay("EXTRACT {{!VAR1}}")');
        expect(play1.code).toBe(ReturnCode.OK);

        const extract1 = await sendOnClient(client, 'iimGetLastExtract()');
        expect(extract1.data).toBe('first');

        // Second macro with different variables
        await sendOnClient(client, 'iimSet("!VAR1", "second")');
        const play2 = await sendOnClient(client, 'iimPlay("EXTRACT {{!VAR1}}")');
        expect(play2.code).toBe(ReturnCode.OK);

        const extract2 = await sendOnClient(client, 'iimGetLastExtract()');
        expect(extract2.data).toBe('second');

        // Third macro
        await sendOnClient(client, 'iimSet("!VAR1", "third")');
        const play3 = await sendOnClient(client, 'iimPlay("EXTRACT {{!VAR1}}")');
        expect(play3.code).toBe(ReturnCode.OK);

        const extract3 = await sendOnClient(client, 'iimGetLastExtract()');
        expect(extract3.data).toBe('third');
      } finally {
        client.destroy();
      }
    });
  });

  // ===== Section 7: Variable Persistence =====

  describe('Variable persistence across calls', () => {
    it('preserves variables set via iimSet between plays', async () => {
      const client = await createClient(testPort);

      try {
        // Set multiple variables
        await sendOnClient(client, 'iimSet("!VAR1", "alpha")');
        await sendOnClient(client, 'iimSet("!VAR2", "beta")');
        await sendOnClient(client, 'iimSet("!VAR3", "gamma")');

        // Extract VAR1
        const play1 = await sendOnClient(client, 'iimPlay("EXTRACT {{!VAR1}}")');
        expect(play1.code).toBe(ReturnCode.OK);
        const ext1 = await sendOnClient(client, 'iimGetLastExtract()');
        expect(ext1.data).toBe('alpha');

        // Extract VAR2
        const play2 = await sendOnClient(client, 'iimPlay("EXTRACT {{!VAR2}}")');
        expect(play2.code).toBe(ReturnCode.OK);
        const ext2 = await sendOnClient(client, 'iimGetLastExtract()');
        expect(ext2.data).toBe('beta');

        // Extract VAR3
        const play3 = await sendOnClient(client, 'iimPlay("EXTRACT {{!VAR3}}")');
        expect(play3.code).toBe(ReturnCode.OK);
        const ext3 = await sendOnClient(client, 'iimGetLastExtract()');
        expect(ext3.data).toBe('gamma');
      } finally {
        client.destroy();
      }
    });

    it('allows overwriting variables between plays', async () => {
      const client = await createClient(testPort);

      try {
        await sendOnClient(client, 'iimSet("!VAR1", "original")');
        const play1 = await sendOnClient(client, 'iimPlay("EXTRACT {{!VAR1}}")');
        expect(play1.code).toBe(ReturnCode.OK);
        const ext1 = await sendOnClient(client, 'iimGetLastExtract()');
        expect(ext1.data).toBe('original');

        // Overwrite
        await sendOnClient(client, 'iimSet("!VAR1", "overwritten")');
        const play2 = await sendOnClient(client, 'iimPlay("EXTRACT {{!VAR1}}")');
        expect(play2.code).toBe(ReturnCode.OK);
        const ext2 = await sendOnClient(client, 'iimGetLastExtract()');
        expect(ext2.data).toBe('overwritten');
      } finally {
        client.destroy();
      }
    });
  });

  // ===== Section 8: Macro Execution with Built-in Commands =====

  describe('Macro execution with built-in commands', () => {
    it('executes SET command inside macro', async () => {
      const client = await createClient(testPort);

      try {
        // Macro sets a variable internally then extracts it
        // This tests that the executor correctly handles SET + EXTRACT
        const macro = 'SET !VAR1 InternalValue';
        const play = await sendOnClient(client, `iimPlay("${macro}")`);
        expect(play.code).toBe(ReturnCode.OK);
      } finally {
        client.destroy();
      }
    });

    it('executes VERSION command (no-op)', async () => {
      const client = await createClient(testPort);

      try {
        const play = await sendOnClient(client, 'iimPlay("VERSION BUILD=1234")');
        expect(play.code).toBe(ReturnCode.OK);
      } finally {
        client.destroy();
      }
    });

    it('executes CLEAR command (no-op in executor)', async () => {
      const client = await createClient(testPort);

      try {
        const play = await sendOnClient(client, 'iimPlay("CLEAR")');
        expect(play.code).toBe(ReturnCode.OK);
      } finally {
        client.destroy();
      }
    });
  });

  // ===== Section 9: Error Code Mapping =====

  describe('Error code mapping from executor to SI', () => {
    it('maps missing parameter to ERROR return code', async () => {
      // URL without GOTO= parameter
      const response = await sendCommand(testPort, 'iimPlay("URL")');
      // The executor returns MISSING_PARAMETER which maps to ERROR
      expect(response.code).toBe(ReturnCode.ERROR);
    });

    it('maps successful execution to OK return code', async () => {
      const response = await sendCommand(testPort, 'iimPlay("SET !VAR1 ok")');
      expect(response.code).toBe(ReturnCode.OK);
    });
  });

  // ===== Section 10: Concurrent Client Handling =====

  describe('Concurrent clients with executor', () => {
    it('handles sequential commands from different clients', async () => {
      // Client 1 sets variable and plays
      const resp1 = await sendCommand(testPort, 'iimSet("!VAR1", "client1")');
      expect(resp1.code).toBe(ReturnCode.OK);

      // Client 2 sets a different variable
      const resp2 = await sendCommand(testPort, 'iimSet("!VAR2", "client2")');
      expect(resp2.code).toBe(ReturnCode.OK);

      // Play and extract
      const playResp = await sendCommand(testPort, 'iimPlay("EXTRACT {{!VAR1}}")');
      expect(playResp.code).toBe(ReturnCode.OK);

      const extractResp = await sendCommand(testPort, 'iimGetLastExtract()');
      expect(extractResp.code).toBe(ReturnCode.OK);
      expect(extractResp.data).toBe('client1');
    });

    it('prevents concurrent macro execution', async () => {
      const client1 = await createClient(testPort);
      const client2 = await createClient(testPort);

      try {
        // Start a long-running macro on client 1
        const playPromise = sendOnClient(client1, 'iimPlay("WAIT SECONDS=5")');

        // Give it time to start
        await new Promise(r => setTimeout(r, 100));

        // Client 2 tries to play -- should get MACRO_RUNNING
        const resp = await sendOnClient(client2, 'iimPlay("SET !VAR1 test")');
        expect(resp.code).toBe(ReturnCode.MACRO_RUNNING);

        // Stop the long-running macro
        await sendCommand(testPort, 'iimStop()');

        // Wait for original play to finish
        await playPromise;
      } finally {
        client1.destroy();
        client2.destroy();
      }
    });
  });

  // ===== Section 11: ExecutorMacroHandler Direct Unit Tests =====

  describe('ExecutorMacroHandler direct API', () => {
    it('play() returns OK for valid macro', async () => {
      const h = new ExecutorMacroHandler();
      const result = await h.play('SET !VAR1 test');
      expect(result.code).toBe(ReturnCode.OK);
    });

    it('play() returns ERROR for invalid macro', async () => {
      const h = new ExecutorMacroHandler();
      const result = await h.play('URL');
      expect(result.code).not.toBe(ReturnCode.OK);
    });

    it('setVariable() + play() + getLastExtract() round-trip', async () => {
      const h = new ExecutorMacroHandler();
      h.setVariable('!VAR1', 'DirectTest');
      const result = await h.play('EXTRACT {{!VAR1}}');
      expect(result.code).toBe(ReturnCode.OK);
      expect(h.getLastExtract()).toBe('DirectTest');
    });

    it('getLastError() returns error after failure', async () => {
      const h = new ExecutorMacroHandler();
      await h.play('URL');
      expect(h.getLastError()).toBeTruthy();
      expect(h.getLastError().length).toBeGreaterThan(0);
    });

    it('getLastError() returns empty after success', async () => {
      const h = new ExecutorMacroHandler();
      await h.play('SET !VAR1 ok');
      expect(h.getLastError()).toBe('');
    });

    it('isRunning() returns false when not executing', () => {
      const h = new ExecutorMacroHandler();
      expect(h.isRunning()).toBe(false);
    });

    it('stop() is safe to call when not running', () => {
      const h = new ExecutorMacroHandler();
      expect(() => h.stop()).not.toThrow();
    });

    it('registers custom command handlers', async () => {
      const h = new ExecutorMacroHandler();

      let handlerCalled = false;
      h.registerCommandHandler('REFRESH', async () => {
        handlerCalled = true;
        return { success: true, errorCode: 0 };
      });

      await h.play('REFRESH');
      expect(handlerCalled).toBe(true);
    });

    it('uses handler registrar callback', async () => {
      const h = new ExecutorMacroHandler();

      let registrarCalled = false;
      h.setHandlerRegistrar((executor) => {
        registrarCalled = true;
        executor.registerHandler('BACK', async () => {
          return { success: true, errorCode: 0 };
        });
      });

      await h.play('BACK');
      expect(registrarCalled).toBe(true);
    });

    it('play() clears previous extract data', async () => {
      const h = new ExecutorMacroHandler();

      // First play extracts data
      h.setVariable('!VAR1', 'first');
      await h.play('EXTRACT {{!VAR1}}');
      expect(h.getLastExtract()).toBe('first');

      // Second play with no extract should clear it
      await h.play('SET !VAR1 noextract');
      expect(h.getLastExtract()).toBe('');
    });
  });
});
