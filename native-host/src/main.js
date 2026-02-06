const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const os = require('os');

// Protocol handler constants
const PROTOCOL_NAME = 'imacros';

// Check for IPC mode
const ipcModeIndex = process.argv.indexOf('--ipc-mode');
const isIPCMode = ipcModeIndex !== -1;
const ipcPipePath = isIPCMode ? process.argv[ipcModeIndex + 1] : null;

// Check for native messaging mode (Chrome passes chrome-extension://ID/ as argument)
const chromeOrigin = process.argv.find(arg => arg.startsWith('chrome-extension://'));
const isNativeMessaging = !!chromeOrigin;

// Import macOS first-run setup (conditionally for macOS)
let macosFirstRun = null;
if (process.platform === 'darwin') {
  try {
    macosFirstRun = require('./platform/macos-first-run');
  } catch (e) {
    console.error('Failed to load macOS first-run module:', e);
  }
}

const { parseMacro } = require('../../../shared/src/parser');
const { createExecutor } = require('../../../shared/src/executor');

let mainWindow = null;
let tray = null;
let currentStatus = 'idle';
let ipcSocket = null;
let nativeSendMessage = null;

// File-based logging
const logFile = fs.createWriteStream(path.join(__dirname, '..', 'electron.log'), { flags: 'a' });

/**
 * Log for debugging (always use stderr so stdout stays clean for native messaging)
 */
function log(...args) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  logFile.write(line);
  console.error('[Electron]', ...args);
}

const mode = isNativeMessaging ? 'native-messaging' : isIPCMode ? 'IPC' : 'standalone';
log('Starting in', mode, 'mode');
if (isNativeMessaging) {
  log('Chrome origin:', chromeOrigin);
}
if (isIPCMode) {
  log('IPC pipe:', ipcPipePath);
}

// ============================================================================
// Native Messaging (Chrome stdio protocol)
// ============================================================================

/**
 * Default macros folder path
 */
function getMacrosFolder() {
  return path.join(os.homedir(), 'Documents', 'iMacros', 'Macros');
}

/**
 * Recursively list .iim macro files in a directory
 */
function listMacroFiles(dir, basePath) {
  basePath = basePath || dir;
  const results = [];
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      return results;
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...listMacroFiles(fullPath, basePath));
      } else if (entry.name.toLowerCase().endsWith('.iim')) {
        results.push({
          name: entry.name,
          path: path.relative(basePath, fullPath).replace(/\\/g, '/'),
          fullPath: fullPath,
        });
      }
    }
  } catch (e) {
    log('Error listing macros:', e.message);
  }
  return results;
}

/**
 * Handle a message from the Chrome extension via native messaging
 */
