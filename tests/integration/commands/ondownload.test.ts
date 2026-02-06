/**
 * Integration Tests for ONDOWNLOAD Command
 *
 * Tests the ONDOWNLOAD command through the MacroExecutor with a mock DownloadBridge.
 * Verifies folder/file parameter handling, wildcard/auto-generate specials,
 * WAIT parameter, variable expansion, bridge error handling, missing parameter
 * validation, and ONDOWNLOAD+SAVEAS sequencing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createExecutor, MacroExecutor, IMACROS_ERROR_CODES } from '@shared/executor';
import {
  registerDownloadHandlers,
  setDownloadBridge,
  DownloadBridge,
  DownloadOperationMessage,
  DownloadOperationResponse,
  SetDownloadOptionsMessage,
} from '@shared/commands/downloads';

describe('ONDOWNLOAD Command Integration Tests', () => {
  let executor: MacroExecutor;
  let mockBridge: DownloadBridge;
  let sentMessages: DownloadOperationMessage[];

  beforeEach(() => {
    sentMessages = [];
    mockBridge = {
      sendMessage: vi.fn(async (message: DownloadOperationMessage): Promise<DownloadOperationResponse> => {
        sentMessages.push(message);
        return { success: true };
      }),
    };
    setDownloadBridge(mockBridge);
    executor = createExecutor();
    registerDownloadHandlers(executor);
  });

  afterEach(() => {
    setDownloadBridge(null as unknown as DownloadBridge);
  });

  // ===== Basic FOLDER and FILE Parameters =====

  describe('Basic FOLDER and FILE parameters', () => {
    it('should send setDownloadOptions with folder and file', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=report.pdf');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SetDownloadOptionsMessage;
      expect(msg.type).toBe('setDownloadOptions');
      expect(msg.folder).toBe('/downloads');
      expect(msg.file).toBe('report.pdf');
    });

    it('should send folder as undefined when FOLDER=* (browser default)', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=*');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SetDownloadOptionsMessage;
      expect(msg.type).toBe('setDownloadOptions');
      expect(msg.folder).toBeUndefined();
    });

    it('should send file as undefined when FILE=+ (auto-generate)', async () => {
      executor.loadMacro('ONDOWNLOAD FILE=+');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SetDownloadOptionsMessage;
      expect(msg.type).toBe('setDownloadOptions');
      expect(msg.file).toBeUndefined();
    });

    it('should succeed with only FOLDER parameter', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/path');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SetDownloadOptionsMessage;
      expect(msg.type).toBe('setDownloadOptions');
      expect(msg.folder).toBe('/path');
      expect(msg.file).toBeUndefined();
    });

    it('should succeed with only FILE parameter', async () => {
      executor.loadMacro('ONDOWNLOAD FILE=myfile.txt');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SetDownloadOptionsMessage;
      expect(msg.type).toBe('setDownloadOptions');
      expect(msg.folder).toBeUndefined();
      expect(msg.file).toBe('myfile.txt');
    });
  });

  // ===== Missing Parameter Error =====

  describe('Missing parameter error', () => {
    it('should return MISSING_PARAMETER when neither FOLDER nor FILE is specified', async () => {
      executor.loadMacro('ONDOWNLOAD WAIT=YES');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(sentMessages).toHaveLength(0);
    });
  });

  // ===== WAIT Parameter =====

  describe('WAIT parameter', () => {
    it('should send wait=true when WAIT=YES', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads WAIT=YES');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SetDownloadOptionsMessage;
      expect(msg.type).toBe('setDownloadOptions');
      expect(msg.wait).toBe(true);
    });

    it('should send wait=false when WAIT=NO', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads WAIT=NO');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SetDownloadOptionsMessage;
      expect(msg.type).toBe('setDownloadOptions');
      expect(msg.wait).toBe(false);
    });
  });

  // ===== Variable Expansion =====

  describe('Variable expansion', () => {
    it('should expand variables in FOLDER and FILE parameters', async () => {
      const script = [
        'SET !VAR1 /custom/path',
        'ONDOWNLOAD FOLDER={{!VAR1}} FILE=out.txt',
      ].join('\n');
      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SetDownloadOptionsMessage;
      expect(msg.type).toBe('setDownloadOptions');
      expect(msg.folder).toBe('/custom/path');
      expect(msg.file).toBe('out.txt');
    });
  });

  // ===== Bridge Failure Handling =====

  describe('Bridge failure handling', () => {
    it('should return DOWNLOAD_ERROR when bridge returns failure', async () => {
      (mockBridge.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: false,
        error: 'Permission denied',
      });

      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=report.pdf');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.DOWNLOAD_ERROR);
    });

    it('should return DOWNLOAD_ERROR when bridge throws an exception', async () => {
      (mockBridge.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Connection lost')
      );

      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=report.pdf');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.DOWNLOAD_ERROR);
    });
  });

  // ===== No Bridge Configured =====

  describe('No bridge configured', () => {
    it('should return success when no bridge is configured (testing mode)', async () => {
      setDownloadBridge(null as unknown as DownloadBridge);

      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=report.pdf');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      // No messages sent since there is no bridge
      expect(mockBridge.sendMessage).not.toHaveBeenCalled();
    });
  });

  // ===== ONDOWNLOAD then SAVEAS Sequence =====

  describe('ONDOWNLOAD then SAVEAS sequence', () => {
    it('should execute ONDOWNLOAD followed by SAVEAS using both download handlers', async () => {
      const script = [
        'ONDOWNLOAD FOLDER=/output FILE=data.pdf',
        'SAVEAS TYPE=PDF FILE=data.pdf',
      ].join('\n');
      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(2);

      // First message: setDownloadOptions from ONDOWNLOAD
      const ondownloadMsg = sentMessages[0] as SetDownloadOptionsMessage;
      expect(ondownloadMsg.type).toBe('setDownloadOptions');
      expect(ondownloadMsg.folder).toBe('/output');
      expect(ondownloadMsg.file).toBe('data.pdf');

      // Second message: saveAs from SAVEAS
      const saveasMsg = sentMessages[1];
      expect(saveasMsg.type).toBe('saveAs');
    });
  });
});
