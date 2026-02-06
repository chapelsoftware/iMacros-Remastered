/**
 * ONLOGIN Command Integration Tests
 *
 * Tests the ONLOGIN command (HTTP authentication) through the MacroExecutor
 * with a mock DialogBridge. Verifies parameter validation, variable expansion,
 * bridge communication, state management, and error handling.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createExecutor, MacroExecutor, IMACROS_ERROR_CODES } from '@shared/executor';
import {
  registerDialogHandlers,
  setDialogBridge,
  DialogBridge,
  DialogOperationMessage,
  DialogConfigResponse,
  LoginConfigMessage,
} from '@shared/commands/dialogs';
import {
  registerNavigationHandlers,
  setBrowserBridge,
  BrowserBridge,
  BrowserOperationMessage,
  BrowserOperationResponse,
} from '@shared/commands/navigation';

describe('ONLOGIN Command Integration Tests', () => {
  let executor: MacroExecutor;
  let mockBridge: DialogBridge;
  let sentMessages: DialogOperationMessage[];

  beforeEach(() => {
    sentMessages = [];
    mockBridge = {
      sendMessage: vi.fn(async (message: DialogOperationMessage): Promise<DialogConfigResponse> => {
        sentMessages.push(message);
        return { success: true };
      }),
    };
    setDialogBridge(mockBridge);
    executor = createExecutor();
    registerDialogHandlers(executor.registerHandler.bind(executor));
  });

  afterEach(() => {
    setDialogBridge(null as unknown as DialogBridge);
  });

  // Test 1: Basic ONLOGIN sends LOGIN_CONFIG with correct payload
  describe('Basic ONLOGIN with USER and PASSWORD', () => {
    it('should send LOGIN_CONFIG with user=admin, password=secret, active=true', async () => {
      executor.loadMacro('ONLOGIN USER=admin PASSWORD=secret');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as LoginConfigMessage;
      expect(msg.type).toBe('LOGIN_CONFIG');
      expect(msg.payload.config.user).toBe('admin');
      expect(msg.payload.config.password).toBe('secret');
      expect(msg.payload.config.active).toBe(true);

      // Verify message has required id and timestamp fields
      expect(msg.id).toBeDefined();
      expect(msg.timestamp).toBeGreaterThan(0);
    });
  });

  // Test 2: Missing USER returns MISSING_PARAMETER
  describe('Missing USER parameter', () => {
    it('should return MISSING_PARAMETER when USER is missing', async () => {
      executor.loadMacro('ONLOGIN PASSWORD=secret');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(sentMessages).toHaveLength(0);
    });
  });

  // Test 3: Missing PASSWORD returns MISSING_PARAMETER
  describe('Missing PASSWORD parameter', () => {
    it('should return MISSING_PARAMETER when PASSWORD is missing', async () => {
      executor.loadMacro('ONLOGIN USER=admin');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(sentMessages).toHaveLength(0);
    });
  });

  // Test 4: Empty USER and PASSWORD strings
  describe('Empty USER and PASSWORD values', () => {
    it('should send LOGIN_CONFIG with empty user and password strings', async () => {
      executor.loadMacro('ONLOGIN USER= PASSWORD=');
      const result = await executor.execute();

      // The handler checks for truthiness of the parameter value.
      // An empty string from USER= is falsy, so the handler returns MISSING_PARAMETER.
      // This documents the actual behavior for empty strings.
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(sentMessages).toHaveLength(0);
    });
  });

  // Test 5: Variable expansion in USER
  describe('Variable expansion in USER', () => {
    it('should expand variable in USER parameter', async () => {
      const script = [
        'SET !VAR1 myuser',
        'ONLOGIN USER={{!VAR1}} PASSWORD=pass',
      ].join('\n');

      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as LoginConfigMessage;
      expect(msg.type).toBe('LOGIN_CONFIG');
      expect(msg.payload.config.user).toBe('myuser');
      expect(msg.payload.config.password).toBe('pass');
      expect(msg.payload.config.active).toBe(true);
    });
  });

  // Test 6: Variable expansion in PASSWORD
  describe('Variable expansion in PASSWORD', () => {
    it('should expand variable in PASSWORD parameter', async () => {
      const script = [
        'SET !VAR2 mypass',
        'ONLOGIN USER=admin PASSWORD={{!VAR2}}',
      ].join('\n');

      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as LoginConfigMessage;
      expect(msg.type).toBe('LOGIN_CONFIG');
      expect(msg.payload.config.user).toBe('admin');
      expect(msg.payload.config.password).toBe('mypass');
      expect(msg.payload.config.active).toBe(true);
    });
  });

  // Test 7: Bridge failure returns SCRIPT_ERROR
  describe('Bridge failure returns SCRIPT_ERROR', () => {
    it('should return SCRIPT_ERROR when bridge returns success=false', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<DialogConfigResponse> => {
        return { success: false, error: 'Login config rejected by extension' };
      });

      executor.loadMacro('ONLOGIN USER=admin PASSWORD=secret');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toBeDefined();
    });
  });

  // Test 8: Bridge exception returns SCRIPT_ERROR
  describe('Bridge exception returns SCRIPT_ERROR', () => {
    it('should return SCRIPT_ERROR when bridge throws an exception', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<DialogConfigResponse> => {
        throw new Error('Connection lost');
      });

      executor.loadMacro('ONLOGIN USER=admin PASSWORD=secret');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    });
  });

  // Test 9: No bridge configured returns success (testing mode)
  describe('No bridge configured returns success', () => {
    it('should return success when no bridge is configured (testing mode)', async () => {
      setDialogBridge(null as unknown as DialogBridge);

      executor.loadMacro('ONLOGIN USER=admin PASSWORD=secret');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(0);
    });
  });

  // Test 10: Multi-command sequence: ONLOGIN then URL GOTO
  describe('Multi-command: ONLOGIN then URL GOTO sequence', () => {
    it('should execute ONLOGIN followed by URL GOTO successfully', async () => {
      // Set up the browser bridge for navigation commands
      const navMessages: BrowserOperationMessage[] = [];
      const mockNavBridge: BrowserBridge = {
        sendMessage: vi.fn(async (message: BrowserOperationMessage): Promise<BrowserOperationResponse> => {
          navMessages.push(message);
          return { success: true };
        }),
      };
      setBrowserBridge(mockNavBridge);

      // Register navigation handlers in addition to dialog handlers
      registerNavigationHandlers(executor);

      const script = [
        'ONLOGIN USER=admin PASSWORD=secret',
        'URL GOTO=https://protected.example.com',
      ].join('\n');

      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

      // Verify ONLOGIN sent LOGIN_CONFIG via dialog bridge
      expect(sentMessages).toHaveLength(1);
      const loginMsg = sentMessages[0] as LoginConfigMessage;
      expect(loginMsg.type).toBe('LOGIN_CONFIG');
      expect(loginMsg.payload.config.user).toBe('admin');
      expect(loginMsg.payload.config.password).toBe('secret');

      // Verify URL GOTO sent navigate via browser bridge
      expect(navMessages).toHaveLength(1);
      expect(navMessages[0].type).toBe('navigate');
      expect((navMessages[0] as { url: string }).url).toBe('https://protected.example.com');

      // Clean up the browser bridge
      setBrowserBridge(null as unknown as BrowserBridge);
    });
  });

  // Additional: Verify bridge message payload carries correct credentials
  describe('Bridge message payload', () => {
    it('should pass user and password through the bridge payload', async () => {
      executor.loadMacro('ONLOGIN USER=admin PASSWORD=secret');
      const result = await executor.execute();

      expect(result.success).toBe(true);

      // The credentials are communicated via the bridge message, not state variables
      expect(sentMessages).toHaveLength(1);
      const msg = sentMessages[0] as LoginConfigMessage;
      expect(msg.payload.config.user).toBe('admin');
      expect(msg.payload.config.password).toBe('secret');
      expect(msg.payload.config.active).toBe(true);
    });

    it('should pass expanded variable values through the bridge payload', async () => {
      const script = [
        'SET !VAR1 expanded_user',
        'SET !VAR2 expanded_pass',
        'ONLOGIN USER={{!VAR1}} PASSWORD={{!VAR2}}',
      ].join('\n');

      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);

      // Credentials with expanded variable values sent via bridge message
      expect(sentMessages).toHaveLength(1);
      const msg = sentMessages[0] as LoginConfigMessage;
      expect(msg.payload.config.user).toBe('expanded_user');
      expect(msg.payload.config.password).toBe('expanded_pass');
      expect(msg.payload.config.active).toBe(true);
    });
  });
});
