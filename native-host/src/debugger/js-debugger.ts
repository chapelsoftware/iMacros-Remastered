/**
 * JavaScript Macro Debugger
 *
 * Main debugger class for step-through debugging of JavaScript macros.
 * Provides breakpoints, variable inspection, call stack tracking, and
 * integration with iMacros Scripting Interface (iimPlay, iimSet, iimGetLastExtract).
 */
import { EventEmitter } from 'events';
import { BreakpointManager, Breakpoint, BreakpointOptions, BreakpointHitResult } from './breakpoint-manager';
import { CodeInstrumenter, InstrumentResult, FunctionInfo, SyntaxValidationError } from './code-instrumenter';

/**
 * Debugger execution state
 */
export enum DebuggerState {
  /** Not running any code */
  Idle = 'idle',
  /** Currently executing code */
  Running = 'running',
  /** Paused at a breakpoint or step */
  Paused = 'paused',
  /** Stepping to the next statement */
  Stepping = 'stepping',
}

/**
 * Step type for stepping operations
 */
export enum StepType {
  /** Step to next statement (step over) */
  Over = 'over',
  /** Step into function call */
  Into = 'into',
  /** Step out of current function */
  Out = 'out',
}

/**
 * Call stack frame
 */
export interface StackFrame {
  /** Frame ID */
  id: number;
  /** Function name */
  functionName: string;
  /** Current line in the function */
  line: number;
  /** Current column */
  column: number;
  /** Local variables in this frame */
  locals: Map<string, any>;
  /** Scope chain for variable lookup */
  scopes: ScopeInfo[];
}

/**
 * Scope information for variable inspection
 */
export interface ScopeInfo {
  /** Scope type */
  type: 'local' | 'closure' | 'global';
  /** Variables in this scope */
  variables: Map<string, any>;
}

/**
 * Variable value with type information
 */
export interface VariableValue {
  /** Variable name */
  name: string;
  /** Variable value (may be truncated for large objects) */
  value: any;
  /** JavaScript type */
  type: string;
  /** Whether the value is expandable (object/array) */
  expandable: boolean;
}

/**
 * Pause event data
 */
export interface PauseEventData {
  /** Reason for pause */
  reason: 'breakpoint' | 'step' | 'exception' | 'debugger';
  /** Current line number */
  line: number;
  /** Current column */
  column: number;
  /** Breakpoint that triggered pause (if applicable) */
  breakpoint?: Breakpoint;
  /** Exception that triggered pause (if applicable) */
  exception?: Error;
  /** Current call stack */
  callStack: StackFrame[];
}

/**
 * Configuration for the debugger
 */
export interface DebuggerConfig {
  /** Maximum depth for variable expansion */
  maxVariableDepth: number;
  /** Maximum string length before truncation */
  maxStringLength: number;
  /** Whether to pause on exceptions */
  pauseOnExceptions: boolean;
  /** Whether to pause on uncaught exceptions only */
  pauseOnUncaughtOnly: boolean;
}

/**
 * iMacros Scripting Interface integration
 */
export interface IimInterface {
  /** Play a macro */
  iimPlay(macroName: string): Promise<number>;
  /** Set a variable */
  iimSet(name: string, value: string): number;
  /** Get the last extracted data */
  iimGetLastExtract(): string;
  /** Get the last error */
  iimGetLastError(): string;
}

/**
 * Result of macro execution
 */
export interface ExecutionResult {
  /** Whether execution completed successfully */
  success: boolean;
  /** Return value (if any) */
  returnValue?: any;
  /** Error (if execution failed) */
  error?: Error;
  /** Extracted data from iimGetLastExtract */
  extractedData?: string;
}

/**
 * Default debugger configuration
 */
const DEFAULT_CONFIG: DebuggerConfig = {
  maxVariableDepth: 3,
  maxStringLength: 1000,
  pauseOnExceptions: true,
  pauseOnUncaughtOnly: false,
};

/**
 * JavaScript Macro Debugger
 *
 * Provides full debugging capabilities for JavaScript macros including:
 * - Step-through execution (step over, step into, step out)
 * - Breakpoint management (line, conditional, hit count, logpoints)
 * - Variable inspection at any scope level
 * - Call stack tracking
 * - Integration with iMacros Scripting Interface
 */
