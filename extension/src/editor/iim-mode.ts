/**
 * CodeMirror 6 language support for iMacros .iim files
 * Provides syntax highlighting for iMacros macro commands
 */

import { LanguageSupport, LRLanguage, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { styleTags, tags as t } from '@lezer/highlight';
import { StreamLanguage } from '@codemirror/language';

/**
 * iMacros command keywords
 */
const COMMANDS = [
  // Navigation commands
  'VERSION', 'URL', 'TAB', 'FRAME', 'BACK', 'REFRESH', 'NAVIGATE',
  // Interaction commands
  'TAG', 'CLICK', 'EVENT', 'EVENTS',
  // Data commands
  'SET', 'ADD', 'EXTRACT', 'SAVEAS', 'SAVEITEM', 'PROMPT', 'SEARCH',
  // Control flow
  'WAIT', 'PAUSE', 'STOPWATCH',
  // File handling
  'ONDOWNLOAD', 'FILTER', 'FILEDELETE',
  // Dialog handling
  'ONDIALOG', 'ONCERTIFICATEDIALOG', 'ONERRORDIALOG', 'ONLOGIN',
  'ONPRINT', 'ONSECURITYDIALOG', 'ONWEBPAGEDIALOG',
  // Session
  'CLEAR', 'PROXY',
  // Screenshot/archive
  'SCREENSHOT', 'CMDLINE', 'PRINT', 'SIZE',
  // Image recognition
  'IMAGECLICK', 'IMAGESEARCH',
  // Desktop automation
  'WINCLICK',
  // Connection management
  'DISCONNECT', 'REDIAL',
  // Data source
  'DS'
];

/**
 * Parameter keywords commonly used in iMacros
 */
const PARAMETERS = [
  'GOTO', 'POS', 'TYPE', 'FORM', 'ATTR', 'CONTENT', 'EXTRACT', 'XPATH',
  'T', 'F', 'NAME', 'SECONDS', 'FOLDER', 'FILE', 'BUILD', 'RECORDER',
  'BUTTON', 'ID', 'LABEL', 'SOURCE', 'ADDRESS', 'BYPASS', 'IMAGE',
  'CONFIDENCE', 'USER', 'PASSWORD', 'X', 'Y', 'SELECTOR', 'KEY', 'CHAR',
  'POINT', 'MODIFIERS', 'CLOSE', 'CLOSEALLOTHERS', 'OPEN', 'NEW',
  'START', 'STOP', 'WAIT', 'IGNORE_CASE', 'YES', 'NO', 'TRUE', 'FALSE',
  'OK', 'CANCEL', 'TXT', 'REGEXP', 'CPT', 'HTM', 'MHT', 'BMP', 'PNG',
  'JPEG', 'BROWSER', 'PAGE'
];

/**
 * System variables
 */
const SYSTEM_VARS = [
  '!VAR0', '!VAR1', '!VAR2', '!VAR3', '!VAR4', '!VAR5', '!VAR6', '!VAR7', '!VAR8', '!VAR9',
  '!COL1', '!COL2', '!COL3', '!COL4', '!COL5', '!COL6', '!COL7', '!COL8', '!COL9', '!COL10',
  '!LOOP', '!DATASOURCE', '!DATASOURCE_LINE', '!DATASOURCE_COLUMNS',
  '!EXTRACT', '!EXTRACT_TEST_POPUP', '!ENCRYPTION',
  '!NOW', '!TIMEOUT', '!TIMEOUT_STEP', '!TIMEOUT_PAGE',
  '!ERRORIGNORE', '!ERRORLOOP', '!SINGLESTEP',
  '!FOLDER_DATASOURCE', '!FOLDER_DOWNLOAD', '!FOLDER_MACROS',
  '!URLSTART', '!URLCURRENT', '!FILESTOPWATCH',
  '!CLIPBOARD', '!DOWNLOADPDF'
];

/**
 * Create a regex pattern for matching
 */
function wordRegex(words: string[]): RegExp {
  return new RegExp('^(' + words.join('|') + ')\\b', 'i');
}

const commandRegex = wordRegex(COMMANDS);
const paramRegex = wordRegex(PARAMETERS);

/**
 * StreamLanguage definition for iMacros
 */
export const iimLanguage = StreamLanguage.define({
  name: 'iim',

  startState() {
    return {
      inString: false,
      stringChar: null as string | null,
      inVariable: false,
      lineStart: true,
    };
  },

  token(stream, state) {
    // Handle start of line
    if (stream.sol()) {
      state.lineStart = true;
    }

    // Skip whitespace
    if (stream.eatSpace()) {
      return null;
    }

    // Comments (lines starting with ')
    if (state.lineStart && stream.peek() === "'") {
      stream.skipToEnd();
      state.lineStart = false;
      return 'comment';
    }

    state.lineStart = false;

    // Handle strings
    if (stream.peek() === '"') {
      stream.next();
      state.inString = true;
      state.stringChar = '"';
      while (!stream.eol()) {
        const ch = stream.next();
        if (ch === '\\') {
          stream.next(); // Skip escaped character
        } else if (ch === '"') {
          state.inString = false;
          state.stringChar = null;
          break;
        }
      }
      return 'string';
    }

    // Handle variable references {{...}}
    if (stream.match('{{')) {
      let varContent = '';
      while (!stream.eol() && !stream.match('}}', false)) {
        varContent += stream.next();
      }
      stream.match('}}');

      // Check if it's a system variable
      if (varContent.startsWith('!')) {
        return 'variableName.special';
      }
      return 'variableName';
    }

    // Handle numbers
    if (stream.match(/^-?\d+(\.\d+)?/)) {
      return 'number';
    }

    // Handle commands at the start of a logical statement
    if (stream.match(commandRegex)) {
      return 'keyword';
    }

    // Handle parameter names (before =)
    if (stream.match(paramRegex)) {
      return 'propertyName';
    }

    // Handle = sign
    if (stream.eat('=')) {
      return 'operator';
    }

    // Handle special characters
    if (stream.match(/^[<>[\]{}:;,*]/)) {
      return 'punctuation';
    }

    // Handle URL-like patterns
    if (stream.match(/^https?:\/\/[^\s"']*/)) {
      return 'url';
    }

    // Handle identifiers and other words
    if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_-]*/)) {
      return null;
    }

    // Advance by one character if nothing matched
    stream.next();
    return null;
  },

  languageData: {
    commentTokens: { line: "'" },
  },
});

