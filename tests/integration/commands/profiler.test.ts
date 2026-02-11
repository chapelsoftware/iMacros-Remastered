/**
 * Integration tests for SET !FILE_PROFILER - per-command timing CSV output
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createExecutor } from '../../../shared/src/executor';
import { registerSystemHandlers } from '../../../shared/src/commands/system';

describe('SET !FILE_PROFILER integration tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should write profiler CSV when !FILE_PROFILER is set to a filename', async () => {
    let writtenPath = '';
    let writtenContent = '';

    const executor = createExecutor({
      macroName: 'ProfileTest.iim',
      onFileAppend: (path, content) => {
        writtenPath = path;
        writtenContent = content;
      },
    });
    registerSystemHandlers(executor.registerHandler.bind(executor));

    executor.loadMacro([
      'SET !FILE_PROFILER /tmp/profiler.csv',
      'SET !VAR1 hello',
      'SET !VAR2 world',
      'WAIT SECONDS=1',
    ].join('\n'));

    const resultPromise = executor.execute();
    await vi.advanceTimersByTimeAsync(2000);
    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(writtenPath).toBe('/tmp/profiler.csv');

    // Should have header line with macro name
    expect(writtenContent).toContain('Macro: ProfileTest.iim');
    expect(writtenContent).toContain('Status: OK (0)');

    // Should have column header
    expect(writtenContent).toContain('Line,Command,Duration_ms,Timestamp');

    // SET !FILE_PROFILER itself is not profiled (value is empty when it runs)
    // Lines 2-4 are profiled (3 commands)
    const lines = writtenContent.trim().split('\n');
    // Header + column header + 3 data rows = 5 lines
    expect(lines.length).toBe(5);

    // First data row should be line 2 (SET !VAR1)
    expect(lines[2]).toMatch(/^2,SET/);
    // Second data row should be line 3 (SET !VAR2)
    expect(lines[3]).toMatch(/^3,SET/);
    // Third data row should be line 4 (WAIT)
    expect(lines[4]).toMatch(/^4,WAIT/);
  });

  it('should include correct per-command data in profiler records', async () => {
    const executor = createExecutor({
      macroName: 'ProfileTest.iim',
      onFileAppend: () => {},
    });
    registerSystemHandlers(executor.registerHandler.bind(executor));

    executor.loadMacro([
      'SET !FILE_PROFILER /tmp/profiler.csv',
      'SET !VAR1 hello',
      'WAIT SECONDS=1',
    ].join('\n'));

    const resultPromise = executor.execute();
    await vi.advanceTimersByTimeAsync(2000);
    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.profilerRecords).toBeDefined();
    // SET !FILE_PROFILER itself is not profiled (value is empty when it executes)
    // SET !VAR1 and WAIT are profiled = 2 records
    expect(result.profilerRecords!.length).toBe(2);

    const [setRecord, waitRecord] = result.profilerRecords!;

    expect(setRecord.line).toBe(2);
    expect(setRecord.command).toBe('SET');
    expect(setRecord.rawCommand).toContain('SET !VAR1 hello');
    expect(setRecord.durationMs).toBeGreaterThanOrEqual(0);

    expect(waitRecord.line).toBe(3);
    expect(waitRecord.command).toBe('WAIT');
    expect(waitRecord.rawCommand).toContain('WAIT SECONDS=1');
    // WAIT 1 second should take ~1000ms with fake timers
    expect(waitRecord.durationMs).toBeGreaterThanOrEqual(900);
  });

  it('should not write profiler CSV when !FILE_PROFILER is NO', async () => {
    let written = false;

    const executor = createExecutor({
      macroName: 'Test.iim',
      onFileAppend: () => {
        written = true;
      },
    });
    registerSystemHandlers(executor.registerHandler.bind(executor));

    executor.loadMacro([
      'SET !FILE_PROFILER NO',
      'SET !VAR1 hello',
    ].join('\n'));

    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.profilerRecords).toBeUndefined();
    expect(written).toBe(false);
  });

  it('should not write profiler CSV when !FILE_PROFILER is empty (default)', async () => {
    let written = false;

    const executor = createExecutor({
      macroName: 'Test.iim',
      onFileAppend: () => {
        written = true;
      },
    });
    registerSystemHandlers(executor.registerHandler.bind(executor));

    executor.loadMacro([
      'SET !VAR1 hello',
      'SET !VAR2 world',
    ].join('\n'));

    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.profilerRecords).toBeUndefined();
    expect(written).toBe(false);
  });

  it('should stop profiling when !FILE_PROFILER is set to NO mid-macro', async () => {
    const executor = createExecutor({
      macroName: 'Test.iim',
      onFileAppend: () => {},
    });
    registerSystemHandlers(executor.registerHandler.bind(executor));

    executor.loadMacro([
      'SET !FILE_PROFILER /tmp/profiler.csv',
      'SET !VAR1 hello',
      'SET !FILE_PROFILER NO',
      'SET !VAR2 world',
    ].join('\n'));

    const result = await executor.execute();

    expect(result.success).toBe(true);
    // Only SET !VAR1 should be profiled (line 2)
    // SET !FILE_PROFILER NO (line 3) is still profiled because the check happens
    // before execution, and at that point the value is still the filename
    // SET !VAR2 (line 4) should NOT be profiled because !FILE_PROFILER is now NO
    expect(result.profilerRecords).toBeDefined();
    expect(result.profilerRecords!.length).toBe(2);
    expect(result.profilerRecords![0].line).toBe(2);
    expect(result.profilerRecords![1].line).toBe(3);
  });

  it('should write profiler CSV even on macro error', async () => {
    let writtenPath = '';
    let writtenContent = '';

    const executor = createExecutor({
      macroName: 'ErrorTest.iim',
      onFileAppend: (path, content) => {
        writtenPath = path;
        writtenContent = content;
      },
    });
    registerSystemHandlers(executor.registerHandler.bind(executor));

    // TAG command is unregistered so will use default handler (success)
    // Use an invalid SET to trigger an error
    executor.loadMacro([
      'SET !FILE_PROFILER /tmp/profiler.csv',
      'SET !VAR1 hello',
      'SET !REPLAYSPEED INVALID',
    ].join('\n'));

    const result = await executor.execute();

    // The invalid REPLAYSPEED should cause an error
    expect(result.success).toBe(false);
    expect(writtenPath).toBe('/tmp/profiler.csv');
    expect(writtenContent).toContain('Macro: ErrorTest.iim');
    // Should still have profiler records for the commands that ran
    expect(result.profilerRecords).toBeDefined();
    expect(result.profilerRecords!.length).toBeGreaterThanOrEqual(1);
  });

  it('should not write profiler CSV without onFileAppend callback', async () => {
    // No onFileAppend callback
    const executor = createExecutor({
      macroName: 'Test.iim',
    });
    registerSystemHandlers(executor.registerHandler.bind(executor));

    executor.loadMacro([
      'SET !FILE_PROFILER /tmp/profiler.csv',
      'SET !VAR1 hello',
    ].join('\n'));

    const result = await executor.execute();

    expect(result.success).toBe(true);
    // Records should still be collected even without the callback
    expect(result.profilerRecords).toBeDefined();
    expect(result.profilerRecords!.length).toBe(1);
  });
});
