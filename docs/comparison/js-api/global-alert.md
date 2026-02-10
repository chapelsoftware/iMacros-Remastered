# alert (global) JS API Comparison

## Syntax

```javascript
// Old (jsplayer.js) - accessed from JS macro sandbox
alert("Hello World")  // shows browser alert dialog, returns undefined

// New (js-debugger.ts) - not exposed
// No `alert` global is available in the new implementation
```

**Old**: `sandbox.alert = function(msg) { ... }` — a function on the sandbox that delegates to `window.content.alert()`, showing a browser alert dialog to the user.

**New**: Not implemented. The JS debugger execution context (`js-debugger.ts`) and the TCP scripting interface (`scripting-interface.ts`) do not expose an `alert` global.

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `msg` | string | Yes | The message to display in the alert dialog |

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

### Function Definition (jsplayer.js:381-383)

```javascript
sandbox.alert = function(msg) {
    return window.content.alert(msg);
};
```

### Step-by-step logic (old)

1. **Sandbox creation**: A `Components.utils.Sandbox` is created with system principal, providing a clean global scope for user JS macro code.
2. **Function assignment**: `attachWindowMethods` assigns `sandbox.alert` as a regular function (not a getter). This makes `alert` callable directly in user code.
3. **Delegation to content window**: When called, the function delegates directly to `window.content.alert(msg)`. This is the standard browser `alert()` method on the content window.
4. **Synchronous blocking**: The call is synchronous — execution of the JS macro pauses until the user dismisses the dialog by clicking OK.
5. **Return value**: Returns `undefined` (the standard return value of `window.alert()`).

### Sandbox Context (jsplayer.js:130-222)

Code is executed via `Components.utils.evalInSandbox(code, sandbox)` (line 172). The sandbox has system principal, meaning `alert` executes in the context of the content window. The sandbox acts as the global scope for user code — calling `alert(...)` is possible because the function is defined directly on the sandbox object.

## New Implementation

### JS Debugger (js-debugger.ts)

The `alert` global is **not exposed** in the execution context. The `executeInstrumented` method (lines 635-691) builds an execution context with:

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

The scripting interface handles commands via TCP protocol. There is no `alert`-related command or handler — it operates entirely server-side in the Node.js native host process, which has no browser dialog capabilities.

### Why not exposed

The new architecture separates concerns:
- **Native host** (Node.js): Runs JS macros and handles scripting interface commands. Has no browser context and cannot show browser dialogs.
- **Extension** (Chrome): Has DOM access but doesn't run user JS code directly.
- User notification is handled through the PROMPT macro command (`shared/src/commands/flow.ts`) or `console.log()`, which is available in the execution context.

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Availability** | Assigned as function on sandbox | Not available | **Breaking**: JS macros calling `alert()` will get `ReferenceError`. |
| **Implementation** | Delegates to `window.content.alert()` | N/A | Old used browser-native alert dialog. |
| **Synchronous** | Yes — blocks JS execution until user clicks OK | N/A | Old was synchronous, matching standard `alert()` behavior. |
| **Return value** | `undefined` (standard for `alert()`) | N/A | No equivalent mechanism. |
| **UI** | Browser-native modal alert dialog on the content window | N/A | No browser dialog available in Node.js native host. |
| **Alternative** | N/A | `console.log()` or PROMPT command | New architecture uses console output or PROMPT command for user-facing messages. |

## Output / Side Effects

| Aspect | Old | New |
|--------|-----|-----|
| **Return value** | `undefined` | N/A — not available |
| **Variables modified** | None | N/A |
| **Side effects** | Shows a modal browser dialog; blocks execution until dismissed | N/A |
| **Error handling** | Standard browser `alert()` behavior | `ReferenceError: alert is not defined` |

## Test Coverage

No dedicated tests exist for the `alert` global in either implementation. In the old implementation, `alert` was implicitly available through the sandbox setup but not specifically tested. In the new implementation, there is nothing to test as the global is not exposed.

## Migration Notes

JS macros that use `alert()` for displaying messages need to be rewritten to use `console.log()` or the PROMPT macro command:

| Old Pattern | New Equivalent |
|-------------|---------------|
| `alert("Done!")` | `console.log("Done!")` — output goes to the scripting host console |
| `alert("Error: " + msg)` | `console.log("Error: " + msg)` |
| `alert("Value is " + x)` | `console.log("Value is " + x)` |

### Key behavioral differences in migration

1. **No modal dialog**: Old `alert()` showed a modal dialog requiring user interaction. `console.log()` outputs silently without pausing execution.
2. **No execution pause**: Old `alert()` blocked JS execution until dismissed. `console.log()` does not block.
3. **Output destination**: Old `alert()` displayed in the browser content window. `console.log()` outputs to the Node.js native host console/logs.
