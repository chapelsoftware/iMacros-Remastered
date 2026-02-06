/**
 * Event Dispatcher Module
 * Dispatches synthetic events: MouseEvent, KeyboardEvent, InputEvent, FocusEvent
 * with full modifier key support.
 */

export interface ModifierKeys {
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
}

export interface MouseEventOptions extends ModifierKeys {
  button?: number; // 0 = left, 1 = middle, 2 = right
  buttons?: number;
  clientX?: number;
  clientY?: number;
  screenX?: number;
  screenY?: number;
  relatedTarget?: EventTarget | null;
}

export interface KeyboardEventOptions extends ModifierKeys {
  key?: string;
  code?: string;
  keyCode?: number;
  charCode?: number;
  repeat?: boolean;
  location?: number;
}

export interface InputEventOptions {
  data?: string | null;
  inputType?: string;
  isComposing?: boolean;
}

export interface FocusEventOptions {
  relatedTarget?: EventTarget | null;
}

type MouseEventType = 'click' | 'mousedown' | 'mouseup' | 'mouseover' | 'mouseout' | 'mousemove' | 'mouseenter' | 'mouseleave' | 'dblclick' | 'contextmenu';
type KeyboardEventType = 'keydown' | 'keyup' | 'keypress';
type InputEventType = 'input' | 'beforeinput';
type FocusEventType = 'focus' | 'blur' | 'focusin' | 'focusout';

/**
 * Gets the center coordinates of an element for mouse events
 */
function getElementCenter(element: Element): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

/**
 * Creates common event init options with modifier keys
 */
function createModifierInit(options: ModifierKeys): MouseEventInit & KeyboardEventInit {
  return {
    bubbles: true,
    cancelable: true,
    view: window,
    ctrlKey: options.ctrlKey ?? false,
    altKey: options.altKey ?? false,
    shiftKey: options.shiftKey ?? false,
    metaKey: options.metaKey ?? false,
  };
}

/**
 * Dispatches a MouseEvent on the target element
 */
export function dispatchMouseEvent(
  element: Element,
  eventType: MouseEventType,
  options: MouseEventOptions = {}
): boolean {
  const center = getElementCenter(element);

  const eventInit: MouseEventInit = {
    ...createModifierInit(options),
    button: options.button ?? 0,
    buttons: options.buttons ?? (eventType === 'mouseup' ? 0 : 1),
    clientX: options.clientX ?? center.x,
    clientY: options.clientY ?? center.y,
    screenX: options.screenX ?? (options.clientX ?? center.x),
    screenY: options.screenY ?? (options.clientY ?? center.y),
    relatedTarget: options.relatedTarget ?? null,
  };

  const event = new MouseEvent(eventType, eventInit);
  return element.dispatchEvent(event);
}

/**
 * Dispatches a complete click sequence (mousedown, mouseup, click)
 */
export function dispatchClick(
  element: Element,
  options: MouseEventOptions = {}
): { mousedown: boolean; mouseup: boolean; click: boolean } {
  const mousedown = dispatchMouseEvent(element, 'mousedown', options);
  const mouseup = dispatchMouseEvent(element, 'mouseup', options);
  const click = dispatchMouseEvent(element, 'click', options);

  return { mousedown, mouseup, click };
}

/**
 * Dispatches a double-click sequence
 */
export function dispatchDoubleClick(
  element: Element,
  options: MouseEventOptions = {}
): { firstClick: ReturnType<typeof dispatchClick>; secondClick: ReturnType<typeof dispatchClick>; dblclick: boolean } {
  const firstClick = dispatchClick(element, options);
  const secondClick = dispatchClick(element, options);
  const dblclick = dispatchMouseEvent(element, 'dblclick', options);

  return { firstClick, secondClick, dblclick };
}

/**
 * Dispatches a right-click (context menu) event sequence
 */
