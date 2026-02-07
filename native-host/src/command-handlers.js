/**
 * Command Handlers for Native Host
 *
 * Creates command handlers that use the BrowserBridge to execute
 * commands in the browser. These handlers are registered with the
 * MacroExecutor.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Error codes matching iMacros standard
const ERROR_CODES = {
  OK: 0,
  ELEMENT_NOT_FOUND: -920,
  ELEMENT_NOT_VISIBLE: -921,
  ELEMENT_NOT_ENABLED: -922,
  TIMEOUT: -930,
  PAGE_TIMEOUT: -931,
  FRAME_NOT_FOUND: -941,
  SCRIPT_ERROR: -970,
  MISSING_PARAMETER: -913,
  INVALID_PARAMETER: -912,
};

/**
 * Create command handlers that use the browser bridge
 * @param {object} bridge - The browser bridge instance
 * @returns {object} - Map of command type to handler function
 */
function createBrowserHandlers(bridge) {
  return {
    // ===== Navigation Commands =====

    /**
     * URL command handler
     * URL GOTO=<url> - Navigate to URL
     * URL CURRENT - Get current URL and store in !URLCURRENT
     */
    URL: async (ctx) => {
      const gotoParam = ctx.getParam('GOTO');
      const currentParam = ctx.command.parameters.some(
        p => p.key.toUpperCase() === 'CURRENT'
      );

      if (currentParam) {
        // URL CURRENT - get current URL
        ctx.log('debug', 'Getting current URL');
        try {
          const url = await bridge.getCurrentUrl();
          ctx.state.setVariable('!URLCURRENT', url);
          ctx.log('info', `Current URL: ${url}`);
          return { success: true, errorCode: ERROR_CODES.OK, output: url };
        } catch (error) {
          return {
            success: false,
            errorCode: ERROR_CODES.SCRIPT_ERROR,
            errorMessage: error.message || 'Failed to get current URL',
          };
        }
      }

      if (gotoParam) {
        // URL GOTO=<url> - navigate
        const url = ctx.expand(gotoParam);
        ctx.log('info', `Navigating to: ${url}`);
        try {
          await bridge.navigate(url);
          ctx.state.setVariable('!URLCURRENT', url);
          return { success: true, errorCode: ERROR_CODES.OK };
        } catch (error) {
          return {
            success: false,
            errorCode: ERROR_CODES.PAGE_TIMEOUT,
            errorMessage: error.message || `Failed to navigate to ${url}`,
          };
        }
      }

      return {
        success: false,
        errorCode: ERROR_CODES.MISSING_PARAMETER,
        errorMessage: 'URL command requires GOTO or CURRENT parameter',
      };
    },

    /**
     * BACK command handler
     */
    BACK: async (ctx) => {
      ctx.log('info', 'Navigating back');
      try {
        await bridge.goBack();
        return { success: true, errorCode: ERROR_CODES.OK };
      } catch (error) {
        return {
          success: false,
          errorCode: ERROR_CODES.SCRIPT_ERROR,
          errorMessage: error.message || 'Failed to navigate back',
        };
      }
    },

    /**
     * REFRESH command handler
     */
    REFRESH: async (ctx) => {
      ctx.log('info', 'Refreshing page');
      try {
        await bridge.refresh();
        return { success: true, errorCode: ERROR_CODES.OK };
      } catch (error) {
        return {
          success: false,
          errorCode: ERROR_CODES.SCRIPT_ERROR,
          errorMessage: error.message || 'Failed to refresh page',
        };
      }
    },

    // ===== Tab Commands =====

    /**
     * TAB command handler
     * TAB T=<n> - Switch to tab n (1-based)
     * TAB OPEN [URL=<url>] - Open new tab
     * TAB CLOSE - Close current tab
     * TAB CLOSEALLOTHERS - Close all other tabs
     */
    TAB: async (ctx) => {
      const tParam = ctx.getParam('T');
      const openParam = ctx.command.parameters.some(p => p.key.toUpperCase() === 'OPEN');
      const closeParam = ctx.command.parameters.some(p => p.key.toUpperCase() === 'CLOSE');
      const closeAllOthersParam = ctx.command.parameters.some(
        p => p.key.toUpperCase() === 'CLOSEALLOTHERS'
      );

      try {
        if (closeAllOthersParam) {
          ctx.log('info', 'Closing all other tabs');
          await bridge.closeOtherTabs();
          return { success: true, errorCode: ERROR_CODES.OK };
        }

        if (closeParam) {
          ctx.log('info', 'Closing current tab');
          await bridge.closeTab();
          return { success: true, errorCode: ERROR_CODES.OK };
        }

        if (openParam) {
          const urlParam = ctx.getParam('URL');
          const url = urlParam ? ctx.expand(urlParam) : undefined;
          ctx.log('info', url ? `Opening new tab: ${url}` : 'Opening new tab');
          await bridge.openTab(url);
          return { success: true, errorCode: ERROR_CODES.OK };
        }

        if (tParam) {
          const tabIndex = parseInt(ctx.expand(tParam), 10);
          if (isNaN(tabIndex) || tabIndex < 1) {
            return {
              success: false,
              errorCode: ERROR_CODES.INVALID_PARAMETER,
              errorMessage: `Invalid tab index: ${tParam}`,
            };
          }
          ctx.log('info', `Switching to tab ${tabIndex}`);
          await bridge.switchTab(tabIndex);
          return { success: true, errorCode: ERROR_CODES.OK };
        }

        return {
          success: false,
          errorCode: ERROR_CODES.MISSING_PARAMETER,
          errorMessage: 'TAB command requires T, OPEN, CLOSE, or CLOSEALLOTHERS parameter',
        };
      } catch (error) {
        return {
          success: false,
          errorCode: ERROR_CODES.SCRIPT_ERROR,
          errorMessage: error.message || 'TAB command failed',
        };
      }
    },

    // ===== Frame Commands =====

    /**
     * FRAME command handler
     * FRAME F=<n> - Select frame by index (0 = main document)
     * FRAME NAME=<name> - Select frame by name
     */
    FRAME: async (ctx) => {
      const fParam = ctx.getParam('F');
      const nameParam = ctx.getParam('NAME');

      try {
        if (fParam !== undefined) {
          const frameIndex = parseInt(ctx.expand(fParam), 10);
          if (isNaN(frameIndex) || frameIndex < 0) {
            return {
              success: false,
              errorCode: ERROR_CODES.INVALID_PARAMETER,
              errorMessage: `Invalid frame index: ${fParam}`,
            };
          }
          ctx.log('info', frameIndex === 0 ? 'Selecting main document' : `Selecting frame ${frameIndex}`);
          await bridge.selectFrame(frameIndex);
          return { success: true, errorCode: ERROR_CODES.OK };
        }

        if (nameParam) {
          const frameName = ctx.expand(nameParam);
          ctx.log('info', `Selecting frame by name: ${frameName}`);
          await bridge.selectFrameByName(frameName);
          return { success: true, errorCode: ERROR_CODES.OK };
        }

        return {
          success: false,
          errorCode: ERROR_CODES.MISSING_PARAMETER,
          errorMessage: 'FRAME command requires F or NAME parameter',
        };
      } catch (error) {
        return {
          success: false,
          errorCode: ERROR_CODES.FRAME_NOT_FOUND,
          errorMessage: error.message || 'Frame not found',
        };
      }
    },

    // ===== Interaction Commands =====

    /**
     * TAG command handler
     * TAG POS=1 TYPE=INPUT ATTR=NAME:username CONTENT=john
     * TAG XPATH=//input[@id='search'] CONTENT=query
     * TAG CSS=.submit-btn EXTRACT=TXT
     */
    TAG: async (ctx) => {
      // Get timeout from state variables
      const timeoutStep = ctx.state.getVariable('!TIMEOUT_STEP');
      const timeout = typeof timeoutStep === 'number' ? timeoutStep * 1000 : 30000;

      // Parse position (may be relative)
      const posResult = parsePos(ctx.getParam('POS'));

      // Build selector params
      const params = {
        pos: posResult.pos,
        relative: posResult.relative,
        type: ctx.getParam('TYPE'),
        attr: expandWithTokens(ctx, 'ATTR'),
        xpath: expandIfPresent(ctx, 'XPATH'),
        css: expandIfPresent(ctx, 'CSS'),
        content: expandIfPresent(ctx, 'CONTENT'),
        extract: ctx.getParam('EXTRACT'),
        form: ctx.getParam('FORM'),
        timeout,
        waitVisible: true,
      };

      // Process special CONTENT values
      if (params.content) {
        // Check for <ENTER> before processContent (it's a key action, not text)
        const hasEnter = /<ENTER>/i.test(params.content);
        // Strip <ENTER> tokens, then process remaining text
        const stripped = params.content.replace(/<ENTER>/gi, '');
        params.content = stripped ? processContent(stripped) : undefined;

        // Handle form actions
        if (params.content === '<SUBMIT>') {
          params.form = 'SUBMIT';
          params.content = undefined;
        } else if (params.content === '<RESET>') {
          params.form = 'RESET';
          params.content = undefined;
        }

        // <ENTER> triggers an Enter keypress after setting content
        if (hasEnter) {
          params.pressEnter = true;
        }
      }

      ctx.log('debug', `TAG: ${JSON.stringify(params)}`);

      try {
        const result = await bridge.executeTag(params);

        if (!result.success) {
          return {
            success: false,
            errorCode: ERROR_CODES.ELEMENT_NOT_FOUND,
            errorMessage: result.error || 'Element not found',
          };
        }

        // Handle extraction
        if (params.extract && result.extractedData !== undefined) {
          ctx.state.addExtract(result.extractedData);
          ctx.log('info', `Extracted: ${result.extractedData}`);
        }

        return {
          success: true,
          errorCode: ERROR_CODES.OK,
          output: result.extractedData,
        };
      } catch (error) {
        return {
          success: false,
          errorCode: ERROR_CODES.SCRIPT_ERROR,
          errorMessage: error.message || 'TAG command failed',
        };
      }
    },

    /**
     * CLICK command handler
     * CLICK X=100 Y=200
     * CLICK X=50 Y=50 CONTENT=right
     */
    CLICK: async (ctx) => {
      const xStr = ctx.getParam('X');
      const yStr = ctx.getParam('Y');

      if (!xStr || !yStr) {
        return {
          success: false,
          errorCode: ERROR_CODES.MISSING_PARAMETER,
          errorMessage: 'CLICK command requires X and Y parameters',
        };
      }

      const x = parseInt(ctx.expand(xStr), 10);
      const y = parseInt(ctx.expand(yStr), 10);

      if (isNaN(x) || isNaN(y)) {
        return {
          success: false,
          errorCode: ERROR_CODES.INVALID_PARAMETER,
          errorMessage: `Invalid coordinates: X=${xStr}, Y=${yStr}`,
        };
      }

      const contentParam = ctx.getParam('CONTENT');
      let button = 'left';
      if (contentParam) {
        const contentLower = ctx.expand(contentParam).toLowerCase();
        if (contentLower === 'middle' || contentLower === 'center') {
          button = 'middle';
        } else if (contentLower === 'right') {
          button = 'right';
        }
      }

      ctx.log('debug', `CLICK: X=${x}, Y=${y}, button=${button}`);

      try {
        const result = await bridge.executeClick({ x, y, button });

        if (!result.success) {
          return {
            success: false,
            errorCode: ERROR_CODES.SCRIPT_ERROR,
            errorMessage: result.error || 'Click failed',
          };
        }

        return { success: true, errorCode: ERROR_CODES.OK };
      } catch (error) {
        return {
          success: false,
          errorCode: ERROR_CODES.SCRIPT_ERROR,
          errorMessage: error.message || 'CLICK command failed',
        };
      }
    },

    /**
     * EVENT command handler
     * EVENT TYPE=CLICK SELECTOR=CSS:.my-button
     * EVENT TYPE=KEYDOWN KEY=Enter
     */
    EVENT: async (ctx) => {
      const eventType = ctx.getParam('TYPE');
      if (!eventType) {
        return {
          success: false,
          errorCode: ERROR_CODES.MISSING_PARAMETER,
          errorMessage: 'EVENT command requires TYPE parameter',
        };
      }

      // Build selector if provided
      let selector;
      const selectorStr = ctx.getParam('SELECTOR');
      const xpathStr = ctx.getParam('XPATH');
      const cssStr = ctx.getParam('CSS');

      if (selectorStr || xpathStr || cssStr) {
        selector = {};
        if (xpathStr) {
          selector.xpath = ctx.expand(xpathStr);
        } else if (cssStr) {
          selector.css = ctx.expand(cssStr);
        } else if (selectorStr) {
          const expanded = ctx.expand(selectorStr);
          if (expanded.startsWith('CSS:')) {
            selector.css = expanded.substring(4);
          } else if (expanded.startsWith('XPATH:')) {
            selector.xpath = expanded.substring(6);
          } else {
            selector.css = expanded;
          }
        }
      }

      // Parse additional parameters
      const params = {
        eventType: ctx.expand(eventType).toLowerCase(),
        selector,
        button: parseIntOrUndefined(ctx.getParam('BUTTON')),
        key: expandIfPresent(ctx, 'KEY'),
        char: expandIfPresent(ctx, 'CHAR'),
        point: parsePoint(expandIfPresent(ctx, 'POINT')),
        modifiers: parseModifiers(expandIfPresent(ctx, 'MODIFIERS')),
      };

      ctx.log('debug', `EVENT: ${JSON.stringify(params)}`);

      try {
        const result = await bridge.executeEvent(params);

        if (!result.success) {
          return {
            success: false,
            errorCode: ERROR_CODES.SCRIPT_ERROR,
            errorMessage: result.error || 'Event dispatch failed',
          };
        }

        return { success: true, errorCode: ERROR_CODES.OK };
      } catch (error) {
        return {
          success: false,
          errorCode: ERROR_CODES.SCRIPT_ERROR,
          errorMessage: error.message || 'EVENT command failed',
        };
      }
    },

    // EVENTS is an alias for EVENT
    EVENTS: async (ctx) => {
      // Reuse EVENT handler
      return createBrowserHandlers(bridge).EVENT(ctx);
    },

    // ===== Dialog Commands =====

    /**
     * ONDIALOG command handler
     * ONDIALOG POS=1 BUTTON=OK
     * ONDIALOG POS=1 BUTTON=CANCEL
     * ONDIALOG POS=1 BUTTON=YES CONTENT=response
     */
    ONDIALOG: async (ctx) => {
      const posStr = ctx.getParam('POS');
      const buttonStr = ctx.getParam('BUTTON');

      if (!posStr || !buttonStr) {
        return {
          success: false,
          errorCode: ERROR_CODES.MISSING_PARAMETER,
          errorMessage: 'ONDIALOG command requires POS and BUTTON parameters',
        };
      }

      const pos = parseInt(ctx.expand(posStr), 10);
      if (isNaN(pos) || pos < 1) {
        return {
          success: false,
          errorCode: ERROR_CODES.INVALID_PARAMETER,
          errorMessage: `Invalid POS value: ${posStr}`,
        };
      }

      // Parse button - normalize to uppercase
      const buttonUpper = ctx.expand(buttonStr).toUpperCase().trim();
      let button;
      switch (buttonUpper) {
        case 'OK':
        case 'YES':
        case 'NO':
        case 'CANCEL':
          button = buttonUpper;
          break;
        default:
          button = 'OK';
      }

      const contentParam = ctx.getParam('CONTENT');
      const content = contentParam ? ctx.expand(contentParam) : undefined;

      ctx.log('info', `Configuring dialog handler: POS=${pos}, BUTTON=${button}${content ? `, CONTENT=${content}` : ''}`);

      try {
        const result = await bridge.configureDialog({ pos, button, content });

        if (!result.success) {
          return {
            success: false,
            errorCode: ERROR_CODES.SCRIPT_ERROR,
            errorMessage: result.error || 'Failed to configure dialog handler',
          };
        }

        return { success: true, errorCode: ERROR_CODES.OK };
      } catch (error) {
        return {
          success: false,
          errorCode: ERROR_CODES.SCRIPT_ERROR,
          errorMessage: error.message || 'ONDIALOG command failed',
        };
      }
    },

    // ===== File Commands =====

    /**
     * SAVEAS command handler
     * SAVEAS TYPE=EXTRACT FOLDER=/path FILE=filename.csv
     * SAVEAS TYPE=TXT FOLDER=/path FILE=filename.txt
     */
    SAVEAS: async (ctx) => {
      const typeParam = ctx.getParam('TYPE');
      const folderParam = ctx.getParam('FOLDER');
      const fileParam = ctx.getParam('FILE');

      if (!typeParam) {
        return {
          success: false,
          errorCode: ERROR_CODES.MISSING_PARAMETER,
          errorMessage: 'SAVEAS requires TYPE parameter',
        };
      }

      if (!fileParam) {
        return {
          success: false,
          errorCode: ERROR_CODES.MISSING_PARAMETER,
          errorMessage: 'SAVEAS requires FILE parameter',
        };
      }

      const saveType = typeParam.toUpperCase();
      const folder = folderParam ? ctx.expand(folderParam) : os.homedir();
      const file = ctx.expand(fileParam);
      const fullPath = path.isAbsolute(file) ? file : path.join(folder, file);

      ctx.log('info', `SAVEAS TYPE=${saveType} to ${fullPath}`);

      try {
        let content = '';

        if (saveType === 'EXTRACT') {
          // Get content from !EXTRACT variable
          content = String(ctx.state.getVariable('!EXTRACT') || '');
        } else if (saveType === 'TXT') {
          // For TXT, also use !EXTRACT by default
          content = String(ctx.state.getVariable('!EXTRACT') || '');
        } else {
          // Other types (HTM, PNG, PDF) need browser bridge support
          ctx.log('warn', `SAVEAS TYPE=${saveType} not yet implemented for native host`);
          return {
            success: false,
            errorCode: ERROR_CODES.INVALID_PARAMETER,
            errorMessage: `SAVEAS TYPE=${saveType} not yet implemented`,
          };
        }

        // Ensure directory exists
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Write file (append if file exists for EXTRACT type)
        if (saveType === 'EXTRACT' && fs.existsSync(fullPath)) {
          fs.appendFileSync(fullPath, content + '\n', 'utf8');
          ctx.log('info', `Appended to ${fullPath}`);
        } else {
          fs.writeFileSync(fullPath, content, 'utf8');
          ctx.log('info', `Saved to ${fullPath}`);
        }

        return { success: true, errorCode: ERROR_CODES.OK };
      } catch (error) {
        return {
          success: false,
          errorCode: ERROR_CODES.SCRIPT_ERROR,
          errorMessage: error.message || `Failed to save file: ${fullPath}`,
        };
      }
    },
  };
}

