/**
 * Image Recognition Command Handlers for iMacros
 *
 * Implements handlers for image-based commands:
 * - IMAGESEARCH: Search for a template image on the webpage, stores coordinates
 * - IMAGECLICK: Search for an image and click on it
 *
 * These commands require the native host's image-search service and
 * winclick-service for actual screen capture and mouse operations.
 *
 * Matches iMacros 8.9.7 behavior:
 * - Searches webpage content area (not full screen) by default
 * - Retries with !TIMEOUT_TAG until found or timeout (-930)
 * - Highlights found image with green overlay
 * - Uses proper error codes: -902, -903, -927, -930
 */

import {
  CommandHandler,
  CommandContext,
  CommandResult,
  IMACROS_ERROR_CODES,
} from '../executor';
import { executeWithTimeoutRetry } from './flow';
import type { CommandType } from '../parser';

// ===== Image Search Interface =====

/**
 * Result of an image search operation
 */
export interface ImageSearchResult {
  /** Whether a match was found */
  found: boolean;
  /** X coordinate of the match (center of matched region) */
  x: number;
  /** Y coordinate of the match (center of matched region) */
  y: number;
  /** Confidence score (0-1) of the match */
  confidence: number;
  /** Width of the matched template */
  width: number;
  /** Height of the matched template */
  height: number;
  /** Top-left corner of the match */
  topLeft: { x: number; y: number };
  /** Bottom-right corner of the match */
  bottomRight: { x: number; y: number };
}

/**
 * Image capture source for search
 */
export type ImageSearchSource = 'webpage' | 'screen';

/**
 * Options for image search
 */
export interface ImageSearchOptions {
  /** Minimum confidence threshold (0-1). Default: 0.8 */
  confidenceThreshold?: number;
  /** Screen region to search within. If not specified, searches entire source */
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Screen index to capture (for multi-monitor setups). Default: 0 */
  screen?: number;
  /** Tolerance for color matching (0-255). Default: 25 */
  colorTolerance?: number;
  /** Whether to convert images to grayscale before matching. Default: false */
  grayscale?: boolean;
  /** Capture source: 'webpage' (content area only) or 'screen' (full screen). Default: 'webpage' */
  source?: ImageSearchSource;
}

/**
 * Interface for image search service
 * This must be provided by the native host
 */
export interface ImageSearchService {
  /**
   * Search for a template image on the screen
   * @param templatePath - Path to the template image file
   * @param options - Search options
   * @returns Search result with match coordinates and confidence
   */
  search(templatePath: string, options?: ImageSearchOptions): Promise<ImageSearchResult>;

  /**
   * Search for multiple occurrences of a template image
   * @param templatePath - Path to the template image file
   * @param options - Search options
   * @param maxMatches - Maximum number of matches to return
   * @returns Array of search results
   */
  searchAll?(templatePath: string, options?: ImageSearchOptions, maxMatches?: number): Promise<ImageSearchResult[]>;

  /**
   * Wait for an image to appear on screen
   * @param templatePath - Path to the template image file
   * @param options - Search options
   * @param timeout - Maximum time to wait in milliseconds
   * @param interval - Time between searches in milliseconds
   * @returns Search result if found, or result with found=false if timeout
   */
  waitFor?(templatePath: string, options?: ImageSearchOptions, timeout?: number, interval?: number): Promise<ImageSearchResult>;
}

// ===== Mouse Click Interface =====

/**
 * Result of mouse operations
 */
export interface MouseResult {
  success: boolean;
  error?: string;
  position?: { x: number; y: number };
}

/**
 * Interface for mouse click service
 * This must be provided by the native host (winclick-service)
 */
export interface MouseClickService {
  /**
   * Click at absolute screen coordinates
   */
  click(options: {
    x: number;
    y: number;
    button?: 'left' | 'right' | 'middle';
    clickCount?: number;
  }): Promise<MouseResult>;
}

// ===== Highlight Callback Interface =====

/**
 * Callback for visual highlight feedback when an image is found.
 * The extension sets this to draw a green overlay on the matched region.
 */
export type ImageHighlightCallback = (region: {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}) => void;

// ===== Service Registry =====

