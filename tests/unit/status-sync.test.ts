/**
 * StatusSync Unit Tests
 *
 * Tests for extension/src/panel/status-sync.ts covering:
 * - StatusSync class constructor and initial state
 * - Status state management (setStatus, getStatus, isIdle, isExecuting)
 * - Progress tracking (setProgress, setMacro, setMaxLoop)
 * - Error handling (setError, clearError)
 * - Log management (addLog, getLogs, clearLogs, max 500 entries)
 * - Event emission (addListener, removeListener)
 * - Message handling (STATUS_UPDATE, MACRO_PROGRESS, MACRO_COMPLETE, MACRO_ERROR, etc.)
 * - UI element binding and updates
 * - Elapsed time tracking
 * - Reset functionality
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';

// Set up DOM
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
(globalThis as any).document = dom.window.document;
(globalThis as any).window = dom.window;
(globalThis as any).HTMLElement = dom.window.HTMLElement;

// Use vi.hoisted to ensure chrome is available BEFORE StatusSync singleton is created at import
const { chromeMessageListenerRef } = vi.hoisted(() => {
  const ref = { current: null as Function | null };
  (globalThis as any).chrome = {
    runtime: {
      onMessage: {
        addListener: (listener: any) => {
          ref.current = listener;
        },
      },
    },
  };
  return { chromeMessageListenerRef: ref };
});

import { StatusSync } from '@extension/panel/status-sync';
import type { StatusSyncEvent, ExecutionStatus, ErrorInfo } from '@extension/panel/status-sync';

describe('StatusSync', () => {
  let sync: StatusSync;

  beforeEach(() => {
    vi.clearAllMocks();
    sync = new StatusSync();
  });

  // ===== Initial State =====

  describe('Initial State', () => {
    it('should start with idle status', () => {
      expect(sync.getStatus()).toBe('idle');
    });

    it('should start with Ready message', () => {
      expect(sync.getState().statusMessage).toBe('Ready');
    });

    it('should start with zero line/loop counts', () => {
      const state = sync.getState();
      expect(state.currentLine).toBe(0);
      expect(state.currentLoop).toBe(0);
      expect(state.maxLoop).toBe(1);
    });

    it('should start with null macro', () => {
      expect(sync.getState().currentMacro).toBeNull();
    });

    it('should start with no error', () => {
      expect(sync.getState().lastError).toBeNull();
    });

    it('should start with empty logs', () => {
      expect(sync.getLogs()).toHaveLength(0);
    });

    it('should be idle initially', () => {
      expect(sync.isIdle()).toBe(true);
      expect(sync.isExecuting()).toBe(false);
    });
  });

  // ===== Status Management =====

  describe('Status Management', () => {
    it('should set status to playing', () => {
      sync.setStatus('playing', 'Playing macro');
      expect(sync.getStatus()).toBe('playing');
      expect(sync.getState().statusMessage).toBe('Playing macro');
    });

    it('should set status to recording', () => {
      sync.setStatus('recording');
      expect(sync.getStatus()).toBe('recording');
    });

    it('should set status to paused', () => {
      sync.setStatus('paused');
      expect(sync.getStatus()).toBe('paused');
    });

    it('should set status to error', () => {
      sync.setStatus('error', 'Something went wrong');
      expect(sync.getStatus()).toBe('error');
    });

    it('should use default message when none provided', () => {
      sync.setStatus('playing');
      expect(sync.getState().statusMessage).toContain('Playing');
    });

    it('should set startTime for playing status', () => {
      sync.setStatus('playing');
      expect(sync.getState().startTime).not.toBeNull();
    });

    it('should set startTime for recording status', () => {
      sync.setStatus('recording');
      expect(sync.getState().startTime).not.toBeNull();
    });

    it('should clear startTime when idle', () => {
      sync.setStatus('playing');
      sync.setStatus('idle');
      expect(sync.getState().startTime).toBeNull();
    });

    it('should reset line to 0 when idle', () => {
      sync.setProgress(5);
      sync.setStatus('idle');
      expect(sync.getState().currentLine).toBe(0);
    });

    it('should reset line to 0 on error', () => {
      sync.setProgress(5);
      sync.setStatus('error', 'fail');
      expect(sync.getState().currentLine).toBe(0);
    });
  });

  // ===== isIdle / isExecuting =====

  describe('isIdle / isExecuting', () => {
    it('should return true for idle', () => {
      sync.setStatus('idle');
      expect(sync.isIdle()).toBe(true);
      expect(sync.isExecuting()).toBe(false);
    });

    it('should return true for error (isIdle)', () => {
      sync.setStatus('error');
      expect(sync.isIdle()).toBe(true);
    });

    it('should return true for playing (isExecuting)', () => {
      sync.setStatus('playing');
      expect(sync.isExecuting()).toBe(true);
      expect(sync.isIdle()).toBe(false);
    });

    it('should return true for recording (isExecuting)', () => {
      sync.setStatus('recording');
      expect(sync.isExecuting()).toBe(true);
    });

    it('should return false for paused (neither idle nor executing)', () => {
      sync.setStatus('paused');
      expect(sync.isIdle()).toBe(false);
      expect(sync.isExecuting()).toBe(false);
    });
  });

  // ===== Progress =====

  describe('Progress', () => {
    it('should set line progress', () => {
      sync.setProgress(10);
      expect(sync.getState().currentLine).toBe(10);
    });

    it('should set line and loop progress', () => {
      sync.setProgress(5, 2);
      expect(sync.getState().currentLine).toBe(5);
      expect(sync.getState().currentLoop).toBe(2);
    });

    it('should set line, loop, and maxLoop', () => {
      sync.setProgress(3, 1, 10);
      expect(sync.getState().currentLine).toBe(3);
      expect(sync.getState().currentLoop).toBe(1);
      expect(sync.getState().maxLoop).toBe(10);
    });
  });

  // ===== Macro =====

  describe('Macro', () => {
    it('should set macro name', () => {
      sync.setMacro('Test.iim');
      expect(sync.getState().currentMacro).toBe('Test.iim');
    });

    it('should set macro with total lines', () => {
      sync.setMacro('Test.iim', 20);
      expect(sync.getState().totalLines).toBe(20);
    });

    it('should clear macro', () => {
      sync.setMacro('Test.iim');
      sync.setMacro(null);
      expect(sync.getState().currentMacro).toBeNull();
    });
  });

  // ===== Max Loop =====

  describe('Max Loop', () => {
    it('should set max loop count', () => {
      sync.setMaxLoop(5);
      expect(sync.getState().maxLoop).toBe(5);
    });
  });

  // ===== Error Handling =====

  describe('Error Handling', () => {
    it('should set error with info', () => {
      const error: ErrorInfo = { message: 'Element not found', code: -920, line: 5 };
      sync.setError(error);
      expect(sync.getStatus()).toBe('error');
      expect(sync.getState().lastError).toEqual(error);
      expect(sync.getState().statusMessage).toBe('Element not found');
    });

    it('should clear error', () => {
      sync.setError({ message: 'fail' });
      sync.clearError();
      expect(sync.getStatus()).toBe('idle');
      expect(sync.getState().lastError).toBeNull();
      expect(sync.getState().statusMessage).toBe('Ready');
    });
  });

  // ===== Log Management =====

  describe('Log Management', () => {
    it('should add log entries', () => {
      sync.addLog('info', 'Starting');
      sync.addLog('command', 'URL GOTO=...', 1);
      expect(sync.getLogs()).toHaveLength(2);
    });

    it('should include timestamps', () => {
      sync.addLog('info', 'test');
      expect(sync.getLogs()[0].timestamp).toBeGreaterThan(0);
    });

    it('should include optional line number', () => {
      sync.addLog('command', 'TAG ...', 5);
      expect(sync.getLogs()[0].line).toBe(5);
    });

    it('should cap at 500 entries', () => {
      for (let i = 0; i < 510; i++) {
        sync.addLog('info', `entry ${i}`);
      }
      expect(sync.getLogs()).toHaveLength(500);
      // Oldest entries should be removed
      expect(sync.getLogs()[0].message).toBe('entry 10');
    });

    it('should clear logs', () => {
      sync.addLog('info', 'test');
      sync.clearLogs();
      expect(sync.getLogs()).toHaveLength(0);
    });

    it('should return readonly array', () => {
      sync.addLog('info', 'test');
      const logs = sync.getLogs();
      expect(Array.isArray(logs)).toBe(true);
    });
  });

  // ===== Event Listeners =====

  describe('Event Listeners', () => {
    it('should notify listeners on status change', () => {
      const listener = vi.fn();
      sync.addListener(listener);
      sync.setStatus('playing', 'go');
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'status_change', status: 'playing' }),
      );
    });

    it('should notify listeners on progress', () => {
      const listener = vi.fn();
      sync.addListener(listener);
      sync.setProgress(3, 1, 5);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'progress',
          progress: expect.objectContaining({ line: 3, loop: 1, maxLoop: 5 }),
        }),
      );
    });

    it('should notify listeners on error', () => {
      const listener = vi.fn();
      sync.addListener(listener);
      sync.setError({ message: 'fail' });
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' }),
      );
    });

    it('should remove listener with returned unsubscribe', () => {
      const listener = vi.fn();
      const unsub = sync.addListener(listener);
      unsub();
      sync.setStatus('playing');
      expect(listener).not.toHaveBeenCalled();
    });

    it('should remove listener with removeListener', () => {
      const listener = vi.fn();
      sync.addListener(listener);
      sync.removeListener(listener);
      sync.setStatus('playing');
      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle listener errors gracefully', () => {
      const badListener = vi.fn(() => {
        throw new Error('listener broke');
      });
      const goodListener = vi.fn();
      sync.addListener(badListener);
      sync.addListener(goodListener);
      sync.setStatus('playing');
      expect(goodListener).toHaveBeenCalled();
    });
  });

  // ===== Message Handling =====

  describe('Message Handling', () => {
    // Get the message handler that StatusSync registered
    function sendChromeMessage(message: any): void {
      if (chromeMessageListenerRef.current) {
        chromeMessageListenerRef.current(message, {}, () => {});
      }
    }

    it('should handle STATUS_UPDATE message', () => {
      sendChromeMessage({
        type: 'STATUS_UPDATE',
        payload: { status: 'playing', message: 'Running', line: 3, loop: 1 },
      });
      expect(sync.getStatus()).toBe('playing');
      expect(sync.getState().currentLine).toBe(3);
    });

    it('should handle MACRO_PROGRESS message', () => {
      const listener = vi.fn();
      sync.addListener(listener);
      sendChromeMessage({
        type: 'MACRO_PROGRESS',
        payload: { currentLine: 5, currentLoop: 2, maxLoops: 3, currentCommand: 'TAG ...' },
      });
      expect(sync.getState().currentLine).toBe(5);
      expect(sync.getState().currentLoop).toBe(2);
    });

    it('should handle MACRO_COMPLETE message', () => {
      sync.setStatus('playing');
      sendChromeMessage({
        type: 'MACRO_COMPLETE',
        payload: { message: 'Done' },
      });
      expect(sync.getStatus()).toBe('idle');
    });

    it('should handle MACRO_ERROR message', () => {
      sendChromeMessage({
        type: 'MACRO_ERROR',
        payload: { errorMessage: 'Element not found', errorCode: -920, errorLine: 5 },
      });
      expect(sync.getStatus()).toBe('error');
      expect(sync.getState().lastError?.code).toBe(-920);
    });

    it('should handle MACRO_PAUSED message', () => {
      sync.setStatus('playing');
      sendChromeMessage({ type: 'MACRO_PAUSED' });
      expect(sync.getStatus()).toBe('paused');
    });

    it('should handle MACRO_RESUMED message', () => {
      sync.setStatus('paused');
      sendChromeMessage({ type: 'MACRO_RESUMED' });
      expect(sync.getStatus()).toBe('playing');
    });

    it('should handle RECORDING_LINE message', () => {
      sendChromeMessage({
        type: 'RECORDING_LINE',
        payload: { line: 10, command: 'TAG ...' },
      });
      expect(sync.getState().currentLine).toBe(10);
    });

    it('should handle RECORDING_SAVED message', () => {
      sync.setStatus('recording');
      sendChromeMessage({ type: 'RECORDING_SAVED' });
      expect(sync.getStatus()).toBe('idle');
      expect(sync.getState().statusMessage).toBe('Recording saved');
    });
  });

  // ===== UI Element Binding =====

  describe('UI Element Binding', () => {
    it('should update status text element', () => {
      const statusText = document.createElement('span');
      sync.bindUIElements({ statusText });
      sync.setStatus('playing', 'Running Test.iim');
      expect(statusText.textContent).toBe('Running Test.iim');
    });

    it('should add error class to status text on error', () => {
      const statusText = document.createElement('span');
      sync.bindUIElements({ statusText });
      sync.setStatus('error', 'Fail');
      expect(statusText.classList.contains('error')).toBe(true);
    });

    it('should remove error class when not in error', () => {
      const statusText = document.createElement('span');
      sync.bindUIElements({ statusText });
      sync.setStatus('error', 'Fail');
      sync.setStatus('idle', 'Ready');
      expect(statusText.classList.contains('error')).toBe(false);
    });

    it('should update status indicator class', () => {
      const statusIndicator = document.createElement('div');
      sync.bindUIElements({ statusIndicator });
      sync.setStatus('playing');
      expect(statusIndicator.className).toBe('status-indicator playing');
    });

    it('should update line counter', () => {
      const lineCounter = document.createElement('span');
      sync.bindUIElements({ lineCounter });
      sync.setProgress(7);
      expect(lineCounter.textContent).toBe('7');
    });

    it('should update loop counter', () => {
      const loopCounter = document.createElement('span');
      sync.bindUIElements({ loopCounter });
      sync.setProgress(1, 3, 5);
      expect(loopCounter.textContent).toBe('3/5');
    });

    it('should show simple loop counter when maxLoop is 1', () => {
      const loopCounter = document.createElement('span');
      sync.bindUIElements({ loopCounter });
      sync.setProgress(1, 1, 1);
      expect(loopCounter.textContent).toBe('1');
    });
  });

  // ===== Elapsed Time =====

  describe('Elapsed Time', () => {
    it('should return null when not started', () => {
      expect(sync.getElapsedTime()).toBeNull();
    });

    it('should return elapsed time when playing', () => {
      sync.setStatus('playing');
      // startTime should be set
      expect(sync.getElapsedTime()).toBeGreaterThanOrEqual(0);
    });

    it('should format elapsed time', () => {
      expect(sync.getElapsedTimeString()).toBe('--:--');
      sync.setStatus('playing');
      // Should return MM:SS format
      expect(sync.getElapsedTimeString()).toMatch(/^\d{2}:\d{2}$/);
    });
  });

  // ===== Reset =====

  describe('Reset', () => {
    it('should reset all state to defaults', () => {
      sync.setStatus('playing', 'Running');
      sync.setProgress(10, 3, 5);
      sync.setMacro('Test.iim', 20);
      sync.reset();

      const state = sync.getState();
      expect(state.status).toBe('idle');
      expect(state.statusMessage).toBe('Ready');
      expect(state.currentLine).toBe(0);
      expect(state.currentLoop).toBe(0);
      expect(state.maxLoop).toBe(1);
      expect(state.currentMacro).toBeNull();
      expect(state.lastError).toBeNull();
      expect(state.startTime).toBeNull();
    });
  });

  // ===== State immutability =====

  describe('State Immutability', () => {
    it('should return a copy of state', () => {
      const state1 = sync.getState();
      const state2 = sync.getState();
      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });
  });

  // ===== Default Status Messages =====

  describe('Default Status Messages', () => {
    it('should use "Ready" for idle status', () => {
      sync.setStatus('idle');
      expect(sync.getState().statusMessage).toBe('Ready');
    });

    it('should include macro name in playing message', () => {
      sync.setMacro('Demo.iim');
      sync.setStatus('playing');
      expect(sync.getState().statusMessage).toContain('Demo.iim');
    });

    it('should use "Playing..." when no macro set', () => {
      sync.setStatus('playing');
      expect(sync.getState().statusMessage).toBe('Playing...');
    });

    it('should use "Recording..." for recording status', () => {
      sync.setStatus('recording');
      expect(sync.getState().statusMessage).toBe('Recording...');
    });

    it('should use "Paused" for paused status', () => {
      sync.setStatus('paused');
      expect(sync.getState().statusMessage).toBe('Paused');
    });

    it('should use error message for error status', () => {
      sync.setError({ message: 'Custom error' });
      sync.setStatus('error');
      expect(sync.getState().statusMessage).toBe('Custom error');
    });

    it('should fallback to "Error occurred" when no error info', () => {
      sync.setStatus('error');
      // No error set, so default message
      expect(sync.getState().statusMessage).toContain('Error');
    });
  });

  // ===== Progress Bar UI =====

  describe('Progress Bar UI', () => {
    it('should update progress bar width based on line/totalLines', () => {
      const progressBar = document.createElement('div');
      sync.bindUIElements({ progressBar });

      sync.setMacro('Test.iim', 10);
      sync.setProgress(5);

      expect(progressBar.style.width).toBe('50%');
    });

    it('should show 100% progress at last line', () => {
      const progressBar = document.createElement('div');
      sync.bindUIElements({ progressBar });

      sync.setMacro('Test.iim', 20);
      sync.setProgress(20);

      expect(progressBar.style.width).toBe('100%');
    });

    it('should not update progress bar when totalLines is 0', () => {
      const progressBar = document.createElement('div');
      sync.bindUIElements({ progressBar });

      sync.setProgress(5);

      // totalLines is 0, so no width update
      expect(progressBar.style.width).toBe('');
    });
  });

  // ===== Error Display UI =====

  describe('Error Display UI', () => {
    it('should show error display with formatted message', () => {
      const errorDisplay = document.createElement('div');
      sync.bindUIElements({ errorDisplay });

      sync.setError({ message: 'Element not found', line: 5, code: -920 });

      expect(errorDisplay.style.display).toBe('block');
      expect(errorDisplay.textContent).toContain('Element not found');
      expect(errorDisplay.textContent).toContain('line 5');
      expect(errorDisplay.textContent).toContain('Error -920');
    });

    it('should hide error display when no error', () => {
      const errorDisplay = document.createElement('div');
      sync.bindUIElements({ errorDisplay });

      // No error set
      sync.setStatus('idle');

      expect(errorDisplay.style.display).toBe('none');
    });

    it('should show error then hide on clearError', () => {
      const errorDisplay = document.createElement('div');
      sync.bindUIElements({ errorDisplay });

      sync.setError({ message: 'Something failed' });
      expect(errorDisplay.style.display).toBe('block');

      sync.clearError();
      expect(errorDisplay.style.display).toBe('none');
    });

    it('should format error without line number', () => {
      const errorDisplay = document.createElement('div');
      sync.bindUIElements({ errorDisplay });

      sync.setError({ message: 'General error' });

      expect(errorDisplay.textContent).toBe('General error');
      expect(errorDisplay.textContent).not.toContain('line');
    });

    it('should format error without code', () => {
      const errorDisplay = document.createElement('div');
      sync.bindUIElements({ errorDisplay });

      sync.setError({ message: 'Some error', line: 3 });

      expect(errorDisplay.textContent).toContain('line 3');
      expect(errorDisplay.textContent).not.toContain('Error ');
    });
  });

  // ===== Status Indicator CSS Classes =====

  describe('Status Indicator CSS Classes', () => {
    it('should use "ready" class for idle status', () => {
      const statusIndicator = document.createElement('div');
      sync.bindUIElements({ statusIndicator });

      sync.setStatus('idle');
      expect(statusIndicator.className).toBe('status-indicator ready');
    });

    it('should use "recording" class for recording status', () => {
      const statusIndicator = document.createElement('div');
      sync.bindUIElements({ statusIndicator });

      sync.setStatus('recording');
      expect(statusIndicator.className).toBe('status-indicator recording');
    });

    it('should use "paused" class for paused status', () => {
      const statusIndicator = document.createElement('div');
      sync.bindUIElements({ statusIndicator });

      sync.setStatus('paused');
      expect(statusIndicator.className).toBe('status-indicator paused');
    });

    it('should use "error" class for error status', () => {
      const statusIndicator = document.createElement('div');
      sync.bindUIElements({ statusIndicator });

      sync.setStatus('error');
      expect(statusIndicator.className).toBe('status-indicator error');
    });
  });

  // ===== Message Handling Edge Cases =====

  describe('Message Handling Edge Cases', () => {
    function sendChromeMessage(message: any): void {
      if (chromeMessageListenerRef.current) {
        chromeMessageListenerRef.current(message, {}, () => {});
      }
    }

    it('should handle STATUS_UPDATE with macroName', () => {
      sendChromeMessage({
        type: 'STATUS_UPDATE',
        payload: { status: 'playing', macroName: 'Login.iim' },
      });
      expect(sync.getState().currentMacro).toBe('Login.iim');
    });

    it('should handle STATUS_UPDATE with maxLoop', () => {
      sendChromeMessage({
        type: 'STATUS_UPDATE',
        payload: { maxLoop: 10 },
      });
      expect(sync.getState().maxLoop).toBe(10);
    });

    it('should handle MACRO_PROGRESS with alternative field names', () => {
      sendChromeMessage({
        type: 'MACRO_PROGRESS',
        payload: { line: 7, loop: 2, maxLoop: 5, command: 'TAG ...' },
      });
      expect(sync.getState().currentLine).toBe(7);
      expect(sync.getState().currentLoop).toBe(2);
      expect(sync.getState().maxLoop).toBe(5);
    });

    it('should log command during MACRO_PROGRESS', () => {
      sendChromeMessage({
        type: 'MACRO_PROGRESS',
        payload: { currentLine: 3, currentCommand: 'URL GOTO=example.com' },
      });
      const logs = sync.getLogs();
      expect(logs.length).toBeGreaterThan(0);
      const lastLog = logs[logs.length - 1];
      expect(lastLog.message).toBe('URL GOTO=example.com');
      expect(lastLog.line).toBe(3);
    });

    it('should use "Line N" when no command in MACRO_PROGRESS', () => {
      sendChromeMessage({
        type: 'MACRO_PROGRESS',
        payload: { currentLine: 4 },
      });
      const logs = sync.getLogs();
      const lastLog = logs[logs.length - 1];
      expect(lastLog.message).toBe('Line 4');
    });

    it('should handle MACRO_COMPLETE with default message', () => {
      sync.setStatus('playing');
      sendChromeMessage({
        type: 'MACRO_COMPLETE',
        payload: {},
      });
      expect(sync.getStatus()).toBe('idle');
      expect(sync.getState().statusMessage).toBe('Complete');
    });

    it('should log completion', () => {
      sendChromeMessage({
        type: 'MACRO_COMPLETE',
        payload: { message: 'Done' },
      });
      const logs = sync.getLogs();
      const infoLogs = logs.filter(l => l.type === 'info');
      expect(infoLogs.length).toBeGreaterThan(0);
      expect(infoLogs[infoLogs.length - 1].message).toBe('Macro completed successfully');
    });

    it('should handle MACRO_ERROR with alternative field names', () => {
      sendChromeMessage({
        type: 'MACRO_ERROR',
        payload: { error: 'Timeout', code: -802 },
      });
      expect(sync.getStatus()).toBe('error');
      expect(sync.getState().lastError?.message).toBe('Timeout');
      expect(sync.getState().lastError?.code).toBe(-802);
    });

    it('should handle MACRO_ERROR with message field', () => {
      sendChromeMessage({
        type: 'MACRO_ERROR',
        payload: { message: 'Page not found' },
      });
      expect(sync.getState().lastError?.message).toBe('Page not found');
    });

    it('should handle MACRO_ERROR with error details', () => {
      sendChromeMessage({
        type: 'MACRO_ERROR',
        payload: {
          errorMessage: 'Element error',
          command: 'TAG POS=1',
          details: 'CSS selector failed',
        },
      });
      expect(sync.getState().lastError?.command).toBe('TAG POS=1');
      expect(sync.getState().lastError?.details).toBe('CSS selector failed');
    });

    it('should log error with line info', () => {
      sendChromeMessage({
        type: 'MACRO_ERROR',
        payload: { errorMessage: 'Not found', errorLine: 7 },
      });
      const logs = sync.getLogs();
      const errorLogs = logs.filter(l => l.type === 'error');
      expect(errorLogs.length).toBeGreaterThan(0);
      expect(errorLogs[errorLogs.length - 1].message).toContain('at line 7');
    });

    it('should handle MACRO_RESUMED with current macro name', () => {
      sync.setMacro('Test.iim');
      sync.setStatus('paused');
      sendChromeMessage({ type: 'MACRO_RESUMED' });
      expect(sync.getState().statusMessage).toContain('Test.iim');
    });

    it('should handle RECORDING_LINE with missing fields', () => {
      sendChromeMessage({
        type: 'RECORDING_LINE',
        payload: {},
      });
      expect(sync.getState().currentLine).toBe(0);
    });

    it('should handle RECORDING_SAVED clearing startTime', () => {
      sync.setStatus('recording');
      expect(sync.getState().startTime).not.toBeNull();

      sendChromeMessage({ type: 'RECORDING_SAVED' });
      expect(sync.getState().startTime).toBeNull();
      expect(sync.getState().currentLine).toBe(0);
    });

    it('should emit both complete and status_change on RECORDING_SAVED', () => {
      const listener = vi.fn();
      sync.addListener(listener);

      sendChromeMessage({ type: 'RECORDING_SAVED' });

      const eventTypes = listener.mock.calls.map((c: any) => c[0].type);
      expect(eventTypes).toContain('complete');
      expect(eventTypes).toContain('status_change');
    });

    it('should handle unknown message type gracefully', () => {
      // Should not throw
      expect(() => {
        sendChromeMessage({ type: 'UNKNOWN_TYPE', payload: {} });
      }).not.toThrow();
    });

    it('should handle message without payload', () => {
      expect(() => {
        sendChromeMessage({ type: 'STATUS_UPDATE' });
      }).not.toThrow();
    });
  });

  // ===== Multiple Listeners =====

  describe('Multiple Listeners', () => {
    it('should notify all listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      sync.addListener(listener1);
      sync.addListener(listener2);
      sync.addListener(listener3);

      sync.setStatus('playing');

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
      expect(listener3).toHaveBeenCalled();
    });

    it('should handle removing one listener while others stay active', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      sync.addListener(listener1);
      const unsub2 = sync.addListener(listener2);

      unsub2();
      sync.setStatus('playing');

      expect(listener1).toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });
  });

  // ===== Loop Counter Display =====

  describe('Loop Counter Display', () => {
    it('should show current/max when maxLoop > 1', () => {
      const loopCounter = document.createElement('span');
      sync.bindUIElements({ loopCounter });

      sync.setProgress(1, 2, 5);
      expect(loopCounter.textContent).toBe('2/5');
    });

    it('should show single number when maxLoop is 1', () => {
      const loopCounter = document.createElement('span');
      sync.bindUIElements({ loopCounter });

      sync.setProgress(1, 1, 1);
      expect(loopCounter.textContent).toBe('1');
    });

    it('should show "1" when loop is 0 and maxLoop is 1', () => {
      const loopCounter = document.createElement('span');
      sync.bindUIElements({ loopCounter });

      sync.setProgress(1, 0, 1);
      // 0 || 1 = 1, so should show "1"
      expect(loopCounter.textContent).toBe('1');
    });
  });

  // ===== Elapsed Time Edge Cases =====

  describe('Elapsed Time Edge Cases', () => {
    it('should return null after reset', () => {
      sync.setStatus('playing');
      expect(sync.getElapsedTime()).not.toBeNull();

      sync.reset();
      expect(sync.getElapsedTime()).toBeNull();
    });

    it('should format 0 seconds as 00:00', () => {
      sync.setStatus('playing');
      const formatted = sync.getElapsedTimeString();
      expect(formatted).toMatch(/^00:0\d$/); // Should be very short time
    });
  });

  // ===== UI Binding with null elements =====

  describe('UI Binding with null elements', () => {
    it('should handle null UI elements gracefully', () => {
      sync.bindUIElements({
        statusIndicator: null,
        statusText: null,
        lineCounter: null,
        loopCounter: null,
        progressBar: null,
        errorDisplay: null,
      });

      // Should not throw
      expect(() => sync.setStatus('playing')).not.toThrow();
      expect(() => sync.setProgress(5)).not.toThrow();
      expect(() => sync.setError({ message: 'fail' })).not.toThrow();
    });

    it('should handle partial UI bindings', () => {
      const statusText = document.createElement('span');
      sync.bindUIElements({ statusText });

      // Only statusText is bound, others should be null
      expect(() => sync.setStatus('playing', 'Test')).not.toThrow();
      expect(statusText.textContent).toBe('Test');
    });
  });
});
