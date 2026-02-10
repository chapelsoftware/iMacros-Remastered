/**
 * Interaction Command Handlers for iMacros
 *
 * Implements handlers for:
 * - TAG: Find and interact with elements using POS, TYPE, ATTR, CONTENT, EXTRACT, XPATH, CSS
 * - CLICK: Click at specific X=Y coordinates
 * - EVENT: Dispatch DOM events with TYPE parameter
 *
 * These commands generate messages to be sent to content scripts for execution.
 */

import {
  CommandHandler,
  CommandContext,
  CommandResult,
  IMACROS_ERROR_CODES,
  type IMacrosErrorCode,
} from '../executor';
import type { CommandType } from '../parser';

// ===== Content Script Message Types =====

/**
 * Base message interface for content script communication
 */
export interface ContentScriptMessage {
  /** Unique message ID */
  id: string;
  /** Message type */
  type: ContentScriptMessageType;
  /** Timestamp */
  timestamp: number;
}

/**
 * Types of messages sent to content scripts
 */
export type ContentScriptMessageType =
  | 'TAG_COMMAND'
  | 'CLICK_COMMAND'
  | 'EVENT_COMMAND'
  | 'SEARCH_COMMAND';

/**
 * Element selector specification for TAG command
 */
export interface ElementSelector {
  /** Position (1-based index, negative for reverse, or 'random') */
  pos?: number | 'random';
  /** Element type/tag name (e.g., INPUT, A, DIV, *) */
  type?: string;
  /** Attribute selectors (e.g., "NAME:username" or "TXT:Submit") */
  attr?: string;
  /** XPath expression */
  xpath?: string;
  /** CSS selector */
  css?: string;
  /** Whether this is relative positioning (POS=R<n>) */
  relative?: boolean;
  /** FORM filter (e.g., "NAME:loginform" or "ID:mainform&&NAME:login") */
  form?: string;
}

/**
 * TAG command action specification
 */
export interface TagAction {
  /** Content to set (for inputs, textareas, selects) */
  content?: string;
  /** Extract data from element */
  extract?: ExtractType;
  /** Form action (SUBMIT, RESET) */
  form?: 'SUBMIT' | 'RESET';
}

/**
 * Extract types for TAG EXTRACT parameter
 */
export type ExtractType =
  | 'TXT'      // Inner text
  | 'HTM'      // Inner HTML
  | 'HREF'     // href attribute
  | 'TITLE'    // title attribute
  | 'ALT'      // alt attribute
  | 'VALUE'    // value attribute
  | 'SRC'      // src attribute
  | 'ID'       // id attribute
  | 'CLASS'    // class attribute
  | 'NAME'     // name attribute
  | string;    // Any attribute name with ATTR: prefix

/**
 * Message for TAG command
 */
export interface TagCommandMessage extends ContentScriptMessage {
  type: 'TAG_COMMAND';
  payload: {
    selector: ElementSelector;
    action: TagAction;
    /** Timeout in milliseconds */
    timeout: number;
    /** Whether to wait for element to be visible */
    waitVisible: boolean;
  };
}

/**
 * Message for CLICK command
 */
export interface ClickCommandMessage extends ContentScriptMessage {
  type: 'CLICK_COMMAND';
  payload: {
    /** X coordinate */
    x: number;
    /** Y coordinate */
    y: number;
    /** Optional content for form interaction (like TAG CONTENT=) */
    content?: string;
    /** Click type */
    button: 'left' | 'middle' | 'right';
    /** Click count (1=click, 2=dblclick) */
    clickCount: number;
    /** Modifier keys */
    modifiers: {
      ctrl?: boolean;
      shift?: boolean;
      alt?: boolean;
      meta?: boolean;
    };
    /** Coordinate mode: 'page' treats X/Y as page coordinates (default, matches original iMacros 8.9.7),
     *  'viewport' treats X/Y as viewport-relative clientX/clientY */
    coordinateMode?: 'page' | 'viewport';
  };
}

/**
 * DOM event types for EVENT command
 */
