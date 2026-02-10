# ONDOWNLOAD Command Comparison

## Syntax

```
ONDOWNLOAD FOLDER=<path> FILE=<filename>
ONDOWNLOAD FOLDER=* FILE=* WAIT=YES
ONDOWNLOAD FOLDER=<path> FILE=+_suffix WAIT=NO
ONDOWNLOAD FOLDER=<path> FILE=<filename> CHECKSUM=MD5:<hash>
ONDOWNLOAD FOLDER=<path> FILE=<filename> CHECKSUM=SHA1:<hash>
```

**Old regex**: `^folder\s*=\s*(<im_strre>)\s+file\s*=\s*(<im_strre>)(?:\s+wait\s*=(yes|no|true|false))?(?:\s+checksum\s*=(md5|sha1):(\S+))?\s*$`
- Capture groups: (1) FOLDER value, (2) FILE value, (3) optional WAIT value, (4) optional checksum algorithm, (5) optional checksum hash
- `im_strre` matches quoted strings (with escape sequences), `eval(...)` expressions, or non-whitespace tokens

**New parser**: Validates FOLDER and FILE parameters are present (parser.ts:742-753). Returns validation error if both are missing.

## Parameters

| Parameter | Description | Old | New |
|-----------|-------------|-----|-----|
| FOLDER | Download destination folder path | Required; `*` = browser default (`defdownpath` pref); non-`*` creates directory if missing | Required; `*` = browser default (sent as `undefined` to bridge); non-`*` validated for null bytes |
| FILE | Download filename | Required; `*` = auto from URL/title; `+suffix` = auto with suffix appended; validated against illegal chars | Required; `+` = auto-generate (sent as `undefined` to bridge); validated against `[<>:"/\\|?*\x00-\x1F]` |
| WAIT | Wait for download to complete | Optional; defaults to `true`; accepts `yes/no/true/false` (case-insensitive) | Optional; defaults to `true`; accepts `YES/NO` (checks `!== 'NO'`) |
| CHECKSUM | Verify downloaded file hash | Optional; format `md5:<hash>` or `sha1:<hash>` captured as two groups; requires `WAIT=YES` else throws BadParameter | Optional; format `MD5:<hash>` or `SHA1:<hash>`; parsed and validated (algorithm, hex format, length); no explicit WAIT requirement |

## Old Implementation (MacroPlayer.js:1163-1228)

```javascript
MacroPlayer.prototype.RegExpTable["ondownload"] =
    "^folder\\s*=\\s*("+im_strre+")\\s+"+
    "file\\s*=\\s*("+im_strre+")"+
    "(?:\\s+wait\\s*=(yes|no|true|false))?"+
    "(?:\\s+checksum\\s*=(md5|sha1):(\\S+))?"+
    "\\s*$";

MacroPlayer.prototype.ActionTable["ondownload"] = function (cmd) {
    var storage = imns.storage;
    var obj = new Object();
    var wait = true;
    var folder = imns.unwrap(this.expandVariables(cmd[1]));
    var file = imns.unwrap(this.expandVariables(cmd[2]));
    obj.accept = true;
    if (folder != "*") {
        try {
            var f = imns.FIO.openNode(folder);
            if (!f.exists())
                imns.FIO.makeDirectory(folder);
        } catch (e) {
            var reason = "";
            if (/ACCESS_DENIED/.test(e.toString()))
                reason = " access denied";
            throw new RuntimeError("can not open ONDOWNLOAD folder: '"+
                                   folder+"'"+reason, 932);
        }
    }
    if (file != "*") {
        var re = null;
        if (imns.is_windows()) {
            re = /[\\\?\*\/\|\0]/;
        } else {
            re = /[\?\*\/\|\0]/;
        }
        if (re.test(file) || /^\.\.?$/.test(file) ) {
            throw new BadParameter("file name contains illegal character(s)");
        }
    }
    obj.folder = folder;
    obj.filename = file;
    obj.timeout = this.delay;
    storage.setObjectForWindow(iMacros.wid, "onDownloadAction", obj);
    this.shouldDownloadPDF = true;
    this.setDownloadDlgFlag();

    if (typeof cmd[3] != "undefined") {
        var param = imns.unwrap(this.expandVariables(cmd[3]));
        wait = /^(?:yes|true)$/i.test(param);
    }
    this.shouldWaitDownload = wait;
    this.downloadFolder = folder;
    this.downloadFilename = file;
    if (typeof cmd[4] != "undefined") {
        if (!wait) {
            throw new BadParameter("CHECKSUM requires WAIT=YES", 3);
        }
        this.downloadCheckAlg = imns.unwrap(this.expandVariables(cmd[4]));
        this.downloadChecksum =
            imns.unwrap(this.expandVariables(cmd[5])).toLowerCase();
    } else {
        this.downloadChecksum = this.downloadCheckAlg = "";
    }
};
```

