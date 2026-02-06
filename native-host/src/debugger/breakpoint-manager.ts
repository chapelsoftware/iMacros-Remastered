/**
 * Breakpoint Manager for JavaScript Macro Debugger
 *
 * Handles setting, clearing, and tracking breakpoints for the JS debugger.
 * Breakpoints are identified by line and optional column position.
 */
import { EventEmitter } from 'events';

/**
 * Represents a single breakpoint in the code
 */
export interface Breakpoint {
  /** Unique identifier for the breakpoint */
  id: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (0-indexed, optional) */
  column?: number;
  /** Whether the breakpoint is currently enabled */
  enabled: boolean;
  /** Optional condition that must evaluate to true for the breakpoint to trigger */
  condition?: string;
  /** Optional hit count - breakpoint triggers only after this many hits */
  hitCount?: number;
  /** Current number of times this breakpoint has been hit */
  hits: number;
  /** Optional log message to print instead of breaking */
  logMessage?: string;
}

/**
 * Options for creating a breakpoint
 */
export interface BreakpointOptions {
  /** Line number (1-indexed) */
  line: number;
  /** Column number (0-indexed, optional) */
  column?: number;
  /** Optional condition expression */
  condition?: string;
  /** Optional hit count threshold */
  hitCount?: number;
  /** Optional log message (logpoint) */
  logMessage?: string;
}

/**
 * Result of hitting a breakpoint
 */
export interface BreakpointHitResult {
  /** The breakpoint that was hit */
  breakpoint: Breakpoint;
  /** Whether execution should pause */
  shouldPause: boolean;
  /** Optional log message to output */
  logOutput?: string;
}

/**
 * Manages breakpoints for the JavaScript debugger
 */
export class BreakpointManager extends EventEmitter {
  private breakpoints: Map<string, Breakpoint> = new Map();
  private breakpointsByLine: Map<number, Set<string>> = new Map();
  private nextBreakpointId: number = 1;

  /**
   * Generate a unique breakpoint ID
   */
  private generateId(): string {
    return `bp_${this.nextBreakpointId++}`;
  }

  /**
   * Create a key for looking up breakpoints by line/column
   */
  private makeLocationKey(line: number, column?: number): string {
    return column !== undefined ? `${line}:${column}` : `${line}`;
  }

  /**
   * Add a new breakpoint
   *
   * @param options - Breakpoint configuration
   * @returns The created breakpoint
   */
  addBreakpoint(options: BreakpointOptions): Breakpoint {
    const id = this.generateId();
    const breakpoint: Breakpoint = {
      id,
      line: options.line,
      column: options.column,
      enabled: true,
      condition: options.condition,
      hitCount: options.hitCount,
      hits: 0,
      logMessage: options.logMessage,
    };

    this.breakpoints.set(id, breakpoint);

    // Index by line for fast lookup during execution
    if (!this.breakpointsByLine.has(options.line)) {
      this.breakpointsByLine.set(options.line, new Set());
    }
    this.breakpointsByLine.get(options.line)!.add(id);

    this.emit('breakpointAdded', breakpoint);
    return breakpoint;
  }

  /**
   * Remove a breakpoint by ID
   *
   * @param id - Breakpoint ID to remove
   * @returns True if breakpoint was removed, false if not found
   */
  removeBreakpoint(id: string): boolean {
    const breakpoint = this.breakpoints.get(id);
    if (!breakpoint) {
      return false;
    }

    this.breakpoints.delete(id);

    // Remove from line index
    const lineSet = this.breakpointsByLine.get(breakpoint.line);
    if (lineSet) {
      lineSet.delete(id);
      if (lineSet.size === 0) {
        this.breakpointsByLine.delete(breakpoint.line);
      }
    }

    this.emit('breakpointRemoved', breakpoint);
    return true;
  }

  /**
   * Clear all breakpoints
   */
  clearAll(): void {
    const removed = Array.from(this.breakpoints.values());
    this.breakpoints.clear();
    this.breakpointsByLine.clear();

    for (const bp of removed) {
      this.emit('breakpointRemoved', bp);
    }

    this.emit('allBreakpointsCleared');
  }

  /**
   * Enable or disable a breakpoint
   *
   * @param id - Breakpoint ID
   * @param enabled - Whether to enable or disable
   * @returns True if breakpoint was found and updated
   */
  setEnabled(id: string, enabled: boolean): boolean {
    const breakpoint = this.breakpoints.get(id);
    if (!breakpoint) {
      return false;
    }

    breakpoint.enabled = enabled;
    this.emit('breakpointUpdated', breakpoint);
    return true;
  }