/** Registered image search service */
let imageSearchService: ImageSearchService | null = null;

/** Registered mouse click service */
let mouseClickService: MouseClickService | null = null;

/** Registered highlight callback */
let imageHighlightCallback: ImageHighlightCallback | null = null;

/**
 * Set the image search service
 * Must be called by the native host to enable IMAGESEARCH/IMAGECLICK
 */
export function setImageSearchService(service: ImageSearchService): void {
  imageSearchService = service;
}

/**
 * Get the current image search service
 */
export function getImageSearchService(): ImageSearchService | null {
  return imageSearchService;
}

/**
 * Set the mouse click service
 * Must be called by the native host to enable IMAGECLICK
 */
export function setMouseClickService(service: MouseClickService): void {
  mouseClickService = service;
}

/**
 * Get the current mouse click service
 */
export function getMouseClickService(): MouseClickService | null {
  return mouseClickService;
}

/**
 * Set the image highlight callback for visual feedback
 */
export function setImageHighlightCallback(callback: ImageHighlightCallback): void {
  imageHighlightCallback = callback;
}

/**
 * Get the current image highlight callback
 */
export function getImageHighlightCallback(): ImageHighlightCallback | null {
  return imageHighlightCallback;
}

// ===== Helper Functions =====

/**
 * Resolve image path relative to datasource folder if not absolute
 */
function resolveImagePath(ctx: CommandContext, imagePath: string): string {
  // If it looks like an absolute path, return as-is
  if (imagePath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(imagePath)) {
    return imagePath;
  }

  // Try to get the datasource folder from variables
  const datasourceFolder = ctx.state.getVariable('!FOLDER_DATASOURCE');
  if (datasourceFolder && typeof datasourceFolder === 'string') {
    // This is a simplistic path join - the native host will do proper resolution
    return `${datasourceFolder}/${imagePath}`;
  }

  // Return as-is, let the native host handle resolution
  return imagePath;
}

/**
 * Trigger visual highlight overlay on found image region
 */
function highlightFoundImage(result: ImageSearchResult, label: string): void {
  if (!imageHighlightCallback || !result.found) return;

  imageHighlightCallback({
    x: result.topLeft.x,
    y: result.topLeft.y,
    width: result.width,
    height: result.height,
    label,
  });
}

/**
 * Perform a single image search operation (used by retry loop)
 */
async function performImageSearch(
  imagePath: string,
  confidenceThreshold: number,
  pos: number,
  source: ImageSearchSource,
): Promise<ImageSearchResult> {
  const options: ImageSearchOptions = { confidenceThreshold, source };

  if (pos === 1) {
    return await imageSearchService!.search(imagePath, options);
  } else if (imageSearchService!.searchAll) {
    const allResults = await imageSearchService!.searchAll(imagePath, options, pos);
    if (allResults.length >= pos) {
      return allResults[pos - 1];
    }
    return {
      found: false, x: 0, y: 0, confidence: 0,
      width: 0, height: 0,
      topLeft: { x: 0, y: 0 }, bottomRight: { x: 0, y: 0 },
    };
  } else {
    // searchAll not available but pos > 1 - fall back to first match
    return await imageSearchService!.search(imagePath, options);
  }
}

/**
 * Check if an error indicates the image file itself is missing/invalid
 * (as opposed to the image not being found on screen)
 */
function isImageFileError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const lowerMsg = msg.toLowerCase();
  return lowerMsg.includes('file not found') ||
    lowerMsg.includes('no such file') ||
    lowerMsg.includes('enoent') ||
    lowerMsg.includes('cannot open') ||
    lowerMsg.includes('cannot read') ||
    lowerMsg.includes('invalid image') ||
    lowerMsg.includes('corrupt');
}

// ===== Command Handlers =====

