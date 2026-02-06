/**
 * Code Instrumenter for JavaScript Macro Debugger
 *
 * Uses Acorn to parse JavaScript code and instruments it for step-through debugging.
 * Inserts debug hooks at statement boundaries to enable pause points.
 */
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

/**
 * Source location information
 */
export interface SourceLocation {
  line: number;
  column: number;
}

/**
 * Instrumentation options
 */
export interface InstrumentOptions {
  /** Name of the debug hook function to call */
  debugHookName: string;
  /** Whether to instrument function entries */
  instrumentFunctionEntry: boolean;
  /** Whether to instrument function exits */
  instrumentFunctionExit: boolean;
  /** Whether to preserve source locations for source maps */
  preserveLocations: boolean;
}

/**
 * Result of code instrumentation
 */
export interface InstrumentResult {
  /** The instrumented code */
  code: string;
  /** Original source code */
  originalCode: string;
  /** Mapping of instrumented lines to original lines */
  lineMapping: Map<number, number>;
  /** List of all instrumentable lines (statement starts) */
  breakpointLines: number[];
  /** Function information for call stack */
  functions: FunctionInfo[];
}

/**
 * Information about a function in the code
 */
export interface FunctionInfo {
  /** Function name (or '<anonymous>') */
  name: string;
  /** Start line */
  startLine: number;
  /** End line */
  endLine: number;
  /** Parameter names */
  params: string[];
}

/**
 * Default instrumentation options
 */
const DEFAULT_OPTIONS: InstrumentOptions = {
  debugHookName: '__debugHook__',
  instrumentFunctionEntry: true,
  instrumentFunctionExit: true,
  preserveLocations: true,
};

/**
 * Instruments JavaScript code for step-through debugging
 */
export class CodeInstrumenter {
  private options: InstrumentOptions;

  constructor(options: Partial<InstrumentOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Parse and instrument JavaScript code
   *
   * @param code - The JavaScript source code
   * @returns Instrumented result with code and metadata
   */
  instrument(code: string): InstrumentResult {
    // Parse the code with location tracking
    const ast = acorn.parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
      ranges: true,
    }) as acorn.Node & { body: acorn.Node[] };

    const breakpointLines: Set<number> = new Set();
    const functions: FunctionInfo[] = [];
    const instrumentationPoints: InstrumentationPoint[] = [];

    // Walk the AST to find instrumentation points
    walk.full(ast, (node: acorn.Node) => {
      const loc = (node as any).loc;
      if (!loc) return;

      // Track statement boundaries for breakpoints
      if (this.isStatement(node)) {
        breakpointLines.add(loc.start.line);
        instrumentationPoints.push({
          type: 'statement',
          line: loc.start.line,
          column: loc.start.column,
          start: (node as any).start,
          end: (node as any).end,
        });
      }

      // Track function declarations and expressions
      if (this.isFunction(node)) {
        const funcNode = node as any;
        const name = funcNode.id?.name || '<anonymous>';
        const params = (funcNode.params || []).map((p: any) => {
          if (p.type === 'Identifier') return p.name;
          if (p.type === 'AssignmentPattern' && p.left?.type === 'Identifier') {
            return p.left.name;
          }
          if (p.type === 'RestElement' && p.argument?.type === 'Identifier') {
            return '...' + p.argument.name;
          }
          return '<destructured>';
        });

        functions.push({
          name,
          startLine: loc.start.line,
          endLine: loc.end.line,
          params,
        });

        if (this.options.instrumentFunctionEntry) {
          instrumentationPoints.push({
            type: 'functionEntry',
            line: loc.start.line,
            column: loc.start.column,
            start: funcNode.body?.start || funcNode.start,
            functionName: name,
          });
        }
      }
    });

    // Sort instrumentation points by position (descending to insert from end)
    instrumentationPoints.sort((a, b) => b.start - a.start);

    // Build instrumented code
    let instrumentedCode = code;
    const hookName = this.options.debugHookName;

    for (const point of instrumentationPoints) {
      if (point.type === 'statement') {
        // Insert debug hook before statement
        const hook = `${hookName}(${point.line}, ${point.column}); `;
        instrumentedCode =
          instrumentedCode.slice(0, point.start) +
          hook +
          instrumentedCode.slice(point.start);
      } else if (point.type === 'functionEntry') {
        // Insert function entry hook at start of function body
        // Find the opening brace
        const bodyStart = point.start;
        const afterBrace = instrumentedCode.indexOf('{', bodyStart) + 1;
        if (afterBrace > 0) {
          const hook = ` ${hookName}(${point.line}, ${point.column}, 'enter', '${point.functionName}');`;
          instrumentedCode =
            instrumentedCode.slice(0, afterBrace) +
            hook +
            instrumentedCode.slice(afterBrace);
        }
      }
    }

    // Create line mapping (instrumented lines to original)
    // Since we insert code, lines may shift
    const lineMapping = this.createLineMapping(code, instrumentedCode);

