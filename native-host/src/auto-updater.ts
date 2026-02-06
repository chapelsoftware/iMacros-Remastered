/**
 * Auto-updater module for iMacros Native Host
 *
 * Handles automatic updates using electron-updater.
 * Checks for updates on startup and periodically.
 *
 * Environment Variables for Configuration:
 * - GH_TOKEN: GitHub token for private repos
 * - UPDATE_FEED_URL: Custom update feed URL (optional)
 */

import { autoUpdater, UpdateCheckResult, UpdateInfo } from 'electron-updater';
import { app, BrowserWindow, dialog, Notification } from 'electron';
import * as log from 'electron-log';

// Configure logging
autoUpdater.logger = log;
(autoUpdater.logger as typeof log).transports.file.level = 'info';

export interface UpdaterOptions {
  /** Check for updates on app start */
  checkOnStartup?: boolean;
  /** Check for updates periodically (in hours) */
  checkInterval?: number;
  /** Allow pre-release updates */
  allowPrerelease?: boolean;
  /** Auto-download updates */
  autoDownload?: boolean;
  /** Auto-install on quit */
  autoInstallOnAppQuit?: boolean;
  /** Custom feed URL */
  feedUrl?: string;
}

const DEFAULT_OPTIONS: UpdaterOptions = {
  checkOnStartup: true,
  checkInterval: 4, // Check every 4 hours
  allowPrerelease: false,
  autoDownload: true,
  autoInstallOnAppQuit: true,
};

let updateCheckInterval: NodeJS.Timeout | null = null;
let mainWindow: BrowserWindow | null = null;

/**
 * Initialize the auto-updater
 */
export function initAutoUpdater(
  window: BrowserWindow | null,
  options: UpdaterOptions = {}
): void {
  mainWindow = window;
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Configure updater
  autoUpdater.allowPrerelease = opts.allowPrerelease ?? false;
  autoUpdater.autoDownload = opts.autoDownload ?? true;
  autoUpdater.autoInstallOnAppQuit = opts.autoInstallOnAppQuit ?? true;

  // Set custom feed URL if provided
  if (opts.feedUrl || process.env.UPDATE_FEED_URL) {
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: opts.feedUrl || process.env.UPDATE_FEED_URL!,
    });
  }

  // Set up event handlers
  setupEventHandlers();

  // Check on startup
  if (opts.checkOnStartup) {
    // Delay initial check to let the app fully load
    setTimeout(() => {
      checkForUpdates();
    }, 5000);
  }

  // Set up periodic checks
  if (opts.checkInterval && opts.checkInterval > 0) {
    const intervalMs = opts.checkInterval * 60 * 60 * 1000;
    updateCheckInterval = setInterval(() => {
      checkForUpdates();
    }, intervalMs);
  }
}

/**
 * Set up auto-updater event handlers
 */
function setupEventHandlers(): void {
  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...');
    sendStatusToWindow('Checking for updates...');
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    log.info('Update available:', info.version);
    sendStatusToWindow(`Update available: ${info.version}`);

    // Show notification
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: 'Update Available',
        body: `iMacros Native Host ${info.version} is available. Downloading...`,
      });
      notification.show();
    }
  });

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    log.info('Update not available, current version:', info.version);
    sendStatusToWindow('You have the latest version.');
  });

  autoUpdater.on('error', (err: Error) => {
    log.error('Update error:', err);
    sendStatusToWindow(`Update error: ${err.message}`);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const message = `Download speed: ${formatBytes(progressObj.bytesPerSecond)}/s - ${Math.round(progressObj.percent)}% (${formatBytes(progressObj.transferred)}/${formatBytes(progressObj.total)})`;
    log.info(message);
    sendStatusToWindow(message);

    // Update window progress bar if available
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setProgressBar(progressObj.percent / 100);
    }
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    log.info('Update downloaded:', info.version);
    sendStatusToWindow(`Update downloaded: ${info.version}`);

    // Clear progress bar
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setProgressBar(-1);
    }

    // Show dialog to user
    showUpdateReadyDialog(info);
  });
}

/**
 * Check for updates manually
 */
export async function checkForUpdates(): Promise<UpdateCheckResult | null> {
  try {
    return await autoUpdater.checkForUpdates();
  } catch (error) {
    log.error('Failed to check for updates:', error);
    return null;
  }
}

/**
 * Download update (if not auto-downloading)
 */
export async function downloadUpdate(): Promise<void> {
  try {
    await autoUpdater.downloadUpdate();
  } catch (error) {
    log.error('Failed to download update:', error);
    throw error;
  }
}

/**
 * Quit and install the downloaded update
 */
export function quitAndInstall(): void {
  autoUpdater.quitAndInstall(false, true);
}

/**
 * Show dialog when update is ready to install
 */
function showUpdateReadyDialog(info: UpdateInfo): void {
  const dialogOpts: Electron.MessageBoxOptions = {
    type: 'info',
    buttons: ['Restart Now', 'Later'],
    title: 'Application Update',
    message: `Version ${info.version} has been downloaded.`,
    detail: 'A new version has been downloaded. Restart the application to apply the updates.',
    defaultId: 0,
    cancelId: 1,
  };

  dialog.showMessageBox(dialogOpts).then((result) => {
    if (result.response === 0) {
      quitAndInstall();
    }
  });
}

/**
 * Send status message to renderer window
 */
function sendStatusToWindow(message: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater-status', message);
  }
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Stop the auto-updater (cleanup)
 */
export function stopAutoUpdater(): void {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  }
}

// Cleanup on app quit
app.on('before-quit', () => {
  stopAutoUpdater();
});
