/**
 * Data Extractor for iMacros
 *
 * Handles extraction of various data types from DOM elements:
 * - TXT: innerText (trimmed, visible text only)
 * - TXTALL: all text content including hidden elements
 * - HTM: innerHTML
 * - HREF, SRC, ALT, TITLE: common attributes
 * - Any other attribute by name
 *
 * Supports multiple extractions with [EXTRACT] delimiter
 */

import { findElement, ElementFinderResult } from './element-finder';

/**
 * Delimiter used to join multiple extracted values
 */
export const EXTRACT_DELIMITER = '[EXTRACT]';

/**
 * Extraction types supported by the extractor
 */
export type ExtractionType =
  | 'TXT'
  | 'TXTALL'
  | 'HTM'
  | 'HREF'
  | 'SRC'
  | 'ALT'
  | 'TITLE'
  | 'VALUE'
  | 'NAME'
  | 'ID'
  | 'CLASS'
  | 'INNERTEXT'
  | 'INNERHTML'
  | 'OUTERHTML'
  | string; // Allow any attribute name

/**
 * Result of a data extraction operation
 */
export interface ExtractionResult {
  success: boolean;
  value: string;
  error?: string;
  element?: Element;
  extractionType: ExtractionType;
}

/**
 * Options for extraction operations
 */
export interface ExtractionOptions {
  /** Trim whitespace from extracted text (default: true) */
  trim?: boolean;
  /** Return empty string instead of null for missing attributes (default: true) */
  emptyOnMissing?: boolean;
  /** For table extractions, specify row (1-indexed) */
  row?: number;
  /** For table extractions, specify column (1-indexed) */
  col?: number;
}

/**
 * Storage for multiple extractions in a single macro run
 */
let extractionBuffer: string[] = [];

/**
 * Get the visible text content of an element (innerText equivalent)
 * This respects CSS visibility and display properties
 */
export function getVisibleText(element: Element): string {
  if (element instanceof HTMLElement) {
    return element.innerText || '';
  }
  // Fallback for non-HTML elements (SVG, etc.)
  return element.textContent || '';
}

/**
 * Get all text content including hidden elements (textContent)
 */
export function getAllText(element: Element): string {
  return element.textContent || '';
}

/**
 * Extract TXT (visible text, trimmed)
 */
export function extractTxt(element: Element, options: ExtractionOptions = {}): string {
  const { trim = true } = options;
  const text = getVisibleText(element);
  return trim ? text.trim() : text;
}

/**
 * Extract TXTALL (all text including hidden)
 */
export function extractTxtAll(element: Element, options: ExtractionOptions = {}): string {
  const { trim = true } = options;
  const text = getAllText(element);
  return trim ? text.trim() : text;
}

/**
 * Extract HTM (innerHTML)
 */
export function extractHtm(element: Element): string {
  return element.innerHTML;
}

/**
 * Extract OUTERHTML
 */
export function extractOuterHtml(element: Element): string {
  return element.outerHTML;
}

/**
 * Extract a specific attribute value
 */
export function extractAttribute(
  element: Element,
  attrName: string,
  options: ExtractionOptions = {}
): string | null {
  const { emptyOnMissing = true } = options;

  // Handle special pseudo-attributes
  const upperAttr = attrName.toUpperCase();

  switch (upperAttr) {
    case 'TXT':
    case 'INNERTEXT':
      return extractTxt(element, options);

    case 'TXTALL':
      return extractTxtAll(element, options);

    case 'HTM':
    case 'INNERHTML':
      return extractHtm(element);

    case 'OUTERHTML':
      return extractOuterHtml(element);

    case 'VALUE':
      // Handle form elements specially
      if (element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement) {
        return element.value;
      }
      return element.getAttribute('value') ?? (emptyOnMissing ? '' : null);

    case 'CHECKED':
      // Return 'true' or 'false' for checkbox/radio state
      if (element instanceof HTMLInputElement) {
        return element.checked ? 'true' : 'false';
      }
      return emptyOnMissing ? '' : null;

    case 'SELECTED':
      // Return selected option text for select elements
      if (element instanceof HTMLSelectElement) {
        const selectedOption = element.options[element.selectedIndex];
        return selectedOption ? selectedOption.text : '';
      }
      return emptyOnMissing ? '' : null;

    case 'SELECTEDVALUE':
      // Return selected option value for select elements
      if (element instanceof HTMLSelectElement) {
        return element.value;
      }
      return emptyOnMissing ? '' : null;

    case 'CLASS':
    case 'CLASSNAME':
      return element.className || (emptyOnMissing ? '' : null);

    case 'TAGNAME':
    case 'TAG':
      return element.tagName;

    default:
      // Standard attribute lookup
      const value = element.getAttribute(attrName.toLowerCase());
      return value ?? (emptyOnMissing ? '' : null);
  }
}

