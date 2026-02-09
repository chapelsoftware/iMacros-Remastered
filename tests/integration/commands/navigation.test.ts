/**
 * Navigation Commands Integration Tests
 *
 * Tests URL and TAB commands that control browser navigation.
 * These tests verify real DOM interactions where possible.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  createExecutor,
  MacroExecutor,
  IMACROS_ERROR_CODES,
} from '@shared/executor';
import {
  registerNavigationHandlers,
  setBrowserBridge,
  BrowserBridge,
  BrowserOperationMessage,
  BrowserOperationResponse,
} from '@shared/commands/navigation';

/**
 * Mock browser navigation context
 */
interface NavigationContext {
  window: Window & typeof globalThis;
  document: Document;
  history: string[];
  currentUrl: string;
}

/**
 * Create a mock browser environment for navigation testing
 */
function createNavigationContext(initialUrl: string = 'about:blank'): NavigationContext {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: initialUrl,
    runScripts: 'dangerously',
  });

  return {
    window: dom.window as unknown as Window & typeof globalThis,
    document: dom.window.document,
    history: [initialUrl],
    currentUrl: initialUrl,
  };
}

/**
 * URL command implementation for testing
 */
class UrlCommand {
  private context: NavigationContext;

  constructor(context: NavigationContext) {
    this.context = context;
  }

  /**
   * Navigate to a URL
   * URL GOTO=<url>
   */
  goto(url: string): { success: boolean; url: string } {
    if (!url || typeof url !== 'string') {
      throw new Error('URL GOTO requires a valid URL');
    }

    // Normalize URL
    let normalizedUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('about:')) {
      normalizedUrl = 'https://' + url;
    }

    this.context.history.push(normalizedUrl);
    this.context.currentUrl = normalizedUrl;

    return { success: true, url: normalizedUrl };
  }

  /**
   * Get current URL
   */
  getCurrentUrl(): string {
    return this.context.currentUrl;
  }
}

/**
 * TAB command implementation for testing
 */
class TabCommand {
  private tabs: Map<number, { url: string; title: string; active: boolean }>;
  private activeTabId: number;
  private nextTabId: number;

  constructor() {
    this.tabs = new Map();
    this.nextTabId = 1;
    // Create initial tab
    this.activeTabId = this.nextTabId;
    this.tabs.set(this.nextTabId, { url: 'about:blank', title: 'New Tab', active: true });
    this.nextTabId++;
  }

  /**
   * Open a new tab
   * TAB OPEN
   */
  open(url: string = 'about:blank'): { success: boolean; tabId: number } {
    // Deactivate current tab
    const currentTab = this.tabs.get(this.activeTabId);
    if (currentTab) {
      currentTab.active = false;
    }

    const tabId = this.nextTabId++;
    this.tabs.set(tabId, { url, title: 'New Tab', active: true });
    this.activeTabId = tabId;

    return { success: true, tabId };
  }

  /**
   * Close a tab
   * TAB CLOSE
   */
  close(tabId?: number): { success: boolean } {
    const targetTabId = tabId ?? this.activeTabId;

    if (!this.tabs.has(targetTabId)) {
      throw new Error(`Tab ${targetTabId} does not exist`);
    }

    if (this.tabs.size === 1) {
      throw new Error('Cannot close the last tab');
    }

    this.tabs.delete(targetTabId);

    // If we closed the active tab, activate another one
    if (targetTabId === this.activeTabId) {
      const remainingTabs = Array.from(this.tabs.keys());
      this.activeTabId = remainingTabs[0];
      const newActiveTab = this.tabs.get(this.activeTabId);
      if (newActiveTab) {
        newActiveTab.active = true;
      }
    }

    return { success: true };
  }

  /**
   * Switch to a specific tab
   * TAB T=<number>
   */
  switchTo(tabIndex: number): { success: boolean } {
    const tabIds = Array.from(this.tabs.keys());

    if (tabIndex < 1 || tabIndex > tabIds.length) {
      throw new Error(`Invalid tab index: ${tabIndex}`);
    }

    // Deactivate current tab
    const currentTab = this.tabs.get(this.activeTabId);
    if (currentTab) {
      currentTab.active = false;
    }

    // Activate new tab (1-indexed)
    this.activeTabId = tabIds[tabIndex - 1];
    const newActiveTab = this.tabs.get(this.activeTabId);
    if (newActiveTab) {
      newActiveTab.active = true;
    }

    return { success: true };
  }

  /**
   * Get the number of open tabs
   */
  getTabCount(): number {
    return this.tabs.size;
  }

  /**
   * Get active tab ID
   */
  getActiveTabId(): number {
    return this.activeTabId;
  }

  /**
   * Get all tabs
   */
  getAllTabs(): Array<{ id: number; url: string; title: string; active: boolean }> {
    return Array.from(this.tabs.entries()).map(([id, tab]) => ({
      id,
      ...tab,
    }));
  }
}

