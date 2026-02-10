# iimSet JS API Comparison

## Syntax

```javascript
// Old (jsplayer.js) - called from JS macro sandbox
iimSet(name, value)

// New (scripting-interface.ts) - called via TCP scripting interface
iimSet("name", "value")
```

**Old**: `sandbox.iimSet = function (name, val)` — takes a variable name and value, sets it on the macro player. Returns `1` on success.

**New**: `handleIimSet(args: string[]): CommandResult` — takes `[name, value]` string array, sets variable on the handler. Returns `{ code: ReturnCode.OK }` on success.

## Parameters

| Parameter | Required | Old | New | Description |
|-----------|----------|-----|-----|-------------|
| `name` | Yes | String — variable name, optionally prefixed with `-var_` | String — same format | Variable name to set. Supports `var1`–`var9` shorthand and optional `-var_` prefix. |
| `value` | Yes | Any (converted to string via `.toString()`) | String | Value to assign to the variable. |

## Old Implementation (jsplayer.js)

### Function Definition (jsplayer.js:334-349)

```javascript
sandbox.iimSet = function (name, val) {

    val = val.toString();
    var arr = name.match(/^(?:-var_)?(\w+)$/);
    if ( arr )
        name = arr[1];

    arr = name.match(/^var([0-9])$/i);
    if (arr) {
        iMacros.player.vars[imns.s2i(arr[1])] = val;
    } else {
        iMacros.player.setUserVar(name, val);
    }

    return 1;
};
```

### Step-by-step logic (old)

1. **Convert value to string**: `val = val.toString()` — ensures any type passed as value becomes a string.
2. **Strip `-var_` prefix**: `name.match(/^(?:-var_)?(\w+)$/)` — if the name starts with `-var_`, the prefix is removed (e.g., `-var_myvar` → `myvar`). If no match, `name` is unchanged.
3. **Check for var1–var9**: `name.match(/^var([0-9])$/i)` — case-insensitive match for `var0` through `var9`.
4. **Set built-in variable**: If `var1`–`var9` matched, sets `iMacros.player.vars[N] = val` where `N` is the digit converted via `imns.s2i()`. The `vars` array is a 10-element `Array` (`new Array(10)`) on the `MacroPlayer` instance, representing `!VAR0`–`!VAR9`.
5. **Set user variable**: If not a built-in var, calls `iMacros.player.setUserVar(name, val)` which stores the value in `this.userVars[name.toLowerCase()]` (MacroPlayer.js:4842-4843). User variables are case-insensitive via `toLowerCase()`.
6. **Return 1**: Always returns `1` (success) regardless of which path was taken.

### Storage details (old)

- **Built-in vars** (`var1`–`var9`): Stored in `player.vars[]`, a simple numeric-indexed array.
- **User vars**: Stored in `player.userVars{}`, an object keyed by lowercased variable name.
- **No validation**: No error is thrown for invalid names that don't match either regex — the name simply passes through unchanged.

### Sandbox Context (jsplayer.js:130-222)

Same as other iim* functions — the function is attached to a sandbox created with system principal and full chrome access. See [iimPlay.md](iimPlay.md) for full sandbox context details.

## New Implementation (scripting-interface.ts)

### Command Dispatch (scripting-interface.ts:656-657)

```typescript
case 'iimset':
  return this.handleIimSet(args);
```

### Handler (scripting-interface.ts:762-788)

```typescript
private handleIimSet(args: string[]): CommandResult {
  if (args.length < 2) {
    return {
      code: ReturnCode.INVALID_PARAMETER,
      data: 'iimSet requires variable name and value',
    };
  }

  let [name, value] = args;

  // Strip -var_ prefix (e.g., "-var_myvar" -> "myvar")
  const prefixMatch = name.match(/^(?:-var_)?(\w+)$/);
  if (prefixMatch) {
    name = prefixMatch[1];
  }

  // Map var1-var9 to !VAR1-!VAR9
  const varMatch = name.match(/^var([0-9])$/i);
  if (varMatch) {
    name = `!VAR${varMatch[1]}`;
  }

  this.handler.setVariable(name, value);
  this.emit('set', name, value);

  return { code: ReturnCode.OK };
}
```

### MacroHandler.setVariable (scripting-interface.ts:333-335)

```typescript
setVariable(name: string, value: string): void {
  this.variables.set(name, value);
}
```

Variables are stored in a `Map<string, string>` on the `ExecutorMacroHandler` instance (scripting-interface.ts:160).

### How variables are consumed during play (scripting-interface.ts:209-213)

```typescript
// Build initial variables from iimSet calls
const initialVariables: Record<string, string> = {};
for (const [key, value] of this.variables) {
  initialVariables[key] = value;
}
```

The variables map is iterated at the start of each `play()` call and passed to the executor as `initialVariables`.

### Step-by-step logic (new)

