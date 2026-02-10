/**
 * SEARCH Command Integration Tests
 *
 * Tests the SEARCH command handler (SOURCE=TXT, SOURCE=REGEXP) through the
 * MacroExecutor pipeline. The SEARCH handler reads page content from the
 * !URLCURRENT variable and searches for patterns in it.
 *
 * Also includes unit tests for the helper functions:
 *   - parseSearchSource
 *   - searchText
 *   - searchRegexp
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createExecutor,
  MacroExecutor,
  IMACROS_ERROR_CODES,
} from '@shared/executor';
import {
  registerExtractionHandlers,
  parseSearchSource,
  searchText,
  searchRegexp,
  txtPatternToRegex,
  EXTRACT_DELIMITER,
  searchHandler,
} from '@shared/commands/extraction';
import {
  registerNavigationHandlers,
  setBrowserBridge,
  BrowserBridge,
  BrowserOperationMessage,
  BrowserOperationResponse,
} from '@shared/commands/navigation';
import {
  setContentScriptSender,
  noopSender,
  type ContentScriptSender,
  type ContentScriptResponse,
} from '@shared/commands/interaction';

// ===== Helper to create an executor with SEARCH + URL handlers =====

/**
 * Create a MacroExecutor with extraction and navigation handlers registered,
 * and a mock BrowserBridge that returns success for navigate messages.
 *
 * Navigation handler is needed so that URL GOTO can set !URLCURRENT to
 * the content that SEARCH will search against.
 */
function createTestExecutor(): {
  executor: MacroExecutor;
  mockBridge: BrowserBridge;
} {
  const mockBridge: BrowserBridge = {
    sendMessage: vi.fn(
      async (
        _message: BrowserOperationMessage
      ): Promise<BrowserOperationResponse> => {
        return { success: true };
      }
    ),
  };

  setBrowserBridge(mockBridge);

  const executor = createExecutor();
  registerNavigationHandlers(executor);
  registerExtractionHandlers(executor.registerHandler.bind(executor));

  return { executor, mockBridge };
}

/**
 * Build a macro script that sets !URLCURRENT to the given content via
 * URL GOTO, then appends additional lines.
 */
function buildSearchScript(content: string, ...searchLines: string[]): string {
  return [`URL GOTO=${content}`, ...searchLines].join('\n');
}

// ===== SEARCH via MacroExecutor Integration Tests =====

