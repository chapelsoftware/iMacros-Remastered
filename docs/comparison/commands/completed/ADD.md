# ADD Command Comparison

## Syntax

```
ADD <variable> <value>
```

**Old regex**: `^(\S+)\s+(im_strre)\s*$`
- `cmd[1]` = variable name
- `cmd[2]` = value (supports quoted strings and EVAL expressions via `im_strre`)

**New parser**: Positional parameters — `params[0].key` = variable name, `params[1].rawValue` = value

## Parameters

| Parameter | Description | Old | New |
|-----------|-------------|-----|-----|
| variable | Target variable (`!VAR0`-`!VAR9`, `!EXTRACT`, or user-defined) | `cmd[1]` | `params[0].key` |
| value | Value to add (numeric for addition, string for concatenation) | `cmd[2]`, unwrapped and expanded | `params[1].rawValue`, expanded via `ctx.expand()` |

## Old Implementation (MacroPlayer.js:159-187)

```javascript
MacroPlayer.prototype.ActionTable["add"] = function (cmd) {
    var param = imns.unwrap(this.expandVariables(cmd[2]));
    var m = null;

    if ( m = cmd[1].match(/^!var([0-9])$/i) ) {
        var num = imns.s2i(m[1]);
        var n1 = imns.s2i(this.vars[num]), n2 = imns.s2i(param);
        if ( !isNaN(n1) && !isNaN(n2) ) {
            this.vars[num] = (n1 + n2).toString();
        } else {
            this.vars[num] += param;
        }
    } else if ( arr = cmd[1].match(/^!extract$/i) ) {
        this.addExtractData(param);
    } else if (/^!\S+$/.test(cmd[1])) {
        throw new BadParameter("Unsupported variable "+cmd[1]+
                               " for ADD command");
    } else {
        if (!this.hasUserVar(cmd[1])) {
            throw new BadParameter("Undefinded variable "+cmd[1]);
        }
        var n1 = imns.s2i(this.getUserVar(cmd[1])), n2 = imns.s2i(param);
        if ( !isNaN(n1) && !isNaN(n2) ) {
            this.setUserVar(cmd[1], (n1 + n2).toString());
        } else {
            this.setUserVar(cmd[1], this.getUserVar(cmd[1])+param);
        }
    }
};
```

### Step-by-step logic (old)

1. **Expand & unwrap** value: `imns.unwrap(this.expandVariables(cmd[2]))` — expands `{{var}}` references, strips surrounding quotes
2. **Check variable type**:
   - **`!VAR0`-`!VAR9`** (case-insensitive): Extract digit via regex, convert both current and added values with `imns.s2i()` (strict integer parse using `parseInt`). If both are valid integers, perform integer addition and store as string via `.toString()`. Otherwise, string concatenation via `+=`.
   - **`!EXTRACT`** (case-insensitive): Delegates to `this.addExtractData(param)` which appends with `[EXTRACT]` delimiter.
   - **Other `!` variables**: Throws `BadParameter("Unsupported variable ...")`.
   - **User variables** (no `!` prefix): Checks existence with `hasUserVar()`, throws `BadParameter("Undefinded variable ...")` if missing. Same `s2i` numeric check: integer addition if both numeric, string concatenation otherwise.

### `imns.s2i()` (utils.js:913-922)

```javascript
s2i: function (num) {
    var s = num.toString();
    s = s.replace(/^\s+/, "").replace(/\s+$/, "");
    if (!s.length) return Number.NaN;
    var n = parseInt(s);
    if (n.toString().length != s.length) return Number.NaN;
    return n;
}
```

**Key behavior**: Uses `parseInt()` and requires the parsed result's string length to equal the trimmed input length. This means **only strict integers** are treated as numeric — values like `"10.5"` return `NaN` because `parseInt("10.5")` gives `10` whose `.toString()` is `"10"` (length 2 != length 4).

### `addExtractData()` (MacroPlayer.js:4860-4866)

```javascript
MacroPlayer.prototype.addExtractData = function(str) {
    if ( this.extractData.length ) {
        this.extractData += "[EXTRACT]"+str;
    } else {
        this.extractData = str;
    }
};
```

Uses string-based accumulation with `[EXTRACT]` delimiter.

## New Implementation

### Executor (executor.ts:411-435)

```typescript
this.registerHandler('ADD', async (ctx) => {
    const params = ctx.command.parameters;
    if (params.length < 2) {
        return { success: false, errorCode: MISSING_PARAMETER, errorMessage: '...' };
    }
    const varName = params[0].key;
    const value = ctx.expand(params[1].rawValue || params[1].value);
    const result = executeAdd(ctx.variables, varName, value);
    if (!result.success) {
        return { success: false, errorCode: SCRIPT_ERROR, errorMessage: result.error };
    }
    ctx.log('debug', `ADD ${varName} + ${result.addedValue} = ${result.newValue}`);
    return { success: true, errorCode: OK };
});
```

### `executeAdd()` (variables.ts:1073-1089)

