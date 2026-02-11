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
});
