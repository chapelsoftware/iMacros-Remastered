/**
 * Dialog Interceptor - Main World Script
 *
 * This script runs in the page's main world (not the content script's isolated world)
 * to intercept window.alert, window.confirm, and window.prompt calls.
 *
 * Uses a queue-based consumption pattern matching iMacros v8.9.7:
 * - ONDIALOG POS=N stores config at index N in the queue
 * - When a dialog appears, the first entry is shifted from the queue
 * - Only OK/YES = accept; NO/CANCEL/anything else = cancel
 * - Unhandled dialogs (empty queue) report error -1450
 *
 * Communication with the content script happens via CustomEvents.
 */
(function() {
  'use strict';

  // Prevent double-injection
  if (window.__imacrosDialogInterceptorInstalled) return;
  window.__imacrosDialogInterceptorInstalled = true;

  // Store original functions
  var originalAlert = window.alert.bind(window);
  var originalConfirm = window.confirm.bind(window);
  var originalPrompt = window.prompt.bind(window);

  // Dialog config queue - array indexed by POS (1-based, stored at index POS-1)
  var dialogQueue = [];

  // Whether dialog interception is enabled
  var enabled = false;

  // Error dialog configuration
  var errorConfig = {
    stopOnError: false
  };

  // Store original window.onerror
  var originalOnError = window.onerror;

  // Consume the next config from the queue (shift from front)
  function consumeNextConfig() {
    if (dialogQueue.length === 0) return null;
    return dialogQueue.shift();
  }

  // Check if interception is active and queue has entries
  function shouldAutoRespond() {
    return enabled && dialogQueue.length > 0;
  }

  // Check if button means "accept" (only OK/YES)
  function isAcceptButton(button) {
    return button === 'OK' || button === 'YES';
  }

  // Report dialog event to content script
  function reportDialogEvent(type, message, defaultValue, button, value) {
    window.dispatchEvent(new CustomEvent('__imacros_dialog_event', {
      detail: {
        type: type,
        message: message,
        defaultValue: defaultValue,
        timestamp: Date.now(),
        url: window.location.href,
        response: { button: button, value: value }
      }
    }));
  }

  // Report unhandled dialog (error -1450)
  function reportUnhandledDialog(type, message) {
    window.dispatchEvent(new CustomEvent('__imacros_dialog_event', {
      detail: {
        type: type,
        message: message,
        defaultValue: undefined,
        timestamp: Date.now(),
        url: window.location.href,
        unhandled: true,
        response: { button: 'CANCEL', value: undefined }
      }
    }));
  }

  // Override alert
  window.alert = function(message) {
    var msg = String(message !== undefined ? message : '');

    if (enabled) {
      var cfg = consumeNextConfig();
      if (cfg) {
        reportDialogEvent('alert', msg, undefined, cfg.button, undefined);
        return; // Suppress the dialog
      }
      // No config in queue - unhandled dialog
      reportUnhandledDialog('alert', msg);
      return;
    }

    // Show original dialog
    originalAlert(msg);
    reportDialogEvent('alert', msg, undefined, 'OK', undefined);
  };

  // Override confirm
  window.confirm = function(message) {
    var msg = String(message !== undefined ? message : '');

    if (enabled) {
      var cfg = consumeNextConfig();
      if (cfg) {
        var result = isAcceptButton(cfg.button);
        reportDialogEvent('confirm', msg, undefined, cfg.button, undefined);
        return result;
      }
      // No config in queue - unhandled dialog
      reportUnhandledDialog('confirm', msg);
      return false;
    }

    // Show original dialog
    var result = originalConfirm(msg);
    reportDialogEvent('confirm', msg, undefined, result ? 'OK' : 'CANCEL', undefined);
    return result;
  };

  // Override prompt
  window.prompt = function(message, defaultValue) {
    var msg = String(message !== undefined ? message : '');
    var defVal = defaultValue !== undefined ? String(defaultValue) : '';

    if (enabled) {
      var cfg = consumeNextConfig();
      if (cfg) {
        if (isAcceptButton(cfg.button)) {
          // Return configured content, or default value, or empty string
          var result = cfg.content !== undefined ? cfg.content : (defVal || '');
          reportDialogEvent('prompt', msg, defVal, cfg.button, result);
          return result;
        } else {
          // CANCEL or NO returns null
          reportDialogEvent('prompt', msg, defVal, cfg.button, undefined);
          return null;
        }
      }
      // No config in queue - unhandled dialog
      reportUnhandledDialog('prompt', msg);
      return null;
    }

    // Show original dialog
    var result = originalPrompt(msg, defVal);
    reportDialogEvent('prompt', msg, defVal, result !== null ? 'OK' : 'CANCEL', result);
    return result;
  };

  // Listen for configuration updates from content script
  window.addEventListener('__imacros_dialog_config', function(event) {
    var detail = event.detail;
    if (detail && detail.config) {
      var cfg = {
        button: detail.config.button || 'CANCEL',
        content: detail.config.content,
        pos: detail.config.pos || 1,
        timeout: detail.config.timeout
      };

      if (detail.append) {
        // Queue mode: insert at POS index (1-based, so POS-1 for array)
        var idx = cfg.pos - 1;
        // Ensure array is large enough
        while (dialogQueue.length < idx) {
          dialogQueue.push(null);
        }
        // Insert or replace at the POS index
        dialogQueue[idx] = cfg;
      } else {
        // Replace mode: clear queue and set single config
        dialogQueue = [cfg];
      }

      enabled = detail.config.active === true;
    }
  });

  // Listen for reset command
  window.addEventListener('__imacros_dialog_reset', function() {
    enabled = false;
    dialogQueue = [];
  });

  // Listen for status query
  window.addEventListener('__imacros_dialog_status_request', function() {
    window.dispatchEvent(new CustomEvent('__imacros_dialog_status_response', {
      detail: {
        installed: true,
        enabled: enabled,
        queueLength: dialogQueue.length,
        config: dialogQueue.length > 0 ? dialogQueue[0] : null
      }
    }));
  });

  // Listen for error dialog configuration (ONERRORDIALOG CONTINUE=NO/FALSE)
  window.addEventListener('__imacros_error_dialog_config', function(event) {
    var detail = event.detail;
    if (detail) {
      errorConfig.stopOnError = detail.stopOnError === true;
    }
  });

  // Listen for error dialog reset
  window.addEventListener('__imacros_error_dialog_reset', function() {
    errorConfig.stopOnError = false;
  });

  // Intercept JavaScript errors (iMacros v8.9.7 onErrorOccurred behavior)
  window.onerror = function(msg, url, line) {
    // Call original handler if it existed
    if (typeof originalOnError === 'function') {
      originalOnError(msg, url, line);
    }

    // If stopOnError is active, report the JS error to content script
    if (errorConfig.stopOnError) {
      window.dispatchEvent(new CustomEvent('__imacros_js_error', {
        detail: {
          message: String(msg),
          url: String(url || ''),
          line: Number(line) || 0,
          timestamp: Date.now()
        }
      }));
    }
  };
})();
