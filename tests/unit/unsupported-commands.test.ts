/**
 * Unsupported Command Handlers Unit Tests
 *
 * Verifies that commands which were unsupported in the original iMacros Firefox
 * 8.9.7 return the proper UNSUPPORTED_COMMAND error code (-915) instead of
 * silently failing or crashing.
 *
 * Each command listed in the task is tested individually to ensure it:
 * 1. Returns success: false
 * 2. Returns errorCode: IMACROS_ERROR_CODES.UNSUPPORTED_COMMAND (-915)
 * 3. Includes a descriptive error message mentioning the command name
 * 4. Logs a warning about the unsupported command
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  MacroExecutor,
  createExecutor,
  IMACROS_ERROR_CODES,
} from '../../shared/src/executor';
import {
  createUnsupportedHandler,
  unsupportedHandlers,
  registerUnsupportedHandlers,
  imageClickHandler,
  onCertificateDialogUnsupportedHandler,
  onPrintUnsupportedHandler,
  onSecurityDialogUnsupportedHandler,
  onWebPageDialogUnsupportedHandler,
  sizeHandler,
  winClickHandler,
  disconnectUnsupportedHandler,
  redialUnsupportedHandler,
  extractStandaloneUnsupportedHandler,
  imageSearchHandler,
} from '../../shared/src/commands/unsupported';

// ===== Test Helpers =====

/**
 * Create an executor with unsupported handlers registered and logging captured.
 */
function createTestExecutor(): {
  executor: MacroExecutor;
  logs: Array<{ level: string; message: string }>;
} {
  const logs: Array<{ level: string; message: string }> = [];
  const executor = createExecutor({
    onLog: (level, message) => logs.push({ level, message }),
  });
  registerUnsupportedHandlers(executor.registerHandler.bind(executor));
  return { executor, logs };
}

// ===== Test Suite =====