describe('Navigation Commands Integration Tests', () => {
  describe('URL Command', () => {
    let context: NavigationContext;
    let urlCommand: UrlCommand;

    beforeEach(() => {
      context = createNavigationContext();
      urlCommand = new UrlCommand(context);
    });

    it('should navigate to a URL with GOTO', () => {
      const result = urlCommand.goto('https://example.com');

      expect(result.success).toBe(true);
      expect(result.url).toBe('https://example.com');
      expect(urlCommand.getCurrentUrl()).toBe('https://example.com');
    });

    it('should add https:// prefix when protocol is missing', () => {
      const result = urlCommand.goto('example.com');

      expect(result.success).toBe(true);
      expect(result.url).toBe('https://example.com');
    });

    it('should preserve http:// protocol when specified', () => {
      const result = urlCommand.goto('http://example.com');

      expect(result.success).toBe(true);
      expect(result.url).toBe('http://example.com');
    });

    it('should handle about: URLs', () => {
      const result = urlCommand.goto('about:blank');

      expect(result.success).toBe(true);
      expect(result.url).toBe('about:blank');
    });

    it('should maintain navigation history', () => {
      urlCommand.goto('https://first.com');
      urlCommand.goto('https://second.com');
      urlCommand.goto('https://third.com');

      expect(context.history).toEqual([
        'about:blank',
        'https://first.com',
        'https://second.com',
        'https://third.com',
      ]);
    });

    it('should throw error for empty URL', () => {
      expect(() => urlCommand.goto('')).toThrow('URL GOTO requires a valid URL');
    });

    it('should throw error for invalid URL type', () => {
      expect(() => urlCommand.goto(null as unknown as string)).toThrow(
        'URL GOTO requires a valid URL'
      );
    });

    it('should handle URLs with query parameters', () => {
      const result = urlCommand.goto('https://example.com/search?q=test&page=1');

      expect(result.success).toBe(true);
      expect(result.url).toBe('https://example.com/search?q=test&page=1');
    });

    it('should handle URLs with hash fragments', () => {
      const result = urlCommand.goto('https://example.com/page#section');

      expect(result.success).toBe(true);
      expect(result.url).toBe('https://example.com/page#section');
    });

    it('should handle URLs with special characters', () => {
      const result = urlCommand.goto('https://example.com/path%20with%20spaces');

      expect(result.success).toBe(true);
      expect(result.url).toBe('https://example.com/path%20with%20spaces');
    });
  });

  describe('TAB Command', () => {
    let tabCommand: TabCommand;

    beforeEach(() => {
      tabCommand = new TabCommand();
    });

    it('should start with one tab', () => {
      expect(tabCommand.getTabCount()).toBe(1);
    });

    it('should open a new tab', () => {
      const result = tabCommand.open();

      expect(result.success).toBe(true);
      expect(result.tabId).toBe(2);
      expect(tabCommand.getTabCount()).toBe(2);
    });

    it('should open a new tab with a URL', () => {
      const result = tabCommand.open('https://example.com');

      expect(result.success).toBe(true);
      const tabs = tabCommand.getAllTabs();
      const newTab = tabs.find((t) => t.id === result.tabId);
      expect(newTab?.url).toBe('https://example.com');
    });

    it('should make the new tab active', () => {
      tabCommand.open();

      const tabs = tabCommand.getAllTabs();
      const activeTab = tabs.find((t) => t.active);

      expect(activeTab?.id).toBe(2);
    });

    it('should close a tab', () => {
      tabCommand.open();
      expect(tabCommand.getTabCount()).toBe(2);

      const result = tabCommand.close();

      expect(result.success).toBe(true);
      expect(tabCommand.getTabCount()).toBe(1);
    });

    it('should close a specific tab by ID', () => {
      const { tabId } = tabCommand.open();
      tabCommand.open();
      expect(tabCommand.getTabCount()).toBe(3);

      const result = tabCommand.close(tabId);

      expect(result.success).toBe(true);
      expect(tabCommand.getTabCount()).toBe(2);
    });

    it('should throw error when closing last tab', () => {
      expect(() => tabCommand.close()).toThrow('Cannot close the last tab');
    });

    it('should throw error when closing non-existent tab', () => {
      expect(() => tabCommand.close(999)).toThrow('Tab 999 does not exist');
    });

    it('should switch to a specific tab', () => {
      tabCommand.open();
      tabCommand.open();
      expect(tabCommand.getActiveTabId()).toBe(3);

      const result = tabCommand.switchTo(1);

      expect(result.success).toBe(true);
      expect(tabCommand.getActiveTabId()).toBe(1);
    });

    it('should throw error for invalid tab index', () => {
      expect(() => tabCommand.switchTo(0)).toThrow('Invalid tab index: 0');
      expect(() => tabCommand.switchTo(5)).toThrow('Invalid tab index: 5');
    });

    it('should handle multiple tab operations in sequence', () => {
      // Open several tabs
      tabCommand.open('https://tab2.com');
      tabCommand.open('https://tab3.com');
      tabCommand.open('https://tab4.com');

      expect(tabCommand.getTabCount()).toBe(4);

      // Switch to first tab
      tabCommand.switchTo(1);
      expect(tabCommand.getActiveTabId()).toBe(1);

      // Close second tab
      const tabs = tabCommand.getAllTabs();
      tabCommand.close(tabs[1].id);
      expect(tabCommand.getTabCount()).toBe(3);

      // Verify remaining tabs
      const remainingTabs = tabCommand.getAllTabs();
      expect(remainingTabs.length).toBe(3);
    });

    it('should activate another tab when active tab is closed', () => {
      tabCommand.open();
      tabCommand.open();

      const activeId = tabCommand.getActiveTabId();
      tabCommand.close(activeId);

      // Should have switched to another tab
      const newActiveId = tabCommand.getActiveTabId();
      expect(newActiveId).not.toBe(activeId);

      const tabs = tabCommand.getAllTabs();
      const activeTab = tabs.find((t) => t.id === newActiveId);
      expect(activeTab?.active).toBe(true);
    });
  });

  describe('URL and TAB Integration', () => {
    let context: NavigationContext;
    let urlCommand: UrlCommand;
    let tabCommand: TabCommand;

    beforeEach(() => {
      context = createNavigationContext();
      urlCommand = new UrlCommand(context);
      tabCommand = new TabCommand();
    });

    it('should navigate in a new tab', () => {
      // Open new tab
      const tabResult = tabCommand.open();
      expect(tabResult.success).toBe(true);

      // Navigate in the new tab
      const urlResult = urlCommand.goto('https://example.com');
      expect(urlResult.success).toBe(true);
    });

    it('should handle navigation across multiple tabs', () => {
      // Navigate in first tab
      urlCommand.goto('https://first-tab.com');

      // Open second tab and navigate
      tabCommand.open();
      urlCommand.goto('https://second-tab.com');

      // Open third tab and navigate
      tabCommand.open();
      urlCommand.goto('https://third-tab.com');

      // Verify tab count
      expect(tabCommand.getTabCount()).toBe(3);

      // Verify navigation history
      expect(context.history).toContain('https://first-tab.com');
      expect(context.history).toContain('https://second-tab.com');
      expect(context.history).toContain('https://third-tab.com');
    });
  });
});

