# REDIAL Command Comparison

## Syntax

```
REDIAL [CONNECTION=<name>]
```

**Old regex**: `".*"` — matches any arguments (but none are used; immediately throws `UnsupportedCommand`)

**New parser**: No-parameter command — `parser.ts:945` accepts REDIAL with no parameter validation (the `break` case in validation means any trailing text is ignored).

## Parameters

| Parameter | Position | Required | Values | Description |
|-----------|----------|----------|--------|-------------|
| CONNECTION | named | No | Any string | Name of the dial-up/VPN connection to redial |

Note: The old implementation ignores all parameters (throws immediately). The new system handler reads `CONNECTION` as an optional parameter for logging/future use.

## Old Implementation (MacroPlayer.js:1732-1735)

```javascript
MacroPlayer.prototype.RegExpTable["redial"] = ".*";

MacroPlayer.prototype.ActionTable["redial"] = function (cmd) {
    throw new UnsupportedCommand("REDIAL");
};
```

The `UnsupportedCommand` error constructor (MacroPlayer.js:24-29):

```javascript
function UnsupportedCommand(msg) {
    this.message = "command " + msg +
        " is not supported in the current version";
    this.name = "UnsupportedCommand";
    this.errnum = 912;
}
UnsupportedCommand.prototype = Error.prototype;
```

### Step-by-step logic (old)

1. **Parse**: Regex `".*"` matches any argument string (greedy, including empty).
2. **Execute**: Immediately throws `UnsupportedCommand("REDIAL")`.
3. **Error**: Error message = `"command REDIAL is not supported in the current version"`, error number = `912`.

### Key details (old)

- REDIAL was **always** unsupported in the iMacros 8.9.7 Chrome/Firefox extension
- The regex `".*"` accepts any trailing text but it is never inspected — the command throws unconditionally
- Error code `912` was the standard "unsupported command" error in the original iMacros
- Originally designed for dial-up/VPN network reconnection at the OS level (iMacros desktop editions)
- The `CONNECTION` parameter documented in iMacros reference was never parsed in the Chrome extension

## New Implementation

The new implementation has two layers:

### 1. System handler (system.ts:790-835)

```typescript
export const redialHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const connectionParam = ctx.getParam('CONNECTION');
  const connectionName = connectionParam ? ctx.expand(connectionParam) : undefined;

  ctx.log('info', connectionName
    ? `Redialing connection: ${connectionName}`
    : 'Redialing network connection...'
  );

  if (!networkManager) {
    ctx.log('warn', 'No network manager configured - REDIAL command requires OS-specific implementation');
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: 'REDIAL command requires OS-specific native support. No network manager configured.',
    };
  }

  try {
    const success = await networkManager.redial();

    if (success) {
      ctx.log('info', 'Network reconnected successfully');
      return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
    } else {
      ctx.log('warn', 'Failed to redial network connection');
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
        errorMessage: 'Failed to redial network connection',
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    ctx.log('error', `Redial failed: ${errorMessage}`);
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: `Redial failed: ${errorMessage}`,
    };
  }
};
```

### 2. Unsupported handler override (unsupported.ts:156-159)

```typescript
export const redialUnsupportedHandler: CommandHandler = createUnsupportedHandler(
  'REDIAL',
  'Network redial requires OS-specific native support'
);
```

The unsupported handlers are registered **after** the system handlers and override them, so in the extension context the unsupported handler is the one that actually runs.

### Step-by-step logic (new — active path via unsupported handler)

1. **Log**: Logs `'Unsupported command: REDIAL - Network redial requires OS-specific native support'` at warn level.
2. **Return error**: Returns `{ success: false, errorCode: -915, errorMessage: 'REDIAL is not supported: Network redial requires OS-specific native support' }`.

### Step-by-step logic (new — system handler, for future use with native host)

1. **Read CONNECTION param**: Gets optional `CONNECTION` parameter, expands variables if present.
2. **Log**: Logs `'Redialing connection: <name>'` or `'Redialing network connection...'` at info level.
3. **Check network manager**: If `networkManager` is `null` (no OS-specific implementation configured), returns `SCRIPT_ERROR` (-991).
4. **Call redial**: Awaits `networkManager.redial()` which returns a boolean.
5. **Success path**: If `true`, logs success and returns `{ success: true, errorCode: 0 }`.
6. **Failure path**: If `false`, logs warning and returns `SCRIPT_ERROR`.
7. **Error handling**: Catches exceptions from the network manager, extracts message (handles both `Error` instances and non-Error thrown values), returns `SCRIPT_ERROR`.

