# REFRESH Command Comparison

## Syntax

```
REFRESH
```

**Old regex**: `^\\s*$`
- No parameters — the regex accepts only optional whitespace after the command name.

**New parser**: Zero-parameter command — listed under "no validation required" in `parser.ts:932`.

## Parameters

None. The REFRESH command takes no parameters in either implementation.

## Old Implementation (MacroPlayer.js:1739-1743)

```javascript
MacroPlayer.prototype.RegExpTable["refresh"] = "^\\s*$";

MacroPlayer.prototype.ActionTable["refresh"] = function (cmd) {
    getWebNavigation().reload(imns.Ci.nsIWebNavigation.LOAD_FLAGS_NONE);
};
```

### Step-by-step logic (old)

1. **Parse**: Regex `^\\s*$` matches an empty parameter string (or whitespace only), meaning no parameters are accepted.
2. **Execute**: Calls `getWebNavigation().reload(imns.Ci.nsIWebNavigation.LOAD_FLAGS_NONE)` which returns the Firefox XPCOM `nsIWebNavigation` interface for the current browser tab and invokes its `reload()` method with `LOAD_FLAGS_NONE` (value `0`), performing a normal reload (not bypassing cache).
3. **No return value**: The function returns `undefined` (no explicit return). The player proceeds to the next action.
4. **No error handling**: If the reload fails, the old implementation does not catch exceptions.

### `getWebNavigation().reload()` (Firefox XPCOM)

The `nsIWebNavigation.reload()` method accepts a flags parameter:
- `LOAD_FLAGS_NONE` (`0`) — Normal reload, may use cache
- `LOAD_FLAGS_BYPASS_CACHE` — Force reload from server (not used here)

The old implementation always performs a normal reload (cache-aware).

## New Implementation

### Command Handler (navigation.ts:345-362)

```typescript
export const refreshHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  ctx.log('info', 'Refreshing page');

  const response = await sendBrowserMessage({ type: 'refresh' }, ctx);

  if (!response.success) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: response.error || 'Failed to refresh page',
    };
  }

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
  };
};
```

### Browser Message Interface (navigation.ts:69-73)

```typescript
export interface RefreshMessage extends BrowserMessage {
  type: 'refresh';
}
```

### Extension Background Handler (background.ts:496-499)

```typescript
case 'refresh': {
  await chrome.tabs.reload(targetTabId);
  result = { success: true };
  break;
}
```

### Step-by-step logic (new)

1. **Log**: Logs `'Refreshing page'` at info level.
2. **Send message**: Sends a `{ type: 'refresh' }` message via `sendBrowserMessage()`, which routes to the Chrome extension's background script.
3. **Extension handles**: The background script calls `chrome.tabs.reload(targetTabId)` — the Chrome Extensions API equivalent of the old Firefox XPCOM `nsIWebNavigation.reload()`. Called without a second argument, `chrome.tabs.reload()` performs a normal reload (not bypassing cache), matching the old `LOAD_FLAGS_NONE` behavior.
4. **Error handling**: If the browser message response indicates failure, returns a `SCRIPT_ERROR` with the error message. Otherwise returns success with `OK` error code.

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Browser API** | Firefox XPCOM `nsIWebNavigation.reload(LOAD_FLAGS_NONE)` | Chrome Extensions `chrome.tabs.reload()` | Platform difference — Firefox vs Chrome. Same end behavior (normal reload, cache-aware). |
| **Async model** | Synchronous function call | `async/await` with message passing | Structural: new sends a message to the background script and awaits the response. |
| **Error handling** | None — no try/catch, no return value | Returns `{ success: false, errorCode: SCRIPT_ERROR }` on failure | **Improvement**: New implementation gracefully handles errors; old would throw unhandled XPCOM exceptions. |
| **Logging** | None | Logs `'Refreshing page'` at info level | Minor: new provides observability. |
| **Tab targeting** | Operates on current focused tab implicitly | Explicitly targets `targetTabId` from execution context | Same behavior in practice — both reload the active tab. |
| **Command registration** | `ActionTable["refresh"]` (lowercase) | `navigationHandlers.REFRESH` (uppercase) | Internal naming convention only. Parser handles case mapping. |
| **Cache bypass** | Explicitly passes `LOAD_FLAGS_NONE` (no cache bypass) | `chrome.tabs.reload()` defaults to normal reload (no `bypassCache` option) | Equivalent — both perform a cache-aware reload. |

## Output / Side Effects

- **Navigation**: Reloads the current page in the active tab
- **No variables modified**
- **No DOM side effects** (beyond the page reload itself)
- **No return data**: Neither implementation produces extract data or modifies macro variables

## Test Coverage

### Parser tests (`tests/unit/parser.test.ts`)
- Parses `REFRESH` command with no parameters (line 656)
- Included in supported commands list (line 878)

### Command handler tests (`tests/unit/command-handlers.test.ts`)
- `REFRESH handler` — calls `bridge.refresh` and returns success (line 227)
- Returns `SCRIPT_ERROR` when `bridge.refresh` throws (line 236)
- Uses default error message when refresh error has no message (line 246)

### Native host bridge tests (`tests/unit/native-host-bridge.test.ts`)
- `refresh sends correct message` — verifies correct commandType is sent (line 85)
- `REFRESH refreshes page` — verifies handler calls bridge.refresh (line 400)

### Integration tests (`tests/integration/commands/navigation.test.ts`)
- `REFRESH sends refresh message via BrowserBridge and succeeds` (line 786)
- `REFRESH returns SCRIPT_ERROR when bridge returns failure` (line 802)
- `REFRESH returns SCRIPT_ERROR when bridge throws an exception` (line 816)
- `URL GOTO followed by REFRESH sends navigate then refresh messages in order` (line 850)
- `URL GOTO + BACK + REFRESH executes all three commands in sequence` (line 869)
- Multi-step navigation sequences including REFRESH (lines 890, 929)

### Integration tests (`tests/integration/commands/browser.test.ts`)
- `REFRESH Command` suite — refresh current page, hard refresh with NOCACHE, multiple refreshes (line 663)
- Browser context refresh tracking and reset behavior (lines 563-658)
- Combined navigation sequences with refresh after back/forward (line 874)
