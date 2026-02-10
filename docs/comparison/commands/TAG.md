# TAG Command Comparison

## Syntax

```
TAG POS=<number> TYPE=<tagname> ATTR=<attr_spec> [FORM=<form_spec>] [CONTENT=<value>|EXTRACT=<type>]
TAG POS=R<number> TYPE=<tagname> ATTR=<attr_spec> [CONTENT=<value>|EXTRACT=<type>]
TAG XPATH=<expression> [CONTENT=<value>|EXTRACT=<type>]
TAG CSS=<selector> [CONTENT=<value>|EXTRACT=<type>]
```

**Old regex**: `"^(?:pos\\s*=\\s*(\\S+)\\s+type\\s*=\\s*(\\S+)(?:\\s+form\\s*=\\s*(<atts_re>))?\\s+attr\\s*=\\s*(<atts_re>)|xpath\\s*=\\s*(<im_strre>))(?:\\s+(content|extract)\\s*=\\s*(<value_re>))?\\s*$"` — case-insensitive. Captures: (1) POS value, (2) TYPE value, (3) optional FORM spec, (4) ATTR spec, (5) XPATH expression, (6) CONTENT or EXTRACT keyword, (7) the value for CONTENT/EXTRACT.

Where `atts_re` = `"(?:[-\\w]+:<im_strre>(?:&&[-\\w]+:<im_strre>)*|\\*?)"` and `im_strre` = `"(?:\"(?:[^\"\\\\]|\\\\[0btnvfr\"\'\\\\])*\"|eval\\s*\\(\"(?:[^\"\\\\]|\\\\[\\w\"\'\\\\])*\"\\)|\\S*)"` (matches quoted strings with escapes, `eval()` expressions, or non-whitespace tokens).

**New parser**: `parser.ts:636-650` — Validates that either `XPATH` is present, or both `POS` and `TYPE` are present. Returns a validation error if neither condition is met. CSS selector support is handled at the handler level, not the parser.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `POS=<n>` | 1-based element position. Positive = forward from start, negative = not supported in old. `R<n>` = relative to last found element (R1 = 1st after anchor, R-1 = 1st before anchor) |
| `TYPE=<tagname>` | HTML element tag name (e.g., INPUT, A, DIV, TABLE, SELECT, TEXTAREA). Supports `TYPE=INPUT:TEXT` sub-type syntax |
| `ATTR=<spec>` | Attribute filter. Format: `key:value` or `key:value&&key2:value2`. Keys: NAME, ID, CLASS, TXT (text content), HREF, SRC, TYPE, VALUE, etc. Wildcards (`*`) supported |
| `FORM=<spec>` | Optional form filter. Same format as ATTR, applied to the element's parent `<form>`. `FORM=NAME:NoFormName` is treated as no filter |
| `CONTENT=<value>` | Value to set on the found element (text inputs, selects, checkboxes, etc.). Special tokens: `<SP>`=space, `<BR>`=newline, `<TAB>`=tab, `<ENTER>`=Enter key. Special values: `<SUBMIT>`, `<RESET>` for form actions. Select options: `%text`, `$value`, `#index` prefixes |
| `EXTRACT=<type>` | Extract data from element. Types: TXT, TXTALL, HTM, HREF, TITLE, ALT, CHECKED. Also VALUE, SRC, ID, CLASS, NAME in new |
| `XPATH=<expr>` | XPath expression to find element directly (bypasses POS/TYPE/ATTR) |
| `CSS=<selector>` | CSS selector to find element (new only, not in old regex) |

## Old Implementation (MacroPlayer.js:3087-3230)

### Regex (MacroPlayer.js:3087-3096)

```javascript
const atts_re = "(?:[-\\w]+:"+im_strre+"(?:&&[-\\w]+:"+im_strre+")*|\\*?)";

MacroPlayer.prototype.RegExpTable["tag"] =
    "^(?:pos\\s*=\\s*(\\S+)\\s+"+
    "type\\s*=\\s*(\\S+)"+
    "(?:\\s+form\\s*=\\s*("+atts_re+"))?\\s+"+
    "attr\\s*=\\s*("+atts_re+")"+
    "|xpath\\s*=\\s*("+im_strre+"))"+
    "(?:\\s+(content|extract)\\s*=\\s*"+
    "(\\d+(?::\\d+)*|"+                         // numeric indices: 1:2:3
    "[%$]"+im_strre+"(?::[%$]"+im_strre+")*|"   // %text or $value with : separators
    +im_strre+"))?\\s*$";                        // general string value
```

