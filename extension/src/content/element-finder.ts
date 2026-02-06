/**
 * Element Finder for iMacros
 *
 * Supports multiple element finding strategies:
 * - XPath expressions
 * - CSS selectors
 * - TAG POS TYPE ATTR iMacros-style selectors
 *
 * Also supports frame-aware element finding using the frame handler.
 */

import { getFrameHandler } from './frame-handler';

export interface ElementFinderResult {
  element: Element | null;
  elements: Element[];
  count: number;
}

export interface TagSelector {
  tag: string;
  pos: number | 'random';
  type?: string;
  attrs: Record<string, string>;
}

/**
 * Find elements using XPath expression
 */
export function findByXPath(xpath: string, contextNode: Node = document): ElementFinderResult {
  const elements: Element[] = [];

  try {
    const result = document.evaluate(
      xpath,
      contextNode,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );

    for (let i = 0; i < result.snapshotLength; i++) {
      const node = result.snapshotItem(i);
      if (node instanceof Element) {
        elements.push(node);
      }
    }
  } catch (error) {
    console.error('XPath evaluation error:', error);
  }

  return {
    element: elements[0] || null,
    elements,
    count: elements.length,
  };
}

/**
 * Find elements using CSS selector
 */
export function findByCssSelector(selector: string, contextNode: Element | Document = document): ElementFinderResult {
  const elements: Element[] = [];

  try {
    const nodeList = contextNode.querySelectorAll(selector);
    nodeList.forEach((el) => elements.push(el));
  } catch (error) {
    console.error('CSS selector error:', error);
  }

  return {
    element: elements[0] || null,
    elements,
    count: elements.length,
  };
}

/**
 * Check if a value matches a pattern with wildcard support
 * Supports * for any characters
 */
export function matchesWildcard(value: string, pattern: string): boolean {
  if (pattern === '*') {
    return true;
  }

  // Escape regex special characters except *
  const regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');

  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(value);
}

/**
 * Get text content of an element (direct text only, not descendants)
 */
export function getDirectTextContent(element: Element): string {
  let text = '';
  const childNodes = Array.from(element.childNodes);
  for (const child of childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent || '';
    }
  }
  return text.trim();
}

/**
 * Get full text content of an element (including descendants)
 */
export function getFullTextContent(element: Element): string {
  return (element.textContent || '').trim();
}

/**
 * Check if element matches text content pattern
 * TXT: prefix indicates text content matching
 */
export function matchesTextContent(element: Element, pattern: string): boolean {
  const fullText = getFullTextContent(element);
  const directText = getDirectTextContent(element);

  // Try matching both full and direct text
  return matchesWildcard(fullText, pattern) || matchesWildcard(directText, pattern);
}

/**
 * Get attribute value from element, handling special cases
 */
export function getAttributeValue(element: Element, attrName: string): string | null {
  const lowerAttrName = attrName.toLowerCase();

  // Handle special attribute names
  switch (lowerAttrName) {
    case 'txt':
    case 'text':
      return getFullTextContent(element);
    case 'class':
      return element.className || null;
    case 'innertext':
      return getFullTextContent(element);
    case 'innerhtml':
      return element.innerHTML;
    case 'outerhtml':
      return element.outerHTML;
    default:
      return element.getAttribute(attrName);
  }
}

/**
 * Check if element matches a single attribute condition
 */
export function matchesAttribute(element: Element, attrName: string, pattern: string): boolean {
  const lowerAttrName = attrName.toLowerCase();

  // Handle TXT: prefix for text content
  if (lowerAttrName === 'txt' || lowerAttrName === 'text') {
    return matchesTextContent(element, pattern);
  }

  const value = getAttributeValue(element, attrName);

  if (value === null) {
    // Attribute doesn't exist - only matches if pattern is empty or *
    return pattern === '' || pattern === '*';
  }

  return matchesWildcard(value, pattern);
}

/**
 * Check if element matches all attribute conditions
 */
export function matchesAllAttributes(element: Element, attrs: Record<string, string>): boolean {
  for (const [attrName, pattern] of Object.entries(attrs)) {
    if (!matchesAttribute(element, attrName, pattern)) {
      return false;
    }
  }
  return true;
}

