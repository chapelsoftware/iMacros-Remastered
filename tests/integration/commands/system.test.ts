/**
 * System Commands Integration Tests
 *
 * Tests SET and VERSION commands that handle system-level operations.
 * These tests verify variable management and version information.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Variable types in iMacros
 */
type VariableType = 'string' | 'number' | 'boolean' | 'array';

/**
 * Variable entry
 */
interface Variable {
  name: string;
  value: string | number | boolean | string[];
  type: VariableType;
  readonly: boolean;
}

/**
 * Built-in system variables
 */
const SYSTEM_VARIABLES = {
  '!LOOP': { value: 1, type: 'number' as VariableType, readonly: true },
  '!DATASOURCE': { value: '', type: 'string' as VariableType, readonly: false },
  '!DATASOURCE_LINE': { value: 1, type: 'number' as VariableType, readonly: false },
  '!DATASOURCE_COLUMNS': { value: 0, type: 'number' as VariableType, readonly: true },
  '!EXTRACT': { value: '', type: 'string' as VariableType, readonly: true },
  '!EXTRACTDIALOG': { value: 'NO', type: 'string' as VariableType, readonly: false },
  '!TIMEOUT_STEP': { value: 6, type: 'number' as VariableType, readonly: false },
  '!TIMEOUT_PAGE': { value: 60, type: 'number' as VariableType, readonly: false },
  '!TIMEOUT_TAG': { value: 10, type: 'number' as VariableType, readonly: false },
  '!ERRORIGNORE': { value: 'NO', type: 'string' as VariableType, readonly: false },
  '!REPLAYSPEED': { value: 'MEDIUM', type: 'string' as VariableType, readonly: false },
  '!FILESTOPWATCH': { value: '', type: 'string' as VariableType, readonly: false },
  '!FOLDER_DATASOURCE': { value: '/datasource', type: 'string' as VariableType, readonly: false },
  '!FOLDER_DOWNLOAD': { value: '/downloads', type: 'string' as VariableType, readonly: false },
  '!NOW': { value: '', type: 'string' as VariableType, readonly: true },
  '!COL1': { value: '', type: 'string' as VariableType, readonly: true },
  '!COL2': { value: '', type: 'string' as VariableType, readonly: true },
  '!COL3': { value: '', type: 'string' as VariableType, readonly: true },
};

/**
 * Variable manager for macro execution
 */
class VariableManager {
  private variables: Map<string, Variable> = new Map();
  private userVariables: Map<string, Variable> = new Map();

  constructor() {
    this.initializeSystemVariables();
  }

  /**
   * Initialize system variables
   */
  private initializeSystemVariables(): void {
    for (const [name, config] of Object.entries(SYSTEM_VARIABLES)) {
      this.variables.set(name, {
        name,
        value: config.value,
        type: config.type,
        readonly: config.readonly,
      });
    }
  }

  /**
   * Set a variable value
   * SET varname value
   */
  set(name: string, value: string | number | boolean | string[]): { success: boolean; error?: string } {
    const upperName = name.toUpperCase();

    // Check if it's a system variable
    if (upperName.startsWith('!')) {
      const sysVar = this.variables.get(upperName);
      if (!sysVar) {
        return { success: false, error: `Unknown system variable: ${name}` };
      }
      if (sysVar.readonly) {
        return { success: false, error: `Cannot modify readonly variable: ${name}` };
      }

      // Validate type
      if (!this.validateType(value, sysVar.type)) {
        return { success: false, error: `Invalid type for ${name}: expected ${sysVar.type}` };
      }

      sysVar.value = value;
      return { success: true };
    }

    // User variable
    const type = this.inferType(value);
    this.userVariables.set(upperName, {
      name: upperName,
      value,
      type,
      readonly: false,
    });

    return { success: true };
  }

  /**
   * Get a variable value
   */
  get(name: string): string | number | boolean | string[] | undefined {
    const upperName = name.toUpperCase();

    // Check system variables first
    if (upperName.startsWith('!')) {
      const sysVar = this.variables.get(upperName);
      if (sysVar) {
        // Handle special dynamic variables
        if (upperName === '!NOW') {
          return new Date().toISOString();
        }
        return sysVar.value;
      }
      return undefined;
    }

    // Check user variables
    const userVar = this.userVariables.get(upperName);
    return userVar?.value;
  }

