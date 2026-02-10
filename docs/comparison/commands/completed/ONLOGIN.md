# ONLOGIN Command Comparison

## Syntax

```
ONLOGIN USER=admin PASSWORD=secret
ONLOGIN USER={{!VAR1}} PASSWORD={{!VAR2}}
```

**Old regex**: `^user\s*=\s*(<im_strre>)\s+password\s*=\s*(<im_strre>)\s*$`
- Capture groups: (1) USER value, (2) PASSWORD value
- `im_strre` matches quoted strings (with escape sequences), `eval(...)` expressions, or non-whitespace tokens

**New parser**: Validates USER and PASSWORD parameters are present (parser.ts:899-909). Returns validation error if either is missing.

## Parameters

| Parameter | Description | Old | New |
|-----------|-------------|-----|-----|
| USER | Username for HTTP authentication | Required; expanded with `expandVariables()`, unwrapped with `imns.unwrap()` | Required; expanded with `ctx.expand()` |
| PASSWORD | Password for HTTP authentication | Required; expanded/unwrapped, then decrypted via `Rijndael.decryptString()` if encryption is active | Required; expanded, then decrypted via `decryptString()` if `!ENCRYPTION` is set and value looks encrypted |

## Old Implementation (MacroPlayer.js:1520-1568)

```javascript
MacroPlayer.prototype.RegExpTable["onlogin"] =
    "^user\\s*=\\s*("+im_strre+")\\s+"+
    "password\\s*=\\s*("+im_strre+")\\s*$";

MacroPlayer.prototype.ActionTable["onlogin"] = function (cmd) {
    var storage = imns.storage;
    var pm = imns.getPasswordManager(),
        key = imns.getEncryptionKey();
    var obj = new Object();
    var username = imns.unwrap(this.expandVariables(cmd[1]));
    var password = imns.unwrap(this.expandVariables(cmd[2]));
    obj.accept = true;
    obj.username = username;

    if (pm.encryptionType != pm.TYPE_NONE) {
        try {
            obj.password =
                Rijndael.decryptString(password, key);
        } catch (e) {
            // Decryption failed — open key re-entry dialog
            var param = { reenter: true, password: "",
                master: pm.encryptionType == pm.TYPE_STORED };
            window.openDialog('chrome://imacros/content/keydlg4.xul',
                              '', 'modal,centerscreen', param);
            if (param.master) {
                pm.setMasterPwd(param.password);
                pm.encryptionType = pm.TYPE_STORED;
            } else {
                pm.setSessionPwd(param.password);
                pm.encryptionType = pm.TYPE_TEMP;
            }
            obj.password = Rijndael.decryptString(
                password, param.password
            );
        }
    } else {
        obj.password = password;
    }

    obj.timeout = this.delay;
    var actions = storage.getObjectForWindow(
        iMacros.wid, "onDialogAction"
    );
    if (!actions) {
        actions = new Array();
    }
    actions.push(obj);
    storage.setObjectForWindow(iMacros.wid, "onDialogAction", actions);
};
```

### Step-by-step logic (old)

1. **Parse USER**: Expand variables in `cmd[1]`, unwrap quotes to get `username`.
2. **Parse PASSWORD**: Expand variables in `cmd[2]`, unwrap quotes to get `password`.
3. **Create action object**: `obj.accept = true` (login actions always accept), `obj.username = username`.
4. **Check encryption**: Get password manager and encryption key. If `encryptionType != TYPE_NONE`:
   - **Try decryption**: Attempt `Rijndael.decryptString(password, key)`.
   - **On failure**: Open a modal key re-entry dialog (`keydlg4.xul`). If the user enters a master password, store it; otherwise store as session password. Retry decryption with the newly entered password.
5. **No encryption**: Use `password` as-is.
6. **Set timeout**: `obj.timeout = this.delay` — uses the current `!TIMEOUT_STEP` value.
7. **Get existing actions**: Retrieve the `onDialogAction` array from per-window storage. If none, create new array.
8. **Push to queue**: `actions.push(obj)` — appends to the end of the action queue (unlike ONDIALOG which uses index assignment).
9. **Save actions**: Write the updated array back to per-window storage.

### Login dialog execution (commonDialogHook.js:159-169)

When an HTTP authentication dialog (`promptType == "promptUserAndPass"` → mapped to `"login"`) appears during playback:

1. **Shift action**: `actions.shift()` removes and returns the first element from the queue.
2. **No action available**: If queue is empty, triggers error code -1450 ("unhandled dialog detected"), stops playback.
3. **Has action**: For `"login"` type dialogs:
   - Sets `loginTextbox.value = action.username`
   - Sets `password1Textbox.value = action.password`
4. **Timeout delay**: Waits `action.timeout` ms before completing the dialog.
5. **Complete dialog**: Since `action.accept` is always `true` for login actions, clicks OK/accept.

### Key observations (old)

