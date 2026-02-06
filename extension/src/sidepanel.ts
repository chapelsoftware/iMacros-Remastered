/**
 * Extension side panel script
 */
import { createMessageId, createTimestamp } from '@shared/index';

let isRecording = false;
let selectedMacro: string | null = null;

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
 * Initialize the side panel UI
 */
function initializeSidePanel(): void {
  const container = document.getElementById('app');
  if (!container) return;

  container.innerHTML = `
    <div class="imacros-sidepanel">
      <header class="header">
        <h1>iMacros</h1>
        <span class="version">v1.0.0</span>
      </header>

      <section class="controls">
        <button id="btn-ping" class="btn btn-primary">Test Connection</button>
        <button id="btn-record" class="btn btn-secondary">Record</button>
        <button id="btn-play" class="btn btn-secondary">Play</button>
      </section>

      <section class="status">
        <div id="status-message">Ready</div>
      </section>

      <section class="macros">
        <h2>Macros</h2>
        <ul id="macro-list" class="macro-list">
          <li class="empty">No macros available</li>
        </ul>
      </section>
    </div>
  `;

  // Set up event listeners
  document.getElementById('btn-ping')?.addEventListener('click', async () => {
    setStatus('Testing connection...');
    try {
      const response = await sendToBackground('ping');
      setStatus('Connection successful: ' + JSON.stringify(response));
    } catch (error) {
      setStatus('Connection failed: ' + String(error));
    }
  });

  document.getElementById('btn-record')?.addEventListener('click', async () => {
    if (!isRecording) {
      isRecording = true;
      setStatus('Recording...');
      try {
        await sendToBackground('START_RECORDING');
      } catch (error) {
        setStatus('Failed to start recording: ' + String(error));
        isRecording = false;
      }
    } else {
      isRecording = false;
      setStatus('Recording stopped');
      try {
        await sendToBackground('RECORD_STOP');
      } catch (error) {
        setStatus('Failed to stop recording: ' + String(error));
      }
    }
  });

  document.getElementById('btn-play')?.addEventListener('click', async () => {
    if (!selectedMacro) {
      setStatus('No macro selected');
      return;
    }
    setStatus('Playing macro: ' + selectedMacro);
    try {
      await sendToBackground('PLAY_MACRO', { path: selectedMacro, loop: false });
      setStatus('Macro finished: ' + selectedMacro);
    } catch (error) {
      setStatus('Playback failed: ' + String(error));
    }
  });

  // Load macros into the list
  loadMacros();
}

/**
 * Load macros from background and populate the macro list
 */
async function loadMacros(): Promise<void> {
  const listEl = document.getElementById('macro-list');
  if (!listEl) return;

  try {
    const response = (await sendToBackground('GET_MACROS')) as {
      macros?: { path: string; name: string }[];
    };
    const macros = response?.macros ?? [];

    if (macros.length === 0) {
      listEl.innerHTML = '<li class="empty">No macros available</li>';
      return;
    }

    listEl.innerHTML = '';
    for (const macro of macros) {
      const li = document.createElement('li');
      li.textContent = macro.name ?? macro.path;
      li.dataset.path = macro.path;
      li.addEventListener('click', () => {
        // Remove active class from all items
        listEl.querySelectorAll('li').forEach((el) => el.classList.remove('active'));
        li.classList.add('active');
        selectedMacro = macro.path;
        setStatus('Selected: ' + (macro.name ?? macro.path));
      });
      listEl.appendChild(li);
    }
  } catch (error) {
    listEl.innerHTML = '<li class="empty">Failed to load macros</li>';
    console.error('Failed to load macros:', error);
  }
}

/**
 * Update the status message
 */
function setStatus(message: string): void {
  const statusEl = document.getElementById('status-message');
  if (statusEl) {
    statusEl.textContent = message;
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSidePanel);
} else {
  initializeSidePanel();
}

console.log('iMacros side panel loaded');
