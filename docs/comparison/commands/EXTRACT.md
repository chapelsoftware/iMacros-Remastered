# EXTRACT Command Comparison

## Overview

EXTRACT is **not** a standalone command in iMacros 8.9.7 — it is a **parameter** on the TAG command (`TAG ... EXTRACT=<type>`) and the SEARCH command (`SEARCH ... EXTRACT=<pattern>`). The standalone `EXTRACT` command throws `UnsupportedCommand` in the original. In iMacros Remastered, a standalone EXTRACT handler exists for direct data extraction, while the TAG/SEARCH extraction behavior is preserved.

This document covers:
1. **TAG EXTRACT parameter** — extracting data from DOM elements
2. **SEARCH EXTRACT parameter** — extracting regex capture groups
3. **SAVEAS TYPE=EXTRACT** — saving extracted data to CSV
4. **Standalone EXTRACT command** — new in Remastered
5. **Extract data accumulation** — `addExtractData` / `[EXTRACT]` delimiter

---

## Syntax

### TAG with EXTRACT
```
TAG POS=<n> TYPE=<tag> ATTR=<attrs> EXTRACT=<type>
TAG XPATH=<xpath> EXTRACT=<type>
```

### SEARCH with EXTRACT
```
SEARCH SOURCE=REGEXP:<pattern> EXTRACT=<extractPattern>
```

### SAVEAS TYPE=EXTRACT
```
SAVEAS TYPE=EXTRACT FOLDER=<path> FILE=<filename>
```

### Standalone EXTRACT (new only)
```
EXTRACT <data>
```

---

## Parameters

### TAG EXTRACT types

| Type | Description | Old | New |
|------|-------------|-----|-----|
| TXT | Plain text content (input/textarea: `.value`; select: selected option `.text`; table: CSV; default: `.textContent`) | Yes | Yes |
| TXTALL | All option texts joined with `[OPTION]` (select only; others same as TXT) | Yes | Yes |
| HTM | Outer HTML with tabs/newlines replaced by spaces | Yes | Yes |
| HREF | `href` property/attribute; falls back to `src`; returns `#EANF#` if missing | Yes | Yes |
| ALT | `alt` property/attribute; returns `#EANF#` if missing | Yes | Yes |
| TITLE | `title` property/attribute; returns `#EANF#` if missing | Yes | Yes |
| CHECKED | `YES`/`NO` for checkbox/radio; throws error on other input types | Yes | Yes |
| SRC | `src` property/attribute; returns `#EANF#` if missing | No | Yes |
| VALUE | `.value` for form elements; `value` attribute for others; `#EANF#` if missing | No | Yes |
| ID | Element `.id` | No | Yes |
| CLASS | Element `.className` | No | Yes |
| NAME | `name` attribute; `#EANF#` if missing | No | Yes |
| ATTR:\<name\> | Custom attribute by name | No | Yes |

### SEARCH EXTRACT parameter

| Parameter | Required | Values | Description |
|-----------|----------|--------|-------------|
| EXTRACT | No | Pattern with `$1`, `$2`, etc. placeholders | Regex capture group substitution pattern; only valid with `SOURCE=REGEXP:` |

---

## Old Implementation

### TAG EXTRACT (MacroPlayer.js:2746-2815 via TagHandler.onExtractParam)

**Regex** (part of TAG regex, MacroPlayer.js:3087-3096):
```javascript
"(?:\\s+(content|extract)\\s*=\\s*" +
"(\\d+(?::\\d+)*|" +                         // numeric content
"[%$]"+im_strre+"(?::[%$]"+im_strre+")*|"   // variable content
+im_strre+"))?"                               // string content
```

The TAG regex has capture group for `(content|extract)` at position 6 and the value at position 7. When group 6 is `"extract"`, the element is processed via `TagHandler.onExtractParam()`.

#### Step-by-step logic (TagHandler.onExtractParam)

1. **TXT / TXTALL** (`/^(txt|txtall)$/i`):
   - `input` / `textarea`: Extracts `element.value`
   - `select` with `TXTALL`: Iterates all `element.options`, joins text with `[OPTION]` delimiter
   - `select` with `TXT`: Extracts `element.options[element.selectedIndex].text`
   - `table`: Iterates `element.rows[i].cells[j]`, escapes quotes by doubling, joins cells with `","` and rows with `\n`. Format: `"cell1","cell2"\n"cell3","cell4"\n`
   - Default: Extracts `element.textContent`

2. **HTM** (`/^htm$/i`):
   - Uses `TagHandler.getOuterHTML(element)` which clones the element into a temp div and reads `div.innerHTML`
   - Replaces `[\t\n\r]` with spaces