```typescript
export function executeAdd(context: VariableContext, varName: string, value: string): AddResult {
    const { expanded } = context.expand(value);
    const upperName = varName.toUpperCase();
    if (upperName === '!EXTRACT') {
        return context.addExtractData(expanded);
    }
    return context.add(varName, expanded);
}
```

### `VariableContext.add()` (variables.ts:569-617)

```typescript
add(name: string, value: string): AddResult {
    const upperName = name.toUpperCase();
    const currentValue = this.get(upperName);
    if (value === '') {
        return { success: true, previousValue: currentValue, addedValue: '', newValue: currentValue ?? '' };
    }
    const currentStr = String(currentValue ?? '');
    const isCurrentEmpty = currentStr === '';
    const currentNum = isCurrentEmpty ? 0 : parseFloat(currentStr);
    const addNum = parseFloat(value);
    if (!isNaN(addNum) && (isCurrentEmpty || !isNaN(currentNum))) {
        const newValue = currentNum + addNum;
        const setResult = this.set(name, newValue);
        return { success: setResult.success, previousValue: currentValue, addedValue: addNum, newValue: ... };
    }
    const newValue = currentStr + value;
    const setResult = this.set(name, newValue);
    return { success: setResult.success, previousValue: currentValue, addedValue: value, newValue: ... };
}
```

### `VariableContext.addExtractData()` (variables.ts:623-645)

Uses array-based accumulation (`this.extractAccumulator`), joins with `[EXTRACT]` delimiter, updates both `!EXTRACT` and `!EXTRACTADD`.

### Step-by-step logic (new)

1. **Expand** value via `ctx.expand()` — resolves `{{var}}` references
2. **Check for `!EXTRACT`**: If target is `!EXTRACT`, delegates to `addExtractData()` which appends to an array accumulator and joins with `[EXTRACT]` delimiter.
3. **All other variables** (including `!VAR0`-`!VAR9`, user vars, system vars): Handled uniformly by `VariableContext.add()`:
   - Empty value is a no-op
   - Uses `parseFloat()` on both current and added values
   - If added value is numeric AND current value is either empty or numeric: floating-point addition, stores result as number
   - Otherwise: string concatenation

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Numeric parsing** | `imns.s2i()` — strict `parseInt()`, integers only | `parseFloat()` — supports decimals | **Behavioral**: Old treats `"10.5"` as non-numeric (concatenates); new treats it as `10.5` (adds). More flexible in new. |
| **Numeric result storage** | Stores as string via `.toString()` | Stores as number type | Minor: downstream consumers may see `number` vs `string` |
| **Variable dispatch** | Three separate branches: `!VAR0-9`, `!EXTRACT`, user vars | Unified: `!EXTRACT` special-cased, everything else goes through `VariableContext.add()` | Cleaner architecture, same behavior |
| **Unsupported `!` vars** | Throws `BadParameter("Unsupported variable ...")` for unknown `!`-prefixed vars | `VariableContext.add()` calls `this.set()` which succeeds for any variable | **Behavioral**: Old rejects `ADD !TIMEOUT 5`; new would allow it |
| **Undefined user vars** | Throws `BadParameter("Undefinded variable ...")` if user var not yet set | `this.get()` returns `null`/empty, treated as `0` for numeric add | **Behavioral**: Old requires prior SET; new auto-initializes to 0/empty |
| **Empty value handling** | Not explicitly handled — concatenates empty string | Explicit no-op return for empty string | Equivalent outcome |
| **Extract accumulation** | String-based: `this.extractData += "[EXTRACT]"+str` | Array-based: `this.extractAccumulator.push(value)`, joined at output | Same result, different internal representation |
| **`!EXTRACTADD` update** | Not updated by ADD | Updated alongside `!EXTRACT` in `addExtractData()` | New sets `!EXTRACTADD` to same value as `!EXTRACT` |
| **Error handling** | Throws exceptions (`BadParameter`) | Returns `{ success: false, errorCode, errorMessage }` | Structural difference; both communicate errors to caller |
| **Variable expansion** | `this.expandVariables()` + `imns.unwrap()` | `ctx.expand()` | Same purpose, different mechanism |

## Output / Side Effects

- **Variables modified**: Target variable (`!VAR0`-`!VAR9`, `!EXTRACT`, or user variable)
- **When target is `!EXTRACT`**: Also updates `!EXTRACTADD` (new only)
- **No DOM side effects**
- **No navigation side effects**

## Test Coverage

### Unit tests (`tests/unit/set-add-functions.test.ts`)
- `executeAdd` with existing numeric variable
- ADD to empty variable (treated as 0)
- Decimal number addition
- Negative number addition
- String concatenation for non-numeric values
- Variable reference expansion in value
- Concatenation when current value is non-numeric string
- Adding zero
- Negative results

### Integration tests (`tests/integration/commands/set-add.test.ts`)
- Basic ADD to numeric variable
- ADD to empty variable
- Accumulating multiple ADD operations
- Decimal and negative number addition
- Adding zero
- ADD to `!VAR0` and `!VAR9`
- Error cases: no parameters, missing value
- String concatenation for non-numeric values
- Variable reference expansion
- Combined SET/ADD workflows
- Loop accumulation with ADD
