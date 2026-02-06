import { describe, it, expect } from 'vitest';
import { ExpressionEvaluator, preprocessMathExpressions } from '@shared/expression-evaluator';
import { VariableContext, evaluateExpression } from '@shared/variables';

describe('EVAL() with full JavaScript compatibility', () => {
  describe('preprocessMathExpressions', () => {
    it('transforms Math.floor()', () => {
      expect(preprocessMathExpressions('Math.floor(3.7)')).toBe('floor(3.7)');
    });

    it('transforms Math.random()', () => {
      expect(preprocessMathExpressions('Math.random()')).toBe('random()');
    });

    it('transforms Math.PI', () => {
      expect(preprocessMathExpressions('Math.PI')).toBe('PI');
    });

    it('transforms Date.now()', () => {
      expect(preprocessMathExpressions('Date.now()')).toBe('date_now()');
    });

    it('transforms parseInt()', () => {
      expect(preprocessMathExpressions('parseInt("42")')).toBe('parse_int("42")');
    });

    it('transforms complex expression', () => {
      const input = 'Math.floor(Math.random()*5+1)';
      const expected = 'floor(random()*5+1)';
      expect(preprocessMathExpressions(input)).toBe(expected);
    });
  });

  describe('ExpressionEvaluator with new functions', () => {
    const evaluator = new ExpressionEvaluator();

    it('evaluates random() returns number between 0 and 1', () => {
      const result = evaluator.evaluate('random()');
      expect(result.success).toBe(true);
      expect(result.value).toBeGreaterThanOrEqual(0);
      expect(result.value).toBeLessThan(1);
    });

    it('evaluates pow()', () => {
      const result = evaluator.evaluate('pow(2, 3)');
      expect(result.success).toBe(true);
      expect(result.value).toBe(8);
    });

    it('evaluates sin/cos/tan', () => {
      expect(evaluator.evaluate('sin(0)').value).toBe(0);
      expect(evaluator.evaluate('cos(0)').value).toBe(1);
      expect(evaluator.evaluate('tan(0)').value).toBe(0);
    });

    it('evaluates date_now() returns timestamp', () => {
      const result = evaluator.evaluate('date_now()');
      expect(result.success).toBe(true);
      expect(result.value).toBeGreaterThan(1000000000000);
    });

    it('evaluates parse_int()', () => {
      const result = evaluator.evaluate('parse_int("42")');
      expect(result.success).toBe(true);
      expect(result.value).toBe(42);
    });

    it('evaluates parse_float()', () => {
      const result = evaluator.evaluate('parse_float("3.14")');
      expect(result.success).toBe(true);
      expect(result.value).toBeCloseTo(3.14);
    });

    it('evaluates floor(random()*5+1) returns 1-5', () => {
      for (let i = 0; i < 20; i++) {
        const result = evaluator.evaluate('floor(random()*5+1)');
        expect(result.success).toBe(true);
        expect(result.value).toBeGreaterThanOrEqual(1);
        expect(result.value).toBeLessThanOrEqual(5);
      }
    });

    it('supports PI and E constants', () => {
      expect(evaluator.evaluate('PI').value).toBeCloseTo(Math.PI);
      expect(evaluator.evaluate('E').value).toBeCloseTo(Math.E);
    });

    it('evaluates char_at()', () => {
      const result = evaluator.evaluate('char_at("hello", 1)');
      expect(result.success).toBe(true);
      expect(result.value).toBe('e');
    });

    it('evaluates split_get()', () => {
      const result = evaluator.evaluate('split_get("a,b,c", ",", 1)');
      expect(result.success).toBe(true);
      expect(result.value).toBe('b');
    });
  });

  describe('evaluateExpression with Math.* preprocessing', () => {
    it('evaluates Math.floor(Math.random()*5+1) returns 1-5', () => {
      const context = new VariableContext();
      for (let i = 0; i < 20; i++) {
        const result = evaluateExpression('Math.floor(Math.random()*5+1)', context);
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(5);
      }
    });

    it('evaluates Date.now() returns timestamp', () => {
      const context = new VariableContext();
      const result = evaluateExpression('Date.now()', context);
      expect(result).toBeGreaterThan(1000000000000);
    });

    it('strips quotes and semicolons from EVAL content', () => {
      const context = new VariableContext();
      const result = evaluateExpression('"2+3";', context);
      expect(result).toBe(5);
    });

    it('handles variable references', () => {
      const context = new VariableContext();
      context.set('!VAR1', 10);
      const result = evaluateExpression('{{!VAR1}} + 5', context);
      expect(result).toBe(15);
    });
  });
});
