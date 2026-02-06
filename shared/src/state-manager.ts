/**
 * iMacros State Manager
 *
 * Tracks macro execution state including:
 * - Current line number
 * - Loop counter
 * - Variables (system and custom)
 * - Extract data
 * - Error code
 *
 * Supports serialization/deserialization for persistence and resume functionality.
 */

import { VariableContext, VariableValue, createVariableContext } from './variables';

/**
 * Error codes for macro execution
 */
export enum ErrorCode {
  OK = 0,
  SYNTAX_ERROR = -910,
  ELEMENT_NOT_FOUND = -920,
  TIMEOUT = -930,
  FRAME_ERROR = -940,
  DOWNLOAD_ERROR = -950,
  FILE_ERROR = -960,
  SCRIPT_ERROR = -970,
  DATASOURCE_ERROR = -980,
  LOOP_LIMIT = -990,
  USER_ABORT = -100,
  UNKNOWN_ERROR = -999,
}

/**
 * Execution status of the macro
 */
export enum ExecutionStatus {
  /** Not started */
  IDLE = 'idle',
  /** Currently running */
  RUNNING = 'running',
  /** Paused (can resume) */
  PAUSED = 'paused',
  /** Completed successfully */
  COMPLETED = 'completed',
  /** Stopped due to error */
  ERROR = 'error',
  /** Stopped by user */
  ABORTED = 'aborted',
}

/**
 * Serializable state representation
 */
export interface SerializedState {
  /** Version for future compatibility */
  version: number;
  /** Current line number (1-based) */
  currentLine: number;
  /** Total lines in macro */
  totalLines: number;
  /** Current loop iteration (1-based) */
  loopCounter: number;
  /** Maximum loop iterations */
  maxLoops: number;
  /** System variables */
  systemVariables: Record<string, VariableValue>;
  /** Custom/user variables */
  customVariables: Record<string, VariableValue>;
  /** Extracted data array */
  extractData: string[];
  /** Error code */
  errorCode: ErrorCode;
  /** Error message if any */
  errorMessage: string | null;
  /** Execution status */
  status: ExecutionStatus;
  /** Macro name/path */
  macroName: string;
  /** Start time (ISO string) */
  startTime: string | null;
  /** Last update time (ISO string) */
  lastUpdateTime: string;
  /** Execution time in milliseconds */
  executionTimeMs: number;
}

/**
 * State snapshot for debugging/history
 */
export interface StateSnapshot {
  /** Snapshot timestamp */
  timestamp: string;
  /** Line number when snapshot was taken */
  line: number;
  /** Loop counter when snapshot was taken */
  loop: number;
  /** Status at snapshot time */
  status: ExecutionStatus;
  /** Copy of variables at snapshot time */
  variables: Record<string, VariableValue>;
  /** Error code at snapshot time */
  errorCode: ErrorCode;
  /** Optional note/label for the snapshot */
  note?: string;
}

/**
 * Options for state manager initialization
 */
export interface StateManagerOptions {
  /** Macro name/path */
  macroName?: string;
  /** Total lines in the macro */
  totalLines?: number;
  /** Maximum loop iterations */
  maxLoops?: number;
  /** Maximum snapshots to keep (default: 100) */
  maxSnapshots?: number;
  /** Initial variable values */
  initialVariables?: Record<string, VariableValue>;
}

/**
 * Current state version for serialization compatibility
 */
const STATE_VERSION = 1;

/**
 * State Manager for iMacros macro execution
 *
 * Tracks all execution state and provides serialization for persistence.
 */
export class StateManager {
  /** Variable context for system and custom variables */
  private variables: VariableContext;
  /** Current line number (1-based) */
  private currentLine: number;
  /** Total lines in macro */
  private totalLines: number;
  /** Maximum loop iterations */
  private maxLoops: number;
  /** Extracted data accumulator */
  private extractData: string[];
  /** Current error code */
  private errorCode: ErrorCode;
  /** Current error message */
  private errorMessage: string | null;
  /** Execution status */
  private status: ExecutionStatus;
  /** Macro name/path */
  private macroName: string;
  /** Start time */
  private startTime: Date | null;
  /** Last update time */
  private lastUpdateTime: Date;
  /** Accumulated execution time in ms */
  private executionTimeMs: number;
  /** State snapshots for debugging */
  private snapshots: StateSnapshot[];
  /** Maximum snapshots to retain */
  private maxSnapshots: number;

