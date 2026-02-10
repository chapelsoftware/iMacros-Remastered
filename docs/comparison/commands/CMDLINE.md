# CMDLINE Command Comparison

## Syntax

```
CMDLINE <variable> <value>
```

**Old regex**: `^(\S+)\s+(<im_strre>)\s*$`
- Two capture groups: variable name (group 1), value (group 2)
- Positional parameters (not key=value), space-separated

**New parser**: Positional parameter command — `parser.ts:874-883` validates that at least 2 positional parameters are present (variable name and value).

## Parameters

| Parameter | Position | Required | Values | Description |
|-----------|----------|----------|--------|-------------|
| variable | 1st | Yes | `!TIMEOUT`, `!LOOP`, `!DATASOURCE`, `!VAR0`-`!VAR9`, or user-defined variable name | Variable to set |
| value | 2nd | Yes | Any string | Value to assign to the variable |

## Old Implementation (MacroPlayer.js:254-285)

```javascript
MacroPlayer.prototype.RegExpTable["cmdline"] =
    "^(\\S+)\\s+("+im_strre+")\\s*$";

MacroPlayer.prototype.ActionTable["cmdline"] = function (cmd) {
    var param = imns.unwrap(this.expandVariables(cmd[2]));
    var found = false;

    if (/^!(\S+)$/i.test(cmd[1])) {
        var val = RegExp.$1.toLowerCase();
        if( val == "timeout" ) {
            if (isNaN(imns.s2i(param)))
                throw new BadParameter("integer", 2);
            this.timeout = imns.s2i(param);
        } else if (val == "loop") {
            if (isNaN(imns.s2i(param)))
                throw new BadParameter("integer", 2);
            this.currentLoop = imns.s2i(param);
        } else if (val == "datasource") {
            this.loadDataSource(param);
        } else if ( /^var([0-9])/.test(val) ) {
            this.vars[imns.s2i(RegExp.$1)] = param;
        } else {
            throw new BadParameter("!TIMEOUT|!LOOP|!DATASOURCE|!VAR[0-9]", 1);
        }
    } else {
        if (this.hasUserVar(cmd[1])) {
            this.setUserVar(cmd[1], param);
        } else {
            throw new BadParameter("unknown variable "+cmd[1]);
        }
    }
};
```

### Step-by-step logic (old)

1. **Parse parameters**: Regex captures variable name (group 1, NOT expanded) and value (group 2, expanded via `expandVariables` and unwrapped via `imns.unwrap`).
2. **System variable check**: Tests if first param starts with `!` via regex `/^!(\S+)$/i`. Extracts the name (lowercase) after `!`.
3. **`!TIMEOUT`**: Validates that value is a number via `imns.s2i()`. If `NaN`, throws `BadParameter("integer", 2)`. Otherwise sets `this.timeout` directly (player property, not a variable store).
4. **`!LOOP`**: Same validation as `!TIMEOUT`. Sets `this.currentLoop` directly.
5. **`!DATASOURCE`**: Calls `this.loadDataSource(param)` — immediately loads the datasource file by path.
6. **`!VAR0`-`!VAR9`**: Matches via `/^var([0-9])/` on the lowercase name. Stores value in `this.vars[index]` array by numeric index.
7. **Unsupported system variable**: Throws `BadParameter("!TIMEOUT|!LOOP|!DATASOURCE|!VAR[0-9]", 1)`.
8. **User-defined variable**: If not a system variable (no `!` prefix), checks if variable exists via `this.hasUserVar()`. If exists, updates via `this.setUserVar()`. If not, throws `BadParameter("unknown variable " + name)`.

### Key details (old)

- Variable name (group 1) is **not** expanded — it's used as-is from the parsed regex match
- Value (group 2) is expanded via `expandVariables()` and unwrapped
- `!TIMEOUT` and `!LOOP` use `imns.s2i()` for string-to-integer conversion
- `!DATASOURCE` triggers immediate file loading via `loadDataSource()`, not just variable assignment
- `!VAR0`-`!VAR9` stored in a numeric array (`this.vars[]`), not as named variables
- Error messages use `BadParameter` exception class with descriptive text

## New Implementation (system.ts:610-726)

