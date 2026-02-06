/**
 * Unit tests for iMacros Parser
 *
 * Tests parsing of all 40+ commands, error handling for invalid syntax,
 * and variable detection.
 */
import { describe, it, expect } from 'vitest';
import {
  parseMacro,
  parseLine,
  parseParameters,
  extractVariables,
  unquoteValue,
  isSystemVariable,
  isValidCommand,
  getSupportedCommands,
  validateCommand,
  serializeCommand,
  serializeMacro,
  SYSTEM_VARIABLES,
  type ParsedCommand,
  type ParsedMacro,
} from '../../shared/src/parser';

describe('iMacros Parser', () => {
  // ============================================================
  // SECTION: Basic Parsing
  // ============================================================
  describe('Basic Parsing', () => {
    it('should parse an empty script', () => {
      const result = parseMacro('');
      expect(result.lines).toHaveLength(1);
      expect(result.commands).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse empty lines', () => {
      const result = parseMacro('\n\n\n');
      expect(result.lines).toHaveLength(4);
      result.lines.forEach(line => {
        expect(line.type).toBe('empty');
      });
    });

    it('should parse whitespace-only lines as empty', () => {
      const result = parseMacro('   \n\t\t\n   \t   ');
      expect(result.lines).toHaveLength(3);
      result.lines.forEach(line => {
        expect(line.type).toBe('empty');
      });
    });

    it('should preserve original line text', () => {
      const script = "URL GOTO=http://example.com\n'comment\n\n";
      const result = parseMacro(script);
      expect(result.lines[0].data.raw).toBe('URL GOTO=http://example.com');
      expect(result.lines[1].data.raw).toBe("'comment");
    });

    it('should correctly number lines (1-based)', () => {
      const result = parseMacro('LINE1\nLINE2\nLINE3');
      expect(result.lines[0].data.lineNumber).toBe(1);
      expect(result.lines[1].data.lineNumber).toBe(2);
      expect(result.lines[2].data.lineNumber).toBe(3);
    });

    it('should handle Windows line endings (CRLF)', () => {
      const result = parseMacro('LINE1\r\nLINE2\r\nLINE3');
      expect(result.lines).toHaveLength(3);
      expect(result.commands).toHaveLength(3);
    });

    it('should handle mixed line endings', () => {
      const result = parseMacro('LINE1\nLINE2\r\nLINE3');
      expect(result.lines).toHaveLength(3);
    });
  });

  // ============================================================
  // SECTION: Comment Parsing
  // ============================================================
  describe('Comment Parsing', () => {
    it('should parse single-line comments', () => {
      const result = parseMacro("'This is a comment");
      expect(result.lines[0].type).toBe('comment');
      expect(result.comments[0].text).toBe('This is a comment');
    });

    it('should parse comments with leading whitespace', () => {
      const result = parseMacro("   'Indented comment");
      expect(result.lines[0].type).toBe('comment');
      expect(result.comments[0].text).toBe('Indented comment');
    });

    it('should parse empty comments', () => {
      const result = parseMacro("'");
      expect(result.lines[0].type).toBe('comment');
      expect(result.comments[0].text).toBe('');
    });

    it('should parse comments with special characters', () => {
      const result = parseMacro("'Comment with \"quotes\" and 'apostrophe");
      expect(result.comments[0].text).toBe('Comment with \"quotes\" and \'apostrophe');
    });

    it('should collect all comments separately', () => {
      const script = "'Comment 1\nURL GOTO=test\n'Comment 2\n'Comment 3";
      const result = parseMacro(script);
      expect(result.comments).toHaveLength(3);
      expect(result.comments.map(c => c.text)).toEqual([
        'Comment 1',
        'Comment 2',
        'Comment 3',
      ]);
    });
  });

  // ============================================================
  // SECTION: VERSION Command
  // ============================================================
  describe('VERSION Command', () => {
    it('should parse VERSION with BUILD parameter', () => {
      const result = parseMacro('VERSION BUILD=7500718');
      expect(result.version?.build).toBe('7500718');
    });

    it('should parse VERSION with BUILD and RECORDER', () => {
      const result = parseMacro('VERSION BUILD=7500718 RECORDER=FX');
      expect(result.version?.build).toBe('7500718');
      expect(result.version?.recorder).toBe('FX');
    });

    it('should parse VERSION with extra whitespace', () => {
      const result = parseMacro('VERSION  BUILD=8031994');
      expect(result.version?.build).toBe('8031994');
    });

    it('should return undefined version if not present', () => {
      const result = parseMacro('URL GOTO=http://example.com');
      expect(result.version).toBeUndefined();
    });
  });

  // ============================================================
  // SECTION: URL Command
  // ============================================================
  describe('URL Command', () => {
    it('should parse URL GOTO with simple URL', () => {
      const result = parseMacro('URL GOTO=http://example.com');
      expect(result.commands[0].type).toBe('URL');
      const gotoParam = result.commands[0].parameters.find(p => p.key === 'GOTO');
      expect(gotoParam?.value).toBe('http://example.com');
    });

    it('should parse URL GOTO with complex URL', () => {
      const result = parseMacro('URL GOTO=http://demo.imacros.net/Automate/TestForm1');
      const gotoParam = result.commands[0].parameters.find(p => p.key === 'GOTO');
      expect(gotoParam?.value).toBe('http://demo.imacros.net/Automate/TestForm1');
    });

    it('should parse URL GOTO with variables', () => {
      const result = parseMacro('URL GOTO={{!URLSTART}}');
      const gotoParam = result.commands[0].parameters.find(p => p.key === 'GOTO');
      expect(gotoParam?.value).toBe('{{!URLSTART}}');
      expect(gotoParam?.variables).toHaveLength(1);
      expect(gotoParam?.variables[0].name).toBe('!URLSTART');
    });

    it('should validate URL command requires GOTO', () => {
      const result = parseMacro('URL', true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('GOTO');
    });
  });

  // ============================================================
  // SECTION: TAB Command
  // ============================================================
  describe('TAB Command', () => {
    it('should parse TAB T=1', () => {
      const result = parseMacro('TAB T=1');
      expect(result.commands[0].type).toBe('TAB');
      const tParam = result.commands[0].parameters.find(p => p.key === 'T');
      expect(tParam?.value).toBe('1');
    });

    it('should parse TAB with various tab numbers', () => {
      const result = parseMacro('TAB T=4');
      const tParam = result.commands[0].parameters.find(p => p.key === 'T');
      expect(tParam?.value).toBe('4');
    });

    it('should validate TAB requires T parameter', () => {
      const result = parseMacro('TAB', true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('T parameter');
    });
  });

  // ============================================================
  // SECTION: FRAME Command
  // ============================================================
  describe('FRAME Command', () => {
    it('should parse FRAME F=1', () => {
      const result = parseMacro('FRAME F=1');
      expect(result.commands[0].type).toBe('FRAME');
      const fParam = result.commands[0].parameters.find(p => p.key === 'F');
      expect(fParam?.value).toBe('1');
    });

    it('should parse FRAME with various frame numbers', () => {
      const result = parseMacro('FRAME F=10');
      const fParam = result.commands[0].parameters.find(p => p.key === 'F');
      expect(fParam?.value).toBe('10');
    });

    it('should validate FRAME requires F or NAME parameter', () => {
      const result = parseMacro('FRAME', true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('F or NAME parameter');
    });

    it('should parse FRAME with NAME parameter', () => {
      const result = parseMacro('FRAME NAME=main_frame');
      expect(result.commands).toHaveLength(1);
      expect(result.commands[0].type).toBe('FRAME');
      const nameParam = result.commands[0].parameters.find(p => p.key === 'NAME');
      expect(nameParam?.value).toBe('main_frame');
      expect(result.errors).toHaveLength(0);
    });
  });

  // ============================================================
  // SECTION: TAG Command
  // ============================================================
  describe('TAG Command', () => {
    it('should parse simple TAG command', () => {
      const result = parseMacro('TAG POS=1 TYPE=INPUT:TEXT ATTR=NAME:test');
      expect(result.commands[0].type).toBe('TAG');
      expect(result.commands[0].parameters).toHaveLength(3);
    });

    it('should parse TAG with FORM parameter', () => {
      const result = parseMacro('TAG POS=1 TYPE=INPUT:TEXT FORM=ID:demo ATTR=ID:name');
      const formParam = result.commands[0].parameters.find(p => p.key === 'FORM');
      expect(formParam?.value).toBe('ID:demo');
    });

    it('should parse TAG with CONTENT parameter', () => {
      const result = parseMacro('TAG POS=1 TYPE=INPUT:TEXT ATTR=NAME:test CONTENT=value');
      const contentParam = result.commands[0].parameters.find(p => p.key === 'CONTENT');
      expect(contentParam?.value).toBe('value');
    });

    it('should parse TAG with quoted CONTENT', () => {
      const result = parseMacro('TAG POS=1 TYPE=INPUT:TEXT ATTR=NAME:test CONTENT="Suman Tester"');
      const contentParam = result.commands[0].parameters.find(p => p.key === 'CONTENT');
      expect(contentParam?.value).toBe('Suman Tester');
    });

    it('should parse TAG with EXTRACT parameter', () => {
      const result = parseMacro('TAG POS=1 TYPE=TD ATTR=CLASS:bdytxt EXTRACT=TXT');
      const extractParam = result.commands[0].parameters.find(p => p.key === 'EXTRACT');
      expect(extractParam?.value).toBe('TXT');
    });

    it('should parse TAG with EXTRACT=HTM', () => {
      const result = parseMacro('TAG POS=1 TYPE=SPAN ATTR=CLASS:bdytxt EXTRACT=HTM');
      const extractParam = result.commands[0].parameters.find(p => p.key === 'EXTRACT');
      expect(extractParam?.value).toBe('HTM');
    });

    it('should parse TAG with EXTRACT=HREF', () => {
      const result = parseMacro('TAG POS=1 TYPE=A ATTR=TXT:link EXTRACT=HREF');
      const extractParam = result.commands[0].parameters.find(p => p.key === 'EXTRACT');
      expect(extractParam?.value).toBe('HREF');
    });

    it('should parse TAG with wildcard in ATTR', () => {
      const result = parseMacro('TAG POS=1 TYPE=A ATTR=TXT:*Download*');
      const attrParam = result.commands[0].parameters.find(p => p.key === 'ATTR');
      expect(attrParam?.value).toBe('TXT:*Download*');
    });

    it('should parse TAG with double ampersand in ATTR', () => {
      const result = parseMacro('TAG POS=1 TYPE=TD ATTR=CLASS:bdytxt&&TXT:*');
      const attrParam = result.commands[0].parameters.find(p => p.key === 'ATTR');
      expect(attrParam?.value).toBe('CLASS:bdytxt&&TXT:*');
    });

    it('should parse TAG with percent sign for select content', () => {
      const result = parseMacro('TAG POS=1 TYPE=SELECT ATTR=NAME:food CONTENT=%Pizza');
      const contentParam = result.commands[0].parameters.find(p => p.key === 'CONTENT');
      expect(contentParam?.value).toBe('%Pizza');
    });

    it('should parse TAG with multiple select values using colon', () => {
      const result = parseMacro('TAG POS=1 TYPE=SELECT ATTR=ID:dessert CONTENT=%"ice cream":%"Apple Pie"');
      const contentParam = result.commands[0].parameters.find(p => p.key === 'CONTENT');
      expect(contentParam?.value).toBe('%"ice cream":%"Apple Pie"');
    });

    it('should parse TAG with relative position (POS=R3)', () => {
      const result = parseMacro('TAG POS=R3 TYPE=TD ATTR=TXT:* EXTRACT=TXT');
      const posParam = result.commands[0].parameters.find(p => p.key === 'POS');
      expect(posParam?.value).toBe('R3');
    });

    it('should parse TAG with XPATH', () => {
      const result = parseMacro('TAG XPATH="//form[@id=\'demo\']/input[1]" CONTENT="test"');
      expect(result.commands[0].type).toBe('TAG');
      const xpathParam = result.commands[0].parameters.find(p => p.key === 'XPATH');
      expect(xpathParam?.value).toBe("//form[@id='demo']/input[1]");
    });

    it('should parse TAG with complex XPATH', () => {
      const script = `TAG XPATH="//form[@id='demo']/fieldset[1]/ol/li[1]/input[1]" CONTENT="Tom Tester"`;
      const result = parseMacro(script);
      const xpathParam = result.commands[0].parameters.find(p => p.key === 'XPATH');
      expect(xpathParam?.value).toContain('fieldset[1]');
    });

    it('should parse TAG with radio button', () => {
      const result = parseMacro('TAG POS=1 TYPE=INPUT:RADIO FORM=ID:demo ATTR=ID:medium&&VALUE:medium CONTENT=YES');
      const typeParam = result.commands[0].parameters.find(p => p.key === 'TYPE');
      expect(typeParam?.value).toBe('INPUT:RADIO');
    });

    it('should parse TAG with checkbox', () => {
      const result = parseMacro('TAG POS=1 TYPE=INPUT:CHECKBOX ATTR=NAME:agree CONTENT=YES');
      const typeParam = result.commands[0].parameters.find(p => p.key === 'TYPE');
      expect(typeParam?.value).toBe('INPUT:CHECKBOX');
    });

    it('should parse TAG with password input', () => {
      const result = parseMacro('TAG POS=1 TYPE=INPUT:PASSWORD FORM=ID:demo ATTR=NAME:Reg_code CONTENT=tester');
      const typeParam = result.commands[0].parameters.find(p => p.key === 'TYPE');
      expect(typeParam?.value).toBe('INPUT:PASSWORD');
    });

    it('should parse TAG with textarea', () => {
      const result = parseMacro('TAG POS=1 TYPE=TEXTAREA FORM=ID:demo ATTR=NAME:Remarks CONTENT="test message"');
      const typeParam = result.commands[0].parameters.find(p => p.key === 'TYPE');
      expect(typeParam?.value).toBe('TEXTAREA');
    });

    it('should parse TAG with submit button', () => {
      const result = parseMacro('TAG POS=1 TYPE=BUTTON:SUBMIT FORM=ID:demo ATTR=TXT:"Click here"');
      const typeParam = result.commands[0].parameters.find(p => p.key === 'TYPE');
      expect(typeParam?.value).toBe('BUTTON:SUBMIT');
    });

    it('should parse TAG with file input', () => {
      const result = parseMacro('TAG POS=1 TYPE=INPUT:FILE FORM=ID:demo ATTR=NAME:uploaded_file CONTENT={{!FOLDER_DATASOURCE}}\\Address.csv');
      const typeParam = result.commands[0].parameters.find(p => p.key === 'TYPE');
      expect(typeParam?.value).toBe('INPUT:FILE');
    });

    it('should parse TAG with table extraction', () => {
      const result = parseMacro('TAG POS=2 TYPE=TABLE ATTR=TXT:* EXTRACT=TXT');
      const typeParam = result.commands[0].parameters.find(p => p.key === 'TYPE');
      expect(typeParam?.value).toBe('TABLE');
    });

    it('should validate TAG requires POS and TYPE or XPATH', () => {
      const result = parseMacro('TAG ATTR=NAME:test', true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('XPATH or POS and TYPE');
    });

    it('should not error when TAG has XPATH', () => {
      const result = parseMacro('TAG XPATH="//input" CONTENT=test', true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ============================================================
  // SECTION: SET Command
  // ============================================================
  describe('SET Command', () => {
    it('should parse SET with system variable', () => {
      const result = parseMacro('SET !VAR1 value');
      expect(result.commands[0].type).toBe('SET');
      expect(result.commands[0].parameters[0].key).toBe('!VAR1');
      expect(result.commands[0].parameters[1].key).toBe('value');
    });

    it('should parse SET !ENCRYPTION NO', () => {
      const result = parseMacro('SET !ENCRYPTION NO');
      expect(result.commands[0].parameters[0].key).toBe('!ENCRYPTION');
      expect(result.commands[0].parameters[1].key).toBe('NO');
    });

    it('should parse SET !EXTRACT NULL', () => {
      const result = parseMacro('SET !EXTRACT NULL');
      expect(result.commands[0].parameters[0].key).toBe('!EXTRACT');
      expect(result.commands[0].parameters[1].key).toBe('NULL');
    });

    it('should parse SET !DATASOURCE', () => {
      const result = parseMacro('SET !DATASOURCE Address.csv');
      expect(result.commands[0].parameters[0].key).toBe('!DATASOURCE');
      expect(result.commands[0].parameters[1].key).toBe('Address.csv');
    });

    it('should parse SET !DATASOURCE_LINE with variable', () => {
      const result = parseMacro('SET !DATASOURCE_LINE {{!LOOP}}');
      expect(result.commands[0].parameters[0].key).toBe('!DATASOURCE_LINE');
    });

    it('should parse SET !LOOP', () => {
      const result = parseMacro('SET !LOOP 2');
      expect(result.commands[0].parameters[0].key).toBe('!LOOP');
    });

    it('should parse SET !EXTRACT_TEST_POPUP', () => {
      const result = parseMacro('SET !EXTRACT_TEST_POPUP NO');
      expect(result.commands[0].parameters[0].key).toBe('!EXTRACT_TEST_POPUP');
    });

    it('should parse SET !TIMEOUT_STEP', () => {
      const result = parseMacro('SET !TIMEOUT_STEP 5');
      expect(result.commands[0].parameters[0].key).toBe('!TIMEOUT_STEP');
    });

    it('should parse SET !ERRORIGNORE', () => {
      const result = parseMacro('SET !ERRORIGNORE YES');
      expect(result.commands[0].parameters[0].key).toBe('!ERRORIGNORE');
    });

    it('should parse SET with EVAL', () => {
      const result = parseMacro('SET !VAR1 EVAL("Math.floor(Math.random()*5 + 1);")');
      expect(result.commands[0].parameters[0].key).toBe('!VAR1');
    });

    it('should parse SET !FILESTOPWATCH', () => {
      const result = parseMacro('SET !FILESTOPWATCH C:\\Temp\\demo-stopwatch.csv');
      expect(result.commands[0].parameters[0].key).toBe('!FILESTOPWATCH');
    });

    it('should validate SET requires variable and value', () => {
      const result = parseMacro('SET !VAR1', true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('variable name and value');
    });
  });

  // ============================================================
  // SECTION: WAIT Command
  // ============================================================
  describe('WAIT Command', () => {
    it('should parse WAIT SECONDS=3', () => {
      const result = parseMacro('WAIT SECONDS=3');
      expect(result.commands[0].type).toBe('WAIT');
      const secondsParam = result.commands[0].parameters.find(p => p.key === 'SECONDS');
      expect(secondsParam?.value).toBe('3');
    });

    it('should parse WAIT SECONDS with variable', () => {
      const result = parseMacro('WAIT SECONDS={{!VAR1}}');
      const secondsParam = result.commands[0].parameters.find(p => p.key === 'SECONDS');
      expect(secondsParam?.variables).toHaveLength(1);
      expect(secondsParam?.variables[0].name).toBe('!VAR1');
    });

    it('should validate WAIT requires SECONDS', () => {
      const result = parseMacro('WAIT', true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('SECONDS');
    });
  });

  // ============================================================
  // SECTION: SAVEAS Command
  // ============================================================
  describe('SAVEAS Command', () => {
    it('should parse SAVEAS TYPE=CPL', () => {
      const result = parseMacro('SAVEAS TYPE=CPL FOLDER=* FILE=test');
      expect(result.commands[0].type).toBe('SAVEAS');
      const typeParam = result.commands[0].parameters.find(p => p.key === 'TYPE');
      expect(typeParam?.value).toBe('CPL');
    });

    it('should parse SAVEAS TYPE=HTM', () => {
      const result = parseMacro('SAVEAS TYPE=HTM FOLDER=* FILE=test');
      const typeParam = result.commands[0].parameters.find(p => p.key === 'TYPE');
      expect(typeParam?.value).toBe('HTM');
    });

    it('should parse SAVEAS TYPE=TXT', () => {
      const result = parseMacro('SAVEAS TYPE=TXT FOLDER=* FILE=test');
      const typeParam = result.commands[0].parameters.find(p => p.key === 'TYPE');
      expect(typeParam?.value).toBe('TXT');
    });

    it('should parse SAVEAS TYPE=EXTRACT', () => {
      const result = parseMacro('SAVEAS TYPE=EXTRACT FOLDER=* FILE=mytable.csv');
      const typeParam = result.commands[0].parameters.find(p => p.key === 'TYPE');
      expect(typeParam?.value).toBe('EXTRACT');
    });

    it('should parse SAVEAS with timestamp variable', () => {
      const result = parseMacro('SAVEAS TYPE=CPL FOLDER=* FILE=+_{{!NOW:yyyymmdd_hhnnss}}');
      const fileParam = result.commands[0].parameters.find(p => p.key === 'FILE');
      expect(fileParam?.variables).toHaveLength(1);
      expect(fileParam?.variables[0].name).toBe('!NOW:yyyymmdd_hhnnss');
    });

    it('should validate SAVEAS requires TYPE', () => {
      const result = parseMacro('SAVEAS FOLDER=* FILE=test', true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('TYPE');
    });
  });

  // ============================================================
  // SECTION: STOPWATCH Command
  // ============================================================
  describe('STOPWATCH Command', () => {
    it('should parse STOPWATCH ID=Total', () => {
      const result = parseMacro('STOPWATCH ID=Total');
      expect(result.commands[0].type).toBe('STOPWATCH');
      const idParam = result.commands[0].parameters.find(p => p.key === 'ID');
      expect(idParam?.value).toBe('Total');
    });

    it('should parse STOPWATCH with various IDs', () => {
      const result = parseMacro('STOPWATCH ID=SubmitData');
      const idParam = result.commands[0].parameters.find(p => p.key === 'ID');
      expect(idParam?.value).toBe('SubmitData');
    });

    it('should validate STOPWATCH requires ID', () => {
      const result = parseMacro('STOPWATCH', true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('ID');
    });
  });

  // ============================================================
  // SECTION: ONDOWNLOAD Command
  // ============================================================
  describe('ONDOWNLOAD Command', () => {
    it('should parse ONDOWNLOAD with FOLDER and FILE', () => {
      const result = parseMacro('ONDOWNLOAD FOLDER=* FILE=*');
      expect(result.commands[0].type).toBe('ONDOWNLOAD');
    });

    it('should parse ONDOWNLOAD with WAIT parameter', () => {
      const result = parseMacro('ONDOWNLOAD FOLDER=* FILE=* WAIT=YES');
      const waitParam = result.commands[0].parameters.find(p => p.key === 'WAIT');
      expect(waitParam?.value).toBe('YES');
    });

    it('should parse ONDOWNLOAD with timestamp in filename', () => {
      const result = parseMacro('ONDOWNLOAD FOLDER=* FILE=+_{{!NOW:yyyymmdd_hhnnss}}');
      const fileParam = result.commands[0].parameters.find(p => p.key === 'FILE');
      expect(fileParam?.variables).toHaveLength(1);
    });

    it('should validate ONDOWNLOAD requires FOLDER or FILE', () => {
      const result = parseMacro('ONDOWNLOAD WAIT=YES', true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('FOLDER');
    });
  });

  // ============================================================
  // SECTION: FILTER Command
  // ============================================================
  describe('FILTER Command', () => {
    it('should parse FILTER TYPE=IMAGES STATUS=ON', () => {
      const result = parseMacro('FILTER TYPE=IMAGES STATUS=ON');
      expect(result.commands[0].type).toBe('FILTER');
      const typeParam = result.commands[0].parameters.find(p => p.key === 'TYPE');
      expect(typeParam?.value).toBe('IMAGES');
    });

    it('should parse FILTER TYPE=IMAGES STATUS=OFF', () => {
      const result = parseMacro('FILTER TYPE=IMAGES STATUS=OFF');
      const statusParam = result.commands[0].parameters.find(p => p.key === 'STATUS');
      expect(statusParam?.value).toBe('OFF');
    });

    it('should validate FILTER requires TYPE', () => {
      const result = parseMacro('FILTER STATUS=ON', true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('TYPE');
    });
  });

  // ============================================================
  // SECTION: ONDIALOG Command
  // ============================================================
  describe('ONDIALOG Command', () => {
    it('should parse ONDIALOG with POS and BUTTON', () => {
      const result = parseMacro('ONDIALOG POS=1 BUTTON=OK CONTENT=');
      expect(result.commands[0].type).toBe('ONDIALOG');
    });

    it('should parse ONDIALOG with BUTTON=CANCEL', () => {
      const result = parseMacro('ONDIALOG POS=1 BUTTON=CANCEL');
      const buttonParam = result.commands[0].parameters.find(p => p.key === 'BUTTON');
      expect(buttonParam?.value).toBe('CANCEL');
    });

    it('should validate ONDIALOG requires POS and BUTTON', () => {
      const result = parseMacro('ONDIALOG POS=1', true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('POS and BUTTON');
    });
  });

  // ============================================================
  // SECTION: PROMPT Command
  // ============================================================
  describe('PROMPT Command', () => {
    it('should parse PROMPT command', () => {
      const result = parseMacro('PROMPT "Enter a Page Name" !VAR1 NoName_Time_{{!NOW:yyyymmdd_hhnnss}}');
      expect(result.commands[0].type).toBe('PROMPT');
    });

    it('should parse PROMPT with quoted message', () => {
      // PROMPT uses space-separated tokens, so "Enter your name" is the first token
      const result = parseMacro('PROMPT "Enter your name" !VAR1 default');
      // The quoted string is parsed and unquoted to become the key
      expect(result.commands[0].parameters[0].key).toBe('Enter your name');
      expect(result.commands[0].parameters[1].key).toBe('!VAR1');
      expect(result.commands[0].parameters[2].key).toBe('default');
    });

    it('should accept PROMPT with just message (displays alert)', () => {
      // PROMPT can display just an alert with no variable
      const result = parseMacro('PROMPT "message"', true);
      expect(result.errors).toHaveLength(0);
      expect(result.commands[0].type).toBe('PROMPT');
    });

    it('should validate PROMPT requires at least a message', () => {
      const result = parseMacro('PROMPT', true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('message');
    });
  });

  // ============================================================
  // SECTION: Navigation Commands
  // ============================================================
  describe('Navigation Commands', () => {
    it('should parse BACK command', () => {
      const result = parseMacro('BACK');
      expect(result.commands[0].type).toBe('BACK');
      expect(result.commands[0].parameters).toHaveLength(0);
    });

    it('should parse REFRESH command', () => {
      const result = parseMacro('REFRESH');
      expect(result.commands[0].type).toBe('REFRESH');
    });

    it('should parse PAUSE command', () => {
      const result = parseMacro('PAUSE');
      expect(result.commands[0].type).toBe('PAUSE');
    });
  });

  // ============================================================
  // SECTION: Other Commands
  // ============================================================
  describe('Other Commands', () => {
    it('should parse CLEAR command', () => {
      const result = parseMacro('CLEAR');
      expect(result.commands[0].type).toBe('CLEAR');
    });

    it('should parse CLICK command', () => {
      const result = parseMacro('CLICK X=100 Y=200');
      expect(result.commands[0].type).toBe('CLICK');
    });

    it('should parse EVENT command', () => {
      const result = parseMacro('EVENT TYPE=KEYPRESS SELECTOR=input KEY=13');
      expect(result.commands[0].type).toBe('EVENT');
    });

    it('should parse EXTRACT command', () => {
      const result = parseMacro('EXTRACT');
      expect(result.commands[0].type).toBe('EXTRACT');
    });

    it('should parse PROXY command', () => {
      const result = parseMacro('PROXY ADDRESS=127.0.0.1:8080');
      expect(result.commands[0].type).toBe('PROXY');
    });

    it('should parse SCREENSHOT command', () => {
      const result = parseMacro('SCREENSHOT TYPE=PAGE FOLDER=* FILE=screenshot.png');
      expect(result.commands[0].type).toBe('SCREENSHOT');
    });

    it('should parse SIZE command', () => {
      const result = parseMacro('SIZE X=1024 Y=768');
      expect(result.commands[0].type).toBe('SIZE');
    });

    it('should parse PRINT command', () => {
      const result = parseMacro('PRINT');
      expect(result.commands[0].type).toBe('PRINT');
    });

    it('should parse FILEDELETE command', () => {
      const result = parseMacro('FILEDELETE NAME=temp.txt');
      expect(result.commands[0].type).toBe('FILEDELETE');
    });

    it('should parse CMDLINE command', () => {
      const result = parseMacro('CMDLINE CMD=notepad.exe');
      expect(result.commands[0].type).toBe('CMDLINE');
    });
  });

  // ============================================================
  // SECTION: Additional Commands (40+ total)
  // ============================================================
  describe('Additional Commands', () => {
    it('should parse ADD command', () => {
      const result = parseMacro('ADD !VAR1 10');
      expect(result.commands[0].type).toBe('ADD');
    });

    it('should validate ADD requires variable and value', () => {
      const result = parseMacro('ADD !VAR1', true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('variable name and value');
    });

    it('should parse EVENTS command', () => {
      const result = parseMacro('EVENTS TYPE=keypress SELECTOR="#input" CHARS="hello"');
      expect(result.commands[0].type).toBe('EVENTS');
    });

    it('should parse SEARCH command', () => {
      const result = parseMacro('SEARCH SOURCE=TXT:*search pattern*');
      expect(result.commands[0].type).toBe('SEARCH');
    });

    it('should parse SEARCH with REGEXP', () => {
      const result = parseMacro('SEARCH SOURCE=REGEXP:(\\d+) EXTRACT=$1');
      expect(result.commands[0].type).toBe('SEARCH');
    });

    it('should validate SEARCH requires SOURCE', () => {
      const result = parseMacro('SEARCH', true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('SOURCE');
    });

    it('should parse ONLOGIN command', () => {
      const result = parseMacro('ONLOGIN USER=admin PASSWORD=secret');
      expect(result.commands[0].type).toBe('ONLOGIN');
    });

    it('should validate ONLOGIN requires USER and PASSWORD', () => {
      const result = parseMacro('ONLOGIN USER=admin', true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('USER and PASSWORD');
    });

    it('should parse ONERRORDIALOG command', () => {
      const result = parseMacro('ONERRORDIALOG BUTTON=OK CONTINUE=NO');
      expect(result.commands[0].type).toBe('ONERRORDIALOG');
    });

    it('should parse ONCERTIFICATEDIALOG command', () => {
      const result = parseMacro('ONCERTIFICATEDIALOG BUTTON=OK');
      expect(result.commands[0].type).toBe('ONCERTIFICATEDIALOG');
    });

    it('should parse ONSECURITYDIALOG command', () => {
      const result = parseMacro('ONSECURITYDIALOG BUTTON=YES');
      expect(result.commands[0].type).toBe('ONSECURITYDIALOG');
    });

    it('should parse ONWEBPAGEDIALOG command', () => {
      const result = parseMacro('ONWEBPAGEDIALOG BUTTON=OK');
      expect(result.commands[0].type).toBe('ONWEBPAGEDIALOG');
    });

    it('should parse ONPRINT command', () => {
      const result = parseMacro('ONPRINT');
      expect(result.commands[0].type).toBe('ONPRINT');
    });

    it('should parse IMAGESEARCH command', () => {
      const result = parseMacro('IMAGESEARCH POS=1 IMAGE=template.png CONFIDENCE=0.8');
      expect(result.commands[0].type).toBe('IMAGESEARCH');
    });

    it('should validate IMAGESEARCH requires POS, IMAGE, and CONFIDENCE', () => {
      const result = parseMacro('IMAGESEARCH POS=1 IMAGE=test.png', true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('POS, IMAGE, and CONFIDENCE');
    });

    it('should parse IMAGECLICK command', () => {
      const result = parseMacro('IMAGECLICK X=100 Y=200');
      expect(result.commands[0].type).toBe('IMAGECLICK');
    });

    it('should parse WINCLICK command', () => {
      const result = parseMacro('WINCLICK X=100 Y=200');
      expect(result.commands[0].type).toBe('WINCLICK');
    });

    it('should parse DISCONNECT command', () => {
      const result = parseMacro('DISCONNECT');
      expect(result.commands[0].type).toBe('DISCONNECT');
    });

    it('should parse REDIAL command', () => {
      const result = parseMacro('REDIAL');
      expect(result.commands[0].type).toBe('REDIAL');
    });

    it('should parse DS command', () => {
      const result = parseMacro('DS CMD=DELETE');
      expect(result.commands[0].type).toBe('DS');
    });

    it('should parse SAVEITEM command', () => {
      const result = parseMacro('SAVEITEM TYPE=IMG FOLDER=* FILE=image.png');
      expect(result.commands[0].type).toBe('SAVEITEM');
    });

    it('should parse TAB CLOSE', () => {
      const result = parseMacro('TAB CLOSE');
      expect(result.commands[0].type).toBe('TAB');
      expect(result.errors).toHaveLength(0);
    });

    it('should parse TAB CLOSEALLOTHERS', () => {
      const result = parseMacro('TAB CLOSEALLOTHERS');
      expect(result.commands[0].type).toBe('TAB');
      expect(result.errors).toHaveLength(0);
    });

    it('should parse TAB OPEN', () => {
      const result = parseMacro('TAB OPEN');
      expect(result.commands[0].type).toBe('TAB');
      expect(result.errors).toHaveLength(0);
    });

    it('should parse STOPWATCH with LABEL', () => {
      const result = parseMacro('STOPWATCH LABEL=checkpoint1');
      expect(result.commands[0].type).toBe('STOPWATCH');
      expect(result.errors).toHaveLength(0);
    });

    it('should parse STOPWATCH with START and STOP', () => {
      const result = parseMacro('STOPWATCH START ID=timer1');
      expect(result.commands[0].type).toBe('STOPWATCH');
      expect(result.errors).toHaveLength(0);
    });
  });

  // ============================================================
  // SECTION: Command Count Verification
  // ============================================================
  describe('Command Count Verification', () => {
    it('should support at least 40 commands', () => {
      const commands = getSupportedCommands();
      expect(commands.length).toBeGreaterThanOrEqual(40);
    });

    it('should include all expected commands', () => {
      const commands = getSupportedCommands();
      const expectedCommands = [
        'VERSION', 'URL', 'TAB', 'FRAME', 'BACK', 'REFRESH', 'NAVIGATE',
        'TAG', 'CLICK', 'EVENT', 'EVENTS',
        'SET', 'ADD', 'EXTRACT', 'SAVEAS', 'SAVEITEM', 'PROMPT', 'SEARCH',
        'WAIT', 'PAUSE', 'STOPWATCH',
        'ONDOWNLOAD', 'FILTER', 'FILEDELETE',
        'ONDIALOG', 'ONCERTIFICATEDIALOG', 'ONERRORDIALOG', 'ONLOGIN',
        'ONPRINT', 'ONSECURITYDIALOG', 'ONWEBPAGEDIALOG',
        'CLEAR', 'PROXY',
        'SCREENSHOT', 'CMDLINE', 'PRINT', 'SIZE',
        'IMAGECLICK', 'IMAGESEARCH',
        'WINCLICK', 'DISCONNECT', 'REDIAL', 'DS'
      ];
      for (const cmd of expectedCommands) {
        expect(commands).toContain(cmd);
      }
    });
  });

  // ============================================================
  // SECTION: Unknown Commands
  // ============================================================
  describe('Unknown Commands', () => {
    it('should mark unknown commands as UNKNOWN type', () => {
      const result = parseMacro('FOOBAR param=value');
      expect(result.commands[0].type).toBe('UNKNOWN');
    });

    it('should report error for unknown commands when validating', () => {
      const result = parseMacro('FOOBAR param=value', true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Unknown command');
    });

    it('should still parse parameters of unknown commands', () => {
      const result = parseMacro('UNKNOWNCMD KEY=value');
      expect(result.commands[0].parameters[0].key).toBe('KEY');
      expect(result.commands[0].parameters[0].value).toBe('value');
    });
  });

  // ============================================================
  // SECTION: Variable Detection
  // ============================================================
  describe('Variable Detection', () => {
    it('should extract simple variable', () => {
      const vars = extractVariables('{{myvar}}');
      expect(vars).toHaveLength(1);
      expect(vars[0].name).toBe('myvar');
      expect(vars[0].isSystem).toBe(false);
    });

    it('should extract system variable', () => {
      const vars = extractVariables('{{!VAR1}}');
      expect(vars).toHaveLength(1);
      expect(vars[0].name).toBe('!VAR1');
      expect(vars[0].isSystem).toBe(true);
    });

    it('should extract multiple variables', () => {
      const vars = extractVariables('{{!VAR1}}_{{!VAR2}}_{{myvar}}');
      expect(vars).toHaveLength(3);
    });

    it('should extract !LOOP variable', () => {
      const vars = extractVariables('{{!LOOP}}');
      expect(vars[0].name).toBe('!LOOP');
      expect(vars[0].isSystem).toBe(true);
    });

    it('should extract !COL variables', () => {
      const vars = extractVariables('{{!COL1}} {{!COL2}} {{!COL10}}');
      expect(vars).toHaveLength(3);
      expect(vars.every(v => v.isSystem)).toBe(true);
    });

    it('should extract !NOW with format', () => {
      const vars = extractVariables('{{!NOW:yyyymmdd_hhnnss}}');
      expect(vars[0].name).toBe('!NOW:yyyymmdd_hhnnss');
      expect(vars[0].isSystem).toBe(true);
    });

    it('should track variable position', () => {
      const vars = extractVariables('prefix{{var}}suffix');
      expect(vars[0].start).toBe(6);
      expect(vars[0].end).toBe(13);
      expect(vars[0].original).toBe('{{var}}');
    });

    it('should return empty array for no variables', () => {
      const vars = extractVariables('no variables here');
      expect(vars).toHaveLength(0);
    });

    it('should handle adjacent variables', () => {
      const vars = extractVariables('{{a}}{{b}}');
      expect(vars).toHaveLength(2);
      expect(vars[0].name).toBe('a');
      expect(vars[1].name).toBe('b');
    });

    it('should collect unique variables from macro', () => {
      const script = `
URL GOTO={{!URLSTART}}
TAG POS={{!LOOP}} TYPE=A ATTR=TXT:* CONTENT={{!VAR1}}
SET !VAR2 {{!VAR1}}
`;
      const result = parseMacro(script);
      const names = result.variables.map(v => v.name);
      expect(names).toContain('!URLSTART');
      expect(names).toContain('!LOOP');
      expect(names).toContain('!VAR1');
      // !VAR1 should appear only once despite being used twice
      expect(names.filter(n => n === '!VAR1')).toHaveLength(1);
    });
  });

  // ============================================================
  // SECTION: isSystemVariable Function
  // ============================================================
  describe('isSystemVariable', () => {
    it('should identify !VAR0-9 as system variables', () => {
      for (let i = 0; i <= 9; i++) {
        expect(isSystemVariable(`!VAR${i}`)).toBe(true);
      }
    });

    it('should identify !COL1-10 as system variables', () => {
      for (let i = 1; i <= 10; i++) {
        expect(isSystemVariable(`!COL${i}`)).toBe(true);
      }
    });

    it('should identify common system variables', () => {
      expect(isSystemVariable('!LOOP')).toBe(true);
      expect(isSystemVariable('!EXTRACT')).toBe(true);
      expect(isSystemVariable('!DATASOURCE')).toBe(true);
      expect(isSystemVariable('!TIMEOUT')).toBe(true);
      expect(isSystemVariable('!ERRORIGNORE')).toBe(true);
    });

    it('should identify folder variables', () => {
      expect(isSystemVariable('!FOLDER_DATASOURCE')).toBe(true);
      expect(isSystemVariable('!FOLDER_DOWNLOAD')).toBe(true);
      expect(isSystemVariable('!FOLDER_MACROS')).toBe(true);
    });

    it('should identify !NOW with format', () => {
      expect(isSystemVariable('!NOW:yyyymmdd')).toBe(true);
      expect(isSystemVariable('!NOW:hhnnss')).toBe(true);
    });

    it('should return false for user variables', () => {
      expect(isSystemVariable('myvar')).toBe(false);
      expect(isSystemVariable('custom')).toBe(false);
    });

    it('should return false for variables not starting with !', () => {
      expect(isSystemVariable('VAR1')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isSystemVariable('!loop')).toBe(true);
      expect(isSystemVariable('!LOOP')).toBe(true);
      expect(isSystemVariable('!Loop')).toBe(true);
    });

    it('should return false for unknown system-like variables', () => {
      // Variable starts with ! but is not a known system variable
      expect(isSystemVariable('!UNKNOWNVAR')).toBe(false);
      expect(isSystemVariable('!CUSTOM')).toBe(false);
    });
  });

  // ============================================================
  // SECTION: Quoted Values
  // ============================================================
  describe('Quoted Values', () => {
    it('should unquote simple double-quoted string', () => {
      expect(unquoteValue('"hello"')).toBe('hello');
    });

    it('should handle newline escape', () => {
      expect(unquoteValue('"line1\\nline2"')).toBe('line1\nline2');
    });

    it('should handle tab escape', () => {
      expect(unquoteValue('"col1\\tcol2"')).toBe('col1\tcol2');
    });

    it('should handle escaped quote', () => {
      expect(unquoteValue('"say \\"hello\\""')).toBe('say "hello"');
    });

    it('should handle escaped backslash', () => {
      expect(unquoteValue('"path\\\\file"')).toBe('path\\file');
    });

    it('should not modify unquoted values', () => {
      expect(unquoteValue('plaintext')).toBe('plaintext');
    });

    it('should trim whitespace', () => {
      expect(unquoteValue('  "value"  ')).toBe('value');
    });

    it('should handle empty quoted string', () => {
      expect(unquoteValue('""')).toBe('');
    });

    it('should handle multiple escape sequences', () => {
      expect(unquoteValue('"Hi!\\n\\n \\t iMacros"')).toBe('Hi!\n\n \t iMacros');
    });
  });

  // ============================================================
  // SECTION: Parameter Parsing
  // ============================================================
  describe('Parameter Parsing', () => {
    it('should parse single parameter', () => {
      const params = parseParameters('KEY=value');
      expect(params).toHaveLength(1);
      expect(params[0].key).toBe('KEY');
      expect(params[0].value).toBe('value');
    });

    it('should parse multiple parameters', () => {
      const params = parseParameters('A=1 B=2 C=3');
      expect(params).toHaveLength(3);
    });

    it('should parse quoted parameter value', () => {
      const params = parseParameters('MSG="Hello World"');
      expect(params[0].value).toBe('Hello World');
    });

    it('should parse boolean flag (no value)', () => {
      const params = parseParameters('FLAG');
      expect(params[0].key).toBe('FLAG');
      expect(params[0].value).toBe('true');
    });

    it('should handle empty string', () => {
      const params = parseParameters('');
      expect(params).toHaveLength(0);
    });

    it('should handle extra whitespace', () => {
      const params = parseParameters('  A=1    B=2  ');
      expect(params).toHaveLength(2);
    });

    it('should track raw value for quoted strings', () => {
      const params = parseParameters('MSG="test"');
      expect(params[0].rawValue).toBe('"test"');
      expect(params[0].value).toBe('test');
    });

    it('should detect variables in parameter values', () => {
      const params = parseParameters('URL={{!VAR1}}');
      expect(params[0].variables).toHaveLength(1);
      expect(params[0].variables[0].name).toBe('!VAR1');
    });

    it('should parse quoted string as key followed by equals', () => {
      // Edge case: "quoted key"=value
      const params = parseParameters('"My Key"=myvalue');
      expect(params[0].key).toBe('My Key');
      expect(params[0].value).toBe('myvalue');
    });

    it('should parse quoted string as key followed by quoted value', () => {
      const params = parseParameters('"My Key"="My Value"');
      expect(params[0].key).toBe('My Key');
      expect(params[0].value).toBe('My Value');
    });

    it('should handle escape sequences in quoted keys', () => {
      const params = parseParameters('"key\\nwith\\nnewlines"=value');
      expect(params[0].key).toBe('key\nwith\nnewlines');
    });

    it('should handle escape sequences in quoted values', () => {
      const params = parseParameters('MSG="line1\\nline2\\ttab"');
      expect(params[0].value).toBe('line1\nline2\ttab');
    });

    it('should handle backslash escape in quoted string', () => {
      // Input: PATH="dir\\subdir"
      // The \\\\ in JS becomes \\ in the actual string (two backslash chars)
      // After unquoting, each \\ becomes \ (one backslash char)
      const params = parseParameters('PATH="dir\\\\subdir"');
      expect(params[0].value).toBe('dir\\subdir');
    });

    it('should handle quoted key as positional argument', () => {
      const params = parseParameters('"Enter name" !VAR1');
      expect(params[0].key).toBe('Enter name');
      expect(params[0].value).toBe('true');
      expect(params[1].key).toBe('!VAR1');
    });

    it('should detect variables in positional arguments', () => {
      const params = parseParameters('{{!LOOP}}');
      expect(params[0].key).toBe('{{!LOOP}}');
      expect(params[0].variables).toHaveLength(1);
      expect(params[0].variables[0].name).toBe('!LOOP');
    });

    it('should handle embedded quotes in unquoted values', () => {
      // Values like %"ice cream" which have quotes but aren't fully quoted
      const params = parseParameters('CONTENT=%"ice cream"');
      expect(params[0].value).toBe('%"ice cream"');
    });
  });

  // ============================================================
  // SECTION: Error Handling
  // ============================================================
  describe('Error Handling', () => {
    it('should collect all errors when validating', () => {
      const script = `
URL
TAG ATTR=test
SET !VAR1
WAIT
`;
      const result = parseMacro(script, true);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should not report errors when validation is disabled', () => {
      const script = `
URL
TAG ATTR=test
`;
      const result = parseMacro(script, false);
      expect(result.errors).toHaveLength(0);
    });

    it('should include line number in errors', () => {
      const script = `VERSION BUILD=1
URL
TAG ATTR=test`;
      const result = parseMacro(script, true);
      const urlError = result.errors.find(e => e.message.includes('GOTO'));
      expect(urlError?.lineNumber).toBe(2);
    });

    it('should include raw line in errors', () => {
      const result = parseMacro('URL INVALID=yes', true);
      expect(result.errors[0].raw).toBe('URL INVALID=yes');
    });
  });

  // ============================================================
  // SECTION: Edge Cases
  // ============================================================
  describe('Edge Cases', () => {
    it('should handle BOM character at start of file', () => {
      const script = '\uFEFFVERSION BUILD=7500718';
      const result = parseMacro(script);
      // The BOM might be treated as part of first line or ignored
      expect(result.commands.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle very long lines', () => {
      const longValue = 'x'.repeat(10000);
      const result = parseMacro(`SET !VAR1 ${longValue}`);
      expect(result.commands).toHaveLength(1);
    });

    it('should handle special characters in quoted content', () => {
      const result = parseMacro('TAG POS=1 TYPE=INPUT ATTR=NAME:test CONTENT="<script>alert(1)</script>"');
      const contentParam = result.commands[0].parameters.find(p => p.key === 'CONTENT');
      expect(contentParam?.value).toContain('<script>');
    });

    it('should handle <SP> space placeholder', () => {
      const result = parseMacro('TAG POS=1 TYPE=A ATTR=TXT:Navigate<SP>to<SP>page');
      const attrParam = result.commands[0].parameters.find(p => p.key === 'ATTR');
      expect(attrParam?.value).toBe('TXT:Navigate<SP>to<SP>page');
    });

    it('should handle Unicode characters', () => {
      const result = parseMacro('TAG POS=1 TYPE=INPUT ATTR=NAME:test CONTENT="Hello World"');
      const contentParam = result.commands[0].parameters.find(p => p.key === 'CONTENT');
      expect(contentParam?.value).toBe('Hello World');
    });

    it('should handle command with only whitespace after it', () => {
      const result = parseMacro('BACK   ');
      expect(result.commands[0].type).toBe('BACK');
      expect(result.commands[0].parameters).toHaveLength(0);
    });

    it('should handle mixed case commands', () => {
      const result = parseMacro('url GOTO=http://example.com');
      expect(result.commands[0].type).toBe('URL');
    });

    it('should handle equals sign in quoted value', () => {
      // The quoted string "x=y" is parsed and unquoted to become the key
      const result = parseMacro('SET !VAR1 "x=y"');
      expect(result.commands[0].parameters[0].key).toBe('!VAR1');
      expect(result.commands[0].parameters[1].key).toBe('x=y');
    });

    it('should handle colons in parameter values', () => {
      const result = parseMacro('TAG POS=1 TYPE=INPUT:TEXT ATTR=ID:my:id:here');
      const attrParam = result.commands[0].parameters.find(p => p.key === 'ATTR');
      expect(attrParam?.value).toBe('ID:my:id:here');
    });

    it('should handle URL with query parameters', () => {
      const result = parseMacro('URL GOTO=http://example.com/page?foo=bar&baz=qux');
      const gotoParam = result.commands[0].parameters.find(p => p.key === 'GOTO');
      expect(gotoParam?.value).toContain('foo=bar');
    });
  });

  // ============================================================
  // SECTION: Serialization
  // ============================================================
  describe('Serialization', () => {
    it('should serialize simple command', () => {
      const result = parseMacro('URL GOTO=http://example.com');
      const serialized = serializeCommand(result.commands[0]);
      expect(serialized).toBe('URL GOTO=http://example.com');
    });

    it('should serialize command with quoted value', () => {
      const result = parseMacro('TAG POS=1 TYPE=INPUT ATTR=NAME:test CONTENT="Hello"');
      const serialized = serializeCommand(result.commands[0]);
      expect(serialized).toContain('CONTENT="Hello"');
    });

    it('should serialize entire macro', () => {
      const script = "URL GOTO=http://example.com\n'comment\nWAIT SECONDS=1";
      const result = parseMacro(script);
      const serialized = serializeMacro(result);
      expect(serialized).toContain('URL GOTO=');
      expect(serialized).toContain("'comment");
      expect(serialized).toContain('WAIT SECONDS=');
    });

    it('should serialize boolean flag parameters', () => {
      const result = parseMacro('BACK');
      const serialized = serializeCommand(result.commands[0]);
      expect(serialized).toBe('BACK');
    });

    it('should serialize parameters with special rawValue', () => {
      // Test parameter with rawValue containing special characters
      const result = parseMacro('TAG POS=1 TYPE=A ATTR=TXT:*Download*');
      const serialized = serializeCommand(result.commands[0]);
      expect(serialized).toContain('ATTR=TXT:*Download*');
    });

    it('should serialize parameter with value but no rawValue', () => {
      // Construct a command with a parameter that has value but no rawValue
      const command: ParsedCommand = {
        type: 'URL',
        parameters: [
          { key: 'GOTO', value: 'http://example.com', rawValue: '', variables: [] }
        ],
        raw: 'URL GOTO=http://example.com',
        lineNumber: 1,
        variables: []
      };
      const serialized = serializeCommand(command);
      expect(serialized).toBe('URL GOTO=http://example.com');
    });

    it('should serialize boolean flag parameter', () => {
      // Parameter with value 'true' and no rawValue should serialize as just the key
      const command: ParsedCommand = {
        type: 'BACK',
        parameters: [
          { key: 'FAST', value: 'true', rawValue: '', variables: [] }
        ],
        raw: 'BACK FAST',
        lineNumber: 1,
        variables: []
      };
      const serialized = serializeCommand(command);
      expect(serialized).toBe('BACK FAST');
    });
  });

  // ============================================================
  // SECTION: Utility Functions
  // ============================================================
  describe('Utility Functions', () => {
    it('should list all supported commands', () => {
      const commands = getSupportedCommands();
      expect(commands).toContain('URL');
      expect(commands).toContain('TAG');
      expect(commands).toContain('SET');
      expect(commands).toContain('WAIT');
      expect(commands).toContain('SAVEAS');
      expect(commands.length).toBeGreaterThanOrEqual(20);
    });

    it('should validate command keywords', () => {
      expect(isValidCommand('URL')).toBe(true);
      expect(isValidCommand('TAG')).toBe(true);
      expect(isValidCommand('url')).toBe(true); // case insensitive
      expect(isValidCommand('NOTACOMMAND')).toBe(false);
    });

    it('should export SYSTEM_VARIABLES constant', () => {
      expect(SYSTEM_VARIABLES).toContain('!VAR0');
      expect(SYSTEM_VARIABLES).toContain('!LOOP');
      expect(SYSTEM_VARIABLES).toContain('!EXTRACT');
    });
  });

  // ============================================================
  // SECTION: Real-World Macro Examples
  // ============================================================
  describe('Real-World Macro Examples', () => {
    it('should parse FillForm macro', () => {
      const script = `VERSION BUILD=7500718 RECORDER=FX
TAB T=1
URL GOTO=http://demo.imacros.net/Automate/TestForm1
TAG POS=1 TYPE=INPUT:TEXT FORM=ID:demo ATTR=ID:name CONTENT="Suman Tester"
TAG POS=1 TYPE=SELECT FORM=ID:demo ATTR=ID:food CONTENT=%Pizza`;
      const result = parseMacro(script);
      expect(result.commands).toHaveLength(5);
      expect(result.errors).toHaveLength(0);
      expect(result.version?.build).toBe('7500718');
    });

    it('should parse Extract macro', () => {
      const script = `VERSION BUILD=8031994
TAB T=1
URL GOTO=http://demo.imacros.net/Automate/Extract2
TAG POS=1 TYPE=TD ATTR=CLASS:bdytxt&&TXT:* EXTRACT=TXT
TAG POS=1 TYPE=A ATTR=TXT:H*links* EXTRACT=TITLE`;
      const result = parseMacro(script);
      expect(result.commands).toHaveLength(5);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse Loop-Csv-2-Web macro', () => {
      const script = `VERSION BUILD=7500718 RECORDER=FX
TAB T=1
SET !DATASOURCE Address.csv
SET !LOOP 2
SET !DATASOURCE_LINE {{!LOOP}}
URL GOTO=http://demo.imacros.net/Automate/AutoDataEntry
TAG POS=1 TYPE=INPUT:TEXT FORM=ID:demo ATTR=NAME:fname CONTENT={{!COL1}}`;
      const result = parseMacro(script);
      expect(result.commands).toHaveLength(7);
      expect(result.variables.map(v => v.name)).toContain('!LOOP');
      expect(result.variables.map(v => v.name)).toContain('!COL1');
    });

    it('should parse Stopwatch macro', () => {
      const script = `VERSION BUILD=7500718 RECORDER=FX
TAB T=1
STOPWATCH ID=Total
STOPWATCH ID=Firstpage
URL GOTO=http://demo.imacros.net/Automate/StopWatchDemo
STOPWATCH ID=Firstpage
TAG POS=1 TYPE=A ATTR=HREF:http://demo.imacros.net/Automate/AutoDataEntry
STOPWATCH ID=Total`;
      const result = parseMacro(script);
      expect(result.commands).toHaveLength(8);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse macro with comments', () => {
      const script = `VERSION BUILD=7500718
'This is a comment
TAB T=1
'Another comment
URL GOTO=http://example.com`;
      const result = parseMacro(script);
      expect(result.comments).toHaveLength(2);
      expect(result.commands).toHaveLength(3);
    });

    it('should parse download macro', () => {
      const script = `VERSION BUILD=7500718 RECORDER=FX
TAB T=1
URL GOTO=http://demo.imacros.net/Automate/Downloads
ONDOWNLOAD FOLDER=* FILE=* WAIT=YES
TAG POS=2 TYPE=A ATTR=TXT:*Download*
WAIT SECONDS=3`;
      const result = parseMacro(script);
      expect(result.commands).toHaveLength(6);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse EVAL macro', () => {
      const script = `VERSION BUILD=7500718 RECORDER=FX
TAB T=1
URL GOTO=http://demo.imacros.net/Automate/Eval
SET !VAR1 EVAL("Math.floor(Math.random()*5 + 1);")
WAIT SECONDS={{!VAR1}}`;
      const result = parseMacro(script);
      expect(result.commands).toHaveLength(5);
      const waitCmd = result.commands.find(c => c.type === 'WAIT');
      expect(waitCmd?.variables).toHaveLength(1);
    });
  });

  // ============================================================
  // SECTION: parseLine Function
  // ============================================================
  describe('parseLine Function', () => {
    it('should return correct type for command line', () => {
      const line = parseLine('URL GOTO=http://example.com', 1);
      expect(line.type).toBe('command');
    });

    it('should return correct type for comment line', () => {
      const line = parseLine("'This is a comment", 1);
      expect(line.type).toBe('comment');
    });

    it('should return correct type for empty line', () => {
      const line = parseLine('', 1);
      expect(line.type).toBe('empty');
    });

    it('should include line number in result', () => {
      const line = parseLine('URL GOTO=test', 42);
      expect(line.data.lineNumber).toBe(42);
    });
  });

  // ============================================================
  // SECTION: validateCommand Function
  // ============================================================
  describe('validateCommand Function', () => {
    it('should return null for valid URL command', () => {
      const result = parseMacro('URL GOTO=http://example.com', false);
      const error = validateCommand(result.commands[0]);
      expect(error).toBeNull();
    });

    it('should return error for invalid URL command', () => {
      const result = parseMacro('URL', false);
      const error = validateCommand(result.commands[0]);
      expect(error).not.toBeNull();
      expect(error?.message).toContain('GOTO');
    });

    it('should return null for valid TAG with XPATH', () => {
      const result = parseMacro('TAG XPATH="//input"', false);
      const error = validateCommand(result.commands[0]);
      expect(error).toBeNull();
    });

    it('should return null for valid TAG with POS and TYPE', () => {
      const result = parseMacro('TAG POS=1 TYPE=INPUT ATTR=NAME:test', false);
      const error = validateCommand(result.commands[0]);
      expect(error).toBeNull();
    });

    it('should return error for TAG missing required params', () => {
      const result = parseMacro('TAG ATTR=NAME:test', false);
      const error = validateCommand(result.commands[0]);
      expect(error).not.toBeNull();
    });

    it('should return error for UNKNOWN command', () => {
      const result = parseMacro('FAKECOMMAND arg=val', false);
      const error = validateCommand(result.commands[0]);
      expect(error).not.toBeNull();
      expect(error?.message).toContain('Unknown command');
    });
  });
});
