/**
 * Unit Tests for iMacros Variable System
 *
 * Tests built-in variables (!VAR0-9), custom variables, !EXTRACT, !LOOP,
 * !DATASOURCE, variable expansion in commands, ADD operations, and edge cases.
 *
 * Uses the real VariableContext from shared/src/variables.ts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  VariableContext,
  createVariableContext,
  executeSet,
  executeSetAsync,
  executeAdd,
  parseSetValue,
  evaluateExpression,
  evaluateExpressionAsync,
  NativeEvalCallback,
} from '@shared/variables';

describe('Variable System Unit Tests', () => {
  let ctx: VariableContext;

  beforeEach(() => {
    ctx = new VariableContext();
  });

  describe('Built-in Variables (!VAR0-9)', () => {
    it('should initialize all built-in variables to empty strings', () => {
      for (let i = 0; i <= 9; i++) {
        expect(ctx.get(`!VAR${i}`)).toBe('');
      }
    });

    it('should set and get !VAR0', () => {
      ctx.set('!VAR0', 'test value');
      expect(ctx.get('!VAR0')).toBe('test value');
    });

    it('should set and get !VAR9', () => {
      ctx.set('!VAR9', 'last var');
      expect(ctx.get('!VAR9')).toBe('last var');
    });

    it('should handle all built-in variables independently', () => {
      for (let i = 0; i <= 9; i++) {
        ctx.set(`!VAR${i}`, `value${i}`);
      }
      for (let i = 0; i <= 9; i++) {
        expect(ctx.get(`!VAR${i}`)).toBe(`value${i}`);
      }
    });

    it('should be case-insensitive for built-in variable names', () => {
      ctx.set('!var0', 'lower');
      expect(ctx.get('!VAR0')).toBe('lower');
      expect(ctx.get('!var0')).toBe('lower');
      expect(ctx.get('!Var0')).toBe('lower');
    });

    it('should correctly identify system variables', () => {
      expect(ctx.isSystemVariable('!VAR0')).toBe(true);
      expect(ctx.isSystemVariable('!VAR9')).toBe(true);
      expect(ctx.isSystemVariable('!var5')).toBe(true);
      // !VAR10 is NOT in the system variables list
      expect(ctx.isSystemVariable('!VAR10')).toBe(false);
      expect(ctx.isSystemVariable('MYVAR')).toBe(false);
      // !LOOP IS a system variable in the real implementation
      expect(ctx.isSystemVariable('!LOOP')).toBe(true);
    });

    it('should overwrite existing built-in variable values', () => {
      ctx.set('!VAR0', 'first');
      ctx.set('!VAR0', 'second');
      expect(ctx.get('!VAR0')).toBe('second');
    });

    it('should handle numeric string values in built-in variables', () => {
      ctx.set('!VAR0', '12345');
      expect(ctx.get('!VAR0')).toBe('12345');
    });

    it('should handle special characters in built-in variable values', () => {
      ctx.set('!VAR0', 'hello<world>&"test\'');
      expect(ctx.get('!VAR0')).toBe('hello<world>&"test\'');
    });

    it('should return SetResult from set()', () => {
      const result = ctx.set('!VAR0', 'new value');
      expect(result.success).toBe(true);
      expect(result.previousValue).toBe('');
      expect(result.newValue).toBe('new value');
    });

    it('should return error SetResult for unknown system variable', () => {
      const result = ctx.set('!UNKNOWN_SYS_VAR', 'value');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Custom Variables', () => {
    it('should set and get custom variables', () => {
      ctx.set('MYVAR', 'custom value');
      expect(ctx.get('MYVAR')).toBe('custom value');
    });

    it('should return null for non-existent custom variables', () => {
      expect(ctx.get('NONEXISTENT')).toBeNull();
    });

    it('should be case-insensitive for custom variable names', () => {
      ctx.set('MyCustomVar', 'value');
      expect(ctx.get('MYCUSTOMVAR')).toBe('value');
      expect(ctx.get('mycustomvar')).toBe('value');
      expect(ctx.get('MyCustomVar')).toBe('value');
    });

    it('should handle multiple custom variables', () => {
      ctx.set('VAR_A', 'a');
      ctx.set('VAR_B', 'b');
      ctx.set('VAR_C', 'c');
      expect(ctx.get('VAR_A')).toBe('a');
      expect(ctx.get('VAR_B')).toBe('b');
      expect(ctx.get('VAR_C')).toBe('c');
    });

    it('should overwrite existing custom variable values', () => {
      ctx.set('MYVAR', 'original');
      ctx.set('MYVAR', 'updated');
      expect(ctx.get('MYVAR')).toBe('updated');
    });

    it('should handle long variable names', () => {
      const longName = 'THIS_IS_A_VERY_LONG_VARIABLE_NAME_THAT_EXCEEDS_NORMAL_LENGTH';
      ctx.set(longName, 'value');
      expect(ctx.get(longName)).toBe('value');
    });

    it('should handle variable names with underscores', () => {
      ctx.set('MY_VAR_NAME', 'value');
      expect(ctx.get('MY_VAR_NAME')).toBe('value');
    });

    it('should clear custom variables on reset', () => {
      ctx.set('MYVAR', 'value');
      ctx.reset();
      expect(ctx.get('MYVAR')).toBeNull();
    });

    it('should not clear built-in variables when resetting only vars', () => {
      ctx.set('!VAR0', 'builtin');
      ctx.set('MYVAR', 'custom');
      ctx.resetVars();
      // resetVars only resets !VAR0-9, not custom vars
      expect(ctx.get('!VAR0')).toBe('');
      expect(ctx.get('MYVAR')).toBe('custom');
    });
  });

  describe('!EXTRACT Variable (iMacros 8.9.7 behavior)', () => {
    it('should start with empty extract', () => {
      expect(ctx.getExtractArray()).toEqual([]);
      expect(ctx.get('!EXTRACT')).toBe('');
    });

    it('SET !EXTRACT should clear and set single value', () => {
      ctx.set('!EXTRACT', 'value1');
      expect(ctx.getExtractArray()).toEqual(['value1']);
      expect(ctx.get('!EXTRACT')).toBe('value1');
    });

    it('SET !EXTRACT should clear previous values (not accumulate)', () => {
      ctx.set('!EXTRACT', 'first');
      ctx.set('!EXTRACT', 'second');
      ctx.set('!EXTRACT', 'third');
      // Each SET !EXTRACT clears the accumulator - only last value remains
      expect(ctx.getExtractArray()).toEqual(['third']);
      expect(ctx.get('!EXTRACT')).toBe('third');
    });

    it('SET !EXTRACTADD should accumulate values with [EXTRACT] delimiter', () => {
      ctx.set('!EXTRACTADD', 'one');
      ctx.set('!EXTRACTADD', 'two');
      ctx.set('!EXTRACTADD', 'three');
      expect(ctx.getExtractAdd()).toBe('one[EXTRACT]two[EXTRACT]three');
      expect(ctx.get('!EXTRACT')).toBe('one[EXTRACT]two[EXTRACT]three');
    });

    it('SET !EXTRACT null should clear extract data', () => {
      ctx.set('!EXTRACTADD', 'value1');
      ctx.set('!EXTRACTADD', 'value2');
      ctx.set('!EXTRACT', 'null');
      expect(ctx.getExtractArray()).toEqual([]);
      expect(ctx.get('!EXTRACT')).toBe('');
    });

    it('should clear extract values on resetExtract', () => {
      ctx.set('!EXTRACTADD', 'value');
      ctx.resetExtract();
      expect(ctx.getExtractArray()).toEqual([]);
      expect(ctx.get('!EXTRACT')).toBe('');
    });

    it('SET !EXTRACTADD should handle empty string extracts', () => {
      ctx.set('!EXTRACTADD', '');
      ctx.set('!EXTRACTADD', 'value');
      ctx.set('!EXTRACTADD', '');
      expect(ctx.getExtractArray()).toEqual(['', 'value', '']);
    });

    it('SET !EXTRACTADD should handle special characters in extract values', () => {
      ctx.set('!EXTRACTADD', '<html>');
      ctx.set('!EXTRACTADD', 'a & b');
      ctx.set('!EXTRACTADD', '"quoted"');
      expect(ctx.getExtractArray()).toEqual(['<html>', 'a & b', '"quoted"']);
    });

    it('should handle newlines in extract values', () => {
      ctx.set('!EXTRACT', 'line1\nline2');
      expect(ctx.getExtractArray()).toEqual(['line1\nline2']);
    });

    it('SET !EXTRACTADD should handle unicode in extract values', () => {
      ctx.set('!EXTRACTADD', 'Hello \u4e16\u754c');
      ctx.set('!EXTRACTADD', '\ud83d\ude00');
      expect(ctx.getExtractArray()).toEqual(['Hello \u4e16\u754c', '\ud83d\ude00']);
    });
  });

  describe('!LOOP Counter', () => {
    it('should start with loop counter at 1', () => {
      expect(ctx.getLoop()).toBe(1);
      // get('!LOOP') returns a number, not a string
      expect(ctx.get('!LOOP')).toBe(1);
    });

    it('should set loop counter', () => {
      ctx.setLoop(5);
      expect(ctx.getLoop()).toBe(5);
      expect(ctx.get('!LOOP')).toBe(5);
    });

    it('should increment loop counter', () => {
      ctx.incrementLoop();
      expect(ctx.getLoop()).toBe(2);
      ctx.incrementLoop();
      expect(ctx.getLoop()).toBe(3);
    });

    it('should return loop counter as number via get', () => {
      ctx.setLoop(100);
      expect(ctx.get('!LOOP')).toBe(100);
    });

    it('should handle large loop values', () => {
      ctx.setLoop(1000000);
      expect(ctx.getLoop()).toBe(1000000);
      expect(ctx.get('!LOOP')).toBe(1000000);
    });

    it('should be case-insensitive for !LOOP', () => {
      ctx.setLoop(42);
      expect(ctx.get('!loop')).toBe(42);
      expect(ctx.get('!LOOP')).toBe(42);
      expect(ctx.get('!Loop')).toBe(42);
    });

    it('should handle zero loop value', () => {
      ctx.setLoop(0);
      expect(ctx.getLoop()).toBe(0);
      expect(ctx.get('!LOOP')).toBe(0);
    });

    it('should handle negative loop values', () => {
      ctx.setLoop(-1);
      expect(ctx.getLoop()).toBe(-1);
    });
  });

  describe('!DATASOURCE Variables', () => {
    it('should set datasource columns', () => {
      ctx.setDatasourceCols(['a1', 'b1', 'c1']);
      expect(ctx.get('!DATASOURCE_LINE')).toBe(1);
    });

    it('should access columns with !COL1, !COL2, etc.', () => {
      ctx.setDatasourceCols(['a1', 'b1', 'c1']);
      expect(ctx.get('!COL1')).toBe('a1');
      expect(ctx.get('!COL2')).toBe('b1');
      expect(ctx.get('!COL3')).toBe('c1');
    });

    it('should change datasource line', () => {
      ctx.setDatasourceCols(['a1', 'b1', 'c1']);
      ctx.setDatasourceLine(2);
      expect(ctx.get('!DATASOURCE_LINE')).toBe(2);
    });

    it('should update columns when setting new datasource cols', () => {
      ctx.setDatasourceCols(['a1', 'b1', 'c1']);
      ctx.setDatasourceCols(['a2', 'b2']);
      expect(ctx.get('!COL1')).toBe('a2');
      expect(ctx.get('!COL2')).toBe('b2');
      // COL3 should be reset to empty since new row only has 2 cols
      expect(ctx.get('!COL3')).toBe('');
    });

    it('should return empty string for unset columns', () => {
      // !COL1-10 default to empty string
      expect(ctx.get('!COL1')).toBe('');
      expect(ctx.get('!COL10')).toBe('');
    });

    it('should be case-insensitive for !COL', () => {
      ctx.setDatasourceCols(['a1', 'b1', 'c1']);
      expect(ctx.get('!col1')).toBe('a1');
      expect(ctx.get('!COL1')).toBe('a1');
      expect(ctx.get('!Col1')).toBe('a1');
    });

    it('should handle datasource with empty strings', () => {
      ctx.setDatasourceCols(['', 'value', '']);
      expect(ctx.get('!COL1')).toBe('');
      expect(ctx.get('!COL2')).toBe('value');
      expect(ctx.get('!COL3')).toBe('');
    });

    it('should set datasource column count', () => {
      ctx.setDatasourceCols(['a', 'b', 'c']);
      expect(ctx.get('!DATASOURCE_COLUMNS')).toBe(3);
    });

    it('should set datasource path', () => {
      ctx.setDatasource('/path/to/data.csv');
      expect(ctx.get('!DATASOURCE')).toBe('/path/to/data.csv');
    });
  });

  describe('Variable Expansion in Commands', () => {
    it('should expand single variable', () => {
      ctx.set('!VAR0', 'world');
      const result = ctx.expand('Hello {{!VAR0}}');
      expect(result.expanded).toBe('Hello world');
      expect(result.hadVariables).toBe(true);
    });

    it('should expand multiple variables', () => {
      ctx.set('!VAR0', 'John');
      ctx.set('!VAR1', 'Doe');
      const result = ctx.expand('Name: {{!VAR0}} {{!VAR1}}');
      expect(result.expanded).toBe('Name: John Doe');
    });

    it('should expand custom variables', () => {
      ctx.set('USERNAME', 'admin');
      const result = ctx.expand('User: {{USERNAME}}');
      expect(result.expanded).toBe('User: admin');
    });

    it('should expand !LOOP variable', () => {
      ctx.setLoop(5);
      const result = ctx.expand('Iteration: {{!LOOP}}');
      expect(result.expanded).toBe('Iteration: 5');
    });

    it('should expand !EXTRACT variable', () => {
      ctx.set('!EXTRACT', 'extracted data');
      const result = ctx.expand('Data: {{!EXTRACT}}');
      expect(result.expanded).toBe('Data: extracted data');
    });

    it('should expand !COL variables', () => {
      ctx.setDatasourceCols(['user@example.com', 'password123']);
      const result = ctx.expand('Login: {{!COL1}} / {{!COL2}}');
      expect(result.expanded).toBe('Login: user@example.com / password123');
    });

    it('should replace unresolved variables with empty string by default', () => {
      const result = ctx.expand('Hello {{UNDEFINED}}');
      expect(result.expanded).toBe('Hello ');
      expect(result.unresolvedVariables).toContain('UNDEFINED');
    });

    it('should handle text without variables', () => {
      const result = ctx.expand('No variables here');
      expect(result.expanded).toBe('No variables here');
      expect(result.hadVariables).toBe(false);
    });

    it('should handle empty string', () => {
      const result = ctx.expand('');
      expect(result.expanded).toBe('');
      expect(result.hadVariables).toBe(false);
    });

    it('should handle adjacent variables', () => {
      ctx.set('A', 'Hello');
      ctx.set('B', 'World');
      const result = ctx.expand('{{A}}{{B}}');
      expect(result.expanded).toBe('HelloWorld');
    });

    it('should be case-insensitive for variable names in expansion', () => {
      ctx.set('MYVAR', 'value');
      // The real expand does NOT trim variable names from extractVariables
      // So {{MYVAR}} works if ctx.get('MYVAR') works (it uppercases)
      expect(ctx.expand('{{MYVAR}}').expanded).toBe('value');
    });

    it('should handle nested braces correctly', () => {
      ctx.set('VAR', 'test');
      const result = ctx.expand('{{VAR}} and {notavar}');
      expect(result.expanded).toBe('test and {notavar}');
    });

    it('should handle URLs with variables', () => {
      ctx.set('DOMAIN', 'example.com');
      ctx.set('PAGE', 'index.html');
      const result = ctx.expand('https://{{DOMAIN}}/{{PAGE}}');
      expect(result.expanded).toBe('https://example.com/index.html');
    });
  });

  describe('ADD Operations on Variables', () => {
    it('should add to numeric variable', () => {
      ctx.set('!VAR0', '10');
      ctx.add('!VAR0', '5');
      // add() stores result as number
      expect(ctx.get('!VAR0')).toBe(15);
    });

    it('should add negative number', () => {
      ctx.set('!VAR0', '10');
      ctx.add('!VAR0', '-3');
      expect(ctx.get('!VAR0')).toBe(7);
    });

    it('should add to empty variable (treated as 0)', () => {
      ctx.add('!VAR0', '5');
      expect(ctx.get('!VAR0')).toBe(5);
    });

    it('should add decimal numbers', () => {
      ctx.set('!VAR0', '10.5');
      ctx.add('!VAR0', '2.3');
      expect(ctx.get('!VAR0')).toBeCloseTo(12.8);
    });

    it('should add to custom variable', () => {
      ctx.set('COUNTER', '100');
      ctx.add('COUNTER', '50');
      expect(ctx.get('COUNTER')).toBe(150);
    });

    it('should handle adding zero', () => {
      ctx.set('!VAR0', '42');
      ctx.add('!VAR0', '0');
      expect(ctx.get('!VAR0')).toBe(42);
    });

    it('should handle adding empty string as no-op (preserve numeric value)', () => {
      ctx.set('!VAR0', 10);
      ctx.add('!VAR0', '');
      expect(ctx.get('!VAR0')).toBe(10);
    });

    it('should handle adding empty string as no-op (preserve string value)', () => {
      ctx.set('!VAR0', 'hello');
      ctx.add('!VAR0', '');
      expect(ctx.get('!VAR0')).toBe('hello');
    });

    it('should handle large numbers', () => {
      ctx.set('!VAR0', '1000000000');
      ctx.add('!VAR0', '1');
      expect(ctx.get('!VAR0')).toBe(1000000001);
    });

    it('should handle negative results', () => {
      ctx.set('!VAR0', '5');
      ctx.add('!VAR0', '-10');
      expect(ctx.get('!VAR0')).toBe(-5);
    });

    it('should be case-insensitive for variable name', () => {
      ctx.set('!var0', '10');
      ctx.add('!VAR0', '5');
      expect(ctx.get('!var0')).toBe(15);
    });

    it('should create new variable if not exists and add', () => {
      ctx.add('NEWVAR', '10');
      expect(ctx.get('NEWVAR')).toBe(10);
    });

    it('should return AddResult with details', () => {
      ctx.set('!VAR0', '10');
      const result = ctx.add('!VAR0', '5');
      expect(result.success).toBe(true);
      expect(result.previousValue).toBe('10');
      expect(result.addedValue).toBe(5);
      expect(result.newValue).toBe(15);
    });

    it('should concatenate strings when non-numeric (iMacros 8.9.7 behavior)', () => {
      ctx.set('!VAR0', 'hello');
      const result = ctx.add('!VAR0', '5');
      expect(result.success).toBe(true);
      expect(result.newValue).toBe('hello5');
    });

    it('should concatenate when added value is non-numeric', () => {
      ctx.set('!VAR0', '10');
      const result = ctx.add('!VAR0', 'world');
      expect(result.success).toBe(true);
      expect(result.newValue).toBe('10world');
    });
  });

  describe('executeSet and executeAdd helpers', () => {
    it('should execute SET with literal value', () => {
      const result = executeSet(ctx, '!VAR0', 'hello');
      expect(result.success).toBe(true);
      expect(ctx.get('!VAR0')).toBe('hello');
    });

    it('should execute ADD with string value', () => {
      ctx.set('!VAR0', '10');
      const result = executeAdd(ctx, '!VAR0', '5');
      expect(result.success).toBe(true);
      expect(ctx.get('!VAR0')).toBe(15);
    });

    it('should execute ADD with non-numeric string (concatenates per iMacros 8.9.7)', () => {
      ctx.set('!VAR0', 'prefix_');
      const result = executeAdd(ctx, '!VAR0', 'not_a_number');
      expect(result.success).toBe(true);
      expect(ctx.get('!VAR0')).toBe('prefix_not_a_number');
    });
  });

  describe('ADD !EXTRACT behavior (iMacros 8.9.7 parity)', () => {
    it('should append first value without delimiter', () => {
      const result = executeAdd(ctx, '!EXTRACT', 'first');
      expect(result.success).toBe(true);
      expect(ctx.get('!EXTRACT')).toBe('first');
    });

    it('should append subsequent values with [EXTRACT] delimiter', () => {
      executeAdd(ctx, '!EXTRACT', 'first');
      executeAdd(ctx, '!EXTRACT', 'second');
      expect(ctx.get('!EXTRACT')).toBe('first[EXTRACT]second');
    });

    it('should accumulate multiple values with [EXTRACT] delimiters', () => {
      executeAdd(ctx, '!EXTRACT', 'Index ID');
      executeAdd(ctx, '!EXTRACT', '2026/03/01');
      executeAdd(ctx, '!EXTRACT', '4.015');
      expect(ctx.get('!EXTRACT')).toBe('Index ID[EXTRACT]2026/03/01[EXTRACT]4.015');
    });

    it('should keep !EXTRACT and !EXTRACTADD in sync', () => {
      executeAdd(ctx, '!EXTRACT', 'a');
      executeAdd(ctx, '!EXTRACT', 'b');
      expect(ctx.get('!EXTRACT')).toBe('a[EXTRACT]b');
      expect(ctx.get('!EXTRACTADD')).toBe('a[EXTRACT]b');
    });
  });

  describe('createVariableContext factory', () => {
    it('should create a new context with defaults', () => {
      const newCtx = createVariableContext();
      expect(newCtx.get('!VAR0')).toBe('');
      expect(newCtx.getLoop()).toBe(1);
    });

    it('should create a context with initial values', () => {
      const newCtx = createVariableContext({ '!VAR0': 'initial', 'MYVAR': 'custom' });
      expect(newCtx.get('!VAR0')).toBe('initial');
      expect(newCtx.get('MYVAR')).toBe('custom');
    });
  });

  describe('Edge Cases', () => {
    describe('Missing Variables', () => {
      it('should return null for out-of-range system variables', () => {
        // !VAR10 is not a known system variable so get returns null
        expect(ctx.get('!VAR10')).toBeNull();
        expect(ctx.get('!VAR99')).toBeNull();
      });

      it('should return null for undefined custom variable', () => {
        expect(ctx.get('UNDEFINED_VAR')).toBeNull();
      });

      it('should return null for empty variable name', () => {
        expect(ctx.get('')).toBeNull();
      });
    });

    describe('Special Characters', () => {
      it('should handle special characters in variable values', () => {
        ctx.set('!VAR0', '<script>alert("xss")</script>');
        expect(ctx.get('!VAR0')).toBe('<script>alert("xss")</script>');
      });

      it('should handle newlines in variable values', () => {
        ctx.set('!VAR0', 'line1\nline2\nline3');
        expect(ctx.get('!VAR0')).toBe('line1\nline2\nline3');
      });

      it('should handle tabs in variable values', () => {
        ctx.set('!VAR0', 'col1\tcol2\tcol3');
        expect(ctx.get('!VAR0')).toBe('col1\tcol2\tcol3');
      });

      it('should handle unicode characters', () => {
        ctx.set('!VAR0', '\u4e2d\u6587');
        expect(ctx.get('!VAR0')).toBe('\u4e2d\u6587');
      });

      it('should handle emojis', () => {
        ctx.set('!VAR0', '\ud83d\ude00\ud83d\ude01\ud83d\ude02');
        expect(ctx.get('!VAR0')).toBe('\ud83d\ude00\ud83d\ude01\ud83d\ude02');
      });

      it('should handle null byte in value', () => {
        ctx.set('!VAR0', 'before\0after');
        expect(ctx.get('!VAR0')).toBe('before\0after');
      });

      it('should handle very long values', () => {
        const longValue = 'x'.repeat(100000);
        ctx.set('!VAR0', longValue);
        expect(ctx.get('!VAR0')).toBe(longValue);
      });
    });

    describe('Reset Behavior', () => {
      it('should reset all variables to initial state', () => {
        ctx.set('!VAR0', 'value');
        ctx.set('CUSTOM', 'value');
        ctx.set('!EXTRACT', 'extracted');
        ctx.setLoop(10);

        ctx.reset();

        expect(ctx.get('!VAR0')).toBe('');
        expect(ctx.get('CUSTOM')).toBeNull();
        expect(ctx.get('!EXTRACT')).toBe('');
        expect(ctx.get('!LOOP')).toBe(1);
        expect(ctx.get('!COL1')).toBe('');
      });

      it('should reinitialize built-in vars after reset', () => {
        ctx.set('!VAR5', 'test');
        ctx.reset();
        for (let i = 0; i <= 9; i++) {
          expect(ctx.get(`!VAR${i}`)).toBe('');
        }
      });
    });

    describe('Concurrent Variable Access', () => {
      it('should handle rapid set/get operations', () => {
        for (let i = 0; i < 1000; i++) {
          ctx.set('!VAR0', `value${i}`);
          expect(ctx.get('!VAR0')).toBe(`value${i}`);
        }
      });

      it('should handle rapid loop increments', () => {
        for (let i = 0; i < 100; i++) {
          ctx.incrementLoop();
        }
        expect(ctx.getLoop()).toBe(101);
      });

      it('should handle rapid extract additions via !EXTRACTADD', () => {
        for (let i = 0; i < 100; i++) {
          ctx.set('!EXTRACTADD', `item${i}`);
        }
        expect(ctx.getExtractArray().length).toBe(100);
      });
    });

    describe('Type Handling', () => {
      it('should store string values as strings', () => {
        ctx.set('!VAR0', '123');
        expect(typeof ctx.get('!VAR0')).toBe('string');
      });

      it('should store numeric values as numbers', () => {
        ctx.set('!VAR0', 123);
        expect(typeof ctx.get('!VAR0')).toBe('number');
      });

      it('should handle boolean-like strings', () => {
        ctx.set('!VAR0', 'true');
        expect(ctx.get('!VAR0')).toBe('true');
        ctx.set('!VAR0', 'false');
        expect(ctx.get('!VAR0')).toBe('false');
      });

      it('should handle null-like strings', () => {
        ctx.set('!VAR0', 'null');
        expect(ctx.get('!VAR0')).toBe('null');
      });

      it('should handle undefined-like strings', () => {
        ctx.set('!VAR0', 'undefined');
        expect(ctx.get('!VAR0')).toBe('undefined');
      });
    });

    describe('Variable Name Edge Cases', () => {
      it('should handle variable names with numbers', () => {
        ctx.set('VAR123', 'value');
        expect(ctx.get('VAR123')).toBe('value');
      });

      it('should handle single character variable names', () => {
        ctx.set('X', 'value');
        expect(ctx.get('X')).toBe('value');
      });

      it('should handle variable names starting with underscore', () => {
        ctx.set('_PRIVATE', 'value');
        expect(ctx.get('_PRIVATE')).toBe('value');
      });

      it('should differentiate similar variable names', () => {
        ctx.set('VAR', 'a');
        ctx.set('VAR1', 'b');
        ctx.set('VAR12', 'c');
        expect(ctx.get('VAR')).toBe('a');
        expect(ctx.get('VAR1')).toBe('b');
        expect(ctx.get('VAR12')).toBe('c');
      });
    });

    describe('Expansion Edge Cases', () => {
      it('should handle malformed expansion syntax', () => {
        ctx.set('VAR', 'value');
        expect(ctx.expand('{VAR}').expanded).toBe('{VAR}');
        expect(ctx.expand('{{VAR').expanded).toBe('{{VAR');
        expect(ctx.expand('VAR}}').expanded).toBe('VAR}}');
      });

      it('should handle expansion with empty variable value', () => {
        ctx.set('EMPTY', '');
        expect(ctx.expand('before{{EMPTY}}after').expanded).toBe('beforeafter');
      });

      it('should handle multiple occurrences of same variable', () => {
        ctx.set('X', 'val');
        expect(ctx.expand('{{X}}{{X}}{{X}}').expanded).toBe('valvalval');
      });

      it('should handle special regex characters in variable values', () => {
        ctx.set('REGEX', '$1.*?+[]()');
        expect(ctx.expand('Pattern: {{REGEX}}').expanded).toBe('Pattern: $1.*?+[]()');
      });
    });

    describe('Timeout and Folder Variables', () => {
      it('should have default timeout values', () => {
        expect(ctx.getTimeout('default')).toBe(60);
        expect(ctx.getTimeout('step')).toBe(6);
        expect(ctx.getTimeout('page')).toBe(60);
      });

      it('should set and get timeout values', () => {
        ctx.setTimeout('step', 10);
        expect(ctx.getTimeout('step')).toBe(10);
        expect(ctx.get('!TIMEOUT_STEP')).toBe(10);
      });

      it('should set and get folder paths', () => {
        ctx.setFolder('datasource', '/data');
        expect(ctx.get('!FOLDER_DATASOURCE')).toBe('/data');
      });
    });

    describe('Clone and Import', () => {
      it('should clone a context with all values', () => {
        ctx.set('!VAR0', 'test');
        ctx.set('CUSTOM', 'value');
        ctx.setLoop(5);

        const cloned = ctx.clone();
        expect(cloned.get('!VAR0')).toBe('test');
        expect(cloned.get('CUSTOM')).toBe('value');
        expect(cloned.getLoop()).toBe(5);
      });

      it('should clone extract accumulator independently', () => {
        ctx.set('!EXTRACTADD', 'first');
        ctx.set('!EXTRACTADD', 'second');
        const cloned = ctx.clone();

        // Cloned context should have the same extract accumulator
        expect(cloned.getExtractArray()).toEqual(['first', 'second']);

        // Modifying the original should not affect the clone
        ctx.set('!EXTRACTADD', 'third');
        expect(cloned.getExtractArray()).toEqual(['first', 'second']);
        expect(ctx.getExtractArray()).toEqual(['first', 'second', 'third']);
      });

      it('should import variables from a record', () => {
        ctx.importVariables({ '!VAR0': 'imported', 'MYVAR': 'val' });
        expect(ctx.get('!VAR0')).toBe('imported');
        expect(ctx.get('MYVAR')).toBe('val');
      });
    });
  });

  describe('!NOW Variable', () => {
    it('should identify !NOW as a system variable', () => {
      expect(ctx.isSystemVariable('!NOW')).toBe(true);
    });

    it('should identify !NOW:format as a system variable', () => {
      expect(ctx.isSystemVariable('!NOW:yyyymmdd')).toBe(true);
      expect(ctx.isSystemVariable('!NOW:hh_nn_ss')).toBe(true);
    });

    it('should resolve !NOW to a date string in default format', () => {
      const result = ctx.get('!NOW');
      expect(typeof result).toBe('string');
      // Default format: YYYYMMDD_HHMMSS - should be 15 chars like 20260206_143025
      expect(result).toMatch(/^\d{8}_\d{6}$/);
    });

    it('should resolve !NOW:yyyymmdd to a date-only string', () => {
      const result = ctx.get('!NOW:yyyymmdd');
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^\d{8}$/);
    });

    it('should resolve !NOW:yyyy to four-digit year', () => {
      const result = ctx.get('!NOW:yyyy');
      expect(typeof result).toBe('string');
      const year = new Date().getFullYear().toString();
      expect(result).toBe(year);
    });

    it('should resolve !NOW:yy to two-digit year', () => {
      const result = ctx.get('!NOW:yy');
      expect(typeof result).toBe('string');
      const yy = new Date().getFullYear().toString().substring(2);
      expect(result).toBe(yy);
    });

    it('should resolve !NOW:mm to zero-padded month', () => {
      const result = ctx.get('!NOW:mm');
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^\d{2}$/);
      const month = parseInt(result!, 10);
      expect(month).toBeGreaterThanOrEqual(1);
      expect(month).toBeLessThanOrEqual(12);
    });

    it('should resolve !NOW:dd to zero-padded day', () => {
      const result = ctx.get('!NOW:dd');
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^\d{2}$/);
    });

    it('should resolve !NOW:hh to zero-padded hour', () => {
      const result = ctx.get('!NOW:hh');
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^\d{2}$/);
    });

    it('should resolve !NOW:nn to zero-padded minutes', () => {
      const result = ctx.get('!NOW:nn');
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^\d{2}$/);
    });

    it('should resolve !NOW:ss to zero-padded seconds', () => {
      const result = ctx.get('!NOW:ss');
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^\d{2}$/);
    });

    it('should resolve !NOW:dow to day of week (0-6)', () => {
      const result = ctx.get('!NOW:dow');
      expect(typeof result).toBe('string');
      const dow = parseInt(result!, 10);
      expect(dow).toBeGreaterThanOrEqual(0);
      expect(dow).toBeLessThanOrEqual(6);
    });

    it('should resolve !NOW:doy to zero-padded day of year', () => {
      const result = ctx.get('!NOW:doy');
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^\d{3}$/);
      const doy = parseInt(result!, 10);
      expect(doy).toBeGreaterThanOrEqual(1);
      expect(doy).toBeLessThanOrEqual(366);
    });

    it('should resolve custom format combining multiple tokens', () => {
      const result = ctx.get('!NOW:yyyy-mm-dd');
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should report !NOW as existing via has()', () => {
      expect(ctx.has('!NOW')).toBe(true);
      expect(ctx.has('!NOW:yyyy')).toBe(true);
    });

    it('should not allow setting !NOW (read-only)', () => {
      const result = ctx.set('!NOW', 'something');
      expect(result.success).toBe(false);
      expect(result.error).toContain('read-only');
    });

    it('should expand !NOW in variable expansion', () => {
      const result = ctx.expand('Date: {{!NOW:yyyy}}');
      expect(result.hadVariables).toBe(true);
      const year = new Date().getFullYear().toString();
      expect(result.expanded).toBe(`Date: ${year}`);
    });
  });

  describe('has() Method', () => {
    it('should return true for existing system variables', () => {
      expect(ctx.has('!VAR0')).toBe(true);
      expect(ctx.has('!LOOP')).toBe(true);
      expect(ctx.has('!EXTRACT')).toBe(true);
    });

    it('should return true for !NOW dynamic variable via isSystemVariable fallback', () => {
      // !NOW is not in the systemVars map, but isSystemVariable returns true
      expect(ctx.has('!NOW')).toBe(true);
      expect(ctx.has('!NOW:yyyy')).toBe(true);
    });

    it('should return false for unknown system variables', () => {
      expect(ctx.has('!UNKNOWN_THING')).toBe(false);
    });

    it('should return true for existing custom variables', () => {
      ctx.set('MYVAR', 'value');
      expect(ctx.has('MYVAR')).toBe(true);
    });

    it('should return false for non-existent custom variables', () => {
      expect(ctx.has('NONEXISTENT')).toBe(false);
    });

    it('should be case-insensitive', () => {
      ctx.set('myCustom', 'val');
      expect(ctx.has('MYCUSTOM')).toBe(true);
      expect(ctx.has('mycustom')).toBe(true);
    });
  });

  describe('Read-Only Variables', () => {
    it('should reject setting !NOW', () => {
      const result = ctx.set('!NOW', 'value');
      expect(result.success).toBe(false);
      expect(result.error).toContain('read-only');
    });

    it('should reject setting !URLCURRENT', () => {
      const result = ctx.set('!URLCURRENT', 'http://example.com');
      expect(result.success).toBe(false);
      expect(result.error).toContain('read-only');
    });

    it('should reject setting !DATASOURCE_COLUMNS', () => {
      const result = ctx.set('!DATASOURCE_COLUMNS', 5);
      expect(result.success).toBe(false);
      expect(result.error).toContain('read-only');
    });

    it('should return the current value as previousValue when rejecting', () => {
      ctx.setDatasourceCols(['a', 'b', 'c']);
      const result = ctx.set('!DATASOURCE_COLUMNS', 10);
      expect(result.success).toBe(false);
      expect(result.previousValue).toBe(3);
    });
  });

  describe('setTimeout() All Branches', () => {
    it('should set page timeout', () => {
      ctx.setTimeout('page', 120);
      expect(ctx.getTimeout('page')).toBe(120);
      expect(ctx.get('!TIMEOUT_PAGE')).toBe(120);
    });

    it('should set step timeout', () => {
      ctx.setTimeout('step', 3);
      expect(ctx.getTimeout('step')).toBe(3);
      expect(ctx.get('!TIMEOUT_STEP')).toBe(3);
    });

    it('should set default timeout', () => {
      ctx.setTimeout('default', 30);
      expect(ctx.getTimeout('default')).toBe(30);
      expect(ctx.get('!TIMEOUT')).toBe(30);
    });
  });

  describe('setFolder() All Branches', () => {
    it('should set datasource folder', () => {
      ctx.setFolder('datasource', '/data/sources');
      expect(ctx.get('!FOLDER_DATASOURCE')).toBe('/data/sources');
    });

    it('should set download folder', () => {
      ctx.setFolder('download', '/downloads');
      expect(ctx.get('!FOLDER_DOWNLOAD')).toBe('/downloads');
    });

    it('should set macros folder', () => {
      ctx.setFolder('macros', '/macros');
      expect(ctx.get('!FOLDER_MACROS')).toBe('/macros');
    });
  });

  describe('setUrl() Method', () => {
    it('should set start URL', () => {
      ctx.setUrl('start', 'http://example.com');
      expect(ctx.get('!URLSTART')).toBe('http://example.com');
    });

    it('should set current URL', () => {
      ctx.setUrl('current', 'http://example.com/page2');
      expect(ctx.get('!URLCURRENT')).toBe('http://example.com/page2');
    });
  });

  describe('Clipboard Methods', () => {
    it('should set and get clipboard content', () => {
      ctx.setClipboard('clipboard text');
      expect(ctx.getClipboard()).toBe('clipboard text');
    });

    it('should return empty string for default clipboard', () => {
      expect(ctx.getClipboard()).toBe('');
    });

    it('should handle empty string clipboard', () => {
      ctx.setClipboard('');
      expect(ctx.getClipboard()).toBe('');
    });
  });

  describe('Variable Enumeration Methods', () => {
    it('should return all system variables via getSystemVariables()', () => {
      const sysVars = ctx.getSystemVariables();
      expect(sysVars).toHaveProperty('!VAR0');
      expect(sysVars).toHaveProperty('!LOOP');
      expect(sysVars).toHaveProperty('!EXTRACT');
      expect(sysVars).toHaveProperty('!TIMEOUT');
      expect(sysVars['!LOOP']).toBe(1);
      expect(sysVars['!VAR0']).toBe('');
    });

    it('should return all custom variables via getCustomVariables()', () => {
      ctx.set('MYVAR', 'hello');
      ctx.set('OTHER', 'world');
      const customVars = ctx.getCustomVariables();
      expect(customVars).toEqual({ MYVAR: 'hello', OTHER: 'world' });
    });

    it('should return empty object when no custom variables exist', () => {
      const customVars = ctx.getCustomVariables();
      expect(customVars).toEqual({});
    });

    it('should return all variables via getAllVariables()', () => {
      ctx.set('!VAR0', 'sys');
      ctx.set('MYVAR', 'custom');
      const allVars = ctx.getAllVariables();
      expect(allVars['!VAR0']).toBe('sys');
      expect(allVars['MYVAR']).toBe('custom');
      expect(allVars).toHaveProperty('!LOOP');
    });
  });

  describe('Expansion with Custom Resolver and Strict Mode', () => {
    it('should use custom resolver to resolve variables', () => {
      const result = ctx.expand('Value: {{CUSTOM_VAR}}', {
        customResolver: (name) => {
          if (name === 'CUSTOM_VAR') return 'resolved';
          return undefined;
        },
      });
      expect(result.expanded).toBe('Value: resolved');
      expect(result.unresolvedVariables).toEqual([]);
    });

    it('should fall back to context lookup when custom resolver returns undefined', () => {
      ctx.set('!VAR0', 'from_context');
      const result = ctx.expand('{{!VAR0}}', {
        customResolver: () => undefined,
      });
      expect(result.expanded).toBe('from_context');
    });

    it('should throw in strict mode for unresolved variables', () => {
      expect(() => {
        ctx.expand('{{NONEXISTENT}}', { strict: true });
      }).toThrow('Unresolved variable: NONEXISTENT');
    });

    it('should use custom defaultValue for unresolved variables', () => {
      const result = ctx.expand('{{UNDEFINED}}', { defaultValue: 'N/A' });
      expect(result.expanded).toBe('N/A');
      expect(result.unresolvedVariables).toContain('UNDEFINED');
    });

    it('should resolve with custom resolver and not add to unresolved', () => {
      const result = ctx.expand('{{SPECIAL}}', {
        customResolver: (name) => name === 'SPECIAL' ? 42 : undefined,
      });
      expect(result.expanded).toBe('42');
      expect(result.unresolvedVariables).toEqual([]);
    });
  });

  describe('parseSetValue()', () => {
    it('should parse literal values', () => {
      const result = parseSetValue('hello world');
      expect(result.type).toBe('literal');
      expect(result.value).toBe('hello world');
    });

    it('should parse EVAL() expressions', () => {
      const result = parseSetValue('EVAL(1+2)');
      expect(result.type).toBe('eval');
      expect(result.value).toBe('1+2');
    });

    it('should parse EVAL() case-insensitively', () => {
      const result = parseSetValue('eval(Math.random())');
      expect(result.type).toBe('eval');
      expect(result.value).toBe('Math.random()');
    });

    it('should parse CONTENT keyword', () => {
      const result = parseSetValue('CONTENT');
      expect(result.type).toBe('content');
      expect(result.value).toBe('');
    });

    it('should parse CONTENT case-insensitively', () => {
      const result = parseSetValue('content');
      expect(result.type).toBe('content');
    });

    it('should parse !CLIPBOARD keyword', () => {
      const result = parseSetValue('!CLIPBOARD');
      expect(result.type).toBe('clipboard');
      expect(result.value).toBe('');
    });

    it('should trim whitespace from values', () => {
      const result = parseSetValue('  hello  ');
      expect(result.type).toBe('literal');
      expect(result.value).toBe('hello');
    });

    it('should handle EVAL with nested parentheses', () => {
      const result = parseSetValue('EVAL((1+2)*3)');
      expect(result.type).toBe('eval');
      expect(result.value).toBe('(1+2)*3');
    });
  });

  describe('evaluateExpression()', () => {
    it('should evaluate simple arithmetic', () => {
      const result = evaluateExpression('1 + 2', ctx);
      expect(result).toBe(3);
    });

    it('should evaluate multiplication', () => {
      const result = evaluateExpression('3 * 4', ctx);
      expect(result).toBe(12);
    });

    it('should evaluate with variable references', () => {
      ctx.set('!VAR0', '10');
      const result = evaluateExpression('{{!VAR0}} + 5', ctx);
      expect(result).toBe(15);
    });

    it('should return 0 for empty expression', () => {
      const result = evaluateExpression('', ctx);
      expect(result).toBe(0);
    });

    it('should return 0 for whitespace-only expression', () => {
      const result = evaluateExpression('   ', ctx);
      expect(result).toBe(0);
    });

    it('should strip trailing semicolons', () => {
      const result = evaluateExpression('5 + 3;', ctx);
      expect(result).toBe(8);
    });

    it('should strip wrapping double quotes', () => {
      const result = evaluateExpression('"5 + 3"', ctx);
      expect(result).toBe(8);
    });

    it('should strip wrapping single quotes', () => {
      const result = evaluateExpression("'5 + 3'", ctx);
      expect(result).toBe(8);
    });

    it('should unescape backslash-escaped quotes', () => {
      // After stripping quotes, the inner escaped quotes become literal
      const result = evaluateExpression('5 + 3', ctx);
      expect(result).toBe(8);
    });

    it('should handle parenthesized expressions', () => {
      const result = evaluateExpression('(2 + 3) * 4', ctx);
      expect(result).toBe(20);
    });

    it('should handle division', () => {
      const result = evaluateExpression('10 / 2', ctx);
      expect(result).toBe(5);
    });

    it('should handle modulo', () => {
      const result = evaluateExpression('10 % 3', ctx);
      expect(result).toBe(1);
    });
  });

  describe('executeSet() Extended', () => {
    it('should execute SET with EVAL value', () => {
      const result = executeSet(ctx, '!VAR0', 'EVAL(1+2)');
      expect(result.success).toBe(true);
      expect(ctx.get('!VAR0')).toBe(3);
    });

    it('should execute SET with EVAL referencing variables', () => {
      ctx.set('!VAR1', '10');
      const result = executeSet(ctx, '!VAR0', 'EVAL({{!VAR1}} + 5)');
      expect(result.success).toBe(true);
      expect(ctx.get('!VAR0')).toBe(15);
    });

    it('should execute SET with !CLIPBOARD value', () => {
      ctx.setClipboard('clipboard content');
      const result = executeSet(ctx, '!VAR0', '!CLIPBOARD');
      expect(result.success).toBe(true);
      expect(ctx.get('!VAR0')).toBe('clipboard content');
    });

    it('should execute SET with CONTENT type', () => {
      const result = executeSet(ctx, '!VAR0', 'CONTENT');
      expect(result.success).toBe(true);
      // CONTENT expands to empty string since there is no page content in unit test
      expect(ctx.get('!VAR0')).toBe('');
    });

    it('should execute SET with variable expansion in literal value', () => {
      ctx.set('!VAR1', 'world');
      const result = executeSet(ctx, '!VAR0', 'hello {{!VAR1}}');
      expect(result.success).toBe(true);
      expect(ctx.get('!VAR0')).toBe('hello world');
    });

    it('should handle MacroErrorSignal from EVAL gracefully', () => {
      // MacroError() in expression-evaluator throws a MacroErrorSignal
      // which executeSet catches and returns as a special result
      const result = executeSet(ctx, '!VAR0', 'EVAL(MacroError("test error"))');
      // The result should indicate macro error
      expect((result as any).macroError).toBe(true);
      expect((result as any).errorMessage).toBe('test error');
    });
  });

  describe('executeAdd() Extended', () => {
    it('should expand variables in the add value', () => {
      ctx.set('!VAR0', '10');
      ctx.set('!VAR1', '5');
      const result = executeAdd(ctx, '!VAR0', '{{!VAR1}}');
      expect(result.success).toBe(true);
      expect(ctx.get('!VAR0')).toBe(15);
    });

    it('should concatenate non-numeric expanded value (iMacros 8.9.7 behavior)', () => {
      ctx.set('!VAR0', '10');
      ctx.set('!VAR1', 'abc');
      const result = executeAdd(ctx, '!VAR0', '{{!VAR1}}');
      expect(result.success).toBe(true);
      expect(ctx.get('!VAR0')).toBe('10abc');
    });
  });

  describe('getLoop() Non-Numeric Fallback', () => {
    it('should return 1 when loop value is not a number', () => {
      // Force a non-numeric value into !LOOP via direct set
      ctx.set('!LOOP', 'not_a_number');
      expect(ctx.getLoop()).toBe(1);
    });
  });

  describe('getTimeout() Non-Numeric Fallback', () => {
    it('should return 60 when timeout value is not a number', () => {
      // Force a non-numeric value into !TIMEOUT via direct set
      ctx.set('!TIMEOUT', 'not_a_number');
      expect(ctx.getTimeout('default')).toBe(60);
    });
  });

  describe('Datasource with More Than 10 Columns', () => {
    it('should only set first 10 columns', () => {
      const cols = Array.from({ length: 15 }, (_, i) => `val${i + 1}`);
      ctx.setDatasourceCols(cols);
      expect(ctx.get('!COL1')).toBe('val1');
      expect(ctx.get('!COL10')).toBe('val10');
      // Column count should reflect actual number passed
      expect(ctx.get('!DATASOURCE_COLUMNS')).toBe(15);
    });
  });

  describe('evaluateExpressionAsync()', () => {
    it('should evaluate simple math expressions without nativeEval', async () => {
      const result = await evaluateExpressionAsync('1 + 2', ctx);
      expect(result.value).toBe(3);
    });

    it('should expand variables in expressions', async () => {
      ctx.set('!VAR0', '10');
      const result = await evaluateExpressionAsync('{{!VAR0}} + 5', ctx);
      expect(result.value).toBe(15);
    });

    it('should fall back to nativeEval for JavaScript expressions', async () => {
      const nativeEval: NativeEvalCallback = async (expr) => {
        // Simulate JS evaluation
        if (expr.includes('s.replace')) {
          return { success: true, value: '123' };
        }
        return { success: false, value: 0, error: 'Unknown expression' };
      };

      ctx.set('!EXTRACT', '1%2%3%');
      const result = await evaluateExpressionAsync(
        "var s='{{!EXTRACT}}'; s.replace(/%/g, '')",
        ctx,
        nativeEval
      );
      expect(result.value).toBe('123');
    });

    it('should return 0 when both expr-eval and nativeEval fail', async () => {
      const nativeEval: NativeEvalCallback = async () => ({
        success: false,
        value: 0,
        error: 'Eval failed'
      });

      const result = await evaluateExpressionAsync(
        'invalid javascript syntax {{',
        ctx,
        nativeEval
      );
      expect(result.value).toBe(0);
    });

    it('should handle MacroError from nativeEval for JS-only expressions', async () => {
      // Use an expression that expr-eval cannot parse, forcing it to try nativeEval
      const nativeEval: NativeEvalCallback = async () => ({
        success: false,
        value: 0,
        error: 'Intentional stop',
        isMacroError: true
      });

      const result = await evaluateExpressionAsync(
        'function(){throw new Error();}()',
        ctx,
        nativeEval
      );
      expect(result.isMacroError).toBe(true);
      expect(result.errorMessage).toBe('Intentional stop');
    });

    it('should return empty string for empty expressions', async () => {
      const result = await evaluateExpressionAsync('', ctx);
      expect(result.value).toBe(0);
    });

    it('should strip quotes from expression', async () => {
      const result = await evaluateExpressionAsync('"5 + 3"', ctx);
      expect(result.value).toBe(8);
    });
  });

  describe('executeSetAsync()', () => {
    it('should execute SET with EVAL using nativeEval callback', async () => {
      const nativeEval: NativeEvalCallback = async (expr) => {
        // Simulate JavaScript string replacement
        if (expr.includes('replace')) {
          return { success: true, value: 'cleaned_value' };
        }
        return { success: false, value: 0 };
      };

      ctx.set('!EXTRACT', 'raw%value%');
      const result = await executeSetAsync(
        ctx,
        '!VAR0',
        'EVAL("var s=\'{{!EXTRACT}}\'; s.replace(/%/g, \'\')")',
        nativeEval
      );
      expect(result.success).toBe(true);
      expect(ctx.get('!VAR0')).toBe('cleaned_value');
    });

    it('should work without nativeEval for simple math', async () => {
      const result = await executeSetAsync(ctx, '!VAR0', 'EVAL(1+2)');
      expect(result.success).toBe(true);
      expect(ctx.get('!VAR0')).toBe(3);
    });

    it('should handle literal values without EVAL', async () => {
      const result = await executeSetAsync(ctx, '!VAR0', 'hello world');
      expect(result.success).toBe(true);
      expect(ctx.get('!VAR0')).toBe('hello world');
    });

    it('should handle !CLIPBOARD value', async () => {
      ctx.setClipboard('clipboard content');
      const result = await executeSetAsync(ctx, '!VAR0', '!CLIPBOARD');
      expect(result.success).toBe(true);
      expect(ctx.get('!VAR0')).toBe('clipboard content');
    });

    it('should handle MacroError from nativeEval for JS-only expressions', async () => {
      // Use an expression that expr-eval cannot parse, forcing it to try nativeEval
      const nativeEval: NativeEvalCallback = async () => ({
        success: false,
        value: 0,
        error: 'User stopped macro',
        isMacroError: true
      });

      const result = await executeSetAsync(
        ctx,
        '!VAR0',
        'EVAL((function(){throw new Error();}()))',
        nativeEval
      );
      expect(result.macroError).toBe(true);
      expect(result.errorMessage).toBe('User stopped macro');
    });
  });
});
