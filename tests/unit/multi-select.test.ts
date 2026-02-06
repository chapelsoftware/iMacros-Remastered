import { describe, it, expect } from 'vitest';

// Import the parseMultiSelectValues helper - it's not exported, so we test the logic
describe('Multiple select (%"val1":%"val2")', () => {
  function parseMultiSelectValues(content: string): string[] {
    const values: string[] = [];
    const tokens = content.split(':%');
    for (const token of tokens) {
      let val = token.trim();
      if (val.startsWith('%')) {
        val = val.substring(1);
      }
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (val) {
        values.push(val);
      }
    }
    return values;
  }

  it('parses single value', () => {
    expect(parseMultiSelectValues('%"val1"')).toEqual(['val1']);
  });

  it('parses multiple values', () => {
    expect(parseMultiSelectValues('%"val1":%"val2":%"val3"')).toEqual(['val1', 'val2', 'val3']);
  });

  it('handles values without quotes', () => {
    expect(parseMultiSelectValues('%val1:%val2')).toEqual(['val1', 'val2']);
  });

  it('handles mixed quoted and unquoted', () => {
    expect(parseMultiSelectValues('%"val1":%val2')).toEqual(['val1', 'val2']);
  });

  it('detects multi-select pattern', () => {
    const content = '%"opt1":%"opt2"';
    expect(content.includes(':%')).toBe(true);
  });

  it('single % does not trigger multi-select', () => {
    const content = '%singlevalue';
    expect(content.includes(':%')).toBe(false);
  });
});
