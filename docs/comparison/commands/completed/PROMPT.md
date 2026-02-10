# PROMPT Command Comparison

## Syntax

```
PROMPT message [varname] [default]
PROMPT MESSAGE="text" [VAR=!VARx] [DEFAULT="value"]
```

**Old regex**: `"^(im_strre)(?:\\s+(im_strre)(?:\\s+(im_strre))?)?\\s*$"` — matches 1-3 string tokens (quoted strings, `eval(...)` expressions, or non-whitespace tokens).

**New parser**: `parser.ts:755-766` — Validates at least 1 parameter (the message) is present; returns error otherwise.

## Parameters

| # | Name | Required | Description |
|---|------|----------|-------------|
| 1 | message / MESSAGE | Yes | Text to display in the dialog |
| 2 | varname / VAR | No | Variable to store user input (e.g. `!VAR1`) |
| 3 | default / DEFAULT | No | Default value pre-filled in the input field |

## Old Implementation (MacroPlayer.js:1615-1641)

### Regex

```javascript
MacroPlayer.prototype.RegExpTable["prompt"] =
    "^("+im_strre+")"+
    "(?:\\s+("+im_strre+")"+
    "(?:\\s+("+im_strre+"))?)?\\s*$";
```

Where `im_strre` is:
```javascript
const im_strre = "(?:\"(?:[^\"\\\\]|\\\\[0btnvfr\"\'\\\\])*\"|"+
    "eval\\s*\\(\"(?:[^\"\\\\]|\\\\[\\w\"\'\\\\])*\"\\)|"+
    "\\S*)";
```

Three capture groups:
- `cmd[1]` — message text
- `cmd[2]` — variable name (optional)
- `cmd[3]` — default value (optional)

### Action handler

```javascript
MacroPlayer.prototype.ActionTable["prompt"] = function (cmd) {
    var text = imns.unwrap(this.expandVariables(cmd[1]));
    var defval = cmd[3] ? imns.unwrap(this.expandVariables(cmd[3])) : "";
    var prompts = imns.Cc["@mozilla.org/embedcomp/prompt-service;1"]
        .getService(imns.Ci.nsIPromptService);

    if (typeof cmd[2] != "undefined") {
        var check = {value: false};
        var input = {value: defval};
        var result = prompts.prompt(window, "iMacros",
                                    text, input, null, check);
        if (typeof(result) != "undefined") {
            if (/!var([0-9])/i.test(cmd[2])) {
                this.vars[imns.s2i(RegExp.$1)] = input.value;
            } else if (/[^!]\S*/.test(cmd[2])) {
                this.setUserVar(cmd[2], input.value);
            }
        }
    } else {
        prompts.alert(window, "iMacros", text);
    }
};
```

### Step-by-step logic (old)

