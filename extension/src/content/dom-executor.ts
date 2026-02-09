/**
 * DOM Executor for iMacros
 *
 * Receives commands from native host/background and executes them in the page context.
 * Supports TAG, CLICK, and EVENT commands using the element finder and event dispatcher.
 */

import {
  findElement,
  findElementWithWait,
  findElementInFrame,
  findElementInFrameWithWait,
  getCurrentFrameDocument,
  findByTagSelector,
  parseTagSelector,
  getAttributeValue,
  type ElementFinderResult,
} from './element-finder';

import {
  dispatchClick,
  dispatchDoubleClick,
  dispatchRightClick,
  dispatchMouseEvent,
  dispatchKeyboardEvent,
  dispatchKeyPress,
  dispatchInputEvent,
  dispatchFocusEvent,
  focusElement,
  typeText,
  type MouseEventOptions,
  type KeyboardEventOptions,
} from './event-dispatcher';

import type {
  TagCommandMessage,
  ClickCommandMessage,
  EventCommandMessage,
  SearchCommandMessage,
  ContentScriptResponse,
  ElementSelector,
  TagAction,
  ExtractType,
  DOMEventType,
  SearchSourceType,
} from '@shared/commands/interaction';

// ===== Anchor State for Relative Positioning =====

/**
 * The anchor element for relative positioning (POS=R<n>).
 * Each successful TAG command updates this to the found element.
 */
let anchorElement: Element | null = null;

/**
 * Set the anchor element for subsequent relative positioning
 */
export function setAnchor(element: Element | null): void {
  anchorElement = element;
}

/**
 * Get the current anchor element, verifying it's still in DOM
 */
export function getAnchor(): Element | null {
  // Verify anchor is still in DOM
  if (anchorElement && !anchorElement.isConnected) {
    anchorElement = null;
  }
  return anchorElement;
}

/**
 * Clear the anchor (called on navigation or macro start)
 */
export function clearAnchor(): void {
  anchorElement = null;
}

// ===== Error Codes =====

/**
 * DOM executor error codes (matches iMacros error codes)
 */
export const DOM_ERROR_CODES = {
  OK: 0,
  ELEMENT_NOT_FOUND: -920,
  ELEMENT_NOT_VISIBLE: -921,
  ELEMENT_NOT_ENABLED: -922,
  TIMEOUT: -930,
  INVALID_SELECTOR: -912,
  INVALID_PARAMETER: -912,
  EXECUTION_ERROR: -970,
} as const;

export type DOMErrorCode = typeof DOM_ERROR_CODES[keyof typeof DOM_ERROR_CODES];

// ===== Result Types =====

/**
 * Result of a DOM command execution
 */
export interface DOMExecutorResult {
  success: boolean;
  errorCode: DOMErrorCode;
  errorMessage?: string;
  extractedData?: string;
  elementInfo?: {
    tagName: string;
    id?: string;
    className?: string;
    rect?: { x: number; y: number; width: number; height: number };
  };
}

// ===== Element Utilities =====

/**
 * Check if an element is visible
 */
