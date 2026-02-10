# VERSION Command Comparison

## Syntax

```
VERSION BUILD=<min-version> RECORDER=<recorder-type>
VERSION BUILD=<min-version>
VERSION
```

**Old regex**: `"^(?:build\\s*=\\s*(\\S+))?(?:\\s+recorder\\s*=\\s*(\\S+))?\\s*$"` — Both `BUILD` and `RECORDER` are optional. Captures: group 1 = build value, group 2 = recorder value.

**New parser**: `parser.ts:583-598` — Generic key=value parsing. `parseVersionInfo()` extracts `BUILD` and `RECORDER` from parsed parameters and stores them on the `MacroParseResult.version` object.

## Parameters

| Parameter | Position | Required | Values | Description |
|-----------|----------|----------|--------|-------------|
| BUILD | Named | No | Version string (e.g. `7500718`, `8.9.7`) | Minimum required version for the macro |
| RECORDER | Named | No | String (e.g. `FX`, `CR`) | Recorder type that created the macro (informational only) |

## Old Implementation (MacroPlayer.js:3279-3283)

### Regex

```javascript
MacroPlayer.prototype.RegExpTable["version"] =
    "^(?:build\\s*=\\s*(\\S+))?" +
    "(?:\\s+recorder\\s*=\\s*(\\S+))?\\s*$";
```

Capture groups:
- `cmd[1]`: The BUILD value (e.g. `"7500718"`) or `undefined`
- `cmd[2]`: The RECORDER value (e.g. `"FX"`) or `undefined`

### Action handler

```javascript
MacroPlayer.prototype.ActionTable["version"] = function (cmd) {
    // Empty function body — no-op
};
```

### Step-by-step logic (old)

1. **Parse**: Regex optionally captures BUILD and RECORDER values.
2. **Execute**: The action handler is a **no-op** — the function body is empty.
3. No version checking is performed. The BUILD parameter is parsed but completely ignored at runtime.
4. The RECORDER parameter is also parsed but ignored.

### Key details (old)

- The VERSION command is effectively a **no-op** in the original implementation
- BUILD and RECORDER values are parsed by the regex but the action handler does nothing with them
- No variables are set
- No version comparison is performed
- No error is ever thrown
- The regex allows bare `VERSION` (both groups are optional with `?`)
- Commonly appears as the first line in recorded macros (e.g. `VERSION BUILD=7500718 RECORDER=FX`)
- Serves as metadata/documentation only — indicates which iMacros version recorded the macro

## New Implementation (system.ts:253-301)

### Handler

```typescript
export const versionHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const buildParam = ctx.getParam('BUILD');

  // Store version info in variables
  ctx.state.setVariable('!VERSION', versionInfo.version);
  ctx.state.setVariable('!VERSION_MAJOR', versionInfo.major);
  ctx.state.setVariable('!VERSION_MINOR', versionInfo.minor);
  ctx.state.setVariable('!VERSION_PATCH', versionInfo.patch);
  ctx.state.setVariable('!PLATFORM', versionInfo.platform);

  ctx.log('info', `iMacros version ${versionInfo.version} (${versionInfo.platform})`);

  if (buildParam) {
    const requiredVersion = ctx.expand(buildParam);
    const parseVersion = (v: string): number[] =>
      v.split('.').map(n => parseInt(n, 10) || 0);

    const current = parseVersion(versionInfo.version);
    const required = parseVersion(requiredVersion);

    for (let i = 0; i < Math.max(current.length, required.length); i++) {
      const c = current[i] || 0;
      const r = required[i] || 0;
      if (c < r) return { success: false, errorCode: SCRIPT_ERROR,
        errorMessage: `This macro requires iMacros version ${requiredVersion} or higher. Current version: ${versionInfo.version}` };
      if (c > r) break;
    }
  }

  return { success: true, errorCode: OK, output: versionInfo.version };
};
```

### Version info module (system.ts:25-63)

```typescript
export interface VersionInfo {
  major: number;
  minor: number;
  patch: number;
  version: string;
  build?: string;
  platform: string;
}

let versionInfo: VersionInfo = {
  major: 8, minor: 9, patch: 7,
  version: '8.9.7',
  platform: 'firefox',
};

export function setVersionInfo(info: Partial<VersionInfo>): void { ... }
export function getVersionInfo(): VersionInfo { ... }
```

### Parser-level extraction (parser.ts:583-598)

```typescript
function parseVersionInfo(commands: ParsedCommand[]): { build?: string; recorder?: string } | undefined {
  const versionCmd = commands.find(cmd => cmd.type === 'VERSION');
  if (!versionCmd) return undefined;
  const result: { build?: string; recorder?: string } = {};
  for (const param of versionCmd.parameters) {
    if (param.key.toUpperCase() === 'BUILD') result.build = param.value;
    else if (param.key.toUpperCase() === 'RECORDER') result.recorder = param.value;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
```

The parser extracts VERSION metadata into `MacroParseResult.version` (with `build` and `recorder` fields), making it available for inspection without executing the macro.

### Step-by-step logic (new)

1. **Parse**: Generic key=value parser extracts BUILD and RECORDER parameters. Parser also stores version metadata on the parse result.
2. **Set variables**: Stores `!VERSION`, `!VERSION_MAJOR`, `!VERSION_MINOR`, `!VERSION_PATCH`, and `!PLATFORM` in state (though these are not recognized system variables, so `setVariable()` silently drops them).
3. **Log**: Logs the current version and platform.
4. **BUILD comparison** (if BUILD param present):
   a. Expands variables in the BUILD value.
   b. Parses both current and required version strings by splitting on `.` and converting to integers.
   c. Compares segment by segment. If current < required at any segment, returns `SCRIPT_ERROR`. If current > required, breaks early (success).
   d. Missing segments are treated as `0` (e.g. `8.9.7` vs `8.9.7.0` are equal).
