# SAVEAS Command Comparison

## Syntax

```
SAVEAS TYPE=<type> FOLDER=<path> FILE=<filename>
```

**Old regex**: `^type\s*=\s*(\S+)\s+folder\s*=\s*(<im_strre>)\s+file\s*=\s*(<im_strre>)\s*$`
- Three capture groups: TYPE (group 1), FOLDER (group 2), FILE (group 3)
- All three parameters required in fixed order: TYPE, FOLDER, FILE

**New parser**: Key-value parameter command — `parser.ts:705-714` validates that TYPE parameter is present. FOLDER and FILE are parsed as key-value pairs in any order.

## Parameters

| Parameter | Required | Values | Description |
|-----------|----------|--------|-------------|
| TYPE | Yes | CPL, HTM, TXT, EXTRACT, PNG, JPEG (old) / TXT, HTM, HTML, PNG, JPG, JPEG, BMP, PDF, CPL, MHT, EXTRACT (new) | Save format |
| FOLDER | Yes (old) / Optional (new) | Path or `*` (default folder) | Destination folder |
| FILE | Yes | Filename, `*` (auto-derive), or `+suffix` | Destination filename |
| QUALITY | No (old N/A) / Optional (new) | 0-100 | JPEG quality (new only) |

## Old Implementation (MacroPlayer.js:1748-1852)

```javascript
MacroPlayer.prototype.RegExpTable["saveas"] =
    "^type\\s*=\\s*(\\S+)\\s+"+
    "folder\\s*=\\s*("+im_strre+")\\s+"+
    "file\\s*=\\s*("+im_strre+")\\s*$";

MacroPlayer.prototype.ActionTable["saveas"] = function (cmd) {
    var folder = imns.unwrap(this.expandVariables(cmd[2]));
    var type = imns.unwrap(this.expandVariables(cmd[1])).toLowerCase();
    if (folder == "*") {
        folder = imns.Pref.getFilePref("defdownpath").path;
    }
    try {
        var f = imns.FIO.openNode(folder);
    } catch (e) {
        throw new RuntimeError("Wrong path "+folder, 932);
    }
    if (!f.exists())
        throw new RuntimeError("Path "+folder+" does not exists", 932);
    var file = imns.unwrap(this.expandVariables(cmd[3])), t;

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

    var re = new RegExp('\\s*[:*?|<>\\"/]+\\s*', "g");

    if (type == "extract") {
        // EXTRACT type: save extracted data as CSV
        if (file == "*") {
            file = "extract.csv";
        } else if (t = file.match(/^\+(.+)$/)) {
            file = "extract"+t[1]+".csv";
        }
        file = file.replace(re, "_");
        var data = this.getExtractData();
        this.clearExtractData();
        data = data.replace(/\"/g, '""');
        data = '"'+data.replace(/\[EXTRACT\]/g, '","')+'"';
        f = imns.FIO.openNode(folder);
        f.append(file);
        imns.FIO.appendTextFile(f, data+"\r\n");
    } else {
        // Non-EXTRACT types
        if (file == "*") {
            file = __doc_name(window.content);
        } else if (t = file.match(/^\+(.+)$/)) {
            file = __doc_name(window.content) + t[1];
        }
        file = file.replace(re, "_");

        var wbp = null, doc = window.content.document;
        wbp = imns.Cc['@mozilla.org/embedding/browser/nsWebBrowserPersist;1'];
        wbp = wbp.createInstance(imns.Ci.nsIWebBrowserPersist);
        var flags = wbp.PERSIST_FLAGS_REPLACE_EXISTING_FILES;
        wbp.persistFlags = flags;
        var f = imns.FIO.openNode(folder);

        if (type == "cpl") {
            if (!/html?$/.test(file)) file += ".htm";
            f.append(file);
            var files_dir = f.path.replace(/\.html?$/, "_files");
            files_dir = imns.FIO.openNode(files_dir);
            wbp.saveDocument(doc, f, files_dir, null, null, 0);
        } else if (type == "htm") {
            if (!/html?$/.test(file)) file += ".htm";
            f.append(file);
            wbp.saveDocument(doc, f, null, null, null, 0);
        } else if (type == "txt") {
            if (!/\.\w+$/.test(file)) file += ".txt";
            f.append(file);
            wbp.saveDocument(doc, f, null, "text/plain",
                             wbp.ENCODE_FLAGS_FORMAT_FLOWED, 0);
        } else if (/^png|jpeg$/.test(type)) {
            this.savePageAsImage(window.content, file, f, type);
        } else {
            throw new BadParameter("iMacros for Firefox supports only "+
                                   "CPL|HTM|TXT|EXTRACT|PNG|JPEG SAVEAS types");
        }
    }
};
```

