/**
 * iMacros Variable System
 *
 * Implements variable storage, expansion, and manipulation for iMacros macros.
 * Supports:
 * - Built-in variables: !VAR0-9, !EXTRACT, !EXTRACTADD, !LOOP, !DATASOURCE*, !TIMEOUT*
 * - Custom user-defined variables
 * - Variable expansion with {{var}} syntax
 * - ADD command for numeric operations
 */

import { SYSTEM_VARIABLES, SystemVariable, extractVariables } from './parser';
import { ExpressionEvaluator, preprocessMathExpressions, MacroErrorSignal } from './expression-evaluator';

/**
 * Variable value types
 */
export type VariableValue = string | number | null;

/**
 * Built-in variable names for !VAR0-9
 */
export const VAR_NAMES = [
  '!VAR0', '!VAR1', '!VAR2', '!VAR3', '!VAR4', '!VAR5',
  '!VAR6', '!VAR7', '!VAR8', '!VAR9'
] as const;

export type VarName = typeof VAR_NAMES[number];

/**
 * Built-in variable names for !COL1-10 (datasource columns)
 */
export const COL_NAMES = [
  '!COL1', '!COL2', '!COL3', '!COL4', '!COL5',
  '!COL6', '!COL7', '!COL8', '!COL9', '!COL10'
] as const;

export type ColName = typeof COL_NAMES[number];

/**
 * Timeout-related system variables
 */
export const TIMEOUT_VARS = ['!TIMEOUT', '!TIMEOUT_STEP', '!TIMEOUT_PAGE'] as const;
export type TimeoutVar = typeof TIMEOUT_VARS[number];

/**
 * Datasource-related system variables
 */
export const DATASOURCE_VARS = ['!DATASOURCE', '!DATASOURCE_LINE', '!DATASOURCE_COLUMNS'] as const;
export type DatasourceVar = typeof DATASOURCE_VARS[number];

/**
 * Folder-related system variables
 */
export const FOLDER_VARS = ['!FOLDER_DATASOURCE', '!FOLDER_DOWNLOAD', '!FOLDER_MACROS'] as const;
export type FolderVar = typeof FOLDER_VARS[number];

/**
 * Default values for built-in variables
 */
export const DEFAULT_VALUES: Record<string, VariableValue> = {
  // !VAR0-9 default to empty string
  '!VAR0': '',
  '!VAR1': '',
  '!VAR2': '',
  '!VAR3': '',
  '!VAR4': '',
  '!VAR5': '',
  '!VAR6': '',
  '!VAR7': '',
  '!VAR8': '',
  '!VAR9': '',
  // !COL1-10 default to empty string
  '!COL1': '',
  '!COL2': '',
  '!COL3': '',
  '!COL4': '',
  '!COL5': '',
  '!COL6': '',
  '!COL7': '',
  '!COL8': '',
  '!COL9': '',
  '!COL10': '',
  // Loop counter defaults to 1
  '!LOOP': 1,
  // Datasource variables
  '!DATASOURCE': '',
  '!DATASOURCE_LINE': 1,
  '!DATASOURCE_COLUMNS': 0,
  '!DATASOURCE_DELIMITER': ',',
  // Extract variables
  '!EXTRACT': '',
  '!EXTRACTADD': '',
  '!EXTRACT_TEST_POPUP': 'NO',
  // Encryption
  '!ENCRYPTION': '',
  // Timeout variables (in seconds)
  '!TIMEOUT': 60,
  '!TIMEOUT_STEP': 6,
  '!TIMEOUT_PAGE': 60,
  '!TIMEOUT_TAG': 6,
  '!TIMEOUT_MACRO': 300,
  // Error handling
  '!ERRORIGNORE': 'NO',
  '!ERRORLOOP': 'NO',
  // Playback control
  '!SINGLESTEP': 'NO',
  '!REPLAYSPEED': 'MEDIUM',
  // Folder paths (will be set by runtime)
  '!FOLDER_DATASOURCE': '',
  '!FOLDER_DOWNLOAD': '',
  '!FOLDER_MACROS': '',
  '!FOLDER_STOPWATCH': '',
  // URL tracking
  '!URLSTART': '',
  '!URLCURRENT': '',
  // Document title (populated by navigation, used by deriveDocumentName fallback)
  '!DOCUMENT_TITLE': '',
  // Stopwatch
  // !FILESTOPWATCH: native-host-only - file creation requires native messaging
  '!FILESTOPWATCH': '',
  '!STOPWATCH': 'NO',
  '!STOPWATCHTIME': 0,
  '!STOPWATCH_HEADER': 'YES',
  // Clipboard (native-host-only: system clipboard write requires native messaging)
  '!CLIPBOARD': '',
  // Download/PDF
  '!DOWNLOADPDF': 'NO',
  // Browser/Page control
  // !USERAGENT: native-host-only - browser user agent requires extension API
  '!USERAGENT': '',
  // !POPUP_ALLOWED: URL of site to temporarily allow popups for during macro execution
  '!POPUP_ALLOWED': '',
  '!WAITPAGECOMPLETE': 'YES',
  // Profiler
  '!FILE_PROFILER': '',
  // Image recognition
  '!IMAGEFILTER': '',
  // Line number adjustment
  '!LINENUMBER_DELTA': 0,
};

