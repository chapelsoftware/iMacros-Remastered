import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';

// Create JSDOM environment before importing modules
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="editor-container"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});

// Set up globals
(globalThis as any).document = dom.window.document;
(globalThis as any).window = dom.window;
(globalThis as any).HTMLElement = dom.window.HTMLElement;
(globalThis as any).Element = dom.window.Element;
(globalThis as any).Node = dom.window.Node;
(globalThis as any).getComputedStyle = dom.window.getComputedStyle;
(globalThis as any).DOMRect = dom.window.DOMRect || class DOMRect {
  constructor(public x = 0, public y = 0, public width = 0, public height = 0) {}
  get left() { return this.x; }
  get top() { return this.y; }
  get right() { return this.x + this.width; }
  get bottom() { return this.y + this.height; }
  toJSON() { return { x: this.x, y: this.y, width: this.width, height: this.height }; }
};

// Mock chrome API
(globalThis as any).chrome = {
  runtime: {
    sendMessage: vi.fn(() => Promise.resolve({ success: true })),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    lastError: null,
  },
};

// Mock EditorView for CodeMirror
vi.mock('codemirror', () => ({
  EditorView: vi.fn().mockImplementation(() => ({
    state: {
      doc: {
        toString: () => '',
        lines: 10,
        line: (n: number) => ({ from: (n - 1) * 10, to: n * 10, text: 'line ' + n }),
        length: 100,
      },
    },
    dispatch: vi.fn(),
    dom: document.createElement('div'),
    destroy: vi.fn(),
  })),
  basicSetup: [],
}));

vi.mock('@codemirror/state', () => ({
  EditorState: {
    create: vi.fn(() => ({})),
  },
  Compartment: vi.fn(() => ({
    of: vi.fn(() => []),
  })),
  StateField: {
    define: vi.fn(() => ({})),
  },
  StateEffect: {
    define: vi.fn(() => ({
      of: vi.fn((v) => ({ value: v })),
    })),
  },
}));

vi.mock('@codemirror/view', () => ({
  keymap: { of: vi.fn(() => []) },
  EditorView: {
    decorations: { from: vi.fn(() => []) },
    theme: vi.fn(() => []),
    baseTheme: vi.fn(() => []),
    updateListener: { of: vi.fn(() => []) },
  },
  Decoration: {
    none: { map: vi.fn(() => ({ map: vi.fn() })) },
    line: vi.fn(() => ({ range: vi.fn((from: number) => ({ from })) })),
    set: vi.fn((items) => items),
  },
  DecorationSet: {},
}));

vi.mock('@codemirror/commands', () => ({
  indentWithTab: {},
}));

vi.mock('@codemirror/autocomplete', () => ({
  autocompletion: vi.fn(() => []),
  CompletionContext: vi.fn(),
}));

vi.mock('@codemirror/lint', () => ({
  lintGutter: vi.fn(() => []),
  linter: vi.fn(() => []),
}));

vi.mock('@codemirror/language', () => ({
  LanguageSupport: vi.fn(),
  LRLanguage: {},
  syntaxHighlighting: vi.fn(() => []),
  HighlightStyle: { define: vi.fn(() => ({})) },
  StreamLanguage: { define: vi.fn(() => ({})) },
}));

vi.mock('@lezer/highlight', () => ({
  styleTags: vi.fn(),
  tags: {
    keyword: 'keyword',
    comment: 'comment',
    string: 'string',
    number: 'number',
    propertyName: 'propertyName',
    variableName: 'variableName',
    special: vi.fn(() => 'special'),
    operator: 'operator',
    punctuation: 'punctuation',
    url: 'url',
  },
}));

vi.mock('@shared/index', () => ({
  createMessageId: vi.fn(() => 'test-id-123'),
  createTimestamp: vi.fn(() => Date.now()),
  parseMacro: vi.fn(() => ({ commands: [], errors: [] })),
}));

