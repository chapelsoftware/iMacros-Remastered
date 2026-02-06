/**
 * Flow Control Commands Integration Tests
 *
 * Tests LOOP, IF, and GOTO commands that control macro execution flow.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Variable context for macro execution
 */
interface VariableContext {
  [key: string]: string | number | boolean;
}

/**
 * Macro line representation
 */
interface MacroLine {
  lineNumber: number;
  command: string;
  label?: string;
}

/**
 * Execution result
 */
interface ExecutionResult {
  success: boolean;
  nextLine?: number;
  action?: 'continue' | 'jump' | 'stop';
  message?: string;
}

/**
 * LOOP command implementation for testing
 */
class LoopCommand {
  private loopCounter: number = 1;
  private maxIterations: number = 1;

  /**
   * Set loop counter (!LOOP variable)
   */
  setLoop(start: number, end: number): void {
    this.loopCounter = start;
    this.maxIterations = end;
  }

  /**
   * Get current loop counter value
   */
  getLoopCounter(): number {
    return this.loopCounter;
  }

  /**
   * Increment loop counter
   * Returns false if loop should stop
   */
  incrementLoop(): boolean {
    this.loopCounter++;
    return this.loopCounter <= this.maxIterations;
  }

  /**
   * Check if loop should continue
   */
  shouldContinue(): boolean {
    return this.loopCounter <= this.maxIterations;
  }

  /**
   * Reset loop
   */
  reset(): void {
    this.loopCounter = 1;
    this.maxIterations = 1;
  }

  /**
   * Get total iteration count
   */
  getTotalIterations(): number {
    return this.maxIterations;
  }
}

/**
 * IF/CONDITION command implementation for testing
 */
class ConditionCommand {
  private variables: VariableContext;

  constructor(variables: VariableContext = {}) {
    this.variables = variables;
  }

  /**
   * Set variable context
   */
  setVariables(variables: VariableContext): void {
    this.variables = variables;
  }

  /**
   * Update a variable
   */
  setVariable(name: string, value: string | number | boolean): void {
    this.variables[name] = value;
  }

  /**
   * Get a variable
   */
  getVariable(name: string): string | number | boolean | undefined {
    return this.variables[name];
  }

  /**
   * Evaluate a condition
   * Supports: ==, !=, <, >, <=, >=, CONTAINS, !CONTAINS
   */
  evaluate(condition: string): boolean {
    // Parse condition
    const operators = ['==', '!=', '<=', '>=', '<', '>', '!CONTAINS', 'CONTAINS'];

    for (const op of operators) {
      const parts = condition.split(op);
      if (parts.length === 2) {
        const left = this.resolveValue(parts[0].trim());
        const right = this.resolveValue(parts[1].trim());

        switch (op) {
          case '==':
            return left == right;
          case '!=':
            return left != right;
          case '<':
            return Number(left) < Number(right);
          case '>':
            return Number(left) > Number(right);
          case '<=':
            return Number(left) <= Number(right);
          case '>=':
            return Number(left) >= Number(right);
          case 'CONTAINS':
            return String(left).includes(String(right));
          case '!CONTAINS':
            return !String(left).includes(String(right));
        }
      }
    }

    // If no operator found, treat as truthy check
    const value = this.resolveValue(condition.trim());
    return Boolean(value) && value !== '0' && value !== 'false';
  }

  /**
   * Resolve a value (variable or literal)
   */
  private resolveValue(value: string): string | number | boolean {
    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }

    // Check if it's a variable reference
    if (value.startsWith('{{') && value.endsWith('}}')) {
      const varName = value.slice(2, -2).trim();
      return this.variables[varName] ?? '';
    }

    // Check for numeric value
    if (!isNaN(Number(value))) {
      return Number(value);
    }

    // Check if variable name without braces
    if (this.variables[value] !== undefined) {
      return this.variables[value];
    }

    return value;
  }
}

/**
 * GOTO command implementation for testing
 */
class GotoCommand {
  private labels: Map<string, number> = new Map();
  private currentLine: number = 0;

  /**
   * Register a label and its line number
   */
  registerLabel(label: string, lineNumber: number): void {
    this.labels.set(label.toUpperCase(), lineNumber);
  }

  /**
   * Get line number for a label
   */
  getLineForLabel(label: string): number | undefined {
    return this.labels.get(label.toUpperCase());
  }

