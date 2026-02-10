/**
 * ONDIALOG Command Integration Tests
 *
 * Tests the ONDIALOG command through the MacroExecutor with a mock DialogBridge.
 * Verifies parameter validation, bridge communication, state management,
 * and error handling for dialog configuration.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createExecutor, MacroExecutor, IMACROS_ERROR_CODES } from '@shared/executor';
import {
  registerDialogHandlers,
  setDialogBridge,
  DialogBridge,
  DialogOperationMessage,
  DialogConfigResponse,
  DialogConfigMessage,
} from '@shared/commands/dialogs';

describe('ONDIALOG Command Integration Tests', () => {
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

  describe('Basic ONDIALOG with BUTTON=OK', () => {
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
    });
  });

  describe('BUTTON parameter variants', () => {
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
  });

  describe('CONTENT parameter', () => {
    it('should send content=hello for CONTENT=hello', async () => {
      executor.loadMacro('ONDIALOG POS=1 BUTTON=OK CONTENT=hello');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as DialogConfigMessage;
      expect(msg.payload.config.content).toBe('hello');
    });
  });

  describe('POS parameter variants', () => {
    it('should send pos=2 for POS=2', async () => {
      executor.loadMacro('ONDIALOG POS=2 BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as DialogConfigMessage;
      expect(msg.payload.config.pos).toBe(2);
    });
  });

  describe('dialogTypes', () => {
    it('should include all 4 dialog types: alert, confirm, prompt, beforeunload', async () => {
      executor.loadMacro('ONDIALOG POS=1 BUTTON=OK');
      await executor.execute();

      const msg = sentMessages[0] as DialogConfigMessage;
      expect(msg.payload.dialogTypes).toEqual(['alert', 'confirm', 'prompt', 'beforeunload']);
    });
  });

  describe('Missing parameter errors', () => {
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
  });

  describe('Invalid POS parameter', () => {
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

    it('should return INVALID_PARAMETER for POS=abc', async () => {
      executor.loadMacro('ONDIALOG POS=abc BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(sentMessages).toHaveLength(0);
    });
  });

  describe('Unknown BUTTON value defaults to CANCEL', () => {
    it('should default button to CANCEL for BUTTON=UNKNOWN', async () => {
      executor.loadMacro('ONDIALOG POS=1 BUTTON=UNKNOWN');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as DialogConfigMessage;
      expect(msg.payload.config.button).toBe('CANCEL');
    });
  });

  describe('Bridge failure returns SCRIPT_ERROR', () => {
    it('should return SCRIPT_ERROR when bridge returns success=false', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<DialogConfigResponse> => {
        return { success: false, error: 'Bridge rejected configuration' };
      });

      executor.loadMacro('ONDIALOG POS=1 BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    });

    it('should return SCRIPT_ERROR when bridge throws an exception', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<DialogConfigResponse> => {
        throw new Error('Connection lost');
      });

      executor.loadMacro('ONDIALOG POS=1 BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    });
  });

  describe('Variable expansion in CONTENT', () => {
    it('should expand variables in CONTENT parameter', async () => {
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
  });

  describe('No bridge configured returns success', () => {
    it('should return success when no bridge is configured (testing mode)', async () => {
      setDialogBridge(null as unknown as DialogBridge);

      executor.loadMacro('ONDIALOG POS=1 BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(0);
    });
  });
});
