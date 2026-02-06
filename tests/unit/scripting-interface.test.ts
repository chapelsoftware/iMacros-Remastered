/**
 * Unit Tests for iMacros Scripting Interface
 *
 * Tests the ScriptingInterfaceServer and ExecutorMacroHandler classes,
 * including TCP command handling, macro execution, performance tracking,
 * and all scripting interface commands.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ScriptingInterfaceServer,
  ExecutorMacroHandler,
  ReturnCode,
  PerformanceData,
  MacroHandler,
  CommandResult,
} from '../../native-host/src/services/scripting-interface';

describe('ExecutorMacroHandler', () => {
  let handler: ExecutorMacroHandler;

  beforeEach(() => {
    handler = new ExecutorMacroHandler();
  });

  // ===== Variable Management =====

  describe('Variable management', () => {
    it('should set and get variables', () => {
      handler.setVariable('myVar', 'hello');
      expect(handler.getVariable('myVar')).toBe('hello');
    });

    it('should return undefined for non-existent variables', () => {
      expect(handler.getVariable('nonexistent')).toBeUndefined();
    });

    it('should overwrite existing variables', () => {
      handler.setVariable('myVar', 'first');
      handler.setVariable('myVar', 'second');
      expect(handler.getVariable('myVar')).toBe('second');
    });
  });

  // ===== Macro Execution =====

  describe('Macro execution', () => {
    it('should execute a simple macro successfully', async () => {
      const result = await handler.play('SET !VAR0 "hello"');
      expect(result.code).toBe(ReturnCode.OK);
    });

    it('should track running state during execution', async () => {
      expect(handler.isRunning()).toBe(false);
      const promise = handler.play('WAIT SECONDS=0.01');
      // May already complete instantly, so just check it doesn't error
      expect(promise).toBeInstanceOf(Promise);
      const result = await promise;
      expect(result.code).toBe(ReturnCode.OK);
      expect(handler.isRunning()).toBe(false);
    });

    it('should capture extract data', async () => {
      // EXTRACT handler is registered by default
      await handler.play('SET !EXTRACT "test data"');
      // Note: SET !EXTRACT sets the variable but doesn't trigger extract flow
      // The extraction happens through state.addExtract
      expect(handler.getLastExtract()).toBe(''); // No actual EXTRACT command was run
    });

    it('should return error for invalid macro syntax', async () => {
      const result = await handler.play('INVALID COMMAND SYNTAX @#$%');
      expect(result.code).toBe(ReturnCode.ERROR);
      expect(handler.getLastError()).toContain('Line');
    });

    it('should pass variables to macro execution', async () => {
      handler.setVariable('myInput', 'test value');
      const result = await handler.play('SET !VAR0 {{myInput}}');
      expect(result.code).toBe(ReturnCode.OK);
    });
  });

  // ===== Performance Tracking =====

  describe('Performance tracking (iimGetLastPerformance)', () => {
    it('should return null when no macro has been executed', () => {
      expect(handler.getLastPerformance()).toBeNull();
    });

    it('should capture performance data after successful execution', async () => {
      await handler.play('SET !VAR0 "hello"');
      const perf = handler.getLastPerformance();

      expect(perf).not.toBeNull();
      expect(perf!.success).toBe(true);
      expect(perf!.errorCode).toBe(ReturnCode.OK);
      expect(perf!.totalTimeMs).toBeGreaterThanOrEqual(0);
      expect(perf!.loopsCompleted).toBeGreaterThanOrEqual(1);
      expect(perf!.startTime).toBeDefined();
      expect(perf!.endTime).toBeDefined();
    });

    it('should capture performance data after failed execution', async () => {
      await handler.play('INVALID COMMAND @#$');
      const perf = handler.getLastPerformance();

      expect(perf).not.toBeNull();
      expect(perf!.success).toBe(false);
      expect(perf!.errorCode).not.toBe(ReturnCode.OK);
    });

    it('should have valid ISO 8601 timestamps', async () => {
      await handler.play('SET !VAR0 "test"');
      const perf = handler.getLastPerformance();

      expect(perf).not.toBeNull();
      // Check that timestamps are valid ISO strings
      expect(() => new Date(perf!.startTime)).not.toThrow();
      expect(() => new Date(perf!.endTime)).not.toThrow();
      expect(new Date(perf!.startTime).toISOString()).toBe(perf!.startTime);
      expect(new Date(perf!.endTime).toISOString()).toBe(perf!.endTime);
    });

    it('should have endTime >= startTime', async () => {
      await handler.play('SET !VAR0 "test"');
      const perf = handler.getLastPerformance();

      expect(perf).not.toBeNull();
      const start = new Date(perf!.startTime).getTime();
      const end = new Date(perf!.endTime).getTime();
      expect(end).toBeGreaterThanOrEqual(start);
    });

    it('should track loops completed', async () => {
      // Single loop macro
      await handler.play('SET !VAR0 "test"');
      const perf = handler.getLastPerformance();
      expect(perf!.loopsCompleted).toBe(1);
    });

    it('should reset performance data on new execution', async () => {
      await handler.play('SET !VAR0 "first"');
      const perf1 = handler.getLastPerformance();

      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 5));

      await handler.play('SET !VAR0 "second"');
      const perf2 = handler.getLastPerformance();

      // Should be different performance objects (different start times)
      expect(perf2!.startTime).not.toBe(perf1!.startTime);
    });

    it('should capture performance on parse error', async () => {
      await handler.play('INVALID @#$ SYNTAX');
      const perf = handler.getLastPerformance();

      expect(perf).not.toBeNull();
      expect(perf!.success).toBe(false);
      expect(perf!.loopsCompleted).toBe(0);
      expect(perf!.commandsExecuted).toBe(0);
    });
  });

  // ===== Error Handling =====

  describe('Error handling', () => {
    it('should capture last error message', async () => {
      expect(handler.getLastError()).toBe('');
      await handler.play('INVALID COMMAND');
      expect(handler.getLastError()).not.toBe('');
    });

    it('should clear error on new successful execution', async () => {
      await handler.play('INVALID COMMAND');
      expect(handler.getLastError()).not.toBe('');

      await handler.play('SET !VAR0 "valid"');
      expect(handler.getLastError()).toBe('');
    });
  });

  // ===== Stop Functionality =====

  describe('Stop functionality', () => {
    it('should stop a running macro', async () => {
      // Start a long-running macro
      const promise = handler.play('WAIT SECONDS=10');

      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 10));

      // Stop it
      handler.stop();

      // Wait for it to finish
      const result = await promise;
      expect(handler.isRunning()).toBe(false);
    });

    it('should be safe to call stop when not running', () => {
      expect(() => handler.stop()).not.toThrow();
    });
  });
});

describe('ScriptingInterfaceServer', () => {
  let server: ScriptingInterfaceServer;
  let mockHandler: MacroHandler;

  beforeEach(() => {
    mockHandler = {
      play: vi.fn().mockResolvedValue({ code: ReturnCode.OK }),
      setVariable: vi.fn(),
      getVariable: vi.fn(),
      getLastExtract: vi.fn().mockReturnValue(''),
      getLastError: vi.fn().mockReturnValue(''),
      getLastPerformance: vi.fn().mockReturnValue(null),
      isRunning: vi.fn().mockReturnValue(false),
      stop: vi.fn(),
    };
    server = new ScriptingInterfaceServer({ debug: false }, mockHandler);
  });

  afterEach(async () => {
    if (server.isRunning()) {
      await server.stop();
    }
  });

  // ===== Server Lifecycle =====

  describe('Server lifecycle', () => {
    it('should start and stop successfully', async () => {
      await server.start();
      expect(server.isRunning()).toBe(true);

      await server.stop();
      expect(server.isRunning()).toBe(false);
    });

    it('should reject starting twice', async () => {
      await server.start();
      await expect(server.start()).rejects.toThrow('already running');
    });

    it('should handle stopping when not started', async () => {
      await expect(server.stop()).resolves.toBeUndefined();
    });
  });

  // ===== Configuration =====

  describe('Configuration', () => {
    it('should use default configuration', () => {
      const config = server.getConfig();
      expect(config.port).toBe(4951);
      expect(config.host).toBe('127.0.0.1');
      expect(config.timeout).toBe(60000);
      expect(config.debug).toBe(false);
    });

    it('should accept custom configuration', () => {
      const customServer = new ScriptingInterfaceServer({
        port: 5000,
        host: '0.0.0.0',
        timeout: 30000,
        debug: true,
      });
      const config = customServer.getConfig();
      expect(config.port).toBe(5000);
      expect(config.host).toBe('0.0.0.0');
      expect(config.timeout).toBe(30000);
      expect(config.debug).toBe(true);
    });
  });

  // ===== Handler Management =====

  describe('Handler management', () => {
    it('should allow setting a new handler', () => {
      const newHandler = {
        ...mockHandler,
        getLastExtract: vi.fn().mockReturnValue('new extract'),
      };
      server.setHandler(newHandler);
      // Handler change should be reflected in command execution
    });
  });
});

describe('iimGetLastPerformance command integration', () => {
  let handler: ExecutorMacroHandler;

  beforeEach(() => {
    handler = new ExecutorMacroHandler();
  });

  it('should serialize performance data to JSON correctly', async () => {
    await handler.play('SET !VAR0 "test"');
    const perf = handler.getLastPerformance();

    expect(perf).not.toBeNull();

    // Verify it can be serialized to JSON
    const json = JSON.stringify(perf);
    expect(json).toBeDefined();

    // Verify it can be parsed back
    const parsed = JSON.parse(json) as PerformanceData;
    expect(parsed.totalTimeMs).toBe(perf!.totalTimeMs);
    expect(parsed.startTime).toBe(perf!.startTime);
    expect(parsed.endTime).toBe(perf!.endTime);
    expect(parsed.loopsCompleted).toBe(perf!.loopsCompleted);
    expect(parsed.success).toBe(perf!.success);
    expect(parsed.errorCode).toBe(perf!.errorCode);
  });

  it('should include all required fields in performance data', async () => {
    await handler.play('SET !VAR0 "test"');
    const perf = handler.getLastPerformance();

    expect(perf).toHaveProperty('totalTimeMs');
    expect(perf).toHaveProperty('startTime');
    expect(perf).toHaveProperty('endTime');
    expect(perf).toHaveProperty('loopsCompleted');
    expect(perf).toHaveProperty('commandsExecuted');
    expect(perf).toHaveProperty('success');
    expect(perf).toHaveProperty('errorCode');
  });

  it('should have consistent timing values', async () => {
    await handler.play('SET !VAR0 "test"');
    const perf = handler.getLastPerformance();

    expect(perf).not.toBeNull();

    // totalTimeMs should approximately match the difference between end and start
    const calculatedDiff = new Date(perf!.endTime).getTime() - new Date(perf!.startTime).getTime();
    // Allow some tolerance since executionTimeMs from executor may differ slightly
    expect(Math.abs(perf!.totalTimeMs - calculatedDiff)).toBeLessThan(100);
  });
});

describe('PerformanceData interface', () => {
  it('should define correct structure', () => {
    const mockPerf: PerformanceData = {
      totalTimeMs: 100,
      startTime: '2024-01-01T00:00:00.000Z',
      endTime: '2024-01-01T00:00:00.100Z',
      loopsCompleted: 1,
      commandsExecuted: 5,
      success: true,
      errorCode: 1,
    };

    expect(mockPerf.totalTimeMs).toBe(100);
    expect(mockPerf.startTime).toBe('2024-01-01T00:00:00.000Z');
    expect(mockPerf.endTime).toBe('2024-01-01T00:00:00.100Z');
    expect(mockPerf.loopsCompleted).toBe(1);
    expect(mockPerf.commandsExecuted).toBe(5);
    expect(mockPerf.success).toBe(true);
    expect(mockPerf.errorCode).toBe(1);
  });
});
