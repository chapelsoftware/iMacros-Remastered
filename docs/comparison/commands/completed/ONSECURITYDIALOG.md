# ONSECURITYDIALOG Command Comparison

## Syntax

```
ONSECURITYDIALOG BUTTON=OK
ONSECURITYDIALOG BUTTON=CANCEL
```

**Old regex**: `.*`
- Accepts any parameter string.

**New parser**: Listed in no-validation category (parser.ts:940) — the parser accepts it with any parameters or none.

## Parameters

| Parameter | Description | Old | New |
|-----------|-------------|-----|-----|
| BUTTON | Button to click on security dialog | Accepted but never used (throws immediately) | OK, CANCEL, YES, NO (defaults to OK if omitted; unrecognized values default to CANCEL) |

## Old Implementation (MacroPlayer.js:1581-1584)

```javascript
MacroPlayer.prototype.RegExpTable["onsecuritydialog"] = ".*";

MacroPlayer.prototype.ActionTable["onsecuritydialog"] = function (cmd) {
    throw new UnsupportedCommand("ONSECURITYDIALOG");
};
```

### Step-by-step logic (old)

1. **Regex match**: The pattern `.*` matches any input after the command name, so `ONSECURITYDIALOG BUTTON=OK` or any other parameter combination is accepted by the parser.
2. **Throw UnsupportedCommand**: Immediately throws an `UnsupportedCommand` exception with the command name `"ONSECURITYDIALOG"`. No parameter processing occurs.

### Key observations (old)

- **Always unsupported**: The command is recognized by the parser but immediately throws — it was never functional in the Firefox extension.
- **No parameter processing**: Although the regex accepts any parameters, the handler ignores them entirely.
- **UnsupportedCommand exception**: This is a specific error type in iMacros that signals the command is known but not available in the current environment.
- **Firefox limitation**: Security dialogs in Firefox are handled at the browser level, outside the reach of the extension's XPCOM-based API.

## New Implementation

### Handler (dialogs.ts:618-651 — `onSecurityDialogHandler`)

```typescript
export const onSecurityDialogHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const buttonStr = ctx.getParam('BUTTON');
  const button = buttonStr ? parseButton(ctx.expand(buttonStr)) : 'OK';

  ctx.log('info', `Configuring security dialog handler: BUTTON=${button}`);

  // Store configuration in state
  ctx.state.setVariable('!SECURITY_DIALOG_BUTTON', button);

  // Send configuration to extension
  const response = await sendDialogMessage(
    {
      type: 'SECURITY_DIALOG_CONFIG',
      payload: {
        config: {
          button,
          active: true,
        },
      },
    },
    ctx
  );

  if (!response.success) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: response.error || 'Failed to configure security dialog handler',
    };
  }

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
  };
};
```

### Unsupported override (unsupported.ts:98-101)

```typescript
export const onSecurityDialogUnsupportedHandler: CommandHandler = createUnsupportedHandler(
  'ONSECURITYDIALOG',
  'Security dialog handling is not available in browser extensions'
);
```

In the extension context, the unsupported handler overrides the dialog handler (unsupported.ts:203), returning `UNSUPPORTED_COMMAND` error code (-915). The functional handler in `dialogs.ts` is available for non-extension contexts (e.g., native host) where security dialog interception may be possible.

### Step-by-step logic (new — functional handler)

1. **Parse BUTTON parameter**: Gets the `BUTTON` parameter from the command context. If not provided, defaults to `'OK'`.
2. **Expand variables**: Calls `ctx.expand()` on the button value, allowing macro variables (e.g., `{{!VAR}}`) in the parameter.
3. **Parse button value**: `parseButton()` normalizes the value to uppercase. Valid values: OK, YES, NO, CANCEL. Unrecognized values default to CANCEL.
4. **Log configuration**: Logs the configured button at info level.
5. **Store in state**: Sets the `!SECURITY_DIALOG_BUTTON` variable in macro state so the configuration persists during macro execution.
6. **Send to extension**: Sends a `SECURITY_DIALOG_CONFIG` message through the dialog bridge with `{ button, active: true }`.
7. **Handle response**: If the bridge returns failure, returns `SCRIPT_ERROR` with the error message. Otherwise returns `OK`.

