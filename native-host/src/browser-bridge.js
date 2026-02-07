/**
 * Browser Bridge for Native Host
 *
 * Sends commands to the browser extension and waits for responses.
 * This bridges the gap between the MacroExecutor (running in native host)
 * and the browser extension (which can manipulate the DOM).
 */

const REQUEST_TIMEOUT_MS = 30000;

/**
 * Creates a browser bridge that communicates with the extension
 *
 * @param {function} sendMessage - Function to send messages to the extension
 * @param {function} createMessageId - Function to create unique message IDs
 * @returns {BrowserBridge}
 */
function createBrowserBridge(sendMessage, createMessageId) {
  // Map of pending requests: id -> { resolve, reject, timeout }
  const pendingRequests = new Map();

  // Active tab ID for commands
  let activeTabId = null;

  // Current frame ID (0 = main document)
  let currentFrameId = 0;

  /**
   * Send a command to the browser and wait for response
   * @param {string} commandType - The type of browser command
   * @param {object} payload - Command payload
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {Promise<object>}
   */
  async function sendBrowserCommand(commandType, payload = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const id = createMessageId();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(id);
        reject(new Error(`Browser command timeout: ${commandType}`));
      }, timeoutMs);

      pendingRequests.set(id, { resolve, reject, timeout });

      sendMessage({
        type: 'browser_command',
        id,
        timestamp: Date.now(),
        payload: {
          commandType,
          tabId: activeTabId,
          frameId: currentFrameId,
          ...payload,
        },
      });
    });
  }

  /**
   * Handle a response from the browser
   * @param {object} message - Response message
   * @returns {boolean} - Whether the message was handled
   */
  function handleResponse(message) {
    const pending = pendingRequests.get(message.id);
    if (pending) {
      clearTimeout(pending.timeout);
      pendingRequests.delete(message.id);

      if (message.error) {
        pending.reject(new Error(message.error));
      } else {
        pending.resolve(message.payload || {});
      }
      return true;
    }
    return false;
  }

  /**
   * Set the active tab for subsequent commands
   * @param {number} tabId
   */
  function setActiveTab(tabId) {
    activeTabId = tabId;
  }

  /**
   * Get the active tab ID
   * @returns {number|null}
   */
  function getActiveTab() {
    return activeTabId;
  }

  /**
   * Set the current frame for subsequent commands
   * @param {number} frameId
   */
  function setCurrentFrame(frameId) {
    currentFrameId = frameId;
  }

  /**
   * Get the current frame ID
   * @returns {number}
   */
  function getCurrentFrame() {
    return currentFrameId;
  }

  // ===== Navigation Commands =====

  /**
   * Navigate to a URL
   * @param {string} url
   * @returns {Promise<object>}
   */
  async function navigate(url) {
    return sendBrowserCommand('navigate', { url });
  }

  /**
   * Get the current URL
   * @returns {Promise<string>}
   */
  async function getCurrentUrl() {
    const response = await sendBrowserCommand('getCurrentUrl');
    return response.url || '';
  }

  /**
   * Go back in browser history
   * @returns {Promise<object>}
   */
  async function goBack() {
    return sendBrowserCommand('goBack');
  }

  /**
   * Go forward in browser history
   * @returns {Promise<object>}
   */
  async function goForward() {
    return sendBrowserCommand('goForward');
  }

  /**
   * Refresh the current page
   * @returns {Promise<object>}
   */
  async function refresh() {
    return sendBrowserCommand('refresh');
  }

  // ===== Tab Commands =====

  /**
   * Open a new tab
   * @param {string} [url] - Optional URL to open
   * @returns {Promise<object>}
   */
  async function openTab(url) {
    const response = await sendBrowserCommand('openTab', { url });
    if (response.tabId) {
      activeTabId = response.tabId;
    }
    return response;
  }

  /**
   * Switch to a tab by index (1-based)
   * @param {number} tabIndex - 1-based tab index
   * @returns {Promise<object>}
   */
  async function switchTab(tabIndex) {
    const response = await sendBrowserCommand('switchTab', { tabIndex: tabIndex - 1 });
    if (response.tabId) {
      activeTabId = response.tabId;
    }
    return response;
  }

  /**
   * Close the current tab
   * @returns {Promise<object>}
   */
  async function closeTab() {
    return sendBrowserCommand('closeTab');
  }

  /**
   * Close all other tabs
   * @returns {Promise<object>}
   */
  async function closeOtherTabs() {
    return sendBrowserCommand('closeOtherTabs');
  }

  // ===== Frame Commands =====

  /**
   * Select a frame by index
   * @param {number} frameIndex - Frame index (0 = main document)
   * @returns {Promise<object>}
   */
  async function selectFrame(frameIndex) {
    const response = await sendBrowserCommand('selectFrame', { frameIndex });
    currentFrameId = frameIndex;
    return response;
  }

  /**
   * Select a frame by name
   * @param {string} frameName
   * @returns {Promise<object>}
   */
  async function selectFrameByName(frameName) {
    const response = await sendBrowserCommand('selectFrameByName', { frameName });
    if (response.frameId !== undefined) {
      currentFrameId = response.frameId;
    }
    return response;
  }

  // ===== Interaction Commands =====

  /**
   * Execute a TAG command
   * @param {object} params - TAG parameters
   * @returns {Promise<object>}
   */
  async function executeTag(params) {
    return sendBrowserCommand('TAG_COMMAND', {
      selector: {
        pos: params.pos,
        type: params.type,
        attr: params.attr,
        xpath: params.xpath,
        css: params.css,
        relative: params.relative || false,
      },
      action: {
        content: params.content,
        extract: params.extract,
        form: params.form,
        pressEnter: params.pressEnter,
      },
      timeout: params.timeout || 30000,
      waitVisible: params.waitVisible !== false,
    });
  }

  /**
   * Execute a CLICK command
   * @param {object} params - CLICK parameters
   * @returns {Promise<object>}
   */
  async function executeClick(params) {
    return sendBrowserCommand('CLICK_COMMAND', {
      x: params.x,
      y: params.y,
      button: params.button || 'left',
      clickCount: params.clickCount || 1,
      modifiers: params.modifiers || {},
    });
  }

  /**
   * Execute an EVENT command
   * @param {object} params - EVENT parameters
   * @returns {Promise<object>}
   */
  async function executeEvent(params) {
    return sendBrowserCommand('EVENT_COMMAND', {
      eventType: params.eventType,
      selector: params.selector,
      button: params.button,
      key: params.key,
      char: params.char,
      point: params.point,
      modifiers: params.modifiers,
      bubbles: params.bubbles !== false,
      cancelable: params.cancelable !== false,
    });
  }

  /**
   * Execute a SEARCH command
   * @param {object} params - SEARCH parameters
   * @returns {Promise<object>}
   */
  async function executeSearch(params) {
    return sendBrowserCommand('SEARCH_COMMAND', {
      sourceType: params.sourceType,
      pattern: params.pattern,
      ignoreCase: params.ignoreCase || false,
      extractPattern: params.extractPattern,
    });
  }

  // ===== Wait for Page Load =====

  /**
   * Wait for page to finish loading
   * @param {number} timeoutMs
   * @returns {Promise<object>}
   */
  async function waitForPageLoad(timeoutMs = 30000) {
    return sendBrowserCommand('waitForPageLoad', { timeout: timeoutMs });
  }

  // ===== Dialog Commands =====

  /**
   * Configure dialog handling (ONDIALOG command)
   * @param {object} config - Dialog configuration
   * @param {number} config.pos - Position (1-based)
   * @param {string} config.button - Button to click (OK, CANCEL, YES, NO)
   * @param {string} [config.content] - Content for prompt dialogs
   * @returns {Promise<object>}
   */
  async function configureDialog(config) {
    return sendBrowserCommand('DIALOG_CONFIG', {
      config: {
        pos: config.pos,
        button: config.button,
        content: config.content,
        active: true,
      },
      dialogTypes: ['alert', 'confirm', 'prompt', 'beforeunload'],
    });
  }

  /**
   * Reset dialog configuration
   * @returns {Promise<object>}
   */
  async function resetDialog() {
    return sendBrowserCommand('DIALOG_RESET', {});
  }

  // Return the bridge interface
  return {
    // Response handling
    handleResponse,

    // Tab management
    setActiveTab,
    getActiveTab,
    setCurrentFrame,
    getCurrentFrame,

    // Navigation
    navigate,
    getCurrentUrl,
    goBack,
    goForward,
    refresh,

    // Tabs
    openTab,
    switchTab,
    closeTab,
    closeOtherTabs,

    // Frames
    selectFrame,
    selectFrameByName,

    // Interaction (TAG, CLICK, EVENT, SEARCH)
    executeTag,
    executeClick,
    executeEvent,
    executeSearch,

    // Utility
    waitForPageLoad,
    sendBrowserCommand,

    // Dialogs
    configureDialog,
    resetDialog,
  };
}

module.exports = { createBrowserBridge };