/**
 * Result of a SET operation
 */
export interface SetResult {
  success: boolean;
  previousValue: VariableValue;
  newValue: VariableValue;
  error?: string;
}

/**
 * Result of an ADD operation
 */
export interface AddResult {
  success: boolean;
  previousValue: VariableValue;
  addedValue: VariableValue;
  newValue: VariableValue;
  error?: string;
}

/**
 * Result of variable expansion
 */
export interface ExpansionResult {
  expanded: string;
  hadVariables: boolean;
  unresolvedVariables: string[];
}

/**
 * Options for variable expansion
 */
export interface ExpansionOptions {
  /** Whether to throw on unresolved variables (default: false) */
  strict?: boolean;
  /** Value to use for unresolved variables (default: empty string) */
  defaultValue?: string;
  /** Custom resolver for special variables like !NOW */
  customResolver?: (name: string) => VariableValue | undefined;
}

/**
 * Variable scope/context for macro execution
 */
export class VariableContext {
  /** System/built-in variables */
  private systemVars: Map<string, VariableValue>;
  /** User-defined custom variables */
  private customVars: Map<string, VariableValue>;
  /** Extract accumulator for !EXTRACTADD */
  private extractAccumulator: string[];
  /** Raw datasource rows for dynamic !COL resolution (original iMacros behavior) */
  private datasourceRows: string[][] | null;
  /** Optional resolver for !URLCURRENT — returns the live browser URL.
   *  iMacros 8.9.7 reads document.location on every access; this callback
   *  lets the extension keep !URLCURRENT in sync with the actual tab URL. */
  private urlCurrentResolver: (() => string) | null;

  constructor() {
    this.systemVars = new Map();
    this.customVars = new Map();
    this.extractAccumulator = [];
    this.datasourceRows = null;
    this.urlCurrentResolver = null;
    this.reset();
  }

  /**
   * Reset all variables to their default values
   */
  reset(): void {
    this.systemVars.clear();
    this.customVars.clear();
    this.extractAccumulator = [];
    this.datasourceRows = null;

    // Initialize system variables with defaults
    for (const [name, value] of Object.entries(DEFAULT_VALUES)) {
      this.systemVars.set(name.toUpperCase(), value);
    }
  }

  /**
   * Reset only !VAR0-9 variables
   */
  resetVars(): void {
    for (const varName of VAR_NAMES) {
      this.systemVars.set(varName, '');
    }
  }

  /**
   * Reset only !COL1-10 variables
   */
  resetCols(): void {
    for (const colName of COL_NAMES) {
      this.systemVars.set(colName, '');
    }
  }

  /**
   * Reset extract variables
   */
  resetExtract(): void {
    this.systemVars.set('!EXTRACT', '');
    this.systemVars.set('!EXTRACTADD', '');
    this.extractAccumulator = [];
  }

  /**
   * Check if a variable name is a system variable
   */
  isSystemVariable(name: string): boolean {
    const upperName = name.toUpperCase();
    if (!upperName.startsWith('!')) return false;
    // Check known system variables
    if (SYSTEM_VARIABLES.includes(upperName as SystemVariable)) {
      return true;
    }
    // Check for dynamic patterns like !NOW:format
    if (upperName.startsWith('!NOW:') || upperName === '!NOW') {
      return true;
    }
    return false;
  }

