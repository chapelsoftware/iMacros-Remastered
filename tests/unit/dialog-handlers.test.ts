/**
 * Dialog Command Handlers Unit Tests
 *
 * Comprehensive unit tests for ALL 7 dialog command handlers in
 * shared/src/commands/dialogs.ts, plus helper functions setDialogBridge,
 * getDialogBridge, and registerDialogHandlers.
 *
 * Covers: ONDIALOG, ONLOGIN, ONCERTIFICATEDIALOG, ONERRORDIALOG,
 * ONSECURITYDIALOG, ONWEBPAGEDIALOG, ONPRINT
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createExecutor, MacroExecutor, IMACROS_ERROR_CODES } from '../../shared/src/executor';
import {
  registerDialogHandlers,
  setDialogBridge,
  getDialogBridge,
  DialogBridge,
  DialogOperationMessage,
  DialogConfigResponse,
  DialogConfigMessage,
  LoginConfigMessage,
  CertificateConfigMessage,
  ErrorDialogConfigMessage,
  SecurityDialogConfigMessage,
  WebPageDialogConfigMessage,
  PrintConfigMessage,
  dialogHandlers,
} from '../../shared/src/commands/dialogs';

describe('Dialog Command Handlers Unit Tests', () => {
  let executor: MacroExecutor;
  let mockBridge: DialogBridge;
  let sentMessages: DialogOperationMessage[];

  beforeEach(() => {
    sentMessages = [];
    mockBridge = {
      sendMessage: vi.fn(async (msg: DialogOperationMessage): Promise<DialogConfigResponse> => {
        sentMessages.push(msg);
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

  // =========================================================================
  // ONDIALOG
  // =========================================================================

  describe('ONDIALOG handler', () => {
    it('should send DIALOG_CONFIG with pos=1, button=OK, active=true', async () => {
      executor.loadMacro('ONDIALOG POS=1 BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as DialogConfigMessage;
      expect(msg.type).toBe('DIALOG_CONFIG');
      expect(msg.payload.config.pos).toBe(1);
      expect(msg.payload.config.button).toBe('OK');
      expect(msg.payload.config.active).toBe(true);
      expect(msg.payload.dialogTypes).toEqual(['alert', 'confirm', 'prompt', 'beforeunload']);
    });

    it('should send button=CANCEL for BUTTON=CANCEL', async () => {
      executor.loadMacro('ONDIALOG POS=1 BUTTON=CANCEL');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as DialogConfigMessage;
      expect(msg.payload.config.button).toBe('CANCEL');
    });

    it('should send button=YES for BUTTON=YES', async () => {
      executor.loadMacro('ONDIALOG POS=1 BUTTON=YES');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as DialogConfigMessage;
      expect(msg.payload.config.button).toBe('YES');
    });

    it('should send button=NO for BUTTON=NO', async () => {
      executor.loadMacro('ONDIALOG POS=1 BUTTON=NO');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as DialogConfigMessage;
      expect(msg.payload.config.button).toBe('NO');
    });

    it('should include CONTENT when provided', async () => {
      executor.loadMacro('ONDIALOG POS=1 BUTTON=OK CONTENT=hello');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as DialogConfigMessage;
      expect(msg.payload.config.content).toBe('hello');
    });

    it('should handle POS=2', async () => {
      executor.loadMacro('ONDIALOG POS=2 BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as DialogConfigMessage;
      expect(msg.payload.config.pos).toBe(2);
    });

    it('should return MISSING_PARAMETER when POS is missing', async () => {
      executor.loadMacro('ONDIALOG BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(sentMessages).toHaveLength(0);
    });

    it('should return MISSING_PARAMETER when BUTTON is missing', async () => {
      executor.loadMacro('ONDIALOG POS=1');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(sentMessages).toHaveLength(0);
    });

    it('should return INVALID_PARAMETER for POS=0', async () => {
      executor.loadMacro('ONDIALOG POS=0 BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(sentMessages).toHaveLength(0);
    });

    it('should return INVALID_PARAMETER for POS=-1', async () => {
      executor.loadMacro('ONDIALOG POS=-1 BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(sentMessages).toHaveLength(0);
    });

    it('should return INVALID_PARAMETER for non-numeric POS', async () => {
      executor.loadMacro('ONDIALOG POS=abc BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(sentMessages).toHaveLength(0);
    });

    it('should default unknown BUTTON value to OK', async () => {
      executor.loadMacro('ONDIALOG POS=1 BUTTON=UNKNOWN');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as DialogConfigMessage;
      expect(msg.payload.config.button).toBe('OK');
    });

    it('should expand variables in CONTENT', async () => {
      const script = [
        'SET !VAR1 myresponse',
        'ONDIALOG POS=1 BUTTON=YES CONTENT={{!VAR1}}',
      ].join('\n');

      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);
      const msg = sentMessages[0] as DialogConfigMessage;
      expect(msg.payload.config.content).toBe('myresponse');
      expect(msg.payload.config.button).toBe('YES');
    });

    it('should return SCRIPT_ERROR when bridge returns failure', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<DialogConfigResponse> => {
        return { success: false, error: 'Bridge rejected' };
      });

      executor.loadMacro('ONDIALOG POS=1 BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    });

    it('should return SCRIPT_ERROR when bridge throws', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<DialogConfigResponse> => {
        throw new Error('Connection lost');
      });

      executor.loadMacro('ONDIALOG POS=1 BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    });

    it('should return success when no bridge is configured', async () => {
      setDialogBridge(null as unknown as DialogBridge);

      executor.loadMacro('ONDIALOG POS=1 BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(0);
    });

    it('should include id and timestamp in the message', async () => {
      executor.loadMacro('ONDIALOG POS=1 BUTTON=OK');
      await executor.execute();

      const msg = sentMessages[0];
      expect(msg.id).toBeDefined();
      expect(typeof msg.id).toBe('string');
      expect(msg.id).toMatch(/^dialog_/);
      expect(msg.timestamp).toBeDefined();
      expect(typeof msg.timestamp).toBe('number');
    });
  });

  // =========================================================================
  // ONLOGIN
  // =========================================================================

  describe('ONLOGIN handler', () => {
    it('should send LOGIN_CONFIG with user/password and active=true', async () => {
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
    });

    it('should return MISSING_PARAMETER when USER is missing', async () => {
      executor.loadMacro('ONLOGIN PASSWORD=secret');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(result.errorMessage).toContain('USER');
      expect(sentMessages).toHaveLength(0);
    });

    it('should return MISSING_PARAMETER when PASSWORD is missing', async () => {
      executor.loadMacro('ONLOGIN USER=admin');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(result.errorMessage).toContain('PASSWORD');
      expect(sentMessages).toHaveLength(0);
    });

    it('should expand variables in USER and PASSWORD', async () => {
      const script = [
        'SET !VAR1 myuser',
        'SET !VAR2 mypass',
        'ONLOGIN USER={{!VAR1}} PASSWORD={{!VAR2}}',
      ].join('\n');

      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);
      const msg = sentMessages[0] as LoginConfigMessage;
      expect(msg.payload.config.user).toBe('myuser');
      expect(msg.payload.config.password).toBe('mypass');
    });

    it('should return SCRIPT_ERROR when bridge returns failure', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<DialogConfigResponse> => {
        return { success: false, error: 'Login config rejected' };
      });

      executor.loadMacro('ONLOGIN USER=admin PASSWORD=secret');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    });

    it('should return SCRIPT_ERROR when bridge throws', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<DialogConfigResponse> => {
        throw new Error('Network error');
      });

      executor.loadMacro('ONLOGIN USER=admin PASSWORD=secret');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    });

    it('should return success when no bridge is configured', async () => {
      setDialogBridge(null as unknown as DialogBridge);

      executor.loadMacro('ONLOGIN USER=admin PASSWORD=secret');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(0);
    });

    it('should send message with correct config for various credentials', async () => {
      executor.loadMacro('ONLOGIN USER=john PASSWORD=pass123');
      await executor.execute();

      expect(sentMessages).toHaveLength(1);
      const msg = sentMessages[0] as LoginConfigMessage;
      expect(msg.payload.config.user).toBe('john');
      expect(msg.payload.config.password).toBe('pass123');
      expect(msg.payload.config.active).toBe(true);
    });
  });

  // =========================================================================
  // ONCERTIFICATEDIALOG
  // =========================================================================

  describe('ONCERTIFICATEDIALOG handler', () => {
    it('should send CERTIFICATE_CONFIG with button=OK and active=true', async () => {
      executor.loadMacro('ONCERTIFICATEDIALOG BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as CertificateConfigMessage;
      expect(msg.type).toBe('CERTIFICATE_CONFIG');
      expect(msg.payload.config.button).toBe('OK');
      expect(msg.payload.config.active).toBe(true);
    });

    it('should send button=CANCEL for BUTTON=CANCEL', async () => {
      executor.loadMacro('ONCERTIFICATEDIALOG BUTTON=CANCEL');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as CertificateConfigMessage;
      expect(msg.payload.config.button).toBe('CANCEL');
    });

    it('should default to OK when no BUTTON is specified', async () => {
      executor.loadMacro('ONCERTIFICATEDIALOG');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);
      const msg = sentMessages[0] as CertificateConfigMessage;
      expect(msg.payload.config.button).toBe('OK');
    });

    it('should return SCRIPT_ERROR when bridge returns failure', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<DialogConfigResponse> => {
        return { success: false, error: 'Certificate config rejected' };
      });

      executor.loadMacro('ONCERTIFICATEDIALOG BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    });

    it('should return SCRIPT_ERROR when bridge throws', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<DialogConfigResponse> => {
        throw new Error('Bridge exploded');
      });

      executor.loadMacro('ONCERTIFICATEDIALOG BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    });

    it('should return success when no bridge is configured', async () => {
      setDialogBridge(null as unknown as DialogBridge);

      executor.loadMacro('ONCERTIFICATEDIALOG BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(0);
    });

    it('should send CANCEL config through bridge', async () => {
      executor.loadMacro('ONCERTIFICATEDIALOG BUTTON=CANCEL');
      await executor.execute();

      expect(sentMessages).toHaveLength(1);
      const msg = sentMessages[0] as CertificateConfigMessage;
      expect(msg.payload.config.button).toBe('CANCEL');
      expect(msg.payload.config.active).toBe(true);
    });
  });

  // =========================================================================
  // ONERRORDIALOG
  // =========================================================================

  describe('ONERRORDIALOG handler', () => {
    it('should send ERROR_DIALOG_CONFIG with button=OK and active=true', async () => {
      executor.loadMacro('ONERRORDIALOG BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as ErrorDialogConfigMessage;
      expect(msg.type).toBe('ERROR_DIALOG_CONFIG');
      expect(msg.payload.config.button).toBe('OK');
      expect(msg.payload.config.active).toBe(true);
    });

    it('should default to OK when no BUTTON is specified', async () => {
      executor.loadMacro('ONERRORDIALOG');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);
      const msg = sentMessages[0] as ErrorDialogConfigMessage;
      expect(msg.payload.config.button).toBe('OK');
    });

    it('should return SCRIPT_ERROR when bridge returns failure', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<DialogConfigResponse> => {
        return { success: false, error: 'Error dialog config rejected' };
      });

      executor.loadMacro('ONERRORDIALOG BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    });

    it('should return SCRIPT_ERROR when bridge throws', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<DialogConfigResponse> => {
        throw new Error('Bridge failure');
      });

      executor.loadMacro('ONERRORDIALOG BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    });

    it('should return success when no bridge is configured', async () => {
      setDialogBridge(null as unknown as DialogBridge);

      executor.loadMacro('ONERRORDIALOG BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(0);
    });

    it('should send OK config through bridge', async () => {
      executor.loadMacro('ONERRORDIALOG BUTTON=OK');
      await executor.execute();

      expect(sentMessages).toHaveLength(1);
      const msg = sentMessages[0] as ErrorDialogConfigMessage;
      expect(msg.payload.config.button).toBe('OK');
      expect(msg.payload.config.active).toBe(true);
    });

    it('should send stopOnError=true when CONTINUE=NO', async () => {
      executor.loadMacro('ONERRORDIALOG BUTTON=OK CONTINUE=NO');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);
      const msg = sentMessages[0] as ErrorDialogConfigMessage;
      expect(msg.payload.config.stopOnError).toBe(true);
    });

    it('should send stopOnError=true when CONTINUE=FALSE', async () => {
      executor.loadMacro('ONERRORDIALOG CONTINUE=FALSE');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);
      const msg = sentMessages[0] as ErrorDialogConfigMessage;
      expect(msg.payload.config.stopOnError).toBe(true);
    });

    it('should send stopOnError=false when CONTINUE not specified', async () => {
      executor.loadMacro('ONERRORDIALOG BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);
      const msg = sentMessages[0] as ErrorDialogConfigMessage;
      expect(msg.payload.config.stopOnError).toBe(false);
    });

    it('should send stopOnError=false when CONTINUE=YES', async () => {
      executor.loadMacro('ONERRORDIALOG BUTTON=OK CONTINUE=YES');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);
      const msg = sentMessages[0] as ErrorDialogConfigMessage;
      expect(msg.payload.config.stopOnError).toBe(false);
    });
  });

  // =========================================================================
  // ONSECURITYDIALOG
  // =========================================================================

  describe('ONSECURITYDIALOG handler', () => {
    it('should send SECURITY_DIALOG_CONFIG with button=OK and active=true', async () => {
      executor.loadMacro('ONSECURITYDIALOG BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SecurityDialogConfigMessage;
      expect(msg.type).toBe('SECURITY_DIALOG_CONFIG');
      expect(msg.payload.config.button).toBe('OK');
      expect(msg.payload.config.active).toBe(true);
    });

    it('should send button=CANCEL for BUTTON=CANCEL', async () => {
      executor.loadMacro('ONSECURITYDIALOG BUTTON=CANCEL');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as SecurityDialogConfigMessage;
      expect(msg.payload.config.button).toBe('CANCEL');
    });

    it('should default to OK when no BUTTON is specified', async () => {
      executor.loadMacro('ONSECURITYDIALOG');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);
      const msg = sentMessages[0] as SecurityDialogConfigMessage;
      expect(msg.payload.config.button).toBe('OK');
    });

    it('should return SCRIPT_ERROR when bridge returns failure', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<DialogConfigResponse> => {
        return { success: false, error: 'Security config rejected' };
      });

      executor.loadMacro('ONSECURITYDIALOG BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    });

    it('should return SCRIPT_ERROR when bridge throws', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<DialogConfigResponse> => {
        throw new Error('Security bridge error');
      });

      executor.loadMacro('ONSECURITYDIALOG BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    });

    it('should return success when no bridge is configured', async () => {
      setDialogBridge(null as unknown as DialogBridge);

      executor.loadMacro('ONSECURITYDIALOG BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(0);
    });

    it('should send CANCEL config through bridge', async () => {
      executor.loadMacro('ONSECURITYDIALOG BUTTON=CANCEL');
      await executor.execute();

      expect(sentMessages).toHaveLength(1);
      const msg = sentMessages[0] as SecurityDialogConfigMessage;
      expect(msg.payload.config.button).toBe('CANCEL');
      expect(msg.payload.config.active).toBe(true);
    });
  });

  // =========================================================================
  // ONWEBPAGEDIALOG
  // =========================================================================

  describe('ONWEBPAGEDIALOG handler', () => {
    it('should send WEBPAGE_DIALOG_CONFIG with button=OK and active=true', async () => {
      executor.loadMacro('ONWEBPAGEDIALOG BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as WebPageDialogConfigMessage;
      expect(msg.type).toBe('WEBPAGE_DIALOG_CONFIG');
      expect(msg.payload.config.button).toBe('OK');
      expect(msg.payload.config.active).toBe(true);
    });

    it('should send button=CANCEL with CONTENT when both provided', async () => {
      executor.loadMacro('ONWEBPAGEDIALOG BUTTON=CANCEL CONTENT=response');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as WebPageDialogConfigMessage;
      expect(msg.payload.config.button).toBe('CANCEL');
      expect(msg.payload.config.content).toBe('response');
    });

    it('should default to OK when no BUTTON is specified', async () => {
      executor.loadMacro('ONWEBPAGEDIALOG');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);
      const msg = sentMessages[0] as WebPageDialogConfigMessage;
      expect(msg.payload.config.button).toBe('OK');
    });

    it('should not include content when CONTENT is not specified', async () => {
      executor.loadMacro('ONWEBPAGEDIALOG BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as WebPageDialogConfigMessage;
      expect(msg.payload.config.content).toBeUndefined();
    });

    it('should expand variables in CONTENT', async () => {
      const script = [
        'SET !VAR1 dynamicvalue',
        'ONWEBPAGEDIALOG BUTTON=OK CONTENT={{!VAR1}}',
      ].join('\n');

      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);
      const msg = sentMessages[0] as WebPageDialogConfigMessage;
      expect(msg.payload.config.content).toBe('dynamicvalue');
    });

    it('should return SCRIPT_ERROR when bridge returns failure', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<DialogConfigResponse> => {
        return { success: false, error: 'Web page dialog config rejected' };
      });

      executor.loadMacro('ONWEBPAGEDIALOG BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    });

    it('should return SCRIPT_ERROR when bridge throws', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<DialogConfigResponse> => {
        throw new Error('Webpage bridge error');
      });

      executor.loadMacro('ONWEBPAGEDIALOG BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    });

    it('should return success when no bridge is configured', async () => {
      setDialogBridge(null as unknown as DialogBridge);

      executor.loadMacro('ONWEBPAGEDIALOG BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(0);
    });

    it('should send CANCEL config with content through bridge', async () => {
      executor.loadMacro('ONWEBPAGEDIALOG BUTTON=CANCEL CONTENT=myreply');
      await executor.execute();

      expect(sentMessages).toHaveLength(1);
      const msg = sentMessages[0] as WebPageDialogConfigMessage;
      expect(msg.payload.config.button).toBe('CANCEL');
      expect(msg.payload.config.content).toBe('myreply');
      expect(msg.payload.config.active).toBe(true);
    });

    it('should send config without content when CONTENT is not given', async () => {
      executor.loadMacro('ONWEBPAGEDIALOG BUTTON=OK');
      await executor.execute();

      expect(sentMessages).toHaveLength(1);
      const msg = sentMessages[0] as WebPageDialogConfigMessage;
      expect(msg.payload.config.button).toBe('OK');
      expect(msg.payload.config.content).toBeUndefined();
      expect(msg.payload.config.active).toBe(true);
    });
  });

  // =========================================================================
  // ONPRINT
  // =========================================================================

  describe('ONPRINT handler', () => {
    it('should send PRINT_CONFIG with button=OK and active=true', async () => {
      executor.loadMacro('ONPRINT BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as PrintConfigMessage;
      expect(msg.type).toBe('PRINT_CONFIG');
      expect(msg.payload.config.button).toBe('OK');
      expect(msg.payload.config.active).toBe(true);
    });

    it('should send button=CANCEL for BUTTON=CANCEL', async () => {
      executor.loadMacro('ONPRINT BUTTON=CANCEL');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as PrintConfigMessage;
      expect(msg.payload.config.button).toBe('CANCEL');
    });

    it('should default to OK when no BUTTON is specified', async () => {
      executor.loadMacro('ONPRINT');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);
      const msg = sentMessages[0] as PrintConfigMessage;
      expect(msg.payload.config.button).toBe('OK');
    });

    it('should return SCRIPT_ERROR when bridge returns failure', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<DialogConfigResponse> => {
        return { success: false, error: 'Print config rejected' };
      });

      executor.loadMacro('ONPRINT BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    });

    it('should return SCRIPT_ERROR when bridge throws', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<DialogConfigResponse> => {
        throw new Error('Print bridge error');
      });

      executor.loadMacro('ONPRINT BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    });

    it('should return success when no bridge is configured', async () => {
      setDialogBridge(null as unknown as DialogBridge);

      executor.loadMacro('ONPRINT BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(0);
    });

    it('should send CANCEL config through bridge', async () => {
      executor.loadMacro('ONPRINT BUTTON=CANCEL');
      await executor.execute();

      expect(sentMessages).toHaveLength(1);
      const msg = sentMessages[0] as PrintConfigMessage;
      expect(msg.payload.config.button).toBe('CANCEL');
      expect(msg.payload.config.active).toBe(true);
    });
  });

  // =========================================================================
  // registerDialogHandlers
  // =========================================================================

  describe('registerDialogHandlers', () => {
    it('should register all 7 dialog handlers', () => {
      const registered: string[] = [];
      const mockRegisterFn = vi.fn((type: string) => {
        registered.push(type);
      });

      registerDialogHandlers(mockRegisterFn as any);

      expect(mockRegisterFn).toHaveBeenCalledTimes(7);
      expect(registered).toContain('ONDIALOG');
      expect(registered).toContain('ONLOGIN');
      expect(registered).toContain('ONCERTIFICATEDIALOG');
      expect(registered).toContain('ONERRORDIALOG');
      expect(registered).toContain('ONSECURITYDIALOG');
      expect(registered).toContain('ONWEBPAGEDIALOG');
      expect(registered).toContain('ONPRINT');
    });

    it('should pass the correct handler function for each command type', () => {
      const handlersMap = new Map<string, any>();
      const mockRegisterFn = vi.fn((type: string, handler: any) => {
        handlersMap.set(type, handler);
      });

      registerDialogHandlers(mockRegisterFn as any);

      expect(handlersMap.get('ONDIALOG')).toBe(dialogHandlers.ONDIALOG);
      expect(handlersMap.get('ONLOGIN')).toBe(dialogHandlers.ONLOGIN);
      expect(handlersMap.get('ONCERTIFICATEDIALOG')).toBe(dialogHandlers.ONCERTIFICATEDIALOG);
      expect(handlersMap.get('ONERRORDIALOG')).toBe(dialogHandlers.ONERRORDIALOG);
      expect(handlersMap.get('ONSECURITYDIALOG')).toBe(dialogHandlers.ONSECURITYDIALOG);
      expect(handlersMap.get('ONWEBPAGEDIALOG')).toBe(dialogHandlers.ONWEBPAGEDIALOG);
      expect(handlersMap.get('ONPRINT')).toBe(dialogHandlers.ONPRINT);
    });

    it('should have exactly 7 entries in the dialogHandlers record', () => {
      const entries = Object.entries(dialogHandlers).filter(([, handler]) => handler != null);
      expect(entries).toHaveLength(7);
    });
  });

  // =========================================================================
  // setDialogBridge / getDialogBridge
  // =========================================================================

  describe('setDialogBridge / getDialogBridge', () => {
    it('should set and get bridge correctly', () => {
      const bridge: DialogBridge = {
        sendMessage: vi.fn(async () => ({ success: true })),
      };

      setDialogBridge(bridge);
      expect(getDialogBridge()).toBe(bridge);
    });

    it('should return null when bridge is cleared', () => {
      setDialogBridge(null as unknown as DialogBridge);
      expect(getDialogBridge()).toBeNull();
    });

    it('should allow replacing the bridge', () => {
      const bridge1: DialogBridge = {
        sendMessage: vi.fn(async () => ({ success: true })),
      };
      const bridge2: DialogBridge = {
        sendMessage: vi.fn(async () => ({ success: true })),
      };

      setDialogBridge(bridge1);
      expect(getDialogBridge()).toBe(bridge1);

      setDialogBridge(bridge2);
      expect(getDialogBridge()).toBe(bridge2);
    });

    it('should use the most recently set bridge for commands', async () => {
      const messages1: DialogOperationMessage[] = [];
      const messages2: DialogOperationMessage[] = [];

      const bridge1: DialogBridge = {
        sendMessage: vi.fn(async (msg: DialogOperationMessage) => {
          messages1.push(msg);
          return { success: true };
        }),
      };
      const bridge2: DialogBridge = {
        sendMessage: vi.fn(async (msg: DialogOperationMessage) => {
          messages2.push(msg);
          return { success: true };
        }),
      };

      // Use bridge1
      setDialogBridge(bridge1);
      executor.loadMacro('ONPRINT BUTTON=OK');
      await executor.execute();
      expect(messages1).toHaveLength(1);
      expect(messages2).toHaveLength(0);

      // Switch to bridge2
      setDialogBridge(bridge2);
      const executor2 = createExecutor();
      registerDialogHandlers(executor2.registerHandler.bind(executor2));
      executor2.loadMacro('ONPRINT BUTTON=CANCEL');
      await executor2.execute();
      expect(messages2).toHaveLength(1);
    });
  });

  // =========================================================================
  // Cross-handler: message structure
  // =========================================================================

  describe('Message structure for all handlers', () => {
    it('should include id and timestamp in all message types', async () => {
      const commands = [
        'ONDIALOG POS=1 BUTTON=OK',
        'ONLOGIN USER=u PASSWORD=p',
        'ONCERTIFICATEDIALOG BUTTON=OK',
        'ONERRORDIALOG BUTTON=OK',
        'ONSECURITYDIALOG BUTTON=OK',
        'ONWEBPAGEDIALOG BUTTON=OK',
        'ONPRINT BUTTON=OK',
      ];

      executor.loadMacro(commands.join('\n'));
      await executor.execute();

      expect(sentMessages).toHaveLength(7);
      for (const msg of sentMessages) {
        expect(msg.id).toBeDefined();
        expect(typeof msg.id).toBe('string');
        expect(msg.id).toMatch(/^dialog_/);
        expect(msg.timestamp).toBeDefined();
        expect(typeof msg.timestamp).toBe('number');
        expect(msg.timestamp).toBeGreaterThan(0);
      }
    });

    it('should send correct message types for each command', async () => {
      const commands = [
        'ONDIALOG POS=1 BUTTON=OK',
        'ONLOGIN USER=u PASSWORD=p',
        'ONCERTIFICATEDIALOG BUTTON=OK',
        'ONERRORDIALOG BUTTON=OK',
        'ONSECURITYDIALOG BUTTON=OK',
        'ONWEBPAGEDIALOG BUTTON=OK',
        'ONPRINT BUTTON=OK',
      ];

      executor.loadMacro(commands.join('\n'));
      await executor.execute();

      expect(sentMessages[0].type).toBe('DIALOG_CONFIG');
      expect(sentMessages[1].type).toBe('LOGIN_CONFIG');
      expect(sentMessages[2].type).toBe('CERTIFICATE_CONFIG');
      expect(sentMessages[3].type).toBe('ERROR_DIALOG_CONFIG');
      expect(sentMessages[4].type).toBe('SECURITY_DIALOG_CONFIG');
      expect(sentMessages[5].type).toBe('WEBPAGE_DIALOG_CONFIG');
      expect(sentMessages[6].type).toBe('PRINT_CONFIG');
    });
  });

  // =========================================================================
  // parseButton edge cases (tested indirectly through handlers)
  // =========================================================================

  describe('parseButton behavior (via handlers)', () => {
    it('should handle lowercase button values by uppercasing', async () => {
      executor.loadMacro('ONDIALOG POS=1 BUTTON=ok');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as DialogConfigMessage;
      expect(msg.payload.config.button).toBe('OK');
    });

    it('should handle mixed case button values', async () => {
      executor.loadMacro('ONDIALOG POS=1 BUTTON=Cancel');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as DialogConfigMessage;
      expect(msg.payload.config.button).toBe('CANCEL');
    });

    it('should default unrecognized button to OK for all handlers', async () => {
      // Test through ONCERTIFICATEDIALOG as representative
      executor.loadMacro('ONCERTIFICATEDIALOG BUTTON=FOOBAR');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as CertificateConfigMessage;
      expect(msg.payload.config.button).toBe('OK');
    });
  });
});
