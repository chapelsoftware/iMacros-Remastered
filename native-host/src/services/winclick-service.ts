/**
 * WinClick Service for iMacros Native Host
 * OS-level mouse click using nut.js for clicks at absolute screen coordinates
 * Works regardless of browser focus
 */
import { mouse, Point, Button } from '@nut-tree-fork/nut-js';

/**
 * Mouse button types
 */
export type MouseButton = 'left' | 'right' | 'middle';

/**
 * Options for mouse click operations
 */
export interface ClickOptions {
  /** X coordinate (absolute screen position) */
  x: number;
  /** Y coordinate (absolute screen position) */
  y: number;
  /** Mouse button to click */
  button?: MouseButton;
  /** Number of clicks (1 = single, 2 = double) */
  clickCount?: number;
  /** Delay between clicks in milliseconds (for double-click) */
  clickDelay?: number;
}

/**
 * Options for mouse movement
 */
export interface MoveOptions {
  /** X coordinate (absolute screen position) */
  x: number;
  /** Y coordinate (absolute screen position) */
  y: number;
}

/**
 * Options for mouse down/up operations (for drag)
 */
export interface MouseButtonOptions {
  /** Mouse button */
  button?: MouseButton;
}

/**
 * Options for drag operations
 */
export interface DragOptions {
  /** Start X coordinate */
  startX: number;
  /** Start Y coordinate */
  startY: number;
  /** End X coordinate */
  endX: number;
  /** End Y coordinate */
  endY: number;
  /** Mouse button to use for drag */
  button?: MouseButton;
}

/**
 * Result of mouse operations
 */
export interface MouseResult {
  success: boolean;
  error?: string;
  position?: { x: number; y: number };
}

/**
 * Convert our button type to nut.js Button
 */
function toNutButton(button: MouseButton): Button {
  switch (button) {
    case 'left':
      return Button.LEFT;
    case 'right':
      return Button.RIGHT;
    case 'middle':
      return Button.MIDDLE;
    default:
      return Button.LEFT;
  }
}

/**
 * Create a Point from coordinates
 */
function toPoint(x: number, y: number): Point {
  return new Point(x, y);
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Move mouse to absolute screen coordinates
 */
export async function moveTo(options: MoveOptions): Promise<MouseResult> {
  try {
    const { x, y } = options;
    const point = toPoint(x, y);
    await mouse.setPosition(point);
    return {
      success: true,
      position: { x, y },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Click at absolute screen coordinates
 */
export async function click(options: ClickOptions): Promise<MouseResult> {
  try {
    const {
      x,
      y,
      button = 'left',
      clickCount = 1,
      clickDelay = 50,
    } = options;

    const point = toPoint(x, y);
    const nutButton = toNutButton(button);

    // Move to position
    await mouse.setPosition(point);

    // Perform clicks
    for (let i = 0; i < clickCount; i++) {
      await mouse.click(nutButton);
      if (i < clickCount - 1) {
        await sleep(clickDelay);
      }
    }

    return {
      success: true,
      position: { x, y },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Double-click at absolute screen coordinates
 */
export async function doubleClick(options: Omit<ClickOptions, 'clickCount'>): Promise<MouseResult> {
  return click({ ...options, clickCount: 2 });
}

/**
 * Right-click at absolute screen coordinates
 */
export async function rightClick(options: Omit<ClickOptions, 'button'>): Promise<MouseResult> {
  return click({ ...options, button: 'right' });
}

/**
 * Middle-click at absolute screen coordinates
 */
export async function middleClick(options: Omit<ClickOptions, 'button'>): Promise<MouseResult> {
  return click({ ...options, button: 'middle' });
}

/**
 * Press and hold mouse button (for drag operations)
 */
export async function mouseDown(options: MouseButtonOptions = {}): Promise<MouseResult> {
  try {
    const { button = 'left' } = options;
    const nutButton = toNutButton(button);
    await mouse.pressButton(nutButton);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Release mouse button (for drag operations)
 */
export async function mouseUp(options: MouseButtonOptions = {}): Promise<MouseResult> {
  try {
    const { button = 'left' } = options;
    const nutButton = toNutButton(button);
    await mouse.releaseButton(nutButton);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Perform a drag operation from one point to another
 */
export async function drag(options: DragOptions): Promise<MouseResult> {
  try {
    const { startX, startY, endX, endY, button = 'left' } = options;

    // Move to start position
    await mouse.setPosition(toPoint(startX, startY));

    // Press button
    const nutButton = toNutButton(button);
    await mouse.pressButton(nutButton);

    // Move to end position
    await mouse.setPosition(toPoint(endX, endY));

    // Release button
    await mouse.releaseButton(nutButton);

    return {
      success: true,
      position: { x: endX, y: endY },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get current mouse position
 */
export async function getPosition(): Promise<MouseResult> {
  try {
    const position = await mouse.getPosition();
    return {
      success: true,
      position: { x: position.x, y: position.y },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * WinClickService class providing all mouse operations
 */
export class WinClickService {
  // Static methods for convenience
  static moveTo = moveTo;
  static click = click;
  static doubleClick = doubleClick;
  static rightClick = rightClick;
  static middleClick = middleClick;
  static mouseDown = mouseDown;
  static mouseUp = mouseUp;
  static drag = drag;
  static getPosition = getPosition;
}

export default WinClickService;
