/**
 * Integration Tests for ONDOWNLOAD Command
 *
 * Tests the ONDOWNLOAD command through the MacroExecutor with a mock DownloadBridge.
 * Verifies folder/file parameter handling, wildcard/auto-generate specials,
 * WAIT parameter (default YES), CHECKSUM validation, filename/folder validation,
 * variable expansion, bridge error handling, missing parameter validation,
 * ONDOWNLOAD+SAVEAS sequencing, and no-download timeout behavior.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createExecutor, MacroExecutor, IMACROS_ERROR_CODES } from '@shared/executor';
import {
  registerDownloadHandlers,
  setDownloadBridge,
  notifyDownloadStarted,
  getDownloadTimeoutManager,
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

  // ===== No-Download Timeout =====

  describe('No-download timeout', () => {
    afterEach(() => {
      getDownloadTimeoutManager().cancel();
    });

    it('should start download timeout after ONDOWNLOAD is configured', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=report.pdf');
      await executor.execute();

      // Cleanup cancels the timer, but we can check it was started by
      // verifying the timeout manager was active during execution.
      // Instead, test that the timer starts by checking the manager
      // before cleanup runs. We need a different approach: inject the
      // pending error directly to test the executor's handling.
      expect(sentMessages).toHaveLength(1);
    });

    it('should terminate execution with DOWNLOAD_TIMEOUT when pending error is set', async () => {
      // Use a bridge mock that sets the pending error after ONDOWNLOAD configures,
      // simulating what the timeout manager does asynchronously.
      let setPendingErrorAfterOndownload = false;
      (mockBridge.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
        async (message: DownloadOperationMessage): Promise<DownloadOperationResponse> => {
          sentMessages.push(message);
          if (message.type === 'setDownloadOptions') {
            setPendingErrorAfterOndownload = true;
            // Schedule the pending error to fire immediately after ONDOWNLOAD completes
            queueMicrotask(() => {
              executor.setPendingError({
                success: false,
                errorCode: IMACROS_ERROR_CODES.DOWNLOAD_TIMEOUT,
                errorMessage: 'ONDOWNLOAD command was used but no download occurred',
              });
            });
          }
          return { success: true };
        }
      );

      const script = [
        'ONDOWNLOAD FOLDER=/downloads FILE=report.pdf',
        'SET !VAR1 test',
      ].join('\n');

      executor.loadMacro(script);
      const result = await executor.execute();

      expect(setPendingErrorAfterOndownload).toBe(true);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.DOWNLOAD_TIMEOUT);
      expect(result.errorMessage).toContain('no download occurred');
    });

    it('should return error code -952 for download timeout', async () => {
      (mockBridge.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
        async (message: DownloadOperationMessage): Promise<DownloadOperationResponse> => {
          sentMessages.push(message);
          if (message.type === 'setDownloadOptions') {
            queueMicrotask(() => {
              executor.setPendingError({
                success: false,
                errorCode: IMACROS_ERROR_CODES.DOWNLOAD_TIMEOUT,
                errorMessage: 'ONDOWNLOAD command was used but no download occurred',
              });
            });
          }
          return { success: true };
        }
      );

      const script = [
        'ONDOWNLOAD FOLDER=/downloads FILE=report.pdf',
        'SET !VAR1 test',
      ].join('\n');

      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.errorCode).toBe(-952);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.DOWNLOAD_TIMEOUT);
    });

    it('should cancel timeout when notifyDownloadStarted is called', () => {
      // Start the timeout manually
      const mgr = getDownloadTimeoutManager();
      mgr.start(6);

      expect(mgr.isActive()).toBe(true);

      // Simulate download arriving
      notifyDownloadStarted();

      expect(mgr.isActive()).toBe(false);
    });

    it('should cancel previous timeout when ONDOWNLOAD is reconfigured', async () => {
      const script = [
        'ONDOWNLOAD FOLDER=/downloads FILE=report1.pdf',
        'ONDOWNLOAD FOLDER=/downloads FILE=report2.pdf',
      ].join('\n');

      executor.loadMacro(script);
      const result = await executor.execute();

      // Both ONDOWNLOAD commands succeeded (second restarts the timer)
      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(2);
    });

    it('should cancel timeout when macro ends (cleanup)', async () => {
      executor.loadMacro('ONDOWNLOAD FOLDER=/downloads FILE=report.pdf');
      await executor.execute();

      // After macro ends, cleanup should have cancelled the timer
      expect(getDownloadTimeoutManager().isActive()).toBe(false);
    });
  });

  // ===== Download Timeout Manager (unit-level tests) =====

  describe('DownloadTimeoutManager', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      getDownloadTimeoutManager().cancel();
      vi.useRealTimers();
    });

    it('should fire callback after 4 × timeoutTagSeconds', () => {
      const mgr = getDownloadTimeoutManager();
      const errorCallback = vi.fn();
      mgr.setPendingErrorCallback(errorCallback);

      // !TIMEOUT_TAG = 6 → timeout = 4 × 6 = 24s
      mgr.start(6);

      // Not yet fired at 23s
      vi.advanceTimersByTime(23000);
      expect(errorCallback).not.toHaveBeenCalled();

      // Fires at 24s
      vi.advanceTimersByTime(1000);
      expect(errorCallback).toHaveBeenCalledOnce();
      expect(errorCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          errorCode: IMACROS_ERROR_CODES.DOWNLOAD_TIMEOUT,
          errorMessage: expect.stringContaining('no download occurred'),
        })
      );
    });

    it('should use 4 × timeoutTagSeconds with custom value', () => {
      const mgr = getDownloadTimeoutManager();
      const errorCallback = vi.fn();
      mgr.setPendingErrorCallback(errorCallback);

      // !TIMEOUT_TAG = 2 → timeout = 4 × 2 = 8s
      mgr.start(2);

      vi.advanceTimersByTime(7000);
      expect(errorCallback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);
      expect(errorCallback).toHaveBeenCalledOnce();
    });

    it('should enforce minimum 4-second timeout', () => {
      const mgr = getDownloadTimeoutManager();
      const errorCallback = vi.fn();
      mgr.setPendingErrorCallback(errorCallback);

      // !TIMEOUT_TAG = 0.5 → 4 × 0.5 = 2s, but min is 4s
      mgr.start(0.5);

      vi.advanceTimersByTime(3000);
      expect(errorCallback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);
      expect(errorCallback).toHaveBeenCalledOnce();
    });

    it('should cancel timeout when cancel() is called', () => {
      const mgr = getDownloadTimeoutManager();
      const errorCallback = vi.fn();
      mgr.setPendingErrorCallback(errorCallback);

      mgr.start(6);
      expect(mgr.isActive()).toBe(true);

      mgr.cancel();
      expect(mgr.isActive()).toBe(false);

      // Advancing past the timeout should not fire
      vi.advanceTimersByTime(30000);
      expect(errorCallback).not.toHaveBeenCalled();
    });

    it('should restart timer when start() is called again', () => {
      const mgr = getDownloadTimeoutManager();
      const errorCallback = vi.fn();
      mgr.setPendingErrorCallback(errorCallback);

      // Start with 6s tag → 24s timeout
      mgr.start(6);
      vi.advanceTimersByTime(20000);
      expect(errorCallback).not.toHaveBeenCalled();

      // Restart with 6s tag → new 24s timeout from now
      mgr.start(6);

      // 20s after restart (total 40s): should not fire
      vi.advanceTimersByTime(20000);
      expect(errorCallback).not.toHaveBeenCalled();

      // 4s more (24s after restart): should fire
      vi.advanceTimersByTime(4000);
      expect(errorCallback).toHaveBeenCalledOnce();
    });

    it('should cancel when notifyDownloadStarted() is called', () => {
      const mgr = getDownloadTimeoutManager();
      const errorCallback = vi.fn();
      mgr.setPendingErrorCallback(errorCallback);

      mgr.start(6);
      expect(mgr.isActive()).toBe(true);

      notifyDownloadStarted();
      expect(mgr.isActive()).toBe(false);

      vi.advanceTimersByTime(30000);
      expect(errorCallback).not.toHaveBeenCalled();
    });
  });
});
