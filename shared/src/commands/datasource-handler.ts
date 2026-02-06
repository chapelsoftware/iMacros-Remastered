/**
 * Datasource (DS) Command Handler for iMacros
 *
 * Implements the DS command for reading data from CSV datasources.
 * Supports CMD=NEXT, CMD=RESET, CMD=READ operations and populates
 * !COL1-10 variables with column data.
 *
 * Uses the existing DatasourceManager from shared/src/datasource.ts
 * for CSV parsing (papaparse-backed).
 */

import {
  CommandHandler,
  CommandContext,
  CommandResult,
  IMACROS_ERROR_CODES,
} from '../executor';
import type { CommandType } from '../parser';
import { DatasourceManager, createDatasourceManager } from '../datasource';

// Module-level datasource manager instance
let datasourceManager: DatasourceManager | null = null;

/**
 * Get the current datasource manager (for testing and external access)
 */
export function getDatasourceManager(): DatasourceManager | null {
  return datasourceManager;
}

/**
 * Set the datasource manager (for testing and external injection)
 */
export function setDatasourceManager(manager: DatasourceManager | null): void {
  datasourceManager = manager;
}

/**
 * Ensure a datasource manager exists, creating a default one if needed
 */
export function ensureDatasourceManager(): DatasourceManager {
  if (!datasourceManager) {
    datasourceManager = createDatasourceManager();
  }
  return datasourceManager;
}

/**
 * Load datasource from CSV content string.
 *
 * Call this before executing DS commands. The DS handler will use
 * the loaded datasource for NEXT/RESET/READ operations.
 *
 * @param content - CSV content string
 * @param filePath - Optional file path for tracking
 * @param options - Optional parsing options (delimiter, hasHeader, etc.)
 * @returns true if content was loaded successfully
 */
export function loadDatasourceFromContent(
  content: string,
  filePath: string = '',
  options?: { delimiter?: ',' | '\t' | ';' | '|' | 'auto'; hasHeader?: boolean }
): boolean {
  const manager = ensureDatasourceManager();
  const result = manager.loadFromContent(content, filePath, options);
  return result.success;
}

/**
 * Populate !COL1-10 and datasource metadata variables from the current row.
 */
function populateColVariables(ctx: CommandContext, manager: DatasourceManager): void {
  manager.populateVariables(ctx.variables);
}

/**
 * DS command handler
 *
 * Syntax:
 * - DS CMD=NEXT  - Move to next row and populate !COL variables
 * - DS CMD=RESET - Reset to beginning (first row)
 * - DS CMD=READ  - Read current row (auto-advances on first call)
 *
 * Populates !COL1-10 variables with column values from the current row.
 * Requires datasource to be loaded via loadDatasourceFromContent() or
 * SET !DATASOURCE with an onDatasourceLoad callback.
 */
export const dsCommandHandler: CommandHandler = async (
  ctx: CommandContext
): Promise<CommandResult> => {
  const cmdParam = ctx.getParam('CMD');

  if (!cmdParam) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'DS command requires CMD parameter (NEXT, RESET, or READ)',
    };
  }

  const cmd = ctx.expand(cmdParam).toUpperCase();
  const manager = ensureDatasourceManager();

  // Check if datasource is loaded
  if (!manager.isLoaded()) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.DATASOURCE_ERROR,
      errorMessage: 'No datasource loaded. Set !DATASOURCE first.',
    };
  }

  switch (cmd) {
    case 'NEXT': {
      const hasNext = manager.nextRow();
      if (!hasNext) {
        // Check if we're already on the last row (first NEXT advances from row 1 to row 2).
        // If nextRow returns false, we may be at end OR it could be a single-row file
        // where we're already on the only row. In original iMacros, NEXT past last row
        // signals end-of-datasource.
        return {
          success: false,
          errorCode: IMACROS_ERROR_CODES.DATASOURCE_END,
          errorMessage: 'End of datasource reached',
        };
      }

      // Populate !COL variables from the new current row
      populateColVariables(ctx, manager);

      ctx.log(
        'debug',
        `DS NEXT: line ${manager.getCurrentLineNumber()} of ${manager.getRowCount()}`
      );
      return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
    }

    case 'RESET': {
      manager.reset();
      // Populate !COL variables with the first row (reset goes back to row 1)
      populateColVariables(ctx, manager);

      ctx.log('debug', 'DS RESET: position reset to line 1');
      return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
    }

    case 'READ': {
      // READ populates !COL variables with the current row.
      // On the very first READ call, the manager starts at row 1 (index 0).
      const rowResult = manager.getCurrentRow();
      if (!rowResult.success) {
        return {
          success: false,
          errorCode: IMACROS_ERROR_CODES.DATASOURCE_END,
          errorMessage: rowResult.error || 'Datasource is empty or at end',
        };
      }

      populateColVariables(ctx, manager);

      ctx.log(
        'debug',
        `DS READ: line ${manager.getCurrentLineNumber()} of ${manager.getRowCount()}`
      );
      return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
    }

    default:
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
        errorMessage: `Invalid DS CMD value: ${cmd}. Valid values: NEXT, RESET, READ`,
      };
  }
};

// ===== Handler Registration =====

/**
 * All datasource command handlers
 */
export const datasourceHandlers: Partial<Record<CommandType, CommandHandler>> = {
  DS: dsCommandHandler,
};

/**
 * Register datasource handlers with an executor
 */
export function registerDatasourceHandlers(
  registerFn: (type: CommandType, handler: CommandHandler) => void
): void {
  for (const [type, handler] of Object.entries(datasourceHandlers)) {
    if (handler) {
      registerFn(type as CommandType, handler);
    }
  }
}
