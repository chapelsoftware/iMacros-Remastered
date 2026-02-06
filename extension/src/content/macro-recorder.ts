/**
 * Macro Recorder for iMacros
 *
 * Captures user interactions (clicks, form changes, keyboard input)
 * and generates TAG commands with correct POS/TYPE/ATTR.
 * Sends recorded events to native host through background script.
 */

import {
  getAttributeValue,
  getFullTextContent,
  matchesType,
} from './element-finder';
import {
  highlightElement,
  highlightElementSuccess,
  clearElementHighlight,
} from './element-highlighter';

/**
 * Types of recorded events
 */
export type RecordedEventType =
  | 'click'
  | 'input'
  | 'change'
  | 'submit'
  | 'select'
  | 'focus'
  | 'keydown';

/**
 * Recorded event data
 */
export interface RecordedEvent {
  /** Type of event */
  type: RecordedEventType;
  /** Generated iMacros command */
  command: string;
  /** Timestamp when event occurred */
  timestamp: number;
  /** URL where event occurred */
  url: string;
  /** Additional metadata */
  metadata?: {
    tagName?: string;
    elementType?: string;
    value?: string;
    key?: string;
    x?: number;
    y?: number;
    modifiers?: {
      ctrl?: boolean;
      alt?: boolean;
      shift?: boolean;
      meta?: boolean;
    };
  };
}

/**
 * TAG command parameters
 */
export interface TagCommandParams {
  pos: number;
  type: string;
  attrs: Record<string, string>;
  form?: string;
  content?: string;
}

/**
 * Element type mapping for iMacros TYPE parameter
 */
const ELEMENT_TYPE_MAP: Record<string, string> = {
  // Input types
  'INPUT:text': 'INPUT:TEXT',
  'INPUT:password': 'INPUT:PASSWORD',
  'INPUT:email': 'INPUT:EMAIL',
  'INPUT:number': 'INPUT:NUMBER',
  'INPUT:tel': 'INPUT:TEL',
  'INPUT:url': 'INPUT:URL',
  'INPUT:search': 'INPUT:SEARCH',
  'INPUT:date': 'INPUT:DATE',
  'INPUT:time': 'INPUT:TIME',
  'INPUT:datetime-local': 'INPUT:DATETIME-LOCAL',
  'INPUT:month': 'INPUT:MONTH',
  'INPUT:week': 'INPUT:WEEK',
  'INPUT:color': 'INPUT:COLOR',
  'INPUT:range': 'INPUT:RANGE',
  'INPUT:file': 'INPUT:FILE',
  'INPUT:hidden': 'INPUT:HIDDEN',
  'INPUT:checkbox': 'INPUT:CHECKBOX',
  'INPUT:radio': 'INPUT:RADIO',
  'INPUT:submit': 'INPUT:SUBMIT',
  'INPUT:reset': 'INPUT:RESET',
  'INPUT:button': 'INPUT:BUTTON',
  'INPUT:image': 'INPUT:IMAGE',
  // Button types
  'BUTTON:submit': 'BUTTON:SUBMIT',
  'BUTTON:reset': 'BUTTON:RESET',
  'BUTTON:button': 'BUTTON:BUTTON',
};

/**
 * Callback for when an event is recorded
 */
export type RecordEventCallback = (event: RecordedEvent) => void;

/**
 * Configuration for the macro recorder
 */
export interface MacroRecorderConfig {
  /** Whether to record click events */
  recordClicks: boolean;
  /** Whether to record input/change events */
  recordInputs: boolean;
  /** Whether to record form submissions */
  recordSubmits: boolean;
  /** Whether to record keyboard shortcuts */
  recordKeyboard: boolean;
  /** Whether to use text content for element identification */
  useTextContent: boolean;
  /** Preferred attribute order for identification */
  preferredAttributes: string[];
  /** Whether to highlight elements during recording */
  highlightElements: boolean;
}

/**
 * Default recorder configuration
 */
const DEFAULT_CONFIG: MacroRecorderConfig = {
  recordClicks: true,
  recordInputs: true,
  recordSubmits: true,
  recordKeyboard: false,
  useTextContent: true,
  preferredAttributes: ['id', 'name', 'class', 'href', 'src', 'value', 'title', 'placeholder'],
  highlightElements: true,
};

