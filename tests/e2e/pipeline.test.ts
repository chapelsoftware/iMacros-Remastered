/**
 * End-to-End Macro Execution Pipeline Test
 *
 * Tests the full round-trip: parse macro -> execute commands -> browser bridge/
 * content script dispatch -> DOM interaction -> result return.
 *
 * Uses JSDOM to provide real DOM operations without a browser. The BrowserBridge
 * and ContentScriptSender are wired with real implementations that operate on
 * the JSDOM document, testing the actual pipeline integration.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { MacroExecutor, createExecutor, IMACROS_ERROR_CODES } from '../../shared/src/executor';
import { parseMacro } from '../../shared/src/parser';
import {
  setBrowserBridge,
  registerNavigationHandlers,
  type BrowserBridge,
  type BrowserOperationMessage,
  type BrowserOperationResponse,
} from '../../shared/src/commands/navigation';
import {
  setContentScriptSender,
  registerInteractionHandlers,
  type ContentScriptSender,
  type InteractionMessage,
  type ContentScriptResponse,
} from '../../shared/src/commands/interaction';
import { registerExtractionHandlers } from '../../shared/src/commands/extraction';
import { extractFromElement } from '../../shared/src/commands/extraction';

// ===== Test HTML Pages =====

const TEST_PAGE_HTML = `<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
  <h1 id="heading">Welcome to Test Page</h1>
  <p id="description" class="intro">This is a test page for E2E macro execution.</p>
  <a id="link1" href="https://example.com/page2" title="Go to page 2">Click Here</a>
  <a id="link2" href="https://example.com/page3">Another Link</a>
  <form id="testForm">
    <input id="username" name="username" type="text" value="" />
    <input id="password" name="password" type="password" value="" />
    <input id="email" name="email" type="email" value="" />
    <select id="country" name="country">
      <option value="">Select...</option>
      <option value="us">United States</option>
      <option value="uk">United Kingdom</option>
      <option value="de">Germany</option>
    </select>
    <textarea id="notes" name="notes"></textarea>
    <button id="submit" type="submit">Submit</button>
  </form>
  <div id="results"><span class="count">42</span><span class="label">items found</span></div>
  <table id="data-table">
    <tr><th>Name</th><th>Value</th></tr>
    <tr><td class="name">Alpha</td><td class="value">100</td></tr>
    <tr><td class="name">Beta</td><td class="value">200</td></tr>
    <tr><td class="name">Gamma</td><td class="value">300</td></tr>
  </table>
</body>
</html>`;

const SECOND_PAGE_HTML = `<!DOCTYPE html>
<html>
<head><title>Page Two</title></head>
<body>
  <h1 id="heading">Page Two</h1>
  <p id="content">This is the second page.</p>
</body>
</html>`;

// ===== JSDOM-backed BrowserBridge =====

/**
 * Creates a real BrowserBridge backed by JSDOM that handles navigation
 * by swapping the DOM contents based on URL.
 */
