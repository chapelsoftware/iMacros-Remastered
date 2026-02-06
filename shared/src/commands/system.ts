/**
 * System Command Handlers for iMacros
 *
 * Implements handlers for system-level commands:
 * - CMDLINE: Execute shell commands via child_process
 * - DISCONNECT/REDIAL: Network connection control (OS-specific)
 * - STOPWATCH: Start/stop/lap timing functionality
 * - VERSION: Return iMacros version information
 */

import {
  CommandHandler,
  CommandContext,
  CommandResult,
  IMACROS_ERROR_CODES,
} from '../executor';
import type { CommandType } from '../parser';

// ===== Version Information =====

/**
 * iMacros version information
 */
export interface VersionInfo {
  /** Major version number */
  major: number;
  /** Minor version number */
  minor: number;
  /** Patch version number */
  patch: number;
  /** Full version string */
  version: string;
  /** Build identifier */
  build?: string;
  /** Platform (firefox, chrome, etc.) */
  platform: string;
}

/**
 * Default version info - can be overridden by setVersionInfo
 */
let versionInfo: VersionInfo = {
  major: 8,
  minor: 9,
  patch: 7,
  version: '8.9.7',
  platform: 'firefox',
};

/**
 * Set the version information
 */
export function setVersionInfo(info: Partial<VersionInfo>): void {
  versionInfo = { ...versionInfo, ...info };
}

/**
 * Get the current version information
 */
export function getVersionInfo(): VersionInfo {
  return { ...versionInfo };
}

// ===== Stopwatch State =====

/**
 * Stopwatch data structure
 */
interface StopwatchData {
  /** Start time in milliseconds */
  startTime: number;
  /** Lap times in milliseconds (relative to start) */
  lapTimes: number[];
  /** Is the stopwatch running */
  running: boolean;
  /** Accumulated time when stopped (for pause/resume) */
  accumulated: number;
}

/**
 * Global stopwatch instances keyed by ID
 */
const stopwatches: Map<string, StopwatchData> = new Map();

/**
 * Default stopwatch ID when not specified
 */
const DEFAULT_STOPWATCH_ID = 'default';

/**
 * Get or create a stopwatch
 */
function getStopwatch(id: string = DEFAULT_STOPWATCH_ID): StopwatchData {
  let sw = stopwatches.get(id);
  if (!sw) {
    sw = {
      startTime: 0,
      lapTimes: [],
      running: false,
      accumulated: 0,
    };
    stopwatches.set(id, sw);
  }
  return sw;
}

/**
 * Clear a stopwatch
 */
export function clearStopwatch(id: string = DEFAULT_STOPWATCH_ID): void {
  stopwatches.delete(id);
}

/**
 * Clear all stopwatches
 */
export function clearAllStopwatches(): void {
  stopwatches.clear();
}

// ===== Command Line Execution Interface =====

/**
 * Options for command line execution
 */
export interface CmdlineOptions {
  /** Command to execute */
  command: string;
  /** Working directory */
  cwd?: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Whether to wait for command completion */
  wait?: boolean;
}

/**
 * Result of command line execution
 */
export interface CmdlineResult {
  /** Exit code */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
}

/**
 * Interface for executing command line commands
 * Must be provided by the host environment (native messaging or extension)
 */
export interface CmdlineExecutor {
  /**
   * Execute a command line command
   */
  execute(options: CmdlineOptions): Promise<CmdlineResult>;
}

/**
 * Default command executor (logs warning, no-op)
 */
let cmdlineExecutor: CmdlineExecutor | null = null;

/**
 * Set the command line executor
 */
export function setCmdlineExecutor(executor: CmdlineExecutor): void {
  cmdlineExecutor = executor;
}

/**
 * Get the current command line executor
 */
export function getCmdlineExecutor(): CmdlineExecutor | null {
  return cmdlineExecutor;
}

// ===== Network Connection Interface =====

/**
 * Interface for network connection management
 * OS-specific implementation required
 */
export interface NetworkManager {
  /**
   * Disconnect from network
   */
  disconnect(): Promise<boolean>;

