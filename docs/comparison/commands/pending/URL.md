# URL Command Comparison

## Syntax

```
URL GOTO=<url>
```

**Old regex**: `"^goto\\s*=\\s*(<im_strre>)\\s*$"` — case-insensitive. One capture group: (1) the URL value. Where `im_strre` = `"(?:\"(?:[^\"\\\\]|\\\\[0btnvfr\"\'\\\\])*\"|eval\\s*\\(\"(?:[^\"\\\\]|\\\\[\\w\"\'\\\\])*\"\\)|\\S*)"` (matches quoted strings with escapes, `eval()` expressions, or non-whitespace tokens).

**New parser**: Key-value parameter command — `parser.ts:624-633` validates that the GOTO parameter is present. Also supports `URL CURRENT` (no GOTO required for that form).

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `GOTO=<url>` | Yes (for navigation) | URL to navigate to. Auto-prefixes `http://` if no scheme is present. Supports variable expansion via `{{!VAR}}`. |
| `CURRENT` | No (alternative form) | Retrieves the current page URL and stores it in `!URLCURRENT`. Not present in old implementation as a command parameter. |

## Old Implementation (MacroPlayer.js:3236-3274)

```javascript
MacroPlayer.prototype.RegExpTable["url"] =
    "^goto\\s*=\\s*("+im_strre+")\\s*$";

MacroPlayer.prototype.ActionTable["url"] = function (cmd) {
    var param = imns.unwrap(this.expandVariables(cmd[1])), scheme = null;

    if (!/^([a-z]+):.*/i.test(param)) {
        param = "http://"+param;
    }

    var ios = imns.Cc["@mozilla.org/network/io-service;1"]
        .getService(imns.Ci.nsIIOService);
    try {
        ios.newChannel(param, null, null);
    } catch (e) {
        Components.utils.reportError(e);
        throw new BadParameter("The URL syntax is not correct: '"+param+"'");
    }

    try {
        if (this.shouldWaitDownloadDlg) {
            this.shouldWaitDownloadDlg = false;
            this.waitingForDownloadDlg = true;
        }

        gBrowser.loadURI(param, null, null);
    } catch (e) {
        var s = e.toString();
        if (/NS_ERROR_FILE_NOT_FOUND/.test(s))
            throw new RuntimeError("File "+param+" not found", 930);
        else
            throw e;
    }
};
```

### Step-by-step logic (old)

1. **Parse URL parameter**: Regex captures the GOTO value (group 1). The value is unwrapped via `imns.unwrap()` and variables are expanded via `this.expandVariables()`.
2. **Auto-prefix scheme**: Tests URL against `/^([a-z]+):.*/i`. If no scheme is detected (no `<letters>:` prefix), prepends `http://`. This means URLs like `example.com` become `http://example.com`, and URLs like `ftp://host` or `file:///path` are left as-is.
3. **Validate URL syntax**: Uses Firefox's `nsIIOService.newChannel()` to validate the URL. If the URL is malformed, the service throws, and the handler catches it and throws `BadParameter("The URL syntax is not correct: '<url>'")`.
4. **Handle download dialog**: If `shouldWaitDownloadDlg` flag is set (from a preceding ONDOWNLOAD command), transitions to `waitingForDownloadDlg` state before navigation. This coordinates URL navigation that triggers a file download.
5. **Navigate browser**: Calls `gBrowser.loadURI(param, null, null)` to navigate the current tab to the URL.
6. **Handle navigation errors**: Catches navigation exceptions. If the error is `NS_ERROR_FILE_NOT_FOUND`, throws `RuntimeError("File <url> not found", 930)`. Other errors are re-thrown.

### `!URLCURRENT` in old (MacroPlayer.js:5000-5001)

The old implementation does not set `!URLCURRENT` during URL navigation. Instead, `!URLCURRENT` is resolved dynamically when referenced in a variable expansion:

```javascript
} else if ( t = var_name.match(/^!urlcurrent$/i) ) {
    return window.content.document.location.toString();
}
```

This returns the browser's current `document.location` at the time of variable access, not a stored value from the last URL command.

### `requestURL` tracking (MacroPlayer.js:3734)

The old implementation tracks the URL being loaded via `this.requestURL`, but this is set by the page load listener (not by the URL command itself):

```javascript
this.requestURL = url;
```

This is used for error reporting (e.g., page timeout messages include the URL).

## New Implementation

### Command Handler (navigation.ts:241-308)

