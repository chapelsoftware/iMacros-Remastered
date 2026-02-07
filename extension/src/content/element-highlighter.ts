/**
 * Element Highlighter for iMacros
 *
 * Provides visual feedback during macro playback:
 * - scroll-to-element: Scrolls the target element into view
 * - highlight-element: Highlights the target element with a visual overlay
 *
 * These options help users see what the macro is doing in real-time.
 */

// ===== Browser Environment Check =====

/** Check if we're in a browser environment with DOM access (checked at call time) */
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

// ===== Types =====

export interface HighlightOptions {
  /** Duration to show the highlight in milliseconds (default: 1500) */
  duration?: number;
  /** Color of the highlight border (default: '#ff6b00') */
  color?: string;
  /** Whether to scroll the element into view (default: true) */
  scroll?: boolean;
  /** Scroll behavior ('auto' | 'smooth') (default: 'smooth') */
  scrollBehavior?: ScrollBehavior;
  /** Label to show on the highlight (e.g., command name) */
  label?: string;
}

// ===== Highlight Overlay Management =====

let currentOverlay: HTMLElement | null = null;
let currentLabel: HTMLElement | null = null;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * CSS styles for the highlight overlay
 */
const HIGHLIGHT_STYLES = `
  .imacros-element-highlight {
    position: absolute;
    pointer-events: none;
    z-index: 2147483646;
    box-sizing: border-box;
    border: 3px solid #ff6b00;
    border-radius: 4px;
    background: rgba(255, 107, 0, 0.1);
    animation: imacros-highlight-pulse 0.6s ease-in-out infinite;
    transition: all 0.2s ease-out;
  }

  .imacros-element-highlight.imacros-highlight-success {
    border-color: #4caf50;
    background: rgba(76, 175, 80, 0.1);
  }

  .imacros-element-highlight.imacros-highlight-error {
    border-color: #f44336;
    background: rgba(244, 67, 54, 0.1);
  }

  @keyframes imacros-highlight-pulse {
    0%, 100% {
      box-shadow: 0 0 0 0 rgba(255, 107, 0, 0.4);
    }
    50% {
      box-shadow: 0 0 0 8px rgba(255, 107, 0, 0);
    }
  }

  .imacros-element-highlight-label {
    position: absolute;
    pointer-events: none;
    z-index: 2147483647;
    padding: 4px 8px;
    background: #ff6b00;
    color: white;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 11px;
    font-weight: 500;
    border-radius: 3px;
    white-space: nowrap;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  }

  .imacros-highlight-success .imacros-element-highlight-label,
  .imacros-element-highlight-label.imacros-label-success {
    background: #4caf50;
  }

  .imacros-highlight-error .imacros-element-highlight-label,
  .imacros-element-highlight-label.imacros-label-error {
    background: #f44336;
  }
`;

/**
 * Inject the highlight styles into the document
 */