3. **HREF** (`/^href$/i`):
   - Checks `"href" in element` → `element["href"]` (gets absolute URL via property)
   - Falls back to `element.hasAttribute("href")` → `elem.getAttribute("href")`
   - Falls back to `"src" in element` → `element["src"]`
   - Falls back to `element.hasAttribute("src")` → `elem.getAttribute("src")`
   - If all fail: returns `#EANF#`

4. **TITLE / ALT** (`/^(title|alt)$/i`):
   - Checks `tmp in element` → `element[tmp]` (property access)
   - Falls back to `element.hasAttribute(tmp)` → `elem.getAttribute(tmp)`
   - If missing: returns `#EANF#`

5. **CHECKED** (`/^checked$/i`):
   - Validates element is checkbox or radio (`/^(?:checkbox|radio)$/i.test(element.type)`)
   - Throws `BadParameter` if not checkbox/radio
   - Returns `"YES"` if `element.checked`, else `"NO"`

6. **Other**: Throws `BadParameter("EXTRACT=TXT|TXTALL|HTM|TITLE|ALT|HREF|CHECKED", 5)`

All extracted values are stored via `mplayer.showAndAddExtractData(str)`.

#### Element not found with EXTRACT

When the TAG target element is not found and the type is `"extract"`, the retry callback stores `#EANF#` via `showAndAddExtractData("#EANF#")` and returns success instead of throwing an error (MacroPlayer.js:3147-3149).

### SEARCH EXTRACT (MacroPlayer.js:1973-2029)

**Regex**:
```javascript
"^source\\s*=\\s*(txt|regexp):(" + im_strre + ")" +
"(?:\\s+ignore_case\\s*=\\s*(yes|no))?" +
"(?:\\s+extract\\s*=\\s*(" + im_strre + "))?\\s*$"
```

Capture groups: `[1]=source_type`, `[2]=pattern`, `[3]=ignore_case`, `[4]=extract`

#### Step-by-step logic

1. Unwraps and expands variables in query and extract pattern
2. Validates: If `extract` is provided but source type is not `"regexp"`, throws `BadParameter("EXTRACT has sense only for REGEXP search")`
3. Compiles regex from query (for TXT: escapes special chars, converts `*` to wildcard, spaces to `\s+`)
4. Searches `root.innerHTML` (document root) with compiled regex
5. If not found: calls `this.retry()` which may throw `RuntimeError` code 926 (or silently return if `ignoreErrors`)
6. If found and `extract` is provided: replaces `$1`-`$99` in extract pattern with captured groups via `found[x]`, stores result via `this.addExtractData(extract)`

### Extract Data Accumulation (MacroPlayer.js:4856-4885)

```javascript
MacroPlayer.prototype.addExtractData = function(str) {
    if (this.extractData.length) {
        this.extractData += "[EXTRACT]" + str;
    } else {
        this.extractData = str;
    }
};
```

- `extractData` is a string, not an array
- Multiple extractions are concatenated with `[EXTRACT]` delimiter
- `showAndAddExtractData()` calls `addExtractData()` then shows popup dialog (unless in iimPlay, client mode, or cycled replay)

### SAVEAS TYPE=EXTRACT (MacroPlayer.js:1795-1810)

When `SAVEAS TYPE=EXTRACT`:
1. Filename: `*` → `"extract.csv"`, `+suffix` → `"extractsuffix.csv"`
2. Gets `this.getExtractData()` (the accumulated string)
3. Clears extract data via `this.clearExtractData()`
4. Escapes quotes: `data.replace(/"/g, '""')`
5. Converts `[EXTRACT]` delimiters to CSV format: `'"' + data.replace(/\[EXTRACT\]/g, '","') + '"'`
6. Appends line to CSV file: `data + "\r\n"`

### Standalone EXTRACT command (MacroPlayer.js:773-777)

```javascript
MacroPlayer.prototype.RegExpTable["extract"] = ".*";
MacroPlayer.prototype.ActionTable["extract"] = function (cmd) {
    throw new UnsupportedCommand("EXTRACT");
};
```

The standalone `EXTRACT` command is explicitly unsupported — it throws `UnsupportedCommand`.

---

## New Implementation

### TAG EXTRACT (interaction.ts:319-342, 459-484, 585-637)

The TAG handler builds a `TagAction` object from parameters:

```typescript
const extract = ctx.getParam('EXTRACT');
if (extract) {
    action.extract = parseExtractParam(ctx.expand(extract));
}
```

#### parseExtractParam (interaction.ts:327-342)