function handleNativeMessage(message) {
  log('Native message received:', message.type, message.id);

  const response = {
    type: 'result',
    id: message.id || 'unknown',
    timestamp: Date.now(),
  };

  try {
    switch (message.type) {
      case 'ping':
        response.type = 'pong';
        break;

      case 'get_macros': {
        const macrosDir = getMacrosFolder();
        const macros = listMacroFiles(macrosDir);
        response.payload = { macros };
        break;
      }

      case 'load_macro': {
        const macroPath = message.payload && message.payload.path;
        if (!macroPath) {
          response.type = 'error';
          response.error = 'Missing macro path';
          break;
        }
        const macrosDir = getMacrosFolder();
        const fullPath = path.resolve(macrosDir, macroPath);
        // Security: ensure the path is within the macros directory
        if (!fullPath.startsWith(macrosDir)) {
          response.type = 'error';
          response.error = 'Path outside macros directory';
          break;
        }
        if (!fs.existsSync(fullPath)) {
          response.type = 'error';
          response.error = 'Macro file not found: ' + macroPath;
          break;
        }
        const content = fs.readFileSync(fullPath, 'utf-8');
        response.payload = { content, path: macroPath };
        break;
      }

      case 'save_macro': {
        const savePath = message.payload && message.payload.path;
        const saveContent = message.payload && message.payload.content;
        if (!savePath || saveContent === undefined) {
          response.type = 'error';
          response.error = 'Missing path or content';
          break;
        }
        const macrosDir = getMacrosFolder();
        const fullSavePath = path.resolve(macrosDir, savePath);
        if (!fullSavePath.startsWith(macrosDir)) {
          response.type = 'error';
          response.error = 'Path outside macros directory';
          break;
        }
        const dir = path.dirname(fullSavePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullSavePath, saveContent, 'utf-8');
        response.payload = { success: true, path: savePath };
        break;
      }

      case 'execute': {
        const script = message.payload && message.payload.script;
        const macroPath = message.payload && message.payload.path;

        let macroContent = script;
        if (!macroContent && macroPath) {
          const macrosDir = getMacrosFolder();
          const fullPath = path.resolve(macrosDir, macroPath);
          if (!fullPath.startsWith(macrosDir)) {
            response.type = 'error';
            response.error = 'Path outside macros directory';
            break;
          }
          if (!fs.existsSync(fullPath)) {
            response.type = 'error';
            response.error = 'Macro file not found';
            break;
          }
          macroContent = fs.readFileSync(fullPath, 'utf-8');
        }

        if (!macroContent) {
          response.type = 'error';
          response.error = 'No script or path provided';
          break;
        }

        // Execute asynchronously
        const executor = createExecutor();
        executor.loadMacro(macroContent);
        executor.execute()
          .then(result => {
            response.payload = {
              success: result.success,
              errorCode: result.errorCode,
              errorMessage: result.errorMessage,
              extractData: result.extractData,
              runtime: result.runtime,
            };
            nativeSendMessage(response);
          })
          .catch(err => {
            response.type = 'error';
            response.error = err.message || String(err);
            nativeSendMessage(response);
          });
        return; // Don't send response synchronously
      }

      default:
        response.type = 'error';
        response.error = 'Unknown message type: ' + message.type;
        break;
    }
  } catch (err) {
    response.type = 'error';
    response.error = err.message || String(err);
    log('Error handling native message:', err);
  }

  log('Sending response:', response.type, response.id);
  nativeSendMessage(response);
}

/**
 * Initialize native messaging protocol on stdin/stdout
 */
function initNativeMessaging() {
  const nativeMessaging = require('native-messaging');
  nativeSendMessage = nativeMessaging(handleNativeMessage);
  log('Native messaging initialized');
}

// ============================================================================
// IPC Communication
// ============================================================================

/**
 * Connect to the native host via IPC
 */
function connectToIPC() {
  if (!ipcPipePath) {
    log('No IPC pipe path specified');
    return;
  }

  log('Connecting to IPC pipe:', ipcPipePath);

  ipcSocket = net.createConnection(ipcPipePath, () => {
    log('Connected to native host via IPC');
  });

  let buffer = '';

  ipcSocket.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';  // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line);
          handleIPCMessage(message);
        } catch (e) {
          log('Failed to parse IPC message:', e);
        }
      }
    }
  });

  ipcSocket.on('close', () => {
    log('IPC connection closed');
    ipcSocket = null;
    // Native host disconnected, quit
    app.quit();
  });

  ipcSocket.on('error', (err) => {
    log('IPC connection error:', err);
    // Retry connection after a delay
    setTimeout(connectToIPC, 1000);
  });
}

/**
 * Send a message to the native host
 */
function sendToNativeHost(message) {
  if (ipcSocket && !ipcSocket.destroyed) {
    ipcSocket.write(JSON.stringify(message) + '\n');
  }
}

/**
 * Handle messages from the native host
 */
