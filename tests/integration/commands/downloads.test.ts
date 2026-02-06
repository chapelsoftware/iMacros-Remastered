/**
 * Download Commands Integration Tests
 *
 * Tests SAVEAS and DOWNLOAD commands that handle file downloads.
 * These tests verify download operations and file handling.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Download status
 */
type DownloadStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

/**
 * Download item representation
 */
interface DownloadItem {
  id: string;
  url: string;
  filename: string;
  path: string;
  status: DownloadStatus;
  bytesReceived: number;
  totalBytes: number;
  error?: string;
  startTime: number;
  endTime?: number;
}

/**
 * Download options
 */
interface DownloadOptions {
  filename?: string;
  directory?: string;
  overwrite?: boolean;
  timeout?: number;
}

/**
 * Mock file system for testing
 */
class MockFileSystem {
  private files: Map<string, { content: string; size: number }> = new Map();
  private directories: Set<string> = new Set(['/downloads']);

  /**
   * Check if a file exists
   */
  exists(path: string): boolean {
    return this.files.has(path);
  }

  /**
   * Check if a directory exists
   */
  directoryExists(path: string): boolean {
    return this.directories.has(path);
  }

  /**
   * Create a directory
   */
  createDirectory(path: string): void {
    this.directories.add(path);
  }

  /**
   * Write a file
   */
  writeFile(path: string, content: string): void {
    const directory = path.substring(0, path.lastIndexOf('/'));
    if (directory && !this.directoryExists(directory)) {
      throw new Error(`Directory does not exist: ${directory}`);
    }
    this.files.set(path, { content, size: content.length });
  }

  /**
   * Read a file
   */
  readFile(path: string): string {
    const file = this.files.get(path);
    if (!file) {
      throw new Error(`File not found: ${path}`);
    }
    return file.content;
  }

  /**
   * Delete a file
   */
  deleteFile(path: string): void {
    this.files.delete(path);
  }

  /**
   * Get file size
   */
  getFileSize(path: string): number {
    const file = this.files.get(path);
    return file?.size ?? 0;
  }

  /**
   * List files in a directory
   */
  listFiles(directory: string): string[] {
    return Array.from(this.files.keys())
      .filter((path) => path.startsWith(directory + '/'));
  }
}

/**
 * Mock download manager for testing
 */
class DownloadManager {
  private downloads: Map<string, DownloadItem> = new Map();
  private nextId: number = 1;
  private fileSystem: MockFileSystem;
  private defaultDirectory: string = '/downloads';

  constructor(fileSystem: MockFileSystem) {
    this.fileSystem = fileSystem;
  }

  /**
   * Start a download
   */
  download(url: string, options: DownloadOptions = {}): DownloadItem {
    const id = `download-${this.nextId++}`;
    const filename = options.filename ?? this.extractFilename(url);
    const directory = options.directory ?? this.defaultDirectory;
    const path = `${directory}/${filename}`;

    // Check if file exists and overwrite is not allowed
    if (this.fileSystem.exists(path) && !options.overwrite) {
      throw new Error(`File already exists: ${path}`);
    }

    const item: DownloadItem = {
      id,
      url,
      filename,
      path,
      status: 'pending',
      bytesReceived: 0,
      totalBytes: 0,
      startTime: Date.now(),
    };

    this.downloads.set(id, item);
    return item;
  }

  /**
   * Extract filename from URL
   */
  private extractFilename(url: string): string {
    const urlParts = url.split('/');
    const lastPart = urlParts[urlParts.length - 1];
    // Remove query string if present
    return lastPart.split('?')[0] || 'download';
  }

  /**
   * Simulate download progress
   */
  simulateProgress(id: string, bytesReceived: number, totalBytes: number): void {
    const item = this.downloads.get(id);
    if (!item) throw new Error(`Download not found: ${id}`);

    item.status = 'in_progress';
    item.bytesReceived = bytesReceived;
    item.totalBytes = totalBytes;
  }

  /**
   * Complete a download
   */
  completeDownload(id: string, content: string): void {
    const item = this.downloads.get(id);
    if (!item) throw new Error(`Download not found: ${id}`);

    item.status = 'completed';
    item.bytesReceived = content.length;
    item.totalBytes = content.length;
    item.endTime = Date.now();

    this.fileSystem.writeFile(item.path, content);
  }

