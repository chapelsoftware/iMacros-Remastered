# STOPWATCH Command Comparison

## Syntax

```
STOPWATCH ID=<name>
STOPWATCH START ID=<name>
STOPWATCH STOP ID=<name>
STOPWATCH LABEL=<name>
STOPWATCH ID=<name> ACTION=START|STOP|LAP|READ
STOPWATCH ACTION=<action>
STOPWATCH
```

**Old regex**: `"^((?:(start|stop)\\s+)?id|label)\\s*=\\s*(<im_strre>)\\s*$"` — captures optional `START`/`STOP` prefix (group 2), `ID` or `LABEL` keyword (group 1), and the value (group 3).

**New parser**: `parser.ts:717-728` — No parameter validation; bare `STOPWATCH` is valid (toggles default). Parameters parsed generically by the key=value parser. Also supports `ACTION=START|STOP|LAP|READ` extended syntax not present in old implementation.

## Parameters

| Parameter | Position | Required | Values | Description |
|-----------|----------|----------|--------|-------------|
| ID | Named | No | Any string (uppercased) | Stopwatch identifier; defaults to `"default"` if omitted |
| START | Prefix flag | No | (keyword before ID) | Explicit start (original prefix syntax) |
| STOP | Prefix flag | No | (keyword before ID) | Explicit stop (original prefix syntax) |
| LABEL | Named | No | Any string (uppercased) | Record a timestamp label |
| ACTION | Named | No | START, STOP, LAP, READ | Extended syntax for specifying action (new addition) |

## Old Implementation (MacroPlayer.js:2372-2436)

### Regex

```javascript
MacroPlayer.prototype.RegExpTable["stopwatch"] =
    "^((?:(start|stop)\\s+)?id|label)\\s*=\\s*(" + im_strre + ")\\s*$";
```

Capture groups:
- `cmd[1]`: `"id"`, `"start id"`, `"stop id"`, or `"label"`
- `cmd[2]`: `"start"`, `"stop"`, or `undefined` (the prefix)
- `cmd[3]`: The ID or label name value

### Helper methods

```javascript
// Store start time in watchTable (MacroPlayer.js:2376-2378)
MacroPlayer.prototype.addTimeWatch = function(name) {
    this.watchTable[name] = this.globalTimer.getElapsedTime();
};

// Stop and record result (MacroPlayer.js:2381-2389)
MacroPlayer.prototype.stopTimeWatch = function(name) {
    if (typeof this.watchTable[name] == "undefined")
        throw new RuntimeError("time watch " + name + " does not exist", 962);
    var elapsed = this.globalTimer.getElapsedTime() - this.watchTable[name];
    this.lastWatchValue = elapsed;
    var x = {id: name, type: "id", elapsedTime: elapsed, timestamp: new Date()};
    this.stopwatchResults.push(x);
};

// Record label timestamp (MacroPlayer.js:2392-2398)
MacroPlayer.prototype.addTimeWatchLabel = function(name) {
    var elapsed = this.globalTimer.getElapsedTime();
    this.lastWatchValue = elapsed;
    var x = {id: name, type: "label", elapsedTime: elapsed, timestamp: new Date()};
    this.stopwatchResults.push(x);
};
```

### Action handler

```javascript
MacroPlayer.prototype.ActionTable["stopwatch"] = function (cmd) {
    var action = cmd[2] ? cmd[2].toLowerCase() : null;
    var use_label = /label$/i.test(cmd[1]);
    var param = imns.unwrap(this.expandVariables(cmd[3]));
    param = param.toUpperCase();

    if (!use_label) {
        var found = typeof this.watchTable[param] != "undefined";
        switch (action) {
        case "start":
            if (found)
                throw new RuntimeError("stopwatch id=" + param +
                                       " already started", 961);
            this.addTimeWatch(param);
            break;
        case "stop":
            if (!found)
                throw new RuntimeError("stopwatch id=" + param +
                                       " wasn't started", 962);
            this.stopTimeWatch(param);
            break;
        default:  // toggle
            if (found)
                this.stopTimeWatch(param);
            else
                this.addTimeWatch(param);
            break;
        }
    } else {
        this.addTimeWatchLabel(param);
    }
};
```

### Timing model

The `globalTimer` (MacroPlayer.js:2300-2360) is started once per macro run in `beforeEachRun()`:

```javascript
globalTimer.start: function() {
    this.startTime = new Date();
},
getElapsedTime: function() {
    if (!this.startTime) return 0;
    var now = new Date();
    return (now.getTime() - this.startTime.getTime()) / 1000;  // seconds (float)
}
```

All stopwatch times are **relative to the macro's global start time** and stored in **seconds** (float). The `watchTable` maps stopwatch IDs to their start-time elapsed values.

### Initialization (MacroPlayer.js:4599-4614)

