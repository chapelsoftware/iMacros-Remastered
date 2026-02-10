# iimExit JS API Comparison

## Syntax

```javascript
// Old (jsplayer.js) - called from JS macro sandbox
iimExit()

// New (scripting-interface.ts) - called via TCP scripting interface
iimExit()
```

**Old**: `sandbox.iimExit = function()` — no arguments. Stops the JS player execution.

**New**: `private handleIimExit(): CommandResult` — no arguments. Returns OK and signals client disconnect.

## Parameters

| Parameter | Required | Old | New | Description |
|-----------|----------|-----|-----|-------------|
| *(none)* | — | No parameters | No parameters | Neither implementation accepts arguments. |

## Old Implementation (jsplayer.js)

### Function Definition (jsplayer.js:314-316)

```javascript
sandbox.iimExit = function() {
    iMacros.jsplayer2.stop();
};
```

### iimClose Alias (jsplayer.js:318-320)

```javascript
sandbox.iimClose = function() {
    sandbox.iimExit();
};
```

### JS_Player.prototype.stop (jsplayer.js:225-227)

```javascript
JS_Player.prototype.stop = function() {
    this.stopIsPending = true;
};
```

### Step-by-step logic (old)

1. **Set stop flag**: `iimExit()` calls `iMacros.jsplayer2.stop()`, which sets `this.stopIsPending = true` on the JS_Player instance.
2. **Debugger intercepts**: The `onStep` handler (jsplayer.js:108-128) checks `this.stopIsPending` on every step:
   - If `stopIsPending` is true, sets it to false and returns `null`
   - Returning `null` from `onStep` terminates the debuggee (stops script execution)
3. **Cleanup**: The `play()` method's `finally` block (jsplayer.js:193-222) runs:
   - Clears all breakpoints
   - Removes the sandbox as a debuggee
   - Disables the debugger
   - Resets `paused` and `playing` state to false
   - Restores the macro tree in the panel UI
   - If a scripting interface client is connected (`iMacros.client_id`), sends the response back with error code and message, then cleans up client state
4. **No return value**: The function does not return a value (returns `undefined` implicitly). The script execution is terminated by the debugger mechanism, so no code after `iimExit()` runs.

### Sandbox Context (jsplayer.js:130-222)

Same as other iim* functions — the function is attached to a sandbox created with system principal and full chrome access. See [iimPlay.md](iimPlay.md) for full sandbox context details.

## New Implementation (scripting-interface.ts)

### Command Dispatch (scripting-interface.ts:669-671)

```typescript
case 'iimexit':
case 'iimclose': // Alias for iimExit (iMacros 8.9.7 compatibility)
  return this.handleIimExit();
```

### Handler (scripting-interface.ts:843-848)

```typescript
/**
 * Handle iimExit command - Disconnect client (server stays running)
 */
private handleIimExit(): CommandResult {
  return { code: ReturnCode.OK };
}
```

### Step-by-step logic (new)

1. **Command parsing**: The TCP command `iimExit()` (or `iimClose()`) is parsed; function name is lowercased and matched to the `'iimexit'` / `'iimclose'` cases.
2. **Return OK**: Returns `{ code: ReturnCode.OK }` (code 1 = success). The response is serialized and sent back to the TCP client.
3. **No side effects**: The handler performs no cleanup, no state changes, and no event emission. The server continues running and accepting new connections.

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Execution model** | Stops JS script execution via debugger (`stopIsPending` flag terminates the debuggee) | Simply returns OK over TCP; no script execution to stop | **Structural**: Old ran JS macros in a sandbox with a debugger; new uses a TCP command protocol where each command is independent. |
| **Script termination** | Code after `iimExit()` does NOT execute — the debugger's `onStep` returns `null` to terminate | N/A — commands are discrete TCP requests, not a running script | **Structural**: Fundamentally different execution model. |
| **iimClose alias** | `iimClose` calls `iimExit` (jsplayer.js:318-320) | `iimclose` falls through to same handler as `iimexit` (scripting-interface.ts:669-671) | **None**: Both treat iimClose as an alias for iimExit. |
| **Return value** | `undefined` (no explicit return) | `{ code: ReturnCode.OK }` (code 1) | **Minor**: Old returns nothing since script is terminated; new returns success code to TCP client. |
| **Cleanup** | Triggers extensive cleanup: disables debugger, removes debuggee, clears breakpoints, resets UI, sends SI response | No cleanup performed | **Structural**: Old had debugger/UI state to clean up; new has no such state. |
| **Server behavior** | N/A (runs inside browser extension) | Server continues running and accepting new connections after iimExit | **None**: Expected behavior for TCP server architecture. |

## Output / Side Effects

| Aspect | Old | New |
|--------|-----|-----|
| **Return value** | `undefined` (implicit) | `{ code: ReturnCode.OK }` (code 1) |
| **Variables modified** | `jsplayer2.stopIsPending` → `true`, then cleanup resets `playing`, `paused` to `false` | None |
| **Side effects** | Terminates script execution, disables debugger, clears breakpoints, resets panel UI, sends SI response if client connected | None — returns OK |
| **Error handling** | None — always sets `stopIsPending` | None — always returns OK |

## Test Coverage

### Integration tests (`tests/integration/scripting-interface.test.ts`)

- **Handles iimExit command** (line 547): Sends `iimExit()` and verifies `ReturnCode.OK`.
- **Handles iimClose as alias for iimExit** (line 553): Sends `iimClose()` and verifies `ReturnCode.OK`.

### Integration tests (`tests/integration/scripting-interface-executor.test.ts`)

- **Returns OK on iimExit** (line 347): Sends `iimExit()` and verifies `ReturnCode.OK`.
- **Server continues running after iimExit** (line 352): Sends `iimExit()`, then sends another command and verifies the server still responds.
- **Full round-trip** (line 390): Uses `iimExit()` as the final step in a connect → set → play → extract → error → disconnect workflow.