function createJsdomBrowserBridge(state: {
  dom: JSDOM;
  currentUrl: string;
  pages: Map<string, string>;
  history: string[];
  tabs: Array<{ url: string; active: boolean }>;
}): BrowserBridge {
  return {
    async sendMessage(message: BrowserOperationMessage): Promise<BrowserOperationResponse> {
      switch (message.type) {
        case 'navigate': {
          const url = (message as any).url as string;
          state.history.push(state.currentUrl);
          state.currentUrl = url;

          // Load page content if we have it
          const pageHtml = state.pages.get(url);
          if (pageHtml) {
            state.dom = new JSDOM(pageHtml, { url, runScripts: 'dangerously' });
          }

          // Update active tab
          const activeTab = state.tabs.find(t => t.active);
          if (activeTab) activeTab.url = url;

          return { success: true, data: { url } };
        }

        case 'getCurrentUrl':
          return { success: true, data: { url: state.currentUrl } };

        case 'goBack': {
          const prevUrl = state.history.pop();
          if (prevUrl) {
            state.currentUrl = prevUrl;
            const pageHtml = state.pages.get(prevUrl);
            if (pageHtml) {
              state.dom = new JSDOM(pageHtml, { url: prevUrl, runScripts: 'dangerously' });
            }
            return { success: true, data: { url: prevUrl } };
          }
          return { success: false, error: 'No history to go back to' };
        }

        case 'refresh':
          // Reload current page
          const refreshHtml = state.pages.get(state.currentUrl);
          if (refreshHtml) {
            state.dom = new JSDOM(refreshHtml, { url: state.currentUrl, runScripts: 'dangerously' });
          }
          return { success: true };

        case 'openTab': {
          const tabUrl = (message as any).url || 'about:blank';
          state.tabs.forEach(t => t.active = false);
          state.tabs.push({ url: tabUrl, active: true });
          state.currentUrl = tabUrl;
          const tabHtml = state.pages.get(tabUrl);
          if (tabHtml) {
            state.dom = new JSDOM(tabHtml, { url: tabUrl, runScripts: 'dangerously' });
          }
          return { success: true, data: { tabIndex: state.tabs.length - 1 } };
        }

        case 'switchTab': {
          const tabIndex = (message as any).tabIndex as number;
          if (tabIndex < 0 || tabIndex >= state.tabs.length) {
            return { success: false, error: `Tab index ${tabIndex} out of range` };
          }
          state.tabs.forEach(t => t.active = false);
          state.tabs[tabIndex].active = true;
          state.currentUrl = state.tabs[tabIndex].url;
          const switchHtml = state.pages.get(state.currentUrl);
          if (switchHtml) {
            state.dom = new JSDOM(switchHtml, { url: state.currentUrl, runScripts: 'dangerously' });
          }
          return { success: true };
        }

        case 'closeTab': {
          const activeIdx = state.tabs.findIndex(t => t.active);
          if (state.tabs.length <= 1) {
            return { success: false, error: 'Cannot close last tab' };
          }
          state.tabs.splice(activeIdx, 1);
          const newActiveIdx = Math.min(activeIdx, state.tabs.length - 1);
          state.tabs[newActiveIdx].active = true;
          state.currentUrl = state.tabs[newActiveIdx].url;
          return { success: true };
        }

        case 'closeOtherTabs': {
          const active = state.tabs.find(t => t.active)!;
          state.tabs.length = 0;
          state.tabs.push(active);
          return { success: true };
        }

        case 'selectFrame':
          // JSDOM doesn't really support frames, just succeed
          return { success: true };

        default:
          return { success: false, error: `Unknown message type: ${message.type}` };
      }
    }
  };
}

// ===== JSDOM-backed ContentScriptSender =====

/**
 * Creates a real ContentScriptSender backed by JSDOM that performs
 * actual DOM operations (find elements, extract text, fill forms).
 */