/**
 * Parse iMacros TAG selector string
 * Format: TAG POS=n TYPE=type ATTR:name=value ATTR:name2=value2 ...
 *
 * Examples:
 * - TAG POS=1 TYPE=INPUT:TEXT ATTR:NAME=username
 * - TAG POS=-1 TYPE=A ATTR:TXT=Click*here
 * - TAG POS=2 TYPE=DIV ATTR:CLASS=container ATTR:ID=main
 */
export function parseTagSelector(selectorString: string): TagSelector | null {
  const selector: TagSelector = {
    tag: '*',
    pos: 1,
    attrs: {},
  };

  // Remove TAG prefix if present
  let str = selectorString.trim();
  if (str.toUpperCase().startsWith('TAG')) {
    str = str.substring(3).trim();
  }

  // Parse tokens
  const tokens = tokenizeSelector(str);

  for (const token of tokens) {
    const upperToken = token.toUpperCase();

    if (upperToken.startsWith('POS=')) {
      const posValue = token.substring(4).trim().toUpperCase();
      if (posValue.startsWith('R')) {
        selector.pos = 'random';
      } else {
        selector.pos = parseInt(posValue, 10);
        if (isNaN(selector.pos)) {
          selector.pos = 1;
        }
      }
    } else if (upperToken.startsWith('TYPE=')) {
      selector.type = token.substring(5);
      // Extract tag from TYPE (e.g., INPUT:TEXT -> INPUT)
      const colonIndex = selector.type.indexOf(':');
      if (colonIndex > 0) {
        selector.tag = selector.type.substring(0, colonIndex);
      } else {
        selector.tag = selector.type;
      }
    } else if (upperToken.startsWith('ATTR:')) {
      // Parse ATTR:name=value
      const attrPart = token.substring(5);
      const eqIndex = attrPart.indexOf('=');
      if (eqIndex > 0) {
        const attrName = attrPart.substring(0, eqIndex);
        const attrValue = attrPart.substring(eqIndex + 1);
        selector.attrs[attrName] = attrValue;
      }
    }
  }

  return selector;
}

/**
 * Tokenize selector string, handling quoted values
 */
