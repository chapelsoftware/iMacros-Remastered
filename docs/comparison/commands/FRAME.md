# FRAME Command Comparison

## Syntax

```
FRAME F=<number>
FRAME NAME=<name>
```

**Old regex**: `^(f|name)\s*=\s*(<im_strre>)\s*$` — case-insensitive. Two capture groups: (1) parameter keyword (`f` or `name`), (2) the value (supports quoted strings with escapes, `eval()` expressions, or non-whitespace tokens via `im_strre`).

**New parser**: Key-value parameter command — `parser.ts:691-701` validates that either the `F` or `NAME` parameter is present. Returns a validation error if neither is found.

## Parameters

| Parameter | Required | Values | Description |
|-----------|----------|--------|-------------|
| F | One of F or NAME | Non-negative integer | Frame index. `0` = main document, `1+` = iframes in document order |
| NAME | One of F or NAME | String (supports `*` wildcard) | Frame name attribute to match |

## Old Implementation (MacroPlayer.js:830-894)

### Regex (MacroPlayer.js:830-831)

```javascript
MacroPlayer.prototype.RegExpTable["frame"] =
    "^(f|name)\\s*=\\s*("+im_strre+")\\s*$";
```

Capture groups: (1) keyword `f` or `name`, (2) the value.

### Helper: findFrame (MacroPlayer.js:837-846)

```javascript
MacroPlayer.prototype.findFrame = function(win, obj) {
    var frames = win.frames, i, f;
    for (i = 0; i < frames.length; i++) {
        if (--obj.num == 0) {
            return frames[i];
        } else if (f = this.findFrame(frames[i], obj))
            return f;
    }
    return null;
};
```

Recursively walks `win.frames` in depth-first order. Uses a mutable counter `obj.num` that decrements for each frame visited; returns the frame when the counter reaches 0. This means `F=1` selects the first frame in depth-first traversal, `F=2` the second, etc.

### Helper: findFrameByName (MacroPlayer.js:849-858)

```javascript
MacroPlayer.prototype.findFrameByName = function(win, name) {
    var frames = win.frames, i;
    for (var i = 0; i < frames.length; i++) {
        if (name.test(frames[i].name))
            return frames[i];
        else if (f = this.findFrameByName(frames[i], name))
            return f;
    }
    return null;
};
```

Recursively walks `win.frames` in depth-first order. Tests each frame's `name` property against a regex pattern. Returns the first match.

### Action handler (MacroPlayer.js:860-894)

```javascript
MacroPlayer.prototype.ActionTable["frame"] = function (cmd) {
    var type = cmd[1].toLowerCase(), f = null;
    var param = imns.unwrap(this.expandVariables(cmd[2]));

    if (type == "f") {
        param = imns.s2i(param);
        if (isNaN(param))
            throw new BadParameter("F=<number>", 1);

        if (param == 0) {
            this.currentWindow = window.content;
            return;
        }
    }

    if (type == "f") {
        f = this.findFrame(window.content, {num:param});
    } else if (type == "name") {
        var name_re = new RegExp("^"+param.replace(/\*/g, ".*")+"$");
        f = this.findFrameByName(window.content, name_re);
    }
    if (!f) {
        var self = this;
        this.retry(function() {
            if (self.ignoreErrors)
                return;
            iMacros.player.currentWindow = window.content;
            throw new RuntimeError("frame "+param+" not found", 922);
        }, "Frame waiting...");
    } else {
        this.currentWindow = f;
    }
};
```

### Step-by-step logic (old)

1. **Parse parameters**: Lowercase the keyword (`cmd[1]`). Expand variables and unwrap the value (`cmd[2]`).
2. **F= mode**: Convert value to integer via `imns.s2i()`. Throw `BadParameter` if not a number.
3. **F=0 shortcut**: If index is 0, set `this.currentWindow = window.content` (main document) and return immediately. No frame search is needed.
4. **F=n search (n > 0)**: Call `findFrame(window.content, {num: param})` — depth-first recursive traversal of `window.frames`, decrementing the counter for each frame visited.
5. **NAME= mode**: Convert `*` wildcards to `.*` regex, wrap in `^...$` anchors, create a `RegExp`. Call `findFrameByName(window.content, name_re)` — depth-first recursive search testing `frame.name` against the regex.
6. **Frame found**: Set `this.currentWindow = f` — all subsequent TAG/CLICK/etc. commands operate on this window.
7. **Frame not found**: Call `this.retry()` with a callback that (a) resets `currentWindow` to `window.content` (main document) if error is not ignored, and (b) throws `RuntimeError("frame ... not found", 922)`. The `retry()` mechanism polls with the built-in retry interval until `!TIMEOUT_STEP` expires.
8. **Error handling**: If `ignoreErrors` is set (via `SET !ERRORIGNORE YES`), the retry callback returns without throwing, effectively making the failure a no-op.
9. **Error code**: 922 (frame not found).

