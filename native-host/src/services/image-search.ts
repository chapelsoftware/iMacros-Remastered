/**
 * Image Search Service for iMacros Native Host
 *
 * Provides template matching functionality to find images on screen.
 * Uses sharp for image processing and screenshot-desktop for screen capture.
 */
import sharp from 'sharp';
import * as path from 'path';
import * as fs from 'fs';

// Dynamic import for screenshot-desktop since it may not have types
let screenshot: (options?: { screen?: number; format?: string }) => Promise<Buffer>;

/**
 * Initialize the screenshot module
 */
async function initScreenshot(): Promise<void> {
  if (!screenshot) {
    const screenshotModule = await import('screenshot-desktop');
    screenshot = screenshotModule.default || screenshotModule;
  }
}

/**
 * Coordinates representing a point on screen
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * A rectangular region on screen
 */
export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

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
  topLeft: Point;
  /** Bottom-right corner of the match */
  bottomRight: Point;
}

/**
 * Options for image search
 */
export interface ImageSearchOptions {
  /** Minimum confidence threshold (0-1). Default: 0.8 */
  confidenceThreshold?: number;
  /** Screen region to search within. If not specified, searches entire screen */
  region?: Region;
  /** Screen index to capture (for multi-monitor setups). Default: 0 */
  screen?: number;
  /** Tolerance for color matching (0-255). Default: 25 */
  colorTolerance?: number;
  /** Whether to convert images to grayscale before matching. Default: false */
  grayscale?: boolean;
}

/**
 * Raw pixel data for an image
 */
interface RawImageData {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
}

/**
 * Load an image and get its raw pixel data
 */