### Step-by-step logic (old)

1. **Parse parameters**: Regex captures TYPE (group 1), FOLDER (group 2), FILE (group 3) in fixed order. Variable expansion is applied to all three.
2. **Resolve folder**: If FOLDER is `*`, resolves to the default download path via `imns.Pref.getFilePref("defdownpath").path`. Otherwise opens the folder node directly via `imns.FIO.openNode()`.
3. **Validate folder**: If `openNode()` throws, raises `RuntimeError("Wrong path ...", 932)`. If the folder doesn't exist, raises the same error code 932.
4. **Resolve filename wildcards**:
   - `FILE=*`: For EXTRACT type, uses `"extract.csv"`. For other types, derives name from `window.content` via `__doc_name()` (tries URL path segment, then hostname minus `www.`, then `document.title`, falls back to `"unknown"`, strips file extension).
   - `FILE=+suffix`: For EXTRACT, uses `"extract" + suffix + ".csv"`. For others, uses `__doc_name() + suffix`.
5. **Sanitize filename**: Replaces sequences of `[:*?|<>"/]` and surrounding whitespace with `_`.
6. **Execute by type**:
   - **EXTRACT**: Gets extract data via `this.getExtractData()`, clears it via `this.clearExtractData()`, escapes double quotes (`"` → `""`), wraps in quotes and replaces `[EXTRACT]` delimiters with `","`, then **appends** `data + "\r\n"` to the file via `imns.FIO.appendTextFile()`.
   - **CPL** (complete page): Appends `.htm` extension if missing, saves document with a companion `_files` directory for resources via `nsWebBrowserPersist.saveDocument()`.
   - **HTM**: Appends `.htm` extension if missing, saves HTML document via `saveDocument()`.
   - **TXT**: Appends `.txt` extension if missing, saves as `text/plain` with `ENCODE_FLAGS_FORMAT_FLOWED`.
   - **PNG/JPEG**: Delegates to `this.savePageAsImage()` which renders the page to a canvas, converts to data URL, and downloads via Firefox's `Downloads.fetch()` API. JPEG uses `quality=100` default. Canvas size is capped at 10000×10000px.
   - **Other**: Throws `BadParameter` — only CPL, HTM, TXT, EXTRACT, PNG, JPEG are supported.

### `savePageAsImage()` (MacroPlayer.js:1855-1907)

```javascript
MacroPlayer.prototype.savePageAsImage = function(win, filename, folder, type, callback) {
    var canvasW = win.innerWidth + win.scrollMaxX;
    var canvasH = win.innerHeight + win.scrollMaxY;
    if (canvasW > 10000) canvasW = 10000;
    if (canvasH > 10000) canvasH = 10000;
    // Creates canvas, draws page via ctx.drawWindow(), converts to data URL,
    // downloads via Firefox Downloads.fetch() API
    // JPEG: quality=100, appends .jpg if no .jpeg/.jpg extension
    // PNG: appends .png if no .png extension
};
```

### `__doc_name()` helper (inline)

Derives a document name from the current window:
1. Extracts last path segment from `window.content.location.pathname`
2. Falls back to hostname minus `www.` prefix
3. Falls back to `document.title`
4. Falls back to `"unknown"`
5. Strips file extension if present

## New Implementation

### Command Handler (downloads.ts:539-674)