  /**
   * Validate a value for a system variable (iMacros 8.9.7 parity).
   * Returns an error message string if invalid, or null if valid.
   */
  private validateSystemVariable(upperName: string, value: VariableValue): string | null {
    const strValue = String(value).toUpperCase();
    const numValue = typeof value === 'number' ? value : parseFloat(String(value));

    // YES/NO boolean variables
    const yesNoVars = [
      '!ERRORIGNORE', '!ERRORLOOP', '!SINGLESTEP',
      '!EXTRACT_TEST_POPUP', '!STOPWATCH', '!STOPWATCH_HEADER',
      '!WAITPAGECOMPLETE', '!DOWNLOADPDF',
    ];
    if (yesNoVars.includes(upperName)) {
      if (strValue !== 'YES' && strValue !== 'NO') {
        return `${upperName} must be YES or NO, got: ${value}`;
      }
      return null;
    }

    // !POPUP_ALLOWED accepts a URL string (site to allow popups for)
    // Original iMacros: SET !POPUP_ALLOWED <url> — prepends http:// if no scheme
    if (upperName === '!POPUP_ALLOWED') {
      const raw = String(value).trim();
      if (raw === '') {
        return `${upperName} requires a site URL`;
      }
      return null;
    }

    // Timeout variables must be non-negative numbers
    const timeoutVars = [
      '!TIMEOUT', '!TIMEOUT_STEP', '!TIMEOUT_PAGE',
      '!TIMEOUT_TAG', '!TIMEOUT_MACRO',
    ];
    if (timeoutVars.includes(upperName)) {
      if (isNaN(numValue) || numValue < 0) {
        return `${upperName} must be a non-negative number, got: ${value}`;
      }
      return null;
    }

    // !REPLAYSPEED must be one of the valid values
    if (upperName === '!REPLAYSPEED') {
      const validSpeeds = ['SLOW', 'MEDIUM', 'FAST'];
      if (!validSpeeds.includes(strValue)) {
        return `${upperName} must be SLOW, MEDIUM, or FAST, got: ${value}`;
      }
      return null;
    }

    // !LOOP must be a positive integer
    if (upperName === '!LOOP') {
      if (isNaN(numValue) || numValue < 1 || !Number.isInteger(numValue)) {
        return `${upperName} must be a positive integer, got: ${value}`;
      }
      return null;
    }

    // !DATASOURCE_LINE must be a positive integer
    if (upperName === '!DATASOURCE_LINE') {
      if (isNaN(numValue) || numValue < 1 || !Number.isInteger(numValue)) {
        return `${upperName} must be a positive integer, got: ${value}`;
      }
      return null;
    }

    // !DATASOURCE_DELIMITER must be a single character
    if (upperName === '!DATASOURCE_DELIMITER') {
      const rawStr = String(value);
      if (rawStr.length !== 1) {
        return `${upperName} must be a single character, got: ${value}`;
      }
      return null;
    }

    return null;
  }

  /**
   * Check if a variable exists (system or custom)
   */
  has(name: string): boolean {
    const upperName = name.toUpperCase();
    if (upperName.startsWith('!')) {
      return this.systemVars.has(upperName) || this.isSystemVariable(upperName);
    }
    return this.customVars.has(upperName);
  }

  /**
   * Get a variable value
   */
  get(name: string): VariableValue {
    const upperName = name.toUpperCase();

    // Handle !NOW special variable
    if (upperName === '!NOW' || upperName.startsWith('!NOW:')) {
      return this.resolveNow(upperName);
    }

    // Handle !URLCURRENT dynamically (iMacros 8.9.7 reads document.location on every access)
    if (upperName === '!URLCURRENT' && this.urlCurrentResolver) {
      return this.urlCurrentResolver();
    }

    // Handle !COL1-10 dynamically from datasource (original iMacros behavior)
    // Reads from datasourceRows based on !DATASOURCE_LINE
    // Only matches !COL1 through !COL10 (not !COL11, !COL0, etc.)
    const colMatch = upperName.match(/^!COL([1-9]|10)$/);
    if (colMatch) {
      return this.resolveDatasourceColumn(parseInt(colMatch[1], 10));
    }

    // System variable
    if (upperName.startsWith('!')) {
      const value = this.systemVars.get(upperName);
      return value !== undefined ? value : null;
    }

    // Custom variable
    const value = this.customVars.get(upperName);
    return value !== undefined ? value : null;
  }

  /**
   * Resolve !COLn dynamically from datasource based on !DATASOURCE_LINE
   * This matches original iMacros 8.9.7 behavior where !COL variables
   * are computed at expansion time, not stored.
   *
   * Falls back to stored value (from setDatasourceCols) if no datasource
   * rows are loaded, for backward compatibility.
   */
  private resolveDatasourceColumn(colNum: number): string {
    // Validate column number (1-10)
    if (colNum < 1 || colNum > 10) {
      return '';
    }

    // If datasource rows loaded, resolve dynamically (original iMacros behavior)
    if (this.datasourceRows && this.datasourceRows.length > 0) {
      // Get current datasource line (1-based, may be stored as string or number)
      const lineNum = this.systemVars.get('!DATASOURCE_LINE');
      const line = typeof lineNum === 'number' ? lineNum : parseInt(String(lineNum), 10) || 1;

      // Convert to 0-based index
      const rowIndex = line - 1;

      // Check bounds
      if (rowIndex < 0 || rowIndex >= this.datasourceRows.length) {
        return '';
      }

      const row = this.datasourceRows[rowIndex];
      const colIndex = colNum - 1;

      // Return column value or empty string if out of bounds
      return row[colIndex] ?? '';
    }

    // Fallback: read from stored value (backward compatibility with setDatasourceCols)
    const colName = `!COL${colNum}`;
    const value = this.systemVars.get(colName);
    return typeof value === 'string' ? value : '';
  }

