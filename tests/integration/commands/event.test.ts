/**
 * EVENT / EVENTS Command Integration Tests
 *
 * Tests the EVENT and EVENTS commands via the MacroExecutor
 * with a mock ContentScriptSender. Covers:
 * - Mouse events (click, dblclick, mouseover, mousedown)
 * - Keyboard events (keydown, keypress with KEY and CHAR)
 * - Selector targeting (CSS, XPATH, SELECTOR with prefixes, plain selector)
 * - Modifier keys (ctrl+shift, alt,meta)
 * - Error cases (missing TYPE, sender failure, sender exception)
 * - EVENTS alias
 * - Variable expansion in TYPE parameter
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createExecutor, MacroExecutor, IMACROS_ERROR_CODES } from '@shared/executor';
import {
  setContentScriptSender,
  ContentScriptSender,
  registerInteractionHandlers,
  InteractionMessage,
  ContentScriptResponse,
  EventCommandMessage,
} from '@shared/commands/interaction';

describe('EVENT Handler via MacroExecutor (with mock ContentScriptSender)', () => {
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
    setContentScriptSender({ sendMessage: async () => ({ success: true }) });
  });

  // ===== Mouse Events =====

  describe('Mouse events', () => {
    // 1. EVENT TYPE=click sends EVENT_COMMAND with eventType='click', bubbles=true, cancelable=true
    it('should send EVENT_COMMAND with eventType=click, bubbles=true, cancelable=true', async () => {
      executor.loadMacro('EVENT TYPE=click');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as EventCommandMessage;
      expect(msg.type).toBe('EVENT_COMMAND');
      expect(msg.payload.eventType).toBe('click');
      expect(msg.payload.bubbles).toBe(true);
      expect(msg.payload.cancelable).toBe(true);
    });

    // 2. EVENT TYPE=dblclick sends eventType='dblclick'
    it('should send eventType=dblclick', async () => {
      executor.loadMacro('EVENT TYPE=dblclick');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as EventCommandMessage;
      expect(msg.type).toBe('EVENT_COMMAND');
      expect(msg.payload.eventType).toBe('dblclick');
    });

    // 3. EVENT TYPE=mouseover POINT=100,200 sends point={x:100,y:200}
    it('should send point={x:100,y:200} for mouseover with POINT param', async () => {
      executor.loadMacro('EVENT TYPE=mouseover POINT=100,200');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as EventCommandMessage;
      expect(msg.payload.eventType).toBe('mouseover');
      expect(msg.payload.point).toEqual({ x: 100, y: 200 });
    });

    // 4. EVENT TYPE=mousedown BUTTON=2 sends button=2
    it('should send button=2 for mousedown with BUTTON param', async () => {
      executor.loadMacro('EVENT TYPE=mousedown BUTTON=2');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as EventCommandMessage;
      expect(msg.payload.eventType).toBe('mousedown');
      expect(msg.payload.button).toBe(2);
    });
  });

  // ===== Keyboard Events =====

  describe('Keyboard events', () => {
    // 5. EVENT TYPE=keydown KEY=Enter sends key='Enter'
    it('should send key=Enter for keydown with KEY param', async () => {
      executor.loadMacro('EVENT TYPE=keydown KEY=Enter');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as EventCommandMessage;
      expect(msg.payload.eventType).toBe('keydown');
      expect(msg.payload.key).toBe('Enter');
    });

    // 6. EVENT TYPE=keypress CHAR=a KEY=65 sends char='a', key='a' (65 resolved to 'a')
    it('should send char=a and key=a for keypress with CHAR and KEY=65', async () => {
      executor.loadMacro('EVENT TYPE=keypress CHAR=a KEY=65');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as EventCommandMessage;
      expect(msg.payload.eventType).toBe('keypress');
      expect(msg.payload.char).toBe('a');
      expect(msg.payload.key).toBe('a'); // KEY=65 resolves to 'a' (integer keycode)
    });
  });

  // ===== Selector Targeting =====

  describe('Selector targeting', () => {
    // 7. EVENT TYPE=click CSS=.my-button sends selector with css='.my-button'
    it('should send selector with css=.my-button when CSS param is used', async () => {
      executor.loadMacro('EVENT TYPE=click CSS=.my-button');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as EventCommandMessage;
      expect(msg.payload.selector).toBeDefined();
      expect(msg.payload.selector!.css).toBe('.my-button');
    });

    // 8. EVENT TYPE=click XPATH=//button sends selector with xpath='//button'
    it('should send selector with xpath=//button when XPATH param is used', async () => {
      executor.loadMacro('EVENT TYPE=click XPATH=//button');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as EventCommandMessage;
      expect(msg.payload.selector).toBeDefined();
      expect(msg.payload.selector!.xpath).toBe('//button');
    });

    // 9. EVENT TYPE=click SELECTOR=CSS:.my-btn sends selector with css='.my-btn'
    it('should send selector with css=.my-btn when SELECTOR=CSS:.my-btn', async () => {
      executor.loadMacro('EVENT TYPE=click SELECTOR=CSS:.my-btn');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as EventCommandMessage;
      expect(msg.payload.selector).toBeDefined();
      expect(msg.payload.selector!.css).toBe('.my-btn');
    });

    // 10. EVENT TYPE=click SELECTOR=XPATH://div sends selector with xpath='//div'
    it('should send selector with xpath=//div when SELECTOR=XPATH://div', async () => {
      executor.loadMacro('EVENT TYPE=click SELECTOR=XPATH://div');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as EventCommandMessage;
      expect(msg.payload.selector).toBeDefined();
      expect(msg.payload.selector!.xpath).toBe('//div');
    });

    // 11. EVENT TYPE=click SELECTOR=.plain sends selector with css='.plain' (no prefix = css)
    it('should send selector with css=.plain when SELECTOR has no prefix', async () => {
      executor.loadMacro('EVENT TYPE=click SELECTOR=.plain');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as EventCommandMessage;
      expect(msg.payload.selector).toBeDefined();
      expect(msg.payload.selector!.css).toBe('.plain');
    });
  });

  // ===== Modifier Keys =====

  describe('Modifier keys', () => {
    // 12. EVENT TYPE=click MODIFIERS=ctrl+shift sends modifiers={ctrl:true,shift:true}
    it('should send modifiers={ctrl:true,shift:true} for ctrl+shift', async () => {
      executor.loadMacro('EVENT TYPE=click MODIFIERS=ctrl+shift');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as EventCommandMessage;
      expect(msg.payload.modifiers).toEqual({ ctrl: true, shift: true });
    });

    // 13. EVENT TYPE=click MODIFIERS=alt,meta sends modifiers={alt:true,meta:true}
    it('should send modifiers={alt:true,meta:true} for alt,meta', async () => {
      executor.loadMacro('EVENT TYPE=click MODIFIERS=alt,meta');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as EventCommandMessage;
      expect(msg.payload.modifiers).toEqual({ alt: true, meta: true });
    });
  });

  // ===== Error Cases =====

  describe('Error cases', () => {
    // 14. EVENT without TYPE returns MISSING_PARAMETER
    it('should return MISSING_PARAMETER when TYPE is missing', async () => {
      executor.loadMacro('EVENT SELECTOR=CSS:.btn');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
      expect(sentMessages).toHaveLength(0);
    });

    // 15. EVENT TYPE=click sender failure returns ELEMENT_NOT_VISIBLE (-921)
    it('should return ELEMENT_NOT_VISIBLE when sender reports failure', async () => {
      setContentScriptSender({
        sendMessage: vi.fn(async (): Promise<ContentScriptResponse> => {
          return { success: false, error: 'Event dispatch failed' };
        }),
      });

      executor.loadMacro('EVENT TYPE=click');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.ELEMENT_NOT_VISIBLE);
    });

    // 16. EVENT TYPE=click sender exception returns ELEMENT_NOT_VISIBLE (-921)
    it('should return ELEMENT_NOT_VISIBLE when sender throws an exception', async () => {
      setContentScriptSender({
        sendMessage: vi.fn(async (): Promise<ContentScriptResponse> => {
          throw new Error('Connection lost to content script');
        }),
      });

      executor.loadMacro('EVENT TYPE=click');
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.ELEMENT_NOT_VISIBLE);
    });
  });

  // ===== EVENTS Alias =====

  describe('EVENTS alias', () => {
    // 17. EVENTS TYPE=click sends EVENT_COMMAND (same as EVENT)
    it('should send EVENT_COMMAND for EVENTS command (alias for EVENT)', async () => {
      executor.loadMacro('EVENTS TYPE=click');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as EventCommandMessage;
      expect(msg.type).toBe('EVENT_COMMAND');
      expect(msg.payload.eventType).toBe('click');
      expect(msg.payload.bubbles).toBe(true);
      expect(msg.payload.cancelable).toBe(true);
    });
  });

  // ===== Variable Expansion =====

  describe('Variable expansion', () => {
    // 18. SET !VAR1 focus then EVENT TYPE={{!VAR1}} sends eventType='focus'
    it('should expand variables in TYPE parameter', async () => {
      const macro = [
        'SET !VAR1 focus',
        'EVENT TYPE={{!VAR1}}',
      ].join('\n');

      executor.loadMacro(macro);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as EventCommandMessage;
      expect(msg.payload.eventType).toBe('focus');
    });
  });

  // ===== Lowercase selector= keyword support =====

  describe('Lowercase selector keyword', () => {
    it('should support lowercase selector= keyword', async () => {
      executor.loadMacro('EVENT TYPE=click selector=CSS:.my-btn');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as EventCommandMessage;
      expect(msg.payload.selector).toBeDefined();
      expect(msg.payload.selector!.css).toBe('.my-btn');
    });

    it('should support lowercase css: prefix in SELECTOR value', async () => {
      executor.loadMacro('EVENT TYPE=click SELECTOR=css:.my-btn');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as EventCommandMessage;
      expect(msg.payload.selector!.css).toBe('.my-btn');
    });

    it('should support lowercase xpath: prefix in SELECTOR value', async () => {
      executor.loadMacro('EVENT TYPE=click SELECTOR=xpath://div');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as EventCommandMessage;
      expect(msg.payload.selector!.xpath).toBe('//div');
    });
  });

  // ===== POINT with parentheses =====

  describe('POINT with parentheses', () => {
    it('should accept POINT=(x,y) format with parentheses', async () => {
      executor.loadMacro('EVENT TYPE=mouseover POINT=(100,200)');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(sentMessages).toHaveLength(1);

      const msg = sentMessages[0] as EventCommandMessage;
      expect(msg.payload.point).toEqual({ x: 100, y: 200 });
    });

    it('should still accept POINT=x,y format without parentheses', async () => {
      executor.loadMacro('EVENT TYPE=mouseover POINT=50,75');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as EventCommandMessage;
      expect(msg.payload.point).toEqual({ x: 50, y: 75 });
    });
  });

  // ===== KEY as integer keycode =====

  describe('KEY as integer keycode', () => {
    it('should resolve integer KEY=13 to Enter', async () => {
      executor.loadMacro('EVENT TYPE=keydown KEY=13');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as EventCommandMessage;
      expect(msg.payload.key).toBe('Enter');
    });

    it('should resolve integer KEY=27 to Escape', async () => {
      executor.loadMacro('EVENT TYPE=keydown KEY=27');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as EventCommandMessage;
      expect(msg.payload.key).toBe('Escape');
    });

    it('should resolve integer KEY=65 to a', async () => {
      executor.loadMacro('EVENT TYPE=keydown KEY=65');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as EventCommandMessage;
      expect(msg.payload.key).toBe('a');
    });

    it('should resolve integer KEY=9 to Tab', async () => {
      executor.loadMacro('EVENT TYPE=keydown KEY=9');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as EventCommandMessage;
      expect(msg.payload.key).toBe('Tab');
    });

    it('should pass through non-integer KEY as string', async () => {
      executor.loadMacro('EVENT TYPE=keydown KEY=Enter');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      const msg = sentMessages[0] as EventCommandMessage;
      expect(msg.payload.key).toBe('Enter');
    });
  });
});
