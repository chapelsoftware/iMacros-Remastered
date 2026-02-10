# iimGetExtract JS API Comparison

## Syntax

```javascript
// Old (jsplayer.js) - called from JS macro sandbox
iimGetExtract()       // returns all extracted data as a string
iimGetExtract(n)      // returns nth extracted value (1-based)

// New (scripting-interface.ts) - called via TCP scripting interface
iimGetExtract()       // returns all extracted data as a string
iimGetExtract(n)      // returns nth extracted value (1-based), split on #NEXT#
```

**Old**: `sandbox.iimGetExtract = function(val)` — a direct alias for `iimGetLastExtract`. Delegates all calls to `sandbox.iimGetLastExtract(val)`.

**New**: Dispatched to `handleIimGetLastExtract(args)` via case-insensitive command matching (`'iimgetextract'`). Also bound as `iimGetLastExtract.bind(this)` in the JS debugger context.

## Parameters

| Parameter | Required | Old | New | Description |
|-----------|----------|-----|-----|-------------|
| `n` | No | Number (or string coerced via `imns.s2i`) — 1-based index | String containing a number — 1-based index | Optional index to retrieve a specific extracted value. |

## Old Implementation (jsplayer.js)

### Function Definition (jsplayer.js:366-368)

```javascript
sandbox.iimGetExtract = function(val) {
    return sandbox.iimGetLastExtract(val);
};
```

`iimGetExtract` is a direct alias — it simply delegates to `iimGetLastExtract` with the same argument.

### Underlying iimGetLastExtract (jsplayer.js:351-364)

```javascript
sandbox.iimGetLastExtract = function(val) {
    if ( !val )
        return iMacros.player.getExtractData();

    var h = iMacros.player.getExtractData();
    if (!h || !h.length)
        return null;
    val = imns.s2i(val);
    if (isNaN(val) || h.length < val-1)
        return "#nodata#";
    h = h.split("[EXTRACT]");

    return h[val-1];
};
```

### Step-by-step logic (old)

1. **Delegate**: `iimGetExtract(val)` calls `iimGetLastExtract(val)`.
2. **No argument path** (`!val` is truthy): If `val` is falsy (undefined, 0, null, empty string), returns the raw extract data string via `iMacros.player.getExtractData()`.
3. **With argument — get extract data**: Retrieves `h = iMacros.player.getExtractData()`.
4. **Empty check**: If `h` is falsy or has no length, returns `null`.
5. **Convert to integer**: `val = imns.s2i(val)` — converts to integer (equivalent to `parseInt`).
6. **Bounds check**: If `isNaN(val)` or `h.length < val-1`, returns `"#nodata#"`. Note: compares against the unsplit string character count, not value count — a known bug.
7. **Split and return**: Splits on `"[EXTRACT]"`, returns `h[val-1]`. Out-of-bounds returns `undefined`.

### Return values (old)

| Scenario | Return Value |
|----------|-------------|
| No argument, has data | Full extract string (e.g. `"foo[EXTRACT]bar"`) |
| No argument, no data | `""` (empty string) |
| With arg, no data (empty/null) | `null` |
| With arg, NaN or invalid bounds | `"#nodata#"` |
| With arg, valid index | The nth extracted value |
| With arg, index exceeds parts | `undefined` |

### Sandbox Context (jsplayer.js:130-222)

Same as other iim* functions — attached to a sandbox created with system principal and full chrome access. See [iimPlay.md](iimPlay.md) for full sandbox context details.

## New Implementation

### TCP Scripting Interface (scripting-interface.ts:659-661)

```typescript
case 'iimgetlastextract':
case 'iimgetextract':
  return this.handleIimGetLastExtract(args);
```

Both `iimGetExtract` and `iimGetLastExtract` are dispatched to the same handler via case-insensitive matching (`toLowerCase()`).

### Handler (scripting-interface.ts:790-814)

```typescript
private handleIimGetLastExtract(args: string[]): CommandResult {
  const extract = this.handler.getLastExtract();

  // If numeric arg provided, return nth value (1-based)
  if (args.length > 0) {
    const n = parseInt(args[0], 10);
    if (!isNaN(n) && n > 0) {
      if (extract === '#nodata#') {
        return { code: ReturnCode.OK, data: '#nodata#' };
      }
      const parts = extract.split('#NEXT#');
      if (n <= parts.length) {
        return { code: ReturnCode.OK, data: parts[n - 1] };
      }
      return { code: ReturnCode.OK, data: '#nodata#' };
    }
  }

  return { code: ReturnCode.OK, data: extract };
}
```

