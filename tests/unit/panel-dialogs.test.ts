/**
 * Panel Dialogs Unit Tests
 *
 * Tests for dialog components in the panel:
 * - SaveDialog (save-dialog.ts)
 * - RecordingPrefsDialog (recording-prefs-dialog.ts)
 * - BookmarkDialog (bookmark-dialog.ts)
 * - SecurityWarningDialog (security-warning-dialog.ts)
 * - TrustedSitesDialog (trusted-sites-dialog.ts)
 * - ShareDialog (share-dialog.ts)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';

// Set up DOM globals
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
(globalThis as any).document = dom.window.document;
(globalThis as any).window = dom.window;
(globalThis as any).HTMLElement = dom.window.HTMLElement;
(globalThis as any).HTMLInputElement = dom.window.HTMLInputElement;
(globalThis as any).HTMLSelectElement = dom.window.HTMLSelectElement;
(globalThis as any).HTMLButtonElement = dom.window.HTMLButtonElement;
(globalThis as any).Element = dom.window.Element;
(globalThis as any).Node = dom.window.Node;
(globalThis as any).Event = dom.window.Event;
(globalThis as any).KeyboardEvent = dom.window.KeyboardEvent;

// Mock chrome.storage for preferences
const storageData: Record<string, any> = {};
(globalThis as any).chrome = {
  storage: {
    local: {
      get: vi.fn((key: string, callback?: Function) => {
        if (callback) callback({ [key]: storageData[key] });
        return Promise.resolve({ [key]: storageData[key] });
      }),
      set: vi.fn((data: Record<string, any>, callback?: Function) => {
        Object.assign(storageData, data);
        if (callback) callback();
        return Promise.resolve();
      }),
    },
  },
  runtime: {
    lastError: null as { message: string } | null,
  },
};

import { SaveDialog, showSaveDialog } from '@extension/panel/save-dialog';
import type { SaveDialogOptions } from '@extension/panel/save-dialog';
import {
  RecordingPrefsDialog,
  showRecordingPrefsDialog,
  loadRecordingPreferences,
  saveRecordingPreferences,
  DEFAULT_RECORDING_PREFERENCES,
} from '@extension/panel/recording-prefs-dialog';
import type { RecordingPreferences } from '@extension/panel/recording-prefs-dialog';

describe('SaveDialog', () => {
  afterEach(() => {
    // Clean up any dialogs left in DOM
    document.body.innerHTML = '';
  });

  it('should create a dialog instance', () => {
    const dialog = new SaveDialog();
    expect(dialog).toBeInstanceOf(SaveDialog);
    expect(dialog.isOpen()).toBe(false);
  });

  it('should show dialog and create overlay', async () => {
    const dialog = new SaveDialog();
    // Don't await - resolve it manually
    const resultPromise = dialog.show();
    expect(dialog.isOpen()).toBe(true);
    expect(document.querySelector('.save-dialog-overlay')).not.toBeNull();

    // Cancel to resolve
    const cancelBtn = document.querySelector('.save-dialog-btn-cancel') as HTMLButtonElement;
    cancelBtn.click();
    const result = await resultPromise;
    expect(result.confirmed).toBe(false);
  });

  it('should use default filename', async () => {
    const dialog = new SaveDialog();
    const resultPromise = dialog.show({ defaultFilename: 'MyMacro' });

    const input = document.querySelector('.save-dialog-input') as HTMLInputElement;
    expect(input.value).toBe('MyMacro');

    // Cancel
    const cancelBtn = document.querySelector('.save-dialog-btn-cancel') as HTMLButtonElement;
    cancelBtn.click();
    await resultPromise;
  });

  it('should return filename with .iim extension on save', async () => {
    const dialog = new SaveDialog();
    const resultPromise = dialog.show({ defaultFilename: 'Test' });

    // Click save
    const saveBtn = document.querySelector('.save-dialog-btn-save') as HTMLButtonElement;
    saveBtn.click();
    const result = await resultPromise;
    expect(result.confirmed).toBe(true);
    expect(result.filename).toBe('Test.iim');
  });

  it('should include folder in path', async () => {
    const dialog = new SaveDialog();
    const resultPromise = dialog.show({
      defaultFilename: 'Test',
      folders: [{ name: 'Demo', path: 'Demo', isDirectory: true }],
      defaultFolder: 'Demo',
    });

    // Click save
    const saveBtn = document.querySelector('.save-dialog-btn-save') as HTMLButtonElement;
    saveBtn.click();
    const result = await resultPromise;
    expect(result.confirmed).toBe(true);
    expect(result.folder).toBe('Demo');
    expect(result.path).toBe('Demo/Test.iim');
  });

  it('should not save with empty filename', async () => {
    const dialog = new SaveDialog();
    const resultPromise = dialog.show({ defaultFilename: '' });

    // Clear input and try to save
    const input = document.querySelector('.save-dialog-input') as HTMLInputElement;
    input.value = '';

    const saveBtn = document.querySelector('.save-dialog-btn-save') as HTMLButtonElement;
    saveBtn.click();

    // Dialog should still be open (save failed due to empty name)
    expect(dialog.isOpen()).toBe(true);

    // Cancel to clean up
    const cancelBtn = document.querySelector('.save-dialog-btn-cancel') as HTMLButtonElement;
    cancelBtn.click();
    await resultPromise;
  });

  it('should handle keyboard Escape to cancel', async () => {
    const dialog = new SaveDialog();
    const resultPromise = dialog.show({ defaultFilename: 'Test' });

    const dialogEl = document.querySelector('.save-dialog') as HTMLElement;
    dialogEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    const result = await resultPromise;
    expect(result.confirmed).toBe(false);
  });

  it('should handle keyboard Enter to save', async () => {
    const dialog = new SaveDialog();
    const resultPromise = dialog.show({ defaultFilename: 'Test' });

    const dialogEl = document.querySelector('.save-dialog') as HTMLElement;
    dialogEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    const result = await resultPromise;
    expect(result.confirmed).toBe(true);
  });

  it('should close on overlay click', async () => {
    const dialog = new SaveDialog();
    const resultPromise = dialog.show({ defaultFilename: 'Test' });

    const overlay = document.querySelector('.save-dialog-overlay') as HTMLElement;
    overlay.dispatchEvent(new Event('click', { bubbles: true }));

    const result = await resultPromise;
    expect(result.confirmed).toBe(false);
  });

  it('should sanitize invalid characters from filename', async () => {
    const dialog = new SaveDialog();
    const resultPromise = dialog.show({ defaultFilename: 'test' });

    const input = document.querySelector('.save-dialog-input') as HTMLInputElement;
    input.value = 'my<macro>test';

    const saveBtn = document.querySelector('.save-dialog-btn-save') as HTMLButtonElement;
    saveBtn.click();
    const result = await resultPromise;
    expect(result.filename).toBe('mymacrotest.iim');
  });

  describe('getFoldersFromTree', () => {
    it('should extract folders recursively', () => {
      const root = {
        name: 'Root',
        path: '',
        isDirectory: true,
        children: [
          {
            name: 'Demo',
            path: 'Demo',
            isDirectory: true,
            children: [
              { name: 'Sub', path: 'Demo/Sub', isDirectory: true, children: [] },
              { name: 'file.iim', path: 'Demo/file.iim', isDirectory: false },
            ],
          },
          { name: 'test.iim', path: 'test.iim', isDirectory: false },
        ],
      };
      const folders = SaveDialog.getFoldersFromTree(root);
      expect(folders).toHaveLength(2);
      expect(folders[0].name).toBe('Demo');
      expect(folders[1].name).toBe('Sub');
    });

    it('should return empty array for tree with no folders', () => {
      const root = {
        name: 'Root',
        path: '',
        isDirectory: true,
        children: [
          { name: 'file.iim', path: 'file.iim', isDirectory: false },
        ],
      };
      const folders = SaveDialog.getFoldersFromTree(root);
      expect(folders).toHaveLength(0);
    });
  });
});

describe('RecordingPrefsDialog', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should create a dialog instance', () => {
    const dialog = new RecordingPrefsDialog();
    expect(dialog).toBeInstanceOf(RecordingPrefsDialog);
    expect(dialog.isOpen()).toBe(false);
  });

  it('should show dialog with default preferences', async () => {
    const dialog = new RecordingPrefsDialog();
    const resultPromise = dialog.show();

    expect(dialog.isOpen()).toBe(true);
    expect(document.querySelector('.recording-prefs-dialog-overlay')).not.toBeNull();

    // Cancel
    const cancelBtn = document.querySelector('.recording-prefs-dialog-btn-cancel') as HTMLButtonElement;
    cancelBtn.click();
    const result = await resultPromise;
    expect(result.confirmed).toBe(false);
  });

  it('should return preferences on save', async () => {
    const dialog = new RecordingPrefsDialog();
    const resultPromise = dialog.show();

    const saveBtn = document.querySelector('.recording-prefs-dialog-btn-save') as HTMLButtonElement;
    saveBtn.click();
    const result = await resultPromise;
    expect(result.confirmed).toBe(true);
    expect(result.preferences).toBeDefined();
    expect(result.preferences!.mode).toBe('conventional');
  });

  it('should show current preferences', async () => {
    const dialog = new RecordingPrefsDialog();
    const resultPromise = dialog.show({
      currentPreferences: { mode: 'event', expertMode: true },
    });

    const modeSelect = document.getElementById('recording-prefs-mode') as HTMLSelectElement;
    expect(modeSelect.value).toBe('event');

    const expertCheckbox = document.getElementById('recording-prefs-expert-mode') as HTMLInputElement;
    expect(expertCheckbox.checked).toBe(true);

    // Cancel
    const cancelBtn = document.querySelector('.recording-prefs-dialog-btn-cancel') as HTMLButtonElement;
    cancelBtn.click();
    await resultPromise;
  });

  it('should toggle expert options visibility', async () => {
    const dialog = new RecordingPrefsDialog();
    const resultPromise = dialog.show();

    const expertCheckbox = document.getElementById('recording-prefs-expert-mode') as HTMLInputElement;
    const expertOptions = document.querySelector('.recording-prefs-dialog-expert-options') as HTMLElement;

    // Initially hidden
    expect(expertOptions.style.display).toBe('none');

    // Enable expert mode
    expertCheckbox.checked = true;
    expertCheckbox.dispatchEvent(new Event('change'));
    expect(expertOptions.style.display).toBe('block');

    // Cancel
    const cancelBtn = document.querySelector('.recording-prefs-dialog-btn-cancel') as HTMLButtonElement;
    cancelBtn.click();
    await resultPromise;
  });

  it('should handle Escape key to cancel', async () => {
    const dialog = new RecordingPrefsDialog();
    const resultPromise = dialog.show();

    const dialogEl = document.querySelector('.recording-prefs-dialog') as HTMLElement;
    dialogEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    const result = await resultPromise;
    expect(result.confirmed).toBe(false);
  });

  it('should close on overlay click', async () => {
    const dialog = new RecordingPrefsDialog();
    const resultPromise = dialog.show();

    const overlay = document.querySelector('.recording-prefs-dialog-overlay') as HTMLElement;
    overlay.dispatchEvent(new Event('click', { bubbles: true }));

    const result = await resultPromise;
    expect(result.confirmed).toBe(false);
  });

  it('should clean up on close', async () => {
    const dialog = new RecordingPrefsDialog();
    const resultPromise = dialog.show();

    const cancelBtn = document.querySelector('.recording-prefs-dialog-btn-cancel') as HTMLButtonElement;
    cancelBtn.click();
    await resultPromise;

    expect(dialog.isOpen()).toBe(false);
    expect(document.querySelector('.recording-prefs-dialog-overlay')).toBeNull();
  });
});

describe('showRecordingPrefsDialog convenience function', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should create and show a dialog', async () => {
    const resultPromise = showRecordingPrefsDialog();
    expect(document.querySelector('.recording-prefs-dialog-overlay')).not.toBeNull();

    // Cancel to resolve
    const cancelBtn = document.querySelector('.recording-prefs-dialog-btn-cancel') as HTMLButtonElement;
    cancelBtn.click();
    const result = await resultPromise;
    expect(result.confirmed).toBe(false);
  });
});

describe('showSaveDialog convenience function', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should create and show a save dialog', async () => {
    const resultPromise = showSaveDialog({ defaultFilename: 'Quick' });
    expect(document.querySelector('.save-dialog-overlay')).not.toBeNull();

    // Cancel to resolve
    const cancelBtn = document.querySelector('.save-dialog-btn-cancel') as HTMLButtonElement;
    cancelBtn.click();
    const result = await resultPromise;
    expect(result.confirmed).toBe(false);
  });
});

describe('Recording Preferences Storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chrome.runtime.lastError = null;
  });

  describe('DEFAULT_RECORDING_PREFERENCES', () => {
    it('should have correct defaults', () => {
      expect(DEFAULT_RECORDING_PREFERENCES.mode).toBe('conventional');
      expect(DEFAULT_RECORDING_PREFERENCES.expertMode).toBe(false);
      expect(DEFAULT_RECORDING_PREFERENCES.favorElementIds).toBe(true);
      expect(DEFAULT_RECORDING_PREFERENCES.recordKeyboard).toBe(false);
      expect(DEFAULT_RECORDING_PREFERENCES.useTextContent).toBe(true);
    });
  });

  describe('loadRecordingPreferences', () => {
    it('should return defaults when no stored prefs', async () => {
      const prefs = await loadRecordingPreferences();
      expect(prefs).toEqual(DEFAULT_RECORDING_PREFERENCES);
    });

    it('should merge stored prefs with defaults', async () => {
      const stored = { mode: 'event', expertMode: true };
      (chrome.storage.local.get as any).mockImplementation((_key: string, callback: Function) => {
        callback({ imacros_recording_preferences: stored });
      });

      const prefs = await loadRecordingPreferences();
      expect(prefs.mode).toBe('event');
      expect(prefs.expertMode).toBe(true);
      // Defaults should fill in missing fields
      expect(prefs.favorElementIds).toBe(true);
    });
  });

  describe('saveRecordingPreferences', () => {
    it('should save preferences to chrome.storage', async () => {
      const prefs: RecordingPreferences = {
        mode: 'xy',
        expertMode: true,
        favorElementIds: false,
        recordKeyboard: true,
        useTextContent: false,
      };

      (chrome.storage.local.set as any).mockImplementation((_data: any, callback: Function) => {
        callback();
      });

      await saveRecordingPreferences(prefs);
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        { imacros_recording_preferences: prefs },
        expect.any(Function),
      );
    });

    it('should reject on chrome.runtime.lastError', async () => {
      (chrome.storage.local.set as any).mockImplementation((_data: any, callback: Function) => {
        chrome.runtime.lastError = { message: 'quota exceeded' };
        callback();
        chrome.runtime.lastError = null;
      });

      await expect(saveRecordingPreferences(DEFAULT_RECORDING_PREFERENCES)).rejects.toThrow('quota exceeded');
    });
  });
});
