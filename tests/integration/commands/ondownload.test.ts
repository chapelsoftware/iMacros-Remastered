/**
 * Integration Tests for ONDOWNLOAD Command
 *
 * Tests the ONDOWNLOAD command through the MacroExecutor with a mock DownloadBridge.
 * Verifies folder/file parameter handling, wildcard/auto-generate specials,
 * WAIT parameter (default YES), CHECKSUM validation, filename/folder validation,
 * variable expansion, bridge error handling, missing parameter validation,
 * and ONDOWNLOAD+SAVEAS sequencing.
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
      executor.loadMacro('ONDOWNLOAD FOLDER=* FILE=report.pdf');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SetDownloadOptionsMessage;
      expect(msg.type).toBe('setDownloadOptions');
      expect(msg.folder).toBeUndefined();
    });

    it('should send file as undefined when FILE=+ (auto-generate)', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=+');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SetDownloadOptionsMessage;
      expect(msg.type).toBe('setDownloadOptions');
      expect(msg.file).toBeUndefined();
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

    it('should return MISSING_PARAMETER when only FOLDER is specified', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/path');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(result.errorMessage).toContain('both FOLDER and FILE');
      expect(sentMessages).toHaveLength(0);
    });

    it('should return MISSING_PARAMETER when only FILE is specified', async () => {
      executor.loadMacro('ONDOWNLOAD FILE=myfile.txt');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(result.errorMessage).toContain('both FOLDER and FILE');
      expect(sentMessages).toHaveLength(0);
    });
  });

  // ===== WAIT Parameter =====

  describe('WAIT parameter', () => {
    it('should default WAIT to YES (true) when not specified', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=report.pdf');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SetDownloadOptionsMessage;
      expect(msg.wait).toBe(true);
    });

    it('should send wait=true when WAIT=YES', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=report.pdf WAIT=YES');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SetDownloadOptionsMessage;
      expect(msg.type).toBe('setDownloadOptions');
      expect(msg.wait).toBe(true);
    });

    it('should send wait=false when WAIT=NO', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=report.pdf WAIT=NO');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SetDownloadOptionsMessage;
      expect(msg.type).toBe('setDownloadOptions');
      expect(msg.wait).toBe(false);
    });

    it('should send wait=false when WAIT=FALSE (iMacros 8.9.7 parity)', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=report.pdf WAIT=FALSE');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SetDownloadOptionsMessage;
      expect(msg.wait).toBe(false);
    });

    it('should send wait=true when WAIT=TRUE', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=report.pdf WAIT=TRUE');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SetDownloadOptionsMessage;
      expect(msg.wait).toBe(true);
    });

    it('should be case-insensitive for WAIT parameter', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=report.pdf WAIT=false');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as SetDownloadOptionsMessage;
      expect(msg.wait).toBe(false);
    });

    it('should treat unrecognized WAIT values as false', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=report.pdf WAIT=MAYBE');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as SetDownloadOptionsMessage;
      expect(msg.wait).toBe(false);
    });
  });

  // ===== CHECKSUM Parameter =====

  describe('CHECKSUM parameter', () => {
    it('should accept valid MD5 checksum', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=report.pdf CHECKSUM=MD5:d41d8cd98f00b204e9800998ecf8427e');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SetDownloadOptionsMessage;
      expect(msg.checksum).toBe('MD5:d41d8cd98f00b204e9800998ecf8427e');
    });

    it('should accept valid SHA1 checksum', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=report.pdf CHECKSUM=SHA1:da39a3ee5e6b4b0d3255bfef95601890afd80709');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SetDownloadOptionsMessage;
      expect(msg.checksum).toBe('SHA1:da39a3ee5e6b4b0d3255bfef95601890afd80709');
    });

    it('should reject checksum without colon separator', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=report.pdf CHECKSUM=MD5abc123');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(result.errorMessage).toContain('format');
    });

    it('should reject unsupported checksum algorithm', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=report.pdf CHECKSUM=SHA256:abc123');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(result.errorMessage).toContain('Unsupported checksum algorithm');
    });

    it('should reject invalid hex in checksum hash', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=report.pdf CHECKSUM=MD5:zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(result.errorMessage).toContain('hexadecimal');
    });

    it('should reject MD5 hash with wrong length', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=report.pdf CHECKSUM=MD5:abc123');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(result.errorMessage).toContain('length');
    });

    it('should reject SHA1 hash with wrong length', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=report.pdf CHECKSUM=SHA1:abc123');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(result.errorMessage).toContain('length');
    });

    it('should normalize checksum hash to lowercase', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=report.pdf CHECKSUM=MD5:D41D8CD98F00B204E9800998ECF8427E');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as SetDownloadOptionsMessage;
      expect(msg.checksum).toBe('MD5:d41d8cd98f00b204e9800998ecf8427e');
    });

    it('should not send checksum when CHECKSUM is not specified', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=report.pdf');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as SetDownloadOptionsMessage;
      expect(msg.checksum).toBeUndefined();
    });

    it('should reject CHECKSUM when WAIT=NO (iMacros 8.9.7 parity)', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=report.pdf WAIT=NO CHECKSUM=MD5:d41d8cd98f00b204e9800998ecf8427e');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(result.errorMessage).toContain('CHECKSUM requires WAIT=YES');
      expect(sentMessages).toHaveLength(0);
    });

    it('should reject CHECKSUM when WAIT=FALSE (iMacros 8.9.7 parity)', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=report.pdf WAIT=FALSE CHECKSUM=MD5:d41d8cd98f00b204e9800998ecf8427e');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(result.errorMessage).toContain('CHECKSUM requires WAIT=YES');
    });

    it('should accept CHECKSUM when WAIT=YES (explicit)', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=report.pdf WAIT=YES CHECKSUM=MD5:d41d8cd98f00b204e9800998ecf8427e');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as SetDownloadOptionsMessage;
      expect(msg.checksum).toBe('MD5:d41d8cd98f00b204e9800998ecf8427e');
      expect(msg.wait).toBe(true);
    });

    it('should accept CHECKSUM when WAIT is not specified (defaults to YES)', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=report.pdf CHECKSUM=MD5:d41d8cd98f00b204e9800998ecf8427e');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as SetDownloadOptionsMessage;
      expect(msg.checksum).toBe('MD5:d41d8cd98f00b204e9800998ecf8427e');
      expect(msg.wait).toBe(true);
    });
  });

  // ===== Filename Validation =====

  describe('Filename validation', () => {
    it('should reject filename with < character', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=file<name.pdf');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.DOWNLOAD_INVALID_FILENAME);
      expect(result.errorMessage).toContain('Illegal character');
    });

    it('should reject filename with > character', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=file>name.pdf');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.DOWNLOAD_INVALID_FILENAME);
    });

    it('should reject filename with | character', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=file|name.pdf');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.DOWNLOAD_INVALID_FILENAME);
    });

    it('should reject filename with ? character', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=file?name.pdf');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.DOWNLOAD_INVALID_FILENAME);
    });

    it('should reject filename with * character in the middle', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=file*name.pdf');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.DOWNLOAD_INVALID_FILENAME);
    });

    it('should accept valid filenames', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=my-file_v2.0.pdf');
      const result = await executor.execute();

      expect(result.success).toBe(true);
    });

    it('should skip filename validation for FILE=+ (auto-generate)', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=+');
      const result = await executor.execute();

      expect(result.success).toBe(true);
    });

    it('should send file as undefined when FILE=* (server-suggested filename, iMacros 8.9.7 parity)', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=*');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SetDownloadOptionsMessage;
      expect(msg.file).toBeUndefined();
    });
  });

  // ===== Folder Path Validation =====

  describe('Folder path validation', () => {
    it('should reject folder path with null byte', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/down\0loads FILE=report.pdf');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.DOWNLOAD_FOLDER_ACCESS);
    });

    it('should skip folder validation for FOLDER=* (browser default)', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=* FILE=report.pdf');
      const result = await executor.execute();

      expect(result.success).toBe(true);
    });

    it('should accept valid folder paths', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/home/user/downloads FILE=report.pdf');
      const result = await executor.execute();

      expect(result.success).toBe(true);
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