    return {
      code: instrumentedCode,
      originalCode: code,
      lineMapping,
      breakpointLines: Array.from(breakpointLines).sort((a, b) => a - b),
      functions,
    };
  }

  /**
   * Check if a node is a statement that should have a breakpoint opportunity
   */
  private isStatement(node: acorn.Node): boolean {
    const statementTypes = [
      'ExpressionStatement',
      'VariableDeclaration',
      'ReturnStatement',
      'ThrowStatement',
      'IfStatement',
      'WhileStatement',
      'DoWhileStatement',
      'ForStatement',
      'ForInStatement',
      'ForOfStatement',
      'SwitchStatement',
      'TryStatement',
      'BreakStatement',
      'ContinueStatement',
      'DebuggerStatement',
      'LabeledStatement',
    ];
    return statementTypes.includes(node.type);
  }

  /**
   * Check if a node is a function declaration or expression
   */
  private isFunction(node: acorn.Node): boolean {
    return (
      node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression'
    );
  }

  /**
   * Create a mapping from instrumented code lines to original code lines
   */
  private createLineMapping(original: string, instrumented: string): Map<number, number> {
    const mapping = new Map<number, number>();
    const originalLines = original.split('\n');
    const instrumentedLines = instrumented.split('\n');

    // Simple heuristic: map by matching content patterns
    // This is a simplified version; a full implementation would use source maps
    let origLine = 1;
    for (let instLine = 1; instLine <= instrumentedLines.length; instLine++) {
      if (origLine <= originalLines.length) {
        mapping.set(instLine, origLine);
        // Check if the instrumented line contains content from the next original line
        const stripped = instrumentedLines[instLine - 1]
          .replace(new RegExp(`${this.options.debugHookName}\\([^)]+\\);?\\s*`, 'g'), '')
          .trim();
        const origStripped = originalLines[origLine - 1]?.trim() || '';
        if (stripped.includes(origStripped) || stripped === '') {
          origLine++;
        }
      }
    }

    return mapping;
  }

  /**
   * Extract variable names from a scope at a given position
   *
   * @param code - The JavaScript source code
   * @param line - Line number (1-indexed)
   * @param column - Column number (0-indexed)
   * @returns List of variable names in scope
   */
  extractVariablesInScope(code: string, line: number, column: number): string[] {
    const ast = acorn.parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
    }) as acorn.Node;

    const variables: Set<string> = new Set();
    const targetPos = { line, column };

    // Walk the tree and collect variables that are in scope at the position
    walk.ancestor(ast, {
      VariableDeclarator(node: acorn.Node, ancestors: acorn.Node[]) {
        const varNode = node as any;
        const loc = varNode.loc;
        if (!loc) return;

        // Check if this declaration is before our target position
        if (
          loc.start.line < targetPos.line ||
          (loc.start.line === targetPos.line && loc.start.column <= targetPos.column)
        ) {
          // Check if we're in the same scope
          const declarationScope = this.findContainingScope(ancestors);
          if (declarationScope) {
            if (varNode.id?.type === 'Identifier') {
              variables.add(varNode.id.name);
            } else if (varNode.id?.type === 'ObjectPattern') {
              this.extractPatternNames(varNode.id, variables);
            } else if (varNode.id?.type === 'ArrayPattern') {
              this.extractPatternNames(varNode.id, variables);
            }
          }
        }
      },
      FunctionDeclaration(node: acorn.Node) {
        const funcNode = node as any;
        if (funcNode.id?.name) {
          variables.add(funcNode.id.name);
        }
        // Add parameters
        for (const param of funcNode.params || []) {
          if (param.type === 'Identifier') {
            variables.add(param.name);
          }
        }
      },
      FunctionExpression(node: acorn.Node) {
        const funcNode = node as any;
        for (const param of funcNode.params || []) {
          if (param.type === 'Identifier') {
            variables.add(param.name);
          }
        }
      },
      ArrowFunctionExpression(node: acorn.Node) {
        const funcNode = node as any;
        for (const param of funcNode.params || []) {
          if (param.type === 'Identifier') {
            variables.add(param.name);
          }
        }
      },
    } as any);

    return Array.from(variables);
  }

  /**
   * Find the containing scope (function or program) for a node
   */
  private findContainingScope(ancestors: acorn.Node[]): acorn.Node | null {
    for (let i = ancestors.length - 1; i >= 0; i--) {
      const node = ancestors[i];
      if (
        node.type === 'FunctionDeclaration' ||
        node.type === 'FunctionExpression' ||
        node.type === 'ArrowFunctionExpression' ||
        node.type === 'Program'
      ) {
        return node;
      }
    }
    return null;
  }

  /**
   * Extract variable names from destructuring patterns
   */
  private extractPatternNames(pattern: any, variables: Set<string>): void {
    if (pattern.type === 'Identifier') {
      variables.add(pattern.name);
    } else if (pattern.type === 'ObjectPattern') {
      for (const prop of pattern.properties || []) {
        if (prop.type === 'Property' && prop.value) {
          this.extractPatternNames(prop.value, variables);
        } else if (prop.type === 'RestElement') {
          this.extractPatternNames(prop.argument, variables);
        }
      }
    } else if (pattern.type === 'ArrayPattern') {
      for (const elem of pattern.elements || []) {
        if (elem) {
          this.extractPatternNames(elem, variables);
        }
      }
    } else if (pattern.type === 'RestElement') {
      this.extractPatternNames(pattern.argument, variables);
    } else if (pattern.type === 'AssignmentPattern') {
      this.extractPatternNames(pattern.left, variables);
    }
  }

  /**
   * Validate JavaScript code syntax
   *
   * @param code - The JavaScript source code
   * @returns Null if valid, or an error object if invalid
   */
  validateSyntax(code: string): SyntaxValidationError | null {
    try {
      acorn.parse(code, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true,
      });
      return null;
    } catch (error) {
      if (error instanceof SyntaxError) {
        const acornError = error as any;
        return {
          message: error.message,
          line: acornError.loc?.line || 1,
          column: acornError.loc?.column || 0,
          pos: acornError.pos || 0,
        };
      }
      throw error;
    }
  }
}

/**
 * Internal type for tracking where to insert instrumentation
 */
interface InstrumentationPoint {
  type: 'statement' | 'functionEntry' | 'functionExit';
  line: number;
  column: number;
  start: number;
  end?: number;
  functionName?: string;
}

/**
 * Syntax validation error information
 */
export interface SyntaxValidationError {
  message: string;
  line: number;
  column: number;
  pos: number;
}

export default CodeInstrumenter;
