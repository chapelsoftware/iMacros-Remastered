/**
 * iMacros Panel - Main UI Controller
 * Handles the side panel interface for macro playback, recording, and management
 */

import { createMessageId, createTimestamp } from '@shared/index';
import { FileTree, FileTreeNode, createTreeFromPaths, FileTreeSelectionEvent } from './file-tree';
import { statusSync, initializeStatusSync, StatusSyncEvent, ExecutionStatus, LogEntry } from './status-sync';

// Panel state (selection and UI state not managed by StatusSync)
interface PanelState {
  selectedMacro: string | null;
}

// Global state
let state: PanelState = {
  selectedMacro: null,
};

let fileTree: FileTree | null = null;

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
 * Show an input dialog (replacement for prompt() which doesn't work in panels)
 */
function showInputDialog(title: string, message: string, defaultValue: string = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog">
        <div class="dialog-header">
          <div class="dialog-icon info">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </div>
          <div class="dialog-title">${title}</div>
        </div>
        <div class="dialog-message">${message}</div>
        <input type="text" class="dialog-input" value="${defaultValue}" />
        <div class="dialog-buttons">
          <button class="dialog-btn dialog-btn-cancel">Cancel</button>
          <button class="dialog-btn dialog-btn-ok">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('.dialog-input') as HTMLInputElement;
    const okBtn = overlay.querySelector('.dialog-btn-ok') as HTMLButtonElement;
    const cancelBtn = overlay.querySelector('.dialog-btn-cancel') as HTMLButtonElement;

    input.focus();
    input.select();

    const close = (value: string | null) => {
      overlay.remove();
      resolve(value);
    };

    okBtn.addEventListener('click', () => close(input.value));
    cancelBtn.addEventListener('click', () => close(null));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') close(input.value);
      if (e.key === 'Escape') close(null);
    });
  });
}

/**
 * Show a confirm dialog (replacement for confirm() which doesn't work in panels)
 */