describe('SEARCH Command Integration Tests', () => {
  let executor: MacroExecutor;

  beforeEach(() => {
    const setup = createTestExecutor();
    executor = setup.executor;
  });

  afterEach(() => {
    setBrowserBridge(null as unknown as BrowserBridge);
  });

  // ------------------------------------------------------------------
  // 1. SOURCE=TXT - basic text search
  // ------------------------------------------------------------------

  describe('SOURCE=TXT (text search)', () => {
    it('finds "hello" in content (validation only, no !EXTRACT storage without EXTRACT param)', async () => {
      const script = buildSearchScript(
        'https://example.com/hello-world',
        'SEARCH SOURCE=TXT:hello'
      );

      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      // Without EXTRACT parameter, SEARCH is purely validation — nothing stored
      expect(result.extractData).toEqual([]);
    });

    it('returns ELEMENT_NOT_FOUND when pattern is not in content', async () => {
      const script = buildSearchScript(
        'https://example.com/page',
        'SEARCH SOURCE=TXT:missing'
      );

      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND);
    });

    it('finds "Hello" case-insensitively with IGNORE_CASE=YES', async () => {
      // The URL only contains lowercase "hello"
      const script = buildSearchScript(
        'https://example.com/hello-world',
        'SEARCH SOURCE=TXT:Hello IGNORE_CASE=YES'
      );

      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      // Without EXTRACT parameter, no data stored
      expect(result.extractData).toEqual([]);
    });

    it('does NOT find "Hello" without IGNORE_CASE when content has lowercase only', async () => {
      // The URL contains "hello" in lowercase only
      const script = buildSearchScript(
        'https://example.com/hello-world',
        'SEARCH SOURCE=TXT:Hello'
      );

      executor.loadMacro(script);
      const result = await executor.execute();

      // Case-sensitive search: "Hello" should not match "hello"
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND);
    });
  });

  // ------------------------------------------------------------------
  // 2. SOURCE=REGEXP - regex search
  // ------------------------------------------------------------------

  describe('SOURCE=REGEXP (regex search)', () => {
    it('finds digits in content with \\d+ pattern (no storage without EXTRACT)', async () => {
      const script = buildSearchScript(
        'https://example.com/page123',
        'SEARCH SOURCE=REGEXP:\\d+'
      );

      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      // Without EXTRACT parameter, SEARCH is purely validation — nothing stored
      expect(result.extractData).toEqual([]);
    });

    it('validates capture group pattern without storing when no EXTRACT param', async () => {
      // Pattern with capture groups: (\\w+)\\.(\\w+) to match "example.com"
      const script = buildSearchScript(
        'https://example.com/path',
        'SEARCH SOURCE=REGEXP:(\\w+)\\.(com)'
      );

      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      // Without EXTRACT param, no data stored (validation only)
      expect(result.extractData).toEqual([]);
    });

    it('uses EXTRACT pattern for capture group substitution', async () => {
      const script = buildSearchScript(
        'https://user@domain.com/path',
        'SEARCH SOURCE=REGEXP:(\\w+)@(\\w+) EXTRACT=$1-at-$2'
      );

      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      // EXTRACT=$1-at-$2 should produce "user-at-domain"
      expect(result.extractData).toContain('user-at-domain');
    });

    it('returns ELEMENT_NOT_FOUND for non-matching regex', async () => {
      const script = buildSearchScript(
        'https://example.com/text-only',
        'SEARCH SOURCE=REGEXP:\\d{5,}'
      );

      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND);
    });
  });

  // ------------------------------------------------------------------
  // 3. Error handling
  // ------------------------------------------------------------------

  describe('Error handling', () => {
    it('returns MISSING_PARAMETER when SOURCE is not provided', async () => {
      const script = buildSearchScript(
        'https://example.com/page',
        'SEARCH'
      );

      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    });

    it('returns INVALID_PARAMETER for bad SOURCE format (INVALID:pattern)', async () => {
      const script = buildSearchScript(
        'https://example.com/page',
        'SEARCH SOURCE=INVALID:pattern'
      );

      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    });

    it('returns INVALID_PARAMETER for SOURCE without colon separator', async () => {
      const script = buildSearchScript(
        'https://example.com/page',
        'SEARCH SOURCE=noprefix'
      );

      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    });
  });

  // ------------------------------------------------------------------
  // 4. Variable expansion in SEARCH SOURCE
  // ------------------------------------------------------------------

  describe('Variable expansion', () => {
    it('expands variables in SOURCE pattern', async () => {
      const script = [
        'URL GOTO=https://example.com/test-value-here',
        'SET !VAR1 test',
        'SEARCH SOURCE=TXT:{{!VAR1}}',
      ].join('\n');

      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      // Without EXTRACT parameter, no data stored
      expect(result.extractData).toEqual([]);
    });
  });

  // ------------------------------------------------------------------
  // 5. Multiple SEARCH calls
  // ------------------------------------------------------------------

  describe('Multiple SEARCH calls', () => {
    it('without EXTRACT param, validation-only — no extractData accumulated', async () => {
      const script = [
        'URL GOTO=https://example.com/hello-world-123',
        'SEARCH SOURCE=TXT:hello',
        'SEARCH SOURCE=TXT:world',
      ].join('\n');

      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

      // Without EXTRACT parameter, SEARCH is validation-only
      expect(result.extractData).toEqual([]);
    });

    it('with EXTRACT param, accumulates results in extractData', async () => {
      const script = [
        'URL GOTO=https://example.com/hello-world-123',
        'SEARCH SOURCE=REGEXP:(hello) EXTRACT=$1',
        'SEARCH SOURCE=REGEXP:(world) EXTRACT=$1',
      ].join('\n');

      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);

      // Both values should be in extractData
      expect(result.extractData).toContain('hello');
      expect(result.extractData).toContain('world');
      expect(result.extractData.length).toBe(2);
    });

    it('concatenates extracts with [EXTRACT] delimiter in !EXTRACTADD', async () => {
      const script = [
        'URL GOTO=https://example.com/alpha-beta',
        'SEARCH SOURCE=REGEXP:(alpha) EXTRACT=$1',
        'SEARCH SOURCE=REGEXP:(beta) EXTRACT=$1',
      ].join('\n');

      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);

      // !EXTRACTADD should contain both values with [EXTRACT] delimiter
      const extractAdd = result.variables['!EXTRACTADD'];
      expect(extractAdd).toBeDefined();
      expect(String(extractAdd)).toContain('alpha');
      expect(String(extractAdd)).toContain('beta');
      expect(String(extractAdd)).toContain(EXTRACT_DELIMITER);
    });
  });

  // ------------------------------------------------------------------
  // 6. SEARCH on empty content
  // ------------------------------------------------------------------

  describe('Edge cases', () => {
    it('returns ELEMENT_NOT_FOUND when !URLCURRENT is empty', async () => {
      // Do NOT set URL GOTO first, so !URLCURRENT remains empty
      executor.loadMacro('SEARCH SOURCE=TXT:anything');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND);
    });

    it('returns SYNTAX_ERROR for invalid regex pattern', async () => {
      const script = buildSearchScript(
        'https://example.com/content',
        'SEARCH SOURCE=REGEXP:[invalid('
      );

      executor.loadMacro(script);
      const result = await executor.execute();

      // Invalid regex returns a specific compilation error (matches original error 983)
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SYNTAX_ERROR);
      expect(result.errorMessage).toContain('Can not compile regular expression');
    });
  });
});