  /**
   * Resolve !NOW variable with optional format
   */
  private resolveNow(name: string): string {
    const now = new Date();

    if (name === '!NOW') {
      // Default format: YYYYMMDD_HHMMSS
      return this.formatDate(now, 'yyyymmdd_hhnnss');
    }

    // Extract format from !NOW:format
    const format = name.substring(5); // Remove "!NOW:"
    return this.formatDate(now, format);
  }

  /**
   * Format a date according to iMacros format string
   * Supported tokens: yyyy, yy, mm, dd, hh, nn (minutes), ss, dow (day of week), doy (day of year)
   */
  private formatDate(date: Date, format: string): string {
    const yyyy = date.getFullYear().toString();
    const yy = yyyy.substring(2);
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const dd = date.getDate().toString().padStart(2, '0');
    const hh = date.getHours().toString().padStart(2, '0');
    const nn = date.getMinutes().toString().padStart(2, '0');
    const ss = date.getSeconds().toString().padStart(2, '0');
    const dow = date.getDay().toString();
    const doy = this.getDayOfYear(date).toString().padStart(3, '0');

    let result = format.toLowerCase();
    result = result.replace(/yyyy/gi, yyyy);
    result = result.replace(/yy/gi, yy);
    result = result.replace(/mm/gi, mm);
    result = result.replace(/dd/gi, dd);
    result = result.replace(/hh/gi, hh);
    result = result.replace(/nn/gi, nn);
    result = result.replace(/ss/gi, ss);
    result = result.replace(/dow/gi, dow);
    result = result.replace(/doy/gi, doy);

    return result;
  }