  /**
   * Check if a variable exists
   */
  exists(name: string): boolean {
    const upperName = name.toUpperCase();
    return this.variables.has(upperName) || this.userVariables.has(upperName);
  }

  /**
   * Delete a user variable
   */
  delete(name: string): boolean {
    const upperName = name.toUpperCase();

    // Cannot delete system variables
    if (upperName.startsWith('!')) {
      return false;
    }

    return this.userVariables.delete(upperName);
  }

  /**
   * Get all user variables
   */
  getUserVariables(): Variable[] {
    return Array.from(this.userVariables.values());
  }

  /**
   * Get all system variables
   */
  getSystemVariables(): Variable[] {
    return Array.from(this.variables.values());
  }

  /**
   * Clear all user variables
   */
  clearUserVariables(): void {
    this.userVariables.clear();
  }

  /**
   * Reset system variables to defaults
   */
  resetSystemVariables(): void {
    this.variables.clear();
    this.initializeSystemVariables();
  }

  /**
   * Infer type from value
   */
  private inferType(value: string | number | boolean | string[]): VariableType {
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    return 'string';
  }

  /**
   * Validate value type
   */
  private validateType(value: unknown, expectedType: VariableType): boolean {
    if (expectedType === 'string') {
      return typeof value === 'string' || typeof value === 'number';
    }
    if (expectedType === 'number') {
      return typeof value === 'number' || !isNaN(Number(value));
    }
    if (expectedType === 'boolean') {
      return typeof value === 'boolean' ||
        value === 'YES' || value === 'NO' ||
        value === 'true' || value === 'false';
    }
    if (expectedType === 'array') {
      return Array.isArray(value);
    }
    return true;
  }

  /**
   * Expand variables in a string
   * Replaces {{varname}} with variable values
   */
  expand(text: string): string {
    return text.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
      const value = this.get(varName.trim());
      if (value === undefined) {
        return match; // Keep original if not found
      }
      return String(value);
    });
  }
}

/**
 * Version information
 */
interface VersionInfo {
  major: number;
  minor: number;
  patch: number;
  build?: number;
  type: 'free' | 'personal' | 'professional' | 'enterprise';
  platform: 'chrome' | 'firefox' | 'edge';
  fullVersion: string;
}

/**
 * VERSION command implementation
 */
class VersionCommand {
  private versionInfo: VersionInfo;

  constructor(versionInfo: Partial<VersionInfo> = {}) {
    this.versionInfo = {
      major: versionInfo.major ?? 8,
      minor: versionInfo.minor ?? 9,
      patch: versionInfo.patch ?? 7,
      build: versionInfo.build,
      type: versionInfo.type ?? 'personal',
      platform: versionInfo.platform ?? 'firefox',
      fullVersion: '',
    };
    this.versionInfo.fullVersion = this.formatVersion();
  }

  /**
   * Format version string
   */
  private formatVersion(): string {
    const { major, minor, patch, build } = this.versionInfo;
    let version = `${major}.${minor}.${patch}`;
    if (build !== undefined) {
      version += `.${build}`;
    }
    return version;
  }

  /**
   * Get version string
   * VERSION
   */
  getVersion(): string {
    return this.versionInfo.fullVersion;
  }

  /**
   * Get full version info
   */
  getVersionInfo(): VersionInfo {
    return { ...this.versionInfo };
  }

  /**
   * Check if version meets minimum requirement
   */
  meetsMinimum(minMajor: number, minMinor: number = 0, minPatch: number = 0): boolean {
    const { major, minor, patch } = this.versionInfo;

    if (major > minMajor) return true;
    if (major < minMajor) return false;

    if (minor > minMinor) return true;
    if (minor < minMinor) return false;

    return patch >= minPatch;
  }