```javascript
MacroPlayer.prototype.beforeEachRun = function() {
    this.watchTable = new Object();
    this.stopwatchResults = new Array();
    this.totalRuntime = 0;
    this.stopwatchFile = null;
    this.stopwatchFolder = null;
    this.shouldWriteStopwatchFile = true;
    this.shouldWriteStopwatchHeader = true;
    this.lastWatchValue = 0;
    this.lastPerformance = "";
    this.lastPerformanceArray = new Array();
    this.globalTimer.start();
};
```

### Results output (MacroPlayer.js:4242-4318)

After macro completion, stopwatch results are:
1. Written to `lastPerformance` string (format: `"ID=elapsed[!S!]"`)
2. Pushed to `lastPerformanceArray` (format: `{name, value}`)
3. Optionally written to a CSV file (controlled by `!FILESTOPWATCH`, `!FOLDER_STOPWATCH`, `!STOPWATCH_HEADER`)

### `!STOPWATCHTIME` variable (MacroPlayer.js:5016-5019)

```javascript
} else if (t = var_name.match(/^!stopwatchtime$/i)) {
    var value = mplayer.lastWatchValue.toFixed(3).toString();
    return value;
}
```

Returns `lastWatchValue` (set on stop and label operations) formatted to 3 decimal places in **seconds**.

### Related SET variables (MacroPlayer.js:2094-2154)

- `!FILESTOPWATCH` — Sets the output CSV file path for stopwatch results
- `!FOLDER_STOPWATCH` — Sets the output folder for stopwatch CSV; `"NO"` disables output
- `!STOPWATCH_HEADER` — `YES`/`NO` to control header line in CSV output

### Step-by-step logic (old)

1. **Parse**: Regex captures optional `START`/`STOP` prefix, `ID`/`LABEL` keyword, and value.
2. **Expand**: Variable expansion on the value, then uppercase it.
3. **LABEL branch**: If keyword is `LABEL`, call `addTimeWatchLabel(param)` — records global elapsed time and pushes to `stopwatchResults`.
4. **ID branch — START**: If prefix is `"start"` and ID already exists in `watchTable`, throw error 961. Otherwise call `addTimeWatch(param)`.
5. **ID branch — STOP**: If prefix is `"stop"` and ID not in `watchTable`, throw error 962. Otherwise call `stopTimeWatch(param)`.
6. **ID branch — TOGGLE** (no prefix): If ID exists, stop it; otherwise start it.
7. **On stop**: Elapsed time (seconds, float) is computed as `globalTimer.getElapsedTime() - watchTable[id]`, stored in `lastWatchValue`, and pushed to `stopwatchResults`.

### Key details (old)

- Time unit is **seconds** (float), not milliseconds
- All times are relative to `globalTimer.startTime` (set at macro start)
- `watchTable` stores start-time offsets, not absolute timestamps
- `stopwatchResults` accumulates all stop/label events for end-of-macro CSV output
- Error 961 = start on already-running, error 962 = stop on non-started
- No concept of LAP or READ actions — only start/stop/toggle/label
- `!STOPWATCHTIME` always returns `lastWatchValue.toFixed(3)` (seconds, 3 decimals)
- The ID is always uppercased before use
- Bare `STOPWATCH` (no ID, no label) is **not valid** — the regex requires `ID=` or `LABEL=`

## New Implementation (system.ts:66-509)

### State management

```typescript
interface StopwatchData {
  startTime: number;         // Date.now() milliseconds
  lapTimes: number[];        // Lap times in ms (relative to start)
  running: boolean;          // Is stopwatch running
  accumulated: number;       // Accumulated time when stopped (pause/resume)
}

const stopwatches: Map<string, StopwatchData> = new Map();
const DEFAULT_STOPWATCH_ID = 'default';
let globalStartTime: number | null = null;
```

### Handler (system.ts:324-509)

```typescript
export const stopwatchHandler: CommandHandler = async (ctx) => {
  const idParam = ctx.getParam('ID');
  const actionParam = ctx.getParam('ACTION');
  const labelParam = ctx.getParam('LABEL');

  const hasStartFlag = ctx.getParam('START') === 'true';
  const hasStopFlag = ctx.getParam('STOP') === 'true';

  // LABEL branch
  if (labelParam) {
    const labelName = ctx.expand(labelParam).toUpperCase();
    const elapsed = Date.now() - (globalStartTime || Date.now());
    const elapsedSec = (elapsed / 1000).toFixed(3);
    ctx.state.setVariable('!STOPWATCHTIME', elapsedSec);
    return { success: true, errorCode: OK, output: String(elapsed) };
  }

  const id = idParam ? ctx.expand(idParam).toUpperCase() : DEFAULT_STOPWATCH_ID;

  // Determine action from prefix flags, ACTION param, or toggle
  let action: string;
  if (hasStartFlag) action = 'START';
  else if (hasStopFlag) action = 'STOP';
  else if (actionParam) action = ctx.expand(actionParam).toUpperCase();
  else action = 'TOGGLE';

  const sw = getStopwatch(id);
  const varName = id === DEFAULT_STOPWATCH_ID ? '!STOPWATCH' : `!STOPWATCH_${id}`;

  switch (action) {
    case 'TOGGLE':
      // If running → stop; if not → start
      ...
    case 'START':
      // Error if already running (SCRIPT_ERROR)
      ...
    case 'STOP':
      // Error if not running (SCRIPT_ERROR)
      ...
    case 'LAP':
      // Record lap time, set variables
      ...
    case 'READ':
      // Read current elapsed without stopping
      ...
    default:
      // INVALID_PARAMETER error
  }
};
```

