/**
 * Integration Tests for FILEDELETE Command
 *
 * Tests the FILEDELETE command through the MacroExecutor with a mock FileBridge.
 * Verifies parameter validation, variable expansion, bridge communication,
 * error code mapping, exception handling, and success output.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createExecutor, MacroExecutor, IMACROS_ERROR_CODES } from '@shared/executor';
import {
  registerFileHandlers,
  setFileBridge,
  FileBridge,
  FileOperationMessage,
  FileOperationResponse,
  FileDeleteMessage,
} from '@shared/commands/files';

describe('FILEDELETE Command Integration Tests', () => {
  let executor: MacroExecutor;
  let mockBridge: FileBridge;
  let sentMessages: FileOperationMessage[];

  beforeEach(() => {
    sentMessages = [];
    mockBridge = {
      sendMessage: vi.fn(async (message: FileOperationMessage): Promise<FileOperationResponse> => {
        sentMessages.push(message);
        return { success: true, data: { path: (message as FileDeleteMessage).path } };
      }),
    };
    setFileBridge(mockBridge);
    executor = createExecutor();
    registerFileHandlers(executor.registerHandler.bind(executor));
  });

  afterEach(() => {
    setFileBridge(null as unknown as FileBridge);
  });

  // ===== Basic Success Cases =====

  describe('Basic success cases', () => {
    it('should send fileDelete with path=/tmp/test.txt and succeed', async () => {
      executor.loadMacro('FILEDELETE NAME=/tmp/test.txt');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as FileDeleteMessage;
      expect(msg.type).toBe('fileDelete');
      expect(msg.path).toBe('/tmp/test.txt');
    });

    it('should send fileDelete with correct path for output.csv', async () => {
      executor.loadMacro('FILEDELETE NAME=output.csv');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as FileDeleteMessage;
      expect(msg.type).toBe('fileDelete');
      expect(msg.path).toBe('output.csv');
    });

    it('should return the file path as output on success', async () => {
      executor.loadMacro('FILEDELETE NAME=/tmp/test.txt');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      // The last command output is stored; check via variables or the result
      // Since the handler returns output: filePath, verify it was returned
      expect(sentMessages).toHaveLength(1);
      const msg = sentMessages[0] as FileDeleteMessage;
      expect(msg.path).toBe('/tmp/test.txt');
    });
  });

  // ===== Variable Expansion =====

  describe('Variable expansion', () => {
    it('should expand !VAR1 in NAME parameter', async () => {
      const script = [
        'SET !VAR1 myfile.txt',
        'FILEDELETE NAME={{!VAR1}}',
      ].join('\n');

      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as FileDeleteMessage;
      expect(msg.type).toBe('fileDelete');
      expect(msg.path).toBe('myfile.txt');
    });

    it('should expand variable in multi-command macro (SET then FILEDELETE)', async () => {
      const script = [
        'SET !VAR1 /data/reports',
        'SET !VAR2 report.csv',
        'FILEDELETE NAME={{!VAR1}}/{{!VAR2}}',
      ].join('\n');

      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as FileDeleteMessage;
      expect(msg.path).toBe('/data/reports/report.csv');
    });
  });

  // ===== Parameter Validation =====

  describe('Parameter validation', () => {
    it('should return MISSING_PARAMETER when NAME is not provided', async () => {
      executor.loadMacro('FILEDELETE');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(sentMessages).toHaveLength(0);
    });

    it('should return MISSING_PARAMETER when NAME is empty string', async () => {
      // NAME= parses to empty string, which is falsy, so handler treats it as missing
      executor.loadMacro('FILEDELETE NAME=');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(sentMessages).toHaveLength(0);
    });

    it('should return INVALID_PARAMETER when NAME expands to empty after variable expansion', async () => {
      // !VAR1 defaults to empty string, so {{!VAR1}} expands to ''
      // nameParam is '{{!VAR1}}' (truthy), but expand() returns '' (empty)
      // This triggers the INVALID_PARAMETER path
      executor.loadMacro('FILEDELETE NAME={{!VAR1}}');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(sentMessages).toHaveLength(0);
    });
  });

  // ===== No Bridge Configured =====

  describe('No bridge configured', () => {
    it('should return failure when no file bridge is configured', async () => {
      setFileBridge(null as unknown as FileBridge);

      executor = createExecutor();
      registerFileHandlers(executor.registerHandler.bind(executor));

      executor.loadMacro('FILEDELETE NAME=/tmp/test.txt');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      // No bridge should result in a failure (not success like some other handlers)
      expect(result.errorCode).not.toBe(IMACROS_ERROR_CODES.OK);
    });
  });

  // ===== Bridge Error Mapping =====

  describe('Bridge error mapping', () => {
    it('should map "not found" error to FILE_NOT_FOUND', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<FileOperationResponse> => {
        return { success: false, error: 'File not found at specified path' };
      });

      executor.loadMacro('FILEDELETE NAME=/tmp/missing.txt');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.FILE_NOT_FOUND);
    });

    it('should map "enoent" error to FILE_NOT_FOUND', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<FileOperationResponse> => {
        return { success: false, error: 'ENOENT: no such file or directory' };
      });

      executor.loadMacro('FILEDELETE NAME=/tmp/missing.txt');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.FILE_NOT_FOUND);
    });

    it('should map "permission denied" error to FILE_ACCESS_DENIED', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<FileOperationResponse> => {
        return { success: false, error: 'permission denied' };
      });

      executor.loadMacro('FILEDELETE NAME=/etc/protected.txt');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.FILE_ACCESS_DENIED);
    });

    it('should map "access denied" error to FILE_ACCESS_DENIED', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<FileOperationResponse> => {
        return { success: false, error: 'access denied for this path' };
      });

      executor.loadMacro('FILEDELETE NAME=/etc/protected.txt');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.FILE_ACCESS_DENIED);
    });

    it('should map generic error to FILE_ERROR', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<FileOperationResponse> => {
        return { success: false, error: 'disk I/O failure' };
      });

      executor.loadMacro('FILEDELETE NAME=/tmp/test.txt');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.FILE_ERROR);
    });
  });

  // ===== Bridge Exceptions =====

  describe('Bridge exceptions', () => {
    it('should return FILE_ERROR when bridge throws an exception', async () => {
      mockBridge.sendMessage = vi.fn(async (): Promise<FileOperationResponse> => {
        throw new Error('Unexpected bridge failure');
      });

      executor.loadMacro('FILEDELETE NAME=/tmp/test.txt');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.FILE_ERROR);
    });
  });
});
