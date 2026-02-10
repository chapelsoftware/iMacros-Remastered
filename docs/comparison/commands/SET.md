# SET Command Comparison

## Syntax

```
SET <variable> <value>
```

**Old regex**: `^(\S+)\s+(<im_strre>)\s*$`
- Two capture groups: variable name (group 1), value (group 2)
- Variable name is any non-whitespace string
- Value uses `im_strre` pattern which matches: quoted strings (`"..."`), `EVAL("...")`, or non-whitespace sequences

**New parser**: `parser.ts:248,652-661` — Positional parameter command. First parameter is the variable name, second is the value (which may contain spaces if quoted or EVAL). Validates that at least 2 parameters are present.

## Parameters

| Parameter | Required | Values | Description |
|-----------|----------|--------|-------------|
| variable | Yes | `!VAR0`-`!VAR9`, system variables (`!TIMEOUT`, `!ERRORIGNORE`, etc.), or user-defined names | Variable to set |
| value | Yes | Literal string, `EVAL("expression")`, `!CLIPBOARD`, `CONTENT`, `NULL` (for `!EXTRACT`) | Value to assign |

## Old Implementation (MacroPlayer.js:2034-2298)

### Regex and dispatch

```javascript
MacroPlayer.prototype.RegExpTable["set"] =
    "^(\\S+)\\s+("+im_strre+")\\s*$";

MacroPlayer.prototype.ActionTable["set"] = function (cmd) {
    var param = imns.unwrap(this.expandVariables(cmd[2]));

    switch(cmd[1].toLowerCase()) {
    case "!encryption": ...
    case "!imagefilter": ...
    case "!useragent": ...
    case "!loop": ...
    case "!extract": ...
    case "!extractadd": ...
    case "!extract_test_popup": ...
    case "!errorignore": ...
    case "!filestopwatch": ...
    case "!folder_stopwatch": ...
    case "!stopwatch_header": ...
    case "!folder_datasource": ...
    case "!datasource": ...
    case "!datasource_line": ...
    case "!datasource_columns": ...
    case "!datasource_delimiter": ...
    case "!timeout": case "!timeout_page": ...
    case "!timeout_macro": ...
    case "!timeout_tag": case "!timeout_step": ...
    case "!replayspeed": ...
    case "!singlestep": ...
    case "!clipboard": ...
    case "!linenumber_delta": ...
    case "!popup_allowed": ...
    case "!x_continue_load_after_stop": ...
    case "!file_profiler": ...
    default:
        if (/^!var([0-9])$/i.test(cmd[1])) {
            this.vars[imns.s2i(RegExp.$1)] = param;
        } else if (/^!\S+$/.test(cmd[1])) {
            throw new BadParameter("Unsupported variable "+cmd[1]);
        } else {
            this.setUserVar(cmd[1], param);
        }
    }
};
```

### Variable expansion with EVAL (MacroPlayer.js:4974-5071)

```javascript
MacroPlayer.prototype.expandVariables = function(param) {
    param = param.replace(/#novar#\{\{/ig, "#NOVAR#{");

    // ... handleVariable function for {{var}} substitution ...

    var eval_re = new RegExp("^eval\\s*\\((.*)\\)$", "i");
    var match = null;
    if (match = eval_re.exec(param)) {
        var js_str = match[1].replace(/\{\{(\S+?)\}\}/g, function(m, s) {
            return escape(handleVariable(m, s))
        });
        js_str = js_str.replace(/#novar#\{(?=[^\{])/ig, "{{");
        param = this.evalString(js_str);
    } else {
        param = param.replace(/\{\{(\S+?)\}\}/g, handleVariable);
        param = param.replace(/#novar#\{(?=[^\{])/ig, "{{");
    }
    return param;
};
```

### evalString (MacroPlayer.js:4955-4968)

```javascript
MacroPlayer.prototype.evalString = function(s) {
    var str = s ? imns.unwrap(s) : "";
    var err = function(txt) {
        throw new MacroError(txt, -1340);
    };
    var sandbox = Components.utils.Sandbox(this.currentWindow);
    sandbox.importFunction(err, "MacroError")
    var result = Components.utils.evalInSandbox(str, sandbox);
    return (typeof result == "undefined" ? "" : result).toString();
};
```