Capture groups: (1) POS, (2) TYPE, (3) FORM, (4) ATTR, (5) XPATH, (6) keyword CONTENT/EXTRACT, (7) value.

### Action handler (MacroPlayer.js:3098-3175)

```javascript
MacroPlayer.prototype.ActionTable["tag"] = function (cmd) {
    var pos = 0, relative = false, tagName = "", form = null, atts = null;
    var xpath = null;
    var txt = cmd[6] ? cmd[7] : null;    // CONTENT/EXTRACT value
    var type = cmd[6] ? cmd[6].toLowerCase() : "";  // "content" or "extract"

    if (cmd[5]) {
        // XPATH mode
        xpath = imns.unwrap(this.expandVariables(cmd[5]));
    } else {
        // POS/TYPE/ATTR mode
        pos = imns.unwrap(this.expandVariables(cmd[1]));
        tagName = imns.unwrap(this.expandVariables(cmd[2])).toLowerCase();
        form = TagHandler.parseAtts(cmd[3]);
        atts = TagHandler.parseAtts(cmd[4]);

        // Parse POS: R<n> for relative, <n> for absolute
        if (/^r(-?\d+)$/i.test(pos)) {
            pos = imns.s2i(RegExp.$1);
            relative = true;
        } else if (/^(\d+)$/.test(pos)) {
            pos = imns.s2i(RegExp.$1);
            relative = false;
        } else {
            throw new BadParameter("POS=<number> or POS=R<number>...", 1);
        }

        // Handle TYPE subtype: INPUT:TEXT -> tagName=INPUT, atts.type=TEXT
        if (/^(\S+):(\S+)$/i.test(tagName)) {
            if (!atts) atts = new Object();
            tagName = RegExp.$1.toLowerCase();
            var val = TagHandler.escapeChars(RegExp.$2).replace(/\*/g, '(?:[\r\n]|.)*');
            atts["type"] = new RegExp("^"+val+"$");
        }
    }

    // Find element
    var doc = this.currentWindow.document;
    var root = doc.documentElement;
    var element = xpath ? TagHandler.findByXPath(doc, root, xpath) :
        TagHandler.find(doc, root, pos, relative, tagName, atts, form);

    if (!element) {
        this.retry(function() {
            if (type == "extract") {
                self.showAndAddExtractData("#EANF#");
            } else {
                if (type == "content" && /^event:fail_if_found$/i.test(txt))
                    return;  // CONTENT=EVENT:FAIL_IF_FOUND on missing element = success
                throw new RuntimeError("element ... was not found", 921);
            }
        }, "Tag waiting...");
    } else {
        this.playingAgain = false;
        this.processElement(element, type, txt);
    }
};
```

### TagHandler object (MacroPlayer.js:2489-3073)

#### parseAtts (MacroPlayer.js:2510-2538)

Parses attribute specifications like `NAME:value&&CLASS:bar`:
1. Splits by `&&` (with lookahead for `key:value` pairs).
2. For each pair, extracts key and value via regex.
3. Calls `imns.escapeTextContent()` then `escapeChars()` on the value.
4. Replaces `*` with `(?:[\r\n]|.)*` (wildcard matching).
5. Replaces spaces with `\\s+` for flexible whitespace matching.
6. Creates a case-insensitive regex: `new RegExp("^\\s*"+val+"\\s*$", "i")`.
7. Returns null for `"*"` or empty string.

#### match (MacroPlayer.js:2541-2593)

Matches a DOM node against parsed attribute regexes:
1. For `txt` attribute: tests against `node.textContent`.
2. For other attributes: checks both DOM property (`node[at]`) and HTML attribute (`node.getAttribute(at)`).
3. Special case for `type` attribute on inputs: maps HTML5 input types (color, date, datetime, email, etc.) to "text" for matching purposes.
4. Special case for `href`: if element has no `href` but has `src`, falls back to `src`.

#### find (MacroPlayer.js:2597-2657)

