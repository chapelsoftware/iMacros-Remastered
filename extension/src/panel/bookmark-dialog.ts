/**
 * Bookmark Dialog Component
 * A modal dialog for creating browser bookmarks for macros
 *
 * Features:
 * - Bookmark name (defaults to macro name)
 * - Folder selection from browser bookmarks
 * - Option to create as bookmarklet (javascript: URL) or imacros:// URL
 */

/**
 * Bookmark folder node for folder selection
 */
export interface BookmarkFolderNode {
  id: string;
  title: string;
  parentId?: string;
  children?: BookmarkFolderNode[];
}

/**
 * Bookmark dialog options
 */
export interface BookmarkDialogOptions {
  /** Macro name (used as default bookmark name) */
  macroName?: string;
  /** Macro path (relative path in macros folder) */
  macroPath?: string;
  /** Available bookmark folders */
  folders?: BookmarkFolderNode[];
  /** Default folder ID */
  defaultFolderId?: string;
  /** Whether to default to bookmarklet mode */
  defaultBookmarklet?: boolean;
}

/**
 * Bookmark dialog result
 */
export interface BookmarkDialogResult {
  /** Whether the action was confirmed (true) or cancelled (false) */
  confirmed: boolean;
  /** Bookmark name */
  name?: string;
  /** Selected folder ID */
  folderId?: string;
  /** Whether to create as bookmarklet */
  isBookmarklet?: boolean;
  /** Generated URL for the bookmark */
  url?: string;
}

/**
 * BookmarkDialog class - modal dialog for creating bookmarks
 */
export class BookmarkDialog {
  private overlay: HTMLElement | null = null;
  private dialog: HTMLElement | null = null;
  private nameInput: HTMLInputElement | null = null;
  private folderSelect: HTMLSelectElement | null = null;
  private bookmarkletCheckbox: HTMLInputElement | null = null;
  private resolvePromise: ((result: BookmarkDialogResult) => void) | null = null;
  private folders: BookmarkFolderNode[] = [];
  private macroPath: string = '';

