/**
 * Registry Service for iMacros Native Host
 * Reads iMacros paths and settings from Windows Registry
 *
 * Registry Keys:
 * - HKLM\SOFTWARE\iOpus\iMacros - Machine-level settings
 * - HKCU\SOFTWARE\iOpus\iMacros - User-level settings
 */

// Type definitions for registry-js (no @types available)
interface RegistryValue {
  name: string;
  type: RegistryValueType;
  data: string | number | Buffer | string[];
}

type RegistryValueType =
  | 'REG_NONE'
  | 'REG_SZ'
  | 'REG_EXPAND_SZ'
  | 'REG_BINARY'
  | 'REG_DWORD'
  | 'REG_DWORD_BIG_ENDIAN'
  | 'REG_LINK'
  | 'REG_MULTI_SZ'
  | 'REG_RESOURCE_LIST'
  | 'REG_FULL_RESOURCE_DESCRIPTOR'
  | 'REG_RESOURCE_REQUIREMENTS_LIST'
  | 'REG_QWORD';

// Registry hive constants
const HKEY_LOCAL_MACHINE = 'HKEY_LOCAL_MACHINE';
const HKEY_CURRENT_USER = 'HKEY_CURRENT_USER';

// iMacros registry paths
const IMACROS_KEY_PATH = 'SOFTWARE\\iOpus\\iMacros';
const IMACROS_KEY_PATH_WOW64 = 'SOFTWARE\\WOW6432Node\\iOpus\\iMacros';

/**
 * iMacros folder paths from registry
 */
export interface IMacrosPaths {
  macros: string | null;
  datasources: string | null;
  downloads: string | null;
  logs: string | null;
  screenshots: string | null;
}

/**
 * iMacros settings from registry
 */
export interface IMacrosSettings {
  version: string | null;
  installPath: string | null;
  edition: string | null;
  licenseKey: string | null;
  autoSave: boolean;
  errorHandling: number;
  replaySpeed: number;
  timeout: number;
  useNativeEvents: boolean;
}

/**
 * Complete iMacros registry data
 */
export interface IMacrosRegistryData {
  paths: IMacrosPaths;
  settings: IMacrosSettings;
  source: 'hklm' | 'hkcu' | 'defaults';
}

/**
 * Default paths for non-Windows platforms or when registry is unavailable
 */
function getDefaultPaths(): IMacrosPaths {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const documentsDir = process.platform === 'win32'
    ? `${homeDir}\\Documents\\iMacros`
    : `${homeDir}/iMacros`;

  return {
    macros: `${documentsDir}${process.platform === 'win32' ? '\\Macros' : '/Macros'}`,
    datasources: `${documentsDir}${process.platform === 'win32' ? '\\Datasources' : '/Datasources'}`,
    downloads: `${documentsDir}${process.platform === 'win32' ? '\\Downloads' : '/Downloads'}`,
    logs: `${documentsDir}${process.platform === 'win32' ? '\\Logs' : '/Logs'}`,
    screenshots: `${documentsDir}${process.platform === 'win32' ? '\\Screenshots' : '/Screenshots'}`,
  };
}

/**
 * Default settings when registry is unavailable
 */
function getDefaultSettings(): IMacrosSettings {
  return {
    version: null,
    installPath: null,
    edition: 'Free',
    licenseKey: null,
    autoSave: true,
    errorHandling: 0,
    replaySpeed: 1,
    timeout: 60,
    useNativeEvents: false,
  };
}

/**
 * Check if running on Windows
 */
export function isWindows(): boolean {
  return process.platform === 'win32';
}

/**
 * Safely import registry-js (only available on Windows)
 */
function getRegistryModule(): any | null {
  if (!isWindows()) {
    return null;
  }

  try {
    // Dynamic import to avoid issues on non-Windows platforms
    return require('registry-js');
  } catch (error) {
    console.warn('registry-js module not available:', error);
    return null;
  }
}

/**
 * Read values from a registry key
 */
function readRegistryKey(
  registry: any,
  hive: string,
  keyPath: string
): RegistryValue[] | null {
  try {
    const hiveKey = hive === HKEY_LOCAL_MACHINE
      ? registry.HKEY.HKEY_LOCAL_MACHINE
      : registry.HKEY.HKEY_CURRENT_USER;

    const values = registry.enumerateValues(hiveKey, keyPath);
    return values;
  } catch (error) {
    return null;
  }
}

/**
 * Get a string value from registry values array
 */
function getStringValue(values: RegistryValue[], name: string): string | null {
  const value = values.find(v => v.name.toLowerCase() === name.toLowerCase());
  if (value && (value.type === 'REG_SZ' || value.type === 'REG_EXPAND_SZ')) {
    return value.data as string;
  }
  return null;
}

