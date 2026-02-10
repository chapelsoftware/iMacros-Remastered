/**
 * Interaction Commands Integration Tests
 *
 * Tests TAG, CLICK, and TYPE commands that interact with DOM elements.
 * These tests verify real DOM interactions using JSDOM.
 *
 * Also tests TAG command helper functions (parseAttrParam, parseExtractParam,
 * parsePosParam, parseContentParam, buildSelector, buildAction) and the
 * tagHandler through MacroExecutor with a mock ContentScriptSender.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  parseAttrParam,
  parseExtractParam,
  parsePosParam,
  parsePosParamEx,
  parseContentParam,
  buildSelector,
  buildAction,
  tagHandler,
  setContentScriptSender,
  noopSender,
  type ContentScriptSender,
  type ContentScriptResponse,
  type InteractionMessage,
  type TagCommandMessage,
} from '@shared/commands/interaction';
import { MacroExecutor, createExecutor, IMACROS_ERROR_CODES } from '@shared/executor';
import type { CommandContext, CommandResult } from '@shared/executor';
import { createStateManager } from '@shared/state-manager';
import { createVariableContext } from '@shared/variables';
import { parseLine } from '@shared/parser';
import type { ParsedCommand } from '@shared/parser';

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

// ===== TAG Command Helper Functions and Handler Integration Tests =====

/**
 * Helper to build a CommandContext from a raw macro line string.
 * This parses the line, then constructs a context matching the real executor shape.
 */
function buildContextFromLine(line: string): { ctx: CommandContext; state: ReturnType<typeof createStateManager> } {
  const parsed = parseLine(line, 1);
  if (parsed.type !== 'command') {
    throw new Error(`Expected command line, got ${parsed.type}`);
  }
  const command = parsed.data;

  const state = createStateManager({ macroName: 'test', maxLoops: 1 });
  const variables = state.getVariables();

  const ctx: CommandContext = {
    command,
    variables,
    state,
    getParam: (key: string) => {
      const param = command.parameters.find(p => p.key.toUpperCase() === key.toUpperCase());
      return param?.value;
    },
    getRequiredParam: (key: string) => {
      const param = command.parameters.find(p => p.key.toUpperCase() === key.toUpperCase());
      if (!param) {
        throw new Error(`Missing required parameter: ${key}`);
      }
      return param.value;
    },
    expand: (text: string) => {
      const result = variables.expand(text);
      return result.expanded;
    },
    log: () => {},
  };

  return { ctx, state };
}

