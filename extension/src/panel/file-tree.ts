/**
 * File tree component for displaying macro directory structure
 */

/**
 * File tree node representing a file or folder
 */
export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileTreeNode[];
  expanded?: boolean;
}

/**
 * File tree selection event
 */
export interface FileTreeSelectionEvent {
  node: FileTreeNode;
  action: 'select' | 'play' | 'edit';
}

/**
 * File tree context menu event
 */
export interface FileTreeContextMenuEvent {
  node: FileTreeNode;
  action: 'play' | 'edit' | 'delete' | 'rename' | 'newFolder';
  x: number;
  y: number;
}

/**
 * File tree move event (for drag & drop)
 */
export interface FileTreeMoveEvent {
  sourceNode: FileTreeNode;
  targetNode: FileTreeNode;
}

/**
 * Persisted file tree state
 */
export interface FileTreeState {
  expandedPaths: string[];
  selectedPath: string | null;
}

/**
 * File tree options
 */
export interface FileTreeOptions {
  onSelect?: (event: FileTreeSelectionEvent) => void;
  onContextMenu?: (event: FileTreeContextMenuEvent) => void;
  onMove?: (event: FileTreeMoveEvent) => void;
  onCreateFolder?: (parentPath: string, folderName: string) => Promise<boolean>;
  onRename?: (oldPath: string, newName: string) => Promise<boolean>;
  onDelete?: (node: FileTreeNode) => Promise<boolean>;
  onRefresh?: () => void;
  storageKey?: string;
}

/**
 * File tree component class
 */
export class FileTree {
  private container: HTMLElement;
  private root: FileTreeNode | null = null;
  private selectedNode: FileTreeNode | null = null;
  private options: FileTreeOptions;
  private contextMenu: HTMLElement | null = null;
  private contextMenuNode: FileTreeNode | null = null;
  private draggedNode: FileTreeNode | null = null;
  private dragOverElement: HTMLElement | null = null;
  private storageKey: string;
  private pendingStateRestore: FileTreeState | null = null;

  constructor(container: HTMLElement, options: FileTreeOptions = {}) {
    this.container = container;
    this.options = options;
    this.storageKey = options.storageKey || 'fileTree';
    this.init();
    this.loadState();
  }

  /**
   * Initialize the file tree component
   */
  private init(): void {
    this.container.classList.add('file-tree-container');
    this.container.innerHTML = `
      <div class="file-tree-content">
        <div class="file-tree-empty">No macros loaded</div>
      </div>
    `;

    // Setup global click handler to close context menu
    document.addEventListener('click', (e) => {
      if (this.contextMenu && !this.contextMenu.contains(e.target as Node)) {
        this.hideContextMenu();
      }
    });
  }

  /**
   * Set the root data for the tree
   */
  setData(root: FileTreeNode): void {
    // Preserve current state before replacing tree
    const currentState = this.root ? this.getState() : null;

    this.root = root;

    // Apply pending state from storage (initial load) or current state (refresh)
    if (this.pendingStateRestore) {
      this.applyPendingState();
    } else if (currentState) {
      // Reapply the current expanded paths to the new tree
      for (const path of currentState.expandedPaths) {
        const node = this.findNodeByPath(path);
        if (node && node.isDirectory) {
          node.expanded = true;
        }
      }
      // Restore selection
      if (currentState.selectedPath) {
        const node = this.findNodeByPath(currentState.selectedPath);
        if (node) {
          this.selectedNode = node;
        }
      }
    }

    this.render();
  }

  /**
   * Render the file tree
   */
  private render(): void {
    const content = this.container.querySelector('.file-tree-content');
    if (!content) return;

    if (!this.root) {
      content.innerHTML = '<div class="file-tree-empty">No macros available</div>';
      return;
    }

    content.innerHTML = '';
    const ul = document.createElement('ul');
    ul.className = 'file-tree-list';

    // Render the root folder itself so users can right-click on it
    const rootLi = this.createNodeElement(this.root);
    ul.appendChild(rootLi);
    content.appendChild(ul);
  }

  /**
   * Render a list of nodes
   */
  private renderNodes(nodes: FileTreeNode[], parent: HTMLElement): void {
    for (const node of nodes) {
      const li = this.createNodeElement(node);
      parent.appendChild(li);
    }
  }