### Variables used

| Variable | Usage |
|----------|-------|
| `this.currentWindow` | Set to the found frame or reset to `window.content` |
| `this.ignoreErrors` | If true, frame-not-found is silently ignored |
| `!TIMEOUT_STEP` | Implicit via `this.retry()` — controls how long to poll for the frame |

## New Implementation (navigation.ts:542-662)

### Parser validation (parser.ts:691-701)

```typescript
case 'FRAME': {
  const fParam = command.parameters.find(p => p.key.toUpperCase() === 'F');
  const nameParam = command.parameters.find(p => p.key.toUpperCase() === 'NAME');
  if (!fParam && !nameParam) {
    return {
      lineNumber: command.lineNumber,
      message: 'FRAME command requires F or NAME parameter',
      raw: command.raw,
    };
  }
  break;
}
```

### Helper: getFrameRetryTimeout (navigation.ts:555-563)

Reads `!TIMEOUT_STEP` from state. Returns the timeout in seconds (0 if unset or invalid).

### Helper: selectFrameWithRetry (navigation.ts:570-604)

```typescript
async function selectFrameWithRetry(
  message: SelectFramePayload,
  ctx: CommandContext,
  errorLabel: string
): Promise<CommandResult>
```

1. Get timeout from `!TIMEOUT_STEP` variable.
2. Send `selectFrame` browser message (first attempt).
3. If successful, return `{ success: true }`.
4. Retry every 500ms until timeout expires.
5. On final failure: reset to main frame by sending `{ type: 'selectFrame', frameIndex: 0 }`, then return error with code `-922` (FRAME_NOT_FOUND).

### Command handler: frameHandler (navigation.ts:619-662)

```typescript
export const frameHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const fParam = ctx.getParam('F');
  const nameParam = ctx.getParam('NAME');

  if (fParam !== undefined) {
    const frameIndex = parseInt(ctx.expand(fParam), 10);
    if (isNaN(frameIndex) || frameIndex < 0) {
      return { success: false, errorCode: -710, errorMessage: `Invalid frame index: ${fParam}` };
    }
    return selectFrameWithRetry({ type: 'selectFrame', frameIndex }, ctx, `Frame ${frameIndex} not found`);
  }

  if (nameParam) {
    const frameName = ctx.expand(nameParam);
    return selectFrameWithRetry({ type: 'selectFrame', frameName }, ctx, `Frame "${frameName}" not found`);
  }

  return { success: false, errorCode: -710, errorMessage: 'FRAME command requires F or NAME parameter' };
};
```

### Step-by-step logic (new)

1. **Parse parameters**: Get `F` and `NAME` from parsed command parameters.
2. **F= mode**: Expand variables, parse as integer. Reject negative values or non-numbers with `INVALID_PARAMETER` error.
3. **F=0 and F=n**: Both go through `selectFrameWithRetry()` — no special shortcut for F=0. The browser message handler in the extension handles this.
4. **NAME= mode**: Expand variables, pass the name directly to the browser message. Wildcard conversion happens in the extension's `FrameHandler.selectFrameByName()`.
5. **Browser message**: Sends `{ type: 'selectFrame', frameIndex }` or `{ type: 'selectFrame', frameName }` to the content script.
6. **Retry logic**: First attempt, then retry every 500ms up to `!TIMEOUT_STEP` seconds.
7. **Frame found**: Browser responds with success; handler returns `{ success: true }`.
8. **Frame not found**: After timeout, resets to main frame (`frameIndex: 0`), returns error code `-922`.
9. **No parameter**: Returns `MISSING_PARAMETER` error.

### Extension: FrameHandler (extension/src/content/frame-handler.ts)

The browser-side frame handler is a singleton class that manages frame enumeration and selection:

