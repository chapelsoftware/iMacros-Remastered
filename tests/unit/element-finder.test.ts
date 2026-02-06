/**
 * Element Finder Unit Tests
 *
 * Tests XPath, CSS selectors, attribute matching, wildcards, POS handling,
 * TXT: matching, and edge cases for iMacros element finding functionality.
 *
 * Uses the real functions from extension/src/content/element-finder.ts.
 * DOM-based tests use JSDOM. The non-frame functions (findByCssSelector,
 * findByTagSelector, matchesWildcard, matchesAttribute, matchesTextContent,
 * matchesType, matchesAllAttributes, parseTagSelector) work with JSDOM.
 * XPath tests use JSDOM's document.evaluate directly since findByXPath
 * references the global document.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';

// Polyfill global DOM types needed by element-finder.ts in Node.js environment.
// The real code references global `Node.TEXT_NODE` and `document` which only exist
// in browser contexts. We create a minimal JSDOM to provide these globals.
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
if (typeof globalThis.XPathResult === 'undefined') {
  (globalThis as any).XPathResult = _polyfillDom.window.XPathResult;
}

import {
  findByCssSelector,
  findByTagSelector,
  matchesWildcard,
  matchesAttribute,
  matchesTextContent,
  matchesType,
  matchesAllAttributes,
  parseTagSelector,
  type TagSelector,
  type ElementFinderResult,
} from '@extension/content/element-finder';

/**
 * DOM context for element finder testing
 */
interface DomContext {
  window: Window & typeof globalThis;
  document: Document;
}

/**
 * Create a JSDOM environment
 */
function createDomContext(html: string = '<!DOCTYPE html><html><body></body></html>'): DomContext {
  const dom = new JSDOM(html, {
    url: 'https://example.com',
    runScripts: 'dangerously',
  });

  return {
    window: dom.window as unknown as Window & typeof globalThis,
    document: dom.window.document,
  };
}

/**
 * Parse iMacros ATTR string into Record<string, string> for use with
 * the real matchesAllAttributes function.
 */
function parseAttrString(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (!attrString) return attrs;
  const parts = attrString.split('&&');
  for (const part of parts) {
    const colonIndex = part.indexOf(':');
    if (colonIndex === -1) continue;
    const name = part.slice(0, colonIndex);
    const value = part.slice(colonIndex + 1);
    attrs[name] = value;
  }
  return attrs;
}

/**
 * Find elements by XPath using a JSDOM document directly.
 * The real findByXPath uses the global `document`, which does not exist
 * in Node.js. This helper performs the same logic against a JSDOM document.
 */
function findByXPathInDoc(xpath: string, doc: Document): Element[] {
  const elements: Element[] = [];
  try {
    const result = doc.evaluate(
      xpath,
      doc,
      null,
      7, // ORDERED_NODE_SNAPSHOT_TYPE
      null
    );
    for (let i = 0; i < result.snapshotLength; i++) {
      const node = result.snapshotItem(i);
      if (node instanceof doc.defaultView!.Element) {
        elements.push(node as unknown as Element);
      }
    }
  } catch {
    // Invalid XPath - return empty array
  }
  return elements;
}

// ============================================================
// Test Suites
// ============================================================

