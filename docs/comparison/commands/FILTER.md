# FILTER Command Comparison

## Syntax

```
FILTER TYPE=<type> [STATUS=<ON|OFF>]
```

**Old regex**: `^type\s*=\s*(\S+)\s+status\s*=\s*(\S+)\s*$`
- Two capture groups: TYPE (group 1), STATUS (group 2)
- Both parameters are positional and required in the regex (no optional STATUS)

**New parser**: Key-value parameter command — `parser.ts:730-739` validates that the TYPE parameter is present. STATUS is optional (defaults to ON in the handler).

## Parameters

| Parameter | Required | Values | Description |
|-----------|----------|--------|-------------|
| TYPE | Yes | IMAGES, FLASH, POPUPS, NONE | Content type to filter |
| STATUS | Old: Yes, New: No (defaults to ON) | ON, OFF | Enable or disable the filter |

## Old Implementation (MacroPlayer.js:796-825)

```javascript
MacroPlayer.prototype.RegExpTable["filter"] = "^type\\s*=\\s*(\\S+)\\s+"+
    "status\\s*=\\s*(\\S+)\\s*$";

function getRequestWatcher() {
    var watcher = null;
    try {
        watcher = imns.Cc["@iopus.com/requestwatcher;1"];
        watcher = watcher.getService(imns.Ci.nsISupports);
        watcher = watcher.wrappedJSObject;
        return watcher;
    } catch (e) {
        Components.utils.reportError(e);
        throw "Can't instantiate RequestWatcher!";
    }
}

MacroPlayer.prototype.ActionTable["filter"] = function (cmd) {
    var param = imns.unwrap(this.expandVariables(cmd[2]));
    if (this.shouldFilterImages) {
        var watcher = getRequestWatcher();
        if (!/^images$/i.test(cmd[1])) {
            throw new BadParameter("TYPE=IMAGES", 1);
        }
        if (/^on$/i.test(param))
            watcher.enableImageFilter();
        else
            watcher.enableImageFilter(false);
    }
};
```

### Step-by-step logic (old)

1. **Parse parameters**: Regex captures TYPE (group 1) and STATUS (group 2). STATUS is expanded via `this.expandVariables()` and unwrapped via `imns.unwrap()`. TYPE (`cmd[1]`) is used raw (no variable expansion).
2. **Check `shouldFilterImages` flag**: This boolean is initialized to `true` in `MacroPlayer.init()` (line 4752) and toggled by `SET !IMAGEFILTER ON/OFF` (line 2055-2056). If `false`, the entire command is silently skipped (no-op).
3. **Get RequestWatcher**: Obtains an XPCOM service (`@iopus.com/requestwatcher;1`) that intercepts HTTP requests. If the service can't be instantiated, throws `"Can't instantiate RequestWatcher!"`.
4. **Validate TYPE**: Only `IMAGES` (case-insensitive) is accepted. Any other TYPE throws `BadParameter("TYPE=IMAGES", 1)`.
5. **Apply filter**: If STATUS matches `on` (case-insensitive), calls `watcher.enableImageFilter()` (enable blocking). Otherwise calls `watcher.enableImageFilter(false)` (disable blocking).

### Key details

- **Only TYPE=IMAGES supported**: Despite the generic regex accepting any TYPE value, the action handler explicitly rejects anything other than `IMAGES`. FLASH, POPUPS, and NONE are not implemented.
- **`shouldFilterImages` flag**: Defaults to `true` at macro start. When `SET !IMAGEFILTER ON` is used, it stays `true`. When `SET !IMAGEFILTER OFF` is used, it becomes `false`, which causes FILTER to silently do nothing. This is a gate/guard mechanism — the idea is that `!IMAGEFILTER` must be explicitly enabled for FILTER to work. However, since the default is `true`, FILTER works without any SET unless `!IMAGEFILTER` is explicitly disabled.
- **XPCOM dependency**: Uses Firefox/Gecko's XPCOM component system (`nsISupports`, `Components.utils`). This is specific to the Firefox/XUL-based extension architecture.
- **Variable expansion on STATUS only**: TYPE (`cmd[1]`) is not variable-expanded; STATUS (`cmd[2]`) is expanded via `expandVariables()`.

## New Implementation

### Command Handler (browser.ts:436-545)

