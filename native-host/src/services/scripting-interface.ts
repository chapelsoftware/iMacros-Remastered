/**
 * TCP Scripting Interface Server for iMacros
 *
 * Provides a TCP server interface for external program control of iMacros.
 * This implements the iMacros Scripting Interface (SI) protocol, allowing
 * external applications to play macros, set variables, and retrieve results.
 *
 * Default port: 4951 (configurable)
 *
 * Supported commands:
 * - iimPlay: Execute a macro
 * - iimSet: Set a variable value
 * - iimGetLastExtract: Get the last extracted data
 * - iimGetLastError: Get the last error message
 * - iimGetLastPerformance: Get timing data from last macro execution
 * - iimGetStopwatch: Get elapsed time of a stopwatch
 * - iimDisplay: Display a message
 * - iimStop: Stop the currently running macro
 * - iimExit: Disconnect client
 */
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import {
  MacroExecutor,
  createExecutor,
  IMACROS_ERROR_CODES,
  type ExecutorOptions,
  type CommandHandler as ExecutorCommandHandler,
  type MacroResult,
} from '../../../shared/src/executor';
import type { CommandType } from '../../../shared/src/parser';
import { registerExtractionHandlers } from '../../../shared/src/commands/extraction';
import { getStopwatchElapsed } from '../../../shared/src/commands/system';

/**
 * Return codes for Scripting Interface commands
 * Follows the standard iMacros return code convention
 */
export enum ReturnCode {
  /** Command executed successfully */
  OK = 1,
  /** Macro is currently running */
  MACRO_RUNNING = 0,
  /** General error */
  ERROR = -1,
  /** Timeout error */
  TIMEOUT = -2,
  /** Syntax error in command */
  SYNTAX_ERROR = -3,
  /** Macro not found */
  MACRO_NOT_FOUND = -4,
  /** Variable not found */
  VARIABLE_NOT_FOUND = -5,
  /** Invalid parameter */
  INVALID_PARAMETER = -6,
  /** Connection error */
  CONNECTION_ERROR = -7,
  /** Server not running */
  SERVER_NOT_RUNNING = -8,
  /** Command cancelled */
  CANCELLED = -9,
  /** Unknown command */
  UNKNOWN_COMMAND = -10,
}

/**
 * Configuration options for the Scripting Interface server
 */
export interface ScriptingInterfaceConfig {
  /** TCP port to listen on (default: 4951) */
  port: number;
  /** Host address to bind to (default: '127.0.0.1') */
  host: string;
  /** Command timeout in milliseconds (default: 60000) */
  timeout: number;
  /** Enable debug logging */
  debug: boolean;
  /** Directory for macro files (for file-based iimPlay). Empty string disables file loading. */
  macrosDir: string;
}

/**
 * Result of a Scripting Interface command
 */
export interface CommandResult {
  /** Return code indicating success or type of error */
  code: ReturnCode;
  /** Additional data (e.g., extracted text, error message) */
  data?: string;
}

/**
 * Parsed command from the TCP client
 */
export interface ParsedCommand {
  /** Command name (iimPlay, iimSet, etc.) */
  command: string;
  /** Command arguments */
  args: string[];
}

/**
 * Performance data from the last macro execution
 */
export interface PerformanceData {
  /** Total execution time in milliseconds */
  totalTimeMs: number;
  /** Start time as ISO 8601 string (UTC) */
  startTime: string;
  /** End time as ISO 8601 string (UTC) */
  endTime: string;
  /** Number of loops completed */
  loopsCompleted: number;
  /** Number of commands executed */
  commandsExecuted: number;
  /** Whether the macro completed successfully */
  success: boolean;
  /** Error code if failed (0 = success) */
  errorCode: number;
}

/**
 * Handler interface for macro execution
 */
export interface MacroHandler {
  /** Execute a macro by name or content */
  play(macroNameOrContent: string, timeout?: number): Promise<CommandResult>;
  /** Set a variable value */
  setVariable(name: string, value: string): void;
  /** Get a variable value */
  getVariable(name: string): string | undefined;
  /** Get the last extracted data */
  getLastExtract(): string;
  /** Get the last error message */
  getLastError(): string;
  /** Get performance data from the last macro execution */
  getLastPerformance(): PerformanceData | null;
  /** Check if a macro is currently running */
  isRunning(): boolean;
  /** Stop the currently running macro */
  stop(): void;
}