```typescript
export const saveasHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const typeParam = ctx.getParam('TYPE');
  const folderParam = ctx.getParam('FOLDER');
  const fileParam = ctx.getParam('FILE');
  const qualityParam = ctx.getParam('QUALITY');

  // TYPE is required
  if (!typeParam) {
    return { success: false, errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
             errorMessage: 'SAVEAS requires TYPE parameter' };
  }

  const saveType = normalizeSaveType(typeParam);

  // Validate save type
  if (!VALID_SAVE_TYPES.has(saveType)) {
    return { success: false, errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
             errorMessage: `Invalid TYPE: ${typeParam}. Valid types are: TXT, HTM, PNG, JPG, PDF, CPL, MHT, EXTRACT` };
  }

  // FILE is required
  if (!fileParam) {
    return { success: false, errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
             errorMessage: 'SAVEAS requires FILE parameter' };
  }

  // Expand variables
  const folder = folderParam ? ctx.expand(folderParam)
                             : ctx.state.getVariable(DOWNLOAD_FOLDER_KEY)?.toString();
  let file = ctx.expand(fileParam);

  // Validate folder path
  if (folder && folder !== '*') {
    const folderError = validateFolderPath(folder);
    if (folderError) {
      return { success: false, errorCode: IMACROS_ERROR_CODES.DOWNLOAD_FOLDER_ACCESS,
               errorMessage: `Wrong path ${folder}` };
    }
  }

  // Resolve FILE wildcards (same logic as old)
  const currentUrl = ctx.state.getVariable('!URLCURRENT')?.toString() || '';
  if (saveType === 'EXTRACT') {
    if (file === '*') file = 'extract.csv';
    else { const m = file.match(/^\+(.+)$/); if (m) file = 'extract' + m[1] + '.csv'; }
  } else {
    if (file === '*') file = deriveDocumentName(currentUrl);
    else { const m = file.match(/^\+(.+)$/); if (m) file = deriveDocumentName(currentUrl) + m[1]; }
  }

  // Sanitize filename
  file = sanitizeFilename(file);

  // Parse quality for JPG (0-100)
  let quality: number | undefined;
  if (qualityParam) {
    quality = parseInt(ctx.expand(qualityParam), 10);
    if (isNaN(quality) || quality < 0 || quality > 100) {
      return { success: false, errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
               errorMessage: `Invalid QUALITY value: ${qualityParam}. Must be 0-100` };
    }
  }

  // For EXTRACT type: format as CSV and clear extract data
  let content: string | undefined;
  if (saveType === 'EXTRACT') {
    const extractData = ctx.state.getVariable('!EXTRACT')?.toString() || '';
    content = formatExtractAsCsv(extractData);
    ctx.state.clearExtract();
  }

  // Send save request to browser extension
  const response = await sendDownloadMessage({ type: 'saveAs', saveType, folder, file, content, quality }, ctx);

  if (!response.success) {
    return { success: false, errorCode: IMACROS_ERROR_CODES.FILE_WRITE_ERROR,
             errorMessage: response.error || `Failed to save as ${saveType}` };
  }

  if (response.data?.downloadId !== undefined) {
    ctx.state.setVariable(LAST_DOWNLOAD_ID_KEY, response.data.downloadId);
  }

  return { success: true, errorCode: IMACROS_ERROR_CODES.OK, output: response.data?.filename };
};
```

### Helper: `normalizeSaveType()` (downloads.ts:512-522)

Maps aliases to canonical types: `HTML` → `HTM`, `JPEG` → `JPG`.

### Helper: `deriveDocumentName()` (downloads.ts:311-337)

Equivalent to old `__doc_name()`:
1. Parses URL, extracts last path segment
2. Falls back to hostname minus `www.` prefix
3. Falls back to `"unknown"` (does **not** use `document.title`)
4. Strips file extension if present

### Helper: `formatExtractAsCsv()` (downloads.ts:344-349)

```typescript
export function formatExtractAsCsv(data: string): string {
  const escaped = data.replace(/"/g, '""');
  return '"' + escaped.replace(/\[EXTRACT\]/g, '","') + '"';
}
```

Identical logic to old: escapes `"` → `""`, wraps fields in quotes, replaces `[EXTRACT]` delimiters with `","`.

### Helper: `sanitizeFilename()` (downloads.ts:302-304)

```typescript
export function sanitizeFilename(filename: string): string {
  return filename.replace(FILENAME_SANITIZE_RE, '_');
}
// FILENAME_SANITIZE_RE = /\s*[:*?|<>"\/]+\s*/g
```

Same regex and replacement as old implementation.

### Message Types (downloads.ts:56-81)

The handler sends a `SaveAsMessage` to the browser extension:
```typescript
export interface SaveAsMessage extends DownloadMessage {
  type: 'saveAs';
  saveType: SaveAsType;
  folder?: string;
  file: string;
  content?: string;    // For TXT, HTM, EXTRACT
  selector?: string;   // For element screenshots
  quality?: number;    // For JPG (0-100)
}
```

