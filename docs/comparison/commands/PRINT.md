# PRINT Command Comparison

## Syntax

```
PRINT
```

**Old regex**: `".*"` — accepts any arguments (effectively ignored since the command throws immediately).

**New parser**: `parser.ts:934` — No parameter validation; bare `PRINT` is valid. Falls through the no-validation case in the parser switch statement.

## Parameters

None. The PRINT command takes no parameters.

## Old Implementation (MacroPlayer.js:1608-1611)

### Regex

```javascript
MacroPlayer.prototype.RegExpTable["print"] = ".*";
```

Matches anything — no parameter capture groups.

### Action handler

```javascript
MacroPlayer.prototype.ActionTable["print"] = function (cmd) {
    throw new UnsupportedCommand("PRINT");
};
```

### Step-by-step logic (old)

1. **PRINT command parsed**: Regex `".*"` matches any arguments.
2. **Action handler executes**: Immediately throws `UnsupportedCommand("PRINT")`.
3. **Macro stops**: The exception is caught by the execution loop, and the macro halts with an unsupported command error.

### Key details (old)

- PRINT is **completely unsupported** in the Chrome extension version of iMacros 8.9.7
- The `".*"` regex pattern allows any syntax to reach the handler, where it always throws
- This is consistent with the Chrome extension's limitations — browser extensions cannot trigger silent printing
- The related ONPRINT command is also unsupported (`MacroPlayer.js:1573-1576`)
- PRINT was likely supported in the Firefox XUL or desktop versions of iMacros, but not the Chrome extension

## New Implementation (shared/src/commands/print.ts)

### Architecture

The new implementation uses a **service-based architecture** with two tiers:

1. **Native host print service** — Silent printing via Puppeteer (preferred)
2. **Fallback print function** — Browser `window.print()` dialog (when native host unavailable)

### Interfaces

```typescript
interface PrintOptions {
  url?: string;              // URL to print (defaults to current page)
  toPrinter?: boolean;       // Print to physical printer
  printerName?: string;      // Specific printer name
  waitForNetworkIdle?: boolean; // Wait for network idle before printing
  waitAfterLoad?: number;    // Additional wait time after page load (ms)
}

interface PrintResult {
  success: boolean;
  error?: string;
  pdfPath?: string;
  usedFallback?: boolean;
}

interface PrintService {
  print(options: PrintOptions): Promise<PrintResult>;
  isAvailable(): boolean;
}
```

### Service management

```typescript
// Module-level service state
let activePrintService: PrintService = noopPrintService;
let fallbackPrintFunction: FallbackPrintFunction = defaultFallbackPrint;

// Service setters (called by native host on connect)
setPrintService(service: PrintService): void
setFallbackPrintFunction(fn: FallbackPrintFunction): void

// Service queries
isPrintServiceConfigured(): boolean  // Returns true if non-noop + isAvailable()
```

### Command handler (print.ts:165-238)

```typescript
export const printHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const currentUrl = ctx.state.getVariable('!URLCURRENT') as string | undefined;

  // Try native host first
  if (isPrintServiceConfigured()) {
    const result = await activePrintService.print({
      url: currentUrl,
      toPrinter: true,
      waitForNetworkIdle: true,
    });
    // Return success/failure based on result
  }

  // Fall back to browser print dialog
  const result = await fallbackPrintFunction();
  // Return success/failure based on result
};
```

### Handler registration (print.ts:245-260)

```typescript
export const printHandlers: Partial<Record<CommandType, CommandHandler>> = {
  PRINT: printHandler,
};

export function registerPrintHandlers(
  registerFn: (type: CommandType, handler: CommandHandler) => void
): void { /* registers all handlers */ }
```

Exported from `shared/src/commands/index.ts` (line 38).

### Step-by-step logic (new)

1. **PRINT command parsed**: Parser accepts bare `PRINT` with no parameters.
2. **Handler invoked**: Gets `!URLCURRENT` from state.
3. **Check native host**: If `isPrintServiceConfigured()` returns true:
   a. Calls `activePrintService.print()` with `url`, `toPrinter: true`, `waitForNetworkIdle: true`.
   b. On success: returns `{ success: true, errorCode: OK }`.
   c. On failure: returns `{ success: false, errorCode: SCRIPT_ERROR }` with error message.
