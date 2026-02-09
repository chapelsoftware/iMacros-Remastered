/**
 * Dialog Interceptor Unit Tests
 *
 * Tests the DialogInterceptor class: install/uninstall, alert/confirm/prompt
 * interception, auto-response with config, POS counter, event callbacks,
 * and configuration management.
 *
 * Uses JSDOM for window.alert/confirm/prompt simulation.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

// Polyfill global DOM for module imports that reference browser globals
const _polyfillDom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://example.com' });
if (typeof globalThis.Node === 'undefined') {
  (globalThis as any).Node = _polyfillDom.window.Node;
}
if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = _polyfillDom.window.document;
}
if (typeof globalThis.Element === 'undefined') {
  (globalThis as any).Element = _polyfillDom.window.Element;
}
if (typeof globalThis.HTMLElement === 'undefined') {
  (globalThis as any).HTMLElement = _polyfillDom.window.HTMLElement;
}
if (typeof globalThis.HTMLInputElement === 'undefined') {
  (globalThis as any).HTMLInputElement = _polyfillDom.window.HTMLInputElement;
}
if (typeof globalThis.HTMLTextAreaElement === 'undefined') {
  (globalThis as any).HTMLTextAreaElement = _polyfillDom.window.HTMLTextAreaElement;
}
if (typeof globalThis.HTMLSelectElement === 'undefined') {
  (globalThis as any).HTMLSelectElement = _polyfillDom.window.HTMLSelectElement;
}
if (typeof globalThis.HTMLAnchorElement === 'undefined') {
  (globalThis as any).HTMLAnchorElement = _polyfillDom.window.HTMLAnchorElement;
}
if (typeof globalThis.HTMLImageElement === 'undefined') {
  (globalThis as any).HTMLImageElement = _polyfillDom.window.HTMLImageElement;
}
if (typeof globalThis.HTMLTableElement === 'undefined') {
  (globalThis as any).HTMLTableElement = _polyfillDom.window.HTMLTableElement;
}
if (typeof globalThis.MouseEvent === 'undefined') {
  (globalThis as any).MouseEvent = _polyfillDom.window.MouseEvent;
}
if (typeof globalThis.KeyboardEvent === 'undefined') {
  (globalThis as any).KeyboardEvent = _polyfillDom.window.KeyboardEvent;
}
if (typeof globalThis.InputEvent === 'undefined') {
  (globalThis as any).InputEvent = _polyfillDom.window.InputEvent;
}
if (typeof globalThis.FocusEvent === 'undefined') {
  (globalThis as any).FocusEvent = _polyfillDom.window.FocusEvent;
}
// Force overwrite Event - Node.js has a native Event class that is
// incompatible with JSDOM's dispatchEvent (cross-realm rejection).
(globalThis as any).Event = _polyfillDom.window.Event;
if (typeof globalThis.XPathResult === 'undefined') {
  (globalThis as any).XPathResult = _polyfillDom.window.XPathResult;
}

// Set up window with alert/confirm/prompt before importing the module.
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = _polyfillDom.window;
}

// Mock chrome.runtime.getURL used at module top-level in dialog-interceptor.ts
if (typeof globalThis.chrome === 'undefined') {
  (globalThis as any).chrome = {
    runtime: {
      getURL: (path: string) => `chrome-extension://test-id/${path}`,
    },
  };
}

// Ensure window has alert/confirm/prompt
if (typeof (globalThis as any).window.alert !== 'function') {
  (globalThis as any).window.alert = () => {};
}
if (typeof (globalThis as any).window.confirm !== 'function') {
  (globalThis as any).window.confirm = () => true;
}
if (typeof (globalThis as any).window.prompt !== 'function') {
  (globalThis as any).window.prompt = () => '';
}

import {
  DialogInterceptor,
  getDialogInterceptor,
  handleDialogConfigMessage,
} from '../../extension/src/content/dialog-interceptor';

describe('DialogInterceptor', () => {
  let interceptor: DialogInterceptor;

  // Track calls to the original functions
  let alertCalls: string[];
  let confirmCalls: string[];
  let promptCalls: Array<{ message: string; defaultValue?: string }>;

  beforeEach(() => {
    alertCalls = [];
    confirmCalls = [];
    promptCalls = [];

    // Install fresh functions on window that we can track
    (globalThis as any).window.alert = (message?: string) => {
      alertCalls.push(String(message ?? ''));
    };
    (globalThis as any).window.confirm = (message?: string): boolean => {
      confirmCalls.push(String(message ?? ''));
      return true; // original mock returns true
    };
    (globalThis as any).window.prompt = (message?: string, defaultValue?: string): string | null => {
      promptCalls.push({ message: String(message ?? ''), defaultValue });
      return 'user-input'; // original mock returns 'user-input'
    };

    interceptor = new DialogInterceptor();
  });

  afterEach(() => {
    // Always uninstall to restore originals
    interceptor.uninstall();
  });

  // ============================================================
  // Install / Uninstall
  // ============================================================

  describe('install/uninstall', () => {
    it('should not be installed by default', () => {
      expect(interceptor.isInstalled()).toBe(false);
    });

    it('should be installed after calling install()', () => {
      interceptor.install();
      expect(interceptor.isInstalled()).toBe(true);
    });

    it('should be idempotent - calling install() twice does not error', () => {
      interceptor.install();
      interceptor.install();
      expect(interceptor.isInstalled()).toBe(true);
    });

    it('should not be installed after uninstall()', () => {
      interceptor.install();
      interceptor.uninstall();
      expect(interceptor.isInstalled()).toBe(false);
    });

    it('should restore original alert behavior after uninstall', () => {
      interceptor.install();
      interceptor.setConfig({ enabled: true, button: 'OK', pos: 1 });

      interceptor.uninstall();

      // After uninstall, calling window.alert should call the original (which pushes to alertCalls)
      window.alert('restored');
      expect(alertCalls).toContain('restored');
    });

    it('should restore original confirm behavior after uninstall', () => {
      interceptor.install();
      interceptor.setConfig({ enabled: true, button: 'CANCEL', pos: 1 });

      interceptor.uninstall();

      // After uninstall, calling window.confirm should call the original (which returns true)
      const result = window.confirm('restored');
      expect(result).toBe(true);
      expect(confirmCalls).toContain('restored');
    });

    it('should be idempotent - calling uninstall() when not installed does not error', () => {
      interceptor.uninstall();
      expect(interceptor.isInstalled()).toBe(false);
    });
  });

  // ============================================================
  // Configuration
  // ============================================================

  describe('configuration', () => {
    it('should have default config with enabled=false and button=OK', () => {
      const config = interceptor.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.button).toBe('OK');
      expect(config.pos).toBe(1);
    });

    it('should update config with setConfig', () => {
      interceptor.setConfig({ enabled: true, button: 'CANCEL' });
      const config = interceptor.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.button).toBe('CANCEL');
    });

    it('should merge partial config without overwriting unset fields', () => {
      interceptor.setConfig({ button: 'YES' });
      const config = interceptor.getConfig();
      expect(config.button).toBe('YES');
      expect(config.enabled).toBe(false); // unchanged
      expect(config.pos).toBe(1); // unchanged
    });

    it('should apply DialogConfig via applyDialogConfig', () => {
      interceptor.applyDialogConfig({
        pos: 3,
        button: 'NO',
        content: 'my response',
        active: true,
      });

      const config = interceptor.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.button).toBe('NO');
      expect(config.content).toBe('my response');
      expect(config.pos).toBe(3);
    });

    it('should reset counter when applyDialogConfig is called', () => {
      interceptor.install();
      interceptor.setConfig({ enabled: true, button: 'OK', pos: 1 });
      // Trigger a dialog to increment counter
      window.alert('test');

      // Now apply new config - counter should reset
      interceptor.applyDialogConfig({
        pos: 2,
        button: 'OK',
        active: true,
      });

      // Counter is reset, so next dialog should auto-respond
      const result = window.confirm('test');
      expect(result).toBe(true);
    });

    it('should return a copy of config, not a reference', () => {
      const config1 = interceptor.getConfig();
      config1.button = 'CANCEL';
      const config2 = interceptor.getConfig();
      expect(config2.button).toBe('OK'); // original unchanged
    });

    it('should report enabled state via isEnabled', () => {
      expect(interceptor.isEnabled()).toBe(false);
      interceptor.setConfig({ enabled: true });
      expect(interceptor.isEnabled()).toBe(true);
    });
  });

  // ============================================================
  // Alert interception
  // ============================================================

  describe('alert interception', () => {
    it('should suppress alert when enabled and auto-responding', () => {
      interceptor.install();
      interceptor.setConfig({ enabled: true, button: 'OK', pos: 1 });

      window.alert('Hello!');

      // Original alert should NOT have been called
      expect(alertCalls).toHaveLength(0);
    });

    it('should call original alert when not enabled', () => {
      interceptor.install();
      interceptor.setConfig({ enabled: false });

      window.alert('Hello!');

      expect(alertCalls).toContain('Hello!');
    });

    it('should report alert event via callback', () => {
      interceptor.install();
      interceptor.setConfig({ enabled: true, button: 'OK', pos: 1 });

      const events: any[] = [];
      interceptor.setEventCallback((event) => events.push(event));

      window.alert('Test message');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('alert');
      expect(events[0].message).toBe('Test message');
      expect(events[0].response.button).toBe('OK');
    });
  });

  // ============================================================
  // Confirm interception
  // ============================================================

  describe('confirm interception', () => {
    it('should return true for OK button when enabled', () => {
      interceptor.install();
      interceptor.setConfig({ enabled: true, button: 'OK', pos: 1 });

      const result = window.confirm('Proceed?');

      expect(result).toBe(true);
    });

    it('should return true for YES button when enabled', () => {
      interceptor.install();
      interceptor.setConfig({ enabled: true, button: 'YES', pos: 1 });

      const result = window.confirm('Proceed?');

      expect(result).toBe(true);
    });

    it('should return false for CANCEL button when enabled', () => {
      interceptor.install();
      interceptor.setConfig({ enabled: true, button: 'CANCEL', pos: 1 });

      const result = window.confirm('Proceed?');

      expect(result).toBe(false);
    });

    it('should return false for NO button when enabled', () => {
      interceptor.install();
      interceptor.setConfig({ enabled: true, button: 'NO', pos: 1 });

      const result = window.confirm('Proceed?');

      expect(result).toBe(false);
    });

    it('should call original confirm when not enabled', () => {
      interceptor.install();
      interceptor.setConfig({ enabled: false });

      window.confirm('Proceed?');

      expect(confirmCalls).toContain('Proceed?');
    });

    it('should report confirm event via callback', () => {
      interceptor.install();
      interceptor.setConfig({ enabled: true, button: 'CANCEL', pos: 1 });

      const events: any[] = [];
      interceptor.setEventCallback((event) => events.push(event));

      window.confirm('Are you sure?');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('confirm');
      expect(events[0].message).toBe('Are you sure?');
      expect(events[0].response.button).toBe('CANCEL');
    });
  });

  // ============================================================
  // Prompt interception
  // ============================================================

  describe('prompt interception', () => {
    it('should return configured content for OK button', () => {
      interceptor.install();
      interceptor.setConfig({ enabled: true, button: 'OK', pos: 1, content: 'auto-value' });

      const result = window.prompt('Enter name:');

      expect(result).toBe('auto-value');
    });

    it('should return defaultValue when no content is configured', () => {
      interceptor.install();
      interceptor.setConfig({ enabled: true, button: 'OK', pos: 1 });

      const result = window.prompt('Enter name:', 'default-name');

      expect(result).toBe('default-name');
    });

    it('should return empty string when no content and no defaultValue', () => {
      interceptor.install();
      interceptor.setConfig({ enabled: true, button: 'YES', pos: 1 });

      const result = window.prompt('Enter name:');

      expect(result).toBe('');
    });

    it('should return null for CANCEL button', () => {
      interceptor.install();
      interceptor.setConfig({ enabled: true, button: 'CANCEL', pos: 1 });

      const result = window.prompt('Enter name:');

      expect(result).toBeNull();
    });

    it('should return null for NO button', () => {
      interceptor.install();
      interceptor.setConfig({ enabled: true, button: 'NO', pos: 1 });

      const result = window.prompt('Enter name:');

      expect(result).toBeNull();
    });

    it('should call original prompt when not enabled', () => {
      interceptor.install();
      interceptor.setConfig({ enabled: false });

      window.prompt('Enter:', 'def');

      expect(promptCalls).toHaveLength(1);
      expect(promptCalls[0].message).toBe('Enter:');
      expect(promptCalls[0].defaultValue).toBe('def');
    });

    it('should report prompt event via callback with value', () => {
      interceptor.install();
      interceptor.setConfig({ enabled: true, button: 'OK', pos: 1, content: 'resp' });

      const events: any[] = [];
      interceptor.setEventCallback((event) => events.push(event));

      window.prompt('Question?', 'def');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('prompt');
      expect(events[0].message).toBe('Question?');
      expect(events[0].defaultValue).toBe('def');
      expect(events[0].response.button).toBe('OK');
      expect(events[0].response.value).toBe('resp');
    });
  });

  // ============================================================
  // POS counter
  // ============================================================

  describe('POS counter', () => {
    it('should auto-respond only up to POS dialogs', () => {
      interceptor.install();
      interceptor.setConfig({ enabled: true, button: 'CANCEL', pos: 2 });

      // First two should be auto-responded (CANCEL -> false)
      const r1 = window.confirm('1');
      const r2 = window.confirm('2');
      // Third should call original (which returns true from our mock)
      const r3 = window.confirm('3');

      expect(r1).toBe(false); // auto-respond: CANCEL
      expect(r2).toBe(false); // auto-respond: CANCEL
      expect(r3).toBe(true);  // original confirm mock returns true
    });

    it('should suppress alerts only up to POS count', () => {
      interceptor.install();
      interceptor.setConfig({ enabled: true, button: 'OK', pos: 1 });

      window.alert('first');
      window.alert('second');

      // First alert should be suppressed; second should call original
      expect(alertCalls).toHaveLength(1);
      expect(alertCalls[0]).toBe('second');
    });

    it('should reset counter with resetCounter', () => {
      interceptor.install();
      interceptor.setConfig({ enabled: true, button: 'CANCEL', pos: 1 });

      const r1 = window.confirm('first');
      expect(r1).toBe(false); // auto

      interceptor.resetCounter();

      const r2 = window.confirm('second');
      expect(r2).toBe(false); // auto again because counter was reset
    });
  });

  // ============================================================
  // Event callback
  // ============================================================

  describe('event callback', () => {
    it('should call the event callback for each dialog', () => {
      interceptor.install();
      interceptor.setConfig({ enabled: true, button: 'OK', pos: 10 });

      const events: any[] = [];
      interceptor.setEventCallback((e) => events.push(e));

      window.alert('a');
      window.confirm('b');
      window.prompt('c');

      expect(events).toHaveLength(3);
      expect(events[0].type).toBe('alert');
      expect(events[1].type).toBe('confirm');
      expect(events[2].type).toBe('prompt');
    });

    it('should include timestamp and url in events', () => {
      interceptor.install();
      interceptor.setConfig({ enabled: true, button: 'OK', pos: 1 });

      let event: any = null;
      interceptor.setEventCallback((e) => { event = e; });

      window.alert('test');

      expect(event.timestamp).toBeGreaterThan(0);
      expect(typeof event.url).toBe('string');
    });

    it('should handle callback errors gracefully', () => {
      interceptor.install();
      interceptor.setConfig({ enabled: true, button: 'OK', pos: 1 });

      interceptor.setEventCallback(() => { throw new Error('callback error'); });

      // Should not throw
      expect(() => window.alert('test')).not.toThrow();
    });

    it('should clear event callback with null', () => {
      interceptor.install();
      interceptor.setConfig({ enabled: true, button: 'OK', pos: 10 });

      const events: any[] = [];
      interceptor.setEventCallback((e) => events.push(e));
      window.alert('first');
      expect(events).toHaveLength(1);

      interceptor.setEventCallback(null);
      window.alert('second');
      expect(events).toHaveLength(1); // no new events
    });
  });

  // ============================================================
  // Original function pass-through
  // ============================================================

  describe('original function calls', () => {
    it('should call original alert via callOriginalAlert', () => {
      interceptor.callOriginalAlert('hello');
      expect(alertCalls).toContain('hello');
    });

    it('should call original confirm via callOriginalConfirm', () => {
      const result = interceptor.callOriginalConfirm('sure?');
      expect(confirmCalls).toContain('sure?');
      expect(result).toBe(true); // our mock returns true
    });

    it('should call original prompt via callOriginalPrompt', () => {
      const result = interceptor.callOriginalPrompt('enter:', 'def');
      expect(promptCalls).toHaveLength(1);
      expect(result).toBe('user-input'); // our mock returns 'user-input'
    });
  });

  // ============================================================
  // Singleton and helper functions
  // ============================================================

  describe('getDialogInterceptor singleton', () => {
    it('should return the same instance on multiple calls', () => {
      const a = getDialogInterceptor();
      const b = getDialogInterceptor();
      expect(a).toBe(b);
    });
  });

  describe('handleDialogConfigMessage', () => {
    it('should apply config to the singleton interceptor', () => {
      handleDialogConfigMessage({
        pos: 5,
        button: 'YES',
        content: 'hello',
        active: true,
      });

      const singleton = getDialogInterceptor();
      const config = singleton.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.button).toBe('YES');
      expect(config.content).toBe('hello');
      expect(config.pos).toBe(5);
    });
  });
});
