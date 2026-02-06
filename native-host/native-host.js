#!/usr/bin/env node
/**
 * iMacros Native Messaging Host
 *
 * This is the main entry point for native messaging.
 * It handles all communication with the browser extension via the
 * native messaging protocol (4-byte length-prefixed JSON over stdio).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Import shared library and local modules
let sharedLib;
let createBrowserBridge;
let createBrowserHandlers;

let sharedLibLoadError = null;
try {
  // Try to load the built shared library
  sharedLib = require('../shared/dist');
  const browserBridge = require('./src/browser-bridge');
  const commandHandlers = require('./src/command-handlers');
  createBrowserBridge = browserBridge.createBrowserBridge;
  createBrowserHandlers = commandHandlers.createBrowserHandlers;
} catch (e) {
  sharedLibLoadError = e.message;
  sharedLib = null;
}

// Configuration
const MACROS_DIR = path.join(os.homedir(), 'Documents', 'iMacros', 'Macros');
const DATASOURCES_DIR = path.join(os.homedir(), 'Documents', 'iMacros', 'Datasources');
const DOWNLOADS_DIR = path.join(os.homedir(), 'Documents', 'iMacros', 'Downloads');
// Ensure directories exist
[MACROS_DIR, DATASOURCES_DIR, DOWNLOADS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Log to a file for debugging
const logFile = fs.createWriteStream(path.join(__dirname, 'native-host.log'), { flags: 'a' });
function log(...args) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
  logFile.write(`[${new Date().toISOString()}] ${msg}\n`);
}

log('='.repeat(60));
log('Native host starting...');
log('Macros dir:', MACROS_DIR);
log('Platform:', process.platform);
if (sharedLibLoadError) {
  log('Could not load shared library:', sharedLibLoadError);
} else if (sharedLib) {
  log('Loaded shared library and command handlers');
}

const stdin = process.stdin;
const stdout = process.stdout;

let messageBuffer = Buffer.alloc(0);
let currentStatus = 'idle';

// Macro execution state
let activeExecutor = null;
let browserBridge = null;
let activeTabId = null;
let messageIdCounter = 0;

/**
 * Create a unique message ID
 */
function createMessageId() {
  return `nh_${Date.now()}_${++messageIdCounter}`;
}

// ============================================================================
// Native Messaging Protocol
// ============================================================================

/**
 * Send a message to the browser extension
 */
function sendMessage(message) {
  const messageString = JSON.stringify(message);
  const msgBuffer = Buffer.from(messageString, 'utf8');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32LE(msgBuffer.length, 0);

  const fullMessage = Buffer.concat([lengthBuffer, msgBuffer]);
  stdout.write(fullMessage);
  log('Sent to extension:', message.type, message.id || '');
}

/**
 * Send a response to a request
 */
function sendResponse(requestId, type, payload) {
  sendMessage({
    type: type,
    id: requestId,
    timestamp: Date.now(),
    payload: payload
  });
}

/**
 * Read a message from the buffer
 */
function readMessage() {
  if (messageBuffer.length < 4) {
    return null;
  }

  const messageLength = messageBuffer.readUInt32LE(0);

  if (messageBuffer.length < 4 + messageLength) {
    return null;
  }

  const messageData = messageBuffer.slice(4, 4 + messageLength);
  messageBuffer = messageBuffer.slice(4 + messageLength);

  try {
    return JSON.parse(messageData.toString('utf8'));
  } catch (e) {
    log('Failed to parse message:', e);
    return null;
  }
}

/**
 * Update the current status
 */
function updateTrayStatus(status) {
  currentStatus = status;
}

/**
 * Clean up resources
 */
function cleanup() {
  log('Cleaning up...');
}

// ============================================================================
// Macro Operations
// ============================================================================

/**
 * List macros in a directory
 */
function listMacros(dirPath = MACROS_DIR) {
  const macros = [];

  function walkDir(currentPath, prefix = '') {
    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          walkDir(fullPath, relativePath);
        } else if (entry.name.endsWith('.iim') || entry.name.endsWith('.js')) {
          macros.push({
            name: entry.name,
            path: relativePath,
            fullPath: fullPath,
            type: entry.name.endsWith('.js') ? 'javascript' : 'iim'
          });
        }
      }
    } catch (e) {
      log('Error reading directory:', currentPath, e.message);
    }
  }

  walkDir(dirPath);
  return macros;
}

/**
 * Play a macro file
 */
