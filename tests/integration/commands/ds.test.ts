/**
 * Integration Tests for DS (Datasource) Command Handler
 *
 * Tests the DS command through the MacroExecutor, verifying:
 * - CMD=NEXT advances through rows and populates !COL1-10
 * - CMD=RESET returns to the first row
 * - CMD=READ reads the current row without advancing
 * - Error handling for missing datasource, missing CMD, invalid CMD, end-of-data
 * - Integration with the existing DatasourceManager from @shared/datasource
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  MacroExecutor,
  createExecutor,
  IMACROS_ERROR_CODES,
} from '../../../shared/src/executor';
import {
  loadDatasourceFromContent,
  setDatasourceManager,
  getDatasourceManager,
  registerDatasourceHandlers,
  dsCommandHandler,
} from '../../../shared/src/commands/datasource-handler';
import { DatasourceManager } from '../../../shared/src/datasource';

// ===== Test Helpers =====

/**
 * Create an executor with DS handlers registered and logging captured.
 */
function createTestExecutor(): {
  executor: MacroExecutor;
  logs: Array<{ level: string; message: string }>;
} {
  const logs: Array<{ level: string; message: string }> = [];
  const executor = createExecutor({
    onLog: (level, message) => logs.push({ level, message }),
  });
  registerDatasourceHandlers(executor.registerHandler.bind(executor));
  return { executor, logs };
}

// ===== Test Suite =====

