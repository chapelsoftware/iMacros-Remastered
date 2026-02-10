# CLICK Command Comparison

## Syntax

```
CLICK X=<number> Y=<number> [CONTENT=<value>]
```

**Old regex**: `^x\s*=\s*(\S+)\s+y\s*=\s*(\S+)(?:\s+content\s*=\s*(<im_strre>))?\s*$`
- Captures X (group 1), Y (group 2), and an optional quoted/unquoted CONTENT string (group 3).
- `im_strre` matches double-quoted strings with escape sequences, `eval(...)` expressions, or bare non-whitespace tokens.

**New parser**: Key-value parameter command. Validated in `parser.ts:793-804` — requires `X` and `Y` parameters; `CONTENT` and `BUTTON` are optional.

## Parameters

| Parameter | Required | Old | New | Description |
|-----------|----------|-----|-----|-------------|
| `X` | Yes | Capture group 1 | `ctx.getParam('X')` | X coordinate (integer) |
| `Y` | Yes | Capture group 2 | `ctx.getParam('Y')` | Y coordinate (integer) |
| `CONTENT` | No | Capture group 3 — used for `TagHandler.onContentParam()` form interaction | Overloaded: in native-host handler determines button type (`right`/`middle`/`center`); in shared handler used for form interaction via `setElementContent()` | See Differences section |
| `BUTTON` | No | Not supported | `ctx.getParam('BUTTON')` — `left`/`middle`/`center`/`right` | Mouse button (shared handler only) |

## Old Implementation (MacroPlayer.js:219-250)

```javascript
MacroPlayer.prototype.RegExpTable["click"] =
    "^x\\s*=\\s*(\\S+)\\s+y\\s*=\\s*(\\S+)"+
    "(?:\\s+content\\s*=\\s*("+im_strre+"))?\\s*$";

MacroPlayer.prototype.ActionTable["click"] = function (cmd) {
    var x = imns.s2i(imns.unwrap(this.expandVariables(cmd[1])));
    var y = imns.s2i(imns.unwrap(this.expandVariables(cmd[2])));
    if ( isNaN(x))
        throw new BadParameter("positive integer number", 1);
    if (isNaN(y))
        throw new BadParameter("positive integer number", 2);

    var data = cmd[3] ? imns.unwrap(this.expandVariables(cmd[3])) : "";
    var doc = this.currentWindow.document;
    var target = doc.documentElement;
    var details = {
        doc: doc,
        point: {x: x, y: y},
        clickCount: 1,
        button: 0,
        target: target
    };
    details.type = "mousedown";
    this.dispatchMouseEvent(details);
    details.type = "mouseup";
    this.dispatchMouseEvent(details);
    if (data) {
        TagHandler.onContentParam(
            target.tagName.toLowerCase(), target, data
        );
    }
};
```

### Step-by-step logic (old)

1. **Parse**: Regex captures X, Y as strings and optional CONTENT. Variables are expanded via `expandVariables()`, then unwrapped from quotes via `imns.unwrap()`, then converted to integer via `imns.s2i()`.
2. **Validate**: If X or Y is `NaN` after conversion, throws `BadParameter("positive integer number", N)`.
3. **Target**: Always uses `doc.documentElement` (the `<html>` element) as the event target. Does **not** use `elementFromPoint()` to find the element at the coordinates.
4. **Mouse events**: Dispatches via `dispatchMouseEvent()`:
   - First: `mousedown` at `(x, y)` with `button=0` (left), `clickCount=1`
   - Then: `mouseup` at `(x, y)` — which internally also dispatches a `click` event (see below)
5. **CONTENT handling**: If CONTENT was provided, calls `TagHandler.onContentParam(tagName, target, data)` which performs form interaction (setting input values, selecting options, etc.) on the `<html>` element — which is `doc.documentElement`, the same target used for the click.
6. **No return value**: Function returns `undefined`; player proceeds to next action.

### `dispatchMouseEvent()` behavior (MacroPlayer.js:317-400)

When called from CLICK with a `point` and target is `HTMLHtmlElement`:

1. Sets `pageX = point.x`, `pageY = point.y`
2. Since target is `HTMLHtmlElement`, calls `doc.elementFromPoint(pageX, pageY)` to resolve the actual element
3. Computes `clientX = pageX - scrollX`, `clientY = pageY - scrollY`
4. Computes `screenX = mozInnerScreenX + clientX`, `screenY = mozInnerScreenY + clientY`
5. On `mousedown`:
   - First dispatches a `mouseover` event on the resolved target
   - Then dispatches the `mousedown` event
   - Calls `target.focus()` if available
   - Special handling for `<option>` inside `<select>`: sets `selectedIndex` or `selected`, dispatches `change` event
