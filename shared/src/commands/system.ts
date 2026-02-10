/**
 * System Command Handlers for iMacros
 *
 * Implements handlers for system-level commands:
 * - CMDLINE: Set variables from command-line arguments (original iMacros 8.9.7)
 * - EXEC: Execute shell commands via child_process
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
 * Stopwatch record: captured when a stopwatch is stopped or a label is recorded.
 * Used for CSV output and iimGetLastPerformance().
 */
export interface StopwatchRecord {
  /** Stopwatch ID (e.g. "Total", "Firstpage") or label name */
  id: string;
  /** Elapsed time in seconds (3 decimal places) */
  elapsedSec: string;
  /** Timestamp when the record was captured */
  timestamp: Date;
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
 * Global start time for LABEL elapsed time calculation.
 * Set when the first stopwatch is started in a session.
 */
let globalStartTime: number | null = null;

/**
 * Accumulated stopwatch records for the current macro run.
 * Populated when stopwatches are stopped or labels are recorded.
 */
const stopwatchRecords: StopwatchRecord[] = [];

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
  stopwatches.delete(id === DEFAULT_STOPWATCH_ID ? id : id.toUpperCase());
}

/**
 * Clear all stopwatches
 */
export function clearAllStopwatches(): void {
  stopwatches.clear();
  globalStartTime = null;
  stopwatchRecords.length = 0;
}

/**
 * Get all stopwatch records collected during the current macro run.
 */
export function getStopwatchRecords(): StopwatchRecord[] {
  return [...stopwatchRecords];
}

/**
 * Clear stopwatch records (call at start of macro execution).
 */
export function clearStopwatchRecords(): void {
  stopwatchRecords.length = 0;
}

/**
 * Build CSV content for stopwatch records (matching original iMacros 8.9.7 format).
 *
 * Format:
 * - Header line (if includeHeader=true): "Date: YYYY/MM/DD  Time: HH:MM, Macro: <name>, Status: <message> (<code>)"
 * - Blank line
 * - One data row per record: YYYY/MM/DD,HH:MM:SS,<ID>,<elapsed seconds>
 *
 * @param records - Stopwatch records to include
 * @param macroName - Name of the macro
 * @param errorCode - Final error code (0 = success)
 * @param errorMessage - Error message (or "OK" for success)
 * @param includeHeader - Whether to include the header line
 */
export function buildStopwatchCsv(
  records: StopwatchRecord[],
  macroName: string,
  errorCode: number,
  errorMessage: string,
  includeHeader: boolean
): string {
  const lines: string[] = [];

  if (includeHeader) {
    const now = new Date();
    const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    lines.push(`"Date: ${dateStr}  Time: ${timeStr}, Macro: ${macroName}, Status: ${errorMessage} (${errorCode})"`);
    lines.push('');
  }

  for (const record of records) {
    const ts = record.timestamp;
    const dateStr = `${ts.getFullYear()}/${String(ts.getMonth() + 1).padStart(2, '0')}/${String(ts.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}:${String(ts.getSeconds()).padStart(2, '0')}`;
    lines.push(`${dateStr},${timeStr},${record.id},${record.elapsedSec}`);
  }

  return lines.join('\n') + '\n';
}

/**
 * Get the elapsed time of a stopwatch in milliseconds
 * Returns the elapsed time, or 0 if the stopwatch doesn't exist
 */