1. **Parse arguments**: Regex captures up to 3 string tokens from the command line.
2. **Expand message**: `cmd[1]` is unwrapped (strips outer quotes) and variables are expanded via `this.expandVariables()`.
3. **Expand default**: If `cmd[3]` exists, it is unwrapped and expanded; otherwise defaults to `""`.
4. **Branch on variable presence**:
   - **Variable specified** (`cmd[2]` defined):
     1. Creates XPCOM `nsIPromptService` instance.
     2. Shows a native browser prompt dialog with title "iMacros", the expanded message text, and the default value pre-filled.
     3. If the user confirms (result is defined):
        - If variable matches `!var([0-9])` (case-insensitive): stores `input.value` in the built-in `this.vars[]` array at the numeric index.
        - Else if variable matches `[^!]\S*` (doesn't start with `!`): stores via `this.setUserVar()` for user-defined variables.
     4. If the user cancels, no value is stored (dialog returns undefined result).
   - **No variable** (`cmd[2]` undefined):
     1. Shows a native browser alert dialog with title "iMacros" and the expanded message text.

### Key details (old)

- Uses Mozilla's XPCOM `nsIPromptService` for native browser dialogs (Firefox-specific API)
- The dialog title is always "iMacros"
- Variable storage has two paths:
  - Built-in `!VARn` variables (1-9): stored in `this.vars[]` array via `imns.s2i()` index conversion
  - User-defined variables (not starting with `!`): stored via `this.setUserVar()`
- The regex `!var([0-9])` only matches single-digit indices (1-9)
- The regex `[^!]\S*` matches user variable names that don't start with `!`
- Cancel behavior: no value is stored, macro continues silently
- Default value defaults to `""` (empty string) when not provided
- Both message and default value support variable expansion via `this.expandVariables()`
- Both message and default value support `eval()` expressions via `im_strre`

## New Implementation (shared/src/commands/flow.ts:316-426)

### Architecture

The new implementation uses a **UI callback architecture** with pluggable dialog handlers:

```typescript
export type PromptDialogCallback = (message: string, defaultValue?: string) => Promise<string>;
export type AlertDialogCallback = (message: string, title?: string) => Promise<void>;

export interface FlowControlUI {
  showPause: PauseDialogCallback;
  showPrompt: PromptDialogCallback;
  showAlert: AlertDialogCallback;
}
```

Default headless callbacks return the default value (or empty string) for `showPrompt` and no-op for `showAlert`.

### Handler

```typescript
export const promptHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const params = ctx.command.parameters;
  let message, varName, defaultValue;

  // Named parameter mode: MESSAGE="text" [VAR=!VARx] [DEFAULT="val"]
  const messageParam = ctx.getParam('MESSAGE');
  if (messageParam) {
    message = messageParam;
    varName = ctx.getParam('VAR');
    defaultValue = ctx.getParam('DEFAULT');
  } else {
    // Positional mode: PROMPT message [varname] [default]
    const positional = params.filter(p => {
      const k = p.key.toUpperCase();
      return k !== 'MESSAGE' && k !== 'VAR' && k !== 'DEFAULT';
    });
    if (positional.length > 0) message = positional[0].key;
    if (positional.length > 1) varName = positional[1].key;
    if (positional.length > 2) defaultValue = positional[2].key;
    // Named params supplement positional
    if (!varName && ctx.getParam('VAR')) varName = ctx.getParam('VAR');
    if (defaultValue === undefined && ctx.getParam('DEFAULT')) defaultValue = ctx.getParam('DEFAULT');
  }

  if (!message) return { success: false, errorCode: MISSING_PARAMETER, ... };

  const expandedMessage = ctx.expand(message);
  const expandedDefault = defaultValue !== undefined ? ctx.expand(defaultValue) : undefined;
  const expandedVarName = varName ? ctx.expand(varName) : undefined;

  if (!expandedVarName) {
    // Alert-only mode
    await activeUI.showAlert(expandedMessage);
    return { success: true, errorCode: OK };
  }

  // Prompt mode
  try {
    const userInput = await activeUI.showPrompt(expandedMessage, expandedDefault);
    ctx.state.setVariable(expandedVarName, userInput);
    return { success: true, errorCode: OK, output: userInput };
  } catch {
    // Cancel — continue silently
    return { success: true, errorCode: OK };
  }
};
```

### Parser validation (parser.ts:755-766)

```typescript
case 'PROMPT': {
  // PROMPT accepts: <message> [<variable> [<default>]]
  // At least 1 parameter (message) is required
  if (command.parameters.length < 1) {
    return {
      lineNumber: command.lineNumber,
      message: 'PROMPT command requires at least a message',
      raw: command.raw,
    };
  }
  break;
}
```

### Step-by-step logic (new)

1. **Parse parameters**: Checks for named params (`MESSAGE`, `VAR`, `DEFAULT`) first; falls back to positional params if `MESSAGE` is not found. Named params can supplement positional ones.
2. **Validate message**: Returns `MISSING_PARAMETER` error if no message is found.
3. **Expand variables**: Message, default value, and variable name are all expanded via `ctx.expand()`.
4. **Branch on variable presence**:
   - **No variable** (`expandedVarName` falsy): Calls `activeUI.showAlert(expandedMessage)` — alert-only mode, no input field.
   - **Variable specified**: Calls `activeUI.showPrompt(expandedMessage, expandedDefault)`.
     - On success: Stores `userInput` in the variable via `ctx.state.setVariable()`, returns `output: userInput`.
     - On cancel (callback rejects): Returns success with no output, no variable stored.

### Key details (new)

- Uses a pluggable `FlowControlUI` callback system instead of XPCOM services
- Supports both named params (`MESSAGE`, `VAR`, `DEFAULT`) and positional syntax — positional is the iMacros 8.9.7 compatible form
- Named params can supplement positional ones (e.g., positional message + named `VAR=`)
- All variable types go through `ctx.state.setVariable()` — unified storage (no separate `!VARn` vs user variable path)
- Variable name itself is expanded via `ctx.expand()`, supporting dynamic variable references
- Default value is `undefined` (not `""`) when not provided — passed through to `showPrompt`
- Cancel on alert-only mode is not handled (alert doesn't have cancel)
- Headless mode: `showPrompt` returns `defaultValue ?? ''`, `showAlert` is a no-op
- Returns `output: userInput` on successful prompt (not returned by old implementation)

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Dialog API** | XPCOM `nsIPromptService` (Firefox-specific) | Pluggable `FlowControlUI` callback interface | **Structural**: Same user experience; different underlying API |
| **Dialog title** | Always "iMacros" | No fixed title (UI callback controls it) | **Minor**: UI presentation detail |
| **Syntax modes** | Positional only (`message varname default`) | Both positional and named (`MESSAGE=`, `VAR=`, `DEFAULT=`) | **Enhancement**: Named syntax is more readable; positional is backwards-compatible |
| **Variable storage** | Two paths: `this.vars[]` for `!VARn`, `setUserVar()` for user vars | Unified `ctx.state.setVariable()` for all variable types | **Structural**: Same observable behavior; simpler internal design |
| **Variable name regex** | `!var([0-9])` — only `!VAR1` through `!VAR9` | No regex filter — any variable name accepted by `setVariable()` | **Enhancement**: Supports `!VAR0`, `!VAR10+`, and any variable name |
| **User variable regex** | `[^!]\S*` — must not start with `!` | No restriction — variable name is whatever is passed | **Enhancement**: More flexible variable naming |
| **Default value when absent** | `""` (empty string) | `undefined` (passed through to callback) | **Minor**: Callback receives `undefined` vs `""` — headless UI returns `''` in both cases |
| **Cancel behavior** | No value stored, macro continues | No value stored, macro continues, returns `success: true` | **Compatible**: Same observable behavior |
| **Headless mode** | N/A (always shows native dialog) | `showPrompt` returns default or `''`; `showAlert` is no-op | **Enhancement**: Supports scripted/headless execution |
| **Variable expansion in var name** | No — variable name used as-is from regex capture | Yes — `ctx.expand(varName)` expands the variable name | **Enhancement**: Supports dynamic variable references |
| **Return value** | No return value | `output: userInput` on success | **Enhancement**: Allows caller to access user input |
| **Error handling** | No explicit error for missing message (regex wouldn't match) | Returns `MISSING_PARAMETER` error code | **Compatible**: Both reject malformed commands, different mechanism |
| **eval() support** | `im_strre` supports `eval("...")` expressions in parameters | Not supported — no `eval()` in parameter parsing | **Limitation**: eval() expressions not supported (rarely used) |

## Output / Side Effects

- **Variables modified**: The variable specified by `varname`/`VAR` is set to the user's input string (only on successful prompt, not on cancel)
- **Return value (old)**: No explicit return — stores value in `this.vars[]` or via `setUserVar()` as a side effect
- **Return value (new)**: `{ success: true, errorCode: OK, output: userInput }` on successful prompt; `{ success: true, errorCode: OK }` on alert-only or cancel
- **Side effects (old)**: Shows native browser dialog via XPCOM; blocks execution until dialog is dismissed
- **Side effects (new)**: Calls UI callback (`showPrompt` or `showAlert`); async — awaits callback resolution

## Test Coverage

### Unit tests — flow handlers (tests/unit/flow-handlers.test.ts)

- Alert-only mode: MESSAGE without VAR calls `showAlert` (line 353)
- Prompt with MESSAGE+VAR stores in specified variable (line 375)
- DEFAULT value passed to `showPrompt` and stored in custom VAR (line 400)
- Default UI returns `defaultValue` when provided (line 427)
- Cancel continues silently without storing value (line 446)
- Cancel does not overwrite existing variable value (line 540)
- Returns `MISSING_PARAMETER` when no message provided (line 476)
- Alert-only with positional message (line 488)
- Positional syntax: `PROMPT message varname default` (line 513)
- User input stored in custom VAR on success (line 570)
- `registerFlowHandlers` registers PROMPT (lines 945, 976)

### Unit tests — flow command tests (tests/unit/commands/flow.test.ts)

- Positional param with value: alert-only mode uses key as message (line 310)
- `registerFlowHandlers` registers WAIT, PAUSE, PROMPT (line 390)

### Integration tests — prompt (tests/integration/commands/prompt.test.ts)

- A. Alert-only mode: MESSAGE without VAR calls `showAlert` (line 62)
- A. Positional message-only calls `showAlert` (line 78)
- B. VAR param stores input in specified variable (line 96)
- B. Different variable stores different value (line 111)
- B. Overwrites previously SET variable (line 124)
- C. DEFAULT value passed to `showPrompt` (line 141)
- C. `undefined` passed when no DEFAULT (line 156)
- C. DEFAULT and VAR combined (line 169)
- D. Variable expansion in MESSAGE text (line 187)
- D. Variable expansion in DEFAULT text (line 207)
- E. Cancel continues silently (line 228)
- E. Cancel preserves existing variable value (line 244)
- E. Execution continues after cancel (line 260)
- F. Returns `MISSING_PARAMETER` without message (line 282)
- G. Multi-command macro: SET, PROMPT, SET in sequence (line 303)
- G. Headless default UI returns default value (line 321)
- G. Headless UI returns empty string with no default (line 335)
- G. Multiple PROMPT commands in sequence (line 347)
- H. Positional syntax: `PROMPT "message" !VAR1` (line 374)
- H. Positional syntax: `PROMPT "message" !VAR1 default` (line 388)