1. **Argument validation**: If fewer than 2 arguments, returns `{ code: ReturnCode.INVALID_PARAMETER, data: 'iimSet requires variable name and value' }`.
2. **Strip `-var_` prefix**: Same regex as old: `/^(?:-var_)?(\w+)$/` — removes `-var_` prefix if present.
3. **Map var1–var9 to `!VAR1`–`!VAR9`**: Same regex as old: `/^var([0-9])$/i` — but instead of setting a numeric array index, maps to the canonical `!VARn` name string.
4. **Store variable**: Calls `this.handler.setVariable(name, value)` which stores in a `Map<string, string>`.
5. **Emit event**: Emits `'set'` event with `(name, value)` for external listeners.
6. **Return OK**: Returns `{ code: ReturnCode.OK }`.

### Per-client isolation

Each TCP client gets its own `MacroHandler` instance, so variables set via `iimSet` are isolated per connection. One client's variables don't affect another client.

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Return value** | Always returns `1` (number) | Returns `{ code: ReturnCode.OK }` (CommandResult object) | **Minor**: TCP protocol returns `1\t\n` which is functionally equivalent. |
| **Value coercion** | `val.toString()` — converts any type to string | Value is already a string (comes from TCP text protocol) | **None**: Both end up with string values. |
| **Argument validation** | No validation — silently proceeds with `undefined` if missing | Returns `INVALID_PARAMETER` if fewer than 2 args | **Improvement**: New provides clear error for missing arguments. |
| **var1–var9 storage** | Stored in `player.vars[N]` (numeric array index) | Mapped to `!VAR1`–`!VAR9` string keys in a `Map` | **Internal**: Same logical mapping, different storage mechanism. Variables are accessible in macros identically. |
| **User var case handling** | `setUserVar` lowercases the name: `this.userVars[name.toLowerCase()]` | Stored as-is in the `Map` (case-sensitive) | **Behavioral**: Old is case-insensitive for user variables; new preserves case. See note below. |
| **Error handling** | No errors — always returns `1` | Returns `INVALID_PARAMETER` for missing args | **Improvement**: Better error reporting for malformed calls. |
| **Event emission** | No events | Emits `'set'` event with `(name, value)` | **New feature**: Enables external monitoring of variable changes. |
| **Empty string value** | Works — `"".toString()` is `""` | Parser strips empty quoted strings, resulting in `INVALID_PARAMETER` | **Behavioral**: Empty string values cannot be set via the new TCP interface due to parser behavior. |

### Case sensitivity note

In the old implementation, `setUserVar` lowercases variable names before storage (`this.userVars[name.toLowerCase()]`), making user variables case-insensitive. In the new implementation, `setVariable` stores names as-is in a `Map`, making them case-sensitive. However, the macro executor's variable resolution may normalize case separately, so the practical impact depends on how variables are resolved at execution time.

## Output / Side Effects

| Aspect | Old | New |
|--------|-----|-----|
| **Return value** | `1` (number) | `{ code: ReturnCode.OK }` |
| **Variables modified** | `player.vars[N]` for var1–var9, or `player.userVars[name]` for user vars | `handler.variables` Map entry |
| **Side effects** | Sets variable on the shared `iMacros.player` instance | Sets variable on per-client `MacroHandler`; emits `'set'` event |
| **Error handling** | None — always succeeds | Returns `INVALID_PARAMETER` if args missing |

## Test Coverage

### Integration tests (`tests/integration/scripting-interface.test.ts`)

**iimSet Command** (lines 355-449):
- **Sets variable and returns OK** (line 360): Sends `iimSet("myVar", "myValue")`, verifies `ReturnCode.OK` and variable stored correctly.
- **Handles multiple variable sets** (line 367): Sets three variables sequentially, verifies all stored independently.
- **Strips -var_ prefix** (line 377): Sends `iimSet("-var_myvar", "hello")`, verifies stored as `myvar`.
- **Maps var1-var9 to !VAR1-!VAR9** (line 383): Sends `iimSet("var1", ...)` and `iimSet("var9", ...)`, verifies stored as `!VAR1` and `!VAR9`.
- **Handles -var_ prefix with var1-var9 mapping** (line 391): Combined prefix stripping and var mapping: `-var_var3` → `!VAR3`.
- **Case-insensitive var1-var9 mapping** (line 397): `VAR5` and `Var7` both map to `!VAR5` and `!VAR7`.
- **Overwrites existing variable** (line 405): Sets same variable twice, verifies latest value.
- **Returns INVALID_PARAMETER when missing arguments** (line 412): Single arg returns error with descriptive message.
- **Returns INVALID_PARAMETER when no arguments** (line 419): Zero args returns error.
- **Empty string value returns INVALID_PARAMETER** (line 425): Parser strips empty strings, resulting in insufficient args.
- **Handles special characters in value** (line 434): Backslash sequences preserved literally.
- **Emits set event** (line 442): Verifies `'set'` event fired with correct name and value.