```typescript
const VALID_FILTER_TYPES: Set<string> = new Set(['IMAGES', 'FLASH', 'POPUPS', 'NONE']);

export const filterHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const typeParam = ctx.getParam('TYPE');
  const statusParam = ctx.getParam('STATUS');

  if (!typeParam) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'FILTER requires TYPE parameter (IMAGES, FLASH, POPUPS, or NONE)',
    };
  }

  const filterType = typeParam.toUpperCase() as FilterType;

  if (!VALID_FILTER_TYPES.has(filterType)) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
      errorMessage: `Invalid TYPE: ${typeParam}. Valid types are: IMAGES, FLASH, POPUPS, NONE`,
    };
  }

  // For NONE type, disable all filters
  if (filterType === 'NONE') {
    ctx.log('info', 'Disabling all content filters');
    const filterTypes: FilterType[] = ['IMAGES', 'FLASH', 'POPUPS'];
    for (const ft of filterTypes) {
      const response = await sendBrowserCommandMessage(
        { type: 'setFilter', filterType: ft, status: 'OFF' },
        ctx
      );
      if (!response.success) {
        ctx.log('warn', `Failed to disable ${ft} filter: ${response.error}`);
      }
    }
    return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
  }

  // For IMAGES type, check !IMAGEFILTER variable
  if (filterType === 'IMAGES') {
    const imageFilter = ctx.variables.get('!IMAGEFILTER');
    if (!imageFilter || imageFilter === '') {
      ctx.log('info', 'FILTER TYPE=IMAGES skipped: !IMAGEFILTER is not set');
      return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
    }
  }

  const status: FilterStatus = statusParam?.toUpperCase() === 'OFF' ? 'OFF' : 'ON';

  ctx.log('info', `Setting ${filterType} filter to ${status}`);
  const response = await sendBrowserCommandMessage(
    { type: 'setFilter', filterType, status },
    ctx
  );

  if (!response.success) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: response.error || `Failed to set ${filterType} filter`,
    };
  }

  ctx.log('info', `${filterType} filter set to ${status}`);
  return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
};
```

### Message Bridge (browser.ts:305-328)

The handler delegates to a `BrowserCommandBridge` via message passing:
```typescript
async function sendBrowserCommandMessage(
  message: BrowserCommandPayload,
  ctx: CommandContext
): Promise<BrowserCommandResponse>
```
If no bridge is configured, logs a warning and returns success (for testing/development). If the bridge throws, catches the error and returns a failure response.

### Step-by-step logic (new)

1. **Validate TYPE parameter**: Returns `MISSING_PARAMETER` if TYPE is not provided. Case-insensitive comparison via `.toUpperCase()`.
2. **Validate TYPE value**: Checks against `VALID_FILTER_TYPES` set (`IMAGES`, `FLASH`, `POPUPS`, `NONE`). Returns `INVALID_PARAMETER` for unknown types.
3. **Handle NONE**: If TYPE=NONE, sends three `setFilter` messages to disable IMAGES, FLASH, and POPUPS. Logs warnings for individual failures but returns success overall.
4. **Check `!IMAGEFILTER` for IMAGES**: If TYPE=IMAGES, checks `!IMAGEFILTER` variable. If the variable is not set or empty, silently skips (returns success with no action).
5. **Determine STATUS**: Defaults to `ON` if STATUS parameter is omitted. Only `OFF` (case-insensitive) sets it to `OFF`; everything else results in `ON`.
6. **Send filter message**: Sends a `setFilter` message to the browser command bridge with `filterType` and `status`.
7. **Handle errors**: Bridge failure returns `SCRIPT_ERROR`. Bridge exceptions are caught and returned as `SCRIPT_ERROR`.

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Supported filter types** | Only `IMAGES` — throws `BadParameter` for anything else | `IMAGES`, `FLASH`, `POPUPS`, `NONE` all supported | **Enhancement**: Broader content filtering. Old only supported image filtering despite the syntax allowing other types. |
| **STATUS parameter** | Required by regex — parse error if omitted | Optional — defaults to `ON` if omitted | **Enhancement**: Simpler syntax. `FILTER TYPE=POPUPS` is valid (defaults to ON). |
| **`!IMAGEFILTER` gate behavior** | `shouldFilterImages` defaults to `true` at macro start; `SET !IMAGEFILTER OFF` disables it. FILTER works without any SET command. | Checks if `!IMAGEFILTER` variable is set and non-empty. FILTER TYPE=IMAGES is skipped if `!IMAGEFILTER` has never been set. | **Behavioral difference**: In old, FILTER TYPE=IMAGES works by default. In new, you must `SET !IMAGEFILTER YES` first. This means existing macros using `FILTER TYPE=IMAGES` without a prior `SET !IMAGEFILTER` will silently do nothing in Remastered. |
| **`!IMAGEFILTER` gate scope** | Gate applies to ALL filter types (the entire handler is wrapped in `if (this.shouldFilterImages)`) | Gate applies only to TYPE=IMAGES; FLASH and POPUPS are not gated | **Behavioral difference**: In old, `SET !IMAGEFILTER OFF` disables all FILTER commands. In new, it only affects TYPE=IMAGES. |
| **TYPE=NONE** | Not supported (throws `BadParameter`) | Sends three messages to disable IMAGES, FLASH, and POPUPS filters | **Enhancement**: Bulk filter disable. |
| **Variable expansion on TYPE** | TYPE (`cmd[1]`) is not variable-expanded | TYPE is read via `ctx.getParam('TYPE')` (raw value, no expansion) | **Equivalent**: Neither expands variables in TYPE. |
| **Variable expansion on STATUS** | STATUS (`cmd[2]`) is expanded via `expandVariables()` | STATUS is read via `ctx.getParam('STATUS')` (raw value, no expansion) | **Behavioral difference**: Old expands `{{!VAR}}` in STATUS; new does not. |
| **Error handling** | Throws `BadParameter` for invalid TYPE; `"Can't instantiate RequestWatcher!"` for service failure | Returns structured error codes: `MISSING_PARAMETER`, `INVALID_PARAMETER`, `SCRIPT_ERROR` | **Improvement**: Graceful error handling instead of thrown exceptions. |
| **Content blocking mechanism** | XPCOM `RequestWatcher` service (`@iopus.com/requestwatcher;1`) — Firefox-specific | `BrowserCommandBridge` message passing to Chrome extension background script | **Structural**: Chrome extensions use `webRequest` API instead of XPCOM. |
| **No bridge configured** | N/A (XPCOM service is required; throws if unavailable) | Returns success with a warning log | **Improvement**: Graceful fallback for development/testing without extension. |
| **Logging** | None | Logs filter operations at info level, failures at warn level | **Improvement**: Observability. |
| **Async model** | Synchronous | Async with `await` | **Structural**: Consistent with message-passing architecture. |
| **Command registration** | `ActionTable["filter"]` (lowercase) | `browserHandlers.FILTER` (uppercase) | Internal naming convention only. |

