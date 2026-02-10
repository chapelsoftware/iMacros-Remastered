# TAB Command Comparison

## Syntax

```
TAB T=<number>
TAB CLOSE
TAB CLOSEALLOTHERS
TAB OPEN
TAB OPEN NEW
TAB NEW OPEN
```

**Old regex**: `"^(t\\s*=\\s*(\\S+)|close|closeallothers|open|open\\s+new|new\\s+open)\\s*$"` — case-insensitive. Captures the full argument in group 1, and the T value in group 2 when `T=` syntax is used.

**New parser**: `parser.ts:675-689` — Validates that at least one recognized parameter is present: `T=<value>`, `CLOSE`, `CLOSEALLOTHERS`, `OPEN`, or `NEW`. Returns a validation error if none found.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `T=<number>` | Tab number to switch to (1-based, relative to `startTabIndex`) |
| `CLOSE` | Close the current tab |
| `CLOSEALLOTHERS` | Close all tabs except the current one |
| `OPEN` | Open a new tab |
| `OPEN NEW` / `NEW OPEN` | Alternate syntax for opening a new tab |

## Old Implementation (MacroPlayer.js:2440-2482)

### Regex

```javascript
MacroPlayer.prototype.RegExpTable["tab"] = "^(t\\s*=\\s*(\\S+)|" +
    "close|closeallothers|open|open\\s+new|new\\s+open" +
    ")\\s*$";
```

Case-insensitive match. Group 1 captures the full argument, group 2 captures the T value when `T=` is used.

### Action handler

```javascript
MacroPlayer.prototype.ActionTable["tab"] = function (cmd) {
    var browser = getBrowser();
    if (/^close$/i.test(cmd[1])) {
        browser.removeCurrentTab();
    } else if (/^closeallothers$/i.test(cmd[1])) {
        let tabs = browser.visibleTabs;
        let tab = browser.selectedTab;
        for (let i = 0; i < tabs.length; i++) {
            if (tabs[i] != tab)
                browser.removeTab(tabs[i]);
        }
        this.startTabIndex = 0;
    } else if (/open/i.test(cmd[1])) {
        browser.addTab();
    } else if (/^t\s*=/i.test(cmd[1])) {
        var n = imns.s2i(this.expandVariables(cmd[2]));
        if (isNaN(n))
            throw new BadParameter("T=<number>", 1);

        var tab_num = n + this.startTabIndex - 1;
        var tabs = browser.tabContainer.childNodes;

        if (tab_num >= 0 && tab_num < tabs.length) {
            browser.selectedTab = tabs[tab_num];
        } else {
            var self = this;
            this.retry(function() {
                if (self.ignoreErrors)
                    return;
                throw new RuntimeError("Tab number " + n +
                    " does not exist", 971);
            }, "waiting for Tab...");
        }
    }

    this.currentWindow = window.content;
};
```

### Step-by-step logic (old)

1. **CLOSE**: Calls `browser.removeCurrentTab()` to close the active tab.
2. **CLOSEALLOTHERS**: Iterates all visible tabs, removes every tab except `browser.selectedTab`, then resets `this.startTabIndex = 0`.
3. **OPEN** (and `OPEN NEW` / `NEW OPEN`): Calls `browser.addTab()` to open a new blank tab.
4. **T=n**:
   a. Expands variables in the T value via `this.expandVariables(cmd[2])`.
   b. Converts to integer via `imns.s2i()`. If `NaN`, throws `BadParameter`.
   c. Computes absolute tab index: `tab_num = n + this.startTabIndex - 1`.
   d. If `tab_num` is within bounds of `browser.tabContainer.childNodes`, selects that tab.
   e. If out of bounds, calls `this.retry()` which retries at 100ms intervals up to `!TIMEOUT_STEP` (or default timeout/10). On exhaustion, throws `RuntimeError("Tab number N does not exist", 971)` unless `ignoreErrors` is set.
5. **All branches**: After execution, sets `this.currentWindow = window.content` to update the current document reference.

### Retry mechanism (old) (MacroPlayer.js:127-152)

```javascript
MacroPlayer.prototype.retry = function(onerror, msg, _timeout) {
    var timeout = _timeout || (
        (this.tagTimeout >= 0) ? this.tagTimeout :
            this.timeout / 10
    );

    if (!this.playingAgain) {
        this.nattempts = Math.round(timeout * 10);
    }

    if (--this.nattempts >= 0) {
        this.playingAgain = true;
        throw new ShouldWaitSignal(100); // retry in 100ms
    } else {
        this.playingAgain = false;
        onerror();
    }
};
```

