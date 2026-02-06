/**
 * Recording E2E Tests
 *
 * Tests recording clicks, form fills, navigation.
 * Verifies recorded macros play back correctly.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  parseMacro,
  serializeMacro,
  validateCommand,
  type ParsedCommand,
  type ParsedMacro,
} from '../../shared/src/parser';

/**
 * Mock DOM context for recording tests
 */
interface DomContext {
  window: Window & typeof globalThis;
  document: Document;
}

/**
 * Create a mock DOM environment
 */
function createDomContext(html: string): DomContext {
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
 * Recorded event types
 */
type RecordedEventType = 'click' | 'input' | 'change' | 'submit' | 'navigation' | 'select';

/**
 * Recorded event structure
 */
interface RecordedEvent {
  type: RecordedEventType;
  target: {
    tagName: string;
    id?: string;
    name?: string;
    className?: string;
    type?: string;
    value?: string;
    href?: string;
    textContent?: string;
  };
  timestamp: number;
  url?: string;
}

/**
 * Macro Recorder - records DOM events and generates iMacros commands
 */
class MacroRecorder {
  private events: RecordedEvent[] = [];
  private context: DomContext;
  private recording: boolean = false;
  private listeners: Array<{ element: EventTarget; type: string; handler: EventListener }> = [];
  private currentUrl: string;

  constructor(context: DomContext) {
    this.context = context;
    this.currentUrl = context.window.location.href;
  }

  /**
   * Start recording events
   */
  start(): void {
    if (this.recording) return;
    this.recording = true;
    this.events = [];

    // Record initial URL navigation
    this.recordNavigation(this.currentUrl);

    // Attach event listeners
    this.attachListener(this.context.document, 'click', this.handleClick.bind(this));
    this.attachListener(this.context.document, 'input', this.handleInput.bind(this));
    this.attachListener(this.context.document, 'change', this.handleChange.bind(this));
    this.attachListener(this.context.document, 'submit', this.handleSubmit.bind(this));
  }

  /**
   * Stop recording events
   */
  stop(): void {
    if (!this.recording) return;
    this.recording = false;

    // Remove event listeners
    this.listeners.forEach(({ element, type, handler }) => {
      element.removeEventListener(type, handler);
    });
    this.listeners = [];
  }

  /**
   * Get recorded events
   */
  getEvents(): RecordedEvent[] {
    return [...this.events];
  }

  /**
   * Clear recorded events
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Generate iMacros script from recorded events
   */
  generateMacro(): string {
    const lines: string[] = [];

    // Add version header
    lines.push('VERSION BUILD=1000000 RECORDER=FX');
    lines.push('TAB T=1');

    for (const event of this.events) {
      const command = this.eventToCommand(event);
      if (command) {
        lines.push(command);
      }
    }

    return lines.join('\n');
  }

  /**
   * Record a navigation event
   */
  recordNavigation(url: string): void {
    this.events.push({
      type: 'navigation',
      target: { tagName: 'WINDOW' },
      timestamp: Date.now(),
      url,
    });
    this.currentUrl = url;
  }

  /**
   * Attach an event listener and track it for cleanup
   */
  private attachListener(element: EventTarget, type: string, handler: EventListener): void {
    element.addEventListener(type, handler, true);
    this.listeners.push({ element, type, handler });
  }

  /**
   * Handle click events
   */
  private handleClick(e: Event): void {
    const target = e.target as HTMLElement;
    if (!target) return;

    // Skip recording clicks on form inputs (handled by input/change events)
    if (target instanceof this.context.window.HTMLInputElement &&
        ['text', 'password', 'email', 'number', 'tel', 'url', 'search'].includes(target.type)) {
      return;
    }
    if (target instanceof this.context.window.HTMLTextAreaElement) {
      return;
    }

    this.events.push({
      type: 'click',
      target: this.extractTargetInfo(target),
      timestamp: Date.now(),
    });
  }

  /**
   * Handle input events
   */
  private handleInput(e: Event): void {
    const target = e.target as HTMLElement;
    if (!target) return;

    // Only record input events for form elements
    if (!(target instanceof this.context.window.HTMLInputElement) &&
        !(target instanceof this.context.window.HTMLTextAreaElement)) {
      return;
    }

    // We'll record the final value on change event instead
  }

  /**
   * Handle change events (final value)
   */
  private handleChange(e: Event): void {
    const target = e.target as HTMLElement;
    if (!target) return;

    if (target instanceof this.context.window.HTMLInputElement ||
        target instanceof this.context.window.HTMLTextAreaElement) {
      this.events.push({
        type: 'input',
        target: this.extractTargetInfo(target),
        timestamp: Date.now(),
      });
    } else if (target instanceof this.context.window.HTMLSelectElement) {
      this.events.push({
        type: 'select',
        target: this.extractTargetInfo(target),
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle form submit events
   */
  private handleSubmit(e: Event): void {
    const target = e.target as HTMLElement;
    if (!target) return;

    this.events.push({
      type: 'submit',
      target: this.extractTargetInfo(target),
      timestamp: Date.now(),
    });
  }

  /**
   * Extract relevant info from a target element
   */
  private extractTargetInfo(element: HTMLElement): RecordedEvent['target'] {
    const info: RecordedEvent['target'] = {
      tagName: element.tagName,
    };

    if (element.id) info.id = element.id;
    if (element.getAttribute('name')) info.name = element.getAttribute('name') || undefined;
    if (element.className) info.className = element.className;

    if (element instanceof this.context.window.HTMLInputElement) {
      info.type = element.type;
      info.value = element.value;
    } else if (element instanceof this.context.window.HTMLTextAreaElement) {
      info.value = element.value;
    } else if (element instanceof this.context.window.HTMLSelectElement) {
      info.value = element.value;
    } else if (element instanceof this.context.window.HTMLAnchorElement) {
      info.href = element.href;
      info.textContent = element.textContent?.trim();
    } else if (element.textContent) {
      info.textContent = element.textContent.trim().substring(0, 50);
    }

    return info;
  }

  /**
   * Convert a recorded event to an iMacros command
   */
  private eventToCommand(event: RecordedEvent): string | null {
    switch (event.type) {
      case 'navigation':
        return event.url ? `URL GOTO=${event.url}` : null;

      case 'click':
        return this.clickToCommand(event);

      case 'input':
        return this.inputToCommand(event);

      case 'select':
        return this.selectToCommand(event);

      case 'submit':
        // Form submit is usually triggered by clicking a submit button
        return null;

      default:
        return null;
    }
  }

  /**
   * Convert a click event to a TAG/click command
   */
  private clickToCommand(event: RecordedEvent): string {
    const { target } = event;
    const parts: string[] = ['TAG POS=1'];

    // Determine element type
    if (target.tagName === 'A') {
      parts.push('TYPE=A');
      if (target.textContent) {
        parts.push(`ATTR=TXT:${this.escapeAttrValue(target.textContent)}`);
      } else if (target.href) {
        parts.push(`ATTR=HREF:${target.href}`);
      }
    } else if (target.tagName === 'BUTTON') {
      parts.push('TYPE=BUTTON');
      if (target.textContent) {
        parts.push(`ATTR=TXT:${this.escapeAttrValue(target.textContent)}`);
      } else if (target.id) {
        parts.push(`ATTR=ID:${target.id}`);
      }
    } else if (target.tagName === 'INPUT') {
      const inputType = target.type || 'BUTTON';
      parts.push(`TYPE=INPUT:${inputType.toUpperCase()}`);
      if (target.id) {
        parts.push(`ATTR=ID:${target.id}`);
      } else if (target.name) {
        parts.push(`ATTR=NAME:${target.name}`);
      }
      // For checkboxes and radios, add CONTENT
      if (['checkbox', 'radio'].includes(target.type || '')) {
        parts.push('CONTENT=YES');
      }
    } else {
      parts.push(`TYPE=${target.tagName}`);
      if (target.id) {
        parts.push(`ATTR=ID:${target.id}`);
      } else if (target.className) {
        parts.push(`ATTR=CLASS:${target.className.split(' ')[0]}`);
      } else {
        parts.push('ATTR=*');
      }
    }

    return parts.join(' ');
  }

  /**
   * Convert an input event to a TAG command with CONTENT
   */
  private inputToCommand(event: RecordedEvent): string {
    const { target } = event;
    const parts: string[] = ['TAG POS=1'];

    if (target.tagName === 'INPUT') {
      const inputType = target.type || 'TEXT';
      parts.push(`TYPE=INPUT:${inputType.toUpperCase()}`);
    } else if (target.tagName === 'TEXTAREA') {
      parts.push('TYPE=TEXTAREA');
    }

    // Add attribute selector
    if (target.id) {
      parts.push(`ATTR=ID:${target.id}`);
    } else if (target.name) {
      parts.push(`ATTR=NAME:${target.name}`);
    }

    // Add content
    const value = target.value || '';
    if (value.includes(' ') || value.includes('"')) {
      parts.push(`CONTENT="${this.escapeContent(value)}"`);
    } else {
      parts.push(`CONTENT=${value}`);
    }

    return parts.join(' ');
  }

  /**
   * Convert a select event to a TAG command with CONTENT
   */
  private selectToCommand(event: RecordedEvent): string {
    const { target } = event;
    const parts: string[] = ['TAG POS=1', 'TYPE=SELECT'];

    // Add attribute selector
    if (target.id) {
      parts.push(`ATTR=ID:${target.id}`);
    } else if (target.name) {
      parts.push(`ATTR=NAME:${target.name}`);
    }

    // Add content with % prefix for select values
    const value = target.value || '';
    parts.push(`CONTENT=%${value}`);

    return parts.join(' ');
  }

  /**
   * Escape special characters in attribute values
   */
  private escapeAttrValue(value: string): string {
    return value.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * Escape special characters in content values
   */
  private escapeContent(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }
}

/**
 * Macro Player - executes iMacros commands on DOM
 */
class MacroPlayer {
  private context: DomContext;
  private currentUrl: string;
  private navigationHistory: string[] = [];

  constructor(context: DomContext) {
    this.context = context;
    this.currentUrl = context.window.location.href;
  }

  /**
   * Execute a parsed macro
   */
  execute(macro: ParsedMacro): { success: boolean; results: Array<{ line: number; success: boolean; error?: string }> } {
    const results: Array<{ line: number; success: boolean; error?: string }> = [];

    for (const command of macro.commands) {
      try {
        this.executeCommand(command);
        results.push({ line: command.lineNumber, success: true });
      } catch (error) {
        results.push({
          line: command.lineNumber,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { success: results.every(r => r.success), results };
  }

  /**
   * Execute a single command
   */
  private executeCommand(command: ParsedCommand): void {
    switch (command.type) {
      case 'VERSION':
        // Version is metadata, nothing to execute
        break;

      case 'TAB':
        // Tab switching - simulated in single-context test
        break;

      case 'URL':
        this.executeUrl(command);
        break;

      case 'TAG':
        this.executeTag(command);
        break;

      case 'WAIT':
        // Wait is simulated - no real delay in tests
        break;

      default:
        // Other commands are not critical for recording playback
        break;
    }
  }

  /**
   * Execute URL command
   */
  private executeUrl(command: ParsedCommand): void {
    const gotoParam = command.parameters.find(p => p.key.toUpperCase() === 'GOTO');
    if (!gotoParam) {
      throw new Error('URL command requires GOTO parameter');
    }
    this.currentUrl = gotoParam.value;
    this.navigationHistory.push(this.currentUrl);
  }

  /**
   * Execute TAG command
   */
  private executeTag(command: ParsedCommand): void {
    const element = this.findElement(command);
    if (!element) {
      throw new Error(`Element not found for TAG command at line ${command.lineNumber}`);
    }

    const contentParam = command.parameters.find(p => p.key.toUpperCase() === 'CONTENT');
    if (contentParam) {
      this.setElementContent(element, contentParam.value);
    } else {
      // Click action
      this.clickElement(element);
    }
  }

  /**
   * Find an element based on TAG parameters
   */
  private findElement(command: ParsedCommand): Element | null {
    const { document } = this.context;

    // Check for XPATH first
    const xpathParam = command.parameters.find(p => p.key.toUpperCase() === 'XPATH');
    if (xpathParam) {
      const result = document.evaluate(
        xpathParam.value,
        document,
        null,
        9, // XPathResult.FIRST_ORDERED_NODE_TYPE
        null
      );
      return result.singleNodeValue as Element | null;
    }

    // Get TYPE and POS
    const typeParam = command.parameters.find(p => p.key.toUpperCase() === 'TYPE');
    const posParam = command.parameters.find(p => p.key.toUpperCase() === 'POS');
    const attrParam = command.parameters.find(p => p.key.toUpperCase() === 'ATTR');

    if (!typeParam) return null;

    // Parse type (e.g., INPUT:TEXT -> tagName=INPUT, inputType=TEXT)
    const [tagName, inputType] = typeParam.value.split(':');
    const pos = posParam ? parseInt(posParam.value, 10) : 1;

    // Get all elements of the type
    let elements = Array.from(document.querySelectorAll(tagName));

    // Filter by input type if specified
    if (inputType && tagName.toUpperCase() === 'INPUT') {
      elements = elements.filter(el =>
        (el as HTMLInputElement).type.toUpperCase() === inputType.toUpperCase()
      );
    }

    // Filter by attribute if specified
    if (attrParam) {
      const [attrName, attrValue] = attrParam.value.split(':');
      const attrNameLower = attrName.toLowerCase();

      elements = elements.filter(el => {
        if (attrNameLower === 'txt') {
          const text = el.textContent?.trim() || '';
          if (attrValue === '*') return text.length > 0;
          if (attrValue.startsWith('*') && attrValue.endsWith('*')) {
            return text.includes(attrValue.slice(1, -1));
          }
          return text === attrValue;
        }
        const elAttrValue = el.getAttribute(attrNameLower);
        if (attrValue === '*') return elAttrValue !== null;
        return elAttrValue === attrValue;
      });
    }

    // Get element by position (1-indexed)
    if (pos < 1 || pos > elements.length) return null;
    return elements[pos - 1];
  }

  /**
   * Set element content/value
   */
  private setElementContent(element: Element, content: string): void {
    const { window } = this.context;

    // Remove % prefix for select values
    let value = content;
    if (value.startsWith('%')) {
      value = value.substring(1);
    }

    if (element instanceof window.HTMLInputElement) {
      element.value = value;
      element.dispatchEvent(new window.Event('input', { bubbles: true }));
      element.dispatchEvent(new window.Event('change', { bubbles: true }));
    } else if (element instanceof window.HTMLTextAreaElement) {
      element.value = value;
      element.dispatchEvent(new window.Event('input', { bubbles: true }));
      element.dispatchEvent(new window.Event('change', { bubbles: true }));
    } else if (element instanceof window.HTMLSelectElement) {
      element.value = value;
      element.dispatchEvent(new window.Event('change', { bubbles: true }));
    }
  }

  /**
   * Click an element
   */
  private clickElement(element: Element): void {
    const { window } = this.context;
    const clickEvent = new window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(clickEvent);
  }

  /**
   * Get navigation history
   */
  getNavigationHistory(): string[] {
    return [...this.navigationHistory];
  }

  /**
   * Get current URL
   */
  getCurrentUrl(): string {
    return this.currentUrl;
  }
}

// ============================================================
// TESTS
// ============================================================

describe('Recording E2E Tests', () => {
  // ============================================================
  // SECTION: Recording Click Events
  // ============================================================
  describe('Recording Click Events', () => {
    let context: DomContext;
    let recorder: MacroRecorder;

    beforeEach(() => {
      context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <button id="btn1">Click Me</button>
          <button id="btn2" class="primary">Submit</button>
          <a id="link1" href="https://example.com/page1">Link 1</a>
          <a id="link2" href="https://example.com/page2">Link 2</a>
          <div id="clickable">Clickable Div</div>
          <input type="checkbox" id="checkbox1" name="agree" />
          <input type="radio" id="radio1" name="choice" value="option1" />
          <input type="radio" id="radio2" name="choice" value="option2" />
          <input type="submit" id="submitBtn" value="Submit Form" />
        </body>
        </html>
      `);
      recorder = new MacroRecorder(context);
    });

    afterEach(() => {
      recorder.stop();
    });

    it('should record button clicks', () => {
      recorder.start();

      const button = context.document.getElementById('btn1');
      button?.click();

      const events = recorder.getEvents();
      // First event is navigation, second is click
      expect(events.length).toBe(2);
      expect(events[1].type).toBe('click');
      expect(events[1].target.tagName).toBe('BUTTON');
      expect(events[1].target.id).toBe('btn1');
    });

    it('should record link clicks', () => {
      recorder.start();

      const link = context.document.getElementById('link1');
      link?.click();

      const events = recorder.getEvents();
      expect(events[1].type).toBe('click');
      expect(events[1].target.tagName).toBe('A');
      expect(events[1].target.href).toBe('https://example.com/page1');
    });

    it('should record checkbox clicks', () => {
      recorder.start();

      const checkbox = context.document.getElementById('checkbox1');
      checkbox?.click();

      const events = recorder.getEvents();
      expect(events[1].type).toBe('click');
      expect(events[1].target.tagName).toBe('INPUT');
      expect(events[1].target.type).toBe('checkbox');
    });

    it('should record radio button clicks', () => {
      recorder.start();

      const radio = context.document.getElementById('radio1');
      radio?.click();

      const events = recorder.getEvents();
      expect(events[1].type).toBe('click');
      expect(events[1].target.tagName).toBe('INPUT');
      expect(events[1].target.type).toBe('radio');
    });

    it('should record div clicks', () => {
      recorder.start();

      const div = context.document.getElementById('clickable');
      div?.click();

      const events = recorder.getEvents();
      expect(events[1].type).toBe('click');
      expect(events[1].target.tagName).toBe('DIV');
      expect(events[1].target.id).toBe('clickable');
    });

    it('should generate valid TAG commands for clicks', () => {
      recorder.start();

      const button = context.document.getElementById('btn1');
      button?.click();

      const macro = recorder.generateMacro();
      expect(macro).toContain('TAG POS=1 TYPE=BUTTON');
      expect(macro).toContain('ATTR=');

      // Verify macro parses correctly
      const parsed = parseMacro(macro);
      expect(parsed.errors).toHaveLength(0);
    });

    it('should record multiple clicks in sequence', () => {
      recorder.start();

      context.document.getElementById('btn1')?.click();
      context.document.getElementById('btn2')?.click();
      context.document.getElementById('link1')?.click();

      const events = recorder.getEvents();
      // 1 navigation + 3 clicks
      expect(events.length).toBe(4);
      expect(events.filter(e => e.type === 'click').length).toBe(3);
    });
  });

  // ============================================================
  // SECTION: Recording Form Fills
  // ============================================================
  describe('Recording Form Fills', () => {
    let context: DomContext;
    let recorder: MacroRecorder;

    beforeEach(() => {
      context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <form id="testForm">
            <input type="text" id="username" name="username" />
            <input type="password" id="password" name="password" />
            <input type="email" id="email" name="email" />
            <textarea id="comments" name="comments"></textarea>
            <select id="country" name="country">
              <option value="">Select...</option>
              <option value="us">United States</option>
              <option value="uk">United Kingdom</option>
              <option value="ca">Canada</option>
            </select>
            <input type="number" id="age" name="age" />
          </form>
        </body>
        </html>
      `);
      recorder = new MacroRecorder(context);
    });

    afterEach(() => {
      recorder.stop();
    });

    it('should record text input changes', () => {
      recorder.start();

      const input = context.document.getElementById('username') as HTMLInputElement;
      input.value = 'testuser';
      input.dispatchEvent(new context.window.Event('change', { bubbles: true }));

      const events = recorder.getEvents();
      const inputEvent = events.find(e => e.type === 'input');
      expect(inputEvent).toBeDefined();
      expect(inputEvent?.target.tagName).toBe('INPUT');
      expect(inputEvent?.target.value).toBe('testuser');
    });

    it('should record password input changes', () => {
      recorder.start();

      const input = context.document.getElementById('password') as HTMLInputElement;
      input.value = 'secret123';
      input.dispatchEvent(new context.window.Event('change', { bubbles: true }));

      const events = recorder.getEvents();
      const inputEvent = events.find(e => e.type === 'input');
      expect(inputEvent?.target.type).toBe('password');
      expect(inputEvent?.target.value).toBe('secret123');
    });

    it('should record email input changes', () => {
      recorder.start();

      const input = context.document.getElementById('email') as HTMLInputElement;
      input.value = 'test@example.com';
      input.dispatchEvent(new context.window.Event('change', { bubbles: true }));

      const events = recorder.getEvents();
      const inputEvent = events.find(e => e.type === 'input');
      expect(inputEvent?.target.type).toBe('email');
    });

    it('should record textarea changes', () => {
      recorder.start();

      const textarea = context.document.getElementById('comments') as HTMLTextAreaElement;
      textarea.value = 'This is a multiline\ncomment';
      textarea.dispatchEvent(new context.window.Event('change', { bubbles: true }));

      const events = recorder.getEvents();
      const inputEvent = events.find(e => e.type === 'input');
      expect(inputEvent?.target.tagName).toBe('TEXTAREA');
      expect(inputEvent?.target.value).toContain('multiline');
    });

    it('should record select changes', () => {
      recorder.start();

      const select = context.document.getElementById('country') as HTMLSelectElement;
      select.value = 'us';
      select.dispatchEvent(new context.window.Event('change', { bubbles: true }));

      const events = recorder.getEvents();
      const selectEvent = events.find(e => e.type === 'select');
      expect(selectEvent).toBeDefined();
      expect(selectEvent?.target.tagName).toBe('SELECT');
      expect(selectEvent?.target.value).toBe('us');
    });

    it('should generate valid TAG commands with CONTENT for inputs', () => {
      recorder.start();

      const input = context.document.getElementById('username') as HTMLInputElement;
      input.value = 'testuser';
      input.dispatchEvent(new context.window.Event('change', { bubbles: true }));

      const macro = recorder.generateMacro();
      expect(macro).toContain('TAG POS=1 TYPE=INPUT:TEXT');
      expect(macro).toContain('CONTENT=testuser');

      const parsed = parseMacro(macro);
      expect(parsed.errors).toHaveLength(0);
    });

    it('should generate valid TAG commands with CONTENT for selects', () => {
      recorder.start();

      const select = context.document.getElementById('country') as HTMLSelectElement;
      select.value = 'uk';
      select.dispatchEvent(new context.window.Event('change', { bubbles: true }));

      const macro = recorder.generateMacro();
      expect(macro).toContain('TAG POS=1 TYPE=SELECT');
      expect(macro).toContain('CONTENT=%uk');

      const parsed = parseMacro(macro);
      expect(parsed.errors).toHaveLength(0);
    });

    it('should handle content with spaces', () => {
      recorder.start();

      const input = context.document.getElementById('username') as HTMLInputElement;
      input.value = 'John Doe';
      input.dispatchEvent(new context.window.Event('change', { bubbles: true }));

      const macro = recorder.generateMacro();
      expect(macro).toContain('CONTENT="John Doe"');
    });

    it('should record multiple form fields', () => {
      recorder.start();

      const username = context.document.getElementById('username') as HTMLInputElement;
      username.value = 'testuser';
      username.dispatchEvent(new context.window.Event('change', { bubbles: true }));

      const password = context.document.getElementById('password') as HTMLInputElement;
      password.value = 'secret';
      password.dispatchEvent(new context.window.Event('change', { bubbles: true }));

      const country = context.document.getElementById('country') as HTMLSelectElement;
      country.value = 'ca';
      country.dispatchEvent(new context.window.Event('change', { bubbles: true }));

      const events = recorder.getEvents();
      expect(events.filter(e => e.type === 'input').length).toBe(2);
      expect(events.filter(e => e.type === 'select').length).toBe(1);
    });
  });

  // ============================================================
  // SECTION: Recording Navigation
  // ============================================================
  describe('Recording Navigation', () => {
    let context: DomContext;
    let recorder: MacroRecorder;

    beforeEach(() => {
      context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <a id="link1" href="https://example.com/page1">Page 1</a>
          <a id="link2" href="https://example.com/page2">Page 2</a>
        </body>
        </html>
      `);
      recorder = new MacroRecorder(context);
    });

    afterEach(() => {
      recorder.stop();
    });

    it('should record initial URL on start', () => {
      recorder.start();

      const events = recorder.getEvents();
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].type).toBe('navigation');
      expect(events[0].url).toBe('https://example.com/');
    });

    it('should generate URL GOTO command', () => {
      recorder.start();

      const macro = recorder.generateMacro();
      expect(macro).toContain('URL GOTO=https://example.com/');

      const parsed = parseMacro(macro);
      expect(parsed.errors).toHaveLength(0);
    });

    it('should record navigation via recordNavigation method', () => {
      recorder.start();
      recorder.recordNavigation('https://example.com/newpage');

      const events = recorder.getEvents();
      const navEvents = events.filter(e => e.type === 'navigation');
      expect(navEvents.length).toBe(2);
      expect(navEvents[1].url).toBe('https://example.com/newpage');
    });

    it('should generate multiple URL commands for multiple navigations', () => {
      recorder.start();
      recorder.recordNavigation('https://example.com/page1');
      recorder.recordNavigation('https://example.com/page2');

      const macro = recorder.generateMacro();
      expect(macro).toContain('URL GOTO=https://example.com/');
      expect(macro).toContain('URL GOTO=https://example.com/page1');
      expect(macro).toContain('URL GOTO=https://example.com/page2');
    });

    it('should record link clicks that would navigate', () => {
      recorder.start();

      const link = context.document.getElementById('link1');
      link?.click();

      const events = recorder.getEvents();
      const clickEvent = events.find(e => e.type === 'click' && e.target.tagName === 'A');
      expect(clickEvent).toBeDefined();
      expect(clickEvent?.target.href).toBe('https://example.com/page1');
    });
  });

  // ============================================================
  // SECTION: Macro Validation
  // ============================================================
  describe('Macro Validation', () => {
    let context: DomContext;
    let recorder: MacroRecorder;

    beforeEach(() => {
      context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <form id="form1">
            <input type="text" id="name" name="name" />
            <select id="size" name="size">
              <option value="s">Small</option>
              <option value="m">Medium</option>
              <option value="l">Large</option>
            </select>
            <button type="submit" id="submitBtn">Submit</button>
          </form>
        </body>
        </html>
      `);
      recorder = new MacroRecorder(context);
    });

    afterEach(() => {
      recorder.stop();
    });

    it('should generate macro with VERSION header', () => {
      recorder.start();

      const macro = recorder.generateMacro();
      expect(macro.startsWith('VERSION BUILD=')).toBe(true);
    });

    it('should generate macro with TAB command', () => {
      recorder.start();

      const macro = recorder.generateMacro();
      expect(macro).toContain('TAB T=1');
    });

    it('should generate parseable macro with no validation errors', () => {
      recorder.start();

      // Simulate user actions
      const input = context.document.getElementById('name') as HTMLInputElement;
      input.value = 'Test User';
      input.dispatchEvent(new context.window.Event('change', { bubbles: true }));

      const select = context.document.getElementById('size') as HTMLSelectElement;
      select.value = 'm';
      select.dispatchEvent(new context.window.Event('change', { bubbles: true }));

      const button = context.document.getElementById('submitBtn');
      button?.click();

      const macro = recorder.generateMacro();
      const parsed = parseMacro(macro);

      expect(parsed.errors).toHaveLength(0);
      expect(parsed.commands.length).toBeGreaterThan(0);
    });

    it('should generate valid iMacros syntax for all recorded events', () => {
      recorder.start();

      // Record various actions
      const input = context.document.getElementById('name') as HTMLInputElement;
      input.value = 'John';
      input.dispatchEvent(new context.window.Event('change', { bubbles: true }));

      const macro = recorder.generateMacro();
      const parsed = parseMacro(macro);

      // Validate each command individually
      for (const command of parsed.commands) {
        const error = validateCommand(command);
        // URL and TAG commands should pass validation
        if (command.type === 'URL' || command.type === 'TAG') {
          expect(error).toBeNull();
        }
      }
    });

    it('should preserve proper command order', () => {
      recorder.start();

      const input = context.document.getElementById('name') as HTMLInputElement;
      input.value = 'User';
      input.dispatchEvent(new context.window.Event('change', { bubbles: true }));

      const button = context.document.getElementById('submitBtn');
      button?.click();

      const macro = recorder.generateMacro();
      const parsed = parseMacro(macro);

      // Find indices of different command types
      const versionIndex = parsed.commands.findIndex(c => c.type === 'VERSION');
      const tabIndex = parsed.commands.findIndex(c => c.type === 'TAB');
      const urlIndex = parsed.commands.findIndex(c => c.type === 'URL');

      // VERSION should come first
      expect(versionIndex).toBe(0);
      // TAB should come after VERSION
      expect(tabIndex).toBeGreaterThan(versionIndex);
      // URL should come after TAB
      expect(urlIndex).toBeGreaterThan(tabIndex);
    });
  });

  // ============================================================
  // SECTION: Playback Tests
  // ============================================================
  describe('Playback Tests', () => {
    it('should play back recorded navigation', () => {
      const context = createDomContext(`
        <!DOCTYPE html>
        <html><body></body></html>
      `);

      const macro = `
VERSION BUILD=1000000
TAB T=1
URL GOTO=https://example.com/page1
URL GOTO=https://example.com/page2
`;

      const parsed = parseMacro(macro);
      const player = new MacroPlayer(context);
      const result = player.execute(parsed);

      expect(result.success).toBe(true);
      expect(player.getCurrentUrl()).toBe('https://example.com/page2');
      expect(player.getNavigationHistory()).toContain('https://example.com/page1');
      expect(player.getNavigationHistory()).toContain('https://example.com/page2');
    });

    it('should play back recorded form fills', () => {
      const context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <input type="text" id="username" name="username" />
          <input type="password" id="password" name="password" />
        </body>
        </html>
      `);

      const macro = `
VERSION BUILD=1000000
TAB T=1
URL GOTO=https://example.com/form
TAG POS=1 TYPE=INPUT:TEXT ATTR=ID:username CONTENT=testuser
TAG POS=1 TYPE=INPUT:PASSWORD ATTR=ID:password CONTENT=secret123
`;

      const parsed = parseMacro(macro);
      const player = new MacroPlayer(context);
      const result = player.execute(parsed);

      expect(result.success).toBe(true);

      const usernameInput = context.document.getElementById('username') as HTMLInputElement;
      const passwordInput = context.document.getElementById('password') as HTMLInputElement;

      expect(usernameInput.value).toBe('testuser');
      expect(passwordInput.value).toBe('secret123');
    });

    it('should play back recorded clicks', () => {
      const context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <button id="btn1">Click Me</button>
        </body>
        </html>
      `);

      let clicked = false;
      const button = context.document.getElementById('btn1');
      button?.addEventListener('click', () => { clicked = true; });

      const macro = `
VERSION BUILD=1000000
TAB T=1
TAG POS=1 TYPE=BUTTON ATTR=ID:btn1
`;

      const parsed = parseMacro(macro);
      const player = new MacroPlayer(context);
      const result = player.execute(parsed);

      expect(result.success).toBe(true);
      expect(clicked).toBe(true);
    });

    it('should play back recorded select changes', () => {
      const context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <select id="country" name="country">
            <option value="">Select...</option>
            <option value="us">United States</option>
            <option value="uk">United Kingdom</option>
          </select>
        </body>
        </html>
      `);

      const macro = `
VERSION BUILD=1000000
TAB T=1
TAG POS=1 TYPE=SELECT ATTR=ID:country CONTENT=%uk
`;

      const parsed = parseMacro(macro);
      const player = new MacroPlayer(context);
      const result = player.execute(parsed);

      expect(result.success).toBe(true);

      const select = context.document.getElementById('country') as HTMLSelectElement;
      expect(select.value).toBe('uk');
    });

    it('should report errors for missing elements during playback', () => {
      const context = createDomContext(`
        <!DOCTYPE html>
        <html><body></body></html>
      `);

      const macro = `
VERSION BUILD=1000000
TAG POS=1 TYPE=INPUT:TEXT ATTR=ID:nonexistent CONTENT=value
`;

      const parsed = parseMacro(macro);
      const player = new MacroPlayer(context);
      const result = player.execute(parsed);

      expect(result.success).toBe(false);
      expect(result.results.some(r => r.error?.includes('Element not found'))).toBe(true);
    });
  });

  // ============================================================
  // SECTION: Record and Playback Integration
  // ============================================================
  describe('Record and Playback Integration', () => {
    it('should record and playback form submission', () => {
      // Create recording context
      const recordContext = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <form id="loginForm">
            <input type="text" id="username" name="username" />
            <input type="password" id="password" name="password" />
            <button type="submit" id="loginBtn">Login</button>
          </form>
        </body>
        </html>
      `);

      // Record actions
      const recorder = new MacroRecorder(recordContext);
      recorder.start();

      // Fill form
      const usernameInput = recordContext.document.getElementById('username') as HTMLInputElement;
      usernameInput.value = 'admin';
      usernameInput.dispatchEvent(new recordContext.window.Event('change', { bubbles: true }));

      const passwordInput = recordContext.document.getElementById('password') as HTMLInputElement;
      passwordInput.value = 'password123';
      passwordInput.dispatchEvent(new recordContext.window.Event('change', { bubbles: true }));

      const loginBtn = recordContext.document.getElementById('loginBtn');
      loginBtn?.click();

      recorder.stop();

      // Generate macro
      const macro = recorder.generateMacro();

      // Create playback context (fresh DOM)
      const playContext = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <form id="loginForm">
            <input type="text" id="username" name="username" />
            <input type="password" id="password" name="password" />
            <button type="submit" id="loginBtn">Login</button>
          </form>
        </body>
        </html>
      `);

      // Play back the macro
      const parsed = parseMacro(macro);
      const player = new MacroPlayer(playContext);
      const result = player.execute(parsed);

      expect(result.success).toBe(true);

      // Verify the form was filled
      const playedUsername = playContext.document.getElementById('username') as HTMLInputElement;
      const playedPassword = playContext.document.getElementById('password') as HTMLInputElement;

      expect(playedUsername.value).toBe('admin');
      expect(playedPassword.value).toBe('password123');
    });

    it('should record and playback multiple interactions', () => {
      // Create recording context
      const recordContext = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <input type="text" id="search" />
          <button id="searchBtn">Search</button>
          <select id="filter">
            <option value="all">All</option>
            <option value="recent">Recent</option>
          </select>
        </body>
        </html>
      `);

      const recorder = new MacroRecorder(recordContext);
      recorder.start();

      // Perform multiple interactions
      const searchInput = recordContext.document.getElementById('search') as HTMLInputElement;
      searchInput.value = 'test query';
      searchInput.dispatchEvent(new recordContext.window.Event('change', { bubbles: true }));

      const filterSelect = recordContext.document.getElementById('filter') as HTMLSelectElement;
      filterSelect.value = 'recent';
      filterSelect.dispatchEvent(new recordContext.window.Event('change', { bubbles: true }));

      const searchBtn = recordContext.document.getElementById('searchBtn');
      searchBtn?.click();

      recorder.stop();

      const macro = recorder.generateMacro();
      const parsed = parseMacro(macro);

      // Verify macro is valid
      expect(parsed.errors).toHaveLength(0);

      // Count recorded commands (excluding VERSION, TAB, URL)
      const actionCommands = parsed.commands.filter(c =>
        c.type === 'TAG'
      );
      expect(actionCommands.length).toBeGreaterThanOrEqual(2); // At least input + select or click

      // Playback
      const playContext = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <input type="text" id="search" />
          <button id="searchBtn">Search</button>
          <select id="filter">
            <option value="all">All</option>
            <option value="recent">Recent</option>
          </select>
        </body>
        </html>
      `);

      const player = new MacroPlayer(playContext);
      const result = player.execute(parsed);

      expect(result.success).toBe(true);

      const playedSearch = playContext.document.getElementById('search') as HTMLInputElement;
      const playedFilter = playContext.document.getElementById('filter') as HTMLSelectElement;

      expect(playedSearch.value).toBe('test query');
      expect(playedFilter.value).toBe('recent');
    });

    it('should generate idempotent macros (same output for same actions)', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <body>
          <input type="text" id="field1" />
        </body>
        </html>
      `;

      // First recording
      const context1 = createDomContext(html);
      const recorder1 = new MacroRecorder(context1);
      recorder1.start();

      const input1 = context1.document.getElementById('field1') as HTMLInputElement;
      input1.value = 'test';
      input1.dispatchEvent(new context1.window.Event('change', { bubbles: true }));

      recorder1.stop();
      const macro1 = recorder1.generateMacro();

      // Second recording (same actions)
      const context2 = createDomContext(html);
      const recorder2 = new MacroRecorder(context2);
      recorder2.start();

      const input2 = context2.document.getElementById('field1') as HTMLInputElement;
      input2.value = 'test';
      input2.dispatchEvent(new context2.window.Event('change', { bubbles: true }));

      recorder2.stop();
      const macro2 = recorder2.generateMacro();

      // Compare structure (excluding timestamps)
      const parsed1 = parseMacro(macro1);
      const parsed2 = parseMacro(macro2);

      expect(parsed1.commands.length).toBe(parsed2.commands.length);

      // Compare command types and key parameters
      for (let i = 0; i < parsed1.commands.length; i++) {
        expect(parsed1.commands[i].type).toBe(parsed2.commands[i].type);
        expect(parsed1.commands[i].parameters.length).toBe(parsed2.commands[i].parameters.length);
      }
    });
  });

  // ============================================================
  // SECTION: Edge Cases
  // ============================================================
  describe('Edge Cases', () => {
    it('should handle special characters in input values', () => {
      const context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <input type="text" id="special" />
        </body>
        </html>
      `);

      const recorder = new MacroRecorder(context);
      recorder.start();

      const input = context.document.getElementById('special') as HTMLInputElement;
      input.value = 'Test "quoted" value & <special>';
      input.dispatchEvent(new context.window.Event('change', { bubbles: true }));

      recorder.stop();

      const macro = recorder.generateMacro();
      const parsed = parseMacro(macro);

      expect(parsed.errors).toHaveLength(0);
    });

    it('should handle rapid sequential events', () => {
      const context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <button id="btn">Click</button>
        </body>
        </html>
      `);

      const recorder = new MacroRecorder(context);
      recorder.start();

      const button = context.document.getElementById('btn');
      // Rapid clicks
      for (let i = 0; i < 5; i++) {
        button?.click();
      }

      recorder.stop();

      const events = recorder.getEvents();
      // Should record all clicks
      expect(events.filter(e => e.type === 'click').length).toBe(5);
    });

    it('should clear events between recordings', () => {
      const context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <button id="btn">Click</button>
        </body>
        </html>
      `);

      const recorder = new MacroRecorder(context);

      // First recording
      recorder.start();
      context.document.getElementById('btn')?.click();
      recorder.stop();

      const events1 = recorder.getEvents();
      expect(events1.length).toBeGreaterThan(0);

      // Clear events
      recorder.clear();
      expect(recorder.getEvents().length).toBe(0);

      // Use a fresh recorder for second recording to avoid listener accumulation
      const recorder2 = new MacroRecorder(context);
      recorder2.start();
      context.document.getElementById('btn')?.click();
      recorder2.stop();

      const events2 = recorder2.getEvents();
      // Should have same structure of events (navigation + click)
      expect(events2.filter(e => e.type === 'navigation').length).toBe(1);
      expect(events2.filter(e => e.type === 'click').length).toBe(1);
    });

    it('should not record events when not recording', () => {
      const context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <button id="btn">Click</button>
        </body>
        </html>
      `);

      const recorder = new MacroRecorder(context);

      // Click without starting recording
      context.document.getElementById('btn')?.click();

      const events = recorder.getEvents();
      expect(events.length).toBe(0);
    });

    it('should handle elements without id or name', () => {
      const context = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <button class="primary-btn">Click Me</button>
        </body>
        </html>
      `);

      const recorder = new MacroRecorder(context);
      recorder.start();

      const button = context.document.querySelector('.primary-btn');
      (button as HTMLElement)?.click();

      recorder.stop();

      const macro = recorder.generateMacro();
      const parsed = parseMacro(macro);

      expect(parsed.errors).toHaveLength(0);
      // Should use class or text as attribute
      expect(macro).toMatch(/ATTR=(CLASS|TXT):/);
    });
  });
});
