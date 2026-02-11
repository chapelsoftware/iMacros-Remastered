import { describe, it, expect } from 'vitest';

describe('EVENT:SAVETARGETAS', () => {
  it('detects EVENT: prefix', () => {
    const content = 'EVENT:SAVETARGETAS';
    expect(content.toUpperCase().startsWith('EVENT:')).toBe(true);
  });

  it('extracts event command name', () => {
    const content = 'EVENT:SAVETARGETAS';
    const eventCommand = content.substring(6).toUpperCase();
    expect(eventCommand).toBe('SAVETARGETAS');
  });

  it('extracts filename from SAVETARGETAS=filename', () => {
    const eventCommand = 'SAVETARGETAS=report.pdf';
    const eqIndex = eventCommand.indexOf('=');
    expect(eqIndex).toBeGreaterThan(0);
    const filename = eventCommand.substring(eqIndex + 1);
    expect(filename).toBe('report.pdf');
  });

  it('handles SAVETARGETAS without filename', () => {
    const eventCommand = 'SAVETARGETAS';
    const eqIndex = eventCommand.indexOf('=');
    expect(eqIndex).toBe(-1);
  });
});

describe('EVENT:SAVEITEM', () => {
  it('detects SAVEITEM event command', () => {
    const content = 'EVENT:SAVEITEM';
    const eventCommand = content.substring(6).toUpperCase();
    expect(eventCommand.startsWith('SAVEITEM')).toBe(true);
  });

  it('extracts filename from SAVEITEM=filename', () => {
    const eventCommand = 'SAVEITEM=image.png';
    const eqIndex = eventCommand.indexOf('=');
    expect(eqIndex).toBeGreaterThan(0);
    const filename = eventCommand.substring(eqIndex + 1);
    expect(filename).toBe('image.png');
  });

  it('handles SAVEITEM without filename', () => {
    const eventCommand = 'SAVEITEM';
    const eqIndex = eventCommand.indexOf('=');
    expect(eqIndex).toBe(-1);
  });
});

describe('EVENT:SAVEPICTUREAS', () => {
  it('detects SAVEPICTUREAS event command', () => {
    const content = 'EVENT:SAVEPICTUREAS';
    const eventCommand = content.substring(6).toUpperCase();
    expect(eventCommand.startsWith('SAVEPICTUREAS')).toBe(true);
  });

  it('extracts filename from SAVEPICTUREAS=filename', () => {
    const eventCommand = 'SAVEPICTUREAS=photo.jpg';
    const eqIndex = eventCommand.indexOf('=');
    expect(eqIndex).toBeGreaterThan(0);
    const filename = eventCommand.substring(eqIndex + 1);
    expect(filename).toBe('photo.jpg');
  });
});

describe('EVENT:SAVE_ELEMENT_SCREENSHOT', () => {
  it('detects SAVE_ELEMENT_SCREENSHOT event command', () => {
    const content = 'EVENT:SAVE_ELEMENT_SCREENSHOT';
    const eventCommand = content.substring(6).toUpperCase();
    expect(eventCommand.startsWith('SAVE_ELEMENT_SCREENSHOT')).toBe(true);
  });

  it('extracts filename from SAVE_ELEMENT_SCREENSHOT=filename', () => {
    const eventCommand = 'SAVE_ELEMENT_SCREENSHOT=element.png';
    const eqIndex = eventCommand.indexOf('=');
    expect(eqIndex).toBeGreaterThan(0);
    const filename = eventCommand.substring(eqIndex + 1);
    expect(filename).toBe('element.png');
  });
});

describe('EVENT command routing', () => {
  const mouseEvents: Record<string, string> = {
    'MOUSEOVER': 'mouseover',
    'MOUSEOUT': 'mouseout',
    'MOUSEMOVE': 'mousemove',
    'MOUSEDOWN': 'mousedown',
    'MOUSEUP': 'mouseup',
    'MOUSEENTER': 'mouseenter',
    'MOUSELEAVE': 'mouseleave',
  };

  function routeEventCommand(content: string): string {
    if (!content.toUpperCase().startsWith('EVENT:')) return 'NOT_EVENT';
    const eventCommand = content.substring(6).toUpperCase();
    if (eventCommand.startsWith('SAVETARGETAS')) return 'SAVETARGETAS';
    if (eventCommand.startsWith('SAVEITEM') || eventCommand.startsWith('SAVEPICTUREAS')) return 'SAVEITEM';
    if (eventCommand.startsWith('SAVE_ELEMENT_SCREENSHOT')) return 'SCREENSHOT';
    if (mouseEvents[eventCommand]) return 'MOUSE_EVENT';
    return 'UNKNOWN';
  }

  it('routes SAVETARGETAS', () => {
    expect(routeEventCommand('EVENT:SAVETARGETAS')).toBe('SAVETARGETAS');
    expect(routeEventCommand('EVENT:SAVETARGETAS=file.pdf')).toBe('SAVETARGETAS');
  });

  it('routes SAVEITEM', () => {
    expect(routeEventCommand('EVENT:SAVEITEM')).toBe('SAVEITEM');
    expect(routeEventCommand('EVENT:SAVEITEM=img.png')).toBe('SAVEITEM');
  });

  it('routes SAVEPICTUREAS', () => {
    expect(routeEventCommand('EVENT:SAVEPICTUREAS')).toBe('SAVEITEM');
    expect(routeEventCommand('EVENT:SAVEPICTUREAS=photo.jpg')).toBe('SAVEITEM');
  });

  it('routes SAVE_ELEMENT_SCREENSHOT', () => {
    expect(routeEventCommand('EVENT:SAVE_ELEMENT_SCREENSHOT')).toBe('SCREENSHOT');
    expect(routeEventCommand('EVENT:SAVE_ELEMENT_SCREENSHOT=el.png')).toBe('SCREENSHOT');
  });

  it('routes mouse events (MOUSEOVER, MOUSEDOWN, etc.)', () => {
    expect(routeEventCommand('EVENT:MOUSEOVER')).toBe('MOUSE_EVENT');
    expect(routeEventCommand('EVENT:MOUSEOUT')).toBe('MOUSE_EVENT');
    expect(routeEventCommand('EVENT:MOUSEMOVE')).toBe('MOUSE_EVENT');
    expect(routeEventCommand('EVENT:MOUSEDOWN')).toBe('MOUSE_EVENT');
    expect(routeEventCommand('EVENT:MOUSEUP')).toBe('MOUSE_EVENT');
    expect(routeEventCommand('EVENT:MOUSEENTER')).toBe('MOUSE_EVENT');
    expect(routeEventCommand('EVENT:MOUSELEAVE')).toBe('MOUSE_EVENT');
  });

  it('returns UNKNOWN for unrecognized events', () => {
    expect(routeEventCommand('EVENT:SOMETHING_ELSE')).toBe('UNKNOWN');
  });

  it('returns NOT_EVENT for non-event content', () => {
    expect(routeEventCommand('hello world')).toBe('NOT_EVENT');
  });

  it('is case-insensitive', () => {
    expect(routeEventCommand('event:saveitem')).toBe('SAVEITEM');
    expect(routeEventCommand('Event:SaveTargetAs')).toBe('SAVETARGETAS');
    expect(routeEventCommand('event:savepictureas')).toBe('SAVEITEM');
    expect(routeEventCommand('event:mouseover')).toBe('MOUSE_EVENT');
    expect(routeEventCommand('Event:MouseDown')).toBe('MOUSE_EVENT');
  });
});