  /**
   * Create a DOM element for a tree node
   */
  private createNodeElement(node: FileTreeNode): HTMLElement {
    const li = document.createElement('li');
    li.className = 'file-tree-item';
    li.dataset.path = node.path;

    const row = document.createElement('div');
    row.className = 'file-tree-row';
    if (this.selectedNode?.path === node.path) {
      row.classList.add('selected');
    }

    // Arrow for folders
    const arrow = document.createElement('span');
    arrow.className = 'file-tree-arrow';
    if (node.isDirectory) {
      arrow.innerHTML = node.expanded
        ? '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>'
        : '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
      arrow.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleFolder(node);
      });
    } else {
      arrow.classList.add('hidden');
    }
    row.appendChild(arrow);

    // Icon
    const icon = document.createElement('span');
    icon.className = 'file-tree-icon';
    if (node.isDirectory) {
      icon.innerHTML = node.expanded
        ? '<svg width="16" height="16" viewBox="0 0 16 16" fill="#dcb67a"><path d="M1 3h6l1 1h7v10H1V3z"/><path d="M1 5h14v8H1z" fill="#f5deb3"/></svg>'
        : '<svg width="16" height="16" viewBox="0 0 16 16" fill="#dcb67a"><path d="M1 3h6l1 1h7v10H1V3z"/></svg>';
    } else {
      const ext = node.name.split('.').pop()?.toLowerCase();
      if (ext === 'iim') {
        icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="1" width="12" height="14" rx="1" fill="#4a90d9"/><text x="8" y="10" text-anchor="middle" font-size="5" fill="white" font-weight="bold">iim</text></svg>';
      } else if (ext === 'js') {
        icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="1" width="12" height="14" rx="1" fill="#f7df1e"/><text x="8" y="11" text-anchor="middle" font-size="6" fill="#323330" font-weight="bold">JS</text></svg>';
      } else {
        icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="#999"><path d="M3 1h7l3 3v11H3V1z"/><path d="M10 1v3h3" fill="#ccc"/></svg>';
      }
    }
    row.appendChild(icon);

    // Name
    const name = document.createElement('span');
    name.className = 'file-tree-name';
    name.textContent = node.name;
    row.appendChild(name);

    // Event handlers
    row.addEventListener('click', () => {
      this.selectNode(node);
    });

    row.addEventListener('dblclick', () => {
      if (node.isDirectory) {
        this.toggleFolder(node);
      } else {
        this.options.onSelect?.({
          node,
          action: 'play'
        });
      }
    });

    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showContextMenu(node, e.clientX, e.clientY);
    });

    // Drag & drop support
    row.setAttribute('draggable', 'true');

    row.addEventListener('dragstart', (e) => {
      this.draggedNode = node;
      row.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', node.path);
      }
    });

    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      this.draggedNode = null;
      if (this.dragOverElement) {
        this.dragOverElement.classList.remove('drag-over');
        this.dragOverElement = null;
      }
    });

    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!this.draggedNode || this.draggedNode === node) return;

      // Only allow dropping on directories
      if (!node.isDirectory) return;

      // Prevent dropping a folder into itself or its children
      if (this.isDescendant(this.draggedNode, node)) return;

      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }

      // Update visual feedback
      if (this.dragOverElement && this.dragOverElement !== row) {
        this.dragOverElement.classList.remove('drag-over');
      }
      row.classList.add('drag-over');
      this.dragOverElement = row;
    });

    row.addEventListener('dragleave', (e) => {
      // Only remove if we're actually leaving the element
      const relatedTarget = e.relatedTarget as HTMLElement | null;
      if (!row.contains(relatedTarget)) {
        row.classList.remove('drag-over');
        if (this.dragOverElement === row) {
          this.dragOverElement = null;
        }
      }
    });

    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('drag-over');

      if (!this.draggedNode || this.draggedNode === node) return;
      if (!node.isDirectory) return;
      if (this.isDescendant(this.draggedNode, node)) return;

      // Fire move event
      this.options.onMove?.({
        sourceNode: this.draggedNode,
        targetNode: node,
      });

      this.draggedNode = null;
      this.dragOverElement = null;
    });

    li.appendChild(row);

    // Children for expanded folders
    if (node.isDirectory && node.expanded && node.children && node.children.length > 0) {
      const childUl = document.createElement('ul');
      childUl.className = 'file-tree-children';
      this.renderNodes(node.children, childUl);
      li.appendChild(childUl);
    }

    return li;
  }

  /**
   * Select a node
   */
  private selectNode(node: FileTreeNode): void {
    this.selectedNode = node;
    this.render();
    this.saveState();
    this.options.onSelect?.({
      node,
      action: 'select'
    });
  }

  /**
   * Toggle folder expand/collapse
   */
  private toggleFolder(node: FileTreeNode): void {
    if (!node.isDirectory) return;
    node.expanded = !node.expanded;
    this.render();
    this.saveState();
  }

  /**
   * Show context menu for a node
   */
  private showContextMenu(node: FileTreeNode, x: number, y: number): void {
    this.hideContextMenu();
    this.contextMenuNode = node;

    const menu = document.createElement('div');
    menu.className = 'file-tree-context-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    const items = node.isDirectory
      ? [
          { label: 'New Folder', action: 'newFolder' as const },
          { label: 'Rename', action: 'rename' as const },
          { label: 'Delete', action: 'delete' as const },
          { label: 'Refresh', action: 'refresh' as const },
        ]
      : [
          { label: 'Play', action: 'play' as const },
          { label: 'Edit', action: 'edit' as const },
          { label: 'Rename', action: 'rename' as const },
          { label: 'Delete', action: 'delete' as const },
        ];

    for (const item of items) {
      const div = document.createElement('div');
      div.className = 'file-tree-context-item';
      div.textContent = item.label;
      div.addEventListener('click', async () => {
        this.hideContextMenu();
        if (item.action === 'refresh') {
          this.options.onRefresh?.();
        } else if (item.action === 'newFolder') {
          this.startInlineNewFolder(node);
        } else if (item.action === 'rename') {
          this.startInlineRename(node);
        } else if (item.action === 'delete') {
          if (this.options.onDelete) {
            const success = await this.options.onDelete(node);
            if (success) this.options.onRefresh?.();
          } else {
            this.options.onContextMenu?.({ node, action: item.action, x, y });
          }
        } else {
          this.options.onContextMenu?.({ node, action: item.action, x, y });
        }
      });
      menu.appendChild(div);
    }

    document.body.appendChild(menu);
    this.contextMenu = menu;

    // Adjust position if menu goes off screen
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${y - rect.height}px`;
    }
  }

  /**
   * Hide the context menu
   */
  private hideContextMenu(): void {
    if (this.contextMenu) {
      this.contextMenu.remove();
      this.contextMenu = null;
      this.contextMenuNode = null;
    }
  }

  /**
   * Start inline editing for a new folder
   */
  private startInlineNewFolder(parentNode: FileTreeNode): void {
    // Expand parent if not already
    if (parentNode.isDirectory && !parentNode.expanded) {
      parentNode.expanded = true;
    }

    // Find the parent element in DOM
    const parentItem = this.container.querySelector(`[data-path="${parentNode.path}"]`);
    if (!parentItem) return;

    // Find or create the children container
    let childrenUl = parentItem.querySelector(':scope > .file-tree-children') as HTMLElement;
    if (!childrenUl) {
      childrenUl = document.createElement('ul');
      childrenUl.className = 'file-tree-children';
      parentItem.appendChild(childrenUl);
    }

    // Create temporary folder item with input
    const tempLi = document.createElement('li');
    tempLi.className = 'file-tree-item file-tree-new-item';
    tempLi.innerHTML = `
      <div class="file-tree-row">
        <span class="file-tree-arrow hidden"></span>
        <span class="file-tree-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="#dcb67a"><path d="M1 3h6l1 1h7v10H1V3z"/></svg>
        </span>
        <input type="text" class="file-tree-inline-input" placeholder="New Folder" />
      </div>
    `;

    // Insert at the beginning of children
    childrenUl.insertBefore(tempLi, childrenUl.firstChild);

    const input = tempLi.querySelector('input') as HTMLInputElement;
    input.focus();
    input.select();

    const cleanup = () => {
      tempLi.remove();
      // Remove empty children container
      if (childrenUl.children.length === 0) {
        childrenUl.remove();
      }
    };

    const confirm = async () => {
      const name = input.value.trim();
      if (name && this.options.onCreateFolder) {
        const success = await this.options.onCreateFolder(parentNode.path, name);
        if (success) {
          this.options.onRefresh?.();
        } else {
          cleanup();
        }
      } else {
        cleanup();
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirm();
      } else if (e.key === 'Escape') {
        cleanup();
      }
    });

    input.addEventListener('blur', () => {
      // Small delay to allow click events to fire first
      setTimeout(() => {
        if (document.activeElement !== input) {
          cleanup();
        }
      }, 100);
    });
  }

  /**
   * Start inline rename for a node
   */
  private startInlineRename(node: FileTreeNode): void {
    const item = this.container.querySelector(`[data-path="${node.path}"]`);
    if (!item) return;

    const nameSpan = item.querySelector('.file-tree-name') as HTMLElement;
    if (!nameSpan) return;

    const originalName = node.name;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'file-tree-inline-input';
    input.value = originalName;

    nameSpan.replaceWith(input);
    input.focus();

    // Select name without extension for files
    if (!node.isDirectory) {
      const dotIndex = originalName.lastIndexOf('.');
      if (dotIndex > 0) {
        input.setSelectionRange(0, dotIndex);
      } else {
        input.select();
      }
    } else {
      input.select();
    }

    const cleanup = () => {
      const newSpan = document.createElement('span');
      newSpan.className = 'file-tree-name';
      newSpan.textContent = originalName;
      input.replaceWith(newSpan);
    };

    const confirm = async () => {
      const newName = input.value.trim();
      if (newName && newName !== originalName && this.options.onRename) {
        const success = await this.options.onRename(node.path, newName);
        if (success) {
          this.options.onRefresh?.();
        } else {
          cleanup();
        }
      } else {
        cleanup();
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirm();
      } else if (e.key === 'Escape') {
        cleanup();
      }
    });

    input.addEventListener('blur', () => {
      setTimeout(() => {
        if (document.activeElement !== input) {
          confirm();
        }
      }, 100);
    });
  }

  /**
   * Expand a folder by path
   */
  expandFolder(path: string): void {
    const node = this.findNodeByPath(path);
    if (node && node.isDirectory) {
      node.expanded = true;
      this.render();
      this.saveState();
    }
  }

  /**
   * Collapse a folder by path
   */
  collapseFolder(path: string): void {
    const node = this.findNodeByPath(path);
    if (node && node.isDirectory) {
      node.expanded = false;
      this.render();
      this.saveState();
    }
  }

  /**
   * Expand all folders
   */
  expandAll(): void {
    if (this.root) {
      this.expandNodeRecursive(this.root);
      this.render();
      this.saveState();
    }
  }

  /**
   * Collapse all folders
   */
  collapseAll(): void {
    if (this.root) {
      this.collapseNodeRecursive(this.root);
      this.render();
      this.saveState();
    }
  }

  /**
   * Recursively expand a node and its children
   */
  private expandNodeRecursive(node: FileTreeNode): void {
    if (node.isDirectory) {
      node.expanded = true;
      node.children?.forEach(child => this.expandNodeRecursive(child));
    }
  }

  /**
   * Recursively collapse a node and its children
   */
  private collapseNodeRecursive(node: FileTreeNode): void {
    if (node.isDirectory) {
      node.expanded = false;
      node.children?.forEach(child => this.collapseNodeRecursive(child));
    }
  }

  /**
   * Find a node by its path
   */
  private findNodeByPath(path: string, node?: FileTreeNode): FileTreeNode | null {
    if (!node) {
      if (!this.root) return null;
      node = this.root;
    }

    if (node.path === path) {
      return node;
    }

    if (node.children) {
      for (const child of node.children) {
        const found = this.findNodeByPath(path, child);
        if (found) return found;
      }
    }

    return null;
  }

  /**
   * Check if a node is a descendant of another (prevents dropping folder into itself)
   */
  private isDescendant(parent: FileTreeNode, potentialChild: FileTreeNode): boolean {
    if (!parent.isDirectory || !parent.children) return false;

    for (const child of parent.children) {
      if (child.path === potentialChild.path) return true;
      if (child.isDirectory && this.isDescendant(child, potentialChild)) return true;
    }

    return false;
  }

  /**
   * Get the currently selected node
   */
  getSelectedNode(): FileTreeNode | null {
    return this.selectedNode;
  }

  /**
   * Select a node by path
   */
  selectByPath(path: string): void {
    const node = this.findNodeByPath(path);
    if (node) {
      this.selectNode(node);
    }
  }

  /**
   * Refresh the tree display
   */
  refresh(): void {
    this.render();
  }

  /**
   * Show loading state
   */
  showLoading(): void {
    const content = this.container.querySelector('.file-tree-content');
    if (content) {
      content.innerHTML = '<div class="file-tree-loading">Loading...</div>';
    }
  }

  /**
   * Show error state
   */
  showError(message: string): void {
    const content = this.container.querySelector('.file-tree-content');
    if (content) {
      content.innerHTML = `<div class="file-tree-error">${message}</div>`;
    }
  }

  /**
   * Destroy the component and clean up
   */
  destroy(): void {
    this.hideContextMenu();
    this.container.innerHTML = '';
  }

  /**
   * Load state from chrome.storage
   */
  private async loadState(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const result = await chrome.storage.local.get(this.storageKey);
        const state = result[this.storageKey] as FileTreeState | undefined;
        if (state) {
          this.pendingStateRestore = state;
        }
      }
    } catch (error) {
      console.warn('[FileTree] Failed to load state:', error);
    }
  }

  /**
   * Save current state to chrome.storage
   */
  private async saveState(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const state = this.getState();
        await chrome.storage.local.set({ [this.storageKey]: state });
      }
    } catch (error) {
      console.warn('[FileTree] Failed to save state:', error);
    }
  }

  /**
   * Get the current tree state
   */
  getState(): FileTreeState {
    const expandedPaths: string[] = [];

    if (this.root) {
      this.collectExpandedPaths(this.root, expandedPaths);
    }

    return {
      expandedPaths,
      selectedPath: this.selectedNode?.path || null,
    };
  }

  /**
   * Recursively collect expanded folder paths
   */
  private collectExpandedPaths(node: FileTreeNode, paths: string[]): void {
    if (node.isDirectory && node.expanded) {
      paths.push(node.path);
    }
    if (node.children) {
      for (const child of node.children) {
        this.collectExpandedPaths(child, paths);
      }
    }
  }

  /**
   * Apply pending state to the tree
   */
  private applyPendingState(): void {
    if (!this.pendingStateRestore || !this.root) return;

    const state = this.pendingStateRestore;
    this.pendingStateRestore = null;

    // Apply expanded paths
    for (const path of state.expandedPaths) {
      const node = this.findNodeByPath(path);
      if (node && node.isDirectory) {
        node.expanded = true;
      }
    }

    // Apply selection
    if (state.selectedPath) {
      const node = this.findNodeByPath(state.selectedPath);
      if (node) {
        this.selectedNode = node;
        // Scroll into view after render
        setTimeout(() => {
          const selectedRow = this.container.querySelector(`[data-path="${state.selectedPath}"] .file-tree-row.selected`);
          selectedRow?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }, 0);
      }
    }
  }
}

/**
 * Check if a path represents a file (has macro extension)
 */
function isFilePath(pathStr: string): boolean {
  const ext = pathStr.split('.').pop()?.toLowerCase();
  return ext === 'iim' || ext === 'js';
}

/**
 * Create a file tree from a flat list of file paths
 */
export function createTreeFromPaths(paths: string[], rootName: string = 'Macros'): FileTreeNode {
  const root: FileTreeNode = {
    name: rootName,
    path: '',
    isDirectory: true,
    children: [],
    expanded: true
  };

  for (const pathStr of paths) {
    const parts = pathStr.split('/').filter(p => p);
    let current = root;

    // Check if this entire path represents a file or folder
    const pathIsFile = isFilePath(pathStr);

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join('/');

      // A node is a directory if it's not the last part, OR if the entire path is a folder
      const isDirectory = !isLast || !pathIsFile;

      let child = current.children?.find(c => c.name === part);

      if (!child) {
        child = {
          name: part,
          path: currentPath,
          isDirectory,
          children: isDirectory ? [] : undefined,
          expanded: false
        };
        current.children?.push(child);
      } else if (isDirectory && !child.isDirectory) {
        // If we find an existing node that's a file but this path says it's a folder,
        // upgrade it to a folder (edge case: folder came before file in the list)
        child.isDirectory = true;
        child.children = child.children || [];
      }

      if (!isLast) {
        current = child;
      }
    }
  }

  // Sort children: folders first, then alphabetically
  sortTreeNodes(root);

  return root;
}

/**
 * Sort tree nodes recursively
 */
function sortTreeNodes(node: FileTreeNode): void {
  if (node.children) {
    node.children.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortTreeNodes);
  }
}