/**
 * Macro Recorder class
 * Manages recording of user interactions and generation of iMacros commands
 */
export class MacroRecorder {
  /** Whether recording is active */
  private recording: boolean = false;

  /** Current configuration */
  private config: MacroRecorderConfig;

  /** Recorded events */
  private events: RecordedEvent[] = [];

  /** Event callback */
  private eventCallback: RecordEventCallback | null = null;

  /** Element position cache for POS calculation */
  private elementPositionCache: WeakMap<Element, Map<string, number>> = new WeakMap();

  /** Bound event handlers */
  private boundHandlers: {
    click: (e: MouseEvent) => void;
    input: (e: Event) => void;
    change: (e: Event) => void;
    submit: (e: SubmitEvent) => void;
    keydown: (e: KeyboardEvent) => void;
    mouseover: (e: MouseEvent) => void;
    mouseout: (e: MouseEvent) => void;
  };

  /** Currently hovered element for highlighting */
  private currentHoveredElement: Element | null = null;

  constructor(config: Partial<MacroRecorderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Bind event handlers
    this.boundHandlers = {
      click: this.handleClick.bind(this),
      input: this.handleInput.bind(this),
      change: this.handleChange.bind(this),
      submit: this.handleSubmit.bind(this),
      keydown: this.handleKeydown.bind(this),
      mouseover: this.handleMouseOver.bind(this),
      mouseout: this.handleMouseOut.bind(this),
    };
  }

  /**
   * Start recording user interactions
   */
  start(): void {
    if (this.recording) {
      return;
    }

    this.recording = true;
    this.events = [];
    this.installEventListeners();

    console.log('[iMacros] Macro recorder started');
  }

  /**
   * Stop recording user interactions
   */
  stop(): void {
    if (!this.recording) {
      return;
    }

    this.recording = false;
    this.removeEventListeners();

    console.log('[iMacros] Macro recorder stopped');
  }

  /**
   * Check if recording is active
   */
  isRecording(): boolean {
    return this.recording;
  }

  /**
   * Get all recorded events
   */
  getEvents(): RecordedEvent[] {
    return [...this.events];
  }

  /**
   * Clear recorded events
   */
  clearEvents(): void {
    this.events = [];
  }

  /**
   * Set the event callback
   */
  setEventCallback(callback: RecordEventCallback | null): void {
    this.eventCallback = callback;
  }

  /**
   * Set configuration
   */
  setConfig(config: Partial<MacroRecorderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): MacroRecorderConfig {
    return { ...this.config };
  }

  /**
   * Generate a playable macro from recorded events
   */
  generateMacro(): string {
    const lines: string[] = [
      "' iMacros Recorded Macro",
      `' Recorded: ${new Date().toISOString()}`,
      `' URL: ${window.location.href}`,
      '',
    ];

    for (const event of this.events) {
      lines.push(event.command);
    }

    return lines.join('\n');
  }

  /**
   * Install event listeners for recording
   */
  private installEventListeners(): void {
    if (this.config.recordClicks) {
      document.addEventListener('click', this.boundHandlers.click, true);
    }

    if (this.config.recordInputs) {
      document.addEventListener('input', this.boundHandlers.input, true);
      document.addEventListener('change', this.boundHandlers.change, true);
    }

    if (this.config.recordSubmits) {
      document.addEventListener('submit', this.boundHandlers.submit, true);
    }

    if (this.config.recordKeyboard) {
      document.addEventListener('keydown', this.boundHandlers.keydown, true);
    }

    // Install highlight handlers if enabled
    if (this.config.highlightElements) {
      document.addEventListener('mouseover', this.boundHandlers.mouseover, true);
      document.addEventListener('mouseout', this.boundHandlers.mouseout, true);
    }
  }

