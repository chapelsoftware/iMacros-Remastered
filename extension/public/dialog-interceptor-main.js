/**
 * Dialog Interceptor - Main World Script
 *
 * This script runs in the page's main world (not the content script's isolated world)
 * to intercept window.alert, window.confirm, and window.prompt calls.
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

  // Current configuration
  var config = {
    enabled: false,
    button: 'OK',
    content: undefined,
    pos: 1
  };

  // Dialog counter
  var dialogCounter = 0;

  // Check if we should auto-respond
  function shouldAutoRespond() {
    if (!config.enabled) return false;
    return dialogCounter <= config.pos;
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

  // Override alert
  window.alert = function(message) {
    dialogCounter++;
    var msg = String(message !== undefined ? message : '');

    if (shouldAutoRespond()) {
      reportDialogEvent('alert', msg, undefined, config.button, undefined);
      return; // Suppress the dialog
    }

    // Show original dialog
    originalAlert(msg);
    reportDialogEvent('alert', msg, undefined, 'OK', undefined);
  };

  // Override confirm
  window.confirm = function(message) {
    dialogCounter++;
    var msg = String(message !== undefined ? message : '');

    if (shouldAutoRespond()) {
      var result = config.button === 'OK' || config.button === 'YES';
      reportDialogEvent('confirm', msg, undefined, config.button, undefined);
      return result;
    }

    // Show original dialog
    var result = originalConfirm(msg);
    reportDialogEvent('confirm', msg, undefined, result ? 'OK' : 'CANCEL', undefined);
    return result;
  };

  // Override prompt
  window.prompt = function(message, defaultValue) {
    dialogCounter++;
    var msg = String(message !== undefined ? message : '');
    var defVal = defaultValue !== undefined ? String(defaultValue) : '';

    if (shouldAutoRespond()) {
      if (config.button === 'OK' || config.button === 'YES') {
        // Return configured content, or default value, or empty string
        var result = config.content !== undefined ? config.content : (defVal || '');
        reportDialogEvent('prompt', msg, defVal, config.button, result);
        return result;
      } else {
        // CANCEL or NO returns null
        reportDialogEvent('prompt', msg, defVal, config.button, undefined);
        return null;
      }
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
      config = {
        enabled: detail.config.active === true,
        button: detail.config.button || 'OK',
        content: detail.config.content,
        pos: detail.config.pos || 1
      };
      dialogCounter = 0;
    }
  });

  // Listen for reset command
  window.addEventListener('__imacros_dialog_reset', function() {
    config.enabled = false;
    dialogCounter = 0;
  });

  // Listen for status query
  window.addEventListener('__imacros_dialog_status_request', function() {
    window.dispatchEvent(new CustomEvent('__imacros_dialog_status_response', {
      detail: {
        installed: true,
        enabled: config.enabled,
        config: config
      }
    }));
  });
})();
