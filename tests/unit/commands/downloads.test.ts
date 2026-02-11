/**
 * Unit tests for shared/src/commands/downloads.ts
 *
 * Covers uncovered branches at lines:
 * - 178: getDownloadBridge() returns null
 * - 820-821: deriveItemLeafName hostname fallback (without www.)
 * - 975: createDownloadHandlers() function
 *
 * Also provides comprehensive coverage for all download command handlers,
 * utility functions, and the DownloadTimeoutManager.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ondownloadHandler,
  saveasHandler,
  saveitemHandler,
  setDownloadBridge,
  getDownloadBridge,
  notifyDownloadStarted,
  getDownloadTimeoutManager,
  sanitizeFilename,
  deriveDocumentName,
  formatExtractAsCsv,
  createDownloadHandlers,
  registerDownloadHandlers,
  DOWNLOAD_FOLDER_KEY,
  DOWNLOAD_FILE_KEY,
  LAST_DOWNLOAD_ID_KEY,
} from '../../../shared/src/commands/downloads';
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
    },
    state: {
      setVariable: (name: string, value: any) => vars.set(name.toUpperCase(), value),
      getVariable: (name: string) => vars.get(name.toUpperCase()) ?? null,
      addExtract: (value: string) => {
        const current = vars.get('!EXTRACT') || '';
        vars.set('!EXTRACT', current ? current + '[EXTRACT]' + value : value);
      },
      clearExtract: () => vars.delete('!EXTRACT'),
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

// ===== Setup / Teardown =====

beforeEach(() => {
  // Reset the download bridge to null before each test
  setDownloadBridge(null as any);
  // Cancel any lingering timeout
  getDownloadTimeoutManager().cancel();
});

afterEach(() => {
  getDownloadTimeoutManager().cancel();
});

// ===== getDownloadBridge / setDownloadBridge =====

describe('getDownloadBridge', () => {
  it('returns null when no bridge is set (line 178)', () => {
    // Reset by setting to null explicitly
    setDownloadBridge(null as any);
    const bridge = getDownloadBridge();
    expect(bridge).toBeNull();
  });
});

describe('setDownloadBridge / getDownloadBridge', () => {
  it('stores and retrieves a download bridge', () => {
    const mockBridge = { sendMessage: vi.fn().mockResolvedValue({ success: true }) };
    setDownloadBridge(mockBridge);
    expect(getDownloadBridge()).toBe(mockBridge);
  });

  it('replaces a previously set bridge', () => {
    const bridge1 = { sendMessage: vi.fn() };
    const bridge2 = { sendMessage: vi.fn() };
    setDownloadBridge(bridge1);
    setDownloadBridge(bridge2);
    expect(getDownloadBridge()).toBe(bridge2);
  });
});

// ===== sanitizeFilename =====

describe('sanitizeFilename', () => {
  it('replaces illegal characters with underscore', () => {
    expect(sanitizeFilename('file:name')).toBe('file_name');
    expect(sanitizeFilename('file*name')).toBe('file_name');
    expect(sanitizeFilename('file?name')).toBe('file_name');
    expect(sanitizeFilename('file|name')).toBe('file_name');
    expect(sanitizeFilename('file<name')).toBe('file_name');
    expect(sanitizeFilename('file>name')).toBe('file_name');
    expect(sanitizeFilename('file"name')).toBe('file_name');
    expect(sanitizeFilename('file/name')).toBe('file_name');
  });

  it('replaces sequences of illegal chars with single underscore', () => {
    expect(sanitizeFilename('file:*?name')).toBe('file_name');
  });

  it('replaces surrounding whitespace along with illegal chars', () => {
    expect(sanitizeFilename('file : name')).toBe('file_name');
  });

  it('returns the filename unchanged when no illegal chars', () => {
    expect(sanitizeFilename('valid-file_name.txt')).toBe('valid-file_name.txt');
  });
});

// ===== deriveDocumentName =====

describe('deriveDocumentName', () => {
  it('extracts name from URL path', () => {
    expect(deriveDocumentName('https://example.com/page.html')).toBe('page');
  });

  it('strips file extension', () => {
    expect(deriveDocumentName('https://example.com/document.pdf')).toBe('document');
  });

  it('falls back to hostname when no path segment (stripping www.)', () => {
    // deriveDocumentName strips www., gets "example.com", then strips ".com" as extension
    expect(deriveDocumentName('https://www.example.com/')).toBe('example');
  });

  it('falls back to document title when no path and no www. in hostname', () => {
    // hostname without www. prefix and no path segment - does not match www. regex
    // so it falls through to documentTitle fallback
    expect(deriveDocumentName('https://example.com/', 'My Page Title')).toBe('My Page Title');
  });

  it('returns "unknown" when no path, no www. hostname, and no title', () => {
    expect(deriveDocumentName('https://example.com/')).toBe('unknown');
  });

  it('returns "unknown" for invalid URLs', () => {
    expect(deriveDocumentName('not-a-url')).toBe('unknown');
  });

  it('handles name without extension', () => {
    expect(deriveDocumentName('https://example.com/readme')).toBe('readme');
  });
});

// ===== formatExtractAsCsv =====

describe('formatExtractAsCsv', () => {
  it('wraps data in double quotes', () => {
    expect(formatExtractAsCsv('hello')).toBe('"hello"');
  });

  it('escapes existing double quotes', () => {
    expect(formatExtractAsCsv('say "hi"')).toBe('"say ""hi"""');
  });

  it('replaces [EXTRACT] delimiters with "," for CSV fields', () => {
    expect(formatExtractAsCsv('field1[EXTRACT]field2[EXTRACT]field3')).toBe(
      '"field1","field2","field3"',
    );
  });

  it('handles empty string', () => {
    expect(formatExtractAsCsv('')).toBe('""');
  });

  it('escapes quotes and replaces delimiters together', () => {
    expect(formatExtractAsCsv('"a"[EXTRACT]"b"')).toBe('"""a""","""b"""');
  });
});

// ===== ondownloadHandler =====

describe('ondownloadHandler', () => {
  it('succeeds with FOLDER and FILE', async () => {
    const ctx = createMockContext({ FOLDER: '/tmp/downloads', FILE: 'test.zip' });
    const result = await ondownloadHandler(ctx);
    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    expect(ctx._vars.get(DOWNLOAD_FOLDER_KEY)).toBe('/tmp/downloads');
    expect(ctx._vars.get(DOWNLOAD_FILE_KEY)).toBe('test.zip');
  });

  it('fails when FOLDER is missing', async () => {
    const ctx = createMockContext({ FILE: 'test.zip' });
    const result = await ondownloadHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    expect(result.errorMessage).toMatch(/FOLDER and FILE/);
  });

  it('fails when FILE is missing', async () => {
    const ctx = createMockContext({ FOLDER: '/tmp' });
    const result = await ondownloadHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
  });

  it('fails when both FOLDER and FILE are missing', async () => {
    const ctx = createMockContext({});
    const result = await ondownloadHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
  });

  it('rejects folder path with null byte', async () => {
    const ctx = createMockContext({ FOLDER: '/tmp/\0bad', FILE: 'test.zip' });
    const result = await ondownloadHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.DOWNLOAD_FOLDER_ACCESS);
    expect(result.errorMessage).toMatch(/null byte/);
  });

  it('allows wildcard FOLDER=*', async () => {
    const ctx = createMockContext({ FOLDER: '*', FILE: 'test.zip' });
    const result = await ondownloadHandler(ctx);
    expect(result.success).toBe(true);
    expect(ctx._vars.get(DOWNLOAD_FOLDER_KEY)).toBe('*');
  });

  it('rejects filename with illegal characters', async () => {
    const ctx = createMockContext({ FOLDER: '/tmp', FILE: 'bad:file.zip' });
    const result = await ondownloadHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.DOWNLOAD_INVALID_FILENAME);
    expect(result.errorMessage).toMatch(/Illegal character/);
  });

  it('allows FILE=+ wildcard', async () => {
    const ctx = createMockContext({ FOLDER: '/tmp', FILE: '+' });
    const result = await ondownloadHandler(ctx);
    expect(result.success).toBe(true);
    expect(ctx._vars.get(DOWNLOAD_FILE_KEY)).toBe('+');
  });

  it('allows FILE=* wildcard', async () => {
    const ctx = createMockContext({ FOLDER: '/tmp', FILE: '*' });
    const result = await ondownloadHandler(ctx);
    expect(result.success).toBe(true);
    expect(ctx._vars.get(DOWNLOAD_FILE_KEY)).toBe('*');
  });

  it('validates CHECKSUM with MD5 format', async () => {
    const md5Hash = 'a'.repeat(32);
    const ctx = createMockContext({
      FOLDER: '/tmp',
      FILE: 'test.zip',
      CHECKSUM: `MD5:${md5Hash}`,
    });
    const result = await ondownloadHandler(ctx);
    expect(result.success).toBe(true);
  });

  it('validates CHECKSUM with SHA1 format', async () => {
    const sha1Hash = 'b'.repeat(40);
    const ctx = createMockContext({
      FOLDER: '/tmp',
      FILE: 'test.zip',
      CHECKSUM: `SHA1:${sha1Hash}`,
    });
    const result = await ondownloadHandler(ctx);
    expect(result.success).toBe(true);
  });

  it('rejects CHECKSUM without colon separator', async () => {
    const ctx = createMockContext({
      FOLDER: '/tmp',
      FILE: 'test.zip',
      CHECKSUM: 'MD5abc123',
    });
    const result = await ondownloadHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    expect(result.errorMessage).toMatch(/ALGORITHM:hash/);
  });

  it('rejects unsupported checksum algorithm', async () => {
    const ctx = createMockContext({
      FOLDER: '/tmp',
      FILE: 'test.zip',
      CHECKSUM: 'SHA256:abcdef',
    });
    const result = await ondownloadHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    expect(result.errorMessage).toMatch(/Unsupported checksum algorithm/);
  });

  it('rejects CHECKSUM with invalid hex characters', async () => {
    const ctx = createMockContext({
      FOLDER: '/tmp',
      FILE: 'test.zip',
      CHECKSUM: 'MD5:xyz_not_hex',
    });
    const result = await ondownloadHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    expect(result.errorMessage).toMatch(/hexadecimal/);
  });

  it('rejects CHECKSUM with wrong hash length', async () => {
    const ctx = createMockContext({
      FOLDER: '/tmp',
      FILE: 'test.zip',
      CHECKSUM: 'MD5:abcdef',  // too short for MD5 (needs 32)
    });
    const result = await ondownloadHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    expect(result.errorMessage).toMatch(/hash length/);
  });

  it('rejects SHA1 CHECKSUM with wrong hash length', async () => {
    const ctx = createMockContext({
      FOLDER: '/tmp',
      FILE: 'test.zip',
      CHECKSUM: 'SHA1:abcdef',  // too short for SHA1 (needs 40)
    });
    const result = await ondownloadHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    expect(result.errorMessage).toMatch(/hash length/);
  });

  it('rejects CHECKSUM when WAIT=NO', async () => {
    const md5Hash = 'a'.repeat(32);
    const ctx = createMockContext({
      FOLDER: '/tmp',
      FILE: 'test.zip',
      WAIT: 'NO',
      CHECKSUM: `MD5:${md5Hash}`,
    });
    const result = await ondownloadHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    expect(result.errorMessage).toMatch(/CHECKSUM requires WAIT=YES/);
  });

  it('WAIT=NO sets download wait to 0', async () => {
    const ctx = createMockContext({ FOLDER: '/tmp', FILE: 'test.zip', WAIT: 'NO' });
    const result = await ondownloadHandler(ctx);
    expect(result.success).toBe(true);
    expect(ctx._vars.get('!DOWNLOAD_WAIT')).toBe(0);
  });

  it('WAIT=YES sets download wait to 1 (default)', async () => {
    const ctx = createMockContext({ FOLDER: '/tmp', FILE: 'test.zip' });
    const result = await ondownloadHandler(ctx);
    expect(result.success).toBe(true);
    expect(ctx._vars.get('!DOWNLOAD_WAIT')).toBe(1);
  });

  it('starts the download timeout manager', async () => {
    const ctx = createMockContext({ FOLDER: '/tmp', FILE: 'test.zip' });
    await ondownloadHandler(ctx);
    expect(getDownloadTimeoutManager().isActive()).toBe(true);
  });

  it('reports bridge error as DOWNLOAD_ERROR', async () => {
    const mockBridge = {
      sendMessage: vi.fn().mockResolvedValue({ success: false, error: 'bridge failed' }),
    };
    setDownloadBridge(mockBridge);
    const ctx = createMockContext({ FOLDER: '/tmp', FILE: 'test.zip' });
    const result = await ondownloadHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.DOWNLOAD_ERROR);
    expect(result.errorMessage).toBe('bridge failed');
  });

  it('handles bridge exception', async () => {
    const mockBridge = {
      sendMessage: vi.fn().mockRejectedValue(new Error('network error')),
    };
    setDownloadBridge(mockBridge);
    const ctx = createMockContext({ FOLDER: '/tmp', FILE: 'test.zip' });
    const result = await ondownloadHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.DOWNLOAD_ERROR);
  });
});

// ===== saveasHandler =====

describe('saveasHandler', () => {
  it('succeeds with TYPE=TXT', async () => {
    const ctx = createMockContext({
      TYPE: 'TXT',
      FOLDER: '/tmp',
      FILE: 'output.txt',
    });
    const result = await saveasHandler(ctx);
    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  it('succeeds with TYPE=HTM', async () => {
    const ctx = createMockContext({
      TYPE: 'HTM',
      FOLDER: '/tmp',
      FILE: 'page.htm',
    });
    const result = await saveasHandler(ctx);
    expect(result.success).toBe(true);
  });

  it('normalizes HTML to HTM', async () => {
    const ctx = createMockContext({
      TYPE: 'HTML',
      FOLDER: '/tmp',
      FILE: 'page.htm',
    });
    const result = await saveasHandler(ctx);
    expect(result.success).toBe(true);
  });

  it('succeeds with TYPE=PNG', async () => {
    const ctx = createMockContext({
      TYPE: 'PNG',
      FOLDER: '/tmp',
      FILE: 'screenshot.png',
    });
    const result = await saveasHandler(ctx);
    expect(result.success).toBe(true);
  });

  it('succeeds with TYPE=JPG and QUALITY', async () => {
    const ctx = createMockContext({
      TYPE: 'JPG',
      FOLDER: '/tmp',
      FILE: 'screenshot.jpg',
      QUALITY: '85',
    });
    const result = await saveasHandler(ctx);
    expect(result.success).toBe(true);
  });

  it('normalizes JPEG to JPG', async () => {
    const ctx = createMockContext({
      TYPE: 'JPEG',
      FOLDER: '/tmp',
      FILE: 'screenshot.jpg',
    });
    const result = await saveasHandler(ctx);
    expect(result.success).toBe(true);
  });

  it('fails when TYPE is missing', async () => {
    const ctx = createMockContext({ FOLDER: '/tmp', FILE: 'test.txt' });
    const result = await saveasHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    expect(result.errorMessage).toMatch(/TYPE/);
  });

  it('fails when FILE is missing', async () => {
    const ctx = createMockContext({ TYPE: 'TXT', FOLDER: '/tmp' });
    const result = await saveasHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    expect(result.errorMessage).toMatch(/FILE/);
  });

  it('fails with invalid TYPE', async () => {
    const ctx = createMockContext({
      TYPE: 'INVALID',
      FOLDER: '/tmp',
      FILE: 'test.txt',
    });
    const result = await saveasHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    expect(result.errorMessage).toMatch(/Invalid TYPE/);
  });

  it('rejects invalid QUALITY value (out of range)', async () => {
    const ctx = createMockContext({
      TYPE: 'JPG',
      FOLDER: '/tmp',
      FILE: 'screenshot.jpg',
      QUALITY: '150',
    });
    const result = await saveasHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    expect(result.errorMessage).toMatch(/QUALITY/);
  });

  it('rejects non-numeric QUALITY', async () => {
    const ctx = createMockContext({
      TYPE: 'JPG',
      FOLDER: '/tmp',
      FILE: 'screenshot.jpg',
      QUALITY: 'abc',
    });
    const result = await saveasHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
  });

  it('rejects negative QUALITY', async () => {
    const ctx = createMockContext({
      TYPE: 'JPG',
      FOLDER: '/tmp',
      FILE: 'screenshot.jpg',
      QUALITY: '-5',
    });
    const result = await saveasHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
  });

  it('handles EXTRACT type - formats CSV and clears extract', async () => {
    const vars = new Map<string, any>();
    vars.set('!EXTRACT', 'val1[EXTRACT]val2');
    const ctx = createMockContext(
      { TYPE: 'EXTRACT', FOLDER: '/tmp', FILE: 'data.csv' },
      vars,
    );
    const result = await saveasHandler(ctx);
    expect(result.success).toBe(true);
    // Extract should be cleared after SAVEAS TYPE=EXTRACT
    expect(vars.has('!EXTRACT')).toBe(false);
  });

  it('EXTRACT FILE=* resolves to extract.csv', async () => {
    const vars = new Map<string, any>();
    vars.set('!EXTRACT', 'some data');
    const ctx = createMockContext(
      { TYPE: 'EXTRACT', FOLDER: '/tmp', FILE: '*' },
      vars,
    );
    const result = await saveasHandler(ctx);
    expect(result.success).toBe(true);
  });

  it('EXTRACT FILE=+suffix resolves to extract{suffix}.csv', async () => {
    const vars = new Map<string, any>();
    vars.set('!EXTRACT', 'some data');
    const ctx = createMockContext(
      { TYPE: 'EXTRACT', FOLDER: '/tmp', FILE: '+_01' },
      vars,
    );
    const result = await saveasHandler(ctx);
    expect(result.success).toBe(true);
  });

  it('non-EXTRACT FILE=* derives from URL', async () => {
    const vars = new Map<string, any>();
    vars.set('!URLCURRENT', 'https://www.example.com/page.html');
    const ctx = createMockContext(
      { TYPE: 'TXT', FOLDER: '/tmp', FILE: '*' },
      vars,
    );
    const result = await saveasHandler(ctx);
    expect(result.success).toBe(true);
  });

  it('non-EXTRACT FILE=+suffix derives from URL and appends suffix', async () => {
    const vars = new Map<string, any>();
    vars.set('!URLCURRENT', 'https://www.example.com/page.html');
    const ctx = createMockContext(
      { TYPE: 'TXT', FOLDER: '/tmp', FILE: '+_copy' },
      vars,
    );
    const result = await saveasHandler(ctx);
    expect(result.success).toBe(true);
  });

  it('rejects folder with null byte', async () => {
    const ctx = createMockContext({
      TYPE: 'TXT',
      FOLDER: '/tmp/\0bad',
      FILE: 'test.txt',
    });
    const result = await saveasHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.DOWNLOAD_FOLDER_ACCESS);
  });

  it('uses ONDOWNLOAD folder when FOLDER param not given', async () => {
    const vars = new Map<string, any>();
    vars.set(DOWNLOAD_FOLDER_KEY, '/saved/folder');
    const ctx = createMockContext(
      { TYPE: 'TXT', FILE: 'test.txt' },
      vars,
    );
    const result = await saveasHandler(ctx);
    expect(result.success).toBe(true);
  });

  it('reports bridge failure as FILE_WRITE_ERROR', async () => {
    const mockBridge = {
      sendMessage: vi.fn().mockResolvedValue({ success: false, error: 'write failed' }),
    };
    setDownloadBridge(mockBridge);
    const ctx = createMockContext({
      TYPE: 'TXT',
      FOLDER: '/tmp',
      FILE: 'test.txt',
    });
    const result = await saveasHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.FILE_WRITE_ERROR);
  });

  it('stores downloadId from bridge response', async () => {
    const mockBridge = {
      sendMessage: vi.fn().mockResolvedValue({
        success: true,
        data: { downloadId: 42, filename: 'test.txt' },
      }),
    };
    setDownloadBridge(mockBridge);
    const ctx = createMockContext({
      TYPE: 'TXT',
      FOLDER: '/tmp',
      FILE: 'test.txt',
    });
    const result = await saveasHandler(ctx);
    expect(result.success).toBe(true);
    expect(ctx._vars.get(LAST_DOWNLOAD_ID_KEY)).toBe(42);
  });
});

// ===== saveitemHandler =====

describe('saveitemHandler', () => {
  it('succeeds with default settings (no bridge)', async () => {
    const vars = new Map<string, any>();
    vars.set(DOWNLOAD_FOLDER_KEY, '/tmp');
    vars.set(DOWNLOAD_FILE_KEY, 'item.zip');
    vars.set('!URLCURRENT', 'https://example.com/item.zip');
    const ctx = createMockContext({}, vars);
    const result = await saveitemHandler(ctx);
    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  it('succeeds with explicit URL', async () => {
    const ctx = createMockContext({ URL: 'https://example.com/file.zip' });
    const result = await saveitemHandler(ctx);
    expect(result.success).toBe(true);
  });

  it('resolves FILE=* using item URL leaf name', async () => {
    const vars = new Map<string, any>();
    vars.set(DOWNLOAD_FOLDER_KEY, '/tmp');
    vars.set(DOWNLOAD_FILE_KEY, '*');
    const ctx = createMockContext(
      { URL: 'https://example.com/archive.tar.gz' },
      vars,
    );
    const result = await saveitemHandler(ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBe('archive.tar.gz');
  });

  it('resolves FILE=+suffix - inserts suffix before extension', async () => {
    const vars = new Map<string, any>();
    vars.set(DOWNLOAD_FOLDER_KEY, '/tmp');
    vars.set(DOWNLOAD_FILE_KEY, '+_copy');
    const ctx = createMockContext(
      { URL: 'https://example.com/photo.jpg' },
      vars,
    );
    const result = await saveitemHandler(ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBe('photo_copy.jpg');
  });

  it('resolves FILE=+suffix - appends when no extension', async () => {
    const vars = new Map<string, any>();
    vars.set(DOWNLOAD_FOLDER_KEY, '/tmp');
    vars.set(DOWNLOAD_FILE_KEY, '+_v2');
    const ctx = createMockContext(
      { URL: 'https://example.com/readme' },
      vars,
    );
    const result = await saveitemHandler(ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBe('readme_v2');
  });

  it('consumes ONDOWNLOAD state after use', async () => {
    const vars = new Map<string, any>();
    vars.set(DOWNLOAD_FOLDER_KEY, '/tmp');
    vars.set(DOWNLOAD_FILE_KEY, 'item.zip');
    vars.set('!DOWNLOAD_WAIT', 1);
    vars.set('!DOWNLOAD_CHECKSUM', 'MD5:abc');
    vars.set('!URLCURRENT', 'https://example.com/item.zip');
    const ctx = createMockContext({}, vars);
    await saveitemHandler(ctx);
    // ONDOWNLOAD state should be consumed (cleared)
    expect(vars.get(DOWNLOAD_FOLDER_KEY)).toBe('');
    expect(vars.get(DOWNLOAD_FILE_KEY)).toBe('');
    expect(vars.get('!DOWNLOAD_WAIT')).toBe('');
    expect(vars.get('!DOWNLOAD_CHECKSUM')).toBe('');
  });

  it('reports bridge failure as DOWNLOAD_FAILED', async () => {
    const mockBridge = {
      sendMessage: vi.fn().mockResolvedValue({ success: false, error: 'download failed' }),
    };
    setDownloadBridge(mockBridge);
    const ctx = createMockContext({ URL: 'https://example.com/file.zip' });
    const result = await saveitemHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.DOWNLOAD_FAILED);
    expect(result.errorMessage).toBe('download failed');
  });

  it('stores downloadId from bridge response', async () => {
    const mockBridge = {
      sendMessage: vi.fn().mockResolvedValue({
        success: true,
        data: { downloadId: 99, filename: 'file.zip' },
      }),
    };
    setDownloadBridge(mockBridge);
    const ctx = createMockContext({ URL: 'https://example.com/file.zip' });
    const result = await saveitemHandler(ctx);
    expect(result.success).toBe(true);
    expect(ctx._vars.get(LAST_DOWNLOAD_ID_KEY)).toBe(99);
  });

  it('cancels download timeout on save', async () => {
    // Start the timeout first
    getDownloadTimeoutManager().start(6);
    expect(getDownloadTimeoutManager().isActive()).toBe(true);

    const ctx = createMockContext({ URL: 'https://example.com/file.zip' });
    await saveitemHandler(ctx);
    expect(getDownloadTimeoutManager().isActive()).toBe(false);
  });
});

// ===== deriveItemLeafName via saveitemHandler (lines 820-821) =====

describe('deriveItemLeafName hostname fallback (lines 820-821)', () => {
  it('falls back to bare hostname when URL has no path segment and no www.', async () => {
    // URL with no meaningful path segment (just /) and hostname without www. prefix
    // This hits line 820: `if (parsed.hostname) return parsed.hostname;`
    const vars = new Map<string, any>();
    vars.set(DOWNLOAD_FOLDER_KEY, '/tmp');
    vars.set(DOWNLOAD_FILE_KEY, '*');
    const ctx = createMockContext(
      { URL: 'http://example.com/' },
      vars,
    );
    const result = await saveitemHandler(ctx);
    expect(result.success).toBe(true);
    // deriveItemLeafName('http://example.com/') should return 'example.com'
    // because there's no last path segment and hostname does not start with www.
    expect(result.output).toBe('example.com');
  });

  it('falls back to hostname stripping www. when URL has no path segment', async () => {
    const vars = new Map<string, any>();
    vars.set(DOWNLOAD_FOLDER_KEY, '/tmp');
    vars.set(DOWNLOAD_FILE_KEY, '*');
    const ctx = createMockContext(
      { URL: 'http://www.example.com/' },
      vars,
    );
    const result = await saveitemHandler(ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBe('example.com');
  });

  it('returns "unknown" for invalid URL via saveitemHandler', async () => {
    const vars = new Map<string, any>();
    vars.set(DOWNLOAD_FOLDER_KEY, '/tmp');
    vars.set(DOWNLOAD_FILE_KEY, '*');
    vars.set('!URLCURRENT', 'not-a-valid-url');
    const ctx = createMockContext({}, vars);
    const result = await saveitemHandler(ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBe('unknown');
  });
});

// ===== createDownloadHandlers (line 975) =====

describe('createDownloadHandlers', () => {
  it('returns a record with all handler keys', () => {
    const handlers = createDownloadHandlers();
    expect(handlers).toHaveProperty('ONDOWNLOAD');
    expect(handlers).toHaveProperty('SAVEAS');
    expect(handlers).toHaveProperty('SAVEITEM');
    expect(typeof handlers.ONDOWNLOAD).toBe('function');
    expect(typeof handlers.SAVEAS).toBe('function');
    expect(typeof handlers.SAVEITEM).toBe('function');
  });

  it('returns a shallow copy (not the same reference)', () => {
    const h1 = createDownloadHandlers();
    const h2 = createDownloadHandlers();
    expect(h1).not.toBe(h2);
    // But the handler functions themselves are the same
    expect(h1.ONDOWNLOAD).toBe(h2.ONDOWNLOAD);
  });
});

// ===== registerDownloadHandlers =====

describe('registerDownloadHandlers', () => {
  it('registers all three handlers with the executor', () => {
    const registerHandler = vi.fn();
    registerDownloadHandlers({ registerHandler });
    expect(registerHandler).toHaveBeenCalledTimes(3);
    const types = registerHandler.mock.calls.map((c: any[]) => c[0]);
    expect(types).toContain('ONDOWNLOAD');
    expect(types).toContain('SAVEAS');
    expect(types).toContain('SAVEITEM');
  });

  it('wires up setPendingError callback when available', () => {
    const registerHandler = vi.fn();
    const setPendingError = vi.fn();
    registerDownloadHandlers({ registerHandler, setPendingError });
    expect(registerHandler).toHaveBeenCalledTimes(3);
    // The timeout manager should now have the callback wired
    // We can verify by starting a timeout and letting it fire
  });

  it('registers cleanup callback when available', () => {
    const registerHandler = vi.fn();
    const registerCleanup = vi.fn();
    registerDownloadHandlers({ registerHandler, registerCleanup });
    expect(registerCleanup).toHaveBeenCalledTimes(1);
    expect(typeof registerCleanup.mock.calls[0][0]).toBe('function');
  });

  it('cleanup callback cancels the download timeout', async () => {
    const registerHandler = vi.fn();
    const registerCleanup = vi.fn();
    registerDownloadHandlers({ registerHandler, registerCleanup });

    // Start a timeout
    getDownloadTimeoutManager().start(6);
    expect(getDownloadTimeoutManager().isActive()).toBe(true);

    // Call the cleanup callback
    const cleanupFn = registerCleanup.mock.calls[0][0];
    await cleanupFn();
    expect(getDownloadTimeoutManager().isActive()).toBe(false);
  });

  it('works without optional methods (no setPendingError, no registerCleanup)', () => {
    const registerHandler = vi.fn();
    // Should not throw
    registerDownloadHandlers({ registerHandler });
    expect(registerHandler).toHaveBeenCalledTimes(3);
  });
});

// ===== DownloadTimeoutManager =====

describe('DownloadTimeoutManager', () => {
  it('isActive returns false initially', () => {
    expect(getDownloadTimeoutManager().isActive()).toBe(false);
  });

  it('isActive returns true after start', () => {
    getDownloadTimeoutManager().start(6);
    expect(getDownloadTimeoutManager().isActive()).toBe(true);
  });

  it('isActive returns false after cancel', () => {
    getDownloadTimeoutManager().start(6);
    getDownloadTimeoutManager().cancel();
    expect(getDownloadTimeoutManager().isActive()).toBe(false);
  });

  it('cancel is safe to call when not active', () => {
    expect(() => getDownloadTimeoutManager().cancel()).not.toThrow();
  });

  it('start cancels a previously running timer', () => {
    getDownloadTimeoutManager().start(6);
    expect(getDownloadTimeoutManager().isActive()).toBe(true);
    // Starting again should cancel the old one and start a new one
    getDownloadTimeoutManager().start(10);
    expect(getDownloadTimeoutManager().isActive()).toBe(true);
  });

  it('fires pending error callback after timeout', async () => {
    vi.useFakeTimers();
    try {
      const pendingErrorCb = vi.fn();
      getDownloadTimeoutManager().setPendingErrorCallback(pendingErrorCb);
      // MIN_DOWNLOAD_TIMEOUT_S is 4, timeoutTagSeconds * 4 = 1 * 4 = 4
      // timeout = max(4, 4) * 1000 = 4000ms
      getDownloadTimeoutManager().start(1);

      vi.advanceTimersByTime(4000);

      expect(pendingErrorCb).toHaveBeenCalledTimes(1);
      expect(pendingErrorCb).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          errorCode: IMACROS_ERROR_CODES.DOWNLOAD_TIMEOUT,
        }),
      );
      // After firing, timer should be inactive
      expect(getDownloadTimeoutManager().isActive()).toBe(false);
    } finally {
      getDownloadTimeoutManager().setPendingErrorCallback(null);
      vi.useRealTimers();
    }
  });

  it('does not fire callback when cancelled before timeout', () => {
    vi.useFakeTimers();
    try {
      const pendingErrorCb = vi.fn();
      getDownloadTimeoutManager().setPendingErrorCallback(pendingErrorCb);
      getDownloadTimeoutManager().start(1);
      getDownloadTimeoutManager().cancel();

      vi.advanceTimersByTime(10000);
      expect(pendingErrorCb).not.toHaveBeenCalled();
    } finally {
      getDownloadTimeoutManager().setPendingErrorCallback(null);
      vi.useRealTimers();
    }
  });

  it('uses minimum timeout of 4 seconds', () => {
    vi.useFakeTimers();
    try {
      const pendingErrorCb = vi.fn();
      getDownloadTimeoutManager().setPendingErrorCallback(pendingErrorCb);
      // timeoutTagSeconds=0, so 0*4=0, max(4,0)=4 => 4000ms
      getDownloadTimeoutManager().start(0);

      vi.advanceTimersByTime(3999);
      expect(pendingErrorCb).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(pendingErrorCb).toHaveBeenCalledTimes(1);
    } finally {
      getDownloadTimeoutManager().setPendingErrorCallback(null);
      vi.useRealTimers();
    }
  });
});

// ===== notifyDownloadStarted =====

describe('notifyDownloadStarted', () => {
  it('cancels the download timeout', () => {
    getDownloadTimeoutManager().start(6);
    expect(getDownloadTimeoutManager().isActive()).toBe(true);
    notifyDownloadStarted();
    expect(getDownloadTimeoutManager().isActive()).toBe(false);
  });

  it('is safe to call when no timeout is active', () => {
    expect(() => notifyDownloadStarted()).not.toThrow();
  });
});

// ===== Exported constants =====

describe('exported constants', () => {
  it('DOWNLOAD_FOLDER_KEY has expected value', () => {
    expect(DOWNLOAD_FOLDER_KEY).toBe('!FOLDER_DOWNLOAD');
  });

  it('DOWNLOAD_FILE_KEY has expected value', () => {
    expect(DOWNLOAD_FILE_KEY).toBe('!DOWNLOAD_FILE');
  });

  it('LAST_DOWNLOAD_ID_KEY has expected value', () => {
    expect(LAST_DOWNLOAD_ID_KEY).toBe('!LAST_DOWNLOAD_ID');
  });
});