export function dispatchRightClick(
  element: Element,
  options: MouseEventOptions = {}
): { mousedown: boolean; mouseup: boolean; contextmenu: boolean } {
  const rightClickOptions = { ...options, button: 2, buttons: 2 };

  const mousedown = dispatchMouseEvent(element, 'mousedown', rightClickOptions);
  const mouseup = dispatchMouseEvent(element, 'mouseup', rightClickOptions);
  const contextmenu = dispatchMouseEvent(element, 'contextmenu', rightClickOptions);

  return { mousedown, mouseup, contextmenu };
}

/**
 * Dispatches a KeyboardEvent on the target element
 */
export function dispatchKeyboardEvent(
  element: Element | Document,
  eventType: KeyboardEventType,
  options: KeyboardEventOptions = {}
): boolean {
  const eventInit: KeyboardEventInit = {
    ...createModifierInit(options),
    key: options.key ?? '',
    code: options.code ?? '',
    repeat: options.repeat ?? false,
    location: options.location ?? 0,
  };

  // Add deprecated properties for compatibility
  const event = new KeyboardEvent(eventType, eventInit);

  // Some older code may check keyCode/charCode
  if (options.keyCode !== undefined || options.charCode !== undefined) {
    try {
      Object.defineProperty(event, 'keyCode', {
        get: () => options.keyCode ?? 0,
      });
      Object.defineProperty(event, 'charCode', {
        get: () => options.charCode ?? 0,
      });
      Object.defineProperty(event, 'which', {
        get: () => options.keyCode ?? options.charCode ?? 0,
      });
    } catch {
      // Properties may be read-only in some browsers
    }
  }

  return element.dispatchEvent(event);
}

/**
 * Dispatches a complete key press sequence (keydown, keypress, keyup)
 * Note: keypress is deprecated but still needed for compatibility
 */
export function dispatchKeyPress(
  element: Element | Document,
  options: KeyboardEventOptions = {}
): { keydown: boolean; keypress: boolean; keyup: boolean } {
  const keydown = dispatchKeyboardEvent(element, 'keydown', options);
  const keypress = dispatchKeyboardEvent(element, 'keypress', options);
  const keyup = dispatchKeyboardEvent(element, 'keyup', options);

  return { keydown, keypress, keyup };
}

/**
 * Dispatches a key combination (e.g., Ctrl+C)
 */
export function dispatchKeyCombination(
  element: Element | Document,
  key: string,
  modifiers: ModifierKeys = {}
): { keydown: boolean; keyup: boolean } {
  const code = getKeyCode(key);
  const keyCode = getKeyCodeNumber(key);

  const options: KeyboardEventOptions = {
    key,
    code,
    keyCode,
    ...modifiers,
  };

  const keydown = dispatchKeyboardEvent(element, 'keydown', options);
  const keyup = dispatchKeyboardEvent(element, 'keyup', options);

  return { keydown, keyup };
}

/**
 * Gets the code property for a key
 */
function getKeyCode(key: string): string {
  const keyCodeMap: Record<string, string> = {
    'Enter': 'Enter',
    'Tab': 'Tab',
    'Backspace': 'Backspace',
    'Delete': 'Delete',
    'Escape': 'Escape',
    'ArrowUp': 'ArrowUp',
    'ArrowDown': 'ArrowDown',
    'ArrowLeft': 'ArrowLeft',
    'ArrowRight': 'ArrowRight',
    'Home': 'Home',
    'End': 'End',
    'PageUp': 'PageUp',
    'PageDown': 'PageDown',
    ' ': 'Space',
  };

  if (keyCodeMap[key]) {
    return keyCodeMap[key];
  }

  if (key.length === 1) {
    const charCode = key.charCodeAt(0);
    if (charCode >= 65 && charCode <= 90) {
      return `Key${key}`;
    }
    if (charCode >= 97 && charCode <= 122) {
      return `Key${key.toUpperCase()}`;
    }
    if (charCode >= 48 && charCode <= 57) {
      return `Digit${key}`;
    }
  }

  return key;
}

/**
 * Gets the keyCode number for a key
 */
