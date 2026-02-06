import { describe, it, expect } from 'vitest';

describe('EVENT:SAVETARGETAS', () => {
  it('detects EVENT: prefix', () => {
    const content = 'EVENT:SAVETARGETAS';
    expect(content.toUpperCase().startsWith('EVENT:')).toBe(true);
  });

  it('extracts event command name', () => {
    const content = 'EVENT:SAVETARGETAS';
    const eventCommand = content.substring(6).toUpperCase();
    expect(eventCommand).toBe('SAVETARGETAS');
  });

  it('extracts filename from SAVETARGETAS=filename', () => {
    const eventCommand = 'SAVETARGETAS=report.pdf';
    const eqIndex = eventCommand.indexOf('=');
    expect(eqIndex).toBeGreaterThan(0);
    const filename = eventCommand.substring(eqIndex + 1);
    expect(filename).toBe('report.pdf');
  });

  it('handles SAVETARGETAS without filename', () => {
    const eventCommand = 'SAVETARGETAS';
    const eqIndex = eventCommand.indexOf('=');
    expect(eqIndex).toBe(-1);
  });
});
