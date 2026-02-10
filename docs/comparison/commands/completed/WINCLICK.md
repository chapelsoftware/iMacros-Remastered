# WINCLICK Command Comparison

## Syntax

```
WINCLICK X=<x> Y=<y> [BUTTON=LEFT|RIGHT|MIDDLE]
```

**Old regex**: `".*"` — matches any arguments (but none are used; immediately throws `UnsupportedCommand`)

**New parser**: `parser.ts:943` — falls through the `break` case in validation, meaning any trailing text/parameters are accepted without validation errors.

## Parameters

| Parameter | Position | Required | Values | Description |
|-----------|----------|----------|--------|-------------|
| X | named | Yes (new) | Integer >= 0 | Absolute screen X coordinate |
| Y | named | Yes (new) | Integer >= 0 | Absolute screen Y coordinate |
| BUTTON | named | No | LEFT, RIGHT, MIDDLE, CENTER | Mouse button to click (default: LEFT) |

Note: The old implementation ignores all parameters (throws immediately). The new winclick handler validates X, Y, and BUTTON parameters.

## Old Implementation (MacroPlayer.js:3336-3339)

```javascript
MacroPlayer.prototype.RegExpTable["winclick"] = ".*";

MacroPlayer.prototype.ActionTable["winclick"] = function (cmd) {
    throw new UnsupportedCommand("WINCLICK");
};
```

The `UnsupportedCommand` error constructor (MacroPlayer.js:24-29):

```javascript
function UnsupportedCommand(msg) {
    this.message = "command " + msg +
        " is not supported in the current version";
    this.name = "UnsupportedCommand";
    this.errnum = 912;
}
UnsupportedCommand.prototype = Error.prototype;
```

### Step-by-step logic (old)

1. **Parse**: Regex `".*"` matches any argument string (greedy, including empty).
2. **Execute**: Immediately throws `UnsupportedCommand("WINCLICK")`.
3. **Error**: Error message = `"command WINCLICK is not supported in the current version"`, error number = `912`.

### Key details (old)

- WINCLICK was **always** unsupported in the iMacros 8.9.7 Chrome/Firefox extension
- The regex `".*"` accepts any trailing text but it is never inspected — the command throws unconditionally
- Error code `912` was the standard "unsupported command" error in the original iMacros
- Originally designed for desktop-level mouse clicks at absolute screen coordinates (iMacros desktop editions)
- No parameter parsing was performed; `X`, `Y`, and `BUTTON` parameters documented in iMacros reference were never used

## New Implementation

The new implementation has two layers:

### 1. Winclick handler (winclick.ts:122-234)

```typescript
export const winClickHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const xStr = ctx.getParam('X');
  if (!xStr) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'WINCLICK command requires X parameter',
    };
  }

  const yStr = ctx.getParam('Y');
  if (!yStr) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'WINCLICK command requires Y parameter',
    };
  }

  const x = parseInt(ctx.expand(xStr), 10);
  const y = parseInt(ctx.expand(yStr), 10);

  if (isNaN(x)) { /* INVALID_PARAMETER error */ }
  if (isNaN(y)) { /* INVALID_PARAMETER error */ }
  if (x < 0) { /* INVALID_PARAMETER error */ }
  if (y < 0) { /* INVALID_PARAMETER error */ }

  let button: 'left' | 'right' | 'middle' = 'left';
  const buttonStr = ctx.getParam('BUTTON');
  if (buttonStr) {
    const buttonUpper = ctx.expand(buttonStr).toUpperCase();
    switch (buttonUpper) {
      case 'LEFT': button = 'left'; break;
      case 'RIGHT': button = 'right'; break;
      case 'MIDDLE':
      case 'CENTER': button = 'middle'; break;
      default: /* INVALID_PARAMETER error */
    }
  }

  ctx.log('info', `WINCLICK: X=${x}, Y=${y}, button=${button}`);

  const result = await activeWinClickService.click({ x, y, button });

  if (!result.success) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: result.error || 'WINCLICK failed',
    };
  }

  return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
};
```

