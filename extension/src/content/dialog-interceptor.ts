/**
 * Dialog Interceptor for iMacros
 *
 * Injects a script into the page's MAIN WORLD to intercept
 * window.alert/confirm/prompt calls. Content scripts run in an
 * isolated world and cannot directly override these functions.
 *
 * Communication between main world and content script uses CustomEvents.
 */

import type {
  DialogButton,
  DialogConfig,
  DialogType,
} from '@shared/commands/dialogs';

/**
 * Dialog event reported to background/host
 */
export interface DialogEvent {
  /** Type of dialog */
  type: DialogType;
  /** Message shown in the dialog */
  message: string;
  /** Default value (for prompt dialogs) */
  defaultValue?: string;
  /** Timestamp when dialog was triggered */
  timestamp: number;
  /** URL of the page that triggered the dialog */
  url: string;
  /** Response that was returned */
  response: {
    /** Button that was clicked (or auto-clicked) */
    button: DialogButton;
    /** Value returned (for prompt dialogs) */
    value?: string;
  };
}

/**
 * Configuration for dialog interception
 */
export interface DialogInterceptorConfig {
  /** Whether interception is enabled */
  enabled: boolean;
  /** Button to auto-click for dialogs */
  button: DialogButton;
  /** Content to return for prompt dialogs */
  content?: string;
  /** Position counter for ONDIALOG POS parameter */
  pos: number;
}

/**
 * Callback for when a dialog is intercepted
 */
export type DialogEventCallback = (event: DialogEvent) => void;

/**
 * URL of the external script that runs in the main world.
 * We use an external file to avoid CSP issues with inline scripts.
 */
const MAIN_WORLD_SCRIPT_URL = chrome.runtime.getURL('dialog-interceptor-main.js');

/**
 * Whether the main world script has been injected
 */
let mainWorldScriptInjected = false;

/**
 * Callback for dialog events
 */
let eventCallback: DialogEventCallback | null = null;

/**
 * Current configuration (mirrored for status queries)
 */
let currentConfig: DialogInterceptorConfig = {
  enabled: false,
  button: 'OK',
  pos: 1,
};

/**
 * Inject the dialog interceptor script into the main world
 */
function injectMainWorldScript(): void {
  if (mainWorldScriptInjected) return;

  try {
    const script = document.createElement('script');
    script.src = MAIN_WORLD_SCRIPT_URL;
    script.onload = () => {
      script.remove(); // Clean up after loading
    };
    script.onerror = () => {
      console.error('[iMacros] Failed to load dialog interceptor script');
      script.remove();
    };
    (document.head || document.documentElement).appendChild(script);
    mainWorldScriptInjected = true;
  } catch (error) {
    console.error('[iMacros] Failed to inject dialog interceptor:', error);
  }
}

/**
 * Set up event listener for dialog events from main world
 */
function setupEventListener(): void {
  window.addEventListener('__imacros_dialog_event', ((event: CustomEvent) => {
    const detail = event.detail as DialogEvent;
    if (eventCallback) {
      try {
        eventCallback(detail);
      } catch (error) {
        console.error('[iMacros] Error in dialog event callback:', error);
      }
    }
  }) as EventListener);
}

/**
 * Dialog Interceptor class (wrapper for API compatibility)
 */
export class DialogInterceptor {
  private installed: boolean = false;

  constructor() {
    // Constructor doesn't need to do much - actual install happens in install()
  }

  /**
   * Install the dialog interceptor
   */
  install(): void {
    if (this.installed) return;

    injectMainWorldScript();
    setupEventListener();
    this.installed = true;
  }

  /**
   * Uninstall - not really possible once injected, but we can disable
   */
  uninstall(): void {
    // Send reset to disable interception
    window.dispatchEvent(new CustomEvent('__imacros_dialog_reset'));
    this.installed = false;
  }

  /**
   * Set the configuration for dialog handling
   */
  setConfig(config: Partial<DialogInterceptorConfig>): void {
    currentConfig = { ...currentConfig, ...config };
  }

  /**
   * Apply ONDIALOG configuration from command
   */
  applyDialogConfig(config: DialogConfig): void {
    currentConfig = {
      enabled: config.active,
      button: config.button,
      content: config.content,
      pos: config.pos,
    };

    // Send to main world
    window.dispatchEvent(new CustomEvent('__imacros_dialog_config', {
      detail: { config }
    }));
  }

  /**
   * Set the callback for dialog events
   */
  setEventCallback(callback: DialogEventCallback | null): void {
    eventCallback = callback;
  }

  /**
   * Get the current configuration
   */
  getConfig(): DialogInterceptorConfig {
    return { ...currentConfig };
  }

  /**
   * Reset the dialog counter
   */
  resetCounter(): void {
    window.dispatchEvent(new CustomEvent('__imacros_dialog_reset'));
  }

  /**
   * Check if interception is enabled
   */
  isEnabled(): boolean {
    return currentConfig.enabled;
  }

  /**
   * Check if interceptor is installed
   */
  isInstalled(): boolean {
    return this.installed;
  }

  // Legacy methods for compatibility
  callOriginalAlert(message: string): void {
    window.alert(message);
  }

  callOriginalConfirm(message: string): boolean {
    return window.confirm(message);
  }

  callOriginalPrompt(message: string, defaultValue?: string): string | null {
    return window.prompt(message, defaultValue);
  }
}

/**
 * Singleton instance of the dialog interceptor
 */
let interceptorInstance: DialogInterceptor | null = null;

/**
 * Get the dialog interceptor instance
 */
export function getDialogInterceptor(): DialogInterceptor {
  if (!interceptorInstance) {
    interceptorInstance = new DialogInterceptor();
  }
  return interceptorInstance;
}

/**
 * Initialize the dialog interceptor with messaging to background script
 */
export function initializeDialogInterceptor(): DialogInterceptor {
  const interceptor = getDialogInterceptor();

  // Set up event callback to send events to background script
  interceptor.setEventCallback((event: DialogEvent) => {
    try {
      // Send dialog event to background script
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'DIALOG_EVENT',
          payload: event,
          timestamp: Date.now(),
        }).catch((error: unknown) => {
          // Ignore errors if background script is not available
          console.debug('[iMacros] Could not send dialog event:', error);
        });
      }
    } catch (error) {
      console.debug('[iMacros] Error sending dialog event:', error);
    }
  });

  // Install the interceptor
  interceptor.install();

  return interceptor;
}

/**
 * Handle DIALOG_CONFIG messages from background script
 */
export function handleDialogConfigMessage(config: DialogConfig): void {
  const interceptor = getDialogInterceptor();
  interceptor.applyDialogConfig(config);
}

/**
 * Message listener for dialog configuration
 */
export function setupDialogMessageListener(): void {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) {
    return;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'DIALOG_CONFIG') {
      try {
        handleDialogConfigMessage(message.payload?.config);
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (message.type === 'DIALOG_RESET') {
      const interceptor = getDialogInterceptor();
      interceptor.resetCounter();
      interceptor.setConfig({ enabled: false });
      sendResponse({ success: true });
      return true;
    }

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

    return false;
  });
}

// Export types for external use
export type { DialogButton, DialogConfig, DialogType };