describe('TAG Command Helper Functions', () => {
  describe('parseAttrParam', () => {
    it('should parse single NAME:value attribute', () => {
      const attrs = parseAttrParam('NAME:q');
      expect(attrs).toEqual({ name: 'q' });
    });

    it('should parse single ID:value attribute', () => {
      const attrs = parseAttrParam('ID:search-box');
      expect(attrs).toEqual({ id: 'search-box' });
    });

    it('should parse TXT attribute to innerText', () => {
      const attrs = parseAttrParam('TXT:Click Here');
      expect(attrs).toEqual({ innerText: 'Click Here' });
    });

    it('should parse CLASS attribute', () => {
      const attrs = parseAttrParam('CLASS:btn-primary');
      expect(attrs).toEqual({ class: 'btn-primary' });
    });

    it('should parse HREF attribute', () => {
      const attrs = parseAttrParam('HREF:/login');
      expect(attrs).toEqual({ href: '/login' });
    });

    it('should parse SRC attribute', () => {
      const attrs = parseAttrParam('SRC:image.png');
      expect(attrs).toEqual({ src: 'image.png' });
    });

    it('should parse VALUE attribute', () => {
      const attrs = parseAttrParam('VALUE:submit');
      expect(attrs).toEqual({ value: 'submit' });
    });

    it('should parse TYPE attribute', () => {
      const attrs = parseAttrParam('TYPE:checkbox');
      expect(attrs).toEqual({ type: 'checkbox' });
    });

    it('should parse PLACEHOLDER attribute', () => {
      const attrs = parseAttrParam('PLACEHOLDER:Enter email');
      expect(attrs).toEqual({ placeholder: 'Enter email' });
    });

    it('should parse multiple attributes separated by &&', () => {
      const attrs = parseAttrParam('NAME:user&&CLASS:form-input');
      expect(attrs).toEqual({ name: 'user', class: 'form-input' });
    });

    it('should parse three attributes separated by &&', () => {
      const attrs = parseAttrParam('NAME:email&&TYPE:text&&CLASS:input');
      expect(attrs).toEqual({ name: 'email', type: 'text', class: 'input' });
    });

    it('should handle custom/unknown attribute prefix', () => {
      const attrs = parseAttrParam('DATA-TESTID:my-element');
      expect(attrs).toEqual({ 'data-testid': 'my-element' });
    });

    it('should handle attribute without prefix as generic selector', () => {
      const attrs = parseAttrParam('submit-button');
      expect(attrs).toEqual({ selector: 'submit-button' });
    });

    it('should handle empty parts in && split', () => {
      const attrs = parseAttrParam('NAME:q&&');
      expect(attrs).toEqual({ name: 'q' });
    });

    it('should trim whitespace in attribute parts', () => {
      const attrs = parseAttrParam(' NAME:q && CLASS:main ');
      expect(attrs).toEqual({ name: 'q', class: 'main' });
    });

    it('should be case-insensitive for prefixes', () => {
      const attrs = parseAttrParam('name:q');
      expect(attrs).toEqual({ name: 'q' });
    });
  });

  describe('parseExtractParam', () => {
    it('should parse TXT extract type', () => {
      expect(parseExtractParam('TXT')).toBe('TXT');
    });

    it('should parse HTM extract type', () => {
      expect(parseExtractParam('HTM')).toBe('HTM');
    });

    it('should parse HREF extract type', () => {
      expect(parseExtractParam('HREF')).toBe('HREF');
    });

    it('should parse TITLE extract type', () => {
      expect(parseExtractParam('TITLE')).toBe('TITLE');
    });

    it('should parse ALT extract type', () => {
      expect(parseExtractParam('ALT')).toBe('ALT');
    });

    it('should parse VALUE extract type', () => {
      expect(parseExtractParam('VALUE')).toBe('VALUE');
    });

    it('should parse SRC extract type', () => {
      expect(parseExtractParam('SRC')).toBe('SRC');
    });

    it('should parse ID extract type', () => {
      expect(parseExtractParam('ID')).toBe('ID');
    });

    it('should parse CLASS extract type', () => {
      expect(parseExtractParam('CLASS')).toBe('CLASS');
    });

    it('should parse NAME extract type', () => {
      expect(parseExtractParam('NAME')).toBe('NAME');
    });

    it('should be case-insensitive for standard types', () => {
      expect(parseExtractParam('txt')).toBe('TXT');
      expect(parseExtractParam('Htm')).toBe('HTM');
      expect(parseExtractParam('href')).toBe('HREF');
    });

    it('should parse ATTR: prefix for custom attributes', () => {
      expect(parseExtractParam('ATTR:data-value')).toBe('data-value');
    });

    it('should parse ATTR: prefix case-insensitively', () => {
      expect(parseExtractParam('attr:data-id')).toBe('data-id');
    });

    it('should parse TXTALL extract type', () => {
      expect(parseExtractParam('TXTALL')).toBe('TXTALL');
    });

    it('should parse CHECKED extract type', () => {
      expect(parseExtractParam('CHECKED')).toBe('CHECKED');
    });

    it('should throw BadParameter for unknown extract types', () => {
      expect(() => parseExtractParam('CUSTOM')).toThrow('BadParameter');
      expect(() => parseExtractParam('INVALID')).toThrow('BadParameter');
    });
  });

  describe('parsePosParam', () => {
    it('should parse positive integer position', () => {
      expect(parsePosParam('1')).toBe(1);
    });

    it('should parse larger positive position', () => {
      expect(parsePosParam('5')).toBe(5);
    });

    it('should parse negative position (last)', () => {
      expect(parsePosParam('-1')).toBe(-1);
    });

    it('should parse negative position (second to last)', () => {
      expect(parsePosParam('-2')).toBe(-2);
    });

    // Note: POS=R<n> is relative positioning (not random)
    // R1 = 1st match after anchor, R-1 = 1st match before anchor
    // For backwards compatibility, parsePosParam returns the numeric value
    // To get the relative flag, use parsePosParamEx from interaction.ts

    it('should parse R1 (relative position) and return 1', () => {
      // R1 means "1st element after anchor" - returns the position number
      expect(parsePosParam('R1')).toBe(1);
    });

    it('should parse R3 (relative position) and return 3', () => {
      expect(parsePosParam('R3')).toBe(3);
    });

    it('should parse R-2 (relative backward position) and return -2', () => {
      expect(parsePosParam('R-2')).toBe(-2);
    });

    it('should throw for R (invalid relative)', () => {
      // "R" without a number is invalid — matches old iMacros BadParameter
      expect(() => parsePosParam('R')).toThrow('Bad parameter');
    });

    it('should handle whitespace around position', () => {
      expect(parsePosParam('  3  ')).toBe(3);
    });

    it('should throw for invalid non-numeric input', () => {
      expect(() => parsePosParam('abc')).toThrow('Bad parameter');
    });

    it('should be case-insensitive for R prefix', () => {
      // lowercase 'r' without number is invalid — throws
      expect(() => parsePosParam('r')).toThrow('Bad parameter');
      expect(parsePosParam('r5')).toBe(5);
    });
  });

  describe('parsePosParamEx (relative positioning)', () => {
    it('should parse absolute position and return relative=false', () => {
      const result = parsePosParamEx('1');
      expect(result.pos).toBe(1);
      expect(result.relative).toBe(false);
    });

    it('should parse negative absolute position', () => {
      const result = parsePosParamEx('-1');
      expect(result.pos).toBe(-1);
      expect(result.relative).toBe(false);
    });

    it('should parse R1 as relative with pos=1', () => {
      const result = parsePosParamEx('R1');
      expect(result.pos).toBe(1);
      expect(result.relative).toBe(true);
    });

    it('should parse R3 as relative with pos=3', () => {
      const result = parsePosParamEx('R3');
      expect(result.pos).toBe(3);
      expect(result.relative).toBe(true);
    });

    it('should parse R-2 as relative backward with pos=-2', () => {
      const result = parsePosParamEx('R-2');
      expect(result.pos).toBe(-2);
      expect(result.relative).toBe(true);
    });

    it('should parse lowercase r5 as relative', () => {
      const result = parsePosParamEx('r5');
      expect(result.pos).toBe(5);
      expect(result.relative).toBe(true);
    });

    it('should throw for R0 (invalid)', () => {
      expect(() => parsePosParamEx('R0')).toThrow('Bad parameter');
    });

    it('should throw for R without number (invalid)', () => {
      expect(() => parsePosParamEx('R')).toThrow('Bad parameter');
    });

    it('should handle whitespace in relative position', () => {
      const result = parsePosParamEx('  R10  ');
      expect(result.pos).toBe(10);
      expect(result.relative).toBe(true);
    });
  });

  describe('parseContentParam', () => {
    it('should pass through plain text unchanged', () => {
      expect(parseContentParam('hello world')).toBe('hello world');
    });

    it('should replace <SP> with space character', () => {
      expect(parseContentParam('hello<SP>world')).toBe('hello world');
    });

    it('should replace <BR> with newline', () => {
      expect(parseContentParam('line1<BR>line2')).toBe('line1\nline2');
    });

    it('should replace <TAB> with tab character', () => {
      expect(parseContentParam('col1<TAB>col2')).toBe('col1\tcol2');
    });

    it('should replace <ENTER> with newline', () => {
      expect(parseContentParam('text<ENTER>')).toBe('text\n');
    });

    it('should handle multiple special tokens in one string', () => {
      expect(parseContentParam('a<SP>b<TAB>c<BR>d<ENTER>')).toBe('a b\tc\nd\n');
    });

    it('should handle <SP> case-insensitively', () => {
      expect(parseContentParam('hello<sp>world')).toBe('hello world');
      expect(parseContentParam('hello<Sp>world')).toBe('hello world');
    });

    it('should handle <BR> case-insensitively', () => {
      expect(parseContentParam('a<br>b')).toBe('a\nb');
    });

    it('should handle <TAB> case-insensitively', () => {
      expect(parseContentParam('a<tab>b')).toBe('a\tb');
    });

    it('should handle <ENTER> case-insensitively', () => {
      expect(parseContentParam('a<enter>b')).toBe('a\nb');
    });

    it('should handle multiple consecutive <SP> tokens', () => {
      expect(parseContentParam('a<SP><SP><SP>b')).toBe('a   b');
    });

    it('should return empty string for empty input', () => {
      expect(parseContentParam('')).toBe('');
    });
  });

  describe('buildSelector', () => {
    it('should build XPATH selector when XPATH param present', () => {
      const { ctx } = buildContextFromLine('TAG XPATH=//input[@id="search"]');
      const selector = buildSelector(ctx);
      expect(selector.xpath).toBe('//input[@id="search"]');
      expect(selector.css).toBeUndefined();
      expect(selector.type).toBeUndefined();
    });

    it('should build CSS selector when CSS param present', () => {
      const { ctx } = buildContextFromLine('TAG CSS=.submit-btn');
      const selector = buildSelector(ctx);
      expect(selector.css).toBe('.submit-btn');
      expect(selector.xpath).toBeUndefined();
      expect(selector.type).toBeUndefined();
    });

    it('should prefer XPATH over CSS when both present', () => {
      const { ctx } = buildContextFromLine('TAG XPATH=//div CSS=.test');
      const selector = buildSelector(ctx);
      expect(selector.xpath).toBe('//div');
      expect(selector.css).toBeUndefined();
    });

    it('should build POS/TYPE/ATTR selector for traditional style', () => {
      const { ctx } = buildContextFromLine('TAG POS=1 TYPE=INPUT ATTR=NAME:q');
      const selector = buildSelector(ctx);
      expect(selector.pos).toBe(1);
      expect(selector.type).toBe('INPUT');
      expect(selector.attr).toBe('NAME:q');
      expect(selector.xpath).toBeUndefined();
      expect(selector.css).toBeUndefined();
    });

    it('should uppercase the TYPE param', () => {
      const { ctx } = buildContextFromLine('TAG POS=1 TYPE=input ATTR=NAME:q');
      const selector = buildSelector(ctx);
      expect(selector.type).toBe('INPUT');
    });

    it('should handle POS only', () => {
      const { ctx } = buildContextFromLine('TAG POS=3 TYPE=DIV');
      const selector = buildSelector(ctx);
      expect(selector.pos).toBe(3);
      expect(selector.type).toBe('DIV');
    });

    it('should handle TYPE without POS or ATTR', () => {
      const { ctx } = buildContextFromLine('TAG TYPE=BUTTON');
      const selector = buildSelector(ctx);
      expect(selector.type).toBe('BUTTON');
      expect(selector.pos).toBeUndefined();
      expect(selector.attr).toBeUndefined();
    });

    it('should expand variables in XPATH', () => {
      const { ctx } = buildContextFromLine('TAG XPATH=//input[@id="{{!VAR1}}"]');
      // Set the variable so expansion works
      ctx.variables.set('!VAR1', 'search');
      const selector = buildSelector(ctx);
      expect(selector.xpath).toBe('//input[@id="search"]');
    });

    it('should expand variables in CSS', () => {
      const { ctx } = buildContextFromLine('TAG CSS=.{{!VAR1}}');
      ctx.variables.set('!VAR1', 'my-class');
      const selector = buildSelector(ctx);
      expect(selector.css).toBe('.my-class');
    });

    it('should return empty selector when no selector params given', () => {
      const { ctx } = buildContextFromLine('TAG CONTENT=hello');
      const selector = buildSelector(ctx);
      expect(selector.xpath).toBeUndefined();
      expect(selector.css).toBeUndefined();
      expect(selector.type).toBeUndefined();
      expect(selector.pos).toBeUndefined();
      expect(selector.attr).toBeUndefined();
    });

    it('should build FORM parameter in selector', () => {
      const { ctx } = buildContextFromLine('TAG POS=1 TYPE=INPUT FORM=NAME:loginform ATTR=ID:username CONTENT=test');
      const selector = buildSelector(ctx);
      expect(selector.form).toBe('NAME:loginform');
      expect(selector.type).toBe('INPUT');
      expect(selector.attr).toBe('ID:username');
    });

    it('should build FORM parameter with multiple conditions', () => {
      const { ctx } = buildContextFromLine('TAG POS=1 TYPE=INPUT FORM=ID:mainform&&NAME:login ATTR=NAME:user');
      const selector = buildSelector(ctx);
      expect(selector.form).toBe('ID:mainform&&NAME:login');
    });

    it('should expand variables in FORM parameter', () => {
      const { ctx } = buildContextFromLine('TAG POS=1 TYPE=INPUT FORM=NAME:{{!VAR1}} ATTR=NAME:user');
      ctx.variables.set('!VAR1', 'myform');
      const selector = buildSelector(ctx);
      expect(selector.form).toBe('NAME:myform');
    });

    it('should not include FORM when param not present', () => {
      const { ctx } = buildContextFromLine('TAG POS=1 TYPE=INPUT ATTR=NAME:q CONTENT=hello');
      const selector = buildSelector(ctx);
      expect(selector.form).toBeUndefined();
    });
  });

  describe('buildAction', () => {
    it('should build CONTENT action', () => {
      const { ctx } = buildContextFromLine('TAG POS=1 TYPE=INPUT ATTR=NAME:q CONTENT=hello');
      const action = buildAction(ctx);
      expect(action.content).toBe('hello');
      expect(action.extract).toBeUndefined();
      expect(action.form).toBeUndefined();
    });

    it('should apply parseContentParam transformations to CONTENT', () => {
      const { ctx } = buildContextFromLine('TAG POS=1 TYPE=INPUT ATTR=NAME:q CONTENT=hello<SP>world');
      const action = buildAction(ctx);
      expect(action.content).toBe('hello world');
    });

    it('should build EXTRACT action', () => {
      const { ctx } = buildContextFromLine('TAG POS=1 TYPE=A ATTR=TXT:Link EXTRACT=TXT');
      const action = buildAction(ctx);
      expect(action.extract).toBe('TXT');
      expect(action.content).toBeUndefined();
    });

    it('should build EXTRACT=HTM action', () => {
      const { ctx } = buildContextFromLine('TAG POS=1 TYPE=DIV EXTRACT=HTM');
      const action = buildAction(ctx);
      expect(action.extract).toBe('HTM');
    });

    it('should build EXTRACT=HREF action', () => {
      const { ctx } = buildContextFromLine('TAG POS=1 TYPE=A EXTRACT=HREF');
      const action = buildAction(ctx);
      expect(action.extract).toBe('HREF');
    });

    it('should build EXTRACT with ATTR: prefix', () => {
      const { ctx } = buildContextFromLine('TAG POS=1 TYPE=DIV EXTRACT=ATTR:data-value');
      const action = buildAction(ctx);
      expect(action.extract).toBe('data-value');
    });

    it('should convert CONTENT=<SUBMIT> to form SUBMIT action', () => {
      const { ctx } = buildContextFromLine('TAG POS=1 TYPE=FORM CONTENT=<SUBMIT>');
      const action = buildAction(ctx);
      expect(action.form).toBe('SUBMIT');
      expect(action.content).toBeUndefined();
    });

    it('should convert CONTENT=<RESET> to form RESET action', () => {
      const { ctx } = buildContextFromLine('TAG POS=1 TYPE=FORM CONTENT=<RESET>');
      const action = buildAction(ctx);
      expect(action.form).toBe('RESET');
      expect(action.content).toBeUndefined();
    });

    it('should return empty action when neither CONTENT nor EXTRACT given', () => {
      const { ctx } = buildContextFromLine('TAG POS=1 TYPE=A ATTR=TXT:Link');
      const action = buildAction(ctx);
      expect(action.content).toBeUndefined();
      expect(action.extract).toBeUndefined();
      expect(action.form).toBeUndefined();
    });

    it('should expand variables in CONTENT', () => {
      const { ctx } = buildContextFromLine('TAG POS=1 TYPE=INPUT CONTENT={{!VAR1}}');
      ctx.variables.set('!VAR1', 'expanded_value');
      const action = buildAction(ctx);
      expect(action.content).toBe('expanded_value');
    });
  });
});

