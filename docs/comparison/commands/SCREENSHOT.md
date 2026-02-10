# SCREENSHOT Command Comparison

## Syntax

```
SCREENSHOT TYPE=<BROWSER|PAGE> [FOLDER=<path>] FILE=<filename>
```

**Old regex**: `^type\s*=\s*(browser|page)\s+(?:folder\s*=\s*(<im_strre>)\s+)?file\s*=\s*(<im_strre>)\s*$`
- Three capture groups: TYPE (group 1), FOLDER (group 2, optional), FILE (group 3)
- Fixed order: TYPE, optional FOLDER, FILE

**New parser**: Key-value parameter command — `parser.ts:847-859` validates that TYPE and FILE parameters are present. FOLDER is parsed as optional key-value pair in any order.

## Parameters

| Parameter | Required | Values | Description |
|-----------|----------|--------|-------------|
| TYPE | Yes | BROWSER, PAGE | Capture type: visible viewport or full page |
| FOLDER | No | Path or `*` (default folder) | Destination folder |
| FILE | Yes | Filename, `*` (auto-derive), or `+suffix` | Destination filename |
| QUALITY | No (old N/A) / Optional (new) | 0-100 | JPEG quality (new only) |
| SELECTOR | No (old N/A) / Optional (new) | CSS selector | Element to capture (new only) |

## Old Implementation (MacroPlayer.js:1908-1969)

```javascript
MacroPlayer.prototype.RegExpTable["screenshot"] =
    "^type\\s*=\\s*(browser|page)\\s+"+
    "(?:folder\\s*=\\s*("+im_strre+")\\s+)?"+
    "file\\s*=\\s*("+im_strre+")\\s*$";

MacroPlayer.prototype.ActionTable["screenshot"] = function (cmd) {
    var type = cmd[1].toLowerCase();
    var folder = cmd[2] ?
        imns.unwrap(this.expandVariables(cmd[2])) : null;

    try {
        var f = !folder || folder == "*" ?
            imns.Pref.getFilePref("defdownpath") :
            imns.FIO.openNode(folder);
    } catch (e) {
        throw new RuntimeError("Wrong path "+folder, 932);
    }

    if (!f.exists()) {
        throw new RuntimeError("Path "+folder+" does not exists", 932);
    }

    var file = imns.unwrap(this.expandVariables(cmd[3]));

    var __doc_name = function(win) {
        var name = win.location.pathname;
        if (/\/([^\/]*)$/.test(name))
            name = RegExp.$1;
        if (!name.length) {
            if (/^(?:www\.)(\S+)/.test(win.location.hostname))
                name = RegExp.$1;
        }
        if (!name.length)
            name = win.document.title;
        if (!name.length)
            return "unknown";
        if (/^(.*)\.(?:\w+)$/.test(name))
            return RegExp.$1;
        return name;
    };

    if (file == "*") {
        file = __doc_name(type == "browser"? window : window.content);
    }

    var re = new RegExp('\\s*[:*?|<>\\"/]+\\s*', "g");
    file = file.replace(re, "_");

    this.savePageAsImage(
        (type == "browser" ? window : window.content), file, f, "png"
    );
};
```

### `savePageAsImage()` (MacroPlayer.js:1855-1904)

```javascript
MacroPlayer.prototype.savePageAsImage = function(win, filename, folder, type, callback) {
    var canvasW = win.innerWidth + win.scrollMaxX;
    var canvasH = win.innerHeight + win.scrollMaxY;
    if (canvasW > 10000) canvasW = 10000;
    if (canvasH > 10000) canvasH = 10000;
    var canvas = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
    canvas.style.width = canvasW+"px";
    canvas.style.height = canvasH+"px";
    canvas.width = canvasW;
    canvas.height = canvasH;
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.save();
    ctx.drawWindow(win, 0, 0, canvasW, canvasH, "rgb(0,0,0)");
    ctx.restore();
    // Determines content type and appends proper file extension
    // JPEG: quality=100, appends .jpg if no .jpeg/.jpg extension
    // PNG: appends .png if no .png extension
    // Saves via Firefox Downloads.fetch() API
};
```