// ===== parseSearchSource Unit Tests =====

describe('parseSearchSource', () => {
  it('parses TXT: prefix correctly', () => {
    const result = parseSearchSource('TXT:hello world');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('TXT');
    expect(result!.pattern).toBe('hello world');
  });

  it('parses TEXT: prefix as alias for TXT', () => {
    const result = parseSearchSource('TEXT:some pattern');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('TXT');
    expect(result!.pattern).toBe('some pattern');
  });

  it('parses REGEXP: prefix correctly', () => {
    const result = parseSearchSource('REGEXP:\\d+');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('REGEXP');
    expect(result!.pattern).toBe('\\d+');
  });

  it('parses REGEX: prefix as alias for REGEXP', () => {
    const result = parseSearchSource('REGEX:[a-z]+');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('REGEXP');
    expect(result!.pattern).toBe('[a-z]+');
  });

  it('is case-insensitive for the prefix', () => {
    const result = parseSearchSource('txt:test');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('TXT');
    expect(result!.pattern).toBe('test');
  });

  it('returns null when no colon is present', () => {
    const result = parseSearchSource('noprefix');
    expect(result).toBeNull();
  });

  it('returns null for unknown prefix', () => {
    const result = parseSearchSource('INVALID:pattern');
    expect(result).toBeNull();
  });

  it('handles empty pattern after colon', () => {
    const result = parseSearchSource('TXT:');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('TXT');
    expect(result!.pattern).toBe('');
  });

  it('handles pattern with colons', () => {
    const result = parseSearchSource('TXT:http://example.com:8080');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('TXT');
    expect(result!.pattern).toBe('http://example.com:8080');
  });
});

// ===== searchText Unit Tests =====

