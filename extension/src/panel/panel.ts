/**
 * iMacros Panel - Main UI Controller
 * Handles the side panel interface for macro playback, recording, and management
 */

import { createMessageId, createTimestamp } from '@shared/index';
import { FileTree, FileTreeNode, createTreeFromPaths, FileTreeSelectionEvent } from './file-tree';
import { statusSync, initializeStatusSync, StatusSyncEvent, ExecutionStatus } from './status-sync';

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
      onContextMenu: (event) => {
        if (event.action === 'play') {
          state.selectedMacro = event.node.path;
          playMacro();
        } else if (event.action === 'edit') {
          sendToBackground('EDIT_MACRO', { path: event.node.path });
        }
      },
    });
    loadMacroTree();
  }

  // Setup tabs
  setupTabs();

  // Setup event listeners
  setupEventListeners();

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
