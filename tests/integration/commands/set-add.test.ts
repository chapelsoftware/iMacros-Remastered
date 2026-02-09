/**
 * Integration Tests for SET and ADD Commands
 *
 * Tests the SET and ADD commands through the MacroExecutor (executeMacro function).
 * Verifies user variables (!VAR0-9), system variables (!TIMEOUT, !ERRORIGNORE, etc.),
 * EVAL() expressions, variable references, and ADD numeric accumulation.
 */
import { describe, it, expect } from 'vitest';
import { executeMacro, IMACROS_ERROR_CODES } from '../../../shared/src/executor';

describe('SET Command Integration Tests', () => {
  describe('User Variables (!VAR0-9)', () => {
    it('should assign a string value to !VAR1', async () => {
      const result = await executeMacro('SET !VAR1 hello');
      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(result.variables['!VAR1']).toBe('hello');
    });

    it('should assign values to all user variables !VAR0 through !VAR9', async () => {
      const lines = Array.from({ length: 10 }, (_, i) => `SET !VAR${i} value${i}`);
      const script = lines.join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      for (let i = 0; i <= 9; i++) {
        expect(result.variables[`!VAR${i}`]).toBe(`value${i}`);
      }
    });

    it('should overwrite an existing variable value', async () => {
      const script = [
        'SET !VAR1 first',
        'SET !VAR1 second',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe('second');
    });

    it('should assign numeric string values', async () => {
      const result = await executeMacro('SET !VAR0 12345');
      expect(result.success).toBe(true);
      expect(result.variables['!VAR0']).toBe('12345');
    });

    it('should handle variables independently', async () => {
      const script = [
        'SET !VAR0 alpha',
        'SET !VAR5 beta',
        'SET !VAR9 gamma',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      expect(result.variables['!VAR0']).toBe('alpha');
      expect(result.variables['!VAR5']).toBe('beta');
      expect(result.variables['!VAR9']).toBe('gamma');
      // Unset vars should remain at defaults
      expect(result.variables['!VAR1']).toBe('');
    });
  });

  describe('System Variables', () => {
    it('should set !TIMEOUT to a numeric value', async () => {
      const result = await executeMacro('SET !TIMEOUT 10');
      expect(result.success).toBe(true);
      expect(result.variables['!TIMEOUT']).toBe('10');
    });

    it('should set !TIMEOUT_STEP', async () => {
      const result = await executeMacro('SET !TIMEOUT_STEP 3');
      expect(result.success).toBe(true);
      expect(result.variables['!TIMEOUT_STEP']).toBe('3');
    });

    it('should set !TIMEOUT_PAGE', async () => {
      const result = await executeMacro('SET !TIMEOUT_PAGE 120');
      expect(result.success).toBe(true);
      expect(result.variables['!TIMEOUT_PAGE']).toBe('120');
    });

    it('should set !ERRORIGNORE to YES', async () => {
      const result = await executeMacro('SET !ERRORIGNORE YES');
      expect(result.success).toBe(true);
      expect(result.variables['!ERRORIGNORE']).toBe('YES');
    });

    it('should set !ERRORIGNORE to NO', async () => {
      const script = [
        'SET !ERRORIGNORE YES',
        'SET !ERRORIGNORE NO',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      expect(result.variables['!ERRORIGNORE']).toBe('NO');
    });

    it('should set !ERRORLOOP to YES', async () => {
      const result = await executeMacro('SET !ERRORLOOP YES');
      expect(result.success).toBe(true);
      expect(result.variables['!ERRORLOOP']).toBe('YES');
    });

    it('should set !SINGLESTEP', async () => {
      const result = await executeMacro('SET !SINGLESTEP NO');
      expect(result.success).toBe(true);
      expect(result.variables['!SINGLESTEP']).toBe('NO');
    });

    it('should set !EXTRACT', async () => {
      const result = await executeMacro('SET !EXTRACT testdata');
      expect(result.success).toBe(true);
      expect(result.variables['!EXTRACT']).toBe('testdata');
    });

    it('should set !DATASOURCE_LINE', async () => {
      const result = await executeMacro('SET !DATASOURCE_LINE 5');
      expect(result.success).toBe(true);
      expect(result.variables['!DATASOURCE_LINE']).toBe('5');
    });

    it('should set !DATASOURCE', async () => {
      const result = await executeMacro('SET !DATASOURCE mydata.csv');
      expect(result.success).toBe(true);
      expect(result.variables['!DATASOURCE']).toBe('mydata.csv');
    });

    it('should set folder variables', async () => {
      const script = [
        'SET !FOLDER_DATASOURCE /path/to/data',
        'SET !FOLDER_DOWNLOAD /path/to/downloads',
        'SET !FOLDER_MACROS /path/to/macros',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      expect(result.variables['!FOLDER_DATASOURCE']).toBe('/path/to/data');
      expect(result.variables['!FOLDER_DOWNLOAD']).toBe('/path/to/downloads');
      expect(result.variables['!FOLDER_MACROS']).toBe('/path/to/macros');
    });

    it('should set !CLIPBOARD', async () => {
      const result = await executeMacro('SET !CLIPBOARD copiedtext');
      expect(result.success).toBe(true);
      expect(result.variables['!CLIPBOARD']).toBe('copiedtext');
    });
  });

  describe('SET with EVAL() expressions', () => {
    it('should evaluate simple addition', async () => {
      const result = await executeMacro('SET !VAR1 EVAL("1+2")');
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe(3);
    });

    it('should evaluate subtraction', async () => {
      const result = await executeMacro('SET !VAR1 EVAL("10-3")');
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe(7);
    });

    it('should evaluate multiplication', async () => {
      const result = await executeMacro('SET !VAR1 EVAL("4*5")');
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe(20);
    });

    it('should evaluate division', async () => {
      const result = await executeMacro('SET !VAR1 EVAL("20/4")');
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe(5);
    });

    it('should evaluate complex arithmetic with parentheses', async () => {
      const result = await executeMacro('SET !VAR1 EVAL("(2+3)*4")');
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe(20);
    });

    it('should evaluate modulo operator', async () => {
      const result = await executeMacro('SET !VAR1 EVAL("10%3")');
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe(1);
    });

    it('should evaluate EVAL with variable reference {{!VAR1}}+1', async () => {
      const script = [
        'SET !VAR1 5',
        'SET !VAR1 EVAL("{{!VAR1}}+1")',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe(6);
    });

    it('should evaluate EVAL with multiple variable references', async () => {
      const script = [
        'SET !VAR1 10',
        'SET !VAR2 20',
        'SET !VAR3 EVAL("{{!VAR1}}+{{!VAR2}}")',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      expect(result.variables['!VAR3']).toBe(30);
    });

    it('should evaluate EVAL with decimal numbers', async () => {
      const result = await executeMacro('SET !VAR1 EVAL("1.5+2.5")');
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe(4);
    });

    it('should evaluate EVAL with negative result', async () => {
      const result = await executeMacro('SET !VAR1 EVAL("3-10")');
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe(-7);
    });

    it('should handle EVAL with empty variable as zero', async () => {
      // !VAR1 defaults to empty string, which when expanded and sanitized gives empty -> 0
      const result = await executeMacro('SET !VAR1 EVAL("{{!VAR1}}+0")');
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe(0);
    });

    it('should increment a variable in a multi-step script', async () => {
      const script = [
        'SET !VAR1 0',
        'SET !VAR1 EVAL("{{!VAR1}}+1")',
        'SET !VAR1 EVAL("{{!VAR1}}+1")',
        'SET !VAR1 EVAL("{{!VAR1}}+1")',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe(3);
    });
  });

  describe('SET with variable references in value', () => {
    it('should expand a variable reference in literal value', async () => {
      const script = [
        'SET !VAR1 world',
        'SET !VAR2 {{!VAR1}}',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      expect(result.variables['!VAR2']).toBe('world');
    });

    it('should expand multiple variable references in a single value', async () => {
      const script = [
        'SET !VAR1 hello',
        'SET !VAR2 world',
        'SET !VAR3 {{!VAR1}}-{{!VAR2}}',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      expect(result.variables['!VAR3']).toBe('hello-world');
    });
  });

  describe('SET with multi-line scripts', () => {
    it('should execute multiple SET commands in sequence', async () => {
      const script = [
        'SET !VAR1 a',
        'SET !VAR2 b',
        'SET !VAR3 c',
        'SET !VAR4 d',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe('a');
      expect(result.variables['!VAR2']).toBe('b');
      expect(result.variables['!VAR3']).toBe('c');
      expect(result.variables['!VAR4']).toBe('d');
    });

    it('should handle comments and blank lines mixed with SET', async () => {
      const script = [
        "' This is a comment",
        'SET !VAR1 hello',
        '',
        "' Another comment",
        'SET !VAR2 world',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe('hello');
      expect(result.variables['!VAR2']).toBe('world');
    });
  });

  describe('SET error cases', () => {
    it('should fail when SET has no parameters', async () => {
      // The parser will parse "SET" as a SET command with 0 parameters.
      // The executor SET handler checks params.length < 2 and returns MISSING_PARAMETER.
      // However, the validator may also flag this as an error during parsing.
      const result = await executeMacro('SET');
      // The parser validation may produce a parse warning, but execution still proceeds
      // and the handler returns an error.
      expect(result.success).toBe(false);
    });

    it('should fail when SET has only a variable name but no value', async () => {
      const result = await executeMacro('SET !VAR1');
      expect(result.success).toBe(false);
    });
  });
});

describe('ADD Command Integration Tests', () => {
  describe('Basic ADD operations', () => {
    it('should add a number to an existing variable', async () => {
      const script = [
        'SET !VAR1 10',
        'ADD !VAR1 5',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      // ADD adds to a numeric value. !VAR1 was "10" (string from SET literal),
      // ADD parses current as float and adds 5.
      expect(result.variables['!VAR1']).toBe(15);
    });

    it('should add to an empty variable (treated as 0)', async () => {
      // !VAR1 defaults to empty string, which is treated as 0 by ADD
      const result = await executeMacro('ADD !VAR1 5');
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe(5);
    });

    it('should accumulate multiple ADD operations', async () => {
      const script = [
        'SET !VAR1 0',
        'ADD !VAR1 10',
        'ADD !VAR1 20',
        'ADD !VAR1 30',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe(60);
    });

    it('should add decimal numbers', async () => {
      const script = [
        'SET !VAR1 10.5',
        'ADD !VAR1 2.3',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBeCloseTo(12.8);
    });

    it('should add negative numbers (subtract)', async () => {
      const script = [
        'SET !VAR1 100',
        'ADD !VAR1 -25',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe(75);
    });

    it('should handle adding zero', async () => {
      const script = [
        'SET !VAR1 42',
        'ADD !VAR1 0',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe(42);
    });

    it('should produce negative results', async () => {
      const script = [
        'SET !VAR1 5',
        'ADD !VAR1 -10',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe(-5);
    });
  });

  describe('ADD to different variables', () => {
    it('should add to !VAR0', async () => {
      const script = [
        'SET !VAR0 1',
        'ADD !VAR0 1',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      expect(result.variables['!VAR0']).toBe(2);
    });

    it('should add to !VAR9', async () => {
      const script = [
        'SET !VAR9 100',
        'ADD !VAR9 50',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      expect(result.variables['!VAR9']).toBe(150);
    });
  });

  describe('ADD error cases', () => {
    it('should fail when ADD has no parameters', async () => {
      const result = await executeMacro('ADD');
      expect(result.success).toBe(false);
    });

    it('should fail when ADD has only variable name but no value', async () => {
      const result = await executeMacro('ADD !VAR1');
      expect(result.success).toBe(false);
    });

    it('should concatenate when ADD value is non-numeric (iMacros 8.9.7 behavior)', async () => {
      const script = [
        'SET !VAR1 prefix_',
        'ADD !VAR1 abc',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe('prefix_abc');
    });
  });

  describe('ADD with variable references', () => {
    it('should expand variable reference in ADD value', async () => {
      const script = [
        'SET !VAR1 0',
        'SET !VAR2 7',
        'ADD !VAR1 {{!VAR2}}',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe(7);
    });
  });
});

describe('SET and ADD combined workflows', () => {
  it('should use SET to initialize and ADD to accumulate', async () => {
    const script = [
      'SET !VAR1 0',
      'ADD !VAR1 1',
      'ADD !VAR1 2',
      'ADD !VAR1 3',
      'ADD !VAR1 4',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(result.variables['!VAR1']).toBe(10);
  });

  it('should combine SET EVAL with ADD', async () => {
    const script = [
      'SET !VAR1 EVAL("2*3")',
      'ADD !VAR1 4',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(result.variables['!VAR1']).toBe(10);
  });

  it('should use EVAL to compute from an ADD result', async () => {
    const script = [
      'SET !VAR1 10',
      'ADD !VAR1 5',
      'SET !VAR2 EVAL("{{!VAR1}}*2")',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(result.variables['!VAR1']).toBe(15);
    expect(result.variables['!VAR2']).toBe(30);
  });

  it('should set system vars alongside user vars', async () => {
    const script = [
      'SET !TIMEOUT 30',
      'SET !ERRORIGNORE YES',
      'SET !VAR1 test',
      'SET !VAR2 EVAL("5+5")',
      'ADD !VAR2 10',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(result.variables['!TIMEOUT']).toBe('30');
    expect(result.variables['!ERRORIGNORE']).toBe('YES');
    expect(result.variables['!VAR1']).toBe('test');
    expect(result.variables['!VAR2']).toBe(20);
  });

  it('should preserve default values for untouched variables', async () => {
    const result = await executeMacro('SET !VAR1 hello');
    expect(result.success).toBe(true);
    // Check defaults are preserved
    expect(result.variables['!VAR0']).toBe('');
    expect(result.variables['!VAR2']).toBe('');
    expect(result.variables['!TIMEOUT']).toBe(60);
    expect(result.variables['!TIMEOUT_STEP']).toBe(6);
    expect(result.variables['!TIMEOUT_PAGE']).toBe(60);
    expect(result.variables['!ERRORIGNORE']).toBe('NO');
    expect(result.variables['!LOOP']).toBe(1);
  });
});

describe('SET and ADD edge cases', () => {
  describe('SET with special values', () => {
    it('should handle setting a variable to a very long string', async () => {
      const longValue = 'x'.repeat(5000);
      const result = await executeMacro(`SET !VAR1 ${longValue}`);
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe(longValue);
    });

    it('should handle setting a variable to a value containing special characters', async () => {
      const result = await executeMacro('SET !VAR1 hello-world_test.value');
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe('hello-world_test.value');
    });

    it('should handle overwriting a variable multiple times in sequence', async () => {
      const script = [
        'SET !VAR1 first',
        'SET !VAR1 second',
        'SET !VAR1 third',
        'SET !VAR1 fourth',
        'SET !VAR1 fifth',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe('fifth');
    });

    it('should handle setting !EXTRACT to NULL to reset it (iMacros 8.9.7 behavior)', async () => {
      const script = [
        'SET !EXTRACT somedata',
        'SET !EXTRACT NULL',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      // In iMacros 8.9.7, SET !EXTRACT NULL clears the extract data
      expect(result.variables['!EXTRACT']).toBe('');
    });

    it('should handle setting !LOOP to a specific starting value', async () => {
      const result = await executeMacro('SET !LOOP 10');
      expect(result.success).toBe(true);
      expect(result.variables['!LOOP']).toBe('10');
    });
  });

  describe('EVAL edge cases', () => {
    it('should evaluate string concatenation with concat()', async () => {
      const result = await executeMacro('SET !VAR1 EVAL("concat(\\"hello\\", \\" \\", \\"world\\")")');
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe('hello world');
    });

    it('should evaluate nested arithmetic expressions', async () => {
      const result = await executeMacro('SET !VAR1 EVAL("((10+5)*2-8)/2")');
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe(11);
    });

    it('should evaluate exponentiation', async () => {
      const result = await executeMacro('SET !VAR1 EVAL("2^8")');
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe(256);
    });

    it('should handle chained variable references in EVAL', async () => {
      const script = [
        'SET !VAR1 2',
        'SET !VAR2 3',
        'SET !VAR3 EVAL("{{!VAR1}} * {{!VAR2}}")',
        'SET !VAR4 EVAL("{{!VAR3}} + 1")',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      expect(result.variables['!VAR3']).toBe(6);
      expect(result.variables['!VAR4']).toBe(7);
    });
  });

  describe('ADD edge cases', () => {
    it('should handle adding very large numbers', async () => {
      const script = [
        'SET !VAR1 999999',
        'ADD !VAR1 1',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe(1000000);
    });

    it('should handle adding very small decimals', async () => {
      const script = [
        'SET !VAR1 0',
        'ADD !VAR1 0.001',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBeCloseTo(0.001);
    });

    it('should handle multiple ADD operations resulting in zero', async () => {
      const script = [
        'SET !VAR1 100',
        'ADD !VAR1 -50',
        'ADD !VAR1 -50',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe(0);
    });
  });
});

describe('SET !LOOP first-loop guard (iMacros 8.9.7 parity)', () => {
  it('should apply SET !LOOP on first loop iteration', async () => {
    const result = await executeMacro('SET !LOOP 3');
    expect(result.success).toBe(true);
    expect(result.variables['!LOOP']).toBe('3');
  });

  it('should count loops correctly with maxLoops', async () => {
    const script = [
      'SET !VAR0 EVAL("{{!LOOP}}")',
    ].join('\n');
    const result = await executeMacro(script, { maxLoops: 3 });
    expect(result.success).toBe(true);
    // After 3 loops, !VAR0 should be 3 (the last loop number)
    expect(result.variables['!VAR0']).toBe(3);
  });

  it('should accumulate across loops with ADD', async () => {
    // Only ADD (no SET to reset), so value accumulates across loops
    const script = [
      'ADD !VAR1 1',
    ].join('\n');
    const result = await executeMacro(script, { maxLoops: 3 });
    expect(result.success).toBe(true);
    // Should have run 3 loops, adding 1 each time (starting from 0/empty)
    expect(result.variables['!VAR1']).toBe(3);
  });
});

describe('SET !TIMEOUT cascade (iMacros 8.9.7 parity)', () => {
  it('should cascade !TIMEOUT to !TIMEOUT_TAG = timeout/10', async () => {
    const result = await executeMacro('SET !TIMEOUT 60');
    expect(result.success).toBe(true);
    expect(result.variables['!TIMEOUT']).toBe('60');
    expect(result.variables['!TIMEOUT_TAG']).toBe(6);
  });

  it('should cascade !TIMEOUT 30 to !TIMEOUT_TAG 3', async () => {
    const result = await executeMacro('SET !TIMEOUT 30');
    expect(result.success).toBe(true);
    expect(result.variables['!TIMEOUT_TAG']).toBe(3);
  });

  it('should cascade !TIMEOUT 5 to !TIMEOUT_TAG 1 (minimum 1)', async () => {
    const result = await executeMacro('SET !TIMEOUT 5');
    expect(result.success).toBe(true);
    expect(result.variables['!TIMEOUT_TAG']).toBe(1);
  });

  it('should not cascade when setting !TIMEOUT_TAG directly', async () => {
    const script = [
      'SET !TIMEOUT 60',
      'SET !TIMEOUT_TAG 20',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(result.variables['!TIMEOUT_TAG']).toBe('20');
  });
});

describe('SET parameter validation (iMacros 8.9.7 parity)', () => {
  describe('YES/NO boolean variables', () => {
    it('should accept YES for !ERRORIGNORE', async () => {
      const result = await executeMacro('SET !ERRORIGNORE YES');
      expect(result.success).toBe(true);
    });

    it('should accept NO for !ERRORIGNORE', async () => {
      const result = await executeMacro('SET !ERRORIGNORE NO');
      expect(result.success).toBe(true);
    });

    it('should reject invalid value for !ERRORIGNORE', async () => {
      const result = await executeMacro('SET !ERRORIGNORE MAYBE');
      expect(result.success).toBe(false);
    });

    it('should reject invalid value for !ERRORLOOP', async () => {
      const result = await executeMacro('SET !ERRORLOOP SOMETIMES');
      expect(result.success).toBe(false);
    });

    it('should accept YES for !SINGLESTEP', async () => {
      const result = await executeMacro('SET !SINGLESTEP YES');
      expect(result.success).toBe(true);
    });

    it('should reject invalid value for !WAITPAGECOMPLETE', async () => {
      const result = await executeMacro('SET !WAITPAGECOMPLETE MAYBE');
      expect(result.success).toBe(false);
    });
  });

  describe('timeout variables', () => {
    it('should accept numeric values for !TIMEOUT', async () => {
      const result = await executeMacro('SET !TIMEOUT 30');
      expect(result.success).toBe(true);
    });

    it('should reject negative values for !TIMEOUT', async () => {
      const result = await executeMacro('SET !TIMEOUT -5');
      expect(result.success).toBe(false);
    });

    it('should reject non-numeric values for !TIMEOUT', async () => {
      const result = await executeMacro('SET !TIMEOUT abc');
      expect(result.success).toBe(false);
    });

    it('should accept 0 for !TIMEOUT', async () => {
      const result = await executeMacro('SET !TIMEOUT 0');
      expect(result.success).toBe(true);
    });
  });

  describe('!REPLAYSPEED validation', () => {
    it('should accept SLOW', async () => {
      const result = await executeMacro('SET !REPLAYSPEED SLOW');
      expect(result.success).toBe(true);
    });

    it('should accept MEDIUM', async () => {
      const result = await executeMacro('SET !REPLAYSPEED MEDIUM');
      expect(result.success).toBe(true);
    });

    it('should accept FAST', async () => {
      const result = await executeMacro('SET !REPLAYSPEED FAST');
      expect(result.success).toBe(true);
    });

    it('should reject invalid speed', async () => {
      const result = await executeMacro('SET !REPLAYSPEED TURBO');
      expect(result.success).toBe(false);
    });
  });

  describe('!LOOP validation', () => {
    it('should accept positive integer for !LOOP', async () => {
      const result = await executeMacro('SET !LOOP 5');
      expect(result.success).toBe(true);
    });

    it('should reject 0 for !LOOP', async () => {
      const result = await executeMacro('SET !LOOP 0');
      expect(result.success).toBe(false);
    });

    it('should reject negative for !LOOP', async () => {
      const result = await executeMacro('SET !LOOP -1');
      expect(result.success).toBe(false);
    });

    it('should reject non-integer for !LOOP', async () => {
      const result = await executeMacro('SET !LOOP 2.5');
      expect(result.success).toBe(false);
    });
  });

  describe('!DATASOURCE_LINE validation', () => {
    it('should accept positive integer', async () => {
      const result = await executeMacro('SET !DATASOURCE_LINE 1');
      expect(result.success).toBe(true);
    });

    it('should reject 0', async () => {
      const result = await executeMacro('SET !DATASOURCE_LINE 0');
      expect(result.success).toBe(false);
    });

    it('should reject non-numeric', async () => {
      const result = await executeMacro('SET !DATASOURCE_LINE abc');
      expect(result.success).toBe(false);
    });
  });

  describe('!DATASOURCE_DELIMITER validation', () => {
    it('should accept a single character', async () => {
      const result = await executeMacro('SET !DATASOURCE_DELIMITER ;');
      expect(result.success).toBe(true);
    });

    it('should accept comma', async () => {
      const result = await executeMacro('SET !DATASOURCE_DELIMITER ,');
      expect(result.success).toBe(true);
    });
  });
});
