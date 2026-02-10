/**
 * Extension background service worker
 * Handles native messaging, content script relay, and tab management
 */
import type { RequestMessage, ResponseMessage } from '@shared/index';

// Inlined to avoid @shared chunk import — MV3 service workers can't use ESM chunk imports
function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
function createTimestamp(): number {
  return Date.now();
}
import {
  initWebRequestHandlers,
  handleLoginConfig,
  handleSetFilter,
  setAuthCredentials,
  clearAuthCredentials,
  getAuthCredentials,
  setFilter,
  disableAllFilters,
  getFilterState,
} from './background/web-request-handlers';

const NATIVE_HOST_NAME = 'com.imacros.nativehost';
const RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_ATTEMPTS = 5;
const KEEP_ALIVE_INTERVAL_MS = 25000; // Keep service worker alive

/**
 * Connection state
 */
interface ConnectionState {
  port: chrome.runtime.Port | null;
  isConnecting: boolean;
  reconnectAttempts: number;
  reconnectTimeout: ReturnType<typeof setTimeout> | null;
}

/**
 * Pending request tracking
 */
interface PendingRequest {
  resolve: (response: ResponseMessage) => void;
  reject: (error: Error) => void;
  tabId?: number;
  frameId?: number;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * Tab tracking for message routing
 */
interface TabInfo {
  id: number;
  url?: string;
  frameIds: Set<number>;
}

// Connection state
const connectionState: ConnectionState = {
  port: null,
  isConnecting: false,
  reconnectAttempts: 0,
  reconnectTimeout: null,
};

// Pending requests map (messageId -> PendingRequest)
const pendingRequests = new Map<string, PendingRequest>();

// Active tabs tracking
const activeTabs = new Map<number, TabInfo>();

// Keep-alive interval
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

// Recording state for capturing tab/frame events
let isRecording: boolean = false;
let recordingTabId: number | null = null; // The tab where recording started
let activeRecordingConfig: Record<string, unknown> | null = null; // Config to pass when starting recording in new tabs

// Frame context tracking for FRAME command generation
interface CurrentFrameContext {
  frameIndex: number;
  frameName: string | null;
}
let currentFrameContext: CurrentFrameContext | null = null;

// Accumulated recorded commands (background keeps its own copy so save survives navigation)
let recordedCommands: string[] = [];
let recordingStartUrl: string | null = null;

/**
 * Start keep-alive mechanism for service worker
 */
function startKeepAlive(): void {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }

  keepAliveInterval = setInterval(() => {
    // Simple operation to keep service worker alive
    chrome.storage.local.get('keepAlive', () => {
      console.debug('[iMacros] Keep-alive tick');
    });
  }, KEEP_ALIVE_INTERVAL_MS);
}

/**
 * Stop keep-alive mechanism
 */
function stopKeepAlive(): void {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

/**
 * Connect to the native host with lifecycle management
 */
function connectToNativeHost(): Promise<chrome.runtime.Port> {
  return new Promise((resolve, reject) => {
    if (connectionState.port) {
      resolve(connectionState.port);
      return;
    }

    if (connectionState.isConnecting) {
      // Wait for existing connection attempt
      const checkConnection = setInterval(() => {
        if (connectionState.port) {
          clearInterval(checkConnection);
          resolve(connectionState.port);
        } else if (!connectionState.isConnecting) {
          clearInterval(checkConnection);
          reject(new Error('Connection failed'));
        }
      }, 100);
      return;
    }

    connectionState.isConnecting = true;

    try {
      console.log('[iMacros] Connecting to native host:', NATIVE_HOST_NAME);
      const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);

      port.onMessage.addListener((message: ResponseMessage) => {
        console.log('[iMacros] Native host message:', message);
        handleNativeResponse(message);
      });

      port.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError?.message || 'Unknown disconnect reason';
        console.log('[iMacros] Native host disconnected:', error);

        connectionState.port = null;
        connectionState.isConnecting = false;

        // Reject all pending requests
        for (const [id, pending] of pendingRequests) {
          clearTimeout(pending.timeout);
          pending.reject(new Error(`Connection lost: ${error}`));
          pendingRequests.delete(id);
        }

        // Attempt reconnection if not at max attempts
        scheduleReconnect();
      });

      connectionState.port = port;
      connectionState.isConnecting = false;
      connectionState.reconnectAttempts = 0;

      // Start keep-alive when connected
      startKeepAlive();

      console.log('[iMacros] Connected to native host');
      resolve(port);
    } catch (error) {
      connectionState.isConnecting = false;
      console.error('[iMacros] Failed to connect to native host:', error);
      scheduleReconnect();
      reject(error);
    }
  });
}

/**
 * Schedule a reconnection attempt
 */