// Import after mocks are set up
import {
  MessageBox,
  PlaybackFeedbackController,
  messageBoxCSS,
  injectMessageBoxCSS,
  highlightPlayingLine,
  highlightErrorLine,
  clearPlaybackHighlighting,
  jumpToErrorLine,
  setPlayingLine,
  setErrorLine,
  clearPlaybackDecorations,
} from '../../extension/src/editor/playback-feedback';

describe('PlaybackFeedback', () => {
  describe('StateEffects', () => {
    it('setPlayingLine creates an effect with the line number', () => {
      const effect = setPlayingLine.of(5);
      expect(effect).toBeDefined();
      expect(effect.value).toBe(5);
    });

    it('setErrorLine creates an effect with the line number', () => {
      const effect = setErrorLine.of(10);
      expect(effect).toBeDefined();
      expect(effect.value).toBe(10);
    });

    it('clearPlaybackDecorations creates an effect', () => {
      const effect = clearPlaybackDecorations.of(undefined);
      expect(effect).toBeDefined();
    });

    it('setPlayingLine can accept null to clear', () => {
      const effect = setPlayingLine.of(null);
      expect(effect).toBeDefined();
      expect(effect.value).toBe(null);
    });
  });

  describe('MessageBox', () => {
    let container: HTMLElement;
    let messageBox: MessageBox;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
      messageBox = new MessageBox(container);
    });

    afterEach(() => {
      messageBox.hide();
      if (container.parentElement) {
        container.parentElement.removeChild(container);
      }
    });

    it('should not be visible initially', () => {
      expect(messageBox.isVisible()).toBe(false);
    });

    it('should become visible when show() is called', () => {
      messageBox.show({
        type: 'success',
        title: 'Test',
        message: 'Test message',
      });
      expect(messageBox.isVisible()).toBe(true);
    });

    it('should render success message box', () => {
      messageBox.show({
        type: 'success',
        title: 'Success',
        message: 'Operation completed',
      });

      const msgbox = container.querySelector('.imacros-message-box-success');
      expect(msgbox).not.toBeNull();

      const title = container.querySelector('.imacros-msgbox-title');
      expect(title?.textContent).toBe('Success');

      const message = container.querySelector('.imacros-msgbox-message');
      expect(message?.textContent).toBe('Operation completed');
    });

    it('should render error message box', () => {
      messageBox.show({
        type: 'error',
        title: 'Error',
        message: 'Something went wrong',
      });

      const msgbox = container.querySelector('.imacros-message-box-error');
      expect(msgbox).not.toBeNull();
    });

    it('should render warning message box', () => {
      messageBox.show({
        type: 'warning',
        title: 'Warning',
        message: 'Be careful',
      });

      const msgbox = container.querySelector('.imacros-message-box-warning');
      expect(msgbox).not.toBeNull();
    });

    it('should render info message box', () => {
      messageBox.show({
        type: 'info',
        title: 'Info',
        message: 'Information',
      });

      const msgbox = container.querySelector('.imacros-message-box-info');
      expect(msgbox).not.toBeNull();
    });

    it('should hide when hide() is called', () => {
      messageBox.show({
        type: 'info',
        title: 'Test',
        message: 'Test',
      });
      expect(messageBox.isVisible()).toBe(true);

      messageBox.hide();
      expect(messageBox.isVisible()).toBe(false);
    });

    it('should call onClose callback when hiding', () => {
      const onClose = vi.fn();
      messageBox.show({
        type: 'info',
        title: 'Test',
        message: 'Test',
        onClose,
      });

      messageBox.hide();
      expect(onClose).toHaveBeenCalled();
    });

    it('should render error line and code when provided', () => {
      messageBox.show({
        type: 'error',
        title: 'Error',
        message: 'Error occurred',
        errorLine: 42,
        errorCode: -920,
      });

      const errorLine = container.querySelector('.error-line');
      expect(errorLine?.textContent).toContain('42');

      const errorCode = container.querySelector('.error-code');
      expect(errorCode?.textContent).toContain('-920');
    });

    it('should render Edit button when errorLine is provided', () => {
      messageBox.show({
        type: 'error',
        title: 'Error',
        message: 'Error',
        errorLine: 5,
      });

      const editBtn = container.querySelector('.imacros-msgbox-btn-edit');
      expect(editBtn).not.toBeNull();
    });

    it('should not render Edit button when showEdit is false', () => {
      messageBox.show({
        type: 'error',
        title: 'Error',
        message: 'Error',
        errorLine: 5,
        showEdit: false,
      });

      const editBtn = container.querySelector('.imacros-msgbox-btn-edit');
      expect(editBtn).toBeNull();
    });

    it('should render Help button by default', () => {
      messageBox.show({
        type: 'info',
        title: 'Info',
        message: 'Message',
      });

      const helpBtn = container.querySelector('.imacros-msgbox-btn-help');
      expect(helpBtn).not.toBeNull();
    });

    it('should not render Help button when showHelp is false', () => {
      messageBox.show({
        type: 'info',
        title: 'Info',
        message: 'Message',
        showHelp: false,
      });

      const helpBtn = container.querySelector('.imacros-msgbox-btn-help');
      expect(helpBtn).toBeNull();
    });

    it('should call onEdit callback when Edit is clicked', () => {
      const onEdit = vi.fn();
      messageBox.show({
        type: 'error',
        title: 'Error',
        message: 'Error',
        errorLine: 5,
        onEdit,
      });

      const editBtn = container.querySelector('.imacros-msgbox-btn-edit') as HTMLElement;
      editBtn?.click();

      expect(onEdit).toHaveBeenCalled();
    });

    it('should close when Close button is clicked', () => {
      messageBox.show({
        type: 'info',
        title: 'Test',
        message: 'Test',
      });

      const closeBtn = container.querySelector('.imacros-msgbox-btn-close') as HTMLElement;
      closeBtn?.click();

      expect(messageBox.isVisible()).toBe(false);
    });

    it('should close when overlay is clicked', () => {
      messageBox.show({
        type: 'info',
        title: 'Test',
        message: 'Test',
      });

      const overlay = container.querySelector('.imacros-msgbox-overlay') as HTMLElement;
      overlay?.click();

      expect(messageBox.isVisible()).toBe(false);
    });

    it('should escape HTML in title and message', () => {
      messageBox.show({
        type: 'info',
        title: '<script>alert("xss")</script>',
        message: '<img src=x onerror=alert("xss")>',
      });

      const title = container.querySelector('.imacros-msgbox-title');
      expect(title?.innerHTML).not.toContain('<script>');

      const message = container.querySelector('.imacros-msgbox-message');
      expect(message?.innerHTML).not.toContain('<img');
    });
  });

  describe('messageBoxCSS', () => {
    it('should contain required CSS classes', () => {
      expect(messageBoxCSS).toContain('.imacros-message-box');
      expect(messageBoxCSS).toContain('.imacros-msgbox-overlay');
      expect(messageBoxCSS).toContain('.imacros-msgbox-content');
      expect(messageBoxCSS).toContain('.imacros-msgbox-title');
      expect(messageBoxCSS).toContain('.imacros-msgbox-message');
      expect(messageBoxCSS).toContain('.imacros-msgbox-buttons');
      expect(messageBoxCSS).toContain('.imacros-msgbox-btn');
    });

    it('should contain styles for all message types', () => {
      expect(messageBoxCSS).toContain('.imacros-message-box-success');
      expect(messageBoxCSS).toContain('.imacros-message-box-error');
      expect(messageBoxCSS).toContain('.imacros-message-box-warning');
      expect(messageBoxCSS).toContain('.imacros-message-box-info');
    });

    it('should contain animation keyframes', () => {
      expect(messageBoxCSS).toContain('@keyframes imacros-msgbox-appear');
    });
  });

  describe('injectMessageBoxCSS', () => {
    beforeEach(() => {
      // Remove any existing style element
      const existing = document.getElementById('imacros-msgbox-styles');
      if (existing) {
        existing.remove();
      }
    });

    it('should inject CSS into document head', () => {
      injectMessageBoxCSS();

      const style = document.getElementById('imacros-msgbox-styles');
      expect(style).not.toBeNull();
      expect(style?.tagName).toBe('STYLE');
    });

    it('should not duplicate CSS if already injected', () => {
      injectMessageBoxCSS();
      injectMessageBoxCSS();
      injectMessageBoxCSS();

      const styles = document.querySelectorAll('#imacros-msgbox-styles');
      expect(styles.length).toBe(1);
    });
  });

  describe('PlaybackFeedbackController', () => {
    let controller: PlaybackFeedbackController;
    let mockEditorView: any;

    beforeEach(() => {
      controller = new PlaybackFeedbackController();
      mockEditorView = {
        state: {
          doc: {
            lines: 10,
            line: (n: number) => ({ from: (n - 1) * 10, to: n * 10, text: '' }),
          },
        },
        dispatch: vi.fn(),
        dom: document.createElement('div'),
      };
    });

    afterEach(() => {
      controller.detach();
    });

    it('should not be playing initially', () => {
      expect(controller.getIsPlaying()).toBe(false);
    });

    it('should track playing state', () => {
      controller.startPlayback();
      expect(controller.getIsPlaying()).toBe(true);

      controller.stopPlayback();
      expect(controller.getIsPlaying()).toBe(false);
    });

    it('should track current line', () => {
      expect(controller.getCurrentLine()).toBe(0);

      controller.attachEditor(mockEditorView);
      controller.startPlayback();
      controller.setCurrentLine(5);

      expect(controller.getCurrentLine()).toBe(5);
    });

    it('should dispatch highlight effect when setCurrentLine is called during playback', () => {
      controller.attachEditor(mockEditorView);
      controller.startPlayback();
      controller.setCurrentLine(3);

      expect(mockEditorView.dispatch).toHaveBeenCalled();
    });

    it('should not dispatch when not playing', () => {
      controller.attachEditor(mockEditorView);
      controller.setCurrentLine(3);

      expect(mockEditorView.dispatch).not.toHaveBeenCalled();
    });

    it('should clear highlighting on stopPlayback', () => {
      controller.attachEditor(mockEditorView);
      controller.startPlayback();
      controller.setCurrentLine(5);
      mockEditorView.dispatch.mockClear();

      controller.stopPlayback();

      expect(mockEditorView.dispatch).toHaveBeenCalled();
    });
  });
});

