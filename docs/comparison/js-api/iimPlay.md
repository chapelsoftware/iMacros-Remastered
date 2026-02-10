# iimPlay JS API Comparison

## Syntax

```javascript
// Old (jsplayer.js) - called from JS macro sandbox
iimPlay("macroname.iim")
iimPlay("CODE:SET !VAR1 hello")

// New (scripting-interface.ts) - called via TCP Scripting Interface
iimPlay("macroname.iim")
iimPlay("macroname.iim", 30000)
iimPlay("CODE:SET !VAR1 hello")
```

**Old**: `sandbox.iimPlay = function(macro_or_code)` — single argument (macro name or `CODE:` prefixed inline content).

**New**: `handleIimPlay(args: string[])` — first argument is macro name or `CODE:` content, optional second argument is timeout in milliseconds.

## Parameters

| Parameter | Required | Old | New | Description |
|-----------|----------|-----|-----|-------------|
| macro_or_code | Yes | String: filename or `CODE:...` | String: filename or `CODE:...` | Macro file path or inline macro content |
| timeout | No | Not supported | Integer (ms) | Execution timeout; defaults to server config `timeout` (60000ms) |

## Old Implementation (jsplayer.js)

### Function Definition (jsplayer.js:249-293)

```javascript
sandbox.iimPlay = function(macro_or_code) {
    var x = macro_or_code, name;
    if (/^code:((?:\n|.)*)$/i.test(x)) {
        var src = RegExp.$1;
        src = src.replace(/\[sp\]/gi, ' ');
        src = src.replace(/\[lf\]/gi, '\r');
        src = src.replace(/\[br\]/gi, '\n');
        x = src;
        name = "Inline code";
    } else {
        var path = imns.FIO.fixSlashes(x);
        console.log("iimPlay, file");
        if (!/\.iim$/i.test(path))
            path += ".iim";
        try {
            x = imns.FIO.isFullPath(path) ? imns.FIO.openNode(path) :
                imns.FIO.openMacroFile(path);
        } catch(e) {
            iMacros.player.errorMessage = "Can not open file "+path;
            iMacros.player.errorCode = -931;
            return iMacros.player.errorCode;
        }
        if (!x.exists()) {
            iMacros.player.errorMessage = "File "+path+"does not exist";
            iMacros.player.errorCode = -930;
            return iMacros.player.errorCode;
        }
        name = x.leafName;
    }

    iMacros.in_iimPlay = true;
    iMacros.player.play(x, 1, name);

    var ct = imns.Cc["@mozilla.org/thread-manager;1"].
        getService(imns.Ci.nsIThreadManager).currentThread;

    while(iMacros.player.playing)
        ct.processNextEvent(true);

    iMacros.in_iimPlay = false;
    iMacros.panel.showLines(iMacros.jssrc);

    return iMacros.player.errorCode;
};
```

### Step-by-step logic (old)

1. **Detect CODE: prefix**: Regex `/^code:((?:\n|.)*)$/i` tests if input starts with `CODE:` (case-insensitive). If matched, extracts the content after `CODE:`.
2. **Escape sequence replacement** (CODE: path only):
   - `[sp]` → space (` `)
   - `[lf]` → carriage return (`\r`)
   - `[br]` → newline (`\n`)
   - All replacements are case-insensitive.
3. **File path resolution** (non-CODE: path):
   - Fixes slashes via `imns.FIO.fixSlashes()` (platform normalization).
   - Auto-appends `.iim` extension if not present.
   - If full path → opens via `imns.FIO.openNode()`.
   - If relative path → opens via `imns.FIO.openMacroFile()` (resolves against macro directory).
4. **File error handling**:
   - File open failure → sets error code **-931** ("Can not open file"), returns immediately.
   - File doesn't exist → sets error code **-930** ("File does not exist"), returns immediately.
5. **Set in_iimPlay flag**: `iMacros.in_iimPlay = true` — signals to the macro player that this is a nested play from JS.
6. **Play macro**: Calls `iMacros.player.play(x, 1, name)` where `1` is the loop count and `name` is `"Inline code"` or the file's leaf name.
7. **Synchronous wait**: Spins on the Mozilla thread manager's event queue (`processNextEvent(true)`) in a blocking while-loop until `iMacros.player.playing` is false. This makes `iimPlay()` synchronous from the JS caller's perspective.
8. **Clear flag**: Sets `iMacros.in_iimPlay = false`.
9. **Restore UI**: Calls `iMacros.panel.showLines(iMacros.jssrc)` to restore the JS source display in the panel.
10. **Return**: Returns `iMacros.player.errorCode` (1 = success, negative = error).

