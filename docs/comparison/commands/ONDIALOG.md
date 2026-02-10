# ONDIALOG Command Comparison

## Syntax

```
ONDIALOG POS=1 BUTTON=OK
ONDIALOG POS=1 BUTTON=CANCEL
ONDIALOG POS=1 BUTTON=YES CONTENT="response text"
```

**Old regex**: `^pos\s*=\s*(\S+)\s+button\s*=\s*(\S+)(?:\s+content\s*=\s*(<im_strre>)?)?\s*$`
- Capture groups: (1) POS value, (2) BUTTON value, (3) optional CONTENT value
- `im_strre` matches quoted strings (with escape sequences), `eval(...)` expressions, or non-whitespace tokens

**New parser**: Validates POS and BUTTON parameters are present (parser.ts:768-778). Returns validation error if either is missing.

## Parameters

| Parameter | Description | Old | New |
|-----------|-------------|-----|-----|
| POS | 1-based position index into dialog action queue | Required; validated as integer >= 1 via `imns.s2i()` | Required; validated as integer >= 1 via `parseInt()` |
| BUTTON | Button to click when dialog appears | OK, YES → accept; anything else → cancel (boolean `obj.accept`) | OK, YES, NO, CANCEL (string enum; unrecognized defaults to CANCEL) |
| CONTENT | Value to enter in prompt dialogs | Optional; stored as `obj.content` string | Optional; stored in config and state variable |

## Old Implementation (MacroPlayer.js:1136-1159)

```javascript
MacroPlayer.prototype.RegExpTable["ondialog"] =
    "^pos\\s*=\\s*(\\S+)"+
    "\\s+button\\s*=\\s*(\\S+)"+
    "(?:\\s+content\\s*=\\s*("+im_strre+")?)?\\s*$";

MacroPlayer.prototype.ActionTable["ondialog"] = function (cmd) {
    var pos = imns.s2i(imns.unwrap(this.expandVariables(cmd[1])));
    if (isNaN(pos) || pos < 1)
        throw new BadParameter("POS=<number>", 1);
    var button = imns.unwrap(this.expandVariables(cmd[2]));
    var storage = imns.storage;
    var obj = new Object();
    obj.accept = /^(ok|yes)$/i.test(button);
    if (typeof cmd[3] != "undefined")
        obj.content = imns.unwrap(this.expandVariables(cmd[3]));
    obj.timeout = this.delay;
    var actions = storage.getObjectForWindow(iMacros.wid,
                                             "onDialogAction");
    if (!actions) {
        actions = new Array();
    }
    actions[pos-1] = obj;
    storage.setObjectForWindow(iMacros.wid, "onDialogAction", actions);
};
```

### Step-by-step logic (old)