// ===== Helper Functions =====

/**
 * Replace iMacros special tokens like <SP>, <BR>, <TAB>
 * @param {string} str - The string to process
 * @returns {string} - The processed string
 */
function expandSpecialTokens(str) {
  if (!str) return str;
  return str
    .replace(/<SP>/gi, ' ')
    .replace(/<BR>/gi, '\n')
    .replace(/<TAB>/gi, '\t')
    .replace(/<ENTER>/gi, '\n');
}

/**
 * Expand a parameter value if present
 */
function expandIfPresent(ctx, key) {
  const value = ctx.getParam(key);
  return value ? ctx.expand(value) : undefined;
}

/**
 * Expand a parameter value and replace special tokens
 */
function expandWithTokens(ctx, key) {
  const value = ctx.getParam(key);
  if (!value) return undefined;
  const expanded = ctx.expand(value);
  return expandSpecialTokens(expanded);
}

/**
 * Parse POS parameter - supports absolute (1, 2, -1) and relative (R1, R3, R-2)
 * @param {string} posStr - The POS parameter value
 * @returns {{ pos: number, relative: boolean }} - Position and relative flag
 */
function parsePos(posStr) {
  if (!posStr) return { pos: 1, relative: false };

  const trimmed = posStr.trim().toUpperCase();

  // Check for relative prefix (R followed by number)
  if (trimmed.startsWith('R')) {
    const numPart = trimmed.substring(1);
    const num = parseInt(numPart, 10);
    if (!isNaN(num) && num !== 0) {
      return { pos: num, relative: true };
    }
    // Invalid relative position (R0 or non-numeric), treat as absolute position 1
    return { pos: 1, relative: false };
  }

  // Absolute position
  const num = parseInt(trimmed, 10);
  return { pos: isNaN(num) ? 1 : num, relative: false };
}

