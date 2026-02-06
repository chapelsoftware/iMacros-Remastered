/**
 * macOS First-Run Setup
 *
 * This module handles first-launch registration tasks on macOS:
 * 1. Native messaging manifest installation for Chrome/Firefox
 * 2. Protocol handler registration via LSSetDefaultHandlerForURLScheme
 *
 * Native messaging manifests are installed to:
 * - Chrome: ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/
 * - Chromium: ~/Library/Application Support/Chromium/NativeMessagingHosts/
 * - Firefox: ~/Library/Application Support/Mozilla/NativeMessagingHosts/
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Extension IDs for native messaging
const CHROME_EXTENSION_ID = 'com.example.imacros'; // Replace with actual extension ID
const FIREFOX_EXTENSION_ID = 'imacros@example.com'; // Replace with actual extension ID

// Native messaging host name
const HOST_NAME = 'com.imacros.nativehost';

// Marker file to detect first run
const FIRST_RUN_MARKER = '.first-run-complete';

/**
 * Browser configurations for native messaging manifest installation
 */
interface BrowserConfig {
  name: string;
  manifestDir: string;
  manifestTemplate: (execPath: string) => object;
}

/**
 * Get browser configurations for macOS
 */
function getBrowserConfigs(execPath: string): BrowserConfig[] {
  const homeDir = process.env.HOME || '';

  return [
    {
      name: 'Chrome',
      manifestDir: path.join(homeDir, 'Library/Application Support/Google/Chrome/NativeMessagingHosts'),
      manifestTemplate: () => ({
        name: HOST_NAME,
        description: 'iMacros Native Messaging Host',
        path: execPath,
        type: 'stdio',
        allowed_origins: [`chrome-extension://${CHROME_EXTENSION_ID}/`],
      }),
    },
    {
      name: 'Chromium',
      manifestDir: path.join(homeDir, 'Library/Application Support/Chromium/NativeMessagingHosts'),
      manifestTemplate: () => ({
        name: HOST_NAME,
        description: 'iMacros Native Messaging Host',
        path: execPath,
        type: 'stdio',
        allowed_origins: [`chrome-extension://${CHROME_EXTENSION_ID}/`],
      }),
    },
    {
      name: 'Firefox',
      manifestDir: path.join(homeDir, 'Library/Application Support/Mozilla/NativeMessagingHosts'),
      manifestTemplate: () => ({
        name: HOST_NAME,
        description: 'iMacros Native Messaging Host',
        path: execPath,
        type: 'stdio',
        allowed_extensions: [FIREFOX_EXTENSION_ID],
      }),
    },
    {
      name: 'Edge',
      manifestDir: path.join(homeDir, 'Library/Application Support/Microsoft Edge/NativeMessagingHosts'),
      manifestTemplate: () => ({
        name: HOST_NAME,
        description: 'iMacros Native Messaging Host',
        path: execPath,
        type: 'stdio',
        allowed_origins: [`chrome-extension://${CHROME_EXTENSION_ID}/`],
      }),
    },
  ];
}

/**
 * Check if this is the first run of the application
 */
export function isFirstRun(): boolean {
  const markerPath = path.join(app.getPath('userData'), FIRST_RUN_MARKER);
  return !fs.existsSync(markerPath);
}

/**
 * Mark first run as complete
 */
function markFirstRunComplete(): void {
  const markerPath = path.join(app.getPath('userData'), FIRST_RUN_MARKER);
  const userDataDir = app.getPath('userData');

  // Ensure user data directory exists
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  fs.writeFileSync(markerPath, new Date().toISOString());
}

/**
 * Get the executable path for native messaging
 * This returns the path to the actual binary that should be launched
 */
function getExecutablePath(): string {
  // In development, use the electron binary
  if (!app.isPackaged) {
    return process.execPath;
  }

  // In production, return the app bundle's Contents/MacOS executable
  const appPath = app.getPath('exe');
  return appPath;
}

/**
 * Install native messaging manifest for a specific browser
 */