/**
 * IMAGESEARCH command handler
 *
 * Syntax: IMAGESEARCH POS=<pos> IMAGE=<path> CONFIDENCE=<percent>
 *
 * Searches the webpage content area for a template image and stores the coordinates.
 * Retries with !TIMEOUT_TAG (like TAG command) until found or timeout.
 *
 * Parameters:
 * - POS: Position index (1-based, for finding nth occurrence)
 * - IMAGE: Path to the template image file
 * - CONFIDENCE: Minimum confidence threshold (0-100 percent)
 *
 * Results are stored in:
 * - !IMAGESEARCH_X: X coordinate of match center
 * - !IMAGESEARCH_Y: Y coordinate of match center
 * - !IMAGESEARCH: Boolean, "true" if found, "false" if not
 * - !IMAGESEARCH_CONFIDENCE: Actual confidence score (0-100)
 *
 * Error codes:
 * - -902: Image search service not configured
 * - -903: Image file not found or cannot be loaded
 * - -927: Image not found on screen (after retries)
 * - -930: Timeout waiting for image to appear
 *
 * Example:
 * - IMAGESEARCH POS=1 IMAGE=button.png CONFIDENCE=80
 */
export const imageSearchHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  // Check if service is available (-902)
  if (!imageSearchService) {
    ctx.log('warn', 'Image search service not available - requires native host');
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.IMAGE_SEARCH_NOT_CONFIGURED,
      errorMessage: 'IMAGESEARCH requires the native host image-search service. Service not configured.',
    };
  }

  // Get required parameters
  const posParam = ctx.getParam('POS');
  const imageParam = ctx.getParam('IMAGE');
  const confidenceParam = ctx.getParam('CONFIDENCE');

  if (!posParam || !imageParam || !confidenceParam) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'IMAGESEARCH requires POS, IMAGE, and CONFIDENCE parameters',
    };
  }

  // Parse parameters
  const pos = parseInt(ctx.expand(posParam), 10);
  const imagePath = resolveImagePath(ctx, ctx.expand(imageParam));
  const confidence = parseInt(ctx.expand(confidenceParam), 10);

  if (isNaN(pos) || pos < 1) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
      errorMessage: `Invalid POS value: ${posParam}. Must be a positive integer.`,
    };
  }

  if (isNaN(confidence) || confidence < 0 || confidence > 100) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
      errorMessage: `Invalid CONFIDENCE value: ${confidenceParam}. Must be 0-100.`,
    };
  }

  ctx.log('info', `Searching for image: ${imagePath} (confidence: ${confidence}%, pos: ${pos})`);

  // Convert confidence from percentage (0-100) to decimal (0-1)
  const confidenceThreshold = confidence / 100;

  // Search webpage content area by default (matches iMacros 8.9.7)
  const source: ImageSearchSource = 'webpage';

  // Use retry loop with !TIMEOUT_TAG (same as TAG command)
  return executeWithTimeoutRetry(
    ctx,
    async (): Promise<CommandResult> => {
      try {
        const result = await performImageSearch(imagePath, confidenceThreshold, pos, source);

        // Store results in variables
        ctx.state.setVariable('!IMAGESEARCH', result.found ? 'true' : 'false');
        ctx.state.setVariable('!IMAGESEARCH_X', result.x);
        ctx.state.setVariable('!IMAGESEARCH_Y', result.y);
        ctx.state.setVariable('!IMAGESEARCH_CONFIDENCE', Math.round(result.confidence * 100));

        if (result.found) {
          ctx.log('info', `Image found at (${result.x}, ${result.y}) with ${Math.round(result.confidence * 100)}% confidence`);

          // Visual highlight feedback (green overlay on found image)
          highlightFoundImage(result, 'IMAGESEARCH');

          return {
            success: true,
            errorCode: IMACROS_ERROR_CODES.OK,
            output: `${result.x},${result.y}`,
          };
        } else {
          ctx.log('debug', `Image not found with required confidence (${confidence}%)`);
          return {
            success: false,
            errorCode: IMACROS_ERROR_CODES.IMAGE_NOT_FOUND,
            errorMessage: `Image not found: ${imagePath}`,
          };
        }
      } catch (error) {
        // Check if this is a file-not-found error (-903, non-retryable)
        if (isImageFileError(error)) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          ctx.log('error', `Image file error: ${errorMessage}`);

          ctx.state.setVariable('!IMAGESEARCH', 'false');
          ctx.state.setVariable('!IMAGESEARCH_X', 0);
          ctx.state.setVariable('!IMAGESEARCH_Y', 0);
          ctx.state.setVariable('!IMAGESEARCH_CONFIDENCE', 0);

          return {
            success: false,
            errorCode: IMACROS_ERROR_CODES.IMAGE_FILE_NOT_FOUND,
            errorMessage: `Image file not found or cannot be loaded: ${imagePath}`,
          };
        }

        // Other errors - propagate as retryable
        const errorMessage = error instanceof Error ? error.message : String(error);
        ctx.log('error', `Image search failed: ${errorMessage}`);

        ctx.state.setVariable('!IMAGESEARCH', 'false');
        ctx.state.setVariable('!IMAGESEARCH_X', 0);
        ctx.state.setVariable('!IMAGESEARCH_Y', 0);
        ctx.state.setVariable('!IMAGESEARCH_CONFIDENCE', 0);

        return {
          success: false,
          errorCode: IMACROS_ERROR_CODES.IMAGE_NOT_FOUND,
          errorMessage: `Image search failed: ${errorMessage}`,
        };
      }
    },
    // Retry on IMAGE_NOT_FOUND (-927), not on file errors (-903) or config errors (-902)
    (r) => r.errorCode === IMACROS_ERROR_CODES.IMAGE_NOT_FOUND,
  );
};