### `saveAsScreenshot()` — element screenshot (MacroPlayer.js:1431-1504)

This separate method handles element-level screenshots triggered via `EVENT:SAVE_ELEMENT_SCREENSHOT`:

```javascript
MacroPlayer.prototype.saveAsScreenshot = function(element) {
    this.clearDownloadDlgFlags();
    var file = this.handleOnDownloadFile(element.src, this.downloadFolder,
        this.downloadFilename);
    var folder = file.parent;
    var filename = file.leafName;
    // Determines content type from extension (.jpg/.jpeg → JPEG, .png → PNG, else PNG)
    // Gets element bounding rect with scroll offsets
    // Creates canvas sized to element.offsetWidth × element.offsetHeight
    // Uses ctx.drawWindow() to capture element region
    // Saves via Firefox Downloads.fetch() API
};
```

### Step-by-step logic (old)

1. **Parse parameters**: Regex captures TYPE (group 1, `browser` or `page`), optional FOLDER (group 2), FILE (group 3). Variable expansion applied to FOLDER and FILE.
2. **Resolve folder**: If FOLDER is omitted or `*`, resolves to default download path via `imns.Pref.getFilePref("defdownpath")`. Otherwise opens via `imns.FIO.openNode()`.
3. **Validate folder**: If `openNode()` throws, raises `RuntimeError("Wrong path ...", 932)`. If folder doesn't exist, raises same error code 932.
4. **Resolve FILE wildcard**: If `FILE=*`, derives filename from window via `__doc_name()` — for `TYPE=BROWSER` uses `window` (chrome window), for `TYPE=PAGE` uses `window.content` (page content window).
5. **`__doc_name()` logic**: Extracts last URL path segment → falls back to hostname minus `www.` → falls back to `document.title` → falls back to `"unknown"`. Strips file extension if present.
6. **Sanitize filename**: Replaces sequences of `[:*?|<>"/]` and surrounding whitespace with `_`.
7. **Capture**: Always calls `savePageAsImage()` with format `"png"` (hardcoded). For `TYPE=BROWSER`, captures the chrome `window`; for `TYPE=PAGE`, captures `window.content`.
8. **`savePageAsImage()` details**: Creates canvas sized to `innerWidth + scrollMaxX` × `innerHeight + scrollMaxY` (capped at 10000×10000px). Renders via `ctx.drawWindow()`. Converts to data URL. Saves via Firefox `Downloads.fetch()`. Auto-appends `.png` extension if missing.
9. **No `+suffix` support**: Unlike SAVEAS, the SCREENSHOT command does NOT handle the `FILE=+suffix` pattern — only `FILE=*` is handled.

### `__doc_name()` helper (inline)

Derives a document name from a window object:
1. Extracts last path segment from `window.location.pathname`
2. Falls back to hostname minus `www.` prefix
3. Falls back to `document.title`
4. Falls back to `"unknown"`
5. Strips file extension if present

## New Implementation

### Command Handler (browser.ts:844-966)

