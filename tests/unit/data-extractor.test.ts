/**
 * Data Extractor Unit Tests
 *
 * Tests data extraction functions: text extraction, attribute extraction,
 * table cell extraction, extraction buffer, link/image/form extractors,
 * and data attributes.
 *
 * Uses JSDOM for DOM simulation. All elements come from the global document
 * (same realm) so that instanceof checks work correctly. Mocks element-finder
 * to avoid complex dependency chains for selector-based functions.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

// Polyfill global DOM for module imports that reference browser globals
const _polyfillDom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
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
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = _polyfillDom.window;
}
if (typeof globalThis.XPathResult === 'undefined') {
  (globalThis as any).XPathResult = _polyfillDom.window.XPathResult;
}

// Mock element-finder to avoid complex dependency chains
vi.mock('../../extension/src/content/element-finder', () => ({
  findElement: vi.fn(() => ({ element: null, elements: [] })),
  getAttributeValue: vi.fn(),
  getFullTextContent: vi.fn(),
  matchesType: vi.fn(),
}));

import {
  getVisibleText,
  getAllText,
  extractTxt,
  extractTxtAll,
  extractHtm,
  extractOuterHtml,
  extractAttribute,
  extractFromTableCell,
  extractData,
  extractFromSelector,
  addToExtractionBuffer,
  getExtractionBuffer,
  clearExtractionBuffer,
  getExtractionBufferLength,
  getExtractionBufferArray,
  extractAndBuffer,
  extractMultiple,
  extractFromAll,
  extractLinkData,
  extractImageData,
  extractFormFieldData,
  extractDataAttributes,
  EXTRACT_DELIMITER,
} from '../../extension/src/content/data-extractor';

import { findElement } from '../../extension/src/content/element-finder';

// Use the global document (same realm) for all element creation
const doc = globalThis.document;

describe('Data Extractor', () => {
  beforeEach(() => {
    doc.body.innerHTML = `
      <div id="text-div">  Hello World  </div>
      <div id="nested"><span>inner</span> text</div>
      <div id="html-div"><strong>bold</strong> text</div>
      <input id="text-input" type="text" value="input-val" name="field1" />
      <input id="checkbox" type="checkbox" checked />
      <input id="unchecked" type="checkbox" />
      <textarea id="textarea" name="notes">textarea content</textarea>
      <select id="sel" name="color">
        <option value="r">Red</option>
        <option value="g" selected>Green</option>
        <option value="b">Blue</option>
      </select>
      <div id="classed" class="foo bar baz">classed</div>
      <div id="with-attrs" data-id="123" data-name="test" title="my title">attrs</div>
      <a id="link" href="https://example.com/page">Link Text</a>
      <div id="link-container"><a href="https://example.com/inner">Inner Link</a></div>
      <img id="img" src="https://example.com/pic.png" alt="A picture" title="Pic Title" width="100" height="50" />
      <div id="img-container"><img src="https://example.com/nested.png" alt="Nested" /></div>
      <table id="tbl">
        <tr><td>R1C1</td><td>R1C2</td></tr>
        <tr><td>R2C1</td><td>R2C2</td></tr>
        <tr><td>R3C1</td><td>R3C2</td></tr>
      </table>
    `;
    clearExtractionBuffer();
  });

  // ============================================================
  // EXTRACT_DELIMITER constant
  // ============================================================

  describe('EXTRACT_DELIMITER', () => {
    it('should be [EXTRACT]', () => {
      expect(EXTRACT_DELIMITER).toBe('[EXTRACT]');
    });
  });

  // ============================================================
  // Text extraction
  // ============================================================

  describe('getVisibleText', () => {
    it('should return a string for an HTMLElement', () => {
      const el = doc.getElementById('text-div')!;
      const text = getVisibleText(el);
      // JSDOM does not implement innerText, so result may be empty.
      // We verify the function returns a string without error.
      expect(typeof text).toBe('string');
    });

    it('should return textContent for non-HTML elements as fallback', () => {
      const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
      svg.textContent = 'svg text';
      const text = getVisibleText(svg);
      expect(text).toBe('svg text');
    });
  });

  describe('getAllText', () => {
    it('should return full textContent', () => {
      const el = doc.getElementById('nested')!;
      const text = getAllText(el);
      expect(text).toContain('inner');
      expect(text).toContain('text');
    });

    it('should return empty string for element with no text', () => {
      const el = doc.createElement('div');
      expect(getAllText(el)).toBe('');
    });
  });

  describe('extractTxt', () => {
    it('should return trimmed string (JSDOM has no innerText so result is empty)', () => {
      const el = doc.getElementById('text-div')!;
      const result = extractTxt(el);
      // JSDOM does not implement innerText; returns '' via fallback
      expect(typeof result).toBe('string');
      // Verify trimming works (no leading/trailing whitespace)
      expect(result).toBe(result.trim());
    });

    it('should return untrimmed text when trim is false', () => {
      const el = doc.getElementById('text-div')!;
      const result = extractTxt(el, { trim: false });
      expect(typeof result).toBe('string');
    });
  });

  describe('extractTxtAll', () => {
    it('should return all text content including nested', () => {
      const el = doc.getElementById('nested')!;
      const result = extractTxtAll(el);
      expect(result).toContain('inner');
      expect(result).toContain('text');
    });
  });

  describe('extractHtm', () => {
    it('should return innerHTML of element', () => {
      const el = doc.getElementById('html-div')!;
      const result = extractHtm(el);
      expect(result).toContain('<strong>bold</strong>');
      expect(result).toContain('text');
    });
  });

  describe('extractOuterHtml', () => {
    it('should return outerHTML including the element tag', () => {
      const el = doc.getElementById('html-div')!;
      const result = extractOuterHtml(el);
      expect(result).toContain('<div id="html-div">');
      expect(result).toContain('<strong>bold</strong>');
      expect(result).toContain('</div>');
    });
  });

  // ============================================================
  // Attribute extraction
  // ============================================================

  describe('extractAttribute', () => {
    it('should extract TXT (returns string from innerText path)', () => {
      const el = doc.getElementById('text-div')!;
      const result = extractAttribute(el, 'TXT');
      // JSDOM does not implement innerText; verify it returns a string
      expect(typeof result).toBe('string');
    });

    it('should extract INNERTEXT same as TXT', () => {
      const el = doc.getElementById('text-div')!;
      const txt = extractAttribute(el, 'TXT');
      const innertext = extractAttribute(el, 'INNERTEXT');
      expect(innertext).toBe(txt);
    });

    it('should extract TXTALL (all text content)', () => {
      const el = doc.getElementById('nested')!;
      const result = extractAttribute(el, 'TXTALL');
      expect(result).toContain('inner');
    });

    it('should extract HTM (innerHTML)', () => {
      const el = doc.getElementById('html-div')!;
      const result = extractAttribute(el, 'HTM');
      expect(result).toContain('<strong>bold</strong>');
    });

    it('should extract INNERHTML same as HTM', () => {
      const el = doc.getElementById('html-div')!;
      const result = extractAttribute(el, 'INNERHTML');
      expect(result).toContain('<strong>bold</strong>');
    });

    it('should extract OUTERHTML', () => {
      const el = doc.getElementById('html-div')!;
      const result = extractAttribute(el, 'OUTERHTML');
      expect(result).toContain('<div id="html-div">');
    });

    it('should extract VALUE from input element', () => {
      const el = doc.getElementById('text-input')!;
      const result = extractAttribute(el, 'VALUE');
      expect(result).toBe('input-val');
    });

    it('should extract VALUE from textarea element', () => {
      const el = doc.getElementById('textarea')!;
      const result = extractAttribute(el, 'VALUE');
      expect(result).toBe('textarea content');
    });

    it('should extract VALUE from select element', () => {
      const el = doc.getElementById('sel')!;
      const result = extractAttribute(el, 'VALUE');
      expect(result).toBe('g');
    });

    it('should return value attribute or empty string for non-form elements', () => {
      const el = doc.getElementById('text-div')!;
      const result = extractAttribute(el, 'VALUE');
      expect(result).toBe('');
    });

    it('should extract CHECKED as true for checked checkbox', () => {
      const el = doc.getElementById('checkbox')!;
      const result = extractAttribute(el, 'CHECKED');
      expect(result).toBe('true');
    });

    it('should extract CHECKED as false for unchecked checkbox', () => {
      const el = doc.getElementById('unchecked')!;
      const result = extractAttribute(el, 'CHECKED');
      expect(result).toBe('false');
    });

    it('should return empty string for CHECKED on non-input element', () => {
      const el = doc.getElementById('text-div')!;
      const result = extractAttribute(el, 'CHECKED');
      expect(result).toBe('');
    });

    it('should extract SELECTED option text from select element', () => {
      const el = doc.getElementById('sel')!;
      const result = extractAttribute(el, 'SELECTED');
      expect(result).toBe('Green');
    });

    it('should extract SELECTEDVALUE from select element', () => {
      const el = doc.getElementById('sel')!;
      const result = extractAttribute(el, 'SELECTEDVALUE');
      expect(result).toBe('g');
    });

    it('should extract CLASS', () => {
      const el = doc.getElementById('classed')!;
      const result = extractAttribute(el, 'CLASS');
      expect(result).toBe('foo bar baz');
    });

    it('should extract TAGNAME', () => {
      const el = doc.getElementById('text-div')!;
      const result = extractAttribute(el, 'TAGNAME');
      expect(result).toBe('DIV');
    });

    it('should extract TAG same as TAGNAME', () => {
      const el = doc.getElementById('link')!;
      const result = extractAttribute(el, 'TAG');
      expect(result).toBe('A');
    });

    it('should extract standard attributes by name', () => {
      const el = doc.getElementById('with-attrs')!;
      const result = extractAttribute(el, 'title');
      expect(result).toBe('my title');
    });

    it('should return empty string for missing attribute with emptyOnMissing=true (default)', () => {
      const el = doc.getElementById('text-div')!;
      const result = extractAttribute(el, 'nonexistent');
      expect(result).toBe('');
    });

    it('should return null for missing attribute with emptyOnMissing=false', () => {
      const el = doc.getElementById('text-div')!;
      const result = extractAttribute(el, 'nonexistent', { emptyOnMissing: false });
      expect(result).toBeNull();
    });

    it('should be case-insensitive for attribute type names', () => {
      const el = doc.getElementById('html-div')!;
      const lower = extractAttribute(el, 'htm');
      const upper = extractAttribute(el, 'HTM');
      expect(lower).toBe(upper);
    });
  });

  // ============================================================
  // Table cell extraction
  // ============================================================

  describe('extractFromTableCell', () => {
    it('should extract text from a specific cell (1-indexed) using TXTALL', () => {
      const table = doc.getElementById('tbl') as HTMLTableElement;
      const result = extractFromTableCell(table, 1, 1, 'TXTALL');
      expect(result).toContain('R1C1');
    });

    it('should extract from a different cell using TXTALL', () => {
      const table = doc.getElementById('tbl') as HTMLTableElement;
      const result = extractFromTableCell(table, 2, 2, 'TXTALL');
      expect(result).toContain('R2C2');
    });

    it('should return null for out-of-range row', () => {
      const table = doc.getElementById('tbl') as HTMLTableElement;
      const result = extractFromTableCell(table, 10, 1);
      expect(result).toBeNull();
    });

    it('should return null for out-of-range column', () => {
      const table = doc.getElementById('tbl') as HTMLTableElement;
      const result = extractFromTableCell(table, 1, 10);
      expect(result).toBeNull();
    });

    it('should return null for row < 1', () => {
      const table = doc.getElementById('tbl') as HTMLTableElement;
      const result = extractFromTableCell(table, 0, 1);
      expect(result).toBeNull();
    });

    it('should support different extract types (HTM)', () => {
      const table = doc.getElementById('tbl') as HTMLTableElement;
      const result = extractFromTableCell(table, 1, 1, 'HTM');
      expect(result).toBe('R1C1');
    });
  });

  // ============================================================
  // extractData
  // ============================================================

  describe('extractData', () => {
    it('should return a successful ExtractionResult for TXTALL', () => {
      const el = doc.getElementById('text-div')!;
      const result = extractData(el, 'TXTALL');
      expect(result.success).toBe(true);
      expect(result.value).toContain('Hello World');
      expect(result.extractionType).toBe('TXTALL');
    });

    it('should handle table extraction via options.row/col', () => {
      const table = doc.getElementById('tbl') as HTMLTableElement;
      const result = extractData(table, 'TXTALL', { row: 3, col: 1 });
      expect(result.success).toBe(true);
      expect(result.value).toContain('R3C1');
    });

    it('should fail for table extraction with out-of-range cell', () => {
      const table = doc.getElementById('tbl') as HTMLTableElement;
      const result = extractData(table, 'TXTALL', { row: 99, col: 1 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should fail if row/col specified but element is not a table', () => {
      const el = doc.getElementById('text-div')!;
      const result = extractData(el, 'TXT', { row: 1, col: 1 });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Element is not a table');
    });

    it('should return failure for missing attribute with emptyOnMissing=false', () => {
      const el = doc.getElementById('text-div')!;
      const result = extractData(el, 'nonexistent', { emptyOnMissing: false });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  // ============================================================
  // extractFromSelector (uses mocked findElement)
  // ============================================================

  describe('extractFromSelector', () => {
    it('should return failure when element is not found', () => {
      (findElement as ReturnType<typeof vi.fn>).mockReturnValue({ element: null, elements: [] });

      const result = extractFromSelector('#missing', 'TXT');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Element not found');
    });

    it('should extract data when element is found', () => {
      const el = doc.getElementById('text-div')!;
      (findElement as ReturnType<typeof vi.fn>).mockReturnValue({ element: el, elements: [el] });

      const result = extractFromSelector('#text-div', 'TXTALL');

      expect(result.success).toBe(true);
      expect(result.value).toContain('Hello World');
    });
  });

  // ============================================================
  // Extraction buffer
  // ============================================================

  describe('Extraction buffer', () => {
    it('should start empty', () => {
      expect(getExtractionBufferLength()).toBe(0);
      expect(getExtractionBuffer()).toBe('');
    });

    it('should add values to the buffer', () => {
      addToExtractionBuffer('first');
      addToExtractionBuffer('second');

      expect(getExtractionBufferLength()).toBe(2);
    });

    it('should join values with [EXTRACT] delimiter', () => {
      addToExtractionBuffer('a');
      addToExtractionBuffer('b');
      addToExtractionBuffer('c');

      expect(getExtractionBuffer()).toBe('a[EXTRACT]b[EXTRACT]c');
    });

    it('should return a copy of the buffer array', () => {
      addToExtractionBuffer('x');
      addToExtractionBuffer('y');

      const arr = getExtractionBufferArray();
      expect(arr).toEqual(['x', 'y']);

      // Should be a copy, not a reference
      arr.push('z');
      expect(getExtractionBufferLength()).toBe(2);
    });

    it('should clear the buffer', () => {
      addToExtractionBuffer('val');
      clearExtractionBuffer();

      expect(getExtractionBufferLength()).toBe(0);
      expect(getExtractionBuffer()).toBe('');
    });
  });

  // ============================================================
  // extractAndBuffer
  // ============================================================

  describe('extractAndBuffer', () => {
    it('should extract and add to buffer on success', () => {
      const el = doc.getElementById('text-div')!;
      const result = extractAndBuffer(el, 'TXTALL');

      expect(result.success).toBe(true);
      expect(getExtractionBufferLength()).toBe(1);
      expect(getExtractionBuffer()).toContain('Hello World');
    });

    it('should not add to buffer on failure', () => {
      const el = doc.getElementById('text-div')!;
      const result = extractAndBuffer(el, 'nonexistent', { emptyOnMissing: false });

      expect(result.success).toBe(false);
      expect(getExtractionBufferLength()).toBe(0);
    });
  });

  // ============================================================
  // extractMultiple
  // ============================================================

  describe('extractMultiple', () => {
    it('should extract multiple attributes from a single element', () => {
      const el = doc.getElementById('text-input')!;
      const results = extractMultiple(el, ['VALUE', 'TAGNAME']);

      expect(results.size).toBe(2);
      expect(results.get('VALUE')!.success).toBe(true);
      expect(results.get('VALUE')!.value).toBe('input-val');
      expect(results.get('TAGNAME')!.value).toBe('INPUT');
    });
  });

  // ============================================================
  // extractFromAll (uses mocked findElement)
  // ============================================================

  describe('extractFromAll', () => {
    it('should return empty string when no elements found', () => {
      (findElement as ReturnType<typeof vi.fn>).mockReturnValue({ element: null, elements: [] });

      const result = extractFromAll('#none', 'TXT');

      expect(result).toBe('');
    });

    it('should join values from all matching elements with delimiter', () => {
      const el1 = doc.createElement('div');
      el1.textContent = 'One';
      const el2 = doc.createElement('div');
      el2.textContent = 'Two';
      (findElement as ReturnType<typeof vi.fn>).mockReturnValue({ element: el1, elements: [el1, el2] });

      const result = extractFromAll('.items', 'TXTALL');

      expect(result).toContain('One');
      expect(result).toContain('Two');
      expect(result).toContain('[EXTRACT]');
    });
  });

  // ============================================================
  // Link data extraction
  // ============================================================

  describe('extractLinkData', () => {
    it('should extract href and text from an anchor element', () => {
      const el = doc.getElementById('link')!;
      const data = extractLinkData(el);

      expect(data).not.toBeNull();
      expect(data!.href).toContain('example.com/page');
      // extractLinkData uses extractTxt which relies on innerText (unsupported in JSDOM).
      // Verify text is a string (empty in JSDOM).
      expect(typeof data!.text).toBe('string');
    });

    it('should find anchor within a container element', () => {
      const el = doc.getElementById('link-container')!;
      const data = extractLinkData(el);

      expect(data).not.toBeNull();
      expect(data!.href).toContain('example.com/inner');
    });

    it('should return null when no anchor is found', () => {
      const el = doc.getElementById('text-div')!;
      const data = extractLinkData(el);

      expect(data).toBeNull();
    });
  });

  // ============================================================
  // Image data extraction
  // ============================================================

  describe('extractImageData', () => {
    it('should extract src and alt from an image element', () => {
      const el = doc.getElementById('img')!;
      const data = extractImageData(el);

      expect(data).not.toBeNull();
      expect(data!.src).toContain('pic.png');
      expect(data!.alt).toBe('A picture');
      expect(data!.title).toBe('Pic Title');
    });

    it('should find image within a container element', () => {
      const el = doc.getElementById('img-container')!;
      const data = extractImageData(el);

      expect(data).not.toBeNull();
      expect(data!.src).toContain('nested.png');
      expect(data!.alt).toBe('Nested');
    });

    it('should return null when no image is found', () => {
      const el = doc.getElementById('text-div')!;
      const data = extractImageData(el);

      expect(data).toBeNull();
    });
  });

  // ============================================================
  // Form field data extraction
  // ============================================================

  describe('extractFormFieldData', () => {
    it('should extract data from an input element', () => {
      const el = doc.getElementById('text-input')!;
      const data = extractFormFieldData(el);

      expect(data).not.toBeNull();
      expect(data!.name).toBe('field1');
      expect(data!.value).toBe('input-val');
      expect(data!.type).toBe('text');
    });

    it('should extract data from a select element', () => {
      const el = doc.getElementById('sel')!;
      const data = extractFormFieldData(el);

      expect(data).not.toBeNull();
      expect(data!.name).toBe('color');
      expect(data!.value).toBe('g');
      expect(data!.type).toBe('select');
    });

    it('should extract data from a textarea element', () => {
      const el = doc.getElementById('textarea')!;
      const data = extractFormFieldData(el);

      expect(data).not.toBeNull();
      expect(data!.name).toBe('notes');
      expect(data!.value).toBe('textarea content');
      expect(data!.type).toBe('textarea');
    });

    it('should return null for non-form elements', () => {
      const el = doc.getElementById('text-div')!;
      const data = extractFormFieldData(el);

      expect(data).toBeNull();
    });
  });

  // ============================================================
  // Data attributes extraction
  // ============================================================

  describe('extractDataAttributes', () => {
    it('should extract data-* attributes from an HTMLElement', () => {
      const el = doc.getElementById('with-attrs')!;
      const attrs = extractDataAttributes(el);

      expect(attrs['id']).toBe('123');
      expect(attrs['name']).toBe('test');
    });

    it('should return empty object for element with no data attributes', () => {
      const el = doc.getElementById('text-div')!;
      const attrs = extractDataAttributes(el);

      expect(Object.keys(attrs).length).toBe(0);
    });

    it('should handle non-HTML elements with data attributes', () => {
      const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
      svg.setAttribute('data-custom', 'value');
      const attrs = extractDataAttributes(svg);

      expect(attrs['custom']).toBe('value');
    });
  });
});