export class JSDebugger extends EventEmitter {
  private config: DebuggerConfig;
  private breakpointManager: BreakpointManager;
  private instrumenter: CodeInstrumenter;
  private state: DebuggerState = DebuggerState.Idle;
  private callStack: StackFrame[] = [];
  private currentFrameId: number = 0;
  private pauseRequested: boolean = false;
  private stepType: StepType | null = null;
  private stepStartDepth: number = 0;
  private instrumentedCode: InstrumentResult | null = null;
  private globalScope: Map<string, any> = new Map();
  private iimInterface: IimInterface | null = null;
  private lastExtract: string = '';
  private lastError: string = '';
  private variables: Map<string, string> = new Map();
  private continueResolve: (() => void) | null = null;

  constructor(config: Partial<DebuggerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.breakpointManager = new BreakpointManager();
    this.instrumenter = new CodeInstrumenter({
      debugHookName: '__debugHook__',
      instrumentFunctionEntry: true,
      instrumentFunctionExit: true,
      preserveLocations: true,
    });

    // Forward breakpoint events
    this.breakpointManager.on('breakpointAdded', (bp) => this.emit('breakpointAdded', bp));
    this.breakpointManager.on('breakpointRemoved', (bp) => this.emit('breakpointRemoved', bp));
    this.breakpointManager.on('breakpointUpdated', (bp) => this.emit('breakpointUpdated', bp));
  }

  /**
   * Get current debugger state
   */
  getState(): DebuggerState {
    return this.state;
  }

  /**
   * Set the iMacros interface for iimPlay, iimSet, etc.
   */
  setIimInterface(iface: IimInterface): void {
    this.iimInterface = iface;
  }

  /**
   * Load and prepare JavaScript code for debugging
   *
   * @param code - The JavaScript source code
   * @returns Syntax error if code is invalid, null otherwise
   */
  loadCode(code: string): SyntaxValidationError | null {
    const syntaxError = this.instrumenter.validateSyntax(code);
    if (syntaxError) {
      return syntaxError;
    }

    this.instrumentedCode = this.instrumenter.instrument(code);
    this.emit('codeLoaded', {
      breakpointLines: this.instrumentedCode.breakpointLines,
      functions: this.instrumentedCode.functions,
    });

    return null;
  }

  /**
   * Get valid breakpoint lines for the loaded code
   */
  getBreakpointLines(): number[] {
    return this.instrumentedCode?.breakpointLines || [];
  }

  /**
   * Get function information for the loaded code
   */
  getFunctions(): FunctionInfo[] {
    return this.instrumentedCode?.functions || [];
  }

  // ============================================
  // Breakpoint Management
  // ============================================

  /**
   * Add a breakpoint
   */
  addBreakpoint(options: BreakpointOptions): Breakpoint {
    return this.breakpointManager.addBreakpoint(options);
  }

  /**
   * Remove a breakpoint
   */
  removeBreakpoint(id: string): boolean {
    return this.breakpointManager.removeBreakpoint(id);
  }

  /**
   * Clear all breakpoints
   */
  clearAllBreakpoints(): void {
    this.breakpointManager.clearAll();
  }

  /**
   * Get all breakpoints
   */
  getBreakpoints(): Breakpoint[] {
    return this.breakpointManager.getAllBreakpoints();
  }

  /**
   * Enable/disable a breakpoint
   */
  setBreakpointEnabled(id: string, enabled: boolean): boolean {
    return this.breakpointManager.setEnabled(id, enabled);
  }

  /**
   * Set breakpoint condition
   */
  setBreakpointCondition(id: string, condition?: string): boolean {
    return this.breakpointManager.setCondition(id, condition);
  }

  // ============================================
  // Execution Control
  // ============================================