  /**
   * Remove event listeners
   */
  private removeEventListeners(): void {
    document.removeEventListener('click', this.boundHandlers.click, true);
    document.removeEventListener('input', this.boundHandlers.input, true);
    document.removeEventListener('change', this.boundHandlers.change, true);
    document.removeEventListener('submit', this.boundHandlers.submit, true);
    document.removeEventListener('keydown', this.boundHandlers.keydown, true);
    document.removeEventListener('mouseover', this.boundHandlers.mouseover, true);
    document.removeEventListener('mouseout', this.boundHandlers.mouseout, true);

    // Clear any active highlight
    this.currentHoveredElement = null;
    clearElementHighlight();
  }

  /**
   * Handle click events
   */
  private handleClick(e: MouseEvent): void {
    const target = e.target as Element;
    if (!target || !this.isRecordableElement(target)) {
      return;
    }

    // Skip if this is an input element (will be handled by input/change)
    const tagName = target.tagName.toUpperCase();
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
      const inputType = (target as HTMLInputElement).type?.toLowerCase();
      // Only skip text-like inputs, record clicks on buttons/checkboxes/radios
      if (!['checkbox', 'radio', 'submit', 'reset', 'button', 'image', 'file'].includes(inputType)) {
        return;
      }
    }

    // Show click capture confirmation with success highlight
    if (this.config.highlightElements) {
      this.flashElementCapture(target);
    }