function handleIPCMessage(message) {
  log('Received from native host:', message.type);

  switch (message.type) {
    case 'status':
      setTrayStatus(message.status);
      break;

    case 'show_window':
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
      break;

    case 'hide_window':
      if (mainWindow) {
        mainWindow.hide();
      }
      break;

    default:
      log('Unknown IPC message type:', message.type);
  }
}

// ============================================================================
// Protocol Handler
// ============================================================================

/**
 * Parse an imacros:// URL and extract action and parameters
 */
function parseProtocolUrl(url) {
  try {
    const parsed = new URL(url);
    const action = parsed.hostname || parsed.pathname.replace(/^\/+/, '');

    if (!action) {
      return null;
    }

    const params = {};
    parsed.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    const macroName = params.m || params.macro || undefined;

    return { action, macroName, params };
  } catch (error) {
    log('Failed to parse imacros:// URL:', error);
    return null;
  }
}

/**
 * Handle an imacros:// protocol URL
 */
function handleProtocolUrl(url) {
  log('Handling protocol URL:', url);

  const parsed = parseProtocolUrl(url);
  if (!parsed) {
    log('Invalid imacros:// URL:', url);
    return;
  }

  switch (parsed.action) {
    case 'run':
      if (parsed.macroName) {
        // Send to native host to execute
        sendToNativeHost({
          type: 'protocol_execute',
          macroName: parsed.macroName,
          params: parsed.params
        });
      } else {
        log('Missing macro name in URL:', url);
      }
      break;
    default:
      log('Unknown action in imacros:// URL:', parsed.action);
  }
}

// ============================================================================
// Tray Icon
// ============================================================================

/**
 * Get the path to the tray icon based on status and platform
 */
function getTrayIconPath(status) {
  const assetsDir = path.join(__dirname, '..', 'assets');
  const suffix = process.platform === 'darwin' ? 'Template.png' : '.png';

  switch (status) {
    case 'recording':
      return path.join(assetsDir, `tray-icon-recording${suffix}`);
    case 'playing':
      return path.join(assetsDir, `tray-icon-playing${suffix}`);
    default:
      return path.join(assetsDir, `tray-icon${suffix}`);
  }
}

/**
 * Create a tray icon image
 */
function createTrayIcon(iconPath) {
  try {
    if (fs.existsSync(iconPath)) {
      const icon = nativeImage.createFromPath(iconPath);
      if (!icon.isEmpty()) {
        return icon.resize({ width: 16, height: 16 });
      }
    }
  } catch (e) {
    log('Failed to load tray icon:', e);
  }

  // Create a simple colored icon as fallback
  return createFallbackIcon(currentStatus);
}

/**
 * Create a fallback icon programmatically
 */
function createFallbackIcon(status) {
  // Create a simple 16x16 colored square
  const size = 16;
  const colors = {
    idle: { r: 100, g: 100, b: 100 },      // Gray
    recording: { r: 255, g: 0, b: 0 },      // Red
    playing: { r: 0, g: 200, b: 0 }         // Green
  };

  const color = colors[status] || colors.idle;

  // Create raw RGBA buffer
  const buffer = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buffer[i * 4] = color.r;      // R
    buffer[i * 4 + 1] = color.g;  // G
    buffer[i * 4 + 2] = color.b;  // B
    buffer[i * 4 + 3] = 255;      // A
  }

  return nativeImage.createFromBuffer(buffer, { width: size, height: size });
}

/**
 * Update the tray context menu
 */
