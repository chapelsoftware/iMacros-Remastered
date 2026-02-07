/**
 * iMacros Macro Editor
 * CodeMirror 6 based editor with iMacros syntax highlighting
 */

import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment, Extension } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { autocompletion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { lintGutter, linter, Diagnostic } from '@codemirror/lint';
import { javascript } from '@codemirror/lang-javascript';
import { createMessageId, createTimestamp, parseMacro, ParseError } from '@shared/index';
import { iim, getCommandCompletions, getParameterCompletions, getVariableCompletions, COMMANDS } from './iim-mode';

/**
 * Editor state interface
 */
interface EditorAppState {
  currentPath: string | null;
  originalContent: string;
  isModified: boolean;
  isNewMacro: boolean;
}

/**
 * Global state
 */
const state: EditorAppState = {
  currentPath: null,
  originalContent: '',
  isModified: false,
  isNewMacro: false,
};

let editorView: EditorView | null = null;
const languageConf = new Compartment();
const linterConf = new Compartment();
const completionConf = new Compartment();

/**
 * Detect file type from path
 */
function getFileType(path: string | null): 'iim' | 'js' {
  if (!path) return 'iim';
  const lower = path.toLowerCase();
  if (lower.endsWith('.js')) return 'js';
  return 'iim';
}

/**
 * Get language extension for file type
 */
function getLanguageExtension(fileType: 'iim' | 'js'): Extension {
  if (fileType === 'js') {
    return javascript();
  }
  return iim();
}

/**
 * Get linter extension for file type
 */
function getLinterExtension(fileType: 'iim' | 'js'): Extension {
  if (fileType === 'js') {
    return []; // No linting for JS files
  }
  return linter(iimLinter);
}

/**
 * Get completion extension for file type
 */
function getCompletionExtension(fileType: 'iim' | 'js'): Extension {
  if (fileType === 'js') {
    return []; // No iim completions for JS files
  }
  return autocompletion({
    override: [iimCompletions],
  });
}

/**
 * Send a message to the background script
 */
function sendToBackground(type: string, payload?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type,
        id: createMessageId(),
        timestamp: createTimestamp(),
        payload,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      }
    );
  });
}

/**
 * iMacros completion source
 */
function iimCompletions(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/\w*/);
  if (!word || (word.from === word.to && !context.explicit)) {
    return null;
  }

  const line = context.state.doc.lineAt(context.pos);
  const lineText = line.text.slice(0, context.pos - line.from);
  const isLineStart = lineText.trim() === word.text;

  // At start of line, suggest commands
  if (isLineStart) {
    return {
      from: word.from,
      options: getCommandCompletions(),
    };
  }

  // After a command, suggest parameters
  const hasCommand = COMMANDS.some(cmd =>
    lineText.toUpperCase().startsWith(cmd)
  );

  if (hasCommand) {
    // Check if we're typing a parameter (not after =)
    const beforeWord = lineText.slice(0, word.from - line.from);
    if (!beforeWord.endsWith('=')) {
      return {
        from: word.from,
        options: [
          ...getParameterCompletions(),
          ...getVariableCompletions(),
        ],
      };
    }
  }

  // Inside {{ }}, suggest variables
  const varMatch = lineText.match(/\{\{([^}]*)$/);
  if (varMatch) {
    return {
      from: word.from,
      options: getVariableCompletions().map(v => ({
        ...v,
        label: v.label.replace(/^\{\{|\}\}$/g, ''), // Remove braces for completion
      })),
    };
  }

  return null;
}

/**
 * iMacros linter
 */
function iimLinter(view: EditorView): Diagnostic[] {
  const content = view.state.doc.toString();
  const parsed = parseMacro(content, true);

  return parsed.errors.map((error: ParseError) => {
    const line = view.state.doc.line(error.lineNumber);
    return {
      from: line.from,
      to: line.to,
      severity: 'error' as const,
      message: error.message,
    };
  });
}