### Step-by-step logic (new)

1. **Parse**: Generic key=value parser; `START`/`STOP` as prefix flags, `ID`/`LABEL`/`ACTION` as named params.
2. **LABEL branch**: Computes elapsed from `globalStartTime`, sets `!STOPWATCHTIME` (seconds, 3 decimals), returns elapsed in ms.
3. **Determine action**: Priority: prefix flag → ACTION param → TOGGLE.
4. **Get/create stopwatch**: Lazy-creates `StopwatchData` in global `Map`.
5. **TOGGLE**: If `sw.running` → stop (compute elapsed, set variables); else → start (set `startTime = Date.now()`).
6. **START**: Error if already running (`SCRIPT_ERROR`). Sets `startTime`, clears laps, resets accumulated.
7. **STOP**: Error if not running (`SCRIPT_ERROR`). Computes `elapsed = Date.now() - startTime + accumulated`.
8. **LAP**: Error if not running. Records `lapTime = Date.now() - startTime`, pushes to `lapTimes`, sets `!STOPWATCH_<ID>_LAP<N>`.
9. **READ**: Returns current elapsed without stopping. Works on both running and stopped stopwatches.
10. **Variables set**: `!STOPWATCH` or `!STOPWATCH_<ID>` (ms), `!STOPWATCHTIME` (seconds, 3 decimals) on stop/label.

### Key details (new)

- Time unit is **milliseconds** internally (`Date.now()`), converted to seconds for `!STOPWATCHTIME`
- Each stopwatch has its own absolute `startTime` (not relative to a global timer)
- `globalStartTime` is only used for LABEL elapsed calculation
- Supports LAP and READ actions (not in original)
- Bare `STOPWATCH` is valid — toggles the `"default"` stopwatch
- `accumulated` field supports pause/resume semantics
- Variable names: `!STOPWATCH` (default) or `!STOPWATCH_<ID>`, plus `!STOPWATCH_<ID>_LAP<N>`
- Error codes use `SCRIPT_ERROR` (generic) rather than specific 961/962 codes
- Async handler returning `Promise<CommandResult>` (non-throwing)
- No built-in CSV file output — no `!FILESTOPWATCH`, `!FOLDER_STOPWATCH`, `!STOPWATCH_HEADER` handling in the command handler itself

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Time unit (internal)** | Seconds (float) via `globalTimer.getElapsedTime()` | Milliseconds (`Date.now()`) | **Structural**: New stores ms internally; converts to seconds for `!STOPWATCHTIME` |
| **Timer model** | All times relative to macro-global `globalTimer.startTime` | Each stopwatch has its own absolute `startTime` | **Structural**: Old uses offsets from global timer; new uses per-stopwatch `Date.now()` |
| **Bare STOPWATCH** | Invalid — regex requires `ID=` or `LABEL=` | Valid — toggles `"default"` stopwatch | **Enhancement**: More permissive syntax |
| **Toggle behavior** | Checks `watchTable[id]` existence | Checks `sw.running` boolean | **Compatible**: Same observable behavior (start if not running, stop if running) |
| **Error 961 (start already running)** | `RuntimeError("stopwatch id=X already started", 961)` | `{ success: false, errorCode: SCRIPT_ERROR, errorMessage: "Stopwatch ID=X already started" }` | **Minor difference**: Different error code (961 vs generic SCRIPT_ERROR) |
| **Error 962 (stop not started)** | `RuntimeError("stopwatch id=X wasn't started", 962)` | `{ success: false, errorCode: SCRIPT_ERROR, errorMessage: "Stopwatch ID=X wasn't started" }` | **Minor difference**: Different error code (962 vs generic SCRIPT_ERROR) |
| **Error mechanism** | Throws synchronous exception | Returns structured `CommandResult` (async) | **Structural**: Non-throwing error pattern |
| **LAP action** | Not supported | Supported: records lap time, sets `!STOPWATCH_<ID>_LAP<N>` | **Enhancement**: New feature |
| **READ action** | Not supported | Supported: reads elapsed without stopping | **Enhancement**: New feature |
| **ACTION= param** | Not supported — only prefix `START`/`STOP` syntax | Supported: `ACTION=START\|STOP\|LAP\|READ` | **Enhancement**: Extended syntax |
| **CSV output** | Built-in: writes to `performance_*.csv` at macro end | Not implemented in handler | **Gap**: CSV file output not yet implemented |
| **`!FILESTOPWATCH`** | Sets CSV output file path (SET variable) | Parser recognizes it but no handler uses it | **Gap**: SET variable accepted but non-functional |
| **`!FOLDER_STOPWATCH`** | Sets CSV output folder (SET variable) | Parser recognizes it but no handler uses it | **Gap**: SET variable accepted but non-functional |
| **`!STOPWATCH_HEADER`** | Controls CSV header line (YES/NO) | Parser recognizes it but no handler uses it | **Gap**: SET variable accepted but non-functional |
| **`!STOPWATCHTIME`** | `lastWatchValue.toFixed(3)` — seconds, 3 decimals | `(elapsed / 1000).toFixed(3)` — seconds, 3 decimals | **Compatible**: Same format |
| **Performance results** | Stored in `lastPerformance`/`lastPerformanceArray` for `iimGetLastPerformance()` | Not directly integrated with performance reporting | **Gap**: Performance data not collected for JS API |
| **watchTable cleanup** | `watchTable` recreated each `beforeEachRun()` | `clearAllStopwatches()` must be called explicitly | **Minor difference**: Different lifecycle management |
| **Accumulated time** | Not supported (stop deletes entry) | `accumulated` field preserves elapsed for pause/resume | **Enhancement**: Richer state model |
| **Variable storage** | `!STOPWATCHTIME` only (via `lastWatchValue`) | `!STOPWATCH`/`!STOPWATCH_<ID>` (ms) + `!STOPWATCHTIME` (seconds) + lap vars | **Enhancement**: More variable output |

