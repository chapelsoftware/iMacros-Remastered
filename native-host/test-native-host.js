#!/usr/bin/env node
/**
 * iMacros Native Messaging Host
 * Handles communication between the browser extension and the local system
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

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

log('Native host starting...');
log('Macros dir:', MACROS_DIR);

const stdin = process.stdin;
const stdout = process.stdout;

let messageBuffer = Buffer.alloc(0);

/**
 * Send a message to the extension
 */
function sendMessage(message) {
  const messageString = JSON.stringify(message);
  const msgBuffer = Buffer.from(messageString, 'utf8');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32LE(msgBuffer.length, 0);

  const fullMessage = Buffer.concat([lengthBuffer, msgBuffer]);
  stdout.write(fullMessage);
  log('Sent:', message.type, message.id || '');
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
      log('Error reading directory:', currentPath, e);
    }
  }

  walkDir(dirPath);
  return macros;
}

/**
 * Handle incoming messages
 */
function handleMessage(message) {
  log('Received:', message.type, message.id || '');

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
      // For now, just acknowledge - actual playback would require more implementation
      log('Play macro requested:', message.payload?.path);
      sendMessage({
        type: 'STATUS_UPDATE',
        payload: { status: 'playing', macro: message.payload?.path }
      });
      // Simulate completion after a short delay
      setTimeout(() => {
        sendMessage({
          type: 'MACRO_COMPLETE',
          payload: { success: true, macro: message.payload?.path }
        });
        sendMessage({
          type: 'STATUS_UPDATE',
          payload: { status: 'idle' }
        });
      }, 100);
      break;

    case 'record_start':
      log('Recording started');
      sendMessage({
        type: 'STATUS_UPDATE',
        payload: { status: 'recording' }
      });
      break;

    case 'record_stop':
      log('Recording stopped');
      sendMessage({
        type: 'STATUS_UPDATE',
        payload: { status: 'idle' }
      });
      break;

    case 'record_event':
      log('Record event:', message.payload);
      // Echo back as a recording line
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
      // Acknowledge settings update
      sendResponse(message.id, 'settings_updated', { success: true });
      break;

    case 'browse_folder':
      // For now, just return the current macros folder
      // A full implementation would open a native folder picker
      sendResponse(message.id, 'folder_selected', { path: MACROS_DIR });
      break;

    case 'execute':
      // Handle execute command (for running individual iMacros commands)
      log('Execute command:', message.payload);
      sendResponse(message.id, 'result', {
        success: true,
        output: 'Command executed'
      });
      break;

    case 'dialog_event':
      log('Dialog event:', message.payload);
      break;

    default:
      log('Unknown message type:', message.type);
      sendResponse(message.id, 'error', { error: `Unknown message type: ${message.type}` });
  }
}

// Set up stdin handling
stdin.on('data', (chunk) => {
  log('Received chunk, length:', chunk.length);
  messageBuffer = Buffer.concat([messageBuffer, chunk]);

  let message;
  while ((message = readMessage()) !== null) {
    handleMessage(message);
  }
});

stdin.on('end', () => {
  log('stdin ended');
  process.exit(0);
});

stdin.on('error', (err) => {
  log('stdin error:', err);
  process.exit(1);
});

// Send ready message
sendMessage({
  type: 'ready',
  version: '1.0.0',
  platform: process.platform,
  macrosFolder: MACROS_DIR
});

log('Ready message sent, waiting for input...');
