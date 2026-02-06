import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';

// Polyfill DOM globals BEFORE importing source modules
const _polyfillDom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
const polyfillGlobals = ['Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement',
  'MouseEvent', 'KeyboardEvent', 'Event', 'Document'];
for (const name of polyfillGlobals) {
  if (typeof (globalThis as any)[name] === 'undefined' && (_polyfillDom.window as any)[name]) {
    (globalThis as any)[name] = (_polyfillDom.window as any)[name];
  }
}
if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = _polyfillDom.window.document;
}
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = _polyfillDom.window;
}

// Mock chrome API
(globalThis as any).chrome = {
  storage: {
    local: {
      get: vi.fn((key: string, callback: (result: Record<string, unknown>) => void) => {
        callback({});
      }),
      set: vi.fn((data: Record<string, unknown>, callback: () => void) => {
        callback();
      }),
    },
  },
  runtime: {
    lastError: null,
  },
};

import {
  RecordingPrefsDialog,
  RecordingPreferences,
  RecordingMode,
  DEFAULT_RECORDING_PREFERENCES,
  loadRecordingPreferences,
  saveRecordingPreferences,
  showRecordingPrefsDialog,
} from '../../extension/src/panel/recording-prefs-dialog';

// Track the current test JSDOM so event constructors come from the same realm
let currentDom: JSDOM;

// Helper: create a fresh JSDOM and set as globals
function createTestDom(html: string = '<!DOCTYPE html><html><body></body></html>'): JSDOM {
  const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
  currentDom = dom;
  (globalThis as any).document = dom.window.document;
  (globalThis as any).window = dom.window;
  return dom;
}

