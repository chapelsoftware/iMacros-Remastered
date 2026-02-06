/**
 * Integration Tests for PROXY Command
 *
 * Tests the PROXY command through the MacroExecutor with a mock BrowserCommandBridge.
 * Verifies address parsing (host:port, host-only with default port), proxy type
 * handling (HTTP, HTTPS, SOCKS4, SOCKS5, DIRECT, SYSTEM), bypass lists,
 * authentication credentials, parameter validation, bridge error handling,
 * and variable expansion.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createExecutor, MacroExecutor, IMACROS_ERROR_CODES } from '@shared/executor';
import {
  registerBrowserCommandHandlers,
  setBrowserCommandBridge,
  BrowserCommandBridge,
  BrowserCommandOperationMessage,
  BrowserCommandResponse,
  SetProxyMessage,
} from '@shared/commands/browser';

describe('PROXY Command Integration Tests', () => {
  let executor: MacroExecutor;
  let mockBridge: BrowserCommandBridge;
  let sentMessages: BrowserCommandOperationMessage[];

  beforeEach(() => {
    sentMessages = [];
    mockBridge = {
      sendMessage: vi.fn(async (message: BrowserCommandOperationMessage): Promise<BrowserCommandResponse> => {
        sentMessages.push(message);
        return { success: true };
      }),
    };
    setBrowserCommandBridge(mockBridge);
    executor = createExecutor();
    registerBrowserCommandHandlers(executor);
  });

  afterEach(() => {
    setBrowserCommandBridge(null as unknown as BrowserCommandBridge);
  });

  // --- Helper to extract the SetProxyMessage from sent messages ---
  function getProxyMessage(): SetProxyMessage {
    const msg = sentMessages.find((m) => m.type === 'setProxy');
    expect(msg).toBeDefined();
    return msg as SetProxyMessage;
  }

  // ===== Basic Address Parsing =====

  describe('Address parsing', () => {
    it('should send setProxy with proxyType=http, host and port=8080 for ADDRESS=proxy.example.com:8080', async () => {
      executor.loadMacro('PROXY ADDRESS=proxy.example.com:8080');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = getProxyMessage();
      expect(msg.type).toBe('setProxy');
      expect(msg.proxyType).toBe('http');
      expect(msg.host).toBe('proxy.example.com');
      expect(msg.port).toBe(8080);
      expect(msg.address).toBe('proxy.example.com:8080');
    });

    it('should use default port 8080 when ADDRESS has no port (ADDRESS=proxy.example.com)', async () => {
      executor.loadMacro('PROXY ADDRESS=proxy.example.com');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = getProxyMessage();
      expect(msg.type).toBe('setProxy');
      expect(msg.proxyType).toBe('http');
      expect(msg.host).toBe('proxy.example.com');
      expect(msg.port).toBe(8080);
    });
  });

  // ===== Direct Connection =====

  describe('Direct connection', () => {
    it('should send proxyType=direct when ADDRESS is empty (ADDRESS=)', async () => {
      executor.loadMacro('PROXY ADDRESS=');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = getProxyMessage();
      expect(msg.type).toBe('setProxy');
      expect(msg.proxyType).toBe('direct');
      expect(msg.host).toBeUndefined();
      expect(msg.port).toBeUndefined();
      expect(msg.address).toBeUndefined();
    });

    it('should send proxyType=direct when ADDRESS=DIRECT', async () => {
      executor.loadMacro('PROXY ADDRESS=DIRECT');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = getProxyMessage();
      expect(msg.type).toBe('setProxy');
      expect(msg.proxyType).toBe('direct');
      expect(msg.host).toBeUndefined();
      expect(msg.port).toBeUndefined();
      expect(msg.address).toBeUndefined();
    });
  });

  // ===== Proxy Type Parameter =====

  describe('TYPE parameter', () => {
    it('should send proxyType=socks5 when TYPE=SOCKS5', async () => {
      executor.loadMacro('PROXY ADDRESS=proxy:3128 TYPE=SOCKS5');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = getProxyMessage();
      expect(msg.type).toBe('setProxy');
      expect(msg.proxyType).toBe('socks5');
      expect(msg.host).toBe('proxy');
      expect(msg.port).toBe(3128);
    });

    it('should send proxyType=https when TYPE=HTTPS', async () => {
      executor.loadMacro('PROXY ADDRESS=proxy:3128 TYPE=HTTPS');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = getProxyMessage();
      expect(msg.type).toBe('setProxy');
      expect(msg.proxyType).toBe('https');
      expect(msg.host).toBe('proxy');
      expect(msg.port).toBe(3128);
    });
  });

  // ===== Bypass List =====

  describe('BYPASS parameter', () => {
    it('should send bypass list as array when BYPASS=localhost,127.0.0.1', async () => {
      executor.loadMacro('PROXY ADDRESS=proxy:3128 BYPASS=localhost,127.0.0.1');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = getProxyMessage();
      expect(msg.type).toBe('setProxy');
      expect(msg.bypass).toEqual(['localhost', '127.0.0.1']);
      expect(msg.host).toBe('proxy');
      expect(msg.port).toBe(3128);
    });
  });

  // ===== Authentication =====

  describe('USER and PASSWORD parameters', () => {
    it('should send username and password when USER and PASSWORD are provided', async () => {
      executor.loadMacro('PROXY ADDRESS=proxy:3128 USER=admin PASSWORD=secret');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = getProxyMessage();
      expect(msg.type).toBe('setProxy');
      expect(msg.username).toBe('admin');
      expect(msg.password).toBe('secret');
      expect(msg.host).toBe('proxy');
      expect(msg.port).toBe(3128);
    });
  });

  // ===== Parameter Validation =====

  describe('Parameter validation', () => {
    it('should return MISSING_PARAMETER when ADDRESS is not provided', async () => {
      executor.loadMacro('PROXY TYPE=SOCKS5');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(sentMessages).toHaveLength(0);
    });
  });

  // ===== Bridge Error Handling =====

  describe('Bridge error handling', () => {
    it('should return SCRIPT_ERROR when bridge returns failure', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<BrowserCommandResponse> => {
        return { success: false, error: 'Proxy configuration failed' };
      });

      executor.loadMacro('PROXY ADDRESS=proxy:8080');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toContain('Proxy configuration failed');
    });

    it('should return SCRIPT_ERROR when bridge throws an exception', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<BrowserCommandResponse> => {
        throw new Error('Bridge connection lost');
      });

      executor.loadMacro('PROXY ADDRESS=proxy:8080');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toContain('Bridge connection lost');
    });
  });

  // ===== No Bridge Configured =====

  describe('No bridge configured', () => {
    it('should return success when no bridge is configured (testing mode)', async () => {
      setBrowserCommandBridge(null as unknown as BrowserCommandBridge);

      executor.loadMacro('PROXY ADDRESS=proxy:8080');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

      // The mock bridge should NOT have been called
      expect(mockBridge.sendMessage).not.toHaveBeenCalled();
    });
  });

  // ===== Variable Expansion =====

  describe('Variable expansion', () => {
    it('should expand variables in ADDRESS via SET and {{!VAR1}}', async () => {
      const script = [
        'SET !VAR1 proxy.example.com:9090',
        'PROXY ADDRESS={{!VAR1}}',
      ].join('\n');
      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = getProxyMessage();
      expect(msg.type).toBe('setProxy');
      expect(msg.proxyType).toBe('http');
      expect(msg.host).toBe('proxy.example.com');
      expect(msg.port).toBe(9090);
      expect(msg.address).toBe('proxy.example.com:9090');
    });
  });
});
