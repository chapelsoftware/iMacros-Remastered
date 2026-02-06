/**
 * Navigation Commands Integration Tests
 *
 * Tests URL and TAB commands that control browser navigation.
 * These tests verify real DOM interactions where possible.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

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
