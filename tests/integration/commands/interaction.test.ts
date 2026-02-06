/**
 * Interaction Commands Integration Tests
 *
 * Tests TAG, CLICK, and TYPE commands that interact with DOM elements.
 * These tests verify real DOM interactions using JSDOM.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

/**
 * Mock DOM context for interaction testing
 */
interface DomContext {
  window: Window & typeof globalThis;
  document: Document;
}

/**
 * Create a mock DOM environment for interaction testing
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
 * TAG command implementation for testing
 */
class TagCommand {
  private context: DomContext;

  constructor(context: DomContext) {
    this.context = context;
  }

  /**
   * Find an element using TAG syntax
   * TAG POS=1 TYPE=INPUT ATTR=NAME:username
   */
  find(selector: TagSelector): Element | null {
    const { document } = this.context;
    let elements: Element[];

    // Get elements by type
    if (selector.type === '*') {
      elements = Array.from(document.querySelectorAll('*'));
    } else {
      elements = Array.from(document.querySelectorAll(selector.type));
    }

    // Filter by attribute
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

    // Filter by text content
    if (selector.txt) {
      elements = elements.filter((el) => {
        const text = el.textContent?.trim() || '';
        if (selector.txt === '*') {
          return text.length > 0;
        }
        return text.includes(selector.txt!);
      });
    }

    // Filter by form
    if (selector.form) {
      const formIndex = parseInt(selector.form, 10) - 1;
      const forms = document.querySelectorAll('form');
      if (formIndex >= 0 && formIndex < forms.length) {
        const targetForm = forms[formIndex];
        elements = elements.filter((el) => targetForm.contains(el));
      } else {
        return null;
      }
    }

    // Get element by position (1-indexed)
    const pos = selector.pos ?? 1;
    if (pos < 1 || pos > elements.length) {
      return null;
    }

    return elements[pos - 1];
  }

  /**
   * Set the value of a form element
   * TAG POS=1 TYPE=INPUT ATTR=NAME:username CONTENT=<value>
   */
  setContent(selector: TagSelector, content: string): { success: boolean; element: Element } {
    const element = this.find(selector);
    if (!element) {
      throw new Error(`Element not found: ${JSON.stringify(selector)}`);
    }

    if (element instanceof this.context.window.HTMLInputElement) {
      element.value = content;
      element.dispatchEvent(new this.context.window.Event('input', { bubbles: true }));
      element.dispatchEvent(new this.context.window.Event('change', { bubbles: true }));
    } else if (element instanceof this.context.window.HTMLTextAreaElement) {
      element.value = content;
      element.dispatchEvent(new this.context.window.Event('input', { bubbles: true }));
      element.dispatchEvent(new this.context.window.Event('change', { bubbles: true }));
    } else if (element instanceof this.context.window.HTMLSelectElement) {
      element.value = content;
      element.dispatchEvent(new this.context.window.Event('change', { bubbles: true }));
    } else {
      throw new Error(`Cannot set content on element type: ${element.tagName}`);
    }

    return { success: true, element };
  }
}

/**
 * CLICK command implementation for testing
 */
class ClickCommand {
  private context: DomContext;
  private tagCommand: TagCommand;

  constructor(context: DomContext) {
    this.context = context;
    this.tagCommand = new TagCommand(context);
  }

