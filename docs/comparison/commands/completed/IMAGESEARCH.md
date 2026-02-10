# IMAGESEARCH Command Comparison

## Syntax

```
IMAGESEARCH POS=<pos> IMAGE=<path> CONFIDENCE=<percent>
```

**Old regex** (MacroPlayer.js:906-909):
```
^pos\s*=\s*(<string>)\s+image\s*=\s*(<string>)\s+confidence\s*=\s*(<string>)
```
- Three capture groups: POS, IMAGE, CONFIDENCE (all using `im_strre` for quoted/unquoted string values).

**New parser** (parser.ts:913-926):
- Key-value parameter command. Validates that `POS`, `IMAGE`, and `CONFIDENCE` parameters are all present at parse time.

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| POS | Integer (1-based) | Yes | Which occurrence of the image to match (1 = first) |
| IMAGE | String (file path) | Yes | Path to the template image file (PNG). Relative paths resolved against datasource folder |
| CONFIDENCE | Integer (0-100) | Yes | Minimum confidence threshold as a percentage |

## Old Implementation (MacroPlayer.js:1093-1123)

```javascript
MacroPlayer.prototype.ActionTable["imagesearch"] = function (cmd) {
    var pos = imns.s2i(imns.unwrap(this.expandVariables(cmd[1])));
    var image = imns.unwrap(this.expandVariables(cmd[2]));
    var confidence = imns.s2i(imns.unwrap(this.expandVariables(cmd[3])));

    if (!imns.is_windows()) {
        throw new UnsupportedCommand("IMAGESEARCH");
    }

    if (!imns.FIO.isFullPath(image)) {
        var image_file = this.dataSourceFolder.clone();
        image_file.append(image);
        image = image_file.path;
    }

    var ds = Cc["@mozilla.org/file/directory_service;1"];
    ds = ds.getService(Ci.nsIProperties);
    var dir = ds.get("TmpD", Ci.nsILocalFile);
    var leafName = btoa(encodeURIComponent(window.content.location.href)) +
        (new Date()).getTime() + ".png";

    var mplayer = this;
    this.waitingForImage = true;
    this.savePageAsImage(window.content, leafName, dir, "png", function() {
        mplayer.waitingForImage = false;
        dir.append(leafName);

        mplayer.waitingForImageSearch = true;
        mplayer.doImageSearch(dir.path, image, confidence);
    });
};
```

### Step-by-step logic (old)