### 2. Unsupported handler override (unsupported.ts:134-137)

```typescript
export const winClickHandler: CommandHandler = createUnsupportedHandler(
  'WINCLICK',
  'Desktop click requires the native host winclick-service (Windows only)'
);
```

The unsupported handlers are registered **after** the winclick handlers and override them, so in the extension context the unsupported handler is the one that actually runs.

### Service architecture (winclick.ts:38-111)

The winclick handler uses a pluggable `WinClickService` interface:

- `WinClickService` interface with `click(options: WinClickOptions): Promise<WinClickResult>`
- `WinClickOptions`: `{ x: number, y: number, button?: 'left' | 'right' | 'middle' }`
- `WinClickResult`: `{ success: boolean, error?: string, position?: { x: number, y: number } }`
- Default no-op service returns `{ success: false, error: 'WINCLICK requires the native host...' }`
- `setWinClickService()` / `getWinClickService()` / `isWinClickServiceConfigured()` for dependency injection

### Step-by-step logic (new — active path via unsupported handler)

1. **Log**: Logs `'Unsupported command: WINCLICK - Desktop click requires the native host winclick-service (Windows only)'` at warn level.
2. **Return error**: Returns `{ success: false, errorCode: -915, errorMessage: 'WINCLICK is not supported: Desktop click requires the native host winclick-service (Windows only)' }`.

### Step-by-step logic (new — winclick handler, for use with native host)

1. **Read X param**: Gets required `X` parameter. If missing, returns `MISSING_PARAMETER`.
2. **Read Y param**: Gets required `Y` parameter. If missing, returns `MISSING_PARAMETER`.
3. **Parse coordinates**: Parses X and Y via `parseInt()` after variable expansion. If NaN, returns `INVALID_PARAMETER`.
4. **Validate coordinates**: Rejects negative values with `INVALID_PARAMETER`.
5. **Read BUTTON param**: Gets optional `BUTTON` parameter (default: `left`). Accepts `LEFT`, `RIGHT`, `MIDDLE`, `CENTER` (case-insensitive). Invalid values return `INVALID_PARAMETER`.
6. **Log**: Logs `'WINCLICK: X=<x>, Y=<y>, button=<button>'` at info level.
7. **Call service**: Awaits `activeWinClickService.click({ x, y, button })`.
8. **Success path**: If `result.success` is `true`, logs debug message and returns `{ success: true, errorCode: 0 }`.
9. **Failure path**: If `result.success` is `false`, returns `SCRIPT_ERROR` with `result.error` or `'WINCLICK failed'`.
10. **Error handling**: Catches exceptions, extracts message (handles both `Error` instances and non-Error thrown values), logs at error level, returns `SCRIPT_ERROR`.

### Key details (new)