```typescript
export const urlHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const gotoParam = ctx.getParam('GOTO');
  const currentParam = ctx.command.parameters.some(
    p => p.key.toUpperCase() === 'CURRENT'
  );

  if (currentParam) {
    // URL CURRENT - get current URL
    const response = await sendBrowserMessage({ type: 'getCurrentUrl' }, ctx);
    if (!response.success) {
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
        errorMessage: response.error || 'Failed to get current URL',
      };
    }
    const url = response.data?.url || '';
    ctx.variables.setUrl('current', url);
    return { success: true, errorCode: IMACROS_ERROR_CODES.OK, output: url };
  }

  if (gotoParam) {
    let url = ctx.expand(gotoParam);
    // Auto-prefix http:// for URLs without a scheme
    if (url && !url.includes('://') && !url.startsWith('about:')) {
      url = 'http://' + url;
    }
    const response = await sendBrowserMessage({ type: 'navigate', url }, ctx);
    if (!response.success) {
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.PAGE_TIMEOUT,
        errorMessage: response.error || `Failed to navigate to ${url}`,
      };
    }
    ctx.variables.setUrl('current', url);
    return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
  }

  return {
    success: false,
    errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
    errorMessage: 'URL command requires GOTO or CURRENT parameter',
  };
};
```

### Message Bridge (navigation.ts:207-230)

The handler delegates to a `BrowserBridge` via message passing:
```typescript
async function sendBrowserMessage(
  message: BrowserMessagePayload,
  ctx: CommandContext
): Promise<BrowserOperationResponse>
```
If no bridge is configured, logs a warning and returns success (for testing/development). If the bridge throws, catches the error and returns a failure response.

### Step-by-step logic (new)

1. **Check for CURRENT parameter**: If the command has a `CURRENT` flag parameter, sends a `getCurrentUrl` message to the browser bridge, stores the result in `!URLCURRENT` via `ctx.variables.setUrl('current', url)`, and returns the URL as output.
2. **Check for GOTO parameter**: If GOTO is present, expands variables in the value via `ctx.expand()`.
3. **Auto-prefix scheme**: Checks if the URL contains `://` or starts with `about:`. If neither, prepends `http://`. This differs slightly from old: old checks for `<letters>:` prefix; new checks for `://` substring.
4. **Navigate via bridge**: Sends a `navigate` message with the URL to the browser bridge.
5. **Update `!URLCURRENT`**: After successful navigation, stores the navigated URL in `!URLCURRENT` via `ctx.variables.setUrl('current', url)`.
6. **Handle errors**: Navigation failure returns `PAGE_TIMEOUT` error code. Missing parameters return `MISSING_PARAMETER`.

### Parser Validation (parser.ts:624-633)

```typescript
case 'URL': {
  const gotoParam = command.parameters.find(p => p.key.toUpperCase() === 'GOTO');
  if (!gotoParam) {
    return {
      lineNumber: command.lineNumber,
      message: 'URL command requires GOTO parameter',
      raw: command.raw,
    };
  }
  break;
}
```

**Note**: The parser validation currently requires GOTO even for `URL CURRENT`. The handler itself accepts both forms, so `URL CURRENT` works at runtime but may produce a parse validation warning.

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **`URL CURRENT` support** | Not a command form. `!URLCURRENT` is resolved dynamically from `window.content.document.location` when the variable is accessed | Explicit `URL CURRENT` command sends `getCurrentUrl` message to browser and stores result in `!URLCURRENT` | **Enhancement**: Explicit command to query current URL. Old behavior of dynamic resolution means `!URLCURRENT` always reflects the live browser URL at access time. |
| **`!URLCURRENT` behavior** | Dynamically reads `document.location.toString()` on each access — always returns the browser's actual current URL | Stored value: set by `URL GOTO` (to the navigated URL) and by `URL CURRENT` (to the bridge response). Not updated by other navigation (e.g., user clicking links). | **Behavioral difference**: In old, `!URLCURRENT` reflects the actual page URL even after redirects or user navigation. In new, it reflects the last URL set by a URL command. |
| **Scheme detection** | `/^([a-z]+):.*/i` — checks for any `<letters>:` prefix (e.g., `http:`, `ftp:`, `file:`, `javascript:`) | `!url.includes('://')` — checks for `://` substring | **Behavioral difference**: Old considers `mailto:user@host` as having a scheme (no prefix added). New would prefix it with `http://` since `mailto:user@host` doesn't contain `://`. Old considers `C:\path` as having a scheme (`C:`); new would also not prefix it (no `://`). In practice, most real URLs use `://` schemes so the difference is minimal. |
| **`about:` URL handling** | Treated as having a scheme by the old regex (`about:` matches `^([a-z]+):.*/i`) | Explicitly checked: `!url.startsWith('about:')` prevents prefixing | **Equivalent**: Both correctly handle `about:blank` and similar. |
| **URL validation** | Uses `nsIIOService.newChannel()` to validate URL syntax; throws `BadParameter` for invalid URLs | No explicit URL validation — passes URL directly to browser bridge | **Behavioral difference**: Old validates URL format before navigation; new relies on the browser to handle invalid URLs. |
| **Download dialog coordination** | Checks `shouldWaitDownloadDlg` flag and transitions to `waitingForDownloadDlg` state before navigation | Not handled in URL command; download coordination is in the ONDOWNLOAD handler | **Structural**: Different architecture, but functionally equivalent. Download coordination is handled at a different layer in the new implementation. |
| **File not found error** | Catches `NS_ERROR_FILE_NOT_FOUND` and returns error code 930 | Returns `PAGE_TIMEOUT` for all navigation failures | **Behavioral difference**: Old distinguishes file-not-found from other errors. New uses a single error code for all navigation failures. |
| **Error codes** | Throws `BadParameter` for invalid URL syntax; `RuntimeError(930)` for file not found | `PAGE_TIMEOUT` for navigation failure; `MISSING_PARAMETER` for missing GOTO/CURRENT; `SCRIPT_ERROR` for getCurrentUrl failure | **Structural**: Different error taxonomy. |
| **Variable expansion** | `imns.unwrap(this.expandVariables(cmd[1]))` — expands variables then unwraps | `ctx.expand(gotoParam)` — expands variables in GOTO value | **Equivalent**: Both expand `{{!VAR}}` references in the URL value. |
| **Navigation mechanism** | `gBrowser.loadURI(param, null, null)` — Firefox XUL API | `sendBrowserMessage({ type: 'navigate', url })` — message to Chrome extension background script | **Structural**: Chrome extension uses `chrome.tabs.update()` API instead of XUL. |
| **No bridge configured** | N/A (XUL API is always available) | Returns success with a warning log | **Improvement**: Graceful fallback for development/testing without extension. |
| **Async model** | Synchronous (page load completion is handled by a separate listener) | Async with `await` | **Structural**: Consistent with message-passing architecture. |
| **Command registration** | `ActionTable["url"]` (lowercase) | `navigationHandlers.URL` (uppercase) | Internal naming convention only. |

