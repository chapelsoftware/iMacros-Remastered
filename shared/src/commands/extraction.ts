/**
 * iMacros Extraction Command Handlers
 *
 * Implements EXTRACT and SEARCH commands for extracting data from web pages.
 *
 * EXTRACT command supports:
 * - TXT - Plain text extraction
 * - HTM - HTML source extraction
 * - HREF - Link URL extraction
 * - ALT - Image alt text extraction
 * - TITLE - Element title attribute extraction
 * - SRC - Image/iframe source URL extraction
 * - Other HTML attributes by name
 *
 * SEARCH command supports:
 * - SOURCE=TXT:<pattern> - Text search
 * - SOURCE=REGEXP:<pattern> - Regular expression search
 * - EXTRACT=<pattern> - Extract matching content
 *
 * Multiple extractions are concatenated with [EXTRACT] delimiter.
 */

import {
  CommandHandler,
  CommandContext,
  CommandResult,
  IMACROS_ERROR_CODES,
} from '../executor';

/**
 * Type of extraction to perform
 */
export type ExtractionType =
  | 'TXT'      // Plain text
  | 'HTM'      // HTML source
  | 'HREF'     // Link URL
  | 'ALT'      // Alt attribute
  | 'TITLE'    // Title attribute
  | 'SRC'      // Src attribute
  | 'VALUE'    // Form value
  | 'NAME'     // Name attribute
  | 'ID'       // ID attribute
  | 'CLASS'    // Class attribute
  | 'DATA'     // data-* attributes
  | string;    // Any other attribute

/**
 * Result of an extraction operation
 */
export interface ExtractionResult {
  success: boolean;
  value: string;
  error?: string;
}

/**
 * Options for extraction
 */
export interface ExtractionOptions {
  /** Type of extraction (TXT, HTM, HREF, etc.) */
  type: ExtractionType;
  /** Optional attribute name for generic attribute extraction */
  attribute?: string;
}

/**
 * Parse extraction type from CONTENT parameter
 *
 * Format: EXTRACT | ATTR=<attrname> | TXT | HTM
 */
export function parseExtractionType(content: string): ExtractionOptions {
  const upper = content.toUpperCase();

  // Check for explicit types
  if (upper === 'TXT' || upper === 'TEXT') {
    return { type: 'TXT' };
  }
  if (upper === 'HTM' || upper === 'HTML') {
    return { type: 'HTM' };
  }
  if (upper === 'HREF') {
    return { type: 'HREF' };
  }
  if (upper === 'ALT') {
    return { type: 'ALT' };
  }
  if (upper === 'TITLE') {
    return { type: 'TITLE' };
  }
  if (upper === 'SRC') {
    return { type: 'SRC' };
  }
  if (upper === 'VALUE') {
    return { type: 'VALUE' };
  }
  if (upper === 'NAME') {
    return { type: 'NAME' };
  }
  if (upper === 'ID') {
    return { type: 'ID' };
  }
  if (upper === 'CLASS') {
    return { type: 'CLASS' };
  }

  // Check for ATTR=<name> format
  if (upper.startsWith('ATTR=')) {
    return { type: 'DATA', attribute: content.substring(5) };
  }

  // Default to TXT for generic EXTRACT
  if (upper === 'EXTRACT') {
    return { type: 'TXT' };
  }

  // Treat as custom attribute
  return { type: content, attribute: content };
}

/**
 * Search source type
 */
export type SearchSourceType = 'TXT' | 'REGEXP';

/**
 * Parse SEARCH SOURCE parameter
 *
 * Format: TXT:<pattern> | REGEXP:<pattern>
 */
export function parseSearchSource(source: string): {
  type: SearchSourceType;
  pattern: string;
} | null {
  const colonIndex = source.indexOf(':');
  if (colonIndex === -1) {
    return null;
  }

  const type = source.substring(0, colonIndex).toUpperCase();
  const pattern = source.substring(colonIndex + 1);

  if (type === 'TXT' || type === 'TEXT') {
    return { type: 'TXT', pattern };
  }
  if (type === 'REGEXP' || type === 'REGEX') {
    return { type: 'REGEXP', pattern };
  }

  return null;
}

/**
 * The delimiter used to separate multiple extractions
 */
export const EXTRACT_DELIMITER = '[EXTRACT]';

/**
 * Append extracted value to !EXTRACT variable
 *
 * Uses addExtractData to properly accumulate with [EXTRACT] delimiter (iMacros 8.9.7 behavior).
 */
export function appendExtract(ctx: CommandContext, value: string): void {
  // addExtract handles both the state extractData array and the variables accumulator
  ctx.state.addExtract(value);
  ctx.log('debug', `EXTRACT: ${value.substring(0, 100)}${value.length > 100 ? '...' : ''}`);
}

/**
 * Escape regex special characters in a string, preserving * as wildcard
 * Matches original iMacros TagHandler.escapeChars behavior
 */