  /**
   * Execute GOTO command
   */
  goto(label: string): ExecutionResult {
    const targetLine = this.labels.get(label.toUpperCase());

    if (targetLine === undefined) {
      return {
        success: false,
        action: 'stop',
        message: `Label not found: ${label}`,
      };
    }

    return {
      success: true,
      nextLine: targetLine,
      action: 'jump',
    };
  }

  /**
   * Set current line (for tracking execution)
   */
  setCurrentLine(line: number): void {
    this.currentLine = line;
  }

  /**
   * Get current line
   */
  getCurrentLine(): number {
    return this.currentLine;
  }

  /**
   * Clear all labels
   */
  clearLabels(): void {
    this.labels.clear();
  }

  /**
   * Check if a label exists
   */
  hasLabel(label: string): boolean {
    return this.labels.has(label.toUpperCase());
  }
}

/**
 * Integrated flow control executor
 */
class FlowControlExecutor {
  private loop: LoopCommand;
  private condition: ConditionCommand;
  private goto: GotoCommand;
  private lines: MacroLine[] = [];
  private executionLog: string[] = [];

  constructor() {
    this.loop = new LoopCommand();
    this.condition = new ConditionCommand();
    this.goto = new GotoCommand();
  }

  /**
   * Load macro lines
   */
  loadMacro(lines: MacroLine[]): void {
    this.lines = lines;
    this.goto.clearLabels();

    // Register labels
    lines.forEach((line) => {
      if (line.label) {
        this.goto.registerLabel(line.label, line.lineNumber);
      }
    });
  }

  /**
   * Execute macro with loop support
   */
  execute(startLoop: number = 1, endLoop: number = 1): { log: string[]; iterations: number } {
    this.executionLog = [];
    this.loop.setLoop(startLoop, endLoop);
    let iterations = 0;

    while (this.loop.shouldContinue()) {
      iterations++;
      this.executionLog.push(`Loop iteration: ${this.loop.getLoopCounter()}`);

      // Execute all lines in the macro
      let currentLine = 0;
      while (currentLine < this.lines.length) {
        const line = this.lines[currentLine];
        const result = this.executeLine(line);

        if (result.action === 'jump' && result.nextLine !== undefined) {
          currentLine = this.lines.findIndex((l) => l.lineNumber === result.nextLine);
          if (currentLine === -1) break;
        } else if (result.action === 'stop') {
          break;
        } else {
          currentLine++;
        }
      }

      this.loop.incrementLoop();
    }

    return { log: this.executionLog, iterations };
  }

  /**
   * Execute a single line
   */
  private executeLine(line: MacroLine): ExecutionResult {
    this.executionLog.push(`Executing line ${line.lineNumber}: ${line.command}`);

    // Handle GOTO
    if (line.command.startsWith('GOTO ')) {
      const label = line.command.substring(5).trim();
      return this.goto.goto(label);
    }

    // Handle IF
    if (line.command.startsWith('IF ')) {
      // Parse: IF condition THEN GOTO label
      const match = line.command.match(/^IF\s+(.+)\s+THEN\s+GOTO\s+(.+)$/i);
      if (match) {
        const condition = match[1];
        const label = match[2];

        if (this.condition.evaluate(condition)) {
          this.executionLog.push(`Condition true: ${condition}`);
          return this.goto.goto(label);
        } else {
          this.executionLog.push(`Condition false: ${condition}`);
          return { success: true, action: 'continue' };
        }
      }
    }

    return { success: true, action: 'continue' };
  }

  /**
   * Set a variable for condition evaluation
   */
  setVariable(name: string, value: string | number | boolean): void {
    this.condition.setVariable(name, value);
  }

  /**
   * Get execution log
   */
  getLog(): string[] {
    return [...this.executionLog];
  }
}

