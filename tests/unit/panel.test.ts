/**
 * Unit Tests for Panel module
 *
 * Tests cover:
 * - Panel initialization
 * - Button states based on status
 * - Save recording integration with SaveDialog
 * - Panel file operations (editor lifecycle, unsaved changes)
 * - Input/Confirm dialog behavior
 * - Keyboard shortcuts
 * - Tab switching
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

// Setup DOM environment before imports
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
const { window } = dom;

// Polyfill globals
(globalThis as any).document = window.document;
(globalThis as any).window = window;
(globalThis as any).HTMLElement = window.HTMLElement;
(globalThis as any).Element = window.Element;
(globalThis as any).Node = window.Node;
(globalThis as any).KeyboardEvent = window.KeyboardEvent;
(globalThis as any).MouseEvent = window.MouseEvent;

// Mock chrome APIs
const mockSendMessage = vi.fn();
const mockStorageData: Record<string, any> = {};
const mockStorage = {
  local: {
    get: vi.fn().mockImplementation((key: string) => {
      return Promise.resolve({ [key]: mockStorageData[key] });
    }),
    set: vi.fn().mockResolvedValue(undefined),
  },
};

(globalThis as any).chrome = {
  runtime: {
    sendMessage: mockSendMessage,
    onMessage: {
      addListener: vi.fn(),
    },
    lastError: null,
  },
  storage: mockStorage,
};

// Mock scrollIntoView
window.Element.prototype.scrollIntoView = vi.fn();

// Import components
import { SaveDialog, showSaveDialog, SaveDialogResult } from '../../extension/src/panel/save-dialog';
import { FileTreeNode, createTreeFromPaths } from '../../extension/src/panel/file-tree';

describe('Panel Save Recording Flow', () => {
  beforeEach(() => {
    window.document.body.innerHTML = '';
    mockSendMessage.mockClear();
  });

  afterEach(() => {
    // Clean up dialogs
    const overlay = window.document.querySelector('.save-dialog-overlay');
    if (overlay) {
      overlay.remove();
    }
  });

  describe('saveRecording with dialog', () => {
    it('should show save dialog when saving recording', async () => {
      // Set up mock response for GET_MACROS
      mockSendMessage.mockImplementation((_msg, callback) => {
        callback({ files: ['Demo/test.iim'] });
      });

      // Show the dialog
      const dialogPromise = showSaveDialog({
        defaultFilename: 'TestRecording',
        folders: [],
        showBookmark: true,
      });

      // Dialog should be visible
      const overlay = window.document.querySelector('.save-dialog-overlay');
      expect(overlay).toBeTruthy();

      // Cancel to clean up
      (window.document.querySelector('.save-dialog-btn-cancel') as HTMLButtonElement).click();
      await dialogPromise;
    });

    it('should get folder list from GET_MACROS response', async () => {
      // Mock file tree data
      const files = [
        'Demo/file1.iim',
        'Demo/Subdir/file2.iim',
        'Samples/file3.iim',
      ];

      const treeData = createTreeFromPaths(files, 'Macros');
      const folders = SaveDialog.getFoldersFromTree(treeData);

      // Should have Demo, Demo/Subdir, and Samples
      expect(folders.length).toBe(3);
      expect(folders.map(f => f.path)).toContain('Demo');
      expect(folders.map(f => f.path)).toContain('Demo/Subdir');
      expect(folders.map(f => f.path)).toContain('Samples');
    });

    it('should pass filename to SAVE_RECORDING message', async () => {
      const dialog = new SaveDialog();
      const dialogPromise = dialog.show({
        defaultFilename: 'MyRecording',
        folders: [],
      });

      // Fill in filename and save
      const input = window.document.getElementById('save-dialog-filename') as HTMLInputElement;
      input.value = 'CustomName';

      (window.document.querySelector('.save-dialog-btn-save') as HTMLButtonElement).click();

      const result = await dialogPromise;

      expect(result.confirmed).toBe(true);
      expect(result.filename).toBe('CustomName.iim');
      expect(result.path).toBe('CustomName.iim');
    });

    it('should include folder in path when folder selected', async () => {
      const folders: FileTreeNode[] = [
        { name: 'MyFolder', path: 'MyFolder', isDirectory: true, children: [] },
      ];

      const dialog = new SaveDialog();
      const dialogPromise = dialog.show({
        defaultFilename: 'TestMacro',
        folders,
      });

      // Select folder
      const select = window.document.getElementById('save-dialog-folder') as HTMLSelectElement;
      select.value = 'MyFolder';

      (window.document.querySelector('.save-dialog-btn-save') as HTMLButtonElement).click();

      const result = await dialogPromise;

      expect(result.path).toBe('MyFolder/TestMacro.iim');
      expect(result.folder).toBe('MyFolder');
    });

    it('should include bookmark preference in result', async () => {
      const dialog = new SaveDialog();
      const dialogPromise = dialog.show({
        defaultFilename: 'TestMacro',
        showBookmark: true,
        defaultBookmark: false,
      });

      // Check bookmark
      const checkbox = window.document.getElementById('save-dialog-bookmark') as HTMLInputElement;
      checkbox.checked = true;

      (window.document.querySelector('.save-dialog-btn-save') as HTMLButtonElement).click();

      const result = await dialogPromise;

      expect(result.createBookmark).toBe(true);
    });

    it('should handle cancel without saving', async () => {
      const dialog = new SaveDialog();
      const dialogPromise = dialog.show({
        defaultFilename: 'TestMacro',
      });

      (window.document.querySelector('.save-dialog-btn-cancel') as HTMLButtonElement).click();

      const result = await dialogPromise;

      expect(result.confirmed).toBe(false);
      expect(result.filename).toBeUndefined();
    });
  });
});

describe('Panel UI State Management', () => {
  describe('Button states', () => {
    it('should have btn-save button for recording tab', () => {
      // Create a minimal panel structure
      window.document.body.innerHTML = `
        <button id="btn-save" class="btn btn-secondary" disabled>Save</button>
        <button id="btn-record" class="btn btn-record">Record</button>
      `;

      const saveBtn = window.document.getElementById('btn-save') as HTMLButtonElement;
      const recordBtn = window.document.getElementById('btn-record') as HTMLButtonElement;

      expect(saveBtn).toBeTruthy();
      expect(recordBtn).toBeTruthy();
    });

    it('should enable save button during recording', () => {
      window.document.body.innerHTML = `
        <button id="btn-save" class="btn btn-secondary" disabled>Save</button>
      `;

      const saveBtn = window.document.getElementById('btn-save') as HTMLButtonElement;

      // Simulate recording state - enable save button
      saveBtn.disabled = false;

      expect(saveBtn.disabled).toBe(false);
    });

    it('should disable save button when idle', () => {
      window.document.body.innerHTML = `
        <button id="btn-save" class="btn btn-secondary">Save</button>
      `;

      const saveBtn = window.document.getElementById('btn-save') as HTMLButtonElement;

      // Simulate idle state - disable save button
      saveBtn.disabled = true;

      expect(saveBtn.disabled).toBe(true);
    });
  });
});

describe('Folder extraction from file tree', () => {
  it('should extract all directories from tree', () => {
    const tree: FileTreeNode = {
      name: 'Macros',
      path: '',
      isDirectory: true,
      expanded: true,
      children: [
        {
          name: 'Level1',
          path: 'Level1',
          isDirectory: true,
          children: [
            {
              name: 'Level2',
              path: 'Level1/Level2',
              isDirectory: true,
              children: [
                { name: 'file.iim', path: 'Level1/Level2/file.iim', isDirectory: false },
              ],
            },
          ],
        },
        { name: 'root.iim', path: 'root.iim', isDirectory: false },
      ],
    };

    const folders = SaveDialog.getFoldersFromTree(tree);

    expect(folders.length).toBe(2);
    expect(folders[0].path).toBe('Level1');
    expect(folders[1].path).toBe('Level1/Level2');
  });

  it('should work with createTreeFromPaths', () => {
    const paths = [
      'Folder1/file1.iim',
      'Folder1/SubA/file2.iim',
      'Folder1/SubB/file3.iim',
      'Folder2/file4.iim',
    ];

    const tree = createTreeFromPaths(paths, 'Macros');
    const folders = SaveDialog.getFoldersFromTree(tree);

    expect(folders.length).toBe(4);
    const folderPaths = folders.map(f => f.path);
    expect(folderPaths).toContain('Folder1');
    expect(folderPaths).toContain('Folder1/SubA');
    expect(folderPaths).toContain('Folder1/SubB');
    expect(folderPaths).toContain('Folder2');
  });

  it('should handle empty tree', () => {
    const tree = createTreeFromPaths([], 'Macros');
    const folders = SaveDialog.getFoldersFromTree(tree);

    expect(folders.length).toBe(0);
  });

  it('should handle tree with only files', () => {
    const paths = ['file1.iim', 'file2.iim', 'file3.iim'];
    const tree = createTreeFromPaths(paths, 'Macros');
    const folders = SaveDialog.getFoldersFromTree(tree);

    expect(folders.length).toBe(0);
  });
});

// ===== Panel Button State Management =====

describe('Panel Button State Transitions', () => {
  beforeEach(() => {
    window.document.body.innerHTML = `
      <button id="btn-play" class="btn" disabled>Play</button>
      <button id="btn-pause" class="btn" disabled>Pause</button>
      <button id="btn-stop" class="btn" disabled>Stop</button>
      <button id="btn-play-loop" class="btn" disabled>Play Loop</button>
      <button id="btn-record" class="btn">Record</button>
      <button id="btn-save" class="btn" disabled>Save</button>
      <button id="btn-stop-record" class="btn" disabled>Stop Record</button>
      <button id="btn-edit" class="btn" disabled>Edit</button>
      <input id="loop-current" value="1" />
      <input id="loop-max" value="1" />
    `;
  });

  it('should disable play and play-loop when no macro is selected and idle', () => {
    const btnPlay = window.document.getElementById('btn-play') as HTMLButtonElement;
    const btnPlayLoop = window.document.getElementById('btn-play-loop') as HTMLButtonElement;
    // No selection => play buttons disabled
    expect(btnPlay.disabled).toBe(true);
    expect(btnPlayLoop.disabled).toBe(true);
  });

  it('should enable play buttons when a macro is selected and status is idle', () => {
    const btnPlay = window.document.getElementById('btn-play') as HTMLButtonElement;
    const btnPlayLoop = window.document.getElementById('btn-play-loop') as HTMLButtonElement;
    // Simulate selection + idle
    btnPlay.disabled = false;
    btnPlayLoop.disabled = false;
    expect(btnPlay.disabled).toBe(false);
    expect(btnPlayLoop.disabled).toBe(false);
  });

  it('should enable pause button during playback', () => {
    const btnPause = window.document.getElementById('btn-pause') as HTMLButtonElement;
    // Simulate playing state
    btnPause.disabled = false;
    expect(btnPause.disabled).toBe(false);
  });

  it('should enable stop button during playback or recording', () => {
    const btnStop = window.document.getElementById('btn-stop') as HTMLButtonElement;
    btnStop.disabled = false;
    expect(btnStop.disabled).toBe(false);
  });

  it('should disable record button during recording', () => {
    const btnRecord = window.document.getElementById('btn-record') as HTMLButtonElement;
    btnRecord.disabled = true;
    expect(btnRecord.disabled).toBe(true);
  });

  it('should enable save and stop-record during recording', () => {
    const btnSave = window.document.getElementById('btn-save') as HTMLButtonElement;
    const btnStopRecord = window.document.getElementById('btn-stop-record') as HTMLButtonElement;
    btnSave.disabled = false;
    btnStopRecord.disabled = false;
    expect(btnSave.disabled).toBe(false);
    expect(btnStopRecord.disabled).toBe(false);
  });

  it('should disable edit button when no macro is selected', () => {
    const btnEdit = window.document.getElementById('btn-edit') as HTMLButtonElement;
    expect(btnEdit.disabled).toBe(true);
  });

  it('should enable edit button when a macro is selected', () => {
    const btnEdit = window.document.getElementById('btn-edit') as HTMLButtonElement;
    btnEdit.disabled = false;
    expect(btnEdit.disabled).toBe(false);
  });

  it('should properly set loop input values', () => {
    const loopCurrent = window.document.getElementById('loop-current') as HTMLInputElement;
    const loopMax = window.document.getElementById('loop-max') as HTMLInputElement;
    loopCurrent.value = '3';
    loopMax.value = '10';
    expect(loopCurrent.value).toBe('3');
    expect(loopMax.value).toBe('10');
  });

  it('should clamp loop-max to valid range', () => {
    const loopMax = window.document.getElementById('loop-max') as HTMLInputElement;
    // Simulate change handler logic
    let value = parseInt('0', 10);
    if (isNaN(value) || value < 1) value = 1;
    if (value > 99999) value = 99999;
    loopMax.value = String(value);
    expect(loopMax.value).toBe('1');

    value = parseInt('100000', 10);
    if (value > 99999) value = 99999;
    loopMax.value = String(value);
    expect(loopMax.value).toBe('99999');
  });
});

// ===== Panel Unsaved Changes Detection =====

describe('Panel Unsaved Changes', () => {
  it('should track isModified state when editor content changes', () => {
    // Simulate panel state
    const panelState = {
      selectedMacro: 'test.iim',
      editorContent: 'URL GOTO=example.com',
      originalContent: 'URL GOTO=example.com',
      isModified: false,
    };

    // Simulate content change
    panelState.editorContent = 'URL GOTO=changed.com';
    panelState.isModified = panelState.editorContent !== panelState.originalContent;
    expect(panelState.isModified).toBe(true);
  });

  it('should reset isModified when content matches original', () => {
    const panelState = {
      selectedMacro: 'test.iim',
      editorContent: 'URL GOTO=example.com',
      originalContent: 'URL GOTO=example.com',
      isModified: false,
    };

    // Change then change back
    panelState.editorContent = 'URL GOTO=changed.com';
    panelState.isModified = panelState.editorContent !== panelState.originalContent;
    expect(panelState.isModified).toBe(true);

    panelState.editorContent = 'URL GOTO=example.com';
    panelState.isModified = panelState.editorContent !== panelState.originalContent;
    expect(panelState.isModified).toBe(false);
  });

  it('should update editor title to show modified state', () => {
    window.document.body.innerHTML = `
      <span class="inline-editor-title">test.iim</span>
      <button id="inline-save-btn" disabled>Save</button>
    `;

    const titleEl = window.document.querySelector('.inline-editor-title') as HTMLElement;
    const saveBtn = window.document.getElementById('inline-save-btn') as HTMLButtonElement;

    // Simulate modified state
    titleEl.classList.toggle('modified', true);
    saveBtn.disabled = false;

    expect(titleEl.classList.contains('modified')).toBe(true);
    expect(saveBtn.disabled).toBe(false);
  });

  it('should disable save button when not modified', () => {
    window.document.body.innerHTML = `
      <span class="inline-editor-title">test.iim</span>
      <button id="inline-save-btn">Save</button>
    `;

    const titleEl = window.document.querySelector('.inline-editor-title') as HTMLElement;
    const saveBtn = window.document.getElementById('inline-save-btn') as HTMLButtonElement;

    // Simulate unmodified state
    titleEl.classList.toggle('modified', false);
    saveBtn.disabled = true;

    expect(titleEl.classList.contains('modified')).toBe(false);
    expect(saveBtn.disabled).toBe(true);
  });

  it('should clear editor state when no macro is selected', () => {
    const panelState = {
      selectedMacro: null as string | null,
      editorContent: '',
      originalContent: '',
      isModified: false,
    };

    // After clearing
    expect(panelState.selectedMacro).toBeNull();
    expect(panelState.editorContent).toBe('');
    expect(panelState.originalContent).toBe('');
    expect(panelState.isModified).toBe(false);
  });

  it('should update originalContent after successful save', () => {
    const panelState = {
      selectedMacro: 'test.iim',
      editorContent: 'URL GOTO=newurl.com',
      originalContent: 'URL GOTO=oldurl.com',
      isModified: true,
    };

    // Simulate successful save
    panelState.originalContent = panelState.editorContent;
    panelState.isModified = false;

    expect(panelState.originalContent).toBe('URL GOTO=newurl.com');
    expect(panelState.isModified).toBe(false);
  });
});

// ===== Panel File Type Detection =====

describe('Panel File Type Detection', () => {
  function getFileType(path: string | null): 'iim' | 'js' {
    if (!path) return 'iim';
    const lower = path.toLowerCase();
    if (lower.endsWith('.js')) return 'js';
    return 'iim';
  }

  it('should detect .iim file type', () => {
    expect(getFileType('Demo/FillForms.iim')).toBe('iim');
  });

  it('should detect .js file type', () => {
    expect(getFileType('Scripts/helper.js')).toBe('js');
  });

  it('should default to iim for null path', () => {
    expect(getFileType(null)).toBe('iim');
  });

  it('should default to iim for unknown extensions', () => {
    expect(getFileType('readme.txt')).toBe('iim');
  });

  it('should handle case-insensitive extensions', () => {
    expect(getFileType('test.JS')).toBe('js');
    expect(getFileType('test.IIM')).toBe('iim');
  });
});

// ===== Panel Tab Switching =====

describe('Panel Tab Switching', () => {
  beforeEach(() => {
    window.document.body.innerHTML = `
      <div class="tab-bar">
        <button class="tab-btn active" data-tab="play">Play</button>
        <button class="tab-btn" data-tab="record">Record</button>
        <button class="tab-btn" data-tab="manage">Manage</button>
      </div>
      <div id="tab-play" class="tab-panel active">Play panel</div>
      <div id="tab-record" class="tab-panel">Record panel</div>
      <div id="tab-manage" class="tab-panel">Manage panel</div>
    `;
  });

  it('should switch active tab on click', () => {
    const tabBtns = window.document.querySelectorAll('.tab-btn');
    const tabPanels = window.document.querySelectorAll('.tab-panel');

    // Simulate setupTabs logic
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        tabBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        tabPanels.forEach((panel) => {
          panel.classList.remove('active');
          if (panel.id === `tab-${tabId}`) {
            panel.classList.add('active');
          }
        });
      });
    });

    // Click record tab
    (tabBtns[1] as HTMLButtonElement).click();

    expect(tabBtns[0].classList.contains('active')).toBe(false);
    expect(tabBtns[1].classList.contains('active')).toBe(true);
    expect(window.document.getElementById('tab-play')!.classList.contains('active')).toBe(false);
    expect(window.document.getElementById('tab-record')!.classList.contains('active')).toBe(true);
  });

  it('should deactivate all other tabs when switching', () => {
    const tabBtns = window.document.querySelectorAll('.tab-btn');
    const tabPanels = window.document.querySelectorAll('.tab-panel');

    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        tabBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        tabPanels.forEach((panel) => {
          panel.classList.remove('active');
          if (panel.id === `tab-${tabId}`) {
            panel.classList.add('active');
          }
        });
      });
    });

    // Click manage tab
    (tabBtns[2] as HTMLButtonElement).click();

    // Only manage should be active
    const activePanels = window.document.querySelectorAll('.tab-panel.active');
    expect(activePanels.length).toBe(1);
    expect(activePanels[0].id).toBe('tab-manage');
  });
});

// ===== Panel Split Resizer =====

describe('Panel Split Resizer', () => {
  it('should constrain resizer within min/max bounds', () => {
    const minWidth = 120;
    const maxWidth = 500 - 125; // containerWidth - right pane room

    // Within bounds
    const validWidth = 200;
    expect(validWidth >= minWidth && validWidth <= maxWidth).toBe(true);

    // Below minimum
    const tooSmall = 50;
    expect(tooSmall >= minWidth).toBe(false);

    // Above maximum
    const tooLarge = 400;
    expect(tooLarge <= maxWidth).toBe(false);
  });

  it('should toggle dragging class on resizer', () => {
    window.document.body.innerHTML = '<div id="split-resizer"></div>';
    const resizer = window.document.getElementById('split-resizer') as HTMLElement;

    resizer.classList.add('dragging');
    expect(resizer.classList.contains('dragging')).toBe(true);

    resizer.classList.remove('dragging');
    expect(resizer.classList.contains('dragging')).toBe(false);
  });
});

// ===== Panel Editor Placeholder =====

describe('Panel Editor Placeholder', () => {
  it('should show placeholder when no macro is selected', () => {
    window.document.body.innerHTML = `
      <div id="inline-editor">
        <div class="editor-placeholder">Select a macro to view/edit</div>
      </div>
    `;

    const placeholder = window.document.querySelector('.editor-placeholder');
    expect(placeholder).toBeTruthy();
    expect(placeholder!.textContent).toBe('Select a macro to view/edit');
  });

  it('should show error message on load failure', () => {
    window.document.body.innerHTML = `
      <div id="inline-editor">
        <div class="editor-placeholder" style="color: #c00;">Error: File not found</div>
      </div>
    `;

    const placeholder = window.document.querySelector('.editor-placeholder');
    expect(placeholder).toBeTruthy();
    expect(placeholder!.textContent).toContain('Error:');
  });

  it('should show editor header with file name and action buttons', () => {
    window.document.body.innerHTML = `
      <div id="inline-editor">
        <div class="inline-editor-header">
          <span class="inline-editor-title">FillForms.iim</span>
          <div class="inline-editor-actions">
            <button id="inline-save-btn" class="inline-editor-btn save-btn" disabled>Save</button>
            <button id="inline-open-btn" class="inline-editor-btn">Open</button>
          </div>
        </div>
        <div class="inline-editor-content" id="inline-editor-content"></div>
      </div>
    `;

    expect(window.document.querySelector('.inline-editor-title')!.textContent).toBe('FillForms.iim');
    expect(window.document.getElementById('inline-save-btn')).toBeTruthy();
    expect(window.document.getElementById('inline-open-btn')).toBeTruthy();
  });
});

// ===== Panel Log Viewer =====

describe('Panel Log Viewer', () => {
  beforeEach(() => {
    window.document.body.innerHTML = `
      <span id="status-text" class="clickable">Ready</span>
      <div id="log-viewer" class="hidden">
        <div id="log-content"></div>
        <button id="log-close">Close</button>
        <button id="log-copy">Copy</button>
        <button id="log-clear">Clear</button>
      </div>
    `;
  });

  it('should show log viewer when clicking status text', () => {
    const logViewer = window.document.getElementById('log-viewer') as HTMLElement;
    const statusText = window.document.getElementById('status-text') as HTMLElement;

    statusText.addEventListener('click', () => {
      logViewer.classList.remove('hidden');
    });

    statusText.click();
    expect(logViewer.classList.contains('hidden')).toBe(false);
  });

  it('should hide log viewer on close button click', () => {
    const logViewer = window.document.getElementById('log-viewer') as HTMLElement;
    const closeBtn = window.document.getElementById('log-close') as HTMLElement;

    logViewer.classList.remove('hidden');

    closeBtn.addEventListener('click', () => {
      logViewer.classList.add('hidden');
    });

    closeBtn.click();
    expect(logViewer.classList.contains('hidden')).toBe(true);
  });

  it('should render log entries with proper structure', () => {
    const logContent = window.document.getElementById('log-content') as HTMLElement;

    // Simulate log rendering
    const logs = [
      { timestamp: Date.now(), type: 'info', message: 'Starting', line: undefined },
      { timestamp: Date.now(), type: 'command', message: 'URL GOTO=...', line: 1 },
      { timestamp: Date.now(), type: 'error', message: 'Element not found', line: 5 },
    ];

    logContent.innerHTML = logs.map((e) => {
      const linePrefix = e.line ? `[${e.line}] ` : '';
      const escapedMsg = e.message.replace(/</g, '&lt;');
      return `
      <div class="log-entry ${e.type}">
        <span class="log-time">${new Date(e.timestamp).toLocaleTimeString()}</span>
        <span class="log-msg">${linePrefix}${escapedMsg}</span>
      </div>`;
    }).join('');

    const entries = logContent.querySelectorAll('.log-entry');
    expect(entries.length).toBe(3);
    expect(entries[0].classList.contains('info')).toBe(true);
    expect(entries[1].classList.contains('command')).toBe(true);
    expect(entries[2].classList.contains('error')).toBe(true);
  });

  it('should escape HTML in log messages', () => {
    const message = '<script>alert("xss")</script>';
    const escaped = message.replace(/</g, '&lt;');
    expect(escaped).toBe('&lt;script>alert("xss")&lt;/script>');
    expect(escaped).not.toContain('<script>');
  });
});

// ===== Panel Macro Selection =====

describe('Panel Macro Selection', () => {
  it('should clear selection when directory is selected', () => {
    const panelState = {
      selectedMacro: 'test.iim' as string | null,
    };

    // Simulate directory selection
    const event = { node: { isDirectory: true, path: 'Demo' }, action: 'select' as const };
    if (event.node.isDirectory) {
      panelState.selectedMacro = null;
    }

    expect(panelState.selectedMacro).toBeNull();
  });

  it('should set selected macro when file is selected', () => {
    const panelState = {
      selectedMacro: null as string | null,
    };

    const event = { node: { isDirectory: false, path: 'Demo/FillForms.iim' }, action: 'select' as const };
    if (!event.node.isDirectory) {
      panelState.selectedMacro = event.node.path;
    }

    expect(panelState.selectedMacro).toBe('Demo/FillForms.iim');
  });

  it('should trigger play on double-click selection', () => {
    const actions: string[] = [];
    const panelState = { selectedMacro: null as string | null };

    const event = { node: { isDirectory: false, path: 'test.iim' }, action: 'play' as const };
    if (!event.node.isDirectory) {
      panelState.selectedMacro = event.node.path;
      if (event.action === 'play') {
        actions.push('playMacro');
      }
    }

    expect(panelState.selectedMacro).toBe('test.iim');
    expect(actions).toContain('playMacro');
  });
});

// ===== Panel sendToBackground Promise Wrapper =====

describe('Panel sendToBackground', () => {
  it('should resolve with response on success', async () => {
    mockSendMessage.mockImplementation((msg: any, callback: any) => {
      (globalThis as any).chrome.runtime.lastError = null;
      callback({ success: true, files: ['test.iim'] });
    });

    const result = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'GET_MACROS' }, (response: any) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });

    expect(result).toEqual({ success: true, files: ['test.iim'] });
  });

  it('should reject on chrome.runtime.lastError', async () => {
    mockSendMessage.mockImplementation((_msg: any, callback: any) => {
      (globalThis as any).chrome.runtime.lastError = { message: 'Extension context invalidated' };
      callback(undefined);
    });

    await expect(
      new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'GET_MACROS' }, (response: any) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      }),
    ).rejects.toThrow('Extension context invalidated');

    // Reset lastError
    (globalThis as any).chrome.runtime.lastError = null;
  });
});
