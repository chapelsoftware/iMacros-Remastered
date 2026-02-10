# EVENTS Command Comparison

## Syntax

```
EVENTS TYPE=<type> [SELECTOR=<sel> | XPATH=<xpath>] [KEYS=<keys> | CHARS=<chars> | POINTS=<points>] [MODIFIERS=<mod>]
```

**Old regex** (MacroPlayer.js:590-594):
```javascript
"type\\s*=\\s*(" + im_strre + ")" +
"(?:\\s+(selector|xpath)\\s*=\\s*(" + im_strre + "))?" +
"(?:\\s+(keys|chars|points)\\s*=\\s*(" + im_strre + "))?" +
"(?:\\s+modifiers\\s*=\\s*(" + im_strre + "))?";
```

Capture groups: `[1]=type`, `[2]=selector_type (selector|xpath)`, `[3]=selector_value`, `[4]=value_type (keys|chars|points)`, `[5]=value`, `[6]=modifiers`

**New parser** (parser.ts:807-808): Shares the same `case 'EVENTS':` branch as `EVENT`. Uses generic `KEY=VALUE` parameter parsing. Validates that `TYPE` parameter is present at parse time.

## Parameters

| Parameter | Required | Values | Description |
|-----------|----------|--------|-------------|
| TYPE | Yes | `keypress`, `mousemove` | Event type — old only supports `keypress` and `mousemove` |
| SELECTOR | No | `CSS:<selector>` or `XPATH:<xpath>` or plain CSS selector | Target element (old uses `selector` keyword for CSS) |
| XPATH | No | XPath expression | Target element by XPath |
| KEYS | No | `[k1,k2,...,kn]` — array of integer keycodes in brackets | Key sequence for keypress events |
| CHARS | No | String of characters | Character sequence for keypress events |
| POINTS | No | `(x,y),(x2,y2),...` — comma-separated coordinate pairs | Coordinate sequence for mousemove events |
| MODIFIERS | No | `ctrl+shift`, `alt,meta`, etc. | Modifier keys |

## Old Implementation (MacroPlayer.js:596-769)

### Step-by-step logic

1. **Parse arguments**: Extracts `type`, `selector_type` (`"selector"` or `"xpath"`), `selector`, `value_type` (`"keys"`, `"chars"`, `"points"`), `value`, and `modifiers` from regex capture groups. All values are unwrapped and variable-expanded.

2. **Locate target element**:
   - If `selector_type == "xpath"`: Uses `TagHandler.findByXPath(doc, doc.documentElement, selector)`
   - If `selector_type == "selector"`: Uses `doc.querySelector(selector)`
   - Otherwise (no selector): Uses `doc.documentElement` as target

3. **Visibility check**: Gets `target.getBoundingClientRect()`. If target is null or has zero width/height, calls `this.retry()` to wait and retry. Retry throws `RuntimeError` with code 921 if element can't be located or isn't visible.

4. **Parse value parameter**:
   - **CHARS**: Plain string. If `target.type == "password"`, attempts Rijndael decryption using password manager encryption key. Falls back to opening a master password dialog if decryption fails. For non-password fields, value used as-is.
   - **KEYS**: Validates against regex `/\[\d+(?:\s*,\s*\d+)*\]/` — must be bracket-enclosed integer array. Throws `BadParameter` if invalid. Parsed via `JSON.parse(value)`.
   - **POINTS**: Validates against regex `/^(?:\s*\(\d+(?:\.\d+)?\s*\,\s*\d+(?:\.\d+)?\s*\)(?:\s*,\s*)?)+$/` — must be parenthesized coordinate pairs. Throws `BadParameter` if invalid. Each `(x,y)` pair extracted via regex into `{x, y}` objects with `parseFloat`.