  constructor(options: StateManagerOptions = {}) {
    this.macroName = options.macroName || '';
    this.totalLines = options.totalLines || 0;
    this.maxLoops = options.maxLoops || 1;
    this.maxSnapshots = options.maxSnapshots || 100;

    this.variables = createVariableContext(options.initialVariables);
    this.currentLine = 0;
    this.extractData = [];
    this.errorCode = ErrorCode.OK;
    this.errorMessage = null;
    this.status = ExecutionStatus.IDLE;
    this.startTime = null;
    this.lastUpdateTime = new Date();
    this.executionTimeMs = 0;
    this.snapshots = [];
  }

  // ===== Line Management =====

  /**
   * Get current line number (1-based)
   */
  getCurrentLine(): number {
    return this.currentLine;
  }

  /**
   * Set current line number
   */
  setCurrentLine(line: number): void {
    this.currentLine = line;
    this.updateTimestamp();
  }

  /**
   * Advance to next line
   */
  nextLine(): number {
    this.currentLine++;
    this.updateTimestamp();
    return this.currentLine;
  }

  /**
   * Jump to a specific line (for GOTO)
   */
  jumpToLine(line: number): void {
    if (line < 1 || line > this.totalLines) {
      throw new Error(`Invalid line number: ${line}. Valid range: 1-${this.totalLines}`);
    }
    this.currentLine = line;
    this.updateTimestamp();
  }

  /**
   * Check if at end of macro
   */
  isAtEnd(): boolean {
    return this.currentLine >= this.totalLines;
  }

  /**
   * Get total lines
   */
  getTotalLines(): number {
    return this.totalLines;
  }

  /**
   * Set total lines
   */
  setTotalLines(total: number): void {
    this.totalLines = total;
  }

  // ===== Loop Management =====

  /**
   * Get current loop counter
   */
  getLoopCounter(): number {
    return this.variables.getLoop();
  }

  /**
   * Set loop counter
   */
  setLoopCounter(value: number): void {
    this.variables.setLoop(value);
    this.updateTimestamp();
  }

  /**
   * Increment loop counter
   */
  incrementLoop(): number {
    const newValue = this.variables.incrementLoop();
    this.updateTimestamp();
    return newValue;
  }

  /**
   * Get max loops
   */
  getMaxLoops(): number {
    return this.maxLoops;
  }

  /**
   * Set max loops
   */
  setMaxLoops(max: number): void {
    this.maxLoops = max;
  }

  /**
   * Check if loop limit reached
   */
  isLoopLimitReached(): boolean {
    return this.variables.getLoop() > this.maxLoops;
  }

  /**
   * Reset loop for new iteration (go back to line 1)
   */
  resetForNextLoop(): void {
    this.currentLine = 0;
    this.updateTimestamp();
  }

  // ===== Variable Management =====

  /**
   * Get the variable context
   */
  getVariables(): VariableContext {
    return this.variables;
  }

  /**
   * Get a variable value
   */
  getVariable(name: string): VariableValue {
    return this.variables.get(name);
  }

  /**
   * Set a variable value
   */
  setVariable(name: string, value: VariableValue): void {
    this.variables.set(name, value);
    this.updateTimestamp();
  }

  /**
   * Get all variables as a record
   */
  getAllVariables(): Record<string, VariableValue> {
    return this.variables.getAllVariables();
  }

  // ===== Extract Data Management =====

  /**
   * Add extracted data
   */
  addExtract(data: string): void {
    this.extractData.push(data);
    this.variables.set('!EXTRACT', data);
    this.updateTimestamp();
  }

  /**
   * Get all extracted data
   */
  getExtractData(): string[] {
    return [...this.extractData];
  }

  /**
   * Get extract data as combined string (with [EXTRACT] separator)
   */
  getExtractString(): string {
    return this.extractData.join('[EXTRACT]');
  }

  /**
   * Clear extract data
   */
  clearExtract(): void {
    this.extractData = [];
    this.variables.resetExtract();
    this.updateTimestamp();
  }

  // ===== Error Management =====

  /**
   * Get current error code
   */
  getErrorCode(): ErrorCode {
    return this.errorCode;
  }

  /**
   * Get error message
   */
  getErrorMessage(): string | null {
    return this.errorMessage;
  }

  /**
   * Set error state
   */
  setError(code: ErrorCode, message?: string): void {
    this.errorCode = code;
    this.errorMessage = message || null;
    if (code !== ErrorCode.OK) {
      this.status = ExecutionStatus.ERROR;
    }
    this.updateTimestamp();
  }

  /**
   * Clear error state
   */
  clearError(): void {
    this.errorCode = ErrorCode.OK;
    this.errorMessage = null;
    if (this.status === ExecutionStatus.ERROR) {
      this.status = ExecutionStatus.PAUSED;
    }
    this.updateTimestamp();
  }

