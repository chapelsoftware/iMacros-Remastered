/**
 * PRINT Command Handler Unit Tests
 *
 * Tests for the PRINT command which prints the current page.
 * When native host is available, uses silent printing.
 * When native host is not available, falls back to browser print dialog.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  printHandler,
  setPrintService,
  getPrintService,
  isPrintServiceConfigured,
  setFallbackPrintFunction,
  getFallbackPrintFunction,
  registerPrintHandlers,
  printHandlers,
  type PrintService,
  type PrintOptions,
  type PrintResult,
  type FallbackPrintFunction,
} from '../../../shared/src/commands/print';
import { IMACROS_ERROR_CODES } from '../../../shared/src/executor';

// ===== Mock Factories =====

/**
 * Create a mock Print service
 */
function createMockPrintService(
  defaultResult: Partial<PrintResult> = { success: true },
  available: boolean = true
): PrintService & { print: ReturnType<typeof vi.fn> } {
  return {
    print: vi.fn().mockResolvedValue({
      success: true,
      ...defaultResult,
    }),
    isAvailable: () => available,
  };
}

/**
 * Create a mock command context
 */
function createMockContext(
  params: { key: string; value?: string }[] = [],
  variables: Record<string, unknown> = {}
): any {
  const logs: Array<{ level: string; message: string }> = [];
  const stateVariables: Record<string, unknown> = { ...variables };

  return {
    command: {
      type: 'PRINT',
      parameters: params,
      raw: 'PRINT',
      lineNumber: 1,
      variables: [],
    },
    variables: {
      get: (name: string) => stateVariables[name],
      set: (name: string, value: unknown) => { stateVariables[name] = value; },
      expand: (t: string) => ({ expanded: t, variables: [] }),
    },
    state: {
      setVariable: (name: string, value: unknown) => { stateVariables[name] = value; },
      getVariable: (name: string) => stateVariables[name],
      addExtract: vi.fn(),
    },
    getParam: (key: string) => {
      const found = params.find(p => p.key.toUpperCase() === key.toUpperCase());
      return found?.value;
    },
    getRequiredParam: (key: string) => {
      const found = params.find(p => p.key.toUpperCase() === key.toUpperCase());
      if (!found) throw new Error(`Missing required parameter: ${key}`);
      return found.value;
    },
    expand: (t: string) => t,
    log: (level: string, message: string) => logs.push({ level, message }),
    _logs: logs,
    _variables: stateVariables,
  };
}

/**
 * Create a mock fallback print function
 */
function createMockFallbackPrint(
  result: Partial<PrintResult> = { success: true }
): FallbackPrintFunction & ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    success: true,
    usedFallback: true,
    ...result,
  });
}

// ===== Test Suites =====