Finds an element by POS/TYPE/ATTR:
1. Builds XPath based on `relative` flag: `descendant-or-self::*` (absolute), `following::*` (relative forward), or `preceding::*` (relative backward).
2. For `tagName != "*"`, adds case-insensitive name filter via `translate()`.
3. Evaluates XPath on the document to get all candidate nodes.
4. Iterates forward (pos > 0) or backward (pos < 0) through candidates.
5. For each candidate: checks attribute match via `match()`, then optionally checks form match.
6. `FORM=NAME:NoFormName` is treated as null (no form filter).
7. Returns the nth matching element (where n = |pos|).
8. Stores the found element as `this.lastNode` for relative positioning in subsequent TAG commands.

#### findByXPath (MacroPlayer.js:2662-2683)

Finds element by user-provided XPath:
1. Evaluates the XPath expression on the document root.
2. If more than one result: throws `RuntimeError("ambiguous XPath expression", 982)`.
3. If exactly one result: returns it.
4. On XPath syntax error: throws `RuntimeError("incorrect XPath expression", 981)`.

#### onExtractParam (MacroPlayer.js:2746-2816)

Handles `EXTRACT=<type>`:
- **TXT**: For `input`/`textarea` → `element.value`. For `select` → `options[selectedIndex].text`. For `table` → CSV format with rows/columns. Default → `element.textContent`.
- **TXTALL**: For `select` → all options joined with `[OPTION]` separator.
- **HTM**: `getOuterHTML(element)` with tabs/newlines replaced by spaces.
- **HREF**: Checks `element.href`, then `getAttribute("href")`, then `element.src`, then `getAttribute("src")`, then `#EANF#`.
- **TITLE/ALT**: Checks property then attribute, else `#EANF#`.
- **CHECKED**: Only for checkbox/radio — returns "YES" or "NO". Throws `BadParameter` for other input types.
- Invalid type: throws `BadParameter("EXTRACT=TXT|TXTALL|HTM|TITLE|ALT|HREF|CHECKED", 5)`.

#### onContentParam (MacroPlayer.js:2819-2891)

Handles `CONTENT=<value>`:
1. Fires `focus` event on focusable elements.
2. Per element type:
   - **select**: Calls `handleSelectElement()` — supports `%text`, `$value`, `#index` selection, multi-select via colon separators, `ALL` keyword.
   - **input[text/hidden/file/color/date/etc]**: Sets `element.value`, fires `change` event.
   - **input[password]**: Decryption via Rijndael if encryption is configured, then sets value.
   - **input[checkbox]**: `YES`/`TRUE`/`ON` → check, `NO`/`FALSE`/`OFF` → uncheck, otherwise toggle via click.
   - **button**: Simulates click.
   - **textarea**: Sets `element.value`, fires `change` event.
   - **default** (any other element): Simulates click.
3. Fires `blur` event on focusable elements.

#### processElement (MacroPlayer.js:3178-3230)

Dispatches to extract or content handling:
1. If download dialog expected: sets `waitingForDownloadDlg = true`.
2. If `scroll` pref enabled: scrolls element into view.
3. If `highlight` pref enabled: adds blue outline to element.
4. If `type == "extract"`: calls `TagHandler.onExtractParam()`.
5. If `type == "content"` or no type (bare TAG):
   - `CONTENT=EVENT:<etype>`: Dispatches special events:
     - `SAVEITEM`/`SAVEPICTUREAS` → save picture
     - `SAVE_ELEMENT_SCREENSHOT` → save screenshot
     - `SAVETARGETAS`/`SAVETARGET` → save target
     - `MOUSEOVER` → dispatch mouseover event
     - `FAIL_IF_FOUND` → throw `RuntimeError("FAIL_IF_FOUND event", 990)`
   - Otherwise: calls `TagHandler.onContentParam()`.

### Retry mechanism (MacroPlayer.js:127-152)

Uses `this.tagTimeout` (set via `!TIMEOUT_TAG`/`!TIMEOUT_STEP`):
- Retries at 100ms intervals via `ShouldWaitSignal(100)` exception.
- Total attempts: `Math.round(timeout * 10)` (e.g., 6s → 60 attempts).
- On timeout exhaustion: for EXTRACT → stores `#EANF#`; for CONTENT with `EVENT:FAIL_IF_FOUND` → silent success; otherwise → throws `RuntimeError(921)`.

### Key details (old)