function isElementVisible(element: Element): boolean {
  if (!(element instanceof HTMLElement)) {
    return true; // Non-HTML elements (SVG, etc.) are considered visible
  }

  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * Check if an element is enabled (not disabled)
 */
function isElementEnabled(element: Element): boolean {
  if (element instanceof HTMLButtonElement ||
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement) {
    return !element.disabled;
  }
  return true;
}

/**
 * Get element info for response
 */
function getElementInfo(element: Element): DOMExecutorResult['elementInfo'] {
  const rect = element.getBoundingClientRect();
  return {
    tagName: element.tagName,
    id: element.id || undefined,
    className: element.className || undefined,
    rect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
  };
}

/**
 * Scroll element into view if needed
 */
function scrollIntoViewIfNeeded(element: Element): void {
  const rect = element.getBoundingClientRect();
  const isInViewport = (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );

  if (!isInViewport) {
    element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
  }
}

// ===== Selector Resolution =====

/**
 * Find elements relative to an anchor using XPath following/preceding axes
 * This implements POS=R<n> (relative positioning)
 */
function findRelativeElements(
  anchor: Element,
  tagName: string | undefined,
  pos: number,
  attrString: string | undefined
): Element | null {
  const doc = anchor.ownerDocument;
  if (!doc) return null;

  // Build XPath: following or preceding axis based on sign of pos
  const axis = pos > 0 ? 'following' : 'preceding';
  const normalizedTag = tagName?.toUpperCase() || '*';

  let xpath: string;
  if (normalizedTag === '*') {
    xpath = `${axis}::*`;
  } else {
    // Case-insensitive tag name matching
    xpath = `${axis}::*[translate(local-name(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')='${normalizedTag.toLowerCase()}']`;
  }

  try {
    const result = doc.evaluate(xpath, anchor, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
    const nodes: Element[] = [];
    let node: Node | null;

    while ((node = result.iterateNext())) {
      if (node instanceof Element) {
        nodes.push(node);
      }
    }

    // Parse attribute filter if provided
    const attrMatcher = attrString ? createAttrMatcher(attrString) : null;

    const targetCount = Math.abs(pos);
    let count = 0;

    for (const el of nodes) {
      // Apply tag type filter (handles subtypes like INPUT:TEXT)
      if (tagName && tagName !== '*') {
        const colonIndex = tagName.indexOf(':');
        if (colonIndex > 0) {
          const mainType = tagName.substring(0, colonIndex).toUpperCase();
          const subType = tagName.substring(colonIndex + 1).toUpperCase();
          if (el.tagName.toUpperCase() !== mainType) continue;
          // Check subtype
          if (mainType === 'INPUT') {
            const inputType = (el.getAttribute('type') || 'text').toUpperCase();
            if (inputType !== subType && subType !== '*') continue;
          }
        } else if (el.tagName.toUpperCase() !== tagName.toUpperCase()) {
          continue;
        }
      }

      // Apply attribute filter if provided
      if (attrMatcher && !attrMatcher(el)) {
        continue;
      }

      count++;
      if (count === targetCount) {
        return el;
      }
    }
  } catch (e) {
    console.error('[iMacros] XPath evaluation error:', e);
  }

  return null;
}

/**
 * Create an attribute matcher function from an ATTR string
 * Handles formats like "NAME:value" or "TXT:text" or "NAME:v1&&CLASS:v2"
 */
function createAttrMatcher(attrStr: string): (el: Element) => boolean {
  // Parse attribute conditions
  const conditions: Array<{ attr: string; pattern: string }> = [];
  const parts = attrStr.split('&&');

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const attr = trimmed.substring(0, colonIndex).toUpperCase();
      const pattern = trimmed.substring(colonIndex + 1);
      conditions.push({ attr, pattern });
    }
  }

  return (el: Element): boolean => {
    for (const { attr, pattern } of conditions) {
      let value: string | null = null;

      // Handle special attribute names
      if (attr === 'TXT' || attr === 'TEXT') {
        value = (el.textContent || '').trim();
      } else if (attr === 'CLASS') {
        value = el.className || null;
      } else if (attr === 'ID') {
        value = el.id || null;
      } else {
        value = el.getAttribute(attr.toLowerCase());
      }

      // Match pattern (supports * wildcard) - matches original iMacros behavior
      if (value === null) {
        if (pattern !== '' && pattern !== '*') return false;
      } else {
        if (pattern === '*') continue;

        // Normalize both value and pattern (like original iMacros escapeTextContent)
        const normalizedValue = value.trim().replace(/[\r\n]+/g, '').replace(/\s+/g, ' ');
        const normalizedPattern = pattern.trim().replace(/[\r\n]+/g, '').replace(/\s+/g, ' ');

        // Build regex pattern
        let regexPattern = normalizedPattern
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '(?:[\\r\\n]|.)*');
        // Replace spaces with \s+ to match any whitespace
        regexPattern = regexPattern.replace(/ /g, '\\s+');
        // Allow leading/trailing whitespace
        if (!new RegExp(`^\\s*${regexPattern}\\s*$`, 'i').test(normalizedValue)) {
          return false;
        }
      }
    }
    return true;
  };
}

/**
 * Options for resolving selectors
 */
interface ResolveSelectorOptions {
  relative?: boolean;
}

/**
 * Resolve element selector to a find result
 * Uses frame-aware element finding to search in the currently selected frame
 */
async function resolveSelector(
  selector: ElementSelector,
  timeout: number = 5000,
  waitVisible: boolean = true,
  options?: ResolveSelectorOptions
): Promise<ElementFinderResult> {
  // Handle relative positioning
  if (options?.relative || selector.relative) {
    const anchor = getAnchor();
    if (!anchor || !anchor.isConnected) {
      // No valid anchor - return empty with helpful error
      console.warn('[iMacros] Relative positioning (POS=R) requires a prior TAG command to set anchor');
      return { element: null, elements: [], count: 0 };
    }

    const tagName = selector.type || '*';
    const pos = typeof selector.pos === 'number' ? selector.pos : 1;

    const element = findRelativeElements(anchor, tagName, pos, selector.attr);

    if (element) {
      return { element, elements: [element], count: 1 };
    }
    return { element: null, elements: [], count: 0 };
  }

  // Build selector string based on selector type
  let selectorString: string;

  if (selector.xpath) {
    selectorString = `xpath=${selector.xpath}`;
  } else if (selector.css) {
    selectorString = `css=${selector.css}`;
  } else if (selector.type || selector.attr) {
    // Build TAG selector
    const parts: string[] = ['TAG'];
    if (selector.pos !== undefined) {
      parts.push(`POS=${selector.pos === 'random' ? 'R1' : selector.pos}`);
    } else {
      parts.push('POS=1');
    }
    if (selector.type) {
      parts.push(`TYPE=${selector.type}`);
    }
    if (selector.attr) {
      // Quote the attr value to preserve spaces during tokenization
      parts.push(`ATTR="${selector.attr}"`);
    }
    selectorString = parts.join(' ');
  } else {
    // No valid selector provided
    return { element: null, elements: [], count: 0 };
  }

  // Find with wait if requested - use frame-aware functions
  if (waitVisible && timeout > 0) {
    return findElementInFrameWithWait(selectorString, { timeout, interval: 100 });
  }

  return findElementInFrame(selectorString);
}