describe('Element Highlighter', () => {
  // Import element highlighter for testing
  let elementHighlighter: typeof import('../../extension/src/content/element-highlighter');

  beforeEach(async () => {
    // Reset the module
    vi.resetModules();

    // Re-mock chrome for content script
    (globalThis as any).chrome = {
      runtime: {
        sendMessage: vi.fn(),
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    };

    elementHighlighter = await import('../../extension/src/content/element-highlighter');
  });

  afterEach(() => {
    elementHighlighter.clearElementHighlight();
  });

  describe('scrollToElement', () => {
    it('should scroll element into view if not visible', () => {
      const element = document.createElement('div');
      element.scrollIntoView = vi.fn();
      element.getBoundingClientRect = vi.fn(() => ({
        top: -100,
        left: 0,
        bottom: -50,
        right: 100,
        width: 100,
        height: 50,
        x: 0,
        y: -100,
        toJSON: () => ({}),
      }));

      elementHighlighter.scrollToElement(element);

      expect(element.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'center',
        inline: 'center',
      });
    });

    it('should not scroll if element is in viewport', () => {
      const element = document.createElement('div');
      element.scrollIntoView = vi.fn();
      element.getBoundingClientRect = vi.fn(() => ({
        top: 100,
        left: 100,
        bottom: 200,
        right: 200,
        width: 100,
        height: 100,
        x: 100,
        y: 100,
        toJSON: () => ({}),
      }));

      // Mock window dimensions
      Object.defineProperty(window, 'innerHeight', { value: 800, writable: true });
      Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true });

      elementHighlighter.scrollToElement(element);

      expect(element.scrollIntoView).not.toHaveBeenCalled();
    });
  });

  describe('highlightElement', () => {
    it('should not be highlighted initially', () => {
      expect(elementHighlighter.isElementHighlighted()).toBe(false);
    });

    it('should create highlight overlay', async () => {
      const element = document.createElement('div');
      document.body.appendChild(element);
      element.getBoundingClientRect = vi.fn(() => ({
        top: 100,
        left: 100,
        bottom: 200,
        right: 200,
        width: 100,
        height: 100,
        x: 100,
        y: 100,
        toJSON: () => ({}),
      }));

      elementHighlighter.highlightElement(element, { scroll: false, duration: 0 });

      // Wait for the delayed creation
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(elementHighlighter.isElementHighlighted()).toBe(true);
      document.body.removeChild(element);
    });

    it('should clear existing highlight when highlighting new element', async () => {
      const element1 = document.createElement('div');
      const element2 = document.createElement('div');
      document.body.appendChild(element1);
      document.body.appendChild(element2);

      const mockRect = {
        top: 100, left: 100, bottom: 200, right: 200,
        width: 100, height: 100, x: 100, y: 100,
        toJSON: () => ({}),
      };
      element1.getBoundingClientRect = vi.fn(() => mockRect);
      element2.getBoundingClientRect = vi.fn(() => mockRect);

      elementHighlighter.highlightElement(element1, { scroll: false, duration: 0 });
      await new Promise(resolve => setTimeout(resolve, 50));

      const overlaysBefore = document.querySelectorAll('.imacros-element-highlight');
      expect(overlaysBefore.length).toBe(1);

      elementHighlighter.highlightElement(element2, { scroll: false, duration: 0 });
      await new Promise(resolve => setTimeout(resolve, 50));

      const overlaysAfter = document.querySelectorAll('.imacros-element-highlight');
      expect(overlaysAfter.length).toBe(1);

      document.body.removeChild(element1);
      document.body.removeChild(element2);
    });

    it('should add label when provided', async () => {
      const element = document.createElement('div');
      document.body.appendChild(element);
      element.getBoundingClientRect = vi.fn(() => ({
        top: 100, left: 100, bottom: 200, right: 200,
        width: 100, height: 100, x: 100, y: 100,
        toJSON: () => ({}),
      }));

      elementHighlighter.highlightElement(element, {
        scroll: false,
        duration: 0,
        label: 'TAG CLICK',
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const label = document.querySelector('.imacros-element-highlight-label');
      expect(label).not.toBeNull();
      expect(label?.textContent).toBe('TAG CLICK');

      document.body.removeChild(element);
    });
  });

  describe('clearElementHighlight', () => {
    it('should remove highlight overlay', async () => {
      const element = document.createElement('div');
      document.body.appendChild(element);
      element.getBoundingClientRect = vi.fn(() => ({
        top: 100, left: 100, bottom: 200, right: 200,
        width: 100, height: 100, x: 100, y: 100,
        toJSON: () => ({}),
      }));

      elementHighlighter.highlightElement(element, { scroll: false, duration: 0 });
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(elementHighlighter.isElementHighlighted()).toBe(true);

      elementHighlighter.clearElementHighlight();
      expect(elementHighlighter.isElementHighlighted()).toBe(false);

      document.body.removeChild(element);
    });
  });

  describe('highlightElementSuccess', () => {
    it('should add success styling', async () => {
      const element = document.createElement('div');
      document.body.appendChild(element);
      element.getBoundingClientRect = vi.fn(() => ({
        top: 100, left: 100, bottom: 200, right: 200,
        width: 100, height: 100, x: 100, y: 100,
        toJSON: () => ({}),
      }));

      elementHighlighter.highlightElementSuccess(element, { scroll: false, duration: 0 });
      await new Promise(resolve => setTimeout(resolve, 100));

      const overlay = document.querySelector('.imacros-element-highlight');
      expect(overlay?.classList.contains('imacros-highlight-success')).toBe(true);

      document.body.removeChild(element);
    });
  });

  describe('highlightElementError', () => {
    it('should add error styling', async () => {
      const element = document.createElement('div');
      document.body.appendChild(element);
      element.getBoundingClientRect = vi.fn(() => ({
        top: 100, left: 100, bottom: 200, right: 200,
        width: 100, height: 100, x: 100, y: 100,
        toJSON: () => ({}),
      }));

      elementHighlighter.highlightElementError(element, { scroll: false });
      await new Promise(resolve => setTimeout(resolve, 100));

      const overlay = document.querySelector('.imacros-element-highlight');
      expect(overlay?.classList.contains('imacros-highlight-error')).toBe(true);

      document.body.removeChild(element);
    });
  });

  describe('Highlight Settings', () => {
    it('should have default settings', () => {
      const settings = elementHighlighter.getHighlightSettings();
      expect(settings.scrollToElement).toBe(true);
      expect(settings.highlightElement).toBe(true);
      expect(settings.highlightDuration).toBe(1500);
    });

    it('should update settings', () => {
      elementHighlighter.setHighlightSettings({
        scrollToElement: false,
        highlightDuration: 2000,
      });

      const settings = elementHighlighter.getHighlightSettings();
      expect(settings.scrollToElement).toBe(false);
      expect(settings.highlightElement).toBe(true);
      expect(settings.highlightDuration).toBe(2000);

      // Reset settings
      elementHighlighter.setHighlightSettings({
        scrollToElement: true,
        highlightDuration: 1500,
      });
    });
  });

  describe('handleHighlightMessage', () => {
    it('should handle HIGHLIGHT_ELEMENT message', () => {
      const element = document.createElement('div');
      element.id = 'test-element';
      document.body.appendChild(element);
      element.getBoundingClientRect = vi.fn(() => ({
        top: 100, left: 100, bottom: 200, right: 200,
        width: 100, height: 100, x: 100, y: 100,
        toJSON: () => ({}),
      }));

      const result = elementHighlighter.handleHighlightMessage({
        type: 'HIGHLIGHT_ELEMENT',
        payload: { selector: '#test-element', label: 'Test' },
      });

      expect(result).toBe(true);
      document.body.removeChild(element);
    });

    it('should handle CLEAR_ELEMENT_HIGHLIGHT message', () => {
      const result = elementHighlighter.handleHighlightMessage({
        type: 'CLEAR_ELEMENT_HIGHLIGHT',
      });

      expect(result).toBe(true);
      expect(elementHighlighter.isElementHighlighted()).toBe(false);
    });

    it('should handle SET_HIGHLIGHT_SETTINGS message', () => {
      const result = elementHighlighter.handleHighlightMessage({
        type: 'SET_HIGHLIGHT_SETTINGS',
        payload: { scrollToElement: false },
      });

      expect(result).toBe(true);
      expect(elementHighlighter.getHighlightSettings().scrollToElement).toBe(false);

      // Reset
      elementHighlighter.setHighlightSettings({ scrollToElement: true });
    });

    it('should return false for unknown message types', () => {
      const result = elementHighlighter.handleHighlightMessage({
        type: 'UNKNOWN_MESSAGE',
      });

      expect(result).toBe(false);
    });
  });
});