describe('RecordingPrefsDialog', () => {
  let dialog: RecordingPrefsDialog;

  beforeEach(() => {
    createTestDom();
    dialog = new RecordingPrefsDialog();
    // Reset chrome mock
    (globalThis as any).chrome.storage.local.get = vi.fn((key: string, callback: (result: Record<string, unknown>) => void) => {
      callback({});
    });
    (globalThis as any).chrome.storage.local.set = vi.fn((data: Record<string, unknown>, callback: () => void) => {
      callback();
    });
    (globalThis as any).chrome.runtime.lastError = null;
  });

  afterEach(() => {
    // Clean up any open dialogs
    const overlay = document.querySelector('.recording-prefs-dialog-overlay');
    if (overlay) {
      overlay.remove();
    }
  });

  describe('DEFAULT_RECORDING_PREFERENCES', () => {
    it('should have default mode as conventional', () => {
      expect(DEFAULT_RECORDING_PREFERENCES.mode).toBe('conventional');
    });

    it('should have favorElementIds enabled by default', () => {
      expect(DEFAULT_RECORDING_PREFERENCES.favorElementIds).toBe(true);
    });

    it('should have expertMode disabled by default', () => {
      expect(DEFAULT_RECORDING_PREFERENCES.expertMode).toBe(false);
    });

    it('should have recordKeyboard disabled by default', () => {
      expect(DEFAULT_RECORDING_PREFERENCES.recordKeyboard).toBe(false);
    });

    it('should have useTextContent enabled by default', () => {
      expect(DEFAULT_RECORDING_PREFERENCES.useTextContent).toBe(true);
    });
  });

  describe('dialog lifecycle', () => {
    it('should not be open initially', () => {
      expect(dialog.isOpen()).toBe(false);
    });

    it('should be open after calling show()', async () => {
      // Show returns a promise, but we can check state immediately
      const showPromise = dialog.show();
      expect(dialog.isOpen()).toBe(true);

      // Cancel to resolve the promise
      const cancelBtn = document.querySelector('.recording-prefs-dialog-btn-cancel') as HTMLButtonElement;
      cancelBtn?.click();

      await showPromise;
    });

    it('should create overlay and dialog elements', () => {
      dialog.show();

      const overlay = document.querySelector('.recording-prefs-dialog-overlay');
      const dialogEl = document.querySelector('.recording-prefs-dialog');

      expect(overlay).not.toBeNull();
      expect(dialogEl).not.toBeNull();

      // Cancel to clean up
      const cancelBtn = document.querySelector('.recording-prefs-dialog-btn-cancel') as HTMLButtonElement;
      cancelBtn?.click();
    });

    it('should have correct dialog title', () => {
      dialog.show();

      const title = document.querySelector('.recording-prefs-dialog-title');
      expect(title?.textContent).toBe('Recording Options');

      // Cancel to clean up
      const cancelBtn = document.querySelector('.recording-prefs-dialog-btn-cancel') as HTMLButtonElement;
      cancelBtn?.click();
    });
  });

  describe('dialog controls', () => {
    it('should have mode select with all options', () => {
      dialog.show();

      const modeSelect = document.querySelector('#recording-prefs-mode') as HTMLSelectElement;
      expect(modeSelect).not.toBeNull();

      const options = Array.from(modeSelect.options);
      const values = options.map(opt => opt.value);

      expect(values).toContain('conventional');
      expect(values).toContain('event');
      expect(values).toContain('xy');
      expect(values).toContain('auto');

      // Cancel to clean up
      const cancelBtn = document.querySelector('.recording-prefs-dialog-btn-cancel') as HTMLButtonElement;
      cancelBtn?.click();
    });

    it('should have favor IDs checkbox', () => {
      dialog.show();

      const checkbox = document.querySelector('#recording-prefs-favor-ids') as HTMLInputElement;
      expect(checkbox).not.toBeNull();
      expect(checkbox.type).toBe('checkbox');

      // Cancel to clean up
      const cancelBtn = document.querySelector('.recording-prefs-dialog-btn-cancel') as HTMLButtonElement;
      cancelBtn?.click();
    });

    it('should have expert mode checkbox', () => {
      dialog.show();

      const checkbox = document.querySelector('#recording-prefs-expert-mode') as HTMLInputElement;
      expect(checkbox).not.toBeNull();
      expect(checkbox.type).toBe('checkbox');

      // Cancel to clean up
      const cancelBtn = document.querySelector('.recording-prefs-dialog-btn-cancel') as HTMLButtonElement;
      cancelBtn?.click();
    });

    it('should have Save and Cancel buttons', () => {
      dialog.show();

      const saveBtn = document.querySelector('.recording-prefs-dialog-btn-save');
      const cancelBtn = document.querySelector('.recording-prefs-dialog-btn-cancel');

      expect(saveBtn).not.toBeNull();
      expect(cancelBtn).not.toBeNull();
      expect(saveBtn?.textContent).toBe('Save');
      expect(cancelBtn?.textContent).toBe('Cancel');

      // Cancel to clean up
      (cancelBtn as HTMLButtonElement)?.click();
    });
  });

  describe('dialog behavior', () => {
    it('should close and return confirmed: false when Cancel is clicked', async () => {
      const showPromise = dialog.show();

      const cancelBtn = document.querySelector('.recording-prefs-dialog-btn-cancel') as HTMLButtonElement;
      cancelBtn?.click();

      const result = await showPromise;
      expect(result.confirmed).toBe(false);
      expect(result.preferences).toBeUndefined();
      expect(dialog.isOpen()).toBe(false);
    });

    it('should close and return confirmed: true with preferences when Save is clicked', async () => {
      const showPromise = dialog.show();

      const saveBtn = document.querySelector('.recording-prefs-dialog-btn-save') as HTMLButtonElement;
      saveBtn?.click();

      const result = await showPromise;
      expect(result.confirmed).toBe(true);
      expect(result.preferences).toBeDefined();
      expect(dialog.isOpen()).toBe(false);
    });

    it('should close when clicking overlay background', async () => {
      const showPromise = dialog.show();

      const overlay = document.querySelector('.recording-prefs-dialog-overlay') as HTMLElement;
      // Simulate click on the overlay itself (not the dialog inside it)
      overlay.dispatchEvent(new (currentDom.window.MouseEvent)('click', { bubbles: true }));

      const result = await showPromise;
      expect(result.confirmed).toBe(false);
      expect(dialog.isOpen()).toBe(false);
    });

    it('should return selected mode in preferences', async () => {
      const showPromise = dialog.show();

      const modeSelect = document.querySelector('#recording-prefs-mode') as HTMLSelectElement;
      modeSelect.value = 'event';
      modeSelect.dispatchEvent(new (currentDom.window.Event)('change'));

      const saveBtn = document.querySelector('.recording-prefs-dialog-btn-save') as HTMLButtonElement;
      saveBtn?.click();

      const result = await showPromise;
      expect(result.preferences?.mode).toBe('event');
    });

    it('should return favor IDs state in preferences', async () => {
      const showPromise = dialog.show();

      const checkbox = document.querySelector('#recording-prefs-favor-ids') as HTMLInputElement;
      checkbox.checked = false;

      const saveBtn = document.querySelector('.recording-prefs-dialog-btn-save') as HTMLButtonElement;
      saveBtn?.click();

      const result = await showPromise;
      expect(result.preferences?.favorElementIds).toBe(false);
    });

    it('should return expert mode state in preferences', async () => {
      const showPromise = dialog.show();

      const checkbox = document.querySelector('#recording-prefs-expert-mode') as HTMLInputElement;
      checkbox.checked = true;
      checkbox.dispatchEvent(new (currentDom.window.Event)('change'));

      const saveBtn = document.querySelector('.recording-prefs-dialog-btn-save') as HTMLButtonElement;
      saveBtn?.click();

      const result = await showPromise;
      expect(result.preferences?.expertMode).toBe(true);
    });
  });

  describe('expert options', () => {
    it('should hide expert options by default', () => {
      dialog.show();

      const expertOptions = document.querySelector('.recording-prefs-dialog-expert-options') as HTMLElement;
      expect(expertOptions.style.display).toBe('none');

      // Cancel to clean up
      const cancelBtn = document.querySelector('.recording-prefs-dialog-btn-cancel') as HTMLButtonElement;
      cancelBtn?.click();
    });

    it('should show expert options when expert mode is enabled', () => {
      dialog.show();

      const expertModeCheckbox = document.querySelector('#recording-prefs-expert-mode') as HTMLInputElement;
      expertModeCheckbox.checked = true;
      expertModeCheckbox.dispatchEvent(new (currentDom.window.Event)('change'));

      const expertOptions = document.querySelector('.recording-prefs-dialog-expert-options') as HTMLElement;
      expect(expertOptions.style.display).toBe('block');

      // Cancel to clean up
      const cancelBtn = document.querySelector('.recording-prefs-dialog-btn-cancel') as HTMLButtonElement;
      cancelBtn?.click();
    });

    it('should have record keyboard checkbox in expert options', () => {
      dialog.show();

      const checkbox = document.querySelector('#recording-prefs-record-keyboard') as HTMLInputElement;
      expect(checkbox).not.toBeNull();
      expect(checkbox.type).toBe('checkbox');

      // Cancel to clean up
      const cancelBtn = document.querySelector('.recording-prefs-dialog-btn-cancel') as HTMLButtonElement;
      cancelBtn?.click();
    });

    it('should have use text content checkbox in expert options', () => {
      dialog.show();

      const checkbox = document.querySelector('#recording-prefs-use-text-content') as HTMLInputElement;
      expect(checkbox).not.toBeNull();
      expect(checkbox.type).toBe('checkbox');

      // Cancel to clean up
      const cancelBtn = document.querySelector('.recording-prefs-dialog-btn-cancel') as HTMLButtonElement;
      cancelBtn?.click();
    });

    it('should return expert options in preferences when saved', async () => {
      const showPromise = dialog.show();

      // Enable expert mode
      const expertModeCheckbox = document.querySelector('#recording-prefs-expert-mode') as HTMLInputElement;
      expertModeCheckbox.checked = true;
      expertModeCheckbox.dispatchEvent(new (currentDom.window.Event)('change'));

      // Change expert options
      const recordKeyboardCheckbox = document.querySelector('#recording-prefs-record-keyboard') as HTMLInputElement;
      recordKeyboardCheckbox.checked = true;

      const useTextContentCheckbox = document.querySelector('#recording-prefs-use-text-content') as HTMLInputElement;
      useTextContentCheckbox.checked = false;

      const saveBtn = document.querySelector('.recording-prefs-dialog-btn-save') as HTMLButtonElement;
      saveBtn?.click();

      const result = await showPromise;
      expect(result.preferences?.expertMode).toBe(true);
      expect(result.preferences?.recordKeyboard).toBe(true);
      expect(result.preferences?.useTextContent).toBe(false);
    });
  });

  describe('initial values', () => {
    it('should use default values when no options provided', async () => {
      const showPromise = dialog.show();

      const modeSelect = document.querySelector('#recording-prefs-mode') as HTMLSelectElement;
      const favorIdsCheckbox = document.querySelector('#recording-prefs-favor-ids') as HTMLInputElement;
      const expertModeCheckbox = document.querySelector('#recording-prefs-expert-mode') as HTMLInputElement;

      expect(modeSelect.value).toBe('conventional');
      expect(favorIdsCheckbox.checked).toBe(true);
      expect(expertModeCheckbox.checked).toBe(false);

      // Cancel to clean up
      const cancelBtn = document.querySelector('.recording-prefs-dialog-btn-cancel') as HTMLButtonElement;
      cancelBtn?.click();
      await showPromise;
    });

    it('should use provided current preferences', async () => {
      const customPrefs: Partial<RecordingPreferences> = {
        mode: 'event',
        favorElementIds: false,
        expertMode: true,
        recordKeyboard: true,
        useTextContent: false,
      };

      const showPromise = dialog.show({ currentPreferences: customPrefs });

      const modeSelect = document.querySelector('#recording-prefs-mode') as HTMLSelectElement;
      const favorIdsCheckbox = document.querySelector('#recording-prefs-favor-ids') as HTMLInputElement;
      const expertModeCheckbox = document.querySelector('#recording-prefs-expert-mode') as HTMLInputElement;
      const recordKeyboardCheckbox = document.querySelector('#recording-prefs-record-keyboard') as HTMLInputElement;
      const useTextContentCheckbox = document.querySelector('#recording-prefs-use-text-content') as HTMLInputElement;

      expect(modeSelect.value).toBe('event');
      expect(favorIdsCheckbox.checked).toBe(false);
      expect(expertModeCheckbox.checked).toBe(true);
      expect(recordKeyboardCheckbox.checked).toBe(true);
      expect(useTextContentCheckbox.checked).toBe(false);

      // Cancel to clean up
      const cancelBtn = document.querySelector('.recording-prefs-dialog-btn-cancel') as HTMLButtonElement;
      cancelBtn?.click();
      await showPromise;
    });
  });
});

