# CLEAR Command Comparison

## Syntax

```
CLEAR
CLEAR <data-type>
```

**Old regex**: `^\s*$`
- No parameters captured — the command takes no arguments at all.

**New parser**: Optional positional parameters — `params[0].key` = data type keyword (COOKIES, CACHE, HISTORY, ALL, etc.)

## Parameters

| Parameter | Description | Old | New |
|-----------|-------------|-----|-----|
| (none) | Default behavior | Clears cache + all cookies | Clears cache + cookies |
| COOKIES | Clear cookies | N/A (not supported) | `dataTypes=['cookies']` |
| CACHE | Clear cache | N/A (not supported) | `dataTypes=['cache']` |
| HISTORY | Clear browsing history | N/A (not supported) | `dataTypes=['history']` |
| FORMDATA / FORMS | Clear form data | N/A (not supported) | `dataTypes=['formData']` |
| PASSWORDS | Clear saved passwords | N/A (not supported) | `dataTypes=['passwords']` |
| DOWNLOADS | Clear download history | N/A (not supported) | `dataTypes=['downloads']` |
| LOCALSTORAGE | Clear local storage | N/A (not supported) | `dataTypes=['localStorage']` |
| SESSIONSTORAGE | Clear session storage | N/A (not supported) | `dataTypes=['sessionStorage']` |
| INDEXEDDB | Clear IndexedDB | N/A (not supported) | `dataTypes=['indexedDB']` |
| ALL | Clear everything | N/A (not supported) | `dataTypes=['all']` |

## Old Implementation (MacroPlayer.js:200-215)

```javascript
MacroPlayer.prototype.RegExpTable["clear"] = "^\\s*$";

MacroPlayer.prototype.ActionTable["clear"] = function (cmd) {
    if (imns.Ci.nsICacheStorageService) {
        var c = imns.Cc["@mozilla.org/netwerk/cache-storage-service;1"].
            getService(imns.Ci.nsICacheStorageService);
        c.clear();
    } else {
        var cachesvc = imns.Cc["@mozilla.org/network/cache-service;1"]
            .getService(imns.Ci.nsICacheService);
        cachesvc.evictEntries(imns.Ci.nsICache.STORE_ANYWHERE);
    }
    var cookiemgr = imns.Cc["@mozilla.org/cookiemanager;1"]
      .getService(imns.Ci.nsICookieManager);
    cookiemgr.removeAll();
};
```

### Step-by-step logic (old)

1. **Check cache API availability**: Tests if `nsICacheStorageService` exists (newer Firefox XPCOM interface).
2. **Clear cache (new API path)**: If available, gets the cache storage service via XPCOM and calls `clear()` to evict all cached data.
3. **Clear cache (legacy API path)**: Otherwise, uses the older `nsICacheService` interface and calls `evictEntries(STORE_ANYWHERE)` to clear all cache stores (memory, disk, offline).
4. **Clear all cookies**: Gets the cookie manager via XPCOM (`nsICookieManager`) and calls `removeAll()` to delete all cookies across all domains.

### Key observations (old)

- **No parameters**: The regex `^\s*$` accepts only empty input — `CLEAR` with no arguments.
- **Always clears both**: Cache and cookies are always cleared together; no way to clear one without the other.
- **All cookies removed**: `cookiemgr.removeAll()` removes cookies for all sites, not just the current domain.
- **Firefox-specific**: Uses Mozilla XPCOM interfaces (`nsICacheStorageService`, `nsICookieManager`) — only works in Firefox-based environments.
- **No error handling**: Neither the cache clear nor cookie removal is wrapped in try/catch.

## New Implementation

### Parser (parser.ts)

CLEAR is listed in the no-validation category (line 930) — the parser accepts it with any parameters or none.

### Handler (browser.ts:342-393 — `parseClearDataTypes`)

```typescript
function parseClearDataTypes(ctx: CommandContext): ClearDataType[] {
  const params = ctx.command.parameters;

  // No parameters = clear cache and cookies (default)
  if (params.length === 0) {
    return ['cache', 'cookies'];
  }

  const dataTypes: ClearDataType[] = [];

  for (const param of params) {
    const key = param.key.toUpperCase();
    switch (key) {
      case 'COOKIES':   dataTypes.push('cookies'); break;
      case 'CACHE':     dataTypes.push('cache'); break;
      case 'HISTORY':   dataTypes.push('history'); break;
      case 'FORMDATA':
      case 'FORMS':     dataTypes.push('formData'); break;
      case 'PASSWORDS': dataTypes.push('passwords'); break;
      case 'DOWNLOADS': dataTypes.push('downloads'); break;
      case 'LOCALSTORAGE':    dataTypes.push('localStorage'); break;
      case 'SESSIONSTORAGE':  dataTypes.push('sessionStorage'); break;
      case 'INDEXEDDB':       dataTypes.push('indexedDB'); break;
      case 'ALL':       return ['all'];
      default:          break; // Unknown parameter ignored
    }
  }

  // If no recognized parameters, default to cookies
  return dataTypes.length > 0 ? dataTypes : ['cookies'];
}
```

