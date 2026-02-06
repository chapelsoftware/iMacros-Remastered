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
  ContentScriptResponse,
  ElementSelector,
  TagAction,
  ExtractType,
  DOMEventType,
} from '@shared/commands/interaction';

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
 * Resolve element selector to a find result
 * Uses frame-aware element finding to search in the currently selected frame
 */
async function resolveSelector(
  selector: ElementSelector,
  timeout: number = 5000,
  waitVisible: boolean = true
): Promise<ElementFinderResult> {
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
      parts.push(`POS=${selector.pos}`);
    } else {
      parts.push('POS=1');
    }
    if (selector.type) {
      parts.push(`TYPE=${selector.type}`);
    }
    if (selector.attr) {
      parts.push(`ATTR:${selector.attr}`);
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
 * Extract data from an element based on extract type
 */
function extractFromElement(element: Element, extractType: ExtractType): string {
  const type = extractType.toUpperCase();

  switch (type) {
    case 'TXT':
    case 'TEXT':
      return (element.textContent || '').trim();

    case 'HTM':
    case 'HTML':
      return element.innerHTML;

    case 'HREF':
      return getAttributeValue(element, 'href') || '';

    case 'ALT':
      return getAttributeValue(element, 'alt') || '';

    case 'TITLE':
      return getAttributeValue(element, 'title') || '';

    case 'SRC':
      return getAttributeValue(element, 'src') || '';

    case 'VALUE':
      if (element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement) {
        return element.value;
      }
      return getAttributeValue(element, 'value') || '';

    case 'ID':
      return element.id || '';

    case 'CLASS':
      return element.className || '';

    case 'NAME':
      return getAttributeValue(element, 'name') || '';

    default:
      // Try as a generic attribute (handles ATTR:customattr format)
      return getAttributeValue(element, extractType.toLowerCase()) || '';
  }
}

/**
 * Set content on a form element
 */
function setElementContent(element: Element, content: string): boolean {
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
      return true;
    }

    // Handle file input (not supported in content script)
    if (inputType === 'file') {
      console.warn('[iMacros] File input not supported in content script');
      return false;
    }

    // Handle other input types (text, password, email, etc.)
    focusElement(element);
    element.value = content;
    dispatchInputEvent(element, 'input');
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // Handle textarea
  if (element instanceof HTMLTextAreaElement) {
    focusElement(element);
    element.value = content;
    dispatchInputEvent(element, 'input');
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // Handle select
  if (element instanceof HTMLSelectElement) {
    // Check for special prefixes
    if (content.startsWith('%')) {
      // Select by value
      const value = content.substring(1);
      element.value = value;
    } else if (content.startsWith('#')) {
      // Select by index (1-based)
      const index = parseInt(content.substring(1), 10) - 1;
      if (index >= 0 && index < element.options.length) {
        element.selectedIndex = index;
      }
    } else {
      // Select by visible text
      for (let i = 0; i < element.options.length; i++) {
        if (element.options[i].text === content || element.options[i].value === content) {
          element.selectedIndex = i;
          break;
        }
      }
    }
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // Handle contenteditable
  if (element instanceof HTMLElement && element.isContentEditable) {
    focusElement(element);
    element.textContent = content;
    dispatchInputEvent(element, 'input');
    return true;
  }

  // For other elements, try clicking (links, buttons, etc.)
  if (element instanceof HTMLAnchorElement || element instanceof HTMLButtonElement) {
    dispatchClick(element);
    return true;
  }

  console.warn('[iMacros] Cannot set content on element:', element.tagName);
  return false;
}

/**
 * Execute TAG command
 */
export async function executeTagCommand(message: TagCommandMessage): Promise<DOMExecutorResult> {
  const { selector, action, timeout, waitVisible } = message.payload;

  try {
    // Find the element
    const result = await resolveSelector(selector, timeout, waitVisible);

    if (!result.element) {
      return {
        success: false,
        errorCode: DOM_ERROR_CODES.ELEMENT_NOT_FOUND,
        errorMessage: `Element not found: ${JSON.stringify(selector)}`,
      };
    }

    const element = result.element;

    // Check visibility if required
    if (waitVisible && !isElementVisible(element)) {
      return {
        success: false,
        errorCode: DOM_ERROR_CODES.ELEMENT_NOT_VISIBLE,
        errorMessage: 'Element is not visible',
        elementInfo: getElementInfo(element),
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
      const setSuccess = setElementContent(element, action.content);
      if (!setSuccess) {
        return {
          success: false,
          errorCode: DOM_ERROR_CODES.EXECUTION_ERROR,
          errorMessage: 'Failed to set element content',
          elementInfo: getElementInfo(element),
        };
      }
    }

    // If no action specified, just click the element
    if (!action.extract && !action.form && action.content === undefined) {
      dispatchClick(element);
    }

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
  const { x, y, button, clickCount, modifiers } = message.payload;

  try {
    // Get the document from the currently selected frame
    const doc = getCurrentFrameDocument() || document;

    // Find element at coordinates in the current frame's document
    const element = doc.elementFromPoint(x, y);

    if (!element) {
      return {
        success: false,
        errorCode: DOM_ERROR_CODES.ELEMENT_NOT_FOUND,
        errorMessage: `No element found at coordinates (${x}, ${y})`,
      };
    }

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
      dispatchMouseEvent(element, 'mousedown', mouseOptions);
      dispatchMouseEvent(element, 'mouseup', mouseOptions);
      dispatchMouseEvent(element, 'click', mouseOptions);
    } else {
      dispatchClick(element, mouseOptions);
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

// ===== Message Handler =====

/**
 * Message types for DOM executor
 */
export type DOMCommandMessage = TagCommandMessage | ClickCommandMessage | EventCommandMessage;

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
    // Check if this is a DOM command message
    if (message.type === 'TAG_COMMAND' ||
        message.type === 'CLICK_COMMAND' ||
        message.type === 'EVENT_COMMAND') {

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

  // Error codes
  DOM_ERROR_CODES,
};
