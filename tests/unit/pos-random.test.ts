import { describe, it, expect } from 'vitest';
import { parsePosParam } from '@shared/commands/interaction';

describe('POS=R random positioning', () => {
  it('returns "random" for R prefix', () => {
    expect(parsePosParam('R1')).toBe('random');
  });

  it('returns "random" for R prefix (lowercase)', () => {
    expect(parsePosParam('r1')).toBe('random');
  });

  it('returns "random" for just R', () => {
    expect(parsePosParam('R')).toBe('random');
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
