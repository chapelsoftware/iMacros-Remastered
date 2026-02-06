/**
 * iMacros Settings Types
 *
 * Shared settings types and utilities used by both the extension and native host.
 */

import type { TrustedSite } from './security';
import { DEFAULT_SECURITY_SETTINGS } from './security';

// ============================================================================
// Replay Speed
// ============================================================================

/**
 * Replay speed presets
 */
export type ReplaySpeedPreset = 'Fast' | 'Medium' | 'Slow';

/**
 * Map replay speed presets to delay values in milliseconds
 */
export const REPLAY_SPEED_DELAYS: Record<ReplaySpeedPreset, number> = {
  Fast: 0,
  Medium: 500,
  Slow: 1500,
};

/**
 * Get the delay in milliseconds for a replay speed preset
 */
export function getReplaySpeedDelay(preset: ReplaySpeedPreset): number {
  return REPLAY_SPEED_DELAYS[preset] ?? REPLAY_SPEED_DELAYS.Medium;
}

/**
 * Convert a custom speed value (0-10 slider) to a delay in milliseconds
 * 0 = fastest (no delay), 10 = slowest (2000ms delay)
 */
export function customSpeedToDelay(speed: number): number {
  // Handle NaN/invalid values by defaulting to slowest speed (0)
  if (isNaN(speed) || !isFinite(speed)) {
    return 2000; // Slowest delay
  }
  // Clamp speed to 0-10 range
  const clampedSpeed = Math.max(0, Math.min(10, speed));
  // Invert: 10 = fast, 0 = slow
  // Map to 0-2000ms delay
  return Math.round((10 - clampedSpeed) * 200);
}

// ============================================================================
// Settings Interface
// ============================================================================

/**
 * All configurable settings for iMacros
 */
export interface Settings {
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

  /** @deprecated Use replaySpeedPreset instead */
  replaySpeed: number;

  // Replay speed preset (Fast/Medium/Slow)
  replaySpeedPreset: ReplaySpeedPreset;

  // Visual effects toggles
  visualEffectScrollToElement: boolean;
  visualEffectHighlightElement: boolean;

  // Toggle sidebar hotkey (keyboard shortcut)
  toggleSidebarHotkey: string;

  // External editor path
  externalEditorPath: string;

  // Security settings
  showUntrustedWarnings: boolean;
  trustLocalMacros: boolean;
  allowUrlMacros: boolean;
  allowEmbeddedMacros: boolean;
  trustedSites: TrustedSite[];
}

/**
 * Default settings values
 */
export const DEFAULT_SETTINGS: Settings = {
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

  // Replay speed preset (Fast/Medium/Slow)
  replaySpeedPreset: 'Medium',

  // Visual effects toggles
  visualEffectScrollToElement: true,
  visualEffectHighlightElement: true,

  // Toggle sidebar hotkey (keyboard shortcut)
  toggleSidebarHotkey: 'Ctrl+Shift+M',

  // External editor path
  externalEditorPath: '',

  // Security settings (from security module defaults)
  showUntrustedWarnings: DEFAULT_SECURITY_SETTINGS.showUntrustedWarnings,
  trustLocalMacros: DEFAULT_SECURITY_SETTINGS.trustLocalMacros,
  allowUrlMacros: DEFAULT_SECURITY_SETTINGS.allowUrlMacros,
  allowEmbeddedMacros: DEFAULT_SECURITY_SETTINGS.allowEmbeddedMacros,
  trustedSites: DEFAULT_SECURITY_SETTINGS.trustedSites,
};

/**
 * Merge partial settings with defaults
 */
export function mergeWithDefaults(partial: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...partial };
}

/**
 * Get the effective command delay based on settings
 * Uses replaySpeedPreset if set, otherwise falls back to custom replaySpeed
 */
export function getEffectiveCommandDelay(settings: Settings): number {
  // If a preset is set, use its delay
  if (settings.replaySpeedPreset && settings.replaySpeedPreset in REPLAY_SPEED_DELAYS) {
    return getReplaySpeedDelay(settings.replaySpeedPreset);
  }
  // Fall back to custom speed
  return customSpeedToDelay(settings.replaySpeed);
}

/**
 * Visual effects settings subset
 */
export interface VisualEffectsSettings {
  scrollToElement: boolean;
  highlightElement: boolean;
}

/**
 * Extract visual effects settings from full settings
 */
export function getVisualEffectsSettings(settings: Settings): VisualEffectsSettings {
  return {
    scrollToElement: settings.visualEffectScrollToElement,
    highlightElement: settings.visualEffectHighlightElement,
  };
}

/**
 * Parse a hotkey string into its components
 */
export function parseHotkey(hotkey: string): {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  key: string;
} {
  const parts = hotkey.split('+').map(p => p.trim());
  const result = {
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
    key: '',
  };

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'ctrl' || lower === 'control') {
      result.ctrl = true;
    } else if (lower === 'alt') {
      result.alt = true;
    } else if (lower === 'shift') {
      result.shift = true;
    } else if (lower === 'meta' || lower === 'cmd' || lower === 'command') {
      result.meta = true;
    } else {
      // Assume it's the main key
      result.key = part;
    }
  }

  return result;
}

/**
 * Check if a keyboard event matches a hotkey string
 */
export function matchesHotkey(event: KeyboardEvent, hotkey: string): boolean {
  const parsed = parseHotkey(hotkey);

  if (event.ctrlKey !== parsed.ctrl) return false;
  if (event.altKey !== parsed.alt) return false;
  if (event.shiftKey !== parsed.shift) return false;
  if (event.metaKey !== parsed.meta) return false;

  // Compare key (case-insensitive)
  return event.key.toLowerCase() === parsed.key.toLowerCase();
}
