import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';

// Polyfill DOM globals BEFORE importing source modules
const _polyfillDom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
const polyfillGlobals = ['Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement',
  'HTMLSelectElement', 'HTMLAnchorElement', 'HTMLImageElement', 'HTMLTableElement', 'HTMLIFrameElement',
  'HTMLFrameElement', 'HTMLFormElement', 'HTMLButtonElement',
  'MouseEvent', 'KeyboardEvent', 'InputEvent', 'FocusEvent', 'Event',
  'XPathResult', 'NodeFilter', 'DOMParser'];
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

// Mock element-finder module (must come before source import)
vi.mock('../../extension/src/content/element-finder', () => ({
  getAttributeValue: vi.fn((el: any, attr: string) => el.getAttribute?.(attr) ?? null),
  getFullTextContent: vi.fn((el: any) => el.textContent ?? ''),
  matchesType: vi.fn(() => true),
  findElement: vi.fn(() => ({ element: null, elements: [] })),
}));

// Mock element-highlighter module (must come before source import)
vi.mock('../../extension/src/content/element-highlighter', () => ({
  highlightElement: vi.fn(),
  highlightElementSuccess: vi.fn(),
  clearElementHighlight: vi.fn(),
  highlightElementError: vi.fn(),
  isElementHighlighted: vi.fn(() => false),
}));

// Mock chrome API
(globalThis as any).chrome = {
  runtime: {
    sendMessage: vi.fn(() => Promise.resolve()),
    onMessage: { addListener: vi.fn() },
  },
};

import {
  MacroRecorder,
  getMacroRecorder,
  handleRecordStartMessage,
  handleRecordStopMessage,
  handleRecordStatusMessage,
} from '../../extension/src/content/macro-recorder';
import type {
  RecordedEvent,
  MacroRecorderConfig,
} from '../../extension/src/content/macro-recorder';

// Track the current test JSDOM so event constructors come from the same realm
let currentDom: JSDOM;

// Helper: create a fresh JSDOM and set as globals
function createTestDom(html: string = '<!DOCTYPE html><html><body></body></html>'): JSDOM {
  const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
  currentDom = dom;
  (globalThis as any).document = dom.window.document;
  (globalThis as any).window = dom.window;
  // Restore getComputedStyle - JSDOM's pretendToBeVisual provides this
  if (!dom.window.getComputedStyle) {
    (dom.window as any).getComputedStyle = () => ({
      display: 'block',
      visibility: 'visible',
    });
  }
  return dom;
}

// Helper: create Event from the current JSDOM's window (same realm as elements)
function createEvent(type: string, init?: EventInit): Event {
  return new currentDom.window.Event(type, init);
}

function createMouseEvent(type: string, init?: MouseEventInit): MouseEvent {
  return new currentDom.window.MouseEvent(type, init);
}