## Output / Side Effects

- **Variables modified (old)**: `!STOPWATCHTIME` (on stop/label, seconds with 3 decimal places); `lastPerformance` string; `lastPerformanceArray`; `stopwatchResults` array; `watchTable` entries
- **Variables modified (new)**: `!STOPWATCH` or `!STOPWATCH_<ID>` (ms, on stop/toggle/lap/read); `!STOPWATCHTIME` (seconds, 3 decimals, on stop/label); `!STOPWATCH_<ID>_LAP<N>` (ms, on lap)
- **Return value**: Old throws on error; new returns `CommandResult`
- **Side effects (old)**: At macro end, writes results to CSV file (if `!FILESTOPWATCH`/`!FOLDER_STOPWATCH` configured)
- **Side effects (new)**: None beyond variable assignment — no file I/O

## Test Coverage

### Parser tests (`tests/unit/parser.test.ts`)
- Parses `STOPWATCH ID=Total` (line 520-525)
- Parses `STOPWATCH ID=SubmitData` (line 527-531)
- Parses bare `STOPWATCH` for toggle on default stopwatch (line 533-537)
- Parses `STOPWATCH LABEL=checkpoint1` (line 853-857)
- Parses `STOPWATCH START ID=timer1` prefix syntax (line 859-863)
- Included in supported commands list (line 881)
- Parses full Stopwatch sample macro with multiple start/stop pairs (lines 1436-1447)

### Integration tests (`tests/integration/commands/stopwatch.test.ts`)
- ACTION=START succeeds (lines 40-48)
- START then STOP records elapsed time (lines 53-69)
- ACTION=READ succeeds on running stopwatch (lines 74-90)
- ACTION=LAP records lap times (lines 95-114)
- Custom ID=timer1 operates independently (lines 119-135)
- Bare STOPWATCH toggles start/stop (lines 140-173)
- INVALID action returns INVALID_PARAMETER (lines 178-186)
- LAP on non-running returns SCRIPT_ERROR (lines 191-199)
- Explicit STOP on non-running returns SCRIPT_ERROR (lines 204-212)
- Multiple stopwatches with different IDs track independently (lines 217-245)
- Variable expansion in ID parameter (lines 250-275)
- START on already-running returns SCRIPT_ERROR (lines 280-291)
- Prefix syntax START ID=x / STOP ID=x (lines 296-312)
- LABEL parameter records timestamp (lines 317-333)
- Toggle with ID — sample macro pattern (lines 338-356)
- Explicit START after STOP (restart) (lines 361-386)
- Prefix STOP on non-started errors (lines 391-399)
- Prefix START on already-running errors (lines 404-415)

### Unit tests (`tests/unit/commands/system.test.ts`)
- Additional branch coverage tests for stopwatchHandler