```typescript
const CMDLINE_SUPPORTED_SYSVARS = new Set([
  '!TIMEOUT', '!LOOP', '!DATASOURCE',
  '!VAR0', '!VAR1', '!VAR2', '!VAR3', '!VAR4',
  '!VAR5', '!VAR6', '!VAR7', '!VAR8', '!VAR9',
]);

export const cmdlineHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const params = ctx.command.parameters;

  if (params.length < 2) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'CMDLINE command requires variable name and value',
    };
  }

  const varName = ctx.expand(params[0].key);
  const value = ctx.expand(params[1].key);
  const upperVarName = varName.toUpperCase();

  ctx.log('info', `CMDLINE: Setting ${varName} = ${value}`);

  // System variable
  if (upperVarName.startsWith('!')) {
    if (!CMDLINE_SUPPORTED_SYSVARS.has(upperVarName)) {
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
        errorMessage: `CMDLINE: Unsupported system variable: ${varName}`,
      };
    }

    if (upperVarName === '!TIMEOUT') {
      const seconds = parseFloat(value);
      if (isNaN(seconds) || seconds <= 0) {
        return { success: false, errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
                 errorMessage: `CMDLINE: Invalid timeout value: ${value}` };
      }
      ctx.state.setVariable('!TIMEOUT', seconds);
    } else if (upperVarName === '!LOOP') {
      const loopNum = parseInt(value, 10);
      if (isNaN(loopNum)) {
        return { success: false, errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
                 errorMessage: `CMDLINE: Invalid loop value: ${value}` };
      }
      ctx.state.setVariable('!LOOP', loopNum);
    } else if (upperVarName === '!DATASOURCE') {
      ctx.state.setVariable('!DATASOURCE', value);
    } else {
      // !VAR0-9
      ctx.state.setVariable(upperVarName, value);
    }

    return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
  }

  // User-defined variable: must already exist
  const existingValue = ctx.variables.get(upperVarName);
  if (existingValue === null) {
    return { success: false, errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
             errorMessage: `CMDLINE: Unknown variable: ${varName}` };
  }

  ctx.state.setVariable(upperVarName, value);
  return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
};
```

### Step-by-step logic (new)

1. **Validate parameter count**: Requires at least 2 positional parameters. Returns `MISSING_PARAMETER` error if fewer.
2. **Expand both parameters**: Both variable name and value are expanded via `ctx.expand()` (supports `{{!VAR1}}` syntax in both).
3. **Log**: Logs the assignment at `info` level.
4. **System variable check**: Tests if uppercased variable name starts with `!`.
5. **Supported variable whitelist**: Checks against `CMDLINE_SUPPORTED_SYSVARS` Set. Returns `INVALID_PARAMETER` for unsupported system variables.
6. **`!TIMEOUT`**: Validates via `parseFloat()`. Rejects `NaN` and values `<= 0`. Stores as numeric value via `ctx.state.setVariable()`.
7. **`!LOOP`**: Validates via `parseInt(value, 10)`. Rejects `NaN`. Stores as integer via `ctx.state.setVariable()`.
8. **`!DATASOURCE`**: Stores value as string via `ctx.state.setVariable()` — does **not** immediately load the datasource file.
9. **`!VAR0`-`!VAR9`**: Stores value as string via `ctx.state.setVariable()` using the uppercased variable name.
10. **User-defined variable**: Checks if variable exists via `ctx.variables.get()`. If `null` (not found), returns `SCRIPT_ERROR`. Otherwise updates via `ctx.state.setVariable()`.

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Variable name expansion** | Variable name (group 1) is NOT expanded | Both variable name and value are expanded via `ctx.expand()` | **Enhancement**: New allows `{{!VAR1}}` in the variable name position. |
| **`!DATASOURCE` handling** | Calls `this.loadDataSource(param)` — immediately loads the datasource file | Stores the path via `ctx.state.setVariable('!DATASOURCE', value)` — deferred loading | **Behavioral difference**: Old triggers immediate file load; new only stores the path. The datasource is loaded later when DS command is used. |
| **`!TIMEOUT` storage** | Sets `this.timeout` (player property) directly | Calls `ctx.state.setVariable('!TIMEOUT', seconds)` | **Structural**: Different storage mechanism but same effect — both set the macro timeout. |
| **`!LOOP` storage** | Sets `this.currentLoop` (player property) directly | Calls `ctx.state.setVariable('!LOOP', loopNum)` | **Structural**: Different storage mechanism but same effect — both set the loop counter. |
| **`!VAR0`-`!VAR9` storage** | Stores in `this.vars[index]` numeric array | Stores via `ctx.state.setVariable('!VAR0', value)` by name | **Structural**: Array-indexed vs named variable store. Same external behavior. |
| **`!TIMEOUT` validation** | Uses `imns.s2i()` — rejects NaN only | Uses `parseFloat()` — rejects NaN **and** values `<= 0` | **Stricter**: New rejects zero and negative timeout values. Old allows `!TIMEOUT 0`. |
| **`!LOOP` parsing** | Uses `imns.s2i()` (likely `parseInt`) | Uses `parseInt(value, 10)` with explicit radix 10 | **Compatible**: Equivalent behavior. |
| **Supported var validation** | Checked via sequential `if/else if` chain and regex `/^var([0-9])/` | Checked via `Set.has()` against explicit whitelist | **Equivalent**: Same set of supported variables, different lookup mechanism. |
| **Error handling** | Throws `BadParameter` exceptions | Returns structured `CommandResult` with error codes (`MISSING_PARAMETER`, `INVALID_PARAMETER`, `SCRIPT_ERROR`) | **Improvement**: Non-throwing, more granular error handling. |
| **Case handling** | System variable name lowercased via `RegExp.$1.toLowerCase()` | Variable name uppercased via `.toUpperCase()` | **Compatible**: Both normalize case, just in different directions. Comparison against known names works either way. |
| **User variable lookup** | `this.hasUserVar(cmd[1])` / `this.setUserVar(cmd[1], param)` | `ctx.variables.get(upperVarName)` / `ctx.state.setVariable(upperVarName, value)` | **Structural**: Different APIs, same semantics — check existence, then update. |
| **Async model** | Synchronous | Async with `Promise<CommandResult>` | **Structural**: Consistent async/await pattern. |
| **Logging** | None | Logs `'CMDLINE: Setting <var> = <value>'` at info level, debug logs per variable | **Improvement**: Observability. |
| **Command registration** | `ActionTable["cmdline"]` (lowercase) | `systemHandlers.CMDLINE` (uppercase) | Internal naming convention only. |

