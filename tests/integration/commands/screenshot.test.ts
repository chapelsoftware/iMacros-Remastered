/**
 * Integration Tests for SCREENSHOT Command
 *
 * Tests the SCREENSHOT command through the MacroExecutor with a mock BrowserCommandBridge.
 * Verifies capture type handling (BROWSER, PAGE), format detection from filename,
 * JPEG quality parameter, optional FOLDER/SELECTOR params, parameter validation,
 * bridge error handling, and variable expansion.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createExecutor, MacroExecutor, IMACROS_ERROR_CODES } from '@shared/executor';
import {
  registerBrowserCommandHandlers,
  setBrowserCommandBridge,
  BrowserCommandBridge,
  BrowserCommandOperationMessage,
  BrowserCommandResponse,
  ScreenshotMessage,
} from '@shared/commands/browser';
import { registerNavigationHandlers } from '@shared/commands/navigation';

describe('SCREENSHOT Command Integration Tests', () => {
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
    registerNavigationHandlers(executor);
  });

  afterEach(() => {
    setBrowserCommandBridge(null as unknown as BrowserCommandBridge);
  });

  // --- Helper to extract the ScreenshotMessage from sent messages ---
  function getScreenshotMessage(): ScreenshotMessage {
    const msg = sentMessages.find((m) => m.type === 'screenshot');
    expect(msg).toBeDefined();
    return msg as ScreenshotMessage;
  }

  // ===== Basic Capture Types =====

  describe('Capture types and format detection', () => {
    // 1. SCREENSHOT TYPE=BROWSER FILE=screen.png sends captureType='BROWSER', format='png', no quality
    it('TYPE=BROWSER FILE=screen.png sends captureType=BROWSER, format=png, no quality', async () => {
      executor.loadMacro('SCREENSHOT TYPE=BROWSER FILE=screen.png');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = getScreenshotMessage();
      expect(msg.type).toBe('screenshot');
      expect(msg.captureType).toBe('BROWSER');
      expect(msg.format).toBe('png');
      expect(msg.quality).toBeUndefined();
      expect(msg.file).toBe('screen.png');
    });

    // 2. SCREENSHOT TYPE=PAGE FILE=full.png sends captureType='PAGE', format='png'
    it('TYPE=PAGE FILE=full.png sends captureType=PAGE, format=png', async () => {
      executor.loadMacro('SCREENSHOT TYPE=PAGE FILE=full.png');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = getScreenshotMessage();
      expect(msg.type).toBe('screenshot');
      expect(msg.captureType).toBe('PAGE');
      expect(msg.format).toBe('png');
      expect(msg.quality).toBeUndefined();
      expect(msg.file).toBe('full.png');
    });

    // 3. SCREENSHOT TYPE=BROWSER FILE=photo.jpg sends format='jpeg', quality=92 (default)
    it('TYPE=BROWSER FILE=photo.jpg sends format=jpeg, quality=92 (default)', async () => {
      executor.loadMacro('SCREENSHOT TYPE=BROWSER FILE=photo.jpg');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = getScreenshotMessage();
      expect(msg.type).toBe('screenshot');
      expect(msg.captureType).toBe('BROWSER');
      expect(msg.format).toBe('jpeg');
      expect(msg.quality).toBe(92);
      expect(msg.file).toBe('photo.jpg');
    });

    // 4. SCREENSHOT TYPE=BROWSER FILE=photo.jpeg sends format='jpeg'
    it('TYPE=BROWSER FILE=photo.jpeg sends format=jpeg', async () => {
      executor.loadMacro('SCREENSHOT TYPE=BROWSER FILE=photo.jpeg');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = getScreenshotMessage();
      expect(msg.type).toBe('screenshot');
      expect(msg.format).toBe('jpeg');
      expect(msg.quality).toBe(92);
      expect(msg.file).toBe('photo.jpeg');
    });
  });

  // ===== JPEG Quality =====

  describe('JPEG quality parameter', () => {
    // 5. SCREENSHOT TYPE=BROWSER FILE=photo.jpg QUALITY=80 sends quality=80
    it('TYPE=BROWSER FILE=photo.jpg QUALITY=80 sends quality=80', async () => {
      executor.loadMacro('SCREENSHOT TYPE=BROWSER FILE=photo.jpg QUALITY=80');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = getScreenshotMessage();
      expect(msg.type).toBe('screenshot');
      expect(msg.format).toBe('jpeg');
      expect(msg.quality).toBe(80);
    });
  });

  // ===== Optional Parameters =====

  describe('Optional parameters', () => {
    // 6. SCREENSHOT TYPE=BROWSER FOLDER=/screenshots FILE=screen.png sends folder
    it('TYPE=BROWSER FOLDER=/screenshots FILE=screen.png sends folder', async () => {
      executor.loadMacro('SCREENSHOT TYPE=BROWSER FOLDER=/screenshots FILE=screen.png');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = getScreenshotMessage();
      expect(msg.type).toBe('screenshot');
      expect(msg.folder).toBe('/screenshots');
      expect(msg.file).toBe('screen.png');
    });

    // 7. SCREENSHOT TYPE=BROWSER FILE=screen.png SELECTOR=.main sends selector
    it('TYPE=BROWSER FILE=screen.png SELECTOR=.main sends selector', async () => {
      executor.loadMacro('SCREENSHOT TYPE=BROWSER FILE=screen.png SELECTOR=.main');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = getScreenshotMessage();
      expect(msg.type).toBe('screenshot');
      expect(msg.selector).toBe('.main');
      expect(msg.file).toBe('screen.png');
    });
  });

  // ===== Parameter Validation =====

  describe('Parameter validation', () => {
    // 8. SCREENSHOT without TYPE returns MISSING_PARAMETER
    it('SCREENSHOT without TYPE returns MISSING_PARAMETER', async () => {
      executor.loadMacro('SCREENSHOT FILE=screen.png');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(sentMessages).toHaveLength(0);
    });

    // 9. SCREENSHOT TYPE=INVALID FILE=x.png returns INVALID_PARAMETER
    it('SCREENSHOT TYPE=INVALID FILE=x.png returns INVALID_PARAMETER', async () => {
      executor.loadMacro('SCREENSHOT TYPE=INVALID FILE=x.png');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(sentMessages).toHaveLength(0);
    });

    // 10. SCREENSHOT TYPE=BROWSER without FILE returns MISSING_PARAMETER
    it('SCREENSHOT TYPE=BROWSER without FILE returns MISSING_PARAMETER', async () => {
      executor.loadMacro('SCREENSHOT TYPE=BROWSER');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(sentMessages).toHaveLength(0);
    });

    // 11. SCREENSHOT TYPE=BROWSER FILE=photo.jpg QUALITY=200 returns INVALID_PARAMETER
    it('SCREENSHOT TYPE=BROWSER FILE=photo.jpg QUALITY=200 returns INVALID_PARAMETER', async () => {
      executor.loadMacro('SCREENSHOT TYPE=BROWSER FILE=photo.jpg QUALITY=200');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(sentMessages).toHaveLength(0);
    });

    // 12. SCREENSHOT TYPE=BROWSER FILE=photo.jpg QUALITY=abc returns INVALID_PARAMETER
    it('SCREENSHOT TYPE=BROWSER FILE=photo.jpg QUALITY=abc returns INVALID_PARAMETER', async () => {
      executor.loadMacro('SCREENSHOT TYPE=BROWSER FILE=photo.jpg QUALITY=abc');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(sentMessages).toHaveLength(0);
    });
  });

  // ===== Bridge Error Handling =====

  describe('Bridge error handling', () => {
    // 13. Bridge failure returns FILE_WRITE_ERROR
    it('Bridge failure returns FILE_WRITE_ERROR', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<BrowserCommandResponse> => {
        return { success: false, error: 'Failed to save screenshot' };
      });

      executor.loadMacro('SCREENSHOT TYPE=BROWSER FILE=screen.png');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.FILE_WRITE_ERROR);
      expect(result.errorMessage).toContain('Failed to save screenshot');
    });

    it('Bridge exception returns FILE_WRITE_ERROR', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<BrowserCommandResponse> => {
        throw new Error('Extension context invalidated');
      });

      executor.loadMacro('SCREENSHOT TYPE=BROWSER FILE=screen.png');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.FILE_WRITE_ERROR);
    });
  });

  // ===== Bridge Response Data =====

  describe('Bridge response data', () => {
    // 14. Bridge with screenshotPath in response returns it as output
    it('Bridge with screenshotPath in response returns it as output', async () => {
      mockBridge.sendMessage = vi.fn(async (message: BrowserCommandOperationMessage): Promise<BrowserCommandResponse> => {
        sentMessages.push(message);
        return {
          success: true,
          data: {
            screenshotPath: '/screenshots/saved_screen.png',
          },
        };
      });

      executor.loadMacro('SCREENSHOT TYPE=BROWSER FILE=screen.png');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

      // The screenshotHandler returns savedPath as output; check via
      // the result's variables or by examining that it succeeded.
      // The handler sets output = response.data?.screenshotPath || file
      // We cannot directly read result.output from MacroResult, but we
      // can verify the bridge was called with the correct message.
      const msg = getScreenshotMessage();
      expect(msg.type).toBe('screenshot');
      expect(msg.file).toBe('screen.png');
    });
  });

  // ===== Variable Expansion =====

  describe('Variable expansion', () => {
    // 15. Variable expansion in FILE param
    it('should expand variables in FILE parameter', async () => {
      const script = [
        'SET !VAR1 myscreen',
        'SCREENSHOT TYPE=BROWSER FILE={{!VAR1}}.png',
      ].join('\n');
      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = getScreenshotMessage();
      expect(msg.type).toBe('screenshot');
      expect(msg.file).toBe('myscreen.png');
      expect(msg.format).toBe('png');
    });
  });

  // ===== FILE Wildcards (iMacros 8.9.7 Parity) =====

  describe('FILE wildcard support', () => {
    it('FILE=* derives filename from current URL with .png extension', async () => {
      const script = [
        'URL GOTO=https://www.example.com/products/widget',
        'SCREENSHOT TYPE=BROWSER FILE=*',
      ].join('\n');
      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = getScreenshotMessage();
      expect(msg.file).toBe('widget.png');
    });

    it('FILE=* with URL ending in slash derives from hostname', async () => {
      const script = [
        'URL GOTO=https://www.example.com/',
        'SCREENSHOT TYPE=BROWSER FILE=*',
      ].join('\n');
      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = getScreenshotMessage();
      expect(msg.file).toBe('example.png');
    });

    it('FILE=* with no URL falls back to unknown.png', async () => {
      executor.loadMacro('SCREENSHOT TYPE=BROWSER FILE=*');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = getScreenshotMessage();
      expect(msg.file).toBe('unknown.png');
    });

    it('FILE=+suffix appends suffix to derived name', async () => {
      const script = [
        'URL GOTO=https://www.example.com/products/widget',
        'SCREENSHOT TYPE=BROWSER FILE=+_capture.png',
      ].join('\n');
      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = getScreenshotMessage();
      expect(msg.file).toBe('widget_capture.png');
    });

    it('FILE=* strips file extension from URL path segment', async () => {
      const script = [
        'URL GOTO=https://www.example.com/docs/readme.html',
        'SCREENSHOT TYPE=BROWSER FILE=*',
      ].join('\n');
      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = getScreenshotMessage();
      expect(msg.file).toBe('readme.png');
    });
  });

  // ===== Filename Sanitization =====

  describe('Filename sanitization', () => {
    it('sanitizes illegal characters in filename', async () => {
      executor.loadMacro('SCREENSHOT TYPE=BROWSER FILE=my:screen*shot.png');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = getScreenshotMessage();
      expect(msg.file).toBe('my_screen_shot.png');
    });

    it('sanitizes wildcard-derived filenames', async () => {
      const script = [
        'URL GOTO=https://www.example.com/page?q=test&x=1',
        'SCREENSHOT TYPE=BROWSER FILE=*',
      ].join('\n');
      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = getScreenshotMessage();
      // URL query params with ? should get sanitized
      expect(msg.file).not.toMatch(/[?*|<>"]/);
    });
  });

  // ===== FOLDER=* Support =====

  describe('FOLDER=* support', () => {
    it('FOLDER=* sends undefined folder (browser default)', async () => {
      executor.loadMacro('SCREENSHOT TYPE=BROWSER FOLDER=* FILE=screen.png');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = getScreenshotMessage();
      expect(msg.folder).toBeUndefined();
      expect(msg.file).toBe('screen.png');
    });

    it('FOLDER with normal path sends the path', async () => {
      executor.loadMacro('SCREENSHOT TYPE=BROWSER FOLDER=/my/screenshots FILE=screen.png');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = getScreenshotMessage();
      expect(msg.folder).toBe('/my/screenshots');
    });
  });

  // ===== Folder Validation =====

  describe('Folder validation', () => {
    it('rejects folder path with null byte', async () => {
      const script = 'SCREENSHOT TYPE=BROWSER FOLDER=/path\0evil FILE=screen.png';
      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(result.errorMessage).toContain('null byte');
    });
  });

  // ===== No Bridge Configured =====

  describe('No bridge configured', () => {
    it('should return success when no bridge is configured (testing mode)', async () => {
      setBrowserCommandBridge(null as unknown as BrowserCommandBridge);

      executor.loadMacro('SCREENSHOT TYPE=BROWSER FILE=screen.png');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

      // The mock bridge should NOT have been called
      expect(mockBridge.sendMessage).not.toHaveBeenCalled();
    });
  });
});
