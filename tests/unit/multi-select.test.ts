import { describe, it, expect } from 'vitest';
import { parseMultiSelectValues } from '@extension/content/dom-executor';

describe('Multiple select (%"val1":%"val2")', () => {
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