5. **Dispatch events via generator + setInterval** (asynchronous iteration):
   - **`/mousemove/i`**: Creates a generator that iterates through `points` array. Each iteration calls `this.dispatchMouseEvent(details)` with the current point and type `mousemove`.
   - **`/^keypress/i`**: Focuses target first (`target.focus()` if available). Creates a generator that iterates through either `keys` or `chars`:
     - **KEYS mode**: For each keycode, dispatches `keydown` → `keypress` → `keyup` sequence using the integer keycode directly.
     - **CHARS mode**: For each character, determines keycode (uppercase `charCodeAt(0)` for `[A-Z]`, defaults to 65 otherwise), then dispatches `keydown` → `keypress` → `keyup` sequence with both the keycode and the character.
   - The generator is driven by `setInterval` with delay `0`, calling `g.next()` each tick. When the generator signals completion, the interval is cleared and `playNextAction()` is called to continue macro execution.

6. **Interval cleanup**: On macro stop, `__eventsInterval` is cleared if still running (MacroPlayer.js:4110-4112).

7. **Highlight**: If `highlight` pref is enabled, highlights the target element.

### Key details (old)

- EVENTS is fundamentally different from EVENT — it dispatches **sequences** of events (multiple keystrokes or mouse movements), not single events
- Only supports `keypress` and `mousemove` TYPE values (other types are silently ignored — no dispatch occurs)
- Uses JavaScript generators (`yield`) with `setInterval(fn, 0)` for asynchronous iteration, allowing each event to be dispatched on a separate tick
- Sets `this.inEventsCommand = true` during execution; clears it when done
- KEYS must be in `[k1,k2,...,kn]` bracket format — bare comma-separated integers fail validation
- POINTS requires parenthesized `(x,y)` format with mandatory parentheses
- CHARS keycode heuristic: only resolves `[A-Z]` to their proper keycodes; all other characters default to keycode 65 (`A`)
- Password field encryption/decryption for CHARS values via Rijndael cipher
- Uses `dispatchMouseEvent` and `dispatchKeyboardEvent` helper methods (same as EVENT command)
- Error code 921 (`ELEMENT_NOT_VISIBLE`) for element-not-found/not-visible

## New Implementation (interaction.ts:765-953)

### Handler

EVENTS is registered as a direct alias for the `eventHandler` at `interaction.ts:953`:
```typescript
EVENTS: eventHandler, // EVENTS is alias for EVENT
```

The same handler processes both EVENT and EVENTS commands. It builds an `EventCommandMessage` and sends it to the content script via `ContentScriptSender`. The handler does not differentiate between EVENT and EVENTS — both follow identical code paths.

### Step-by-step logic

The handler logic is identical to [EVENT.md](EVENT.md). In summary:

1. **Get TYPE**: Reads `TYPE` parameter, expands variables, lowercases it.

2. **Build selector**: Checks `SELECTOR`, `XPATH`, `CSS` params in order of precedence.

3. **Parse optional parameters**: Processes `BUTTON`, `KEY`, `CHAR`, `POINT`, `KEYS`, `CHARS`, `POINTS`, `MODIFIERS` — all available to both EVENT and EVENTS.

4. **Build message**: Creates `EventCommandMessage` with `bubbles: true`, `cancelable: true`, sends via `activeSender.sendMessage()`.

5. **Error handling**: Returns `ELEMENT_NOT_VISIBLE` (-921) for sender failures.

### Content script handling

The content script's `event-dispatcher.ts` handles:
- **KEYS**: Resolves integer keycodes to key names via lookup table, dispatches `keydown` → `keypress` → `keyup` per key.
- **CHARS**: Uses `typeText()` — per character: `keydown` → `keypress` → value update → `input` event → `keyup` → final `change` event.
- **POINTS**: Dispatches `mousemove` per point.
- All TYPE values are accepted (not limited to `keypress` and `mousemove`).

### Key details (new)

