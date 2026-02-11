/**
 * Unit tests for shared/src/commands/files.ts and
 * shared/src/commands/datasource-handler.ts
 *
 * Covers uncovered lines:
 * - files.ts line 90: getFileBridge() returns null initially
 * - files.ts line 254: createFileHandlers() function
 * - datasource-handler.ts line 166: DS CMD=READ when line is out of range
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  filedeleteHandler,
  setFileBridge,
  getFileBridge,
  fileHandlers,
  registerFileHandlers,
  createFileHandlers,
} from '../../../shared/src/commands/files';
import {
  dsCommandHandler,
  getDatasourceManager,
  setDatasourceManager,
  ensureDatasourceManager,
  loadDatasourceFromContent,
  datasourceHandlers,
  registerDatasourceHandlers,
} from '../../../shared/src/commands/datasource-handler';
import { IMACROS_ERROR_CODES } from '../../../shared/src/executor';

// ===== Test Helpers =====

/**
 * Create a mock CommandContext for direct handler invocation.
 */
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
      getDatasourceRowCount: () => vars.get('__DS_ROW_COUNT__') ?? 0,
      setDatasourceRows: (rows: any[]) => vars.set('__DS_ROWS__', rows),
      setDatasourceLine: (line: number) => vars.set('!DATASOURCE_LINE', line),
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

// =========================================================================
// FILES HANDLER TESTS
// =========================================================================

describe('files.ts', () => {
  beforeEach(() => {
    // Reset file bridge to null before each test
    setFileBridge(null as any);
  });

  // --- getFileBridge returns null initially (line 90) ---

  describe('getFileBridge', () => {
    it('returns null when no bridge has been set', () => {
      // Ensure bridge is cleared
      setFileBridge(null as any);
      const bridge = getFileBridge();
      expect(bridge).toBeNull();
    });
  });

  // --- setFileBridge / getFileBridge round-trip ---

  describe('setFileBridge / getFileBridge', () => {
    it('stores and retrieves the bridge instance', () => {
      const mockBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setFileBridge(mockBridge);
      expect(getFileBridge()).toBe(mockBridge);
    });
  });

  // --- filedeleteHandler ---

  describe('filedeleteHandler', () => {
    it('succeeds when bridge returns success', async () => {
      const mockBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setFileBridge(mockBridge);

      const ctx = createMockContext({ NAME: '/tmp/test.txt' });
      const result = await filedeleteHandler(ctx);

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(result.output).toBe('/tmp/test.txt');
      expect(mockBridge.sendMessage).toHaveBeenCalledOnce();
      expect(mockBridge.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'fileDelete', path: '/tmp/test.txt' }),
      );
    });

    it('returns MISSING_PARAMETER when NAME is absent', async () => {
      const ctx = createMockContext({});
      const result = await filedeleteHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(result.errorMessage).toContain('NAME');
    });

    it('returns INVALID_PARAMETER when NAME is empty', async () => {
      const ctx = createMockContext({ NAME: '   ' });
      const result = await filedeleteHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(result.errorMessage).toContain('empty');
    });

    it('resolves relative path with !FOLDER_DOWNLOAD', async () => {
      const mockBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setFileBridge(mockBridge);

      const vars = new Map<string, any>();
      vars.set('!FOLDER_DOWNLOAD', '/home/user/downloads');
      const ctx = createMockContext({ NAME: 'myfile.txt' }, vars);
      const result = await filedeleteHandler(ctx);

      expect(result.success).toBe(true);
      expect(result.output).toBe('/home/user/downloads/myfile.txt');
      expect(mockBridge.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/home/user/downloads/myfile.txt' }),
      );
    });

    it('does not modify absolute paths', async () => {
      const mockBridge = {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      };
      setFileBridge(mockBridge);

      const ctx = createMockContext({ NAME: '/absolute/path/file.txt' });
      const result = await filedeleteHandler(ctx);

      expect(result.success).toBe(true);
      expect(result.output).toBe('/absolute/path/file.txt');
    });

    it('returns failure when no bridge is configured', async () => {
      // Bridge is null (reset in beforeEach)
      const ctx = createMockContext({ NAME: '/tmp/test.txt' });
      const result = await filedeleteHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.FILE_ERROR);
      expect(result.errorMessage).toContain('native messaging');
    });

    it('returns FILE_NOT_FOUND for bridge failure with "not found"', async () => {
      const mockBridge = {
        sendMessage: vi.fn().mockResolvedValue({
          success: false,
          error: 'File not found at path',
        }),
      };
      setFileBridge(mockBridge);

      const ctx = createMockContext({ NAME: '/tmp/missing.txt' });
      const result = await filedeleteHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.FILE_NOT_FOUND);
    });

    it('returns FILE_ACCESS_DENIED for bridge failure with "permission"', async () => {
      const mockBridge = {
        sendMessage: vi.fn().mockResolvedValue({
          success: false,
          error: 'Permission denied',
        }),
      };
      setFileBridge(mockBridge);

      const ctx = createMockContext({ NAME: '/etc/protected.txt' });
      const result = await filedeleteHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.FILE_ACCESS_DENIED);
    });

    it('returns FILE_ERROR for bridge failure with generic error', async () => {
      const mockBridge = {
        sendMessage: vi.fn().mockResolvedValue({
          success: false,
          error: 'Disk I/O error occurred',
        }),
      };
      setFileBridge(mockBridge);

      const ctx = createMockContext({ NAME: '/tmp/test.txt' });
      const result = await filedeleteHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.FILE_ERROR);
      expect(result.errorMessage).toBe('Disk I/O error occurred');
    });

    it('returns FILE_ERROR when bridge throws an exception', async () => {
      const mockBridge = {
        sendMessage: vi.fn().mockRejectedValue(new Error('Connection lost')),
      };
      setFileBridge(mockBridge);

      const ctx = createMockContext({ NAME: '/tmp/test.txt' });
      const result = await filedeleteHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.FILE_ERROR);
      expect(result.errorMessage).toContain('Connection lost');
    });
  });

  // --- fileHandlers map ---

  describe('fileHandlers', () => {
    it('contains FILEDELETE handler', () => {
      expect(fileHandlers).toHaveProperty('FILEDELETE');
      expect(fileHandlers.FILEDELETE).toBe(filedeleteHandler);
    });
  });

  // --- registerFileHandlers ---

  describe('registerFileHandlers', () => {
    it('calls registerFn for each handler', () => {
      const registerFn = vi.fn();
      registerFileHandlers(registerFn);

      expect(registerFn).toHaveBeenCalledWith('FILEDELETE', filedeleteHandler);
    });
  });

  // --- createFileHandlers (line 254) ---

  describe('createFileHandlers', () => {
    it('returns a new object containing the file handlers', () => {
      const handlers = createFileHandlers();

      expect(handlers).toHaveProperty('FILEDELETE');
      expect(handlers.FILEDELETE).toBe(filedeleteHandler);
      // Verify it is a copy, not the same reference
      expect(handlers).not.toBe(fileHandlers);
    });
  });
});

