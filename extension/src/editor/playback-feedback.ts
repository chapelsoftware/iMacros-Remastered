/**
 * Playback Visual Feedback Module
 *
 * Provides visual feedback during macro playback:
 * - Current line highlighting
 * - Error line highlighting (red)
 * - Message box with Edit/Help/Close buttons
 * - Jump to error line functionality
 */

import { EditorView, Decoration, DecorationSet } from '@codemirror/view';
import { StateField, StateEffect, EditorState } from '@codemirror/state';

// ===== Line Highlighting Effects =====

/**
 * Effect to set the current playing line (1-based)
 */
export const setPlayingLine = StateEffect.define<number | null>();

/**
 * Effect to set the error line (1-based)
 */
export const setErrorLine = StateEffect.define<number | null>();

/**
 * Effect to clear all playback decorations
 */
export const clearPlaybackDecorations = StateEffect.define<void>();

// ===== Decoration Styles =====

const playingLineDecoration = Decoration.line({
  class: 'cm-playback-line',
  attributes: { 'data-playback': 'playing' },
});

const errorLineDecoration = Decoration.line({
  class: 'cm-playback-error-line',
  attributes: { 'data-playback': 'error' },
});

// ===== State Field for Playback Decorations =====

interface PlaybackState {
  playingLine: number | null;
  errorLine: number | null;
}

/**
 * State field that tracks current playback decorations
 */
export const playbackDecorations = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    let playingLine: number | null = null;
    let errorLine: number | null = null;

    // Check for effects
    for (const effect of tr.effects) {
      if (effect.is(setPlayingLine)) {
        playingLine = effect.value;
      } else if (effect.is(setErrorLine)) {
        errorLine = effect.value;
      } else if (effect.is(clearPlaybackDecorations)) {
        return Decoration.none;
      }
    }

    // If no relevant effects, keep existing decorations mapped
    if (playingLine === null && errorLine === null) {
      return decorations.map(tr.changes);
    }

    // Build new decoration set
    const builder: { from: number; to: number; value: Decoration }[] = [];
    const doc = tr.state.doc;

    if (playingLine !== null && playingLine >= 1 && playingLine <= doc.lines) {
      const line = doc.line(playingLine);
      builder.push({
        from: line.from,
        to: line.from,
        value: playingLineDecoration,
      });
    }

    if (errorLine !== null && errorLine >= 1 && errorLine <= doc.lines) {
      const line = doc.line(errorLine);
      builder.push({
        from: line.from,
        to: line.from,
        value: errorLineDecoration,
      });
    }

    // Sort by position and create decoration set
    builder.sort((a, b) => a.from - b.from);
    return Decoration.set(builder.map(d => d.value.range(d.from)));
  },
  provide: (field) => EditorView.decorations.from(field),
});

// ===== CSS Theme for Playback Feedback =====

export const playbackTheme = EditorView.baseTheme({
  '.cm-playback-line': {
    backgroundColor: '#fff8c5 !important',
    borderLeft: '3px solid #ffc107',
  },
  '.cm-playback-error-line': {
    backgroundColor: '#ffebee !important',
    borderLeft: '3px solid #f44336',
  },
  '&dark .cm-playback-line': {
    backgroundColor: '#3d3d00 !important',
    borderLeft: '3px solid #ffc107',
  },
  '&dark .cm-playback-error-line': {
    backgroundColor: '#4a1c1c !important',
    borderLeft: '3px solid #f44336',
  },
});

// ===== Extension Bundle =====

/**
 * Get all playback feedback extensions for CodeMirror
 */
export function getPlaybackFeedbackExtensions() {
  return [playbackDecorations, playbackTheme];
}

// ===== Helper Functions =====

/**
 * Highlight the currently playing line in the editor
 */
export function highlightPlayingLine(view: EditorView, lineNumber: number | null): void {
  view.dispatch({
    effects: setPlayingLine.of(lineNumber),
  });
}