6. On `mouseup`:
   - Dispatches the `mouseup` event
   - Then dispatches a `click` event (or `dblclick` if `clickCount > 1`)

**Key detail**: The old implementation resolves the actual element via `elementFromPoint()` inside `dispatchMouseEvent()`, even though the CLICK handler initially sets `target = doc.documentElement`.

## New Implementation

### Two handler implementations

The new codebase has two CLICK handlers:

1. **Native-host handler** (`native-host/src/command-handlers.js:337-392`) — JavaScript, used by the Node.js native messaging host
2. **Shared handler** (`shared/src/commands/interaction.ts:646-727`) — TypeScript, used by the shared command execution layer

Both delegate the actual DOM interaction to the Chrome extension's content script.

### Native-host handler (command-handlers.js:337-392)

```javascript
CLICK: async (ctx) => {
    const xStr = ctx.getParam('X');
    const yStr = ctx.getParam('Y');

    if (!xStr || !yStr) {
        return { success: false, errorCode: ERROR_CODES.MISSING_PARAMETER,
                 errorMessage: 'CLICK command requires X and Y parameters' };
    }

    const x = parseInt(ctx.expand(xStr), 10);
    const y = parseInt(ctx.expand(yStr), 10);

    if (isNaN(x) || isNaN(y)) {
        return { success: false, errorCode: ERROR_CODES.INVALID_PARAMETER,
                 errorMessage: `Invalid coordinates: X=${xStr}, Y=${yStr}` };
    }

    const contentParam = ctx.getParam('CONTENT');
    let button = 'left';
    if (contentParam) {
        const contentLower = ctx.expand(contentParam).toLowerCase();
        if (contentLower === 'middle' || contentLower === 'center') {
            button = 'middle';
        } else if (contentLower === 'right') {
            button = 'right';
        }
    }

    const result = await bridge.executeClick({ x, y, button });
    // ... error handling ...
};
```

### Shared handler (interaction.ts:646-727)

```typescript
export const clickHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const xStr = ctx.getParam('X');
  const yStr = ctx.getParam('Y');

  if (!xStr || !yStr) {
    return { success: false, errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
             errorMessage: 'CLICK command requires X and Y parameters' };
  }

  const x = parseInt(ctx.expand(xStr), 10);
  const y = parseInt(ctx.expand(yStr), 10);

  if (isNaN(x) || isNaN(y)) {
    return { success: false, errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
             errorMessage: `Invalid coordinates: X=${xStr}, Y=${yStr}` };
  }

  const content = ctx.getParam('CONTENT');
  const expandedContent = content ? parseContentParam(ctx.expand(content)) : undefined;

  const buttonParam = ctx.getParam('BUTTON');
  let button: 'left' | 'middle' | 'right' = 'left';
  if (buttonParam) {
    const buttonLower = ctx.expand(buttonParam).toLowerCase();
    if (buttonLower === 'middle' || buttonLower === 'center') {
      button = 'middle';
    } else if (buttonLower === 'right') {
      button = 'right';
    }
  }

  const message: ClickCommandMessage = {
    id: generateMessageId(), type: 'CLICK_COMMAND', timestamp: Date.now(),
    payload: { x, y, content: expandedContent, button, clickCount: 1, modifiers: {} },
  };

  const response = await activeSender.sendMessage(message);
  // ... error handling ...
};
```

### Content script execution (dom-executor.ts:1057-1118)

```typescript
export async function executeClickCommand(message: ClickCommandMessage): Promise<DOMExecutorResult> {
  const { x, y, content, button, clickCount, modifiers } = message.payload;

  const doc = getCurrentFrameDocument() || document;
  const element = doc.elementFromPoint(x, y) || doc.documentElement;

  const mouseOptions: MouseEventOptions = {
    clientX: x, clientY: y,
    ctrlKey: modifiers?.ctrl, shiftKey: modifiers?.shift,
    altKey: modifiers?.alt, metaKey: modifiers?.meta,
  };

  if (button === 'right') {
    dispatchRightClick(element, mouseOptions);
  } else if (clickCount === 2) {
    dispatchDoubleClick(element, mouseOptions);
  } else if (button === 'middle') {
    // middle click sequence
    dispatchMouseEvent(element, 'mouseover', mouseOptions);
    dispatchMouseEvent(element, 'mousedown', mouseOptions);
    dispatchMouseEvent(element, 'mouseup', mouseOptions);
    dispatchMouseEvent(element, 'click', mouseOptions);
  } else {
    dispatchClick(element, mouseOptions);  // mouseover → mousedown → mouseup → click
  }

  if (content) {
    const result = setElementContent(element, content);
    // ... error handling ...
  }

  return { success: true, errorCode: DOM_ERROR_CODES.OK, elementInfo: getElementInfo(element) };
}
```