### Sandbox Context (jsplayer.js:130-222)

The `iimPlay` function is attached to a sandbox created with system principal and full chrome access. The sandbox is created fresh for each JS file execution. The `JS_Player.play()` method:
- Creates sandbox with system principal
- Attaches SI methods (`iimPlay`, `iimPlayCode`, `iimSet`, etc.)
- Attaches window methods (`window`, `content`, `prompt`, `alert`, `confirm`)
- Enables the Debugger API for step visualization
- Evaluates the JS code via `Components.utils.evalInSandbox(code, sandbox)`
- Catches errors and reports them with code **-991** (JS execution error)

## New Implementation (scripting-interface.ts)

### Command Parsing (scripting-interface.ts:570-584)

```typescript
private parseCommand(commandLine: string): ParsedCommand | null {
    const match = commandLine.match(/^(\w+)\s*\((.*)\)\s*$/);
    if (!match) return null;
    const command = match[1];
    const argsString = match[2];
    const args = this.parseArguments(argsString);
    return { command, args };
}
```

Commands arrive via TCP as `iimPlay("arg1", "arg2")`. The parser extracts the function name and arguments, handling quoted strings with escaped quotes.

### Command Dispatch (scripting-interface.ts:652-654)

```typescript
case 'iimplay':
    return this.handleIimPlay(args);
```

### handleIimPlay (scripting-interface.ts:695-755)

```typescript
private async handleIimPlay(args: string[]): Promise<CommandResult> {
    if (args.length < 1) {
        return { code: ReturnCode.INVALID_PARAMETER, data: 'iimPlay requires macro name or content' };
    }

    let macroNameOrContent = args[0];

    // Handle CODE: protocol
    if (macroNameOrContent.toUpperCase().startsWith('CODE:')) {
        macroNameOrContent = macroNameOrContent.substring(5);
        macroNameOrContent = macroNameOrContent.replace(/\[sp\]/gi, ' ');
        macroNameOrContent = macroNameOrContent.replace(/\[lf\]/gi, '\r');
        macroNameOrContent = macroNameOrContent.replace(/\[br\]/gi, '\n');
        macroNameOrContent = macroNameOrContent.replace(/\\n/g, '\n');
    } else if (this.config.macrosDir) {
        // File-based macro loading
        let macroPath = macroNameOrContent;
        if (!/\.iim$/i.test(macroPath)) macroPath += '.iim';
        if (!path.isAbsolute(macroPath)) {
            macroPath = path.join(this.config.macrosDir, macroPath);
        }
        try {
            if (!fs.existsSync(macroPath)) {
                return { code: ReturnCode.MACRO_NOT_FOUND, data: `Macro file not found: ${macroNameOrContent}` };
            }
            macroNameOrContent = fs.readFileSync(macroPath, 'utf8');
        } catch (error) {
            return { code: ReturnCode.MACRO_NOT_FOUND, data: `Cannot open file: ${macroNameOrContent}` };
        }
    }

    const timeout = args[1] ? parseInt(args[1], 10) : this.config.timeout;

    if (this.handler.isRunning()) {
        return { code: ReturnCode.MACRO_RUNNING, data: 'A macro is already running' };
    }

    this.emit('play', macroNameOrContent, timeout);
    return this.handler.play(macroNameOrContent, timeout);
}
```

### ExecutorMacroHandler.play() (scripting-interface.ts:199-340)

```typescript
async play(macroNameOrContent: string, timeout?: number): Promise<CommandResult> {
    this.running = true;
    this.lastError = '';
    this.lastExtract = '';
    this.lastPerformance = null;

    // Build initial variables from iimSet calls
    const initialVariables: Record<string, string> = {};
    for (const [key, value] of this.variables) {
        initialVariables[key] = value;
    }

    // Create a fresh executor for this run
    const executor = createExecutor({ ...this.executorOptions, initialVariables });
    this.activeExecutor = executor;

    // Register handlers, load macro, execute with optional timeout
    const parsed = executor.loadMacro(macroNameOrContent);
    if (parsed.errors.length > 0) { /* fail early */ }

    let result: MacroResult;
    if (timeout && timeout > 0) {
        result = await Promise.race([
            executor.execute(),
            new Promise<MacroResult>((_, reject) =>
                setTimeout(() => reject(new Error('Macro execution timeout')), timeout)
            ),
        ]);
    } else {
        result = await executor.execute();
    }
    // ... capture extract data, performance data, return result
}
```