// ===== TAG Command Execution =====

/**
 * #EANF# - Extract Attribute Not Found marker
 * Returned when an attribute doesn't exist on the element
 */
const EANF = '#EANF#';

/**
 * Extract data from an element based on extract type
 * Matches original iMacros behavior including #EANF# for missing attributes
 */
function extractFromElement(element: Element, extractType: ExtractType): string {
  const type = extractType.toUpperCase();
  const tagName = element.tagName.toLowerCase();

  switch (type) {
    case 'TXT':
    case 'TEXT':
      // Handle form elements - use value property
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return element.value;
      }
      // Handle select - return selected option text
      if (element instanceof HTMLSelectElement) {
        const selectedOption = element.options[element.selectedIndex];
        return selectedOption ? selectedOption.text : '';
      }
      // Handle table - return CSV format
      if (element instanceof HTMLTableElement) {
        const rows: string[] = [];
        for (let i = 0; i < element.rows.length; i++) {
          const row = element.rows[i];
          const cells: string[] = [];
          for (let j = 0; j < row.cells.length; j++) {
            let field = row.cells[j].textContent || '';
            // Escape quotes by doubling them
            field = field.replace(/"/g, '""');
            cells.push(field);
          }
          rows.push('"' + cells.join('","') + '"');
        }
        return rows.join('\n');
      }
      // Default - use textContent
      return (element.textContent || '').trim();

    case 'TXTALL':
      // For select elements, return all options joined with [OPTION]
      if (element instanceof HTMLSelectElement) {
        const optionTexts: string[] = [];
        for (let i = 0; i < element.options.length; i++) {
          optionTexts.push(element.options[i].text);
        }
        return optionTexts.join('[OPTION]');
      }
      // For other elements, same as TXT
      return (element.textContent || '').trim();

    case 'HTM':
    case 'HTML':
      // Use outerHTML and normalize whitespace (like original iMacros)
      const htm = element.outerHTML || '';
      return htm.replace(/[\t\n\r]/g, ' ');

    case 'HREF':
      // Check href property first (gets absolute URL), then attribute
      if ('href' in element && typeof (element as HTMLAnchorElement).href === 'string') {
        return (element as HTMLAnchorElement).href;
      }
      if (element.hasAttribute('href')) {
        return element.getAttribute('href') || '';
      }
      // Fallback to src (like original iMacros)
      if ('src' in element && typeof (element as HTMLImageElement).src === 'string') {
        return (element as HTMLImageElement).src;
      }
      if (element.hasAttribute('src')) {
        return element.getAttribute('src') || '';
      }
      return EANF;

    case 'ALT':
      if ('alt' in element) {
        return (element as HTMLImageElement).alt;
      }
      if (element.hasAttribute('alt')) {
        return element.getAttribute('alt') || '';
      }
      return EANF;

    case 'TITLE':
      if ('title' in element && typeof (element as HTMLElement).title === 'string') {
        return (element as HTMLElement).title;
      }
      if (element.hasAttribute('title')) {
        return element.getAttribute('title') || '';
      }
      return EANF;

    case 'SRC':
      if ('src' in element && typeof (element as HTMLImageElement).src === 'string') {
        return (element as HTMLImageElement).src;
      }
      if (element.hasAttribute('src')) {
        return element.getAttribute('src') || '';
      }
      return EANF;

    case 'VALUE':
      if (element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement) {
        return element.value;
      }
      if (element.hasAttribute('value')) {
        return element.getAttribute('value') || '';
      }
      return EANF;

    case 'CHECKED':
      // Return YES or NO for checkbox/radio state
      if (element instanceof HTMLInputElement &&
          (element.type === 'checkbox' || element.type === 'radio')) {
        return element.checked ? 'YES' : 'NO';
      }
      return EANF;

    case 'ID':
      return element.id || '';

    case 'CLASS':
      return element.className || '';

    case 'NAME':
      if (element.hasAttribute('name')) {
        return element.getAttribute('name') || '';
      }
      return EANF;

    default:
      // Try as a generic attribute (handles ATTR:customattr format)
      const attrName = extractType.toLowerCase();
      if (element.hasAttribute(attrName)) {
        return element.getAttribute(attrName) || '';
      }
      // Check if it's a property on the element
      if (attrName in element) {
        const val = (element as unknown as Record<string, unknown>)[attrName];
        if (typeof val === 'string') return val;
        if (typeof val === 'number' || typeof val === 'boolean') return String(val);
      }
      return EANF;
  }
}

/**
 * Parse multi-select value string like %"val1":%"val2":%"val3"
 * Returns array of values
 */
export function parseMultiSelectValues(content: string): string[] {
  const values: string[] = [];
  // Split on :% to separate each value token
  const tokens = content.split(':%');
  for (const token of tokens) {
    let val = token.trim();
    // Strip leading % if present
    if (val.startsWith('%')) {
      val = val.substring(1);
    }
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (val) {
      values.push(val);
    }
  }
  return values;
}

/**
 * Check if an option text matches a select text pattern (used with $ prefix)
 * Supports wildcard (*) matching and exact matching
 * Matches original iMacros behavior where * matches any characters including newlines
 */