function installManifest(config: BrowserConfig, execPath: string): { success: boolean; error?: string } {
  try {
    // Create manifest directory if it doesn't exist
    if (!fs.existsSync(config.manifestDir)) {
      fs.mkdirSync(config.manifestDir, { recursive: true });
    }

    // Generate manifest
    const manifest = config.manifestTemplate(execPath);
    const manifestPath = path.join(config.manifestDir, `${HOST_NAME}.json`);

    // Write manifest file
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(`Installed native messaging manifest for ${config.name} at ${manifestPath}`);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Failed to install manifest for ${config.name}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Register imacros:// protocol handler via LSSetDefaultHandlerForURLScheme
 *
 * On macOS, protocol handlers are typically registered via Info.plist CFBundleURLTypes,
 * which electron-builder handles. However, we can also programmatically set the default
 * handler using the LSSetDefaultHandlerForURLScheme API via osascript.
 */
function registerProtocolHandler(): { success: boolean; error?: string } {
  try {
    // Get the app bundle identifier
    const bundleId = app.isPackaged ? 'com.imacros.nativehost' : null;

    if (!bundleId) {
      console.log('Skipping protocol handler registration in development mode');
      return { success: true };
    }

    // Use LSSetDefaultHandlerForURLScheme via Swift/Objective-C bridge
    // This is done through osascript running a small AppleScript
    const script = `
      use framework "CoreServices"
      use framework "Foundation"

      set bundleId to "${bundleId}"
      set urlScheme to "imacros"

      current application's LSSetDefaultHandlerForURLScheme(urlScheme, bundleId)
    `;

    try {
      execSync(`osascript -l AppleScript -e '${script.replace(/'/g, "'\"'\"'")}'`, {
        encoding: 'utf8',
        timeout: 5000,
      });
      console.log('Successfully registered imacros:// protocol handler');
    } catch {
      // AppleScript method may not work on all macOS versions
      // Fall back to using Electron's built-in method
      const registered = app.setAsDefaultProtocolClient('imacros');
      if (registered) {
        console.log('Registered imacros:// protocol handler via Electron');
      } else {
        console.warn('Could not register protocol handler - may require manual setup');
      }
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Failed to register protocol handler:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Uninstall native messaging manifests
 * Called during uninstallation or when the app is being removed
 */
export function uninstallNativeMessaging(): void {
  const execPath = getExecutablePath();
  const configs = getBrowserConfigs(execPath);

  for (const config of configs) {
    const manifestPath = path.join(config.manifestDir, `${HOST_NAME}.json`);
    try {
      if (fs.existsSync(manifestPath)) {
        fs.unlinkSync(manifestPath);
        console.log(`Removed native messaging manifest for ${config.name}`);
      }
    } catch (error) {
      console.error(`Failed to remove manifest for ${config.name}:`, error);
    }
  }
}

/**
 * Result of first-run setup
 */
export interface FirstRunResult {
  success: boolean;
  manifestResults: Array<{
    browser: string;
    success: boolean;
    error?: string;
  }>;
  protocolResult: {
    success: boolean;
    error?: string;
  };
}

/**
 * Perform first-run setup on macOS
 *
 * This function:
 * 1. Checks if this is the first run
 * 2. Installs native messaging manifests for all supported browsers
 * 3. Registers the imacros:// protocol handler
 * 4. Marks first run as complete
 *
 * @param force - Force setup even if not first run
 * @returns Setup result with details for each step
 */
export async function performFirstRunSetup(force: boolean = false): Promise<FirstRunResult> {
  // Only run on macOS
  if (process.platform !== 'darwin') {
    console.log('First-run setup skipped - not running on macOS');
    return {
      success: true,
      manifestResults: [],
      protocolResult: { success: true },
    };
  }

  // Check if first run (unless forced)
  if (!force && !isFirstRun()) {
    console.log('First-run setup already completed');
    return {
      success: true,
      manifestResults: [],
      protocolResult: { success: true },
    };
  }

  console.log('Performing macOS first-run setup...');

  const execPath = getExecutablePath();
  const configs = getBrowserConfigs(execPath);

  // Install manifests for all browsers
  const manifestResults = configs.map((config) => ({
    browser: config.name,
    ...installManifest(config, execPath),
  }));

  // Register protocol handler
  const protocolResult = registerProtocolHandler();

  // Mark first run complete
  markFirstRunComplete();

  // Determine overall success
  const allManifestsInstalled = manifestResults.every((r) => r.success);
  const success = allManifestsInstalled && protocolResult.success;

  console.log(`First-run setup ${success ? 'completed successfully' : 'completed with errors'}`);

  return {
    success,
    manifestResults,
    protocolResult,
  };
}

/**
 * Force re-registration of native messaging and protocol handlers
 * Useful for troubleshooting or after updates
 */
export async function forceReregister(): Promise<FirstRunResult> {
  return performFirstRunSetup(true);
}

export default {
  isFirstRun,
  performFirstRunSetup,
  forceReregister,
  uninstallNativeMessaging,
};
