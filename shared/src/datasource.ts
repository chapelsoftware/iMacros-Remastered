/**
 * iMacros CSV Datasource Parser
 *
 * Implements CSV file parsing for iMacros macros using papaparse.
 * Supports:
 * - !COL1, !COL2, etc. column references (up to !COL10)
 * - Different delimiters (comma, tab, semicolon)
 * - Quoted field handling
 * - Header row option
 * - Row iteration (next row, reset)
 */

import Papa, { ParseConfig, ParseResult } from 'papaparse';
import { VariableContext, ColName } from './variables';

/**
 * Supported delimiter types
 */
export type Delimiter = ',' | '\t' | ';' | '|' | 'auto';

/**
 * Options for CSV parsing
 */
export interface DatasourceOptions {
  /** Field delimiter character (default: 'auto' for auto-detect) */
  delimiter?: Delimiter;
  /** Whether the first row contains headers (default: false) */
  hasHeader?: boolean;
  /** Character used for quoting fields (default: '"') */
  quoteChar?: string;
  /** Character used to escape quotes (default: '"') */
  escapeChar?: string;
  /** Skip empty lines (default: true) */
  skipEmptyLines?: boolean;
  /** Starting line number (1-based, default: 1) */
  startLine?: number;
  /** Comment character - lines starting with this are skipped */
  commentChar?: string;
}

/**
 * Datasource state
 */
export interface DatasourceState {
  /** Current file path */
  filePath: string;
  /** All parsed rows (excluding header if hasHeader is true) */
  rows: string[][];
  /** Header row (if hasHeader is true) */
  headers: string[];
  /** Current row index (0-based) */
  currentIndex: number;
  /** Number of columns in the datasource */
  columnCount: number;
  /** Total number of data rows */
  rowCount: number;
  /** Parsing options used */
  options: DatasourceOptions;
}

/**
 * Result of loading a datasource
 */
export interface LoadResult {
  success: boolean;
  state?: DatasourceState;
  error?: string;
}

/**
 * Result of getting the current row
 */
export interface RowResult {
  success: boolean;
  row?: string[];
  lineNumber?: number;
  error?: string;
}

/**
 * Default parsing options
 */
export const DEFAULT_OPTIONS: Required<DatasourceOptions> = {
  delimiter: 'auto',
  hasHeader: false,
  quoteChar: '"',
  escapeChar: '"',
  skipEmptyLines: true,
  startLine: 1,
  commentChar: '',
};

/**
 * CSV Datasource Manager
 *
 * Manages CSV file parsing and row iteration for iMacros datasource functionality.
 */
export class DatasourceManager {
  private state: DatasourceState | null = null;

