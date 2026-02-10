# WAIT Command Comparison

## Syntax

```
WAIT SECONDS=<number>
```

**Old regex**: `"^seconds\\s*=\\s*(\\S+)\\s*$"` (case-insensitive)
- Single capture group: the seconds value (any non-whitespace string).

**New parser**: `parser.ts:663-672` — Validates that a `SECONDS` parameter exists; rejects the command at parse time if missing.

## Parameters

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| SECONDS | Yes | Number (supports decimals) | Duration to wait in seconds |

The SECONDS value supports variable expansion (e.g., `SECONDS={{!VAR1}}`).

## Old Implementation (MacroPlayer.js:3287-3331)

### Regex

```javascript
MacroPlayer.prototype.RegExpTable["wait"] = "^seconds\\s*=\\s*(\\S+)\\s*$";
```

Single capture group `(\\S+)` matches any non-whitespace value for the seconds parameter.

### Action handler

```javascript
MacroPlayer.prototype.ActionTable["wait"] = function (cmd) {
    var param = Number(imns.unwrap(this.expandVariables(cmd[1])));

    if (isNaN(param))
        throw new BadParameter("SECONDS=<number>", 1);
    param = Math.round(param*10)*100;
    if (param == 0)
        param = 10;
    else if (param < 0)
        throw new BadParameter("positive number of seconds", 1);
    new WaitReporter(param);
};
```

### WaitReporter class (MacroPlayer.js:3289-3318)

The wait is implemented as a timer-based reporter that fires every 100ms:

```javascript
function WaitReporter( delay ) {
    this.period = 100;
    this.counter = Math.round(delay/this.period);
    if (this.counter <= 0)
        this.counter = 1;
    this.timer = imns.Cc["@mozilla.org/timer;1"].
        createInstance(imns.Ci.nsITimer);
    this.timer.initWithCallback(this, this.period,
                                imns.Ci.nsITimer.TYPE_REPEATING_PRECISE);
    iMacros.player.inWaitCommand = true;
}

WaitReporter.prototype = {
    notify: function(timer) {
        var mplayer = iMacros.player;
        this.counter--;
        iMacros.panel.statLine1 = "Waiting: "+
            (this.counter/1000*this.period).toFixed(2).toString();
        if (!this.counter || !mplayer.playing || mplayer.pauseIsPending) {
            iMacros.panel.statLine1 = "";
            this.timer.cancel();
            mplayer.inWaitCommand = false;
            if (mplayer.pauseIsPending) {
                mplayer.waitCommandSuspended = true;
                mplayer.waitCommandRemains = this.counter*this.period;
            }
            setTimeout(function () { mplayer.playNextAction() }, 0);
        }
    }
};
```

### Step-by-step logic (old)

1. **Variable expansion**: `cmd[1]` (captured seconds value) is expanded via `expandVariables()` and unwrapped.
2. **Parse to number**: Converted with `Number()`. If `NaN`, throws `BadParameter("SECONDS=<number>", 1)`.
3. **Quantize**: `Math.round(param*10)*100` — rounds to the nearest 100ms. E.g., `SECONDS=1.23` → `1200ms`, `SECONDS=0.05` → `0ms` → clamped to `10ms`.
4. **Zero floor**: If quantized result is `0`, sets to `10` (10ms minimum).
5. **Negative check**: If negative, throws `BadParameter("positive number of seconds", 1)`.
6. **Create WaitReporter**: Instantiates a repeating timer that fires every 100ms.
7. **Set inWaitCommand**: `iMacros.player.inWaitCommand = true` signals the execution loop that a WAIT is active.
8. **Timer tick**: Each 100ms, decrements counter and updates the status line with remaining time.
9. **Completion**: When counter reaches 0, or macro is stopped, or PAUSE is pending:
   - Clears the status line.
   - Cancels the timer.
   - Sets `inWaitCommand = false`.
   - If PAUSE is pending, saves remaining time (`waitCommandSuspended = true`, `waitCommandRemains`).
   - Calls `playNextAction()` via `setTimeout(fn, 0)` to continue execution.

### Key details (old)