/**
 * Highlight the error line in the editor
 */
export function highlightErrorLine(view: EditorView, lineNumber: number | null): void {
  view.dispatch({
    effects: setErrorLine.of(lineNumber),
  });
}

/**
 * Clear all playback highlighting
 */
export function clearPlaybackHighlighting(view: EditorView): void {
  view.dispatch({
    effects: clearPlaybackDecorations.of(undefined),
  });
}

/**
 * Jump to a specific line in the editor (scrolls and highlights)
 */
export function jumpToLine(view: EditorView, lineNumber: number): void {
  const doc = view.state.doc;
  if (lineNumber < 1 || lineNumber > doc.lines) {
    return;
  }

  const line = doc.line(lineNumber);

  // Scroll to the line
  view.dispatch({
    selection: { anchor: line.from },
    scrollIntoView: true,
    effects: setErrorLine.of(lineNumber),
  });
}

/**
 * Jump to error line and highlight it
 */
export function jumpToErrorLine(view: EditorView, lineNumber: number): void {
  const doc = view.state.doc;
  if (lineNumber < 1 || lineNumber > doc.lines) {
    return;
  }

  const line = doc.line(lineNumber);

  view.dispatch({
    selection: { anchor: line.from },
    scrollIntoView: true,
    effects: setErrorLine.of(lineNumber),
  });
}

// ===== Message Box Types =====

export type MessageBoxType = 'success' | 'error' | 'warning' | 'info';

export interface MessageBoxConfig {
  type: MessageBoxType;
  title: string;
  message: string;
  errorLine?: number;
  errorCode?: number;
  showEdit?: boolean;
  showHelp?: boolean;
  onEdit?: () => void;
  onHelp?: () => void;
  onClose?: () => void;
}

// ===== Message Box Component =====

/**
 * Message Box class for displaying playback completion/error messages
 */
export class MessageBox {
  private container: HTMLElement | null = null;
  private visible: boolean = false;
  private config: MessageBoxConfig | null = null;
  private parentElement: HTMLElement;

  constructor(parentElement: HTMLElement) {
    this.parentElement = parentElement;
  }

  /**
   * Show the message box with the given configuration
   */
  show(config: MessageBoxConfig): void {
    this.config = config;
    this.visible = true;
    this.render();
  }

