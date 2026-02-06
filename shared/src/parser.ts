/**
 * iMacros Script Parser
 *
 * Parses iMacros macro language (.iim files) into an AST representation.
 * Supports all 40+ iMacros commands including:
 * - Navigation: URL, TAB, FRAME, BACK, REFRESH
 * - Interaction: TAG, CLICK, EVENT
 * - Data: SET, EXTRACT, SAVEAS, PROMPT
 * - Control: WAIT, PAUSE, STOPWATCH
 * - Files: ONDOWNLOAD, FILTER, ONDIALOG
 * - Meta: VERSION, CLEAR
 */

/**
 * Types of commands supported by iMacros
 * Based on RegExpTable from MacroPlayer.js (40+ commands)
 */
export type CommandType =
  // Navigation commands
  | 'VERSION'
  | 'URL'
  | 'TAB'
  | 'FRAME'
  | 'BACK'
  | 'REFRESH'
  | 'NAVIGATE'
  // Interaction commands
  | 'TAG'
  | 'CLICK'
  | 'EVENT'
  | 'EVENTS'
  // Data commands
  | 'SET'
  | 'ADD'
  | 'EXTRACT'
  | 'SAVEAS'
  | 'SAVEITEM'
  | 'PROMPT'
  | 'SEARCH'
  // Control flow
  | 'WAIT'
  | 'PAUSE'
  | 'STOPWATCH'
  // File handling
  | 'ONDOWNLOAD'
  | 'FILTER'
  | 'FILEDELETE'
  // Dialog handling
  | 'ONDIALOG'
  | 'ONCERTIFICATEDIALOG'
  | 'ONERRORDIALOG'
  | 'ONLOGIN'
  | 'ONPRINT'
  | 'ONSECURITYDIALOG'
  | 'ONWEBPAGEDIALOG'
  // Session
  | 'CLEAR'
  | 'PROXY'
  // Screenshot/archive
  | 'SCREENSHOT'
  | 'CMDLINE'
  | 'PRINT'
  | 'SIZE'
  // Image recognition (Windows only)
  | 'IMAGECLICK'
  | 'IMAGESEARCH'
  // Desktop automation (unsupported in Firefox)
  | 'WINCLICK'
  // Connection management
  | 'DISCONNECT'
  | 'REDIAL'
  // Data source
  | 'DS'
  // Unknown for forward compatibility
  | 'UNKNOWN';

/**
 * Built-in system variables
 */
export const SYSTEM_VARIABLES = [
  '!VAR0', '!VAR1', '!VAR2', '!VAR3', '!VAR4', '!VAR5', '!VAR6', '!VAR7', '!VAR8', '!VAR9',
  '!COL1', '!COL2', '!COL3', '!COL4', '!COL5', '!COL6', '!COL7', '!COL8', '!COL9', '!COL10',
  '!LOOP', '!DATASOURCE', '!DATASOURCE_LINE', '!DATASOURCE_COLUMNS',
  '!EXTRACT', '!EXTRACT_TEST_POPUP', '!ENCRYPTION',
  '!NOW', '!TIMEOUT', '!TIMEOUT_STEP', '!TIMEOUT_PAGE',
  '!ERRORIGNORE', '!ERRORLOOP', '!SINGLESTEP',
  '!FOLDER_DATASOURCE', '!FOLDER_DOWNLOAD', '!FOLDER_MACROS',
  '!URLSTART', '!URLCURRENT', '!FILESTOPWATCH',
  '!CLIPBOARD', '!DOWNLOADPDF',
] as const;

export type SystemVariable = typeof SYSTEM_VARIABLES[number];

/**
 * Variable reference patterns
 */
export interface VariableReference {
  /** Original text including delimiters */
  original: string;
  /** Variable name without delimiters */
  name: string;
  /** Whether this is a system variable (starts with !) */
  isSystem: boolean;
  /** Position in the string */
  start: number;
  end: number;
}

/**
 * Parsed parameter key-value pair
 */
export interface Parameter {
  key: string;
  value: string;
  /** Raw value before unquoting */
  rawValue: string;
  /** Variables referenced in the value */
  variables: VariableReference[];
}

/**
 * Parsed command from a macro line
 */
