/**
 * Frame Handler for iMacros
 *
 * Manages frame selection and command routing for iMacros macros.
 * Supports:
 * - Frame enumeration (find all frames on page)
 * - FRAME F=n selection (0 = main, 1+ = iframes in order)
 * - FRAME NAME=name selection by frame name attribute
 * - Track currently selected frame
 * - Route commands to correct frame's content script
 * - Nested frame support
 * - Cross-origin frame handling (where possible)
 */

// ===== Types =====

/**
 * Information about a frame
 */
export interface FrameInfo {
  /** Frame index (0 = main document, 1+ = iframes in DOM order) */
  index: number;
  /** Frame name attribute (if present) */
  name: string | null;
  /** Frame id attribute (if present) */
  id: string | null;
  /** Frame src URL */
  src: string;
  /** Whether this is the main/top frame */
  isMain: boolean;
  /** Whether frame is same-origin (we can access its content) */
  isSameOrigin: boolean;
  /** Parent frame index (null for main frame) */
  parentIndex: number | null;
  /** Depth in frame hierarchy (0 for main, 1 for direct children, etc.) */
  depth: number;
  /** The actual HTMLIFrameElement or HTMLFrameElement (null for main) */
  element: HTMLIFrameElement | HTMLFrameElement | null;
  /** Reference to the frame's Window object (if accessible) */
  contentWindow: Window | null;
  /** Reference to the frame's Document object (if accessible) */
  contentDocument: Document | null;
}

/**
 * Result of a frame operation
 */
export interface FrameOperationResult {
  success: boolean;
  errorMessage?: string;
  frameInfo?: FrameInfo;
  frameList?: FrameInfo[];
}

/**
 * Frame selection criteria
 */
export interface FrameSelector {
  /** Select by index (0 = main) */
  index?: number;
  /** Select by name attribute */
  name?: string;
  /** Select by id attribute */
  id?: string;
}

// ===== Frame Handler Class =====

/**
 * Manages frame selection and routing for iMacros
 */
export class FrameHandler {
  /** Currently selected frame index */
  private currentFrameIndex: number = 0;

  /** Cached list of frames (refreshed on enumeration) */
  private frameCache: FrameInfo[] = [];

  /** Last enumeration timestamp */
  private lastEnumerationTime: number = 0;

  /** Cache expiration time in milliseconds */
  private cacheExpirationMs: number = 1000;

  constructor() {
    // Initialize with main frame selected
    this.currentFrameIndex = 0;
  }

  // ===== Frame Enumeration =====

