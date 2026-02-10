/**
 * Unit tests for download helper functions (deriveDocumentName, formatExtractAsCsv)
 */
import { describe, it, expect } from 'vitest';
import { deriveDocumentName, formatExtractAsCsv } from '@shared/commands/downloads';

describe('deriveDocumentName', () => {
  it('should extract last path segment', () => {
    expect(deriveDocumentName('https://example.com/reports/annual-report.html')).toBe('annual-report');
  });

  it('should strip file extension from path segment', () => {
    expect(deriveDocumentName('https://example.com/page.htm')).toBe('page');
  });

  it('should fall back to hostname when path is empty', () => {
    expect(deriveDocumentName('https://www.example.com/')).toBe('example');
  });

  it('should strip www. from hostname fallback', () => {
    expect(deriveDocumentName('https://www.mysite.org/')).toBe('mysite');
  });

  it('should return "unknown" when no path and no www. hostname', () => {
    // hostname without www. and empty path - hostname regex requires www. prefix
    expect(deriveDocumentName('https://localhost/')).toBe('unknown');
  });

  it('should fall back to document title when URL has no useful parts (iMacros 8.9.7 parity)', () => {
    expect(deriveDocumentName('https://localhost/', 'My Page Title')).toBe('My Page Title');
  });

  it('should fall back to document title before "unknown"', () => {
    // Empty path, hostname without www. prefix → falls to title
    expect(deriveDocumentName('https://10.0.0.1/', 'Dashboard')).toBe('Dashboard');
  });

  it('should prefer URL path over document title', () => {
    expect(deriveDocumentName('https://example.com/report.pdf', 'Some Title')).toBe('report');
  });

  it('should prefer hostname over document title', () => {
    expect(deriveDocumentName('https://www.example.com/', 'Some Title')).toBe('example');
  });

  it('should not use empty document title', () => {
    expect(deriveDocumentName('https://localhost/', '')).toBe('unknown');
  });

  it('should return "unknown" when no title and no URL info', () => {
    expect(deriveDocumentName('https://localhost/')).toBe('unknown');
  });

  it('should return "unknown" for invalid URL', () => {
    expect(deriveDocumentName('not-a-valid-url')).toBe('unknown');
  });

  it('should return "unknown" for invalid URL even with title', () => {
    expect(deriveDocumentName('not-a-valid-url', 'My Title')).toBe('unknown');
  });

  it('should handle path segment without extension', () => {
    expect(deriveDocumentName('https://example.com/dashboard')).toBe('dashboard');
  });

  it('should strip extension from hostname fallback', () => {
    expect(deriveDocumentName('https://www.example.com/')).toBe('example');
  });
});

describe('formatExtractAsCsv', () => {
  it('should wrap single value in quotes', () => {
    expect(formatExtractAsCsv('hello')).toBe('"hello"');
  });

  it('should convert [EXTRACT] delimiters to CSV format', () => {
    expect(formatExtractAsCsv('a[EXTRACT]b[EXTRACT]c')).toBe('"a","b","c"');
  });

  it('should escape double quotes', () => {
    expect(formatExtractAsCsv('say "hello"')).toBe('"say ""hello"""');
  });

  it('should handle empty string', () => {
    expect(formatExtractAsCsv('')).toBe('""');
  });
});