/**
 * Highlight style for iMacros
 */
export const iimHighlightStyle = HighlightStyle.define([
  // Modern VS Code-inspired color scheme
  { tag: t.keyword, color: '#AF00DB', fontWeight: '600' },           // Purple for commands
  { tag: t.comment, color: '#6A9955', fontStyle: 'italic' },         // Green for comments
  { tag: t.string, color: '#A31515' },                               // Red for strings
  { tag: t.number, color: '#098658' },                               // Teal for numbers
  { tag: t.propertyName, color: '#0451A5' },                         // Blue for parameters
  { tag: t.variableName, color: '#001080' },                         // Dark blue for variables
  { tag: t.special(t.variableName), color: '#E06C00', fontWeight: '600' }, // Orange for system vars
  { tag: t.operator, color: '#383A42' },                             // Dark gray for operators
  { tag: t.punctuation, color: '#383A42' },                          // Dark gray for punctuation
  { tag: t.url, color: '#0070C1', textDecoration: 'underline' },     // Blue underlined for URLs
]);

/**
 * Create iMacros language support with highlighting
 */
export function iim(): LanguageSupport {
  return new LanguageSupport(iimLanguage, [
    syntaxHighlighting(iimHighlightStyle),
  ]);
}

/**
 * Get autocomplete suggestions for iMacros commands
 */
export function getCommandCompletions(): { label: string; type: string; info?: string }[] {
  return COMMANDS.map(cmd => ({
    label: cmd,
    type: 'keyword',
    info: getCommandDescription(cmd),
  }));
}

/**
 * Get autocomplete suggestions for parameters
 */
export function getParameterCompletions(): { label: string; type: string }[] {
  return PARAMETERS.map(param => ({
    label: param,
    type: 'property',
  }));
}

/**
 * Get autocomplete suggestions for system variables
 */
export function getVariableCompletions(): { label: string; type: string; info?: string }[] {
  return SYSTEM_VARS.map(v => ({
    label: `{{${v}}}`,
    type: 'variable',
    info: getVariableDescription(v),
  }));
}

/**
 * Get description for a command
 */
function getCommandDescription(cmd: string): string {
  const descriptions: Record<string, string> = {
    'URL': 'Navigate to a URL',
    'TAG': 'Interact with an HTML element',
    'SET': 'Set a variable value',
    'WAIT': 'Wait for specified seconds',
    'TAB': 'Switch, open, or close tabs',
    'FRAME': 'Switch to a frame',
    'CLICK': 'Click at coordinates',
    'EXTRACT': 'Extract data from page',
    'SAVEAS': 'Save page or data to file',
    'PROMPT': 'Show input dialog',
    'PAUSE': 'Pause macro execution',
    'CLEAR': 'Clear cookies and cache',
    'SCREENSHOT': 'Take a screenshot',
    'ONDIALOG': 'Handle browser dialogs',
    'ONDOWNLOAD': 'Handle file downloads',
    'VERSION': 'Specify macro version info',
    'BACK': 'Navigate back in history',
    'REFRESH': 'Refresh the current page',
    'ADD': 'Add to a numeric variable',
    'SEARCH': 'Search for text in page',
    'FILTER': 'Filter page resources',
    'STOPWATCH': 'Measure execution time',
    'PROXY': 'Configure proxy settings',
    'DS': 'Configure datasource',
  };
  return descriptions[cmd] || '';
}

/**
 * Get description for a system variable
 */
function getVariableDescription(varName: string): string {
  const descriptions: Record<string, string> = {
    '!LOOP': 'Current loop iteration number',
    '!EXTRACT': 'Extracted data',
    '!NOW': 'Current date/time',
    '!TIMEOUT': 'Timeout setting in seconds',
    '!ERRORIGNORE': 'Error handling mode',
    '!DATASOURCE': 'Current datasource file',
    '!DATASOURCE_LINE': 'Current datasource line',
    '!URLCURRENT': 'Current page URL',
    '!CLIPBOARD': 'System clipboard content',
  };
  return descriptions[varName] || '';
}

export { COMMANDS, PARAMETERS, SYSTEM_VARS };