1. **Parse POS**: Expand variables in `cmd[1]`, unwrap quotes, convert to integer with `imns.s2i()`.
2. **Validate POS**: If NaN or < 1, throw `BadParameter("POS=<number>", 1)`.
3. **Parse BUTTON**: Expand variables in `cmd[2]`, unwrap quotes.
4. **Create action object**: `obj.accept = /^(ok|yes)$/i.test(button)` — converts button to a boolean. OK/YES → true, anything else → false.
5. **Parse CONTENT**: If `cmd[3]` is defined, expand variables, unwrap, store as `obj.content`.
6. **Set timeout**: `obj.timeout = this.delay` — uses the current `!TIMEOUT_STEP` value (the macro player's delay property).
7. **Get existing actions**: Retrieve the `onDialogAction` array from per-window storage. If none exists, create a new array.
8. **Store at POS index**: `actions[pos-1] = obj` — stores (or overwrites) the action at the 0-based index derived from POS.
9. **Save actions**: Write the updated array back to per-window storage.

### Dialog execution (commonDialogHook.js:119-214)

When a dialog appears during playback, `replayDialog()` is called:

1. **Shift action**: `actions.shift()` removes and returns the first element from the queue.
2. **No action available**: If queue is empty or shift returns falsy:
   - Sets `errorCode = -1450` ("RuntimeError: unhandled dialog detected")
   - Stops macro playback (unless `ignoreErrors` is set)
   - Completes the dialog (default: accept for alerts, cancel otherwise)
3. **Has action**: Sets prompt content if applicable (for `prompt` type dialogs).
4. **Timeout delay**: Waits `action.timeout` ms before completing the dialog.
5. **Complete dialog**: If `action.accept` is true OR if no action and dialog is an alert → clicks OK/accept. Otherwise → clicks Cancel.

### Key observations (old)

- **POS is a queue index**: POS=1 maps to index 0. Multiple ONDIALOG commands build an ordered array of actions.
- **FIFO consumption**: The dialog hook uses `shift()` to consume actions from the front of the array, regardless of original POS values.
- **Boolean button model**: Button is reduced to a boolean — only OK/YES vs everything else matters.
- **Per-window storage**: Actions are stored per browser window via `storage.getObjectForWindow`.
- **Timeout from !TIMEOUT_STEP**: The dialog wait time before auto-clicking comes from the macro player's `delay` property.
- **Error -1450**: Unhandled dialogs (no action queued) trigger error code -1450 and stop playback.

## New Implementation

### Handler (dialogs.ts:349-421 — `onDialogHandler`)

```typescript
export const onDialogHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const posStr = ctx.getParam('POS');
  const buttonStr = ctx.getParam('BUTTON');

  if (!posStr || !buttonStr) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'ONDIALOG command requires POS and BUTTON parameters',
    };
  }

  const pos = parseInt(ctx.expand(posStr), 10);
  if (isNaN(pos) || pos < 1) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
      errorMessage: `Invalid POS value: ${posStr}`,
    };
  }

  const button = parseButton(ctx.expand(buttonStr));
  const contentStr = ctx.getParam('CONTENT');
  const content = contentStr ? ctx.expand(contentStr) : undefined;

  const timeoutStep = ctx.state.getVariable('!TIMEOUT_STEP');
  const timeout = typeof timeoutStep === 'number' ? timeoutStep :
    typeof timeoutStep === 'string' ? parseFloat(timeoutStep) : undefined;

  ctx.log('info', `Configuring dialog handler: POS=${pos}, BUTTON=${button}${content ? `, CONTENT=${content}` : ''}`);

  ctx.state.setVariable('!DIALOG_POS', pos.toString());
  ctx.state.setVariable('!DIALOG_BUTTON', button);
  if (content) {
    ctx.state.setVariable('!DIALOG_CONTENT', content);
  }

  const response = await sendDialogMessage(
    {
      type: 'DIALOG_CONFIG',
      payload: {
        config: {
          pos,
          button,
          content,
          active: true,
          timeout: timeout !== undefined && !isNaN(timeout) ? timeout : undefined,
        },
        dialogTypes: ['alert', 'confirm', 'prompt', 'beforeunload'],
        append: true,
      },
    },
    ctx
  );

  if (!response.success) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: response.error || 'Failed to configure dialog handler',
    };
  }

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
  };
};
```

### Step-by-step logic (new)

1. **Get parameters**: Retrieve POS and BUTTON from command context via `ctx.getParam()`.
2. **Validate presence**: If either POS or BUTTON is missing, return `MISSING_PARAMETER` error.
3. **Parse POS**: Expand variables, parse as integer with `parseInt(..., 10)`.
4. **Validate POS**: If NaN or < 1, return `INVALID_PARAMETER` error.
5. **Parse BUTTON**: Expand variables, normalize with `parseButton()`. Valid values: OK, YES, NO, CANCEL. Unrecognized values default to CANCEL.
6. **Parse CONTENT**: If CONTENT parameter exists, expand variables.
7. **Get timeout**: Read `!TIMEOUT_STEP` from state, convert to number if string.
8. **Log configuration**: Log at info level with POS, BUTTON, and optional CONTENT.
9. **Store in state**: Set `!DIALOG_POS`, `!DIALOG_BUTTON`, and optionally `!DIALOG_CONTENT` variables.
10. **Send to extension**: Send `DIALOG_CONFIG` message through the dialog bridge with:
    - `config`: pos, button (string), content, active=true, timeout
    - `dialogTypes`: ['alert', 'confirm', 'prompt', 'beforeunload']
    - `append: true` (queue support — multiple ONDIALOG commands stack)
11. **Handle response**: If bridge returns failure, return `SCRIPT_ERROR`. Otherwise return `OK`.

### Helper: `parseButton()` (dialogs.ts:323-335)

```typescript
function parseButton(buttonStr: string): DialogButton {
  const upper = buttonStr.toUpperCase().trim();
  switch (upper) {
    case 'OK': case 'YES': case 'NO': case 'CANCEL':
      return upper as DialogButton;
    default:
      return 'CANCEL';
  }
}
```

### Message flow

```
onDialogHandler → sendDialogMessage → DialogBridge.sendMessage
                                       ↓
                                Extension background script
                                (configures dialog interception via content script)
```

### Data types

```typescript
interface DialogConfig {
  pos: number;            // 1-based position index
  button: DialogButton;   // 'OK' | 'CANCEL' | 'YES' | 'NO'
  content?: string;       // Value for prompt dialogs
  active: boolean;        // Whether this config is active
  timeout?: number;       // Timeout in seconds from !TIMEOUT_STEP
}

type DialogType = 'alert' | 'confirm' | 'prompt' | 'beforeunload';
```

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Button model** | Boolean: `obj.accept = /^(ok\|yes)$/i.test(button)` — only accept/reject | String enum: OK, YES, NO, CANCEL preserved as distinct values | **Behavioral**: New implementation preserves the specific button value; old collapses to boolean. In practice, equivalent for dialog handling (accept vs cancel) |
| **Invalid button default** | Anything not matching OK/YES → `accept=false` (cancel) | Anything not matching OK/YES/NO/CANCEL → `'CANCEL'` | **Compatible**: Same effective behavior |
| **CONTENT empty string** | `typeof cmd[3] != "undefined"` — empty capture group treated as undefined | `ctx.getParam('CONTENT')` returns null if not present; empty string `CONTENT=` may differ | **Minor**: Edge case with `CONTENT=` (no value) |
| **Storage mechanism** | Per-window array via `storage.getObjectForWindow` (direct index assignment `actions[pos-1] = obj`) | Dialog bridge message with `append: true` flag; state variables `!DIALOG_POS`, `!DIALOG_BUTTON`, `!DIALOG_CONTENT` | **Structural**: Different storage architecture, same semantic intent |
| **Queue behavior** | Direct array index: `actions[pos-1] = obj` overwrites at specific index | Bridge-based with `append: true`; POS included in config for the extension to manage | **Behavioral**: Old directly manipulates array indices; new delegates queue management to extension |
| **Dialog types** | Handled by `commonDialogHook.js` observer for alert, confirm, prompt, login | Explicit `dialogTypes: ['alert', 'confirm', 'prompt', 'beforeunload']` | **Enhancement**: Includes `beforeunload`; login handled by separate ONLOGIN command |
| **Error on missing params** | `BadParameter` exception thrown | `MISSING_PARAMETER` or `INVALID_PARAMETER` error result returned | **Compatible**: Same user-visible outcome — command fails |
| **Variable expansion** | `this.expandVariables()` on captured groups | `ctx.expand()` on parameter values | **Compatible**: Same behavior, different API |
| **State variables** | None — stored only in per-window storage | Sets `!DIALOG_POS`, `!DIALOG_BUTTON`, `!DIALOG_CONTENT` | **Enhancement**: State visible to subsequent macro commands |
| **Timeout source** | `this.delay` (MacroPlayer property) | `!TIMEOUT_STEP` state variable | **Compatible**: Both reflect the same user-configurable timeout |
| **No bridge fallback** | N/A (always has storage) | Returns success when no bridge configured (testing mode) | **Enhancement**: Graceful degradation for testing |

## Output / Side Effects

- **Variables modified (new only)**: `!DIALOG_POS`, `!DIALOG_BUTTON`, `!DIALOG_CONTENT`
- **Old**: Stores action object in per-window `onDialogAction` array at `pos-1` index
- **New**: Sends `DIALOG_CONFIG` message through dialog bridge to extension
- **No DOM side effects** (configuration only — dialog handling occurs when dialog appears)
- **No navigation side effects**

## Test Coverage

### Unit tests (`tests/unit/dialog-handlers.test.ts`)
- `ONDIALOG POS=1 BUTTON=OK` sends `DIALOG_CONFIG` with pos=1, button=OK, active=true
- `ONDIALOG POS=1 BUTTON=CANCEL` sends config with button=CANCEL
- `ONDIALOG POS=1 BUTTON=YES` sends config with button=YES
- `ONDIALOG POS=1 BUTTON=NO` sends config with button=NO
- `ONDIALOG POS=1 BUTTON=OK CONTENT=hello` includes content in config
- `ONDIALOG POS=2 BUTTON=OK` sends config with pos=2
- Missing POS returns `MISSING_PARAMETER`
- Missing BUTTON returns `MISSING_PARAMETER`
- POS=0 returns `INVALID_PARAMETER`
- POS=-1 returns `INVALID_PARAMETER`
- Non-numeric POS returns `INVALID_PARAMETER`
- Unknown BUTTON value defaults to CANCEL
- Variable expansion in CONTENT (`{{!VAR1}}`)
- Bridge failure returns `SCRIPT_ERROR`
- Bridge exception returns `SCRIPT_ERROR`
- No bridge configured returns success (testing mode)
- Message includes id and timestamp
- Lowercase button values uppercased
- Mixed case button values handled

### Integration tests (`tests/integration/commands/ondialog.test.ts`)
- Basic `ONDIALOG POS=1 BUTTON=OK` through full executor pipeline
- All button values (OK, CANCEL, YES, NO) through executor
- CONTENT parameter through executor
- POS=2 through executor
- All 4 dialog types included (alert, confirm, prompt, beforeunload)
- Missing POS/BUTTON validation through executor
- Invalid POS values (0, -1, abc) through executor
- Unknown BUTTON defaults to CANCEL through executor
- Variable expansion in CONTENT through executor
- Bridge failure handling through executor

### Parser tests (`tests/unit/parser.test.ts`)
- `ONDIALOG POS=1 BUTTON=OK CONTENT=` parses with type `ONDIALOG`
- `ONDIALOG POS=1 BUTTON=CANCEL` parses BUTTON parameter correctly
- `ONDIALOG POS=1` (missing BUTTON) produces validation error

### Registration tests (`tests/unit/commands/dialogs.test.ts`)
- Handler exported in `dialogHandlers` map as `ONDIALOG`
- Registered via `registerDialogHandlers`
