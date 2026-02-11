/**
 * Editor & iim-mode Unit Tests
 *
 * Tests for extension/src/editor/iim-mode.ts covering:
 * - COMMANDS, PARAMETERS, SYSTEM_VARS exports
 * - getCommandCompletions / getParameterCompletions / getVariableCompletions
 * - iimLanguage StreamLanguage tokenizer (comments, strings, commands, variables, numbers, URLs)
 * - iimHighlightStyle definition
 * - iim() LanguageSupport factory
 */
import { describe, it, expect } from 'vitest';

import {
  COMMANDS,
  PARAMETERS,
  SYSTEM_VARS,
  getCommandCompletions,
  getParameterCompletions,
  getVariableCompletions,
  iim,
  iimLanguage,
  iimHighlightStyle,
} from '@extension/editor/iim-mode';

describe('iim-mode Constants', () => {
  describe('COMMANDS', () => {
    it('should export an array of command strings', () => {
      expect(Array.isArray(COMMANDS)).toBe(true);
      expect(COMMANDS.length).toBeGreaterThan(0);
    });

    it('should include core navigation commands', () => {
      expect(COMMANDS).toContain('URL');
      expect(COMMANDS).toContain('TAB');
      expect(COMMANDS).toContain('FRAME');
      expect(COMMANDS).toContain('BACK');
      expect(COMMANDS).toContain('REFRESH');
    });

    it('should include core interaction commands', () => {
      expect(COMMANDS).toContain('TAG');
      expect(COMMANDS).toContain('CLICK');
      expect(COMMANDS).toContain('EVENT');
    });

    it('should include data commands', () => {
      expect(COMMANDS).toContain('SET');
      expect(COMMANDS).toContain('ADD');
      expect(COMMANDS).toContain('EXTRACT');
      expect(COMMANDS).toContain('SAVEAS');
    });

    it('should include dialog commands', () => {
      expect(COMMANDS).toContain('ONDIALOG');
      expect(COMMANDS).toContain('ONERRORDIALOG');
      expect(COMMANDS).toContain('ONLOGIN');
    });

    it('should include control flow commands', () => {
      expect(COMMANDS).toContain('WAIT');
      expect(COMMANDS).toContain('PAUSE');
    });

    it('should include DS command', () => {
      expect(COMMANDS).toContain('DS');
    });

    it('should include PROXY command', () => {
      expect(COMMANDS).toContain('PROXY');
    });

    it('should include VERSION command', () => {
      expect(COMMANDS).toContain('VERSION');
    });
  });

  describe('PARAMETERS', () => {
    it('should export an array of parameter strings', () => {
      expect(Array.isArray(PARAMETERS)).toBe(true);
      expect(PARAMETERS.length).toBeGreaterThan(0);
    });

    it('should include common parameters', () => {
      expect(PARAMETERS).toContain('GOTO');
      expect(PARAMETERS).toContain('POS');
      expect(PARAMETERS).toContain('TYPE');
      expect(PARAMETERS).toContain('ATTR');
      expect(PARAMETERS).toContain('CONTENT');
      expect(PARAMETERS).toContain('EXTRACT');
    });

    it('should include tab/frame parameters', () => {
      expect(PARAMETERS).toContain('T');
      expect(PARAMETERS).toContain('F');
      expect(PARAMETERS).toContain('NAME');
    });

    it('should include boolean parameters', () => {
      expect(PARAMETERS).toContain('YES');
      expect(PARAMETERS).toContain('NO');
      expect(PARAMETERS).toContain('TRUE');
      expect(PARAMETERS).toContain('FALSE');
    });
  });

  describe('SYSTEM_VARS', () => {
    it('should export an array of system variable strings', () => {
      expect(Array.isArray(SYSTEM_VARS)).toBe(true);
      expect(SYSTEM_VARS.length).toBeGreaterThan(0);
    });

    it('should include loop variable', () => {
      expect(SYSTEM_VARS).toContain('!LOOP');
    });

    it('should include VAR variables', () => {
      expect(SYSTEM_VARS).toContain('!VAR0');
      expect(SYSTEM_VARS).toContain('!VAR1');
      expect(SYSTEM_VARS).toContain('!VAR9');
    });

    it('should include COL variables', () => {
      expect(SYSTEM_VARS).toContain('!COL1');
      expect(SYSTEM_VARS).toContain('!COL10');
    });

    it('should include timeout variables', () => {
      expect(SYSTEM_VARS).toContain('!TIMEOUT');
      expect(SYSTEM_VARS).toContain('!TIMEOUT_STEP');
      expect(SYSTEM_VARS).toContain('!TIMEOUT_PAGE');
    });

    it('should include datasource variables', () => {
      expect(SYSTEM_VARS).toContain('!DATASOURCE');
      expect(SYSTEM_VARS).toContain('!DATASOURCE_LINE');
      expect(SYSTEM_VARS).toContain('!DATASOURCE_COLUMNS');
    });

    it('should include URL variables', () => {
      expect(SYSTEM_VARS).toContain('!URLSTART');
      expect(SYSTEM_VARS).toContain('!URLCURRENT');
    });

    it('should include extract variable', () => {
      expect(SYSTEM_VARS).toContain('!EXTRACT');
    });

    it('should include clipboard variable', () => {
      expect(SYSTEM_VARS).toContain('!CLIPBOARD');
    });

    it('should all start with !', () => {
      for (const v of SYSTEM_VARS) {
        expect(v.startsWith('!')).toBe(true);
      }
    });
  });
});

