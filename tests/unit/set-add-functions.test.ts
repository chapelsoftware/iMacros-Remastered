/**
 * Unit Tests for SET/ADD Helper Functions
 *
 * Tests parseSetValue, evaluateExpression, executeSet, and executeAdd
 * from shared/src/variables.ts.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseSetValue,
  evaluateExpression,
  executeSet,
  executeAdd,
  VariableContext,
} from '../../shared/src/variables';

describe('parseSetValue', () => {
  describe('literal values', () => {
    it('should parse a simple string as literal', () => {
      const result = parseSetValue('hello');
      expect(result.type).toBe('literal');
      expect(result.value).toBe('hello');
    });

    it('should parse a numeric string as literal', () => {
      const result = parseSetValue('42');
      expect(result.type).toBe('literal');
      expect(result.value).toBe('42');
    });

    it('should parse an empty string as literal', () => {
      const result = parseSetValue('');
      expect(result.type).toBe('literal');
      expect(result.value).toBe('');
    });

    it('should trim whitespace from literal values', () => {
      const result = parseSetValue('  hello  ');
      expect(result.type).toBe('literal');
      expect(result.value).toBe('hello');
    });

    it('should parse YES as literal', () => {
      const result = parseSetValue('YES');
      expect(result.type).toBe('literal');
      expect(result.value).toBe('YES');
    });

    it('should parse NO as literal', () => {
      const result = parseSetValue('NO');
      expect(result.type).toBe('literal');
      expect(result.value).toBe('NO');
    });
  });

  describe('EVAL expressions', () => {
    it('should detect EVAL() with simple expression', () => {
      const result = parseSetValue('EVAL("1+2")');
      expect(result.type).toBe('eval');
      expect(result.value).toBe('"1+2"');
    });

    it('should detect EVAL() case-insensitively', () => {
      const result = parseSetValue('eval("5*3")');
      expect(result.type).toBe('eval');
      expect(result.value).toBe('"5*3"');
    });

    it('should detect EVAL() with mixed case', () => {
      const result = parseSetValue('Eval("10/2")');
      expect(result.type).toBe('eval');
      expect(result.value).toBe('"10/2"');
    });

    it('should extract expression with variable references', () => {
      const result = parseSetValue('EVAL("{{!VAR1}}+1")');
      expect(result.type).toBe('eval');
      expect(result.value).toBe('"{{!VAR1}}+1"');
    });

    it('should extract complex expression', () => {
      const result = parseSetValue('EVAL("({{!VAR1}}+{{!VAR2}})*2")');
      expect(result.type).toBe('eval');
      expect(result.value).toBe('"({{!VAR1}}+{{!VAR2}})*2"');
    });

    it('should not match EVAL without parentheses', () => {
      const result = parseSetValue('EVAL');
      expect(result.type).toBe('literal');
      expect(result.value).toBe('EVAL');
    });

    it('should not match partial EVAL prefix', () => {
      const result = parseSetValue('EVALUATE("1+2")');
      // "EVALUATE" starts with "EVAL(" is false since "EVALUATE" uppercased doesn't start with "EVAL("
      // Actually "EVALUATE(..." starts with "EVAL" but not "EVAL(" -- wait:
      // "EVALUATE" -> "EVALUATE" -> starts with "EVAL(" is false since char at index 4 is 'U' not '('
      const result2 = parseSetValue('EVALUATE(1+2)');
      expect(result2.type).toBe('literal');
    });
  });

  describe('CONTENT keyword', () => {
    it('should detect CONTENT keyword', () => {
      const result = parseSetValue('CONTENT');
      expect(result.type).toBe('content');
    });

    it('should detect CONTENT case-insensitively', () => {
      const result = parseSetValue('content');
      expect(result.type).toBe('content');
    });

    it('should detect Content with mixed case', () => {
      const result = parseSetValue('Content');
      expect(result.type).toBe('content');
    });
  });

  describe('!CLIPBOARD keyword', () => {
    it('should detect !CLIPBOARD', () => {
      const result = parseSetValue('!CLIPBOARD');
      expect(result.type).toBe('clipboard');
    });

    it('should detect !clipboard case-insensitively', () => {
      const result = parseSetValue('!clipboard');
      expect(result.type).toBe('clipboard');
    });
  });
});

describe('evaluateExpression', () => {
  let context: VariableContext;

  beforeEach(() => {
    context = new VariableContext();
  });

  it('should evaluate simple addition', () => {
    expect(evaluateExpression('1+2', context)).toBe(3);
  });

  it('should evaluate subtraction', () => {
    expect(evaluateExpression('10-3', context)).toBe(7);
  });

  it('should evaluate multiplication', () => {
    expect(evaluateExpression('4*5', context)).toBe(20);
  });

  it('should evaluate division', () => {
    expect(evaluateExpression('20/4', context)).toBe(5);
  });

  it('should evaluate modulo', () => {
    expect(evaluateExpression('10%3', context)).toBe(1);
  });

  it('should evaluate expressions with parentheses', () => {
    expect(evaluateExpression('(2+3)*4', context)).toBe(20);
  });

  it('should evaluate nested parentheses', () => {
    expect(evaluateExpression('((2+3)*4)+1', context)).toBe(21);
  });

  it('should evaluate decimal numbers', () => {
    expect(evaluateExpression('1.5+2.5', context)).toBeCloseTo(4.0);
  });

  it('should evaluate negative results', () => {
    expect(evaluateExpression('3-10', context)).toBe(-7);
  });

  it('should handle leading/trailing whitespace', () => {
    expect(evaluateExpression('  5 + 3  ', context)).toBe(8);
  });

  it('should return 0 for empty expression', () => {
    expect(evaluateExpression('', context)).toBe(0);
  });

  it('should return 0 for non-numeric expression (after sanitization)', () => {
    // If expression is purely alphabetical characters, sanitization strips them all
    expect(evaluateExpression('hello', context)).toBe(0);
  });

  it('should expand variables before evaluation', () => {
    context.set('!VAR1', 10);
    expect(evaluateExpression('{{!VAR1}}+5', context)).toBe(15);
  });

  it('should handle multiple variable references', () => {
    context.set('!VAR1', 10);
    context.set('!VAR2', 20);
    expect(evaluateExpression('{{!VAR1}}+{{!VAR2}}', context)).toBe(30);
  });

  it('should handle quoted expressions (quotes are stripped by sanitizer)', () => {
    // Quotes in EVAL expressions are stripped by the sanitizer
    expect(evaluateExpression('"5+3"', context)).toBe(8);
  });

  it('should handle order of operations', () => {
    expect(evaluateExpression('2+3*4', context)).toBe(14);
  });

  it('should handle division with decimals', () => {
    expect(evaluateExpression('10/3', context)).toBeCloseTo(3.333, 2);
  });

  it('should handle chained additions', () => {
    expect(evaluateExpression('1+2+3+4+5', context)).toBe(15);
  });
});

describe('executeSet', () => {
  let context: VariableContext;

  beforeEach(() => {
    context = new VariableContext();
  });

  it('should set a literal string value', () => {
    const result = executeSet(context, '!VAR1', 'hello');
    expect(result.success).toBe(true);
    expect(result.newValue).toBe('hello');
    expect(context.get('!VAR1')).toBe('hello');
  });

  it('should set a literal numeric string', () => {
    const result = executeSet(context, '!VAR1', '42');
    expect(result.success).toBe(true);
    expect(result.newValue).toBe('42');
    expect(context.get('!VAR1')).toBe('42');
  });

  it('should evaluate EVAL expression', () => {
    const result = executeSet(context, '!VAR1', 'EVAL("1+2")');
    expect(result.success).toBe(true);
    expect(result.newValue).toBe(3);
    expect(context.get('!VAR1')).toBe(3);
  });

  it('should evaluate EVAL with variable references', () => {
    context.set('!VAR1', 10);
    const result = executeSet(context, '!VAR2', 'EVAL("{{!VAR1}}*3")');
    expect(result.success).toBe(true);
    expect(result.newValue).toBe(30);
    expect(context.get('!VAR2')).toBe(30);
  });

  it('should get value from clipboard', () => {
    context.setClipboard('clipboard content');
    const result = executeSet(context, '!VAR1', '!CLIPBOARD');
    expect(result.success).toBe(true);
    expect(result.newValue).toBe('clipboard content');
    expect(context.get('!VAR1')).toBe('clipboard content');
  });

  it('should return previous value in result', () => {
    context.set('!VAR1', 'old');
    const result = executeSet(context, '!VAR1', 'new');
    expect(result.success).toBe(true);
    expect(result.previousValue).toBe('old');
    expect(result.newValue).toBe('new');
  });

  it('should expand variables in literal values', () => {
    context.set('!VAR1', 'world');
    const result = executeSet(context, '!VAR2', '{{!VAR1}}');
    expect(result.success).toBe(true);
    expect(result.newValue).toBe('world');
  });

  it('should set a system variable like !TIMEOUT', () => {
    const result = executeSet(context, '!TIMEOUT', '30');
    expect(result.success).toBe(true);
    expect(context.get('!TIMEOUT')).toBe('30');
  });

  it('should set !ERRORIGNORE', () => {
    const result = executeSet(context, '!ERRORIGNORE', 'YES');
    expect(result.success).toBe(true);
    expect(context.get('!ERRORIGNORE')).toBe('YES');
  });
});

describe('executeAdd', () => {
  let context: VariableContext;

  beforeEach(() => {
    context = new VariableContext();
  });

  it('should add to an existing numeric variable', () => {
    context.set('!VAR1', 10);
    const result = executeAdd(context, '!VAR1', '5');
    expect(result.success).toBe(true);
    expect(result.previousValue).toBe(10);
    expect(result.addedValue).toBe(5);
    expect(result.newValue).toBe(15);
    expect(context.get('!VAR1')).toBe(15);
  });

  it('should add to an empty variable (treated as 0)', () => {
    // !VAR1 defaults to empty string
    const result = executeAdd(context, '!VAR1', '5');
    expect(result.success).toBe(true);
    expect(result.newValue).toBe(5);
  });

  it('should add decimal numbers', () => {
    context.set('!VAR1', 10.5);
    const result = executeAdd(context, '!VAR1', '2.3');
    expect(result.success).toBe(true);
    expect(result.newValue).toBeCloseTo(12.8);
  });

  it('should add negative numbers', () => {
    context.set('!VAR1', 100);
    const result = executeAdd(context, '!VAR1', '-25');
    expect(result.success).toBe(true);
    expect(result.newValue).toBe(75);
  });

  it('should concatenate non-numeric value (iMacros 8.9.7 behavior)', () => {
    context.set('!VAR1', 'prefix_');
    const result = executeAdd(context, '!VAR1', 'abc');
    expect(result.success).toBe(true);
    expect(result.newValue).toBe('prefix_abc');
  });

  it('should expand variable references in value', () => {
    context.set('!VAR1', 0);
    context.set('!VAR2', 7);
    const result = executeAdd(context, '!VAR1', '{{!VAR2}}');
    expect(result.success).toBe(true);
    expect(result.newValue).toBe(7);
  });

  it('should concatenate when current value is non-numeric string (iMacros 8.9.7 behavior)', () => {
    context.set('!VAR1', 'not-a-number');
    const result = executeAdd(context, '!VAR1', '5');
    expect(result.success).toBe(true);
    expect(result.newValue).toBe('not-a-number5');
  });

  it('should add zero without changing value', () => {
    context.set('!VAR1', 42);
    const result = executeAdd(context, '!VAR1', '0');
    expect(result.success).toBe(true);
    expect(result.newValue).toBe(42);
  });

  it('should produce negative results', () => {
    context.set('!VAR1', 5);
    const result = executeAdd(context, '!VAR1', '-10');
    expect(result.success).toBe(true);
    expect(result.newValue).toBe(-5);
  });
});
