# iimGetLastExtract JS API Comparison

## Syntax

```javascript
// Old (jsplayer.js) - called from JS macro sandbox
iimGetLastExtract()       // returns all extracted data as a string
iimGetLastExtract(n)      // returns nth extracted value (1-based)

// New (scripting-interface.ts) - called via TCP scripting interface
iimGetLastExtract()       // returns all extracted data as a string
iimGetLastExtract(n)      // returns nth extracted value (1-based), split on #NEXT#
```

**Old**: `sandbox.iimGetLastExtract = function(val)` — retrieves the last extracted data from the macro player. Without an argument, returns the full extract string. With a numeric argument, splits on `[EXTRACT]` and returns the nth value (1-based).

**New**: `handleIimGetLastExtract(args: string[]): CommandResult` — retrieves the last extracted data from the macro handler. Without an argument, returns the full extract string. With a numeric argument, splits on `#NEXT#` and returns the nth value (1-based).

## Parameters

| Parameter | Required | Old | New | Description |
|-----------|----------|-----|-----|-------------|
| `n` | No | Number (or string coerced via `imns.s2i`) — 1-based index | String containing a number — 1-based index | Optional index to retrieve a specific extracted value. |

## Old Implementation (jsplayer.js)

### Function Definition (jsplayer.js:351-364)

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

### Alias: iimGetExtract (jsplayer.js:366-368)

```javascript
sandbox.iimGetExtract = function(val) {
    return sandbox.iimGetLastExtract(val);
};
```

`iimGetExtract` is a direct alias for `iimGetLastExtract`.

### Extract Data Storage (MacroPlayer.js:4856-4870)

```javascript
MacroPlayer.prototype.getExtractData = function () {
    return this.extractData;
};

MacroPlayer.prototype.addExtractData = function(str) {
    if ( this.extractData.length ) {
        this.extractData += "[EXTRACT]"+str;
    } else {
        this.extractData = str;
    }
};

MacroPlayer.prototype.clearExtractData = function() {
    this.extractData = "";
};
```

Multiple extracted values are concatenated with `[EXTRACT]` as the delimiter.

### Step-by-step logic (old)

1. **No argument path** (`!val` is truthy): If `val` is falsy (undefined, 0, null, empty string), returns the raw extract data string via `iMacros.player.getExtractData()`. This returns `this.extractData` — an empty string `""` if nothing has been extracted.
2. **With argument — get extract data**: Retrieves `h = iMacros.player.getExtractData()`.
3. **Empty check**: If `h` is falsy or has no length (`!h || !h.length`), returns `null`.
4. **Convert to integer**: `val = imns.s2i(val)` — converts the argument to an integer (equivalent to `parseInt`).
5. **Bounds check**: If `isNaN(val)` or `h.length < val-1`, returns `"#nodata#"`. Note: this compares against the unsplit string length, not the number of extract values. This is a bug — it checks `h.length` (string character count) against `val-1` (intended value index), which means the bounds check almost never triggers for reasonable index values.
6. **Split and return**: Splits on `"[EXTRACT]"` delimiter: `h = h.split("[EXTRACT]")`, then returns `h[val-1]` (0-indexed from the 1-based argument). If `val` exceeds the number of split parts, returns `undefined` (standard JS array out-of-bounds).

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

Same as other iim* functions — the function is attached to a sandbox created with system principal and full chrome access. See [iimPlay.md](iimPlay.md) for full sandbox context details.

## New Implementation (scripting-interface.ts)

### Command Dispatch (scripting-interface.ts:659-661)

```typescript
case 'iimgetlastextract':
case 'iimgetextract':
  return this.handleIimGetLastExtract(args);
```

Both `iimGetLastExtract` and `iimGetExtract` are dispatched to the same handler (case-insensitive matching via `toLowerCase()`).

### Handler (scripting-interface.ts:790-814)

```typescript
/**
 * Handle iimGetLastExtract command - Get the last extracted data
 *
 * @param args - [n?] optional 1-based index to return nth value split on #NEXT#
 */
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

### MacroHandler.getLastExtract (scripting-interface.ts:341-343)

```typescript
getLastExtract(): string {
  return this.lastExtract || '#nodata#';
}
```

Returns `'#nodata#'` when no extract data exists (empty string is falsy).

### Extract Data Capture (scripting-interface.ts:274-278)

```typescript
// Capture extract data
if (result.extractData && result.extractData.length > 0) {
  this.lastExtract = result.extractData.join('#NEXT#');
}
```

Multiple extracted values are joined with `#NEXT#` as the delimiter (from the executor's `extractData` array).

### Step-by-step logic (new)

