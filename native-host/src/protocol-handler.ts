/**
 * Protocol handler for imacros:// URLs
 *
 * Parses and handles imacros:// protocol URLs to trigger macro execution.
 * URL format: imacros://run?m=macroname.iim
 */

export interface ParsedProtocolUrl {
  action: string;
  macroName?: string;
  params: Record<string, string>;
}

export interface MacroExecutionRequest {
  macroName: string;
  params: Record<string, string>;
}

/**
 * Parse an imacros:// URL and extract action and parameters
 *
 * @param url - The imacros:// URL to parse
 * @returns Parsed URL components or null if invalid
 *
 * @example
 * parseProtocolUrl('imacros://run?m=test.iim')
 * // Returns: { action: 'run', macroName: 'test.iim', params: { m: 'test.iim' } }
 */
export function parseProtocolUrl(url: string): ParsedProtocolUrl | null {
  try {
    // Handle URLs that may come with or without slashes after protocol
    const normalizedUrl = url.replace('imacros://', 'imacros://');
    const parsed = new URL(normalizedUrl);

    // Extract the action (hostname or pathname)
    // imacros://run?m=test.iim -> action = 'run'
    const action = parsed.hostname || parsed.pathname.replace(/^\/+/, '');

    if (!action) {
      return null;
    }

    // Extract all query parameters
    const params: Record<string, string> = {};
    parsed.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    // Extract macro name from 'm' parameter if present
    const macroName = params.m || params.macro || undefined;

    return {
      action,
      macroName,
      params
    };
  } catch (error) {
    console.error('Failed to parse imacros:// URL:', error);
    return null;
  }
}

/**
 * Validate that a parsed URL contains required parameters for macro execution
 *
 * @param parsed - The parsed protocol URL
 * @returns true if valid for execution, false otherwise
 */
export function validateExecutionRequest(parsed: ParsedProtocolUrl): parsed is ParsedProtocolUrl & { macroName: string } {
  if (parsed.action !== 'run') {
    return false;
  }

  if (!parsed.macroName || parsed.macroName.trim() === '') {
    return false;
  }

  return true;
}

/**
 * Create a macro execution request from a parsed protocol URL
 *
 * @param parsed - The parsed and validated protocol URL
 * @returns MacroExecutionRequest object
 */
export function createExecutionRequest(parsed: ParsedProtocolUrl & { macroName: string }): MacroExecutionRequest {
  return {
    macroName: parsed.macroName,
    params: parsed.params
  };
}

/**
 * Handle an imacros:// protocol URL
 *
 * This is the main entry point for processing protocol URLs.
 * It parses the URL, validates it, and triggers the appropriate action.
 *
 * @param url - The imacros:// URL to handle
 * @param onExecute - Callback function to execute a macro
 * @returns true if the URL was handled successfully, false otherwise
 */
export function handleProtocolUrl(
  url: string,
  onExecute: (request: MacroExecutionRequest) => void
): boolean {
  const parsed = parseProtocolUrl(url);

  if (!parsed) {
    console.error('Invalid imacros:// URL:', url);
    return false;
  }

  switch (parsed.action) {
    case 'run':
      if (validateExecutionRequest(parsed)) {
        const request = createExecutionRequest(parsed);
        onExecute(request);
        return true;
      } else {
        console.error('Missing macro name in URL:', url);
        return false;
      }

    default:
      console.error('Unknown action in imacros:// URL:', parsed.action);
      return false;
  }
}

/**
 * Check if a URL is an imacros:// protocol URL
 *
 * @param url - The URL to check
 * @returns true if the URL starts with imacros://
 */
export function isImacrosProtocolUrl(url: string): boolean {
  return url.toLowerCase().startsWith('imacros://');
}
