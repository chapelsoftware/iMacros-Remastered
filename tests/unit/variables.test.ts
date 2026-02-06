/**
 * Unit Tests for iMacros Variable System
 *
 * Tests built-in variables (!VAR0-9), custom variables, !EXTRACT, !LOOP,
 * !DATASOURCE, variable expansion in commands, ADD operations, and edge cases.
 */
import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Variable store class that manages iMacros variables
 * This represents the expected behavior of the iMacros variable system
 */
class VariableStore {
  private builtInVars: Map<string, string> = new Map();
  private customVars: Map<string, string> = new Map();
  private extract: string[] = [];
  private loopCounter: number = 1;
  private datasource: string[][] = [];
  private datasourceRow: number = 1;

  constructor() {
    // Initialize built-in VAR0-9 with empty strings
    for (let i = 0; i <= 9; i++) {
      this.builtInVars.set(`!VAR${i}`, '');
    }
  }

  /**
   * Set a variable value
   */
  set(name: string, value: string): void {
    const upperName = name.toUpperCase();
    if (this.isBuiltIn(upperName)) {
      this.builtInVars.set(upperName, value);
    } else {
      this.customVars.set(upperName, value);
    }
  }

  /**
   * Get a variable value
   */
  get(name: string): string | undefined {
    const upperName = name.toUpperCase();

    // Check special variables first
    if (upperName === '!LOOP') {
      return String(this.loopCounter);
    }
    if (upperName === '!EXTRACT') {
      return this.extract.join('[EXTRACT]');
    }
    if (upperName.startsWith('!COL')) {
      const col = parseInt(upperName.slice(4), 10);
      if (!isNaN(col) && col >= 1 && this.datasource.length > 0) {
        const row = this.datasource[this.datasourceRow - 1];
        if (row && col <= row.length) {
          return row[col - 1];
        }
      }
      return undefined;
    }

    // Check built-in variables
    if (this.builtInVars.has(upperName)) {
      return this.builtInVars.get(upperName);
    }

    // Check custom variables
    return this.customVars.get(upperName);
  }

  /**
   * Check if a variable name is built-in
   */
  isBuiltIn(name: string): boolean {
    return /^!VAR[0-9]$/.test(name.toUpperCase());
  }

  /**
   * Add a numeric value to a variable
   */
  add(name: string, value: number): void {
    const upperName = name.toUpperCase();
    const currentValue = this.get(upperName);
    const numericValue = currentValue ? parseFloat(currentValue) : 0;
    if (!isNaN(numericValue)) {
      this.set(upperName, String(numericValue + value));
    }
  }

  /**
   * Add to extract array
   */
  addExtract(value: string): void {
    this.extract.push(value);
  }

  /**
   * Clear extract array
   */
  clearExtract(): void {
    this.extract = [];
  }

  /**
   * Get extract array
   */
  getExtract(): string[] {
    return [...this.extract];
  }

  /**
   * Set loop counter
   */
  setLoop(value: number): void {
    this.loopCounter = value;
  }

  /**
   * Increment loop counter
   */
  incrementLoop(): void {
    this.loopCounter++;
  }

  /**
   * Get loop counter
   */
  getLoop(): number {
    return this.loopCounter;
  }

  /**
   * Load datasource data
   */
  loadDatasource(data: string[][]): void {
    this.datasource = data;
    this.datasourceRow = 1;
  }

  /**
   * Set datasource row
   */
  setDatasourceRow(row: number): void {
    this.datasourceRow = row;
  }

  /**
   * Get current datasource row
   */
  getDatasourceRow(): number {
    return this.datasourceRow;
  }

  /**
   * Expand variables in a string
   * Replaces {{varname}} with variable values
   */
  expand(text: string): string {
    return text.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
      const value = this.get(varName.trim());
      return value !== undefined ? value : match;
    });
  }

  /**
   * Clear all custom variables
   */
  clearCustom(): void {
    this.customVars.clear();
  }

  /**
   * Reset all variables to initial state
   */
  reset(): void {
    for (let i = 0; i <= 9; i++) {
      this.builtInVars.set(`!VAR${i}`, '');
    }
    this.customVars.clear();
    this.extract = [];
    this.loopCounter = 1;
    this.datasource = [];
    this.datasourceRow = 1;
  }
}

