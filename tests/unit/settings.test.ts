/**
 * Unit Tests for iMacros Settings Module
 *
 * Tests settings types, defaults, replay speed presets, visual effects toggles,
 * hotkey parsing, and utility functions.
 */
import { describe, it, expect } from 'vitest';
import {
  ReplaySpeedPreset,
  REPLAY_SPEED_DELAYS,
  getReplaySpeedDelay,
  customSpeedToDelay,
  Settings,
  DEFAULT_SETTINGS,
  mergeWithDefaults,
  getEffectiveCommandDelay,
  getVisualEffectsSettings,
  parseHotkey,
  matchesHotkey,
} from '@shared/settings';

describe('Settings Module', () => {
  describe('ReplaySpeedPreset', () => {
    it('should have Fast preset with 0ms delay', () => {
      expect(REPLAY_SPEED_DELAYS.Fast).toBe(0);
    });

    it('should have Medium preset with 500ms delay', () => {
      expect(REPLAY_SPEED_DELAYS.Medium).toBe(500);
    });

    it('should have Slow preset with 1500ms delay', () => {
      expect(REPLAY_SPEED_DELAYS.Slow).toBe(1500);
    });
  });

  describe('getReplaySpeedDelay()', () => {
    it('should return correct delay for Fast preset', () => {
      expect(getReplaySpeedDelay('Fast')).toBe(0);
    });

    it('should return correct delay for Medium preset', () => {
      expect(getReplaySpeedDelay('Medium')).toBe(500);
    });

    it('should return correct delay for Slow preset', () => {
      expect(getReplaySpeedDelay('Slow')).toBe(1500);
    });

    it('should return Medium delay for unknown preset', () => {
      // TypeScript would prevent this, but test runtime behavior
      expect(getReplaySpeedDelay('Unknown' as ReplaySpeedPreset)).toBe(500);
    });
  });

  describe('customSpeedToDelay()', () => {
    it('should return 0ms for speed 10 (fastest)', () => {
      expect(customSpeedToDelay(10)).toBe(0);
    });

    it('should return 2000ms for speed 0 (slowest)', () => {
      expect(customSpeedToDelay(0)).toBe(2000);
    });

    it('should return 1000ms for speed 5 (middle)', () => {
      expect(customSpeedToDelay(5)).toBe(1000);
    });

    it('should clamp values below 0 to 0', () => {
      expect(customSpeedToDelay(-5)).toBe(2000);
    });

    it('should clamp values above 10 to 10', () => {
      expect(customSpeedToDelay(15)).toBe(0);
    });

    it('should handle decimal values', () => {
      // 7.5 -> (10 - 7.5) * 200 = 500
      expect(customSpeedToDelay(7.5)).toBe(500);
    });
  });

  describe('DEFAULT_SETTINGS', () => {
    it('should have all required properties', () => {
      expect(DEFAULT_SETTINGS).toHaveProperty('pathMacros');
      expect(DEFAULT_SETTINGS).toHaveProperty('pathDatasources');
      expect(DEFAULT_SETTINGS).toHaveProperty('pathDownloads');
      expect(DEFAULT_SETTINGS).toHaveProperty('pathLogs');
      expect(DEFAULT_SETTINGS).toHaveProperty('recordMousemove');
      expect(DEFAULT_SETTINGS).toHaveProperty('recordScreenshots');
      expect(DEFAULT_SETTINGS).toHaveProperty('recordCoordinates');
      expect(DEFAULT_SETTINGS).toHaveProperty('recordDirectScreen');
      expect(DEFAULT_SETTINGS).toHaveProperty('timeoutPage');
      expect(DEFAULT_SETTINGS).toHaveProperty('timeoutTag');
      expect(DEFAULT_SETTINGS).toHaveProperty('timeoutStep');
      expect(DEFAULT_SETTINGS).toHaveProperty('timeoutDownload');
      expect(DEFAULT_SETTINGS).toHaveProperty('encryptionEnabled');
      expect(DEFAULT_SETTINGS).toHaveProperty('masterPassword');
      expect(DEFAULT_SETTINGS).toHaveProperty('siEnabled');
      expect(DEFAULT_SETTINGS).toHaveProperty('siPort');
      expect(DEFAULT_SETTINGS).toHaveProperty('siLocalhostOnly');
      expect(DEFAULT_SETTINGS).toHaveProperty('errorContinue');
      expect(DEFAULT_SETTINGS).toHaveProperty('debugMode');
      expect(DEFAULT_SETTINGS).toHaveProperty('replaySpeed');
      expect(DEFAULT_SETTINGS).toHaveProperty('replaySpeedPreset');
      expect(DEFAULT_SETTINGS).toHaveProperty('visualEffectScrollToElement');
      expect(DEFAULT_SETTINGS).toHaveProperty('visualEffectHighlightElement');
      expect(DEFAULT_SETTINGS).toHaveProperty('toggleSidebarHotkey');
      expect(DEFAULT_SETTINGS).toHaveProperty('externalEditorPath');
    });

    it('should have sensible defaults for replay speed', () => {
      expect(DEFAULT_SETTINGS.replaySpeedPreset).toBe('Medium');
      expect(DEFAULT_SETTINGS.replaySpeed).toBe(5);
    });

    it('should have visual effects enabled by default', () => {
      expect(DEFAULT_SETTINGS.visualEffectScrollToElement).toBe(true);
      expect(DEFAULT_SETTINGS.visualEffectHighlightElement).toBe(true);
    });

    it('should have default hotkey set', () => {
      expect(DEFAULT_SETTINGS.toggleSidebarHotkey).toBe('Ctrl+Shift+M');
    });

    it('should have empty external editor path by default', () => {
      expect(DEFAULT_SETTINGS.externalEditorPath).toBe('');
    });

    it('should have SI enabled by default', () => {
      expect(DEFAULT_SETTINGS.siEnabled).toBe(true);
      expect(DEFAULT_SETTINGS.siPort).toBe(4951);
      expect(DEFAULT_SETTINGS.siLocalhostOnly).toBe(true);
    });

    it('should have reasonable timeout defaults', () => {
      expect(DEFAULT_SETTINGS.timeoutPage).toBe(60);
      expect(DEFAULT_SETTINGS.timeoutTag).toBe(10);
      expect(DEFAULT_SETTINGS.timeoutStep).toBe(0);
      expect(DEFAULT_SETTINGS.timeoutDownload).toBe(300);
    });
  });

  describe('mergeWithDefaults()', () => {
    it('should return defaults when given empty object', () => {
      const result = mergeWithDefaults({});
      expect(result).toEqual(DEFAULT_SETTINGS);
    });

    it('should override specific properties', () => {
      const result = mergeWithDefaults({
        replaySpeedPreset: 'Fast',
        debugMode: true,
      });
      expect(result.replaySpeedPreset).toBe('Fast');
      expect(result.debugMode).toBe(true);
      expect(result.siPort).toBe(DEFAULT_SETTINGS.siPort);
    });

    it('should not modify the original DEFAULT_SETTINGS', () => {
      const originalPreset = DEFAULT_SETTINGS.replaySpeedPreset;
      mergeWithDefaults({ replaySpeedPreset: 'Slow' });
      expect(DEFAULT_SETTINGS.replaySpeedPreset).toBe(originalPreset);
    });

    it('should handle all settings being overridden', () => {
      const customSettings: Partial<Settings> = {
        pathMacros: '/custom/macros',
        pathDatasources: '/custom/data',
        pathDownloads: '/custom/downloads',
        pathLogs: '/custom/logs',
        recordMousemove: true,
        recordScreenshots: true,
        recordCoordinates: true,
        recordDirectScreen: false,
        timeoutPage: 120,
        timeoutTag: 20,
        timeoutStep: 5,
        timeoutDownload: 600,
        encryptionEnabled: true,
        masterPassword: 'secret',
        siEnabled: false,
        siPort: 9000,
        siLocalhostOnly: false,
        errorContinue: true,
        debugMode: true,
        replaySpeed: 8,
        replaySpeedPreset: 'Fast',
        visualEffectScrollToElement: false,
        visualEffectHighlightElement: false,
        toggleSidebarHotkey: 'Ctrl+Alt+I',
        externalEditorPath: '/usr/bin/vim',
      };

      const result = mergeWithDefaults(customSettings);

      expect(result.pathMacros).toBe('/custom/macros');
      expect(result.replaySpeedPreset).toBe('Fast');
      expect(result.visualEffectScrollToElement).toBe(false);
      expect(result.externalEditorPath).toBe('/usr/bin/vim');
    });
  });

  describe('getEffectiveCommandDelay()', () => {
    it('should return Fast preset delay when preset is Fast', () => {
      const settings = mergeWithDefaults({ replaySpeedPreset: 'Fast' });
      expect(getEffectiveCommandDelay(settings)).toBe(0);
    });

    it('should return Medium preset delay when preset is Medium', () => {
      const settings = mergeWithDefaults({ replaySpeedPreset: 'Medium' });
      expect(getEffectiveCommandDelay(settings)).toBe(500);
    });

    it('should return Slow preset delay when preset is Slow', () => {
      const settings = mergeWithDefaults({ replaySpeedPreset: 'Slow' });
      expect(getEffectiveCommandDelay(settings)).toBe(1500);
    });

    it('should fall back to custom speed when preset is invalid', () => {
      const settings = mergeWithDefaults({
        replaySpeedPreset: '' as ReplaySpeedPreset,
        replaySpeed: 8,
      });
      // Speed 8 -> (10 - 8) * 200 = 400ms
      expect(getEffectiveCommandDelay(settings)).toBe(400);
    });

    it('should use preset even when custom speed differs', () => {
      const settings = mergeWithDefaults({
        replaySpeedPreset: 'Slow',
        replaySpeed: 10, // Fast custom speed
      });
      // Preset takes precedence
      expect(getEffectiveCommandDelay(settings)).toBe(1500);
    });
  });

  describe('getVisualEffectsSettings()', () => {
    it('should extract visual effects settings', () => {
      const settings = mergeWithDefaults({
        visualEffectScrollToElement: true,
        visualEffectHighlightElement: false,
      });

      const visualEffects = getVisualEffectsSettings(settings);

      expect(visualEffects.scrollToElement).toBe(true);
      expect(visualEffects.highlightElement).toBe(false);
    });

    it('should return both enabled by default', () => {
      const visualEffects = getVisualEffectsSettings(DEFAULT_SETTINGS);

      expect(visualEffects.scrollToElement).toBe(true);
      expect(visualEffects.highlightElement).toBe(true);
    });

    it('should return both disabled when set', () => {
      const settings = mergeWithDefaults({
        visualEffectScrollToElement: false,
        visualEffectHighlightElement: false,
      });

      const visualEffects = getVisualEffectsSettings(settings);

      expect(visualEffects.scrollToElement).toBe(false);
      expect(visualEffects.highlightElement).toBe(false);
    });
  });

  describe('parseHotkey()', () => {
    it('should parse simple hotkey', () => {
      const result = parseHotkey('Ctrl+M');
      expect(result.ctrl).toBe(true);
      expect(result.alt).toBe(false);
      expect(result.shift).toBe(false);
      expect(result.meta).toBe(false);
      expect(result.key).toBe('M');
    });

    it('should parse hotkey with multiple modifiers', () => {
      const result = parseHotkey('Ctrl+Shift+M');
      expect(result.ctrl).toBe(true);
      expect(result.alt).toBe(false);
      expect(result.shift).toBe(true);
      expect(result.meta).toBe(false);
      expect(result.key).toBe('M');
    });

    it('should parse hotkey with all modifiers', () => {
      const result = parseHotkey('Ctrl+Alt+Shift+Meta+K');
      expect(result.ctrl).toBe(true);
      expect(result.alt).toBe(true);
      expect(result.shift).toBe(true);
      expect(result.meta).toBe(true);
      expect(result.key).toBe('K');
    });

    it('should be case-insensitive for modifiers', () => {
      const result = parseHotkey('ctrl+SHIFT+m');
      expect(result.ctrl).toBe(true);
      expect(result.shift).toBe(true);
      expect(result.key).toBe('m');
    });

    it('should handle Control as alias for Ctrl', () => {
      const result = parseHotkey('Control+A');
      expect(result.ctrl).toBe(true);
      expect(result.key).toBe('A');
    });

    it('should handle Cmd/Command as alias for Meta', () => {
      const result1 = parseHotkey('Cmd+C');
      expect(result1.meta).toBe(true);

      const result2 = parseHotkey('Command+V');
      expect(result2.meta).toBe(true);
    });

    it('should handle function keys', () => {
      const result = parseHotkey('Ctrl+F12');
      expect(result.ctrl).toBe(true);
      expect(result.key).toBe('F12');
    });

    it('should handle special keys', () => {
      const result = parseHotkey('Ctrl+Enter');
      expect(result.ctrl).toBe(true);
      expect(result.key).toBe('Enter');
    });

    it('should handle spaces in hotkey string', () => {
      const result = parseHotkey('Ctrl + Shift + M');
      expect(result.ctrl).toBe(true);
      expect(result.shift).toBe(true);
      expect(result.key).toBe('M');
    });

    it('should return empty key for modifier-only string', () => {
      const result = parseHotkey('Ctrl+Shift');
      expect(result.ctrl).toBe(true);
      expect(result.shift).toBe(true);
      expect(result.key).toBe('');
    });

    it('should handle single key without modifiers', () => {
      const result = parseHotkey('F1');
      expect(result.ctrl).toBe(false);
      expect(result.alt).toBe(false);
      expect(result.shift).toBe(false);
      expect(result.meta).toBe(false);
      expect(result.key).toBe('F1');
    });
  });

  describe('matchesHotkey()', () => {
    // Create mock keyboard events
    function createKeyboardEvent(options: {
      key: string;
      ctrlKey?: boolean;
      altKey?: boolean;
      shiftKey?: boolean;
      metaKey?: boolean;
    }): KeyboardEvent {
      return {
        key: options.key,
        ctrlKey: options.ctrlKey ?? false,
        altKey: options.altKey ?? false,
        shiftKey: options.shiftKey ?? false,
        metaKey: options.metaKey ?? false,
      } as KeyboardEvent;
    }

    it('should match simple hotkey', () => {
      const event = createKeyboardEvent({ key: 'm', ctrlKey: true });
      expect(matchesHotkey(event, 'Ctrl+M')).toBe(true);
    });

    it('should match hotkey with multiple modifiers', () => {
      const event = createKeyboardEvent({ key: 'm', ctrlKey: true, shiftKey: true });
      expect(matchesHotkey(event, 'Ctrl+Shift+M')).toBe(true);
    });

    it('should not match when modifier is missing', () => {
      const event = createKeyboardEvent({ key: 'm', ctrlKey: true });
      expect(matchesHotkey(event, 'Ctrl+Shift+M')).toBe(false);
    });

    it('should not match when extra modifier is present', () => {
      const event = createKeyboardEvent({ key: 'm', ctrlKey: true, shiftKey: true, altKey: true });
      expect(matchesHotkey(event, 'Ctrl+Shift+M')).toBe(false);
    });

    it('should not match when key is different', () => {
      const event = createKeyboardEvent({ key: 'k', ctrlKey: true, shiftKey: true });
      expect(matchesHotkey(event, 'Ctrl+Shift+M')).toBe(false);
    });

    it('should be case-insensitive for key matching', () => {
      const event = createKeyboardEvent({ key: 'M', ctrlKey: true });
      expect(matchesHotkey(event, 'Ctrl+m')).toBe(true);
    });

    it('should match function keys', () => {
      const event = createKeyboardEvent({ key: 'F12', ctrlKey: true });
      expect(matchesHotkey(event, 'Ctrl+F12')).toBe(true);
    });

    it('should match special keys', () => {
      const event = createKeyboardEvent({ key: 'Enter', ctrlKey: true });
      expect(matchesHotkey(event, 'Ctrl+Enter')).toBe(true);
    });

    it('should match Meta/Cmd modifier', () => {
      const event = createKeyboardEvent({ key: 'c', metaKey: true });
      expect(matchesHotkey(event, 'Meta+C')).toBe(true);
      expect(matchesHotkey(event, 'Cmd+C')).toBe(true);
    });

    it('should not match when no modifiers in event but required in hotkey', () => {
      const event = createKeyboardEvent({ key: 'm' });
      expect(matchesHotkey(event, 'Ctrl+M')).toBe(false);
    });

    it('should match key-only hotkey', () => {
      const event = createKeyboardEvent({ key: 'F1' });
      expect(matchesHotkey(event, 'F1')).toBe(true);
    });
  });

  describe('Settings Type Safety', () => {
    it('should allow valid replay speed presets', () => {
      const fast: ReplaySpeedPreset = 'Fast';
      const medium: ReplaySpeedPreset = 'Medium';
      const slow: ReplaySpeedPreset = 'Slow';

      expect(fast).toBe('Fast');
      expect(medium).toBe('Medium');
      expect(slow).toBe('Slow');
    });

    it('should have correct types for all settings properties', () => {
      const settings: Settings = DEFAULT_SETTINGS;

      // Type assertions through usage
      expect(typeof settings.pathMacros).toBe('string');
      expect(typeof settings.recordMousemove).toBe('boolean');
      expect(typeof settings.timeoutPage).toBe('number');
      expect(typeof settings.replaySpeedPreset).toBe('string');
      expect(typeof settings.visualEffectScrollToElement).toBe('boolean');
      expect(typeof settings.toggleSidebarHotkey).toBe('string');
      expect(typeof settings.externalEditorPath).toBe('string');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty hotkey string', () => {
      const result = parseHotkey('');
      expect(result.ctrl).toBe(false);
      expect(result.alt).toBe(false);
      expect(result.shift).toBe(false);
      expect(result.meta).toBe(false);
      expect(result.key).toBe('');
    });

    it('should handle whitespace-only hotkey string', () => {
      const result = parseHotkey('   ');
      expect(result.key).toBe('');
    });

    it('should handle NaN speed value', () => {
      expect(customSpeedToDelay(NaN)).toBe(2000); // Clamps to 0, so max delay
    });

    it('should handle Infinity speed value', () => {
      // Infinity is treated as invalid, defaulting to slowest delay
      expect(customSpeedToDelay(Infinity)).toBe(2000);
    });

    it('should handle null/undefined in mergeWithDefaults', () => {
      const result = mergeWithDefaults({
        pathMacros: undefined as unknown as string,
      });
      // undefined should override, resulting in undefined
      expect(result.pathMacros).toBeUndefined();
    });
  });

  describe('Integration Scenarios', () => {
    it('should support typical user workflow: change preset to Fast', () => {
      let settings = mergeWithDefaults({});
      expect(getEffectiveCommandDelay(settings)).toBe(500); // Default Medium

      settings = mergeWithDefaults({ replaySpeedPreset: 'Fast' });
      expect(getEffectiveCommandDelay(settings)).toBe(0);
    });

    it('should support disabling all visual effects', () => {
      const settings = mergeWithDefaults({
        visualEffectScrollToElement: false,
        visualEffectHighlightElement: false,
      });

      const effects = getVisualEffectsSettings(settings);
      expect(effects.scrollToElement).toBe(false);
      expect(effects.highlightElement).toBe(false);
    });

    it('should support custom hotkey configuration', () => {
      const settings = mergeWithDefaults({
        toggleSidebarHotkey: 'Alt+I',
      });

      const event = {
        key: 'i',
        ctrlKey: false,
        altKey: true,
        shiftKey: false,
        metaKey: false,
      } as KeyboardEvent;

      expect(matchesHotkey(event, settings.toggleSidebarHotkey)).toBe(true);
    });

    it('should support external editor path on Windows', () => {
      const settings = mergeWithDefaults({
        externalEditorPath: 'C:\\Program Files\\Notepad++\\notepad++.exe',
      });

      expect(settings.externalEditorPath).toContain('notepad++.exe');
    });

    it('should support external editor path on Unix', () => {
      const settings = mergeWithDefaults({
        externalEditorPath: '/usr/bin/vim',
      });

      expect(settings.externalEditorPath).toBe('/usr/bin/vim');
    });
  });
});
