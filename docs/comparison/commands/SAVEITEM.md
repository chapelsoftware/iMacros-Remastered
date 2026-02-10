# SAVEITEM Command Comparison

## Syntax

```
SAVEITEM
SAVEITEM URL=<url>
SAVEITEM FOLDER=<path> FILE=<filename>
SAVEITEM URL=<url> FOLDER=<path> FILE=<filename>
```

**Old regex**: `".*"` — matches anything (effectively no parameter validation)
- Registered as standalone command but the action handler is empty (no-op)
- Real work happens via `TAG ... CONTENT=EVENT:SAVEITEM` which triggers `savePictureAs(element)` in `processElement()`

**New parser**: Key-value parameter command — `parser.ts:936` has no validation (all parameters optional). Supports URL, FOLDER, FILE as key-value pairs in any order.

## Parameters

| Parameter | Required | Values | Description |
|-----------|----------|--------|-------------|
| URL | No (new only) | URL string | URL to download directly |
| FOLDER | No | Path or `*` (default folder) | Destination folder |
| FILE | No | Filename, `*` or `+suffix` (old only) | Destination filename |

## Old Implementation (MacroPlayer.js)

### Command Registration (MacroPlayer.js:3344-3347)

```javascript
MacroPlayer.prototype.RegExpTable["saveitem"] = ".*";
MacroPlayer.prototype.ActionTable["saveitem"] = function (cmd) {
    // Empty — SAVEITEM as a standalone command does nothing
};
```

The standalone SAVEITEM command is a no-op. All real functionality is accessed via the TAG command's `CONTENT=EVENT:SAVEITEM` parameter.

### Event-Based Trigger (MacroPlayer.js:3201-3206)

```javascript
// Inside processElement(), when TAG uses CONTENT=EVENT:SAVEITEM
if (txt && /^event:(\S*)$/i.test(txt)) {
    var etype = RegExp.$1.toLowerCase();
    switch(etype) {
    case "saveitem": case "savepictureas":
        this.savePictureAs(element);
        break;
    // ...
    }
}
```

`EVENT:SAVEITEM` and `EVENT:SAVEPICTUREAS` are treated identically — both call `savePictureAs()`.

### `savePictureAs()` (MacroPlayer.js:1403-1428)

```javascript
MacroPlayer.prototype.savePictureAs = function(element) {
    this.clearDownloadDlgFlags();

    if (!element.hasAttribute("src"))
        throw new RuntimeError("can not save picture: no src attribute"+
                               " found for element "+element.tagName, 923);

    var file = this.handleOnDownloadFile(element.src, this.downloadFolder,
        this.downloadFilename);
    delete this.downloadFolder;
    delete this.downloadFilename;

    var ios = imns.Cc["@mozilla.org/network/io-service;1"]
      .getService(imns.Ci.nsIIOService);
    var uri = ios.newURI(element.src, null, null);
    Downloads.fetch(uri, file).then(
        () => {
            if (!this.shouldWaitDownload)
                return;
            setTimeout(()=> this.playNextAction(), 0);
        },
        (err) => this.showErrorAndStop(err, this.ignoreErrors)
    );
};
```

### `handleOnDownloadFile()` (MacroPlayer.js:1316-1347)

```javascript
MacroPlayer.prototype.handleOnDownloadFile = function(uri, folder, filename) {
    var leafName = "", m = null;

    if ( uri && (m = uri.match(/\/([^\/?]+)(?=\?.+|$)/)) ) {
        leafName = m[1];
    } else {
        leafName = window.content.document.title;
    }
    if (filename == "*" || !filename) {
        filename = leafName;
    } else if (m = filename.match(/^\+(.*)$/)) {
        if (/\..+$/.test(leafName))
            filename = leafName.replace(/(.+)(\..+)$/, "$1"+m[1]+"$2");
        else
            filename = leafName + m[1];
    } else if (!/\.[^\.]+$/.test(filename)) {
        filename += leafName.replace(/(?:.+)(\.[^\.]+)$/, "$1");
    }
    var file;
    if (folder == "*" || !folder) {
        file = imns.Pref.getFilePref("defdownpath");
    } else {
        file = imns.FIO.openNode(folder);
    }

    var re = new RegExp('\\s*[:*?|<>\\"/]+\\s*', "g");
    filename = filename.replace(re, "_");
    file.append(filename);

    return file;
};
```

### Step-by-step logic (old)

1. **Standalone SAVEITEM**: No-op. The command exists only for syntax recognition.
2. **TAG EVENT:SAVEITEM flow**: When a TAG command specifies `CONTENT=EVENT:SAVEITEM`, `processElement()` calls `savePictureAs(element)`.
3. **Validate src**: Checks that the matched element has a `src` attribute. Throws `RuntimeError` with code 923 if missing.
4. **Resolve filename**: Via `handleOnDownloadFile()`:
   - Extracts leaf name from the element's `src` URL (last path segment before query string)
   - Falls back to `document.title` if URL parsing fails
   - `filename == "*"` or empty → uses leaf name
   - `filename == "+suffix"` → inserts suffix before extension (or appends if no extension)
   - Filename with no extension → copies extension from leaf name