function ensureStylesInjected(): void {
  if (!isBrowser()) return;
  if (document.getElementById('imacros-highlight-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'imacros-highlight-styles';
  style.textContent = HIGHLIGHT_STYLES;
  document.head.appendChild(style);
}

/**
 * Get the bounding rect of an element relative to the document
 */
function getElementDocumentRect(element: Element): DOMRect | null {
  if (!isBrowser()) {
    return null;
  }
  const rect = element.getBoundingClientRect();
  const scrollX = window.scrollX || document.documentElement.scrollLeft;
  const scrollY = window.scrollY || document.documentElement.scrollTop;

  return new DOMRect(
    rect.left + scrollX,
    rect.top + scrollY,
    rect.width,
    rect.height
  );
}

/**
 * Remove the current highlight overlay
 */
function removeCurrentHighlight(): void {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }

  if (currentOverlay && currentOverlay.parentElement) {
    currentOverlay.parentElement.removeChild(currentOverlay);
  }
  currentOverlay = null;

  if (currentLabel && currentLabel.parentElement) {
    currentLabel.parentElement.removeChild(currentLabel);
  }
  currentLabel = null;
}

// ===== Public API =====

/**
 * Scroll an element into view
 *
 * @param element The element to scroll into view
 * @param behavior Scroll behavior ('auto' or 'smooth')
 */
export function scrollToElement(
  element: Element,
  behavior: ScrollBehavior = 'smooth'
): void {
  if (!isBrowser()) return;

  // Check if element is already in viewport
  const rect = element.getBoundingClientRect();
  const isInViewport = (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );

  if (!isInViewport) {
    element.scrollIntoView({
      behavior,
      block: 'center',
      inline: 'center',
    });
  }
}

/**
 * Highlight an element with a visual overlay
 *
 * @param element The element to highlight
 * @param options Highlight options
 */
export function highlightElement(
  element: Element,
  options: HighlightOptions = {}
): void {
  if (!isBrowser()) return;

  const {
    duration = 1500,
    color = '#ff6b00',
    scroll = true,
    scrollBehavior = 'smooth',
    label,
  } = options;

  ensureStylesInjected();
  removeCurrentHighlight();

  // Scroll into view if requested
  if (scroll) {
    scrollToElement(element, scrollBehavior);
  }

  // Small delay to allow scroll to complete
  setTimeout(() => {
    // Re-check browser environment in case it changed during timeout
    if (!isBrowser()) return;

    const rect = getElementDocumentRect(element);
    if (!rect) return;

    // Create highlight overlay
    const overlay = document.createElement('div');
    overlay.className = 'imacros-element-highlight';

    // Apply custom color if not default
    if (color !== '#ff6b00') {
      overlay.style.borderColor = color;
      overlay.style.background = color.replace(')', ', 0.1)').replace('rgb', 'rgba');
    }

    overlay.style.left = `${rect.left - 3}px`;
    overlay.style.top = `${rect.top - 3}px`;
    overlay.style.width = `${rect.width + 6}px`;
    overlay.style.height = `${rect.height + 6}px`;

    document.body.appendChild(overlay);
    currentOverlay = overlay;

    // Create label if provided
    if (label) {
      const labelEl = document.createElement('div');
      labelEl.className = 'imacros-element-highlight-label';
      labelEl.textContent = label;

      // Position label above the element
      labelEl.style.left = `${rect.left}px`;
      labelEl.style.top = `${rect.top - 24}px`;

      // Adjust if label would be off screen
      if (rect.top - 24 < 0) {
        labelEl.style.top = `${rect.bottom + 4}px`;
      }

      document.body.appendChild(labelEl);
      currentLabel = labelEl;
    }

    // Auto-hide after duration
    if (duration > 0) {
      hideTimeout = setTimeout(() => {
        removeCurrentHighlight();
      }, duration);
    }
  }, scroll ? 200 : 0);
}

/**
 * Highlight an element with success styling
 */
export function highlightElementSuccess(
  element: Element,
  options: Omit<HighlightOptions, 'color'> = {}
): void {
  highlightElement(element, {
    ...options,
    color: '#4caf50',
  });

  // Add success class after a small delay
  setTimeout(() => {
    if (currentOverlay) {
      currentOverlay.classList.add('imacros-highlight-success');
    }
    if (currentLabel) {
      currentLabel.classList.add('imacros-label-success');
    }
  }, 10);
}

/**
 * Highlight an element with error styling
 */
export function highlightElementError(
  element: Element,
  options: Omit<HighlightOptions, 'color'> = {}
): void {
  highlightElement(element, {
    ...options,
    color: '#f44336',
    duration: options.duration ?? 3000, // Longer duration for errors
  });

  // Add error class after a small delay
  setTimeout(() => {
    if (currentOverlay) {
      currentOverlay.classList.add('imacros-highlight-error');
    }
    if (currentLabel) {
      currentLabel.classList.add('imacros-label-error');
    }
  }, 10);
}

/**
 * Clear the current element highlight
 */
export function clearElementHighlight(): void {
  if (!isBrowser()) return;
  removeCurrentHighlight();
}

/**
 * Check if an element is currently highlighted
 */
export function isElementHighlighted(): boolean {
  return currentOverlay !== null;
}

// ===== Settings-aware highlighting =====

/**
 * Global settings for element highlighting
 */
interface HighlightSettings {
  scrollToElement: boolean;
  highlightElement: boolean;
  highlightDuration: number;
}

let highlightSettings: HighlightSettings = {
  scrollToElement: true,
  highlightElement: true,
  highlightDuration: 1500,
};

/**
 * Update highlight settings
 */
export function setHighlightSettings(settings: Partial<HighlightSettings>): void {
  highlightSettings = { ...highlightSettings, ...settings };
}

/**
 * Get current highlight settings
 */
export function getHighlightSettings(): HighlightSettings {
  return { ...highlightSettings };
}

/**
 * Highlight element based on current settings
 * This is the main function to call during macro playback
 */
export function highlightPlaybackElement(
  element: Element,
  options: { label?: string; success?: boolean; error?: boolean } = {}
): void {
  // Check if highlighting is enabled
  if (!highlightSettings.highlightElement && !highlightSettings.scrollToElement) {
    return;
  }

  // Only scroll if highlight is disabled
  if (!highlightSettings.highlightElement && highlightSettings.scrollToElement) {
    scrollToElement(element);
    return;
  }

  const highlightOptions: HighlightOptions = {
    duration: highlightSettings.highlightDuration,
    scroll: highlightSettings.scrollToElement,
    label: options.label,
  };

  if (options.error) {
    highlightElementError(element, highlightOptions);
  } else if (options.success) {
    highlightElementSuccess(element, highlightOptions);
  } else {
    highlightElement(element, highlightOptions);
  }
}

// ===== Message Handler for Content Script =====

/**
 * Handle highlight messages from background script
 */
export function handleHighlightMessage(
  message: { type: string; payload?: Record<string, unknown> }
): boolean {
  switch (message.type) {
    case 'HIGHLIGHT_ELEMENT': {
      const payload = message.payload || {};
      const selector = payload.selector as string | undefined;

      if (selector) {
        const element = document.querySelector(selector);
        if (element) {
          highlightPlaybackElement(element, {
            label: payload.label as string | undefined,
            success: payload.success as boolean | undefined,
            error: payload.error as boolean | undefined,
          });
        }
      }
      return true;
    }

    case 'CLEAR_ELEMENT_HIGHLIGHT': {
      clearElementHighlight();
      return true;
    }

    case 'SET_HIGHLIGHT_SETTINGS': {
      const payload = message.payload || {};
      setHighlightSettings({
        scrollToElement: payload.scrollToElement as boolean | undefined,
        highlightElement: payload.highlightElement as boolean | undefined,
        highlightDuration: payload.highlightDuration as number | undefined,
      });
      return true;
    }

    default:
      return false;
  }
}

/**
 * Initialize the element highlighter message listener
 */
export function initializeElementHighlighter(): void {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) {
    return;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (handleHighlightMessage(message)) {
      sendResponse({ success: true });
      return true;
    }
    return false;
  });

  console.log('[iMacros] Element highlighter initialized');
}

// ===== Default Export =====

export default {
  scrollToElement,
  highlightElement,
  highlightElementSuccess,
  highlightElementError,
  clearElementHighlight,
  isElementHighlighted,
  setHighlightSettings,
  getHighlightSettings,
  highlightPlaybackElement,
  handleHighlightMessage,
  initializeElementHighlighter,
};
