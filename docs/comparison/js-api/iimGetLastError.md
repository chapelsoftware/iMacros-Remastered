# iimGetLastError JS API Comparison

## Syntax

```javascript
// Old (jsplayer.js) - called from JS macro sandbox
iimGetLastError()

// New (scripting-interface.ts) - called via TCP scripting interface
iimGetLastError()
```

**Old**: `sandbox.iimGetLastError = function()` — no arguments. Returns `iMacros.player.errorMessage || "OK"`.

**New**: `handleIimGetLastError(): CommandResult` — no arguments. Returns `{ code: ReturnCode.OK, data: this.handler.getLastError() }`.

## Parameters

| Parameter | Required | Old | New | Description |
|-----------|----------|-----|-----|-------------|
| *(none)* | — | No parameters | No parameters | Neither implementation accepts arguments. |

## Old Implementation (jsplayer.js)

### Function Definition (jsplayer.js:322-324)

```javascript
sandbox.iimGetLastError = function() {
    return iMacros.player.errorMessage || "OK";
};
```

### Related: iimGetErrorText (jsplayer.js:326-328)

```javascript
sandbox.iimGetErrorText = function() {
    return sandbox.iimGetLastError();
};
```

`iimGetErrorText()` is a direct alias that delegates to `iimGetLastError()`.

### How errorMessage is Set

The `iMacros.player` is a `MacroPlayer` instance. The `errorMessage` property is set in several places in `MacroPlayer.js`:

1. **Initialization** (MacroPlayer.js:4759): `this.errorMessage = "OK"` — set at the start of each macro play.
2. **Parse errors** (MacroPlayer.js:118): `this.errorMessage = e.message` — set when macro parsing throws.
3. **Runtime errors** (MacroPlayer.js:4313): `this.errorMessage = "RuntimeError: " + ...` — set during command execution failures.
4. **General exceptions** (MacroPlayer.js:4583): `this.errorMessage = (e.name || "Error") + ": " + e.message` — set for unhandled errors.
5. **Browser closed** (MacroPlayer.js:88): `this.errorMessage = "Browser closed"` — set when the browser closes during playback.

### Step-by-step logic (old)

1. **Read player property**: Accesses `iMacros.player.errorMessage`, which is a string property on the `MacroPlayer` instance.
2. **Fallback to "OK"**: Uses JavaScript `||` operator — if `errorMessage` is falsy (empty string, `null`, `undefined`), returns `"OK"`.
3. **Return string**: Returns the error message string directly to the calling JS macro code.

### Default value

When a macro completes successfully, `errorMessage` is initialized to `"OK"` at the start of playback (MacroPlayer.js:4759). Since `"OK"` is truthy, the `||` fallback is only needed if `errorMessage` is somehow cleared or unset between plays.

### Sandbox Context (jsplayer.js:130-222)

Same as other iim* functions — the function is attached to a sandbox created with system principal and full chrome access. See [iimPlay.md](iimPlay.md) for full sandbox context details.

## New Implementation (scripting-interface.ts)

### Command Dispatch (scripting-interface.ts:663-664)

```typescript
case 'iimgetlasterror':
  return this.handleIimGetLastError();
```

### Handler (scripting-interface.ts:816-825)

```typescript
/**
 * Handle iimGetLastError command - Get the last error message
 */
private handleIimGetLastError(): CommandResult {
  const error = this.handler.getLastError();
  return {
    code: ReturnCode.OK,
    data: error,
  };
}
```

### MacroHandler.getLastError (scripting-interface.ts:345-347)

```typescript
getLastError(): string {
  return this.lastError;
}
```

### How lastError is Set (ExecutorMacroHandler)

The `lastError` is a private string field initialized to `''` (scripting-interface.ts:160):

1. **Reset on play** (scripting-interface.ts:201): `this.lastError = ''` — cleared at the start of each `play()` call.
2. **Parse errors** (scripting-interface.ts:246): `this.lastError = \`Line ${firstError.lineNumber}: ${firstError.message}\`` — set when macro has parse errors.
3. **Execution failure** (scripting-interface.ts:295): `this.lastError = result.errorMessage ?? \`Error code: ${result.errorCode}\`` — set when macro execution fails.
4. **Exceptions** (scripting-interface.ts:327): `this.lastError = error instanceof Error ? error.message : String(error)` — set for unhandled exceptions (including timeouts).

