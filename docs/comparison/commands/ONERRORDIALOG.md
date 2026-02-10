# ONERRORDIALOG Command Comparison

## Syntax

```
ONERRORDIALOG BUTTON=OK
ONERRORDIALOG BUTTON=OK CONTINUE=NO
ONERRORDIALOG CONTINUE=FALSE
```

**Old regex**: `^(?:button\s*=\s*(?:\S*))?\\s*(?:\\bcontinue\\s*=\\s*(\\S*))?\\s*$`
- Capture groups: (1) optional CONTINUE value
- BUTTON is matched but not captured (consumed by the regex but unused in the handler)
- The entire parameter string is optional — `ONERRORDIALOG` with no parameters is valid

**New parser**: Listed in no-validation category (parser.ts:938) — the parser accepts it with any parameters or none.

## Parameters

| Parameter | Description | Old | New |
|-----------|-------------|-----|-----|
| BUTTON | Button to click on error dialog | Matched by regex but not captured or used | OK, CANCEL, YES, NO (defaults to OK if omitted; unrecognized values default to CANCEL via `parseButton()`) |
| CONTINUE | Whether to continue macro on JS errors | Optional; NO or FALSE sets `shouldStopOnError = true` | Optional; NO or FALSE sends `stopOnError: true` in config |

## Old Implementation (MacroPlayer.js:1509-1516)

```javascript
MacroPlayer.prototype.RegExpTable["onerrordialog"] =
    "^(?:button\\s*=\\s*(?:\\S*))?\\s*(?:\\bcontinue\\s*=\\s*(\\S*))?\\s*$"

MacroPlayer.prototype.ActionTable["onerrordialog"] = function (cmd) {
    var param = cmd[1] ? imns.unwrap(this.expandVariables(cmd[1])) : "";
    if (/^no|false$/i.test(param)) {
        this.shouldStopOnError = true;
    }
};
```

### Step-by-step logic (old)

1. **Regex match**: The pattern optionally matches `BUTTON=<value>` (non-capturing) and optionally captures `CONTINUE=<value>` into group 1.
2. **Get CONTINUE value**: `cmd[1]` is the captured CONTINUE value. If present, expand variables and unwrap quotes. If absent, use empty string.
3. **Test for stop-on-error**: Tests the CONTINUE value against `/^no|false$/i`. If it matches NO or FALSE (case-insensitive), sets `this.shouldStopOnError = true` on the macro player instance.
4. **No action for BUTTON**: The BUTTON parameter is consumed by the regex but never captured or used — the old implementation ignores it entirely.

### Error handling hook (MacroPlayer.js:3386-3393)

```javascript
MacroPlayer.prototype.onErrorOccurred = function(msg, url, line) {
    if (!this.playing || !this.shouldStopOnError)
        return;
    var data = msg+" on "+url+":"+line;
    iMacros.panel.showInfoMessage(data);
    this.stop();
};
```

When a JavaScript error occurs on the page during macro playback:
1. If the macro is not playing or `shouldStopOnError` is false, return (ignore the error).
2. Format the error message as `"<msg> on <url>:<line>"`.
3. Display the error in the iMacros panel info area.
4. Stop macro playback.

### Key observations (old)

