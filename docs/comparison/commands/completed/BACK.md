# BACK Command Comparison

## Syntax

```
BACK
```

**Old regex**: `^\\s*$`
- No parameters — the regex accepts only optional whitespace after the command name.

**New parser**: Zero-parameter command — listed under "no validation required" in `parser.ts:929`.

## Parameters

None. The BACK command takes no parameters in either implementation.

## Old Implementation (MacroPlayer.js:192-196)

```javascript
MacroPlayer.prototype.RegExpTable["back"] = "^\\s*$";

MacroPlayer.prototype.ActionTable["back"] = function (cmd) {
    getWebNavigation().goBack();
};
```

### Step-by-step logic (old)

1. **Parse**: Regex `^\\s*$` matches an empty parameter string (or whitespace only), meaning no parameters are accepted.
2. **Execute**: Calls `getWebNavigation().goBack()` which returns the Firefox XPCOM `nsIWebNavigation` interface for the current browser tab and invokes its `goBack()` method.
3. **No return value**: The function returns `undefined` (no explicit return). The player proceeds to the next action.
4. **No error handling**: If there is no history to go back to, `goBack()` may silently fail or throw an XPCOM exception — the old implementation does not catch this.

### `getWebNavigation()` (Firefox XPCOM)

The `getWebNavigation()` helper returns the `nsIWebNavigation` interface of the current browser's content area, providing methods like `goBack()`, `goForward()`, `reload()`, and `stop()`. This is a Firefox-specific API.

## New Implementation

### Command Handler (navigation.ts:310-335)

```typescript
export const backHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  ctx.log('info', 'Navigating back');

  const response = await sendBrowserMessage({ type: 'goBack' }, ctx);

  if (!response.success) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: response.error || 'Failed to navigate back',
    };
  }

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
  };
};
```

### Browser Message Interface (navigation.ts:64-66)

```typescript
export interface GoBackMessage extends BrowserMessage {
  type: 'goBack';
}
```

### Extension Background Handler (background.ts:484-488)

```typescript
case 'goBack': {
  await chrome.tabs.goBack(targetTabId);
  result = { success: true };
  break;
}
```

### Step-by-step logic (new)

1. **Log**: Logs `'Navigating back'` at info level.
2. **Send message**: Sends a `{ type: 'goBack' }` message via `sendBrowserMessage()`, which routes to the Chrome extension's background script.
3. **Extension handles**: The background script calls `chrome.tabs.goBack(targetTabId)` — the Chrome Extensions API equivalent of the old Firefox XPCOM `nsIWebNavigation.goBack()`.
4. **Error handling**: If the browser message response indicates failure, returns a `SCRIPT_ERROR` with the error message. Otherwise returns success with `OK` error code.

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Browser API** | Firefox XPCOM `nsIWebNavigation.goBack()` | Chrome Extensions `chrome.tabs.goBack()` | Platform difference — Firefox vs Chrome. Same end behavior. |
| **Async model** | Synchronous function call | `async/await` with message passing | Structural: new sends a message to the background script and awaits the response. |
| **Error handling** | None — no try/catch, no return value | Returns `{ success: false, errorCode: SCRIPT_ERROR }` on failure | **Improvement**: New implementation gracefully handles errors; old would throw unhandled XPCOM exceptions. |
| **Logging** | None | Logs `'Navigating back'` at info level | Minor: new provides observability. |
| **Tab targeting** | Operates on current focused tab implicitly | Explicitly targets `targetTabId` from execution context | Same behavior in practice — both navigate the active tab. |
| **Command registration** | `ActionTable["back"]` (lowercase) | `navigationHandlers.BACK` (uppercase) | Internal naming convention only. Parser handles case mapping. |

## Output / Side Effects

- **Navigation**: Navigates the current tab to the previous page in browser history
- **No variables modified**
- **No DOM side effects** (beyond the page navigation itself)
- **No return data**: Neither implementation produces extract data or modifies macro variables

## Test Coverage

### Parser tests (`tests/unit/parser.test.ts`)
- Parses `BACK` command with no parameters (line 650)
- Handles trailing whitespace: `BACK   ` (line 1268)
- Serializes back to `BACK` string (line 1324)
- Included in supported commands list (line 878)

### Native host bridge tests (`tests/unit/native-host-bridge.test.ts`)
- `BACK navigates back` — verifies `goBack` is called and result is successful (line 389)