describe('storage functions', () => {
  beforeEach(() => {
    createTestDom();
    // Reset chrome mock
    (globalThis as any).chrome.storage.local.get = vi.fn((key: string, callback: (result: Record<string, unknown>) => void) => {
      callback({});
    });
    (globalThis as any).chrome.storage.local.set = vi.fn((data: Record<string, unknown>, callback: () => void) => {
      callback();
    });
    (globalThis as any).chrome.runtime.lastError = null;
  });

  describe('loadRecordingPreferences', () => {
    it('should return default preferences when storage is empty', async () => {
      const prefs = await loadRecordingPreferences();
      expect(prefs).toEqual(DEFAULT_RECORDING_PREFERENCES);
    });

    it('should return stored preferences merged with defaults', async () => {
      (globalThis as any).chrome.storage.local.get = vi.fn((key: string, callback: (result: Record<string, unknown>) => void) => {
        callback({
          imacros_recording_preferences: {
            mode: 'xy',
            favorElementIds: false,
          },
        });
      });

      const prefs = await loadRecordingPreferences();
      expect(prefs.mode).toBe('xy');
      expect(prefs.favorElementIds).toBe(false);
      // Should have defaults for missing properties
      expect(prefs.expertMode).toBe(DEFAULT_RECORDING_PREFERENCES.expertMode);
      expect(prefs.recordKeyboard).toBe(DEFAULT_RECORDING_PREFERENCES.recordKeyboard);
    });

    it('should call chrome.storage.local.get', async () => {
      await loadRecordingPreferences();
      expect((globalThis as any).chrome.storage.local.get).toHaveBeenCalled();
    });
  });

  describe('saveRecordingPreferences', () => {
    it('should call chrome.storage.local.set with preferences', async () => {
      const prefs: RecordingPreferences = {
        mode: 'event',
        expertMode: true,
        favorElementIds: false,
        recordKeyboard: true,
        useTextContent: false,
      };

      await saveRecordingPreferences(prefs);

      expect((globalThis as any).chrome.storage.local.set).toHaveBeenCalledWith(
        { imacros_recording_preferences: prefs },
        expect.any(Function)
      );
    });

    it('should reject on storage error', async () => {
      (globalThis as any).chrome.storage.local.set = vi.fn((data: Record<string, unknown>, callback: () => void) => {
        (globalThis as any).chrome.runtime.lastError = { message: 'Storage error' };
        callback();
      });

      await expect(saveRecordingPreferences(DEFAULT_RECORDING_PREFERENCES)).rejects.toThrow('Storage error');

      // Reset lastError
      (globalThis as any).chrome.runtime.lastError = null;
    });
  });

  describe('showRecordingPrefsDialog', () => {
    it('should create and show a dialog', async () => {
      const showPromise = showRecordingPrefsDialog();

      const overlay = document.querySelector('.recording-prefs-dialog-overlay');
      expect(overlay).not.toBeNull();

      // Cancel to resolve
      const cancelBtn = document.querySelector('.recording-prefs-dialog-btn-cancel') as HTMLButtonElement;
      cancelBtn?.click();

      await showPromise;
    });

    it('should accept options', async () => {
      const showPromise = showRecordingPrefsDialog({
        currentPreferences: { mode: 'auto' },
      });

      const modeSelect = document.querySelector('#recording-prefs-mode') as HTMLSelectElement;
      expect(modeSelect.value).toBe('auto');

      // Cancel to resolve
      const cancelBtn = document.querySelector('.recording-prefs-dialog-btn-cancel') as HTMLButtonElement;
      cancelBtn?.click();

      await showPromise;
    });
  });
});

describe('RecordingMode type', () => {
  it('should accept valid recording modes', () => {
    const modes: RecordingMode[] = ['conventional', 'event', 'xy', 'auto'];
    expect(modes).toHaveLength(4);
  });
});