export function matchesSelectTextPattern(optionText: string, pattern: string): boolean {
  if (pattern.includes('*')) {
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '(?:[\\r\\n]|.)*');  // Match newlines like original iMacros
    return new RegExp(`^\\s*${regexPattern}\\s*$`, 'i').test(optionText);
  }
  // Case-insensitive exact match with whitespace tolerance (like original)
  return optionText.trim().toLowerCase() === pattern.trim().toLowerCase();
}

/**
 * Result of setElementContent operation
 */
interface SetContentResult {
  success: boolean;
  errorMessage?: string;
}

/**
 * Set content on a form element
 * Returns detailed result for error propagation to UI logger
 */
function setElementContent(element: Element, content: string): SetContentResult {
  // Handle EVENT: prefix commands
  if (content.toUpperCase().startsWith('EVENT:')) {
    const eventCommand = content.substring(6).toUpperCase();

    if (eventCommand.startsWith('SAVETARGETAS')) {
      // Get the download URL from the element
      const url = element.getAttribute('href') || element.getAttribute('src') || '';
      if (!url) {
        return { success: false, errorMessage: 'EVENT:SAVETARGETAS - no href or src on element' };
      }

      // Try to download via temporary anchor click
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = '';
        // Extract filename from SAVETARGETAS if provided (e.g., EVENT:SAVETARGETAS=filename.pdf)
        const eqIndex = eventCommand.indexOf('=');
        if (eqIndex > 0) {
          anchor.download = eventCommand.substring(eqIndex + 1);
        }
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
      } catch (e) {
        console.warn('[iMacros] EVENT:SAVETARGETAS fallback to message', e);
      }

      // Also send message to background for cross-origin downloads
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        const filename = eventCommand.indexOf('=') > 0
          ? eventCommand.substring(eventCommand.indexOf('=') + 1)
          : '';
        chrome.runtime.sendMessage({
          type: 'DOWNLOAD_URL',
          url: url.startsWith('http') ? url : new URL(url, window.location.href).href,
          filename,
        });
      }

      return { success: true };
    }

    // Unknown EVENT: command
    return { success: false, errorMessage: `Unknown EVENT command: ${eventCommand}` };
  }

  // Handle input elements
  if (element instanceof HTMLInputElement) {
    const inputType = element.type.toLowerCase();

    // Handle checkbox/radio
    if (inputType === 'checkbox' || inputType === 'radio') {
      const shouldCheck = content.toUpperCase() === 'YES' ||
                          content.toUpperCase() === 'TRUE' ||
                          content === '1' ||
                          content.toUpperCase() === 'ON';
      element.checked = shouldCheck;
      dispatchInputEvent(element, 'input');
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true };
    }

    // Handle file input (not supported in content script)
    if (inputType === 'file') {
      return { success: false, errorMessage: 'File input not supported in content script' };
    }

    // Handle other input types (text, password, email, etc.)
    focusElement(element);
    element.value = content;
    dispatchInputEvent(element, 'input');
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true };
  }

  // Handle textarea
  if (element instanceof HTMLTextAreaElement) {
    focusElement(element);
    element.value = content;
    dispatchInputEvent(element, 'input');
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true };
  }

  // Handle select
  if (element instanceof HTMLSelectElement) {
    // Check for special prefixes
    if (content.includes(':%') && element.multiple) {
      // Multi-select: %"val1":%"val2":%"val3"
      const values = parseMultiSelectValues(content);
      // Deselect all first (like original iMacros)
      for (let i = 0; i < element.options.length; i++) {
        element.options[i].selected = false;
      }
      // Select matching options
      for (let i = 0; i < element.options.length; i++) {
        if (values.includes(element.options[i].value)) {
          element.options[i].selected = true;
        }
      }
    } else if (content.startsWith('%')) {
      // Select by value
      const value = content.substring(1);
      // Check if value exists (like original iMacros error code 924)
      let found = false;
      for (let i = 0; i < element.options.length; i++) {
        if (element.options[i].value === value) {
          element.selectedIndex = i;
          found = true;
          break;
        }
      }
      if (!found) {
        return {
          success: false,
          errorMessage: `Selected entry not available: '%${value}' [Box has ${element.options.length} entries]`
        };
      }
    } else if (content.startsWith('#')) {
      // Select by index (1-based)
      const index = parseInt(content.substring(1), 10) - 1;
      if (index < 0 || index >= element.options.length) {
        return {
          success: false,
          errorMessage: `Selected entry not available: ${index + 1} [Box has ${element.options.length} entries]`
        };
      }
      element.selectedIndex = index;
    } else if (content.startsWith('$')) {
      // Select by visible text with optional wildcard
      const textPattern = content.substring(1);
      let found = false;
      for (let i = 0; i < element.options.length; i++) {
        const optionText = element.options[i].text;
        if (matchesSelectTextPattern(optionText, textPattern)) {
          element.selectedIndex = i;
          found = true;
          break;
        }
      }
      if (!found) {
        // Match original iMacros error behavior (error code 924)
        return {
          success: false,
          errorMessage: `Selected entry not available: '$${textPattern}' [Box has ${element.options.length} entries]`
        };
      }
    } else {
      // Select by visible text (plain)
      let found = false;
      for (let i = 0; i < element.options.length; i++) {
        if (element.options[i].text === content || element.options[i].value === content) {
          element.selectedIndex = i;
          found = true;
          break;
        }
      }
      if (!found) {
        return {
          success: false,
          errorMessage: `Selected entry not available: '${content}' [Box has ${element.options.length} entries]`
        };
      }
    }
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true };
  }

  // Handle contenteditable
  if (element instanceof HTMLElement && element.isContentEditable) {
    focusElement(element);
    element.textContent = content;
    dispatchInputEvent(element, 'input');
    return { success: true };
  }

  // For other elements, try clicking (links, buttons, etc.)
  if (element instanceof HTMLAnchorElement || element instanceof HTMLButtonElement) {
    dispatchClick(element);
    return { success: true };
  }

  return { success: false, errorMessage: `Cannot set content on element: ${element.tagName}` };
}

