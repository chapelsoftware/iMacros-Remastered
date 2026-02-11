/**
 * Tests for native-host/src/index.ts — message dispatch (handleMessage)
 *
 * Tests the handleMessage function which dispatches incoming messages
 * (ping, execute, save_page, save_as, save_screenshot_file, save_screenshot)
 * and the startNativeHost factory.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let _downloadPath = '';
let _screenshotPath = '';

// Mock RegistryService before importing handleMessage
vi.mock('../../native-host/src/services/registry-service', () => {
  return {
    RegistryService: class MockRegistryService {
      getDownloadPath() { return _downloadPath; }
      getScreenshotPath() { return _screenshotPath; }
    },
  };
});

// Mock the messaging module so startNativeHost doesn't touch stdin/stdout
vi.mock('../../native-host/src/messaging', () => ({
  initNativeMessaging: vi.fn().mockReturnValue({ send: vi.fn(), close: vi.fn() }),
  NativeMessagingConnection: undefined,
}));

import { handleMessage, startNativeHost } from '../../native-host/src/index';
import { initNativeMessaging } from '../../native-host/src/messaging';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imacros-index-test-'));
  _downloadPath = tmpDir;
  _screenshotPath = tmpDir;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeMsg(type: string, payload?: unknown) {
  return { type, id: 'test-1', timestamp: Date.now(), payload } as any;
}

describe('handleMessage', () => {
  // ===================================================================
  // ping
  // ===================================================================
  describe('ping', () => {
    it('should respond with pong', async () => {
      const resp = await handleMessage(makeMsg('ping'));
      expect(resp.type).toBe('pong');
      expect(resp.id).toBeDefined();
      expect(resp.timestamp).toBeDefined();
    });
  });

  // ===================================================================
  // execute
  // ===================================================================
  describe('execute', () => {
    it('should execute a valid macro and return result', async () => {
      const resp = await handleMessage(
        makeMsg('execute', { script: 'SET !VAR0 "hello"' }),
      );
      expect(resp.type).toBe('result');
      expect(resp.payload.success).toBe(true);
    });

    it('should return error when script is missing', async () => {
      const resp = await handleMessage(makeMsg('execute', {}));
      expect(resp.type).toBe('error');
      expect(resp.error).toContain('No script provided');
    });

    it('should return error when payload is undefined', async () => {
      const resp = await handleMessage(makeMsg('execute'));
      expect(resp.type).toBe('error');
      expect(resp.error).toContain('No script provided');
    });

    it('should return parse error for invalid macro syntax', async () => {
      const resp = await handleMessage(
        makeMsg('execute', { script: 'INVALID @#$ COMMAND' }),
      );
      expect(resp.type).toBe('error');
      expect(resp.error).toMatch(/[Pp]arse error|[Ll]ine|[Uu]nknown/);
    });
  });

  // ===================================================================
  // save_page
  // ===================================================================
  describe('save_page', () => {
    it('should save HTML to a file', async () => {
      const resp = await handleMessage(
        makeMsg('save_page', {
          html: '<html><body>Test</body></html>',
          url: 'https://example.com',
          title: 'Example',
        }),
      );
      expect(resp.type).toBe('result');
      expect(resp.payload.success).toBe(true);
      expect(resp.payload.path).toBeDefined();

      // Verify file was written
      const content = fs.readFileSync(resp.payload.path, 'utf-8');
      expect(content).toContain('<body>Test</body>');
    });

    it('should sanitize filename from title', async () => {
      const resp = await handleMessage(
        makeMsg('save_page', {
          html: '<html></html>',
          url: 'https://example.com',
          title: 'Hello <World> & "Friends"',
        }),
      );
      expect(resp.type).toBe('result');
      // Filename should not contain illegal characters
      const filename = path.basename(resp.payload.path);
      expect(filename).not.toMatch(/[<>"&]/);
    });

    it('should return error when html is missing', async () => {
      const resp = await handleMessage(
        makeMsg('save_page', { url: 'https://example.com' }),
      );
      expect(resp.type).toBe('error');
      expect(resp.error).toContain('No page HTML provided');
    });

    it('should return error when payload is empty', async () => {
      const resp = await handleMessage(makeMsg('save_page', {}));
      expect(resp.type).toBe('error');
    });

    it('should create download directory if it does not exist', async () => {
      const subDir = path.join(tmpDir, 'newsubdir');
      _downloadPath = subDir;

      const resp = await handleMessage(
        makeMsg('save_page', {
          html: '<html></html>',
          url: 'http://a.com',
          title: 'test',
        }),
      );
      expect(resp.type).toBe('result');
      expect(fs.existsSync(subDir)).toBe(true);
    });
  });

  // ===================================================================
  // save_as
  // ===================================================================
  describe('save_as', () => {
    it('should save content to a file', async () => {
      const filename = 'test-output.txt';
      const resp = await handleMessage(
        makeMsg('save_as', { file: filename, content: 'Hello world' }),
      );
      expect(resp.type).toBe('result');
      expect(resp.payload.success).toBe(true);

      const content = fs.readFileSync(path.join(tmpDir, filename), 'utf-8');
      expect(content).toBe('Hello world');
    });

    it('should return error when file is missing', async () => {
      const resp = await handleMessage(makeMsg('save_as', { content: 'data' }));
      expect(resp.type).toBe('error');
      expect(resp.error).toContain('No filename provided');
    });

    it('should handle EXTRACT saveType - append to existing file', async () => {
      const filename = 'extract.csv';
      const fullPath = path.join(tmpDir, filename);
      // Write initial EXTRACT line
      const resp1 = await handleMessage(
        makeMsg('save_as', {
          file: filename,
          content: 'line1',
          saveType: 'EXTRACT',
        }),
      );
      expect(resp1.type).toBe('result');

      // Append second EXTRACT line
      const resp2 = await handleMessage(
        makeMsg('save_as', {
          file: filename,
          content: 'line2',
          saveType: 'EXTRACT',
        }),
      );
      expect(resp2.type).toBe('result');

      const content = fs.readFileSync(fullPath, 'utf-8');
      // Each line should end with \r\n (iMacros 8.9.7 compat)
      expect(content).toBe('line1\r\nline2\r\n');
    });

    it('should handle EXTRACT saveType on new file', async () => {
      const filename = 'new-extract.csv';
      const resp = await handleMessage(
        makeMsg('save_as', {
          file: filename,
          content: 'data',
          saveType: 'EXTRACT',
        }),
      );
      expect(resp.type).toBe('result');
      const content = fs.readFileSync(path.join(tmpDir, filename), 'utf-8');
      expect(content).toBe('data\r\n');
    });

    it('should save with absolute path', async () => {
      const absPath = path.join(tmpDir, 'absolute.txt');
      const resp = await handleMessage(
        makeMsg('save_as', { file: absPath, content: 'abs' }),
      );
      expect(resp.type).toBe('result');
      expect(fs.readFileSync(absPath, 'utf-8')).toBe('abs');
    });

    it('should create parent directories if needed', async () => {
      const filename = path.join('sub', 'dir', 'output.txt');
      const resp = await handleMessage(
        makeMsg('save_as', { file: filename, content: 'nested' }),
      );
      expect(resp.type).toBe('result');
      const content = fs.readFileSync(path.join(tmpDir, filename), 'utf-8');
      expect(content).toBe('nested');
    });

    it('should use empty string when content is missing', async () => {
      const filename = 'empty-content.txt';
      const resp = await handleMessage(
        makeMsg('save_as', { file: filename }),
      );
      expect(resp.type).toBe('result');
      const content = fs.readFileSync(path.join(tmpDir, filename), 'utf-8');
      expect(content).toBe('');
    });
  });

  // ===================================================================
  // save_screenshot_file
  // ===================================================================
  describe('save_screenshot_file', () => {
    // A minimal 1x1 red PNG as a data URL
    const pngDataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAA0lEQVQI12P4z8BQDwAEgAF/QualzQAAAABJRU5ErkJggg==';

    it('should save a screenshot from data URL', async () => {
      const resp = await handleMessage(
        makeMsg('save_screenshot_file', {
          dataUrl: pngDataUrl,
          file: 'test.png',
        }),
      );
      expect(resp.type).toBe('result');
      expect(resp.payload.success).toBe(true);
      expect(resp.payload.path).toContain('test.png');

      // Verify file exists and has content
      const stats = fs.statSync(resp.payload.path);
      expect(stats.size).toBeGreaterThan(0);
    });

    it('should save to custom folder', async () => {
      const customDir = path.join(tmpDir, 'custom-screenshots');
      const resp = await handleMessage(
        makeMsg('save_screenshot_file', {
          dataUrl: pngDataUrl,
          folder: customDir,
          file: 'custom.png',
        }),
      );
      expect(resp.type).toBe('result');
      expect(resp.payload.path).toContain('custom-screenshots');
    });

    it('should return error when dataUrl is missing', async () => {
      const resp = await handleMessage(
        makeMsg('save_screenshot_file', { file: 'test.png' }),
      );
      expect(resp.type).toBe('error');
      expect(resp.error).toContain('No screenshot data provided');
    });

    it('should create screenshot directory if needed', async () => {
      const newDir = path.join(tmpDir, 'new-screenshot-dir');
      _screenshotPath = newDir;

      const resp = await handleMessage(
        makeMsg('save_screenshot_file', {
          dataUrl: pngDataUrl,
          file: 'created-dir.png',
        }),
      );
      expect(resp.type).toBe('result');
      expect(fs.existsSync(newDir)).toBe(true);
    });
  });

  // ===================================================================
  // save_screenshot (auto-named)
  // ===================================================================
  describe('save_screenshot', () => {
    const pngDataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAA0lEQVQI12P4z8BQDwAEgAF/QualzQAAAABJRU5ErkJggg==';

    it('should save with auto-generated filename', async () => {
      const resp = await handleMessage(
        makeMsg('save_screenshot', { dataUrl: pngDataUrl }),
      );
      expect(resp.type).toBe('result');
      expect(resp.payload.success).toBe(true);
      // Auto-generated names start with "screenshot_"
      const filename = path.basename(resp.payload.path);
      expect(filename).toMatch(/^screenshot_/);
      expect(filename).toMatch(/\.png$/);
    });

    it('should return error when dataUrl is missing', async () => {
      const resp = await handleMessage(makeMsg('save_screenshot', {}));
      expect(resp.type).toBe('error');
      expect(resp.error).toContain('No screenshot data provided');
    });
  });

  // ===================================================================
  // unknown type
  // ===================================================================
  describe('unknown message type', () => {
    it('should return error for unknown type', async () => {
      const resp = await handleMessage(makeMsg('unknown_action'));
      expect(resp.type).toBe('error');
      expect(resp.error).toContain('Unknown message type');
    });

    it('should return error for empty type', async () => {
      const resp = await handleMessage(makeMsg(''));
      expect(resp.type).toBe('error');
    });
  });
});

describe('startNativeHost', () => {
  it('should call initNativeMessaging and return a connection', () => {
    const connection = startNativeHost();
    expect(initNativeMessaging).toHaveBeenCalled();
    expect(connection).toHaveProperty('send');
    expect(connection).toHaveProperty('close');
  });
});