  /**
   * Reconnect to network (redial)
   */
  redial(): Promise<boolean>;
}

/**
 * Default network manager (no-op)
 */
let networkManager: NetworkManager | null = null;

/**
 * Set the network manager
 */
export function setNetworkManager(manager: NetworkManager): void {
  networkManager = manager;
}

/**
 * Get the current network manager
 */
export function getNetworkManager(): NetworkManager | null {
  return networkManager;
}

// ===== Command Handlers =====

/**
 * VERSION command handler
 *
 * Syntax: VERSION BUILD=<min-version>
 * Checks if the current iMacros version meets the minimum required version.
 * Also stores version info in system variables.
 *
 * Examples:
 * - VERSION BUILD=8.0.0
 * - VERSION BUILD=8.9.7
 */
export const versionHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const buildParam = ctx.getParam('BUILD');

  // Store version info in variables
  ctx.state.setVariable('!VERSION', versionInfo.version);
  ctx.state.setVariable('!VERSION_MAJOR', versionInfo.major);
  ctx.state.setVariable('!VERSION_MINOR', versionInfo.minor);
  ctx.state.setVariable('!VERSION_PATCH', versionInfo.patch);
  ctx.state.setVariable('!PLATFORM', versionInfo.platform);

  ctx.log('info', `iMacros version ${versionInfo.version} (${versionInfo.platform})`);

  if (buildParam) {
    const requiredVersion = ctx.expand(buildParam);

    // Parse version strings
    const parseVersion = (v: string): number[] => {
      return v.split('.').map(n => parseInt(n, 10) || 0);
    };

    const current = parseVersion(versionInfo.version);
    const required = parseVersion(requiredVersion);

    // Compare versions
    for (let i = 0; i < Math.max(current.length, required.length); i++) {
      const c = current[i] || 0;
      const r = required[i] || 0;

      if (c < r) {
        return {
          success: false,
          errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
          errorMessage: `This macro requires iMacros version ${requiredVersion} or higher. Current version: ${versionInfo.version}`,
        };
      }
      if (c > r) {
        break; // Current version is higher, OK
      }
    }

    ctx.log('debug', `Version check passed: ${versionInfo.version} >= ${requiredVersion}`);
  }

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
    output: versionInfo.version,
  };
};

/**
 * STOPWATCH command handler
 *
 * Syntax:
 * - STOPWATCH ID=<id> ACTION=START - Start/reset a stopwatch
 * - STOPWATCH ID=<id> ACTION=STOP - Stop a stopwatch
 * - STOPWATCH ID=<id> ACTION=LAP - Record a lap time
 * - STOPWATCH ID=<id> ACTION=READ - Read current elapsed time
 *
 * Time is stored in !STOPWATCH_<ID> variable in milliseconds.
 * If ID is omitted, uses "default".
 *
 * Examples:
 * - STOPWATCH ID=timer1 ACTION=START
 * - STOPWATCH ACTION=START
 * - STOPWATCH ID=timer1 ACTION=LAP
 * - STOPWATCH ID=timer1 ACTION=STOP
 */
