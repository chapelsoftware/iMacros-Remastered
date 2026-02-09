/**
 * iMacros Macro Executor
 *
 * Main execution engine for iMacros macros. Handles:
 * - Line-by-line execution with async support
 * - Variable expansion before command execution
 * - Loop management (LOOP counter, repeat until done)
 * - Error handling with iMacros error codes
 * - Progress reporting callbacks
 * - Pause/resume/stop functionality
 * - Command handler registration for extensibility
 */

import {
  ParsedMacro,
  ParsedCommand,
  ParsedLine,
  parseMacro,
  CommandType,
} from './parser';
import {
  VariableContext,
  VariableValue,
  executeSet,
  executeSetAsync,
  executeAdd,
  NativeEvalCallback,
} from './variables';
import {
  StateManager,
  ErrorCode,
  ExecutionStatus,
  createStateManager,
} from './state-manager';

// ===== Error Codes =====

/**
 * iMacros error codes for specific failure conditions
 */
export const IMACROS_ERROR_CODES = {
  OK: 0,
  // Syntax errors (-91x)
  SYNTAX_ERROR: -910,
  INVALID_COMMAND: -911,
  INVALID_PARAMETER: -912,
  MISSING_PARAMETER: -913,
  UNSUPPORTED_COMMAND: -915,
  // Image recognition errors (-90x)
  IMAGE_SEARCH_NOT_CONFIGURED: -902,
  IMAGE_FILE_NOT_FOUND: -903,
  // Element errors (-92x)
  ELEMENT_NOT_FOUND: -920,
  ELEMENT_NOT_VISIBLE: -921,
  FRAME_NOT_FOUND: -922,
  MULTIPLE_ELEMENTS: -923,
  ELEMENT_NOT_ENABLED: -924,
  IMAGE_NOT_FOUND: -927,
  // Timeout errors (-93x)
  TIMEOUT: -930,
  PAGE_TIMEOUT: -931,
  STEP_TIMEOUT: -932,
  // Frame errors (-94x)
  FRAME_ERROR: -940,
  // Download errors (-95x)
  DOWNLOAD_ERROR: -950,
  DOWNLOAD_FAILED: -951,
  DOWNLOAD_TIMEOUT: -952,
  DOWNLOAD_CHECKSUM_MISMATCH: -953,
  DOWNLOAD_FOLDER_ACCESS: -954,
  DOWNLOAD_INVALID_FILENAME: -955,
  // File errors (-96x)
  FILE_ERROR: -960,
  FILE_NOT_FOUND: -961,
  FILE_ACCESS_DENIED: -962,
  FILE_WRITE_ERROR: -963,
  // Script errors (-97x)
  SCRIPT_ERROR: -970,
  SCRIPT_EXCEPTION: -971,
  // Datasource errors (-98x)
  DATASOURCE_ERROR: -980,
  DATASOURCE_NOT_FOUND: -981,
  DATASOURCE_PARSE_ERROR: -982,
  DATASOURCE_END: -983,
  // Loop errors (-99x)
  LOOP_LIMIT: -990,
  LOOP_ERROR: -991,
  // Dialog errors (-145x)
  UNHANDLED_DIALOG: -1450,
  // User actions (-10x)
  USER_ABORT: -100,
  USER_PAUSE: -101,
  // Unknown
  UNKNOWN_ERROR: -999,
} as const;

export type IMacrosErrorCode = typeof IMACROS_ERROR_CODES[keyof typeof IMACROS_ERROR_CODES];

// ===== Execution Result =====

/**
 * Result of executing a single command
 */
export interface CommandResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Error code (0 for success) */
  errorCode: IMacrosErrorCode;
  /** Error message if failed */
  errorMessage?: string;
  /** Output data (e.g., extracted text) */
  output?: string;
  /** Whether to skip to next loop iteration */
  skipToNextLoop?: boolean;
  /** Whether to stop execution completely */
  stopExecution?: boolean;
  /** Line number to jump to (for GOTO) */
  jumpToLine?: number;
}

/**
 * Result of executing the entire macro
 */
export interface MacroResult {
  /** Whether the macro completed successfully */
  success: boolean;
  /** Final error code */
  errorCode: IMacrosErrorCode;
  /** Error message if failed */
  errorMessage?: string;
  /** Line number where error occurred */
  errorLine?: number;
  /** Number of loops completed */
  loopsCompleted: number;
  /** Total execution time in milliseconds */
  executionTimeMs: number;
  /** Extracted data */
  extractData: string[];
  /** Final variable values */
  variables: Record<string, VariableValue>;
}

