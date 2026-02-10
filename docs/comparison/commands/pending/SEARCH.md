# SEARCH Command Comparison

## Syntax

```
SEARCH SOURCE=<TXT|REGEXP>:<pattern> [IGNORE_CASE=<YES|NO>] [EXTRACT=<pattern>]
```

**Old regex**: `^source\s*=\s*(txt|regexp):(<im_strre>)(?:\s+ignore_case\s*=\s*(yes|no))?(?:\s+extract\s*=\s*(<im_strre>))?\s*$`
- Four capture groups: SOURCE type (group 1), pattern (group 2), IGNORE_CASE (group 3, optional), EXTRACT (group 4, optional)
- Fixed order: SOURCE, optional IGNORE_CASE, optional EXTRACT
- The source type prefix (`txt`/`regexp`) and the pattern after `:` are captured as separate groups

**New parser**: Key-value parameter command — `parser.ts:821-830` validates that SOURCE parameter is present. IGNORE_CASE and EXTRACT are parsed as optional key-value pairs in any order.

## Parameters

| Parameter | Required | Values | Description |
|-----------|----------|--------|-------------|
| SOURCE | Yes | TXT:\<pattern\> or REGEXP:\<pattern\> | Search type and pattern |
| IGNORE_CASE | No | YES, NO (default NO) | Case-insensitive matching |
| EXTRACT | No | Pattern with $1, $2, etc. | Extract captured groups (REGEXP only) |

## Old Implementation (MacroPlayer.js:1973-2029)

```javascript
MacroPlayer.prototype.RegExpTable["search"] =
    "^source\\s*=\\s*(txt|regexp):("+im_strre+")"+
    "(?:\\s+ignore_case\\s*=\\s*(yes|no))?"+
    "(?:\\s+extract\\s*=\\s*("+im_strre+"))?\\s*$";

MacroPlayer.prototype.ActionTable["search"] = function (cmd) {
    var query = imns.unwrap(this.expandVariables(cmd[2]));
    var extract = cmd[4] ? imns.unwrap(this.expandVariables(cmd[4])) : "";
    var ignore_case = cmd[3] && /^yes$/i.test(cmd[3]) ? "i" : "";
    var search_re;

    if (extract && !(cmd[1].toLowerCase() == "regexp"))
        throw new BadParameter("EXTRACT has sense only for REGEXP search");

    switch (cmd[1].toLowerCase()) {
    case "txt":
        query = TagHandler.escapeChars(query);
        query = query.replace(/\*/g, '(?:[\r\n]|.)*');
        query = query.replace(/ /g, "\\s+");
        search_re = new RegExp(query, ignore_case);
        break;
    case "regexp":
        try {
            search_re = new RegExp(query, ignore_case);
        } catch(e) {
            throw new RuntimeError("Can not compile regular expression: "
                                   +query, 983);
        }
        break;
    }

    var root = this.currentWindow.document.documentElement;
    var found = search_re.exec(root.innerHTML);
    var mplayer = this;
    if (!found) {
        this.retry(function() {
            if (mplayer.ignoreErrors)
                return;
            throw new RuntimeError(
                "Source does not match to "+cmd[1]+"='"+
                    imns.unwrap(mplayer.expandVariables(cmd[2]))+"'",
                926
            );
        }, "Element waiting...");
    }

    if (extract) {
        extract = extract.replace(/\$(\d{1,2})/g, function (match_str, x) {
            return found[x];
        });
        this.addExtractData(extract);
    }
};
```

### `TagHandler.escapeChars()` (MacroPlayer.js:2492-2506)

```javascript
escapeChars: function(str) {
    var chars = "^$.+?=!:|\\/()[]{}", res = "", i, j;
    for ( i = 0; i < str.length; i++) {
        for (j = 0; j < chars.length; j++) {
            if (str[i] == chars[j]) {
                res += "\\";
                break;
            }
        }
        res += str[i];
    }
    return res;
}
```

