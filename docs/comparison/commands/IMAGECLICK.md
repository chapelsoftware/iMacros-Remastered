# IMAGECLICK Command Comparison

## Syntax

```
IMAGECLICK IMAGE=<path> [CONFIDENCE=<percent>] [BUTTON=<left|right|middle>]
```

**Old regex** (MacroPlayer.js:900):
```
.*
```
- Matches any arguments. The command is immediately rejected at runtime — the regex is a placeholder.

**New parser** (parser.ts:942):
- Key-value parameter command. No parse-time validation of specific parameters; validated at runtime by the handler.

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| IMAGE | String (file path) | Yes | Path to the template image file (PNG). Relative paths resolved against datasource folder |
| CONFIDENCE | Integer (0-100) | No (default: 80) | Minimum confidence threshold as a percentage |
| BUTTON | String (`left`, `right`, `middle`) | No (default: `left`) | Mouse button to use for clicking. Also accepts `center` as alias for `middle` |

## Old Implementation (MacroPlayer.js:900-903)

```javascript
MacroPlayer.prototype.RegExpTable["imageclick"] = ".*";
MacroPlayer.prototype.ActionTable["imageclick"] = function (cmd) {
    throw new UnsupportedCommand("IMAGECLICK");
};
```

### Step-by-step logic (old)

1. **Regex match**: The regex `.*` matches any argument string — no parameter parsing occurs.
2. **Throw unsupported**: Immediately throws `UnsupportedCommand("IMAGECLICK")`, which produces a runtime error and halts the macro.

The IMAGECLICK command was **not implemented** in iMacros 8.9.7 for the Chrome extension. It was listed in the command table but always rejected as unsupported. The command was only available in the iMacros desktop browser (Internet Explorer edition) which had full native image recognition support via `iimIRm.dll`.

## New Implementation

The new implementation provides **two handler paths**:

### 1. Unsupported handler (unsupported.ts:59-68) — Default fallback

```typescript
export const imageClickHandler: CommandHandler = createUnsupportedHandler(
  'IMAGECLICK',
  'Image recognition requires the native host (Windows only)'
);
```

When no native host services are registered, this handler returns error code `-901` (`UNSUPPORTED_COMMAND`).

### 2. Full handler (image-recognition.ts:472-623) — When native host is available

```typescript
export const imageClickHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  if (!imageSearchService) {
    return { success: false, errorCode: IMACROS_ERROR_CODES.IMAGE_SEARCH_NOT_CONFIGURED, ... };
  }
  if (!mouseClickService) {
    return { success: false, errorCode: IMACROS_ERROR_CODES.IMAGE_SEARCH_NOT_CONFIGURED, ... };
  }

  const imagePath = resolveImagePath(ctx, ctx.expand(imageParam));
  const confidence = confidenceParam ? parseInt(ctx.expand(confidenceParam), 10) : 80;
  const button = parseButton(buttonParam);

  return executeWithTimeoutRetry(ctx, async () => {
    const searchResult = await performImageSearch(imagePath, confidenceThreshold, 1, source);
    ctx.state.setVariable('!IMAGECLICK', searchResult.found ? 'true' : 'false');
    ctx.state.setVariable('!IMAGECLICK_X', searchResult.x);
    ctx.state.setVariable('!IMAGECLICK_Y', searchResult.y);

    if (searchResult.found) {
      highlightFoundImage(searchResult, 'IMAGECLICK');
      await mouseClickService.click({ x: searchResult.x, y: searchResult.y, button });
      return { success: true, ... };
    }
    return { success: false, errorCode: IMACROS_ERROR_CODES.IMAGE_NOT_FOUND, ... };
  }, (r) => r.errorCode === IMACROS_ERROR_CODES.IMAGE_NOT_FOUND);
};
```

### Step-by-step logic (new — full handler)

1. **Service check**: Returns `-902` (`IMAGE_SEARCH_NOT_CONFIGURED`) if either `imageSearchService` or `mouseClickService` is not registered.
2. **Parameter validation**: Requires `IMAGE` parameter. Validates `CONFIDENCE` is 0-100. Validates `BUTTON` is `left`, `right`, `middle`, or `center`.
3. **Resolve image path**: If not absolute, resolves relative to `!FOLDER_DATASOURCE` variable.
4. **Convert confidence**: Converts from percentage (0-100) to decimal (0-1). Default is 80% when not specified.
5. **Set search source**: Hardcoded to `'webpage'` (content area only).
6. **Retry loop**: Uses `executeWithTimeoutRetry()` which reads `!TIMEOUT_TAG` and retries the search at intervals until success or timeout.
7. **Perform search**: Calls `performImageSearch()` which delegates to `imageSearchService.search()` (always POS=1 for IMAGECLICK).
8. **Store variables**: Sets `!IMAGECLICK` (boolean string), `!IMAGECLICK_X`, `!IMAGECLICK_Y`.
9. **Highlight**: On success, calls `highlightFoundImage()` which invokes a registered callback to draw a visual overlay.
10. **Click**: Calls `mouseClickService.click()` at the matched image center coordinates with the specified button.
11. **Error handling**: File-not-found errors (`-903`) are non-retryable. Image-not-found errors (`-927`) are retried. Click failures return `-999` (`SCRIPT_ERROR`). After timeout, `executeWithTimeoutRetry` returns `-930` (`TIMEOUT`).

