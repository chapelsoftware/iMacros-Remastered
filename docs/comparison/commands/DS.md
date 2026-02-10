# DS Command Comparison

## Syntax

```
DS CMD=NEXT|RESET|READ
```

**Old regex**: `".*"` — matches any arguments (but never inspected; immediately throws `UnsupportedCommand`)

**New parser**: `parser.ts:946` accepts DS with no parameter validation at parse time (the `break` case means any trailing text is passed through). The `CMD` parameter is validated at execution time by the handler.

## Parameters

| Parameter | Position | Required | Values | Description |
|-----------|----------|----------|--------|-------------|
| CMD | Named | Yes | NEXT, RESET, READ | The sub-command to execute |

## Old Implementation (MacroPlayer.js:301-305)

```javascript
MacroPlayer.prototype.RegExpTable["ds"] = ".*";

MacroPlayer.prototype.ActionTable["ds"] = function (cmd) {
    throw new UnsupportedCommand("DS");
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

DS is also listed as a forbidden AlertFox command (MacroPlayer.js:3826):

```javascript
const forbiddenCommands = new RegExp(
    "^(?:pause|prompt|clear|ds|size|imageclick|imagesearch|print)$",
    "i");
```

### Step-by-step logic (old)

1. **Parse**: Regex `".*"` matches any argument string (greedy, including empty).
2. **Execute**: Immediately throws `UnsupportedCommand("DS")`.
3. **Error**: Error message = `"command DS is not supported in the current version"`, error number = `912`.

### Key details (old)

- DS was **always** unsupported in the iMacros 8.9.7 Chrome/Firefox extension
- The regex `".*"` accepts any trailing text but it is never inspected — the command throws unconditionally
- Error code `912` was the standard "unsupported command" error in the original iMacros
- The DS command existed in iMacros desktop editions for datasource navigation but was never implemented in the browser extension
- Original iMacros browser users had to use `SET !DATASOURCE file.csv`, `SET !DATASOURCE_LINE n`, and `{{!COLn}}` variable references instead

## New Implementation (datasource-handler.ts)

The new implementation provides a **fully functional** DS command as an enhancement over the original. It works in conjunction with:
- `DatasourceManager` class from `shared/src/datasource.ts` (CSV parsing via `papaparse`)
- `VariableContext` datasource state (`!DATASOURCE_LINE`, `!COL1`–`!COL10`)

### Handler (datasource-handler.ts:96-184)

```typescript
export const dsCommandHandler: CommandHandler = async (
  ctx: CommandContext
): Promise<CommandResult> => {
  const cmdParam = ctx.getParam('CMD');

  if (!cmdParam) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'DS command requires CMD parameter (NEXT, RESET, or READ)',
    };
  }

  const cmd = ctx.expand(cmdParam).toUpperCase();

  // Sync datasource rows from manager to VariableContext if needed
  const manager = getDatasourceManager();
  if (manager?.isLoaded() && ctx.variables.getDatasourceRowCount() === 0) {
    ctx.variables.setDatasourceRows(manager.getAllRows());
  }

  // Check if datasource is loaded
  const rowCount = ctx.variables.getDatasourceRowCount();
  if (rowCount === 0) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.DATASOURCE_ERROR,
      errorMessage: 'No datasource loaded. Set !DATASOURCE first.',
    };
  }

  const currentLine = ctx.variables.get('!DATASOURCE_LINE');
  const lineNum = typeof currentLine === 'number'
    ? currentLine
    : parseInt(String(currentLine), 10) || 1;

  switch (cmd) {
    case 'NEXT': { /* increments !DATASOURCE_LINE */ }
    case 'RESET': { /* resets !DATASOURCE_LINE to 1 */ }
    case 'READ': { /* validates datasource, no-op */ }
    default: { /* returns INVALID_PARAMETER */ }
  }
};
```

### Step-by-step logic (new)

#### DS CMD=NEXT
1. **Get CMD**: Reads `CMD` parameter from parsed command, expands variables, uppercases.
2. **Sync check**: If a `DatasourceManager` is loaded but `VariableContext` has no rows yet, syncs rows from manager.
3. **Validate datasource**: Checks `getDatasourceRowCount()` > 0. If not, returns `DATASOURCE_ERROR` (-980).
4. **Get current line**: Reads `!DATASOURCE_LINE` from variables, parses to integer (defaults to 1).
5. **Bounds check**: If `lineNum + 1 > rowCount`, returns `DATASOURCE_END` (-983) with message `"End of datasource reached"`.
6. **Advance**: Calls `ctx.variables.setDatasourceLine(nextLine)` to increment `!DATASOURCE_LINE`.
7. **Return**: `{ success: true, errorCode: 0 }`.

#### DS CMD=RESET
1. Steps 1–4 same as NEXT.
2. **Reset**: Calls `ctx.variables.setDatasourceLine(1)` to set `!DATASOURCE_LINE` back to 1.
3. **Return**: `{ success: true, errorCode: 0 }`.

#### DS CMD=READ
1. Steps 1–4 same as NEXT.
2. **Bounds check**: If current line < 1 or > rowCount, returns `DATASOURCE_END` (-983).
3. **No-op**: Does not advance or modify line number. `{{!COL1}}` already reads dynamically from `!DATASOURCE_LINE`.
4. **Return**: `{ success: true, errorCode: 0 }`.

### Key details (new)

- The handler does **not** directly set `!COL1`–`!COL10`; column values are resolved dynamically by `VariableContext` when `{{!COLn}}` is expanded based on the current `!DATASOURCE_LINE`
- The `CMD` parameter value is expanded (supports variable references like `CMD={{!VAR1}}`) before matching
- Module-level `datasourceManager` instance is managed via `getDatasourceManager()`, `setDatasourceManager()`, and `ensureDatasourceManager()` — designed for dependency injection and testing
- `loadDatasourceFromContent()` is the entry point for loading CSV data (called when `SET !DATASOURCE` triggers the `onDatasourceLoad` callback)
- CSV parsing uses `papaparse` with support for: auto-detect delimiter, quoted fields, skip empty lines, header rows, and comment characters
- Registered in `datasourceHandlers` map at `datasource-handler.ts:191` as `DS: dsCommandHandler`
- Exported via `shared/src/commands/index.ts:35`

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Behavior** | Always throws `UnsupportedCommand` (error 912) | Fully functional with NEXT/RESET/READ sub-commands | **Enhancement**: DS is now usable in browser macros |
| **CMD=NEXT** | N/A (unsupported) | Increments `!DATASOURCE_LINE`, returns `DATASOURCE_END` at end | **New feature** |
| **CMD=RESET** | N/A (unsupported) | Resets `!DATASOURCE_LINE` to 1 | **New feature** |
| **CMD=READ** | N/A (unsupported) | Validates datasource loaded, no-op otherwise | **New feature** |
| **Error when used** | `errnum = 912`, message = `"command DS is not supported in the current version"` | `MISSING_PARAMETER` (-913) if no CMD, `DATASOURCE_ERROR` (-980) if no datasource, `DATASOURCE_END` (-983) at end, `INVALID_PARAMETER` (-912) for bad CMD | **Enhancement**: Specific error codes for different failure modes |
| **Datasource mechanism** | N/A | Uses `DatasourceManager` with `papaparse` CSV parser | **New**: Full CSV parsing infrastructure |
| **Column access** | Only via `{{!COLn}}` with manual `SET !DATASOURCE_LINE` | `{{!COLn}}` works automatically with DS NEXT/RESET advancing the line | **Enhancement**: Convenient iteration without manual line management |
| **Backwards compatibility** | — | Macros that never used DS (because it was unsupported) are unaffected. Macros that caught the 912 error will now succeed instead of erroring | **Note**: Scripts that relied on DS throwing an error will behave differently |
| **Async model** | Synchronous throw | Async (`Promise<CommandResult>`) | **Structural**: Consistent with new async command pattern |

## Output / Side Effects

- **Variables modified**:
  - `!DATASOURCE_LINE`: Modified by `CMD=NEXT` (increment) and `CMD=RESET` (set to 1)
  - `!COL1`–`!COL10`: Not directly modified by DS handler; resolved dynamically by `VariableContext.get()` based on `!DATASOURCE_LINE` and loaded datasource rows
- **Return value**: `CommandResult` with success/failure and error codes
- **Side effects**: None beyond variable state changes
- **No `!EXTRACT` or other output**: DS produces no extract data

## Test Coverage

### Parser tests (`tests/unit/parser.test.ts`)
- Parses `DS CMD=DELETE` as DS type (line 825-827)
- Included in supported commands list (line 888)

### Integration tests (`tests/integration/commands/ds.test.ts`)

**DatasourceManager integration:**
- Loads simple CSV via `loadDatasourceFromContent` (line 54)
- Handles quoted fields with commas inside (line 65)
- Advances through rows with `nextRow` (line 78)
- Resets to beginning (line 97)
- Handles empty lines in CSV content (line 108)

**DS CMD=NEXT:**
- Populates `!COL` variables after first NEXT (line 119)
- Populates `!COL` variables correctly with READ then NEXT (line 136)
- Advances through rows on multiple NEXT calls (line 150)
- Returns `DATASOURCE_END` when past last row (line 163)
- Sets `!DATASOURCE_LINE` after NEXT (line 175)
- Sets empty string for missing columns (line 186)

**DS CMD=RESET:**
- Resets position to first row (line 205)
- Allows re-iterating after RESET (line 218)
- Populates `!COL` variables with row 1 after RESET (line 231)

**DS CMD=READ:**
- Reads current row without advancing (line 248)
- Reads same row on repeated READ calls (line 260)
- Reads new row after NEXT (line 274)

**Error handling:**
- Returns `DATASOURCE_ERROR` when no datasource loaded (line 290)
- Returns `MISSING_PARAMETER` when CMD missing (line 300)
- Returns `INVALID_PARAMETER` for unknown CMD value (line 311)
- Returns `DATASOURCE_ERROR` for RESET with no datasource (line 322)
- Returns `DATASOURCE_ERROR` for READ with no datasource (line 332)

**ERRORIGNORE:**
- Continues execution when `ERRORIGNORE=YES` and datasource ends (line 346)

**Various data shapes:**
- Handles 10 columns (line 363)
- Handles more than 10 columns — only first 10 mapped (line 377)
- Handles single-column CSV (line 392)
- Handles tab-delimited data (line 404)

**onDatasourceLoad callback:**
- Loads datasource when `SET !DATASOURCE` used with callback (line 421)

### Unit tests — DatasourceManager (`tests/unit/datasource.test.ts`)
- Comprehensive tests for the underlying `DatasourceManager` class (CSV parsing, row navigation, column access, delimiter detection, etc.)