  /**
   * Click an element
   */
  click(selector: TagSelector): { success: boolean; element: Element } {
    const element = this.tagCommand.find(selector);
    if (!element) {
      throw new Error(`Element not found: ${JSON.stringify(selector)}`);
    }

    // Create and dispatch mouse events
    const mousedown = new this.context.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    });
    const mouseup = new this.context.window.MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
    });
    const click = new this.context.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });

    element.dispatchEvent(mousedown);
    element.dispatchEvent(mouseup);
    element.dispatchEvent(click);

    // If it's a link, we don't actually navigate in tests
    // If it's a button in a form, we don't actually submit in tests

    return { success: true, element };
  }

  /**
   * Double-click an element
   */
  doubleClick(selector: TagSelector): { success: boolean; element: Element } {
    const element = this.tagCommand.find(selector);
    if (!element) {
      throw new Error(`Element not found: ${JSON.stringify(selector)}`);
    }

    const dblclick = new this.context.window.MouseEvent('dblclick', {
      bubbles: true,
      cancelable: true,
    });

    element.dispatchEvent(dblclick);

    return { success: true, element };
  }

  /**
   * Right-click an element (context menu)
   */
  rightClick(selector: TagSelector): { success: boolean; element: Element } {
    const element = this.tagCommand.find(selector);
    if (!element) {
      throw new Error(`Element not found: ${JSON.stringify(selector)}`);
    }

    const contextmenu = new this.context.window.MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
    });

    element.dispatchEvent(contextmenu);

    return { success: true, element };
  }
}

/**
 * TYPE command implementation for testing
 * Simulates keyboard input
 */
class TypeCommand {
  private context: DomContext;
  private tagCommand: TagCommand;

  constructor(context: DomContext) {
    this.context = context;
    this.tagCommand = new TagCommand(context);
  }

  /**
   * Type text into an element
   */
  type(selector: TagSelector, text: string): { success: boolean; element: Element } {
    const element = this.tagCommand.find(selector);
    if (!element) {
      throw new Error(`Element not found: ${JSON.stringify(selector)}`);
    }

    if (!(element instanceof this.context.window.HTMLInputElement) &&
        !(element instanceof this.context.window.HTMLTextAreaElement)) {
      throw new Error('TYPE command requires an input or textarea element');
    }

    // Focus the element
    element.focus();

    // Type each character
    for (const char of text) {
      const keydown = new this.context.window.KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: char,
      });
      const keypress = new this.context.window.KeyboardEvent('keypress', {
        bubbles: true,
        cancelable: true,
        key: char,
      });
      const keyup = new this.context.window.KeyboardEvent('keyup', {
        bubbles: true,
        cancelable: true,
        key: char,
      });

      element.dispatchEvent(keydown);
      element.dispatchEvent(keypress);
      element.value += char;
      element.dispatchEvent(new this.context.window.Event('input', { bubbles: true }));
      element.dispatchEvent(keyup);
    }

    return { success: true, element };
  }

  /**
   * Send special keys (Enter, Tab, Escape, etc.)
   */
  sendKey(selector: TagSelector, key: string): { success: boolean; element: Element } {
    const element = this.tagCommand.find(selector);
    if (!element) {
      throw new Error(`Element not found: ${JSON.stringify(selector)}`);
    }

    const keydown = new this.context.window.KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key,
    });
    const keyup = new this.context.window.KeyboardEvent('keyup', {
      bubbles: true,
      cancelable: true,
      key,
    });

    element.dispatchEvent(keydown);
    element.dispatchEvent(keyup);

    return { success: true, element };
  }
}

