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
  action: 'play' | 'edit' | 'delete' | 'rename';
  x: number;
  y: number;
}

/**
 * File tree options
 */
export interface FileTreeOptions {
  onSelect?: (event: FileTreeSelectionEvent) => void;
  onContextMenu?: (event: FileTreeContextMenuEvent) => void;
  onRefresh?: () => void;
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

  constructor(container: HTMLElement, options: FileTreeOptions = {}) {
    this.container = container;
    this.options = options;
    this.init();
  }

  /**
   * Initialize the file tree component
   */
  private init(): void {
    this.container.classList.add('file-tree-container');
    this.container.innerHTML = `
      <div class="file-tree-header">
        <span class="file-tree-title">Macros</span>
        <button class="file-tree-refresh" title="Refresh">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.65 2.35A8 8 0 1 0 16 8h-2a6 6 0 1 1-1.76-4.24L10 6h6V0l-2.35 2.35z"/>
          </svg>
        </button>
      </div>
      <div class="file-tree-content">
        <div class="file-tree-empty">No macros loaded</div>
      </div>
    `;

    // Setup refresh button
    const refreshBtn = this.container.querySelector('.file-tree-refresh');
    refreshBtn?.addEventListener('click', () => {
      this.options.onRefresh?.();
    });

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
    this.root = root;
    this.render();
  }

  /**
   * Render the file tree
   */
  private render(): void {
    const content = this.container.querySelector('.file-tree-content');
    if (!content) return;

    if (!this.root || !this.root.children || this.root.children.length === 0) {
      content.innerHTML = '<div class="file-tree-empty">No macros available</div>';
      return;
    }

    content.innerHTML = '';
    const ul = document.createElement('ul');
    ul.className = 'file-tree-list';

    this.renderNodes(this.root.children, ul);
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
      div.addEventListener('click', () => {
        this.hideContextMenu();
        if (item.action === 'refresh') {
          this.options.onRefresh?.();
        } else {
          this.options.onContextMenu?.({
            node,
            action: item.action,
            x,
            y
          });
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
   * Expand a folder by path
   */
  expandFolder(path: string): void {
    const node = this.findNodeByPath(path);
    if (node && node.isDirectory) {
      node.expanded = true;
      this.render();
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
    }
  }

  /**
   * Expand all folders
   */
  expandAll(): void {
    if (this.root) {
      this.expandNodeRecursive(this.root);
      this.render();
    }
  }

  /**
   * Collapse all folders
   */
  collapseAll(): void {
    if (this.root) {
      this.collapseNodeRecursive(this.root);
      this.render();
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

  for (const path of paths) {
    const parts = path.split('/').filter(p => p);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join('/');

      let child = current.children?.find(c => c.name === part);

      if (!child) {
        child = {
          name: part,
          path: currentPath,
          isDirectory: !isLast,
          children: isLast ? undefined : [],
          expanded: false
        };
        current.children?.push(child);
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