## Output / Side Effects

- **Navigation**: Loads the specified URL in the current browser tab
- **Variables modified**: `!URLCURRENT` — set to the navigated URL (GOTO) or the current page URL (CURRENT)
- **Download coordination**: Old transitions download dialog state; new handles this separately
- **Return data**: `URL CURRENT` returns the URL as `output` in the new implementation

## Test Coverage

### Parser tests (`tests/unit/parser.test.ts`)
- Parses `URL GOTO=http://example.com` — type is `'URL'`, GOTO param is `'http://example.com'` (line 148-153)
- Parses `URL GOTO=http://demo.imacros.net/Automate/TestForm1` — complex URL (line 155-159)
- Parses `URL GOTO={{!URLSTART}}` — variable reference in GOTO value (line 161-167)
- Validates URL requires GOTO — `URL` alone produces error mentioning `GOTO` (line 169-173)
- Mixed case: `url GOTO=http://example.com` parses as `URL` command (line 1274-1276)
- URL with query parameters: `URL GOTO=http://example.com/page?foo=bar&baz=qux` (line 1291-1295)
- Serialization roundtrip for `URL GOTO=http://example.com` (line 1654-1658)
- Serialization roundtrip for `URL GOTO={{!URLSTART}}` with variable references (line 1698-1702)
- Included in supported commands list (line 878)

### Integration tests (`tests/integration/commands/navigation.test.ts`)

**URL GOTO via BrowserBridge (line 462-702):**
- `URL GOTO=https://example.com` sends navigate message and sets `!URLCURRENT` (line 501)
- `URL GOTO=example.com` auto-prefixes `http://` when no scheme (line 518)
- `URL GOTO=http://example.com` preserves existing `http://` scheme (line 535)
- `URL GOTO=https://example.com` preserves existing `https://` scheme (line 544)
- `URL GOTO=about:blank` does not prefix `about:` URLs (line 553)
- `URL GOTO=example.com/path?q=test` auto-prefixes URL with path but no scheme (line 562)
- `URL GOTO={{!VAR1}}` with variable expansion resolves before navigating (line 571)
- `URL CURRENT` sends `getCurrentUrl` and stores result in `!URLCURRENT` (line 591)
- `URL` without GOTO or CURRENT returns `MISSING_PARAMETER` (line 607)
- Bridge failure for GOTO returns `PAGE_TIMEOUT` (line 619)
- Bridge failure for CURRENT returns `SCRIPT_ERROR` (line 634)
- `URL GOTO` followed by `URL CURRENT` — both update `!URLCURRENT`, last write wins (line 649)
- Bridge exception is caught and reported as `PAGE_TIMEOUT` (line 689)

**URL Command class tests (line 206-287):**
- Navigate with `https://` URL (line 215)
- Auto-prefix `https://` when protocol missing (line 223)
- Preserve `http://` protocol (line 230)
- Handle `about:` URLs (line 237)
- Navigation history tracking (line 244)
- Error for empty URL (line 257)
- Error for invalid URL type (line 261)
- URLs with query parameters (line 267)
- URLs with hash fragments (line 274)
- URLs with special characters/encoding (line 281)