### Step-by-step logic (old)

1. **Parse**: Regex captures variable name (group 1) and raw value (group 2).
2. **Expand value**: `expandVariables()` processes the value:
   - Replaces `#novar#{{` with `#NOVAR#{` to protect escaped variable references.
   - Checks if value matches `eval(...)` pattern (case-insensitive).
   - **EVAL path**: Expands `{{var}}` references inside EVAL with escaped values, then evaluates via `Components.utils.evalInSandbox()` in a Firefox sandbox. Provides `MacroError()` function for macro-level error signaling (error code -1340).
   - **Non-EVAL path**: Expands `{{var}}` references directly.
   - Restores `#novar#` escaped braces.
3. **Variable dispatch**: The `ActionTable["set"]` handler dispatches on `cmd[1].toLowerCase()` (the variable name) using a large `switch` statement with specific validation for each system variable.
4. **System variable handling** (per-variable):
   - `!ENCRYPTION`: Validates `NO|YES|STOREDKEY|TMPKEY`, sets password manager encryption type.
   - `!IMAGEFILTER`: Boolean `ON`/`OFF`, controls image filtering.
   - `!USERAGENT`: Sets `general.useragent.override` browser preference, saves original for restoration.
   - `!LOOP`: Only sets on first loop iteration (`this.firstLoop`). Must be integer. Updates `this.currentLoop` and panel display.
   - `!EXTRACT`: Clears extract accumulator, then adds value unless value is `null` (case-insensitive).
   - `!EXTRACTADD`: Appends to extract accumulator via `addExtractData()`.
   - `!EXTRACT_TEST_POPUP`: Boolean `YES`/`NO`.
   - `!ERRORIGNORE`: Boolean `YES`/`NO`, controls error suppression.
   - `!FILESTOPWATCH`: Sets stopwatch output file path; validates parent directory exists and is writable. Error code 931/932.
   - `!FOLDER_STOPWATCH`: Sets stopwatch folder; `NO` disables. Error code 931.
   - `!STOPWATCH_HEADER`: Boolean `YES`/`NO`.
   - `!FOLDER_DATASOURCE`: Opens and validates folder path. Error code 931.
   - `!DATASOURCE`: Calls `this.loadDataSource(param)` to load CSV file.
   - `!DATASOURCE_LINE`: Must be positive integer, validated against datasource length. Error code 951.
   - `!DATASOURCE_COLUMNS`: Must be integer.
   - `!DATASOURCE_DELIMITER`: Must be single character.
   - `!TIMEOUT` / `!TIMEOUT_PAGE`: Must be positive integer. Also sets `tagTimeout = Math.round(timeout/10)`.
   - `!TIMEOUT_MACRO`: Must be positive number (float allowed). Sets macro-level timeout via `globalTimer.setMacroTimeout()`. Error code 803 on timeout.
   - `!TIMEOUT_TAG` / `!TIMEOUT_STEP`: Must be non-negative integer (0 allowed).
   - `!REPLAYSPEED`: Must be `SLOW` (2000ms), `MEDIUM` (1000ms), or `FAST` (0ms).
   - `!SINGLESTEP`: Boolean `YES`/`NO`.
   - `!CLIPBOARD`: Writes to system clipboard via `imns.Clipboard.putString()`.
   - `!LINENUMBER_DELTA`: Must be negative integer or zero.
   - `!POPUP_ALLOWED`: URL value, manages browser popup permissions via `nsIPermissionManager`.
   - `!X_CONTINUE_LOAD_AFTER_STOP`: Boolean `YES`/`NO`.
   - `!FILE_PROFILER`: `NO` to disable, or filename to enable profiling.
5. **Default (user variables)**: Matches `!VAR0-9` via regex, stores in `this.vars[]` array. Rejects unknown `!`-prefixed variables. Non-`!` names stored via `setUserVar()`.

## New Implementation

### Command handler (executor.ts:338-408)