4. **Fallback to browser**: If native host not available:
   a. Logs warning about fallback.
   b. Calls `fallbackPrintFunction()` (typically wraps `window.print()`).
   c. Returns success/failure based on result.
5. **Error handling**: Both paths catch exceptions and return `SCRIPT_ERROR` with the error message.

### ONPRINT interaction

The related ONPRINT command (`shared/src/commands/dialogs.ts`) configures print dialog behavior by setting `!PRINT_BUTTON` variable and sending a `PRINT_CONFIG` message. This allows pre-configuring whether to click OK or CANCEL on print dialogs before PRINT executes.

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Supported** | No — throws `UnsupportedCommand` | Yes — fully implemented | **Major**: Command now works |
| **Silent printing** | N/A | Native host uses Puppeteer for silent printing | **Enhancement**: No dialog required with native host |
| **Browser fallback** | N/A | Falls back to `window.print()` dialog | **Enhancement**: Works even without native host |
| **Service architecture** | N/A | `PrintService` interface with pluggable implementations | **Structural**: Supports multiple print backends |
| **URL source** | N/A | Reads `!URLCURRENT` from state, passes to print service | **Enhancement**: Prints specific URL |
| **Print options** | N/A | Supports `toPrinter`, `printerName`, `waitForNetworkIdle`, `waitAfterLoad` | **Enhancement**: Configurable print behavior |
| **Error handling** | Throws exception | Returns `CommandResult` with `SCRIPT_ERROR` code | **Structural**: Graceful error reporting |
| **ONPRINT integration** | Both unsupported | ONPRINT configures dialog handling; PRINT triggers printing | **Enhancement**: Dialog pre-configuration works |
| **Headless support** | N/A | Native host enables printing without browser UI | **Enhancement**: Supports headless/scripted execution |

## Output / Side Effects

- **Variables modified**: None
- **Return value (old)**: Never returns — always throws `UnsupportedCommand`
- **Return value (new)**: `{ success: true, errorCode: OK }` on success; `{ success: false, errorCode: SCRIPT_ERROR, errorMessage: "..." }` on failure
- **Side effects (old)**: None (command never executes)
- **Side effects (new)**: Prints the current page (either silently via native host or via browser print dialog)

## Test Coverage

### Unit tests — print handler (tests/unit/commands/print.test.ts)

**Service Configuration:**
- Starts with no-op service that returns unavailable (lines 122-137)
- Allows setting a custom Print service (lines 139-144)
- `isPrintServiceConfigured` returns true when service available (lines 146-151)
- `isPrintServiceConfigured` returns false when service unavailable (lines 153-158)
- Allows setting a fallback print function (lines 160-165)

**Native Host Printing:**
- Uses native host when available for silent printing (lines 171-186)
- Passes current URL to print service (lines 188-199)
- Handles print service failure (lines 202-215)
- Handles print service throwing exception (lines 217-230)
- Logs info message on successful print (lines 232-241)
- Logs error message on failure (lines 243-256)

**Fallback Printing:**
- Falls back to browser print when native host not available (lines 262-278)
- Logs warning when using fallback (lines 280-294)
- Handles fallback failure (lines 296-312)
- Handles fallback throwing exception (lines 314-327)
- Logs info on successful fallback (lines 329-341)

**Handler Registration:**
- Exports PRINT in printHandlers (lines 347-350)
- `registerPrintHandlers` registers all handlers (lines 352-361)

**Edge Cases:**
- Handles undefined URL gracefully (lines 367-380)
- Handles empty error message from service (lines 382-394)
- Handles empty error message from fallback (lines 396-411)
- Handles non-Error exceptions from service (lines 413-425)
- Handles non-Error exceptions from fallback (lines 427-439)

**Service Priority:**
- Prefers native host over fallback when available (lines 445-457)
- Only uses fallback when native host unavailable (lines 459-471)

**Logging:**
- Logs starting message (lines 477-486)
- Logs debug message when using native host (lines 488-497)

### Unit tests — parser (tests/unit/parser.test.ts)

- PRINT is parsed as a valid command type (via no-validation fall-through)

### Unit tests — unsupported commands (tests/unit/unsupported-commands.test.ts)

- ONPRINT is tested as unsupported (PRINT itself is no longer unsupported)