### Step-by-step logic (new)

1. **Validate arguments**: Returns `INVALID_PARAMETER` (-6) if no argument provided.
2. **Detect CODE: prefix**: `toUpperCase().startsWith('CODE:')` check (case-insensitive).
3. **Escape sequence replacement** (CODE: path):
   - `[sp]` → space (` `) — same as old
   - `[lf]` → carriage return (`\r`) — same as old
   - `[br]` → newline (`\n`) — same as old
   - **Additional**: `\\n` (literal backslash-n) → newline (`\n`) — new behavior for TCP protocol compatibility
4. **File path resolution** (non-CODE: path, only if `macrosDir` is configured):
   - Auto-appends `.iim` if not present.
   - Resolves relative paths against `config.macrosDir` using `path.join()`.
   - Reads file content via `fs.readFileSync()`.
5. **File error handling**:
   - File not found → returns `MACRO_NOT_FOUND` (-4).
   - File read error → returns `MACRO_NOT_FOUND` (-4).
6. **Parse timeout**: Second argument parsed as integer, defaults to server `config.timeout` (60000ms).
7. **Concurrency check**: If a macro is already running, returns `MACRO_RUNNING` (0).
8. **Emit event**: Fires `'play'` event for external listeners.
9. **Delegate to handler**: Calls `handler.play(macroNameOrContent, timeout)` which:
   - Creates a fresh `MacroExecutor` with initial variables from prior `iimSet` calls.
   - Registers extraction handlers and any additional command handlers.
   - Parses the macro; returns `ERROR` (-1) immediately if parse errors exist.
   - Executes with `Promise.race` for timeout support.
   - Captures extract data, performance data, and error information.
   - Returns structured `CommandResult` with code and data.
10. **Return**: Returns `CommandResult` with `ReturnCode` enum value.

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Interface** | JS sandbox function called from within macro JS code | TCP server command called from external applications | **Architecture**: Different invocation model. Old runs in-process; new runs over network. |
| **Timeout parameter** | Not supported | Optional second argument (ms) | **Enhancement**: Allows caller to specify per-play timeout. |
| **CODE: detection** | Regex `/^code:((?:\n|.)*)$/i` captures content | `toUpperCase().startsWith('CODE:')` then `substring(5)` | **Equivalent**: Both are case-insensitive. New uses simpler string check. |
| **\\n → newline** | Not supported (escape sequences only) | `\\n` literal sequences converted to `\n` | **Enhancement**: TCP protocol sends literal `\n`; this converts them to actual newlines. |
| **File path normalization** | `imns.FIO.fixSlashes()` (platform-specific) | No slash normalization; uses Node.js `path.join()` | **Structural**: Node.js `path` module handles cross-platform paths natively. |
| **File resolution** | `isFullPath()` → `openNode()`, else `openMacroFile()` | `path.isAbsolute()` → use as-is, else `path.join(macrosDir, ...)` | **Equivalent**: Same logic, different APIs. |
| **File not found error** | Code **-930** ("File does not exist") | Code **-4** (`MACRO_NOT_FOUND`) | **Difference**: Different error codes. Old uses iMacros-specific codes; new uses SI protocol codes. |
| **File open error** | Code **-931** ("Can not open file") | Code **-4** (`MACRO_NOT_FOUND`) | **Difference**: Old distinguishes open failure vs not-found; new uses single code for both. |
| **No macrosDir configured** | Always resolves files (uses browser profile) | Passes raw string to executor (no file loading) | **Difference**: Without `macrosDir`, new treats input as inline macro content. |
| **Synchronous execution** | Blocks via Mozilla thread event loop spin-wait | Async/await with `Promise.race` for timeout | **Structural**: Old is synchronous (blocks JS thread); new is async (returns Promise). |
| **Concurrency guard** | None (relies on `iMacros.in_iimPlay` flag for UI) | Returns `MACRO_RUNNING` (0) if already executing | **Enhancement**: Explicit rejection of concurrent plays. |
| **in_iimPlay flag** | Sets `iMacros.in_iimPlay` during execution | No equivalent flag | **Structural**: Old used flag for UI/panel behavior. New has no browser UI. |
| **UI updates** | Restores JS source panel display after play | No UI interaction | **Structural**: Old is browser extension with panel; new is headless server. |
| **Macro player** | `iMacros.player.play(x, 1, name)` — shared player instance | Creates fresh `MacroExecutor` per play | **Structural**: New creates isolated executor per invocation. Variables passed via `initialVariables`. |
| **Variable passing** | Shared `iMacros.player` state | Copies from `iimSet` map to `initialVariables` at play time | **Equivalent**: Both allow pre-set variables to be available during execution. |
| **Extract data** | Available via `iMacros.player` state | Captured from executor result into `lastExtract` | **Equivalent**: Both store for retrieval via `iimGetLastExtract`. |
| **Performance data** | Not tracked by JS player | Full performance tracking (time, commands, loops) | **Enhancement**: New captures detailed execution metrics. |
| **Return value** | `iMacros.player.errorCode` (1 = OK, negative = error) | `CommandResult { code, data }` with `ReturnCode` enum | **Equivalent**: Both return numeric codes. New adds optional data string. |
| **Event emission** | None | Emits `'play'` event before execution | **Enhancement**: Allows external listeners to observe play commands. |
| **Error on empty args** | Would attempt to open file with undefined name | Returns `INVALID_PARAMETER` (-6) | **Improvement**: Explicit parameter validation. |
| **Parse error handling** | Errors surface during `player.play()` | Fails fast with parse error details (line number, message) | **Improvement**: Early validation with structured error info. |