5. **Return**: Returns success with the version string as output.

### Key details (new)

- **Not a no-op**: Actively performs version comparison when BUILD is specified
- Returns `SCRIPT_ERROR` if current version is lower than required BUILD version
- Supports variable expansion in BUILD parameter (e.g. `VERSION BUILD={{!VAR1}}`)
- Attempts to set version-related system variables, but they are silently dropped by the variable context
- RECORDER parameter is parsed at the parser level but not used by the handler
- Returns `versionInfo.version` as the command output string
- Default version info can be overridden via `setVersionInfo()` (e.g. by the host environment)
- Supports arbitrary-length version strings (e.g. `8.9.7.1`) with zero-padding for comparison
- Async handler returning `Promise<CommandResult>` (non-throwing)

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Action handler** | Empty function (no-op) | Active: sets variables, compares versions, returns output | **Enhancement**: New implementation adds real functionality |
| **BUILD comparison** | Not performed — BUILD value is parsed but ignored | Compares current vs required, returns SCRIPT_ERROR if too low | **Enhancement**: Enforces minimum version requirements |
| **RECORDER handling** | Parsed by regex, ignored by handler | Parsed at parser level into `MacroParseResult.version.recorder`, ignored by handler | **Compatible**: Both ignore RECORDER at execution time |
| **Variables set** | None | Attempts `!VERSION`, `!VERSION_MAJOR`, `!VERSION_MINOR`, `!VERSION_PATCH`, `!PLATFORM` (silently dropped) | **No impact**: Variables are attempted but not stored due to variable context restrictions |
| **Return value** | `undefined` (implicit) | `{ success: true, output: versionInfo.version }` | **Enhancement**: Explicit success/output |
| **Version metadata** | Only available via regex capture groups during parsing | Available on `MacroParseResult.version` object after parsing | **Enhancement**: Structured access to version metadata |
| **Variable expansion** | Not applicable (handler is no-op) | BUILD value is expanded (e.g. `{{!VAR1}}`) before comparison | **Enhancement**: Dynamic version checking |
| **Error on version mismatch** | Never errors | Returns `SCRIPT_ERROR` with descriptive message | **Behavioral change**: Macros requiring a higher version will now fail instead of silently proceeding |
| **Bare VERSION** | Valid (regex allows empty match) | Valid (no required parameters) | **Compatible**: Both accept `VERSION` with no parameters |
| **Version string format** | BUILD values like `7500718` (build number) | BUILD values like `8.9.7` (semver-style) | **Format difference**: Old macros may use integer build numbers which won't match semver comparison |

## Output / Side Effects

- **Variables modified (old)**: None
- **Variables modified (new)**: Attempts `!VERSION`, `!VERSION_MAJOR`, `!VERSION_MINOR`, `!VERSION_PATCH`, `!PLATFORM` (currently silently dropped by variable context)
- **Return value (old)**: `undefined` — handler returns nothing
- **Return value (new)**: `CommandResult` with `success: true`, `output: versionInfo.version` (or `success: false` on version mismatch)
- **Side effects (old)**: None
- **Side effects (new)**: Logs version info to the context logger

## Test Coverage

### Parser tests (`tests/unit/parser.test.ts`)
- Parses `VERSION BUILD=7500718` — extracts `version.build` (line 122-125)
- Parses `VERSION BUILD=7500718 RECORDER=FX` — extracts both `version.build` and `version.recorder` (line 127-131)
- Parses `VERSION BUILD=8031994` with extra whitespace (line 133-136)
- Returns `undefined` version when no VERSION command present (line 138-141)
- Included in supported commands list (line 878)
- Parses real-world macros starting with VERSION (lines 1400-1477)
- Handles BOM character before VERSION (line 1237)

### Integration tests (`tests/integration/commands/version.test.ts`)
- VERSION without BUILD param succeeds and returns version string (lines 60-65)
- VERSION BUILD=8.0.0 succeeds (current 8.9.7 >= 8.0.0) (lines 70-75)
- VERSION BUILD=8.9.7 succeeds (equal version) (lines 80-85)
- VERSION BUILD=9.0.0 returns SCRIPT_ERROR (current too low) (lines 90-95)
- VERSION BUILD=8.9.8 returns SCRIPT_ERROR (patch too low) (lines 100-105)
- VERSION BUILD=8.10.0 returns SCRIPT_ERROR (minor too low) (lines 110-115)
- VERSION BUILD=7.0.0 succeeds (major version higher) (lines 120-125)
- setVersionInfo overrides version for BUILD comparison (lines 130-144)
- Variable expansion in BUILD parameter via `{{!VAR1}}` (lines 149-161)
- VERSION returns version string as output (lines 166-201)

### Unit tests (`tests/unit/commands/system.test.ts`)
- BUILD with more segments than current pads with 0 (e.g. 8.9.7 vs 8.9.7.0) (line 106-113)
- BUILD with more segments fails when extra segment is non-zero (e.g. 8.9.7.1) (line 117-125)
- Current version with more segments passes (e.g. 8.9.7.5 vs 8.9.7) (line 127-135)
- registerSystemHandlers skips undefined VERSION handler (lines 288-315)
