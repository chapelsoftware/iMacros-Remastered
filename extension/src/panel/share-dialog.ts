/**
 * Share Dialog Component
 * A modal dialog for sharing macros via URL or email
 *
 * Features:
 * - Generated imacros:// URL for the macro
 * - Base64-encoded macro content option for self-contained sharing
 * - Copy URL to clipboard button
 * - Email share button (opens mailto: link with macro URL)
 */

/**
 * Share dialog options
 */
export interface ShareDialogOptions {
  /** Macro name (displayed in dialog) */
  macroName?: string;
  /** Macro path (relative path in macros folder) */
  macroPath?: string;
  /** Macro content (for base64 encoding option) */
  macroContent?: string;
}

/**
 * Share dialog result
 */
export interface ShareDialogResult {
  /** Whether the dialog was closed via an action (not escape/cancel) */
  confirmed: boolean;
  /** Action taken: 'copy', 'email', or 'close' */
  action?: 'copy' | 'email' | 'close';
  /** The URL that was shared */
  url?: string;
}

/**
 * ShareDialog class - modal dialog for sharing macros
 */
export class ShareDialog {
  private overlay: HTMLElement | null = null;
  private dialog: HTMLElement | null = null;
  private urlInput: HTMLInputElement | null = null;
  private embedCheckbox: HTMLInputElement | null = null;
  private resolvePromise: ((result: ShareDialogResult) => void) | null = null;
  private macroPath: string = '';
  private macroName: string = '';
  private macroContent: string = '';