- POS=0 throws `BadParameter` (must be non-zero integer)
- POS=R<n> uses relative positioning from `TagHandler.lastNode`
- TYPE sub-typing (`INPUT:TEXT`) splits into tagName + type attribute filter
- ATTR wildcards (`*`) match any character including newlines
- ATTR matching is case-insensitive with whitespace-flexible regex
- FORM=NAME:NoFormName is treated as "no form filter"
- XPath mode must return exactly one element (ambiguous = error 982, invalid = error 981)
- Element not found with EXTRACT → stores `#EANF#` (not an error)
- Element not found without EXTRACT → error 921 (after retry timeout)
- `CONTENT=EVENT:FAIL_IF_FOUND` + element found → error 990; element not found → silent success
- Password decryption uses Rijndael cipher with stored/session master password
- Error code 921: element not found
- Error code 981: incorrect XPath
- Error code 982: ambiguous XPath
- Error code 990: FAIL_IF_FOUND triggered
- Error code 924: select option not found
- Error code 925: invalid select index
- Error code 911: wrong CONTENT format for select

## New Implementation (interaction.ts:540-637)

### Helper: parseAttrParam (interaction.ts:273-317)

Parses ATTR parameter without regex conversion:
1. Splits by `&&` for multiple attributes.
2. For each part, splits on first `:` to get prefix and value.
3. Maps standard prefixes (NAME, ID, CLASS, HREF, SRC, etc.) to lowercase keys.
4. Maps `TXT` to `innerText`.
5. Unknown prefixes stored as lowercase custom attributes.
6. No-prefix values stored under `selector` key.
7. Returns a plain `Record<string, string>` — regex conversion happens in the content script's element finder.

### Helper: parsePosParamEx (interaction.ts:374-391)

```typescript
export function parsePosParamEx(posStr: string): ParsedPos {
    const trimmed = posStr.trim().toUpperCase();
    if (trimmed.startsWith('R')) {
        const num = parseInt(trimmed.substring(1), 10);
        if (!isNaN(num) && num !== 0) {
            return { pos: num, relative: true };
        }
        return { pos: 1, relative: false };  // Invalid R0 defaults to absolute 1
    }
    const num = parseInt(trimmed, 10);
    return { pos: isNaN(num) ? 1 : num, relative: false };
}
```

### Helper: parseContentParam (interaction.ts:402-408)

```typescript
export function parseContentParam(contentStr: string): string {
    return contentStr
        .replace(/<SP>/gi, ' ')
        .replace(/<BR>/gi, '\n')
        .replace(/<TAB>/gi, '\t')
        .replace(/<ENTER>/gi, '\n');
}
```

### Helper: parseExtractParam (interaction.ts:327-342)

Validates extract type against `VALID_EXTRACT_TYPES`: TXT, HTM, HREF, TITLE, ALT, VALUE, SRC, ID, CLASS, NAME, TXTALL, CHECKED. Also supports `ATTR:<name>` prefix for custom attributes. Throws `BadParameter` for unrecognized types.

### Helper: buildSelector (interaction.ts:413-454)

Builds `ElementSelector` from command parameters:
1. **XPATH** takes precedence — returns immediately with just xpath.
2. **CSS** takes second precedence — returns immediately with just css.
3. **POS/TYPE/ATTR/FORM** — traditional selection. Parses POS via `parsePosParamEx()`, uppercases TYPE, passes ATTR and FORM as raw strings.

### Helper: buildAction (interaction.ts:459-484)

Builds `TagAction` from command parameters:
1. Parses CONTENT via `parseContentParam()`.
2. Parses EXTRACT via `parseExtractParam()`.
3. `CONTENT=<SUBMIT>` → `action.form = 'SUBMIT'`, deletes content.
4. `CONTENT=<RESET>` → `action.form = 'RESET'`, deletes content.

### Main handler: tagHandler (interaction.ts:540-637)