function tokenizeSelector(str: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (inQuote) {
      if (char === quoteChar) {
        inQuote = false;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      inQuote = true;
      quoteChar = char;
    } else if (char === ' ' || char === '\t') {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Check if element matches the TYPE specifier
 * TYPE can include subtype like INPUT:TEXT, INPUT:SUBMIT, etc.
 */
export function matchesType(element: Element, typeSpec: string): boolean {
  const upperType = typeSpec.toUpperCase();
  const tagName = element.tagName.toUpperCase();

  const colonIndex = upperType.indexOf(':');
  if (colonIndex > 0) {
    // Has subtype (e.g., INPUT:TEXT)
    const mainType = upperType.substring(0, colonIndex);
    const subType = upperType.substring(colonIndex + 1);

    if (tagName !== mainType && mainType !== '*') {
      return false;
    }

    // Check subtype based on element type
    if (mainType === 'INPUT') {
      const inputType = (element.getAttribute('type') || 'text').toUpperCase();
      return matchesWildcard(inputType, subType);
    } else if (mainType === 'BUTTON') {
      const buttonType = (element.getAttribute('type') || 'submit').toUpperCase();
      return matchesWildcard(buttonType, subType);
    }

    // For other elements, subtype might refer to a class or role
    const role = element.getAttribute('role')?.toUpperCase() || '';
    return matchesWildcard(role, subType);
  }

  // No subtype, just match tag name
  return tagName === upperType || upperType === '*';
}

/**
 * Find elements using TAG POS TYPE ATTR selector
 */
export function findByTagSelector(
  selector: TagSelector | string,
  contextNode: Element | Document = document
): ElementFinderResult {
  const parsedSelector = typeof selector === 'string' ? parseTagSelector(selector) : selector;

  if (!parsedSelector) {
    return { element: null, elements: [], count: 0 };
  }

  // Get all potential elements
  const tagName = parsedSelector.tag.toUpperCase() === '*' ? '*' : parsedSelector.tag;
  const allElements = Array.from(contextNode.querySelectorAll(tagName));

  // Filter by type and attributes
  const matchingElements: Element[] = [];

  for (const element of allElements) {
    // Check TYPE if specified
    if (parsedSelector.type && !matchesType(element, parsedSelector.type)) {
      continue;
    }

    // Check all attributes
    if (!matchesAllAttributes(element, parsedSelector.attrs)) {
      continue;
    }

    matchingElements.push(element);
  }

  // Apply position
  const pos = parsedSelector.pos;
  let selectedElement: Element | null = null;

  if (matchingElements.length > 0) {
    if (pos === 'random' || (typeof pos === 'string' && pos === 'random')) {
      // Random position: select a random element from matches
      const index = Math.floor(Math.random() * matchingElements.length);
      selectedElement = matchingElements[index];
    } else if (pos > 0) {
      // Positive position: 1-indexed from start
      const index = pos - 1;
      if (index < matchingElements.length) {
        selectedElement = matchingElements[index];
      }
    } else if (pos < 0) {
      // Negative position: -1 is last, -2 is second to last, etc.
      const index = matchingElements.length + pos;
      if (index >= 0) {
        selectedElement = matchingElements[index];
      }
    }
  }

  return {
    element: selectedElement,
    elements: matchingElements,
    count: matchingElements.length,
  };
}

/**
 * Unified element finder - determines the selector type and uses appropriate method
 */
export function findElement(
  selector: string,
  contextNode: Element | Document = document
): ElementFinderResult {
  const trimmedSelector = selector.trim();

  // Detect selector type
  if (trimmedSelector.startsWith('xpath=') || trimmedSelector.startsWith('XPATH=')) {
    // XPath selector
    const xpath = trimmedSelector.substring(6);
    return findByXPath(xpath, contextNode);
  }

  if (trimmedSelector.startsWith('css=') || trimmedSelector.startsWith('CSS=')) {
    // CSS selector
    const css = trimmedSelector.substring(4);
    return findByCssSelector(css, contextNode instanceof Element ? contextNode : document);
  }

  if (trimmedSelector.toUpperCase().startsWith('TAG')) {
    // iMacros TAG selector
    return findByTagSelector(trimmedSelector, contextNode);
  }

  // Check if it looks like XPath (starts with / or //)
  if (trimmedSelector.startsWith('/') || trimmedSelector.startsWith('(')) {
    return findByXPath(trimmedSelector, contextNode);
  }

  // Default to CSS selector
  return findByCssSelector(trimmedSelector, contextNode instanceof Element ? contextNode : document);
}

/**
 * Find element with wait/retry logic
 */
export async function findElementWithWait(
  selector: string,
  options: {
    timeout?: number;
    interval?: number;
    contextNode?: Element | Document;
  } = {}
): Promise<ElementFinderResult> {
  const { timeout = 5000, interval = 100, contextNode = document } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = findElement(selector, contextNode);

    if (result.element) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  // Return empty result after timeout
  return { element: null, elements: [], count: 0 };
}

// ===== Frame-Aware Element Finding =====

/**
 * Find element in the currently selected frame
 * Uses the frame handler to determine the correct document context
 */
export function findElementInFrame(selector: string): ElementFinderResult {
  const frameHandler = getFrameHandler();
  const doc = frameHandler.getCurrentDocument();

  if (!doc) {
    console.warn('[iMacros] Cannot find element: frame not accessible');
    return { element: null, elements: [], count: 0 };
  }

  return findElement(selector, doc);
}

/**
 * Find element in the currently selected frame with wait/retry logic
 */
export async function findElementInFrameWithWait(
  selector: string,
  options: {
    timeout?: number;
    interval?: number;
  } = {}
): Promise<ElementFinderResult> {
  const frameHandler = getFrameHandler();
  const { timeout = 5000, interval = 100 } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const doc = frameHandler.getCurrentDocument();

    if (doc) {
      const result = findElement(selector, doc);
      if (result.element) {
        return result;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  // Return empty result after timeout
  return { element: null, elements: [], count: 0 };
}

/**
 * Get the document of the currently selected frame
 */
export function getCurrentFrameDocument(): Document | null {
  const frameHandler = getFrameHandler();
  return frameHandler.getCurrentDocument();
}

/**
 * Get the window of the currently selected frame
 */
export function getCurrentFrameWindow(): Window | null {
  const frameHandler = getFrameHandler();
  return frameHandler.getCurrentWindow();
}

// Export all functions for testing and external use
export default {
  findByXPath,
  findByCssSelector,
  findByTagSelector,
  findElement,
  findElementWithWait,
  findElementInFrame,
  findElementInFrameWithWait,
  getCurrentFrameDocument,
  getCurrentFrameWindow,
  parseTagSelector,
  matchesWildcard,
  matchesAttribute,
  matchesTextContent,
  matchesType,
};