/**
 * Macro handler backed by the real MacroExecutor engine.
 *
 * This handler creates a MacroExecutor for each play() call, passes in
 * variables set via iimSet, runs the macro, and captures extract data
 * and error information for retrieval via iimGetLastExtract / iimGetLastError.
 *
 * External command handlers (for TAG, URL, etc.) can be registered via
 * registerCommandHandler() or registerCommandHandlers() so that the
 * executor can actually perform browser operations.
 */
export class ExecutorMacroHandler implements MacroHandler {
  private variables: Map<string, string> = new Map();
  private lastExtract: string = '';
  private lastError: string = '';
  private lastPerformance: PerformanceData | null = null;
  private running: boolean = false;
  private activeExecutor: MacroExecutor | null = null;
  private executorOptions: ExecutorOptions;
  private commandHandlers: Map<CommandType, ExecutorCommandHandler> = new Map();
  private handlerRegistrar: ((executor: MacroExecutor) => void) | null = null;

  constructor(options?: ExecutorOptions) {
    this.executorOptions = options ?? {};
  }

  /**
   * Register a single command handler that will be applied to each new executor.
   */
  registerCommandHandler(type: CommandType, handler: ExecutorCommandHandler): void {
    this.commandHandlers.set(type, handler);
  }

  /**
   * Register multiple command handlers at once.
   */
  registerCommandHandlers(handlers: Partial<Record<CommandType, ExecutorCommandHandler>>): void {
    for (const [type, handler] of Object.entries(handlers)) {
      if (handler) {
        this.commandHandlers.set(type as CommandType, handler);
      }
    }
  }

  /**
   * Set a callback that receives the executor before each play() call.
   * This allows the caller to register navigation, interaction, and extraction
   * handlers dynamically (e.g., registerNavigationHandlers(executor)).
   */
  setHandlerRegistrar(registrar: (executor: MacroExecutor) => void): void {
    this.handlerRegistrar = registrar;
  }

  async play(macroNameOrContent: string, timeout?: number): Promise<CommandResult> {
    this.running = true;
    this.lastError = '';
    this.lastExtract = '';
    this.lastPerformance = null;

    const startTime = new Date();
    let commandsExecuted = 0;

    try {
      // Build initial variables from iimSet calls
      const initialVariables: Record<string, string> = {};
      for (const [key, value] of this.variables) {
        initialVariables[key] = value;
      }

      // Create a fresh executor for this run
      const executor = createExecutor({
        ...this.executorOptions,
        initialVariables,
        onLog: this.executorOptions.onLog,
        onProgress: this.executorOptions.onProgress,
      });

      this.activeExecutor = executor;

      // Register extraction handlers (EXTRACT, SEARCH) by default
      // These are essential for the SI round-trip to work
      registerExtractionHandlers((type, handler) => executor.registerHandler(type as any, handler));

      // Register any additional command handlers
      for (const [type, handler] of this.commandHandlers) {
        executor.registerHandler(type, handler);
      }

      // Allow the registrar to set up handlers on this executor
      if (this.handlerRegistrar) {
        this.handlerRegistrar(executor);
      }

      // Load macro -- could be inline content or a macro name
      // The caller is responsible for resolving names to content if needed
      const parsed = executor.loadMacro(macroNameOrContent);

      // Check for parse errors -- if there are any, fail early
      if (parsed.errors.length > 0) {
        const firstError = parsed.errors[0];
        this.lastError = `Line ${firstError.lineNumber}: ${firstError.message}`;
        const endTime = new Date();
        this.lastPerformance = {
          totalTimeMs: endTime.getTime() - startTime.getTime(),
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          loopsCompleted: 0,
          commandsExecuted: 0,
          success: false,
          errorCode: ReturnCode.ERROR,
        };
        this.running = false;
        this.activeExecutor = null;
        return { code: ReturnCode.ERROR, data: this.lastError };
      }

      // Execute with optional timeout
      let result: MacroResult;
      if (timeout && timeout > 0) {
        result = await Promise.race([
          executor.execute(),
          new Promise<MacroResult>((_, reject) =>
            setTimeout(() => reject(new Error('Macro execution timeout')), timeout)
          ),
        ]);
      } else {
        result = await executor.execute();
      }

      // Capture extract data
      if (result.extractData && result.extractData.length > 0) {
        this.lastExtract = result.extractData.join('#NEXT#');
      }

      // Capture performance data and error info
      const endTime = new Date();
      const returnCode = result.success ? ReturnCode.OK : this.mapErrorCode(result.errorCode);

      this.lastPerformance = {
        totalTimeMs: result.executionTimeMs,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        loopsCompleted: result.loopsCompleted,
        commandsExecuted: commandsExecuted,
        success: result.success,
        errorCode: returnCode,
      };

      if (!result.success) {
        this.lastError = result.errorMessage ?? `Error code: ${result.errorCode}`;
        this.running = false;
        this.activeExecutor = null;

        // Map iMacros error codes to SI return codes
        return {
          code: returnCode,
          data: this.lastError,
        };
      }

      this.running = false;
      this.activeExecutor = null;
      return { code: ReturnCode.OK };
    } catch (error) {
      const endTime = new Date();
      const errorCode = error instanceof Error && error.message.includes('timeout')
        ? ReturnCode.TIMEOUT
        : ReturnCode.ERROR;

      this.lastPerformance = {
        totalTimeMs: endTime.getTime() - startTime.getTime(),
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        loopsCompleted: 0,
        commandsExecuted: commandsExecuted,
        success: false,
        errorCode: errorCode,
      };

      this.running = false;
      this.activeExecutor = null;
      this.lastError = error instanceof Error ? error.message : String(error);

      return { code: errorCode, data: this.lastError };
    }
  }

