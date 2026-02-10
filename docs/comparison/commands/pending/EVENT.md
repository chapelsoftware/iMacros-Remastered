# EVENT Command Comparison

## Syntax

```
EVENT TYPE=<type> [SELECTOR=<sel> | XPATH=<xpath>] [BUTTON|KEY|CHAR|POINT=<val>] [MODIFIERS=<mod>]
```

**Old regex** (MacroPlayer.js:310-314):
```javascript
"type\\s*=\\s*(" + im_strre + ")" +
"(?:\\s+(selector|xpath)\\s*=\\s*(" + im_strre + "))?" +
"(?:\\s+(button|key|char|point)\\s*=\\s*(" + im_strre + "))?" +
"(?:\\s+modifiers\\s*=\\s*(" + im_strre + "))?";
```

Capture groups: `[1]=type`, `[2]=selector_type (selector|xpath)`, `[3]=selector_value`, `[4]=value_type (button|key|char|point)`, `[5]=value`, `[6]=modifiers`

**New parser** (parser.ts:807-819): Generic `KEY=VALUE` parameter parsing. Validates that `TYPE` parameter is present at parse time. All other parameters (`SELECTOR`, `XPATH`, `CSS`, `BUTTON`, `KEY`, `CHAR`, `POINT`, `MODIFIERS`, `KEYS`, `CHARS`, `POINTS`) are validated at execution time by the handler.

## Parameters

| Parameter | Required | Values | Description |
|-----------|----------|--------|-------------|
| TYPE | Yes | Any DOM event type (click, dblclick, mousedown, mouseup, mouseover, keydown, keypress, keyup, etc.) | Event type to dispatch |
| SELECTOR | No | `CSS:<selector>` or `XPATH:<xpath>` or plain CSS selector | Target element selector (old uses `selector` keyword) |
| XPATH | No | XPath expression | Target element by XPath (new also supports as standalone param) |
| CSS | No | CSS selector | Target element by CSS (new-only standalone param) |
| BUTTON | No | Integer (0=left, 1=middle, 2=right) | Mouse button for mouse events |
| KEY | No | Integer keycode or key name | Key for keyboard events |
| CHAR | No | Single character or string | Character for keypress events |
| POINT | No | `(x,y)` or `x,y` | Coordinates for mouse events |
| MODIFIERS | No | `ctrl+shift`, `alt,meta`, etc. | Modifier keys |

## Old Implementation (MacroPlayer.js:421-586)

### Step-by-step logic

1. **Parse arguments**: Extracts `type`, `selector_type` (`"selector"` or `"xpath"`), `selector`, `value_type` (`"button"`, `"key"`, `"char"`, `"point"`), `value`, and `modifiers` from regex capture groups. All values are unwrapped and variable-expanded.

2. **Locate target element**:
   - If `selector_type == "xpath"`: Uses `TagHandler.findByXPath(doc, doc.documentElement, selector)`
   - If `selector_type == "selector"`: Uses `doc.querySelector(selector)`
   - Otherwise (no selector): Uses `doc.documentElement` as target

3. **Visibility check**: Gets `target.getBoundingClientRect()`. If target is null or has zero width/height, calls `this.retry()` to wait and retry. Retry throws `RuntimeError` with code 921 if element can't be located or isn't visible.

4. **Parse value parameter**:
   - **BUTTON**: `imns.s2i(value)` → integer. Throws `BadParameter` if NaN.
   - **KEY**: `imns.s2i(value)` → integer keycode. Throws `BadParameter` if NaN.
   - **CHAR**: Plain string. If `target.type == "password"`, attempts Rijndael decryption using password manager encryption key. Falls back to opening a master password dialog if decryption fails.
   - **POINT**: Regex `^\(\s*(\d+(?:\.\d+)?)\s*\,\s*(\d+(?:\.\d+)?)\s*\)$` matches `(x,y)` format with mandatory parentheses. Throws `BadParameter` if no match.

5. **Dispatch event based on type**:
   - **`/^mouse/i`**: Calls `this.dispatchMouseEvent(details)` with `{doc, target, type, point, button, modifiers}`.
   - **`/^key/i`**: Focuses target first (`target.focus()`), then calls `this.dispatchKeyboardEvent(details)` with `{doc, target, type, key, char, modifiers}`.
   - **`"click"`**: Dispatches mousedown then mouseup (full click sequence) via `dispatchMouseEvent` with `clickCount=1`.
   - **`"dblclick"`**: Dispatches two mousedown/mouseup pairs (clickCount=1, then clickCount=2) via `dispatchMouseEvent`.

