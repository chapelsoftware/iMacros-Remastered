/**
 * Element Highlighter Unit Tests
 *
 * Tests all element highlighting functions: scrollToElement, highlightElement,
 * highlightElementSuccess, highlightElementError, clearElementHighlight,
 * isElementHighlighted, settings management, highlightPlaybackElement,
 * handleHighlightMessage, and initializeElementHighlighter.
 *
 * Uses JSDOM for DOM simulation. All elements are created from the global
 * document (same realm) to avoid cross-realm instanceof / dispatchEvent issues.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';

// Polyfill DOM globals BEFORE importing source modules
const _polyfillDom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>');
const polyfillGlobals = ['Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement',
  'HTMLSelectElement', 'HTMLAnchorElement', 'HTMLImageElement', 'HTMLTableElement', 'HTMLIFrameElement',
  'HTMLFrameElement', 'HTMLFormElement', 'HTMLButtonElement',
  'MouseEvent', 'KeyboardEvent', 'InputEvent', 'FocusEvent', 'Event',
  'XPathResult', 'NodeFilter', 'DOMParser', 'DOMRect'];
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

// Mock chrome runtime since element-highlighter uses it in initializeElementHighlighter
(globalThis as any).chrome = {
  runtime: {
    onMessage: { addListener: vi.fn() },
  },
};

import {
  scrollToElement,
  highlightElement,
  highlightElementSuccess,
  highlightElementError,
  clearElementHighlight,
  isElementHighlighted,
  setHighlightSettings,
  getHighlightSettings,
  highlightPlaybackElement,
  handleHighlightMessage,
  initializeElementHighlighter,
} from '../../extension/src/content/element-highlighter';

const doc = globalThis.document;

/**
 * Helper: create a DOM element with a mocked getBoundingClientRect
 */
function createElement(
  tag: string = 'div',
  rect: Partial<DOMRect> = {}
): Element {
  const el = doc.createElement(tag);
  const defaultRect = {
    top: 100,
    left: 100,
    bottom: 200,
    right: 300,
    width: 200,
    height: 100,
    x: 100,
    y: 100,
    toJSON: () => ({}),
  };
  el.getBoundingClientRect = vi.fn(() => ({ ...defaultRect, ...rect } as DOMRect));
  el.scrollIntoView = vi.fn();
  doc.body.appendChild(el);
  return el;
}

/**
 * Helper: set up window dimensions
 */
function setViewportSize(width: number, height: number): void {
  Object.defineProperty(globalThis.window, 'innerWidth', { value: width, configurable: true, writable: true });
  Object.defineProperty(globalThis.window, 'innerHeight', { value: height, configurable: true, writable: true });
}

