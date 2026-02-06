/**
 * Extraction Commands Integration Tests
 *
 * Tests EXTRACT commands that retrieve data from DOM elements.
 * These tests verify real DOM data extraction using JSDOM.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

/**
 * Mock DOM context for extraction testing
 */
interface DomContext {
  window: Window & typeof globalThis;
  document: Document;
}

/**
 * Create a mock DOM environment for extraction testing
 */
function createDomContext(html: string): DomContext {
  const dom = new JSDOM(html, {
    url: 'https://example.com/page',
    runScripts: 'dangerously',
  });

  return {
    window: dom.window as unknown as Window & typeof globalThis,
    document: dom.window.document,
  };
}

/**
 * Element selector interface matching iMacros TAG syntax
 */
interface TagSelector {
  type: string;
  pos?: number;
  attr?: string;
  attrValue?: string;
  form?: string;
  txt?: string;
}

/**
 * Extraction result
 */
interface ExtractionResult {
  success: boolean;
  data: string | string[];
}

/**
 * EXTRACT command implementation for testing
 */
class ExtractCommand {
  private context: DomContext;
  private extractedData: string[] = [];

  constructor(context: DomContext) {
    this.context = context;
  }

  /**
   * Find an element using TAG syntax
   */
  private findElement(selector: TagSelector): Element | null {
    const { document } = this.context;
    let elements: Element[];

    if (selector.type === '*') {
      elements = Array.from(document.querySelectorAll('*'));
    } else {
      elements = Array.from(document.querySelectorAll(selector.type));
    }

    if (selector.attr && selector.attrValue) {
      const attrName = selector.attr.toLowerCase();
      elements = elements.filter((el) => {
        const attrVal = el.getAttribute(attrName);
        if (selector.attrValue === '*') {
          return attrVal !== null;
        }
        return attrVal === selector.attrValue;
      });
    }

    if (selector.txt) {
      elements = elements.filter((el) => {
        const text = el.textContent?.trim() || '';
        return text.includes(selector.txt!);
      });
    }

    const pos = selector.pos ?? 1;
    if (pos < 1 || pos > elements.length) {
      return null;
    }

    return elements[pos - 1];
  }

  /**
   * Extract text content from an element
   * TAG POS=1 TYPE=DIV ATTR=ID:content EXTRACT=TXT
   */
  extractText(selector: TagSelector): ExtractionResult {
    const element = this.findElement(selector);
    if (!element) {
      throw new Error(`Element not found: ${JSON.stringify(selector)}`);
    }

    const text = element.textContent?.trim() || '';
    this.extractedData.push(text);

    return { success: true, data: text };
  }

  /**
   * Extract HTML content from an element
   * TAG POS=1 TYPE=DIV ATTR=ID:content EXTRACT=HTM
   */
  extractHtml(selector: TagSelector): ExtractionResult {
    const element = this.findElement(selector);
    if (!element) {
      throw new Error(`Element not found: ${JSON.stringify(selector)}`);
    }

    const html = element.innerHTML;
    this.extractedData.push(html);

    return { success: true, data: html };
  }

  /**
   * Extract an attribute value from an element
   * TAG POS=1 TYPE=A ATTR=HREF:* EXTRACT=HREF
   */
  extractAttribute(selector: TagSelector, attributeName: string): ExtractionResult {
    const element = this.findElement(selector);
    if (!element) {
      throw new Error(`Element not found: ${JSON.stringify(selector)}`);
    }

    const value = element.getAttribute(attributeName) || '';
    this.extractedData.push(value);

    return { success: true, data: value };
  }

  /**
   * Extract the title of the page
   * EXTRACT=TITLE
   */
  extractTitle(): ExtractionResult {
    const title = this.context.document.title;
    this.extractedData.push(title);

    return { success: true, data: title };
  }

  /**
   * Extract the current URL
   * EXTRACT=URL
   */
  extractUrl(): ExtractionResult {
    const url = this.context.window.location.href;
    this.extractedData.push(url);

    return { success: true, data: url };
  }

