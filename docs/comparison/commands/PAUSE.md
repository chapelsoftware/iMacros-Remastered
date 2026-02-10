# PAUSE Command Comparison

## Syntax

```
PAUSE
```

**Old regex**: `"^\\s*$"` — accepts no parameters (only optional whitespace).

**New parser**: `parser.ts:931` — No parameter validation; bare `PAUSE` is valid. Falls through the no-validation case in the parser switch statement.

## Parameters

None. The PAUSE command takes no parameters.

## Old Implementation (MacroPlayer.js:1597-1603, 4322-4346)

### Regex

```javascript
MacroPlayer.prototype.RegExpTable["pause"] = "^\\s*$";
```

Matches only empty arguments (optional whitespace). No capture groups.

### Action handler

```javascript
MacroPlayer.prototype.ActionTable["pause"] = function (cmd) {
    this.pause(function() {
        iMacros.panel.updateControlPanel();
    });
};
```

### Pause mechanism (MacroPlayer.js:4322-4346)

The `pause()` method sets a pending flag that is checked by the execution loop:

```javascript
MacroPlayer.prototype.pause = function (callback) {
    if (!this.paused) {
        this.pauseCallback = callback;
        this.pauseIsPending = true;
    }
};

MacroPlayer.prototype.unPause = function (callback) {
    if (!this.paused) {
        this.pauseIsPending = false;
        return;
    }
    setTimeout(function () {
        iMacros.player.paused = false;
        if (callback)
            callback();
        iMacros.player.playNextAction();
    }, 0);
};

MacroPlayer.prototype.isPaused = function() {
    return this.paused;
};
```

### Execution loop integration (MacroPlayer.js:4025-4033)

In `playNextAction()`, the pause state is checked before executing the next command:

```javascript
MacroPlayer.prototype.playNextAction = function() {
    if ( this.pauseIsPending ) {
        this.pauseIsPending = false;
        this.paused = true;
        if (this.pauseCallback) {
            this.pauseCallback();
            this.pauseCallback = null;
        }
        return;
    }
    // ... other checks (waitCommandSuspended, paused, etc.)
};
```

### WAIT command interaction (MacroPlayer.js:3304-3314)

If a PAUSE is pending while a WAIT command is in progress, the WAIT is suspended:

```javascript
if (!this.counter || !mplayer.playing || mplayer.pauseIsPending) {
    // ...
    if (mplayer.pauseIsPending) {
        mplayer.waitCommandSuspended = true;
        mplayer.waitCommandRemains = this.counter * this.period;
    }
}
```

When the macro is un-paused and `waitCommandSuspended` is true, the remaining WAIT time resumes via `new WaitReporter(this.waitCommandRemains)`.

### State initialization (MacroPlayer.js:4712-4714)

```javascript
this.paused = false;
this.pauseIsPending = false;
this.waitCommandSuspended = false;
```

### Step-by-step logic (old)

1. **PAUSE command executes**: Calls `this.pause(callback)` where callback updates the control panel UI.
2. **`pause()` method**: Sets `pauseIsPending = true` and stores the callback (unless already paused).
3. **`playNextAction()` check**: On next iteration, detects `pauseIsPending`, sets `paused = true`, fires callback, returns without executing next command.
4. **Macro stalls**: While `paused` is true, `playNextAction()` returns immediately — no commands execute.
5. **User clicks Continue**: Calls `unPause(callback)` which sets `paused = false` and resumes via `playNextAction()` in a `setTimeout(fn, 0)`.
6. **WAIT interaction**: If PAUSE happens during a WAIT, the remaining wait time is saved and resumed after un-pause.

### Key details (old)

- PAUSE is a **two-phase** mechanism: the command sets `pauseIsPending`, and the execution loop transitions to `paused` state on the next iteration
- The callback (`iMacros.panel.updateControlPanel()`) updates the browser UI panel to show pause state
- Un-pausing is triggered by user interaction (clicking Continue/Resume in the iMacros panel)
- If already paused, calling `pause()` again is a no-op
- PAUSE during WAIT saves the remaining wait time for later resumption
- PAUSE is listed as a "forbidden command" for AlertFox compatibility checks (MacroPlayer.js:3826)
- Single-step mode also uses `iMacros.pause()` to pause after each command (MacroPlayer.js:4358-4359)