    const command = this.generateTagCommand(target);
    this.recordEvent('click', command, {
      tagName: target.tagName,
      elementType: this.getElementType(target),
      x: e.clientX,
      y: e.clientY,
    });
  }

  /**
   * Handle input events (for real-time text input)
   */
  private handleInput(e: Event): void {
    // We primarily use 'change' event for recording
    // Input events are too frequent, so we skip them here
    // unless it's a special case
  }

  /**
   * Handle change events
   */
  private handleChange(e: Event): void {
    const target = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (!target || !this.isRecordableElement(target)) {
      return;
    }

    const tagName = target.tagName.toUpperCase();
    let value = '';
    let command = '';

    if (tagName === 'SELECT') {
      const select = target as HTMLSelectElement;
      const selectedOption = select.options[select.selectedIndex];
      if (selectedOption) {
        // Use %value% for option value or text
        value = selectedOption.value || selectedOption.text;
        command = this.generateTagCommand(target, { content: `%${value}` });
      }
    } else if (tagName === 'INPUT') {
      const input = target as HTMLInputElement;
      const inputType = input.type.toLowerCase();

      if (inputType === 'checkbox' || inputType === 'radio') {
        // For checkbox/radio, record the click (checked state)
        value = input.checked ? 'YES' : 'NO';
        command = this.generateTagCommand(target, { content: value });
      } else if (inputType === 'file') {
        // File inputs need special handling - just record the TAG without content
        command = this.generateTagCommand(target);
      } else {
        // Text-like inputs
        value = input.value;
        command = this.generateTagCommand(target, { content: value });
      }
    } else if (tagName === 'TEXTAREA') {
      value = (target as HTMLTextAreaElement).value;
      command = this.generateTagCommand(target, { content: value });
    }

    if (command) {
      // Show change capture confirmation with success highlight
      if (this.config.highlightElements) {
        this.flashElementCapture(target);
      }

      this.recordEvent('change', command, {
        tagName: target.tagName,
        elementType: this.getElementType(target),
        value,
      });
    }
  }

  /**
   * Handle form submit events
   */
  private handleSubmit(e: SubmitEvent): void {
    const form = e.target as HTMLFormElement;
    if (!form) {
      return;
    }

    // Find the submit button if one was used
    const submitter = e.submitter as HTMLElement | null;

    if (submitter && this.isRecordableElement(submitter)) {
      // Show submit capture confirmation
      if (this.config.highlightElements) {
        this.flashElementCapture(submitter);
      }

      const command = this.generateTagCommand(submitter);
      this.recordEvent('submit', command, {
        tagName: submitter.tagName,
        elementType: this.getElementType(submitter),
      });
    } else {
      // Generate a form submission command
      // Try to find the submit button in the form
      const submitBtn = form.querySelector('input[type="submit"], button[type="submit"], button:not([type])');
      if (submitBtn) {
        // Show submit capture confirmation
        if (this.config.highlightElements) {
          this.flashElementCapture(submitBtn);
        }

        const command = this.generateTagCommand(submitBtn);
        this.recordEvent('submit', command, {
          tagName: submitBtn.tagName,
          elementType: this.getElementType(submitBtn),
        });
      }
    }
  }

  /**
   * Handle keyboard events (for shortcuts)
   */
  private handleKeydown(e: KeyboardEvent): void {
    // Only record keyboard shortcuts with modifiers
    if (!e.ctrlKey && !e.altKey && !e.metaKey) {
      return;
    }

    // Skip if target is an input (normal typing)
    const target = e.target as Element;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }

    const modifiers: string[] = [];
    if (e.ctrlKey) modifiers.push('CTRL');
    if (e.altKey) modifiers.push('ALT');
    if (e.shiftKey) modifiers.push('SHIFT');
    if (e.metaKey) modifiers.push('META');

    const key = e.key.toUpperCase();
    const command = `ONDOWNLOAD FOLDER=* FILE=+ WAIT=YES\n' Keyboard: ${modifiers.join('+')}+${key}`;

    this.recordEvent('keydown', command, {
      key,
      modifiers: {
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        meta: e.metaKey,
      },
    });
  }

  /**
   * Handle mouseover events for element highlighting during recording
   */
  private handleMouseOver(e: MouseEvent): void {
    if (!this.config.highlightElements) {
      return;
    }

    const target = e.target as Element;
    if (!target || !this.isRecordableElement(target)) {
      return;
    }

    // Skip iMacros highlight overlays themselves
    if (target.classList.contains('imacros-element-highlight') ||
        target.classList.contains('imacros-element-highlight-label')) {
      return;
    }

    // Don't re-highlight the same element
    if (this.currentHoveredElement === target) {
      return;
    }

    this.currentHoveredElement = target;

    // Show hover highlight (orange, no auto-hide while hovering)
    highlightElement(target, {
      duration: 0, // No auto-hide while hovering
      scroll: false, // Don't scroll on hover
      label: 'Recording',
    });
  }

  /**
   * Handle mouseout events to clear element highlighting
   */
  private handleMouseOut(e: MouseEvent): void {
    if (!this.config.highlightElements) {
      return;
    }

    const target = e.target as Element;

    // Only clear if we're leaving the currently highlighted element
    if (target === this.currentHoveredElement) {
      // Check if we're moving to a child element (don't clear in that case)
      const relatedTarget = e.relatedTarget as Element | null;
      if (relatedTarget && this.currentHoveredElement.contains(relatedTarget)) {
        return;
      }

      this.currentHoveredElement = null;
      clearElementHighlight();
    }
  }

  /**
   * Flash element with success highlight to confirm capture
   */
  private flashElementCapture(element: Element): void {
    // Clear any hover highlight first
    clearElementHighlight();
    this.currentHoveredElement = null;

    // Show success flash (green, brief duration)
    highlightElementSuccess(element, {
      duration: 500, // Brief flash to confirm capture
      scroll: false, // Don't scroll on capture
      label: 'Captured',
    });
  }

  /**
   * Check if an element should be recorded
   */
  private isRecordableElement(element: Element): boolean {
    // Skip invisible elements
    if (element instanceof HTMLElement) {
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }
    }

    // Skip iMacros UI elements
    if (element.closest('[data-imacros-ui]')) {
      return false;
    }

    return true;
  }

  /**
   * Get the iMacros TYPE for an element
   */
  private getElementType(element: Element): string {
    const tagName = element.tagName.toUpperCase();

    if (tagName === 'INPUT') {
      const inputType = (element.getAttribute('type') || 'text').toLowerCase();
      const key = `INPUT:${inputType}`;
      return ELEMENT_TYPE_MAP[key] || `INPUT:${inputType.toUpperCase()}`;
    }

    if (tagName === 'BUTTON') {
      const buttonType = (element.getAttribute('type') || 'submit').toLowerCase();
      const key = `BUTTON:${buttonType}`;
      return ELEMENT_TYPE_MAP[key] || `BUTTON:${buttonType.toUpperCase()}`;
    }

    return tagName;
  }

  /**
   * Calculate POS for an element among matching elements
   */
  private calculatePosition(element: Element, selector: string): number {
    // Build CSS selector for similar elements
    const tagName = element.tagName.toLowerCase();
    let cssSelector = tagName;

    if (element.tagName === 'INPUT') {
      const type = element.getAttribute('type') || 'text';
      cssSelector = `input[type="${type}"]`;
    }

    // Find all matching elements
    const allMatching = Array.from(document.querySelectorAll(cssSelector));

    // Find position (1-indexed)
    const index = allMatching.indexOf(element);
    return index >= 0 ? index + 1 : 1;
  }

  /**
   * Get identifying attributes for an element
   */
  private getIdentifyingAttributes(element: Element): Record<string, string> {
    const attrs: Record<string, string> = {};

    // Check preferred attributes in order
    for (const attrName of this.config.preferredAttributes) {
      const value = getAttributeValue(element, attrName);
      if (value && value.trim()) {
        attrs[attrName.toUpperCase()] = this.escapeAttributeValue(value);
        // One identifying attribute is often enough
        if (attrName === 'id' || attrName === 'name') {
          break;
        }
      }
    }

    // If no identifying attribute found, try text content
    if (Object.keys(attrs).length === 0 && this.config.useTextContent) {
      const text = getFullTextContent(element);
      if (text && text.length > 0 && text.length < 100) {
        attrs['TXT'] = this.escapeAttributeValue(text);
      }
    }

    return attrs;
  }

  /**
   * Escape special characters in attribute values
   */
  private escapeAttributeValue(value: string): string {
    // Replace newlines and tabs
    let escaped = value.replace(/\r?\n/g, ' ').replace(/\t/g, ' ');

    // Trim and collapse whitespace
    escaped = escaped.trim().replace(/\s+/g, ' ');

    // Truncate if too long
    if (escaped.length > 200) {
      escaped = escaped.substring(0, 197) + '*';
    }

    return escaped;
  }

  /**
   * Generate a TAG command for an element
   */
  private generateTagCommand(
    element: Element,
    options: { content?: string; form?: string } = {}
  ): string {
    const type = this.getElementType(element);
    const attrs = this.getIdentifyingAttributes(element);

    // Calculate position
    const pos = this.calculatePositionForElement(element, type, attrs);

    // Build command parts
    const parts: string[] = ['TAG'];
    parts.push(`POS=${pos}`);
    parts.push(`TYPE=${type}`);

    // Add FORM if specified
    if (options.form) {
      parts.push(`FORM=${options.form}`);
    }

    // Add attributes
    for (const [name, value] of Object.entries(attrs)) {
      parts.push(`ATTR:${name}=${value}`);
    }

    // Add CONTENT if specified
    if (options.content !== undefined) {
      const escapedContent = this.escapeContentValue(options.content);
      parts.push(`CONTENT=${escapedContent}`);
    }

    return parts.join(' ');
  }

  /**
   * Calculate position for element with given type and attributes
   */
  private calculatePositionForElement(
    element: Element,
    type: string,
    attrs: Record<string, string>
  ): number {
    // If we have a unique ID, position is 1
    if (attrs['ID']) {
      return 1;
    }

    // Build a simple selector based on type
    const tagName = element.tagName.toLowerCase();
    let selector = tagName;

    if (tagName === 'input') {
      const inputType = element.getAttribute('type') || 'text';
      selector = `input[type="${inputType}"]`;
    }

    // Find all matching elements
    const allElements = Array.from(document.querySelectorAll(selector));

    // Filter by matching attributes
    const matchingElements = allElements.filter((el) => {
      for (const [name, value] of Object.entries(attrs)) {
        const elValue = getAttributeValue(el, name);
        if (elValue !== value) {
          return false;
        }
      }
      return true;
    });

    // Find position in filtered list
    const index = matchingElements.indexOf(element);
    return index >= 0 ? index + 1 : 1;
  }

  /**
   * Escape content value for iMacros
   */
  private escapeContentValue(value: string): string {
    // Handle special cases
    if (value === '') {
      return '""';
    }

    // Check if value contains spaces or special characters
    const needsQuotes = /[\s"'<>]/.test(value);

    if (needsQuotes) {
      // Escape quotes and wrap in quotes
      const escaped = value.replace(/"/g, '\\"');
      return `"${escaped}"`;
    }

    return value;
  }

  /**
   * Record an event
   */
  private recordEvent(
    type: RecordedEventType,
    command: string,
    metadata?: RecordedEvent['metadata']
  ): void {
    const event: RecordedEvent = {
      type,
      command,
      timestamp: Date.now(),
      url: window.location.href,
      metadata,
    };

    this.events.push(event);

    // Call the event callback
    if (this.eventCallback) {
      try {
        this.eventCallback(event);
      } catch (error) {
        console.error('[iMacros] Error in record event callback:', error);
      }
    }

    // Send to background script
    this.sendEventToBackground(event);
  }

  /**
   * Send recorded event to background script
   */
  private sendEventToBackground(event: RecordedEvent): void {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'RECORD_EVENT',
          payload: event,
          timestamp: Date.now(),
        }).catch((error: unknown) => {
          // Ignore errors if background script is not available
          console.debug('[iMacros] Could not send record event:', error);
        });
      }
    } catch (error) {
      console.debug('[iMacros] Error sending record event:', error);
    }
  }
}

