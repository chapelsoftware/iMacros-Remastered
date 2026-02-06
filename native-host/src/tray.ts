/**
 * System tray integration for iMacros Native Host
 *
 * Provides system tray icon with context menu showing:
 * - Current status (idle/recording/playing)
 * - Open Debugger action
 * - Show/Hide Window toggle
 * - Quit action
 */

import { Tray, Menu, nativeImage, app, BrowserWindow } from 'electron';
import * as path from 'path';

/** Possible states for the iMacros tray status */
export type TrayStatus = 'idle' | 'recording' | 'playing';

/** Event handlers for tray actions */
export interface TrayEventHandlers {
  onOpenDebugger?: () => void;
  onToggleWindow?: () => void;
  onQuit?: () => void;
}

/** System tray manager class */
export class TrayManager {
  private tray: Tray | null = null;
  private status: TrayStatus = 'idle';
  private handlers: TrayEventHandlers = {};
  private mainWindow: BrowserWindow | null = null;

  /**
   * Create a new TrayManager instance
   * @param mainWindow - Reference to the main BrowserWindow
   * @param handlers - Event handlers for tray menu actions
   */
  constructor(mainWindow: BrowserWindow | null, handlers: TrayEventHandlers = {}) {
    this.mainWindow = mainWindow;
    this.handlers = handlers;
  }

  /**
   * Initialize the system tray icon and menu
   */
  public init(): void {
    const iconPath = this.getIconPath();
    const icon = this.createIcon(iconPath);

    this.tray = new Tray(icon);
    this.tray.setToolTip('iMacros - Idle');

    this.updateContextMenu();

    // Double-click to show/hide window
    this.tray.on('double-click', () => {
      this.toggleWindow();
    });
  }

  /**
   * Get the path to the appropriate icon based on platform
   */
  private getIconPath(): string {
    const assetsDir = path.join(__dirname, '..', 'assets');

    // Use different icon sizes for different platforms
    if (process.platform === 'win32') {
      return path.join(assetsDir, 'tray-icon.ico');
    } else if (process.platform === 'darwin') {
      return path.join(assetsDir, 'tray-iconTemplate.png');
    } else {
      return path.join(assetsDir, 'tray-icon.png');
    }
  }

  /**
   * Get the path to the status-specific icon
   */
  private getStatusIconPath(): string {
    const assetsDir = path.join(__dirname, '..', 'assets');
    const suffix = process.platform === 'darwin' ? 'Template.png' : '.png';

    switch (this.status) {
      case 'recording':
        return path.join(assetsDir, `tray-icon-recording${suffix}`);
      case 'playing':
        return path.join(assetsDir, `tray-icon-playing${suffix}`);
      default:
        return path.join(assetsDir, `tray-icon${suffix}`);
    }
  }

  /**
   * Create a native image for the tray icon
   * Falls back to a generated icon if the file doesn't exist
   */
  private createIcon(iconPath: string): Electron.NativeImage {
    try {
      const icon = nativeImage.createFromPath(iconPath);
      if (!icon.isEmpty()) {
        // Resize for tray (16x16 on most platforms, 22x22 on some Linux)
        return icon.resize({ width: 16, height: 16 });
      }
    } catch (e) {
      // Fall through to generate icon
    }

    // Generate a simple placeholder icon if file doesn't exist
    return this.generatePlaceholderIcon();
  }

  /**
   * Generate a simple placeholder icon when no icon file exists
   */
  private generatePlaceholderIcon(): Electron.NativeImage {
    // Create a 16x16 PNG with a simple "iM" design
    // This is a minimal 16x16 transparent PNG with a blue square
    const size = 16;

    // Create an empty image and use nativeImage.createEmpty as fallback
    // Electron will show a default icon
    const empty = nativeImage.createEmpty();

    // Try to create a simple colored icon based on status
    const colors: Record<TrayStatus, string> = {
      idle: '#4A90D9',      // Blue
      recording: '#E53935', // Red
      playing: '#43A047'    // Green
    };

    // Since we can't easily generate PNG data without canvas,
    // return empty and let Electron handle it
    return empty;
  }

  /**
   * Update the context menu with current status
   */
  private updateContextMenu(): void {
    if (!this.tray) return;

    const statusLabels: Record<TrayStatus, string> = {
      idle: 'Status: Idle',
      recording: 'Status: Recording',
      playing: 'Status: Playing'
    };

    const windowVisible = this.mainWindow?.isVisible() ?? false;

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'iMacros',
        enabled: false
      },
      { type: 'separator' },
      {
        label: statusLabels[this.status],
        enabled: false,
        icon: this.getStatusIndicator()
      },
      { type: 'separator' },
      {
        label: 'Open Debugger',
        click: () => {
          if (this.handlers.onOpenDebugger) {
            this.handlers.onOpenDebugger();
          } else {
            this.openDebugger();
          }
        }
      },
      {
        label: windowVisible ? 'Hide Window' : 'Show Window',
        click: () => {
          if (this.handlers.onToggleWindow) {
            this.handlers.onToggleWindow();
          } else {
            this.toggleWindow();
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          if (this.handlers.onQuit) {
            this.handlers.onQuit();
          } else {
            app.quit();
          }
        }
      }
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  /**
   * Get a status indicator icon for the menu
   */
  private getStatusIndicator(): Electron.NativeImage | undefined {
    // Return undefined to skip icon in menu
    // A proper implementation would return small colored dots
    return undefined;
  }

  /**
   * Update the tray status and refresh the icon/menu
   * @param status - New status to set
   */
  public setStatus(status: TrayStatus): void {
    this.status = status;

    if (this.tray) {
      const tooltips: Record<TrayStatus, string> = {
        idle: 'iMacros - Idle',
        recording: 'iMacros - Recording...',
        playing: 'iMacros - Playing...'
      };

      this.tray.setToolTip(tooltips[status]);

      // Update icon based on status
      const iconPath = this.getStatusIconPath();
      const icon = this.createIcon(iconPath);
      if (!icon.isEmpty()) {
        this.tray.setImage(icon);
      }

      this.updateContextMenu();
    }
  }

  /**
   * Get the current status
   */
  public getStatus(): TrayStatus {
    return this.status;
  }

  /**
   * Update the reference to the main window
   * @param window - New BrowserWindow reference
   */
  public setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window;
    this.updateContextMenu();
  }

  /**
   * Toggle the main window visibility
   */
  private toggleWindow(): void {
    if (!this.mainWindow) return;

    if (this.mainWindow.isVisible()) {
      this.mainWindow.hide();
    } else {
      this.mainWindow.show();
      this.mainWindow.focus();
    }

    this.updateContextMenu();
  }

  /**
   * Open the debugger/developer tools
   */
  private openDebugger(): void {
    if (this.mainWindow) {
      this.mainWindow.show();
      this.mainWindow.webContents.openDevTools();
    }
  }

  /**
   * Destroy the tray icon
   */
  public destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

/**
 * Create and initialize a TrayManager instance
 * @param mainWindow - Reference to the main BrowserWindow
 * @param handlers - Optional event handlers
 * @returns Initialized TrayManager
 */
export function createTray(
  mainWindow: BrowserWindow | null,
  handlers: TrayEventHandlers = {}
): TrayManager {
  const trayManager = new TrayManager(mainWindow, handlers);
  trayManager.init();
  return trayManager;
}

export default TrayManager;