- Two-layer architecture: functional handler in `winclick.ts` overridden by unsupported handler in `unsupported.ts` in extension context
- The `WinClickService` interface is designed for dependency injection from the native host
- `CENTER` is accepted as an alias for `MIDDLE` (not in original iMacros docs)
- Variable expansion is supported for all parameters (X, Y, BUTTON)
- Coordinates must be non-negative integers
- Registered in `winClickHandlers` map at `winclick.ts:241` as `WINCLICK: winClickHandler`
- Overridden in `unsupportedHandlers` map at `unsupported.ts:207` as `WINCLICK: winClickHandler` (different handler, same name)

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Behavior** | Always throws `UnsupportedCommand` | Returns `UNSUPPORTED_COMMAND` error result (extension context) | **Compatible**: Both reject the command as unsupported |
| **Error code** | `errnum = 912` | `errorCode = -915` (`UNSUPPORTED_COMMAND`) | **Minor difference**: Different numeric codes. Old uses positive `912`, new uses negative `-915`. Both indicate "unsupported command" semantically |
| **Error message** | `"command WINCLICK is not supported in the current version"` | `"WINCLICK is not supported: Desktop click requires the native host winclick-service (Windows only)"` | **Minor difference**: Different message text, same meaning |
| **Error mechanism** | Throws exception (synchronous) | Returns structured `CommandResult` (async) | **Structural**: New uses non-throwing error handling pattern |
| **Parameter parsing** | None — regex `".*"` accepts but never parses | Full parameter validation (X, Y required; BUTTON optional; type/range checking) | **Enhancement**: New handler validates parameters when native host is active |
| **Variable expansion** | None | X, Y, and BUTTON support variable expansion via `ctx.expand()` | **Enhancement**: Variables can be used in coordinates |
| **BUTTON=CENTER** | N/A (never parsed) | Accepted as alias for MIDDLE | **Enhancement**: Additional convenience alias |
| **Future extensibility** | None — hardcoded throw | Pluggable `WinClickService` interface with dependency injection | **Enhancement**: New can support actual desktop clicks via native host |
| **Logging** | None | Info/debug/error logging at multiple levels | **Enhancement**: Better observability |
| **Handler layering** | Single `ActionTable` entry | Two handlers: `winClickHandler` (winclick.ts) overridden by unsupported handler (unsupported.ts) | **Structural**: Layered architecture allows selective enablement |
| **Async model** | Synchronous | Async (`Promise<CommandResult>`) | **Structural**: Consistent with new async command pattern |

## Output / Side Effects

- **Variables modified**: None
- **Return value**: Both old and new return an error (unsupported command) in extension context
- **Side effects**: None in extension context. When native host is active, performs OS-level mouse click at specified coordinates
- **No `!EXTRACT` or other output**: WINCLICK produces no extract data

## Test Coverage

### Parser tests (`tests/unit/parser.test.ts`)
- Parses `WINCLICK X=100 Y=200` as WINCLICK type (line 810-813)
- Included in supported commands list (line 888)

### Unit tests — winclick handler (`tests/unit/commands/winclick.test.ts`)

**Service Configuration:**
- No-op service returns error when native host not running (line 100-120)
- Custom WinClick service can be set and retrieved (line 122-127)
- `isWinClickServiceConfigured` checks service state (line 129-139)

**Parameter Validation:**
- Requires X parameter (line 149-158)
- Requires Y parameter (line 160-169)
- Requires both X and Y (line 171-177)
- Rejects non-numeric X value (line 179-189)
- Rejects non-numeric Y value (line 191-201)
- Rejects negative X coordinate (line 203-213)
- Rejects negative Y coordinate (line 215-225)
- Accepts zero coordinates (line 227-243)
- Accepts large coordinates (line 245-261)

**Button Parameter:**
- Defaults to left button (line 274-286)
- Accepts BUTTON=LEFT (line 288-301)
- Accepts BUTTON=RIGHT (line 303-316)
- Accepts BUTTON=MIDDLE (line 318-331)
- Accepts BUTTON=CENTER as alias for MIDDLE (line 333-346)
- Case-insensitive BUTTON value (line 348-361)
- Rejects invalid BUTTON value (line 363-375)

**Successful Execution:**
- Returns success when service click succeeds (line 381-393)
- Logs info message with coordinates and button (line 395-411)
- Passes correct options to service (line 413-430)

**Error Handling:**
- Returns error when service click fails (line 436-452)
- Uses default error message when service returns no error message (line 454-468)
- Handles service throwing an Error exception (line 470-485)
- Handles non-Error exceptions (line 487-502)
- Logs error message on exception (line 504-519)

**Handler Registration:**
- Exports WINCLICK in winClickHandlers (line 525-528)
- registerWinClickHandlers registers all handlers (line 530-539)

**Variable Expansion:**
- Expands variables in X coordinate (line 545-575)
- Expands variables in Y coordinate (line 577-598)
- Expands variables in BUTTON parameter (line 600-622)

### Unit tests — unsupported handler (`tests/unit/unsupported-commands.test.ts`)
- WINCLICK returns `UNSUPPORTED_COMMAND` error via executor (line 222-231)
- `winClickHandler` is included in exported unsupported handler map (line 108, 135, 330)