  setVariable(name: string, value: string): void {
    this.variables.set(name, value);
  }

  getVariable(name: string): string | undefined {
    return this.variables.get(name);
  }

  getLastExtract(): string {
    return this.lastExtract || '#nodata#';
  }

  getLastError(): string {
    return this.lastError;
  }

  getLastPerformance(): PerformanceData | null {
    return this.lastPerformance;
  }

  isRunning(): boolean {
    return this.running;
  }

  stop(): void {
    if (this.activeExecutor) {
      this.activeExecutor.stop();
      this.activeExecutor = null;
    }
    this.running = false;
  }

  /**
   * Get the currently active executor (useful for inspection during tests).
   */
  getActiveExecutor(): MacroExecutor | null {
    return this.activeExecutor;
  }

  /**
   * Map iMacros executor error codes to Scripting Interface return codes.
   */
  private mapErrorCode(errorCode: number): ReturnCode {
    if (errorCode === IMACROS_ERROR_CODES.OK) return ReturnCode.OK;
    if (errorCode === IMACROS_ERROR_CODES.TIMEOUT ||
        errorCode === IMACROS_ERROR_CODES.PAGE_TIMEOUT ||
        errorCode === IMACROS_ERROR_CODES.STEP_TIMEOUT) return ReturnCode.TIMEOUT;
    if (errorCode === IMACROS_ERROR_CODES.SYNTAX_ERROR ||
        errorCode === IMACROS_ERROR_CODES.INVALID_COMMAND) return ReturnCode.SYNTAX_ERROR;
    if (errorCode === IMACROS_ERROR_CODES.FILE_NOT_FOUND) return ReturnCode.MACRO_NOT_FOUND;
    if (errorCode === IMACROS_ERROR_CODES.INVALID_PARAMETER ||
        errorCode === IMACROS_ERROR_CODES.MISSING_PARAMETER) return ReturnCode.INVALID_PARAMETER;
    if (errorCode === IMACROS_ERROR_CODES.USER_ABORT) return ReturnCode.CANCELLED;
    return ReturnCode.ERROR;
  }
}

/**
 * TCP Scripting Interface Server
 *
 * Provides external program control of iMacros through a TCP socket interface.
 */
export class ScriptingInterfaceServer extends EventEmitter {
  private server: net.Server | null = null;
  private config: ScriptingInterfaceConfig;
  private handler: MacroHandler;
  private clients: Set<net.Socket> = new Set();

  /**
   * Create a new Scripting Interface server
   *
   * @param config - Server configuration options
   * @param handler - Macro handler for executing commands
   */
  constructor(
    config: Partial<ScriptingInterfaceConfig> = {},
    handler?: MacroHandler
  ) {
    super();

    this.config = {
      port: config.port ?? 4951,
      host: config.host ?? '127.0.0.1',
      timeout: config.timeout ?? 60000,
      debug: config.debug ?? false,
      macrosDir: config.macrosDir ?? '',
    };

    this.handler = handler ?? new ExecutorMacroHandler();
  }

