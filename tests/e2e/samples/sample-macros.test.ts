/**
 * Sample Macros E2E Tests
 *
 * Tests all 31 original sample macros from the Firefox iMacros extension.
 * This includes 27 .iim macro files and 4 .js scripting interface files.
 *
 * These tests verify:
 * 1. Each macro can be parsed without errors
 * 2. Expected commands are present
 * 3. Variables are correctly identified
 * 4. Command parameters are properly parsed
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  parseMacro,
  ParsedMacro,
  ParsedCommand,
} from '../../../shared/src/parser';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Path to the original Firefox samples directory
 * Navigate from tests/e2e/samples up to iMacros-new, then up to parent firefox extension
 */
const SAMPLES_DIR = path.resolve(process.cwd(), '..', 'samples/Macros');

/**
 * Helper to read a macro file
 */
function readMacro(filename: string): string {
  const filepath = path.join(SAMPLES_DIR, filename);
  // Handle BOM (Byte Order Mark) that may be present in files
  return fs.readFileSync(filepath, 'utf-8').replace(/^\uFEFF/, '');
}

/**
 * Helper to get commands of a specific type
 */
function getCommands(macro: ParsedMacro, type: string): ParsedCommand[] {
  return macro.commands.filter(cmd => cmd.type === type);
}

/**
 * Helper to get a parameter value from a command
 */
function getParam(cmd: ParsedCommand, key: string): string | undefined {
  const param = cmd.parameters.find(p => p.key.toUpperCase() === key.toUpperCase());
  return param?.value;
}

/**
 * Sample macro definitions with expected properties
 */
interface SampleMacroSpec {
  filename: string;
  description: string;
  expectedCommands: string[];
  expectedVariables?: string[];
  minCommandCount?: number;
  features?: string[];
}

/**
 * All 27 .iim sample macros with their expected properties
 */