async function loadImage(imagePath: string): Promise<RawImageData> {
  const absolutePath = path.isAbsolute(imagePath)
    ? imagePath
    : path.resolve(process.cwd(), imagePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Template image not found: ${absolutePath}`);
  }

  const image = sharp(absolutePath);
  const metadata = await image.metadata();

  const { data, info } = await image
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
}

/**
 * Load an image from a buffer and get its raw pixel data
 */
async function loadImageFromBuffer(buffer: Buffer): Promise<RawImageData> {
  const image = sharp(buffer);

  const { data, info } = await image
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
}

/**
 * Capture the screen or a region of it
 */
async function captureScreen(options: ImageSearchOptions = {}): Promise<RawImageData> {
  await initScreenshot();

  const screenshotBuffer = await screenshot({
    screen: options.screen ?? 0,
    format: 'png',
  });

  let image = sharp(screenshotBuffer);

  // If a region is specified, extract that region
  if (options.region) {
    const { x, y, width, height } = options.region;
    image = image.extract({
      left: Math.max(0, x),
      top: Math.max(0, y),
      width,
      height,
    });
  }

  const { data, info } = await image
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
}

/**
 * Convert an image to grayscale
 */
async function convertToGrayscale(imageData: RawImageData): Promise<RawImageData> {
  const { data, width, height, channels } = imageData;

  if (channels === 1) {
    return imageData; // Already grayscale
  }

  const grayscaleData = Buffer.alloc(width * height);

  for (let i = 0; i < width * height; i++) {
    const offset = i * channels;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    // Standard luminosity formula
    grayscaleData[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  return {
    data: grayscaleData,
    width,
    height,
    channels: 1,
  };
}

/**
 * Check if a pixel matches within tolerance
 */
function pixelsMatch(
  sourcePixel: number[],
  templatePixel: number[],
  tolerance: number
): boolean {
  for (let c = 0; c < sourcePixel.length && c < templatePixel.length; c++) {
    if (Math.abs(sourcePixel[c] - templatePixel[c]) > tolerance) {
      return false;
    }
  }
  return true;
}

/**
 * Get pixel values at a specific position
 */
function getPixel(imageData: RawImageData, x: number, y: number): number[] {
  const { data, width, channels } = imageData;
  const offset = (y * width + x) * channels;
  const pixel: number[] = [];
  for (let c = 0; c < channels; c++) {
    pixel.push(data[offset + c]);
  }
  return pixel;
}

/**
 * Calculate match confidence at a specific position using Sum of Absolute Differences (SAD)
 */
function calculateMatchConfidence(
  source: RawImageData,
  template: RawImageData,
  startX: number,
  startY: number,
  tolerance: number
): number {
  const { width: tw, height: th, channels } = template;
  let matchingPixels = 0;
  let totalPixels = tw * th;

  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      const sourcePixel = getPixel(source, startX + tx, startY + ty);
      const templatePixel = getPixel(template, tx, ty);

      if (pixelsMatch(sourcePixel, templatePixel, tolerance)) {
        matchingPixels++;
      }
    }
  }

  return matchingPixels / totalPixels;
}

/**
 * Perform template matching to find an image within another image
 *
 * This uses a sliding window approach with pixel comparison.
 * For better performance on large images, consider using a multi-scale
 * approach or optimized algorithms like ZNCC.
 */
function templateMatch(
  source: RawImageData,
  template: RawImageData,
  options: ImageSearchOptions = {}
): ImageSearchResult {
  const { confidenceThreshold = 0.8, colorTolerance = 25 } = options;

  const { width: sw, height: sh } = source;
  const { width: tw, height: th } = template;

  // Ensure template is smaller than source
  if (tw > sw || th > sh) {
    return {
      found: false,
      x: 0,
      y: 0,
      confidence: 0,
      width: tw,
      height: th,
      topLeft: { x: 0, y: 0 },
      bottomRight: { x: 0, y: 0 },
    };
  }

  let bestMatch = {
    x: 0,
    y: 0,
    confidence: 0,
  };

  // Sliding window search
  // Use step size for faster searching on large images
  const stepSize = 1;

  for (let y = 0; y <= sh - th; y += stepSize) {
    for (let x = 0; x <= sw - tw; x += stepSize) {
      const confidence = calculateMatchConfidence(
        source,
        template,
        x,
        y,
        colorTolerance
      );

      if (confidence > bestMatch.confidence) {
        bestMatch = { x, y, confidence };

        // Early exit if we found a perfect or near-perfect match
        if (confidence >= 0.99) {
          break;
        }
      }
    }

    // Early exit if we found a near-perfect match
    if (bestMatch.confidence >= 0.99) {
      break;
    }
  }

  const found = bestMatch.confidence >= confidenceThreshold;

  // Calculate center point of the match
  const centerX = bestMatch.x + Math.floor(tw / 2);
  const centerY = bestMatch.y + Math.floor(th / 2);

  return {
    found,
    x: centerX,
    y: centerY,
    confidence: bestMatch.confidence,
    width: tw,
    height: th,
    topLeft: { x: bestMatch.x, y: bestMatch.y },
    bottomRight: { x: bestMatch.x + tw - 1, y: bestMatch.y + th - 1 },
  };
}

/**
 * Search for a template image on the screen
 *
 * @param templatePath - Path to the template image file
 * @param options - Search options
 * @returns Search result with match coordinates and confidence
 *
 * @example
 * ```typescript
 * // Search for a button on the entire screen
 * const result = await imageSearch('button.png');
 * if (result.found) {
 *   console.log(`Found at (${result.x}, ${result.y}) with confidence ${result.confidence}`);
 * }
 *
 * // Search within a specific region with lower threshold
 * const result = await imageSearch('icon.png', {
 *   region: { x: 0, y: 0, width: 500, height: 500 },
 *   confidenceThreshold: 0.7
 * });
 * ```
 */
export async function imageSearch(
  templatePath: string,
  options: ImageSearchOptions = {}
): Promise<ImageSearchResult> {
  // Load the template image
  let template = await loadImage(templatePath);

  // Capture the screen
  let screen = await captureScreen(options);

  // Ensure both images have the same number of channels
  // If they differ, convert both to RGB (3 channels)
  if (template.channels !== screen.channels) {
    // Reload images ensuring consistent channel count
    const templateSharp = sharp(templatePath).removeAlpha();
    const { data: tData, info: tInfo } = await templateSharp
      .toFormat('png')
      .raw()
      .toBuffer({ resolveWithObject: true });
    template = {
      data: tData,
      width: tInfo.width,
      height: tInfo.height,
      channels: tInfo.channels,
    };

    await initScreenshot();
    const screenshotBuffer = await screenshot({
      screen: options.screen ?? 0,
      format: 'png',
    });

    let screenSharp = sharp(screenshotBuffer).removeAlpha();
    if (options.region) {
      const { x, y, width, height } = options.region;
      screenSharp = screenSharp.extract({
        left: Math.max(0, x),
        top: Math.max(0, y),
        width,
        height,
      });
    }
    const { data: sData, info: sInfo } = await screenSharp
      .raw()
      .toBuffer({ resolveWithObject: true });
    screen = {
      data: sData,
      width: sInfo.width,
      height: sInfo.height,
      channels: sInfo.channels,
    };
  }

  // Convert to grayscale if requested
  if (options.grayscale) {
    template = await convertToGrayscale(template);
    screen = await convertToGrayscale(screen);
  }

  // Perform template matching
  const result = templateMatch(screen, template, options);

  // Adjust coordinates if searching within a region
  if (options.region && result.found) {
    result.x += options.region.x;
    result.y += options.region.y;
    result.topLeft.x += options.region.x;
    result.topLeft.y += options.region.y;
    result.bottomRight.x += options.region.x;
    result.bottomRight.y += options.region.y;
  }

  return result;
}

/**
 * Search for a template image within a provided screenshot buffer
 *
 * @param templatePath - Path to the template image file
 * @param screenshotBuffer - Buffer containing the screenshot image
 * @param options - Search options (region will be applied to the screenshot)
 * @returns Search result with match coordinates and confidence
 */
export async function imageSearchInBuffer(
  templatePath: string,
  screenshotBuffer: Buffer,
  options: ImageSearchOptions = {}
): Promise<ImageSearchResult> {
  // Load the template image
  let template = await loadImage(templatePath);

  // Load the screenshot from buffer
  let screen: RawImageData;

  let image = sharp(screenshotBuffer);

  // If a region is specified, extract that region
  if (options.region) {
    const { x, y, width, height } = options.region;
    image = image.extract({
      left: Math.max(0, x),
      top: Math.max(0, y),
      width,
      height,
    });
  }

  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  screen = {
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
  };

  // Ensure both images have the same number of channels
  if (template.channels !== screen.channels) {
    const templateSharp = sharp(templatePath).removeAlpha();
    const { data: tData, info: tInfo } = await templateSharp
      .raw()
      .toBuffer({ resolveWithObject: true });
    template = {
      data: tData,
      width: tInfo.width,
      height: tInfo.height,
      channels: tInfo.channels,
    };

    let screenSharp = sharp(screenshotBuffer).removeAlpha();
    if (options.region) {
      const { x, y, width, height } = options.region;
      screenSharp = screenSharp.extract({
        left: Math.max(0, x),
        top: Math.max(0, y),
        width,
        height,
      });
    }
    const { data: sData, info: sInfo } = await screenSharp
      .raw()
      .toBuffer({ resolveWithObject: true });
    screen = {
      data: sData,
      width: sInfo.width,
      height: sInfo.height,
      channels: sInfo.channels,
    };
  }

  // Convert to grayscale if requested
  if (options.grayscale) {
    template = await convertToGrayscale(template);
    screen = await convertToGrayscale(screen);
  }

  // Perform template matching
  const result = templateMatch(screen, template, options);

  // Adjust coordinates if searching within a region
  if (options.region && result.found) {
    result.x += options.region.x;
    result.y += options.region.y;
    result.topLeft.x += options.region.x;
    result.topLeft.y += options.region.y;
    result.bottomRight.x += options.region.x;
    result.bottomRight.y += options.region.y;
  }

  return result;
}

/**
 * Search for multiple occurrences of a template image on the screen
 *
 * @param templatePath - Path to the template image file
 * @param options - Search options
 * @param maxMatches - Maximum number of matches to return. Default: 10
 * @returns Array of search results with match coordinates and confidence
 */
export async function imageSearchAll(
  templatePath: string,
  options: ImageSearchOptions = {},
  maxMatches: number = 10
): Promise<ImageSearchResult[]> {
  const { confidenceThreshold = 0.8, colorTolerance = 25 } = options;

  // Load the template image
  let template = await loadImage(templatePath);

  // Capture the screen
  let screen = await captureScreen(options);

  // Ensure both images have the same number of channels
  if (template.channels !== screen.channels) {
    const templateSharp = sharp(templatePath).removeAlpha();
    const { data: tData, info: tInfo } = await templateSharp
      .raw()
      .toBuffer({ resolveWithObject: true });
    template = {
      data: tData,
      width: tInfo.width,
      height: tInfo.height,
      channels: tInfo.channels,
    };

    await initScreenshot();
    const screenshotBuffer = await screenshot({
      screen: options.screen ?? 0,
      format: 'png',
    });

    let screenSharp = sharp(screenshotBuffer).removeAlpha();
    if (options.region) {
      const { x, y, width, height } = options.region;
      screenSharp = screenSharp.extract({
        left: Math.max(0, x),
        top: Math.max(0, y),
        width,
        height,
      });
    }
    const { data: sData, info: sInfo } = await screenSharp
      .raw()
      .toBuffer({ resolveWithObject: true });
    screen = {
      data: sData,
      width: sInfo.width,
      height: sInfo.height,
      channels: sInfo.channels,
    };
  }

  // Convert to grayscale if requested
  if (options.grayscale) {
    template = await convertToGrayscale(template);
    screen = await convertToGrayscale(screen);
  }

  const { width: sw, height: sh } = screen;
  const { width: tw, height: th } = template;

  const matches: ImageSearchResult[] = [];

  // Ensure template is smaller than source
  if (tw > sw || th > sh) {
    return matches;
  }

  // Sliding window search
  for (let y = 0; y <= sh - th; y++) {
    for (let x = 0; x <= sw - tw; x++) {
      const confidence = calculateMatchConfidence(
        screen,
        template,
        x,
        y,
        colorTolerance
      );

      if (confidence >= confidenceThreshold) {
        // Check if this match overlaps with an existing match
        const overlaps = matches.some((m) => {
          const overlapX = Math.abs(m.topLeft.x - x) < tw;
          const overlapY = Math.abs(m.topLeft.y - y) < th;
          return overlapX && overlapY;
        });

        if (!overlaps) {
          const centerX = x + Math.floor(tw / 2);
          const centerY = y + Math.floor(th / 2);

          let result: ImageSearchResult = {
            found: true,
            x: centerX,
            y: centerY,
            confidence,
            width: tw,
            height: th,
            topLeft: { x, y },
            bottomRight: { x: x + tw - 1, y: y + th - 1 },
          };

          // Adjust coordinates if searching within a region
          if (options.region) {
            result.x += options.region.x;
            result.y += options.region.y;
            result.topLeft.x += options.region.x;
            result.topLeft.y += options.region.y;
            result.bottomRight.x += options.region.x;
            result.bottomRight.y += options.region.y;
          }

          matches.push(result);

          if (matches.length >= maxMatches) {
            return matches;
          }
        }
      }
    }
  }

  // Sort by confidence (highest first)
  matches.sort((a, b) => b.confidence - a.confidence);

  return matches;
}

/**
 * Wait for an image to appear on screen
 *
 * @param templatePath - Path to the template image file
 * @param options - Search options
 * @param timeout - Maximum time to wait in milliseconds. Default: 30000
 * @param interval - Time between searches in milliseconds. Default: 500
 * @returns Search result if found, or result with found=false if timeout
 */
export async function waitForImage(
  templatePath: string,
  options: ImageSearchOptions = {},
  timeout: number = 30000,
  interval: number = 500
): Promise<ImageSearchResult> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await imageSearch(templatePath, options);

    if (result.found) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  // Return a "not found" result after timeout
  const template = await loadImage(templatePath);
  return {
    found: false,
    x: 0,
    y: 0,
    confidence: 0,
    width: template.width,
    height: template.height,
    topLeft: { x: 0, y: 0 },
    bottomRight: { x: 0, y: 0 },
  };
}

/**
 * ImageSearchService class providing all image search operations
 */
export class ImageSearchService {
  static search = imageSearch;
  static searchInBuffer = imageSearchInBuffer;
  static searchAll = imageSearchAll;
  static waitFor = waitForImage;
}

export default ImageSearchService;