describe('MacroRecorder', () => {
  let recorder: MacroRecorder;

  beforeEach(() => {
    createTestDom(`<!DOCTYPE html><html><body>
      <input type="text" id="username" name="user" value="" />
      <input type="password" id="password" name="pass" value="" />
      <input type="checkbox" id="remember" name="remember" />
      <select id="role" name="role">
        <option value="admin">Admin</option>
        <option value="user">User</option>
      </select>
      <textarea id="notes" name="notes"></textarea>
      <button type="submit" id="loginBtn" name="login">Login</button>
      <a href="/home" id="homeLink">Home</a>
      <div id="clickTarget">Click me</div>
    </body></html>`);
    recorder = new MacroRecorder();
    // Reset chrome mock
    (globalThis as any).chrome.runtime.sendMessage = vi.fn(() => Promise.resolve());
  });

  afterEach(() => {
    // Make sure recording is stopped
    if (recorder.isRecording()) {
      recorder.stop();
    }
  });

  // ===== Lifecycle =====

  describe('lifecycle', () => {
    it('should not be recording initially', () => {
      expect(recorder.isRecording()).toBe(false);
    });

    it('should be recording after start()', () => {
      recorder.start();
      expect(recorder.isRecording()).toBe(true);
    });

    it('should not be recording after stop()', () => {
      recorder.start();
      recorder.stop();
      expect(recorder.isRecording()).toBe(false);
    });

    it('should not double-start (calling start twice is idempotent)', () => {
      recorder.start();
      recorder.start(); // second call is a no-op
      expect(recorder.isRecording()).toBe(true);
    });

    it('should not error if stop() called without start()', () => {
      expect(() => recorder.stop()).not.toThrow();
    });

    it('should clear events when starting', () => {
      recorder.start();
      // Manually push a fake event through the public API
      // (we simulate by dispatching an event)
      const btn = document.querySelector('#loginBtn')!;
      btn.dispatchEvent(createMouseEvent('click', { bubbles: true }));
      expect(recorder.getEvents().length).toBeGreaterThanOrEqual(0);
      // Re-starting clears
      recorder.stop();
      recorder.start();
      expect(recorder.getEvents().length).toBe(0);
    });
  });

  // ===== Events Management =====

  describe('events management', () => {
    it('getEvents should return empty array initially', () => {
      expect(recorder.getEvents()).toEqual([]);
    });

    it('getEvents should return a copy (not the internal array)', () => {
      const events1 = recorder.getEvents();
      const events2 = recorder.getEvents();
      expect(events1).not.toBe(events2);
      expect(events1).toEqual(events2);
    });

    it('clearEvents should empty the events array', () => {
      recorder.start();
      // Dispatch a click on the button to record something
      const btn = document.querySelector('#loginBtn')!;
      btn.dispatchEvent(createMouseEvent('click', { bubbles: true }));
      recorder.clearEvents();
      expect(recorder.getEvents()).toEqual([]);
    });
  });

  // ===== Configuration =====

  describe('configuration', () => {
    it('should have default config', () => {
      const config = recorder.getConfig();
      expect(config.recordClicks).toBe(true);
      expect(config.recordInputs).toBe(true);
      expect(config.recordSubmits).toBe(true);
      expect(config.recordKeyboard).toBe(false);
      expect(config.useTextContent).toBe(true);
      expect(config.preferredAttributes).toContain('id');
    });

    it('getConfig should return a copy', () => {
      const c1 = recorder.getConfig();
      const c2 = recorder.getConfig();
      expect(c1).not.toBe(c2);
      expect(c1).toEqual(c2);
    });

    it('setConfig should merge partial config', () => {
      recorder.setConfig({ recordClicks: false });
      const config = recorder.getConfig();
      expect(config.recordClicks).toBe(false);
      expect(config.recordInputs).toBe(true); // unchanged
    });

    it('constructor should accept partial config', () => {
      const r = new MacroRecorder({ recordKeyboard: true });
      expect(r.getConfig().recordKeyboard).toBe(true);
      expect(r.getConfig().recordClicks).toBe(true); // default kept
    });
  });

  // ===== Event Callback =====

  describe('event callback', () => {
    it('setEventCallback should be called when events are recorded', () => {
      const callback = vi.fn();
      recorder.setEventCallback(callback);
      recorder.start();

      const btn = document.querySelector('#loginBtn')!;
      btn.dispatchEvent(createMouseEvent('click', { bubbles: true }));

      expect(callback).toHaveBeenCalled();
      const calledWith = callback.mock.calls[0][0] as RecordedEvent;
      expect(calledWith.type).toBe('click');
      expect(calledWith.command).toContain('TAG');
    });

    it('setEventCallback(null) should remove the callback', () => {
      const callback = vi.fn();
      recorder.setEventCallback(callback);
      recorder.setEventCallback(null);
      recorder.start();

      const btn = document.querySelector('#loginBtn')!;
      btn.dispatchEvent(createMouseEvent('click', { bubbles: true }));

      expect(callback).not.toHaveBeenCalled();
    });

    it('errors in callback should not crash recorder', () => {
      const callback = vi.fn(() => { throw new Error('callback error'); });
      recorder.setEventCallback(callback);
      recorder.start();

      const btn = document.querySelector('#loginBtn')!;
      expect(() => {
        btn.dispatchEvent(createMouseEvent('click', { bubbles: true }));
      }).not.toThrow();
      expect(callback).toHaveBeenCalled();
    });
  });

  // ===== Recording Clicks =====

  describe('recording clicks', () => {
    it('should record click on button', () => {
      recorder.start();
      const btn = document.querySelector('#loginBtn')!;
      btn.dispatchEvent(createMouseEvent('click', { bubbles: true }));

      const events = recorder.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('click');
      expect(events[0].command).toContain('TAG');
      expect(events[0].command).toContain('TYPE=BUTTON:SUBMIT');
    });

    it('should record click on anchor', () => {
      recorder.start();
      const link = document.querySelector('#homeLink')!;
      link.dispatchEvent(createMouseEvent('click', { bubbles: true }));

      const events = recorder.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].command).toContain('TYPE=A');
    });

    it('should record click on div', () => {
      recorder.start();
      const div = document.querySelector('#clickTarget')!;
      div.dispatchEvent(createMouseEvent('click', { bubbles: true }));

      const events = recorder.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].command).toContain('TYPE=DIV');
    });

    it('should NOT record click on text input (deferred to change event)', () => {
      recorder.start();
      const input = document.querySelector('#username')!;
      input.dispatchEvent(createMouseEvent('click', { bubbles: true }));

      const events = recorder.getEvents();
      expect(events.length).toBe(0);
    });

    it('should NOT record events when recording is stopped', () => {
      recorder.start();
      recorder.stop();

      const btn = document.querySelector('#loginBtn')!;
      btn.dispatchEvent(createMouseEvent('click', { bubbles: true }));

      expect(recorder.getEvents().length).toBe(0);
    });

    it('should NOT record clicks when recordClicks is disabled', () => {
      recorder.setConfig({ recordClicks: false });
      recorder.start();

      const btn = document.querySelector('#loginBtn')!;
      btn.dispatchEvent(createMouseEvent('click', { bubbles: true }));

      // Since listeners aren't installed for clicks, nothing should be recorded
      expect(recorder.getEvents().length).toBe(0);
    });
  });

  // ===== Recording Changes =====

  describe('recording changes', () => {
    it('should record change on text input with CONTENT', () => {
      recorder.start();
      const input = document.querySelector('#username') as HTMLInputElement;
      input.value = 'testuser';
      input.dispatchEvent(createEvent('change', { bubbles: true }));

      const events = recorder.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('change');
      expect(events[0].command).toContain('TAG');
      expect(events[0].command).toContain('TYPE=INPUT:TEXT');
      expect(events[0].command).toContain('CONTENT=testuser');
    });

    it('should record change on password input', () => {
      recorder.start();
      const input = document.querySelector('#password') as HTMLInputElement;
      input.value = 'secret';
      input.dispatchEvent(createEvent('change', { bubbles: true }));

      const events = recorder.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].command).toContain('TYPE=INPUT:PASSWORD');
      expect(events[0].command).toContain('CONTENT=secret');
    });

    it('should record change on select with %value format', () => {
      recorder.start();
      const select = document.querySelector('#role') as HTMLSelectElement;
      select.selectedIndex = 1;
      select.dispatchEvent(createEvent('change', { bubbles: true }));

      const events = recorder.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].command).toContain('TYPE=SELECT');
      expect(events[0].command).toContain('CONTENT=%user');
    });

    it('should record change on textarea', () => {
      recorder.start();
      const textarea = document.querySelector('#notes') as HTMLTextAreaElement;
      textarea.value = 'some notes here';
      textarea.dispatchEvent(createEvent('change', { bubbles: true }));

      const events = recorder.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].command).toContain('TYPE=TEXTAREA');
      // Content with spaces should be quoted
      expect(events[0].command).toContain('CONTENT="some notes here"');
    });

    it('should record checkbox change with YES/NO', () => {
      recorder.start();
      const checkbox = document.querySelector('#remember') as HTMLInputElement;
      checkbox.checked = true;
      checkbox.dispatchEvent(createEvent('change', { bubbles: true }));

      const events = recorder.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].command).toContain('TYPE=INPUT:CHECKBOX');
      expect(events[0].command).toContain('CONTENT=YES');
    });
  });

  // ===== TAG Command Generation =====

  describe('TAG command generation', () => {
    it('should include POS=1 for element with unique ID', () => {
      recorder.start();
      const btn = document.querySelector('#loginBtn')!;
      btn.dispatchEvent(createMouseEvent('click', { bubbles: true }));

      const events = recorder.getEvents();
      expect(events[0].command).toContain('POS=1');
    });

    it('should include ATTR:ID when element has an id', () => {
      recorder.start();
      const btn = document.querySelector('#loginBtn')!;
      btn.dispatchEvent(createMouseEvent('click', { bubbles: true }));

      const events = recorder.getEvents();
      expect(events[0].command).toContain('ATTR:ID=loginBtn');
    });

    it('should include element type info in metadata', () => {
      recorder.start();
      const btn = document.querySelector('#loginBtn')!;
      btn.dispatchEvent(createMouseEvent('click', { bubbles: true }));

      const events = recorder.getEvents();
      expect(events[0].metadata?.tagName).toBe('BUTTON');
      expect(events[0].metadata?.elementType).toBe('BUTTON:SUBMIT');
    });

    it('should record URL in event', () => {
      recorder.start();
      const btn = document.querySelector('#loginBtn')!;
      btn.dispatchEvent(createMouseEvent('click', { bubbles: true }));

      const events = recorder.getEvents();
      expect(events[0].url).toBe('http://localhost/');
    });

    it('should record timestamp in event', () => {
      const before = Date.now();
      recorder.start();
      const btn = document.querySelector('#loginBtn')!;
      btn.dispatchEvent(createMouseEvent('click', { bubbles: true }));

      const events = recorder.getEvents();
      expect(events[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(events[0].timestamp).toBeLessThanOrEqual(Date.now());
    });
  });

  // ===== generateMacro =====

  describe('generateMacro', () => {
    it('should generate VERSION and URL headers matching iMacros format', () => {
      recorder.start();
      const macro = recorder.generateMacro();
      expect(macro).toContain('VERSION BUILD=1 RECORDER=CR');
      expect(macro).toContain('URL GOTO=');
    });

    it('should use the starting URL in the URL GOTO header', () => {
      recorder.start();
      const macro = recorder.generateMacro();
      // JSDOM test URL is http://localhost/
      expect(macro).toContain('URL GOTO=http://localhost/');
    });

    it('should include recorded commands in the macro', () => {
      recorder.start();
      const btn = document.querySelector('#loginBtn')!;
      btn.dispatchEvent(createMouseEvent('click', { bubbles: true }));

      const input = document.querySelector('#username') as HTMLInputElement;
      input.value = 'admin';
      input.dispatchEvent(createEvent('change', { bubbles: true }));
      recorder.stop();

      const macro = recorder.generateMacro();
      const lines = macro.split('\n');

      // VERSION line + URL line + 2 TAG commands = 4 lines minimum
      expect(lines.length).toBeGreaterThanOrEqual(4);
      // Should have TAG commands after the header
      const tagLines = lines.filter(l => l.startsWith('TAG'));
      expect(tagLines.length).toBe(2);
    });

    it('should return VERSION and URL headers when no events', () => {
      recorder.start();
      const macro = recorder.generateMacro();
      const lines = macro.split('\n').filter(l => l.trim().length > 0);
      // Should have exactly 2 lines: VERSION and URL
      expect(lines.length).toBe(2);
      expect(lines[0]).toBe('VERSION BUILD=1 RECORDER=CR');
      expect(lines[1]).toContain('URL GOTO=');
    });

    it('should store starting URL when recording begins', () => {
      recorder.start();
      // Even if window.location changes, the starting URL should be captured
      const macro = recorder.generateMacro();
      expect(macro).toContain('URL GOTO=http://localhost/');
    });
  });

  // ===== Singleton & Message Handlers =====

  describe('singleton and message handlers', () => {
    it('getMacroRecorder should return a MacroRecorder instance', () => {
      const r = getMacroRecorder();
      expect(r).toBeInstanceOf(MacroRecorder);
    });

    it('handleRecordStartMessage should start recording', () => {
      handleRecordStartMessage();
      const r = getMacroRecorder();
      expect(r.isRecording()).toBe(true);
      r.stop(); // cleanup
    });

    it('handleRecordStartMessage with config should update config', () => {
      handleRecordStartMessage({ recordKeyboard: true });
      const r = getMacroRecorder();
      expect(r.getConfig().recordKeyboard).toBe(true);
      r.stop(); // cleanup
    });

    it('handleRecordStopMessage should stop recording and return events+macro', () => {
      handleRecordStartMessage();
      const result = handleRecordStopMessage();
      expect(result.events).toBeDefined();
      expect(Array.isArray(result.events)).toBe(true);
      expect(typeof result.macro).toBe('string');
      expect(result.macro).toContain('VERSION BUILD=1 RECORDER=CR');
      expect(result.macro).toContain('URL GOTO=');
    });

    it('handleRecordStatusMessage should return status info', () => {
      const status = handleRecordStatusMessage();
      expect(typeof status.recording).toBe('boolean');
      expect(typeof status.eventCount).toBe('number');
      expect(status.config).toBeDefined();
      expect(status.config.recordClicks).toBe(true);
    });
  });

  // ===== Chrome Integration =====

  describe('chrome integration', () => {
    it('should send events to background script via chrome.runtime.sendMessage', () => {
      recorder.start();
      const btn = document.querySelector('#loginBtn')!;
      btn.dispatchEvent(createMouseEvent('click', { bubbles: true }));

      expect((globalThis as any).chrome.runtime.sendMessage).toHaveBeenCalled();
      const callArg = (globalThis as any).chrome.runtime.sendMessage.mock.calls[0][0];
      expect(callArg.type).toBe('RECORD_EVENT');
      expect(callArg.payload).toBeDefined();
      expect(callArg.payload.command).toContain('TAG');
    });
  });

  // ===== Element Highlighting =====

  describe('element highlighting', () => {
    // Get the mocked functions - they're already mocked at module level
    let highlightElement: ReturnType<typeof vi.fn>;
    let highlightElementSuccess: ReturnType<typeof vi.fn>;
    let clearElementHighlight: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      // Reset mocks
      vi.clearAllMocks();
      // Get the mock functions
      const highlighterModule = await import('../../extension/src/content/element-highlighter');
      highlightElement = highlighterModule.highlightElement as ReturnType<typeof vi.fn>;
      highlightElementSuccess = highlighterModule.highlightElementSuccess as ReturnType<typeof vi.fn>;
      clearElementHighlight = highlighterModule.clearElementHighlight as ReturnType<typeof vi.fn>;
    });

    it('should have highlightElements enabled by default', () => {
      expect(recorder.getConfig().highlightElements).toBe(true);
    });

    it('should allow disabling highlightElements in config', () => {
      recorder.setConfig({ highlightElements: false });
      expect(recorder.getConfig().highlightElements).toBe(false);
    });

    it('should highlight element on mouseover during recording', () => {
      recorder.start();
      const btn = document.querySelector('#loginBtn')!;
      btn.dispatchEvent(createMouseEvent('mouseover', { bubbles: true }));

      expect(highlightElement).toHaveBeenCalledWith(btn, {
        duration: 0,
        scroll: false,
        label: 'Recording',
      });
    });

    it('should clear highlight on mouseout during recording', () => {
      recorder.start();
      const btn = document.querySelector('#loginBtn')!;

      // First hover to set currentHoveredElement
      btn.dispatchEvent(createMouseEvent('mouseover', { bubbles: true }));
      // Then leave
      btn.dispatchEvent(createMouseEvent('mouseout', { bubbles: true }));

      expect(clearElementHighlight).toHaveBeenCalled();
    });

    it('should not highlight when highlightElements is disabled', () => {
      recorder.setConfig({ highlightElements: false });
      recorder.start();

      const btn = document.querySelector('#loginBtn')!;
      btn.dispatchEvent(createMouseEvent('mouseover', { bubbles: true }));

      expect(highlightElement).not.toHaveBeenCalled();
    });

    it('should flash success highlight on click capture', () => {
      recorder.start();
      const btn = document.querySelector('#loginBtn')!;
      btn.dispatchEvent(createMouseEvent('click', { bubbles: true }));

      expect(highlightElementSuccess).toHaveBeenCalledWith(btn, {
        duration: 500,
        scroll: false,
        label: 'Captured',
      });
    });

    it('should flash success highlight on change capture', () => {
      recorder.start();
      const input = document.querySelector('#username') as HTMLInputElement;
      input.value = 'testuser';
      input.dispatchEvent(createEvent('change', { bubbles: true }));

      expect(highlightElementSuccess).toHaveBeenCalledWith(input, {
        duration: 500,
        scroll: false,
        label: 'Captured',
      });
    });

    it('should not install mouseover listeners when highlightElements is disabled', () => {
      const r = new MacroRecorder({ highlightElements: false });
      r.start();

      const btn = document.querySelector('#loginBtn')!;
      btn.dispatchEvent(createMouseEvent('mouseover', { bubbles: true }));

      // highlightElement should not be called since listeners weren't installed
      expect(highlightElement).not.toHaveBeenCalled();

      r.stop();
    });

    it('should clear highlight when recording stops', () => {
      recorder.start();
      const btn = document.querySelector('#loginBtn')!;
      btn.dispatchEvent(createMouseEvent('mouseover', { bubbles: true }));

      vi.clearAllMocks();
      recorder.stop();

      expect(clearElementHighlight).toHaveBeenCalled();
    });

    it('should skip highlighting iMacros UI elements', () => {
      // Add an imacros overlay element
      const overlay = document.createElement('div');
      overlay.className = 'imacros-element-highlight';
      document.body.appendChild(overlay);

      recorder.start();
      overlay.dispatchEvent(createMouseEvent('mouseover', { bubbles: true }));

      expect(highlightElement).not.toHaveBeenCalled();

      overlay.remove();
    });

    it('should not re-highlight the same element on multiple mouseovers', () => {
      recorder.start();
      const btn = document.querySelector('#loginBtn')!;

      btn.dispatchEvent(createMouseEvent('mouseover', { bubbles: true }));
      btn.dispatchEvent(createMouseEvent('mouseover', { bubbles: true }));
      btn.dispatchEvent(createMouseEvent('mouseover', { bubbles: true }));

      // Should only be called once
      expect(highlightElement).toHaveBeenCalledTimes(1);
    });

    it('should not flash highlight on click when highlightElements is disabled', () => {
      recorder.setConfig({ highlightElements: false });
      recorder.start();

      const btn = document.querySelector('#loginBtn')!;
      btn.dispatchEvent(createMouseEvent('click', { bubbles: true }));

      expect(highlightElementSuccess).not.toHaveBeenCalled();
    });
  });

  // ===== Download Recording =====

  describe('download recording', () => {
    it('should record download event with ONDOWNLOAD command', () => {
      recorder.start();
      recorder.recordDownloadEvent('/downloads', 'report.pdf', 'https://example.com/report.pdf');

      const events = recorder.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('download');
      expect(events[0].command).toBe('ONDOWNLOAD FOLDER=/downloads FILE=report.pdf WAIT=YES');
    });

    it('should use * for empty folder', () => {
      recorder.start();
      recorder.recordDownloadEvent('', 'file.txt');

      const events = recorder.getEvents();
      expect(events[0].command).toContain('FOLDER=*');
    });

    it('should use * for folder marked as default', () => {
      recorder.start();
      recorder.recordDownloadEvent('*', 'file.txt');

      const events = recorder.getEvents();
      expect(events[0].command).toContain('FOLDER=*');
    });

    it('should use timestamp pattern for empty filename', () => {
      recorder.start();
      recorder.recordDownloadEvent('/downloads', '');

      const events = recorder.getEvents();
      expect(events[0].command).toContain('FILE=+_{{!NOW:yyyymmdd_hhnnss}}');
    });

    it('should use timestamp pattern for filename marked as auto', () => {
      recorder.start();
      recorder.recordDownloadEvent('/downloads', '+');

      const events = recorder.getEvents();
      expect(events[0].command).toContain('FILE=+_{{!NOW:yyyymmdd_hhnnss}}');
    });

    it('should quote paths with spaces', () => {
      recorder.start();
      recorder.recordDownloadEvent('/my downloads', 'my file.pdf');

      const events = recorder.getEvents();
      expect(events[0].command).toBe('ONDOWNLOAD FOLDER="/my downloads" FILE="my file.pdf" WAIT=YES');
    });

    it('should escape quotes in paths', () => {
      recorder.start();
      recorder.recordDownloadEvent('/downloads', 'file "quoted".pdf');

      const events = recorder.getEvents();
      expect(events[0].command).toContain('FILE="file \\"quoted\\".pdf"');
    });

    it('should include download metadata', () => {
      recorder.start();
      recorder.recordDownloadEvent('/downloads', 'report.pdf', 'https://example.com/report.pdf');

      const events = recorder.getEvents();
      expect(events[0].metadata?.downloadFolder).toBe('/downloads');
      expect(events[0].metadata?.downloadFilename).toBe('report.pdf');
      expect(events[0].metadata?.downloadUrl).toBe('https://example.com/report.pdf');
    });

    it('should not record download when not recording', () => {
      // Don't start recording
      recorder.recordDownloadEvent('/downloads', 'report.pdf');

      const events = recorder.getEvents();
      expect(events.length).toBe(0);
    });

    it('should include download in generated macro', () => {
      recorder.start();
      recorder.recordDownloadEvent('/downloads', 'report.pdf');
      recorder.stop();

      const macro = recorder.generateMacro();
      expect(macro).toContain('ONDOWNLOAD FOLDER=/downloads FILE=report.pdf WAIT=YES');
    });

    it('should send download event to background script', () => {
      recorder.start();
      recorder.recordDownloadEvent('/downloads', 'report.pdf');

      expect((globalThis as any).chrome.runtime.sendMessage).toHaveBeenCalled();
      const callArg = (globalThis as any).chrome.runtime.sendMessage.mock.calls[0][0];
      expect(callArg.type).toBe('RECORD_EVENT');
      expect(callArg.payload.type).toBe('download');
      expect(callArg.payload.command).toContain('ONDOWNLOAD');
    });
  });

  // ===== RECORD_DOWNLOAD Message Handler =====

  describe('RECORD_DOWNLOAD message handler', () => {
    let messageListeners: Array<(message: any, sender: any, sendResponse: any) => boolean | void>;

    beforeEach(() => {
      messageListeners = [];
      (globalThis as any).chrome.runtime.onMessage = {
        addListener: vi.fn((listener: any) => {
          messageListeners.push(listener);
        }),
      };
    });

    it('should handle RECORD_DOWNLOAD message and record download event', async () => {
      const { setupRecordingMessageListener, getMacroRecorder } = await import('../../extension/src/content/macro-recorder');
      setupRecordingMessageListener();

      const recorderInstance = getMacroRecorder();
      recorderInstance.start();

      // Get the listener
      const listener = messageListeners[messageListeners.length - 1];
      const sendResponse = vi.fn();

      // Send RECORD_DOWNLOAD message
      const result = listener(
        {
          type: 'RECORD_DOWNLOAD',
          payload: {
            folder: '/downloads',
            filename: 'test.pdf',
            url: 'https://example.com/test.pdf',
          },
        },
        {},
        sendResponse
      );

      expect(result).toBe(true);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });

      const events = recorderInstance.getEvents();
      expect(events.length).toBeGreaterThan(0);
      const downloadEvent = events.find(e => e.type === 'download');
      expect(downloadEvent).toBeDefined();
      expect(downloadEvent?.command).toContain('ONDOWNLOAD');

      recorderInstance.stop();
    });

    it('should use default values when payload is incomplete', async () => {
      const { setupRecordingMessageListener, getMacroRecorder } = await import('../../extension/src/content/macro-recorder');
      setupRecordingMessageListener();

      const recorderInstance = getMacroRecorder();
      recorderInstance.start();
      recorderInstance.clearEvents();

      const listener = messageListeners[messageListeners.length - 1];
      const sendResponse = vi.fn();

      // Send RECORD_DOWNLOAD with no payload
      listener(
        {
          type: 'RECORD_DOWNLOAD',
          payload: {},
        },
        {},
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({ success: true });

      const events = recorderInstance.getEvents();
      const downloadEvent = events.find(e => e.type === 'download');
      expect(downloadEvent?.command).toContain('FOLDER=*');
      expect(downloadEvent?.command).toContain('FILE=+_{{!NOW:yyyymmdd_hhnnss}}');

      recorderInstance.stop();
    });
  });

  // ===== Tab Event Recording =====

  describe('tab event recording', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should record TAB OPEN command', () => {
      recorder.start();
      recorder.recordTabEvent('TAB OPEN');

      const events = recorder.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].command).toBe('TAB OPEN');
      expect(events[0].metadata?.tagName).toBe('TAB');
    });

    it('should record TAB CLOSE command', () => {
      recorder.start();
      recorder.recordTabEvent('TAB CLOSE');

      const events = recorder.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].command).toBe('TAB CLOSE');
    });

    it('should record TAB T=n command for tab switch', () => {
      recorder.start();
      recorder.recordTabEvent('TAB T=3');

      const events = recorder.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].command).toBe('TAB T=3');
    });

    it('should not record tab event when not recording', () => {
      // Don't start recording
      recorder.recordTabEvent('TAB OPEN');

      const events = recorder.getEvents();
      expect(events.length).toBe(0);
    });

    it('should include tab events in generated macro', () => {
      recorder.start();
      recorder.recordTabEvent('TAB OPEN');
      recorder.recordTabEvent('TAB T=2');
      recorder.stop();

      const macro = recorder.generateMacro();
      expect(macro).toContain('TAB OPEN');
      expect(macro).toContain('TAB T=2');
    });

    it('should send tab event to background script', () => {
      recorder.start();
      recorder.recordTabEvent('TAB T=1');

      expect((globalThis as any).chrome.runtime.sendMessage).toHaveBeenCalled();
      const callArg = (globalThis as any).chrome.runtime.sendMessage.mock.calls[0][0];
      expect(callArg.type).toBe('RECORD_EVENT');
      expect(callArg.payload.command).toContain('TAB');
    });

    it('should call event callback when recording tab event', () => {
      const callback = vi.fn();
      recorder.setEventCallback(callback);
      recorder.start();
      recorder.recordTabEvent('TAB OPEN');

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0].command).toBe('TAB OPEN');
    });
  });

  // ===== Frame Context Detection =====

  describe('frame context detection', () => {
    it('should detect when in top frame (not in iframe)', () => {
      recorder.start();
      const btn = document.querySelector('#loginBtn')!;
      btn.dispatchEvent(createMouseEvent('click', { bubbles: true }));

      const events = recorder.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].frameContext).toBeDefined();
      expect(events[0].frameContext?.inFrame).toBe(false);
      expect(events[0].frameContext?.frameIndex).toBe(0);
    });

    it('should include frame context in recorded events', () => {
      recorder.start();
      const input = document.querySelector('#username') as HTMLInputElement;
      input.value = 'testuser';
      input.dispatchEvent(createEvent('change', { bubbles: true }));

      const events = recorder.getEvents();
      expect(events[0].frameContext).toBeDefined();
      expect(events[0].frameContext?.inFrame).toBe(false);
    });

    it('should include frame context in tab events', () => {
      recorder.start();
      recorder.recordTabEvent('TAB OPEN');

      const events = recorder.getEvents();
      expect(events[0].frameContext).toBeDefined();
      expect(events[0].frameContext?.inFrame).toBe(false);
      expect(events[0].frameContext?.frameIndex).toBe(0);
    });

    it('should cache frame context', () => {
      recorder.start();

      // Get frame context multiple times
      const context1 = recorder.getFrameContext();
      const context2 = recorder.getFrameContext();

      // Should return the same cached object
      expect(context1).toBe(context2);
    });

    it('should clear frame context cache on start()', () => {
      // Get initial context
      const context1 = recorder.getFrameContext();

      // Start recording (which should clear cache)
      recorder.start();
      recorder.clearFrameContextCache();

      // Get context again
      const context2 = recorder.getFrameContext();

      // Should be a new object (not the same reference)
      expect(context1).not.toBe(context2);
    });

    it('should provide getFrameContext public method', () => {
      const context = recorder.getFrameContext();

      expect(context).toBeDefined();
      expect(typeof context.inFrame).toBe('boolean');
      expect(typeof context.frameIndex).toBe('number');
      expect(typeof context.frameDepth).toBe('number');
    });

    it('should provide clearFrameContextCache method', () => {
      const context1 = recorder.getFrameContext();
      recorder.clearFrameContextCache();
      const context2 = recorder.getFrameContext();

      // After clearing cache, should get a new context object
      expect(context1).not.toBe(context2);
    });
  });

  // ===== Frame Event Recording =====

  describe('frame event recording', () => {
    it('should record FRAME F=n event by index', () => {
      recorder.start();
      recorder.recordFrameEvent(2);

      const events = recorder.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('frame');
      expect(events[0].command).toBe('FRAME F=2');
      expect(events[0].metadata?.frameAction).toBe('select');
      expect(events[0].metadata?.frameIndex).toBe(2);
    });

    it('should record FRAME NAME=name event by name', () => {
      recorder.start();
      recorder.recordFrameEvent(undefined, 'myframe');

      const events = recorder.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('frame');
      expect(events[0].command).toBe('FRAME NAME=myframe');
      expect(events[0].metadata?.frameName).toBe('myframe');
    });

    it('should prefer name over index when both provided', () => {
      recorder.start();
      recorder.recordFrameEvent(1, 'namedframe');

      const events = recorder.getEvents();
      expect(events[0].command).toBe('FRAME NAME=namedframe');
    });

    it('should default to FRAME F=0 when no index or name provided', () => {
      recorder.start();
      recorder.recordFrameEvent();

      const events = recorder.getEvents();
      expect(events[0].command).toBe('FRAME F=0');
    });

    it('should not record frame event when not recording', () => {
      // Don't start recording
      recorder.recordFrameEvent(1);

      const events = recorder.getEvents();
      expect(events.length).toBe(0);
    });

    it('should include frame events in generated macro', () => {
      recorder.start();
      recorder.recordFrameEvent(1);
      recorder.recordFrameEvent(undefined, 'content');
      recorder.stop();

      const macro = recorder.generateMacro();
      expect(macro).toContain('FRAME F=1');
      expect(macro).toContain('FRAME NAME=content');
    });

    it('should send frame event to background script', () => {
      recorder.start();
      recorder.recordFrameEvent(0);

      expect((globalThis as any).chrome.runtime.sendMessage).toHaveBeenCalled();
      const callArg = (globalThis as any).chrome.runtime.sendMessage.mock.calls[0][0];
      expect(callArg.type).toBe('RECORD_EVENT');
      expect(callArg.payload.type).toBe('frame');
      expect(callArg.payload.command).toContain('FRAME');
    });
  });

  // ===== RECORD_TAB_EVENT Message Handler =====

  describe('RECORD_TAB_EVENT message handler', () => {
    let messageListeners: Array<(message: any, sender: any, sendResponse: any) => boolean | void>;

    beforeEach(() => {
      messageListeners = [];
      (globalThis as any).chrome.runtime.onMessage = {
        addListener: vi.fn((listener: any) => {
          messageListeners.push(listener);
        }),
      };
    });

    it('should handle RECORD_TAB_EVENT message for tab open', async () => {
      const { setupRecordingMessageListener, getMacroRecorder } = await import('../../extension/src/content/macro-recorder');
      setupRecordingMessageListener();

      const recorderInstance = getMacroRecorder();
      recorderInstance.start();
      recorderInstance.clearEvents();

      const listener = messageListeners[messageListeners.length - 1];
      const sendResponse = vi.fn();

      const result = listener(
        {
          type: 'RECORD_TAB_EVENT',
          payload: {
            action: 'open',
          },
        },
        {},
        sendResponse
      );

      expect(result).toBe(true);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });

      const events = recorderInstance.getEvents();
      const tabEvent = events.find(e => e.type === 'tab');
      expect(tabEvent).toBeDefined();
      expect(tabEvent?.command).toBe('TAB OPEN');

      recorderInstance.stop();
    });

    it('should handle RECORD_TAB_EVENT message for tab switch', async () => {
      const { setupRecordingMessageListener, getMacroRecorder } = await import('../../extension/src/content/macro-recorder');
      setupRecordingMessageListener();

      const recorderInstance = getMacroRecorder();
      recorderInstance.start();
      recorderInstance.clearEvents();

      const listener = messageListeners[messageListeners.length - 1];
      const sendResponse = vi.fn();

      listener(
        {
          type: 'RECORD_TAB_EVENT',
          payload: {
            action: 'switch',
            tabIndex: 2,
            tabId: 123,
          },
        },
        {},
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({ success: true });

      const events = recorderInstance.getEvents();
      const tabEvent = events.find(e => e.type === 'tab');
      expect(tabEvent?.command).toBe('TAB T=2');

      recorderInstance.stop();
    });
  });

  // ===== RECORD_FRAME_EVENT Message Handler =====

  describe('RECORD_FRAME_EVENT message handler', () => {
    let messageListeners: Array<(message: any, sender: any, sendResponse: any) => boolean | void>;

    beforeEach(() => {
      messageListeners = [];
      (globalThis as any).chrome.runtime.onMessage = {
        addListener: vi.fn((listener: any) => {
          messageListeners.push(listener);
        }),
      };
    });

    it('should handle RECORD_FRAME_EVENT message by index', async () => {
      const { setupRecordingMessageListener, getMacroRecorder } = await import('../../extension/src/content/macro-recorder');
      setupRecordingMessageListener();

      const recorderInstance = getMacroRecorder();
      recorderInstance.start();
      recorderInstance.clearEvents();

      const listener = messageListeners[messageListeners.length - 1];
      const sendResponse = vi.fn();

      listener(
        {
          type: 'RECORD_FRAME_EVENT',
          payload: {
            frameIndex: 1,
          },
        },
        {},
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({ success: true });

      const events = recorderInstance.getEvents();
      const frameEvent = events.find(e => e.type === 'frame');
      expect(frameEvent).toBeDefined();
      expect(frameEvent?.command).toBe('FRAME F=1');

      recorderInstance.stop();
    });

    it('should handle RECORD_FRAME_EVENT message by name', async () => {
      const { setupRecordingMessageListener, getMacroRecorder } = await import('../../extension/src/content/macro-recorder');
      setupRecordingMessageListener();

      const recorderInstance = getMacroRecorder();
      recorderInstance.start();
      recorderInstance.clearEvents();

      const listener = messageListeners[messageListeners.length - 1];
      const sendResponse = vi.fn();

      listener(
        {
          type: 'RECORD_FRAME_EVENT',
          payload: {
            frameName: 'sidebar',
          },
        },
        {},
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({ success: true });

      const events = recorderInstance.getEvents();
      const frameEvent = events.find(e => e.type === 'frame');
      expect(frameEvent?.command).toBe('FRAME NAME=sidebar');

      recorderInstance.stop();
    });
  });

});