## New Implementation

### Two implementations

The new code has **two** PAUSE implementations:

#### 1. Executor built-in handler (executor.ts:455-460)

```typescript
this.registerHandler('PAUSE', async (ctx) => {
    ctx.log('info', 'Macro paused');
    this.pauseFlag = true;
    return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
});
```

This sets the executor's `pauseFlag` which is checked in the main execution loop:

```typescript
while (commandIndex < commands.length && !this.abortFlag) {
    // Check for pause
    if (this.pauseFlag) {
        await this.waitForResume();
        if (this.abortFlag) break;
    }
    // ... execute next command
}
```

The `waitForResume()` method returns a Promise that resolves when `resume()` is called externally:

```typescript
private waitForResume(): Promise<void> {
    return new Promise<void>((resolve) => {
        this.resumeResolver = resolve;
    });
}

resume(): void {
    if (this.state.getStatus() === ExecutionStatus.PAUSED || this.pauseFlag) {
        this.pauseFlag = false;
        this.state.resume();
        if (this.resumeResolver) {
            this.resumeResolver();
            this.resumeResolver = null;
        }
    }
}
```

#### 2. Flow control handler (flow.ts:290-314)

```typescript
export const pauseHandler: CommandHandler = async (ctx) => {
    ctx.log('info', 'Macro paused - waiting for user confirmation');

    try {
        await activeUI.showPause('Macro execution paused. Click OK to continue.');
        ctx.log('info', 'User confirmed - resuming macro');
        return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
    } catch (error) {
        ctx.log('info', 'User cancelled pause dialog');
        return {
            success: false,
            errorCode: IMACROS_ERROR_CODES.USER_ABORT,
            errorMessage: 'User cancelled the pause dialog',
            stopExecution: true,
        };
    }
};
```

This handler uses a UI callback system (`FlowControlUI.showPause`) that:
- In **headless mode**: Resolves immediately (no-op)
- In **UI mode**: Shows a dialog and waits for user confirmation
- On **cancel**: Returns `USER_ABORT` with `stopExecution: true`

The flow handler is registered via `registerFlowHandlers()` which overrides the built-in executor handler when used.

### State management (state-manager.ts:445-461)

```typescript
pause(): void {
    if (this.status === ExecutionStatus.RUNNING) {
        this.status = ExecutionStatus.PAUSED;
        this.updateExecutionTime();
        this.updateTimestamp();
    }
}

resume(): void {
    if (this.status === ExecutionStatus.PAUSED) {
        this.status = ExecutionStatus.RUNNING;
        this.startTime = new Date();
        this.updateTimestamp();
    }
}
```

### Pause-aware WAIT (flow.ts:195-206)

The WAIT handler uses `pauseAwareDelay()` which checks for pause state during execution:

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

### Step-by-step logic (new — executor built-in)

1. **PAUSE command executes**: Sets `pauseFlag = true`, returns success.
2. **Execution loop check**: Before next command, detects `pauseFlag`, calls `waitForResume()`.
3. **Macro stalls**: Promise blocks until `resume()` is called externally.
4. **External resume**: `resume()` clears `pauseFlag`, updates state, resolves the pending promise.
5. **Execution continues**: Next command proceeds.

### Step-by-step logic (new — flow handler)