/**
 * Get a DWORD (number) value from registry values array
 */
function getDwordValue(values: RegistryValue[], name: string): number | null {
  const value = values.find(v => v.name.toLowerCase() === name.toLowerCase());
  if (value && value.type === 'REG_DWORD') {
    return value.data as number;
  }
  return null;
}

/**
 * Parse paths from registry values
 */
function parsePathsFromRegistry(values: RegistryValue[]): IMacrosPaths {
  const defaults = getDefaultPaths();

  return {
    macros: getStringValue(values, 'defMacroPath') ||
            getStringValue(values, 'MacroPath') ||
            defaults.macros,
    datasources: getStringValue(values, 'defDataPath') ||
                 getStringValue(values, 'DataPath') ||
                 defaults.datasources,
    downloads: getStringValue(values, 'defDownloadPath') ||
               getStringValue(values, 'DownloadPath') ||
               defaults.downloads,
    logs: getStringValue(values, 'defLogPath') ||
          getStringValue(values, 'LogPath') ||
          defaults.logs,
    screenshots: getStringValue(values, 'defScreenshotPath') ||
                 getStringValue(values, 'ScreenshotPath') ||
                 defaults.screenshots,
  };
}

/**
 * Parse settings from registry values
 */
function parseSettingsFromRegistry(values: RegistryValue[]): IMacrosSettings {
  const defaults = getDefaultSettings();

  const errorHandling = getDwordValue(values, 'ErrorHandling');
  const replaySpeed = getDwordValue(values, 'ReplaySpeed') ?? getDwordValue(values, 'Speed');
  const timeout = getDwordValue(values, 'Timeout') ?? getDwordValue(values, 'PageTimeout');
  const autoSave = getDwordValue(values, 'AutoSave');
  const useNativeEvents = getDwordValue(values, 'UseNativeEvents') ?? getDwordValue(values, 'NativeEvents');

  return {
    version: getStringValue(values, 'Version') || defaults.version,
    installPath: getStringValue(values, 'InstallPath') ||
                 getStringValue(values, 'Path') ||
                 defaults.installPath,
    edition: getStringValue(values, 'Edition') ||
             getStringValue(values, 'ProductType') ||
             defaults.edition,
    licenseKey: getStringValue(values, 'LicenseKey') ||
                getStringValue(values, 'Key') ||
                defaults.licenseKey,
    autoSave: autoSave !== null ? autoSave !== 0 : defaults.autoSave,
    errorHandling: errorHandling ?? defaults.errorHandling,
    replaySpeed: replaySpeed ?? defaults.replaySpeed,
    timeout: timeout ?? defaults.timeout,
    useNativeEvents: useNativeEvents !== null ? useNativeEvents !== 0 : defaults.useNativeEvents,
  };
}

/**
 * Read iMacros registry data from HKLM (machine-level)
 */
export function readMachineRegistry(): IMacrosRegistryData | null {
  const registry = getRegistryModule();
  if (!registry) {
    return null;
  }

  // Try standard path first
  let values = readRegistryKey(registry, HKEY_LOCAL_MACHINE, IMACROS_KEY_PATH);

  // Try WOW64 path for 32-bit apps on 64-bit Windows
  if (!values || values.length === 0) {
    values = readRegistryKey(registry, HKEY_LOCAL_MACHINE, IMACROS_KEY_PATH_WOW64);
  }

  if (!values || values.length === 0) {
    return null;
  }

  return {
    paths: parsePathsFromRegistry(values),
    settings: parseSettingsFromRegistry(values),
    source: 'hklm',
  };
}

/**
 * Read iMacros registry data from HKCU (user-level)
 */
export function readUserRegistry(): IMacrosRegistryData | null {
  const registry = getRegistryModule();
  if (!registry) {
    return null;
  }

  // Try standard path first
  let values = readRegistryKey(registry, HKEY_CURRENT_USER, IMACROS_KEY_PATH);

  // Try WOW64 path
  if (!values || values.length === 0) {
    values = readRegistryKey(registry, HKEY_CURRENT_USER, IMACROS_KEY_PATH_WOW64);
  }

  if (!values || values.length === 0) {
    return null;
  }

  return {
    paths: parsePathsFromRegistry(values),
    settings: parseSettingsFromRegistry(values),
    source: 'hkcu',
  };
}

/**
 * Read iMacros registry data with fallback chain:
 * 1. HKCU (user settings override)
 * 2. HKLM (machine settings)
 * 3. Defaults (non-Windows or no registry)
 */
