/**
 * iMacros Options Page
 * Handles settings configuration, persistence, and synchronization with native host
 */

// ============================================================================
// Types
// ============================================================================

/**
 * All configurable settings
 */
interface Settings {
  // Folder paths
  pathMacros: string;
  pathDatasources: string;
  pathDownloads: string;
  pathLogs: string;

  // Recording options
  recordMousemove: boolean;
  recordScreenshots: boolean;
  recordCoordinates: boolean;
  recordDirectScreen: boolean;

  // Timeout defaults (in seconds)
  timeoutPage: number;
  timeoutTag: number;
  timeoutStep: number;
  timeoutDownload: number;

  // Encryption settings
  encryptionEnabled: boolean;
  masterPassword: string;

  // Scripting Interface
  siEnabled: boolean;
  siPort: number;
  siLocalhostOnly: boolean;

  // Advanced settings
  errorContinue: boolean;
  debugMode: boolean;
  replaySpeed: number;
}

/**
 * Default settings values
 */
const DEFAULT_SETTINGS: Settings = {
  // Folder paths (empty = use native host defaults)
  pathMacros: '',
  pathDatasources: '',
  pathDownloads: '',
  pathLogs: '',

  // Recording options
  recordMousemove: false,
  recordScreenshots: false,
  recordCoordinates: false,
  recordDirectScreen: true,

  // Timeout defaults
  timeoutPage: 60,
  timeoutTag: 10,
  timeoutStep: 0,
  timeoutDownload: 300,

  // Encryption settings
  encryptionEnabled: false,
  masterPassword: '',

  // Scripting Interface
  siEnabled: true,
  siPort: 4951,
  siLocalhostOnly: true,

  // Advanced settings
  errorContinue: false,
  debugMode: false,
  replaySpeed: 5,
};

// ============================================================================
// DOM Elements
// ============================================================================

const form = document.getElementById('options-form') as HTMLFormElement;
const statusMessage = document.getElementById('status-message') as HTMLDivElement;
const btnSave = document.getElementById('btn-save') as HTMLButtonElement;
const btnReset = document.getElementById('btn-reset') as HTMLButtonElement;
const togglePassword = document.getElementById('toggle-password') as HTMLButtonElement;
const masterPasswordInput = document.getElementById('master-password') as HTMLInputElement;
const masterPasswordConfirm = document.getElementById('master-password-confirm') as HTMLInputElement;
const passwordMatchStatus = document.getElementById('password-match-status') as HTMLSpanElement;
const encryptionEnabled = document.getElementById('encryption-enabled') as HTMLInputElement;
const siEnabled = document.getElementById('si-enabled') as HTMLInputElement;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Show status message
 */
function showStatus(message: string, type: 'success' | 'error' | 'info'): void {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;

  // Auto-hide after 5 seconds for success messages
  if (type === 'success') {
    setTimeout(() => {
      statusMessage.classList.add('hidden');
    }, 5000);
  }
}

/**
 * Hide status message
 */
function hideStatus(): void {
  statusMessage.classList.add('hidden');
}

/**
 * Update encryption fields visibility
 */
function updateEncryptionFieldsVisibility(): void {
  const encryptionFields = document.querySelectorAll('.encryption-field');
  encryptionFields.forEach((field) => {
    field.classList.toggle('hidden', !encryptionEnabled.checked);
  });
}

/**
 * Update SI fields visibility
 */
function updateSIFieldsVisibility(): void {
  const siFields = document.querySelectorAll('.si-field');
  siFields.forEach((field) => {
    field.classList.toggle('hidden', !siEnabled.checked);
  });
}

/**
 * Validate password match
 */
function validatePasswordMatch(): boolean {
  const password = masterPasswordInput.value;
  const confirm = masterPasswordConfirm.value;

  if (!encryptionEnabled.checked || (!password && !confirm)) {
    passwordMatchStatus.textContent = '';
    passwordMatchStatus.className = '';
    return true;
  }

  if (password === confirm) {
    passwordMatchStatus.textContent = 'Passwords match';
    passwordMatchStatus.className = 'match';
    return true;
  } else {
    passwordMatchStatus.textContent = 'Passwords do not match';
    passwordMatchStatus.className = 'no-match';
    return false;
  }
}

/**
 * Get form values as Settings object
 */
