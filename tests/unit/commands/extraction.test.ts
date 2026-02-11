/**
 * Unit tests for shared/src/commands/extraction.ts
 *
 * Covers uncovered branches at lines 385, 404, and 518-565, plus comprehensive
 * coverage for all exported functions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseExtractionType,
  parseSearchSource,
  searchText,
  searchRegexp,
  extractFromElement,
  createExtractionHandlers,
  registerExtractionHandlers,
  txtPatternToRegex,
  appendExtract,
  EXTRACT_DELIMITER,
  extractHandler,
  searchHandler,
} from '../../../shared/src/commands/extraction';
import { IMACROS_ERROR_CODES } from '../../../shared/src/executor';

// ===== Test Helpers =====

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

// ===== parseExtractionType =====

describe('parseExtractionType', () => {
  it('should parse TXT', () => {
    expect(parseExtractionType('TXT')).toEqual({ type: 'TXT' });
  });

  it('should parse TEXT as TXT', () => {
    expect(parseExtractionType('TEXT')).toEqual({ type: 'TXT' });
  });

  it('should parse case-insensitively (txt)', () => {
    expect(parseExtractionType('txt')).toEqual({ type: 'TXT' });
  });

  it('should parse HTM', () => {
    expect(parseExtractionType('HTM')).toEqual({ type: 'HTM' });
  });

  it('should parse HTML as HTM', () => {
    expect(parseExtractionType('HTML')).toEqual({ type: 'HTM' });
  });

  it('should parse HREF', () => {
    expect(parseExtractionType('HREF')).toEqual({ type: 'HREF' });
  });

  it('should parse ALT', () => {
    expect(parseExtractionType('ALT')).toEqual({ type: 'ALT' });
  });

  it('should parse TITLE', () => {
    expect(parseExtractionType('TITLE')).toEqual({ type: 'TITLE' });
  });

  it('should parse SRC', () => {
    expect(parseExtractionType('SRC')).toEqual({ type: 'SRC' });
  });

  it('should parse VALUE', () => {
    expect(parseExtractionType('VALUE')).toEqual({ type: 'VALUE' });
  });

  it('should parse NAME', () => {
    expect(parseExtractionType('NAME')).toEqual({ type: 'NAME' });
  });

  it('should parse ID', () => {
    expect(parseExtractionType('ID')).toEqual({ type: 'ID' });
  });

  it('should parse CLASS', () => {
    expect(parseExtractionType('CLASS')).toEqual({ type: 'CLASS' });
  });

  it('should parse ATTR=<name> format', () => {
    expect(parseExtractionType('ATTR=data-id')).toEqual({ type: 'DATA', attribute: 'data-id' });
  });

  it('should parse EXTRACT as TXT', () => {
    expect(parseExtractionType('EXTRACT')).toEqual({ type: 'TXT' });
  });

  it('should treat unknown values as custom attribute', () => {
    expect(parseExtractionType('data-custom')).toEqual({ type: 'data-custom', attribute: 'data-custom' });
  });
});

// ===== parseSearchSource =====

describe('parseSearchSource', () => {
  it('should parse TXT: prefix', () => {
    expect(parseSearchSource('TXT:hello world')).toEqual({ type: 'TXT', pattern: 'hello world' });
  });

  it('should parse TEXT: as TXT', () => {
    expect(parseSearchSource('TEXT:hello')).toEqual({ type: 'TXT', pattern: 'hello' });
  });

  it('should parse REGEXP: prefix', () => {
    expect(parseSearchSource('REGEXP:\\d+')).toEqual({ type: 'REGEXP', pattern: '\\d+' });
  });

  it('should parse REGEX: as REGEXP', () => {
    expect(parseSearchSource('REGEX:foo(bar)')).toEqual({ type: 'REGEXP', pattern: 'foo(bar)' });
  });

  it('should return null for no colon', () => {
    expect(parseSearchSource('hello')).toBeNull();
  });

  it('should return null for unknown type prefix', () => {
    expect(parseSearchSource('UNKNOWN:hello')).toBeNull();
  });

  it('should handle empty pattern', () => {
    expect(parseSearchSource('TXT:')).toEqual({ type: 'TXT', pattern: '' });
  });

  it('should handle pattern with colons', () => {
    expect(parseSearchSource('TXT:foo:bar:baz')).toEqual({ type: 'TXT', pattern: 'foo:bar:baz' });
  });
});

// ===== searchText =====

describe('searchText', () => {
  it('should find a simple text match', () => {
    const result = searchText('Hello World', 'Hello');
    expect(result.found).toBe(true);
    expect(result.match).toBe('Hello');
    expect(result.index).toBe(0);
  });

  it('should handle wildcard * matching any characters', () => {
    const result = searchText('Hello World Foo', 'Hello*Foo');
    expect(result.found).toBe(true);
    expect(result.match).toBe('Hello World Foo');
  });

  it('should be case sensitive by default', () => {
    const result = searchText('Hello World', 'hello');
    expect(result.found).toBe(false);
  });

  it('should support case-insensitive matching', () => {
    const result = searchText('Hello World', 'hello', true);
    expect(result.found).toBe(true);
    expect(result.match).toBe('Hello');
  });

  it('should return found=false when not matched', () => {
    const result = searchText('Hello World', 'xyz');
    expect(result.found).toBe(false);
    expect(result.match).toBeNull();
    expect(result.index).toBe(-1);
  });

  it('should match across whitespace variants', () => {
    const result = searchText('Hello\t\nWorld', 'Hello World');
    expect(result.found).toBe(true);
  });
});

// ===== searchRegexp =====

describe('searchRegexp', () => {
  it('should match a simple regex', () => {
    const result = searchRegexp('abc123def', '\\d+');
    expect(result.found).toBe(true);
    expect(result.match).toBe('123');
  });

  it('should use first capture group when no extractPattern', () => {
    const result = searchRegexp('Price: $42.99', 'Price:\\s+\\$(\\d+\\.\\d+)');
    expect(result.found).toBe(true);
    expect(result.match).toBe('42.99');
    expect(result.groups).toEqual(['42.99']);
  });

  it('should apply extractPattern with $1/$2 replacement', () => {
    const result = searchRegexp('John Doe', '(\\w+)\\s+(\\w+)', false, '$2, $1');
    expect(result.found).toBe(true);
    expect(result.match).toBe('Doe, John');
    expect(result.groups).toEqual(['John', 'Doe']);
  });

  it('should return empty string for out-of-range $N in extractPattern', () => {
    const result = searchRegexp('Hello', '(Hello)', false, '$1 $9');
    expect(result.found).toBe(true);
    expect(result.match).toBe('Hello ');
  });

  it('should return full match when no capture groups', () => {
    const result = searchRegexp('abc123', '\\d+');
    expect(result.found).toBe(true);
    expect(result.match).toBe('123');
    expect(result.groups).toEqual([]);
  });

  it('should return found=false when no match', () => {
    const result = searchRegexp('Hello World', '\\d+');
    expect(result.found).toBe(false);
    expect(result.match).toBeNull();
    expect(result.groups).toEqual([]);
    expect(result.index).toBe(-1);
  });

  it('should return regexError for invalid regex', () => {
    const result = searchRegexp('Hello', '[invalid');
    expect(result.found).toBe(false);
    expect(result.regexError).toContain('Can not compile regular expression');
  });

  it('should support case-insensitive matching', () => {
    const result = searchRegexp('Hello World', 'hello', true);
    expect(result.found).toBe(true);
    expect(result.match).toBe('Hello');
  });
});

// ===== txtPatternToRegex =====

describe('txtPatternToRegex', () => {
  it('should convert * to match any characters', () => {
    const regex = txtPatternToRegex('Hello*World');
    expect(new RegExp(regex).test('Hello and World')).toBe(true);
    expect(new RegExp(regex).test('HelloWorld')).toBe(true);
  });

  it('should convert space to whitespace matcher', () => {
    const regex = txtPatternToRegex('Hello World');
    expect(new RegExp(regex).test('Hello\tWorld')).toBe(true);
    expect(new RegExp(regex).test('Hello   World')).toBe(true);
  });

  it('should escape regex special characters', () => {
    const regex = txtPatternToRegex('price=$10.00');
    // The period and dollar should be escaped
    expect(new RegExp(regex).test('price=$10.00')).toBe(true);
    expect(new RegExp(regex).test('price=$10X00')).toBe(false);
  });

  it('should handle pattern with only wildcards', () => {
    const regex = txtPatternToRegex('*');
    expect(new RegExp(regex).test('anything')).toBe(true);
    expect(new RegExp(regex).test('')).toBe(true);
  });
});

// ===== appendExtract =====

describe('appendExtract', () => {
  it('should append value via addExtract', () => {
    const vars = new Map<string, any>();
    const ctx = createMockContext({}, vars);

    appendExtract(ctx, 'first');
    expect(vars.get('!EXTRACT')).toBe('first');
  });

  it('should accumulate multiple values with delimiter', () => {
    const vars = new Map<string, any>();
    const ctx = createMockContext({}, vars);

    appendExtract(ctx, 'first');
    appendExtract(ctx, 'second');
    expect(vars.get('!EXTRACT')).toBe('first[EXTRACT]second');
  });

  it('should log debug message', () => {
    const ctx = createMockContext();
    appendExtract(ctx, 'test value');
    expect(ctx._logs).toContainEqual({ level: 'debug', message: 'EXTRACT: test value' });
  });

  it('should truncate long values in log', () => {
    const ctx = createMockContext();
    const longValue = 'x'.repeat(200);
    appendExtract(ctx, longValue);
    const logEntry = ctx._logs.find((l: any) => l.level === 'debug');
    expect(logEntry.message).toContain('...');
    expect(logEntry.message.length).toBeLessThan(200);
  });
});

// ===== EXTRACT_DELIMITER =====

describe('EXTRACT_DELIMITER', () => {
  it('should be [EXTRACT]', () => {
    expect(EXTRACT_DELIMITER).toBe('[EXTRACT]');
  });
});

// ===== extractFromElement (lines 518-556) =====

describe('extractFromElement', () => {
  function createElement(overrides: Record<string, any> = {}) {
    return {
      textContent: 'textContent' in overrides ? overrides.textContent : 'Sample text',
      innerHTML: 'innerHTML' in overrides ? overrides.innerHTML : '<b>Sample</b>',
      getAttribute: vi.fn((name: string) => {
        const attrs: Record<string, string> = overrides.attributes ?? {};
        return attrs[name] ?? null;
      }),
      value: overrides.value,
    };
  }

  it('should extract TXT (textContent)', () => {
    const el = createElement({ textContent: 'Hello World' });
    expect(extractFromElement(el, 'TXT')).toBe('Hello World');
  });

  it('should extract TEXT as TXT', () => {
    const el = createElement({ textContent: 'Hello Text' });
    expect(extractFromElement(el, 'TEXT')).toBe('Hello Text');
  });

  it('should return empty string for null textContent', () => {
    const el = createElement({ textContent: null });
    expect(extractFromElement(el, 'TXT')).toBe('');
  });

  it('should extract HTM (innerHTML)', () => {
    const el = createElement({ innerHTML: '<b>Bold</b>' });
    expect(extractFromElement(el, 'HTM')).toBe('<b>Bold</b>');
  });

  it('should extract HTML as HTM', () => {
    const el = createElement({ innerHTML: '<i>Italic</i>' });
    expect(extractFromElement(el, 'HTML')).toBe('<i>Italic</i>');
  });

  it('should return empty string for undefined innerHTML', () => {
    const el = createElement();
    el.innerHTML = undefined as any;
    expect(extractFromElement(el, 'HTM')).toBe('');
  });

  it('should extract HREF attribute', () => {
    const el = createElement({ attributes: { href: 'https://example.com' } });
    expect(extractFromElement(el, 'HREF')).toBe('https://example.com');
  });

  it('should return empty string when HREF attribute is missing', () => {
    const el = createElement({ attributes: {} });
    expect(extractFromElement(el, 'HREF')).toBe('');
  });

  it('should extract ALT attribute', () => {
    const el = createElement({ attributes: { alt: 'An image' } });
    expect(extractFromElement(el, 'ALT')).toBe('An image');
  });

  it('should extract TITLE attribute', () => {
    const el = createElement({ attributes: { title: 'Tooltip text' } });
    expect(extractFromElement(el, 'TITLE')).toBe('Tooltip text');
  });

  it('should extract SRC attribute', () => {
    const el = createElement({ attributes: { src: '/images/logo.png' } });
    expect(extractFromElement(el, 'SRC')).toBe('/images/logo.png');
  });

  it('should extract VALUE from element.value property', () => {
    const el = createElement({ value: 'input-value', attributes: { value: 'attr-value' } });
    expect(extractFromElement(el, 'VALUE')).toBe('input-value');
  });

  it('should fall back to getAttribute for VALUE when element.value is undefined', () => {
    const el = createElement({ value: undefined, attributes: { value: 'attr-value' } });
    expect(extractFromElement(el, 'VALUE')).toBe('attr-value');
  });

  it('should return empty string when VALUE is not available anywhere', () => {
    const el = createElement({ value: undefined, attributes: {} });
    expect(extractFromElement(el, 'VALUE')).toBe('');
  });

  it('should extract NAME attribute', () => {
    const el = createElement({ attributes: { name: 'username' } });
    expect(extractFromElement(el, 'NAME')).toBe('username');
  });

  it('should extract ID attribute', () => {
    const el = createElement({ attributes: { id: 'main-header' } });
    expect(extractFromElement(el, 'ID')).toBe('main-header');
  });

  it('should extract CLASS attribute', () => {
    const el = createElement({ attributes: { class: 'btn btn-primary' } });
    expect(extractFromElement(el, 'CLASS')).toBe('btn btn-primary');
  });

  it('should extract custom/default attribute by name (lowercase)', () => {
    const el = createElement({ attributes: { 'data-custom': 'custom-value' } });
    expect(extractFromElement(el, 'data-custom')).toBe('custom-value');
  });

  it('should extract custom attribute with uppercase type converted to lowercase lookup', () => {
    // The default branch calls getAttribute with extractType.toLowerCase()
    // But the switch checks type.toUpperCase(), so something like "Role" hits default
    // and getAttribute is called with "role"
    const el = createElement({ attributes: { role: 'button' } });
    expect(extractFromElement(el, 'Role')).toBe('button');
  });

  it('should return empty string when custom attribute is missing', () => {
    const el = createElement({ attributes: {} });
    expect(extractFromElement(el, 'data-nonexistent')).toBe('');
  });

  it('should handle element without getAttribute', () => {
    const el = { textContent: 'text', innerHTML: '<p>html</p>' };
    expect(extractFromElement(el, 'HREF')).toBe('');
    expect(extractFromElement(el, 'TXT')).toBe('text');
  });
});

// ===== createExtractionHandlers (lines 564-569) =====

describe('createExtractionHandlers', () => {
  it('should return a map with EXTRACT and SEARCH keys', () => {
    const handlers = createExtractionHandlers();
    expect(handlers).toHaveProperty('EXTRACT');
    expect(handlers).toHaveProperty('SEARCH');
    expect(typeof handlers.EXTRACT).toBe('function');
    expect(typeof handlers.SEARCH).toBe('function');
  });

  it('should return extractHandler for EXTRACT', () => {
    const handlers = createExtractionHandlers();
    expect(handlers.EXTRACT).toBe(extractHandler);
  });

  it('should return searchHandler for SEARCH', () => {
    const handlers = createExtractionHandlers();
    expect(handlers.SEARCH).toBe(searchHandler);
  });
});

// ===== registerExtractionHandlers =====

describe('registerExtractionHandlers', () => {
  it('should call registerHandler for EXTRACT and SEARCH', () => {
    const registerFn = vi.fn();
    registerExtractionHandlers(registerFn);

    expect(registerFn).toHaveBeenCalledTimes(2);
    expect(registerFn).toHaveBeenCalledWith('EXTRACT', extractHandler);
    expect(registerFn).toHaveBeenCalledWith('SEARCH', searchHandler);
  });
});

// ===== extractHandler =====

describe('extractHandler', () => {
  it('should return error when no params', async () => {
    const ctx = createMockContext();
    // Override to have empty params
    ctx.command.parameters = [];

    const result = await extractHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    expect(result.errorMessage).toContain('EXTRACT command requires data or parameters');
  });

  it('should handle positional data (key without =)', async () => {
    const ctx = createMockContext();
    ctx.command.parameters = [
      { key: 'hello world', value: 'hello world', rawValue: 'hello world', variables: [] },
    ];

    const result = await extractHandler(ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBe('hello world');
    expect(ctx._vars.get('!EXTRACT')).toBe('hello world');
  });

  it('should handle key=value format', async () => {
    const ctx = createMockContext();
    ctx.command.parameters = [
      { key: 'DATA=something', value: 'something', rawValue: 'something', variables: [] },
    ];

    const result = await extractHandler(ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBe('something');
  });

  it('should use rawValue for positional data when available', async () => {
    const ctx = createMockContext();
    ctx.command.parameters = [
      { key: 'some text', value: '', rawValue: 'some text', variables: [] },
    ];

    const result = await extractHandler(ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBe('some text');
  });
});

// ===== searchHandler =====

describe('searchHandler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return error when SOURCE param is missing', async () => {
    const ctx = createMockContext();
    const result = await searchHandler(ctx);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    expect(result.errorMessage).toContain('SOURCE');
  });

  it('should return error for invalid SOURCE format (no colon)', async () => {
    const ctx = createMockContext({ SOURCE: 'invalidformat' });
    const result = await searchHandler(ctx);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    expect(result.errorMessage).toContain('Invalid SOURCE format');
  });

  it('should search with TXT source in local fallback', async () => {
    const vars = new Map<string, any>();
    vars.set('!URLCURRENT', 'This is some page content');
    const ctx = createMockContext({ SOURCE: 'TXT:some page' }, vars);

    const result = await searchHandler(ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBe('some page');
  });

  it('should search with REGEXP source in local fallback', async () => {
    const vars = new Map<string, any>();
    vars.set('!URLCURRENT', 'Price: $42.99');
    const ctx = createMockContext(
      { SOURCE: 'REGEXP:\\$(\\d+\\.\\d+)', EXTRACT: '$1' },
      vars,
    );

    const result = await searchHandler(ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBe('42.99');
    expect(vars.get('!EXTRACT')).toBe('42.99');
  });

  it('should return error when EXTRACT is used with TXT source', async () => {
    const ctx = createMockContext({ SOURCE: 'TXT:hello', EXTRACT: '$1' });
    const result = await searchHandler(ctx);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    expect(result.errorMessage).toContain('EXTRACT has sense only for REGEXP');
  });

  it('should return error for invalid regex in REGEXP source', async () => {
    const ctx = createMockContext({ SOURCE: 'REGEXP:[invalid' });
    const result = await searchHandler(ctx);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SYNTAX_ERROR);
    expect(result.errorMessage).toContain('Can not compile regular expression');
  });

  it('should return not found when TXT pattern does not match', async () => {
    const vars = new Map<string, any>();
    vars.set('!URLCURRENT', 'Hello World');
    const ctx = createMockContext({ SOURCE: 'TXT:xyz' }, vars);

    const result = await searchHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND);
    expect(result.errorMessage).toContain('Pattern not found');
  });

  it('should return not found when REGEXP pattern does not match', async () => {
    const vars = new Map<string, any>();
    vars.set('!URLCURRENT', 'Hello World');
    const ctx = createMockContext({ SOURCE: 'REGEXP:\\d+' }, vars);

    const result = await searchHandler(ctx);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND);
  });

  it('should not store to !EXTRACT when EXTRACT param is absent for REGEXP', async () => {
    const vars = new Map<string, any>();
    vars.set('!URLCURRENT', 'abc123def');
    const ctx = createMockContext({ SOURCE: 'REGEXP:(\\d+)' }, vars);

    const result = await searchHandler(ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBe('123');
    // !EXTRACT should NOT be set since EXTRACT param was not provided
    expect(vars.get('!EXTRACT')).toBeUndefined();
  });

  it('should support IGNORE_CASE=YES', async () => {
    const vars = new Map<string, any>();
    vars.set('!URLCURRENT', 'Hello World');
    const ctx = createMockContext({ SOURCE: 'TXT:hello', IGNORE_CASE: 'YES' }, vars);

    const result = await searchHandler(ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBe('Hello');
  });

  // Line 385: !TIMEOUT as a string value
  it('should parse timeout from string !TIMEOUT variable (line 385)', async () => {
    const vars = new Map<string, any>();
    vars.set('!TIMEOUT', '30');
    vars.set('!URLCURRENT', 'Hello World');
    const ctx = createMockContext({ SOURCE: 'TXT:Hello' }, vars);

    const result = await searchHandler(ctx);
    expect(result.success).toBe(true);
    // The handler parsed the string '30' into 30 seconds (30000ms)
    // We can verify it worked by the handler completing successfully
    expect(result.output).toBe('Hello');
  });

  it('should handle non-numeric string !TIMEOUT gracefully', async () => {
    const vars = new Map<string, any>();
    vars.set('!TIMEOUT', 'not-a-number');
    vars.set('!URLCURRENT', 'Hello World');
    const ctx = createMockContext({ SOURCE: 'TXT:Hello' }, vars);

    // NaN check means timeoutMs stays at default 60000; search still works
    const result = await searchHandler(ctx);
    expect(result.success).toBe(true);
  });

  it('should use numeric !TIMEOUT variable', async () => {
    const vars = new Map<string, any>();
    vars.set('!TIMEOUT', 10);
    vars.set('!URLCURRENT', 'Content here');
    const ctx = createMockContext({ SOURCE: 'TXT:Content' }, vars);

    const result = await searchHandler(ctx);
    expect(result.success).toBe(true);
  });

  // Line 404: catch block when content script sender import fails
  it('should log fallback when interaction module import fails (line 404)', async () => {
    // Mock the interaction module to throw on import
    vi.doMock('../../../shared/src/commands/interaction', () => {
      throw new Error('Module not found');
    });

    // Re-import searchHandler so the dynamic import('./interaction') inside it
    // picks up the doMock'd version that throws
    const { searchHandler: freshSearchHandler } = await import(
      '../../../shared/src/commands/extraction'
    );

    const vars = new Map<string, any>();
    vars.set('!URLCURRENT', 'Fallback content');
    const ctx = createMockContext({ SOURCE: 'TXT:Fallback' }, vars);

    const result = await freshSearchHandler(ctx);

    expect(result.success).toBe(true);
    expect(result.output).toBe('Fallback');
    expect(ctx._logs).toContainEqual({
      level: 'debug',
      message: 'SEARCH: Content script sender not available, using local fallback',
    });

    vi.doUnmock('../../../shared/src/commands/interaction');
  });

  it('should search in empty content when !URLCURRENT is not set', async () => {
    const ctx = createMockContext({ SOURCE: 'TXT:anything' });
    const result = await searchHandler(ctx);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND);
  });
});