export const stopwatchHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const idParam = ctx.getParam('ID');
  const actionParam = ctx.getParam('ACTION');

  const id = idParam ? ctx.expand(idParam) : DEFAULT_STOPWATCH_ID;
  const action = actionParam ? ctx.expand(actionParam).toUpperCase() : 'START';

  const sw = getStopwatch(id);
  const varName = id === DEFAULT_STOPWATCH_ID ? '!STOPWATCH' : `!STOPWATCH_${id.toUpperCase()}`;

  switch (action) {
    case 'START': {
      // Start or reset the stopwatch
      sw.startTime = Date.now();
      sw.lapTimes = [];
      sw.running = true;
      sw.accumulated = 0;

      ctx.state.setVariable(varName, 0);
      ctx.log('info', `Stopwatch "${id}" started`);

      return {
        success: true,
        errorCode: IMACROS_ERROR_CODES.OK,
      };
    }

    case 'STOP': {
      if (!sw.running) {
        ctx.log('warn', `Stopwatch "${id}" is not running`);
        return {
          success: true,
          errorCode: IMACROS_ERROR_CODES.OK,
        };
      }

      const elapsed = Date.now() - sw.startTime + sw.accumulated;
      sw.running = false;
      sw.accumulated = elapsed;

      ctx.state.setVariable(varName, elapsed);
      ctx.log('info', `Stopwatch "${id}" stopped at ${elapsed}ms`);

      return {
        success: true,
        errorCode: IMACROS_ERROR_CODES.OK,
        output: String(elapsed),
      };
    }

    case 'LAP': {
      if (!sw.running) {
        return {
          success: false,
          errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
          errorMessage: `Stopwatch "${id}" is not running`,
        };
      }

      const lapTime = Date.now() - sw.startTime;
      sw.lapTimes.push(lapTime);

      const lapNumber = sw.lapTimes.length;
      const lapVarName = `${varName}_LAP${lapNumber}`;

      ctx.state.setVariable(varName, lapTime);
      ctx.state.setVariable(lapVarName, lapTime);
      ctx.log('info', `Stopwatch "${id}" lap ${lapNumber}: ${lapTime}ms`);

      return {
        success: true,
        errorCode: IMACROS_ERROR_CODES.OK,
        output: String(lapTime),
      };
    }

    case 'READ': {
      let elapsed: number;
      if (sw.running) {
        elapsed = Date.now() - sw.startTime + sw.accumulated;
      } else {
        elapsed = sw.accumulated;
      }

      ctx.state.setVariable(varName, elapsed);
      ctx.log('debug', `Stopwatch "${id}" read: ${elapsed}ms`);

      return {
        success: true,
        errorCode: IMACROS_ERROR_CODES.OK,
        output: String(elapsed),
      };
    }

    default:
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
        errorMessage: `Invalid STOPWATCH action: ${action}. Valid actions: START, STOP, LAP, READ`,
      };
  }
};

/**
 * CMDLINE command handler
 *
 * Syntax: CMDLINE CMD=<command> [WAIT=YES|NO] [TIMEOUT=<seconds>]
 * Executes a shell command via the native messaging host.
 *
 * Parameters:
 * - CMD: The command to execute
 * - WAIT: Whether to wait for completion (default: YES)
 * - TIMEOUT: Maximum execution time in seconds (default: 30)
 *
 * Results are stored in:
 * - !CMDLINE_EXITCODE: Exit code of the command
 * - !CMDLINE_STDOUT: Standard output
 * - !CMDLINE_STDERR: Standard error
 *
 * Examples:
 * - CMDLINE CMD="dir /b"
 * - CMDLINE CMD="notepad.exe" WAIT=NO
 * - CMDLINE CMD="ping -n 1 localhost" TIMEOUT=10
 *
 * SECURITY NOTE: This command requires native messaging host support
 * and appropriate permissions.
 */
export const cmdlineHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const cmdParam = ctx.getParam('CMD');

  if (!cmdParam) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'CMDLINE command requires CMD parameter',
    };
  }

  const command = ctx.expand(cmdParam);
  const waitParam = ctx.getParam('WAIT');
  const timeoutParam = ctx.getParam('TIMEOUT');

  const wait = waitParam ? ctx.expand(waitParam).toUpperCase() !== 'NO' : true;
  const timeoutSeconds = timeoutParam ? parseFloat(ctx.expand(timeoutParam)) : 30;
  const timeoutMs = Math.max(1000, timeoutSeconds * 1000);

  ctx.log('info', `Executing command: ${command}`);

  if (!cmdlineExecutor) {
    ctx.log('warn', 'No command line executor configured - CMDLINE command requires native messaging support');
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: 'CMDLINE command requires native messaging support. No executor configured.',
    };
  }

  try {
    const result = await cmdlineExecutor.execute({
      command,
      timeout: timeoutMs,
      wait,
    });

    // Store results in variables
    ctx.state.setVariable('!CMDLINE_EXITCODE', result.exitCode);
    ctx.state.setVariable('!CMDLINE_STDOUT', result.stdout);
    ctx.state.setVariable('!CMDLINE_STDERR', result.stderr);

    const success = result.exitCode === 0;

    ctx.log(success ? 'info' : 'warn', `Command exited with code ${result.exitCode}`);

    if (result.stdout) {
      ctx.log('debug', `stdout: ${result.stdout.substring(0, 500)}`);
    }
    if (result.stderr) {
      ctx.log('warn', `stderr: ${result.stderr.substring(0, 500)}`);
    }

    return {
      success,
      errorCode: success ? IMACROS_ERROR_CODES.OK : IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: success ? undefined : `Command failed with exit code ${result.exitCode}`,
      output: result.stdout,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    ctx.log('error', `Command execution failed: ${errorMessage}`);

    ctx.state.setVariable('!CMDLINE_EXITCODE', -1);
    ctx.state.setVariable('!CMDLINE_STDOUT', '');
    ctx.state.setVariable('!CMDLINE_STDERR', errorMessage);

    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: `Command execution failed: ${errorMessage}`,
    };
  }
};

