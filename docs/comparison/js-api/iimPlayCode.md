# iimPlayCode JS API Comparison

## Syntax

```javascript
// Old (jsplayer.js) - called from JS macro sandbox
iimPlayCode("SET !VAR1 hello\nSET !VAR2 world")

// New (scripting-interface.ts) - NOT IMPLEMENTED as separate command
// Use iimPlay("CODE:...") instead
iimPlay("CODE:SET !VAR1 hello[br]SET !VAR2 world")
```

**Old**: `sandbox.iimPlayCode = function(code)` — single argument: raw macro source code passed directly to the player.

**New**: No separate `iimPlayCode` command exists. The `iimPlay("CODE:...")` syntax covers the same use case.

## Parameters

| Parameter | Required | Old | New | Description |
|-----------|----------|-----|-----|-------------|
| code | Yes | String: raw macro source code | N/A | Macro code to execute directly (no `CODE:` prefix, no file resolution) |

## Old Implementation (jsplayer.js)

### Function Definition (jsplayer.js:295-307)

```javascript
sandbox.iimPlayCode = function(code) {
    iMacros.in_iimPlay = true;
    iMacros.player.play(code, 1, "Inline code");
    var ct = imns.Cc["@mozilla.org/thread-manager;1"].
        getService(imns.Ci.nsIThreadManager).currentThread;
    while(iMacros.player.playing)
        ct.processNextEvent(true);

    iMacros.in_iimPlay = false;
    iMacros.panel.showLines(iMacros.jssrc);

    return iMacros.player.errorCode;
};
```

### Step-by-step logic (old)

1. **Set in_iimPlay flag**: `iMacros.in_iimPlay = true` — signals to the macro player that this is a nested play from JS.
2. **Play macro**: Calls `iMacros.player.play(code, 1, "Inline code")` where:
   - `code` is passed directly as raw macro source (no `CODE:` prefix parsing, no escape sequence replacement, no file resolution).
   - `1` is the loop count.
   - `"Inline code"` is the display name.
3. **Synchronous wait**: Spins on the Mozilla thread manager's event queue (`processNextEvent(true)`) in a blocking while-loop until `iMacros.player.playing` is false. This makes `iimPlayCode()` synchronous from the JS caller's perspective.
4. **Clear flag**: Sets `iMacros.in_iimPlay = false`.
5. **Restore UI**: Calls `iMacros.panel.showLines(iMacros.jssrc)` to restore the JS source display in the panel.
6. **Return**: Returns `iMacros.player.errorCode` (1 = success, negative = error).

### Key Difference from iimPlay

`iimPlayCode` is a simplified version of `iimPlay` that skips two things:
- **No `CODE:` prefix detection**: The code argument is passed directly to the player as-is. No regex test or `CODE:` stripping.
- **No file path resolution**: There is no attempt to treat the argument as a filename. No `.iim` extension appending, no `openNode()`/`openMacroFile()` calls.
- **No escape sequence replacement**: No `[sp]`, `[lf]`, `[br]` substitutions. The caller provides the actual characters directly.

This makes it appropriate for programmatic use where the caller constructs macro code as a native JavaScript string (with real newlines) rather than using the `CODE:` single-line encoding.

### Sandbox Context (jsplayer.js:130-222)

Same as `iimPlay` — the function is attached to a sandbox created with system principal and full chrome access. See [iimPlay.md](iimPlay.md) for full sandbox context details.

## New Implementation (scripting-interface.ts)

### Not Implemented

There is no `iimPlayCode` command in the new scripting interface. The command dispatch (scripting-interface.ts:652+) does not include an `'iimplaycode'` case.

### Equivalent Functionality

The same functionality is achieved via `iimPlay("CODE:...")`:

```typescript
// scripting-interface.ts - handleIimPlay()
if (macroNameOrContent.toUpperCase().startsWith('CODE:')) {
    macroNameOrContent = macroNameOrContent.substring(5);
    macroNameOrContent = macroNameOrContent.replace(/\[sp\]/gi, ' ');
    macroNameOrContent = macroNameOrContent.replace(/\[lf\]/gi, '\r');
    macroNameOrContent = macroNameOrContent.replace(/\[br\]/gi, '\n');
    macroNameOrContent = macroNameOrContent.replace(/\\n/g, '\n');
}
```

In the new architecture, the TCP scripting interface sends commands as text strings (e.g., `iimPlay("CODE:SET !VAR1 hello[br]SET !VAR2 world")`), so a separate `iimPlayCode` is unnecessary — the `CODE:` protocol in `iimPlay` already handles inline macro content.

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Existence** | Separate function `iimPlayCode(code)` | Not implemented; use `iimPlay("CODE:...")` | **Breaking**: External callers using `iimPlayCode()` via TCP will receive an unknown command error. |
| **Input format** | Raw macro code with native newlines | Must use `CODE:` prefix with `[br]`/`\\n` escape sequences | **Difference**: Old accepted raw strings; new requires encoding via `CODE:` protocol. |
| **Escape sequences** | None — caller provides raw characters | `[sp]`, `[lf]`, `[br]`, `\\n` applied by `iimPlay` | **Difference**: Old used native JS strings; new uses text-encoded escape sequences. |
| **File resolution** | Never attempted | `iimPlay` without `CODE:` prefix attempts file resolution | **N/A**: `iimPlayCode` never resolved files; `iimPlay("CODE:...")` doesn't either. |
| **Execution model** | Synchronous (thread event loop spin-wait) | Async via `iimPlay`'s handler | **Structural**: Same as `iimPlay` difference. |
| **Display name** | Always `"Inline code"` | Not tracked (no UI) | **Structural**: Old set display name for panel; new has no browser UI. |
| **Concurrency guard** | None | Via `iimPlay`'s `isRunning()` check | **Enhancement**: Concurrent execution rejected in new. |

## Output / Side Effects

| Aspect | Old | New |
|--------|-----|-----|
| **Return value** | Integer error code (1 = OK, negative = error) | N/A — command not recognized |
| **Variables modified** | `iMacros.player.errorCode`, `iMacros.player.errorMessage`, `iMacros.in_iimPlay` | N/A |
| **Side effects** | Plays macro via shared player, updates browser panel UI | N/A |
| **Extract data** | Stored in `iMacros.player` for `iimGetLastExtract` | Via `iimPlay("CODE:...")` → stored in `handler.lastExtract` |

## Test Coverage

### No dedicated tests

There are no tests for `iimPlayCode` in the new codebase since the command is not implemented. The equivalent functionality is tested through `iimPlay("CODE:...")`:

- **Integration tests** (`tests/integration/scripting-interface-executor.test.ts`):
  - CODE: prefix executes inline macro (line 714)
  - CODE: with escape sequences [br], [sp] (line 751)
  - Case-insensitive CODE: prefix (line 738)
  - Multi-line via \\n and [br] (line 765)

## Migration Notes

Callers that previously used `iimPlayCode(code)` should switch to `iimPlay("CODE:" + code)`, noting that:
1. The code must be prefixed with `CODE:`.
2. Newlines in the macro source must be encoded as `[br]` or `\\n` (since the TCP protocol is line-based).
3. Spaces can optionally be encoded as `[sp]`, and carriage returns as `[lf]`.
