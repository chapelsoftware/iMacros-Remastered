/**
 * Datasource (DS) Command Handler for iMacros
 *
 * NOTE: The DS command is an ENHANCEMENT over original iMacros 8.9.7,
 * which throws UnsupportedCommand("DS"). This implementation provides
 * convenient datasource navigation while maintaining original behavior.
 *
 * Original iMacros behavior (fully supported):
 * - SET !DATASOURCE file.csv  → loads CSV
 * - SET !DATASOURCE_LINE n    → sets which row to read
 * - {{!COL1}}                 → reads column 1 from row !DATASOURCE_LINE
 *
 * Enhancement (DS commands):
 * - DS CMD=NEXT  → increments !DATASOURCE_LINE
 * - DS CMD=RESET → resets !DATASOURCE_LINE to 1
 * - DS CMD=READ  → validates datasource is loaded (no-op)
 *
 * Uses DatasourceManager from shared/src/datasource.ts for CSV parsing.
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
 * DS command handler (Enhancement over original iMacros)
 *
 * NOTE: Original iMacros 8.9.7 does NOT support the DS command - it throws
 * UnsupportedCommand("DS"). This implementation is an enhancement that
 * provides convenient datasource navigation while maintaining compatibility
 * with original behavior ({{!COL1}} reads from !DATASOURCE_LINE).
 *
 * Syntax:
 * - DS CMD=NEXT  - Increment !DATASOURCE_LINE to next row
 * - DS CMD=RESET - Reset !DATASOURCE_LINE to 1
 * - DS CMD=READ  - Validate datasource is loaded (no-op, for compatibility)
 *
 * Unlike our previous implementation, this modifies !DATASOURCE_LINE directly
 * so that {{!COL1}} (which reads dynamically from that line) works correctly.
 *
 * Requires datasource to be loaded via SET !DATASOURCE.
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

  // Sync datasource rows from manager to VariableContext if needed
  // This handles the case where loadDatasourceFromContent was called directly
  const manager = getDatasourceManager();
  if (manager?.isLoaded() && ctx.variables.getDatasourceRowCount() === 0) {
    ctx.variables.setDatasourceRows(manager.getAllRows());
  }

  // Check if datasource is loaded by checking if rows exist
  const rowCount = ctx.variables.getDatasourceRowCount();
  if (rowCount === 0) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.DATASOURCE_ERROR,
      errorMessage: 'No datasource loaded. Set !DATASOURCE first.',
    };
  }

  // Get current line number (may be stored as string or number)
  const currentLine = ctx.variables.get('!DATASOURCE_LINE');
  const lineNum = typeof currentLine === 'number' ? currentLine : parseInt(String(currentLine), 10) || 1;

  switch (cmd) {
    case 'NEXT': {
      const nextLine = lineNum + 1;

      // Check if next line would be past end
      if (nextLine > rowCount) {
        return {
          success: false,
          errorCode: IMACROS_ERROR_CODES.DATASOURCE_END,
          errorMessage: 'End of datasource reached',
        };
      }

      // Increment !DATASOURCE_LINE - {{!COL1}} will now read from next row
      ctx.variables.setDatasourceLine(nextLine);

      ctx.log('debug', `DS NEXT: line ${nextLine} of ${rowCount}`);
      return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
    }

    case 'RESET': {
      // Reset !DATASOURCE_LINE to 1
      ctx.variables.setDatasourceLine(1);

      ctx.log('debug', 'DS RESET: !DATASOURCE_LINE reset to 1');
      return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
    }

    case 'READ': {
      // READ is a no-op - just validates datasource is loaded
      // {{!COL1}} already reads dynamically from !DATASOURCE_LINE
      const line = lineNum;

      if (line < 1 || line > rowCount) {
        return {
          success: false,
          errorCode: IMACROS_ERROR_CODES.DATASOURCE_END,
          errorMessage: `Datasource line ${line} is out of range (1-${rowCount})`,
        };
      }

      ctx.log('debug', `DS READ: line ${line} of ${rowCount}`);
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