Escapes regex special characters `^$.+?=!:|\\/()[]{}` by prepending `\`. Notably does NOT escape `*` (used as wildcard) or `-`.

### `addExtractData()` (MacroPlayer.js:4860-4866)

```javascript
MacroPlayer.prototype.addExtractData = function(str) {
    if ( this.extractData.length ) {
        this.extractData += "[EXTRACT]"+str;
    } else {
        this.extractData = str;
    }
};
```

Concatenates extracted values with `[EXTRACT]` delimiter.

### Step-by-step logic (old)

1. **Parse parameters**: Regex captures SOURCE type (group 1, `txt` or `regexp`), pattern (group 2), optional IGNORE_CASE (group 3), optional EXTRACT (group 4). Variable expansion applied to pattern and extract.
2. **Validate EXTRACT**: If EXTRACT is provided but SOURCE type is not `regexp`, throws `BadParameter("EXTRACT has sense only for REGEXP search")`.
3. **Build regex for TXT**: Escapes regex special chars via `TagHandler.escapeChars()` (escapes `^$.+?=!:|\\/()[]{}` but NOT `*`). Replaces `*` with `(?:[\r\n]|.)*` (match anything including newlines). Replaces space with `\s+` (flexible whitespace). Creates `RegExp` with optional `i` flag.
4. **Build regex for REGEXP**: Creates `RegExp` directly from pattern. On invalid regex, throws `RuntimeError("Can not compile regular expression: ...", 983)`.
5. **Search content**: Executes regex against `this.currentWindow.document.documentElement.innerHTML` (full page HTML source).
6. **Handle not found**: If no match, calls `this.retry()` which implements a polling/retry mechanism — waits up to `tagTimeout` seconds (default `timeout/10`) with 100ms intervals, retrying the search. If still not found after timeout and `!ERRORIGNORE` is not YES, throws `RuntimeError("Source does not match to ...", 926)`.
7. **Extract data**: If EXTRACT parameter is provided, replaces `$1`-`$99` (via `\$(\d{1,2})` regex) with corresponding captured groups from the match, then calls `this.addExtractData(extract)` to append to `extractData`.
8. **No extract case**: If no EXTRACT parameter is given, the search simply validates that the pattern exists on the page — no data is stored.

### `retry()` mechanism (MacroPlayer.js:127-142)

The old implementation uses a retry/polling loop for element waiting:
- Timeout defaults to `tagTimeout` (if set) or `timeout/10`
- Retries every 100ms for `timeout * 10` attempts
- Displays "Element waiting..." status
- If `!ERRORIGNORE=YES`, silently continues instead of throwing

## New Implementation

### Source Parser (extraction.ts:130-150)

```typescript
export function parseSearchSource(source: string): {
  type: SearchSourceType;
  pattern: string;
} | null {
  const colonIndex = source.indexOf(':');
  if (colonIndex === -1) return null;

  const type = source.substring(0, colonIndex).toUpperCase();
  const pattern = source.substring(colonIndex + 1);

  if (type === 'TXT' || type === 'TEXT') return { type: 'TXT', pattern };
  if (type === 'REGEXP' || type === 'REGEX') return { type: 'REGEXP', pattern };

  return null;
}
```

### TXT Pattern Conversion (extraction.ts:172-191)

```typescript
function escapeRegexPreserveWildcard(str: string): string {
  return str.replace(/[\^$.+?=!:|\\/()\[\]{}]/g, '\\$&');
}