### Step-by-step logic (new)

1. **Validate TYPE**: Required parameter. Normalized via `normalizeSaveType()`. Validated against `VALID_SAVE_TYPES` set.
2. **Validate FILE**: Required parameter.
3. **Resolve FOLDER**: From parameter, or falls back to ONDOWNLOAD setting stored in state (`!FOLDER_DOWNLOAD`).
4. **Validate folder path**: Checks for null bytes (path traversal). Skips if `*`.
5. **Resolve FILE wildcards**: Same logic as old — `*` → auto-derive from URL or `"extract.csv"`, `+suffix` → append suffix to derived name.
6. **Sanitize filename**: Same regex as old.
7. **Parse QUALITY**: Optional, validates 0-100 range. Only for JPG type.
8. **Prepare EXTRACT content**: Formats extract data as CSV via `formatExtractAsCsv()`, clears extract state.
9. **Send message**: Sends `saveAs` message via `sendDownloadMessage()` to browser extension.
10. **Handle response**: Stores download ID if returned, returns success/failure with appropriate error codes.

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Supported types** | CPL, HTM, TXT, EXTRACT, PNG, JPEG | TXT, HTM, HTML, PNG, JPG, JPEG, BMP, PDF, CPL, MHT, EXTRACT | **Enhancement**: New adds PDF, BMP, MHT, and accepts HTML/JPG as aliases. |
| **FOLDER parameter** | Required (regex mandates it) | Optional — falls back to ONDOWNLOAD folder state | **Enhancement**: New allows omitting FOLDER if ONDOWNLOAD was previously called. |
| **Parameter order** | Fixed: TYPE, FOLDER, FILE | Any order (key-value parser) | **Enhancement**: More flexible parsing. |
| **QUALITY parameter** | Not supported (JPEG always quality=100) | Optional QUALITY=0-100 for JPG | **Enhancement**: Configurable JPEG quality. |
| **Document name fallback** | Uses `document.title` as third fallback | Falls back directly to `"unknown"` (no title check) | **Minor difference**: If URL path and hostname are empty, old uses page title before "unknown". |
| **File extension auto-append** | Old auto-appends `.htm`/`.txt`/`.jpg`/`.png` if missing | New delegates extension handling to the browser extension | **Structural**: Extension appending logic is in the browser layer, not the handler. |
| **EXTRACT file mode** | Appends to existing file (`appendTextFile`) | Sends content to extension (write behavior depends on extension) | **Potential difference**: Old explicitly appends; new's behavior depends on extension implementation. |
| **EXTRACT line ending** | Appends `\r\n` after each CSV row | Sends raw CSV content (no line ending added by handler) | **Potential difference**: Line ending may differ depending on extension implementation. |
| **File I/O** | Direct filesystem via `imns.FIO` and `nsWebBrowserPersist` | Message passing to browser extension via download bridge | **Structural**: Chrome extensions can't access filesystem directly; uses chrome.downloads API. |
| **Image capture** | Canvas `drawWindow()` with 10000×10000px cap | Delegated to browser extension (likely uses `chrome.tabs.captureVisibleTab()`) | **Platform difference**: Different rendering APIs. Canvas cap may not apply in new. |
| **Folder validation** | Opens folder node, checks `exists()` | Validates for null bytes only; actual path validation done by extension | **Structural**: New defers full path validation to the extension/native host layer. |
| **Error handling** | Throws `RuntimeError` (code 932) or `BadParameter` | Returns structured `CommandResult` with error codes (`MISSING_PARAMETER`, `INVALID_PARAMETER`, `DOWNLOAD_FOLDER_ACCESS`, `FILE_WRITE_ERROR`) | **Improvement**: More granular, non-throwing error handling. |
| **Async model** | Synchronous (except `savePageAsImage` uses callback/promise) | Fully async with `await` | **Structural**: Consistent async/await pattern. |
| **Logging** | None | Logs `'Saving as <type>: <path>'` at info level | **Improvement**: Observability. |
| **Download tracking** | None | Stores `downloadId` in state if returned by extension | **Enhancement**: Enables subsequent download status queries. |
| **Command registration** | `ActionTable["saveas"]` (lowercase) | `downloadHandlers.SAVEAS` (uppercase) | Internal naming convention only. |