### Event dispatch helpers (event-dispatcher.ts)

| Function | Sequence |
|----------|----------|
| `dispatchClick` | mouseover → mousedown → mouseup → click |
| `dispatchRightClick` | mouseover → mousedown(button=2) → mouseup(button=2) → contextmenu(button=2) |
| `dispatchDoubleClick` | dispatchClick × 2 → dblclick |
| `dispatchMouseEvent` | Creates `MouseEvent` with full init (bubbles, cancelable, view, coordinates, modifiers) |

### Step-by-step logic (new)

1. **Parse**: Gets X, Y from `ctx.getParam()`. Expands variables via `ctx.expand()`. Parses with `parseInt(str, 10)`.
2. **Validate**: Returns structured error objects (`MISSING_PARAMETER` or `INVALID_PARAMETER`) instead of throwing exceptions.
3. **CONTENT handling (shared handler)**: If CONTENT is provided, it goes through `parseContentParam()` (handles `<SP>`, `<BR>`, `<TAB>`, `<ENTER>` substitutions) and is sent as part of the message payload for form interaction.
4. **BUTTON handling (shared handler)**: Separate `BUTTON` parameter controls mouse button type.
5. **CONTENT handling (native-host handler)**: CONTENT is interpreted as the button type (`right`, `middle`, `center`), not form interaction text.
6. **Send message**: Routes to Chrome extension content script via native messaging or direct message sender.
7. **Content script**: Uses `elementFromPoint(x, y)` to find the target element (falls back to `doc.documentElement`).
8. **Event dispatch**: Uses `MouseEvent` constructor (modern API) instead of deprecated `createEvent`/`initMouseEvent`. Dispatches appropriate event sequence based on button type.
9. **Form interaction**: If CONTENT was provided (shared handler), calls `setElementContent()` which handles input values, select options, checkboxes, EVENT: prefixed commands, etc.
10. **Error handling**: Returns structured `CommandResult` with error codes on failure; catches exceptions.

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Browser API** | Firefox XPCOM (`createEvent`/`initMouseEvent`) | Chrome Extensions (`new MouseEvent()` constructor) | Platform difference. Same DOM events dispatched. |
| **Element targeting** | Sets `target = doc.documentElement`, then `dispatchMouseEvent()` internally resolves via `elementFromPoint()` | Content script directly calls `elementFromPoint(x, y)` before dispatching | Same result — both resolve the actual element at coordinates. New is more direct. |
| **Mouse event sequence** | mousedown → mouseup (which internally dispatches click) | mouseover → mousedown → mouseup → click | **Difference**: New dispatches `mouseover` before `mousedown`. Old dispatches `mouseover` inside `dispatchMouseEvent()` only on `mousedown`, so the sequence is effectively the same: mouseover → mousedown → mouseup → click. |
| **Button selection** | Always `button=0` (left click only). CONTENT is for form interaction, not button type. | Left, middle, or right via `BUTTON` param (shared) or `CONTENT` param (native-host) | **Extension**: New supports right-click and middle-click. Old only supports left click. |
| **CONTENT param semantics** | Calls `TagHandler.onContentParam()` for form interaction on the clicked element | **Native-host**: interprets as button type. **Shared**: passes through `parseContentParam()` for form interaction via `setElementContent()` | **Behavioral difference in native-host**: `CLICK X=10 Y=20 CONTENT=somevalue` in old code would set form content; native-host handler interprets it as button type. Shared handler preserves original semantics and adds separate `BUTTON` param. |
| **BUTTON param** | Not supported | Shared handler supports `BUTTON=left\|middle\|center\|right` | **Extension**: New feature not in original. |
| **Right-click** | Not possible | `dispatchRightClick()`: mouseover → mousedown(button=2) → mouseup(button=2) → contextmenu | New capability. |
| **Middle-click** | Not possible | mouseover → mousedown(button=1) → mouseup(button=1) → click(button=1) | New capability. |
| **Error model** | Throws `BadParameter` exceptions | Returns `{ success: false, errorCode, errorMessage }` objects | Structural: new uses structured error returns. |
| **Async model** | Synchronous | `async/await` with message passing to content script | Structural: new sends message to Chrome extension content script. |
| **Focus handling** | `dispatchMouseEvent()` calls `target.focus()` on mousedown; handles `<option>`/`<select>` selection | Not explicitly done in CLICK handler; `dispatchClick()` only dispatches mouse events | **Potential difference**: Old code explicitly focuses the clicked element and handles `<option>` selection. New relies on browser's default behavior from dispatched events. |
| **Select element handling** | Explicitly sets `selectedIndex` or `selected` on `<option>` elements and dispatches `change` event | Handled by `setElementContent()` if CONTENT is provided, not by click dispatch itself | Different mechanism — old does it during click event dispatch, new does it via CONTENT param. |
| **Screen coordinates** | Computes `screenX`/`screenY` using `mozInnerScreenX`/`mozInnerScreenY` | Sets `screenX = clientX`, `screenY = clientY` (same as client coords) | Minor: screen coordinates are approximate in new implementation. Rarely matters for automation. |
| **Coordinate interpretation** | `pageX`/`pageY` (includes scroll offset) | `clientX`/`clientY` (viewport-relative) | **Potential difference**: In the old code, X/Y are treated as page coordinates (scroll-adjusted). In new code, they're passed as clientX/clientY. For pages with scrolling, this may produce different target elements. |
| **Logging** | None | Logs at debug level: `CLICK: X=..., Y=..., button=...` | Minor: new provides observability. |
| **Variable expansion** | `imns.unwrap(this.expandVariables(cmd[N]))` | `ctx.expand(ctx.getParam('X'))` | Internal API difference. Same behavior — expands `{{var}}` and `!VAR` references. |
| **Command registration** | `ActionTable["click"]` (lowercase) | `interactionHandlers.CLICK` (uppercase) | Internal naming convention. Parser handles case mapping. |

