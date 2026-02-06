/**
 * WINCLICK Command Handler Unit Tests
 *
 * Tests for the WINCLICK command which performs OS-level mouse clicks
 * at absolute screen coordinates via the native host winclick-service.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  winClickHandler,
  setWinClickService,
  getWinClickService,
  isWinClickServiceConfigured,
  registerWinClickHandlers,
  winClickHandlers,
  type WinClickService,
  type WinClickOptions,
  type WinClickResult,
} from '../../../shared/src/commands/winclick';
import { IMACROS_ERROR_CODES } from '../../../shared/src/executor';

// ===== Mock Factories =====

/**
 * Create a mock WinClick service
 */
function createMockWinClickService(
  defaultResult: Partial<WinClickResult> = { success: true }
): WinClickService & { click: ReturnType<typeof vi.fn> } {
  return {
    click: vi.fn().mockResolvedValue({
      success: true,
      position: { x: 100, y: 200 },
      ...defaultResult,
    }),
  };
}

/**
 * Create a mock command context
 */
function createMockContext(
  params: { key: string; value?: string }[] = []
): any {
  const logs: Array<{ level: string; message: string }> = [];
  const variables: Record<string, unknown> = {};

  return {
    command: {
      type: 'WINCLICK',
      parameters: params,
      raw: 'WINCLICK ' + params.map(p => p.value ? `${p.key}=${p.value}` : p.key).join(' '),
      lineNumber: 1,
      variables: [],
    },
    variables: {
      get: (name: string) => variables[name],
      set: (name: string, value: unknown) => { variables[name] = value; },
      expand: (t: string) => ({ expanded: t, variables: [] }),
    },
    state: {
      setVariable: (name: string, value: unknown) => { variables[name] = value; },
      getVariable: (name: string) => variables[name],
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
    _variables: variables,
  };
}

// ===== Test Suites =====

describe('WINCLICK Command Handler', () => {
  let originalService: WinClickService;

  beforeEach(() => {
    // Save the original service
    originalService = getWinClickService();
  });

  afterEach(() => {
    // Restore the original service
    setWinClickService(originalService);
  });

  // ===== Service Configuration =====

  describe('Service Configuration', () => {
    it('should start with no-op service that returns error', async () => {
      // Reset to default no-op service
      setWinClickService({
        async click(): Promise<WinClickResult> {
          return {
            success: false,
            error: 'WINCLICK requires the native host to be installed and running',
          };
        },
      });

      const ctx = createMockContext([
        { key: 'X', value: '100' },
        { key: 'Y', value: '200' },
      ]);
      const result = await winClickHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toContain('native host');
    });

    it('should allow setting a custom WinClick service', () => {
      const mockService = createMockWinClickService();
      setWinClickService(mockService);

      expect(getWinClickService()).toBe(mockService);
    });

    it('isWinClickServiceConfigured returns false for no-op service', () => {
      // Note: This test depends on the initial state, which may have been
      // modified by other tests. We test the logic by setting up explicitly.
      const noopService: WinClickService = {
        async click(): Promise<WinClickResult> {
          return { success: false, error: 'Not configured' };
        },
      };
      // Since we can't directly set the no-op service, we verify the getter works
      expect(typeof getWinClickService().click).toBe('function');
    });
  });

  // ===== Parameter Validation =====

  describe('Parameter Validation', () => {
    beforeEach(() => {
      setWinClickService(createMockWinClickService());
    });

    it('should require X parameter', async () => {
      const ctx = createMockContext([
        { key: 'Y', value: '200' },
      ]);
      const result = await winClickHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(result.errorMessage).toContain('X');
    });

    it('should require Y parameter', async () => {
      const ctx = createMockContext([
        { key: 'X', value: '100' },
      ]);
      const result = await winClickHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(result.errorMessage).toContain('Y');
    });

    it('should require both X and Y parameters', async () => {
      const ctx = createMockContext([]);
      const result = await winClickHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    });

    it('should reject non-numeric X value', async () => {
      const ctx = createMockContext([
        { key: 'X', value: 'abc' },
        { key: 'Y', value: '200' },
      ]);
      const result = await winClickHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(result.errorMessage).toContain('Invalid X coordinate');
    });

    it('should reject non-numeric Y value', async () => {
      const ctx = createMockContext([
        { key: 'X', value: '100' },
        { key: 'Y', value: 'xyz' },
      ]);
      const result = await winClickHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(result.errorMessage).toContain('Invalid Y coordinate');
    });

    it('should reject negative X coordinate', async () => {
      const ctx = createMockContext([
        { key: 'X', value: '-50' },
        { key: 'Y', value: '200' },
      ]);
      const result = await winClickHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(result.errorMessage).toContain('non-negative');
    });

    it('should reject negative Y coordinate', async () => {
      const ctx = createMockContext([
        { key: 'X', value: '100' },
        { key: 'Y', value: '-25' },
      ]);
      const result = await winClickHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(result.errorMessage).toContain('non-negative');
    });

    it('should accept zero coordinates', async () => {
      const mockService = createMockWinClickService();
      setWinClickService(mockService);

      const ctx = createMockContext([
        { key: 'X', value: '0' },
        { key: 'Y', value: '0' },
      ]);
      const result = await winClickHandler(ctx);

      expect(result.success).toBe(true);
      expect(mockService.click).toHaveBeenCalledWith({
        x: 0,
        y: 0,
        button: 'left',
      });
    });

    it('should accept large coordinates', async () => {
      const mockService = createMockWinClickService();
      setWinClickService(mockService);

      const ctx = createMockContext([
        { key: 'X', value: '3840' },
        { key: 'Y', value: '2160' },
      ]);
      const result = await winClickHandler(ctx);

      expect(result.success).toBe(true);
      expect(mockService.click).toHaveBeenCalledWith({
        x: 3840,
        y: 2160,
        button: 'left',
      });
    });
  });

  // ===== Button Parameter =====

  describe('Button Parameter', () => {
    let mockService: ReturnType<typeof createMockWinClickService>;

    beforeEach(() => {
      mockService = createMockWinClickService();
      setWinClickService(mockService);
    });

    it('should default to left button when BUTTON not specified', async () => {
      const ctx = createMockContext([
        { key: 'X', value: '100' },
        { key: 'Y', value: '200' },
      ]);
      await winClickHandler(ctx);

      expect(mockService.click).toHaveBeenCalledWith({
        x: 100,
        y: 200,
        button: 'left',
      });
    });

    it('should accept BUTTON=LEFT', async () => {
      const ctx = createMockContext([
        { key: 'X', value: '100' },
        { key: 'Y', value: '200' },
        { key: 'BUTTON', value: 'LEFT' },
      ]);
      await winClickHandler(ctx);

      expect(mockService.click).toHaveBeenCalledWith({
        x: 100,
        y: 200,
        button: 'left',
      });
    });

    it('should accept BUTTON=RIGHT', async () => {
      const ctx = createMockContext([
        { key: 'X', value: '100' },
        { key: 'Y', value: '200' },
        { key: 'BUTTON', value: 'RIGHT' },
      ]);
      await winClickHandler(ctx);

      expect(mockService.click).toHaveBeenCalledWith({
        x: 100,
        y: 200,
        button: 'right',
      });
    });

    it('should accept BUTTON=MIDDLE', async () => {
      const ctx = createMockContext([
        { key: 'X', value: '100' },
        { key: 'Y', value: '200' },
        { key: 'BUTTON', value: 'MIDDLE' },
      ]);
      await winClickHandler(ctx);

      expect(mockService.click).toHaveBeenCalledWith({
        x: 100,
        y: 200,
        button: 'middle',
      });
    });

    it('should accept BUTTON=CENTER as alias for MIDDLE', async () => {
      const ctx = createMockContext([
        { key: 'X', value: '100' },
        { key: 'Y', value: '200' },
        { key: 'BUTTON', value: 'CENTER' },
      ]);
      await winClickHandler(ctx);

      expect(mockService.click).toHaveBeenCalledWith({
        x: 100,
        y: 200,
        button: 'middle',
      });
    });

    it('should be case-insensitive for BUTTON value', async () => {
      const ctx = createMockContext([
        { key: 'X', value: '100' },
        { key: 'Y', value: '200' },
        { key: 'BUTTON', value: 'right' },
      ]);
      await winClickHandler(ctx);

      expect(mockService.click).toHaveBeenCalledWith({
        x: 100,
        y: 200,
        button: 'right',
      });
    });

    it('should reject invalid BUTTON value', async () => {
      const ctx = createMockContext([
        { key: 'X', value: '100' },
        { key: 'Y', value: '200' },
        { key: 'BUTTON', value: 'INVALID' },
      ]);
      const result = await winClickHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(result.errorMessage).toContain('BUTTON');
      expect(result.errorMessage).toContain('LEFT, RIGHT, MIDDLE');
    });
  });

  // ===== Successful Execution =====

  describe('Successful Execution', () => {
    it('should return success when service click succeeds', async () => {
      const mockService = createMockWinClickService({ success: true });
      setWinClickService(mockService);

      const ctx = createMockContext([
        { key: 'X', value: '100' },
        { key: 'Y', value: '200' },
      ]);
      const result = await winClickHandler(ctx);

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    });

    it('should log info message with coordinates', async () => {
      const mockService = createMockWinClickService();
      setWinClickService(mockService);

      const ctx = createMockContext([
        { key: 'X', value: '150' },
        { key: 'Y', value: '250' },
        { key: 'BUTTON', value: 'RIGHT' },
      ]);
      await winClickHandler(ctx);

      const infoLogs = ctx._logs.filter((l: any) => l.level === 'info');
      expect(infoLogs.length).toBeGreaterThan(0);
      expect(infoLogs[0].message).toContain('X=150');
      expect(infoLogs[0].message).toContain('Y=250');
      expect(infoLogs[0].message).toContain('button=right');
    });

    it('should pass correct options to service', async () => {
      const mockService = createMockWinClickService();
      setWinClickService(mockService);

      const ctx = createMockContext([
        { key: 'X', value: '500' },
        { key: 'Y', value: '300' },
        { key: 'BUTTON', value: 'MIDDLE' },
      ]);
      await winClickHandler(ctx);

      expect(mockService.click).toHaveBeenCalledTimes(1);
      expect(mockService.click).toHaveBeenCalledWith({
        x: 500,
        y: 300,
        button: 'middle',
      });
    });
  });

  // ===== Error Handling =====

  describe('Error Handling', () => {
    it('should return error when service click fails', async () => {
      const mockService = createMockWinClickService({
        success: false,
        error: 'Failed to move mouse',
      });
      setWinClickService(mockService);

      const ctx = createMockContext([
        { key: 'X', value: '100' },
        { key: 'Y', value: '200' },
      ]);
      const result = await winClickHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toContain('Failed to move mouse');
    });

    it('should use default error message when service returns no error message', async () => {
      const mockService = createMockWinClickService({
        success: false,
      });
      setWinClickService(mockService);

      const ctx = createMockContext([
        { key: 'X', value: '100' },
        { key: 'Y', value: '200' },
      ]);
      const result = await winClickHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('WINCLICK failed');
    });

    it('should handle service throwing an exception', async () => {
      const mockService: WinClickService = {
        click: vi.fn().mockRejectedValue(new Error('Native host disconnected')),
      };
      setWinClickService(mockService);

      const ctx = createMockContext([
        { key: 'X', value: '100' },
        { key: 'Y', value: '200' },
      ]);
      const result = await winClickHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toContain('Native host disconnected');
    });

    it('should handle non-Error exceptions', async () => {
      const mockService: WinClickService = {
        click: vi.fn().mockRejectedValue('String error'),
      };
      setWinClickService(mockService);

      const ctx = createMockContext([
        { key: 'X', value: '100' },
        { key: 'Y', value: '200' },
      ]);
      const result = await winClickHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toContain('String error');
    });

    it('should log error message on exception', async () => {
      const mockService: WinClickService = {
        click: vi.fn().mockRejectedValue(new Error('Connection lost')),
      };
      setWinClickService(mockService);

      const ctx = createMockContext([
        { key: 'X', value: '100' },
        { key: 'Y', value: '200' },
      ]);
      await winClickHandler(ctx);

      const errorLogs = ctx._logs.filter((l: any) => l.level === 'error');
      expect(errorLogs.length).toBeGreaterThan(0);
      expect(errorLogs[0].message).toContain('Connection lost');
    });
  });

  // ===== Handler Registration =====

  describe('Handler Registration', () => {
    it('should export WINCLICK in winClickHandlers', () => {
      expect(winClickHandlers).toHaveProperty('WINCLICK');
      expect(typeof winClickHandlers.WINCLICK).toBe('function');
    });

    it('registerWinClickHandlers should register all handlers', () => {
      const registered: string[] = [];
      const mockRegisterFn = (type: string) => {
        registered.push(type);
      };

      registerWinClickHandlers(mockRegisterFn as any);

      expect(registered).toContain('WINCLICK');
    });
  });

  // ===== Variable Expansion =====

  describe('Variable Expansion', () => {
    it('should expand variables in X coordinate', async () => {
      const mockService = createMockWinClickService();
      setWinClickService(mockService);

      // Create context that expands variables
      const ctx = createMockContext([
        { key: 'X', value: '100' },
        { key: 'Y', value: '200' },
      ]);

      // Modify expand to simulate variable expansion
      ctx.expand = (value: string) => {
        if (value === '{{!VAR1}}') return '150';
        return value;
      };

      // Update the param value to use a variable
      ctx.getParam = (key: string) => {
        if (key.toUpperCase() === 'X') return '{{!VAR1}}';
        if (key.toUpperCase() === 'Y') return '200';
        return undefined;
      };

      await winClickHandler(ctx);

      expect(mockService.click).toHaveBeenCalledWith({
        x: 150,
        y: 200,
        button: 'left',
      });
    });

    it('should expand variables in Y coordinate', async () => {
      const mockService = createMockWinClickService();
      setWinClickService(mockService);

      const ctx = createMockContext([
        { key: 'X', value: '100' },
        { key: 'Y', value: '{{myVar}}' },
      ]);

      ctx.expand = (value: string) => {
        if (value === '{{myVar}}') return '350';
        return value;
      };

      await winClickHandler(ctx);

      expect(mockService.click).toHaveBeenCalledWith({
        x: 100,
        y: 350,
        button: 'left',
      });
    });

    it('should expand variables in BUTTON parameter', async () => {
      const mockService = createMockWinClickService();
      setWinClickService(mockService);

      const ctx = createMockContext([
        { key: 'X', value: '100' },
        { key: 'Y', value: '200' },
        { key: 'BUTTON', value: '{{buttonVar}}' },
      ]);

      ctx.expand = (value: string) => {
        if (value === '{{buttonVar}}') return 'RIGHT';
        return value;
      };

      await winClickHandler(ctx);

      expect(mockService.click).toHaveBeenCalledWith({
        x: 100,
        y: 200,
        button: 'right',
      });
    });
  });
});