describe('searchText', () => {
  const content = 'The quick brown fox jumps over the lazy dog';

  it('finds text that exists in content', () => {
    const result = searchText(content, 'quick brown');
    expect(result.found).toBe(true);
    expect(result.match).toBe('quick brown');
    expect(result.index).toBeGreaterThanOrEqual(0);
  });

  it('returns not found for text that does not exist', () => {
    const result = searchText(content, 'missing text');
    expect(result.found).toBe(false);
    expect(result.match).toBeNull();
    expect(result.index).toBe(-1);
  });

  it('finds text case-insensitively when ignoreCase is true', () => {
    const result = searchText(content, 'QUICK BROWN', true);
    expect(result.found).toBe(true);
    expect(result.match).toBe('quick brown');
  });

  it('does not find text case-sensitively when case differs', () => {
    const result = searchText(content, 'QUICK BROWN', false);
    expect(result.found).toBe(false);
    expect(result.match).toBeNull();
  });

  it('escapes regex special characters in the pattern', () => {
    const specialContent = 'Price is $100.00 (USD)';
    const result = searchText(specialContent, '$100.00');
    expect(result.found).toBe(true);
    expect(result.match).toBe('$100.00');
  });

  it('escapes dots so they match literally, not as regex wildcards', () => {
    const dotContent = 'file.txt and file-txt';
    const result = searchText(dotContent, 'file.txt');
    expect(result.found).toBe(true);
    expect(result.match).toBe('file.txt');
  });

  it('escapes parentheses in pattern', () => {
    const parenContent = 'call function(arg)';
    const result = searchText(parenContent, 'function(arg)');
    expect(result.found).toBe(true);
    expect(result.match).toBe('function(arg)');
  });

  // ----- Wildcard (*) support tests -----

  it('supports * wildcard to match any characters', () => {
    const wildcardContent = 'Order ID: ORD-12345-ABC completed';
    const result = searchText(wildcardContent, 'ORD-*-ABC');
    expect(result.found).toBe(true);
    expect(result.match).toBe('ORD-12345-ABC');
  });

  it('supports * wildcard at end of pattern', () => {
    const wildcardContent = 'Product: Widget Pro 2000 available';
    const result = searchText(wildcardContent, 'Product:*');
    expect(result.found).toBe(true);
    expect(result.match).toContain('Product:');
  });

  it('supports * wildcard at start of pattern', () => {
    const wildcardContent = 'Email: user@example.com';
    const result = searchText(wildcardContent, '*@example.com');
    expect(result.found).toBe(true);
    expect(result.match).toContain('@example.com');
  });

  it('supports multiple * wildcards in pattern', () => {
    const wildcardContent = 'REF-ABC-123-XYZ-456';
    const result = searchText(wildcardContent, 'REF-*-XYZ-*');
    expect(result.found).toBe(true);
    expect(result.match).toBe('REF-ABC-123-XYZ-456');
  });

  it('matches across newlines with * wildcard', () => {
    const multilineContent = 'Start\nMiddle\nEnd';
    const result = searchText(multilineContent, 'Start*End');
    expect(result.found).toBe(true);
    expect(result.match).toContain('Start');
    expect(result.match).toContain('End');
  });

  it('treats space as flexible whitespace matcher', () => {
    const spacedContent = 'hello     world';
    const result = searchText(spacedContent, 'hello world');
    expect(result.found).toBe(true);
    expect(result.match).toBe('hello     world');
  });

  it('matches space with tab or newline', () => {
    const tabContent = 'hello\tworld';
    const result = searchText(tabContent, 'hello world');
    expect(result.found).toBe(true);
    expect(result.match).toBe('hello\tworld');
  });

  it('combines wildcard and space matching', () => {
    const complexContent = 'Order:   ABC-123   status: complete';
    const result = searchText(complexContent, 'Order: * status: *');
    expect(result.found).toBe(true);
  });
});

// ===== searchRegexp Unit Tests =====

describe('searchRegexp', () => {
  const content = 'Contact: user@example.com, Phone: 123-456-7890';

  it('finds a basic regex match', () => {
    const result = searchRegexp(content, '\\d{3}-\\d{3}-\\d{4}');
    expect(result.found).toBe(true);
    expect(result.match).toBe('123-456-7890');
    expect(result.index).toBeGreaterThanOrEqual(0);
  });

  it('returns capture groups', () => {
    const result = searchRegexp(content, '(\\w+)@(\\w+)\\.(\\w+)');
    expect(result.found).toBe(true);
    expect(result.groups).toEqual(['user', 'example', 'com']);
  });

  it('uses first capture group as match when no extractPattern', () => {
    const result = searchRegexp(content, '(\\w+)@(\\w+)');
    expect(result.found).toBe(true);
    // Without extractPattern, first capture group is used
    expect(result.match).toBe('user');
  });

  it('substitutes capture groups with extractPattern', () => {
    const result = searchRegexp(
      content,
      '(\\w+)@(\\w+)',
      false,
      '$1 at $2'
    );
    expect(result.found).toBe(true);
    expect(result.match).toBe('user at example');
  });

  it('returns not found for non-matching pattern', () => {
    const result = searchRegexp(content, 'zzz\\d{10}');
    expect(result.found).toBe(false);
    expect(result.match).toBeNull();
    expect(result.groups).toEqual([]);
  });

  it('supports case-insensitive search', () => {
    const result = searchRegexp(content, 'CONTACT:', true);
    expect(result.found).toBe(true);
    expect(result.match).toBe('Contact:');
  });

  it('returns regexError for invalid regex pattern', () => {
    const result = searchRegexp(content, '[invalid(');
    expect(result.found).toBe(false);
    expect(result.match).toBeNull();
    expect(result.groups).toEqual([]);
    expect(result.regexError).toContain('Can not compile regular expression');
  });

  it('returns full match when there are no capture groups', () => {
    const result = searchRegexp(content, '\\d{3}-\\d{3}-\\d{4}');
    expect(result.found).toBe(true);
    expect(result.match).toBe('123-456-7890');
    expect(result.groups).toEqual([]);
  });

  it('handles extractPattern with out-of-range group references', () => {
    const result = searchRegexp(
      content,
      '(\\w+)@(\\w+)',
      false,
      '$1-$5'
    );
    expect(result.found).toBe(true);
    // $5 is out of range, so it should be replaced with empty string
    expect(result.match).toBe('user-');
  });
});

