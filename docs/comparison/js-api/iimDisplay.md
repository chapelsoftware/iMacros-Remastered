# iimDisplay JS API Comparison

## Syntax

```javascript
// Old (jsplayer.js) - called from JS macro sandbox
iimDisplay("Hello, this is a status message")

// New (scripting-interface.ts) - called via TCP scripting interface
iimDisplay("Hello, this is a status message")
```

**Old**: `sandbox.iimDisplay = function(txt)` — single argument: text message to display in the iMacros panel.

**New**: `private handleIimDisplay(args: string[])` — first element of args array is the message text.

## Parameters

| Parameter | Required | Old | New | Description |
|-----------|----------|-----|-----|-------------|
| txt/message | No | String: text to display | String: text to display | Message to show to the user. Empty string if omitted. |

## Old Implementation (jsplayer.js)

### Function Definition (jsplayer.js:309-312)

```javascript
sandbox.iimDisplay = function(txt) {
    iMacros.panel.showInfoMessage(txt);
    return 1;
};
```

### Step-by-step logic (old)

1. **Display message**: Calls `iMacros.panel.showInfoMessage(txt)` which:
   - Stores the message in `this._infoMessage` (ControlPanel.js:647)
   - Sets `this._mboxType = "message"` (ControlPanel.js:648)
   - Sets `this._mboxStatus = "open"` (ControlPanel.js:649)
   - If sidebar is open: switches to the first tab, selects the message deck, hides help/edit buttons, sets the message box value to `msg` (ControlPanel.js:651-664)
   - If sidebar is closed: opens the panel and shows the message in an alternate container (ControlPanel.js:666-670)
2. **Return**: Returns integer `1` (success).

### Scripting Interface Path (old)

When called via the external scripting interface (TCP), `iimDisplay` follows a different path:
1. The SI command listener receives the `iimDisplay` command
2. It broadcasts an `"imacros-si-show"` observer notification with `{ clientId, message }` (MacroPlayer.js:3437-3442)
3. The MacroPlayer observer calls `iMacros.panel.showInfoMessage(show_args.message)`
4. Sends `"OK"` response with code `1` back to the SI client

### Sandbox Context (jsplayer.js:130-222)

Same as other iim* functions — the function is attached to a sandbox created with system principal and full chrome access. See [iimPlay.md](iimPlay.md) for full sandbox context details.

## New Implementation (scripting-interface.ts)

### Command Dispatch (scripting-interface.ts:673-674)

```typescript
case 'iimdisplay':
  return this.handleIimDisplay(args);
```

### Handler (scripting-interface.ts:855-859)

```typescript
private handleIimDisplay(args: string[]): CommandResult {
  const message = args.length > 0 ? args[0] : '';
  this.emit('display', message);
  return { code: ReturnCode.OK };
}
```

### Step-by-step logic (new)

1. **Extract message**: Gets the first argument, or empty string if no arguments provided.
2. **Emit event**: Emits a `'display'` event with the message string. Consumers of the `ScriptingInterface` EventEmitter can listen for this event to handle display (e.g., logging, UI updates).
3. **Return**: Returns `{ code: ReturnCode.OK }` (code 1 = success).

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Display mechanism** | Directly updates browser panel UI via `iMacros.panel.showInfoMessage()` | Emits a `'display'` event on the EventEmitter | **Structural**: New decouples display from UI; consumers decide how to present the message. |
| **UI side effects** | Switches sidebar tab, shows message box, opens panel if closed | No direct UI manipulation | **Structural**: Old had tight coupling to Firefox sidebar/panel DOM. |
| **Return value** | Integer `1` | `{ code: ReturnCode.OK }` (serialized as code `1` over TCP) | **None**: Both return success code 1. |
| **Empty argument** | `txt` parameter is `undefined` if not passed | Defaults to empty string `''` | **Minor**: Old passes `undefined` to `showInfoMessage`; new passes `''`. Both display nothing meaningful. |
| **Execution model** | Synchronous (direct function call in sandbox) | Synchronous handler, async TCP transport | **None**: Both return immediately after displaying. |

## Output / Side Effects

| Aspect | Old | New |
|--------|-----|-----|
| **Return value** | Integer `1` (always success) | `{ code: ReturnCode.OK }` (code 1) |
| **Variables modified** | `panel._infoMessage`, `panel._mboxType`, `panel._mboxStatus` | None (event emitted) |
| **Side effects** | Updates browser sidebar/panel UI to show the message | Emits `'display'` event for consumers to handle |
| **Error handling** | None — always returns 1 | None — always returns OK |

## Test Coverage

### Integration tests (`tests/integration/scripting-interface-executor.test.ts`)

- **Returns OK for iimDisplay** (line 810): Sends `iimDisplay("Hello World")` and verifies `ReturnCode.OK`.
- **Emits display event** (line 815): Listens for `'display'` event and verifies the message string matches `"Test Message"`.
- **Handles empty message** (line 825): Sends `iimDisplay()` with no arguments and verifies `ReturnCode.OK`.