/**
 * Create the CodeMirror editor instance
 */
function createEditor(container: HTMLElement, initialContent: string = '', fileType: 'iim' | 'js' = 'iim'): EditorView {
  const startState = EditorState.create({
    doc: initialContent,
    extensions: [
      basicSetup,
      keymap.of([indentWithTab]),
      languageConf.of(getLanguageExtension(fileType)),
      completionConf.of(getCompletionExtension(fileType)),
      lintGutter(),
      linterConf.of(getLinterExtension(fileType)),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const content = update.state.doc.toString();
          state.isModified = content !== state.originalContent;
          updateUI();
        }
      }),
      EditorView.theme({
        '&': {
          height: '100%',
          fontSize: '14px',
        },
        '.cm-scroller': {
          overflow: 'auto',
          fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
        },
        '.cm-content': {
          minHeight: '200px',
        },
        '.cm-gutters': {
          backgroundColor: '#f5f5f5',
          borderRight: '1px solid #ddd',
        },
        '.cm-activeLineGutter': {
          backgroundColor: '#e8f2ff',
        },
        '.cm-activeLine': {
          backgroundColor: '#f5faff',
        },
      }),
    ],
  });

  return new EditorView({
    state: startState,
    parent: container,
  });
}

/**
 * Update the UI based on current state
 */
function updateUI(): void {
  // Update title
  const titleEl = document.getElementById('editor-title');
  if (titleEl) {
    let title = state.currentPath || 'New Macro';
    if (state.isModified) {
      title += ' *';
    }
    titleEl.textContent = title;
  }

  // Update document title
  document.title = `iMacros Editor - ${state.currentPath || 'New Macro'}${state.isModified ? ' *' : ''}`;

  // Update save button state
  const saveBtn = document.getElementById('btn-save') as HTMLButtonElement;
  if (saveBtn) {
    saveBtn.disabled = !state.isModified && !state.isNewMacro;
  }
}

/**
 * Load macro content from native host
 */
async function loadMacro(path: string): Promise<void> {
  try {
    showStatus('Loading...', 'info');

    const response = await sendToBackground('LOAD_MACRO', { path }) as {
      success: boolean;
      content?: string;
      error?: string;
    };

    if (!response.success) {
      throw new Error(response.error || 'Failed to load macro');
    }

    const content = response.content || '';
    state.currentPath = path;
    state.originalContent = content;
    state.isModified = false;
    state.isNewMacro = false;

    // Detect file type and reconfigure editor
    const fileType = getFileType(path);

    if (editorView) {
      // Update content and reconfigure language/linter/completions
      editorView.dispatch({
        changes: {
          from: 0,
          to: editorView.state.doc.length,
          insert: content,
        },
        effects: [
          languageConf.reconfigure(getLanguageExtension(fileType)),
          linterConf.reconfigure(getLinterExtension(fileType)),
          completionConf.reconfigure(getCompletionExtension(fileType)),
        ],
      });
    }

    updateUI();
    showStatus('Loaded', 'success');
  } catch (error) {
    showStatus(`Error: ${error}`, 'error');
    console.error('Failed to load macro:', error);
  }
}

/**
 * Save macro content to native host
 */
async function saveMacro(): Promise<void> {
  if (!editorView) return;

  const content = editorView.state.doc.toString();

  // If new macro, prompt for filename
  if (state.isNewMacro || !state.currentPath) {
    const filename = prompt('Enter macro filename:', 'NewMacro.iim');
    if (!filename) return;

    // Ensure .iim extension
    state.currentPath = filename.endsWith('.iim') ? filename : `${filename}.iim`;
    state.isNewMacro = false;
  }

  try {
    showStatus('Saving...', 'info');

    const response = await sendToBackground('SAVE_MACRO', {
      path: state.currentPath,
      content,
    }) as { success: boolean; error?: string };

    if (!response.success) {
      throw new Error(response.error || 'Failed to save macro');
    }

    state.originalContent = content;
    state.isModified = false;

    updateUI();
    showStatus('Saved', 'success');
  } catch (error) {
    showStatus(`Error: ${error}`, 'error');
    console.error('Failed to save macro:', error);
  }
}