/**
 * URL Command Handler Integration Tests via MacroExecutor
 *
 * Tests the real urlHandler from navigation.ts through the MacroExecutor
 * pipeline with a mock BrowserBridge. This verifies that URL GOTO navigates
 * via the bridge (background.ts tab API) and URL CURRENT stores the page
 * URL in !URLCURRENT.
 */
describe('URL Handler via MacroExecutor (with mock BrowserBridge)', () => {
  let executor: MacroExecutor;
  let mockBridge: BrowserBridge;
  let sentMessages: BrowserOperationMessage[];

  beforeEach(() => {
    sentMessages = [];

    // Create a mock BrowserBridge that records messages and returns success
    mockBridge = {
      sendMessage: vi.fn(async (message: BrowserOperationMessage): Promise<BrowserOperationResponse> => {
        sentMessages.push(message);

        if (message.type === 'navigate') {
          return { success: true };
        }

        if (message.type === 'getCurrentUrl') {
          return {
            success: true,
            data: { url: 'https://current-page.example.com/path' },
          };
        }

        return { success: true };
      }),
    };

    setBrowserBridge(mockBridge);

    executor = createExecutor();
    registerNavigationHandlers(executor);
  });

  afterEach(() => {
    // Clear the bridge so it does not leak between tests
    setBrowserBridge(null as unknown as BrowserBridge);
  });

  it('URL GOTO=<url> sends navigate message via BrowserBridge and sets !URLCURRENT', async () => {
    executor.loadMacro('URL GOTO=https://example.com');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    // Verify the bridge received a navigate message
    expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    const msg = sentMessages[0];
    expect(msg.type).toBe('navigate');
    expect((msg as { url: string }).url).toBe('https://example.com');

    // Verify !URLCURRENT is stored
    expect(result.variables['!URLCURRENT']).toBe('https://example.com');
  });

  it('URL GOTO with variable expansion resolves variable before navigating', async () => {
    const script = [
      'SET !VAR1 https://expanded.example.com',
      'URL GOTO={{!VAR1}}',
    ].join('\n');

    executor.loadMacro(script);
    const result = await executor.execute();

    expect(result.success).toBe(true);

    // The bridge should have received the expanded URL
    const navigateMsg = sentMessages.find(m => m.type === 'navigate');
    expect(navigateMsg).toBeDefined();
    expect((navigateMsg as { url: string }).url).toBe('https://expanded.example.com');

    // !URLCURRENT should contain the expanded URL
    expect(result.variables['!URLCURRENT']).toBe('https://expanded.example.com');
  });

  it('URL CURRENT sends getCurrentUrl message and stores result in !URLCURRENT', async () => {
    executor.loadMacro('URL CURRENT');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    // Verify the bridge received a getCurrentUrl message
    expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    const msg = sentMessages[0];
    expect(msg.type).toBe('getCurrentUrl');

    // Verify !URLCURRENT is stored with the bridge response data
    expect(result.variables['!URLCURRENT']).toBe('https://current-page.example.com/path');
  });

  it('URL without GOTO or CURRENT returns MISSING_PARAMETER error', async () => {
    executor.loadMacro('URL');
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    expect(result.errorMessage).toMatch(/GOTO|CURRENT/i);

    // The bridge should NOT have been called
    expect(mockBridge.sendMessage).not.toHaveBeenCalled();
  });

  it('URL GOTO returns PAGE_TIMEOUT error when bridge returns failure', async () => {
    // Override the mock to return failure for navigate
    (mockBridge.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: 'Connection timed out',
    });

    executor.loadMacro('URL GOTO=https://unreachable.example.com');
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.PAGE_TIMEOUT);
    expect(result.errorMessage).toContain('Connection timed out');
  });

  it('URL CURRENT returns SCRIPT_ERROR when bridge returns failure', async () => {
    // Override the mock to return failure for getCurrentUrl
    (mockBridge.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: 'Tab not available',
    });

    executor.loadMacro('URL CURRENT');
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('Tab not available');
  });

  it('URL GOTO followed by URL CURRENT updates !URLCURRENT for both', async () => {
    const navigatedUrl = 'https://navigated.example.com';
    const currentUrl = 'https://current-after-nav.example.com';

    // Replace the bridge with a custom one that tracks messages and returns
    // different responses for navigate vs getCurrentUrl
    const localMessages: BrowserOperationMessage[] = [];
    const localBridge: BrowserBridge = {
      sendMessage: vi.fn(async (message: BrowserOperationMessage): Promise<BrowserOperationResponse> => {
        localMessages.push(message);
        if (message.type === 'navigate') {
          return { success: true };
        }
        if (message.type === 'getCurrentUrl') {
          return { success: true, data: { url: currentUrl } };
        }
        return { success: true };
      }),
    };
    setBrowserBridge(localBridge);

    const script = [
      `URL GOTO=${navigatedUrl}`,
      'URL CURRENT',
    ].join('\n');

    executor.loadMacro(script);
    const result = await executor.execute();

    expect(result.success).toBe(true);

    // Both navigate and getCurrentUrl should have been sent
    expect(localMessages.length).toBe(2);
    expect(localMessages[0].type).toBe('navigate');
    expect(localMessages[1].type).toBe('getCurrentUrl');

    // !URLCURRENT should reflect the URL CURRENT result (last write wins)
    expect(result.variables['!URLCURRENT']).toBe(currentUrl);
  });

  it('URL GOTO with bridge exception is caught and reported as failure', async () => {
    // Override the mock to throw an error
    (mockBridge.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Bridge disconnected')
    );

    executor.loadMacro('URL GOTO=https://example.com');
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.PAGE_TIMEOUT);
    expect(result.errorMessage).toContain('Bridge disconnected');
  });
});