// ===== Progress Reporting =====

/**
 * Progress information reported during execution
 */
export interface ProgressInfo {
  /** Current line number (1-based) */
  currentLine: number;
  /** Total lines in macro */
  totalLines: number;
  /** Current loop iteration (1-based) */
  currentLoop: number;
  /** Maximum loops */
  maxLoops: number;
  /** Current command being executed */
  currentCommand?: ParsedCommand;
  /** Execution status */
  status: ExecutionStatus;
  /** Percentage complete (0-100) */
  percentComplete: number;
  /** Elapsed time in milliseconds */
  elapsedTimeMs: number;
}

/**
 * Callback for progress updates
 */
export type ProgressCallback = (progress: ProgressInfo) => void;

/**
 * Callback for log messages
 */
export type LogCallback = (level: 'info' | 'warn' | 'error' | 'debug', message: string) => void;

// ===== Command Handler =====

/**
 * Context passed to command handlers
 */
export interface CommandContext {
  /** The parsed command */
  command: ParsedCommand;
  /** Variable context for expansion and storage */
  variables: VariableContext;
  /** State manager for tracking execution state */
  state: StateManager;
  /** Get parameter value by key */
  getParam: (key: string) => string | undefined;
  /** Get required parameter (throws if missing) */
  getRequiredParam: (key: string) => string;
  /** Expand variables in a string */
  expand: (text: string) => string;
  /** Log a message */
  log: (level: 'info' | 'warn' | 'error' | 'debug', message: string) => void;
}

/**
 * Command handler function type
 */
export type CommandHandler = (context: CommandContext) => Promise<CommandResult>;

/**
 * Default command handler for unimplemented commands
 */
const defaultCommandHandler: CommandHandler = async (ctx) => {
  ctx.log('warn', `Unimplemented command: ${ctx.command.type}`);
  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
  };
};

// ===== Executor Options =====

/**
 * Options for the MacroExecutor
 */
export interface ExecutorOptions {
  /** Macro name/path */
  macroName?: string;
  /** Maximum loop iterations (default: 1) */
  maxLoops?: number;
  /** Whether to ignore errors (!ERRORIGNORE=YES behavior) */
  errorIgnore?: boolean;
  /** Initial variable values */
  initialVariables?: Record<string, VariableValue>;
  /** Progress callback */
  onProgress?: ProgressCallback;
  /** Log callback */
  onLog?: LogCallback;
  /** Delay between commands in ms (for debugging) */
  commandDelayMs?: number;
  /** Whether to run in single-step mode */
  singleStep?: boolean;
  /** Callback to load datasource content when !DATASOURCE is set via SET command */
  onDatasourceLoad?: (path: string) => Promise<string> | string;
  /** Callback for native JavaScript evaluation (used when expr-eval cannot handle the expression) */
  onNativeEval?: NativeEvalCallback;
}

// ===== Macro Executor Class =====

/**
 * Main macro execution engine
 *
 * Executes iMacros macros line by line with full support for:
 * - Variable expansion
 * - Loop management
 * - Error handling
 * - Progress reporting
 * - Pause/resume/stop control
 */
export class MacroExecutor {
  /** Parsed macro to execute */
  private macro: ParsedMacro | null = null;
  /** State manager for tracking execution */
  private state: StateManager;
  /** Command handlers registry */
  private handlers: Map<CommandType, CommandHandler> = new Map();
  /** Progress callback */
  private onProgress?: ProgressCallback;
  /** Log callback */
  private onLog?: LogCallback;
  /** Command delay for debugging */
  private commandDelayMs: number = 0;
  /** Single-step mode flag */
  private singleStep: boolean = false;
  /** Error ignore mode */
  private errorIgnore: boolean = false;
  /** Abort flag for stopping execution */
  private abortFlag: boolean = false;
  /** Pause flag for pausing execution */
  private pauseFlag: boolean = false;
  /** Resume promise resolver */
  private resumeResolver: (() => void) | null = null;
  /** Step promise resolver for single-step mode */
  private stepResolver: (() => void) | null = null;
  /** Saved initial variables for re-application after reset */
  private initialVariables: Record<string, VariableValue> | undefined;
  /** Callback to load datasource content when !DATASOURCE is set */
  private onDatasourceLoad?: (path: string) => Promise<string> | string;
  /** Callback for native JavaScript evaluation */
  private onNativeEval?: NativeEvalCallback;