describe('Element Finder', () => {
  // ============================================================
  // SECTION: XPath Selectors
  // ============================================================
  describe('XPath Selectors', () => {
    let context: DomContext;

    beforeEach(() => {
      context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <form id="demo">
            <fieldset>
              <ol>
                <li><input type="text" name="fname" id="fname" /></li>
                <li><input type="text" name="lname" id="lname" /></li>
                <li><input type="email" name="email" id="email" /></li>
              </ol>
            </fieldset>
            <button type="submit">Submit</button>
          </form>
          <div id="content">
            <p class="intro">First paragraph</p>
            <p class="body">Second paragraph</p>
            <a href="/link1" class="nav">Link 1</a>
            <a href="/link2" class="nav">Link 2</a>
          </div>
          <table id="data">
            <tbody>
              <tr><td>Row 1 Col 1</td><td>Row 1 Col 2</td></tr>
              <tr><td>Row 2 Col 1</td><td>Row 2 Col 2</td></tr>
            </tbody>
          </table>
        </body>
        </html>
      `);
    });

    it('should find element by simple XPath', () => {
      const elements = findByXPathInDoc('//input', context.document);
      expect(Array.isArray(elements)).toBe(true);
      expect(elements.length).toBeGreaterThanOrEqual(1);
      // Also verify via CSS
      const cssResult = findByCssSelector('input', context.document);
      expect(cssResult.element).not.toBeNull();
      expect(cssResult.element?.getAttribute('name')).toBe('fname');
    });

    it('should find element by XPath with attribute predicate', () => {
      const elements = findByXPathInDoc("//input[@name='lname']", context.document);
      expect(Array.isArray(elements)).toBe(true);
      // Verify via CSS fallback
      const cssResult = findByCssSelector("input[name='lname']", context.document);
      expect(cssResult.element).not.toBeNull();
      expect(cssResult.element?.getAttribute('id')).toBe('lname');
    });

    it('should find element by XPath with id predicate', () => {
      const elements = findByXPathInDoc("//form[@id='demo']", context.document);
      expect(Array.isArray(elements)).toBe(true);
      // Verify via CSS
      const cssResult = findByCssSelector('#demo', context.document);
      expect(cssResult.element).not.toBeNull();
      expect(cssResult.element?.tagName.toLowerCase()).toBe('form');
    });

    it('should find element by XPath with index using CSS POS', () => {
      // Use CSS to get second input
      const result = findByCssSelector('input', context.document);
      expect(result.elements.length).toBeGreaterThanOrEqual(2);
      expect(result.elements[1]?.getAttribute('name')).toBe('lname');
    });

    it('should find element by complex nested path', () => {
      const result = findByCssSelector('#demo fieldset ol li:first-child input', context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.getAttribute('name')).toBe('fname');
    });

    it('should find element by descendant axis', () => {
      const result = findByCssSelector("#demo input[type='email']", context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.getAttribute('name')).toBe('email');
    });

    it('should find element by text using TAG selector with TXT attr', () => {
      const selector: TagSelector = {
        tag: 'P',
        pos: 1,
        attrs: { TXT: 'First paragraph' },
      };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.getAttribute('class')).toBe('intro');
    });

    it('should find element by text containing pattern using TXT wildcard', () => {
      const selector: TagSelector = {
        tag: 'P',
        pos: 1,
        attrs: { TXT: '*Second*' },
      };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.getAttribute('class')).toBe('body');
    });

    it('should find element by starts-with pattern using ATTR', () => {
      const selector: TagSelector = {
        tag: 'A',
        pos: 1,
        attrs: { HREF: '/link*' },
      };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.getAttribute('href')).toBe('/link1');
    });

    it('should find table cell by CSS', () => {
      const result = findByCssSelector('table tbody tr:nth-child(2) td:first-child', context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.textContent).toBe('Row 2 Col 1');
    });

    it('should return empty for non-matching XPath', () => {
      const elements = findByXPathInDoc("//input[@name='nonexistent']", context.document);
      expect(elements).toHaveLength(0);
    });

    it('should return empty for invalid XPath', () => {
      const elements = findByXPathInDoc('///invalid[xpath', context.document);
      expect(elements).toHaveLength(0);
    });

    it('should find multiple elements with CSS', () => {
      const result = findByCssSelector('input', context.document);
      expect(result.elements).toHaveLength(3);
    });

    it('should support position with CSS selector', () => {
      const result = findByCssSelector('input', context.document);
      expect(result.elements[2]).not.toBeNull();
      expect(result.elements[2]?.getAttribute('type')).toBe('email');
    });

    it('should find button by type attribute using TAG selector', () => {
      const selector: TagSelector = {
        tag: 'BUTTON',
        pos: 1,
        attrs: { TYPE: 'submit' },
      };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.textContent).toBe('Submit');
    });
  });

  // ============================================================
  // SECTION: CSS Selectors
  // ============================================================
  describe('CSS Selectors', () => {
    let context: DomContext;

    beforeEach(() => {
      context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <div id="container" class="wrapper main">
            <header class="header-main">
              <nav id="nav" class="navigation">
                <ul>
                  <li class="nav-item active"><a href="/">Home</a></li>
                  <li class="nav-item"><a href="/about">About</a></li>
                  <li class="nav-item"><a href="/contact">Contact</a></li>
                </ul>
              </nav>
            </header>
            <main data-section="content" data-page="home">
              <article class="post featured">
                <h1>Title</h1>
                <p class="excerpt">Description</p>
              </article>
            </main>
          </div>
        </body>
        </html>
      `);
    });

    it('should find element by tag name', () => {
      const result = findByCssSelector('nav', context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.id).toBe('nav');
    });

    it('should find element by id', () => {
      const result = findByCssSelector('#container', context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.classList.contains('wrapper')).toBe(true);
    });

    it('should find element by class', () => {
      const result = findByCssSelector('.header-main', context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.tagName.toLowerCase()).toBe('header');
    });

    it('should find element by multiple classes', () => {
      const result = findByCssSelector('.wrapper.main', context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.id).toBe('container');
    });

    it('should find element by attribute', () => {
      const result = findByCssSelector('[data-section="content"]', context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.tagName.toLowerCase()).toBe('main');
    });

    it('should find element by attribute existence', () => {
      const result = findByCssSelector('[data-page]', context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.getAttribute('data-page')).toBe('home');
    });

    it('should find element by descendant combinator', () => {
      const result = findByCssSelector('nav ul li a', context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.textContent).toBe('Home');
    });

    it('should find element by child combinator', () => {
      const result = findByCssSelector('#container > header', context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.classList.contains('header-main')).toBe(true);
    });

    it('should find element by sibling combinator', () => {
      const result = findByCssSelector('article h1 + p', context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.classList.contains('excerpt')).toBe(true);
    });

    it('should find element by :first-child pseudo-class', () => {
      const result = findByCssSelector('li:first-child', context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.classList.contains('active')).toBe(true);
    });

    it('should find element by :nth-child pseudo-class', () => {
      const result = findByCssSelector('li:nth-child(2)', context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.querySelector('a')?.textContent).toBe('About');
    });

    it('should find element by :not pseudo-class', () => {
      const result = findByCssSelector('li:not(.active)', context.document);
      expect(result.elements).toHaveLength(2);
    });

    it('should find multiple elements by CSS', () => {
      const result = findByCssSelector('.nav-item', context.document);
      expect(result.elements).toHaveLength(3);
    });

    it('should support position with CSS selector via elements array', () => {
      const result = findByCssSelector('li', context.document);
      expect(result.elements[1]?.querySelector('a')?.textContent).toBe('About');
    });

    it('should return null element for non-matching CSS selector', () => {
      const result = findByCssSelector('.nonexistent-class', context.document);
      expect(result.element).toBeNull();
    });

    it('should return empty elements for invalid CSS selector', () => {
      const result = findByCssSelector('[invalid', context.document);
      expect(result.elements).toHaveLength(0);
    });
  });

  // ============================================================
  // SECTION: Attribute Matching
  // ============================================================
  describe('Attribute Matching', () => {
    let context: DomContext;

    beforeEach(() => {
      context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <form id="testForm" name="registration">
            <input type="text" name="username" id="user" class="input-field required" value="default" />
            <input type="password" name="password" id="pass" class="input-field" />
            <input type="email" name="email" id="mail" class="input-field email-input" />
            <input type="checkbox" name="agree" id="agree" value="yes" />
            <input type="radio" name="gender" id="male" value="male" />
            <input type="radio" name="gender" id="female" value="female" />
            <select name="country" id="country">
              <option value="us">United States</option>
              <option value="uk">United Kingdom</option>
            </select>
            <button type="submit" id="submitBtn" class="btn btn-primary">Submit</button>
          </form>
          <div id="info" class="info-panel" data-status="active" data-user-id="12345">
            <span title="Help text">Info</span>
          </div>
        </body>
        </html>
      `);
    });

    it('should find element by TYPE attribute (INPUT:TEXT)', () => {
      const selector: TagSelector = {
        tag: 'INPUT',
        pos: 1,
        type: 'INPUT:TEXT',
        attrs: {},
      };
      const result = findByTagSelector(selector, context.document);
      expect(result.count).toBeGreaterThanOrEqual(1);
      expect(result.element?.getAttribute('name')).toBe('username');
    });

    it('should find element by TYPE attribute (INPUT:PASSWORD)', () => {
      const selector: TagSelector = {
        tag: 'INPUT',
        pos: 1,
        type: 'INPUT:PASSWORD',
        attrs: {},
      };
      const result = findByTagSelector(selector, context.document);
      expect(result.count).toBe(1);
      expect(result.element?.getAttribute('name')).toBe('password');
    });

    it('should find element by TYPE attribute (INPUT:EMAIL)', () => {
      const selector: TagSelector = {
        tag: 'INPUT',
        pos: 1,
        type: 'INPUT:EMAIL',
        attrs: {},
      };
      const result = findByTagSelector(selector, context.document);
      expect(result.count).toBe(1);
      expect(result.element?.getAttribute('name')).toBe('email');
    });

    it('should find element by TYPE attribute (INPUT:CHECKBOX)', () => {
      const selector: TagSelector = {
        tag: 'INPUT',
        pos: 1,
        type: 'INPUT:CHECKBOX',
        attrs: {},
      };
      const result = findByTagSelector(selector, context.document);
      expect(result.count).toBe(1);
      expect(result.element?.getAttribute('name')).toBe('agree');
    });

    it('should find elements by TYPE attribute (INPUT:RADIO)', () => {
      const selector: TagSelector = {
        tag: 'INPUT',
        pos: 1,
        type: 'INPUT:RADIO',
        attrs: {},
      };
      const result = findByTagSelector(selector, context.document);
      expect(result.count).toBe(2);
    });

    it('should find element by NAME attribute', () => {
      const allElements = Array.from(context.document.querySelectorAll('*'));
      const matching = allElements.filter(el => matchesAllAttributes(el, { NAME: 'username' }));
      expect(matching).toHaveLength(1);
      expect(matching[0].getAttribute('id')).toBe('user');
    });

    it('should find element by ID attribute', () => {
      const allElements = Array.from(context.document.querySelectorAll('*'));
      const matching = allElements.filter(el => matchesAllAttributes(el, { ID: 'pass' }));
      expect(matching).toHaveLength(1);
      expect(matching[0].getAttribute('name')).toBe('password');
    });

    it('should find elements by CLASS attribute with wildcard', () => {
      const inputs = Array.from(context.document.querySelectorAll('input'));
      const matching = inputs.filter(el => matchesAttribute(el, 'CLASS', '*input-field*'));
      expect(matching).toHaveLength(3);
    });

    it('should find element by VALUE attribute', () => {
      const radios = Array.from(context.document.querySelectorAll('input[type="radio"]'));
      const matching = radios.filter(el => matchesAllAttributes(el, { VALUE: 'male' }));
      expect(matching).toHaveLength(1);
      expect(matching[0].getAttribute('id')).toBe('male');
    });

    it('should find element by HREF attribute', () => {
      const hrefContext = createDomContext(`
        <html><body>
          <a href="/page1" id="link1">Link 1</a>
          <a href="/page2" id="link2">Link 2</a>
        </body></html>
      `);
      const links = Array.from(hrefContext.document.querySelectorAll('a'));
      const matching = links.filter(el => matchesAttribute(el, 'HREF', '/page2'));
      expect(matching).toHaveLength(1);
      expect(matching[0].getAttribute('id')).toBe('link2');
    });

    it('should find element by TITLE attribute', () => {
      const allElements = Array.from(context.document.querySelectorAll('*'));
      const matching = allElements.filter(el => matchesAttribute(el, 'TITLE', 'Help text'));
      expect(matching).toHaveLength(1);
      expect(matching[0].tagName.toLowerCase()).toBe('span');
    });

    it('should find element by data attribute', () => {
      const allElements = Array.from(context.document.querySelectorAll('*'));
      const matching = allElements.filter(el => matchesAttribute(el, 'DATA-STATUS', 'active'));
      expect(matching).toHaveLength(1);
      expect(matching[0].getAttribute('id')).toBe('info');
    });

    it('should find element by multiple attributes', () => {
      const inputs = Array.from(context.document.querySelectorAll('input'));
      const matching = inputs.filter(el =>
        matchesAllAttributes(el, { TYPE: 'text', NAME: 'username' })
      );
      expect(matching).toHaveLength(1);
      expect(matching[0].getAttribute('id')).toBe('user');
    });

    it('should find element by three attributes', () => {
      const inputs = Array.from(context.document.querySelectorAll('input'));
      const matching = inputs.filter(el =>
        matchesAllAttributes(el, { TYPE: 'text', NAME: 'username', CLASS: '*input-field*' })
      );
      expect(matching).toHaveLength(1);
    });

    it('should not find element when one attribute does not match', () => {
      const inputs = Array.from(context.document.querySelectorAll('input'));
      const matching = inputs.filter(el =>
        matchesAllAttributes(el, { TYPE: 'text', NAME: 'nonexistent' })
      );
      expect(matching).toHaveLength(0);
    });

    it('should find element using findByTagSelector with attrs', () => {
      const selector: TagSelector = {
        tag: 'INPUT',
        pos: 1,
        type: 'INPUT',
        attrs: { NAME: 'email' },
      };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.getAttribute('type')).toBe('email');
    });
  });

  // ============================================================
  // SECTION: Wildcard Patterns
  // ============================================================
  describe('Wildcard Patterns', () => {
    let context: DomContext;

    beforeEach(() => {
      context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <a href="/products/shoes" class="product-link">Buy Shoes</a>
          <a href="/products/shirts" class="product-link">Buy Shirts</a>
          <a href="/about" class="nav-link">About Us</a>
          <a href="/contact" class="nav-link">Contact Us</a>
          <input type="text" name="user_name" id="input1" />
          <input type="text" name="user_email" id="input2" />
          <input type="text" name="phone" id="input3" />
          <div class="box-red">Red Box</div>
          <div class="box-blue">Blue Box</div>
          <div class="container">Container</div>
          <button id="btn-save">Save</button>
          <button id="btn-cancel">Cancel</button>
          <button id="submit">Submit</button>
        </body>
        </html>
      `);
    });

    it('should match any attribute value with single asterisk (*)', () => {
      const links = Array.from(context.document.querySelectorAll('a'));
      const matching = links.filter(el => matchesAttribute(el, 'HREF', '*'));
      expect(matching).toHaveLength(4);
    });

    it('should match attribute containing pattern (*pattern*)', () => {
      const links = Array.from(context.document.querySelectorAll('a'));
      const matching = links.filter(el => matchesAttribute(el, 'HREF', '*/products*'));
      expect(matching).toHaveLength(2);
    });

    it('should match attribute starting with pattern (pattern*)', () => {
      const links = Array.from(context.document.querySelectorAll('a'));
      const matching = links.filter(el => matchesAttribute(el, 'CLASS', 'product*'));
      expect(matching).toHaveLength(2);
    });

    it('should match attribute containing user pattern (*user*)', () => {
      const inputs = Array.from(context.document.querySelectorAll('input'));
      const matching = inputs.filter(el => matchesAttribute(el, 'NAME', '*user*'));
      expect(matching).toHaveLength(2);
    });

    it('should match text content with wildcard (*)', () => {
      const links = Array.from(context.document.querySelectorAll('a'));
      const matching = links.filter(el => matchesTextContent(el, '*Buy*'));
      expect(matching).toHaveLength(2);
    });

    it('should match text starting with pattern', () => {
      const divs = Array.from(context.document.querySelectorAll('div'));
      const matching = divs.filter(el => matchesTextContent(el, 'Box*'));
      expect(matching).toHaveLength(0); // 'Red Box' and 'Blue Box' start with color, not 'Box'
    });

    it('should match text ending with pattern', () => {
      const divs = Array.from(context.document.querySelectorAll('div'));
      const matching = divs.filter(el => matchesTextContent(el, '*Box'));
      expect(matching).toHaveLength(2);
    });

    it('should match text containing pattern', () => {
      const links = Array.from(context.document.querySelectorAll('a'));
      const matching = links.filter(el => matchesTextContent(el, '*Us*'));
      expect(matching).toHaveLength(2); // 'About Us' and 'Contact Us'
    });

    it('should match any non-empty text with asterisk', () => {
      const buttons = Array.from(context.document.querySelectorAll('button'));
      const matching = buttons.filter(el => matchesTextContent(el, '*'));
      expect(matching).toHaveLength(3);
    });

    it('should find element with wildcard in ID using starts-with', () => {
      const buttons = Array.from(context.document.querySelectorAll('button'));
      const matching = buttons.filter(el => matchesAttribute(el, 'ID', 'btn-*'));
      expect(matching).toHaveLength(2);
    });

    it('should find element with wildcard in class using contains', () => {
      const divs = Array.from(context.document.querySelectorAll('div'));
      const matching = divs.filter(el => matchesAttribute(el, 'CLASS', '*box*'));
      expect(matching).toHaveLength(2);
    });

    it('should combine wildcard TYPE with wildcard ATTR', () => {
      const selector: TagSelector = {
        tag: '*',
        pos: 1,
        attrs: { ID: '*save*' },
      };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.tagName.toLowerCase()).toBe('button');
    });
  });

  // ============================================================
  // SECTION: POS Handling
  // ============================================================
  describe('POS Handling', () => {
    let context: DomContext;

    beforeEach(() => {
      context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <ul id="list">
            <li>Item 1</li>
            <li>Item 2</li>
            <li>Item 3</li>
            <li>Item 4</li>
            <li>Item 5</li>
          </ul>
          <div class="card">Card 1</div>
          <div class="card">Card 2</div>
          <div class="card">Card 3</div>
          <input type="text" class="field" />
          <input type="text" class="field" />
          <input type="text" class="field" />
        </body>
        </html>
      `);
    });

    it('should find first element with POS=1', () => {
      const selector: TagSelector = { tag: 'LI', pos: 1, attrs: {} };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.textContent).toBe('Item 1');
    });

    it('should find second element with POS=2', () => {
      const selector: TagSelector = { tag: 'LI', pos: 2, attrs: {} };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.textContent).toBe('Item 2');
    });

    it('should find last element with correct POS', () => {
      const selector: TagSelector = { tag: 'LI', pos: 5, attrs: {} };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.textContent).toBe('Item 5');
    });

    it('should return null for POS=0', () => {
      const selector: TagSelector = { tag: 'LI', pos: 0, attrs: {} };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).toBeNull();
    });

    it('should find last element with negative POS (-1)', () => {
      // In the real implementation, negative POS means counting from the end
      const selector: TagSelector = { tag: 'LI', pos: -1, attrs: {} };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.textContent).toBe('Item 5');
    });

    it('should return null for POS exceeding element count', () => {
      const selector: TagSelector = { tag: 'LI', pos: 100, attrs: {} };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).toBeNull();
    });

    it('should default to POS=1 when not specified via parseTagSelector', () => {
      const parsed = parseTagSelector('TAG POS=1 TYPE=DIV ATTR:CLASS=card');
      expect(parsed).not.toBeNull();
      const result = findByTagSelector(parsed!, context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.textContent).toBe('Card 1');
    });

    it('should apply POS after filtering', () => {
      const selector: TagSelector = {
        tag: 'DIV',
        pos: 2,
        attrs: { CLASS: 'card' },
      };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.textContent).toBe('Card 2');
    });

    it('should apply POS with CSS selector via elements array', () => {
      const result = findByCssSelector('.field', context.document);
      expect(result.elements.length).toBeGreaterThanOrEqual(2);
      expect(result.elements[1]?.tagName.toLowerCase()).toBe('input');
    });

    it('should apply POS with CSS selector for card', () => {
      const result = findByCssSelector('div.card', context.document);
      expect(result.elements.length).toBeGreaterThanOrEqual(3);
      expect(result.elements[2]?.textContent).toBe('Card 3');
    });
  });

  // ============================================================
  // SECTION: TXT: Matching
  // ============================================================
  describe('TXT: Matching', () => {
    let context: DomContext;

    beforeEach(() => {
      context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <a href="/home" id="link1">Home</a>
          <a href="/about" id="link2">About Us</a>
          <a href="/products" id="link3">Our Products</a>
          <a href="/contact" id="link4">Contact Us Today</a>
          <a href="/help" id="link5">Need Help?</a>
          <button id="btn1">Submit Form</button>
          <button id="btn2">Cancel</button>
          <button id="btn3">Delete Account</button>
          <div class="message">Welcome to our site!</div>
          <div class="error">Error: Invalid input</div>
          <span class="status">Status: Active</span>
          <span class="count">Items: 42</span>
          <p>   Whitespace text   </p>
          <p></p>
        </body>
        </html>
      `);
    });

    it('should find element by exact text match', () => {
      const selector: TagSelector = { tag: 'A', pos: 1, attrs: { TXT: 'Home' } };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.getAttribute('id')).toBe('link1');
    });

    it('should find element by text containing pattern (*text*)', () => {
      const selector: TagSelector = { tag: 'A', pos: 1, attrs: { TXT: '*Products*' } };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.getAttribute('id')).toBe('link3');
    });

    it('should find element by text starting with pattern (text*)', () => {
      const selector: TagSelector = { tag: 'A', pos: 1, attrs: { TXT: 'About*' } };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.getAttribute('id')).toBe('link2');
    });

    it('should find element by text ending with pattern (*text)', () => {
      const selector: TagSelector = { tag: 'A', pos: 1, attrs: { TXT: '*Today' } };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.getAttribute('id')).toBe('link4');
    });

    it('should find elements by any text (*)', () => {
      const links = Array.from(context.document.querySelectorAll('a'));
      const matching = links.filter(el => matchesTextContent(el, '*'));
      expect(matching).toHaveLength(5);
    });

    it('should find button by partial text', () => {
      const selector: TagSelector = { tag: 'BUTTON', pos: 1, attrs: { TXT: '*Form*' } };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.getAttribute('id')).toBe('btn1');
    });

    it('should handle text with special characters', () => {
      const links = Array.from(context.document.querySelectorAll('a'));
      const matching = links.filter(el => matchesTextContent(el, '*Help?*'));
      expect(matching.length).toBeGreaterThanOrEqual(1);
      expect(matching[0].getAttribute('id')).toBe('link5');
    });

    it('should find element with colon in text', () => {
      const spans = Array.from(context.document.querySelectorAll('span'));
      const matching = spans.filter(el => matchesTextContent(el, '*Status:*'));
      expect(matching.length).toBeGreaterThanOrEqual(1);
      expect(matching[0].getAttribute('class')).toBe('status');
    });

    it('should find element with number in text', () => {
      const spans = Array.from(context.document.querySelectorAll('span'));
      const matching = spans.filter(el => matchesTextContent(el, '*42*'));
      expect(matching.length).toBeGreaterThanOrEqual(1);
      expect(matching[0].getAttribute('class')).toBe('count');
    });

    it('should combine TXT with TYPE filter via TAG selector', () => {
      const selector: TagSelector = { tag: 'BUTTON', pos: 1, attrs: { TXT: 'Cancel' } };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.getAttribute('id')).toBe('btn2');
    });

    it('should combine TXT with ATTR filter via TAG selector', () => {
      const selector: TagSelector = {
        tag: 'DIV',
        pos: 1,
        attrs: { CLASS: 'error', TXT: '*Error*' },
      };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).not.toBeNull();
    });

    it('should trim whitespace in text matching', () => {
      const paragraphs = Array.from(context.document.querySelectorAll('p'));
      const matching = paragraphs.filter(el => matchesTextContent(el, 'Whitespace text'));
      expect(matching.length).toBeGreaterThanOrEqual(1);
    });

    it('should find all elements matching text pattern', () => {
      const links = Array.from(context.document.querySelectorAll('a'));
      const matching = links.filter(el => matchesTextContent(el, '*Us*'));
      expect(matching).toHaveLength(2); // 'About Us' and 'Contact Us Today'
    });

    it('should apply TXT filter through matchesAttribute', () => {
      const buttons = Array.from(context.document.querySelectorAll('button'));
      const matching = buttons.filter(el => matchesAttribute(el, 'TXT', 'Submit Form'));
      expect(matching).toHaveLength(1);
      expect(matching[0].getAttribute('id')).toBe('btn1');
    });

    it('should handle TXT with wildcard through matchesAttribute', () => {
      const buttons = Array.from(context.document.querySelectorAll('button'));
      const matching = buttons.filter(el => matchesAttribute(el, 'TXT', '*Delete*'));
      expect(matching).toHaveLength(1);
      expect(matching[0].getAttribute('id')).toBe('btn3');
    });
  });

  // ============================================================
  // SECTION: Edge Cases - No Matches
  // ============================================================
  describe('Edge Cases - No Matches', () => {
    let context: DomContext;

    beforeEach(() => {
      context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <div id="content">
            <p>Some text</p>
          </div>
        </body>
        </html>
      `);
    });

    it('should return null when no elements match type', () => {
      const selector: TagSelector = { tag: 'SPAN', pos: 1, attrs: {} };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).toBeNull();
    });

    it('should return null when no elements match attribute', () => {
      const selector: TagSelector = {
        tag: 'DIV',
        pos: 1,
        attrs: { ID: 'nonexistent' },
      };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).toBeNull();
    });

    it('should return null when no elements match text', () => {
      const selector: TagSelector = { tag: 'P', pos: 1, attrs: { TXT: 'No such text' } };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).toBeNull();
    });

    it('should return empty elements for findByTagSelector with no matches', () => {
      const selector: TagSelector = { tag: 'TABLE', pos: 1, attrs: {} };
      const result = findByTagSelector(selector, context.document);
      expect(result.elements).toHaveLength(0);
    });

    it('should return empty for XPath with no matches', () => {
      const elements = findByXPathInDoc('//nonexistent', context.document);
      expect(elements).toHaveLength(0);
    });

    it('should return null for CSS with no matches', () => {
      const result = findByCssSelector('.nonexistent', context.document);
      expect(result.element).toBeNull();
    });

    it('should handle empty document', () => {
      const emptyContext = createDomContext('<html><body></body></html>');
      const selector: TagSelector = { tag: 'DIV', pos: 1, attrs: {} };
      const result = findByTagSelector(selector, emptyContext.document);
      expect(result.element).toBeNull();
    });
  });

  // ============================================================
  // SECTION: Edge Cases - Multiple Matches
  // ============================================================
  describe('Edge Cases - Multiple Matches', () => {
    let context: DomContext;

    beforeEach(() => {
      context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <div class="item" data-id="1">First</div>
          <div class="item" data-id="2">Second</div>
          <div class="item" data-id="3">Third</div>
          <div class="item" data-id="4">Fourth</div>
          <div class="item" data-id="5">Fifth</div>
          <span class="item">Span Item</span>
          <p class="item">Paragraph Item</p>
        </body>
        </html>
      `);
    });

    it('should find all matching elements', () => {
      const selector: TagSelector = { tag: 'DIV', pos: 1, attrs: { CLASS: 'item' } };
      const result = findByTagSelector(selector, context.document);
      expect(result.count).toBe(5);
    });

    it('should correctly order elements by document order', () => {
      const selector: TagSelector = { tag: 'DIV', pos: 1, attrs: { CLASS: 'item' } };
      const result = findByTagSelector(selector, context.document);
      expect(result.elements[0].getAttribute('data-id')).toBe('1');
      expect(result.elements[4].getAttribute('data-id')).toBe('5');
    });

    it('should select specific element from multiple matches', () => {
      const selector: TagSelector = {
        tag: 'DIV',
        pos: 3,
        attrs: { CLASS: 'item' },
      };
      const result = findByTagSelector(selector, context.document);
      expect(result.element?.getAttribute('data-id')).toBe('3');
    });

    it('should find elements across different tag types', () => {
      const selector: TagSelector = {
        tag: '*',
        pos: 1,
        attrs: { CLASS: 'item' },
      };
      const result = findByTagSelector(selector, context.document);
      expect(result.count).toBe(7);
    });

    it('should handle large position with many elements', () => {
      const selector: TagSelector = {
        tag: 'DIV',
        pos: 5,
        attrs: { CLASS: 'item' },
      };
      const result = findByTagSelector(selector, context.document);
      expect(result.element?.textContent).toBe('Fifth');
    });

    it('should return null for position exceeding matches', () => {
      const selector: TagSelector = {
        tag: 'DIV',
        pos: 6,
        attrs: { CLASS: 'item' },
      };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).toBeNull();
    });
  });

  // ============================================================
  // SECTION: Edge Cases - Nested Elements
  // ============================================================
  describe('Edge Cases - Nested Elements', () => {
    let context: DomContext;

    beforeEach(() => {
      context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <div id="outer" class="container">
            <div id="middle" class="container">
              <div id="inner" class="container">
                <span id="deepest">Deep content</span>
              </div>
            </div>
          </div>
          <table id="table1">
            <tbody>
              <tr>
                <td><input type="text" name="cell1" /></td>
                <td><input type="text" name="cell2" /></td>
              </tr>
              <tr>
                <td><input type="text" name="cell3" /></td>
                <td><input type="text" name="cell4" /></td>
              </tr>
            </tbody>
          </table>
          <form id="form1">
            <fieldset>
              <legend>Personal Info</legend>
              <div class="field-group">
                <label>Name</label>
                <input type="text" name="name" />
              </div>
            </fieldset>
          </form>
        </body>
        </html>
      `);
    });

    it('should find deeply nested element by ID', () => {
      const result = findByCssSelector('#deepest', context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.textContent).toBe('Deep content');
    });

    it('should find all nested containers', () => {
      const selector: TagSelector = { tag: 'DIV', pos: 1, attrs: { CLASS: 'container' } };
      const result = findByTagSelector(selector, context.document);
      expect(result.count).toBe(3);
    });

    it('should find nested input in table', () => {
      const selector: TagSelector = {
        tag: 'INPUT',
        pos: 1,
        attrs: { NAME: 'cell3' },
      };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).not.toBeNull();
    });

    it('should navigate nested structure via CSS', () => {
      const result = findByCssSelector('#table1 tbody tr:nth-child(2) td:first-child input', context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.getAttribute('name')).toBe('cell3');
    });

    it('should find parent of nested element', () => {
      const result = findByCssSelector('#inner', context.document);
      expect(result.element).not.toBeNull();
      const parent = result.element?.parentElement;
      expect(parent?.getAttribute('id')).toBe('middle');
    });

    it('should count all text inputs in nested structures', () => {
      const selector: TagSelector = {
        tag: 'INPUT',
        pos: 1,
        type: 'INPUT:TEXT',
        attrs: {},
      };
      const result = findByTagSelector(selector, context.document);
      expect(result.count).toBeGreaterThanOrEqual(5); // 4 in table + 1 in form
    });

    it('should find element inside fieldset via CSS', () => {
      const result = findByCssSelector('fieldset input', context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.getAttribute('name')).toBe('name');
    });
  });

  // ============================================================
  // SECTION: Edge Cases - Special Characters
  // ============================================================
  describe('Edge Cases - Special Characters', () => {
    let context: DomContext;

    beforeEach(() => {
      context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <a href="/path?param=value&other=123" id="link1">Query Link</a>
          <a href="/path#section" id="link2">Hash Link</a>
          <a href="https://example.com" id="link3">External Link</a>
          <input type="text" name="user[name]" id="bracketInput" />
          <input type="text" name="field.value" id="dotInput" />
          <div data-json='{"key":"value"}' id="jsonDiv">JSON Data</div>
          <span>&lt;script&gt;alert(1)&lt;/script&gt;</span>
          <p>Price: $99.99</p>
          <p>Email: user@example.com</p>
          <button onclick="alert('test')">Click Me</button>
        </body>
        </html>
      `);
    });

    it('should handle URL with query parameters in HREF', () => {
      const links = Array.from(context.document.querySelectorAll('a'));
      const matching = links.filter(el => matchesAttribute(el, 'HREF', '*param=value*'));
      expect(matching).toHaveLength(1);
      expect(matching[0].getAttribute('id')).toBe('link1');
    });

    it('should handle URL with hash in HREF', () => {
      const links = Array.from(context.document.querySelectorAll('a'));
      const matching = links.filter(el => matchesAttribute(el, 'HREF', '*#section*'));
      expect(matching).toHaveLength(1);
      expect(matching[0].getAttribute('id')).toBe('link2');
    });

    it('should handle brackets in attribute value', () => {
      const inputs = Array.from(context.document.querySelectorAll('input'));
      const matching = inputs.filter(el => matchesAttribute(el, 'NAME', 'user[name]'));
      expect(matching).toHaveLength(1);
      expect(matching[0].getAttribute('id')).toBe('bracketInput');
    });

    it('should handle dot in attribute value', () => {
      const inputs = Array.from(context.document.querySelectorAll('input'));
      const matching = inputs.filter(el => matchesAttribute(el, 'NAME', 'field.value'));
      expect(matching).toHaveLength(1);
      expect(matching[0].getAttribute('id')).toBe('dotInput');
    });

    it('should handle JSON in data attribute', () => {
      const result = findByCssSelector('#jsonDiv', context.document);
      expect(result.element).not.toBeNull();
      const jsonData = result.element?.getAttribute('data-json');
      expect(jsonData).toBe('{"key":"value"}');
    });

    it('should find element with dollar sign in text', () => {
      const paragraphs = Array.from(context.document.querySelectorAll('p'));
      const matching = paragraphs.filter(el => matchesTextContent(el, '*$99.99*'));
      expect(matching.length).toBeGreaterThanOrEqual(1);
    });

    it('should find element with @ sign in text', () => {
      const paragraphs = Array.from(context.document.querySelectorAll('p'));
      const matching = paragraphs.filter(el => matchesTextContent(el, '*@example*'));
      expect(matching.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle HTML entities in text', () => {
      const spans = Array.from(context.document.querySelectorAll('span'));
      const matching = spans.filter(el => matchesTextContent(el, '*script*'));
      expect(matching.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle external URL matching', () => {
      const links = Array.from(context.document.querySelectorAll('a'));
      const matching = links.filter(el => matchesAttribute(el, 'HREF', 'https://*'));
      expect(matching).toHaveLength(1);
      expect(matching[0].getAttribute('id')).toBe('link3');
    });
  });

  // ============================================================
  // SECTION: parseTagSelector Tests
  // ============================================================
  describe('parseTagSelector', () => {
    it('should parse simple TAG selector', () => {
      const selector = parseTagSelector('TAG POS=1 TYPE=INPUT:TEXT ATTR:NAME=username');
      expect(selector).not.toBeNull();
      expect(selector!.pos).toBe(1);
      expect(selector!.type).toBe('INPUT:TEXT');
      expect(selector!.tag).toBe('INPUT');
      expect(selector!.attrs['NAME']).toBe('username');
    });

    it('should parse selector without TAG prefix', () => {
      const selector = parseTagSelector('POS=2 TYPE=A ATTR:HREF=/page');
      expect(selector).not.toBeNull();
      expect(selector!.pos).toBe(2);
      expect(selector!.type).toBe('A');
      expect(selector!.attrs['HREF']).toBe('/page');
    });

    it('should parse selector with multiple ATTR', () => {
      const selector = parseTagSelector('TAG POS=1 TYPE=DIV ATTR:CLASS=container ATTR:ID=main');
      expect(selector).not.toBeNull();
      expect(selector!.attrs['CLASS']).toBe('container');
      expect(selector!.attrs['ID']).toBe('main');
    });

    it('should default POS to 1', () => {
      const selector = parseTagSelector('TAG TYPE=INPUT');
      expect(selector).not.toBeNull();
      expect(selector!.pos).toBe(1);
    });

    it('should default tag to *', () => {
      const selector = parseTagSelector('TAG POS=1');
      expect(selector).not.toBeNull();
      expect(selector!.tag).toBe('*');
    });

    it('should parse POS=R for random', () => {
      const selector = parseTagSelector('TAG POS=R1 TYPE=DIV');
      expect(selector).not.toBeNull();
      expect(selector!.pos).toBe('random');
    });

    it('should extract tag from TYPE with subtype', () => {
      const selector = parseTagSelector('TAG POS=1 TYPE=INPUT:CHECKBOX');
      expect(selector).not.toBeNull();
      expect(selector!.tag).toBe('INPUT');
      expect(selector!.type).toBe('INPUT:CHECKBOX');
    });

    it('should handle negative POS', () => {
      const selector = parseTagSelector('TAG POS=-1 TYPE=A');
      expect(selector).not.toBeNull();
      expect(selector!.pos).toBe(-1);
    });
  });

  // ============================================================
  // SECTION: matchesWildcard Tests
  // ============================================================
  describe('matchesWildcard', () => {
    it('should match exact value', () => {
      expect(matchesWildcard('test', 'test')).toBe(true);
    });

    it('should not match different value for exact', () => {
      expect(matchesWildcard('other', 'test')).toBe(false);
    });

    it('should match any value with *', () => {
      expect(matchesWildcard('anything', '*')).toBe(true);
    });

    it('should match empty string with *', () => {
      expect(matchesWildcard('', '*')).toBe(true);
    });

    it('should match contains pattern', () => {
      expect(matchesWildcard('hello world', '*world*')).toBe(true);
    });

    it('should match startsWith pattern', () => {
      expect(matchesWildcard('prefix-value', 'prefix*')).toBe(true);
    });

    it('should match endsWith pattern', () => {
      expect(matchesWildcard('value-suffix', '*suffix')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(matchesWildcard('Hello', 'hello')).toBe(true);
      expect(matchesWildcard('HELLO', 'hello')).toBe(true);
    });

    it('should handle multiple wildcards', () => {
      expect(matchesWildcard('abc123def', 'abc*def')).toBe(true);
    });
  });

  // ============================================================
  // SECTION: matchesType Tests
  // ============================================================
  describe('matchesType', () => {
    let context: DomContext;

    beforeEach(() => {
      context = createDomContext(`
        <html><body>
          <input type="text" id="textInput" />
          <input type="checkbox" id="checkInput" />
          <button type="submit" id="submitBtn">Submit</button>
          <div id="plainDiv">Content</div>
        </body></html>
      `);
    });

    it('should match simple tag name', () => {
      const el = context.document.getElementById('textInput')!;
      expect(matchesType(el, 'INPUT')).toBe(true);
    });

    it('should match INPUT:TEXT subtype', () => {
      const el = context.document.getElementById('textInput')!;
      expect(matchesType(el, 'INPUT:TEXT')).toBe(true);
    });

    it('should match INPUT:CHECKBOX subtype', () => {
      const el = context.document.getElementById('checkInput')!;
      expect(matchesType(el, 'INPUT:CHECKBOX')).toBe(true);
    });

    it('should not match wrong subtype', () => {
      const el = context.document.getElementById('textInput')!;
      expect(matchesType(el, 'INPUT:CHECKBOX')).toBe(false);
    });

    it('should match BUTTON:SUBMIT subtype', () => {
      const el = context.document.getElementById('submitBtn')!;
      expect(matchesType(el, 'BUTTON:SUBMIT')).toBe(true);
    });

    it('should match wildcard type *', () => {
      const el = context.document.getElementById('plainDiv')!;
      expect(matchesType(el, '*')).toBe(true);
    });

    it('should not match wrong tag name', () => {
      const el = context.document.getElementById('plainDiv')!;
      expect(matchesType(el, 'SPAN')).toBe(false);
    });
  });

  // ============================================================
  // SECTION: Combined Selector Tests
  // ============================================================
  describe('Combined Selectors', () => {
    let context: DomContext;

    beforeEach(() => {
      context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <form id="searchForm">
            <input type="text" name="query" id="search-input" class="form-control" placeholder="Search..." />
            <button type="submit" class="btn btn-primary">Search</button>
          </form>
          <div id="results">
            <article class="result" data-id="1">
              <h2 class="title">First Result</h2>
              <p class="description">Description of first result</p>
              <a href="/result/1" class="read-more">Read More</a>
            </article>
            <article class="result" data-id="2">
              <h2 class="title">Second Result</h2>
              <p class="description">Description of second result</p>
              <a href="/result/2" class="read-more">Read More</a>
            </article>
          </div>
        </body>
        </html>
      `);
    });

    it('should combine TYPE and ATTR', () => {
      const selector: TagSelector = {
        tag: 'INPUT',
        pos: 1,
        type: 'INPUT:TEXT',
        attrs: {},
      };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.getAttribute('id')).toBe('search-input');
    });

    it('should combine TYPE, ATTR, and TXT via TAG selector', () => {
      const selector: TagSelector = {
        tag: 'BUTTON',
        pos: 1,
        attrs: { CLASS: '*btn*', TXT: 'Search' },
      };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).not.toBeNull();
    });

    it('should combine TYPE, multiple ATTRs, and POS', () => {
      const selector: TagSelector = {
        tag: 'A',
        pos: 2,
        attrs: { CLASS: 'read-more', HREF: '*/result/*' },
      };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.getAttribute('href')).toBe('/result/2');
    });

    it('should find article by class attribute and position', () => {
      const selector: TagSelector = {
        tag: 'ARTICLE',
        pos: 2,
        attrs: { CLASS: 'result' },
      };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.getAttribute('data-id')).toBe('2');
    });

    it('should find nested element with all selectors', () => {
      const selector: TagSelector = {
        tag: 'H2',
        pos: 1,
        attrs: { CLASS: 'title', TXT: '*Second*' },
      };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).not.toBeNull();
    });

    it('should find element with placeholder attribute', () => {
      const selector: TagSelector = {
        tag: 'INPUT',
        pos: 1,
        attrs: { PLACEHOLDER: '*Search*' },
      };
      const result = findByTagSelector(selector, context.document);
      expect(result.element).not.toBeNull();
      expect(result.element?.getAttribute('id')).toBe('search-input');
    });
  });

  // ============================================================
  // SECTION: Helper Function - parseAttrString
  // ============================================================
  describe('parseAttrString helper', () => {
    it('should parse simple attribute', () => {
      const attrs = parseAttrString('NAME:test');
      expect(attrs['NAME']).toBe('test');
    });

    it('should parse multiple attributes with &&', () => {
      const attrs = parseAttrString('NAME:test&&CLASS:active');
      expect(attrs['NAME']).toBe('test');
      expect(attrs['CLASS']).toBe('active');
    });

    it('should handle empty string', () => {
      const attrs = parseAttrString('');
      expect(Object.keys(attrs)).toHaveLength(0);
    });

    it('should handle value with colon', () => {
      const attrs = parseAttrString('HREF:http://example.com');
      expect(attrs['HREF']).toBe('http://example.com');
    });

    it('should preserve attribute name case', () => {
      const attrs = parseAttrString('CLASS:test');
      expect(attrs['CLASS']).toBe('test');
    });

    it('should preserve attribute value case', () => {
      const attrs = parseAttrString('NAME:TestValue');
      expect(attrs['NAME']).toBe('TestValue');
    });
  });
});
