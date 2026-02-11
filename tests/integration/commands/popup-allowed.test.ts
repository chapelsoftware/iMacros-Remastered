/**
 * Integration Tests for SET !POPUP_ALLOWED
 *
 * Tests the SET !POPUP_ALLOWED variable through the MacroExecutor with a mock
 * BrowserCommandBridge. Verifies that setting !POPUP_ALLOWED sends the correct
 * setPopupAllowed message through the bridge, handles URL normalization
 * (prepending http:// when no scheme), tracks modification state, and properly
 * sends restorePopupSettings on cleanup.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createExecutor, MacroExecutor, IMACROS_ERROR_CODES } from '@shared/executor';
import {
  setBrowserCommandBridge,
  BrowserCommandBridge,
  BrowserCommandOperationMessage,
  BrowserCommandResponse,
  SetPopupAllowedMessage,
  resetPopupSettingsState,
  hasPopupModifications,
  restorePopupSettings,
} from '@shared/commands/browser';

describe('SET !POPUP_ALLOWED Integration Tests', () => {
  let executor: MacroExecutor;
  let mockBridge: BrowserCommandBridge;
  let sentMessages: BrowserCommandOperationMessage[];

  beforeEach(() => {
    sentMessages = [];
    resetPopupSettingsState();
    mockBridge = {
      sendMessage: vi.fn(async (message: BrowserCommandOperationMessage): Promise<BrowserCommandResponse> => {
        sentMessages.push(message);
        return { success: true };
      }),
    };
    setBrowserCommandBridge(mockBridge);
    executor = createExecutor();
  });

  afterEach(() => {
    setBrowserCommandBridge(null as unknown as BrowserCommandBridge);
    resetPopupSettingsState();
  });

  // --- Helper to extract the SetPopupAllowedMessage from sent messages ---
  function getPopupMessage(): SetPopupAllowedMessage {
    const msg = sentMessages.find((m) => m.type === 'setPopupAllowed');
    expect(msg).toBeDefined();
    return msg as SetPopupAllowedMessage;
  }

  // ===== Basic URL Handling =====

  describe('URL handling', () => {
    it('should send setPopupAllowed with correct primaryPattern for a full URL', async () => {
      executor.loadMacro('SET !POPUP_ALLOWED http://example.com');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = getPopupMessage();
      expect(msg.type).toBe('setPopupAllowed');
      expect(msg.primaryPattern).toBe('http://example.com/*');
    });

    it('should prepend http:// when no scheme is provided', async () => {
      executor.loadMacro('SET !POPUP_ALLOWED example.com');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = getPopupMessage();
      expect(msg.primaryPattern).toBe('http://example.com/*');
    });

    it('should handle https:// URLs', async () => {
      executor.loadMacro('SET !POPUP_ALLOWED https://secure.example.com');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = getPopupMessage();
      expect(msg.primaryPattern).toBe('https://secure.example.com/*');
    });

    it('should handle URLs with paths (using hostname only for pattern)', async () => {
      executor.loadMacro('SET !POPUP_ALLOWED http://example.com/page');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = getPopupMessage();
      expect(msg.primaryPattern).toBe('http://example.com/*');
    });

    it('should handle URLs with ports', async () => {
      executor.loadMacro('SET !POPUP_ALLOWED http://example.com:8080');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = getPopupMessage();
      expect(msg.primaryPattern).toBe('http://example.com:8080/*');
    });
  });

  // ===== State Tracking =====

  describe('Popup modification state tracking', () => {
    it('should mark popup settings as modified after SET !POPUP_ALLOWED', async () => {
      expect(hasPopupModifications()).toBe(false);

      executor.loadMacro('SET !POPUP_ALLOWED example.com');
      await executor.execute();

      expect(hasPopupModifications()).toBe(true);
    });

    it('should not mark popup settings as modified if no !POPUP_ALLOWED is set', async () => {
      executor.loadMacro('SET !LOOP 1');
      await executor.execute();

      expect(hasPopupModifications()).toBe(false);
    });

    it('should reset state via resetPopupSettingsState', async () => {
      executor.loadMacro('SET !POPUP_ALLOWED example.com');
      await executor.execute();
      expect(hasPopupModifications()).toBe(true);

      resetPopupSettingsState();
      expect(hasPopupModifications()).toBe(false);
    });
  });

  // ===== Multiple SET !POPUP_ALLOWED calls =====

  describe('Multiple SET !POPUP_ALLOWED commands', () => {
    it('should send a setPopupAllowed message for each SET !POPUP_ALLOWED', async () => {
      executor.loadMacro(
        'SET !POPUP_ALLOWED http://site1.com\n' +
        'SET !POPUP_ALLOWED http://site2.com'
      );
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const popupMessages = sentMessages.filter(m => m.type === 'setPopupAllowed') as SetPopupAllowedMessage[];
      expect(popupMessages).toHaveLength(2);
      expect(popupMessages[0].primaryPattern).toBe('http://site1.com/*');
      expect(popupMessages[1].primaryPattern).toBe('http://site2.com/*');
    });
  });

  // ===== Restore =====

  describe('Restore popup settings', () => {
    it('should send restorePopupSettings message when popup was modified', async () => {
      executor.loadMacro('SET !POPUP_ALLOWED example.com');
      await executor.execute();
      expect(hasPopupModifications()).toBe(true);

      // Simulate macro end cleanup with a minimal CommandContext
      const mockCtx = {
        log: vi.fn(),
        variables: { get: vi.fn(), set: vi.fn() },
        command: { type: 'SET' as const, parameters: [] },
        state: {} as any,
        expand: (v: string) => v,
        getParam: () => undefined,
      };
      await restorePopupSettings(mockCtx as any);

      const restoreMsg = sentMessages.find(m => m.type === 'restorePopupSettings');
      expect(restoreMsg).toBeDefined();
      expect(hasPopupModifications()).toBe(false);
    });

    it('should not send restorePopupSettings if popup was never modified', async () => {
      const mockCtx = {
        log: vi.fn(),
        variables: { get: vi.fn(), set: vi.fn() },
        command: { type: 'SET' as const, parameters: [] },
        state: {} as any,
        expand: (v: string) => v,
        getParam: () => undefined,
      };
      await restorePopupSettings(mockCtx as any);

      const restoreMsg = sentMessages.find(m => m.type === 'restorePopupSettings');
      expect(restoreMsg).toBeUndefined();
    });
  });

  // ===== Bridge Error Handling =====

  describe('Bridge error handling', () => {
    it('should fail the macro when bridge returns error', async () => {
      const failingBridge: BrowserCommandBridge = {
        sendMessage: vi.fn(async (): Promise<BrowserCommandResponse> => {
          return { success: false, error: 'Permission denied' };
        }),
      };
      setBrowserCommandBridge(failingBridge);

      executor.loadMacro('SET !POPUP_ALLOWED example.com');
      const result = await executor.execute();

      expect(result.success).toBe(false);
    });

    it('should succeed without bridge (returns success by default for dev/test)', async () => {
      setBrowserCommandBridge(null as unknown as BrowserCommandBridge);

      executor.loadMacro('SET !POPUP_ALLOWED example.com');
      const result = await executor.execute();

      // Without bridge, sendBrowserCommandMessage returns { success: true }
      expect(result.success).toBe(true);
    });
  });

  // ===== Variable Expansion =====

  describe('Variable expansion', () => {
    it('should expand variables in the URL value', async () => {
      executor.loadMacro(
        'SET site example.com\n' +
        'SET !POPUP_ALLOWED {{site}}'
      );
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = getPopupMessage();
      expect(msg.primaryPattern).toBe('http://example.com/*');
    });
  });
});
