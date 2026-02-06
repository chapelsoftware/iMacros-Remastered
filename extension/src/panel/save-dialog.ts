/**
 * Save Dialog Component
 * A modal dialog for saving recorded macros with filename, folder selection, and bookmark option
 */

import { FileTreeNode } from './file-tree';

/**
 * Save dialog options
 */
export interface SaveDialogOptions {
  /** Default filename (without extension) */
  defaultFilename?: string;
  /** Available folders from the file tree */
  folders?: FileTreeNode[];
  /** Default folder path */
  defaultFolder?: string;
  /** Whether to show the bookmark checkbox */
  showBookmark?: boolean;
  /** Default value for bookmark checkbox */
  defaultBookmark?: boolean;
}

/**
 * Save dialog result
 */
export interface SaveDialogResult {
  /** Whether the save was confirmed (true) or cancelled (false) */
  confirmed: boolean;
  /** Full filename (with extension) */
  filename?: string;
  /** Selected folder path */
  folder?: string;
  /** Full path (folder + filename) */
  path?: string;
  /** Whether to create a bookmark */
  createBookmark?: boolean;
}

/**
 * SaveDialog class - modal dialog for saving macros
 */
export class SaveDialog {
  private overlay: HTMLElement | null = null;
  private dialog: HTMLElement | null = null;
  private filenameInput: HTMLInputElement | null = null;
  private folderSelect: HTMLSelectElement | null = null;
  private bookmarkCheckbox: HTMLInputElement | null = null;
  private resolvePromise: ((result: SaveDialogResult) => void) | null = null;
  private folders: FileTreeNode[] = [];