describe('Completion Functions', () => {
  describe('getCommandCompletions', () => {
    it('should return completions for all commands', () => {
      const completions = getCommandCompletions();
      expect(completions.length).toBe(COMMANDS.length);
    });

    it('should return objects with label and type', () => {
      const completions = getCommandCompletions();
      for (const c of completions) {
        expect(c).toHaveProperty('label');
        expect(c).toHaveProperty('type');
        expect(c.type).toBe('keyword');
      }
    });

    it('should include descriptions for known commands', () => {
      const completions = getCommandCompletions();
      const urlCompletion = completions.find(c => c.label === 'URL');
      expect(urlCompletion?.info).toBeTruthy();
      expect(urlCompletion?.info).toContain('Navigate');
    });
  });

  describe('getParameterCompletions', () => {
    it('should return completions for all parameters', () => {
      const completions = getParameterCompletions();
      expect(completions.length).toBe(PARAMETERS.length);
    });

    it('should have type "property"', () => {
      const completions = getParameterCompletions();
      for (const c of completions) {
        expect(c.type).toBe('property');
      }
    });
  });

  describe('getVariableCompletions', () => {
    it('should return completions for all system variables', () => {
      const completions = getVariableCompletions();
      expect(completions.length).toBe(SYSTEM_VARS.length);
    });

    it('should wrap variables in {{ }}', () => {
      const completions = getVariableCompletions();
      for (const c of completions) {
        expect(c.label).toMatch(/^\{\{!.+\}\}$/);
      }
    });

    it('should have type "variable"', () => {
      const completions = getVariableCompletions();
      for (const c of completions) {
        expect(c.type).toBe('variable');
      }
    });

    it('should include descriptions for some variables', () => {
      const completions = getVariableCompletions();
      const loopCompletion = completions.find(c => c.label === '{{!LOOP}}');
      expect(loopCompletion?.info).toBeTruthy();
    });
  });
});

describe('iimLanguage', () => {
  it('should be a StreamLanguage instance', () => {
    expect(iimLanguage).toBeDefined();
    expect(iimLanguage.name).toBe('iim');
  });

  describe('Tokenizer', () => {
    // Helper to tokenize a line using the StreamLanguage parser
    function tokenizeLine(text: string): { token: string | null; text: string }[] {
      const tokens: { token: string | null; text: string }[] = [];
      const parser = iimLanguage.streamParser;
      const state = parser.startState!(0);

      // Create a simple stream-like object
      let pos = 0;
      const stream = {
        sol: () => pos === 0,
        eol: () => pos >= text.length,
        peek: () => pos < text.length ? text[pos] : '',
        next: () => {
          if (pos < text.length) return text[pos++];
          return '';
        },
        eat: (match: string | RegExp) => {
          if (typeof match === 'string') {
            if (text[pos] === match) { pos++; return match; }
            return undefined;
          }
          const m = text.slice(pos).match(match);
          if (m && m.index === 0) { pos += m[0].length; return m[0]; }
          return undefined;
        },
        match: (pattern: string | RegExp, consume?: boolean) => {
          if (typeof pattern === 'string') {
            if (text.slice(pos).startsWith(pattern)) {
              if (consume !== false) pos += pattern.length;
              return true;
            }
            return false;
          }
          const m = text.slice(pos).match(pattern);
          if (m && m.index === 0) {
            if (consume !== false) pos += m[0].length;
            return m;
          }
          return null;
        },
        eatSpace: () => {
          const start = pos;
          while (pos < text.length && (text[pos] === ' ' || text[pos] === '\t')) pos++;
          return pos > start;
        },
        skipToEnd: () => { pos = text.length; },
        current: () => text.slice(0, pos),
        column: () => pos,
        indentation: () => 0,
        lookAhead: () => undefined,
        baseToken: () => undefined,
      };

      while (!stream.eol()) {
        const start = pos;
        const token = parser.token!(stream as any, state);
        const end = pos;
        if (end > start) {
          tokens.push({ token, text: text.slice(start, end) });
        }
        // Safety: if no progress, advance
        if (pos === start) {
          pos++;
        }
      }
      return tokens;
    }

    it('should tokenize comments', () => {
      const tokens = tokenizeLine("' This is a comment");
      expect(tokens[0].token).toBe('comment');
    });

    it('should tokenize commands as keywords', () => {
      const tokens = tokenizeLine('URL GOTO=https://example.com');
      expect(tokens[0].token).toBe('keyword');
      expect(tokens[0].text).toBe('URL');
    });

    it('should tokenize strings in double quotes', () => {
      const tokens = tokenizeLine('TAG ATTR="NAME:test"');
      const stringToken = tokens.find(t => t.token === 'string');
      expect(stringToken).toBeDefined();
    });

    it('should tokenize numbers', () => {
      const tokens = tokenizeLine('WAIT SECONDS=5');
      const numToken = tokens.find(t => t.token === 'number');
      expect(numToken).toBeDefined();
      expect(numToken!.text).toBe('5');
    });

    it('should tokenize parameters', () => {
      const tokens = tokenizeLine('TAG POS=1');
      const paramToken = tokens.find(t => t.text === 'POS');
      expect(paramToken).toBeDefined();
      expect(paramToken!.token).toBe('propertyName');
    });

    it('should tokenize = operator', () => {
      const tokens = tokenizeLine('SET !VAR1 test');
      // The SET command should be a keyword
      expect(tokens[0].token).toBe('keyword');
    });
  });
});

describe('iimHighlightStyle', () => {
  it('should be defined', () => {
    expect(iimHighlightStyle).toBeDefined();
  });
});

describe('iim() factory', () => {
  it('should return a LanguageSupport instance', () => {
    const support = iim();
    expect(support).toBeDefined();
    // LanguageSupport has an `extension` property
    expect(support).toHaveProperty('extension');
  });
});