// =========================================================================
// DATASOURCE HANDLER TESTS
// =========================================================================

describe('datasource-handler.ts', () => {
  beforeEach(() => {
    // Reset datasource manager before each test
    setDatasourceManager(null);
  });

  // --- getDatasourceManager returns null initially ---

  describe('getDatasourceManager', () => {
    it('returns null when no manager has been set', () => {
      expect(getDatasourceManager()).toBeNull();
    });
  });

  // --- setDatasourceManager / getDatasourceManager round-trip ---

  describe('setDatasourceManager / getDatasourceManager', () => {
    it('stores and retrieves the manager instance', () => {
      const mgr = ensureDatasourceManager();
      setDatasourceManager(mgr);
      expect(getDatasourceManager()).toBe(mgr);
    });

    it('clears the manager when set to null', () => {
      ensureDatasourceManager();
      setDatasourceManager(null);
      expect(getDatasourceManager()).toBeNull();
    });
  });

  // --- ensureDatasourceManager ---

  describe('ensureDatasourceManager', () => {
    it('creates a new manager when none exists', () => {
      expect(getDatasourceManager()).toBeNull();
      const mgr = ensureDatasourceManager();
      expect(mgr).not.toBeNull();
      expect(getDatasourceManager()).toBe(mgr);
    });

    it('returns existing manager if already set', () => {
      const first = ensureDatasourceManager();
      const second = ensureDatasourceManager();
      expect(first).toBe(second);
    });
  });

  // --- loadDatasourceFromContent ---

  describe('loadDatasourceFromContent', () => {
    it('returns true on successful load', () => {
      const csv = 'a,b,c\n1,2,3\n4,5,6';
      const result = loadDatasourceFromContent(csv, 'test.csv');
      expect(result).toBe(true);

      const mgr = getDatasourceManager();
      expect(mgr).not.toBeNull();
      expect(mgr!.isLoaded()).toBe(true);
      expect(mgr!.getRowCount()).toBe(3);
    });

    it('returns false on failure (empty content)', () => {
      const result = loadDatasourceFromContent('');
      expect(result).toBe(false);
    });
  });

  // --- dsCommandHandler ---

  describe('dsCommandHandler', () => {
    /**
     * Helper: set up a context with datasource rows already populated.
     * Simulates what happens after SET !DATASOURCE loads CSV data.
     */
    function setupDatasourceContext(
      params: Record<string, string>,
      rowCount: number,
      currentLine: number = 1,
    ) {
      const vars = new Map<string, any>();
      vars.set('__DS_ROW_COUNT__', rowCount);
      vars.set('!DATASOURCE_LINE', currentLine);
      return createMockContext(params, vars);
    }

    // --- CMD=NEXT ---

    describe('CMD=NEXT', () => {
      it('increments DATASOURCE_LINE on success', async () => {
        const ctx = setupDatasourceContext({ CMD: 'NEXT' }, 5, 1);
        const result = await dsCommandHandler(ctx);

        expect(result.success).toBe(true);
        expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
        expect(ctx._vars.get('!DATASOURCE_LINE')).toBe(2);
      });

      it('returns DATASOURCE_END when at end of datasource', async () => {
        const ctx = setupDatasourceContext({ CMD: 'NEXT' }, 3, 3);
        const result = await dsCommandHandler(ctx);

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(IMACROS_ERROR_CODES.DATASOURCE_END);
        expect(result.errorMessage).toContain('End of datasource');
      });
    });

    // --- CMD=RESET ---

    describe('CMD=RESET', () => {
      it('resets DATASOURCE_LINE to 1', async () => {
        const ctx = setupDatasourceContext({ CMD: 'RESET' }, 5, 3);
        const result = await dsCommandHandler(ctx);

        expect(result.success).toBe(true);
        expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
        expect(ctx._vars.get('!DATASOURCE_LINE')).toBe(1);
      });
    });

    // --- CMD=READ ---

    describe('CMD=READ', () => {
      it('succeeds when line is within range', async () => {
        const ctx = setupDatasourceContext({ CMD: 'READ' }, 5, 2);
        const result = await dsCommandHandler(ctx);

        expect(result.success).toBe(true);
        expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      });

      it('returns DATASOURCE_END when line > rowCount (line 166)', async () => {
        // Load a real datasource with 2 rows
        loadDatasourceFromContent('a,b\n1,2', 'test.csv');

        // Set !DATASOURCE_LINE to 99, well past the 2 rows
        const vars = new Map<string, any>();
        vars.set('__DS_ROW_COUNT__', 2);
        vars.set('!DATASOURCE_LINE', 99);
        const ctx = createMockContext({ CMD: 'READ' }, vars);

        const result = await dsCommandHandler(ctx);

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(IMACROS_ERROR_CODES.DATASOURCE_END);
        expect(result.errorMessage).toContain('out of range');
        expect(result.errorMessage).toContain('99');
      });

      it('returns DATASOURCE_END when line < 1 (line 166)', async () => {
        const vars = new Map<string, any>();
        vars.set('__DS_ROW_COUNT__', 3);
        vars.set('!DATASOURCE_LINE', 0);
        const ctx = createMockContext({ CMD: 'READ' }, vars);

        const result = await dsCommandHandler(ctx);

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(IMACROS_ERROR_CODES.DATASOURCE_END);
        expect(result.errorMessage).toContain('out of range');
      });
    });

    // --- Missing CMD ---

    describe('missing CMD parameter', () => {
      it('returns MISSING_PARAMETER', async () => {
        const ctx = setupDatasourceContext({}, 5);
        const result = await dsCommandHandler(ctx);

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
        expect(result.errorMessage).toContain('CMD');
      });
    });

    // --- Invalid CMD ---

    describe('invalid CMD value', () => {
      it('returns INVALID_PARAMETER', async () => {
        const ctx = setupDatasourceContext({ CMD: 'BOGUS' }, 5);
        const result = await dsCommandHandler(ctx);

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
        expect(result.errorMessage).toContain('BOGUS');
      });
    });

    // --- No datasource loaded ---

    describe('no datasource loaded', () => {
      it('returns DATASOURCE_ERROR when row count is 0', async () => {
        const ctx = setupDatasourceContext({ CMD: 'NEXT' }, 0);
        const result = await dsCommandHandler(ctx);

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(IMACROS_ERROR_CODES.DATASOURCE_ERROR);
        expect(result.errorMessage).toContain('No datasource loaded');
      });
    });
  });

  // --- datasourceHandlers map ---

  describe('datasourceHandlers', () => {
    it('contains DS handler', () => {
      expect(datasourceHandlers).toHaveProperty('DS');
      expect(datasourceHandlers.DS).toBe(dsCommandHandler);
    });
  });

  // --- registerDatasourceHandlers ---

  describe('registerDatasourceHandlers', () => {
    it('calls registerFn for each handler', () => {
      const registerFn = vi.fn();
      registerDatasourceHandlers(registerFn);

      expect(registerFn).toHaveBeenCalledWith('DS', dsCommandHandler);
    });
  });
});
