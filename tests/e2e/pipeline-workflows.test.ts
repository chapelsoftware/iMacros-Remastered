/**
 * E2E Pipeline Workflow Tests
 *
 * Tests complex multi-command workflows, error recovery patterns,
 * loop+extraction+datasource pipelines, and GOTO control flow
 * through the full execution pipeline.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { MacroExecutor, createExecutor, IMACROS_ERROR_CODES } from '../../shared/src/executor';
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
import { registerExtractionHandlers, extractFromElement } from '../../shared/src/commands/extraction';

// ===== Test HTML Pages =====

const ITEMS_PAGE_HTML = `<!DOCTYPE html>
<html>
<head><title>Items Page</title></head>
<body>
  <h1 id="heading">Product List</h1>
  <div id="items">
    <div class="item" data-id="1"><span class="name">Widget A</span><span class="price">$10</span></div>
    <div class="item" data-id="2"><span class="name">Widget B</span><span class="price">$20</span></div>
    <div class="item" data-id="3"><span class="name">Widget C</span><span class="price">$30</span></div>
    <div class="item" data-id="4"><span class="name">Widget D</span><span class="price">$40</span></div>
    <div class="item" data-id="5"><span class="name">Widget E</span><span class="price">$50</span></div>
  </div>
  <span id="total-count">5</span>
  <a id="next-page" href="https://example.com/page2">Next</a>
  <form id="searchForm">
    <input id="search" name="search" type="text" value="" />
    <button id="searchBtn" type="submit">Search</button>
  </form>
</body>
</html>`;

const RESULTS_PAGE_HTML = `<!DOCTYPE html>
<html>
<head><title>Results Page</title></head>
<body>
  <h1 id="heading">Search Results</h1>
  <span class="result-count">3</span>
  <div class="result" data-pos="1"><a class="title" href="/item/1">First Result</a></div>
  <div class="result" data-pos="2"><a class="title" href="/item/2">Second Result</a></div>
  <div class="result" data-pos="3"><a class="title" href="/item/3">Third Result</a></div>
</body>
</html>`;

const FORM_PAGE_HTML = `<!DOCTYPE html>
<html>
<head><title>Form Page</title></head>
<body>
  <form id="dataForm">
    <input id="name" name="name" type="text" />
    <input id="email" name="email" type="email" />
    <input id="phone" name="phone" type="tel" />
    <select id="category" name="category">
      <option value="">Select...</option>
      <option value="a">Category A</option>
      <option value="b">Category B</option>
    </select>
    <textarea id="notes" name="notes"></textarea>
    <button id="submit" type="submit">Submit</button>
  </form>
  <div id="status">ready</div>
</body>
</html>`;

// ===== JSDOM Browser Bridge & Content Sender =====

function createTestBrowserBridge(state: {
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
          const pageHtml = state.pages.get(url);
          if (pageHtml) {
            state.dom = new JSDOM(pageHtml, { url, runScripts: 'dangerously' });
          }
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
            if (pageHtml) state.dom = new JSDOM(pageHtml, { url: prevUrl, runScripts: 'dangerously' });
            return { success: true, data: { url: prevUrl } };
          }
          return { success: false, error: 'No history' };
        }
        case 'refresh': {
          const html = state.pages.get(state.currentUrl);
          if (html) state.dom = new JSDOM(html, { url: state.currentUrl, runScripts: 'dangerously' });
          return { success: true };
        }
        case 'openTab': {
          const tabUrl = (message as any).url || 'about:blank';
          state.tabs.forEach(t => t.active = false);
          state.tabs.push({ url: tabUrl, active: true });
          state.currentUrl = tabUrl;
          const tabHtml = state.pages.get(tabUrl);
          if (tabHtml) state.dom = new JSDOM(tabHtml, { url: tabUrl, runScripts: 'dangerously' });
          return { success: true, data: { tabIndex: state.tabs.length - 1 } };
        }
        case 'switchTab': {
          const tabIndex = (message as any).tabIndex as number;
          if (tabIndex < 0 || tabIndex >= state.tabs.length) return { success: false, error: 'Out of range' };
          state.tabs.forEach(t => t.active = false);
          state.tabs[tabIndex].active = true;
          state.currentUrl = state.tabs[tabIndex].url;
          const switchHtml = state.pages.get(state.currentUrl);
          if (switchHtml) state.dom = new JSDOM(switchHtml, { url: state.currentUrl, runScripts: 'dangerously' });
          return { success: true };
        }
        case 'closeTab': {
          if (state.tabs.length <= 1) return { success: false, error: 'Cannot close last tab' };
          const idx = state.tabs.findIndex(t => t.active);
          state.tabs.splice(idx, 1);
          const newIdx = Math.min(idx, state.tabs.length - 1);
          state.tabs[newIdx].active = true;
          state.currentUrl = state.tabs[newIdx].url;
          return { success: true };
        }
        case 'closeOtherTabs': {
          const active = state.tabs.find(t => t.active)!;
          state.tabs.length = 0;
          state.tabs.push(active);
          return { success: true };
        }
        case 'selectFrame':
          return { success: true };
        default:
          return { success: false, error: `Unknown: ${message.type}` };
      }
    }
  };
}

function createTestContentSender(state: { dom: JSDOM }): ContentScriptSender {
  return {
    async sendMessage(message: InteractionMessage): Promise<ContentScriptResponse> {
      const document = state.dom.window.document;
      switch (message.type) {
        case 'TAG_COMMAND': {
          const { selector, action } = message.payload;
          let element: Element | null = null;
          if (selector.xpath) {
            const r = document.evaluate(selector.xpath, document, null, 9, null);
            element = r.singleNodeValue as Element;
          } else if (selector.css) {
            element = document.querySelector(selector.css);
          } else if (selector.type || selector.attr) {
            const tagName = selector.type === '*' ? '*' : (selector.type || '*');
            let candidates = Array.from(document.querySelectorAll(tagName.toLowerCase()));
            if (selector.attr) {
              const colonIdx = selector.attr.indexOf(':');
              if (colonIdx > 0) {
                const attrKey = selector.attr.substring(0, colonIdx).toUpperCase();
                const attrVal = selector.attr.substring(colonIdx + 1);
                candidates = candidates.filter(el => {
                  if (attrKey === 'TXT') return attrVal === '*' || (el.textContent?.trim() || '').includes(attrVal.replace(/<SP>/g, ' '));
                  if (attrKey === 'NAME') return attrVal === '*' || el.getAttribute('name') === attrVal;
                  if (attrKey === 'ID') return attrVal === '*' || el.getAttribute('id') === attrVal;
                  if (attrKey === 'CLASS') return attrVal === '*' || el.classList.contains(attrVal);
                  if (attrKey === 'HREF') return attrVal === '*' || el.getAttribute('href') === attrVal;
                  const val = el.getAttribute(attrKey.toLowerCase());
                  return attrVal === '*' ? val !== null : val === attrVal;
                });
              }
            }
            const pos = selector.pos ?? 1;
            if (pos > 0 && pos <= candidates.length) element = candidates[pos - 1];
            else if (pos < 0) { const idx = candidates.length + pos; if (idx >= 0) element = candidates[idx]; }
          }
          if (!element) return { success: false, error: `Element not found: ${JSON.stringify(selector)}` };
          if (action.content !== undefined) {
            if (element instanceof state.dom.window.HTMLInputElement || element instanceof state.dom.window.HTMLTextAreaElement) {
              (element as any).value = action.content;
              element.dispatchEvent(new state.dom.window.Event('input', { bubbles: true }));
              element.dispatchEvent(new state.dom.window.Event('change', { bubbles: true }));
            } else if (element instanceof state.dom.window.HTMLSelectElement) {
              (element as any).value = action.content;
              element.dispatchEvent(new state.dom.window.Event('change', { bubbles: true }));
            }
            return { success: true };
          }
          if (action.extract) {
            const extractedData = extractFromElement(element, action.extract);
            return { success: true, extractedData };
          }
          if (action.form === 'SUBMIT') {
            const form = element.closest('form');
            if (form) form.dispatchEvent(new state.dom.window.Event('submit', { bubbles: true }));
            return { success: true };
          }
          element.dispatchEvent(new state.dom.window.MouseEvent('click', { bubbles: true }));
          return { success: true };
        }
        case 'CLICK_COMMAND': {
          const { x, y } = message.payload;
          const el = document.elementFromPoint(x, y);
          if (el) el.dispatchEvent(new state.dom.window.MouseEvent('click', { bubbles: true }));
          return { success: true };
        }
        case 'EVENT_COMMAND': {
          const { eventType, selector: evSelector } = message.payload;
          let target: Element | null = document.activeElement;
          if (evSelector?.css) target = document.querySelector(evSelector.css);
          if (target) target.dispatchEvent(new state.dom.window.Event(eventType, { bubbles: true }));
          return { success: true };
        }
        default:
          return { success: false, error: `Unknown: ${message.type}` };
      }
    }
  };
}

// ===== Test Suite =====

describe('E2E Pipeline: Complex Workflows', () => {
  let browserState: {
    dom: JSDOM;
    currentUrl: string;
    pages: Map<string, string>;
    history: string[];
    tabs: Array<{ url: string; active: boolean }>;
  };
  let executor: MacroExecutor;
  let logs: Array<{ level: string; message: string }>;

  function setupExecutor(options: any = {}) {
    const bridge = createTestBrowserBridge(browserState);
    const sender = createTestContentSender(browserState);
    setBrowserBridge(bridge);
    setContentScriptSender(sender);
    logs = [];
    executor = createExecutor({
      onLog: (level, message) => logs.push({ level, message }),
      ...options,
    });
    registerNavigationHandlers(executor);
    registerInteractionHandlers(executor.registerHandler.bind(executor));
    registerExtractionHandlers(executor.registerHandler.bind(executor));
  }

  beforeEach(() => {
    const pages = new Map<string, string>();
    pages.set('https://example.com/items', ITEMS_PAGE_HTML);
    pages.set('https://example.com/page2', RESULTS_PAGE_HTML);
    pages.set('https://example.com/form', FORM_PAGE_HTML);

    browserState = {
      dom: new JSDOM(ITEMS_PAGE_HTML, { url: 'https://example.com/items', runScripts: 'dangerously' }),
      currentUrl: 'https://example.com/items',
      pages,
      history: [],
      tabs: [{ url: 'https://example.com/items', active: true }],
    };

    setupExecutor();
  });

  afterEach(() => {
    setBrowserBridge(null as any);
    setContentScriptSender({ sendMessage: async () => ({ success: true }) });
  });

  // ===== Error Recovery Workflows =====

  describe('Error Recovery Workflows', () => {
    it('should continue after element-not-found with ERRORIGNORE', async () => {
      const macro = [
        'SET !ERRORIGNORE YES',
        'TAG POS=1 TYPE=SPAN ATTR=ID:nonexistent EXTRACT=TXT',
        'TAG POS=1 TYPE=H1 ATTR=TXT:* EXTRACT=TXT',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.extractData).toContain('Product List');
    });

    it('should skip to next loop with ERRORLOOP on element failure', async () => {
      setupExecutor({ maxLoops: 2 });
      const macro = [
        'SET !ERRORLOOP YES',
        'TAG POS=1 TYPE=DIV ATTR=ID:missing EXTRACT=TXT',
        'SET !VAR1 should_not_reach',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      // Both loops completed despite error
      expect(result.loopsCompleted).toBe(2);
      // !VAR1 should not be set (skipped on each loop)
      expect(result.variables['!VAR1']).toBe('');
    });

    it('should toggle ERRORIGNORE mid-macro and fail on second error', async () => {
      const macro = [
        'SET !ERRORIGNORE YES',
        'TAG POS=1 TYPE=DIV ATTR=ID:missing1 EXTRACT=TXT',
        'SET !ERRORIGNORE NO',
        'TAG POS=1 TYPE=H1 ATTR=TXT:* EXTRACT=TXT',
        'TAG POS=1 TYPE=DIV ATTR=ID:missing2 EXTRACT=TXT',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      // First error ignored, second error (missing2) should fail
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND);
      expect(result.errorLine).toBe(5);
    });

    it('should handle error recovery with variable state preservation', async () => {
      const macro = [
        'SET !ERRORIGNORE YES',
        'SET !VAR1 before_error',
        'TAG POS=1 TYPE=DIV ATTR=ID:missing EXTRACT=TXT',
        'SET !VAR2 after_error',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe('before_error');
      expect(result.variables['!VAR2']).toBe('after_error');
    });
  });

  // ===== Multi-Page Extraction Workflows =====

  describe('Multi-Page Extraction Workflows', () => {
    it('should navigate between pages and extract from each', async () => {
      const macro = [
        'URL GOTO=https://example.com/items',
        'TAG POS=1 TYPE=H1 ATTR=TXT:* EXTRACT=TXT',
        'URL GOTO=https://example.com/page2',
        'TAG POS=1 TYPE=H1 ATTR=TXT:* EXTRACT=TXT',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.extractData).toEqual(['Product List', 'Search Results']);
    });

    it('should extract multiple items from a list', async () => {
      const macro = [
        'URL GOTO=https://example.com/items',
        'TAG POS=1 TYPE=SPAN ATTR=CLASS:name EXTRACT=TXT',
        'TAG POS=2 TYPE=SPAN ATTR=CLASS:name EXTRACT=TXT',
        'TAG POS=3 TYPE=SPAN ATTR=CLASS:name EXTRACT=TXT',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.extractData).toEqual(['Widget A', 'Widget B', 'Widget C']);
    });

    it('should fill a search form and navigate to results', async () => {
      const macro = [
        'URL GOTO=https://example.com/items',
        'TAG POS=1 TYPE=INPUT ATTR=NAME:search CONTENT=test query',
        'URL GOTO=https://example.com/page2',
        'TAG POS=1 TYPE=SPAN ATTR=CLASS:result-count EXTRACT=TXT',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.extractData).toContain('3');
    });
  });

  // ===== Variable-Driven Workflows =====

  describe('Variable-Driven Workflows', () => {
    it('should use extracted data in subsequent variable references', async () => {
      const macro = [
        'URL GOTO=https://example.com/items',
        'TAG POS=1 TYPE=SPAN ATTR=ID:total-count EXTRACT=TXT',
        'SET !VAR1 {{!EXTRACT}}',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe('5');
    });

    it('should use !LOOP as POS index for row iteration', async () => {
      setupExecutor({ maxLoops: 3 });
      const macro = [
        'URL GOTO=https://example.com/items',
        'TAG POS={{!LOOP}} TYPE=SPAN ATTR=CLASS:name EXTRACT=TXT',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.loopsCompleted).toBe(3);
      expect(result.extractData).toEqual(['Widget A', 'Widget B', 'Widget C']);
    });

    it('should accumulate extraction data across loops', async () => {
      setupExecutor({ maxLoops: 5 });
      const macro = [
        'URL GOTO=https://example.com/items',
        'TAG POS={{!LOOP}} TYPE=SPAN ATTR=CLASS:price EXTRACT=TXT',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.extractData.length).toBe(5);
      expect(result.extractData).toEqual(['$10', '$20', '$30', '$40', '$50']);
    });

    it('should support EVAL with extracted data', async () => {
      const macro = [
        'URL GOTO=https://example.com/items',
        'TAG POS=1 TYPE=SPAN ATTR=ID:total-count EXTRACT=TXT',
        'SET !VAR1 {{!EXTRACT}}',
        'SET !VAR2 EVAL("{{!VAR1}}*2")',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      // 5 * 2 = 10
      expect(Number(result.variables['!VAR2'])).toBe(10);
    });
  });

  // ===== Form Filling Workflows =====

  describe('Form Filling Workflows', () => {
    it('should fill multiple form fields in sequence', async () => {
      const macro = [
        'URL GOTO=https://example.com/form',
        'TAG POS=1 TYPE=INPUT ATTR=NAME:name CONTENT=John',
        'TAG POS=1 TYPE=INPUT ATTR=NAME:email CONTENT=john@test.com',
        'TAG POS=1 TYPE=INPUT ATTR=NAME:phone CONTENT=555-1234',
        'TAG POS=1 TYPE=SELECT ATTR=NAME:category CONTENT=a',
        'TAG POS=1 TYPE=TEXTAREA ATTR=NAME:notes CONTENT=TestNotes',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const doc = browserState.dom.window.document;
      expect((doc.getElementById('name') as HTMLInputElement).value).toBe('John');
      expect((doc.getElementById('email') as HTMLInputElement).value).toBe('john@test.com');
      expect((doc.getElementById('phone') as HTMLInputElement).value).toBe('555-1234');
      expect((doc.getElementById('category') as HTMLSelectElement).value).toBe('a');
      expect((doc.getElementById('notes') as HTMLTextAreaElement).value).toBe('TestNotes');
    });

    it('should fill form using variable-stored data', async () => {
      const macro = [
        'SET !VAR1 Jane',
        'SET !VAR2 jane@test.com',
        'URL GOTO=https://example.com/form',
        'TAG POS=1 TYPE=INPUT ATTR=NAME:name CONTENT={{!VAR1}}',
        'TAG POS=1 TYPE=INPUT ATTR=NAME:email CONTENT={{!VAR2}}',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const doc = browserState.dom.window.document;
      expect((doc.getElementById('name') as HTMLInputElement).value).toBe('Jane');
      expect((doc.getElementById('email') as HTMLInputElement).value).toBe('jane@test.com');
    });
  });

  // ===== Navigation + Extraction + Variable Pipeline =====

  describe('Full Pipeline Workflows', () => {
    it('should navigate, extract, store, navigate, and fill using stored data', async () => {
      const macro = [
        'URL GOTO=https://example.com/items',
        'TAG POS=1 TYPE=SPAN ATTR=CLASS:name EXTRACT=TXT',
        'SET !VAR1 {{!EXTRACT}}',
        'URL GOTO=https://example.com/form',
        'TAG POS=1 TYPE=INPUT ATTR=NAME:name CONTENT={{!VAR1}}',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe('Widget A');
      const doc = browserState.dom.window.document;
      expect((doc.getElementById('name') as HTMLInputElement).value).toBe('Widget A');
    });

    it('should run full navigation workflow across tabs', async () => {
      const macro = [
        'URL GOTO=https://example.com/items',
        'TAG POS=1 TYPE=H1 ATTR=TXT:* EXTRACT=TXT',
        'TAB OPEN',
        'URL GOTO=https://example.com/page2',
        'TAG POS=1 TYPE=H1 ATTR=TXT:* EXTRACT=TXT',
        'TAB T=1',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.extractData).toEqual(['Product List', 'Search Results']);
      expect(browserState.tabs.length).toBe(2);
      expect(browserState.tabs[0].active).toBe(true);
    });

    it('should handle back navigation and re-extraction', async () => {
      const macro = [
        'URL GOTO=https://example.com/items',
        'TAG POS=1 TYPE=H1 ATTR=TXT:* EXTRACT=TXT',
        'URL GOTO=https://example.com/page2',
        'TAG POS=1 TYPE=H1 ATTR=TXT:* EXTRACT=TXT',
        'BACK',
        'TAG POS=1 TYPE=H1 ATTR=TXT:* EXTRACT=TXT',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.extractData).toEqual(['Product List', 'Search Results', 'Product List']);
    });
  });
});

// ===== Cleanup Callback Guarantees =====

describe('E2E Pipeline: Cleanup Callbacks', () => {
  it('should run cleanup callbacks on successful execution', async () => {
    const cleanupCalled: string[] = [];
    const executor = createExecutor();
    executor.registerCleanup(async () => { cleanupCalled.push('cleanup1'); });
    executor.registerCleanup(async () => { cleanupCalled.push('cleanup2'); });

    executor.loadMacro('SET !VAR1 hello');
    await executor.execute();

    expect(cleanupCalled).toEqual(['cleanup1', 'cleanup2']);
  });

  it('should run cleanup callbacks on error', async () => {
    const cleanupCalled: string[] = [];
    const executor = createExecutor();
    executor.registerCleanup(async () => { cleanupCalled.push('cleanup'); });

    executor.loadMacro('SET !VAR1');  // Missing value -> error
    await executor.execute();

    expect(cleanupCalled).toEqual(['cleanup']);
  });

  it('should run cleanup callbacks on abort', async () => {
    const cleanupCalled: string[] = [];
    const executor = createExecutor();
    executor.registerCleanup(async () => { cleanupCalled.push('cleanup'); });

    executor.loadMacro('WAIT SECONDS=10');
    const executePromise = executor.execute();

    // Stop after a short delay
    setTimeout(() => executor.stop(), 50);
    await executePromise;

    expect(cleanupCalled).toEqual(['cleanup']);
  });

  it('should handle cleanup callback errors gracefully', async () => {
    const cleanupCalled: string[] = [];
    const executor = createExecutor();
    executor.registerCleanup(async () => { throw new Error('cleanup failed'); });
    executor.registerCleanup(async () => { cleanupCalled.push('cleanup2'); });

    executor.loadMacro('SET !VAR1 hello');
    const result = await executor.execute();

    // Should still succeed even though cleanup1 threw
    expect(result.success).toBe(true);
    // Second cleanup should still run
    expect(cleanupCalled).toEqual(['cleanup2']);
  });
});

// ===== Pause/Resume/Stop E2E =====

describe('E2E Pipeline: Execution Control', () => {
  it('should pause and resume execution', async () => {
    const executor = createExecutor();
    const script = [
      'SET !VAR1 step1',
      'WAIT SECONDS=0.5',
      'SET !VAR2 step2',
    ].join('\n');
    executor.loadMacro(script);
    const executePromise = executor.execute();

    // Pause after a short delay
    setTimeout(() => {
      executor.pause();
      // Resume after another short delay
      setTimeout(() => executor.resume(), 100);
    }, 50);

    const result = await executePromise;
    expect(result.success).toBe(true);
    expect(result.variables['!VAR1']).toBe('step1');
    expect(result.variables['!VAR2']).toBe('step2');
  });

  it('should stop execution mid-macro', async () => {
    const executor = createExecutor();
    const script = [
      'SET !VAR1 step1',
      'WAIT SECONDS=5',
      'SET !VAR2 should_not_reach',
    ].join('\n');
    executor.loadMacro(script);
    const executePromise = executor.execute();

    // Stop after first command completes
    setTimeout(() => executor.stop(), 50);
    const result = await executePromise;

    // Should have been aborted
    expect(result.variables['!VAR1']).toBe('step1');
    expect(result.variables['!VAR2']).toBe('');
  });
});