function getKeyCodeNumber(key: string): number {
  const keyCodeNumbers: Record<string, number> = {
    'Backspace': 8,
    'Tab': 9,
    'Enter': 13,
    'Shift': 16,
    'Control': 17,
    'Alt': 18,
    'Escape': 27,
    ' ': 32,
    'PageUp': 33,
    'PageDown': 34,
    'End': 35,
    'Home': 36,
    'ArrowLeft': 37,
    'ArrowUp': 38,
    'ArrowRight': 39,
    'ArrowDown': 40,
    'Delete': 46,
  };

  if (keyCodeNumbers[key] !== undefined) {
    return keyCodeNumbers[key];
  }

  if (key.length === 1) {
    return key.toUpperCase().charCodeAt(0);
  }

  return 0;
}

/**
 * Dispatches an InputEvent on the target element
 */
export function dispatchInputEvent(
  element: Element,
  eventType: InputEventType = 'input',
  options: InputEventOptions = {}
): boolean {
  const eventInit: InputEventInit = {
    bubbles: true,
    cancelable: eventType === 'beforeinput',
    data: options.data ?? null,
    inputType: options.inputType ?? 'insertText',
    isComposing: options.isComposing ?? false,
  };

  const event = new InputEvent(eventType, eventInit);
  return element.dispatchEvent(event);
}

/**
 * Types text into an input element, dispatching appropriate events
 */
export function typeText(
  element: HTMLInputElement | HTMLTextAreaElement,
  text: string,
  options: { clearFirst?: boolean } = {}
): void {
  // Focus the element first
  dispatchFocusEvent(element, 'focus');

  if (options.clearFirst) {
    element.value = '';
    dispatchInputEvent(element, 'input', { inputType: 'deleteContent' });
  }

  for (const char of text) {
    // Dispatch key events for each character
    const keyOptions: KeyboardEventOptions = {
      key: char,
      code: getKeyCode(char),
      keyCode: char.charCodeAt(0),
      charCode: char.charCodeAt(0),
    };

    dispatchKeyboardEvent(element, 'keydown', keyOptions);
    dispatchKeyboardEvent(element, 'keypress', keyOptions);

    // Update the value
    element.value += char;

    // Dispatch input event
    dispatchInputEvent(element, 'input', { data: char, inputType: 'insertText' });

    dispatchKeyboardEvent(element, 'keyup', keyOptions);
  }

  // Dispatch change event when done
  const changeEvent = new Event('change', { bubbles: true, cancelable: false });
  element.dispatchEvent(changeEvent);
}

/**
 * Dispatches a FocusEvent on the target element
 */
export function dispatchFocusEvent(
  element: Element,
  eventType: FocusEventType,
  options: FocusEventOptions = {}
): boolean {
  // Focus and blur events don't bubble, but focusin and focusout do
  const bubbles = eventType === 'focusin' || eventType === 'focusout';

  const eventInit: FocusEventInit = {
    bubbles,
    cancelable: false,
    view: window,
    relatedTarget: options.relatedTarget ?? null,
  };

  const event = new FocusEvent(eventType, eventInit);
  return element.dispatchEvent(event);
}

/**
 * Focuses an element with proper event sequence
 */
export function focusElement(
  element: Element,
  previousElement?: Element | null
): { focusin: boolean; focus: boolean } {
  const options: FocusEventOptions = {
    relatedTarget: previousElement ?? null,
  };

  // If there was a previous element, blur it first
  if (previousElement) {
    dispatchFocusEvent(previousElement, 'focusout', { relatedTarget: element });
    dispatchFocusEvent(previousElement, 'blur', { relatedTarget: element });
  }

  const focusin = dispatchFocusEvent(element, 'focusin', options);
  const focus = dispatchFocusEvent(element, 'focus', options);

  // Actually focus the element if it's focusable
  if (element instanceof HTMLElement && typeof element.focus === 'function') {
    element.focus();
  }

  return { focusin, focus };
}

/**
 * Blurs an element with proper event sequence
 */
export function blurElement(
  element: Element,
  nextElement?: Element | null
): { focusout: boolean; blur: boolean } {
  const options: FocusEventOptions = {
    relatedTarget: nextElement ?? null,
  };

  const focusout = dispatchFocusEvent(element, 'focusout', options);
  const blur = dispatchFocusEvent(element, 'blur', options);

  // Actually blur the element if it's an HTMLElement
  if (element instanceof HTMLElement && typeof element.blur === 'function') {
    element.blur();
  }

  return { focusout, blur };
}