  constructor(options: ExecutorOptions = {}) {
    this.state = createStateManager({
      macroName: options.macroName,
      maxLoops: options.maxLoops ?? 1,
      initialVariables: options.initialVariables,
    });
    this.initialVariables = options.initialVariables;
    this.onProgress = options.onProgress;
    this.onLog = options.onLog;
    this.commandDelayMs = options.commandDelayMs ?? 0;
    this.singleStep = options.singleStep ?? false;
    this.errorIgnore = options.errorIgnore ?? false;
    this.onDatasourceLoad = options.onDatasourceLoad;
    this.onNativeEval = options.onNativeEval;

    // Register built-in command handlers
    this.registerBuiltinHandlers();
  }

  // ===== Handler Registration =====

  /**
   * Register a command handler
   */
  registerHandler(commandType: CommandType, handler: CommandHandler): void {
    this.handlers.set(commandType, handler);
  }

  /**
   * Register multiple command handlers
   */
  registerHandlers(handlers: Partial<Record<CommandType, CommandHandler>>): void {
    for (const [type, handler] of Object.entries(handlers)) {
      if (handler) {
        this.handlers.set(type as CommandType, handler);
      }
    }
  }

  /**
   * Get the handler for a command type
   */
  getHandler(commandType: CommandType): CommandHandler {
    return this.handlers.get(commandType) ?? defaultCommandHandler;
  }

  /**
   * Register built-in command handlers
   */
  private registerBuiltinHandlers(): void {
    // SET command - set variable values
    this.registerHandler('SET', async (ctx) => {
      const params = ctx.command.parameters;
      if (params.length < 2) {
        return {
          success: false,
          errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
          errorMessage: 'SET requires variable name and value',
        };
      }

      const varName = params[0].key;
      const value = ctx.expand(params[1].rawValue || params[1].value);

      // !LOOP first-loop guard: SET !LOOP only works on the first loop iteration
      // (iMacros 8.9.7 behavior - ignored on subsequent iterations)
      if (varName.toUpperCase() === '!LOOP' && ctx.state.getLoopCounter() > 1) {
        ctx.log('debug', `SET !LOOP ignored (only effective on first loop iteration)`);
        return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
      }

      // Use async version with native eval callback for JavaScript EVAL support
      const result = await executeSetAsync(ctx.variables, varName, value, this.onNativeEval);
      if (result.macroError) {
        return {
          success: true,
          errorCode: IMACROS_ERROR_CODES.OK,
          stopExecution: true,
          errorMessage: result.errorMessage,
        };
      }
      if (!result.success) {
        return {
          success: false,
          errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
          errorMessage: result.error,
        };
      }

      // If !DATASOURCE was set, try to load content via callback
      if (
        varName.toUpperCase() === '!DATASOURCE' &&
        result.newValue &&
        this.onDatasourceLoad
      ) {
        try {
          const content = await this.onDatasourceLoad(String(result.newValue));
          if (content) {
            const { loadDatasourceFromContent, getDatasourceManager } = await import(
              './commands/datasource-handler'
            );
            loadDatasourceFromContent(content, String(result.newValue));

            // Set raw rows on VariableContext for dynamic !COL resolution
            // This enables original iMacros behavior where {{!COL1}} reads
            // directly from datasource based on !DATASOURCE_LINE
            const manager = getDatasourceManager();
            if (manager) {
              ctx.variables.setDatasourceRows(manager.getAllRows());
            }
          }
        } catch (e) {
          ctx.log(
            'warn',
            `Failed to load datasource: ${(e as Error).message}`
          );
        }
      }

      ctx.log('debug', `SET ${varName} = ${result.newValue}`);
      return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
    });

    // ADD command - add to variable
    this.registerHandler('ADD', async (ctx) => {
      const params = ctx.command.parameters;
      if (params.length < 2) {
        return {
          success: false,
          errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
          errorMessage: 'ADD requires variable name and value',
        };
      }

      const varName = params[0].key;
      const value = ctx.expand(params[1].rawValue || params[1].value);

      const result = executeAdd(ctx.variables, varName, value);
      if (!result.success) {
        return {
          success: false,
          errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
          errorMessage: result.error,
        };
      }

      ctx.log('debug', `ADD ${varName} + ${result.addedValue} = ${result.newValue}`);
      return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
    });

    // WAIT command - wait for specified seconds
    this.registerHandler('WAIT', async (ctx) => {
      const secondsStr = ctx.getRequiredParam('SECONDS');
      const seconds = parseFloat(ctx.expand(secondsStr));

      if (isNaN(seconds) || seconds < 0) {
        return {
          success: false,
          errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
          errorMessage: `Invalid SECONDS value: ${secondsStr}`,
        };
      }

      ctx.log('info', `Waiting ${seconds} seconds...`);
      await this.delay(seconds * 1000);
      return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
    });

    // PAUSE command - pause execution for user interaction
    this.registerHandler('PAUSE', async (ctx) => {
      ctx.log('info', 'Macro paused');
      this.pauseFlag = true;
      return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
    });

    // VERSION command - just validates, no action needed
    this.registerHandler('VERSION', async () => {
      return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
    });

    // CLEAR command - clear various browser state
    this.registerHandler('CLEAR', async (ctx) => {
      ctx.log('debug', 'CLEAR command (no-op in executor)');
      return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
    });
  }

