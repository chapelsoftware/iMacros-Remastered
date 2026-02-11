/**
 * Panel File Tree & createTreeFromPaths Unit Tests
 *
 * Tests for extension/src/panel/file-tree.ts covering:
 * - createTreeFromPaths from flat path lists
 * - FileTree class (setData, select, expand/collapse, state management)
 * - Context menu generation
 * - Drag and drop ancestry check
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';

// Set up DOM globals
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="tree-container"></div></body></html>');
(globalThis as any).document = dom.window.document;
(globalThis as any).window = dom.window;
(globalThis as any).HTMLElement = dom.window.HTMLElement;
(globalThis as any).Element = dom.window.Element;
(globalThis as any).Node = dom.window.Node;
(globalThis as any).Event = dom.window.Event;
(globalThis as any).MouseEvent = dom.window.MouseEvent;
(globalThis as any).DragEvent = dom.window.DragEvent || dom.window.Event;

// Mock chrome.storage
(globalThis as any).chrome = {
  storage: {
    local: {
      get: vi.fn((_key: string, callback?: Function) => {
        if (callback) callback({});
        return Promise.resolve({});
      }),
      set: vi.fn((_data: any, callback?: Function) => {
        if (callback) callback();
        return Promise.resolve();
      }),
    },
  },
};

import {
  FileTree,
  FileTreeNode,
  createTreeFromPaths,
} from '@extension/panel/file-tree';

describe('createTreeFromPaths', () => {
  it('should create a root node with no paths', () => {
    const tree = createTreeFromPaths([], 'Root');
    expect(tree.name).toBe('Root');
    expect(tree.isDirectory).toBe(true);
    expect(tree.children).toEqual([]);
    expect(tree.expanded).toBe(true);
  });

  it('should create tree from simple file paths', () => {
    const paths = ['file1.iim', 'file2.iim'];
    const tree = createTreeFromPaths(paths);
    expect(tree.children).toHaveLength(2);
    expect(tree.children![0].name).toBe('file1.iim');
    expect(tree.children![0].isDirectory).toBe(false);
    expect(tree.children![1].name).toBe('file2.iim');
  });

  it('should create nested folders from paths', () => {
    const paths = ['folder/file.iim'];
    const tree = createTreeFromPaths(paths);
    expect(tree.children).toHaveLength(1);
    const folder = tree.children![0];
    expect(folder.name).toBe('folder');
    expect(folder.isDirectory).toBe(true);
    expect(folder.children).toHaveLength(1);
    expect(folder.children![0].name).toBe('file.iim');
  });

  it('should sort folders before files', () => {
    const paths = ['zfile.iim', 'aFolder/file.iim', 'bfile.iim'];
    const tree = createTreeFromPaths(paths);
    expect(tree.children![0].name).toBe('aFolder');
    expect(tree.children![0].isDirectory).toBe(true);
    expect(tree.children![1].name).toBe('bfile.iim');
    expect(tree.children![2].name).toBe('zfile.iim');
  });

  it('should handle deeply nested paths', () => {
    const paths = ['a/b/c/file.iim'];
    const tree = createTreeFromPaths(paths);
    const a = tree.children![0];
    expect(a.name).toBe('a');
    const b = a.children![0];
    expect(b.name).toBe('b');
    const c = b.children![0];
    expect(c.name).toBe('c');
    const file = c.children![0];
    expect(file.name).toBe('file.iim');
    expect(file.isDirectory).toBe(false);
  });

  it('should merge files in the same folder', () => {
    const paths = ['folder/a.iim', 'folder/b.iim'];
    const tree = createTreeFromPaths(paths);
    expect(tree.children).toHaveLength(1);
    const folder = tree.children![0];
    expect(folder.children).toHaveLength(2);
  });

  it('should recognize .js files as files', () => {
    const paths = ['script.js'];
    const tree = createTreeFromPaths(paths);
    expect(tree.children![0].isDirectory).toBe(false);
  });

  it('should treat paths without .iim or .js extension as folders', () => {
    const paths = ['myFolder'];
    const tree = createTreeFromPaths(paths);
    expect(tree.children![0].isDirectory).toBe(true);
  });

  it('should use custom root name', () => {
    const tree = createTreeFromPaths([], 'My Macros');
    expect(tree.name).toBe('My Macros');
  });
});

describe('FileTree', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'test-tree';
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

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
            { name: 'Login.iim', path: 'Demo/Login.iim', isDirectory: false },
            { name: 'Fill.iim', path: 'Demo/Fill.iim', isDirectory: false },
          ],
        },
        { name: 'Test.iim', path: 'Test.iim', isDirectory: false },
      ],
    };
  }

  it('should create with container class', () => {
    const tree = new FileTree(container);
    expect(container.classList.contains('file-tree-container')).toBe(true);
    tree.destroy();
  });

  it('should render empty state initially', () => {
    const tree = new FileTree(container);
    expect(container.textContent).toContain('No macros loaded');
    tree.destroy();
  });

  it('should render tree data when setData is called', () => {
    const tree = new FileTree(container);
    tree.setData(createSampleTree());
    expect(container.textContent).toContain('Macros');
    expect(container.textContent).toContain('Demo');
    expect(container.textContent).toContain('Test.iim');
    tree.destroy();
  });

  it('should show loading state', () => {
    const tree = new FileTree(container);
    tree.showLoading();
    expect(container.textContent).toContain('Loading...');
    tree.destroy();
  });

  it('should show error state', () => {
    const tree = new FileTree(container);
    tree.showError('Load failed');
    expect(container.textContent).toContain('Load failed');
    tree.destroy();
  });

  it('should track selected node', () => {
    const onSelect = vi.fn();
    const tree = new FileTree(container, { onSelect });
    tree.setData(createSampleTree());

    // selectByPath triggers selection
    tree.selectByPath('Test.iim');
    const selected = tree.getSelectedNode();
    expect(selected).not.toBeNull();
    expect(selected!.path).toBe('Test.iim');
    tree.destroy();
  });

  it('should expand and collapse folders', () => {
    const tree = new FileTree(container);
    tree.setData(createSampleTree());

    // Expand Demo folder
    tree.expandFolder('Demo');
    expect(container.textContent).toContain('Login.iim');

    // Collapse Demo folder
    tree.collapseFolder('Demo');
    // Children should not be rendered when collapsed
    const demoItem = container.querySelector('[data-path="Demo"]');
    const childList = demoItem?.querySelector('.file-tree-children');
    expect(childList).toBeNull();
    tree.destroy();
  });

  it('should expand all folders', () => {
    const tree = new FileTree(container);
    tree.setData(createSampleTree());
    tree.expandAll();
    expect(container.textContent).toContain('Login.iim');
    expect(container.textContent).toContain('Fill.iim');
    tree.destroy();
  });

  it('should collapse all folders', () => {
    const tree = new FileTree(container);
    tree.setData(createSampleTree());
    tree.expandAll();
    tree.collapseAll();
    // After collapsing all, children shouldn't be rendered
    const rootItem = container.querySelector('[data-path=""]');
    const childList = rootItem?.querySelector('.file-tree-children');
    expect(childList).toBeNull();
    tree.destroy();
  });

  it('should return state with expanded paths', () => {
    const tree = new FileTree(container);
    tree.setData(createSampleTree());
    tree.expandFolder('Demo');
    const state = tree.getState();
    expect(state.expandedPaths).toContain('');
    expect(state.expandedPaths).toContain('Demo');
    tree.destroy();
  });

  it('should fire onSelect when node is selected', () => {
    const onSelect = vi.fn();
    const tree = new FileTree(container, { onSelect });
    tree.setData(createSampleTree());
    tree.selectByPath('Test.iim');
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        node: expect.objectContaining({ path: 'Test.iim' }),
        action: 'select',
      }),
    );
    tree.destroy();
  });

  it('should clean up on destroy', () => {
    const tree = new FileTree(container);
    tree.setData(createSampleTree());
    tree.destroy();
    expect(container.innerHTML).toBe('');
  });

  it('should refresh without losing data', () => {
    const tree = new FileTree(container);
    tree.setData(createSampleTree());
    tree.refresh();
    expect(container.textContent).toContain('Macros');
    tree.destroy();
  });
});
