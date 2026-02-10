/**
 * Unit Tests for iMacros Extraction Command Handlers
 *
 * Tests all exported functions and handlers from shared/src/commands/extraction.ts:
 * - parseExtractionType: parsing CONTENT parameter into ExtractionOptions
 * - parseSearchSource: parsing SOURCE parameter into type/pattern
 * - searchText: plain text search in content
 * - searchRegexp: regex search with capture groups and extract patterns
 * - appendExtract: appending values to !EXTRACT with delimiter
 * - extractFromElement: extracting data from DOM element mocks
 * - extractHandler: EXTRACT command handler
 * - searchHandler: SEARCH command handler
 * - createExtractionHandlers / registerExtractionHandlers: factory/registration
 * - EXTRACT_DELIMITER constant
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseExtractionType,
  parseSearchSource,
  appendExtract,
  searchText,
  searchRegexp,
  extractFromElement,
  extractHandler,
  searchHandler,
  createExtractionHandlers,
  registerExtractionHandlers,
  EXTRACT_DELIMITER,
} from '../../shared/src/commands/extraction';
import {
  createExecutor,
  MacroExecutor,
  IMACROS_ERROR_CODES,
} from '../../shared/src/executor';

// ===== Helpers =====

/**
 * Build a minimal CommandContext suitable for calling handlers directly.
 * Mirrors the real context the MacroExecutor builds in executeCommand().
 */
function buildContext(opts: {
  commandType?: string;
  parameters?: Array<{ key: string; value: string; rawValue?: string }>;
  variables?: Record<string, string>;
}) {
  const executor = createExecutor();
  const state = executor.getState();
  const vars = state.getVariables();

  // Pre-populate variables
  if (opts.variables) {
    for (const [k, v] of Object.entries(opts.variables)) {
      vars.set(k, v);
    }
  }

  const params = (opts.parameters ?? []).map((p) => ({
    key: p.key,
    value: p.value,
    rawValue: p.rawValue ?? p.value,
    variables: [],
  }));

  const command = {
    type: opts.commandType ?? 'EXTRACT',
    parameters: params,
    raw: `${opts.commandType ?? 'EXTRACT'} ${params.map((p) => `${p.key}=${p.value}`).join(' ')}`.trim(),
    lineNumber: 1,
    variables: [],
  };

  const ctx = {
    command,
    variables: vars,
    state,
    getParam: (key: string) => {
      const found = params.find(
        (p) => p.key.toUpperCase() === key.toUpperCase(),
      );
      return found?.value;
    },
    getRequiredParam: (key: string) => {
      const found = params.find(
        (p) => p.key.toUpperCase() === key.toUpperCase(),
      );
      if (!found) throw new Error(`Missing required parameter: ${key}`);
      return found.value;
    },
    expand: (text: string) => {
      const result = vars.expand(text);
      return result.expanded;
    },
    log: vi.fn(),
  };

  return { ctx, state, vars };
}

// ===== Tests =====