  /**
   * Get day of year (1-366)
   */
  private getDayOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
  }

  /**
   * Set a variable value
   */
  set(name: string, value: VariableValue): SetResult {
    const upperName = name.toUpperCase();
    let previousValue: VariableValue;

    // System variable
    if (upperName.startsWith('!')) {
      // Check if it's a valid system variable
      if (!this.isSystemVariable(upperName)) {
        return {
          success: false,
          previousValue: null,
          newValue: value,
          error: `Unknown system variable: ${name}`,
        };
      }

      // Some system variables are read-only
      const readOnlyVars = ['!NOW', '!URLCURRENT', '!DATASOURCE_COLUMNS'];
      if (readOnlyVars.some(v => upperName.startsWith(v))) {
        return {
          success: false,
          previousValue: this.get(upperName),
          newValue: value,
          error: `System variable ${name} is read-only`,
        };
      }

      // Validate system variable values (iMacros 8.9.7 parity)
      const validationError = this.validateSystemVariable(upperName, value);
      if (validationError) {
        return {
          success: false,
          previousValue: this.get(upperName),
          newValue: value,
          error: validationError,
        };
      }

      previousValue = this.systemVars.get(upperName) ?? null;
      this.systemVars.set(upperName, value);

      // !TIMEOUT cascade: setting !TIMEOUT also sets !TIMEOUT_TAG = timeout/10
      // (iMacros 8.9.7 behavior)
      if (upperName === '!TIMEOUT') {
        const numValue = typeof value === 'number' ? value : parseFloat(String(value));
        if (!isNaN(numValue)) {
          this.systemVars.set('!TIMEOUT_TAG', Math.max(1, Math.round(numValue / 10)));
        }
      }

      // Special handling for !EXTRACT and !EXTRACTADD (iMacros 8.9.7 behavior)
      // SET !EXTRACT = clears accumulator, then adds value (unless "null")
      // SET !EXTRACTADD = just appends to accumulator
      if (upperName === '!EXTRACT') {
        // Clear and restart accumulator
        this.extractAccumulator = [];
        const strValue = String(value);
        if (!/^null$/i.test(strValue)) {
          this.extractAccumulator.push(strValue);
        }
        const accumulated = this.extractAccumulator.join('[EXTRACT]');
        this.systemVars.set('!EXTRACT', accumulated);
        this.systemVars.set('!EXTRACTADD', accumulated);
      } else if (upperName === '!EXTRACTADD') {
        // Just append to accumulator
        this.extractAccumulator.push(String(value));
        const accumulated = this.extractAccumulator.join('[EXTRACT]');
        this.systemVars.set('!EXTRACT', accumulated);
        this.systemVars.set('!EXTRACTADD', accumulated);
      }

      return {
        success: true,
        previousValue,
        newValue: value,
      };
    }

    // Custom variable
    previousValue = this.customVars.get(upperName) ?? null;
    this.customVars.set(upperName, value);

    return {
      success: true,
      previousValue,
      newValue: value,
    };
  }

  /**
   * Add a value to a variable (for ADD command)
   * Matches original iMacros behavior:
   * - If both current and added values are numeric, does numeric addition
   * - Empty/null current value is treated as 0 for numeric operations
   * - Otherwise, falls back to string concatenation
   */
  add(name: string, value: string): AddResult {
    const upperName = name.toUpperCase();
    const currentValue = this.get(upperName);

    // Adding empty string is a no-op — return current value unchanged
    // (original iMacros behavior: empty value concatenates, which changes nothing)
    if (value === '') {
      return {
        success: true,
        previousValue: currentValue,
        addedValue: '',
        newValue: currentValue ?? '',
        error: undefined,
      };
    }

    // Empty/null is treated as 0 for numeric operations (original iMacros behavior)
    const currentStr = String(currentValue ?? '');
    const isCurrentEmpty = currentStr === '';
    const currentNum = isCurrentEmpty ? 0 : parseFloat(currentStr);
    const addNum = parseFloat(value);

    // If added value is numeric and current is either empty or numeric, do numeric addition
    if (!isNaN(addNum) && (isCurrentEmpty || !isNaN(currentNum))) {
      // Both are numeric (or current is empty/0) - do numeric addition
      const newValue = currentNum + addNum;
      const setResult = this.set(name, newValue);

      return {
        success: setResult.success,
        previousValue: currentValue,
        addedValue: addNum,
        newValue: setResult.success ? newValue : currentValue,
        error: setResult.error,
      };
    }

    // Fallback to string concatenation (original iMacros behavior)
    const newValue = currentStr + value;
    const setResult = this.set(name, newValue);

    return {
      success: setResult.success,
      previousValue: currentValue,
      addedValue: value,
      newValue: setResult.success ? newValue : currentValue,
      error: setResult.error,
    };
  }

  /**
   * Add data to the extract accumulator (for ADD !EXTRACT)
   * Matches original iMacros behavior: appends with [EXTRACT] delimiter
   */
  addExtractData(value: string): AddResult {
    const previousValue = this.systemVars.get('!EXTRACT') ?? null;

    if (this.extractAccumulator.length > 0) {
      // Append with [EXTRACT] delimiter
      this.extractAccumulator.push(value);
    } else {
      // First value - no delimiter
      this.extractAccumulator.push(value);
    }

    // Update both !EXTRACT and !EXTRACTADD
    const newValue = this.extractAccumulator.join('[EXTRACT]');
    this.systemVars.set('!EXTRACT', newValue);
    this.systemVars.set('!EXTRACTADD', newValue);

    return {
      success: true,
      previousValue,
      addedValue: value,
      newValue,
    };
  }

  /**
   * Set the loop counter
   */
  setLoop(value: number): void {
    this.systemVars.set('!LOOP', value);
  }

  /**
   * Get the current loop counter
   */
  getLoop(): number {
    const value = this.systemVars.get('!LOOP');
    return typeof value === 'number' ? value : 1;
  }

  /**
   * Increment the loop counter
   */
  incrementLoop(): number {
    const current = this.getLoop();
    const next = current + 1;
    this.setLoop(next);
    return next;
  }

  /**
   * Set datasource columns from CSV row
   */
  setDatasourceCols(columns: string[]): void {
    // Reset all columns first
    this.resetCols();

    // Set available columns
    for (let i = 0; i < columns.length && i < 10; i++) {
      const colName = `!COL${i + 1}` as ColName;
      this.systemVars.set(colName, columns[i] || '');
    }

    this.systemVars.set('!DATASOURCE_COLUMNS', columns.length);
  }

  /**
   * Set the datasource line number
   */
  setDatasourceLine(line: number): void {
    this.systemVars.set('!DATASOURCE_LINE', line);
  }

  /**
   * Set the datasource file path
   */
  setDatasource(path: string): void {
    this.systemVars.set('!DATASOURCE', path);
  }

  /**
   * Set the raw datasource rows for dynamic !COL resolution.
   * This enables original iMacros behavior where {{!COL1}} reads
   * directly from the datasource based on !DATASOURCE_LINE.
   */
  setDatasourceRows(rows: string[][]): void {
    this.datasourceRows = rows;
    // Update column count
    const maxCols = rows.reduce((max, row) => Math.max(max, row.length), 0);
    this.systemVars.set('!DATASOURCE_COLUMNS', maxCols);
  }

  /**
   * Get the raw datasource rows
   */
  getDatasourceRows(): string[][] | null {
    return this.datasourceRows;
  }

  /**
   * Get the total number of datasource rows
   */
  getDatasourceRowCount(): number {
    return this.datasourceRows?.length ?? 0;
  }

  /**
   * Set timeout values
   */
  setTimeout(type: 'page' | 'step' | 'default', seconds: number): void {
    switch (type) {
      case 'page':
        this.systemVars.set('!TIMEOUT_PAGE', seconds);
        break;
      case 'step':
        this.systemVars.set('!TIMEOUT_STEP', seconds);
        break;
      case 'default':
        this.systemVars.set('!TIMEOUT', seconds);
        break;
    }
  }

  /**
   * Get timeout value
   */
  getTimeout(type: 'page' | 'step' | 'default'): number {
    let varName: string;
    switch (type) {
      case 'page':
        varName = '!TIMEOUT_PAGE';
        break;
      case 'step':
        varName = '!TIMEOUT_STEP';
        break;
      case 'default':
        varName = '!TIMEOUT';
        break;
    }
    const value = this.systemVars.get(varName);
    return typeof value === 'number' ? value : 60;
  }

  /**
   * Set folder paths
   */
  setFolder(type: 'datasource' | 'download' | 'macros', path: string): void {
    switch (type) {
      case 'datasource':
        this.systemVars.set('!FOLDER_DATASOURCE', path);
        break;
      case 'download':
        this.systemVars.set('!FOLDER_DOWNLOAD', path);
        break;
      case 'macros':
        this.systemVars.set('!FOLDER_MACROS', path);
        break;
    }
  }

  /**
   * Set URL tracking variables
   */
  setUrl(type: 'start' | 'current', url: string): void {
    switch (type) {
      case 'start':
        this.systemVars.set('!URLSTART', url);
        break;
      case 'current':
        this.systemVars.set('!URLCURRENT', url);
        break;
    }
  }

  /**
   * Register a resolver for !URLCURRENT that returns the live browser URL.
   * When set, get('!URLCURRENT') calls this instead of returning the stored value.
   * This matches iMacros 8.9.7 behavior where document.location is read on every access.
   */
  setUrlCurrentResolver(resolver: (() => string) | null): void {
    this.urlCurrentResolver = resolver;
  }

  /**
   * Set clipboard content
   */
  setClipboard(content: string): void {
    this.systemVars.set('!CLIPBOARD', content);
  }

  /**
   * Get clipboard content
   */
  getClipboard(): string {
    return String(this.systemVars.get('!CLIPBOARD') || '');
  }

  /**
   * Get extract accumulator value (!EXTRACTADD)
   */
  getExtractAdd(): string {
    return this.extractAccumulator.join('[EXTRACT]');
  }

  /**
   * Get all extract values as array
   */
  getExtractArray(): string[] {
    return [...this.extractAccumulator];
  }

  /**
   * Expand variables in a string using {{var}} syntax
   */
  expand(text: string, options: ExpansionOptions = {}): ExpansionResult {
    const {
      strict = false,
      defaultValue = '',
      customResolver,
    } = options;

    // Step 1: Replace #novar#{{ with sentinel #NOVAR#{ to protect from expansion
    // (iMacros 8.9.7 MacroPlayer.js:4977)
    let processed = text.replace(/#novar#\{\{/gi, '#NOVAR#{');

    const variables = extractVariables(processed);
    if (variables.length === 0) {
      // Step 3: Restore sentinel #NOVAR#{ → {{ even when no variables found
      const expanded = processed.replace(/#NOVAR#\{(?=[^{])/g, '{{');
      return {
        expanded,
        hadVariables: false,
        unresolvedVariables: [],
      };
    }

    const unresolvedVariables: string[] = [];
    let result = processed;

    // Step 2: Process variables in reverse order to maintain correct positions
    for (let i = variables.length - 1; i >= 0; i--) {
      const varRef = variables[i];
      let value: VariableValue = null;

      // Try custom resolver first
      if (customResolver) {
        const resolved = customResolver(varRef.name);
        if (resolved !== undefined) {
          value = resolved;
        }
      }

      // Fall back to context lookup
      if (value === null) {
        value = this.get(varRef.name);
      }

      // Handle unresolved variables
      if (value === null) {
        unresolvedVariables.push(varRef.name);
        if (strict) {
          throw new Error(`Unresolved variable: ${varRef.name}`);
        }
        value = defaultValue;
      }

      // Replace in string
      result = result.slice(0, varRef.start) + String(value) + result.slice(varRef.end);
    }

    // Step 3: Restore sentinel #NOVAR#{ → {{ (iMacros 8.9.7 MacroPlayer.js:5067)
    result = result.replace(/#NOVAR#\{(?=[^{])/g, '{{');

    return {
      expanded: result,
      hadVariables: true,
      unresolvedVariables,
    };
  }

  /**
   * Get all system variables as a record
   * Includes dynamically resolved !COL1-10 values from datasource
   */
  getSystemVariables(): Record<string, VariableValue> {
    const result: Record<string, VariableValue> = {};
    for (const [key, value] of this.systemVars) {
      result[key] = value;
    }
    // Add dynamically resolved !COL values
    for (let i = 1; i <= 10; i++) {
      const colName = `!COL${i}`;
      result[colName] = this.resolveDatasourceColumn(i);
    }
    return result;
  }

  /**
   * Get all custom variables as a record
   */
  getCustomVariables(): Record<string, VariableValue> {
    const result: Record<string, VariableValue> = {};
    for (const [key, value] of this.customVars) {
      result[key] = value;
    }
    return result;
  }

  /**
   * Get all variables (system and custom) as a record
   */
  getAllVariables(): Record<string, VariableValue> {
    return {
      ...this.getSystemVariables(),
      ...this.getCustomVariables(),
    };
  }

  /**
   * Import variables from a record (useful for restoring state)
   */
  importVariables(vars: Record<string, VariableValue>): void {
    for (const [name, value] of Object.entries(vars)) {
      this.set(name, value);
    }
  }

  /**
   * Clone this context (create a deep copy)
   */
  clone(): VariableContext {
    const cloned = new VariableContext();
    cloned.systemVars = new Map(this.systemVars);
    cloned.customVars = new Map(this.customVars);
    cloned.extractAccumulator = [...this.extractAccumulator];
    // Share datasource rows reference (immutable data)
    cloned.datasourceRows = this.datasourceRows;
    return cloned;
  }
}

/**
 * Parse a SET command value
 * Handles special values like EVAL(), CONTENT, etc.
 */
export function parseSetValue(value: string): { type: 'literal' | 'eval' | 'content' | 'clipboard'; value: string } {
  const trimmed = value.trim();

  // Check for EVAL() expression
  if (trimmed.toUpperCase().startsWith('EVAL(') && trimmed.endsWith(')')) {
    return {
      type: 'eval',
      value: trimmed.slice(5, -1), // Extract content between EVAL( and )
    };
  }

  // Check for special keywords
  const upper = trimmed.toUpperCase();
  if (upper === 'CONTENT') {
    return { type: 'content', value: '' };
  }
  if (upper === '!CLIPBOARD') {
    return { type: 'clipboard', value: '' };
  }

  return { type: 'literal', value: trimmed };
}

/**
 * Evaluate an expression using the safe ExpressionEvaluator.
 * Supports arithmetic, string operations, Math.* preprocessing,
 * Date.now(), parseInt/parseFloat, and variable references.
 */
export function evaluateExpression(expr: string, context: VariableContext): number | string {
  // First expand any variables
  const { expanded } = context.expand(expr);

  // Clean up: strip trailing semicolons first, then wrapping quotes
  let cleaned = expanded.trim();
  cleaned = cleaned.replace(/;\s*$/, '');
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1);
  }
  // Unescape backslash-escaped quotes (common in EVAL strings)
  cleaned = cleaned.replace(/\\"/g, '"').replace(/\\'/g, "'");

  if (cleaned.trim() === '') {
    return 0;
  }

  // Preprocess Math.* and Date.now() etc.
  const preprocessed = preprocessMathExpressions(cleaned);

  // Evaluate using safe expression evaluator
  const evaluator = new ExpressionEvaluator();
  const result = evaluator.evaluate(preprocessed);

  if (result.success && result.value !== undefined) {
    return result.value as number | string;
  }

  // Fallback: try as simple arithmetic
  const sanitized = preprocessed.replace(/[^0-9+\-*/().%\s]/g, '');
  if (sanitized.trim() !== '') {
    try {
      // eslint-disable-next-line no-new-func
      const numResult = new Function(`return (${sanitized})`)();
      if (typeof numResult === 'number' && !isNaN(numResult)) {
        return numResult;
      }
    } catch {
      // fall through
    }
  }

  return 0;
}