- **Timer-based async**: Uses Mozilla's `nsITimer` (XPCOM) for precise repeating callbacks, not JavaScript `setTimeout`.
- **Status line display**: Updates `iMacros.panel.statLine1` with a countdown every 100ms showing remaining seconds.
- **PAUSE interaction**: If a PAUSE is pending during WAIT, the remaining time is saved in `waitCommandRemains` and the timer stops. When un-paused (via `playNextAction` checking `waitCommandSuspended`), WAIT resumes with `new WaitReporter(this.waitCommandRemains)`.
- **Quantization formula**: `Math.round(param*10)*100` rounds the input (seconds) to one decimal place, then converts to milliseconds. This means the actual wait granularity is 100ms.
- **Abort support**: The timer checks `mplayer.playing` each tick and stops if the macro has been stopped.

## New Implementation

### Two implementations

The new code has **two** WAIT implementations:

#### 1. Executor built-in handler (executor.ts:437-453)

```typescript
this.registerHandler('WAIT', async (ctx) => {
    const secondsStr = ctx.getRequiredParam('SECONDS');
    const seconds = parseFloat(ctx.expand(secondsStr));

    if (isNaN(seconds) || seconds < 0) {
        return {
            success: false,
            errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
            errorMessage: `Invalid SECONDS value: ${secondsStr}`,
        };
    }

    ctx.log('info', `Waiting ${seconds} seconds...`);
    await this.delay(seconds * 1000);
    return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
});
```

This uses the executor's `delay()` method:

```typescript
private async delay(ms: number): Promise<void> {
    const chunkSize = 100; // Check abort every 100ms
    let remaining = ms;

    while (remaining > 0 && !this.abortFlag) {
        const wait = Math.min(remaining, chunkSize);
        await new Promise<void>((resolve) => setTimeout(resolve, wait));
        remaining -= wait;
    }
}
```

#### 2. Flow control handler (flow.ts:232-279)

```typescript
export const waitHandler: CommandHandler = async (ctx) => {
    const secondsParam = ctx.getParam('SECONDS');

    if (!secondsParam) {
        return {
            success: false,
            errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
            errorMessage: 'WAIT command requires SECONDS parameter',
        };
    }

    const expandedValue = ctx.expand(secondsParam);
    const seconds = parseSeconds(expandedValue);

    if (seconds <= 0) {
        return {
            success: false,
            errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
            errorMessage: `Invalid SECONDS value: ${secondsParam} (expanded: ${expandedValue})`,
        };
    }

    // Respect !TIMEOUT_STEP if set
    const timeoutStep = ctx.state.getVariable('!TIMEOUT_STEP');
    const maxWait = typeof timeoutStep === 'number' ? timeoutStep :
        typeof timeoutStep === 'string' ? parseFloat(timeoutStep) : Infinity;

    const actualWait = Math.min(seconds, maxWait > 0 ? maxWait : seconds);

    // Quantize to 100ms increments with 10ms floor (matches original iMacros 8.9.7)
    const rawMs = actualWait * 1000;
    const waitMs = Math.max(10, Math.round(rawMs / 100) * 100);

    ctx.log('info', `Waiting ${actualWait} second${actualWait !== 1 ? 's' : ''}...`);
    await pauseAwareDelay(waitMs, ctx);
    ctx.log('debug', `Wait completed (${actualWait}s)`);

    return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
};
```

### Helper functions

**`parseSeconds`** (flow.ts:214-217): Parses the string value, returns 0 for invalid input.

**`pauseAwareDelay`** (flow.ts:195-209): Splits the delay into 100ms chunks and checks for PAUSE state between each chunk:

```typescript
async function pauseAwareDelay(ms: number, ctx: CommandContext): Promise<void> {
    const chunkSize = 100;
    let remaining = ms;
    while (remaining > 0) {
        while (ctx.state.getStatus() === ExecutionStatus.PAUSED) {
            await delay(50);
        }
        const wait = Math.min(remaining, chunkSize);
        await delay(wait);
        remaining -= wait;
    }
}
```

### Parser validation (parser.ts:663-672)

```typescript
case 'WAIT': {
    const secondsParam = command.parameters.find(p => p.key.toUpperCase() === 'SECONDS');
    if (!secondsParam) {
        return {
            lineNumber: command.lineNumber,
            message: 'WAIT command requires SECONDS parameter',
            raw: command.raw,
        };
    }
    break;
}
```

The parser validates that `SECONDS` is present at parse time, before execution.