describe('DS Command Handler', () => {
  beforeEach(() => {
    // Reset datasource manager state between tests
    setDatasourceManager(null);
  });

  // ===== CsvDatasourceManager (via DatasourceManager from datasource.ts) =====

  describe('DatasourceManager integration', () => {
    it('should load simple CSV content via loadDatasourceFromContent', () => {
      const success = loadDatasourceFromContent('a,b,c\n1,2,3');
      expect(success).toBe(true);

      const manager = getDatasourceManager();
      expect(manager).not.toBeNull();
      expect(manager!.isLoaded()).toBe(true);
      expect(manager!.getRowCount()).toBe(2);
      expect(manager!.getColumnCount()).toBe(3);
    });

    it('should handle quoted fields with commas inside', () => {
      const success = loadDatasourceFromContent('"hello, world",test\nfoo,bar');
      expect(success).toBe(true);

      const manager = getDatasourceManager()!;
      expect(manager.getRowCount()).toBe(2);

      const row = manager.getCurrentRow();
      expect(row.success).toBe(true);
      expect(row.row![0]).toBe('hello, world');
      expect(row.row![1]).toBe('test');
    });

    it('should advance through rows with nextRow', () => {
      loadDatasourceFromContent('a,b\nc,d\ne,f');
      const manager = getDatasourceManager()!;

      // Start at row 1
      expect(manager.getCurrentRow().row).toEqual(['a', 'b']);

      // Advance to row 2
      expect(manager.nextRow()).toBe(true);
      expect(manager.getCurrentRow().row).toEqual(['c', 'd']);

      // Advance to row 3
      expect(manager.nextRow()).toBe(true);
      expect(manager.getCurrentRow().row).toEqual(['e', 'f']);

      // No more rows
      expect(manager.nextRow()).toBe(false);
    });

    it('should reset to the beginning', () => {
      loadDatasourceFromContent('a,b\nc,d');
      const manager = getDatasourceManager()!;

      manager.nextRow();
      expect(manager.getCurrentRow().row).toEqual(['c', 'd']);

      manager.reset();
      expect(manager.getCurrentRow().row).toEqual(['a', 'b']);
    });

    it('should handle empty lines in CSV content', () => {
      loadDatasourceFromContent('a,b\n\nc,d\n');
      const manager = getDatasourceManager()!;
      // papaparse with skipEmptyLines skips blank lines
      expect(manager.getRowCount()).toBe(2);
    });
  });

  // ===== DS CMD=NEXT via executor =====

  describe('DS CMD=NEXT', () => {
    it('should populate !COL variables after first NEXT', async () => {
      loadDatasourceFromContent('alpha,beta,gamma\none,two,three');
      const { executor } = createTestExecutor();

      // First NEXT advances from row 1 to row 2
      // But the DatasourceManager starts at row 1 (index 0) and nextRow()
      // moves to row 2. So the first NEXT returns row 2's data.
      // To get row 1, use DS CMD=READ first.
      executor.loadMacro('DS CMD=NEXT');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.variables['!COL1']).toBe('one');
      expect(result.variables['!COL2']).toBe('two');
      expect(result.variables['!COL3']).toBe('three');
    });

    it('should populate !COL variables correctly when starting with READ then NEXT', async () => {
      loadDatasourceFromContent('alpha,beta,gamma\none,two,three');
      const { executor } = createTestExecutor();

      executor.loadMacro('DS CMD=READ\nDS CMD=NEXT');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      // After READ (row 1) then NEXT (row 2), we should be on row 2
      expect(result.variables['!COL1']).toBe('one');
      expect(result.variables['!COL2']).toBe('two');
      expect(result.variables['!COL3']).toBe('three');
    });

    it('should advance through rows on multiple NEXT calls', async () => {
      loadDatasourceFromContent('a,b\nc,d\ne,f');
      const { executor } = createTestExecutor();

      // Row 1 is initial, NEXT goes to row 2, NEXT goes to row 3
      executor.loadMacro('DS CMD=NEXT\nDS CMD=NEXT');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.variables['!COL1']).toBe('e');
      expect(result.variables['!COL2']).toBe('f');
    });

    it('should return DATASOURCE_END when past the last row', async () => {
      loadDatasourceFromContent('a,b');
      const { executor } = createTestExecutor();

      // Only 1 row: already at row 1, NEXT tries to go to row 2 which doesn't exist
      executor.loadMacro('DS CMD=NEXT');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.DATASOURCE_END);
    });

    it('should set !DATASOURCE_LINE after NEXT', async () => {
      loadDatasourceFromContent('a,b\nc,d\ne,f');
      const { executor } = createTestExecutor();

      executor.loadMacro('DS CMD=NEXT');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.variables['!DATASOURCE_LINE']).toBe(2);
    });

    it('should set empty string for missing columns', async () => {
      loadDatasourceFromContent('a,b');
      const { executor } = createTestExecutor();

      executor.loadMacro('DS CMD=READ');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.variables['!COL1']).toBe('a');
      expect(result.variables['!COL2']).toBe('b');
      // Columns 3-10 should be empty strings
      expect(result.variables['!COL3']).toBe('');
      expect(result.variables['!COL10']).toBe('');
    });
  });

  // ===== DS CMD=RESET =====

  describe('DS CMD=RESET', () => {
    it('should reset position to the first row', async () => {
      loadDatasourceFromContent('x,y\na,b');
      const { executor } = createTestExecutor();

      // NEXT to row 2, then RESET to row 1, then READ row 1
      executor.loadMacro('DS CMD=NEXT\nDS CMD=RESET\nDS CMD=READ');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.variables['!COL1']).toBe('x');
      expect(result.variables['!COL2']).toBe('y');
    });

    it('should allow re-iterating after RESET', async () => {
      loadDatasourceFromContent('a,b\nc,d');
      const { executor } = createTestExecutor();

      // Go to end, reset, then NEXT to row 2 again
      executor.loadMacro('DS CMD=NEXT\nDS CMD=RESET\nDS CMD=NEXT');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.variables['!COL1']).toBe('c');
      expect(result.variables['!COL2']).toBe('d');
    });

    it('should populate !COL variables with row 1 after RESET', async () => {
      loadDatasourceFromContent('first,second\nthird,fourth');
      const { executor } = createTestExecutor();

      executor.loadMacro('DS CMD=NEXT\nDS CMD=RESET');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.variables['!COL1']).toBe('first');
      expect(result.variables['!COL2']).toBe('second');
      expect(result.variables['!DATASOURCE_LINE']).toBe(1);
    });
  });

  // ===== DS CMD=READ =====

  describe('DS CMD=READ', () => {
    it('should read the current row without advancing', async () => {
      loadDatasourceFromContent('hello,world');
      const { executor } = createTestExecutor();

      executor.loadMacro('DS CMD=READ');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.variables['!COL1']).toBe('hello');
      expect(result.variables['!COL2']).toBe('world');
    });

    it('should read the same row on repeated READ calls', async () => {
      loadDatasourceFromContent('alpha,beta\ngamma,delta');
      const { executor } = createTestExecutor();

      executor.loadMacro('DS CMD=READ\nDS CMD=READ');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      // Should still be on the first row
      expect(result.variables['!COL1']).toBe('alpha');
      expect(result.variables['!COL2']).toBe('beta');
      expect(result.variables['!DATASOURCE_LINE']).toBe(1);
    });

    it('should read the new row after NEXT', async () => {
      loadDatasourceFromContent('a,b\nc,d');
      const { executor } = createTestExecutor();

      executor.loadMacro('DS CMD=NEXT\nDS CMD=READ');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.variables['!COL1']).toBe('c');
      expect(result.variables['!COL2']).toBe('d');
    });
  });

  // ===== DS error handling =====

  describe('DS error handling', () => {
    it('should return DATASOURCE_ERROR when no datasource is loaded', async () => {
      const { executor } = createTestExecutor();

      executor.loadMacro('DS CMD=NEXT');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.DATASOURCE_ERROR);
    });

    it('should return MISSING_PARAMETER when CMD is missing', async () => {
      loadDatasourceFromContent('a,b');
      const { executor } = createTestExecutor();

      executor.loadMacro('DS');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    });

    it('should return INVALID_PARAMETER for unknown CMD value', async () => {
      loadDatasourceFromContent('a,b');
      const { executor } = createTestExecutor();

      executor.loadMacro('DS CMD=INVALID');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    });

    it('should return DATASOURCE_ERROR for RESET when no datasource is loaded', async () => {
      const { executor } = createTestExecutor();

      executor.loadMacro('DS CMD=RESET');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.DATASOURCE_ERROR);
    });

    it('should return DATASOURCE_ERROR for READ when no datasource is loaded', async () => {
      const { executor } = createTestExecutor();

      executor.loadMacro('DS CMD=READ');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.DATASOURCE_ERROR);
    });
  });

  // ===== DS with ERRORIGNORE =====

  describe('DS with ERRORIGNORE', () => {
    it('should continue execution when ERRORIGNORE is YES and datasource ends', async () => {
      loadDatasourceFromContent('a,b');
      const { executor } = createTestExecutor();
      executor.setErrorIgnore(true);

      // NEXT will fail (only 1 row), but ERRORIGNORE should let us continue
      executor.loadMacro('DS CMD=NEXT\nSET !VAR1 survived');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe('survived');
    });
  });

  // ===== DS with multi-column data =====

  describe('DS with various data shapes', () => {
    it('should handle 10 columns', async () => {
      const cols = Array.from({ length: 10 }, (_, i) => `val${i + 1}`);
      loadDatasourceFromContent(cols.join(','));
      const { executor } = createTestExecutor();

      executor.loadMacro('DS CMD=READ');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      for (let i = 1; i <= 10; i++) {
        expect(result.variables[`!COL${i}`]).toBe(`val${i}`);
      }
    });

    it('should handle more than 10 columns (only first 10 mapped)', async () => {
      const cols = Array.from({ length: 12 }, (_, i) => `v${i + 1}`);
      loadDatasourceFromContent(cols.join(','));
      const { executor } = createTestExecutor();

      executor.loadMacro('DS CMD=READ');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      // First 10 are set
      for (let i = 1; i <= 10; i++) {
        expect(result.variables[`!COL${i}`]).toBe(`v${i}`);
      }
    });

    it('should handle single-column CSV', async () => {
      loadDatasourceFromContent('only_one\nsecond_row');
      const { executor } = createTestExecutor();

      executor.loadMacro('DS CMD=READ');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.variables['!COL1']).toBe('only_one');
      expect(result.variables['!COL2']).toBe('');
    });

    it('should handle tab-delimited data', async () => {
      loadDatasourceFromContent('a\tb\tc\nd\te\tf', '', { delimiter: '\t' });
      const { executor } = createTestExecutor();

      executor.loadMacro('DS CMD=READ');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.variables['!COL1']).toBe('a');
      expect(result.variables['!COL2']).toBe('b');
      expect(result.variables['!COL3']).toBe('c');
    });
  });

  // ===== DS with onDatasourceLoad callback =====

  describe('DS with onDatasourceLoad callback', () => {
    it('should load datasource when SET !DATASOURCE is used with callback', async () => {
      const logs: Array<{ level: string; message: string }> = [];
      const executor = createExecutor({
        onLog: (level, message) => logs.push({ level, message }),
        onDatasourceLoad: (path: string) => {
          // Simulate reading a file and returning CSV content
          if (path === 'test.csv') {
            return 'hello,world\nfoo,bar';
          }
          throw new Error(`File not found: ${path}`);
        },
      });
      registerDatasourceHandlers(executor.registerHandler.bind(executor));

      executor.loadMacro('SET !DATASOURCE test.csv\nDS CMD=READ');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.variables['!COL1']).toBe('hello');
      expect(result.variables['!COL2']).toBe('world');
    });
  });
});