function escapeRegexPreserveWildcard(str: string): string {
  // Escape all regex special chars EXCEPT * (which becomes wildcard)
  // Original escapes: ^$.+?=!:|\/()[]{}
  return str.replace(/[\^$.+?=!:|\\/()\[\]{}]/g, '\\$&');
}

/**
 * Convert a TXT pattern to regex (for SEARCH SOURCE=TXT:pattern)
 * - Escapes regex special chars except *
 * - Converts * to match any characters including newlines
 * - Converts space to match any whitespace
 */
export function txtPatternToRegex(pattern: string): string {
  let regexPattern = escapeRegexPreserveWildcard(pattern);
  // Replace * with pattern that matches anything including newlines
  regexPattern = regexPattern.replace(/\*/g, '(?:[\\r\\n]|.)*');
  // Replace space with flexible whitespace matching
  regexPattern = regexPattern.replace(/ /g, '\\s+');
  return regexPattern;
}

/**
 * Search for text pattern in content (with iMacros wildcard support)
 * - * matches any characters (including newlines)
 * - Spaces match any whitespace
 */
export function searchText(
  content: string,
  pattern: string,
  ignoreCase: boolean = false
): { found: boolean; match: string | null; index: number } {
  const flags = ignoreCase ? 'i' : '';
  const regexPattern = txtPatternToRegex(pattern);

  try {
    const regex = new RegExp(regexPattern, flags);
    const match = content.match(regex);

    if (match) {
      return {
        found: true,
        match: match[0],
        index: match.index ?? -1,
      };
    }
  } catch (e) {
    // Invalid regex pattern
  }

  return { found: false, match: null, index: -1 };
}

/**
 * Search for regex pattern in content
 */
export function searchRegexp(
  content: string,
  pattern: string,
  ignoreCase: boolean = false,
  extractPattern?: string
): { found: boolean; match: string | null; groups: string[]; index: number } {
  try {
    const flags = ignoreCase ? 'gi' : 'g';
    const regex = new RegExp(pattern, flags);
    const match = regex.exec(content);

    if (match) {
      let extractedValue = match[0];

      // If there's an extract pattern with groups, use it
      if (extractPattern && match.length > 1) {
        // Replace $1, $2, etc. with captured groups
        extractedValue = extractPattern.replace(/\$(\d+)/g, (_, n) => {
          const groupIndex = parseInt(n, 10);
          return groupIndex < match.length ? match[groupIndex] : '';
        });
      } else if (match.length > 1) {
        // Use first capture group if available
        extractedValue = match[1];
      }

      return {
        found: true,
        match: extractedValue,
        groups: match.slice(1),
        index: match.index ?? -1,
      };
    }

    return { found: false, match: null, groups: [], index: -1 };
  } catch (e) {
    return { found: false, match: null, groups: [], index: -1 };
  }
}

/**
 * EXTRACT command handler
 *
 * Extracts data from page elements based on TAG position and stores in !EXTRACT.
 *
 * This is a stub that needs DOM access to actually extract data.
 * In the executor context, it will be replaced by a platform-specific handler.
 *
 * Command syntax:
 *   TAG POS=1 TYPE=A ATTR=HREF:* EXTRACT=HREF
 *   TAG POS=1 TYPE=* ATTR=TXT:* EXTRACT=TXT
 *   EXTRACT <data>  (direct extraction of literal data)
 */
export const extractHandler: CommandHandler = async (ctx): Promise<CommandResult> => {
  // Check if this is a direct EXTRACT command (EXTRACT <data>)
  // vs extraction via TAG command (which has EXTRACT parameter)
  const params = ctx.command.parameters;

  if (params.length === 0) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'EXTRACT command requires data or parameters',
    };
  }

  // Direct EXTRACT with literal data
  // EXTRACT "some text" or EXTRACT {{!VAR1}}
  const firstParam = params[0];
  let extractValue: string;

  if (firstParam.key && !firstParam.key.includes('=')) {
    // This is positional data
    extractValue = ctx.expand(firstParam.rawValue || firstParam.key);
  } else {
    // This might be a key=value format
    extractValue = ctx.expand(firstParam.value);
  }

  // Store the extracted value
  appendExtract(ctx, extractValue);

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
    output: extractValue,
  };
};

/**
 * SEARCH command handler
 *
 * Searches page content for text or regex patterns.
 *
 * Command syntax:
 *   SEARCH SOURCE=TXT:<pattern>
 *   SEARCH SOURCE=REGEXP:<pattern>
 *   SEARCH SOURCE=TXT:<pattern> IGNORE_CASE=YES
 *   SEARCH SOURCE=REGEXP:<pattern> EXTRACT=$1
 *
 * Sends SEARCH_COMMAND to content script which searches document.documentElement.innerHTML.
 * Falls back to local search in !URLCURRENT if no content script sender is available.
 */