### Service Architecture

The full handler depends on two pluggable services:

- **`ImageSearchService`** interface: Provided by the native host, implements `search()` for template matching.
- **`MouseClickService`** interface: Provided by the native host (winclick-service), implements `click()` at screen coordinates.
- **`ImageHighlightCallback`**: Registered by the extension for visual overlay feedback.

Services are registered via `setImageSearchService()`, `setMouseClickService()`, `setImageHighlightCallback()`.

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Implementation status** | Not implemented — always throws `UnsupportedCommand("IMAGECLICK")` | Fully implemented with image search + click when native host services are registered | **Major improvement**: Command is now functional |
| **Platform support** | Not supported on any platform (Chrome extension) | Cross-platform when native host provides `ImageSearchService` and `MouseClickService` | **Improvement**: Can work on any platform with suitable backends |
| **Parameters** | None parsed (regex `.*` matches anything, then throws) | `IMAGE` (required), `CONFIDENCE` (optional, default 80), `BUTTON` (optional, default left) | New provides full parameter support |
| **BUTTON parameter** | N/A | Supports `left`, `right`, `middle` (and `center` alias) | **Enhancement**: Multi-button click support |
| **CONFIDENCE default** | N/A | 80% when not specified | Sensible default |
| **Variables stored** | None | `!IMAGECLICK`, `!IMAGECLICK_X`, `!IMAGECLICK_Y` | **Enhancement**: Click results available to macro |
| **Retry mechanism** | N/A | `executeWithTimeoutRetry()` reads `!TIMEOUT_TAG`, retries until found or timeout | Consistent with IMAGESEARCH and TAG commands |
| **Visual highlight** | N/A | Green overlay via `ImageHighlightCallback` on found image | Visual feedback matching IMAGESEARCH |
| **Error codes** | Generic unsupported command error | `-902` (no service), `-903` (file error), `-927` (not found), `-930` (timeout), `-999` (click failed) | Detailed error reporting |
| **Fallback handler** | N/A | `unsupported.ts` provides graceful `-901` error when native host not available | Better error message than old `UnsupportedCommand` |
| **Image path resolution** | N/A | Relative paths resolved against `!FOLDER_DATASOURCE` | Same pattern as IMAGESEARCH |
| **Async model** | Synchronous throw | `async/await` with Promise-based service calls | Modern async architecture |

## Output / Side Effects

### Variables Modified

| Variable | Type | Description |
|----------|------|-------------|
| `!IMAGECLICK` | String (`"true"` / `"false"`) | Whether the image was found and clicked |
| `!IMAGECLICK_X` | Number | X coordinate where click occurred (image center) |
| `!IMAGECLICK_Y` | Number | Y coordinate where click occurred (image center) |

**Note**: The old implementation does not set any variables — it always throws before execution.

### Side Effects

- **Mouse click**: Clicks at the matched image center coordinates using the native mouse service
- **Visual highlight**: Green overlay drawn on the matched region via callback
- **Native service calls**: Delegates to `imageSearchService.search()` and `mouseClickService.click()`

## Test Coverage

### Command handler tests (`tests/unit/commands/image-recognition.test.ts`)

| Test | Line |
|------|------|
| Returns `-902` when image search service is not available | 463 |
| Returns `-902` when mouse click service is not available | 475 |
| Requires IMAGE parameter | 501 |
| Uses default confidence of 80 when not specified | 511 |
| Uses custom confidence when specified | 524 |
| Validates BUTTON parameter | 538 |
| Searches and clicks on found image, stores variables | 551 |
| Clicks with right button when BUTTON=right | 570 |
| Clicks with middle button when BUTTON=middle | 585 |
| Returns TIMEOUT (-930) after retries when not found | 600 |
| Retries and succeeds if image appears during retry | 616 |
| Returns IMAGE_FILE_NOT_FOUND (-903) for file errors (non-retryable) | 638 |
| Returns error when click fails | 654 |
| Handles image search errors gracefully | 669 |
| Triggers highlight callback when image is found | 685 |
| Passes source=webpage to search service | 704 |

### Parser tests (`tests/unit/parser.test.ts`)

| Test | Line |
|------|------|
| Parses IMAGECLICK command | 805 |
| Included in supported commands list | 887 |

### Integration tests (`tests/unit/commands/image-recognition.test.ts`)

| Test | Line |
|------|------|
| Executes IMAGECLICK command in macro via executor | 764 |

### Unsupported handler tests (`tests/unit/unsupported-commands.test.ts`)

| Test | Line |
|------|------|
| IMAGECLICK listed in unsupported commands | 102 |
| IMAGECLICK handler returns unsupported error | 147 |
| IMAGECLICK handler overridable by image-recognition handler | 324 |