  /**
   * Check if a feature is available based on version type
   */
  hasFeature(feature: string): boolean {
    const typeFeatures: Record<string, string[]> = {
      free: ['basic_recording', 'basic_playback'],
      personal: ['basic_recording', 'basic_playback', 'data_extraction', 'csv_support'],
      professional: [
        'basic_recording', 'basic_playback', 'data_extraction', 'csv_support',
        'scripting_interface', 'command_line', 'encryption',
      ],
      enterprise: [
        'basic_recording', 'basic_playback', 'data_extraction', 'csv_support',
        'scripting_interface', 'command_line', 'encryption', 'distributed_execution',
        'api_access', 'priority_support',
      ],
    };

    const availableFeatures = typeFeatures[this.versionInfo.type] ?? [];
    return availableFeatures.includes(feature);
  }

  /**
   * Get platform info
   */
  getPlatform(): string {
    return this.versionInfo.platform;
  }

  /**
   * Get license type
   */
  getLicenseType(): string {
    return this.versionInfo.type;
  }
}

/**
 * SET command implementation
 */
class SetCommand {
  private variableManager: VariableManager;

  constructor(variableManager: VariableManager) {
    this.variableManager = variableManager;
  }

  /**
   * Set a variable
   * SET varname value
   */
  execute(name: string, value: string | number | boolean | string[]): { success: boolean; error?: string } {
    return this.variableManager.set(name, value);
  }

  /**
   * Set multiple variables
   */
  executeBatch(variables: Array<{ name: string; value: string | number | boolean | string[] }>): {
    success: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    for (const { name, value } of variables) {
      const result = this.variableManager.set(name, value);
      if (!result.success && result.error) {
        errors.push(result.error);
      }
    }

    return {
      success: errors.length === 0,
      errors,
    };
  }
}

