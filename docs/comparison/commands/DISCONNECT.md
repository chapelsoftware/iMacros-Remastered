# DISCONNECT Command Comparison

## Syntax

```
DISCONNECT
```

**Old regex**: `".*"` — matches any arguments (but none are used; immediately throws `UnsupportedCommand`)

**New parser**: No-parameter command — `parser.ts:944` accepts DISCONNECT with no parameter validation (the `break` case in validation means any trailing text is ignored).

## Parameters

| Parameter | Position | Required | Values | Description |
|-----------|----------|----------|--------|-------------|
| *(none)* | — | — | — | DISCONNECT takes no parameters |

## Old Implementation (MacroPlayer.js:291-295)

```javascript
MacroPlayer.prototype.RegExpTable["disconnect"] = ".*";

MacroPlayer.prototype.ActionTable["disconnect"] = function (cmd) {
    throw new UnsupportedCommand("DISCONNECT");
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
2. **Execute**: Immediately throws `UnsupportedCommand("DISCONNECT")`.
3. **Error**: Error message = `"command DISCONNECT is not supported in the current version"`, error number = `912`.

### Key details (old)

- DISCONNECT was **always** unsupported in the iMacros 8.9.7 Chrome/Firefox extension
- The regex `".*"` accepts any trailing text but it is never inspected — the command throws unconditionally
- Error code `912` was the standard "unsupported command" error in the original iMacros
- Originally designed for dial-up/VPN network disconnection at the OS level (iMacros desktop editions)

## New Implementation

The new implementation has two layers:

### 1. System handler (system.ts:737-776)

```typescript
export const disconnectHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  ctx.log('info', 'Disconnecting from network...');

  if (!networkManager) {
    ctx.log('warn', 'No network manager configured - DISCONNECT command requires OS-specific implementation');
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: 'DISCONNECT command requires OS-specific native support. No network manager configured.',
    };
  }

  try {
    const success = await networkManager.disconnect();

    if (success) {
      ctx.log('info', 'Network disconnected successfully');
      return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
    } else {
      ctx.log('warn', 'Failed to disconnect from network');
      return {
        success: false,
        errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
        errorMessage: 'Failed to disconnect from network',
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    ctx.log('error', `Disconnect failed: ${errorMessage}`);
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: `Disconnect failed: ${errorMessage}`,
    };
  }
};
```

### 2. Unsupported handler override (unsupported.ts:145-148)

```typescript
export const disconnectUnsupportedHandler: CommandHandler = createUnsupportedHandler(
  'DISCONNECT',
  'Network disconnect requires OS-specific native support'
);
```

The unsupported handlers are registered **after** the system handlers and override them, so in the extension context the unsupported handler is the one that actually runs.

### Step-by-step logic (new — active path via unsupported handler)

1. **Log**: Logs `'Unsupported command: DISCONNECT - Network disconnect requires OS-specific native support'` at warn level.
2. **Return error**: Returns `{ success: false, errorCode: -915, errorMessage: 'DISCONNECT is not supported: Network disconnect requires OS-specific native support' }`.

### Step-by-step logic (new — system handler, for future use with native host)

1. **Log**: Logs `'Disconnecting from network...'` at info level.
2. **Check network manager**: If `networkManager` is `null` (no OS-specific implementation configured), returns `SCRIPT_ERROR` (-991).
3. **Call disconnect**: Awaits `networkManager.disconnect()` which returns a boolean.
4. **Success path**: If `true`, logs success and returns `{ success: true, errorCode: 0 }`.
5. **Failure path**: If `false`, logs warning and returns `SCRIPT_ERROR`.
6. **Error handling**: Catches exceptions from the network manager, extracts message (handles both `Error` instances and non-Error thrown values), returns `SCRIPT_ERROR`.

### Key details (new)

- The `NetworkManager` interface (`system.ts:209-219`) defines `disconnect(): Promise<boolean>` and `redial(): Promise<boolean>`
- `networkManager` is module-level state, set via `setNetworkManager()` — designed for dependency injection from native host
- The unsupported handler override in `unsupported.ts` takes priority in the extension context
- The system handler in `system.ts` is future-proofed for when a native host provides network management capabilities
- Registered in `systemHandlers` map at `system.ts:847` as `DISCONNECT: disconnectHandler`
- Overridden in `unsupportedHandlers` map at `unsupported.ts:208` as `DISCONNECT: disconnectUnsupportedHandler`

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Behavior** | Always throws `UnsupportedCommand` | Returns `UNSUPPORTED_COMMAND` error result (extension context) | **Compatible**: Both reject the command as unsupported |
| **Error code** | `errnum = 912` | `errorCode = -915` (`UNSUPPORTED_COMMAND`) | **Minor difference**: Different numeric codes. Old uses positive `912`, new uses negative `-915`. Both indicate "unsupported command" semantically |
| **Error message** | `"command DISCONNECT is not supported in the current version"` | `"DISCONNECT is not supported: Network disconnect requires OS-specific native support"` | **Minor difference**: Different message text, same meaning |
| **Error mechanism** | Throws exception (synchronous) | Returns structured `CommandResult` (async) | **Structural**: New uses non-throwing error handling pattern |
| **Future extensibility** | None — hardcoded throw | System handler supports pluggable `NetworkManager` interface | **Enhancement**: New can support actual network disconnect via native host in the future |
| **Logging** | None | Warns at `warn` level about unsupported command | **Enhancement**: Better observability |
| **Handler layering** | Single `ActionTable` entry | Two handlers: `disconnectHandler` (system.ts) overridden by `disconnectUnsupportedHandler` (unsupported.ts) | **Structural**: Layered architecture allows selective enablement |
| **Async model** | Synchronous | Async (`Promise<CommandResult>`) | **Structural**: Consistent with new async command pattern |

## Output / Side Effects

- **Variables modified**: None
- **Return value**: Both old and new return an error (unsupported command)
- **Side effects**: None — the command does not perform any network operations in either implementation
- **No `!EXTRACT` or other output**: DISCONNECT produces no extract data

## Test Coverage

### Parser tests (`tests/unit/parser.test.ts`)
- Parses `DISCONNECT` as DISCONNECT type (line 815-817)
- Included in supported commands list (line 888)

### Unit tests — system handler (`tests/unit/system-handlers.test.ts`)
- Succeeds with mock network manager returning `true` (line 1151)
- Returns `SCRIPT_ERROR` when network manager returns `false` (line 1165)
- Returns `SCRIPT_ERROR` when network manager throws (line 1179)
- Returns `SCRIPT_ERROR` when no network manager configured (line 1193)
- Direct handler invocation succeeds when manager returns `true` (line 1202)
- Handler registration includes DISCONNECT (line 1417)
- Registered DISCONNECT handler matches `disconnectHandler` export (line 1479-1487)

### Unit tests — branch coverage (`tests/unit/commands/system.test.ts`)
- Handles non-Error thrown value (string) from network manager (line 220)
- Handles non-Error thrown value (number) from network manager (line 235)
- Handler registration includes DISCONNECT (lines 309, 334)

### Unit tests — unsupported handler (`tests/unit/unsupported-commands.test.ts`)
- DISCONNECT returns `UNSUPPORTED_COMMAND` error via executor (line 234-243)
- `disconnectUnsupportedHandler` is included in exported handler map (line 109, 135, 331)