- **Frame enumeration**: Finds all `<iframe>` and `<frame>` elements in DOM order, assigns indices (0 = main, 1+ = child frames). Supports nested frames with depth tracking.
- **selectFrameByIndex(n)**: Selects the frame at index `n` from the enumerated list.
- **selectFrameByName(name)**: Supports wildcards (`*` → `.*` regex), `regexp:` prefix for explicit regex patterns, and case-insensitive matching.
- **selectFrameById(id)**: Exact match by frame `id` attribute (not in old implementation).
- **Frame caching**: Enumerated frames are cached with a configurable expiration time to avoid re-scanning the DOM on every command.
- **Cross-origin handling**: Detects same-origin vs cross-origin frames. Cross-origin frames have `isSameOrigin: false` and null `contentDocument`/`contentWindow`.

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Architecture** | Monolithic — frame search, selection, and state all in MacroPlayer | Split — command handler in `shared/`, frame management in extension `FrameHandler` class, communication via browser messages | No behavioral difference; better separation of concerns |
| **Frame traversal** | Depth-first recursive walk of `window.frames` with mutable counter | DOM-order enumeration of `<iframe>`/`<frame>` elements with index assignment | Equivalent ordering in most cases; DOM element scanning is more reliable than `window.frames` |
| **F=0 handling** | Shortcut: directly sets `this.currentWindow = window.content`, bypasses frame search | Goes through `selectFrameWithRetry()` like any other index, but the extension handler recognizes index 0 as main | Functionally identical |
| **NAME= wildcard** | Converts `*` to `.*`, wraps in `^...$` anchors to create regex | Same wildcard conversion in extension `FrameHandler.selectFrameByName()`, plus additional `regexp:` prefix support | Compatible; `regexp:` prefix is an enhancement |
| **NAME= case sensitivity** | Case-sensitive regex match on `frames[i].name` | Case-insensitive matching | **Enhancement**: more forgiving matching in new implementation |
| **ID= selection** | Not supported | Supported via `selectFrameById()` | **Enhancement**: new feature, not used by FRAME command directly |
| **Retry mechanism** | `this.retry()` built-in mechanism with `!TIMEOUT_STEP` | Custom `selectFrameWithRetry()` polling every 500ms up to `!TIMEOUT_STEP` | Compatible behavior |
| **Failure reset** | Resets `currentWindow` to `window.content` inside retry callback | Explicitly sends `selectFrame` with `frameIndex: 0` after timeout | Functionally identical — both reset to main document on failure |
| **Error code** | 922 (positive, negated by convention) | -922 (`FRAME_NOT_FOUND` constant) | Same semantic value |
| **Negative index** | `imns.s2i()` returns NaN for non-numeric → `BadParameter` thrown. No explicit negative check. | Explicit check: `frameIndex < 0` returns `INVALID_PARAMETER` error | **Stricter**: new explicitly rejects negative indices |
| **Frame caching** | None — `window.frames` is live | Enumerated frames cached with configurable expiration | **Enhancement**: reduces DOM scanning overhead |
| **Cross-origin** | Relies on browser `window.frames` access (may throw on cross-origin) | Explicitly tracks `isSameOrigin` per frame, handles gracefully | **Enhancement**: better cross-origin error handling |
| **Variable expansion** | `imns.unwrap(this.expandVariables(cmd[2]))` on the raw value | `ctx.expand(fParam)` or `ctx.expand(nameParam)` on parsed parameter values | Equivalent functionality |
| **Error message** | `"frame "+param+" not found"` | `Frame ${frameIndex} not found` or `Frame "${frameName}" not found` | Slightly different formatting; same intent |

## Test Coverage

### Unit tests (tests/unit/frame-handler.test.ts)
- Initial state (currentFrameIndex = 0, main frame)
- Frame enumeration (main frame, cache, iframe detection)
- `selectFrameByIndex` — index 0 (main), negative index, out-of-range, no state change on failure
- `selectFrameByName` — nonexistent, case-insensitive, wildcard patterns, regex escaping
- `selectFrameById` — nonexistent, exact matching
- `selectFrame` generic selector — delegates to index/name/id, prioritization
- `resetToMainFrame` — returns to index 0
- `executeInCurrentFrame` — function execution with doc/window, error handling
- `findElementInCurrentFrame` / `findElementsInCurrentFrame` — CSS and XPath selectors
- Cache management — `clearCache`, `setCacheExpiration`
- Singleton pattern — `getFrameHandler`, `resetFrameHandler`
- `handleFrameMessage` — FRAME_SELECT (by index, name, id), FRAME_LIST, FRAME_CURRENT, FRAME_RESET

### Integration tests (tests/integration/commands/frame.test.ts)
- `FRAME F=0` selects main document
- `FRAME F=1` selects first iframe
- `FRAME F=2` selects second iframe
- `FRAME F=999` fails for non-existent index
- `FRAME F=-1` fails for negative index
- `FRAME NAME=myframe` selects by exact name
- `FRAME NAME` is case-insensitive
- `FRAME NAME=nonexistent` fails for unknown name
- `FRAME NAME` with `regexp:` prefix matches pattern
- `FRAME NAME` with invalid regexp returns error
- `FRAME F=1` then `FRAME F=0` returns to main document
- `FRAME NAME=x` then `FRAME F=0` returns to main document
- `resetToMainFrame` helper
- Frame enumeration — multiple iframes in document order
- Element finding in selected frame (CSS selector, XPath)
- `executeInCurrentFrame` with DOM modification