/**
 * Parse an integer or return undefined
 */
function parseIntOrUndefined(str) {
  if (!str) return undefined;
  const num = parseInt(str, 10);
  return isNaN(num) ? undefined : num;
}

/**
 * Parse point string (format: x,y)
 */
function parsePoint(str) {
  if (!str) return undefined;
  const parts = str.split(',').map(s => parseInt(s.trim(), 10));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { x: parts[0], y: parts[1] };
  }
  return undefined;
}

/**
 * Parse modifiers string (format: ctrl+shift or ctrl,shift)
 */
function parseModifiers(str) {
  if (!str) return undefined;
  const modifiers = {};
  const parts = str.toLowerCase().split(/[+,]/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed === 'ctrl' || trimmed === 'control') modifiers.ctrl = true;
    if (trimmed === 'shift') modifiers.shift = true;
    if (trimmed === 'alt') modifiers.alt = true;
    if (trimmed === 'meta' || trimmed === 'cmd' || trimmed === 'command') modifiers.meta = true;
  }
  return Object.keys(modifiers).length > 0 ? modifiers : undefined;
}

/**
 * Process CONTENT parameter value (handle special characters)
 */
function processContent(content) {
  return content
    .replace(/<SP>/gi, ' ')
    .replace(/<BR>/gi, '\n')
    .replace(/<TAB>/gi, '\t');
}

module.exports = { createBrowserHandlers, ERROR_CODES };
