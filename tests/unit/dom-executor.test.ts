/**
 * DOM Executor Unit Tests
 *
 * Comprehensive tests for the dom-executor module covering:
 * - Anchor state management (setAnchor, getAnchor, clearAnchor)
 * - DOM_ERROR_CODES constants
 * - parseMultiSelectValues parsing
 * - matchesSelectTextPattern matching
 * - executeSearchCommand (TXT and REGEXP source types)
 * - executeTagCommand (element finding, extraction, content setting)
 * - executeClickCommand (coordinate clicks, button types)
 * - executeEventCommand (mouse, keyboard, focus, form events)
 * - handleDOMCommand message routing
 *
 * Uses JSDOM for DOM simulation and vi.mock for dependency isolation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';

// Polyfill DOM globals BEFORE importing source modules
const _polyfillDom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
const polyfillGlobals = [
  'Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement',
  'HTMLSelectElement', 'HTMLAnchorElement', 'HTMLImageElement', 'HTMLTableElement',
  'HTMLIFrameElement', 'HTMLFrameElement', 'HTMLFormElement', 'HTMLButtonElement',
  'MouseEvent', 'KeyboardEvent', 'InputEvent', 'FocusEvent',
  'CustomEvent', 'WheelEvent',
  'XPathResult', 'NodeFilter', 'DOMParser',
];
for (const name of polyfillGlobals) {
  if (typeof (globalThis as any)[name] === 'undefined' && (_polyfillDom.window as any)[name]) {
    (globalThis as any)[name] = (_polyfillDom.window as any)[name];
  }
}
// Force overwrite Event and CustomEvent - Node.js has native classes that are
// incompatible with JSDOM's dispatchEvent (cross-realm rejection).
(globalThis as any).Event = _polyfillDom.window.Event;
(globalThis as any).CustomEvent = _polyfillDom.window.CustomEvent;
if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = _polyfillDom.window.document;
}
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = _polyfillDom.window;
}

// Polyfill elementFromPoint - not available in JSDOM but needed by executeClickCommand.
// Returns documentElement as fallback (matches the || doc.documentElement fallback in source).
if (typeof globalThis.document.elementFromPoint !== 'function') {
  (globalThis.document as any).elementFromPoint = () => globalThis.document.documentElement;
}

// Mock chrome runtime
(globalThis as any).chrome = {
  runtime: {
    sendMessage: vi.fn(() => Promise.resolve()),
    onMessage: { addListener: vi.fn() },
  },
};

// Mock element-finder
vi.mock('@extension/content/element-finder', () => ({
  findElement: vi.fn(() => ({ element: null, elements: [], count: 0 })),
  findElementWithWait: vi.fn(async () => ({ element: null, elements: [], count: 0 })),
  findElementInFrame: vi.fn(() => ({ element: null, elements: [], count: 0 })),
  findElementInFrameWithWait: vi.fn(async () => ({ element: null, elements: [], count: 0 })),
  getCurrentFrameDocument: vi.fn(() => globalThis.document),
  findByTagSelector: vi.fn(() => ({ element: null, elements: [], count: 0 })),
  parseTagSelector: vi.fn(() => null),
  getAttributeValue: vi.fn(() => null),
  XPathAmbiguousError: class XPathAmbiguousError extends Error {
    matchCount: number;
    constructor(xpath: string, matchCount: number) {
      super(`ambiguous XPath expression: ${xpath}`);
      this.name = 'XPathAmbiguousError';
      this.matchCount = matchCount;
    }
  },
}));

// Mock event-dispatcher
vi.mock('@extension/content/event-dispatcher', () => ({
  dispatchClick: vi.fn(() => ({ mouseover: true, mousedown: true, mouseup: true, click: true })),
  dispatchDoubleClick: vi.fn(() => ({ firstClick: {}, secondClick: {}, dblclick: true })),
  dispatchRightClick: vi.fn(() => ({ mouseover: true, mousedown: true, mouseup: true, contextmenu: true })),
  dispatchMouseEvent: vi.fn(() => true),
  dispatchKeyboardEvent: vi.fn(() => true),
  dispatchKeyPress: vi.fn(() => ({ keydown: true, keypress: true, keyup: true })),
  dispatchInputEvent: vi.fn(() => true),
  dispatchFocusEvent: vi.fn(() => true),
  focusElement: vi.fn(() => ({ focusin: true, focus: true })),
  typeText: vi.fn(),
}));

// Mock element-highlighter
vi.mock('@extension/content/element-highlighter', () => ({
  highlightPlaybackElement: vi.fn(),
  highlightElement: vi.fn(),
  highlightElementSuccess: vi.fn(),
  clearElementHighlight: vi.fn(),
}));

import {
  setAnchor,
  getAnchor,
  clearAnchor,
  DOM_ERROR_CODES,
  parseMultiSelectValues,
  matchesSelectTextPattern,
  handleDOMCommand,
  executeTagCommand,
  executeClickCommand,
  executeEventCommand,
  executeSearchCommand,
  executeTag,
  executeClick,
  executeEvent,
} from '@extension/content/dom-executor';

import {
  findElementInFrame,
  findElementInFrameWithWait,
  getCurrentFrameDocument,
} from '@extension/content/element-finder';

import {
  dispatchClick,
  dispatchDoubleClick,
  dispatchRightClick,
  dispatchMouseEvent,
  dispatchKeyboardEvent,
  dispatchKeyPress,
  dispatchInputEvent,
  dispatchFocusEvent,
  focusElement,
} from '@extension/content/event-dispatcher';

import { highlightPlaybackElement } from '@extension/content/element-highlighter';

import type {
  TagCommandMessage,
  ClickCommandMessage,
  EventCommandMessage,
  SearchCommandMessage,
} from '@shared/commands/interaction';

// ===== Test Helpers =====

/**
 * Create a fresh JSDOM document for tests that need custom HTML content
 */
function createTestDocument(html: string): Document {
  const dom = new JSDOM(html, { url: 'https://example.com' });
  return dom.window.document;
}

/**
 * Create a TAG_COMMAND message
 */
function makeTagMessage(overrides: Partial<TagCommandMessage['payload']> = {}): TagCommandMessage {
  return {
    id: 'test_tag_1',
    type: 'TAG_COMMAND',
    timestamp: Date.now(),
    payload: {
      selector: { type: 'INPUT', attr: 'NAME:test' },
      action: {},
      timeout: 100,
      waitVisible: false,
      ...overrides,
    },
  };
}

/**
 * Create a CLICK_COMMAND message
 */
function makeClickMessage(overrides: Partial<ClickCommandMessage['payload']> = {}): ClickCommandMessage {
  return {
    id: 'test_click_1',
    type: 'CLICK_COMMAND',
    timestamp: Date.now(),
    payload: {
      x: 100,
      y: 200,
      button: 'left',
      clickCount: 1,
      modifiers: {},
      ...overrides,
    },
  };
}

/**
 * Create an EVENT_COMMAND message
 */
function makeEventMessage(overrides: Partial<EventCommandMessage['payload']> = {}): EventCommandMessage {
  return {
    id: 'test_event_1',
    type: 'EVENT_COMMAND',
    timestamp: Date.now(),
    payload: {
      eventType: 'click',
      bubbles: true,
      cancelable: true,
      ...overrides,
    },
  };
}