describe('TAG Command Handler Integration (with mock ContentScriptSender)', () => {
  let mockSender: ContentScriptSender;
  let sentMessages: InteractionMessage[];

  beforeEach(() => {
    sentMessages = [];
    mockSender = {
      async sendMessage(message: InteractionMessage): Promise<ContentScriptResponse> {
        sentMessages.push(message);
        return {
          success: true,
          extractedData: undefined,
        };
      },
    };
    setContentScriptSender(mockSender);
  });

  afterEach(() => {
    setContentScriptSender(noopSender);
  });

  describe('TAG with CONTENT (form value setting)', () => {
    it('should send TAG_COMMAND with correct selector and CONTENT action', async () => {
      const { ctx } = buildContextFromLine('TAG POS=1 TYPE=INPUT ATTR=NAME:q CONTENT=hello');
      const result = await tagHandler(ctx);

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as TagCommandMessage;
      expect(msg.type).toBe('TAG_COMMAND');
      expect(msg.payload.selector.pos).toBe(1);
      expect(msg.payload.selector.type).toBe('INPUT');
      expect(msg.payload.selector.attr).toBe('NAME:q');
      expect(msg.payload.action.content).toBe('hello');
    });

    it('should send TAG_COMMAND with CONTENT containing special tokens', async () => {
      const { ctx } = buildContextFromLine('TAG POS=1 TYPE=INPUT ATTR=NAME:q CONTENT=hello<SP>world');
      const result = await tagHandler(ctx);

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as TagCommandMessage;
      expect(msg.payload.action.content).toBe('hello world');
    });

    it('should send TAG_COMMAND with XPATH selector and CONTENT', async () => {
      const { ctx } = buildContextFromLine('TAG XPATH=//input[@name="search"] CONTENT=test<SP>query');
      const result = await tagHandler(ctx);

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as TagCommandMessage;
      expect(msg.payload.selector.xpath).toBe('//input[@name="search"]');
      expect(msg.payload.action.content).toBe('test query');
    });

    it('should send TAG_COMMAND with CSS selector and CONTENT', async () => {
      const { ctx } = buildContextFromLine('TAG CSS=#search-input CONTENT=my<TAB>query');
      const result = await tagHandler(ctx);

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as TagCommandMessage;
      expect(msg.payload.selector.css).toBe('#search-input');
      expect(msg.payload.action.content).toBe('my\tquery');
    });

    it('should send correct timeout from !TIMEOUT_TAG variable', async () => {
      const { ctx } = buildContextFromLine('TAG POS=1 TYPE=INPUT ATTR=NAME:q CONTENT=hello');
      ctx.state.setVariable('!TIMEOUT_TAG', 10);
      const result = await tagHandler(ctx);

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as TagCommandMessage;
      expect(msg.payload.timeout).toBe(10000);
    });

    it('should use default timeout of 6000ms when !TIMEOUT_TAG is not a number', async () => {
      const { ctx } = buildContextFromLine('TAG POS=1 TYPE=INPUT ATTR=NAME:q CONTENT=hello');
      ctx.state.setVariable('!TIMEOUT_TAG', 'invalid');
      const result = await tagHandler(ctx);

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as TagCommandMessage;
      expect(msg.payload.timeout).toBe(6000);
    });
  });

  describe('TAG with EXTRACT (data reading)', () => {
    it('should extract TXT and store in state', async () => {
      // Set up mock to return extracted data
      setContentScriptSender({
        async sendMessage(message: InteractionMessage): Promise<ContentScriptResponse> {
          sentMessages.push(message);
          return {
            success: true,
            extractedData: 'Hello World',
          };
        },
      });

      const { ctx, state } = buildContextFromLine('TAG POS=1 TYPE=DIV ATTR=ID:content EXTRACT=TXT');
      const result = await tagHandler(ctx);

      expect(result.success).toBe(true);
      expect(result.output).toBe('Hello World');

      // Verify extract data was stored in state
      const extractData = state.getExtractData();
      expect(extractData).toContain('Hello World');
    });

    it('should extract HTM and store in state', async () => {
      setContentScriptSender({
        async sendMessage(): Promise<ContentScriptResponse> {
          return {
            success: true,
            extractedData: '<p>Some <b>HTML</b></p>',
          };
        },
      });

      const { ctx, state } = buildContextFromLine('TAG POS=1 TYPE=DIV EXTRACT=HTM');
      const result = await tagHandler(ctx);

      expect(result.success).toBe(true);
      expect(result.output).toBe('<p>Some <b>HTML</b></p>');
      expect(state.getExtractData()).toContain('<p>Some <b>HTML</b></p>');
    });

    it('should extract HREF from link element', async () => {
      setContentScriptSender({
        async sendMessage(): Promise<ContentScriptResponse> {
          return {
            success: true,
            extractedData: 'https://example.com/page',
          };
        },
      });

      const { ctx, state } = buildContextFromLine('TAG POS=1 TYPE=A ATTR=TXT:Click EXTRACT=HREF');
      const result = await tagHandler(ctx);

      expect(result.success).toBe(true);
      expect(result.output).toBe('https://example.com/page');
      expect(state.getExtractData()).toContain('https://example.com/page');
    });

    it('should extract custom attribute via ATTR: prefix', async () => {
      const localMessages: InteractionMessage[] = [];
      setContentScriptSender({
        async sendMessage(message: InteractionMessage): Promise<ContentScriptResponse> {
          localMessages.push(message);
          return {
            success: true,
            extractedData: 'custom-value-123',
          };
        },
      });

      const { ctx } = buildContextFromLine('TAG POS=1 TYPE=DIV EXTRACT=ATTR:data-custom');
      const result = await tagHandler(ctx);

      expect(result.success).toBe(true);
      expect(result.output).toBe('custom-value-123');

      // Verify the message sent has the correct extract type
      const msg = localMessages[0] as TagCommandMessage;
      expect(msg.payload.action.extract).toBe('data-custom');
    });

    it('should not store extract when response has no extractedData', async () => {
      setContentScriptSender({
        async sendMessage(): Promise<ContentScriptResponse> {
          return {
            success: true,
            extractedData: undefined,
          };
        },
      });

      const { ctx, state } = buildContextFromLine('TAG POS=1 TYPE=DIV EXTRACT=TXT');
      const result = await tagHandler(ctx);

      expect(result.success).toBe(true);
      expect(state.getExtractData()).toHaveLength(0);
    });

    it('should accumulate multiple extracts across calls', async () => {
      setContentScriptSender({
        async sendMessage(_msg: InteractionMessage): Promise<ContentScriptResponse> {
          const tagMsg = _msg as TagCommandMessage;
          // Return different data based on selector
          if (tagMsg.payload.selector.pos === 1) {
            return { success: true, extractedData: 'First' };
          }
          return { success: true, extractedData: 'Second' };
        },
      });

      const state = createStateManager({ macroName: 'test', maxLoops: 1 });
      const variables = state.getVariables();

      // First extraction
      const parsed1 = parseLine('TAG POS=1 TYPE=P EXTRACT=TXT', 1);
      const cmd1 = (parsed1 as { type: 'command'; data: ParsedCommand }).data;
      const ctx1: CommandContext = {
        command: cmd1,
        variables,
        state,
        getParam: (key: string) => cmd1.parameters.find(p => p.key.toUpperCase() === key.toUpperCase())?.value,
        getRequiredParam: (key: string) => {
          const p = cmd1.parameters.find(p => p.key.toUpperCase() === key.toUpperCase());
          if (!p) throw new Error(`Missing: ${key}`);
          return p.value;
        },
        expand: (text: string) => variables.expand(text).expanded,
        log: () => {},
      };
      await tagHandler(ctx1);

      // Second extraction
      const parsed2 = parseLine('TAG POS=2 TYPE=P EXTRACT=TXT', 2);
      const cmd2 = (parsed2 as { type: 'command'; data: ParsedCommand }).data;
      const ctx2: CommandContext = {
        command: cmd2,
        variables,
        state,
        getParam: (key: string) => cmd2.parameters.find(p => p.key.toUpperCase() === key.toUpperCase())?.value,
        getRequiredParam: (key: string) => {
          const p = cmd2.parameters.find(p => p.key.toUpperCase() === key.toUpperCase());
          if (!p) throw new Error(`Missing: ${key}`);
          return p.value;
        },
        expand: (text: string) => variables.expand(text).expanded,
        log: () => {},
      };
      await tagHandler(ctx2);

      const extractData = state.getExtractData();
      expect(extractData).toHaveLength(2);
      expect(extractData[0]).toBe('First');
      expect(extractData[1]).toBe('Second');
    });
  });

  describe('Selector types', () => {
    it('should send POS/TYPE/ATTR selector correctly', async () => {
      const { ctx } = buildContextFromLine('TAG POS=2 TYPE=A ATTR=CLASS:nav-link');
      await tagHandler(ctx);

      const msg = sentMessages[0] as TagCommandMessage;
      expect(msg.payload.selector.pos).toBe(2);
      expect(msg.payload.selector.type).toBe('A');
      expect(msg.payload.selector.attr).toBe('CLASS:nav-link');
      expect(msg.payload.selector.xpath).toBeUndefined();
      expect(msg.payload.selector.css).toBeUndefined();
    });

    it('should send XPATH selector correctly', async () => {
      const { ctx } = buildContextFromLine('TAG XPATH=//table/tbody/tr[3]/td[2] EXTRACT=TXT');
      await tagHandler(ctx);

      const msg = sentMessages[0] as TagCommandMessage;
      expect(msg.payload.selector.xpath).toBe('//table/tbody/tr[3]/td[2]');
      expect(msg.payload.selector.pos).toBeUndefined();
      expect(msg.payload.selector.type).toBeUndefined();
    });

    it('should send CSS selector correctly', async () => {
      const { ctx } = buildContextFromLine('TAG CSS=table.data>tbody>tr:nth-child(3)>td:nth-child(2) EXTRACT=TXT');
      await tagHandler(ctx);

      const msg = sentMessages[0] as TagCommandMessage;
      expect(msg.payload.selector.css).toBe('table.data>tbody>tr:nth-child(3)>td:nth-child(2)');
      expect(msg.payload.selector.xpath).toBeUndefined();
    });

    it('should handle multiple ATTR with && separator', async () => {
      const { ctx } = buildContextFromLine('TAG POS=1 TYPE=INPUT ATTR=NAME:email&&TYPE:text CONTENT=test@example.com');
      await tagHandler(ctx);

      const msg = sentMessages[0] as TagCommandMessage;
      expect(msg.payload.selector.attr).toBe('NAME:email&&TYPE:text');
    });

    it('should handle wildcard TYPE=*', async () => {
      const { ctx } = buildContextFromLine('TAG POS=1 TYPE=* ATTR=ID:main EXTRACT=TXT');
      await tagHandler(ctx);

      const msg = sentMessages[0] as TagCommandMessage;
      expect(msg.payload.selector.type).toBe('*');
    });

    it('should send FORM parameter in selector', async () => {
      const { ctx } = buildContextFromLine('TAG POS=1 TYPE=INPUT FORM=NAME:loginform ATTR=NAME:user CONTENT=test');
      await tagHandler(ctx);

      const msg = sentMessages[0] as TagCommandMessage;
      expect(msg.payload.selector.form).toBe('NAME:loginform');
      expect(msg.payload.selector.type).toBe('INPUT');
      expect(msg.payload.selector.attr).toBe('NAME:user');
    });

    it('should send FORM parameter with multiple conditions', async () => {
      const { ctx } = buildContextFromLine('TAG POS=1 TYPE=INPUT FORM=ID:mainform&&NAME:login ATTR=NAME:user CONTENT=test');
      await tagHandler(ctx);

      const msg = sentMessages[0] as TagCommandMessage;
      expect(msg.payload.selector.form).toBe('ID:mainform&&NAME:login');
    });

    it('should handle negative POS (last element)', async () => {
      const { ctx } = buildContextFromLine('TAG POS=-1 TYPE=LI EXTRACT=TXT');
      await tagHandler(ctx);

      const msg = sentMessages[0] as TagCommandMessage;
      expect(msg.payload.selector.pos).toBe(-1);
    });
  });

  describe('Error cases', () => {
    it('should fail when no selector is provided (no XPATH, CSS, or TYPE)', async () => {
      const { ctx } = buildContextFromLine('TAG CONTENT=hello');
      const result = await tagHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(result.errorMessage).toContain('TAG command requires XPATH, CSS, or TYPE parameter');
    });

    it('should return element not found error when content script reports failure', async () => {
      setContentScriptSender({
        async sendMessage(): Promise<ContentScriptResponse> {
          return {
            success: false,
            error: 'No matching element found on page',
          };
        },
      });

      const { ctx } = buildContextFromLine('TAG POS=1 TYPE=INPUT ATTR=NAME:nonexistent CONTENT=test');
      const result = await tagHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND);
      expect(result.errorMessage).toBe('No matching element found on page');
    });

    it('should return default element not found error when no error message in response', async () => {
      setContentScriptSender({
        async sendMessage(): Promise<ContentScriptResponse> {
          return { success: false };
        },
      });

      const { ctx } = buildContextFromLine('TAG POS=1 TYPE=INPUT ATTR=NAME:missing CONTENT=x');
      const result = await tagHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND);
      expect(result.errorMessage).toBe('Element not found');
    });

    it('should handle content script sender throwing an error', async () => {
      setContentScriptSender({
        async sendMessage(): Promise<ContentScriptResponse> {
          throw new Error('Connection lost');
        },
      });

      const { ctx } = buildContextFromLine('TAG POS=1 TYPE=INPUT ATTR=NAME:q CONTENT=test');
      const result = await tagHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toContain('Connection lost');
    });

    it('should handle non-Error throw from content script sender', async () => {
      setContentScriptSender({
        async sendMessage(): Promise<ContentScriptResponse> {
          throw 'string error';
        },
      });

      const { ctx } = buildContextFromLine('TAG POS=1 TYPE=INPUT ATTR=NAME:q CONTENT=test');
      const result = await tagHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toContain('string error');
    });
  });

  describe('TAG via MacroExecutor (full pipeline)', () => {
    let executor: MacroExecutor;
    let capturedMessages: InteractionMessage[];

    beforeEach(() => {
      capturedMessages = [];
      executor = createExecutor({ macroName: 'test' });

      // Register the tagHandler with the executor
      executor.registerHandler('TAG', tagHandler);

      // Set up mock sender that captures messages
      setContentScriptSender({
        async sendMessage(message: InteractionMessage): Promise<ContentScriptResponse> {
          capturedMessages.push(message);
          return {
            success: true,
            extractedData: undefined,
          };
        },
      });
    });

    afterEach(() => {
      setContentScriptSender(noopSender);
    });

    it('should execute TAG with CONTENT through full macro pipeline', async () => {
      executor.loadMacro('TAG POS=1 TYPE=INPUT ATTR=NAME:username CONTENT=john');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(capturedMessages).toHaveLength(1);

      const msg = capturedMessages[0] as TagCommandMessage;
      expect(msg.type).toBe('TAG_COMMAND');
      expect(msg.payload.selector.pos).toBe(1);
      expect(msg.payload.selector.type).toBe('INPUT');
      expect(msg.payload.selector.attr).toBe('NAME:username');
      expect(msg.payload.action.content).toBe('john');
    });

    it('should execute TAG with EXTRACT through full macro pipeline', async () => {
      setContentScriptSender({
        async sendMessage(message: InteractionMessage): Promise<ContentScriptResponse> {
          capturedMessages.push(message);
          return {
            success: true,
            extractedData: 'Extracted Text',
          };
        },
      });

      executor.loadMacro('TAG POS=1 TYPE=SPAN ATTR=CLASS:price EXTRACT=TXT');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.extractData).toContain('Extracted Text');
    });

    it('should execute multiple TAG commands in sequence', async () => {
      const macro = [
        'TAG POS=1 TYPE=INPUT ATTR=NAME:username CONTENT=admin',
        'TAG POS=1 TYPE=INPUT ATTR=NAME:password CONTENT=secret',
      ].join('\n');

      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(capturedMessages).toHaveLength(2);

      const msg1 = capturedMessages[0] as TagCommandMessage;
      expect(msg1.payload.selector.attr).toBe('NAME:username');
      expect(msg1.payload.action.content).toBe('admin');

      const msg2 = capturedMessages[1] as TagCommandMessage;
      expect(msg2.payload.selector.attr).toBe('NAME:password');
      expect(msg2.payload.action.content).toBe('secret');
    });

    it('should expand variables in TAG parameters during execution', async () => {
      const macro = [
        'SET !VAR1 myuser',
        'TAG POS=1 TYPE=INPUT ATTR=NAME:q CONTENT={{!VAR1}}',
      ].join('\n');

      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(capturedMessages).toHaveLength(1);

      const msg = capturedMessages[0] as TagCommandMessage;
      expect(msg.payload.action.content).toBe('myuser');
    });

    it('should stop execution on TAG error when ERRORIGNORE is NO', async () => {
      setContentScriptSender({
        async sendMessage(): Promise<ContentScriptResponse> {
          return { success: false, error: 'Element not found' };
        },
      });

      const macro = [
        'TAG POS=1 TYPE=INPUT ATTR=NAME:missing CONTENT=test',
        'TAG POS=1 TYPE=INPUT ATTR=NAME:present CONTENT=ok',
      ].join('\n');

      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND);
      expect(result.errorLine).toBe(1);
    });

    it('should continue execution on TAG error when ERRORIGNORE is YES', async () => {
      let callCount = 0;
      setContentScriptSender({
        async sendMessage(message: InteractionMessage): Promise<ContentScriptResponse> {
          capturedMessages.push(message);
          callCount++;
          if (callCount === 1) {
            return { success: false, error: 'Element not found' };
          }
          return { success: true };
        },
      });

      const macro = [
        'SET !ERRORIGNORE YES',
        'TAG POS=1 TYPE=INPUT ATTR=NAME:missing CONTENT=test',
        'TAG POS=1 TYPE=INPUT ATTR=NAME:present CONTENT=ok',
      ].join('\n');

      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      // Both TAG commands should have been attempted
      expect(capturedMessages).toHaveLength(2);
    });

    it('should execute TAG with XPATH through full pipeline', async () => {
      executor.loadMacro('TAG XPATH=//div[@class="main"]/p[1] EXTRACT=TXT');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = capturedMessages[0] as TagCommandMessage;
      expect(msg.payload.selector.xpath).toBe('//div[@class="main"]/p[1]');
    });

    it('should execute TAG with CSS through full pipeline', async () => {
      executor.loadMacro('TAG CSS=div.main>p:first-child EXTRACT=TXT');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = capturedMessages[0] as TagCommandMessage;
      expect(msg.payload.selector.css).toBe('div.main>p:first-child');
    });

    it('should set waitVisible=true on TAG messages', async () => {
      executor.loadMacro('TAG POS=1 TYPE=INPUT ATTR=NAME:q CONTENT=x');
      await executor.execute();

      const msg = capturedMessages[0] as TagCommandMessage;
      expect(msg.payload.waitVisible).toBe(true);
    });

    it('should generate unique message IDs for each TAG command', async () => {
      const macro = [
        'TAG POS=1 TYPE=INPUT ATTR=NAME:a CONTENT=1',
        'TAG POS=1 TYPE=INPUT ATTR=NAME:b CONTENT=2',
      ].join('\n');

      executor.loadMacro(macro);
      await executor.execute();

      expect(capturedMessages).toHaveLength(2);
      const id1 = capturedMessages[0].id;
      const id2 = capturedMessages[1].id;
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^msg_/);
      expect(id2).toMatch(/^msg_/);
    });
  });
});