export type DOMEventType =
  | 'click'
  | 'dblclick'
  | 'mousedown'
  | 'mouseup'
  | 'mouseover'
  | 'mouseout'
  | 'mousemove'
  | 'mouseenter'
  | 'mouseleave'
  | 'contextmenu'
  | 'keydown'
  | 'keyup'
  | 'keypress'
  | 'focus'
  | 'blur'
  | 'change'
  | 'input'
  | 'submit'
  | 'reset'
  | 'scroll'
  | 'wheel'
  | 'touchstart'
  | 'touchend'
  | 'touchmove'
  | 'touchcancel';

/**
 * Message for EVENT command
 */
export interface EventCommandMessage extends ContentScriptMessage {
  type: 'EVENT_COMMAND';
  payload: {
    /** Event type to dispatch */
    eventType: DOMEventType | string;
    /** Element selector (optional, defaults to documentElement) */
    selector?: ElementSelector;
    /** Mouse button (for mouse events) */
    button?: number;
    /** Key code (for keyboard events) */
    key?: string;
    /** Character value (for keypress) */
    char?: string;
    /** Point coordinates (for mouse events) */
    point?: { x: number; y: number };
    /** Array of keycodes to fire keydown/keypress/keyup for each (KEYS parameter) */
    keys?: string[];
    /** Character string to type with full event cycle per char (CHARS parameter) */
    chars?: string;
    /** Array of points to fire mousemove at each (POINTS parameter) */
    points?: Array<{ x: number; y: number }>;
    /** Modifier keys */
    modifiers?: {
      ctrl?: boolean;
      shift?: boolean;
      alt?: boolean;
      meta?: boolean;
    };
    /** Whether event should bubble */
    bubbles?: boolean;
    /** Whether event is cancelable */
    cancelable?: boolean;
    /** Timeout in milliseconds for element lookup retry (default: !TIMEOUT value or 5000ms) */
    timeout?: number;
  };
}

// Import SearchSourceType from extraction.ts to avoid duplicate definitions
import type { SearchSourceType } from './extraction';

/**
 * Message for SEARCH command
 */
export interface SearchCommandMessage extends ContentScriptMessage {
  type: 'SEARCH_COMMAND';
  payload: {
    /** Search source type: TXT (with wildcards) or REGEXP */
    sourceType: SearchSourceType;
    /** The search pattern */
    pattern: string;
    /** Case insensitive search */
    ignoreCase: boolean;
    /** Extract pattern for REGEXP (e.g., "$1") */
    extractPattern?: string;
  };
}

// Re-export for convenience
export type { SearchSourceType };

/**
 * Union type for all content script messages
 */
export type InteractionMessage =
  | TagCommandMessage
  | ClickCommandMessage
  | EventCommandMessage
  | SearchCommandMessage;

/**
 * Response from content script after executing a command
 */
export interface ContentScriptResponse {
  /** Whether the command succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Error code from DOM executor (e.g., -920 for element not found) */
  errorCode?: number;
  /** Extracted data (for TAG with EXTRACT) */
  extractedData?: string;
  /** Element info (for debugging) */
  elementInfo?: {
    tagName: string;
    id?: string;
    className?: string;
    rect?: { x: number; y: number; width: number; height: number };
  };
}

// ===== Helper Functions =====

/**
 * Generate a unique message ID
 */
function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Parse ATTR parameter value
 * Formats:
 * - NAME:value - match name attribute
 * - ID:value - match id attribute
 * - TXT:value - match inner text
 * - CLASS:value - match class name
 * - value - match any common attribute
 * - Multiple: NAME:foo&&CLASS:bar
 */
export function parseAttrParam(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};

  // Split by && for multiple attributes
  const parts = attrStr.split('&&');

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Check for known prefixes
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const prefix = trimmed.substring(0, colonIndex).toUpperCase();
      const value = trimmed.substring(colonIndex + 1);

      // Map common prefixes
      switch (prefix) {
        case 'NAME':
        case 'ID':
        case 'CLASS':
        case 'HREF':
        case 'SRC':
        case 'ALT':
        case 'TITLE':
        case 'VALUE':
        case 'TYPE':
        case 'PLACEHOLDER':
          attrs[prefix.toLowerCase()] = value;
          break;
        case 'TXT':
          attrs['innerText'] = value;
          break;
        default:
          // Custom attribute
          attrs[prefix.toLowerCase()] = value;
      }
    } else {
      // No prefix, treat as generic selector
      attrs['selector'] = trimmed;
    }
  }

  return attrs;
}

