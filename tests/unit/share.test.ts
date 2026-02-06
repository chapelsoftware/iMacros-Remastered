/**
 * Unit Tests for ShareDialog component
 *
 * Tests cover:
 * - Dialog creation and display
 * - URL generation (path-based and embedded content)
 * - Copy to clipboard functionality
 * - Email sharing
 * - Keyboard shortcuts (Enter, Escape)
 * - Embed checkbox behavior
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

// Setup DOM environment before imports
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
const { window } = dom;

// Polyfill globals
(globalThis as any).document = window.document;
(globalThis as any).window = window;
(globalThis as any).HTMLElement = window.HTMLElement;
(globalThis as any).Element = window.Element;
(globalThis as any).Node = window.Node;
(globalThis as any).KeyboardEvent = window.KeyboardEvent;
(globalThis as any).MouseEvent = window.MouseEvent;
(globalThis as any).TextEncoder = TextEncoder;

// Mock navigator.clipboard
const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
  readText: vi.fn().mockResolvedValue(''),
};
Object.defineProperty(globalThis, 'navigator', {
  value: { clipboard: mockClipboard },
  writable: true,
  configurable: true,
});

// Mock window.open for email testing
const mockOpen = vi.fn();
Object.defineProperty(window, 'open', {
  value: mockOpen,
  writable: true,
  configurable: true,
});

// Mock btoa for base64 encoding
(globalThis as any).btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');

// Mock chrome.storage.local (required by file-tree dependency)
const mockStorage = {
  local: {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(undefined),
  },
};
(globalThis as any).chrome = { storage: mockStorage };

// Import after setting up globals
import { ShareDialog, showShareDialog, ShareDialogResult, ShareDialogOptions } from '../../extension/src/panel/share-dialog';

describe('ShareDialog', () => {
  let dialog: ShareDialog;

  beforeEach(() => {
    // Clear body
    window.document.body.innerHTML = '';
    dialog = new ShareDialog();
    // Reset mocks
    mockClipboard.writeText.mockClear();
    mockOpen.mockClear();
  });

  afterEach(() => {
    // Clean up any open dialogs
    const overlay = window.document.querySelector('.share-dialog-overlay');
    if (overlay) {
      overlay.remove();
    }
  });

  // ===== Dialog Creation =====

  describe('dialog creation', () => {
    it('should create and display dialog overlay', async () => {
      const showPromise = dialog.show({ macroPath: 'test.iim' });

      // Dialog should be visible
      const overlay = window.document.querySelector('.share-dialog-overlay');
      expect(overlay).toBeTruthy();

      // Clean up by clicking close
      const closeBtn = window.document.querySelector('.share-dialog-btn-close') as HTMLButtonElement;
      closeBtn.click();

      const result = await showPromise;
      expect(result.confirmed).toBe(false);
    });

    it('should create dialog with title', async () => {
      const showPromise = dialog.show({ macroPath: 'test.iim' });

      const title = window.document.querySelector('.share-dialog-title');
      expect(title).toBeTruthy();
      expect(title?.textContent).toBe('Share Macro');

      // Close to clean up
      (window.document.querySelector('.share-dialog-btn-close') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should have URL input field', async () => {
      const showPromise = dialog.show({ macroPath: 'test.iim' });

      const urlInput = window.document.getElementById('share-dialog-url') as HTMLInputElement;
      expect(urlInput).toBeTruthy();
      expect(urlInput.readOnly).toBe(true);

      (window.document.querySelector('.share-dialog-btn-close') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should display macro name', async () => {
      const showPromise = dialog.show({ macroPath: 'Demo/TestMacro.iim' });

      const macroName = window.document.querySelector('.share-dialog-macro-name');
      expect(macroName).toBeTruthy();
      expect(macroName?.textContent).toBe('TestMacro');

      (window.document.querySelector('.share-dialog-btn-close') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should use provided macro name', async () => {
      const showPromise = dialog.show({
        macroPath: 'Demo/file.iim',
        macroName: 'Custom Name',
      });

      const macroName = window.document.querySelector('.share-dialog-macro-name');
      expect(macroName?.textContent).toBe('Custom Name');

      (window.document.querySelector('.share-dialog-btn-close') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should have Copy URL and Email buttons', async () => {
      const showPromise = dialog.show({ macroPath: 'test.iim' });

      const copyBtn = window.document.querySelector('.share-dialog-btn-primary');
      const emailBtn = window.document.querySelector('.share-dialog-btn-secondary');

      expect(copyBtn).toBeTruthy();
      expect(copyBtn?.textContent).toContain('Copy URL');
      expect(emailBtn).toBeTruthy();
      expect(emailBtn?.textContent).toContain('Email');

      (window.document.querySelector('.share-dialog-btn-close') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should have Close button', async () => {
      const showPromise = dialog.show({ macroPath: 'test.iim' });

      const closeBtn = window.document.querySelector('.share-dialog-btn-close');
      expect(closeBtn).toBeTruthy();
      expect(closeBtn?.textContent).toBe('Close');

      (closeBtn as HTMLButtonElement).click();
      await showPromise;
    });
  });

  // ===== URL Generation =====

  describe('URL generation', () => {
    it('should generate imacros:// URL with encoded path', async () => {
      const showPromise = dialog.show({ macroPath: 'Demo/TestMacro.iim' });

      const urlInput = window.document.getElementById('share-dialog-url') as HTMLInputElement;
      expect(urlInput.value).toBe('imacros://run/Demo%2FTestMacro.iim');

      (window.document.querySelector('.share-dialog-btn-close') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should handle special characters in path', async () => {
      const showPromise = dialog.show({ macroPath: 'My Macros/Test & Demo.iim' });

      const urlInput = window.document.getElementById('share-dialog-url') as HTMLInputElement;
      expect(urlInput.value).toBe('imacros://run/My%20Macros%2FTest%20%26%20Demo.iim');

      (window.document.querySelector('.share-dialog-btn-close') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should show embed checkbox when macro content is provided', async () => {
      const showPromise = dialog.show({
        macroPath: 'test.iim',
        macroContent: 'URL GOTO=https://example.com',
      });

      const embedCheckbox = window.document.getElementById('share-dialog-embed');
      expect(embedCheckbox).toBeTruthy();

      (window.document.querySelector('.share-dialog-btn-close') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should not show embed checkbox when no macro content', async () => {
      const showPromise = dialog.show({
        macroPath: 'test.iim',
      });

      const embedCheckbox = window.document.getElementById('share-dialog-embed');
      expect(embedCheckbox).toBeFalsy();

      (window.document.querySelector('.share-dialog-btn-close') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should generate embedded URL when checkbox is checked', async () => {
      const macroContent = 'URL GOTO=https://example.com';
      const showPromise = dialog.show({
        macroPath: 'test.iim',
        macroName: 'TestMacro',
        macroContent,
      });

      // Check the embed checkbox
      const embedCheckbox = window.document.getElementById('share-dialog-embed') as HTMLInputElement;
      embedCheckbox.checked = true;
      embedCheckbox.dispatchEvent(new window.Event('change'));

      const urlInput = window.document.getElementById('share-dialog-url') as HTMLInputElement;
      expect(urlInput.value).toContain('imacros://run?name=TestMacro&content=');
      // Content should be base64 encoded
      expect(urlInput.value).toContain('VVJMIEdPVE89aHR0cHM6Ly9leGFtcGxlLmNvbQ==');

      (window.document.querySelector('.share-dialog-btn-close') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should switch back to path-based URL when checkbox is unchecked', async () => {
      const showPromise = dialog.show({
        macroPath: 'Demo/test.iim',
        macroContent: 'URL GOTO=https://example.com',
      });

      // Check then uncheck the embed checkbox
      const embedCheckbox = window.document.getElementById('share-dialog-embed') as HTMLInputElement;
      embedCheckbox.checked = true;
      embedCheckbox.dispatchEvent(new window.Event('change'));
      embedCheckbox.checked = false;
      embedCheckbox.dispatchEvent(new window.Event('change'));

      const urlInput = window.document.getElementById('share-dialog-url') as HTMLInputElement;
      expect(urlInput.value).toBe('imacros://run/Demo%2Ftest.iim');

      (window.document.querySelector('.share-dialog-btn-close') as HTMLButtonElement).click();
      await showPromise;
    });
  });

  // ===== generateUrl Method =====

  describe('generateUrl method', () => {
    it('should generate path-based URL', () => {
      dialog.show({ macroPath: 'Demo/test.iim' });
      const url = dialog.generateUrl(false);
      expect(url).toBe('imacros://run/Demo%2Ftest.iim');

      // Clean up
      const overlay = window.document.querySelector('.share-dialog-overlay');
      overlay?.remove();
    });

    it('should generate embedded URL', () => {
      dialog.show({
        macroPath: 'test.iim',
        macroName: 'MyMacro',
        macroContent: 'TAG POS=1 TYPE=BUTTON',
      });
      const url = dialog.generateUrl(true);
      expect(url).toContain('imacros://run?name=MyMacro&content=');

      // Clean up
      const overlay = window.document.querySelector('.share-dialog-overlay');
      overlay?.remove();
    });
  });

  // ===== Copy URL =====

  describe('copy URL', () => {
    it('should copy URL to clipboard when Copy button is clicked', async () => {
      const showPromise = dialog.show({ macroPath: 'test.iim' });

      const copyBtn = window.document.querySelector('.share-dialog-btn-primary') as HTMLButtonElement;
      copyBtn.click();

      const result = await showPromise;
      expect(result.confirmed).toBe(true);
      expect(result.action).toBe('copy');
      expect(result.url).toBe('imacros://run/test.iim');
      expect(mockClipboard.writeText).toHaveBeenCalledWith('imacros://run/test.iim');
    });

    it('should return the URL in the result', async () => {
      const showPromise = dialog.show({ macroPath: 'Demo/macro.iim' });

      const copyBtn = window.document.querySelector('.share-dialog-btn-primary') as HTMLButtonElement;
      copyBtn.click();

      const result = await showPromise;
      expect(result.url).toBe('imacros://run/Demo%2Fmacro.iim');
    });
  });

  // ===== Email Share =====

  describe('email share', () => {
    it('should open mailto link when Email button is clicked', async () => {
      const showPromise = dialog.show({
        macroPath: 'test.iim',
        macroName: 'TestMacro',
      });

      const emailBtn = window.document.querySelector('.share-dialog-btn-secondary') as HTMLButtonElement;
      emailBtn.click();

      const result = await showPromise;
      expect(result.confirmed).toBe(true);
      expect(result.action).toBe('email');
      expect(mockOpen).toHaveBeenCalled();

      // Verify mailto URL structure
      const mailtoUrl = mockOpen.mock.calls[0][0];
      expect(mailtoUrl).toContain('mailto:?subject=');
      expect(mailtoUrl).toContain('iMacros');
      expect(mailtoUrl).toContain('TestMacro');
      expect(mailtoUrl).toContain('body=');
    });

    it('should include macro URL in email body', async () => {
      const showPromise = dialog.show({ macroPath: 'Demo/macro.iim' });

      const emailBtn = window.document.querySelector('.share-dialog-btn-secondary') as HTMLButtonElement;
      emailBtn.click();

      await showPromise;

      const mailtoUrl = mockOpen.mock.calls[0][0];
      expect(mailtoUrl).toContain(encodeURIComponent('imacros://run/Demo%2Fmacro.iim'));
    });
  });

  // ===== Close Action =====

  describe('close action', () => {
    it('should return confirmed false on close button click', async () => {
      const showPromise = dialog.show({ macroPath: 'test.iim' });

      const closeBtn = window.document.querySelector('.share-dialog-btn-close') as HTMLButtonElement;
      closeBtn.click();

      const result = await showPromise;
      expect(result.confirmed).toBe(false);
      expect(result.action).toBe('close');
    });

    it('should close dialog on close button', async () => {
      const showPromise = dialog.show({ macroPath: 'test.iim' });

      const closeBtn = window.document.querySelector('.share-dialog-btn-close') as HTMLButtonElement;
      closeBtn.click();

      await showPromise;

      const dialogEl = window.document.querySelector('.share-dialog');
      expect(dialogEl).toBeFalsy();
    });

    it('should close dialog on overlay click', async () => {
      const showPromise = dialog.show({ macroPath: 'test.iim' });

      const overlay = window.document.querySelector('.share-dialog-overlay') as HTMLElement;
      overlay.click();

      const result = await showPromise;
      expect(result.confirmed).toBe(false);
    });

    it('should not close when clicking inside dialog', async () => {
      const showPromise = dialog.show({ macroPath: 'test.iim' });

      const dialogEl = window.document.querySelector('.share-dialog') as HTMLElement;
      dialogEl.click();

      // Dialog should still be open
      expect(window.document.querySelector('.share-dialog')).toBeTruthy();

      (window.document.querySelector('.share-dialog-btn-close') as HTMLButtonElement).click();
      await showPromise;
    });
  });

  // ===== Keyboard Shortcuts =====

  describe('keyboard shortcuts', () => {
    it('should copy URL on Enter key', async () => {
      const showPromise = dialog.show({ macroPath: 'test.iim' });

      const dialogEl = window.document.querySelector('.share-dialog') as HTMLElement;
      const event = new window.KeyboardEvent('keydown', { key: 'Enter' });
      dialogEl.dispatchEvent(event);

      const result = await showPromise;
      expect(result.confirmed).toBe(true);
      expect(result.action).toBe('copy');
    });

    it('should close on Escape key', async () => {
      const showPromise = dialog.show({ macroPath: 'test.iim' });

      const dialogEl = window.document.querySelector('.share-dialog') as HTMLElement;
      const event = new window.KeyboardEvent('keydown', { key: 'Escape' });
      dialogEl.dispatchEvent(event);

      const result = await showPromise;
      expect(result.confirmed).toBe(false);
      expect(result.action).toBe('close');
    });
  });

  // ===== isOpen Method =====

  describe('isOpen method', () => {
    it('should return true when dialog is open', () => {
      dialog.show({ macroPath: 'test.iim' });
      expect(dialog.isOpen()).toBe(true);
    });

    it('should return false after dialog is closed', async () => {
      const showPromise = dialog.show({ macroPath: 'test.iim' });

      (window.document.querySelector('.share-dialog-btn-close') as HTMLButtonElement).click();
      await showPromise;

      expect(dialog.isOpen()).toBe(false);
    });
  });

  // ===== Macro Name Extraction =====

  describe('macro name extraction', () => {
    it('should extract name from simple filename', async () => {
      const showPromise = dialog.show({ macroPath: 'MyMacro.iim' });

      const macroName = window.document.querySelector('.share-dialog-macro-name');
      expect(macroName?.textContent).toBe('MyMacro');

      (window.document.querySelector('.share-dialog-btn-close') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should extract name from nested path', async () => {
      const showPromise = dialog.show({ macroPath: 'Folder/Subfolder/MyMacro.iim' });

      const macroName = window.document.querySelector('.share-dialog-macro-name');
      expect(macroName?.textContent).toBe('MyMacro');

      (window.document.querySelector('.share-dialog-btn-close') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should handle case-insensitive .iim extension', async () => {
      const showPromise = dialog.show({ macroPath: 'Test.IIM' });

      const macroName = window.document.querySelector('.share-dialog-macro-name');
      expect(macroName?.textContent).toBe('Test');

      (window.document.querySelector('.share-dialog-btn-close') as HTMLButtonElement).click();
      await showPromise;
    });

    it('should default to "Macro" for empty path', async () => {
      const showPromise = dialog.show({ macroPath: '' });

      const macroName = window.document.querySelector('.share-dialog-macro-name');
      expect(macroName?.textContent).toBe('Macro');

      (window.document.querySelector('.share-dialog-btn-close') as HTMLButtonElement).click();
      await showPromise;
    });
  });
});

// ===== showShareDialog Convenience Function =====

describe('showShareDialog', () => {
  beforeEach(() => {
    window.document.body.innerHTML = '';
    mockClipboard.writeText.mockClear();
  });

  afterEach(() => {
    const overlay = window.document.querySelector('.share-dialog-overlay');
    if (overlay) {
      overlay.remove();
    }
  });

  it('should create and show dialog', async () => {
    const showPromise = showShareDialog({ macroPath: 'test.iim' });

    const overlay = window.document.querySelector('.share-dialog-overlay');
    expect(overlay).toBeTruthy();

    (window.document.querySelector('.share-dialog-btn-close') as HTMLButtonElement).click();
    await showPromise;
  });

  it('should return result from dialog', async () => {
    const showPromise = showShareDialog({ macroPath: 'MyMacro.iim' });

    (window.document.querySelector('.share-dialog-btn-primary') as HTMLButtonElement).click();

    const result = await showPromise;
    expect(result.confirmed).toBe(true);
    expect(result.action).toBe('copy');
    expect(result.url).toBe('imacros://run/MyMacro.iim');
  });
});
