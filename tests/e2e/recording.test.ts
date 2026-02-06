/**
 * Recording E2E Tests
 *
 * Tests the REAL MacroRecorder from extension/src/content/macro-recorder.ts.
 * Verifies that recording clicks, form fills, navigation, and form changes
 * produces valid iMacros commands that are parseable and playable.
 *
 * Uses JSDOM to simulate a browser DOM environment.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  parseMacro,
  validateCommand,
  type ParsedCommand,
  type ParsedMacro,
} from '../../shared/src/parser';

// ===== JSDOM Environment Setup =====

/**
 * DOM context holding the JSDOM window and document references
 */
interface DomContext {
  dom: JSDOM;
  window: Window & typeof globalThis;
  document: Document;
  cleanup: () => void;
}

/**
 * Set up global browser-like environment for the real MacroRecorder.
 * The recorder uses `document`, `window`, and `chrome` globals.
 */
function installGlobals(ctx: DomContext): void {
  // Install standard DOM globals
  (globalThis as any).window = ctx.window;
  (globalThis as any).document = ctx.document;
  (globalThis as any).HTMLElement = ctx.window.HTMLElement;
  (globalThis as any).HTMLInputElement = ctx.window.HTMLInputElement;
  (globalThis as any).HTMLTextAreaElement = ctx.window.HTMLTextAreaElement;
  (globalThis as any).HTMLSelectElement = ctx.window.HTMLSelectElement;
  (globalThis as any).HTMLAnchorElement = ctx.window.HTMLAnchorElement;
  (globalThis as any).HTMLButtonElement = ctx.window.HTMLButtonElement;
  (globalThis as any).HTMLFormElement = ctx.window.HTMLFormElement;
  (globalThis as any).Element = ctx.window.Element;
  (globalThis as any).Node = ctx.window.Node;
  (globalThis as any).MouseEvent = ctx.window.MouseEvent;
  (globalThis as any).Event = ctx.window.Event;
  (globalThis as any).XPathResult = (ctx.window as any).XPathResult;

  // Mock chrome.runtime for sendMessage calls
  (globalThis as any).chrome = {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue({}),
      onMessage: {
        addListener: vi.fn(),
      },
    },
  };
}

function removeGlobals(): void {
  delete (globalThis as any).window;
  delete (globalThis as any).document;
  delete (globalThis as any).HTMLElement;
  delete (globalThis as any).HTMLInputElement;
  delete (globalThis as any).HTMLTextAreaElement;
  delete (globalThis as any).HTMLSelectElement;
  delete (globalThis as any).HTMLAnchorElement;
  delete (globalThis as any).HTMLButtonElement;
  delete (globalThis as any).HTMLFormElement;
  delete (globalThis as any).Element;
  delete (globalThis as any).Node;
  delete (globalThis as any).MouseEvent;
  delete (globalThis as any).Event;
  delete (globalThis as any).XPathResult;
  delete (globalThis as any).chrome;
}

/**
 * Create a JSDOM context for testing. Installs globals so the real
 * MacroRecorder can access document/window.
 */
function createDomContext(html: string): DomContext {
  const dom = new JSDOM(html, {
    url: 'https://example.com',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });

  const ctx: DomContext = {
    dom,
    window: dom.window as unknown as Window & typeof globalThis,
    document: dom.window.document,
    cleanup: () => {
      removeGlobals();
      dom.window.close();
    },
  };

  installGlobals(ctx);
  return ctx;
}

// ===== Macro Player =====

