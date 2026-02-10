# prompt (global) JS API Comparison

## Syntax

```javascript
// Old (jsplayer.js) - accessed from JS macro sandbox
prompt("Enter your name")           // returns string or null
prompt("Enter your name", "default") // returns string or null

// New (js-debugger.ts) - not exposed
// No `prompt` global is available in the new implementation
```

**Old**: `sandbox.prompt = function(msg, def_value) { ... }` — a function on the sandbox that delegates to `window.content.prompt()`, showing a browser prompt dialog to the user.

**New**: Not implemented. The JS debugger execution context (`js-debugger.ts`) and the TCP scripting interface (`scripting-interface.ts`) do not expose a `prompt` global.

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `msg` | string | Yes | The message to display in the prompt dialog |
| `def_value` | string | No | Default value pre-filled in the input field |

## Old Implementation (jsplayer.js)

### Sandbox Setup (jsplayer.js:130-151)

```javascript
let principal = Cc["@mozilla.org/systemprincipal;1"]
    .createInstance(Ci.nsIPrincipal);

var full_access = true;
let sandbox = Components.utils.Sandbox(
    principal, {wantComponents: full_access}
);
if (full_access)
    sandbox.__defineGetter__("imns", function() {
        return imns;
    });
this.attachSIMethods(sandbox);
this.attachWindowMethods(sandbox);
```

The sandbox is created with a system principal and full chrome access. After attaching the scripting interface methods (`iimPlay`, etc.), `attachWindowMethods` is called to expose `window`, `content`, `prompt`, `alert`, and `confirm`.

### Function Definition (jsplayer.js:374-378)

```javascript
sandbox.prompt = function(msg, def_value) {
    return typeof def_value == "undefined"?
        window.content.prompt(msg):
        window.content.prompt(msg, def_value);
};
```

### Step-by-step logic (old)

1. **Sandbox creation**: A `Components.utils.Sandbox` is created with system principal, providing a clean global scope for user JS macro code.
2. **Function assignment**: `attachWindowMethods` assigns `sandbox.prompt` as a regular function (not a getter). This makes `prompt` callable directly in user code.
3. **Default value check**: When called, the function checks whether `def_value` is `undefined` using `typeof`.
4. **Delegation to content window**: Calls `window.content.prompt(msg)` (without default) or `window.content.prompt(msg, def_value)` (with default). This is the standard browser `prompt()` method on the content window.
5. **Synchronous blocking**: The call is synchronous — execution of the JS macro pauses until the user enters a value or cancels the dialog.
6. **Return value**: Returns the string entered by the user, or `null` if the user clicks Cancel.

### Why the `typeof` check

The old implementation explicitly checks `typeof def_value == "undefined"` rather than simply always passing `def_value`. This is because the browser's `window.prompt(msg)` (with one argument) shows an empty input field, while `window.prompt(msg, undefined)` (with two arguments) would show the string `"undefined"` as the default value in some browsers. By conditionally passing the argument, the old implementation avoids this edge case.

### Sandbox Context (jsplayer.js:130-222)

Code is executed via `Components.utils.evalInSandbox(code, sandbox)` (line 172). The sandbox has system principal, meaning `prompt` executes in the context of the content window. The sandbox acts as the global scope for user code — calling `prompt(...)` is possible because the function is defined directly on the sandbox object.

## New Implementation

### JS Debugger (js-debugger.ts)

The `prompt` global is **not exposed** in the execution context. The `executeInstrumented` method (lines 635-691) builds an execution context with:

```typescript
const context: Record<string, any> = {
    __debugHook__: debugHook,
    iimPlay: this.iimPlay.bind(this),
    iimSet: this.iimSet.bind(this),
    iimGetLastExtract: this.iimGetLastExtract.bind(this),
    iimGetExtract: this.iimGetLastExtract.bind(this),
    iimGetLastError: this.iimGetLastError.bind(this),
    console: console,
};
```

No `prompt`, `alert`, `confirm`, `window`, or DOM-related globals are injected.

### TCP Scripting Interface (scripting-interface.ts)

The scripting interface handles commands via TCP protocol. There is no `prompt`-related command or handler — it operates entirely server-side in the Node.js native host process, which has no browser dialog capabilities.

### Why not exposed

The new architecture separates concerns:
- **Native host** (Node.js): Runs JS macros and handles scripting interface commands. Has no browser context and cannot show browser dialogs.
- **Extension** (Chrome): Has DOM access but doesn't run user JS code directly.
- User interaction dialogs are handled through the PROMPT macro command (`shared/src/commands/flow.ts`), which uses a callback-based UI system rather than browser-native `prompt()`.

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Availability** | Assigned as function on sandbox | Not available | **Breaking**: JS macros calling `prompt()` will get `ReferenceError`. |
| **Implementation** | Delegates to `window.content.prompt()` | N/A | Old used browser-native prompt dialog. |
| **Synchronous** | Yes — blocks JS execution until user responds | N/A | Old was synchronous, matching standard `prompt()` behavior. |
| **Return value** | User input string or `null` (on cancel) | N/A | No equivalent return mechanism. |
| **Default value** | Supported via optional second parameter | N/A | Old conditionally passed `def_value` to avoid `"undefined"` display. |
| **UI** | Browser-native prompt dialog on the content window | N/A | No browser dialog available in Node.js native host. |
| **Alternative** | N/A | PROMPT macro command | New architecture uses PROMPT command with callback-based UI. |

## Output / Side Effects

| Aspect | Old | New |
|--------|-----|-----|
| **Return value** | String (user input) or `null` (cancel) | N/A — not available |
| **Variables modified** | None | N/A |
| **Side effects** | Shows a modal browser dialog; blocks execution until dismissed | N/A |
| **Error handling** | Standard browser `prompt()` behavior; returns `null` on cancel | `ReferenceError: prompt is not defined` |

## Test Coverage

No dedicated tests exist for the `prompt` global in either implementation. In the old implementation, `prompt` was implicitly available through the sandbox setup but not specifically tested. In the new implementation, there is nothing to test as the global is not exposed.

## Migration Notes

JS macros that use `prompt()` for user input need to be rewritten to use the PROMPT macro command:

| Old Pattern | New Equivalent |
|-------------|---------------|
| `var name = prompt("Enter name")` | Use `iimPlay("PROMPT \"Enter name\" !VAR1")` then `iimGetLastExtract()` or read `!VAR1` |
| `var name = prompt("Enter name", "default")` | Use `iimPlay("PROMPT \"Enter name\" !VAR1 default")` |
| `if (prompt("Continue?") === null) { ... }` | PROMPT command does not return `null` on cancel; cancel continues silently without storing a value |

### Key behavioral differences in migration

1. **Synchronous vs async**: Old `prompt()` was synchronous and returned a value directly. The PROMPT macro command is invoked via `iimPlay()` and the result is retrieved separately.
2. **Cancel behavior**: Old `prompt()` returned `null` on cancel. The PROMPT command continues silently without storing any value when cancelled.
3. **No return value**: The PROMPT command stores its result in a variable (e.g., `!VAR1`) rather than returning it directly.