export function getStopwatchElapsed(id: string = DEFAULT_STOPWATCH_ID): number {
  const lookupId = id === DEFAULT_STOPWATCH_ID ? id : id.toUpperCase();
  const sw = stopwatches.get(lookupId);
  if (!sw) {
    return 0;
  }
  if (sw.running) {
    return Date.now() - sw.startTime + sw.accumulated;
  }
  return sw.accumulated;
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

    // Old iMacros macros use integer build numbers (e.g. VERSION BUILD=7500718).
    // These are not comparable to semver-style versions (8.9.7).
    // In the original iMacros, VERSION was a no-op, so skip comparison for these.
    const isOldStyleBuild = /^\d+$/.test(requiredVersion);
    if (isOldStyleBuild) {
      ctx.log('debug', `Skipping version comparison for old-style build number: ${requiredVersion}`);
    } else {
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
 * Supports original iMacros 8.9.7 syntax:
 * - STOPWATCH ID=<id>                   - Toggle: start if not running, stop if running
 * - STOPWATCH START ID=<id>             - Explicit start (error if already running)
 * - STOPWATCH STOP ID=<id>              - Explicit stop (error if not running)
 * - STOPWATCH LABEL=<name>              - Record a timestamp label
 * - STOPWATCH ID=<id> ACTION=START      - Extended syntax: explicit start
 * - STOPWATCH ID=<id> ACTION=STOP       - Extended syntax: explicit stop
 * - STOPWATCH ID=<id> ACTION=LAP        - Record a lap time
 * - STOPWATCH ID=<id> ACTION=READ       - Read current elapsed time
 *
 * Time is stored in !STOPWATCH_<ID> variable in milliseconds.
 * !STOPWATCHTIME is set on stop and label operations (seconds, 3 decimal places).
 * If ID is omitted, uses "default".
 *
 * Error codes (matching original iMacros):
 * - 961: START on already-running stopwatch
 * - 962: STOP on non-existent/not-started stopwatch
 */
export const stopwatchHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const idParam = ctx.getParam('ID');
  const actionParam = ctx.getParam('ACTION');
  const labelParam = ctx.getParam('LABEL');

  // Check for original prefix syntax: STOPWATCH START ID=x / STOPWATCH STOP ID=x
  // These appear as boolean flag parameters (key=START/STOP, value=true)
  const hasStartFlag = ctx.getParam('START') === 'true';
  const hasStopFlag = ctx.getParam('STOP') === 'true';

  // Handle LABEL parameter - records a timestamp label
  if (labelParam) {
    const labelName = ctx.expand(labelParam).toUpperCase();
    const elapsed = Date.now() - (globalStartTime || Date.now());
    const elapsedSec = (elapsed / 1000).toFixed(3);

    ctx.state.setVariable('!STOPWATCHTIME', elapsedSec);
    ctx.log('info', `Stopwatch label "${labelName}": ${elapsed}ms`);

    // Record for CSV output and performance API
    stopwatchRecords.push({ id: labelName, elapsedSec, timestamp: new Date() });

    return {
      success: true,
      errorCode: IMACROS_ERROR_CODES.OK,
      output: String(elapsed),
    };
  }

  const id = idParam ? ctx.expand(idParam).toUpperCase() : DEFAULT_STOPWATCH_ID;

  // Determine action from prefix flags, ACTION param, or default to toggle
  let action: string;
  if (hasStartFlag) {
    action = 'START';
  } else if (hasStopFlag) {
    action = 'STOP';
  } else if (actionParam) {
    action = ctx.expand(actionParam).toUpperCase();
  } else {
    // No action specified - toggle behavior (original iMacros default)
    action = 'TOGGLE';
  }

  const sw = getStopwatch(id);
  const varName = id === DEFAULT_STOPWATCH_ID ? '!STOPWATCH' : `!STOPWATCH_${id}`;

  switch (action) {
    case 'TOGGLE': {
      // Original iMacros behavior: if running, stop it; if not running, start it
      if (sw.running) {
        // Stop
        const elapsed = Date.now() - sw.startTime + sw.accumulated;
        sw.running = false;
        sw.accumulated = elapsed;
        const elapsedSec = (elapsed / 1000).toFixed(3);

        ctx.state.setVariable(varName, elapsed);
        ctx.state.setVariable('!STOPWATCHTIME', elapsedSec);
        ctx.log('info', `Stopwatch "${id}" stopped at ${elapsed}ms`);

        // Record for CSV output and performance API
        const recordId = id === DEFAULT_STOPWATCH_ID ? 'default' : id;
        stopwatchRecords.push({ id: recordId, elapsedSec, timestamp: new Date() });

        return {
          success: true,
          errorCode: IMACROS_ERROR_CODES.OK,
          output: String(elapsed),
        };
      } else {
        // Start
        sw.startTime = Date.now();
        sw.lapTimes = [];
        sw.running = true;
        sw.accumulated = 0;
        if (!globalStartTime) globalStartTime = Date.now();

        ctx.state.setVariable(varName, 0);
        ctx.log('info', `Stopwatch "${id}" started`);

        return {
          success: true,
          errorCode: IMACROS_ERROR_CODES.OK,
        };
      }
    }

    case 'START': {
      // Explicit start - error if already running (original error 961)
      if (sw.running) {
        return {
          success: false,
          errorCode: IMACROS_ERROR_CODES.STOPWATCH_ALREADY_STARTED,
          errorMessage: `Stopwatch ID=${id} already started`,
        };
      }

      sw.startTime = Date.now();
      sw.lapTimes = [];
      sw.running = true;
      sw.accumulated = 0;
      if (!globalStartTime) globalStartTime = Date.now();

      ctx.state.setVariable(varName, 0);
      ctx.log('info', `Stopwatch "${id}" started`);

      return {
        success: true,
        errorCode: IMACROS_ERROR_CODES.OK,
      };
    }

    case 'STOP': {
      if (!sw.running) {
        // Original error 962: stop on non-existent/not-started stopwatch
        return {
          success: false,
          errorCode: IMACROS_ERROR_CODES.STOPWATCH_NOT_STARTED,
          errorMessage: `Stopwatch ID=${id} wasn't started`,
        };
      }

      const elapsed = Date.now() - sw.startTime + sw.accumulated;
      sw.running = false;
      sw.accumulated = elapsed;
      const elapsedSec = (elapsed / 1000).toFixed(3);

      ctx.state.setVariable(varName, elapsed);
      ctx.state.setVariable('!STOPWATCHTIME', elapsedSec);
      ctx.log('info', `Stopwatch "${id}" stopped at ${elapsed}ms`);

      // Record for CSV output and performance API
      const recordId = id === DEFAULT_STOPWATCH_ID ? 'default' : id;
      stopwatchRecords.push({ id: recordId, elapsedSec, timestamp: new Date() });

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
      const lapTimeSec = (lapTime / 1000).toFixed(3);

      ctx.state.setVariable(varName, lapTime);
      ctx.state.setVariable(lapVarName, lapTime);
      ctx.state.setVariable('!STOPWATCHTIME', lapTimeSec);
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
 * EXEC command handler (formerly CMDLINE)
 *
 * Syntax: EXEC CMD=<command> [WAIT=YES|NO] [TIMEOUT=<seconds>]
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
 * - EXEC CMD="dir /b"
 * - EXEC CMD="notepad.exe" WAIT=NO
 * - EXEC CMD="ping -n 1 localhost" TIMEOUT=10
 *
 * SECURITY NOTE: This command requires native messaging host support
 * and appropriate permissions.
 */
export const execHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const cmdParam = ctx.getParam('CMD');

  if (!cmdParam) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'EXEC command requires CMD parameter',
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
    ctx.log('warn', 'No command line executor configured - EXEC command requires native messaging support');
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: 'EXEC command requires native messaging support. No executor configured.',
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

// ===== Supported system variables for CMDLINE =====

/**
 * System variables that can be set via CMDLINE command.
 * Matches original iMacros 8.9.7 behavior.
 */
const CMDLINE_SUPPORTED_SYSVARS = new Set([
  '!TIMEOUT', '!LOOP', '!DATASOURCE',
  '!VAR0', '!VAR1', '!VAR2', '!VAR3', '!VAR4',
  '!VAR5', '!VAR6', '!VAR7', '!VAR8', '!VAR9',
]);

/**
 * CMDLINE command handler (original iMacros 8.9.7 semantics)
 *
 * Syntax: CMDLINE <variable> <value>
 * Sets variables from command-line arguments.
 *
 * Supported system variables:
 * - !TIMEOUT: Sets macro timeout
 * - !LOOP: Sets current loop counter
 * - !DATASOURCE: Loads datasource file
 * - !VAR0 through !VAR9: Sets user system variables
 *
 * User-defined variables must already exist (via SET), otherwise
 * throws 'unknown variable' error.
 *
 * Examples:
 * - CMDLINE !VAR1 myvalue
 * - CMDLINE !TIMEOUT 30
 * - CMDLINE !LOOP 5
 * - CMDLINE myvar somevalue  (myvar must already exist from SET)
 */
export const cmdlineHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  // CMDLINE uses positional parameters: first = variable name, second = value
  const params = ctx.command.parameters;

  if (params.length < 2) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'CMDLINE command requires variable name and value',
    };
  }

  const varName = ctx.expand(params[0].key);
  const value = ctx.expand(params[1].key);
  const upperVarName = varName.toUpperCase();

  ctx.log('info', `CMDLINE: Setting ${varName} = ${value}`);

  // System variable
  if (upperVarName.startsWith('!')) {
    if (!CMDLINE_SUPPORTED_SYSVARS.has(upperVarName)) {
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
        errorMessage: `CMDLINE: Unsupported system variable: ${varName}`,
      };
    }

    // Special handling for specific system variables
    if (upperVarName === '!TIMEOUT') {
      const seconds = parseFloat(value);
      if (isNaN(seconds) || seconds <= 0) {
        return {
          success: false,
          errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
          errorMessage: `CMDLINE: Invalid timeout value: ${value}`,
        };
      }
      ctx.state.setVariable('!TIMEOUT', seconds);
      ctx.log('debug', `CMDLINE: Set !TIMEOUT to ${seconds} seconds`);
    } else if (upperVarName === '!LOOP') {
      const loopNum = parseInt(value, 10);
      if (isNaN(loopNum)) {
        return {
          success: false,
          errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
          errorMessage: `CMDLINE: Invalid loop value: ${value}`,
        };
      }
      ctx.state.setVariable('!LOOP', loopNum);
      ctx.log('debug', `CMDLINE: Set !LOOP to ${loopNum}`);
    } else if (upperVarName === '!DATASOURCE') {
      ctx.state.setVariable('!DATASOURCE', value);
      ctx.log('debug', `CMDLINE: Set !DATASOURCE to ${value}`);
    } else {
      // !VAR0-9
      ctx.state.setVariable(upperVarName, value);
      ctx.log('debug', `CMDLINE: Set ${upperVarName} to ${value}`);
    }

    return {
      success: true,
      errorCode: IMACROS_ERROR_CODES.OK,
    };
  }

  // User-defined variable: must already exist
  const existingValue = ctx.variables.get(upperVarName);
  if (existingValue === null) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: `CMDLINE: Unknown variable: ${varName}`,
    };
  }

  ctx.state.setVariable(upperVarName, value);
  ctx.log('debug', `CMDLINE: Set ${varName} to ${value}`);

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
  };
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
  EXEC: execHandler,
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