```typescript
this.registerHandler('SET', async (ctx) => {
  const params = ctx.command.parameters;
  if (params.length < 2) {
    return { success: false, errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
             errorMessage: 'SET requires variable name and value' };
  }

  const varName = params[0].key;
  const value = ctx.expand(params[1].rawValue || params[1].value);

  // !LOOP first-loop guard
  if (varName.toUpperCase() === '!LOOP' && ctx.state.getLoopCounter() > 1) {
    ctx.log('debug', `SET !LOOP ignored (only effective on first loop iteration)`);
    return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
  }

  const result = await executeSetAsync(ctx.variables, varName, value, this.onNativeEval);
  if (result.macroError) {
    return { success: true, errorCode: IMACROS_ERROR_CODES.OK,
             stopExecution: true, errorMessage: result.errorMessage };
  }
  if (!result.success) {
    return { success: false, errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
             errorMessage: result.error };
  }

  // If !DATASOURCE was set, load content via callback
  if (varName.toUpperCase() === '!DATASOURCE' && result.newValue && this.onDatasourceLoad) {
    const content = await this.onDatasourceLoad(String(result.newValue));
    // ... loads datasource, sets raw rows on VariableContext
  }

  ctx.log('debug', `SET ${varName} = ${result.newValue}`);
  return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
});
```

### Value parsing (variables.ts:949-970)

```typescript
export function parseSetValue(value: string):
  { type: 'literal' | 'eval' | 'content' | 'clipboard'; value: string } {
  const trimmed = value.trim();

  if (trimmed.toUpperCase().startsWith('EVAL(') && trimmed.endsWith(')')) {
    return { type: 'eval', value: trimmed.slice(5, -1) };
  }

  const upper = trimmed.toUpperCase();
  if (upper === 'CONTENT') return { type: 'content', value: '' };
  if (upper === '!CLIPBOARD') return { type: 'clipboard', value: '' };

  return { type: 'literal', value: trimmed };
}
```

### executeSetAsync (variables.ts:1203-1251)

```typescript
export async function executeSetAsync(
  context: VariableContext, varName: string, value: string,
  nativeEval?: NativeEvalCallback
): Promise<SetResult & { macroError?: boolean; errorMessage?: string }> {
  const parsed = parseSetValue(value);

  switch (parsed.type) {
    case 'eval': {
      const result = await evaluateExpressionAsync(parsed.value, context, nativeEval);
      if (result.isMacroError) {
        return { success: true, previousValue: context.get(varName),
                 newValue: context.get(varName), macroError: true,
                 errorMessage: result.errorMessage };
      }
      return context.set(varName, result.value);
    }
    case 'clipboard': {
      return context.set(varName, context.getClipboard());
    }
    case 'content':
    case 'literal': {
      const { expanded } = context.expand(parsed.value);
      return context.set(varName, expanded);
    }
  }
}
```

### Variable validation (variables.ts:267-331)

```typescript
private validateSystemVariable(upperName: string, value: VariableValue): string | null {
  // YES/NO variables: !ERRORIGNORE, !ERRORLOOP, !SINGLESTEP,
  //   !EXTRACT_TEST_POPUP, !STOPWATCH, !STOPWATCH_HEADER,
  //   !WAITPAGECOMPLETE, !DOWNLOADPDF, !POPUP_ALLOWED
  // Timeout variables: !TIMEOUT, !TIMEOUT_STEP, !TIMEOUT_PAGE,
  //   !TIMEOUT_TAG, !TIMEOUT_MACRO (non-negative number)
  // !REPLAYSPEED: SLOW | MEDIUM | FAST
  // !LOOP: positive integer
  // !DATASOURCE_LINE: positive integer
  // !DATASOURCE_DELIMITER: single character
}
```

### VariableContext.set() special handling (variables.ts:500-560)

```typescript
set(name: string, value: VariableValue): SetResult {
  // System variables: validates, then stores in systemVars map
  // !TIMEOUT cascade: setting !TIMEOUT also sets !TIMEOUT_TAG = round(timeout/10)
  // !EXTRACT: clears accumulator, adds value (unless "null")
  // !EXTRACTADD: appends to accumulator
  // Custom variables: stores in customVars map (case-insensitive via upperName)
}
```