/**
 * Execute TAG command
 */
export async function executeTagCommand(message: TagCommandMessage): Promise<DOMExecutorResult> {
  const { selector, action, timeout, waitVisible } = message.payload;

  // Check if this is relative positioning
  const isRelative = selector.relative === true;

  try {
    // Find the element, retrying until a visible one is found (if waitVisible)
    let element: Element | null = null;
    const timeoutMs = timeout || 5000;
    const startTime = Date.now();

    while (true) {
      const result = await resolveSelector(selector, waitVisible ? 0 : timeoutMs, false, { relative: isRelative });

      if (result.element) {
        if (!waitVisible) {
          element = result.element;
          break;
        }
        // waitVisible: check if the selected element (at requested POS) is visible
        if (isElementVisible(result.element)) {
          element = result.element;
          break;
        }
        // Element exists but not visible yet, will retry
      }

      // Check timeout
      if (Date.now() - startTime >= timeoutMs) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (!element) {
      const errorDetail = isRelative
        ? 'Relative element not found. Ensure anchor was set by a prior TAG command.'
        : `Element not found (or not visible): ${JSON.stringify(selector)}`;
      return {
        success: false,
        errorCode: DOM_ERROR_CODES.ELEMENT_NOT_FOUND,
        errorMessage: errorDetail,
      };
    }

    // Check if element is enabled
    if (!isElementEnabled(element)) {
      return {
        success: false,
        errorCode: DOM_ERROR_CODES.ELEMENT_NOT_ENABLED,
        errorMessage: 'Element is disabled',
        elementInfo: getElementInfo(element),
      };
    }

    // Scroll into view
    scrollIntoViewIfNeeded(element);

    // Handle extraction
    let extractedData: string | undefined;
    if (action.extract) {
      extractedData = extractFromElement(element, action.extract);
    }

    // Handle form submission
    if (action.form === 'SUBMIT') {
      const form = element.closest('form');
      if (form) {
        form.submit();
      } else if (element instanceof HTMLFormElement) {
        element.submit();
      } else {
        return {
          success: false,
          errorCode: DOM_ERROR_CODES.EXECUTION_ERROR,
          errorMessage: 'Cannot find form to submit',
          elementInfo: getElementInfo(element),
        };
      }
    } else if (action.form === 'RESET') {
      const form = element.closest('form');
      if (form) {
        form.reset();
      } else if (element instanceof HTMLFormElement) {
        element.reset();
      }
    }

    // Handle content setting
    if (action.content !== undefined) {
      const setResult = setElementContent(element, action.content);
      if (!setResult.success) {
        return {
          success: false,
          errorCode: DOM_ERROR_CODES.EXECUTION_ERROR,
          errorMessage: setResult.errorMessage || 'Failed to set element content',
          elementInfo: getElementInfo(element),
        };
      }
    }

    // Press Enter if requested (from <ENTER> in CONTENT)
    if ((action as { pressEnter?: boolean }).pressEnter) {
      // Dispatch keyboard events first (some sites listen for these)
      dispatchKeyboardEvent(element, 'keydown', { key: 'Enter', code: 'Enter' });
      dispatchKeyboardEvent(element, 'keypress', { key: 'Enter', code: 'Enter' });
      dispatchKeyboardEvent(element, 'keyup', { key: 'Enter', code: 'Enter' });
      // Submit the enclosing form (mimics native browser Enter behavior)
      const form = (element as Element).closest('form');
      if (form) {
        form.requestSubmit();
      }
    }

    // If no action specified, just click the element
    if (!action.extract && !action.form && action.content === undefined && !(action as { pressEnter?: boolean }).pressEnter) {
      // Use the DOM .click() method for anchors — synthetic dispatchEvent
      // clicks are untrusted and won't trigger <a href> navigation
      if (element instanceof HTMLElement) {
        element.click();
      } else {
        dispatchClick(element);
      }
    }

    // Update anchor for subsequent relative positioning (POS=R<n>)
    setAnchor(element);

    return {
      success: true,
      errorCode: DOM_ERROR_CODES.OK,
      extractedData,
      elementInfo: getElementInfo(element),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      errorCode: DOM_ERROR_CODES.EXECUTION_ERROR,
      errorMessage: `TAG execution error: ${message}`,
    };
  }
}

// ===== CLICK Command Execution =====

/**
 * Execute CLICK command
 */
export async function executeClickCommand(message: ClickCommandMessage): Promise<DOMExecutorResult> {
  const { x, y, content, button, clickCount, modifiers } = message.payload;

  try {
    // Get the document from the currently selected frame
    const doc = getCurrentFrameDocument() || document;

    // Find element at coordinates, fall back to documentElement (matches original iMacros 8.9.7)
    const element = doc.elementFromPoint(x, y) || doc.documentElement;

    // Build mouse event options
    const mouseOptions: MouseEventOptions = {
      clientX: x,
      clientY: y,
      ctrlKey: modifiers?.ctrl,
      shiftKey: modifiers?.shift,
      altKey: modifiers?.alt,
      metaKey: modifiers?.meta,
    };

    // Dispatch appropriate click event
    if (button === 'right') {
      dispatchRightClick(element, mouseOptions);
    } else if (clickCount === 2) {
      dispatchDoubleClick(element, mouseOptions);
    } else if (button === 'middle') {
      mouseOptions.button = 1;
      mouseOptions.buttons = 4;
      dispatchMouseEvent(element, 'mouseover', mouseOptions);
      dispatchMouseEvent(element, 'mousedown', mouseOptions);
      dispatchMouseEvent(element, 'mouseup', mouseOptions);
      dispatchMouseEvent(element, 'click', mouseOptions);
    } else {
      dispatchClick(element, mouseOptions);
    }

    // If CONTENT is provided, apply form interaction after click (like TAG CONTENT=)
    if (content) {
      const result = setElementContent(element, content);
      if (!result.success) {
        return {
          success: false,
          errorCode: DOM_ERROR_CODES.EXECUTION_ERROR,
          errorMessage: result.errorMessage || 'Failed to set content on element',
        };
      }
    }

    return {
      success: true,
      errorCode: DOM_ERROR_CODES.OK,
      elementInfo: getElementInfo(element),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      errorCode: DOM_ERROR_CODES.EXECUTION_ERROR,
      errorMessage: `CLICK execution error: ${errorMessage}`,
    };
  }
}

// ===== EVENT Command Execution =====

/**
 * Execute EVENT command
 */
export async function executeEventCommand(message: EventCommandMessage): Promise<DOMExecutorResult> {
  const { eventType, selector, button, key, char, point, modifiers, bubbles, cancelable } = message.payload;

  try {
    // Get the document from the currently selected frame
    const doc = getCurrentFrameDocument() || document;

    // Find target element (or use active element / document)
    let element: Element | Document;

    if (selector) {
      const result = await resolveSelector(selector, 5000, false);
      if (!result.element) {
        return {
          success: false,
          errorCode: DOM_ERROR_CODES.ELEMENT_NOT_FOUND,
          errorMessage: `Element not found for EVENT: ${JSON.stringify(selector)}`,
        };
      }
      element = result.element;
    } else {
      // Use active element or document body from the current frame
      element = doc.activeElement || doc.body;
    }

    // Build modifier options
    const modifierOptions = {
      ctrlKey: modifiers?.ctrl,
      shiftKey: modifiers?.shift,
      altKey: modifiers?.alt,
      metaKey: modifiers?.meta,
    };

    // Dispatch the appropriate event type
    const eventTypeLower = eventType.toLowerCase() as DOMEventType;

    switch (eventTypeLower) {
      // Mouse events
      case 'click':
        dispatchClick(element as Element, {
          ...modifierOptions,
          clientX: point?.x,
          clientY: point?.y,
          button: button ?? 0,
        });
        break;

      case 'dblclick':
        dispatchDoubleClick(element as Element, {
          ...modifierOptions,
          clientX: point?.x,
          clientY: point?.y,
        });
        break;

      case 'contextmenu':
        dispatchRightClick(element as Element, {
          ...modifierOptions,
          clientX: point?.x,
          clientY: point?.y,
        });
        break;

      case 'mousedown':
      case 'mouseup':
      case 'mouseover':
      case 'mouseout':
      case 'mousemove':
      case 'mouseenter':
      case 'mouseleave':
        dispatchMouseEvent(element as Element, eventTypeLower, {
          ...modifierOptions,
          clientX: point?.x,
          clientY: point?.y,
          button: button ?? 0,
        });
        break;

      // Keyboard events
      case 'keydown':
      case 'keyup':
      case 'keypress':
        dispatchKeyboardEvent(element, eventTypeLower, {
          ...modifierOptions,
          key: key || char || '',
          code: key || '',
          charCode: char ? char.charCodeAt(0) : undefined,
        });
        break;

      // Focus events
      case 'focus':
        dispatchFocusEvent(element as Element, 'focus');
        break;

      case 'blur':
        dispatchFocusEvent(element as Element, 'blur');
        break;

      // Form events
      case 'change':
        (element as Element).dispatchEvent(new Event('change', {
          bubbles: bubbles ?? true,
          cancelable: cancelable ?? false,
        }));
        break;

      case 'input':
        dispatchInputEvent(element as Element, 'input');
        break;

      case 'submit':
        if (element instanceof HTMLFormElement) {
          element.dispatchEvent(new Event('submit', {
            bubbles: bubbles ?? true,
            cancelable: cancelable ?? true,
          }));
        } else {
          const form = (element as Element).closest('form');
          if (form) {
            form.dispatchEvent(new Event('submit', {
              bubbles: bubbles ?? true,
              cancelable: cancelable ?? true,
            }));
          }
        }
        break;

      case 'reset':
        if (element instanceof HTMLFormElement) {
          element.dispatchEvent(new Event('reset', {
            bubbles: bubbles ?? true,
            cancelable: cancelable ?? true,
          }));
        } else {
          const form = (element as Element).closest('form');
          if (form) {
            form.dispatchEvent(new Event('reset', {
              bubbles: bubbles ?? true,
              cancelable: cancelable ?? true,
            }));
          }
        }
        break;

      // Scroll events
      case 'scroll':
        (element as Element).dispatchEvent(new Event('scroll', {
          bubbles: bubbles ?? false,
          cancelable: cancelable ?? false,
        }));
        break;

      case 'wheel':
        (element as Element).dispatchEvent(new WheelEvent('wheel', {
          bubbles: bubbles ?? true,
          cancelable: cancelable ?? true,
          clientX: point?.x,
          clientY: point?.y,
          ...modifierOptions,
        }));
        break;

      // Touch events
      case 'touchstart':
      case 'touchend':
      case 'touchmove':
      case 'touchcancel':
        const touch = new Touch({
          identifier: Date.now(),
          target: element as Element,
          clientX: point?.x ?? 0,
          clientY: point?.y ?? 0,
        });
        (element as Element).dispatchEvent(new TouchEvent(eventTypeLower, {
          bubbles: bubbles ?? true,
          cancelable: cancelable ?? true,
          touches: eventTypeLower === 'touchend' || eventTypeLower === 'touchcancel' ? [] : [touch],
          targetTouches: eventTypeLower === 'touchend' || eventTypeLower === 'touchcancel' ? [] : [touch],
          changedTouches: [touch],
        }));
        break;

      default:
        // Dispatch as generic custom event
        (element as Element).dispatchEvent(new CustomEvent(eventType, {
          bubbles: bubbles ?? true,
          cancelable: cancelable ?? true,
          detail: { key, char, point, modifiers },
        }));
    }

    return {
      success: true,
      errorCode: DOM_ERROR_CODES.OK,
      elementInfo: element instanceof Element ? getElementInfo(element) : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      errorCode: DOM_ERROR_CODES.EXECUTION_ERROR,
      errorMessage: `EVENT execution error: ${errorMessage}`,
    };
  }
}

// ===== SEARCH Command Execution =====

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
function txtPatternToRegex(pattern: string): string {
  let regexPattern = escapeRegexPreserveWildcard(pattern);
  // Replace * with pattern that matches anything including newlines (greedy, like original iMacros)
  regexPattern = regexPattern.replace(/\*/g, '(?:[\\r\\n]|.)*');
  // Replace space with flexible whitespace matching
  regexPattern = regexPattern.replace(/ /g, '\\s+');
  return regexPattern;
}

/**
 * Execute SEARCH command
 * Searches the page's HTML content for text or regex patterns
 */
export async function executeSearchCommand(message: SearchCommandMessage): Promise<DOMExecutorResult> {
  const { sourceType, pattern, ignoreCase, extractPattern } = message.payload;

  try {
    // Get the document from the currently selected frame
    const doc = getCurrentFrameDocument() || document;

    // Search in the page's HTML content (like original iMacros)
    const content = doc.documentElement.innerHTML;

    let searchRegex: RegExp;
    const flags = ignoreCase ? 'i' : '';

    if (sourceType === 'TXT') {
      // Convert TXT pattern to regex with wildcard support
      const regexPattern = txtPatternToRegex(pattern);
      try {
        searchRegex = new RegExp(regexPattern, flags);
      } catch (e) {
        return {
          success: false,
          errorCode: DOM_ERROR_CODES.INVALID_PARAMETER,
          errorMessage: `Invalid TXT pattern: ${pattern}`,
        };
      }
    } else {
      // REGEXP - use pattern directly
      try {
        searchRegex = new RegExp(pattern, flags);
      } catch (e) {
        return {
          success: false,
          errorCode: DOM_ERROR_CODES.INVALID_PARAMETER,
          errorMessage: `Invalid regular expression: ${pattern}`,
        };
      }
    }

    const match = searchRegex.exec(content);

    if (!match) {
      return {
        success: false,
        errorCode: DOM_ERROR_CODES.ELEMENT_NOT_FOUND,
        errorMessage: `Pattern not found: ${pattern}`,
      };
    }

    // Determine what to extract
    let extractedValue = match[0];

    if (extractPattern && sourceType === 'REGEXP') {
      // Replace $1, $2, etc. with captured groups
      extractedValue = extractPattern.replace(/\$(\d{1,2})/g, (_, n) => {
        const groupIndex = parseInt(n, 10);
        return groupIndex < match.length ? match[groupIndex] : '';
      });
    }

    return {
      success: true,
      errorCode: DOM_ERROR_CODES.OK,
      extractedData: extractedValue,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      errorCode: DOM_ERROR_CODES.EXECUTION_ERROR,
      errorMessage: `SEARCH execution error: ${errorMessage}`,
    };
  }
}

// ===== Message Handler =====

/**
 * Message types for DOM executor
 */
export type DOMCommandMessage = TagCommandMessage | ClickCommandMessage | EventCommandMessage | SearchCommandMessage;

/**
 * Handle incoming command message and execute
 */
export async function handleDOMCommand(message: DOMCommandMessage): Promise<DOMExecutorResult> {
  switch (message.type) {
    case 'TAG_COMMAND':
      return executeTagCommand(message as TagCommandMessage);

    case 'CLICK_COMMAND':
      return executeClickCommand(message as ClickCommandMessage);

    case 'EVENT_COMMAND':
      return executeEventCommand(message as EventCommandMessage);

    case 'SEARCH_COMMAND':
      return executeSearchCommand(message as SearchCommandMessage);

    default:
      return {
        success: false,
        errorCode: DOM_ERROR_CODES.INVALID_PARAMETER,
        errorMessage: `Unknown command type: ${(message as { type: string }).type}`,
      };
  }
}

/**
 * Convert DOMExecutorResult to ContentScriptResponse
 */
function toContentScriptResponse(result: DOMExecutorResult): ContentScriptResponse {
  return {
    success: result.success,
    error: result.errorMessage,
    extractedData: result.extractedData,
    elementInfo: result.elementInfo,
  };
}

// ===== Message Listener Setup =====

/**
 * Set up the DOM executor message listener
 */
export function setupDOMExecutorListener(): void {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) {
    console.warn('[iMacros] Chrome runtime not available, DOM executor not initialized');
    return;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // Handle anchor management messages
    if (message.type === 'CLEAR_ANCHOR' || message.type === 'PAGE_NAVIGATED' || message.type === 'MACRO_START') {
      clearAnchor();
      sendResponse({ success: true });
      return false;
    }

    // Check if this is a DOM command message
    if (message.type === 'TAG_COMMAND' ||
        message.type === 'CLICK_COMMAND' ||
        message.type === 'EVENT_COMMAND' ||
        message.type === 'SEARCH_COMMAND') {

      // Execute the command asynchronously
      handleDOMCommand(message as DOMCommandMessage)
        .then((result) => {
          sendResponse(toContentScriptResponse(result));
        })
        .catch((error) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          sendResponse({
            success: false,
            error: `DOM executor error: ${errorMessage}`,
          } as ContentScriptResponse);
        });

      // Return true to indicate we will send response asynchronously
      return true;
    }

    // Not a DOM command, let other listeners handle it
    return false;
  });

  console.log('[iMacros] DOM executor listener initialized');
}