  /**
   * Start the TCP server
   *
   * @returns Promise that resolves when server is listening
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        reject(new Error('Server is already running'));
        return;
      }

      this.server = net.createServer((socket) => {
        this.handleConnection(socket);
      });

      this.server.on('error', (error) => {
        this.log(`Server error: ${error.message}`);
        this.emit('error', error);
        reject(error);
      });

      this.server.listen(this.config.port, this.config.host, () => {
        this.log(`Scripting Interface server listening on ${this.config.host}:${this.config.port}`);
        this.emit('listening');
        resolve();
      });
    });
  }

  /**
   * Stop the TCP server
   *
   * @returns Promise that resolves when server has stopped
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }

      // Close all client connections
      this.clients.forEach((client) => {
        client.destroy();
      });
      this.clients.clear();

      this.server.close(() => {
        this.log('Scripting Interface server stopped');
        this.server = null;
        this.emit('close');
        resolve();
      });
    });
  }

  /**
   * Check if the server is running
   */
  isRunning(): boolean {
    return this.server !== null && this.server.listening;
  }

  /**
   * Get the current configuration
   */
  getConfig(): ScriptingInterfaceConfig {
    return { ...this.config };
  }

  /**
   * Update the macro handler
   */
  setHandler(handler: MacroHandler): void {
    this.handler = handler;
  }

