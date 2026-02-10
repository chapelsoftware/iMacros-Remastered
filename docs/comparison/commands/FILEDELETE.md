# FILEDELETE Command Comparison

## Syntax

```
FILEDELETE NAME=<filename>
```

**Old regex**: `^name\s*=\s*(<im_strre>)\s*$`
- Single capture group: NAME (group 1)
- `im_strre` matches quoted strings (with escape sequences), `eval()` expressions, or non-whitespace sequences

**New parser**: Key-value parameter command — `parser.ts:861-872` validates that the NAME parameter is present. Parsed as a standard key-value pair.

## Parameters

| Parameter | Required | Values | Description |
|-----------|----------|--------|-------------|
| NAME | Yes | File path or filename | Path to the file to delete |

## Old Implementation (MacroPlayer.js:781-792)

```javascript
MacroPlayer.prototype.RegExpTable["filedelete"] =
    "^name\\s*=\\s*("+im_strre+")\\s*$";

MacroPlayer.prototype.ActionTable["filedelete"] = function (cmd) {
    var param = imns.unwrap(this.expandVariables(cmd[1])), file;
    if (param.indexOf(imns.FIO.psep) == -1 ) {
        var file = imns.Pref.getFilePref("defdownpath");
        file.append(param);
    } else
        file = imns.FIO.openNode(param);
    file.remove(false);
};
```

### Step-by-step logic (old)

1. **Parse parameter**: Regex captures the NAME value (group 1). Variable expansion via `this.expandVariables()`, then `imns.unwrap()` strips surrounding quotes if present.
2. **Resolve relative paths**: Checks if the path contains the platform path separator (`imns.FIO.psep`). If **no** separator is found, the filename is treated as relative and appended to the default download path (`defdownpath`). Otherwise, the full path is opened directly via `imns.FIO.openNode()`.
3. **Delete file**: Calls `file.remove(false)` — the `false` parameter means non-recursive deletion (directories must be empty). This is Mozilla's `nsIFile.remove()` API.
4. **Error handling**: No explicit error handling — if the file doesn't exist or `remove()` fails, the exception propagates up to the macro player's generic error handler.

### Key details