### Handler (browser.ts:407-434 — `clearHandler`)

```typescript
export const clearHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const dataTypes = parseClearDataTypes(ctx);

  ctx.log('info', `Clearing browser data: ${dataTypes.join(', ')}`);

  const response = await sendBrowserCommandMessage(
    {
      type: 'clearData',
      dataTypes,
    },
    ctx
  );

  if (!response.success) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: response.error || 'Failed to clear browser data',
    };
  }

  ctx.log('info', `Cleared browser data: ${dataTypes.join(', ')}`);

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
  };
};
```

### Step-by-step logic (new)

1. **Parse data types**: `parseClearDataTypes()` reads command parameters to determine what to clear. No params defaults to `['cache', 'cookies']`.
2. **Send message to bridge**: Constructs a `clearData` message with the data types and sends it via `sendBrowserCommandMessage()` to the browser extension.
3. **Bridge pattern**: The message goes through a `BrowserCommandBridge` interface. If no bridge is configured (e.g., testing mode), returns success silently.
4. **Error handling**: If the bridge returns failure or throws, the handler returns `{ success: false, errorCode: SCRIPT_ERROR }` with the error message.
5. **Logging**: Logs the clear operation before and after execution.

### Message flow

```
clearHandler → sendBrowserCommandMessage → BrowserCommandBridge.sendMessage
                                          ↓
                                   Extension background script
                                   (uses chrome.browsingData API)
```

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Parameters** | None — regex `^\s*$` rejects any arguments | Supports COOKIES, CACHE, HISTORY, ALL, FORMDATA, FORMS, PASSWORDS, DOWNLOADS, LOCALSTORAGE, SESSIONSTORAGE, INDEXEDDB | **Behavioral**: New is a superset; bare `CLEAR` is backwards-compatible |
| **Default behavior** | Always clears cache + all cookies | Clears cache + cookies (`['cache', 'cookies']`) | **Compatible**: Same default behavior |
| **Granularity** | All-or-nothing (cache + cookies together) | Can clear individual data types | **Enhancement**: More control in new |
| **Cookie scope** | `cookiemgr.removeAll()` — all cookies for all domains | Depends on extension implementation of `chrome.browsingData.removeCookies()` | Likely equivalent (all cookies) but implementation-dependent |
| **Browser API** | Firefox XPCOM (`nsICacheStorageService`, `nsICookieManager`) | Chrome Extension API via bridge (`chrome.browsingData`) | **Structural**: Different browser platform |
| **Error handling** | No error handling — exceptions propagate uncaught | Returns `{ success: false, errorCode: SCRIPT_ERROR }` with error message | **Improvement**: Graceful error reporting |
| **No-bridge fallback** | N/A (always has XPCOM) | Returns success silently if no bridge configured | Allows testing without extension |
| **Unknown parameters** | N/A (no params accepted) | Unknown params silently fall back to clearing cookies | Lenient behavior |
| **Additional data types** | Only cache + cookies | Also supports history, formData, passwords, downloads, localStorage, sessionStorage, indexedDB | **Enhancement**: Beyond original scope |

## Output / Side Effects

- **Variables modified**: None
- **Browser state modified**: Cache cleared, cookies removed (and optionally history, form data, etc. in new)
- **No DOM side effects**
- **No navigation side effects** (page is not reloaded)

## Test Coverage

### Integration tests (`tests/integration/commands/clear.test.ts`)
- `CLEAR` (no params) sends `clearData` with `dataTypes=['cache', 'cookies']`
- `CLEAR COOKIES` sends `dataTypes=['cookies']`
- `CLEAR CACHE` sends `dataTypes=['cache']`
- `CLEAR HISTORY` sends `dataTypes=['history']`
- `CLEAR ALL` sends `dataTypes=['all']`
- `CLEAR FORMDATA` sends `dataTypes=['formData']`
- `CLEAR FORMS` sends `dataTypes=['formData']` (alias)
- Unknown param defaults to cookies
- Bridge failure returns `SCRIPT_ERROR`
- Bridge exception returns `SCRIPT_ERROR`
- No bridge configured returns success (testing mode)
- Multi-command sequence: `CLEAR` then `URL GOTO` works