  /**
   * Handle a new client connection
   */
  private handleConnection(socket: net.Socket): void {
    const clientId = `${socket.remoteAddress}:${socket.remotePort}`;
    this.log(`Client connected: ${clientId}`);
    this.clients.add(socket);
    this.emit('connection', socket);

    let buffer = '';

    socket.on('data', async (data) => {
      buffer += data.toString();

      // Process complete lines (commands are newline-terminated)
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine) {
          await this.processCommand(socket, trimmedLine);
        }
      }
    });

    socket.on('close', () => {
      this.log(`Client disconnected: ${clientId}`);
      this.clients.delete(socket);
      this.emit('disconnect', socket);
    });

    socket.on('error', (error) => {
      this.log(`Client error (${clientId}): ${error.message}`);
      this.clients.delete(socket);
    });
  }

  /**
   * Process a command received from a client
   */
  private async processCommand(socket: net.Socket, commandLine: string): Promise<void> {
    this.log(`Received command: ${commandLine}`);

    const parsed = this.parseCommand(commandLine);
    if (!parsed) {
      this.sendResponse(socket, ReturnCode.SYNTAX_ERROR, 'Invalid command syntax');
      return;
    }

    try {
      const result = await this.executeCommand(parsed);
      this.sendResponse(socket, result.code, result.data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.sendResponse(socket, ReturnCode.ERROR, errorMessage);
    }
  }

  /**
   * Parse a command line into command and arguments
   *
   * Supports formats:
   * - iimPlay("macro.iim")
   * - iimSet("varname", "value")
   * - iimGetLastExtract()
   * - iimGetLastError()
   */
  private parseCommand(commandLine: string): ParsedCommand | null {
    // Match command name and arguments in parentheses
    const match = commandLine.match(/^(\w+)\s*\((.*)\)\s*$/);
    if (!match) {
      return null;
    }

    const command = match[1];
    const argsString = match[2];

    // Parse arguments (handle quoted strings)
    const args = this.parseArguments(argsString);

    return { command, args };
  }

  /**
   * Parse argument string into array of arguments
   * Handles quoted strings with escaped quotes
   */
  private parseArguments(argsString: string): string[] {
    const args: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    let escaped = false;

    for (let i = 0; i < argsString.length; i++) {
      const char = argsString[i];

      if (escaped) {
        // Only consume the backslash for quote escapes; preserve it otherwise
        if (char !== '"' && char !== "'") {
          current += '\\';
        }
        current += char;
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (!inQuotes) {
        if (char === '"' || char === "'") {
          inQuotes = true;
          quoteChar = char;
          continue;
        }
        if (char === ',') {
          if (current.trim()) {
            args.push(current.trim());
          }
          current = '';
          continue;
        }
      } else {
        if (char === quoteChar) {
          inQuotes = false;
          quoteChar = '';
          continue;
        }
      }

      current += char;
    }

    if (current.trim()) {
      args.push(current.trim());
    }

    return args;
  }

  /**
   * Execute a parsed command
   */
  private async executeCommand(parsed: ParsedCommand): Promise<CommandResult> {
    const { command, args } = parsed;

    switch (command.toLowerCase()) {
      case 'iimplay':
        return this.handleIimPlay(args);

      case 'iimset':
        return this.handleIimSet(args);

      case 'iimgetlastextract':
      case 'iimgetextract':
        return this.handleIimGetLastExtract(args);

      case 'iimgetlasterror':
        return this.handleIimGetLastError();

      case 'iimstop':
        return this.handleIimStop();

      case 'iimexit':
      case 'iimclose': // Alias for iimExit (iMacros 8.9.7 compatibility)
        return this.handleIimExit();

      case 'iimdisplay':
        return this.handleIimDisplay(args);

      case 'iimgetstopwatch':
        return this.handleIimGetStopwatch(args);

      case 'iimgetlastperformance':
        return this.handleIimGetLastPerformance();

      default:
        return {
          code: ReturnCode.UNKNOWN_COMMAND,
          data: `Unknown command: ${command}`,
        };
    }
  }

  /**
   * Handle iimPlay command - Execute a macro
   *
   * @param args - [macroNameOrContent, timeout?]
   */
  private async handleIimPlay(args: string[]): Promise<CommandResult> {
    if (args.length < 1) {
      return {
        code: ReturnCode.INVALID_PARAMETER,
        data: 'iimPlay requires macro name or content',
      };
    }

    let macroNameOrContent = args[0];

    // Handle CODE: protocol - inline macro content
    if (macroNameOrContent.toUpperCase().startsWith('CODE:')) {
      macroNameOrContent = macroNameOrContent.substring(5);
      // Replace iMacros escape sequences (matching original 8.9.7 behavior)
      macroNameOrContent = macroNameOrContent.replace(/\[sp\]/gi, ' ');
      macroNameOrContent = macroNameOrContent.replace(/\[lf\]/gi, '\r');
      macroNameOrContent = macroNameOrContent.replace(/\[br\]/gi, '\n');
      // Convert literal \n sequences to actual newlines
      macroNameOrContent = macroNameOrContent.replace(/\\n/g, '\n');
    } else if (this.config.macrosDir) {
      // File-based macro loading: treat input as a file path
      let macroPath = macroNameOrContent;

      // Auto-append .iim extension if not present
      if (!/\.iim$/i.test(macroPath)) {
        macroPath += '.iim';
      }

      // Resolve relative paths against macrosDir
      if (!path.isAbsolute(macroPath)) {
        macroPath = path.join(this.config.macrosDir, macroPath);
      }

      try {
        if (!fs.existsSync(macroPath)) {
          return {
            code: ReturnCode.MACRO_NOT_FOUND,
            data: `Macro file not found: ${macroNameOrContent}`,
          };
        }
        macroNameOrContent = fs.readFileSync(macroPath, 'utf8');
      } catch (error) {
        return {
          code: ReturnCode.MACRO_NOT_FOUND,
          data: `Cannot open file: ${macroNameOrContent}`,
        };
      }
    }

    const timeout = args[1] ? parseInt(args[1], 10) : this.config.timeout;

    if (this.handler.isRunning()) {
      return {
        code: ReturnCode.MACRO_RUNNING,
        data: 'A macro is already running',
      };
    }

    this.emit('play', macroNameOrContent, timeout);
    return this.handler.play(macroNameOrContent, timeout);
  }

  /**
   * Handle iimSet command - Set a variable value
   *
   * @param args - [variableName, value]
   */
  private handleIimSet(args: string[]): CommandResult {
    if (args.length < 2) {
      return {
        code: ReturnCode.INVALID_PARAMETER,
        data: 'iimSet requires variable name and value',
      };
    }

    let [name, value] = args;

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

    this.handler.setVariable(name, value);
    this.emit('set', name, value);

    return { code: ReturnCode.OK };
  }

  /**
   * Handle iimGetLastExtract command - Get the last extracted data
   *
   * @param args - [n?] optional 1-based index to return nth value split on #NEXT#
   */
  private handleIimGetLastExtract(args: string[]): CommandResult {
    const extract = this.handler.getLastExtract();

    // If numeric arg provided, return nth value (1-based)
    if (args.length > 0) {
      const n = parseInt(args[0], 10);
      if (!isNaN(n) && n > 0) {
        if (extract === '#nodata#') {
          return { code: ReturnCode.OK, data: '#nodata#' };
        }
        const parts = extract.split('#NEXT#');
        if (n <= parts.length) {
          return { code: ReturnCode.OK, data: parts[n - 1] };
        }
        return { code: ReturnCode.OK, data: '#nodata#' };
      }
    }

    return { code: ReturnCode.OK, data: extract };
  }

  /**
   * Handle iimGetLastError command - Get the last error message
   */
  private handleIimGetLastError(): CommandResult {
    const error = this.handler.getLastError();
    return {
      code: ReturnCode.OK,
      data: error,
    };
  }

  /**
   * Handle iimStop command - Stop the currently running macro
   */
  private handleIimStop(): CommandResult {
    if (!this.handler.isRunning()) {
      return {
        code: ReturnCode.OK,
        data: 'No macro is running',
      };
    }

    this.handler.stop();
    this.emit('stop');
    return { code: ReturnCode.OK };
  }

  /**
   * Handle iimExit command - Disconnect client (server stays running)
   */
  private handleIimExit(): CommandResult {
    return { code: ReturnCode.OK };
  }

  /**
   * Handle iimDisplay command - Display a message
   *
   * @param args - [message, options?]
   */
  private handleIimDisplay(args: string[]): CommandResult {
    const message = args.length > 0 ? args[0] : '';
    this.emit('display', message);
    return { code: ReturnCode.OK };
  }

  /**
   * Handle iimGetStopwatch command - Get elapsed time of a stopwatch
   *
   * @param args - [stopwatchId?]
   */
  private handleIimGetStopwatch(args: string[]): CommandResult {
    const id = args.length > 0 ? args[0] : undefined;
    const elapsed = getStopwatchElapsed(id);
    return { code: ReturnCode.OK, data: String(elapsed) };
  }

  /**
   * Handle iimGetLastPerformance command - Get performance data from last macro execution
   *
   * Returns timing data from the last macro run as a JSON string containing:
   * - totalTimeMs: Total execution time in milliseconds
   * - startTime: Start time as ISO 8601 string (UTC)
   * - endTime: End time as ISO 8601 string (UTC)
   * - loopsCompleted: Number of loops completed
   * - commandsExecuted: Number of commands executed
   * - success: Whether the macro completed successfully
   * - errorCode: Error code if failed (1 = success)
   */
  private handleIimGetLastPerformance(): CommandResult {
    const performance = this.handler.getLastPerformance();
    if (!performance) {
      return {
        code: ReturnCode.OK,
        data: '',
      };
    }
    return {
      code: ReturnCode.OK,
      data: JSON.stringify(performance),
    };
  }

  /**
   * Send a response to the client
   *
   * Response format: CODE\tDATA\n
   */
  private sendResponse(socket: net.Socket, code: ReturnCode, data?: string): void {
    const response = data !== undefined ? `${code}\t${data}\n` : `${code}\n`;
    this.log(`Sending response: ${response.trim()}`);

    try {
      socket.write(response);
    } catch (error) {
      this.log(`Failed to send response: ${error}`);
    }
  }

  /**
   * Log a message if debug is enabled
   */
  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[ScriptingInterface] ${message}`);
    }
  }
}

/**
 * Create and start a Scripting Interface server
 *
 * @param config - Server configuration options
 * @param handler - Macro handler for executing commands
 * @returns The started server instance
 *
 * @example
 * ```typescript
 * const server = await createScriptingInterfaceServer({ port: 4951 });
 *
 * server.on('play', (macro, timeout) => {
 *   console.log(`Playing macro: ${macro}`);
 * });
 * ```
 */
export async function createScriptingInterfaceServer(
  config?: Partial<ScriptingInterfaceConfig>,
  handler?: MacroHandler
): Promise<ScriptingInterfaceServer> {
  const server = new ScriptingInterfaceServer(config, handler);
  await server.start();
  return server;
}

export default ScriptingInterfaceServer;