### Step-by-step logic (new — executor built-in)

1. **Get parameter**: `ctx.getRequiredParam('SECONDS')` extracts the SECONDS value (throws if missing).
2. **Expand & parse**: Variable expansion via `ctx.expand()`, then `parseFloat()`.
3. **Validate**: If `NaN` or negative, returns `INVALID_PARAMETER` error.
4. **Delay**: Calls `this.delay(seconds * 1000)` which splits into 100ms chunks, checking `abortFlag` each chunk.
5. **Return**: Success on completion.

### Step-by-step logic (new — flow handler)

1. **Get parameter**: `ctx.getParam('SECONDS')` — returns `undefined` if missing (softer than `getRequiredParam`).
2. **Missing check**: Returns `MISSING_PARAMETER` if absent.
3. **Expand & parse**: Variable expansion via `ctx.expand()`, then `parseSeconds()` (returns 0 for invalid).
4. **Validate**: If `seconds <= 0`, returns `INVALID_PARAMETER` error.
5. **`!TIMEOUT_STEP` check**: If the `!TIMEOUT_STEP` variable is set and the requested wait exceeds it, caps the wait time to `!TIMEOUT_STEP` seconds.
6. **Quantize**: `Math.max(10, Math.round(rawMs / 100) * 100)` — rounds to nearest 100ms with a 10ms floor, matching the old implementation's quantization.
7. **Pause-aware delay**: Uses `pauseAwareDelay()` which splits into 100ms chunks and checks for PAUSE state between each chunk.
8. **Return**: Success on completion.

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Async mechanism** | XPCOM `nsITimer` repeating timer with `notify()` callback; non-blocking via event loop | Promise-based `async/await` with `setTimeout` in 100ms chunks | **Structural**: Same observable timing; different async pattern |
| **Quantization** | `Math.round(param*10)*100` — rounds seconds to 1 decimal place, then to ms | Flow handler: `Math.max(10, Math.round(rawMs / 100) * 100)` — same 100ms granularity. Executor built-in: no quantization (raw ms) | **Minor**: Flow handler matches old behavior; executor built-in passes raw ms |
| **Zero handling** | `0` quantized result → clamped to `10ms`; still executes (not an error) | Flow handler: `seconds <= 0` returns `INVALID_PARAMETER` error. Executor built-in: `seconds < 0` fails, `0` passes through | **Behavioral**: Flow handler rejects `SECONDS=0`; old allowed it (as 10ms wait) |
| **Negative handling** | Throws `BadParameter("positive number of seconds", 1)` | Both handlers return `INVALID_PARAMETER` error result | **Compatible**: Both reject negative values |
| **NaN handling** | Throws `BadParameter("SECONDS=<number>", 1)` | Both handlers return error (INVALID_PARAMETER or SCRIPT_ERROR) | **Compatible**: Both reject non-numeric values |
| **Status line display** | Updates `iMacros.panel.statLine1` with countdown every 100ms | Logs `info` message at start and `debug` message at end; no real-time countdown | **Visual**: No live countdown in the new implementation |
| **PAUSE interaction** | Saves remaining time to `waitCommandRemains`, resumes after un-pause | Flow handler: `pauseAwareDelay()` polls for PAUSED state every 50ms, suspends progress. Executor built-in: no pause awareness (only abort-aware) | **Compatible**: Both preserve remaining wait time across pause |
| **Abort support** | Checks `mplayer.playing` each timer tick | Executor built-in: checks `abortFlag` each 100ms chunk. Flow handler: only pause-aware, not abort-aware | **Minor**: Executor built-in is abort-aware; flow handler relies on executor-level abort |
| **`!TIMEOUT_STEP` cap** | Not supported — WAIT always runs for the full duration | Flow handler respects `!TIMEOUT_STEP` variable and caps wait time | **Enhancement**: Flow handler adds `!TIMEOUT_STEP` support |
| **Parser validation** | Regex-only validation at match time | Parser validates `SECONDS` parameter exists at parse time (before execution) | **Enhancement**: Earlier error detection |
| **Dual implementation** | Single implementation in `MacroPlayer` | Two handlers: executor built-in (simpler) and flow.ts (richer, with quantization and `!TIMEOUT_STEP`) | **Structural**: Flow handler overrides built-in when registered |
| **Error codes** | Throws `BadParameter` exception objects | Returns structured `CommandResult` with `errorCode` and `errorMessage` | **Structural**: Error-as-value pattern vs exception |
| **Variable expansion** | `this.expandVariables(cmd[1])` + `imns.unwrap()` | `ctx.expand(secondsParam)` | **Compatible**: Both expand variables before parsing |