- **BUTTON is ignored**: Despite accepting a BUTTON parameter in the regex, the handler never uses it. The command only controls stop-on-error behavior.
- **One-way flag**: `shouldStopOnError` is only ever set to `true`. Once set, it cannot be turned off during the same macro execution. `ONERRORDIALOG CONTINUE=YES` does nothing (the regex doesn't match NO/FALSE, so the flag stays at its current value).
- **Default is false**: `shouldStopOnError` is initialized to `false` in the MacroPlayer constructor (MacroPlayer.js:4701).
- **No dialog interception**: Unlike ONDIALOG, this command doesn't intercept any browser dialogs. It controls whether JavaScript errors stop macro execution.
- **Error display**: When stopping on error, the error details are shown in the iMacros panel before stopping.
- **Regex bug**: The regex `/^no|false$/i` matches strings starting with "no" OR strings ending with "false" (due to operator precedence). For example, "nothing" would match. The intended pattern is likely `/^(no|false)$/i`.

## New Implementation

### Handler (dialogs.ts:566-607 — `onErrorDialogHandler`)

```typescript
export const onErrorDialogHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const buttonStr = ctx.getParam('BUTTON');
  const button = buttonStr ? parseButton(ctx.expand(buttonStr)) : 'OK';

  // Parse CONTINUE parameter - when NO/FALSE, JS errors should stop execution
  const continueStr = ctx.getParam('CONTINUE');
  const continueVal = continueStr ? ctx.expand(continueStr) : '';
  const stopOnError = /^no|false$/i.test(continueVal);

  ctx.log('info', `Configuring error dialog handler: BUTTON=${button}${continueStr ? ` CONTINUE=${continueVal}` : ''}`);

  // Store configuration in state
  ctx.state.setVariable('!ERROR_DIALOG_BUTTON', button);

  // Send configuration to extension
  const response = await sendDialogMessage(
    {
      type: 'ERROR_DIALOG_CONFIG',
      payload: {
        config: {
          button,
          active: true,
          stopOnError,
        },
      },
    },
    ctx
  );

  if (!response.success) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: response.error || 'Failed to configure error dialog handler',
    };
  }

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
  };
};
```

### Step-by-step logic (new)

1. **Parse BUTTON parameter**: Gets the `BUTTON` parameter from the command context. If not provided, defaults to `'OK'`.
2. **Expand variables**: Calls `ctx.expand()` on the button value, allowing macro variables (e.g., `{{!VAR}}`) in the parameter.
3. **Parse button value**: `parseButton()` normalizes the value to uppercase. Valid values: OK, YES, NO, CANCEL. Unrecognized values default to CANCEL.
4. **Parse CONTINUE parameter**: Gets the `CONTINUE` parameter. If present, expands variables. If absent, uses empty string.
5. **Determine stopOnError**: Tests CONTINUE value against `/^no|false$/i`. If it matches NO or FALSE, `stopOnError` is `true`. Otherwise `false`.
6. **Log configuration**: Logs the configured button and optional CONTINUE value at info level.
7. **Store in state**: Sets `!ERROR_DIALOG_BUTTON` variable in macro state.
8. **Send to extension**: Sends an `ERROR_DIALOG_CONFIG` message through the dialog bridge with `{ button, active: true, stopOnError }`.
9. **Handle response**: If the bridge returns failure, returns `SCRIPT_ERROR`. Otherwise returns `OK`.

### Message flow

```
onErrorDialogHandler → sendDialogMessage → DialogBridge.sendMessage
                                            ↓
                                     Extension background script
                                     (configures error dialog handling + stopOnError)
```

### Data types

```typescript
interface ErrorDialogConfig {
  /** Button to click to dismiss error */
  button: DialogButton;       // 'OK' | 'CANCEL' | 'YES' | 'NO'
  /** Whether this config is active */
  active: boolean;
  /** Whether to stop macro on JS errors (CONTINUE=NO/FALSE sets this true) */
  stopOnError: boolean;
}
```

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **BUTTON parameter** | Regex matches but never captures or uses BUTTON | Parsed, validated, stored in state, and sent to extension | **Enhancement**: BUTTON is now functional; old always ignored it |
| **BUTTON default** | N/A (not used) | Defaults to OK when omitted | **Enhancement**: Explicit default behavior |
| **CONTINUE regex** | `/^no\|false$/i` — matches start-with-"no" OR end-with-"false" | Same regex `/^no\|false$/i` — identical precedence behavior | **Compatible**: Same regex, same edge cases preserved |
| **Stop-on-error mechanism** | Sets `this.shouldStopOnError = true` on MacroPlayer instance | Sends `stopOnError: true` in `ERROR_DIALOG_CONFIG` message to extension | **Structural**: Different mechanism, same semantic intent |
| **One-way flag** | Only sets to `true`, never resets during macro | Sends current `stopOnError` value (true or false) each time | **Enhancement**: Can potentially toggle behavior with subsequent commands |
| **Error handling location** | `onErrorOccurred` method on MacroPlayer watches JS errors | Extension receives config and handles error monitoring | **Structural**: Error monitoring delegated to extension |
| **Error display** | Shows error details in iMacros panel (`showInfoMessage`) | Handled by extension's error dialog system | **Structural**: Different UI mechanism |
| **State variables** | None — only `this.shouldStopOnError` flag | Sets `!ERROR_DIALOG_BUTTON` in macro state | **Enhancement**: Button config accessible to subsequent commands |
| **Variable expansion** | `this.expandVariables()` on CONTINUE value | `ctx.expand()` on both BUTTON and CONTINUE values | **Compatible**: Same behavior, different API |
| **Bridge failure** | N/A (direct property assignment) | Returns `SCRIPT_ERROR` if bridge fails | **Enhancement**: Error handling for message delivery |
| **No bridge fallback** | N/A | Returns success when no bridge configured (testing mode) | **Enhancement**: Graceful degradation |

## Output / Side Effects

- **Variables modified (new only)**: `!ERROR_DIALOG_BUTTON` (set to button value)
- **Old**: Sets `this.shouldStopOnError = true` when `CONTINUE=NO` or `CONTINUE=FALSE`
- **New**: Sends `ERROR_DIALOG_CONFIG` message through dialog bridge to extension with `{ button, active, stopOnError }`
- **No DOM side effects** (configuration only)
- **No navigation side effects**

## Test Coverage

### Unit tests (`tests/unit/dialog-handlers.test.ts`)
- `ONERRORDIALOG BUTTON=OK` sends `ERROR_DIALOG_CONFIG` with `button=OK, active=true`
- Default to OK when no BUTTON specified
- Bridge failure returns `SCRIPT_ERROR`
- Bridge exception returns `SCRIPT_ERROR`
- No bridge configured returns success (testing mode)
- OK config sent through bridge with correct message structure
- `CONTINUE=NO` sends `stopOnError=true`
- `CONTINUE=FALSE` sends `stopOnError=true`
- CONTINUE not specified sends `stopOnError=false`
- `CONTINUE=YES` sends `stopOnError=false`

### Unit tests (`tests/unit/commands/dialogs.test.ts`)
- Default to BUTTON=OK when BUTTON not provided — sets `!ERROR_DIALOG_BUTTON` to OK
- Provided BUTTON value (e.g., CANCEL) — sets `!ERROR_DIALOG_BUTTON` to CANCEL
- Bridge sends `ERROR_DIALOG_CONFIG` with correct config shape
- Bridge failure returns error with message from bridge
- Bridge failure with no message returns default error message
- Bridge exception returns `SCRIPT_ERROR`
- `CONTINUE=NO` sends `stopOnError: true`
- `CONTINUE=FALSE` sends `stopOnError: true`
- `CONTINUE=false` (lowercase) sends `stopOnError: true`
- `CONTINUE=YES` sends `stopOnError: false`
- No CONTINUE sends `stopOnError: false`
- Handler exported in `dialogHandlers` map as `ONERRORDIALOG`
- Registered via `registerDialogHandlers`

### Parser tests (`tests/unit/parser.test.ts`)
- `ONERRORDIALOG BUTTON=OK CONTINUE=NO` parses with type `ONERRORDIALOG`
- Listed in known command types array
