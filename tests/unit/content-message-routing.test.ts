/**
 * Content Script Message Routing Unit Tests
 *
 * Tests for extension/src/content.ts covering:
 * - PING response
 * - DIALOG_CONFIG routing to dialog-interceptor
 * - DIALOG_RESET routing
 * - ERROR_DIALOG_CONFIG routing
 * - DIALOG_STATUS query
 * - SELECT_FRAME / SELECT_FRAME_BY_NAME routing
 * - RECORD_START / RECORD_STOP / RECORD_STATUS routing
 * - RECORD_CLEAR / RECORD_GET_MACRO routing
 * - RECORD_TAB_EVENT / RECORD_NAVIGATION_EVENT routing
 * - RECORD_DOWNLOAD routing
 * - Page communication (CustomEvent bridge)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';

// Use vi.hoisted to set up globals BEFORE content.ts module loads
const { messageListenerRef } = vi.hoisted(() => {
  // DOM polyfill
  const { JSDOM } = require('jsdom');
  const _polyfillDom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  if (typeof globalThis.document === 'undefined') {
    (globalThis as any).document = _polyfillDom.window.document;
  }
  if (typeof globalThis.window === 'undefined') {
    (globalThis as any).window = _polyfillDom.window;
  }
  if (typeof globalThis.CustomEvent === 'undefined') {
    (globalThis as any).CustomEvent = _polyfillDom.window.CustomEvent;
  }
  if (typeof globalThis.Event === 'undefined') {
    (globalThis as any).Event = _polyfillDom.window.Event;
  }

  // Chrome mock
  const ref = { current: null as Function | null };
  (globalThis as any).chrome = {
    runtime: {
      sendMessage: vi.fn((_msg: any, callback?: Function) => {
        if (callback) callback({ success: true });
      }),
      onMessage: {
        addListener: vi.fn((listener: any) => {
          ref.current = listener;
        }),
      },
      lastError: null,
    },
  };
  return { messageListenerRef: ref };
});

// vi.mock factories are hoisted - they cannot reference variables declared in the test file.
// Use vi.hoisted() to create mock functions that are available in vi.mock factories.
const {
  mockHandleDialogConfigMessage,
  mockHandleErrorDialogConfigMessage,
  mockDialogInterceptor,
  mockInitializeDialogInterceptor,
  mockMacroRecorder,
  mockGetMacroRecorder,
  mockHandleRecordStartMessage,
  mockHandleRecordStopMessage,
  mockHandleRecordStatusMessage,
  mockInitializeMacroRecorder,
  mockInitializeDOMExecutor,
  mockFrameHandler,
  mockGetFrameHandler,
  mockInitializeFrameHandler,
} = vi.hoisted(() => {
  const _mockDialogInterceptor = {
    resetCounter: vi.fn(),
    resetErrorDialogConfig: vi.fn(),
    setConfig: vi.fn(),
    isInstalled: vi.fn(() => true),
    isEnabled: vi.fn(() => false),
    getConfig: vi.fn(() => ({ enabled: false })),
  };
  const _mockMacroRecorder = {
    isRecording: vi.fn(() => true),
    clearEvents: vi.fn(),
    generateMacro: vi.fn(() => 'VERSION BUILD=1\nURL GOTO=https://example.com'),
    recordTabEvent: vi.fn(),
  };
  const _mockFrameHandler = {
    selectFrameByIndex: vi.fn(() => ({ success: true })),
    selectFrameByName: vi.fn(() => ({ success: true })),
    getCurrentFrameIndex: vi.fn(() => 1),
  };
  return {
    mockHandleDialogConfigMessage: vi.fn(),
    mockHandleErrorDialogConfigMessage: vi.fn(),
    mockDialogInterceptor: _mockDialogInterceptor,
    mockInitializeDialogInterceptor: vi.fn(),
    mockMacroRecorder: _mockMacroRecorder,
    mockGetMacroRecorder: vi.fn(() => _mockMacroRecorder),
    mockHandleRecordStartMessage: vi.fn(),
    mockHandleRecordStopMessage: vi.fn(() => ({ macro: 'test', events: [] })),
    mockHandleRecordStatusMessage: vi.fn(() => ({ recording: true, eventCount: 5 })),
    mockInitializeMacroRecorder: vi.fn(),
    mockInitializeDOMExecutor: vi.fn(),
    mockFrameHandler: _mockFrameHandler,
    mockGetFrameHandler: vi.fn(() => _mockFrameHandler),
    mockInitializeFrameHandler: vi.fn(),
  };
});

vi.mock('@extension/content/dialog-interceptor', () => ({
  initializeDialogInterceptor: mockInitializeDialogInterceptor,
  handleDialogConfigMessage: mockHandleDialogConfigMessage,
  handleErrorDialogConfigMessage: mockHandleErrorDialogConfigMessage,
  getDialogInterceptor: () => mockDialogInterceptor,
}));

vi.mock('@extension/content/macro-recorder', () => ({
  initializeMacroRecorder: mockInitializeMacroRecorder,
  getMacroRecorder: mockGetMacroRecorder,
  handleRecordStartMessage: mockHandleRecordStartMessage,
  handleRecordStopMessage: mockHandleRecordStopMessage,
  handleRecordStatusMessage: mockHandleRecordStatusMessage,
}));

vi.mock('@extension/content/dom-executor', () => ({
  initializeDOMExecutor: mockInitializeDOMExecutor,
}));

vi.mock('@extension/content/frame-handler', () => ({
  initializeFrameHandler: mockInitializeFrameHandler,
  getFrameHandler: mockGetFrameHandler,
}));

// Import the content script (side-effect: registers listener)
import '@extension/content.ts';

describe('Content Script Message Routing', () => {
  const sender = { tab: { id: 1 }, frameId: 0 };

  beforeEach(() => {
    // Reset mocks but preserve initialization call history for the Initialization suite
    mockHandleDialogConfigMessage.mockClear();
    mockHandleErrorDialogConfigMessage.mockClear();
    mockDialogInterceptor.resetCounter.mockClear();
    mockDialogInterceptor.resetErrorDialogConfig.mockClear();
    mockDialogInterceptor.setConfig.mockClear();
    mockDialogInterceptor.isInstalled.mockClear().mockReturnValue(true);
    mockDialogInterceptor.isEnabled.mockClear().mockReturnValue(false);
    mockDialogInterceptor.getConfig.mockClear().mockReturnValue({ enabled: false });
    mockMacroRecorder.isRecording.mockClear().mockReturnValue(true);
    mockMacroRecorder.clearEvents.mockClear();
    mockMacroRecorder.generateMacro.mockClear().mockReturnValue('VERSION BUILD=1\nURL GOTO=https://example.com');
    mockMacroRecorder.recordTabEvent.mockClear();
    mockGetMacroRecorder.mockClear().mockReturnValue(mockMacroRecorder);
    mockHandleRecordStartMessage.mockClear();
    mockHandleRecordStopMessage.mockClear().mockReturnValue({ macro: 'test', events: [] });
    mockHandleRecordStatusMessage.mockClear().mockReturnValue({ recording: true, eventCount: 5 });
    mockFrameHandler.selectFrameByIndex.mockClear().mockReturnValue({ success: true });
    mockFrameHandler.selectFrameByName.mockClear().mockReturnValue({ success: true });
    mockFrameHandler.getCurrentFrameIndex.mockClear().mockReturnValue(1);
    mockGetFrameHandler.mockClear().mockReturnValue(mockFrameHandler);
  });

  /**
   * Helper: send a message and capture the sendResponse value
   */
  function sendMessage(message: any): Promise<any> {
    return new Promise((resolve) => {
      if (!messageListenerRef.current) {
        throw new Error('Message listener not registered');
      }
      messageListenerRef.current(message, sender, resolve);
    });
  }

  // ===== Initialization =====

  describe('Initialization', () => {
    it('should register message listener', () => {
      expect(messageListenerRef.current).not.toBeNull();
    });

    it('should respond to PING (proves content script loaded)', async () => {
      const response = await sendMessage({ type: 'PING' });
      expect(response).toEqual({ ready: true });
    });
  });

  // ===== PING =====

  describe('PING', () => {
    it('should respond with ready: true', async () => {
      const response = await sendMessage({ type: 'PING' });
      expect(response).toEqual({ ready: true });
    });
  });

  // ===== Dialog Messages =====

  describe('Dialog Messages', () => {
    it('should handle DIALOG_CONFIG', async () => {
      const config = { enabled: true, button: 'OK' };
      const response = await sendMessage({ type: 'DIALOG_CONFIG', payload: { config } });
      expect(response).toEqual({ success: true });
      expect(mockHandleDialogConfigMessage).toHaveBeenCalledWith(config);
    });

    it('should handle DIALOG_RESET', async () => {
      const response = await sendMessage({ type: 'DIALOG_RESET' });
      expect(response).toEqual({ success: true });
      expect(mockDialogInterceptor.resetCounter).toHaveBeenCalled();
      expect(mockDialogInterceptor.resetErrorDialogConfig).toHaveBeenCalled();
      expect(mockDialogInterceptor.setConfig).toHaveBeenCalledWith({ enabled: false });
    });

    it('should handle ERROR_DIALOG_CONFIG', async () => {
      const config = { mode: 'ignore' };
      const response = await sendMessage({ type: 'ERROR_DIALOG_CONFIG', payload: { config } });
      expect(response).toEqual({ success: true });
      expect(mockHandleErrorDialogConfigMessage).toHaveBeenCalledWith(config);
    });

    it('should handle DIALOG_STATUS', async () => {
      const response = await sendMessage({ type: 'DIALOG_STATUS' });
      expect(response.success).toBe(true);
      expect(response.installed).toBe(true);
      expect(response.enabled).toBe(false);
    });
  });

  // ===== Frame Selection =====

  describe('Frame Selection', () => {
    it('should handle SELECT_FRAME', async () => {
      const response = await sendMessage({ type: 'SELECT_FRAME', frameIndex: 2 });
      expect(response.success).toBe(true);
      expect(mockFrameHandler.selectFrameByIndex).toHaveBeenCalledWith(2);
    });

    it('should handle SELECT_FRAME_BY_NAME', async () => {
      const response = await sendMessage({ type: 'SELECT_FRAME_BY_NAME', frameName: 'myframe' });
      expect(response.success).toBe(true);
      expect(mockFrameHandler.selectFrameByName).toHaveBeenCalledWith('myframe');
    });

    it('should return error on failed frame selection', async () => {
      mockFrameHandler.selectFrameByIndex.mockReturnValue({
        success: false,
        errorMessage: 'Frame not found',
      });
      const response = await sendMessage({ type: 'SELECT_FRAME', frameIndex: 99 });
      expect(response.success).toBe(false);
      expect(response.error).toBe('Frame not found');
    });
  });

  // ===== Recording Messages =====

  describe('Recording Messages', () => {
    it('should handle RECORD_START', async () => {
      const config = { recordClicks: true };
      const response = await sendMessage({ type: 'RECORD_START', payload: { config } });
      expect(response).toEqual({ success: true });
      expect(mockHandleRecordStartMessage).toHaveBeenCalledWith(config);
    });

    it('should handle RECORD_STOP', async () => {
      const response = await sendMessage({ type: 'RECORD_STOP' });
      expect(response.success).toBe(true);
      expect(mockHandleRecordStopMessage).toHaveBeenCalled();
    });

    it('should handle RECORD_STATUS', async () => {
      const response = await sendMessage({ type: 'RECORD_STATUS' });
      expect(response.success).toBe(true);
      expect(response.recording).toBe(true);
      expect(response.eventCount).toBe(5);
    });

    it('should handle RECORD_CLEAR', async () => {
      const response = await sendMessage({ type: 'RECORD_CLEAR' });
      expect(response).toEqual({ success: true });
      expect(mockMacroRecorder.clearEvents).toHaveBeenCalled();
    });

    it('should handle RECORD_GET_MACRO', async () => {
      const response = await sendMessage({ type: 'RECORD_GET_MACRO' });
      expect(response.success).toBe(true);
      expect(response.macro).toContain('VERSION BUILD=1');
    });
  });

  // ===== Tab Event Recording =====

  describe('Tab Event Recording', () => {
    it('should record TAB OPEN event', async () => {
      const response = await sendMessage({
        type: 'RECORD_TAB_EVENT',
        payload: { action: 'open' },
      });
      expect(response).toEqual({ success: true });
      expect(mockMacroRecorder.recordTabEvent).toHaveBeenCalledWith('TAB OPEN');
    });

    it('should record TAB CLOSE event', async () => {
      const response = await sendMessage({
        type: 'RECORD_TAB_EVENT',
        payload: { action: 'close' },
      });
      expect(response).toEqual({ success: true });
      expect(mockMacroRecorder.recordTabEvent).toHaveBeenCalledWith('TAB CLOSE');
    });

    it('should record TAB T=n switch event', async () => {
      const response = await sendMessage({
        type: 'RECORD_TAB_EVENT',
        payload: { action: 'switch', tabIndex: 3 },
      });
      expect(response).toEqual({ success: true });
      expect(mockMacroRecorder.recordTabEvent).toHaveBeenCalledWith('TAB T=3');
    });

    it('should fail if not recording', async () => {
      mockMacroRecorder.isRecording.mockReturnValue(false);
      const response = await sendMessage({
        type: 'RECORD_TAB_EVENT',
        payload: { action: 'open' },
      });
      expect(response.success).toBe(false);
      expect(response.error).toBe('Not recording');
    });
  });

  // ===== Navigation Event Recording =====

  describe('Navigation Event Recording', () => {
    it('should record REFRESH', async () => {
      const response = await sendMessage({
        type: 'RECORD_NAVIGATION_EVENT',
        payload: { action: 'refresh' },
      });
      expect(response).toEqual({ success: true });
      expect(mockMacroRecorder.recordTabEvent).toHaveBeenCalledWith('REFRESH');
    });

    it('should record BACK', async () => {
      const response = await sendMessage({
        type: 'RECORD_NAVIGATION_EVENT',
        payload: { action: 'back' },
      });
      expect(response).toEqual({ success: true });
      expect(mockMacroRecorder.recordTabEvent).toHaveBeenCalledWith('BACK');
    });

    it('should record forward as BACK BACK=NO', async () => {
      const response = await sendMessage({
        type: 'RECORD_NAVIGATION_EVENT',
        payload: { action: 'forward' },
      });
      expect(response).toEqual({ success: true });
      expect(mockMacroRecorder.recordTabEvent).toHaveBeenCalledWith('BACK BACK=NO');
    });

    it('should fail if not recording', async () => {
      mockMacroRecorder.isRecording.mockReturnValue(false);
      const response = await sendMessage({
        type: 'RECORD_NAVIGATION_EVENT',
        payload: { action: 'refresh' },
      });
      expect(response.success).toBe(false);
    });
  });

  // ===== Download Recording =====

  describe('Download Recording', () => {
    it('should record ONDOWNLOAD command', async () => {
      const response = await sendMessage({
        type: 'RECORD_DOWNLOAD',
        payload: { folder: '/downloads', filename: 'file.zip', url: 'https://example.com/file.zip' },
      });
      expect(response).toEqual({ success: true });
      expect(mockMacroRecorder.recordTabEvent).toHaveBeenCalledWith(
        'ONDOWNLOAD FOLDER=/downloads FILE=file.zip WAIT=YES',
      );
    });

    it('should fail if not recording', async () => {
      mockMacroRecorder.isRecording.mockReturnValue(false);
      const response = await sendMessage({
        type: 'RECORD_DOWNLOAD',
        payload: { folder: '*', filename: '+' },
      });
      expect(response.success).toBe(false);
    });
  });
});
