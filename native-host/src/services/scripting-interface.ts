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
 */
import * as net from 'net';
import { EventEmitter } from 'events';

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
  /** Check if a macro is currently running */
  isRunning(): boolean;
  /** Stop the currently running macro */
  stop(): void;
}

/**
 * Default macro handler implementation (placeholder)
 * This should be replaced with actual implementation that connects to the extension
 */
export class DefaultMacroHandler implements MacroHandler {
  private variables: Map<string, string> = new Map();
  private lastExtract: string = '';
  private lastError: string = '';
  private running: boolean = false;

  async play(macroNameOrContent: string, timeout?: number): Promise<CommandResult> {
    // Placeholder implementation
    // In production, this would communicate with the browser extension
    this.running = true;
    this.lastError = '';
    this.lastExtract = '';

    try {
      // Simulate macro execution
      // TODO: Connect to browser extension for actual execution
      console.log(`[SI] Executing macro: ${macroNameOrContent}`);

      // For now, return success
      // Real implementation would await actual macro completion
      this.running = false;
      return { code: ReturnCode.OK };
    } catch (error) {
      this.running = false;
      this.lastError = error instanceof Error ? error.message : String(error);
      return { code: ReturnCode.ERROR, data: this.lastError };
    }
  }

  setVariable(name: string, value: string): void {
    this.variables.set(name, value);
  }

  getVariable(name: string): string | undefined {
    return this.variables.get(name);
  }

  getLastExtract(): string {
    return this.lastExtract;
  }

  getLastError(): string {
    return this.lastError;
  }

  isRunning(): boolean {
    return this.running;
  }

  stop(): void {
    this.running = false;
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
    };

    this.handler = handler ?? new DefaultMacroHandler();
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
        return this.handleIimGetLastExtract();

      case 'iimgetlasterror':
        return this.handleIimGetLastError();

      case 'iimstop':
        return this.handleIimStop();

      case 'iimexit':
        return this.handleIimExit();

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

    const macroNameOrContent = args[0];
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

    const [name, value] = args;
    this.handler.setVariable(name, value);
    this.emit('set', name, value);

    return { code: ReturnCode.OK };
  }

  /**
   * Handle iimGetLastExtract command - Get the last extracted data
   */
  private handleIimGetLastExtract(): CommandResult {
    const extract = this.handler.getLastExtract();
    return {
      code: ReturnCode.OK,
      data: extract,
    };
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