  /**
   * Check if a frame is same-origin (accessible)
   */
  private isSameOrigin(frame: HTMLIFrameElement | HTMLFrameElement): boolean {
    try {
      // Try to access contentDocument - will throw if cross-origin
      const doc = frame.contentDocument;
      return doc !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get content window/document for a frame if accessible
   */
  private getFrameContent(frame: HTMLIFrameElement | HTMLFrameElement): {
    contentWindow: Window | null;
    contentDocument: Document | null;
  } {
    try {
      return {
        contentWindow: frame.contentWindow,
        contentDocument: frame.contentDocument,
      };
    } catch {
      return {
        contentWindow: null,
        contentDocument: null,
      };
    }
  }

  /**
   * Enumerate all frames on the page recursively
   * Returns frames in document order (depth-first traversal)
   */
  public enumerateFrames(forceRefresh: boolean = false): FrameInfo[] {
    const now = Date.now();

    // Return cached frames if still valid
    if (!forceRefresh && this.frameCache.length > 0 &&
        (now - this.lastEnumerationTime) < this.cacheExpirationMs) {
      return this.frameCache;
    }

    const frames: FrameInfo[] = [];
    let frameIndex = 0;

    // Add main frame (index 0)
    frames.push({
      index: frameIndex++,
      name: null,
      id: null,
      src: window.location.href,
      isMain: true,
      isSameOrigin: true,
      parentIndex: null,
      depth: 0,
      element: null,
      contentWindow: window,
      contentDocument: document,
    });

    // Recursively enumerate frames starting from main document
    this.enumerateFramesRecursive(document, frames, frameIndex, null, 0);

    // Update cache
    this.frameCache = frames;
    this.lastEnumerationTime = now;

    return frames;
  }

  /**
   * Recursively enumerate frames in a document
   */
  private enumerateFramesRecursive(
    doc: Document,
    frames: FrameInfo[],
    startIndex: number,
    parentIndex: number | null,
    depth: number
  ): number {
    let currentIndex = startIndex;

    // Find all iframe and frame elements in document order
    const frameElements = doc.querySelectorAll('iframe, frame');

    for (const element of frameElements) {
      const frame = element as HTMLIFrameElement | HTMLFrameElement;
      const isSameOrigin = this.isSameOrigin(frame);
      const { contentWindow, contentDocument } = this.getFrameContent(frame);

      const frameInfo: FrameInfo = {
        index: currentIndex,
        name: frame.name || null,
        id: frame.id || null,
        src: frame.src || '',
        isMain: false,
        isSameOrigin,
        parentIndex: parentIndex === null ? 0 : parentIndex, // Main frame is parent if null
        depth: depth + 1,
        element: frame,
        contentWindow,
        contentDocument,
      };

      frames.push(frameInfo);
      const thisFrameIndex = currentIndex;
      currentIndex++;

      // Recurse into nested frames if same-origin
      if (isSameOrigin && contentDocument) {
        currentIndex = this.enumerateFramesRecursive(
          contentDocument,
          frames,
          currentIndex,
          thisFrameIndex,
          depth + 1
        );
      }
    }

    return currentIndex;
  }

  // ===== Frame Selection =====

  /**
   * Select a frame by index
   * @param index Frame index (0 = main document)
   */
  public selectFrameByIndex(index: number): FrameOperationResult {
    const frames = this.enumerateFrames();

    // Validate index
    if (index < 0) {
      return {
        success: false,
        errorMessage: `Invalid frame index: ${index}. Must be >= 0.`,
      };
    }

    // Find frame with matching index
    const frame = frames.find(f => f.index === index);

    if (!frame) {
      return {
        success: false,
        errorMessage: `Frame ${index} not found. Available frames: 0-${frames.length - 1}`,
      };
    }

    // Check if frame is accessible
    if (!frame.isSameOrigin && !frame.isMain) {
      return {
        success: false,
        errorMessage: `Frame ${index} is cross-origin and cannot be accessed directly.`,
      };
    }

    // Update current frame
    this.currentFrameIndex = index;

    return {
      success: true,
      frameInfo: frame,
    };
  }

  /**
   * Select a frame by name attribute
   * @param name Frame name to match
   */
  public selectFrameByName(name: string): FrameOperationResult {
    const frames = this.enumerateFrames();

    // Find frame with matching name (case-insensitive)
    const lowerName = name.toLowerCase();
    const frame = frames.find(f =>
      f.name && f.name.toLowerCase() === lowerName
    );

    if (!frame) {
      const availableNames = frames
        .filter(f => f.name)
        .map(f => f.name)
        .join(', ');
      return {
        success: false,
        errorMessage: `Frame with name "${name}" not found. Available names: ${availableNames || 'none'}`,
      };
    }

    // Check if frame is accessible
    if (!frame.isSameOrigin && !frame.isMain) {
      return {
        success: false,
        errorMessage: `Frame "${name}" is cross-origin and cannot be accessed directly.`,
      };
    }

    // Update current frame
    this.currentFrameIndex = frame.index;

    return {
      success: true,
      frameInfo: frame,
    };
  }

  /**
   * Select a frame by id attribute
   * @param id Frame id to match
   */
  public selectFrameById(id: string): FrameOperationResult {
    const frames = this.enumerateFrames();

    // Find frame with matching id
    const frame = frames.find(f => f.id === id);

    if (!frame) {
      const availableIds = frames
        .filter(f => f.id)
        .map(f => f.id)
        .join(', ');
      return {
        success: false,
        errorMessage: `Frame with id "${id}" not found. Available ids: ${availableIds || 'none'}`,
      };
    }

    // Check if frame is accessible
    if (!frame.isSameOrigin && !frame.isMain) {
      return {
        success: false,
        errorMessage: `Frame "${id}" is cross-origin and cannot be accessed directly.`,
      };
    }

    // Update current frame
    this.currentFrameIndex = frame.index;

    return {
      success: true,
      frameInfo: frame,
    };
  }

  /**
   * Select a frame using a selector object
   */
  public selectFrame(selector: FrameSelector): FrameOperationResult {
    if (selector.index !== undefined) {
      return this.selectFrameByIndex(selector.index);
    }
    if (selector.name !== undefined) {
      return this.selectFrameByName(selector.name);
    }
    if (selector.id !== undefined) {
      return this.selectFrameById(selector.id);
    }

    return {
      success: false,
      errorMessage: 'Frame selector must specify index, name, or id',
    };
  }

  // ===== Current Frame Access =====

  /**
   * Get the currently selected frame index
   */
  public getCurrentFrameIndex(): number {
    return this.currentFrameIndex;
  }

  /**
   * Get info about the currently selected frame
   */
  public getCurrentFrame(): FrameInfo | null {
    const frames = this.enumerateFrames();
    return frames.find(f => f.index === this.currentFrameIndex) || null;
  }

  /**
   * Get the document of the currently selected frame
   * Returns null if frame is not accessible
   */
  public getCurrentDocument(): Document | null {
    const frame = this.getCurrentFrame();
    if (!frame) {
      return null;
    }

    if (frame.isMain) {
      return document;
    }

    return frame.contentDocument;
  }

  /**
   * Get the window of the currently selected frame
   * Returns null if frame is not accessible
   */
  public getCurrentWindow(): Window | null {
    const frame = this.getCurrentFrame();
    if (!frame) {
      return null;
    }

    if (frame.isMain) {
      return window;
    }

    return frame.contentWindow;
  }

  /**
   * Reset to main frame (index 0)
   */
  public resetToMainFrame(): void {
    this.currentFrameIndex = 0;
  }

  // ===== Frame List =====

  /**
   * Get list of all frames with their info
   */
  public getFrameList(): FrameOperationResult {
    const frames = this.enumerateFrames(true);

    return {
      success: true,
      frameList: frames,
    };
  }

  /**
   * Get the number of frames on the page (including main frame)
   */
  public getFrameCount(): number {
    return this.enumerateFrames().length;
  }

  // ===== Command Execution in Frame Context =====

  /**
   * Execute a function in the context of the currently selected frame
   * @param fn Function to execute with the frame's document
   * @returns Result of the function or error
   */
  public executeInCurrentFrame<T>(
    fn: (doc: Document, win: Window) => T
  ): { success: boolean; result?: T; error?: string } {
    const doc = this.getCurrentDocument();
    const win = this.getCurrentWindow();

    if (!doc || !win) {
      return {
        success: false,
        error: `Cannot access frame ${this.currentFrameIndex}. It may be cross-origin.`,
      };
    }

    try {
      const result = fn(doc, win);
      return { success: true, result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Error executing in frame ${this.currentFrameIndex}: ${errorMessage}`,
      };
    }
  }

  /**
   * Find an element in the currently selected frame
   * @param selector CSS selector or XPath
   */
  public findElementInCurrentFrame(selector: string): Element | null {
    const doc = this.getCurrentDocument();
    if (!doc) {
      return null;
    }

    // Check if it's an XPath selector
    if (selector.startsWith('/') || selector.startsWith('(')) {
      try {
        const result = doc.evaluate(
          selector,
          doc,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        return result.singleNodeValue as Element | null;
      } catch {
        return null;
      }
    }

    // Use CSS selector
    try {
      return doc.querySelector(selector);
    } catch {
      return null;
    }
  }

  /**
   * Find all elements matching a selector in the currently selected frame
   * @param selector CSS selector or XPath
   */
  public findElementsInCurrentFrame(selector: string): Element[] {
    const doc = this.getCurrentDocument();
    if (!doc) {
      return [];
    }

    // Check if it's an XPath selector
    if (selector.startsWith('/') || selector.startsWith('(')) {
      try {
        const result = doc.evaluate(
          selector,
          doc,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null
        );
        const elements: Element[] = [];
        for (let i = 0; i < result.snapshotLength; i++) {
          const node = result.snapshotItem(i);
          if (node instanceof Element) {
            elements.push(node);
          }
        }
        return elements;
      } catch {
        return [];
      }
    }

    // Use CSS selector
    try {
      return Array.from(doc.querySelectorAll(selector));
    } catch {
      return [];
    }
  }

  // ===== Cache Management =====

  /**
   * Clear the frame cache
   */
  public clearCache(): void {
    this.frameCache = [];
    this.lastEnumerationTime = 0;
  }

  /**
   * Set cache expiration time
   */
  public setCacheExpiration(ms: number): void {
    this.cacheExpirationMs = ms;
  }
}

// ===== Singleton Instance =====

let frameHandlerInstance: FrameHandler | null = null;

/**
 * Get the singleton FrameHandler instance
 */
export function getFrameHandler(): FrameHandler {
  if (!frameHandlerInstance) {
    frameHandlerInstance = new FrameHandler();
  }
  return frameHandlerInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetFrameHandler(): void {
  frameHandlerInstance = null;
}

// ===== Message Handler Integration =====

/**
 * Message types for frame operations
 */
export type FrameMessageType =
  | 'FRAME_SELECT'
  | 'FRAME_LIST'
  | 'FRAME_CURRENT'
  | 'FRAME_RESET';

/**
 * Frame select message payload
 */
export interface FrameSelectPayload {
  frameIndex?: number;
  frameName?: string;
  frameId?: string;
}

/**
 * Response from frame operations
 */
export interface FrameResponse {
  success: boolean;
  error?: string;
  frameIndex?: number;
  frameInfo?: FrameInfo;
  frameList?: FrameInfo[];
}

/**
 * Handle incoming frame operation messages
 */
export function handleFrameMessage(
  type: FrameMessageType,
  payload?: FrameSelectPayload
): FrameResponse {
  const handler = getFrameHandler();

  switch (type) {
    case 'FRAME_SELECT': {
      if (!payload) {
        return { success: false, error: 'Missing frame selection payload' };
      }

      let result: FrameOperationResult;

      if (payload.frameIndex !== undefined) {
        result = handler.selectFrameByIndex(payload.frameIndex);
      } else if (payload.frameName !== undefined) {
        result = handler.selectFrameByName(payload.frameName);
      } else if (payload.frameId !== undefined) {
        result = handler.selectFrameById(payload.frameId);
      } else {
        return { success: false, error: 'Must specify frameIndex, frameName, or frameId' };
      }

      return {
        success: result.success,
        error: result.errorMessage,
        frameIndex: handler.getCurrentFrameIndex(),
        frameInfo: result.frameInfo,
      };
    }

    case 'FRAME_LIST': {
      const result = handler.getFrameList();
      // Convert frameList to a serializable format (remove element references)
      const serializableList = result.frameList?.map(f => ({
        ...f,
        element: null,
        contentWindow: null,
        contentDocument: null,
      }));

      return {
        success: result.success,
        frameList: serializableList,
      };
    }

    case 'FRAME_CURRENT': {
      const current = handler.getCurrentFrame();
      if (!current) {
        return { success: false, error: 'No frame selected' };
      }

      // Return serializable frame info
      return {
        success: true,
        frameIndex: current.index,
        frameInfo: {
          ...current,
          element: null,
          contentWindow: null,
          contentDocument: null,
        },
      };
    }

    case 'FRAME_RESET': {
      handler.resetToMainFrame();
      return {
        success: true,
        frameIndex: 0,
      };
    }

    default:
      return { success: false, error: `Unknown frame message type: ${type}` };
  }
}

// ===== Chrome Message Listener =====

/**
 * Set up message listener for frame operations
 */
export function setupFrameMessageListener(): void {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) {
    console.warn('[iMacros] Chrome runtime not available, frame handler not initialized');
    return;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // Check if this is a frame operation message
    if (message.type === 'selectFrame' ||
        message.type === 'FRAME_SELECT' ||
        message.type === 'FRAME_LIST' ||
        message.type === 'FRAME_CURRENT' ||
        message.type === 'FRAME_RESET') {

      // Normalize message type
      let messageType: FrameMessageType;
      let payload: FrameSelectPayload | undefined;

      if (message.type === 'selectFrame') {
        // Handle legacy selectFrame message format from navigation commands
        messageType = 'FRAME_SELECT';
        payload = {
          frameIndex: message.frameIndex,
          frameName: message.frameName,
        };
      } else {
        messageType = message.type as FrameMessageType;
        payload = message.payload;
      }

      const response = handleFrameMessage(messageType, payload);
      sendResponse(response);
      return true;
    }

    // Not a frame message, let other listeners handle it
    return false;
  });

  console.log('[iMacros] Frame handler message listener initialized');
}

/**
 * Initialize the frame handler
 * Call this from the content script entry point
 */
export function initializeFrameHandler(): void {
  // Create the singleton instance
  getFrameHandler();

  // Set up message listener
  setupFrameMessageListener();

  console.log('[iMacros] Frame handler initialized');
}

// ===== Default Export =====

export default {
  // Core class
  FrameHandler,

  // Singleton access
  getFrameHandler,
  resetFrameHandler,

  // Message handling
  handleFrameMessage,
  setupFrameMessageListener,
  initializeFrameHandler,
};