describe('Element Highlighter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Set viewport size for consistent testing
    setViewportSize(1024, 768);
    // Set scroll positions to 0
    Object.defineProperty(globalThis.window, 'scrollX', { value: 0, configurable: true, writable: true });
    Object.defineProperty(globalThis.window, 'scrollY', { value: 0, configurable: true, writable: true });
    // Reset settings to defaults
    setHighlightSettings({
      scrollToElement: true,
      highlightElement: true,
      highlightDuration: 1500,
    });
  });

  afterEach(() => {
    // Clean up any highlights
    clearElementHighlight();
    vi.advanceTimersByTime(1000);
    // Clean up DOM
    doc.body.innerHTML = '';
    // Remove injected styles
    const styleEl = doc.getElementById('imacros-highlight-styles');
    if (styleEl) {
      styleEl.remove();
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ==================== scrollToElement ====================

  describe('scrollToElement', () => {
    it('should call scrollIntoView when element is not in viewport', () => {
      const el = createElement('div', { top: -100, left: 0, bottom: -50, right: 200, width: 200, height: 50 });
      scrollToElement(el);
      expect(el.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'center',
        inline: 'center',
      });
    });

    it('should not scroll when element is already in viewport', () => {
      const el = createElement('div', { top: 100, left: 100, bottom: 200, right: 300, width: 200, height: 100 });
      scrollToElement(el);
      expect(el.scrollIntoView).not.toHaveBeenCalled();
    });

    it('should use smooth behavior by default', () => {
      const el = createElement('div', { top: -100, left: 0, bottom: -50, right: 200 });
      scrollToElement(el);
      expect(el.scrollIntoView).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: 'smooth' })
      );
    });

    it('should use auto behavior when specified', () => {
      const el = createElement('div', { top: -100, left: 0, bottom: -50, right: 200 });
      scrollToElement(el, 'auto');
      expect(el.scrollIntoView).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: 'auto' })
      );
    });

    it('should scroll when element is below viewport', () => {
      const el = createElement('div', { top: 900, left: 100, bottom: 1000, right: 300 });
      scrollToElement(el);
      expect(el.scrollIntoView).toHaveBeenCalled();
    });

    it('should scroll when element is to the right of viewport', () => {
      const el = createElement('div', { top: 100, left: 1200, bottom: 200, right: 1400 });
      scrollToElement(el);
      expect(el.scrollIntoView).toHaveBeenCalled();
    });

    it('should scroll when element top is negative', () => {
      const el = createElement('div', { top: -50, left: 100, bottom: 50, right: 300 });
      scrollToElement(el);
      expect(el.scrollIntoView).toHaveBeenCalled();
    });

    it('should scroll when element left is negative', () => {
      const el = createElement('div', { top: 100, left: -50, bottom: 200, right: 150 });
      scrollToElement(el);
      expect(el.scrollIntoView).toHaveBeenCalled();
    });

    it('should not scroll when element exactly fits viewport', () => {
      const el = createElement('div', { top: 0, left: 0, bottom: 768, right: 1024, width: 1024, height: 768 });
      scrollToElement(el);
      expect(el.scrollIntoView).not.toHaveBeenCalled();
    });
  });

  // ==================== highlightElement ====================

  describe('highlightElement', () => {
    it('should create overlay element in document.body', () => {
      const el = createElement();
      highlightElement(el);
      // Advance past the 200ms scroll delay
      vi.advanceTimersByTime(300);
      const overlay = doc.querySelector('.imacros-element-highlight');
      expect(overlay).not.toBeNull();
      expect(overlay!.parentElement).toBe(doc.body);
    });

    it('should inject styles if not already present', () => {
      const el = createElement();
      highlightElement(el);
      vi.advanceTimersByTime(300);
      const styleEl = doc.getElementById('imacros-highlight-styles');
      expect(styleEl).not.toBeNull();
      expect(styleEl!.tagName.toLowerCase()).toBe('style');
    });

    it('should not inject duplicate styles', () => {
      const el = createElement();
      highlightElement(el);
      vi.advanceTimersByTime(300);
      clearElementHighlight();
      highlightElement(el);
      vi.advanceTimersByTime(300);
      const styleEls = doc.querySelectorAll('#imacros-highlight-styles');
      expect(styleEls.length).toBe(1);
    });

    it('should remove previous highlight before creating new one', () => {
      const el1 = createElement();
      highlightElement(el1);
      vi.advanceTimersByTime(300);
      expect(doc.querySelectorAll('.imacros-element-highlight').length).toBe(1);

      const el2 = createElement();
      highlightElement(el2);
      vi.advanceTimersByTime(300);
      // Should still only have one overlay
      expect(doc.querySelectorAll('.imacros-element-highlight').length).toBe(1);
    });

    it('should create label element when label option provided', () => {
      const el = createElement();
      highlightElement(el, { label: 'TAG' });
      vi.advanceTimersByTime(300);
      const label = doc.querySelector('.imacros-element-highlight-label');
      expect(label).not.toBeNull();
      expect(label!.textContent).toBe('TAG');
    });

    it('should not create label when label option not provided', () => {
      const el = createElement();
      highlightElement(el);
      vi.advanceTimersByTime(300);
      const label = doc.querySelector('.imacros-element-highlight-label');
      expect(label).toBeNull();
    });

    it('should auto-hide after default duration of 1500ms', () => {
      const el = createElement();
      highlightElement(el);
      vi.advanceTimersByTime(300);
      expect(doc.querySelector('.imacros-element-highlight')).not.toBeNull();
      vi.advanceTimersByTime(1500);
      expect(doc.querySelector('.imacros-element-highlight')).toBeNull();
    });

    it('should auto-hide after custom duration', () => {
      const el = createElement();
      highlightElement(el, { duration: 500 });
      vi.advanceTimersByTime(300);
      expect(doc.querySelector('.imacros-element-highlight')).not.toBeNull();
      vi.advanceTimersByTime(500);
      expect(doc.querySelector('.imacros-element-highlight')).toBeNull();
    });

    it('should not auto-hide when duration is 0', () => {
      const el = createElement();
      highlightElement(el, { duration: 0 });
      vi.advanceTimersByTime(300);
      expect(doc.querySelector('.imacros-element-highlight')).not.toBeNull();
      vi.advanceTimersByTime(10000);
      expect(doc.querySelector('.imacros-element-highlight')).not.toBeNull();
    });

    it('should support custom color on overlay border', () => {
      const el = createElement();
      highlightElement(el, { color: '#00ff00' });
      vi.advanceTimersByTime(300);
      const overlay = doc.querySelector('.imacros-element-highlight') as HTMLElement;
      expect(overlay).not.toBeNull();
      // JSDOM normalizes hex colors to rgb() format
      expect(overlay.style.borderColor).toBe('rgb(0, 255, 0)');
    });

    it('should not apply inline color when using default color', () => {
      const el = createElement();
      highlightElement(el, { color: '#ff6b00' });
      vi.advanceTimersByTime(300);
      const overlay = doc.querySelector('.imacros-element-highlight') as HTMLElement;
      expect(overlay).not.toBeNull();
      // Default color should not set inline style
      expect(overlay.style.borderColor).toBe('');
    });

    it('should position overlay around the element', () => {
      const el = createElement('div', { top: 50, left: 80, width: 200, height: 100, bottom: 150, right: 280 });
      highlightElement(el);
      vi.advanceTimersByTime(300);
      const overlay = doc.querySelector('.imacros-element-highlight') as HTMLElement;
      expect(overlay).not.toBeNull();
      // rect.left - 3, rect.top - 3, rect.width + 6, rect.height + 6
      expect(overlay.style.left).toBe('77px');
      expect(overlay.style.top).toBe('47px');
      expect(overlay.style.width).toBe('206px');
      expect(overlay.style.height).toBe('106px');
    });

    it('should scroll element into view by default', () => {
      const el = createElement('div', { top: -100, left: 0, bottom: -50, right: 200 });
      highlightElement(el);
      expect(el.scrollIntoView).toHaveBeenCalled();
    });

    it('should not scroll when scroll option is false', () => {
      const el = createElement('div', { top: -100, left: 0, bottom: -50, right: 200 });
      highlightElement(el, { scroll: false });
      expect(el.scrollIntoView).not.toHaveBeenCalled();
    });

    it('should create overlay immediately when scroll is false (no delay)', () => {
      const el = createElement();
      highlightElement(el, { scroll: false });
      // With scroll=false the setTimeout delay is 0, so advance just a tick
      vi.advanceTimersByTime(1);
      expect(doc.querySelector('.imacros-element-highlight')).not.toBeNull();
    });

    it('should delay overlay creation by 200ms when scroll is true', () => {
      const el = createElement();
      highlightElement(el, { scroll: true });
      // At 100ms, overlay should not exist yet
      vi.advanceTimersByTime(100);
      expect(doc.querySelector('.imacros-element-highlight')).toBeNull();
      // At 200ms, overlay should now exist
      vi.advanceTimersByTime(100);
      expect(doc.querySelector('.imacros-element-highlight')).not.toBeNull();
    });

    it('should position label above the element', () => {
      const el = createElement('div', { top: 100, left: 80, width: 200, height: 50, bottom: 150, right: 280 });
      highlightElement(el, { label: 'CLICK' });
      vi.advanceTimersByTime(300);
      const label = doc.querySelector('.imacros-element-highlight-label') as HTMLElement;
      expect(label).not.toBeNull();
      expect(label.style.left).toBe('80px');
      expect(label.style.top).toBe('76px'); // 100 - 24
    });

    it('should position label below element when element is near top of page', () => {
      const el = createElement('div', { top: 10, left: 80, width: 200, height: 50, bottom: 60, right: 280 });
      highlightElement(el, { label: 'CLICK' });
      vi.advanceTimersByTime(300);
      const label = doc.querySelector('.imacros-element-highlight-label') as HTMLElement;
      expect(label).not.toBeNull();
      // top - 24 = 10 - 24 = -14 < 0, so should use bottom + 4 = 64
      expect(label.style.top).toBe('64px');
    });

    it('should use custom scrollBehavior', () => {
      const el = createElement('div', { top: -100, left: 0, bottom: -50, right: 200 });
      highlightElement(el, { scrollBehavior: 'auto' });
      expect(el.scrollIntoView).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: 'auto' })
      );
    });

    it('should remove label when removing previous highlight', () => {
      const el = createElement();
      highlightElement(el, { label: 'First' });
      vi.advanceTimersByTime(300);
      expect(doc.querySelector('.imacros-element-highlight-label')).not.toBeNull();

      highlightElement(el, { label: 'Second' });
      vi.advanceTimersByTime(300);
      const labels = doc.querySelectorAll('.imacros-element-highlight-label');
      expect(labels.length).toBe(1);
      expect(labels[0].textContent).toBe('Second');
    });
  });

  // ==================== highlightElementSuccess ====================

  describe('highlightElementSuccess', () => {
    it('should add success class to overlay when scroll is disabled', () => {
      // With scroll: false, overlay is created at 0ms so the 10ms class-add timer
      // can find the overlay element. With scroll: true (default), the overlay is
      // created at 200ms which is after the 10ms class-add timer fires.
      const el = createElement();
      highlightElementSuccess(el, { scroll: false });
      vi.advanceTimersByTime(1); // overlay created (0ms setTimeout)
      const overlay = doc.querySelector('.imacros-element-highlight');
      expect(overlay).not.toBeNull();
      vi.advanceTimersByTime(20); // 10ms class-add timer fires
      expect(overlay!.classList.contains('imacros-highlight-success')).toBe(true);
    });

    it('should use green color (#4caf50)', () => {
      const el = createElement();
      highlightElementSuccess(el, { scroll: false });
      vi.advanceTimersByTime(1);
      const overlay = doc.querySelector('.imacros-element-highlight') as HTMLElement;
      expect(overlay).not.toBeNull();
      // JSDOM normalizes hex colors to rgb() format
      expect(overlay.style.borderColor).toBe('rgb(76, 175, 80)');
    });

    it('should add success class to label when scroll is disabled', () => {
      const el = createElement();
      highlightElementSuccess(el, { label: 'Success', scroll: false });
      vi.advanceTimersByTime(1);
      vi.advanceTimersByTime(20);
      const label = doc.querySelector('.imacros-element-highlight-label');
      expect(label).not.toBeNull();
      expect(label!.classList.contains('imacros-label-success')).toBe(true);
    });

    it('should create overlay even with default scroll', () => {
      const el = createElement();
      highlightElementSuccess(el);
      vi.advanceTimersByTime(300);
      const overlay = doc.querySelector('.imacros-element-highlight');
      expect(overlay).not.toBeNull();
    });

    it('should pass through duration option', () => {
      const el = createElement();
      highlightElementSuccess(el, { duration: 500 });
      vi.advanceTimersByTime(300);
      expect(doc.querySelector('.imacros-element-highlight')).not.toBeNull();
      vi.advanceTimersByTime(500);
      expect(doc.querySelector('.imacros-element-highlight')).toBeNull();
    });

    it('should pass through scroll option', () => {
      const el = createElement('div', { top: -100, left: 0, bottom: -50, right: 200 });
      highlightElementSuccess(el, { scroll: false });
      expect(el.scrollIntoView).not.toHaveBeenCalled();
    });
  });

  // ==================== highlightElementError ====================

  describe('highlightElementError', () => {
    it('should add error class to overlay when scroll is disabled', () => {
      // With scroll: false, overlay is created at 0ms so the 10ms class-add timer
      // can find the overlay element.
      const el = createElement();
      highlightElementError(el, { scroll: false });
      vi.advanceTimersByTime(1); // overlay created (0ms setTimeout)
      const overlay = doc.querySelector('.imacros-element-highlight');
      expect(overlay).not.toBeNull();
      vi.advanceTimersByTime(20); // 10ms class-add timer fires
      expect(overlay!.classList.contains('imacros-highlight-error')).toBe(true);
    });

    it('should use red color (#f44336)', () => {
      const el = createElement();
      highlightElementError(el, { scroll: false });
      vi.advanceTimersByTime(1);
      const overlay = doc.querySelector('.imacros-element-highlight') as HTMLElement;
      expect(overlay).not.toBeNull();
      // JSDOM normalizes hex colors to rgb() format
      expect(overlay.style.borderColor).toBe('rgb(244, 67, 54)');
    });

    it('should create overlay even with default scroll', () => {
      const el = createElement();
      highlightElementError(el);
      vi.advanceTimersByTime(300);
      const overlay = doc.querySelector('.imacros-element-highlight');
      expect(overlay).not.toBeNull();
    });

    it('should have default duration of 3000ms', () => {
      const el = createElement();
      highlightElementError(el);
      vi.advanceTimersByTime(300);
      expect(doc.querySelector('.imacros-element-highlight')).not.toBeNull();
      vi.advanceTimersByTime(2500);
      expect(doc.querySelector('.imacros-element-highlight')).not.toBeNull();
      vi.advanceTimersByTime(500);
      expect(doc.querySelector('.imacros-element-highlight')).toBeNull();
    });

    it('should allow custom duration override', () => {
      const el = createElement();
      highlightElementError(el, { duration: 1000 });
      vi.advanceTimersByTime(300);
      expect(doc.querySelector('.imacros-element-highlight')).not.toBeNull();
      vi.advanceTimersByTime(1000);
      expect(doc.querySelector('.imacros-element-highlight')).toBeNull();
    });

    it('should add error class to label when scroll is disabled', () => {
      const el = createElement();
      highlightElementError(el, { label: 'Error', scroll: false });
      vi.advanceTimersByTime(1);
      vi.advanceTimersByTime(20);
      const label = doc.querySelector('.imacros-element-highlight-label');
      expect(label).not.toBeNull();
      expect(label!.classList.contains('imacros-label-error')).toBe(true);
    });
  });

  // ==================== clearElementHighlight ====================

  describe('clearElementHighlight', () => {
    it('should remove overlay from DOM', () => {
      const el = createElement();
      highlightElement(el);
      vi.advanceTimersByTime(300);
      expect(doc.querySelector('.imacros-element-highlight')).not.toBeNull();
      clearElementHighlight();
      expect(doc.querySelector('.imacros-element-highlight')).toBeNull();
    });

    it('should remove label from DOM', () => {
      const el = createElement();
      highlightElement(el, { label: 'Test' });
      vi.advanceTimersByTime(300);
      expect(doc.querySelector('.imacros-element-highlight-label')).not.toBeNull();
      clearElementHighlight();
      expect(doc.querySelector('.imacros-element-highlight-label')).toBeNull();
    });

    it('should clear auto-hide timeout', () => {
      const el = createElement();
      highlightElement(el, { duration: 5000 });
      vi.advanceTimersByTime(300);
      expect(doc.querySelector('.imacros-element-highlight')).not.toBeNull();
      clearElementHighlight();
      expect(doc.querySelector('.imacros-element-highlight')).toBeNull();
      // Advancing time should not cause any errors or unexpected behavior
      vi.advanceTimersByTime(5000);
    });

    it('should be safe to call when nothing is highlighted', () => {
      expect(() => clearElementHighlight()).not.toThrow();
    });

    it('should be safe to call multiple times', () => {
      const el = createElement();
      highlightElement(el);
      vi.advanceTimersByTime(300);
      clearElementHighlight();
      clearElementHighlight();
      clearElementHighlight();
      expect(doc.querySelector('.imacros-element-highlight')).toBeNull();
    });
  });

  // ==================== isElementHighlighted ====================

  describe('isElementHighlighted', () => {
    it('should return false when nothing is highlighted', () => {
      clearElementHighlight();
      vi.advanceTimersByTime(300);
      expect(isElementHighlighted()).toBe(false);
    });

    it('should return true when overlay exists', () => {
      const el = createElement();
      highlightElement(el);
      vi.advanceTimersByTime(300);
      expect(isElementHighlighted()).toBe(true);
    });

    it('should return false after clearing highlight', () => {
      const el = createElement();
      highlightElement(el);
      vi.advanceTimersByTime(300);
      expect(isElementHighlighted()).toBe(true);
      clearElementHighlight();
      expect(isElementHighlighted()).toBe(false);
    });

    it('should return false after auto-hide completes', () => {
      const el = createElement();
      highlightElement(el, { duration: 500 });
      vi.advanceTimersByTime(300);
      expect(isElementHighlighted()).toBe(true);
      vi.advanceTimersByTime(500);
      expect(isElementHighlighted()).toBe(false);
    });

    it('should return true during duration when highlight is active', () => {
      const el = createElement();
      highlightElement(el, { duration: 2000 });
      vi.advanceTimersByTime(300);
      vi.advanceTimersByTime(1000);
      expect(isElementHighlighted()).toBe(true);
    });
  });

  // ==================== setHighlightSettings / getHighlightSettings ====================

  describe('setHighlightSettings / getHighlightSettings', () => {
    it('should have default settings', () => {
      const settings = getHighlightSettings();
      expect(settings.scrollToElement).toBe(true);
      expect(settings.highlightElement).toBe(true);
      expect(settings.highlightDuration).toBe(1500);
    });

    it('should merge partial settings', () => {
      setHighlightSettings({ scrollToElement: false });
      const settings = getHighlightSettings();
      expect(settings.scrollToElement).toBe(false);
      expect(settings.highlightElement).toBe(true);
      expect(settings.highlightDuration).toBe(1500);
    });

    it('should update multiple settings at once', () => {
      setHighlightSettings({ scrollToElement: false, highlightElement: false, highlightDuration: 3000 });
      const settings = getHighlightSettings();
      expect(settings.scrollToElement).toBe(false);
      expect(settings.highlightElement).toBe(false);
      expect(settings.highlightDuration).toBe(3000);
    });

    it('should return a copy of settings (not a reference)', () => {
      const settings1 = getHighlightSettings();
      settings1.scrollToElement = false;
      const settings2 = getHighlightSettings();
      expect(settings2.scrollToElement).toBe(true);
    });

    it('should overwrite previously set values', () => {
      setHighlightSettings({ highlightDuration: 3000 });
      expect(getHighlightSettings().highlightDuration).toBe(3000);
      setHighlightSettings({ highlightDuration: 500 });
      expect(getHighlightSettings().highlightDuration).toBe(500);
    });

    it('should handle setting empty object (no changes)', () => {
      const before = getHighlightSettings();
      setHighlightSettings({});
      const after = getHighlightSettings();
      expect(after).toEqual(before);
    });
  });

  // ==================== highlightPlaybackElement ====================

  describe('highlightPlaybackElement', () => {
    it('should call highlightElement when both settings enabled', () => {
      setHighlightSettings({ scrollToElement: true, highlightElement: true });
      const el = createElement();
      highlightPlaybackElement(el);
      vi.advanceTimersByTime(300);
      expect(doc.querySelector('.imacros-element-highlight')).not.toBeNull();
    });

    it('should only scroll when highlight disabled but scroll enabled', () => {
      setHighlightSettings({ scrollToElement: true, highlightElement: false });
      const el = createElement('div', { top: -100, left: 0, bottom: -50, right: 200 });
      highlightPlaybackElement(el);
      vi.advanceTimersByTime(300);
      expect(el.scrollIntoView).toHaveBeenCalled();
      expect(doc.querySelector('.imacros-element-highlight')).toBeNull();
    });

    it('should do nothing when both disabled', () => {
      setHighlightSettings({ scrollToElement: false, highlightElement: false });
      const el = createElement('div', { top: -100, left: 0, bottom: -50, right: 200 });
      highlightPlaybackElement(el);
      vi.advanceTimersByTime(300);
      expect(el.scrollIntoView).not.toHaveBeenCalled();
      expect(doc.querySelector('.imacros-element-highlight')).toBeNull();
    });

    it('should call highlightElementError for error option', () => {
      setHighlightSettings({ scrollToElement: true, highlightElement: true });
      const el = createElement();
      highlightPlaybackElement(el, { error: true });
      vi.advanceTimersByTime(300);
      const overlay = doc.querySelector('.imacros-element-highlight') as HTMLElement;
      expect(overlay).not.toBeNull();
      // JSDOM normalizes hex to rgb
      expect(overlay.style.borderColor).toBe('rgb(244, 67, 54)');
    });

    it('should call highlightElementSuccess for success option', () => {
      setHighlightSettings({ scrollToElement: true, highlightElement: true });
      const el = createElement();
      highlightPlaybackElement(el, { success: true });
      vi.advanceTimersByTime(300);
      const overlay = doc.querySelector('.imacros-element-highlight') as HTMLElement;
      expect(overlay).not.toBeNull();
      // JSDOM normalizes hex to rgb
      expect(overlay.style.borderColor).toBe('rgb(76, 175, 80)');
    });

    it('should use settings duration for highlight', () => {
      setHighlightSettings({ highlightElement: true, highlightDuration: 750 });
      const el = createElement();
      highlightPlaybackElement(el);
      vi.advanceTimersByTime(300);
      expect(doc.querySelector('.imacros-element-highlight')).not.toBeNull();
      vi.advanceTimersByTime(750);
      expect(doc.querySelector('.imacros-element-highlight')).toBeNull();
    });

    it('should pass label option through to highlight', () => {
      setHighlightSettings({ highlightElement: true });
      const el = createElement();
      highlightPlaybackElement(el, { label: 'TAG' });
      vi.advanceTimersByTime(300);
      const label = doc.querySelector('.imacros-element-highlight-label');
      expect(label).not.toBeNull();
      expect(label!.textContent).toBe('TAG');
    });

    it('should use scroll setting from highlightSettings', () => {
      setHighlightSettings({ scrollToElement: false, highlightElement: true });
      const el = createElement('div', { top: -100, left: 0, bottom: -50, right: 200 });
      highlightPlaybackElement(el);
      expect(el.scrollIntoView).not.toHaveBeenCalled();
    });

    it('should apply error class with error option when scroll disabled', () => {
      // Disable scroll so overlay is created at 0ms, allowing the 10ms class-add
      // timer to find the overlay element
      setHighlightSettings({ highlightElement: true, scrollToElement: false });
      const el = createElement();
      highlightPlaybackElement(el, { error: true });
      vi.advanceTimersByTime(1); // overlay created (0ms setTimeout)
      vi.advanceTimersByTime(20); // 10ms class-add timer fires
      const overlay = doc.querySelector('.imacros-element-highlight');
      expect(overlay!.classList.contains('imacros-highlight-error')).toBe(true);
    });

    it('should apply success class with success option when scroll disabled', () => {
      setHighlightSettings({ highlightElement: true, scrollToElement: false });
      const el = createElement();
      highlightPlaybackElement(el, { success: true });
      vi.advanceTimersByTime(1);
      vi.advanceTimersByTime(20);
      const overlay = doc.querySelector('.imacros-element-highlight');
      expect(overlay!.classList.contains('imacros-highlight-success')).toBe(true);
    });

    it('should prefer error over success when both are set', () => {
      setHighlightSettings({ highlightElement: true });
      const el = createElement();
      highlightPlaybackElement(el, { error: true, success: true });
      vi.advanceTimersByTime(300);
      const overlay = doc.querySelector('.imacros-element-highlight') as HTMLElement;
      // error is checked first in the if/else chain; JSDOM normalizes hex to rgb
      expect(overlay.style.borderColor).toBe('rgb(244, 67, 54)');
    });
  });

  // ==================== handleHighlightMessage ====================

  describe('handleHighlightMessage', () => {
    it('should handle HIGHLIGHT_ELEMENT message with selector', () => {
      const el = createElement();
      el.id = 'test-highlight-target';
      handleHighlightMessage({
        type: 'HIGHLIGHT_ELEMENT',
        payload: { selector: '#test-highlight-target' },
      });
      vi.advanceTimersByTime(300);
      expect(doc.querySelector('.imacros-element-highlight')).not.toBeNull();
    });

    it('should handle HIGHLIGHT_ELEMENT with label', () => {
      const el = createElement();
      el.id = 'label-target';
      handleHighlightMessage({
        type: 'HIGHLIGHT_ELEMENT',
        payload: { selector: '#label-target', label: 'MyLabel' },
      });
      vi.advanceTimersByTime(300);
      const label = doc.querySelector('.imacros-element-highlight-label');
      expect(label).not.toBeNull();
      expect(label!.textContent).toBe('MyLabel');
    });

    it('should handle HIGHLIGHT_ELEMENT with success flag', () => {
      const el = createElement();
      el.id = 'success-target';
      handleHighlightMessage({
        type: 'HIGHLIGHT_ELEMENT',
        payload: { selector: '#success-target', success: true },
      });
      vi.advanceTimersByTime(300);
      const overlay = doc.querySelector('.imacros-element-highlight') as HTMLElement;
      expect(overlay).not.toBeNull();
      // JSDOM normalizes hex to rgb
      expect(overlay.style.borderColor).toBe('rgb(76, 175, 80)');
    });

    it('should handle HIGHLIGHT_ELEMENT with error flag', () => {
      const el = createElement();
      el.id = 'error-target';
      handleHighlightMessage({
        type: 'HIGHLIGHT_ELEMENT',
        payload: { selector: '#error-target', error: true },
      });
      vi.advanceTimersByTime(300);
      const overlay = doc.querySelector('.imacros-element-highlight') as HTMLElement;
      expect(overlay).not.toBeNull();
      // JSDOM normalizes hex to rgb
      expect(overlay.style.borderColor).toBe('rgb(244, 67, 54)');
    });

    it('should return true for HIGHLIGHT_ELEMENT message', () => {
      const el = createElement();
      el.id = 'return-target';
      const result = handleHighlightMessage({
        type: 'HIGHLIGHT_ELEMENT',
        payload: { selector: '#return-target' },
      });
      expect(result).toBe(true);
    });

    it('should return true for HIGHLIGHT_ELEMENT even when selector not found', () => {
      const result = handleHighlightMessage({
        type: 'HIGHLIGHT_ELEMENT',
        payload: { selector: '#nonexistent' },
      });
      expect(result).toBe(true);
    });

    it('should return true for HIGHLIGHT_ELEMENT with no selector', () => {
      const result = handleHighlightMessage({
        type: 'HIGHLIGHT_ELEMENT',
        payload: {},
      });
      expect(result).toBe(true);
    });

    it('should handle HIGHLIGHT_ELEMENT with no payload', () => {
      const result = handleHighlightMessage({
        type: 'HIGHLIGHT_ELEMENT',
      });
      expect(result).toBe(true);
    });

    it('should handle CLEAR_ELEMENT_HIGHLIGHT message', () => {
      const el = createElement();
      highlightElement(el);
      vi.advanceTimersByTime(300);
      expect(doc.querySelector('.imacros-element-highlight')).not.toBeNull();
      handleHighlightMessage({ type: 'CLEAR_ELEMENT_HIGHLIGHT' });
      expect(doc.querySelector('.imacros-element-highlight')).toBeNull();
    });

    it('should return true for CLEAR_ELEMENT_HIGHLIGHT message', () => {
      const result = handleHighlightMessage({ type: 'CLEAR_ELEMENT_HIGHLIGHT' });
      expect(result).toBe(true);
    });

    it('should handle SET_HIGHLIGHT_SETTINGS message', () => {
      handleHighlightMessage({
        type: 'SET_HIGHLIGHT_SETTINGS',
        payload: { scrollToElement: false, highlightDuration: 2000 },
      });
      const settings = getHighlightSettings();
      expect(settings.scrollToElement).toBe(false);
      expect(settings.highlightDuration).toBe(2000);
    });

    it('should return true for SET_HIGHLIGHT_SETTINGS message', () => {
      const result = handleHighlightMessage({
        type: 'SET_HIGHLIGHT_SETTINGS',
        payload: { highlightElement: false },
      });
      expect(result).toBe(true);
    });

    it('should handle SET_HIGHLIGHT_SETTINGS with no payload', () => {
      const result = handleHighlightMessage({
        type: 'SET_HIGHLIGHT_SETTINGS',
      });
      expect(result).toBe(true);
      // Settings should remain unchanged when payload is empty
    });

    it('should return false for unknown message type', () => {
      const result = handleHighlightMessage({ type: 'UNKNOWN_TYPE' });
      expect(result).toBe(false);
    });

    it('should return false for empty message type', () => {
      const result = handleHighlightMessage({ type: '' });
      expect(result).toBe(false);
    });

    it('should not create highlight when selector matches no element', () => {
      handleHighlightMessage({
        type: 'HIGHLIGHT_ELEMENT',
        payload: { selector: '#does-not-exist' },
      });
      vi.advanceTimersByTime(300);
      expect(doc.querySelector('.imacros-element-highlight')).toBeNull();
    });
  });

  // ==================== initializeElementHighlighter ====================

  describe('initializeElementHighlighter', () => {
    it('should register a chrome.runtime.onMessage listener', () => {
      const addListenerMock = vi.fn();
      (globalThis as any).chrome = {
        runtime: {
          onMessage: { addListener: addListenerMock },
        },
      };
      initializeElementHighlighter();
      expect(addListenerMock).toHaveBeenCalledTimes(1);
      expect(typeof addListenerMock.mock.calls[0][0]).toBe('function');
    });

    it('should not throw when chrome is undefined', () => {
      const original = (globalThis as any).chrome;
      (globalThis as any).chrome = undefined;
      expect(() => initializeElementHighlighter()).not.toThrow();
      (globalThis as any).chrome = original;
    });

    it('should not throw when chrome.runtime is undefined', () => {
      const original = (globalThis as any).chrome;
      (globalThis as any).chrome = {};
      expect(() => initializeElementHighlighter()).not.toThrow();
      (globalThis as any).chrome = original;
    });

    it('should not throw when chrome.runtime.onMessage is undefined', () => {
      const original = (globalThis as any).chrome;
      (globalThis as any).chrome = { runtime: {} };
      expect(() => initializeElementHighlighter()).not.toThrow();
      (globalThis as any).chrome = original;
    });

    it('should register listener that calls sendResponse on known message', () => {
      const addListenerMock = vi.fn();
      (globalThis as any).chrome = {
        runtime: {
          onMessage: { addListener: addListenerMock },
        },
      };
      initializeElementHighlighter();
      const listener = addListenerMock.mock.calls[0][0];

      const sendResponse = vi.fn();
      const result = listener({ type: 'CLEAR_ELEMENT_HIGHLIGHT' }, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
      expect(result).toBe(true);
    });

    it('should register listener that returns false for unknown message', () => {
      const addListenerMock = vi.fn();
      (globalThis as any).chrome = {
        runtime: {
          onMessage: { addListener: addListenerMock },
        },
      };
      initializeElementHighlighter();
      const listener = addListenerMock.mock.calls[0][0];

      const sendResponse = vi.fn();
      const result = listener({ type: 'SOMETHING_UNKNOWN' }, {}, sendResponse);
      expect(sendResponse).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });

  // ==================== Edge cases and integration ====================

  describe('edge cases', () => {
    it('should handle rapid highlight/clear cycles', () => {
      const el = createElement();
      for (let i = 0; i < 10; i++) {
        highlightElement(el);
        vi.advanceTimersByTime(300);
        clearElementHighlight();
      }
      expect(doc.querySelector('.imacros-element-highlight')).toBeNull();
      expect(isElementHighlighted()).toBe(false);
    });

    it('should handle highlight replacement without clearing', () => {
      const el1 = createElement();
      const el2 = createElement();
      highlightElement(el1, { label: 'First' });
      vi.advanceTimersByTime(300);
      highlightElement(el2, { label: 'Second' });
      vi.advanceTimersByTime(300);
      const overlays = doc.querySelectorAll('.imacros-element-highlight');
      const labels = doc.querySelectorAll('.imacros-element-highlight-label');
      expect(overlays.length).toBe(1);
      expect(labels.length).toBe(1);
      expect(labels[0].textContent).toBe('Second');
    });

    it('should handle element with zero dimensions', () => {
      const el = createElement('div', { top: 100, left: 100, bottom: 100, right: 100, width: 0, height: 0 });
      highlightElement(el);
      vi.advanceTimersByTime(300);
      const overlay = doc.querySelector('.imacros-element-highlight') as HTMLElement;
      expect(overlay).not.toBeNull();
      expect(overlay.style.width).toBe('6px'); // 0 + 6
      expect(overlay.style.height).toBe('6px'); // 0 + 6
    });

    it('should handle switching between success and error highlights', () => {
      // Use scroll: false so the class-add timers fire after overlay creation
      const el = createElement();
      highlightElementSuccess(el, { scroll: false });
      vi.advanceTimersByTime(1); // overlay created
      vi.advanceTimersByTime(20); // class added
      let overlay = doc.querySelector('.imacros-element-highlight');
      expect(overlay!.classList.contains('imacros-highlight-success')).toBe(true);

      highlightElementError(el, { scroll: false });
      vi.advanceTimersByTime(1); // new overlay created
      vi.advanceTimersByTime(20); // error class added
      overlay = doc.querySelector('.imacros-element-highlight');
      expect(overlay!.classList.contains('imacros-highlight-error')).toBe(true);
      // Previous success class should not remain (it is a new overlay)
      expect(overlay!.classList.contains('imacros-highlight-success')).toBe(false);
    });

    it('should handle settings changes between highlights', () => {
      setHighlightSettings({ highlightElement: true, highlightDuration: 500 });
      const el = createElement();
      highlightPlaybackElement(el);
      vi.advanceTimersByTime(300);
      expect(doc.querySelector('.imacros-element-highlight')).not.toBeNull();

      setHighlightSettings({ highlightElement: false });
      clearElementHighlight();
      const el2 = createElement('div', { top: -100, left: 0, bottom: -50, right: 200 });
      highlightPlaybackElement(el2);
      vi.advanceTimersByTime(300);
      // Should only scroll, not highlight
      expect(doc.querySelector('.imacros-element-highlight')).toBeNull();
      expect(el2.scrollIntoView).toHaveBeenCalled();
    });

    it('should handle handleHighlightMessage SET_HIGHLIGHT_SETTINGS with partial payload', () => {
      // Note: handleHighlightMessage always passes all three keys from payload,
      // so keys not present in payload become undefined and overwrite existing values
      // via spread. This tests the actual behavior of the message handler.
      setHighlightSettings({ scrollToElement: true, highlightElement: true, highlightDuration: 1500 });
      handleHighlightMessage({
        type: 'SET_HIGHLIGHT_SETTINGS',
        payload: { highlightDuration: 3000 },
      });
      const settings = getHighlightSettings();
      // scrollToElement and highlightElement become undefined because
      // payload.scrollToElement and payload.highlightElement are undefined
      expect(settings.scrollToElement).toBeUndefined();
      expect(settings.highlightElement).toBeUndefined();
      expect(settings.highlightDuration).toBe(3000);
    });

    it('should style injection survive across multiple highlights', () => {
      const el = createElement();
      highlightElement(el);
      vi.advanceTimersByTime(300);
      clearElementHighlight();
      highlightElement(el);
      vi.advanceTimersByTime(300);
      clearElementHighlight();
      highlightElement(el);
      vi.advanceTimersByTime(300);
      const styleEls = doc.querySelectorAll('#imacros-highlight-styles');
      expect(styleEls.length).toBe(1);
    });
  });
});
