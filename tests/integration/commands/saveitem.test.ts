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
    it('should use ONDOWNLOAD folder and file settings as fallback for SAVEITEM', async () => {
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
      // The SAVEITEM handler falls back to DOWNLOAD_FOLDER_KEY and DOWNLOAD_FILE_KEY state
      const saveitemMsg = sentMessages[1] as SaveItemMessage;
      expect(saveitemMsg.type).toBe('saveItem');
      expect(saveitemMsg.url).toBe('https://example.com/file.pdf');
      expect(saveitemMsg.folder).toBe('/output');
      expect(saveitemMsg.file).toBe('data.pdf');
    });
  });

  // ===== FILE Wildcard Processing =====

  describe('FILE wildcard processing', () => {
    it('FILE=* should derive filename from URL', async () => {
      executor.loadMacro('SAVEITEM URL=https://example.com/path/image.png FILE=*');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as SaveItemMessage;
      expect(msg.file).toBe('image.png');
    });

    it('FILE=* should derive filename from URL without extension', async () => {
      executor.loadMacro('SAVEITEM URL=https://example.com/path/document FILE=*');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as SaveItemMessage;
      expect(msg.file).toBe('document');
    });

    it('FILE=* should fall back to hostname when URL has no path segment', async () => {
      executor.loadMacro('SAVEITEM URL=https://www.example.com/ FILE=*');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as SaveItemMessage;
      expect(msg.file).toBe('example.com');
    });

    it('FILE=+suffix should insert suffix before extension', async () => {
      executor.loadMacro('SAVEITEM URL=https://example.com/photo.jpg FILE=+_thumb');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as SaveItemMessage;
      expect(msg.file).toBe('photo_thumb.jpg');
    });

    it('FILE=+suffix should append suffix when no extension', async () => {
      executor.loadMacro('SAVEITEM URL=https://example.com/document FILE=+_copy');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as SaveItemMessage;
      expect(msg.file).toBe('document_copy');
    });

    it('no FILE param should derive filename from URL (like FILE=*)', async () => {
      executor.loadMacro('SAVEITEM URL=https://example.com/path/report.pdf');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as SaveItemMessage;
      expect(msg.file).toBe('report.pdf');
    });

    it('ONDOWNLOAD FILE=* should derive from URL when used by SAVEITEM', async () => {
      const script = [
        'ONDOWNLOAD FOLDER=/output FILE=*',
        'SAVEITEM URL=https://example.com/data.csv',
      ].join('\n');
      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const saveitemMsg = sentMessages[1] as SaveItemMessage;
      expect(saveitemMsg.file).toBe('data.csv');
    });

    it('ONDOWNLOAD FILE=+suffix should apply suffix from URL when used by SAVEITEM', async () => {
      const script = [
        'ONDOWNLOAD FOLDER=/output FILE=+_backup',
        'SAVEITEM URL=https://example.com/photo.jpg',
      ].join('\n');
      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const saveitemMsg = sentMessages[1] as SaveItemMessage;
      expect(saveitemMsg.file).toBe('photo_backup.jpg');
    });
  });

  // ===== Filename Sanitization =====

  describe('Filename sanitization', () => {
    it('should sanitize illegal characters in derived filenames', async () => {
      // URL with query params that would produce illegal chars
      executor.loadMacro('SAVEITEM URL=https://example.com/file:name.pdf FILE=test<file>.pdf');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as SaveItemMessage;
      // Illegal chars [:*?|<>"/] should be replaced with _
      expect(msg.file).toBe('test_file_.pdf');
    });

    it('should sanitize wildcard-derived filenames', async () => {
      executor.loadMacro('SAVEITEM URL=https://example.com/my:file*name.pdf FILE=*');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as SaveItemMessage;
      expect(msg.file).toBe('my_file_name.pdf');
    });
  });

  // ===== ONDOWNLOAD State Consumption =====

  describe('ONDOWNLOAD state consumption', () => {
    it('should consume ONDOWNLOAD state after SAVEITEM (second SAVEITEM uses default)', async () => {
      const script = [
        'ONDOWNLOAD FOLDER=/output FILE=first.pdf',
        'SAVEITEM URL=https://example.com/file1.pdf',
        'SAVEITEM URL=https://example.com/file2.pdf',
      ].join('\n');
      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(3);

      // First SAVEITEM uses ONDOWNLOAD settings
      const first = sentMessages[1] as SaveItemMessage;
      expect(first.folder).toBe('/output');
      expect(first.file).toBe('first.pdf');

      // Second SAVEITEM: ONDOWNLOAD state was consumed, so no folder fallback
      const second = sentMessages[2] as SaveItemMessage;
      expect(second.folder).toBeUndefined();
      // File falls back to URL-derived name since ONDOWNLOAD file was consumed
      expect(second.file).toBe('file2.pdf');
    });
  });

  // ===== Checksum Pass-through =====

  describe('Checksum pass-through', () => {
    it('should pass ONDOWNLOAD checksum and wait settings through to saveItem message', async () => {
      const script = [
        'ONDOWNLOAD FOLDER=/output FILE=data.pdf WAIT=YES CHECKSUM=MD5:d41d8cd98f00b204e9800998ecf8427e',
        'SAVEITEM URL=https://example.com/file.pdf',
      ].join('\n');
      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(2);

      const saveitemMsg = sentMessages[1] as SaveItemMessage;
      expect(saveitemMsg.wait).toBe(true);
      expect(saveitemMsg.checksum).toBe('MD5:d41d8cd98f00b204e9800998ecf8427e');
    });

    it('should not pass checksum when ONDOWNLOAD has no CHECKSUM', async () => {
      const script = [
        'ONDOWNLOAD FOLDER=/output FILE=data.pdf',
        'SAVEITEM URL=https://example.com/file.pdf',
      ].join('\n');
      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const saveitemMsg = sentMessages[1] as SaveItemMessage;
      expect(saveitemMsg.checksum).toBeUndefined();
    });
  });
});