/**
 * DISCONNECT command handler
 *
 * Syntax: DISCONNECT
 * Disconnects from the network. This is OS-specific and requires
 * a native messaging host or OS-specific implementation.
 *
 * Primarily used for dial-up connections or VPN disconnect.
 */
export const disconnectHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  ctx.log('info', 'Disconnecting from network...');

  if (!networkManager) {
    ctx.log('warn', 'No network manager configured - DISCONNECT command requires OS-specific implementation');
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: 'DISCONNECT command requires OS-specific native support. No network manager configured.',
    };
  }

  try {
    const success = await networkManager.disconnect();

    if (success) {
      ctx.log('info', 'Network disconnected successfully');
      return {
        success: true,
        errorCode: IMACROS_ERROR_CODES.OK,
      };
    } else {
      ctx.log('warn', 'Failed to disconnect from network');
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
        errorMessage: 'Failed to disconnect from network',
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    ctx.log('error', `Disconnect failed: ${errorMessage}`);

    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: `Disconnect failed: ${errorMessage}`,
    };
  }
};

/**
 * REDIAL command handler
 *
 * Syntax: REDIAL [CONNECTION=<name>]
 * Reconnects to the network/dials a connection. This is OS-specific
 * and requires a native messaging host or OS-specific implementation.
 *
 * Parameters:
 * - CONNECTION: Optional name of the dial-up/VPN connection
 *
 * Primarily used for dial-up connections or VPN reconnect.
 */
export const redialHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const connectionParam = ctx.getParam('CONNECTION');
  const connectionName = connectionParam ? ctx.expand(connectionParam) : undefined;

  ctx.log('info', connectionName
    ? `Redialing connection: ${connectionName}`
    : 'Redialing network connection...'
  );

  if (!networkManager) {
    ctx.log('warn', 'No network manager configured - REDIAL command requires OS-specific implementation');
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: 'REDIAL command requires OS-specific native support. No network manager configured.',
    };
  }

  try {
    const success = await networkManager.redial();

    if (success) {
      ctx.log('info', 'Network reconnected successfully');
      return {
        success: true,
        errorCode: IMACROS_ERROR_CODES.OK,
      };
    } else {
      ctx.log('warn', 'Failed to redial network connection');
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
        errorMessage: 'Failed to redial network connection',
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    ctx.log('error', `Redial failed: ${errorMessage}`);

    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: `Redial failed: ${errorMessage}`,
    };
  }
};

// ===== Handler Registration =====

/**
 * All system command handlers
 */
export const systemHandlers: Partial<Record<CommandType, CommandHandler>> = {
  VERSION: versionHandler,
  STOPWATCH: stopwatchHandler,
  CMDLINE: cmdlineHandler,
  DISCONNECT: disconnectHandler,
  REDIAL: redialHandler,
};

/**
 * Register system handlers with an executor
 */
export function registerSystemHandlers(
  registerFn: (type: CommandType, handler: CommandHandler) => void
): void {
  for (const [type, handler] of Object.entries(systemHandlers)) {
    if (handler) {
      registerFn(type as CommandType, handler);
    }
  }
}

// ===== Exports =====

export type { CommandHandler, CommandContext, CommandResult };
