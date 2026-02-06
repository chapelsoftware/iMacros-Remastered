/**
 * Unit Tests for SaveDialog component
 *
 * Tests cover:
 * - Dialog creation and display
 * - Filename input handling
 * - Folder selection
 * - Bookmark checkbox
 * - Save and Cancel actions
 * - Keyboard shortcuts (Enter, Escape)
 * - Filename sanitization
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

// Mock chrome.storage.local (required by file-tree dependency)
const mockStorage = {
  local: {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(undefined),
  },
};
(globalThis as any).chrome = { storage: mockStorage };

// Import after setting up globals
import { SaveDialog, showSaveDialog, SaveDialogResult, SaveDialogOptions } from '../../extension/src/panel/save-dialog';
import { FileTreeNode } from '../../extension/src/panel/file-tree';

describe('SaveDialog', () => {
  let dialog: SaveDialog;

  // Helper to create sample folder structure
  function createSampleFolders(): FileTreeNode[] {
    return [
      {
        name: 'Demo',
        path: 'Demo',
        isDirectory: true,
        children: [
          {
            name: 'Subfolder',
            path: 'Demo/Subfolder',
            isDirectory: true,
            children: [],
          },
        ],
      },
      {
        name: 'Samples',
        path: 'Samples',
        isDirectory: true,
        children: [],
      },
    ];
  }

  beforeEach(() => {
    // Clear body
    window.document.body.innerHTML = '';
    dialog = new SaveDialog();
  });

  afterEach(() => {
    // Clean up any open dialogs
    const overlay = window.document.querySelector('.save-dialog-overlay');
    if (overlay) {
      overlay.remove();
    }
  });

  // ===== Dialog Creation =====

  describe('dialog creation', () => {
    it('should create and display dialog overlay', async () => {
      const showPromise = dialog.show();

      // Dialog should be visible
      const overlay = window.document.querySelector('.save-dialog-overlay');
      expect(overlay).toBeTruthy();

      // Clean up by canceling
      const cancelBtn = window.document.querySelector('.save-dialog-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();

      const result = await showPromise;
      expect(result.confirmed).toBe(false);
    });

    it('should create dialog with title', async () => {
      const showPromise = dialog.show();

      const title = window.document.querySelector('.save-dialog-title');
      expect(title).toBeTruthy();
      expect(title?.textContent).toBe('Save Macro');

      // Cancel to clean up
      (window.document.querySelector('.save-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should have filename input', async () => {
      const showPromise = dialog.show();

      const filenameInput = window.document.getElementById('save-dialog-filename') as HTMLInputElement;
      expect(filenameInput).toBeTruthy();
      expect(filenameInput.type).toBe('text');

      (window.document.querySelector('.save-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should have folder select', async () => {
      const showPromise = dialog.show();

      const folderSelect = window.document.getElementById('save-dialog-folder') as HTMLSelectElement;
      expect(folderSelect).toBeTruthy();

      (window.document.querySelector('.save-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should have bookmark checkbox when showBookmark is true', async () => {
      const showPromise = dialog.show({ showBookmark: true });

      const checkbox = window.document.getElementById('save-dialog-bookmark') as HTMLInputElement;
      expect(checkbox).toBeTruthy();
      expect(checkbox.type).toBe('checkbox');

      (window.document.querySelector('.save-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should hide bookmark checkbox when showBookmark is false', async () => {
      const showPromise = dialog.show({ showBookmark: false });

      const checkbox = window.document.getElementById('save-dialog-bookmark');
      expect(checkbox).toBeFalsy();

      (window.document.querySelector('.save-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should have Save and Cancel buttons', async () => {
      const showPromise = dialog.show();

      const saveBtn = window.document.querySelector('.save-dialog-btn-save');
      const cancelBtn = window.document.querySelector('.save-dialog-btn-cancel');

      expect(saveBtn).toBeTruthy();
      expect(saveBtn?.textContent).toBe('Save');
      expect(cancelBtn).toBeTruthy();
      expect(cancelBtn?.textContent).toBe('Cancel');

      (cancelBtn as HTMLButtonElement).click();
      await showPromise;
    });
  });

  // ===== Default Values =====

  describe('default values', () => {
    it('should use default filename when provided', async () => {
      const showPromise = dialog.show({ defaultFilename: 'MyMacro' });

      const input = window.document.getElementById('save-dialog-filename') as HTMLInputElement;
      expect(input.value).toBe('MyMacro');

      (window.document.querySelector('.save-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should generate default filename when not provided', async () => {
      const showPromise = dialog.show();

      const input = window.document.getElementById('save-dialog-filename') as HTMLInputElement;
      expect(input.value).toMatch(/^Recording_\d{8}_\d{4}$/);

      (window.document.querySelector('.save-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should use default folder when provided', async () => {
      const showPromise = dialog.show({
        folders: createSampleFolders(),
        defaultFolder: 'Demo',
      });

      const select = window.document.getElementById('save-dialog-folder') as HTMLSelectElement;
      expect(select.value).toBe('Demo');

      (window.document.querySelector('.save-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should default to root folder when no default provided', async () => {
      const showPromise = dialog.show({
        folders: createSampleFolders(),
      });

      const select = window.document.getElementById('save-dialog-folder') as HTMLSelectElement;
      expect(select.value).toBe('');

      (window.document.querySelector('.save-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should set default bookmark value', async () => {
      const showPromise = dialog.show({
        showBookmark: true,
        defaultBookmark: true,
      });

      const checkbox = window.document.getElementById('save-dialog-bookmark') as HTMLInputElement;
      expect(checkbox.checked).toBe(true);

      (window.document.querySelector('.save-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });
  });

  // ===== Folder Options =====

  describe('folder options', () => {
    it('should always have root option', async () => {
      const showPromise = dialog.show();

      const select = window.document.getElementById('save-dialog-folder') as HTMLSelectElement;
      const options = Array.from(select.options);

      expect(options[0].value).toBe('');
      expect(options[0].textContent).toBe('/ (Root)');

      (window.document.querySelector('.save-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should populate folder options from provided folders', async () => {
      const showPromise = dialog.show({
        folders: createSampleFolders(),
      });

      const select = window.document.getElementById('save-dialog-folder') as HTMLSelectElement;
      const options = Array.from(select.options);

      // Root + Demo + Demo/Subfolder + Samples = 4 options
      expect(options.length).toBe(4);
      expect(options[1].value).toBe('Demo');
      expect(options[2].value).toBe('Demo/Subfolder');
      expect(options[3].value).toBe('Samples');

      (window.document.querySelector('.save-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should indent nested folder names', async () => {
      const showPromise = dialog.show({
        folders: createSampleFolders(),
      });

      const select = window.document.getElementById('save-dialog-folder') as HTMLSelectElement;
      const options = Array.from(select.options);

      // Subfolder should be indented
      expect(options[2].textContent).toBe('  Subfolder');

      (window.document.querySelector('.save-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });
  });

  // ===== Save Action =====

  describe('save action', () => {
    it('should return confirmed true with filename on save', async () => {
      const showPromise = dialog.show({ defaultFilename: 'TestMacro' });

      const saveBtn = window.document.querySelector('.save-dialog-btn-save') as HTMLButtonElement;
      saveBtn.click();

      const result = await showPromise;
      expect(result.confirmed).toBe(true);
      expect(result.filename).toBe('TestMacro.iim');
    });

    it('should return full path with folder', async () => {
      const showPromise = dialog.show({
        defaultFilename: 'TestMacro',
        folders: createSampleFolders(),
      });

      // Select Demo folder
      const select = window.document.getElementById('save-dialog-folder') as HTMLSelectElement;
      select.value = 'Demo';

      const saveBtn = window.document.querySelector('.save-dialog-btn-save') as HTMLButtonElement;
      saveBtn.click();

      const result = await showPromise;
      expect(result.path).toBe('Demo/TestMacro.iim');
      expect(result.folder).toBe('Demo');
    });

    it('should return root path when no folder selected', async () => {
      const showPromise = dialog.show({
        defaultFilename: 'TestMacro',
        folders: createSampleFolders(),
      });

      const saveBtn = window.document.querySelector('.save-dialog-btn-save') as HTMLButtonElement;
      saveBtn.click();

      const result = await showPromise;
      expect(result.path).toBe('TestMacro.iim');
      expect(result.folder).toBe('');
    });

    it('should return bookmark value', async () => {
      const showPromise = dialog.show({
        defaultFilename: 'TestMacro',
        showBookmark: true,
      });

      // Check the bookmark checkbox
      const checkbox = window.document.getElementById('save-dialog-bookmark') as HTMLInputElement;
      checkbox.checked = true;

      const saveBtn = window.document.querySelector('.save-dialog-btn-save') as HTMLButtonElement;
      saveBtn.click();

      const result = await showPromise;
      expect(result.createBookmark).toBe(true);
    });

    it('should not save with empty filename', async () => {
      const showPromise = dialog.show({ defaultFilename: '' });

      const input = window.document.getElementById('save-dialog-filename') as HTMLInputElement;
      input.value = '';

      const saveBtn = window.document.querySelector('.save-dialog-btn-save') as HTMLButtonElement;
      saveBtn.click();

      // Dialog should still be open
      const dialogEl = window.document.querySelector('.save-dialog');
      expect(dialogEl).toBeTruthy();

      // Cancel to clean up
      (window.document.querySelector('.save-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should not save with whitespace-only filename', async () => {
      const showPromise = dialog.show({ defaultFilename: 'temp' });

      const input = window.document.getElementById('save-dialog-filename') as HTMLInputElement;
      input.value = '   ';

      const saveBtn = window.document.querySelector('.save-dialog-btn-save') as HTMLButtonElement;
      saveBtn.click();

      // Dialog should still be open
      const dialogEl = window.document.querySelector('.save-dialog');
      expect(dialogEl).toBeTruthy();

      (window.document.querySelector('.save-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });
  });

  // ===== Cancel Action =====

  describe('cancel action', () => {
    it('should return confirmed false on cancel button click', async () => {
      const showPromise = dialog.show();

      const cancelBtn = window.document.querySelector('.save-dialog-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();

      const result = await showPromise;
      expect(result.confirmed).toBe(false);
      expect(result.filename).toBeUndefined();
    });

    it('should close dialog on cancel', async () => {
      const showPromise = dialog.show();

      const cancelBtn = window.document.querySelector('.save-dialog-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();

      await showPromise;

      const dialogEl = window.document.querySelector('.save-dialog');
      expect(dialogEl).toBeFalsy();
    });

    it('should close dialog on overlay click', async () => {
      const showPromise = dialog.show();

      const overlay = window.document.querySelector('.save-dialog-overlay') as HTMLElement;
      overlay.click();

      const result = await showPromise;
      expect(result.confirmed).toBe(false);
    });

    it('should not close when clicking inside dialog', async () => {
      const showPromise = dialog.show();

      const dialogEl = window.document.querySelector('.save-dialog') as HTMLElement;
      dialogEl.click();

      // Dialog should still be open
      expect(window.document.querySelector('.save-dialog')).toBeTruthy();

      (window.document.querySelector('.save-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });
  });

  // ===== Keyboard Shortcuts =====

  describe('keyboard shortcuts', () => {
    it('should save on Enter key', async () => {
      const showPromise = dialog.show({ defaultFilename: 'TestMacro' });

      const dialogEl = window.document.querySelector('.save-dialog') as HTMLElement;
      const event = new window.KeyboardEvent('keydown', { key: 'Enter' });
      dialogEl.dispatchEvent(event);

      const result = await showPromise;
      expect(result.confirmed).toBe(true);
    });

    it('should cancel on Escape key', async () => {
      const showPromise = dialog.show();

      const dialogEl = window.document.querySelector('.save-dialog') as HTMLElement;
      const event = new window.KeyboardEvent('keydown', { key: 'Escape' });
      dialogEl.dispatchEvent(event);

      const result = await showPromise;
      expect(result.confirmed).toBe(false);
    });
  });

  // ===== Filename Sanitization =====

  describe('filename sanitization', () => {
    it('should remove invalid characters from filename', async () => {
      const showPromise = dialog.show({ defaultFilename: 'test' });

      const input = window.document.getElementById('save-dialog-filename') as HTMLInputElement;
      input.value = 'my<file>name:with/bad\\chars?';

      const saveBtn = window.document.querySelector('.save-dialog-btn-save') as HTMLButtonElement;
      saveBtn.click();

      const result = await showPromise;
      // Invalid characters <, >, :, /, \, ? are removed
      expect(result.filename).toBe('myfilenamewithbadchars.iim');
    });

    it('should replace spaces with underscores', async () => {
      const showPromise = dialog.show({ defaultFilename: 'test' });

      const input = window.document.getElementById('save-dialog-filename') as HTMLInputElement;
      input.value = 'my file name';

      const saveBtn = window.document.querySelector('.save-dialog-btn-save') as HTMLButtonElement;
      saveBtn.click();

      const result = await showPromise;
      expect(result.filename).toBe('my_file_name.iim');
    });

    it('should add .iim extension automatically', async () => {
      const showPromise = dialog.show({ defaultFilename: 'TestMacro' });

      const saveBtn = window.document.querySelector('.save-dialog-btn-save') as HTMLButtonElement;
      saveBtn.click();

      const result = await showPromise;
      expect(result.filename).toMatch(/\.iim$/);
    });
  });

  // ===== isOpen Method =====

  describe('isOpen method', () => {
    it('should return true when dialog is open', () => {
      dialog.show();
      expect(dialog.isOpen()).toBe(true);
    });

    it('should return false after dialog is closed', async () => {
      const showPromise = dialog.show();

      (window.document.querySelector('.save-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;

      expect(dialog.isOpen()).toBe(false);
    });
  });

  // ===== Static Helper Methods =====

  describe('getFoldersFromTree', () => {
    it('should extract folders from tree node', () => {
      const tree: FileTreeNode = {
        name: 'Root',
        path: '',
        isDirectory: true,
        children: [
          {
            name: 'Folder1',
            path: 'Folder1',
            isDirectory: true,
            children: [
              { name: 'file.iim', path: 'Folder1/file.iim', isDirectory: false },
              { name: 'SubFolder', path: 'Folder1/SubFolder', isDirectory: true, children: [] },
            ],
          },
          { name: 'file2.iim', path: 'file2.iim', isDirectory: false },
        ],
      };

      const folders = SaveDialog.getFoldersFromTree(tree);

      expect(folders.length).toBe(2);
      expect(folders[0].name).toBe('Folder1');
      expect(folders[1].name).toBe('SubFolder');
    });

    it('should return empty array for tree with no folders', () => {
      const tree: FileTreeNode = {
        name: 'Root',
        path: '',
        isDirectory: true,
        children: [
          { name: 'file.iim', path: 'file.iim', isDirectory: false },
        ],
      };

      const folders = SaveDialog.getFoldersFromTree(tree);
      expect(folders.length).toBe(0);
    });

    it('should handle tree with no children', () => {
      const tree: FileTreeNode = {
        name: 'Root',
        path: '',
        isDirectory: true,
      };

      const folders = SaveDialog.getFoldersFromTree(tree);
      expect(folders.length).toBe(0);
    });
  });
});

// ===== showSaveDialog Convenience Function =====

describe('showSaveDialog', () => {
  afterEach(() => {
    const overlay = window.document.querySelector('.save-dialog-overlay');
    if (overlay) {
      overlay.remove();
    }
  });

  it('should create and show dialog', async () => {
    const showPromise = showSaveDialog({ defaultFilename: 'Test' });

    const overlay = window.document.querySelector('.save-dialog-overlay');
    expect(overlay).toBeTruthy();

    (window.document.querySelector('.save-dialog-btn-cancel') as HTMLButtonElement).click();
    await showPromise;
  });

  it('should return result from dialog', async () => {
    const showPromise = showSaveDialog({ defaultFilename: 'MyMacro' });

    (window.document.querySelector('.save-dialog-btn-save') as HTMLButtonElement).click();

    const result = await showPromise;
    expect(result.confirmed).toBe(true);
    expect(result.filename).toBe('MyMacro.iim');
  });
});