function updateTrayMenu() {
  if (!tray) return;

  const statusLabels = {
    idle: 'Status: Idle',
    recording: 'Status: Recording',
    playing: 'Status: Playing'
  };

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'iMacros',
      enabled: false
    },
    { type: 'separator' },
    {
      label: statusLabels[currentStatus] || 'Status: Unknown',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Open Macros Folder',
      click: () => {
        const { shell } = require('electron');
        const os = require('os');
        const macrosDir = path.join(os.homedir(), 'Documents', 'iMacros', 'Macros');
        shell.openPath(macrosDir);
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        sendToNativeHost({ type: 'quit' });
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

/**
 * Update the tray status and icon
 */
function setTrayStatus(status) {
  currentStatus = status;
  log('Setting tray status:', status);

  if (!tray) return;

  const tooltips = {
    idle: 'iMacros - Idle',
    recording: 'iMacros - Recording...',
    playing: 'iMacros - Playing...'
  };

  tray.setToolTip(tooltips[status] || 'iMacros');

  const iconPath = getTrayIconPath(status);
  const icon = createTrayIcon(iconPath);
  tray.setImage(icon);

  updateTrayMenu();
}

/**
 * Create the system tray icon and menu
 */
function createTray() {
  try {
    const iconPath = getTrayIconPath(currentStatus);
    const icon = createTrayIcon(iconPath);

    tray = new Tray(icon);
    tray.setToolTip('iMacros - Idle');

    updateTrayMenu();

    // Double-click to open macros folder
    tray.on('double-click', () => {
      const { shell } = require('electron');
      const os = require('os');
      const macrosDir = path.join(os.homedir(), 'Documents', 'iMacros', 'Macros');
      shell.openPath(macrosDir);
    });

    log('Tray created successfully');
  } catch (e) {
    log('Failed to create tray:', e);
  }
}

// ============================================================================
// Window
// ============================================================================

/**
 * Create the main application window (hidden by default)
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 300,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadURL(`data:text/html,
    <!DOCTYPE html>
    <html>
      <head>
        <title>iMacros Native Host</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #f0f0f0;
          }
          .container { text-align: center; padding: 20px; }
          h1 { color: #333; font-size: 18px; }
          p { color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>iMacros Native Host</h1>
          <p>Running in ${isIPCMode ? 'IPC' : 'standalone'} mode</p>
          <p id="status">Status: Idle</p>
        </div>
      </body>
    </html>
  `);

  mainWindow.on('close', (event) => {
    // Don't actually close, just hide
    event.preventDefault();
    mainWindow.hide();
  });
}

// ============================================================================
// App Lifecycle
// ============================================================================

// Single instance lock (only in standalone mode, not native messaging)
if (!isIPCMode && !isNativeMessaging) {
  const gotTheLock = app.requestSingleInstanceLock();

  if (!gotTheLock) {
    app.quit();
  } else {
    app.on('second-instance', (event, commandLine) => {
      const protocolUrl = commandLine.find(arg => arg.startsWith('imacros://'));
      if (protocolUrl) {
        handleProtocolUrl(protocolUrl);
      }

      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  }
}

app.whenReady().then(async () => {
  // macOS first-run setup
  if (process.platform === 'darwin' && macosFirstRun) {
    try {
      await macosFirstRun.performFirstRunSetup();
    } catch (e) {
      log('macOS first-run setup failed:', e);
    }
  }

  if (isNativeMessaging) {
    // Native messaging mode - Chrome launched us for stdio communication
    initNativeMessaging();
    createTray();
    log('Running in native messaging mode, tray created');
  } else if (isIPCMode) {
    // IPC mode - connected to a separate native host process
    createWindow();
    createTray();
    connectToIPC();
  } else {
    // Standalone mode
    app.setAsDefaultProtocolClient(PROTOCOL_NAME);
    createWindow();
    createTray();
    mainWindow.show();
  }

  // Handle protocol URL on startup (Windows/Linux)
  const protocolUrl = process.argv.find(arg => arg.startsWith('imacros://'));
  if (protocolUrl) {
    handleProtocolUrl(protocolUrl);
  }
});

app.on('window-all-closed', () => {
  // Don't quit on window close - we have a tray icon
});

app.on('before-quit', () => {
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

// Handle protocol URL on macOS
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (url.startsWith('imacros://')) {
    handleProtocolUrl(url);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  log('Uncaught exception:', err);
});