### JS Debugger Context (js-debugger.ts:487, 656)

```typescript
// In evaluateExpression (line 487):
context.iimGetExtract = this.iimGetLastExtract.bind(this);

// In runWithDebugger (line 656):
iimGetExtract: this.iimGetLastExtract.bind(this),
```

Both execution contexts bind `iimGetExtract` directly to the `iimGetLastExtract` method — same alias pattern as the old implementation.

### Step-by-step logic (new)

1. **Get extract data**: Retrieves `extract = this.handler.getLastExtract()` — returns stored string or `'#nodata#'` if empty.
2. **No argument path**: If `args.length === 0`, returns `{ code: ReturnCode.OK, data: extract }`.
3. **With argument — parse index**: `n = parseInt(args[0], 10)`.
4. **Validate index**: If `isNaN(n)` or `n <= 0`, falls through to returning the full extract string.
5. **Check for #nodata#**: If extract is `'#nodata#'`, returns `'#nodata#'`.
6. **Split and bounds check**: Splits on `'#NEXT#'`. If `n <= parts.length`, returns `parts[n - 1]`. Otherwise returns `'#nodata#'`.

### Return values (new)

| Scenario | Return Value |
|----------|-------------|
| No argument, has data | Full extract string (e.g. `"foo#NEXT#bar"`) |
| No argument, no data | `"#nodata#"` |
| With arg, no data | `"#nodata#"` |
| With arg, NaN or `n <= 0` | Full extract string (falls through) |
| With arg, valid index | The nth extracted value |
| With arg, index exceeds parts | `"#nodata#"` |

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Alias mechanism** | Separate function delegating to `iimGetLastExtract` | Same handler via case statement; same method binding in debugger | **None**: Both are pure aliases with identical behavior to `iimGetLastExtract`. |
| **Delimiter** | `[EXTRACT]` between values | `#NEXT#` between values | **Internal**: Transparent to indexed access; visible in raw string output. |
| **No-data return (no arg)** | `""` (empty string) | `"#nodata#"` | **Behavioral**: Scripts checking `if (!result)` will behave differently. |
| **No-data return (with arg)** | `null` | `"#nodata#"` | **Behavioral**: Scripts using strict null checks will behave differently. |
| **Out-of-bounds return** | `undefined` (JS array OOB) | `"#nodata#"` | **Behavioral**: More consistent in new implementation. |
| **NaN/invalid index** | Returns `"#nodata#"` | Returns full extract string (ignores invalid arg) | **Behavioral**: Old treats bad arg as error; new treats it as no-arg. |
| **Bounds check bug** | Compares string character count vs index | Correctly compares split array length vs index | **Bug fix**: New implementation has correct bounds checking. |
| **Return type** | Raw values (`string`, `null`, `undefined`, `"#nodata#"`) | `{ code: ReturnCode.OK, data: string }` | **Internal**: TCP protocol extracts `data` field. |

All differences are inherited from `iimGetLastExtract` — see [iimGetLastExtract.md](iimGetLastExtract.md) for detailed analysis.

## Output / Side Effects

| Aspect | Old | New |
|--------|-----|-----|
| **Return value (no arg)** | Extract string or `""` | `{ code: ReturnCode.OK, data: extract }` where extract is data or `"#nodata#"` |
| **Return value (with valid arg)** | Nth extracted value | `{ code: ReturnCode.OK, data: nthValue }` |
| **Variables modified** | None (read-only) | None (read-only) |
| **Side effects** | None | None |
| **Error handling** | No errors — returns sentinel values | Always returns `ReturnCode.OK` with data |

## Test Coverage

All tests for `iimGetExtract` are covered by the `iimGetLastExtract` test suite since both map to the same handler. See [iimGetLastExtract.md](iimGetLastExtract.md) for comprehensive test coverage details.

### TCP Command Dispatch (scripting-interface.ts:659-661)

The `'iimgetextract'` case falls through to the same `handleIimGetLastExtract` handler, ensuring identical behavior for both command names.

### JS Debugger Binding (js-debugger.ts:487, 656)

`iimGetExtract` is bound to `this.iimGetLastExtract` in both `evaluateExpression` and `runWithDebugger` contexts, ensuring the alias works in all JS execution paths.