  /**
   * Start or resume execution
   */
  async run(): Promise<ExecutionResult> {
    if (!this.instrumentedCode) {
      throw new Error('No code loaded');
    }

    if (this.state === DebuggerState.Paused) {
      // Resume from pause
      this.state = DebuggerState.Running;
      this.stepType = null;
      if (this.continueResolve) {
        this.continueResolve();
        this.continueResolve = null;
      }
      return { success: true };
    }

    if (this.state !== DebuggerState.Idle) {
      throw new Error('Debugger is already running');
    }

    this.state = DebuggerState.Running;
    this.callStack = [];
    this.currentFrameId = 0;
    this.breakpointManager.resetHitCounts();

    this.emit('started');

    try {
      const result = await this.executeInstrumented();
      this.state = DebuggerState.Idle;
      this.emit('completed', result);
      return result;
    } catch (error) {
      this.state = DebuggerState.Idle;
      const result: ExecutionResult = {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
      this.emit('completed', result);
      return result;
    }
  }

  /**
   * Pause execution
   */
  pause(): void {
    if (this.state === DebuggerState.Running) {
      this.pauseRequested = true;
    }
  }

  /**
   * Stop execution
   */
  stop(): void {
    if (this.state !== DebuggerState.Idle) {
      this.state = DebuggerState.Idle;
      this.pauseRequested = false;
      this.stepType = null;
      this.callStack = [];
      if (this.continueResolve) {
        this.continueResolve();
        this.continueResolve = null;
      }
      this.emit('stopped');
    }
  }

  /**
   * Step to next statement (step over)
   */
  stepOver(): void {
    if (this.state !== DebuggerState.Paused) {
      return;
    }
    this.stepType = StepType.Over;
    this.stepStartDepth = this.callStack.length;
    this.state = DebuggerState.Stepping;
    if (this.continueResolve) {
      this.continueResolve();
      this.continueResolve = null;
    }
  }

  /**
   * Step into function call
   */
  stepInto(): void {
    if (this.state !== DebuggerState.Paused) {
      return;
    }
    this.stepType = StepType.Into;
    this.stepStartDepth = this.callStack.length;
    this.state = DebuggerState.Stepping;
    if (this.continueResolve) {
      this.continueResolve();
      this.continueResolve = null;
    }
  }

  /**
   * Step out of current function
   */
  stepOut(): void {
    if (this.state !== DebuggerState.Paused) {
      return;
    }
    this.stepType = StepType.Out;
    this.stepStartDepth = this.callStack.length;
    this.state = DebuggerState.Stepping;
    if (this.continueResolve) {
      this.continueResolve();
      this.continueResolve = null;
    }
  }

  // ============================================
  // Variable Inspection
  // ============================================

  /**
   * Get current call stack
   */
  getCallStack(): StackFrame[] {
    return [...this.callStack];
  }

  /**
   * Get variables at a specific stack frame
   *
   * @param frameId - Stack frame ID (0 = current frame)
   */
  getVariables(frameId: number = 0): VariableValue[] {
    const frame = this.callStack.find((f) => f.id === frameId);
    if (!frame) {
      return [];
    }

    const variables: VariableValue[] = [];

    // Add local variables
    for (const [name, value] of frame.locals) {
      variables.push(this.createVariableValue(name, value));
    }

    // Add scope chain variables
    for (const scope of frame.scopes) {
      for (const [name, value] of scope.variables) {
        if (!variables.some((v) => v.name === name)) {
          variables.push(this.createVariableValue(name, value));
        }
      }
    }

    return variables;
  }

  /**
   * Evaluate an expression in the current context
   *
   * @param expression - JavaScript expression to evaluate
   * @param frameId - Stack frame ID for context
   */
  async evaluate(expression: string, frameId: number = 0): Promise<VariableValue> {
    const frame = this.callStack.find((f) => f.id === frameId);
    if (!frame && this.callStack.length > 0) {
      throw new Error(`Frame ${frameId} not found`);
    }

    try {
      // Build evaluation context from frame variables
      const context: Record<string, any> = {};
      if (frame) {
        for (const [name, value] of frame.locals) {
          context[name] = value;
        }
        for (const scope of frame.scopes) {
          for (const [name, value] of scope.variables) {
            if (!(name in context)) {
              context[name] = value;
            }
          }
        }
      }

      // Add iMacros functions to context
      context.iimPlay = this.iimPlay.bind(this);
      context.iimSet = this.iimSet.bind(this);
      context.iimGetLastExtract = this.iimGetLastExtract.bind(this);
      context.iimGetLastError = this.iimGetLastError.bind(this);

      // Create function with context variables as parameters
      const paramNames = Object.keys(context);
      const paramValues = Object.values(context);
      const evalFunc = new Function(...paramNames, `return (${expression})`);
      const result = evalFunc(...paramValues);

      return this.createVariableValue('<result>', result);
    } catch (error) {
      throw new Error(`Evaluation error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a VariableValue object from a name and value
   */
  private createVariableValue(name: string, value: any, depth: number = 0): VariableValue {
    const type = this.getValueType(value);
    const expandable = type === 'object' || type === 'array';

    let displayValue = value;
    if (type === 'string' && value.length > this.config.maxStringLength) {
      displayValue = value.substring(0, this.config.maxStringLength) + '...';
    } else if (depth >= this.config.maxVariableDepth && expandable) {
      displayValue = type === 'array' ? `Array(${value.length})` : `Object {...}`;
    } else if (type === 'object' && depth < this.config.maxVariableDepth) {
      displayValue = {};
      for (const key of Object.keys(value).slice(0, 100)) {
        displayValue[key] = this.createVariableValue(key, value[key], depth + 1).value;
      }
    } else if (type === 'array' && depth < this.config.maxVariableDepth) {
      displayValue = value.slice(0, 100).map((item: any, i: number) =>
        this.createVariableValue(String(i), item, depth + 1).value
      );
    }

    return {
      name,
      value: displayValue,
      type,
      expandable,
    };
  }

  /**
   * Get the type of a value for display
   */
  private getValueType(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'array';
    if (value instanceof Date) return 'date';
    if (value instanceof RegExp) return 'regexp';
    if (value instanceof Error) return 'error';
    if (typeof value === 'function') return 'function';
    return typeof value;
  }

  // ============================================
  // iMacros Integration
  // ============================================

  /**
   * iimPlay - Play a macro
   */
  async iimPlay(macroName: string): Promise<number> {
    if (this.iimInterface) {
      return this.iimInterface.iimPlay(macroName);
    }
    // Default implementation - just log
    this.emit('iimPlay', macroName);
    return 1; // Success
  }

  /**
   * iimSet - Set a variable
   */
  iimSet(name: string, value: string): number {
    // Strip -var_ prefix (e.g., "-var_myvar" -> "myvar")
    const prefixMatch = name.match(/^(?:-var_)?(\w+)$/);
    if (prefixMatch) {
      name = prefixMatch[1];
    }

    // Map var1-var9 to !VAR1-!VAR9
    const varMatch = name.match(/^var([0-9])$/i);
    if (varMatch) {
      name = `!VAR${varMatch[1]}`;
    }

    this.variables.set(name, value);
    if (this.iimInterface) {
      return this.iimInterface.iimSet(name, value);
    }
    this.emit('iimSet', name, value);
    return 1; // Success
  }

  /**
   * iimGetLastExtract - Get last extracted data
   */
  iimGetLastExtract(): string {
    if (this.iimInterface) {
      return this.iimInterface.iimGetLastExtract();
    }
    return this.lastExtract;
  }

  /**
   * iimGetLastError - Get last error
   */
  iimGetLastError(): string {
    if (this.iimInterface) {
      return this.iimInterface.iimGetLastError();
    }
    return this.lastError;
  }

  /**
   * Set the last extracted data (for testing)
   */
  setLastExtract(value: string): void {
    this.lastExtract = value;
  }

  /**
   * Set the last error (for testing)
   */
  setLastError(value: string): void {
    this.lastError = value;
  }

  /**
   * Get a variable set via iimSet
   */
  getVariable(name: string): string | undefined {
    return this.variables.get(name);
  }

  // ============================================
  // Internal Execution
  // ============================================

  /**
   * Execute the instrumented code
   */
  private async executeInstrumented(): Promise<ExecutionResult> {
    if (!this.instrumentedCode) {
      throw new Error('No code loaded');
    }

    // Create debug hook function
    const debugHook = async (
      line: number,
      column: number,
      eventType?: string,
      functionName?: string
    ): Promise<void> => {
      await this.handleDebugHook(line, column, eventType, functionName);
    };

    // Build execution context
    const context: Record<string, any> = {
      __debugHook__: debugHook,
      iimPlay: this.iimPlay.bind(this),
      iimSet: this.iimSet.bind(this),
      iimGetLastExtract: this.iimGetLastExtract.bind(this),
      iimGetLastError: this.iimGetLastError.bind(this),
      console: console,
    };

    // Add global scope variables
    for (const [name, value] of this.globalScope) {
      context[name] = value;
    }

    // Add variables set via iimSet
    for (const [name, value] of this.variables) {
      context[name] = value;
    }

    try {
      // Create async function to execute the code
      const paramNames = Object.keys(context);
      const paramValues = Object.values(context);
      const asyncCode = `return (async () => { ${this.instrumentedCode.code} })()`;
      const execFunc = new Function(...paramNames, asyncCode);
      const result = await execFunc(...paramValues);

      return {
        success: true,
        returnValue: result,
        extractedData: this.lastExtract,
      };
    } catch (error) {
      if (this.config.pauseOnExceptions) {
        this.lastError = error instanceof Error ? error.message : String(error);
        await this.pauseExecution('exception', 0, 0, undefined, error as Error);
      }
      throw error;
    }
  }

  /**
   * Handle debug hook calls from instrumented code
   */
  private async handleDebugHook(
    line: number,
    column: number,
    eventType?: string,
    functionName?: string
  ): Promise<void> {
    // Handle function entry
    if (eventType === 'enter' && functionName) {
      this.pushStackFrame(functionName, line, column);
    }

    // Update current position in top frame
    if (this.callStack.length > 0) {
      this.callStack[this.callStack.length - 1].line = line;
      this.callStack[this.callStack.length - 1].column = column;
    } else {
      // Create initial frame for top-level code
      this.pushStackFrame('<main>', line, column);
    }

    // Check for pause request
    if (this.pauseRequested) {
      this.pauseRequested = false;
      await this.pauseExecution('debugger', line, column);
      return;
    }

    // Check for stepping
    if (this.state === DebuggerState.Stepping) {
      const shouldPause = this.checkStepCondition();
      if (shouldPause) {
        await this.pauseExecution('step', line, column);
        return;
      }
    }

    // Check for breakpoints
    const breakpointResult = await this.breakpointManager.checkBreakpoint(
      line,
      column,
      async (condition) => {
        const result = await this.evaluate(condition);
        return Boolean(result.value);
      }
    );

    if (breakpointResult) {
      if (breakpointResult.logOutput) {
        // Logpoint - emit log and continue
        this.emit('logpoint', breakpointResult.breakpoint, breakpointResult.logOutput);
      }
      if (breakpointResult.shouldPause) {
        await this.pauseExecution('breakpoint', line, column, breakpointResult.breakpoint);
      }
    }
  }

  /**
   * Check if we should pause based on step type
   */
  private checkStepCondition(): boolean {
    const currentDepth = this.callStack.length;

    switch (this.stepType) {
      case StepType.Over:
        // Pause at same or lower depth
        return currentDepth <= this.stepStartDepth;
      case StepType.Into:
        // Always pause on next statement
        return true;
      case StepType.Out:
        // Pause when we exit the current function
        return currentDepth < this.stepStartDepth;
      default:
        return false;
    }
  }

  /**
   * Pause execution
   */
  private async pauseExecution(
    reason: 'breakpoint' | 'step' | 'exception' | 'debugger',
    line: number,
    column: number,
    breakpoint?: Breakpoint,
    exception?: Error
  ): Promise<void> {
    this.state = DebuggerState.Paused;
    this.stepType = null;

    const pauseData: PauseEventData = {
      reason,
      line,
      column,
      breakpoint,
      exception,
      callStack: this.getCallStack(),
    };

    this.emit('paused', pauseData);

    // Wait for continue/step
    await new Promise<void>((resolve) => {
      this.continueResolve = resolve;
    });
  }

  /**
   * Push a new stack frame
   */
  private pushStackFrame(functionName: string, line: number, column: number): void {
    const frame: StackFrame = {
      id: this.currentFrameId++,
      functionName,
      line,
      column,
      locals: new Map(),
      scopes: [
        {
          type: 'local',
          variables: new Map(),
        },
        {
          type: 'global',
          variables: this.globalScope,
        },
      ],
    };
    this.callStack.push(frame);
  }

  /**
   * Pop the top stack frame
   */
  private popStackFrame(): StackFrame | undefined {
    return this.callStack.pop();
  }

  /**
   * Set a variable in the current local scope
   */
  setLocalVariable(name: string, value: any): void {
    if (this.callStack.length > 0) {
      const frame = this.callStack[this.callStack.length - 1];
      frame.locals.set(name, value);
    }
  }

  /**
   * Set a global variable
   */
  setGlobalVariable(name: string, value: any): void {
    this.globalScope.set(name, value);
  }
}

export default JSDebugger;
