# iimGetLastPerformance JS API Comparison

## Syntax

```javascript
// Old (jsplayer.js) - called from JS macro sandbox
iimGetLastPerformance()

// New (scripting-interface.ts) - called via TCP scripting interface
iimGetLastPerformance()
```

**Old**: `sandbox.iimGetLastPerformance = function()` — no arguments. Always throws `"iimGetLastPerformance not supported!"`.

**New**: `handleIimGetLastPerformance(): CommandResult` — no arguments. Returns `{ code: ReturnCode.OK, data: JSON.stringify(performanceData) }` or `{ code: ReturnCode.OK, data: '' }` if no macro has been executed.

## Parameters

| Parameter | Required | Old | New | Description |
|-----------|----------|-----|-----|-------------|
| *(none)* | — | No parameters | No parameters | Neither implementation accepts arguments. |

## Old Implementation (jsplayer.js)

### Function Definition (jsplayer.js:330-332)

```javascript
sandbox.iimGetLastPerformance = function() {
    throw "iimGetLastPerformance not supported!";
};
```

### Step-by-step logic (old)

1. **Unconditional throw**: The function immediately throws the string `"iimGetLastPerformance not supported!"`.
2. **No return value**: The function never returns — every call results in an exception.

### Notes

This function was defined in the iMacros 8.9.7 Chrome extension but never implemented. It was a stub that always threw an error. The iMacros scripting interface documentation mentions this function for getting STOPWATCH timing data, but the Chrome extension version did not support it.

### Sandbox Context (jsplayer.js:130-222)

Same as other iim* functions — the function is attached to a sandbox created with system principal and full chrome access. See [iimPlay.md](iimPlay.md) for full sandbox context details.

## New Implementation (scripting-interface.ts)

### Command Dispatch (scripting-interface.ts:679-680)

```typescript
case 'iimgetlastperformance':
  return this.handleIimGetLastPerformance();
```

### Handler (scripting-interface.ts:884-896)

```typescript
/**
 * Handle iimGetLastPerformance command - Get performance data from last macro execution
 *
 * Returns timing data from the last macro run as a JSON string containing:
 * - totalTimeMs: Total execution time in milliseconds
 * - startTime: Start time as ISO 8601 string (UTC)
 * - endTime: End time as ISO 8601 string (UTC)
 * - loopsCompleted: Number of loops completed
 * - commandsExecuted: Number of commands executed
 * - success: Whether the macro completed successfully
 * - errorCode: Error code if failed (0 = success)
 */
private handleIimGetLastPerformance(): CommandResult {
  const performance = this.handler.getLastPerformance();
  if (!performance) {
    return {
      code: ReturnCode.OK,
      data: '',
    };
  }
  return {
    code: ReturnCode.OK,
    data: JSON.stringify(performance),
  };
}
```

### MacroHandler.getLastPerformance (scripting-interface.ts:349-351)

```typescript
getLastPerformance(): PerformanceData | null {
  return this.lastPerformance;
}
```

### PerformanceData Interface (scripting-interface.ts:107-122)

```typescript
export interface PerformanceData {
  /** Total execution time in milliseconds */
  totalTimeMs: number;
  /** Start time as ISO 8601 string (UTC) */
  startTime: string;
  /** End time as ISO 8601 string (UTC) */
  endTime: string;
  /** Number of loops completed */
  loopsCompleted: number;
  /** Number of commands executed */
  commandsExecuted: number;
  /** Whether the macro completed successfully */
  success: boolean;
  /** Error code if failed (0 = success) */
  errorCode: number;
}
```

### How lastPerformance is Set (ExecutorMacroHandler)

The `lastPerformance` is a private field initialized to `null` (scripting-interface.ts:161):

1. **Reset on play** (scripting-interface.ts:203): `this.lastPerformance = null` — cleared at the start of each `play()` call.
2. **Parse errors** (scripting-interface.ts:248-255): Set with `success: false`, `loopsCompleted: 0`, `commandsExecuted: 0`, timing from `startTime` to current time.
3. **Successful execution** (scripting-interface.ts:284-292): Set with `totalTimeMs` from executor result, ISO timestamps, `loopsCompleted` and `commandsExecuted` from result, `success: true`.
4. **Failed execution** (scripting-interface.ts:284-292): Same path as success, but with `success: false` and mapped error code.
5. **Exceptions** (scripting-interface.ts:315-323): Set with `success: false`, `loopsCompleted: 0`, timing from `startTime` to current time, error code `TIMEOUT` or `ERROR`.