  /**
   * Extract table data as CSV
   * TAG POS=1 TYPE=TABLE ATTR=ID:data EXTRACT=TBL
   */
  extractTable(selector: TagSelector): ExtractionResult {
    const element = this.findElement(selector);
    if (!element || element.tagName !== 'TABLE') {
      throw new Error(`Table not found: ${JSON.stringify(selector)}`);
    }

    const table = element as HTMLTableElement;
    const rows: string[] = [];

    // Extract header if present
    const headerRow = table.querySelector('thead tr');
    if (headerRow) {
      const headerCells = Array.from(headerRow.querySelectorAll('th'));
      rows.push(headerCells.map((cell) => cell.textContent?.trim() || '').join(','));
    }

    // Extract body rows
    const bodyRows = table.querySelectorAll('tbody tr');
    bodyRows.forEach((row) => {
      const cells = Array.from(row.querySelectorAll('td'));
      rows.push(cells.map((cell) => cell.textContent?.trim() || '').join(','));
    });

    const csvData = rows.join('\n');
    this.extractedData.push(csvData);

    return { success: true, data: rows };
  }

  /**
   * Extract value from an input element
   */
  extractValue(selector: TagSelector): ExtractionResult {
    const element = this.findElement(selector);
    if (!element) {
      throw new Error(`Element not found: ${JSON.stringify(selector)}`);
    }

    let value = '';

    if (element instanceof this.context.window.HTMLInputElement) {
      value = element.value;
    } else if (element instanceof this.context.window.HTMLTextAreaElement) {
      value = element.value;
    } else if (element instanceof this.context.window.HTMLSelectElement) {
      value = element.value;
    } else {
      throw new Error('Cannot extract value from non-input element');
    }

    this.extractedData.push(value);

    return { success: true, data: value };
  }

  /**
   * Extract all links from the page or a specific container
   */
  extractLinks(selector?: TagSelector): ExtractionResult {
    let container: Element | Document = this.context.document;

    if (selector) {
      const element = this.findElement(selector);
      if (!element) {
        throw new Error(`Container not found: ${JSON.stringify(selector)}`);
      }
      container = element;
    }

    const links = Array.from(container.querySelectorAll('a[href]'));
    const hrefs = links.map((link) => link.getAttribute('href') || '');

    hrefs.forEach((href) => this.extractedData.push(href));

    return { success: true, data: hrefs };
  }

  /**
   * Extract all images from the page or a specific container
   */
  extractImages(selector?: TagSelector): ExtractionResult {
    let container: Element | Document = this.context.document;

    if (selector) {
      const element = this.findElement(selector);
      if (!element) {
        throw new Error(`Container not found: ${JSON.stringify(selector)}`);
      }
      container = element;
    }

    const images = Array.from(container.querySelectorAll('img[src]'));
    const srcs = images.map((img) => img.getAttribute('src') || '');

    srcs.forEach((src) => this.extractedData.push(src));

    return { success: true, data: srcs };
  }

  /**
   * Get all extracted data
   */
  getExtractedData(): string[] {
    return [...this.extractedData];
  }

  /**
   * Get the last extracted value
   */
  getLastExtract(): string {
    return this.extractedData[this.extractedData.length - 1] || '';
  }

  /**
   * Clear extracted data
   */
  clearExtractedData(): void {
    this.extractedData = [];
  }
}