/**
 * Valid extract types for TAG EXTRACT parameter (iMacros 8.9.7)
 */
const VALID_EXTRACT_TYPES = [
  'TXT', 'HTM', 'HREF', 'TITLE', 'ALT', 'VALUE', 'SRC',
  'ID', 'CLASS', 'NAME', 'TXTALL', 'CHECKED',
];

export function parseExtractParam(extractStr: string): ExtractType {
  const upper = extractStr.toUpperCase();

  // Standard extract types
  if (VALID_EXTRACT_TYPES.includes(upper)) {
    return upper as ExtractType;
  }

  // Check for ATTR: prefix for custom attributes
  if (upper.startsWith('ATTR:')) {
    return extractStr.substring(5);
  }

  // Original iMacros throws BadParameter for unrecognized extract types
  throw new Error(`BadParameter: Invalid EXTRACT type "${extractStr}". Valid types: ${VALID_EXTRACT_TYPES.join(', ')}, or ATTR:<name>`);
}

/**
 * Parsed POS parameter result
 */
export interface ParsedPos {
  /** Position value (positive = forward, negative = backward) */
  pos: number;
  /** Whether this is relative positioning (POS=R<n>) */
  relative: boolean;
}

/**
 * Parse POS parameter value
 * Supports: 1, 2, -1 (last), -2 (second to last), R1/R-1 (relative positioning)
 *
 * Note: POS=R<n> means relative to previous anchor element, NOT random.
 * The "R" prefix indicates relative positioning where:
 * - R1 means 1st match after anchor
 * - R-1 means 1st match before anchor
 * - R3 means 3rd match after anchor
 */
export function parsePosParam(posStr: string): number | 'random' {
  const parsed = parsePosParamEx(posStr);
  // For backwards compatibility, return just the number
  // Callers that need relative info should use parsePosParamEx
  return parsed.pos;
}

/**
 * Extended POS parameter parser that returns relative positioning info
 */
export function parsePosParamEx(posStr: string): ParsedPos {
  const trimmed = posStr.trim().toUpperCase();

  // Check for relative prefix (R followed by number)
  if (trimmed.startsWith('R')) {
    const numPart = trimmed.substring(1);
    const num = parseInt(numPart, 10);
    if (!isNaN(num) && num !== 0) {
      return { pos: num, relative: true };
    }
    // R0 or non-numeric after R — matches old iMacros BadParameter behavior
    throw new Error('Bad parameter: POS=<number> or POS=R<number>');
  }

  // Absolute position
  const num = parseInt(trimmed, 10);
  if (isNaN(num)) {
    throw new Error('Bad parameter: POS=<number> or POS=R<number>');
  }
  return { pos: num, relative: false };
}

/**
 * Parse CONTENT parameter for form filling
 * Handles special formats:
 * - %value - dropdown option by value
 * - #value - dropdown option by index
 * - text - regular text input
 * - <SP> - space character
 * - <BR> - newline
 */
export function parseContentParam(contentStr: string): string {
  return contentStr
    .replace(/<SP>/gi, ' ')
    .replace(/<BR>/gi, '\n')
    .replace(/<TAB>/gi, '\t')
    .replace(/<ENTER>/gi, '\n');
}

/**
 * Build element selector from TAG command parameters
 */
export function buildSelector(ctx: CommandContext): ElementSelector {
  const selector: ElementSelector = {};

  // XPath takes precedence
  const xpath = ctx.getParam('XPATH');
  if (xpath) {
    selector.xpath = ctx.expand(xpath);
    return selector;
  }

  // CSS selector
  const css = ctx.getParam('CSS');
  if (css) {
    selector.css = ctx.expand(css);
    return selector;
  }

  // Traditional POS/TYPE/ATTR selection
  const pos = ctx.getParam('POS');
  if (pos) {
    const parsed = parsePosParamEx(ctx.expand(pos));
    selector.pos = parsed.pos;
    selector.relative = parsed.relative;
  }

  const type = ctx.getParam('TYPE');
  if (type) {
    selector.type = ctx.expand(type).toUpperCase();
  }

  const attr = ctx.getParam('ATTR');
  if (attr) {
    selector.attr = ctx.expand(attr);
  }

  const form = ctx.getParam('FORM');
  if (form) {
    selector.form = ctx.expand(form);
  }

  return selector;
}