function getFormValues(): Settings {
  const formData = new FormData(form);

  return {
    pathMacros: (formData.get('pathMacros') as string) || '',
    pathDatasources: (formData.get('pathDatasources') as string) || '',
    pathDownloads: (formData.get('pathDownloads') as string) || '',
    pathLogs: (formData.get('pathLogs') as string) || '',

    recordMousemove: formData.get('recordMousemove') === 'on',
    recordScreenshots: formData.get('recordScreenshots') === 'on',
    recordCoordinates: formData.get('recordCoordinates') === 'on',
    recordDirectScreen: formData.get('recordDirectScreen') === 'on',

    timeoutPage: parseInt(formData.get('timeoutPage') as string, 10) || DEFAULT_SETTINGS.timeoutPage,
    timeoutTag: parseInt(formData.get('timeoutTag') as string, 10) || DEFAULT_SETTINGS.timeoutTag,
    timeoutStep: parseInt(formData.get('timeoutStep') as string, 10) || 0,
    timeoutDownload: parseInt(formData.get('timeoutDownload') as string, 10) || DEFAULT_SETTINGS.timeoutDownload,

    encryptionEnabled: formData.get('encryptionEnabled') === 'on',
    masterPassword: (formData.get('masterPassword') as string) || '',

    siEnabled: formData.get('siEnabled') === 'on',
    siPort: parseInt(formData.get('siPort') as string, 10) || DEFAULT_SETTINGS.siPort,
    siLocalhostOnly: formData.get('siLocalhostOnly') === 'on',

    errorContinue: formData.get('errorContinue') === 'on',
    debugMode: formData.get('debugMode') === 'on',
    replaySpeed: parseInt(formData.get('replaySpeed') as string, 10) || DEFAULT_SETTINGS.replaySpeed,
  };
}

/**
 * Set form values from Settings object
 */
function setFormValues(settings: Settings): void {
  // Text/number inputs
  (document.getElementById('path-macros') as HTMLInputElement).value = settings.pathMacros;
  (document.getElementById('path-datasources') as HTMLInputElement).value = settings.pathDatasources;
  (document.getElementById('path-downloads') as HTMLInputElement).value = settings.pathDownloads;
  (document.getElementById('path-logs') as HTMLInputElement).value = settings.pathLogs;

  (document.getElementById('timeout-page') as HTMLInputElement).value = settings.timeoutPage.toString();
  (document.getElementById('timeout-tag') as HTMLInputElement).value = settings.timeoutTag.toString();
  (document.getElementById('timeout-step') as HTMLInputElement).value = settings.timeoutStep.toString();
  (document.getElementById('timeout-download') as HTMLInputElement).value = settings.timeoutDownload.toString();

  (document.getElementById('si-port') as HTMLInputElement).value = settings.siPort.toString();
  (document.getElementById('replay-speed') as HTMLInputElement).value = settings.replaySpeed.toString();

  // Checkboxes
  (document.getElementById('record-mousemove') as HTMLInputElement).checked = settings.recordMousemove;
  (document.getElementById('record-screenshots') as HTMLInputElement).checked = settings.recordScreenshots;
  (document.getElementById('record-coordinates') as HTMLInputElement).checked = settings.recordCoordinates;
  (document.getElementById('record-direct-screen') as HTMLInputElement).checked = settings.recordDirectScreen;

  (document.getElementById('encryption-enabled') as HTMLInputElement).checked = settings.encryptionEnabled;
  // Note: We don't restore the master password for security reasons

  (document.getElementById('si-enabled') as HTMLInputElement).checked = settings.siEnabled;
  (document.getElementById('si-localhost-only') as HTMLInputElement).checked = settings.siLocalhostOnly;

  (document.getElementById('error-continue') as HTMLInputElement).checked = settings.errorContinue;
  (document.getElementById('debug-mode') as HTMLInputElement).checked = settings.debugMode;

  // Update visibility
  updateEncryptionFieldsVisibility();
  updateSIFieldsVisibility();
}

// ============================================================================
// Storage Functions
// ============================================================================

/**
 * Load settings from chrome.storage.sync
 */
async function loadSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get('settings', (result) => {
      const settings = result.settings
        ? { ...DEFAULT_SETTINGS, ...result.settings }
        : { ...DEFAULT_SETTINGS };
      resolve(settings);
    });
  });
}

/**
 * Save settings to chrome.storage.sync
 */
