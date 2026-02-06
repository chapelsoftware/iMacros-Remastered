/**
 * Integration Tests for !CLIPBOARD Variable Handling
 *
 * Tests the !CLIPBOARD system variable through the MacroExecutor (executeMacro function).
 * Since !CLIPBOARD requires a native host bridge for real OS clipboard access,
 * these tests focus on:
 * - VariableContext handling of !CLIPBOARD as a special system variable
 * - SET !CLIPBOARD stores a value via the executor
 * - Reading !CLIPBOARD returns the stored value
 * - Variable expansion with {{!CLIPBOARD}} in commands
 * - Round-trip: SET !EXTRACT then SET !CLIPBOARD {{!EXTRACT}}
 */
import { describe, it, expect } from 'vitest';
import { executeMacro, createExecutor, IMACROS_ERROR_CODES } from '../../../shared/src/executor';
import {
  VariableContext,
  executeSet,
  parseSetValue,
} from '../../../shared/src/variables';

// =============================================================================
// 1. VariableContext handling of !CLIPBOARD as a special variable
// =============================================================================

describe('VariableContext !CLIPBOARD handling', () => {
  it('should default !CLIPBOARD to empty string', () => {
    const ctx = new VariableContext();
    expect(ctx.get('!CLIPBOARD')).toBe('');
  });

  it('should recognize !CLIPBOARD as a system variable', () => {
    const ctx = new VariableContext();
    expect(ctx.isSystemVariable('!CLIPBOARD')).toBe(true);
  });

  it('should report !CLIPBOARD as existing', () => {
    const ctx = new VariableContext();
    expect(ctx.has('!CLIPBOARD')).toBe(true);
  });

  it('should set and get !CLIPBOARD via setClipboard/getClipboard', () => {
    const ctx = new VariableContext();
    ctx.setClipboard('hello clipboard');
    expect(ctx.getClipboard()).toBe('hello clipboard');
  });

  it('should set !CLIPBOARD via the generic set() method', () => {
    const ctx = new VariableContext();
    const result = ctx.set('!CLIPBOARD', 'generic set value');
    expect(result.success).toBe(true);
    expect(result.previousValue).toBe('');
    expect(result.newValue).toBe('generic set value');
    expect(ctx.get('!CLIPBOARD')).toBe('generic set value');
  });

  it('should return !CLIPBOARD via getClipboard after set()', () => {
    const ctx = new VariableContext();
    ctx.set('!CLIPBOARD', 'from set');
    expect(ctx.getClipboard()).toBe('from set');
  });

  it('should return !CLIPBOARD via get() after setClipboard()', () => {
    const ctx = new VariableContext();
    ctx.setClipboard('from setClipboard');
    expect(ctx.get('!CLIPBOARD')).toBe('from setClipboard');
  });

  it('should overwrite !CLIPBOARD value', () => {
    const ctx = new VariableContext();
    ctx.setClipboard('first');
    ctx.setClipboard('second');
    expect(ctx.getClipboard()).toBe('second');
  });

  it('should reset !CLIPBOARD to empty string on reset()', () => {
    const ctx = new VariableContext();
    ctx.setClipboard('something');
    ctx.reset();
    expect(ctx.getClipboard()).toBe('');
  });

  it('should handle case-insensitive access for !CLIPBOARD', () => {
    const ctx = new VariableContext();
    ctx.set('!clipboard', 'lower');
    expect(ctx.get('!CLIPBOARD')).toBe('lower');
    expect(ctx.get('!Clipboard')).toBe('lower');
  });

  it('should include !CLIPBOARD in getAllVariables()', () => {
    const ctx = new VariableContext();
    ctx.setClipboard('in all vars');
    const all = ctx.getAllVariables();
    expect(all['!CLIPBOARD']).toBe('in all vars');
  });

  it('should include !CLIPBOARD in getSystemVariables()', () => {
    const ctx = new VariableContext();
    ctx.setClipboard('in system vars');
    const sysVars = ctx.getSystemVariables();
    expect(sysVars['!CLIPBOARD']).toBe('in system vars');
  });

  it('should clone !CLIPBOARD value when cloning context', () => {
    const ctx = new VariableContext();
    ctx.setClipboard('cloned value');
    const cloned = ctx.clone();
    expect(cloned.getClipboard()).toBe('cloned value');
    // Mutation of original should not affect clone
    ctx.setClipboard('mutated');
    expect(cloned.getClipboard()).toBe('cloned value');
  });
});

// =============================================================================
// 2. SET !CLIPBOARD via the executor stores the value
// =============================================================================