Retry uses `ShouldWaitSignal` exceptions to re-execute the same command after 100ms. Timeout defaults to `tagTimeout` or `timeout/10`.

### startTabIndex initialization (old) (MacroPlayer.js:4756)

```javascript
this.startTabIndex = getBrowser().mTabContainer.selectedIndex;
```

Set at macro start to the current tab's 0-based index, making `TAB T=1` always refer to the tab where the macro was launched.

### Key details (old)

- `T=<number>` is 1-based from the user's perspective, converted to 0-based via `n + startTabIndex - 1`
- `startTabIndex` is initialized to the selected tab's index when the macro starts
- `CLOSEALLOTHERS` resets `startTabIndex` to 0 because only one tab remains
- `OPEN` does not switch to the new tab — only creates it
- Error code 971 for non-existent tabs (class `RuntimeError`)
- Error code 1 for invalid T parameter (class `BadParameter`)
- `ignoreErrors` mode suppresses the tab-not-found error during retry exhaustion
- `currentWindow` is always updated to `window.content` after any TAB operation

## New Implementation (navigation.ts:364-540)

### Helper: getTabRetryTimeout (navigation.ts:379-387)

```typescript
function getTabRetryTimeout(ctx: CommandContext): number {
    const timeoutStep = ctx.state.getVariable('!TIMEOUT_STEP');
    if (typeof timeoutStep === 'number') return timeoutStep;
    if (typeof timeoutStep === 'string') {
        const parsed = parseFloat(timeoutStep);
        return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
}
```

Returns the `!TIMEOUT_STEP` variable as seconds. Defaults to 0 (no retry) if not set.

### Helper: switchTabWithRetry (navigation.ts:394-429)

```typescript
async function switchTabWithRetry(
    tabIndex: number,
    ctx: CommandContext
): Promise<CommandResult> {
    const timeoutSeconds = getTabRetryTimeout(ctx);
    const retryIntervalMs = 500;
    const deadline = Date.now() + timeoutSeconds * 1000;

    // First attempt
    let response = await sendBrowserMessage({ type: 'switchTab', tabIndex }, ctx);
    if (response.success) {
        return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
    }

    // Retry until timeout
    while (Date.now() < deadline) {
        await sleep(retryIntervalMs);
        response = await sendBrowserMessage({ type: 'switchTab', tabIndex }, ctx);
        if (response.success) {
            return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
        }
    }

    return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.SCRIPT_EXCEPTION, // -971
        errorMessage: response.error || `Tab ${tabIndex + 1} does not exist`,
    };
}
```

### Main handler: tabHandler (navigation.ts:431-540)

```typescript
export const tabHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
    const tParam = ctx.getParam('T');
    const openParam = ctx.command.parameters.some(p => p.key.toUpperCase() === 'OPEN');
    const newParam = ctx.command.parameters.some(p => p.key.toUpperCase() === 'NEW');
    const closeParam = ctx.command.parameters.some(p => p.key.toUpperCase() === 'CLOSE');
    const closeAllOthersParam = ctx.command.parameters.some(
        p => p.key.toUpperCase() === 'CLOSEALLOTHERS'
    );
    // ... dispatch to appropriate sub-handler
};
```

### Step-by-step logic (new)

1. **CLOSEALLOTHERS** (checked first — takes priority):
   a. Sends `{ type: 'closeOtherTabs' }` browser message.
   b. On failure, returns `SCRIPT_ERROR`.
   c. On success, resets `startTabIndex` to 0 via `ctx.state.setStartTabIndex(0)`.
2. **CLOSE**:
   a. Sends `{ type: 'closeTab' }` browser message.
   b. On failure, returns `SCRIPT_ERROR`.
3. **OPEN** (or `NEW` without `T`):
   a. Reads optional `URL` parameter, expands variables if present.
   b. Sends `{ type: 'openTab', url }` browser message.
   c. On failure, returns `SCRIPT_ERROR`.
4. **T=n**:
   a. Parses `T` value via `parseInt(ctx.expand(tParam), 10)`.
   b. If `NaN` or `< 1`, returns `INVALID_PARAMETER`.
   c. Computes absolute index: `startTabIndex + tabIndex - 1`.
   d. Calls `switchTabWithRetry(absoluteIndex, ctx)` which retries at 500ms intervals up to `!TIMEOUT_STEP` seconds. Returns `SCRIPT_EXCEPTION` (-971) on failure.
5. **No recognized parameter**: Returns `MISSING_PARAMETER`.

### Parser validation (parser.ts:675-689)

