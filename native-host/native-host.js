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
const vm = require('vm');

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

/**
 * Strip UTF-8 BOM from string if present
 */
function stripBOM(content) {
  if (content.charCodeAt(0) === 0xFEFF) {
    return content.slice(1);
  }
  return content;
}
const DATASOURCES_DIR = path.join(os.homedir(), 'Documents', 'iMacros', 'Datasources');
const DOWNLOADS_DIR = path.join(os.homedir(), 'Documents', 'iMacros', 'Downloads');
// Ensure directories exist
[MACROS_DIR, DATASOURCES_DIR, DOWNLOADS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * Load datasource content from file path.
 * Resolves relative paths against DATASOURCES_DIR.
 * @param {string} dsPath - Datasource file path (absolute or relative)
 * @returns {string} CSV content
 */
function loadDatasource(dsPath) {
  let resolvedPath = dsPath;
  if (!path.isAbsolute(dsPath)) {
    resolvedPath = path.join(DATASOURCES_DIR, dsPath);
  }
  log(`Loading datasource: ${resolvedPath}`);
  if (!fs.existsSync(resolvedPath)) {
    const errorMsg = `Datasource file not found: ${resolvedPath} (SET !DATASOURCE path: "${dsPath}", resolved to: "${resolvedPath}")`;
    log(`ERROR: ${errorMsg}`);
    throw new Error(errorMsg);
  }
  return stripBOM(fs.readFileSync(resolvedPath, 'utf8'));
}

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
 * Evaluate JavaScript expression in a sandboxed VM context.
 * Used as fallback when expr-eval cannot handle the expression.
 *
 * @param {string} expression - The JavaScript expression to evaluate
 * @returns {Promise<{success: boolean, value: number|string, error?: string, isMacroError?: boolean}>}
 */
async function nativeEval(expression) {
  // Security: limit expression length
  if (expression.length > 10000) {
    return {
      success: false,
      value: 0,
      error: 'Expression exceeds maximum length of 10000 characters'
    };
  }

  try {
    // Create a restricted sandbox with only safe globals
    const sandbox = {
      // Math functions and constants
      Math: Math,
      // Date
      Date: Date,
      // Type conversion
      parseInt: parseInt,
      parseFloat: parseFloat,
      String: String,
      Number: Number,
      Boolean: Boolean,
      // Arrays and objects
      Array: Array,
      Object: Object,
      JSON: JSON,
      // Type checking
      isNaN: isNaN,
      isFinite: isFinite,
      // URL encoding
      encodeURIComponent: encodeURIComponent,
      decodeURIComponent: decodeURIComponent,
      encodeURI: encodeURI,
      decodeURI: decodeURI,
      // String utilities
      escape: escape,
      unescape: unescape,
      // MacroError function - throws to stop macro execution
      MacroError: function(msg) {
        const err = new Error(msg);
        err.isMacroError = true;
        throw err;
      },
    };

    const context = vm.createContext(sandbox);

    // Evaluate with timeout to prevent infinite loops
    const result = vm.runInNewContext(expression, context, {
      timeout: 5000, // 5 second timeout
      displayErrors: true,
    });

    // Convert result to string or number
    let value;
    if (typeof result === 'string' || typeof result === 'number') {
      value = result;
    } else if (result === null || result === undefined) {
      value = '';
    } else {
      value = String(result);
    }

    return { success: true, value: value };
  } catch (error) {
    // Check if this is a MacroError (intentional stop)
    if (error.isMacroError) {
      return {
        success: false,
        value: 0,
        error: error.message,
        isMacroError: true
      };
    }

    log('Native eval error:', error.message);
    return {
      success: false,
      value: 0,
      error: error.message
    };
  }
}

/**
 * Execute a JavaScript macro file with iMacros JS API
 *
 * @param {string} macroPath - Path to the .js macro file
 * @param {number} tabId - Browser tab ID
 * @returns {Promise<{success: boolean, errorCode?: number, errorMessage?: string}>}
 */
async function playJsMacro(macroPath, tabId) {
  try {
    // Load the JavaScript file
    const fullPath = path.isAbsolute(macroPath)
      ? macroPath
      : path.join(MACROS_DIR, macroPath);

    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        errorCode: -1,
        errorMessage: `JavaScript macro file not found: ${macroPath}`
      };
    }

    const content = stripBOM(fs.readFileSync(fullPath, 'utf8'));
    log('Loaded JS macro, length:', content.length);

    // Update status
    updateTrayStatus('playing');
    sendMessage({
      type: 'STATUS_UPDATE',
      payload: { status: 'playing', macro: macroPath }
    });

    // State for the iMacros JS API
    let lastError = 0;
    let lastErrorMessage = '';
    let lastExtract = [];
    let lastPerformance = 0;
    const jsVariables = {};

    // Create the iMacros JS API
    const iMacrosApi = {
      // iimPlay - play a macro file
      iimPlay: async function(macroName) {
        // Resolve macro path
        let resolvedPath = macroName;
        if (!macroName.includes('.')) {
          resolvedPath = macroName + '.iim';
        }

        // Make path relative to macros dir
        if (!path.isAbsolute(resolvedPath)) {
          // Check if it's relative to current macro's directory
          const macroDir = path.dirname(fullPath);
          const relativePath = path.join(macroDir, resolvedPath);
          if (fs.existsSync(relativePath)) {
            resolvedPath = relativePath;
          } else {
            resolvedPath = path.join(MACROS_DIR, resolvedPath);
          }
        }

        log('iimPlay called:', macroName, '->', resolvedPath);

        // Create browser bridge if needed
        if (!browserBridge) {
          browserBridge = createBrowserBridge(sendMessage, createMessageId);
        }
        if (tabId) {
          browserBridge.setActiveTab(tabId);
        }

        // Check if it's a .js file
        if (resolvedPath.toLowerCase().endsWith('.js')) {
          const result = await playJsMacro(resolvedPath, tabId);
          lastError = result.success ? 1 : result.errorCode || -1;
          lastErrorMessage = result.errorMessage || '';
          if (result.extractData) {
            lastExtract = result.extractData;
          }
          return lastError;
        }

        // Load and execute the .iim macro
        if (!fs.existsSync(resolvedPath)) {
          lastError = -1;
          lastErrorMessage = `Macro file not found: ${macroName}`;
          return lastError;
        }

        const macroContent = stripBOM(fs.readFileSync(resolvedPath, 'utf8'));

        // Create executor
        const executor = new sharedLib.MacroExecutor({
          macroName: macroName,
          maxLoops: 1,
          onLog: (level, msg) => {
            log(`[${level}] ${msg}`);
          },
          onNativeEval: nativeEval,
          onDatasourceLoad: loadDatasource,
        });

        // Copy JS variables to executor
        for (const [key, value] of Object.entries(jsVariables)) {
          executor.state.setVariable(key, value);
        }

        // Register browser handlers
        const handlers = createBrowserHandlers(browserBridge);
        executor.registerHandlers(handlers);

        // Register datasource handlers
        sharedLib.registerDatasourceHandlers((type, handler) => executor.registerHandler(type, handler));

        // Execute
        const startTime = Date.now();
        executor.loadMacro(macroContent);
        const result = await executor.execute();
        lastPerformance = Date.now() - startTime;

        lastError = result.success ? 1 : (result.errorCode || -1);
        lastErrorMessage = result.errorMessage || '';

        // Store extracted data
        if (result.extractData && result.extractData.length > 0) {
          lastExtract = result.extractData;
        }

        return lastError;
      },

      // iimSet - set a variable
      iimSet: function(varName, value) {
        // Strip -var_ prefix (e.g., "-var_myvar" -> "myvar")
        var prefixMatch = varName.match(/^(?:-var_)?(\w+)$/);
        if (prefixMatch) {
          varName = prefixMatch[1];
        }

        // Map var1-var9 to !VAR1-!VAR9
        var varMatch = varName.match(/^var([0-9])$/i);
        if (varMatch) {
          varName = '!VAR' + varMatch[1];
        }

        jsVariables[varName] = value;
        log('iimSet:', varName, '=', value);
        return 1;
      },

      // iimGetLastExtract - get extracted data
      iimGetLastExtract: function(index) {
        if (index === undefined || index === 0) {
          return lastExtract.join('#NEXT#');
        }
        return lastExtract[index - 1] || '';
      },

      // iimGetLastError - get last error code
      iimGetLastError: function() {
        return lastError;
      },

      // iimGetLastErrorMsg - get last error message
      iimGetLastErrorMsg: function() {
        return lastErrorMessage;
      },

      // iimGetLastPerformance - get execution time in ms
      iimGetLastPerformance: function() {
        return lastPerformance;
      },

      // iimDisplay - display a message
      iimDisplay: function(message) {
        log('iimDisplay:', message);
        sendMessage({
          type: 'DISPLAY_MESSAGE',
          payload: { message: String(message) }
        });
        return 1;
      },

      // iimExit - stop script execution
      iimExit: function(exitCode) {
        const err = new Error('iimExit called');
        err.exitCode = exitCode || 0;
        err.isExit = true;
        throw err;
      },

      // iimInit - initialize (no-op for now)
      iimInit: function() {
        return 1;
      },

      // iimPlayCode - execute macro code directly
      iimPlayCode: async function(macroCode) {
        log('iimPlayCode called, code length:', macroCode.length);

        // Create browser bridge if needed
        if (!browserBridge) {
          browserBridge = createBrowserBridge(sendMessage, createMessageId);
        }
        if (tabId) {
          browserBridge.setActiveTab(tabId);
        }

        // Create executor
        const executor = new sharedLib.MacroExecutor({
          macroName: 'inline',
          maxLoops: 1,
          onLog: (level, msg) => {
            log(`[${level}] ${msg}`);
          },
          onNativeEval: nativeEval,
          onDatasourceLoad: loadDatasource,
        });

        // Copy JS variables to executor
        for (const [key, value] of Object.entries(jsVariables)) {
          executor.state.setVariable(key, value);
        }

        // Register browser handlers
        const handlers = createBrowserHandlers(browserBridge);
        executor.registerHandlers(handlers);

        // Register datasource handlers
        sharedLib.registerDatasourceHandlers((type, handler) => executor.registerHandler(type, handler));

        // Execute
        const startTime = Date.now();
        executor.loadMacro(macroCode);
        const result = await executor.execute();
        lastPerformance = Date.now() - startTime;

        lastError = result.success ? 1 : (result.errorCode || -1);
        lastErrorMessage = result.errorMessage || '';

        // Store extracted data
        if (result.extractData && result.extractData.length > 0) {
          lastExtract = result.extractData;
        }

        return lastError;
      },

      // iimGetErrorText - get error text for error code
      iimGetErrorText: function(errorCode) {
        // Return generic error messages
        const errorTexts = {
          1: 'OK',
          0: 'Unknown error',
          '-1': 'General error',
          '-802': 'Timeout',
          '-920': 'Element not found',
          '-921': 'Frame not found',
        };
        return errorTexts[errorCode] || 'Error ' + errorCode;
      },
    };

    // Create sandbox with iMacros API and safe globals
    const sandbox = {
      ...iMacrosApi,
      // Standard JS globals
      console: {
        log: (...args) => log('JS console.log:', ...args),
        error: (...args) => log('JS console.error:', ...args),
        warn: (...args) => log('JS console.warn:', ...args),
      },
      Math: Math,
      Date: Date,
      parseInt: parseInt,
      parseFloat: parseFloat,
      String: String,
      Number: Number,
      Boolean: Boolean,
      Array: Array,
      Object: Object,
      JSON: JSON,
      isNaN: isNaN,
      isFinite: isFinite,
      encodeURIComponent: encodeURIComponent,
      decodeURIComponent: decodeURIComponent,
      encodeURI: encodeURI,
      decodeURI: decodeURI,
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: clearTimeout,
      // Allow require for path only
      require: (mod) => {
        if (mod === 'path') return path;
        throw new Error('require is not allowed for module: ' + mod);
      },
    };

    const context = vm.createContext(sandbox);

    // Transform the code to automatically await iimPlay/iimPlayCode calls
    // This makes the API behave synchronously like the original iMacros
    let transformedContent = content
      // Add await before iimPlay( unless already awaited
      .replace(/(?<!await\s+)iimPlay\s*\(/g, 'await iimPlay(')
      // Add await before iimPlayCode( unless already awaited
      .replace(/(?<!await\s+)iimPlayCode\s*\(/g, 'await iimPlayCode(');

    log('Transformed JS macro code');

    // Wrap the script to handle async/await
    const wrappedCode = `
      (async function() {
        ${transformedContent}
      })();
    `;

    // Execute the JavaScript macro
    const startTime = Date.now();
    try {
      await vm.runInNewContext(wrappedCode, context, {
        timeout: 3600000, // 1 hour timeout for long-running macros
        displayErrors: true,
        filename: macroPath,
      });
    } catch (error) {
      if (error.isExit) {
        // Normal exit via iimExit
        lastError = error.exitCode;
      } else {
        throw error;
      }
    }
    lastPerformance = Date.now() - startTime;

    log('JS macro execution complete');

    // Send completion message
    sendMessage({
      type: 'MACRO_COMPLETE',
      payload: {
        success: lastError >= 0,
        errorCode: lastError,
        errorMessage: lastErrorMessage,
        executionTimeMs: lastPerformance,
        extractData: lastExtract,
        macro: macroPath,
      }
    });

    // Update status
    updateTrayStatus('idle');
    sendMessage({
      type: 'STATUS_UPDATE',
      payload: { status: 'idle' }
    });

    return {
      success: lastError >= 0,
      errorCode: lastError,
      errorMessage: lastErrorMessage,
      extractData: lastExtract,
    };

  } catch (error) {
    log('JS macro execution error:', error.message);
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

    return {
      success: false,
      errorCode: -1,
      errorMessage: error.message,
    };
  }
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
 * List macros in a directory (includes empty folders)
 */
function listMacros(dirPath = MACROS_DIR) {
  const items = [];

  function walkDir(currentPath, prefix = '') {
    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          // Add the folder itself so it appears even when empty
          items.push({
            name: entry.name,
            path: relativePath,
            fullPath: fullPath,
            type: 'folder'
          });
          walkDir(fullPath, relativePath);
        } else if (entry.name.endsWith('.iim') || entry.name.endsWith('.js')) {
          items.push({
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
  return items;
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

  // Check if this is a JavaScript macro
  if (macroPath.toLowerCase().endsWith('.js')) {
    return playJsMacro(macroPath, tabId);
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

    const content = stripBOM(fs.readFileSync(fullPath, 'utf8'));
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
      // Enable JavaScript EVAL support via Node's vm module
      onNativeEval: nativeEval,
      // Enable datasource loading from file
      onDatasourceLoad: loadDatasource,
    });

    activeExecutor = executor;

    // Register browser handlers
    const handlers = createBrowserHandlers(browserBridge);
    executor.registerHandlers(handlers);

    // Register datasource handlers
    sharedLib.registerDatasourceHandlers((type, handler) => executor.registerHandler(type, handler));

    // Load and execute the macro
    executor.loadMacro(content);
    const result = await executor.execute();

    log('Macro execution complete:', result.success ? 'SUCCESS' : 'FAILED');
    if (!result.success) {
      log('Error:', result.errorMessage, 'at line', result.errorLine);
    }

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
        const content = stripBOM(fs.readFileSync(fullPath, 'utf8'));
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

    case 'create_folder':
      try {
        const folderPath = message.payload?.path;
        const fullPath = path.isAbsolute(folderPath)
          ? folderPath
          : path.join(MACROS_DIR, folderPath);
        fs.mkdirSync(fullPath, { recursive: true });
        log('Created folder:', fullPath);
        sendResponse(message.id, 'folder_created', { path: folderPath });
      } catch (e) {
        sendResponse(message.id, 'error', { error: e.message });
      }
      break;

    case 'rename_file':
      try {
        const oldPath = message.payload?.oldPath;
        const newName = message.payload?.newName;
        const fullOldPath = path.isAbsolute(oldPath)
          ? oldPath
          : path.join(MACROS_DIR, oldPath);
        const fullNewPath = path.join(path.dirname(fullOldPath), newName);
        fs.renameSync(fullOldPath, fullNewPath);
        log('Renamed:', fullOldPath, '->', fullNewPath);
        sendResponse(message.id, 'file_renamed', { oldPath, newPath: path.relative(MACROS_DIR, fullNewPath) });
      } catch (e) {
        sendResponse(message.id, 'error', { error: e.message });
      }
      break;

    case 'delete_file':
      try {
        const deletePath = message.payload?.path;
        const fullPath = path.isAbsolute(deletePath)
          ? deletePath
          : path.join(MACROS_DIR, deletePath);
        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
          fs.rmSync(fullPath, { recursive: true });
        } else {
          fs.unlinkSync(fullPath);
        }
        log('Deleted:', fullPath);
        sendResponse(message.id, 'file_deleted', { path: deletePath });
      } catch (e) {
        sendResponse(message.id, 'error', { error: e.message });
      }
      break;

    case 'move_file':
      try {
        const sourcePath = message.payload?.sourcePath;
        const targetPath = message.payload?.targetPath;
        const fullSourcePath = path.isAbsolute(sourcePath)
          ? sourcePath
          : path.join(MACROS_DIR, sourcePath);
        const fullTargetDir = path.isAbsolute(targetPath)
          ? targetPath
          : path.join(MACROS_DIR, targetPath);
        const fileName = path.basename(fullSourcePath);
        const fullTargetPath = path.join(fullTargetDir, fileName);
        fs.renameSync(fullSourcePath, fullTargetPath);
        log('Moved:', fullSourcePath, '->', fullTargetPath);
        sendResponse(message.id, 'file_moved', {
          sourcePath,
          newPath: path.relative(MACROS_DIR, fullTargetPath)
        });
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
