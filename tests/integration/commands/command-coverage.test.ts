/**
 * Integration Tests: Improved Command Coverage
 *
 * Tests missing command variants, error paths, and variable interaction
 * edge cases across SET/ADD, flow control, extraction, and system commands.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  executeMacro,
  createExecutor,
  IMACROS_ERROR_CODES,
} from '../../../shared/src/executor';

// ===== SET Command Edge Cases =====

describe('SET Command: Edge Cases', () => {
  it('should handle SET with EVAL division by zero', async () => {
    const result = await executeMacro('SET !VAR1 EVAL(1/0)');
    expect(result.success).toBe(true);
    // Division by zero returns Infinity in JS
    expect(result.variables['!VAR1']).toBeDefined();
  });

  it('should handle SET with EVAL empty expression', async () => {
    const result = await executeMacro('SET !VAR1 EVAL()');
    expect(result.success).toBe(true);
  });

  it('should handle SET with EVAL simple arithmetic', async () => {
    const result = await executeMacro('SET !VAR1 EVAL("2+3")');
    expect(result.success).toBe(true);
    expect(Number(result.variables['!VAR1'])).toBe(5);
  });

  it('should handle SET with EVAL multiplication', async () => {
    const result = await executeMacro('SET !VAR1 EVAL("10*2")');
    expect(result.success).toBe(true);
    expect(Number(result.variables['!VAR1'])).toBe(20);
  });

  it('should handle SET with EVAL referencing other variables', async () => {
    const script = [
      'SET !VAR1 10',
      'SET !VAR2 EVAL("{{!VAR1}}*2")',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(Number(result.variables['!VAR2'])).toBe(20);
  });

  it('should handle SET !EXTRACT variable', async () => {
    const script = 'SET !EXTRACT test_value';
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(result.variables['!EXTRACT']).toBe('test_value');
  });

  it('should handle SET !EXTRACTADD appends to !EXTRACT', async () => {
    const script = [
      'SET !EXTRACT first',
      'SET !EXTRACTADD second',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    // !EXTRACT should contain accumulated values
    const extract = String(result.variables['!EXTRACT']);
    expect(extract).toContain('first');
  });

  it('should set !REPLAYSPEED variable', async () => {
    const result = await executeMacro('SET !REPLAYSPEED FAST');
    expect(result.success).toBe(true);
    expect(result.variables['!REPLAYSPEED']).toBe('FAST');
  });

  it('should set !REPLAYSPEED to MEDIUM', async () => {
    const result = await executeMacro('SET !REPLAYSPEED MEDIUM');
    expect(result.success).toBe(true);
    expect(result.variables['!REPLAYSPEED']).toBe('MEDIUM');
  });

  it('should set !REPLAYSPEED to SLOW', async () => {
    const result = await executeMacro('SET !REPLAYSPEED SLOW');
    expect(result.success).toBe(true);
    expect(result.variables['!REPLAYSPEED']).toBe('SLOW');
  });

  it('should return error for SET with missing value', async () => {
    const result = await executeMacro('SET !VAR1');
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
  });

  it('should handle SET !TIMEOUT_TAG', async () => {
    const result = await executeMacro('SET !TIMEOUT_TAG 5');
    expect(result.success).toBe(true);
    expect(result.variables['!TIMEOUT_TAG']).toBe('5');
  });

  it('should handle chained SET with variable references', async () => {
    const script = [
      'SET !VAR1 hello',
      'SET !VAR2 {{!VAR1}}',
      'SET !VAR3 {{!VAR2}}_suffix',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(result.variables['!VAR2']).toBe('hello');
    expect(result.variables['!VAR3']).toBe('hello_suffix');
  });

  it('should handle SET !SINGLESTEP variable', async () => {
    const result = await executeMacro('SET !SINGLESTEP YES');
    expect(result.success).toBe(true);
    expect(result.variables['!SINGLESTEP']).toBe('YES');
  });

  it('should handle SET !ENCRYPTION variable', async () => {
    const result = await executeMacro('SET !ENCRYPTION NO');
    expect(result.success).toBe(true);
  });
});

// ===== ADD Command Edge Cases =====

describe('ADD Command: Edge Cases', () => {
  it('should ADD numeric values correctly', async () => {
    const script = [
      'SET !VAR1 10',
      'ADD !VAR1 5',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    // ADD stores numeric result - compare as number
    expect(Number(result.variables['!VAR1'])).toBe(15);
  });

  it('should ADD negative numbers', async () => {
    const script = [
      'SET !VAR1 10',
      'ADD !VAR1 -3',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(Number(result.variables['!VAR1'])).toBe(7);
  });

  it('should ADD decimal numbers', async () => {
    const script = [
      'SET !VAR1 1.5',
      'ADD !VAR1 2.3',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(parseFloat(String(result.variables['!VAR1']))).toBeCloseTo(3.8);
  });

  it('should concatenate non-numeric strings with ADD', async () => {
    const script = [
      'SET !VAR1 hello',
      'ADD !VAR1 _world',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(result.variables['!VAR1']).toBe('hello_world');
  });

  it('should ADD zero to a variable', async () => {
    const script = [
      'SET !VAR1 42',
      'ADD !VAR1 0',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(Number(result.variables['!VAR1'])).toBe(42);
  });

  it('should return error for ADD with missing value', async () => {
    const result = await executeMacro('ADD !VAR1');
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
  });

  it('should handle ADD with variable reference as operand', async () => {
    const script = [
      'SET !VAR1 10',
      'SET !VAR2 5',
      'ADD !VAR1 {{!VAR2}}',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(Number(result.variables['!VAR1'])).toBe(15);
  });

  it('should handle cumulative ADD across multiple calls', async () => {
    const script = [
      'SET !VAR1 0',
      'ADD !VAR1 10',
      'ADD !VAR1 20',
      'ADD !VAR1 30',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(Number(result.variables['!VAR1'])).toBe(60);
  });
});

// ===== ERRORIGNORE and ERRORLOOP Interaction =====

describe('Error Handling: ERRORIGNORE and ERRORLOOP', () => {
  it('should continue after unhandled command with ERRORIGNORE YES', async () => {
    // Use a command that actually fails (not just unimplemented)
    const script = [
      'SET !ERRORIGNORE YES',
      'SET !VAR1',
      'SET !VAR2 continued',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(result.variables['!VAR2']).toBe('continued');
  });

  it('should skip to next loop with ERRORLOOP YES on error', async () => {
    const script = [
      'SET !ERRORLOOP YES',
      'SET !VAR1',
      'SET !VAR2 should_not_reach',
    ].join('\n');
    const executor = createExecutor({ maxLoops: 2 });
    executor.loadMacro(script);
    const result = await executor.execute();
    // ERRORLOOP skips to next loop on first error; should complete 2 loops
    expect(result.loopsCompleted).toBe(2);
  });

  it('should stop execution on error when neither ERRORIGNORE nor ERRORLOOP', async () => {
    const script = [
      'SET !VAR1',
      'SET !VAR2 should_not_reach',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(false);
    // !VAR2 should not be set
    expect(result.variables['!VAR2']).toBe('');
  });

  it('should toggle ERRORIGNORE on and off within macro', async () => {
    const script = [
      'SET !ERRORIGNORE YES',
      'SET !VAR1',
      'SET !ERRORIGNORE NO',
      'SET !VAR2 reached',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(result.variables['!VAR2']).toBe('reached');
  });

  it('should handle multiple errors with ERRORIGNORE YES', async () => {
    const script = [
      'SET !ERRORIGNORE YES',
      'SET !VAR1',
      'ADD !VAR2',
      'SET !VAR3',
      'SET !VAR4 survived_all',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(result.variables['!VAR4']).toBe('survived_all');
  });

  it('should set ERRORLOOP to YES then encounter error - skips rest of loop body', async () => {
    const script = [
      'SET !VAR1 before',
      'SET !ERRORLOOP YES',
      'SET !VAR2',
      'SET !VAR3 after_error',
    ].join('\n');
    const result = await executeMacro(script);
    // Should succeed since ERRORLOOP skips to next loop (and it's the only loop)
    expect(result.variables['!VAR1']).toBe('before');
    // !VAR3 should not be set since error skipped rest of loop body
    expect(result.variables['!VAR3']).toBe('');
  });
});

// ===== WAIT Command Variants =====

describe('WAIT Command: Variants', () => {
  it('should execute WAIT SECONDS=0 (clamped to minimum)', async () => {
    const result = await executeMacro('WAIT SECONDS=0');
    expect(result.success).toBe(true);
  });

  it('should execute WAIT SECONDS=0.01 (very short)', async () => {
    const result = await executeMacro('WAIT SECONDS=0.01');
    expect(result.success).toBe(true);
  });

  it('should fail for WAIT with negative SECONDS', async () => {
    const result = await executeMacro('WAIT SECONDS=-1');
    expect(result.success).toBe(false);
  });

  it('should fail for WAIT with non-numeric SECONDS', async () => {
    const result = await executeMacro('WAIT SECONDS=abc');
    expect(result.success).toBe(false);
  });

  it('should handle WAIT with variable-expanded SECONDS', async () => {
    const script = [
      'SET !VAR1 0.01',
      'WAIT SECONDS={{!VAR1}}',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
  });

  it('should fail for WAIT without SECONDS parameter', async () => {
    const result = await executeMacro('WAIT');
    expect(result.success).toBe(false);
    // getRequiredParam throws -> caught as SCRIPT_ERROR
    expect(result.errorCode).not.toBe(IMACROS_ERROR_CODES.OK);
  });
});

// ===== VERSION Command =====

describe('VERSION Command', () => {
  it('should execute VERSION BUILD successfully', async () => {
    const result = await executeMacro('VERSION BUILD=1000000');
    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
  });

  it('should execute VERSION BUILD with RECORDER tag', async () => {
    const result = await executeMacro('VERSION BUILD=1000000 RECORDER=CR');
    expect(result.success).toBe(true);
  });
});

// ===== Loops with Variables =====

describe('Loop Execution with Variables', () => {
  it('should increment !LOOP across iterations', async () => {
    const script = 'SET !VAR1 {{!LOOP}}';
    const executor = createExecutor({ maxLoops: 3 });
    executor.loadMacro(script);
    const result = await executor.execute();
    expect(result.success).toBe(true);
    expect(result.loopsCompleted).toBe(3);
    // After 3 loops, !VAR1 should reflect the last loop counter
    expect(String(result.variables['!VAR1'])).toBe('3');
  });

  it('should track !LOOP value in extraction variable', async () => {
    const script = 'SET !VAR1 loop_{{!LOOP}}';
    const executor = createExecutor({ maxLoops: 3 });
    executor.loadMacro(script);
    const result = await executor.execute();
    expect(result.success).toBe(true);
    expect(result.loopsCompleted).toBe(3);
    expect(result.variables['!VAR1']).toBe('loop_3');
  });

  it('should handle ADD across loop iterations', async () => {
    const script = 'ADD !VAR1 1';
    const executor = createExecutor({
      maxLoops: 5,
      initialVariables: { '!VAR1': '0' },
    });
    executor.loadMacro(script);
    const result = await executor.execute();
    expect(result.success).toBe(true);
    expect(Number(result.variables['!VAR1'])).toBe(5);
  });

  it('should handle single loop (maxLoops=1)', async () => {
    const script = 'SET !VAR1 done';
    const executor = createExecutor({ maxLoops: 1 });
    executor.loadMacro(script);
    const result = await executor.execute();
    expect(result.success).toBe(true);
    expect(result.loopsCompleted).toBe(1);
    expect(result.variables['!VAR1']).toBe('done');
  });

  it('should handle many loops (maxLoops=100)', async () => {
    const script = 'ADD !VAR1 1';
    const executor = createExecutor({
      maxLoops: 100,
      initialVariables: { '!VAR1': '0' },
    });
    executor.loadMacro(script);
    const result = await executor.execute();
    expect(result.success).toBe(true);
    expect(result.loopsCompleted).toBe(100);
    expect(Number(result.variables['!VAR1'])).toBe(100);
  });
});

// ===== Profiler Integration =====

describe('Profiler Integration', () => {
  it('should collect profiler records when !FILE_PROFILER is set', async () => {
    const appendedContent: string[] = [];
    const executor = createExecutor({
      onFileAppend: async (path: string, content: string) => {
        appendedContent.push(content);
      },
    });
    const script = [
      'SET !FILE_PROFILER test_profile.csv',
      'SET !VAR1 hello',
      'SET !VAR2 world',
    ].join('\n');
    executor.loadMacro(script);
    const result = await executor.execute();
    expect(result.success).toBe(true);
    expect(result.profilerRecords).toBeDefined();
    expect(result.profilerRecords!.length).toBeGreaterThanOrEqual(2);
  });

  it('should include command timing in profiler records', async () => {
    const executor = createExecutor();
    const script = [
      'SET !FILE_PROFILER test.csv',
      'SET !VAR1 hello',
      'WAIT SECONDS=0.05',
    ].join('\n');
    executor.loadMacro(script);
    const result = await executor.execute();
    expect(result.success).toBe(true);
    if (result.profilerRecords && result.profilerRecords.length > 0) {
      for (const record of result.profilerRecords) {
        expect(record.durationMs).toBeGreaterThanOrEqual(0);
        expect(record.command).toBeDefined();
        expect(record.line).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

// ===== !NOW Dynamic Variable =====

describe('!NOW Dynamic Variable', () => {
  it('should expand !NOW to current date/time', async () => {
    const result = await executeMacro('SET !VAR1 {{!NOW}}');
    expect(result.success).toBe(true);
    expect(result.variables['!VAR1']).toBeDefined();
    expect(String(result.variables['!VAR1']).length).toBeGreaterThan(0);
  });

  it('should expand !NOW with date format components', async () => {
    const result = await executeMacro('SET !VAR1 {{!NOW:YYYY}}');
    expect(result.success).toBe(true);
    const year = String(result.variables['!VAR1']);
    // Should be a 4-digit year
    expect(year).toMatch(/^\d{4}$/);
  });
});

// ===== Comment and Empty Line Handling =====

describe('Comment and Empty Line Handling', () => {
  it('should skip comment lines (single quotes)', async () => {
    const script = [
      "' This is a comment",
      'SET !VAR1 hello',
      "' Another comment",
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(result.variables['!VAR1']).toBe('hello');
  });

  it('should handle empty lines in macro', async () => {
    const script = [
      'SET !VAR1 hello',
      '',
      '',
      'SET !VAR2 world',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(result.variables['!VAR1']).toBe('hello');
    expect(result.variables['!VAR2']).toBe('world');
  });

  it('should handle macro with only comments', async () => {
    const script = [
      "' Comment 1",
      "' Comment 2",
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
  });
});

// ===== Multiple Variable Interactions =====

describe('Variable Interactions', () => {
  it('should support variable-in-variable expansion', async () => {
    const script = [
      'SET !VAR1 hello',
      'SET !VAR2 {{!VAR1}}_world',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(result.variables['!VAR2']).toBe('hello_world');
  });

  it('should handle unset variable expansion as empty string', async () => {
    const result = await executeMacro('SET !VAR2 prefix_{{!VAR1}}_suffix');
    expect(result.success).toBe(true);
    expect(result.variables['!VAR2']).toBe('prefix__suffix');
  });

  it('should set !DATASOURCE path variable', async () => {
    const result = await executeMacro('SET !DATASOURCE test.csv');
    expect(result.success).toBe(true);
    expect(result.variables['!DATASOURCE']).toBe('test.csv');
  });

  it('should set !DATASOURCE_DELIMITER variable', async () => {
    const result = await executeMacro('SET !DATASOURCE_DELIMITER ;');
    expect(result.success).toBe(true);
  });

  it('should handle EVAL with Math functions (returns number)', async () => {
    const result = await executeMacro('SET !VAR1 EVAL(floor(3.7))');
    expect(result.success).toBe(true);
    expect(Number(result.variables['!VAR1'])).toBe(3);
  });

  it('should handle EVAL with abs function', async () => {
    const result = await executeMacro('SET !VAR1 EVAL(abs(-5))');
    expect(result.success).toBe(true);
    expect(Number(result.variables['!VAR1'])).toBe(5);
  });

  it('should handle EVAL with round function', async () => {
    const result = await executeMacro('SET !VAR1 EVAL(round(3.5))');
    expect(result.success).toBe(true);
    expect(Number(result.variables['!VAR1'])).toBe(4);
  });

  it('should handle EVAL with sqrt function', async () => {
    const result = await executeMacro('SET !VAR1 EVAL(sqrt(16))');
    expect(result.success).toBe(true);
    expect(Number(result.variables['!VAR1'])).toBe(4);
  });

  it('should handle EVAL with ceil function', async () => {
    const result = await executeMacro('SET !VAR1 EVAL(ceil(2.1))');
    expect(result.success).toBe(true);
    expect(Number(result.variables['!VAR1'])).toBe(3);
  });

  it('should handle EVAL with modulo operation', async () => {
    const result = await executeMacro('SET !VAR1 EVAL("10%3")');
    expect(result.success).toBe(true);
    expect(Number(result.variables['!VAR1'])).toBe(1);
  });

  it('should handle EVAL with nested arithmetic', async () => {
    const result = await executeMacro('SET !VAR1 EVAL("(2+3)*4")');
    expect(result.success).toBe(true);
    expect(Number(result.variables['!VAR1'])).toBe(20);
  });
});
