/**
 * Status Synchronization Module
 * Handles real-time status synchronization between the panel UI and the native host
 * via the background script. Manages playback/recording status, line numbers,
 * loop counts, and error messages.
 */

/**
 * Execution status types
 */
export type ExecutionStatus = 'idle' | 'playing' | 'recording' | 'paused' | 'error';

/**
 * Log entry for execution tracking
 */
export interface LogEntry {
  timestamp: number;
  type: 'info' | 'debug' | 'warn' | 'error' | 'command';
  line?: number;
  message: string;
}

/**
 * Status update payload from native host
 */
export interface StatusUpdate {
  status: ExecutionStatus;
  message?: string;
  line?: number;
  loop?: number;
  maxLoop?: number;
  macroName?: string;
  errorCode?: number;
  errorDetails?: string;
}

/**
 * Progress update for macro execution
 */
export interface ProgressUpdate {
  line: number;
  totalLines?: number;
  loop: number;
  maxLoop: number;
  command?: string;
}

/**
 * Error information from native host
 */
export interface ErrorInfo {
  message: string;
  code?: number;
  line?: number;
  command?: string;
  details?: string;
}

/**
 * Event types emitted by StatusSync
 */
export type StatusSyncEvent =
  | { type: 'status_change'; status: ExecutionStatus; message: string }
  | { type: 'progress'; progress: ProgressUpdate }
  | { type: 'error'; error: ErrorInfo }
  | { type: 'complete'; message: string }
  | { type: 'recording_line'; line: number; command: string };

/**
 * Listener callback type
 */
export type StatusSyncListener = (event: StatusSyncEvent) => void;

/**
 * Status synchronization state
 */
interface StatusSyncState {
  status: ExecutionStatus;
  statusMessage: string;
  currentLine: number;
  totalLines: number;
  currentLoop: number;
  maxLoop: number;
  currentMacro: string | null;
  lastError: ErrorInfo | null;
  startTime: number | null;
}

/**
 * StatusSync class - manages status synchronization with native host
 */
export class StatusSync {
  private state: StatusSyncState;
  private listeners: Set<StatusSyncListener>;
  private logs: LogEntry[] = [];
  private uiElements: {
    statusIndicator: HTMLElement | null;
    statusText: HTMLElement | null;
    lineCounter: HTMLElement | null;
    loopCounter: HTMLElement | null;
    progressBar: HTMLElement | null;
    errorDisplay: HTMLElement | null;
  };

  constructor() {
    this.state = {
      status: 'idle',
      statusMessage: 'Ready',
      currentLine: 0,
      totalLines: 0,
      currentLoop: 0,
      maxLoop: 1,
      currentMacro: null,
      lastError: null,
      startTime: null,
    };

    this.listeners = new Set();
    this.uiElements = {
      statusIndicator: null,
      statusText: null,
      lineCounter: null,
      loopCounter: null,
      progressBar: null,
      errorDisplay: null,
    };

    this.setupMessageListener();
  }

  /**
   * Initialize UI element bindings
   */
  bindUIElements(elements: {
    statusIndicator?: HTMLElement | null;
    statusText?: HTMLElement | null;
    lineCounter?: HTMLElement | null;
    loopCounter?: HTMLElement | null;
    progressBar?: HTMLElement | null;
    errorDisplay?: HTMLElement | null;
  }): void {
    this.uiElements = {
      statusIndicator: elements.statusIndicator ?? null,
      statusText: elements.statusText ?? null,
      lineCounter: elements.lineCounter ?? null,
      loopCounter: elements.loopCounter ?? null,
      progressBar: elements.progressBar ?? null,
      errorDisplay: elements.errorDisplay ?? null,
    };
    this.updateUI();
  }

