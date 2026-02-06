/**
 * Dialog Interceptor for iMacros
 *
 * Overrides window.alert/confirm/prompt to handle ONDIALOG command.
 * Auto-responds based on settings and reports dialog events to host.
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
 * Dialog Interceptor class
 * Manages interception of window.alert, window.confirm, and window.prompt
 */
export class DialogInterceptor {
  /** Original window.alert function */
  private originalAlert: typeof window.alert;

  /** Original window.confirm function */
  private originalConfirm: typeof window.confirm;

  /** Original window.prompt function */
  private originalPrompt: typeof window.prompt;

  /** Current configuration */
  private config: DialogInterceptorConfig = {
    enabled: false,
    button: 'OK',
    pos: 1,
  };

  /** Callback for dialog events */
  private eventCallback: DialogEventCallback | null = null;

  /** Counter for dialog occurrences */
  private dialogCounter: number = 0;

  /** Whether interceptor is currently installed */
  private installed: boolean = false;

  constructor() {
    // Store original functions
    this.originalAlert = window.alert.bind(window);
    this.originalConfirm = window.confirm.bind(window);
    this.originalPrompt = window.prompt.bind(window);
  }

  /**
   * Install the dialog interceptor
   */
  install(): void {
    if (this.installed) {
      return;
    }

    // Override window.alert
    window.alert = (message?: unknown): void => {
      this.handleAlert(String(message ?? ''));
    };

    // Override window.confirm
    window.confirm = (message?: string): boolean => {
      return this.handleConfirm(message ?? '');
    };

    // Override window.prompt
    window.prompt = (message?: string, defaultValue?: string): string | null => {
      return this.handlePrompt(message ?? '', defaultValue);
    };

    this.installed = true;
  }

  /**
   * Uninstall the dialog interceptor and restore original functions
   */
  uninstall(): void {
    if (!this.installed) {
      return;
    }

    window.alert = this.originalAlert;
    window.confirm = this.originalConfirm;
    window.prompt = this.originalPrompt;

    this.installed = false;
  }

  /**
   * Set the configuration for dialog handling
   */
  setConfig(config: Partial<DialogInterceptorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Apply ONDIALOG configuration from command
   */
  applyDialogConfig(config: DialogConfig): void {
    this.config = {
      enabled: config.active,
      button: config.button,
      content: config.content,
      pos: config.pos,
    };
    this.dialogCounter = 0;
  }

  /**
   * Set the callback for dialog events
   */
  setEventCallback(callback: DialogEventCallback | null): void {
    this.eventCallback = callback;
  }

  /**
   * Get the current configuration
   */
  getConfig(): DialogInterceptorConfig {
    return { ...this.config };
  }

  /**
   * Reset the dialog counter
   */
  resetCounter(): void {
    this.dialogCounter = 0;
  }

  /**
   * Check if interception is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Check if interceptor is installed
   */
  isInstalled(): boolean {
    return this.installed;
  }

  /**
   * Handle alert() calls
   */
  private handleAlert(message: string): void {
    this.dialogCounter++;

    const button = this.shouldAutoRespond() ? this.config.button : 'OK';

    // Report the dialog event
    this.reportDialogEvent({
      type: 'alert',
      message,
      timestamp: Date.now(),
      url: window.location.href,
      response: { button },
    });

    // If not auto-responding, call the original
    if (!this.shouldAutoRespond()) {
      this.originalAlert(message);
    }
    // For auto-response, alert just returns (user sees nothing)
  }

  /**
   * Handle confirm() calls
   */
  private handleConfirm(message: string): boolean {
    this.dialogCounter++;

    let result: boolean;
    let button: DialogButton;

    if (this.shouldAutoRespond()) {
      // Auto-respond based on configuration
      button = this.config.button;
      result = button === 'OK' || button === 'YES';
    } else {
      // Call original and determine button from result
      result = this.originalConfirm(message);
      button = result ? 'OK' : 'CANCEL';
    }

    // Report the dialog event
    this.reportDialogEvent({
      type: 'confirm',
      message,
      timestamp: Date.now(),
      url: window.location.href,
      response: { button },
    });

    return result;
  }

  /**
   * Handle prompt() calls
   */
  private handlePrompt(message: string, defaultValue?: string): string | null {
    this.dialogCounter++;

    let result: string | null;
    let button: DialogButton;

    if (this.shouldAutoRespond()) {
      // Auto-respond based on configuration
      button = this.config.button;

      if (button === 'OK' || button === 'YES') {
        // Return configured content, or default value, or empty string
        result = this.config.content ?? defaultValue ?? '';
      } else {
        // CANCEL or NO returns null
        result = null;
      }
    } else {
      // Call original
      result = this.originalPrompt(message, defaultValue);
      button = result !== null ? 'OK' : 'CANCEL';
    }

    // Report the dialog event
    this.reportDialogEvent({
      type: 'prompt',
      message,
      defaultValue,
      timestamp: Date.now(),
      url: window.location.href,
      response: {
        button,
        value: result ?? undefined,
      },
    });

    return result;
  }

  /**
   * Check if we should auto-respond to dialogs
   */
  private shouldAutoRespond(): boolean {
    if (!this.config.enabled) {
      return false;
    }

    // Check if we've reached the configured POS
    // POS=1 means respond to 1st dialog, POS=2 means 2nd, etc.
    return this.dialogCounter <= this.config.pos;
  }

  /**
   * Report a dialog event to the callback
   */
  private reportDialogEvent(event: DialogEvent): void {
    if (this.eventCallback) {
      try {
        this.eventCallback(event);
      } catch (error) {
        console.error('[iMacros] Error in dialog event callback:', error);
      }
    }
  }

  /**
   * Call the original alert function
   */
  callOriginalAlert(message: string): void {
    this.originalAlert(message);
  }

  /**
   * Call the original confirm function
   */
  callOriginalConfirm(message: string): boolean {
    return this.originalConfirm(message);
  }

  /**
   * Call the original prompt function
   */
  callOriginalPrompt(message: string, defaultValue?: string): string | null {
    return this.originalPrompt(message, defaultValue);
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