// ===== txtPatternToRegex Unit Tests =====

describe('txtPatternToRegex', () => {
  it('escapes regex special characters except *', () => {
    const pattern = txtPatternToRegex('$100.00');
    expect(pattern).toContain('\\$');
    expect(pattern).toContain('\\.');
    // Should be able to create a valid regex
    expect(() => new RegExp(pattern)).not.toThrow();
  });

  it('converts * to match-any pattern', () => {
    const pattern = txtPatternToRegex('hello*world');
    expect(pattern).toContain('(?:[\\r\\n]|.)*');
    expect(pattern).not.toContain('\\*');
  });

  it('converts space to flexible whitespace matcher', () => {
    const pattern = txtPatternToRegex('hello world');
    expect(pattern).toContain('\\s+');
    expect(pattern).not.toContain(' ');
  });

  it('handles patterns with multiple * wildcards', () => {
    const pattern = txtPatternToRegex('*foo*bar*');
    const regex = new RegExp(pattern);
    expect(regex.test('prefix foo middle bar suffix')).toBe(true);
    expect(regex.test('foo bar')).toBe(true);
    expect(regex.test('foo only')).toBe(false);
  });

  it('handles patterns with special chars and wildcards', () => {
    const pattern = txtPatternToRegex('Price: $* (USD)');
    const regex = new RegExp(pattern);
    expect(regex.test('Price: $100.00 (USD)')).toBe(true);
    expect(regex.test('Price:  $999  (USD)')).toBe(true);
  });

  it('preserves * as wildcard, not literal asterisk', () => {
    const pattern = txtPatternToRegex('file*');
    const regex = new RegExp(pattern);
    expect(regex.test('file.txt')).toBe(true);
    expect(regex.test('filename')).toBe(true);
    expect(regex.test('files123')).toBe(true);
  });
});

// ===== EXTRACT parameter validation tests =====

describe('SEARCH EXTRACT parameter validation', () => {
  let executor: MacroExecutor;

  beforeEach(() => {
    const setup = createTestExecutor();
    executor = setup.executor;
  });

  afterEach(() => {
    setBrowserBridge(null as unknown as BrowserBridge);
  });

  it('returns error when EXTRACT is used with SOURCE=TXT', async () => {
    const script = buildSearchScript(
      'https://example.com/test',
      'SEARCH SOURCE=TXT:test EXTRACT=$1'
    );

    executor.loadMacro(script);
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    expect(result.errorMessage).toContain('EXTRACT has sense only for REGEXP');
  });

  it('allows EXTRACT with SOURCE=REGEXP', async () => {
    const script = buildSearchScript(
      'https://user@domain.com/path',
      'SEARCH SOURCE=REGEXP:(\\w+)@(\\w+) EXTRACT=$1'
    );

    executor.loadMacro(script);
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.extractData).toContain('user');
  });
});

// ===== SEARCH retry behavior with content script sender =====