### Step-by-step logic (new — unsupported handler)

1. **Return error immediately**: Returns `{ success: false, errorCode: UNSUPPORTED_COMMAND (-915) }` with message `"ONSECURITYDIALOG is not supported: Security dialog handling is not available in browser extensions"`.

### Message flow

```
onSecurityDialogHandler → sendDialogMessage → DialogBridge.sendMessage
                                               ↓
                                        Extension background script
                                        (configures security dialog handling)
```

### Data types

```typescript
interface SecurityDialogConfig {
  button: DialogButton;    // 'OK' | 'CANCEL' | 'YES' | 'NO'
  active: boolean;         // Whether this config is active
}
```

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Behavior** | Always throws `UnsupportedCommand` | Two handlers: functional (dialogs.ts) and unsupported override (unsupported.ts) | **Structural**: Architecture allows future support |
| **Extension context** | Throws `UnsupportedCommand` | Returns `UNSUPPORTED_COMMAND` error (-915) | **Compatible**: Same end result — command fails with unsupported error |
| **Error mechanism** | Exception thrown | Error result returned (no exception) | **Structural**: Different error flow, same user-visible outcome |
| **Parameter processing** | None — parameters ignored | BUTTON parsed, validated, expanded with variable support | **Enhancement**: Parameters are processed even if ultimately unsupported in extension |
| **Variable expansion** | N/A | Supports `{{!VAR}}` in BUTTON parameter | **Enhancement**: Consistent with other dialog commands |
| **State storage** | N/A | Sets `!SECURITY_DIALOG_BUTTON` variable | **Enhancement**: State tracked for potential future use |
| **Non-extension context** | N/A (Firefox extension only) | Functional handler sends config through dialog bridge | **Enhancement**: Potentially functional outside extension |
| **Default button** | N/A | OK (when BUTTON param omitted) | N/A (old never processes params) |
| **Invalid button** | N/A | Defaults to CANCEL | N/A (old never processes params) |

## Output / Side Effects

- **Variables modified**: `!SECURITY_DIALOG_BUTTON` (set to button value in functional handler)
- **Extension context**: Returns `UNSUPPORTED_COMMAND` error — no side effects
- **Non-extension context**: Sends `SECURITY_DIALOG_CONFIG` message through dialog bridge
- **No DOM side effects**
- **No navigation side effects**

## Test Coverage

### Unit tests (`tests/unit/dialog-handlers.test.ts`)
- `ONSECURITYDIALOG BUTTON=OK` sends `SECURITY_DIALOG_CONFIG` with `button=OK, active=true`
- `ONSECURITYDIALOG BUTTON=CANCEL` sends config with `button=CANCEL`
- Default to OK when no BUTTON specified
- Bridge failure returns `SCRIPT_ERROR`
- Bridge exception returns `SCRIPT_ERROR`
- No bridge configured returns success (testing mode)
- `ONSECURITYDIALOG BUTTON=CANCEL` sends CANCEL config through bridge

### Unit tests (`tests/unit/unsupported-commands.test.ts`)
- `ONSECURITYDIALOG BUTTON=OK` returns `UNSUPPORTED_COMMAND` error in extension context
- Error message contains `"ONSECURITYDIALOG"`
- Listed in unsupported handlers map

### Unit tests (`tests/unit/commands/dialogs.test.ts`)
- Default to BUTTON=OK when not provided, sets `!SECURITY_DIALOG_BUTTON`
- Uses provided BUTTON value (CANCEL), sets state variable
- Succeeds via bridge with `SECURITY_DIALOG_CONFIG` message type
- Returns error when bridge fails (custom error message)
- Uses fallback error message when bridge fails without error text
- Handles bridge exception gracefully
- Handler exported in `dialogHandlers` map
- Registered via `registerDialogHandlers`

### Parser tests (`tests/unit/parser.test.ts`)
- `ONSECURITYDIALOG BUTTON=YES` parses with type `ONSECURITYDIALOG`
