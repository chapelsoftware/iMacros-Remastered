/**
 * Security Warning Dialog Component
 * A modal dialog that warns users when running macros from untrusted sources
 *
 * Features:
 * - Shows origin information (URL, domain, type)
 * - Option to trust the source site
 * - Run once or cancel options
 */

import { MacroSource, MacroOrigin } from '@shared/security';

/**
 * Security warning dialog options
 */
export interface SecurityWarningDialogOptions {
  /** Information about the macro source */
  source: MacroSource;
  /** Name of the macro being run */
  macroName?: string;
  /** Reason for the warning */
  reason?: string;
}

/**
 * Security warning dialog result
 */
export interface SecurityWarningDialogResult {
  /** User's decision */
  action: 'run' | 'trust-and-run' | 'cancel';
  /** If trust-and-run, the domain to trust */
  trustedDomain?: string;
}

/**
 * SecurityWarningDialog class - modal dialog for security warnings
 */
export class SecurityWarningDialog {
  private overlay: HTMLElement | null = null;
  private dialog: HTMLElement | null = null;
  private resolvePromise: ((result: SecurityWarningDialogResult) => void) | null = null;
  private source: MacroSource | null = null;
  private trustCheckbox: HTMLInputElement | null = null;

  /**
   * Show the security warning dialog
   */
  show(options: SecurityWarningDialogOptions): Promise<SecurityWarningDialogResult> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.source = options.source;
      this.createDialog(options);
    });
  }

  /**
   * Get a human-readable description of the macro origin
   */
  private getOriginDescription(origin: MacroOrigin): string {
    switch (origin) {
      case 'local':
        return 'Local File';
      case 'url':
        return 'Downloaded from URL';
      case 'shared':
        return 'Shared via Link';
      case 'embedded':
        return 'Embedded in URL';
      case 'unknown':
      default:
        return 'Unknown Source';
    }
  }

  /**
   * Get the icon for the warning based on origin
   */
  private getWarningIcon(): string {
    return `
      <svg class="security-warning-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }

  /**
   * Create and display the dialog
   */
  private createDialog(options: SecurityWarningDialogOptions): void {
    const { source, macroName, reason } = options;

    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'security-warning-overlay';
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.cancel();
      }
    });

    // Create dialog container
    this.dialog = document.createElement('div');
    this.dialog.className = 'security-warning-dialog';
    this.dialog.setAttribute('role', 'alertdialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.setAttribute('aria-labelledby', 'security-warning-title');
    this.dialog.setAttribute('aria-describedby', 'security-warning-description');

    // Header with icon and title
    const header = document.createElement('div');
    header.className = 'security-warning-header';

    const iconContainer = document.createElement('div');
    iconContainer.className = 'security-warning-icon-container';
    iconContainer.innerHTML = this.getWarningIcon();
    header.appendChild(iconContainer);

    const title = document.createElement('h2');
    title.className = 'security-warning-title';
    title.id = 'security-warning-title';
    title.textContent = 'Security Warning';
    header.appendChild(title);

    this.dialog.appendChild(header);

    // Description
    const description = document.createElement('div');
    description.className = 'security-warning-description';
    description.id = 'security-warning-description';
    description.textContent = 'You are about to run a macro from an untrusted source. Please review the details below before proceeding.';
    this.dialog.appendChild(description);

    // Content - macro details
    const content = document.createElement('div');
    content.className = 'security-warning-content';

    // Macro name
    if (macroName) {
      const nameRow = this.createInfoRow('Macro:', macroName);
      content.appendChild(nameRow);
    }

    // Origin type
    const originRow = this.createInfoRow('Source Type:', this.getOriginDescription(source.origin));
    content.appendChild(originRow);

    // Domain/Location
    if (source.domain) {
      const domainRow = this.createInfoRow('Domain:', source.domain);
      content.appendChild(domainRow);
    } else if (source.location && source.origin !== 'local') {
      const locationRow = this.createInfoRow('Location:', this.truncateLocation(source.location));
      locationRow.title = source.location;
      content.appendChild(locationRow);
    }

    // Reason
    if (reason) {
      const reasonRow = this.createInfoRow('Reason:', reason);
      reasonRow.className += ' security-warning-reason';
      content.appendChild(reasonRow);
    }

    this.dialog.appendChild(content);

    // Trust option (only if there's a domain to trust)
    if (source.domain) {
      const trustGroup = document.createElement('div');
      trustGroup.className = 'security-warning-trust-group';

      this.trustCheckbox = document.createElement('input');
      this.trustCheckbox.type = 'checkbox';
      this.trustCheckbox.id = 'security-warning-trust';
      this.trustCheckbox.className = 'security-warning-checkbox';
      trustGroup.appendChild(this.trustCheckbox);

      const trustLabel = document.createElement('label');
      trustLabel.className = 'security-warning-trust-label';
      trustLabel.htmlFor = 'security-warning-trust';
      trustLabel.textContent = `Always trust macros from ${source.domain}`;
      trustGroup.appendChild(trustLabel);

      this.dialog.appendChild(trustGroup);
    }

    // Buttons
    const buttons = document.createElement('div');
    buttons.className = 'security-warning-buttons';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'security-warning-btn security-warning-btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => this.cancel());
    buttons.appendChild(cancelBtn);

    const runBtn = document.createElement('button');
    runBtn.type = 'button';
    runBtn.className = 'security-warning-btn security-warning-btn-run';
    runBtn.textContent = 'Run Macro';
    runBtn.addEventListener('click', () => this.run());
    buttons.appendChild(runBtn);

    this.dialog.appendChild(buttons);

    // Add to DOM
    this.overlay.appendChild(this.dialog);
    document.body.appendChild(this.overlay);

    // Focus cancel button (safer default)
    cancelBtn.focus();

    // Handle keyboard events
    this.dialog.addEventListener('keydown', (e) => this.handleKeydown(e));
  }

  /**
   * Create an info row element
   */
  private createInfoRow(label: string, value: string): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'security-warning-info-row';

    const labelEl = document.createElement('span');
    labelEl.className = 'security-warning-info-label';
    labelEl.textContent = label;
    row.appendChild(labelEl);

    const valueEl = document.createElement('span');
    valueEl.className = 'security-warning-info-value';
    valueEl.textContent = value;
    row.appendChild(valueEl);

    return row;
  }

  /**
   * Truncate a long location string
   */
  private truncateLocation(location: string, maxLength: number = 50): string {
    if (location.length <= maxLength) {
      return location;
    }
    return location.substring(0, maxLength - 3) + '...';
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
      this.run();
    }
  }

  /**
   * Run the macro (with or without trusting)
   */
  private run(): void {
    const shouldTrust = this.trustCheckbox?.checked && this.source?.domain;

    this.close({
      action: shouldTrust ? 'trust-and-run' : 'run',
      trustedDomain: shouldTrust ? this.source!.domain : undefined,
    });
  }

  /**
   * Cancel and close the dialog
   */
  private cancel(): void {
    this.close({ action: 'cancel' });
  }

  /**
   * Close the dialog and clean up
   */
  private close(result: SecurityWarningDialogResult): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    this.dialog = null;
    this.trustCheckbox = null;
    this.source = null;

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
 * Show a security warning dialog - convenience function
 */
export function showSecurityWarningDialog(
  options: SecurityWarningDialogOptions
): Promise<SecurityWarningDialogResult> {
  const dialog = new SecurityWarningDialog();
  return dialog.show(options);
}