describe('Unsupported Command Handlers', () => {

  describe('UNSUPPORTED_COMMAND error code', () => {
    it('should have UNSUPPORTED_COMMAND defined as -915', () => {
      expect(IMACROS_ERROR_CODES.UNSUPPORTED_COMMAND).toBe(-915);
    });
  });

  describe('createUnsupportedHandler factory', () => {
    it('should create a handler that returns UNSUPPORTED_COMMAND error', async () => {
      const handler = createUnsupportedHandler('TEST_CMD', 'not available');
      const { executor, logs } = createTestExecutor();

      // Execute a macro with a known command type to test the factory
      // We test the handler directly via the executor
      executor.registerHandler('CLEAR', handler);
      executor.loadMacro('CLEAR');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.UNSUPPORTED_COMMAND);
      expect(result.errorMessage).toContain('TEST_CMD');
      expect(result.errorMessage).toContain('not available');
    });

    it('should log a warning when the handler is invoked', async () => {
      const handler = createUnsupportedHandler('TEST_CMD', 'test reason');
      const { executor, logs } = createTestExecutor();

      executor.registerHandler('CLEAR', handler);
      executor.loadMacro('CLEAR');
      await executor.execute();

      const warningLogs = logs.filter(
        l => l.level === 'warn' && l.message.includes('Unsupported command')
      );
      expect(warningLogs.length).toBeGreaterThan(0);
      expect(warningLogs[0].message).toContain('TEST_CMD');
      expect(warningLogs[0].message).toContain('test reason');
    });
  });

  describe('unsupportedHandlers registry', () => {
    it('should contain all 11 unsupported commands', () => {
      // Note: PRINT was moved to supported commands (shared/src/commands/print.ts)
      const expectedCommands = [
        'IMAGECLICK',
        'ONCERTIFICATEDIALOG',
        'ONPRINT',
        'ONSECURITYDIALOG',
        'ONWEBPAGEDIALOG',
        'SIZE',
        'WINCLICK',
        'DISCONNECT',
        'REDIAL',
        'EXTRACT',
        'IMAGESEARCH',
      ];

      for (const cmd of expectedCommands) {
        expect(unsupportedHandlers).toHaveProperty(cmd);
        expect(typeof unsupportedHandlers[cmd as keyof typeof unsupportedHandlers]).toBe('function');
      }
    });
  });

  describe('registerUnsupportedHandlers', () => {
    it('should register all handlers with the executor', () => {
      const registered: string[] = [];
      const mockRegisterFn = (type: string) => {
        registered.push(type);
      };

      registerUnsupportedHandlers(mockRegisterFn as any);

      // Note: PRINT was moved to supported commands (shared/src/commands/print.ts)
      const expectedCommands = [
        'IMAGECLICK', 'ONCERTIFICATEDIALOG', 'ONPRINT',
        'ONSECURITYDIALOG', 'ONWEBPAGEDIALOG', 'SIZE',
        'WINCLICK', 'DISCONNECT', 'REDIAL', 'EXTRACT', 'IMAGESEARCH',
      ];

      for (const cmd of expectedCommands) {
        expect(registered).toContain(cmd);
      }
    });
  });

  // ===== Individual Command Tests =====
  // Each test verifies the command returns UNSUPPORTED_COMMAND (-915)

  describe('IMAGECLICK command', () => {
    it('should return UNSUPPORTED_COMMAND error', async () => {
      const { executor } = createTestExecutor();
      executor.loadMacro('IMAGECLICK IMAGE=test.png');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.UNSUPPORTED_COMMAND);
      expect(result.errorMessage).toContain('IMAGECLICK');
    });
  });

  describe('ONCERTIFICATEDIALOG command', () => {
    it('should return UNSUPPORTED_COMMAND error', async () => {
      const { executor } = createTestExecutor();
      executor.loadMacro('ONCERTIFICATEDIALOG BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.UNSUPPORTED_COMMAND);
      expect(result.errorMessage).toContain('ONCERTIFICATEDIALOG');
    });
  });

  describe('ONPRINT command', () => {
    it('should return UNSUPPORTED_COMMAND error', async () => {
      const { executor } = createTestExecutor();
      executor.loadMacro('ONPRINT BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.UNSUPPORTED_COMMAND);
      expect(result.errorMessage).toContain('ONPRINT');
    });
  });

  describe('ONSECURITYDIALOG command', () => {
    it('should return UNSUPPORTED_COMMAND error', async () => {
      const { executor } = createTestExecutor();
      executor.loadMacro('ONSECURITYDIALOG BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.UNSUPPORTED_COMMAND);
      expect(result.errorMessage).toContain('ONSECURITYDIALOG');
    });
  });

  describe('ONWEBPAGEDIALOG command', () => {
    it('should return UNSUPPORTED_COMMAND error', async () => {
      const { executor } = createTestExecutor();
      executor.loadMacro('ONWEBPAGEDIALOG BUTTON=OK');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.UNSUPPORTED_COMMAND);
      expect(result.errorMessage).toContain('ONWEBPAGEDIALOG');
    });
  });

  // Note: PRINT command tests moved to tests/unit/commands/print.test.ts
  // PRINT is now a supported command (shared/src/commands/print.ts)

  describe('SIZE command', () => {
    it('should return UNSUPPORTED_COMMAND error', async () => {
      const { executor } = createTestExecutor();
      executor.loadMacro('SIZE X=800 Y=600');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.UNSUPPORTED_COMMAND);
      expect(result.errorMessage).toContain('SIZE');
    });
  });

  describe('WINCLICK command', () => {
    it('should return UNSUPPORTED_COMMAND error', async () => {
      const { executor } = createTestExecutor();
      executor.loadMacro('WINCLICK X=100 Y=200');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.UNSUPPORTED_COMMAND);
      expect(result.errorMessage).toContain('WINCLICK');
    });
  });

  describe('DISCONNECT command', () => {
    it('should return UNSUPPORTED_COMMAND error', async () => {
      const { executor } = createTestExecutor();
      executor.loadMacro('DISCONNECT');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.UNSUPPORTED_COMMAND);
      expect(result.errorMessage).toContain('DISCONNECT');
    });
  });

  describe('REDIAL command', () => {
    it('should return UNSUPPORTED_COMMAND error', async () => {
      const { executor } = createTestExecutor();
      executor.loadMacro('REDIAL');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.UNSUPPORTED_COMMAND);
      expect(result.errorMessage).toContain('REDIAL');
    });
  });

  describe('Standalone EXTRACT command', () => {
    it('should return UNSUPPORTED_COMMAND error for EXTRACT without TAG', async () => {
      const { executor } = createTestExecutor();
      executor.loadMacro('EXTRACT TXT');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.UNSUPPORTED_COMMAND);
      expect(result.errorMessage).toContain('EXTRACT');
    });
  });

  describe('IMAGESEARCH command', () => {
    it('should return UNSUPPORTED_COMMAND error on non-Windows', async () => {
      const { executor } = createTestExecutor();
      executor.loadMacro('IMAGESEARCH POS=1 IMAGE=test.png CONFIDENCE=80');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.UNSUPPORTED_COMMAND);
      expect(result.errorMessage).toContain('IMAGESEARCH');
    });
  });

  // ===== Error Ignore Behavior =====

  describe('Error handling with ERRORIGNORE', () => {
    it('should continue execution when ERRORIGNORE is YES', async () => {
      const { executor } = createTestExecutor();
      executor.setErrorIgnore(true);

      const macro = [
        'SIZE X=800 Y=600',
        'WAIT SECONDS=0',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      // Should succeed because ERRORIGNORE skips the SIZE error
      // and WAIT executes fine
      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    });

    it('should stop execution on unsupported command when ERRORIGNORE is NO', async () => {
      const { executor } = createTestExecutor();

      const macro = [
        'SIZE X=800 Y=600',
        'WAIT SECONDS=0',
      ].join('\n');
      executor.loadMacro(macro);
      const result = await executor.execute();

      // Should fail on SIZE and not reach WAIT
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.UNSUPPORTED_COMMAND);
      expect(result.errorLine).toBe(1);
    });
  });

  // ===== Bulk Verification =====

  describe('All unsupported handlers return correct error code', () => {
    // Note: PRINT was moved to supported commands (shared/src/commands/print.ts)
    const handlers = [
      { name: 'IMAGECLICK', handler: imageClickHandler },
      { name: 'ONCERTIFICATEDIALOG', handler: onCertificateDialogUnsupportedHandler },
      { name: 'ONPRINT', handler: onPrintUnsupportedHandler },
      { name: 'ONSECURITYDIALOG', handler: onSecurityDialogUnsupportedHandler },
      { name: 'ONWEBPAGEDIALOG', handler: onWebPageDialogUnsupportedHandler },
      { name: 'SIZE', handler: sizeHandler },
      { name: 'WINCLICK', handler: winClickHandler },
      { name: 'DISCONNECT', handler: disconnectUnsupportedHandler },
      { name: 'REDIAL', handler: redialUnsupportedHandler },
      { name: 'EXTRACT (standalone)', handler: extractStandaloneUnsupportedHandler },
      { name: 'IMAGESEARCH', handler: imageSearchHandler },
    ];

    // Create a minimal mock context for direct handler invocation
    function createMockContext(): any {
      const logMessages: Array<{ level: string; message: string }> = [];
      return {
        command: { type: 'TEST', parameters: [], raw: 'TEST', lineNumber: 1, variables: [] },
        variables: { get: () => undefined, set: () => {}, expand: (t: string) => ({ expanded: t, variables: [] }) },
        state: { setVariable: () => {}, getVariable: () => undefined },
        getParam: () => undefined,
        getRequiredParam: () => { throw new Error('missing'); },
        expand: (t: string) => t,
        log: (level: string, message: string) => logMessages.push({ level, message }),
        _logs: logMessages,
      };
    }

    for (const { name, handler } of handlers) {
      it(`${name} handler returns errorCode -915 (UNSUPPORTED_COMMAND)`, async () => {
        const ctx = createMockContext();
        const result = await handler(ctx);

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(-915);
        expect(result.errorCode).toBe(IMACROS_ERROR_CODES.UNSUPPORTED_COMMAND);
        expect(result.errorMessage).toBeTruthy();
        expect(typeof result.errorMessage).toBe('string');
      });

      it(`${name} handler logs a warning`, async () => {
        const ctx = createMockContext();
        await handler(ctx);

        const warnings = ctx._logs.filter(
          (l: { level: string }) => l.level === 'warn'
        );
        expect(warnings.length).toBeGreaterThan(0);
        expect(warnings[0].message).toContain('Unsupported command');
      });
    }
  });
});