/**
 * Create a SEARCH_COMMAND message
 */
function makeSearchMessage(overrides: Partial<SearchCommandMessage['payload']> = {}): SearchCommandMessage {
  return {
    id: 'test_search_1',
    type: 'SEARCH_COMMAND',
    timestamp: Date.now(),
    payload: {
      sourceType: 'TXT',
      pattern: 'hello',
      ignoreCase: false,
      ...overrides,
    },
  };
}

/**
 * Helper: make element-finder return a specific element
 */
function mockElementFound(element: Element): void {
  vi.mocked(findElementInFrame).mockReturnValue({ element, elements: [element], count: 1 });
  vi.mocked(findElementInFrameWithWait).mockResolvedValue({ element, elements: [element], count: 1 });
}

/**
 * Helper: make element-finder return no element
 */
function mockElementNotFound(): void {
  vi.mocked(findElementInFrame).mockReturnValue({ element: null, elements: [], count: 0 });
  vi.mocked(findElementInFrameWithWait).mockResolvedValue({ element: null, elements: [], count: 0 });
}

// ===== Tests =====

describe('DOM Executor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAnchor();
    // Reset getCurrentFrameDocument to return globalThis.document
    vi.mocked(getCurrentFrameDocument).mockReturnValue(globalThis.document as any);
    mockElementNotFound();
  });

  // ===== Anchor Management =====

  describe('Anchor Management', () => {
    it('should return null initially', () => {
      expect(getAnchor()).toBeNull();
    });

    it('should return the set element', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      setAnchor(el);
      expect(getAnchor()).toBe(el);
      document.body.removeChild(el);
    });

    it('should clear the anchor', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      setAnchor(el);
      expect(getAnchor()).toBe(el);
      clearAnchor();
      expect(getAnchor()).toBeNull();
      document.body.removeChild(el);
    });

    it('should return null if element was removed from DOM (isConnected check)', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      setAnchor(el);
      expect(getAnchor()).toBe(el);
      // Remove from DOM
      document.body.removeChild(el);
      expect(getAnchor()).toBeNull();
    });

    it('should allow setting anchor to null', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      setAnchor(el);
      setAnchor(null);
      expect(getAnchor()).toBeNull();
      document.body.removeChild(el);
    });

    it('should update anchor when set again', () => {
      const el1 = document.createElement('div');
      const el2 = document.createElement('span');
      document.body.appendChild(el1);
      document.body.appendChild(el2);
      setAnchor(el1);
      expect(getAnchor()).toBe(el1);
      setAnchor(el2);
      expect(getAnchor()).toBe(el2);
      document.body.removeChild(el1);
      document.body.removeChild(el2);
    });
  });

  // ===== DOM_ERROR_CODES =====

  describe('DOM_ERROR_CODES', () => {
    it('should have OK = 0', () => {
      expect(DOM_ERROR_CODES.OK).toBe(0);
    });

    it('should have ELEMENT_NOT_FOUND = -920', () => {
      expect(DOM_ERROR_CODES.ELEMENT_NOT_FOUND).toBe(-920);
    });

    it('should have ELEMENT_NOT_VISIBLE = -921', () => {
      expect(DOM_ERROR_CODES.ELEMENT_NOT_VISIBLE).toBe(-921);
    });

    it('should have XPATH_AMBIGUOUS = -923', () => {
      expect(DOM_ERROR_CODES.XPATH_AMBIGUOUS).toBe(-923);
    });

    it('should have ELEMENT_NOT_ENABLED = -924', () => {
      expect(DOM_ERROR_CODES.ELEMENT_NOT_ENABLED).toBe(-924);
    });

    it('should have TIMEOUT = -930', () => {
      expect(DOM_ERROR_CODES.TIMEOUT).toBe(-930);
    });

    it('should have INVALID_SELECTOR = -912', () => {
      expect(DOM_ERROR_CODES.INVALID_SELECTOR).toBe(-912);
    });

    it('should have INVALID_PARAMETER = -912', () => {
      expect(DOM_ERROR_CODES.INVALID_PARAMETER).toBe(-912);
    });

    it('should have EXECUTION_ERROR = -970', () => {
      expect(DOM_ERROR_CODES.EXECUTION_ERROR).toBe(-970);
    });

    it('INVALID_SELECTOR and INVALID_PARAMETER should share the same value', () => {
      expect(DOM_ERROR_CODES.INVALID_SELECTOR).toBe(DOM_ERROR_CODES.INVALID_PARAMETER);
    });

    it('should be read-only (as const)', () => {
      // All values should be numbers
      for (const key of Object.keys(DOM_ERROR_CODES)) {
        expect(typeof (DOM_ERROR_CODES as any)[key]).toBe('number');
      }
    });
  });

  // ===== parseMultiSelectValues =====

  describe('parseMultiSelectValues', () => {
    it('should parse %"val1":%"val2":%"val3" into array', () => {
      expect(parseMultiSelectValues('%"val1":%"val2":%"val3"')).toEqual(['val1', 'val2', 'val3']);
    });

    it('should parse %val1:%val2 (no quotes) into array', () => {
      expect(parseMultiSelectValues('%val1:%val2')).toEqual(['val1', 'val2']);
    });

    it('should handle single quoted value', () => {
      expect(parseMultiSelectValues('%"singleval"')).toEqual(['singleval']);
    });

    it('should handle single unquoted value', () => {
      expect(parseMultiSelectValues('%singleval')).toEqual(['singleval']);
    });

    it('should handle mixed quoted and unquoted values', () => {
      expect(parseMultiSelectValues('%"val1":%val2')).toEqual(['val1', 'val2']);
    });

    it('should strip single quotes as well', () => {
      expect(parseMultiSelectValues("%'val1':%'val2'")).toEqual(['val1', 'val2']);
    });

    it('should handle empty string input', () => {
      expect(parseMultiSelectValues('')).toEqual([]);
    });

    it('should skip empty values after splitting', () => {
      // If all tokens after stripping are empty, return empty
      expect(parseMultiSelectValues('%')).toEqual([]);
    });

    it('should handle values with spaces', () => {
      expect(parseMultiSelectValues('%"hello world":%"foo bar"')).toEqual(['hello world', 'foo bar']);
    });

    it('should handle many values', () => {
      const result = parseMultiSelectValues('%"a":%"b":%"c":%"d":%"e"');
      expect(result).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    it('should handle values containing special characters', () => {
      expect(parseMultiSelectValues('%"val.1":%"val-2"')).toEqual(['val.1', 'val-2']);
    });

    it('should trim whitespace around tokens', () => {
      expect(parseMultiSelectValues('%"val1" :% "val2"')).toEqual(['val1', 'val2']);
    });
  });

  // ===== matchesSelectTextPattern =====

  describe('matchesSelectTextPattern', () => {
    it('should match exact text (case-insensitive)', () => {
      expect(matchesSelectTextPattern('United States', 'United States')).toBe(true);
    });

    it('should match case-insensitively for exact match', () => {
      expect(matchesSelectTextPattern('united states', 'United States')).toBe(true);
      expect(matchesSelectTextPattern('UNITED STATES', 'united states')).toBe(true);
    });

    it('should reject non-matching exact text', () => {
      expect(matchesSelectTextPattern('United Kingdom', 'United States')).toBe(false);
    });

    it('should match wildcard at end', () => {
      expect(matchesSelectTextPattern('United States', 'United*')).toBe(true);
      expect(matchesSelectTextPattern('United Kingdom', 'United*')).toBe(true);
    });

    it('should reject wildcard at end when prefix does not match', () => {
      expect(matchesSelectTextPattern('Canada', 'United*')).toBe(false);
    });

    it('should match wildcard at start', () => {
      expect(matchesSelectTextPattern('United States', '*States')).toBe(true);
      expect(matchesSelectTextPattern('Confederate States', '*States')).toBe(true);
    });

    it('should reject wildcard at start when suffix does not match', () => {
      expect(matchesSelectTextPattern('United Kingdom', '*States')).toBe(false);
    });

    it('should match wildcard in middle', () => {
      expect(matchesSelectTextPattern('United States', 'United*States')).toBe(true);
      expect(matchesSelectTextPattern('United Arab States', 'United*States')).toBe(true);
    });

    it('should handle multiple wildcards', () => {
      expect(matchesSelectTextPattern('United States of America', 'U*States*America')).toBe(true);
      expect(matchesSelectTextPattern('United States of America', '*States*')).toBe(true);
    });

    it('should be case-insensitive for wildcard patterns', () => {
      expect(matchesSelectTextPattern('united states', 'United*')).toBe(true);
      expect(matchesSelectTextPattern('UNITED STATES', 'united*')).toBe(true);
    });

    it('should handle whitespace tolerance in exact match', () => {
      expect(matchesSelectTextPattern('  United States  ', 'United States')).toBe(true);
    });

    it('should handle whitespace tolerance in wildcard match', () => {
      expect(matchesSelectTextPattern('  United States  ', 'United*')).toBe(true);
    });

    it('should match single wildcard against any text', () => {
      expect(matchesSelectTextPattern('anything at all', '*')).toBe(true);
      expect(matchesSelectTextPattern('', '*')).toBe(true);
    });

    it('should handle empty pattern without wildcard', () => {
      expect(matchesSelectTextPattern('', '')).toBe(true);
    });

    it('should escape regex special characters in pattern', () => {
      expect(matchesSelectTextPattern('price (USD)', 'price (USD)')).toBe(true);
      expect(matchesSelectTextPattern('value [1]', 'value [1]')).toBe(true);
      expect(matchesSelectTextPattern('a+b', 'a+b')).toBe(true);
    });

    it('should not match partial text without wildcards', () => {
      expect(matchesSelectTextPattern('United States of America', 'United States')).toBe(false);
    });

    it('should handle wildcard matching across special chars', () => {
      expect(matchesSelectTextPattern('price (100 USD)', 'price*USD)')).toBe(true);
    });
  });

  // ===== executeSearchCommand =====

  describe('executeSearchCommand', () => {
    let testDoc: Document;

    beforeEach(() => {
      // Set up a test document with known content for search
      testDoc = createTestDocument(`<!DOCTYPE html><html><body>
        <h1>Welcome to iMacros</h1>
        <p>This is a test page with some content.</p>
        <p>Price: $42.99</p>
        <p>Email: user@example.com</p>
        <span class="data">Order #12345</span>
        <div id="multi">Line one
Line two
Line three</div>
      </body></html>`);
      vi.mocked(getCurrentFrameDocument).mockReturnValue(testDoc as any);
    });

    describe('TXT source type', () => {
      it('should find plain text in page', async () => {
        const result = await executeSearchCommand(makeSearchMessage({
          sourceType: 'TXT',
          pattern: 'Welcome to iMacros',
        }));
        expect(result.success).toBe(true);
        expect(result.errorCode).toBe(DOM_ERROR_CODES.OK);
        expect(result.extractedData).toContain('Welcome');
      });

      it('should support wildcard matching with *', async () => {
        const result = await executeSearchCommand(makeSearchMessage({
          sourceType: 'TXT',
          pattern: 'Welcome*iMacros',
        }));
        expect(result.success).toBe(true);
        expect(result.extractedData).toContain('Welcome');
        expect(result.extractedData).toContain('iMacros');
      });

      it('should return error when text not found', async () => {
        const result = await executeSearchCommand(makeSearchMessage({
          sourceType: 'TXT',
          pattern: 'nonexistent text xyz',
        }));
        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(DOM_ERROR_CODES.ELEMENT_NOT_FOUND);
        expect(result.errorMessage).toContain('Pattern not found');
      });

      it('should support case-insensitive search', async () => {
        const result = await executeSearchCommand(makeSearchMessage({
          sourceType: 'TXT',
          pattern: 'welcome to imacros',
          ignoreCase: true,
        }));
        expect(result.success).toBe(true);
      });

      it('should be case-sensitive by default', async () => {
        const result = await executeSearchCommand(makeSearchMessage({
          sourceType: 'TXT',
          pattern: 'welcome to imacros',
          ignoreCase: false,
        }));
        expect(result.success).toBe(false);
      });

      it('should match across HTML tags with wildcard', async () => {
        const result = await executeSearchCommand(makeSearchMessage({
          sourceType: 'TXT',
          pattern: 'iMacros*test page',
        }));
        expect(result.success).toBe(true);
      });

      it('should handle special regex characters in TXT pattern', async () => {
        const result = await executeSearchCommand(makeSearchMessage({
          sourceType: 'TXT',
          pattern: 'Price: $42.99',
        }));
        // The $ and . are escaped in TXT mode
        expect(result.success).toBe(true);
      });

      it('should handle wildcard at start', async () => {
        const result = await executeSearchCommand(makeSearchMessage({
          sourceType: 'TXT',
          pattern: '*iMacros',
        }));
        expect(result.success).toBe(true);
      });

      it('should handle wildcard at end', async () => {
        const result = await executeSearchCommand(makeSearchMessage({
          sourceType: 'TXT',
          pattern: 'Welcome*',
        }));
        expect(result.success).toBe(true);
      });
    });

    describe('REGEXP source type', () => {
      it('should find with regex pattern', async () => {
        const result = await executeSearchCommand(makeSearchMessage({
          sourceType: 'REGEXP',
          pattern: 'Order #\\d+',
        }));
        expect(result.success).toBe(true);
        expect(result.extractedData).toBe('Order #12345');
      });

      it('should support capture groups with extractPattern', async () => {
        const result = await executeSearchCommand(makeSearchMessage({
          sourceType: 'REGEXP',
          pattern: 'Order #(\\d+)',
          extractPattern: '$1',
        }));
        expect(result.success).toBe(true);
        expect(result.extractedData).toBe('12345');
      });

      it('should support multiple capture groups', async () => {
        const result = await executeSearchCommand(makeSearchMessage({
          sourceType: 'REGEXP',
          pattern: '(Order) #(\\d+)',
          extractPattern: '$1-$2',
        }));
        expect(result.success).toBe(true);
        expect(result.extractedData).toBe('Order-12345');
      });

      it('should return full match when no extractPattern given', async () => {
        const result = await executeSearchCommand(makeSearchMessage({
          sourceType: 'REGEXP',
          pattern: 'user@[a-z]+\\.com',
        }));
        expect(result.success).toBe(true);
        expect(result.extractedData).toBe('user@example.com');
      });

      it('should return error for pattern not found', async () => {
        const result = await executeSearchCommand(makeSearchMessage({
          sourceType: 'REGEXP',
          pattern: 'NOMATCH\\d{10}',
        }));
        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(DOM_ERROR_CODES.ELEMENT_NOT_FOUND);
      });

      it('should return error for invalid regex', async () => {
        const result = await executeSearchCommand(makeSearchMessage({
          sourceType: 'REGEXP',
          pattern: '[invalid(regex',
        }));
        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(DOM_ERROR_CODES.INVALID_PARAMETER);
        expect(result.errorMessage).toContain('Invalid regular expression');
      });

      it('should support case-insensitive regex', async () => {
        const result = await executeSearchCommand(makeSearchMessage({
          sourceType: 'REGEXP',
          pattern: 'WELCOME TO IMACROS',
          ignoreCase: true,
        }));
        expect(result.success).toBe(true);
      });

      it('should handle extractPattern with non-existent group', async () => {
        const result = await executeSearchCommand(makeSearchMessage({
          sourceType: 'REGEXP',
          pattern: 'Order #(\\d+)',
          extractPattern: '$1-$5',
        }));
        expect(result.success).toBe(true);
        // $5 does not exist, should be replaced with empty string
        expect(result.extractedData).toBe('12345-');
      });

      it('should not apply extractPattern for TXT source type', async () => {
        const result = await executeSearchCommand(makeSearchMessage({
          sourceType: 'TXT',
          pattern: 'Order*12345',
          extractPattern: '$1',
        }));
        expect(result.success).toBe(true);
        // extractPattern is ignored for TXT, should return full match
        expect(result.extractedData).toContain('Order');
      });
    });

    describe('edge cases', () => {
      it('should search in innerHTML of documentElement', async () => {
        // The search operates on doc.documentElement.innerHTML
        const result = await executeSearchCommand(makeSearchMessage({
          sourceType: 'TXT',
          pattern: 'class="data"',
        }));
        expect(result.success).toBe(true);
      });

      it('should handle empty page content gracefully', async () => {
        const emptyDoc = createTestDocument('<!DOCTYPE html><html><body></body></html>');
        vi.mocked(getCurrentFrameDocument).mockReturnValue(emptyDoc as any);
        const result = await executeSearchCommand(makeSearchMessage({
          sourceType: 'TXT',
          pattern: 'anything',
        }));
        expect(result.success).toBe(false);
      });
    });
  });

  // ===== executeTagCommand =====

  describe('executeTagCommand', () => {
    it('should return ELEMENT_NOT_FOUND when no element matches', async () => {
      mockElementNotFound();
      const result = await executeTagCommand(makeTagMessage());
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(DOM_ERROR_CODES.ELEMENT_NOT_FOUND);
    });

    it('should return success when element found', async () => {
      const el = document.createElement('input');
      el.type = 'text';
      document.body.appendChild(el);
      mockElementFound(el);

      const result = await executeTagCommand(makeTagMessage({
        selector: { type: 'INPUT', attr: 'TYPE:text' },
        action: { content: 'hello' },
      }));
      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(DOM_ERROR_CODES.OK);
      document.body.removeChild(el);
    });

    it('should set content on input element', async () => {
      const el = document.createElement('input');
      el.type = 'text';
      document.body.appendChild(el);
      mockElementFound(el);

      await executeTagCommand(makeTagMessage({
        action: { content: 'test value' },
      }));
      expect(el.value).toBe('test value');
      document.body.removeChild(el);
    });

    it('should set content on textarea element', async () => {
      const el = document.createElement('textarea');
      document.body.appendChild(el);
      mockElementFound(el);

      await executeTagCommand(makeTagMessage({
        action: { content: 'multiline text' },
      }));
      expect(el.value).toBe('multiline text');
      document.body.removeChild(el);
    });

    it('should handle checkbox with YES value', async () => {
      const el = document.createElement('input');
      el.type = 'checkbox';
      el.checked = false;
      document.body.appendChild(el);
      mockElementFound(el);

      await executeTagCommand(makeTagMessage({
        action: { content: 'YES' },
      }));
      expect(el.checked).toBe(true);
      document.body.removeChild(el);
    });

    it('should handle checkbox with NO value (using other content)', async () => {
      const el = document.createElement('input');
      el.type = 'checkbox';
      el.checked = true;
      document.body.appendChild(el);
      mockElementFound(el);

      await executeTagCommand(makeTagMessage({
        action: { content: 'NO' },
      }));
      expect(el.checked).toBe(false);
      document.body.removeChild(el);
    });

    it('should extract TXT from element', async () => {
      const el = document.createElement('div');
      el.textContent = 'Hello World';
      document.body.appendChild(el);
      mockElementFound(el);

      const result = await executeTagCommand(makeTagMessage({
        action: { extract: 'TXT' },
      }));
      expect(result.success).toBe(true);
      expect(result.extractedData).toBe('Hello World');
      document.body.removeChild(el);
    });

    it('should extract value from input element with TXT extract type', async () => {
      const el = document.createElement('input');
      el.type = 'text';
      el.value = 'input value';
      document.body.appendChild(el);
      mockElementFound(el);

      const result = await executeTagCommand(makeTagMessage({
        action: { extract: 'TXT' },
      }));
      expect(result.success).toBe(true);
      expect(result.extractedData).toBe('input value');
      document.body.removeChild(el);
    });

    it('should extract HREF from anchor element', async () => {
      const el = document.createElement('a');
      el.setAttribute('href', 'https://example.com');
      document.body.appendChild(el);
      mockElementFound(el);

      const result = await executeTagCommand(makeTagMessage({
        action: { extract: 'HREF' },
      }));
      expect(result.success).toBe(true);
      expect(result.extractedData).toContain('example.com');
      document.body.removeChild(el);
    });

    it('should return #EANF# when extracting HREF from element without href', async () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      mockElementFound(el);

      const result = await executeTagCommand(makeTagMessage({
        action: { extract: 'HREF' },
      }));
      expect(result.success).toBe(true);
      expect(result.extractedData).toBe('#EANF#');
      document.body.removeChild(el);
    });

    it('should extract HTM (outerHTML) from element', async () => {
      const el = document.createElement('span');
      el.id = 'test-span';
      el.textContent = 'hello';
      document.body.appendChild(el);
      mockElementFound(el);

      const result = await executeTagCommand(makeTagMessage({
        action: { extract: 'HTM' },
      }));
      expect(result.success).toBe(true);
      expect(result.extractedData).toContain('<span');
      expect(result.extractedData).toContain('hello');
      document.body.removeChild(el);
    });

    it('should extract ID from element', async () => {
      const el = document.createElement('div');
      el.id = 'my-div';
      document.body.appendChild(el);
      mockElementFound(el);

      const result = await executeTagCommand(makeTagMessage({
        action: { extract: 'ID' },
      }));
      expect(result.success).toBe(true);
      expect(result.extractedData).toBe('my-div');
      document.body.removeChild(el);
    });

    it('should extract CLASS from element', async () => {
      const el = document.createElement('div');
      el.className = 'foo bar';
      document.body.appendChild(el);
      mockElementFound(el);

      const result = await executeTagCommand(makeTagMessage({
        action: { extract: 'CLASS' },
      }));
      expect(result.success).toBe(true);
      expect(result.extractedData).toBe('foo bar');
      document.body.removeChild(el);
    });

    it('should return #EANF# for NAME extract on element without name', async () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      mockElementFound(el);

      const result = await executeTagCommand(makeTagMessage({
        action: { extract: 'NAME' },
      }));
      expect(result.success).toBe(true);
      expect(result.extractedData).toBe('#EANF#');
      document.body.removeChild(el);
    });

    it('should extract NAME from element with name attribute', async () => {
      const el = document.createElement('input');
      el.name = 'username';
      document.body.appendChild(el);
      mockElementFound(el);

      const result = await executeTagCommand(makeTagMessage({
        action: { extract: 'NAME' },
      }));
      expect(result.success).toBe(true);
      expect(result.extractedData).toBe('username');
      document.body.removeChild(el);
    });

    it('should extract VALUE from input', async () => {
      const el = document.createElement('input');
      el.type = 'text';
      el.value = 'test-value';
      document.body.appendChild(el);
      mockElementFound(el);

      const result = await executeTagCommand(makeTagMessage({
        action: { extract: 'VALUE' },
      }));
      expect(result.success).toBe(true);
      expect(result.extractedData).toBe('test-value');
      document.body.removeChild(el);
    });

    it('should extract CHECKED as YES for checked checkbox', async () => {
      const el = document.createElement('input');
      el.type = 'checkbox';
      el.checked = true;
      document.body.appendChild(el);
      mockElementFound(el);

      const result = await executeTagCommand(makeTagMessage({
        action: { extract: 'CHECKED' },
      }));
      expect(result.success).toBe(true);
      expect(result.extractedData).toBe('YES');
      document.body.removeChild(el);
    });

    it('should extract CHECKED as NO for unchecked checkbox', async () => {
      const el = document.createElement('input');
      el.type = 'checkbox';
      el.checked = false;
      document.body.appendChild(el);
      mockElementFound(el);

      const result = await executeTagCommand(makeTagMessage({
        action: { extract: 'CHECKED' },
      }));
      expect(result.success).toBe(true);
      expect(result.extractedData).toBe('NO');
      document.body.removeChild(el);
    });

    it('should click element when no action specified', async () => {
      const el = document.createElement('button');
      document.body.appendChild(el);
      mockElementFound(el);

      const clickSpy = vi.spyOn(el, 'click');
      await executeTagCommand(makeTagMessage({
        action: {},
      }));
      expect(clickSpy).toHaveBeenCalled();
      document.body.removeChild(el);
    });

    it('should update anchor after successful TAG execution', async () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      mockElementFound(el);

      await executeTagCommand(makeTagMessage());
      expect(getAnchor()).toBe(el);
      document.body.removeChild(el);
    });

    it('should include elementInfo in successful response', async () => {
      const el = document.createElement('div');
      el.id = 'info-test';
      el.className = 'test-class';
      document.body.appendChild(el);
      mockElementFound(el);

      const result = await executeTagCommand(makeTagMessage());
      expect(result.elementInfo).toBeDefined();
      expect(result.elementInfo?.tagName).toBe('DIV');
      expect(result.elementInfo?.id).toBe('info-test');
      expect(result.elementInfo?.className).toBe('test-class');
      document.body.removeChild(el);
    });

    it('should return ELEMENT_NOT_ENABLED for disabled element', async () => {
      const el = document.createElement('input');
      el.type = 'text';
      el.disabled = true;
      document.body.appendChild(el);
      mockElementFound(el);

      const result = await executeTagCommand(makeTagMessage({
        action: { content: 'value' },
      }));
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(DOM_ERROR_CODES.ELEMENT_NOT_ENABLED);
      document.body.removeChild(el);
    });

    it('should set select value with % prefix', async () => {
      const select = document.createElement('select');
      const opt1 = document.createElement('option');
      opt1.value = 'us'; opt1.text = 'United States';
      const opt2 = document.createElement('option');
      opt2.value = 'uk'; opt2.text = 'United Kingdom';
      select.appendChild(opt1);
      select.appendChild(opt2);
      document.body.appendChild(select);
      mockElementFound(select);

      await executeTagCommand(makeTagMessage({
        action: { content: '%uk' },
      }));
      expect(select.value).toBe('uk');
      document.body.removeChild(select);
    });

    it('should set select index with # prefix', async () => {
      const select = document.createElement('select');
      const opt1 = document.createElement('option');
      opt1.value = 'a'; opt1.text = 'Option A';
      const opt2 = document.createElement('option');
      opt2.value = 'b'; opt2.text = 'Option B';
      select.appendChild(opt1);
      select.appendChild(opt2);
      document.body.appendChild(select);
      mockElementFound(select);

      await executeTagCommand(makeTagMessage({
        action: { content: '#2' },
      }));
      expect(select.selectedIndex).toBe(1); // 1-based -> 0-based
      document.body.removeChild(select);
    });

    it('should return error for invalid select value with % prefix', async () => {
      const select = document.createElement('select');
      const opt1 = document.createElement('option');
      opt1.value = 'a'; opt1.text = 'Option A';
      select.appendChild(opt1);
      document.body.appendChild(select);
      mockElementFound(select);

      const result = await executeTagCommand(makeTagMessage({
        action: { content: '%nonexistent' },
      }));
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(DOM_ERROR_CODES.EXECUTION_ERROR);
      expect(result.errorMessage).toContain('Selected entry not available');
      document.body.removeChild(select);
    });

    it('should return error for out-of-range select index', async () => {
      const select = document.createElement('select');
      const opt1 = document.createElement('option');
      opt1.value = 'a'; opt1.text = 'A';
      select.appendChild(opt1);
      document.body.appendChild(select);
      mockElementFound(select);

      const result = await executeTagCommand(makeTagMessage({
        action: { content: '#99' },
      }));
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(DOM_ERROR_CODES.EXECUTION_ERROR);
      document.body.removeChild(select);
    });

    it('should select by visible text with $ prefix', async () => {
      const select = document.createElement('select');
      const opt1 = document.createElement('option');
      opt1.value = 'a'; opt1.text = 'Apple';
      const opt2 = document.createElement('option');
      opt2.value = 'b'; opt2.text = 'Banana';
      select.appendChild(opt1);
      select.appendChild(opt2);
      document.body.appendChild(select);
      mockElementFound(select);

      await executeTagCommand(makeTagMessage({
        action: { content: '$Banana' },
      }));
      expect(select.selectedIndex).toBe(1);
      document.body.removeChild(select);
    });

    it('should select by visible text with wildcard $ prefix', async () => {
      const select = document.createElement('select');
      const opt1 = document.createElement('option');
      opt1.value = 'a'; opt1.text = 'Apple Pie';
      const opt2 = document.createElement('option');
      opt2.value = 'b'; opt2.text = 'Banana Split';
      select.appendChild(opt1);
      select.appendChild(opt2);
      document.body.appendChild(select);
      mockElementFound(select);

      await executeTagCommand(makeTagMessage({
        action: { content: '$Ban*' },
      }));
      expect(select.selectedIndex).toBe(1);
      document.body.removeChild(select);
    });

    it('should extract TXTALL from select (all options joined)', async () => {
      const select = document.createElement('select');
      const opt1 = document.createElement('option');
      opt1.text = 'Apple';
      const opt2 = document.createElement('option');
      opt2.text = 'Banana';
      const opt3 = document.createElement('option');
      opt3.text = 'Cherry';
      select.appendChild(opt1);
      select.appendChild(opt2);
      select.appendChild(opt3);
      document.body.appendChild(select);
      mockElementFound(select);

      const result = await executeTagCommand(makeTagMessage({
        action: { extract: 'TXTALL' },
      }));
      expect(result.success).toBe(true);
      expect(result.extractedData).toBe('Apple[OPTION]Banana[OPTION]Cherry');
      document.body.removeChild(select);
    });
  });

  // ===== executeClickCommand =====

  describe('executeClickCommand', () => {
    it('should dispatch left click at coordinates', async () => {
      const result = await executeClickCommand(makeClickMessage({
        x: 100,
        y: 200,
        button: 'left',
      }));
      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(DOM_ERROR_CODES.OK);
      expect(vi.mocked(dispatchClick)).toHaveBeenCalled();
    });

    it('should dispatch right click', async () => {
      const result = await executeClickCommand(makeClickMessage({
        button: 'right',
      }));
      expect(result.success).toBe(true);
      expect(vi.mocked(dispatchRightClick)).toHaveBeenCalled();
    });

    it('should dispatch double click when clickCount is 2', async () => {
      const result = await executeClickCommand(makeClickMessage({
        clickCount: 2,
      }));
      expect(result.success).toBe(true);
      expect(vi.mocked(dispatchDoubleClick)).toHaveBeenCalled();
    });

    it('should dispatch middle click', async () => {
      const result = await executeClickCommand(makeClickMessage({
        button: 'middle',
      }));
      expect(result.success).toBe(true);
      expect(vi.mocked(dispatchMouseEvent)).toHaveBeenCalled();
    });

    it('should return elementInfo in response', async () => {
      const result = await executeClickCommand(makeClickMessage());
      expect(result.success).toBe(true);
      expect(result.elementInfo).toBeDefined();
    });

    it('should handle viewport coordinate mode', async () => {
      const result = await executeClickCommand(makeClickMessage({
        coordinateMode: 'viewport',
      }));
      expect(result.success).toBe(true);
    });

    it('should set content on element at click coordinates when content provided', async () => {
      // Create an input element and make elementFromPoint return it
      const input = document.createElement('input');
      input.type = 'text';
      document.body.appendChild(input);

      // Mock elementFromPoint to return our input
      const origElementFromPoint = document.elementFromPoint;
      document.elementFromPoint = vi.fn(() => input) as any;

      const result = await executeClickCommand(makeClickMessage({
        content: 'typed value',
      }));
      expect(result.success).toBe(true);
      expect(input.value).toBe('typed value');

      document.elementFromPoint = origElementFromPoint;
      document.body.removeChild(input);
    });
  });

  // ===== executeEventCommand =====

  describe('executeEventCommand', () => {
    it('should dispatch click event on documentElement when no selector', async () => {
      const result = await executeEventCommand(makeEventMessage({
        eventType: 'click',
      }));
      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(DOM_ERROR_CODES.OK);
      expect(vi.mocked(dispatchClick)).toHaveBeenCalled();
    });

    it('should dispatch dblclick event', async () => {
      const result = await executeEventCommand(makeEventMessage({
        eventType: 'dblclick',
      }));
      expect(result.success).toBe(true);
      expect(vi.mocked(dispatchDoubleClick)).toHaveBeenCalled();
    });

    it('should dispatch contextmenu event', async () => {
      const result = await executeEventCommand(makeEventMessage({
        eventType: 'contextmenu',
      }));
      expect(result.success).toBe(true);
      expect(vi.mocked(dispatchRightClick)).toHaveBeenCalled();
    });

    it('should dispatch mousedown event', async () => {
      const result = await executeEventCommand(makeEventMessage({
        eventType: 'mousedown',
      }));
      expect(result.success).toBe(true);
      expect(vi.mocked(dispatchMouseEvent)).toHaveBeenCalledWith(
        expect.anything(),
        'mousedown',
        expect.any(Object),
      );
    });

    it('should dispatch mouseup event', async () => {
      const result = await executeEventCommand(makeEventMessage({
        eventType: 'mouseup',
      }));
      expect(result.success).toBe(true);
      expect(vi.mocked(dispatchMouseEvent)).toHaveBeenCalledWith(
        expect.anything(),
        'mouseup',
        expect.any(Object),
      );
    });

    it('should dispatch mouseover event', async () => {
      const result = await executeEventCommand(makeEventMessage({
        eventType: 'mouseover',
      }));
      expect(result.success).toBe(true);
      expect(vi.mocked(dispatchMouseEvent)).toHaveBeenCalledWith(
        expect.anything(),
        'mouseover',
        expect.any(Object),
      );
    });

    it('should dispatch mousemove event', async () => {
      const result = await executeEventCommand(makeEventMessage({
        eventType: 'mousemove',
      }));
      expect(result.success).toBe(true);
    });

    it('should dispatch keydown event', async () => {
      const result = await executeEventCommand(makeEventMessage({
        eventType: 'keydown',
        key: 'Enter',
      }));
      expect(result.success).toBe(true);
      expect(vi.mocked(dispatchKeyboardEvent)).toHaveBeenCalledWith(
        expect.anything(),
        'keydown',
        expect.objectContaining({ key: 'Enter' }),
      );
    });

    it('should dispatch keyup event', async () => {
      const result = await executeEventCommand(makeEventMessage({
        eventType: 'keyup',
        key: 'Escape',
      }));
      expect(result.success).toBe(true);
      expect(vi.mocked(dispatchKeyboardEvent)).toHaveBeenCalledWith(
        expect.anything(),
        'keyup',
        expect.objectContaining({ key: 'Escape' }),
      );
    });

    it('should dispatch focus event', async () => {
      const result = await executeEventCommand(makeEventMessage({
        eventType: 'focus',
      }));
      expect(result.success).toBe(true);
      expect(vi.mocked(dispatchFocusEvent)).toHaveBeenCalledWith(
        expect.anything(),
        'focus',
      );
    });

    it('should dispatch blur event', async () => {
      const result = await executeEventCommand(makeEventMessage({
        eventType: 'blur',
      }));
      expect(result.success).toBe(true);
      expect(vi.mocked(dispatchFocusEvent)).toHaveBeenCalledWith(
        expect.anything(),
        'blur',
      );
    });

    it('should dispatch input event', async () => {
      const result = await executeEventCommand(makeEventMessage({
        eventType: 'input',
      }));
      expect(result.success).toBe(true);
      expect(vi.mocked(dispatchInputEvent)).toHaveBeenCalled();
    });

    it('should dispatch change event', async () => {
      const result = await executeEventCommand(makeEventMessage({
        eventType: 'change',
      }));
      expect(result.success).toBe(true);
    });

    it('should handle KEYS array parameter', async () => {
      const result = await executeEventCommand(makeEventMessage({
        eventType: 'keydown',
        keys: ['a', 'b', 'c'],
      }));
      expect(result.success).toBe(true);
      // Should fire keyPress for each key
      expect(vi.mocked(dispatchKeyPress)).toHaveBeenCalledTimes(3);
    });

    it('should handle CHARS parameter for typing sequence', async () => {
      const result = await executeEventCommand(makeEventMessage({
        eventType: 'keydown',
        chars: 'ab',
      }));
      expect(result.success).toBe(true);
      // For each char: keydown + keypress + input + keyup = 3 keyboard events + 1 input per char
      expect(vi.mocked(dispatchKeyboardEvent)).toHaveBeenCalled();
      expect(vi.mocked(dispatchInputEvent)).toHaveBeenCalled();
    });

    it('should handle POINTS array parameter for mousemove sequence', async () => {
      const result = await executeEventCommand(makeEventMessage({
        eventType: 'mousemove',
        points: [{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 60 }],
      }));
      expect(result.success).toBe(true);
      expect(vi.mocked(dispatchMouseEvent)).toHaveBeenCalledTimes(3);
    });

    it('should pass modifier keys to events', async () => {
      await executeEventCommand(makeEventMessage({
        eventType: 'click',
        modifiers: { ctrl: true, shift: true },
      }));
      expect(vi.mocked(dispatchClick)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          ctrlKey: true,
          shiftKey: true,
        }),
      );
    });

    it('should pass point coordinates to mouse events', async () => {
      await executeEventCommand(makeEventMessage({
        eventType: 'click',
        point: { x: 42, y: 84 },
      }));
      expect(vi.mocked(dispatchClick)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          clientX: 42,
          clientY: 84,
        }),
      );
    });

    it('should return ELEMENT_NOT_VISIBLE when element with selector not found', async () => {
      mockElementNotFound();
      const result = await executeEventCommand(makeEventMessage({
        eventType: 'click',
        selector: { css: '.nonexistent' },
        timeout: 100,
      }));
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(DOM_ERROR_CODES.ELEMENT_NOT_VISIBLE);
    });

    it('should highlight element after event dispatch', async () => {
      await executeEventCommand(makeEventMessage({
        eventType: 'click',
      }));
      expect(vi.mocked(highlightPlaybackElement)).toHaveBeenCalled();
    });

    it('should dispatch scroll event', async () => {
      const result = await executeEventCommand(makeEventMessage({
        eventType: 'scroll',
      }));
      expect(result.success).toBe(true);
    });

    it('should dispatch custom event for unknown event types', async () => {
      const result = await executeEventCommand(makeEventMessage({
        eventType: 'myCustomEvent' as any,
      }));
      expect(result.success).toBe(true);
    });

    it('should dispatch submit event on form element', async () => {
      // When targeting documentElement (no selector), the submit event
      // dispatches on the closest form or the element itself. For documentElement
      // it tries element.closest('form') which returns null for non-form elements.
      const result = await executeEventCommand(makeEventMessage({
        eventType: 'submit',
      }));
      expect(result.success).toBe(true);
    });

    it('should dispatch reset event', async () => {
      const result = await executeEventCommand(makeEventMessage({
        eventType: 'reset',
      }));
      expect(result.success).toBe(true);
    });
  });

  // ===== handleDOMCommand =====

  describe('handleDOMCommand', () => {
    it('should route TAG_COMMAND to executeTagCommand', async () => {
      mockElementNotFound();
      const result = await handleDOMCommand(makeTagMessage());
      // TAG with no element found returns error
      expect(result.errorCode).toBe(DOM_ERROR_CODES.ELEMENT_NOT_FOUND);
    });

    it('should route CLICK_COMMAND to executeClickCommand', async () => {
      const result = await handleDOMCommand(makeClickMessage());
      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(DOM_ERROR_CODES.OK);
    });

    it('should route EVENT_COMMAND to executeEventCommand', async () => {
      const result = await handleDOMCommand(makeEventMessage());
      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(DOM_ERROR_CODES.OK);
    });

    it('should route SEARCH_COMMAND to executeSearchCommand', async () => {
      const testDoc = createTestDocument('<html><body>searchable text</body></html>');
      vi.mocked(getCurrentFrameDocument).mockReturnValue(testDoc as any);
      const result = await handleDOMCommand(makeSearchMessage({
        pattern: 'searchable',
      }));
      expect(result.success).toBe(true);
    });

    it('should return INVALID_PARAMETER for unknown command type', async () => {
      const result = await handleDOMCommand({
        id: 'test',
        type: 'UNKNOWN_COMMAND' as any,
        timestamp: Date.now(),
        payload: {},
      } as any);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(DOM_ERROR_CODES.INVALID_PARAMETER);
      expect(result.errorMessage).toContain('Unknown command type');
    });

    it('should include the unknown type name in error message', async () => {
      const result = await handleDOMCommand({
        id: 'test',
        type: 'WEIRD_TYPE' as any,
        timestamp: Date.now(),
        payload: {},
      } as any);
      expect(result.errorMessage).toContain('WEIRD_TYPE');
    });
  });

  // ===== Direct Execution API =====

  describe('executeTag (direct API)', () => {
    it('should create proper TagCommandMessage and execute', async () => {
      const el = document.createElement('div');
      el.textContent = 'Direct API Test';
      document.body.appendChild(el);
      mockElementFound(el);

      const result = await executeTag(
        { type: 'DIV' },
        { extract: 'TXT' },
        { timeout: 1000, waitVisible: false },
      );
      expect(result.success).toBe(true);
      expect(result.extractedData).toBe('Direct API Test');
      document.body.removeChild(el);
    });

    it('should use defaults when options not provided', async () => {
      mockElementNotFound();
      // Override timeout to avoid slow default 5s wait
      const result = await executeTag({ type: 'DIV' }, {}, { timeout: 100, waitVisible: false });
      // Will fail because element not found, but should execute without error
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(DOM_ERROR_CODES.ELEMENT_NOT_FOUND);
    });
  });

  describe('executeClick (direct API)', () => {
    it('should create proper ClickCommandMessage and execute', async () => {
      const result = await executeClick(50, 75);
      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(DOM_ERROR_CODES.OK);
    });

    it('should pass button option', async () => {
      const result = await executeClick(50, 75, { button: 'right' });
      expect(result.success).toBe(true);
      expect(vi.mocked(dispatchRightClick)).toHaveBeenCalled();
    });

    it('should pass modifier keys', async () => {
      await executeClick(50, 75, { modifiers: { ctrl: true } });
      expect(vi.mocked(dispatchClick)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ ctrlKey: true }),
      );
    });
  });

  describe('executeEvent (direct API)', () => {
    it('should create proper EventCommandMessage and execute', async () => {
      const result = await executeEvent('click');
      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(DOM_ERROR_CODES.OK);
    });

    it('should pass key option for keyboard events', async () => {
      const result = await executeEvent('keydown', { key: 'a' });
      expect(result.success).toBe(true);
      expect(vi.mocked(dispatchKeyboardEvent)).toHaveBeenCalledWith(
        expect.anything(),
        'keydown',
        expect.objectContaining({ key: 'a' }),
      );
    });

    it('should pass point option for mouse events', async () => {
      await executeEvent('click', { point: { x: 10, y: 20 } });
      expect(vi.mocked(dispatchClick)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ clientX: 10, clientY: 20 }),
      );
    });
  });

  // ===== Edge Cases =====

  describe('Edge Cases', () => {
    it('should handle TAG with xpath selector', async () => {
      mockElementNotFound();
      const result = await executeTagCommand(makeTagMessage({
        selector: { xpath: '//div[@id="test"]' },
        timeout: 100,
      }));
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(DOM_ERROR_CODES.ELEMENT_NOT_FOUND);
    });

    it('should handle TAG with css selector', async () => {
      mockElementNotFound();
      const result = await executeTagCommand(makeTagMessage({
        selector: { css: '.my-class' },
        timeout: 100,
      }));
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(DOM_ERROR_CODES.ELEMENT_NOT_FOUND);
    });

    it('should handle contenteditable element content setting', async () => {
      const el = document.createElement('div');
      // JSDOM does not support isContentEditable natively via attribute,
      // so we set the property directly
      Object.defineProperty(el, 'isContentEditable', { value: true, writable: true });
      el.setAttribute('contenteditable', 'true');
      document.body.appendChild(el);
      mockElementFound(el);

      const result = await executeTagCommand(makeTagMessage({
        action: { content: 'editable content' },
      }));
      expect(result.success).toBe(true);
      expect(el.textContent).toBe('editable content');
      document.body.removeChild(el);
    });

    it('should return error for file input content', async () => {
      const el = document.createElement('input');
      el.type = 'file';
      document.body.appendChild(el);
      mockElementFound(el);

      const result = await executeTagCommand(makeTagMessage({
        action: { content: 'file.txt' },
      }));
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('File input not supported');
      document.body.removeChild(el);
    });

    it('should return error when setting content on unsupported element', async () => {
      const el = document.createElement('img');
      document.body.appendChild(el);
      mockElementFound(el);

      const result = await executeTagCommand(makeTagMessage({
        action: { content: 'some content' },
      }));
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(DOM_ERROR_CODES.EXECUTION_ERROR);
      expect(result.errorMessage).toContain('Cannot set content');
      document.body.removeChild(el);
    });

    it('should click anchor elements when content is set', async () => {
      const el = document.createElement('a');
      el.setAttribute('href', 'https://example.com');
      document.body.appendChild(el);
      mockElementFound(el);

      // Setting content on an anchor triggers a click instead
      const result = await executeTagCommand(makeTagMessage({
        action: { content: 'click me' },
      }));
      expect(result.success).toBe(true);
      expect(vi.mocked(dispatchClick)).toHaveBeenCalled();
      document.body.removeChild(el);
    });

    it('should handle EVENT:MOUSEOVER in content as mouse event', async () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      mockElementFound(el);

      const result = await executeTagCommand(makeTagMessage({
        action: { content: 'EVENT:MOUSEOVER' },
      }));
      expect(result.success).toBe(true);
      expect(vi.mocked(dispatchMouseEvent)).toHaveBeenCalledWith(
        el,
        'mouseover',
      );
      document.body.removeChild(el);
    });

    it('should handle SEARCH with TXT pattern that has no special chars', async () => {
      const testDoc = createTestDocument('<html><body>plain text here</body></html>');
      vi.mocked(getCurrentFrameDocument).mockReturnValue(testDoc as any);
      const result = await executeSearchCommand(makeSearchMessage({
        sourceType: 'TXT',
        pattern: 'plain text here',
      }));
      expect(result.success).toBe(true);
      expect(result.extractedData).toContain('plain text here');
    });

    it('should handle SEARCH with invalid TXT pattern gracefully', async () => {
      const testDoc = createTestDocument('<html><body>test</body></html>');
      vi.mocked(getCurrentFrameDocument).mockReturnValue(testDoc as any);
      // A TXT pattern with chars that after escaping create valid regex
      const result = await executeSearchCommand(makeSearchMessage({
        sourceType: 'TXT',
        pattern: 'test',
      }));
      expect(result.success).toBe(true);
    });

    it('should handle radio button with TRUE value', async () => {
      const el = document.createElement('input');
      el.type = 'radio';
      el.checked = false;
      document.body.appendChild(el);
      mockElementFound(el);

      await executeTagCommand(makeTagMessage({
        action: { content: 'TRUE' },
      }));
      expect(el.checked).toBe(true);
      document.body.removeChild(el);
    });

    it('should handle radio button with 1 value', async () => {
      const el = document.createElement('input');
      el.type = 'radio';
      el.checked = false;
      document.body.appendChild(el);
      mockElementFound(el);

      await executeTagCommand(makeTagMessage({
        action: { content: '1' },
      }));
      expect(el.checked).toBe(true);
      document.body.removeChild(el);
    });

    it('should handle radio button with ON value', async () => {
      const el = document.createElement('input');
      el.type = 'radio';
      el.checked = false;
      document.body.appendChild(el);
      mockElementFound(el);

      await executeTagCommand(makeTagMessage({
        action: { content: 'ON' },
      }));
      expect(el.checked).toBe(true);
      document.body.removeChild(el);
    });

    it('should handle select by plain text (no prefix)', async () => {
      const select = document.createElement('select');
      const opt1 = document.createElement('option');
      opt1.value = 'val1'; opt1.text = 'Visible Text';
      select.appendChild(opt1);
      document.body.appendChild(select);
      mockElementFound(select);

      await executeTagCommand(makeTagMessage({
        action: { content: 'Visible Text' },
      }));
      expect(select.selectedIndex).toBe(0);
      document.body.removeChild(select);
    });

    it('should return error for select plain text that does not match', async () => {
      const select = document.createElement('select');
      const opt1 = document.createElement('option');
      opt1.value = 'val1'; opt1.text = 'Apple';
      select.appendChild(opt1);
      document.body.appendChild(select);
      mockElementFound(select);

      const result = await executeTagCommand(makeTagMessage({
        action: { content: 'Banana' },
      }));
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Selected entry not available');
      document.body.removeChild(select);
    });

    it('should dispatch focusElement on text inputs before setting value', async () => {
      const el = document.createElement('input');
      el.type = 'text';
      document.body.appendChild(el);
      mockElementFound(el);

      await executeTagCommand(makeTagMessage({
        action: { content: 'focused' },
      }));
      expect(vi.mocked(focusElement)).toHaveBeenCalledWith(el);
      document.body.removeChild(el);
    });

    it('should dispatch focusElement on textarea before setting value', async () => {
      const el = document.createElement('textarea');
      document.body.appendChild(el);
      mockElementFound(el);

      await executeTagCommand(makeTagMessage({
        action: { content: 'focused text' },
      }));
      expect(vi.mocked(focusElement)).toHaveBeenCalledWith(el);
      document.body.removeChild(el);
    });
  });
});