```typescript
export const tagHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
    const selector = buildSelector(ctx);
    const action = buildAction(ctx);

    // Validate: must have XPATH, CSS, or TYPE
    if (!selector.xpath && !selector.css && !selector.type) {
        return { success: false, errorCode: MISSING_PARAMETER, errorMessage: '...' };
    }

    // Timeout from !TIMEOUT_TAG (seconds → ms), default 6000ms
    const timeoutTag = ctx.state.getVariable('!TIMEOUT_TAG');
    let timeout = 6000;
    if (typeof timeoutTag === 'number') timeout = timeoutTag * 1000;
    else if (typeof timeoutTag === 'string') {
        const parsed = parseFloat(timeoutTag);
        if (!isNaN(parsed)) timeout = parsed * 1000;
    }

    // Build TAG_COMMAND message for content script
    const message: TagCommandMessage = {
        id: generateMessageId(),
        type: 'TAG_COMMAND',
        timestamp: Date.now(),
        payload: { selector, action, timeout, waitVisible: true },
    };

    // Send to content script via active sender
    const response = await activeSender.sendMessage(message);

    if (!response.success) {
        // EXTRACT on element-not-found (-920) → store #EANF#, return success
        if (action.extract && response.errorCode === -920) {
            ctx.state.addExtract('#EANF#');
            return { success: true, errorCode: OK, output: '#EANF#' };
        }
        return { success: false, errorCode: response.errorCode || ELEMENT_NOT_FOUND, ... };
    }

    // Store extracted data if present
    if (action.extract && response.extractedData !== undefined) {
        ctx.state.addExtract(response.extractedData);
    }

    return { success: true, errorCode: OK, output: response.extractedData };
};
```

### Content script execution (extension/src/content/dom-executor.ts, element-finder.ts)

The actual DOM element finding and interaction happens in the content script:
- `element-finder.ts` — Implements element finding by POS/TYPE/ATTR, XPATH, and CSS selector. Handles attribute matching, wildcard expansion, relative positioning, and form filtering.
- `dom-executor.ts` — Receives `TAG_COMMAND` messages, uses `ElementFinder` to locate elements, then performs CONTENT (form filling, clicking) or EXTRACT operations. Handles retry/wait logic within the timeout window. Dispatches focus, change, blur events as needed.

### Parser validation (parser.ts:636-650)

