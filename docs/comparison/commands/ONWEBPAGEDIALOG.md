# ONWEBPAGEDIALOG Command Comparison

## Syntax

```
ONWEBPAGEDIALOG BUTTON=OK
ONWEBPAGEDIALOG BUTTON=CANCEL CONTENT="response"
```

**Old regex**: `.*`
- Accepts any parameter string.

**New parser**: Listed in no-validation category (parser.ts:941) — the parser accepts it with any parameters or none.

## Parameters

| Parameter | Description | Old | New |
|-----------|-------------|-----|-----|
| BUTTON | Button to click on web page dialog | Accepted but never used (throws immediately) | OK, CANCEL, YES, NO (defaults to OK if omitted; unrecognized values default to CANCEL) |
| CONTENT | Value to enter in dialog if applicable | Accepted but never used (throws immediately) | Optional string, supports variable expansion via `{{!VAR}}` |

## Old Implementation (MacroPlayer.js:1590-1593)

```javascript
MacroPlayer.prototype.RegExpTable["onwebpagedialog"] = ".*";

MacroPlayer.prototype.ActionTable["onwebpagedialog"] = function (cmd) {
    throw new UnsupportedCommand("ONWEBPAGEDIALOG");
};
```

### Step-by-step logic (old)

1. **Regex match**: The pattern `.*` matches any input after the command name, so `ONWEBPAGEDIALOG BUTTON=OK` or any other parameter combination is accepted by the parser.
2. **Throw UnsupportedCommand**: Immediately throws an `UnsupportedCommand` exception with the command name `"ONWEBPAGEDIALOG"`. No parameter processing occurs.

### Key observations (old)

- **Always unsupported**: The command is recognized by the parser but immediately throws — it was never functional in the Firefox extension.
- **No parameter processing**: Although the regex accepts any parameters, the handler ignores them entirely.
- **UnsupportedCommand exception**: This is a specific error type in iMacros that signals the command is known but not available in the current environment.
- **Firefox limitation**: Web page dialogs (custom modal dialogs from page content) require interception mechanisms that were not available in Firefox's extension API.

## New Implementation

### Handler (dialogs.ts:664-705 — `onWebPageDialogHandler`)

```typescript
export const onWebPageDialogHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const buttonStr = ctx.getParam('BUTTON');
  const button = buttonStr ? parseButton(ctx.expand(buttonStr)) : 'OK';
  const contentStr = ctx.getParam('CONTENT');
  const content = contentStr ? ctx.expand(contentStr) : undefined;

  ctx.log('info', `Configuring web page dialog handler: BUTTON=${button}${content ? `, CONTENT=${content}` : ''}`);

  // Store configuration in state
  ctx.state.setVariable('!WEBPAGE_DIALOG_BUTTON', button);
  if (content) {
    ctx.state.setVariable('!WEBPAGE_DIALOG_CONTENT', content);
  }

  // Send configuration to extension
  const response = await sendDialogMessage(
    {
      type: 'WEBPAGE_DIALOG_CONFIG',
      payload: {
        config: {
          button,
          content,
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
      errorMessage: response.error || 'Failed to configure web page dialog handler',
    };
  }

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
  };
};
```

### Unsupported override (unsupported.ts:110-112)

```typescript
export const onWebPageDialogUnsupportedHandler: CommandHandler = createUnsupportedHandler(
  'ONWEBPAGEDIALOG',
  'Web page dialog handling is not available in browser extensions'
);
```

In the extension context, the unsupported handler overrides the dialog handler (unsupported.ts:204), returning `UNSUPPORTED_COMMAND` error code (-915). The functional handler in `dialogs.ts` is available for non-extension contexts (e.g., native host) where web page dialog interception may be possible.

### Step-by-step logic (new — functional handler)

1. **Parse BUTTON parameter**: Gets the `BUTTON` parameter from the command context. If not provided, defaults to `'OK'`.
2. **Expand variables**: Calls `ctx.expand()` on the button value, allowing macro variables (e.g., `{{!VAR}}`) in the parameter.
3. **Parse button value**: `parseButton()` normalizes the value to uppercase. Valid values: OK, YES, NO, CANCEL. Unrecognized values default to CANCEL.
4. **Parse CONTENT parameter**: Gets the optional `CONTENT` parameter. If provided, expands variables via `ctx.expand()`.
5. **Log configuration**: Logs the configured button (and content if present) at info level.
6. **Store in state**: Sets `!WEBPAGE_DIALOG_BUTTON` variable, and conditionally sets `!WEBPAGE_DIALOG_CONTENT` if content was provided.
7. **Send to extension**: Sends a `WEBPAGE_DIALOG_CONFIG` message through the dialog bridge with `{ button, content, active: true }`.
8. **Handle response**: If the bridge returns failure, returns `SCRIPT_ERROR` with the error message. Otherwise returns `OK`.

