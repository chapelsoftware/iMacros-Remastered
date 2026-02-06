/**
 * Unit Tests for Security Dialog Components
 *
 * Tests cover:
 * - SecurityWarningDialog creation and display
 * - SecurityWarningDialog actions (run, trust-and-run, cancel)
 * - TrustedSitesDialog creation and display
 * - TrustedSitesDialog site management (add, remove)
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

// Mock chrome.storage.local (required by dependencies)
const mockStorage = {
  local: {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(undefined),
  },
};
(globalThis as any).chrome = { storage: mockStorage };

// Import after setting up globals
import {
  SecurityWarningDialog,
  showSecurityWarningDialog,
  SecurityWarningDialogOptions,
  SecurityWarningDialogResult,
} from '../../extension/src/panel/security-warning-dialog';

import {
  TrustedSitesDialog,
  showTrustedSitesDialog,
  TrustedSitesDialogOptions,
  TrustedSitesDialogResult,
} from '../../extension/src/panel/trusted-sites-dialog';

import { MacroSource, TrustedSite } from '@shared/security';

describe('SecurityWarningDialog', () => {
  let dialog: SecurityWarningDialog;

  const createMockSource = (overrides: Partial<MacroSource> = {}): MacroSource => ({
    origin: 'url',
    location: 'https://example.com/macro.iim',
    domain: 'example.com',
    trusted: false,
    loadedAt: Date.now(),
    ...overrides,
  });

  beforeEach(() => {
    window.document.body.innerHTML = '';
    dialog = new SecurityWarningDialog();
  });

  afterEach(() => {
    const overlay = window.document.querySelector('.security-warning-overlay');
    if (overlay) {
      overlay.remove();
    }
  });

  describe('dialog creation', () => {
    it('should create and display dialog overlay', async () => {
      const source = createMockSource();
      const showPromise = dialog.show({ source });

      const overlay = window.document.querySelector('.security-warning-overlay');
      expect(overlay).toBeTruthy();

      // Cancel to clean up
      const cancelBtn = window.document.querySelector('.security-warning-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await showPromise;
    });

    it('should display security warning title', async () => {
      const source = createMockSource();
      const showPromise = dialog.show({ source });

      const title = window.document.querySelector('.security-warning-title');
      expect(title?.textContent).toBe('Security Warning');

      const cancelBtn = window.document.querySelector('.security-warning-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await showPromise;
    });

    it('should display warning description', async () => {
      const source = createMockSource();
      const showPromise = dialog.show({ source });

      const description = window.document.querySelector('.security-warning-description');
      expect(description?.textContent).toContain('untrusted source');

      const cancelBtn = window.document.querySelector('.security-warning-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await showPromise;
    });

    it('should display macro name when provided', async () => {
      const source = createMockSource();
      const showPromise = dialog.show({ source, macroName: 'TestMacro' });

      const content = window.document.querySelector('.security-warning-content');
      expect(content?.textContent).toContain('TestMacro');

      const cancelBtn = window.document.querySelector('.security-warning-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await showPromise;
    });

    it('should display domain information', async () => {
      const source = createMockSource({ domain: 'test.example.com' });
      const showPromise = dialog.show({ source });

      const content = window.document.querySelector('.security-warning-content');
      expect(content?.textContent).toContain('test.example.com');

      const cancelBtn = window.document.querySelector('.security-warning-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await showPromise;
    });

    it('should show trust checkbox when domain is available', async () => {
      const source = createMockSource({ domain: 'example.com' });
      const showPromise = dialog.show({ source });

      const checkbox = window.document.querySelector('.security-warning-checkbox');
      expect(checkbox).toBeTruthy();

      const cancelBtn = window.document.querySelector('.security-warning-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await showPromise;
    });
  });

  describe('cancel action', () => {
    it('should return cancel action on cancel button click', async () => {
      const source = createMockSource();
      const showPromise = dialog.show({ source });

      const cancelBtn = window.document.querySelector('.security-warning-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();

      const result = await showPromise;
      expect(result.action).toBe('cancel');
    });

    it('should close dialog on cancel', async () => {
      const source = createMockSource();
      const showPromise = dialog.show({ source });

      const cancelBtn = window.document.querySelector('.security-warning-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await showPromise;

      const overlay = window.document.querySelector('.security-warning-overlay');
      expect(overlay).toBeFalsy();
    });

    it('should cancel on overlay click', async () => {
      const source = createMockSource();
      const showPromise = dialog.show({ source });

      const overlay = window.document.querySelector('.security-warning-overlay') as HTMLElement;
      overlay.click();

      const result = await showPromise;
      expect(result.action).toBe('cancel');
    });

    it('should cancel on Escape key', async () => {
      const source = createMockSource();
      const showPromise = dialog.show({ source });

      const dialogEl = window.document.querySelector('.security-warning-dialog') as HTMLElement;
      const event = new window.KeyboardEvent('keydown', { key: 'Escape' });
      dialogEl.dispatchEvent(event);

      const result = await showPromise;
      expect(result.action).toBe('cancel');
    });
  });

  describe('run action', () => {
    it('should return run action on run button click', async () => {
      const source = createMockSource();
      const showPromise = dialog.show({ source });

      const runBtn = window.document.querySelector('.security-warning-btn-run') as HTMLButtonElement;
      runBtn.click();

      const result = await showPromise;
      expect(result.action).toBe('run');
    });

    it('should run on Enter key', async () => {
      const source = createMockSource();
      const showPromise = dialog.show({ source });

      const dialogEl = window.document.querySelector('.security-warning-dialog') as HTMLElement;
      const event = new window.KeyboardEvent('keydown', { key: 'Enter' });
      dialogEl.dispatchEvent(event);

      const result = await showPromise;
      expect(result.action).toBe('run');
    });
  });

  describe('trust-and-run action', () => {
    it('should return trust-and-run when checkbox is checked', async () => {
      const source = createMockSource({ domain: 'trusted.com' });
      const showPromise = dialog.show({ source });

      // Check the trust checkbox
      const checkbox = window.document.querySelector('.security-warning-checkbox') as HTMLInputElement;
      checkbox.checked = true;

      const runBtn = window.document.querySelector('.security-warning-btn-run') as HTMLButtonElement;
      runBtn.click();

      const result = await showPromise;
      expect(result.action).toBe('trust-and-run');
      expect(result.trustedDomain).toBe('trusted.com');
    });

    it('should return run without trust when checkbox is unchecked', async () => {
      const source = createMockSource({ domain: 'example.com' });
      const showPromise = dialog.show({ source });

      // Ensure checkbox is unchecked
      const checkbox = window.document.querySelector('.security-warning-checkbox') as HTMLInputElement;
      checkbox.checked = false;

      const runBtn = window.document.querySelector('.security-warning-btn-run') as HTMLButtonElement;
      runBtn.click();

      const result = await showPromise;
      expect(result.action).toBe('run');
      expect(result.trustedDomain).toBeUndefined();
    });
  });

  describe('isOpen method', () => {
    it('should return true when dialog is open', async () => {
      const source = createMockSource();
      dialog.show({ source });
      expect(dialog.isOpen()).toBe(true);

      // Clean up
      const cancelBtn = window.document.querySelector('.security-warning-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();
    });

    it('should return false after dialog is closed', async () => {
      const source = createMockSource();
      const showPromise = dialog.show({ source });

      const cancelBtn = window.document.querySelector('.security-warning-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await showPromise;

      expect(dialog.isOpen()).toBe(false);
    });
  });
});

describe('showSecurityWarningDialog', () => {
  afterEach(() => {
    const overlay = window.document.querySelector('.security-warning-overlay');
    if (overlay) {
      overlay.remove();
    }
  });

  it('should create and show dialog', async () => {
    const source: MacroSource = {
      origin: 'url',
      location: 'https://example.com/test.iim',
      domain: 'example.com',
      trusted: false,
      loadedAt: Date.now(),
    };

    const showPromise = showSecurityWarningDialog({ source });

    const overlay = window.document.querySelector('.security-warning-overlay');
    expect(overlay).toBeTruthy();

    const cancelBtn = window.document.querySelector('.security-warning-btn-cancel') as HTMLButtonElement;
    cancelBtn.click();
    await showPromise;
  });
});

describe('TrustedSitesDialog', () => {
  let dialog: TrustedSitesDialog;

  const createSampleSites = (): TrustedSite[] => [
    { domain: 'example.com', trustedAt: Date.now() - 86400000, note: 'Test site' },
    { domain: '*.trusted.org', trustedAt: Date.now() },
  ];

  beforeEach(() => {
    window.document.body.innerHTML = '';
    dialog = new TrustedSitesDialog();
  });

  afterEach(() => {
    const overlay = window.document.querySelector('.trusted-sites-overlay');
    if (overlay) {
      overlay.remove();
    }
  });

  describe('dialog creation', () => {
    it('should create and display dialog overlay', async () => {
      const showPromise = dialog.show({ trustedSites: [] });

      const overlay = window.document.querySelector('.trusted-sites-overlay');
      expect(overlay).toBeTruthy();

      const cancelBtn = window.document.querySelector('.trusted-sites-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await showPromise;
    });

    it('should display title', async () => {
      const showPromise = dialog.show({ trustedSites: [] });

      const title = window.document.querySelector('.trusted-sites-title');
      expect(title?.textContent).toBe('Trusted Sites');

      const cancelBtn = window.document.querySelector('.trusted-sites-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await showPromise;
    });

    it('should show empty message when no sites', async () => {
      const showPromise = dialog.show({ trustedSites: [] });

      const emptyMsg = window.document.querySelector('.trusted-sites-empty');
      expect(emptyMsg).toBeTruthy();
      expect(emptyMsg?.textContent).toContain('No trusted sites');

      const cancelBtn = window.document.querySelector('.trusted-sites-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await showPromise;
    });

    it('should display existing sites', async () => {
      const sites = createSampleSites();
      const showPromise = dialog.show({ trustedSites: sites });

      const items = window.document.querySelectorAll('.trusted-sites-item');
      expect(items.length).toBe(2);

      const cancelBtn = window.document.querySelector('.trusted-sites-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await showPromise;
    });

    it('should display site domains', async () => {
      const sites = createSampleSites();
      const showPromise = dialog.show({ trustedSites: sites });

      const list = window.document.querySelector('.trusted-sites-list');
      expect(list?.textContent).toContain('example.com');
      expect(list?.textContent).toContain('*.trusted.org');

      const cancelBtn = window.document.querySelector('.trusted-sites-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await showPromise;
    });
  });

  describe('add site', () => {
    it('should have add input and button', async () => {
      const showPromise = dialog.show({ trustedSites: [] });

      const input = window.document.querySelector('.trusted-sites-add-input') as HTMLInputElement;
      const addBtn = window.document.querySelector('.trusted-sites-add-btn') as HTMLButtonElement;

      expect(input).toBeTruthy();
      expect(addBtn).toBeTruthy();

      const cancelBtn = window.document.querySelector('.trusted-sites-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await showPromise;
    });

    it('should add new site when clicking add button', async () => {
      const showPromise = dialog.show({ trustedSites: [] });

      const input = window.document.querySelector('.trusted-sites-add-input') as HTMLInputElement;
      input.value = 'newsite.com';

      const addBtn = window.document.querySelector('.trusted-sites-add-btn') as HTMLButtonElement;
      addBtn.click();

      const items = window.document.querySelectorAll('.trusted-sites-item');
      expect(items.length).toBe(1);

      const cancelBtn = window.document.querySelector('.trusted-sites-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await showPromise;
    });

    it('should show error for invalid domain', async () => {
      const showPromise = dialog.show({ trustedSites: [] });

      const input = window.document.querySelector('.trusted-sites-add-input') as HTMLInputElement;
      input.value = 'invalid';

      const addBtn = window.document.querySelector('.trusted-sites-add-btn') as HTMLButtonElement;
      addBtn.click();

      const error = window.document.querySelector('.trusted-sites-error');
      expect(error?.classList.contains('hidden')).toBe(false);

      const cancelBtn = window.document.querySelector('.trusted-sites-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await showPromise;
    });

    it('should add site on Enter key in input', async () => {
      const showPromise = dialog.show({ trustedSites: [] });

      const input = window.document.querySelector('.trusted-sites-add-input') as HTMLInputElement;
      input.value = 'enter-test.com';

      const event = new window.KeyboardEvent('keydown', { key: 'Enter' });
      input.dispatchEvent(event);

      const items = window.document.querySelectorAll('.trusted-sites-item');
      expect(items.length).toBe(1);

      const cancelBtn = window.document.querySelector('.trusted-sites-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await showPromise;
    });
  });

  describe('remove site', () => {
    it('should remove site when clicking remove button', async () => {
      const sites = [{ domain: 'removeme.com', trustedAt: Date.now() }];
      const showPromise = dialog.show({ trustedSites: sites });

      let items = window.document.querySelectorAll('.trusted-sites-item');
      expect(items.length).toBe(1);

      const removeBtn = window.document.querySelector('.trusted-sites-item-remove') as HTMLButtonElement;
      removeBtn.click();

      items = window.document.querySelectorAll('.trusted-sites-item');
      expect(items.length).toBe(0);

      const cancelBtn = window.document.querySelector('.trusted-sites-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await showPromise;
    });
  });

  describe('save and cancel', () => {
    it('should return saved true with updated sites on save', async () => {
      const sites = [{ domain: 'original.com', trustedAt: Date.now() }];
      const showPromise = dialog.show({ trustedSites: sites });

      // Add a new site
      const input = window.document.querySelector('.trusted-sites-add-input') as HTMLInputElement;
      input.value = 'new.com';
      const addBtn = window.document.querySelector('.trusted-sites-add-btn') as HTMLButtonElement;
      addBtn.click();

      // Save
      const saveBtn = window.document.querySelector('.trusted-sites-btn-save') as HTMLButtonElement;
      saveBtn.click();

      const result = await showPromise;
      expect(result.saved).toBe(true);
      expect(result.trustedSites?.length).toBe(2);
    });

    it('should return saved false on cancel', async () => {
      const sites = [{ domain: 'original.com', trustedAt: Date.now() }];
      const showPromise = dialog.show({ trustedSites: sites });

      const cancelBtn = window.document.querySelector('.trusted-sites-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();

      const result = await showPromise;
      expect(result.saved).toBe(false);
      expect(result.trustedSites).toBeUndefined();
    });

    it('should cancel on Escape key', async () => {
      const showPromise = dialog.show({ trustedSites: [] });

      const dialogEl = window.document.querySelector('.trusted-sites-dialog') as HTMLElement;
      const event = new window.KeyboardEvent('keydown', { key: 'Escape' });
      dialogEl.dispatchEvent(event);

      const result = await showPromise;
      expect(result.saved).toBe(false);
    });
  });

  describe('isOpen method', () => {
    it('should return true when dialog is open', async () => {
      dialog.show({ trustedSites: [] });
      expect(dialog.isOpen()).toBe(true);

      const cancelBtn = window.document.querySelector('.trusted-sites-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();
    });

    it('should return false after dialog is closed', async () => {
      const showPromise = dialog.show({ trustedSites: [] });

      const cancelBtn = window.document.querySelector('.trusted-sites-btn-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await showPromise;

      expect(dialog.isOpen()).toBe(false);
    });
  });
});

describe('showTrustedSitesDialog', () => {
  afterEach(() => {
    const overlay = window.document.querySelector('.trusted-sites-overlay');
    if (overlay) {
      overlay.remove();
    }
  });

  it('should create and show dialog', async () => {
    const showPromise = showTrustedSitesDialog({ trustedSites: [] });

    const overlay = window.document.querySelector('.trusted-sites-overlay');
    expect(overlay).toBeTruthy();

    const cancelBtn = window.document.querySelector('.trusted-sites-btn-cancel') as HTMLButtonElement;
    cancelBtn.click();
    await showPromise;
  });
});