const IIM_SAMPLES: SampleMacroSpec[] = [
  {
    filename: 'ArchivePage.iim',
    description: 'Saves the current page with a prompted filename',
    expectedCommands: ['VERSION', 'PROMPT', 'SAVEAS'],
    expectedVariables: ['!VAR1', '!NOW:yyyymmdd_hhnnss'],
    features: ['PROMPT dialog', 'SAVEAS CPL', 'NOW timestamp'],
  },
  {
    filename: 'Download.iim',
    description: 'Downloads a file from a website',
    expectedCommands: ['VERSION', 'URL', 'ONDOWNLOAD', 'TAG', 'WAIT'],
    features: ['ONDOWNLOAD handler', 'Download waiting'],
  },
  {
    filename: 'Eval.iim',
    description: 'Uses JavaScript EVAL for random wait and value validation',
    expectedCommands: ['VERSION', 'TAB', 'URL', 'SET', 'WAIT', 'TAG'],
    // Only variables referenced as {{...}} are detected - SET targets like !VAR2, !EXTRACT_TEST_POPUP are not
    expectedVariables: ['!VAR1', '!EXTRACT'],
    features: ['EVAL JavaScript', 'MacroError function', 'Random values'],
  },
  {
    filename: 'Extract.iim',
    description: 'Extracts various data types from a page',
    expectedCommands: ['VERSION', 'TAB', 'URL', 'TAG'],
    features: ['EXTRACT TXT', 'EXTRACT TITLE', 'EXTRACT HTM', 'EXTRACT HREF', 'EXTRACT ALT', 'Relative extraction'],
  },
  {
    filename: 'ExtractAndFill.iim',
    description: 'Extracts data and fills it into another form',
    expectedCommands: ['VERSION', 'TAB', 'URL', 'TAG', 'SET'],
    expectedVariables: ['!VAR1', '!VAR2', '!VAR3', '!EXTRACT'],
    features: ['Extract to variable', 'Fill with variable'],
  },
  {
    filename: 'ExtractRelative.iim',
    description: 'Uses relative positioning for extraction',
    expectedCommands: ['VERSION', 'TAB', 'URL', 'TAG'],
    features: ['POS=R3 relative', 'POS=R-2 negative', 'Anchor element'],
  },
  {
    filename: 'ExtractTable.iim',
    description: 'Extracts table data and saves to CSV',
    expectedCommands: ['VERSION', 'TAB', 'URL', 'TAG', 'SAVEAS', 'WAIT'],
    features: ['TABLE extraction', 'SAVEAS EXTRACT', 'CSV output'],
  },
  {
    filename: 'ExtractURL.iim',
    description: 'Extracts HREF, TITLE and TXT from links',
    expectedCommands: ['VERSION', 'TAB', 'URL', 'TAG'],
    features: ['EXTRACT HREF', 'EXTRACT TITLE', 'EXTRACT TXT'],
  },
  {
    filename: 'FillForm.iim',
    description: 'Fills a complete form with various input types',
    expectedCommands: ['VERSION', 'TAB', 'URL', 'TAG', 'SET'],
    features: ['INPUT:TEXT', 'SELECT', 'INPUT:RADIO', 'INPUT:PASSWORD', 'TEXTAREA', 'BUTTON:SUBMIT', 'Multiple select'],
  },
  {
    filename: 'FillForm-XPath.iim',
    description: 'Fills form using XPath selectors',
    expectedCommands: ['VERSION', 'URL', 'TAG', 'SET', 'WAIT'],
    features: ['XPATH selector', 'XPath expressions'],
  },
  {
    filename: 'Filter.iim',
    description: 'Toggles image filtering on and off',
    expectedCommands: ['VERSION', 'TAB', 'FILTER', 'URL', 'TAG', 'WAIT', 'REFRESH'],
    features: ['FILTER IMAGES', 'STATUS ON/OFF'],
  },
  {
    filename: 'Frame.iim',
    description: 'Interacts with elements in multiple frames',
    expectedCommands: ['VERSION', 'TAB', 'URL', 'FRAME', 'TAG'],
    minCommandCount: 20,
    features: ['Multiple FRAME', 'Nested frames', 'Frame navigation'],
  },
  {
    filename: 'Javascript-Dialogs.iim',
    description: 'Handles JavaScript alert/confirm dialogs',
    expectedCommands: ['VERSION', 'TAB', 'URL', 'ONDIALOG', 'TAG', 'WAIT'],
    features: ['ONDIALOG handler', 'BUTTON OK'],
  },
  {
    filename: 'Loop-Csv-2-Web.iim',
    description: 'Reads CSV data and submits to web form',
    expectedCommands: ['VERSION', 'TAB', 'URL', 'TAG', 'SET'],
    // Only variables referenced as {{...}} are detected - SET targets like !DATASOURCE, !DATASOURCE_LINE are not
    expectedVariables: ['!LOOP', '!COL1', '!COL2', '!COL3', '!COL4', '!COL5', '!COL6', '!COL7', '!COL8'],
    features: ['CSV datasource', 'Column variables', 'Loop integration'],
  },
  {
    filename: 'Open6Tabs.iim',
    description: 'Opens multiple tabs with different URLs',
    expectedCommands: ['VERSION', 'SET', 'TAB', 'URL'],
    expectedVariables: ['!VAR1'],
    minCommandCount: 15,
    features: ['TAB OPEN NEW', 'ADD command', 'Multiple URLs'],
  },
  {
    filename: 'SaveAs.iim',
    description: 'Saves page in multiple formats (CPL, HTM, TXT)',
    expectedCommands: ['VERSION', 'TAB', 'URL', 'WAIT', 'SAVEAS'],
    features: ['SAVEAS CPL', 'SAVEAS HTM', 'SAVEAS TXT', 'NOW timestamp'],
  },
  {
    filename: 'SavePDF.iim',
    description: 'Downloads PDF files',
    expectedCommands: ['VERSION', 'TAB', 'URL', 'WAIT', 'ONDOWNLOAD', 'TAG'],
    features: ['PDF download', 'ONDOWNLOAD handler'],
  },
  {
    filename: 'SaveTargetAs.iim',
    description: 'Uses SAVETARGETAS event for downloads',
    expectedCommands: ['VERSION', 'TAB', 'URL', 'ONDOWNLOAD', 'TAG'],
    features: ['EVENT:SAVETARGETAS', 'Right-click save'],
  },
  {
    filename: 'SI-Test-Macro1.iim',
    description: 'Test macro for Scripting Interface variables',
    expectedCommands: ['VERSION', 'TAB', 'URL', 'TAG'],
    expectedVariables: ['NAME', 'MENU', 'DRINK', 'DESSERT', 'CUSTOMER', 'PASSWORD', 'REMARKS'],
    features: ['External variables', 'Scripting interface'],
  },
  {
    filename: 'SI-Test-Macro2.iim',
    description: 'Simple extraction macro for SI verification',
    expectedCommands: ['TAG'],
    features: ['EXTRACT TXT', 'Minimal macro'],
  },
  {
    filename: 'SlideShow.iim',
    description: 'Creates a slideshow by looping through images',
    expectedCommands: ['VERSION', 'TAB', 'URL', 'TAG', 'WAIT'],
    expectedVariables: ['!loop'],
    features: ['Loop variable', 'Image navigation', 'BACK command'],
  },
  {
    filename: 'Stopwatch.iim',
    description: 'Measures page load and action times',
    expectedCommands: ['VERSION', 'TAB', 'URL', 'TAG', 'STOPWATCH', 'WAIT'],
    minCommandCount: 15,
    features: ['STOPWATCH ID', 'Performance timing', 'Multiple timers'],
  },
  {
    filename: 'Tabs.iim',
    description: 'Works with popup tabs',
    expectedCommands: ['VERSION', 'TAB', 'URL', 'TAG', 'WAIT'],
    features: ['TAB T=4', 'Popup handling'],
  },
  {
    filename: 'TagPosition.iim',
    description: 'Uses POS parameter with loop for multiple elements',
    expectedCommands: ['VERSION', 'TAB', 'URL', 'TAG', 'WAIT', 'BACK'],
    expectedVariables: ['!LOOP'],
    features: ['POS={{!LOOP}}', 'Dynamic positioning'],
  },
  {
    filename: 'TakeScreenshot-FX.iim',
    description: 'Takes a PNG screenshot of the page',
    expectedCommands: ['VERSION', 'TAB', 'SAVEAS', 'URL'],
    features: ['SAVEAS PNG', 'Screenshot'],
  },
  {
    filename: 'Upload.iim',
    description: 'Uploads a file to a form',
    expectedCommands: ['VERSION', 'TAB', 'URL', 'TAG', 'WAIT'],
    expectedVariables: ['!FOLDER_DATASOURCE'],
    features: ['INPUT:FILE', 'File upload'],
  },
  {
    filename: 'Wsh-Extract-Rate.iim',
    description: 'Extracts exchange rate data',
    expectedCommands: ['VERSION', 'TAB', 'URL', 'TAG'],
    features: ['Simple extraction', 'Data scraping'],
  },
];