## Output / Side Effects

| Aspect | Old | New |
|--------|-----|-----|
| **Return value** | Integer error code (1 = OK, negative = error) | `CommandResult { code: ReturnCode, data?: string }` |
| **Variables modified** | `iMacros.player.errorCode`, `iMacros.player.errorMessage`, `iMacros.in_iimPlay` | `handler.lastError`, `handler.lastExtract`, `handler.lastPerformance`, `handler.running` |
| **Side effects** | Plays macro via shared player, updates browser panel UI | Plays macro via isolated executor, emits `'play'` event |
| **Extract data** | Stored in `iMacros.player` for `iimGetLastExtract` | Stored in `handler.lastExtract` for `iimGetLastExtract` |
| **Performance data** | Not tracked | Stored in `handler.lastPerformance` for `iimGetLastPerformance` |

## Test Coverage

### Unit tests (`tests/unit/scripting-interface.test.ts`)

- **File I/O for iimPlay** (line 395+):
  - Reads macro from file and executes (line 428)
  - Auto-appends `.iim` extension (line 470)
  - Returns error for nonexistent file (line 508)
  - Resolves subfolder paths (line 551)

### Integration tests (`tests/integration/scripting-interface.test.ts`)

- **iimPlay Command** (line 286+):
  - Executes with macro name and returns OK (line 291)
  - Executes with timeout parameter (line 297)
  - Returns MACRO_RUNNING when macro already executing (line 303)
  - Returns INVALID_PARAMETER when no macro specified (line 312)
  - Returns error data on execution failure (line 319)
  - Returns MACRO_NOT_FOUND for missing macros (line 328)
  - Handles inline macro content (line 336)
  - Emits 'play' event with macro name and timeout (line 346)

### Integration tests (`tests/integration/scripting-interface-executor.test.ts`)

- **ExecutorMacroHandler wiring** (line 149+):
  - Executes SET command via iimPlay (line 150)
  - Executes multi-line macros (line 157)
  - Returns ERROR for invalid commands (line 178)
- **Full round-trip** (line 187+):
  - iimSet → iimPlay → iimGetLastExtract (line 198)
  - Variable persistence across commands (line 223)
  - Error state via iimGetLastError after play (line 259)
  - Error recovery after failed play (line 400)
  - Sequential plays with different variables (line 430)
- **CODE: protocol** (line 712+):
  - CODE: prefix executes inline macro (line 714)
  - CODE: with escape sequences [br], [sp] (line 751)
  - Case-insensitive CODE: prefix (line 738)
  - Multi-line via \\n and [br] (line 765)
- **File-based iimPlay** (line 899+):
  - Reads and executes .iim file from macrosDir (line 931)
  - Auto-appends .iim extension (line 949)
  - Returns MACRO_NOT_FOUND for missing files (line 961)
  - Resolves subfolder paths (line 972)
  - CODE: takes priority over file loading (line 985)
  - Explicit .iim extension works (line 1002)