function showConfirmDialog(title: string, message: string, isDanger = true): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    const iconClass = isDanger ? 'danger' : 'warning';
    const btnClass = isDanger ? 'dialog-btn-danger' : 'dialog-btn-ok';
    const iconSvg = isDanger
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>';

    overlay.innerHTML = `
      <div class="dialog">
        <div class="dialog-header">
          <div class="dialog-icon ${iconClass}">${iconSvg}</div>
          <div class="dialog-title">${title}</div>
        </div>
        <div class="dialog-message">${message}</div>
        <div class="dialog-buttons">
          <button class="dialog-btn dialog-btn-cancel">Cancel</button>
          <button class="dialog-btn ${btnClass}">${isDanger ? 'Delete' : 'OK'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const okBtn = overlay.querySelector(`.${btnClass}`) as HTMLButtonElement;
    const cancelBtn = overlay.querySelector('.dialog-btn-cancel') as HTMLButtonElement;

    cancelBtn.focus();

    const close = (value: boolean) => {
      overlay.remove();
      resolve(value);
    };

    okBtn.addEventListener('click', () => close(true));
    cancelBtn.addEventListener('click', () => close(false));
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') close(true);
      if (e.key === 'Escape') close(false);
    });
  });
}

/**
 * Update the UI state (button enable/disable based on status)
 */
function updateUI(): void {
  const syncState = statusSync.getState();
  const status = syncState.status;

  // Update current loop input
  const loopCurrent = document.getElementById('loop-current') as HTMLInputElement;
  if (loopCurrent) {
    loopCurrent.value = String(syncState.currentLoop || 1);
  }

  // Update button states
  const btnPlay = document.getElementById('btn-play') as HTMLButtonElement;
  const btnPause = document.getElementById('btn-pause') as HTMLButtonElement;
  const btnStop = document.getElementById('btn-stop') as HTMLButtonElement;
  const btnPlayLoop = document.getElementById('btn-play-loop') as HTMLButtonElement;
  const btnRecord = document.getElementById('btn-record') as HTMLButtonElement;
  const btnSave = document.getElementById('btn-save') as HTMLButtonElement;
  const btnStopRecord = document.getElementById('btn-stop-record') as HTMLButtonElement;
  const btnEdit = document.getElementById('btn-edit') as HTMLButtonElement;

  const hasSelection = state.selectedMacro !== null;
  const isIdle = statusSync.isIdle();
  const isPlaying = status === 'playing';
  const isRecording = status === 'recording';

  if (btnPlay) {
    btnPlay.disabled = !hasSelection || !isIdle;
  }
  if (btnPause) {
    btnPause.disabled = !isPlaying;
  }
  if (btnStop) {
    btnStop.disabled = isIdle;
  }
  if (btnPlayLoop) {
    btnPlayLoop.disabled = !hasSelection || !isIdle;
  }
  if (btnRecord) {
    btnRecord.disabled = isRecording;
  }
  if (btnSave) {
    btnSave.disabled = !isRecording;
  }
  if (btnStopRecord) {
    btnStopRecord.disabled = !isRecording;
  }
  if (btnEdit) {
    btnEdit.disabled = !hasSelection;
  }
}

/**
 * Set panel status via StatusSync
 */
function setStatus(status: ExecutionStatus, message: string): void {
  statusSync.setStatus(status, message);
  updateUI();
}

/**
 * Handle macro selection from file tree
 */
function onMacroSelect(event: FileTreeSelectionEvent): void {
  if (event.node.isDirectory) {
    state.selectedMacro = null;
  } else {
    state.selectedMacro = event.node.path;

    if (event.action === 'play') {
      playMacro();
    }
  }
  updateUI();
}

/**
 * Play the selected macro
 */
async function playMacro(): Promise<void> {
  if (!state.selectedMacro) {
    setStatus('error', 'No macro selected');
    return;
  }

  try {
    statusSync.setMacro(state.selectedMacro);
    setStatus('playing', `Playing: ${state.selectedMacro}`);
    statusSync.setProgress(1, 1);
    updateUI();

    await sendToBackground('PLAY_MACRO', {
      path: state.selectedMacro,
      loop: false,
    });

    setStatus('idle', 'Playback complete');
    updateUI();
  } catch (error) {
    setStatus('error', `Error: ${String(error)}`);
    updateUI();
  }
}

/**
 * Play macro in loop mode
 */
async function playMacroLoop(): Promise<void> {
  if (!state.selectedMacro) {
    setStatus('error', 'No macro selected');
    return;
  }

  const maxLoopInput = document.getElementById('loop-max') as HTMLInputElement;
  const maxLoop = parseInt(maxLoopInput?.value || '1', 10);
  statusSync.setMaxLoop(maxLoop);

  try {
    statusSync.setMacro(state.selectedMacro);
    setStatus('playing', `Playing loop: ${state.selectedMacro}`);
    statusSync.setProgress(1, 1, maxLoop);
    updateUI();

    await sendToBackground('PLAY_MACRO', {
      path: state.selectedMacro,
      loop: true,
      maxLoop: maxLoop,
    });

    setStatus('idle', 'Loop playback complete');
    updateUI();
  } catch (error) {
    setStatus('error', `Error: ${String(error)}`);
    updateUI();
  }
}

/**
 * Pause playback
 */
async function pausePlayback(): Promise<void> {
  try {
    await sendToBackground('PAUSE_MACRO');
    setStatus('paused', 'Paused');
  } catch (error) {
    setStatus('error', `Error: ${String(error)}`);
  }
}

/**
 * Stop playback or recording
 */
async function stopExecution(): Promise<void> {
  try {
    await sendToBackground('STOP_MACRO');
    statusSync.reset();
    setStatus('idle', 'Stopped');
  } catch (error) {
    setStatus('error', `Error: ${String(error)}`);
  }
}

/**
 * Start recording
 */
async function startRecording(): Promise<void> {
  try {
    setStatus('recording', 'Recording...');
    statusSync.setProgress(0);
    updateUI();

    await sendToBackground('START_RECORDING');
  } catch (error) {
    setStatus('error', `Error: ${String(error)}`);
    updateUI();
  }
}

/**
 * Save recorded macro
 */
async function saveRecording(): Promise<void> {
  try {
    await sendToBackground('SAVE_RECORDING');
    setStatus('idle', 'Macro saved');
    updateUI();

    // Refresh file tree
    await loadMacroTree();
  } catch (error) {
    setStatus('error', `Error: ${String(error)}`);
  }
}

/**
 * Load macro file tree
 */
async function loadMacroTree(): Promise<void> {
  if (!fileTree) return;

  fileTree.showLoading();

  try {
    const response = await sendToBackground('GET_MACROS') as { files: string[] } | null;

    if (response && response.files) {
      const treeData = createTreeFromPaths(response.files, 'Macros');
      fileTree.setData(treeData);
    } else {
      // Show sample data for demo purposes
      const sampleData: FileTreeNode = {
        name: 'Macros',
        path: '',
        isDirectory: true,
        expanded: true,
        children: [
          {
            name: 'Demo',
            path: 'Demo',
            isDirectory: true,
            expanded: true,
            children: [
              { name: 'FillForms.iim', path: 'Demo/FillForms.iim', isDirectory: false },
              { name: 'ExtractTable.iim', path: 'Demo/ExtractTable.iim', isDirectory: false },
              { name: 'Login.iim', path: 'Demo/Login.iim', isDirectory: false },
            ],
          },
          {
            name: 'Samples',
            path: 'Samples',
            isDirectory: true,
            expanded: false,
            children: [
              { name: 'GoogleSearch.iim', path: 'Samples/GoogleSearch.iim', isDirectory: false },
              { name: 'Screenshot.iim', path: 'Samples/Screenshot.iim', isDirectory: false },
            ],
          },
        ],
      };
      fileTree.setData(sampleData);
    }
  } catch (error) {
    fileTree.showError('Failed to load macros');
    console.error('Failed to load macros:', error);
  }
}

/**
 * Setup tab switching
 */
function setupTabs(): void {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');

      // Update active tab button
      tabBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      // Update active panel
      tabPanels.forEach((panel) => {
        panel.classList.remove('active');
        if (panel.id === `tab-${tabId}`) {
          panel.classList.add('active');
        }
      });
    });
  });
}

/**
 * Setup event listeners for buttons
 */
function setupEventListeners(): void {
  // Play tab buttons
  document.getElementById('btn-play')?.addEventListener('click', playMacro);
  document.getElementById('btn-pause')?.addEventListener('click', pausePlayback);
  document.getElementById('btn-stop')?.addEventListener('click', stopExecution);
  document.getElementById('btn-play-loop')?.addEventListener('click', playMacroLoop);

  // Record tab buttons
  document.getElementById('btn-record')?.addEventListener('click', startRecording);
  document.getElementById('btn-save')?.addEventListener('click', saveRecording);
  document.getElementById('btn-stop-record')?.addEventListener('click', stopExecution);

  // Record options buttons
  document.getElementById('btn-record-options')?.addEventListener('click', () => {
    setStatus('idle', 'Record options not yet implemented');
  });
  document.getElementById('btn-save-page')?.addEventListener('click', () => {
    setStatus('idle', 'Save page not yet implemented');
  });
  document.getElementById('btn-screenshot')?.addEventListener('click', async () => {
    try {
      await sendToBackground('TAKE_SCREENSHOT');
      setStatus('idle', 'Screenshot taken');
    } catch (error) {
      setStatus('error', `Error: ${String(error)}`);
    }
  });
  document.getElementById('btn-clear-cache')?.addEventListener('click', async () => {
    try {
      await sendToBackground('CLEAR_CACHE');
      setStatus('idle', 'Cache cleared');
    } catch (error) {
      setStatus('error', `Error: ${String(error)}`);
    }
  });

  // Manage tab buttons
  document.getElementById('btn-edit')?.addEventListener('click', () => {
    if (state.selectedMacro) {
      sendToBackground('EDIT_MACRO', { path: state.selectedMacro });
    }
  });
  document.getElementById('btn-refresh')?.addEventListener('click', loadMacroTree);
  document.getElementById('btn-settings')?.addEventListener('click', () => {
    sendToBackground('OPEN_SETTINGS');
  });
  document.getElementById('btn-help')?.addEventListener('click', () => {
    window.open('https://wiki.imacros.net/', '_blank');
  });

  // Loop max input
  const loopMaxInput = document.getElementById('loop-max') as HTMLInputElement;
  loopMaxInput?.addEventListener('change', () => {
    let value = parseInt(loopMaxInput.value, 10);
    if (isNaN(value) || value < 1) value = 1;
    if (value > 99999) value = 99999;
    loopMaxInput.value = String(value);
    statusSync.setMaxLoop(value);
    updateUI();
  });
}


/**
 * Setup log viewer functionality
 */
function setupLogViewer(): void {
  const statusText = document.getElementById('status-text');
  const logViewer = document.getElementById('log-viewer');
  const logContent = document.getElementById('log-content');

  // Make status text clickable
  statusText?.classList.add('clickable');

  // Show log viewer when clicking status text
  statusText?.addEventListener('click', () => {
    renderLogs();
    logViewer?.classList.remove('hidden');
    // Scroll to bottom to show most recent logs
    if (logContent) {
      logContent.scrollTop = logContent.scrollHeight;
    }
  });

  // Close button
  document.getElementById('log-close')?.addEventListener('click', () => {
    logViewer?.classList.add('hidden');
  });

  // Close when clicking overlay background
  logViewer?.addEventListener('click', (e) => {
    if (e.target === logViewer) {
      logViewer.classList.add('hidden');
    }
  });

  // Copy button
  document.getElementById('log-copy')?.addEventListener('click', () => {
    const logs = statusSync.getLogs();
    const text = logs.map((e: LogEntry) => {
      const linePrefix = e.line ? `[${e.line}] ` : '';
      return `${new Date(e.timestamp).toLocaleTimeString()} ${linePrefix}${e.message}`;
    }).join('\n');
    navigator.clipboard.writeText(text);
  });

  // Clear button
  document.getElementById('log-clear')?.addEventListener('click', () => {
    statusSync.clearLogs();
    renderLogs();
  });

  function renderLogs(): void {
    if (!logContent) return;
    const logs = statusSync.getLogs();
    logContent.innerHTML = logs.map((e: LogEntry) => {
      const linePrefix = e.line ? `[${e.line}] ` : '';
      const escapedMsg = e.message.replace(/</g, '&lt;');
      return `
      <div class="log-entry ${e.type}">
        <span class="log-time">${new Date(e.timestamp).toLocaleTimeString()}</span>
        <span class="log-msg">${linePrefix}${escapedMsg}</span>
      </div>`;
    }).join('');
  }
}

/**
 * Initialize the panel
 */
function initializePanel(): void {
  // Initialize StatusSync with UI element bindings
  initializeStatusSync();

  // Add StatusSync listener for additional UI updates
  statusSync.addListener((event: StatusSyncEvent) => {
    // Update button states when status changes
    updateUI();

    // Handle specific events
    switch (event.type) {
      case 'complete':
        // Refresh file tree after recording is saved
        if (event.message === 'Recording saved') {
          loadMacroTree();
        }
        break;
      case 'error':
        console.error('[Panel] Error:', event.error.message);
        break;
    }
  });

  // Initialize file tree
  const treeContainer = document.getElementById('file-tree');
  if (treeContainer) {
    fileTree = new FileTree(treeContainer, {
      onSelect: onMacroSelect,
      onRefresh: loadMacroTree,
      // Inline editing callbacks
      onCreateFolder: async (parentPath, folderName) => {
        const newPath = parentPath ? `${parentPath}/${folderName}` : folderName;
        try {
          await sendToBackground('CREATE_FOLDER', { path: newPath });
          return true;
        } catch (err) {
          console.error('Failed to create folder:', err);
          return false;
        }
      },
      onRename: async (oldPath, newName) => {
        try {
          await sendToBackground('RENAME_FILE', { oldPath, newName });
          return true;
        } catch (err) {
          console.error('Failed to rename:', err);
          return false;
        }
      },
      onDelete: async (node) => {
        // Count items in folder
        const countItems = (n: typeof node): number => {
          if (!n.children) return 0;
          let count = 0;
          for (const child of n.children) {
            if (child.isDirectory) {
              count += countItems(child);
            } else {
              count++;
            }
          }
          return count;
        };

        let confirmed: boolean;
        if (node.isDirectory) {
          const hasContents = node.children && node.children.length > 0;
          if (hasContents) {
            const macroCount = countItems(node);
            const message = macroCount === 1
              ? `This will permanently delete the folder "${node.name}" and the 1 macro inside it.`
              : `This will permanently delete the folder "${node.name}" and all ${macroCount} macros inside it.`;
            confirmed = await showConfirmDialog('Delete Folder', message);
          } else {
            // Empty folder - no confirmation needed
            confirmed = true;
          }
        } else {
          // Individual file
          confirmed = await showConfirmDialog('Delete Macro', `Delete "${node.name}"?`);
        }

        if (!confirmed) return false;

        try {
          await sendToBackground('DELETE_FILE', { path: node.path });
          return true;
        } catch (err) {
          console.error('Failed to delete:', err);
          return false;
        }
      },
      // Context menu for play/edit actions only
      onContextMenu: async (event) => {
        if (event.action === 'play') {
          state.selectedMacro = event.node.path;
          playMacro();
        } else if (event.action === 'edit') {
          sendToBackground('EDIT_MACRO', { path: event.node.path });
        }
      },
      onMove: async (event) => {
        try {
          await sendToBackground('MOVE_FILE', {
            sourcePath: event.sourceNode.path,
            targetPath: event.targetNode.path,
          });
          loadMacroTree();
        } catch (err) {
          console.error('Failed to move:', err);
        }
      },
    });
    loadMacroTree();
  }

  // Setup tabs
  setupTabs();

  // Setup event listeners
  setupEventListeners();

  // Setup log viewer
  setupLogViewer();

  // Initial UI update
  updateUI();

  console.log('iMacros panel initialized');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePanel);
} else {
  initializePanel();
}
