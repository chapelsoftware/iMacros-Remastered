/**
 * Safe Expression Evaluator for iMacros
 *
 * Uses expr-eval library to safely evaluate expressions without code injection.
 * Replaces eval() with a sandboxed expression parser.
 *
 * Supports:
 * - Arithmetic operations (+, -, *, /, %)
 * - String concatenation
 * - Variable references (integrates with variable system)
 * - Comparison operators (==, !=, <, <=, >, >=)
 * - Logical operators (and, or, not)
 * - Built-in functions (abs, ceil, floor, round, min, max, etc.)
 */

import { Parser, Expression } from 'expr-eval';

/**
 * Error signal thrown by the MacroError() function in expressions.
 * When caught, it indicates the macro should stop execution gracefully.
 */
export class MacroErrorSignal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MacroErrorSignal';
  }
}

/**
 * Variable provider interface for resolving variable values
 */
export interface VariableProvider {
  get(name: string): string | number | boolean | undefined;
  has(name: string): boolean;
}

/**
 * Simple map-based variable provider
 */
export class MapVariableProvider implements VariableProvider {
  private variables: Map<string, string | number | boolean>;

  constructor(initialValues?: Record<string, string | number | boolean>) {
    this.variables = new Map();
    if (initialValues) {
      for (const [key, value] of Object.entries(initialValues)) {
        this.variables.set(key, value);
      }
    }
  }

  get(name: string): string | number | boolean | undefined {
    return this.variables.get(name);
  }

  has(name: string): boolean {
    return this.variables.has(name);
  }

  set(name: string, value: string | number | boolean): void {
    this.variables.set(name, value);
  }

  delete(name: string): boolean {
    return this.variables.delete(name);
  }

  clear(): void {
    this.variables.clear();
  }

  getAll(): Record<string, string | number | boolean> {
    const result: Record<string, string | number | boolean> = {};
    for (const [key, value] of this.variables) {
      result[key] = value;
    }
    return result;
  }
}

/**
 * Result of expression evaluation
 */
export interface EvaluationResult {
  success: boolean;
  value?: string | number | boolean;
  error?: string;
}

/**
 * Options for expression evaluation
 */
export interface EvaluatorOptions {
  /** Allow string operations (default: true) */
  allowStrings?: boolean;
  /** Allow comparison operators (default: true) */
  allowComparisons?: boolean;
  /** Allow logical operators (default: true) */
  allowLogical?: boolean;
  /** Maximum expression length (default: 10000) */
  maxLength?: number;
}

const DEFAULT_OPTIONS: Required<EvaluatorOptions> = {
  allowStrings: true,
  allowComparisons: true,
  allowLogical: true,
  maxLength: 10000,
};

/**
 * Create a configured parser with custom functions
 */
function createParser(): Parser {
  const parser = new Parser();

  // Add string functions
  parser.functions.concat = function (...args: unknown[]) {
    return args.map(String).join('');
  };

  parser.functions.length = function (s: unknown) {
    return String(s).length;
  };

  parser.functions.substr = function (s: unknown, start: number, len?: number) {
    const str = String(s);
    if (len === undefined) {
      return str.substring(start);
    }
    return str.substring(start, start + len);
  };

  parser.functions.substring = function (s: unknown, start: number, end?: number) {
    return String(s).substring(start, end);
  };

  parser.functions.upper = function (s: unknown) {
    return String(s).toUpperCase();
  };

  parser.functions.lower = function (s: unknown) {
    return String(s).toLowerCase();
  };

  parser.functions.trim = function (s: unknown) {
    return String(s).trim();
  };

  parser.functions.indexOf = function (s: unknown, search: unknown) {
    return String(s).indexOf(String(search));
  };

  parser.functions.replace = function (s: unknown, search: unknown, replacement: unknown) {
    return String(s).replace(String(search), String(replacement));
  };

  // Add type conversion functions
  parser.functions.str = function (val: unknown) {
    return String(val);
  };

  parser.functions.num = function (val: unknown) {
    const result = Number(val);
    if (isNaN(result)) {
      throw new Error(`Cannot convert "${val}" to number`);
    }
    return result;
  };

  parser.functions.int = function (val: unknown) {
    const result = parseInt(String(val), 10);
    if (isNaN(result)) {
      throw new Error(`Cannot convert "${val}" to integer`);
    }
    return result;
  };

  parser.functions.float = function (val: unknown) {
    const result = parseFloat(String(val));
    if (isNaN(result)) {
      throw new Error(`Cannot convert "${val}" to float`);
    }
    return result;
  };

  // Add conditional function
  parser.functions.iif = function (condition: unknown, trueValue: unknown, falseValue: unknown) {
    return condition ? trueValue : falseValue;
  };

  // MacroError() function - throws MacroErrorSignal to stop execution
  parser.functions.MacroError = function (msg: unknown) {
    throw new MacroErrorSignal(String(msg));
  };

  // Math functions
  parser.functions.random = function () {
    return Math.random();
  };
  parser.functions.pow = function (base: unknown, exp: unknown) {
    return Math.pow(Number(base), Number(exp));
  };
  parser.functions.log = function (val: unknown) {
    return Math.log(Number(val));
  };
  parser.functions.exp = function (val: unknown) {
    return Math.exp(Number(val));
  };
  parser.functions.sin = function (val: unknown) {
    return Math.sin(Number(val));
  };
  parser.functions.cos = function (val: unknown) {
    return Math.cos(Number(val));
  };
  parser.functions.tan = function (val: unknown) {
    return Math.tan(Number(val));
  };
  parser.functions.sqrt = function (val: unknown) {
    return Math.sqrt(Number(val));
  };
  parser.functions.date_now = function () {
    return Date.now();
  };
  parser.functions.parse_int = function (val: unknown, radix?: unknown) {
    return parseInt(String(val), radix ? Number(radix) : 10);
  };
  parser.functions.parse_float = function (val: unknown) {
    return parseFloat(String(val));
  };
  parser.functions.char_at = function (s: unknown, index: unknown) {
    return String(s).charAt(Number(index));
  };
  parser.functions.split_get = function (s: unknown, delimiter: unknown, index: unknown) {
    const parts = String(s).split(String(delimiter));
    const i = Number(index);
    return i >= 0 && i < parts.length ? parts[i] : '';
  };

  // Constants
  parser.consts.PI = Math.PI;
  parser.consts.E = Math.E;

  return parser;
}

