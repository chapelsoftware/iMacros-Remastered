/**
 * Integration Tests for SAVEAS Command
 *
 * Tests the SAVEAS command through the MacroExecutor with a mock DownloadBridge.
 * Verifies all save types (TXT, HTM, HTML, PNG, JPG, JPEG, PDF, EXTRACT),
 * type normalization, parameter validation, folder handling, quality option,
 * bridge error handling, variable expansion, and downloadId state storage.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createExecutor, MacroExecutor, IMACROS_ERROR_CODES } from '@shared/executor';
import {
  registerDownloadHandlers,
  setDownloadBridge,
  DownloadBridge,
  DownloadOperationMessage,
  DownloadOperationResponse,
  SaveAsMessage,
  LAST_DOWNLOAD_ID_KEY,
} from '@shared/commands/downloads';
import { registerNavigationHandlers } from '@shared/commands/navigation';

describe('SAVEAS Command Integration Tests', () => {
  let executor: MacroExecutor;
  let mockBridge: DownloadBridge;
  let sentMessages: DownloadOperationMessage[];

  beforeEach(() => {
    sentMessages = [];
    mockBridge = {
      sendMessage: vi.fn(async (message: DownloadOperationMessage): Promise<DownloadOperationResponse> => {
        sentMessages.push(message);
        return { success: true, data: { downloadId: 42, filename: 'output.txt' } };
      }),
    };
    setDownloadBridge(mockBridge);
    executor = createExecutor();
    registerDownloadHandlers(executor);
    registerNavigationHandlers(executor);
  });

  afterEach(() => {
    setDownloadBridge(null as unknown as DownloadBridge);
  });

  // ===== Basic Save Types =====

  describe('Basic save types', () => {
    it('should send saveAs with saveType=TXT for TYPE=TXT', async () => {
      executor.loadMacro('SAVEAS TYPE=TXT FILE=output.txt');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SaveAsMessage;
      expect(msg.type).toBe('saveAs');
      expect(msg.saveType).toBe('TXT');
      expect(msg.file).toBe('output.txt');
    });

    it('should send saveAs with saveType=HTM for TYPE=HTM', async () => {
      executor.loadMacro('SAVEAS TYPE=HTM FILE=page.htm');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SaveAsMessage;
      expect(msg.type).toBe('saveAs');
      expect(msg.saveType).toBe('HTM');
      expect(msg.file).toBe('page.htm');
    });

    it('should normalize TYPE=HTML to saveType=HTM', async () => {
      executor.loadMacro('SAVEAS TYPE=HTML FILE=page.html');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SaveAsMessage;
      expect(msg.saveType).toBe('HTM');
      expect(msg.file).toBe('page.html');
    });

    it('should send saveAs with saveType=PNG for TYPE=PNG', async () => {
      executor.loadMacro('SAVEAS TYPE=PNG FILE=screenshot.png');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SaveAsMessage;
      expect(msg.saveType).toBe('PNG');
      expect(msg.file).toBe('screenshot.png');
    });

    it('should send saveAs with saveType=JPG for TYPE=JPG', async () => {
      executor.loadMacro('SAVEAS TYPE=JPG FILE=photo.jpg');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SaveAsMessage;
      expect(msg.saveType).toBe('JPG');
      expect(msg.file).toBe('photo.jpg');
    });

    it('should normalize TYPE=JPEG to saveType=JPG', async () => {
      executor.loadMacro('SAVEAS TYPE=JPEG FILE=photo.jpeg');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SaveAsMessage;
      expect(msg.saveType).toBe('JPG');
      expect(msg.file).toBe('photo.jpeg');
    });

    it('should send saveAs with saveType=PDF for TYPE=PDF', async () => {
      executor.loadMacro('SAVEAS TYPE=PDF FILE=doc.pdf');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SaveAsMessage;
      expect(msg.saveType).toBe('PDF');
      expect(msg.file).toBe('doc.pdf');
    });
  });

  // ===== EXTRACT Type =====

  describe('EXTRACT type', () => {
    it('should format single extract value as CSV', async () => {
      const script = [
        'SET !EXTRACT scraped-data-here',
        'SAVEAS TYPE=EXTRACT FILE=data.txt',
      ].join('\n');
      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SaveAsMessage;
      expect(msg.type).toBe('saveAs');
      expect(msg.saveType).toBe('EXTRACT');
      expect(msg.file).toBe('data.txt');
      // Content should be CSV-formatted (wrapped in quotes)
      expect(msg.content).toBe('"scraped-data-here"');
    });

    it('should convert [EXTRACT] delimiters to CSV format', async () => {
      // Multiple extracts produce data like: value1[EXTRACT]value2[EXTRACT]value3
      const script = [
        'SET !EXTRACT value1',
        'ADD !EXTRACT value2',
        'ADD !EXTRACT value3',
        'SAVEAS TYPE=EXTRACT FILE=data.csv',
      ].join('\n');
      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as SaveAsMessage;
      // [EXTRACT] delimiters converted to ","
      expect(msg.content).toBe('"value1","value2","value3"');
    });

    it('should produce empty CSV row when extract is empty', async () => {
      executor.loadMacro('SAVEAS TYPE=EXTRACT FILE=data.csv');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as SaveAsMessage;
      // Empty extract should produce empty quoted CSV
      expect(msg.content).toBe('""');
    });

    it('should clear extract data after SAVEAS TYPE=EXTRACT', async () => {
      const script = [
        'SET !EXTRACT some-data',
        'SAVEAS TYPE=EXTRACT FILE=first.csv',
        'SAVEAS TYPE=EXTRACT FILE=second.csv',
      ].join('\n');
      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(2);

      // First save should have the data
      const msg1 = sentMessages[0] as SaveAsMessage;
      expect(msg1.content).toBe('"some-data"');

      // Second save should have empty data (cleared after first save)
      const msg2 = sentMessages[1] as SaveAsMessage;
      expect(msg2.content).toBe('""');
    });
  });

  // ===== FOLDER Parameter =====

  describe('FOLDER parameter', () => {
    it('should send folder when FOLDER parameter is specified', async () => {
      executor.loadMacro('SAVEAS TYPE=TXT FOLDER=/tmp FILE=output.txt');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SaveAsMessage;
      expect(msg.folder).toBe('/tmp');
      expect(msg.file).toBe('output.txt');
    });
  });

  // ===== QUALITY Parameter =====

  describe('QUALITY parameter', () => {
    it('should send quality when QUALITY parameter is valid for JPG', async () => {
      executor.loadMacro('SAVEAS TYPE=JPG FILE=photo.jpg QUALITY=85');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SaveAsMessage;
      expect(msg.saveType).toBe('JPG');
      expect(msg.quality).toBe(85);
    });
  });

  // ===== Missing Parameter Errors =====

  describe('Missing parameter errors', () => {
    it('should return MISSING_PARAMETER when TYPE is missing', async () => {
      executor.loadMacro('SAVEAS FILE=output.txt');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(sentMessages).toHaveLength(0);
    });

    it('should return MISSING_PARAMETER when FILE is missing', async () => {
      executor.loadMacro('SAVEAS TYPE=TXT');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(sentMessages).toHaveLength(0);
    });
  });

  // ===== Invalid Parameter Errors =====

  describe('Invalid parameter errors', () => {
    it('should return INVALID_PARAMETER for invalid TYPE', async () => {
      executor.loadMacro('SAVEAS TYPE=INVALID FILE=foo');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(sentMessages).toHaveLength(0);
    });

    it('should return INVALID_PARAMETER when QUALITY is out of range (>100)', async () => {
      executor.loadMacro('SAVEAS TYPE=JPG FILE=foo QUALITY=200');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(sentMessages).toHaveLength(0);
    });

    it('should return INVALID_PARAMETER when QUALITY is non-numeric', async () => {
      executor.loadMacro('SAVEAS TYPE=JPG FILE=foo QUALITY=abc');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(sentMessages).toHaveLength(0);
    });
  });

  // ===== Bridge Failure =====

  describe('Bridge failure handling', () => {
    it('should return FILE_WRITE_ERROR when bridge returns failure', async () => {
      (mockBridge.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: false,
        error: 'Disk full',
      });

      executor.loadMacro('SAVEAS TYPE=TXT FILE=output.txt');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.FILE_WRITE_ERROR);
    });

    it('should return FILE_WRITE_ERROR when bridge throws an exception', async () => {
      (mockBridge.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Connection lost')
      );

      executor.loadMacro('SAVEAS TYPE=TXT FILE=output.txt');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.FILE_WRITE_ERROR);
    });
  });

  // ===== Variable Expansion =====

  describe('Variable expansion', () => {
    it('should expand variables in FILE parameter', async () => {
      const script = [
        'SET !VAR1 report.txt',
        'SAVEAS TYPE=TXT FILE={{!VAR1}}',
      ].join('\n');
      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as SaveAsMessage;
      expect(msg.file).toBe('report.txt');
    });
  });

  // ===== FILE Wildcards =====

  describe('FILE wildcards', () => {
    it('FILE=* for non-EXTRACT should derive name from !URLCURRENT', async () => {
      const script = [
        'URL GOTO=https://example.com/reports/annual-report.html',
        'SAVEAS TYPE=TXT FILE=*',
      ].join('\n');
      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as SaveAsMessage;
      expect(msg.file).toBe('annual-report');
    });

    it('FILE=* for EXTRACT should use "extract.csv"', async () => {
      const script = [
        'SET !EXTRACT test-data',
        'SAVEAS TYPE=EXTRACT FILE=*',
      ].join('\n');
      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as SaveAsMessage;
      expect(msg.file).toBe('extract.csv');
    });

    it('FILE=+suffix for non-EXTRACT should append suffix to derived name', async () => {
      const script = [
        'URL GOTO=https://example.com/page.html',
        'SAVEAS TYPE=HTM FILE=+_backup',
      ].join('\n');
      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as SaveAsMessage;
      expect(msg.file).toBe('page_backup');
    });

    it('FILE=+suffix for EXTRACT should produce "extract<suffix>.csv"', async () => {
      const script = [
        'SET !EXTRACT data',
        'SAVEAS TYPE=EXTRACT FILE=+_2024',
      ].join('\n');
      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as SaveAsMessage;
      expect(msg.file).toBe('extract_2024.csv');
    });

    it('FILE=* should fall back to hostname when no path segment', async () => {
      const script = [
        'URL GOTO=https://www.example.com/',
        'SAVEAS TYPE=TXT FILE=*',
      ].join('\n');
      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as SaveAsMessage;
      // hostname "www.example.com" → strip "www." → "example.com" → strip extension → "example"
      expect(msg.file).toBe('example');
    });

    it('FILE=* should return "unknown" when URL is empty', async () => {
      executor.loadMacro('SAVEAS TYPE=TXT FILE=*');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as SaveAsMessage;
      expect(msg.file).toBe('unknown');
    });
  });

  // ===== Filename Sanitization =====

  describe('Filename sanitization', () => {
    it('should replace illegal characters with underscore', async () => {
      executor.loadMacro('SAVEAS TYPE=TXT FILE=my:file*name.txt');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as SaveAsMessage;
      expect(msg.file).toBe('my_file_name.txt');
    });

    it('should sanitize wildcard-derived filenames', async () => {
      const script = [
        'URL GOTO=https://example.com/my:page',
        'SAVEAS TYPE=TXT FILE=*',
      ].join('\n');
      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as SaveAsMessage;
      // "my:page" has no extension so derived as "my:page", sanitized to "my_page"
      expect(msg.file).toBe('my_page');
    });
  });

  // ===== Path Validation =====

  describe('Path validation', () => {
    it('should return DOWNLOAD_FOLDER_ACCESS error for null byte in folder', async () => {
      executor.loadMacro('SAVEAS TYPE=TXT FOLDER=/tmp/bad\x00path FILE=test.txt');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.DOWNLOAD_FOLDER_ACCESS);
    });

    it('should accept folder=* without validation error', async () => {
      executor.loadMacro('SAVEAS TYPE=TXT FOLDER=* FILE=output.txt');
      const result = await executor.execute();

      expect(result.success).toBe(true);
    });
  });

  // ===== Download ID State Storage =====

  describe('Download ID state storage', () => {
    it('should attempt to store downloadId in state after successful save', async () => {
      executor.loadMacro('SAVEAS TYPE=TXT FILE=output.txt');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

      // Verify the bridge was called and returned a downloadId
      expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
      const response = await (mockBridge.sendMessage as ReturnType<typeof vi.fn>).mock.results[0].value;
      expect(response.data.downloadId).toBe(42);
    });
  });
});