### Step-by-step logic (old)

1. **Parse FOLDER**: Expand variables in `cmd[1]`, unwrap quotes.
2. **Parse FILE**: Expand variables in `cmd[2]`, unwrap quotes.
3. **Set accept flag**: `obj.accept = true` (always accept the download dialog).
4. **Validate folder**: If not `*`, attempt to open the folder path with `imns.FIO.openNode()`. If it doesn't exist, create it with `imns.FIO.makeDirectory()`. On failure, throw `RuntimeError` with code 932.
5. **Validate filename**: If not `*`, check against illegal characters. On Windows: `[\\\?\*\/\|\0]`; on other platforms: `[\?\*\/\|\0]`. Also reject `.` and `..`. Throws `BadParameter` on violation.
6. **Store action object**: Create object with `folder`, `filename`, `timeout` (from `this.delay` = `!TIMEOUT_STEP`), and `accept=true`. Store in per-window storage as `"onDownloadAction"`.
7. **Set PDF download flag**: `this.shouldDownloadPDF = true`.
8. **Set download dialog flag**: Calls `this.setDownloadDlgFlag()` which starts a timeout. If no download occurs within `4 * tagTimeout` seconds (min 4s), triggers error 804: "ONDOWNLOAD command was used but no download occurred."
9. **Parse WAIT**: If `cmd[3]` defined, expand and test against `/^(?:yes|true)$/i`. Default is `true`.
10. **Store wait and path state**: Sets `this.shouldWaitDownload`, `this.downloadFolder`, `this.downloadFilename` on the player instance.
11. **Parse CHECKSUM**: If `cmd[4]` defined and `wait` is false, throw `BadParameter("CHECKSUM requires WAIT=YES")`. Otherwise store algorithm in `this.downloadCheckAlg` and lowercase hash in `this.downloadChecksum`.

### Download dialog handling (downloadOverlay.js)

When a download dialog appears during playback:

1. **Retrieve action**: `storage.getObjectForWindow(wid, "onDownloadAction")` gets the stored action object.
2. **Resolve filename**: If `*`, uses dialog's default filename (`loc.value`). If `+suffix`, inserts suffix before extension. If no extension on user filename, appends extension from default.
3. **Timer**: Waits `action.timeout` ms, then:
   - Clears the action from storage.
   - Resolves folder: `*` uses `defdownpath` pref, otherwise `imns.FIO.openNode(folder)`.
   - Sanitizes filename: `filename.replace(/\s*[:*?|<>"\/]+\s*/g, "_")`.
   - If `action.accept` is true, calls `dialog.mLauncher.saveToDisk(file, false)` and closes window.
   - Otherwise, cancels the dialog.

### Download monitoring (MacroPlayer.js:3481-3578)

When waiting for download completion (`shouldWaitDownload = true`):

1. **onDownloadAdded**: Registers the download in `downloadArray`, starts an interval timer checking against `this.timeout`. If timeout exceeded, cancels download and throws error 802 ("Download timed out").
2. **onDownloadChanged**: When download completes/stops, removes from `downloadArray`. If `downloadChecksum` is set, calculates file hash with `calculateFileHash()` and compares; mismatch throws error 934. When all downloads complete, calls `playNextAction()`.
3. **onDownloadRemoved**: No-op.

### Key observations (old)