### Step-by-step logic (new)

1. **Command parsing**: The TCP command `iimGetLastPerformance()` is parsed; function name is lowercased and matched to `'iimgetlastperformance'`.
2. **Delegate to handler**: Calls `this.handler.getLastPerformance()` on the `MacroHandler` instance.
3. **Null check**: If no performance data exists (no macro has been executed yet), returns `{ code: ReturnCode.OK, data: '' }`.
4. **Serialize**: If performance data exists, serializes it to JSON and returns `{ code: ReturnCode.OK, data: JSON.stringify(performance) }`.
5. **TCP response**: The result is serialized as `CODE\tDATA\n` and sent back to the TCP client.

### Per-client isolation

Each TCP client gets its own `MacroHandler` instance, so `lastPerformance` is isolated per connection. One client's performance data doesn't affect another client's `iimGetLastPerformance()` result.

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Implementation** | Stub — always throws `"iimGetLastPerformance not supported!"` | Fully implemented — returns JSON-serialized performance data | **Major**: Old was never functional; new provides complete performance tracking. |
| **Return value** | Never returns (throws) | JSON string with `PerformanceData` fields, or empty string if no macro executed | **Major**: Scripts using this function would have crashed in 8.9.7; they now work in Remastered. |
| **Data fields** | N/A (not implemented) | `totalTimeMs`, `startTime`, `endTime`, `loopsCompleted`, `commandsExecuted`, `success`, `errorCode` | **New feature**: Comprehensive execution metrics not available in old version. |
| **Error handling** | Throws string exception | Returns `ReturnCode.OK` with empty string when no data available | **Improvement**: New gracefully handles the no-data case without exceptions. |
| **State scope** | N/A | Per-client `lastPerformance` on `MacroHandler` — isolated per TCP connection | **Improvement**: Each client gets independent performance tracking. |
| **Reset timing** | N/A | Reset to `null` at start of `play()` method | Performance data is always from the most recent execution. |

## Output / Side Effects

| Aspect | Old | New |
|--------|-----|-----|
| **Return value** | Never returns — throws `"iimGetLastPerformance not supported!"` | `{ code: ReturnCode.OK, data: string }` — JSON string with performance data or empty string |
| **Variables modified** | None | None — read-only access to `this.lastPerformance` |
| **Side effects** | Throws exception | None |
| **Error handling** | Always throws | Always returns OK — returns empty data string when no performance data available |

## Test Coverage

### Unit tests (`tests/unit/scripting-interface.test.ts`)

**Performance tracking (iimGetLastPerformance)** (lines 88-167):
- **Returns null when no macro executed** (line 89): Verifies `getLastPerformance()` returns `null` before any play.
- **Captures performance after success** (line 93): Plays a valid macro, verifies `success: true`, `errorCode: ReturnCode.OK`, `totalTimeMs >= 0`, timestamps defined.
- **Captures performance after failure** (line 106): Plays invalid macro, verifies `success: false`, non-OK error code.
- **Valid ISO 8601 timestamps** (line 115): Verifies `startTime` and `endTime` are valid ISO strings that round-trip through `Date`.
- **endTime >= startTime** (line 127): Verifies temporal ordering of timestamps.
- **Tracks loops completed** (line 137): Single-loop macro should report `loopsCompleted: 1`.
- **Resets on new execution** (line 144): Plays two macros sequentially, verifies different `startTime` values.
- **Captures on parse error** (line 158): Invalid syntax produces `success: false`, `loopsCompleted: 0`, `commandsExecuted: 0`.

**iimGetLastPerformance command integration** (lines 296-347):
- **JSON serialization round-trip** (line 303): Verifies `JSON.stringify`/`JSON.parse` preserves all fields.
- **All required fields present** (line 323): Verifies `toHaveProperty` for all 7 `PerformanceData` fields.
- **Consistent timing values** (line 336): Verifies `totalTimeMs` approximately matches `endTime - startTime` (within 100ms tolerance).