## Output / Side Effects

- **Content filtering**: Enables or disables content blocking for images, Flash, or popups
- **Variables modified**: None (reads `!IMAGEFILTER` but does not modify it)
- **Return data**: Neither old nor new returns meaningful output data

## Test Coverage

### Parser tests (`tests/unit/parser.test.ts`)
- Parses `FILTER TYPE=IMAGES STATUS=ON` — type is `'FILTER'`, TYPE param is `'IMAGES'` (line 572-577)
- Parses `FILTER TYPE=IMAGES STATUS=OFF` — STATUS param is `'OFF'` (line 579-583)
- Validates FILTER requires TYPE — `FILTER STATUS=ON` produces error mentioning `TYPE` (line 585-589)
- Included in supported commands list (line 882)

### Integration tests (`tests/integration/commands/filter.test.ts`)

**Basic filter types:**
- `FILTER TYPE=IMAGES` with `!IMAGEFILTER` set sends `setFilter` with `filterType=IMAGES`, `status=ON` (line 44)
- `FILTER TYPE=IMAGES STATUS=ON` sends explicit ON (line 58)
- `FILTER TYPE=IMAGES STATUS=OFF` sends OFF (line 72)
- `FILTER TYPE=IMAGES` without `!IMAGEFILTER` set — sends no messages (silently skipped) (line 86)
- `FILTER TYPE=FLASH STATUS=ON` sends `setFilter` with `filterType=FLASH` (line 97)
- `FILTER TYPE=POPUPS STATUS=ON` sends `setFilter` with `filterType=POPUPS` (line 113)

**FILTER TYPE=NONE:**
- Sends 3 `setFilter` messages: IMAGES OFF, FLASH OFF, POPUPS OFF (line 131)

**Parameter validation:**
- Missing TYPE → `MISSING_PARAMETER` (line 159)
- Unknown TYPE → `INVALID_PARAMETER` (line 168)

**Bridge error handling:**
- Bridge returns failure → `SCRIPT_ERROR` (line 181)
- Bridge throws exception → `SCRIPT_ERROR` (line 193)

**No bridge configured:**
- Returns success when no bridge is configured (testing mode) (line 209)

**Variable expansion:**
- `SET !VAR1 IMAGES` then `FILTER TYPE={{!VAR1}}` → `INVALID_PARAMETER` (variables not expanded in TYPE) (line 222)

**STATUS defaults:**
- `FILTER TYPE=POPUPS` (no STATUS) → defaults to ON (line 248)