  /**
   * Show the share dialog and return a promise that resolves when dialog is closed
   */
  show(options: ShareDialogOptions = {}): Promise<ShareDialogResult> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.macroPath = options.macroPath || '';
      this.macroName = options.macroName || this.extractMacroName(options.macroPath || '');
      this.macroContent = options.macroContent || '';
      this.createDialog();
    });
  }

  /**
   * Extract macro name from path (removes folder and extension)
   */
  private extractMacroName(path: string): string {
    if (!path) return 'Macro';
    const parts = path.split('/');
    const filename = parts[parts.length - 1];
    // Remove .iim extension
    return filename.replace(/\.iim$/i, '') || 'Macro';
  }

  /**
   * Create and display the dialog
   */
  private createDialog(): void {
    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'share-dialog-overlay';
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close({ confirmed: false, action: 'close' });
      }
    });

    // Create dialog container
    this.dialog = document.createElement('div');
    this.dialog.className = 'share-dialog';
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.setAttribute('aria-labelledby', 'share-dialog-title');

    // Dialog title
    const title = document.createElement('div');
    title.className = 'share-dialog-title';
    title.id = 'share-dialog-title';
    title.textContent = 'Share Macro';
    this.dialog.appendChild(title);

    // Dialog content
    const content = document.createElement('div');
    content.className = 'share-dialog-content';

    // Macro name display
    const nameGroup = document.createElement('div');
    nameGroup.className = 'share-dialog-field';

    const nameLabel = document.createElement('label');
    nameLabel.className = 'share-dialog-label';
    nameLabel.textContent = 'Sharing:';
    nameGroup.appendChild(nameLabel);

    const nameValue = document.createElement('div');
    nameValue.className = 'share-dialog-macro-name';
    nameValue.textContent = this.macroName;
    nameGroup.appendChild(nameValue);

    content.appendChild(nameGroup);

    // URL field
    const urlGroup = document.createElement('div');
    urlGroup.className = 'share-dialog-field';

    const urlLabel = document.createElement('label');
    urlLabel.className = 'share-dialog-label';
    urlLabel.htmlFor = 'share-dialog-url';
    urlLabel.textContent = 'Macro URL:';
    urlGroup.appendChild(urlLabel);

    this.urlInput = document.createElement('input');
    this.urlInput.type = 'text';
    this.urlInput.id = 'share-dialog-url';
    this.urlInput.className = 'share-dialog-url-input';
    this.urlInput.readOnly = true;
    this.urlInput.value = this.generateUrl(false);
    urlGroup.appendChild(this.urlInput);

    content.appendChild(urlGroup);

    // Embed content checkbox (only show if we have macro content)
    if (this.macroContent) {
      const embedGroup = document.createElement('div');
      embedGroup.className = 'share-dialog-field share-dialog-checkbox-field';

      this.embedCheckbox = document.createElement('input');
      this.embedCheckbox.type = 'checkbox';
      this.embedCheckbox.id = 'share-dialog-embed';
      this.embedCheckbox.className = 'share-dialog-checkbox';
      this.embedCheckbox.checked = false;
      embedGroup.appendChild(this.embedCheckbox);

      const embedLabel = document.createElement('label');
      embedLabel.className = 'share-dialog-checkbox-label';
      embedLabel.htmlFor = 'share-dialog-embed';
      embedLabel.textContent = 'Embed macro content in URL (self-contained)';
      embedGroup.appendChild(embedLabel);

      content.appendChild(embedGroup);

      // Toggle URL when checkbox changes
      this.embedCheckbox.addEventListener('change', () => {
        if (this.urlInput) {
          this.urlInput.value = this.generateUrl(this.embedCheckbox?.checked || false);
        }
      });

      // Embed description
      const embedDesc = document.createElement('div');
      embedDesc.className = 'share-dialog-description';
      embedDesc.textContent = 'When embedded, the URL contains the full macro script. Recipients can run it without having the macro file.';
      content.appendChild(embedDesc);
    }

    this.dialog.appendChild(content);

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'share-dialog-actions';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'share-dialog-btn share-dialog-btn-primary';
    copyBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4 2a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V2zm2-1a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V2a1 1 0 00-1-1H6z"/>
        <path d="M2 6a2 2 0 012-2v1a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1h1a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
      </svg>
      Copy URL
    `;
    copyBtn.addEventListener('click', () => this.copyUrl());
    actions.appendChild(copyBtn);

    const emailBtn = document.createElement('button');
    emailBtn.type = 'button';
    emailBtn.className = 'share-dialog-btn share-dialog-btn-secondary';
    emailBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M0 4a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H2a2 2 0 01-2-2V4zm2-1a1 1 0 00-1 1v.217l7 4.2 7-4.2V4a1 1 0 00-1-1H2zm13 2.383l-4.758 2.855L15 11.114v-5.73zm-.034 6.878L9.271 8.82 8 9.583 6.728 8.82l-5.694 3.44A1 1 0 002 13h12a1 1 0 00.966-.739zM1 11.114l4.758-2.876L1 5.383v5.73z"/>
      </svg>
      Email
    `;
    emailBtn.addEventListener('click', () => this.emailShare());
    actions.appendChild(emailBtn);

    this.dialog.appendChild(actions);

    // Dialog buttons
    const buttons = document.createElement('div');
    buttons.className = 'share-dialog-buttons';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'share-dialog-btn share-dialog-btn-close';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => this.close({ confirmed: false, action: 'close' }));
    buttons.appendChild(closeBtn);

    this.dialog.appendChild(buttons);

    // Add to DOM
    this.overlay.appendChild(this.dialog);
    document.body.appendChild(this.overlay);

    // Select URL text for easy copying
    this.urlInput.focus();
    this.urlInput.select();

    // Handle keyboard events
    this.dialog.addEventListener('keydown', (e) => this.handleKeydown(e));
  }

  /**
   * Generate the share URL
   * @param embedContent Whether to embed the macro content in the URL
   */
  generateUrl(embedContent: boolean): string {
    if (embedContent && this.macroContent) {
      // Base64 encode the macro content for self-contained sharing
      const encodedContent = this.base64Encode(this.macroContent);
      const encodedName = encodeURIComponent(this.macroName);
      return `imacros://run?name=${encodedName}&content=${encodedContent}`;
    } else {
      // Simple path-based URL
      const encodedPath = encodeURIComponent(this.macroPath);
      return `imacros://run/${encodedPath}`;
    }
  }

  /**
   * Base64 encode a string (handles Unicode properly)
   */
  private base64Encode(str: string): string {
    // Use TextEncoder for proper Unicode handling
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Handle keyboard events
   */
  private handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close({ confirmed: false, action: 'close' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.copyUrl();
    }
  }

  /**
   * Copy URL to clipboard
   */
  private async copyUrl(): Promise<void> {
    const url = this.urlInput?.value || '';

    try {
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback to execCommand for older browsers
        if (this.urlInput) {
          this.urlInput.select();
          document.execCommand('copy');
        }
      }

      // Visual feedback - change button text temporarily
      const copyBtn = this.dialog?.querySelector('.share-dialog-btn-primary');
      if (copyBtn) {
        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.854 3.646a.5.5 0 010 .708l-7 7a.5.5 0 01-.708 0l-3.5-3.5a.5.5 0 11.708-.708L6.5 10.293l6.646-6.647a.5.5 0 01.708 0z"/>
          </svg>
          Copied!
        `;
        setTimeout(() => {
          copyBtn.innerHTML = originalHTML;
        }, 2000);
      }

      this.close({ confirmed: true, action: 'copy', url });
    } catch (error) {
      console.error('Failed to copy URL:', error);
      // Don't close dialog on copy failure
    }
  }

  /**
   * Open email client with pre-filled message
   */
  private emailShare(): void {
    const url = this.urlInput?.value || '';
    const subject = encodeURIComponent(`iMacros: ${this.macroName}`);
    const body = encodeURIComponent(
      `Hi,\n\nI wanted to share this iMacros macro with you:\n\n${this.macroName}\n\nClick the link below to run it:\n${url}\n\nBest regards`
    );

    const mailtoUrl = `mailto:?subject=${subject}&body=${body}`;
    window.open(mailtoUrl, '_self');

    this.close({ confirmed: true, action: 'email', url });
  }

  /**
   * Close the dialog and clean up
   */
  private close(result: ShareDialogResult): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    this.dialog = null;
    this.urlInput = null;
    this.embedCheckbox = null;

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
 * Create and show a share dialog - convenience function
 */
export function showShareDialog(options: ShareDialogOptions = {}): Promise<ShareDialogResult> {
  const dialog = new ShareDialog();
  return dialog.show(options);
}