### Key details (new)

- The `NetworkManager` interface (`system.ts:209-219`) defines `disconnect(): Promise<boolean>` and `redial(): Promise<boolean>`
- `networkManager` is module-level state, set via `setNetworkManager()` — designed for dependency injection from native host
- The unsupported handler override in `unsupported.ts` takes priority in the extension context
- The system handler in `system.ts` is future-proofed for when a native host provides network management capabilities
- Unlike DISCONNECT, the REDIAL system handler reads the `CONNECTION` parameter for logging purposes
- Registered in `systemHandlers` map at `system.ts:848` as `REDIAL: redialHandler`
- Overridden in `unsupportedHandlers` map at `unsupported.ts:209` as `REDIAL: redialUnsupportedHandler`

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Behavior** | Always throws `UnsupportedCommand` | Returns `UNSUPPORTED_COMMAND` error result (extension context) | **Compatible**: Both reject the command as unsupported |
| **Error code** | `errnum = 912` | `errorCode = -915` (`UNSUPPORTED_COMMAND`) | **Minor difference**: Different numeric codes. Old uses positive `912`, new uses negative `-915`. Both indicate "unsupported command" semantically |
| **Error message** | `"command REDIAL is not supported in the current version"` | `"REDIAL is not supported: Network redial requires OS-specific native support"` | **Minor difference**: Different message text, same meaning |
| **Error mechanism** | Throws exception (synchronous) | Returns structured `CommandResult` (async) | **Structural**: New uses non-throwing error handling pattern |
| **CONNECTION param** | Ignored (regex `".*"` accepts but never parses) | Parsed and logged by system handler; ignored by unsupported handler | **Enhancement**: New system handler reads CONNECTION for future use |
| **Future extensibility** | None — hardcoded throw | System handler supports pluggable `NetworkManager` interface | **Enhancement**: New can support actual network redial via native host in the future |
| **Logging** | None | Warns at `warn` level about unsupported command | **Enhancement**: Better observability |
| **Handler layering** | Single `ActionTable` entry | Two handlers: `redialHandler` (system.ts) overridden by `redialUnsupportedHandler` (unsupported.ts) | **Structural**: Layered architecture allows selective enablement |
| **Async model** | Synchronous | Async (`Promise<CommandResult>`) | **Structural**: Consistent with new async command pattern |

## Output / Side Effects

- **Variables modified**: None
- **Return value**: Both old and new return an error (unsupported command)
- **Side effects**: None — the command does not perform any network operations in either implementation
- **No `!EXTRACT` or other output**: REDIAL produces no extract data

## Test Coverage

### Parser tests (`tests/unit/parser.test.ts`)
- Parses `REDIAL` as REDIAL type (line 820-822)
- Included in supported commands list (line 888)

### Unit tests — system handler (`tests/unit/system-handlers.test.ts`)
- Succeeds with mock network manager returning `true` (line 1249-1261)
- `REDIAL CONNECTION=vpn1` succeeds with named connection (line 1263-1275)
- Returns `SCRIPT_ERROR` when network manager returns `false` (line 1277-1289)
- Returns `SCRIPT_ERROR` when network manager throws (line 1291-1304)
- Returns `SCRIPT_ERROR` when no network manager configured (line 1305-1309)
- Direct handler invocation succeeds when manager returns `true` (line 1313-1323)
- Direct handler invocation returns `SCRIPT_ERROR` when manager returns `false` (line 1327-1338)
- Direct handler invocation returns `SCRIPT_ERROR` when manager throws (line 1341-1354)
- `REDIAL CONNECTION` param is logged via handler (line 1356-1370)
- Handler registration includes REDIAL (line 1418)
- Registered REDIAL handler matches `redialHandler` export (line 1490-1498)
- `redialHandler` is a function (line 1525-1527)

### Unit tests — branch coverage (`tests/unit/commands/system.test.ts`)
- Handles non-Error thrown value (string) from network manager (line 254-266)
- Handles non-Error thrown value (number) from network manager (line 269-280)
- Handler registration includes REDIAL (lines 310, 335)

### Unit tests — unsupported handler (`tests/unit/unsupported-commands.test.ts`)
- REDIAL returns `UNSUPPORTED_COMMAND` error via executor (line 246-255)
- `redialUnsupportedHandler` is included in exported handler map (line 110, 135, 332)