/**
 * BACK and REFRESH Command Handler Integration Tests via MacroExecutor
 *
 * Tests the backHandler and refreshHandler from navigation.ts through the
 * MacroExecutor pipeline with a mock BrowserBridge. BACK sends a 'goBack'
 * message to navigate browser history. REFRESH sends a 'refresh' message
 * to reload the current page.
 */
describe('BACK and REFRESH Handlers via MacroExecutor (with mock BrowserBridge)', () => {
  let executor: MacroExecutor;
  let mockBridge: BrowserBridge;
  let sentMessages: BrowserOperationMessage[];

  beforeEach(() => {
    sentMessages = [];

    // Create a mock BrowserBridge that records messages and returns success
    mockBridge = {
      sendMessage: vi.fn(async (message: BrowserOperationMessage): Promise<BrowserOperationResponse> => {
        sentMessages.push(message);
        return { success: true };
      }),
    };

    setBrowserBridge(mockBridge);

    executor = createExecutor();
    registerNavigationHandlers(executor);
  });

  afterEach(() => {
    // Clear the bridge so it does not leak between tests
    setBrowserBridge(null as unknown as BrowserBridge);
  });

  // --- BACK command tests ---

  it('BACK sends goBack message via BrowserBridge and succeeds', async () => {
    executor.loadMacro('BACK');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    // Verify the bridge received a goBack message
    expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    const msg = sentMessages[0];
    expect(msg.type).toBe('goBack');
    // Verify message has required id and timestamp fields
    expect(msg.id).toBeDefined();
    expect(msg.timestamp).toBeGreaterThan(0);
  });

  it('BACK returns SCRIPT_ERROR when bridge returns failure', async () => {
    (mockBridge.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: 'No history entries available',
    });

    executor.loadMacro('BACK');
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('No history entries available');
  });

  it('BACK returns SCRIPT_ERROR when bridge throws an exception', async () => {
    (mockBridge.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Bridge connection lost')
    );

    executor.loadMacro('BACK');
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('Bridge connection lost');
  });

  // --- REFRESH command tests ---

  it('REFRESH sends refresh message via BrowserBridge and succeeds', async () => {
    executor.loadMacro('REFRESH');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    // Verify the bridge received a refresh message
    expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    const msg = sentMessages[0];
    expect(msg.type).toBe('refresh');
    // Verify message has required id and timestamp fields
    expect(msg.id).toBeDefined();
    expect(msg.timestamp).toBeGreaterThan(0);
  });

  it('REFRESH returns SCRIPT_ERROR when bridge returns failure', async () => {
    (mockBridge.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: 'Page reload blocked by policy',
    });

    executor.loadMacro('REFRESH');
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('Page reload blocked by policy');
  });

  it('REFRESH returns SCRIPT_ERROR when bridge throws an exception', async () => {
    (mockBridge.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Extension context invalidated')
    );

    executor.loadMacro('REFRESH');
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('Extension context invalidated');
  });

  // --- Sequence tests ---

  it('URL GOTO followed by BACK sends navigate then goBack messages in order', async () => {
    const script = [
      'URL GOTO=https://example.com/page1',
      'BACK',
    ].join('\n');

    executor.loadMacro(script);
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    // Both messages should have been sent in order
    expect(sentMessages.length).toBe(2);
    expect(sentMessages[0].type).toBe('navigate');
    expect((sentMessages[0] as { url: string }).url).toBe('https://example.com/page1');
    expect(sentMessages[1].type).toBe('goBack');
  });

  it('URL GOTO followed by REFRESH sends navigate then refresh messages in order', async () => {
    const script = [
      'URL GOTO=https://example.com/dashboard',
      'REFRESH',
    ].join('\n');

    executor.loadMacro(script);
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    // Both messages should have been sent in order
    expect(sentMessages.length).toBe(2);
    expect(sentMessages[0].type).toBe('navigate');
    expect((sentMessages[0] as { url: string }).url).toBe('https://example.com/dashboard');
    expect(sentMessages[1].type).toBe('refresh');
  });

  it('URL GOTO + BACK + REFRESH executes all three commands in sequence', async () => {
    const script = [
      'URL GOTO=https://example.com/start',
      'BACK',
      'REFRESH',
    ].join('\n');

    executor.loadMacro(script);
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    // All three messages should have been sent in order
    expect(sentMessages.length).toBe(3);
    expect(sentMessages[0].type).toBe('navigate');
    expect((sentMessages[0] as { url: string }).url).toBe('https://example.com/start');
    expect(sentMessages[1].type).toBe('goBack');
    expect(sentMessages[2].type).toBe('refresh');
  });

  it('multi-step navigation: two GOTOs then BACK then REFRESH', async () => {
    const script = [
      'URL GOTO=https://example.com/page1',
      'URL GOTO=https://example.com/page2',
      'BACK',
      'REFRESH',
    ].join('\n');

    executor.loadMacro(script);
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    expect(sentMessages.length).toBe(4);
    expect(sentMessages[0].type).toBe('navigate');
    expect((sentMessages[0] as { url: string }).url).toBe('https://example.com/page1');
    expect(sentMessages[1].type).toBe('navigate');
    expect((sentMessages[1] as { url: string }).url).toBe('https://example.com/page2');
    expect(sentMessages[2].type).toBe('goBack');
    expect(sentMessages[3].type).toBe('refresh');
  });

  it('BACK failure in a sequence stops execution (errorIgnore off)', async () => {
    // First call (navigate) succeeds, second call (goBack) fails
    // Use mockImplementationOnce so that sentMessages is still populated
    (mockBridge.sendMessage as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(async (msg: BrowserOperationMessage) => {
        sentMessages.push(msg);
        return { success: true };
      })
      .mockImplementationOnce(async (msg: BrowserOperationMessage) => {
        sentMessages.push(msg);
        return { success: false, error: 'Cannot go back' };
      });

    const script = [
      'URL GOTO=https://example.com',
      'BACK',
      'REFRESH',
    ].join('\n');

    executor.loadMacro(script);
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('Cannot go back');

    // REFRESH should NOT have been called since BACK failed and errorIgnore is off
    expect(sentMessages.length).toBe(2);
    expect(sentMessages[0].type).toBe('navigate');
    expect(sentMessages[1].type).toBe('goBack');
  });
});

