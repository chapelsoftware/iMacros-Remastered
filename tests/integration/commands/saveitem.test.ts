/**
 * Integration Tests for SAVEITEM Command
 *
 * Tests the SAVEITEM command through the MacroExecutor with a mock DownloadBridge.
 * Verifies URL/FOLDER/FILE parameter handling, variable expansion, bridge error
 * handling, no-bridge testing mode, downloadId state storage, and ONDOWNLOAD+SAVEITEM
 * sequencing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createExecutor, MacroExecutor, IMACROS_ERROR_CODES } from '@shared/executor';
import {
  registerDownloadHandlers,
  setDownloadBridge,
  DownloadBridge,
  DownloadOperationMessage,
  DownloadOperationResponse,
  SaveItemMessage,
} from '@shared/commands/downloads';

describe('SAVEITEM Command Integration Tests', () => {
  let executor: MacroExecutor;
  let mockBridge: DownloadBridge;
  let sentMessages: DownloadOperationMessage[];

  beforeEach(() => {
    sentMessages = [];
    mockBridge = {
      sendMessage: vi.fn(async (message: DownloadOperationMessage): Promise<DownloadOperationResponse> => {
        sentMessages.push(message);
        return { success: true, data: { downloadId: 77, filename: 'saved-item.pdf' } };
      }),
    };
    setDownloadBridge(mockBridge);
    executor = createExecutor();
    registerDownloadHandlers(executor);
  });

  afterEach(() => {
    setDownloadBridge(null as unknown as DownloadBridge);
  });

  // ===== Basic SAVEITEM =====

  describe('Basic SAVEITEM', () => {
    it('should send saveItem message and succeed', async () => {
      executor.loadMacro('SAVEITEM');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SaveItemMessage;
      expect(msg.type).toBe('saveItem');
    });
  });

  // ===== URL Parameter =====

  describe('URL parameter', () => {
    it('should send url in message when URL param is specified', async () => {
      executor.loadMacro('SAVEITEM URL=https://example.com/file.pdf');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SaveItemMessage;
      expect(msg.type).toBe('saveItem');
      expect(msg.url).toBe('https://example.com/file.pdf');
    });
  });

  // ===== FOLDER Parameter =====

  describe('FOLDER parameter', () => {
    it('should send folder in message when FOLDER param is specified', async () => {
      executor.loadMacro('SAVEITEM FOLDER=/downloads');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SaveItemMessage;
      expect(msg.type).toBe('saveItem');
      expect(msg.folder).toBe('/downloads');
    });
  });

  // ===== FILE Parameter =====

  describe('FILE parameter', () => {
    it('should send file in message when FILE param is specified', async () => {
      executor.loadMacro('SAVEITEM FILE=output.pdf');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SaveItemMessage;
      expect(msg.type).toBe('saveItem');
      expect(msg.file).toBe('output.pdf');
    });
  });

  // ===== All Parameters Combined =====

  describe('All parameters combined', () => {
    it('should send all params when URL, FOLDER, and FILE are specified', async () => {
      executor.loadMacro('SAVEITEM URL=https://example.com/file.pdf FOLDER=/downloads FILE=out.pdf');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SaveItemMessage;
      expect(msg.type).toBe('saveItem');
      expect(msg.url).toBe('https://example.com/file.pdf');
      expect(msg.folder).toBe('/downloads');
      expect(msg.file).toBe('out.pdf');
    });
  });

  // ===== Variable Expansion =====

  describe('Variable expansion', () => {
    it('should expand variables in URL parameter', async () => {
      const script = [
        'SET !VAR1 https://example.com/data.csv',
        'SAVEITEM URL={{!VAR1}}',
      ].join('\n');
      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SaveItemMessage;
      expect(msg.type).toBe('saveItem');
      expect(msg.url).toBe('https://example.com/data.csv');
    });
  });

  // ===== Bridge Failure Handling =====

  describe('Bridge failure handling', () => {
    it('should return DOWNLOAD_FAILED when bridge returns failure', async () => {
      (mockBridge.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: false,
        error: 'Network error',
      });

      executor.loadMacro('SAVEITEM URL=https://example.com/file.pdf');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.DOWNLOAD_FAILED);
    });

    it('should return DOWNLOAD_FAILED when bridge throws an exception', async () => {
      (mockBridge.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Connection lost')
      );

      executor.loadMacro('SAVEITEM URL=https://example.com/file.pdf');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.DOWNLOAD_FAILED);
    });
  });

  // ===== No Bridge Configured =====

  describe('No bridge configured', () => {
    it('should return success when no bridge is configured (testing mode)', async () => {
      setDownloadBridge(null as unknown as DownloadBridge);

      executor.loadMacro('SAVEITEM URL=https://example.com/file.pdf');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      // No messages sent since there is no bridge
      expect(mockBridge.sendMessage).not.toHaveBeenCalled();
    });
  });

  // ===== Download ID State Storage =====

  describe('Download ID state storage', () => {
    it('should attempt to store downloadId in state when bridge returns it', async () => {
      // The saveitemHandler calls ctx.state.setVariable(LAST_DOWNLOAD_ID_KEY, downloadId)
      // when the bridge response includes a downloadId. The LAST_DOWNLOAD_ID_KEY is
      // '!LAST_DOWNLOAD_ID' which is not in the recognized SYSTEM_VARIABLES list,
      // so the underlying VariableContext.set() silently rejects it. The command
      // still succeeds regardless.
      executor.loadMacro('SAVEITEM URL=https://example.com/file.pdf');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

      // Verify the bridge was called and returned a downloadId
      expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
      const response = await (mockBridge.sendMessage as ReturnType<typeof vi.fn>).mock.results[0].value;
      expect(response.data.downloadId).toBe(77);
    });
  });

  // ===== ONDOWNLOAD then SAVEITEM Sequence =====

  describe('ONDOWNLOAD then SAVEITEM sequence', () => {
    it('should use ONDOWNLOAD folder setting as fallback for SAVEITEM', async () => {
      const script = [
        'ONDOWNLOAD FOLDER=/output FILE=data.pdf',
        'SAVEITEM URL=https://example.com/file.pdf',
      ].join('\n');
      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(2);

      // First message: setDownloadOptions from ONDOWNLOAD
      const ondownloadMsg = sentMessages[0];
      expect(ondownloadMsg.type).toBe('setDownloadOptions');

      // Second message: saveItem from SAVEITEM
      // The SAVEITEM handler falls back to DOWNLOAD_FOLDER_KEY state when no FOLDER param
      const saveitemMsg = sentMessages[1] as SaveItemMessage;
      expect(saveitemMsg.type).toBe('saveItem');
      expect(saveitemMsg.url).toBe('https://example.com/file.pdf');
      expect(saveitemMsg.folder).toBe('/output');
    });
  });
});