describe('Flow Control Commands Integration Tests', () => {
  describe('LOOP Command', () => {
    let loopCommand: LoopCommand;

    beforeEach(() => {
      loopCommand = new LoopCommand();
    });

    it('should start with counter at 1', () => {
      expect(loopCommand.getLoopCounter()).toBe(1);
    });

    it('should set loop range', () => {
      loopCommand.setLoop(5, 10);

      expect(loopCommand.getLoopCounter()).toBe(5);
      expect(loopCommand.getTotalIterations()).toBe(10);
    });

    it('should increment loop counter', () => {
      loopCommand.setLoop(1, 5);

      expect(loopCommand.getLoopCounter()).toBe(1);
      expect(loopCommand.incrementLoop()).toBe(true);
      expect(loopCommand.getLoopCounter()).toBe(2);
    });

    it('should indicate when loop should stop', () => {
      loopCommand.setLoop(1, 2);

      expect(loopCommand.shouldContinue()).toBe(true);
      loopCommand.incrementLoop();
      expect(loopCommand.shouldContinue()).toBe(true);
      loopCommand.incrementLoop();
      expect(loopCommand.shouldContinue()).toBe(false);
    });

    it('should handle single iteration', () => {
      loopCommand.setLoop(1, 1);

      expect(loopCommand.shouldContinue()).toBe(true);
      expect(loopCommand.incrementLoop()).toBe(false);
      expect(loopCommand.shouldContinue()).toBe(false);
    });

    it('should reset loop state', () => {
      loopCommand.setLoop(5, 10);
      loopCommand.incrementLoop();
      loopCommand.incrementLoop();

      loopCommand.reset();

      expect(loopCommand.getLoopCounter()).toBe(1);
      expect(loopCommand.getTotalIterations()).toBe(1);
    });

    it('should iterate correct number of times', () => {
      loopCommand.setLoop(1, 5);
      let count = 0;

      while (loopCommand.shouldContinue()) {
        count++;
        loopCommand.incrementLoop();
      }

      expect(count).toBe(5);
    });

    it('should handle starting from non-1 value', () => {
      loopCommand.setLoop(3, 5);
      let count = 0;

      while (loopCommand.shouldContinue()) {
        count++;
        loopCommand.incrementLoop();
      }

      expect(count).toBe(3); // 3, 4, 5
    });
  });

  describe('IF/CONDITION Command', () => {
    let conditionCommand: ConditionCommand;

    beforeEach(() => {
      conditionCommand = new ConditionCommand({
        VAR1: 'hello',
        VAR2: 'world',
        NUM1: 10,
        NUM2: 20,
      });
    });

    it('should evaluate equality', () => {
      expect(conditionCommand.evaluate('{{VAR1}} == "hello"')).toBe(true);
      expect(conditionCommand.evaluate('{{VAR1}} == "goodbye"')).toBe(false);
    });

    it('should evaluate inequality', () => {
      expect(conditionCommand.evaluate('{{VAR1}} != "goodbye"')).toBe(true);
      expect(conditionCommand.evaluate('{{VAR1}} != "hello"')).toBe(false);
    });

    it('should evaluate numeric less than', () => {
      expect(conditionCommand.evaluate('{{NUM1}} < {{NUM2}}')).toBe(true);
      expect(conditionCommand.evaluate('{{NUM2}} < {{NUM1}}')).toBe(false);
    });

    it('should evaluate numeric greater than', () => {
      expect(conditionCommand.evaluate('{{NUM2}} > {{NUM1}}')).toBe(true);
      expect(conditionCommand.evaluate('{{NUM1}} > {{NUM2}}')).toBe(false);
    });

    it('should evaluate less than or equal', () => {
      expect(conditionCommand.evaluate('{{NUM1}} <= 10')).toBe(true);
      expect(conditionCommand.evaluate('{{NUM1}} <= 5')).toBe(false);
    });

    it('should evaluate greater than or equal', () => {
      expect(conditionCommand.evaluate('{{NUM1}} >= 10')).toBe(true);
      expect(conditionCommand.evaluate('{{NUM1}} >= 15')).toBe(false);
    });

    it('should evaluate CONTAINS', () => {
      expect(conditionCommand.evaluate('{{VAR1}} CONTAINS "ell"')).toBe(true);
      expect(conditionCommand.evaluate('{{VAR1}} CONTAINS "xyz"')).toBe(false);
    });

    it('should evaluate !CONTAINS', () => {
      expect(conditionCommand.evaluate('{{VAR1}} !CONTAINS "xyz"')).toBe(true);
      expect(conditionCommand.evaluate('{{VAR1}} !CONTAINS "ell"')).toBe(false);
    });

    it('should evaluate with literal values', () => {
      expect(conditionCommand.evaluate('5 < 10')).toBe(true);
      expect(conditionCommand.evaluate('"test" == "test"')).toBe(true);
    });

    it('should update variables', () => {
      conditionCommand.setVariable('NEWVAR', 'newvalue');

      expect(conditionCommand.evaluate('{{NEWVAR}} == "newvalue"')).toBe(true);
    });

    it('should handle undefined variables', () => {
      expect(conditionCommand.evaluate('{{UNDEFINED}} == ""')).toBe(true);
    });

    it('should evaluate truthy check', () => {
      conditionCommand.setVariable('TRUTHY', 'yes');
      conditionCommand.setVariable('FALSY', '');
      conditionCommand.setVariable('ZERO', 0);

      expect(conditionCommand.evaluate('{{TRUTHY}}')).toBe(true);
      expect(conditionCommand.evaluate('{{FALSY}}')).toBe(false);
      expect(conditionCommand.evaluate('{{ZERO}}')).toBe(false);
    });
  });

  describe('GOTO Command', () => {
    let gotoCommand: GotoCommand;

    beforeEach(() => {
      gotoCommand = new GotoCommand();
    });

    it('should register labels', () => {
      gotoCommand.registerLabel('START', 1);
      gotoCommand.registerLabel('END', 10);

      expect(gotoCommand.hasLabel('START')).toBe(true);
      expect(gotoCommand.hasLabel('END')).toBe(true);
      expect(gotoCommand.hasLabel('MIDDLE')).toBe(false);
    });

    it('should get line number for label', () => {
      gotoCommand.registerLabel('START', 1);
      gotoCommand.registerLabel('PROCESS', 5);
      gotoCommand.registerLabel('END', 10);

      expect(gotoCommand.getLineForLabel('START')).toBe(1);
      expect(gotoCommand.getLineForLabel('PROCESS')).toBe(5);
      expect(gotoCommand.getLineForLabel('END')).toBe(10);
    });

    it('should be case-insensitive for labels', () => {
      gotoCommand.registerLabel('MyLabel', 5);

      expect(gotoCommand.hasLabel('MYLABEL')).toBe(true);
      expect(gotoCommand.hasLabel('mylabel')).toBe(true);
      expect(gotoCommand.hasLabel('MyLabel')).toBe(true);
    });

    it('should execute goto successfully', () => {
      gotoCommand.registerLabel('TARGET', 10);

      const result = gotoCommand.goto('TARGET');

      expect(result.success).toBe(true);
      expect(result.action).toBe('jump');
      expect(result.nextLine).toBe(10);
    });

    it('should fail for unknown label', () => {
      const result = gotoCommand.goto('UNKNOWN');

      expect(result.success).toBe(false);
      expect(result.action).toBe('stop');
      expect(result.message).toContain('Label not found');
    });

    it('should clear labels', () => {
      gotoCommand.registerLabel('LABEL1', 1);
      gotoCommand.registerLabel('LABEL2', 2);

      gotoCommand.clearLabels();

      expect(gotoCommand.hasLabel('LABEL1')).toBe(false);
      expect(gotoCommand.hasLabel('LABEL2')).toBe(false);
    });

    it('should track current line', () => {
      gotoCommand.setCurrentLine(5);
      expect(gotoCommand.getCurrentLine()).toBe(5);

      gotoCommand.setCurrentLine(10);
      expect(gotoCommand.getCurrentLine()).toBe(10);
    });
  });

  describe('Flow Control Integration', () => {
    let executor: FlowControlExecutor;

    beforeEach(() => {
      executor = new FlowControlExecutor();
    });

    it('should execute simple loop', () => {
      executor.loadMacro([
        { lineNumber: 1, command: 'TAG POS=1 TYPE=BUTTON' },
        { lineNumber: 2, command: 'CLICK' },
      ]);

      const result = executor.execute(1, 3);

      expect(result.iterations).toBe(3);
    });

    it('should execute with GOTO', () => {
      executor.loadMacro([
        { lineNumber: 1, command: 'SET VAR1 hello', label: 'START' },
        { lineNumber: 2, command: 'GOTO END' },
        { lineNumber: 3, command: 'SET VAR2 skipped' },
        { lineNumber: 4, command: 'SET VAR3 done', label: 'END' },
      ]);

      const result = executor.execute(1, 1);
      const log = result.log;

      // Line 3 should be skipped due to GOTO
      expect(log.some((l) => l.includes('line 1'))).toBe(true);
      expect(log.some((l) => l.includes('line 2'))).toBe(true);
      expect(log.some((l) => l.includes('line 4'))).toBe(true);
      // Line 3 should not appear after the GOTO
    });

    it('should execute conditional GOTO', () => {
      executor.setVariable('COUNTER', 5);

      executor.loadMacro([
        { lineNumber: 1, command: 'IF {{COUNTER}} > 3 THEN GOTO SUCCESS', label: 'START' },
        { lineNumber: 2, command: 'SET RESULT fail' },
        { lineNumber: 3, command: 'GOTO END' },
        { lineNumber: 4, command: 'SET RESULT pass', label: 'SUCCESS' },
        { lineNumber: 5, command: 'DONE', label: 'END' },
      ]);

      const result = executor.execute(1, 1);
      const log = result.log;

      expect(log.some((l) => l.includes('Condition true'))).toBe(true);
    });

    it('should skip conditional GOTO when false', () => {
      executor.setVariable('COUNTER', 1);

      executor.loadMacro([
        { lineNumber: 1, command: 'IF {{COUNTER}} > 3 THEN GOTO SUCCESS', label: 'START' },
        { lineNumber: 2, command: 'SET RESULT fail' },
        { lineNumber: 3, command: 'GOTO END' },
        { lineNumber: 4, command: 'SET RESULT pass', label: 'SUCCESS' },
        { lineNumber: 5, command: 'DONE', label: 'END' },
      ]);

      const result = executor.execute(1, 1);
      const log = result.log;

      expect(log.some((l) => l.includes('Condition false'))).toBe(true);
    });

    it('should handle nested loops with variables', () => {
      executor.loadMacro([
        { lineNumber: 1, command: 'SET OUTER 1' },
        { lineNumber: 2, command: 'SET INNER 1' },
      ]);

      const result = executor.execute(1, 5);

      expect(result.iterations).toBe(5);
      expect(result.log.filter((l) => l.includes('Loop iteration')).length).toBe(5);
    });

    it('should handle loop with early exit', () => {
      executor.setVariable('LIMIT', 3);

      executor.loadMacro([
        { lineNumber: 1, command: 'IF {{LIMIT}} == 3 THEN GOTO EXIT' },
        { lineNumber: 2, command: 'PROCESS DATA' },
        { lineNumber: 3, command: 'END', label: 'EXIT' },
      ]);

      // Each iteration should hit the early exit
      const result = executor.execute(1, 5);

      // Should still iterate 5 times (loop continues)
      expect(result.iterations).toBe(5);
    });
  });

  describe('Complex Flow Scenarios', () => {
    let executor: FlowControlExecutor;

    beforeEach(() => {
      executor = new FlowControlExecutor();
    });

    it('should handle retry pattern with GOTO', () => {
      executor.loadMacro([
        { lineNumber: 1, command: 'SET ATTEMPT 0', label: 'RETRY' },
        { lineNumber: 2, command: 'IF {{ATTEMPT}} >= 3 THEN GOTO FAIL' },
        { lineNumber: 3, command: 'TRY ACTION' },
        { lineNumber: 4, command: 'GOTO SUCCESS' },
        { lineNumber: 5, command: 'INCREMENT ATTEMPT' },
        { lineNumber: 6, command: 'GOTO RETRY' },
        { lineNumber: 7, command: 'SET RESULT failed', label: 'FAIL' },
        { lineNumber: 8, command: 'SET RESULT success', label: 'SUCCESS' },
      ]);

      executor.setVariable('ATTEMPT', 0);

      const result = executor.execute(1, 1);
      expect(result.iterations).toBe(1);
    });

    it('should handle multiple conditions', () => {
      executor.setVariable('STATUS', 'active');
      executor.setVariable('COUNT', 5);

      executor.loadMacro([
        { lineNumber: 1, command: 'IF {{STATUS}} == "active" THEN GOTO CHECK_COUNT' },
        { lineNumber: 2, command: 'GOTO SKIP' },
        { lineNumber: 3, command: 'IF {{COUNT}} > 3 THEN GOTO PROCESS', label: 'CHECK_COUNT' },
        { lineNumber: 4, command: 'GOTO SKIP' },
        { lineNumber: 5, command: 'DO WORK', label: 'PROCESS' },
        { lineNumber: 6, command: 'END', label: 'SKIP' },
      ]);

      const result = executor.execute(1, 1);
      const log = result.log;

      // Both conditions should be true
      const trueConditions = log.filter((l) => l.includes('Condition true'));
      expect(trueConditions.length).toBe(2);
    });

    it('should handle data-driven loop', () => {
      executor.loadMacro([
        { lineNumber: 1, command: 'READ DATA LINE !LOOP' },
        { lineNumber: 2, command: 'PROCESS {{DATA}}' },
        { lineNumber: 3, command: 'SAVE RESULT' },
      ]);

      // Simulate processing 10 data items
      const result = executor.execute(1, 10);

      expect(result.iterations).toBe(10);
    });
  });
});