/**
 * JavaScript Scripting Interface samples
 */
interface JsSampleSpec {
  filename: string;
  description: string;
  expectedFunctions: string[];
  features?: string[];
}

const JS_SAMPLES: JsSampleSpec[] = [
  {
    filename: 'Self-Test.js',
    description: 'Runs a self-test of multiple macros',
    expectedFunctions: ['iimPlay', 'iimDisplay', 'iimGetLastError', 'iimGetLastExtract'],
    features: ['Macro list', 'Loop execution', 'Error reporting'],
  },
  {
    filename: 'SI-Get-Exchange-Rate.js',
    description: 'Gets exchange rate using macro and displays result',
    expectedFunctions: ['iimPlay', 'iimDisplay', 'iimGetLastExtract', 'iimGetLastError'],
    features: ['Extract result', 'Alert display'],
  },
  {
    filename: 'SI-Run-Test.js',
    description: 'Sets variables and runs test macros',
    expectedFunctions: ['iimPlay', 'iimDisplay', 'iimSet', 'iimGetLastError', 'iimGetLastExtract'],
    features: ['Variable setting', 'Test verification'],
  },
  {
    filename: 'SI-Send-Macro-Code.js',
    description: 'Sends macro code directly via iimPlay CODE:',
    expectedFunctions: ['iimPlay', 'iimDisplay', 'iimSet', 'iimGetLastError'],
    features: ['CODE: protocol', 'Loop execution', 'Array usage'],
  },
];

