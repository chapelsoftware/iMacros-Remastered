# SIZE Command Comparison

## Syntax

```
SIZE X=<width> Y=<height>
```

**Old regex**: `".*"` — matches any arguments (but none are used; immediately throws `UnsupportedCommand`)

**New parser**: `parser.ts:935` — No-parameter validation. SIZE falls through to the `break` case in the validation switch, so any trailing text is accepted without parsing.

## Parameters

| Parameter | Position | Required | Values | Description |
|-----------|----------|----------|--------|-------------|
| X | Named | Yes (in desktop editions) | Integer pixels | Window width |
| Y | Named | Yes (in desktop editions) | Integer pixels | Window height |

Note: In iMacros 8.9.7 Chrome/Firefox extension, parameters are accepted by the parser but never inspected — the command immediately throws `UnsupportedCommand`.

## Old Implementation (MacroPlayer.js:2365-2368)

```javascript
MacroPlayer.prototype.RegExpTable["size"] = ".*";

MacroPlayer.prototype.ActionTable["size"] = function (cmd) {
    throw new UnsupportedCommand("SIZE");
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
2. **Execute**: Immediately throws `UnsupportedCommand("SIZE")`.
3. **Error**: Error message = `"command SIZE is not supported in the current version"`, error number = `912`.

### Key details (old)

- SIZE was **always** unsupported in the iMacros 8.9.7 Chrome/Firefox extension
- The regex `".*"` accepts any trailing text but it is never inspected — the command throws unconditionally
- Error code `912` was the standard "unsupported command" error in the original iMacros
- SIZE was designed for iMacros desktop editions where the browser window could be resized programmatically
- The command was intended to set browser window dimensions to specific pixel values (e.g., `SIZE X=1024 Y=768`)

## New Implementation (unsupported.ts:117-126)

```typescript
/**
 * SIZE command handler (unsupported)
 *
 * The SIZE command resizes the browser window. Browser extensions have very
 * limited window management capabilities and cannot reliably resize windows.
 */
export const sizeHandler: CommandHandler = createUnsupportedHandler(
  'SIZE',
  'Window resize is not reliably available in browser extensions'
);
```

The `createUnsupportedHandler` factory (unsupported.ts:42-54):

```typescript
export function createUnsupportedHandler(
  commandName: string,
  reason: string
): CommandHandler {
  return async (ctx: CommandContext): Promise<CommandResult> => {
    ctx.log('warn', `Unsupported command: ${commandName} - ${reason}`);
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.UNSUPPORTED_COMMAND,  // -915
      errorMessage: `${commandName} is not supported: ${reason}`,
    };
  };
}
```

Registered in the unsupported handlers map at `unsupported.ts:206`:
```typescript
SIZE: sizeHandler,
```

### Step-by-step logic (new)

1. **Log**: Logs `'Unsupported command: SIZE - Window resize is not reliably available in browser extensions'` at warn level.
2. **Return error**: Returns `{ success: false, errorCode: -915, errorMessage: 'SIZE is not supported: Window resize is not reliably available in browser extensions' }`.

### Key details (new)

- SIZE is registered as an unsupported command via `createUnsupportedHandler`
- The handler uses the standard `UNSUPPORTED_COMMAND` error code (`-915`)
- No system handler exists for SIZE (unlike DISCONNECT/REDIAL which have future-proofed system handlers)
- The parser accepts `SIZE` with any trailing text (no parameter validation)
- When `!ERRORIGNORE` is `YES`, the unsupported error is skipped and execution continues

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Behavior** | Always throws `UnsupportedCommand` | Returns `UNSUPPORTED_COMMAND` error result | **Compatible**: Both reject the command as unsupported |
| **Error code** | `errnum = 912` | `errorCode = -915` (`UNSUPPORTED_COMMAND`) | **Minor difference**: Different numeric codes. Old uses positive `912`, new uses negative `-915`. Both indicate "unsupported command" semantically |
| **Error message** | `"command SIZE is not supported in the current version"` | `"SIZE is not supported: Window resize is not reliably available in browser extensions"` | **Minor difference**: Different message text. New provides more specific reasoning |
| **Error mechanism** | Throws exception (synchronous) | Returns structured `CommandResult` (async) | **Structural**: New uses non-throwing error handling pattern |
| **Logging** | None | Warns at `warn` level about unsupported command | **Enhancement**: Better observability |
| **Async model** | Synchronous | Async (`Promise<CommandResult>`) | **Structural**: Consistent with new async command pattern |
| **Future extensibility** | None — hardcoded throw | Could be replaced with a real implementation using `chrome.windows.update()` API | **Enhancement**: Architecture allows future implementation |

## Output / Side Effects

- **Variables modified**: None
- **Return value**: Both old and new return an error (unsupported command)
- **Side effects**: None — the command does not resize the window in either implementation
- **No `!EXTRACT` or other output**: SIZE produces no extract data

## Test Coverage

### Parser tests (`tests/unit/parser.test.ts`)
- Parses `SIZE X=1024 Y=768` as SIZE type (line 701-703)
- Included in supported commands list (line 886)

### Unit tests — unsupported handler (`tests/unit/unsupported-commands.test.ts`)
- SIZE returns `UNSUPPORTED_COMMAND` error via executor (lines 210-219)
- `sizeHandler` is included in exported handler map (lines 107, 134, 329)

### Unit tests — ERRORIGNORE interaction (`tests/unit/unsupported-commands.test.ts`)
- Continues execution when `ERRORIGNORE` is `YES` with SIZE command (lines 285-300)
- Stops execution on SIZE when `ERRORIGNORE` is `NO` (lines 302-316)