1. **Get extract data**: Retrieves `extract = this.handler.getLastExtract()` — returns the stored extract string or `'#nodata#'` if empty.
2. **No argument path**: If `args.length === 0`, returns `{ code: ReturnCode.OK, data: extract }`.
3. **With argument — parse index**: `n = parseInt(args[0], 10)` — parses the first argument as a base-10 integer.
4. **Validate index**: If `isNaN(n)` or `n <= 0`, falls through to returning the full extract string.
5. **Check for #nodata#**: If extract is `'#nodata#'`, returns `{ code: ReturnCode.OK, data: '#nodata#' }`.
6. **Split and bounds check**: Splits on `'#NEXT#'`: `parts = extract.split('#NEXT#')`. If `n <= parts.length`, returns `parts[n - 1]`. Otherwise returns `'#nodata#'`.

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
| **Delimiter** | `[EXTRACT]` between values | `#NEXT#` between values | **Internal**: Old uses `[EXTRACT]` for storage/display, new uses `#NEXT#`. Both delimiters are handled transparently — callers who use indexed access see no difference. Callers reading the raw string see a different delimiter. |
| **No-data return (no arg)** | `""` (empty string) | `"#nodata#"` | **Behavioral**: Old returns empty string when nothing extracted; new returns `"#nodata#"`. Scripts checking for empty extract will behave differently. |
| **No-data return (with arg)** | `null` when extract data is empty/falsy | `"#nodata#"` when no data | **Behavioral**: Old returns `null`; new returns `"#nodata#"` string. Scripts using strict null checks will behave differently. |
| **Out-of-bounds return** | `undefined` (JS array OOB) | `"#nodata#"` | **Behavioral**: Old returns `undefined` when index exceeds values (due to buggy bounds check); new consistently returns `"#nodata#"`. |
| **Bounds check (old bug)** | Compares string length vs index: `h.length < val-1` — checks character count, not value count | Compares `n <= parts.length` after splitting — correct bounds check | **Bug fix**: Old bounds check is against the unsplit string character count, which is almost always larger than the index. The real bounds check was effectively the array access returning `undefined`. New correctly checks against the number of split parts. |
| **NaN/invalid index handling** | Returns `"#nodata#"` for NaN | Falls through to return full extract string | **Behavioral**: Old returns `"#nodata#"` for non-numeric args; new returns the full extract string (ignores invalid arg). |
| **Zero/negative index** | `0` is falsy → returns full string; negative values pass bounds check, return `undefined` from array | `n <= 0` falls through → returns full string | **Minor**: Old treats `0` as "no argument" due to falsy check. New explicitly checks `n > 0`. Negative indices return `undefined` in old vs full string in new. |
| **Return type** | Returns raw values (`string`, `null`, `undefined`, `"#nodata#"`) | Returns `{ code: ReturnCode.OK, data: string }` | **Internal**: TCP protocol extracts the `data` field. |
| **iimGetExtract alias** | Separate function that delegates to `iimGetLastExtract` | Same handler via case statement (`'iimgetextract'`) | **None**: Both map to identical behavior. |
| **Always returns OK** | N/A (direct return) | Always returns `ReturnCode.OK` even when returning `#nodata#` | **Protocol**: The function never fails — `#nodata#` is a valid data response, not an error. |

### Delimiter difference note

The old implementation uses `[EXTRACT]` as the multi-value delimiter (set in `MacroPlayer.addExtractData`), while the new implementation uses `#NEXT#` (set in `ExecutorMacroHandler.play` via `result.extractData.join('#NEXT#')`). This difference is transparent to users who access individual values via `iimGetLastExtract(n)`, but visible if they read the raw string from `iimGetLastExtract()` and parse it themselves.

### No-data handling note

The old implementation returns different falsy/sentinel values depending on context (`""`, `null`, `undefined`), while the new implementation consistently returns `"#nodata#"` for all no-data scenarios. This is more predictable but may break scripts that check for specific falsy values like `if (result === null)` or `if (!result)`.

## Output / Side Effects

| Aspect | Old | New |
|--------|-----|-----|
| **Return value (no arg)** | Extract string or `""` | `{ code: ReturnCode.OK, data: extract }` where extract is data or `"#nodata#"` |
| **Return value (with valid arg)** | Nth extracted value | `{ code: ReturnCode.OK, data: nthValue }` |
| **Variables modified** | None (read-only) | None (read-only) |
| **Side effects** | None | None |
| **Error handling** | No errors — returns sentinel values | Always returns `ReturnCode.OK` with data |

## Test Coverage

### Integration tests (`tests/integration/scripting-interface.test.ts`)

**iimGetLastExtract Command** (lines 452-490):
- **Returns #nodata# when no extract available** (line 457): Sends `iimGetLastExtract()` with no prior macro, verifies returns `#nodata#`.
- **Returns last extracted data** (line 464): Sets mock extract to `'extracted text content'`, verifies returned verbatim.
- **Returns multi-value extracted data with #NEXT# delimiter** (line 473): Sets mock extract to `'line1#NEXT#line2#NEXT#line3'`, verifies full delimited string returned.
- **Handles unicode in extracted data** (line 482): Sets mock extract to `'Hello 世界 🌍'`, verifies unicode preserved.

### Integration tests (`tests/integration/scripting-interface-executor.test.ts`)

**Full round-trip: set variable -> play macro -> get extract** (lines 189-251):
- **Passes iimSet variables into macro execution** (line 190): Sets `!VAR1`, plays `EXTRACT {{!VAR1}}`, verifies `iimGetLastExtract()` returns the variable value.
- **Captures extract data across variable expansion** (line 233): Same pattern with different variable value.

**iimGetLastExtract with index** (lines 833-853):
- **Returns nth extract value (1-based)** (line 834): Sets up extract data, verifies `iimGetLastExtract(1)` returns the first value.

**Full round-trip workflow** (lines 363-457):
- **Complete scripting interface workflow** (line 364): Full connect → set → play → extract → error check → disconnect cycle.
- **Workflow with error recovery** (line 397): Plays failing macro, recovers, verifies extract after recovery.
- **Multiple sequential macro executions** (line 427): Three sequential play→extract cycles, each returning correct data.

### Handler Management tests (`tests/integration/scripting-interface.test.ts`)

- **Custom handler** (line 838): Sets custom handler with extract, verifies `iimGetLastExtract()` returns custom value.
- **Factory function** (line 883): Creates server via factory with custom handler, verifies extract returned.
