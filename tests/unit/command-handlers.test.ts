/**
 * Comprehensive unit tests for native-host/src/command-handlers.js
 *
 * Tests all exported handlers from createBrowserHandlers(bridge) and
 * exercises helper functions (parsePos, parseModifiers, parsePoint,
 * processContent) indirectly through the handlers that use them.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createBrowserHandlers, ERROR_CODES } = require('../../native-host/src/command-handlers');

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockBridge() {
  return {
    navigate: vi.fn().mockResolvedValue(undefined),
    getCurrentUrl: vi.fn().mockResolvedValue('https://example.com'),
    goBack: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    openTab: vi.fn().mockResolvedValue(undefined),
    closeTab: vi.fn().mockResolvedValue(undefined),
    closeOtherTabs: vi.fn().mockResolvedValue(undefined),
    switchTab: vi.fn().mockResolvedValue(undefined),
    selectFrame: vi.fn().mockResolvedValue(undefined),
    selectFrameByName: vi.fn().mockResolvedValue(undefined),
    executeTag: vi.fn().mockResolvedValue({ success: true }),
    executeClick: vi.fn().mockResolvedValue({ success: true }),
    executeEvent: vi.fn().mockResolvedValue({ success: true }),
  };
}

/**
 * Build a mock context object.
 * @param params - Array of { key, value } parameter objects. Bare keywords
 *   like CURRENT or OPEN can be passed as { key: 'CURRENT' } (no value).
 * @param stateOverrides - Optional overrides for getVariable.
 */