  /**
   * Show the bookmark dialog and return a promise that resolves when dialog is closed
   */
  show(options: BookmarkDialogOptions = {}): Promise<BookmarkDialogResult> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.folders = options.folders || [];
      this.macroPath = options.macroPath || '';
      this.createDialog(options);
    });
  }

  /**
   * Create and display the dialog
   */
  private createDialog(options: BookmarkDialogOptions): void {
    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'bookmark-dialog-overlay';
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.cancel();
      }
    });

    // Create dialog container
    this.dialog = document.createElement('div');
    this.dialog.className = 'bookmark-dialog';
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.setAttribute('aria-labelledby', 'bookmark-dialog-title');

    // Dialog title
    const title = document.createElement('div');
    title.className = 'bookmark-dialog-title';
    title.id = 'bookmark-dialog-title';
    title.textContent = 'Create Bookmark';
    this.dialog.appendChild(title);

    // Dialog content
    const content = document.createElement('div');
    content.className = 'bookmark-dialog-content';

    // Name field
    const nameGroup = document.createElement('div');
    nameGroup.className = 'bookmark-dialog-field';

    const nameLabel = document.createElement('label');
    nameLabel.className = 'bookmark-dialog-label';
    nameLabel.htmlFor = 'bookmark-dialog-name';
    nameLabel.textContent = 'Bookmark Name:';
    nameGroup.appendChild(nameLabel);

    this.nameInput = document.createElement('input');
    this.nameInput.type = 'text';
    this.nameInput.id = 'bookmark-dialog-name';
    this.nameInput.className = 'bookmark-dialog-input';
    this.nameInput.placeholder = 'Enter bookmark name';
    this.nameInput.value = options.macroName || this.extractMacroName(options.macroPath || '');
    nameGroup.appendChild(this.nameInput);

    content.appendChild(nameGroup);

    // Folder field
    const folderGroup = document.createElement('div');
    folderGroup.className = 'bookmark-dialog-field';

    const folderLabel = document.createElement('label');
    folderLabel.className = 'bookmark-dialog-label';
    folderLabel.htmlFor = 'bookmark-dialog-folder';
    folderLabel.textContent = 'Save in folder:';
    folderGroup.appendChild(folderLabel);

    this.folderSelect = document.createElement('select');
    this.folderSelect.id = 'bookmark-dialog-folder';
    this.folderSelect.className = 'bookmark-dialog-select';

    // Add folder options
    this.addFolderOptions(this.folders, '', options.defaultFolderId);

    folderGroup.appendChild(this.folderSelect);
    content.appendChild(folderGroup);

    // Bookmarklet checkbox
    const bookmarkletGroup = document.createElement('div');
    bookmarkletGroup.className = 'bookmark-dialog-field bookmark-dialog-checkbox-field';

    this.bookmarkletCheckbox = document.createElement('input');
    this.bookmarkletCheckbox.type = 'checkbox';
    this.bookmarkletCheckbox.id = 'bookmark-dialog-bookmarklet';
    this.bookmarkletCheckbox.className = 'bookmark-dialog-checkbox';
    this.bookmarkletCheckbox.checked = options.defaultBookmarklet || false;
    bookmarkletGroup.appendChild(this.bookmarkletCheckbox);

    const bookmarkletLabel = document.createElement('label');
    bookmarkletLabel.className = 'bookmark-dialog-checkbox-label';
    bookmarkletLabel.htmlFor = 'bookmark-dialog-bookmarklet';
    bookmarkletLabel.textContent = 'Create as bookmarklet (runs macro on current page)';
    bookmarkletGroup.appendChild(bookmarkletLabel);

    content.appendChild(bookmarkletGroup);

    // Description of bookmark types
    const description = document.createElement('div');
    description.className = 'bookmark-dialog-description';
    description.innerHTML = `
      <strong>Regular bookmark:</strong> Opens iMacros and runs the macro.<br>
      <strong>Bookmarklet:</strong> Runs the macro directly on the current page.
    `;
    content.appendChild(description);

    this.dialog.appendChild(content);

    // Dialog buttons
    const buttons = document.createElement('div');
    buttons.className = 'bookmark-dialog-buttons';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'bookmark-dialog-btn bookmark-dialog-btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => this.cancel());
    buttons.appendChild(cancelBtn);

    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'bookmark-dialog-btn bookmark-dialog-btn-create';
    createBtn.textContent = 'Create Bookmark';
    createBtn.addEventListener('click', () => this.create());
    buttons.appendChild(createBtn);

    this.dialog.appendChild(buttons);

    // Add to DOM
    this.overlay.appendChild(this.dialog);
    document.body.appendChild(this.overlay);

    // Focus name input and select text
    this.nameInput.focus();
    this.nameInput.select();

    // Handle keyboard events
    this.dialog.addEventListener('keydown', (e) => this.handleKeydown(e));
  }

  /**
   * Extract macro name from path (removes folder and extension)
   */
  private extractMacroName(path: string): string {
    if (!path) return '';
    const parts = path.split('/');
    const filename = parts[parts.length - 1];
    // Remove .iim extension
    return filename.replace(/\.iim$/i, '');
  }

  /**
   * Add folder options recursively to the select element
   */
  private addFolderOptions(
    nodes: BookmarkFolderNode[],
    prefix: string,
    defaultFolderId?: string
  ): void {
    for (const node of nodes) {
      const option = document.createElement('option');
      option.value = node.id;
      option.textContent = prefix + node.title;
      if (node.id === defaultFolderId) {
        option.selected = true;
      }
      this.folderSelect?.appendChild(option);

      // Add children with increased indent
      if (node.children && node.children.length > 0) {
        this.addFolderOptions(node.children, prefix + '  ', defaultFolderId);
      }
    }
  }

  /**
   * Handle keyboard events
   */
  private handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.cancel();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.create();
    }
  }

  /**
   * Generate the bookmark URL based on settings
   */
  private generateUrl(isBookmarklet: boolean): string {
    if (isBookmarklet) {
      // Generate bookmarklet (javascript: URL that triggers macro execution)
      const macroPath = encodeURIComponent(this.macroPath);
      // Bookmarklet sends a message to the iMacros extension to run the macro
      return `javascript:(function(){` +
        `var ext=chrome.runtime||browser.runtime;` +
        `if(ext&&ext.sendMessage){` +
        `ext.sendMessage({type:'PLAY_MACRO',payload:{path:'${macroPath}'}});` +
        `}else{` +
        `window.location='imacros://run/${macroPath}';` +
        `}` +
        `})();`;
    } else {
      // Generate imacros:// protocol URL
      const macroPath = encodeURIComponent(this.macroPath);
      return `imacros://run/${macroPath}`;
    }
  }

  /**
   * Create bookmark and close the dialog
   */
  private create(): void {
    const name = this.nameInput?.value.trim() || '';

    if (!name) {
      this.nameInput?.focus();
      return;
    }

    const folderId = this.folderSelect?.value || '';
    const isBookmarklet = this.bookmarkletCheckbox?.checked || false;
    const url = this.generateUrl(isBookmarklet);

    this.close({
      confirmed: true,
      name,
      folderId,
      isBookmarklet,
      url,
    });
  }

  /**
   * Cancel and close the dialog
   */
  private cancel(): void {
    this.close({ confirmed: false });
  }

  /**
   * Close the dialog and clean up
   */
  private close(result: BookmarkDialogResult): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    this.dialog = null;
    this.nameInput = null;
    this.folderSelect = null;
    this.bookmarkletCheckbox = null;

    if (this.resolvePromise) {
      this.resolvePromise(result);
      this.resolvePromise = null;
    }
  }

  /**
   * Check if the dialog is currently open
   */
  isOpen(): boolean {
    return this.overlay !== null;
  }
}

