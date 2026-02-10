# ONPRINT Command Comparison

## Syntax

```
ONPRINT BUTTON=OK
ONPRINT BUTTON=CANCEL
```

**Old regex**: `.*`
- Accepts any parameter string.

**New parser**: Listed in no-validation category (parser.ts:939) — the parser accepts it with any parameters or none.

## Parameters

| Parameter | Description | Old | New |
|-----------|-------------|-----|-----|
| BUTTON | Button to click on print dialog | Accepted but never used (throws immediately) | OK, CANCEL, YES, NO (defaults to OK if omitted; unrecognized values default to CANCEL) |

## Old Implementation (MacroPlayer.js:1573-1576)

```javascript
MacroPlayer.prototype.RegExpTable["onprint"] = ".*";

MacroPlayer.prototype.ActionTable["onprint"] = function (cmd) {
    throw new UnsupportedCommand("ONPRINT");
};
```

### Step-by-step logic (old)

1. **Regex match**: The pattern `.*` matches any input after the command name, so `ONPRINT BUTTON=OK` or any other parameter combination is accepted by the parser.
2. **Throw UnsupportedCommand**: Immediately throws an `UnsupportedCommand` exception with the command name `"ONPRINT"`. No parameter processing occurs.

### Key observations (old)

- **Always unsupported**: The command is recognized by the parser but immediately throws — it was never functional in the Firefox extension.
- **No parameter processing**: Although the regex accepts any parameters, the handler ignores them entirely.
- **UnsupportedCommand exception**: Error type with `errnum = 912` and message `"command ONPRINT is not supported in the current version"`.
- **Firefox limitation**: Print dialogs in Firefox are handled at the browser/OS level, outside the reach of the extension's XPCOM-based API.

## New Implementation

### Handler (dialogs.ts:716-751 — `onPrintHandler`)

```typescript
export const onPrintHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const buttonStr = ctx.getParam('BUTTON');
  const button = buttonStr ? parseButton(ctx.expand(buttonStr)) : 'OK';

  ctx.log('info', `Configuring print dialog handler: BUTTON=${button}`);

  // Store configuration in state
  ctx.state.setVariable('!PRINT_BUTTON', button);

  // Send configuration to extension
  const response = await sendDialogMessage(
    {
      type: 'PRINT_CONFIG',
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
      errorMessage: response.error || 'Failed to configure print dialog handler',
    };
  }

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
  };
};
```

### Unsupported override (unsupported.ts:87-90)

```typescript
export const onPrintUnsupportedHandler: CommandHandler = createUnsupportedHandler(
  'ONPRINT',
  'Print dialog handling is not available in browser extensions'
);
```

In the extension context, the unsupported handler overrides the dialog handler (unsupported.ts:202), returning `UNSUPPORTED_COMMAND` error code (-915). The functional handler in `dialogs.ts` is available for non-extension contexts (e.g., native host) where print dialog interception may be possible.

### Step-by-step logic (new — functional handler)

1. **Parse BUTTON parameter**: Gets the `BUTTON` parameter from the command context. If not provided, defaults to `'OK'`.
2. **Expand variables**: Calls `ctx.expand()` on the button value, allowing macro variables (e.g., `{{!VAR}}`) in the parameter.
3. **Parse button value**: `parseButton()` normalizes the value to uppercase. Valid values: OK, YES, NO, CANCEL. Unrecognized values default to CANCEL.
4. **Log configuration**: Logs the configured button at info level.
5. **Store in state**: Sets the `!PRINT_BUTTON` variable in macro state so the configuration persists during macro execution.
6. **Send to extension**: Sends a `PRINT_CONFIG` message through the dialog bridge with `{ button, active: true }`.
7. **Handle response**: If the bridge returns failure, returns `SCRIPT_ERROR` with the error message. Otherwise returns `OK`.

### Step-by-step logic (new — unsupported handler)