```typescript
export const screenshotHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const typeParam = ctx.getParam('TYPE');
  const folderParam = ctx.getParam('FOLDER');
  const fileParam = ctx.getParam('FILE');
  const qualityParam = ctx.getParam('QUALITY');
  const selectorParam = ctx.getParam('SELECTOR');

  // TYPE is required
  if (!typeParam) {
    return { success: false, errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
             errorMessage: 'SCREENSHOT requires TYPE parameter (BROWSER or PAGE)' };
  }

  const captureType = typeParam.toUpperCase() as ScreenshotType;

  // Validate capture type
  if (captureType !== 'BROWSER' && captureType !== 'PAGE') {
    return { success: false, errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
             errorMessage: `Invalid TYPE: ${typeParam}. Valid types are: BROWSER, PAGE` };
  }

  // FILE is required
  if (!fileParam) {
    return { success: false, errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
             errorMessage: 'SCREENSHOT requires FILE parameter' };
  }

  // Expand variables
  const folder = folderParam ? ctx.expand(folderParam) : undefined;
  let file = ctx.expand(fileParam);
  const selector = selectorParam ? ctx.expand(selectorParam) : undefined;

  // Resolve FOLDER=* (use browser default download path)
  const resolvedFolder = folder === '*' ? undefined : folder;

  // Validate folder path
  if (folder && folder !== '*') {
    if (folder.includes('\0')) {
      return { success: false, errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
               errorMessage: 'Folder path contains null byte' };
    }
  }

  // Resolve FILE wildcards
  const currentUrl = ctx.state.getVariable('!URLCURRENT')?.toString() || '';
  if (file === '*') {
    file = deriveDocumentName(currentUrl) + '.png';
  } else {
    const suffixMatch = file.match(/^\+(.+)$/);
    if (suffixMatch) {
      file = deriveDocumentName(currentUrl) + suffixMatch[1];
    }
  }

  // Sanitize filename
  file = sanitizeFilename(file);

  // Determine format from filename
  const format = getScreenshotFormat(file);

  // Parse quality for JPEG
  let quality: number | undefined;
  if (format === 'jpeg') {
    if (qualityParam) {
      quality = parseInt(ctx.expand(qualityParam), 10);
      if (isNaN(quality) || quality < 0 || quality > 100) {
        return { success: false, errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
                 errorMessage: `Invalid QUALITY value: ${qualityParam}. Must be 0-100` };
      }
    } else {
      quality = 92; // Default JPEG quality
    }
  }

  ctx.log('info', `Taking ${captureType.toLowerCase()} screenshot: ${resolvedFolder ? resolvedFolder + '/' : ''}${file}`);

  const response = await sendBrowserCommandMessage(
    { type: 'screenshot', captureType, format, quality, folder: resolvedFolder, file, selector },
    ctx
  );

  if (!response.success) {
    return { success: false, errorCode: IMACROS_ERROR_CODES.FILE_WRITE_ERROR,
             errorMessage: response.error || `Failed to capture ${captureType.toLowerCase()} screenshot` };
  }

  const savedPath = response.data?.screenshotPath || file;
  ctx.log('info', `Screenshot saved: ${savedPath}`);

  return { success: true, errorCode: IMACROS_ERROR_CODES.OK, output: savedPath };
};
```

### Helper: `getScreenshotFormat()` (browser.ts:824-830)

```typescript
function getScreenshotFormat(filename: string): ScreenshotFormat {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'jpg' || ext === 'jpeg') {
    return 'jpeg';
  }
  return 'png';
}
```

Determines output format from file extension. Defaults to PNG.

### Helper: `deriveDocumentName()` (from downloads.ts)

Shared with SAVEAS command. Derives a document name from URL:
1. Extracts last URL path segment
2. Falls back to hostname minus `www.` prefix
3. Falls back to `"unknown"` (does **not** use `document.title`)
4. Strips file extension if present

### Helper: `sanitizeFilename()` (from downloads.ts)

Shared with SAVEAS command. Same regex as old: replaces `[:*?|<>"/]` and surrounding whitespace with `_`.

### Message Types (browser.ts:163-177)

```typescript
export interface ScreenshotMessage extends BrowserCommandMessage {
  type: 'screenshot';
  captureType: ScreenshotType;
  format: ScreenshotFormat;
  quality?: number;
  folder?: string;
  file: string;
  selector?: string;
}
```

### Step-by-step logic (new)

