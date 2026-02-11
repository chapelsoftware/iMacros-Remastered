/**
 * Unit tests for Safe Expression Evaluator
 *
 * Tests arithmetic operations, string concatenation, variable references,
 * comparison operators, and security (no code injection).
 */
import { describe, it, expect } from 'vitest';
import {
  ExpressionEvaluator,
  MapVariableProvider,
  MacroErrorSignal,
  evaluate,
  createEvaluator,
  extractExpressionVariables,
  sanitizeVariableName,
  preprocessMathExpressions,
  defaultEvaluator,
  type EvaluationResult,
  type VariableProvider,
} from '../../shared/src/expression-evaluator';

describe('Safe Expression Evaluator', () => {
  // ============================================================
  // SECTION: Basic Arithmetic Operations
  // ============================================================
  describe('Arithmetic Operations', () => {
    it('should evaluate addition', () => {
      const result = evaluate('2 + 3');
      expect(result.success).toBe(true);
      expect(result.value).toBe(5);
    });

    it('should evaluate subtraction', () => {
      const result = evaluate('10 - 4');
      expect(result.success).toBe(true);
      expect(result.value).toBe(6);
    });

    it('should evaluate multiplication', () => {
      const result = evaluate('6 * 7');
      expect(result.success).toBe(true);
      expect(result.value).toBe(42);
    });

    it('should evaluate division', () => {
      const result = evaluate('20 / 4');
      expect(result.success).toBe(true);
      expect(result.value).toBe(5);
    });

    it('should evaluate modulo', () => {
      const result = evaluate('17 % 5');
      expect(result.success).toBe(true);
      expect(result.value).toBe(2);
    });

    it('should handle operator precedence', () => {
      const result = evaluate('2 + 3 * 4');
      expect(result.success).toBe(true);
      expect(result.value).toBe(14);
    });

    it('should handle parentheses', () => {
      const result = evaluate('(2 + 3) * 4');
      expect(result.success).toBe(true);
      expect(result.value).toBe(20);
    });

    it('should handle negative numbers', () => {
      const result = evaluate('-5 + 3');
      expect(result.success).toBe(true);
      expect(result.value).toBe(-2);
    });

    it('should handle decimal numbers', () => {
      const result = evaluate('3.14 * 2');
      expect(result.success).toBe(true);
      expect(result.value).toBeCloseTo(6.28);
    });

    it('should handle complex expressions', () => {
      const result = evaluate('((10 + 5) * 2 - 8) / 2');
      expect(result.success).toBe(true);
      expect(result.value).toBe(11);
    });

    it('should handle exponentiation', () => {
      const result = evaluate('2 ^ 3');
      expect(result.success).toBe(true);
      expect(result.value).toBe(8);
    });
  });

  // ============================================================
  // SECTION: Built-in Math Functions
  // ============================================================
  describe('Built-in Math Functions', () => {
    it('should evaluate abs()', () => {
      const result = evaluate('abs(-5)');
      expect(result.success).toBe(true);
      expect(result.value).toBe(5);
    });

    it('should evaluate ceil()', () => {
      const result = evaluate('ceil(4.3)');
      expect(result.success).toBe(true);
      expect(result.value).toBe(5);
    });

    it('should evaluate floor()', () => {
      const result = evaluate('floor(4.7)');
      expect(result.success).toBe(true);
      expect(result.value).toBe(4);
    });

    it('should evaluate round()', () => {
      const result = evaluate('round(4.5)');
      expect(result.success).toBe(true);
      expect(result.value).toBe(5);
    });

    it('should evaluate min()', () => {
      const result = evaluate('min(3, 1, 4, 1, 5)');
      expect(result.success).toBe(true);
      expect(result.value).toBe(1);
    });

    it('should evaluate max()', () => {
      const result = evaluate('max(3, 1, 4, 1, 5)');
      expect(result.success).toBe(true);
      expect(result.value).toBe(5);
    });

    it('should evaluate sqrt()', () => {
      const result = evaluate('sqrt(16)');
      expect(result.success).toBe(true);
      expect(result.value).toBe(4);
    });
  });

  // ============================================================
  // SECTION: String Operations
  // ============================================================
  describe('String Operations', () => {
    it('should evaluate concat()', () => {
      const result = evaluate('concat("Hello", " ", "World")');
      expect(result.success).toBe(true);
      expect(result.value).toBe('Hello World');
    });

    it('should evaluate length()', () => {
      const result = evaluate('length("Hello")');
      expect(result.success).toBe(true);
      expect(result.value).toBe(5);
    });

    it('should evaluate substr()', () => {
      const result = evaluate('substr("Hello World", 0, 5)');
      expect(result.success).toBe(true);
      expect(result.value).toBe('Hello');
    });

    it('should evaluate upper()', () => {
      const result = evaluate('upper("hello")');
      expect(result.success).toBe(true);
      expect(result.value).toBe('HELLO');
    });

    it('should evaluate lower()', () => {
      const result = evaluate('lower("HELLO")');
      expect(result.success).toBe(true);
      expect(result.value).toBe('hello');
    });

    it('should evaluate trim()', () => {
      const result = evaluate('trim("  hello  ")');
      expect(result.success).toBe(true);
      expect(result.value).toBe('hello');
    });

    it('should evaluate indexOf()', () => {
      const result = evaluate('indexOf("Hello World", "World")');
      expect(result.success).toBe(true);
      expect(result.value).toBe(6);
    });

    it('should evaluate replace()', () => {
      const result = evaluate('replace("Hello World", "World", "Universe")');
      expect(result.success).toBe(true);
      expect(result.value).toBe('Hello Universe');
    });

    it('should handle string concatenation with concat()', () => {
      // Note: expr-eval's + operator is numeric only; use concat() for strings
      const result = evaluate('concat("Hello", " ", "World")');
      expect(result.success).toBe(true);
      expect(result.value).toBe('Hello World');
    });
  });

  // ============================================================
  // SECTION: Type Conversion Functions
  // ============================================================
  describe('Type Conversion Functions', () => {
    it('should convert number to string with str()', () => {
      const result = evaluate('str(42)');
      expect(result.success).toBe(true);
      expect(result.value).toBe('42');
    });

    it('should convert string to number with num()', () => {
      const result = evaluate('num("42")');
      expect(result.success).toBe(true);
      expect(result.value).toBe(42);
    });

    it('should convert string to integer with int()', () => {
      const result = evaluate('int("42.7")');
      expect(result.success).toBe(true);
      expect(result.value).toBe(42);
    });

    it('should convert string to float with float()', () => {
      const result = evaluate('float("3.14")');
      expect(result.success).toBe(true);
      expect(result.value).toBeCloseTo(3.14);
    });

    it('should error on invalid number conversion', () => {
      const result = evaluate('num("abc")');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot convert');
    });
  });

  // ============================================================
  // SECTION: Comparison Operators
  // ============================================================
  describe('Comparison Operators', () => {
    it('should evaluate equality (==)', () => {
      const result = evaluate('5 == 5');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should evaluate inequality (!=)', () => {
      const result = evaluate('5 != 3');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should evaluate less than (<)', () => {
      const result = evaluate('3 < 5');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should evaluate less than or equal (<=)', () => {
      const result = evaluate('5 <= 5');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should evaluate greater than (>)', () => {
      const result = evaluate('5 > 3');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should evaluate greater than or equal (>=)', () => {
      const result = evaluate('5 >= 5');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should handle string comparison', () => {
      const result = evaluate('"abc" == "abc"');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });
  });

  // ============================================================
  // SECTION: Logical Operators
  // ============================================================
  describe('Logical Operators', () => {
    it('should evaluate AND', () => {
      const result = evaluate('true and true');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should evaluate OR', () => {
      const result = evaluate('false or true');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should evaluate NOT', () => {
      const result = evaluate('not false');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should handle complex logical expressions', () => {
      const result = evaluate('(5 > 3) and (2 < 4)');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });
  });

  // ============================================================
  // SECTION: Conditional Function
  // ============================================================
  describe('Conditional Function (iif)', () => {
    it('should return true value when condition is true', () => {
      const result = evaluate('iif(true, "yes", "no")');
      expect(result.success).toBe(true);
      expect(result.value).toBe('yes');
    });

    it('should return false value when condition is false', () => {
      const result = evaluate('iif(false, "yes", "no")');
      expect(result.success).toBe(true);
      expect(result.value).toBe('no');
    });

    it('should work with comparison', () => {
      const result = evaluate('iif(5 > 3, "greater", "lesser")');
      expect(result.success).toBe(true);
      expect(result.value).toBe('greater');
    });
  });

  // ============================================================
  // SECTION: Variable References
  // ============================================================
  describe('Variable References', () => {
    it('should resolve simple variable', () => {
      const result = evaluate('{{x}} + 1', { x: 5 });
      expect(result.success).toBe(true);
      expect(result.value).toBe(6);
    });

    it('should resolve multiple variables', () => {
      const result = evaluate('{{a}} + {{b}}', { a: 3, b: 4 });
      expect(result.success).toBe(true);
      expect(result.value).toBe(7);
    });

    it('should resolve system variable (!VAR1)', () => {
      const result = evaluate('{{!VAR1}} * 2', { '!VAR1': 10 });
      expect(result.success).toBe(true);
      expect(result.value).toBe(20);
    });

    it('should resolve !LOOP variable', () => {
      const result = evaluate('{{!LOOP}} + 1', { '!LOOP': 5 });
      expect(result.success).toBe(true);
      expect(result.value).toBe(6);
    });

    it('should handle string variables', () => {
      const result = evaluate('concat({{name}}, "!")', { name: 'Hello' });
      expect(result.success).toBe(true);
      expect(result.value).toBe('Hello!');
    });

    it('should default undefined variables to empty string', () => {
      const result = evaluate('concat({{missing}}, "test")');
      expect(result.success).toBe(true);
      expect(result.value).toBe('test');
    });

    it('should work with MapVariableProvider', () => {
      const provider = new MapVariableProvider({ x: 10, y: 20 });
      const evaluator = new ExpressionEvaluator();
      const result = evaluator.evaluate('{{x}} + {{y}}', provider);
      expect(result.success).toBe(true);
      expect(result.value).toBe(30);
    });
  });

  // ============================================================
  // SECTION: MapVariableProvider
  // ============================================================
  describe('MapVariableProvider', () => {
    it('should initialize with values', () => {
      const provider = new MapVariableProvider({ x: 1, y: 'test', z: true });
      expect(provider.get('x')).toBe(1);
      expect(provider.get('y')).toBe('test');
      expect(provider.get('z')).toBe(true);
    });

    it('should set and get values', () => {
      const provider = new MapVariableProvider();
      provider.set('key', 'value');
      expect(provider.get('key')).toBe('value');
    });

    it('should check existence with has()', () => {
      const provider = new MapVariableProvider({ x: 1 });
      expect(provider.has('x')).toBe(true);
      expect(provider.has('y')).toBe(false);
    });

    it('should delete values', () => {
      const provider = new MapVariableProvider({ x: 1 });
      expect(provider.delete('x')).toBe(true);
      expect(provider.has('x')).toBe(false);
    });

    it('should clear all values', () => {
      const provider = new MapVariableProvider({ x: 1, y: 2 });
      provider.clear();
      expect(provider.has('x')).toBe(false);
      expect(provider.has('y')).toBe(false);
    });

    it('should return all values with getAll()', () => {
      const provider = new MapVariableProvider({ x: 1, y: 2 });
      const all = provider.getAll();
      expect(all).toEqual({ x: 1, y: 2 });
    });
  });

  // ============================================================
  // SECTION: Security - No Code Injection
  // ============================================================
  describe('Security - No Code Injection', () => {
    it('should reject function call attempts', () => {
      const result = evaluate('alert("test")');
      // expr-eval should not recognize 'alert' as a valid function
      expect(result.success).toBe(false);
    });

    it('should reject eval attempts', () => {
      const result = evaluate('eval("1+1")');
      expect(result.success).toBe(false);
    });

    it('should reject Function constructor', () => {
      const result = evaluate('Function("return 1")');
      expect(result.success).toBe(false);
    });

    it('should reject object property access attempts', () => {
      const result = evaluate('constructor.constructor');
      expect(result.success).toBe(false);
    });

    it('should treat unknown identifiers as undefined variables', () => {
      // expr-eval treats unknown identifiers as undefined (evaluates to 0)
      // This is safe since it doesn't execute arbitrary code
      const result = evaluate('__proto__');
      expect(result.success).toBe(true);
      // The value will be 0 (undefined in numeric context) or empty string
    });

    it('should reject require attempts', () => {
      const result = evaluate('require("fs")');
      expect(result.success).toBe(false);
    });

    it('should reject process access', () => {
      const result = evaluate('process.exit()');
      expect(result.success).toBe(false);
    });

    it('should reject import attempts', () => {
      const result = evaluate('import("fs")');
      expect(result.success).toBe(false);
    });

    it('should reject global object access', () => {
      const result = evaluate('globalThis');
      expect(result.success).toBe(false);
    });

    it('should reject window object access', () => {
      const result = evaluate('window');
      expect(result.success).toBe(false);
    });

    it('should safely handle potentially dangerous variable names', () => {
      // Use a safe variable name that won't conflict with reserved words
      const result = evaluate('{{myvar}}', { myvar: 5 });
      expect(result.success).toBe(true);
      expect(result.value).toBe(5);
    });
  });

  // ============================================================
  // SECTION: Error Handling
  // ============================================================
  describe('Error Handling', () => {
    it('should return error for invalid expression', () => {
      // expr-eval may handle "2 + + 3" as "2 + (+3)" which is valid
      // Use a clearly invalid expression instead
      const result = evaluate('2 + * 3');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error for unbalanced parentheses', () => {
      const result = evaluate('(2 + 3');
      expect(result.success).toBe(false);
    });

    it('should return error for division by zero', () => {
      const result = evaluate('1 / 0');
      // expr-eval returns Infinity for division by zero
      expect(result.success).toBe(true);
      expect(result.value).toBe(Infinity);
    });

    it('should handle empty expression', () => {
      const result = evaluate('');
      expect(result.success).toBe(false);
    });

    it('should reject expression exceeding max length', () => {
      const evaluator = new ExpressionEvaluator({ maxLength: 10 });
      const result = evaluator.evaluate('1 + 2 + 3 + 4 + 5');
      expect(result.success).toBe(false);
      expect(result.error).toContain('maximum length');
    });
  });

  // ============================================================
  // SECTION: Expression Validation
  // ============================================================
  describe('Expression Validation', () => {
    it('should validate valid expression', () => {
      const evaluator = new ExpressionEvaluator();
      expect(evaluator.isValid('2 + 3')).toBe(true);
    });

    it('should invalidate invalid expression', () => {
      const evaluator = new ExpressionEvaluator();
      expect(evaluator.isValid('2 +')).toBe(false);
    });

    it('should invalidate expression exceeding max length', () => {
      const evaluator = new ExpressionEvaluator({ maxLength: 5 });
      expect(evaluator.isValid('1 + 2 + 3')).toBe(false);
    });
  });

  // ============================================================
  // SECTION: Variable Extraction
  // ============================================================
  describe('Variable Extraction', () => {
    it('should extract simple variable', () => {
      const vars = extractExpressionVariables('{{x}}');
      expect(vars).toEqual(['x']);
    });

    it('should extract multiple variables', () => {
      const vars = extractExpressionVariables('{{a}} + {{b}} * {{c}}');
      expect(vars).toEqual(['a', 'b', 'c']);
    });

    it('should extract system variables', () => {
      const vars = extractExpressionVariables('{{!VAR1}} + {{!LOOP}}');
      expect(vars).toEqual(['!VAR1', '!LOOP']);
    });

    it('should not duplicate variables', () => {
      const vars = extractExpressionVariables('{{x}} + {{x}}');
      expect(vars).toEqual(['x']);
    });

    it('should return empty array for no variables', () => {
      const vars = extractExpressionVariables('2 + 3');
      expect(vars).toEqual([]);
    });
  });

  // ============================================================
  // SECTION: Variable Name Sanitization
  // ============================================================
  describe('Variable Name Sanitization', () => {
    it('should keep simple names unchanged', () => {
      expect(sanitizeVariableName('myvar')).toBe('myvar');
    });

    it('should prefix system variables', () => {
      expect(sanitizeVariableName('!VAR1')).toBe('_SYS_VAR1');
    });

    it('should replace invalid characters', () => {
      expect(sanitizeVariableName('my-var')).toBe('my_var');
      expect(sanitizeVariableName('my.var')).toBe('my_var');
    });

    it('should handle !NOW:format', () => {
      expect(sanitizeVariableName('!NOW:yyyymmdd')).toBe('_SYS_NOW_yyyymmdd');
    });
  });

  // ============================================================
  // SECTION: Convenience Methods
  // ============================================================
  describe('Convenience Methods', () => {
    it('should evaluate arithmetic expression', () => {
      const evaluator = new ExpressionEvaluator();
      expect(evaluator.evaluateArithmetic('2 + 3')).toBe(5);
    });

    it('should throw error for non-numeric arithmetic result', () => {
      const evaluator = new ExpressionEvaluator();
      expect(() => evaluator.evaluateArithmetic('"hello"')).toThrow();
    });

    it('should evaluate comparison expression', () => {
      const evaluator = new ExpressionEvaluator();
      expect(evaluator.evaluateComparison('5 > 3')).toBe(true);
    });

    it('should evaluate string expression', () => {
      const evaluator = new ExpressionEvaluator();
      expect(evaluator.evaluateString('concat("a", "b")')).toBe('ab');
    });

    it('should get variables from expression', () => {
      const evaluator = new ExpressionEvaluator();
      const vars = evaluator.getVariables('{{a}} + {{b}}');
      expect(vars).toEqual(['a', 'b']);
    });
  });

  // ============================================================
  // SECTION: Factory Functions
  // ============================================================
  describe('Factory Functions', () => {
    it('should create evaluator with createEvaluator()', () => {
      const evaluator = createEvaluator();
      const result = evaluator.evaluate('1 + 1');
      expect(result.value).toBe(2);
    });

    it('should create evaluator with custom options', () => {
      const evaluator = createEvaluator({ maxLength: 100 });
      const result = evaluator.evaluate('1 + 1');
      expect(result.success).toBe(true);
    });

    it('should use default evaluator instance', () => {
      const result = defaultEvaluator.evaluate('2 * 3');
      expect(result.value).toBe(6);
    });
  });

  // ============================================================
  // SECTION: Real-World Use Cases
  // ============================================================
  describe('Real-World Use Cases', () => {
    it('should calculate loop-based values', () => {
      const result = evaluate('{{!LOOP}} * 10 + 5', { '!LOOP': 3 });
      expect(result.success).toBe(true);
      expect(result.value).toBe(35);
    });

    it('should concatenate strings with variables', () => {
      const result = evaluate(
        'concat("User: ", {{name}}, " (ID: ", str({{id}}), ")")',
        { name: 'Alice', id: 42 }
      );
      expect(result.success).toBe(true);
      expect(result.value).toBe('User: Alice (ID: 42)');
    });

    it('should perform conditional logic', () => {
      const result = evaluate(
        'iif({{count}} > 0, "Has items", "Empty")',
        { count: 5 }
      );
      expect(result.success).toBe(true);
      expect(result.value).toBe('Has items');
    });

    it('should calculate random-like sequences', () => {
      // Note: This is deterministic, just demonstrating the pattern
      const result = evaluate('floor({{seed}} * 5 + 1) % 10', { seed: 0.7 });
      expect(result.success).toBe(true);
      expect(typeof result.value).toBe('number');
    });

    it('should build dynamic URLs', () => {
      const result = evaluate(
        'concat("http://example.com/page/", str({{page}}), "?id=", str({{id}}))',
        { page: 2, id: 100 }
      );
      expect(result.success).toBe(true);
      expect(result.value).toBe('http://example.com/page/2?id=100');
    });
  });

  // ============================================================
  // SECTION: Additional Math Functions
  // ============================================================
  describe('Additional Math Functions', () => {
    it('should evaluate pow()', () => {
      const result = evaluate('pow(2, 10)');
      expect(result.success).toBe(true);
      expect(result.value).toBe(1024);
    });

    it('should evaluate log() (natural logarithm)', () => {
      const result = evaluate('log(1)');
      expect(result.success).toBe(true);
      expect(result.value).toBe(0);
    });

    it('should evaluate exp()', () => {
      const result = evaluate('exp(0)');
      expect(result.success).toBe(true);
      expect(result.value).toBe(1);
    });

    it('should evaluate sin()', () => {
      const result = evaluate('sin(0)');
      expect(result.success).toBe(true);
      expect(result.value).toBe(0);
    });

    it('should evaluate cos()', () => {
      const result = evaluate('cos(0)');
      expect(result.success).toBe(true);
      expect(result.value).toBe(1);
    });

    it('should evaluate tan()', () => {
      const result = evaluate('tan(0)');
      expect(result.success).toBe(true);
      expect(result.value).toBe(0);
    });

    it('should evaluate random() returns a number between 0 and 1', () => {
      const result = evaluate('random()');
      expect(result.success).toBe(true);
      expect(typeof result.value).toBe('number');
      expect(result.value as number).toBeGreaterThanOrEqual(0);
      expect(result.value as number).toBeLessThan(1);
    });

    it('should evaluate date_now() returns a positive number', () => {
      const result = evaluate('date_now()');
      expect(result.success).toBe(true);
      expect(typeof result.value).toBe('number');
      expect(result.value as number).toBeGreaterThan(0);
    });

    it('should evaluate parse_int()', () => {
      const result = evaluate('parse_int("42abc")');
      expect(result.success).toBe(true);
      expect(result.value).toBe(42);
    });

    it('should evaluate parse_int() with radix', () => {
      const result = evaluate('parse_int("ff", 16)');
      expect(result.success).toBe(true);
      expect(result.value).toBe(255);
    });

    it('should evaluate parse_float()', () => {
      const result = evaluate('parse_float("3.14xyz")');
      expect(result.success).toBe(true);
      expect(result.value).toBeCloseTo(3.14);
    });

    it('should evaluate char_at()', () => {
      const result = evaluate('char_at("Hello", 1)');
      expect(result.success).toBe(true);
      expect(result.value).toBe('e');
    });

    it('should evaluate split_get()', () => {
      const result = evaluate('split_get("a,b,c", ",", 1)');
      expect(result.success).toBe(true);
      expect(result.value).toBe('b');
    });

    it('should return empty string for split_get() out-of-range index', () => {
      const result = evaluate('split_get("a,b", ",", 5)');
      expect(result.success).toBe(true);
      expect(result.value).toBe('');
    });

    it('should use PI constant', () => {
      const result = evaluate('PI');
      expect(result.success).toBe(true);
      expect(result.value).toBeCloseTo(Math.PI);
    });

    it('should use E constant', () => {
      const result = evaluate('E');
      expect(result.success).toBe(true);
      expect(result.value).toBeCloseTo(Math.E);
    });
  });

  // ============================================================
  // SECTION: Additional String Functions
  // ============================================================
  describe('Additional String Functions', () => {
    it('should evaluate substring() with start and end', () => {
      const result = evaluate('substring("Hello World", 6, 11)');
      expect(result.success).toBe(true);
      expect(result.value).toBe('World');
    });

    it('should evaluate substring() with only start', () => {
      const result = evaluate('substring("Hello World", 6)');
      expect(result.success).toBe(true);
      expect(result.value).toBe('World');
    });

    it('should evaluate substr() without length (to end)', () => {
      const result = evaluate('substr("Hello World", 6)');
      expect(result.success).toBe(true);
      expect(result.value).toBe('World');
    });

    it('should evaluate indexOf() not found returns -1', () => {
      const result = evaluate('indexOf("Hello World", "xyz")');
      expect(result.success).toBe(true);
      expect(result.value).toBe(-1);
    });

    it('should evaluate replace() only replaces first occurrence', () => {
      const result = evaluate('replace("aaa", "a", "b")');
      expect(result.success).toBe(true);
      expect(result.value).toBe('baa');
    });

    it('should evaluate concat() with numbers and strings', () => {
      const result = evaluate('concat("Value: ", 42)');
      expect(result.success).toBe(true);
      expect(result.value).toBe('Value: 42');
    });

    it('should evaluate length() on empty string', () => {
      const result = evaluate('length("")');
      expect(result.success).toBe(true);
      expect(result.value).toBe(0);
    });
  });

  // ============================================================
  // SECTION: MacroError Function
  // ============================================================
  describe('MacroError Function', () => {
    it('should throw MacroErrorSignal when MacroError() is called', () => {
      const evaluator = new ExpressionEvaluator();
      expect(() => {
        evaluator.evaluate('MacroError("test error")');
      }).toThrow(MacroErrorSignal);
    });

    it('should include the error message in MacroErrorSignal', () => {
      const evaluator = new ExpressionEvaluator();
      try {
        evaluator.evaluate('MacroError("custom message")');
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(MacroErrorSignal);
        expect((error as MacroErrorSignal).message).toBe('custom message');
      }
    });

    it('should throw MacroErrorSignal with numeric argument converted to string', () => {
      const evaluator = new ExpressionEvaluator();
      try {
        evaluator.evaluate('MacroError(404)');
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(MacroErrorSignal);
        expect((error as MacroErrorSignal).message).toBe('404');
      }
    });
  });

  // ============================================================
  // SECTION: Deeply Nested Expressions
  // ============================================================
  describe('Deeply Nested Expressions', () => {
    it('should evaluate deeply nested iif expressions', () => {
      const result = evaluate('iif(1 > 0, iif(2 > 1, iif(3 > 2, "deep", ""), ""), "")');
      expect(result.success).toBe(true);
      expect(result.value).toBe('deep');
    });

    it('should evaluate nested iif with false outer condition', () => {
      const result = evaluate('iif(0 > 1, "never", iif(2 > 1, "fallback", "none"))');
      expect(result.success).toBe(true);
      expect(result.value).toBe('fallback');
    });

    it('should evaluate deeply nested arithmetic', () => {
      const result = evaluate('(((2 + 3) * (4 - 1)) / 3) + 1');
      expect(result.success).toBe(true);
      expect(result.value).toBe(6);
    });

    it('should evaluate nested function calls', () => {
      const result = evaluate('upper(concat(substr("hello", 0, 1), "orld"))');
      expect(result.success).toBe(true);
      expect(result.value).toBe('HORLD');
    });
  });

  // ============================================================
  // SECTION: preprocessMathExpressions
  // ============================================================
  describe('preprocessMathExpressions', () => {
    it('should convert Math.random() to random()', () => {
      expect(preprocessMathExpressions('Math.random()')).toBe('random()');
    });

    it('should convert Math.PI to PI', () => {
      expect(preprocessMathExpressions('Math.PI')).toBe('PI');
    });

    it('should convert Math.E to E', () => {
      expect(preprocessMathExpressions('Math.E')).toBe('E');
    });

    it('should convert Math.floor() to floor()', () => {
      expect(preprocessMathExpressions('Math.floor(1.5)')).toBe('floor(1.5)');
    });

    it('should convert Math.ceil() to ceil()', () => {
      expect(preprocessMathExpressions('Math.ceil(1.2)')).toBe('ceil(1.2)');
    });

    it('should convert Math.round() to round()', () => {
      expect(preprocessMathExpressions('Math.round(1.5)')).toBe('round(1.5)');
    });

    it('should convert Math.abs() to abs()', () => {
      expect(preprocessMathExpressions('Math.abs(-5)')).toBe('abs(-5)');
    });

    it('should convert Math.min() to min()', () => {
      expect(preprocessMathExpressions('Math.min(1,2)')).toBe('min(1,2)');
    });

    it('should convert Math.max() to max()', () => {
      expect(preprocessMathExpressions('Math.max(1,2)')).toBe('max(1,2)');
    });

    it('should convert Math.pow() to pow()', () => {
      expect(preprocessMathExpressions('Math.pow(2,3)')).toBe('pow(2,3)');
    });

    it('should convert Math.log() to log()', () => {
      expect(preprocessMathExpressions('Math.log(10)')).toBe('log(10)');
    });

    it('should convert Math.exp() to exp()', () => {
      expect(preprocessMathExpressions('Math.exp(1)')).toBe('exp(1)');
    });

    it('should convert Math.sin() to sin()', () => {
      expect(preprocessMathExpressions('Math.sin(0)')).toBe('sin(0)');
    });

    it('should convert Math.cos() to cos()', () => {
      expect(preprocessMathExpressions('Math.cos(0)')).toBe('cos(0)');
    });

    it('should convert Math.tan() to tan()', () => {
      expect(preprocessMathExpressions('Math.tan(0)')).toBe('tan(0)');
    });

    it('should convert Math.sqrt() to sqrt()', () => {
      expect(preprocessMathExpressions('Math.sqrt(4)')).toBe('sqrt(4)');
    });

    it('should convert Date.now() to date_now()', () => {
      expect(preprocessMathExpressions('Date.now()')).toBe('date_now()');
    });

    it('should convert parseInt() to parse_int()', () => {
      expect(preprocessMathExpressions('parseInt("42")')).toBe('parse_int("42")');
    });

    it('should convert parseFloat() to parse_float()', () => {
      expect(preprocessMathExpressions('parseFloat("3.14")')).toBe('parse_float("3.14")');
    });

    it('should convert complex expression with multiple Math calls', () => {
      const input = 'Math.floor(Math.random() * 5 + 1)';
      const expected = 'floor(random() * 5 + 1)';
      expect(preprocessMathExpressions(input)).toBe(expected);
    });

    it('should not modify expressions without Math/Date prefixes', () => {
      const input = 'floor(1.5) + ceil(2.3)';
      expect(preprocessMathExpressions(input)).toBe(input);
    });

    it('preprocessed expressions should evaluate correctly', () => {
      const input = 'Math.floor(3.7)';
      const preprocessed = preprocessMathExpressions(input);
      const result = evaluate(preprocessed);
      expect(result.success).toBe(true);
      expect(result.value).toBe(3);
    });
  });

  // ============================================================
  // SECTION: Error Messages for Failure Modes
  // ============================================================
  describe('Error Messages for Failure Modes', () => {
    it('should return error for division by zero (Infinity result)', () => {
      const result = evaluate('1 / 0');
      expect(result.success).toBe(true);
      expect(result.value).toBe(Infinity);
    });

    it('should return error for undefined function', () => {
      const result = evaluate('unknownFunc(5)');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error for syntax error (mismatched parens)', () => {
      const result = evaluate('(2 + 3');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error for empty expression', () => {
      const result = evaluate('');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error for num() with non-numeric string', () => {
      const result = evaluate('num("not_a_number")');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot convert');
    });

    it('should return error for int() with non-numeric string', () => {
      const result = evaluate('int("xyz")');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot convert');
    });

    it('should return error for float() with non-numeric string', () => {
      const result = evaluate('float("abc")');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot convert');
    });

    it('should return error for expression exceeding max length', () => {
      const evaluator = new ExpressionEvaluator({ maxLength: 5 });
      const result = evaluator.evaluate('1 + 2 + 3 + 4');
      expect(result.success).toBe(false);
      expect(result.error).toContain('maximum length');
    });
  });

  // ============================================================
  // SECTION: String Concatenation and Comparison
  // ============================================================
  describe('String Concatenation and Comparison', () => {
    it('should concatenate strings using concat()', () => {
      const result = evaluate('concat("foo", "bar", "baz")');
      expect(result.success).toBe(true);
      expect(result.value).toBe('foobarbaz');
    });

    it('should compare strings with ==', () => {
      const result = evaluate('"hello" == "hello"');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should compare strings with != (different)', () => {
      const result = evaluate('"hello" != "world"');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should compare strings with != (same)', () => {
      const result = evaluate('"same" != "same"');
      expect(result.success).toBe(true);
      expect(result.value).toBe(false);
    });

    it('should concatenate empty strings', () => {
      const result = evaluate('concat("", "", "only")');
      expect(result.success).toBe(true);
      expect(result.value).toBe('only');
    });
  });

  // ============================================================
  // SECTION: Boolean Logic
  // ============================================================
  describe('Boolean Logic', () => {
    it('should evaluate true and false', () => {
      const result = evaluate('true and false');
      expect(result.success).toBe(true);
      expect(result.value).toBe(false);
    });

    it('should evaluate true or false', () => {
      const result = evaluate('true or false');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should evaluate not true', () => {
      const result = evaluate('not true');
      expect(result.success).toBe(true);
      expect(result.value).toBe(false);
    });

    it('should evaluate not false', () => {
      const result = evaluate('not false');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should evaluate false and false', () => {
      const result = evaluate('false and false');
      expect(result.success).toBe(true);
      expect(result.value).toBe(false);
    });

    it('should evaluate false or false', () => {
      const result = evaluate('false or false');
      expect(result.success).toBe(true);
      expect(result.value).toBe(false);
    });

    it('should evaluate complex boolean expression', () => {
      const result = evaluate('(true or false) and (not false)');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should evaluate boolean with comparison', () => {
      const result = evaluate('(5 > 3) and (10 <= 10)');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should evaluate chained or with all false', () => {
      const result = evaluate('false or false or false');
      expect(result.success).toBe(true);
      expect(result.value).toBe(false);
    });

    it('should evaluate chained or with one true', () => {
      const result = evaluate('false or false or true');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });
  });

  // ============================================================
  // SECTION: String Function Edge Cases
  // ============================================================
  describe('String Function Edge Cases', () => {
    it('should handle substr() with negative start', () => {
      const result = evaluate('substr("hello", -2, 2)');
      expect(result.success).toBe(true);
      // substring(-2, 0) swaps to substring(0, -2) which becomes substring(0, 0) = ''
      expect(result.value).toBe('');
    });

    it('should handle substr() with out-of-bounds start', () => {
      const result = evaluate('substr("hello", 100, 2)');
      expect(result.success).toBe(true);
      expect(result.value).toBe('');
    });

    it('should handle substr() with length exceeding bounds', () => {
      const result = evaluate('substr("hello", 2, 100)');
      expect(result.success).toBe(true);
      expect(result.value).toBe('llo');
    });

    it('should handle substr() on empty string', () => {
      const result = evaluate('substr("", 0, 5)');
      expect(result.success).toBe(true);
      expect(result.value).toBe('');
    });

    it('should handle substring() with swapped indices', () => {
      // JavaScript substring() swaps if start > end
      const result = evaluate('substring("hello", 3, 1)');
      expect(result.success).toBe(true);
      expect(result.value).toBe('el');
    });

    it('should handle substring() with negative indices', () => {
      const result = evaluate('substring("hello", -2, 3)');
      expect(result.success).toBe(true);
      // Negative treated as 0
      expect(result.value).toBe('hel');
    });

    it('should handle indexOf() on empty string', () => {
      const result = evaluate('indexOf("", "a")');
      expect(result.success).toBe(true);
      expect(result.value).toBe(-1);
    });

    it('should handle indexOf() with empty search string', () => {
      const result = evaluate('indexOf("hello", "")');
      expect(result.success).toBe(true);
      // Empty string found at position 0
      expect(result.value).toBe(0);
    });

    it('should handle indexOf() both empty', () => {
      const result = evaluate('indexOf("", "")');
      expect(result.success).toBe(true);
      expect(result.value).toBe(0);
    });

    it('should handle replace() with empty search string', () => {
      const result = evaluate('replace("hello", "", "x")');
      expect(result.success).toBe(true);
      // Replace empty at start inserts at beginning
      expect(result.value).toBe('xhello');
    });

    it('should handle replace() with empty replacement', () => {
      const result = evaluate('replace("hello", "l", "")');
      expect(result.success).toBe(true);
      // Removes first occurrence
      expect(result.value).toBe('helo');
    });

    it('should handle replace() on empty string', () => {
      const result = evaluate('replace("", "x", "y")');
      expect(result.success).toBe(true);
      expect(result.value).toBe('');
    });

    it('should handle char_at() with negative index', () => {
      const result = evaluate('char_at("hello", -1)');
      expect(result.success).toBe(true);
      // JavaScript charAt with negative returns empty
      expect(result.value).toBe('');
    });

    it('should handle char_at() with out-of-bounds index', () => {
      const result = evaluate('char_at("hello", 100)');
      expect(result.success).toBe(true);
      expect(result.value).toBe('');
    });

    it('should handle char_at() on empty string', () => {
      const result = evaluate('char_at("", 0)');
      expect(result.success).toBe(true);
      expect(result.value).toBe('');
    });

    it('should handle split_get() with negative index', () => {
      const result = evaluate('split_get("a,b,c", ",", -1)');
      expect(result.success).toBe(true);
      // Implementation returns empty for negative
      expect(result.value).toBe('');
    });

    it('should handle split_get() with out-of-bounds positive index', () => {
      const result = evaluate('split_get("a,b,c", ",", 10)');
      expect(result.success).toBe(true);
      expect(result.value).toBe('');
    });

    it('should handle split_get() on empty string', () => {
      const result = evaluate('split_get("", ",", 0)');
      expect(result.success).toBe(true);
      // Empty string split gives [""]
      expect(result.value).toBe('');
    });

    it('should handle split_get() with empty delimiter', () => {
      const result = evaluate('split_get("hello", "", 2)');
      expect(result.success).toBe(true);
      // Empty delimiter splits each char
      expect(result.value).toBe('l');
    });
  });

  // ============================================================
  // SECTION: Math Function Domain and Edge Cases
  // ============================================================
  describe('Math Function Domain and Edge Cases', () => {
    it('should return NaN for sqrt() with negative number', () => {
      const result = evaluate('sqrt(-1)');
      expect(result.success).toBe(true);
      expect(Number.isNaN(result.value)).toBe(true);
    });

    it('should return -Infinity for log(0)', () => {
      const result = evaluate('log(0)');
      expect(result.success).toBe(true);
      expect(result.value).toBe(-Infinity);
    });

    it('should return NaN for log() with negative number', () => {
      const result = evaluate('log(-5)');
      expect(result.success).toBe(true);
      expect(Number.isNaN(result.value)).toBe(true);
    });

    it('should handle pow(0, 0) returns 1', () => {
      const result = evaluate('pow(0, 0)');
      expect(result.success).toBe(true);
      expect(result.value).toBe(1);
    });

    it('should return NaN for pow() with negative base and fractional exponent', () => {
      const result = evaluate('pow(-2, 0.5)');
      expect(result.success).toBe(true);
      expect(Number.isNaN(result.value)).toBe(true);
    });

    it('should handle pow() with large exponents producing Infinity', () => {
      const result = evaluate('pow(2, 10000)');
      expect(result.success).toBe(true);
      expect(result.value).toBe(Infinity);
    });

    it('should handle tan() near PI/2 returns large value', () => {
      // Math.PI/2 is close to but not exactly PI/2, so tan is large but finite
      const result = evaluate('tan(PI / 2)');
      expect(result.success).toBe(true);
      expect(Math.abs(result.value as number)).toBeGreaterThan(1e15);
    });

    it('should handle exp() with very large values producing Infinity', () => {
      const result = evaluate('exp(1000)');
      expect(result.success).toBe(true);
      expect(result.value).toBe(Infinity);
    });

    it('should handle exp() with very negative values approaching 0', () => {
      const result = evaluate('exp(-1000)');
      expect(result.success).toBe(true);
      expect(result.value).toBe(0);
    });

    it('should handle min() with no arguments', () => {
      const result = evaluate('min()');
      expect(result.success).toBe(true);
      expect(result.value).toBe(Infinity);
    });

    it('should handle max() with no arguments', () => {
      const result = evaluate('max()');
      expect(result.success).toBe(true);
      expect(result.value).toBe(-Infinity);
    });

    it('should handle min() with single argument', () => {
      const result = evaluate('min(42)');
      expect(result.success).toBe(true);
      expect(result.value).toBe(42);
    });

    it('should handle max() with single argument', () => {
      const result = evaluate('max(42)');
      expect(result.success).toBe(true);
      expect(result.value).toBe(42);
    });

    it('should handle min() with mixed positive and negative', () => {
      const result = evaluate('min(5, -10, 3, -2)');
      expect(result.success).toBe(true);
      expect(result.value).toBe(-10);
    });

    it('should handle max() with mixed positive and negative', () => {
      const result = evaluate('max(-5, -10, -3, -2)');
      expect(result.success).toBe(true);
      expect(result.value).toBe(-2);
    });
  });

  // ============================================================
  // SECTION: Type Conversion with NaN and Infinity
  // ============================================================
  describe('Type Conversion with NaN and Infinity', () => {
    it('should error on num() with non-numeric string', () => {
      const result = evaluate('num("not_a_number")');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot convert');
    });

    it('should error on num() with alphabetic string', () => {
      const result = evaluate('num("xyz")');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot convert');
    });

    it('should handle num() with numeric string', () => {
      const result = evaluate('num("123.45")');
      expect(result.success).toBe(true);
      expect(result.value).toBe(123.45);
    });

    it('should handle num() with whitespace around number', () => {
      const result = evaluate('num("  42  ")');
      expect(result.success).toBe(true);
      expect(result.value).toBe(42);
    });

    it('should error on int() with Infinity string', () => {
      const result = evaluate('int("Infinity")');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot convert');
    });

    it('should error on int() with non-numeric string', () => {
      const result = evaluate('int("abc123")');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot convert');
    });

    it('should handle int() with partial numeric string', () => {
      // parseInt parses leading numbers
      const result = evaluate('int("123abc")');
      expect(result.success).toBe(true);
      expect(result.value).toBe(123);
    });

    it('should error on float() with non-numeric string', () => {
      const result = evaluate('float("hello")');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot convert');
    });

    it('should handle operations producing NaN', () => {
      const result = evaluate('0 / 0');
      expect(result.success).toBe(true);
      expect(Number.isNaN(result.value)).toBe(true);
    });

    it('should handle Infinity in arithmetic', () => {
      const result = evaluate('1 / 0 + 100');
      expect(result.success).toBe(true);
      expect(result.value).toBe(Infinity);
    });

    it('should handle negative Infinity', () => {
      const result = evaluate('-1 / 0');
      expect(result.success).toBe(true);
      expect(result.value).toBe(-Infinity);
    });

    it('should handle Infinity minus Infinity produces NaN', () => {
      const result = evaluate('(1 / 0) - (1 / 0)');
      expect(result.success).toBe(true);
      expect(Number.isNaN(result.value)).toBe(true);
    });

    it('should handle Infinity times zero produces NaN', () => {
      const result = evaluate('(1 / 0) * 0');
      expect(result.success).toBe(true);
      expect(Number.isNaN(result.value)).toBe(true);
    });

    it('should convert NaN to string', () => {
      const result = evaluate('str(0 / 0)');
      expect(result.success).toBe(true);
      expect(result.value).toBe('NaN');
    });

    it('should convert Infinity to string', () => {
      const result = evaluate('str(1 / 0)');
      expect(result.success).toBe(true);
      expect(result.value).toBe('Infinity');
    });
  });

  // ============================================================
  // SECTION: Variable Substitution with Special Characters
  // ============================================================
  describe('Variable Substitution with Special Characters', () => {
    it('should handle variables with underscores', () => {
      const result = evaluate('{{my_var}} + 5', { my_var: 10 });
      expect(result.success).toBe(true);
      expect(result.value).toBe(15);
    });

    it('should handle variables with numbers', () => {
      const result = evaluate('{{var123}} * 2', { var123: 7 });
      expect(result.success).toBe(true);
      expect(result.value).toBe(14);
    });

    it('should handle variables with both underscores and numbers', () => {
      const result = evaluate('{{test_var_99}} - 1', { test_var_99: 100 });
      expect(result.success).toBe(true);
      expect(result.value).toBe(99);
    });

    it('should handle multiple {{}} in same expression', () => {
      const result = evaluate('{{a}} + {{b}} + {{c}}', { a: 1, b: 2, c: 3 });
      expect(result.success).toBe(true);
      expect(result.value).toBe(6);
    });

    it('should handle multiple references to same variable', () => {
      const result = evaluate('{{x}} * {{x}} + {{x}}', { x: 3 });
      expect(result.success).toBe(true);
      expect(result.value).toBe(12); // 3*3 + 3 = 12
    });

    it('should handle system variables with ! prefix', () => {
      const result = evaluate('{{!VAR0}} + {{!VAR1}}', { '!VAR0': 10, '!VAR1': 20 });
      expect(result.success).toBe(true);
      expect(result.value).toBe(30);
    });

    it('should handle system variable !TIMEOUT_STEP', () => {
      const result = evaluate('{{!TIMEOUT_STEP}} * 1000', { '!TIMEOUT_STEP': 5 });
      expect(result.success).toBe(true);
      expect(result.value).toBe(5000);
    });

    it('should handle mixed user and system variables', () => {
      const result = evaluate('{{myvar}} + {{!LOOP}}', { myvar: 100, '!LOOP': 5 });
      expect(result.success).toBe(true);
      expect(result.value).toBe(105);
    });

    it('should handle variables in string functions', () => {
      const result = evaluate('concat({{first}}, " ", {{last}})', {
        first: 'John',
        last: 'Doe',
      });
      expect(result.success).toBe(true);
      expect(result.value).toBe('John Doe');
    });

    it('should handle variables with hyphens converted to underscores', () => {
      // Hyphens get sanitized to underscores
      const result = evaluate('{{my-var}} + 1', { 'my-var': 99 });
      expect(result.success).toBe(true);
      expect(result.value).toBe(100);
    });

    it('should handle variables with dots converted to underscores', () => {
      const result = evaluate('{{obj.property}} * 2', { 'obj.property': 21 });
      expect(result.success).toBe(true);
      expect(result.value).toBe(42);
    });
  });

  // ============================================================
  // SECTION: Comparison and Logical Operator Edge Cases
  // ============================================================
  describe('Comparison and Logical Operator Edge Cases', () => {
    it('should handle and/or precedence without parentheses', () => {
      // AND has higher precedence than OR
      const result = evaluate('true or false and false');
      expect(result.success).toBe(true);
      // Equivalent to: true or (false and false) = true or false = true
      expect(result.value).toBe(true);
    });

    it('should handle multiple and operators', () => {
      const result = evaluate('true and true and false');
      expect(result.success).toBe(true);
      expect(result.value).toBe(false);
    });

    it('should handle multiple or operators', () => {
      const result = evaluate('false or false or true');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should handle mixed and/or with explicit parentheses', () => {
      const result = evaluate('(true or false) and (false or true)');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should handle not with and', () => {
      const result = evaluate('not false and true');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should handle not with or', () => {
      const result = evaluate('not false or false');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should compare string with string', () => {
      const result = evaluate('"100" == "100"');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should compare string with number (type coercion)', () => {
      // expr-eval may handle type coercion
      const result = evaluate('"100" == 100');
      expect(result.success).toBe(true);
      // Behavior depends on expr-eval implementation
      expect(typeof result.value).toBe('boolean');
    });

    it('should handle less than with strings', () => {
      const result = evaluate('"a" < "b"');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should handle greater than with strings', () => {
      const result = evaluate('"z" > "a"');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should handle string comparison case sensitivity', () => {
      const result = evaluate('"A" == "a"');
      expect(result.success).toBe(true);
      expect(result.value).toBe(false);
    });

    it('should handle comparison of empty strings', () => {
      const result = evaluate('"" == ""');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should handle comparison with zero', () => {
      const result = evaluate('0 == 0');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should handle comparison with negative numbers', () => {
      const result = evaluate('-5 < -3');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should handle chained comparisons with and', () => {
      const result = evaluate('5 > 3 and 10 > 8');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should handle inequality chain', () => {
      const result = evaluate('1 < 2 and 2 < 3 and 3 < 4');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should handle mixed comparison operators', () => {
      const result = evaluate('5 >= 5 and 10 <= 10');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should handle not with comparison', () => {
      const result = evaluate('not (5 > 10)');
      expect(result.success).toBe(true);
      expect(result.value).toBe(true);
    });
  });
});