  /**
   * Fail a download
   */
  failDownload(id: string, error: string): void {
    const item = this.downloads.get(id);
    if (!item) throw new Error(`Download not found: ${id}`);

    item.status = 'failed';
    item.error = error;
    item.endTime = Date.now();
  }

  /**
   * Cancel a download
   */
  cancelDownload(id: string): void {
    const item = this.downloads.get(id);
    if (!item) throw new Error(`Download not found: ${id}`);

    item.status = 'cancelled';
    item.endTime = Date.now();
  }

  /**
   * Get download by ID
   */
  getDownload(id: string): DownloadItem | undefined {
    return this.downloads.get(id);
  }

  /**
   * Get all downloads
   */
  getAllDownloads(): DownloadItem[] {
    return Array.from(this.downloads.values());
  }

  /**
   * Set default download directory
   */
  setDefaultDirectory(directory: string): void {
    if (!this.fileSystem.directoryExists(directory)) {
      this.fileSystem.createDirectory(directory);
    }
    this.defaultDirectory = directory;
  }

  /**
   * Get default download directory
   */
  getDefaultDirectory(): string {
    return this.defaultDirectory;
  }

  /**
   * Clear completed downloads from list
   */
  clearCompleted(): void {
    for (const [id, item] of this.downloads) {
      if (item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled') {
        this.downloads.delete(id);
      }
    }
  }
}

/**
 * SAVEAS command implementation for testing
 */
class SaveAsCommand {
  private downloadManager: DownloadManager;
  private fileSystem: MockFileSystem;

  constructor(downloadManager: DownloadManager, fileSystem: MockFileSystem) {
    this.downloadManager = downloadManager;
    this.fileSystem = fileSystem;
  }

  /**
   * Save page content or element content to file
   * SAVEAS TYPE=HTM|TXT|PNG|PDF FOLDER=* FILE=*
   */
  execute(
    type: 'HTM' | 'TXT' | 'PNG' | 'PDF',
    content: string,
    filename: string,
    folder?: string
  ): { success: boolean; path: string } {
    const extension = type.toLowerCase();
    const finalFilename = filename.endsWith(`.${extension}`)
      ? filename
      : `${filename}.${extension}`;

    const directory = folder ?? this.downloadManager.getDefaultDirectory();
    const path = `${directory}/${finalFilename}`;

    // Ensure directory exists
    if (!this.fileSystem.directoryExists(directory)) {
      this.fileSystem.createDirectory(directory);
    }

    // Save the content
    this.fileSystem.writeFile(path, content);

    return { success: true, path };
  }

  /**
   * Save with automatic filename based on timestamp
   */
  executeWithTimestamp(
    type: 'HTM' | 'TXT' | 'PNG' | 'PDF',
    content: string,
    prefix: string = 'save'
  ): { success: boolean; path: string } {
    const timestamp = Date.now();
    const filename = `${prefix}_${timestamp}`;
    return this.execute(type, content, filename);
  }
}

/**
 * DOWNLOAD command implementation for testing
 */
class DownloadCommand {
  private downloadManager: DownloadManager;

  constructor(downloadManager: DownloadManager) {
    this.downloadManager = downloadManager;
  }

  /**
   * Download a file from URL
   * DOWNLOAD URL=<url> FILE=<filename> FOLDER=<folder>
   */
  execute(url: string, filename?: string, folder?: string): DownloadItem {
    const options: DownloadOptions = {
      filename,
      directory: folder,
    };

    return this.downloadManager.download(url, options);
  }

  /**
   * Wait for download to complete
   */
  async waitForCompletion(id: string, timeout: number = 30000): Promise<DownloadItem> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkStatus = () => {
        const item = this.downloadManager.getDownload(id);
        if (!item) {
          reject(new Error(`Download not found: ${id}`));
          return;
        }

        if (item.status === 'completed') {
          resolve(item);
          return;
        }

        if (item.status === 'failed') {
          reject(new Error(`Download failed: ${item.error}`));
          return;
        }

        if (item.status === 'cancelled') {
          reject(new Error('Download was cancelled'));
          return;
        }

        if (Date.now() - startTime > timeout) {
          reject(new Error('Download timeout'));
          return;
        }

        // Check again after a short delay
        setTimeout(checkStatus, 100);
      };

      checkStatus();
    });
  }
}