```typescript
case 'TAG': {
    const hasXPath = command.parameters.some(p => p.key.toUpperCase() === 'XPATH');
    const hasPos = command.parameters.some(p => p.key.toUpperCase() === 'POS');
    const hasType = command.parameters.some(p => p.key.toUpperCase() === 'TYPE');

    if (!hasXPath && (!hasPos || !hasType)) {
        return {
            lineNumber: command.lineNumber,
            message: 'TAG command requires either XPATH or POS and TYPE parameters',
            raw: command.raw,
        };
    }
    break;
}
```

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Architecture** | Direct DOM manipulation in same process (Firefox XUL overlay) | Message-passing to content script via `ContentScriptSender` | **Structural**: Chrome extension model requires serialized messages |
| **CSS selector** | Not supported — only POS/TYPE/ATTR or XPATH | Supported via `TAG CSS=<selector>` | **Enhancement**: Additional selector method |
| **Regex-based parameter parsing** | Single complex regex with capture groups | Key-value parameter parser, helper functions | **Structural**: More maintainable, same logical parsing |
| **Attribute matching** | Converts ATTR values to regex with `escapeChars()`, `*`→`(?:[\r\n]|.)*`, spaces→`\\s+`, case-insensitive anchored match | Passes raw ATTR string to content script; element-finder.ts handles matching | **Structural**: Same matching logic relocated to content script |
| **TYPE sub-typing** | `INPUT:TEXT` parsed in action handler: splits on `:`, adds `type` regex to atts | `INPUT:TEXT` passed as `TYPE=INPUT:TEXT` string; content script parses sub-type | **Compatible**: Same behavior, different parsing location |
| **Relative positioning (POS=R)** | Uses `TagHandler.lastNode` stored in same-process `TagHandler` object | Content script maintains last-found element for relative queries | **Compatible**: Same concept, different storage scope |
| **POS=0** | Throws `BadParameter("POS=<number> or POS=R<number>...", 1)` | `parsePosParamEx` returns `{ pos: 0, relative: false }` — rejected by element finder | **Compatible**: Both reject POS=0 |
| **POS with invalid value** | Throws `BadParameter` immediately | Defaults to `pos: 1` (NaN parsed as 1) | **Behavioral**: New is more lenient — invalid POS silently defaults to 1 |
| **XPATH ambiguity check** | `findByXPath` throws error 982 if >1 node found | Content script element finder handles this | **Implementation detail**: Check may differ |
| **XPATH syntax error** | Throws `RuntimeError("incorrect XPath expression", 981)` | Content script returns error via response | **Compatible**: Same error reported differently |
| **Retry mechanism** | Exception-based `ShouldWaitSignal(100)` — retries at 100ms intervals | Content script handles retry internally within timeout window | **Structural**: Retry loop in content script vs. re-execution in old |
| **Retry timeout** | `tagTimeout` (from `!TIMEOUT_TAG`) or `timeout/10`, in seconds × 10 attempts | `!TIMEOUT_TAG` × 1000ms passed as `timeout` in message payload | **Compatible**: Same timeout variable, content script manages retry |
| **Default timeout** | `tagTimeout` defaults to -1 (uses `timeout/10` ≈ 6s for default 60s macro timeout) | Default 6000ms (6 seconds) hardcoded | **Compatible**: Same effective default |
| **EXTRACT #EANF#** | Stores `#EANF#` via `showAndAddExtractData` in retry callback | Stores `#EANF#` via `ctx.state.addExtract` when errorCode is -920 | **Compatible**: Same behavior |
| **EXTRACT types** | TXT, TXTALL, HTM, HREF, TITLE, ALT, CHECKED only | TXT, TXTALL, HTM, HREF, TITLE, ALT, VALUE, SRC, ID, CLASS, NAME, CHECKED, ATTR:\<name\> | **Enhancement**: More extract types supported |
| **EXTRACT=CHECKED validation** | Throws `BadParameter` if not checkbox/radio | Content script handles validation | **Compatible**: Same restriction |
| **EXTRACT=HTM** | Uses custom `getOuterHTML()` with `cloneNode()` + `div.innerHTML`, strips tabs/newlines | Content script uses standard `outerHTML` | **Behavioral**: Minor formatting differences possible |
| **CONTENT special tokens** | Handled in `expandVariables()` and `onContentParam()` | `parseContentParam()`: `<SP>`→space, `<BR>`→newline, `<TAB>`→tab, `<ENTER>`→newline | **Gap**: Old `<ENTER>` triggers Enter keypress; new converts to newline (see unit test showing `pressEnter` flag — bridge-dependent) |
| **CONTENT=EVENT:\<type\>** | Handled in `processElement()`: SAVEITEM, SAVE_ELEMENT_SCREENSHOT, SAVETARGETAS, MOUSEOVER, FAIL_IF_FOUND | Not parsed in handler — passed through as CONTENT string | **Implementation detail**: Content script must handle EVENT: prefixed content |
| **CONTENT=EVENT:FAIL_IF_FOUND** | Element found → error 990; element not found → silent success | Handled by content script response | **Compatible**: Same semantic, different execution path |
| **Password decryption** | Rijndael decryption with master/session password for `input[password]` | Not handled in handler — content script or bridge manages password handling | **Structural**: Decryption responsibility shifted |
| **Select element handling** | Complex `handleSelectElement()`: `%text`, `$value`, `#index`, multi-select via `:` separator, `ALL` keyword | CONTENT value passed through to content script for processing | **Structural**: Select logic in content script |
| **Form action SUBMIT/RESET** | Handled as part of CONTENT in `onContentParam()` | Parsed in `buildAction()`: `<SUBMIT>`→`action.form='SUBMIT'`, `<RESET>`→`action.form='RESET'` | **Compatible**: Same behavior, explicit form action in message |
| **Focus/blur events** | `htmlFocusEvent()` before, `htmlBlurEvent()` after content operations | Content script fires appropriate events | **Structural**: Same concept, different execution context |
| **Change event** | `htmlChangeEvent()` after setting input/select/textarea values | Content script fires change event | **Structural**: Same concept |
| **Scroll to element** | Conditional on `imns.Pref.getBoolPref("scroll")` | Content script may handle scroll | **Implementation detail**: Pref-based in old |
| **Highlight element** | Conditional on `imns.Pref.getBoolPref("highlight")` — blue outline | Content script may handle highlight | **Implementation detail**: Pref-based in old |
| **FORM=NAME:NoFormName** | Treated as null (no form filter) | Not explicitly handled in handler; passed to content script | **Implementation detail**: Content script must handle this convention |
| **Parser validation** | Regex-only — invalid syntax silently fails to match | Explicit validation: requires XPATH or POS+TYPE | **Enhancement**: Better error messages at parse time |
| **CSS selector support** | Not available | `TAG CSS=.selector` supported | **Enhancement**: New feature |
| **ATTR: prefix in EXTRACT** | Not supported | `EXTRACT=ATTR:<name>` extracts custom attribute | **Enhancement**: New feature |
| **Error codes** | 921 (not found), 981 (bad XPath), 982 (ambiguous XPath), 990 (FAIL_IF_FOUND), 924/925 (select), 911 (CONTENT format) | -920 (not found), -921 (not visible), MISSING_PARAMETER, INVALID_PARAMETER, SCRIPT_ERROR | **Behavioral**: Different error code numbering scheme (negative in new) |

