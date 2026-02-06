import { describe, it, expect, vi } from 'vitest';
import {
  parseProtocolUrl,
  validateExecutionRequest,
  createExecutionRequest,
  handleProtocolUrl,
  isImacrosProtocolUrl,
  ParsedProtocolUrl,
} from '../../native-host/src/protocol-handler';

describe('protocol-handler', () => {
  // ---------------------------------------------------------------
  // parseProtocolUrl
  // ---------------------------------------------------------------
  describe('parseProtocolUrl', () => {
    it('parses a valid run URL with "m" param', () => {
      const result = parseProtocolUrl('imacros://run?m=test.iim');
      expect(result).not.toBeNull();
      expect(result!.action).toBe('run');
      expect(result!.macroName).toBe('test.iim');
      expect(result!.params).toEqual({ m: 'test.iim' });
    });

    it('parses a valid run URL with "macro" param', () => {
      const result = parseProtocolUrl('imacros://run?macro=test.iim');
      expect(result).not.toBeNull();
      expect(result!.action).toBe('run');
      expect(result!.macroName).toBe('test.iim');
      expect(result!.params).toEqual({ macro: 'test.iim' });
    });

    it('prefers "m" param over "macro" param when both present', () => {
      const result = parseProtocolUrl('imacros://run?m=first.iim&macro=second.iim');
      expect(result).not.toBeNull();
      expect(result!.macroName).toBe('first.iim');
    });

    it('parses URL with multiple query params', () => {
      const result = parseProtocolUrl('imacros://run?m=test.iim&loop=5');
      expect(result).not.toBeNull();
      expect(result!.action).toBe('run');
      expect(result!.macroName).toBe('test.iim');
      expect(result!.params).toEqual({ m: 'test.iim', loop: '5' });
    });

    it('parses URL with no query params', () => {
      const result = parseProtocolUrl('imacros://run');
      expect(result).not.toBeNull();
      expect(result!.action).toBe('run');
      expect(result!.macroName).toBeUndefined();
      expect(result!.params).toEqual({});
    });

    it('returns null for an empty action (imacros://)', () => {
      // new URL('imacros://') gives hostname='' and pathname='', so action=''
      const result = parseProtocolUrl('imacros://');
      expect(result).toBeNull();
    });

    it('returns null for a completely invalid / unparseable URL', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = parseProtocolUrl('not a url at all ://{}');
      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });

    it('returns null for a malformed URL that throws in the URL constructor', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = parseProtocolUrl('://');
      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });

    it('handles URL-encoded macro names', () => {
      const result = parseProtocolUrl('imacros://run?m=my%20macro.iim');
      expect(result).not.toBeNull();
      expect(result!.macroName).toBe('my macro.iim');
    });

    it('parses URL with path-based macro name via extra params', () => {
      const result = parseProtocolUrl('imacros://run?m=folder/sub/test.iim');
      expect(result).not.toBeNull();
      expect(result!.macroName).toBe('folder/sub/test.iim');
    });
  });

  // ---------------------------------------------------------------
  // validateExecutionRequest
  // ---------------------------------------------------------------
  describe('validateExecutionRequest', () => {
    it('returns true for a valid run request with macroName', () => {
      const parsed: ParsedProtocolUrl = {
        action: 'run',
        macroName: 'test.iim',
        params: { m: 'test.iim' },
      };
      expect(validateExecutionRequest(parsed)).toBe(true);
    });

    it('returns false when action is not "run"', () => {
      const parsed: ParsedProtocolUrl = {
        action: 'stop',
        macroName: 'test.iim',
        params: { m: 'test.iim' },
      };
      expect(validateExecutionRequest(parsed)).toBe(false);
    });

    it('returns false when macroName is undefined', () => {
      const parsed: ParsedProtocolUrl = {
        action: 'run',
        params: {},
      };
      expect(validateExecutionRequest(parsed)).toBe(false);
    });

    it('returns false when macroName is an empty string', () => {
      const parsed: ParsedProtocolUrl = {
        action: 'run',
        macroName: '',
        params: { m: '' },
      };
      expect(validateExecutionRequest(parsed)).toBe(false);
    });

    it('returns false when macroName is only whitespace', () => {
      const parsed: ParsedProtocolUrl = {
        action: 'run',
        macroName: '   ',
        params: { m: '   ' },
      };
      expect(validateExecutionRequest(parsed)).toBe(false);
    });

    it('returns false for an unknown action even with a valid macroName', () => {
      const parsed: ParsedProtocolUrl = {
        action: 'pause',
        macroName: 'test.iim',
        params: { m: 'test.iim' },
      };
      expect(validateExecutionRequest(parsed)).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // createExecutionRequest
  // ---------------------------------------------------------------
  describe('createExecutionRequest', () => {
    it('returns a MacroExecutionRequest with macroName and params', () => {
      const parsed = {
        action: 'run',
        macroName: 'test.iim',
        params: { m: 'test.iim', loop: '3' },
      };
      const request = createExecutionRequest(parsed);
      expect(request).toEqual({
        macroName: 'test.iim',
        params: { m: 'test.iim', loop: '3' },
      });
    });

    it('returns empty params when none are provided', () => {
      const parsed = {
        action: 'run',
        macroName: 'test.iim',
        params: {},
      };
      const request = createExecutionRequest(parsed);
      expect(request).toEqual({
        macroName: 'test.iim',
        params: {},
      });
    });

    it('does not include the action field in the returned request', () => {
      const parsed = {
        action: 'run',
        macroName: 'test.iim',
        params: { m: 'test.iim' },
      };
      const request = createExecutionRequest(parsed);
      expect(request).not.toHaveProperty('action');
    });
  });

  // ---------------------------------------------------------------
  // handleProtocolUrl
  // ---------------------------------------------------------------
  describe('handleProtocolUrl', () => {
    it('calls onExecute and returns true for a valid run URL', () => {
      const onExecute = vi.fn();
      const result = handleProtocolUrl('imacros://run?m=test.iim', onExecute);

      expect(result).toBe(true);
      expect(onExecute).toHaveBeenCalledOnce();
      expect(onExecute).toHaveBeenCalledWith({
        macroName: 'test.iim',
        params: { m: 'test.iim' },
      });
    });

    it('returns false and does not call onExecute for an invalid URL', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onExecute = vi.fn();
      const result = handleProtocolUrl('not a valid url', onExecute);

      expect(result).toBe(false);
      expect(onExecute).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('returns false when URL is valid but macro name is missing', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onExecute = vi.fn();
      const result = handleProtocolUrl('imacros://run', onExecute);

      expect(result).toBe(false);
      expect(onExecute).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('returns false for an unknown action', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onExecute = vi.fn();
      const result = handleProtocolUrl('imacros://stop?m=test.iim', onExecute);

      expect(result).toBe(false);
      expect(onExecute).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('returns false for empty action URL (imacros://)', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onExecute = vi.fn();
      const result = handleProtocolUrl('imacros://', onExecute);

      expect(result).toBe(false);
      expect(onExecute).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('passes extra query params through to onExecute', () => {
      const onExecute = vi.fn();
      handleProtocolUrl('imacros://run?m=test.iim&loop=5&datasource=data.csv', onExecute);

      expect(onExecute).toHaveBeenCalledWith({
        macroName: 'test.iim',
        params: { m: 'test.iim', loop: '5', datasource: 'data.csv' },
      });
    });
  });

  // ---------------------------------------------------------------
  // isImacrosProtocolUrl
  // ---------------------------------------------------------------
  describe('isImacrosProtocolUrl', () => {
    it('returns true for a lowercase imacros:// URL', () => {
      expect(isImacrosProtocolUrl('imacros://run')).toBe(true);
    });

    it('returns true for an uppercase IMACROS:// URL (case insensitive)', () => {
      expect(isImacrosProtocolUrl('IMACROS://RUN')).toBe(true);
    });

    it('returns true for mixed-case iMacros:// URL', () => {
      expect(isImacrosProtocolUrl('iMacros://run?m=test.iim')).toBe(true);
    });

    it('returns false for an https URL', () => {
      expect(isImacrosProtocolUrl('https://example.com')).toBe(false);
    });

    it('returns false for an http URL', () => {
      expect(isImacrosProtocolUrl('http://example.com')).toBe(false);
    });

    it('returns false for an empty string', () => {
      expect(isImacrosProtocolUrl('')).toBe(false);
    });

    it('returns false for a string that contains imacros:// but does not start with it', () => {
      expect(isImacrosProtocolUrl('https://example.com?redirect=imacros://run')).toBe(false);
    });
  });
});