/**
 * Execute a SET command
 */
export function executeSet(
  context: VariableContext,
  varName: string,
  value: string
): SetResult {
  const parsed = parseSetValue(value);

  switch (parsed.type) {
    case 'eval': {
      try {
        const result = evaluateExpression(parsed.value, context);
        return context.set(varName, result);
      } catch (e) {
        if ((e as any).name === 'MacroErrorSignal') {
          return {
            success: true,
            previousValue: context.get(varName),
            newValue: context.get(varName),
            macroError: true,
            errorMessage: (e as Error).message,
          } as SetResult & { macroError: boolean; errorMessage: string };
        }
        throw e;
      }
    }
    case 'clipboard': {
      const clipboardValue = context.getClipboard();
      return context.set(varName, clipboardValue);
    }
    case 'content':
    case 'literal': {
      // Expand any variables in the value first
      const { expanded } = context.expand(parsed.value);
      return context.set(varName, expanded);
    }
    default:
      return context.set(varName, value);
  }
}

/**
 * Execute an ADD command
 * Matches original iMacros 8.9.7 behavior:
 * - !EXTRACT: calls addExtractData() to append with [EXTRACT] delimiter
 * - !VAR0-9 and user vars: numeric addition if both values are numeric,
 *   otherwise string concatenation
 */
