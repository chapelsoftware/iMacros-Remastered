/**
 * Recording Preferences Dialog Component
 * A modal dialog for configuring macro recording preferences including:
 * - Recording mode (conventional/event/XY/auto)
 * - Expert mode toggle
 * - Favor element IDs toggle
 */

/**
 * Recording mode types
 * - conventional: Basic TAG commands with element locators
 * - event: EVENT commands with mouse coordinates
 * - xy: Click coordinates only (X/Y position based)
 * - auto: Intelligent selection based on element type
 */
export type RecordingMode = 'conventional' | 'event' | 'xy' | 'auto';

/**
 * Recording preferences
 */
export interface RecordingPreferences {
  /** Recording mode to use */
  mode: RecordingMode;
  /** Whether expert mode is enabled (shows advanced options) */
  expertMode: boolean;
  /** Whether to favor element IDs over other locators */
  favorElementIds: boolean;
  /** Whether to record keyboard shortcuts (expert mode) */
  recordKeyboard: boolean;
  /** Whether to use text content for element identification (expert mode) */
  useTextContent: boolean;
}

/**
 * Default recording preferences
 */
export const DEFAULT_RECORDING_PREFERENCES: RecordingPreferences = {
  mode: 'conventional',
  expertMode: false,
  favorElementIds: true,
  recordKeyboard: false,
  useTextContent: true,
};

/**
 * Recording preferences dialog options
 */
export interface RecordingPrefsDialogOptions {
  /** Current preferences to show in the dialog */
  currentPreferences?: Partial<RecordingPreferences>;
}

/**
 * Recording preferences dialog result
 */
export interface RecordingPrefsDialogResult {
  /** Whether the save was confirmed (true) or cancelled (false) */
  confirmed: boolean;
  /** The selected preferences (only present if confirmed) */
  preferences?: RecordingPreferences;
}

/**
 * RecordingPrefsDialog class - modal dialog for recording preferences
 */
export class RecordingPrefsDialog {
  private overlay: HTMLElement | null = null;
  private dialog: HTMLElement | null = null;
  private modeSelect: HTMLSelectElement | null = null;
  private expertModeCheckbox: HTMLInputElement | null = null;
  private favorIdsCheckbox: HTMLInputElement | null = null;
  private recordKeyboardCheckbox: HTMLInputElement | null = null;
  private useTextContentCheckbox: HTMLInputElement | null = null;
  private expertOptions: HTMLElement | null = null;
  private resolvePromise: ((result: RecordingPrefsDialogResult) => void) | null = null;
  private currentPreferences: RecordingPreferences;

  constructor() {
    this.currentPreferences = { ...DEFAULT_RECORDING_PREFERENCES };
  }