describe('Extraction Commands Integration Tests', () => {
  describe('Text Extraction (EXTRACT=TXT)', () => {
    let context: DomContext;
    let extractCommand: ExtractCommand;

    beforeEach(() => {
      context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <head><title>Test Page</title></head>
        <body>
          <h1 id="title">Page Title</h1>
          <p id="description">This is the page description.</p>
          <div id="content">
            <span class="highlight">Important text</span>
            <span class="normal">Normal text</span>
          </div>
          <div id="empty"></div>
        </body>
        </html>
      `);
      extractCommand = new ExtractCommand(context);
    });

    it('should extract text from an element by ID', () => {
      const result = extractCommand.extractText({
        type: 'H1',
        attr: 'id',
        attrValue: 'title',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe('Page Title');
    });

    it('should extract text from a paragraph', () => {
      const result = extractCommand.extractText({
        type: 'P',
        attr: 'id',
        attrValue: 'description',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe('This is the page description.');
    });

    it('should extract text from element by position', () => {
      const result = extractCommand.extractText({
        type: 'SPAN',
        pos: 2,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe('Normal text');
    });

    it('should extract text from element by class', () => {
      const result = extractCommand.extractText({
        type: 'SPAN',
        attr: 'class',
        attrValue: 'highlight',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe('Important text');
    });

    it('should extract empty string from empty element', () => {
      const result = extractCommand.extractText({
        type: 'DIV',
        attr: 'id',
        attrValue: 'empty',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe('');
    });

    it('should throw error for non-existent element', () => {
      expect(() =>
        extractCommand.extractText({
          type: 'DIV',
          attr: 'id',
          attrValue: 'nonexistent',
        })
      ).toThrow('Element not found');
    });

    it('should extract nested text content', () => {
      const result = extractCommand.extractText({
        type: 'DIV',
        attr: 'id',
        attrValue: 'content',
      });

      expect(result.success).toBe(true);
      expect(result.data).toContain('Important text');
      expect(result.data).toContain('Normal text');
    });
  });

  describe('HTML Extraction (EXTRACT=HTM)', () => {
    let context: DomContext;
    let extractCommand: ExtractCommand;

    beforeEach(() => {
      context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <div id="htmlContent">
            <strong>Bold</strong> and <em>italic</em> text.
          </div>
          <ul id="list">
            <li>Item 1</li>
            <li>Item 2</li>
          </ul>
        </body>
        </html>
      `);
      extractCommand = new ExtractCommand(context);
    });

    it('should extract innerHTML from an element', () => {
      const result = extractCommand.extractHtml({
        type: 'DIV',
        attr: 'id',
        attrValue: 'htmlContent',
      });

      expect(result.success).toBe(true);
      expect(result.data).toContain('<strong>Bold</strong>');
      expect(result.data).toContain('<em>italic</em>');
    });

    it('should extract list HTML', () => {
      const result = extractCommand.extractHtml({
        type: 'UL',
        attr: 'id',
        attrValue: 'list',
      });

      expect(result.success).toBe(true);
      expect(result.data).toContain('<li>Item 1</li>');
      expect(result.data).toContain('<li>Item 2</li>');
    });
  });

  describe('Attribute Extraction', () => {
    let context: DomContext;
    let extractCommand: ExtractCommand;

    beforeEach(() => {
      context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <a id="link1" href="/page1" title="Page 1 Link">Link 1</a>
          <a id="link2" href="https://external.com" target="_blank">Link 2</a>
          <img id="img1" src="/images/test.jpg" alt="Test Image" />
          <input id="input1" type="text" value="initial" placeholder="Enter text" />
        </body>
        </html>
      `);
      extractCommand = new ExtractCommand(context);
    });

    it('should extract href attribute', () => {
      const result = extractCommand.extractAttribute(
        { type: 'A', attr: 'id', attrValue: 'link1' },
        'href'
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe('/page1');
    });

    it('should extract title attribute', () => {
      const result = extractCommand.extractAttribute(
        { type: 'A', attr: 'id', attrValue: 'link1' },
        'title'
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe('Page 1 Link');
    });

    it('should extract target attribute', () => {
      const result = extractCommand.extractAttribute(
        { type: 'A', attr: 'id', attrValue: 'link2' },
        'target'
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe('_blank');
    });

    it('should extract img src attribute', () => {
      const result = extractCommand.extractAttribute(
        { type: 'IMG', attr: 'id', attrValue: 'img1' },
        'src'
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe('/images/test.jpg');
    });

    it('should extract alt attribute', () => {
      const result = extractCommand.extractAttribute(
        { type: 'IMG', attr: 'id', attrValue: 'img1' },
        'alt'
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe('Test Image');
    });

    it('should extract empty string for missing attribute', () => {
      const result = extractCommand.extractAttribute(
        { type: 'A', attr: 'id', attrValue: 'link1' },
        'data-nonexistent'
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe('');
    });
  });

  describe('Page-level Extraction', () => {
    let context: DomContext;
    let extractCommand: ExtractCommand;

    beforeEach(() => {
      context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <head><title>My Page Title</title></head>
        <body>
          <p>Content</p>
        </body>
        </html>
      `);
      extractCommand = new ExtractCommand(context);
    });

    it('should extract page title', () => {
      const result = extractCommand.extractTitle();

      expect(result.success).toBe(true);
      expect(result.data).toBe('My Page Title');
    });

    it('should extract current URL', () => {
      const result = extractCommand.extractUrl();

      expect(result.success).toBe(true);
      expect(result.data).toBe('https://example.com/page');
    });
  });

  describe('Table Extraction (EXTRACT=TBL)', () => {
    let context: DomContext;
    let extractCommand: ExtractCommand;

    beforeEach(() => {
      context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <table id="dataTable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Age</th>
                <th>City</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Alice</td>
                <td>30</td>
                <td>New York</td>
              </tr>
              <tr>
                <td>Bob</td>
                <td>25</td>
                <td>Los Angeles</td>
              </tr>
              <tr>
                <td>Charlie</td>
                <td>35</td>
                <td>Chicago</td>
              </tr>
            </tbody>
          </table>
        </body>
        </html>
      `);
      extractCommand = new ExtractCommand(context);
    });

    it('should extract table data as CSV rows', () => {
      const result = extractCommand.extractTable({
        type: 'TABLE',
        attr: 'id',
        attrValue: 'dataTable',
      });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);

      const rows = result.data as string[];
      expect(rows[0]).toBe('Name,Age,City');
      expect(rows[1]).toBe('Alice,30,New York');
      expect(rows[2]).toBe('Bob,25,Los Angeles');
      expect(rows[3]).toBe('Charlie,35,Chicago');
    });

    it('should throw error for non-table element', () => {
      expect(() =>
        extractCommand.extractTable({
          type: 'DIV',
          pos: 1,
        })
      ).toThrow('Table not found');
    });
  });

  describe('Value Extraction', () => {
    let context: DomContext;
    let extractCommand: ExtractCommand;

    beforeEach(() => {
      context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <input type="text" id="textInput" value="input value" />
          <textarea id="textArea">textarea content</textarea>
          <select id="selectBox">
            <option value="opt1">Option 1</option>
            <option value="opt2" selected>Option 2</option>
            <option value="opt3">Option 3</option>
          </select>
          <div id="notInput">Not an input</div>
        </body>
        </html>
      `);
      extractCommand = new ExtractCommand(context);
    });

    it('should extract value from text input', () => {
      const result = extractCommand.extractValue({
        type: 'INPUT',
        attr: 'id',
        attrValue: 'textInput',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe('input value');
    });

    it('should extract value from textarea', () => {
      const result = extractCommand.extractValue({
        type: 'TEXTAREA',
        attr: 'id',
        attrValue: 'textArea',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe('textarea content');
    });

    it('should extract selected value from select box', () => {
      const result = extractCommand.extractValue({
        type: 'SELECT',
        attr: 'id',
        attrValue: 'selectBox',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe('opt2');
    });

    it('should throw error for non-input element', () => {
      expect(() =>
        extractCommand.extractValue({
          type: 'DIV',
          attr: 'id',
          attrValue: 'notInput',
        })
      ).toThrow('Cannot extract value from non-input element');
    });
  });

  describe('Link Extraction', () => {
    let context: DomContext;
    let extractCommand: ExtractCommand;

    beforeEach(() => {
      context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <nav id="mainNav">
            <a href="/home">Home</a>
            <a href="/about">About</a>
            <a href="/contact">Contact</a>
          </nav>
          <div id="content">
            <p>Visit our <a href="/products">products</a> page.</p>
            <a href="https://external.com">External Link</a>
          </div>
        </body>
        </html>
      `);
      extractCommand = new ExtractCommand(context);
    });

    it('should extract all links from the page', () => {
      const result = extractCommand.extractLinks();

      expect(result.success).toBe(true);
      const links = result.data as string[];
      expect(links).toContain('/home');
      expect(links).toContain('/about');
      expect(links).toContain('/contact');
      expect(links).toContain('/products');
      expect(links).toContain('https://external.com');
    });

    it('should extract links from a specific container', () => {
      const result = extractCommand.extractLinks({
        type: 'NAV',
        attr: 'id',
        attrValue: 'mainNav',
      });

      expect(result.success).toBe(true);
      const links = result.data as string[];
      expect(links).toHaveLength(3);
      expect(links).toContain('/home');
      expect(links).toContain('/about');
      expect(links).toContain('/contact');
    });

    it('should return empty array for container without links', () => {
      const newContext = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <div id="noLinks">No links here</div>
        </body>
        </html>
      `);
      const cmd = new ExtractCommand(newContext);

      const result = cmd.extractLinks({
        type: 'DIV',
        attr: 'id',
        attrValue: 'noLinks',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe('Image Extraction', () => {
    let context: DomContext;
    let extractCommand: ExtractCommand;

    beforeEach(() => {
      context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <div id="gallery">
            <img src="/images/img1.jpg" alt="Image 1" />
            <img src="/images/img2.png" alt="Image 2" />
          </div>
          <img src="/logo.svg" alt="Logo" />
        </body>
        </html>
      `);
      extractCommand = new ExtractCommand(context);
    });

    it('should extract all images from the page', () => {
      const result = extractCommand.extractImages();

      expect(result.success).toBe(true);
      const srcs = result.data as string[];
      expect(srcs).toContain('/images/img1.jpg');
      expect(srcs).toContain('/images/img2.png');
      expect(srcs).toContain('/logo.svg');
    });

    it('should extract images from a specific container', () => {
      const result = extractCommand.extractImages({
        type: 'DIV',
        attr: 'id',
        attrValue: 'gallery',
      });

      expect(result.success).toBe(true);
      const srcs = result.data as string[];
      expect(srcs).toHaveLength(2);
      expect(srcs).toContain('/images/img1.jpg');
      expect(srcs).toContain('/images/img2.png');
    });
  });

  describe('Extraction Data Management', () => {
    let context: DomContext;
    let extractCommand: ExtractCommand;

    beforeEach(() => {
      context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <head><title>Test</title></head>
        <body>
          <p id="p1">First</p>
          <p id="p2">Second</p>
          <p id="p3">Third</p>
        </body>
        </html>
      `);
      extractCommand = new ExtractCommand(context);
    });

    it('should accumulate extracted data', () => {
      extractCommand.extractText({ type: 'P', attr: 'id', attrValue: 'p1' });
      extractCommand.extractText({ type: 'P', attr: 'id', attrValue: 'p2' });
      extractCommand.extractText({ type: 'P', attr: 'id', attrValue: 'p3' });

      const allData = extractCommand.getExtractedData();
      expect(allData).toEqual(['First', 'Second', 'Third']);
    });

    it('should get the last extracted value', () => {
      extractCommand.extractText({ type: 'P', attr: 'id', attrValue: 'p1' });
      extractCommand.extractText({ type: 'P', attr: 'id', attrValue: 'p2' });

      expect(extractCommand.getLastExtract()).toBe('Second');
    });

    it('should return empty string when no data extracted', () => {
      expect(extractCommand.getLastExtract()).toBe('');
    });

    it('should clear extracted data', () => {
      extractCommand.extractText({ type: 'P', attr: 'id', attrValue: 'p1' });
      extractCommand.extractText({ type: 'P', attr: 'id', attrValue: 'p2' });

      extractCommand.clearExtractedData();

      expect(extractCommand.getExtractedData()).toEqual([]);
      expect(extractCommand.getLastExtract()).toBe('');
    });
  });
});