function createJsdomContentScriptSender(state: {
  dom: JSDOM;
}): ContentScriptSender {
  return {
    async sendMessage(message: InteractionMessage): Promise<ContentScriptResponse> {
      const document = state.dom.window.document;

      switch (message.type) {
        case 'TAG_COMMAND': {
          const { selector, action } = message.payload;
          let element: Element | null = null;

          // Find element by selector
          if (selector.xpath) {
            const result = document.evaluate(
              selector.xpath,
              document,
              null,
              9, // FIRST_ORDERED_NODE_TYPE
              null,
            );
            element = result.singleNodeValue as Element;
          } else if (selector.css) {
            element = document.querySelector(selector.css);
          } else if (selector.type || selector.attr) {
            // POS/TYPE/ATTR selection
            const tagName = selector.type === '*' ? '*' : (selector.type || '*');
            let candidates = Array.from(document.querySelectorAll(tagName.toLowerCase()));

            // Filter by ATTR
            if (selector.attr) {
              const colonIdx = selector.attr.indexOf(':');
              if (colonIdx > 0) {
                const attrKey = selector.attr.substring(0, colonIdx).toUpperCase();
                const attrVal = selector.attr.substring(colonIdx + 1);

                candidates = candidates.filter(el => {
                  if (attrKey === 'TXT') {
                    const text = el.textContent?.trim() || '';
                    return attrVal === '*' || text.includes(attrVal.replace(/<SP>/g, ' '));
                  }
                  if (attrKey === 'NAME') {
                    return attrVal === '*' || el.getAttribute('name') === attrVal;
                  }
                  if (attrKey === 'ID') {
                    return attrVal === '*' || el.getAttribute('id') === attrVal;
                  }
                  if (attrKey === 'CLASS') {
                    return attrVal === '*' || el.classList.contains(attrVal);
                  }
                  if (attrKey === 'HREF') {
                    return attrVal === '*' || el.getAttribute('href') === attrVal;
                  }
                  // Generic attribute
                  const val = el.getAttribute(attrKey.toLowerCase());
                  return attrVal === '*' ? val !== null : val === attrVal;
                });
              }
            }

            // Apply POS
            const pos = selector.pos ?? 1;
            if (pos > 0 && pos <= candidates.length) {
              element = candidates[pos - 1];
            } else if (pos < 0) {
              const idx = candidates.length + pos;
              if (idx >= 0) element = candidates[idx];
            }
          }

          if (!element) {
            return {
              success: false,
              error: `Element not found: ${JSON.stringify(selector)}`,
            };
          }

          // Handle content setting (form filling)
          if (action.content !== undefined) {
            if (element instanceof state.dom.window.HTMLInputElement ||
                element instanceof state.dom.window.HTMLTextAreaElement) {
              (element as any).value = action.content;
              element.dispatchEvent(new state.dom.window.Event('input', { bubbles: true }));
              element.dispatchEvent(new state.dom.window.Event('change', { bubbles: true }));
            } else if (element instanceof state.dom.window.HTMLSelectElement) {
              (element as any).value = action.content;
              element.dispatchEvent(new state.dom.window.Event('change', { bubbles: true }));
            }
            return { success: true };
          }

          // Handle extraction
          if (action.extract) {
            const extractedData = extractFromElement(element, action.extract);
            return { success: true, extractedData };
          }

          // Handle form actions
          if (action.form === 'SUBMIT') {
            const form = element.closest('form');
            if (form) {
              form.dispatchEvent(new state.dom.window.Event('submit', { bubbles: true }));
            }
            return { success: true };
          }

          // Default: click the element
          element.dispatchEvent(new state.dom.window.MouseEvent('click', { bubbles: true }));
          return { success: true };
        }

        case 'CLICK_COMMAND': {
          const { x, y } = message.payload;
          const el = document.elementFromPoint(x, y);
          if (el) {
            el.dispatchEvent(new state.dom.window.MouseEvent('click', { bubbles: true }));
          }
          return { success: true };
        }

        case 'EVENT_COMMAND': {
          const { eventType, selector: evSelector } = message.payload;
          let target: Element | null = document.activeElement;

          if (evSelector?.css) {
            target = document.querySelector(evSelector.css);
          } else if (evSelector?.xpath) {
            const result = document.evaluate(evSelector.xpath, document, null, 9, null);
            target = result.singleNodeValue as Element;
          }

          if (target) {
            target.dispatchEvent(new state.dom.window.Event(eventType, { bubbles: true }));
          }
          return { success: true };
        }

        default:
          return { success: false, error: `Unknown message type: ${message.type}` };
      }
    }
  };
}

// ===== Test Suite =====

