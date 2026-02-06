/**
 * Trusted Sites Dialog Component
 * A modal dialog for managing the list of trusted sites for macro execution
 *
 * Features:
 * - View list of trusted sites
 * - Add new trusted sites (with wildcard support)
 * - Remove trusted sites
 * - Edit notes for trusted sites
 */

import {
  TrustedSite,
  addTrustedSite,
  removeTrustedSite,
  isValidDomainPattern,
} from '@shared/security';

/**
 * Trusted sites dialog options
 */
export interface TrustedSitesDialogOptions {
  /** Current list of trusted sites */
  trustedSites: TrustedSite[];
}

/**
 * Trusted sites dialog result
 */
export interface TrustedSitesDialogResult {
  /** Whether changes were saved */
  saved: boolean;
  /** Updated list of trusted sites (if saved) */
  trustedSites?: TrustedSite[];
}

/**
 * TrustedSitesDialog class - modal dialog for managing trusted sites
 */
export class TrustedSitesDialog {
  private overlay: HTMLElement | null = null;
  private dialog: HTMLElement | null = null;
  private listContainer: HTMLElement | null = null;
  private addInput: HTMLInputElement | null = null;
  private errorMessage: HTMLElement | null = null;
  private resolvePromise: ((result: TrustedSitesDialogResult) => void) | null = null;
  private trustedSites: TrustedSite[] = [];