describe('Interaction Commands Integration Tests', () => {
  describe('TAG Command', () => {
    let context: DomContext;
    let tagCommand: TagCommand;

    beforeEach(() => {
      context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <form id="form1">
            <input type="text" name="username" id="username" />
            <input type="password" name="password" id="password" />
            <button type="submit">Login</button>
          </form>
          <form id="form2">
            <input type="text" name="search" id="search" />
            <button type="submit">Search</button>
          </form>
          <div id="content">
            <p>First paragraph</p>
            <p>Second paragraph</p>
            <a href="/link1">Link 1</a>
            <a href="/link2">Link 2</a>
          </div>
        </body>
        </html>
      `);
      tagCommand = new TagCommand(context);
    });

    it('should find element by type', () => {
      const element = tagCommand.find({ type: 'INPUT' });

      expect(element).not.toBeNull();
      expect(element?.getAttribute('name')).toBe('username');
    });

    it('should find element by type and position', () => {
      const element = tagCommand.find({ type: 'INPUT', pos: 2 });

      expect(element).not.toBeNull();
      expect(element?.getAttribute('name')).toBe('password');
    });

    it('should find element by attribute', () => {
      const element = tagCommand.find({
        type: 'INPUT',
        attr: 'name',
        attrValue: 'password',
      });

      expect(element).not.toBeNull();
      expect(element?.getAttribute('id')).toBe('password');
    });

    it('should find element by text content', () => {
      const element = tagCommand.find({
        type: 'P',
        txt: 'Second',
      });

      expect(element).not.toBeNull();
      expect(element?.textContent).toContain('Second paragraph');
    });

    it('should find element within specific form', () => {
      const element = tagCommand.find({
        type: 'INPUT',
        form: '2',
      });

      expect(element).not.toBeNull();
      expect(element?.getAttribute('name')).toBe('search');
    });

    it('should return null for non-existent element', () => {
      const element = tagCommand.find({
        type: 'INPUT',
        attr: 'name',
        attrValue: 'nonexistent',
      });

      expect(element).toBeNull();
    });

    it('should return null for invalid position', () => {
      const element = tagCommand.find({ type: 'INPUT', pos: 100 });

      expect(element).toBeNull();
    });

    it('should find element using wildcard type', () => {
      const element = tagCommand.find({
        type: '*',
        attr: 'id',
        attrValue: 'content',
      });

      expect(element).not.toBeNull();
      expect(element?.tagName).toBe('DIV');
    });

    it('should find element with wildcard attribute value', () => {
      const element = tagCommand.find({
        type: 'INPUT',
        attr: 'type',
        attrValue: '*',
      });

      expect(element).not.toBeNull();
    });

    it('should set content on input element', () => {
      let inputEvent = false;
      let changeEvent = false;

      const input = context.document.getElementById('username') as HTMLInputElement;
      input.addEventListener('input', () => { inputEvent = true; });
      input.addEventListener('change', () => { changeEvent = true; });

      const result = tagCommand.setContent(
        { type: 'INPUT', attr: 'name', attrValue: 'username' },
        'testuser'
      );

      expect(result.success).toBe(true);
      expect((result.element as HTMLInputElement).value).toBe('testuser');
      expect(inputEvent).toBe(true);
      expect(changeEvent).toBe(true);
    });

    it('should throw error when setting content on non-form element', () => {
      expect(() =>
        tagCommand.setContent({ type: 'DIV', attr: 'id', attrValue: 'content' }, 'test')
      ).toThrow('Cannot set content on element type');
    });
  });

  describe('CLICK Command', () => {
    let context: DomContext;
    let clickCommand: ClickCommand;

    beforeEach(() => {
      context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <button id="btn1">Button 1</button>
          <button id="btn2">Button 2</button>
          <a id="link1" href="/page1">Link 1</a>
          <div id="clickable">Clickable Div</div>
          <input type="checkbox" id="checkbox1" />
          <input type="radio" name="radio" id="radio1" value="1" />
          <input type="radio" name="radio" id="radio2" value="2" />
        </body>
        </html>
      `);
      clickCommand = new ClickCommand(context);
    });

    it('should click a button', () => {
      let clicked = false;
      const button = context.document.getElementById('btn1');
      button?.addEventListener('click', () => { clicked = true; });

      const result = clickCommand.click({ type: 'BUTTON', pos: 1 });

      expect(result.success).toBe(true);
      expect(clicked).toBe(true);
    });

    it('should fire mousedown, mouseup, and click events', () => {
      const events: string[] = [];
      const button = context.document.getElementById('btn1');
      button?.addEventListener('mousedown', () => events.push('mousedown'));
      button?.addEventListener('mouseup', () => events.push('mouseup'));
      button?.addEventListener('click', () => events.push('click'));

      clickCommand.click({ type: 'BUTTON', pos: 1 });

      expect(events).toEqual(['mousedown', 'mouseup', 'click']);
    });

    it('should click a link', () => {
      let clicked = false;
      const link = context.document.getElementById('link1');
      link?.addEventListener('click', (e) => {
        e.preventDefault(); // Prevent navigation in test
        clicked = true;
      });

      const result = clickCommand.click({ type: 'A', pos: 1 });

      expect(result.success).toBe(true);
      expect(clicked).toBe(true);
    });

    it('should click an element by text content', () => {
      let clicked = false;
      const button = context.document.getElementById('btn2');
      button?.addEventListener('click', () => { clicked = true; });

      const result = clickCommand.click({ type: 'BUTTON', txt: 'Button 2' });

      expect(result.success).toBe(true);
      expect(clicked).toBe(true);
    });

    it('should double-click an element', () => {
      let dblClicked = false;
      const div = context.document.getElementById('clickable');
      div?.addEventListener('dblclick', () => { dblClicked = true; });

      const result = clickCommand.doubleClick({ type: 'DIV', attr: 'id', attrValue: 'clickable' });

      expect(result.success).toBe(true);
      expect(dblClicked).toBe(true);
    });

    it('should right-click an element', () => {
      let rightClicked = false;
      const div = context.document.getElementById('clickable');
      div?.addEventListener('contextmenu', () => { rightClicked = true; });

      const result = clickCommand.rightClick({ type: 'DIV', attr: 'id', attrValue: 'clickable' });

      expect(result.success).toBe(true);
      expect(rightClicked).toBe(true);
    });

    it('should throw error for non-existent element', () => {
      expect(() =>
        clickCommand.click({ type: 'BUTTON', attr: 'id', attrValue: 'nonexistent' })
      ).toThrow('Element not found');
    });

    it('should click checkbox', () => {
      const checkbox = context.document.getElementById('checkbox1') as HTMLInputElement;
      let changeEvent = false;
      checkbox.addEventListener('change', () => { changeEvent = true; });

      const result = clickCommand.click({ type: 'INPUT', attr: 'id', attrValue: 'checkbox1' });

      expect(result.success).toBe(true);
    });

    it('should click radio button', () => {
      let clicked = false;
      const radio = context.document.getElementById('radio1');
      radio?.addEventListener('click', () => { clicked = true; });

      const result = clickCommand.click({ type: 'INPUT', attr: 'id', attrValue: 'radio1' });

      expect(result.success).toBe(true);
      expect(clicked).toBe(true);
    });
  });

  describe('TYPE Command', () => {
    let context: DomContext;
    let typeCommand: TypeCommand;

    beforeEach(() => {
      context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <input type="text" id="textInput" />
          <input type="password" id="passwordInput" />
          <textarea id="textArea"></textarea>
          <div id="nonInput">Not an input</div>
        </body>
        </html>
      `);
      typeCommand = new TypeCommand(context);
    });

    it('should type text into an input', () => {
      const result = typeCommand.type({ type: 'INPUT', pos: 1 }, 'hello');

      expect(result.success).toBe(true);
      expect((result.element as HTMLInputElement).value).toBe('hello');
    });

    it('should type text into a textarea', () => {
      const result = typeCommand.type({ type: 'TEXTAREA', pos: 1 }, 'multiline\ntext');

      expect(result.success).toBe(true);
      expect((result.element as HTMLTextAreaElement).value).toBe('multiline\ntext');
    });

    it('should fire keyboard events for each character', () => {
      const events: string[] = [];
      const input = context.document.getElementById('textInput');
      input?.addEventListener('keydown', () => events.push('keydown'));
      input?.addEventListener('keypress', () => events.push('keypress'));
      input?.addEventListener('input', () => events.push('input'));
      input?.addEventListener('keyup', () => events.push('keyup'));

      typeCommand.type({ type: 'INPUT', attr: 'id', attrValue: 'textInput' }, 'ab');

      // Should have 4 events per character (2 characters = 8 events)
      expect(events).toEqual([
        'keydown', 'keypress', 'input', 'keyup',
        'keydown', 'keypress', 'input', 'keyup',
      ]);
    });

    it('should focus the element before typing', () => {
      let focused = false;
      const input = context.document.getElementById('textInput');
      input?.addEventListener('focus', () => { focused = true; });

      typeCommand.type({ type: 'INPUT', attr: 'id', attrValue: 'textInput' }, 'test');

      expect(focused).toBe(true);
    });

    it('should throw error when typing into non-input element', () => {
      expect(() =>
        typeCommand.type({ type: 'DIV', attr: 'id', attrValue: 'nonInput' }, 'test')
      ).toThrow('TYPE command requires an input or textarea element');
    });

    it('should send special keys', () => {
      const events: string[] = [];
      const input = context.document.getElementById('textInput');
      input?.addEventListener('keydown', (e) => events.push(`keydown:${e.key}`));
      input?.addEventListener('keyup', (e) => events.push(`keyup:${e.key}`));

      typeCommand.sendKey({ type: 'INPUT', attr: 'id', attrValue: 'textInput' }, 'Enter');

      expect(events).toContain('keydown:Enter');
      expect(events).toContain('keyup:Enter');
    });

    it('should send Tab key', () => {
      let keyReceived = '';
      const input = context.document.getElementById('textInput');
      input?.addEventListener('keydown', (e) => { keyReceived = e.key; });

      typeCommand.sendKey({ type: 'INPUT', attr: 'id', attrValue: 'textInput' }, 'Tab');

      expect(keyReceived).toBe('Tab');
    });

    it('should send Escape key', () => {
      let keyReceived = '';
      const input = context.document.getElementById('textInput');
      input?.addEventListener('keydown', (e) => { keyReceived = e.key; });

      typeCommand.sendKey({ type: 'INPUT', attr: 'id', attrValue: 'textInput' }, 'Escape');

      expect(keyReceived).toBe('Escape');
    });

    it('should type into password field', () => {
      const result = typeCommand.type(
        { type: 'INPUT', attr: 'type', attrValue: 'password' },
        'secret123'
      );

      expect(result.success).toBe(true);
      expect((result.element as HTMLInputElement).value).toBe('secret123');
    });
  });

  describe('Combined Interaction Commands', () => {
    let context: DomContext;
    let tagCommand: TagCommand;
    let clickCommand: ClickCommand;
    let typeCommand: TypeCommand;

    beforeEach(() => {
      context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <form id="loginForm">
            <input type="text" name="username" id="username" />
            <input type="password" name="password" id="password" />
            <button type="submit" id="loginBtn">Login</button>
          </form>
        </body>
        </html>
      `);
      tagCommand = new TagCommand(context);
      clickCommand = new ClickCommand(context);
      typeCommand = new TypeCommand(context);
    });

    it('should fill and submit a form', () => {
      // Type username
      typeCommand.type({ type: 'INPUT', attr: 'name', attrValue: 'username' }, 'testuser');

      // Type password
      typeCommand.type({ type: 'INPUT', attr: 'name', attrValue: 'password' }, 'testpass');

      // Click submit button
      let formSubmitted = false;
      const button = context.document.getElementById('loginBtn');
      button?.addEventListener('click', () => { formSubmitted = true; });

      clickCommand.click({ type: 'BUTTON', txt: 'Login' });

      // Verify values were set
      const usernameInput = context.document.getElementById('username') as HTMLInputElement;
      const passwordInput = context.document.getElementById('password') as HTMLInputElement;

      expect(usernameInput.value).toBe('testuser');
      expect(passwordInput.value).toBe('testpass');
      expect(formSubmitted).toBe(true);
    });

    it('should use TAG to find and interact with elements', () => {
      // Find username input
      const usernameElement = tagCommand.find({ type: 'INPUT', attr: 'name', attrValue: 'username' });
      expect(usernameElement).not.toBeNull();

      // Set content directly
      tagCommand.setContent({ type: 'INPUT', attr: 'name', attrValue: 'username' }, 'admin');

      const usernameInput = context.document.getElementById('username') as HTMLInputElement;
      expect(usernameInput.value).toBe('admin');
    });
  });
});