/**
 * Simplified macro player that executes recorded macros against a JSDOM document.
 * Handles the real MacroRecorder's command format (ATTR:NAME=value).
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
   * Execute a parsed macro and return results for each command
   */
  execute(macro: ParsedMacro): {
    success: boolean;
    results: Array<{ line: number; success: boolean; error?: string }>;
  } {
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

    return { success: results.every((r) => r.success), results };
  }

  private executeCommand(command: ParsedCommand): void {
    switch (command.type) {
      case 'VERSION':
      case 'TAB':
      case 'WAIT':
        // Metadata or simulated commands
        break;
      case 'URL':
        this.executeUrl(command);
        break;
      case 'TAG':
        this.executeTag(command);
        break;
      default:
        break;
    }
  }

  private executeUrl(command: ParsedCommand): void {
    const gotoParam = command.parameters.find(
      (p) => p.key.toUpperCase() === 'GOTO'
    );
    if (!gotoParam) {
      throw new Error('URL command requires GOTO parameter');
    }
    this.currentUrl = gotoParam.value;
    this.navigationHistory.push(this.currentUrl);
  }

  /**
   * Execute TAG command.
   * Supports both formats:
   *   - ATTR=ID:value  (legacy local recorder format)
   *   - ATTR:ID=value  (real MacroRecorder format)
   */
  private executeTag(command: ParsedCommand): void {
    const element = this.findElement(command);
    if (!element) {
      throw new Error(
        `Element not found for TAG command at line ${command.lineNumber}`
      );
    }

    const contentParam = command.parameters.find(
      (p) => p.key.toUpperCase() === 'CONTENT'
    );
    if (contentParam) {
      this.setElementContent(element, contentParam.value);
    } else {
      this.clickElement(element);
    }
  }

  private findElement(command: ParsedCommand): Element | null {
    const { document } = this.context;

    // Get TYPE and POS
    const typeParam = command.parameters.find(
      (p) => p.key.toUpperCase() === 'TYPE'
    );
    const posParam = command.parameters.find(
      (p) => p.key.toUpperCase() === 'POS'
    );

    // Collect ATTR constraints from both formats
    const attrConstraints: Array<{ attrKey: string; attrVal: string }> = [];

    for (const param of command.parameters) {
      const upperKey = param.key.toUpperCase();

      // Format 1: ATTR:NAME=value (real recorder)
      if (upperKey.startsWith('ATTR:')) {
        const attrKey = upperKey.substring(5);
        attrConstraints.push({ attrKey, attrVal: param.value });
      }
      // Format 2: ATTR=NAME:value (legacy)
      else if (upperKey === 'ATTR' && param.value.includes(':')) {
        const colonIdx = param.value.indexOf(':');
        const attrKey = param.value.substring(0, colonIdx).toUpperCase();
        const attrVal = param.value.substring(colonIdx + 1);
        attrConstraints.push({ attrKey, attrVal });
      }
    }

    if (!typeParam) return null;

    // Parse type (e.g., INPUT:TEXT -> tagName=INPUT, inputType=TEXT)
    const [tagName, inputType] = typeParam.value.split(':');
    const pos = posParam ? parseInt(posParam.value, 10) : 1;

    // Get all elements of the type
    let elements = Array.from(document.querySelectorAll(tagName));

    // Filter by input type if specified
    if (inputType && tagName.toUpperCase() === 'INPUT') {
      elements = elements.filter(
        (el) =>
          (el as HTMLInputElement).type.toUpperCase() ===
          inputType.toUpperCase()
      );
    }

    // Filter by attribute constraints
    for (const { attrKey, attrVal } of attrConstraints) {
      elements = elements.filter((el) => {
        if (attrKey === 'TXT') {
          const text = el.textContent?.trim() || '';
          if (attrVal === '*') return text.length > 0;
          return text === attrVal;
        }
        if (attrKey === 'ID') {
          return attrVal === '*' ? el.id !== '' : el.id === attrVal;
        }
        if (attrKey === 'NAME') {
          return (
            attrVal === '*'
              ? el.getAttribute('name') !== null
              : el.getAttribute('name') === attrVal
          );
        }
        if (attrKey === 'CLASS') {
          const cls = el.className || '';
          return attrVal === '*' ? cls !== '' : cls.includes(attrVal);
        }
        if (attrKey === 'HREF') {
          return (
            attrVal === '*'
              ? el.getAttribute('href') !== null
              : el.getAttribute('href') === attrVal
          );
        }
        const val = el.getAttribute(attrKey.toLowerCase());
        return attrVal === '*' ? val !== null : val === attrVal;
      });
    }

    // Get element by position (1-indexed)
    if (pos < 1 || pos > elements.length) return null;
    return elements[pos - 1];
  }

  private setElementContent(element: Element, content: string): void {
    const { window } = this.context;

    // Remove % prefix for select values
    let value = content;
    if (value.startsWith('%')) {
      value = value.substring(1);
    }
    // Remove surrounding quotes if present
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\"/g, '"');
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

  private clickElement(element: Element): void {
    const { window } = this.context;
    const clickEvent = new window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(clickEvent);
  }

  getNavigationHistory(): string[] {
    return [...this.navigationHistory];
  }

  getCurrentUrl(): string {
    return this.currentUrl;
  }
}

// ===== Helper: dynamic import of real MacroRecorder =====

/**
 * We dynamically import the MacroRecorder after setting up JSDOM globals
 * so that module-level references to `document`/`window` resolve correctly.
 */
async function importMacroRecorder() {
  // Clear module cache so fresh imports pick up our globals
  const mod = await import(
    '../../extension/src/content/macro-recorder'
  );
  return mod;
}

// ============================================================
// TESTS
// ============================================================