### Step-by-step logic (new)

1. **Command parsing**: The TCP command `iimGetLastError()` is parsed; function name is lowercased and matched to `'iimgetlasterror'`.
2. **Delegate to handler**: Calls `this.handler.getLastError()` on the `MacroHandler` instance.
3. **Return result**: Returns `{ code: ReturnCode.OK, data: error }` where `data` is the error string. The response is serialized and sent back to the TCP client.

### Per-client isolation

Each TCP client gets its own `MacroHandler` instance, so `lastError` is isolated per connection. One client's errors don't affect another client's `iimGetLastError()` result.

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Default/success value** | `"OK"` (set by `errorMessage = "OK"` at play start, with `\|\|` fallback) | `""` (empty string, set by `lastError = ''` at play start) | **Behavioral**: Old returns `"OK"` after success; new returns empty string. Scripts checking `iimGetLastError() == "OK"` will break. |
| **Return type** | String directly (e.g., `"OK"`, `"RuntimeError: ..."`) | `CommandResult` object `{ code: 1, data: "..." }` — TCP client receives the `data` field | **Structural**: Different transport mechanism, but the string content is equivalent for error cases. |
| **Error format** | `"RuntimeError: " + message` or exception `name + ": " + message` | `"Line N: message"` for parse errors; `result.errorMessage` or `"Error code: N"` for runtime errors | **Minor**: Error message format differs, but both convey error information. |
| **iimGetErrorText alias** | Separate function `iimGetErrorText()` that calls `iimGetLastError()` (jsplayer.js:326-328) | Not shown in dispatch — likely handled elsewhere or as a separate case | **None**: Both support the alias. |
| **State scope** | Global `iMacros.player.errorMessage` — shared across all JS macro executions | Per-client `lastError` on `MacroHandler` — isolated per TCP connection | **Improvement**: New avoids cross-client state leakage. |
| **Reset timing** | Reset to `"OK"` at start of playback (`MacroPlayer` init) | Reset to `''` at start of `play()` method | **None**: Both reset on new play. |

## Output / Side Effects

| Aspect | Old | New |
|--------|-----|-----|
| **Return value** | String: `"OK"` on success, error message on failure | `{ code: ReturnCode.OK, data: string }` — always returns OK code with error string as data |
| **Variables modified** | None — read-only access to `iMacros.player.errorMessage` | None — read-only access to `this.lastError` |
| **Side effects** | None | None |
| **Error handling** | None — always returns a string (fallback to `"OK"`) | None — always returns OK with the stored error string |

## Test Coverage

### Unit tests (`tests/unit/scripting-interface.test.ts`)

- **getLastError contains line info on parse error** (line 76): Verifies `handler.getLastError()` contains `'Line'` after a failed parse.
- **getLastError reset on new play** (lines 173-183): Verifies error is cleared (`''`) on successful play and populated on failed play, then cleared again on subsequent success.

### Integration tests (`tests/integration/scripting-interface.test.ts`)

- **Returns empty string when no error** (line 497): Sends `iimGetLastError()` with no prior error, expects `ReturnCode.OK` and `data === ''`.
- **Returns last error message** (line 504): Sets error via `mockHandler.setLastError()`, verifies exact error string returned.
- **Returns detailed error message** (line 513): Sets a detailed runtime error, verifies it contains `'Runtime Error'` and `'Line 5'`.

### Integration tests with executor (`tests/integration/scripting-interface-executor.test.ts`)

- **Returns empty error when macro succeeds** (line 257): Plays a valid macro, then checks `iimGetLastError()` returns `''`.
- **Returns error message when macro fails** (line 271): Plays an invalid macro (`"URL"` without `GOTO=`), verifies non-empty error string.
- **Clears error on subsequent successful play** (line 289): Causes error, verifies it's set, then plays successful macro and verifies error is cleared.
- **getLastError() returns error after failure** (line 643): Direct handler test — verifies truthy, non-empty error after failed play.
- **getLastError() returns empty after success** (line 650): Direct handler test — verifies `''` after successful play.