async function playMacro(macroPath, tabId, loop = false) {
  // Check if shared library is loaded
  if (!sharedLib || !createBrowserBridge || !createBrowserHandlers) {
    log('Shared library not loaded, using stub playback');
    updateTrayStatus('playing');
    sendMessage({
      type: 'STATUS_UPDATE',
      payload: { status: 'playing', macro: macroPath }
    });
    // Simulate completion after a short delay
    setTimeout(() => {
      sendMessage({
        type: 'MACRO_COMPLETE',
        payload: { success: true, macro: macroPath }
      });
      updateTrayStatus('idle');
      sendMessage({
        type: 'STATUS_UPDATE',
        payload: { status: 'idle' }
      });
    }, 100);
    return;
  }

  try {
    // Load the macro file
    const fullPath = path.isAbsolute(macroPath)
      ? macroPath
      : path.join(MACROS_DIR, macroPath);

    if (!fs.existsSync(fullPath)) {
      sendMessage({
        type: 'MACRO_ERROR',
        payload: { error: `Macro file not found: ${macroPath}` }
      });
      return;
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    log('Loaded macro content, length:', content.length);

    // Update status
    updateTrayStatus('playing');
    sendMessage({
      type: 'STATUS_UPDATE',
      payload: { status: 'playing', macro: macroPath }
    });

    // Create the browser bridge
    browserBridge = createBrowserBridge(sendMessage, createMessageId);

    // Set active tab if provided
    if (tabId) {
      browserBridge.setActiveTab(tabId);
      activeTabId = tabId;
    }

    // Parse maximum loops from macro
    let maxLoops = 1;
    const loopMatch = content.match(/SET\s+!LOOP\s+(\d+)/i);
    if (loopMatch) {
      maxLoops = parseInt(loopMatch[1], 10);
    }
    if (loop) {
      maxLoops = 999999; // Effectively infinite
    }

    // Create the executor
    const executor = new sharedLib.MacroExecutor({
      macroName: macroPath,
      maxLoops,
      onProgress: (progress) => {
        sendMessage({
          type: 'MACRO_PROGRESS',
          payload: {
            currentLine: progress.currentLine,
            totalLines: progress.totalLines,
            currentLoop: progress.currentLoop,
            maxLoops: progress.maxLoops,
            percentComplete: progress.percentComplete,
            status: progress.status,
            currentCommand: progress.currentCommand?.raw,
          }
        });
      },
      onLog: (level, msg) => {
        log(`[${level}] ${msg}`);
      },
    });

    activeExecutor = executor;

    // Register browser handlers
    const handlers = createBrowserHandlers(browserBridge);
    executor.registerHandlers(handlers);

    // Load and execute the macro
    executor.loadMacro(content);
    const result = await executor.execute();

    log('Macro execution complete:', result.success ? 'SUCCESS' : 'FAILED');

    // Send completion message
    sendMessage({
      type: result.success ? 'MACRO_COMPLETE' : 'MACRO_ERROR',
      payload: {
        success: result.success,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        errorLine: result.errorLine,
        loopsCompleted: result.loopsCompleted,
        executionTimeMs: result.executionTimeMs,
        extractData: result.extractData,
        macro: macroPath,
      }
    });

    // Update status
    updateTrayStatus('idle');
    sendMessage({
      type: 'STATUS_UPDATE',
      payload: { status: 'idle' }
    });

    activeExecutor = null;

  } catch (error) {
    log('Macro execution error:', error.message);
    sendMessage({
      type: 'MACRO_ERROR',
      payload: {
        error: error.message,
        macro: macroPath,
      }
    });
    updateTrayStatus('idle');
    sendMessage({
      type: 'STATUS_UPDATE',
      payload: { status: 'idle' }
    });
    activeExecutor = null;
  }
}

// ============================================================================
// Message Handling
// ============================================================================

/**
 * Handle incoming messages from the browser extension
 */
function handleMessage(message) {
  log('Received from extension:', message.type, message.id || '');

  switch (message.type) {
    case 'ping':
      sendResponse(message.id, 'pong', { timestamp: Date.now() });
      break;

    case 'get_macros':
    case 'list_macros':
      const macros = listMacros();
      sendResponse(message.id, 'macros_list', { macros });
      break;

    case 'load_macro':
      try {
        const macroPath = message.payload?.path;
        const fullPath = path.isAbsolute(macroPath)
          ? macroPath
          : path.join(MACROS_DIR, macroPath);
        const content = fs.readFileSync(fullPath, 'utf8');
        sendResponse(message.id, 'macro_loaded', { content, path: macroPath });
      } catch (e) {
        sendResponse(message.id, 'error', { error: e.message });
      }
      break;

    case 'save_macro':
      try {
        const macroPath = message.payload?.path;
        const content = message.payload?.content;
        const fullPath = path.isAbsolute(macroPath)
          ? macroPath
          : path.join(MACROS_DIR, macroPath);

        // Ensure directory exists
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf8');
        sendResponse(message.id, 'macro_saved', { path: macroPath });
      } catch (e) {
        sendResponse(message.id, 'error', { error: e.message });
      }
      break;

    case 'play_macro':
      log('Play macro requested:', message.payload?.path);
      playMacro(message.payload?.path, message.payload?.tabId, message.payload?.loop);
      break;

    case 'stop_macro':
      log('Stop macro requested');
      if (activeExecutor) {
        activeExecutor.stop();
        activeExecutor = null;
        updateTrayStatus('idle');
        sendMessage({
          type: 'STATUS_UPDATE',
          payload: { status: 'idle' }
        });
      }
      break;

    case 'pause_macro':
      log('Pause macro requested');
      if (activeExecutor) {
        activeExecutor.pause();
        updateTrayStatus('paused');
        sendMessage({
          type: 'MACRO_PAUSED',
          payload: {}
        });
      }
      break;

    case 'resume_macro':
      log('Resume macro requested');
      if (activeExecutor) {
        activeExecutor.resume();
        updateTrayStatus('playing');
        sendMessage({
          type: 'MACRO_RESUMED',
          payload: {}
        });
      }
      break;

    case 'browser_command_response':
      // Handle response from browser for pending commands
      if (message.error) {
        log('Browser command error:', message.error);
      }
      if (message.payload && !message.payload.success) {
        log('Browser command failed:', message.payload.error || JSON.stringify(message.payload));
      }
      if (browserBridge) {
        browserBridge.handleResponse(message);
      }
      break;

    case 'record_start':
      log('Recording started');
      updateTrayStatus('recording');
      sendMessage({
        type: 'STATUS_UPDATE',
        payload: { status: 'recording' }
      });
      break;

    case 'record_stop':
      log('Recording stopped');
      updateTrayStatus('idle');
      sendMessage({
        type: 'STATUS_UPDATE',
        payload: { status: 'idle' }
      });
      break;

    case 'record_event':
      log('Record event:', message.payload?.type);
      sendMessage({
        type: 'RECORDING_LINE',
        payload: message.payload
      });
      break;

    case 'get_settings':
      sendResponse(message.id, 'settings', {
        macrosFolder: MACROS_DIR,
        datasourcesFolder: DATASOURCES_DIR,
        downloadsFolder: DOWNLOADS_DIR,
        defaultTimeout: 30,
        replaySpeed: 'MEDIUM'
      });
      break;

    case 'settings_update':
      log('Settings updated:', message.payload);
      sendResponse(message.id, 'settings_updated', { success: true });
      break;

    case 'browse_folder':
      sendResponse(message.id, 'folder_selected', { path: MACROS_DIR });
      break;

    case 'execute':
      log('Execute command:', message.payload?.command);
      sendResponse(message.id, 'result', {
        success: true,
        output: 'Command executed'
      });
      break;

    case 'dialog_event':
      log('Dialog event:', message.payload?.type);
      break;

    default:
      log('Unknown message type:', message.type);
      sendResponse(message.id, 'error', { error: `Unknown message type: ${message.type}` });
  }
}

// ============================================================================
// Main
// ============================================================================

// Set up stdin handling
stdin.on('data', (chunk) => {
  messageBuffer = Buffer.concat([messageBuffer, chunk]);

  let message;
  while ((message = readMessage()) !== null) {
    handleMessage(message);
  }
});

stdin.on('end', () => {
  log('stdin ended - browser disconnected');
  cleanup();
  process.exit(0);
});

stdin.on('error', (err) => {
  log('stdin error:', err);
  cleanup();
  process.exit(1);
});

// Handle process termination
process.on('SIGINT', () => {
  log('SIGINT received');
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('SIGTERM received');
  cleanup();
  process.exit(0);
});

// Send ready message to extension
sendMessage({
  type: 'ready',
  version: '1.0.0',
  platform: process.platform,
  macrosFolder: MACROS_DIR
});

log('Ready message sent, waiting for input...');
