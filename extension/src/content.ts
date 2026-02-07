/**
 * Extension content script - runs in web page context
 */
// Inlined to avoid @shared chunk import — content scripts can't use ESM imports
function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
function createTimestamp(): number {
  return Date.now();
}
import {
  initializeDialogInterceptor,
  setupDialogMessageListener,
  handleDialogConfigMessage,
  getDialogInterceptor,
} from './content/dialog-interceptor';
import {
  initializeMacroRecorder,
  setupRecordingMessageListener,
  getMacroRecorder,
  handleRecordStartMessage,
  handleRecordStopMessage,
  handleRecordStatusMessage,
} from './content/macro-recorder';
import { initializeDOMExecutor } from './content/dom-executor';
import { initializeFrameHandler, getFrameHandler } from './content/frame-handler';

/**
 * Send a message to the background script
 */
function sendToBackground(type: string, payload?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type,
        id: createMessageId(),
        timestamp: createTimestamp(),
        payload,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      }
    );
  });
}

/**
 * Listen for messages from the background script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Content script readiness check
  if (message.type === 'PING') {
    sendResponse({ ready: true });
    return true;
  }

  console.log('Content script received message:', message);

  // Handle dialog configuration messages
  if (message.type === 'DIALOG_CONFIG') {
    try {
      handleDialogConfigMessage(message.payload?.config);
      sendResponse({ success: true });
    } catch (error) {
      sendResponse({ success: false, error: String(error) });
    }
    return true;
  }

  // Handle dialog reset
  if (message.type === 'DIALOG_RESET') {
    const interceptor = getDialogInterceptor();
    interceptor.resetCounter();
    interceptor.setConfig({ enabled: false });
    sendResponse({ success: true });
    return true;
  }

  // Handle dialog status query
  if (message.type === 'DIALOG_STATUS') {
    const interceptor = getDialogInterceptor();
    sendResponse({
      success: true,
      installed: interceptor.isInstalled(),
      enabled: interceptor.isEnabled(),
      config: interceptor.getConfig(),
    });
    return true;
  }

  // Handle frame selection commands from background
  if (message.type === 'SELECT_FRAME') {
    const handler = getFrameHandler();
    const result = handler.selectFrameByIndex(message.frameIndex);
    sendResponse({
      success: result.success,
      error: result.errorMessage,
      frameId: result.success ? handler.getCurrentFrameIndex() : undefined,
    });
    return true;
  }

  if (message.type === 'SELECT_FRAME_BY_NAME') {
    const handler = getFrameHandler();
    const result = handler.selectFrameByName(message.frameName);
    sendResponse({
      success: result.success,
      error: result.errorMessage,
      frameId: result.success ? handler.getCurrentFrameIndex() : undefined,
    });
    return true;
  }

  // Handle recording messages directly
  if (message.type === 'RECORD_START') {
    try {
      handleRecordStartMessage(message.payload?.config);
      sendResponse({ success: true });
    } catch (error) {
      sendResponse({ success: false, error: String(error) });
    }
    return true;
  }

  if (message.type === 'RECORD_STOP') {
    try {
      const result = handleRecordStopMessage();
      sendResponse({ success: true, ...result });
    } catch (error) {
      sendResponse({ success: false, error: String(error) });
    }
    return true;
  }

  if (message.type === 'RECORD_STATUS') {
    try {
      const status = handleRecordStatusMessage();
      sendResponse({ success: true, ...status });
    } catch (error) {
      sendResponse({ success: false, error: String(error) });
    }
    return true;
  }

  if (message.type === 'RECORD_CLEAR') {
    try {
      const recorder = getMacroRecorder();
      recorder.clearEvents();
      sendResponse({ success: true });
    } catch (error) {
      sendResponse({ success: false, error: String(error) });
    }
    return true;
  }

  if (message.type === 'RECORD_GET_MACRO') {
    try {
      const recorder = getMacroRecorder();
      const macro = recorder.generateMacro();
      sendResponse({ success: true, macro });
    } catch (error) {
      sendResponse({ success: false, error: String(error) });
    }
    return true;
  }

  if (message.type === 'RECORD_TAB_EVENT') {
    try {
      const recorder = getMacroRecorder();
      if (!recorder.isRecording()) {
        sendResponse({ success: false, error: 'Not recording' });
        return true;
      }
      const payload = message.payload as { action: 'open' | 'close' | 'switch'; tabIndex?: number };
      let command = '';
      switch (payload.action) {
        case 'open': command = 'TAB OPEN'; break;
        case 'close': command = 'TAB CLOSE'; break;
        case 'switch': if (payload.tabIndex !== undefined) command = `TAB T=${payload.tabIndex}`; break;
      }
      if (command) {
        recorder.recordTabEvent(command);
      }
      sendResponse({ success: true });
    } catch (error) {
      sendResponse({ success: false, error: String(error) });
    }
    return true;
  }

  if (message.type === 'RECORD_NAVIGATION_EVENT') {
    try {
      const recorder = getMacroRecorder();
      if (!recorder.isRecording()) {
        sendResponse({ success: false, error: 'Not recording' });
        return true;
      }
      const payload = message.payload as { action: 'refresh' | 'back' | 'forward' };
      let command = '';
      switch (payload.action) {
        case 'refresh': command = 'REFRESH'; break;
        case 'back': command = 'BACK'; break;
        case 'forward': command = 'BACK BACK=NO'; break;
      }
      if (command) {
        recorder.recordTabEvent(command);
      }
      sendResponse({ success: true });
    } catch (error) {
      sendResponse({ success: false, error: String(error) });
    }
    return true;
  }

  // Let other listeners (DOM executor) handle unrecognized messages
  return false;
});

/**
 * Inject a custom event listener for page communication
 */
function setupPageCommunication(): void {
  window.addEventListener('imacros-request', ((event: CustomEvent) => {
    const { detail } = event;
    sendToBackground('execute', detail)
      .then((response) => {
        window.dispatchEvent(
          new CustomEvent('imacros-response', { detail: response })
        );
      })
      .catch((error) => {
        window.dispatchEvent(
          new CustomEvent('imacros-response', {
            detail: { error: error.message },
          })
        );
      });
  }) as EventListener);
}

// Initialize content script
setupPageCommunication();

// Initialize dialog interceptor
initializeDialogInterceptor();
setupDialogMessageListener();

// Initialize macro recorder
initializeMacroRecorder();
setupRecordingMessageListener();

// Initialize DOM executor for TAG, CLICK, EVENT commands
initializeDOMExecutor();

// Initialize frame handler for FRAME F=n, FRAME NAME=name commands
initializeFrameHandler();

console.log('iMacros content script loaded');
