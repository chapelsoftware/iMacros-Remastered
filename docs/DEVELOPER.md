# iMacros for Firefox - Developer Documentation

This document provides technical information for developers who want to understand, modify, or contribute to iMacros for Firefox.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Technology Stack](#technology-stack)
4. [Building the Project](#building-the-project)
5. [Development Workflow](#development-workflow)
6. [Core Components](#core-components)
7. [Command System](#command-system)
8. [Messaging Architecture](#messaging-architecture)
9. [Testing](#testing)
10. [Contributing](#contributing)

---

## Architecture Overview

iMacros for Firefox is built as a modern WebExtension with three main components:

```
+-------------------+     +-------------------+     +-------------------+
|   Firefox         |     |   Extension       |     |   Native Host     |
|   Browser         |<--->|   (WebExtension)  |<--->|   (Node.js)       |
|                   |     |                   |     |                   |
| - Tabs/Windows    |     | - Background SW   |     | - File System     |
| - DOM             |     | - Content Scripts |     | - Command Exec    |
| - Storage         |     | - Side Panel      |     | - Settings        |
+-------------------+     +-------------------+     +-------------------+
```

### Component Responsibilities

**Extension (WebExtension):**
- User interface (side panel, editor, options)
- Macro recording (content scripts)
- DOM interaction (TAG, CLICK, EXTRACT)
- Tab/frame management
- Dialog handling
- Web request interception (FILTER, ONLOGIN)

**Native Host (Node.js):**
- File system access (read/write macros)
- Macro execution engine
- Command line execution (CMDLINE)
- Screenshot saving
- Download file saving
- Settings persistence

**Shared Library:**
- Macro parser
- Variable system
- Command handlers
- State management
- Expression evaluator

---

## Project Structure

```
iMacros-new/
├── extension/               # Browser extension
│   ├── src/
│   │   ├── background.ts    # Service worker
│   │   ├── content.ts       # Content script entry
│   │   ├── sidepanel.ts     # Side panel entry
│   │   ├── background/
│   │   │   └── web-request-handlers.ts
│   │   ├── content/
│   │   │   ├── dom-executor.ts      # DOM operations
│   │   │   ├── element-finder.ts    # Element selection
│   │   │   ├── macro-recorder.ts    # Recording logic
│   │   │   ├── dialog-interceptor.ts
│   │   │   ├── data-extractor.ts
│   │   │   ├── frame-handler.ts
│   │   │   └── event-dispatcher.ts
│   │   ├── panel/
│   │   │   ├── panel.ts      # Side panel logic
│   │   │   ├── file-tree.ts  # File browser
│   │   │   └── status-sync.ts
│   │   ├── editor/
│   │   │   ├── editor.ts     # Code editor
│   │   │   └── iim-mode.ts   # iMacros syntax
│   │   └── options/
│   │       └── options.ts    # Settings page
│   ├── manifest.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── native-host/             # Native messaging host
│   ├── src/
│   │   ├── index.ts         # Entry point
│   │   ├── host.ts          # Native messaging
│   │   ├── file-service.ts  # File operations
│   │   ├── executor.ts      # Macro execution
│   │   └── settings.ts      # Configuration
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── shared/                  # Shared library
│   ├── src/
│   │   ├── index.ts
│   │   ├── parser.ts        # Macro parser
│   │   ├── executor.ts      # Execution engine
│   │   ├── variables.ts     # Variable system
│   │   ├── state-manager.ts # Execution state
│   │   ├── datasource.ts    # CSV handling
│   │   ├── encryption.ts    # Variable encryption
│   │   ├── expression-evaluator.ts
│   │   └── commands/
│   │       ├── index.ts
│   │       ├── navigation.ts
│   │       ├── interaction.ts
│   │       ├── extraction.ts
│   │       ├── flow.ts
│   │       ├── dialogs.ts
│   │       ├── downloads.ts
│   │       ├── browser.ts
│   │       ├── system.ts
│   │       └── files.ts
│   └── tsconfig.json
│
├── tests/                   # Test suites
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── docs/                    # Documentation
├── package.json
├── tsconfig.json            # Root TS config
└── vitest.config.ts
```

---

## Technology Stack

### Languages & Frameworks

| Component | Technology |
|-----------|------------|
| Extension | TypeScript |
| Native Host | TypeScript (Node.js) |
| Shared Library | TypeScript |
| Build System | Vite |
| Testing | Vitest |
| Package Manager | npm (workspaces) |

### Key Libraries

| Library | Purpose |
|---------|---------|
| CodeMirror 6 | Code editor component |
| @crxjs/vite-plugin | Extension build plugin |
| puppeteer | E2E testing |
| jsdom | DOM testing |

### Browser APIs Used

| API | Purpose |
|-----|---------|
| chrome.runtime | Messaging, lifecycle |
| chrome.tabs | Tab management |
| chrome.sidePanel | Side panel UI |
| chrome.storage | Settings storage |
| chrome.webRequest | Request interception |
| chrome.downloads | Download management |
| chrome.browsingData | Clear browser data |

---

## Building the Project

### Prerequisites

- Node.js 18+
- npm 9+
- Firefox Developer Edition (recommended)

### Initial Setup

```bash
# Clone the repository
git clone <repository-url>
cd iMacros-new

# Install dependencies
npm install

# Build shared library first
npm run build:tsc

# Build extension
npm run build:extension

# Build native host
npm run build:native-host
```

### Development Build

```bash
# Watch mode for extension
npm run dev:extension

# Watch mode for native host
npm run dev:native-host

# Run type checking
npm run typecheck
```

### Production Build

```bash
# Full build
npm run build

# Extension only
npm run build:extension

# Native host only
npm run build:native-host
```

### Build Output

```
extension/dist/       # Extension files
native-host/dist/     # Native host bundle
shared/dist/          # Shared library
```

---

## Development Workflow

### Loading the Extension

1. Build the extension: `npm run build:extension`
2. Open Firefox and go to `about:debugging`
3. Click "This Firefox" > "Load Temporary Add-on"
4. Select `extension/dist/manifest.json`

### Hot Reload Development

```bash
# Terminal 1: Watch extension
npm run dev:extension

# Terminal 2: Watch native host
npm run dev:native-host
```

Changes to source files trigger automatic rebuilds. Reload the extension in Firefox to see changes.

### Debugging

**Background Script:**
1. Go to `about:debugging`
2. Find the extension
3. Click "Inspect" next to the background script

**Content Scripts:**
1. Open browser DevTools on target page
2. Go to "Debugger" tab
3. Find content scripts under "Moz-extension"

**Native Host:**
```bash
# Run with debug logging
DEBUG=imacros:* node dist/index.js
```

---

## Core Components

### Parser (`shared/src/parser.ts`)

Parses iMacros macro language into an AST.

```typescript
import { parseMacro, ParsedMacro } from '@shared/parser';

const script = `
VERSION BUILD=8.9.7
URL GOTO=https://example.com
TAG POS=1 TYPE=INPUT ATTR=NAME:q CONTENT=test
`;

const macro: ParsedMacro = parseMacro(script);
// macro.commands contains parsed command objects
```

**Key Types:**
- `ParsedMacro` - Complete parsed macro
- `ParsedCommand` - Single command
- `Parameter` - Command parameter
- `VariableReference` - Variable reference

### Executor (`shared/src/executor.ts`)

Executes parsed macros with command handlers.

```typescript
import { MacroExecutor, createExecutor } from '@shared/executor';

const executor = createExecutor({
  maxLoops: 1,
  onProgress: (progress) => console.log(progress),
  onLog: (level, message) => console.log(`[${level}]`, message),
});

executor.loadMacro(script);
const result = await executor.execute();
```

**Key Features:**
- Command handler registration
- Variable expansion
- Loop management
- Error handling
- Pause/resume/stop

### Variable System (`shared/src/variables.ts`)

Manages built-in and custom variables.

```typescript
import { VariableContext, createVariableContext } from '@shared/variables';

const vars = createVariableContext();
vars.set('!VAR1', 'Hello');
vars.setLoop(1);

const result = vars.expand('Value: {{!VAR1}}, Loop: {{!LOOP}}');
// result.expanded = "Value: Hello, Loop: 1"
```

**Key Features:**
- System variables (!VAR0-9, !LOOP, etc.)
- Custom variables
- Variable expansion
- Date formatting (!NOW)
- Clipboard integration

### State Manager (`shared/src/state-manager.ts`)

Tracks execution state across commands.

```typescript
import { createStateManager, StateManager } from '@shared/state-manager';

const state = createStateManager({
  macroName: 'test.iim',
  maxLoops: 10,
});

state.start();
state.setCurrentLine(1);
state.addExtract('extracted data');
state.complete();
```

---

## Command System

### Handler Interface

Commands are implemented as async handler functions:

```typescript
import { CommandHandler, CommandContext, CommandResult, IMACROS_ERROR_CODES } from '@shared/executor';

const myHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  // Get parameters
  const value = ctx.getParam('VALUE');

  // Expand variables
  const expanded = ctx.expand(value || '');

  // Log messages
  ctx.log('info', `Processing: ${expanded}`);

  // Access state
  ctx.state.setVariable('!VAR1', 'result');

  // Return result
  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
    output: expanded,
  };
};
```

### Handler Context

The `CommandContext` provides:

| Property | Description |
|----------|-------------|
| `command` | Parsed command object |
| `variables` | Variable context |
| `state` | State manager |
| `getParam(key)` | Get parameter value |
| `getRequiredParam(key)` | Get required parameter (throws if missing) |
| `expand(text)` | Expand variables in text |
| `log(level, message)` | Log a message |

### Registering Handlers

```typescript
import { MacroExecutor } from '@shared/executor';
import { myHandler } from './my-handler';

const executor = new MacroExecutor();

// Register single handler
executor.registerHandler('MYCOMMAND', myHandler);

// Register multiple handlers
executor.registerHandlers({
  MYCOMMAND: myHandler,
  ANOTHERCOMMAND: anotherHandler,
});
```

### Command Categories

Commands are organized by category:

| File | Commands |
|------|----------|
| `navigation.ts` | URL, TAB, FRAME, BACK, REFRESH |
| `interaction.ts` | TAG, CLICK, EVENT |
| `extraction.ts` | EXTRACT, SEARCH |
| `flow.ts` | WAIT, PAUSE, PROMPT |
| `dialogs.ts` | ONDIALOG, ONLOGIN, etc. |
| `downloads.ts` | ONDOWNLOAD, SAVEAS, SAVEITEM |
| `browser.ts` | CLEAR, FILTER, PROXY, SCREENSHOT |
| `system.ts` | VERSION, STOPWATCH, CMDLINE, DISCONNECT, REDIAL |
| `files.ts` | FILEDELETE |

---

## Messaging Architecture

### Extension to Native Host

```typescript
// Background script sends to native host
const response = await sendToNativeHost({
  type: 'execute',
  id: createMessageId(),
  timestamp: Date.now(),
  payload: { command: 'URL', params: { GOTO: 'https://example.com' } },
});
```

### Message Types

**Request Messages:**
```typescript
interface RequestMessage {
  type: string;       // Message type
  id: string;         // Unique ID for response matching
  timestamp: number;  // Creation time
  payload?: unknown;  // Command-specific data
}
```

**Response Messages:**
```typescript
interface ResponseMessage {
  type: string;       // 'result', 'error', or event type
  id: string;         // Matches request ID
  timestamp: number;
  payload?: unknown;
  error?: string;
}
```

### Content Script Communication

```typescript
// Background to content script
chrome.tabs.sendMessage(tabId, {
  type: 'TAG_COMMAND',
  payload: { selector, action },
});

// Content script response
return {
  success: true,
  extractedData: 'text content',
};
```

### Bridge Interfaces

Commands use bridge interfaces for platform abstraction:

```typescript
// Navigation bridge
interface BrowserBridge {
  sendMessage(message: BrowserOperationMessage): Promise<BrowserOperationResponse>;
}

// Content script bridge
interface ContentScriptSender {
  sendMessage(message: InteractionMessage): Promise<ContentScriptResponse>;
}

// File bridge
interface FileBridge {
  sendMessage(message: FileOperationMessage): Promise<FileOperationResponse>;
}
```

---

## Testing

### Unit Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

### Test Structure

```typescript
// tests/unit/parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseMacro, parseParameters } from '@shared/parser';

describe('Parser', () => {
  it('parses URL command', () => {
    const result = parseMacro('URL GOTO=https://example.com');
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0].type).toBe('URL');
  });
});
```

### Integration Tests

```typescript
// tests/integration/executor.test.ts
import { describe, it, expect } from 'vitest';
import { createExecutor } from '@shared/executor';

describe('Executor', () => {
  it('executes simple macro', async () => {
    const executor = createExecutor();
    executor.loadMacro(`
      SET !VAR1 "test"
      WAIT SECONDS=0.1
    `);

    const result = await executor.execute();
    expect(result.success).toBe(true);
  });
});
```

### E2E Tests

```typescript
// tests/e2e/recording.test.ts
import puppeteer from 'puppeteer';

describe('Recording', () => {
  it('records click events', async () => {
    const browser = await puppeteer.launch({
      product: 'firefox',
      headless: false,
    });
    // ... test recording functionality
  });
});
```

---

## Contributing

### Code Style

- Use TypeScript strict mode
- Follow existing code patterns
- Add JSDoc comments for public APIs
- Use meaningful variable names

### Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Run `npm run typecheck` and `npm test`
5. Submit PR with description

### Commit Messages

```
type(scope): description

- feat: New feature
- fix: Bug fix
- docs: Documentation
- test: Tests
- refactor: Code refactoring
- chore: Build/tooling
```

Example:
```
feat(parser): add CSS selector support to TAG command

- Add CSS parameter to TAG command
- Update element-finder to use CSS selectors
- Add tests for CSS selector parsing
```

### Adding New Commands

1. Define types in appropriate command file
2. Implement handler function
3. Register in command index
4. Add to parser command list
5. Update documentation
6. Add tests

Example workflow:

```typescript
// 1. Add to parser.ts CommandType
export type CommandType =
  // ... existing
  | 'MYCOMMAND';

// 2. Add handler in commands/mycommand.ts
export const myCommandHandler: CommandHandler = async (ctx) => {
  // Implementation
};

// 3. Register in commands/index.ts
export * from './mycommand';

// 4. Update executor registration
executor.registerHandler('MYCOMMAND', myCommandHandler);
```

### Documentation Updates

When adding features:
1. Update COMMAND_REFERENCE.md
2. Add examples to USER_GUIDE.md
3. Note breaking changes in MIGRATION_GUIDE.md
4. Update this file if architecture changes

---

## Debugging Tips

### Common Issues

**"Native host not found":**
- Check manifest location
- Verify host executable path
- Check Firefox native messaging registry

**"Content script not loaded":**
- Check manifest permissions
- Verify URL matches
- Look for CSP issues

**"Message port closed":**
- Service worker went to sleep
- Native host crashed
- Check error in background console

### Logging

```typescript
// Extension background
console.log('[iMacros]', message);

// Content script
console.debug('[iMacros Content]', data);

// Native host
console.error('[Native Host]', error);
```

### Performance Profiling

```typescript
// Measure execution time
const stopwatch = ctx.state.startStopwatch('operation');
// ... do work
stopwatch.stop();
console.log(`Operation took ${stopwatch.elapsed}ms`);
```

---

## Release Process

1. Update version in `package.json` files
2. Update CHANGELOG.md
3. Run full test suite
4. Build production: `npm run build`
5. Test built extension manually
6. Create release tag
7. Upload to distribution channels

---

*Developer Documentation - iMacros for Firefox v8.9.7*
