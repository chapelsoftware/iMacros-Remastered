# iimGetErrorText JS API Comparison

## Syntax

```javascript
// Old (jsplayer.js) - called from JS macro sandbox
iimGetErrorText()

// New (scripting-interface.ts) - NOT IMPLEMENTED
// No dispatch case exists for iimGetErrorText
```

**Old**: `sandbox.iimGetErrorText = function()` — no arguments. Delegates directly to `sandbox.iimGetLastError()`.

**New**: Not implemented. There is no `case 'iimgeterrortext'` in the command dispatch switch (scripting-interface.ts:649-695).

## Parameters

| Parameter | Required | Old | New | Description |
|-----------|----------|-----|-----|-------------|
| *(none)* | — | No parameters | N/A | Neither implementation accepts arguments. |

## Old Implementation (jsplayer.js)

### Function Definition (jsplayer.js:326-328)

```javascript
sandbox.iimGetErrorText = function() {
    return sandbox.iimGetLastError();
};
```

### Step-by-step logic (old)

1. **Call iimGetLastError**: Delegates entirely to `sandbox.iimGetLastError()`.
2. **Return result**: Returns whatever `iimGetLastError()` returns — either the error message string or `"OK"` on success.

This is a pure alias — no additional logic, no parameter transformation, no side effects.

### iimGetLastError Implementation (jsplayer.js:322-324)

```javascript
sandbox.iimGetLastError = function() {
    return iMacros.player.errorMessage || "OK";
};
```

See [iimGetLastError.md](iimGetLastError.md) for full details on how `errorMessage` is set and managed.

### Sandbox Context (jsplayer.js:130-222)

Same as other iim* functions — the function is attached to a sandbox created with system principal and full chrome access. See [iimPlay.md](iimPlay.md) for full sandbox context details.

## New Implementation (scripting-interface.ts)

### Not Implemented

The new scripting interface does not have a dispatch case for `iimGetErrorText`. The command dispatch switch (scripting-interface.ts:649-695) handles these `iim*` commands:

- `iimplay`, `iimset`, `iimgetlastextract`, `iimgetextract`, `iimgetlasterror`, `iimstop`, `iimexit`, `iimclose`, `iimdisplay`, `iimgetstopwatch`, `iimgetlastperformance`

`iimgeterrortext` is absent from this list. If a TCP client sends `iimGetErrorText()`, it would fall through to the default case and return an "Unknown command" error.

### Expected Implementation

Since `iimGetErrorText()` is a direct alias for `iimGetLastError()` in the original, the implementation would be trivial:

```typescript
case 'iimgeterrortext':
  return this.handleIimGetLastError();
```

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Availability** | Fully implemented as alias for `iimGetLastError()` | Not implemented — no dispatch case | **Breaking**: Any script calling `iimGetErrorText()` will fail with "Unknown command" error. |
| **Behavior** | Identical to `iimGetLastError()` — returns `errorMessage \|\| "OK"` | N/A | N/A |
| **Return value** | Same as `iimGetLastError()`: `"OK"` on success, error message on failure | Would return "Unknown command" error | **Breaking**: Scripts relying on this function get an error instead of the expected error text. |

## Output / Side Effects

| Aspect | Old | New |
|--------|-----|-----|
| **Return value** | String: `"OK"` on success, error message on failure (same as `iimGetLastError()`) | Error: "Unknown command" (function not recognized) |
| **Variables modified** | None — read-only alias | N/A |
| **Side effects** | None | N/A |
| **Error handling** | None — always returns a string via `iimGetLastError()` | N/A |

## Test Coverage

### Old implementation

No dedicated tests — tested implicitly through `iimGetLastError()` since it's a pure alias.

### New implementation

No tests exist for `iimGetErrorText` since the function is not implemented.

### Related tests (iimGetLastError)

See [iimGetLastError.md](iimGetLastError.md) for test coverage of the underlying function that `iimGetErrorText` should alias.
