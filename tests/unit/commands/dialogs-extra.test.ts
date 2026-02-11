/**
 * Additional unit tests for shared/src/commands/dialogs.ts
 *
 * Covers uncovered branches including:
 * - onLoginHandler: encrypted password decryption with EncryptionError (lines 451-461)
 * - onLoginHandler: encrypted password decryption with non-EncryptionError (re-throw)
 * - onDialogHandler: CONTENT param, TIMEOUT_STEP handling, bridge failure
 * - onLoginHandler: with !TIMEOUT_STEP variable
 * - onCertificateDialogHandler: default button, OK/CANCEL, bridge failure
 * - onErrorDialogHandler: CONTINUE=NO, CONTINUE=FALSE, without CONTINUE, bridge failure
 * - onSecurityDialogHandler: OK/CANCEL, bridge failure
 * - onWebPageDialogHandler: with/without CONTENT, bridge failure
 * - onPrintHandler: OK/CANCEL, bridge failure
 * - parseButton: invalid button defaults to CANCEL (tested indirectly)
 * - dialogHandlers map and registerDialogHandlers
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  onDialogHandler,
  onLoginHandler,
  onCertificateDialogHandler,
  onErrorDialogHandler,
  onSecurityDialogHandler,
  onWebPageDialogHandler,
  onPrintHandler,
  setDialogBridge,
  getDialogBridge,
  dialogHandlers,
  registerDialogHandlers,
  type DialogBridge,
  type DialogOperationMessage,
} from '../../../shared/src/commands/dialogs';
import { IMACROS_ERROR_CODES } from '../../../shared/src/executor';

// Mock the encryption module so we can control isEncrypted / decryptString behavior
vi.mock('../../../shared/src/encryption', () => ({
  isEncrypted: vi.fn(),
  decryptString: vi.fn(),
  EncryptionError: class EncryptionError extends Error {
    code: number;
    constructor(message: string, code: number = 940) {
      super(message);
      this.name = 'EncryptionError';
      this.code = code;
    }
  },
}));

import { isEncrypted, decryptString, EncryptionError } from '../../../shared/src/encryption';

// ---------------------------------------------------------------------------
// Mock context factory
// ---------------------------------------------------------------------------

function createMockContext(
  params: Record<string, string> = {},
  vars: Map<string, any> = new Map(),
): any {
  const mockLogs: Array<{ level: string; message: string }> = [];
  return {
    command: {
      type: 'TEST',
      parameters: Object.entries(params).map(([key, value]) => ({
        key: key.toUpperCase(),
        value,
        rawValue: value,
        variables: [],
      })),
      raw: 'TEST',
      lineNumber: 1,
      variables: [],
    },
    variables: {
      get: (name: string) => vars.get(name.toUpperCase()) ?? null,
      set: (name: string, value: any) => {
        vars.set(name.toUpperCase(), value);
        return { success: true, previousValue: null, newValue: value };
      },
      expand: (t: string) => ({ expanded: t, variables: [] }),
    },
    state: {
      setVariable: (name: string, value: any) => vars.set(name.toUpperCase(), value),
      getVariable: (name: string) => vars.get(name.toUpperCase()) ?? null,
    },
    getParam: (key: string) => {
      const upperKey = key.toUpperCase();
      const entry = Object.entries(params).find(([k]) => k.toUpperCase() === upperKey);
      return entry ? entry[1] : undefined;
    },
    getRequiredParam: (key: string) => {
      const upperKey = key.toUpperCase();
      const entry = Object.entries(params).find(([k]) => k.toUpperCase() === upperKey);
      if (!entry) throw new Error(`Missing required parameter: ${key}`);
      return entry[1];
    },
    expand: (t: string) => t,
    log: (level: string, message: string) => mockLogs.push({ level, message }),
    _logs: mockLogs,
    _vars: vars,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dialogs-extra', () => {
  beforeEach(() => {
    setDialogBridge(null as any);
    vi.clearAllMocks();
  });

  afterEach(() => {
    setDialogBridge(null as any);
  });

  // =========================================================================
  // onDialogHandler - additional coverage
  // =========================================================================

  describe('onDialogHandler', () => {
    it('should succeed with POS and BUTTON=OK (no bridge, warns)', async () => {
      const ctx = createMockContext({ POS: '1', BUTTON: 'OK' });
      const result = await onDialogHandler(ctx);

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(ctx._logs.some((l: any) => l.level === 'warn' && l.message.includes('No dialog bridge'))).toBe(true);
    });

    it('should return MISSING_PARAMETER when POS is absent', async () => {
      const ctx = createMockContext({ BUTTON: 'OK' });
      const result = await onDialogHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(result.errorMessage).toContain('POS');
    });

    it('should return MISSING_PARAMETER when BUTTON is absent', async () => {
      const ctx = createMockContext({ POS: '1' });
      const result = await onDialogHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    });

    it('should return INVALID_PARAMETER for non-numeric POS', async () => {
      const ctx = createMockContext({ POS: 'xyz', BUTTON: 'OK' });
      const result = await onDialogHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(result.errorMessage).toContain('Invalid POS');
    });

    it('should return INVALID_PARAMETER for POS=0', async () => {
      const ctx = createMockContext({ POS: '0', BUTTON: 'OK' });
      const result = await onDialogHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    });

    it('should set CONTENT variable and include it in message payload', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({ POS: '2', BUTTON: 'YES', CONTENT: 'hello world' });
      const result = await onDialogHandler(ctx);

      expect(result.success).toBe(true);
      expect(ctx._vars.get('!DIALOG_CONTENT')).toBe('hello world');

      const msg = (bridge.sendMessage as any).mock.calls[0][0] as DialogOperationMessage;
      expect((msg as any).payload.config.content).toBe('hello world');
    });

    it('should include timeout from !TIMEOUT_STEP (number) in payload', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setDialogBridge(bridge);

      const vars = new Map<string, any>();
      vars.set('!TIMEOUT_STEP', 5);
      const ctx = createMockContext({ POS: '1', BUTTON: 'OK' }, vars);
      await onDialogHandler(ctx);

      const msg = (bridge.sendMessage as any).mock.calls[0][0];
      expect(msg.payload.config.timeout).toBe(5);
    });

    it('should include timeout from !TIMEOUT_STEP (string) in payload', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setDialogBridge(bridge);

      const vars = new Map<string, any>();
      vars.set('!TIMEOUT_STEP', '10.5');
      const ctx = createMockContext({ POS: '1', BUTTON: 'OK' }, vars);
      await onDialogHandler(ctx);

      const msg = (bridge.sendMessage as any).mock.calls[0][0];
      expect(msg.payload.config.timeout).toBe(10.5);
    });

    it('should omit timeout when !TIMEOUT_STEP is not set', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({ POS: '1', BUTTON: 'OK' });
      await onDialogHandler(ctx);

      const msg = (bridge.sendMessage as any).mock.calls[0][0];
      expect(msg.payload.config.timeout).toBeUndefined();
    });

    it('should return SCRIPT_ERROR when bridge returns failure', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: false, error: 'bridge err' }),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({ POS: '1', BUTTON: 'OK' });
      const result = await onDialogHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toBe('bridge err');
    });

    it('should use fallback error message when bridge returns failure without error text', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: false }),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({ POS: '1', BUTTON: 'OK' });
      const result = await onDialogHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Failed to configure dialog handler');
    });

    it('should handle bridge throwing an Error', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockRejectedValue(new Error('bridge crash')),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({ POS: '1', BUTTON: 'OK' });
      const result = await onDialogHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('bridge crash');
      expect(ctx._logs.some((l: any) => l.level === 'error')).toBe(true);
    });

    it('should handle bridge throwing a non-Error value', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockRejectedValue('string-error'),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({ POS: '1', BUTTON: 'OK' });
      const result = await onDialogHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('string-error');
    });

    it('should default invalid button values to CANCEL (parseButton)', async () => {
      const ctx = createMockContext({ POS: '1', BUTTON: 'INVALID_BUTTON' });
      const result = await onDialogHandler(ctx);

      expect(result.success).toBe(true);
      expect(ctx._vars.get('!DIALOG_BUTTON')).toBe('CANCEL');
    });

    it('should send append=true and all dialogTypes in payload', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({ POS: '3', BUTTON: 'NO' });
      await onDialogHandler(ctx);

      const msg = (bridge.sendMessage as any).mock.calls[0][0];
      expect(msg.payload.append).toBe(true);
      expect(msg.payload.dialogTypes).toEqual(['alert', 'confirm', 'prompt', 'beforeunload']);
      expect(msg.payload.config.pos).toBe(3);
      expect(msg.payload.config.button).toBe('NO');
      expect(msg.payload.config.active).toBe(true);
    });
  });

  // =========================================================================
  // onLoginHandler - encryption branch coverage (lines 451-461)
  // =========================================================================

  describe('onLoginHandler', () => {
    it('should succeed with plain (unencrypted) password', async () => {
      const ctx = createMockContext({ USER: 'admin', PASSWORD: 'secret' });
      const result = await onLoginHandler(ctx);

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(ctx._vars.get('!LOGIN_USER')).toBe('admin');
      expect(ctx._vars.get('!LOGIN_PASSWORD')).toBe('secret');
    });

    it('should return MISSING_PARAMETER when USER is absent', async () => {
      const ctx = createMockContext({ PASSWORD: 'secret' });
      const result = await onLoginHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(result.errorMessage).toContain('USER');
    });

    it('should return MISSING_PARAMETER when PASSWORD is absent', async () => {
      const ctx = createMockContext({ USER: 'admin' });
      const result = await onLoginHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(result.errorMessage).toContain('PASSWORD');
    });

    it('should decrypt encrypted password when !ENCRYPTION is set and isEncrypted returns true', async () => {
      (isEncrypted as any).mockReturnValue(true);
      (decryptString as any).mockReturnValue('decrypted_password');

      const vars = new Map<string, any>();
      vars.set('!ENCRYPTION', 'mykey');
      const ctx = createMockContext({ USER: 'admin', PASSWORD: 'ENC:encrypted_data' }, vars);

      const result = await onLoginHandler(ctx);

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(isEncrypted).toHaveBeenCalledWith('ENC:encrypted_data');
      expect(decryptString).toHaveBeenCalledWith('ENC:encrypted_data', 'mykey');
      expect(ctx._vars.get('!LOGIN_PASSWORD')).toBe('decrypted_password');
    });

    it('should return error result when decryption throws EncryptionError (lines 454-459)', async () => {
      const encError = new EncryptionError('bad password', 942);
      (isEncrypted as any).mockReturnValue(true);
      (decryptString as any).mockImplementation(() => { throw encError; });

      const vars = new Map<string, any>();
      vars.set('!ENCRYPTION', 'wrongkey');
      const ctx = createMockContext({ USER: 'admin', PASSWORD: 'ENC:encrypted_data' }, vars);

      const result = await onLoginHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(942);
      expect(result.errorMessage).toContain('ONLOGIN password decryption failed');
      expect(result.errorMessage).toContain('bad password');
    });

    it('should re-throw non-EncryptionError exceptions from decryption (lines 460-461)', async () => {
      const genericError = new TypeError('unexpected type error');
      (isEncrypted as any).mockReturnValue(true);
      (decryptString as any).mockImplementation(() => { throw genericError; });

      const vars = new Map<string, any>();
      vars.set('!ENCRYPTION', 'mykey');
      const ctx = createMockContext({ USER: 'admin', PASSWORD: 'ENC:encrypted_data' }, vars);

      await expect(onLoginHandler(ctx)).rejects.toThrow(TypeError);
      await expect(onLoginHandler(ctx)).rejects.toThrow('unexpected type error');
    });

    it('should not attempt decryption when !ENCRYPTION is empty string', async () => {
      (isEncrypted as any).mockReturnValue(true);

      const vars = new Map<string, any>();
      vars.set('!ENCRYPTION', '');
      const ctx = createMockContext({ USER: 'admin', PASSWORD: 'ENC:encrypted_data' }, vars);

      const result = await onLoginHandler(ctx);

      expect(result.success).toBe(true);
      expect(decryptString).not.toHaveBeenCalled();
    });

    it('should not attempt decryption when !ENCRYPTION is not set', async () => {
      (isEncrypted as any).mockReturnValue(true);

      const ctx = createMockContext({ USER: 'admin', PASSWORD: 'ENC:encrypted_data' });

      const result = await onLoginHandler(ctx);

      expect(result.success).toBe(true);
      expect(decryptString).not.toHaveBeenCalled();
    });

    it('should not attempt decryption when isEncrypted returns false', async () => {
      (isEncrypted as any).mockReturnValue(false);

      const vars = new Map<string, any>();
      vars.set('!ENCRYPTION', 'mykey');
      const ctx = createMockContext({ USER: 'admin', PASSWORD: 'plaintext' }, vars);

      const result = await onLoginHandler(ctx);

      expect(result.success).toBe(true);
      expect(decryptString).not.toHaveBeenCalled();
      expect(ctx._vars.get('!LOGIN_PASSWORD')).toBe('plaintext');
    });

    it('should include timeout from !TIMEOUT_STEP (number) in payload', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setDialogBridge(bridge);

      const vars = new Map<string, any>();
      vars.set('!TIMEOUT_STEP', 7);
      const ctx = createMockContext({ USER: 'admin', PASSWORD: 'pass' }, vars);
      await onLoginHandler(ctx);

      const msg = (bridge.sendMessage as any).mock.calls[0][0];
      expect(msg.payload.config.timeout).toBe(7);
    });

    it('should include timeout from !TIMEOUT_STEP (string) in payload', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setDialogBridge(bridge);

      const vars = new Map<string, any>();
      vars.set('!TIMEOUT_STEP', '3.5');
      const ctx = createMockContext({ USER: 'admin', PASSWORD: 'pass' }, vars);
      await onLoginHandler(ctx);

      const msg = (bridge.sendMessage as any).mock.calls[0][0];
      expect(msg.payload.config.timeout).toBe(3.5);
    });

    it('should omit timeout when !TIMEOUT_STEP is not set', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({ USER: 'admin', PASSWORD: 'pass' });
      await onLoginHandler(ctx);

      const msg = (bridge.sendMessage as any).mock.calls[0][0];
      expect(msg.payload.config.timeout).toBeUndefined();
    });

    it('should send LOGIN_CONFIG with append=true via bridge', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({ USER: 'admin', PASSWORD: 'pass123' });
      const result = await onLoginHandler(ctx);

      expect(result.success).toBe(true);
      const msg = (bridge.sendMessage as any).mock.calls[0][0];
      expect(msg.type).toBe('LOGIN_CONFIG');
      expect(msg.payload.config.user).toBe('admin');
      expect(msg.payload.config.password).toBe('pass123');
      expect(msg.payload.config.active).toBe(true);
      expect(msg.payload.append).toBe(true);
    });

    it('should return SCRIPT_ERROR when bridge returns failure', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: false, error: 'login bridge fail' }),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({ USER: 'admin', PASSWORD: 'pass' });
      const result = await onLoginHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toBe('login bridge fail');
    });

    it('should use fallback error message when bridge fails without error text', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: false }),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({ USER: 'admin', PASSWORD: 'pass' });
      const result = await onLoginHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Failed to configure login handler');
    });

    it('should handle bridge exception (Error object)', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockRejectedValue(new Error('timeout')),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({ USER: 'admin', PASSWORD: 'pass' });
      const result = await onLoginHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('timeout');
    });

    it('should log info message with USER', async () => {
      const ctx = createMockContext({ USER: 'testuser', PASSWORD: 'testpass' });
      await onLoginHandler(ctx);

      expect(ctx._logs.some((l: any) => l.level === 'info' && l.message.includes('USER=testuser'))).toBe(true);
    });
  });

  // =========================================================================
  // onCertificateDialogHandler
  // =========================================================================

  describe('onCertificateDialogHandler', () => {
    it('should default to BUTTON=OK when BUTTON is not provided', async () => {
      const ctx = createMockContext({});
      const result = await onCertificateDialogHandler(ctx);

      expect(result.success).toBe(true);
      expect(ctx._vars.get('!CERTIFICATE_BUTTON')).toBe('OK');
    });

    it('should use BUTTON=CANCEL when provided', async () => {
      const ctx = createMockContext({ BUTTON: 'CANCEL' });
      const result = await onCertificateDialogHandler(ctx);

      expect(result.success).toBe(true);
      expect(ctx._vars.get('!CERTIFICATE_BUTTON')).toBe('CANCEL');
    });

    it('should default invalid button to CANCEL', async () => {
      const ctx = createMockContext({ BUTTON: 'GARBAGE' });
      const result = await onCertificateDialogHandler(ctx);

      expect(result.success).toBe(true);
      expect(ctx._vars.get('!CERTIFICATE_BUTTON')).toBe('CANCEL');
    });

    it('should send CERTIFICATE_CONFIG via bridge', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({ BUTTON: 'OK' });
      const result = await onCertificateDialogHandler(ctx);

      expect(result.success).toBe(true);
      const msg = (bridge.sendMessage as any).mock.calls[0][0];
      expect(msg.type).toBe('CERTIFICATE_CONFIG');
      expect(msg.payload.config.button).toBe('OK');
      expect(msg.payload.config.active).toBe(true);
    });

    it('should return SCRIPT_ERROR when bridge returns failure', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: false, error: 'cert rejected' }),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({ BUTTON: 'OK' });
      const result = await onCertificateDialogHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toBe('cert rejected');
    });

    it('should use fallback error message when bridge fails without error text', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: false }),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({});
      const result = await onCertificateDialogHandler(ctx);

      expect(result.errorMessage).toBe('Failed to configure certificate dialog handler');
    });

    it('should handle bridge throwing an Error', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockRejectedValue(new Error('cert exception')),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({});
      const result = await onCertificateDialogHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('cert exception');
    });
  });

  // =========================================================================
  // onErrorDialogHandler
  // =========================================================================

  describe('onErrorDialogHandler', () => {
    it('should set stopOnError=true when CONTINUE=NO', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({ BUTTON: 'OK', CONTINUE: 'NO' });
      const result = await onErrorDialogHandler(ctx);

      expect(result.success).toBe(true);
      const msg = (bridge.sendMessage as any).mock.calls[0][0];
      expect(msg.payload.config.stopOnError).toBe(true);
    });

    it('should set stopOnError=true when CONTINUE=FALSE', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({ CONTINUE: 'FALSE' });
      const result = await onErrorDialogHandler(ctx);

      expect(result.success).toBe(true);
      const msg = (bridge.sendMessage as any).mock.calls[0][0];
      expect(msg.payload.config.stopOnError).toBe(true);
    });

    it('should set stopOnError=true when CONTINUE=no (case-insensitive)', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({ CONTINUE: 'no' });
      const result = await onErrorDialogHandler(ctx);

      expect(result.success).toBe(true);
      const msg = (bridge.sendMessage as any).mock.calls[0][0];
      expect(msg.payload.config.stopOnError).toBe(true);
    });

    it('should set stopOnError=false when CONTINUE is not provided', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({ BUTTON: 'OK' });
      const result = await onErrorDialogHandler(ctx);

      expect(result.success).toBe(true);
      const msg = (bridge.sendMessage as any).mock.calls[0][0];
      expect(msg.payload.config.stopOnError).toBe(false);
    });

    it('should set stopOnError=false when CONTINUE=YES', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({ CONTINUE: 'YES' });
      const result = await onErrorDialogHandler(ctx);

      expect(result.success).toBe(true);
      const msg = (bridge.sendMessage as any).mock.calls[0][0];
      expect(msg.payload.config.stopOnError).toBe(false);
    });

    it('should default to BUTTON=OK when BUTTON is not provided', async () => {
      const ctx = createMockContext({});
      const result = await onErrorDialogHandler(ctx);

      expect(result.success).toBe(true);
      expect(ctx._vars.get('!ERROR_DIALOG_BUTTON')).toBe('OK');
    });

    it('should return SCRIPT_ERROR when bridge returns failure', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: false, error: 'error dialog fail' }),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({ BUTTON: 'OK' });
      const result = await onErrorDialogHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toBe('error dialog fail');
    });

    it('should use fallback error message when bridge fails without error text', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: false }),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({});
      const result = await onErrorDialogHandler(ctx);

      expect(result.errorMessage).toBe('Failed to configure error dialog handler');
    });

    it('should handle bridge throwing an Error', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockRejectedValue(new Error('error dialog throw')),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({});
      const result = await onErrorDialogHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('error dialog throw');
    });

    it('should include CONTINUE in log message when provided', async () => {
      const ctx = createMockContext({ BUTTON: 'OK', CONTINUE: 'NO' });
      await onErrorDialogHandler(ctx);

      expect(ctx._logs.some((l: any) => l.level === 'info' && l.message.includes('CONTINUE=NO'))).toBe(true);
    });
  });

  // =========================================================================
  // onSecurityDialogHandler
  // =========================================================================

  describe('onSecurityDialogHandler', () => {
    it('should default to BUTTON=OK when BUTTON is not provided', async () => {
      const ctx = createMockContext({});
      const result = await onSecurityDialogHandler(ctx);

      expect(result.success).toBe(true);
      expect(ctx._vars.get('!SECURITY_DIALOG_BUTTON')).toBe('OK');
    });

    it('should use BUTTON=CANCEL when provided', async () => {
      const ctx = createMockContext({ BUTTON: 'CANCEL' });
      const result = await onSecurityDialogHandler(ctx);

      expect(result.success).toBe(true);
      expect(ctx._vars.get('!SECURITY_DIALOG_BUTTON')).toBe('CANCEL');
    });

    it('should send SECURITY_DIALOG_CONFIG via bridge', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({ BUTTON: 'OK' });
      const result = await onSecurityDialogHandler(ctx);

      expect(result.success).toBe(true);
      const msg = (bridge.sendMessage as any).mock.calls[0][0];
      expect(msg.type).toBe('SECURITY_DIALOG_CONFIG');
      expect(msg.payload.config.button).toBe('OK');
      expect(msg.payload.config.active).toBe(true);
    });

    it('should return SCRIPT_ERROR when bridge returns failure', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: false, error: 'sec fail' }),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({});
      const result = await onSecurityDialogHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toBe('sec fail');
    });

    it('should use fallback error message when bridge fails without error text', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: false }),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({});
      const result = await onSecurityDialogHandler(ctx);

      expect(result.errorMessage).toBe('Failed to configure security dialog handler');
    });

    it('should handle bridge throwing an Error', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockRejectedValue(new Error('sec throw')),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({});
      const result = await onSecurityDialogHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('sec throw');
    });
  });

  // =========================================================================
  // onWebPageDialogHandler
  // =========================================================================

  describe('onWebPageDialogHandler', () => {
    it('should default to BUTTON=OK when BUTTON is not provided', async () => {
      const ctx = createMockContext({});
      const result = await onWebPageDialogHandler(ctx);

      expect(result.success).toBe(true);
      expect(ctx._vars.get('!WEBPAGE_DIALOG_BUTTON')).toBe('OK');
    });

    it('should set CONTENT variable when CONTENT param is provided', async () => {
      const ctx = createMockContext({ BUTTON: 'OK', CONTENT: 'response text' });
      const result = await onWebPageDialogHandler(ctx);

      expect(result.success).toBe(true);
      expect(ctx._vars.get('!WEBPAGE_DIALOG_CONTENT')).toBe('response text');
    });

    it('should not set CONTENT variable when CONTENT is absent', async () => {
      const ctx = createMockContext({ BUTTON: 'OK' });
      await onWebPageDialogHandler(ctx);

      expect(ctx._vars.has('!WEBPAGE_DIALOG_CONTENT')).toBe(false);
    });

    it('should include CONTENT in log message when present', async () => {
      const ctx = createMockContext({ BUTTON: 'OK', CONTENT: 'val' });
      await onWebPageDialogHandler(ctx);

      expect(ctx._logs.some((l: any) => l.level === 'info' && l.message.includes('CONTENT=val'))).toBe(true);
    });

    it('should not include CONTENT in log message when absent', async () => {
      const ctx = createMockContext({ BUTTON: 'OK' });
      await onWebPageDialogHandler(ctx);

      const infoLog = ctx._logs.find((l: any) => l.level === 'info' && l.message.includes('web page dialog'));
      expect(infoLog).toBeDefined();
      expect(infoLog.message).not.toContain('CONTENT=');
    });

    it('should send WEBPAGE_DIALOG_CONFIG with content via bridge', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({ BUTTON: 'CANCEL', CONTENT: 'my content' });
      const result = await onWebPageDialogHandler(ctx);

      expect(result.success).toBe(true);
      const msg = (bridge.sendMessage as any).mock.calls[0][0];
      expect(msg.type).toBe('WEBPAGE_DIALOG_CONFIG');
      expect(msg.payload.config.button).toBe('CANCEL');
      expect(msg.payload.config.content).toBe('my content');
      expect(msg.payload.config.active).toBe(true);
    });

    it('should return SCRIPT_ERROR when bridge returns failure', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: false, error: 'web fail' }),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({ BUTTON: 'OK' });
      const result = await onWebPageDialogHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toBe('web fail');
    });

    it('should use fallback error message when bridge fails without error text', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: false }),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({});
      const result = await onWebPageDialogHandler(ctx);

      expect(result.errorMessage).toBe('Failed to configure web page dialog handler');
    });

    it('should handle bridge throwing an Error', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockRejectedValue(new Error('web throw')),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({});
      const result = await onWebPageDialogHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('web throw');
    });
  });

  // =========================================================================
  // onPrintHandler
  // =========================================================================

  describe('onPrintHandler', () => {
    it('should default to BUTTON=OK when BUTTON is not provided', async () => {
      const ctx = createMockContext({});
      const result = await onPrintHandler(ctx);

      expect(result.success).toBe(true);
      expect(ctx._vars.get('!PRINT_BUTTON')).toBe('OK');
    });

    it('should use BUTTON=CANCEL when provided', async () => {
      const ctx = createMockContext({ BUTTON: 'CANCEL' });
      const result = await onPrintHandler(ctx);

      expect(result.success).toBe(true);
      expect(ctx._vars.get('!PRINT_BUTTON')).toBe('CANCEL');
    });

    it('should send PRINT_CONFIG via bridge', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({ BUTTON: 'OK' });
      const result = await onPrintHandler(ctx);

      expect(result.success).toBe(true);
      const msg = (bridge.sendMessage as any).mock.calls[0][0];
      expect(msg.type).toBe('PRINT_CONFIG');
      expect(msg.payload.config.button).toBe('OK');
      expect(msg.payload.config.active).toBe(true);
    });

    it('should return SCRIPT_ERROR when bridge returns failure', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: false, error: 'print fail' }),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({ BUTTON: 'OK' });
      const result = await onPrintHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toBe('print fail');
    });

    it('should use fallback error message when bridge fails without error text', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: false }),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({});
      const result = await onPrintHandler(ctx);

      expect(result.errorMessage).toBe('Failed to configure print dialog handler');
    });

    it('should handle bridge throwing an Error', async () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockRejectedValue(new Error('print throw')),
      };
      setDialogBridge(bridge);

      const ctx = createMockContext({});
      const result = await onPrintHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('print throw');
    });
  });

  // =========================================================================
  // dialogHandlers map and registerDialogHandlers
  // =========================================================================

  describe('dialogHandlers', () => {
    it('should map all 7 dialog command types to their handlers', () => {
      expect(dialogHandlers.ONDIALOG).toBe(onDialogHandler);
      expect(dialogHandlers.ONLOGIN).toBe(onLoginHandler);
      expect(dialogHandlers.ONCERTIFICATEDIALOG).toBe(onCertificateDialogHandler);
      expect(dialogHandlers.ONERRORDIALOG).toBe(onErrorDialogHandler);
      expect(dialogHandlers.ONSECURITYDIALOG).toBe(onSecurityDialogHandler);
      expect(dialogHandlers.ONWEBPAGEDIALOG).toBe(onWebPageDialogHandler);
      expect(dialogHandlers.ONPRINT).toBe(onPrintHandler);
    });

    it('should have exactly 7 entries', () => {
      expect(Object.keys(dialogHandlers)).toHaveLength(7);
    });
  });

  describe('registerDialogHandlers', () => {
    it('should call registerFn for each of the 7 handlers', () => {
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

  // =========================================================================
  // setDialogBridge / getDialogBridge
  // =========================================================================

  describe('setDialogBridge / getDialogBridge', () => {
    it('should return null when no bridge is set', () => {
      expect(getDialogBridge()).toBeNull();
    });

    it('should store and return a bridge', () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setDialogBridge(bridge);
      expect(getDialogBridge()).toBe(bridge);
    });
  });
});