```typescript
case 'TAB': {
    const tParam = command.parameters.find(p => p.key.toUpperCase() === 'T');
    const hasAction = command.parameters.some(p =>
        /^(CLOSE|CLOSEALLOTHERS|OPEN|NEW)$/i.test(p.key)
    );
    if (!tParam && !hasAction) {
        return {
            lineNumber: command.lineNumber,
            message: 'TAB command requires T parameter or action (CLOSE, CLOSEALLOTHERS, OPEN)',
            raw: command.raw,
        };
    }
    break;
}
```

### State management (state-manager.ts:553-562)

```typescript
getStartTabIndex(): number {
    return this.startTabIndex;  // initialized to 0
}

setStartTabIndex(index: number): void {
    this.startTabIndex = index;
}
```

`startTabIndex` is initialized to 0 and set externally by the extension/host layer to the current tab's index when the macro starts. It is NOT reset by `softReset()`, preserving the start context across macro reruns.

### Browser message types (navigation.ts:76-103)

- `switchTab` — `{ type: 'switchTab', tabIndex: number }` — 0-based absolute index
- `openTab` — `{ type: 'openTab', url?: string }` — optional URL for the new tab
- `closeTab` — `{ type: 'closeTab' }` — closes active tab
- `closeOtherTabs` — `{ type: 'closeOtherTabs' }` — closes all tabs except active

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Architecture** | Direct Firefox `getBrowser()` API calls | Message-passing to browser extension via `sendBrowserMessage()` | **Structural**: Chrome extension model vs. Firefox XUL overlay |
| **Retry interval** | 100ms (`ShouldWaitSignal(100)`) | 500ms (`retryIntervalMs = 500`) | **Behavioral**: New retries less frequently; tab must exist within same timeout window |
| **Retry timeout source** | `tagTimeout` or `timeout/10` (general retry mechanism) | `!TIMEOUT_STEP` variable specifically (0 = no retry) | **Behavioral**: New uses explicit timeout variable; old uses general retry framework |
| **Retry mechanism** | Exception-based (`ShouldWaitSignal`) re-executes command | Async loop with `sleep()` polling | **Structural**: Same concept, different async pattern |
| **Error on bad T value** | `BadParameter("T=<number>", 1)` — error code 1 | `INVALID_PARAMETER` error code | **Compatible**: Both reject non-numeric T values |
| **Error on missing tab** | `RuntimeError("Tab number N does not exist", 971)` | `SCRIPT_EXCEPTION` (-971) with message | **Compatible**: Same error code 971 |
| **ignoreErrors** | Suppresses tab-not-found error (`if (self.ignoreErrors) return`) | Not explicitly handled in `switchTabWithRetry` | **Gap**: Old suppresses error in `!ERRORIGNORE YES` mode; new may not |
| **OPEN with URL** | Not supported — `browser.addTab()` with no URL | Supported — `TAB OPEN URL=<url>` sends URL to extension | **Enhancement**: New supports specifying URL for new tab |
| **OPEN tab activation** | Does not switch to the new tab | Depends on browser extension implementation | **Implementation detail**: Behavior determined by bridge |
| **currentWindow update** | Always sets `this.currentWindow = window.content` after any TAB action | No equivalent — frame context managed separately | **Structural**: Old updates document reference; new relies on message-passing |
| **CLOSEALLOTHERS iteration** | Iterates `browser.visibleTabs`, skips `selectedTab` | Single `closeOtherTabs` message to extension | **Structural**: Extension handles the iteration internally |
| **CLOSEALLOTHERS startTabIndex** | Resets to `0` | Resets to `0` | **Compatible**: Same behavior |
| **startTabIndex init** | Set to `getBrowser().mTabContainer.selectedIndex` at macro start | Set externally to `0` by default; extension/host sets it | **Compatible**: Both use the active tab's index as offset |
| **Priority when multiple params** | First matching regex branch wins (`close` before `closeallothers` before `open` before `t=`) | Explicit priority: CLOSEALLOTHERS > CLOSE > OPEN > T | **Compatible**: New explicitly prioritizes CLOSEALLOTHERS over CLOSE |
| **Parser validation** | Regex-only — invalid arguments silently fail to match | Explicit validation returns error message | **Enhancement**: Better error reporting at parse time |
| **NEW keyword alone** | Not a valid syntax (regex requires `open` or `new open`) | `TAB NEW` treated as `TAB OPEN` (opens new tab) | **Enhancement**: More permissive syntax |

## Output / Side Effects

- **Variables modified**: None directly. `startTabIndex` is reset to 0 on `CLOSEALLOTHERS`.
- **Return value (old)**: No return — direct browser API mutations. Throws `BadParameter` (code 1) for invalid T, `RuntimeError` (code 971) for missing tab. Sets `this.currentWindow = window.content`.
- **Return value (new)**: `{ success: true, errorCode: OK }` on success. Various error results on failure:
  - `INVALID_PARAMETER` for bad T value
  - `SCRIPT_EXCEPTION` (-971) for non-existent tab after retry
  - `SCRIPT_ERROR` for bridge communication failures
  - `MISSING_PARAMETER` for bare `TAB` with no arguments