  /**
   * Parse CSV content and load as datasource
   *
   * @param content - The CSV file content as string
   * @param filePath - The path to the file (for tracking purposes)
   * @param options - Parsing options
   * @returns LoadResult indicating success/failure
   */
  loadFromContent(
    content: string,
    filePath: string = '',
    options: DatasourceOptions = {}
  ): LoadResult {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    try {
      // Build papaparse config
      const config: ParseConfig = {
        delimiter: opts.delimiter === 'auto' ? undefined : opts.delimiter,
        quoteChar: opts.quoteChar,
        escapeChar: opts.escapeChar,
        skipEmptyLines: opts.skipEmptyLines,
        comments: opts.commentChar || false,
      };

      // Parse CSV
      const result: ParseResult<string[]> = Papa.parse(content, config);

      if (result.errors.length > 0) {
        // Filter critical errors
        const criticalErrors = result.errors.filter(
          (e) => e.type === 'Quotes' || e.type === 'FieldMismatch'
        );
        if (criticalErrors.length > 0) {
          return {
            success: false,
            error: `CSV parsing error: ${criticalErrors[0].message}`,
          };
        }
      }

      let rows = result.data as string[][];
      let headers: string[] = [];

      // Handle empty result
      if (rows.length === 0) {
        return {
          success: false,
          error: 'CSV file is empty or contains no valid data',
        };
      }

      // Extract header row if specified
      if (opts.hasHeader && rows.length > 0) {
        headers = rows[0];
        rows = rows.slice(1);
      }

      // Apply startLine offset (1-based to 0-based)
      if (opts.startLine > 1) {
        const skipCount = opts.startLine - 1;
        if (skipCount >= rows.length) {
          return {
            success: false,
            error: `Start line ${opts.startLine} exceeds data row count ${rows.length}`,
          };
        }
        rows = rows.slice(skipCount);
      }

      // Determine max column count
      let columnCount = 0;
      for (const row of rows) {
        if (row.length > columnCount) {
          columnCount = row.length;
        }
      }
      if (headers.length > columnCount) {
        columnCount = headers.length;
      }

      // Normalize all rows to have the same number of columns
      rows = rows.map((row) => {
        if (row.length < columnCount) {
          return [...row, ...Array(columnCount - row.length).fill('')];
        }
        return row;
      });

      this.state = {
        filePath,
        rows,
        headers,
        currentIndex: 0,
        columnCount,
        rowCount: rows.length,
        options: opts,
      };

      return {
        success: true,
        state: this.state,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse CSV: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Check if a datasource is loaded
   */
  isLoaded(): boolean {
    return this.state !== null;
  }

  /**
   * Get the current datasource state
   */
  getState(): DatasourceState | null {
    return this.state;
  }

  /**
   * Get the current row data
   *
   * @returns RowResult with current row data
   */
  getCurrentRow(): RowResult {
    if (!this.state) {
      return {
        success: false,
        error: 'No datasource loaded',
      };
    }

    if (this.state.currentIndex >= this.state.rowCount) {
      return {
        success: false,
        error: 'End of datasource reached',
      };
    }

    return {
      success: true,
      row: this.state.rows[this.state.currentIndex],
      lineNumber: this.state.currentIndex + 1,
    };
  }

  /**
   * Move to the next row
   *
   * @returns true if moved to next row, false if at end
   */
  nextRow(): boolean {
    if (!this.state) {
      return false;
    }

    if (this.state.currentIndex >= this.state.rowCount - 1) {
      return false;
    }

    this.state.currentIndex++;
    return true;
  }

  /**
   * Move to the previous row
   *
   * @returns true if moved to previous row, false if at beginning
   */
  previousRow(): boolean {
    if (!this.state) {
      return false;
    }

    if (this.state.currentIndex <= 0) {
      return false;
    }

    this.state.currentIndex--;
    return true;
  }

  /**
   * Go to a specific row (1-based line number)
   *
   * @param lineNumber - The 1-based line number to go to
   * @returns true if moved to the row, false if out of bounds
   */
  goToRow(lineNumber: number): boolean {
    if (!this.state) {
      return false;
    }

    const index = lineNumber - 1;
    if (index < 0 || index >= this.state.rowCount) {
      return false;
    }

    this.state.currentIndex = index;
    return true;
  }

  /**
   * Reset to the first row
   */
  reset(): void {
    if (this.state) {
      this.state.currentIndex = 0;
    }
  }

  /**
   * Get the current line number (1-based)
   */
  getCurrentLineNumber(): number {
    if (!this.state) {
      return 0;
    }
    return this.state.currentIndex + 1;
  }

  /**
   * Get the total number of rows
   */
  getRowCount(): number {
    return this.state?.rowCount ?? 0;
  }

  /**
   * Get the number of columns
   */
  getColumnCount(): number {
    return this.state?.columnCount ?? 0;
  }

  /**
   * Get the file path
   */
  getFilePath(): string {
    return this.state?.filePath ?? '';
  }

  /**
   * Get header names (if hasHeader was true)
   */
  getHeaders(): string[] {
    return this.state?.headers ?? [];
  }

  /**
   * Get a specific column value from current row (1-based index)
   *
   * @param columnIndex - 1-based column index
   * @returns The column value or empty string if out of bounds
   */
  getColumn(columnIndex: number): string {
    if (!this.state) {
      return '';
    }

    const row = this.getCurrentRow();
    if (!row.success || !row.row) {
      return '';
    }

    const index = columnIndex - 1;
    if (index < 0 || index >= row.row.length) {
      return '';
    }

    return row.row[index];
  }

  /**
   * Get column value by header name (requires hasHeader option)
   *
   * @param headerName - The header name to look up
   * @returns The column value or empty string if not found
   */
  getColumnByHeader(headerName: string): string {
    if (!this.state || this.state.headers.length === 0) {
      return '';
    }

    const headerIndex = this.state.headers.findIndex(
      (h) => h.toLowerCase() === headerName.toLowerCase()
    );
    if (headerIndex === -1) {
      return '';
    }

    return this.getColumn(headerIndex + 1);
  }

  /**
   * Check if at the end of the datasource
   */
  isAtEnd(): boolean {
    if (!this.state) {
      return true;
    }
    return this.state.currentIndex >= this.state.rowCount;
  }

  /**
   * Check if at the beginning of the datasource
   */
  isAtBeginning(): boolean {
    if (!this.state) {
      return true;
    }
    return this.state.currentIndex === 0;
  }

  /**
   * Unload the current datasource
   */
  unload(): void {
    this.state = null;
  }

  /**
   * Update a VariableContext with current row's column values
   * Sets !COL1 through !COL10 and datasource-related system variables
   *
   * @param context - The VariableContext to update
   */
  populateVariables(context: VariableContext): void {
    if (!this.state) {
      // Clear datasource variables
      context.setDatasource('');
      context.setDatasourceLine(0);
      context.setDatasourceCols([]);
      return;
    }

    // Set datasource path
    context.setDatasource(this.state.filePath);

    // Set current line number
    context.setDatasourceLine(this.getCurrentLineNumber());

    // Get current row
    const row = this.getCurrentRow();
    if (row.success && row.row) {
      // Limit to 10 columns for !COL1-10
      const columns = row.row.slice(0, 10);
      context.setDatasourceCols(columns);
    } else {
      context.setDatasourceCols([]);
    }
  }

  /**
   * Get all data as array of arrays
   */
  getAllRows(): string[][] {
    return this.state?.rows ?? [];
  }

  /**
   * Iterator support for row iteration
   */
  *[Symbol.iterator](): Iterator<string[]> {
    if (!this.state) {
      return;
    }

    for (const row of this.state.rows) {
      yield row;
    }
  }
}

/**
 * Create a new DatasourceManager instance
 */
export function createDatasourceManager(): DatasourceManager {
  return new DatasourceManager();
}

/**
 * Parse CSV content and return rows without creating a manager
 * Utility function for simple parsing needs
 *
 * @param content - CSV content string
 * @param options - Parsing options
 * @returns Parsed rows or null on error
 */
export function parseCSV(
  content: string,
  options: DatasourceOptions = {}
): string[][] | null {
  const manager = new DatasourceManager();
  const result = manager.loadFromContent(content, '', options);
  if (result.success && result.state) {
    return result.state.rows;
  }
  return null;
}

/**
 * Detect the delimiter used in CSV content
 *
 * @param content - CSV content string
 * @returns Detected delimiter or comma as default
 */
export function detectDelimiter(content: string): ',' | '\t' | ';' | '|' {
  // Use papaparse's built-in delimiter detection
  const result: ParseResult<string[]> = Papa.parse(content, {
    preview: 5, // Only check first 5 rows
  });

  // If papaparse detected a delimiter, use that
  if (result.meta && result.meta.delimiter) {
    const detected = result.meta.delimiter;
    if (detected === ',' || detected === '\t' || detected === ';' || detected === '|') {
      return detected;
    }
  }

  // Fallback to manual detection based on character frequency
  const firstLines = content.split('\n').slice(0, 5).join('\n');

  const counts = {
    ',': (firstLines.match(/,/g) || []).length,
    '\t': (firstLines.match(/\t/g) || []).length,
    ';': (firstLines.match(/;/g) || []).length,
    '|': (firstLines.match(/\|/g) || []).length,
  };

  // Find delimiter with highest count
  let maxDelimiter: ',' | '\t' | ';' | '|' = ',';
  let maxCount = 0;

  for (const [delim, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      maxDelimiter = delim as ',' | '\t' | ';' | '|';
    }
  }

  return maxDelimiter;
}

/**
 * Validate a !COLn variable name and extract the column number
 *
 * @param varName - Variable name like "!COL1", "!COL2", etc.
 * @returns Column number (1-10) or null if invalid
 */
export function parseColVariable(varName: string): number | null {
  const match = varName.toUpperCase().match(/^!COL(\d+)$/);
  if (!match) {
    return null;
  }

  const colNum = parseInt(match[1], 10);
  if (colNum < 1 || colNum > 10) {
    return null;
  }

  return colNum;
}

/**
 * Build a !COLn variable name from column number
 *
 * @param columnNumber - 1-based column number (1-10)
 * @returns Variable name like "!COL1" or null if invalid
 */
export function buildColVariable(columnNumber: number): ColName | null {
  if (columnNumber < 1 || columnNumber > 10) {
    return null;
  }
  return `!COL${columnNumber}` as ColName;
}
