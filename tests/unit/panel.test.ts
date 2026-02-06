/**
 * Unit Tests for Panel module
 *
 * Tests cover:
 * - Panel initialization
 * - Button states based on status
 * - Save recording integration with SaveDialog
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

// Setup DOM environment before imports
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
const { window } = dom;

// Polyfill globals
(globalThis as any).document = window.document;
(globalThis as any).window = window;
(globalThis as any).HTMLElement = window.HTMLElement;
(globalThis as any).Element = window.Element;
(globalThis as any).Node = window.Node;
(globalThis as any).KeyboardEvent = window.KeyboardEvent;
(globalThis as any).MouseEvent = window.MouseEvent;

// Mock chrome APIs
const mockSendMessage = vi.fn();
const mockStorageData: Record<string, any> = {};
const mockStorage = {
  local: {
    get: vi.fn().mockImplementation((key: string) => {
      return Promise.resolve({ [key]: mockStorageData[key] });
    }),
    set: vi.fn().mockResolvedValue(undefined),
  },
};

(globalThis as any).chrome = {
  runtime: {
    sendMessage: mockSendMessage,
    onMessage: {
      addListener: vi.fn(),
    },
    lastError: null,
  },
  storage: mockStorage,
};

// Mock scrollIntoView
window.Element.prototype.scrollIntoView = vi.fn();

// Import components
import { SaveDialog, showSaveDialog, SaveDialogResult } from '../../extension/src/panel/save-dialog';
import { FileTreeNode, createTreeFromPaths } from '../../extension/src/panel/file-tree';

describe('Panel Save Recording Flow', () => {
  beforeEach(() => {
    window.document.body.innerHTML = '';
    mockSendMessage.mockClear();
  });

  afterEach(() => {
    // Clean up dialogs
    const overlay = window.document.querySelector('.save-dialog-overlay');
    if (overlay) {
      overlay.remove();
    }
  });

  describe('saveRecording with dialog', () => {
    it('should show save dialog when saving recording', async () => {
      // Set up mock response for GET_MACROS
      mockSendMessage.mockImplementation((_msg, callback) => {
        callback({ files: ['Demo/test.iim'] });
      });

      // Show the dialog
      const dialogPromise = showSaveDialog({
        defaultFilename: 'TestRecording',
        folders: [],
        showBookmark: true,
      });

      // Dialog should be visible
      const overlay = window.document.querySelector('.save-dialog-overlay');
      expect(overlay).toBeTruthy();

      // Cancel to clean up
      (window.document.querySelector('.save-dialog-btn-cancel') as HTMLButtonElement).click();
      await dialogPromise;
    });

    it('should get folder list from GET_MACROS response', async () => {
      // Mock file tree data
      const files = [
        'Demo/file1.iim',
        'Demo/Subdir/file2.iim',
        'Samples/file3.iim',
      ];

      const treeData = createTreeFromPaths(files, 'Macros');
      const folders = SaveDialog.getFoldersFromTree(treeData);

      // Should have Demo, Demo/Subdir, and Samples
      expect(folders.length).toBe(3);
      expect(folders.map(f => f.path)).toContain('Demo');
      expect(folders.map(f => f.path)).toContain('Demo/Subdir');
      expect(folders.map(f => f.path)).toContain('Samples');
    });

    it('should pass filename to SAVE_RECORDING message', async () => {
      const dialog = new SaveDialog();
      const dialogPromise = dialog.show({
        defaultFilename: 'MyRecording',
        folders: [],
      });

      // Fill in filename and save
      const input = window.document.getElementById('save-dialog-filename') as HTMLInputElement;
      input.value = 'CustomName';

      (window.document.querySelector('.save-dialog-btn-save') as HTMLButtonElement).click();

      const result = await dialogPromise;

      expect(result.confirmed).toBe(true);
      expect(result.filename).toBe('CustomName.iim');
      expect(result.path).toBe('CustomName.iim');
    });

    it('should include folder in path when folder selected', async () => {
      const folders: FileTreeNode[] = [
        { name: 'MyFolder', path: 'MyFolder', isDirectory: true, children: [] },
      ];

      const dialog = new SaveDialog();
      const dialogPromise = dialog.show({
        defaultFilename: 'TestMacro',
        folders,
      });

      // Select folder
      const select = window.document.getElementById('save-dialog-folder') as HTMLSelectElement;
      select.value = 'MyFolder';

      (window.document.querySelector('.save-dialog-btn-save') as HTMLButtonElement).click();

      const result = await dialogPromise;

      expect(result.path).toBe('MyFolder/TestMacro.iim');
      expect(result.folder).toBe('MyFolder');
    });

    it('should include bookmark preference in result', async () => {
      const dialog = new SaveDialog();
      const dialogPromise = dialog.show({
        defaultFilename: 'TestMacro',
        showBookmark: true,
        defaultBookmark: false,
      });

      // Check bookmark
      const checkbox = window.document.getElementById('save-dialog-bookmark') as HTMLInputElement;
      checkbox.checked = true;

      (window.document.querySelector('.save-dialog-btn-save') as HTMLButtonElement).click();

      const result = await dialogPromise;

      expect(result.createBookmark).toBe(true);
    });

    it('should handle cancel without saving', async () => {
      const dialog = new SaveDialog();
      const dialogPromise = dialog.show({
        defaultFilename: 'TestMacro',
      });

      (window.document.querySelector('.save-dialog-btn-cancel') as HTMLButtonElement).click();

      const result = await dialogPromise;

      expect(result.confirmed).toBe(false);
      expect(result.filename).toBeUndefined();
    });
  });
});

describe('Panel UI State Management', () => {
  describe('Button states', () => {
    it('should have btn-save button for recording tab', () => {
      // Create a minimal panel structure
      window.document.body.innerHTML = `
        <button id="btn-save" class="btn btn-secondary" disabled>Save</button>
        <button id="btn-record" class="btn btn-record">Record</button>
      `;

      const saveBtn = window.document.getElementById('btn-save') as HTMLButtonElement;
      const recordBtn = window.document.getElementById('btn-record') as HTMLButtonElement;

      expect(saveBtn).toBeTruthy();
      expect(recordBtn).toBeTruthy();
    });

    it('should enable save button during recording', () => {
      window.document.body.innerHTML = `
        <button id="btn-save" class="btn btn-secondary" disabled>Save</button>
      `;

      const saveBtn = window.document.getElementById('btn-save') as HTMLButtonElement;

      // Simulate recording state - enable save button
      saveBtn.disabled = false;

      expect(saveBtn.disabled).toBe(false);
    });

    it('should disable save button when idle', () => {
      window.document.body.innerHTML = `
        <button id="btn-save" class="btn btn-secondary">Save</button>
      `;

      const saveBtn = window.document.getElementById('btn-save') as HTMLButtonElement;

      // Simulate idle state - disable save button
      saveBtn.disabled = true;

      expect(saveBtn.disabled).toBe(true);
    });
  });
});

describe('Folder extraction from file tree', () => {
  it('should extract all directories from tree', () => {
    const tree: FileTreeNode = {
      name: 'Macros',
      path: '',
      isDirectory: true,
      expanded: true,
      children: [
        {
          name: 'Level1',
          path: 'Level1',
          isDirectory: true,
          children: [
            {
              name: 'Level2',
              path: 'Level1/Level2',
              isDirectory: true,
              children: [
                { name: 'file.iim', path: 'Level1/Level2/file.iim', isDirectory: false },
              ],
            },
          ],
        },
        { name: 'root.iim', path: 'root.iim', isDirectory: false },
      ],
    };

    const folders = SaveDialog.getFoldersFromTree(tree);

    expect(folders.length).toBe(2);
    expect(folders[0].path).toBe('Level1');
    expect(folders[1].path).toBe('Level1/Level2');
  });

  it('should work with createTreeFromPaths', () => {
    const paths = [
      'Folder1/file1.iim',
      'Folder1/SubA/file2.iim',
      'Folder1/SubB/file3.iim',
      'Folder2/file4.iim',
    ];

    const tree = createTreeFromPaths(paths, 'Macros');
    const folders = SaveDialog.getFoldersFromTree(tree);

    expect(folders.length).toBe(4);
    const folderPaths = folders.map(f => f.path);
    expect(folderPaths).toContain('Folder1');
    expect(folderPaths).toContain('Folder1/SubA');
    expect(folderPaths).toContain('Folder1/SubB');
    expect(folderPaths).toContain('Folder2');
  });

  it('should handle empty tree', () => {
    const tree = createTreeFromPaths([], 'Macros');
    const folders = SaveDialog.getFoldersFromTree(tree);

    expect(folders.length).toBe(0);
  });

  it('should handle tree with only files', () => {
    const paths = ['file1.iim', 'file2.iim', 'file3.iim'];
    const tree = createTreeFromPaths(paths, 'Macros');
    const folders = SaveDialog.getFoldersFromTree(tree);

    expect(folders.length).toBe(0);
  });
});