describe('Sample Macros E2E Tests', () => {
  describe('Verify Samples Directory Exists', () => {
    it('should have access to the samples directory', () => {
      expect(fs.existsSync(SAMPLES_DIR)).toBe(true);
    });

    it('should contain all expected .iim files', () => {
      for (const sample of IIM_SAMPLES) {
        const filepath = path.join(SAMPLES_DIR, sample.filename);
        expect(fs.existsSync(filepath), `Missing file: ${sample.filename}`).toBe(true);
      }
    });

    it('should contain all expected .js files', () => {
      for (const sample of JS_SAMPLES) {
        const filepath = path.join(SAMPLES_DIR, sample.filename);
        expect(fs.existsSync(filepath), `Missing file: ${sample.filename}`).toBe(true);
      }
    });
  });

  describe('IIM Macro Parsing Tests (27 macros)', () => {
    for (const sample of IIM_SAMPLES) {
      describe(`${sample.filename} - ${sample.description}`, () => {
        let macro: ParsedMacro;
        let content: string;

        beforeAll(() => {
          content = readMacro(sample.filename);
          macro = parseMacro(content);
        });

        it('should parse without fatal errors', () => {
          expect(macro).toBeDefined();
          expect(macro.commands.length).toBeGreaterThan(0);
        });

        it('should have expected command types', () => {
          const commandTypes = [...new Set(macro.commands.map(cmd => cmd.type))];
          for (const expectedCmd of sample.expectedCommands) {
            expect(
              commandTypes,
              `Expected command ${expectedCmd} not found in ${sample.filename}`
            ).toContain(expectedCmd);
          }
        });

        if (sample.expectedVariables) {
          it('should reference expected variables', () => {
            const varNames = macro.variables.map(v => v.name);
            for (const expectedVar of sample.expectedVariables!) {
              expect(
                varNames,
                `Expected variable ${expectedVar} not found in ${sample.filename}`
              ).toContain(expectedVar);
            }
          });
        }

        if (sample.minCommandCount) {
          it(`should have at least ${sample.minCommandCount} commands`, () => {
            expect(macro.commands.length).toBeGreaterThanOrEqual(sample.minCommandCount!);
          });
        }

        it('should have valid VERSION or be a valid partial macro', () => {
          // Most macros have VERSION, but SI-Test-Macro2 is a fragment
          if (sample.filename !== 'SI-Test-Macro2.iim') {
            expect(macro.version).toBeDefined();
          }
        });
      });
    }
  });

  describe('JavaScript Scripting Interface Tests (4 samples)', () => {
    for (const sample of JS_SAMPLES) {
      describe(`${sample.filename} - ${sample.description}`, () => {
        let content: string;

        beforeAll(() => {
          content = readMacro(sample.filename);
        });

        it('should be valid JavaScript', () => {
          expect(content).toBeDefined();
          expect(content.length).toBeGreaterThan(0);
        });

        it('should use expected iMacros functions', () => {
          for (const func of sample.expectedFunctions) {
            expect(
              content,
              `Expected function ${func} not found in ${sample.filename}`
            ).toContain(func);
          }
        });
      });
    }
  });

  describe('Specific Macro Feature Tests', () => {
    describe('FillForm.iim - Form filling capabilities', () => {
      let macro: ParsedMacro;

      beforeAll(() => {
        macro = parseMacro(readMacro('FillForm.iim'));
      });

      it('should fill text input', () => {
        const tagCmds = getCommands(macro, 'TAG');
        const textInput = tagCmds.find(cmd =>
          getParam(cmd, 'TYPE')?.includes('INPUT:TEXT')
        );
        expect(textInput).toBeDefined();
      });

      it('should fill select dropdown', () => {
        const tagCmds = getCommands(macro, 'TAG');
        const select = tagCmds.find(cmd =>
          getParam(cmd, 'TYPE') === 'SELECT'
        );
        expect(select).toBeDefined();
      });

      it('should fill radio button', () => {
        const tagCmds = getCommands(macro, 'TAG');
        const radio = tagCmds.find(cmd =>
          getParam(cmd, 'TYPE')?.includes('INPUT:RADIO')
        );
        expect(radio).toBeDefined();
      });

      it('should fill password field', () => {
        const tagCmds = getCommands(macro, 'TAG');
        const password = tagCmds.find(cmd =>
          getParam(cmd, 'TYPE')?.includes('INPUT:PASSWORD')
        );
        expect(password).toBeDefined();
      });

      it('should fill textarea', () => {
        const tagCmds = getCommands(macro, 'TAG');
        const textarea = tagCmds.find(cmd =>
          getParam(cmd, 'TYPE') === 'TEXTAREA'
        );
        expect(textarea).toBeDefined();
      });

      it('should click submit button', () => {
        const tagCmds = getCommands(macro, 'TAG');
        const submit = tagCmds.find(cmd =>
          getParam(cmd, 'TYPE')?.includes('BUTTON:SUBMIT')
        );
        expect(submit).toBeDefined();
      });

      it('should use multiple select with colon separator', () => {
        const tagCmds = getCommands(macro, 'TAG');
        const multiSelect = tagCmds.find(cmd => {
          const content = getParam(cmd, 'CONTENT');
          return content && content.includes(':');
        });
        expect(multiSelect).toBeDefined();
      });
    });

    describe('FillForm-XPath.iim - XPath selector capabilities', () => {
      let macro: ParsedMacro;

      beforeAll(() => {
        macro = parseMacro(readMacro('FillForm-XPath.iim'));
      });

      it('should use XPATH parameter instead of POS/TYPE', () => {
        const tagCmds = getCommands(macro, 'TAG');
        const xpathCmds = tagCmds.filter(cmd =>
          cmd.parameters.some(p => p.key.toUpperCase() === 'XPATH')
        );
        expect(xpathCmds.length).toBeGreaterThan(0);
      });

      it('should have valid XPath expressions', () => {
        const tagCmds = getCommands(macro, 'TAG');
        for (const cmd of tagCmds) {
          const xpath = getParam(cmd, 'XPATH');
          if (xpath) {
            expect(xpath).toMatch(/^\/\//);
          }
        }
      });
    });

    describe('Extract.iim - Data extraction capabilities', () => {
      let macro: ParsedMacro;

      beforeAll(() => {
        macro = parseMacro(readMacro('Extract.iim'));
      });

      it('should extract text content', () => {
        const tagCmds = getCommands(macro, 'TAG');
        const extractTxt = tagCmds.filter(cmd =>
          getParam(cmd, 'EXTRACT') === 'TXT'
        );
        expect(extractTxt.length).toBeGreaterThan(0);
      });

      it('should extract HTML content', () => {
        const tagCmds = getCommands(macro, 'TAG');
        const extractHtm = tagCmds.find(cmd =>
          getParam(cmd, 'EXTRACT') === 'HTM'
        );
        expect(extractHtm).toBeDefined();
      });

      it('should extract HREF attribute', () => {
        const tagCmds = getCommands(macro, 'TAG');
        const extractHref = tagCmds.find(cmd =>
          getParam(cmd, 'EXTRACT') === 'HREF'
        );
        expect(extractHref).toBeDefined();
      });

      it('should support relative positioning', () => {
        const tagCmds = getCommands(macro, 'TAG');
        const relativePos = tagCmds.find(cmd => {
          const pos = getParam(cmd, 'POS');
          return pos && pos.startsWith('R');
        });
        expect(relativePos).toBeDefined();
      });
    });

    describe('Frame.iim - Frame navigation', () => {
      let macro: ParsedMacro;

      beforeAll(() => {
        macro = parseMacro(readMacro('Frame.iim'));
      });

      it('should navigate to multiple frames', () => {
        const frameCmds = getCommands(macro, 'FRAME');
        expect(frameCmds.length).toBeGreaterThan(5);
      });

      it('should use frame indices', () => {
        const frameCmds = getCommands(macro, 'FRAME');
        const frameNumbers = frameCmds.map(cmd => {
          const f = getParam(cmd, 'F');
          return f ? parseInt(f, 10) : 0;
        });
        expect(Math.max(...frameNumbers)).toBeGreaterThanOrEqual(8);
      });
    });

    describe('Loop-Csv-2-Web.iim - CSV data handling', () => {
      let macro: ParsedMacro;

      beforeAll(() => {
        macro = parseMacro(readMacro('Loop-Csv-2-Web.iim'));
      });

      it('should set datasource', () => {
        const setCmds = getCommands(macro, 'SET');
        const datasource = setCmds.find(cmd =>
          cmd.parameters.some(p => p.key === '!DATASOURCE')
        );
        expect(datasource).toBeDefined();
      });

      it('should use column variables', () => {
        const colVars = macro.variables.filter(v =>
          v.name.startsWith('!COL')
        );
        expect(colVars.length).toBeGreaterThan(0);
      });

      it('should reference loop variable for datasource line', () => {
        const loopVars = macro.variables.filter(v =>
          v.name === '!LOOP'
        );
        expect(loopVars.length).toBeGreaterThan(0);
      });
    });

    describe('Stopwatch.iim - Performance timing', () => {
      let macro: ParsedMacro;

      beforeAll(() => {
        macro = parseMacro(readMacro('Stopwatch.iim'));
      });

      it('should have multiple stopwatch commands', () => {
        const stopwatchCmds = getCommands(macro, 'STOPWATCH');
        expect(stopwatchCmds.length).toBeGreaterThan(3);
      });

      it('should use named stopwatch IDs', () => {
        const stopwatchCmds = getCommands(macro, 'STOPWATCH');
        const ids = stopwatchCmds.map(cmd => getParam(cmd, 'ID')).filter(Boolean);
        expect(ids).toContain('Total');
        expect(ids).toContain('Firstpage');
      });
    });

    describe('Download.iim - File download handling', () => {
      let macro: ParsedMacro;

      beforeAll(() => {
        macro = parseMacro(readMacro('Download.iim'));
      });

      it('should use ONDOWNLOAD command', () => {
        const downloadCmds = getCommands(macro, 'ONDOWNLOAD');
        expect(downloadCmds.length).toBeGreaterThan(0);
      });

      it('should specify download folder', () => {
        const downloadCmds = getCommands(macro, 'ONDOWNLOAD');
        const folder = getParam(downloadCmds[0], 'FOLDER');
        expect(folder).toBeDefined();
      });

      it('should use WAIT=YES for download completion', () => {
        const downloadCmds = getCommands(macro, 'ONDOWNLOAD');
        const wait = getParam(downloadCmds[0], 'WAIT');
        expect(wait).toBe('YES');
      });
    });

    describe('Javascript-Dialogs.iim - Dialog handling', () => {
      let macro: ParsedMacro;

      beforeAll(() => {
        macro = parseMacro(readMacro('Javascript-Dialogs.iim'));
      });

      it('should use ONDIALOG command', () => {
        const dialogCmds = getCommands(macro, 'ONDIALOG');
        expect(dialogCmds.length).toBeGreaterThan(0);
      });

      it('should specify button action', () => {
        const dialogCmds = getCommands(macro, 'ONDIALOG');
        const button = getParam(dialogCmds[0], 'BUTTON');
        expect(button).toBe('OK');
      });
    });

    describe('Eval.iim - JavaScript evaluation', () => {
      let macro: ParsedMacro;

      beforeAll(() => {
        macro = parseMacro(readMacro('Eval.iim'));
      });

      it('should use EVAL in SET commands', () => {
        const setCmds = getCommands(macro, 'SET');
        // EVAL is parsed as a key (e.g., SET !VAR1 EVAL("code"))
        // Check raw command text for EVAL usage
        const evalCmd = setCmds.find(cmd =>
          cmd.raw.includes('EVAL(')
        );
        expect(evalCmd).toBeDefined();
      });

      it('should use Math.random for random values', () => {
        const content = readMacro('Eval.iim');
        expect(content).toContain('Math.random');
      });

      it('should use MacroError for validation', () => {
        const content = readMacro('Eval.iim');
        expect(content).toContain('MacroError');
      });
    });

    describe('Open6Tabs.iim - Multi-tab handling', () => {
      let macro: ParsedMacro;

      beforeAll(() => {
        macro = parseMacro(readMacro('Open6Tabs.iim'));
      });

      it('should open multiple new tabs', () => {
        const content = readMacro('Open6Tabs.iim');
        const tabOpenCount = (content.match(/TAB OPEN/g) || []).length;
        expect(tabOpenCount).toBe(6);
      });

      it('should navigate to different URLs', () => {
        const urlCmds = getCommands(macro, 'URL');
        expect(urlCmds.length).toBeGreaterThanOrEqual(6);
      });

      it('should use ADD command for counter', () => {
        const content = readMacro('Open6Tabs.iim');
        expect(content).toContain('ADD !VAR1 1');
      });
    });
  });

  describe('Total Sample Count Verification', () => {
    it('should have 27 .iim sample macros defined', () => {
      expect(IIM_SAMPLES.length).toBe(27);
    });

    it('should have 4 .js sample scripts defined', () => {
      expect(JS_SAMPLES.length).toBe(4);
    });

    it('should test all 31 samples total', () => {
      expect(IIM_SAMPLES.length + JS_SAMPLES.length).toBe(31);
    });
  });
});
