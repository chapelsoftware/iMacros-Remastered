/**
 * CLEAR Command Integration Tests
 *
 * Tests the CLEAR command handler from browser.ts through the MacroExecutor
 * pipeline with a mock BrowserCommandBridge. The CLEAR command clears various
 * types of browser data (cookies, cache, history, etc.) by sending a
 * 'clearData' message to the browser extension via the bridge.
 *
 * Syntax variants:
 * - CLEAR              (defaults to cookies)
 * - CLEAR COOKIES      (clear cookies)
 * - CLEAR CACHE        (clear cache)
 * - CLEAR HISTORY      (clear history)
 * - CLEAR ALL          (clear everything)
 * - CLEAR FORMDATA     (clear form data)
 * - CLEAR FORMS        (alias for FORMDATA)
 * - Unknown params     (fall back to cookies)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createExecutor,
  MacroExecutor,
  IMACROS_ERROR_CODES,
} from '@shared/executor';
import {
  registerBrowserCommandHandlers,
  setBrowserCommandBridge,
  BrowserCommandBridge,
  BrowserCommandOperationMessage,
  BrowserCommandResponse,
  ClearDataMessage,
} from '@shared/commands/browser';

describe('CLEAR Handler via MacroExecutor (with mock BrowserCommandBridge)', () => {
  let executor: MacroExecutor;
  let mockBridge: BrowserCommandBridge;
  let sentMessages: BrowserCommandOperationMessage[];

  beforeEach(() => {
    sentMessages = [];

    // Create a mock BrowserCommandBridge that records messages and returns success
    mockBridge = {
      sendMessage: vi.fn(
        async (
          message: BrowserCommandOperationMessage
        ): Promise<BrowserCommandResponse> => {
          sentMessages.push(message);
          return { success: true };
        }
      ),
    };

    setBrowserCommandBridge(mockBridge);

    executor = createExecutor();
    // Register the browser command handlers (overrides built-in no-op CLEAR)
    registerBrowserCommandHandlers(executor);
  });

  afterEach(() => {
    // Clear the bridge so it does not leak between tests
    setBrowserCommandBridge(null as unknown as BrowserCommandBridge);
  });

  // --- Helper to extract the ClearDataMessage from sent messages ---
  function getClearMessage(): ClearDataMessage {
    const msg = sentMessages.find((m) => m.type === 'clearData');
    expect(msg).toBeDefined();
    return msg as ClearDataMessage;
  }

  // 1. CLEAR (no params) sends clearData with dataTypes=['cache', 'cookies']
  it('CLEAR (no params) sends clearData with dataTypes=[cache, cookies]', async () => {
    executor.loadMacro('CLEAR');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    const msg = getClearMessage();
    expect(msg.type).toBe('clearData');
    expect(msg.dataTypes).toEqual(['cache', 'cookies']);
    expect(msg.id).toBeDefined();
    expect(msg.timestamp).toBeGreaterThan(0);
  });

  // 2. CLEAR COOKIES sends dataTypes=['cookies']
  it('CLEAR COOKIES sends clearData with dataTypes=[cookies]', async () => {
    executor.loadMacro('CLEAR COOKIES');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    const msg = getClearMessage();
    expect(msg.type).toBe('clearData');
    expect(msg.dataTypes).toEqual(['cookies']);
  });

  // 3. CLEAR CACHE sends dataTypes=['cache']
  it('CLEAR CACHE sends clearData with dataTypes=[cache]', async () => {
    executor.loadMacro('CLEAR CACHE');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    const msg = getClearMessage();
    expect(msg.type).toBe('clearData');
    expect(msg.dataTypes).toEqual(['cache']);
  });

  // 4. CLEAR HISTORY sends dataTypes=['history']
  it('CLEAR HISTORY sends clearData with dataTypes=[history]', async () => {
    executor.loadMacro('CLEAR HISTORY');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    const msg = getClearMessage();
    expect(msg.type).toBe('clearData');
    expect(msg.dataTypes).toEqual(['history']);
  });

  // 5. CLEAR ALL sends dataTypes=['all']
  it('CLEAR ALL sends clearData with dataTypes=[all]', async () => {
    executor.loadMacro('CLEAR ALL');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    const msg = getClearMessage();
    expect(msg.type).toBe('clearData');
    expect(msg.dataTypes).toEqual(['all']);
  });

  // 6. CLEAR FORMDATA sends dataTypes=['formData']
  it('CLEAR FORMDATA sends clearData with dataTypes=[formData]', async () => {
    executor.loadMacro('CLEAR FORMDATA');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    const msg = getClearMessage();
    expect(msg.type).toBe('clearData');
    expect(msg.dataTypes).toEqual(['formData']);
  });

  // 7. CLEAR FORMS sends dataTypes=['formData'] (alias)
  it('CLEAR FORMS sends clearData with dataTypes=[formData] (alias)', async () => {
    executor.loadMacro('CLEAR FORMS');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    const msg = getClearMessage();
    expect(msg.type).toBe('clearData');
    expect(msg.dataTypes).toEqual(['formData']);
  });

  // 8. Unknown param defaults to cookies
  it('Unknown param defaults to cookies', async () => {
    executor.loadMacro('CLEAR SOMETHINGELSE');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    const msg = getClearMessage();
    expect(msg.type).toBe('clearData');
    expect(msg.dataTypes).toEqual(['cookies']);
  });

  // 9. Bridge failure returns SCRIPT_ERROR
  it('Bridge failure returns SCRIPT_ERROR', async () => {
    (mockBridge.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: 'Permission denied to clear browsing data',
    });

    executor.loadMacro('CLEAR COOKIES');
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('Permission denied to clear browsing data');
  });

  // 10. Bridge exception returns SCRIPT_ERROR
  it('Bridge exception returns SCRIPT_ERROR', async () => {
    (mockBridge.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Extension context invalidated')
    );

    executor.loadMacro('CLEAR CACHE');
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('Extension context invalidated');
  });

  // 11. No bridge configured returns success (testing mode)
  it('No bridge configured returns success (testing mode)', async () => {
    // Remove the bridge
    setBrowserCommandBridge(null as unknown as BrowserCommandBridge);

    executor.loadMacro('CLEAR COOKIES');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    // The mock bridge should NOT have been called
    expect(mockBridge.sendMessage).not.toHaveBeenCalled();
  });

  // 12. Multi-command: CLEAR then URL GOTO works in sequence
  it('CLEAR then URL GOTO works in sequence', async () => {
    // We need the navigation handlers too for URL GOTO.
    // But the URL handler is registered separately. Instead, we can verify
    // that CLEAR completes and the next command runs by using a second CLEAR.
    // Or we can register a simple URL stub. Let us register a mock URL handler
    // that records it was called so we validate the executor continues.
    let urlCalled = false;
    executor.registerHandler('URL', async () => {
      urlCalled = true;
      return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
    });

    const script = ['CLEAR COOKIES', 'URL GOTO=https://example.com'].join(
      '\n'
    );

    executor.loadMacro(script);
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    // Verify CLEAR was executed (bridge was called)
    expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    const msg = getClearMessage();
    expect(msg.type).toBe('clearData');
    expect(msg.dataTypes).toEqual(['cookies']);

    // Verify URL handler was also called after CLEAR
    expect(urlCalled).toBe(true);
  });
});