- **Queue-based (push/shift)**: ONLOGIN uses `actions.push(obj)` to append — FIFO queue consumed by `shift()` in the dialog hook. No POS parameter needed.
- **Shared action queue**: ONLOGIN shares the same `onDialogAction` queue as ONDIALOG. Login and dialog actions are interleaved in a single queue.
- **Always accept**: `obj.accept = true` — login actions always click OK.
- **Encryption with re-entry**: On decryption failure, opens a modal XUL dialog for the user to re-enter the encryption key. Supports both master and session passwords.
- **Per-window storage**: Actions stored per browser window via `storage.getObjectForWindow`.
- **Timeout from !TIMEOUT_STEP**: The dialog wait time comes from `this.delay`.

## New Implementation

### Handler (dialogs.ts:433-506 — `onLoginHandler`)

```typescript
export const onLoginHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const userStr = ctx.getParam('USER');
  const passwordStr = ctx.getParam('PASSWORD');

  if (!userStr || !passwordStr) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'ONLOGIN command requires USER and PASSWORD parameters',
    };
  }

  const user = ctx.expand(userStr);
  let password = ctx.expand(passwordStr);

  // Decrypt password if encryption is enabled
  const encryptionKey = ctx.state.getVariable('!ENCRYPTION');
  if (encryptionKey && typeof encryptionKey === 'string' && encryptionKey !== '' && isEncrypted(password)) {
    try {
      password = decryptString(password, encryptionKey);
    } catch (e) {
      if (e instanceof EncryptionError) {
        return {
          success: false,
          errorCode: e.code as IMacrosErrorCode,
          errorMessage: `ONLOGIN password decryption failed: ${e.message}`,
        };
      }
      throw e;
    }
  }

  const timeoutStep = ctx.state.getVariable('!TIMEOUT_STEP');
  const timeout = typeof timeoutStep === 'number' ? timeoutStep :
    typeof timeoutStep === 'string' ? parseFloat(timeoutStep) : undefined;

  ctx.log('info', `Configuring HTTP auth handler: USER=${user}`);

  ctx.state.setVariable('!LOGIN_USER', user);
  ctx.state.setVariable('!LOGIN_PASSWORD', password);

  const response = await sendDialogMessage(
    {
      type: 'LOGIN_CONFIG',
      payload: {
        config: {
          user,
          password,
          active: true,
          timeout: timeout !== undefined && !isNaN(timeout) ? timeout : undefined,
        },
        append: true,
      },
    },
    ctx
  );

  if (!response.success) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.SCRIPT_ERROR,
      errorMessage: response.error || 'Failed to configure login handler',
    };
  }

  return {
    success: true,
    errorCode: IMACROS_ERROR_CODES.OK,
  };
};
```

### Step-by-step logic (new)

1. **Get parameters**: Retrieve USER and PASSWORD from command context via `ctx.getParam()`.
2. **Validate presence**: If either USER or PASSWORD is missing (or empty string), return `MISSING_PARAMETER` error.
3. **Expand variables**: Expand `{{!VAR}}` references in both USER and PASSWORD via `ctx.expand()`.
4. **Decrypt password**: Check `!ENCRYPTION` state variable. If set and password looks encrypted (`isEncrypted()` check), decrypt with `decryptString()`. On failure, return error with `EncryptionError` code.
5. **Get timeout**: Read `!TIMEOUT_STEP` from state, convert to number if string.
6. **Log configuration**: Log at info level with USER (password not logged for security).
7. **Store in state**: Set `!LOGIN_USER` and `!LOGIN_PASSWORD` state variables.
8. **Send to extension**: Send `LOGIN_CONFIG` message through the dialog bridge with:
   - `config`: user, password, active=true, timeout
   - `append: true` (queue support — multiple ONLOGIN commands stack)
9. **Handle response**: If bridge returns failure, return `SCRIPT_ERROR`. Otherwise return `OK`.

### Message flow

```
onLoginHandler → sendDialogMessage → DialogBridge.sendMessage
                                      ↓
                               Extension background script
                               (configures HTTP auth interception)
```

### Data types