/**
 * Singleton instance of the macro recorder
 */
let recorderInstance: MacroRecorder | null = null;

/**
 * Get the macro recorder instance
 */
export function getMacroRecorder(): MacroRecorder {
  if (!recorderInstance) {
    recorderInstance = new MacroRecorder();
  }
  return recorderInstance;
}

/**
 * Initialize the macro recorder with messaging to background script
 */
export function initializeMacroRecorder(): MacroRecorder {
  const recorder = getMacroRecorder();

  // Set up event callback to log events
  recorder.setEventCallback((event: RecordedEvent) => {
    console.log('[iMacros] Recorded:', event.command);
  });

  return recorder;
}

/**
 * Handle RECORD_START message from background script
 */
export function handleRecordStartMessage(config?: Partial<MacroRecorderConfig>): void {
  const recorder = getMacroRecorder();
  if (config) {
    recorder.setConfig(config);
  }
  recorder.start();
}

/**
 * Handle RECORD_STOP message from background script
 */
export function handleRecordStopMessage(): { events: RecordedEvent[]; macro: string } {
  const recorder = getMacroRecorder();
  recorder.stop();

  return {
    events: recorder.getEvents(),
    macro: recorder.generateMacro(),
  };
}

/**
 * Handle RECORD_STATUS message from background script
 */