export interface ParsedCommand {
  /** The command type */
  type: CommandType;
  /** Command parameters as key-value pairs */
  parameters: Parameter[];
  /** Raw line text */
  raw: string;
  /** Line number (1-based) */
  lineNumber: number;
  /** All variables referenced in the command */
  variables: VariableReference[];
}

/**
 * Comment line in a macro
 */
export interface CommentLine {
  /** Comment text (without leading ') */
  text: string;
  /** Raw line text */
  raw: string;
  /** Line number (1-based) */
  lineNumber: number;
}

/**
 * Empty or whitespace-only line
 */
export interface EmptyLine {
  /** Raw line text */
  raw: string;
  /** Line number (1-based) */
  lineNumber: number;
}

/**
 * A line in the parsed macro
 */
export type ParsedLine =
  | { type: 'command'; data: ParsedCommand }
  | { type: 'comment'; data: CommentLine }
  | { type: 'empty'; data: EmptyLine };

/**
 * Parsed macro structure
 */
export interface ParsedMacro {
  /** All parsed lines */
  lines: ParsedLine[];
  /** Only the command lines */
  commands: ParsedCommand[];
  /** Only the comment lines */
  comments: CommentLine[];
  /** All unique variables referenced */
  variables: VariableReference[];
  /** VERSION info if present */
  version?: {
    build?: string;
    recorder?: string;
  };
  /** Parsing errors encountered */
  errors: ParseError[];
}

/**
 * Parse error information
 */
export interface ParseError {
  /** Line number where error occurred */
  lineNumber: number;
  /** Error message */
  message: string;
  /** Raw line text */
  raw: string;
}

/**
 * All supported command keywords (40+ commands from MacroPlayer.js RegExpTable)
 */
const COMMAND_KEYWORDS: Record<string, CommandType> = {
  // Navigation commands
  'VERSION': 'VERSION',
  'URL': 'URL',
  'TAB': 'TAB',
  'FRAME': 'FRAME',
  'BACK': 'BACK',
  'REFRESH': 'REFRESH',
  'NAVIGATE': 'NAVIGATE',
  // Interaction commands
  'TAG': 'TAG',
  'CLICK': 'CLICK',
  'EVENT': 'EVENT',
  'EVENTS': 'EVENTS',
  // Data commands
  'SET': 'SET',
  'ADD': 'ADD',
  'EXTRACT': 'EXTRACT',
  'SAVEAS': 'SAVEAS',
  'SAVEITEM': 'SAVEITEM',
  'PROMPT': 'PROMPT',
  'SEARCH': 'SEARCH',
  // Control flow
  'WAIT': 'WAIT',
  'PAUSE': 'PAUSE',
  'STOPWATCH': 'STOPWATCH',
  // File handling
  'ONDOWNLOAD': 'ONDOWNLOAD',
  'FILTER': 'FILTER',
  'FILEDELETE': 'FILEDELETE',
  // Dialog handling
  'ONDIALOG': 'ONDIALOG',
  'ONCERTIFICATEDIALOG': 'ONCERTIFICATEDIALOG',
  'ONERRORDIALOG': 'ONERRORDIALOG',
  'ONLOGIN': 'ONLOGIN',
  'ONPRINT': 'ONPRINT',
  'ONSECURITYDIALOG': 'ONSECURITYDIALOG',
  'ONWEBPAGEDIALOG': 'ONWEBPAGEDIALOG',
  // Session
  'CLEAR': 'CLEAR',
  'PROXY': 'PROXY',
  // Screenshot/archive
  'SCREENSHOT': 'SCREENSHOT',
  'CMDLINE': 'CMDLINE',
  'PRINT': 'PRINT',
  'SIZE': 'SIZE',
  // Image recognition (Windows only)
  'IMAGECLICK': 'IMAGECLICK',
  'IMAGESEARCH': 'IMAGESEARCH',
  // Desktop automation (unsupported in Firefox)
  'WINCLICK': 'WINCLICK',
  // Connection management
  'DISCONNECT': 'DISCONNECT',
  'REDIAL': 'REDIAL',
  // Data source
  'DS': 'DS',
};