describe('System Commands Integration Tests', () => {
  describe('VariableManager', () => {
    let manager: VariableManager;

    beforeEach(() => {
      manager = new VariableManager();
    });

    it('should initialize with system variables', () => {
      expect(manager.exists('!LOOP')).toBe(true);
      expect(manager.exists('!TIMEOUT_PAGE')).toBe(true);
      expect(manager.exists('!ERRORIGNORE')).toBe(true);
    });

    it('should get system variable values', () => {
      expect(manager.get('!LOOP')).toBe(1);
      expect(manager.get('!TIMEOUT_PAGE')).toBe(60);
      expect(manager.get('!ERRORIGNORE')).toBe('NO');
    });

    it('should set modifiable system variables', () => {
      const result = manager.set('!TIMEOUT_PAGE', 120);

      expect(result.success).toBe(true);
      expect(manager.get('!TIMEOUT_PAGE')).toBe(120);
    });

    it('should not modify readonly system variables', () => {
      const result = manager.set('!LOOP', 5);

      expect(result.success).toBe(false);
      expect(result.error).toContain('readonly');
      expect(manager.get('!LOOP')).toBe(1);
    });

    it('should set user variables', () => {
      const result = manager.set('MYVAR', 'myvalue');

      expect(result.success).toBe(true);
      expect(manager.get('MYVAR')).toBe('myvalue');
    });

    it('should be case-insensitive for variable names', () => {
      manager.set('MyVariable', 'test');

      expect(manager.get('MYVARIABLE')).toBe('test');
      expect(manager.get('myvariable')).toBe('test');
    });

    it('should handle numeric values', () => {
      manager.set('COUNT', 42);

      expect(manager.get('COUNT')).toBe(42);
    });

    it('should handle boolean values', () => {
      manager.set('FLAG', true);

      expect(manager.get('FLAG')).toBe(true);
    });

    it('should handle array values', () => {
      manager.set('LIST', ['a', 'b', 'c']);

      expect(manager.get('LIST')).toEqual(['a', 'b', 'c']);
    });

    it('should delete user variables', () => {
      manager.set('TEMP', 'value');
      expect(manager.exists('TEMP')).toBe(true);

      const result = manager.delete('TEMP');

      expect(result).toBe(true);
      expect(manager.exists('TEMP')).toBe(false);
    });

    it('should not delete system variables', () => {
      const result = manager.delete('!LOOP');

      expect(result).toBe(false);
      expect(manager.exists('!LOOP')).toBe(true);
    });

    it('should expand variables in text', () => {
      manager.set('NAME', 'World');
      manager.set('COUNT', 42);

      const expanded = manager.expand('Hello {{NAME}}, count is {{COUNT}}');

      expect(expanded).toBe('Hello World, count is 42');
    });

    it('should keep unknown variables unexpanded', () => {
      const expanded = manager.expand('Hello {{UNKNOWN}}');

      expect(expanded).toBe('Hello {{UNKNOWN}}');
    });

    it('should get dynamic !NOW variable', () => {
      const now = manager.get('!NOW');

      expect(typeof now).toBe('string');
      expect((now as string).length).toBeGreaterThan(0);
    });

    it('should get all user variables', () => {
      manager.set('VAR1', 'value1');
      manager.set('VAR2', 'value2');

      const userVars = manager.getUserVariables();

      expect(userVars).toHaveLength(2);
      expect(userVars.map((v) => v.name)).toContain('VAR1');
      expect(userVars.map((v) => v.name)).toContain('VAR2');
    });

    it('should clear user variables', () => {
      manager.set('VAR1', 'value1');
      manager.set('VAR2', 'value2');

      manager.clearUserVariables();

      expect(manager.getUserVariables()).toHaveLength(0);
      expect(manager.exists('!LOOP')).toBe(true); // System vars preserved
    });

    it('should reset system variables', () => {
      manager.set('!TIMEOUT_PAGE', 120);

      manager.resetSystemVariables();

      expect(manager.get('!TIMEOUT_PAGE')).toBe(60);
    });

    it('should validate system variable types', () => {
      const result = manager.set('!TIMEOUT_PAGE', 'not a number');

      // Should fail because 'not a number' cannot be coerced to a number
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid type');
    });

    it('should return undefined for non-existent variables', () => {
      expect(manager.get('NONEXISTENT')).toBeUndefined();
    });

    it('should return error for unknown system variables', () => {
      const result = manager.set('!UNKNOWN', 'value');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown system variable');
    });
  });

  describe('SET Command', () => {
    let manager: VariableManager;
    let setCommand: SetCommand;

    beforeEach(() => {
      manager = new VariableManager();
      setCommand = new SetCommand(manager);
    });

    it('should set a variable', () => {
      const result = setCommand.execute('USERNAME', 'admin');

      expect(result.success).toBe(true);
      expect(manager.get('USERNAME')).toBe('admin');
    });

    it('should set system variable', () => {
      const result = setCommand.execute('!ERRORIGNORE', 'YES');

      expect(result.success).toBe(true);
      expect(manager.get('!ERRORIGNORE')).toBe('YES');
    });

    it('should fail for readonly variable', () => {
      const result = setCommand.execute('!EXTRACT', 'test');

      expect(result.success).toBe(false);
    });

    it('should set batch of variables', () => {
      const result = setCommand.executeBatch([
        { name: 'VAR1', value: 'value1' },
        { name: 'VAR2', value: 'value2' },
        { name: 'VAR3', value: 'value3' },
      ]);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(manager.get('VAR1')).toBe('value1');
      expect(manager.get('VAR2')).toBe('value2');
      expect(manager.get('VAR3')).toBe('value3');
    });

    it('should collect errors in batch set', () => {
      const result = setCommand.executeBatch([
        { name: 'VAR1', value: 'value1' },
        { name: '!LOOP', value: 5 }, // readonly
        { name: 'VAR2', value: 'value2' },
      ]);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(manager.get('VAR1')).toBe('value1');
      expect(manager.get('VAR2')).toBe('value2');
    });
  });

  describe('VERSION Command', () => {
    let versionCommand: VersionCommand;

    beforeEach(() => {
      versionCommand = new VersionCommand();
    });

    it('should return version string', () => {
      const version = versionCommand.getVersion();

      expect(version).toBe('8.9.7');
    });

    it('should return full version info', () => {
      const info = versionCommand.getVersionInfo();

      expect(info.major).toBe(8);
      expect(info.minor).toBe(9);
      expect(info.patch).toBe(7);
      expect(info.platform).toBe('firefox');
    });

    it('should check minimum version', () => {
      expect(versionCommand.meetsMinimum(8)).toBe(true);
      expect(versionCommand.meetsMinimum(8, 9)).toBe(true);
      expect(versionCommand.meetsMinimum(8, 9, 7)).toBe(true);
      expect(versionCommand.meetsMinimum(8, 9, 8)).toBe(false);
      expect(versionCommand.meetsMinimum(9)).toBe(false);
    });

    it('should include build number when present', () => {
      const cmd = new VersionCommand({ major: 8, minor: 9, patch: 7, build: 100 });

      expect(cmd.getVersion()).toBe('8.9.7.100');
    });

    it('should check feature availability', () => {
      const personalCmd = new VersionCommand({ type: 'personal' });
      expect(personalCmd.hasFeature('data_extraction')).toBe(true);
      expect(personalCmd.hasFeature('scripting_interface')).toBe(false);

      const proCmd = new VersionCommand({ type: 'professional' });
      expect(proCmd.hasFeature('scripting_interface')).toBe(true);
      expect(proCmd.hasFeature('distributed_execution')).toBe(false);

      const enterpriseCmd = new VersionCommand({ type: 'enterprise' });
      expect(enterpriseCmd.hasFeature('distributed_execution')).toBe(true);
    });

    it('should get platform info', () => {
      expect(versionCommand.getPlatform()).toBe('firefox');

      const chromeCmd = new VersionCommand({ platform: 'chrome' });
      expect(chromeCmd.getPlatform()).toBe('chrome');
    });

    it('should get license type', () => {
      expect(versionCommand.getLicenseType()).toBe('personal');

      const freeCmd = new VersionCommand({ type: 'free' });
      expect(freeCmd.getLicenseType()).toBe('free');
    });
  });

  describe('System Command Integration', () => {
    let manager: VariableManager;
    let setCommand: SetCommand;
    let versionCommand: VersionCommand;

    beforeEach(() => {
      manager = new VariableManager();
      setCommand = new SetCommand(manager);
      versionCommand = new VersionCommand();
    });

    it('should configure system behavior through SET', () => {
      // Configure timeouts
      setCommand.execute('!TIMEOUT_PAGE', 120);
      setCommand.execute('!TIMEOUT_TAG', 30);

      // Configure error handling
      setCommand.execute('!ERRORIGNORE', 'YES');

      // Configure replay speed
      setCommand.execute('!REPLAYSPEED', 'FAST');

      expect(manager.get('!TIMEOUT_PAGE')).toBe(120);
      expect(manager.get('!TIMEOUT_TAG')).toBe(30);
      expect(manager.get('!ERRORIGNORE')).toBe('YES');
      expect(manager.get('!REPLAYSPEED')).toBe('FAST');
    });

    it('should configure data source through SET', () => {
      setCommand.execute('!DATASOURCE', 'data.csv');
      setCommand.execute('!DATASOURCE_LINE', 1);
      setCommand.execute('!FOLDER_DATASOURCE', '/data');

      expect(manager.get('!DATASOURCE')).toBe('data.csv');
      expect(manager.get('!DATASOURCE_LINE')).toBe(1);
      expect(manager.get('!FOLDER_DATASOURCE')).toBe('/data');
    });

    it('should use version to check feature availability before execution', () => {
      // Only professional+ can use scripting interface
      if (versionCommand.hasFeature('scripting_interface')) {
        // Would enable SI commands
      }

      // Verify current version has required features
      expect(versionCommand.meetsMinimum(8, 0)).toBe(true);
    });

    it('should expand variables with version info', () => {
      manager.set('VERSION', versionCommand.getVersion());
      manager.set('PLATFORM', versionCommand.getPlatform());

      const text = manager.expand('Running iMacros {{VERSION}} on {{PLATFORM}}');

      expect(text).toBe('Running iMacros 8.9.7 on firefox');
    });

    it('should handle macro variable workflow', () => {
      // Set initial variables
      setCommand.execute('URL', 'https://example.com');
      setCommand.execute('USERNAME', 'testuser');
      setCommand.execute('PASSWORD', 'testpass');

      // Expand in command
      const command = manager.expand('URL GOTO={{URL}}');
      expect(command).toBe('URL GOTO=https://example.com');

      // Update variable during execution
      setCommand.execute('RESULT', 'success');
      expect(manager.get('RESULT')).toBe('success');

      // Clean up
      manager.clearUserVariables();
      expect(manager.getUserVariables()).toHaveLength(0);
    });
  });
});