### Expression evaluation (variables.ts:977-1021)

```typescript
export function evaluateExpression(expr: string, context: VariableContext): number | string {
  const { expanded } = context.expand(expr);
  // Strip trailing semicolons, wrapping quotes, unescape backslash-escaped quotes
  // Preprocess Math.* and Date.now()
  // Evaluate using safe ExpressionEvaluator (expr-eval library)
  // Fallback: try as simple arithmetic via sanitized new Function()
}
```

### Step-by-step logic (new)

1. **Parse**: Parser extracts variable name (first param) and value (second param). Validates at least 2 parameters.
2. **Variable expansion**: `ctx.expand()` processes `{{var}}` references in the value. EVAL detection and variable expansion happen in `parseSetValue()` and `executeSetAsync()`.
3. **Value type dispatch**: `parseSetValue()` classifies the value:
   - `EVAL(...)`: Expression evaluation path.
   - `CONTENT`: Content keyword (for TAG command interaction).
   - `!CLIPBOARD`: Read from clipboard.
   - Otherwise: literal value with variable expansion.
4. **EVAL evaluation**: `evaluateExpressionAsync()` expands variables, strips quotes/semicolons, preprocesses `Math.*`/`Date.now()`, then evaluates via `expr-eval` library (safe expression evaluator). Falls back to sanitized `new Function()` for simple arithmetic. Supports `nativeEval` callback for full JavaScript evaluation in native host context.
5. **MacroError handling**: EVAL expressions can signal macro-level errors via `MacroError()` function. New returns `{ macroError: true, stopExecution: true }` instead of throwing.
6. **Variable storage**: `VariableContext.set()` handles:
   - System variable validation via `validateSystemVariable()`.
   - `!TIMEOUT` cascade to `!TIMEOUT_TAG = max(1, round(timeout/10))`.
   - `!EXTRACT` special handling: clears accumulator, adds value unless `null`.
   - `!EXTRACTADD` special handling: appends to accumulator.
   - Custom variables stored in case-insensitive map.