/**
 * Sanitize variable name for use in expressions
 * Converts iMacros variable names (like !VAR0) to valid identifiers
 */
export function sanitizeVariableName(name: string): string {
  // Replace ! with underscore prefix for system variables
  if (name.startsWith('!')) {
    return '_SYS_' + name.slice(1).replace(/[^a-zA-Z0-9_]/g, '_');
  }
  // Replace any invalid characters with underscores
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Extract variable references from an expression string
 * Looks for {{varname}} patterns
 */
export function extractExpressionVariables(expr: string): string[] {
  const variables: string[] = [];
  const regex = /\{\{([^}]+)\}\}/g;
  let match;

  while ((match = regex.exec(expr)) !== null) {
    const name = match[1];
    if (!variables.includes(name)) {
      variables.push(name);
    }
  }

  return variables;
}

/**
 * Safe Expression Evaluator
 *
 * Provides safe expression evaluation without code injection risks.
 * Uses expr-eval library for parsing and evaluation.
 */
export class ExpressionEvaluator {
  private parser: Parser;
  private options: Required<EvaluatorOptions>;

  constructor(options?: EvaluatorOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.parser = createParser();
  }

  /**
   * Evaluate an expression with optional variable provider
   *
   * @param expression - The expression to evaluate
   * @param variables - Optional variable provider or object with variable values
   * @returns Evaluation result
   */
  evaluate(
    expression: string,
    variables?: VariableProvider | Record<string, string | number | boolean>
  ): EvaluationResult {
    // Validate expression length
    if (expression.length > this.options.maxLength) {
      return {
        success: false,
        error: `Expression exceeds maximum length of ${this.options.maxLength} characters`,
      };
    }

    try {
      // Pre-process: Replace {{varname}} with sanitized variable names
      const varRefs = extractExpressionVariables(expression);
      let processedExpr = expression;
      const varMap: Record<string, string | number | boolean> = {};

      // Build variable map with sanitized names
      for (const varName of varRefs) {
        const sanitized = sanitizeVariableName(varName);
        processedExpr = processedExpr.replace(
          new RegExp(`\\{\\{${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g'),
          sanitized
        );

        // Get variable value
        let value: string | number | boolean | undefined;
        if (variables) {
          if ('get' in variables && typeof variables.get === 'function') {
            value = variables.get(varName);
          } else {
            value = (variables as Record<string, string | number | boolean>)[varName];
          }
        }

        // Default to empty string if variable not found
        varMap[sanitized] = value !== undefined ? value : '';
      }

      // Handle string concatenation with + operator for string values
      // expr-eval handles this natively when operands are strings

      // Parse and evaluate
      const parsed: Expression = this.parser.parse(processedExpr);
      const result = parsed.evaluate(varMap as Record<string, number | string>);

      return {
        success: true,
        value: result,
      };
    } catch (error) {
      // Re-throw MacroErrorSignal so callers can handle it
      if (error instanceof MacroErrorSignal) {
        throw error;
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Check if an expression is valid without evaluating it
   *
   * @param expression - The expression to validate
   * @returns True if the expression is syntactically valid
   */
  isValid(expression: string): boolean {
    if (expression.length > this.options.maxLength) {
      return false;
    }

    try {
      // Pre-process variable references
      const varRefs = extractExpressionVariables(expression);
      let processedExpr = expression;

      for (const varName of varRefs) {
        const sanitized = sanitizeVariableName(varName);
        processedExpr = processedExpr.replace(
          new RegExp(`\\{\\{${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g'),
          sanitized
        );
      }

      this.parser.parse(processedExpr);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the variables referenced in an expression
   *
   * @param expression - The expression to analyze
   * @returns Array of variable names (in original form, e.g., "!VAR0")
   */
  getVariables(expression: string): string[] {
    return extractExpressionVariables(expression);
  }

  /**
   * Evaluate a simple arithmetic expression
   * Convenience method for basic math operations
   *
   * @param expression - Simple arithmetic expression
   * @returns The numeric result
   * @throws Error if evaluation fails or result is not a number
   */
  evaluateArithmetic(expression: string): number {
    const result = this.evaluate(expression);
    if (!result.success) {
      throw new Error(result.error);
    }
    if (typeof result.value !== 'number') {
      throw new Error(`Expected numeric result, got ${typeof result.value}`);
    }
    return result.value;
  }

  /**
   * Evaluate a comparison expression
   * Convenience method for boolean operations
   *
   * @param expression - Comparison expression
   * @param variables - Optional variables
   * @returns The boolean result
   * @throws Error if evaluation fails
   */
  evaluateComparison(
    expression: string,
    variables?: VariableProvider | Record<string, string | number | boolean>
  ): boolean {
    const result = this.evaluate(expression, variables);
    if (!result.success) {
      throw new Error(result.error);
    }
    return Boolean(result.value);
  }

  /**
   * Evaluate a string expression
   * Convenience method for string operations
   *
   * @param expression - String expression (may include concatenation)
   * @param variables - Optional variables
   * @returns The string result
   * @throws Error if evaluation fails
   */
  evaluateString(
    expression: string,
    variables?: VariableProvider | Record<string, string | number | boolean>
  ): string {
    const result = this.evaluate(expression, variables);
    if (!result.success) {
      throw new Error(result.error);
    }
    return String(result.value);
  }
}

/**
 * Create a new expression evaluator with default options
 */
export function createEvaluator(options?: EvaluatorOptions): ExpressionEvaluator {
  return new ExpressionEvaluator(options);
}

/**
 * Default evaluator instance for simple use cases
 */
export const defaultEvaluator = new ExpressionEvaluator();

/**
 * Quick evaluation function using default evaluator
 *
 * @param expression - The expression to evaluate
 * @param variables - Optional variables
 * @returns Evaluation result
 */
export function evaluate(
  expression: string,
  variables?: VariableProvider | Record<string, string | number | boolean>
): EvaluationResult {
  return defaultEvaluator.evaluate(expression, variables);
}

/**
 * Preprocess JavaScript-style Math.*, Date.now(), parseInt/parseFloat
 * expressions into forms compatible with the expr-eval parser.
 */
export function preprocessMathExpressions(expr: string): string {
  let result = expr;
  // Math.* methods -> custom functions
  result = result.replace(/Math\.floor\s*\(/g, 'floor(');
  result = result.replace(/Math\.ceil\s*\(/g, 'ceil(');
  result = result.replace(/Math\.round\s*\(/g, 'round(');
  result = result.replace(/Math\.abs\s*\(/g, 'abs(');
  result = result.replace(/Math\.min\s*\(/g, 'min(');
  result = result.replace(/Math\.max\s*\(/g, 'max(');
  result = result.replace(/Math\.random\s*\(\s*\)/g, 'random()');
  result = result.replace(/Math\.pow\s*\(/g, 'pow(');
  result = result.replace(/Math\.log\s*\(/g, 'log(');
  result = result.replace(/Math\.exp\s*\(/g, 'exp(');
  result = result.replace(/Math\.sin\s*\(/g, 'sin(');
  result = result.replace(/Math\.cos\s*\(/g, 'cos(');
  result = result.replace(/Math\.tan\s*\(/g, 'tan(');
  result = result.replace(/Math\.sqrt\s*\(/g, 'sqrt(');
  result = result.replace(/Math\.PI/g, 'PI');
  result = result.replace(/Math\.E/g, 'E');
  // Date.now()
  result = result.replace(/Date\.now\s*\(\s*\)/g, 'date_now()');
  // parseInt/parseFloat
  result = result.replace(/parseInt\s*\(/g, 'parse_int(');
  result = result.replace(/parseFloat\s*\(/g, 'parse_float(');
  return result;
}