```typescript
interface LoginConfig {
  user: string;       // Username for HTTP auth
  password: string;   // Password for HTTP auth
  active: boolean;    // Whether this config is active
  timeout?: number;   // Timeout in seconds from !TIMEOUT_STEP
}

interface LoginConfigMessage extends DialogMessage {
  type: 'LOGIN_CONFIG';
  payload: {
    config: LoginConfig;
    append?: boolean;  // Queue support for multiple ONLOGIN commands
  };
}
```

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Shared queue** | ONLOGIN pushes to the same `onDialogAction` queue as ONDIALOG — login and dialog actions interleaved | Separate `LOGIN_CONFIG` message type; login config sent through its own channel | **Behavioral**: New separates login from dialog handling. In practice, original behavior relied on dialog hook distinguishing login vs other types, so separation is cleaner |
| **Encryption re-entry** | On decryption failure, opens modal XUL dialog (`keydlg4.xul`) for user to re-enter encryption key; retries decryption with new key | On decryption failure, returns `EncryptionError` immediately — no interactive re-entry | **Behavioral**: No interactive key re-entry in new implementation. User must set correct `!ENCRYPTION` key before running the macro |
| **Encryption detection** | Checks `pm.encryptionType != TYPE_NONE` — always attempts decryption if any encryption is configured | Checks `!ENCRYPTION` state variable is set AND `isEncrypted(password)` returns true — only decrypts if password looks encrypted | **Behavioral**: New is more selective — won't attempt decryption on plaintext passwords even if encryption is configured |
| **Empty string params** | N/A — regex requires non-empty match for `im_strre` | `ctx.getParam()` returns falsy for empty string → `MISSING_PARAMETER` | **Compatible**: Both reject empty values |
| **Storage mechanism** | Per-window array via `storage.getObjectForWindow` with `push()` | Dialog bridge message with `append: true` flag; state variables `!LOGIN_USER`, `!LOGIN_PASSWORD` | **Structural**: Different storage architecture, same semantic intent |
| **Queue append** | `actions.push(obj)` directly appends to array | Bridge-based with `append: true` flag delegates queue management to extension | **Compatible**: Both support multiple stacked ONLOGIN commands |
| **Error on missing params** | Regex simply won't match (parse-time failure) | Explicit `MISSING_PARAMETER` error result with descriptive message | **Compatible**: Same user-visible outcome — command fails with clear error |
| **Variable expansion** | `this.expandVariables()` + `imns.unwrap()` on captured groups | `ctx.expand()` on parameter values | **Compatible**: Same behavior, different API |
| **State variables** | None — stored only in per-window action queue | Sets `!LOGIN_USER` and `!LOGIN_PASSWORD` | **Enhancement**: State visible to subsequent macro commands |
| **Timeout source** | `this.delay` (MacroPlayer property) | `!TIMEOUT_STEP` state variable | **Compatible**: Both reflect the same user-configurable timeout |
| **No bridge fallback** | N/A (always has storage) | Returns success when no bridge configured (testing mode) | **Enhancement**: Graceful degradation for testing |
| **Password logging** | No explicit protection | Only USER is logged; password excluded from log message | **Enhancement**: Better security practice |

## Output / Side Effects

- **Variables modified (new only)**: `!LOGIN_USER`, `!LOGIN_PASSWORD`
- **Old**: Stores action object (with `username`, `password`, `accept=true`, `timeout`) in per-window `onDialogAction` array via `push()`
- **New**: Sends `LOGIN_CONFIG` message through dialog bridge to extension
- **No DOM side effects** (configuration only — auth handling occurs when HTTP auth dialog appears)
- **No navigation side effects**

## Test Coverage

### Unit tests (`tests/unit/commands/dialogs.test.ts` — `onLoginHandler`)
- Missing USER returns `MISSING_PARAMETER`
- Missing PASSWORD returns `MISSING_PARAMETER`
- Missing both USER and PASSWORD returns `MISSING_PARAMETER`
- Valid USER/PASSWORD with no bridge returns success
- Valid USER/PASSWORD with bridge sends `LOGIN_CONFIG` with correct config
- Bridge returning `success: false` returns `SCRIPT_ERROR`
- Bridge returning `success: false` with no error message uses default message
- Bridge throwing exception returns error with exception message
- Message structure includes id and timestamp for all handlers
- Correct message types sent for each command

### Unit tests (`tests/unit/dialog-handlers.test.ts` — `ONLOGIN handler`)
- `ONLOGIN USER=admin PASSWORD=secret` sends `LOGIN_CONFIG` with user=admin, password=secret, active=true
- Missing USER returns `MISSING_PARAMETER`
- Missing PASSWORD returns `MISSING_PARAMETER`
- Variable expansion in USER and PASSWORD (`{{!VAR1}}`, `{{!VAR2}}`)
- Bridge failure returns `SCRIPT_ERROR`
- Bridge exception returns `SCRIPT_ERROR`
- No bridge configured returns success (testing mode)
- Correct config for various credentials (user=john, password=pass123)
- Handler registered in `dialogHandlers` map as `ONLOGIN`
- Registered via `registerDialogHandlers`

### Integration tests (`tests/integration/commands/onlogin.test.ts`)
- Basic `ONLOGIN USER=admin PASSWORD=secret` through full executor pipeline
- Missing USER returns `MISSING_PARAMETER`
- Missing PASSWORD returns `MISSING_PARAMETER`
- Empty USER and PASSWORD returns `MISSING_PARAMETER`
- Variable expansion in USER (`{{!VAR1}}`)
- Variable expansion in PASSWORD (`{{!VAR2}}`)
- Bridge failure returns `SCRIPT_ERROR`
- Bridge exception returns `SCRIPT_ERROR`
- No bridge configured returns success (testing mode)
- Multi-command sequence: `ONLOGIN` then `URL GOTO` executes both successfully
- Bridge message payload carries correct credentials
- Expanded variable values passed through bridge payload

### Parser tests (`tests/unit/parser.test.ts`)
- `ONLOGIN USER=admin PASSWORD=secret` parses with type `ONLOGIN`
- `ONLOGIN USER=admin` (missing PASSWORD) produces validation error