export const searchHandler: CommandHandler = async (ctx): Promise<CommandResult> => {
  const sourceParam = ctx.getParam('SOURCE');

  if (!sourceParam) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'SEARCH command requires SOURCE parameter',
    };
  }

  // Parse the source type and pattern
  const parsed = parseSearchSource(ctx.expand(sourceParam));
  if (!parsed) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
      errorMessage: `Invalid SOURCE format: ${sourceParam}. Expected TXT:<pattern> or REGEXP:<pattern>`,
    };
  }

  // Validate: EXTRACT parameter only makes sense with REGEXP
  const extractPattern = ctx.getParam('EXTRACT');
  if (extractPattern && parsed.type !== 'REGEXP') {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
      errorMessage: 'EXTRACT has sense only for REGEXP search',
    };
  }

  // Get optional parameters
  const ignoreCaseParam = ctx.getParam('IGNORE_CASE');
  const ignoreCase = ignoreCaseParam?.toUpperCase() === 'YES';

  // Try to use content script sender (for browser context)
  // Dynamically import to avoid circular dependencies
  try {
    const interactionModule = await import('./interaction');
    const sender = interactionModule.getContentScriptSender();

    // Check if we have a real sender (not the noop)
    // The noop sender is used when no content script is available
    const message = {
      id: `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'SEARCH_COMMAND' as const,
      timestamp: Date.now(),
      payload: {
        sourceType: parsed.type,
        pattern: parsed.pattern,
        ignoreCase,
        extractPattern: extractPattern || undefined,
      },
    };

    ctx.log('debug', `SEARCH: type=${parsed.type}, pattern=${parsed.pattern}, ignoreCase=${ignoreCase}`);

    const response = await sender.sendMessage(message as any);

    if (response.success && response.extractedData !== undefined) {
      appendExtract(ctx, response.extractedData);
      return {
        success: true,
        errorCode: IMACROS_ERROR_CODES.OK,
        output: response.extractedData,
      };
    }

    if (!response.success) {
      ctx.log('warn', `SEARCH pattern not found: ${parsed.pattern}`);
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND,
        errorMessage: response.error || `Pattern not found: ${parsed.pattern}`,
      };
    }
  } catch (e) {
    // Content script sender not available, fall back to local search
    ctx.log('debug', 'SEARCH: Content script sender not available, using local fallback');
  }

  // Fallback: search in !URLCURRENT (for non-browser contexts or testing)
  const content = ctx.state.getVariable('!URLCURRENT')?.toString() || '';

  let result: { found: boolean; match: string | null };

  if (parsed.type === 'TXT') {
    result = searchText(content, parsed.pattern, ignoreCase);
  } else {
    const regexResult = searchRegexp(content, parsed.pattern, ignoreCase, extractPattern || undefined);
    result = { found: regexResult.found, match: regexResult.match };
  }

  if (result.found && result.match !== null) {
    appendExtract(ctx, result.match);
    return {
      success: true,
      errorCode: IMACROS_ERROR_CODES.OK,
      output: result.match,
    };
  }

  // Search failed - pattern not found
  ctx.log('warn', `SEARCH pattern not found: ${parsed.pattern}`);
  return {
    success: false,
    errorCode: IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND,
    errorMessage: `Pattern not found: ${parsed.pattern}`,
  };
};

/**
 * Helper to extract attribute from an element (for browser implementations)
 *
 * @param element - The DOM element to extract from
 * @param extractType - The type of extraction (TXT, HTM, HREF, etc.)
 * @returns The extracted value
 */
export function extractFromElement(
  element: {
    textContent?: string | null;
    innerHTML?: string;
    getAttribute?: (name: string) => string | null;
    value?: string;
  },
  extractType: ExtractionType
): string {
  const type = extractType.toUpperCase();

  switch (type) {
    case 'TXT':
    case 'TEXT':
      return element.textContent?.trim() || '';

    case 'HTM':
    case 'HTML':
      return element.innerHTML || '';

    case 'HREF':
      return element.getAttribute?.('href') || '';

    case 'ALT':
      return element.getAttribute?.('alt') || '';

    case 'TITLE':
      return element.getAttribute?.('title') || '';

    case 'SRC':
      return element.getAttribute?.('src') || '';

    case 'VALUE':
      return element.value || element.getAttribute?.('value') || '';

    case 'NAME':
      return element.getAttribute?.('name') || '';

    case 'ID':
      return element.getAttribute?.('id') || '';

    case 'CLASS':
      return element.getAttribute?.('class') || '';

    default:
      // Try as a generic attribute
      return element.getAttribute?.(extractType.toLowerCase()) || '';
  }
}

/**
 * Create extraction handlers for the executor
 *
 * Returns a map of command handlers for EXTRACT and SEARCH commands.
 */
export function createExtractionHandlers(): Record<string, CommandHandler> {
  return {
    EXTRACT: extractHandler,
    SEARCH: searchHandler,
  };
}

/**
 * Register extraction handlers with an executor
 */
export function registerExtractionHandlers(
  registerHandler: (type: string, handler: CommandHandler) => void
): void {
  registerHandler('EXTRACT', extractHandler);
  registerHandler('SEARCH', searchHandler);
}
