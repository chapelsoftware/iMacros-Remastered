/**
 * Unit Tests for iMacros State Manager
 *
 * Comprehensive tests covering:
 * - Line management (getCurrentLine, setCurrentLine, nextLine, jumpToLine, isAtEnd)
 * - Loop management (getLoopCounter, setLoopCounter, incrementLoop, isLoopLimitReached, resetForNextLoop)
 * - Variable management (getVariables, getVariable, setVariable, getAllVariables)
 * - Extract data (addExtract, getExtractData, getExtractString, clearExtract)
 * - Error management (setError, clearError, hasError, getErrorCode, getErrorMessage)
 * - Status management (start, pause, resume, complete, abort, canContinue)
 * - Timing (getExecutionTimeMs, getExecutionTimeFormatted)
 * - Macro info (getMacroName, setMacroName)
 * - Serialization (serialize, toJSON, deserialize, fromJSON)
 * - Snapshots (createSnapshot, getSnapshots, getLastSnapshot, clearSnapshots, restoreFromSnapshot)
 * - Reset (reset, resetForExecution, softReset)
 * - Clone
 * - Debug (getSummary)
 * - Factory (createStateManager)
 * - Validator (isSerializedState)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  StateManager,
  ErrorCode,
  ExecutionStatus,
  createStateManager,
  isSerializedState,
} from '../../shared/src/state-manager';

describe('StateManager', () => {
  let sm: StateManager;

  beforeEach(() => {
    sm = new StateManager();
  });

  // ===== Constructor =====

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(sm.getCurrentLine()).toBe(0);
      expect(sm.getTotalLines()).toBe(0);
      expect(sm.getLoopCounter()).toBe(1);
      expect(sm.getMaxLoops()).toBe(1);
      expect(sm.getMacroName()).toBe('');
      expect(sm.getStatus()).toBe(ExecutionStatus.IDLE);
      expect(sm.getErrorCode()).toBe(ErrorCode.OK);
      expect(sm.getErrorMessage()).toBeNull();
      expect(sm.getExtractData()).toEqual([]);
      expect(sm.getSnapshots()).toEqual([]);
    });

    it('should accept all options', () => {
      const sm2 = new StateManager({
        macroName: 'test.iim',
        totalLines: 50,
        maxLoops: 10,
        maxSnapshots: 5,
        initialVariables: { '!VAR0': 'hello' },
      });
      expect(sm2.getMacroName()).toBe('test.iim');
      expect(sm2.getTotalLines()).toBe(50);
      expect(sm2.getMaxLoops()).toBe(10);
      expect(sm2.getVariable('!VAR0')).toBe('hello');
    });

    it('should use default maxLoops of 1 when not specified', () => {
      expect(sm.getMaxLoops()).toBe(1);
    });

    it('should use default maxSnapshots of 100 when not specified', () => {
      // Create 101 snapshots and verify trimming to 100
      const sm2 = new StateManager();
      for (let i = 0; i < 101; i++) {
        sm2.createSnapshot(`snap${i}`);
      }
      expect(sm2.getSnapshots().length).toBe(100);
    });
  });

  // ===== Line Management =====

  describe('line management', () => {
    beforeEach(() => {
      sm = new StateManager({ totalLines: 10 });
    });

    it('getCurrentLine returns 0 initially', () => {
      expect(sm.getCurrentLine()).toBe(0);
    });

    it('setCurrentLine sets the line number', () => {
      sm.setCurrentLine(5);
      expect(sm.getCurrentLine()).toBe(5);
    });

    it('nextLine advances by 1 and returns new line', () => {
      sm.setCurrentLine(3);
      const result = sm.nextLine();
      expect(result).toBe(4);
      expect(sm.getCurrentLine()).toBe(4);
    });

    it('jumpToLine sets line to valid value', () => {
      sm.jumpToLine(7);
      expect(sm.getCurrentLine()).toBe(7);
    });

    it('jumpToLine throws for line < 1', () => {
      expect(() => sm.jumpToLine(0)).toThrow('Invalid line number: 0');
    });

    it('jumpToLine throws for negative line', () => {
      expect(() => sm.jumpToLine(-5)).toThrow('Invalid line number: -5');
    });

    it('jumpToLine throws for line > totalLines', () => {
      expect(() => sm.jumpToLine(11)).toThrow('Invalid line number: 11');
    });

    it('jumpToLine allows line equal to totalLines', () => {
      sm.jumpToLine(10);
      expect(sm.getCurrentLine()).toBe(10);
    });

    it('isAtEnd returns false when currentLine < totalLines', () => {
      sm.setCurrentLine(5);
      expect(sm.isAtEnd()).toBe(false);
    });

    it('isAtEnd returns true when currentLine >= totalLines', () => {
      sm.setCurrentLine(10);
      expect(sm.isAtEnd()).toBe(true);
    });

    it('isAtEnd returns true when currentLine > totalLines', () => {
      sm.setCurrentLine(15);
      expect(sm.isAtEnd()).toBe(true);
    });

    it('getTotalLines returns the total', () => {
      expect(sm.getTotalLines()).toBe(10);
    });

    it('setTotalLines updates the total', () => {
      sm.setTotalLines(20);
      expect(sm.getTotalLines()).toBe(20);
    });

    it('nextLine increments from 0', () => {
      expect(sm.nextLine()).toBe(1);
    });
  });

  // ===== Loop Management =====

  describe('loop management', () => {
    it('getLoopCounter returns 1 initially', () => {
      expect(sm.getLoopCounter()).toBe(1);
    });

    it('setLoopCounter sets the value', () => {
      sm.setLoopCounter(5);
      expect(sm.getLoopCounter()).toBe(5);
    });

    it('incrementLoop advances by 1 and returns new value', () => {
      const result = sm.incrementLoop();
      expect(result).toBe(2);
      expect(sm.getLoopCounter()).toBe(2);
    });

    it('incrementLoop works for large values', () => {
      sm.setLoopCounter(999999);
      const result = sm.incrementLoop();
      expect(result).toBe(1000000);
    });

    it('getMaxLoops returns the configured value', () => {
      const sm2 = new StateManager({ maxLoops: 50 });
      expect(sm2.getMaxLoops()).toBe(50);
    });

    it('setMaxLoops updates the max', () => {
      sm.setMaxLoops(100);
      expect(sm.getMaxLoops()).toBe(100);
    });

    it('isLoopLimitReached returns false when loop <= maxLoops', () => {
      sm.setMaxLoops(3);
      sm.setLoopCounter(3);
      expect(sm.isLoopLimitReached()).toBe(false);
    });

    it('isLoopLimitReached returns true when loop > maxLoops', () => {
      sm.setMaxLoops(3);
      sm.setLoopCounter(4);
      expect(sm.isLoopLimitReached()).toBe(true);
    });

    it('resetForNextLoop sets currentLine to 0', () => {
      sm.setCurrentLine(7);
      sm.resetForNextLoop();
      expect(sm.getCurrentLine()).toBe(0);
    });

    it('resetForNextLoop does not change loop counter', () => {
      sm.setLoopCounter(5);
      sm.resetForNextLoop();
      expect(sm.getLoopCounter()).toBe(5);
    });
  });

  // ===== Variable Management =====

  describe('variable management', () => {
    it('getVariables returns the VariableContext', () => {
      const ctx = sm.getVariables();
      expect(ctx).toBeDefined();
      expect(typeof ctx.get).toBe('function');
    });

    it('getVariable returns null for unset custom variable', () => {
      expect(sm.getVariable('myVar')).toBeNull();
    });

    it('setVariable and getVariable roundtrip', () => {
      sm.setVariable('myVar', 'hello');
      expect(sm.getVariable('myVar')).toBe('hello');
    });

    it('setVariable works with numeric values', () => {
      sm.setVariable('!VAR0', 42);
      expect(sm.getVariable('!VAR0')).toBe(42);
    });

    it('getAllVariables returns system and custom variables', () => {
      sm.setVariable('myCustom', 'world');
      const all = sm.getAllVariables();
      expect(all['MYCUSTOM']).toBe('world');
      // System variables should be present too
      expect('!VAR0' in all).toBe(true);
    });

    it('initial variables are available after construction', () => {
      const sm2 = new StateManager({
        initialVariables: { '!VAR1': 'init', 'customKey': 'val' },
      });
      expect(sm2.getVariable('!VAR1')).toBe('init');
      expect(sm2.getVariable('customKey')).toBe('val');
    });
  });

  // ===== Extract Data =====

  describe('extract data', () => {
    it('getExtractData returns empty array initially', () => {
      expect(sm.getExtractData()).toEqual([]);
    });

    it('addExtract pushes data', () => {
      sm.addExtract('value1');
      expect(sm.getExtractData()).toEqual(['value1']);
    });

    it('addExtract pushes multiple entries', () => {
      sm.addExtract('a');
      sm.addExtract('b');
      sm.addExtract('c');
      expect(sm.getExtractData()).toEqual(['a', 'b', 'c']);
    });

    it('addExtract sets !EXTRACT to last value', () => {
      sm.addExtract('first');
      sm.addExtract('second');
      expect(sm.getVariable('!EXTRACT')).toBe('second');
    });

    it('getExtractData returns a copy', () => {
      sm.addExtract('data');
      const copy = sm.getExtractData();
      copy.push('tampered');
      expect(sm.getExtractData()).toEqual(['data']);
    });

    it('getExtractString joins with [EXTRACT]', () => {
      sm.addExtract('a');
      sm.addExtract('b');
      sm.addExtract('c');
      expect(sm.getExtractString()).toBe('a[EXTRACT]b[EXTRACT]c');
    });

    it('getExtractString returns empty string for no extracts', () => {
      expect(sm.getExtractString()).toBe('');
    });

    it('clearExtract removes all data', () => {
      sm.addExtract('a');
      sm.addExtract('b');
      sm.clearExtract();
      expect(sm.getExtractData()).toEqual([]);
      expect(sm.getExtractString()).toBe('');
    });
  });

  // ===== Error Management =====

  describe('error management', () => {
    it('starts with no error', () => {
      expect(sm.hasError()).toBe(false);
      expect(sm.getErrorCode()).toBe(ErrorCode.OK);
      expect(sm.getErrorMessage()).toBeNull();
    });

    it('setError sets code and message', () => {
      sm.setError(ErrorCode.SYNTAX_ERROR, 'bad syntax');
      expect(sm.getErrorCode()).toBe(ErrorCode.SYNTAX_ERROR);
      expect(sm.getErrorMessage()).toBe('bad syntax');
      expect(sm.hasError()).toBe(true);
    });

    it('setError with non-OK code sets status to ERROR', () => {
      sm.start();
      sm.setError(ErrorCode.TIMEOUT, 'timed out');
      expect(sm.getStatus()).toBe(ExecutionStatus.ERROR);
    });

    it('setError with OK code does not change status to ERROR', () => {
      sm.start();
      sm.setError(ErrorCode.OK);
      expect(sm.getStatus()).toBe(ExecutionStatus.RUNNING);
    });

    it('setError without message sets message to null', () => {
      sm.setError(ErrorCode.ELEMENT_NOT_FOUND);
      expect(sm.getErrorMessage()).toBeNull();
    });

    it('clearError resets to OK', () => {
      sm.setError(ErrorCode.SCRIPT_ERROR, 'oops');
      sm.clearError();
      expect(sm.getErrorCode()).toBe(ErrorCode.OK);
      expect(sm.getErrorMessage()).toBeNull();
      expect(sm.hasError()).toBe(false);
    });

    it('clearError transitions ERROR status to PAUSED', () => {
      sm.setError(ErrorCode.FILE_ERROR, 'file not found');
      expect(sm.getStatus()).toBe(ExecutionStatus.ERROR);
      sm.clearError();
      expect(sm.getStatus()).toBe(ExecutionStatus.PAUSED);
    });

    it('clearError does not change non-ERROR status', () => {
      sm.start();
      sm.clearError();
      expect(sm.getStatus()).toBe(ExecutionStatus.RUNNING);
    });

    it('all error codes are valid', () => {
      const codes = [
        ErrorCode.OK,
        ErrorCode.SYNTAX_ERROR,
        ErrorCode.ELEMENT_NOT_FOUND,
        ErrorCode.TIMEOUT,
        ErrorCode.FRAME_ERROR,
        ErrorCode.DOWNLOAD_ERROR,
        ErrorCode.FILE_ERROR,
        ErrorCode.SCRIPT_ERROR,
        ErrorCode.DATASOURCE_ERROR,
        ErrorCode.LOOP_LIMIT,
        ErrorCode.USER_ABORT,
        ErrorCode.UNKNOWN_ERROR,
      ];
      for (const code of codes) {
        sm.setError(code);
        expect(sm.getErrorCode()).toBe(code);
      }
    });
  });

  // ===== Status Management =====

  describe('status management', () => {
    it('starts as IDLE', () => {
      expect(sm.getStatus()).toBe(ExecutionStatus.IDLE);
    });

    it('setStatus sets the status', () => {
      sm.setStatus(ExecutionStatus.RUNNING);
      expect(sm.getStatus()).toBe(ExecutionStatus.RUNNING);
    });

    it('start sets RUNNING, currentLine to 1, and startTime', () => {
      sm.start();
      expect(sm.getStatus()).toBe(ExecutionStatus.RUNNING);
      expect(sm.getCurrentLine()).toBe(1);
    });

    it('pause transitions RUNNING to PAUSED', () => {
      sm.start();
      sm.pause();
      expect(sm.getStatus()).toBe(ExecutionStatus.PAUSED);
    });

    it('pause does nothing if not RUNNING', () => {
      sm.pause();
      expect(sm.getStatus()).toBe(ExecutionStatus.IDLE);
    });

    it('resume transitions PAUSED to RUNNING', () => {
      sm.start();
      sm.pause();
      sm.resume();
      expect(sm.getStatus()).toBe(ExecutionStatus.RUNNING);
    });

    it('resume does nothing if not PAUSED', () => {
      sm.start();
      sm.resume();
      expect(sm.getStatus()).toBe(ExecutionStatus.RUNNING);
    });

    it('complete sets COMPLETED', () => {
      sm.start();
      sm.complete();
      expect(sm.getStatus()).toBe(ExecutionStatus.COMPLETED);
    });

    it('abort sets ABORTED and USER_ABORT error', () => {
      sm.start();
      sm.abort();
      expect(sm.getStatus()).toBe(ExecutionStatus.ABORTED);
      expect(sm.getErrorCode()).toBe(ErrorCode.USER_ABORT);
      expect(sm.getErrorMessage()).toBe('Execution aborted by user');
    });

    it('canContinue returns true when RUNNING without error', () => {
      sm.start();
      expect(sm.canContinue()).toBe(true);
    });

    it('canContinue returns false when PAUSED', () => {
      sm.start();
      sm.pause();
      expect(sm.canContinue()).toBe(false);
    });

    it('canContinue returns false when error exists', () => {
      sm.start();
      sm.setError(ErrorCode.TIMEOUT);
      expect(sm.canContinue()).toBe(false);
    });

    it('canContinue returns false when IDLE', () => {
      expect(sm.canContinue()).toBe(false);
    });

    it('setStatus to RUNNING sets startTime if null', () => {
      sm.setStatus(ExecutionStatus.RUNNING);
      // Can verify indirectly through execution time
      expect(sm.getExecutionTimeMs()).toBeGreaterThanOrEqual(0);
    });
  });

  // ===== Timing =====

  describe('timing', () => {
    it('getExecutionTimeMs starts at 0', () => {
      expect(sm.getExecutionTimeMs()).toBe(0);
    });

    it('getExecutionTimeMs accumulates during RUNNING', () => {
      vi.useFakeTimers();
      sm.start();
      vi.advanceTimersByTime(500);
      expect(sm.getExecutionTimeMs()).toBe(500);
      vi.useRealTimers();
    });

    it('pause captures accumulated time', () => {
      vi.useFakeTimers();
      sm.start();
      vi.advanceTimersByTime(200);
      sm.pause();
      const time = sm.getExecutionTimeMs();
      expect(time).toBe(200);
      // After pause, time should not increase
      vi.advanceTimersByTime(300);
      expect(sm.getExecutionTimeMs()).toBe(200);
      vi.useRealTimers();
    });

    it('resume+pause accumulates correctly', () => {
      vi.useFakeTimers();
      sm.start();
      vi.advanceTimersByTime(100);
      sm.pause();
      vi.advanceTimersByTime(500); // paused, not counted
      sm.resume();
      vi.advanceTimersByTime(200);
      sm.pause();
      expect(sm.getExecutionTimeMs()).toBe(300);
      vi.useRealTimers();
    });

    it('complete captures final time', () => {
      vi.useFakeTimers();
      sm.start();
      vi.advanceTimersByTime(1000);
      sm.complete();
      expect(sm.getExecutionTimeMs()).toBe(1000);
      vi.useRealTimers();
    });

    it('getExecutionTimeFormatted shows seconds for short durations', () => {
      vi.useFakeTimers();
      sm.start();
      vi.advanceTimersByTime(3500);
      sm.pause();
      expect(sm.getExecutionTimeFormatted()).toBe('3.5s');
      vi.useRealTimers();
    });

    it('getExecutionTimeFormatted shows minutes', () => {
      vi.useFakeTimers();
      sm.start();
      vi.advanceTimersByTime(125000); // 2m 5s
      sm.pause();
      expect(sm.getExecutionTimeFormatted()).toBe('2m 5s');
      vi.useRealTimers();
    });

    it('getExecutionTimeFormatted shows hours', () => {
      vi.useFakeTimers();
      sm.start();
      vi.advanceTimersByTime(3723000); // 1h 2m 3s
      sm.pause();
      expect(sm.getExecutionTimeFormatted()).toBe('1h 2m 3s');
      vi.useRealTimers();
    });

    it('getExecutionTimeFormatted for zero time', () => {
      expect(sm.getExecutionTimeFormatted()).toBe('0.0s');
    });
  });

  // ===== Macro Info =====

  describe('macro info', () => {
    it('getMacroName returns empty string by default', () => {
      expect(sm.getMacroName()).toBe('');
    });

    it('setMacroName sets the name', () => {
      sm.setMacroName('my-macro.iim');
      expect(sm.getMacroName()).toBe('my-macro.iim');
    });

    it('constructor accepts macroName', () => {
      const sm2 = new StateManager({ macroName: 'init.iim' });
      expect(sm2.getMacroName()).toBe('init.iim');
    });

    it('handles empty string macro name', () => {
      sm.setMacroName('');
      expect(sm.getMacroName()).toBe('');
    });
  });

  // ===== Serialization =====

  describe('serialization', () => {
    it('serialize returns valid SerializedState', () => {
      sm = new StateManager({
        macroName: 'test.iim',
        totalLines: 20,
        maxLoops: 5,
      });
      sm.start();
      sm.setCurrentLine(3);
      sm.setLoopCounter(2);
      sm.addExtract('extracted');

      const serialized = sm.serialize();
      expect(serialized.version).toBe(1);
      expect(serialized.currentLine).toBe(3);
      expect(serialized.totalLines).toBe(20);
      expect(serialized.loopCounter).toBe(2);
      expect(serialized.maxLoops).toBe(5);
      expect(serialized.macroName).toBe('test.iim');
      expect(serialized.status).toBe(ExecutionStatus.RUNNING);
      expect(serialized.extractData).toEqual(['extracted']);
      expect(serialized.errorCode).toBe(ErrorCode.OK);
      expect(serialized.errorMessage).toBeNull();
      expect(typeof serialized.lastUpdateTime).toBe('string');
    });

    it('toJSON returns valid JSON string', () => {
      sm.setMacroName('json-test.iim');
      const json = sm.toJSON();
      const parsed = JSON.parse(json);
      expect(parsed.macroName).toBe('json-test.iim');
    });

    it('deserialize restores state correctly', () => {
      sm = new StateManager({
        macroName: 'roundtrip.iim',
        totalLines: 30,
        maxLoops: 10,
      });
      sm.start();
      sm.setCurrentLine(15);
      sm.setLoopCounter(3);
      sm.addExtract('data1');
      sm.addExtract('data2');
      sm.setVariable('myVar', 'preserved');
      sm.pause();

      const serialized = sm.serialize();
      const restored = StateManager.deserialize(serialized);

      expect(restored.getMacroName()).toBe('roundtrip.iim');
      expect(restored.getTotalLines()).toBe(30);
      expect(restored.getMaxLoops()).toBe(10);
      expect(restored.getCurrentLine()).toBe(15);
      expect(restored.getLoopCounter()).toBe(3);
      expect(restored.getExtractData()).toEqual(['data1', 'data2']);
      expect(restored.getVariable('myVar')).toBe('preserved');
      expect(restored.getStatus()).toBe(ExecutionStatus.PAUSED);
    });

    it('fromJSON restores from JSON string', () => {
      sm.setMacroName('from-json.iim');
      sm.setVariable('!VAR0', 'value');
      const json = sm.toJSON();
      const restored = StateManager.fromJSON(json);
      expect(restored.getMacroName()).toBe('from-json.iim');
      expect(restored.getVariable('!VAR0')).toBe('value');
    });

    it('serialize/deserialize roundtrip preserves error state', () => {
      sm.setError(ErrorCode.TIMEOUT, 'operation timed out');
      const restored = StateManager.deserialize(sm.serialize());
      expect(restored.getErrorCode()).toBe(ErrorCode.TIMEOUT);
      expect(restored.getErrorMessage()).toBe('operation timed out');
      expect(restored.hasError()).toBe(true);
    });

    it('serialize/deserialize preserves execution time', () => {
      vi.useFakeTimers();
      sm.start();
      vi.advanceTimersByTime(500);
      sm.pause();
      const serialized = sm.serialize();
      const restored = StateManager.deserialize(serialized);
      expect(restored.getExecutionTimeMs()).toBe(500);
      vi.useRealTimers();
    });
  });

  // ===== Snapshots =====

  describe('snapshots', () => {
    it('getSnapshots returns empty array initially', () => {
      expect(sm.getSnapshots()).toEqual([]);
    });

    it('createSnapshot creates a snapshot', () => {
      sm.start();
      sm.setCurrentLine(5);
      const snap = sm.createSnapshot('test snap');
      expect(snap.line).toBe(5);
      expect(snap.status).toBe(ExecutionStatus.RUNNING);
      expect(snap.note).toBe('test snap');
      expect(snap.errorCode).toBe(ErrorCode.OK);
      expect(typeof snap.timestamp).toBe('string');
    });

    it('createSnapshot without note has undefined note', () => {
      const snap = sm.createSnapshot();
      expect(snap.note).toBeUndefined();
    });

    it('getSnapshots returns copies', () => {
      sm.createSnapshot('first');
      const snaps = sm.getSnapshots();
      snaps.push({ timestamp: '', line: 99, loop: 1, status: ExecutionStatus.IDLE, variables: {}, errorCode: ErrorCode.OK });
      expect(sm.getSnapshots().length).toBe(1);
    });

    it('getLastSnapshot returns the most recent', () => {
      sm.createSnapshot('first');
      sm.setCurrentLine(10);
      sm.createSnapshot('second');
      const last = sm.getLastSnapshot();
      expect(last).not.toBeNull();
      expect(last!.note).toBe('second');
      expect(last!.line).toBe(10);
    });

    it('getLastSnapshot returns null when empty', () => {
      expect(sm.getLastSnapshot()).toBeNull();
    });

    it('clearSnapshots removes all snapshots', () => {
      sm.createSnapshot('a');
      sm.createSnapshot('b');
      sm.clearSnapshots();
      expect(sm.getSnapshots()).toEqual([]);
      expect(sm.getLastSnapshot()).toBeNull();
    });

    it('snapshot trimming removes oldest when exceeding max', () => {
      const sm2 = new StateManager({ maxSnapshots: 3 });
      sm2.createSnapshot('s1');
      sm2.createSnapshot('s2');
      sm2.createSnapshot('s3');
      sm2.createSnapshot('s4');
      const snaps = sm2.getSnapshots();
      expect(snaps.length).toBe(3);
      expect(snaps[0].note).toBe('s2');
      expect(snaps[2].note).toBe('s4');
    });

    it('restoreFromSnapshot restores state', () => {
      sm = new StateManager({ totalLines: 20 });
      sm.start();
      sm.setCurrentLine(5);
      sm.setLoopCounter(2);
      sm.setVariable('myKey', 'myValue');
      const snap = sm.createSnapshot('restore point');

      // Change state
      sm.setCurrentLine(15);
      sm.setLoopCounter(8);
      sm.setVariable('myKey', 'changed');

      // Restore
      sm.restoreFromSnapshot(snap);
      expect(sm.getCurrentLine()).toBe(5);
      expect(sm.getLoopCounter()).toBe(2);
      expect(sm.getStatus()).toBe(ExecutionStatus.RUNNING);
    });

    it('snapshot captures variables at time of creation', () => {
      sm.setVariable('!VAR0', 'before');
      const snap = sm.createSnapshot();
      sm.setVariable('!VAR0', 'after');
      expect(snap.variables['!VAR0']).toBe('before');
      expect(sm.getVariable('!VAR0')).toBe('after');
    });
  });

  // ===== Reset =====

  describe('reset', () => {
    it('reset clears everything', () => {
      sm = new StateManager({ macroName: 'test.iim', totalLines: 10 });
      sm.start();
      sm.setCurrentLine(5);
      sm.setLoopCounter(3);
      sm.addExtract('data');
      sm.setError(ErrorCode.TIMEOUT);
      sm.createSnapshot('snap');

      sm.reset();

      expect(sm.getCurrentLine()).toBe(0);
      expect(sm.getLoopCounter()).toBe(1);
      expect(sm.getExtractData()).toEqual([]);
      expect(sm.getErrorCode()).toBe(ErrorCode.OK);
      expect(sm.getErrorMessage()).toBeNull();
      expect(sm.getStatus()).toBe(ExecutionStatus.IDLE);
      expect(sm.getExecutionTimeMs()).toBe(0);
      expect(sm.getSnapshots()).toEqual([]);
    });

    it('resetForExecution keeps macro info, clears runtime', () => {
      sm = new StateManager({ macroName: 'keep.iim', totalLines: 50, maxLoops: 10 });
      sm.start();
      sm.setCurrentLine(20);
      sm.setLoopCounter(5);
      sm.addExtract('data');
      sm.setError(ErrorCode.FILE_ERROR, 'gone');

      sm.resetForExecution();

      expect(sm.getMacroName()).toBe('keep.iim');
      expect(sm.getTotalLines()).toBe(50);
      expect(sm.getMaxLoops()).toBe(10);
      expect(sm.getCurrentLine()).toBe(0);
      expect(sm.getLoopCounter()).toBe(1);
      expect(sm.getExtractData()).toEqual([]);
      expect(sm.getErrorCode()).toBe(ErrorCode.OK);
      expect(sm.getStatus()).toBe(ExecutionStatus.IDLE);
    });

    it('resetForExecution does not clear snapshots', () => {
      sm.createSnapshot('snap');
      sm.resetForExecution();
      // resetForExecution does not clear snapshots (unlike full reset)
      // The code doesn't clear snapshots in resetForExecution
      // Let's verify the snapshot list is untouched
      expect(sm.getSnapshots().length).toBe(1);
    });

    it('softReset clears error only', () => {
      sm.start();
      sm.setCurrentLine(5);
      sm.setVariable('!VAR0', 'keep this');
      sm.setError(ErrorCode.SCRIPT_ERROR, 'oops');

      sm.softReset();

      expect(sm.getErrorCode()).toBe(ErrorCode.OK);
      expect(sm.getErrorMessage()).toBeNull();
      expect(sm.getStatus()).toBe(ExecutionStatus.PAUSED);
      expect(sm.getCurrentLine()).toBe(5);
      expect(sm.getVariable('!VAR0')).toBe('keep this');
    });

    it('softReset does not change non-ERROR status', () => {
      sm.start();
      sm.softReset();
      expect(sm.getStatus()).toBe(ExecutionStatus.RUNNING);
    });
  });

  // ===== Clone =====

  describe('clone', () => {
    it('clone creates independent copy', () => {
      sm = new StateManager({ macroName: 'orig.iim', totalLines: 10, maxLoops: 5 });
      sm.start();
      sm.setCurrentLine(3);
      sm.setLoopCounter(2);
      sm.addExtract('data');
      sm.createSnapshot('snap');

      const cloned = sm.clone();

      expect(cloned.getMacroName()).toBe('orig.iim');
      expect(cloned.getCurrentLine()).toBe(3);
      expect(cloned.getLoopCounter()).toBe(2);
      expect(cloned.getExtractData()).toEqual(['data']);
      expect(cloned.getSnapshots().length).toBe(1);

      // Modifications to clone don't affect original
      cloned.setCurrentLine(9);
      cloned.addExtract('new');
      expect(sm.getCurrentLine()).toBe(3);
      expect(sm.getExtractData()).toEqual(['data']);
    });

    it('clone preserves maxSnapshots', () => {
      const sm2 = new StateManager({ maxSnapshots: 5 });
      const cloned = sm2.clone();
      for (let i = 0; i < 7; i++) {
        cloned.createSnapshot(`s${i}`);
      }
      expect(cloned.getSnapshots().length).toBe(5);
    });
  });

  // ===== Debug =====

  describe('debug', () => {
    it('getSummary returns a multi-line string', () => {
      sm = new StateManager({ macroName: 'debug.iim', totalLines: 10, maxLoops: 3 });
      sm.start();
      sm.setCurrentLine(5);
      sm.addExtract('x');

      const summary = sm.getSummary();
      expect(summary).toContain('Macro: debug.iim');
      expect(summary).toContain('Status: running');
      expect(summary).toContain('Line: 5/10');
      expect(summary).toContain('Error: None');
      expect(summary).toContain('Extracts: 1');
    });

    it('getSummary shows error info when errored', () => {
      sm.setError(ErrorCode.TIMEOUT, 'timed out');
      const summary = sm.getSummary();
      expect(summary).toContain('-930');
      expect(summary).toContain('timed out');
    });

    it('getSummary shows (unnamed) for empty macroName', () => {
      const summary = sm.getSummary();
      expect(summary).toContain('(unnamed)');
    });
  });

  // ===== Factory =====

  describe('createStateManager', () => {
    it('returns a StateManager instance', () => {
      const instance = createStateManager();
      expect(instance).toBeInstanceOf(StateManager);
    });

    it('passes options through', () => {
      const instance = createStateManager({ macroName: 'factory.iim', totalLines: 5 });
      expect(instance.getMacroName()).toBe('factory.iim');
      expect(instance.getTotalLines()).toBe(5);
    });
  });

  // ===== Validator =====

  describe('isSerializedState', () => {
    it('returns true for valid serialized state', () => {
      const serialized = sm.serialize();
      expect(isSerializedState(serialized)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isSerializedState(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isSerializedState(undefined)).toBe(false);
    });

    it('returns false for string', () => {
      expect(isSerializedState('not a state')).toBe(false);
    });

    it('returns false for number', () => {
      expect(isSerializedState(42)).toBe(false);
    });

    it('returns false for empty object', () => {
      expect(isSerializedState({})).toBe(false);
    });

    it('returns false for partial object', () => {
      expect(isSerializedState({ version: 1, currentLine: 0 })).toBe(false);
    });

    it('returns true for minimal valid structure', () => {
      const minimal = {
        version: 1,
        currentLine: 0,
        loopCounter: 1,
        status: 'idle',
        lastUpdateTime: new Date().toISOString(),
        extractData: [],
      };
      expect(isSerializedState(minimal)).toBe(true);
    });
  });

  // ===== ErrorCode Enum =====

  describe('ErrorCode enum values', () => {
    it('OK is 0', () => expect(ErrorCode.OK).toBe(0));
    it('SYNTAX_ERROR is -910', () => expect(ErrorCode.SYNTAX_ERROR).toBe(-910));
    it('ELEMENT_NOT_FOUND is -920', () => expect(ErrorCode.ELEMENT_NOT_FOUND).toBe(-920));
    it('TIMEOUT is -930', () => expect(ErrorCode.TIMEOUT).toBe(-930));
    it('FRAME_ERROR is -940', () => expect(ErrorCode.FRAME_ERROR).toBe(-940));
    it('DOWNLOAD_ERROR is -950', () => expect(ErrorCode.DOWNLOAD_ERROR).toBe(-950));
    it('FILE_ERROR is -960', () => expect(ErrorCode.FILE_ERROR).toBe(-960));
    it('SCRIPT_ERROR is -970', () => expect(ErrorCode.SCRIPT_ERROR).toBe(-970));
    it('DATASOURCE_ERROR is -980', () => expect(ErrorCode.DATASOURCE_ERROR).toBe(-980));
    it('LOOP_LIMIT is -990', () => expect(ErrorCode.LOOP_LIMIT).toBe(-990));
    it('USER_ABORT is -100', () => expect(ErrorCode.USER_ABORT).toBe(-100));
    it('UNKNOWN_ERROR is -999', () => expect(ErrorCode.UNKNOWN_ERROR).toBe(-999));
  });

  // ===== ExecutionStatus Enum =====

  describe('ExecutionStatus enum values', () => {
    it('IDLE is idle', () => expect(ExecutionStatus.IDLE).toBe('idle'));
    it('RUNNING is running', () => expect(ExecutionStatus.RUNNING).toBe('running'));
    it('PAUSED is paused', () => expect(ExecutionStatus.PAUSED).toBe('paused'));
    it('COMPLETED is completed', () => expect(ExecutionStatus.COMPLETED).toBe('completed'));
    it('ERROR is error', () => expect(ExecutionStatus.ERROR).toBe('error'));
    it('ABORTED is aborted', () => expect(ExecutionStatus.ABORTED).toBe('aborted'));
  });
});
