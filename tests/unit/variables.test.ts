/**
 * Unit Tests for iMacros Variable System
 *
 * Tests built-in variables (!VAR0-9), custom variables, !EXTRACT, !LOOP,
 * !DATASOURCE, variable expansion in commands, ADD operations, and edge cases.
 *
 * Uses the real VariableContext from shared/src/variables.ts.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  VariableContext,
  createVariableContext,
  executeSet,
  executeAdd,
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

  describe('!EXTRACT Variable', () => {
    it('should start with empty extract', () => {
      expect(ctx.getExtractArray()).toEqual([]);
      expect(ctx.get('!EXTRACT')).toBe('');
    });

    it('should accumulate values when setting !EXTRACT', () => {
      ctx.set('!EXTRACT', 'value1');
      expect(ctx.getExtractArray()).toEqual(['value1']);
    });

    it('should accumulate multiple extract values', () => {
      ctx.set('!EXTRACT', 'first');
      ctx.set('!EXTRACT', 'second');
      ctx.set('!EXTRACT', 'third');
      expect(ctx.getExtractArray()).toEqual(['first', 'second', 'third']);
    });

    it('should return extract values joined with [EXTRACT] via getExtractAdd', () => {
      ctx.set('!EXTRACT', 'one');
      ctx.set('!EXTRACT', 'two');
      ctx.set('!EXTRACT', 'three');
      expect(ctx.getExtractAdd()).toBe('one[EXTRACT]two[EXTRACT]three');
    });

    it('should return the latest set value via get(!EXTRACT)', () => {
      ctx.set('!EXTRACT', 'first');
      ctx.set('!EXTRACT', 'second');
      // get('!EXTRACT') returns the last SET value, not the joined string
      expect(ctx.get('!EXTRACT')).toBe('second');
    });

    it('should clear extract values on resetExtract', () => {
      ctx.set('!EXTRACT', 'value');
      ctx.resetExtract();
      expect(ctx.getExtractArray()).toEqual([]);
      expect(ctx.get('!EXTRACT')).toBe('');
    });

    it('should handle empty string extracts', () => {
      ctx.set('!EXTRACT', '');
      ctx.set('!EXTRACT', 'value');
      ctx.set('!EXTRACT', '');
      expect(ctx.getExtractArray()).toEqual(['', 'value', '']);
    });

    it('should handle special characters in extract values', () => {
      ctx.set('!EXTRACT', '<html>');
      ctx.set('!EXTRACT', 'a & b');
      ctx.set('!EXTRACT', '"quoted"');
      expect(ctx.getExtractArray()).toEqual(['<html>', 'a & b', '"quoted"']);
    });

    it('should handle newlines in extract values', () => {
      ctx.set('!EXTRACT', 'line1\nline2');
      expect(ctx.getExtractArray()).toEqual(['line1\nline2']);
    });

    it('should handle unicode in extract values', () => {
      ctx.set('!EXTRACT', 'Hello \u4e16\u754c');
      ctx.set('!EXTRACT', '\ud83d\ude00');
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
      ctx.add('!VAR0', 5);
      // add() stores result as number
      expect(ctx.get('!VAR0')).toBe(15);
    });

    it('should add negative number', () => {
      ctx.set('!VAR0', '10');
      ctx.add('!VAR0', -3);
      expect(ctx.get('!VAR0')).toBe(7);
    });

    it('should add to empty variable (treated as 0)', () => {
      ctx.add('!VAR0', 5);
      expect(ctx.get('!VAR0')).toBe(5);
    });

    it('should add decimal numbers', () => {
      ctx.set('!VAR0', '10.5');
      ctx.add('!VAR0', 2.3);
      expect(ctx.get('!VAR0')).toBeCloseTo(12.8);
    });

    it('should add to custom variable', () => {
      ctx.set('COUNTER', '100');
      ctx.add('COUNTER', 50);
      expect(ctx.get('COUNTER')).toBe(150);
    });

    it('should handle adding zero', () => {
      ctx.set('!VAR0', '42');
      ctx.add('!VAR0', 0);
      expect(ctx.get('!VAR0')).toBe(42);
    });

    it('should handle large numbers', () => {
      ctx.set('!VAR0', '1000000000');
      ctx.add('!VAR0', 1);
      expect(ctx.get('!VAR0')).toBe(1000000001);
    });

    it('should handle negative results', () => {
      ctx.set('!VAR0', '5');
      ctx.add('!VAR0', -10);
      expect(ctx.get('!VAR0')).toBe(-5);
    });

    it('should be case-insensitive for variable name', () => {
      ctx.set('!var0', '10');
      ctx.add('!VAR0', 5);
      expect(ctx.get('!var0')).toBe(15);
    });

    it('should create new variable if not exists and add', () => {
      ctx.add('NEWVAR', 10);
      expect(ctx.get('NEWVAR')).toBe(10);
    });

    it('should return AddResult with details', () => {
      ctx.set('!VAR0', '10');
      const result = ctx.add('!VAR0', 5);
      expect(result.success).toBe(true);
      expect(result.previousValue).toBe('10');
      expect(result.addedValue).toBe(5);
      expect(result.newValue).toBe(15);
    });

    it('should return error for non-numeric value', () => {
      ctx.set('!VAR0', 'hello');
      const result = ctx.add('!VAR0', 5);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
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

    it('should execute ADD with invalid numeric string', () => {
      const result = executeAdd(ctx, '!VAR0', 'not_a_number');
      expect(result.success).toBe(false);
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

      it('should handle rapid extract additions', () => {
        for (let i = 0; i < 100; i++) {
          ctx.set('!EXTRACT', `item${i}`);
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

      it('should import variables from a record', () => {
        ctx.importVariables({ '!VAR0': 'imported', 'MYVAR': 'val' });
        expect(ctx.get('!VAR0')).toBe('imported');
        expect(ctx.get('MYVAR')).toBe('val');
      });
    });
  });
});