describe('Variable System Unit Tests', () => {
  let store: VariableStore;

  beforeEach(() => {
    store = new VariableStore();
  });

  describe('Built-in Variables (!VAR0-9)', () => {
    it('should initialize all built-in variables to empty strings', () => {
      for (let i = 0; i <= 9; i++) {
        expect(store.get(`!VAR${i}`)).toBe('');
      }
    });

    it('should set and get !VAR0', () => {
      store.set('!VAR0', 'test value');
      expect(store.get('!VAR0')).toBe('test value');
    });

    it('should set and get !VAR9', () => {
      store.set('!VAR9', 'last var');
      expect(store.get('!VAR9')).toBe('last var');
    });

    it('should handle all built-in variables independently', () => {
      for (let i = 0; i <= 9; i++) {
        store.set(`!VAR${i}`, `value${i}`);
      }
      for (let i = 0; i <= 9; i++) {
        expect(store.get(`!VAR${i}`)).toBe(`value${i}`);
      }
    });

    it('should be case-insensitive for built-in variable names', () => {
      store.set('!var0', 'lower');
      expect(store.get('!VAR0')).toBe('lower');
      expect(store.get('!var0')).toBe('lower');
      expect(store.get('!Var0')).toBe('lower');
    });

    it('should correctly identify built-in variables', () => {
      expect(store.isBuiltIn('!VAR0')).toBe(true);
      expect(store.isBuiltIn('!VAR9')).toBe(true);
      expect(store.isBuiltIn('!var5')).toBe(true);
      expect(store.isBuiltIn('!VAR10')).toBe(false);
      expect(store.isBuiltIn('MYVAR')).toBe(false);
      expect(store.isBuiltIn('!LOOP')).toBe(false);
    });

    it('should overwrite existing built-in variable values', () => {
      store.set('!VAR0', 'first');
      store.set('!VAR0', 'second');
      expect(store.get('!VAR0')).toBe('second');
    });

    it('should handle numeric string values in built-in variables', () => {
      store.set('!VAR0', '12345');
      expect(store.get('!VAR0')).toBe('12345');
    });

    it('should handle special characters in built-in variable values', () => {
      store.set('!VAR0', 'hello<world>&"test\'');
      expect(store.get('!VAR0')).toBe('hello<world>&"test\'');
    });
  });

  describe('Custom Variables', () => {
    it('should set and get custom variables', () => {
      store.set('MYVAR', 'custom value');
      expect(store.get('MYVAR')).toBe('custom value');
    });

    it('should return undefined for non-existent custom variables', () => {
      expect(store.get('NONEXISTENT')).toBeUndefined();
    });

    it('should be case-insensitive for custom variable names', () => {
      store.set('MyCustomVar', 'value');
      expect(store.get('MYCUSTOMVAR')).toBe('value');
      expect(store.get('mycustomvar')).toBe('value');
      expect(store.get('MyCustomVar')).toBe('value');
    });

    it('should handle multiple custom variables', () => {
      store.set('VAR_A', 'a');
      store.set('VAR_B', 'b');
      store.set('VAR_C', 'c');
      expect(store.get('VAR_A')).toBe('a');
      expect(store.get('VAR_B')).toBe('b');
      expect(store.get('VAR_C')).toBe('c');
    });

    it('should overwrite existing custom variable values', () => {
      store.set('MYVAR', 'original');
      store.set('MYVAR', 'updated');
      expect(store.get('MYVAR')).toBe('updated');
    });

    it('should handle long variable names', () => {
      const longName = 'THIS_IS_A_VERY_LONG_VARIABLE_NAME_THAT_EXCEEDS_NORMAL_LENGTH';
      store.set(longName, 'value');
      expect(store.get(longName)).toBe('value');
    });

    it('should handle variable names with underscores', () => {
      store.set('MY_VAR_NAME', 'value');
      expect(store.get('MY_VAR_NAME')).toBe('value');
    });

    it('should clear custom variables', () => {
      store.set('MYVAR', 'value');
      store.clearCustom();
      expect(store.get('MYVAR')).toBeUndefined();
    });

    it('should not clear built-in variables when clearing custom', () => {
      store.set('!VAR0', 'builtin');
      store.set('MYVAR', 'custom');
      store.clearCustom();
      expect(store.get('!VAR0')).toBe('builtin');
      expect(store.get('MYVAR')).toBeUndefined();
    });
  });

  describe('!EXTRACT Variable', () => {
    it('should start with empty extract', () => {
      expect(store.getExtract()).toEqual([]);
      expect(store.get('!EXTRACT')).toBe('');
    });

    it('should add values to extract', () => {
      store.addExtract('value1');
      expect(store.getExtract()).toEqual(['value1']);
    });

    it('should accumulate multiple extract values', () => {
      store.addExtract('first');
      store.addExtract('second');
      store.addExtract('third');
      expect(store.getExtract()).toEqual(['first', 'second', 'third']);
    });

    it('should return extract values joined with [EXTRACT]', () => {
      store.addExtract('one');
      store.addExtract('two');
      store.addExtract('three');
      expect(store.get('!EXTRACT')).toBe('one[EXTRACT]two[EXTRACT]three');
    });

    it('should clear extract values', () => {
      store.addExtract('value');
      store.clearExtract();
      expect(store.getExtract()).toEqual([]);
      expect(store.get('!EXTRACT')).toBe('');
    });

    it('should handle empty string extracts', () => {
      store.addExtract('');
      store.addExtract('value');
      store.addExtract('');
      expect(store.getExtract()).toEqual(['', 'value', '']);
    });

    it('should handle special characters in extract values', () => {
      store.addExtract('<html>');
      store.addExtract('a & b');
      store.addExtract('"quoted"');
      expect(store.getExtract()).toEqual(['<html>', 'a & b', '"quoted"']);
    });

    it('should handle newlines in extract values', () => {
      store.addExtract('line1\nline2');
      expect(store.getExtract()).toEqual(['line1\nline2']);
    });

    it('should handle unicode in extract values', () => {
      store.addExtract('Hello \u4e16\u754c');
      store.addExtract('\ud83d\ude00');
      expect(store.getExtract()).toEqual(['Hello \u4e16\u754c', '\ud83d\ude00']);
    });
  });

  describe('!LOOP Counter', () => {
    it('should start with loop counter at 1', () => {
      expect(store.getLoop()).toBe(1);
      expect(store.get('!LOOP')).toBe('1');
    });

    it('should set loop counter', () => {
      store.setLoop(5);
      expect(store.getLoop()).toBe(5);
      expect(store.get('!LOOP')).toBe('5');
    });

    it('should increment loop counter', () => {
      store.incrementLoop();
      expect(store.getLoop()).toBe(2);
      store.incrementLoop();
      expect(store.getLoop()).toBe(3);
    });

    it('should return loop counter as string via get', () => {
      store.setLoop(100);
      expect(store.get('!LOOP')).toBe('100');
    });

    it('should handle large loop values', () => {
      store.setLoop(1000000);
      expect(store.getLoop()).toBe(1000000);
      expect(store.get('!LOOP')).toBe('1000000');
    });

    it('should be case-insensitive for !LOOP', () => {
      store.setLoop(42);
      expect(store.get('!loop')).toBe('42');
      expect(store.get('!LOOP')).toBe('42');
      expect(store.get('!Loop')).toBe('42');
    });

    it('should handle zero loop value', () => {
      store.setLoop(0);
      expect(store.getLoop()).toBe(0);
      expect(store.get('!LOOP')).toBe('0');
    });

    it('should handle negative loop values', () => {
      store.setLoop(-1);
      expect(store.getLoop()).toBe(-1);
      expect(store.get('!LOOP')).toBe('-1');
    });
  });

  describe('!DATASOURCE Variables', () => {
    const testData = [
      ['a1', 'b1', 'c1'],
      ['a2', 'b2', 'c2'],
      ['a3', 'b3', 'c3'],
    ];

    it('should load datasource data', () => {
      store.loadDatasource(testData);
      expect(store.getDatasourceRow()).toBe(1);
    });

    it('should access columns with !COL1, !COL2, etc.', () => {
      store.loadDatasource(testData);
      expect(store.get('!COL1')).toBe('a1');
      expect(store.get('!COL2')).toBe('b1');
      expect(store.get('!COL3')).toBe('c1');
    });

    it('should change datasource row', () => {
      store.loadDatasource(testData);
      store.setDatasourceRow(2);
      expect(store.get('!COL1')).toBe('a2');
      expect(store.get('!COL2')).toBe('b2');
    });

    it('should access last row', () => {
      store.loadDatasource(testData);
      store.setDatasourceRow(3);
      expect(store.get('!COL1')).toBe('a3');
    });

    it('should return undefined for out-of-range column', () => {
      store.loadDatasource(testData);
      expect(store.get('!COL4')).toBeUndefined();
      expect(store.get('!COL0')).toBeUndefined();
    });

    it('should return undefined for out-of-range row', () => {
      store.loadDatasource(testData);
      store.setDatasourceRow(4);
      expect(store.get('!COL1')).toBeUndefined();
    });

    it('should return undefined when no datasource loaded', () => {
      expect(store.get('!COL1')).toBeUndefined();
    });

    it('should be case-insensitive for !COL', () => {
      store.loadDatasource(testData);
      expect(store.get('!col1')).toBe('a1');
      expect(store.get('!COL1')).toBe('a1');
      expect(store.get('!Col1')).toBe('a1');
    });

    it('should handle datasource with varying row lengths', () => {
      const unevenData = [
        ['a', 'b', 'c'],
        ['d', 'e'],
        ['f'],
      ];
      store.loadDatasource(unevenData);

      store.setDatasourceRow(1);
      expect(store.get('!COL3')).toBe('c');

      store.setDatasourceRow(2);
      expect(store.get('!COL3')).toBeUndefined();

      store.setDatasourceRow(3);
      expect(store.get('!COL2')).toBeUndefined();
    });

    it('should handle empty datasource', () => {
      store.loadDatasource([]);
      expect(store.get('!COL1')).toBeUndefined();
    });

    it('should handle datasource with empty strings', () => {
      store.loadDatasource([['', 'value', '']]);
      expect(store.get('!COL1')).toBe('');
      expect(store.get('!COL2')).toBe('value');
      expect(store.get('!COL3')).toBe('');
    });
  });

  describe('Variable Expansion in Commands', () => {
    it('should expand single variable', () => {
      store.set('!VAR0', 'world');
      const result = store.expand('Hello {{!VAR0}}');
      expect(result).toBe('Hello world');
    });

    it('should expand multiple variables', () => {
      store.set('!VAR0', 'John');
      store.set('!VAR1', 'Doe');
      const result = store.expand('Name: {{!VAR0}} {{!VAR1}}');
      expect(result).toBe('Name: John Doe');
    });

    it('should expand custom variables', () => {
      store.set('USERNAME', 'admin');
      const result = store.expand('User: {{USERNAME}}');
      expect(result).toBe('User: admin');
    });

    it('should expand !LOOP variable', () => {
      store.setLoop(5);
      const result = store.expand('Iteration: {{!LOOP}}');
      expect(result).toBe('Iteration: 5');
    });

    it('should expand !EXTRACT variable', () => {
      store.addExtract('extracted data');
      const result = store.expand('Data: {{!EXTRACT}}');
      expect(result).toBe('Data: extracted data');
    });

    it('should expand !COL variables', () => {
      store.loadDatasource([['user@example.com', 'password123']]);
      const result = store.expand('Login: {{!COL1}} / {{!COL2}}');
      expect(result).toBe('Login: user@example.com / password123');
    });

    it('should preserve unmatched variables', () => {
      const result = store.expand('Hello {{UNDEFINED}}');
      expect(result).toBe('Hello {{UNDEFINED}}');
    });

    it('should handle text without variables', () => {
      const result = store.expand('No variables here');
      expect(result).toBe('No variables here');
    });

    it('should handle empty string', () => {
      const result = store.expand('');
      expect(result).toBe('');
    });

    it('should handle adjacent variables', () => {
      store.set('A', 'Hello');
      store.set('B', 'World');
      const result = store.expand('{{A}}{{B}}');
      expect(result).toBe('HelloWorld');
    });

    it('should be case-insensitive for variable names in expansion', () => {
      store.set('MYVAR', 'value');
      expect(store.expand('{{myvar}}')).toBe('value');
      expect(store.expand('{{MYVAR}}')).toBe('value');
      expect(store.expand('{{MyVar}}')).toBe('value');
    });

    it('should handle variables with whitespace around name', () => {
      store.set('MYVAR', 'value');
      const result = store.expand('{{ MYVAR }}');
      expect(result).toBe('value');
    });

    it('should handle nested braces correctly', () => {
      store.set('VAR', 'test');
      const result = store.expand('{{VAR}} and {notavar}');
      expect(result).toBe('test and {notavar}');
    });

    it('should handle URLs with variables', () => {
      store.set('DOMAIN', 'example.com');
      store.set('PAGE', 'index.html');
      const result = store.expand('https://{{DOMAIN}}/{{PAGE}}');
      expect(result).toBe('https://example.com/index.html');
    });
  });

  describe('ADD Operations on Variables', () => {
    it('should add to numeric variable', () => {
      store.set('!VAR0', '10');
      store.add('!VAR0', 5);
      expect(store.get('!VAR0')).toBe('15');
    });

    it('should add negative number', () => {
      store.set('!VAR0', '10');
      store.add('!VAR0', -3);
      expect(store.get('!VAR0')).toBe('7');
    });

    it('should add to empty variable (treated as 0)', () => {
      store.add('!VAR0', 5);
      expect(store.get('!VAR0')).toBe('5');
    });

    it('should add decimal numbers', () => {
      store.set('!VAR0', '10.5');
      store.add('!VAR0', 2.3);
      expect(parseFloat(store.get('!VAR0') || '0')).toBeCloseTo(12.8);
    });

    it('should add to custom variable', () => {
      store.set('COUNTER', '100');
      store.add('COUNTER', 50);
      expect(store.get('COUNTER')).toBe('150');
    });

    it('should handle adding zero', () => {
      store.set('!VAR0', '42');
      store.add('!VAR0', 0);
      expect(store.get('!VAR0')).toBe('42');
    });

    it('should handle large numbers', () => {
      store.set('!VAR0', '1000000000');
      store.add('!VAR0', 1);
      expect(store.get('!VAR0')).toBe('1000000001');
    });

    it('should handle negative results', () => {
      store.set('!VAR0', '5');
      store.add('!VAR0', -10);
      expect(store.get('!VAR0')).toBe('-5');
    });

    it('should be case-insensitive for variable name', () => {
      store.set('!var0', '10');
      store.add('!VAR0', 5);
      expect(store.get('!var0')).toBe('15');
    });

    it('should create new variable if not exists and add', () => {
      store.add('NEWVAR', 10);
      expect(store.get('NEWVAR')).toBe('10');
    });
  });

  describe('Edge Cases', () => {
    describe('Undefined Variables', () => {
      it('should return undefined for undefined built-in range', () => {
        expect(store.get('!VAR10')).toBeUndefined();
        expect(store.get('!VAR99')).toBeUndefined();
      });

      it('should return undefined for undefined custom variable', () => {
        expect(store.get('UNDEFINED_VAR')).toBeUndefined();
      });

      it('should return undefined for invalid variable format', () => {
        expect(store.get('')).toBeUndefined();
      });
    });

    describe('Special Characters', () => {
      it('should handle special characters in variable values', () => {
        store.set('!VAR0', '<script>alert("xss")</script>');
        expect(store.get('!VAR0')).toBe('<script>alert("xss")</script>');
      });

      it('should handle newlines in variable values', () => {
        store.set('!VAR0', 'line1\nline2\nline3');
        expect(store.get('!VAR0')).toBe('line1\nline2\nline3');
      });

      it('should handle tabs in variable values', () => {
        store.set('!VAR0', 'col1\tcol2\tcol3');
        expect(store.get('!VAR0')).toBe('col1\tcol2\tcol3');
      });

      it('should handle unicode characters', () => {
        store.set('!VAR0', '\u4e2d\u6587');
        expect(store.get('!VAR0')).toBe('\u4e2d\u6587');
      });

      it('should handle emojis', () => {
        store.set('!VAR0', '\ud83d\ude00\ud83d\ude01\ud83d\ude02');
        expect(store.get('!VAR0')).toBe('\ud83d\ude00\ud83d\ude01\ud83d\ude02');
      });

      it('should handle null byte in value', () => {
        store.set('!VAR0', 'before\0after');
        expect(store.get('!VAR0')).toBe('before\0after');
      });

      it('should handle very long values', () => {
        const longValue = 'x'.repeat(100000);
        store.set('!VAR0', longValue);
        expect(store.get('!VAR0')).toBe(longValue);
      });
    });

    describe('Reset Behavior', () => {
      it('should reset all variables to initial state', () => {
        store.set('!VAR0', 'value');
        store.set('CUSTOM', 'value');
        store.addExtract('extracted');
        store.setLoop(10);
        store.loadDatasource([['a', 'b']]);
        store.setDatasourceRow(1);

        store.reset();

        expect(store.get('!VAR0')).toBe('');
        expect(store.get('CUSTOM')).toBeUndefined();
        expect(store.get('!EXTRACT')).toBe('');
        expect(store.get('!LOOP')).toBe('1');
        expect(store.get('!COL1')).toBeUndefined();
      });

      it('should reinitialize built-in vars after reset', () => {
        store.set('!VAR5', 'test');
        store.reset();
        for (let i = 0; i <= 9; i++) {
          expect(store.get(`!VAR${i}`)).toBe('');
        }
      });
    });

    describe('Concurrent Variable Access', () => {
      it('should handle rapid set/get operations', () => {
        for (let i = 0; i < 1000; i++) {
          store.set('!VAR0', `value${i}`);
          expect(store.get('!VAR0')).toBe(`value${i}`);
        }
      });

      it('should handle rapid loop increments', () => {
        for (let i = 0; i < 100; i++) {
          store.incrementLoop();
        }
        expect(store.getLoop()).toBe(101);
      });

      it('should handle rapid extract additions', () => {
        for (let i = 0; i < 100; i++) {
          store.addExtract(`item${i}`);
        }
        expect(store.getExtract().length).toBe(100);
      });
    });

    describe('Type Coercion', () => {
      it('should store numbers as strings', () => {
        store.set('!VAR0', '123');
        expect(typeof store.get('!VAR0')).toBe('string');
      });

      it('should handle boolean-like strings', () => {
        store.set('!VAR0', 'true');
        expect(store.get('!VAR0')).toBe('true');
        store.set('!VAR0', 'false');
        expect(store.get('!VAR0')).toBe('false');
      });

      it('should handle null-like strings', () => {
        store.set('!VAR0', 'null');
        expect(store.get('!VAR0')).toBe('null');
      });

      it('should handle undefined-like strings', () => {
        store.set('!VAR0', 'undefined');
        expect(store.get('!VAR0')).toBe('undefined');
      });
    });

    describe('Variable Name Edge Cases', () => {
      it('should handle variable names with numbers', () => {
        store.set('VAR123', 'value');
        expect(store.get('VAR123')).toBe('value');
      });

      it('should handle single character variable names', () => {
        store.set('X', 'value');
        expect(store.get('X')).toBe('value');
      });

      it('should handle variable names starting with underscore', () => {
        store.set('_PRIVATE', 'value');
        expect(store.get('_PRIVATE')).toBe('value');
      });

      it('should differentiate similar variable names', () => {
        store.set('VAR', 'a');
        store.set('VAR1', 'b');
        store.set('VAR12', 'c');
        expect(store.get('VAR')).toBe('a');
        expect(store.get('VAR1')).toBe('b');
        expect(store.get('VAR12')).toBe('c');
      });
    });

    describe('Expansion Edge Cases', () => {
      it('should handle malformed expansion syntax', () => {
        store.set('VAR', 'value');
        expect(store.expand('{VAR}')).toBe('{VAR}');
        expect(store.expand('{{VAR')).toBe('{{VAR');
        expect(store.expand('VAR}}')).toBe('VAR}}');
        // Triple braces: the regex tries to match {{...}} but with {{{VAR}}}
        // it matches the literal braces incorrectly, resulting in no match
        // This is expected behavior - malformed syntax is preserved
        expect(store.expand('{{{VAR}}}')).toBe('{{{VAR}}}');
      });

      it('should handle expansion with empty variable value', () => {
        store.set('EMPTY', '');
        expect(store.expand('before{{EMPTY}}after')).toBe('beforeafter');
      });

      it('should handle multiple occurrences of same variable', () => {
        store.set('X', 'val');
        expect(store.expand('{{X}}{{X}}{{X}}')).toBe('valvalval');
      });

      it('should handle special regex characters in variable values', () => {
        store.set('REGEX', '$1.*?+[]()');
        expect(store.expand('Pattern: {{REGEX}}')).toBe('Pattern: $1.*?+[]()');
      });
    });
  });
});