/**
 * FRAME Command Handler Integration Tests via MacroExecutor
 *
 * Tests the frameHandler from navigation.ts through the MacroExecutor
 * pipeline with a mock BrowserBridge. FRAME F=n selects a frame by index
 * (0 = main document). FRAME NAME=x selects a frame by name. Both send
 * a 'selectFrame' message to the browser bridge.
 */
describe('FRAME Handler via MacroExecutor (with mock BrowserBridge)', () => {
  let executor: MacroExecutor;
  let mockBridge: BrowserBridge;
  let sentMessages: BrowserOperationMessage[];

  beforeEach(() => {
    sentMessages = [];

    // Create a mock BrowserBridge that records messages and returns success
    mockBridge = {
      sendMessage: vi.fn(async (message: BrowserOperationMessage): Promise<BrowserOperationResponse> => {
        sentMessages.push(message);
        return { success: true };
      }),
    };

    setBrowserBridge(mockBridge);

    executor = createExecutor();
    registerNavigationHandlers(executor);
  });

  afterEach(() => {
    // Clear the bridge so it does not leak between tests
    setBrowserBridge(null as unknown as BrowserBridge);
  });

  // --- FRAME F=n tests ---

  it('FRAME F=1 sends selectFrame with frameIndex=1 and succeeds', async () => {
    executor.loadMacro('FRAME F=1');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    // Verify the bridge received a selectFrame message with frameIndex=1
    expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    const msg = sentMessages[0];
    expect(msg.type).toBe('selectFrame');
    expect((msg as { frameIndex?: number }).frameIndex).toBe(1);
  });

  it('FRAME F=0 sends selectFrame with frameIndex=0 (main document) and succeeds', async () => {
    executor.loadMacro('FRAME F=0');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    // Verify the bridge received a selectFrame message with frameIndex=0
    expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    const msg = sentMessages[0];
    expect(msg.type).toBe('selectFrame');
    expect((msg as { frameIndex?: number }).frameIndex).toBe(0);
  });

  it('FRAME F=3 sends selectFrame with frameIndex=3', async () => {
    executor.loadMacro('FRAME F=3');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    const msg = sentMessages[0];
    expect(msg.type).toBe('selectFrame');
    expect((msg as { frameIndex?: number }).frameIndex).toBe(3);
  });

  it('FRAME F with variable expansion (SET !VAR1 2, FRAME F={{!VAR1}})', async () => {
    const script = [
      'SET !VAR1 2',
      'FRAME F={{!VAR1}}',
    ].join('\n');

    executor.loadMacro(script);
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    // The bridge should have received selectFrame with the expanded value
    expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    const msg = sentMessages[0];
    expect(msg.type).toBe('selectFrame');
    expect((msg as { frameIndex?: number }).frameIndex).toBe(2);
  });

  it('FRAME F=-1 returns INVALID_PARAMETER error', async () => {
    executor.loadMacro('FRAME F=-1');
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    expect(result.errorMessage).toMatch(/invalid frame index/i);

    // The bridge should NOT have been called
    expect(mockBridge.sendMessage).not.toHaveBeenCalled();
  });

  it('FRAME F=abc returns INVALID_PARAMETER error (NaN)', async () => {
    executor.loadMacro('FRAME F=abc');
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    expect(result.errorMessage).toMatch(/invalid frame index/i);

    // The bridge should NOT have been called
    expect(mockBridge.sendMessage).not.toHaveBeenCalled();
  });

  // --- FRAME NAME=x tests ---

  it('FRAME NAME=myframe sends selectFrame with frameName and succeeds', async () => {
    executor.loadMacro('FRAME NAME=myframe');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    // Verify the bridge received a selectFrame message with frameName
    expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    const msg = sentMessages[0];
    expect(msg.type).toBe('selectFrame');
    expect((msg as { frameName?: string }).frameName).toBe('myframe');
  });

  it('FRAME NAME with variable expansion (SET !VAR1 sidebar, FRAME NAME={{!VAR1}})', async () => {
    const script = [
      'SET !VAR1 sidebar',
      'FRAME NAME={{!VAR1}}',
    ].join('\n');

    executor.loadMacro(script);
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    // The bridge should have received selectFrame with the expanded name
    expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    const msg = sentMessages[0];
    expect(msg.type).toBe('selectFrame');
    expect((msg as { frameName?: string }).frameName).toBe('sidebar');
  });

  // --- Missing parameter test ---

  it('FRAME without F or NAME returns MISSING_PARAMETER error', async () => {
    executor.loadMacro('FRAME');
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    expect(result.errorMessage).toMatch(/F|NAME/i);

    // The bridge should NOT have been called
    expect(mockBridge.sendMessage).not.toHaveBeenCalled();
  });

  // --- Bridge failure tests ---

  it('FRAME F=1 bridge failure returns FRAME_NOT_FOUND error', async () => {
    // Always return failure for selectFrame (retry will keep trying)
    (mockBridge.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: 'Frame at index 1 does not exist',
    });

    // Disable retry timeout to avoid waiting
    executor.loadMacro('SET !TIMEOUT_STEP 0\nFRAME F=1');
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.FRAME_NOT_FOUND);
    expect(result.errorMessage).toContain('Frame at index 1 does not exist');
  });

  it('FRAME NAME=missing bridge failure returns FRAME_NOT_FOUND error', async () => {
    // Always return failure for selectFrame (retry will keep trying)
    (mockBridge.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: 'No frame with name "missing"',
    });

    // Disable retry timeout to avoid waiting
    executor.loadMacro('SET !TIMEOUT_STEP 0\nFRAME NAME=missing');
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.FRAME_NOT_FOUND);
    expect(result.errorMessage).toContain('No frame with name "missing"');
  });

  it('FRAME F=1 resets to main frame on failure', async () => {
    // Track all messages to verify reset
    const allMessages: BrowserOperationMessage[] = [];
    (mockBridge.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      async (message: BrowserOperationMessage) => {
        allMessages.push(message);
        // selectFrame with frameIndex 0 (reset) succeeds, others fail
        if (message.type === 'selectFrame' && (message as any).frameIndex === 0) {
          return { success: true };
        }
        return { success: false, error: 'Frame not found' };
      }
    );

    executor.loadMacro('SET !TIMEOUT_STEP 0\nFRAME F=1');
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.FRAME_NOT_FOUND);

    // Should have sent selectFrame(1) then selectFrame(0) for reset
    const selectFrameMsgs = allMessages.filter(m => m.type === 'selectFrame');
    expect(selectFrameMsgs.length).toBe(2);
    expect((selectFrameMsgs[0] as any).frameIndex).toBe(1);
    expect((selectFrameMsgs[1] as any).frameIndex).toBe(0);
  });

  it('FRAME retries until timeout before failing', async () => {
    let callCount = 0;
    (mockBridge.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      async (message: BrowserOperationMessage) => {
        callCount++;
        // Succeed on 3rd call (2nd retry)
        if (message.type === 'selectFrame' && callCount >= 3) {
          return { success: true };
        }
        return { success: false, error: 'Frame not ready' };
      }
    );

    // Set short timeout for test speed
    executor.loadMacro('SET !TIMEOUT_STEP 2\nFRAME F=1');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    expect(callCount).toBeGreaterThanOrEqual(3);
  });

  // --- Multi-command sequence test ---

  it('URL GOTO then FRAME F=1 sends navigate then selectFrame in order', async () => {
    const script = [
      'URL GOTO=https://example.com/frameset',
      'FRAME F=1',
    ].join('\n');

    executor.loadMacro(script);
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    // Both messages should have been sent in order
    expect(sentMessages.length).toBe(2);
    expect(sentMessages[0].type).toBe('navigate');
    expect((sentMessages[0] as { url: string }).url).toBe('https://example.com/frameset');
    expect(sentMessages[1].type).toBe('selectFrame');
    expect((sentMessages[1] as { frameIndex?: number }).frameIndex).toBe(1);
  });
});