## Output / Side Effects

- **File creation**: Saves page content or extracted data to the specified file
- **EXTRACT clears data**: Both implementations clear extract data (`!EXTRACT`) after saving
- **Variables modified**: New stores `!LAST_DOWNLOAD_ID` if the extension returns a download ID
- **Return data**: New returns the saved filename via `output` field; old returns nothing

## Test Coverage

### Parser tests (`tests/unit/parser.test.ts`)
- Parses `SAVEAS TYPE=CPL FOLDER=* FILE=test` (line 477)
- Parses `SAVEAS TYPE=HTM` (line 484)
- Parses `SAVEAS TYPE=TXT` (line 490)
- Parses `SAVEAS TYPE=EXTRACT` (line 496)
- Parses `SAVEAS` with timestamp variable in FILE parameter (line 502)
- Validates SAVEAS requires TYPE parameter (line 509)
- Included in supported commands list (line 880)

### Integration tests (`tests/integration/commands/saveas.test.ts`)
- `SAVEAS TYPE=TXT FILE=output.txt` sends saveAs with saveType=TXT (line 48)
- `SAVEAS TYPE=HTM FILE=page.htm` sends saveAs with saveType=HTM (line 62)
- Normalizes HTML to HTM (line 76)
- `SAVEAS TYPE=PNG FILE=screenshot.png` sends saveType=PNG (line 87)
- `SAVEAS TYPE=JPG FILE=photo.jpg` sends saveType=JPG (line 99)
- Normalizes JPEG to JPG (line 112)
- `SAVEAS TYPE=PDF FILE=doc.pdf` sends saveType=PDF (line 123)
- EXTRACT type sends formatted CSV content (line 142)
- EXTRACT with quotes in data escapes them (line 164)
- EXTRACT with empty data sends empty CSV (line 176)
- Clears extract data after SAVEAS TYPE=EXTRACT (line 185)
- Passes FOLDER parameter to message (line 211)
- Passes QUALITY parameter for JPG (line 227)
- Missing TYPE returns MISSING_PARAMETER error (line 243)
- Missing FILE returns MISSING_PARAMETER error (line 252)
- Invalid TYPE returns INVALID_PARAMETER error (line 265)
- Invalid QUALITY (>100) returns INVALID_PARAMETER error (line 274)
- Non-numeric QUALITY returns INVALID_PARAMETER error (line 283)
- Failed download bridge returns FILE_WRITE_ERROR (line 301)
- Stores downloadId from response (line 313)
- Variable expansion in FILE parameter (line 327)
- FILE=* derives name from URL (line 346)
- FILE=* for EXTRACT uses "extract.csv" (line 359)
- FILE=+suffix appends suffix to derived name (line 372)
- FILE=+suffix for EXTRACT uses "extract" + suffix + ".csv" (line 385)
- FILE=* with URL having path segment derives name (line 398)
- FILE=* with no URL falls back to "unknown" (line 410)
- Filename sanitization replaces illegal characters (line 423)
- FILE=* with www. prefix strips it for derived name (line 434)
- Folder with null byte returns DOWNLOAD_FOLDER_ACCESS error (line 450)
- FOLDER=* is passed through to message (line 458)
- Falls back to ONDOWNLOAD folder when FOLDER not specified (line 469)

### Integration tests (`tests/integration/commands/ondownload.test.ts`)
- ONDOWNLOAD then SAVEAS sequence test (line 401)
- Verifies ONDOWNLOAD followed by SAVEAS sends both messages correctly (line 402)

### Integration tests (`tests/integration/commands/downloads.test.ts`)
- SAVEAS command suite with various types (HTM, TXT, PNG, PDF) (line 577)
- Filename derivation and timestamp handling (line 624)

### E2E sample macro tests (`tests/e2e/samples/sample-macros.test.ts`)
- ArchivePage.iim: SAVEAS CPL with NOW timestamp (line 71)
- ExtractTable.iim: SAVEAS EXTRACT with CSV output (line 111)
- SaveAs.iim: SAVEAS CPL, HTM, TXT with NOW timestamp (line 168)
- TakeScreenshot-FX.iim: SAVEAS PNG (line 228)