7. **!LOOP first-loop guard**: SET !LOOP only takes effect on first loop iteration (same as old).
8. **!DATASOURCE loading**: When `!DATASOURCE` is set, executor calls `onDatasourceLoad` callback to load CSV content, then sets raw rows on VariableContext for `!COL` resolution.

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **EVAL engine** | `Components.utils.evalInSandbox()` — full JavaScript execution in Firefox sandbox | `expr-eval` library (safe expression evaluator) + sanitized `new Function()` fallback + optional `nativeEval` callback | **Behavioral difference**: Old supports arbitrary JS (DOM access, complex logic). New uses safe math/string evaluator by default; full JS only via native host callback. |
| **Variable dispatch** | Large `switch` statement with per-variable validation and side effects inline in `ActionTable["set"]` | Generic `VariableContext.set()` with centralized `validateSystemVariable()` | **Structural**: Cleaner separation; same validation rules. |
| **!ENCRYPTION** | Sets `passwordManager.encryptionType` (NONE/STORED/TEMP) | Stored as string in variable context (no password manager integration yet) | **Not yet implemented**: Encryption management not wired. |
| **!IMAGEFILTER** | Sets `this.shouldFilterImages` (boolean) | Stored as variable; filtering logic in browser layer | **Structural**: Same intent, different architecture. |
| **!USERAGENT** | Directly sets `general.useragent.override` Firefox preference; saves/restores original | Stored as variable; UA override applied by browser layer | **Structural**: Chrome extension applies UA differently. |
| **!CLIPBOARD** | Writes to system clipboard via `imns.Clipboard.putString()` | Stores in VariableContext; clipboard interaction at browser layer | **Structural**: Clipboard access deferred to extension/native host. |
| **!POPUP_ALLOWED** | Manages `nsIPermissionManager` popup permissions directly | Stored as variable; popup management at browser layer | **Structural**: Browser-specific API not applicable. |
| **!FILESTOPWATCH** | Validates and opens file path, validates parent dir existence and writability (error 931/932) | Stored as variable; file writing at native host layer | **Structural**: File I/O deferred. |
| **!FOLDER_STOPWATCH** | Opens and validates folder, sets `shouldWriteStopwatchFile` | Stored as variable | **Structural**: Validation deferred. |
| **!FOLDER_DATASOURCE** | Opens and validates folder path (error 931) | Stored as variable | **Structural**: Validation deferred. |
| **!DATASOURCE** | Calls `this.loadDataSource(param)` synchronously | Executor calls async `onDatasourceLoad` callback; loads via `DatasourceManager` | **Equivalent**: Both load CSV; new is async with callback pattern. |
| **!DATASOURCE_LINE** | Validates against `this.dataSource.length` (error 951) | Validates as positive integer; no range check against loaded data | **Minor difference**: Old rejects line numbers exceeding datasource length. New accepts any positive integer. |
| **!DATASOURCE_COLUMNS** | Validates as integer, sets `this.dataSourceColumns` | Not explicitly validated (stored as-is) | **Minor difference**: New may accept non-integer values. |
| **!TIMEOUT cascade** | `this.tagTimeout = Math.round(this.timeout/10)` (no minimum) | `!TIMEOUT_TAG = max(1, round(timeout/10))` (minimum 1) | **Minor difference**: New enforces minimum 1 for tag timeout. |
| **!TIMEOUT validation** | Must be positive integer (`> 0`) | Must be non-negative number (`>= 0`) | **Minor difference**: New accepts 0, old rejects 0. |
| **!TIMEOUT_MACRO** | Accepts float, sets `globalTimer.setMacroTimeout()` with real timeout (error 803) | Stored as variable; macro timeout enforcement elsewhere | **Structural**: Timer mechanism different. |
| **!LINENUMBER_DELTA** | Must be negative integer or zero | Not explicitly validated | **Minor difference**: New may accept positive values. |
| **!X_CONTINUE_LOAD_AFTER_STOP** | Boolean YES/NO | Not explicitly validated | **Minor difference**: New stores any value. |
| **!FILE_PROFILER** | `NO` disables, otherwise sets profiler filename | Stored as variable | **Structural**: Profiling deferred. |
| **Unknown ! variables** | Throws `BadParameter("Unsupported variable ...")` | Stores in system variables map without error | **Behavioral difference**: Old rejects unknown system variables. New accepts them silently. |
| **User variables** | Only `!VAR0-9` for numbered vars; named user vars via `setUserVar()` | All non-`!` vars stored in `customVars` map; `!VAR0-9` stored in `systemVars` | **Equivalent**: Same variable namespaces. |
| **Error model** | Throws `BadParameter` / `RuntimeError` exceptions | Returns structured `{ success, errorCode, errorMessage }` | **Structural**: Non-throwing error handling in new. |
| **MacroError from EVAL** | `MacroError(txt, -1340)` thrown in sandbox, propagates up | Returns `{ macroError: true, stopExecution: true }` with error message | **Equivalent**: Both stop macro execution; different signaling mechanism. |
| **#novar# escape** | `#novar#{{` escaped to prevent variable expansion | Not documented; variable expansion may differ | **Minor**: Edge case for advanced macro writers. |
| **EVAL variable escaping** | Variables in EVAL are escaped (quotes, newlines, carriage returns) before evaluation | Variables expanded directly before expression evaluation | **Minor difference**: Old escapes special chars in variable values for JS safety. New relies on safe evaluator. |
| **CONTENT keyword** | Not handled in SET command directly | `parseSetValue()` recognizes CONTENT keyword, stores empty string | **Enhancement**: New adds CONTENT as a recognized SET value type. |
| **Logging** | None | Debug logging: `SET ${varName} = ${result.newValue}` | **Enhancement**: Observability. |

## Output / Side Effects