1. **PAUSE command executes**: Calls `activeUI.showPause()` with a message string.
2. **Dialog shown**: UI implementation shows a confirmation dialog.
3. **User confirms**: Promise resolves, handler returns success.
4. **User cancels**: Promise rejects, handler returns `USER_ABORT` with `stopExecution: true`.
5. **Headless mode**: `showPause` resolves immediately — PAUSE is a no-op.

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Pause mechanism** | Two-phase: `pauseIsPending` → `paused` flag checked in `playNextAction()` | Promise-based: `pauseFlag` → `waitForResume()` blocks execution loop | **Structural**: Same observable behavior; different async pattern |
| **Resume trigger** | User clicks Continue in iMacros panel → `unPause()` | External call to `executor.resume()` or UI callback resolves | **Compatible**: Both require external trigger to continue |
| **Dual implementation** | Single implementation in `MacroPlayer` | Two handlers: executor built-in (flag-based) and flow.ts (dialog-based) | **Structural**: Flow handler overrides built-in when registered |
| **Cancel support** | No explicit cancel — user can only stop the macro entirely | Flow handler returns `USER_ABORT` with `stopExecution: true` on cancel | **Enhancement**: Explicit cancel handling in flow handler |
| **Headless behavior** | No headless mode — always requires panel interaction | Headless mode: PAUSE is a no-op (continues immediately) | **Enhancement**: Supports headless/scripted execution |
| **UI callback** | Direct call to `iMacros.panel.updateControlPanel()` | Configurable `FlowControlUI.showPause` callback | **Structural**: Decoupled from specific UI framework |
| **WAIT interaction** | PAUSE during WAIT suspends remaining time, resumes after un-pause | `pauseAwareDelay()` polls for pause state during WAIT chunks | **Compatible**: Both preserve remaining WAIT time across pause |
| **Error code** | No specific error — pause is always successful | `USER_PAUSE = -101` defined; flow handler may return `USER_ABORT = -100` | **Enhancement**: Explicit error codes for pause states |
| **Single-step mode** | Uses `iMacros.pause()` after each command execution | Executor has `singleStep` mode with `waitForStep()` (separate mechanism) | **Compatible**: Both support step-by-step debugging |
| **State tracking** | Boolean flags: `paused`, `pauseIsPending` | `ExecutionStatus.PAUSED` enum state + `pauseFlag` boolean | **Structural**: Richer state model with enum |
| **AlertFox forbidden** | PAUSE listed in `forbiddenCommands` regex for AlertFox checks | No AlertFox compatibility layer | **N/A**: AlertFox is a legacy service |

## Output / Side Effects

- **Variables modified**: None
- **Return value (old)**: No return — sets `pauseIsPending` flag, execution pauses on next `playNextAction()` call
- **Return value (new — executor)**: `{ success: true, errorCode: OK }` — pausing happens via flag check in execution loop
- **Return value (new — flow)**: `{ success: true, errorCode: OK }` on confirm; `{ success: false, errorCode: USER_ABORT, stopExecution: true }` on cancel
- **Side effects (old)**: Updates iMacros panel UI via callback; suspends WAIT if in progress
- **Side effects (new)**: Updates `ExecutionStatus` to `PAUSED`; may show UI dialog via callback

## Test Coverage

### Unit tests — flow handlers (tests/unit/flow-handlers.test.ts)

- PAUSE handler returns success with default UI / headless mode (line 295-304)
- PAUSE handler returns success when custom UI `showPause` resolves (lines 307-326)
- PAUSE handler returns `USER_ABORT` with `stopExecution` when `showPause` rejects (lines 329-346)
- Default UI `showPause` resolves immediately (lines 639-641)
- `registerFlowHandlers` registers WAIT, PAUSE, PROMPT (lines 945-956)
- `flowHandlers` export contains PAUSE handler (lines 976-979)
- PAUSE executes through executor in headless mode (lines 996-998)
- Flow handler overrides built-in PAUSE when registered (lines 1006-1008)

### Unit tests — executor (tests/unit/executor.test.ts)

- Pause and resume execution with built-in handler (lines 537-562)
- Stop during paused state (lines 564-575)
- `USER_PAUSE` is a recoverable error code (line 643)

### Unit tests — flow command tests (tests/unit/commands/flow.test.ts)

- `registerFlowHandlers` registers WAIT, PAUSE, PROMPT (lines 388-395)

### Integration tests — wait-pause (tests/integration/commands/wait-pause.test.ts)

- Executor built-in PAUSE pauses and resumes execution (lines 143-164)
- Stop during built-in PAUSE state (lines 166-183)
- Flow.ts `pauseHandler` calls `showPause` and succeeds when resolved (lines 299-319)
- Flow.ts `pauseHandler` returns `USER_ABORT` when `showPause` rejected (lines 322-338)
- Stop execution after cancelled PAUSE (`stopExecution` flag) (lines 341-367)
- Default UI PAUSE succeeds in headless mode (lines 364-378)
- WAIT with flow.ts `pauseHandler` in same macro (lines 427-447)