- **Side effects (old)**: Modifies browser tab state directly (open/close/switch tabs), updates `currentWindow` reference, resets `startTabIndex` on CLOSEALLOTHERS.
- **Side effects (new)**: Sends browser messages via bridge, resets `startTabIndex` on CLOSEALLOTHERS. No direct DOM/browser manipulation.

## Test Coverage

### Unit tests — command handlers (tests/unit/command-handlers.test.ts)

- `T=n` switches to given tab 1-based (line 261)
- `OPEN` opens new tab without URL (line 270)
- `OPEN` with URL param sends URL (line 278)
- `CLOSE` closes current tab (line 286)
- `CLOSEALLOTHERS` closes all other tabs (line 294)
- `T=0` returns `INVALID_PARAMETER` (line 302)
- `T=-1` returns `INVALID_PARAMETER` (line 311)
- `T=abc` returns `INVALID_PARAMETER` (non-numeric) (line 319)
- No recognized parameter returns `MISSING_PARAMETER` (line 328)
- Bridge `switchTab` error returns `SCRIPT_ERROR` (line 336)
- Bridge `openTab` error returns `SCRIPT_ERROR` (line 346)
- Bridge `closeTab` error returns `SCRIPT_ERROR` (line 355)
- Bridge `closeOtherTabs` error returns `SCRIPT_ERROR` (line 365)
- Default error message when bridge throws without message (line 373)
- `CLOSEALLOTHERS` takes priority over `CLOSE` when both present (line 382)
- `OPEN NEW` opens a new tab (line 391)
- `NEW OPEN` opens a new tab (alternate order) (line 399)
- `NEW` alone opens a new tab (line 407)

### Integration tests — navigation (tests/integration/commands/navigation.test.ts)

- `TabCommand` class tests: start with one tab, open, open with URL, activate new tab, close, close specific by ID, error closing last tab, error closing non-existent tab, switch to specific tab, invalid tab index, multiple operations in sequence, activate another tab when active is closed (lines 289-407)
- TAB handler via MacroExecutor with mock BrowserBridge:
  - `TAB T=2` sends `switchTab` with `tabIndex=1` (line 1254)
  - `TAB T=1` sends `switchTab` with `tabIndex=0` (line 1269)
  - `TAB T` with variable expansion `{{!VAR1}}` (line 1282)
  - `TAB T=0` returns `INVALID_PARAMETER` (line 1302)
  - `TAB T=-1` returns `INVALID_PARAMETER` (line 1313)
  - `TAB T=abc` returns `INVALID_PARAMETER` (line 1323)
  - `TAB OPEN` sends `openTab` message (line 1335)
  - `TAB OPEN` with URL param (line 1349)
  - `TAB CLOSE` sends `closeTab` message (line 1364)
  - `TAB CLOSEALLOTHERS` sends `closeOtherTabs` message (line 1380)
  - `TAB` without params returns `MISSING_PARAMETER` (line 1396)
  - `TAB T=2` bridge failure returns `SCRIPT_EXCEPTION` after retry (line 1410)
  - `TAB OPEN` bridge failure returns `SCRIPT_ERROR` (line 1435)
  - `TAB CLOSE` bridge failure returns `SCRIPT_ERROR` (line 1449)
  - `TAB OPEN` then `TAB T=1` multi-command sequence (line 1465)
  - `TAB OPEN NEW` syntax (line 1485)
  - `TAB NEW OPEN` alternate syntax (line 1497)
  - `TAB NEW` alone opens tab (line 1509)
  - `TAB T=n` uses `startTabIndex` for relative indexing (line 1523)
  - `TAB T=3` with `startTabIndex=1` sends correct absolute index (line 1540)
  - `TAB CLOSEALLOTHERS` resets `startTabIndex` to 0 (line 1554)
  - `TAB T=n` retries until tab appears within `!TIMEOUT_STEP` (line 1566)
  - `TAB T=n` returns `SCRIPT_EXCEPTION` (-971) after retry timeout (line 1593)

### Parser tests (tests/unit/parser.test.ts)

- Parse `TAB T=1` (line 180)
- Parse `TAB T=4` (line 187)
- Validate `TAB` requires T parameter (line 193)
- Parse `TAB CLOSE` (line 835)
- Parse `TAB CLOSEALLOTHERS` (line 841)
- Parse `TAB OPEN` (line 847)