- **Single action, not queued**: Unlike ONDIALOG which builds an array, ONDOWNLOAD stores a single object in per-window storage (each ONDOWNLOAD overwrites the previous).
- **Directory creation**: Actively creates the folder if it doesn't exist.
- **Platform-specific filename validation**: Windows additionally rejects backslash `\` in filenames.
- **Download dialog timeout**: Separate from WAIT timeout — if no download dialog appears within `4 * tagTimeout` seconds, error 804 fires.
- **CHECKSUM requires WAIT**: Explicitly enforced — checksum without `WAIT=YES` throws `BadParameter`.
- **PDF download flag**: Sets `shouldDownloadPDF = true` to intercept PDF content-type downloads.
- **Error codes**: 932 (folder access), 804 (no download occurred), 802 (download timed out), 934 (checksum mismatch).

## New Implementation

### Handler (downloads.ts:408-498 — `ondownloadHandler`)

```typescript
export const ondownloadHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const folderParam = ctx.getParam('FOLDER');
  const fileParam = ctx.getParam('FILE');
  const waitParam = ctx.getParam('WAIT');
  const checksumParam = ctx.getParam('CHECKSUM');

  // Both FOLDER and FILE are required (iMacros 8.9.7 parity)
  if (!folderParam || !fileParam) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'ONDOWNLOAD requires both FOLDER and FILE parameters',
    };
  }

  const folder = ctx.expand(folderParam);
  const file = ctx.expand(fileParam);

  const wait = waitParam ? waitParam.toUpperCase() !== 'NO' : true;

  if (folder !== '*') {
    const folderError = validateFolderPath(folder);
    if (folderError) {
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.DOWNLOAD_FOLDER_ACCESS,
        errorMessage: folderError,
      };
    }
  }

  if (file !== '+') {
    const illegalChar = validateFilename(file);
    if (illegalChar) {
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.DOWNLOAD_INVALID_FILENAME,
        errorMessage: `Illegal character '${illegalChar}' in filename: ${file}`,
      };
    }
  }

  let checksum: string | undefined;
  if (checksumParam) {
    const parsed = parseChecksum(ctx.expand(checksumParam));
    if (typeof parsed === 'string') {
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
        errorMessage: parsed,
      };
    }
    checksum = `${parsed.algorithm}:${parsed.hash}`;
  }

  ctx.state.setVariable(DOWNLOAD_FOLDER_KEY, folder);
  ctx.state.setVariable(DOWNLOAD_FILE_KEY, file);

  const response = await sendDownloadMessage(
    {
      type: 'setDownloadOptions',
      folder: folder === '*' ? undefined : folder,
      file: file === '+' ? undefined : file,
      wait,
      checksum,
    },
    ctx
  );

  if (!response.success) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.DOWNLOAD_ERROR,
      errorMessage: response.error || 'Failed to set download options',
    };
  }

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
  };
};
```

### Step-by-step logic (new)

1. **Get parameters**: Retrieve FOLDER, FILE, WAIT, CHECKSUM from command context via `ctx.getParam()`.
2. **Validate presence**: If either FOLDER or FILE is missing, return `MISSING_PARAMETER` error.
3. **Expand variables**: `ctx.expand()` on FOLDER and FILE values.
4. **Parse WAIT**: If present, `toUpperCase() !== 'NO'` → any value except NO is true. Default is `true`.
5. **Validate folder**: If not `*`, check for null bytes via `validateFolderPath()`. Returns `DOWNLOAD_FOLDER_ACCESS` error on failure.
6. **Validate filename**: If not `+`, check against `ILLEGAL_FILENAME_CHARS` regex (`[<>:"/\\|?*\x00-\x1F]`). Returns `DOWNLOAD_INVALID_FILENAME` error on failure.
7. **Parse CHECKSUM**: If present, expand and parse with `parseChecksum()`. Validates format (`ALGORITHM:hash`), algorithm (MD5 or SHA1), hex format, and hash length (MD5=32, SHA1=40). Returns `INVALID_PARAMETER` on failure.
8. **Store in state**: Sets `!FOLDER_DOWNLOAD` and `!DOWNLOAD_FILE` state variables.
9. **Send to extension**: Sends `setDownloadOptions` message through the download bridge with folder (`undefined` if `*`), file (`undefined` if `+`), wait boolean, and optional checksum string.
10. **Handle response**: If bridge returns failure, return `DOWNLOAD_ERROR`. Otherwise return `OK`.

### Helper: `parseChecksum()` (downloads.ts:369-393)

```typescript
function parseChecksum(value: string): { algorithm: string; hash: string } | string {
  const colonIndex = value.indexOf(':');
  if (colonIndex === -1) return 'CHECKSUM must be in format ALGORITHM:hash...';
  const algorithm = value.substring(0, colonIndex).toUpperCase();
  const hash = value.substring(colonIndex + 1).toLowerCase();
  if (algorithm !== 'MD5' && algorithm !== 'SHA1') return `Unsupported checksum algorithm...`;
  if (!hash || !/^[0-9a-f]+$/.test(hash)) return `Invalid hash value...`;
  const expectedLength = algorithm === 'MD5' ? 32 : 40;
  if (hash.length !== expectedLength) return `Invalid hash length...`;
  return { algorithm, hash };
}
```

### Helper: `validateFilename()` (downloads.ts:292-295)

```typescript
const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/;
function validateFilename(filename: string): string | null {
  const match = filename.match(ILLEGAL_FILENAME_CHARS);
  return match ? match[0] : null;
}
```

### Message flow

```
ondownloadHandler → sendDownloadMessage → DownloadBridge.sendMessage
                                           ↓
                                    Extension background script
                                    (configures download interception via chrome.downloads API)
```

### Data types

```typescript
interface SetDownloadOptionsMessage extends DownloadMessage {
  type: 'setDownloadOptions';
  folder?: string;      // undefined = browser default (FOLDER=*)
  file?: string;        // undefined = auto-generate (FILE=+)
  wait?: boolean;       // Wait for download to complete (default true)
  checksum?: string;    // "MD5:hash" or "SHA1:hash"
}

// State variables set:
const DOWNLOAD_FOLDER_KEY = '!FOLDER_DOWNLOAD';
const DOWNLOAD_FILE_KEY = '!DOWNLOAD_FILE';
```

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **FILE wildcard `*`** | `*` means auto-derive filename from URL or dialog | `*` not treated as special wildcard — only `+` triggers auto-generate | **Behavioral**: Old supports `FILE=*` (derive from URL); new only supports `FILE=+`. Extension bridge must handle `FILE=*` if used |
| **FILE wildcard `+suffix`** | `+suffix` appends suffix to auto-derived filename, preserving extension | `+` (alone) sends `undefined` to bridge; `+suffix` patterns not specially handled by handler (delegated to bridge) | **Structural**: Old resolves filename wildcards in-process; new delegates to extension |
| **Directory creation** | Actively creates missing directories with `imns.FIO.makeDirectory()` | No directory creation — delegates to extension bridge | **Structural**: Old handles filesystem directly; new relies on extension |
| **Folder validation** | Opens folder with `imns.FIO.openNode()`, catches access errors → error 932 | Only checks for null bytes in path | **Behavioral**: Old validates folder exists/is accessible; new performs minimal validation |
| **Filename validation (platform)** | Platform-specific: Windows rejects `\`, all platforms reject `? * / \| \0` and `.`/`..` | Cross-platform: rejects `[<>:"/\\|?*\x00-\x1F]` uniformly | **Behavioral**: New is stricter (always rejects `\`, `<`, `>`, `:`, `"`, control chars); old varies by platform |
| **WAIT parameter values** | Accepts `yes/no/true/false` (case-insensitive regex) | Accepts any value; only `NO` (case-insensitive) → false | **Compatible**: `true`/`false` were valid in old; new treats `true` and `false` as truthy (both ≠ `NO`) — `WAIT=FALSE` would be `true` in new, `false` in old |
| **CHECKSUM + WAIT enforcement** | Explicit: throws `BadParameter("CHECKSUM requires WAIT=YES")` if `wait` is false | No enforcement — checksum accepted regardless of WAIT value | **Behavioral**: Old prevents checksum without wait; new allows it |
| **CHECKSUM validation** | Minimal — regex captures algorithm and hash directly; no length/format validation | Thorough — validates algorithm (MD5/SHA1), hex format, hash length (32/40) | **Enhancement**: New catches invalid checksums early |
| **Download dialog timeout** | `setDownloadDlgFlag()` starts timeout: `4 * tagTimeout` seconds (min 4s). If no download dialog appears → error 804 | No equivalent timeout mechanism — bridge-based approach | **Structural**: Old monitors for expected download dialog; new delegates entirely to extension |
| **Download monitoring** | `onDownloadAdded/Changed/Removed` listeners track download progress, enforce timeout (error 802), verify checksum on completion | Delegated to extension bridge | **Structural**: Old has built-in download lifecycle management; new relies on bridge |
| **PDF download flag** | Sets `this.shouldDownloadPDF = true` to intercept PDF content-type | No equivalent flag | **Structural**: PDF download interception handled differently in new architecture |
| **Storage mechanism** | Per-window storage: `storage.setObjectForWindow(wid, "onDownloadAction", obj)` — single object (not queued) | State variables (`!FOLDER_DOWNLOAD`, `!DOWNLOAD_FILE`) + bridge message | **Structural**: Different storage architecture |
| **Error on missing params** | Regex wouldn't match → falls through to unknown command error | `MISSING_PARAMETER` error result with descriptive message | **Compatible**: Same outcome — command fails |
| **Variable expansion** | `this.expandVariables()` + `imns.unwrap()` on captured groups | `ctx.expand()` on parameter values | **Compatible**: Same behavior, different API |
| **No bridge fallback** | N/A (always has filesystem + storage) | Returns success when no bridge configured (testing mode) | **Enhancement**: Graceful degradation for testing |

## Output / Side Effects

- **Variables modified (new)**: `!FOLDER_DOWNLOAD`, `!DOWNLOAD_FILE`
- **Old player state**: `shouldWaitDownload`, `downloadFolder`, `downloadFilename`, `downloadCheckAlg`, `downloadChecksum`, `shouldDownloadPDF`, `shouldWaitDownloadDlg`
- **Old per-window storage**: Stores `onDownloadAction` object with `folder`, `filename`, `timeout`, `accept`
- **New**: Sends `setDownloadOptions` message through download bridge to extension
- **No DOM side effects** (configuration only — download handling occurs on subsequent commands that trigger downloads)
- **No navigation side effects**

## Test Coverage

### Parser tests (`tests/unit/parser.test.ts`)
- `ONDOWNLOAD FOLDER=* FILE=*` parses with type `ONDOWNLOAD`
- `ONDOWNLOAD FOLDER=* FILE=* WAIT=YES` parses WAIT parameter correctly
- `ONDOWNLOAD FOLDER=* FILE=+_{{!NOW:yyyymmdd_hhnnss}}` parses variable references in FILE
- `ONDOWNLOAD WAIT=YES` (missing FOLDER and FILE) produces validation error

### Integration tests (`tests/integration/commands/ondownload.test.ts`)
- Basic `ONDOWNLOAD FOLDER=/downloads FILE=report.pdf` sends `setDownloadOptions` through executor
- `FOLDER=*` sends folder as `undefined` (browser default)
- `FILE=+` sends file as `undefined` (auto-generate)
- Missing both FOLDER and FILE returns `MISSING_PARAMETER`
- Missing only FOLDER returns `MISSING_PARAMETER`
- Missing only FILE returns `MISSING_PARAMETER`
- WAIT defaults to YES (true) when not specified
- `WAIT=YES` sends `wait=true`
- `WAIT=NO` sends `wait=false`
- Valid MD5 checksum accepted and passed through
- Valid SHA1 checksum accepted and passed through
- Checksum without colon separator rejected
- Unsupported checksum algorithm (SHA256) rejected
- Invalid hex in checksum hash rejected
- MD5 hash with wrong length rejected
- SHA1 hash with wrong length rejected
- Uppercase checksum hash normalized to lowercase
- No checksum → `undefined` in message
- Filename with `<`, `>`, `|`, `?`, `*` characters rejected
- Valid filenames accepted
- `FILE=+` (auto-generate) skips filename validation
- Folder path with null byte rejected
- `FOLDER=*` skips folder validation
- Valid folder paths accepted
- Variable expansion in FOLDER and FILE parameters
- Bridge failure returns `DOWNLOAD_ERROR`
- Bridge exception returns `DOWNLOAD_ERROR`
- No bridge configured returns success (testing mode)
- ONDOWNLOAD followed by SAVEAS sequence works correctly