  /**
   * Update a breakpoint's condition
   *
   * @param id - Breakpoint ID
   * @param condition - New condition expression (undefined to clear)
   * @returns True if breakpoint was found and updated
   */
  setCondition(id: string, condition?: string): boolean {
    const breakpoint = this.breakpoints.get(id);
    if (!breakpoint) {
      return false;
    }

    breakpoint.condition = condition;
    this.emit('breakpointUpdated', breakpoint);
    return true;
  }

  /**
   * Get a breakpoint by ID
   *
   * @param id - Breakpoint ID
   * @returns The breakpoint or undefined if not found
   */
  getBreakpoint(id: string): Breakpoint | undefined {
    return this.breakpoints.get(id);
  }

  /**
   * Get all breakpoints
   *
   * @returns Array of all breakpoints
   */
  getAllBreakpoints(): Breakpoint[] {
    return Array.from(this.breakpoints.values());
  }

  /**
   * Get breakpoints at a specific line
   *
   * @param line - Line number (1-indexed)
   * @returns Array of breakpoints at that line
   */
  getBreakpointsAtLine(line: number): Breakpoint[] {
    const ids = this.breakpointsByLine.get(line);
    if (!ids) {
      return [];
    }

    return Array.from(ids)
      .map((id) => this.breakpoints.get(id)!)
      .filter((bp) => bp !== undefined);
  }

  /**
   * Check if there's any breakpoint at a line
   *
   * @param line - Line number (1-indexed)
   * @returns True if there's at least one breakpoint at this line
   */
  hasBreakpointAtLine(line: number): boolean {
    return this.breakpointsByLine.has(line);
  }

  /**
   * Check if execution should pause at a location
   *
   * @param line - Current line number (1-indexed)
   * @param column - Current column (0-indexed, optional)
   * @param evaluateCondition - Function to evaluate condition expressions
   * @returns Result indicating whether to pause and any log output
   */
  async checkBreakpoint(
    line: number,
    column?: number,
    evaluateCondition?: (condition: string) => Promise<boolean>
  ): Promise<BreakpointHitResult | null> {
    const breakpoints = this.getBreakpointsAtLine(line);
    if (breakpoints.length === 0) {
      return null;
    }

    for (const bp of breakpoints) {
      // Skip disabled breakpoints
      if (!bp.enabled) {
        continue;
      }

      // Check column if specified
      if (bp.column !== undefined && column !== undefined && bp.column !== column) {
        continue;
      }

      // Increment hit counter
      bp.hits++;

      // Check hit count condition
      if (bp.hitCount !== undefined && bp.hits < bp.hitCount) {
        continue;
      }

      // Check condition if specified
      if (bp.condition && evaluateCondition) {
        try {
          const conditionMet = await evaluateCondition(bp.condition);
          if (!conditionMet) {
            continue;
          }
        } catch (error) {
          // Condition evaluation failed - treat as not met
          continue;
        }
      }

      // If this is a logpoint, don't pause but return log message
      if (bp.logMessage) {
        this.emit('breakpointHit', bp, false);
        return {
          breakpoint: bp,
          shouldPause: false,
          logOutput: bp.logMessage,
        };
      }

      // Regular breakpoint - should pause
      this.emit('breakpointHit', bp, true);
      return {
        breakpoint: bp,
        shouldPause: true,
      };
    }

    return null;
  }

  /**
   * Reset hit counts for all breakpoints
   */
  resetHitCounts(): void {
    for (const bp of this.breakpoints.values()) {
      bp.hits = 0;
    }
  }

  /**
   * Get the total number of breakpoints
   */
  get count(): number {
    return this.breakpoints.size;
  }

  /**
   * Serialize breakpoints to JSON-compatible format
   */
  toJSON(): Breakpoint[] {
    return this.getAllBreakpoints();
  }

  /**
   * Load breakpoints from serialized format
   *
   * @param breakpoints - Array of breakpoints to load
   */
  fromJSON(breakpoints: Breakpoint[]): void {
    this.clearAll();
    for (const bp of breakpoints) {
      const newBp = this.addBreakpoint({
        line: bp.line,
        column: bp.column,
        condition: bp.condition,
        hitCount: bp.hitCount,
        logMessage: bp.logMessage,
      });
      newBp.enabled = bp.enabled;
    }
  }
}

export default BreakpointManager;