export function handleRecordStatusMessage(): {
  recording: boolean;
  eventCount: number;
  config: MacroRecorderConfig;
} {
  const recorder = getMacroRecorder();
  return {
    recording: recorder.isRecording(),
    eventCount: recorder.getEvents().length,
    config: recorder.getConfig(),
  };
}

/**
 * Message listener for recording control
 */
export function setupRecordingMessageListener(): void {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) {
    return;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'RECORD_START') {
      try {
        handleRecordStartMessage(message.payload?.config);
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (message.type === 'RECORD_STOP') {
      try {
        const result = handleRecordStopMessage();
        sendResponse({ success: true, ...result });
      } catch (error) {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (message.type === 'RECORD_STATUS') {
      try {
        const status = handleRecordStatusMessage();
        sendResponse({ success: true, ...status });
      } catch (error) {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (message.type === 'RECORD_CLEAR') {
      try {
        const recorder = getMacroRecorder();
        recorder.clearEvents();
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (message.type === 'RECORD_GET_MACRO') {
      try {
        const recorder = getMacroRecorder();
        const macro = recorder.generateMacro();
        sendResponse({ success: true, macro });
      } catch (error) {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    return false;
  });
}

// Export types and classes for external use
export default {
  MacroRecorder,
  getMacroRecorder,
  initializeMacroRecorder,
  handleRecordStartMessage,
  handleRecordStopMessage,
  handleRecordStatusMessage,
  setupRecordingMessageListener,
};