  /**
   * Show the recording preferences dialog and return a promise that resolves when dialog is closed
   */
  show(options: RecordingPrefsDialogOptions = {}): Promise<RecordingPrefsDialogResult> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.currentPreferences = {
        ...DEFAULT_RECORDING_PREFERENCES,
        ...options.currentPreferences,
      };
      this.createDialog();
    });
  }

  /**
   * Create and display the dialog
   */
  private createDialog(): void {
    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'recording-prefs-dialog-overlay';
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.cancel();
      }
    });

    // Create dialog container
    this.dialog = document.createElement('div');
    this.dialog.className = 'recording-prefs-dialog';
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.setAttribute('aria-labelledby', 'recording-prefs-dialog-title');

    // Dialog title
    const title = document.createElement('div');
    title.className = 'recording-prefs-dialog-title';
    title.id = 'recording-prefs-dialog-title';
    title.textContent = 'Recording Options';
    this.dialog.appendChild(title);

    // Dialog content
    const content = document.createElement('div');
    content.className = 'recording-prefs-dialog-content';

    // Recording mode field
    const modeGroup = document.createElement('div');
    modeGroup.className = 'recording-prefs-dialog-field';

    const modeLabel = document.createElement('label');
    modeLabel.className = 'recording-prefs-dialog-label';
    modeLabel.htmlFor = 'recording-prefs-mode';
    modeLabel.textContent = 'Recording Mode:';
    modeGroup.appendChild(modeLabel);

    this.modeSelect = document.createElement('select');
    this.modeSelect.id = 'recording-prefs-mode';
    this.modeSelect.className = 'recording-prefs-dialog-select';

    const modes: { value: RecordingMode; label: string; description: string }[] = [
      { value: 'conventional', label: 'Conventional', description: 'Basic TAG commands' },
      { value: 'event', label: 'Event', description: 'EVENT commands with coordinates' },
      { value: 'xy', label: 'XY Position', description: 'Click coordinates only' },
      { value: 'auto', label: 'Auto', description: 'Intelligent selection' },
    ];

    for (const mode of modes) {
      const option = document.createElement('option');
      option.value = mode.value;
      option.textContent = `${mode.label} - ${mode.description}`;
      if (mode.value === this.currentPreferences.mode) {
        option.selected = true;
      }
      this.modeSelect.appendChild(option);
    }

    modeGroup.appendChild(this.modeSelect);
    content.appendChild(modeGroup);

    // Mode description
    const modeDesc = document.createElement('div');
    modeDesc.className = 'recording-prefs-dialog-description';
    modeDesc.id = 'mode-description';
    modeDesc.textContent = this.getModeDescription(this.currentPreferences.mode);
    content.appendChild(modeDesc);

    this.modeSelect.addEventListener('change', () => {
      const mode = this.modeSelect!.value as RecordingMode;
      modeDesc.textContent = this.getModeDescription(mode);
    });

    // Divider
    const divider1 = document.createElement('div');
    divider1.className = 'recording-prefs-dialog-divider';
    content.appendChild(divider1);

    // Favor element IDs checkbox
    const favorIdsGroup = document.createElement('div');
    favorIdsGroup.className = 'recording-prefs-dialog-field recording-prefs-dialog-checkbox-field';

    this.favorIdsCheckbox = document.createElement('input');
    this.favorIdsCheckbox.type = 'checkbox';
    this.favorIdsCheckbox.id = 'recording-prefs-favor-ids';
    this.favorIdsCheckbox.className = 'recording-prefs-dialog-checkbox';
    this.favorIdsCheckbox.checked = this.currentPreferences.favorElementIds;
    favorIdsGroup.appendChild(this.favorIdsCheckbox);

    const favorIdsLabel = document.createElement('label');
    favorIdsLabel.className = 'recording-prefs-dialog-checkbox-label';
    favorIdsLabel.htmlFor = 'recording-prefs-favor-ids';
    favorIdsLabel.textContent = 'Favor element IDs';
    favorIdsGroup.appendChild(favorIdsLabel);

    content.appendChild(favorIdsGroup);

    const favorIdsDesc = document.createElement('div');
    favorIdsDesc.className = 'recording-prefs-dialog-description';
    favorIdsDesc.textContent = 'Prefer ID selectors over other element locators when available.';
    content.appendChild(favorIdsDesc);

    // Divider
    const divider2 = document.createElement('div');
    divider2.className = 'recording-prefs-dialog-divider';
    content.appendChild(divider2);

    // Expert mode checkbox
    const expertModeGroup = document.createElement('div');
    expertModeGroup.className = 'recording-prefs-dialog-field recording-prefs-dialog-checkbox-field';

    this.expertModeCheckbox = document.createElement('input');
    this.expertModeCheckbox.type = 'checkbox';
    this.expertModeCheckbox.id = 'recording-prefs-expert-mode';
    this.expertModeCheckbox.className = 'recording-prefs-dialog-checkbox';
    this.expertModeCheckbox.checked = this.currentPreferences.expertMode;
    expertModeGroup.appendChild(this.expertModeCheckbox);

    const expertModeLabel = document.createElement('label');
    expertModeLabel.className = 'recording-prefs-dialog-checkbox-label';
    expertModeLabel.htmlFor = 'recording-prefs-expert-mode';
    expertModeLabel.textContent = 'Expert Mode';
    expertModeGroup.appendChild(expertModeLabel);

    content.appendChild(expertModeGroup);

    const expertModeDesc = document.createElement('div');
    expertModeDesc.className = 'recording-prefs-dialog-description';
    expertModeDesc.textContent = 'Show advanced recording options.';
    content.appendChild(expertModeDesc);

    // Expert options container (hidden by default)
    this.expertOptions = document.createElement('div');
    this.expertOptions.className = 'recording-prefs-dialog-expert-options';
    this.expertOptions.style.display = this.currentPreferences.expertMode ? 'block' : 'none';

    // Record keyboard checkbox
    const recordKeyboardGroup = document.createElement('div');
    recordKeyboardGroup.className = 'recording-prefs-dialog-field recording-prefs-dialog-checkbox-field';

    this.recordKeyboardCheckbox = document.createElement('input');
    this.recordKeyboardCheckbox.type = 'checkbox';
    this.recordKeyboardCheckbox.id = 'recording-prefs-record-keyboard';
    this.recordKeyboardCheckbox.className = 'recording-prefs-dialog-checkbox';
    this.recordKeyboardCheckbox.checked = this.currentPreferences.recordKeyboard;
    recordKeyboardGroup.appendChild(this.recordKeyboardCheckbox);

    const recordKeyboardLabel = document.createElement('label');
    recordKeyboardLabel.className = 'recording-prefs-dialog-checkbox-label';
    recordKeyboardLabel.htmlFor = 'recording-prefs-record-keyboard';
    recordKeyboardLabel.textContent = 'Record keyboard shortcuts';
    recordKeyboardGroup.appendChild(recordKeyboardLabel);

    this.expertOptions.appendChild(recordKeyboardGroup);

    // Use text content checkbox
    const useTextContentGroup = document.createElement('div');
    useTextContentGroup.className = 'recording-prefs-dialog-field recording-prefs-dialog-checkbox-field';

    this.useTextContentCheckbox = document.createElement('input');
    this.useTextContentCheckbox.type = 'checkbox';
    this.useTextContentCheckbox.id = 'recording-prefs-use-text-content';
    this.useTextContentCheckbox.className = 'recording-prefs-dialog-checkbox';
    this.useTextContentCheckbox.checked = this.currentPreferences.useTextContent;
    useTextContentGroup.appendChild(this.useTextContentCheckbox);

    const useTextContentLabel = document.createElement('label');
    useTextContentLabel.className = 'recording-prefs-dialog-checkbox-label';
    useTextContentLabel.htmlFor = 'recording-prefs-use-text-content';
    useTextContentLabel.textContent = 'Use text content for identification';
    useTextContentGroup.appendChild(useTextContentLabel);

    this.expertOptions.appendChild(useTextContentGroup);

    content.appendChild(this.expertOptions);

    // Toggle expert options visibility
    this.expertModeCheckbox.addEventListener('change', () => {
      if (this.expertOptions) {
        this.expertOptions.style.display = this.expertModeCheckbox!.checked ? 'block' : 'none';
      }
    });

    this.dialog.appendChild(content);

    // Dialog buttons
    const buttons = document.createElement('div');
    buttons.className = 'recording-prefs-dialog-buttons';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'recording-prefs-dialog-btn recording-prefs-dialog-btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => this.cancel());
    buttons.appendChild(cancelBtn);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'recording-prefs-dialog-btn recording-prefs-dialog-btn-save';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => this.save());
    buttons.appendChild(saveBtn);

    this.dialog.appendChild(buttons);

    // Add to DOM
    this.overlay.appendChild(this.dialog);
    document.body.appendChild(this.overlay);

    // Handle keyboard events
    this.dialog.addEventListener('keydown', (e) => this.handleKeydown(e));

    // Focus the mode select
    this.modeSelect.focus();
  }

  /**
   * Get description text for a recording mode
   */
  private getModeDescription(mode: RecordingMode): string {
    switch (mode) {
      case 'conventional':
        return 'Records standard TAG commands using element attributes like ID, name, and class for identification. Best for most web pages.';
      case 'event':
        return 'Records EVENT commands that include mouse coordinates. Useful for canvas elements, drag-and-drop, and complex UI interactions.';
      case 'xy':
        return 'Records clicks based on X/Y screen coordinates. Use when elements lack identifiable attributes.';
      case 'auto':
        return 'Automatically selects the best recording mode based on the element type and page structure.';
      default:
        return '';
    }
  }

  /**
   * Handle keyboard events
   */
  private handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.cancel();
    } else if (e.key === 'Enter' && e.target !== this.modeSelect) {
      e.preventDefault();
      this.save();
    }
  }

  /**
   * Save and close the dialog
   */
  private save(): void {
    const preferences: RecordingPreferences = {
      mode: (this.modeSelect?.value as RecordingMode) || 'conventional',
      expertMode: this.expertModeCheckbox?.checked || false,
      favorElementIds: this.favorIdsCheckbox?.checked || false,
      recordKeyboard: this.recordKeyboardCheckbox?.checked || false,
      useTextContent: this.useTextContentCheckbox?.checked || false,
    };

    this.close({
      confirmed: true,
      preferences,
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
  private close(result: RecordingPrefsDialogResult): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    this.dialog = null;
    this.modeSelect = null;
    this.expertModeCheckbox = null;
    this.favorIdsCheckbox = null;
    this.recordKeyboardCheckbox = null;
    this.useTextContentCheckbox = null;
    this.expertOptions = null;

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
 * Storage key for recording preferences
 */
const RECORDING_PREFS_STORAGE_KEY = 'imacros_recording_preferences';

/**
 * Load recording preferences from chrome.storage
 */
export async function loadRecordingPreferences(): Promise<RecordingPreferences> {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(RECORDING_PREFS_STORAGE_KEY, (result) => {
        const stored = result[RECORDING_PREFS_STORAGE_KEY];
        if (stored && typeof stored === 'object') {
          resolve({
            ...DEFAULT_RECORDING_PREFERENCES,
            ...stored,
          });
        } else {
          resolve({ ...DEFAULT_RECORDING_PREFERENCES });
        }
      });
    } else {
      // Fallback for non-extension environments
      resolve({ ...DEFAULT_RECORDING_PREFERENCES });
    }
  });
}

/**
 * Save recording preferences to chrome.storage
 */
export async function saveRecordingPreferences(preferences: RecordingPreferences): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ [RECORDING_PREFS_STORAGE_KEY]: preferences }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    } else {
      // Fallback for non-extension environments
      resolve();
    }
  });
}

/**
 * Create and show a recording preferences dialog - convenience function
 */
export function showRecordingPrefsDialog(
  options: RecordingPrefsDialogOptions = {}
): Promise<RecordingPrefsDialogResult> {
  const dialog = new RecordingPrefsDialog();
  return dialog.show(options);
}