/**
 * Build action from TAG command parameters
 */
export function buildAction(ctx: CommandContext): TagAction {
  const action: TagAction = {};

  // Content for form filling
  const content = ctx.getParam('CONTENT');
  if (content) {
    action.content = parseContentParam(ctx.expand(content));
  }

  // Extract data
  const extract = ctx.getParam('EXTRACT');
  if (extract) {
    action.extract = parseExtractParam(ctx.expand(extract));
  }

  // Form actions (CONTENT=<SUBMIT> or CONTENT=<RESET>)
  if (action.content === '<SUBMIT>') {
    action.form = 'SUBMIT';
    delete action.content;
  } else if (action.content === '<RESET>') {
    action.form = 'RESET';
    delete action.content;
  }

  return action;
}

// ===== Message Sender Interface =====

/**
 * Interface for sending messages to content scripts
 * This should be implemented by the extension/background script
 */
export interface ContentScriptSender {
  /**
   * Send a message to the content script and wait for response
   */
  sendMessage(message: InteractionMessage): Promise<ContentScriptResponse>;
}

/**
 * Default no-op sender for testing
 */
export const noopSender: ContentScriptSender = {
  async sendMessage(_message: InteractionMessage): Promise<ContentScriptResponse> {
    return {
      success: true,
      extractedData: undefined,
    };
  },
};

/**
 * Active content script sender (set by extension)
 */
let activeSender: ContentScriptSender = noopSender;

/**
 * Set the active content script sender
 */
export function setContentScriptSender(sender: ContentScriptSender): void {
  activeSender = sender;
}

/**
 * Get the active content script sender
 */
export function getContentScriptSender(): ContentScriptSender {
  return activeSender;
}

// ===== Command Handlers =====

/**
 * TAG command handler
 *
 * TAG POS=1 TYPE=INPUT ATTR=NAME:username CONTENT=john
 * TAG POS=1 TYPE=A ATTR=TXT:Click<SP>Here
 * TAG XPATH=//input[@id='search'] CONTENT=query
 * TAG CSS=.submit-btn EXTRACT=TXT
 */
export const tagHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  let selector: ElementSelector;
  try {
    selector = buildSelector(ctx);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
      errorMessage: msg,
    };
  }

  let action: TagAction;
  try {
    action = buildAction(ctx);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
      errorMessage: msg,
    };
  }

  // Validate selector
  if (!selector.xpath && !selector.css && !selector.type) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'TAG command requires XPATH, CSS, or TYPE parameter',
    };
  }

  // Get timeout from state variables (!TIMEOUT_TAG is specifically for TAG element wait)
  const timeoutTag = ctx.state.getVariable('!TIMEOUT_TAG');
  let timeout = 6000; // Default: 6 seconds (matches iMacros default)
  if (typeof timeoutTag === 'number') {
    timeout = timeoutTag * 1000;
  } else if (typeof timeoutTag === 'string') {
    const parsed = parseFloat(timeoutTag);
    if (!isNaN(parsed)) {
      timeout = parsed * 1000;
    }
  }

  // Build message
  const message: TagCommandMessage = {
    id: generateMessageId(),
    type: 'TAG_COMMAND',
    timestamp: Date.now(),
    payload: {
      selector,
      action,
      timeout,
      waitVisible: true,
    },
  };

  ctx.log('debug', `TAG: selector=${JSON.stringify(selector)}, action=${JSON.stringify(action)}`);

  try {
    // Send to content script
    const response = await activeSender.sendMessage(message);

    if (!response.success) {
      // iMacros 8.9.7: when element not found and EXTRACT is specified,
      // store #EANF# and return success instead of throwing error.
      // Only for element-not-found (-920); other errors (e.g. CHECKED on
      // non-checkbox) should propagate as real errors.
      const isElementNotFound = response.errorCode === -920;
      if (action.extract && isElementNotFound) {
        const eanf = '#EANF#';
        ctx.state.addExtract(eanf);
        ctx.log('info', `Extracted: ${eanf} (element not found)`);
        return {
          success: true,
          errorCode: IMACROS_ERROR_CODES.OK,
          output: eanf,
        };
      }
      return {
        success: false,
        errorCode: (response.errorCode as IMacrosErrorCode) || IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND,
        errorMessage: response.error || 'Element not found',
      };
    }

    // Handle extraction
    if (action.extract && response.extractedData !== undefined) {
      ctx.state.addExtract(response.extractedData);
      ctx.log('info', `Extracted: ${response.extractedData}`);
    }

    return {
      success: true,
      errorCode: IMACROS_ERROR_CODES.OK,
      output: response.extractedData,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: `TAG command failed: ${message}`,
    };
  }
};