/**
 * Extract variable references from a string
 *
 * Supports:
 * - {{varname}} - user variables
 * - {{!VAR0}} through {{!VAR9}} - system variables
 * - {{!LOOP}}, {{!COL1}}, etc. - other system variables
 */
export function extractVariables(text: string): VariableReference[] {
  const variables: VariableReference[] = [];
  const regex = /\{\{([^}]+)\}\}/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const name = match[1];
    variables.push({
      original: match[0],
      name: name,
      isSystem: name.startsWith('!'),
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return variables;
}

/**
 * Check if a variable name is a valid system variable
 */
export function isSystemVariable(name: string): boolean {
  if (!name.startsWith('!')) return false;
  // Check against known system variables or pattern match
  const upperName = name.toUpperCase();
  if (SYSTEM_VARIABLES.includes(upperName as SystemVariable)) {
    return true;
  }
  // Check for patterns like !NOW:format
  if (upperName.startsWith('!NOW:')) return true;
  return false;
}

/**
 * Unquote a parameter value
 * Handles double-quoted strings with escape sequences
 */
export function unquoteValue(value: string): string {
  if (!value) return value;

  const trimmed = value.trim();

  // Handle double-quoted strings
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    const inner = trimmed.slice(1, -1);
    // Process escape sequences
    return inner
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  return trimmed;
}

/**
 * Parse parameters from command arguments string
 *
 * Parameters can be:
 * - KEY=value
 * - KEY="quoted value"
 * - KEY (boolean flag / positional argument)
 * - "quoted string" (as a positional argument)
 * - Values can contain embedded quotes like %"ice cream":%"Apple Pie"
 */
export function parseParameters(argsString: string): Parameter[] {
  const parameters: Parameter[] = [];
  if (!argsString || argsString.trim() === '') {
    return parameters;
  }

  // State machine for parsing
  let i = 0;
  const len = argsString.length;

  while (i < len) {
    // Skip whitespace
    while (i < len && /\s/.test(argsString[i])) {
      i++;
    }
    if (i >= len) break;

    // Check if this token starts with a quote (quoted positional argument)
    if (argsString[i] === '"') {
      // Read the entire quoted string as a key/token
      let tokenStart = i;
      i++; // Skip opening quote
      let escaped = false;
      while (i < len) {
        if (escaped) {
          escaped = false;
          i++;
          continue;
        }
        if (argsString[i] === '\\') {
          escaped = true;
          i++;
          continue;
        }
        if (argsString[i] === '"') {
          i++; // Skip closing quote
          break;
        }
        i++;
      }
      const rawToken = argsString.slice(tokenStart, i);
      const token = unquoteValue(rawToken);

      // Check if followed by = (unlikely but handle it)
      if (i < len && argsString[i] === '=') {
        // This quoted string is actually a key
        i++; // Skip =
        // Read value...
        let valueStart = i;
        let inQuotes = false;
        escaped = false;
        while (i < len) {
          if (escaped) { escaped = false; i++; continue; }
          if (argsString[i] === '\\') { escaped = true; i++; continue; }
          if (argsString[i] === '"') { inQuotes = !inQuotes; i++; continue; }
          if (!inQuotes && /\s/.test(argsString[i])) { break; }
          i++;
        }
        const rawValue = argsString.slice(valueStart, i);
        const value = rawValue.startsWith('"') ? unquoteValue(rawValue) : rawValue;
        parameters.push({ key: token, value, rawValue, variables: extractVariables(rawValue) });
      } else {
        // Quoted string as a positional argument (boolean flag style)
        parameters.push({ key: token, value: 'true', rawValue: rawToken, variables: extractVariables(rawToken) });
      }
      continue;
    }

    // Read key/token (unquoted)
    let keyStart = i;
    // Read until = or whitespace, but handle embedded quotes
    let inQuotes = false;
    let escaped = false;
    while (i < len) {
      if (escaped) { escaped = false; i++; continue; }
      if (argsString[i] === '\\') { escaped = true; i++; continue; }
      if (argsString[i] === '"') { inQuotes = !inQuotes; i++; continue; }
      if (!inQuotes && (argsString[i] === '=' || /\s/.test(argsString[i]))) { break; }
      i++;
    }
    const key = argsString.slice(keyStart, i);
    if (!key) break;

    // Check for =
    if (i < len && argsString[i] === '=') {
      i++; // Skip =

      // Read value
      let value = '';
      let rawValue = '';

      if (i < len && argsString[i] === '"') {
        // Fully quoted value starting with "
        let valueStart = i;
        i++; // Skip opening quote
        escaped = false;
        while (i < len) {
          if (escaped) {
            escaped = false;
            i++;
            continue;
          }
          if (argsString[i] === '\\') {
            escaped = true;
            i++;
            continue;
          }
          if (argsString[i] === '"') {
            i++; // Skip closing quote
            break;
          }
          i++;
        }
        rawValue = argsString.slice(valueStart, i);
        value = unquoteValue(rawValue);
      } else {
        // Unquoted or partially quoted value
        // Need to handle values like: %"ice cream":%"Apple Pie"
        // Read until we hit whitespace that's not inside quotes
        let valueStart = i;
        inQuotes = false;
        escaped = false;
        while (i < len) {
          if (escaped) {
            escaped = false;
            i++;
            continue;
          }
          if (argsString[i] === '\\') {
            escaped = true;
            i++;
            continue;
          }
          if (argsString[i] === '"') {
            inQuotes = !inQuotes;
            i++;
            continue;
          }
          if (!inQuotes && /\s/.test(argsString[i])) {
            break;
          }
          i++;
        }
        rawValue = argsString.slice(valueStart, i);
        value = rawValue;
      }

      const variables = extractVariables(rawValue);
      parameters.push({ key, value, rawValue, variables });
    } else {
      // Boolean flag / positional argument (no value)
      const variables = extractVariables(key);
      parameters.push({ key, value: 'true', rawValue: key, variables });
    }
  }

  return parameters;
}

/**
 * Parse a single line of macro code
 */
export function parseLine(line: string, lineNumber: number): ParsedLine {
  const trimmed = line.trim();

  // Empty line
  if (trimmed === '') {
    return {
      type: 'empty',
      data: { raw: line, lineNumber },
    };
  }

  // Comment line (starts with ')
  if (trimmed.startsWith("'")) {
    return {
      type: 'comment',
      data: {
        text: trimmed.slice(1).trim(),
        raw: line,
        lineNumber,
      },
    };
  }

  // Command line
  // Extract the command keyword (first word)
  const spaceIndex = trimmed.search(/\s/);
  const commandWord = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
  const argsString = spaceIndex === -1 ? '' : trimmed.slice(spaceIndex + 1);

  const commandType = COMMAND_KEYWORDS[commandWord.toUpperCase()] || 'UNKNOWN';

  const parameters = parseParameters(argsString);

  // Collect all variables from parameters
  const allVariables: VariableReference[] = [];
  for (const param of parameters) {
    allVariables.push(...param.variables);
  }

  return {
    type: 'command',
    data: {
      type: commandType,
      parameters,
      raw: line,
      lineNumber,
      variables: allVariables,
    },
  };
}

/**
 * Parse VERSION command parameters
 */
function parseVersionInfo(commands: ParsedCommand[]): { build?: string; recorder?: string } | undefined {
  const versionCmd = commands.find(cmd => cmd.type === 'VERSION');
  if (!versionCmd) return undefined;

  const result: { build?: string; recorder?: string } = {};

  for (const param of versionCmd.parameters) {
    if (param.key.toUpperCase() === 'BUILD') {
      result.build = param.value;
    } else if (param.key.toUpperCase() === 'RECORDER') {
      result.recorder = param.value;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Collect all unique variables from commands
 */
function collectUniqueVariables(commands: ParsedCommand[]): VariableReference[] {
  const seen = new Set<string>();
  const unique: VariableReference[] = [];

  for (const cmd of commands) {
    for (const variable of cmd.variables) {
      if (!seen.has(variable.name)) {
        seen.add(variable.name);
        unique.push(variable);
      }
    }
  }

  return unique;
}

/**
 * Validate a parsed command for common errors
 */
export function validateCommand(command: ParsedCommand): ParseError | null {
  switch (command.type) {
    case 'URL': {
      const gotoParam = command.parameters.find(p => p.key.toUpperCase() === 'GOTO');
      if (!gotoParam) {
        return {
          lineNumber: command.lineNumber,
          message: 'URL command requires GOTO parameter',
          raw: command.raw,
        };
      }
      break;
    }

    case 'TAG': {
      // TAG requires either POS+TYPE+ATTR or XPATH
      const hasXPath = command.parameters.some(p => p.key.toUpperCase() === 'XPATH');
      const hasPos = command.parameters.some(p => p.key.toUpperCase() === 'POS');
      const hasType = command.parameters.some(p => p.key.toUpperCase() === 'TYPE');

      if (!hasXPath && (!hasPos || !hasType)) {
        return {
          lineNumber: command.lineNumber,
          message: 'TAG command requires either XPATH or POS and TYPE parameters',
          raw: command.raw,
        };
      }
      break;
    }

    case 'SET': {
      if (command.parameters.length < 2) {
        return {
          lineNumber: command.lineNumber,
          message: 'SET command requires variable name and value',
          raw: command.raw,
        };
      }
      break;
    }

    case 'WAIT': {
      const secondsParam = command.parameters.find(p => p.key.toUpperCase() === 'SECONDS');
      if (!secondsParam) {
        return {
          lineNumber: command.lineNumber,
          message: 'WAIT command requires SECONDS parameter',
          raw: command.raw,
        };
      }
      break;
    }

    case 'TAB': {
      // TAB accepts: T=<number> | CLOSE | CLOSEALLOTHERS | OPEN | NEW OPEN
      const tParam = command.parameters.find(p => p.key.toUpperCase() === 'T');
      const hasAction = command.parameters.some(p =>
        /^(CLOSE|CLOSEALLOTHERS|OPEN|NEW)$/i.test(p.key)
      );
      if (!tParam && !hasAction) {
        return {
          lineNumber: command.lineNumber,
          message: 'TAB command requires T parameter or action (CLOSE, CLOSEALLOTHERS, OPEN)',
          raw: command.raw,
        };
      }
      break;
    }

    case 'FRAME': {
      // FRAME accepts: F=<number> | NAME=<name>
      const fParam = command.parameters.find(p => p.key.toUpperCase() === 'F');
      const nameParam = command.parameters.find(p => p.key.toUpperCase() === 'NAME');
      if (!fParam && !nameParam) {
        return {
          lineNumber: command.lineNumber,
          message: 'FRAME command requires F or NAME parameter',
          raw: command.raw,
        };
      }
      break;
    }

    case 'SAVEAS': {
      const typeParam = command.parameters.find(p => p.key.toUpperCase() === 'TYPE');
      if (!typeParam) {
        return {
          lineNumber: command.lineNumber,
          message: 'SAVEAS command requires TYPE parameter',
          raw: command.raw,
        };
      }
      break;
    }

    case 'STOPWATCH': {
      // STOPWATCH accepts: ID=<name> | LABEL=<name> | START ID=<name> | STOP ID=<name>
      const idParam = command.parameters.find(p => p.key.toUpperCase() === 'ID');
      const labelParam = command.parameters.find(p => p.key.toUpperCase() === 'LABEL');
      if (!idParam && !labelParam) {
        return {
          lineNumber: command.lineNumber,
          message: 'STOPWATCH command requires ID or LABEL parameter',
          raw: command.raw,
        };
      }
      break;
    }

    case 'FILTER': {
      const typeParam = command.parameters.find(p => p.key.toUpperCase() === 'TYPE');
      if (!typeParam) {
        return {
          lineNumber: command.lineNumber,
          message: 'FILTER command requires TYPE parameter',
          raw: command.raw,
        };
      }
      break;
    }

    case 'ONDOWNLOAD': {
      const folderParam = command.parameters.find(p => p.key.toUpperCase() === 'FOLDER');
      const fileParam = command.parameters.find(p => p.key.toUpperCase() === 'FILE');
      if (!folderParam && !fileParam) {
        return {
          lineNumber: command.lineNumber,
          message: 'ONDOWNLOAD command requires FOLDER and/or FILE parameters',
          raw: command.raw,
        };
      }
      break;
    }

    case 'PROMPT': {
      // PROMPT accepts: <message> [<variable> [<default>]]
      // At least 1 parameter (message) is required
      if (command.parameters.length < 1) {
        return {
          lineNumber: command.lineNumber,
          message: 'PROMPT command requires at least a message',
          raw: command.raw,
        };
      }
      break;
    }

    case 'ONDIALOG': {
      const posParam = command.parameters.find(p => p.key.toUpperCase() === 'POS');
      const buttonParam = command.parameters.find(p => p.key.toUpperCase() === 'BUTTON');
      if (!posParam || !buttonParam) {
        return {
          lineNumber: command.lineNumber,
          message: 'ONDIALOG command requires POS and BUTTON parameters',
          raw: command.raw,
        };
      }
      break;
    }

    case 'ADD': {
      // ADD <variable> <value>
      if (command.parameters.length < 2) {
        return {
          lineNumber: command.lineNumber,
          message: 'ADD command requires variable name and value',
          raw: command.raw,
        };
      }
      break;
    }

    case 'CLICK': {
      // CLICK X=<num> Y=<num> [CONTENT=<value>]
      const xParam = command.parameters.find(p => p.key.toUpperCase() === 'X');
      const yParam = command.parameters.find(p => p.key.toUpperCase() === 'Y');
      if (!xParam || !yParam) {
        return {
          lineNumber: command.lineNumber,
          message: 'CLICK command requires X and Y parameters',
          raw: command.raw,
        };
      }
      break;
    }

    case 'EVENT':
    case 'EVENTS': {
      // EVENT TYPE=<type> [SELECTOR=<sel> | XPATH=<xpath>] [BUTTON|KEY|CHAR|POINT=<val>] [MODIFIERS=<mod>]
      const typeParam = command.parameters.find(p => p.key.toUpperCase() === 'TYPE');
      if (!typeParam) {
        return {
          lineNumber: command.lineNumber,
          message: `${command.type} command requires TYPE parameter`,
          raw: command.raw,
        };
      }
      break;
    }

    case 'SEARCH': {
      // SEARCH SOURCE=TXT:<pattern>|REGEXP:<pattern> [IGNORE_CASE=YES|NO] [EXTRACT=<pattern>]
      const sourceParam = command.parameters.find(p => p.key.toUpperCase() === 'SOURCE');
      if (!sourceParam) {
        return {
          lineNumber: command.lineNumber,
          message: 'SEARCH command requires SOURCE parameter',
          raw: command.raw,
        };
      }
      break;
    }

    case 'PROXY': {
      // PROXY ADDRESS=<addr:port> [BYPASS=<list>]
      const addressParam = command.parameters.find(p => p.key.toUpperCase() === 'ADDRESS');
      if (!addressParam) {
        return {
          lineNumber: command.lineNumber,
          message: 'PROXY command requires ADDRESS parameter',
          raw: command.raw,
        };
      }
      break;
    }

    case 'SCREENSHOT': {
      // SCREENSHOT TYPE=BROWSER|PAGE [FOLDER=<folder>] FILE=<file>
      const typeParam = command.parameters.find(p => p.key.toUpperCase() === 'TYPE');
      const fileParam = command.parameters.find(p => p.key.toUpperCase() === 'FILE');
      if (!typeParam || !fileParam) {
        return {
          lineNumber: command.lineNumber,
          message: 'SCREENSHOT command requires TYPE and FILE parameters',
          raw: command.raw,
        };
      }
      break;
    }

    case 'FILEDELETE': {
      // FILEDELETE NAME=<filename>
      const nameParam = command.parameters.find(p => p.key.toUpperCase() === 'NAME');
      if (!nameParam) {
        return {
          lineNumber: command.lineNumber,
          message: 'FILEDELETE command requires NAME parameter',
          raw: command.raw,
        };
      }
      break;
    }

    case 'CMDLINE': {
      // CMDLINE <variable> <value>
      if (command.parameters.length < 2) {
        return {
          lineNumber: command.lineNumber,
          message: 'CMDLINE command requires variable name and value',
          raw: command.raw,
        };
      }
      break;
    }

    case 'ONLOGIN': {
      // ONLOGIN USER=<user> PASSWORD=<password>
      const userParam = command.parameters.find(p => p.key.toUpperCase() === 'USER');
      const passwordParam = command.parameters.find(p => p.key.toUpperCase() === 'PASSWORD');
      if (!userParam || !passwordParam) {
        return {
          lineNumber: command.lineNumber,
          message: 'ONLOGIN command requires USER and PASSWORD parameters',
          raw: command.raw,
        };
      }
      break;
    }

    case 'IMAGESEARCH': {
      // IMAGESEARCH POS=<pos> IMAGE=<image> CONFIDENCE=<value>
      const posParam = command.parameters.find(p => p.key.toUpperCase() === 'POS');
      const imageParam = command.parameters.find(p => p.key.toUpperCase() === 'IMAGE');
      const confidenceParam = command.parameters.find(p => p.key.toUpperCase() === 'CONFIDENCE');
      if (!posParam || !imageParam || !confidenceParam) {
        return {
          lineNumber: command.lineNumber,
          message: 'IMAGESEARCH command requires POS, IMAGE, and CONFIDENCE parameters',
          raw: command.raw,
        };
      }
      break;
    }

    // Commands that don't require validation (no parameters or accept anything)
    case 'BACK':
    case 'CLEAR':
    case 'PAUSE':
    case 'REFRESH':
    case 'EXTRACT':
    case 'PRINT':
    case 'SIZE':
    case 'SAVEITEM':
    case 'ONCERTIFICATEDIALOG':
    case 'ONERRORDIALOG':
    case 'ONPRINT':
    case 'ONSECURITYDIALOG':
    case 'ONWEBPAGEDIALOG':
    case 'IMAGECLICK':
    case 'WINCLICK':
    case 'DISCONNECT':
    case 'REDIAL':
    case 'DS':
    case 'NAVIGATE':
    case 'VERSION':
      break;

    case 'UNKNOWN': {
      return {
        lineNumber: command.lineNumber,
        message: `Unknown command: ${command.raw.split(/\s/)[0]}`,
        raw: command.raw,
      };
    }
  }

  return null;
}

/**
 * Parse a complete macro script
 *
 * @param script - The macro script text
 * @param validate - Whether to validate commands (default: true)
 * @returns Parsed macro structure
 */
export function parseMacro(script: string, validate: boolean = true): ParsedMacro {
  const lines = script.split(/\r?\n/);
  const parsedLines: ParsedLine[] = [];
  const commands: ParsedCommand[] = [];
  const comments: CommentLine[] = [];
  const errors: ParseError[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const parsed = parseLine(lines[i], lineNumber);
    parsedLines.push(parsed);

    if (parsed.type === 'command') {
      commands.push(parsed.data);

      if (validate) {
        const error = validateCommand(parsed.data);
        if (error) {
          errors.push(error);
        }
      }
    } else if (parsed.type === 'comment') {
      comments.push(parsed.data);
    }
  }

  return {
    lines: parsedLines,
    commands,
    comments,
    variables: collectUniqueVariables(commands),
    version: parseVersionInfo(commands),
    errors,
  };
}

/**
 * Check if a string is a valid iMacros command keyword
 */
export function isValidCommand(word: string): boolean {
  return word.toUpperCase() in COMMAND_KEYWORDS;
}

/**
 * Get all supported command keywords
 */
export function getSupportedCommands(): string[] {
  return Object.keys(COMMAND_KEYWORDS);
}

/**
 * Serialize a parsed command back to iMacros format
 */
export function serializeCommand(command: ParsedCommand): string {
  const parts: string[] = [command.type];

  for (const param of command.parameters) {
    if (param.rawValue) {
      parts.push(`${param.key}=${param.rawValue}`);
    } else if (param.value !== 'true') {
      parts.push(`${param.key}=${param.value}`);
    } else {
      parts.push(param.key);
    }
  }

  return parts.join(' ');
}

/**
 * Serialize a parsed macro back to iMacros format
 */
export function serializeMacro(macro: ParsedMacro): string {
  return macro.lines
    .map(line => {
      if (line.type === 'command') {
        return serializeCommand(line.data);
      } else {
        return line.data.raw;
      }
    })
    .join('\n');
}
