/**
 * Unit tests for shared/src/commands/dialogs.ts
 *
 * Covers all exported handlers, the dialog bridge wiring,
 * parseButton logic, sendDialogMessage paths, and registerDialogHandlers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  setDialogBridge,
  getDialogBridge,
  onDialogHandler,
  onLoginHandler,
  onCertificateDialogHandler,
  onErrorDialogHandler,
  onSecurityDialogHandler,
  onWebPageDialogHandler,
  onPrintHandler,
  dialogHandlers,
  registerDialogHandlers,
  type DialogBridge,
  type DialogOperationMessage,
} from '../../../shared/src/commands/dialogs';
import { IMACROS_ERROR_CODES } from '../../../shared/src/executor';

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

function createMockCtx(
  params: Record<string, string> = {},
) {
  const variables: Record<string, string> = {};

  return {
    command: { type: 'ONDIALOG', parameters: [] },
    variables: {} as any,
    getParam(key: string): string | undefined {
      return params[key];
    },
    getRequiredParam(key: string): string {
      const v = params[key];
      if (v === undefined) throw new Error(`Missing param ${key}`);
      return v;
    },
    expand(value: string): string {
      return value;
    },
    state: {
      getVariable: vi.fn((name: string) => variables[name]),
      setVariable: vi.fn((name: string, value: string) => {
        variables[name] = value;
      }),
      _variables: variables,
    },
    log: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dialogs.ts', () => {
  // Reset bridge before each test to avoid cross-contamination
  beforeEach(() => {
    setDialogBridge(null as any);
  });

  afterEach(() => {
    setDialogBridge(null as any);
  });

  // =========================================================================
  // setDialogBridge / getDialogBridge
  // =========================================================================

  describe('setDialogBridge / getDialogBridge', () => {
    it('should default to null', () => {
      expect(getDialogBridge()).toBeNull();
    });

    it('should set and return a bridge', () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setDialogBridge(bridge);
      expect(getDialogBridge()).toBe(bridge);
    });
  });

  // =========================================================================
  // onDialogHandler
  // =========================================================================

  describe('onDialogHandler', () => {
    it('should fail when POS is missing', async () => {
      const ctx = createMockCtx({ BUTTON: 'OK' });
      const result = await onDialogHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(result.errorMessage).toContain('POS');
    });

    it('should fail when BUTTON is missing', async () => {
      const ctx = createMockCtx({ POS: '1' });
      const result = await onDialogHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(result.errorMessage).toContain('BUTTON');
    });

    it('should fail when both POS and BUTTON are missing', async () => {
      const ctx = createMockCtx({});
      const result = await onDialogHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    });

    it('should fail when POS is not a number', async () => {
      const ctx = createMockCtx({ POS: 'abc', BUTTON: 'OK' });
      const result = await onDialogHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(result.errorMessage).toContain('Invalid POS');
    });

    it('should fail when POS is 0', async () => {
      const ctx = createMockCtx({ POS: '0', BUTTON: 'OK' });
      const result = await onDialogHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    });

    it('should fail when POS is negative', async () => {
      const ctx = createMockCtx({ POS: '-1', BUTTON: 'OK' });
      const result = await onDialogHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    });

    it('should succeed with valid POS and BUTTON=OK (no bridge)', async () => {
      const ctx = createMockCtx({ POS: '1', BUTTON: 'OK' });
      const result = await onDialogHandler(ctx as any);

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(ctx.state.setVariable).toHaveBeenCalledWith('!DIALOG_POS', '1');
      expect(ctx.state.setVariable).toHaveBeenCalledWith('!DIALOG_BUTTON', 'OK');
      // Log should warn about no bridge
      expect(ctx.log).toHaveBeenCalledWith('warn', expect.stringContaining('No dialog bridge'));
    });

    it('should succeed with BUTTON=CANCEL', async () => {
      const ctx = createMockCtx({ POS: '1', BUTTON: 'CANCEL' });
      const result = await onDialogHandler(ctx as any);

      expect(result.success).toBe(true);
      expect(ctx.state.setVariable).toHaveBeenCalledWith('!DIALOG_BUTTON', 'CANCEL');
    });

    it('should succeed with BUTTON=YES', async () => {
      const ctx = createMockCtx({ POS: '1', BUTTON: 'YES' });
      const result = await onDialogHandler(ctx as any);

      expect(result.success).toBe(true);
      expect(ctx.state.setVariable).toHaveBeenCalledWith('!DIALOG_BUTTON', 'YES');
    });

    it('should succeed with BUTTON=NO', async () => {
      const ctx = createMockCtx({ POS: '1', BUTTON: 'NO' });
      const result = await onDialogHandler(ctx as any);

      expect(result.success).toBe(true);
      expect(ctx.state.setVariable).toHaveBeenCalledWith('!DIALOG_BUTTON', 'NO');
    });

    it('should default unknown button to OK', async () => {
      const ctx = createMockCtx({ POS: '1', BUTTON: 'UNKNOWN' });
      const result = await onDialogHandler(ctx as any);

      expect(result.success).toBe(true);
      expect(ctx.state.setVariable).toHaveBeenCalledWith('!DIALOG_BUTTON', 'OK');
    });

    it('should handle case-insensitive button value', async () => {
      const ctx = createMockCtx({ POS: '1', BUTTON: 'cancel' });
      const result = await onDialogHandler(ctx as any);

      expect(result.success).toBe(true);
      expect(ctx.state.setVariable).toHaveBeenCalledWith('!DIALOG_BUTTON', 'CANCEL');
    });

    it('should set CONTENT variable when CONTENT param is provided', async () => {
      const ctx = createMockCtx({ POS: '1', BUTTON: 'OK', CONTENT: 'hello world' });
      const result = await onDialogHandler(ctx as any);

      expect(result.success).toBe(true);
      expect(ctx.state.setVariable).toHaveBeenCalledWith('!DIALOG_CONTENT', 'hello world');
    });

    it('should not set CONTENT variable when CONTENT param is absent', async () => {
      const ctx = createMockCtx({ POS: '1', BUTTON: 'OK' });
      await onDialogHandler(ctx as any);

      const calls = ctx.state.setVariable.mock.calls;
      const contentCall = calls.find((c: any) => c[0] === '!DIALOG_CONTENT');
      expect(contentCall).toBeUndefined();
    });

    it('should send message via bridge when bridge is set', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({ POS: '1', BUTTON: 'OK' });
      const result = await onDialogHandler(ctx as any);

      expect(result.success).toBe(true);
      expect(bridge.sendMessage).toHaveBeenCalledOnce();
      const msg = (bridge.sendMessage as any).mock.calls[0][0] as DialogOperationMessage;
      expect(msg.type).toBe('DIALOG_CONFIG');
      expect((msg as any).payload.config.pos).toBe(1);
      expect((msg as any).payload.config.button).toBe('OK');
      expect((msg as any).payload.config.active).toBe(true);
      expect((msg as any).payload.dialogTypes).toEqual(['alert', 'confirm', 'prompt', 'beforeunload']);
      expect(msg.id).toMatch(/^dialog_/);
      expect(typeof msg.timestamp).toBe('number');
    });

    it('should return error when bridge returns failure', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: false, error: 'bridge fail' }),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({ POS: '1', BUTTON: 'OK' });
      const result = await onDialogHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toBe('bridge fail');
    });

    it('should use fallback error message when bridge returns failure without error text', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: false }),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({ POS: '1', BUTTON: 'OK' });
      const result = await onDialogHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Failed to configure dialog handler');
    });

    it('should handle bridge throwing an Error', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockRejectedValue(new Error('connection lost')),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({ POS: '1', BUTTON: 'OK' });
      const result = await onDialogHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toBe('connection lost');
      expect(ctx.log).toHaveBeenCalledWith('error', expect.stringContaining('connection lost'));
    });

    it('should handle bridge throwing a non-Error value', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockRejectedValue('string error'),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({ POS: '1', BUTTON: 'OK' });
      const result = await onDialogHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('string error');
    });

    it('should include CONTENT in log message when present', async () => {
      const ctx = createMockCtx({ POS: '1', BUTTON: 'OK', CONTENT: 'test' });
      await onDialogHandler(ctx as any);

      expect(ctx.log).toHaveBeenCalledWith('info', expect.stringContaining('CONTENT=test'));
    });

    it('should not include CONTENT in log when absent', async () => {
      const ctx = createMockCtx({ POS: '1', BUTTON: 'OK' });
      await onDialogHandler(ctx as any);

      const infoCall = ctx.log.mock.calls.find(
        (c: any) => c[0] === 'info' && c[1].includes('Configuring dialog handler'),
      );
      expect(infoCall).toBeDefined();
      expect(infoCall![1]).not.toContain('CONTENT=');
    });

    it('should send content in bridge message payload when provided', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({ POS: '1', BUTTON: 'OK', CONTENT: 'my answer' });
      await onDialogHandler(ctx as any);

      const msg = (bridge.sendMessage as any).mock.calls[0][0];
      expect(msg.payload.config.content).toBe('my answer');
    });
  });

  // =========================================================================
  // onLoginHandler
  // =========================================================================

  describe('onLoginHandler', () => {
    it('should fail when USER is missing', async () => {
      const ctx = createMockCtx({ PASSWORD: 'secret' });
      const result = await onLoginHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(result.errorMessage).toContain('USER');
    });

    it('should fail when PASSWORD is missing', async () => {
      const ctx = createMockCtx({ USER: 'admin' });
      const result = await onLoginHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(result.errorMessage).toContain('PASSWORD');
    });

    it('should fail when both USER and PASSWORD are missing', async () => {
      const ctx = createMockCtx({});
      const result = await onLoginHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    });

    it('should succeed with valid params (no bridge)', async () => {
      const ctx = createMockCtx({ USER: 'admin', PASSWORD: 'secret' });
      const result = await onLoginHandler(ctx as any);

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(ctx.state.setVariable).toHaveBeenCalledWith('!LOGIN_USER', 'admin');
      expect(ctx.state.setVariable).toHaveBeenCalledWith('!LOGIN_PASSWORD', 'secret');
      expect(ctx.log).toHaveBeenCalledWith('info', expect.stringContaining('USER=admin'));
    });

    it('should succeed via bridge', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({ USER: 'admin', PASSWORD: 'pass123' });
      const result = await onLoginHandler(ctx as any);

      expect(result.success).toBe(true);
      expect(bridge.sendMessage).toHaveBeenCalledOnce();
      const msg = (bridge.sendMessage as any).mock.calls[0][0];
      expect(msg.type).toBe('LOGIN_CONFIG');
      expect(msg.payload.config.user).toBe('admin');
      expect(msg.payload.config.password).toBe('pass123');
      expect(msg.payload.config.active).toBe(true);
    });

    it('should return error when bridge fails', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: false, error: 'auth fail' }),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({ USER: 'admin', PASSWORD: 'pass' });
      const result = await onLoginHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toBe('auth fail');
    });

    it('should use fallback error message when bridge fails without error text', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: false }),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({ USER: 'admin', PASSWORD: 'pass' });
      const result = await onLoginHandler(ctx as any);

      expect(result.errorMessage).toBe('Failed to configure login handler');
    });

    it('should handle bridge exception', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockRejectedValue(new Error('timeout')),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({ USER: 'admin', PASSWORD: 'pass' });
      const result = await onLoginHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('timeout');
    });
  });

  // =========================================================================
  // onCertificateDialogHandler
  // =========================================================================

  describe('onCertificateDialogHandler', () => {
    it('should default to BUTTON=OK when BUTTON not provided', async () => {
      const ctx = createMockCtx({});
      const result = await onCertificateDialogHandler(ctx as any);

      expect(result.success).toBe(true);
      expect(ctx.state.setVariable).toHaveBeenCalledWith('!CERTIFICATE_BUTTON', 'OK');
    });

    it('should use provided BUTTON value', async () => {
      const ctx = createMockCtx({ BUTTON: 'CANCEL' });
      const result = await onCertificateDialogHandler(ctx as any);

      expect(result.success).toBe(true);
      expect(ctx.state.setVariable).toHaveBeenCalledWith('!CERTIFICATE_BUTTON', 'CANCEL');
    });

    it('should succeed via bridge', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({ BUTTON: 'OK' });
      const result = await onCertificateDialogHandler(ctx as any);

      expect(result.success).toBe(true);
      const msg = (bridge.sendMessage as any).mock.calls[0][0];
      expect(msg.type).toBe('CERTIFICATE_CONFIG');
      expect(msg.payload.config.button).toBe('OK');
      expect(msg.payload.config.active).toBe(true);
    });

    it('should return error when bridge fails', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: false, error: 'cert error' }),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({ BUTTON: 'OK' });
      const result = await onCertificateDialogHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('cert error');
    });

    it('should use fallback error message when bridge fails without error text', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: false }),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({ BUTTON: 'OK' });
      const result = await onCertificateDialogHandler(ctx as any);

      expect(result.errorMessage).toBe('Failed to configure certificate dialog handler');
    });

    it('should handle bridge exception', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockRejectedValue(new Error('cert reject')),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({});
      const result = await onCertificateDialogHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('cert reject');
    });

    it('should log info message', async () => {
      const ctx = createMockCtx({ BUTTON: 'CANCEL' });
      await onCertificateDialogHandler(ctx as any);

      expect(ctx.log).toHaveBeenCalledWith('info', expect.stringContaining('BUTTON=CANCEL'));
    });
  });

  // =========================================================================
  // onErrorDialogHandler
  // =========================================================================

  describe('onErrorDialogHandler', () => {
    it('should default to BUTTON=OK when BUTTON not provided', async () => {
      const ctx = createMockCtx({});
      const result = await onErrorDialogHandler(ctx as any);

      expect(result.success).toBe(true);
      expect(ctx.state.setVariable).toHaveBeenCalledWith('!ERROR_DIALOG_BUTTON', 'OK');
    });

    it('should use provided BUTTON value', async () => {
      const ctx = createMockCtx({ BUTTON: 'CANCEL' });
      const result = await onErrorDialogHandler(ctx as any);

      expect(result.success).toBe(true);
      expect(ctx.state.setVariable).toHaveBeenCalledWith('!ERROR_DIALOG_BUTTON', 'CANCEL');
    });

    it('should succeed via bridge', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({ BUTTON: 'OK' });
      const result = await onErrorDialogHandler(ctx as any);

      expect(result.success).toBe(true);
      const msg = (bridge.sendMessage as any).mock.calls[0][0];
      expect(msg.type).toBe('ERROR_DIALOG_CONFIG');
      expect(msg.payload.config.button).toBe('OK');
    });

    it('should return error when bridge fails', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: false, error: 'err dialog fail' }),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({ BUTTON: 'OK' });
      const result = await onErrorDialogHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('err dialog fail');
    });

    it('should use fallback error message when bridge fails without error text', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: false }),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({});
      const result = await onErrorDialogHandler(ctx as any);

      expect(result.errorMessage).toBe('Failed to configure error dialog handler');
    });

    it('should handle bridge exception', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockRejectedValue(new Error('err throw')),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({});
      const result = await onErrorDialogHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('err throw');
    });
  });

  // =========================================================================
  // onSecurityDialogHandler
  // =========================================================================

  describe('onSecurityDialogHandler', () => {
    it('should default to BUTTON=OK when BUTTON not provided', async () => {
      const ctx = createMockCtx({});
      const result = await onSecurityDialogHandler(ctx as any);

      expect(result.success).toBe(true);
      expect(ctx.state.setVariable).toHaveBeenCalledWith('!SECURITY_DIALOG_BUTTON', 'OK');
    });

    it('should use provided BUTTON value', async () => {
      const ctx = createMockCtx({ BUTTON: 'CANCEL' });
      const result = await onSecurityDialogHandler(ctx as any);

      expect(result.success).toBe(true);
      expect(ctx.state.setVariable).toHaveBeenCalledWith('!SECURITY_DIALOG_BUTTON', 'CANCEL');
    });

    it('should succeed via bridge', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({ BUTTON: 'NO' });
      const result = await onSecurityDialogHandler(ctx as any);

      expect(result.success).toBe(true);
      const msg = (bridge.sendMessage as any).mock.calls[0][0];
      expect(msg.type).toBe('SECURITY_DIALOG_CONFIG');
      expect(msg.payload.config.button).toBe('NO');
    });

    it('should return error when bridge fails', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: false, error: 'sec fail' }),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({});
      const result = await onSecurityDialogHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('sec fail');
    });

    it('should use fallback error message when bridge fails without error text', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: false }),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({});
      const result = await onSecurityDialogHandler(ctx as any);

      expect(result.errorMessage).toBe('Failed to configure security dialog handler');
    });

    it('should handle bridge exception', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockRejectedValue(new Error('sec throw')),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({});
      const result = await onSecurityDialogHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('sec throw');
    });
  });

  // =========================================================================
  // onWebPageDialogHandler
  // =========================================================================

  describe('onWebPageDialogHandler', () => {
    it('should default to BUTTON=OK when BUTTON not provided', async () => {
      const ctx = createMockCtx({});
      const result = await onWebPageDialogHandler(ctx as any);

      expect(result.success).toBe(true);
      expect(ctx.state.setVariable).toHaveBeenCalledWith('!WEBPAGE_DIALOG_BUTTON', 'OK');
    });

    it('should use provided BUTTON value', async () => {
      const ctx = createMockCtx({ BUTTON: 'CANCEL' });
      const result = await onWebPageDialogHandler(ctx as any);

      expect(result.success).toBe(true);
      expect(ctx.state.setVariable).toHaveBeenCalledWith('!WEBPAGE_DIALOG_BUTTON', 'CANCEL');
    });

    it('should set CONTENT variable when CONTENT is provided', async () => {
      const ctx = createMockCtx({ BUTTON: 'OK', CONTENT: 'response text' });
      const result = await onWebPageDialogHandler(ctx as any);

      expect(result.success).toBe(true);
      expect(ctx.state.setVariable).toHaveBeenCalledWith('!WEBPAGE_DIALOG_CONTENT', 'response text');
    });

    it('should not set CONTENT variable when CONTENT is absent', async () => {
      const ctx = createMockCtx({ BUTTON: 'OK' });
      await onWebPageDialogHandler(ctx as any);

      const calls = ctx.state.setVariable.mock.calls;
      const contentCall = calls.find((c: any) => c[0] === '!WEBPAGE_DIALOG_CONTENT');
      expect(contentCall).toBeUndefined();
    });

    it('should include CONTENT in log message when present', async () => {
      const ctx = createMockCtx({ BUTTON: 'OK', CONTENT: 'text' });
      await onWebPageDialogHandler(ctx as any);

      expect(ctx.log).toHaveBeenCalledWith('info', expect.stringContaining('CONTENT=text'));
    });

    it('should not include CONTENT in log when absent', async () => {
      const ctx = createMockCtx({ BUTTON: 'OK' });
      await onWebPageDialogHandler(ctx as any);

      const infoCall = ctx.log.mock.calls.find(
        (c: any) => c[0] === 'info' && c[1].includes('web page dialog'),
      );
      expect(infoCall).toBeDefined();
      expect(infoCall![1]).not.toContain('CONTENT=');
    });

    it('should succeed via bridge', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({ BUTTON: 'OK', CONTENT: 'val' });
      const result = await onWebPageDialogHandler(ctx as any);

      expect(result.success).toBe(true);
      const msg = (bridge.sendMessage as any).mock.calls[0][0];
      expect(msg.type).toBe('WEBPAGE_DIALOG_CONFIG');
      expect(msg.payload.config.button).toBe('OK');
      expect(msg.payload.config.content).toBe('val');
      expect(msg.payload.config.active).toBe(true);
    });

    it('should return error when bridge fails', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: false, error: 'web fail' }),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({ BUTTON: 'OK' });
      const result = await onWebPageDialogHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('web fail');
    });

    it('should use fallback error message when bridge fails without error text', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: false }),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({ BUTTON: 'OK' });
      const result = await onWebPageDialogHandler(ctx as any);

      expect(result.errorMessage).toBe('Failed to configure web page dialog handler');
    });

    it('should handle bridge exception', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockRejectedValue(new Error('web throw')),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({});
      const result = await onWebPageDialogHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('web throw');
    });
  });

  // =========================================================================
  // onPrintHandler
  // =========================================================================

  describe('onPrintHandler', () => {
    it('should default to BUTTON=OK when BUTTON not provided', async () => {
      const ctx = createMockCtx({});
      const result = await onPrintHandler(ctx as any);

      expect(result.success).toBe(true);
      expect(ctx.state.setVariable).toHaveBeenCalledWith('!PRINT_BUTTON', 'OK');
    });

    it('should use provided BUTTON value', async () => {
      const ctx = createMockCtx({ BUTTON: 'CANCEL' });
      const result = await onPrintHandler(ctx as any);

      expect(result.success).toBe(true);
      expect(ctx.state.setVariable).toHaveBeenCalledWith('!PRINT_BUTTON', 'CANCEL');
    });

    it('should succeed via bridge', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({ BUTTON: 'CANCEL' });
      const result = await onPrintHandler(ctx as any);

      expect(result.success).toBe(true);
      const msg = (bridge.sendMessage as any).mock.calls[0][0];
      expect(msg.type).toBe('PRINT_CONFIG');
      expect(msg.payload.config.button).toBe('CANCEL');
      expect(msg.payload.config.active).toBe(true);
    });

    it('should return error when bridge fails', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: false, error: 'print fail' }),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({ BUTTON: 'OK' });
      const result = await onPrintHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('print fail');
    });

    it('should use fallback error message when bridge fails without error text', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: false }),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({});
      const result = await onPrintHandler(ctx as any);

      expect(result.errorMessage).toBe('Failed to configure print dialog handler');
    });

    it('should handle bridge exception', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockRejectedValue(new Error('print throw')),
      };
      setDialogBridge(bridge);

      const ctx = createMockCtx({});
      const result = await onPrintHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('print throw');
    });
  });

  // =========================================================================
  // dialogHandlers map
  // =========================================================================

  describe('dialogHandlers', () => {
    it('should export handlers for all 7 dialog commands', () => {
      expect(dialogHandlers.ONDIALOG).toBe(onDialogHandler);
      expect(dialogHandlers.ONLOGIN).toBe(onLoginHandler);
      expect(dialogHandlers.ONCERTIFICATEDIALOG).toBe(onCertificateDialogHandler);
      expect(dialogHandlers.ONERRORDIALOG).toBe(onErrorDialogHandler);
      expect(dialogHandlers.ONSECURITYDIALOG).toBe(onSecurityDialogHandler);
      expect(dialogHandlers.ONWEBPAGEDIALOG).toBe(onWebPageDialogHandler);
      expect(dialogHandlers.ONPRINT).toBe(onPrintHandler);
    });

    it('should have exactly 7 entries', () => {
      expect(Object.keys(dialogHandlers).length).toBe(7);
    });
  });

  // =========================================================================
  // registerDialogHandlers
  // =========================================================================

  describe('registerDialogHandlers', () => {
    it('should call registerFn for each handler', () => {
      const registerFn = vi.fn();
      registerDialogHandlers(registerFn);

      expect(registerFn).toHaveBeenCalledTimes(7);
      expect(registerFn).toHaveBeenCalledWith('ONDIALOG', onDialogHandler);
      expect(registerFn).toHaveBeenCalledWith('ONLOGIN', onLoginHandler);
      expect(registerFn).toHaveBeenCalledWith('ONCERTIFICATEDIALOG', onCertificateDialogHandler);
      expect(registerFn).toHaveBeenCalledWith('ONERRORDIALOG', onErrorDialogHandler);
      expect(registerFn).toHaveBeenCalledWith('ONSECURITYDIALOG', onSecurityDialogHandler);
      expect(registerFn).toHaveBeenCalledWith('ONWEBPAGEDIALOG', onWebPageDialogHandler);
      expect(registerFn).toHaveBeenCalledWith('ONPRINT', onPrintHandler);
    });
  });
});