## Output / Side Effects

- **Variables modified**: Sets the target variable (`!TIMEOUT`, `!LOOP`, `!DATASOURCE`, `!VAR0`-`!VAR9`, or user variable)
- **`!DATASOURCE` side effect (old only)**: Old immediately loads the datasource file via `loadDataSource()`
- **Return value**: Both return success/failure; new returns structured `CommandResult`
- **No `!EXTRACT` or other output**: CMDLINE only sets variables, does not produce extract data

## Test Coverage

### Parser tests (`tests/unit/parser.test.ts`)
- Parses `CMDLINE CMD=notepad.exe` as CMDLINE type (line 716)
- Included in supported commands list (line 886)

### Unit tests — CMDLINE handler (`tests/unit/system-handlers.test.ts`)
- Sets `!VAR1` to a string value (line 975)
- Sets `!VAR0` to a numeric string (line 985)
- Sets `!TIMEOUT` to a numeric value (stored as number) (line 994)
- Sets `!LOOP` to an integer value (stored as integer) (line 1003)
- Sets `!DATASOURCE` to a file path (line 1012)
- Returns `INVALID_PARAMETER` for unsupported system variable (`!URLCURRENT`) (line 1021)
- Returns `MISSING_PARAMETER` when less than 2 params (line 1031)
- Returns `MISSING_PARAMETER` when no params (line 1040)
- Sets existing user variable (pre-set via `SET`) (line 1049)
- Returns `SCRIPT_ERROR` for non-existent user variable (line 1060)
- Returns `INVALID_PARAMETER` for invalid timeout value (`abc`) (line 1070)
- Returns `INVALID_PARAMETER` for zero timeout (line 1080)
- Returns `INVALID_PARAMETER` for invalid loop value (`notanumber`) (line 1089)
- Sets all `!VAR0` through `!VAR9` (line 1099)
- CMDLINE via executor pipeline sets `!VAR1` (line 1110)
- CMDLINE via executor pipeline fails for unsupported system var (line 1117)

### Unit tests — handler registration (`tests/unit/system-handlers.test.ts`)
- CMDLINE registered in system handlers (line 1415)
- Registered CMDLINE handler matches `cmdlineHandler` export (line 1457)
- `cmdlineHandler` is a function (line 1513)

### Unit tests — additional branch coverage (`tests/unit/commands/system.test.ts`)
- Handler registration includes CMDLINE (lines 307, 332)