  /**
   * Show the save dialog and return a promise that resolves when dialog is closed
   */
  show(options: SaveDialogOptions = {}): Promise<SaveDialogResult> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.folders = options.folders || [];
      this.createDialog(options);
    });
  }

  /**
   * Create and display the dialog
   */
  private createDialog(options: SaveDialogOptions): void {
    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'save-dialog-overlay';
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.cancel();
      }
    });

    // Create dialog container
    this.dialog = document.createElement('div');
    this.dialog.className = 'save-dialog';
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.setAttribute('aria-labelledby', 'save-dialog-title');

    // Dialog title
    const title = document.createElement('div');
    title.className = 'save-dialog-title';
    title.id = 'save-dialog-title';
    title.textContent = 'Save Macro';
    this.dialog.appendChild(title);

    // Dialog content
    const content = document.createElement('div');
    content.className = 'save-dialog-content';

    // Filename field
    const filenameGroup = document.createElement('div');
    filenameGroup.className = 'save-dialog-field';

    const filenameLabel = document.createElement('label');
    filenameLabel.className = 'save-dialog-label';
    filenameLabel.htmlFor = 'save-dialog-filename';
    filenameLabel.textContent = 'Filename:';
    filenameGroup.appendChild(filenameLabel);

    const filenameWrapper = document.createElement('div');
    filenameWrapper.className = 'save-dialog-filename-wrapper';

    this.filenameInput = document.createElement('input');
    this.filenameInput.type = 'text';
    this.filenameInput.id = 'save-dialog-filename';
    this.filenameInput.className = 'save-dialog-input';
    this.filenameInput.placeholder = 'Enter macro name';
    this.filenameInput.value = options.defaultFilename || this.generateDefaultFilename();
    filenameWrapper.appendChild(this.filenameInput);

    const extLabel = document.createElement('span');
    extLabel.className = 'save-dialog-ext';
    extLabel.textContent = '.iim';
    filenameWrapper.appendChild(extLabel);

    filenameGroup.appendChild(filenameWrapper);
    content.appendChild(filenameGroup);

    // Folder field
    const folderGroup = document.createElement('div');
    folderGroup.className = 'save-dialog-field';

    const folderLabel = document.createElement('label');
    folderLabel.className = 'save-dialog-label';
    folderLabel.htmlFor = 'save-dialog-folder';
    folderLabel.textContent = 'Save in folder:';
    folderGroup.appendChild(folderLabel);

    this.folderSelect = document.createElement('select');
    this.folderSelect.id = 'save-dialog-folder';
    this.folderSelect.className = 'save-dialog-select';

    // Add root option
    const rootOption = document.createElement('option');
    rootOption.value = '';
    rootOption.textContent = '/ (Root)';
    this.folderSelect.appendChild(rootOption);

    // Add folder options from file tree
    this.addFolderOptions(this.folders, '', options.defaultFolder);

    folderGroup.appendChild(this.folderSelect);
    content.appendChild(folderGroup);

    // Bookmark checkbox
    if (options.showBookmark !== false) {
      const bookmarkGroup = document.createElement('div');
      bookmarkGroup.className = 'save-dialog-field save-dialog-checkbox-field';

      this.bookmarkCheckbox = document.createElement('input');
      this.bookmarkCheckbox.type = 'checkbox';
      this.bookmarkCheckbox.id = 'save-dialog-bookmark';
      this.bookmarkCheckbox.className = 'save-dialog-checkbox';
      this.bookmarkCheckbox.checked = options.defaultBookmark || false;
      bookmarkGroup.appendChild(this.bookmarkCheckbox);

      const bookmarkLabel = document.createElement('label');
      bookmarkLabel.className = 'save-dialog-checkbox-label';
      bookmarkLabel.htmlFor = 'save-dialog-bookmark';
      bookmarkLabel.textContent = 'Create bookmark';
      bookmarkGroup.appendChild(bookmarkLabel);

      content.appendChild(bookmarkGroup);
    }

    this.dialog.appendChild(content);

    // Dialog buttons
    const buttons = document.createElement('div');
    buttons.className = 'save-dialog-buttons';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'save-dialog-btn save-dialog-btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => this.cancel());
    buttons.appendChild(cancelBtn);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'save-dialog-btn save-dialog-btn-save';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => this.save());
    buttons.appendChild(saveBtn);

    this.dialog.appendChild(buttons);

    // Add to DOM
    this.overlay.appendChild(this.dialog);
    document.body.appendChild(this.overlay);

    // Focus filename input and select text
    this.filenameInput.focus();
    this.filenameInput.select();

    // Handle keyboard events
    this.dialog.addEventListener('keydown', (e) => this.handleKeydown(e));
  }

  /**
   * Add folder options recursively to the select element
   */
  private addFolderOptions(
    nodes: FileTreeNode[],
    prefix: string,
    defaultFolder?: string
  ): void {
    for (const node of nodes) {
      if (node.isDirectory && node.path) {
        const option = document.createElement('option');
        option.value = node.path;
        option.textContent = prefix + node.name;
        if (node.path === defaultFolder) {
          option.selected = true;
        }
        this.folderSelect?.appendChild(option);

        // Add children with increased indent
        if (node.children && node.children.length > 0) {
          this.addFolderOptions(
            node.children.filter(c => c.isDirectory),
            prefix + '  ',
            defaultFolder
          );
        }
      }
    }
  }

  /**
   * Generate a default filename based on current date/time
   */
  private generateDefaultFilename(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `Recording_${year}${month}${day}_${hours}${minutes}`;
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
      this.save();
    }
  }

  /**
   * Save and close the dialog
   */
  private save(): void {
    const filename = this.filenameInput?.value.trim() || '';

    if (!filename) {
      this.filenameInput?.focus();
      return;
    }

    // Sanitize filename - remove invalid characters
    const sanitizedFilename = this.sanitizeFilename(filename);
    if (!sanitizedFilename) {
      this.filenameInput?.focus();
      return;
    }

    const folder = this.folderSelect?.value || '';
    const fullFilename = sanitizedFilename + '.iim';
    const path = folder ? `${folder}/${fullFilename}` : fullFilename;

    this.close({
      confirmed: true,
      filename: fullFilename,
      folder: folder,
      path: path,
      createBookmark: this.bookmarkCheckbox?.checked || false,
    });
  }

  /**
   * Sanitize filename by removing invalid characters
   */
  private sanitizeFilename(filename: string): string {
    // Remove characters that are invalid in filenames
    return filename
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '_')
      .trim();
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
  private close(result: SaveDialogResult): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    this.dialog = null;
    this.filenameInput = null;
    this.folderSelect = null;
    this.bookmarkCheckbox = null;

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

  /**
   * Get folders from a file tree node recursively
   */
  static getFoldersFromTree(node: FileTreeNode): FileTreeNode[] {
    const folders: FileTreeNode[] = [];

    if (node.children) {
      for (const child of node.children) {
        if (child.isDirectory) {
          folders.push(child);
          folders.push(...SaveDialog.getFoldersFromTree(child));
        }
      }
    }

    return folders;
  }
}

/**
 * Create and show a save dialog - convenience function
 */
export function showSaveDialog(options: SaveDialogOptions = {}): Promise<SaveDialogResult> {
  const dialog = new SaveDialog();
  return dialog.show(options);
}