describe('PRINT Command Handler', () => {
  let originalService: PrintService;
  let originalFallback: FallbackPrintFunction;

  beforeEach(() => {
    // Save the original service and fallback
    originalService = getPrintService();
    originalFallback = getFallbackPrintFunction();
  });

  afterEach(() => {
    // Restore the original service and fallback
    setPrintService(originalService);
    setFallbackPrintFunction(originalFallback);
  });

  // ===== Service Configuration =====

  describe('Service Configuration', () => {
    it('should start with no-op service that returns unavailable', () => {
      // Reset to default no-op service
      setPrintService({
        async print(): Promise<PrintResult> {
          return {
            success: false,
            error: 'PRINT requires the native host for silent printing',
          };
        },
        isAvailable(): boolean {
          return false;
        },
      });

      expect(isPrintServiceConfigured()).toBe(false);
    });

    it('should allow setting a custom Print service', () => {
      const mockService = createMockPrintService();
      setPrintService(mockService);

      expect(getPrintService()).toBe(mockService);
    });

    it('isPrintServiceConfigured returns true when service is available', () => {
      const mockService = createMockPrintService({ success: true }, true);
      setPrintService(mockService);

      expect(isPrintServiceConfigured()).toBe(true);
    });

    it('isPrintServiceConfigured returns false when service is not available', () => {
      const mockService = createMockPrintService({ success: true }, false);
      setPrintService(mockService);

      expect(isPrintServiceConfigured()).toBe(false);
    });

    it('should allow setting a fallback print function', () => {
      const mockFallback = createMockFallbackPrint();
      setFallbackPrintFunction(mockFallback);

      expect(getFallbackPrintFunction()).toBe(mockFallback);
    });
  });

  // ===== Native Host (Silent) Printing =====

  describe('Native Host Printing', () => {
    it('should use native host when available for silent printing', async () => {
      const mockService = createMockPrintService({ success: true }, true);
      setPrintService(mockService);

      const ctx = createMockContext([], { '!URLCURRENT': 'https://example.com' });
      const result = await printHandler(ctx);

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(mockService.print).toHaveBeenCalledTimes(1);
      expect(mockService.print).toHaveBeenCalledWith({
        url: 'https://example.com',
        toPrinter: true,
        waitForNetworkIdle: true,
      });
    });

    it('should pass current URL to print service', async () => {
      const mockService = createMockPrintService({ success: true }, true);
      setPrintService(mockService);

      const ctx = createMockContext([], { '!URLCURRENT': 'https://test-page.com/document' });
      await printHandler(ctx);

      expect(mockService.print).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://test-page.com/document',
        })
      );
    });

    it('should handle print service failure', async () => {
      const mockService = createMockPrintService({
        success: false,
        error: 'Printer not responding',
      }, true);
      setPrintService(mockService);

      const ctx = createMockContext([]);
      const result = await printHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toContain('Printer not responding');
    });

    it('should handle print service throwing exception', async () => {
      const mockService: PrintService = {
        print: vi.fn().mockRejectedValue(new Error('Connection to native host lost')),
        isAvailable: () => true,
      };
      setPrintService(mockService);

      const ctx = createMockContext([]);
      const result = await printHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toContain('Connection to native host lost');
    });

    it('should log info message on successful print', async () => {
      const mockService = createMockPrintService({ success: true }, true);
      setPrintService(mockService);

      const ctx = createMockContext([]);
      await printHandler(ctx);

      const infoLogs = ctx._logs.filter((l: any) => l.level === 'info');
      expect(infoLogs.some((l: any) => l.message.includes('printed successfully'))).toBe(true);
    });

    it('should log error message on failure', async () => {
      const mockService: PrintService = {
        print: vi.fn().mockRejectedValue(new Error('Print failed')),
        isAvailable: () => true,
      };
      setPrintService(mockService);

      const ctx = createMockContext([]);
      await printHandler(ctx);

      const errorLogs = ctx._logs.filter((l: any) => l.level === 'error');
      expect(errorLogs.length).toBeGreaterThan(0);
      expect(errorLogs[0].message).toContain('Print failed');
    });
  });

  // ===== Fallback (Browser Print Dialog) =====

  describe('Fallback Printing', () => {
    it('should fall back to browser print when native host not available', async () => {
      // Set up service as unavailable
      const mockService = createMockPrintService({ success: true }, false);
      setPrintService(mockService);

      // Set up fallback
      const mockFallback = createMockFallbackPrint({ success: true });
      setFallbackPrintFunction(mockFallback);

      const ctx = createMockContext([]);
      const result = await printHandler(ctx);

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(mockFallback).toHaveBeenCalledTimes(1);
      expect(mockService.print).not.toHaveBeenCalled();
    });

    it('should log warning when using fallback', async () => {
      const mockService = createMockPrintService({ success: true }, false);
      setPrintService(mockService);

      const mockFallback = createMockFallbackPrint({ success: true });
      setFallbackPrintFunction(mockFallback);

      const ctx = createMockContext([]);
      await printHandler(ctx);

      const warnLogs = ctx._logs.filter((l: any) => l.level === 'warn');
      expect(warnLogs.length).toBeGreaterThan(0);
      expect(warnLogs[0].message).toContain('Native host not available');
      expect(warnLogs[0].message).toContain('Falling back');
    });

    it('should handle fallback failure', async () => {
      const mockService = createMockPrintService({ success: true }, false);
      setPrintService(mockService);

      const mockFallback = createMockFallbackPrint({
        success: false,
        error: 'Print dialog cancelled by user',
      });
      setFallbackPrintFunction(mockFallback);

      const ctx = createMockContext([]);
      const result = await printHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toContain('Print dialog cancelled by user');
    });

    it('should handle fallback throwing exception', async () => {
      const mockService = createMockPrintService({ success: true }, false);
      setPrintService(mockService);

      const mockFallback = vi.fn().mockRejectedValue(new Error('window.print not available'));
      setFallbackPrintFunction(mockFallback);

      const ctx = createMockContext([]);
      const result = await printHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toContain('window.print not available');
    });

    it('should log info on successful fallback', async () => {
      const mockService = createMockPrintService({ success: true }, false);
      setPrintService(mockService);

      const mockFallback = createMockFallbackPrint({ success: true });
      setFallbackPrintFunction(mockFallback);

      const ctx = createMockContext([]);
      await printHandler(ctx);

      const infoLogs = ctx._logs.filter((l: any) => l.level === 'info');
      expect(infoLogs.some((l: any) => l.message.includes('print dialog triggered'))).toBe(true);
    });
  });

  // ===== Handler Registration =====

  describe('Handler Registration', () => {
    it('should export PRINT in printHandlers', () => {
      expect(printHandlers).toHaveProperty('PRINT');
      expect(typeof printHandlers.PRINT).toBe('function');
    });

    it('registerPrintHandlers should register all handlers', () => {
      const registered: string[] = [];
      const mockRegisterFn = (type: string) => {
        registered.push(type);
      };

      registerPrintHandlers(mockRegisterFn as any);

      expect(registered).toContain('PRINT');
    });
  });

  // ===== Edge Cases =====

  describe('Edge Cases', () => {
    it('should handle undefined URL gracefully', async () => {
      const mockService = createMockPrintService({ success: true }, true);
      setPrintService(mockService);

      const ctx = createMockContext([], {}); // No !URLCURRENT set
      const result = await printHandler(ctx);

      expect(result.success).toBe(true);
      expect(mockService.print).toHaveBeenCalledWith(
        expect.objectContaining({
          url: undefined,
        })
      );
    });

    it('should handle empty error message from service', async () => {
      const mockService = createMockPrintService({
        success: false,
        // No error message
      }, true);
      setPrintService(mockService);

      const ctx = createMockContext([]);
      const result = await printHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('PRINT failed');
    });

    it('should handle empty error message from fallback', async () => {
      const mockService = createMockPrintService({ success: true }, false);
      setPrintService(mockService);

      const mockFallback = createMockFallbackPrint({
        success: false,
        // No error message
      });
      setFallbackPrintFunction(mockFallback);

      const ctx = createMockContext([]);
      const result = await printHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('PRINT fallback failed');
    });

    it('should handle non-Error exceptions from service', async () => {
      const mockService: PrintService = {
        print: vi.fn().mockRejectedValue('String error'),
        isAvailable: () => true,
      };
      setPrintService(mockService);

      const ctx = createMockContext([]);
      const result = await printHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('String error');
    });

    it('should handle non-Error exceptions from fallback', async () => {
      const mockService = createMockPrintService({ success: true }, false);
      setPrintService(mockService);

      const mockFallback = vi.fn().mockRejectedValue('String error from fallback');
      setFallbackPrintFunction(mockFallback);

      const ctx = createMockContext([]);
      const result = await printHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('String error from fallback');
    });
  });

  // ===== Service Priority =====

  describe('Service Priority', () => {
    it('should prefer native host over fallback when available', async () => {
      const mockService = createMockPrintService({ success: true }, true);
      setPrintService(mockService);

      const mockFallback = createMockFallbackPrint({ success: true });
      setFallbackPrintFunction(mockFallback);

      const ctx = createMockContext([]);
      await printHandler(ctx);

      expect(mockService.print).toHaveBeenCalledTimes(1);
      expect(mockFallback).not.toHaveBeenCalled();
    });

    it('should only use fallback when native host unavailable', async () => {
      const mockService = createMockPrintService({ success: true }, false);
      setPrintService(mockService);

      const mockFallback = createMockFallbackPrint({ success: true });
      setFallbackPrintFunction(mockFallback);

      const ctx = createMockContext([]);
      await printHandler(ctx);

      expect(mockService.print).not.toHaveBeenCalled();
      expect(mockFallback).toHaveBeenCalledTimes(1);
    });
  });

  // ===== Logging =====

  describe('Logging', () => {
    it('should log starting message', async () => {
      const mockService = createMockPrintService({ success: true }, true);
      setPrintService(mockService);

      const ctx = createMockContext([]);
      await printHandler(ctx);

      const infoLogs = ctx._logs.filter((l: any) => l.level === 'info');
      expect(infoLogs.some((l: any) => l.message.includes('Starting print operation'))).toBe(true);
    });

    it('should log debug message when using native host', async () => {
      const mockService = createMockPrintService({ success: true }, true);
      setPrintService(mockService);

      const ctx = createMockContext([]);
      await printHandler(ctx);

      const debugLogs = ctx._logs.filter((l: any) => l.level === 'debug');
      expect(debugLogs.some((l: any) => l.message.includes('native host'))).toBe(true);
    });
  });
});