  // ===== Macro Loading =====

  /**
   * Load a macro from script text
   */
  loadMacro(script: string, validate: boolean = true): ParsedMacro {
    this.macro = parseMacro(script, validate);
    this.state.setTotalLines(this.macro.commands.length);

    if (this.macro.errors.length > 0 && validate) {
      this.log('warn', `Macro has ${this.macro.errors.length} parse error(s)`);
      for (const error of this.macro.errors) {
        this.log('error', `Line ${error.lineNumber}: ${error.message}`);
      }
    }

    return this.macro;
  }

  /**
   * Get the loaded macro
   */
  getMacro(): ParsedMacro | null {
    return this.macro;
  }

  // ===== Execution Control =====

  /**
   * Execute the loaded macro
   */
  async execute(): Promise<MacroResult> {
    if (!this.macro) {
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
        errorMessage: 'No macro loaded',
        loopsCompleted: 0,
        executionTimeMs: 0,
        extractData: [],
        variables: {},
      };
    }

    // Reset state for new execution
    this.state.resetForExecution();
    this.abortFlag = false;
    this.pauseFlag = false;

    // Re-apply initial variables after reset (reset wipes all variables)
    if (this.initialVariables) {
      const vars = this.state.getVariables();
      for (const [name, value] of Object.entries(this.initialVariables)) {
        vars.set(name, value);
      }
    }

    // Start execution
    this.state.start();
    this.log('info', `Starting macro execution (${this.state.getMaxLoops()} loop(s))`);

    let loopsCompleted = 0;