1. **Return error immediately**: Returns `{ success: false, errorCode: UNSUPPORTED_COMMAND (-915) }` with message `"ONPRINT is not supported: Print dialog handling is not available in browser extensions"`.

### Message flow

```
onPrintHandler → sendDialogMessage → DialogBridge.sendMessage
                                     ↓
                              Extension background script
                              (configures print dialog handling)
```

### Data types

```typescript
interface PrintConfig {
  /** Button to click (OK to print, CANCEL to cancel) */
  button: DialogButton;    // 'OK' | 'CANCEL' | 'YES' | 'NO'
  /** Whether this config is active */
  active: boolean;
}
```

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Behavior** | Always throws `UnsupportedCommand` | Two handlers: functional (dialogs.ts) and unsupported override (unsupported.ts) | **Structural**: Architecture allows future support |
| **Extension context** | Throws `UnsupportedCommand` (errnum 912) | Returns `UNSUPPORTED_COMMAND` error (-915) | **Compatible**: Same end result — command fails with unsupported error |
| **Error mechanism** | Exception thrown | Error result returned (no exception) | **Structural**: Different error flow, same user-visible outcome |
| **Parameter processing** | None — parameters ignored | BUTTON parsed, validated, expanded with variable support | **Enhancement**: Parameters are processed even if ultimately unsupported in extension |
| **Variable expansion** | N/A | Supports `{{!VAR}}` in BUTTON parameter | **Enhancement**: Consistent with other dialog commands |
| **State storage** | N/A | Sets `!PRINT_BUTTON` variable | **Enhancement**: State tracked for potential future use |
| **Non-extension context** | N/A (Firefox extension only) | Functional handler sends config through dialog bridge | **Enhancement**: Potentially functional outside extension |
| **Default button** | N/A | OK (when BUTTON param omitted) | N/A (old never processes params) |
| **Invalid button** | N/A | Defaults to CANCEL | N/A (old never processes params) |
| **Relationship to PRINT** | N/A | ONPRINT configures behavior; PRINT (print.ts) triggers the actual print operation | **Enhancement**: Clear separation of configuration vs execution |

## Output / Side Effects

- **Variables modified**: `!PRINT_BUTTON` (set to button value in functional handler)
- **Extension context**: Returns `UNSUPPORTED_COMMAND` error — no side effects
- **Non-extension context**: Sends `PRINT_CONFIG` message through dialog bridge
- **No DOM side effects**
- **No navigation side effects**

## Test Coverage

### Unit tests (`tests/unit/dialog-handlers.test.ts`)
- `ONPRINT BUTTON=OK` sends `PRINT_CONFIG` with `button=OK, active=true`
- `ONPRINT BUTTON=CANCEL` sends config with `button=CANCEL`
- Default to OK when no BUTTON specified
- Bridge failure returns `SCRIPT_ERROR`
- Bridge exception returns `SCRIPT_ERROR`
- No bridge configured returns success (testing mode)
- `ONPRINT BUTTON=CANCEL` sends CANCEL config through bridge

### Unit tests (`tests/unit/unsupported-commands.test.ts`)
- `ONPRINT BUTTON=OK` returns `UNSUPPORTED_COMMAND` error in extension context
- Error message contains `"ONPRINT"`
- Listed in unsupported handlers map

### Unit tests (`tests/unit/commands/dialogs.test.ts`)
- `onPrintHandler` defaults to `BUTTON=OK` when not provided
- `onPrintHandler` uses provided `BUTTON=CANCEL` value
- Sends `PRINT_CONFIG` message through bridge with correct payload
- Bridge failure returns `SCRIPT_ERROR` with error message
- Bridge exception returns `SCRIPT_ERROR`
- Handler exported in `dialogHandlers` map as `ONPRINT`
- Registered via `registerDialogHandlers`

### Parser tests (`tests/unit/parser.test.ts`)
- `ONPRINT` parses with type `ONPRINT`
- Listed in complete command type coverage test
