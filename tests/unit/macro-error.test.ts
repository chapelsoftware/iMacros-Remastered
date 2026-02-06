import { describe, it, expect } from 'vitest';
import { ExpressionEvaluator, MacroErrorSignal } from '@shared/expression-evaluator';
import { VariableContext, executeSet } from '@shared/variables';

describe('MacroError() function', () => {
  it('throws MacroErrorSignal when MacroError() is called in expression', () => {
    const evaluator = new ExpressionEvaluator();
    expect(() => evaluator.evaluate('MacroError("test error")')).toThrow(MacroErrorSignal);
    try {
      evaluator.evaluate('MacroError("test error")');
    } catch (e) {
      expect(e).toBeInstanceOf(MacroErrorSignal);
      expect((e as MacroErrorSignal).message).toContain('test error');
    }
  });

  it('MacroErrorSignal is catchable', () => {
    expect(() => {
      throw new MacroErrorSignal('test');
    }).toThrow(MacroErrorSignal);
  });

  it('SET with EVAL MacroError sets macroError flag', () => {
    const context = new VariableContext();
    const result = executeSet(context, '!VAR1', 'EVAL("MacroError(\\"stop here\\")")') as any;
    expect(result.macroError).toBe(true);
    expect(result.errorMessage).toContain('stop here');
  });
});