describe('Extraction Command Handlers', () => {
  // ----- 1. parseExtractionType -----

  describe('parseExtractionType', () => {
    it('should parse TXT to {type: "TXT"}', () => {
      expect(parseExtractionType('TXT')).toEqual({ type: 'TXT' });
    });

    it('should parse TEXT as alias for TXT', () => {
      expect(parseExtractionType('TEXT')).toEqual({ type: 'TXT' });
    });

    it('should parse HTM to {type: "HTM"}', () => {
      expect(parseExtractionType('HTM')).toEqual({ type: 'HTM' });
    });

    it('should parse HTML as alias for HTM', () => {
      expect(parseExtractionType('HTML')).toEqual({ type: 'HTM' });
    });

    it('should parse HREF to {type: "HREF"}', () => {
      expect(parseExtractionType('HREF')).toEqual({ type: 'HREF' });
    });

    it('should parse ALT to {type: "ALT"}', () => {
      expect(parseExtractionType('ALT')).toEqual({ type: 'ALT' });
    });

    it('should parse TITLE to {type: "TITLE"}', () => {
      expect(parseExtractionType('TITLE')).toEqual({ type: 'TITLE' });
    });

    it('should parse SRC to {type: "SRC"}', () => {
      expect(parseExtractionType('SRC')).toEqual({ type: 'SRC' });
    });

    it('should parse VALUE to {type: "VALUE"}', () => {
      expect(parseExtractionType('VALUE')).toEqual({ type: 'VALUE' });
    });

    it('should parse NAME to {type: "NAME"}', () => {
      expect(parseExtractionType('NAME')).toEqual({ type: 'NAME' });
    });

    it('should parse ID to {type: "ID"}', () => {
      expect(parseExtractionType('ID')).toEqual({ type: 'ID' });
    });

    it('should parse CLASS to {type: "CLASS"}', () => {
      expect(parseExtractionType('CLASS')).toEqual({ type: 'CLASS' });
    });

    it('should parse ATTR=data-custom to {type: "DATA", attribute: "data-custom"}', () => {
      expect(parseExtractionType('ATTR=data-custom')).toEqual({
        type: 'DATA',
        attribute: 'data-custom',
      });
    });

    it('should parse ATTR= with mixed-case attribute preserving original case', () => {
      expect(parseExtractionType('ATTR=dataValue')).toEqual({
        type: 'DATA',
        attribute: 'dataValue',
      });
    });

    it('should parse EXTRACT as alias for TXT', () => {
      expect(parseExtractionType('EXTRACT')).toEqual({ type: 'TXT' });
    });

    it('should treat unknown values as custom attribute', () => {
      expect(parseExtractionType('CUSTOM')).toEqual({
        type: 'CUSTOM',
        attribute: 'CUSTOM',
      });
    });

    it('should be case insensitive for known types', () => {
      expect(parseExtractionType('txt')).toEqual({ type: 'TXT' });
      expect(parseExtractionType('Htm')).toEqual({ type: 'HTM' });
      expect(parseExtractionType('href')).toEqual({ type: 'HREF' });
      expect(parseExtractionType('alt')).toEqual({ type: 'ALT' });
      expect(parseExtractionType('title')).toEqual({ type: 'TITLE' });
      expect(parseExtractionType('src')).toEqual({ type: 'SRC' });
      expect(parseExtractionType('value')).toEqual({ type: 'VALUE' });
      expect(parseExtractionType('name')).toEqual({ type: 'NAME' });
      expect(parseExtractionType('id')).toEqual({ type: 'ID' });
      expect(parseExtractionType('class')).toEqual({ type: 'CLASS' });
      expect(parseExtractionType('extract')).toEqual({ type: 'TXT' });
    });

    it('should be case insensitive for ATTR= prefix', () => {
      expect(parseExtractionType('attr=foo')).toEqual({
        type: 'DATA',
        attribute: 'foo',
      });
    });
  });

  // ----- 2. parseSearchSource -----

  describe('parseSearchSource', () => {
    it('should parse TXT:hello to {type: "TXT", pattern: "hello"}', () => {
      expect(parseSearchSource('TXT:hello')).toEqual({
        type: 'TXT',
        pattern: 'hello',
      });
    });

    it('should parse TEXT:hello as alias for TXT', () => {
      expect(parseSearchSource('TEXT:hello')).toEqual({
        type: 'TXT',
        pattern: 'hello',
      });
    });

    it('should parse REGEXP:^test.* to {type: "REGEXP", pattern: "^test.*"}', () => {
      expect(parseSearchSource('REGEXP:^test.*')).toEqual({
        type: 'REGEXP',
        pattern: '^test.*',
      });
    });

    it('should parse REGEX:pattern as alias for REGEXP', () => {
      expect(parseSearchSource('REGEX:pattern')).toEqual({
        type: 'REGEXP',
        pattern: 'pattern',
      });
    });

    it('should return null when no colon is present', () => {
      expect(parseSearchSource('hello')).toBeNull();
    });

    it('should return null for unknown type prefix', () => {
      expect(parseSearchSource('FOO:bar')).toBeNull();
    });

    it('should keep everything after the first colon as pattern', () => {
      expect(parseSearchSource('TXT:http://example.com')).toEqual({
        type: 'TXT',
        pattern: 'http://example.com',
      });
    });

    it('should handle empty pattern after colon', () => {
      expect(parseSearchSource('TXT:')).toEqual({
        type: 'TXT',
        pattern: '',
      });
    });

    it('should be case insensitive for type prefix', () => {
      expect(parseSearchSource('txt:data')).toEqual({
        type: 'TXT',
        pattern: 'data',
      });
      expect(parseSearchSource('regexp:abc')).toEqual({
        type: 'REGEXP',
        pattern: 'abc',
      });
      expect(parseSearchSource('Regex:abc')).toEqual({
        type: 'REGEXP',
        pattern: 'abc',
      });
    });
  });

  // ----- 3. searchText -----

  describe('searchText', () => {
    it('should find simple text and return match with index', () => {
      const result = searchText('hello world', 'world');
      expect(result.found).toBe(true);
      expect(result.match).toBe('world');
      expect(result.index).toBe(6);
    });

    it('should return found:false when text is not present', () => {
      const result = searchText('hello world', 'missing');
      expect(result.found).toBe(false);
      expect(result.match).toBeNull();
      expect(result.index).toBe(-1);
    });

    it('should support case insensitive search', () => {
      const result = searchText('Hello World', 'hello', true);
      expect(result.found).toBe(true);
      expect(result.match).toBe('Hello');
    });

    it('should be case sensitive by default', () => {
      const result = searchText('Hello World', 'hello');
      expect(result.found).toBe(false);
    });

    it('should escape regex special characters in pattern', () => {
      const result = searchText('price is $10.00', '$10.00');
      expect(result.found).toBe(true);
      expect(result.match).toBe('$10.00');
    });

    it('should escape brackets, parentheses, and other regex chars', () => {
      const result = searchText('foo [bar] (baz)', '[bar]');
      expect(result.found).toBe(true);
      expect(result.match).toBe('[bar]');
    });

    it('should find text at the beginning of content', () => {
      const result = searchText('start of string', 'start');
      expect(result.found).toBe(true);
      expect(result.index).toBe(0);
    });

    it('should handle empty pattern', () => {
      const result = searchText('some text', '');
      expect(result.found).toBe(true);
      expect(result.match).toBe('');
      expect(result.index).toBe(0);
    });

    it('should handle empty content', () => {
      const result = searchText('', 'text');
      expect(result.found).toBe(false);
    });
  });

  // ----- 4. searchRegexp -----

  describe('searchRegexp', () => {
    it('should find a regex match and return match with index', () => {
      const result = searchRegexp('price: 42 USD', '\\d+');
      expect(result.found).toBe(true);
      expect(result.match).toBe('42');
      expect(result.index).toBe(7);
    });

    it('should return found:false when no match', () => {
      const result = searchRegexp('hello world', '\\d+');
      expect(result.found).toBe(false);
      expect(result.match).toBeNull();
      expect(result.groups).toEqual([]);
      expect(result.index).toBe(-1);
    });

    it('should extract capture groups', () => {
      const result = searchRegexp('John Doe, age 30', '(\\w+)\\s+(\\w+)');
      expect(result.found).toBe(true);
      expect(result.groups).toEqual(['John', 'Doe']);
      // When capture groups exist and no extractPattern, returns first group
      expect(result.match).toBe('John');
    });

    it('should use extractPattern with $1-$2 to format output', () => {
      const result = searchRegexp(
        'John Doe, age 30',
        '(\\w+)\\s+(\\w+)',
        false,
        '$2-$1',
      );
      expect(result.found).toBe(true);
      expect(result.match).toBe('Doe-John');
    });

    it('should handle extractPattern with non-existent group gracefully', () => {
      const result = searchRegexp('test 123', '(\\d+)', false, '$1-$2');
      expect(result.found).toBe(true);
      // $2 does not exist, should be replaced with empty string
      expect(result.match).toBe('123-');
    });

    it('should return regexError for invalid regex (does not throw)', () => {
      const result = searchRegexp('test', '[invalid');
      expect(result.found).toBe(false);
      expect(result.match).toBeNull();
      expect(result.groups).toEqual([]);
      expect(result.index).toBe(-1);
      expect(result.regexError).toContain('Can not compile regular expression');
    });

    it('should support case insensitive search', () => {
      const result = searchRegexp('Hello World', 'hello', true);
      expect(result.found).toBe(true);
      expect(result.match).toBe('Hello');
    });

    it('should return full match when no capture groups', () => {
      const result = searchRegexp('abc 123 def', '\\d+');
      expect(result.found).toBe(true);
      expect(result.match).toBe('123');
      expect(result.groups).toEqual([]);
    });

    it('should handle empty content', () => {
      const result = searchRegexp('', '\\d+');
      expect(result.found).toBe(false);
    });
  });

  // ----- 5. appendExtract -----

  describe('appendExtract', () => {
    it('should set !EXTRACT to value on first extraction', () => {
      const { ctx, vars } = buildContext({});
      appendExtract(ctx as any, 'first value');
      expect(vars.get('!EXTRACT')).toBe('first value');
    });

    it('should accumulate extracts in the extract data array', () => {
      const { ctx, state } = buildContext({});
      appendExtract(ctx as any, 'first');
      appendExtract(ctx as any, 'second');
      // state.addExtract overwrites !EXTRACT with the latest value,
      // but the extract data array stores all values individually
      expect(state.getExtractData()).toEqual(['first', 'second']);
      // getExtractString joins them with the delimiter
      expect(state.getExtractString()).toBe('first[EXTRACT]second');
    });

    it('should chain multiple extractions in extract data', () => {
      const { ctx, state } = buildContext({});
      appendExtract(ctx as any, 'a');
      appendExtract(ctx as any, 'b');
      appendExtract(ctx as any, 'c');
      expect(state.getExtractData()).toEqual(['a', 'b', 'c']);
      expect(state.getExtractString()).toBe('a[EXTRACT]b[EXTRACT]c');
    });

    it('should call state.addExtract with the value', () => {
      const { ctx, state } = buildContext({});
      appendExtract(ctx as any, 'test');
      const data = state.getExtractData();
      expect(data).toContain('test');
    });

    it('should call ctx.log with debug level', () => {
      const { ctx } = buildContext({});
      appendExtract(ctx as any, 'hello');
      expect(ctx.log).toHaveBeenCalledWith(
        'debug',
        expect.stringContaining('EXTRACT'),
      );
    });

    it('should truncate long values in log message', () => {
      const { ctx } = buildContext({});
      const longValue = 'x'.repeat(200);
      appendExtract(ctx as any, longValue);
      expect(ctx.log).toHaveBeenCalledWith(
        'debug',
        expect.stringContaining('...'),
      );
    });
  });

  // ----- 6. extractFromElement -----

  describe('extractFromElement', () => {
    it('should extract textContent for TXT type without trimming', () => {
      const el = { textContent: '  Hello World  ', innerHTML: '<b>Hello</b>' };
      expect(extractFromElement(el, 'TXT')).toBe('  Hello World  ');
    });

    it('should extract textContent for TEXT type', () => {
      const el = { textContent: 'Hello', innerHTML: '<b>Hello</b>' };
      expect(extractFromElement(el, 'TEXT')).toBe('Hello');
    });

    it('should extract innerHTML for HTM type', () => {
      const el = { textContent: 'text', innerHTML: '<b>Hello</b>' };
      expect(extractFromElement(el, 'HTM')).toBe('<b>Hello</b>');
    });

    it('should extract innerHTML for HTML type', () => {
      const el = { textContent: 'text', innerHTML: '<span>Hi</span>' };
      expect(extractFromElement(el, 'HTML')).toBe('<span>Hi</span>');
    });

    it('should extract href attribute for HREF type', () => {
      const el = {
        getAttribute: vi.fn((name: string) =>
          name === 'href' ? 'https://example.com' : null,
        ),
      };
      expect(extractFromElement(el, 'HREF')).toBe('https://example.com');
      expect(el.getAttribute).toHaveBeenCalledWith('href');
    });

    it('should extract alt attribute for ALT type', () => {
      const el = {
        getAttribute: vi.fn((name: string) =>
          name === 'alt' ? 'an image' : null,
        ),
      };
      expect(extractFromElement(el, 'ALT')).toBe('an image');
    });

    it('should extract title attribute for TITLE type', () => {
      const el = {
        getAttribute: vi.fn((name: string) =>
          name === 'title' ? 'tooltip' : null,
        ),
      };
      expect(extractFromElement(el, 'TITLE')).toBe('tooltip');
    });

    it('should extract src attribute for SRC type', () => {
      const el = {
        getAttribute: vi.fn((name: string) =>
          name === 'src' ? 'image.png' : null,
        ),
      };
      expect(extractFromElement(el, 'SRC')).toBe('image.png');
    });

    it('should extract element.value for VALUE type with value property', () => {
      const el = {
        value: 'input-val',
        getAttribute: vi.fn(() => null),
      };
      expect(extractFromElement(el, 'VALUE')).toBe('input-val');
    });

    it('should fallback to getAttribute("value") for VALUE type', () => {
      const el = {
        getAttribute: vi.fn((name: string) =>
          name === 'value' ? 'attr-val' : null,
        ),
      };
      expect(extractFromElement(el, 'VALUE')).toBe('attr-val');
    });

    it('should extract name attribute for NAME type', () => {
      const el = {
        getAttribute: vi.fn((name: string) =>
          name === 'name' ? 'fieldname' : null,
        ),
      };
      expect(extractFromElement(el, 'NAME')).toBe('fieldname');
    });

    it('should extract id attribute for ID type', () => {
      const el = {
        getAttribute: vi.fn((name: string) =>
          name === 'id' ? 'myid' : null,
        ),
      };
      expect(extractFromElement(el, 'ID')).toBe('myid');
    });

    it('should extract class attribute for CLASS type', () => {
      const el = {
        getAttribute: vi.fn((name: string) =>
          name === 'class' ? 'foo bar' : null,
        ),
      };
      expect(extractFromElement(el, 'CLASS')).toBe('foo bar');
    });

    it('should use getAttribute(lowercased) for unknown types', () => {
      const el = {
        getAttribute: vi.fn((name: string) =>
          name === 'data-custom' ? 'custom-value' : null,
        ),
      };
      expect(extractFromElement(el, 'data-custom')).toBe('custom-value');
      expect(el.getAttribute).toHaveBeenCalledWith('data-custom');
    });

    it('should return empty string when attribute is missing', () => {
      const el = {
        getAttribute: vi.fn(() => null),
      };
      expect(extractFromElement(el, 'HREF')).toBe('');
      expect(extractFromElement(el, 'SRC')).toBe('');
      expect(extractFromElement(el, 'NAME')).toBe('');
    });

    it('should return empty string when textContent is null', () => {
      const el = { textContent: null };
      expect(extractFromElement(el, 'TXT')).toBe('');
    });

    it('should return empty string when innerHTML is undefined', () => {
      const el = {};
      expect(extractFromElement(el, 'HTM')).toBe('');
    });

    it('should return empty string when getAttribute is not available', () => {
      const el = {};
      expect(extractFromElement(el, 'HREF')).toBe('');
    });

    it('should be case insensitive for extractType', () => {
      const el = { textContent: 'hello' };
      expect(extractFromElement(el, 'txt')).toBe('hello');
      expect(extractFromElement(el, 'Txt')).toBe('hello');
    });
  });

  // ----- 7. extractHandler -----

  describe('extractHandler', () => {
    it('should extract literal data and store in !EXTRACT', async () => {
      const { ctx, vars } = buildContext({
        commandType: 'EXTRACT',
        parameters: [{ key: 'some text', value: 'some text' }],
      });

      const result = await extractHandler(ctx as any);

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(result.output).toBe('some text');
      expect(vars.get('!EXTRACT')).toBe('some text');
    });

    it('should return MISSING_PARAMETER when no parameters given', async () => {
      const { ctx } = buildContext({
        commandType: 'EXTRACT',
        parameters: [],
      });

      const result = await extractHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    });

    it('should expand variables in extracted data', async () => {
      const { ctx, vars } = buildContext({
        commandType: 'EXTRACT',
        parameters: [
          { key: '{{!VAR0}}', value: '{{!VAR0}}', rawValue: '{{!VAR0}}' },
        ],
        variables: { '!VAR0': 'expanded-value' },
      });

      const result = await extractHandler(ctx as any);

      expect(result.success).toBe(true);
      expect(result.output).toBe('expanded-value');
    });

    it('should use firstParam.value when key contains "=" (key=value format)', async () => {
      const { ctx, vars } = buildContext({
        commandType: 'EXTRACT',
        parameters: [{ key: 'DATA=hello', value: 'hello' }],
      });

      const result = await extractHandler(ctx as any);

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(result.output).toBe('hello');
      expect(vars.get('!EXTRACT')).toBe('hello');
    });

    it('should use firstParam.value when key is empty (falsy)', async () => {
      const { ctx, vars } = buildContext({
        commandType: 'EXTRACT',
        parameters: [{ key: '', value: 'fallback-value' }],
      });

      const result = await extractHandler(ctx as any);

      expect(result.success).toBe(true);
      expect(result.output).toBe('fallback-value');
      expect(vars.get('!EXTRACT')).toBe('fallback-value');
    });

    it('should accumulate multiple extractions in extract data', async () => {
      const { ctx, state } = buildContext({
        commandType: 'EXTRACT',
        parameters: [{ key: 'first', value: 'first' }],
      });

      await extractHandler(ctx as any);

      // Build second context reusing the same state
      const ctx2 = {
        ...ctx,
        command: {
          ...ctx.command,
          parameters: [
            { key: 'second', value: 'second', rawValue: 'second', variables: [] },
          ],
        },
      };

      await extractHandler(ctx2 as any);

      expect(state.getExtractData()).toEqual(['first', 'second']);
      expect(state.getExtractString()).toBe('first[EXTRACT]second');
    });
  });

  // ----- 8. searchHandler -----

  describe('searchHandler', () => {
    it('should return MISSING_PARAMETER when SOURCE is missing', async () => {
      const { ctx } = buildContext({
        commandType: 'SEARCH',
        parameters: [],
      });

      const result = await searchHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(result.errorMessage).toContain('SOURCE');
    });

    it('should return INVALID_PARAMETER for bad SOURCE format', async () => {
      const { ctx } = buildContext({
        commandType: 'SEARCH',
        parameters: [{ key: 'SOURCE', value: 'nocolon' }],
      });

      const result = await searchHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
      expect(result.errorMessage).toContain('Invalid SOURCE format');
    });

    it('should return INVALID_PARAMETER for unknown type prefix', async () => {
      const { ctx } = buildContext({
        commandType: 'SEARCH',
        parameters: [{ key: 'SOURCE', value: 'FOO:bar' }],
      });

      const result = await searchHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    });

    it('should perform TXT search on !URLCURRENT content', async () => {
      const { ctx, vars } = buildContext({
        commandType: 'SEARCH',
        parameters: [{ key: 'SOURCE', value: 'TXT:hello' }],
        variables: { '!URLCURRENT': 'say hello world' },
      });

      // Stub state.getVariable to return !URLCURRENT
      // The searchHandler uses ctx.state.getVariable('!URLCURRENT')
      const origGetVariable = ctx.state.getVariable.bind(ctx.state);
      vi.spyOn(ctx.state, 'getVariable').mockImplementation((name: string) => {
        if (name === '!URLCURRENT') return 'say hello world';
        return origGetVariable(name);
      });

      const result = await searchHandler(ctx as any);

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(result.output).toBe('hello');
    });

    it('should perform REGEXP search on !URLCURRENT content', async () => {
      const { ctx } = buildContext({
        commandType: 'SEARCH',
        parameters: [{ key: 'SOURCE', value: 'REGEXP:\\d+' }],
      });

      vi.spyOn(ctx.state, 'getVariable').mockImplementation((name: string) => {
        if (name === '!URLCURRENT') return 'item 42 found';
        return '';
      });

      const result = await searchHandler(ctx as any);

      expect(result.success).toBe(true);
      expect(result.output).toBe('42');
    });

    it('should return ELEMENT_NOT_FOUND when pattern not found', async () => {
      const { ctx } = buildContext({
        commandType: 'SEARCH',
        parameters: [{ key: 'SOURCE', value: 'TXT:missing' }],
      });

      vi.spyOn(ctx.state, 'getVariable').mockImplementation((name: string) => {
        if (name === '!URLCURRENT') return 'hello world';
        return '';
      });

      const result = await searchHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND);
      expect(result.errorMessage).toContain('missing');
    });

    it('should support IGNORE_CASE=YES parameter', async () => {
      const { ctx } = buildContext({
        commandType: 'SEARCH',
        parameters: [
          { key: 'SOURCE', value: 'TXT:HELLO' },
          { key: 'IGNORE_CASE', value: 'YES' },
        ],
      });

      vi.spyOn(ctx.state, 'getVariable').mockImplementation((name: string) => {
        if (name === '!URLCURRENT') return 'say hello world';
        return '';
      });

      const result = await searchHandler(ctx as any);

      expect(result.success).toBe(true);
      expect(result.output).toBe('hello');
    });

    it('should pass EXTRACT parameter as extractPattern for REGEXP', async () => {
      const { ctx } = buildContext({
        commandType: 'SEARCH',
        parameters: [
          { key: 'SOURCE', value: 'REGEXP:(\\w+)\\s(\\w+)' },
          { key: 'EXTRACT', value: '$2-$1' },
        ],
      });

      vi.spyOn(ctx.state, 'getVariable').mockImplementation((name: string) => {
        if (name === '!URLCURRENT') return 'John Doe here';
        return '';
      });

      const result = await searchHandler(ctx as any);

      expect(result.success).toBe(true);
      expect(result.output).toBe('Doe-John');
    });

    it('should NOT store match in !EXTRACT when EXTRACT param is absent (validation-only)', async () => {
      const { ctx, vars } = buildContext({
        commandType: 'SEARCH',
        parameters: [{ key: 'SOURCE', value: 'TXT:world' }],
      });

      vi.spyOn(ctx.state, 'getVariable').mockImplementation((name: string) => {
        if (name === '!URLCURRENT') return 'hello world';
        return '';
      });

      const result = await searchHandler(ctx as any);

      expect(result.success).toBe(true);
      // Without EXTRACT parameter, SEARCH is purely validation — !EXTRACT unchanged
      // (state manager initializes !EXTRACT to empty string)
      expect(vars.get('!EXTRACT')).toBe('');
    });

    it('should store match in !EXTRACT when EXTRACT param is provided', async () => {
      const { ctx, vars } = buildContext({
        commandType: 'SEARCH',
        parameters: [
          { key: 'SOURCE', value: 'REGEXP:(\\w+) (\\w+)' },
          { key: 'EXTRACT', value: '$1' },
        ],
      });

      vi.spyOn(ctx.state, 'getVariable').mockImplementation((name: string) => {
        if (name === '!URLCURRENT') return 'hello world';
        return '';
      });

      await searchHandler(ctx as any);

      expect(vars.get('!EXTRACT')).toBe('hello');
    });

    it('should return SYNTAX_ERROR for invalid regex pattern', async () => {
      const { ctx } = buildContext({
        commandType: 'SEARCH',
        parameters: [{ key: 'SOURCE', value: 'REGEXP:[invalid(' }],
      });

      vi.spyOn(ctx.state, 'getVariable').mockImplementation((name: string) => {
        if (name === '!URLCURRENT') return 'some content';
        return '';
      });

      const result = await searchHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SYNTAX_ERROR);
      expect(result.errorMessage).toContain('Can not compile regular expression');
    });

    it('should search empty content when !URLCURRENT is not set', async () => {
      const { ctx } = buildContext({
        commandType: 'SEARCH',
        parameters: [{ key: 'SOURCE', value: 'TXT:anything' }],
      });

      // Do not mock getVariable -- defaults to empty/null
      const result = await searchHandler(ctx as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND);
    });
  });

  // ----- 9. extractHandler via executor -----

  describe('extractHandler via MacroExecutor', () => {
    let executor: MacroExecutor;

    beforeEach(() => {
      executor = createExecutor();
      executor.registerHandler('EXTRACT', extractHandler);
    });

    it('should execute EXTRACT "some text" and store in extract data', async () => {
      executor.loadMacro('EXTRACT "some text"');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      // The parser keeps quotes in rawValue for positional args;
      // extractHandler uses rawValue, so the stored value includes quotes
      expect(result.extractData).toContain('"some text"');
    });
  });

  // ----- 10. searchHandler via executor -----

  describe('searchHandler via MacroExecutor', () => {
    let executor: MacroExecutor;

    beforeEach(() => {
      executor = createExecutor();
      executor.registerHandler('SEARCH', searchHandler);
    });

    it('should execute SEARCH with SOURCE=TXT:pattern (validation only)', async () => {
      executor.loadMacro('SEARCH SOURCE=TXT:hello');

      // !URLCURRENT is read-only and cannot be set via initialVariables.
      // Spy on getVariable so the handler reads our content.
      const origGetVariable = executor.getState().getVariable.bind(executor.getState());
      vi.spyOn(executor.getState(), 'getVariable').mockImplementation(
        (name: string) => {
          if (name === '!URLCURRENT') return 'hello world';
          return origGetVariable(name);
        },
      );

      const result = await executor.execute();

      expect(result.success).toBe(true);
      // Without EXTRACT parameter, SEARCH is purely validation — nothing stored
      expect(result.extractData).toEqual([]);
    });

    it('should fail with MISSING_PARAMETER when SOURCE is missing', async () => {
      executor.loadMacro('SEARCH');
      // SEARCH with no params will fail
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    });
  });

  // ----- 11. createExtractionHandlers -----

  describe('createExtractionHandlers', () => {
    it('should return an object with EXTRACT and SEARCH keys', () => {
      const handlers = createExtractionHandlers();
      expect(handlers).toHaveProperty('EXTRACT');
      expect(handlers).toHaveProperty('SEARCH');
    });

    it('should map EXTRACT to extractHandler', () => {
      const handlers = createExtractionHandlers();
      expect(handlers.EXTRACT).toBe(extractHandler);
    });

    it('should map SEARCH to searchHandler', () => {
      const handlers = createExtractionHandlers();
      expect(handlers.SEARCH).toBe(searchHandler);
    });
  });

  // ----- 12. registerExtractionHandlers -----

  describe('registerExtractionHandlers', () => {
    it('should call registerHandler for EXTRACT and SEARCH', () => {
      const mockRegister = vi.fn();
      registerExtractionHandlers(mockRegister);

      expect(mockRegister).toHaveBeenCalledTimes(2);
      expect(mockRegister).toHaveBeenCalledWith('EXTRACT', extractHandler);
      expect(mockRegister).toHaveBeenCalledWith('SEARCH', searchHandler);
    });

    it('should work with a real executor registerHandler', () => {
      const executor = createExecutor();
      registerExtractionHandlers(
        executor.registerHandler.bind(executor),
      );

      expect(executor.getHandler('EXTRACT')).toBe(extractHandler);
      expect(executor.getHandler('SEARCH')).toBe(searchHandler);
    });
  });

  // ----- 13. EXTRACT_DELIMITER constant -----

  describe('EXTRACT_DELIMITER', () => {
    it('should equal "[EXTRACT]"', () => {
      expect(EXTRACT_DELIMITER).toBe('[EXTRACT]');
    });
  });
});