    try {
      // Main loop iteration
      while (!this.state.isLoopLimitReached() && !this.abortFlag) {
        this.log('info', `Starting loop ${this.state.getLoopCounter()}`);
        this.state.setCurrentLine(1);

        // Execute each command in sequence
        const commands = this.macro.commands;
        let commandIndex = 0;

        while (commandIndex < commands.length && !this.abortFlag) {
          // Check for pause
          if (this.pauseFlag) {
            await this.waitForResume();
            if (this.abortFlag) break;
          }

          // Single-step mode
          if (this.singleStep) {
            await this.waitForStep();
            if (this.abortFlag) break;
          }

          const command = commands[commandIndex];
          this.state.setCurrentLine(commandIndex + 1);

          // Report progress
          this.reportProgress(command);

          // Execute the command
          const result = await this.executeCommand(command);

          // Handle command delay
          if (this.commandDelayMs > 0) {
            await this.delay(this.commandDelayMs);
          }

          // Handle result
          if (!result.success) {
            if (this.errorIgnore || this.state.getVariable('!ERRORIGNORE') === 'YES') {
              this.log('warn', `Error ignored on line ${commandIndex + 1}: ${result.errorMessage}`);
            } else {
              // Check for !ERRORLOOP
              if (this.state.getVariable('!ERRORLOOP') === 'YES') {
                this.log('warn', `Error on line ${commandIndex + 1}, skipping to next loop: ${result.errorMessage}`);
                break; // Skip to next loop
              }

              // Fatal error - stop execution
              this.state.setError(result.errorCode as ErrorCode, result.errorMessage);
              return this.buildResult(false, result.errorCode, result.errorMessage, commandIndex + 1);
            }
          }

          // Handle special control flow
          if (result.stopExecution) {
            this.log('info', 'Execution stopped by command');
            return this.buildResult(true, IMACROS_ERROR_CODES.OK);
          }

          if (result.skipToNextLoop) {
            this.log('debug', 'Skipping to next loop iteration');
            break;
          }

          if (result.jumpToLine !== undefined) {
            commandIndex = result.jumpToLine - 1; // Convert to 0-based
            continue;
          }

          commandIndex++;
        }

        // Loop completed
        loopsCompleted++;

        // Check if we should continue looping
        if (this.state.getLoopCounter() < this.state.getMaxLoops()) {
          this.state.incrementLoop();
          this.state.resetForNextLoop();
        } else {
          break;
        }
      }

      // Execution completed successfully
      this.state.complete();
      return this.buildResult(true, IMACROS_ERROR_CODES.OK);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log('error', `Execution error: ${message}`);
      this.state.setError(ErrorCode.SCRIPT_ERROR, message);
      return this.buildResult(false, IMACROS_ERROR_CODES.SCRIPT_ERROR, message);
    }
  }

  /**
   * Execute a single command
   */
  private async executeCommand(command: ParsedCommand): Promise<CommandResult> {
    const handler = this.getHandler(command.type);
    const variables = this.state.getVariables();

    // Build context for the handler
    const context: CommandContext = {
      command,
      variables,
      state: this.state,
      getParam: (key: string) => {
        const param = command.parameters.find(p => p.key.toUpperCase() === key.toUpperCase());
        return param?.value;
      },
      getRequiredParam: (key: string) => {
        const param = command.parameters.find(p => p.key.toUpperCase() === key.toUpperCase());
        if (!param) {
          throw new Error(`Missing required parameter: ${key}`);
        }
        return param.value;
      },
      expand: (text: string) => {
        const result = variables.expand(text);
        return result.expanded;
      },
      log: (level, message) => this.log(level, message),
    };

    try {
      this.log('debug', `Executing: ${command.raw}`);
      return await handler(context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log('error', `Command error: ${message}`);
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
        errorMessage: message,
      };
    }
  }

  /**
   * Pause execution
   */
  pause(): void {
    if (this.state.getStatus() === ExecutionStatus.RUNNING) {
      this.pauseFlag = true;
      this.state.pause();
      this.log('info', 'Execution paused');
    }
  }

  /**
   * Resume execution
   */
  resume(): void {
    if (this.state.getStatus() === ExecutionStatus.PAUSED || this.pauseFlag) {
      this.pauseFlag = false;
      this.state.resume();
      if (this.resumeResolver) {
        this.resumeResolver();
        this.resumeResolver = null;
      }
      this.log('info', 'Execution resumed');
    }
  }

  /**
   * Stop execution
   */
  stop(): void {
    this.abortFlag = true;
    this.pauseFlag = false;
    this.state.abort();

    // Release any waiters
    if (this.resumeResolver) {
      this.resumeResolver();
      this.resumeResolver = null;
    }
    if (this.stepResolver) {
      this.stepResolver();
      this.stepResolver = null;
    }

    this.log('info', 'Execution stopped');
  }

  /**
   * Execute single step (for single-step mode)
   */
  step(): void {
    if (this.stepResolver) {
      this.stepResolver();
      this.stepResolver = null;
    }
  }

  /**
   * Set single-step mode
   */
  setSingleStep(enabled: boolean): void {
    this.singleStep = enabled;
    this.state.setVariable('!SINGLESTEP', enabled ? 'YES' : 'NO');
  }

  /**
   * Set error ignore mode
   */
  setErrorIgnore(enabled: boolean): void {
    this.errorIgnore = enabled;
    this.state.setVariable('!ERRORIGNORE', enabled ? 'YES' : 'NO');
  }

  // ===== State Access =====

  /**
   * Get the state manager
   */
  getState(): StateManager {
    return this.state;
  }

  /**
   * Get current execution status
   */
  getStatus(): ExecutionStatus {
    return this.state.getStatus();
  }

  /**
   * Get current progress info
   */
  getProgress(): ProgressInfo {
    return {
      currentLine: this.state.getCurrentLine(),
      totalLines: this.state.getTotalLines(),
      currentLoop: this.state.getLoopCounter(),
      maxLoops: this.state.getMaxLoops(),
      status: this.state.getStatus(),
      percentComplete: this.calculatePercentComplete(),
      elapsedTimeMs: this.state.getExecutionTimeMs(),
    };
  }

  // ===== Private Helpers =====

  /**
   * Wait for resume after pause
   */
  private waitForResume(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.resumeResolver = resolve;
    });
  }

  /**
   * Wait for step in single-step mode
   */
  private waitForStep(): Promise<void> {
    this.state.pause();
    return new Promise<void>((resolve) => {
      this.stepResolver = resolve;
    });
  }

  /**
   * Delay execution (interruptible via abort flag)
   *
   * Splits long delays into small chunks so that stop() can
   * interrupt a WAIT command without waiting for the full duration.
   */
  private async delay(ms: number): Promise<void> {
    const chunkSize = 100; // Check abort every 100ms
    let remaining = ms;

    while (remaining > 0 && !this.abortFlag) {
      const wait = Math.min(remaining, chunkSize);
      await new Promise<void>((resolve) => setTimeout(resolve, wait));
      remaining -= wait;
    }
  }

  /**
   * Calculate percentage complete
   */
  private calculatePercentComplete(): number {
    const totalLines = this.state.getTotalLines();
    const maxLoops = this.state.getMaxLoops();
    if (totalLines === 0 || maxLoops === 0) return 0;

    const completedLoops = this.state.getLoopCounter() - 1;
    const currentLine = this.state.getCurrentLine();

    const totalWork = totalLines * maxLoops;
    const completedWork = (completedLoops * totalLines) + currentLine;

    return Math.min(100, Math.round((completedWork / totalWork) * 100));
  }

  /**
   * Report progress
   */
  private reportProgress(currentCommand?: ParsedCommand): void {
    if (this.onProgress) {
      this.onProgress({
        currentLine: this.state.getCurrentLine(),
        totalLines: this.state.getTotalLines(),
        currentLoop: this.state.getLoopCounter(),
        maxLoops: this.state.getMaxLoops(),
        currentCommand,
        status: this.state.getStatus(),
        percentComplete: this.calculatePercentComplete(),
        elapsedTimeMs: this.state.getExecutionTimeMs(),
      });
    }
  }

  /**
   * Log a message
   */
  private log(level: 'info' | 'warn' | 'error' | 'debug', message: string): void {
    if (this.onLog) {
      this.onLog(level, message);
    }
  }

  /**
   * Build the final macro result
   */
  private buildResult(
    success: boolean,
    errorCode: IMacrosErrorCode,
    errorMessage?: string,
    errorLine?: number
  ): MacroResult {
    return {
      success,
      errorCode,
      errorMessage,
      errorLine,
      loopsCompleted: this.state.getLoopCounter(),
      executionTimeMs: this.state.getExecutionTimeMs(),
      extractData: this.state.getExtractData(),
      variables: this.state.getAllVariables(),
    };
  }
}