/**
 * Dispatches a hover sequence (mouseenter, mouseover)
 */
export function dispatchHover(
  element: Element,
  options: MouseEventOptions = {}
): { mouseenter: boolean; mouseover: boolean } {
  const mouseenter = dispatchMouseEvent(element, 'mouseenter', { ...options, bubbles: false } as MouseEventOptions & { bubbles: boolean });
  const mouseover = dispatchMouseEvent(element, 'mouseover', options);

  return { mouseenter, mouseover };
}

/**
 * Dispatches a mouse leave sequence (mouseleave, mouseout)
 */
export function dispatchMouseLeave(
  element: Element,
  options: MouseEventOptions = {}
): { mouseleave: boolean; mouseout: boolean } {
  const mouseleave = dispatchMouseEvent(element, 'mouseleave', { ...options, bubbles: false } as MouseEventOptions & { bubbles: boolean });
  const mouseout = dispatchMouseEvent(element, 'mouseout', options);

  return { mouseleave, mouseout };
}

/**
 * EventDispatcher class for more organized event dispatching
 */
export class EventDispatcher {
  private target: Element;

  constructor(target: Element) {
    this.target = target;
  }

  click(options?: MouseEventOptions): ReturnType<typeof dispatchClick> {
    return dispatchClick(this.target, options);
  }

  doubleClick(options?: MouseEventOptions): ReturnType<typeof dispatchDoubleClick> {
    return dispatchDoubleClick(this.target, options);
  }

  rightClick(options?: MouseEventOptions): ReturnType<typeof dispatchRightClick> {
    return dispatchRightClick(this.target, options);
  }

  mouseEvent(eventType: MouseEventType, options?: MouseEventOptions): boolean {
    return dispatchMouseEvent(this.target, eventType, options);
  }

  keyPress(options?: KeyboardEventOptions): ReturnType<typeof dispatchKeyPress> {
    return dispatchKeyPress(this.target, options);
  }

  keyDown(options?: KeyboardEventOptions): boolean {
    return dispatchKeyboardEvent(this.target, 'keydown', options);
  }

  keyUp(options?: KeyboardEventOptions): boolean {
    return dispatchKeyboardEvent(this.target, 'keyup', options);
  }

  keyCombination(key: string, modifiers?: ModifierKeys): ReturnType<typeof dispatchKeyCombination> {
    return dispatchKeyCombination(this.target, key, modifiers);
  }

  input(options?: InputEventOptions): boolean {
    return dispatchInputEvent(this.target, 'input', options);
  }

  focus(previousElement?: Element | null): ReturnType<typeof focusElement> {
    return focusElement(this.target, previousElement);
  }

  blur(nextElement?: Element | null): ReturnType<typeof blurElement> {
    return blurElement(this.target, nextElement);
  }

  hover(options?: MouseEventOptions): ReturnType<typeof dispatchHover> {
    return dispatchHover(this.target, options);
  }

  leave(options?: MouseEventOptions): ReturnType<typeof dispatchMouseLeave> {
    return dispatchMouseLeave(this.target, options);
  }

  type(text: string, options?: { clearFirst?: boolean }): void {
    if (this.target instanceof HTMLInputElement || this.target instanceof HTMLTextAreaElement) {
      typeText(this.target, text, options);
    } else {
      throw new Error('typeText can only be used on input or textarea elements');
    }
  }
}

/**
 * Creates an EventDispatcher for the given element
 */
export function createEventDispatcher(element: Element): EventDispatcher {
  return new EventDispatcher(element);
}

// Default export of all functions
export default {
  dispatchMouseEvent,
  dispatchClick,
  dispatchDoubleClick,
  dispatchRightClick,
  dispatchKeyboardEvent,
  dispatchKeyPress,
  dispatchKeyCombination,
  dispatchInputEvent,
  typeText,
  dispatchFocusEvent,
  focusElement,
  blurElement,
  dispatchHover,
  dispatchMouseLeave,
  createEventDispatcher,
  EventDispatcher,
};