/**
 * CLICK command handler
 *
 * CLICK X=100 Y=200
 * CLICK X=50 Y=50 BUTTON=right
 * CLICK X=50 Y=50 CONTENT=somevalue (triggers form interaction on element at coords)
 */
export const clickHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  // Get coordinates
  const xStr = ctx.getParam('X');
  const yStr = ctx.getParam('Y');

  if (!xStr || !yStr) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'CLICK command requires X and Y parameters',
    };
  }

  const x = parseInt(ctx.expand(xStr), 10);
  const y = parseInt(ctx.expand(yStr), 10);

  if (isNaN(x) || isNaN(y)) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
      errorMessage: `Invalid coordinates: X=${xStr}, Y=${yStr}`,
    };
  }

  // CONTENT triggers form-interaction logic (like TAG CONTENT=)
  const content = ctx.getParam('CONTENT');
  const expandedContent = content ? parseContentParam(ctx.expand(content)) : undefined;

  // BUTTON param determines mouse button type (separate from CONTENT)
  const buttonParam = ctx.getParam('BUTTON');
  let button: 'left' | 'middle' | 'right' = 'left';

  if (buttonParam) {
    const buttonLower = ctx.expand(buttonParam).toLowerCase();
    if (buttonLower === 'middle' || buttonLower === 'center') {
      button = 'middle';
    } else if (buttonLower === 'right') {
      button = 'right';
    }
  }

  // COORDMODE param: 'page' (default, matches original) or 'viewport'
  const coordModeParam = ctx.getParam('COORDMODE');
  let coordinateMode: 'page' | 'viewport' = 'page';
  if (coordModeParam) {
    const mode = ctx.expand(coordModeParam).toLowerCase();
    if (mode === 'viewport') {
      coordinateMode = 'viewport';
    }
  }

  // Build message
  const message: ClickCommandMessage = {
    id: generateMessageId(),
    type: 'CLICK_COMMAND',
    timestamp: Date.now(),
    payload: {
      x,
      y,
      content: expandedContent,
      button,
      clickCount: 1,
      modifiers: {},
      coordinateMode,
    },
  };

  ctx.log('debug', `CLICK: X=${x}, Y=${y}, button=${button}${expandedContent ? `, content=${expandedContent}` : ''}`);

  try {
    const response = await activeSender.sendMessage(message);

    if (!response.success) {
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
        errorMessage: response.error || 'Click failed',
      };
    }

    return {
      success: true,
      errorCode: IMACROS_ERROR_CODES.OK,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: `CLICK command failed: ${msg}`,
    };
  }
};

/**
 * Map integer keycode to key name (iMacros 8.9.7 compatibility)
 * Original iMacros passes KEY as integer keycode, not string key name.
 */
const KEYCODE_TO_KEY: Record<number, string> = {
  8: 'Backspace', 9: 'Tab', 13: 'Enter', 16: 'Shift', 17: 'Control', 18: 'Alt',
  19: 'Pause', 20: 'CapsLock', 27: 'Escape', 32: ' ', 33: 'PageUp', 34: 'PageDown',
  35: 'End', 36: 'Home', 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight',
  40: 'ArrowDown', 45: 'Insert', 46: 'Delete',
  // Digits 0-9
  48: '0', 49: '1', 50: '2', 51: '3', 52: '4', 53: '5', 54: '6', 55: '7', 56: '8', 57: '9',
  // Letters A-Z
  65: 'a', 66: 'b', 67: 'c', 68: 'd', 69: 'e', 70: 'f', 71: 'g', 72: 'h', 73: 'i',
  74: 'j', 75: 'k', 76: 'l', 77: 'm', 78: 'n', 79: 'o', 80: 'p', 81: 'q', 82: 'r',
  83: 's', 84: 't', 85: 'u', 86: 'v', 87: 'w', 88: 'x', 89: 'y', 90: 'z',
  // F-keys
  112: 'F1', 113: 'F2', 114: 'F3', 115: 'F4', 116: 'F5', 117: 'F6',
  118: 'F7', 119: 'F8', 120: 'F9', 121: 'F10', 122: 'F11', 123: 'F12',
  // Punctuation / symbols
  186: ';', 187: '=', 188: ',', 189: '-', 190: '.', 191: '/', 192: '`',
  219: '[', 220: '\\', 221: ']', 222: "'",
};