## Output / Side Effects

- **Variables modified**: `!EXTRACT` appended via `addExtract()` when EXTRACT is used. `TagHandler.lastNode` updated for relative positioning.
- **Return value (old)**: No return value — direct DOM mutation. Throws errors for failures. Uses `showAndAddExtractData()` to display and store extracted text.
- **Return value (new)**: `{ success: true, errorCode: OK, output: extractedData }` on success. Error results:
  - `MISSING_PARAMETER` — no XPATH, CSS, or TYPE specified
  - `INVALID_PARAMETER` — bad EXTRACT type
  - `ELEMENT_NOT_FOUND` (-920) — element not found (but returns success with `#EANF#` for EXTRACT)
  - `ELEMENT_NOT_VISIBLE` (-921) — element found but not visible
  - `SCRIPT_ERROR` — content script communication failure
- **Side effects (old)**: Modifies DOM elements (sets values, clicks, fires events), scrolls to element, highlights element, updates `lastNode`, handles download dialogs.
- **Side effects (new)**: Sends `TAG_COMMAND` message to content script. Content script performs all DOM operations. Stores extract data in state.

## Test Coverage

### Parser tests (tests/unit/parser.test.ts)

- Parse simple `TAG POS=1 TYPE=INPUT:TEXT ATTR=NAME:test` (line 237)
- Parse TAG with FORM parameter (line 243)
- Parse TAG with CONTENT parameter (line 249)
- Parse TAG with quoted CONTENT (line 255)
- Parse TAG with EXTRACT=TXT (line 261)
- Parse TAG with EXTRACT=HTM (line 267)
- Parse TAG with EXTRACT=HREF (line 273)
- Parse TAG with wildcard in ATTR (line 279)
- Parse TAG with `&&` in ATTR (line 285)
- Parse TAG with `%` for select content (line 291)
- Parse TAG with multiple select values using colon (line 297)
- Parse TAG with relative position POS=R3 (line 303)
- Parse TAG with XPATH (line 309)
- Parse TAG with complex XPATH (line 316)
- Parse TAG with radio button TYPE=INPUT:RADIO (line 323)
- Parse TAG with checkbox TYPE=INPUT:CHECKBOX (line 329)
- Parse TAG with password TYPE=INPUT:PASSWORD (line 335)
- Parse TAG with textarea (line 341)
- Parse TAG with submit button TYPE=BUTTON:SUBMIT (line 347)
- Parse TAG with file input TYPE=INPUT:FILE (line 353)
- Parse TAG with TABLE extraction (line 359)
- Validate TAG requires POS+TYPE or XPATH (line 365)
- No error when TAG has XPATH (line 371)
- Validator returns null for valid TAG with XPATH (line 1528)
- Validator returns null for valid TAG with POS and TYPE (line 1534)
- Validator returns error for TAG missing required params (line 1540)
- Parse parameters separated by tabs in TAG command (line 1642)
- Roundtrip TAG command with quoted CONTENT (line 1666)

### Unit tests — command handlers (tests/unit/command-handlers.test.ts)