## Output / Side Effects

- **Variables modified**: None
- **Return value (old)**: No return — creates a `WaitReporter` that controls execution flow via timer callbacks. Macro execution continues via `playNextAction()` called from the timer's final tick.
- **Return value (new — executor)**: `{ success: true, errorCode: OK }` on completion; `{ success: false, errorCode: INVALID_PARAMETER }` on invalid input
- **Return value (new — flow)**: `{ success: true, errorCode: OK }` on completion; `{ success: false, errorCode: MISSING_PARAMETER | INVALID_PARAMETER }` on invalid input
- **Side effects (old)**: Updates `iMacros.panel.statLine1` with countdown text every 100ms; sets/clears `inWaitCommand` flag; may save `waitCommandSuspended`/`waitCommandRemains` if PAUSE interrupts
- **Side effects (new)**: Logs info/debug messages; delays execution via `setTimeout` chunking

## Test Coverage

### Unit tests — flow handlers (tests/unit/flow-handlers.test.ts)

- `WAIT SECONDS=0.01` succeeds (line 204-208)
- Returns `MISSING_PARAMETER` when `SECONDS` is missing (lines 210-221)
- Returns `INVALID_PARAMETER` for `SECONDS=0` (lines 223-233)
- Returns `INVALID_PARAMETER` for `SECONDS=abc` (lines 235-244)
- Actually delays execution (verify with timing) (lines 247-262)
- Supports variable expansion in `SECONDS` value (lines 264-277)
- Succeeds with decimal values like `SECONDS=0.01` (lines 279-289)
- `registerFlowHandlers` registers WAIT, PAUSE, PROMPT (lines 945-956)
- `flowHandlers` export contains WAIT handler (lines 976-979)
- Executes WAIT through the executor (lines 991-994)
- Overrides built-in WAIT handler when flow handlers are registered (lines 1001-1004)

### Unit tests — executor (tests/unit/executor.test.ts)

- Waits for the specified number of seconds (lines 264-270)
- Fails WAIT with invalid SECONDS value (lines 273-277)
- Fails WAIT with negative SECONDS (lines 280-284)
- Fails WAIT when SECONDS parameter is missing (lines 287-291)
- Stop execution interrupts WAIT (lines 522-534)
- Reports errors from `executeMacro` with WAIT (lines 609-615)
- Includes `executionTimeMs` with WAIT (lines 782-785)

### Integration tests — wait-pause (tests/integration/commands/wait-pause.test.ts)

- Executor built-in WAIT delays for integer seconds (lines 41-54)
- Executor built-in WAIT delays for decimal seconds 0.5 (lines 55-67)
- Executor built-in WAIT expands variables in SECONDS parameter (lines 69-82)
- Executor built-in WAIT fails when SECONDS is missing (lines 84-93)
- Executor built-in WAIT fails when SECONDS is negative (lines 95-102)
- Executor built-in WAIT fails when SECONDS is not a number (lines 104-111)
- Executor built-in WAIT handles SECONDS=0 (lines 113-127)
- Flow.ts `waitHandler` delays for specified seconds (lines 201-215)
- Flow.ts `waitHandler` handles decimal seconds (lines 216-228)
- Flow.ts `waitHandler` expands variables in SECONDS (lines 230-243)
- Flow.ts `waitHandler` returns MISSING_PARAMETER when SECONDS absent (lines 245-258)
- Flow.ts `waitHandler` returns INVALID_PARAMETER for negative seconds (lines 261-269)
- Flow.ts `waitHandler` caps wait time when `!TIMEOUT_STEP` is set (lines 271-282)
- Multi-command: SET then WAIT then SET (lines 395-409)
- Multiple WAIT commands in sequence (lines 411-425)
- WAIT with flow.ts pauseHandler in same macro (lines 427-447)
- Three consecutive WAIT commands (lines 449-463)
- WAIT with very small decimal value 0.1 (lines 465-476)
- Set variable before and after WAIT (lines 478-493)