function keycodeToKeyName(keycode: number): string | undefined {
  return KEYCODE_TO_KEY[keycode];
}

/**
 * EVENT command handler
 *
 * EVENT TYPE=CLICK SELECTOR=CSS:.my-button
 * EVENT TYPE=KEYDOWN KEY=Enter
 * EVENT TYPE=MOUSEMOVE POINT=100,200
 * EVENT TYPE=KEYDOWN KEY=13 (integer keycode, iMacros 8.9.7 format)
 * EVENT TYPE=MOUSEMOVE POINT=(100,200) (parenthesized coordinates)
 */
export const eventHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  // Get event type
  const eventTypeStr = ctx.getParam('TYPE');

  if (!eventTypeStr) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'EVENT command requires TYPE parameter',
    };
  }

  const eventType = ctx.expand(eventTypeStr).toLowerCase() as DOMEventType;

  // Build selector if provided
  let selector: ElementSelector | undefined;

  const selectorStr = ctx.getParam('SELECTOR');
  const xpathStr = ctx.getParam('XPATH');
  const cssStr = ctx.getParam('CSS');

  if (selectorStr || xpathStr || cssStr) {
    selector = {};
    if (xpathStr) {
      selector.xpath = ctx.expand(xpathStr);
    } else if (cssStr) {
      selector.css = ctx.expand(cssStr);
    } else if (selectorStr) {
      // Parse selector format: TYPE:value (CSS:.class or XPATH://div)
      // Support both uppercase and lowercase prefixes for iMacros 8.9.7 compatibility
      const expanded = ctx.expand(selectorStr);
      const expandedUpper = expanded.toUpperCase();
      if (expandedUpper.startsWith('CSS:')) {
        selector.css = expanded.substring(4);
      } else if (expandedUpper.startsWith('XPATH:')) {
        selector.xpath = expanded.substring(6);
      } else {
        selector.css = expanded;
      }
    }
  }

  // Parse additional parameters
  const buttonStr = ctx.getParam('BUTTON');
  const keyStr = ctx.getParam('KEY');
  const charStr = ctx.getParam('CHAR');
  const pointStr = ctx.getParam('POINT');
  const modifiersStr = ctx.getParam('MODIFIERS');
  const keysStr = ctx.getParam('KEYS');
  const charsStr = ctx.getParam('CHARS');
  const pointsStr = ctx.getParam('POINTS');

  // Parse point (format: x,y or (x,y) for iMacros 8.9.7 compatibility)
  let point: { x: number; y: number } | undefined;
  if (pointStr) {
    let pointValue = ctx.expand(pointStr).trim();
    // Strip surrounding parentheses if present
    if (pointValue.startsWith('(') && pointValue.endsWith(')')) {
      pointValue = pointValue.substring(1, pointValue.length - 1);
    }
    const [px, py] = pointValue.split(',').map(s => parseInt(s.trim(), 10));
    if (!isNaN(px) && !isNaN(py)) {
      point = { x: px, y: py };
    }
  }

  // Parse KEYS array (format: [k1,k2,..,kn] - array of keycodes)
  let keys: string[] | undefined;
  if (keysStr) {
    let keysValue = ctx.expand(keysStr).trim();
    // Strip surrounding brackets if present
    if (keysValue.startsWith('[') && keysValue.endsWith(']')) {
      keysValue = keysValue.substring(1, keysValue.length - 1);
    }
    keys = keysValue.split(',').map(k => {
      const trimmed = k.trim();
      const asInt = parseInt(trimmed, 10);
      if (!isNaN(asInt) && String(asInt) === trimmed) {
        return keycodeToKeyName(asInt) || trimmed;
      }
      return trimmed;
    }).filter(k => k.length > 0);
  }

  // Parse CHARS string (character sequence for typing)
  let chars: string | undefined;
  if (charsStr) {
    chars = ctx.expand(charsStr);
  }

  // Parse POINTS array (format: (x,y),(x2,y2),... - array of coordinate pairs)
  let points: Array<{ x: number; y: number }> | undefined;
  if (pointsStr) {
    const pointsValue = ctx.expand(pointsStr).trim();
    const pointMatches = pointsValue.match(/\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/g);
    if (pointMatches) {
      points = pointMatches.map(m => {
        const coords = m.replace(/[()]/g, '').split(',').map(s => parseInt(s.trim(), 10));
        return { x: coords[0], y: coords[1] };
      });
    }
  }

  // Parse modifiers (format: ctrl+shift or ctrl,shift)
  const modifiers: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } = {};
  if (modifiersStr) {
    const modList = ctx.expand(modifiersStr).toLowerCase().split(/[+,]/);
    for (const mod of modList) {
      const trimmed = mod.trim();
      if (trimmed === 'ctrl' || trimmed === 'control') modifiers.ctrl = true;
      if (trimmed === 'shift') modifiers.shift = true;
      if (trimmed === 'alt') modifiers.alt = true;
      if (trimmed === 'meta' || trimmed === 'cmd' || trimmed === 'command') modifiers.meta = true;
    }
  }

  // Resolve KEY parameter: if it's a pure integer, treat as keycode (iMacros 8.9.7 compat)
  let resolvedKey: string | undefined;
  if (keyStr) {
    const expandedKey = ctx.expand(keyStr);
    const keyAsInt = parseInt(expandedKey, 10);
    if (!isNaN(keyAsInt) && String(keyAsInt) === expandedKey.trim()) {
      // Integer keycode - resolve to key name
      resolvedKey = keycodeToKeyName(keyAsInt) || expandedKey;
    } else {
      resolvedKey = expandedKey;
    }
  }

  // Get timeout from !TIMEOUT_TAG (same as TAG command uses for element wait)
  const timeoutTag = ctx.state.getVariable('!TIMEOUT_TAG');
  let timeout = 6000; // Default: 6 seconds (matches iMacros default)
  if (typeof timeoutTag === 'number') {
    timeout = timeoutTag * 1000;
  } else if (typeof timeoutTag === 'string') {
    const parsed = parseFloat(timeoutTag);
    if (!isNaN(parsed)) {
      timeout = parsed * 1000;
    }
  }

  // Build message
  const message: EventCommandMessage = {
    id: generateMessageId(),
    type: 'EVENT_COMMAND',
    timestamp: Date.now(),
    payload: {
      eventType,
      selector,
      button: buttonStr ? parseInt(ctx.expand(buttonStr), 10) : undefined,
      key: resolvedKey,
      char: charStr ? ctx.expand(charStr) : undefined,
      point,
      keys,
      chars,
      points,
      modifiers: Object.keys(modifiers).length > 0 ? modifiers : undefined,
      bubbles: true,
      cancelable: true,
      timeout,
    },
  };

  ctx.log('debug', `EVENT: type=${eventType}, selector=${JSON.stringify(selector)}`);

  try {
    const response = await activeSender.sendMessage(message);

    if (!response.success) {
      // Use error code -921 (ELEMENT_NOT_VISIBLE) for element location failures
      // matching original iMacros 8.9.7 behavior
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.ELEMENT_NOT_VISIBLE,
        errorMessage: response.error || 'Event dispatch failed',
      };
    }

    return {
      success: true,
      errorCode: IMACROS_ERROR_CODES.OK,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.ELEMENT_NOT_VISIBLE,
      errorMessage: `EVENT command failed: ${msg}`,
    };
  }
};

// ===== Handler Registration =====

/**
 * All interaction command handlers
 */
export const interactionHandlers: Partial<Record<CommandType, CommandHandler>> = {
  TAG: tagHandler,
  CLICK: clickHandler,
  EVENT: eventHandler,
  EVENTS: eventHandler, // EVENTS is alias for EVENT
};

/**
 * Register interaction handlers with an executor
 */
export function registerInteractionHandlers(
  registerFn: (type: CommandType, handler: CommandHandler) => void
): void {
  for (const [type, handler] of Object.entries(interactionHandlers)) {
    if (handler) {
      registerFn(type as CommandType, handler);
    }
  }
}
