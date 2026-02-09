/**
 * Tests for File Service
 * native-host/src/services/file-service.ts
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as iconv from 'iconv-lite';

import {
  detectEncoding,
  readFile,
  readFileSync,
  writeFile,
  writeFileSync,
  readdir,
  readdirSync,
  unlink,
  unlinkSync,
  mkdir,
  mkdirSync,
  exists,
  existsSync,
  stat,
  statSync,
  FileService,
} from '../../native-host/src/services/file-service';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imacros-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('File Service', () => {
  // =========================================================================
  // 1. detectEncoding
  // =========================================================================
  describe('detectEncoding', () => {
    it('should detect UTF-8 BOM', () => {
      const buffer = Buffer.from([0xef, 0xbb, 0xbf, 0x48, 0x65, 0x6c, 0x6c, 0x6f]);
      expect(detectEncoding(buffer)).toBe('utf-8');
    });

    it('should detect UTF-16LE BOM', () => {
      const buffer = Buffer.from([0xff, 0xfe, 0x48, 0x00, 0x65, 0x00]);
      expect(detectEncoding(buffer)).toBe('utf-16le');
    });

    it('should detect UTF-16BE BOM', () => {
      const buffer = Buffer.from([0xfe, 0xff, 0x00, 0x48, 0x00, 0x65]);
      expect(detectEncoding(buffer)).toBe('utf-16be');
    });

    it('should detect UTF-16LE by alternating null byte pattern (no BOM)', () => {
      // "Hi" in UTF-16LE without BOM: 48 00 69 00
      const buffer = Buffer.from([0x48, 0x00, 0x69, 0x00]);
      expect(detectEncoding(buffer)).toBe('utf-16le');
    });

    it('should detect UTF-16BE by alternating null byte pattern (no BOM)', () => {
      // "Hi" in UTF-16BE without BOM: 00 48 00 69
      const buffer = Buffer.from([0x00, 0x48, 0x00, 0x69]);
      expect(detectEncoding(buffer)).toBe('utf-16be');
    });

    it('should detect valid UTF-8 content without BOM', () => {
      const buffer = Buffer.from('Hello, World!', 'utf-8');
      expect(detectEncoding(buffer)).toBe('utf-8');
    });

    it('should detect valid UTF-8 with multi-byte characters', () => {
      const buffer = Buffer.from('Hallo Welt \u00e4\u00f6\u00fc', 'utf-8');
      expect(detectEncoding(buffer)).toBe('utf-8');
    });

    it('should return cp1252 for non-UTF-8 bytes', () => {
      // Invalid UTF-8 sequences: isolated continuation bytes
      const buffer = Buffer.from([0x80, 0x81, 0x82, 0x83, 0x84, 0x85]);
      expect(detectEncoding(buffer)).toBe('cp1252');
    });

    it('should handle empty buffer as valid UTF-8', () => {
      const buffer = Buffer.alloc(0);
      // Empty buffer: isValidUtf8 returns true since the while loop body never runs
      expect(detectEncoding(buffer)).toBe('utf-8');
    });

    it('should handle single-byte buffer', () => {
      const buffer = Buffer.from([0x41]); // 'A'
      expect(detectEncoding(buffer)).toBe('utf-8');
    });
  });

  // =========================================================================
  // 2. readFile / readFileSync
  // =========================================================================
  describe('readFile (async)', () => {
    it('should read UTF-8 content', async () => {
      const filePath = path.join(tmpDir, 'utf8.txt');
      fs.writeFileSync(filePath, 'Hello, World!', 'utf-8');

      const result = await readFile(filePath);
      expect(result.content).toBe('Hello, World!');
      expect(result.detectedEncoding).toBe('utf-8');
      expect(result.byteLength).toBeGreaterThan(0);
    });

    it('should strip UTF-8 BOM', async () => {
      const filePath = path.join(tmpDir, 'bom.txt');
      const bom = Buffer.from([0xef, 0xbb, 0xbf]);
      const content = Buffer.from('BOM content', 'utf-8');
      fs.writeFileSync(filePath, Buffer.concat([bom, content]));

      const result = await readFile(filePath);
      expect(result.content).toBe('BOM content');
      expect(result.detectedEncoding).toBe('utf-8');
    });

    it('should strip UTF-16LE BOM', async () => {
      const filePath = path.join(tmpDir, 'utf16le-bom.txt');
      const bom = Buffer.from([0xff, 0xfe]);
      const content = iconv.encode('Hello', 'utf-16le');
      fs.writeFileSync(filePath, Buffer.concat([bom, content]));

      const result = await readFile(filePath);
      expect(result.content).toBe('Hello');
      expect(result.detectedEncoding).toBe('utf-16le');
    });

    it('should read latin-1 content written with iconv', async () => {
      const filePath = path.join(tmpDir, 'latin1.txt');
      // Write cp1252-encoded bytes that are NOT valid UTF-8
      // Use bytes 0x80-0x9F which are invalid in UTF-8 continuation-only range
      const encoded = iconv.encode('\u201c\u201d\u2018\u2019', 'cp1252');
      fs.writeFileSync(filePath, encoded);

      const result = await readFile(filePath);
      expect(result.detectedEncoding).toBe('cp1252');
      expect(result.content).toBe('\u201c\u201d\u2018\u2019');
    });

    it('should use specified encoding override', async () => {
      const filePath = path.join(tmpDir, 'override.txt');
      fs.writeFileSync(filePath, 'test data', 'utf-8');

      const result = await readFile(filePath, { encoding: 'ascii' });
      expect(result.content).toBe('test data');
      // When encoding is specified, detectedEncoding should be null
      expect(result.detectedEncoding).toBeNull();
    });

    it('should return correct byteLength', async () => {
      const filePath = path.join(tmpDir, 'bytes.txt');
      const text = 'Hello';
      fs.writeFileSync(filePath, text, 'utf-8');

      const result = await readFile(filePath);
      expect(result.byteLength).toBe(5);
    });
  });

  describe('readFileSync', () => {
    it('should read UTF-8 content synchronously', () => {
      const filePath = path.join(tmpDir, 'sync-utf8.txt');
      fs.writeFileSync(filePath, 'Sync content', 'utf-8');

      const result = readFileSync(filePath);
      expect(result.content).toBe('Sync content');
      expect(result.detectedEncoding).toBe('utf-8');
    });

    it('should strip BOM synchronously', () => {
      const filePath = path.join(tmpDir, 'sync-bom.txt');
      const bom = Buffer.from([0xef, 0xbb, 0xbf]);
      const content = Buffer.from('Sync BOM', 'utf-8');
      fs.writeFileSync(filePath, Buffer.concat([bom, content]));

      const result = readFileSync(filePath);
      expect(result.content).toBe('Sync BOM');
    });

    it('should accept encoding override synchronously', () => {
      const filePath = path.join(tmpDir, 'sync-enc.txt');
      fs.writeFileSync(filePath, 'test', 'utf-8');

      const result = readFileSync(filePath, { encoding: 'iso-8859-1' });
      expect(result.content).toBe('test');
      expect(result.detectedEncoding).toBeNull();
    });
  });

  // =========================================================================
  // 3. writeFile / writeFileSync
  // =========================================================================
  describe('writeFile (async)', () => {
    it('should create a new file', async () => {
      const filePath = path.join(tmpDir, 'new.txt');
      await writeFile(filePath, 'New content');

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toBe('New content');
    });

    it('should overwrite an existing file', async () => {
      const filePath = path.join(tmpDir, 'overwrite.txt');
      fs.writeFileSync(filePath, 'Original');

      await writeFile(filePath, 'Replaced');
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toBe('Replaced');
    });

    it('should append to a file', async () => {
      const filePath = path.join(tmpDir, 'append.txt');
      fs.writeFileSync(filePath, 'First', 'utf-8');

      await writeFile(filePath, 'Second', { append: true });
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toBe('FirstSecond');
    });

    it('should write with UTF-8 BOM', async () => {
      const filePath = path.join(tmpDir, 'write-bom.txt');
      await writeFile(filePath, 'BOM file', { writeBom: true });

      const raw = fs.readFileSync(filePath);
      expect(raw[0]).toBe(0xef);
      expect(raw[1]).toBe(0xbb);
      expect(raw[2]).toBe(0xbf);
    });

    it('should write UTF-16LE with BOM', async () => {
      const filePath = path.join(tmpDir, 'utf16le-write.txt');
      await writeFile(filePath, 'Hi', { encoding: 'utf-16le', writeBom: true });

      const raw = fs.readFileSync(filePath);
      // UTF-16LE BOM: FF FE
      expect(raw[0]).toBe(0xff);
      expect(raw[1]).toBe(0xfe);
    });

    it('should not write BOM in append mode', async () => {
      const filePath = path.join(tmpDir, 'no-bom-append.txt');
      fs.writeFileSync(filePath, '', 'utf-8');

      await writeFile(filePath, 'data', { writeBom: true, append: true });
      const raw = fs.readFileSync(filePath);
      // BOM should NOT be present in append mode
      expect(raw[0]).not.toBe(0xef);
    });
  });

  describe('writeFileSync', () => {
    it('should create a new file synchronously', () => {
      const filePath = path.join(tmpDir, 'sync-new.txt');
      writeFileSync(filePath, 'Sync content');

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toBe('Sync content');
    });

    it('should overwrite synchronously', () => {
      const filePath = path.join(tmpDir, 'sync-overwrite.txt');
      fs.writeFileSync(filePath, 'Old');

      writeFileSync(filePath, 'New');
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('New');
    });

    it('should append synchronously', () => {
      const filePath = path.join(tmpDir, 'sync-append.txt');
      fs.writeFileSync(filePath, 'A', 'utf-8');

      writeFileSync(filePath, 'B', { append: true });
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('AB');
    });

    it('should write BOM synchronously', () => {
      const filePath = path.join(tmpDir, 'sync-bom-write.txt');
      writeFileSync(filePath, 'test', { writeBom: true });

      const raw = fs.readFileSync(filePath);
      expect(raw[0]).toBe(0xef);
      expect(raw[1]).toBe(0xbb);
      expect(raw[2]).toBe(0xbf);
    });
  });

  // =========================================================================
  // 4. readdir / readdirSync
  // =========================================================================
  describe('readdir (async)', () => {
    beforeEach(() => {
      // Set up a directory structure:
      // tmpDir/
      //   file1.txt
      //   file2.log
      //   subdir/
      //     nested.txt
      fs.writeFileSync(path.join(tmpDir, 'file1.txt'), 'content1');
      fs.writeFileSync(path.join(tmpDir, 'file2.log'), 'content2');
      fs.mkdirSync(path.join(tmpDir, 'subdir'));
      fs.writeFileSync(path.join(tmpDir, 'subdir', 'nested.txt'), 'nested');
    });

    it('should list flat directory contents', async () => {
      const entries = await readdir(tmpDir);
      const names = entries.map(e => e.name).sort();
      expect(names).toEqual(['file1.txt', 'file2.log', 'subdir']);
    });

    it('should list recursively', async () => {
      const entries = await readdir(tmpDir, { recursive: true });
      const names = entries.map(e => e.name).sort();
      expect(names).toContain('nested.txt');
      expect(names).toContain('file1.txt');
      expect(names).toContain('subdir');
    });

    it('should filter by regex', async () => {
      const entries = await readdir(tmpDir, { filter: /\.txt$/ });
      const names = entries.map(e => e.name).sort();
      expect(names).toEqual(['file1.txt']);
      expect(names).not.toContain('file2.log');
    });

    it('should filter by string pattern', async () => {
      const entries = await readdir(tmpDir, { filter: '\\.log$' });
      const names = entries.map(e => e.name);
      expect(names).toEqual(['file2.log']);
    });

    it('should include only files when includeDirectories is false', async () => {
      const entries = await readdir(tmpDir, { includeDirectories: false });
      expect(entries.every(e => e.isFile)).toBe(true);
      expect(entries.map(e => e.name).sort()).toEqual(['file1.txt', 'file2.log']);
    });

    it('should include only directories when includeFiles is false', async () => {
      const entries = await readdir(tmpDir, { includeFiles: false });
      expect(entries.every(e => e.isDirectory)).toBe(true);
      expect(entries.map(e => e.name)).toEqual(['subdir']);
    });

    it('should return DirEntry objects with correct shape', async () => {
      const entries = await readdir(tmpDir, { includeDirectories: false });
      const file = entries.find(e => e.name === 'file1.txt');
      expect(file).toBeDefined();
      expect(file!.path).toBe(path.join(tmpDir, 'file1.txt'));
      expect(file!.isFile).toBe(true);
      expect(file!.isDirectory).toBe(false);
      expect(file!.size).toBeGreaterThan(0);
      expect(file!.mtime).toBeInstanceOf(Date);
    });

    it('should recurse into non-matching directories when filter is set', async () => {
      const entries = await readdir(tmpDir, { recursive: true, filter: /\.txt$/ });
      const names = entries.map(e => e.name).sort();
      expect(names).toContain('nested.txt');
      expect(names).toContain('file1.txt');
    });
  });

  describe('readdirSync', () => {
    beforeEach(() => {
      fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'a');
      fs.mkdirSync(path.join(tmpDir, 'dir'));
      fs.writeFileSync(path.join(tmpDir, 'dir', 'b.txt'), 'b');
    });

    it('should list flat directory synchronously', () => {
      const entries = readdirSync(tmpDir);
      const names = entries.map(e => e.name).sort();
      expect(names).toEqual(['a.txt', 'dir']);
    });

    it('should list recursively synchronously', () => {
      const entries = readdirSync(tmpDir, { recursive: true });
      const names = entries.map(e => e.name).sort();
      expect(names).toContain('b.txt');
    });
  });

  // =========================================================================
  // 5. unlink / unlinkSync
  // =========================================================================
  describe('unlink (async)', () => {
    it('should delete a file', async () => {
      const filePath = path.join(tmpDir, 'to-delete.txt');
      fs.writeFileSync(filePath, 'delete me');

      await unlink(filePath);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('should delete an empty directory', async () => {
      const dirPath = path.join(tmpDir, 'to-delete-dir');
      fs.mkdirSync(dirPath);

      await unlink(dirPath);
      expect(fs.existsSync(dirPath)).toBe(false);
    });

    it('should throw for non-empty directory (non-recursive)', async () => {
      const dirPath = path.join(tmpDir, 'nonempty-dir');
      fs.mkdirSync(dirPath);
      fs.writeFileSync(path.join(dirPath, 'inner.txt'), 'inner');

      await expect(unlink(dirPath)).rejects.toThrow();
      expect(fs.existsSync(dirPath)).toBe(true);
    });

    it('should throw for nonexistent path', async () => {
      await expect(unlink(path.join(tmpDir, 'nonexistent'))).rejects.toThrow();
    });
  });

  describe('unlinkSync', () => {
    it('should delete a file synchronously', () => {
      const filePath = path.join(tmpDir, 'sync-del.txt');
      fs.writeFileSync(filePath, 'x');

      unlinkSync(filePath);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('should delete an empty directory synchronously', () => {
      const dirPath = path.join(tmpDir, 'sync-del-dir');
      fs.mkdirSync(dirPath);

      unlinkSync(dirPath);
      expect(fs.existsSync(dirPath)).toBe(false);
    });

    it('should throw for non-empty directory synchronously (non-recursive)', () => {
      const dirPath = path.join(tmpDir, 'sync-nonempty-dir');
      fs.mkdirSync(dirPath);
      fs.writeFileSync(path.join(dirPath, 'f.txt'), 'y');

      expect(() => unlinkSync(dirPath)).toThrow();
      expect(fs.existsSync(dirPath)).toBe(true);
    });

    it('should throw for nonexistent path synchronously', () => {
      expect(() => unlinkSync(path.join(tmpDir, 'nope'))).toThrow();
    });
  });

  // =========================================================================
  // 6. mkdir / mkdirSync
  // =========================================================================
  describe('mkdir (async)', () => {
    it('should create nested directories', async () => {
      const dirPath = path.join(tmpDir, 'a', 'b', 'c');
      await mkdir(dirPath);
      expect(fs.existsSync(dirPath)).toBe(true);
    });

    it('should not error if directory already exists (recursive)', async () => {
      const dirPath = path.join(tmpDir, 'existing');
      fs.mkdirSync(dirPath);

      // Should not throw
      await mkdir(dirPath);
      expect(fs.existsSync(dirPath)).toBe(true);
    });
  });

  describe('mkdirSync', () => {
    it('should create nested directories synchronously', () => {
      const dirPath = path.join(tmpDir, 'x', 'y', 'z');
      mkdirSync(dirPath);
      expect(fs.existsSync(dirPath)).toBe(true);
    });

    it('should not error if directory already exists synchronously', () => {
      const dirPath = path.join(tmpDir, 'alreadyhere');
      fs.mkdirSync(dirPath);

      expect(() => mkdirSync(dirPath)).not.toThrow();
    });
  });

  // =========================================================================
  // 7. exists / existsSync
  // =========================================================================
  describe('exists (async)', () => {
    it('should return true for an existing file', async () => {
      const filePath = path.join(tmpDir, 'exists.txt');
      fs.writeFileSync(filePath, 'exists');

      expect(await exists(filePath)).toBe(true);
    });

    it('should return false for a nonexistent path', async () => {
      expect(await exists(path.join(tmpDir, 'nope.txt'))).toBe(false);
    });

    it('should return true for an existing directory', async () => {
      expect(await exists(tmpDir)).toBe(true);
    });
  });

  describe('existsSync', () => {
    it('should return true for existing file', () => {
      const filePath = path.join(tmpDir, 'ex.txt');
      fs.writeFileSync(filePath, '');
      expect(existsSync(filePath)).toBe(true);
    });

    it('should return false for nonexistent', () => {
      expect(existsSync(path.join(tmpDir, 'missing'))).toBe(false);
    });
  });

  // =========================================================================
  // 8. stat / statSync
  // =========================================================================
  describe('stat (async)', () => {
    it('should return stats for a file', async () => {
      const filePath = path.join(tmpDir, 'stat.txt');
      fs.writeFileSync(filePath, 'stat data');

      const result = await stat(filePath);
      expect(result.isFile()).toBe(true);
      expect(result.isDirectory()).toBe(false);
      expect(result.size).toBe(9); // "stat data"
    });

    it('should return stats for a directory', async () => {
      const result = await stat(tmpDir);
      expect(result.isDirectory()).toBe(true);
      expect(result.isFile()).toBe(false);
    });
  });

  describe('statSync', () => {
    it('should return stats for a file synchronously', () => {
      const filePath = path.join(tmpDir, 'statSync.txt');
      fs.writeFileSync(filePath, '12345');

      const result = statSync(filePath);
      expect(result.isFile()).toBe(true);
      expect(result.size).toBe(5);
    });

    it('should return stats for a directory synchronously', () => {
      const result = statSync(tmpDir);
      expect(result.isDirectory()).toBe(true);
    });
  });

  // =========================================================================
  // 9. FileService class
  // =========================================================================
  describe('FileService class', () => {
    it('should expose readFile as a static method', () => {
      expect(FileService.readFile).toBe(readFile);
    });

    it('should expose readFileSync as a static method', () => {
      expect(FileService.readFileSync).toBe(readFileSync);
    });

    it('should expose writeFile as a static method', () => {
      expect(FileService.writeFile).toBe(writeFile);
    });

    it('should expose writeFileSync as a static method', () => {
      expect(FileService.writeFileSync).toBe(writeFileSync);
    });

    it('should expose readdir as a static method', () => {
      expect(FileService.readdir).toBe(readdir);
    });

    it('should expose readdirSync as a static method', () => {
      expect(FileService.readdirSync).toBe(readdirSync);
    });

    it('should expose unlink as a static method', () => {
      expect(FileService.unlink).toBe(unlink);
    });

    it('should expose unlinkSync as a static method', () => {
      expect(FileService.unlinkSync).toBe(unlinkSync);
    });

    it('should expose mkdir and mkdirSync as static methods', () => {
      expect(FileService.mkdir).toBe(mkdir);
      expect(FileService.mkdirSync).toBe(mkdirSync);
    });

    it('should expose exists and existsSync as static methods', () => {
      expect(FileService.exists).toBe(exists);
      expect(FileService.existsSync).toBe(existsSync);
    });

    it('should expose stat and statSync as static methods', () => {
      expect(FileService.stat).toBe(stat);
      expect(FileService.statSync).toBe(statSync);
    });

    it('should expose detectEncoding as a static method', () => {
      expect(FileService.detectEncoding).toBe(detectEncoding);
    });
  });
});