  /**
   * Show the trusted sites dialog
   */
  show(options: TrustedSitesDialogOptions): Promise<TrustedSitesDialogResult> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.trustedSites = [...options.trustedSites];
      this.createDialog();
    });
  }

  /**
   * Create and display the dialog
   */
  private createDialog(): void {
    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'trusted-sites-overlay';
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.cancel();
      }
    });

    // Create dialog container
    this.dialog = document.createElement('div');
    this.dialog.className = 'trusted-sites-dialog';
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.setAttribute('aria-labelledby', 'trusted-sites-title');

    // Title
    const title = document.createElement('h2');
    title.className = 'trusted-sites-title';
    title.id = 'trusted-sites-title';
    title.textContent = 'Trusted Sites';
    this.dialog.appendChild(title);

    // Description
    const description = document.createElement('p');
    description.className = 'trusted-sites-description';
    description.textContent = 'Macros from trusted sites will run without security warnings. Use wildcard patterns (e.g., *.example.com) to trust all subdomains.';
    this.dialog.appendChild(description);

    // Add site form
    const addForm = document.createElement('div');
    addForm.className = 'trusted-sites-add-form';

    this.addInput = document.createElement('input');
    this.addInput.type = 'text';
    this.addInput.className = 'trusted-sites-add-input';
    this.addInput.placeholder = 'Enter domain (e.g., example.com or *.example.com)';
    this.addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.addSite();
      }
    });
    addForm.appendChild(this.addInput);

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'trusted-sites-add-btn';
    addBtn.textContent = 'Add';
    addBtn.addEventListener('click', () => this.addSite());
    addForm.appendChild(addBtn);

    this.dialog.appendChild(addForm);

    // Error message
    this.errorMessage = document.createElement('div');
    this.errorMessage.className = 'trusted-sites-error hidden';
    this.dialog.appendChild(this.errorMessage);

    // Sites list container
    this.listContainer = document.createElement('div');
    this.listContainer.className = 'trusted-sites-list';
    this.dialog.appendChild(this.listContainer);

    this.renderSitesList();

    // Buttons
    const buttons = document.createElement('div');
    buttons.className = 'trusted-sites-buttons';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'trusted-sites-btn trusted-sites-btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => this.cancel());
    buttons.appendChild(cancelBtn);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'trusted-sites-btn trusted-sites-btn-save';
    saveBtn.textContent = 'Save Changes';
    saveBtn.addEventListener('click', () => this.save());
    buttons.appendChild(saveBtn);

    this.dialog.appendChild(buttons);

    // Add to DOM
    this.overlay.appendChild(this.dialog);
    document.body.appendChild(this.overlay);

    // Focus add input
    this.addInput.focus();

    // Handle keyboard events
    this.dialog.addEventListener('keydown', (e) => this.handleKeydown(e));
  }

  /**
   * Render the list of trusted sites
   */
  private renderSitesList(): void {
    if (!this.listContainer) return;

    this.listContainer.innerHTML = '';

    if (this.trustedSites.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'trusted-sites-empty';
      emptyMessage.textContent = 'No trusted sites configured. Add a domain above to get started.';
      this.listContainer.appendChild(emptyMessage);
      return;
    }

    // Sort by domain
    const sortedSites = [...this.trustedSites].sort((a, b) =>
      a.domain.localeCompare(b.domain)
    );

    for (const site of sortedSites) {
      const siteItem = this.createSiteItem(site);
      this.listContainer.appendChild(siteItem);
    }
  }

  /**
   * Create a site list item
   */
  private createSiteItem(site: TrustedSite): HTMLElement {
    const item = document.createElement('div');
    item.className = 'trusted-sites-item';

    const info = document.createElement('div');
    info.className = 'trusted-sites-item-info';

    const domain = document.createElement('span');
    domain.className = 'trusted-sites-item-domain';
    domain.textContent = site.domain;
    info.appendChild(domain);

    if (site.note) {
      const note = document.createElement('span');
      note.className = 'trusted-sites-item-note';
      note.textContent = site.note;
      info.appendChild(note);
    }

    const date = document.createElement('span');
    date.className = 'trusted-sites-item-date';
    date.textContent = `Added ${this.formatDate(site.trustedAt)}`;
    info.appendChild(date);

    item.appendChild(info);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'trusted-sites-item-remove';
    removeBtn.title = 'Remove trusted site';
    removeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    removeBtn.addEventListener('click', () => this.removeSite(site.domain));
    item.appendChild(removeBtn);

    return item;
  }

  /**
   * Format a timestamp as a readable date
   */
  private formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  /**
   * Add a new site
   */
  private addSite(): void {
    const domain = this.addInput?.value.trim();
    if (!domain) {
      this.showError('Please enter a domain');
      return;
    }

    if (!isValidDomainPattern(domain)) {
      this.showError('Invalid domain format. Use format like "example.com" or "*.example.com"');
      return;
    }

    // Check if already exists
    const normalizedDomain = domain.toLowerCase();
    if (this.trustedSites.some(s => s.domain === normalizedDomain)) {
      this.showError('This domain is already trusted');
      return;
    }

    this.trustedSites = addTrustedSite(domain, this.trustedSites);
    this.renderSitesList();

    // Clear input and error
    if (this.addInput) {
      this.addInput.value = '';
      this.addInput.focus();
    }
    this.hideError();
  }

  /**
   * Remove a site
   */
  private removeSite(domain: string): void {
    this.trustedSites = removeTrustedSite(domain, this.trustedSites);
    this.renderSitesList();
    this.hideError();
  }

  /**
   * Show an error message
   */
  private showError(message: string): void {
    if (this.errorMessage) {
      this.errorMessage.textContent = message;
      this.errorMessage.classList.remove('hidden');
    }
  }

  /**
   * Hide the error message
   */
  private hideError(): void {
    if (this.errorMessage) {
      this.errorMessage.classList.add('hidden');
    }
  }

  /**
   * Handle keyboard events
   */
  private handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.cancel();
    }
  }

  /**
   * Save changes and close
   */
  private save(): void {
    this.close({
      saved: true,
      trustedSites: this.trustedSites,
    });
  }

  /**
   * Cancel and close
   */
  private cancel(): void {
    this.close({ saved: false });
  }

  /**
   * Close the dialog and clean up
   */
  private close(result: TrustedSitesDialogResult): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    this.dialog = null;
    this.listContainer = null;
    this.addInput = null;
    this.errorMessage = null;

    if (this.resolvePromise) {
      this.resolvePromise(result);
      this.resolvePromise = null;
    }
  }

  /**
   * Check if the dialog is open
   */
  isOpen(): boolean {
    return this.overlay !== null;
  }
}

/**
 * Show a trusted sites dialog - convenience function
 */
export function showTrustedSitesDialog(
  options: TrustedSitesDialogOptions
): Promise<TrustedSitesDialogResult> {
  const dialog = new TrustedSitesDialog();
  return dialog.show(options);
}