6. **Highlight**: If `highlight` pref is enabled, highlights the target element.

### dispatchMouseEvent (MacroPlayer.js:317-400)

- Parses modifier keys from `details.modifiers` string via regex (`/ctrl/i`, `/alt/i`, `/shift/i`, `/meta/i`)
- Sets `clickCount`: 1 by default, 0 for mousemove
- Calculates coordinates:
  - **No point**: Centers on target via `getBoundingClientRect()` midpoint
  - **With point**: Uses `point.x`/`point.y` as pageX/pageY; if target is `HTMLHtmlElement`, resolves to `elementFromPoint`
- Calculates `screenX`/`screenY` using `mozInnerScreenX`/`mozInnerScreenY` (Firefox-specific)
- On `mousedown`: Dispatches a preceding `mouseover` event; after dispatch, focuses the target; handles `HTMLOptionElement` inside `HTMLSelectElement` (sets `selectedIndex` or `selected`, dispatches `change` event)
- On `mouseup`: Dispatches a follow-up `click` or `dblclick` event based on `clickCount`
- Uses `document.createEvent("MouseEvent")` + `initMouseEvent()` (legacy API)

### dispatchKeyboardEvent (MacroPlayer.js:403-418)

- Parses modifier keys from `details.modifiers` string
- Uses `details.key` as `keyCode`, `details.char.charCodeAt(0)` as `charCode`
- Uses `document.createEvent("KeyboardEvent")` + `initKeyEvent()` (Firefox-specific legacy API)

### Key details (old)

- The `selector` keyword in the old regex maps to `document.querySelector()` — it accepts CSS selectors despite the generic name
- POINT format requires parentheses `(x,y)` — bare `x,y` format would fail the regex
- KEY must be an integer keycode, not a named key
- Encryption/decryption for password fields via Rijndael cipher and password manager
- Uses Firefox-specific APIs: `mozInnerScreenX`, `initKeyEvent`, `createEvent`
- Click/dblclick are synthetic sequences, not single dispatched events
- Error code 921 (`ELEMENT_NOT_VISIBLE`) for element-not-found/not-visible

## New Implementation (interaction.ts:765-942)

### Handler (interaction.ts:765-942)

The new handler builds an `EventCommandMessage` and sends it to the content script via `ContentScriptSender`. The actual event dispatching occurs in the content script's `event-dispatcher.ts`.

### Step-by-step logic

1. **Get TYPE**: Reads `TYPE` parameter, expands variables, lowercases it.

2. **Build selector**: Checks params in order of precedence:
   - `SELECTOR`: Parses prefix format (`CSS:`, `XPATH:`, or plain CSS). Case-insensitive prefix matching.
   - `XPATH`: Direct XPath selector
   - `CSS`: Direct CSS selector
   - If none provided: `selector` is `undefined` (content script defaults to `documentElement`)

3. **Parse optional parameters**:
   - **BUTTON**: `parseInt()` → integer
   - **KEY**: If pure integer string, resolves to key name via `KEYCODE_TO_KEY` lookup table (e.g., 13→`Enter`, 65→`a`). Otherwise passes through as string.
   - **CHAR**: Variable expansion only
   - **POINT**: Strips surrounding parentheses if present, splits by comma, parses as integers. Supports both `(x,y)` and `x,y` format.
   - **KEYS**: Array of keycodes `[k1,k2,...,kn]` — strips brackets, splits by comma, resolves integer keycodes to key names.
   - **CHARS**: String of characters to type (expanded from variable).
   - **POINTS**: Array of coordinate pairs `(x,y),(x2,y2),...` — extracted via regex.
   - **MODIFIERS**: Splits by `+` or `,`; recognizes `ctrl`/`control`, `shift`, `alt`, `meta`/`cmd`/`command`.

4. **Build message**: Creates `EventCommandMessage` with `bubbles: true`, `cancelable: true`, and sends via `activeSender.sendMessage()`.

5. **Error handling**: Returns `ELEMENT_NOT_VISIBLE` (-921) for both sender failure and sender exception, matching the original error code.

### Content Script Event Dispatcher (event-dispatcher.ts)