export function txtPatternToRegex(pattern: string): string {
  let regexPattern = escapeRegexPreserveWildcard(pattern);
  regexPattern = regexPattern.replace(/\*/g, '(?:[\\r\\n]|.)*');
  regexPattern = regexPattern.replace(/ /g, '\\s+');
  return regexPattern;
}
```

### Text Search (extraction.ts:198-222)

```typescript
export function searchText(
  content: string,
  pattern: string,
  ignoreCase: boolean = false
): { found: boolean; match: string | null; index: number } {
  const flags = ignoreCase ? 'i' : '';
  const regexPattern = txtPatternToRegex(pattern);
  try {
    const regex = new RegExp(regexPattern, flags);
    const match = content.match(regex);
    if (match) {
      return { found: true, match: match[0], index: match.index ?? -1 };
    }
  } catch (e) { /* Invalid regex pattern */ }
  return { found: false, match: null, index: -1 };
}
```

### Regex Search (extraction.ts:227-265)

```typescript
export function searchRegexp(
  content: string,
  pattern: string,
  ignoreCase: boolean = false,
  extractPattern?: string
): { found: boolean; match: string | null; groups: string[]; index: number } {
  try {
    const flags = ignoreCase ? 'gi' : 'g';
    const regex = new RegExp(pattern, flags);
    const match = regex.exec(content);

    if (match) {
      let extractedValue = match[0];
      if (extractPattern && match.length > 1) {
        extractedValue = extractPattern.replace(/\$(\d+)/g, (_, n) => {
          const groupIndex = parseInt(n, 10);
          return groupIndex < match.length ? match[groupIndex] : '';
        });
      } else if (match.length > 1) {
        extractedValue = match[1];
      }
      return { found: true, match: extractedValue, groups: match.slice(1), index: match.index ?? -1 };
    }
    return { found: false, match: null, groups: [], index: -1 };
  } catch (e) {
    return { found: false, match: null, groups: [], index: -1 };
  }
}
```

### Command Handler (extraction.ts:330-439)

```typescript
export const searchHandler: CommandHandler = async (ctx): Promise<CommandResult> => {
  const sourceParam = ctx.getParam('SOURCE');
  if (!sourceParam) {
    return { success: false, errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
             errorMessage: 'SEARCH command requires SOURCE parameter' };
  }

  const parsed = parseSearchSource(ctx.expand(sourceParam));
  if (!parsed) {
    return { success: false, errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
             errorMessage: `Invalid SOURCE format: ${sourceParam}. Expected TXT:<pattern> or REGEXP:<pattern>` };
  }

  const extractPattern = ctx.getParam('EXTRACT');
  if (extractPattern && parsed.type !== 'REGEXP') {
    return { success: false, errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
             errorMessage: 'EXTRACT has sense only for REGEXP search' };
  }

  const ignoreCaseParam = ctx.getParam('IGNORE_CASE');
  const ignoreCase = ignoreCaseParam?.toUpperCase() === 'YES';

  // Try content script sender (browser context)
  try {
    const interactionModule = await import('./interaction');
    const sender = interactionModule.getContentScriptSender();
    const message = {
      id: `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'SEARCH_COMMAND' as const,
      timestamp: Date.now(),
      payload: { sourceType: parsed.type, pattern: parsed.pattern, ignoreCase,
                 extractPattern: extractPattern || undefined },
    };

    const response = await sender.sendMessage(message as any);
    if (response.success && response.extractedData !== undefined) {
      appendExtract(ctx, response.extractedData);
      return { success: true, errorCode: IMACROS_ERROR_CODES.OK, output: response.extractedData };
    }
    if (!response.success) {
      return { success: false, errorCode: IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND,
               errorMessage: response.error || `Pattern not found: ${parsed.pattern}` };
    }
  } catch (e) {
    // Content script sender not available, fall back to local search
  }

  // Fallback: search in !URLCURRENT
  const content = ctx.state.getVariable('!URLCURRENT')?.toString() || '';
  let result;
  if (parsed.type === 'TXT') {
    result = searchText(content, parsed.pattern, ignoreCase);
  } else {
    const regexResult = searchRegexp(content, parsed.pattern, ignoreCase, extractPattern || undefined);
    result = { found: regexResult.found, match: regexResult.match };
  }

  if (result.found && result.match !== null) {
    appendExtract(ctx, result.match);
    return { success: true, errorCode: IMACROS_ERROR_CODES.OK, output: result.match };
  }

  return { success: false, errorCode: IMACROS_ERROR_CODES.ELEMENT_NOT_FOUND,
           errorMessage: `Pattern not found: ${parsed.pattern}` };
};
```

### Step-by-step logic (new)

1. **Validate SOURCE**: Required parameter. Expanded via `ctx.expand()`. Parsed by `parseSearchSource()` which splits on first `:` and validates type prefix.
2. **Validate EXTRACT**: If EXTRACT is provided but SOURCE type is not `REGEXP`, returns `INVALID_PARAMETER` error with same message as old: `"EXTRACT has sense only for REGEXP search"`.
3. **Parse IGNORE_CASE**: Optional parameter, defaults to `false`. Checks if value equals `YES` (case-insensitive).
4. **Try content script**: In browser context, sends `SEARCH_COMMAND` message to content script with sourceType, pattern, ignoreCase, and extractPattern. Content script searches `document.documentElement.innerHTML` (same as old).
5. **Fallback to local search**: If no content script is available, searches `!URLCURRENT` variable value as content.
6. **TXT search**: Escapes regex special chars via `escapeRegexPreserveWildcard()` (escapes `^$.+?=!:|\\/()[]{}` — same character set as old `TagHandler.escapeChars()`). Replaces `*` with `(?:[\r\n]|.)*`. Replaces space with `\s+`. Creates regex with optional `i` flag.
7. **REGEXP search**: Creates regex directly from pattern. Always uses `g` flag (global). On invalid regex, catches error and returns `found: false` (no explicit error thrown).
8. **Store match**: If EXTRACT parameter is given, substitutes `$1`-`$N` with captured groups. If no EXTRACT but capture groups exist, uses first capture group. If no capture groups, uses full match. Calls `appendExtract()` to store in `!EXTRACT`.
9. **Handle not found**: Returns `ELEMENT_NOT_FOUND` error code with descriptive message.

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Search target** | Always `document.documentElement.innerHTML` via direct DOM access | Content script message for browser context; fallback to `!URLCURRENT` for non-browser contexts | **Structural**: Same target in browser; new adds non-browser fallback. |
| **Retry/polling** | `this.retry()` polls with 100ms intervals for up to `tagTimeout` seconds, retrying the search on the live DOM | No retry mechanism — single search attempt | **Behavioral difference**: Old retries until timeout if pattern not found (useful for dynamic pages). New fails immediately. |
| **Error on not found** | `RuntimeError("Source does not match to ...", 926)` (suppressed if `!ERRORIGNORE=YES`) | Returns `{success: false, errorCode: ELEMENT_NOT_FOUND}` | **Equivalent**: Both report pattern-not-found; `!ERRORIGNORE` handling done by executor in new. |
| **Invalid regex error** | `RuntimeError("Can not compile regular expression: ...", 983)` | Catches error silently, returns `ELEMENT_NOT_FOUND` (found: false) | **Minor difference**: Old throws specific error code 983 for bad regex. New treats it as pattern-not-found. |
| **Regex flags (REGEXP)** | No flags (or `"i"` for IGNORE_CASE) | Always `"g"` flag (or `"gi"` for IGNORE_CASE) | **Minor difference**: `g` flag doesn't affect `exec()` on first call, but may affect behavior if regex has state. |
| **EXTRACT group reference** | `\$(\d{1,2})` — matches `$1` through `$99` | `\$(\d+)` — matches `$1` through any number | **Enhancement**: New supports more than 99 capture groups (theoretical). |
| **No EXTRACT behavior** | Does not store anything in `extractData` — search is pure validation | Stores the match (first capture group or full match) in `!EXTRACT` via `appendExtract()` | **Behavioral difference**: Old only validates pattern existence. New always stores the match. |
| **TYPE aliases** | Only `txt` and `regexp` (case-insensitive) | Accepts `TXT`, `TEXT`, `REGEXP`, `REGEX` (case-insensitive) | **Enhancement**: New adds `TEXT` and `REGEX` as aliases. |
| **Parameter order** | Fixed: SOURCE, optional IGNORE_CASE, optional EXTRACT | Any order (key-value parser) | **Enhancement**: More flexible parsing. |
| **Escape character set** | `^$.+?=!:|\\/()[]{}` — character-by-character loop | `[\^$.+?=!:|\\/()\[\]{}]` — regex replacement | **Equivalent**: Same character set escaped. Both preserve `*` as wildcard. |
| **Error handling model** | Throws `BadParameter`, `RuntimeError` exceptions | Returns structured `CommandResult` with error codes | **Structural**: Non-throwing error handling in new. |
| **Content script communication** | Direct DOM access (`this.currentWindow.document`) | Message passing to content script via `sender.sendMessage()` | **Structural**: Chrome extensions require message passing. |
| **Variable expansion** | `imns.unwrap(this.expandVariables(cmd[N]))` | `ctx.expand(sourceParam)` on the full SOURCE value | **Equivalent**: Both expand variables in pattern and extract values. |
| **Logging** | None | Debug/warn logging for search attempts and failures | **Enhancement**: Observability. |
| **Command registration** | `ActionTable["search"]` (lowercase) | `registerHandler('SEARCH', searchHandler)` (uppercase) | Internal naming convention only. |

## Output / Side Effects

- **`!EXTRACT` modification**: Old only modifies `!EXTRACT` when EXTRACT parameter is provided. New always stores the match (full match or first capture group) in `!EXTRACT` via `appendExtract()`.
- **Accumulation**: Both use `[EXTRACT]` delimiter for multiple extractions. Old: `addExtractData()`. New: `appendExtract()` → `state.addExtract()`.
- **Return data**: New returns the matched/extracted value via `output` field; old returns nothing.

## Test Coverage

### Parser tests (`tests/unit/parser.test.ts`)
- Parses `SEARCH SOURCE=TXT:*search pattern*` (line 742)
- Parses `SEARCH SOURCE=REGEXP:(\d+) EXTRACT=$1` with REGEXP (line 747)
- Validates SEARCH requires SOURCE parameter (line 752)
- Included in supported commands list (line 880)

### Unit tests (`tests/unit/extraction-handlers.test.ts`)
- `parseSearchSource`: Parses TXT:, TEXT:, REGEXP:, REGEX: prefixes (lines 204-268)
- `searchText`: Finds text, case sensitivity, escapes regex chars, wildcards, space matching (lines 272-327)
- `searchRegexp`: Basic regex, capture groups, extractPattern, case-insensitive, invalid regex (lines 331-398)
- `appendExtract`: Stores in !EXTRACT, accumulates with delimiter, logging (lines 402-454)
- `searchHandler`: MISSING_PARAMETER, INVALID_PARAMETER, TXT/REGEXP search on !URLCURRENT, IGNORE_CASE, EXTRACT pattern, stores in !EXTRACT (lines 700-863)
- `createExtractionHandlers`: Returns EXTRACT and SEARCH handlers (lines 929-945)
- `registerExtractionHandlers`: Registers both handlers (lines 949-967)

### Integration tests (`tests/integration/commands/search.test.ts`)
- `SOURCE=TXT:hello` finds text in URL content and stores in !EXTRACT (line 94)
- `SOURCE=TXT:missing` returns ELEMENT_NOT_FOUND (line 108)
- `SOURCE=TXT:Hello IGNORE_CASE=YES` finds case-insensitively (line 121)
- `SOURCE=TXT:Hello` without IGNORE_CASE fails for case mismatch (line 137)
- `SOURCE=REGEXP:\d+` finds digits (line 158)
- `SOURCE=REGEXP:(\w+)\.(com)` extracts first capture group (line 173)
- `SOURCE=REGEXP:(\w+)@(\w+) EXTRACT=$1-at-$2` uses extract pattern (line 189)
- `SOURCE=REGEXP:\d{5,}` returns ELEMENT_NOT_FOUND for non-matching (line 204)
- Missing SOURCE returns MISSING_PARAMETER (line 223)
- `SOURCE=INVALID:pattern` returns INVALID_PARAMETER (line 236)
- `SOURCE=noprefix` returns INVALID_PARAMETER (line 249)
- Variable expansion in SOURCE pattern (line 268)
- Multiple SEARCH calls accumulate in extractData (line 290)
- Multiple extracts concatenated with [EXTRACT] delimiter (line 310)
- Empty !URLCURRENT returns ELEMENT_NOT_FOUND (line 337)
- Invalid regex pattern handled gracefully (line 346)
- EXTRACT with SOURCE=TXT returns INVALID_PARAMETER (line 673)
- EXTRACT with SOURCE=REGEXP works correctly (line 687)
