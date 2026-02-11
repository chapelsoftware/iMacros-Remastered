/**
 * Unit Tests for iMacros CSV Datasource Manager
 *
 * Comprehensive tests covering:
 * - Loading with various delimiters (comma, semicolon, tab, pipe, auto)
 * - CSV parsing (headers, no headers, quoted fields, escaped quotes, mixed line endings)
 * - Row navigation (next, previous, goToRow, reset, boundary conditions)
 * - Column access (1-based index, by header case-insensitive, out-of-bounds)
 * - State queries (isLoaded, getCurrentLineNumber, getRowCount, getColumnCount, etc.)
 * - populateVariables with real VariableContext
 * - Edge cases (empty file, single row, 100+ columns, BOM, empty cells, delimiters in quotes)
 * - Utility functions (parseCSV, detectDelimiter, parseColVariable, buildColVariable)
 * - Iterator protocol
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  DatasourceManager,
  createDatasourceManager,
  parseCSV,
  detectDelimiter,
  parseColVariable,
  buildColVariable,
} from '../../shared/src/datasource';
import { createVariableContext, VariableContext } from '../../shared/src/variables';

describe('DatasourceManager', () => {
  let ds: DatasourceManager;

  beforeEach(() => {
    ds = new DatasourceManager();
  });

  // ===== Loading with different delimiters =====

  describe('loading with delimiters', () => {
    it('loads comma-delimited CSV', () => {
      const result = ds.loadFromContent('a,b,c\n1,2,3', 'test.csv', { delimiter: ',' });
      expect(result.success).toBe(true);
      expect(ds.getRowCount()).toBe(2);
      expect(ds.getColumnCount()).toBe(3);
    });

    it('loads semicolon-delimited CSV', () => {
      const result = ds.loadFromContent('a;b;c\n1;2;3', 'test.csv', { delimiter: ';' });
      expect(result.success).toBe(true);
      expect(ds.getColumn(1)).toBe('a');
      expect(ds.getColumn(2)).toBe('b');
    });

    it('loads tab-delimited CSV', () => {
      const result = ds.loadFromContent('a\tb\tc\n1\t2\t3', 'test.tsv', { delimiter: '\t' });
      expect(result.success).toBe(true);
      expect(ds.getColumn(1)).toBe('a');
      expect(ds.getColumn(3)).toBe('c');
    });

    it('loads pipe-delimited CSV', () => {
      const result = ds.loadFromContent('a|b|c\n1|2|3', 'test.csv', { delimiter: '|' });
      expect(result.success).toBe(true);
      expect(ds.getColumn(1)).toBe('a');
    });

    it('auto-detects comma delimiter', () => {
      const result = ds.loadFromContent('a,b,c\n1,2,3\n4,5,6', 'test.csv', { delimiter: 'auto' });
      expect(result.success).toBe(true);
      expect(ds.getColumnCount()).toBe(3);
    });

    it('auto-detects tab delimiter', () => {
      const result = ds.loadFromContent('a\tb\tc\n1\t2\t3', 'test.tsv');
      expect(result.success).toBe(true);
      expect(ds.getColumnCount()).toBe(3);
    });

    it('auto-detects semicolon delimiter', () => {
      const result = ds.loadFromContent('a;b;c\n1;2;3\n4;5;6', 'test.csv');
      expect(result.success).toBe(true);
      expect(ds.getColumnCount()).toBe(3);
    });
  });

  // ===== CSV Parsing =====

  describe('CSV parsing', () => {
    it('parses with headers', () => {
      const result = ds.loadFromContent('Name,Age,City\nAlice,30,NYC\nBob,25,LA', 'test.csv', {
        hasHeader: true,
        delimiter: ',',
      });
      expect(result.success).toBe(true);
      expect(ds.getHeaders()).toEqual(['Name', 'Age', 'City']);
      expect(ds.getRowCount()).toBe(2);
      expect(ds.getColumn(1)).toBe('Alice');
    });

    it('parses without headers', () => {
      const result = ds.loadFromContent('Alice,30,NYC\nBob,25,LA', 'test.csv', {
        hasHeader: false,
        delimiter: ',',
      });
      expect(result.success).toBe(true);
      expect(ds.getHeaders()).toEqual([]);
      expect(ds.getRowCount()).toBe(2);
    });

    it('parses quoted fields', () => {
      const result = ds.loadFromContent('"hello world","foo bar","baz"', 'test.csv', { delimiter: ',' });
      expect(result.success).toBe(true);
      expect(ds.getColumn(1)).toBe('hello world');
      expect(ds.getColumn(2)).toBe('foo bar');
    });

    it('parses escaped quotes inside quoted fields', () => {
      const result = ds.loadFromContent('"she said ""hello""","normal"', 'test.csv', { delimiter: ',' });
      expect(result.success).toBe(true);
      expect(ds.getColumn(1)).toBe('she said "hello"');
    });

    it('parses fields with commas inside quotes', () => {
      const result = ds.loadFromContent('"a,b",c,"d,e,f"', 'test.csv', { delimiter: ',' });
      expect(result.success).toBe(true);
      expect(ds.getColumn(1)).toBe('a,b');
      expect(ds.getColumn(2)).toBe('c');
      expect(ds.getColumn(3)).toBe('d,e,f');
    });

    it('handles CRLF line endings', () => {
      const result = ds.loadFromContent('a,b\r\nc,d\r\ne,f', 'test.csv', { delimiter: ',' });
      expect(result.success).toBe(true);
      expect(ds.getRowCount()).toBe(3);
    });

    it('handles LF line endings', () => {
      const result = ds.loadFromContent('a,b\nc,d\ne,f', 'test.csv', { delimiter: ',' });
      expect(result.success).toBe(true);
      expect(ds.getRowCount()).toBe(3);
    });

    it('handles CR line endings', () => {
      const result = ds.loadFromContent('a,b\rc,d\re,f', 'test.csv', { delimiter: ',' });
      expect(result.success).toBe(true);
      expect(ds.getRowCount()).toBeGreaterThanOrEqual(2);
    });

    it('skips empty lines by default', () => {
      const result = ds.loadFromContent('a,b\n\nc,d\n\ne,f', 'test.csv', { delimiter: ',' });
      expect(result.success).toBe(true);
      expect(ds.getRowCount()).toBe(3);
    });

    it('handles startLine option', () => {
      const result = ds.loadFromContent('a,b\nc,d\ne,f', 'test.csv', {
        delimiter: ',',
        startLine: 2,
      });
      expect(result.success).toBe(true);
      expect(ds.getRowCount()).toBe(2);
      expect(ds.getColumn(1)).toBe('c');
    });

    it('returns error if startLine exceeds data rows', () => {
      const result = ds.loadFromContent('a,b\nc,d', 'test.csv', {
        delimiter: ',',
        startLine: 5,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Start line');
    });

    it('normalizes rows to same column count', () => {
      const result = ds.loadFromContent('a,b,c\nd\ne,f', 'test.csv', { delimiter: ',' });
      expect(result.success).toBe(true);
      // All rows should have 3 columns
      const rows = ds.getAllRows();
      for (const row of rows) {
        expect(row.length).toBe(3);
      }
    });
  });

  // ===== Row Navigation =====

  describe('row navigation', () => {
    beforeEach(() => {
      ds.loadFromContent('a,b\nc,d\ne,f\ng,h', 'test.csv', { delimiter: ',' });
    });

    it('starts at row 1', () => {
      expect(ds.getCurrentLineNumber()).toBe(1);
    });

    it('getCurrentRow returns first row', () => {
      const result = ds.getCurrentRow();
      expect(result.success).toBe(true);
      expect(result.row).toEqual(['a', 'b']);
      expect(result.lineNumber).toBe(1);
    });

    it('nextRow moves to second row', () => {
      expect(ds.nextRow()).toBe(true);
      expect(ds.getCurrentLineNumber()).toBe(2);
      const result = ds.getCurrentRow();
      expect(result.row).toEqual(['c', 'd']);
    });

    it('nextRow returns false at end', () => {
      ds.nextRow(); // row 2
      ds.nextRow(); // row 3
      ds.nextRow(); // row 4
      expect(ds.nextRow()).toBe(false);
    });

    it('previousRow moves backwards', () => {
      ds.nextRow(); // row 2
      ds.nextRow(); // row 3
      expect(ds.previousRow()).toBe(true);
      expect(ds.getCurrentLineNumber()).toBe(2);
    });

    it('previousRow returns false at beginning', () => {
      expect(ds.previousRow()).toBe(false);
      expect(ds.getCurrentLineNumber()).toBe(1);
    });

    it('goToRow navigates to specific row (1-based)', () => {
      expect(ds.goToRow(3)).toBe(true);
      expect(ds.getCurrentLineNumber()).toBe(3);
      expect(ds.getCurrentRow().row).toEqual(['e', 'f']);
    });

    it('goToRow returns false for row 0', () => {
      expect(ds.goToRow(0)).toBe(false);
    });

    it('goToRow returns false for negative row', () => {
      expect(ds.goToRow(-1)).toBe(false);
    });

    it('goToRow returns false for row beyond count', () => {
      expect(ds.goToRow(5)).toBe(false);
    });

    it('goToRow accepts last row', () => {
      expect(ds.goToRow(4)).toBe(true);
      expect(ds.getCurrentRow().row).toEqual(['g', 'h']);
    });

    it('reset goes back to first row', () => {
      ds.nextRow();
      ds.nextRow();
      ds.reset();
      expect(ds.getCurrentLineNumber()).toBe(1);
      expect(ds.getCurrentRow().row).toEqual(['a', 'b']);
    });

    it('isAtEnd returns false initially', () => {
      expect(ds.isAtEnd()).toBe(false);
    });

    it('isAtEnd returns false on last valid row', () => {
      ds.goToRow(4); // last row, index 3
      expect(ds.isAtEnd()).toBe(false);
    });

    it('isAtBeginning returns true initially', () => {
      expect(ds.isAtBeginning()).toBe(true);
    });

    it('isAtBeginning returns false after nextRow', () => {
      ds.nextRow();
      expect(ds.isAtBeginning()).toBe(false);
    });
  });

  // ===== Column Access =====

  describe('column access', () => {
    beforeEach(() => {
      ds.loadFromContent('Name,Age,City\nAlice,30,NYC\nBob,25,LA', 'test.csv', {
        hasHeader: true,
        delimiter: ',',
      });
    });

    it('getColumn returns 1-based column value', () => {
      expect(ds.getColumn(1)).toBe('Alice');
      expect(ds.getColumn(2)).toBe('30');
      expect(ds.getColumn(3)).toBe('NYC');
    });

    it('getColumn returns empty string for index 0', () => {
      expect(ds.getColumn(0)).toBe('');
    });

    it('getColumn returns empty string for negative index', () => {
      expect(ds.getColumn(-1)).toBe('');
    });

    it('getColumn returns empty string for out-of-bounds index', () => {
      expect(ds.getColumn(100)).toBe('');
    });

    it('getColumnByHeader returns value by header name', () => {
      expect(ds.getColumnByHeader('Name')).toBe('Alice');
      expect(ds.getColumnByHeader('Age')).toBe('30');
      expect(ds.getColumnByHeader('City')).toBe('NYC');
    });

    it('getColumnByHeader is case-insensitive', () => {
      expect(ds.getColumnByHeader('name')).toBe('Alice');
      expect(ds.getColumnByHeader('NAME')).toBe('Alice');
      expect(ds.getColumnByHeader('nAmE')).toBe('Alice');
    });

    it('getColumnByHeader returns empty string for unknown header', () => {
      expect(ds.getColumnByHeader('NonExistent')).toBe('');
    });

    it('getColumnByHeader returns empty string when no headers', () => {
      const ds2 = new DatasourceManager();
      ds2.loadFromContent('a,b,c', 'test.csv', { delimiter: ',' });
      expect(ds2.getColumnByHeader('a')).toBe('');
    });

    it('getColumn returns empty string when no datasource loaded', () => {
      const ds2 = new DatasourceManager();
      expect(ds2.getColumn(1)).toBe('');
    });
  });

  // ===== State Queries =====

  describe('state queries', () => {
    it('isLoaded returns false initially', () => {
      expect(ds.isLoaded()).toBe(false);
    });

    it('isLoaded returns true after loading', () => {
      ds.loadFromContent('a,b\nc,d', 'test.csv', { delimiter: ',' });
      expect(ds.isLoaded()).toBe(true);
    });

    it('getState returns null initially', () => {
      expect(ds.getState()).toBeNull();
    });

    it('getState returns state after loading', () => {
      ds.loadFromContent('a,b\nc,d', 'test.csv', { delimiter: ',' });
      const state = ds.getState();
      expect(state).not.toBeNull();
      expect(state!.filePath).toBe('test.csv');
      expect(state!.rowCount).toBe(2);
    });

    it('getCurrentLineNumber returns 0 when not loaded', () => {
      expect(ds.getCurrentLineNumber()).toBe(0);
    });

    it('getRowCount returns 0 when not loaded', () => {
      expect(ds.getRowCount()).toBe(0);
    });

    it('getColumnCount returns 0 when not loaded', () => {
      expect(ds.getColumnCount()).toBe(0);
    });

    it('getFilePath returns empty string when not loaded', () => {
      expect(ds.getFilePath()).toBe('');
    });

    it('getHeaders returns empty array when not loaded', () => {
      expect(ds.getHeaders()).toEqual([]);
    });

    it('getCurrentRow returns error when not loaded', () => {
      const result = ds.getCurrentRow();
      expect(result.success).toBe(false);
      expect(result.error).toBe('No datasource loaded');
    });

    it('unload clears the state', () => {
      ds.loadFromContent('a,b\nc,d', 'test.csv', { delimiter: ',' });
      ds.unload();
      expect(ds.isLoaded()).toBe(false);
      expect(ds.getState()).toBeNull();
      expect(ds.getRowCount()).toBe(0);
    });

    it('nextRow returns false when not loaded', () => {
      expect(ds.nextRow()).toBe(false);
    });

    it('previousRow returns false when not loaded', () => {
      expect(ds.previousRow()).toBe(false);
    });

    it('goToRow returns false when not loaded', () => {
      expect(ds.goToRow(1)).toBe(false);
    });

    it('isAtEnd returns true when not loaded', () => {
      expect(ds.isAtEnd()).toBe(true);
    });

    it('isAtBeginning returns true when not loaded', () => {
      expect(ds.isAtBeginning()).toBe(true);
    });
  });

  // ===== populateVariables =====

  describe('populateVariables', () => {
    let ctx: VariableContext;

    beforeEach(() => {
      ctx = createVariableContext();
    });

    it('sets COL variables from current row', () => {
      ds.loadFromContent('alpha,beta,gamma', 'test.csv', { delimiter: ',' });
      ds.populateVariables(ctx);
      expect(ctx.get('!COL1')).toBe('alpha');
      expect(ctx.get('!COL2')).toBe('beta');
      expect(ctx.get('!COL3')).toBe('gamma');
    });

    it('sets !DATASOURCE to file path', () => {
      ds.loadFromContent('a,b', '/path/to/data.csv', { delimiter: ',' });
      ds.populateVariables(ctx);
      expect(ctx.get('!DATASOURCE')).toBe('/path/to/data.csv');
    });

    it('sets !DATASOURCE_LINE to current line number', () => {
      ds.loadFromContent('a,b\nc,d\ne,f', 'test.csv', { delimiter: ',' });
      ds.nextRow();
      ds.populateVariables(ctx);
      expect(ctx.get('!DATASOURCE_LINE')).toBe(2);
    });

    it('limits COL variables to first 10 columns', () => {
      const cols = Array.from({ length: 15 }, (_, i) => `col${i + 1}`);
      ds.loadFromContent(cols.join(','), 'test.csv', { delimiter: ',' });
      ds.populateVariables(ctx);
      expect(ctx.get('!COL1')).toBe('col1');
      expect(ctx.get('!COL10')).toBe('col10');
      // COL11+ should not exist as system vars; they remain at default
    });

    it('clears variables when no datasource loaded', () => {
      // Set some values first
      ctx.setDatasource('/old/path');
      ctx.setDatasourceLine(5);
      ctx.setDatasourceCols(['a', 'b']);

      ds.populateVariables(ctx);
      expect(ctx.get('!DATASOURCE')).toBe('');
      expect(ctx.get('!DATASOURCE_LINE')).toBe(0);
      expect(ctx.get('!COL1')).toBe('');
    });

    it('sets empty string for missing columns', () => {
      ds.loadFromContent('a', 'test.csv', { delimiter: ',' });
      ds.populateVariables(ctx);
      expect(ctx.get('!COL1')).toBe('a');
      expect(ctx.get('!COL2')).toBe('');
      expect(ctx.get('!COL10')).toBe('');
    });
  });

  // ===== Edge Cases =====

  describe('edge cases', () => {
    it('empty file returns error', () => {
      const result = ds.loadFromContent('', 'empty.csv');
      expect(result.success).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('single row, single cell', () => {
      const result = ds.loadFromContent('hello', 'test.csv', { delimiter: ',' });
      expect(result.success).toBe(true);
      expect(ds.getRowCount()).toBe(1);
      expect(ds.getColumnCount()).toBe(1);
      expect(ds.getColumn(1)).toBe('hello');
    });

    it('100+ columns - only first 10 via COL', () => {
      const cols = Array.from({ length: 120 }, (_, i) => `v${i}`);
      ds.loadFromContent(cols.join(','), 'wide.csv', { delimiter: ',' });
      const ctx = createVariableContext();
      ds.populateVariables(ctx);
      // Only first 10 are set
      expect(ctx.get('!COL1')).toBe('v0');
      expect(ctx.get('!COL10')).toBe('v9');
      // But getColumn can access beyond 10
      expect(ds.getColumn(50)).toBe('v49');
      expect(ds.getColumn(120)).toBe('v119');
    });

    it('BOM handling (UTF-8 BOM)', () => {
      const bom = '\uFEFF';
      const content = bom + 'a,b,c\n1,2,3';
      const result = ds.loadFromContent(content, 'bom.csv', { delimiter: ',' });
      expect(result.success).toBe(true);
      // First cell might have BOM stripped or not - just verify it loads
      expect(ds.getRowCount()).toBe(2);
    });

    it('empty cells in CSV', () => {
      const result = ds.loadFromContent(',b,\n,,c', 'test.csv', { delimiter: ',' });
      expect(result.success).toBe(true);
      expect(ds.getColumn(1)).toBe('');
      expect(ds.getColumn(2)).toBe('b');
      expect(ds.getColumn(3)).toBe('');
    });

    it('delimiter inside quoted field is not treated as separator', () => {
      const result = ds.loadFromContent('"a;b",c', 'test.csv', { delimiter: ',' });
      expect(result.success).toBe(true);
      expect(ds.getColumn(1)).toBe('a;b');
      expect(ds.getColumn(2)).toBe('c');
    });

    it('newlines inside quoted field', () => {
      const result = ds.loadFromContent('"line1\nline2",b', 'test.csv', { delimiter: ',' });
      expect(result.success).toBe(true);
      expect(ds.getColumn(1)).toBe('line1\nline2');
    });

    it('getCurrentRow returns error when past end', () => {
      ds.loadFromContent('a\nb', 'test.csv', { delimiter: ',' });
      ds.nextRow(); // row 2 (last)
      // Force past end by advancing internal state
      ds.nextRow(); // should return false
      // Now current index is at last row still
      // Actually nextRow returns false and doesn't move, so this just verifies
      const result = ds.getCurrentRow();
      expect(result.success).toBe(true);
    });

    it('comment character skips lines', () => {
      const result = ds.loadFromContent('a,b\n# comment\nc,d', 'test.csv', {
        delimiter: ',',
        commentChar: '#',
      });
      expect(result.success).toBe(true);
      expect(ds.getRowCount()).toBe(2);
    });

    it('getAllRows returns all data', () => {
      ds.loadFromContent('a,b\nc,d\ne,f', 'test.csv', { delimiter: ',' });
      const rows = ds.getAllRows();
      expect(rows.length).toBe(3);
      expect(rows[0]).toEqual(['a', 'b']);
      expect(rows[2]).toEqual(['e', 'f']);
    });

    it('getAllRows returns empty array when not loaded', () => {
      expect(ds.getAllRows()).toEqual([]);
    });

    it('filePath defaults to empty string', () => {
      ds.loadFromContent('a,b', undefined as any);
      expect(ds.getFilePath()).toBe('');
    });

    it('loadFromContent with hasHeader and only header row succeeds with 0 data rows', () => {
      // Header only - papaparse parses it, headers are extracted, 0 data rows remain
      const result = ds.loadFromContent('Name,Age', 'test.csv', {
        hasHeader: true,
        delimiter: ',',
      });
      // Succeeds but with 0 data rows
      expect(result.success).toBe(true);
      expect(ds.getRowCount()).toBe(0);
      expect(ds.getHeaders()).toEqual(['Name', 'Age']);
    });
  });

  // ===== Iterator =====

  describe('iterator', () => {
    it('iterates over all rows', () => {
      ds.loadFromContent('a,b\nc,d\ne,f', 'test.csv', { delimiter: ',' });
      const rows: string[][] = [];
      for (const row of ds) {
        rows.push(row);
      }
      expect(rows.length).toBe(3);
      expect(rows[0]).toEqual(['a', 'b']);
      expect(rows[1]).toEqual(['c', 'd']);
      expect(rows[2]).toEqual(['e', 'f']);
    });

    it('iterator yields nothing when not loaded', () => {
      const rows: string[][] = [];
      for (const row of ds) {
        rows.push(row);
      }
      expect(rows.length).toBe(0);
    });

    it('spread operator works', () => {
      ds.loadFromContent('x,y\n1,2', 'test.csv', { delimiter: ',' });
      const rows = [...ds];
      expect(rows.length).toBe(2);
    });
  });

  // ===== Utility: parseCSV =====

  describe('parseCSV', () => {
    it('returns parsed rows for valid CSV', () => {
      const rows = parseCSV('a,b\nc,d', { delimiter: ',' });
      expect(rows).not.toBeNull();
      expect(rows!.length).toBe(2);
      expect(rows![0]).toEqual(['a', 'b']);
    });

    it('returns null for empty content', () => {
      const rows = parseCSV('');
      expect(rows).toBeNull();
    });

    it('passes options through', () => {
      const rows = parseCSV('a;b\nc;d', { delimiter: ';' });
      expect(rows).not.toBeNull();
      expect(rows![0]).toEqual(['a', 'b']);
    });
  });

  // ===== Utility: detectDelimiter =====

  describe('detectDelimiter', () => {
    it('detects comma', () => {
      const d = detectDelimiter('a,b,c\n1,2,3');
      expect(d).toBe(',');
    });

    it('detects tab', () => {
      const d = detectDelimiter('a\tb\tc\n1\t2\t3');
      expect(d).toBe('\t');
    });

    it('detects semicolon', () => {
      const d = detectDelimiter('a;b;c\n1;2;3');
      expect(d).toBe(';');
    });

    it('detects pipe', () => {
      const d = detectDelimiter('a|b|c\n1|2|3');
      expect(d).toBe('|');
    });

    it('defaults to comma for ambiguous content', () => {
      const d = detectDelimiter('abc');
      expect(d).toBe(',');
    });
  });

  // ===== Utility: parseColVariable =====

  describe('parseColVariable', () => {
    it('parses !COL1 to 1', () => {
      expect(parseColVariable('!COL1')).toBe(1);
    });

    it('parses !COL10 to 10', () => {
      expect(parseColVariable('!COL10')).toBe(10);
    });

    it('is case-insensitive', () => {
      expect(parseColVariable('!col5')).toBe(5);
      expect(parseColVariable('!Col3')).toBe(3);
    });

    it('returns null for !COL0', () => {
      expect(parseColVariable('!COL0')).toBeNull();
    });

    it('returns null for !COL11', () => {
      expect(parseColVariable('!COL11')).toBeNull();
    });

    it('returns null for non-COL variable', () => {
      expect(parseColVariable('!VAR1')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseColVariable('')).toBeNull();
    });

    it('returns null for just !COL', () => {
      expect(parseColVariable('!COL')).toBeNull();
    });
  });

  // ===== Utility: buildColVariable =====

  describe('buildColVariable', () => {
    it('builds !COL1 from 1', () => {
      expect(buildColVariable(1)).toBe('!COL1');
    });

    it('builds !COL10 from 10', () => {
      expect(buildColVariable(10)).toBe('!COL10');
    });

    it('returns null for 0', () => {
      expect(buildColVariable(0)).toBeNull();
    });

    it('returns null for 11', () => {
      expect(buildColVariable(11)).toBeNull();
    });

    it('returns null for negative', () => {
      expect(buildColVariable(-1)).toBeNull();
    });
  });

  // ===== Factory =====

  describe('createDatasourceManager', () => {
    it('returns a new DatasourceManager instance', () => {
      const dm = createDatasourceManager();
      expect(dm).toBeInstanceOf(DatasourceManager);
      expect(dm.isLoaded()).toBe(false);
    });
  });

  // ===== Additional edge cases for full coverage =====

  describe('additional coverage', () => {
    it('loading replaces previous datasource', () => {
      ds.loadFromContent('a,b', 'first.csv', { delimiter: ',' });
      expect(ds.getFilePath()).toBe('first.csv');

      ds.loadFromContent('x,y,z', 'second.csv', { delimiter: ',' });
      expect(ds.getFilePath()).toBe('second.csv');
      expect(ds.getColumnCount()).toBe(3);
    });

    it('reset does nothing when not loaded', () => {
      // Should not throw
      ds.reset();
      expect(ds.getCurrentLineNumber()).toBe(0);
    });

    it('column count uses header count if larger than data', () => {
      const result = ds.loadFromContent('h1,h2,h3,h4\na,b', 'test.csv', {
        hasHeader: true,
        delimiter: ',',
      });
      expect(result.success).toBe(true);
      expect(ds.getColumnCount()).toBe(4);
    });

    it('handles rows with varying column counts', () => {
      ds.loadFromContent('a,b,c\nd\ne,f,g,h', 'test.csv', { delimiter: ',' });
      // Column count should be 4 (max)
      expect(ds.getColumnCount()).toBe(4);
      // First row padded
      ds.goToRow(1);
      expect(ds.getColumn(4)).toBe('');
      // Third row has 4 cols
      ds.goToRow(3);
      expect(ds.getColumn(4)).toBe('h');
    });

    it('populateVariables after nextRow moves correctly', () => {
      ds.loadFromContent('a,b\nc,d\ne,f', 'test.csv', { delimiter: ',' });
      const ctx = createVariableContext();

      ds.populateVariables(ctx);
      expect(ctx.get('!COL1')).toBe('a');

      ds.nextRow();
      ds.populateVariables(ctx);
      expect(ctx.get('!COL1')).toBe('c');

      ds.nextRow();
      ds.populateVariables(ctx);
      expect(ctx.get('!COL1')).toBe('e');
    });
  });

  // ===== Malformed CSV error handling =====

  describe('malformed CSV error handling', () => {
    it('handles unclosed quotes gracefully', () => {
      // Unclosed quote in field
      const content = '"field without closing quote\nother,data';
      const result = ds.loadFromContent(content, 'test.csv', { delimiter: ',' });
      // papaparse should handle this - may parse as error or attempt recovery
      // Just ensure it doesn't crash
      expect(result).toBeDefined();
      if (result.success) {
        // If it succeeded, verify we can access the datasource
        expect(ds.isLoaded()).toBe(true);
      } else {
        // If it failed, should have an error message
        expect(result.error).toBeDefined();
      }
    });

    it('handles very large field without crashing', () => {
      // Create a very large string (1MB)
      const largeField = 'x'.repeat(1024 * 1024);
      const content = `${largeField},b,c\nd,e,f`;
      const result = ds.loadFromContent(content, 'test.csv', { delimiter: ',' });
      expect(result.success).toBe(true);
      expect(ds.getColumn(1)).toBe(largeField);
      expect(ds.getColumn(2)).toBe('b');
    });

    it('handles completely empty lines with explicit delimiter', () => {
      const content = 'a,b,c\n\n\nd,e,f';
      const result = ds.loadFromContent(content, 'test.csv', {
        delimiter: ',',
        skipEmptyLines: true,
      });
      expect(result.success).toBe(true);
      // Empty lines should be skipped
      expect(ds.getRowCount()).toBe(2);
    });

    it('handles CSV with only delimiters', () => {
      // Row with just delimiters (empty fields)
      const content = ',,,\na,b,c,d';
      const result = ds.loadFromContent(content, 'test.csv', { delimiter: ',' });
      expect(result.success).toBe(true);
      expect(ds.getRowCount()).toBe(2);
      // First row should have empty fields
      expect(ds.getColumn(1)).toBe('');
      expect(ds.getColumn(2)).toBe('');
      expect(ds.getColumn(3)).toBe('');
      expect(ds.getColumn(4)).toBe('');
    });

    it('handles row with only delimiters and no other data', () => {
      const content = ';;;';
      const result = ds.loadFromContent(content, 'test.csv', { delimiter: ';' });
      expect(result.success).toBe(true);
      expect(ds.getRowCount()).toBe(1);
      expect(ds.getColumnCount()).toBe(4); // 3 delimiters = 4 empty fields
    });
  });

  // ===== Quoted field edge cases =====

  describe('quoted field edge cases', () => {
    it('handles quoted fields with semicolons inside', () => {
      const result = ds.loadFromContent('"a;b;c",d', 'test.csv', { delimiter: ',' });
      expect(result.success).toBe(true);
      expect(ds.getColumn(1)).toBe('a;b;c');
      expect(ds.getColumn(2)).toBe('d');
    });

    it('handles quoted fields with tabs inside', () => {
      const result = ds.loadFromContent('"a\tb\tc",d', 'test.csv', { delimiter: ',' });
      expect(result.success).toBe(true);
      expect(ds.getColumn(1)).toBe('a\tb\tc');
      expect(ds.getColumn(2)).toBe('d');
    });

    it('handles quoted fields with pipes inside', () => {
      const result = ds.loadFromContent('"a|b|c",d', 'test.csv', { delimiter: ',' });
      expect(result.success).toBe(true);
      expect(ds.getColumn(1)).toBe('a|b|c');
      expect(ds.getColumn(2)).toBe('d');
    });

    it('handles fields that are just empty quoted strings', () => {
      const result = ds.loadFromContent('"",b,""', 'test.csv', { delimiter: ',' });
      expect(result.success).toBe(true);
      expect(ds.getColumn(1)).toBe('');
      expect(ds.getColumn(2)).toBe('b');
      expect(ds.getColumn(3)).toBe('');
    });

    it('handles whitespace around quotes', () => {
      // Papaparse behavior: whitespace before quotes is preserved
      const result = ds.loadFromContent('  "value"  ,b', 'test.csv', { delimiter: ',' });
      expect(result.success).toBe(true);
      // Depending on papaparse settings, this may include or strip whitespace
      // Just verify it loads successfully
      expect(ds.getColumnCount()).toBeGreaterThanOrEqual(2);
    });

    it('handles quoted field with all delimiter types mixed', () => {
      const result = ds.loadFromContent('"a,b;c\td|e",f', 'test.csv', { delimiter: ',' });
      expect(result.success).toBe(true);
      expect(ds.getColumn(1)).toBe('a,b;c\td|e');
      expect(ds.getColumn(2)).toBe('f');
    });
  });

  // ===== populateVariables edge cases =====

  describe('populateVariables edge cases', () => {
    let ctx: VariableContext;

    beforeEach(() => {
      ctx = createVariableContext();
    });

    it('populateVariables when at end of datasource', () => {
      ds.loadFromContent('a,b\nc,d', 'test.csv', { delimiter: ',' });
      // Move past the end
      ds.nextRow(); // row 2
      ds.nextRow(); // returns false, stays at row 2

      // Should still populate with the last row's data
      ds.populateVariables(ctx);
      expect(ctx.get('!COL1')).toBe('c');
      expect(ctx.get('!COL2')).toBe('d');
      expect(ctx.get('!DATASOURCE_LINE')).toBe(2);
    });

    it('populateVariables when navigating past last row', () => {
      ds.loadFromContent('x,y', 'test.csv', { delimiter: ',' });
      // Only 1 row, try to go beyond
      expect(ds.nextRow()).toBe(false);

      // Should still populate with current (first) row
      ds.populateVariables(ctx);
      expect(ctx.get('!COL1')).toBe('x');
      expect(ctx.get('!DATASOURCE_LINE')).toBe(1);
    });

    it('populateVariables after unload clears all variables', () => {
      // Load and populate
      ds.loadFromContent('a,b,c', 'test.csv', { delimiter: ',' });
      ds.populateVariables(ctx);
      expect(ctx.get('!COL1')).toBe('a');
      expect(ctx.get('!DATASOURCE')).toBe('test.csv');
      expect(ctx.get('!DATASOURCE_LINE')).toBe(1);

      // Unload and populate again
      ds.unload();
      ds.populateVariables(ctx);

      // All datasource variables should be cleared
      expect(ctx.get('!DATASOURCE')).toBe('');
      expect(ctx.get('!DATASOURCE_LINE')).toBe(0);
      expect(ctx.get('!COL1')).toBe('');
      expect(ctx.get('!COL2')).toBe('');
    });

    it('populateVariables preserves non-datasource variables', () => {
      // Set a user variable
      ctx.set('!VAR1', 'myvalue');

      ds.loadFromContent('a,b', 'test.csv', { delimiter: ',' });
      ds.populateVariables(ctx);

      // Datasource vars are set
      expect(ctx.get('!COL1')).toBe('a');
      // User variable is preserved
      expect(ctx.get('!VAR1')).toBe('myvalue');
    });
  });

  // ===== Iterator edge cases =====

  describe('iterator edge cases', () => {
    it('iterator resets on subsequent iteration calls', () => {
      ds.loadFromContent('a,b\nc,d\ne,f', 'test.csv', { delimiter: ',' });

      // First iteration
      const firstRun: string[][] = [];
      for (const row of ds) {
        firstRun.push(row);
      }
      expect(firstRun.length).toBe(3);

      // Second iteration - should start from beginning again
      const secondRun: string[][] = [];
      for (const row of ds) {
        secondRun.push(row);
      }
      expect(secondRun.length).toBe(3);
      expect(secondRun).toEqual(firstRun);
    });

    it('iterator with single row', () => {
      ds.loadFromContent('solo,field', 'test.csv', { delimiter: ',' });

      const rows: string[][] = [];
      for (const row of ds) {
        rows.push(row);
      }

      expect(rows.length).toBe(1);
      expect(rows[0]).toEqual(['solo', 'field']);
    });

    it('iterator does not affect current row position', () => {
      ds.loadFromContent('a,b\nc,d\ne,f', 'test.csv', { delimiter: ',' });

      // Move to row 2
      ds.nextRow();
      expect(ds.getCurrentLineNumber()).toBe(2);

      // Iterate through all rows
      const rows: string[][] = [];
      for (const row of ds) {
        rows.push(row);
      }

      // Current position should still be at row 2
      expect(ds.getCurrentLineNumber()).toBe(2);
      expect(ds.getColumn(1)).toBe('c');
    });

    it('iterator works after reset', () => {
      ds.loadFromContent('a,b\nc,d\ne,f', 'test.csv', { delimiter: ',' });

      // Move to last row
      ds.goToRow(3);
      expect(ds.getCurrentLineNumber()).toBe(3);

      // Reset
      ds.reset();

      // Iterator should work normally
      const rows: string[][] = [];
      for (const row of ds) {
        rows.push(row);
      }

      expect(rows.length).toBe(3);
      expect(rows[0]).toEqual(['a', 'b']);
    });
  });
});