/**
 * Extract data from a table cell
 */
export function extractFromTableCell(
  table: HTMLTableElement,
  row: number,
  col: number,
  extractType: ExtractionType = 'TXT',
  options: ExtractionOptions = {}
): string | null {
  // Row and col are 1-indexed in iMacros
  const rows = table.rows;

  if (row < 1 || row > rows.length) {
    return null;
  }

  const targetRow = rows[row - 1];
  const cells = targetRow.cells;

  if (col < 1 || col > cells.length) {
    return null;
  }

  const cell = cells[col - 1];
  return extractAttribute(cell, extractType, options);
}

/**
 * Extract data from element based on extraction type
 */
export function extractData(
  element: Element,
  extractType: ExtractionType,
  options: ExtractionOptions = {}
): ExtractionResult {
  try {
    // Handle table cell extraction
    if (options.row !== undefined && options.col !== undefined) {
      if (element instanceof HTMLTableElement) {
        const value = extractFromTableCell(
          element,
          options.row,
          options.col,
          extractType,
          options
        );

        if (value === null) {
          return {
            success: false,
            value: '',
            error: `Table cell [${options.row}, ${options.col}] not found`,
            element,
            extractionType: extractType,
          };
        }

        return {
          success: true,
          value,
          element,
          extractionType: extractType,
        };
      }

      return {
        success: false,
        value: '',
        error: 'Element is not a table',
        element,
        extractionType: extractType,
      };
    }

    // Standard extraction
    const value = extractAttribute(element, extractType, options);

    if (value === null) {
      return {
        success: false,
        value: '',
        error: `Attribute "${extractType}" not found`,
        element,
        extractionType: extractType,
      };
    }

    return {
      success: true,
      value,
      element,
      extractionType: extractType,
    };
  } catch (error) {
    return {
      success: false,
      value: '',
      error: error instanceof Error ? error.message : String(error),
      element,
      extractionType: extractType,
    };
  }
}

/**
 * Extract data from a selector
 */
export function extractFromSelector(
  selector: string,
  extractType: ExtractionType,
  options: ExtractionOptions = {}
): ExtractionResult {
  const result = findElement(selector);

  if (!result.element) {
    return {
      success: false,
      value: '',
      error: `Element not found for selector: ${selector}`,
      extractionType: extractType,
    };
  }

  return extractData(result.element, extractType, options);
}

/**
 * Add extraction to the buffer (for multiple extractions with delimiter)
 */
export function addToExtractionBuffer(value: string): void {
  extractionBuffer.push(value);
}

/**
 * Get all extractions joined with delimiter
 */
export function getExtractionBuffer(): string {
  return extractionBuffer.join(EXTRACT_DELIMITER);
}

/**
 * Clear the extraction buffer
 */
export function clearExtractionBuffer(): void {
  extractionBuffer = [];
}

/**
 * Get current extraction buffer length
 */
export function getExtractionBufferLength(): number {
  return extractionBuffer.length;
}

/**
 * Get extraction buffer as array
 */
export function getExtractionBufferArray(): string[] {
  return [...extractionBuffer];
}

/**
 * Perform extraction and add to buffer
 * Returns the extracted value and adds it to the buffer
 */
export function extractAndBuffer(
  element: Element,
  extractType: ExtractionType,
  options: ExtractionOptions = {}
): ExtractionResult {
  const result = extractData(element, extractType, options);

  if (result.success) {
    addToExtractionBuffer(result.value);
  }

  return result;
}

/**
 * Perform extraction from selector and add to buffer
 */