/**
 * Create a new macro
 */
function newMacro(): void {
  if (state.isModified) {
    if (!confirm('You have unsaved changes. Create new macro anyway?')) {
      return;
    }
  }

  const template = `' iMacros Macro
' Created: ${new Date().toISOString().split('T')[0]}

VERSION BUILD=1
TAB T=1

' Add your commands here
URL GOTO=https://example.com
`;

  state.currentPath = null;
  state.originalContent = '';
  state.isModified = true;
  state.isNewMacro = true;

  if (editorView) {
    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: template,
      },
    });
  }

  updateUI();
  showStatus('New macro created', 'success');
}

/**
 * Run the current macro
 */
async function runMacro(): Promise<void> {
  if (!editorView) return;

  // Save first if modified
  if (state.isModified) {
    await saveMacro();
  }

  if (!state.currentPath) {
    showStatus('Please save the macro first', 'error');
    return;
  }

  try {
    showStatus('Running...', 'info');

    await sendToBackground('PLAY_MACRO', {
      path: state.currentPath,
      loop: false,
    });

    showStatus('Macro started', 'success');
  } catch (error) {
    showStatus(`Error: ${error}`, 'error');
    console.error('Failed to run macro:', error);
  }
}

/**
 * Show status message
 */
function showStatus(message: string, type: 'info' | 'success' | 'error' = 'info'): void {
  const statusEl = document.getElementById('status-message');
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = `status-message status-${type}`;

    // Auto-hide after 3 seconds for success/info
    if (type !== 'error') {
      setTimeout(() => {
        if (statusEl.textContent === message) {
          statusEl.textContent = '';
          statusEl.className = 'status-message';
        }
      }, 3000);
    }
  }
}

/**
 * Get macro path from URL parameters
 */
function getPathFromURL(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('path');
}

/**
 * Handle keyboard shortcuts
 */
function handleKeyDown(event: KeyboardEvent): void {
  // Ctrl/Cmd + S = Save
  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault();
    saveMacro();
  }

  // Ctrl/Cmd + N = New
  if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
    event.preventDefault();
    newMacro();
  }

  // F5 = Run
  if (event.key === 'F5') {
    event.preventDefault();
    runMacro();
  }
}

/**
 * Setup toolbar button handlers
 */
function setupToolbar(): void {
  document.getElementById('btn-new')?.addEventListener('click', newMacro);
  document.getElementById('btn-save')?.addEventListener('click', saveMacro);
  document.getElementById('btn-run')?.addEventListener('click', runMacro);

  // Close button
  document.getElementById('btn-close')?.addEventListener('click', () => {
    if (state.isModified) {
      if (!confirm('You have unsaved changes. Close anyway?')) {
        return;
      }
    }
    window.close();
  });
}

/**
 * Handle window beforeunload
 */
function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (state.isModified) {
    event.preventDefault();
    event.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
  }
}

/**
 * Initialize the editor
 */
function initializeEditor(): void {
  const editorContainer = document.getElementById('editor-container');
  if (!editorContainer) {
    console.error('Editor container not found');
    return;
  }

  // Create the editor
  editorView = createEditor(editorContainer);

  // Setup toolbar
  setupToolbar();

  // Setup keyboard shortcuts
  document.addEventListener('keydown', handleKeyDown);

  // Setup beforeunload warning
  window.addEventListener('beforeunload', handleBeforeUnload);

  // Check if we should load a specific macro
  const path = getPathFromURL();
  if (path) {
    loadMacro(path);
  } else {
    // Start with new macro
    newMacro();
  }

  console.log('iMacros editor initialized');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeEditor);
} else {
  initializeEditor();
}

// Export for potential external use
export { loadMacro, saveMacro, newMacro, runMacro };