5. **Resolve folder**: `folder == "*"` or empty → uses default download path from preferences. Otherwise opens the specified folder via `imns.FIO.openNode()`.
6. **Sanitize filename**: Replaces sequences of `[:*?|<>"/]` and surrounding whitespace with `_`.
7. **Download**: Uses Mozilla's `Downloads.fetch()` API with a `nsIURI` object.
8. **Wait**: If `shouldWaitDownload` is true (set by prior ONDOWNLOAD), waits for completion before proceeding.
9. **Cleanup**: Deletes `downloadFolder` and `downloadFilename` properties after use.

### ONDOWNLOAD Integration

ONDOWNLOAD (MacroPlayer.js:1163-1228) sets `this.downloadFolder` and `this.downloadFilename` which are consumed by `savePictureAs()`. It also sets `shouldWaitDownload` (default true) and optional checksum validation parameters.

## New Implementation

### Command Handler (downloads.ts:676-734)

```typescript
export const saveitemHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const urlParam = ctx.getParam('URL');
  const folderParam = ctx.getParam('FOLDER');
  const fileParam = ctx.getParam('FILE');

  // Expand variables
  const url = urlParam ? ctx.expand(urlParam) : undefined;
  const folder = folderParam
    ? ctx.expand(folderParam)
    : ctx.state.getVariable(DOWNLOAD_FOLDER_KEY)?.toString();
  const file = fileParam ? ctx.expand(fileParam) : undefined;

  ctx.log('info', `Saving item: ${url || '(current target)'}`);

  // Send save item request to browser extension
  const response = await sendDownloadMessage(
    {
      type: 'saveItem',
      url,
      folder,
      file,
    },
    ctx
  );

  if (!response.success) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.DOWNLOAD_FAILED,
      errorMessage: response.error || 'Failed to save item',
    };
  }

  // Store download ID if provided
  if (response.data?.downloadId !== undefined) {
    ctx.state.setVariable(LAST_DOWNLOAD_ID_KEY, response.data.downloadId);
  }

  ctx.log('info', `Download started: ${response.data?.filename || response.data?.url || 'item'}`);

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
    output: response.data?.filename,
  };
};
```

### SaveItemMessage Interface (downloads.ts:83-96)

```typescript
export interface SaveItemMessage extends DownloadMessage {
  type: 'saveItem';
  /** URL to download */
  url?: string;
  /** Element selector to get download URL from */
  selector?: string;
  /** Folder to save to (optional, uses ONDOWNLOAD setting if not specified) */
  folder?: string;
  /** Filename to save as (optional, uses original name if not specified) */
  file?: string;
}
```

### EVENT:SAVEITEM in DOM Executor (dom-executor.ts:720-733)

```typescript
if (eventCommand.startsWith('SAVEITEM') || eventCommand.startsWith('SAVEPICTUREAS')) {
  // SAVEITEM/SAVEPICTUREAS: save the element's image/media source
  const url = getElementMediaUrl(element);
  if (!url) {
    return { success: false, errorMessage: `EVENT:${eventCommand.split('=')[0]} - no image/media source found on element` };
  }

  // Extract filename if provided (e.g., EVENT:SAVEITEM=image.png)
  const eqIndex = eventCommand.indexOf('=');
  const filename = eqIndex > 0 ? eventCommand.substring(eqIndex + 1) : '';

  triggerDownload(url, filename, element);
  return { success: true };
}
```

The `getElementMediaUrl()` helper checks `src`, `data-src`, `poster`, and `background-image` CSS property — broader than the old implementation which only checked `src`.

### Step-by-step logic (new)

1. **Standalone SAVEITEM**: Unlike old, the new standalone SAVEITEM command is functional. It sends a `saveItem` message to the browser extension via the download bridge.
2. **Parse parameters**: URL, FOLDER, FILE are all optional key-value parameters with variable expansion.
3. **Resolve FOLDER fallback**: If FOLDER is not specified, falls back to `!FOLDER_DOWNLOAD` state variable (set by prior ONDOWNLOAD command).
4. **Send message**: Sends a `saveItem` message to the browser extension via `sendDownloadMessage()`.
5. **Handle response**: On failure, returns `DOWNLOAD_FAILED` (-951). On success, stores download ID in state and returns filename.
6. **TAG EVENT:SAVEITEM flow**: Handled separately in `dom-executor.ts`. Gets media URL from element (checks `src`, `data-src`, `poster`, `background-image`), optionally extracts filename from `EVENT:SAVEITEM=filename.png` syntax, then triggers download.

### Handler Registration (downloads.ts:741-744)

