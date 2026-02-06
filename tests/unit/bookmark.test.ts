/**
 * Unit Tests for BookmarkDialog component
 *
 * Tests cover:
 * - Dialog creation and display
 * - Bookmark name input handling
 * - Folder selection
 * - Bookmarklet checkbox
 * - URL generation (imacros:// and javascript:)
 * - Create and Cancel actions
 * - Keyboard shortcuts (Enter, Escape)
 * - Bookmark API integration
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

// Mock chrome.bookmarks API
const mockBookmarksCreate = vi.fn();
const mockBookmarksGetTree = vi.fn();
const mockRuntimeLastError: { message?: string } | null = null;

const mockChrome = {
  bookmarks: {
    create: mockBookmarksCreate,
    getTree: mockBookmarksGetTree,
  },
  runtime: {
    get lastError() {
      return mockRuntimeLastError;
    },
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
};
(globalThis as any).chrome = mockChrome;

// Import after setting up globals
import {
  BookmarkDialog,
  showBookmarkDialog,
  BookmarkDialogResult,
  BookmarkDialogOptions,
  BookmarkFolderNode,
  getBookmarkFolders,
  createBookmark,
  createMacroBookmark,
} from '../../extension/src/panel/bookmark-dialog';

describe('BookmarkDialog', () => {
  let dialog: BookmarkDialog;

  // Helper to create sample folder structure
  function createSampleFolders(): BookmarkFolderNode[] {
    return [
      {
        id: '1',
        title: 'Bookmarks Bar',
        children: [
          {
            id: '10',
            title: 'Work',
            parentId: '1',
            children: [],
          },
        ],
      },
      {
        id: '2',
        title: 'Other Bookmarks',
        children: [],
      },
    ];
  }

  beforeEach(() => {
    // Clear body
    window.document.body.innerHTML = '';
    dialog = new BookmarkDialog();
    // Reset mocks
    mockBookmarksCreate.mockReset();
    mockBookmarksGetTree.mockReset();
  });

  afterEach(() => {
    // Clean up any open dialogs
    const overlay = window.document.querySelector('.bookmark-dialog-overlay');
    if (overlay) {
      overlay.remove();
    }
  });

  // ===== Dialog Creation =====

  describe('dialog creation', () => {
    it('should create and display dialog overlay', async () => {
      const showPromise = dialog.show();

      // Dialog should be visible
      const overlay = window.document.querySelector('.bookmark-dialog-overlay');
      expect(overlay).toBeTruthy();

      // Clean up by canceling
      const cancelBtn = window.document.querySelector('.bookmark-dialog-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();

      const result = await showPromise;
      expect(result.confirmed).toBe(false);
    });

    it('should create dialog with title', async () => {
      const showPromise = dialog.show();

      const title = window.document.querySelector('.bookmark-dialog-title');
      expect(title).toBeTruthy();
      expect(title?.textContent).toBe('Create Bookmark');

      // Cancel to clean up
      (window.document.querySelector('.bookmark-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should have name input', async () => {
      const showPromise = dialog.show();

      const nameInput = window.document.getElementById('bookmark-dialog-name') as HTMLInputElement;
      expect(nameInput).toBeTruthy();
      expect(nameInput.type).toBe('text');

      (window.document.querySelector('.bookmark-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should have folder select', async () => {
      const showPromise = dialog.show();

      const folderSelect = window.document.getElementById('bookmark-dialog-folder') as HTMLSelectElement;
      expect(folderSelect).toBeTruthy();

      (window.document.querySelector('.bookmark-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should have bookmarklet checkbox', async () => {
      const showPromise = dialog.show();

      const checkbox = window.document.getElementById('bookmark-dialog-bookmarklet') as HTMLInputElement;
      expect(checkbox).toBeTruthy();
      expect(checkbox.type).toBe('checkbox');

      (window.document.querySelector('.bookmark-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should have Create and Cancel buttons', async () => {
      const showPromise = dialog.show();

      const createBtn = window.document.querySelector('.bookmark-dialog-btn-create');
      const cancelBtn = window.document.querySelector('.bookmark-dialog-btn-cancel');

      expect(createBtn).toBeTruthy();
      expect(createBtn?.textContent).toBe('Create Bookmark');
      expect(cancelBtn).toBeTruthy();
      expect(cancelBtn?.textContent).toBe('Cancel');

      (cancelBtn as HTMLButtonElement).click();
      await showPromise;
    });
  });

  // ===== Default Values =====

  describe('default values', () => {
    it('should use macro name when provided', async () => {
      const showPromise = dialog.show({ macroName: 'MyMacro' });

      const input = window.document.getElementById('bookmark-dialog-name') as HTMLInputElement;
      expect(input.value).toBe('MyMacro');

      (window.document.querySelector('.bookmark-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should extract macro name from path when macroName not provided', async () => {
      const showPromise = dialog.show({ macroPath: 'Demo/TestMacro.iim' });

      const input = window.document.getElementById('bookmark-dialog-name') as HTMLInputElement;
      expect(input.value).toBe('TestMacro');

      (window.document.querySelector('.bookmark-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should handle path without folder', async () => {
      const showPromise = dialog.show({ macroPath: 'SimpleMacro.iim' });

      const input = window.document.getElementById('bookmark-dialog-name') as HTMLInputElement;
      expect(input.value).toBe('SimpleMacro');

      (window.document.querySelector('.bookmark-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should use default folder when provided', async () => {
      const showPromise = dialog.show({
        folders: createSampleFolders(),
        defaultFolderId: '2',
      });

      const select = window.document.getElementById('bookmark-dialog-folder') as HTMLSelectElement;
      expect(select.value).toBe('2');

      (window.document.querySelector('.bookmark-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should default bookmarklet checkbox to false', async () => {
      const showPromise = dialog.show();

      const checkbox = window.document.getElementById('bookmark-dialog-bookmarklet') as HTMLInputElement;
      expect(checkbox.checked).toBe(false);

      (window.document.querySelector('.bookmark-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should set default bookmarklet value when provided', async () => {
      const showPromise = dialog.show({ defaultBookmarklet: true });

      const checkbox = window.document.getElementById('bookmark-dialog-bookmarklet') as HTMLInputElement;
      expect(checkbox.checked).toBe(true);

      (window.document.querySelector('.bookmark-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });
  });

  // ===== Folder Options =====

  describe('folder options', () => {
    it('should populate folder options from provided folders', async () => {
      const showPromise = dialog.show({
        folders: createSampleFolders(),
      });

      const select = window.document.getElementById('bookmark-dialog-folder') as HTMLSelectElement;
      const options = Array.from(select.options);

      // Bookmarks Bar + Work + Other Bookmarks = 3 options
      expect(options.length).toBe(3);
      expect(options[0].value).toBe('1');
      expect(options[0].textContent).toBe('Bookmarks Bar');
      expect(options[1].value).toBe('10');
      expect(options[1].textContent).toBe('  Work');
      expect(options[2].value).toBe('2');
      expect(options[2].textContent).toBe('Other Bookmarks');

      (window.document.querySelector('.bookmark-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should indent nested folder names', async () => {
      const showPromise = dialog.show({
        folders: createSampleFolders(),
      });

      const select = window.document.getElementById('bookmark-dialog-folder') as HTMLSelectElement;
      const options = Array.from(select.options);

      // Work folder should be indented
      expect(options[1].textContent).toBe('  Work');

      (window.document.querySelector('.bookmark-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });
  });

  // ===== URL Generation =====

  describe('URL generation', () => {
    it('should generate imacros:// URL for regular bookmark', async () => {
      const showPromise = dialog.show({
        macroPath: 'Demo/TestMacro.iim',
        macroName: 'TestMacro',
      });

      const createBtn = window.document.querySelector('.bookmark-dialog-btn-create') as HTMLButtonElement;
      createBtn.click();

      const result = await showPromise;
      expect(result.isBookmarklet).toBe(false);
      expect(result.url).toContain('imacros://run/');
      expect(result.url).toContain('Demo%2FTestMacro.iim');
    });

    it('should generate javascript: URL for bookmarklet', async () => {
      const showPromise = dialog.show({
        macroPath: 'Demo/TestMacro.iim',
        macroName: 'TestMacro',
      });

      // Check the bookmarklet checkbox
      const checkbox = window.document.getElementById('bookmark-dialog-bookmarklet') as HTMLInputElement;
      checkbox.checked = true;

      const createBtn = window.document.querySelector('.bookmark-dialog-btn-create') as HTMLButtonElement;
      createBtn.click();

      const result = await showPromise;
      expect(result.isBookmarklet).toBe(true);
      expect(result.url).toMatch(/^javascript:/);
      expect(result.url).toContain('PLAY_MACRO');
    });

    it('should URL-encode macro path in imacros:// URL', async () => {
      const showPromise = dialog.show({
        macroPath: 'My Folder/Test Macro.iim',
        macroName: 'Test Macro',
      });

      const createBtn = window.document.querySelector('.bookmark-dialog-btn-create') as HTMLButtonElement;
      createBtn.click();

      const result = await showPromise;
      expect(result.url).toContain('My%20Folder%2FTest%20Macro.iim');
    });
  });

  // ===== Create Action =====

  describe('create action', () => {
    it('should return confirmed true with name on create', async () => {
      const showPromise = dialog.show({ macroName: 'TestMacro' });

      const createBtn = window.document.querySelector('.bookmark-dialog-btn-create') as HTMLButtonElement;
      createBtn.click();

      const result = await showPromise;
      expect(result.confirmed).toBe(true);
      expect(result.name).toBe('TestMacro');
    });

    it('should return selected folder ID', async () => {
      const showPromise = dialog.show({
        macroName: 'TestMacro',
        folders: createSampleFolders(),
      });

      // Select "Other Bookmarks" folder
      const select = window.document.getElementById('bookmark-dialog-folder') as HTMLSelectElement;
      select.value = '2';

      const createBtn = window.document.querySelector('.bookmark-dialog-btn-create') as HTMLButtonElement;
      createBtn.click();

      const result = await showPromise;
      expect(result.folderId).toBe('2');
    });

    it('should not create with empty name', async () => {
      const showPromise = dialog.show({ macroName: '' });

      const input = window.document.getElementById('bookmark-dialog-name') as HTMLInputElement;
      input.value = '';

      const createBtn = window.document.querySelector('.bookmark-dialog-btn-create') as HTMLButtonElement;
      createBtn.click();

      // Dialog should still be open
      const dialogEl = window.document.querySelector('.bookmark-dialog');
      expect(dialogEl).toBeTruthy();

      // Cancel to clean up
      (window.document.querySelector('.bookmark-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should not create with whitespace-only name', async () => {
      const showPromise = dialog.show({ macroName: 'temp' });

      const input = window.document.getElementById('bookmark-dialog-name') as HTMLInputElement;
      input.value = '   ';

      const createBtn = window.document.querySelector('.bookmark-dialog-btn-create') as HTMLButtonElement;
      createBtn.click();

      // Dialog should still be open
      const dialogEl = window.document.querySelector('.bookmark-dialog');
      expect(dialogEl).toBeTruthy();

      (window.document.querySelector('.bookmark-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });
  });

  // ===== Cancel Action =====

  describe('cancel action', () => {
    it('should return confirmed false on cancel button click', async () => {
      const showPromise = dialog.show();

      const cancelBtn = window.document.querySelector('.bookmark-dialog-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();

      const result = await showPromise;
      expect(result.confirmed).toBe(false);
      expect(result.name).toBeUndefined();
    });

    it('should close dialog on cancel', async () => {
      const showPromise = dialog.show();

      const cancelBtn = window.document.querySelector('.bookmark-dialog-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();

      await showPromise;

      const dialogEl = window.document.querySelector('.bookmark-dialog');
      expect(dialogEl).toBeFalsy();
    });

    it('should close dialog on overlay click', async () => {
      const showPromise = dialog.show();

      const overlay = window.document.querySelector('.bookmark-dialog-overlay') as HTMLElement;
      overlay.click();

      const result = await showPromise;
      expect(result.confirmed).toBe(false);
    });

    it('should not close when clicking inside dialog', async () => {
      const showPromise = dialog.show();

      const dialogEl = window.document.querySelector('.bookmark-dialog') as HTMLElement;
      dialogEl.click();

      // Dialog should still be open
      expect(window.document.querySelector('.bookmark-dialog')).toBeTruthy();

      (window.document.querySelector('.bookmark-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;
    });
  });

  // ===== Keyboard Shortcuts =====

  describe('keyboard shortcuts', () => {
    it('should create on Enter key', async () => {
      const showPromise = dialog.show({ macroName: 'TestMacro', macroPath: 'TestMacro.iim' });

      const dialogEl = window.document.querySelector('.bookmark-dialog') as HTMLElement;
      const event = new window.KeyboardEvent('keydown', { key: 'Enter' });
      dialogEl.dispatchEvent(event);

      const result = await showPromise;
      expect(result.confirmed).toBe(true);
    });

    it('should cancel on Escape key', async () => {
      const showPromise = dialog.show();

      const dialogEl = window.document.querySelector('.bookmark-dialog') as HTMLElement;
      const event = new window.KeyboardEvent('keydown', { key: 'Escape' });
      dialogEl.dispatchEvent(event);

      const result = await showPromise;
      expect(result.confirmed).toBe(false);
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

      (window.document.querySelector('.bookmark-dialog-btn-cancel') as HTMLButtonElement).click();
      await showPromise;

      expect(dialog.isOpen()).toBe(false);
    });
  });
});

// ===== showBookmarkDialog Convenience Function =====

describe('showBookmarkDialog', () => {
  afterEach(() => {
    const overlay = window.document.querySelector('.bookmark-dialog-overlay');
    if (overlay) {
      overlay.remove();
    }
  });

  it('should create and show dialog', async () => {
    const showPromise = showBookmarkDialog({ macroName: 'Test' });

    const overlay = window.document.querySelector('.bookmark-dialog-overlay');
    expect(overlay).toBeTruthy();

    (window.document.querySelector('.bookmark-dialog-btn-cancel') as HTMLButtonElement).click();
    await showPromise;
  });

  it('should return result from dialog', async () => {
    const showPromise = showBookmarkDialog({ macroName: 'MyMacro', macroPath: 'MyMacro.iim' });

    (window.document.querySelector('.bookmark-dialog-btn-create') as HTMLButtonElement).click();

    const result = await showPromise;
    expect(result.confirmed).toBe(true);
    expect(result.name).toBe('MyMacro');
  });
});

// ===== getBookmarkFolders =====

describe('getBookmarkFolders', () => {
  beforeEach(() => {
    mockBookmarksGetTree.mockReset();
  });

  it('should return folders from chrome.bookmarks.getTree', async () => {
    const mockTree: chrome.bookmarks.BookmarkTreeNode[] = [
      {
        id: '0',
        title: '',
        children: [
          {
            id: '1',
            title: 'Bookmarks Bar',
            parentId: '0',
            children: [],
          },
          {
            id: '2',
            title: 'Other Bookmarks',
            parentId: '0',
            children: [],
          },
        ],
      },
    ];

    mockBookmarksGetTree.mockImplementation((callback: (tree: chrome.bookmarks.BookmarkTreeNode[]) => void) => {
      callback(mockTree);
    });

    const folders = await getBookmarkFolders();

    expect(mockBookmarksGetTree).toHaveBeenCalled();
    expect(folders.length).toBe(1);
    expect(folders[0].children?.length).toBe(2);
  });

  it('should return default folders when API not available', async () => {
    // Temporarily remove chrome.bookmarks
    const savedBookmarks = (globalThis as any).chrome.bookmarks;
    (globalThis as any).chrome.bookmarks = undefined;

    const folders = await getBookmarkFolders();

    expect(folders.length).toBe(2);
    expect(folders[0].title).toBe('Bookmarks Bar');
    expect(folders[1].title).toBe('Other Bookmarks');

    // Restore
    (globalThis as any).chrome.bookmarks = savedBookmarks;
  });
});

// ===== createBookmark =====

describe('createBookmark', () => {
  beforeEach(() => {
    mockBookmarksCreate.mockReset();
  });

  it('should call chrome.bookmarks.create with correct parameters', async () => {
    mockBookmarksCreate.mockImplementation(
      (details: chrome.bookmarks.BookmarkCreateArg, callback: (result: chrome.bookmarks.BookmarkTreeNode) => void) => {
        callback({ id: '123', title: details.title, url: details.url });
      }
    );

    const result = await createBookmark('Test Bookmark', 'imacros://run/test.iim', '1');

    expect(mockBookmarksCreate).toHaveBeenCalledWith(
      {
        title: 'Test Bookmark',
        url: 'imacros://run/test.iim',
        parentId: '1',
      },
      expect.any(Function)
    );
    expect(result.success).toBe(true);
    expect(result.bookmarkId).toBe('123');
  });

  it('should work without parentId', async () => {
    mockBookmarksCreate.mockImplementation(
      (details: chrome.bookmarks.BookmarkCreateArg, callback: (result: chrome.bookmarks.BookmarkTreeNode) => void) => {
        callback({ id: '456', title: details.title, url: details.url });
      }
    );

    const result = await createBookmark('Test Bookmark', 'imacros://run/test.iim');

    expect(mockBookmarksCreate).toHaveBeenCalledWith(
      {
        title: 'Test Bookmark',
        url: 'imacros://run/test.iim',
      },
      expect.any(Function)
    );
    expect(result.success).toBe(true);
  });

  it('should return error when API not available', async () => {
    // Temporarily remove chrome.bookmarks
    const savedBookmarks = (globalThis as any).chrome.bookmarks;
    (globalThis as any).chrome.bookmarks = undefined;

    const result = await createBookmark('Test', 'imacros://run/test.iim');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Bookmarks API not available');

    // Restore
    (globalThis as any).chrome.bookmarks = savedBookmarks;
  });
});

// ===== createMacroBookmark (full flow) =====

describe('createMacroBookmark', () => {
  beforeEach(() => {
    mockBookmarksGetTree.mockReset();
    mockBookmarksCreate.mockReset();
  });

  afterEach(() => {
    const overlay = window.document.querySelector('.bookmark-dialog-overlay');
    if (overlay) {
      overlay.remove();
    }
  });

  it('should return cancelled when user cancels dialog', async () => {
    mockBookmarksGetTree.mockImplementation((callback: (tree: chrome.bookmarks.BookmarkTreeNode[]) => void) => {
      callback([{ id: '0', title: '', children: [] }]);
    });

    // Start the createMacroBookmark flow
    const resultPromise = createMacroBookmark('Test.iim', 'Test');

    // Wait for dialog to appear
    await new Promise(resolve => setTimeout(resolve, 10));

    // Cancel the dialog
    const cancelBtn = window.document.querySelector('.bookmark-dialog-btn-cancel') as HTMLButtonElement;
    if (cancelBtn) {
      cancelBtn.click();
    }

    const result = await resultPromise;
    expect(result.cancelled).toBe(true);
    expect(result.success).toBe(false);
  });

  it('should create bookmark when user confirms dialog', async () => {
    mockBookmarksGetTree.mockImplementation((callback: (tree: chrome.bookmarks.BookmarkTreeNode[]) => void) => {
      callback([{ id: '0', title: '', children: [{ id: '1', title: 'Bookmarks Bar', children: [] }] }]);
    });

    mockBookmarksCreate.mockImplementation(
      (details: chrome.bookmarks.BookmarkCreateArg, callback: (result: chrome.bookmarks.BookmarkTreeNode) => void) => {
        callback({ id: '789', title: details.title, url: details.url });
      }
    );

    // Start the createMacroBookmark flow
    const resultPromise = createMacroBookmark('MyMacro.iim', 'MyMacro');

    // Wait for dialog to appear
    await new Promise(resolve => setTimeout(resolve, 10));

    // Confirm the dialog
    const createBtn = window.document.querySelector('.bookmark-dialog-btn-create') as HTMLButtonElement;
    if (createBtn) {
      createBtn.click();
    }

    const result = await resultPromise;
    expect(result.success).toBe(true);
    expect(result.bookmarkId).toBe('789');
  });
});