Validates against `VALID_EXTRACT_TYPES`:
```typescript
const VALID_EXTRACT_TYPES = [
    'TXT', 'HTM', 'HREF', 'TITLE', 'ALT', 'VALUE', 'SRC',
    'ID', 'CLASS', 'NAME', 'TXTALL', 'CHECKED',
];
```

Also accepts `ATTR:<name>` prefix for custom attributes. Throws `BadParameter` for unrecognized types.

#### Content script extraction (dom-executor.ts:411-557)

The `extractFromElement()` function in the content script performs the actual DOM extraction:

1. **TXT/TEXT**: `input`/`textarea` → `.value`; `select` → selected option `.text`; `table` → CSV format (same as old); default → `.textContent.trim()`
2. **TXTALL**: `select` → all options joined with `[OPTION]`; others same as TXT
3. **HTM/HTML**: `element.outerHTML` with `[\t\n\r]` → space normalization
4. **HREF**: Property check → attribute check → `src` fallback → `#EANF#`
5. **ALT**: Property check → attribute check → `#EANF#`
6. **TITLE**: Property check → attribute check → `#EANF#`
7. **SRC**: Property check → attribute check → `#EANF#`
8. **VALUE**: Form elements → `.value`; others → `value` attribute → `#EANF#`
9. **CHECKED**: Checkbox/radio → `YES`/`NO`; throws error for other types
10. **ID**: `element.id`
11. **CLASS**: `element.className`
12. **NAME**: `name` attribute → `#EANF#`
13. **Default**: Tries as generic attribute, then as property on element, then `#EANF#`

#### Element not found with EXTRACT (interaction.ts:596-610)

When the content script returns element-not-found (`errorCode === -920`) and `action.extract` is set, stores `#EANF#` and returns success — matching old behavior exactly.

### SEARCH EXTRACT (extraction.ts:330-439)

The `searchHandler` validates that EXTRACT parameter is only used with REGEXP source:

```typescript
if (extractPattern && parsed.type !== 'REGEXP') {
    return { success: false, errorCode: INVALID_PARAMETER,
             errorMessage: 'EXTRACT has sense only for REGEXP search' };
}
```

For REGEXP with EXTRACT pattern, `searchRegexp()` replaces `$1`-`$n` in the extract pattern with captured groups (extraction.ts:244-247), matching old behavior.

### Extract Data Accumulation (state-manager)

The new implementation uses `state.addExtract(value)` which maintains an array of extracted values and updates `!EXTRACT` variable. `getExtractString()` joins the array with `[EXTRACT]` delimiter.

### Standalone EXTRACT handler (extraction.ts:280-314)

Unlike the old implementation which throws `UnsupportedCommand`, the new code provides a working standalone EXTRACT handler:

```typescript
export const extractHandler: CommandHandler = async (ctx) => {
    // Direct EXTRACT with literal data
    const firstParam = params[0];
    let extractValue: string;
    if (firstParam.key && !firstParam.key.includes('=')) {
        extractValue = ctx.expand(firstParam.rawValue || firstParam.key);
    } else {
        extractValue = ctx.expand(firstParam.value);
    }
    appendExtract(ctx, extractValue);
    return { success: true, errorCode: OK, output: extractValue };
};
```

This enables `EXTRACT "literal data"` and `EXTRACT {{!VAR1}}` syntax.