export function extractFromSelectorAndBuffer(
  selector: string,
  extractType: ExtractionType,
  options: ExtractionOptions = {}
): ExtractionResult {
  const result = extractFromSelector(selector, extractType, options);

  if (result.success) {
    addToExtractionBuffer(result.value);
  }

  return result;
}

/**
 * Extract multiple attributes from a single element
 */
export function extractMultiple(
  element: Element,
  extractTypes: ExtractionType[],
  options: ExtractionOptions = {}
): Map<ExtractionType, ExtractionResult> {
  const results = new Map<ExtractionType, ExtractionResult>();

  for (const extractType of extractTypes) {
    results.set(extractType, extractData(element, extractType, options));
  }

  return results;
}

/**
 * Extract from all matching elements and join with delimiter
 */
export function extractFromAll(
  selector: string,
  extractType: ExtractionType,
  options: ExtractionOptions = {}
): string {
  const result = findElement(selector);
  const values: string[] = [];

  for (const element of result.elements) {
    const extractionResult = extractData(element, extractType, options);
    if (extractionResult.success) {
      values.push(extractionResult.value);
    }
  }

  return values.join(EXTRACT_DELIMITER);
}

/**
 * Extract link data (href + text) from anchor elements
 */
export function extractLinkData(element: Element): {
  href: string;
  text: string;
} | null {
  if (!(element instanceof HTMLAnchorElement)) {
    // Try to find anchor within element
    const anchor = element.querySelector('a');
    if (!anchor) {
      return null;
    }
    element = anchor;
  }

  return {
    href: (element as HTMLAnchorElement).href,
    text: extractTxt(element),
  };
}

/**
 * Extract image data (src + alt) from image elements
 */
export function extractImageData(element: Element): {
  src: string;
  alt: string;
  title: string;
  width: number;
  height: number;
} | null {
  if (!(element instanceof HTMLImageElement)) {
    // Try to find image within element
    const img = element.querySelector('img');
    if (!img) {
      return null;
    }
    element = img;
  }

  const img = element as HTMLImageElement;
  return {
    src: img.src,
    alt: img.alt,
    title: img.title,
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
  };
}

/**
 * Extract form field data
 */
export function extractFormFieldData(element: Element): {
  name: string;
  value: string;
  type: string;
  id: string;
} | null {
  if (element instanceof HTMLInputElement) {
    return {
      name: element.name,
      value: element.value,
      type: element.type,
      id: element.id,
    };
  }

  if (element instanceof HTMLSelectElement) {
    return {
      name: element.name,
      value: element.value,
      type: 'select',
      id: element.id,
    };
  }

  if (element instanceof HTMLTextAreaElement) {
    return {
      name: element.name,
      value: element.value,
      type: 'textarea',
      id: element.id,
    };
  }

  return null;
}

/**
 * Extract all data attributes from an element
 */
export function extractDataAttributes(element: Element): Record<string, string> {
  const dataAttrs: Record<string, string> = {};

  if (element instanceof HTMLElement) {
    for (const key of Object.keys(element.dataset)) {
      dataAttrs[key] = element.dataset[key] || '';
    }
  } else {
    // Fallback for non-HTML elements
    for (const attr of Array.from(element.attributes)) {
      if (attr.name.startsWith('data-')) {
        const key = attr.name.slice(5); // Remove 'data-' prefix
        dataAttrs[key] = attr.value;
      }
    }
  }

  return dataAttrs;
}

// Export default object with all functions
export default {
  // Core extraction functions
  extractTxt,
  extractTxtAll,
  extractHtm,
  extractOuterHtml,
  extractAttribute,
  extractData,
  extractFromSelector,
  extractFromTableCell,

  // Buffer management
  addToExtractionBuffer,
  getExtractionBuffer,
  clearExtractionBuffer,
  getExtractionBufferLength,
  getExtractionBufferArray,

  // Combined extraction + buffer
  extractAndBuffer,
  extractFromSelectorAndBuffer,

  // Multiple extractions
  extractMultiple,
  extractFromAll,

  // Specialized extractors
  extractLinkData,
  extractImageData,
  extractFormFieldData,
  extractDataAttributes,

  // Utilities
  getVisibleText,
  getAllText,

  // Constants
  EXTRACT_DELIMITER,
};
