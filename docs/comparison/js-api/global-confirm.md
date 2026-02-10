# confirm (global) JS API Comparison

## Syntax

```javascript
// Old (jsplayer.js) - accessed from JS macro sandbox
confirm("Are you sure?")  // shows browser confirm dialog, returns true/false

// New (js-debugger.ts) - not exposed
// No `confirm` global is available in the new implementation
```

**Old**: `sandbox.confirm = function(msg) { ... }` — a function on the sandbox that delegates to `window.content.confirm()`, showing a browser confirm dialog with OK and Cancel buttons.

**New**: Not implemented. The JS debugger execution context (`js-debugger.ts`) and the TCP scripting interface (`scripting-interface.ts`) do not expose a `confirm` global.

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `msg` | string | Yes | The message to display in the confirm dialog |

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

### Function Definition (jsplayer.js:385-387)

```javascript
sandbox.confirm = function(msg) {
    return window.content.confirm(msg);
};
```

### Step-by-step logic (old)

1. **Sandbox creation**: A `Components.utils.Sandbox` is created with system principal, providing a clean global scope for user JS macro code.
2. **Function assignment**: `attachWindowMethods` assigns `sandbox.confirm` as a regular function (not a getter). This makes `confirm` callable directly in user code.
3. **Delegation to content window**: When called, the function delegates directly to `window.content.confirm(msg)`. This is the standard browser `confirm()` method on the content window.
4. **Synchronous blocking**: The call is synchronous — execution of the JS macro pauses until the user clicks OK or Cancel.
5. **Return value**: Returns `true` if the user clicks OK, `false` if the user clicks Cancel (standard `confirm()` behavior).

### Sandbox Context (jsplayer.js:130-222)

Code is executed via `Components.utils.evalInSandbox(code, sandbox)` (line 172). The sandbox has system principal, meaning `confirm` executes in the context of the content window. The sandbox acts as the global scope for user code — calling `confirm(...)` is possible because the function is defined directly on the sandbox object.

## New Implementation

### JS Debugger (js-debugger.ts)

The `confirm` global is **not exposed** in the execution context. The `executeInstrumented` method (lines 635-691) builds an execution context with:

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

The scripting interface handles commands via TCP protocol. There is no `confirm`-related command or handler — it operates entirely server-side in the Node.js native host process, which has no browser dialog capabilities.

### Why not exposed

The new architecture separates concerns:
- **Native host** (Node.js): Runs JS macros and handles scripting interface commands. Has no browser context and cannot show browser dialogs.
- **Extension** (Chrome): Has DOM access but doesn't run user JS code directly.
- User notification is handled through the PROMPT macro command (`shared/src/commands/flow.ts`) or `console.log()`, which is available in the execution context.

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Availability** | Assigned as function on sandbox | Not available | **Breaking**: JS macros calling `confirm()` will get `ReferenceError`. |
| **Implementation** | Delegates to `window.content.confirm()` | N/A | Old used browser-native confirm dialog. |
| **Synchronous** | Yes — blocks JS execution until user clicks OK or Cancel | N/A | Old was synchronous, matching standard `confirm()` behavior. |
| **Return value** | `true` (OK clicked) or `false` (Cancel clicked) | N/A | No equivalent mechanism for boolean user input. |
| **UI** | Browser-native modal confirm dialog with OK/Cancel buttons on the content window | N/A | No browser dialog available in Node.js native host. |
| **Alternative** | N/A | `console.log()` or PROMPT command | New architecture uses console output or PROMPT command for user-facing messages. |

## Output / Side Effects

| Aspect | Old | New |
|--------|-----|-----|
| **Return value** | `true` (OK) or `false` (Cancel) | N/A — not available |
| **Variables modified** | None | N/A |
| **Side effects** | Shows a modal browser dialog with OK/Cancel buttons; blocks execution until a button is clicked | N/A |
| **Error handling** | Standard browser `confirm()` behavior | `ReferenceError: confirm is not defined` |

## Test Coverage

No dedicated tests exist for the `confirm` global in either implementation. In the old implementation, `confirm` was implicitly available through the sandbox setup but not specifically tested. In the new implementation, there is nothing to test as the global is not exposed.

## Migration Notes

JS macros that use `confirm()` for user confirmation need to be rewritten. There is no direct equivalent for obtaining a boolean yes/no response from the user in the new architecture:

| Old Pattern | New Equivalent |
|-------------|---------------|
| `if (confirm("Delete?")) { ... }` | Remove the condition or use a hardcoded `true`/`false` |
| `var ok = confirm("Proceed?")` | `var ok = true` — or restructure logic to not require user confirmation |
| `confirm("Are you sure?")` | `console.log("Proceeding...")` — log the action instead of confirming |

### Key behavioral differences in migration

1. **No modal dialog**: Old `confirm()` showed a modal dialog with OK/Cancel buttons requiring user interaction. No equivalent exists in the new architecture.
2. **No execution pause**: Old `confirm()` blocked JS execution until the user clicked a button. There is no way to pause for user input in the new execution context.
3. **No boolean user input**: Old `confirm()` returned `true`/`false` based on user choice. The new architecture has no mechanism for interactive boolean input during JS macro execution.
4. **Output destination**: Old `confirm()` displayed in the browser content window. `console.log()` outputs to the Node.js native host console/logs but does not collect user input.
