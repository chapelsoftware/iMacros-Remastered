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
  EXTRACT_DELIMITER,
} from '@shared/commands/extraction';
import {
  registerNavigationHandlers,
  setBrowserBridge,
  BrowserBridge,
  BrowserOperationMessage,
  BrowserOperationResponse,
} from '@shared/commands/navigation';

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
    it('finds "hello" in content and stores in !EXTRACT', async () => {
      const script = buildSearchScript(
        'https://example.com/hello-world',
        'SEARCH SOURCE=TXT:hello'
      );

      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(result.extractData).toContain('hello');
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
      // The match should be the text as it appears in content (lowercase)
      expect(result.extractData.length).toBeGreaterThanOrEqual(1);
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
    it('finds digits in content with \\d+ pattern', async () => {
      const script = buildSearchScript(
        'https://example.com/page123',
        'SEARCH SOURCE=REGEXP:\\d+'
      );

      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      // Should find "123" in the URL
      expect(result.extractData).toContain('123');
    });

    it('extracts first capture group when no EXTRACT param given', async () => {
      // Pattern with capture groups: (\\w+)\\.(\\w+) to match "example.com"
      const script = buildSearchScript(
        'https://example.com/path',
        'SEARCH SOURCE=REGEXP:(\\w+)\\.(com)'
      );

      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      // Without EXTRACT param, should use first capture group: "example"
      expect(result.extractData).toContain('example');
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
      // Should find "test" in the URL
      expect(result.extractData).toContain('test');
    });
  });

  // ------------------------------------------------------------------
  // 5. Multiple SEARCH calls
  // ------------------------------------------------------------------

  describe('Multiple SEARCH calls', () => {
    it('accumulates results in extractData', async () => {
      const script = [
        'URL GOTO=https://example.com/hello-world-123',
        'SEARCH SOURCE=TXT:hello',
        'SEARCH SOURCE=TXT:world',
      ].join('\n');

      executor.loadMacro(script);
      // Need errorIgnore off -- but both searches should succeed
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
        'SEARCH SOURCE=TXT:alpha',
        'SEARCH SOURCE=TXT:beta',
      ].join('\n');

      executor.loadMacro(script);
      const result = await executor.execute();

      expect(result.success).toBe(true);

      // !EXTRACTADD should contain both values with [EXTRACT] delimiter
      // (VariableContext.set for !EXTRACT pushes to extractAccumulator)
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

    it('handles regex with invalid pattern gracefully', async () => {
      const script = buildSearchScript(
        'https://example.com/content',
        'SEARCH SOURCE=REGEXP:[invalid('
      );

      executor.loadMacro(script);
      const result = await executor.execute();

      // searchRegexp catches invalid regex and returns found=false
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND);
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

  it('handles invalid regex gracefully (returns not found)', () => {
    const result = searchRegexp(content, '[invalid(');
    expect(result.found).toBe(false);
    expect(result.match).toBeNull();
    expect(result.groups).toEqual([]);
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
