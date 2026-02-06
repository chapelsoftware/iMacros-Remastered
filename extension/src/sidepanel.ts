/**
 * Extension side panel script
 */
import { createMessageId, createTimestamp } from '@shared/index';

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

  document.getElementById('btn-record')?.addEventListener('click', () => {
    setStatus('Recording not yet implemented');
  });

  document.getElementById('btn-play')?.addEventListener('click', () => {
    setStatus('Playback not yet implemented');
  });
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