1. **Validate TYPE**: Required parameter. Converted to uppercase. Must be `BROWSER` or `PAGE`.
2. **Validate FILE**: Required parameter.
3. **Expand variables**: FOLDER, FILE, SELECTOR, QUALITY all support variable expansion.
4. **Resolve FOLDER**: `FOLDER=*` resolves to `undefined` (browser default). Null byte validation applied.
5. **Resolve FILE wildcards**: `FILE=*` derives name from `!URLCURRENT` URL via `deriveDocumentName()` + `.png` extension. `FILE=+suffix` derives name + suffix.
6. **Sanitize filename**: Same regex as old.
7. **Determine format**: From file extension — `.jpg`/`.jpeg` → JPEG, everything else → PNG.
8. **Parse QUALITY**: Optional, validates 0-100 range. Only for JPEG format. Default JPEG quality is 92.
9. **Send message**: Sends `screenshot` message via `sendBrowserCommandMessage()` with captureType, format, quality, folder, file, and optional selector.
10. **Handle response**: Returns saved path from response or falls back to filename.

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Output format** | Always PNG (hardcoded `"png"`) | PNG or JPEG (determined from file extension) | **Enhancement**: New supports JPEG screenshots via file extension. |
| **QUALITY parameter** | Not supported | Optional QUALITY=0-100 for JPEG; default 92 | **Enhancement**: Configurable JPEG quality. |
| **SELECTOR parameter** | Not supported (element screenshots only via `EVENT:SAVE_ELEMENT_SCREENSHOT`) | Optional SELECTOR parameter for element capture | **Enhancement**: Direct element capture without EVENT command. |
| **FILE=+suffix** | Not supported — only `FILE=*` handled | Supported — derives name and appends suffix | **Enhancement**: New adds suffix wildcard support matching SAVEAS behavior. |
| **FILE=* extension** | Derived name passed to `savePageAsImage()` which appends `.png` | Derived name gets `.png` appended inline at handler level | **Equivalent**: Both result in `.png` extension for wildcard filenames. |
| **Document name fallback** | Uses `document.title` as third fallback | Falls back directly to `"unknown"` (no title check) | **Minor difference**: If URL path and hostname are empty, old uses page title before "unknown". |
| **TYPE=BROWSER window** | Captures chrome `window` (includes browser UI) | Captures visible tab via `chrome.tabs.captureVisibleTab()` (content only) | **Platform difference**: Old captures browser chrome; new captures page content viewport only. |
| **TYPE=PAGE capture** | Captures `window.content` with `innerWidth + scrollMaxX` × `innerHeight + scrollMaxY` (capped at 10000×10000px) | Delegated to extension (scrolling capture or similar) | **Platform difference**: Different full-page capture mechanisms. Canvas size cap may not apply in new. |
| **Canvas size limit** | Capped at 10000×10000 pixels | No explicit cap (depends on browser extension implementation) | **Potential difference**: Very large pages may behave differently. |
| **Parameter order** | Fixed: TYPE, optional FOLDER, FILE | Any order (key-value parser) | **Enhancement**: More flexible parsing. |
| **File I/O** | Direct filesystem via `imns.FIO` and Firefox `Downloads.fetch()` | Message passing to browser extension | **Structural**: Chrome extensions use `chrome.downloads` API. |
| **Folder resolution** | Omitted FOLDER uses `defdownpath`; `*` also uses `defdownpath` | Omitted FOLDER → `undefined` (browser default); `*` → `undefined` | **Equivalent**: Both resolve to default download path. |
| **Folder validation** | Opens folder node, checks `exists()`, throws error 932 | Validates for null bytes only; actual path validation by extension | **Structural**: Deferred validation in new. |
| **Error handling** | Throws `RuntimeError` (code 932) | Returns structured `CommandResult` with `MISSING_PARAMETER`, `INVALID_PARAMETER`, `FILE_WRITE_ERROR` error codes | **Improvement**: More granular, non-throwing error handling. |
| **Async model** | `savePageAsImage` uses `Downloads.fetch().then()` (Promise-based) | Fully async with `await` | **Structural**: Consistent async/await pattern. |
| **Element screenshots** | Separate `saveAsScreenshot()` method triggered via `EVENT:SAVE_ELEMENT_SCREENSHOT` | Unified via SELECTOR parameter on SCREENSHOT command | **Enhancement**: Consolidated element capture into main command. |
| **Logging** | None | Logs "Taking screenshot: ..." and "Screenshot saved: ..." at info level | **Improvement**: Observability. |
| **Return value** | No return (void) | Returns saved file path via `output` field | **Enhancement**: Caller can access the saved path. |
| **Command registration** | `ActionTable["screenshot"]` (lowercase) | `browserCommandHandlers.SCREENSHOT` (uppercase) | Internal naming convention only. |

