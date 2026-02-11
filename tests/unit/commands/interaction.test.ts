/**
 * Interaction Command Handler Unit Tests
 *
 * Tests for TAG, CLICK, and EVENT command handlers, plus all exported
 * helper/parsing functions from shared/src/commands/interaction.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  tagHandler,
  clickHandler,
  eventHandler,
  setContentScriptSender,
  getContentScriptSender,
  noopSender,
  parseAttrParam,
  parseExtractParam,
  parsePosParam,
  parsePosParamEx,
  parseContentParam,
  buildSelector,
  buildAction,
  interactionHandlers,
  registerInteractionHandlers,
} from '../../../shared/src/commands/interaction';
import { IMACROS_ERROR_CODES } from '../../../shared/src/executor';

// ===== Mock Factories =====

function createMockContext(
  params: Record<string, string> = {},
  vars: Map<string, any> = new Map(),
): any {
  const mockLogs: Array<{ level: string; message: string }> = [];
  return {
    command: {
      type: 'TEST',
      parameters: Object.entries(params).map(([key, value]) => ({
        key: key.toUpperCase(),
        value,
        rawValue: value,
        variables: [],
      })),
      raw: 'TEST',
      lineNumber: 1,
      variables: [],
    },
    variables: {
      get: (name: string) => vars.get(name.toUpperCase()) ?? null,
      set: (name: string, value: any) => {
        vars.set(name.toUpperCase(), value);
        return { success: true, previousValue: null, newValue: value };
      },
      expand: (t: string) => ({ expanded: t, variables: [] }),
    },
    state: {
      setVariable: (name: string, value: any) => vars.set(name.toUpperCase(), value),
      getVariable: (name: string) => vars.get(name.toUpperCase()) ?? null,
      addExtract: (value: string) => {
        const current = vars.get('!EXTRACT') || '';
        vars.set('!EXTRACT', current ? current + '[EXTRACT]' + value : value);
      },
    },
    getParam: (key: string) => {
      const upperKey = key.toUpperCase();
      const entry = Object.entries(params).find(([k]) => k.toUpperCase() === upperKey);
      return entry ? entry[1] : undefined;
    },
    getRequiredParam: (key: string) => {
      const upperKey = key.toUpperCase();
      const entry = Object.entries(params).find(([k]) => k.toUpperCase() === upperKey);
      if (!entry) throw new Error(`Missing required parameter: ${key}`);
      return entry[1];
    },
    expand: (t: string) => t,
    log: (level: string, message: string) => mockLogs.push({ level, message }),
    _logs: mockLogs,
    _vars: vars,
  };
}

// ===== Test Suite =====

describe('interaction command handlers', () => {
  let mockSender: { sendMessage: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockSender = {
      sendMessage: vi.fn().mockResolvedValue({ success: true }),
    };
    setContentScriptSender(mockSender);
  });

  afterEach(() => {
    setContentScriptSender(noopSender);
  });

  // -------------------------------------------------------
  // 1. parseAttrParam
  // -------------------------------------------------------
  describe('parseAttrParam', () => {
    it('parses NAME prefix', () => {
      expect(parseAttrParam('NAME:username')).toEqual({ name: 'username' });
    });

    it('parses ID prefix', () => {
      expect(parseAttrParam('ID:main-input')).toEqual({ id: 'main-input' });
    });

    it('parses CLASS prefix', () => {
      expect(parseAttrParam('CLASS:btn-primary')).toEqual({ class: 'btn-primary' });
    });

    it('parses TXT prefix as innerText', () => {
      expect(parseAttrParam('TXT:Click Here')).toEqual({ innerText: 'Click Here' });
    });

    it('parses HREF prefix', () => {
      expect(parseAttrParam('HREF:https://example.com')).toEqual({ href: 'https://example.com' });
    });

    it('parses SRC prefix', () => {
      expect(parseAttrParam('SRC:image.png')).toEqual({ src: 'image.png' });
    });

    it('parses ALT prefix', () => {
      expect(parseAttrParam('ALT:logo')).toEqual({ alt: 'logo' });
    });

    it('parses TITLE prefix', () => {
      expect(parseAttrParam('TITLE:tooltip')).toEqual({ title: 'tooltip' });
    });

    it('parses VALUE prefix', () => {
      expect(parseAttrParam('VALUE:42')).toEqual({ value: '42' });
    });

    it('parses TYPE prefix', () => {
      expect(parseAttrParam('TYPE:text')).toEqual({ type: 'text' });
    });

    it('parses PLACEHOLDER prefix', () => {
      expect(parseAttrParam('PLACEHOLDER:Enter name')).toEqual({ placeholder: 'Enter name' });
    });

    it('parses custom/unknown attribute prefix', () => {
      expect(parseAttrParam('DATA-ID:abc123')).toEqual({ 'data-id': 'abc123' });
    });

    it('parses value with no prefix as generic selector', () => {
      expect(parseAttrParam('someValue')).toEqual({ selector: 'someValue' });
    });

    it('parses multiple attributes with && separator', () => {
      const result = parseAttrParam('NAME:foo&&CLASS:bar');
      expect(result).toEqual({ name: 'foo', class: 'bar' });
    });

    it('ignores empty parts from &&', () => {
      const result = parseAttrParam('NAME:foo&&&&CLASS:bar');
      expect(result).toEqual({ name: 'foo', class: 'bar' });
    });

    it('handles value containing colons', () => {
      const result = parseAttrParam('HREF:https://example.com:8080/path');
      expect(result).toEqual({ href: 'https://example.com:8080/path' });
    });
  });

  // -------------------------------------------------------
  // 2. parseExtractParam
  // -------------------------------------------------------
  describe('parseExtractParam', () => {
    it.each([
      'TXT', 'HTM', 'HREF', 'TITLE', 'ALT', 'VALUE', 'SRC',
      'ID', 'CLASS', 'NAME', 'TXTALL', 'CHECKED',
    ])('accepts valid extract type %s', (type) => {
      expect(parseExtractParam(type)).toBe(type);
    });

    it('is case-insensitive for standard types', () => {
      expect(parseExtractParam('txt')).toBe('TXT');
      expect(parseExtractParam('Htm')).toBe('HTM');
    });

    it('parses ATTR: prefix for custom attributes', () => {
      expect(parseExtractParam('ATTR:data-value')).toBe('data-value');
    });

    it('ATTR: prefix is case-insensitive on the prefix', () => {
      expect(parseExtractParam('attr:data-custom')).toBe('data-custom');
    });

    it('throws on invalid extract type', () => {
      expect(() => parseExtractParam('INVALID')).toThrow('BadParameter');
    });

    it('error message includes valid types list', () => {
      expect(() => parseExtractParam('NOPE')).toThrow('ATTR:<name>');
    });
  });

  // -------------------------------------------------------
  // 3. parsePosParam / parsePosParamEx
  // -------------------------------------------------------
  describe('parsePosParam', () => {
    it('parses positive integer', () => {
      expect(parsePosParam('1')).toBe(1);
    });

    it('parses negative integer', () => {
      expect(parsePosParam('-1')).toBe(-1);
    });

    it('throws on non-numeric', () => {
      expect(() => parsePosParam('abc')).toThrow('Bad parameter');
    });
  });

  describe('parsePosParamEx', () => {
    it('returns absolute positive position', () => {
      expect(parsePosParamEx('3')).toEqual({ pos: 3, relative: false });
    });

    it('returns absolute negative position', () => {
      expect(parsePosParamEx('-2')).toEqual({ pos: -2, relative: false });
    });

    it('parses relative positive R prefix', () => {
      expect(parsePosParamEx('R1')).toEqual({ pos: 1, relative: true });
    });

    it('parses relative negative R prefix', () => {
      expect(parsePosParamEx('R-3')).toEqual({ pos: -3, relative: true });
    });

    it('is case-insensitive for R prefix', () => {
      expect(parsePosParamEx('r2')).toEqual({ pos: 2, relative: true });
    });

    it('throws on R0', () => {
      expect(() => parsePosParamEx('R0')).toThrow('Bad parameter');
    });

    it('throws on R followed by non-numeric', () => {
      expect(() => parsePosParamEx('Rabc')).toThrow('Bad parameter');
    });

    it('throws on completely non-numeric string', () => {
      expect(() => parsePosParamEx('xyz')).toThrow('Bad parameter');
    });

    it('trims whitespace', () => {
      expect(parsePosParamEx('  5  ')).toEqual({ pos: 5, relative: false });
    });
  });

  // -------------------------------------------------------
  // 4. parseContentParam
  // -------------------------------------------------------
  describe('parseContentParam', () => {
    it('replaces <SP> with space', () => {
      expect(parseContentParam('hello<SP>world')).toBe('hello world');
    });

    it('replaces <BR> with newline', () => {
      expect(parseContentParam('line1<BR>line2')).toBe('line1\nline2');
    });

    it('replaces <TAB> with tab', () => {
      expect(parseContentParam('col1<TAB>col2')).toBe('col1\tcol2');
    });

    it('replaces <ENTER> with newline', () => {
      expect(parseContentParam('press<ENTER>go')).toBe('press\ngo');
    });

    it('is case-insensitive for replacements', () => {
      expect(parseContentParam('<sp><br><tab><enter>')).toBe(' \n\t\n');
    });

    it('handles multiple replacements in one string', () => {
      expect(parseContentParam('a<SP>b<TAB>c<BR>d')).toBe('a b\tc\nd');
    });

    it('returns string unchanged when no special tokens', () => {
      expect(parseContentParam('plain text')).toBe('plain text');
    });
  });

  // -------------------------------------------------------
  // 5. buildSelector
  // -------------------------------------------------------
  describe('buildSelector', () => {
    it('builds XPATH selector (takes precedence)', () => {
      const ctx = createMockContext({ XPATH: '//div[@id="main"]', TYPE: 'DIV' });
      const sel = buildSelector(ctx);
      expect(sel.xpath).toBe('//div[@id="main"]');
      expect(sel.type).toBeUndefined();
    });

    it('builds CSS selector', () => {
      const ctx = createMockContext({ CSS: '.submit-btn' });
      const sel = buildSelector(ctx);
      expect(sel.css).toBe('.submit-btn');
    });

    it('builds traditional POS/TYPE/ATTR selector', () => {
      const ctx = createMockContext({ POS: '1', TYPE: 'INPUT', ATTR: 'NAME:user' });
      const sel = buildSelector(ctx);
      expect(sel.pos).toBe(1);
      expect(sel.type).toBe('INPUT');
      expect(sel.attr).toBe('NAME:user');
      expect(sel.relative).toBe(false);
    });

    it('builds selector with FORM parameter', () => {
      const ctx = createMockContext({ POS: '1', TYPE: 'INPUT', ATTR: 'NAME:q', FORM: 'NAME:searchform' });
      const sel = buildSelector(ctx);
      expect(sel.form).toBe('NAME:searchform');
    });

    it('handles relative POS', () => {
      const ctx = createMockContext({ POS: 'R2', TYPE: 'A' });
      const sel = buildSelector(ctx);
      expect(sel.pos).toBe(2);
      expect(sel.relative).toBe(true);
    });

    it('returns empty selector when no params given', () => {
      const ctx = createMockContext({});
      const sel = buildSelector(ctx);
      expect(sel).toEqual({});
    });
  });

  // -------------------------------------------------------
  // 6. buildAction
  // -------------------------------------------------------
  describe('buildAction', () => {
    it('builds action with CONTENT', () => {
      const ctx = createMockContext({ CONTENT: 'hello<SP>world' });
      const action = buildAction(ctx);
      expect(action.content).toBe('hello world');
    });

    it('builds action with EXTRACT', () => {
      const ctx = createMockContext({ EXTRACT: 'TXT' });
      const action = buildAction(ctx);
      expect(action.extract).toBe('TXT');
    });

    it('converts CONTENT=<SUBMIT> to form SUBMIT action', () => {
      const ctx = createMockContext({ CONTENT: '<SUBMIT>' });
      const action = buildAction(ctx);
      expect(action.form).toBe('SUBMIT');
      expect(action.content).toBeUndefined();
    });

    it('converts CONTENT=<RESET> to form RESET action', () => {
      const ctx = createMockContext({ CONTENT: '<RESET>' });
      const action = buildAction(ctx);
      expect(action.form).toBe('RESET');
      expect(action.content).toBeUndefined();
    });

    it('returns empty action when no params', () => {
      const ctx = createMockContext({});
      const action = buildAction(ctx);
      expect(action).toEqual({});
    });
  });

  // -------------------------------------------------------
  // 7. TAG handler
  // -------------------------------------------------------
  describe('tagHandler', () => {
    it('sends TAG_COMMAND and returns success', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ POS: '1', TYPE: 'INPUT', ATTR: 'NAME:q', CONTENT: 'test' });
      const result = await tagHandler(ctx);

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(mockSender.sendMessage).toHaveBeenCalledOnce();

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.type).toBe('TAG_COMMAND');
      expect(msg.payload.selector.pos).toBe(1);
      expect(msg.payload.selector.type).toBe('INPUT');
      expect(msg.payload.action.content).toBe('test');
    });

    it('returns failure when content script reports failure', async () => {
      mockSender.sendMessage.mockResolvedValue({
        success: false,
        error: 'Element not found',
        errorCode: -920,
      });
      const ctx = createMockContext({ POS: '1', TYPE: 'DIV', ATTR: 'ID:missing' });
      const result = await tagHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND);
    });

    it('returns #EANF# on element-not-found (-920) when EXTRACT is specified', async () => {
      mockSender.sendMessage.mockResolvedValue({
        success: false,
        error: 'Element not found',
        errorCode: -920,
      });
      const vars = new Map<string, any>();
      const ctx = createMockContext(
        { POS: '1', TYPE: 'SPAN', ATTR: 'CLASS:price', EXTRACT: 'TXT' },
        vars,
      );
      const result = await tagHandler(ctx);

      expect(result.success).toBe(true);
      expect(result.output).toBe('#EANF#');
      expect(vars.get('!EXTRACT')).toBe('#EANF#');
    });

    it('does NOT return #EANF# for non-920 error codes even with EXTRACT', async () => {
      mockSender.sendMessage.mockResolvedValue({
        success: false,
        error: 'CHECKED only works on checkboxes',
        errorCode: -921,
      });
      const ctx = createMockContext(
        { POS: '1', TYPE: 'INPUT', ATTR: 'NAME:email', EXTRACT: 'CHECKED' },
      );
      const result = await tagHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(-921);
    });

    it('stores extracted data on success', async () => {
      mockSender.sendMessage.mockResolvedValue({
        success: true,
        extractedData: '$19.99',
      });
      const vars = new Map<string, any>();
      const ctx = createMockContext(
        { POS: '1', TYPE: 'SPAN', ATTR: 'CLASS:price', EXTRACT: 'TXT' },
        vars,
      );
      const result = await tagHandler(ctx);

      expect(result.success).toBe(true);
      expect(result.output).toBe('$19.99');
      expect(vars.get('!EXTRACT')).toBe('$19.99');
    });

    it('returns MISSING_PARAMETER when no XPATH, CSS, or TYPE', async () => {
      const ctx = createMockContext({ POS: '1', ATTR: 'NAME:q' });
      const result = await tagHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    });

    it('uses !TIMEOUT_TAG numeric variable for timeout', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const vars = new Map<string, any>();
      vars.set('!TIMEOUT_TAG', 10);
      const ctx = createMockContext({ POS: '1', TYPE: 'INPUT', ATTR: 'NAME:q' }, vars);
      await tagHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.timeout).toBe(10000);
    });

    it('uses !TIMEOUT_TAG string variable for timeout', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const vars = new Map<string, any>();
      vars.set('!TIMEOUT_TAG', '15');
      const ctx = createMockContext({ POS: '1', TYPE: 'INPUT', ATTR: 'NAME:q' }, vars);
      await tagHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.timeout).toBe(15000);
    });

    it('uses default 6000ms timeout when !TIMEOUT_TAG is not set', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ POS: '1', TYPE: 'INPUT', ATTR: 'NAME:q' });
      await tagHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.timeout).toBe(6000);
    });

    it('handles sender throwing an error', async () => {
      mockSender.sendMessage.mockRejectedValue(new Error('Connection lost'));
      const ctx = createMockContext({ POS: '1', TYPE: 'INPUT', ATTR: 'NAME:q' });
      const result = await tagHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toContain('Connection lost');
    });

    it('returns INVALID_PARAMETER on bad EXTRACT type', async () => {
      const ctx = createMockContext({ POS: '1', TYPE: 'DIV', ATTR: 'ID:x', EXTRACT: 'BOGUS' });
      const result = await tagHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    });

    it('returns INVALID_PARAMETER on bad POS value', async () => {
      const ctx = createMockContext({ POS: 'R0', TYPE: 'DIV', ATTR: 'ID:x' });
      const result = await tagHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    });

    it('returns default error code when response has no errorCode', async () => {
      mockSender.sendMessage.mockResolvedValue({
        success: false,
        error: 'unknown issue',
      });
      const ctx = createMockContext({ POS: '1', TYPE: 'DIV', ATTR: 'ID:x' });
      const result = await tagHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND);
    });
  });

  // -------------------------------------------------------
  // 8. CLICK handler
  // -------------------------------------------------------
  describe('clickHandler', () => {
    it('sends CLICK_COMMAND and returns success', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ X: '100', Y: '200' });
      const result = await clickHandler(ctx);

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.type).toBe('CLICK_COMMAND');
      expect(msg.payload.x).toBe(100);
      expect(msg.payload.y).toBe(200);
      expect(msg.payload.button).toBe('left');
      expect(msg.payload.coordinateMode).toBe('page');
    });

    it('returns failure when content script reports failure', async () => {
      mockSender.sendMessage.mockResolvedValue({
        success: false,
        error: 'Click target obscured',
      });
      const ctx = createMockContext({ X: '50', Y: '50' });
      const result = await clickHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
    });

    it('returns MISSING_PARAMETER when X is missing', async () => {
      const ctx = createMockContext({ Y: '100' });
      const result = await clickHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    });

    it('returns MISSING_PARAMETER when Y is missing', async () => {
      const ctx = createMockContext({ X: '100' });
      const result = await clickHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    });

    it('returns INVALID_PARAMETER for non-numeric coordinates', async () => {
      const ctx = createMockContext({ X: 'abc', Y: '100' });
      const result = await clickHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    });

    it('handles BUTTON=middle', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ X: '10', Y: '20', BUTTON: 'middle' });
      await clickHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.button).toBe('middle');
    });

    it('handles BUTTON=center as middle', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ X: '10', Y: '20', BUTTON: 'center' });
      await clickHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.button).toBe('middle');
    });

    it('handles BUTTON=right', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ X: '10', Y: '20', BUTTON: 'right' });
      await clickHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.button).toBe('right');
    });

    it('sets coordinateMode to viewport when COORDMODE=viewport (lines 709-711)', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ X: '50', Y: '75', COORDMODE: 'viewport' });
      const result = await clickHandler(ctx);

      expect(result.success).toBe(true);
      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.coordinateMode).toBe('viewport');
    });

    it('keeps coordinateMode as page when COORDMODE is not viewport', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ X: '50', Y: '75', COORDMODE: 'page' });
      await clickHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.coordinateMode).toBe('page');
    });

    it('keeps coordinateMode as page when COORDMODE is an unrecognized value', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ X: '50', Y: '75', COORDMODE: 'absolute' });
      await clickHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.coordinateMode).toBe('page');
    });

    it('passes CONTENT parameter for form interaction', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ X: '100', Y: '200', CONTENT: 'hello<SP>world' });
      await clickHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.content).toBe('hello world');
    });

    it('handles sender throwing an error', async () => {
      mockSender.sendMessage.mockRejectedValue(new Error('Tab closed'));
      const ctx = createMockContext({ X: '10', Y: '20' });
      const result = await clickHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
      expect(result.errorMessage).toContain('Tab closed');
    });
  });

  // -------------------------------------------------------
  // 9. EVENT handler
  // -------------------------------------------------------
  describe('eventHandler', () => {
    it('sends EVENT_COMMAND and returns success', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ TYPE: 'click' });
      const result = await eventHandler(ctx);

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.type).toBe('EVENT_COMMAND');
      expect(msg.payload.eventType).toBe('click');
    });

    it('returns failure when content script reports failure', async () => {
      mockSender.sendMessage.mockResolvedValue({
        success: false,
        error: 'Event dispatch failed',
      });
      const ctx = createMockContext({ TYPE: 'click', CSS: '.btn' });
      const result = await eventHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.ELEMENT_NOT_VISIBLE);
    });

    it('returns MISSING_PARAMETER when TYPE is missing', async () => {
      const ctx = createMockContext({});
      const result = await eventHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    });

    it('builds selector from SELECTOR param with CSS: prefix', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ TYPE: 'click', SELECTOR: 'CSS:.my-btn' });
      await eventHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.selector).toEqual({ css: '.my-btn' });
    });

    it('builds selector from SELECTOR param with XPATH: prefix', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ TYPE: 'click', SELECTOR: 'XPATH://button' });
      await eventHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.selector).toEqual({ xpath: '//button' });
    });

    it('builds selector from SELECTOR param without prefix as CSS', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ TYPE: 'click', SELECTOR: '#main-btn' });
      await eventHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.selector).toEqual({ css: '#main-btn' });
    });

    it('builds selector from XPATH param directly', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ TYPE: 'focus', XPATH: '//input[@id="q"]' });
      await eventHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.selector).toEqual({ xpath: '//input[@id="q"]' });
    });

    it('builds selector from CSS param directly', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ TYPE: 'focus', CSS: 'input.search' });
      await eventHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.selector).toEqual({ css: 'input.search' });
    });

    it('resolves KEY as integer keycode', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ TYPE: 'keydown', KEY: '13' });
      await eventHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.key).toBe('Enter');
    });

    it('passes KEY as string when not a pure integer', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ TYPE: 'keydown', KEY: 'Enter' });
      await eventHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.key).toBe('Enter');
    });

    it('falls back to raw string for unknown integer keycode', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ TYPE: 'keydown', KEY: '999' });
      await eventHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.key).toBe('999');
    });

    it('parses POINT with parentheses', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ TYPE: 'mousemove', POINT: '(100,200)' });
      await eventHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.point).toEqual({ x: 100, y: 200 });
    });

    it('parses POINT without parentheses', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ TYPE: 'mousemove', POINT: '50,75' });
      await eventHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.point).toEqual({ x: 50, y: 75 });
    });

    it('parses KEYS array with brackets and integer keycodes', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ TYPE: 'keydown', KEYS: '[65,66,67]' });
      await eventHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.keys).toEqual(['a', 'b', 'c']);
    });

    it('parses KEYS array with string key names', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ TYPE: 'keydown', KEYS: '[Enter,Tab]' });
      await eventHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.keys).toEqual(['Enter', 'Tab']);
    });

    it('passes CHARS string', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ TYPE: 'input', CHARS: 'hello' });
      await eventHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.chars).toBe('hello');
    });

    it('parses POINTS array', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ TYPE: 'mousemove', POINTS: '(10,20),(30,40)' });
      await eventHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.points).toEqual([
        { x: 10, y: 20 },
        { x: 30, y: 40 },
      ]);
    });

    it('parses MODIFIERS with + separator', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ TYPE: 'click', MODIFIERS: 'ctrl+shift' });
      await eventHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.modifiers).toEqual({ ctrl: true, shift: true });
    });

    it('parses MODIFIERS with , separator', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ TYPE: 'click', MODIFIERS: 'alt,meta' });
      await eventHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.modifiers).toEqual({ alt: true, meta: true });
    });

    it('parses MODIFIERS with control and cmd aliases', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ TYPE: 'click', MODIFIERS: 'control+command' });
      await eventHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.modifiers).toEqual({ ctrl: true, meta: true });
    });

    it('omits modifiers when MODIFIERS not specified', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ TYPE: 'click' });
      await eventHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.modifiers).toBeUndefined();
    });

    it('uses !TIMEOUT_TAG as string for timeout (lines 928-931)', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const vars = new Map<string, any>();
      vars.set('!TIMEOUT_TAG', '10');
      const ctx = createMockContext({ TYPE: 'click', CSS: '.btn' }, vars);
      await eventHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.timeout).toBe(10000);
    });

    it('uses !TIMEOUT_TAG as number for timeout', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const vars = new Map<string, any>();
      vars.set('!TIMEOUT_TAG', 8);
      const ctx = createMockContext({ TYPE: 'click', CSS: '.btn' }, vars);
      await eventHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.timeout).toBe(8000);
    });

    it('uses default 6000ms timeout when !TIMEOUT_TAG is not set', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ TYPE: 'click' });
      await eventHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.timeout).toBe(6000);
    });

    it('ignores non-parseable string !TIMEOUT_TAG and uses default', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const vars = new Map<string, any>();
      vars.set('!TIMEOUT_TAG', 'notanumber');
      const ctx = createMockContext({ TYPE: 'click' }, vars);
      await eventHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.timeout).toBe(6000);
    });

    it('passes BUTTON as integer', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ TYPE: 'mousedown', BUTTON: '2' });
      await eventHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.button).toBe(2);
    });

    it('passes CHAR parameter', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ TYPE: 'keypress', CHAR: 'A' });
      await eventHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.char).toBe('A');
    });

    it('handles sender throwing an error', async () => {
      mockSender.sendMessage.mockRejectedValue(new Error('Disconnected'));
      const ctx = createMockContext({ TYPE: 'click' });
      const result = await eventHandler(ctx);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.ELEMENT_NOT_VISIBLE);
      expect(result.errorMessage).toContain('Disconnected');
    });

    it('lowercases event type', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ TYPE: 'KEYDOWN' });
      await eventHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.eventType).toBe('keydown');
    });

    it('sets bubbles and cancelable to true', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ TYPE: 'click' });
      await eventHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.bubbles).toBe(true);
      expect(msg.payload.cancelable).toBe(true);
    });

    it('does not set selector when no selector params given', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ TYPE: 'scroll' });
      await eventHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.selector).toBeUndefined();
    });

    it('prefers XPATH over SELECTOR when both provided', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ TYPE: 'click', XPATH: '//a', SELECTOR: 'CSS:.link' });
      await eventHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.selector).toEqual({ xpath: '//a' });
    });

    it('prefers CSS over SELECTOR when both provided', async () => {
      mockSender.sendMessage.mockResolvedValue({ success: true });
      const ctx = createMockContext({ TYPE: 'click', CSS: '.link', SELECTOR: 'CSS:.other' });
      await eventHandler(ctx);

      const msg = mockSender.sendMessage.mock.calls[0][0];
      expect(msg.payload.selector).toEqual({ css: '.link' });
    });
  });

  // -------------------------------------------------------
  // 10. Registration functions and exports
  // -------------------------------------------------------
  describe('registration and exports', () => {
    it('interactionHandlers contains TAG, CLICK, EVENT, EVENTS', () => {
      expect(interactionHandlers.TAG).toBe(tagHandler);
      expect(interactionHandlers.CLICK).toBe(clickHandler);
      expect(interactionHandlers.EVENT).toBe(eventHandler);
      expect(interactionHandlers.EVENTS).toBe(eventHandler);
    });

    it('registerInteractionHandlers calls registerFn for each handler', () => {
      const registerFn = vi.fn();
      registerInteractionHandlers(registerFn);

      expect(registerFn).toHaveBeenCalledWith('TAG', tagHandler);
      expect(registerFn).toHaveBeenCalledWith('CLICK', clickHandler);
      expect(registerFn).toHaveBeenCalledWith('EVENT', eventHandler);
      expect(registerFn).toHaveBeenCalledWith('EVENTS', eventHandler);
      expect(registerFn).toHaveBeenCalledTimes(4);
    });

    it('setContentScriptSender / getContentScriptSender round-trips', () => {
      const custom = { sendMessage: vi.fn() };
      setContentScriptSender(custom);
      expect(getContentScriptSender()).toBe(custom);

      setContentScriptSender(noopSender);
      expect(getContentScriptSender()).toBe(noopSender);
    });

    it('noopSender returns success by default', async () => {
      const response = await noopSender.sendMessage({} as any);
      expect(response.success).toBe(true);
      expect(response.extractedData).toBeUndefined();
    });
  });
});