/**
 * Get bookmark folders from chrome.bookmarks API
 * Returns a flattened tree of bookmark folders
 */
export async function getBookmarkFolders(): Promise<BookmarkFolderNode[]> {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.bookmarks) {
      chrome.bookmarks.getTree((tree) => {
        if (chrome.runtime.lastError) {
          console.error('Failed to get bookmark folders:', chrome.runtime.lastError);
          resolve(getDefaultFolders());
          return;
        }

        const folders = extractFolders(tree);
        resolve(folders);
      });
    } else {
      // Fallback for non-extension environment
      resolve(getDefaultFolders());
    }
  });
}

/**
 * Extract folders from bookmark tree nodes
 */
function extractFolders(nodes: chrome.bookmarks.BookmarkTreeNode[]): BookmarkFolderNode[] {
  const result: BookmarkFolderNode[] = [];

  for (const node of nodes) {
    // Only include folders (nodes with children array, not url)
    if (node.children) {
      const folder: BookmarkFolderNode = {
        id: node.id,
        title: node.title || 'Bookmarks',
        parentId: node.parentId,
        children: extractFolders(node.children),
      };
      result.push(folder);
    }
  }

  return result;
}

/**
 * Get default folders when chrome.bookmarks is not available
 */
function getDefaultFolders(): BookmarkFolderNode[] {
  return [
    { id: '1', title: 'Bookmarks Bar', children: [] },
    { id: '2', title: 'Other Bookmarks', children: [] },
  ];
}

/**
 * Create a bookmark using chrome.bookmarks API
 */
export async function createBookmark(
  name: string,
  url: string,
  parentId?: string
): Promise<{ success: boolean; bookmarkId?: string; error?: string }> {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.bookmarks) {
      const bookmarkDetails: chrome.bookmarks.BookmarkCreateArg = {
        title: name,
        url: url,
      };

      if (parentId) {
        bookmarkDetails.parentId = parentId;
      }

      chrome.bookmarks.create(bookmarkDetails, (bookmark) => {
        if (chrome.runtime.lastError) {
          resolve({
            success: false,
            error: chrome.runtime.lastError.message,
          });
        } else {
          resolve({
            success: true,
            bookmarkId: bookmark.id,
          });
        }
      });
    } else {
      resolve({
        success: false,
        error: 'Bookmarks API not available',
      });
    }
  });
}

/**
 * Create and show a bookmark dialog - convenience function
 */
export function showBookmarkDialog(
  options: BookmarkDialogOptions = {}
): Promise<BookmarkDialogResult> {
  const dialog = new BookmarkDialog();
  return dialog.show(options);
}

/**
 * Full bookmark creation flow:
 * 1. Get bookmark folders
 * 2. Show dialog
 * 3. Create bookmark if confirmed
 */
export async function createMacroBookmark(
  macroPath: string,
  macroName?: string
): Promise<{ success: boolean; bookmarkId?: string; error?: string; cancelled?: boolean }> {
  try {
    // Get available bookmark folders
    const folders = await getBookmarkFolders();

    // Show dialog
    const result = await showBookmarkDialog({
      macroPath,
      macroName: macroName || undefined,
      folders,
      defaultFolderId: '1', // Default to Bookmarks Bar
    });

    // Check if cancelled
    if (!result.confirmed) {
      return { success: false, cancelled: true };
    }

    // Create the bookmark
    const bookmarkResult = await createBookmark(
      result.name!,
      result.url!,
      result.folderId
    );

    return bookmarkResult;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