1. **Parse parameters**: Extracts POS, IMAGE, and CONFIDENCE from regex capture groups. Expands variables, unwraps quotes, and converts POS and CONFIDENCE to integers via `imns.s2i()`.
2. **Windows check**: Throws `UnsupportedCommand("IMAGESEARCH")` if not running on Windows. Image recognition requires the commercial `iimIRm.dll` native library.
3. **Resolve image path**: If IMAGE is not an absolute path, resolves it relative to `this.dataSourceFolder` (the macro's datasource directory).
4. **Capture page screenshot**: Gets the system temp directory via XPCOM `nsIProperties`. Generates a unique filename from `btoa(encodeURIComponent(currentURL)) + timestamp + ".png"`. Calls `savePageAsImage()` to render the full webpage content to a PNG file using canvas `drawWindow()`.
5. **Perform image search**: Once the screenshot is saved, calls `doImageSearch(screenshotPath, templatePath, confidence)` which delegates to a ChromeWorker running `imr_worker.js`.

### `doImageSearch()` (MacroPlayer.js:1044-1090)

1. **Load IMR library**: On first call, locates `iimIRm.dll` via Windows registry key `HKLM\SOFTWARE\iOpus\iMacros\PathExe`. Creates a `ChromeWorker` thread running `imr_worker.js` and sends an `init` message with the DLL path.
2. **Send search message**: Posts `{ command: "search", image: screenshotPath, template: templatePath, confidenceLevel: confidence }` to the worker.
3. **Worker responds**: The `onImrMessage` handler processes the result asynchronously.

### `onImrMessage()` result handling (MacroPlayer.js:964-1042)

The worker returns a status code:

| Status | Constant | Behavior |
|--------|----------|----------|
| 0 | `TM_STATUS_MATCH_FOUND_OK` | Calls `highlightImage(data)` to draw a green border overlay at the match position, then proceeds to next action |
| 1 | `TM_STATUS_MATCH_NOT_FOUND` | If `ignoreErrors` is set, skips. Otherwise enters retry loop using `setInterval` with `!TIMEOUT_TAG` (or `timeout/10`). On timeout, throws `RuntimeError("Image specified by ... does not match the web-page", 927)` |
| 2 | `TM_STATUS_FILE_IMAGE_NOT_FOUND` | Throws `RuntimeError("Can not open image file ...", 930)` |
| 3+ | `TM_STATUS_IMAGE_ILLEGAL_SIZE` / `TM_STATUS_INTERNAL_ERROR` | Throws `RuntimeError("Image search error ...", 903)` |

After each search, the temporary screenshot file is deleted: `tmp_image.remove(false)`.

### `highlightImage()` (MacroPlayer.js:912-923)

Creates a `<div>` overlay on the page with:
- Green border (`1px solid #9bff9b`)
- Positioned absolutely at the match coordinates (centered: `x - width/2`, `y - height/2`)
- z-index 100

### `savePageAsImage()` (MacroPlayer.js:1855-1904)

Renders the full webpage to a canvas (up to 10000x10000 px) using Firefox's privileged `ctx.drawWindow()`, then saves as PNG to the temp directory via `Downloads.fetch()`.

## New Implementation

### Command Handler (image-recognition.ts:320-442)

```typescript
export const imageSearchHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  if (!imageSearchService) {
    return { success: false, errorCode: IMACROS_ERROR_CODES.IMAGE_SEARCH_NOT_CONFIGURED, ... };
  }

  const pos = parseInt(ctx.expand(posParam), 10);
  const imagePath = resolveImagePath(ctx, ctx.expand(imageParam));
  const confidence = parseInt(ctx.expand(confidenceParam), 10);

  // Validate parameters
  // Convert confidence from percentage (0-100) to decimal (0-1)
  const confidenceThreshold = confidence / 100;
  const source: ImageSearchSource = 'webpage';

  return executeWithTimeoutRetry(ctx, async () => {
    const result = await performImageSearch(imagePath, confidenceThreshold, pos, source);

    ctx.state.setVariable('!IMAGESEARCH', result.found ? 'true' : 'false');
    ctx.state.setVariable('!IMAGESEARCH_X', result.x);
    ctx.state.setVariable('!IMAGESEARCH_Y', result.y);
    ctx.state.setVariable('!IMAGESEARCH_CONFIDENCE', Math.round(result.confidence * 100));

    if (result.found) {
      highlightFoundImage(result, 'IMAGESEARCH');
      return { success: true, errorCode: IMACROS_ERROR_CODES.OK, output: `${result.x},${result.y}` };
    } else {
      return { success: false, errorCode: IMACROS_ERROR_CODES.IMAGE_NOT_FOUND, ... };
    }
  }, (r) => r.errorCode === IMACROS_ERROR_CODES.IMAGE_NOT_FOUND);
};
```

### Step-by-step logic (new)

1. **Service check**: If `imageSearchService` is not registered, returns error code `-902` (`IMAGE_SEARCH_NOT_CONFIGURED`). The service must be provided by the native host at startup.
2. **Parameter validation**: Requires `POS`, `IMAGE`, and `CONFIDENCE`. Validates POS is a positive integer and CONFIDENCE is 0-100.
3. **Resolve image path**: If not absolute, resolves relative to `!FOLDER_DATASOURCE` variable (same concept as old `dataSourceFolder`).
4. **Convert confidence**: Converts from percentage (0-100) to decimal (0-1) for the search service.
5. **Set search source**: Hardcoded to `'webpage'` (content area only), matching iMacros 8.9.7 behavior.
6. **Retry loop**: Uses `executeWithTimeoutRetry()` which reads `!TIMEOUT_TAG` and retries the operation at intervals until success or timeout.
7. **Perform search**: Calls `performImageSearch()` which delegates to `imageSearchService.search()` (for POS=1) or `imageSearchService.searchAll()` (for POS>1, selecting the nth match).
8. **Store variables**: Sets `!IMAGESEARCH` (boolean string), `!IMAGESEARCH_X`, `!IMAGESEARCH_Y`, and `!IMAGESEARCH_CONFIDENCE`.
9. **Highlight**: On success, calls `highlightFoundImage()` which invokes a registered callback to draw a visual overlay.
10. **Error handling**: File-not-found errors (`-903`) are non-retryable. Image-not-found errors (`-927`) are retried. After timeout, `executeWithTimeoutRetry` returns `-930` (`TIMEOUT`).

### Service Architecture

The new implementation uses a pluggable service architecture:

- **`ImageSearchService`** interface: Provided by the native host, implements `search()` and optionally `searchAll()` / `waitFor()`.
- **`MouseClickService`** interface: For IMAGECLICK, provides `click()` at screen coordinates.
- **`ImageHighlightCallback`**: Registered by the extension for visual overlay feedback.
- Services are registered via `setImageSearchService()`, `setMouseClickService()`, `setImageHighlightCallback()`.

### `performImageSearch()` helper (image-recognition.ts:248-272)

- POS=1: Calls `imageSearchService.search(path, options)`.
- POS>1: Calls `imageSearchService.searchAll(path, options, pos)` and returns the nth result. Falls back to `search()` (first match only) if `searchAll` is not implemented.

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Platform restriction** | Windows only — throws `UnsupportedCommand` on non-Windows | Cross-platform — depends on native host providing `ImageSearchService` | **Improvement**: Can work on any platform if a suitable image search backend is provided |
| **Image search engine** | Commercial `iimIRm.dll` loaded via ChromeWorker + Windows registry lookup | Pluggable `ImageSearchService` interface provided by native host | **Improvement**: Decoupled from proprietary DLL; can use any image matching backend (OpenCV, etc.) |
| **Screenshot capture** | `savePageAsImage()` renders page to canvas via `ctx.drawWindow()`, saves PNG to temp dir, passes file path to worker | Delegated to the image search service — the service handles capture internally via `source: 'webpage'` option | **Architectural**: New doesn't manage screenshot files directly; the service abstracts capture + search |
| **Temp file management** | Creates temp PNG, passes to worker, deletes after search | No temp files — handled internally by the service | **Improvement**: Cleaner resource management |
| **Variables stored** | None — old implementation does not set any `!IMAGESEARCH_*` variables | Sets `!IMAGESEARCH`, `!IMAGESEARCH_X`, `!IMAGESEARCH_Y`, `!IMAGESEARCH_CONFIDENCE` | **Enhancement**: New provides search results via macro variables for downstream use |
| **POS parameter** | Parsed but only passed to `doImageSearch()` — DLL may or may not support nth-match | Explicitly supports nth-match via `searchAll()` when POS>1 | **Improvement**: Clear multi-match support |
| **Retry mechanism** | Custom `setInterval` loop in `onImrMessage` with `retryTimeout` / `retryStartTime`, shows "Image waiting..." in status bar | Shared `executeWithTimeoutRetry()` utility (same as TAG command), reads `!TIMEOUT_TAG` | Same behavior, cleaner implementation |
| **Error codes** | 902 (no library), 903 (general error), 927 (not found), 930 (file not found) | -902 (`IMAGE_SEARCH_NOT_CONFIGURED`), -903 (`IMAGE_FILE_NOT_FOUND`), -927 (`IMAGE_NOT_FOUND`), -930 (`TIMEOUT`) | **Note**: Old uses 930 for file-not-found and 927 for image-not-found. New maps 903 to file-not-found and 930 to timeout. Error code semantics differ slightly (see below) |
| **Error code mapping detail** | 930 = "Can not open image file" (file error); 927 = "does not match the web-page" (not found on screen) | -903 = file not found (non-retryable); -927 = image not found (retryable); -930 = timeout after retries | Old 930 ≈ New -903; Old 927 ≈ New -927; timeout implicit in old → explicit -930 in new |
| **Async model** | Callback-based (`savePageAsImage` callback → `doImageSearch` → `onImrMessage` event) | `async/await` with `Promise`-based service calls | Structural — same end behavior |
| **Highlight** | Creates a `<div>` with green border (`#9bff9b`), absolute positioned, z-index 100 | Calls registered `ImageHighlightCallback` — implementation depends on extension | Same visual concept, decoupled implementation |
| **Parameter validation** | Minimal — `imns.s2i()` for integer conversion, no range checking | Validates POS > 0, CONFIDENCE 0-100, all required params present | **Improvement**: Better error messages for invalid input |
| **Logging** | None | Logs image path, confidence, pos at info level; logs search results | **Improvement**: Better observability |
| **Command registration** | `ActionTable["imagesearch"]` (lowercase) | `imageRecognitionHandlers.IMAGESEARCH` (uppercase) | Internal naming convention only |

## Output / Side Effects

### Variables Modified

| Variable | Type | Description |
|----------|------|-------------|
| `!IMAGESEARCH` | String (`"true"` / `"false"`) | Whether the image was found (new only) |
| `!IMAGESEARCH_X` | Number | X coordinate of match center (new only) |
| `!IMAGESEARCH_Y` | Number | Y coordinate of match center (new only) |
| `!IMAGESEARCH_CONFIDENCE` | Number (0-100) | Actual confidence score as percentage (new only) |

**Note**: The old implementation does not store search results in macro variables. The new implementation adds these for downstream use in macros.

### Side Effects

- **Visual highlight**: Both implementations draw a green overlay on the matched region
- **Temp files**: Old creates and deletes a temporary PNG screenshot; new delegates to the service
- **Native library**: Old loads `iimIRm.dll` via ChromeWorker on first use; new requires pre-registered service

## Test Coverage

### Command handler tests (`tests/unit/commands/image-recognition.test.ts`)

| Test | Line |
|------|------|
| Returns `-902` when service not configured | 169 |
| Requires POS parameter | 192 |
| Requires IMAGE parameter | 205 |
| Requires CONFIDENCE parameter | 218 |
| Validates POS is positive integer | 231 |
| Validates CONFIDENCE is 0-100 | 245 |
| Searches and stores coordinates on success | 259 |
| Passes `source=webpage` to service (matches 8.9.7) | 283 |
| Returns `-927` / `-930` timeout when not found | 297 |
| Retries searching until timeout | 316 |
| Succeeds on retry if image appears later | 333 |
| Returns `-903` for file errors (non-retryable) | 356 |
| Handles service errors gracefully | 374 |
| Uses `searchAll` for POS > 1 | 391 |
| Triggers highlight callback on success | 413 |
| Does not highlight when not found | 434 |

### Parser tests (`tests/unit/parser.test.ts`)

| Test | Line |
|------|------|
| Parses IMAGESEARCH command | 794 |
| Validates requires POS, IMAGE, and CONFIDENCE | 799 |
| Included in supported commands list | 887 |

### Integration tests (`tests/unit/commands/image-recognition.test.ts`)

| Test | Line |
|------|------|
| Executes IMAGESEARCH command in macro via executor | 751 |