/**
 * IMAGECLICK command handler
 *
 * Syntax: IMAGECLICK IMAGE=<path> [CONFIDENCE=<percent>] [BUTTON=<left|right|middle>]
 *
 * Searches for an image on the webpage and clicks on its center.
 * Retries with !TIMEOUT_TAG until found or timeout.
 *
 * Parameters:
 * - IMAGE: Path to the template image file
 * - CONFIDENCE: Minimum confidence threshold (0-100 percent, default: 80)
 * - BUTTON: Mouse button to use (left, right, middle; default: left)
 *
 * Results are stored in:
 * - !IMAGECLICK_X: X coordinate where clicked
 * - !IMAGECLICK_Y: Y coordinate where clicked
 * - !IMAGECLICK: Boolean, "true" if found and clicked, "false" if not
 *
 * Error codes:
 * - -902: Image search service not configured
 * - -903: Image file not found or cannot be loaded
 * - -927: Image not found on screen (after retries)
 * - -930: Timeout waiting for image to appear
 *
 * Example:
 * - IMAGECLICK IMAGE=submit_button.png CONFIDENCE=90
 * - IMAGECLICK IMAGE=menu.png BUTTON=right
 */
export const imageClickHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  // Check if services are available (-902)
  if (!imageSearchService) {
    ctx.log('warn', 'Image search service not available - requires native host');
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.IMAGE_SEARCH_NOT_CONFIGURED,
      errorMessage: 'IMAGECLICK requires the native host image-search service. Service not configured.',
    };
  }

  if (!mouseClickService) {
    ctx.log('warn', 'Mouse click service not available - requires native host');
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.IMAGE_SEARCH_NOT_CONFIGURED,
      errorMessage: 'IMAGECLICK requires the native host winclick-service. Service not configured.',
    };
  }

  // Get parameters
  const imageParam = ctx.getParam('IMAGE');
  const confidenceParam = ctx.getParam('CONFIDENCE');
  const buttonParam = ctx.getParam('BUTTON');

  if (!imageParam) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'IMAGECLICK requires IMAGE parameter',
    };
  }

  // Parse parameters
  const imagePath = resolveImagePath(ctx, ctx.expand(imageParam));
  const confidence = confidenceParam ? parseInt(ctx.expand(confidenceParam), 10) : 80;
  const buttonStr = buttonParam ? ctx.expand(buttonParam).toLowerCase() : 'left';

  if (isNaN(confidence) || confidence < 0 || confidence > 100) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
      errorMessage: `Invalid CONFIDENCE value: ${confidenceParam}. Must be 0-100.`,
    };
  }

  // Validate button parameter
  let button: 'left' | 'right' | 'middle' = 'left';
  if (buttonStr === 'right') {
    button = 'right';
  } else if (buttonStr === 'middle' || buttonStr === 'center') {
    button = 'middle';
  } else if (buttonStr !== 'left') {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
      errorMessage: `Invalid BUTTON value: ${buttonParam}. Must be left, right, or middle.`,
    };
  }

  ctx.log('info', `Image click: ${imagePath} (confidence: ${confidence}%, button: ${button})`);

  // Convert confidence from percentage (0-100) to decimal (0-1)
  const confidenceThreshold = confidence / 100;

  // Search webpage content area by default (matches iMacros 8.9.7)
  const source: ImageSearchSource = 'webpage';

  // Use retry loop with !TIMEOUT_TAG (same as TAG command)
  return executeWithTimeoutRetry(
    ctx,
    async (): Promise<CommandResult> => {
      try {
        const searchResult = await performImageSearch(imagePath, confidenceThreshold, 1, source);

        // Store search results
        ctx.state.setVariable('!IMAGECLICK', searchResult.found ? 'true' : 'false');
        ctx.state.setVariable('!IMAGECLICK_X', searchResult.x);
        ctx.state.setVariable('!IMAGECLICK_Y', searchResult.y);

        if (!searchResult.found) {
          ctx.log('debug', `Image not found with required confidence (${confidence}%)`);
          return {
            success: false,
            errorCode: IMACROS_ERROR_CODES.IMAGE_NOT_FOUND,
            errorMessage: `Image not found: ${imagePath}`,
          };
        }

        // Visual highlight feedback (green overlay on found image)
        highlightFoundImage(searchResult, 'IMAGECLICK');

        // Image found, now click on it
        ctx.log('info', `Image found at (${searchResult.x}, ${searchResult.y}), clicking...`);

        const clickResult = await mouseClickService!.click({
          x: searchResult.x,
          y: searchResult.y,
          button,
        });

        if (!clickResult.success) {
          ctx.log('error', `Click failed: ${clickResult.error}`);
          return {
            success: false,
            errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
            errorMessage: `Image found but click failed: ${clickResult.error}`,
          };
        }

        ctx.log('info', `Clicked at (${searchResult.x}, ${searchResult.y})`);
        return {
          success: true,
          errorCode: IMACROS_ERROR_CODES.OK,
          output: `${searchResult.x},${searchResult.y}`,
        };
      } catch (error) {
        // Check if this is a file-not-found error (-903, non-retryable)
        if (isImageFileError(error)) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          ctx.log('error', `Image file error: ${errorMessage}`);

          ctx.state.setVariable('!IMAGECLICK', 'false');
          ctx.state.setVariable('!IMAGECLICK_X', 0);
          ctx.state.setVariable('!IMAGECLICK_Y', 0);

          return {
            success: false,
            errorCode: IMACROS_ERROR_CODES.IMAGE_FILE_NOT_FOUND,
            errorMessage: `Image file not found or cannot be loaded: ${imagePath}`,
          };
        }

        // Other errors - propagate
        const errorMessage = error instanceof Error ? error.message : String(error);
        ctx.log('error', `Image click failed: ${errorMessage}`);

        ctx.state.setVariable('!IMAGECLICK', 'false');
        ctx.state.setVariable('!IMAGECLICK_X', 0);
        ctx.state.setVariable('!IMAGECLICK_Y', 0);

        return {
          success: false,
          errorCode: IMACROS_ERROR_CODES.IMAGE_NOT_FOUND,
          errorMessage: `Image click failed: ${errorMessage}`,
        };
      }
    },
    // Retry on IMAGE_NOT_FOUND (-927), not on file errors (-903), config errors (-902), or click errors
    (r) => r.errorCode === IMACROS_ERROR_CODES.IMAGE_NOT_FOUND,
  );
};

// ===== Handler Registration =====

/**
 * All image recognition command handlers
 */
export const imageRecognitionHandlers: Partial<Record<CommandType, CommandHandler>> = {
  IMAGESEARCH: imageSearchHandler,
  IMAGECLICK: imageClickHandler,
};

/**
 * Register image recognition handlers with an executor
 */
export function registerImageRecognitionHandlers(
  registerFn: (type: CommandType, handler: CommandHandler) => void
): void {
  for (const [type, handler] of Object.entries(imageRecognitionHandlers)) {
    if (handler) {
      registerFn(type as CommandType, handler);
    }
  }
}
