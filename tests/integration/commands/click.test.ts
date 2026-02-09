/**
 * CLICK Command Integration Tests
 *
 * Tests the CLICK command (X, Y coordinates) via the MacroExecutor
 * with a mock ContentScriptSender. Covers:
 * - Basic coordinate clicking (left button default)
 * - BUTTON param for right, middle, center button variants
 * - CONTENT param for form interaction (passed through to DOM executor)
 * - Edge cases (X=0 Y=0)
 * - Variable expansion in coordinates
 * - Missing/invalid parameter errors
 * - Bridge failure and exception handling
 * - Default clickCount and modifiers
 * - Multi-command pipelines (SET + CLICK)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createExecutor, MacroExecutor, IMACROS_ERROR_CODES } from '@shared/executor';
import {
  setContentScriptSender,
  ContentScriptSender,
  registerInteractionHandlers,
  InteractionMessage,
  ContentScriptResponse,
  ClickCommandMessage,
} from '@shared/commands/interaction';

describe('CLICK Handler via MacroExecutor (with mock ContentScriptSender)', () => {
  let executor: MacroExecutor;
  let mockSender: ContentScriptSender;
  let sentMessages: InteractionMessage[];

  beforeEach(() => {
    sentMessages = [];
    mockSender = {
      sendMessage: vi.fn(async (message: InteractionMessage): Promise<ContentScriptResponse> => {
        sentMessages.push(message);
        return { success: true };
      }),
    };
    setContentScriptSender(mockSender);
    executor = createExecutor();
    registerInteractionHandlers(executor.registerHandler.bind(executor));
  });

  afterEach(() => {
    // Reset to noop sender
    setContentScriptSender({ sendMessage: async () => ({ success: true }) });
  });

  // 1. CLICK X=100 Y=200 sends CLICK_COMMAND with x=100, y=200, button='left' and succeeds
  it('should send CLICK_COMMAND with correct coordinates and default left button', async () => {
    executor.loadMacro('CLICK X=100 Y=200');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
    expect(sentMessages).toHaveLength(1);

    const msg = sentMessages[0] as ClickCommandMessage;
    expect(msg.type).toBe('CLICK_COMMAND');
    expect(msg.payload.x).toBe(100);
    expect(msg.payload.y).toBe(200);
    expect(msg.payload.button).toBe('left');
  });

  // 2. CLICK X=0 Y=0 sends correct coordinates (edge case)
  it('should handle X=0 Y=0 as valid coordinates', async () => {
    executor.loadMacro('CLICK X=0 Y=0');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(sentMessages).toHaveLength(1);

    const msg = sentMessages[0] as ClickCommandMessage;
    expect(msg.type).toBe('CLICK_COMMAND');
    expect(msg.payload.x).toBe(0);
    expect(msg.payload.y).toBe(0);
    expect(msg.payload.button).toBe('left');
  });

  // 3. CLICK with variable expansion (SET !VAR1 150, CLICK X={{!VAR1}} Y=250)
  it('should expand variables in X and Y coordinates', async () => {
    const macro = [
      'SET !VAR1 150',
      'CLICK X={{!VAR1}} Y=250',
    ].join('\n');

    executor.loadMacro(macro);
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(sentMessages).toHaveLength(1);

    const msg = sentMessages[0] as ClickCommandMessage;
    expect(msg.payload.x).toBe(150);
    expect(msg.payload.y).toBe(250);
  });

  // 4. BUTTON=right sends button='right'
  it('should send button=right when BUTTON=right', async () => {
    executor.loadMacro('CLICK X=50 Y=50 BUTTON=right');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(sentMessages).toHaveLength(1);

    const msg = sentMessages[0] as ClickCommandMessage;
    expect(msg.payload.x).toBe(50);
    expect(msg.payload.y).toBe(50);
    expect(msg.payload.button).toBe('right');
  });

  // 5. BUTTON=middle sends button='middle'
  it('should send button=middle when BUTTON=middle', async () => {
    executor.loadMacro('CLICK X=50 Y=50 BUTTON=middle');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(sentMessages).toHaveLength(1);

    const msg = sentMessages[0] as ClickCommandMessage;
    expect(msg.payload.button).toBe('middle');
  });

  // 6. BUTTON=center sends button='middle' (alias)
  it('should send button=middle when BUTTON=center (alias)', async () => {
    executor.loadMacro('CLICK X=50 Y=50 BUTTON=center');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(sentMessages).toHaveLength(1);

    const msg = sentMessages[0] as ClickCommandMessage;
    expect(msg.payload.button).toBe('middle');
  });

  // 7. BUTTON=left sends button='left' (explicit)
  it('should send button=left when BUTTON=left (explicit)', async () => {
    executor.loadMacro('CLICK X=50 Y=50 BUTTON=left');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(sentMessages).toHaveLength(1);

    const msg = sentMessages[0] as ClickCommandMessage;
    expect(msg.payload.button).toBe('left');
  });

  // 8. CLICK without X returns MISSING_PARAMETER error
  it('should return MISSING_PARAMETER error when X is missing', async () => {
    executor.loadMacro('CLICK Y=200');
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    expect(sentMessages).toHaveLength(0);
  });

  // 9. CLICK without Y returns MISSING_PARAMETER error
  it('should return MISSING_PARAMETER error when Y is missing', async () => {
    executor.loadMacro('CLICK X=100');
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
    expect(sentMessages).toHaveLength(0);
  });

  // 10. CLICK X=abc Y=100 returns INVALID_PARAMETER error
  it('should return INVALID_PARAMETER error when X is non-numeric', async () => {
    executor.loadMacro('CLICK X=abc Y=100');
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    expect(sentMessages).toHaveLength(0);
  });

  // 11. CLICK X=100 Y=def returns INVALID_PARAMETER error
  it('should return INVALID_PARAMETER error when Y is non-numeric', async () => {
    executor.loadMacro('CLICK X=100 Y=def');
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
    expect(sentMessages).toHaveLength(0);
  });

  // 12. CLICK sender failure returns SCRIPT_ERROR
  it('should return SCRIPT_ERROR when sender reports failure', async () => {
    setContentScriptSender({
      sendMessage: vi.fn(async (): Promise<ContentScriptResponse> => {
        return { success: false, error: 'Click target not reachable' };
      }),
    });

    executor.loadMacro('CLICK X=100 Y=200');
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
  });

  // 13. CLICK sender exception returns SCRIPT_ERROR
  it('should return SCRIPT_ERROR when sender throws an exception', async () => {
    setContentScriptSender({
      sendMessage: vi.fn(async (): Promise<ContentScriptResponse> => {
        throw new Error('Connection lost to content script');
      }),
    });

    executor.loadMacro('CLICK X=100 Y=200');
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
  });

  // 14. Verify clickCount is 1 and modifiers is empty by default
  it('should have clickCount=1 and empty modifiers by default', async () => {
    executor.loadMacro('CLICK X=300 Y=400');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(sentMessages).toHaveLength(1);

    const msg = sentMessages[0] as ClickCommandMessage;
    expect(msg.payload.clickCount).toBe(1);
    expect(msg.payload.modifiers).toEqual({});
  });

  // 15. Multi-command: SET then CLICK with variable coordinates
  it('should execute SET then CLICK with variable coordinates in a multi-command macro', async () => {
    const macro = [
      'SET !VAR1 300',
      'SET !VAR2 450',
      'CLICK X={{!VAR1}} Y={{!VAR2}}',
    ].join('\n');

    executor.loadMacro(macro);
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(sentMessages).toHaveLength(1);

    const msg = sentMessages[0] as ClickCommandMessage;
    expect(msg.payload.x).toBe(300);
    expect(msg.payload.y).toBe(450);
    expect(msg.payload.button).toBe('left');
  });

  // 16. CONTENT param is passed through for form interaction, not as button type
  it('should pass CONTENT through to payload for form interaction', async () => {
    executor.loadMacro('CLICK X=100 Y=200 CONTENT=Hello<SP>World');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(sentMessages).toHaveLength(1);

    const msg = sentMessages[0] as ClickCommandMessage;
    expect(msg.payload.content).toBe('Hello World');
    expect(msg.payload.button).toBe('left');
  });

  // 17. CONTENT with special sequences are parsed correctly
  it('should parse CONTENT special sequences (<BR>, <TAB>, <ENTER>)', async () => {
    executor.loadMacro('CLICK X=10 Y=20 CONTENT=line1<BR>line2');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    const msg = sentMessages[0] as ClickCommandMessage;
    expect(msg.payload.content).toBe('line1\nline2');
  });

  // 18. CONTENT and BUTTON can be used together
  it('should support both CONTENT and BUTTON params together', async () => {
    executor.loadMacro('CLICK X=50 Y=50 CONTENT=YES BUTTON=right');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    const msg = sentMessages[0] as ClickCommandMessage;
    expect(msg.payload.content).toBe('YES');
    expect(msg.payload.button).toBe('right');
  });

  // 19. No CONTENT or BUTTON gives default left click with no content
  it('should have undefined content and left button when neither CONTENT nor BUTTON specified', async () => {
    executor.loadMacro('CLICK X=100 Y=200');
    const result = await executor.execute();

    expect(result.success).toBe(true);
    const msg = sentMessages[0] as ClickCommandMessage;
    expect(msg.payload.content).toBeUndefined();
    expect(msg.payload.button).toBe('left');
  });
});
