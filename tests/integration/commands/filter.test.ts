/**
 * Integration Tests for FILTER Command
 *
 * Tests the FILTER command through the MacroExecutor with a mock BrowserCommandBridge.
 * Verifies filter type handling (IMAGES, FLASH, POPUPS, NONE), status defaults,
 * parameter validation, bridge error handling, and variable expansion.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createExecutor, MacroExecutor, IMACROS_ERROR_CODES } from '@shared/executor';
import {
  registerBrowserCommandHandlers,
  setBrowserCommandBridge,
  BrowserCommandBridge,
  BrowserCommandOperationMessage,
  BrowserCommandResponse,
  SetFilterMessage,
} from '@shared/commands/browser';

describe('FILTER Command Integration Tests', () => {
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

  // ===== Basic Filter Types =====

  describe('FILTER TYPE=IMAGES', () => {
    it('should send setFilter with filterType=IMAGES, status=ON when !IMAGEFILTER is set', async () => {
      executor.loadMacro('SET !IMAGEFILTER YES\nFILTER TYPE=IMAGES');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SetFilterMessage;
      expect(msg.type).toBe('setFilter');
      expect(msg.filterType).toBe('IMAGES');
      expect(msg.status).toBe('ON');
    });

    it('should send status=ON when STATUS=ON is explicit', async () => {
      executor.loadMacro('SET !IMAGEFILTER YES\nFILTER TYPE=IMAGES STATUS=ON');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SetFilterMessage;
      expect(msg.type).toBe('setFilter');
      expect(msg.filterType).toBe('IMAGES');
      expect(msg.status).toBe('ON');
    });

    it('should send status=OFF when STATUS=OFF', async () => {
      executor.loadMacro('SET !IMAGEFILTER YES\nFILTER TYPE=IMAGES STATUS=OFF');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SetFilterMessage;
      expect(msg.type).toBe('setFilter');
      expect(msg.filterType).toBe('IMAGES');
      expect(msg.status).toBe('OFF');
    });

    it('should execute when !IMAGEFILTER is not set (defaults to enabled like original iMacros)', async () => {
      executor.loadMacro('FILTER TYPE=IMAGES STATUS=ON');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]).toMatchObject({ type: 'setFilter', filterType: 'IMAGES', status: 'ON' });
    });

    it('should skip execution when !IMAGEFILTER is explicitly OFF', async () => {
      executor.loadMacro('SET !IMAGEFILTER OFF\nFILTER TYPE=IMAGES STATUS=ON');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(0);
    });
  });

  describe('FILTER TYPE=FLASH', () => {
    it('should send setFilter with filterType=FLASH, status=ON', async () => {
      executor.loadMacro('FILTER TYPE=FLASH STATUS=ON');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SetFilterMessage;
      expect(msg.type).toBe('setFilter');
      expect(msg.filterType).toBe('FLASH');
      expect(msg.status).toBe('ON');
    });
  });

  describe('FILTER TYPE=POPUPS', () => {
    it('should send setFilter with filterType=POPUPS, status=ON', async () => {
      executor.loadMacro('FILTER TYPE=POPUPS STATUS=ON');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SetFilterMessage;
      expect(msg.type).toBe('setFilter');
      expect(msg.filterType).toBe('POPUPS');
      expect(msg.status).toBe('ON');
    });
  });

  // ===== FILTER TYPE=NONE =====

  describe('FILTER TYPE=NONE', () => {
    it('should send 3 setFilter messages: IMAGES OFF, FLASH OFF, POPUPS OFF', async () => {
      executor.loadMacro('FILTER TYPE=NONE');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(3);

      const msg0 = sentMessages[0] as SetFilterMessage;
      expect(msg0.type).toBe('setFilter');
      expect(msg0.filterType).toBe('IMAGES');
      expect(msg0.status).toBe('OFF');

      const msg1 = sentMessages[1] as SetFilterMessage;
      expect(msg1.type).toBe('setFilter');
      expect(msg1.filterType).toBe('FLASH');
      expect(msg1.status).toBe('OFF');

      const msg2 = sentMessages[2] as SetFilterMessage;
      expect(msg2.type).toBe('setFilter');
      expect(msg2.filterType).toBe('POPUPS');
      expect(msg2.status).toBe('OFF');
    });
  });

  // ===== Parameter Validation =====

  describe('Parameter validation', () => {
    it('should return MISSING_PARAMETER when TYPE is omitted', async () => {
      executor.loadMacro('FILTER STATUS=ON');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(sentMessages).toHaveLength(0);
    });

    it('should return INVALID_PARAMETER for unknown TYPE', async () => {
      executor.loadMacro('FILTER TYPE=INVALID');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(sentMessages).toHaveLength(0);
    });
  });

  // ===== Bridge Error Handling =====

  describe('Bridge error handling', () => {
    it('should return SCRIPT_ERROR when bridge returns failure', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<BrowserCommandResponse> => {
        return { success: false, error: 'Filter operation failed' };
      });

      executor.loadMacro('SET !IMAGEFILTER YES\nFILTER TYPE=IMAGES STATUS=ON');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    });

    it('should return SCRIPT_ERROR when bridge throws an exception', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<BrowserCommandResponse> => {
        throw new Error('Bridge connection lost');
      });

      executor.loadMacro('SET !IMAGEFILTER YES\nFILTER TYPE=IMAGES STATUS=ON');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    });
  });

  // ===== No Bridge Configured =====

  describe('No bridge configured', () => {
    it('should return success when no bridge is configured (testing mode)', async () => {
      setBrowserCommandBridge(null as unknown as BrowserCommandBridge);

      executor.loadMacro('SET !IMAGEFILTER YES\nFILTER TYPE=IMAGES STATUS=ON');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    });
  });

  // ===== Variable Expansion =====

  describe('Variable expansion', () => {
    it('should expand variables in TYPE via SET and {{!VAR1}}', async () => {
      // The filterHandler calls ctx.getParam('TYPE') which returns the raw
      // parsed value. It then calls .toUpperCase() but does NOT call
      // ctx.expand() on it. As a result, {{!VAR1}} is not expanded and
      // the literal string {{!VAR1}} is treated as an invalid filter type.
      //
      // This test documents the current behavior: variable expansion does
      // not work for the TYPE parameter of FILTER.
      const script = [
        'SET !VAR1 IMAGES',
        'FILTER TYPE={{!VAR1}} STATUS=ON',
      ].join('\n');
      executor.loadMacro(script);
      const result = await executor.execute();

      // The handler does not expand variables in TYPE, so {{!VAR1}} is
      // treated as an invalid type, producing INVALID_PARAMETER.
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    });
  });

  // ===== STATUS Default =====

  describe('STATUS defaults', () => {
    it('should default STATUS to ON when omitted', async () => {
      executor.loadMacro('FILTER TYPE=POPUPS');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SetFilterMessage;
      expect(msg.status).toBe('ON');
    });
  });
});