  /**
   * Hide and remove the message box
   */
  hide(): void {
    this.visible = false;
    if (this.container && this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
    this.container = null;
    if (this.config?.onClose) {
      this.config.onClose();
    }
    this.config = null;
  }

  /**
   * Check if message box is currently visible
   */
  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Render the message box
   */
  private render(): void {
    if (!this.config) return;

    // Remove existing container if any
    if (this.container && this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }

    // Create container
    this.container = document.createElement('div');
    this.container.className = `imacros-message-box imacros-message-box-${this.config.type}`;
    this.container.setAttribute('role', 'alertdialog');
    this.container.setAttribute('aria-modal', 'true');
    this.container.setAttribute('aria-labelledby', 'imacros-msgbox-title');
    this.container.setAttribute('aria-describedby', 'imacros-msgbox-message');

    // Build HTML
    const iconSvg = this.getIcon(this.config.type);
    const errorInfo = this.config.errorLine !== undefined || this.config.errorCode !== undefined
      ? `<div class="imacros-msgbox-error-info">
          ${this.config.errorLine !== undefined ? `<span class="error-line">Line ${this.config.errorLine}</span>` : ''}
          ${this.config.errorCode !== undefined ? `<span class="error-code">Error ${this.config.errorCode}</span>` : ''}
        </div>`
      : '';

    this.container.innerHTML = `
      <div class="imacros-msgbox-overlay"></div>
      <div class="imacros-msgbox-content">
        <div class="imacros-msgbox-header">
          <div class="imacros-msgbox-icon">${iconSvg}</div>
          <h3 id="imacros-msgbox-title" class="imacros-msgbox-title">${this.escapeHtml(this.config.title)}</h3>
        </div>
        <p id="imacros-msgbox-message" class="imacros-msgbox-message">${this.escapeHtml(this.config.message)}</p>
        ${errorInfo}
        <div class="imacros-msgbox-buttons">
          ${this.config.showEdit !== false && this.config.errorLine !== undefined ? '<button class="imacros-msgbox-btn imacros-msgbox-btn-edit">Edit</button>' : ''}
          ${this.config.showHelp !== false ? '<button class="imacros-msgbox-btn imacros-msgbox-btn-help">Help</button>' : ''}
          <button class="imacros-msgbox-btn imacros-msgbox-btn-close imacros-msgbox-btn-primary">Close</button>
        </div>
      </div>
    `;

    // Add event listeners
    const closeBtn = this.container.querySelector('.imacros-msgbox-btn-close');
    const editBtn = this.container.querySelector('.imacros-msgbox-btn-edit');
    const helpBtn = this.container.querySelector('.imacros-msgbox-btn-help');
    const overlay = this.container.querySelector('.imacros-msgbox-overlay');

    closeBtn?.addEventListener('click', () => this.hide());
    overlay?.addEventListener('click', () => this.hide());

    if (editBtn && this.config.onEdit) {
      editBtn.addEventListener('click', () => {
        this.config?.onEdit?.();
        this.hide();
      });
    }

    if (helpBtn) {
      helpBtn.addEventListener('click', () => {
        if (this.config?.onHelp) {
          this.config.onHelp();
        } else {
          window.open('https://wiki.imacros.net/', '_blank');
        }
      });
    }

    // Handle Escape key
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.hide();
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    // Append to parent
    this.parentElement.appendChild(this.container);

    // Focus close button
    (closeBtn as HTMLElement)?.focus();
  }

  /**
   * Get icon SVG for message type
   */
  private getIcon(type: MessageBoxType): string {
    switch (type) {
      case 'success':
        return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>';
      case 'error':
        return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
      case 'warning':
        return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 22h20L12 2z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
      case 'info':
      default:
        return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    }
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// ===== Message Box CSS =====

export const messageBoxCSS = `
/* Message Box Styles */
.imacros-message-box {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.imacros-msgbox-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
}

.imacros-msgbox-content {
  position: relative;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
  max-width: 400px;
  width: 90%;
  padding: 20px;
  animation: imacros-msgbox-appear 0.2s ease-out;
}

@keyframes imacros-msgbox-appear {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.imacros-msgbox-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.imacros-msgbox-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
}

.imacros-message-box-success .imacros-msgbox-icon {
  color: #4caf50;
}

.imacros-message-box-error .imacros-msgbox-icon {
  color: #f44336;
}

.imacros-message-box-warning .imacros-msgbox-icon {
  color: #ff9800;
}

.imacros-message-box-info .imacros-msgbox-icon {
  color: #2196f3;
}

.imacros-msgbox-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.imacros-msgbox-message {
  margin: 0 0 16px;
  color: #666;
  font-size: 14px;
  line-height: 1.5;
}

.imacros-msgbox-error-info {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  font-size: 12px;
}

.imacros-msgbox-error-info .error-line {
  padding: 4px 8px;
  background: #ffebee;
  color: #c62828;
  border-radius: 4px;
  font-family: monospace;
}

.imacros-msgbox-error-info .error-code {
  padding: 4px 8px;
  background: #fff3e0;
  color: #e65100;
  border-radius: 4px;
  font-family: monospace;
}

.imacros-msgbox-buttons {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.imacros-msgbox-btn {
  padding: 8px 16px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
  background: white;
  color: #333;
}

.imacros-msgbox-btn:hover {
  background: #f5f5f5;
  border-color: #ccc;
}

.imacros-msgbox-btn:focus {
  outline: 2px solid #2196f3;
  outline-offset: 2px;
}

.imacros-msgbox-btn-primary {
  background: #2196f3;
  border-color: #2196f3;
  color: white;
}

.imacros-msgbox-btn-primary:hover {
  background: #1976d2;
  border-color: #1976d2;
}

.imacros-msgbox-btn-edit {
  background: #ff9800;
  border-color: #ff9800;
  color: white;
}

.imacros-msgbox-btn-edit:hover {
  background: #f57c00;
  border-color: #f57c00;
}
`;

// ===== Inject Message Box CSS =====

/**
 * Inject the message box CSS into the document
 */
export function injectMessageBoxCSS(): void {
  if (document.getElementById('imacros-msgbox-styles')) {
    return;
  }
  const style = document.createElement('style');
  style.id = 'imacros-msgbox-styles';
  style.textContent = messageBoxCSS;
  document.head.appendChild(style);
}

// ===== Playback Feedback Controller =====

/**
 * Main controller for playback visual feedback
 * Integrates line highlighting and message box functionality
 */
export class PlaybackFeedbackController {
  private editorView: EditorView | null = null;
  private messageBox: MessageBox | null = null;
  private isPlaying: boolean = false;
  private currentLine: number = 0;

  constructor() {}

  /**
   * Attach the controller to an editor view
   */
  attachEditor(view: EditorView): void {
    this.editorView = view;
    injectMessageBoxCSS();

    // Find parent element for message box
    const parent = view.dom.closest('.editor-app') || document.body;
    this.messageBox = new MessageBox(parent as HTMLElement);
  }

  /**
   * Detach from the editor
   */
  detach(): void {
    this.clearHighlighting();
    this.hideMessage();
    this.editorView = null;
    this.messageBox = null;
  }

  /**
   * Start playback mode
   */
  startPlayback(): void {
    this.isPlaying = true;
    this.currentLine = 0;
    this.clearHighlighting();
  }

  /**
   * Stop playback mode
   */
  stopPlayback(): void {
    this.isPlaying = false;
    this.clearHighlighting();
  }

  /**
   * Update the current playing line
   */
  setCurrentLine(lineNumber: number): void {
    this.currentLine = lineNumber;
    if (this.editorView && this.isPlaying) {
      highlightPlayingLine(this.editorView, lineNumber);
    }
  }

  /**
   * Show playback completion message
   */
  showCompletionMessage(message: string = 'Macro completed successfully'): void {
    this.clearHighlighting();
    this.messageBox?.show({
      type: 'success',
      title: 'Playback Complete',
      message,
      showEdit: false,
      showHelp: false,
    });
  }

  /**
   * Show error message with optional jump to line
   */
  showErrorMessage(
    message: string,
    errorLine?: number,
    errorCode?: number
  ): void {
    // Highlight error line
    if (errorLine && this.editorView) {
      highlightErrorLine(this.editorView, errorLine);
    }

    this.messageBox?.show({
      type: 'error',
      title: 'Playback Error',
      message,
      errorLine,
      errorCode,
      showEdit: errorLine !== undefined,
      showHelp: true,
      onEdit: errorLine !== undefined ? () => this.jumpToErrorLine(errorLine) : undefined,
    });
  }

  /**
   * Jump to and highlight an error line
   */
  jumpToErrorLine(lineNumber: number): void {
    if (this.editorView) {
      jumpToErrorLine(this.editorView, lineNumber);
    }
  }

  /**
   * Clear all highlighting
   */
  clearHighlighting(): void {
    if (this.editorView) {
      clearPlaybackHighlighting(this.editorView);
    }
  }

  /**
   * Hide the message box
   */
  hideMessage(): void {
    this.messageBox?.hide();
  }

  /**
   * Check if currently playing
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Get current line number
   */
  getCurrentLine(): number {
    return this.currentLine;
  }
}

// ===== Export singleton instance =====

export const playbackFeedback = new PlaybackFeedbackController();