describe('Download Commands Integration Tests', () => {
  describe('MockFileSystem', () => {
    let fs: MockFileSystem;

    beforeEach(() => {
      fs = new MockFileSystem();
    });

    it('should create and check directories', () => {
      expect(fs.directoryExists('/downloads')).toBe(true);
      expect(fs.directoryExists('/custom')).toBe(false);

      fs.createDirectory('/custom');
      expect(fs.directoryExists('/custom')).toBe(true);
    });

    it('should write and read files', () => {
      fs.writeFile('/downloads/test.txt', 'Hello World');

      expect(fs.exists('/downloads/test.txt')).toBe(true);
      expect(fs.readFile('/downloads/test.txt')).toBe('Hello World');
    });

    it('should throw error for non-existent directory', () => {
      expect(() => fs.writeFile('/nonexistent/file.txt', 'content'))
        .toThrow('Directory does not exist');
    });

    it('should throw error for non-existent file', () => {
      expect(() => fs.readFile('/downloads/missing.txt'))
        .toThrow('File not found');
    });

    it('should delete files', () => {
      fs.writeFile('/downloads/test.txt', 'content');
      expect(fs.exists('/downloads/test.txt')).toBe(true);

      fs.deleteFile('/downloads/test.txt');
      expect(fs.exists('/downloads/test.txt')).toBe(false);
    });

    it('should get file size', () => {
      fs.writeFile('/downloads/test.txt', 'Hello');

      expect(fs.getFileSize('/downloads/test.txt')).toBe(5);
    });

    it('should list files in directory', () => {
      fs.writeFile('/downloads/file1.txt', 'a');
      fs.writeFile('/downloads/file2.txt', 'b');

      const files = fs.listFiles('/downloads');
      expect(files).toContain('/downloads/file1.txt');
      expect(files).toContain('/downloads/file2.txt');
    });
  });

  describe('DownloadManager', () => {
    let fs: MockFileSystem;
    let dm: DownloadManager;

    beforeEach(() => {
      fs = new MockFileSystem();
      dm = new DownloadManager(fs);
    });

    it('should start a download', () => {
      const item = dm.download('https://example.com/file.pdf');

      expect(item.id).toBeDefined();
      expect(item.url).toBe('https://example.com/file.pdf');
      expect(item.filename).toBe('file.pdf');
      expect(item.status).toBe('pending');
    });

    it('should extract filename from URL', () => {
      const item = dm.download('https://example.com/path/to/document.pdf');

      expect(item.filename).toBe('document.pdf');
    });

    it('should handle URL with query string', () => {
      const item = dm.download('https://example.com/file.pdf?token=abc123');

      expect(item.filename).toBe('file.pdf');
    });

    it('should use custom filename', () => {
      const item = dm.download('https://example.com/file.pdf', {
        filename: 'custom_name.pdf',
      });

      expect(item.filename).toBe('custom_name.pdf');
    });

    it('should use custom directory', () => {
      fs.createDirectory('/custom');
      const item = dm.download('https://example.com/file.pdf', {
        directory: '/custom',
      });

      expect(item.path).toBe('/custom/file.pdf');
    });

    it('should throw error for existing file without overwrite', () => {
      fs.writeFile('/downloads/file.pdf', 'existing');

      expect(() => dm.download('https://example.com/file.pdf'))
        .toThrow('File already exists');
    });

    it('should allow overwrite when enabled', () => {
      fs.writeFile('/downloads/file.pdf', 'existing');

      const item = dm.download('https://example.com/file.pdf', {
        overwrite: true,
      });

      expect(item.id).toBeDefined();
    });

    it('should simulate download progress', () => {
      const item = dm.download('https://example.com/file.pdf');

      dm.simulateProgress(item.id, 5000, 10000);

      const updated = dm.getDownload(item.id);
      expect(updated?.status).toBe('in_progress');
      expect(updated?.bytesReceived).toBe(5000);
      expect(updated?.totalBytes).toBe(10000);
    });

    it('should complete download and save file', () => {
      const item = dm.download('https://example.com/file.txt');

      dm.completeDownload(item.id, 'File content');

      const completed = dm.getDownload(item.id);
      expect(completed?.status).toBe('completed');
      expect(completed?.endTime).toBeDefined();
      expect(fs.exists('/downloads/file.txt')).toBe(true);
      expect(fs.readFile('/downloads/file.txt')).toBe('File content');
    });

    it('should fail download with error', () => {
      const item = dm.download('https://example.com/file.pdf');

      dm.failDownload(item.id, 'Network error');

      const failed = dm.getDownload(item.id);
      expect(failed?.status).toBe('failed');
      expect(failed?.error).toBe('Network error');
    });

    it('should cancel download', () => {
      const item = dm.download('https://example.com/file.pdf');

      dm.cancelDownload(item.id);

      const cancelled = dm.getDownload(item.id);
      expect(cancelled?.status).toBe('cancelled');
    });

    it('should list all downloads', () => {
      dm.download('https://example.com/file1.pdf');
      dm.download('https://example.com/file2.pdf');
      dm.download('https://example.com/file3.pdf');

      expect(dm.getAllDownloads()).toHaveLength(3);
    });

    it('should clear completed downloads', () => {
      const item1 = dm.download('https://example.com/file1.pdf');
      const item2 = dm.download('https://example.com/file2.pdf');
      const item3 = dm.download('https://example.com/file3.pdf');

      dm.completeDownload(item1.id, 'content');
      dm.failDownload(item2.id, 'error');
      // item3 remains pending

      dm.clearCompleted();

      expect(dm.getAllDownloads()).toHaveLength(1);
      expect(dm.getDownload(item3.id)).toBeDefined();
    });

    it('should change default directory', () => {
      dm.setDefaultDirectory('/custom');

      expect(dm.getDefaultDirectory()).toBe('/custom');
      expect(fs.directoryExists('/custom')).toBe(true);

      const item = dm.download('https://example.com/file.pdf');
      expect(item.path).toBe('/custom/file.pdf');
    });
  });

  describe('SAVEAS Command', () => {
    let fs: MockFileSystem;
    let dm: DownloadManager;
    let saveAsCommand: SaveAsCommand;

    beforeEach(() => {
      fs = new MockFileSystem();
      dm = new DownloadManager(fs);
      saveAsCommand = new SaveAsCommand(dm, fs);
    });

    it('should save HTML content', () => {
      const result = saveAsCommand.execute('HTM', '<html><body>Test</body></html>', 'page');

      expect(result.success).toBe(true);
      expect(result.path).toBe('/downloads/page.htm');
      expect(fs.exists('/downloads/page.htm')).toBe(true);
    });

    it('should save text content', () => {
      const result = saveAsCommand.execute('TXT', 'Plain text content', 'document');

      expect(result.success).toBe(true);
      expect(result.path).toBe('/downloads/document.txt');
    });

    it('should not duplicate extension', () => {
      const result = saveAsCommand.execute('TXT', 'content', 'file.txt');

      expect(result.path).toBe('/downloads/file.txt');
    });

    it('should save to custom folder', () => {
      fs.createDirectory('/output');
      const result = saveAsCommand.execute('TXT', 'content', 'file', '/output');

      expect(result.path).toBe('/output/file.txt');
    });

    it('should create directory if not exists', () => {
      const result = saveAsCommand.execute('TXT', 'content', 'file', '/newfolder');

      expect(result.success).toBe(true);
      expect(fs.directoryExists('/newfolder')).toBe(true);
    });

    it('should save with timestamp', () => {
      const result = saveAsCommand.executeWithTimestamp('TXT', 'content', 'save');

      expect(result.success).toBe(true);
      expect(result.path).toMatch(/\/downloads\/save_\d+\.txt/);
    });

    it('should save PNG placeholder', () => {
      const result = saveAsCommand.execute('PNG', 'base64-image-data', 'screenshot');

      expect(result.success).toBe(true);
      expect(result.path).toBe('/downloads/screenshot.png');
    });

    it('should save PDF placeholder', () => {
      const result = saveAsCommand.execute('PDF', 'pdf-content', 'document');

      expect(result.success).toBe(true);
      expect(result.path).toBe('/downloads/document.pdf');
    });
  });

  describe('DOWNLOAD Command', () => {
    let fs: MockFileSystem;
    let dm: DownloadManager;
    let downloadCommand: DownloadCommand;

    beforeEach(() => {
      fs = new MockFileSystem();
      dm = new DownloadManager(fs);
      downloadCommand = new DownloadCommand(dm);
    });

    it('should execute download', () => {
      const item = downloadCommand.execute('https://example.com/file.pdf');

      expect(item.id).toBeDefined();
      expect(item.status).toBe('pending');
    });

    it('should execute download with custom filename', () => {
      const item = downloadCommand.execute(
        'https://example.com/file.pdf',
        'custom.pdf'
      );

      expect(item.filename).toBe('custom.pdf');
    });

    it('should execute download with custom folder', () => {
      fs.createDirectory('/custom');
      const item = downloadCommand.execute(
        'https://example.com/file.pdf',
        undefined,
        '/custom'
      );

      expect(item.path).toBe('/custom/file.pdf');
    });

    it('should wait for download completion', async () => {
      const item = downloadCommand.execute('https://example.com/file.txt');

      // Simulate async download completion
      setTimeout(() => {
        dm.completeDownload(item.id, 'Downloaded content');
      }, 50);

      const completed = await downloadCommand.waitForCompletion(item.id, 1000);

      expect(completed.status).toBe('completed');
    });

    it('should reject on download failure', async () => {
      const item = downloadCommand.execute('https://example.com/file.pdf');

      setTimeout(() => {
        dm.failDownload(item.id, 'Network error');
      }, 50);

      await expect(downloadCommand.waitForCompletion(item.id, 1000))
        .rejects.toThrow('Download failed: Network error');
    });

    it('should reject on download cancellation', async () => {
      const item = downloadCommand.execute('https://example.com/file.pdf');

      setTimeout(() => {
        dm.cancelDownload(item.id);
      }, 50);

      await expect(downloadCommand.waitForCompletion(item.id, 1000))
        .rejects.toThrow('Download was cancelled');
    });

    it('should timeout if download takes too long', async () => {
      const item = downloadCommand.execute('https://example.com/file.pdf');

      // Don't complete the download
      await expect(downloadCommand.waitForCompletion(item.id, 100))
        .rejects.toThrow('Download timeout');
    });
  });

  describe('Download Workflow Integration', () => {
    let fs: MockFileSystem;
    let dm: DownloadManager;
    let downloadCommand: DownloadCommand;
    let saveAsCommand: SaveAsCommand;

    beforeEach(() => {
      fs = new MockFileSystem();
      dm = new DownloadManager(fs);
      downloadCommand = new DownloadCommand(dm);
      saveAsCommand = new SaveAsCommand(dm, fs);
    });

    it('should download and verify file', async () => {
      const item = downloadCommand.execute('https://example.com/data.json');

      // Simulate download
      dm.simulateProgress(item.id, 50, 100);
      dm.completeDownload(item.id, '{"data": "test"}');

      const completed = await downloadCommand.waitForCompletion(item.id);

      expect(completed.status).toBe('completed');
      expect(fs.exists('/downloads/data.json')).toBe(true);
      expect(fs.readFile('/downloads/data.json')).toBe('{"data": "test"}');
    });

    it('should save page and download resources', async () => {
      // Save HTML page
      saveAsCommand.execute('HTM', '<html><img src="image.png"></html>', 'page');

      // Download image
      const imgItem = downloadCommand.execute('https://example.com/image.png');
      dm.completeDownload(imgItem.id, 'image-binary-data');

      expect(fs.exists('/downloads/page.htm')).toBe(true);
      expect(fs.exists('/downloads/image.png')).toBe(true);
    });

    it('should handle multiple concurrent downloads', async () => {
      const items = [
        downloadCommand.execute('https://example.com/file1.txt'),
        downloadCommand.execute('https://example.com/file2.txt'),
        downloadCommand.execute('https://example.com/file3.txt'),
      ];

      // Complete all downloads
      items.forEach((item, index) => {
        dm.completeDownload(item.id, `Content ${index + 1}`);
      });

      // Verify all files
      for (let i = 1; i <= 3; i++) {
        expect(fs.exists(`/downloads/file${i}.txt`)).toBe(true);
        expect(fs.readFile(`/downloads/file${i}.txt`)).toBe(`Content ${i}`);
      }
    });

    it('should organize downloads in folders', () => {
      fs.createDirectory('/downloads/images');
      fs.createDirectory('/downloads/documents');

      downloadCommand.execute('https://example.com/photo.jpg', undefined, '/downloads/images');
      downloadCommand.execute('https://example.com/report.pdf', undefined, '/downloads/documents');

      const item1 = dm.getAllDownloads()[0];
      const item2 = dm.getAllDownloads()[1];

      expect(item1.path).toBe('/downloads/images/photo.jpg');
      expect(item2.path).toBe('/downloads/documents/report.pdf');
    });
  });
});