/**
 * Initialize the DOM executor
 * Call this from the content script entry point
 */
export function initializeDOMExecutor(): void {
  setupDOMExecutorListener();
}

// ===== Direct Execution API =====

/**
 * Execute a TAG command directly (for programmatic use)
 */
export async function executeTag(
  selector: ElementSelector,
  action: TagAction,
  options: { timeout?: number; waitVisible?: boolean } = {}
): Promise<DOMExecutorResult> {
  const message: TagCommandMessage = {
    id: `direct_${Date.now()}`,
    type: 'TAG_COMMAND',
    timestamp: Date.now(),
    payload: {
      selector,
      action,
      timeout: options.timeout ?? 5000,
      waitVisible: options.waitVisible ?? true,
    },
  };

  return executeTagCommand(message);
}

/**
 * Execute a CLICK command directly (for programmatic use)
 */
export async function executeClick(
  x: number,
  y: number,
  options: {
    button?: 'left' | 'middle' | 'right';
    clickCount?: number;
    modifiers?: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean };
  } = {}
): Promise<DOMExecutorResult> {
  const message: ClickCommandMessage = {
    id: `direct_${Date.now()}`,
    type: 'CLICK_COMMAND',
    timestamp: Date.now(),
    payload: {
      x,
      y,
      button: options.button ?? 'left',
      clickCount: options.clickCount ?? 1,
      modifiers: options.modifiers ?? {},
    },
  };

  return executeClickCommand(message);
}

/**
 * Execute an EVENT command directly (for programmatic use)
 */
export async function executeEvent(
  eventType: DOMEventType | string,
  options: {
    selector?: ElementSelector;
    button?: number;
    key?: string;
    char?: string;
    point?: { x: number; y: number };
    modifiers?: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean };
  } = {}
): Promise<DOMExecutorResult> {
  const message: EventCommandMessage = {
    id: `direct_${Date.now()}`,
    type: 'EVENT_COMMAND',
    timestamp: Date.now(),
    payload: {
      eventType,
      selector: options.selector,
      button: options.button,
      key: options.key,
      char: options.char,
      point: options.point,
      modifiers: options.modifiers,
      bubbles: true,
      cancelable: true,
    },
  };

  return executeEventCommand(message);
}

// ===== Default Export =====

export default {
  // Initialization
  initializeDOMExecutor,
  setupDOMExecutorListener,

  // Command handlers
  handleDOMCommand,
  executeTagCommand,
  executeClickCommand,
  executeEventCommand,

  // Direct execution API
  executeTag,
  executeClick,
  executeEvent,

  // Anchor management (for relative positioning)
  setAnchor,
  getAnchor,
  clearAnchor,

  // Error codes
  DOM_ERROR_CODES,
};