  /**
   * Add a status change listener
   */
  addListener(listener: StatusSyncListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Remove a status change listener
   */
  removeListener(listener: StatusSyncListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Add a log entry
   */
  addLog(type: LogEntry['type'], message: string, line?: number): void {
    this.logs.push({ timestamp: Date.now(), type, message, line });
    // Keep max 500 entries
    if (this.logs.length > 500) {
      this.logs.shift();
    }
  }

  /**
   * Get all log entries
   */
  getLogs(): ReadonlyArray<LogEntry> {
    return this.logs;
  }

  /**
   * Clear all log entries
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Get current state
   */
  getState(): Readonly<StatusSyncState> {
    return { ...this.state };
  }

  /**
   * Get current execution status
   */
  getStatus(): ExecutionStatus {
    return this.state.status;
  }

  /**
   * Check if currently executing (playing or recording)
   */
  isExecuting(): boolean {
    return this.state.status === 'playing' || this.state.status === 'recording';
  }

  /**
   * Check if idle (ready or error state)
   */
  isIdle(): boolean {
    return this.state.status === 'idle' || this.state.status === 'error';
  }

  /**
   * Set status (for local state updates before native host confirms)
   */
  setStatus(status: ExecutionStatus, message?: string): void {
    const previousStatus = this.state.status;
    this.state.status = status;

    if (message !== undefined) {
      this.state.statusMessage = message;
    } else {
      this.state.statusMessage = this.getDefaultStatusMessage(status);
    }

    if (status === 'playing' || status === 'recording') {
      this.state.startTime = Date.now();
    } else if (status === 'idle') {
      this.state.startTime = null;
    }

    if (status === 'idle' || status === 'error') {
      this.state.currentLine = 0;
    }

    this.updateUI();
    this.emit({ type: 'status_change', status, message: this.state.statusMessage });
  }

  /**
   * Set progress (line and loop numbers)
   */
  setProgress(line: number, loop?: number, maxLoop?: number): void {
    this.state.currentLine = line;
    if (loop !== undefined) {
      this.state.currentLoop = loop;
    }
    if (maxLoop !== undefined) {
      this.state.maxLoop = maxLoop;
    }
    this.updateUI();
    this.emit({
      type: 'progress',
      progress: {
        line: this.state.currentLine,
        totalLines: this.state.totalLines,
        loop: this.state.currentLoop,
        maxLoop: this.state.maxLoop,
      },
    });
  }

  /**
   * Set current macro info
   */
  setMacro(macroName: string | null, totalLines?: number): void {
    this.state.currentMacro = macroName;
    if (totalLines !== undefined) {
      this.state.totalLines = totalLines;
    }
  }

  /**
   * Set max loop count
   */
  setMaxLoop(maxLoop: number): void {
    this.state.maxLoop = maxLoop;
    this.updateUI();
  }

  /**
   * Set error state
   */
  setError(error: ErrorInfo): void {
    this.state.status = 'error';
    this.state.statusMessage = error.message;
    this.state.lastError = error;
    this.updateUI();
    this.emit({ type: 'error', error });
  }

  /**
   * Clear error and reset to idle
   */
  clearError(): void {
    this.state.lastError = null;
    this.state.status = 'idle';
    this.state.statusMessage = 'Ready';
    this.updateUI();
  }

  /**
   * Reset all state to initial values
   */
  reset(): void {
    this.state = {
      status: 'idle',
      statusMessage: 'Ready',
      currentLine: 0,
      totalLines: 0,
      currentLoop: 0,
      maxLoop: 1,
      currentMacro: null,
      lastError: null,
      startTime: null,
    };
    this.updateUI();
  }

  /**
   * Setup Chrome runtime message listener for status updates from background
   */
  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
      this.handleMessage(message);
      return false; // Synchronous response
    });
  }

  /**
   * Handle incoming messages from background script
   */
  private handleMessage(message: { type: string; payload?: Record<string, unknown> }): void {
    const payload = message.payload || {};

    switch (message.type) {
      case 'STATUS_UPDATE':
        this.handleStatusUpdate(payload as unknown as StatusUpdate);
        break;

      case 'MACRO_PROGRESS':
        this.handleProgressUpdate(payload);
        break;

      case 'MACRO_COMPLETE':
        this.handleComplete(payload);
        break;

      case 'MACRO_ERROR':
        this.handleError(payload);
        break;

      case 'RECORDING_LINE':
        this.handleRecordingLine(payload);
        break;

      case 'RECORDING_SAVED':
        this.handleRecordingSaved();
        break;

      case 'MACRO_PAUSED':
        this.state.status = 'paused';
        this.state.statusMessage = 'Paused';
        this.updateUI();
        this.emit({ type: 'status_change', status: 'paused', message: 'Paused' });
        break;

      case 'MACRO_RESUMED':
        this.state.status = 'playing';
        this.state.statusMessage = `Playing: ${this.state.currentMacro || 'macro'}`;
        this.updateUI();
        this.emit({ type: 'status_change', status: 'playing', message: this.state.statusMessage });
        break;
    }
  }

  /**
   * Handle status update from native host
   */
  private handleStatusUpdate(update: StatusUpdate): void {
    if (update.status) {
      this.state.status = update.status;
    }
    if (update.message) {
      this.state.statusMessage = update.message;
    }
    if (update.line !== undefined) {
      this.state.currentLine = update.line;
    }
    if (update.loop !== undefined) {
      this.state.currentLoop = update.loop;
    }
    if (update.maxLoop !== undefined) {
      this.state.maxLoop = update.maxLoop;
    }
    if (update.macroName) {
      this.state.currentMacro = update.macroName;
    }

    this.updateUI();
    this.emit({ type: 'status_change', status: this.state.status, message: this.state.statusMessage });
  }

  /**
   * Handle progress update during macro playback
   */
  private handleProgressUpdate(payload: Record<string, unknown>): void {
    // Native host sends: currentLine, currentLoop, maxLoops, currentCommand
    const line = typeof payload.currentLine === 'number' ? payload.currentLine :
                 (typeof payload.line === 'number' ? payload.line : 0);
    const loop = typeof payload.currentLoop === 'number' ? payload.currentLoop :
                 (typeof payload.loop === 'number' ? payload.loop : this.state.currentLoop);
    const maxLoop = typeof payload.maxLoops === 'number' ? payload.maxLoops :
                    (typeof payload.maxLoop === 'number' ? payload.maxLoop : this.state.maxLoop);
    const command = typeof payload.currentCommand === 'string' ? payload.currentCommand :
                    (typeof payload.command === 'string' ? payload.command : undefined);

    this.state.currentLine = line;
    this.state.currentLoop = loop;
    this.state.maxLoop = maxLoop;

    // Log the command execution
    this.addLog('command', command || `Line ${line}`, line);

    this.updateUI();
    this.emit({
      type: 'progress',
      progress: {
        line,
        totalLines: this.state.totalLines,
        loop,
        maxLoop,
        command,
      },
    });
  }

  /**
   * Handle macro completion
   */
  private handleComplete(payload: Record<string, unknown>): void {
    const message = typeof payload.message === 'string' ? payload.message : 'Complete';

    this.state.status = 'idle';
    this.state.statusMessage = message;
    this.state.currentLine = 0;
    this.state.startTime = null;

    // Log completion
    this.addLog('info', 'Macro completed successfully');

    this.updateUI();
    this.emit({ type: 'complete', message });
    this.emit({ type: 'status_change', status: 'idle', message });
  }

  /**
   * Handle macro error
   */
  private handleError(payload: Record<string, unknown>): void {
    // Native host sends: errorMessage/error, errorCode, errorLine
    const message = typeof payload.errorMessage === 'string' ? payload.errorMessage :
                    (typeof payload.error === 'string' ? payload.error :
                    (typeof payload.message === 'string' ? payload.message : 'Error occurred'));
    const code = typeof payload.errorCode === 'number' ? payload.errorCode :
                 (typeof payload.code === 'number' ? payload.code : undefined);
    const line = typeof payload.errorLine === 'number' ? payload.errorLine :
                 (typeof payload.line === 'number' ? payload.line : undefined);

    const errorInfo: ErrorInfo = {
      message,
      code,
      line,
      command: typeof payload.command === 'string' ? payload.command : undefined,
      details: typeof payload.details === 'string' ? payload.details : undefined,
    };

    this.state.status = 'error';
    this.state.statusMessage = errorInfo.message;
    this.state.lastError = errorInfo;
    this.state.startTime = null;

    // Log the error with details
    const errorMsg = `${errorInfo.message}${errorInfo.line ? ` at line ${errorInfo.line}` : ''}`;
    this.addLog('error', errorMsg, errorInfo.line);

    this.updateUI();
    this.emit({ type: 'error', error: errorInfo });
  }

  /**
   * Handle recording line update
   */
  private handleRecordingLine(payload: Record<string, unknown>): void {
    const line = typeof payload.line === 'number' ? payload.line : 0;
    const command = typeof payload.command === 'string' ? payload.command : '';

    this.state.currentLine = line;
    this.updateUI();
    this.emit({ type: 'recording_line', line, command });
  }

  /**
   * Handle recording saved
   */
  private handleRecordingSaved(): void {
    this.state.status = 'idle';
    this.state.statusMessage = 'Recording saved';
    this.state.currentLine = 0;
    this.state.startTime = null;

    this.updateUI();
    this.emit({ type: 'complete', message: 'Recording saved' });
    this.emit({ type: 'status_change', status: 'idle', message: 'Recording saved' });
  }

  /**
   * Update all bound UI elements
   */
  private updateUI(): void {
    // Update status indicator
    if (this.uiElements.statusIndicator) {
      this.uiElements.statusIndicator.className = `status-indicator ${this.getStatusClass()}`;
    }

    // Update status text
    if (this.uiElements.statusText) {
      this.uiElements.statusText.textContent = this.state.statusMessage;

      // Add error class for error messages
      if (this.state.status === 'error') {
        this.uiElements.statusText.classList.add('error');
      } else {
        this.uiElements.statusText.classList.remove('error');
      }
    }

    // Update line counter
    if (this.uiElements.lineCounter) {
      this.uiElements.lineCounter.textContent = String(this.state.currentLine);
    }

    // Update loop counter
    if (this.uiElements.loopCounter) {
      if (this.state.maxLoop > 1) {
        this.uiElements.loopCounter.textContent = `${this.state.currentLoop}/${this.state.maxLoop}`;
      } else {
        this.uiElements.loopCounter.textContent = String(this.state.currentLoop || 1);
      }
    }

    // Update progress bar if available
    if (this.uiElements.progressBar && this.state.totalLines > 0) {
      const progress = (this.state.currentLine / this.state.totalLines) * 100;
      (this.uiElements.progressBar as HTMLElement).style.width = `${progress}%`;
    }

    // Update error display
    if (this.uiElements.errorDisplay) {
      if (this.state.lastError) {
        this.uiElements.errorDisplay.textContent = this.formatError(this.state.lastError);
        this.uiElements.errorDisplay.style.display = 'block';
      } else {
        this.uiElements.errorDisplay.textContent = '';
        this.uiElements.errorDisplay.style.display = 'none';
      }
    }
  }

  /**
   * Get CSS class for current status
   */
  private getStatusClass(): string {
    switch (this.state.status) {
      case 'idle':
        return 'ready';
      case 'playing':
        return 'playing';
      case 'recording':
        return 'recording';
      case 'paused':
        return 'paused';
      case 'error':
        return 'error';
      default:
        return 'ready';
    }
  }

  /**
   * Get default status message for a status
   */
  private getDefaultStatusMessage(status: ExecutionStatus): string {
    switch (status) {
      case 'idle':
        return 'Ready';
      case 'playing':
        return this.state.currentMacro ? `Playing: ${this.state.currentMacro}` : 'Playing...';
      case 'recording':
        return 'Recording...';
      case 'paused':
        return 'Paused';
      case 'error':
        return this.state.lastError?.message || 'Error occurred';
      default:
        return 'Ready';
    }
  }

  /**
   * Format error for display
   */
  private formatError(error: ErrorInfo): string {
    let formatted = error.message;
    if (error.line !== undefined) {
      formatted += ` (line ${error.line})`;
    }
    if (error.code !== undefined) {
      formatted += ` [Error ${error.code}]`;
    }
    return formatted;
  }

  /**
   * Emit event to all listeners
   */
  private emit(event: StatusSyncEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[StatusSync] Listener error:', err);
      }
    }
  }

  /**
   * Get elapsed time since execution started
   */
  getElapsedTime(): number | null {
    if (!this.state.startTime) {
      return null;
    }
    return Date.now() - this.state.startTime;
  }

  /**
   * Get formatted elapsed time string
   */
  getElapsedTimeString(): string {
    const elapsed = this.getElapsedTime();
    if (elapsed === null) {
      return '--:--';
    }

    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}

/**
 * Create and export a singleton instance
 */
export const statusSync = new StatusSync();

/**
 * Convenience function to initialize status sync with UI elements
 */
export function initializeStatusSync(): StatusSync {
  // Bind to common UI element IDs
  statusSync.bindUIElements({
    statusIndicator: document.getElementById('status-indicator'),
    statusText: document.getElementById('status-text'),
    lineCounter: document.getElementById('line-counter'),
    loopCounter: document.getElementById('loop-counter'),
    progressBar: document.getElementById('progress-bar'),
    errorDisplay: document.getElementById('error-display'),
  });

  return statusSync;
}