function createMockCtx(
  params: { key: string; value?: string }[] = [],
  stateOverrides: Record<string, unknown> = {},
) {
  const variables: Record<string, unknown> = { ...stateOverrides };
  const extracts: unknown[] = [];

  return {
    command: { parameters: params },
    getParam(key: string): string | undefined {
      const found = params.find(p => p.key.toUpperCase() === key.toUpperCase());
      return found?.value;
    },
    expand(value: string): string {
      // Identity expansion for tests
      return value;
    },
    state: {
      getVariable: vi.fn((name: string) => variables[name]),
      setVariable: vi.fn((name: string, value: unknown) => {
        variables[name] = value;
      }),
      addExtract: vi.fn((value: unknown) => {
        extracts.push(value);
      }),
      _variables: variables,
      _extracts: extracts,
    },
    log: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('command-handlers', () => {
  let bridge: ReturnType<typeof createMockBridge>;
  let handlers: ReturnType<typeof createBrowserHandlers>;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = createMockBridge();
    handlers = createBrowserHandlers(bridge);
  });

  // =========================================================================
  // ERROR_CODES
  // =========================================================================

  describe('ERROR_CODES', () => {
    it('exports expected error code constants', () => {
      expect(ERROR_CODES.OK).toBe(0);
      expect(ERROR_CODES.ELEMENT_NOT_FOUND).toBe(-920);
      expect(ERROR_CODES.ELEMENT_NOT_VISIBLE).toBe(-921);
      expect(ERROR_CODES.FRAME_NOT_FOUND).toBe(-922);
      expect(ERROR_CODES.ELEMENT_NOT_ENABLED).toBe(-924);
      expect(ERROR_CODES.TIMEOUT).toBe(-930);
      expect(ERROR_CODES.PAGE_TIMEOUT).toBe(-931);
      expect(ERROR_CODES.SCRIPT_ERROR).toBe(-970);
      expect(ERROR_CODES.MISSING_PARAMETER).toBe(-913);
      expect(ERROR_CODES.INVALID_PARAMETER).toBe(-912);
    });
  });

  // =========================================================================
  // URL handler
  // =========================================================================

  describe('URL handler', () => {
    it('GOTO navigates to the given URL', async () => {
      const ctx = createMockCtx([{ key: 'GOTO', value: 'https://example.com' }]);
      const result = await handlers.URL(ctx);

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(ERROR_CODES.OK);
      expect(bridge.navigate).toHaveBeenCalledWith('https://example.com');
    });

    it('GOTO sets !URLCURRENT after navigation', async () => {
      const ctx = createMockCtx([{ key: 'GOTO', value: 'https://example.com/page' }]);
      await handlers.URL(ctx);

      expect(ctx.state.setVariable).toHaveBeenCalledWith('!URLCURRENT', 'https://example.com/page');
    });

    it('CURRENT gets the current URL and stores it in !URLCURRENT', async () => {
      bridge.getCurrentUrl.mockResolvedValue('https://current.page/path');
      const ctx = createMockCtx([{ key: 'CURRENT' }]);
      const result = await handlers.URL(ctx);

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(ERROR_CODES.OK);
      expect(result.output).toBe('https://current.page/path');
      expect(bridge.getCurrentUrl).toHaveBeenCalled();
      expect(ctx.state.setVariable).toHaveBeenCalledWith('!URLCURRENT', 'https://current.page/path');
    });

    it('returns MISSING_PARAMETER when neither GOTO nor CURRENT is provided', async () => {
      const ctx = createMockCtx([]);
      const result = await handlers.URL(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.MISSING_PARAMETER);
      expect(result.errorMessage).toContain('GOTO');
      expect(result.errorMessage).toContain('CURRENT');
    });

    it('returns PAGE_TIMEOUT when bridge.navigate throws', async () => {
      bridge.navigate.mockRejectedValue(new Error('Network error'));
      const ctx = createMockCtx([{ key: 'GOTO', value: 'https://fail.com' }]);
      const result = await handlers.URL(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.PAGE_TIMEOUT);
      expect(result.errorMessage).toBe('Network error');
    });

    it('returns SCRIPT_ERROR when bridge.getCurrentUrl throws', async () => {
      bridge.getCurrentUrl.mockRejectedValue(new Error('Tab crashed'));
      const ctx = createMockCtx([{ key: 'CURRENT' }]);
      const result = await handlers.URL(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toBe('Tab crashed');
    });

    it('uses a default error message when bridge.navigate throws without message', async () => {
      bridge.navigate.mockRejectedValue({});
      const ctx = createMockCtx([{ key: 'GOTO', value: 'https://fail.com' }]);
      const result = await handlers.URL(ctx);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Failed to navigate');
    });

    it('uses a default error message when bridge.getCurrentUrl throws without message', async () => {
      bridge.getCurrentUrl.mockRejectedValue({});
      const ctx = createMockCtx([{ key: 'CURRENT' }]);
      const result = await handlers.URL(ctx);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Failed to get current URL');
    });
  });

  // =========================================================================
  // BACK handler
  // =========================================================================

  describe('BACK handler', () => {
    it('calls bridge.goBack and returns success', async () => {
      const ctx = createMockCtx();
      const result = await handlers.BACK(ctx);

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(ERROR_CODES.OK);
      expect(bridge.goBack).toHaveBeenCalled();
    });

    it('returns SCRIPT_ERROR when bridge.goBack throws', async () => {
      bridge.goBack.mockRejectedValue(new Error('Cannot go back'));
      const ctx = createMockCtx();
      const result = await handlers.BACK(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toBe('Cannot go back');
    });

    it('uses default message when goBack error has no message', async () => {
      bridge.goBack.mockRejectedValue({});
      const ctx = createMockCtx();
      const result = await handlers.BACK(ctx);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Failed to navigate back');
    });
  });

  // =========================================================================
  // REFRESH handler
  // =========================================================================

  describe('REFRESH handler', () => {
    it('calls bridge.refresh and returns success', async () => {
      const ctx = createMockCtx();
      const result = await handlers.REFRESH(ctx);

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(ERROR_CODES.OK);
      expect(bridge.refresh).toHaveBeenCalled();
    });

    it('returns SCRIPT_ERROR when bridge.refresh throws', async () => {
      bridge.refresh.mockRejectedValue(new Error('Refresh failed'));
      const ctx = createMockCtx();
      const result = await handlers.REFRESH(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toBe('Refresh failed');
    });

    it('uses default message when refresh error has no message', async () => {
      bridge.refresh.mockRejectedValue({});
      const ctx = createMockCtx();
      const result = await handlers.REFRESH(ctx);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Failed to refresh');
    });
  });

  // =========================================================================
  // TAB handler
  // =========================================================================

  describe('TAB handler', () => {
    it('T=n switches to the given tab (1-based)', async () => {
      const ctx = createMockCtx([{ key: 'T', value: '3' }]);
      const result = await handlers.TAB(ctx);

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(ERROR_CODES.OK);
      expect(bridge.switchTab).toHaveBeenCalledWith(3);
    });

    it('OPEN opens a new tab without URL', async () => {
      const ctx = createMockCtx([{ key: 'OPEN' }]);
      const result = await handlers.TAB(ctx);

      expect(result.success).toBe(true);
      expect(bridge.openTab).toHaveBeenCalledWith(undefined);
    });

    it('OPEN with URL opens a new tab with that URL', async () => {
      const ctx = createMockCtx([{ key: 'OPEN' }, { key: 'URL', value: 'https://new-tab.com' }]);
      const result = await handlers.TAB(ctx);

      expect(result.success).toBe(true);
      expect(bridge.openTab).toHaveBeenCalledWith('https://new-tab.com');
    });

    it('CLOSE closes the current tab', async () => {
      const ctx = createMockCtx([{ key: 'CLOSE' }]);
      const result = await handlers.TAB(ctx);

      expect(result.success).toBe(true);
      expect(bridge.closeTab).toHaveBeenCalled();
    });

    it('CLOSEALLOTHERS closes all other tabs', async () => {
      const ctx = createMockCtx([{ key: 'CLOSEALLOTHERS' }]);
      const result = await handlers.TAB(ctx);

      expect(result.success).toBe(true);
      expect(bridge.closeOtherTabs).toHaveBeenCalled();
    });

    it('returns INVALID_PARAMETER for T=0', async () => {
      const ctx = createMockCtx([{ key: 'T', value: '0' }]);
      const result = await handlers.TAB(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.INVALID_PARAMETER);
      expect(result.errorMessage).toContain('Invalid tab index');
    });

    it('returns INVALID_PARAMETER for T=-1', async () => {
      const ctx = createMockCtx([{ key: 'T', value: '-1' }]);
      const result = await handlers.TAB(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.INVALID_PARAMETER);
    });

    it('returns INVALID_PARAMETER for T=abc (non-numeric)', async () => {
      const ctx = createMockCtx([{ key: 'T', value: 'abc' }]);
      const result = await handlers.TAB(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.INVALID_PARAMETER);
      expect(result.errorMessage).toContain('abc');
    });

    it('returns MISSING_PARAMETER when no recognized parameter is given', async () => {
      const ctx = createMockCtx([{ key: 'UNKNOWN', value: 'blah' }]);
      const result = await handlers.TAB(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.MISSING_PARAMETER);
    });

    it('returns SCRIPT_ERROR when bridge.switchTab throws', async () => {
      bridge.switchTab.mockRejectedValue(new Error('Tab not found'));
      const ctx = createMockCtx([{ key: 'T', value: '5' }]);
      const result = await handlers.TAB(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toBe('Tab not found');
    });

    it('returns SCRIPT_ERROR when bridge.openTab throws', async () => {
      bridge.openTab.mockRejectedValue(new Error('Cannot open tab'));
      const ctx = createMockCtx([{ key: 'OPEN' }]);
      const result = await handlers.TAB(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.SCRIPT_ERROR);
    });

    it('returns SCRIPT_ERROR when bridge.closeTab throws', async () => {
      bridge.closeTab.mockRejectedValue(new Error('Cannot close last tab'));
      const ctx = createMockCtx([{ key: 'CLOSE' }]);
      const result = await handlers.TAB(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.SCRIPT_ERROR);
    });

    it('returns SCRIPT_ERROR when bridge.closeOtherTabs throws', async () => {
      bridge.closeOtherTabs.mockRejectedValue(new Error('Fail'));
      const ctx = createMockCtx([{ key: 'CLOSEALLOTHERS' }]);
      const result = await handlers.TAB(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.SCRIPT_ERROR);
    });

    it('uses default error message when bridge throws without message', async () => {
      bridge.switchTab.mockRejectedValue({});
      const ctx = createMockCtx([{ key: 'T', value: '2' }]);
      const result = await handlers.TAB(ctx);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('TAB command failed');
    });

    it('CLOSEALLOTHERS takes priority over CLOSE when both present', async () => {
      const ctx = createMockCtx([{ key: 'CLOSEALLOTHERS' }, { key: 'CLOSE' }]);
      const result = await handlers.TAB(ctx);

      expect(result.success).toBe(true);
      expect(bridge.closeOtherTabs).toHaveBeenCalled();
      expect(bridge.closeTab).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // FRAME handler
  // =========================================================================

  describe('FRAME handler', () => {
    it('F=n selects frame by index', async () => {
      const ctx = createMockCtx([{ key: 'F', value: '2' }]);
      const result = await handlers.FRAME(ctx);

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(ERROR_CODES.OK);
      expect(bridge.selectFrame).toHaveBeenCalledWith(2);
    });

    it('F=0 selects the main document', async () => {
      const ctx = createMockCtx([{ key: 'F', value: '0' }]);
      const result = await handlers.FRAME(ctx);

      expect(result.success).toBe(true);
      expect(bridge.selectFrame).toHaveBeenCalledWith(0);
    });

    it('NAME selects frame by name', async () => {
      const ctx = createMockCtx([{ key: 'NAME', value: 'content-frame' }]);
      const result = await handlers.FRAME(ctx);

      expect(result.success).toBe(true);
      expect(bridge.selectFrameByName).toHaveBeenCalledWith('content-frame');
    });

    it('returns INVALID_PARAMETER for negative F value', async () => {
      const ctx = createMockCtx([{ key: 'F', value: '-1' }]);
      const result = await handlers.FRAME(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.INVALID_PARAMETER);
      expect(result.errorMessage).toContain('Invalid frame index');
    });

    it('returns INVALID_PARAMETER for non-numeric F value', async () => {
      const ctx = createMockCtx([{ key: 'F', value: 'abc' }]);
      const result = await handlers.FRAME(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.INVALID_PARAMETER);
    });

    it('returns MISSING_PARAMETER when neither F nor NAME is given', async () => {
      const ctx = createMockCtx([]);
      const result = await handlers.FRAME(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.MISSING_PARAMETER);
      expect(result.errorMessage).toContain('F');
      expect(result.errorMessage).toContain('NAME');
    });

    it('returns FRAME_NOT_FOUND when bridge.selectFrame throws', async () => {
      bridge.selectFrame.mockRejectedValue(new Error('Frame index out of bounds'));
      const ctx = createMockCtx([{ key: 'F', value: '99' }]);
      const result = await handlers.FRAME(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.FRAME_NOT_FOUND);
      expect(result.errorMessage).toBe('Frame index out of bounds');
    });

    it('returns FRAME_NOT_FOUND when bridge.selectFrameByName throws', async () => {
      bridge.selectFrameByName.mockRejectedValue(new Error('No such frame'));
      const ctx = createMockCtx([{ key: 'NAME', value: 'nonexistent' }]);
      const result = await handlers.FRAME(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.FRAME_NOT_FOUND);
      expect(result.errorMessage).toBe('No such frame');
    });

    it('uses default error message when bridge throws without message', async () => {
      bridge.selectFrame.mockRejectedValue({});
      const ctx = createMockCtx([{ key: 'F', value: '1' }]);
      const result = await handlers.FRAME(ctx);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Frame not found');
    });
  });

  // =========================================================================
  // TAG handler
  // =========================================================================

  describe('TAG handler', () => {
    it('builds params correctly from POS, TYPE, ATTR, CONTENT', async () => {
      const ctx = createMockCtx([
        { key: 'POS', value: '1' },
        { key: 'TYPE', value: 'INPUT' },
        { key: 'ATTR', value: 'NAME:username' },
        { key: 'CONTENT', value: 'john' },
      ]);
      await handlers.TAG(ctx);

      expect(bridge.executeTag).toHaveBeenCalledTimes(1);
      const params = bridge.executeTag.mock.calls[0][0];
      expect(params.pos).toBe(1);
      expect(params.type).toBe('INPUT');
      expect(params.attr).toBe('NAME:username');
      expect(params.content).toBe('john');
      expect(params.waitVisible).toBe(true);
    });

    it('builds params from XPATH selector', async () => {
      const ctx = createMockCtx([
        { key: 'XPATH', value: '//input[@id="search"]' },
        { key: 'CONTENT', value: 'query' },
      ]);
      await handlers.TAG(ctx);

      const params = bridge.executeTag.mock.calls[0][0];
      expect(params.xpath).toBe('//input[@id="search"]');
      expect(params.content).toBe('query');
    });

    it('builds params from CSS selector', async () => {
      const ctx = createMockCtx([
        { key: 'CSS', value: '.submit-btn' },
        { key: 'EXTRACT', value: 'TXT' },
      ]);
      await handlers.TAG(ctx);

      const params = bridge.executeTag.mock.calls[0][0];
      expect(params.css).toBe('.submit-btn');
      expect(params.extract).toBe('TXT');
    });

    it('uses default timeout of 6000ms when !TIMEOUT_TAG is not set', async () => {
      const ctx = createMockCtx([{ key: 'POS', value: '1' }]);
      await handlers.TAG(ctx);

      const params = bridge.executeTag.mock.calls[0][0];
      expect(params.timeout).toBe(6000);
    });

    it('uses !TIMEOUT_TAG * 1000 as timeout when set', async () => {
      const ctx = createMockCtx(
        [{ key: 'POS', value: '1' }],
        { '!TIMEOUT_TAG': 10 },
      );
      await handlers.TAG(ctx);

      const params = bridge.executeTag.mock.calls[0][0];
      expect(params.timeout).toBe(10000);
    });

    it('uses default timeout when !TIMEOUT_TAG is a string (non-number)', async () => {
      const ctx = createMockCtx(
        [{ key: 'POS', value: '1' }],
        { '!TIMEOUT_TAG': 'not-a-number' },
      );
      await handlers.TAG(ctx);

      const params = bridge.executeTag.mock.calls[0][0];
      expect(params.timeout).toBe(6000);
    });

    it('parses !TIMEOUT_TAG when set as string number (e.g., "5")', async () => {
      const ctx = createMockCtx(
        [{ key: 'POS', value: '1' }],
        { '!TIMEOUT_TAG': '5' },
      );
      await handlers.TAG(ctx);

      const params = bridge.executeTag.mock.calls[0][0];
      expect(params.timeout).toBe(5000);
    });

    // ----- CONTENT with special values -----

    it('CONTENT=<SUBMIT> sets form=SUBMIT and clears content', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'INPUT' },
        { key: 'CONTENT', value: '<SUBMIT>' },
      ]);
      await handlers.TAG(ctx);

      const params = bridge.executeTag.mock.calls[0][0];
      expect(params.form).toBe('SUBMIT');
      expect(params.content).toBeUndefined();
    });

    it('CONTENT=<RESET> sets form=RESET and clears content', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'INPUT' },
        { key: 'CONTENT', value: '<RESET>' },
      ]);
      await handlers.TAG(ctx);

      const params = bridge.executeTag.mock.calls[0][0];
      expect(params.form).toBe('RESET');
      expect(params.content).toBeUndefined();
    });

    // ----- processContent (special character substitution) -----

    it('replaces <SP> with space in CONTENT', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'INPUT' },
        { key: 'CONTENT', value: 'hello<SP>world' },
      ]);
      await handlers.TAG(ctx);

      const params = bridge.executeTag.mock.calls[0][0];
      expect(params.content).toBe('hello world');
    });

    it('replaces <BR> with newline in CONTENT', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'TEXTAREA' },
        { key: 'CONTENT', value: 'line1<BR>line2' },
      ]);
      await handlers.TAG(ctx);

      const params = bridge.executeTag.mock.calls[0][0];
      expect(params.content).toBe('line1\nline2');
    });

    it('replaces <TAB> with tab character in CONTENT', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'INPUT' },
        { key: 'CONTENT', value: 'col1<TAB>col2' },
      ]);
      await handlers.TAG(ctx);

      const params = bridge.executeTag.mock.calls[0][0];
      expect(params.content).toBe('col1\tcol2');
    });

    it('treats <ENTER> as a key action (sets pressEnter flag)', async () => {
      // In iMacros, <ENTER> triggers an Enter keypress after setting content,
      // rather than inserting a newline character (use <BR> for newlines)
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'INPUT' },
        { key: 'CONTENT', value: 'value<ENTER>' },
      ]);
      await handlers.TAG(ctx);

      const params = bridge.executeTag.mock.calls[0][0];
      expect(params.content).toBe('value');
      expect(params.pressEnter).toBe(true);
    });

    it('handles multiple special tokens in CONTENT simultaneously', async () => {
      // <SP>=space, <BR>=newline, <TAB>=tab
      // <ENTER> is stripped from content and triggers a keypress (pressEnter=true)
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'TEXTAREA' },
        { key: 'CONTENT', value: 'a<SP>b<BR>c<TAB>d<ENTER>e' },
      ]);
      await handlers.TAG(ctx);

      const params = bridge.executeTag.mock.calls[0][0];
      expect(params.content).toBe('a b\nc\tde');
      expect(params.pressEnter).toBe(true);
    });

    // ----- EXTRACT -----

    it('stores extracted data via addExtract when EXTRACT is set', async () => {
      bridge.executeTag.mockResolvedValue({ success: true, extractedData: 'Hello World' });
      const ctx = createMockCtx([
        { key: 'CSS', value: '.title' },
        { key: 'EXTRACT', value: 'TXT' },
      ]);
      const result = await handlers.TAG(ctx);

      expect(result.success).toBe(true);
      expect(result.output).toBe('Hello World');
      expect(ctx.state.addExtract).toHaveBeenCalledWith('Hello World');
    });

    it('does not call addExtract when extractedData is undefined', async () => {
      bridge.executeTag.mockResolvedValue({ success: true });
      const ctx = createMockCtx([
        { key: 'CSS', value: '.title' },
        { key: 'EXTRACT', value: 'TXT' },
      ]);
      await handlers.TAG(ctx);

      expect(ctx.state.addExtract).not.toHaveBeenCalled();
    });

    it('does not call addExtract when EXTRACT is not set', async () => {
      bridge.executeTag.mockResolvedValue({ success: true, extractedData: 'data' });
      const ctx = createMockCtx([{ key: 'CSS', value: '.title' }]);
      await handlers.TAG(ctx);

      expect(ctx.state.addExtract).not.toHaveBeenCalled();
    });

    // ----- parsePos (tested indirectly) -----

    it('POS defaults to 1 when not provided', async () => {
      const ctx = createMockCtx([{ key: 'TYPE', value: 'DIV' }]);
      await handlers.TAG(ctx);

      const params = bridge.executeTag.mock.calls[0][0];
      expect(params.pos).toBe(1);
    });

    it('POS with numeric value is parsed correctly', async () => {
      const ctx = createMockCtx([{ key: 'POS', value: '5' }]);
      await handlers.TAG(ctx);

      const params = bridge.executeTag.mock.calls[0][0];
      expect(params.pos).toBe(5);
    });

    it('POS with R prefix sets relative positioning', async () => {
      const ctx = createMockCtx([{ key: 'POS', value: 'R3' }]);
      await handlers.TAG(ctx);

      const params = bridge.executeTag.mock.calls[0][0];
      expect(params.pos).toBe(3);
      expect(params.relative).toBe(true);
    });

    it('POS with non-numeric value defaults to 1', async () => {
      const ctx = createMockCtx([{ key: 'POS', value: 'invalid' }]);
      await handlers.TAG(ctx);

      const params = bridge.executeTag.mock.calls[0][0];
      expect(params.pos).toBe(1);
    });

    // ----- Failure modes -----

    it('returns ELEMENT_NOT_FOUND when bridge returns success=false', async () => {
      bridge.executeTag.mockResolvedValue({ success: false, error: 'Element not visible' });
      const ctx = createMockCtx([
        { key: 'CSS', value: '.missing' },
      ]);
      const result = await handlers.TAG(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.ELEMENT_NOT_FOUND);
      expect(result.errorMessage).toBe('Element not visible');
    });

    it('returns ELEMENT_NOT_FOUND with default message when error not provided', async () => {
      bridge.executeTag.mockResolvedValue({ success: false });
      const ctx = createMockCtx([{ key: 'CSS', value: '.missing' }]);
      const result = await handlers.TAG(ctx);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Element not found');
    });

    it('returns SCRIPT_ERROR when bridge.executeTag throws', async () => {
      bridge.executeTag.mockRejectedValue(new Error('Bridge disconnected'));
      const ctx = createMockCtx([{ key: 'CSS', value: '.title' }]);
      const result = await handlers.TAG(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toBe('Bridge disconnected');
    });

    it('uses default error message when bridge.executeTag throws without message', async () => {
      bridge.executeTag.mockRejectedValue({});
      const ctx = createMockCtx([{ key: 'CSS', value: '.title' }]);
      const result = await handlers.TAG(ctx);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('TAG command failed');
    });

    it('passes FORM parameter through to bridge', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'INPUT' },
        { key: 'FORM', value: 'INDEX:1' },
        { key: 'CONTENT', value: 'test' },
      ]);
      await handlers.TAG(ctx);

      const params = bridge.executeTag.mock.calls[0][0];
      expect(params.form).toBe('INDEX:1');
    });
  });

  // =========================================================================
  // CLICK handler
  // =========================================================================

  describe('CLICK handler', () => {
    it('sends X,Y coordinates to bridge', async () => {
      const ctx = createMockCtx([
        { key: 'X', value: '100' },
        { key: 'Y', value: '200' },
      ]);
      const result = await handlers.CLICK(ctx);

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(ERROR_CODES.OK);
      expect(bridge.executeClick).toHaveBeenCalledWith({ x: 100, y: 200, button: 'left' });
    });

    it('defaults to left button when CONTENT not specified', async () => {
      const ctx = createMockCtx([
        { key: 'X', value: '50' },
        { key: 'Y', value: '50' },
      ]);
      await handlers.CLICK(ctx);

      const params = bridge.executeClick.mock.calls[0][0];
      expect(params.button).toBe('left');
    });

    it('CONTENT=right uses right button', async () => {
      const ctx = createMockCtx([
        { key: 'X', value: '10' },
        { key: 'Y', value: '20' },
        { key: 'CONTENT', value: 'right' },
      ]);
      await handlers.CLICK(ctx);

      const params = bridge.executeClick.mock.calls[0][0];
      expect(params.button).toBe('right');
    });

    it('CONTENT=middle uses middle button', async () => {
      const ctx = createMockCtx([
        { key: 'X', value: '10' },
        { key: 'Y', value: '20' },
        { key: 'CONTENT', value: 'middle' },
      ]);
      await handlers.CLICK(ctx);

      const params = bridge.executeClick.mock.calls[0][0];
      expect(params.button).toBe('middle');
    });

    it('CONTENT=center is treated as middle button', async () => {
      const ctx = createMockCtx([
        { key: 'X', value: '10' },
        { key: 'Y', value: '20' },
        { key: 'CONTENT', value: 'center' },
      ]);
      await handlers.CLICK(ctx);

      const params = bridge.executeClick.mock.calls[0][0];
      expect(params.button).toBe('middle');
    });

    it('CONTENT button matching is case-insensitive', async () => {
      const ctx = createMockCtx([
        { key: 'X', value: '10' },
        { key: 'Y', value: '20' },
        { key: 'CONTENT', value: 'RIGHT' },
      ]);
      await handlers.CLICK(ctx);

      const params = bridge.executeClick.mock.calls[0][0];
      expect(params.button).toBe('right');
    });

    it('unrecognized CONTENT defaults to left button', async () => {
      const ctx = createMockCtx([
        { key: 'X', value: '10' },
        { key: 'Y', value: '20' },
        { key: 'CONTENT', value: 'unknown' },
      ]);
      await handlers.CLICK(ctx);

      const params = bridge.executeClick.mock.calls[0][0];
      expect(params.button).toBe('left');
    });

    it('returns MISSING_PARAMETER when X is missing', async () => {
      const ctx = createMockCtx([{ key: 'Y', value: '200' }]);
      const result = await handlers.CLICK(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.MISSING_PARAMETER);
      expect(result.errorMessage).toContain('X');
      expect(result.errorMessage).toContain('Y');
    });

    it('returns MISSING_PARAMETER when Y is missing', async () => {
      const ctx = createMockCtx([{ key: 'X', value: '100' }]);
      const result = await handlers.CLICK(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.MISSING_PARAMETER);
    });

    it('returns MISSING_PARAMETER when both X and Y are missing', async () => {
      const ctx = createMockCtx([]);
      const result = await handlers.CLICK(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.MISSING_PARAMETER);
    });

    it('returns INVALID_PARAMETER for non-numeric X', async () => {
      const ctx = createMockCtx([
        { key: 'X', value: 'abc' },
        { key: 'Y', value: '200' },
      ]);
      const result = await handlers.CLICK(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.INVALID_PARAMETER);
      expect(result.errorMessage).toContain('Invalid coordinates');
    });

    it('returns INVALID_PARAMETER for non-numeric Y', async () => {
      const ctx = createMockCtx([
        { key: 'X', value: '100' },
        { key: 'Y', value: 'xyz' },
      ]);
      const result = await handlers.CLICK(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.INVALID_PARAMETER);
    });

    it('returns SCRIPT_ERROR when bridge returns success=false', async () => {
      bridge.executeClick.mockResolvedValue({ success: false, error: 'Click intercepted' });
      const ctx = createMockCtx([
        { key: 'X', value: '10' },
        { key: 'Y', value: '10' },
      ]);
      const result = await handlers.CLICK(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toBe('Click intercepted');
    });

    it('returns default error message when bridge returns success=false without error', async () => {
      bridge.executeClick.mockResolvedValue({ success: false });
      const ctx = createMockCtx([
        { key: 'X', value: '10' },
        { key: 'Y', value: '10' },
      ]);
      const result = await handlers.CLICK(ctx);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Click failed');
    });

    it('returns SCRIPT_ERROR when bridge.executeClick throws', async () => {
      bridge.executeClick.mockRejectedValue(new Error('Tab closed'));
      const ctx = createMockCtx([
        { key: 'X', value: '10' },
        { key: 'Y', value: '10' },
      ]);
      const result = await handlers.CLICK(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toBe('Tab closed');
    });

    it('uses default error message when bridge.executeClick throws without message', async () => {
      bridge.executeClick.mockRejectedValue({});
      const ctx = createMockCtx([
        { key: 'X', value: '10' },
        { key: 'Y', value: '10' },
      ]);
      const result = await handlers.CLICK(ctx);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('CLICK command failed');
    });
  });

  // =========================================================================
  // EVENT handler
  // =========================================================================

  describe('EVENT handler', () => {
    it('requires TYPE parameter', async () => {
      const ctx = createMockCtx([{ key: 'SELECTOR', value: 'CSS:.btn' }]);
      const result = await handlers.EVENT(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.MISSING_PARAMETER);
      expect(result.errorMessage).toContain('TYPE');
    });

    it('dispatches event with TYPE only (no selector)', async () => {
      const ctx = createMockCtx([{ key: 'TYPE', value: 'CLICK' }]);
      const result = await handlers.EVENT(ctx);

      expect(result.success).toBe(true);
      expect(bridge.executeEvent).toHaveBeenCalledTimes(1);
      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.eventType).toBe('click');
      expect(params.selector).toBeUndefined();
    });

    it('lowercases the event type', async () => {
      const ctx = createMockCtx([{ key: 'TYPE', value: 'KEYDOWN' }]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.eventType).toBe('keydown');
    });

    // ----- Selector variants -----

    it('CSS parameter builds css selector', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'CLICK' },
        { key: 'CSS', value: '.my-button' },
      ]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.selector).toEqual({ css: '.my-button' });
    });

    it('XPATH parameter builds xpath selector', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'CLICK' },
        { key: 'XPATH', value: '//button[@id="submit"]' },
      ]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.selector).toEqual({ xpath: '//button[@id="submit"]' });
    });

    it('SELECTOR with CSS: prefix builds css selector', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'CLICK' },
        { key: 'SELECTOR', value: 'CSS:.my-button' },
      ]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.selector).toEqual({ css: '.my-button' });
    });

    it('SELECTOR with XPATH: prefix builds xpath selector', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'CLICK' },
        { key: 'SELECTOR', value: 'XPATH://div[@class="content"]' },
      ]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.selector).toEqual({ xpath: '//div[@class="content"]' });
    });

    it('SELECTOR without prefix defaults to css', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'CLICK' },
        { key: 'SELECTOR', value: '#my-element' },
      ]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.selector).toEqual({ css: '#my-element' });
    });

    it('XPATH takes priority over SELECTOR when both provided', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'CLICK' },
        { key: 'XPATH', value: '//div' },
        { key: 'SELECTOR', value: 'CSS:.btn' },
      ]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.selector).toEqual({ xpath: '//div' });
    });

    it('CSS takes priority over SELECTOR when both provided', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'CLICK' },
        { key: 'CSS', value: '.priority-btn' },
        { key: 'SELECTOR', value: '#fallback' },
      ]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.selector).toEqual({ css: '.priority-btn' });
    });

    it('XPATH takes priority over CSS when both provided', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'CLICK' },
        { key: 'XPATH', value: '//button' },
        { key: 'CSS', value: '.btn' },
      ]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.selector).toEqual({ xpath: '//button' });
    });

    it('XPATH takes priority over CSS and SELECTOR when all three provided', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'CLICK' },
        { key: 'XPATH', value: '//div' },
        { key: 'CSS', value: '.cls' },
        { key: 'SELECTOR', value: '#id' },
      ]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.selector).toEqual({ xpath: '//div' });
    });

    // ----- Additional parameters -----

    it('passes KEY parameter', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'KEYDOWN' },
        { key: 'KEY', value: 'Enter' },
      ]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.key).toBe('Enter');
    });

    it('passes CHAR parameter', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'KEYPRESS' },
        { key: 'CHAR', value: 'A' },
      ]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.char).toBe('A');
    });

    it('passes BUTTON parameter as integer', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'MOUSEDOWN' },
        { key: 'BUTTON', value: '2' },
      ]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.button).toBe(2);
    });

    it('BUTTON parameter is undefined for non-numeric value', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'MOUSEDOWN' },
        { key: 'BUTTON', value: 'abc' },
      ]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.button).toBeUndefined();
    });

    // ----- parsePoint (tested indirectly) -----

    it('POINT=100,200 is parsed into {x, y}', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'MOUSEMOVE' },
        { key: 'POINT', value: '100,200' },
      ]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.point).toEqual({ x: 100, y: 200 });
    });

    it('POINT with spaces around comma is parsed correctly', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'MOUSEMOVE' },
        { key: 'POINT', value: '50 , 75' },
      ]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.point).toEqual({ x: 50, y: 75 });
    });

    it('invalid POINT value returns undefined', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'MOUSEMOVE' },
        { key: 'POINT', value: 'invalid' },
      ]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.point).toBeUndefined();
    });

    it('POINT with single value returns undefined', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'MOUSEMOVE' },
        { key: 'POINT', value: '100' },
      ]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.point).toBeUndefined();
    });

    // ----- parseModifiers (tested indirectly) -----

    it('MODIFIERS=ctrl+shift parses both modifiers', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'KEYDOWN' },
        { key: 'KEY', value: 'A' },
        { key: 'MODIFIERS', value: 'ctrl+shift' },
      ]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.modifiers).toEqual({ ctrl: true, shift: true });
    });

    it('MODIFIERS=alt,meta parses comma-separated modifiers', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'KEYDOWN' },
        { key: 'MODIFIERS', value: 'alt,meta' },
      ]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.modifiers).toEqual({ alt: true, meta: true });
    });

    it('MODIFIERS=cmd maps to meta', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'KEYDOWN' },
        { key: 'MODIFIERS', value: 'cmd' },
      ]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.modifiers).toEqual({ meta: true });
    });

    it('MODIFIERS=command maps to meta', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'KEYDOWN' },
        { key: 'MODIFIERS', value: 'command' },
      ]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.modifiers).toEqual({ meta: true });
    });

    it('MODIFIERS=control maps to ctrl', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'KEYDOWN' },
        { key: 'MODIFIERS', value: 'control' },
      ]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.modifiers).toEqual({ ctrl: true });
    });

    it('MODIFIERS=shift alone parses correctly', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'KEYDOWN' },
        { key: 'MODIFIERS', value: 'shift' },
      ]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.modifiers).toEqual({ shift: true });
    });

    it('MODIFIERS=alt alone parses correctly', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'KEYDOWN' },
        { key: 'MODIFIERS', value: 'alt' },
      ]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.modifiers).toEqual({ alt: true });
    });

    it('MODIFIERS=ctrl alone parses correctly', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'KEYDOWN' },
        { key: 'MODIFIERS', value: 'ctrl' },
      ]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.modifiers).toEqual({ ctrl: true });
    });

    it('MODIFIERS=meta alone parses correctly', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'KEYDOWN' },
        { key: 'MODIFIERS', value: 'meta' },
      ]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.modifiers).toEqual({ meta: true });
    });

    it('MODIFIERS with all four modifiers parses correctly', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'KEYDOWN' },
        { key: 'MODIFIERS', value: 'ctrl+shift+alt+meta' },
      ]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.modifiers).toEqual({ ctrl: true, shift: true, alt: true, meta: true });
    });

    it('unrecognized MODIFIERS value returns undefined', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'KEYDOWN' },
        { key: 'MODIFIERS', value: 'unknown' },
      ]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.modifiers).toBeUndefined();
    });

    it('MODIFIERS is undefined when not provided', async () => {
      const ctx = createMockCtx([{ key: 'TYPE', value: 'CLICK' }]);
      await handlers.EVENT(ctx);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.modifiers).toBeUndefined();
    });

    // ----- Failure modes -----

    it('returns SCRIPT_ERROR when bridge returns success=false', async () => {
      bridge.executeEvent.mockResolvedValue({ success: false, error: 'Dispatch failed' });
      const ctx = createMockCtx([{ key: 'TYPE', value: 'CLICK' }]);
      const result = await handlers.EVENT(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toBe('Dispatch failed');
    });

    it('returns default error message when bridge returns success=false without error', async () => {
      bridge.executeEvent.mockResolvedValue({ success: false });
      const ctx = createMockCtx([{ key: 'TYPE', value: 'CLICK' }]);
      const result = await handlers.EVENT(ctx);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Event dispatch failed');
    });

    it('returns SCRIPT_ERROR when bridge.executeEvent throws', async () => {
      bridge.executeEvent.mockRejectedValue(new Error('Connection lost'));
      const ctx = createMockCtx([{ key: 'TYPE', value: 'CLICK' }]);
      const result = await handlers.EVENT(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toBe('Connection lost');
    });

    it('uses default error message when bridge.executeEvent throws without message', async () => {
      bridge.executeEvent.mockRejectedValue({});
      const ctx = createMockCtx([{ key: 'TYPE', value: 'CLICK' }]);
      const result = await handlers.EVENT(ctx);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('EVENT command failed');
    });
  });

  // =========================================================================
  // EVENTS handler (alias)
  // =========================================================================

  describe('EVENTS handler', () => {
    it('is an alias for EVENT and dispatches events identically', async () => {
      const ctx = createMockCtx([
        { key: 'TYPE', value: 'CLICK' },
        { key: 'CSS', value: '.btn' },
      ]);
      const result = await handlers.EVENTS(ctx);

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(ERROR_CODES.OK);
      expect(bridge.executeEvent).toHaveBeenCalledTimes(1);

      const params = bridge.executeEvent.mock.calls[0][0];
      expect(params.eventType).toBe('click');
      expect(params.selector).toEqual({ css: '.btn' });
    });

    it('returns MISSING_PARAMETER when TYPE is missing (same as EVENT)', async () => {
      const ctx = createMockCtx([]);
      const result = await handlers.EVENTS(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.MISSING_PARAMETER);
    });

    it('passes through bridge errors (same as EVENT)', async () => {
      bridge.executeEvent.mockRejectedValue(new Error('Boom'));
      const ctx = createMockCtx([{ key: 'TYPE', value: 'CLICK' }]);
      const result = await handlers.EVENTS(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toBe('Boom');
    });
  });

  // =========================================================================
  // Handler map structure
  // =========================================================================

  describe('createBrowserHandlers', () => {
    it('returns an object with all expected handler keys', () => {
      const keys = Object.keys(handlers);
      expect(keys).toContain('URL');
      expect(keys).toContain('BACK');
      expect(keys).toContain('REFRESH');
      expect(keys).toContain('TAB');
      expect(keys).toContain('FRAME');
      expect(keys).toContain('TAG');
      expect(keys).toContain('CLICK');
      expect(keys).toContain('EVENT');
      expect(keys).toContain('EVENTS');
    });

    it('all handlers are async functions', () => {
      for (const key of Object.keys(handlers)) {
        expect(typeof handlers[key]).toBe('function');
        // Async functions return promises
        const ctx = createMockCtx([]);
        const result = handlers[key](ctx);
        expect(result).toBeInstanceOf(Promise);
      }
    });
  });
});
