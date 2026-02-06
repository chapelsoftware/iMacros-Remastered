import { describe, it, expect } from 'vitest';
import { parsePosParam, parsePosParamEx } from '@shared/commands/interaction';

describe('POS=R relative positioning', () => {
  // Note: POS=R<n> is for relative positioning (not random)
  // parsePosParam returns the numeric value for backwards compatibility
  // parsePosParamEx returns both the value and the relative flag

  describe('parsePosParam (backwards compatible)', () => {
    it('returns numeric value for R prefix', () => {
      expect(parsePosParam('R1')).toBe(1);
      expect(parsePosParam('R3')).toBe(3);
    });

    it('returns numeric value for R prefix (lowercase)', () => {
      expect(parsePosParam('r1')).toBe(1);
      expect(parsePosParam('r5')).toBe(5);
    });

    it('returns 1 for just R (invalid relative)', () => {
      // "R" without a number is invalid, defaults to 1
      expect(parsePosParam('R')).toBe(1);
    });

    it('returns number for numeric POS', () => {
      expect(parsePosParam('1')).toBe(1);
      expect(parsePosParam('3')).toBe(3);
    });

    it('returns negative number for negative POS', () => {
      expect(parsePosParam('-1')).toBe(-1);
    });

    it('defaults to 1 for invalid POS', () => {
      expect(parsePosParam('abc')).toBe(1);
    });
  });

  describe('parsePosParamEx (with relative flag)', () => {
    it('returns relative=true for R prefix', () => {
      const result = parsePosParamEx('R1');
      expect(result.pos).toBe(1);
      expect(result.relative).toBe(true);
    });

    it('returns relative=true for negative relative position', () => {
      const result = parsePosParamEx('R-2');
      expect(result.pos).toBe(-2);
      expect(result.relative).toBe(true);
    });

    it('returns relative=false for absolute position', () => {
      const result = parsePosParamEx('5');
      expect(result.pos).toBe(5);
      expect(result.relative).toBe(false);
    });

    it('returns relative=false for invalid R (no number)', () => {
      const result = parsePosParamEx('R');
      expect(result.pos).toBe(1);
      expect(result.relative).toBe(false);
    });

    it('returns relative=false for R0 (invalid)', () => {
      const result = parsePosParamEx('R0');
      expect(result.pos).toBe(1);
      expect(result.relative).toBe(false);
    });
  });
});