/**
 * TAB Command Handler Integration Tests via MacroExecutor
 *
 * Tests the tabHandler from navigation.ts through the MacroExecutor pipeline
 * with a mock BrowserBridge. TAB supports switching tabs (T=n), opening new
 * tabs (OPEN), closing the current tab (CLOSE), and closing all other tabs
 * (CLOSEALLOTHERS).
 */
describe('TAB Handler via MacroExecutor (with mock BrowserBridge)', () => {
  let executor: MacroExecutor;
  let mockBridge: BrowserBridge;
  let sentMessages: BrowserOperationMessage[];

  beforeEach(() => {
    sentMessages = [];
    mockBridge = {
      sendMessage: vi.fn(async (message: BrowserOperationMessage): Promise<BrowserOperationResponse> => {
        sentMessages.push(message);
        return { success: true };
      }),
    };
    setBrowserBridge(mockBridge);
    executor = createExecutor();
    registerNavigationHandlers(executor);
  });

  afterEach(() => {
    setBrowserBridge(null as unknown as BrowserBridge);
  });

  // --- TAB T=n (switch tab) tests ---

  it('TAB T=2 sends switchTab with tabIndex 1 (0-based) and succeeds', async () => {
    executor.loadMacro('TAB T=2');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    const msg = sentMessages[0];
    expect(msg.type).toBe('switchTab');
    expect((msg as { tabIndex: number }).tabIndex).toBe(1);
    expect(msg.id).toBeDefined();
    expect(msg.timestamp).toBeGreaterThan(0);
  });

  it('TAB T=1 sends switchTab with tabIndex 0', async () => {
    executor.loadMacro('TAB T=1');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    const msg = sentMessages[0];
    expect(msg.type).toBe('switchTab');
    expect((msg as { tabIndex: number }).tabIndex).toBe(0);
  });

  it('TAB T with variable expansion (SET !VAR1 3, TAB T={{!VAR1}}) sends switchTab with tabIndex 2', async () => {
    const script = [
      'SET !VAR1 3',
      'TAB T={{!VAR1}}',
    ].join('\n');

    executor.loadMacro(script);
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    // Only the TAB command should have sent a bridge message (SET is handled internally)
    const switchMsg = sentMessages.find(m => m.type === 'switchTab');
    expect(switchMsg).toBeDefined();
    expect((switchMsg as { tabIndex: number }).tabIndex).toBe(2);
  });

  // --- TAB T=n invalid parameter tests ---

  it('TAB T=0 returns INVALID_PARAMETER error (tabIndex < 1)', async () => {
    executor.loadMacro('TAB T=0');
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);

    // The bridge should NOT have been called
    expect(mockBridge.sendMessage).not.toHaveBeenCalled();
  });

  it('TAB T=-1 returns INVALID_PARAMETER error', async () => {
    executor.loadMacro('TAB T=-1');
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);

    expect(mockBridge.sendMessage).not.toHaveBeenCalled();
  });

  it('TAB T=abc returns INVALID_PARAMETER error (NaN)', async () => {
    executor.loadMacro('TAB T=abc');
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);

    expect(mockBridge.sendMessage).not.toHaveBeenCalled();
  });

  // --- TAB OPEN tests ---

  it('TAB OPEN sends openTab message and succeeds', async () => {
    executor.loadMacro('TAB OPEN');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    const msg = sentMessages[0];
    expect(msg.type).toBe('openTab');
    expect(msg.id).toBeDefined();
    expect(msg.timestamp).toBeGreaterThan(0);
  });

  it('TAB OPEN with URL param sends openTab with url', async () => {
    executor.loadMacro('TAB OPEN URL=https://example.com/new-tab');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    const msg = sentMessages[0];
    expect(msg.type).toBe('openTab');
    expect((msg as { url?: string }).url).toBe('https://example.com/new-tab');
  });

  // --- TAB CLOSE tests ---

  it('TAB CLOSE sends closeTab message and succeeds', async () => {
    executor.loadMacro('TAB CLOSE');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    const msg = sentMessages[0];
    expect(msg.type).toBe('closeTab');
    expect(msg.id).toBeDefined();
    expect(msg.timestamp).toBeGreaterThan(0);
  });

  // --- TAB CLOSEALLOTHERS tests ---

  it('TAB CLOSEALLOTHERS sends closeOtherTabs message and succeeds', async () => {
    executor.loadMacro('TAB CLOSEALLOTHERS');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    expect(mockBridge.sendMessage).toHaveBeenCalledTimes(1);
    const msg = sentMessages[0];
    expect(msg.type).toBe('closeOtherTabs');
    expect(msg.id).toBeDefined();
    expect(msg.timestamp).toBeGreaterThan(0);
  });

  // --- Missing parameter test ---

  it('TAB without params returns MISSING_PARAMETER error', async () => {
    executor.loadMacro('TAB');
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    expect(result.errorMessage).toMatch(/T|OPEN|CLOSE|CLOSEALLOTHERS/i);

    // The bridge should NOT have been called
    expect(mockBridge.sendMessage).not.toHaveBeenCalled();
  });

  // --- Bridge failure tests ---

  it('TAB T=2 bridge failure returns SCRIPT_ERROR', async () => {
    (mockBridge.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: 'Tab 2 does not exist',
    });

    executor.loadMacro('TAB T=2');
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('Tab 2 does not exist');
  });

  it('TAB OPEN bridge failure returns SCRIPT_ERROR', async () => {
    (mockBridge.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: 'Cannot open new tab',
    });

    executor.loadMacro('TAB OPEN');
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('Cannot open new tab');
  });

  it('TAB CLOSE bridge failure returns SCRIPT_ERROR', async () => {
    (mockBridge.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: 'Cannot close the last tab',
    });

    executor.loadMacro('TAB CLOSE');
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    expect(result.errorMessage).toContain('Cannot close the last tab');
  });

  // --- Multi-command sequence test ---

  it('TAB OPEN then TAB T=1 sends openTab then switchTab in order', async () => {
    const script = [
      'TAB OPEN',
      'TAB T=1',
    ].join('\n');

    executor.loadMacro(script);
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

    expect(sentMessages.length).toBe(2);
    expect(sentMessages[0].type).toBe('openTab');
    expect(sentMessages[1].type).toBe('switchTab');
    expect((sentMessages[1] as { tabIndex: number }).tabIndex).toBe(0);
  });
});