function scheduleReconnect(): void {
  if (connectionState.reconnectTimeout) {
    return; // Already scheduled
  }

  if (connectionState.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('[iMacros] Max reconnection attempts reached');
    stopKeepAlive();
    return;
  }

  const delay = RECONNECT_DELAY_MS * Math.pow(2, connectionState.reconnectAttempts);
  console.log(`[iMacros] Scheduling reconnect in ${delay}ms (attempt ${connectionState.reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);

  connectionState.reconnectTimeout = setTimeout(() => {
    connectionState.reconnectTimeout = null;
    connectionState.reconnectAttempts++;
    connectToNativeHost().catch(() => {
      // Error already logged in connectToNativeHost
    });
  }, delay);
}

/**
 * Disconnect from native host
 */
function disconnectFromNativeHost(): void {
  if (connectionState.reconnectTimeout) {
    clearTimeout(connectionState.reconnectTimeout);
    connectionState.reconnectTimeout = null;
  }

  if (connectionState.port) {
    connectionState.port.disconnect();
    connectionState.port = null;
  }

  connectionState.isConnecting = false;
  connectionState.reconnectAttempts = 0;

  stopKeepAlive();

  // Clear pending requests
  for (const [id, pending] of pendingRequests) {
    clearTimeout(pending.timeout);
    pending.reject(new Error('Disconnected'));
    pendingRequests.delete(id);
  }

  console.log('[iMacros] Disconnected from native host');
}

/**
 * Send a message to the native host with response tracking
 */
async function sendToNativeHost(
  message: RequestMessage,
  tabId?: number,
  frameId?: number,
  timeoutMs = 30000
): Promise<ResponseMessage> {
  const port = await connectToNativeHost();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(message.id);
      reject(new Error(`Request timeout: ${message.type}`));
    }, timeoutMs);

    pendingRequests.set(message.id, {
      resolve,
      reject,
      tabId,
      frameId,
      timeout,
    });

    try {
      port.postMessage(message);
      console.log('[iMacros] Sent to native host:', message.type, message.id);
    } catch (error) {
      clearTimeout(timeout);
      pendingRequests.delete(message.id);
      reject(error);
    }
  });
}

/**
 * Send a message to the native host without waiting for response
 */
async function sendToNativeHostNoWait(message: RequestMessage): Promise<void> {
  try {
    const port = await connectToNativeHost();
    port.postMessage(message);
    console.log('[iMacros] Sent to native host (no wait):', message.type, message.id);
  } catch (error) {
    console.error('[iMacros] Failed to send to native host:', error);
  }
}

/**
 * Handle responses from the native host
 */
function handleNativeResponse(response: ResponseMessage): void {
  // Check if this is a response to a pending request
  const pending = pendingRequests.get(response.id);
  if (pending) {
    clearTimeout(pending.timeout);
    pendingRequests.delete(response.id);

    if (response.type === 'error') {
      pending.reject(new Error(response.error || 'Unknown error'));
    } else {
      pending.resolve(response);
    }
    return;
  }

  // Handle unsolicited messages from native host (commands to execute)
  handleNativeCommand(response);
}

/**
 * Send a message to all extension views (panel, popup, etc.)
 */
async function broadcastToExtensionViews(message: unknown): Promise<void> {
  try {
    // Send to all extension views (panel, popup, options page, etc.)
    chrome.runtime.sendMessage(message).catch(() => {
      // Extension views might not be open, ignore errors
    });
  } catch {
    // Ignore errors if no listeners
  }
}

/**
 * Handle commands from native host that need to be relayed to content scripts
 */
async function handleNativeCommand(message: ResponseMessage): Promise<void> {
  const payload = message.payload as Record<string, unknown> | undefined;

  switch (message.type) {
    case 'result':
      // If payload contains tabId, relay to specific tab
      if (payload?.tabId && typeof payload.tabId === 'number') {
        await relayToContentScript(payload.tabId, payload.frameId as number | undefined, message);
      }
      break;

    // Status updates from native host - relay to panel
    case 'STATUS_UPDATE':
      console.log('[iMacros] Status update from native host:', payload);
      await broadcastToExtensionViews({ type: 'STATUS_UPDATE', payload });
      break;

    case 'MACRO_PROGRESS':
      console.log('[iMacros] Macro progress:', payload);
      await broadcastToExtensionViews({ type: 'MACRO_PROGRESS', payload });
      break;

    case 'MACRO_COMPLETE':
      console.log('[iMacros] Macro complete:', payload);
      await broadcastToExtensionViews({ type: 'MACRO_COMPLETE', payload });
      break;

    case 'MACRO_ERROR':
      console.log('[iMacros] Macro error:', payload);
      await broadcastToExtensionViews({ type: 'MACRO_ERROR', payload });
      break;

    case 'MACRO_PAUSED':
      console.log('[iMacros] Macro paused');
      await broadcastToExtensionViews({ type: 'MACRO_PAUSED', payload });
      break;

    case 'MACRO_RESUMED':
      console.log('[iMacros] Macro resumed');
      await broadcastToExtensionViews({ type: 'MACRO_RESUMED', payload });
      break;

    case 'RECORDING_LINE':
      console.log('[iMacros] Recording line:', payload);
      await broadcastToExtensionViews({ type: 'RECORDING_LINE', payload });
      break;

    case 'RECORDING_SAVED':
      console.log('[iMacros] Recording saved');
      await broadcastToExtensionViews({ type: 'RECORDING_SAVED', payload });
      break;

    case 'ready':
      console.log('[iMacros] Native host ready:', payload);
      // Native host is ready, we can now send requests
      break;

    case 'browser_command':
      // Route browser commands from native host to appropriate handler
      await handleBrowserCommand(message);
      break;

    default:
      console.log('[iMacros] Unhandled native command:', message.type);
  }
}

/**
 * Ping the content script on a tab until it responds, confirming it's ready.
 * Resolves once the content script is reachable or after timeout.
 */
async function waitForContentScript(tabId: number, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'PING' });
      return; // Content script responded
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

/**
 * Handle browser commands from native host
 * Routes commands to tabs/content scripts and sends responses back
 */
async function handleBrowserCommand(message: ResponseMessage): Promise<void> {
  const payload = message.payload as {
    commandType: string;
    tabId?: number;
    frameId?: number;
    [key: string]: unknown;
  };

  const { commandType, tabId, frameId, ...params } = payload;
  const messageId = message.id;

  // Get the target tab ID (use provided or get active tab)
  let targetTabId = tabId;
  if (!targetTabId) {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    targetTabId = activeTab?.id;
  }

  if (!targetTabId) {
    sendBrowserCommandResponse(messageId, { success: false, error: 'No active tab' });
    return;
  }

  try {
    let result: unknown;

    switch (commandType) {
      // Navigation commands
      case 'navigate': {
        const { url } = params as { url: string };
        // Set up the navigation listener BEFORE calling tabs.update to avoid race conditions.
        // We must see 'loading' first to ensure we're tracking the NEW navigation,
        // not a stale 'complete' from the previous page.
        const navigationDone = new Promise<void>((resolve) => {
          let sawLoading = false;
          const onUpdated = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
            if (updatedTabId !== targetTabId) return;
            if (changeInfo.status === 'loading') {
              sawLoading = true;
            }
            if (sawLoading && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(onUpdated);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(onUpdated);
          setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(onUpdated);
            resolve();
          }, 30000);
        });
        await chrome.tabs.update(targetTabId, { url });
        await navigationDone;
        await waitForContentScript(targetTabId);
        result = { success: true };
        break;
      }

      case 'getCurrentUrl': {
        const tab = await chrome.tabs.get(targetTabId);
        result = { success: true, url: tab.url || '' };
        break;
      }

      case 'goBack': {
        await chrome.tabs.goBack(targetTabId);
        result = { success: true };
        break;
      }

      case 'goForward': {
        await chrome.tabs.goForward(targetTabId);
        result = { success: true };
        break;
      }

      case 'refresh': {
        await chrome.tabs.reload(targetTabId);
        result = { success: true };
        break;
      }

      // Tab commands
      case 'openTab': {
        const { url } = params as { url?: string };
        const newTab = await chrome.tabs.create({ url, active: true });
        result = { success: true, tabId: newTab.id };
        break;
      }

      case 'switchTab': {
        const { tabIndex } = params as { tabIndex: number };
        const tabs = await chrome.tabs.query({ currentWindow: true });
        if (tabIndex >= 0 && tabIndex < tabs.length) {
          const tab = tabs[tabIndex];
          if (tab.id) {
            await chrome.tabs.update(tab.id, { active: true });
            result = { success: true, tabId: tab.id };
          }
        } else {
          result = { success: false, error: `Tab index ${tabIndex} out of range` };
        }
        break;
      }

      case 'closeTab': {
        await chrome.tabs.remove(targetTabId);
        result = { success: true };
        break;
      }

      case 'closeOtherTabs': {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const tabsToClose = tabs.filter(t => t.id && t.id !== targetTabId).map(t => t.id!);
        if (tabsToClose.length > 0) {
          await chrome.tabs.remove(tabsToClose);
        }
        result = { success: true };
        break;
      }

      // Frame commands
      case 'selectFrame': {
        const { frameIndex } = params as { frameIndex: number };
        // Send to main frame's content script (frameId 0) which has the
        // FrameHandler that enumerates all iframes and manages frame selection.
        result = await chrome.tabs.sendMessage(targetTabId, {
          type: 'SELECT_FRAME',
          frameIndex,
        }, { frameId: 0 });
        break;
      }

      case 'selectFrameByName': {
        const { frameName } = params as { frameName: string };
        // Send to main frame's content script (frameId 0) for frame selection.
        result = await chrome.tabs.sendMessage(targetTabId, {
          type: 'SELECT_FRAME_BY_NAME',
          frameName,
        }, { frameId: 0 });
        break;
      }

      // DOM interaction commands - always route to main frame's content script (frameId 0).
      // The main frame's FrameHandler tracks the selected frame and uses
      // getCurrentDocument() to execute commands in the correct frame context.
      case 'TAG_COMMAND':
      case 'CLICK_COMMAND':
      case 'EVENT_COMMAND':
      case 'SEARCH_COMMAND': {
        console.log(`[iMacros] Sending ${commandType} to tab ${targetTabId}:`, JSON.stringify(params.selector || params));
        result = await chrome.tabs.sendMessage(targetTabId, {
          type: commandType,
          id: messageId,
          timestamp: Date.now(),
          payload: params,
        }, { frameId: 0 });
        console.log(`[iMacros] ${commandType} result:`, JSON.stringify(result));
        break;
      }

      // Dialog configuration - route to content script
      case 'DIALOG_CONFIG': {
        // Send to all frames in the tab so dialog interception works in iframes too
        const dialogResults = await sendToAllFramesInTab(targetTabId, {
          type: 'DIALOG_CONFIG',
          id: messageId,
          timestamp: Date.now(),
          payload: params,
        });
        // Consider success if at least one frame responded successfully
        const dialogSuccess = dialogResults.some(r =>
          r.response && (r.response as { success?: boolean }).success
        );
        result = { success: dialogSuccess };
        break;
      }

      case 'DIALOG_RESET': {
        // Send to all frames in the tab
        await sendToAllFramesInTab(targetTabId, {
          type: 'DIALOG_RESET',
          id: messageId,
          timestamp: Date.now(),
        });
        result = { success: true };
        break;
      }

      case 'waitForPageLoad': {
        // Get tab status and wait if needed
        let tab = await chrome.tabs.get(targetTabId);
        const timeout = (params.timeout as number) || 30000;
        const startTime = Date.now();

        while (tab.status !== 'complete' && Date.now() - startTime < timeout) {
          await new Promise(resolve => setTimeout(resolve, 100));
          tab = await chrome.tabs.get(targetTabId);
        }

        result = { success: tab.status === 'complete' };
        break;
      }

      default:
        result = { success: false, error: `Unknown command type: ${commandType}` };
    }

    sendBrowserCommandResponse(messageId, result as Record<string, unknown>);

  } catch (error) {
    console.error('[iMacros] Browser command error:', error);
    sendBrowserCommandResponse(messageId, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Send a browser command response back to the native host
 */
function sendBrowserCommandResponse(messageId: string, payload: Record<string, unknown>): void {
  if (connectionState.port) {
    connectionState.port.postMessage({
      type: 'browser_command_response',
      id: messageId,
      timestamp: Date.now(),
      payload,
      error: payload.error,
    });
  }
}

/**
 * Relay a message to a content script
 */
async function relayToContentScript(
  tabId: number,
  frameId: number | undefined,
  message: unknown
): Promise<unknown> {
  try {
    const options: chrome.tabs.MessageSendOptions = {};
    if (frameId !== undefined) {
      options.frameId = frameId;
    }

    const response = await chrome.tabs.sendMessage(tabId, message, options);
    return response;
  } catch (error) {
    console.error(`[iMacros] Failed to relay to tab ${tabId}:`, error);
    throw error;
  }
}

/**
 * Broadcast a message to all content scripts
 */
async function broadcastToContentScripts(message: unknown): Promise<void> {
  const tabs = await chrome.tabs.query({});

  for (const tab of tabs) {
    if (tab.id && tab.url && !tab.url.startsWith('chrome://')) {
      try {
        await chrome.tabs.sendMessage(tab.id, message);
      } catch {
        // Tab might not have content script loaded
      }
    }
  }
}

/**
 * Send a message to all frames in a specific tab
 * Uses webNavigation.getAllFrames to enumerate frames and sends to each
 */
async function sendToAllFramesInTab(
  tabId: number,
  message: unknown
): Promise<Array<{ frameId: number; response?: unknown; error?: string }>> {
  const results: Array<{ frameId: number; response?: unknown; error?: string }> = [];

  try {
    // Get all frames in the tab
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    if (!frames || frames.length === 0) {
      // No frames found, try sending to main frame
      try {
        const response = await chrome.tabs.sendMessage(tabId, message);
        results.push({ frameId: 0, response });
      } catch (error) {
        results.push({ frameId: 0, error: String(error) });
      }
      return results;
    }

    // Send message to each frame
    const sendPromises = frames.map(async (frame) => {
      try {
        const response = await chrome.tabs.sendMessage(tabId, message, {
          frameId: frame.frameId,
        });
        return { frameId: frame.frameId, response };
      } catch (error) {
        // Frame might not have content script loaded (e.g., cross-origin iframe without our script)
        return { frameId: frame.frameId, error: String(error) };
      }
    });

    const allResults = await Promise.all(sendPromises);
    results.push(...allResults);
  } catch (error) {
    console.error(`[iMacros] Failed to get frames for tab ${tabId}:`, error);
    // Fall back to sending to main frame
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      results.push({ frameId: 0, response });
    } catch (err) {
      results.push({ frameId: 0, error: String(err) });
    }
  }

  return results;
}

/**
 * Collect recorded events from all frames in a tab
 * Returns combined macro and events from all frames
 */
async function collectRecordingFromAllFrames(
  tabId: number
): Promise<{ macro: string; events: unknown[] }> {
  const results = await sendToAllFramesInTab(tabId, { type: 'RECORD_STOP' });

  // Collect all events from all frames
  const allEvents: unknown[] = [];
  let mainFrameMacro = '';

  for (const result of results) {
    if (result.response) {
      const response = result.response as {
        success?: boolean;
        macro?: string;
        events?: unknown[];
      };
      if (response.success) {
        // Use the main frame's macro as the base (it has the VERSION and URL lines)
        if (result.frameId === 0 && response.macro) {
          mainFrameMacro = response.macro;
        }
        // Collect events from all frames
        if (response.events) {
          allEvents.push(...response.events);
        }
      }
    }
  }

  // Sort events by timestamp if they have one
  allEvents.sort((a, b) => {
    const aTime = (a as { timestamp?: number }).timestamp || 0;
    const bTime = (b as { timestamp?: number }).timestamp || 0;
    return aTime - bTime;
  });

  return { macro: mainFrameMacro, events: allEvents };
}

// ============================================================================
// Tab Management Operations
// ============================================================================

/**
 * Create a new tab
 */
async function createTab(options: {
  url?: string;
  active?: boolean;
  windowId?: number;
  index?: number;
}): Promise<chrome.tabs.Tab> {
  const tab = await chrome.tabs.create({
    url: options.url,
    active: options.active ?? true,
    windowId: options.windowId,
    index: options.index,
  });

  if (tab.id) {
    activeTabs.set(tab.id, {
      id: tab.id,
      url: tab.url,
      frameIds: new Set([0]), // Main frame
    });
  }

  console.log('[iMacros] Created tab:', tab.id, options.url);
  return tab;
}

/**
 * Switch to (activate) an existing tab
 */
async function switchToTab(tabId: number): Promise<chrome.tabs.Tab> {
  const tab = await chrome.tabs.update(tabId, { active: true });

  // Also focus the window containing the tab
  if (tab.windowId) {
    await chrome.windows.update(tab.windowId, { focused: true });
  }

  console.log('[iMacros] Switched to tab:', tabId);
  return tab;
}

/**
 * Close a tab
 */
async function closeTab(tabId: number): Promise<void> {
  await chrome.tabs.remove(tabId);
  activeTabs.delete(tabId);
  console.log('[iMacros] Closed tab:', tabId);
}

/**
 * Get tab by ID
 */
async function getTab(tabId: number): Promise<chrome.tabs.Tab | null> {
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return null;
  }
}

/**
 * Query tabs with optional filters
 */
async function queryTabs(queryInfo: chrome.tabs.QueryInfo = {}): Promise<chrome.tabs.Tab[]> {
  return chrome.tabs.query(queryInfo);
}

/**
 * Navigate a tab to a URL
 */
async function navigateTab(tabId: number, url: string): Promise<chrome.tabs.Tab> {
  return chrome.tabs.update(tabId, { url });
}

/**
 * Reload a tab
 */
async function reloadTab(tabId: number, bypassCache = false): Promise<void> {
  await chrome.tabs.reload(tabId, { bypassCache });
}

/**
 * Go back in tab history
 */
async function goBack(tabId: number): Promise<void> {
  await chrome.tabs.goBack(tabId);
}

/**
 * Go forward in tab history
 */
async function goForward(tabId: number): Promise<void> {
  await chrome.tabs.goForward(tabId);
}

// ============================================================================
// Message Handlers
// ============================================================================

/**
 * Handle messages from content scripts or popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[iMacros] Message received:', message.type, 'from:', sender.tab?.id || 'popup');

  // Wrap async handler
  (async () => {
    try {
      const result = await handleMessage(message, sender);
      sendResponse(result);
    } catch (error) {
      console.error('[iMacros] Message handler error:', error);
      sendResponse({ success: false, error: String(error) });
    }
  })();

  return true; // Keep the message channel open for async response
});

/**
 * Main message handler
 */
async function handleMessage(
  message: { type: string; payload?: unknown; id?: string },
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  const tabId = sender.tab?.id;
  const frameId = sender.frameId;

  switch (message.type) {
    // Connection management
    case 'CONNECT':
      await connectToNativeHost();
      return { success: true, connected: true };

    case 'DISCONNECT':
      disconnectFromNativeHost();
      return { success: true, connected: false };

    case 'CONNECTION_STATUS':
      return {
        success: true,
        connected: connectionState.port !== null,
        reconnecting: connectionState.isConnecting,
        reconnectAttempts: connectionState.reconnectAttempts,
      };

    // Ping/pong for keepalive
    case 'ping':
      await sendToNativeHostNoWait({
        type: 'ping',
        id: createMessageId(),
        timestamp: createTimestamp(),
      });
      return { success: true };

    // Dialog events from content scripts
    case 'DIALOG_EVENT':
      console.log('[iMacros] Dialog event received:', message.payload);
      await sendToNativeHostNoWait({
        type: 'dialog_event',
        id: createMessageId(),
        timestamp: createTimestamp(),
        payload: {
          ...(message.payload as object),
          tabId,
          frameId,
        },
      });
      return { success: true };

    // Recorded events from content scripts (macro recorder)
    case 'RECORD_EVENT': {
      console.log('[iMacros] Record event received:', message.payload);

      // Check if we need to generate a FRAME command due to frame context change
      const payload = message.payload as {
        frameContext?: {
          inFrame: boolean;
          frameIndex: number;
          frameName: string | null;
        };
        command?: string;
      };

      const eventFrameContext = payload.frameContext;
      let frameCommand: string | null = null;

      if (eventFrameContext) {
        const newFrameIndex = eventFrameContext.inFrame ? eventFrameContext.frameIndex : 0;
        const newFrameName = eventFrameContext.inFrame ? eventFrameContext.frameName : null;

        // Check if frame context has changed
        const frameChanged = currentFrameContext === null ||
          currentFrameContext.frameIndex !== newFrameIndex ||
          currentFrameContext.frameName !== newFrameName;

        if (frameChanged) {
          // Update tracked frame context
          currentFrameContext = {
            frameIndex: newFrameIndex,
            frameName: newFrameName,
          };

          // Generate FRAME command if we're not in the main document (index 0)
          // or if we're returning to main document after being in a frame
          if (newFrameIndex > 0) {
            // Prefer FRAME NAME= if we have a name
            if (newFrameName) {
              frameCommand = `FRAME NAME="${newFrameName}"`;
            } else {
              frameCommand = `FRAME F=${newFrameIndex}`;
            }
          } else if (currentFrameContext && newFrameIndex === 0) {
            // Return to main document
            frameCommand = 'FRAME F=0';
          }
        }
      }

      // If frame context changed, send a FRAME command event first
      if (frameCommand) {
        console.log('[iMacros] Frame context changed, generating:', frameCommand);
        recordedCommands.push(frameCommand);
        await sendToNativeHostNoWait({
          type: 'record_event',
          id: createMessageId(),
          timestamp: createTimestamp(),
          payload: {
            type: 'frame',
            command: frameCommand,
            timestamp: Date.now(),
            url: sender.url,
            tabId,
            frameId,
            isFrameSwitch: true,
          },
        });
      }

      // Accumulate the command in the background's list
      if (payload.command) {
        recordedCommands.push(payload.command);
      }

      // Send the actual recorded event
      await sendToNativeHostNoWait({
        type: 'record_event',
        id: createMessageId(),
        timestamp: createTimestamp(),
        payload: {
          ...(message.payload as object),
          tabId,
          frameId,
          url: sender.url,
        },
      });
      return { success: true };
    }

    // Start/stop recording
    case 'RECORD_START':
      setRecordingState(true, tabId);
      await sendToNativeHostNoWait({
        type: 'record_start',
        id: createMessageId(),
        timestamp: createTimestamp(),
        payload: message.payload,
      });
      return { success: true };

    case 'RECORD_STOP':
      setRecordingState(false);
      await sendToNativeHostNoWait({
        type: 'record_stop',
        id: createMessageId(),
        timestamp: createTimestamp(),
        payload: message.payload,
      });
      return { success: true };

    // Execute command and wait for response
    case 'EXECUTE':
      const response = await sendToNativeHost(
        {
          type: 'execute',
          id: message.id || createMessageId(),
          timestamp: createTimestamp(),
          payload: {
            ...(message.payload as object),
            tabId,
            frameId,
            url: sender.url,
          },
        },
        tabId,
        frameId
      );
      return { success: true, result: response.payload };

    // Tab operations
    case 'TAB_CREATE':
      const newTab = await createTab(message.payload as { url?: string; active?: boolean });
      return { success: true, tab: { id: newTab.id, url: newTab.url } };

    case 'TAB_SWITCH':
      const payloadSwitch = message.payload as { tabId: number };
      const switchedTab = await switchToTab(payloadSwitch.tabId);
      return { success: true, tab: { id: switchedTab.id, url: switchedTab.url } };

    case 'TAB_CLOSE':
      const payloadClose = message.payload as { tabId: number };
      await closeTab(payloadClose.tabId);
      return { success: true };

    case 'TAB_GET':
      const payloadGet = message.payload as { tabId: number };
      const tab = await getTab(payloadGet.tabId);
      return { success: true, tab: tab ? { id: tab.id, url: tab.url } : null };

    case 'TAB_QUERY':
      const tabs = await queryTabs(message.payload as chrome.tabs.QueryInfo);
      return { success: true, tabs: tabs.map(t => ({ id: t.id, url: t.url, active: t.active })) };

    case 'TAB_NAVIGATE':
      const payloadNav = message.payload as { tabId: number; url: string };
      const navTab = await navigateTab(payloadNav.tabId, payloadNav.url);
      return { success: true, tab: { id: navTab.id, url: navTab.url } };

    case 'TAB_RELOAD':
      const payloadReload = message.payload as { tabId: number; bypassCache?: boolean };
      await reloadTab(payloadReload.tabId, payloadReload.bypassCache);
      return { success: true };

    case 'TAB_BACK':
      const payloadBack = message.payload as { tabId: number };
      await goBack(payloadBack.tabId);
      return { success: true };

    case 'TAB_FORWARD':
      const payloadForward = message.payload as { tabId: number };
      await goForward(payloadForward.tabId);
      return { success: true };

    // Relay to content script
    case 'RELAY_TO_TAB':
      const relayPayload = message.payload as { tabId: number; frameId?: number; message: unknown };
      const relayResult = await relayToContentScript(
        relayPayload.tabId,
        relayPayload.frameId,
        relayPayload.message
      );
      return { success: true, result: relayResult };

    // Broadcast to all tabs
    case 'BROADCAST':
      await broadcastToContentScripts(message.payload);
      return { success: true };

    // Web request handlers (ONLOGIN, FILTER)
    case 'LOGIN_CONFIG':
      console.log('[iMacros] LOGIN_CONFIG received:', message.payload);
      return handleLoginConfig(message.payload as {
        config: { user: string; password: string; active: boolean; timeout?: number };
        append?: boolean;
      });

    case 'setFilter':
      console.log('[iMacros] setFilter received:', message.payload);
      return await handleSetFilter(message.payload as {
        filterType: 'IMAGES' | 'FLASH' | 'POPUPS';
        status: 'ON' | 'OFF';
      });

    case 'SET_AUTH_CREDENTIALS':
      const authPayload = message.payload as { username: string; password: string; urlPattern?: string };
      setAuthCredentials(authPayload.username, authPayload.password, authPayload.urlPattern);
      return { success: true };

    case 'CLEAR_AUTH_CREDENTIALS':
      clearAuthCredentials();
      return { success: true };

    case 'GET_AUTH_STATUS':
      return { success: true, credentials: getAuthCredentials() };

    case 'SET_FILTER':
      const filterPayload = message.payload as { filterType: 'IMAGES' | 'FLASH' | 'POPUPS'; status: 'ON' | 'OFF' };
      await setFilter(filterPayload.filterType, filterPayload.status);
      return { success: true };

    case 'DISABLE_ALL_FILTERS':
      await disableAllFilters();
      return { success: true };

    case 'GET_FILTER_STATUS':
      return { success: true, filters: getFilterState() };

    // Macro file operations (for editor)
    case 'LOAD_MACRO': {
      const loadPayload = message.payload as { path: string };
      console.log('[iMacros] LOAD_MACRO:', loadPayload.path);
      try {
        const loadResponse = await sendToNativeHost({
          type: 'load_macro',
          id: message.id || createMessageId(),
          timestamp: createTimestamp(),
          payload: { path: loadPayload.path },
        });
        return { success: true, content: (loadResponse.payload as { content?: string })?.content || '' };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }

    case 'SAVE_MACRO': {
      const savePayload = message.payload as { path: string; content: string };
      console.log('[iMacros] SAVE_MACRO:', savePayload.path);
      try {
        const saveResponse = await sendToNativeHost({
          type: 'save_macro',
          id: message.id || createMessageId(),
          timestamp: createTimestamp(),
          payload: { path: savePayload.path, content: savePayload.content },
        });
        return { success: true, path: (saveResponse.payload as { path?: string })?.path || savePayload.path };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }

    case 'CREATE_FOLDER': {
      const folderPayload = message.payload as { path: string };
      console.log('[iMacros] CREATE_FOLDER:', folderPayload.path);
      try {
        await sendToNativeHost({
          type: 'create_folder',
          id: message.id || createMessageId(),
          timestamp: createTimestamp(),
          payload: { path: folderPayload.path },
        });
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }

    case 'RENAME_FILE': {
      const renamePayload = message.payload as { oldPath: string; newName: string };
      console.log('[iMacros] RENAME_FILE:', renamePayload.oldPath, '->', renamePayload.newName);
      try {
        await sendToNativeHost({
          type: 'rename_file',
          id: message.id || createMessageId(),
          timestamp: createTimestamp(),
          payload: { oldPath: renamePayload.oldPath, newName: renamePayload.newName },
        });
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }

    case 'DELETE_FILE': {
      const deletePayload = message.payload as { path: string };
      console.log('[iMacros] DELETE_FILE:', deletePayload.path);
      try {
        await sendToNativeHost({
          type: 'delete_file',
          id: message.id || createMessageId(),
          timestamp: createTimestamp(),
          payload: { path: deletePayload.path },
        });
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }

    case 'MOVE_FILE': {
      const movePayload = message.payload as { sourcePath: string; targetPath: string };
      console.log('[iMacros] MOVE_FILE:', movePayload.sourcePath, '->', movePayload.targetPath);
      try {
        await sendToNativeHost({
          type: 'move_file',
          id: message.id || createMessageId(),
          timestamp: createTimestamp(),
          payload: { sourcePath: movePayload.sourcePath, targetPath: movePayload.targetPath },
        });
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }

    case 'PLAY_MACRO': {
      const playPayload = message.payload as { path: string; loop?: boolean };
      console.log('[iMacros] PLAY_MACRO:', playPayload.path);
      try {
        await sendToNativeHostNoWait({
          type: 'play_macro',
          id: message.id || createMessageId(),
          timestamp: createTimestamp(),
          payload: { path: playPayload.path, loop: playPayload.loop || false },
        });
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }

    case 'STOP_MACRO': {
      console.log('[iMacros] STOP_MACRO from panel');
      try {
        await sendToNativeHostNoWait({
          type: 'stop_macro',
          id: message.id || createMessageId(),
          timestamp: createTimestamp(),
          payload: {},
        });
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }

    case 'PAUSE_MACRO': {
      console.log('[iMacros] PAUSE_MACRO from panel');
      try {
        await sendToNativeHostNoWait({
          type: 'pause_macro',
          id: message.id || createMessageId(),
          timestamp: createTimestamp(),
          payload: {},
        });
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }

    case 'RESUME_MACRO': {
      console.log('[iMacros] RESUME_MACRO from panel');
      try {
        await sendToNativeHostNoWait({
          type: 'resume_macro',
          id: message.id || createMessageId(),
          timestamp: createTimestamp(),
          payload: {},
        });
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }

    // Start recording from panel
    case 'START_RECORDING': {
      console.log('[iMacros] START_RECORDING from panel');
      try {
        // Get active tab
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab?.id) {
          return { success: false, error: 'No active tab found' };
        }

        // Load recording preferences from storage
        const RECORDING_PREFS_STORAGE_KEY = 'imacros_recording_preferences';
        const DEFAULT_RECORDING_PREFERENCES = {
          mode: 'conventional',
          expertMode: false,
          favorElementIds: true,
          recordKeyboard: false,
          useTextContent: true,
        };

        const result = await chrome.storage.local.get(RECORDING_PREFS_STORAGE_KEY);
        const recordingPrefs = result[RECORDING_PREFS_STORAGE_KEY] || DEFAULT_RECORDING_PREFERENCES;

        // Convert RecordingPreferences to MacroRecorderConfig
        // Default preferred attributes, with 'id' first if favorElementIds is true
        const preferredAttributes = recordingPrefs.favorElementIds
          ? ['id', 'name', 'class', 'href', 'src', 'value', 'title', 'placeholder']
          : ['name', 'class', 'id', 'href', 'src', 'value', 'title', 'placeholder'];

        const recorderConfig = {
          recordClicks: true,
          recordInputs: true,
          recordSubmits: true,
          recordKeyboard: recordingPrefs.recordKeyboard || false,
          useTextContent: recordingPrefs.useTextContent !== false, // Default true
          preferredAttributes,
          highlightElements: true,
        };

        console.log('[iMacros] Recording with config:', recorderConfig);

        // Set recording state with config (clears recordedCommands)
        setRecordingState(true, activeTab.id, recorderConfig);

        // Capture the starting URL for the macro header
        recordingStartUrl = activeTab.url || '';

        // Send RECORD_START message to all frames in the tab
        try {
          const frameResults = await sendToAllFramesInTab(activeTab.id, {
            type: 'RECORD_START',
            payload: { config: recorderConfig },
          });
          const successCount = frameResults.filter(r => r.response && (r.response as { success?: boolean }).success).length;
          console.log(`[iMacros] RECORD_START sent to ${frameResults.length} frames, ${successCount} responded successfully`);
        } catch (error) {
          console.warn('[iMacros] Content script may not be ready:', error);
          // Continue anyway - content script might inject later
        }

        // Notify native host with record_start message
        await sendToNativeHostNoWait({
          type: 'record_start',
          id: message.id || createMessageId(),
          timestamp: createTimestamp(),
          payload: {
            tabId: activeTab.id,
            url: activeTab.url,
            config: recorderConfig,
          },
        });

        return { success: true, tabId: activeTab.id };
      } catch (error) {
        console.error('[iMacros] START_RECORDING error:', error);
        return { success: false, error: String(error) };
      }
    }

    // Stop recording from panel
    case 'STOP_RECORDING': {
      console.log('[iMacros] STOP_RECORDING from panel');
      try {
        // Check if recording is active
        if (!recordingTabId) {
          return { success: false, error: 'Not currently recording' };
        }

        // Collect recording from all frames in the tab
        let macro = '';
        let events: unknown[] = [];
        try {
          const result = await collectRecordingFromAllFrames(recordingTabId);
          macro = result.macro;
          events = result.events;
          console.log(`[iMacros] Collected ${events.length} events from all frames`);
        } catch (error) {
          console.warn('[iMacros] Could not collect recording from frames:', error);
          // Continue anyway - tab may have been closed or navigated away
        }

        // Set recording state to false
        setRecordingState(false);

        // Notify native host with record_stop message
        await sendToNativeHostNoWait({
          type: 'record_stop',
          id: message.id || createMessageId(),
          timestamp: createTimestamp(),
          payload: {
            macro,
            events,
          },
        });

        return { success: true, macro, events };
      } catch (error) {
        console.error('[iMacros] STOP_RECORDING error:', error);
        return { success: false, error: String(error) };
      }
    }

    // Save recording to file from panel
    case 'SAVE_RECORDING': {
      const saveRecordingPayload = message.payload as { path?: string; filename?: string };
      const savePath = saveRecordingPayload.path || saveRecordingPayload.filename || '';
      console.log('[iMacros] SAVE_RECORDING from panel:', savePath, `(${recordedCommands.length} commands accumulated)`);
      try {
        // Check if recording is active
        if (!recordingTabId) {
          return { success: false, error: 'Not currently recording' };
        }

        if (!savePath) {
          return { success: false, error: 'No file path specified' };
        }

        // Build macro from background's accumulated commands (no content script dependency)
        const macroLines = [
          'VERSION BUILD=1 RECORDER=CR',
        ];
        if (recordingStartUrl) {
          macroLines.push(`URL GOTO=${recordingStartUrl}`);
        }
        macroLines.push(...recordedCommands);
        const macroContent = macroLines.join('\n');

        console.log('[iMacros] Generated macro from accumulated commands:', macroLines.length, 'lines');

        // Send save_macro to native host with path and content
        try {
          await sendToNativeHost({
            type: 'save_macro',
            id: message.id || createMessageId(),
            timestamp: createTimestamp(),
            payload: { path: savePath, content: macroContent },
          });
        } catch (error) {
          console.error('[iMacros] Failed to save macro via native host:', error);
          return { success: false, error: String(error) };
        }

        // Stop recording in all frames
        try {
          if (recordingTabId) {
            await sendToAllFramesInTab(recordingTabId, { type: 'RECORD_STOP' });
          }
        } catch (error) {
          console.warn('[iMacros] Could not send RECORD_STOP to all frames:', error);
          // Continue anyway - the macro was already saved
        }

        // Set recording state to false
        setRecordingState(false);

        return { success: true, path: savePath };
      } catch (error) {
        console.error('[iMacros] SAVE_RECORDING error:', error);
        return { success: false, error: String(error) };
      }
    }

    // Open settings/options page in a new tab
    case 'OPEN_SETTINGS': {
      const optionsUrl = chrome.runtime.getURL('options.html');
      const optionsTab = await chrome.tabs.create({ url: optionsUrl });
      return { success: true, tabId: optionsTab.id };
    }

    // Open editor in a new tab
    case 'OPEN_EDITOR':
    case 'EDIT_MACRO': {
      const editorPayload = message.payload as { path?: string } | undefined;
      const editorUrl = chrome.runtime.getURL('editor.html') + (editorPayload?.path ? `?path=${encodeURIComponent(editorPayload.path)}` : '');
      const editorTab = await chrome.tabs.create({ url: editorUrl });
      return { success: true, tabId: editorTab.id };
    }

    // Settings operations (from options page)
    case 'SETTINGS_UPDATE': {
      const settingsPayload = message.payload;
      console.log('[iMacros] SETTINGS_UPDATE:', settingsPayload);
      try {
        await sendToNativeHostNoWait({
          type: 'settings_update',
          id: message.id || createMessageId(),
          timestamp: createTimestamp(),
          payload: settingsPayload,
        });
        return { success: true };
      } catch (error) {
        console.error('[iMacros] Failed to send settings to native host:', error);
        return { success: false, error: String(error) };
      }
    }

    case 'BROWSE_FOLDER': {
      const browsePayload = message.payload as { currentPath?: string };
      console.log('[iMacros] BROWSE_FOLDER:', browsePayload);
      try {
        const browseResponse = await sendToNativeHost({
          type: 'browse_folder',
          id: message.id || createMessageId(),
          timestamp: createTimestamp(),
          payload: { currentPath: browsePayload.currentPath || '' },
        });
        const resultPayload = browseResponse.payload as { path?: string } | undefined;
        return { success: true, path: resultPayload?.path || null };
      } catch (error) {
        console.error('[iMacros] Failed to browse folder:', error);
        return { success: false, error: String(error) };
      }
    }

    case 'GET_SETTINGS': {
      console.log('[iMacros] GET_SETTINGS');
      try {
        const getSettingsResponse = await sendToNativeHost({
          type: 'get_settings',
          id: message.id || createMessageId(),
          timestamp: createTimestamp(),
          payload: {},
        });
        return { success: true, settings: getSettingsResponse.payload };
      } catch (error) {
        console.error('[iMacros] Failed to get settings from native host:', error);
        return { success: false, error: String(error) };
      }
    }

    case 'GET_MACROS': {
      console.log('[iMacros] GET_MACROS request');
      try {
        const macrosResponse = await sendToNativeHost({
          type: 'get_macros',
          id: message.id || createMessageId(),
          timestamp: createTimestamp(),
          payload: {},
        });
        const macrosList = (macrosResponse.payload as { macros?: unknown[] })?.macros || [];
        // Convert to the format the panel expects (array of file paths)
        const files = macrosList.map((m: unknown) => (m as { path?: string })?.path || '');
        return { success: true, files };
      } catch (error) {
        console.error('[iMacros] Failed to get macros from native host:', error);
        return { success: false, error: String(error), files: [] };
      }
    }

    // Handle download URL requests from content scripts (EVENT:SAVETARGETAS)
    case 'DOWNLOAD_URL': {
      const downloadPayload = message.payload as { url: string; filename?: string } | undefined;
      const downloadUrl = downloadPayload?.url || (message as { url?: string }).url || '';
      const downloadFilename = downloadPayload?.filename || (message as { filename?: string }).filename || '';
      try {
        const downloadOptions: chrome.downloads.DownloadOptions = { url: downloadUrl };
        if (downloadFilename) {
          downloadOptions.filename = downloadFilename;
        }
        const downloadId = await new Promise<number>((resolve, reject) => {
          chrome.downloads.download(downloadOptions, (id) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(id);
            }
          });
        });
        return { success: true, downloadId };
      } catch (error) {
        console.error('[iMacros] Download error:', error);
        return { success: false, error: String(error) };
      }
    }

    default:
      console.warn('[iMacros] Unknown message type:', message.type);
      return { success: false, error: `Unknown message type: ${message.type}` };
  }
}

// ============================================================================
// Tab Event Listeners
// ============================================================================

/**
 * Helper to send tab event to content script during recording
 */
async function sendTabEventToContentScript(
  action: 'open' | 'close' | 'switch',
  tabIndex?: number,
  tabId?: number,
  url?: string
): Promise<void> {
  if (!isRecording || !recordingTabId) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(recordingTabId, {
      type: 'RECORD_TAB_EVENT',
      payload: {
        action,
        tabIndex,
        tabId,
        url,
      },
    });
    console.log('[iMacros] Tab event recorded:', action, tabIndex);
  } catch (error) {
    console.debug('[iMacros] Could not send tab event to content script:', error);
  }
}

/**
 * Track tab creation
 */
chrome.tabs.onCreated.addListener(async (tab) => {
  if (tab.id) {
    activeTabs.set(tab.id, {
      id: tab.id,
      url: tab.url,
      frameIds: new Set([0]),
    });
    console.log('[iMacros] Tab created:', tab.id);

    // Record TAB OPEN event if recording
    if (isRecording) {
      recordedCommands.push('TAB OPEN');
      await sendTabEventToContentScript('open', undefined, tab.id, tab.url);
    }
  }
});

/**
 * Track tab removal
 */
chrome.tabs.onRemoved.addListener(async (tabId) => {
  activeTabs.delete(tabId);
  console.log('[iMacros] Tab removed:', tabId);

  // Record TAB CLOSE event if recording (unless the recording tab was closed)
  if (isRecording && tabId !== recordingTabId) {
    recordedCommands.push('TAB CLOSE');
    await sendTabEventToContentScript('close', undefined, tabId);
  }

  // If the recording tab was closed, stop recording
  if (tabId === recordingTabId) {
    setRecordingState(false);
    console.log('[iMacros] Recording tab closed, stopping recording');
  }
});

/**
 * Track tab updates
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const tabInfo = activeTabs.get(tabId);
  if (tabInfo) {
    tabInfo.url = tab.url;
  } else if (tab.id) {
    activeTabs.set(tab.id, {
      id: tab.id,
      url: tab.url,
      frameIds: new Set([0]),
    });
  }
});

/**
 * Track tab activation (switching between tabs)
 */
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  console.log('[iMacros] Tab activated:', activeInfo.tabId);

  // Record TAB T=n event if recording
  if (isRecording && recordingTabId) {
    // Get the tab index (1-based for iMacros TAB T=n command)
    const tabs = await chrome.tabs.query({ windowId: activeInfo.windowId });
    const tabIndex = tabs.findIndex(t => t.id === activeInfo.tabId);

    if (tabIndex >= 0) {
      // TAB T=n is 1-based
      recordedCommands.push(`TAB T=${tabIndex + 1}`);
      await sendTabEventToContentScript('switch', tabIndex + 1, activeInfo.tabId);

      // Update recordingTabId to the new active tab so events are captured there
      recordingTabId = activeInfo.tabId;

      // Start recording in all frames of the new tab with the same config
      try {
        await sendToAllFramesInTab(activeInfo.tabId, {
          type: 'RECORD_START',
          payload: { config: activeRecordingConfig },
        });
      } catch {
        // Content script might not be ready yet, that's okay
      }
    }
  }
});

// ============================================================================
// Navigation Event Listeners (REFRESH, BACK, FORWARD)
// ============================================================================

/**
 * Helper to send navigation event to content script during recording
 */
async function sendNavigationEventToContentScript(
  action: 'refresh' | 'back' | 'forward',
  tabId: number
): Promise<void> {
  if (!isRecording || !recordingTabId) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(recordingTabId, {
      type: 'RECORD_NAVIGATION_EVENT',
      payload: {
        action,
        tabId,
      },
    });
    console.log('[iMacros] Navigation event recorded:', action);
  } catch (error) {
    console.debug('[iMacros] Could not send navigation event to content script:', error);
  }
}

/**
 * Track navigation events for recording REFRESH, BACK, FORWARD commands
 * Uses chrome.webNavigation.onCommitted to detect navigation type
 */
chrome.webNavigation.onCommitted.addListener(async (details) => {
  // Only track main frame navigations for the recording tab
  if (!isRecording || details.tabId !== recordingTabId || details.frameId !== 0) {
    return;
  }

  // Reset frame context on main frame navigation
  // (frames are reloaded, so we're back to main document)
  currentFrameContext = null;

  const { transitionType, transitionQualifiers } = details;

  console.log('[iMacros] Navigation committed:', transitionType, transitionQualifiers);

  // Detect reload (REFRESH command)
  if (transitionType === 'reload') {
    recordedCommands.push('REFRESH');
    await sendNavigationEventToContentScript('refresh', details.tabId);
    return;
  }

  // Detect back/forward navigation
  // transitionQualifiers includes 'forward_back' for both back and forward navigation
  if (transitionQualifiers.includes('forward_back')) {
    // Unfortunately, Chrome doesn't distinguish between back and forward in the API
    // We need to track history state to determine direction
    // For now, we'll record BACK as a default since it's more common
    // A more sophisticated implementation could track navigation history
    recordedCommands.push('BACK');
    await sendNavigationEventToContentScript('back', details.tabId);
    return;
  }

  // Detect new navigation (typed URL, link click handled by browser, etc.)
  if (transitionType === 'typed' || transitionType === 'auto_bookmark') {
    recordedCommands.push(`URL GOTO=${details.url}`);
  }
});

/**
 * Re-send RECORD_START to the new page's content script after same-tab navigation.
 * This ensures the content script on the new page records DOM events and sends them
 * to the background, even though the previous page's content script was destroyed.
 */
chrome.webNavigation.onCompleted.addListener(async (details) => {
  // Only handle main frame navigations in the recording tab
  if (!isRecording || details.tabId !== recordingTabId || details.frameId !== 0) {
    return;
  }

  if (!activeRecordingConfig) {
    return;
  }

  console.log('[iMacros] Navigation completed in recording tab, re-sending RECORD_START');

  try {
    await waitForContentScript(details.tabId);
    await sendToAllFramesInTab(details.tabId, {
      type: 'RECORD_START',
      payload: { config: activeRecordingConfig },
    });
    console.log('[iMacros] RECORD_START re-sent to recording tab after navigation');
  } catch (error) {
    console.warn('[iMacros] Could not re-send RECORD_START after navigation:', error);
  }
});

// ============================================================================
// External Connection Handler (for native host initiated connections)
// ============================================================================

chrome.runtime.onConnectExternal.addListener((port) => {
  console.log('[iMacros] External connection from:', port.name);

  port.onMessage.addListener(async (message) => {
    try {
      const result = await handleMessage(message, port.sender || {});
      port.postMessage(result);
    } catch (error) {
      port.postMessage({ success: false, error: String(error) });
    }
  });

  port.onDisconnect.addListener(() => {
    console.log('[iMacros] External connection closed:', port.name);
  });
});

// ============================================================================
// Download Recording Handler
// ============================================================================

/**
 * Set the recording state (called when recording starts/stops)
 */
function setRecordingState(recording: boolean, tabId?: number, config?: Record<string, unknown>): void {
  isRecording = recording;
  recordingTabId = recording ? (tabId ?? recordingTabId) : null;
  activeRecordingConfig = recording ? (config ?? activeRecordingConfig) : null;
  // Reset frame context when recording starts or stops
  currentFrameContext = null;
  // Clear accumulated commands when starting a new recording
  if (recording) {
    recordedCommands = [];
    recordingStartUrl = null;
  }
  console.log('[iMacros] Recording state:', recording, 'Tab:', recordingTabId);
}

/**
 * Listen for download events during recording
 * When a download starts, send a RECORD_DOWNLOAD message to the active tab's content script
 */
chrome.downloads.onCreated.addListener(async (downloadItem) => {
  if (!isRecording) {
    return;
  }

  console.log('[iMacros] Download detected during recording:', downloadItem);

  // Extract folder and filename from the download path
  const fullPath = downloadItem.filename || '';
  let folder = '*';
  let filename = '+';

  if (fullPath) {
    // Split the path to get folder and filename
    const lastSlash = Math.max(fullPath.lastIndexOf('/'), fullPath.lastIndexOf('\\'));
    if (lastSlash >= 0) {
      folder = fullPath.substring(0, lastSlash);
      filename = fullPath.substring(lastSlash + 1);
    } else {
      filename = fullPath;
    }
  }

  // Send download event to the active tab's content script
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id) {
      await chrome.tabs.sendMessage(activeTab.id, {
        type: 'RECORD_DOWNLOAD',
        payload: {
          folder,
          filename,
          url: downloadItem.url,
        },
      });
      console.log('[iMacros] Download event sent to content script');
    }
  } catch (error) {
    console.error('[iMacros] Failed to send download event to content script:', error);
  }
});

// ============================================================================
// Action Button Handler
// ============================================================================

/**
 * Handle action button click - open side panel
 */
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});

// ============================================================================
// Installation Handler
// ============================================================================

/**
 * Initialize on install
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[iMacros] Extension installed:', details.reason);

  // Enable side panel
  chrome.sidePanel.setOptions({
    enabled: true,
  });

  // Initialize web request handlers (ONLOGIN, FILTER)
  await initWebRequestHandlers();

  // Attempt initial connection to native host
  connectToNativeHost().catch((error) => {
    console.log('[iMacros] Initial native host connection failed (this is normal if host not installed):', error);
  });
});

/**
 * Handle startup
 */
chrome.runtime.onStartup.addListener(async () => {
  console.log('[iMacros] Extension startup');

  // Initialize web request handlers (ONLOGIN, FILTER)
  await initWebRequestHandlers();

  // Attempt to reconnect to native host
  connectToNativeHost().catch((error) => {
    console.log('[iMacros] Startup native host connection failed:', error);
  });
});

// ============================================================================
// Initialization
// ============================================================================

console.log('[iMacros] Background service worker loaded');

// Start keep-alive immediately
startKeepAlive();

// Initialize web request handlers on load (for service worker restarts)
initWebRequestHandlers().catch((error) => {
  console.error('[iMacros] Failed to initialize web request handlers:', error);
});