- EVENTS and EVENT share the exact same handler — no distinct EVENTS logic
- All parameters (`KEYS`, `CHARS`, `POINTS`, `BUTTON`, `KEY`, `CHAR`, `POINT`) are available on both commands
- TYPE is not restricted to `keypress`/`mousemove` — any event type is accepted
- Integer keycodes in KEYS are resolved to named keys at the handler level (e.g., 13→`Enter`)
- CHARS typing simulation is richer: includes `input` event and value mutation, not just keyboard events
- Message-based architecture: handler builds message, content script executes
- No password encryption/decryption for CHARS values
- No generator/setInterval iteration — async/await model
- No `inEventsCommand` flag tracking

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Supported types** | Only `keypress` and `mousemove` (regex-matched); other types silently do nothing | Any event type accepted | **Enhancement**: More flexible; old types still work |
| **Handler architecture** | Dedicated handler with generator-based iteration | Alias for EVENT handler; unified code path | **Structural**: Simpler implementation; same functional result |
| **KEYS/CHARS/POINTS scope** | Only available on EVENTS command | Available on both EVENT and EVENTS | **Enhancement**: Unified handler accepts all parameters |
| **KEYS format** | Must be `[k1,...,kn]` bracket format; `BadParameter` if invalid | Strips brackets if present; also accepts bare integers | **Enhancement**: More flexible parsing; backwards-compatible |
| **KEYS keycode handling** | Integer keycodes used directly as `keyCode` property | Integer keycodes resolved to named keys via `KEYCODE_TO_KEY` table | **Minor**: Same functional effect (key events dispatched correctly) |
| **CHARS typing** | Dispatches `keydown`/`keypress`/`keyup` only; keycode heuristic (A-Z or default 65) | Full typing simulation: `keydown`/`keypress`/value update/`input`/`keyup`/`change` | **Enhancement**: More realistic typing; includes `input` event and value mutation |
| **POINTS format** | Requires parenthesized `(x,y)` pairs; `BadParameter` if invalid | Extracts `(x,y)` pairs via regex | **Compatible**: Same format accepted |
| **Event iteration** | Generator + `setInterval(fn, 0)` — each event on separate tick | Content script handles sequence dispatch (async) | **Structural**: Different async model; similar functional result |
| **inEventsCommand flag** | Sets `this.inEventsCommand = true` during execution | No equivalent flag | **Minor**: Internal state tracking difference |
| **Interval cleanup on stop** | Clears `__eventsInterval` on macro stop | Not needed (async/await model) | **Structural**: Different lifecycle management |
| **Password decryption** | Rijndael decryption for CHARS on password fields | No encryption support | **Gap**: Password field CHARS decryption not implemented |
| **Selector keyword** | `selector=<css>` or `xpath=<xpath>` | `SELECTOR=CSS:...` / `XPATH=...` / `CSS=...` | **Enhancement**: More flexible selector syntax |
| **Highlight** | Highlights target if `highlight` pref enabled | No highlight support | **Cosmetic**: No visual highlight |
| **Retry on not-found** | `this.retry()` with timer-based retry loop | No retry in handler | **Potential gap**: Retry behavior depends on content script |
| **Error code** | RuntimeError with code 921 | `ELEMENT_NOT_VISIBLE` (-921) | **Compatible**: Same error code |

## Output / Side Effects

- **Variables modified**: None. EVENTS does not modify `!EXTRACT` or any built-in variables.
- **Return value**: `CommandResult` with success/failure and error code.
- **Side effects**: Sequence of DOM events dispatched on the target element. May cause text input, mouse movement, form changes, etc.
- **Error codes**: `-913` (MISSING_PARAMETER) if TYPE missing; `-921` (ELEMENT_NOT_VISIBLE) if element not found or dispatch fails.

## Test Coverage

### Parser tests (tests/unit/parser.test.ts)
- Parses `EVENTS TYPE=keypress SELECTOR="#input" CHARS="hello"` as EVENTS type (line 737-739)
- EVENTS included in supported commands list (line 879)

### Unit tests — command-handlers (tests/unit/command-handlers.test.ts)
- EVENTS handler: alias for EVENT, dispatches events identically (line 1400-1415)
- EVENTS returns MISSING_PARAMETER when TYPE is missing (line 1417-1422)
- EVENTS passes through bridge errors (line 1425-1430)
- Handler map includes EVENTS (line 1451)

### Integration tests (tests/integration/commands/event.test.ts)
- EVENTS alias: sends EVENT_COMMAND same as EVENT (lines 282-294)
- All EVENT tests implicitly apply to EVENTS since they share the same handler