describe('Recording E2E Tests (Real MacroRecorder)', () => {
  // ============================================================
  // SECTION: Recording Click Events
  // ============================================================
  describe('Recording Click Events', () => {
    let ctx: DomContext;

    beforeEach(() => {
      ctx = createDomContext(`
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
    });

    afterEach(() => {
      ctx.cleanup();
    });

    it('should record button clicks via real MacroRecorder', async () => {
      const { MacroRecorder } = await importMacroRecorder();
      const recorder = new MacroRecorder();
      recorder.start();

      const button = ctx.document.getElementById('btn1')!;
      button.dispatchEvent(
        new ctx.window.MouseEvent('click', { bubbles: true })
      );

      const events = recorder.getEvents();
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].type).toBe('click');
      expect(events[0].command).toContain('TAG');
      expect(events[0].command).toContain('TYPE=BUTTON');

      recorder.stop();
    });

    it('should record link clicks', async () => {
      const { MacroRecorder } = await importMacroRecorder();
      const recorder = new MacroRecorder();
      recorder.start();

      const link = ctx.document.getElementById('link1')!;
      link.dispatchEvent(
        new ctx.window.MouseEvent('click', { bubbles: true })
      );

      const events = recorder.getEvents();
      expect(events.length).toBeGreaterThanOrEqual(1);

      const clickEvent = events.find((e) => e.type === 'click');
      expect(clickEvent).toBeDefined();
      expect(clickEvent!.command).toContain('TYPE=A');

      recorder.stop();
    });

    it('should record checkbox clicks', async () => {
      const { MacroRecorder } = await importMacroRecorder();
      const recorder = new MacroRecorder();
      recorder.start();

      const checkbox = ctx.document.getElementById('checkbox1')!;
      checkbox.dispatchEvent(
        new ctx.window.MouseEvent('click', { bubbles: true })
      );

      const events = recorder.getEvents();
      expect(events.length).toBeGreaterThanOrEqual(1);

      const clickEvent = events.find((e) => e.type === 'click');
      expect(clickEvent).toBeDefined();
      expect(clickEvent!.command).toContain('INPUT:CHECKBOX');

      recorder.stop();
    });

    it('should record radio button clicks', async () => {
      const { MacroRecorder } = await importMacroRecorder();
      const recorder = new MacroRecorder();
      recorder.start();

      const radio = ctx.document.getElementById('radio1')!;
      radio.dispatchEvent(
        new ctx.window.MouseEvent('click', { bubbles: true })
      );

      const events = recorder.getEvents();
      const clickEvent = events.find((e) => e.type === 'click');
      expect(clickEvent).toBeDefined();
      expect(clickEvent!.command).toContain('INPUT:RADIO');

      recorder.stop();
    });

    it('should skip text input clicks (handled by change events)', async () => {
      const { MacroRecorder } = await importMacroRecorder();
      const recorder = new MacroRecorder();
      recorder.start();

      // Create a text input and click it -- should be skipped
      const textInput = ctx.document.createElement('input');
      textInput.type = 'text';
      textInput.id = 'textfield';
      ctx.document.body.appendChild(textInput);

      textInput.dispatchEvent(
        new ctx.window.MouseEvent('click', { bubbles: true })
      );

      const events = recorder.getEvents();
      const clickOnText = events.find(
        (e) => e.type === 'click' && e.metadata?.tagName === 'INPUT'
      );
      // Text input clicks should be filtered out
      expect(clickOnText).toBeUndefined();

      recorder.stop();
    });

    it('should generate parseable TAG commands for button clicks', async () => {
      const { MacroRecorder } = await importMacroRecorder();
      const recorder = new MacroRecorder();
      recorder.start();

      ctx.document.getElementById('btn1')!.dispatchEvent(
        new ctx.window.MouseEvent('click', { bubbles: true })
      );

      const macro = recorder.generateMacro();
      const parsed = parseMacro(macro);

      // All TAG commands should be valid
      const tagCommands = parsed.commands.filter((c) => c.type === 'TAG');
      expect(tagCommands.length).toBeGreaterThanOrEqual(1);
      for (const cmd of tagCommands) {
        const error = validateCommand(cmd);
        expect(error).toBeNull();
      }

      recorder.stop();
    });

    it('should record multiple clicks in sequence', async () => {
      const { MacroRecorder } = await importMacroRecorder();
      const recorder = new MacroRecorder();
      recorder.start();

      ctx.document.getElementById('btn1')!.dispatchEvent(
        new ctx.window.MouseEvent('click', { bubbles: true })
      );
      ctx.document.getElementById('btn2')!.dispatchEvent(
        new ctx.window.MouseEvent('click', { bubbles: true })
      );
      ctx.document.getElementById('link1')!.dispatchEvent(
        new ctx.window.MouseEvent('click', { bubbles: true })
      );

      const events = recorder.getEvents();
      expect(events.filter((e) => e.type === 'click').length).toBe(3);

      recorder.stop();
    });
  });

  // ============================================================
  // SECTION: Recording Form Fills (change events)
  // ============================================================
  describe('Recording Form Fills', () => {
    let ctx: DomContext;

    beforeEach(() => {
      ctx = createDomContext(`
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
    });

    afterEach(() => {
      ctx.cleanup();
    });

    it('should record text input changes', async () => {
      const { MacroRecorder } = await importMacroRecorder();
      const recorder = new MacroRecorder();
      recorder.start();

      const input = ctx.document.getElementById('username') as HTMLInputElement;
      input.value = 'testuser';
      input.dispatchEvent(new ctx.window.Event('change', { bubbles: true }));

      const events = recorder.getEvents();
      const changeEvent = events.find((e) => e.type === 'change');
      expect(changeEvent).toBeDefined();
      expect(changeEvent!.command).toContain('CONTENT=testuser');
      expect(changeEvent!.command).toContain('TYPE=INPUT:TEXT');

      recorder.stop();
    });

    it('should record password input changes', async () => {
      const { MacroRecorder } = await importMacroRecorder();
      const recorder = new MacroRecorder();
      recorder.start();

      const input = ctx.document.getElementById('password') as HTMLInputElement;
      input.value = 'secret123';
      input.dispatchEvent(new ctx.window.Event('change', { bubbles: true }));

      const events = recorder.getEvents();
      const changeEvent = events.find((e) => e.type === 'change');
      expect(changeEvent).toBeDefined();
      expect(changeEvent!.command).toContain('TYPE=INPUT:PASSWORD');
      expect(changeEvent!.command).toContain('CONTENT=secret123');

      recorder.stop();
    });

    it('should record email input changes', async () => {
      const { MacroRecorder } = await importMacroRecorder();
      const recorder = new MacroRecorder();
      recorder.start();

      const input = ctx.document.getElementById('email') as HTMLInputElement;
      input.value = 'test@example.com';
      input.dispatchEvent(new ctx.window.Event('change', { bubbles: true }));

      const events = recorder.getEvents();
      const changeEvent = events.find((e) => e.type === 'change');
      expect(changeEvent).toBeDefined();
      expect(changeEvent!.command).toContain('TYPE=INPUT:EMAIL');

      recorder.stop();
    });

    it('should record textarea changes', async () => {
      const { MacroRecorder } = await importMacroRecorder();
      const recorder = new MacroRecorder();
      recorder.start();

      const textarea = ctx.document.getElementById(
        'comments'
      ) as HTMLTextAreaElement;
      textarea.value = 'This is a comment';
      textarea.dispatchEvent(
        new ctx.window.Event('change', { bubbles: true })
      );

      const events = recorder.getEvents();
      const changeEvent = events.find((e) => e.type === 'change');
      expect(changeEvent).toBeDefined();
      expect(changeEvent!.command).toContain('TYPE=TEXTAREA');
      expect(changeEvent!.command).toContain('CONTENT=');

      recorder.stop();
    });

    it('should record select changes with % prefix', async () => {
      const { MacroRecorder } = await importMacroRecorder();
      const recorder = new MacroRecorder();
      recorder.start();

      const select = ctx.document.getElementById(
        'country'
      ) as HTMLSelectElement;
      select.value = 'us';
      // Manually set selectedIndex to match
      for (let i = 0; i < select.options.length; i++) {
        if (select.options[i].value === 'us') {
          select.selectedIndex = i;
          break;
        }
      }
      select.dispatchEvent(new ctx.window.Event('change', { bubbles: true }));

      const events = recorder.getEvents();
      const changeEvent = events.find((e) => e.type === 'change');
      expect(changeEvent).toBeDefined();
      expect(changeEvent!.command).toContain('TYPE=SELECT');
      // Content should have % prefix for select values
      expect(changeEvent!.command).toContain('CONTENT=%');

      recorder.stop();
    });

    it('should generate parseable TAG commands for form inputs', async () => {
      const { MacroRecorder } = await importMacroRecorder();
      const recorder = new MacroRecorder();
      recorder.start();

      const input = ctx.document.getElementById('username') as HTMLInputElement;
      input.value = 'testuser';
      input.dispatchEvent(new ctx.window.Event('change', { bubbles: true }));

      const macro = recorder.generateMacro();
      const parsed = parseMacro(macro);

      // No parse errors
      expect(parsed.errors).toHaveLength(0);

      // Should have at least one TAG command
      const tagCommands = parsed.commands.filter((c) => c.type === 'TAG');
      expect(tagCommands.length).toBeGreaterThanOrEqual(1);

      // Validate each TAG command
      for (const cmd of tagCommands) {
        const error = validateCommand(cmd);
        expect(error).toBeNull();
      }

      recorder.stop();
    });

    it('should handle content with spaces (quoted)', async () => {
      const { MacroRecorder } = await importMacroRecorder();
      const recorder = new MacroRecorder();
      recorder.start();

      const input = ctx.document.getElementById('username') as HTMLInputElement;
      input.value = 'John Doe';
      input.dispatchEvent(new ctx.window.Event('change', { bubbles: true }));

      const events = recorder.getEvents();
      const changeEvent = events.find((e) => e.type === 'change');
      expect(changeEvent).toBeDefined();
      // Content with spaces should be quoted
      expect(changeEvent!.command).toContain('CONTENT="John Doe"');

      recorder.stop();
    });

    it('should record multiple form fields', async () => {
      const { MacroRecorder } = await importMacroRecorder();
      const recorder = new MacroRecorder();
      recorder.start();

      const username = ctx.document.getElementById(
        'username'
      ) as HTMLInputElement;
      username.value = 'testuser';
      username.dispatchEvent(
        new ctx.window.Event('change', { bubbles: true })
      );

      const password = ctx.document.getElementById(
        'password'
      ) as HTMLInputElement;
      password.value = 'secret';
      password.dispatchEvent(
        new ctx.window.Event('change', { bubbles: true })
      );

      const country = ctx.document.getElementById(
        'country'
      ) as HTMLSelectElement;
      country.value = 'ca';
      for (let i = 0; i < country.options.length; i++) {
        if (country.options[i].value === 'ca') {
          country.selectedIndex = i;
          break;
        }
      }
      country.dispatchEvent(
        new ctx.window.Event('change', { bubbles: true })
      );

      const events = recorder.getEvents();
      expect(events.filter((e) => e.type === 'change').length).toBe(3);

      recorder.stop();
    });
  });

  // ============================================================
  // SECTION: Recording Navigation
  // ============================================================
  describe('Recording Navigation', () => {
    let ctx: DomContext;

    beforeEach(() => {
      ctx = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <a id="link1" href="https://example.com/page1">Page 1</a>
          <a id="link2" href="https://example.com/page2">Page 2</a>
        </body>
        </html>
      `);
    });

    afterEach(() => {
      ctx.cleanup();
    });

    it('should generate macro header with URL comment', async () => {
      const { MacroRecorder } = await importMacroRecorder();
      const recorder = new MacroRecorder();
      recorder.start();
      recorder.stop();

      const macro = recorder.generateMacro();
      // Header contains a URL comment
      expect(macro).toContain("' URL:");
    });

    it('should record link clicks that would navigate', async () => {
      const { MacroRecorder } = await importMacroRecorder();
      const recorder = new MacroRecorder();
      recorder.start();

      const link = ctx.document.getElementById('link1')!;
      link.dispatchEvent(
        new ctx.window.MouseEvent('click', { bubbles: true })
      );

      const events = recorder.getEvents();
      const clickEvent = events.find((e) => e.type === 'click');
      expect(clickEvent).toBeDefined();
      expect(clickEvent!.command).toContain('TYPE=A');
      // Should have an identifying attribute (ID takes priority over HREF)
      expect(clickEvent!.command).toContain('ATTR:ID=link1');

      recorder.stop();
    });
  });

  // ============================================================
  // SECTION: Macro Validation (recorded output is parseable)
  // ============================================================
  describe('Macro Validation', () => {
    let ctx: DomContext;

    beforeEach(() => {
      ctx = createDomContext(`
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
    });

    afterEach(() => {
      ctx.cleanup();
    });

    it('should generate macro with comment header', async () => {
      const { MacroRecorder } = await importMacroRecorder();
      const recorder = new MacroRecorder();
      recorder.start();
      recorder.stop();

      const macro = recorder.generateMacro();
      expect(macro).toContain("' iMacros Recorded Macro");
    });

    it('should generate parseable macro with no validation errors', async () => {
      const { MacroRecorder } = await importMacroRecorder();
      const recorder = new MacroRecorder();
      recorder.start();

      // Simulate user actions
      const input = ctx.document.getElementById('name') as HTMLInputElement;
      input.value = 'Test User';
      input.dispatchEvent(new ctx.window.Event('change', { bubbles: true }));

      const select = ctx.document.getElementById('size') as HTMLSelectElement;
      select.value = 'm';
      for (let i = 0; i < select.options.length; i++) {
        if (select.options[i].value === 'm') {
          select.selectedIndex = i;
          break;
        }
      }
      select.dispatchEvent(new ctx.window.Event('change', { bubbles: true }));

      const button = ctx.document.getElementById('submitBtn')!;
      button.dispatchEvent(
        new ctx.window.MouseEvent('click', { bubbles: true })
      );

      recorder.stop();

      const macro = recorder.generateMacro();
      const parsed = parseMacro(macro);

      expect(parsed.errors).toHaveLength(0);
      expect(parsed.commands.length).toBeGreaterThan(0);
    });

    it('should validate every TAG command in the generated macro', async () => {
      const { MacroRecorder } = await importMacroRecorder();
      const recorder = new MacroRecorder();
      recorder.start();

      // Record various actions
      const input = ctx.document.getElementById('name') as HTMLInputElement;
      input.value = 'John';
      input.dispatchEvent(new ctx.window.Event('change', { bubbles: true }));

      const button = ctx.document.getElementById('submitBtn')!;
      button.dispatchEvent(
        new ctx.window.MouseEvent('click', { bubbles: true })
      );

      recorder.stop();

      const macro = recorder.generateMacro();
      const parsed = parseMacro(macro);

      for (const command of parsed.commands) {
        const error = validateCommand(command);
        expect(error).toBeNull();
      }
    });

    it('should generate commands in chronological order', async () => {
      const { MacroRecorder } = await importMacroRecorder();
      const recorder = new MacroRecorder();
      recorder.start();

      const input = ctx.document.getElementById('name') as HTMLInputElement;
      input.value = 'User';
      input.dispatchEvent(new ctx.window.Event('change', { bubbles: true }));

      const button = ctx.document.getElementById('submitBtn')!;
      button.dispatchEvent(
        new ctx.window.MouseEvent('click', { bubbles: true })
      );

      recorder.stop();

      const events = recorder.getEvents();
      // Events should be in chronological order (timestamps non-decreasing)
      for (let i = 1; i < events.length; i++) {
        expect(events[i].timestamp).toBeGreaterThanOrEqual(
          events[i - 1].timestamp
        );
      }
    });
  });

  // ============================================================
  // SECTION: Playback Tests
  // ============================================================
  describe('Playback Tests', () => {
    it('should play back navigation URL commands', () => {
      const ctx = createDomContext(`
        <!DOCTYPE html>
        <html><body></body></html>
      `);
      try {
        const macro = `
VERSION BUILD=1000000
TAB T=1
URL GOTO=https://example.com/page1
URL GOTO=https://example.com/page2
`;
        const parsed = parseMacro(macro);
        const player = new MacroPlayer(ctx);
        const result = player.execute(parsed);

        expect(result.success).toBe(true);
        expect(player.getCurrentUrl()).toBe('https://example.com/page2');
        expect(player.getNavigationHistory()).toContain(
          'https://example.com/page1'
        );
        expect(player.getNavigationHistory()).toContain(
          'https://example.com/page2'
        );
      } finally {
        ctx.cleanup();
      }
    });

    it('should play back form fills with ATTR:NAME format', () => {
      const ctx = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <input type="text" id="username" name="username" />
          <input type="password" id="password" name="password" />
        </body>
        </html>
      `);
      try {
        // Use the real recorder's ATTR: format
        const macro = `
TAG POS=1 TYPE=INPUT:TEXT ATTR:NAME=username CONTENT=testuser
TAG POS=1 TYPE=INPUT:PASSWORD ATTR:NAME=password CONTENT=secret123
`;
        const parsed = parseMacro(macro);
        const player = new MacroPlayer(ctx);
        const result = player.execute(parsed);

        expect(result.success).toBe(true);

        const usernameInput = ctx.document.getElementById(
          'username'
        ) as HTMLInputElement;
        const passwordInput = ctx.document.getElementById(
          'password'
        ) as HTMLInputElement;

        expect(usernameInput.value).toBe('testuser');
        expect(passwordInput.value).toBe('secret123');
      } finally {
        ctx.cleanup();
      }
    });

    it('should play back clicks via TAG command', () => {
      const ctx = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <button id="btn1">Click Me</button>
        </body>
        </html>
      `);
      try {
        let clicked = false;
        const button = ctx.document.getElementById('btn1')!;
        button.addEventListener('click', () => {
          clicked = true;
        });

        const macro = `TAG POS=1 TYPE=BUTTON ATTR:ID=btn1`;
        const parsed = parseMacro(macro);
        const player = new MacroPlayer(ctx);
        const result = player.execute(parsed);

        expect(result.success).toBe(true);
        expect(clicked).toBe(true);
      } finally {
        ctx.cleanup();
      }
    });

    it('should play back select changes with % content', () => {
      const ctx = createDomContext(`
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
      try {
        const macro = `TAG POS=1 TYPE=SELECT ATTR:NAME=country CONTENT=%uk`;
        const parsed = parseMacro(macro);
        const player = new MacroPlayer(ctx);
        const result = player.execute(parsed);

        expect(result.success).toBe(true);

        const select = ctx.document.getElementById(
          'country'
        ) as HTMLSelectElement;
        expect(select.value).toBe('uk');
      } finally {
        ctx.cleanup();
      }
    });

    it('should report errors for missing elements during playback', () => {
      const ctx = createDomContext(`
        <!DOCTYPE html>
        <html><body></body></html>
      `);
      try {
        const macro = `TAG POS=1 TYPE=INPUT:TEXT ATTR:ID=nonexistent CONTENT=value`;
        const parsed = parseMacro(macro);
        const player = new MacroPlayer(ctx);
        const result = player.execute(parsed);

        expect(result.success).toBe(false);
        expect(
          result.results.some((r) => r.error?.includes('Element not found'))
        ).toBe(true);
      } finally {
        ctx.cleanup();
      }
    });
  });

  // ============================================================
  // SECTION: Record and Playback Integration (Full Round-Trip)
  // ============================================================
  describe('Record and Playback Integration', () => {
    it('should record and play back a login form', async () => {
      // Phase 1: Record
      const recordCtx = createDomContext(`
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

      try {
        const { MacroRecorder } = await importMacroRecorder();
        const recorder = new MacroRecorder();
        recorder.start();

        const usernameInput = recordCtx.document.getElementById(
          'username'
        ) as HTMLInputElement;
        usernameInput.value = 'admin';
        usernameInput.dispatchEvent(
          new recordCtx.window.Event('change', { bubbles: true })
        );

        const passwordInput = recordCtx.document.getElementById(
          'password'
        ) as HTMLInputElement;
        passwordInput.value = 'password123';
        passwordInput.dispatchEvent(
          new recordCtx.window.Event('change', { bubbles: true })
        );

        const loginBtn = recordCtx.document.getElementById('loginBtn')!;
        loginBtn.dispatchEvent(
          new recordCtx.window.MouseEvent('click', { bubbles: true })
        );

        recorder.stop();

        const macro = recorder.generateMacro();
        recordCtx.cleanup();

        // Phase 2: Verify macro is parseable
        const parsed = parseMacro(macro);
        expect(parsed.errors).toHaveLength(0);

        // Phase 3: Play back on a fresh DOM
        const playCtx = createDomContext(`
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

        try {
          const player = new MacroPlayer(playCtx);
          const result = player.execute(parsed);

          expect(result.success).toBe(true);

          const playedUsername = playCtx.document.getElementById(
            'username'
          ) as HTMLInputElement;
          const playedPassword = playCtx.document.getElementById(
            'password'
          ) as HTMLInputElement;

          expect(playedUsername.value).toBe('admin');
          expect(playedPassword.value).toBe('password123');
        } finally {
          playCtx.cleanup();
        }
      } catch (e) {
        recordCtx.cleanup();
        throw e;
      }
    });

    it('should record and play back multiple form interactions', async () => {
      const recordCtx = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <input type="text" id="search" name="search" />
          <button id="searchBtn">Search</button>
          <select id="filter" name="filter">
            <option value="all">All</option>
            <option value="recent">Recent</option>
          </select>
        </body>
        </html>
      `);

      try {
        const { MacroRecorder } = await importMacroRecorder();
        const recorder = new MacroRecorder();
        recorder.start();

        // Fill search
        const searchInput = recordCtx.document.getElementById(
          'search'
        ) as HTMLInputElement;
        searchInput.value = 'test query';
        searchInput.dispatchEvent(
          new recordCtx.window.Event('change', { bubbles: true })
        );

        // Change filter
        const filterSelect = recordCtx.document.getElementById(
          'filter'
        ) as HTMLSelectElement;
        filterSelect.value = 'recent';
        for (let i = 0; i < filterSelect.options.length; i++) {
          if (filterSelect.options[i].value === 'recent') {
            filterSelect.selectedIndex = i;
            break;
          }
        }
        filterSelect.dispatchEvent(
          new recordCtx.window.Event('change', { bubbles: true })
        );

        // Click search
        recordCtx.document.getElementById('searchBtn')!.dispatchEvent(
          new recordCtx.window.MouseEvent('click', { bubbles: true })
        );

        recorder.stop();

        const macro = recorder.generateMacro();
        recordCtx.cleanup();

        // Verify parseable
        const parsed = parseMacro(macro);
        expect(parsed.errors).toHaveLength(0);

        const tagCommands = parsed.commands.filter((c) => c.type === 'TAG');
        // At least 2 TAG commands (search input + select or search + click)
        expect(tagCommands.length).toBeGreaterThanOrEqual(2);

        // Play back
        const playCtx = createDomContext(`
          <!DOCTYPE html>
          <html>
          <body>
            <input type="text" id="search" name="search" />
            <button id="searchBtn">Search</button>
            <select id="filter" name="filter">
              <option value="all">All</option>
              <option value="recent">Recent</option>
            </select>
          </body>
          </html>
        `);

        try {
          const player = new MacroPlayer(playCtx);
          const result = player.execute(parsed);

          expect(result.success).toBe(true);

          const playedSearch = playCtx.document.getElementById(
            'search'
          ) as HTMLInputElement;
          const playedFilter = playCtx.document.getElementById(
            'filter'
          ) as HTMLSelectElement;

          expect(playedSearch.value).toBe('test query');
          expect(playedFilter.value).toBe('recent');
        } finally {
          playCtx.cleanup();
        }
      } catch (e) {
        recordCtx.cleanup();
        throw e;
      }
    });

    it('should produce idempotent macros for identical actions', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <body>
          <input type="text" id="field1" name="field1" />
        </body>
        </html>
      `;

      // First recording
      const ctx1 = createDomContext(html);
      try {
        const { MacroRecorder } = await importMacroRecorder();
        const recorder1 = new MacroRecorder();
        recorder1.start();

        const input1 = ctx1.document.getElementById(
          'field1'
        ) as HTMLInputElement;
        input1.value = 'test';
        input1.dispatchEvent(
          new ctx1.window.Event('change', { bubbles: true })
        );
        recorder1.stop();

        const macro1 = recorder1.generateMacro();
        ctx1.cleanup();

        // Second recording
        const ctx2 = createDomContext(html);
        try {
          const recorder2 = new MacroRecorder();
          recorder2.start();

          const input2 = ctx2.document.getElementById(
            'field1'
          ) as HTMLInputElement;
          input2.value = 'test';
          input2.dispatchEvent(
            new ctx2.window.Event('change', { bubbles: true })
          );
          recorder2.stop();

          const macro2 = recorder2.generateMacro();
          ctx2.cleanup();

          // Compare structure
          const parsed1 = parseMacro(macro1);
          const parsed2 = parseMacro(macro2);

          expect(parsed1.commands.length).toBe(parsed2.commands.length);

          for (let i = 0; i < parsed1.commands.length; i++) {
            expect(parsed1.commands[i].type).toBe(parsed2.commands[i].type);
            expect(parsed1.commands[i].parameters.length).toBe(
              parsed2.commands[i].parameters.length
            );
          }
        } catch (e) {
          ctx2.cleanup();
          throw e;
        }
      } catch (e) {
        // ctx1 may already be cleaned up
        throw e;
      }
    });
  });

  // ============================================================
  // SECTION: Edge Cases
  // ============================================================
  describe('Edge Cases', () => {
    it('should handle special characters in input values', async () => {
      const ctx = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <input type="text" id="special" name="special" />
        </body>
        </html>
      `);

      try {
        const { MacroRecorder } = await importMacroRecorder();
        const recorder = new MacroRecorder();
        recorder.start();

        const input = ctx.document.getElementById(
          'special'
        ) as HTMLInputElement;
        input.value = 'Test "quoted" value & <special>';
        input.dispatchEvent(new ctx.window.Event('change', { bubbles: true }));

        recorder.stop();

        const macro = recorder.generateMacro();
        const parsed = parseMacro(macro);

        expect(parsed.errors).toHaveLength(0);
      } finally {
        ctx.cleanup();
      }
    });

    it('should handle rapid sequential clicks', async () => {
      const ctx = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <button id="btn">Click</button>
        </body>
        </html>
      `);

      try {
        const { MacroRecorder } = await importMacroRecorder();
        const recorder = new MacroRecorder();
        recorder.start();

        const button = ctx.document.getElementById('btn')!;
        for (let i = 0; i < 5; i++) {
          button.dispatchEvent(
            new ctx.window.MouseEvent('click', { bubbles: true })
          );
        }

        recorder.stop();

        const events = recorder.getEvents();
        expect(events.filter((e) => e.type === 'click').length).toBe(5);
      } finally {
        ctx.cleanup();
      }
    });

    it('should clear events between recordings', async () => {
      const ctx = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <button id="btn">Click</button>
        </body>
        </html>
      `);

      try {
        const { MacroRecorder } = await importMacroRecorder();
        const recorder = new MacroRecorder();

        // First recording
        recorder.start();
        ctx.document.getElementById('btn')!.dispatchEvent(
          new ctx.window.MouseEvent('click', { bubbles: true })
        );
        recorder.stop();

        expect(recorder.getEvents().length).toBeGreaterThan(0);

        // Clear and verify
        recorder.clearEvents();
        expect(recorder.getEvents().length).toBe(0);

        // Second recording starts fresh
        recorder.start();
        ctx.document.getElementById('btn')!.dispatchEvent(
          new ctx.window.MouseEvent('click', { bubbles: true })
        );
        recorder.stop();

        const events = recorder.getEvents();
        expect(events.filter((e) => e.type === 'click').length).toBe(1);
      } finally {
        ctx.cleanup();
      }
    });

    it('should not record events when not recording', async () => {
      const ctx = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <button id="btn">Click</button>
        </body>
        </html>
      `);

      try {
        const { MacroRecorder } = await importMacroRecorder();
        const recorder = new MacroRecorder();

        // Click without starting recording
        ctx.document.getElementById('btn')!.dispatchEvent(
          new ctx.window.MouseEvent('click', { bubbles: true })
        );

        expect(recorder.getEvents().length).toBe(0);
      } finally {
        ctx.cleanup();
      }
    });

    it('should handle elements without id or name', async () => {
      const ctx = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <button class="primary-btn">Click Me</button>
        </body>
        </html>
      `);

      try {
        const { MacroRecorder } = await importMacroRecorder();
        const recorder = new MacroRecorder();
        recorder.start();

        const button = ctx.document.querySelector('.primary-btn')!;
        button.dispatchEvent(
          new ctx.window.MouseEvent('click', { bubbles: true })
        );

        recorder.stop();

        const macro = recorder.generateMacro();
        const parsed = parseMacro(macro);

        expect(parsed.errors).toHaveLength(0);

        // Should use class or text content as attribute
        const tagCommands = parsed.commands.filter((c) => c.type === 'TAG');
        expect(tagCommands.length).toBeGreaterThanOrEqual(1);
        // The command should contain some identifying attribute
        const cmd = tagCommands[0].raw;
        expect(cmd).toMatch(/ATTR:/);
      } finally {
        ctx.cleanup();
      }
    });

    it('should handle empty content values', async () => {
      const ctx = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <input type="text" id="empty" name="empty" />
        </body>
        </html>
      `);

      try {
        const { MacroRecorder } = await importMacroRecorder();
        const recorder = new MacroRecorder();
        recorder.start();

        const input = ctx.document.getElementById('empty') as HTMLInputElement;
        input.value = '';
        input.dispatchEvent(new ctx.window.Event('change', { bubbles: true }));

        recorder.stop();

        const macro = recorder.generateMacro();
        const parsed = parseMacro(macro);
        expect(parsed.errors).toHaveLength(0);
      } finally {
        ctx.cleanup();
      }
    });

    it('should use event callback when set', async () => {
      const ctx = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <button id="btn">Click</button>
        </body>
        </html>
      `);

      try {
        const { MacroRecorder } = await importMacroRecorder();
        const recorder = new MacroRecorder();

        const callbackEvents: any[] = [];
        recorder.setEventCallback((event) => {
          callbackEvents.push(event);
        });

        recorder.start();

        ctx.document.getElementById('btn')!.dispatchEvent(
          new ctx.window.MouseEvent('click', { bubbles: true })
        );

        recorder.stop();

        expect(callbackEvents.length).toBeGreaterThanOrEqual(1);
        expect(callbackEvents[0].type).toBe('click');
        expect(callbackEvents[0].command).toContain('TAG');
      } finally {
        ctx.cleanup();
      }
    });

    it('should respect recording configuration', async () => {
      const ctx = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <button id="btn">Click</button>
          <input type="text" id="input" name="input" />
        </body>
        </html>
      `);

      try {
        const { MacroRecorder } = await importMacroRecorder();
        const recorder = new MacroRecorder({ recordClicks: false });
        recorder.start();

        // Click should NOT be recorded
        ctx.document.getElementById('btn')!.dispatchEvent(
          new ctx.window.MouseEvent('click', { bubbles: true })
        );

        // But form changes should still be recorded
        const input = ctx.document.getElementById('input') as HTMLInputElement;
        input.value = 'hello';
        input.dispatchEvent(new ctx.window.Event('change', { bubbles: true }));

        recorder.stop();

        const events = recorder.getEvents();
        expect(events.filter((e) => e.type === 'click').length).toBe(0);
        expect(events.filter((e) => e.type === 'change').length).toBe(1);
      } finally {
        ctx.cleanup();
      }
    });

    it('should report isRecording state correctly', async () => {
      const ctx = createDomContext(`
        <!DOCTYPE html>
        <html><body></body></html>
      `);

      try {
        const { MacroRecorder } = await importMacroRecorder();
        const recorder = new MacroRecorder();

        expect(recorder.isRecording()).toBe(false);
        recorder.start();
        expect(recorder.isRecording()).toBe(true);
        recorder.stop();
        expect(recorder.isRecording()).toBe(false);
      } finally {
        ctx.cleanup();
      }
    });

    it('should not double-start recording', async () => {
      const ctx = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <button id="btn">Click</button>
        </body>
        </html>
      `);

      try {
        const { MacroRecorder } = await importMacroRecorder();
        const recorder = new MacroRecorder();
        recorder.start();
        recorder.start(); // second start should be no-op

        ctx.document.getElementById('btn')!.dispatchEvent(
          new ctx.window.MouseEvent('click', { bubbles: true })
        );
        recorder.stop();

        // Should still have exactly 1 click event (not duplicated)
        const events = recorder.getEvents();
        expect(events.filter((e) => e.type === 'click').length).toBe(1);
      } finally {
        ctx.cleanup();
      }
    });
  });

  // ============================================================
  // SECTION: Generated Macro End-to-End Parseability
  // ============================================================
  describe('Generated Macro Parseability', () => {
    it('full workflow: record form, validate parse, validate playback', async () => {
      // Build a page with diverse form elements
      const recordCtx = createDomContext(`
        <!DOCTYPE html>
        <html>
        <body>
          <form id="regForm">
            <input type="text" id="fullname" name="fullname" />
            <input type="email" id="email" name="email" />
            <input type="password" id="pass" name="pass" />
            <textarea id="bio" name="bio"></textarea>
            <select id="role" name="role">
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <input type="checkbox" id="agree" name="agree" />
            <button type="submit" id="regBtn">Register</button>
          </form>
        </body>
        </html>
      `);

      try {
        const { MacroRecorder } = await importMacroRecorder();
        const recorder = new MacroRecorder();
        recorder.start();

        // Fill text
        const fullname = recordCtx.document.getElementById(
          'fullname'
        ) as HTMLInputElement;
        fullname.value = 'Jane Smith';
        fullname.dispatchEvent(
          new recordCtx.window.Event('change', { bubbles: true })
        );

        // Fill email
        const email = recordCtx.document.getElementById(
          'email'
        ) as HTMLInputElement;
        email.value = 'jane@example.com';
        email.dispatchEvent(
          new recordCtx.window.Event('change', { bubbles: true })
        );

        // Fill password
        const pass = recordCtx.document.getElementById(
          'pass'
        ) as HTMLInputElement;
        pass.value = 'P@ssw0rd!';
        pass.dispatchEvent(
          new recordCtx.window.Event('change', { bubbles: true })
        );

        // Fill textarea
        const bio = recordCtx.document.getElementById(
          'bio'
        ) as HTMLTextAreaElement;
        bio.value = 'Hello world';
        bio.dispatchEvent(
          new recordCtx.window.Event('change', { bubbles: true })
        );

        // Change select
        const role = recordCtx.document.getElementById(
          'role'
        ) as HTMLSelectElement;
        role.value = 'admin';
        for (let i = 0; i < role.options.length; i++) {
          if (role.options[i].value === 'admin') {
            role.selectedIndex = i;
            break;
          }
        }
        role.dispatchEvent(
          new recordCtx.window.Event('change', { bubbles: true })
        );

        // Click checkbox
        const agree = recordCtx.document.getElementById('agree')!;
        agree.dispatchEvent(
          new recordCtx.window.MouseEvent('click', { bubbles: true })
        );

        // Click submit button
        const regBtn = recordCtx.document.getElementById('regBtn')!;
        regBtn.dispatchEvent(
          new recordCtx.window.MouseEvent('click', { bubbles: true })
        );

        recorder.stop();

        const macroText = recorder.generateMacro();
        recordCtx.cleanup();

        // Step 1: Parse the generated macro
        const parsed = parseMacro(macroText);
        expect(parsed.errors).toHaveLength(0);

        // Step 2: Validate every command
        for (const cmd of parsed.commands) {
          const error = validateCommand(cmd);
          expect(error).toBeNull();
        }

        // Step 3: Count expected TAG commands
        const tagCommands = parsed.commands.filter((c) => c.type === 'TAG');
        // At minimum: fullname + email + password + bio + role + checkbox click + submit click
        expect(tagCommands.length).toBeGreaterThanOrEqual(5);

        // Step 4: Play back on fresh DOM
        const playCtx = createDomContext(`
          <!DOCTYPE html>
          <html>
          <body>
            <form id="regForm">
              <input type="text" id="fullname" name="fullname" />
              <input type="email" id="email" name="email" />
              <input type="password" id="pass" name="pass" />
              <textarea id="bio" name="bio"></textarea>
              <select id="role" name="role">
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
              <input type="checkbox" id="agree" name="agree" />
              <button type="submit" id="regBtn">Register</button>
            </form>
          </body>
          </html>
        `);

        try {
          const player = new MacroPlayer(playCtx);
          const result = player.execute(parsed);

          expect(result.success).toBe(true);

          // Verify form fields were filled
          expect(
            (playCtx.document.getElementById('fullname') as HTMLInputElement)
              .value
          ).toBe('Jane Smith');
          expect(
            (playCtx.document.getElementById('email') as HTMLInputElement).value
          ).toBe('jane@example.com');
          expect(
            (playCtx.document.getElementById('pass') as HTMLInputElement).value
          ).toBe('P@ssw0rd!');
          expect(
            (playCtx.document.getElementById('bio') as HTMLTextAreaElement)
              .value
          ).toBe('Hello world');
          expect(
            (playCtx.document.getElementById('role') as HTMLSelectElement).value
          ).toBe('admin');
        } finally {
          playCtx.cleanup();
        }
      } catch (e) {
        recordCtx.cleanup();
        throw e;
      }
    });
  });
});