describe('End-to-End Macro Execution Pipeline', () => {
  let browserState: {
    dom: JSDOM;
    currentUrl: string;
    pages: Map<string, string>;
    history: string[];
    tabs: Array<{ url: string; active: boolean }>;
  };
  let executor: MacroExecutor;
  let logs: Array<{ level: string; message: string }>;

  beforeEach(() => {
    // Set up pages
    const pages = new Map<string, string>();
    pages.set('https://example.com/test', TEST_PAGE_HTML);
    pages.set('https://example.com/page2', SECOND_PAGE_HTML);

    // Initialize browser state
    browserState = {
      dom: new JSDOM(TEST_PAGE_HTML, { url: 'https://example.com/test', runScripts: 'dangerously' }),
      currentUrl: 'https://example.com/test',
      pages,
      history: [],
      tabs: [{ url: 'https://example.com/test', active: true }],
    };

    // Wire up the pipeline
    const bridge = createJsdomBrowserBridge(browserState);
    const sender = createJsdomContentScriptSender(browserState);
    setBrowserBridge(bridge);
    setContentScriptSender(sender);

    // Create executor with logging
    logs = [];
    executor = createExecutor({
      onLog: (level, message) => logs.push({ level, message }),
    });

    // Register all command handlers
    registerNavigationHandlers(executor);
    registerInteractionHandlers(executor.registerHandler.bind(executor));
    registerExtractionHandlers(executor.registerHandler.bind(executor));
  });

  afterEach(() => {
    setBrowserBridge(null as any);
    setContentScriptSender({ sendMessage: async () => ({ success: true }) });
  });

  // ===== Section 1: Basic Pipeline - Parse + Execute =====

  describe('Basic Pipeline: Parse -> Execute -> Result', () => {
    it('parses and executes a simple URL GOTO command', async () => {
      const macro = `URL GOTO=https://example.com/page2`;
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(browserState.currentUrl).toBe('https://example.com/page2');
    });

    it('parses and executes a SET + URL GOTO with variable expansion', async () => {
      const macro = [
        'SET !VAR1 https://example.com/page2',
        'URL GOTO={{!VAR1}}',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(browserState.currentUrl).toBe('https://example.com/page2');
    });

    it('returns error for invalid macro syntax', async () => {
      const macro = `INVALIDCOMMAND FOO=BAR`;
      const parsed = parseMacro(macro, true);
      expect(parsed.errors.length).toBeGreaterThan(0);
    });
  });

  // ===== Section 2: Navigation Pipeline =====

  describe('Navigation Pipeline: URL + BACK + TAB', () => {
    it('navigates to URL and tracks URL in state', async () => {
      const macro = [
        'URL GOTO=https://example.com/test',
        'URL GOTO=https://example.com/page2',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      // URL GOTO updates the browser state
      expect(browserState.currentUrl).toBe('https://example.com/page2');
      // History should contain the previous URL
      expect(browserState.history).toContain('https://example.com/test');
    });

    it('navigates forward and back through history', async () => {
      const macro = [
        'URL GOTO=https://example.com/test',
        'URL GOTO=https://example.com/page2',
        'BACK',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(browserState.currentUrl).toBe('https://example.com/test');
    });

    it('opens new tab and navigates', async () => {
      const macro = [
        'TAB OPEN',
        'URL GOTO=https://example.com/page2',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(browserState.tabs.length).toBe(2);
      expect(browserState.currentUrl).toBe('https://example.com/page2');
    });

    it('switches between tabs', async () => {
      const macro = [
        'TAB OPEN',
        'URL GOTO=https://example.com/page2',
        'TAB T=1',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(browserState.tabs[0].active).toBe(true);
      expect(browserState.currentUrl).toBe('https://example.com/test');
    });
  });

  // ===== Section 3: DOM Interaction Pipeline =====

  describe('DOM Interaction Pipeline: TAG CONTENT + EXTRACT', () => {
    it('extracts text from an element using TAG with POS/TYPE/ATTR', async () => {
      const macro = `TAG POS=1 TYPE=H1 ATTR=TXT:* EXTRACT=TXT`;
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.extractData).toContain('Welcome to Test Page');
    });

    it('extracts href from a link element', async () => {
      const macro = `TAG POS=1 TYPE=A ATTR=TXT:Click Here EXTRACT=HREF`;
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.extractData).toContain('https://example.com/page2');
    });

    it('extracts title attribute from a link', async () => {
      const macro = `TAG POS=1 TYPE=A ATTR=ID:link1 EXTRACT=TITLE`;
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.extractData).toContain('Go to page 2');
    });

    it('fills a text input using TAG CONTENT', async () => {
      const macro = `TAG POS=1 TYPE=INPUT ATTR=NAME:username CONTENT=testuser`;
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const input = browserState.dom.window.document.getElementById('username') as HTMLInputElement;
      expect(input.value).toBe('testuser');
    });

    it('fills a select dropdown using TAG CONTENT', async () => {
      const macro = `TAG POS=1 TYPE=SELECT ATTR=NAME:country CONTENT=uk`;
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const select = browserState.dom.window.document.getElementById('country') as HTMLSelectElement;
      expect(select.value).toBe('uk');
    });

    it('finds element by CSS selector and extracts', async () => {
      const macro = `TAG CSS=.count EXTRACT=TXT`;
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.extractData).toContain('42');
    });

    it('returns error when element not found', async () => {
      const macro = `TAG POS=1 TYPE=DIV ATTR=ID:nonexistent EXTRACT=TXT`;
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND);
    });
  });

  // ===== Section 4: Multi-Command Macro (Full E2E) =====

  describe('Multi-Command Macro: Full Round-Trip', () => {
    it('executes URL GOTO + TAG EXTRACT multi-command macro', async () => {
      const macro = [
        'URL GOTO=https://example.com/test',
        'TAG POS=1 TYPE=H1 ATTR=TXT:* EXTRACT=TXT',
        'TAG POS=1 TYPE=A ATTR=TXT:Click Here EXTRACT=HREF',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.extractData.length).toBe(2);
      expect(result.extractData[0]).toBe('Welcome to Test Page');
      expect(result.extractData[1]).toBe('https://example.com/page2');
    });

    it('navigates, fills form, and extracts data in sequence', async () => {
      const macro = [
        'URL GOTO=https://example.com/test',
        'TAG POS=1 TYPE=INPUT ATTR=NAME:username CONTENT=john_doe',
        'TAG POS=1 TYPE=INPUT ATTR=NAME:email CONTENT=john@example.com',
        'TAG POS=1 TYPE=SELECT ATTR=NAME:country CONTENT=us',
        'TAG CSS=.count EXTRACT=TXT',
        'TAG CSS=.label EXTRACT=TXT',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);

      // Verify form was filled
      const doc = browserState.dom.window.document;
      expect((doc.getElementById('username') as HTMLInputElement).value).toBe('john_doe');
      expect((doc.getElementById('email') as HTMLInputElement).value).toBe('john@example.com');
      expect((doc.getElementById('country') as HTMLSelectElement).value).toBe('us');

      // Verify extractions
      expect(result.extractData.length).toBe(2);
      expect(result.extractData[0]).toBe('42');
      expect(result.extractData[1]).toBe('items found');
    });

    it('navigates across pages and extracts from each', async () => {
      const macro = [
        'URL GOTO=https://example.com/test',
        'TAG POS=1 TYPE=H1 ATTR=TXT:* EXTRACT=TXT',
        'URL GOTO=https://example.com/page2',
        'TAG POS=1 TYPE=H1 ATTR=TXT:* EXTRACT=TXT',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.extractData.length).toBe(2);
      expect(result.extractData[0]).toBe('Welcome to Test Page');
      expect(result.extractData[1]).toBe('Page Two');
    });

    it('uses variables to store and reuse extracted data', async () => {
      const macro = [
        'URL GOTO=https://example.com/test',
        'TAG CSS=.count EXTRACT=TXT',
        'SET !VAR1 {{!EXTRACT}}',
        'TAG CSS=.label EXTRACT=TXT',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe('42');
    });

    it('executes with multiple loops', async () => {
      executor = createExecutor({
        maxLoops: 3,
        onLog: (level, message) => logs.push({ level, message }),
      });
      registerNavigationHandlers(executor);
      registerInteractionHandlers(executor.registerHandler.bind(executor));
      registerExtractionHandlers(executor.registerHandler.bind(executor));

      const macro = [
        'TAG POS=1 TYPE=H1 ATTR=TXT:* EXTRACT=TXT',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.loopsCompleted).toBe(3);
      expect(result.extractData.length).toBe(3);
    });

    it('extracts table data row by row', async () => {
      const macro = [
        'TAG POS=1 TYPE=TD ATTR=CLASS:name EXTRACT=TXT',
        'TAG POS=1 TYPE=TD ATTR=CLASS:value EXTRACT=TXT',
        'TAG POS=2 TYPE=TD ATTR=CLASS:name EXTRACT=TXT',
        'TAG POS=2 TYPE=TD ATTR=CLASS:value EXTRACT=TXT',
        'TAG POS=3 TYPE=TD ATTR=CLASS:name EXTRACT=TXT',
        'TAG POS=3 TYPE=TD ATTR=CLASS:value EXTRACT=TXT',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.extractData).toEqual([
        'Alpha', '100',
        'Beta', '200',
        'Gamma', '300',
      ]);
    });
  });

  // ===== Section 5: Error Handling =====

  describe('Error Handling Through Pipeline', () => {
    it('reports element-not-found error with correct code', async () => {
      const macro = `TAG POS=1 TYPE=SPAN ATTR=ID:does-not-exist EXTRACT=TXT`;
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND);
      expect(result.errorLine).toBe(1);
    });

    it('continues execution with ERRORIGNORE', async () => {
      executor.setErrorIgnore(true);

      const macro = [
        'TAG POS=1 TYPE=SPAN ATTR=ID:does-not-exist EXTRACT=TXT',
        'TAG POS=1 TYPE=H1 ATTR=TXT:* EXTRACT=TXT',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.extractData).toContain('Welcome to Test Page');
    });

    it('handles missing URL parameter gracefully', async () => {
      const macro = `URL`;
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    });
  });

  // ===== Section 6: Pipeline Verification =====

  describe('Pipeline Verification: Commands Flow Through All Layers', () => {
    it('verifies navigation flows through BrowserBridge', async () => {
      let bridgeCalled = false;
      const originalBridge = createJsdomBrowserBridge(browserState);
      setBrowserBridge({
        async sendMessage(msg) {
          bridgeCalled = true;
          return originalBridge.sendMessage(msg);
        }
      });

      const macro = `URL GOTO=https://example.com/page2`;
      executor.loadMacro(macro);
      await executor.execute();

      expect(bridgeCalled).toBe(true);
    });

    it('verifies TAG flows through ContentScriptSender', async () => {
      let senderCalled = false;
      const originalSender = createJsdomContentScriptSender(browserState);
      setContentScriptSender({
        async sendMessage(msg) {
          senderCalled = true;
          return originalSender.sendMessage(msg);
        }
      });

      const macro = `TAG POS=1 TYPE=H1 ATTR=TXT:* EXTRACT=TXT`;
      executor.loadMacro(macro);
      await executor.execute();

      expect(senderCalled).toBe(true);
    });

    it('verifies full round-trip: parse -> execute -> bridge -> DOM -> extract -> result', async () => {
      const messagesReceived: string[] = [];

      const originalBridge = createJsdomBrowserBridge(browserState);
      setBrowserBridge({
        async sendMessage(msg) {
          messagesReceived.push(`bridge:${msg.type}`);
          return originalBridge.sendMessage(msg);
        }
      });

      const originalSender = createJsdomContentScriptSender(browserState);
      setContentScriptSender({
        async sendMessage(msg) {
          messagesReceived.push(`content:${msg.type}`);
          return originalSender.sendMessage(msg);
        }
      });

      const macro = [
        'URL GOTO=https://example.com/test',
        'TAG POS=1 TYPE=INPUT ATTR=NAME:username CONTENT=admin',
        'TAG POS=1 TYPE=H1 ATTR=TXT:* EXTRACT=TXT',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      // Verify all layers were hit
      expect(messagesReceived).toEqual([
        'bridge:navigate',
        'content:TAG_COMMAND',
        'content:TAG_COMMAND',
      ]);

      // Verify end-to-end result
      expect(result.success).toBe(true);
      expect(result.extractData[0]).toBe('Welcome to Test Page');

      // Verify DOM was actually modified
      const input = browserState.dom.window.document.getElementById('username') as HTMLInputElement;
      expect(input.value).toBe('admin');
    });
  });
});