```typescript
export const downloadHandlers = {
  ONDOWNLOAD: ondownloadHandler,
  SAVEAS: saveasHandler,
  SAVEITEM: saveitemHandler,
} as const;
```

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Standalone command** | No-op (empty action handler) | Functional — sends `saveItem` message to extension | **Enhancement**: SAVEITEM can now be used standalone with URL/FOLDER/FILE params, not just via TAG events. |
| **URL parameter** | Not supported (URL comes from element src) | Supported as explicit parameter | **Enhancement**: Can specify download URL directly without TAG. |
| **FOLDER parameter** | Not on SAVEITEM itself; set by ONDOWNLOAD | Supported on SAVEITEM directly; falls back to ONDOWNLOAD | **Enhancement**: More flexible parameter passing. |
| **FILE parameter** | Not on SAVEITEM itself; set by ONDOWNLOAD | Supported on SAVEITEM directly | **Enhancement**: More flexible parameter passing. |
| **Filename resolution** | Complex logic: `*`/`+suffix`/auto-extension via `handleOnDownloadFile()` | Passes raw filename to extension; no `*`/`+suffix` processing in handler | **Difference**: Wildcard/suffix filename patterns are not processed in the new handler. Extension layer handles naming. |
| **Filename fallback** | Extracts from URL, falls back to `document.title` | Extension handles naming; no title fallback in handler | **Structural**: Name resolution delegated to extension layer. |
| **Element src validation** | Requires `src` attribute (error 923) | `getElementMediaUrl()` checks `src`, `data-src`, `poster`, `background-image` CSS | **Enhancement**: Broader element media URL detection. Errors on "no image/media source found" (no numeric code). |
| **EVENT:SAVEITEM=filename** | Not supported | Supports `EVENT:SAVEITEM=image.png` to specify filename | **Enhancement**: Inline filename specification. |
| **Filename sanitization** | Replaces `[:*?|<>"/]` with `_` | Delegated to extension layer | **Structural**: Sanitization happens elsewhere. |
| **Download API** | Mozilla `Downloads.fetch()` with `nsIURI` | Chrome `chrome.downloads` API via message bridge | **Platform difference**: Different browser APIs. |
| **Wait behavior** | `shouldWaitDownload` flag (set by ONDOWNLOAD) controls async flow | Async/await — handler always awaits bridge response | **Structural**: Always waits for bridge response. Actual download may complete asynchronously. |
| **Checksum validation** | Supported via ONDOWNLOAD (MD5/SHA1) | Not implemented in handler (would need extension support) | **Gap**: Checksum validation from ONDOWNLOAD not yet wired through. |
| **Download tracking** | None | Stores `!LAST_DOWNLOAD_ID` from bridge response | **Enhancement**: Enables download status queries. |
| **Error handling** | Throws `RuntimeError` (code 923) | Returns structured `CommandResult` with `DOWNLOAD_FAILED` (-951) | **Improvement**: Non-throwing, structured error returns. |
| **Error codes** | 923 (no src attribute) | -951 (DOWNLOAD_FAILED) | **Difference**: Different numeric error codes. |
| **Async model** | Callback-based via `Downloads.fetch().then()` | Fully async with `await` | **Structural**: Modern async/await pattern. |
| **Logging** | None | Logs at info level: "Saving item: ..." and "Download started: ..." | **Improvement**: Observability. |
| **Testing mode** | N/A | Returns success when no bridge configured | **Enhancement**: Supports headless/testing execution. |
| **Command registration** | `ActionTable["saveitem"]` (lowercase) | `downloadHandlers.SAVEITEM` (uppercase) | Internal naming convention only. |

## Output / Side Effects

- **File download**: Downloads the image/media/file to disk
- **Variables modified**: New stores `!LAST_DOWNLOAD_ID` if the extension returns a download ID (though `!LAST_DOWNLOAD_ID` is not currently in the recognized system variables list)
- **ONDOWNLOAD state consumed**: Old deletes `downloadFolder`/`downloadFilename` after use; new reads `!FOLDER_DOWNLOAD` from state (does not consume/delete it)
- **Return data**: New returns the saved filename via `output` field; old returns nothing

## Test Coverage

### Parser tests (`tests/unit/parser.test.ts`)
- SAVEITEM included in supported commands list (parser recognizes it)
- No validation errors — all parameters are optional (`parser.ts:936`)

### Integration tests (`tests/integration/commands/saveitem.test.ts`)
- Basic `SAVEITEM` sends saveItem message and succeeds (line 45)
- `SAVEITEM URL=...` sends url in message (line 61)
- `SAVEITEM FOLDER=...` sends folder in message (line 78)
- `SAVEITEM FILE=...` sends file in message (line 95)
- All parameters combined: URL, FOLDER, FILE (line 112)
- Variable expansion in URL parameter via `SET !VAR1` (line 131)
- Bridge failure returns DOWNLOAD_FAILED error code (line 152)
- Bridge exception returns DOWNLOAD_FAILED error code (line 165)
- No bridge configured returns success (testing mode) (line 181)
- Download ID state storage from bridge response (line 197)
- ONDOWNLOAD then SAVEITEM sequence uses folder fallback (line 219)
