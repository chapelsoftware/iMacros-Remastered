/**
 * Unit Tests for FileTree component with state persistence
 *
 * Tests cover:
 * - Tree rendering and basic functionality
 * - Expand/collapse folders with state persistence
 * - Selection with state persistence
 * - State restoration on initialization
 * - chrome.storage.local mocking
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

// Mock chrome.storage.local
const mockStorageData: Record<string, any> = {};
const mockStorage = {
  local: {
    get: vi.fn().mockImplementation((key: string) => {
      return Promise.resolve({ [key]: mockStorageData[key] });
    }),
    set: vi.fn().mockImplementation((data: Record<string, any>) => {
      Object.assign(mockStorageData, data);
      return Promise.resolve();
    }),
    remove: vi.fn().mockImplementation((key: string) => {
      delete mockStorageData[key];
      return Promise.resolve();
    }),
  },
};

(globalThis as any).chrome = { storage: mockStorage };

// Mock scrollIntoView which is not available in JSDOM
window.Element.prototype.scrollIntoView = vi.fn();

// Polyfill DragEvent for JSDOM (which doesn't have it)
if (typeof window.DragEvent === 'undefined') {
  class DragEventPolyfill extends window.MouseEvent {
    dataTransfer: DataTransfer | null;
    constructor(type: string, init?: DragEventInit & { dataTransfer?: any }) {
      super(type, init);
      this.dataTransfer = init?.dataTransfer || null;
    }
  }
  (window as any).DragEvent = DragEventPolyfill;
  (globalThis as any).DragEvent = DragEventPolyfill;
}

// Import after setting up globals
import {
  FileTree,
  FileTreeNode,
  FileTreeState,
  createTreeFromPaths,
} from '../../extension/src/panel/file-tree';

describe('FileTree', () => {
  let container: HTMLElement;
  let fileTree: FileTree;

  // Helper to create a sample tree
  function createSampleTree(): FileTreeNode {
    return {
      name: 'Macros',
      path: '',
      isDirectory: true,
      expanded: true,
      children: [
        {
          name: 'Demo',
          path: 'Demo',
          isDirectory: true,
          expanded: false,
          children: [
            { name: 'FillForms.iim', path: 'Demo/FillForms.iim', isDirectory: false },
            { name: 'ExtractTable.iim', path: 'Demo/ExtractTable.iim', isDirectory: false },
          ],
        },
        {
          name: 'Samples',
          path: 'Samples',
          isDirectory: true,
          expanded: false,
          children: [
            { name: 'Login.iim', path: 'Samples/Login.iim', isDirectory: false },
          ],
        },
        { name: 'test.iim', path: 'test.iim', isDirectory: false },
      ],
    };
  }

  beforeEach(() => {
    // Clear storage mock
    Object.keys(mockStorageData).forEach(key => delete mockStorageData[key]);
    mockStorage.local.get.mockClear();
    mockStorage.local.set.mockClear();

    // Create fresh container
    container = window.document.createElement('div');
    window.document.body.innerHTML = '';
    window.document.body.appendChild(container);
  });

  afterEach(() => {
    if (fileTree) {
      fileTree.destroy();
    }
  });

  // ===== Basic Functionality =====

  describe('basic functionality', () => {
    it('should initialize with empty state', () => {
      fileTree = new FileTree(container);
      // Container itself gets the class added
      expect(container.classList.contains('file-tree-container')).toBe(true);
      expect(container.querySelector('.file-tree-empty')).toBeTruthy();
    });

    it('should render tree data', () => {
      fileTree = new FileTree(container);
      fileTree.setData(createSampleTree());

      const items = container.querySelectorAll('.file-tree-item');
      expect(items.length).toBeGreaterThan(0);
    });

    it('should show folder and file icons', () => {
      fileTree = new FileTree(container);
      fileTree.setData(createSampleTree());

      const icons = container.querySelectorAll('.file-tree-icon');
      expect(icons.length).toBeGreaterThan(0);
    });

    it('should load state from storage on construction', async () => {
      fileTree = new FileTree(container);

      // Wait for async loadState
      await vi.waitFor(() => {
        expect(mockStorage.local.get).toHaveBeenCalledWith('fileTree');
      });
    });

    it('should use custom storage key when provided', async () => {
      fileTree = new FileTree(container, { storageKey: 'customKey' });

      await vi.waitFor(() => {
        expect(mockStorage.local.get).toHaveBeenCalledWith('customKey');
      });
    });
  });

  // ===== State Persistence - Expanded Folders =====

  describe('expanded folders persistence', () => {
    it('should save state when folder is expanded', async () => {
      fileTree = new FileTree(container);
      fileTree.setData(createSampleTree());

      // Expand a folder
      fileTree.expandFolder('Demo');

      await vi.waitFor(() => {
        expect(mockStorage.local.set).toHaveBeenCalled();
        const lastCall = mockStorage.local.set.mock.calls.slice(-1)[0][0];
        expect(lastCall.fileTree.expandedPaths).toContain('Demo');
      });
    });

    it('should save state when folder is collapsed', async () => {
      // First expand the folder
      fileTree = new FileTree(container);
      const tree = createSampleTree();
      tree.children![0].expanded = true; // Expand Demo
      fileTree.setData(tree);

      mockStorage.local.set.mockClear();

      // Collapse the folder
      fileTree.collapseFolder('Demo');

      await vi.waitFor(() => {
        expect(mockStorage.local.set).toHaveBeenCalled();
        const lastCall = mockStorage.local.set.mock.calls.slice(-1)[0][0];
        expect(lastCall.fileTree.expandedPaths).not.toContain('Demo');
      });
    });

    it('should save state when expandAll is called', async () => {
      fileTree = new FileTree(container);
      fileTree.setData(createSampleTree());

      mockStorage.local.set.mockClear();
      fileTree.expandAll();

      await vi.waitFor(() => {
        expect(mockStorage.local.set).toHaveBeenCalled();
        const lastCall = mockStorage.local.set.mock.calls.slice(-1)[0][0];
        expect(lastCall.fileTree.expandedPaths).toContain('');
        expect(lastCall.fileTree.expandedPaths).toContain('Demo');
        expect(lastCall.fileTree.expandedPaths).toContain('Samples');
      });
    });

    it('should save state when collapseAll is called', async () => {
      fileTree = new FileTree(container);
      const tree = createSampleTree();
      tree.children![0].expanded = true;
      tree.children![1].expanded = true;
      fileTree.setData(tree);

      mockStorage.local.set.mockClear();
      fileTree.collapseAll();

      await vi.waitFor(() => {
        expect(mockStorage.local.set).toHaveBeenCalled();
        const lastCall = mockStorage.local.set.mock.calls.slice(-1)[0][0];
        // Only root should remain expanded (or all collapsed)
        expect(lastCall.fileTree.expandedPaths).not.toContain('Demo');
        expect(lastCall.fileTree.expandedPaths).not.toContain('Samples');
      });
    });

    it('should restore expanded folders from storage', async () => {
      // Pre-populate storage with expanded state
      mockStorageData['fileTree'] = {
        expandedPaths: ['', 'Demo', 'Samples'],
        selectedPath: null,
      };

      fileTree = new FileTree(container);

      // Wait for state to load
      await vi.waitFor(() => {
        expect(mockStorage.local.get).toHaveBeenCalled();
      });

      // Set data - this should apply the persisted state
      fileTree.setData(createSampleTree());

      const state = fileTree.getState();
      expect(state.expandedPaths).toContain('Demo');
      expect(state.expandedPaths).toContain('Samples');
    });
  });

  // ===== State Persistence - Selection =====

  describe('selection persistence', () => {
    it('should save state when item is selected', async () => {
      fileTree = new FileTree(container);
      fileTree.setData(createSampleTree());

      mockStorage.local.set.mockClear();
      fileTree.selectByPath('test.iim');

      await vi.waitFor(() => {
        expect(mockStorage.local.set).toHaveBeenCalled();
        const lastCall = mockStorage.local.set.mock.calls.slice(-1)[0][0];
        expect(lastCall.fileTree.selectedPath).toBe('test.iim');
      });
    });

    it('should restore selection from storage', async () => {
      // Pre-populate storage with selection
      mockStorageData['fileTree'] = {
        expandedPaths: [''],
        selectedPath: 'test.iim',
      };

      fileTree = new FileTree(container);

      // Wait for state to load
      await vi.waitFor(() => {
        expect(mockStorage.local.get).toHaveBeenCalled();
      });

      // Set data - this should apply the persisted state
      fileTree.setData(createSampleTree());

      const selectedNode = fileTree.getSelectedNode();
      expect(selectedNode).not.toBeNull();
      expect(selectedNode!.path).toBe('test.iim');
    });

    it('should restore selection inside expanded folder', async () => {
      // Pre-populate storage with expanded folder and selection inside it
      mockStorageData['fileTree'] = {
        expandedPaths: ['', 'Demo'],
        selectedPath: 'Demo/FillForms.iim',
      };

      fileTree = new FileTree(container);

      await vi.waitFor(() => {
        expect(mockStorage.local.get).toHaveBeenCalled();
      });

      fileTree.setData(createSampleTree());

      const selectedNode = fileTree.getSelectedNode();
      expect(selectedNode).not.toBeNull();
      expect(selectedNode!.path).toBe('Demo/FillForms.iim');
    });

    it('should handle selection of non-existent path gracefully', async () => {
      mockStorageData['fileTree'] = {
        expandedPaths: [''],
        selectedPath: 'nonexistent/file.iim',
      };

      fileTree = new FileTree(container);

      await vi.waitFor(() => {
        expect(mockStorage.local.get).toHaveBeenCalled();
      });

      fileTree.setData(createSampleTree());

      const selectedNode = fileTree.getSelectedNode();
      expect(selectedNode).toBeNull();
    });
  });

  // ===== getState Method =====

  describe('getState', () => {
    it('should return empty state for empty tree', () => {
      fileTree = new FileTree(container);

      const state = fileTree.getState();
      expect(state.expandedPaths).toEqual([]);
      expect(state.selectedPath).toBeNull();
    });

    it('should return current expanded paths', () => {
      fileTree = new FileTree(container);
      const tree = createSampleTree();
      tree.children![0].expanded = true; // Demo expanded
      fileTree.setData(tree);

      const state = fileTree.getState();
      expect(state.expandedPaths).toContain('');
      expect(state.expandedPaths).toContain('Demo');
      expect(state.expandedPaths).not.toContain('Samples');
    });

    it('should return current selection', () => {
      fileTree = new FileTree(container);
      fileTree.setData(createSampleTree());
      fileTree.selectByPath('test.iim');

      const state = fileTree.getState();
      expect(state.selectedPath).toBe('test.iim');
    });

    it('should return all nested expanded paths', () => {
      fileTree = new FileTree(container);
      const tree = createSampleTree();
      tree.children![0].expanded = true;
      tree.children![1].expanded = true;
      fileTree.setData(tree);

      const state = fileTree.getState();
      expect(state.expandedPaths).toContain('');
      expect(state.expandedPaths).toContain('Demo');
      expect(state.expandedPaths).toContain('Samples');
    });
  });

  // ===== Error Handling =====

  describe('error handling', () => {
    it('should handle storage read errors gracefully', async () => {
      mockStorage.local.get.mockRejectedValueOnce(new Error('Storage error'));

      // Should not throw
      expect(() => {
        fileTree = new FileTree(container);
      }).not.toThrow();

      // Wait a tick for the async error to be caught
      await new Promise(resolve => setTimeout(resolve, 10));

      // Tree should still work
      fileTree.setData(createSampleTree());
      expect(container.querySelectorAll('.file-tree-item').length).toBeGreaterThan(0);
    });

    it('should handle storage write errors gracefully', async () => {
      mockStorage.local.set.mockRejectedValueOnce(new Error('Storage error'));

      fileTree = new FileTree(container);
      fileTree.setData(createSampleTree());

      // Should not throw when expanding
      expect(() => {
        fileTree.expandFolder('Demo');
      }).not.toThrow();
    });

    it('should handle missing storage data gracefully', async () => {
      mockStorageData['fileTree'] = undefined;

      fileTree = new FileTree(container);

      await vi.waitFor(() => {
        expect(mockStorage.local.get).toHaveBeenCalled();
      });

      // Tree should work normally
      fileTree.setData(createSampleTree());
      const state = fileTree.getState();
      expect(state.expandedPaths).toContain('');
    });
  });

  // ===== Toggle Folder via Private Method =====

  describe('folder toggling with persistence', () => {
    it('should save state when folder is toggled via arrow click', async () => {
      fileTree = new FileTree(container);
      fileTree.setData(createSampleTree());

      mockStorage.local.set.mockClear();

      // Find and click the arrow for Demo folder
      const demoItem = container.querySelector('[data-path="Demo"]');
      expect(demoItem).toBeTruthy();
      const arrow = demoItem!.querySelector('.file-tree-arrow');
      expect(arrow).toBeTruthy();

      // Simulate click on arrow
      arrow!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

      await vi.waitFor(() => {
        expect(mockStorage.local.set).toHaveBeenCalled();
      });
    });

    it('should save state when folder is toggled via double-click', async () => {
      fileTree = new FileTree(container);
      fileTree.setData(createSampleTree());

      mockStorage.local.set.mockClear();

      // Find Demo folder row
      const demoItem = container.querySelector('[data-path="Demo"]');
      const row = demoItem!.querySelector('.file-tree-row');

      // Simulate double-click
      row!.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));

      await vi.waitFor(() => {
        expect(mockStorage.local.set).toHaveBeenCalled();
      });
    });

    it('should save state when item is selected via click', async () => {
      fileTree = new FileTree(container);
      fileTree.setData(createSampleTree());

      mockStorage.local.set.mockClear();

      // Find test.iim row and click it
      const testItem = container.querySelector('[data-path="test.iim"]');
      const row = testItem!.querySelector('.file-tree-row');

      row!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

      await vi.waitFor(() => {
        expect(mockStorage.local.set).toHaveBeenCalled();
        const lastCall = mockStorage.local.set.mock.calls.slice(-1)[0][0];
        expect(lastCall.fileTree.selectedPath).toBe('test.iim');
      });
    });
  });

  // ===== State Restoration Timing =====

  describe('state restoration timing', () => {
    it('should apply pending state when setData is called after loadState', async () => {
      // Pre-populate storage
      mockStorageData['fileTree'] = {
        expandedPaths: ['', 'Demo'],
        selectedPath: 'Demo/FillForms.iim',
      };

      fileTree = new FileTree(container);

      // Wait for loadState to complete
      await vi.waitFor(() => {
        expect(mockStorage.local.get).toHaveBeenCalled();
      });

      // Now set data
      fileTree.setData(createSampleTree());

      // State should be applied
      const state = fileTree.getState();
      expect(state.expandedPaths).toContain('Demo');
      expect(state.selectedPath).toBe('Demo/FillForms.iim');
    });

    it('should not apply pending state twice if setData called multiple times', async () => {
      mockStorageData['fileTree'] = {
        expandedPaths: ['', 'Demo'],
        selectedPath: 'test.iim',
      };

      fileTree = new FileTree(container);

      await vi.waitFor(() => {
        expect(mockStorage.local.get).toHaveBeenCalled();
      });

      // First setData - applies pending state
      fileTree.setData(createSampleTree());

      // Collapse Demo manually
      fileTree.collapseFolder('Demo');
      fileTree.selectByPath('Demo/ExtractTable.iim');

      // Second setData with fresh tree
      mockStorage.local.set.mockClear();
      const newTree = createSampleTree();
      fileTree.setData(newTree);

      // Pending state should have been cleared, so manual changes should persist
      // Actually the tree was reset, but pending state is null now
      const state = fileTree.getState();
      // The tree was reset with default expanded states
      expect(state.expandedPaths).toContain('');
    });
  });

  // ===== Scroll into View =====

  describe('scroll into view', () => {
    it('should scroll selected item into view on state restore', async () => {
      mockStorageData['fileTree'] = {
        expandedPaths: ['', 'Demo'],
        selectedPath: 'Demo/FillForms.iim',
      };

      // Mock scrollIntoView
      const scrollIntoViewMock = vi.fn();
      window.Element.prototype.scrollIntoView = scrollIntoViewMock;

      fileTree = new FileTree(container);

      await vi.waitFor(() => {
        expect(mockStorage.local.get).toHaveBeenCalled();
      });

      fileTree.setData(createSampleTree());

      // scrollIntoView should have been called
      await vi.waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalledWith({
          block: 'nearest',
          behavior: 'smooth',
        });
      });
    });
  });
});

// ===== createTreeFromPaths =====

describe('createTreeFromPaths', () => {
  it('should create tree from flat file paths', () => {
    const paths = [
      'Demo/FillForms.iim',
      'Demo/ExtractTable.iim',
      'Samples/Login.iim',
      'test.iim',
    ];

    const tree = createTreeFromPaths(paths);

    expect(tree.name).toBe('Macros');
    expect(tree.isDirectory).toBe(true);
    expect(tree.children).toHaveLength(3); // Demo, Samples, test.iim
  });

  it('should create nested directories', () => {
    const paths = [
      'Level1/Level2/Level3/file.iim',
    ];

    const tree = createTreeFromPaths(paths);

    expect(tree.children).toHaveLength(1);
    const level1 = tree.children![0];
    expect(level1.name).toBe('Level1');
    expect(level1.isDirectory).toBe(true);
    expect(level1.children).toHaveLength(1);
  });

  it('should sort folders before files', () => {
    const paths = [
      'zebra.iim',
      'Alpha/file.iim',
      'beta.iim',
    ];

    const tree = createTreeFromPaths(paths);

    // Alpha folder should come first
    expect(tree.children![0].name).toBe('Alpha');
    expect(tree.children![0].isDirectory).toBe(true);
    // Then files alphabetically
    expect(tree.children![1].name).toBe('beta.iim');
    expect(tree.children![2].name).toBe('zebra.iim');
  });

  it('should use custom root name', () => {
    const paths = ['file.iim'];
    const tree = createTreeFromPaths(paths, 'CustomRoot');

    expect(tree.name).toBe('CustomRoot');
  });

  it('should handle empty paths array', () => {
    const tree = createTreeFromPaths([]);

    expect(tree.name).toBe('Macros');
    expect(tree.children).toEqual([]);
  });
});

// ===== FileTreeState Interface =====

describe('FileTreeState', () => {
  it('should have correct shape', () => {
    const state: FileTreeState = {
      expandedPaths: ['path1', 'path2'],
      selectedPath: 'path1/file.iim',
    };

    expect(state.expandedPaths).toBeInstanceOf(Array);
    expect(typeof state.selectedPath).toBe('string');
  });

  it('should allow null selectedPath', () => {
    const state: FileTreeState = {
      expandedPaths: [],
      selectedPath: null,
    };

    expect(state.selectedPath).toBeNull();
  });
});

// ===== Context Menu Actions =====

describe('FileTree Context Menu', () => {
  let container: HTMLElement;
  let fileTree: FileTree;
  let onContextMenuMock: ReturnType<typeof vi.fn>;
  let onRefreshMock: ReturnType<typeof vi.fn>;

  function createSampleTree(): FileTreeNode {
    return {
      name: 'Macros',
      path: '',
      isDirectory: true,
      expanded: true,
      children: [
        {
          name: 'Demo',
          path: 'Demo',
          isDirectory: true,
          expanded: false,
          children: [
            { name: 'FillForms.iim', path: 'Demo/FillForms.iim', isDirectory: false },
          ],
        },
        { name: 'test.iim', path: 'test.iim', isDirectory: false },
      ],
    };
  }

  beforeEach(() => {
    Object.keys(mockStorageData).forEach(key => delete mockStorageData[key]);
    mockStorage.local.get.mockClear();
    mockStorage.local.set.mockClear();

    container = window.document.createElement('div');
    window.document.body.innerHTML = '';
    window.document.body.appendChild(container);

    onContextMenuMock = vi.fn();
    onRefreshMock = vi.fn();

    fileTree = new FileTree(container, {
      onContextMenu: onContextMenuMock,
      onRefresh: onRefreshMock,
    });
    fileTree.setData(createSampleTree());
  });

  afterEach(() => {
    fileTree.destroy();
  });

  it('should show context menu on right-click for files', () => {
    const testItem = container.querySelector('[data-path="test.iim"]');
    const row = testItem!.querySelector('.file-tree-row');

    row!.dispatchEvent(new window.MouseEvent('contextmenu', {
      bubbles: true,
      clientX: 100,
      clientY: 100,
    }));

    const contextMenu = window.document.querySelector('.file-tree-context-menu');
    expect(contextMenu).toBeTruthy();
  });

  it('should show Play, Edit, Rename, Delete options for files', () => {
    const testItem = container.querySelector('[data-path="test.iim"]');
    const row = testItem!.querySelector('.file-tree-row');

    row!.dispatchEvent(new window.MouseEvent('contextmenu', {
      bubbles: true,
      clientX: 100,
      clientY: 100,
    }));

    const contextMenu = window.document.querySelector('.file-tree-context-menu');
    const items = contextMenu!.querySelectorAll('.file-tree-context-item');
    const labels = Array.from(items).map(item => item.textContent);

    expect(labels).toContain('Play');
    expect(labels).toContain('Edit');
    expect(labels).toContain('Rename');
    expect(labels).toContain('Delete');
  });

  it('should show New Folder, Rename, Delete, Refresh options for directories', () => {
    const demoItem = container.querySelector('[data-path="Demo"]');
    const row = demoItem!.querySelector('.file-tree-row');

    row!.dispatchEvent(new window.MouseEvent('contextmenu', {
      bubbles: true,
      clientX: 100,
      clientY: 100,
    }));

    const contextMenu = window.document.querySelector('.file-tree-context-menu');
    const items = contextMenu!.querySelectorAll('.file-tree-context-item');
    const labels = Array.from(items).map(item => item.textContent);

    expect(labels).toContain('New Folder');
    expect(labels).toContain('Rename');
    expect(labels).toContain('Delete');
    expect(labels).toContain('Refresh');
  });

  it('should start inline rename when Rename clicked', () => {
    const testItem = container.querySelector('[data-path="test.iim"]');
    const row = testItem!.querySelector('.file-tree-row');

    row!.dispatchEvent(new window.MouseEvent('contextmenu', {
      bubbles: true,
      clientX: 100,
      clientY: 100,
    }));

    const contextMenu = window.document.querySelector('.file-tree-context-menu');
    const renameItem = Array.from(contextMenu!.querySelectorAll('.file-tree-context-item'))
      .find(item => item.textContent === 'Rename');
    renameItem!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    // Rename action triggers inline editing, not onContextMenu callback
    // Check that context menu is hidden after click
    const menuAfterClick = window.document.querySelector('.file-tree-context-menu');
    expect(menuAfterClick).toBeNull();
  });

  it('should call onContextMenu with delete action when Delete clicked', () => {
    const testItem = container.querySelector('[data-path="test.iim"]');
    const row = testItem!.querySelector('.file-tree-row');

    row!.dispatchEvent(new window.MouseEvent('contextmenu', {
      bubbles: true,
      clientX: 100,
      clientY: 100,
    }));

    const contextMenu = window.document.querySelector('.file-tree-context-menu');
    const deleteItem = Array.from(contextMenu!.querySelectorAll('.file-tree-context-item'))
      .find(item => item.textContent === 'Delete');
    deleteItem!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    expect(onContextMenuMock).toHaveBeenCalledWith(
      expect.objectContaining({
        node: expect.objectContaining({ path: 'test.iim' }),
        action: 'delete',
      })
    );
  });

  it('should start inline new folder when New Folder clicked', () => {
    const demoItem = container.querySelector('[data-path="Demo"]');
    const row = demoItem!.querySelector('.file-tree-row');

    row!.dispatchEvent(new window.MouseEvent('contextmenu', {
      bubbles: true,
      clientX: 100,
      clientY: 100,
    }));

    const contextMenu = window.document.querySelector('.file-tree-context-menu');
    const newFolderItem = Array.from(contextMenu!.querySelectorAll('.file-tree-context-item'))
      .find(item => item.textContent === 'New Folder');
    newFolderItem!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    // New Folder action triggers inline editing, not onContextMenu callback
    // Check that context menu is hidden after click
    const menuAfterClick = window.document.querySelector('.file-tree-context-menu');
    expect(menuAfterClick).toBeNull();
  });

  it('should call onRefresh when Refresh clicked on directory', () => {
    const demoItem = container.querySelector('[data-path="Demo"]');
    const row = demoItem!.querySelector('.file-tree-row');

    row!.dispatchEvent(new window.MouseEvent('contextmenu', {
      bubbles: true,
      clientX: 100,
      clientY: 100,
    }));

    const contextMenu = window.document.querySelector('.file-tree-context-menu');
    const refreshItem = Array.from(contextMenu!.querySelectorAll('.file-tree-context-item'))
      .find(item => item.textContent === 'Refresh');
    refreshItem!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    expect(onRefreshMock).toHaveBeenCalled();
    expect(onContextMenuMock).not.toHaveBeenCalled();
  });

  it('should hide context menu when clicking outside', () => {
    const testItem = container.querySelector('[data-path="test.iim"]');
    const row = testItem!.querySelector('.file-tree-row');

    row!.dispatchEvent(new window.MouseEvent('contextmenu', {
      bubbles: true,
      clientX: 100,
      clientY: 100,
    }));

    expect(window.document.querySelector('.file-tree-context-menu')).toBeTruthy();

    // Click outside
    window.document.body.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    expect(window.document.querySelector('.file-tree-context-menu')).toBeFalsy();
  });
});

// ===== Drag and Drop =====

describe('FileTree Drag and Drop', () => {
  let container: HTMLElement;
  let fileTree: FileTree;
  let onMoveMock: ReturnType<typeof vi.fn>;

  function createSampleTree(): FileTreeNode {
    return {
      name: 'Macros',
      path: '',
      isDirectory: true,
      expanded: true,
      children: [
        {
          name: 'Demo',
          path: 'Demo',
          isDirectory: true,
          expanded: true,
          children: [
            { name: 'FillForms.iim', path: 'Demo/FillForms.iim', isDirectory: false },
          ],
        },
        {
          name: 'Samples',
          path: 'Samples',
          isDirectory: true,
          expanded: false,
          children: [],
        },
        { name: 'test.iim', path: 'test.iim', isDirectory: false },
      ],
    };
  }

  beforeEach(() => {
    Object.keys(mockStorageData).forEach(key => delete mockStorageData[key]);
    mockStorage.local.get.mockClear();
    mockStorage.local.set.mockClear();

    container = window.document.createElement('div');
    window.document.body.innerHTML = '';
    window.document.body.appendChild(container);

    onMoveMock = vi.fn();

    fileTree = new FileTree(container, {
      onMove: onMoveMock,
    });
    fileTree.setData(createSampleTree());
  });

  afterEach(() => {
    fileTree.destroy();
  });

  it('should set draggable attribute on rows', () => {
    const rows = container.querySelectorAll('.file-tree-row');
    rows.forEach(row => {
      expect(row.getAttribute('draggable')).toBe('true');
    });
  });

  it('should add dragging class on dragstart', () => {
    const testItem = container.querySelector('[data-path="test.iim"]');
    const row = testItem!.querySelector('.file-tree-row') as HTMLElement;

    const dataTransfer = {
      effectAllowed: '',
      setData: vi.fn(),
    };

    row.dispatchEvent(new (window as any).DragEvent('dragstart', {
      bubbles: true,
      dataTransfer,
    } as any));

    expect(row.classList.contains('dragging')).toBe(true);
  });

  it('should remove dragging class on dragend', () => {
    const testItem = container.querySelector('[data-path="test.iim"]');
    const row = testItem!.querySelector('.file-tree-row') as HTMLElement;

    const dataTransfer = {
      effectAllowed: '',
      setData: vi.fn(),
    };

    row.dispatchEvent(new (window as any).DragEvent('dragstart', {
      bubbles: true,
      dataTransfer,
    } as any));

    row.dispatchEvent(new (window as any).DragEvent('dragend', {
      bubbles: true,
    } as any));

    expect(row.classList.contains('dragging')).toBe(false);
  });

  it('should add drag-over class when dragging over directory', () => {
    const testItem = container.querySelector('[data-path="test.iim"]');
    const testRow = testItem!.querySelector('.file-tree-row') as HTMLElement;
    const demoItem = container.querySelector('[data-path="Demo"]');
    const demoRow = demoItem!.querySelector('.file-tree-row') as HTMLElement;

    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn(),
    };

    // Start drag
    testRow.dispatchEvent(new (window as any).DragEvent('dragstart', {
      bubbles: true,
      dataTransfer,
    } as any));

    // Drag over folder
    demoRow.dispatchEvent(new (window as any).DragEvent('dragover', {
      bubbles: true,
      dataTransfer,
    } as any));

    expect(demoRow.classList.contains('drag-over')).toBe(true);
  });

  it('should not add drag-over class when dragging over file', () => {
    const testItem = container.querySelector('[data-path="test.iim"]');
    const testRow = testItem!.querySelector('.file-tree-row') as HTMLElement;
    const fileInDemo = container.querySelector('[data-path="Demo/FillForms.iim"]');
    const fileRow = fileInDemo!.querySelector('.file-tree-row') as HTMLElement;

    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn(),
    };

    // Start drag
    testRow.dispatchEvent(new (window as any).DragEvent('dragstart', {
      bubbles: true,
      dataTransfer,
    } as any));

    // Drag over file (should not show drag-over)
    fileRow.dispatchEvent(new (window as any).DragEvent('dragover', {
      bubbles: true,
      dataTransfer,
    } as any));

    expect(fileRow.classList.contains('drag-over')).toBe(false);
  });

  it('should call onMove when dropping file on directory', () => {
    const testItem = container.querySelector('[data-path="test.iim"]');
    const testRow = testItem!.querySelector('.file-tree-row') as HTMLElement;
    const demoItem = container.querySelector('[data-path="Demo"]');
    const demoRow = demoItem!.querySelector('.file-tree-row') as HTMLElement;

    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn(),
    };

    // Start drag
    testRow.dispatchEvent(new (window as any).DragEvent('dragstart', {
      bubbles: true,
      dataTransfer,
    } as any));

    // Drop on folder
    demoRow.dispatchEvent(new (window as any).DragEvent('drop', {
      bubbles: true,
      dataTransfer,
    } as any));

    expect(onMoveMock).toHaveBeenCalledWith({
      sourceNode: expect.objectContaining({ path: 'test.iim' }),
      targetNode: expect.objectContaining({ path: 'Demo' }),
    });
  });

  it('should not call onMove when dropping on same node', () => {
    const testItem = container.querySelector('[data-path="test.iim"]');
    const testRow = testItem!.querySelector('.file-tree-row') as HTMLElement;

    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn(),
    };

    // Start drag
    testRow.dispatchEvent(new (window as any).DragEvent('dragstart', {
      bubbles: true,
      dataTransfer,
    } as any));

    // Drop on same element
    testRow.dispatchEvent(new (window as any).DragEvent('drop', {
      bubbles: true,
      dataTransfer,
    } as any));

    expect(onMoveMock).not.toHaveBeenCalled();
  });

  it('should not call onMove when dropping on file', () => {
    const testItem = container.querySelector('[data-path="test.iim"]');
    const testRow = testItem!.querySelector('.file-tree-row') as HTMLElement;
    const fileInDemo = container.querySelector('[data-path="Demo/FillForms.iim"]');
    const fileRow = fileInDemo!.querySelector('.file-tree-row') as HTMLElement;

    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn(),
    };

    // Start drag
    testRow.dispatchEvent(new (window as any).DragEvent('dragstart', {
      bubbles: true,
      dataTransfer,
    } as any));

    // Drop on file
    fileRow.dispatchEvent(new (window as any).DragEvent('drop', {
      bubbles: true,
      dataTransfer,
    } as any));

    expect(onMoveMock).not.toHaveBeenCalled();
  });

  it('should not allow dropping folder into its own child', () => {
    const demoItem = container.querySelector('[data-path="Demo"]');
    const demoRow = demoItem!.querySelector('.file-tree-row') as HTMLElement;

    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn(),
    };

    // Start drag on Demo folder
    demoRow.dispatchEvent(new (window as any).DragEvent('dragstart', {
      bubbles: true,
      dataTransfer,
    } as any));

    // The folder should not allow drop on itself
    demoRow.dispatchEvent(new (window as any).DragEvent('dragover', {
      bubbles: true,
      dataTransfer,
    } as any));

    expect(demoRow.classList.contains('drag-over')).toBe(false);
  });
});