The content script uses modern DOM APIs (`new MouseEvent()`, `new KeyboardEvent()`, `new InputEvent()`, `new FocusEvent()`) instead of legacy `createEvent()`/`initMouseEvent()`.

Key differences in dispatch behavior:
- **dispatchMouseEvent**: Uses `new MouseEvent(type, init)` with proper init options. Calculates center coordinates via `getBoundingClientRect()`.
- **dispatchClick**: Fires sequence: `mouseover` → `mousedown` → `mouseup` → `click` (matches original's mouseover-before-mousedown behavior).
- **dispatchDoubleClick**: Two full click sequences plus a `dblclick` event.
- **dispatchKeyboardEvent**: Uses `new KeyboardEvent(type, init)`. Defines `keyCode`/`charCode`/`which` via `Object.defineProperty` for compatibility.
- **typeText**: Full typing simulation per character: `keydown` → `keypress` → value update → `input` event → `keyup` → final `change` event.
- **dispatchFocusEvent**: Proper `focusin`/`focusout` bubbling behavior.

### Key details (new)

- Message-based architecture: handler in shared code builds message, content script executes
- Integer keycodes are resolved to named keys at the handler level (e.g., `KEY=13` → `Enter`) via `KEYCODE_TO_KEY` table
- Supports both `(x,y)` and `x,y` POINT formats for backwards compatibility
- `KEYS`, `CHARS`, `POINTS` are EVENTS-only parameters in the old implementation, but the new handler accepts them on both `EVENT` and `EVENTS`
- `EVENTS` is registered as an alias for `EVENT` at `interaction.ts:953`
- Uses standard `new MouseEvent()` / `new KeyboardEvent()` constructors instead of legacy `createEvent()` + `initMouseEvent()`/`initKeyEvent()`
- No password encryption/decryption for CHAR values
- No `HTMLOptionElement` special handling in mousedown
- No highlight pref support
- CSS param as standalone keyword (not just via SELECTOR prefix)
- Error code -921 (`ELEMENT_NOT_VISIBLE`) for failures, matching original

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Selector keyword** | `selector=<css>` or `xpath=<xpath>` (regex groups) | `SELECTOR=CSS:...` / `SELECTOR=XPATH:...` / `CSS=...` / `XPATH=...` | **Enhancement**: More flexible selector syntax; standalone CSS/XPATH params |
| **KEY format** | Integer keycode only (throws `BadParameter` if not integer) | Integer keycode (resolved to key name) or string key name | **Enhancement**: Accepts both `KEY=13` and `KEY=Enter` |
| **POINT format** | Requires parentheses `(x,y)` | Supports both `(x,y)` and `x,y` | **Enhancement**: More flexible; backwards-compatible |
| **KEYS/CHARS/POINTS** | Only available on EVENTS command | Available on both EVENT and EVENTS | **Enhancement**: Unified handler accepts all parameters |
| **Password decryption** | Rijndael decryption for CHAR on password fields via password manager | No encryption support | **Gap**: Password field CHAR decryption not implemented |
| **Option element handling** | mousedown on `HTMLOptionElement` sets `selectedIndex`/`selected` and fires `change` event | No special option handling in mouse events | **Gap**: Select/option interaction may differ |
| **Highlight** | Highlights target if `highlight` pref is enabled | No highlight support | **Cosmetic**: No visual highlight of targeted element |
| **Click dispatch** | mousedown fires preceding `mouseover`; mouseup fires follow-up `click`/`dblclick` | `dispatchClick` fires: `mouseover` → `mousedown` → `mouseup` → `click` | **Compatible**: Both produce mouseover before click; sequence ordering slightly different |
| **DblClick dispatch** | Two mousedown/mouseup pairs with clickCount 1 then 2 | Two full click sequences + dblclick event | **Minor**: Slightly different event sequence but same functional result |
| **Focus on keyboard** | Calls `target.focus()` before dispatching key events | Focus handled by content script (if target is focusable) | **Compatible**: Similar behavior |
| **Error code** | RuntimeError with code 921 | `ELEMENT_NOT_VISIBLE` (-921) | **Compatible**: Same error code |
| **Screen coordinates** | Uses `mozInnerScreenX`/`mozInnerScreenY` (Firefox-specific) | Uses clientX/clientY as screenX/screenY | **Structural**: Chrome has no `mozInnerScreenX`; screen coords may differ |
| **Event creation API** | `createEvent()` + `initMouseEvent()`/`initKeyEvent()` (legacy) | `new MouseEvent()` / `new KeyboardEvent()` (modern constructors) | **Structural**: Modern API; equivalent behavior |
| **Async model** | Synchronous (with retry timer for element waiting) | Async `Promise<CommandResult>` with content script messaging | **Structural**: Different execution model |
| **Retry on not-found** | `this.retry()` with timer-based retry loop | No retry in handler; content script may implement wait/retry | **Potential gap**: Retry behavior depends on content script implementation |

## Output / Side Effects

- **Variables modified**: None. EVENT does not modify `!EXTRACT` or any built-in variables.
- **Return value**: `CommandResult` with success/failure and error code.
- **Side effects**: DOM events dispatched on the target element. May cause focus changes, form submissions, navigation, etc. depending on event type and target.
- **Error codes**: `-913` (MISSING_PARAMETER) if TYPE missing; `-921` (ELEMENT_NOT_VISIBLE) if dispatch fails.

## Test Coverage

### Parser tests (tests/unit/parser.test.ts)
- Parses `EVENT TYPE=KEYPRESS SELECTOR=input KEY=13` as EVENT type (line 681-684)
- Parses `EVENTS TYPE=keypress SELECTOR="#input" CHARS="hello"` as EVENTS type (line 737-739)
- EVENT and EVENTS included in supported commands list (line 879)

### Unit tests — command-handlers (tests/unit/command-handlers.test.ts)
- EVENT requires TYPE parameter (line 997-1002)
- Dispatches event with TYPE only, no selector (line 1006-1008)
- Lowercases the event type (line 1017-1019)
- CSS selector param (line 1029-1032)
- XPATH selector param (line 1040-1043)
- SELECTOR=CSS: prefix (line 1051-1054)
- SELECTOR=XPATH: prefix (line 1062-1065)
- Plain SELECTOR (no prefix) as CSS (line 1073-1076)
- KEY param (line 1135-1138)
- CHAR param (line 1146-1149)
- BUTTON param integer (line 1157-1160)
- BUTTON param non-integer (line 1168-1171)
- POINT param `x,y` (line 1181-1184)
- POINT param with spaces `x , y` (line 1192-1195)
- POINT param invalid value (line 1203-1206)
- POINT param single number (line 1214-1217)
- MODIFIERS: ctrl+shift, alt,meta, cmd, command, control, shift, alt, ctrl, meta, all-combined, unknown (lines 1228-1343)
- MODIFIERS undefined when not provided (line 1347-1349)
- Bridge failure returns error (line 1357-1362)
- Bridge failure without error message (line 1367-1372)
- Bridge exception returns error (line 1376-1381)
- Bridge non-Error exception (line 1386-1392)
- EVENTS is alias for EVENT (line 1400-1415)
- EVENTS returns MISSING_PARAMETER without TYPE (line 1417-1422)
- EVENTS passes through bridge errors (line 1425-1430)
- Handler map includes EVENT and EVENTS (line 1448-1451)

### Integration tests (tests/integration/commands/event.test.ts)
- **Mouse events**: click, dblclick, mouseover with POINT, mousedown with BUTTON (lines 51-103)
- **Keyboard events**: keydown with KEY=Enter, keypress with CHAR and KEY=65 (lines 110-134)
- **Selector targeting**: CSS param, XPATH param, SELECTOR=CSS: prefix, SELECTOR=XPATH: prefix, plain SELECTOR (lines 141-203)
- **Modifier keys**: ctrl+shift, alt,meta (lines 210-231)
- **Error cases**: missing TYPE, sender failure, sender exception (lines 238-275)
- **EVENTS alias**: sends EVENT_COMMAND (lines 282-294)
- **Variable expansion**: TYPE from variable (lines 301-315)
- **Lowercase selector**: lowercase selector keyword, css: prefix, xpath: prefix (lines 320-349)
- **POINT with parentheses**: `(x,y)` and `x,y` formats (lines 354-373)
- **KEY as integer keycode**: 13→Enter, 27→Escape, 65→a, 9→Tab, string passthrough (lines 378-422)
- **KEYS array**: `[13,9,27]`, `[65,66,67]`, string names, without brackets (lines 427-464)
- **CHARS string**: quoted and unquoted (lines 469-488)
- **POINTS array**: multiple points, single point, three points (lines 493-528)
- **Default target**: no selector = undefined (content script uses documentElement) (lines 533-542)
