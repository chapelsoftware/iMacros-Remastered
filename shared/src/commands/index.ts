/**
 * Command Handlers Index
 *
 * Exports all command handler modules for registration with the executor.
 */

// Navigation commands
export * from './navigation';

// Extraction commands (EXTRACT, SEARCH)
export * from './extraction';

// Interaction commands (TAG, CLICK, EVENT)
export * from './interaction';

// Flow control commands (WAIT, PAUSE, PROMPT)
export * from './flow';

// Dialog commands (ONDIALOG, ONLOGIN, ONCERTIFICATEDIALOG, etc.)
export * from './dialogs';

// Download commands (ONDOWNLOAD, SAVEAS, SAVEITEM)
export * from './downloads';

// System commands (CMDLINE, STOPWATCH, VERSION, DISCONNECT, REDIAL)
export * from './system';

// Browser commands (CLEAR, FILTER, PROXY, SCREENSHOT)
export * from './browser';

// File commands (FILEDELETE)
export * from './files';