  /**
   * Check if in error state
   */
  hasError(): boolean {
    return this.errorCode !== ErrorCode.OK;
  }

  // ===== Status Management =====

  /**
   * Get execution status
   */
  getStatus(): ExecutionStatus {
    return this.status;
  }

  /**
   * Set execution status
   */
  setStatus(status: ExecutionStatus): void {
    this.status = status;
    this.updateTimestamp();

    if (status === ExecutionStatus.RUNNING && !this.startTime) {
      this.startTime = new Date();
    }
  }

  /**
   * Start execution
   */
  start(): void {
    this.status = ExecutionStatus.RUNNING;
    this.startTime = new Date();
    this.currentLine = 1;
    this.updateTimestamp();
  }

  /**
   * Pause execution
   */
  pause(): void {
    if (this.status === ExecutionStatus.RUNNING) {
      this.status = ExecutionStatus.PAUSED;
      this.updateExecutionTime();
      this.updateTimestamp();
    }
  }

  /**
   * Resume execution
   */
  resume(): void {
    if (this.status === ExecutionStatus.PAUSED) {
      this.status = ExecutionStatus.RUNNING;
      this.startTime = new Date(); // Reset start for timing
      this.updateTimestamp();
    }
  }

  /**
   * Complete execution
   */
  complete(): void {
    this.status = ExecutionStatus.COMPLETED;
    this.updateExecutionTime();
    this.updateTimestamp();
  }

  /**
   * Abort execution
   */
  abort(): void {
    this.status = ExecutionStatus.ABORTED;
    this.errorCode = ErrorCode.USER_ABORT;
    this.errorMessage = 'Execution aborted by user';
    this.updateExecutionTime();
    this.updateTimestamp();
  }

  /**
   * Check if execution can continue
   */
  canContinue(): boolean {
    return this.status === ExecutionStatus.RUNNING && !this.hasError();
  }

  // ===== Timing =====

  /**
   * Get execution time in milliseconds
   */
  getExecutionTimeMs(): number {
    if (this.status === ExecutionStatus.RUNNING && this.startTime) {
      return this.executionTimeMs + (Date.now() - this.startTime.getTime());
    }
    return this.executionTimeMs;
  }