describe('SEARCH retry behavior (content script sender path)', () => {
  afterEach(() => {
    // Reset to noopSender so other tests aren't affected
    setContentScriptSender(noopSender);
  });

  /**
   * Build a minimal CommandContext with a real executor state.
   */
  function buildSearchContext(opts: {
    sourceValue: string;
    extractValue?: string;
    ignoreCaseValue?: string;
    timeoutSeconds?: number;
  }) {
    const executor = createExecutor();
    const state = executor.getState();
    const vars = state.getVariables();

    // Set !TIMEOUT for retry loop control
    if (opts.timeoutSeconds !== undefined) {
      vars.set('!TIMEOUT', opts.timeoutSeconds);
    }

    const params: Array<{ key: string; value: string; rawValue: string; variables: never[] }> = [
      { key: 'SOURCE', value: opts.sourceValue, rawValue: opts.sourceValue, variables: [] },
    ];
    if (opts.extractValue) {
      params.push({ key: 'EXTRACT', value: opts.extractValue, rawValue: opts.extractValue, variables: [] });
    }
    if (opts.ignoreCaseValue) {
      params.push({ key: 'IGNORE_CASE', value: opts.ignoreCaseValue, rawValue: opts.ignoreCaseValue, variables: [] });
    }

    const command = {
      type: 'SEARCH',
      parameters: params,
      raw: `SEARCH ${params.map(p => `${p.key}=${p.value}`).join(' ')}`,
      lineNumber: 1,
      variables: [],
    };

    const ctx = {
      command,
      variables: vars,
      state,
      getParam: (key: string) => {
        const found = params.find(p => p.key.toUpperCase() === key.toUpperCase());
        return found?.value;
      },
      getRequiredParam: (key: string) => {
        const found = params.find(p => p.key.toUpperCase() === key.toUpperCase());
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

  it('retries and succeeds when content script initially returns not-found then found', async () => {
    let callCount = 0;
    const mockSender: ContentScriptSender = {
      async sendMessage(): Promise<ContentScriptResponse> {
        callCount++;
        if (callCount < 3) {
          // First two calls: pattern not found
          return { success: false, error: 'Pattern not found: hello' };
        }
        // Third call: found
        return { success: true, extractedData: 'hello' };
      },
    };

    setContentScriptSender(mockSender);

    const { ctx } = buildSearchContext({
      sourceValue: 'TXT:hello',
      extractValue: undefined,
      timeoutSeconds: 10,
    });

    const result = await searchHandler(ctx as any);

    expect(result.success).toBe(true);
    expect(result.output).toBe('hello');
    expect(callCount).toBe(3);
  });

  it('times out after !TIMEOUT when content script keeps returning not-found', async () => {
    const mockSender: ContentScriptSender = {
      async sendMessage(): Promise<ContentScriptResponse> {
        return { success: false, error: 'Pattern not found: missing' };
      },
    };

    setContentScriptSender(mockSender);

    const { ctx } = buildSearchContext({
      sourceValue: 'TXT:missing',
      timeoutSeconds: 1, // 1 second timeout for fast test
    });

    const start = Date.now();
    const result = await searchHandler(ctx as any);
    const elapsed = Date.now() - start;

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND);
    // Should have waited approximately 1 second
    expect(elapsed).toBeGreaterThanOrEqual(900);
    expect(elapsed).toBeLessThan(3000);
  });

  it('stores match in !EXTRACT when EXTRACT param is provided and content script returns data', async () => {
    const mockSender: ContentScriptSender = {
      async sendMessage(): Promise<ContentScriptResponse> {
        return { success: true, extractedData: 'user' };
      },
    };

    setContentScriptSender(mockSender);

    const { ctx, vars } = buildSearchContext({
      sourceValue: 'REGEXP:(\\w+)@(\\w+)',
      extractValue: '$1',
      timeoutSeconds: 5,
    });

    const result = await searchHandler(ctx as any);

    expect(result.success).toBe(true);
    expect(result.output).toBe('user');
    expect(vars.get('!EXTRACT')).toBe('user');
  });

  it('does NOT store in !EXTRACT when EXTRACT param is absent (browser path)', async () => {
    const mockSender: ContentScriptSender = {
      async sendMessage(): Promise<ContentScriptResponse> {
        return { success: true, extractedData: 'found-text' };
      },
    };

    setContentScriptSender(mockSender);

    const { ctx, vars } = buildSearchContext({
      sourceValue: 'TXT:found',
      timeoutSeconds: 5,
    });

    const result = await searchHandler(ctx as any);

    expect(result.success).toBe(true);
    expect(result.output).toBe('found-text');
    // Without EXTRACT parameter, !EXTRACT should remain empty
    expect(vars.get('!EXTRACT')).toBe('');
  });

  it('does NOT use retry path when noopSender is active (falls back to local search)', async () => {
    // noopSender is default — should use local !URLCURRENT fallback
    setContentScriptSender(noopSender);

    const { ctx, state } = buildSearchContext({
      sourceValue: 'TXT:hello',
      timeoutSeconds: 5,
    });

    // Mock !URLCURRENT for local fallback path
    const origGetVariable = state.getVariable.bind(state);
    vi.spyOn(state, 'getVariable').mockImplementation((name: string) => {
      if (name === '!URLCURRENT') return 'say hello world';
      return origGetVariable(name);
    });

    const result = await searchHandler(ctx as any);

    expect(result.success).toBe(true);
    expect(result.output).toBe('hello');
  });
});
