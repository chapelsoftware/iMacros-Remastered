import { describe, it, expect } from 'vitest';
import { matchesSelectTextPattern } from '@extension/content/dom-executor';
import { matchesWildcard } from '@extension/content/element-finder';

describe('Select by visible text ($prefix)', () => {
  describe('matchesSelectTextPattern', () => {
    it('matches exact text', () => {
      expect(matchesSelectTextPattern('United States', 'United States')).toBe(true);
      expect(matchesSelectTextPattern('United Kingdom', 'United States')).toBe(false);
    });

    it('matches wildcard at end', () => {
      expect(matchesSelectTextPattern('United States', 'United*')).toBe(true);
      expect(matchesSelectTextPattern('United Kingdom', 'United*')).toBe(true);
      expect(matchesSelectTextPattern('Canada', 'United*')).toBe(false);
    });

    it('matches wildcard at start', () => {
      expect(matchesSelectTextPattern('United States', '*States')).toBe(true);
      expect(matchesSelectTextPattern('Confederate States', '*States')).toBe(true);
      expect(matchesSelectTextPattern('United Kingdom', '*States')).toBe(false);
    });

    it('matches wildcard in middle', () => {
      expect(matchesSelectTextPattern('United States', 'United*States')).toBe(true);
      expect(matchesSelectTextPattern('United Arab States', 'United*States')).toBe(true);
      expect(matchesSelectTextPattern('Canada', 'United*States')).toBe(false);
    });

    it('is case insensitive for wildcard patterns', () => {
      expect(matchesSelectTextPattern('united states', 'United*')).toBe(true);
      expect(matchesSelectTextPattern('UNITED STATES', 'united*')).toBe(true);
    });

    // Original iMacros uses case-insensitive matching for all $ text patterns (MacroPlayer.js:2943)
    it('is case insensitive for exact match (matches original iMacros)', () => {
      expect(matchesSelectTextPattern('United States', 'united states')).toBe(true);
      expect(matchesSelectTextPattern('CANADA', 'canada')).toBe(true);
      expect(matchesSelectTextPattern('germany', 'GERMANY')).toBe(true);
    });
  });

  describe('matchesWildcard (from element-finder)', () => {
    it('matches any with single asterisk', () => {
      expect(matchesWildcard('anything', '*')).toBe(true);
    });

    it('matches wildcard patterns', () => {
      expect(matchesWildcard('United States', 'United*')).toBe(true);
      expect(matchesWildcard('United Kingdom', 'United*')).toBe(true);
      expect(matchesWildcard('Canada', 'United*')).toBe(false);
    });

    it('matches contains pattern', () => {
      expect(matchesWildcard('hello world', '*world*')).toBe(true);
      expect(matchesWildcard('world hello', '*world*')).toBe(true);
    });
  });
});