## Output / Side Effects

- **File creation**: Saves page or element screenshot to the specified file
- **No variables modified**: Neither implementation modifies macro variables (unlike SAVEAS which clears `!EXTRACT`)
- **Return data**: New returns the saved file path via `output` field; old returns nothing

## Test Coverage

### Parser tests (`tests/unit/parser.test.ts`)
- Parses `SCREENSHOT TYPE=PAGE FOLDER=* FILE=screenshot.png` (line 696)
- Validates SCREENSHOT requires TYPE and FILE parameters (parser.ts:851-854)
- Included in supported commands list (line 886)

### Integration tests (`tests/integration/commands/screenshot.test.ts`)
- `SCREENSHOT TYPE=BROWSER FILE=screen.png` sends captureType=BROWSER, format=png, no quality (line 56)
- `SCREENSHOT TYPE=PAGE FILE=full.png` sends captureType=PAGE, format=png (line 73)
- `SCREENSHOT TYPE=BROWSER FILE=photo.jpg` sends format=jpeg, quality=92 default (line 90)
- `SCREENSHOT TYPE=BROWSER FILE=photo.jpeg` sends format=jpeg (line 107)
- `SCREENSHOT TYPE=BROWSER FILE=photo.jpg QUALITY=80` sends quality=80 (line 127)
- `SCREENSHOT TYPE=BROWSER FOLDER=/screenshots FILE=screen.png` sends folder (line 145)
- `SCREENSHOT TYPE=BROWSER FILE=screen.png SELECTOR=.main` sends selector (line 161)
- Missing TYPE returns MISSING_PARAMETER error (line 179)
- Invalid TYPE returns INVALID_PARAMETER error (line 189)
- Missing FILE returns MISSING_PARAMETER error (line 199)
- QUALITY=200 returns INVALID_PARAMETER error (line 209)
- QUALITY=abc returns INVALID_PARAMETER error (line 219)
- Bridge failure returns FILE_WRITE_ERROR (line 238)
- Bridge success returns OK (line 251)
- Bridge with screenshotPath in response returns it as output (line 263)
- Variable expansion in FILE parameter (line 298)
- FILE=* derives name from URL with .png extension (line 320)
- FILE=* with path segment in URL extracts filename (line 333)
- FILE=* with no URL falls back to "unknown.png" (line 344)
- FILE=+suffix appends suffix to derived name (line 355)
- FILE=* strips www. prefix from hostname (line 368)
- Filename sanitization replaces illegal characters (line 383)
- FILE=* with no URL path uses hostname (line 394)
- FOLDER=* is treated as browser default (undefined) (line 410)
- FOLDER with explicit path is passed through (line 420)
- FOLDER with null byte returns INVALID_PARAMETER error (line 433)
- Captures with default settings when no optional params (line 449)

### Unit tests (`tests/unit/event-savetargetas.test.ts`)
- Detects SAVE_ELEMENT_SCREENSHOT event command (line 69)
- Extracts filename from SAVE_ELEMENT_SCREENSHOT=filename (line 75)
- Routes SAVE_ELEMENT_SCREENSHOT to SCREENSHOT handler (line 109)