async function saveSettings(settings: Settings): Promise<void> {
  // Don't store the master password in chrome.storage for security
  // Instead, we'll send it to the native host which can store it securely
  const storageSettings = { ...settings };
  delete (storageSettings as Partial<Settings>).masterPassword;

  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ settings: storageSettings }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Send settings update to native host
 */
async function sendSettingsToNativeHost(settings: Settings): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: 'SETTINGS_UPDATE',
        payload: settings,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn('Failed to send settings to native host:', chrome.runtime.lastError.message);
          // Don't reject - native host might not be running
          resolve();
        } else if (response?.success) {
          resolve();
        } else {
          console.warn('Native host did not acknowledge settings update');
          resolve();
        }
      }
    );
  });
}

/**
 * Request folder browse from native host
 */
async function browseFolderPath(currentPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: 'BROWSE_FOLDER',
        payload: { currentPath },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn('Failed to browse folder:', chrome.runtime.lastError.message);
          resolve(null);
        } else if (response?.success && response.path) {
          resolve(response.path);
        } else {
          resolve(null);
        }
      }
    );
  });
}

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Handle form submission
 */
async function handleSave(event: Event): Promise<void> {
  event.preventDefault();

  // Validate password match if encryption is enabled
  if (encryptionEnabled.checked && !validatePasswordMatch()) {
    showStatus('Passwords do not match. Please correct and try again.', 'error');
    return;
  }

  const settings = getFormValues();

  try {
    btnSave.disabled = true;
    btnSave.textContent = 'Saving...';

    // Save to chrome.storage.sync
    await saveSettings(settings);

    // Send to native host
    await sendSettingsToNativeHost(settings);

    showStatus('Settings saved successfully!', 'success');
  } catch (error) {
    console.error('Failed to save settings:', error);
    showStatus(`Failed to save settings: ${error}`, 'error');
  } finally {
    btnSave.disabled = false;
    btnSave.textContent = 'Save Settings';
  }
}

/**
 * Handle reset to defaults
 */
function handleReset(): void {
  if (confirm('Are you sure you want to reset all settings to their default values?')) {
    setFormValues(DEFAULT_SETTINGS);
    showStatus('Settings reset to defaults. Click "Save Settings" to apply.', 'info');
  }
}

/**
 * Handle password visibility toggle
 */
function handleTogglePassword(): void {
  const isPassword = masterPasswordInput.type === 'password';
  masterPasswordInput.type = isPassword ? 'text' : 'password';
  masterPasswordConfirm.type = isPassword ? 'text' : 'password';
  togglePassword.textContent = isPassword ? 'Hide' : 'Show';
}

/**
 * Handle browse button clicks
 */
async function handleBrowse(event: Event): Promise<void> {
  const button = event.target as HTMLButtonElement;
  const fieldName = button.dataset.browse;
  if (!fieldName) return;

  const input = document.querySelector(`input[name="${fieldName}"]`) as HTMLInputElement;
  if (!input) return;

  const newPath = await browseFolderPath(input.value);
  if (newPath) {
    input.value = newPath;
  }
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the options page
 */
async function init(): Promise<void> {
  console.log('[iMacros] Options page initializing...');

  // Load saved settings
  try {
    const settings = await loadSettings();
    setFormValues(settings);
    console.log('[iMacros] Settings loaded:', settings);
  } catch (error) {
    console.error('[iMacros] Failed to load settings:', error);
    showStatus('Failed to load settings. Using defaults.', 'error');
    setFormValues(DEFAULT_SETTINGS);
  }

  // Set up event listeners
  form.addEventListener('submit', handleSave);
  btnReset.addEventListener('click', handleReset);
  togglePassword.addEventListener('click', handleTogglePassword);

  // Password validation on input
  masterPasswordInput.addEventListener('input', validatePasswordMatch);
  masterPasswordConfirm.addEventListener('input', validatePasswordMatch);

  // Encryption toggle
  encryptionEnabled.addEventListener('change', updateEncryptionFieldsVisibility);

  // SI toggle
  siEnabled.addEventListener('change', updateSIFieldsVisibility);

  // Browse buttons
  document.querySelectorAll('[data-browse]').forEach((button) => {
    button.addEventListener('click', handleBrowse);
  });

  // Listen for storage changes (sync across tabs/devices)
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes.settings) {
      console.log('[iMacros] Settings changed externally:', changes.settings.newValue);
      const newSettings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
      setFormValues(newSettings);
      showStatus('Settings updated from another device/tab.', 'info');
    }
  });

  console.log('[iMacros] Options page initialized');
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