- Builds params correctly from POS, TYPE, ATTR, CONTENT (line 508)
- Builds params from XPATH selector (line 526)
- Builds params from CSS selector (line 538)
- Uses default timeout 6000ms when !TIMEOUT_TAG not set (line 550)
- Uses !TIMEOUT_TAG × 1000 as timeout (line 558)
- Uses default timeout when !TIMEOUT_TAG is non-numeric string (line 569)
- Parses !TIMEOUT_TAG when set as string number (line 580)
- CONTENT=\<SUBMIT\> sets form=SUBMIT and clears content (line 593)
- CONTENT=\<RESET\> sets form=RESET and clears content (line 605)
- Replaces \<SP\> with space in CONTENT (line 619)
- Replaces \<BR\> with newline in CONTENT (line 630)
- Replaces \<TAB\> with tab character in CONTENT (line 641)
- \<ENTER\> triggers pressEnter flag (line 652)
- Multiple special tokens in CONTENT simultaneously (line 666)
- Stores extracted data via addExtract when EXTRACT is set (line 682)
- Does not call addExtract when extractedData is undefined (line 695)
- Does not call addExtract when EXTRACT is not set (line 706)
- POS defaults to 1 when not provided (line 716)
- POS with numeric value parsed correctly (line 724)
- POS with R prefix sets relative positioning (line 732)
- POS with non-numeric value defaults to 1 (line 741)
- Returns ELEMENT_NOT_FOUND when bridge returns success=false (line 751)
- Returns ELEMENT_NOT_FOUND with default message (line 763)
- Returns SCRIPT_ERROR when bridge throws (line 772)
- Uses default error message when bridge throws without message (line 782)
- Passes FORM parameter through to bridge (line 791)

### Integration tests — interaction commands (tests/integration/commands/interaction.test.ts)

- TAG Command DOM tests with TagCommand class (line 340):
  - Find element by type (line 370)
  - Find element by type and position (line 377)
  - Find element by attribute (line 384)
  - Various selector and interaction tests (lines 370-808)
- TAG Command Helper Functions (line 809):
  - parseAttrParam, parseExtractParam, parsePosParam, parseContentParam tests
- TAG Command Handler Integration with mock ContentScriptSender (line 1302):
  - TAG with CONTENT sends correct selector and action (line 1325)
  - TAG with CONTENT containing special tokens (line 1341)
  - TAG with XPATH selector and CONTENT (line 1350)
  - TAG with CSS selector and CONTENT (line 1360)
  - TAG with !TIMEOUT_TAG timeout (line 1370)
  - TAG with default timeout (line 1380)
  - TAG with EXTRACT (line 1391+):
    - EXTRACT=TXT stores extracted data (line 1405)
    - EXTRACT=HTM stores HTML content (line 1426)
    - EXTRACT=HREF stores href attribute (line 1444)
    - EXTRACT returns #EANF# when element not found (line 1464)
    - EXTRACT with various types (lines 1485-1627)
  - TAG EXTRACT error propagation for non-element-not-found errors (line 1645)
  - TAG via MacroExecutor full pipeline (line 1698):
    - Execute TAG with CONTENT through full pipeline (line 1725)
    - Execute TAG with EXTRACT through full pipeline (line 1740)
    - Execute multiple TAG commands in sequence (line 1758)
    - Expand variables in TAG parameters (line 1779)
    - Stop execution on TAG error when ERRORIGNORE is NO (line 1795)
    - Continue execution on TAG error when ERRORIGNORE is YES (line 1815)
    - Execute TAG with XPATH through full pipeline (line 1842)
    - Execute TAG with CSS through full pipeline (line 1851)
    - Set waitVisible=true on TAG messages (line 1860)
    - Generate unique message IDs (line 1868)

### Element finder tests (tests/unit/element-finder.test.ts)

- Find element by text using TAG selector with TXT attr (line 206)
- Find button by type attribute using TAG selector (line 266)
- Combine TXT with TYPE filter via TAG selector (line 887)
- Combine TXT with ATTR filter via TAG selector (line 894)
- Parse simple TAG selector (line 1261)
- Parse selector without TAG prefix (line 1270)
- Combine TYPE, ATTR, and TXT via TAG selector (line 1460)

### E2E tests

- DOM Interaction Pipeline: TAG CONTENT + EXTRACT (tests/e2e/pipeline.test.ts:483)
- TAG EXTRACT text from element (line 484)
- TAG CONTENT fill text input (line 511)
- TAG CONTENT fill select dropdown (line 521)
- TAG flows through ContentScriptSender (line 722)
- Recording generates parseable TAG commands for button clicks (tests/e2e/recording.test.ts:483)
- Recording generates parseable TAG commands for form inputs (line 664)
- Validate every TAG command in generated macro (line 879)
- Play back clicks via TAG command (line 1000)