### Step-by-step logic (new — unsupported handler)

1. **Return error immediately**: Returns `{ success: false, errorCode: UNSUPPORTED_COMMAND (-915) }` with message `"ONWEBPAGEDIALOG is not supported: Web page dialog handling is not available in browser extensions"`.

### Message flow

```
onWebPageDialogHandler → sendDialogMessage → DialogBridge.sendMessage
                                              ↓
                                       Extension background script
                                       (configures web page dialog handling)
```

### Data types

```typescript
interface WebPageDialogConfig {
  button: DialogButton;    // 'OK' | 'CANCEL' | 'YES' | 'NO'
  content?: string;        // Optional value to enter in dialog
  active: boolean;         // Whether this config is active
}
```

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Behavior** | Always throws `UnsupportedCommand` | Two handlers: functional (dialogs.ts) and unsupported override (unsupported.ts) | **Structural**: Architecture allows future support |
| **Extension context** | Throws `UnsupportedCommand` | Returns `UNSUPPORTED_COMMAND` error (-915) | **Compatible**: Same end result — command fails with unsupported error |
| **Error mechanism** | Exception thrown | Error result returned (no exception) | **Structural**: Different error flow, same user-visible outcome |
| **Parameter processing** | None — parameters ignored | BUTTON and CONTENT parsed, validated, expanded with variable support | **Enhancement**: Parameters are processed even if ultimately unsupported in extension |
| **Variable expansion** | N/A | Supports `{{!VAR}}` in BUTTON and CONTENT parameters | **Enhancement**: Consistent with other dialog commands |
| **State storage** | N/A | Sets `!WEBPAGE_DIALOG_BUTTON` and optionally `!WEBPAGE_DIALOG_CONTENT` | **Enhancement**: State tracked for potential future use |
| **Non-extension context** | N/A (Firefox extension only) | Functional handler sends config through dialog bridge | **Enhancement**: Potentially functional outside extension |
| **Default button** | N/A | OK (when BUTTON param omitted) | N/A (old never processes params) |
| **Invalid button** | N/A | Defaults to CANCEL | N/A (old never processes params) |
| **CONTENT support** | N/A | Optional content/value parameter | **Enhancement**: Can pass response text for dialogs that accept input |

## Output / Side Effects

- **Variables modified**: `!WEBPAGE_DIALOG_BUTTON` (set to button value), `!WEBPAGE_DIALOG_CONTENT` (set when CONTENT provided) — in functional handler only
- **Extension context**: Returns `UNSUPPORTED_COMMAND` error — no side effects
- **Non-extension context**: Sends `WEBPAGE_DIALOG_CONFIG` message through dialog bridge
- **No DOM side effects**
- **No navigation side effects**

## Test Coverage

### Unit tests (`tests/unit/dialog-handlers.test.ts`)
- `ONWEBPAGEDIALOG BUTTON=OK` sends `WEBPAGE_DIALOG_CONFIG` with `button=OK, active=true`
- `ONWEBPAGEDIALOG BUTTON=CANCEL CONTENT=response` sends config with `button=CANCEL` and content
- Default to OK when no BUTTON specified
- Config without content when CONTENT not given
- Variable expansion in CONTENT (e.g., `CONTENT={{!VAR1}}` resolves to variable value)
- Bridge failure returns `SCRIPT_ERROR`
- Bridge exception returns `SCRIPT_ERROR`
- No bridge configured returns success (testing mode)
- `ONWEBPAGEDIALOG BUTTON=CANCEL CONTENT=myreply` sends CANCEL config with content through bridge

### Unit tests (`tests/unit/unsupported-commands.test.ts`)
- `ONWEBPAGEDIALOG BUTTON=OK` returns `UNSUPPORTED_COMMAND` error in extension context
- Error message contains `"ONWEBPAGEDIALOG"`
- Listed in unsupported handlers map

### Unit tests (`tests/unit/commands/dialogs.test.ts`)
- Default to BUTTON=OK when not provided, sets `!WEBPAGE_DIALOG_BUTTON`
- Uses provided BUTTON value (CANCEL), sets state variable
- Sets `!WEBPAGE_DIALOG_CONTENT` when CONTENT provided
- Does not set `!WEBPAGE_DIALOG_CONTENT` when CONTENT absent
- Includes CONTENT in log message when present
- Does not include CONTENT in log when absent
- Succeeds via bridge with `WEBPAGE_DIALOG_CONFIG` message type
- Returns error when bridge fails (custom error message)
- Uses fallback error message when bridge fails without error text
- Handles bridge exception gracefully
- Handler exported in `dialogHandlers` map
- Registered via `registerDialogHandlers`

### Parser tests (`tests/unit/parser.test.ts`)
- `ONWEBPAGEDIALOG BUTTON=OK` parses with type `ONWEBPAGEDIALOG`