// ===== Factory Functions =====

/**
 * Create a new macro executor
 */
export function createExecutor(options?: ExecutorOptions): MacroExecutor {
  return new MacroExecutor(options);
}

/**
 * Execute a macro script directly
 */
export async function executeMacro(
  script: string,
  options?: ExecutorOptions
): Promise<MacroResult> {
  const executor = createExecutor(options);
  executor.loadMacro(script);
  return executor.execute();
}

// ===== Utility Functions =====

/**
 * Get error message for an error code
 */
export function getErrorMessage(code: IMacrosErrorCode): string {
  const messages: Record<IMacrosErrorCode, string> = {
    [IMACROS_ERROR_CODES.OK]: 'OK',
    [IMACROS_ERROR_CODES.SYNTAX_ERROR]: 'Syntax error',
    [IMACROS_ERROR_CODES.INVALID_COMMAND]: 'Invalid command',
    [IMACROS_ERROR_CODES.INVALID_PARAMETER]: 'Invalid parameter',
    [IMACROS_ERROR_CODES.MISSING_PARAMETER]: 'Missing required parameter',
    [IMACROS_ERROR_CODES.UNSUPPORTED_COMMAND]: 'Unsupported command',
    [IMACROS_ERROR_CODES.IMAGE_SEARCH_NOT_CONFIGURED]: 'Image search not configured',
    [IMACROS_ERROR_CODES.IMAGE_FILE_NOT_FOUND]: 'Image file not found',
    [IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND]: 'Element not found',
    [IMACROS_ERROR_CODES.ELEMENT_NOT_VISIBLE]: 'Element not visible',
    [IMACROS_ERROR_CODES.ELEMENT_NOT_ENABLED]: 'Element not enabled',
    [IMACROS_ERROR_CODES.MULTIPLE_ELEMENTS]: 'Multiple elements matched',
    [IMACROS_ERROR_CODES.IMAGE_NOT_FOUND]: 'Image not found',
    [IMACROS_ERROR_CODES.TIMEOUT]: 'Timeout',
    [IMACROS_ERROR_CODES.PAGE_TIMEOUT]: 'Page load timeout',
    [IMACROS_ERROR_CODES.STEP_TIMEOUT]: 'Step timeout',
    [IMACROS_ERROR_CODES.FRAME_ERROR]: 'Frame error',
    [IMACROS_ERROR_CODES.FRAME_NOT_FOUND]: 'Frame not found',
    [IMACROS_ERROR_CODES.DOWNLOAD_ERROR]: 'Download error',
    [IMACROS_ERROR_CODES.DOWNLOAD_FAILED]: 'Download failed',
    [IMACROS_ERROR_CODES.DOWNLOAD_TIMEOUT]: 'Download timeout',
    [IMACROS_ERROR_CODES.DOWNLOAD_CHECKSUM_MISMATCH]: 'Download checksum mismatch',
    [IMACROS_ERROR_CODES.DOWNLOAD_FOLDER_ACCESS]: 'Download folder access error',
    [IMACROS_ERROR_CODES.DOWNLOAD_INVALID_FILENAME]: 'Invalid download filename',
    [IMACROS_ERROR_CODES.FILE_ERROR]: 'File error',
    [IMACROS_ERROR_CODES.FILE_NOT_FOUND]: 'File not found',
    [IMACROS_ERROR_CODES.FILE_ACCESS_DENIED]: 'File access denied',
    [IMACROS_ERROR_CODES.FILE_WRITE_ERROR]: 'File write error',
    [IMACROS_ERROR_CODES.SCRIPT_ERROR]: 'Script error',
    [IMACROS_ERROR_CODES.SCRIPT_EXCEPTION]: 'Script exception',
    [IMACROS_ERROR_CODES.DATASOURCE_ERROR]: 'Datasource error',
    [IMACROS_ERROR_CODES.DATASOURCE_NOT_FOUND]: 'Datasource not found',
    [IMACROS_ERROR_CODES.DATASOURCE_PARSE_ERROR]: 'Datasource parse error',
    [IMACROS_ERROR_CODES.DATASOURCE_END]: 'End of datasource',
    [IMACROS_ERROR_CODES.LOOP_LIMIT]: 'Loop limit reached',
    [IMACROS_ERROR_CODES.LOOP_ERROR]: 'Loop error',
    [IMACROS_ERROR_CODES.USER_ABORT]: 'Aborted by user',
    [IMACROS_ERROR_CODES.USER_PAUSE]: 'Paused by user',
    [IMACROS_ERROR_CODES.UNHANDLED_DIALOG]: 'Unhandled dialog',
    [IMACROS_ERROR_CODES.UNKNOWN_ERROR]: 'Unknown error',
  };

  return messages[code] || 'Unknown error';
}

/**
 * Check if an error code is recoverable
 */
export function isRecoverableError(code: IMacrosErrorCode): boolean {
  // Recoverable errors that can be retried or ignored
  const recoverableErrors: IMacrosErrorCode[] = [
    IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND,
    IMACROS_ERROR_CODES.ELEMENT_NOT_VISIBLE,
    IMACROS_ERROR_CODES.ELEMENT_NOT_ENABLED,
    IMACROS_ERROR_CODES.TIMEOUT,
    IMACROS_ERROR_CODES.PAGE_TIMEOUT,
    IMACROS_ERROR_CODES.STEP_TIMEOUT,
    IMACROS_ERROR_CODES.FRAME_NOT_FOUND,
    IMACROS_ERROR_CODES.DATASOURCE_END,
    IMACROS_ERROR_CODES.USER_PAUSE,
  ];

  return recoverableErrors.includes(code);
}

// Re-export types from dependencies
export { ExecutionStatus, ErrorCode } from './state-manager';
export type { ParsedCommand, CommandType } from './parser';