---

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Standalone EXTRACT** | Throws `UnsupportedCommand` | Working handler: stores literal/variable data in `!EXTRACT` | **Enhancement**: Enables `EXTRACT "data"` syntax |
| **Supported extract types** | TXT, TXTALL, HTM, HREF, TITLE, ALT, CHECKED only | TXT, TXTALL, HTM, HREF, TITLE, ALT, CHECKED, SRC, VALUE, ID, CLASS, NAME, ATTR:\<name\>, generic attributes | **Enhancement**: More extract types; old types fully compatible |
| **Invalid extract type** | Throws `BadParameter("EXTRACT=TXT\|TXTALL\|HTM\|TITLE\|ALT\|HREF\|CHECKED", 5)` | Throws `BadParameter` listing all valid types + ATTR:\<name\> | **Compatible**: Both throw; message differs |
| **HTM extraction method** | `getOuterHTML()` via temp div clone + `div.innerHTML` | Direct `element.outerHTML` | **Compatible**: Same result; different technique |
| **TXT default handling** | `element.textContent` (no trim) | `(element.textContent \|\| '').trim()` | **Minor**: New trims whitespace; old does not |
| **#EANF# on not found** | `showAndAddExtractData("#EANF#")` in retry callback | `state.addExtract('#EANF#')` when `errorCode === -920` | **Compatible**: Same behavior |
| **Extract data storage** | String concatenation: `extractData += "[EXTRACT]" + str` | Array-based: `extractData.push(value)`, joined on read | **Structural**: Same external behavior; cleaner internals |
| **Extract popup dialog** | `showAndAddExtractData` shows XUL dialog for manual replay | No popup — data stored silently | **Intentional**: Chrome extensions cannot show XUL dialogs |
| **SEARCH EXTRACT validation** | Throws `BadParameter` for EXTRACT with non-REGEXP source | Returns error result with same message | **Compatible**: Same validation; different error mechanism |
| **SEARCH retry on not found** | `this.retry()` with timer-based retry loop; RuntimeError 926 | Returns `ELEMENT_NOT_FOUND` immediately (content script may retry) | **Potential gap**: No automatic retry in handler |
| **SEARCH regex compilation error** | Throws `RuntimeError("Can not compile regular expression", 983)` | `searchRegexp` catches error, returns `found: false` | **Minor**: Different error propagation |
| **SAVEAS TYPE=EXTRACT** | Reads `extractData` string, replaces `[EXTRACT]` with `","` for CSV | Uses `getExtractString()` which joins array with `[EXTRACT]`; same CSV conversion logic | **Compatible**: Same CSV output format |
| **CHECKED on non-checkbox** | Throws `BadParameter` | Throws `Error` with descriptive message | **Compatible**: Both throw; message wording differs |
| **HREF src fallback** | Checks `"src" in element` then `element.hasAttribute("src")` | Checks `typeof src === 'string'` then `element.hasAttribute('src')` | **Compatible**: Both fall back to src; type check differs |

---

## Output / Side Effects

- **Variables modified**: `!EXTRACT` — set to the last extracted value; full extraction string available via `getExtractString()` as `value1[EXTRACT]value2[EXTRACT]...`
- **#EANF#**: "Element Attribute Not Found" — stored when TAG element is not found or when HREF/ALT/TITLE attributes are missing
- **SAVEAS TYPE=EXTRACT**: Clears `extractData` after writing to CSV file
- **Error codes**:
  - `-920` (ELEMENT_NOT_FOUND): TAG target element not found (converts to `#EANF#` when EXTRACT is specified)
  - `-921` (ELEMENT_NOT_VISIBLE): Element found but not visible
  - `-926` (old) / `ELEMENT_NOT_FOUND` (new): SEARCH pattern not found
  - `-983` (old only): Invalid regex in SEARCH SOURCE=REGEXP

---

## Test Coverage

### Unit tests — extraction-handlers (tests/unit/extraction-handlers.test.ts)

- `parseExtractionType`: All types (TXT, TEXT, HTM, HTML, HREF, ALT, TITLE, SRC, VALUE, NAME, ID, CLASS), ATTR= prefix, EXTRACT alias, case insensitivity, custom attributes (lines 106-199)
- `parseSearchSource`: TXT/TEXT/REGEXP/REGEX prefixes, missing colon, unknown type, colons in pattern, empty pattern, case insensitivity (lines 203-268)
- `searchText`: Simple match, not found, case sensitivity, regex escaping, empty pattern/content (lines 272-327)
- `searchRegexp`: Match with index, no match, capture groups, extractPattern with `$1/$2`, non-existent groups, invalid regex, case insensitive, no capture groups (lines 331-398)
- `appendExtract`: First extraction, accumulation with `[EXTRACT]` delimiter, chaining, state.addExtract, log truncation (lines 402-454)
- `extractFromElement`: TXT, TEXT, HTM, HTML, HREF, ALT, TITLE, SRC, VALUE, NAME, ID, CLASS, unknown attributes, missing attributes, null textContent, case insensitivity (lines 458-599)
- `extractHandler`: Literal data, MISSING_PARAMETER, variable expansion, key=value format, empty key, accumulation (lines 603-696)
- `searchHandler`: Missing SOURCE, bad format, unknown prefix, TXT search, REGEXP search, not found, IGNORE_CASE, EXTRACT with REGEXP, stores in !EXTRACT, empty content (lines 700-863)
- `createExtractionHandlers` / `registerExtractionHandlers`: Factory and registration (lines 929-968)
- `EXTRACT_DELIMITER` constant (lines 972-976)

### Integration tests — extraction (tests/integration/commands/extraction.test.ts)

- DOM-based extraction with JSDOM: TXT, HTM, attributes (HREF, TITLE, SRC, ALT), table CSV, value extraction from input/textarea/select, page title/URL, link/image collection, data accumulation, clear (lines 298-860)

### Integration tests — search (tests/integration/commands/search.test.ts)

- SEARCH command with TXT and REGEXP sources, EXTRACT parameter with capture groups, IGNORE_CASE parameter
