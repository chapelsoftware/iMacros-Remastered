/**
 * Event Dispatcher Unit Tests
 *
 * Tests all event dispatching functions: mouse events, keyboard events,
 * input events, focus events, typeText, and the EventDispatcher class.
 *
 * Uses JSDOM for DOM simulation. All elements are created from the global
 * document (same realm) to avoid cross-realm instanceof / dispatchEvent issues.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

// Polyfill global DOM for module imports that reference browser globals
const _polyfillDom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
if (typeof globalThis.Node === 'undefined') {
  (globalThis as any).Node = _polyfillDom.window.Node;
}
if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = _polyfillDom.window.document;
}
if (typeof globalThis.Element === 'undefined') {
  (globalThis as any).Element = _polyfillDom.window.Element;
}
if (typeof globalThis.HTMLElement === 'undefined') {
  (globalThis as any).HTMLElement = _polyfillDom.window.HTMLElement;
}
if (typeof globalThis.HTMLInputElement === 'undefined') {
  (globalThis as any).HTMLInputElement = _polyfillDom.window.HTMLInputElement;
}
if (typeof globalThis.HTMLTextAreaElement === 'undefined') {
  (globalThis as any).HTMLTextAreaElement = _polyfillDom.window.HTMLTextAreaElement;
}
if (typeof globalThis.HTMLSelectElement === 'undefined') {
  (globalThis as any).HTMLSelectElement = _polyfillDom.window.HTMLSelectElement;
}
if (typeof globalThis.HTMLAnchorElement === 'undefined') {
  (globalThis as any).HTMLAnchorElement = _polyfillDom.window.HTMLAnchorElement;
}
if (typeof globalThis.HTMLImageElement === 'undefined') {
  (globalThis as any).HTMLImageElement = _polyfillDom.window.HTMLImageElement;
}
if (typeof globalThis.HTMLTableElement === 'undefined') {
  (globalThis as any).HTMLTableElement = _polyfillDom.window.HTMLTableElement;
}
if (typeof globalThis.MouseEvent === 'undefined') {
  (globalThis as any).MouseEvent = _polyfillDom.window.MouseEvent;
}
if (typeof globalThis.KeyboardEvent === 'undefined') {
  (globalThis as any).KeyboardEvent = _polyfillDom.window.KeyboardEvent;
}
if (typeof globalThis.InputEvent === 'undefined') {
  (globalThis as any).InputEvent = _polyfillDom.window.InputEvent;
}
if (typeof globalThis.FocusEvent === 'undefined') {
  (globalThis as any).FocusEvent = _polyfillDom.window.FocusEvent;
}
// Force overwrite Event - Node.js has a native Event class that is
// incompatible with JSDOM's dispatchEvent (cross-realm rejection).
(globalThis as any).Event = _polyfillDom.window.Event;
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = _polyfillDom.window;
}
if (typeof globalThis.XPathResult === 'undefined') {
  (globalThis as any).XPathResult = _polyfillDom.window.XPathResult;
}

import {
  dispatchMouseEvent,
  dispatchClick,
  dispatchDoubleClick,
  dispatchRightClick,
  dispatchKeyboardEvent,
  dispatchKeyPress,
  dispatchKeyCombination,
  dispatchInputEvent,
  typeText,
  dispatchFocusEvent,
  focusElement,
  blurElement,
  dispatchHover,
  dispatchMouseLeave,
  EventDispatcher,
  createEventDispatcher,
} from '../../extension/src/content/event-dispatcher';

// Use the global document (same realm as global Event, MouseEvent, etc.)
// so that dispatchEvent and instanceof checks work correctly.
const doc = globalThis.document;

describe('Event Dispatcher', () => {
  let target: HTMLElement;
  let input: HTMLInputElement;
  let textarea: HTMLTextAreaElement;
  let btn: HTMLElement;

  beforeEach(() => {
    doc.body.innerHTML = '<div id="target">Click me</div><input id="input" type="text" /><textarea id="textarea"></textarea><button id="btn">OK</button>';
    target = doc.getElementById('target') as HTMLElement;
    input = doc.getElementById('input') as HTMLInputElement;
    textarea = doc.getElementById('textarea') as HTMLTextAreaElement;
    btn = doc.getElementById('btn') as HTMLElement;
  });

  // ============================================================
  // Mouse Events
  // ============================================================

  describe('dispatchMouseEvent', () => {
    it('should dispatch a click event on an element', () => {
      const events: string[] = [];
      target.addEventListener('click', () => events.push('click'));

      const result = dispatchMouseEvent(target, 'click');

      expect(result).toBe(true);
      expect(events).toEqual(['click']);
    });

    it('should dispatch mousedown event with correct button property', () => {
      let capturedButton = -1;
      target.addEventListener('mousedown', (e: Event) => {
        capturedButton = (e as MouseEvent).button;
      });

      dispatchMouseEvent(target, 'mousedown', { button: 2 });

      expect(capturedButton).toBe(2);
    });

    it('should pass modifier keys through to mouse events', () => {
      let ctrlKey = false;
      let shiftKey = false;
      target.addEventListener('click', (e: Event) => {
        ctrlKey = (e as MouseEvent).ctrlKey;
        shiftKey = (e as MouseEvent).shiftKey;
      });

      dispatchMouseEvent(target, 'click', { ctrlKey: true, shiftKey: true });

      expect(ctrlKey).toBe(true);
      expect(shiftKey).toBe(true);
    });

    it('should use provided clientX/clientY coordinates', () => {
      let x = 0;
      let y = 0;
      target.addEventListener('mousemove', (e: Event) => {
        x = (e as MouseEvent).clientX;
        y = (e as MouseEvent).clientY;
      });

      dispatchMouseEvent(target, 'mousemove', { clientX: 100, clientY: 200 });

      expect(x).toBe(100);
      expect(y).toBe(200);
    });

    it('should set buttons=0 for mouseup events by default', () => {
      let buttons = -1;
      target.addEventListener('mouseup', (e: Event) => {
        buttons = (e as MouseEvent).buttons;
      });

      dispatchMouseEvent(target, 'mouseup');

      expect(buttons).toBe(0);
    });

    it('should set buttons=1 for mousedown events by default', () => {
      let buttons = -1;
      target.addEventListener('mousedown', (e: Event) => {
        buttons = (e as MouseEvent).buttons;
      });

      dispatchMouseEvent(target, 'mousedown');

      expect(buttons).toBe(1);
    });
  });

  // ============================================================
  // Click sequences
  // ============================================================

  describe('dispatchClick', () => {
    it('should dispatch mouseover, mousedown, mouseup, click in sequence', () => {
      const events: string[] = [];
      target.addEventListener('mouseover', () => events.push('mouseover'));
      target.addEventListener('mousedown', () => events.push('mousedown'));
      target.addEventListener('mouseup', () => events.push('mouseup'));
      target.addEventListener('click', () => events.push('click'));

      const result = dispatchClick(target);

      expect(result.mouseover).toBe(true);
      expect(result.mousedown).toBe(true);
      expect(result.mouseup).toBe(true);
      expect(result.click).toBe(true);
      expect(events).toEqual(['mouseover', 'mousedown', 'mouseup', 'click']);
    });

    it('should pass options through to all click events', () => {
      const shiftStates: boolean[] = [];
      target.addEventListener('mouseover', (e: Event) => shiftStates.push((e as MouseEvent).shiftKey));
      target.addEventListener('mousedown', (e: Event) => shiftStates.push((e as MouseEvent).shiftKey));
      target.addEventListener('mouseup', (e: Event) => shiftStates.push((e as MouseEvent).shiftKey));
      target.addEventListener('click', (e: Event) => shiftStates.push((e as MouseEvent).shiftKey));

      dispatchClick(target, { shiftKey: true });

      expect(shiftStates).toEqual([true, true, true, true]);
    });
  });

  describe('dispatchDoubleClick', () => {
    it('should dispatch two full click sequences followed by dblclick', () => {
      const events: string[] = [];
      target.addEventListener('mouseover', () => events.push('mouseover'));
      target.addEventListener('mousedown', () => events.push('mousedown'));
      target.addEventListener('mouseup', () => events.push('mouseup'));
      target.addEventListener('click', () => events.push('click'));
      target.addEventListener('dblclick', () => events.push('dblclick'));

      const result = dispatchDoubleClick(target);

      expect(result.firstClick.mousedown).toBe(true);
      expect(result.secondClick.click).toBe(true);
      expect(result.dblclick).toBe(true);
      expect(events).toEqual([
        'mouseover', 'mousedown', 'mouseup', 'click',
        'mouseover', 'mousedown', 'mouseup', 'click',
        'dblclick',
      ]);
    });
  });

  describe('dispatchRightClick', () => {
    it('should dispatch mouseover, mousedown, mouseup, contextmenu with button=2', () => {
      const events: string[] = [];
      const buttonValues: number[] = [];
      target.addEventListener('mouseover', (e: Event) => {
        events.push('mouseover');
        buttonValues.push((e as MouseEvent).button);
      });
      target.addEventListener('mousedown', (e: Event) => {
        events.push('mousedown');
        buttonValues.push((e as MouseEvent).button);
      });
      target.addEventListener('mouseup', (e: Event) => {
        events.push('mouseup');
        buttonValues.push((e as MouseEvent).button);
      });
      target.addEventListener('contextmenu', (e: Event) => {
        events.push('contextmenu');
        buttonValues.push((e as MouseEvent).button);
      });

      const result = dispatchRightClick(target);

      expect(result.mouseover).toBe(true);
      expect(result.mousedown).toBe(true);
      expect(result.mouseup).toBe(true);
      expect(result.contextmenu).toBe(true);
      expect(events).toEqual(['mouseover', 'mousedown', 'mouseup', 'contextmenu']);
      // mouseover uses default button (0), mousedown/mouseup/contextmenu use button=2
      expect(buttonValues).toEqual([0, 2, 2, 2]);
    });
  });

  // ============================================================
  // Keyboard Events
  // ============================================================

  describe('dispatchKeyboardEvent', () => {
    it('should dispatch a keydown event with correct key and code properties', () => {
      let capturedKey = '';
      let capturedCode = '';
      input.addEventListener('keydown', (e: Event) => {
        capturedKey = (e as KeyboardEvent).key;
        capturedCode = (e as KeyboardEvent).code;
      });

      dispatchKeyboardEvent(input, 'keydown', { key: 'a', code: 'KeyA' });

      expect(capturedKey).toBe('a');
      expect(capturedCode).toBe('KeyA');
    });

    it('should support modifier keys on keyboard events', () => {
      let ctrl = false;
      let alt = false;
      let meta = false;
      input.addEventListener('keydown', (e: Event) => {
        ctrl = (e as KeyboardEvent).ctrlKey;
        alt = (e as KeyboardEvent).altKey;
        meta = (e as KeyboardEvent).metaKey;
      });

      dispatchKeyboardEvent(input, 'keydown', { key: 'c', ctrlKey: true, altKey: true, metaKey: true });

      expect(ctrl).toBe(true);
      expect(alt).toBe(true);
      expect(meta).toBe(true);
    });

    it('should set custom keyCode and charCode when provided', () => {
      let kc = 0;
      let cc = 0;
      input.addEventListener('keydown', (e: Event) => {
        kc = (e as KeyboardEvent).keyCode;
        cc = (e as KeyboardEvent).charCode;
      });

      dispatchKeyboardEvent(input, 'keydown', { key: 'Enter', keyCode: 13, charCode: 13 });

      expect(kc).toBe(13);
      expect(cc).toBe(13);
    });
  });

  describe('dispatchKeyPress', () => {
    it('should dispatch keydown, keypress, keyup in sequence', () => {
      const events: string[] = [];
      input.addEventListener('keydown', () => events.push('keydown'));
      input.addEventListener('keypress', () => events.push('keypress'));
      input.addEventListener('keyup', () => events.push('keyup'));

      const result = dispatchKeyPress(input, { key: 'x' });

      expect(result.keydown).toBe(true);
      expect(result.keypress).toBe(true);
      expect(result.keyup).toBe(true);
      expect(events).toEqual(['keydown', 'keypress', 'keyup']);
    });
  });

  describe('dispatchKeyCombination', () => {
    it('should dispatch keydown and keyup for a key combination', () => {
      const events: string[] = [];
      let ctrlOnKeydown = false;
      input.addEventListener('keydown', (e: Event) => {
        events.push('keydown');
        ctrlOnKeydown = (e as KeyboardEvent).ctrlKey;
      });
      input.addEventListener('keyup', () => events.push('keyup'));

      const result = dispatchKeyCombination(input, 'c', { ctrlKey: true });

      expect(result.keydown).toBe(true);
      expect(result.keyup).toBe(true);
      expect(events).toEqual(['keydown', 'keyup']);
      expect(ctrlOnKeydown).toBe(true);
    });

    it('should resolve key code for Enter', () => {
      let capturedCode = '';
      input.addEventListener('keydown', (e: Event) => {
        capturedCode = (e as KeyboardEvent).code;
      });

      dispatchKeyCombination(input, 'Enter');

      expect(capturedCode).toBe('Enter');
    });

    it('should resolve key code for space', () => {
      let capturedCode = '';
      input.addEventListener('keydown', (e: Event) => {
        capturedCode = (e as KeyboardEvent).code;
      });

      dispatchKeyCombination(input, ' ');

      expect(capturedCode).toBe('Space');
    });

    it('should resolve key code for digit', () => {
      let capturedCode = '';
      input.addEventListener('keydown', (e: Event) => {
        capturedCode = (e as KeyboardEvent).code;
      });

      dispatchKeyCombination(input, '5');

      expect(capturedCode).toBe('Digit5');
    });
  });

  // ============================================================
  // Input Events
  // ============================================================

  describe('dispatchInputEvent', () => {
    it('should dispatch an input event with insertText inputType by default', () => {
      let inputType = '';
      input.addEventListener('input', (e: Event) => {
        inputType = (e as InputEvent).inputType;
      });

      const result = dispatchInputEvent(input);

      expect(result).toBe(true);
      expect(inputType).toBe('insertText');
    });

    it('should dispatch a beforeinput event that is cancelable', () => {
      let cancelable = false;
      input.addEventListener('beforeinput', (e: Event) => {
        cancelable = e.cancelable;
      });

      dispatchInputEvent(input, 'beforeinput', { data: 'x' });

      expect(cancelable).toBe(true);
    });

    it('should pass data through input events', () => {
      let data: string | null = null;
      input.addEventListener('input', (e: Event) => {
        data = (e as InputEvent).data;
      });

      dispatchInputEvent(input, 'input', { data: 'hello' });

      expect(data).toBe('hello');
    });
  });

  // ============================================================
  // Focus Events
  // ============================================================

  describe('dispatchFocusEvent', () => {
    it('should dispatch focus event that does not bubble', () => {
      let bubbles = true;
      input.addEventListener('focus', (e: Event) => {
        bubbles = e.bubbles;
      });

      dispatchFocusEvent(input, 'focus');

      expect(bubbles).toBe(false);
    });

    it('should dispatch focusin event that does bubble', () => {
      let bubbles = false;
      input.addEventListener('focusin', (e: Event) => {
        bubbles = e.bubbles;
      });

      dispatchFocusEvent(input, 'focusin');

      expect(bubbles).toBe(true);
    });

    it('should dispatch blur event that does not bubble', () => {
      let bubbles = true;
      input.addEventListener('blur', (e: Event) => {
        bubbles = e.bubbles;
      });

      dispatchFocusEvent(input, 'blur');

      expect(bubbles).toBe(false);
    });

    it('should dispatch focusout event that does bubble', () => {
      let bubbles = false;
      input.addEventListener('focusout', (e: Event) => {
        bubbles = e.bubbles;
      });

      dispatchFocusEvent(input, 'focusout');

      expect(bubbles).toBe(true);
    });
  });

  describe('focusElement', () => {
    it('should dispatch focusin and focus events', () => {
      const events: string[] = [];
      input.addEventListener('focusin', () => events.push('focusin'));
      input.addEventListener('focus', () => events.push('focus'));

      const result = focusElement(input);

      expect(result.focusin).toBe(true);
      expect(result.focus).toBe(true);
      expect(events).toContain('focusin');
      expect(events).toContain('focus');
    });

    it('should blur the previous element when provided', () => {
      const events: string[] = [];
      input.addEventListener('focusout', () => events.push('prev-focusout'));
      input.addEventListener('blur', () => events.push('prev-blur'));
      btn.addEventListener('focusin', () => events.push('next-focusin'));
      btn.addEventListener('focus', () => events.push('next-focus'));

      focusElement(btn, input);

      expect(events).toContain('prev-focusout');
      expect(events).toContain('prev-blur');
      expect(events).toContain('next-focusin');
      expect(events).toContain('next-focus');
    });
  });

  describe('blurElement', () => {
    it('should dispatch focusout and blur events', () => {
      const events: string[] = [];
      input.addEventListener('focusout', () => events.push('focusout'));
      input.addEventListener('blur', () => events.push('blur'));

      const result = blurElement(input);

      expect(result.focusout).toBe(true);
      expect(result.blur).toBe(true);
      expect(events).toEqual(['focusout', 'blur']);
    });
  });

  // ============================================================
  // Hover / Mouse Leave
  // ============================================================

  describe('dispatchHover', () => {
    it('should dispatch mouseenter and mouseover events', () => {
      const events: string[] = [];
      target.addEventListener('mouseenter', () => events.push('mouseenter'));
      target.addEventListener('mouseover', () => events.push('mouseover'));

      const result = dispatchHover(target);

      expect(result.mouseenter).toBe(true);
      expect(result.mouseover).toBe(true);
      expect(events).toEqual(['mouseenter', 'mouseover']);
    });
  });

  describe('dispatchMouseLeave', () => {
    it('should dispatch mouseleave and mouseout events', () => {
      const events: string[] = [];
      target.addEventListener('mouseleave', () => events.push('mouseleave'));
      target.addEventListener('mouseout', () => events.push('mouseout'));

      const result = dispatchMouseLeave(target);

      expect(result.mouseleave).toBe(true);
      expect(result.mouseout).toBe(true);
      expect(events).toEqual(['mouseleave', 'mouseout']);
    });
  });

  // ============================================================
  // typeText
  // ============================================================

  describe('typeText', () => {
    it('should type each character into an input, updating value', () => {
      typeText(input, 'abc');
      expect(input.value).toBe('abc');
    });

    it('should dispatch keydown, keypress, input, keyup for each character', () => {
      const events: string[] = [];
      input.addEventListener('keydown', () => events.push('keydown'));
      input.addEventListener('keypress', () => events.push('keypress'));
      input.addEventListener('input', () => events.push('input'));
      input.addEventListener('keyup', () => events.push('keyup'));

      typeText(input, 'x');

      expect(events).toEqual(['keydown', 'keypress', 'input', 'keyup']);
    });

    it('should dispatch a change event after typing is complete', () => {
      let changeFired = false;
      input.addEventListener('change', () => { changeFired = true; });

      typeText(input, 'hi');

      expect(changeFired).toBe(true);
    });

    it('should clear the value first when clearFirst option is set', () => {
      input.value = 'old';

      typeText(input, 'new', { clearFirst: true });

      expect(input.value).toBe('new');
    });

    it('should work with textarea elements', () => {
      typeText(textarea, 'line1');
      expect(textarea.value).toBe('line1');
    });

    it('should dispatch focus event before typing', () => {
      const events: string[] = [];
      input.addEventListener('focus', () => events.push('focus'));
      input.addEventListener('keydown', () => events.push('keydown'));

      typeText(input, 'a');

      expect(events[0]).toBe('focus');
    });
  });

  // ============================================================
  // EventDispatcher class
  // ============================================================

  describe('EventDispatcher class', () => {
    it('should wrap click dispatching', () => {
      const dispatcher = new EventDispatcher(target);
      const events: string[] = [];
      target.addEventListener('click', () => events.push('click'));

      const result = dispatcher.click();

      expect(result.click).toBe(true);
      expect(events).toContain('click');
    });

    it('should wrap doubleClick dispatching', () => {
      const dispatcher = new EventDispatcher(target);
      let dblclickFired = false;
      target.addEventListener('dblclick', () => { dblclickFired = true; });

      const result = dispatcher.doubleClick();

      expect(result.dblclick).toBe(true);
      expect(dblclickFired).toBe(true);
    });

    it('should wrap rightClick dispatching', () => {
      const dispatcher = new EventDispatcher(target);
      let contextFired = false;
      target.addEventListener('contextmenu', () => { contextFired = true; });

      const result = dispatcher.rightClick();

      expect(result.contextmenu).toBe(true);
      expect(contextFired).toBe(true);
    });

    it('should wrap mouseEvent dispatching', () => {
      const dispatcher = new EventDispatcher(target);
      let moveFired = false;
      target.addEventListener('mousemove', () => { moveFired = true; });

      dispatcher.mouseEvent('mousemove');

      expect(moveFired).toBe(true);
    });

    it('should wrap keyPress dispatching', () => {
      const dispatcher = new EventDispatcher(input);
      const events: string[] = [];
      input.addEventListener('keydown', () => events.push('keydown'));
      input.addEventListener('keypress', () => events.push('keypress'));
      input.addEventListener('keyup', () => events.push('keyup'));

      dispatcher.keyPress({ key: 'a' });

      expect(events).toEqual(['keydown', 'keypress', 'keyup']);
    });

    it('should wrap keyDown and keyUp dispatching', () => {
      const dispatcher = new EventDispatcher(input);
      const events: string[] = [];
      input.addEventListener('keydown', () => events.push('keydown'));
      input.addEventListener('keyup', () => events.push('keyup'));

      dispatcher.keyDown({ key: 'Shift' });
      dispatcher.keyUp({ key: 'Shift' });

      expect(events).toEqual(['keydown', 'keyup']);
    });

    it('should wrap keyCombination dispatching', () => {
      const dispatcher = new EventDispatcher(input);
      let ctrlKey = false;
      input.addEventListener('keydown', (e: Event) => {
        ctrlKey = (e as KeyboardEvent).ctrlKey;
      });

      dispatcher.keyCombination('v', { ctrlKey: true });

      expect(ctrlKey).toBe(true);
    });

    it('should wrap input dispatching', () => {
      const dispatcher = new EventDispatcher(input);
      let fired = false;
      input.addEventListener('input', () => { fired = true; });

      dispatcher.input({ data: 'x' });

      expect(fired).toBe(true);
    });

    it('should wrap focus dispatching', () => {
      const dispatcher = new EventDispatcher(input);
      let fired = false;
      input.addEventListener('focus', () => { fired = true; });

      dispatcher.focus();

      expect(fired).toBe(true);
    });

    it('should wrap blur dispatching', () => {
      const dispatcher = new EventDispatcher(input);
      let fired = false;
      input.addEventListener('blur', () => { fired = true; });

      dispatcher.blur();

      expect(fired).toBe(true);
    });

    it('should wrap hover dispatching', () => {
      const dispatcher = new EventDispatcher(target);
      const events: string[] = [];
      target.addEventListener('mouseenter', () => events.push('mouseenter'));
      target.addEventListener('mouseover', () => events.push('mouseover'));

      dispatcher.hover();

      expect(events).toEqual(['mouseenter', 'mouseover']);
    });

    it('should wrap leave dispatching', () => {
      const dispatcher = new EventDispatcher(target);
      const events: string[] = [];
      target.addEventListener('mouseleave', () => events.push('mouseleave'));
      target.addEventListener('mouseout', () => events.push('mouseout'));

      dispatcher.leave();

      expect(events).toEqual(['mouseleave', 'mouseout']);
    });

    it('should wrap type dispatching for input elements', () => {
      const dispatcher = new EventDispatcher(input);

      dispatcher.type('hello');

      expect(input.value).toBe('hello');
    });

    it('should throw when calling type on a non-input element', () => {
      const dispatcher = new EventDispatcher(target);

      expect(() => dispatcher.type('hello')).toThrow('typeText can only be used on input or textarea elements');
    });
  });

  // ============================================================
  // createEventDispatcher factory
  // ============================================================

  describe('createEventDispatcher', () => {
    it('should return an EventDispatcher instance', () => {
      const dispatcher = createEventDispatcher(target);

      expect(dispatcher).toBeInstanceOf(EventDispatcher);
    });

    it('should work with the created dispatcher', () => {
      const dispatcher = createEventDispatcher(target);
      let clicked = false;
      target.addEventListener('click', () => { clicked = true; });

      dispatcher.click();

      expect(clicked).toBe(true);
    });
  });
});