  /**
   * Get formatted execution time
   */
  getExecutionTimeFormatted(): string {
    const ms = this.getExecutionTimeMs();
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}.${Math.floor((ms % 1000) / 100)}s`;
  }

  private updateExecutionTime(): void {
    if (this.startTime) {
      this.executionTimeMs += Date.now() - this.startTime.getTime();
      this.startTime = null;
    }
  }

  private updateTimestamp(): void {
    this.lastUpdateTime = new Date();
  }

  // ===== Macro Info =====

  /**
   * Get macro name
   */
  getMacroName(): string {
    return this.macroName;
  }

  /**
   * Set macro name
   */
  setMacroName(name: string): void {
    this.macroName = name;
  }

  // ===== Serialization =====

  /**
   * Serialize state to JSON-compatible object
   */
  serialize(): SerializedState {
    return {
      version: STATE_VERSION,
      currentLine: this.currentLine,
      totalLines: this.totalLines,
      loopCounter: this.variables.getLoop(),
      maxLoops: this.maxLoops,
      systemVariables: this.variables.getSystemVariables(),
      customVariables: this.variables.getCustomVariables(),
      extractData: [...this.extractData],
      errorCode: this.errorCode,
      errorMessage: this.errorMessage,
      status: this.status,
      macroName: this.macroName,
      startTime: this.startTime?.toISOString() || null,
      lastUpdateTime: this.lastUpdateTime.toISOString(),
      executionTimeMs: this.getExecutionTimeMs(),
    };
  }

  /**
   * Serialize state to JSON string
   */
  toJSON(): string {
    return JSON.stringify(this.serialize(), null, 2);
  }

  /**
   * Deserialize state from object
   */
  static deserialize(data: SerializedState): StateManager {
    // Version check for future compatibility
    if (data.version > STATE_VERSION) {
      console.warn(`State version ${data.version} is newer than supported version ${STATE_VERSION}`);
    }

    const manager = new StateManager({
      macroName: data.macroName,
      totalLines: data.totalLines,
      maxLoops: data.maxLoops,
    });

    manager.currentLine = data.currentLine;
    manager.extractData = [...data.extractData];
    manager.errorCode = data.errorCode;
    manager.errorMessage = data.errorMessage;
    manager.status = data.status;
    manager.executionTimeMs = data.executionTimeMs;
    manager.lastUpdateTime = new Date(data.lastUpdateTime);

    if (data.startTime) {
      manager.startTime = new Date(data.startTime);
    }

    // Restore variables
    manager.variables.importVariables(data.systemVariables);
    manager.variables.importVariables(data.customVariables);
    manager.variables.setLoop(data.loopCounter);

    return manager;
  }

  /**
   * Deserialize state from JSON string
   */
  static fromJSON(json: string): StateManager {
    const data = JSON.parse(json) as SerializedState;
    return StateManager.deserialize(data);
  }

  // ===== State Reset =====

  /**
   * Reset state completely
   */
  reset(): void {
    this.variables.reset();
    this.currentLine = 0;
    this.extractData = [];
    this.errorCode = ErrorCode.OK;
    this.errorMessage = null;
    this.status = ExecutionStatus.IDLE;
    this.startTime = null;
    this.executionTimeMs = 0;
    this.snapshots = [];
    this.updateTimestamp();
  }

  /**
   * Reset for new execution (keeps macro info, clears runtime state)
   */
  resetForExecution(): void {
    this.variables.reset();
    this.currentLine = 0;
    this.extractData = [];
    this.errorCode = ErrorCode.OK;
    this.errorMessage = null;
    this.status = ExecutionStatus.IDLE;
    this.startTime = null;
    this.executionTimeMs = 0;
    this.updateTimestamp();
  }

  /**
   * Soft reset (clear errors, keep variables)
   */
  softReset(): void {
    this.errorCode = ErrorCode.OK;
    this.errorMessage = null;
    if (this.status === ExecutionStatus.ERROR) {
      this.status = ExecutionStatus.PAUSED;
    }
    this.updateTimestamp();
  }

  // ===== Snapshots =====

  /**
   * Create a state snapshot for debugging
   */
  createSnapshot(note?: string): StateSnapshot {
    const snapshot: StateSnapshot = {
      timestamp: new Date().toISOString(),
      line: this.currentLine,
      loop: this.variables.getLoop(),
      status: this.status,
      variables: this.variables.getAllVariables(),
      errorCode: this.errorCode,
      note,
    };

    this.snapshots.push(snapshot);

    // Trim old snapshots if exceeding max
    while (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    return snapshot;
  }

  /**
   * Get all snapshots
   */
  getSnapshots(): StateSnapshot[] {
    return [...this.snapshots];
  }

  /**
   * Get the most recent snapshot
   */
  getLastSnapshot(): StateSnapshot | null {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null;
  }

  /**
   * Clear all snapshots
   */
  clearSnapshots(): void {
    this.snapshots = [];
  }

  /**
   * Restore state from a snapshot
   */
  restoreFromSnapshot(snapshot: StateSnapshot): void {
    this.currentLine = snapshot.line;
    this.variables.setLoop(snapshot.loop);
    this.errorCode = snapshot.errorCode;
    this.status = snapshot.status;

    // Restore variables
    this.variables.reset();
    this.variables.importVariables(snapshot.variables);

    this.updateTimestamp();
  }

  // ===== Clone =====

  /**
   * Create a deep copy of this state manager
   */
  clone(): StateManager {
    const cloned = StateManager.deserialize(this.serialize());
    cloned.snapshots = this.snapshots.map(s => ({ ...s, variables: { ...s.variables } }));
    cloned.maxSnapshots = this.maxSnapshots;
    return cloned;
  }

  // ===== Debug/Info =====

  /**
   * Get a summary of current state for debugging
   */
  getSummary(): string {
    const lines = [
      `Macro: ${this.macroName || '(unnamed)'}`,
      `Status: ${this.status}`,
      `Line: ${this.currentLine}/${this.totalLines}`,
      `Loop: ${this.variables.getLoop()}/${this.maxLoops}`,
      `Error: ${this.errorCode === ErrorCode.OK ? 'None' : `${this.errorCode} - ${this.errorMessage}`}`,
      `Time: ${this.getExecutionTimeFormatted()}`,
      `Extracts: ${this.extractData.length}`,
    ];
    return lines.join('\n');
  }
}

/**
 * Create a new state manager with default options
 */
export function createStateManager(options?: StateManagerOptions): StateManager {
  return new StateManager(options);
}

/**
 * Check if an object is a valid serialized state
 */
export function isSerializedState(obj: unknown): obj is SerializedState {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const state = obj as Record<string, unknown>;

  return (
    typeof state.version === 'number' &&
    typeof state.currentLine === 'number' &&
    typeof state.loopCounter === 'number' &&
    typeof state.status === 'string' &&
    typeof state.lastUpdateTime === 'string' &&
    Array.isArray(state.extractData)
  );
}