- **Path separator check**: Uses `imns.FIO.psep` which is the OS-specific path separator (e.g., `/` on Unix, `\` on Windows). Only checks for this single separator character, not both.
- **`remove(false)`**: The `false` argument to `nsIFile.remove()` means non-recursive — if the path is a directory, it must be empty to be deleted.
- **No validation**: No check for empty path, file existence, or permissions before calling `remove()`.

## New Implementation

### Command Handler (files.ts:159-226)

```typescript
export const filedeleteHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const nameParam = ctx.getParam('NAME');

  if (!nameParam) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'FILEDELETE requires NAME parameter',
    };
  }

  let filePath = ctx.expand(nameParam);

  if (!filePath || filePath.trim() === '') {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
      errorMessage: 'FILEDELETE NAME parameter cannot be empty',
    };
  }

  // Resolve relative paths (no path separators) relative to !FOLDER_DOWNLOAD
  if (!filePath.includes('/') && !filePath.includes('\\')) {
    const downloadFolder = ctx.state.getVariable('!FOLDER_DOWNLOAD');
    if (downloadFolder && typeof downloadFolder === 'string') {
      filePath = `${downloadFolder}/${filePath}`;
    }
  }

  ctx.log('info', `Deleting: ${filePath}`);

  const response = await sendFileMessage(
    { type: 'fileDelete', path: filePath },
    ctx
  );

  if (!response.success) {
    let errorCode: IMacrosErrorCode = IMACROS_ERROR_CODES.FILE_ERROR;
    const errorLower = (response.error || '').toLowerCase();

    if (errorLower.includes('not found') || errorLower.includes('enoent')) {
      errorCode = IMACROS_ERROR_CODES.FILE_NOT_FOUND;
    } else if (errorLower.includes('permission') || errorLower.includes('access') || errorLower.includes('eacces')) {
      errorCode = IMACROS_ERROR_CODES.FILE_ACCESS_DENIED;
    }

    return {
      success: false,
      errorCode,
      errorMessage: response.error || `Failed to delete: ${filePath}`,
    };
  }

  ctx.log('info', `Deleted: ${filePath}`);

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
    output: filePath,
  };
};
```

### Message Bridge (files.ts:114-140)

The handler delegates the actual file deletion to a `FileBridge` via message passing:
```typescript
async function sendFileMessage(
  message: FileMessagePayload,
  ctx: CommandContext
): Promise<FileOperationResponse>
```

If no bridge is configured, returns a failure with an error message. If the bridge throws an exception, catches it and returns a failure response.

### Step-by-step logic (new)

1. **Validate NAME parameter**: Returns `MISSING_PARAMETER` if NAME is not provided. Returns `INVALID_PARAMETER` if NAME expands to an empty/whitespace string.
2. **Expand variables**: Calls `ctx.expand(nameParam)` to resolve `{{variable}}` references.
3. **Resolve relative paths**: Checks if the path contains **either** `/` or `\`. If neither is found, prepends `!FOLDER_DOWNLOAD` value (if set and non-empty) with a `/` separator. If `!FOLDER_DOWNLOAD` is not set, the bare filename is passed through as-is.
4. **Send delete message**: Sends a `fileDelete` message to the file bridge (native host) with the resolved path.
5. **Map error codes**: On failure, inspects error message text to map to specific error codes:
   - "not found" / "enoent" → `FILE_NOT_FOUND`
   - "permission" / "access" / "eacces" → `FILE_ACCESS_DENIED`
   - Other errors → `FILE_ERROR`
6. **Return result**: On success, returns `OK` with the file path as output.

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Path separator check** | Checks only `imns.FIO.psep` (OS-specific single separator) | Checks for both `/` and `\` | **Enhancement**: Cross-platform — works regardless of OS path convention. |
| **Relative path base** | Resolves to `defdownpath` (default download path preference) | Resolves to `!FOLDER_DOWNLOAD` variable | **Equivalent**: Both resolve to the configured download folder. The new version uses the variable system instead of a preference API. |
| **Empty NAME validation** | No validation — would crash on `openNode()` or `remove()` | Returns `MISSING_PARAMETER` or `INVALID_PARAMETER` error | **Improvement**: Graceful error handling instead of uncaught exceptions. |
| **File I/O** | Direct filesystem via `nsIFile.remove(false)` | Message passing to native host via `FileBridge` | **Structural**: Chrome extensions can't access the filesystem directly; uses native messaging. |
| **Non-recursive delete** | Explicit `file.remove(false)` — directories must be empty | Delegated to native host (behavior depends on implementation) | **Potential difference**: Old explicitly passes non-recursive flag; new relies on native host behavior. |
| **Error handling** | No error handling — exceptions propagate to generic handler | Structured error codes: `FILE_NOT_FOUND`, `FILE_ACCESS_DENIED`, `FILE_ERROR` | **Improvement**: Granular, non-throwing error handling with specific error codes. |
| **No bridge configured** | N/A (direct filesystem access) | Returns failure with descriptive error message | **Structural**: Handles missing native host gracefully. |
| **Logging** | None | Logs `"Deleting: <path>"` and `"Deleted: <path>"` at info level | **Improvement**: Observability. |
| **Return value** | No return value | Returns file path as `output` on success | **Enhancement**: Caller can access the deleted file path. |
| **Async model** | Synchronous | Async with `await` | **Structural**: Consistent with message-passing architecture. |
| **Command registration** | `ActionTable["filedelete"]` (lowercase) | `fileHandlers.FILEDELETE` (uppercase) | Internal naming convention only. |

## Output / Side Effects

- **File deletion**: Removes the specified file from the filesystem
- **Variables modified**: None
- **Return data**: New returns the deleted file path via `output` field; old returns nothing

## Test Coverage

### Parser tests (`tests/unit/parser.test.ts`)
- Parses `FILEDELETE NAME=temp.txt` — type is `'FILEDELETE'` (line 711)
- Included in supported commands list (line 882)

### Integration tests (`tests/integration/commands/filedelete.test.ts`)

**Basic success cases:**
- `FILEDELETE NAME=/tmp/test.txt` sends fileDelete with correct path (line 44)
- `FILEDELETE NAME=output.csv` sends fileDelete with correct path (line 57)
- Returns file path as output on success (line 70)

**Variable expansion:**
- Expands `!VAR1` in NAME parameter via `SET` then `FILEDELETE NAME={{!VAR1}}` (line 86)
- Expands multiple variables: `SET !VAR1` + `SET !VAR2` + `FILEDELETE NAME={{!VAR1}}/{{!VAR2}}` (line 104)

**Relative path resolution:**
- Filename without separators resolves relative to `!FOLDER_DOWNLOAD` (line 126)
- Absolute Unix path `/tmp/file.txt` is not resolved even when `!FOLDER_DOWNLOAD` is set (line 142)
- Path with forward slash `subdir/file.txt` is not resolved (line 158)
- Path with backslash `subdir\file.txt` is not resolved (line 174)
- Bare filename passed as-is when `!FOLDER_DOWNLOAD` is empty (line 190)

**Parameter validation:**
- Missing NAME returns `MISSING_PARAMETER` (line 205)
- Empty NAME (`NAME=`) returns `MISSING_PARAMETER` (line 214)
- NAME expanding to empty (`NAME={{!VAR1}}` with unset var) returns `INVALID_PARAMETER` (line 224)

**No bridge configured:**
- Returns failure when no file bridge is configured (line 240)

**Bridge error mapping:**
- "not found" error → `FILE_NOT_FOUND` (line 258)
- "enoent" error → `FILE_NOT_FOUND` (line 270)
- "permission denied" error → `FILE_ACCESS_DENIED` (line 282)
- "access denied" error → `FILE_ACCESS_DENIED` (line 294)
- Generic "disk I/O failure" → `FILE_ERROR` (line 306)

**Bridge exceptions:**
- Bridge throwing exception → `FILE_ERROR` (line 322)