- **Variable storage**: Both store the value in the appropriate variable context.
- **!EXTRACT accumulation**: Both clear and restart accumulator on `SET !EXTRACT`, with `null` check (case-insensitive) to produce empty state. Both append on `SET !EXTRACTADD`.
- **!TIMEOUT cascade**: Both update `!TIMEOUT_TAG` when `!TIMEOUT` is set. New enforces minimum 1.
- **!DATASOURCE loading**: Both trigger CSV loading when `!DATASOURCE` is set. Old is synchronous; new is async.
- **Browser state**: Old directly modifies browser state (useragent, clipboard, popup permissions). New stores values; browser layer applies changes.
- **EVAL result**: Old always returns string (`.toString()`). New returns number or string depending on expression result.

## Test Coverage

### Parser tests (`tests/unit/parser.test.ts`)
- Parses `SET !VAR1 value` with system variable (line 381)
- Parses `SET !ENCRYPTION NO` (line 388)
- Parses `SET !EXTRACT NULL` (line 394)
- Parses `SET !DATASOURCE Address.csv` (line 400)
- Parses `SET !DATASOURCE_LINE {{!LOOP}}` with variable reference (line 406)
- Parses `SET !LOOP 2` (line 411)
- Parses `SET !EXTRACT_TEST_POPUP NO` (line 416)
- Parses `SET !TIMEOUT_STEP 5` (line 421)
- Parses `SET !ERRORIGNORE YES` (line 426)
- Parses `SET !VAR1 EVAL("Math.floor(Math.random()*5 + 1);")` with EVAL (line 431)

### Unit tests: parseSetValue (`tests/unit/set-add-functions.test.ts`)
- Literal: simple string, numeric string, empty string, whitespace trimming, YES/NO (lines 17-52)
- EVAL: simple expression, case-insensitive, mixed case, variable references, complex expressions, no-match for EVAL without parens, no-match for EVALUATE (lines 55-99)
- CONTENT keyword: case-insensitive detection (lines 102-117)
- !CLIPBOARD keyword: case-insensitive detection (lines 119-129)

### Unit tests: evaluateExpression (`tests/unit/set-add-functions.test.ts`)
- Addition, subtraction, multiplication, division, modulo (lines 139-157)
- Parentheses, nested parentheses, decimals, negative results (lines 159-173)
- Whitespace handling, empty expression (lines 175-181)
- Non-numeric expression returns 0 (line 183)
- Variable expansion, multiple variable references (lines 188-197)
- Quoted expressions, order of operations, chained additions (lines 199-214)

### Unit tests: executeSet (`tests/unit/set-add-functions.test.ts`)
- Literal string, numeric string, EVAL expression, EVAL with variables (lines 224-251)
- Clipboard value, previous value tracking, variable expansion in literals (lines 253-274)
- System variables (!TIMEOUT, !ERRORIGNORE) (lines 276-286)

### Integration tests (`tests/integration/commands/set-add.test.ts`)
- User variables !VAR0-9: assign, overwrite, numeric, independence (lines 12-59)
- System variables: !TIMEOUT, !TIMEOUT_STEP, !TIMEOUT_PAGE, !ERRORIGNORE, !ERRORLOOP, !SINGLESTEP, !EXTRACT, !DATASOURCE_LINE, !DATASOURCE, folder variables, !CLIPBOARD (lines 62-144)
- EVAL expressions: arithmetic (+, -, *, /, %, parentheses), variable references, decimals, negatives, empty variable as zero, increment loop (lines 147-234)
- Variable references in literal values (lines 237-258)
- Multi-line scripts, comments (lines 260-288)
- Error cases: no params, missing value (lines 291-306)
- !LOOP first-loop guard (lines 620-647)
- !TIMEOUT cascade to !TIMEOUT_TAG (lines 649-678)
- Parameter validation: YES/NO booleans, timeout numerics, !REPLAYSPEED, !LOOP, !DATASOURCE_LINE, !DATASOURCE_DELIMITER (lines 680-807)
- Special values: long strings, special chars, !EXTRACT NULL, !LOOP override (lines 507-551)
- EVAL edge cases: string concat, nested arithmetic, exponentiation, chained variable refs (lines 553-583)
