# content (global) JS API Comparison

## Syntax

```javascript
// Old (jsplayer.js) - accessed from JS macro sandbox
content              // getter returning window.content (the current tab's content window)
content.document     // content window's document
content.location     // content window's location
// ... any property of the browser tab's content window

// New (js-debugger.ts) - not exposed
// No `content` global is available in the new implementation
```

**Old**: `sandbox.__defineGetter__("content", ...)` — a getter on the sandbox that returns `window.content`, giving JS macros access to the current tab's DOM window.

**New**: Not implemented. The JS debugger execution context (`js-debugger.ts`) and the TCP scripting interface (`scripting-interface.ts`) do not expose a `content` global.

## Parameters

Not applicable — `content` is a global property, not a function call.

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

### Getter Definition (jsplayer.js:394-396)

```javascript
sandbox.__defineGetter__("content", function() {
    return window.content;
});
```

### Step-by-step logic (old)

1. **Sandbox creation**: A `Components.utils.Sandbox` is created with system principal, providing a clean global scope for user JS macro code.
2. **Getter attachment**: `attachWindowMethods` defines a getter on `sandbox.content` using the legacy `__defineGetter__` API.
3. **Resolution**: When user code accesses `content`, the getter executes and returns `window.content` — Firefox's reference to the content window of the currently active browser tab.
4. **Full DOM access**: Through this getter, user code has full access to the page's DOM, including `content.document`, `content.location`, `content.navigator`, event handlers, and all other standard Web API properties.
5. **Live reference**: Each access to `content` re-evaluates the getter, so it always returns the current tab's content window even if the tab has navigated.

### Relationship to `window` global

The `content` and `window` globals are aliases — both are defined in `attachWindowMethods` and both return `window.content`. In the old Firefox extension context:

```javascript
sandbox.__defineGetter__("window", function() {
    return window.content;  // line 391
});
sandbox.__defineGetter__("content", function() {
    return window.content;  // line 395
});
```

This means `content === window` within the JS macro sandbox. The `content` global exists because Firefox's chrome context used `content` as a common shorthand for `window.content`.

### What `content` provides

In the Firefox extension context, `window.content` (returned by the `content` getter) refers to the content window of the active browser tab. This gives JS macros:

| Access | Example |
|--------|---------|
| DOM tree | `content.document.getElementById(...)` |
| Location | `content.location.href` |
| Navigation | `content.location = "..."` |
| Cookies | `content.document.cookie` |
| Local/session storage | `content.localStorage`, `content.sessionStorage` |
| Timers | `content.setTimeout(...)`, `content.setInterval(...)` |
| Events | `content.addEventListener(...)` |
| Computed styles | `content.getComputedStyle(...)` |
| Page scripts/vars | Any global variable defined by the page |

### Sandbox Context (jsplayer.js:130-222)

Code is executed via `Components.utils.evalInSandbox(code, sandbox)` (line 172). The sandbox has system principal, meaning `content` access is not subject to same-origin restrictions. The sandbox acts as the global scope for user code — accessing `window` or `content` is possible because getters are defined directly on the sandbox object.

## New Implementation

### JS Debugger (js-debugger.ts)

The `content` global is **not exposed** in the execution context. The `executeInstrumented` method (lines 635-691) builds an execution context with:

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

No `content`, `window`, `document`, or DOM-related globals are injected.

### TCP Scripting Interface (scripting-interface.ts)

The scripting interface handles commands via TCP protocol. There is no `content`-related command or handler — it operates entirely server-side in the Node.js native host process, which has no browser DOM access.

### Why not exposed

The new architecture separates concerns:
- **Native host** (Node.js): Runs JS macros and handles scripting interface commands. Has no browser context.
- **Extension** (Chrome): Has DOM access but doesn't run user JS code directly.
- DOM manipulation is performed through iMacros commands (TAG, EXTRACT, etc.) which communicate between the native host and extension via native messaging.

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Availability** | Exposed via `__defineGetter__` on sandbox | Not available | **Breaking**: JS macros that access `content` will get `ReferenceError`. |
| **What it returns** | `window.content` (active tab's content window) | N/A | **Breaking**: No equivalent DOM access in new architecture. |
| **DOM access** | Full DOM access (`content.document`, etc.) | Not available; DOM access is through iMacros commands | **Architectural**: New design separates execution from DOM. |
| **Same-origin** | Bypasses same-origin (system principal) | N/A | Old had privileged cross-origin access. |
| **Live reference** | Getter re-evaluates on each access | N/A | Old always returned current tab's window. |
| **Alias of `window`** | `content === window` in sandbox | N/A | Both globals are absent in new implementation. |
| **Use in practice** | Used for direct DOM manipulation in JS macros | Must use TAG, EXTRACT, and other commands instead | **Workflow**: Scripts using `content` need rewriting. |

## Output / Side Effects

| Aspect | Old | New |
|--------|-----|-----|
| **Return value** | The content window object (Window) | N/A — not available |
| **Variables modified** | None (read-only getter) | N/A |
| **Side effects** | None from access; mutations through returned window affect the page | N/A |
| **Error handling** | Returns `window.content` (may be null if no tab) | `ReferenceError: content is not defined` |

## Test Coverage

No dedicated tests exist for the `content` global in either implementation. In the old implementation, `content` access was implicitly tested through JS macros that performed DOM manipulation. In the new implementation, there is nothing to test as the global is not exposed.

## Migration Notes

JS macros that use `content` for direct DOM access need to be rewritten to use iMacros commands. Since `content` and `window` were aliases, the migration path is identical:

| Old Pattern | New Equivalent |
|-------------|---------------|
| `content.document.title` | `EXTRACT` command with appropriate selector |
| `content.location.href` | `URL GOTO=...` or extract via `TAG` |
| `content.document.getElementById(...)` | `TAG POS=1 TYPE=... ATTR=ID:...` |
| `content.setTimeout(...)` | `WAIT SECONDS=...` |
| `content.document.cookie` | Not directly available |