export function readIMacrosRegistry(): IMacrosRegistryData {
  // On non-Windows, return defaults immediately
  if (!isWindows()) {
    return {
      paths: getDefaultPaths(),
      settings: getDefaultSettings(),
      source: 'defaults',
    };
  }

  // Try user registry first (user settings take precedence)
  const userData = readUserRegistry();
  if (userData) {
    // Merge with machine data for any missing values
    const machineData = readMachineRegistry();
    if (machineData) {
      // User paths override machine paths
      return {
        paths: {
          macros: userData.paths.macros || machineData.paths.macros,
          datasources: userData.paths.datasources || machineData.paths.datasources,
          downloads: userData.paths.downloads || machineData.paths.downloads,
          logs: userData.paths.logs || machineData.paths.logs,
          screenshots: userData.paths.screenshots || machineData.paths.screenshots,
        },
        settings: {
          version: userData.settings.version || machineData.settings.version,
          installPath: machineData.settings.installPath || userData.settings.installPath,
          edition: machineData.settings.edition || userData.settings.edition,
          licenseKey: userData.settings.licenseKey || machineData.settings.licenseKey,
          autoSave: userData.settings.autoSave,
          errorHandling: userData.settings.errorHandling,
          replaySpeed: userData.settings.replaySpeed,
          timeout: userData.settings.timeout,
          useNativeEvents: userData.settings.useNativeEvents,
        },
        source: 'hkcu',
      };
    }
    return userData;
  }

  // Fall back to machine registry
  const machineData = readMachineRegistry();
  if (machineData) {
    return machineData;
  }

  // Return defaults if no registry data found
  return {
    paths: getDefaultPaths(),
    settings: getDefaultSettings(),
    source: 'defaults',
  };
}

/**
 * Get just the paths from registry
 */
export function getIMacrosPaths(): IMacrosPaths {
  return readIMacrosRegistry().paths;
}

/**
 * Get just the settings from registry
 */
export function getIMacrosSettings(): IMacrosSettings {
  return readIMacrosRegistry().settings;
}

/**
 * Get a specific path from registry
 */
export function getIMacrosPath(pathType: keyof IMacrosPaths): string | null {
  return getIMacrosPaths()[pathType];
}

/**
 * RegistryService class for iMacros Windows Registry access
 */
export class RegistryService {
  private cache: IMacrosRegistryData | null = null;
  private cacheTimestamp: number = 0;
  private readonly cacheTtl: number = 5000; // 5 second cache

  /**
   * Check if registry access is available
   */
  isAvailable(): boolean {
    return isWindows() && getRegistryModule() !== null;
  }

  /**
   * Read all iMacros registry data (cached)
   */
  read(): IMacrosRegistryData {
    const now = Date.now();
    if (this.cache && (now - this.cacheTimestamp) < this.cacheTtl) {
      return this.cache;
    }

    this.cache = readIMacrosRegistry();
    this.cacheTimestamp = now;
    return this.cache;
  }

  /**
   * Force refresh the cache
   */
  refresh(): IMacrosRegistryData {
    this.cache = null;
    this.cacheTimestamp = 0;
    return this.read();
  }

  /**
   * Get paths from registry
   */
  getPaths(): IMacrosPaths {
    return this.read().paths;
  }

  /**
   * Get settings from registry
   */
  getSettings(): IMacrosSettings {
    return this.read().settings;
  }

  /**
   * Get a specific path
   */
  getPath(pathType: keyof IMacrosPaths): string | null {
    return this.getPaths()[pathType];
  }

  /**
   * Get macro folder path
   */
  getMacroPath(): string | null {
    return this.getPath('macros');
  }

  /**
   * Get datasource folder path
   */
  getDatasourcePath(): string | null {
    return this.getPath('datasources');
  }

  /**
   * Get download folder path
   */
  getDownloadPath(): string | null {
    return this.getPath('downloads');
  }

  /**
   * Get log folder path
   */
  getLogPath(): string | null {
    return this.getPath('logs');
  }

  /**
   * Get screenshot folder path
   */
  getScreenshotPath(): string | null {
    return this.getPath('screenshots');
  }

  /**
   * Get install path
   */
  getInstallPath(): string | null {
    return this.getSettings().installPath;
  }

  /**
   * Get iMacros version from registry
   */
  getVersion(): string | null {
    return this.getSettings().version;
  }

  /**
   * Get iMacros edition (Free, Personal, Enterprise)
   */
  getEdition(): string | null {
    return this.getSettings().edition;
  }

  // Static methods for convenience (no caching)
  static isWindows = isWindows;
  static readIMacrosRegistry = readIMacrosRegistry;
  static readMachineRegistry = readMachineRegistry;
  static readUserRegistry = readUserRegistry;
  static getIMacrosPaths = getIMacrosPaths;
  static getIMacrosSettings = getIMacrosSettings;
  static getIMacrosPath = getIMacrosPath;
}

// Export singleton instance
export const registryService = new RegistryService();

export default RegistryService;