export function executeAdd(
  context: VariableContext,
  varName: string,
  value: string
): AddResult {
  // Expand any variables in the value
  const { expanded } = context.expand(value);
  const upperName = varName.toUpperCase();

  // Special handling for !EXTRACT - use addExtractData with [EXTRACT] delimiter
  if (upperName === '!EXTRACT') {
    return context.addExtractData(expanded);
  }

  // For all other variables, use add() which handles numeric vs string
  return context.add(varName, expanded);
}

/**
 * Create a new variable context with optional initial values
 */
export function createVariableContext(
  initialValues?: Record<string, VariableValue>
): VariableContext {
  const context = new VariableContext();
  if (initialValues) {
    context.importVariables(initialValues);
  }
  return context;
}

/**
 * Callback type for native JavaScript evaluation (via vm.runInNewContext in Node.js)
 * Used when expr-eval cannot handle the expression (e.g., JavaScript syntax)
 */
export type NativeEvalCallback = (expression: string) => Promise<{
  success: boolean;
  value: number | string;
  error?: string;
  isMacroError?: boolean;
}>;

/**
 * Async version of evaluateExpression that uses native JS evaluation
 * when available, falling back to expr-eval for environments without
 * a native host.
 *
 * Logic:
 * 1. If nativeEval is available, use it (matches original iMacros behavior)
 * 2. Otherwise fall back to expr-eval + sanitized arithmetic
 */