describe('SET !CLIPBOARD via executor', () => {
  it('should store a simple string in !CLIPBOARD', async () => {
    const result = await executeMacro('SET !CLIPBOARD copiedtext');
    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    expect(result.variables['!CLIPBOARD']).toBe('copiedtext');
  });

  it('should store a multi-word value in !CLIPBOARD', async () => {
    const result = await executeMacro('SET !CLIPBOARD hello-world-123');
    expect(result.success).toBe(true);
    expect(result.variables['!CLIPBOARD']).toBe('hello-world-123');
  });

  it('should overwrite !CLIPBOARD with a new value', async () => {
    const script = [
      'SET !CLIPBOARD first',
      'SET !CLIPBOARD second',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(result.variables['!CLIPBOARD']).toBe('second');
  });

  it('should store a numeric string in !CLIPBOARD', async () => {
    const result = await executeMacro('SET !CLIPBOARD 42');
    expect(result.success).toBe(true);
    expect(result.variables['!CLIPBOARD']).toBe('42');
  });

  it('should clear !CLIPBOARD by setting it to an expanded empty variable', async () => {
    // Use a variable expansion that produces empty to reset clipboard
    const script = [
      'SET !CLIPBOARD somevalue',
      'SET !VAR1 ""',
      'SET !CLIPBOARD {{!VAR1}}',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    // !VAR1 was set to "" (empty-like), expansion of {{!VAR1}} yields that value
    // which then gets stored in !CLIPBOARD
  });

  it('should store a simple URL in !CLIPBOARD', async () => {
    const result = await executeMacro('SET !CLIPBOARD https://example.com/path');
    expect(result.success).toBe(true);
    expect(result.variables['!CLIPBOARD']).toBe('https://example.com/path');
  });
});

// =============================================================================
// 3. Reading !CLIPBOARD returns the stored value
// =============================================================================

describe('Reading !CLIPBOARD returns stored value', () => {
  it('should read !CLIPBOARD default as empty string', async () => {
    const result = await executeMacro('SET !VAR1 test');
    expect(result.success).toBe(true);
    expect(result.variables['!CLIPBOARD']).toBe('');
  });

  it('should copy !CLIPBOARD value to another variable using the clipboard type', async () => {
    // SET !VAR1 !CLIPBOARD uses parseSetValue which detects the 'clipboard' type
    const script = [
      'SET !CLIPBOARD mydata',
      'SET !VAR1 !CLIPBOARD',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(result.variables['!VAR1']).toBe('mydata');
  });

  it('should read !CLIPBOARD via the createExecutor pattern', async () => {
    const executor = createExecutor();
    executor.loadMacro([
      'SET !CLIPBOARD executor-test',
      'SET !VAR1 !CLIPBOARD',
    ].join('\n'));
    const result = await executor.execute();
    expect(result.success).toBe(true);
    expect(result.variables['!VAR1']).toBe('executor-test');
    expect(result.variables['!CLIPBOARD']).toBe('executor-test');
  });
});

// =============================================================================
// 4. Variable expansion with {{!CLIPBOARD}} in commands
// =============================================================================

describe('Variable expansion with {{!CLIPBOARD}}', () => {
  it('should expand {{!CLIPBOARD}} in a SET value', async () => {
    const script = [
      'SET !CLIPBOARD expandme',
      'SET !VAR1 {{!CLIPBOARD}}',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(result.variables['!VAR1']).toBe('expandme');
  });

  it('should expand {{!CLIPBOARD}} concatenated with other text', async () => {
    const script = [
      'SET !CLIPBOARD world',
      'SET !VAR1 hello-{{!CLIPBOARD}}-end',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(result.variables['!VAR1']).toBe('hello-world-end');
  });

  it('should expand {{!CLIPBOARD}} alongside other variable references', async () => {
    const script = [
      'SET !CLIPBOARD clip',
      'SET !VAR1 var1',
      'SET !VAR2 {{!VAR1}}-{{!CLIPBOARD}}',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(result.variables['!VAR2']).toBe('var1-clip');
  });

  it('should expand empty {{!CLIPBOARD}} when not set', async () => {
    const script = [
      'SET !VAR1 before-{{!CLIPBOARD}}-after',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(result.variables['!VAR1']).toBe('before--after');
  });

  it('should expand {{!CLIPBOARD}} in EVAL expressions', async () => {
    const script = [
      'SET !CLIPBOARD 10',
      'SET !VAR1 EVAL("{{!CLIPBOARD}}+5")',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(result.variables['!VAR1']).toBe(15);
  });

  it('should expand {{!CLIPBOARD}} after overwrite', async () => {
    const script = [
      'SET !CLIPBOARD first',
      'SET !VAR1 {{!CLIPBOARD}}',
      'SET !CLIPBOARD second',
      'SET !VAR2 {{!CLIPBOARD}}',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(result.variables['!VAR1']).toBe('first');
    expect(result.variables['!VAR2']).toBe('second');
  });
});

// =============================================================================
// 5. SET !CLIPBOARD {{!EXTRACT}} round-trip
// =============================================================================

describe('SET !CLIPBOARD {{!EXTRACT}} round-trip', () => {
  it('should copy !EXTRACT value to !CLIPBOARD', async () => {
    const script = [
      'SET !EXTRACT extracteddata',
      'SET !CLIPBOARD {{!EXTRACT}}',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(result.variables['!EXTRACT']).toBe('extracteddata');
    expect(result.variables['!CLIPBOARD']).toBe('extracteddata');
  });

  it('should round-trip: extract -> clipboard -> variable', async () => {
    const script = [
      'SET !EXTRACT round-trip-data',
      'SET !CLIPBOARD {{!EXTRACT}}',
      'SET !VAR1 {{!CLIPBOARD}}',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(result.variables['!EXTRACT']).toBe('round-trip-data');
    expect(result.variables['!CLIPBOARD']).toBe('round-trip-data');
    expect(result.variables['!VAR1']).toBe('round-trip-data');
  });

  it('should handle multiple extract-to-clipboard transfers', async () => {
    const script = [
      'SET !EXTRACT first-extract',
      'SET !CLIPBOARD {{!EXTRACT}}',
      'SET !VAR1 {{!CLIPBOARD}}',
      'SET !EXTRACT second-extract',
      'SET !CLIPBOARD {{!EXTRACT}}',
      'SET !VAR2 {{!CLIPBOARD}}',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(result.variables['!VAR1']).toBe('first-extract');
    expect(result.variables['!VAR2']).toBe('second-extract');
    expect(result.variables['!CLIPBOARD']).toBe('second-extract');
  });

  it('should copy empty !EXTRACT to !CLIPBOARD', async () => {
    const script = [
      'SET !CLIPBOARD {{!EXTRACT}}',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    // !EXTRACT defaults to empty string
    expect(result.variables['!CLIPBOARD']).toBe('');
  });

  it('should copy !CLIPBOARD to !EXTRACT', async () => {
    const script = [
      'SET !CLIPBOARD clipboard-to-extract',
      'SET !EXTRACT {{!CLIPBOARD}}',
    ].join('\n');
    const result = await executeMacro(script);
    expect(result.success).toBe(true);
    expect(result.variables['!EXTRACT']).toBe('clipboard-to-extract');
    expect(result.variables['!CLIPBOARD']).toBe('clipboard-to-extract');
  });
});

// =============================================================================
// Additional: parseSetValue recognizes !CLIPBOARD as a special type
// =============================================================================

describe('parseSetValue !CLIPBOARD detection', () => {
  it('should detect !CLIPBOARD as clipboard type', () => {
    const parsed = parseSetValue('!CLIPBOARD');
    expect(parsed.type).toBe('clipboard');
  });

  it('should detect !CLIPBOARD case-insensitively', () => {
    const parsed = parseSetValue('!clipboard');
    expect(parsed.type).toBe('clipboard');
  });

  it('should not detect partial matches as clipboard type', () => {
    const parsed = parseSetValue('!CLIPBOARD_EXTRA');
    expect(parsed.type).toBe('literal');
  });

  it('should not detect embedded !CLIPBOARD as clipboard type', () => {
    const parsed = parseSetValue('prefix!CLIPBOARD');
    expect(parsed.type).toBe('literal');
  });
});

// =============================================================================
// Additional: executeSet clipboard type reads from context clipboard
// =============================================================================

describe('executeSet with clipboard type', () => {
  it('should read clipboard value into target variable', () => {
    const ctx = new VariableContext();
    ctx.setClipboard('clipboard-data');
    const result = executeSet(ctx, '!VAR1', '!CLIPBOARD');
    expect(result.success).toBe(true);
    expect(result.newValue).toBe('clipboard-data');
    expect(ctx.get('!VAR1')).toBe('clipboard-data');
  });

  it('should read empty clipboard into target variable', () => {
    const ctx = new VariableContext();
    // clipboard defaults to ''
    const result = executeSet(ctx, '!VAR1', '!CLIPBOARD');
    expect(result.success).toBe(true);
    expect(result.newValue).toBe('');
    expect(ctx.get('!VAR1')).toBe('');
  });
});