## Output / Side Effects

- **Mouse events**: Dispatches mouseover, mousedown, mouseup, and click events on the element at coordinates `(X, Y)`
- **Form interaction**: If CONTENT is provided (and not interpreted as button type), sets the element's value via form interaction logic
- **No macro variables modified**
- **No extract data produced**
- **No navigation triggered** (unless the clicked element is a link and the click is not prevented)

## Test Coverage

### Parser tests (`tests/unit/parser.test.ts`)
- Parses `CLICK X=100 Y=200` command (line 676-679)
- Included in supported commands list (line 879)
- Validates X and Y parameters are required (parser.ts:793-804)

### Command handler tests (`tests/unit/command-handlers.test.ts`)
- `sends X,Y coordinates to bridge` (line 809)
- `defaults to left button when CONTENT not specified` (line 821)
- `CONTENT=right uses right button` (line 832)
- `CONTENT=middle uses middle button` (line 844)
- `CONTENT=center is treated as middle button` (line 856)
- `CONTENT button matching is case-insensitive` (line 868)
- `unrecognized CONTENT defaults to left button` (line 880)
- `returns MISSING_PARAMETER when X is missing` (line 892)
- `returns MISSING_PARAMETER when Y is missing` (line 902)
- `returns MISSING_PARAMETER when both X and Y are missing` (line 910)
- `returns INVALID_PARAMETER for non-numeric X` (line 918)
- `returns INVALID_PARAMETER for non-numeric Y` (line 930)
- `returns SCRIPT_ERROR when bridge returns success=false` (line 941)
- `returns default error message when bridge returns success=false without error` (line 954)
- `returns SCRIPT_ERROR when bridge.executeClick throws` (line 966)
- `uses default error message when bridge.executeClick throws without message` (line 979)

### Native host bridge tests (`tests/unit/native-host-bridge.test.ts`)
- `CLICK X=n Y=n clicks at coordinates` (line 501)
- `CLICK with CONTENT=right clicks right button` (line 513)
- `CLICK without coords returns error` (line 525)
- `executeClick sends correct message` (line 213)

### Demo site (`tests/demo-site/clicks.html`)
- Click grid for coordinate testing
- Right-click target
- Double-click target
- Event logging