export async function evaluateExpressionAsync(
  expr: string,
  context: VariableContext,
  nativeEval?: NativeEvalCallback
): Promise<{ value: number | string; isMacroError?: boolean; errorMessage?: string }> {
  // First expand any variables
  const { expanded } = context.expand(expr);

  // Clean up: strip trailing semicolons first, then wrapping quotes
  let cleaned = expanded.trim();
  cleaned = cleaned.replace(/;\s*$/, '');
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1);
  }
  // Unescape backslash-escaped quotes (common in EVAL strings)
  cleaned = cleaned.replace(/\\"/g, '"').replace(/\\'/g, "'");

  if (cleaned.trim() === '') {
    return { value: 0 };
  }

  // If nativeEval is available, always use it (matches original iMacros
  // evalInSandbox behavior — full JavaScript evaluation)
  if (nativeEval) {
    try {
      const nativeResult = await nativeEval(cleaned);
      if (nativeResult.success) {
        return { value: nativeResult.value };
      }
      if (nativeResult.isMacroError) {
        return {
          value: 0,
          isMacroError: true,
          errorMessage: nativeResult.error
        };
      }
    } catch (e) {
      // Native eval failed, fall through to expr-eval fallback
    }
  }

  // Fallback: expr-eval for environments without native host
  const preprocessed = preprocessMathExpressions(cleaned);

  const evaluator = new ExpressionEvaluator();
  const result = evaluator.evaluate(preprocessed);

  if (result.success && result.value !== undefined) {
    return { value: result.value as number | string };
  }

  // Last resort: sanitized arithmetic
  const sanitized = preprocessed.replace(/[^0-9+\-*/().%\s]/g, '');
  if (sanitized.trim() !== '') {
    try {
      // eslint-disable-next-line no-new-func
      const numResult = new Function(`return (${sanitized})`)();
      if (typeof numResult === 'number' && !isNaN(numResult)) {
        return { value: numResult };
      }
    } catch {
      // fall through
    }
  }

  // All evaluation methods failed, return 0 as fallback
  return { value: 0 };
}

/**
 * Async version of executeSet that supports native JavaScript evaluation
 */
export async function executeSetAsync(
  context: VariableContext,
  varName: string,
  value: string,
  nativeEval?: NativeEvalCallback
): Promise<SetResult & { macroError?: boolean; errorMessage?: string }> {
  const parsed = parseSetValue(value);

  switch (parsed.type) {
    case 'eval': {
      try {
        const result = await evaluateExpressionAsync(parsed.value, context, nativeEval);
        if (result.isMacroError) {
          return {
            success: true,
            previousValue: context.get(varName),
            newValue: context.get(varName),
            macroError: true,
            errorMessage: result.errorMessage,
          };
        }
        return context.set(varName, result.value);
      } catch (e) {
        if ((e as any).name === 'MacroErrorSignal') {
          return {
            success: true,
            previousValue: context.get(varName),
            newValue: context.get(varName),
            macroError: true,
            errorMessage: (e as Error).message,
          };
        }
        throw e;
      }
    }
    case 'clipboard': {
      const clipboardValue = context.getClipboard();
      return context.set(varName, clipboardValue);
    }
    case 'content':
    case 'literal': {
      // Expand any variables in the value first
      const { expanded } = context.expand(parsed.value);
      return context.set(varName, expanded);
    }
    default:
      return context.set(varName, value);
  }
}

// Re-export types from parser for convenience
export { extractVariables, SYSTEM_VARIABLES } from './parser';
export type { VariableReference, SystemVariable } from './parser';
