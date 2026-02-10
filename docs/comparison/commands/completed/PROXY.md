# PROXY Command Comparison

## Syntax

```
PROXY ADDRESS=<address> [BYPASS=<bypass_list>]
```

**Old regex**: `"^address\\s*=\\s*(<im_strre>)(?:\\s+bypass\\s*=\\s*(<im_strre>)\\s*)?$"` — case-insensitive. Two capture groups: (1) the address value, (2) optional bypass list. Where `im_strre` matches quoted strings with escapes, `eval()` expressions, or non-whitespace tokens.

**New parser**: Key-value parameter command — `parser.ts:834-845` validates that the ADDRESS parameter is present. Also supports TYPE, BYPASS, USER, and PASSWORD parameters.

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `ADDRESS=<addr>` | Yes | Proxy address. Formats: `host:port`, `http=host:port`, `https=host:port`, `__default__`, `__none__`, `DIRECT`, or empty string. |
| `BYPASS=<list>` | No | Comma-separated list of hosts to bypass the proxy. `null` clears the bypass list. |
| `TYPE=<type>` | No (new only) | Proxy type: `HTTP`, `HTTPS`, `SOCKS4`, `SOCKS5`, `DIRECT`, `NONE`, `SYSTEM`. Not present in old implementation. |
| `USER=<username>` | No (new only) | Username for proxy authentication. Not present in old implementation. |
| `PASSWORD=<password>` | No (new only) | Password for proxy authentication. Not present in old implementation. |

## Old Implementation (MacroPlayer.js:1645-1727)

### Regex Pattern

```javascript
MacroPlayer.prototype.RegExpTable["proxy"] =
    "^address\\s*=\\s*("+im_strre+")"+
    "(?:\\s+bypass\\s*=\\s*("+im_strre+")\\s*)?$";
```

### Helper Functions

```javascript
MacroPlayer.prototype.storeProxySettings = function() {
    var pref = imns.prefsvc.getBranch("network.proxy.");
    this.proxySettings = new Object();
    this.proxySettings.http = pref.getCharPref("http");
    this.proxySettings.http_port = pref.getIntPref("http_port");
    this.proxySettings.ssl = pref.getCharPref("ssl");
    this.proxySettings.ssl_port = pref.getIntPref("ssl_port");
    this.proxySettings.no_proxies_on = pref.getCharPref("no_proxies_on");
    this.proxySettings.type = pref.getIntPref("type");
};

MacroPlayer.prototype.restoreProxySettings = function() {
    var pref = imns.prefsvc.getBranch("network.proxy.");
    pref.setCharPref("http", this.proxySettings.http);
    pref.setIntPref("http_port", this.proxySettings.http_port);
    pref.setCharPref("ssl", this.proxySettings.ssl);
    pref.setIntPref("ssl_port", this.proxySettings.ssl_port);
    pref.setCharPref("no_proxies_on", this.proxySettings.no_proxies_on);
    pref.setIntPref("type", this.proxySettings.type);
};
```

### Action Handler

```javascript
MacroPlayer.prototype.ActionTable["proxy"] = function (cmd) {
    var address = imns.unwrap(this.expandVariables(cmd[1]));
    var bypass = cmd[2]? imns.unwrap(this.expandVariables(cmd[2])) : null;
    var pref = imns.prefsvc.getBranch("network.proxy.");

    if (/^__default__$/i.test(address)) {
        pref.clearUserPref("http");
        pref.clearUserPref("http_port");
        pref.clearUserPref("ssl");
        pref.clearUserPref("ssl_port");
        pref.clearUserPref("no_proxies_on");
        pref.clearUserPref("type");
        return;
    } else if (/^__none__$/i.test(address)) {
        pref.setIntPref("type", 0);
        return;
    }

    var addr_re = /^(?:(https?)\s*=\s*)?([\d\w\.]+):(\d+)\s*$/;
    var m = addr_re.exec(address);
    if (!m) {
        throw new BadParameter("server name or IP address with port number", 1);
    }

    if (!this.proxySettings)
        this.storeProxySettings();

    var server = m[2];
    var port = imns.s2i(m[3]);

    if (!m[1]) {
        pref.setCharPref("http", server);
        pref.setIntPref("http_port", port);
        pref.setCharPref("ssl", server);
        pref.setIntPref("ssl_port", port);
    } else if (m[1].toLowerCase() == "http") {
        pref.setCharPref("http", server);
        pref.setIntPref("http_port", port);
    } else if (m[1].toLowerCase() == "https") {
        pref.setCharPref("ssl", server);
        pref.setIntPref("ssl_port", port);
    }

    if (bypass) {
        if (/^null$/i.test(bypass)) {
            pref.setCharPref("no_proxies_on", "");
        } else {
            pref.setCharPref("no_proxies_on",
                             this.proxySettings.no_proxies_on+","+bypass);
        }
    }

    pref.setIntPref("type", 1);
};
```

### Cleanup (MacroPlayer.js:4124-4128, 4680-4682)

```javascript
// At macro end (both normal completion and stop):
if (this.proxySettings) {
    this.restoreProxySettings();
    this.proxySettings = null;
}
```

### Step-by-step logic (old)

1. **Parse parameters**: Regex captures ADDRESS (group 1) and optional BYPASS (group 2). Both are unwrapped via `imns.unwrap()` and variable-expanded via `this.expandVariables()`.
2. **Handle `__default__`**: Clears all proxy-related Firefox preferences (`http`, `http_port`, `ssl`, `ssl_port`, `no_proxies_on`, `type`) using `pref.clearUserPref()`, restoring browser defaults. Returns immediately.
3. **Handle `__none__`**: Sets `network.proxy.type` to `0` (no proxy / direct connection). Returns immediately.
4. **Parse address**: Uses regex `/^(?:(https?)\s*=\s*)?([\d\w\.]+):(\d+)\s*$/` to extract optional protocol prefix (group 1), server name (group 2), and port (group 3). Port is **required** — throws `BadParameter` if address doesn't match.
5. **Backup settings**: On first proxy command in macro, stores current proxy preferences to `this.proxySettings` via `storeProxySettings()`. Stores: `http`, `http_port`, `ssl`, `ssl_port`, `no_proxies_on`, `type`.
6. **Apply proxy by protocol**:
   - No protocol prefix: Sets both HTTP and SSL proxy to the same server/port.
   - `http=` prefix: Sets only HTTP proxy (`http` and `http_port` prefs).
   - `https=` prefix: Sets only SSL proxy (`ssl` and `ssl_port` prefs).
7. **Handle bypass list**:
   - `BYPASS=null` (case-insensitive): Clears the `no_proxies_on` preference (empty string).
   - Other value: Appends to existing `no_proxies_on` with a comma separator.
8. **Set proxy type**: Always sets `network.proxy.type` to `1` (manual proxy configuration) for non-special addresses.
9. **Restore on cleanup**: At macro end (normal or stop), if `this.proxySettings` was saved, calls `restoreProxySettings()` to restore all original values.

## New Implementation

### Command Handler (browser.ts:685-817)

```typescript
export const proxyHandler: CommandHandler = async (ctx: CommandContext): Promise<CommandResult> => {
  const addressParam = ctx.getParam('ADDRESS');
  const bypassParam = ctx.getParam('BYPASS');
  const userParam = ctx.getParam('USER');
  const passwordParam = ctx.getParam('PASSWORD');

  if (addressParam === undefined) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.MISSING_PARAMETER,
      errorMessage: 'PROXY requires ADDRESS parameter',
    };
  }

  const address = ctx.expand(addressParam);

  // Handle __default__
  if (/^__default__$/i.test(address)) {
    const response = await sendBrowserCommandMessage(
      { type: 'setProxy', proxyType: 'system' }, ctx
    );
    // ... error handling ...
    return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
  }

  // Handle __none__
  if (/^__none__$/i.test(address)) {
    const response = await sendBrowserCommandMessage(
      { type: 'setProxy', proxyType: 'direct' }, ctx
    );
    // ... error handling ...
    return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
  }

  const proxyType = determineProxyType(ctx, address);
  const parsed = parseProxyAddress(address);

  // Validate address
  if (proxyType !== 'direct' && proxyType !== 'system' && !parsed) {
    return {
      success: false,
      errorCode: IMACROS_ERROR_CODES.INVALID_PARAMETER,
      errorMessage: 'PROXY ADDRESS requires server name or IP address with port number',
    };
  }

  // Parse bypass list
  let bypass: string[] | undefined;
  let bypassAppend = false;
  if (bypassParam) {
    const bypassValue = ctx.expand(bypassParam);
    if (/^null$/i.test(bypassValue)) {
      bypass = [];
    } else {
      bypass = bypassValue.split(',').map(h => h.trim());
      bypassAppend = true;
    }
  }

  const username = userParam ? ctx.expand(userParam) : undefined;
  const password = passwordParam ? ctx.expand(passwordParam) : undefined;

  const backupFirst = !proxySettingsBackedUp;
  if (backupFirst) { proxySettingsBackedUp = true; }

  const response = await sendBrowserCommandMessage({
    type: 'setProxy', proxyType, address, host, port,
    username, password, bypass, bypassAppend, protocol, backupFirst,
  }, ctx);

  // ... error handling and logging ...
  return { success: true, errorCode: IMACROS_ERROR_CODES.OK };
};
```

### Address Parser (browser.ts:557-596)

```typescript
function parseProxyAddress(address: string): { host: string; port: number; protocol?: 'http' | 'https' } | null {
  if (!address || address === '' || address === 'DIRECT') return null;
  if (/^__default__$/i.test(address) || /^__none__$/i.test(address)) return null;

  // Parse protocol=host:port format
  const protoMatch = address.match(/^(https?)\s*=\s*([\w.]+):(\d+)\s*$/);
  if (protoMatch) {
    return { host: protoMatch[2], port: parseInt(protoMatch[3], 10),
             protocol: protoMatch[1].toLowerCase() as 'http' | 'https' };
  }

  // Parse host:port format
  const match = address.match(/^([^:]+):(\d+)$/);
  if (match) {
    return { host: match[1], port: parseInt(match[2], 10) };
  }

  // Host only — default port 8080
  if (!address.includes(':')) {
    return { host: address, port: 8080 };
  }

  return null;
}
```

### Proxy Type Determination (browser.ts:601-636)

```typescript
function determineProxyType(ctx: CommandContext, address: string): ProxyType {
  const typeParam = ctx.getParam('TYPE');
  if (typeParam) {
    // Maps TYPE= values to ProxyType: HTTP, HTTPS, SOCKS4, SOCKS5, DIRECT, NONE, SYSTEM
    // ... switch statement ...
  }
  // Default: 'direct' for empty/DIRECT/__none__, 'system' for __default__, else 'http'
  return 'http';
}
```

### Backup/Restore Lifecycle (browser.ts:638-665)

```typescript
let proxySettingsBackedUp = false;

export function resetProxyBackupState(): void { proxySettingsBackedUp = false; }
export function hasProxyBackup(): boolean { return proxySettingsBackedUp; }

export async function restoreProxySettings(ctx: CommandContext): Promise<void> {
  if (!proxySettingsBackedUp) return;
  ctx.log('info', 'Restoring original proxy settings');
  await sendBrowserCommandMessage({ type: 'restoreProxy' }, ctx);
  proxySettingsBackedUp = false;
}
```

### Parser Validation (parser.ts:834-845)

```typescript
case 'PROXY': {
  const addressParam = command.parameters.find(p => p.key.toUpperCase() === 'ADDRESS');
  if (!addressParam) {
    return {
      lineNumber: command.lineNumber,
      message: 'PROXY command requires ADDRESS parameter',
      raw: command.raw,
    };
  }
  break;
}
```

### Step-by-step logic (new)

1. **Extract parameters**: Reads ADDRESS, BYPASS, USER, and PASSWORD from the parsed command parameters.
2. **Validate ADDRESS**: If ADDRESS parameter is missing, returns `MISSING_PARAMETER` error.
3. **Expand variables**: Calls `ctx.expand()` on the address value.
4. **Handle `__default__`**: Sends `setProxy` message with `proxyType: 'system'` to the browser extension. This delegates the actual preference restoration to the extension.
5. **Handle `__none__`**: Sends `setProxy` message with `proxyType: 'direct'` to the browser extension.
6. **Determine proxy type**: Uses `determineProxyType()` which checks for a `TYPE=` parameter first, then infers from the address value. Supports SOCKS4, SOCKS5, HTTPS, HTTP, DIRECT, NONE, SYSTEM types.
7. **Parse address**: Uses `parseProxyAddress()` to extract host, port, and optional protocol. Supports host-only format with default port 8080 (old requires port). Supports protocol-prefixed format (`http=host:port`, `https=host:port`).
8. **Validate parsed address**: For non-direct/non-system types, requires a valid parsed address.
9. **Parse bypass list**: If BYPASS is provided, `null` (case-insensitive) sends empty array to clear; otherwise splits by comma, trims whitespace, and sets `bypassAppend=true` to append to existing list.
10. **Get credentials**: Expands USER and PASSWORD parameters if provided.
11. **Backup management**: On first proxy command (`backupFirst=true`), signals the extension to back up current proxy settings before applying. Subsequent commands in the same macro set `backupFirst=false`.
12. **Send to extension**: Sends a `setProxy` message via the browser command bridge with all parsed parameters.
13. **Restore on cleanup**: `restoreProxySettings()` is called at macro end, sending a `restoreProxy` message to the extension.

## Differences

| Aspect | Old (8.9.7) | New (Remastered) | Impact |
|--------|-------------|------------------|--------|
| **Parameters** | Only ADDRESS and BYPASS | ADDRESS, BYPASS, TYPE, USER, PASSWORD | **Enhancement**: New supports proxy type selection, authentication credentials. |
| **Proxy types** | HTTP only (sets `network.proxy.type=1`) | HTTP, HTTPS, SOCKS4, SOCKS5, DIRECT, SYSTEM via TYPE parameter | **Enhancement**: Broader proxy type support. Old only set Firefox manual HTTP/SSL proxy. |
| **Port requirement** | Port is required — regex requires `:(\d+)` | Port optional — defaults to 8080 if omitted | **Enhancement**: More lenient parsing. `PROXY ADDRESS=proxy.example.com` works in new but fails in old. |
| **Address regex** | `/^(?:(https?)\s*=\s*)?([\d\w\.]+):(\d+)\s*$/` | `parseProxyAddress()` with separate regex patterns for protocol-prefix, host:port, and host-only | **Structural**: Same address formats plus host-only default port. |
| **`__default__` behavior** | Clears all proxy prefs directly via `pref.clearUserPref()` for each setting (http, http_port, ssl, ssl_port, no_proxies_on, type) | Sends `setProxy` with `proxyType: 'system'` to extension | **Structural**: Old directly manipulates Firefox prefs; new delegates to Chrome extension's `browser.proxy` API. |
| **`__none__` behavior** | Sets `network.proxy.type` to `0` (direct) | Sends `setProxy` with `proxyType: 'direct'` to extension | **Equivalent**: Both result in no proxy (direct connection). |
| **`DIRECT` as address** | Not explicitly supported as an address value | Treated as direct connection (same as empty address) | **Enhancement**: Additional convenience syntax. |
| **Settings backup** | Stores 6 Firefox prefs in `this.proxySettings` object directly | Module-level `proxySettingsBackedUp` boolean; backup/restore is delegated to extension via `backupFirst` flag and `restoreProxy` message | **Structural**: Old stores/restores prefs directly; new delegates to extension. Same lifecycle semantics (backup on first use, restore on macro end). |
| **Bypass append** | Directly concatenates to stored `no_proxies_on` pref with comma separator | Sends `bypassAppend: true` flag with parsed array to extension | **Equivalent**: Both append to existing bypass list. New trims whitespace from individual entries. |
| **Bypass clearing** | Sets `no_proxies_on` to empty string `""` | Sends empty array `[]` with `bypassAppend: false` | **Equivalent**: Both clear the bypass list. |
| **Protocol-specific proxy** | `http=` sets HTTP prefs only; `https=` sets SSL prefs only | Sends `protocol: 'http'` or `protocol: 'https'` in the message to extension | **Equivalent**: Both support per-protocol proxy. Old sets different Firefox pref branches; new delegates to extension. |
| **Proxy mechanism** | Directly sets Firefox `network.proxy.*` preferences via `imns.prefsvc` | Sends messages to Chrome extension which uses `chrome.proxy` API | **Structural**: Different browser extension APIs. Firefox XUL prefs vs Chrome proxy API. |
| **Error handling** | Throws `BadParameter` for invalid address format | Returns `INVALID_PARAMETER` error code for invalid address, `SCRIPT_ERROR` for bridge failures, `MISSING_PARAMETER` for missing ADDRESS | **Structural**: Structured error codes vs exceptions. |
| **Authentication** | Not supported | Supports `USER=` and `PASSWORD=` parameters for proxy authentication | **Enhancement**: New feature not in original. |
| **No bridge configured** | N/A (Firefox pref API is always available) | Returns success with a warning log (development/testing mode) | **Enhancement**: Graceful fallback for testing without extension. |
| **Variable expansion** | `imns.unwrap(this.expandVariables(cmd[1]))` | `ctx.expand(addressParam)` | **Equivalent**: Both expand `{{!VAR}}` references. |
| **Proxy type `1` always set** | Always sets `network.proxy.type=1` (manual config) after setting server/port, regardless of HTTP/HTTPS prefix | Proxy type selection is more granular via `proxyType` field | **Structural**: Old always used manual proxy mode. New can specify different proxy types. |
| **Async model** | Synchronous (direct pref manipulation) | Async with `await` (message passing to extension) | **Structural**: Consistent with message-passing architecture. |
| **Command registration** | `ActionTable["proxy"]` (lowercase) | `browserCommandHandlers.PROXY` (uppercase) | Internal naming convention only. |

## Output / Side Effects

- **Proxy configuration**: Configures browser proxy settings for subsequent HTTP/HTTPS requests
- **Variables modified**: None
- **Settings backup**: First use in a macro backs up current proxy settings; macro end restores them
- **Return data**: None (success/failure only)

## Test Coverage

### Parser tests (`tests/unit/parser.test.ts`)
- Parses `PROXY ADDRESS=127.0.0.1:8080` — type is `'PROXY'` (line 691-693)
- Included in supported commands list (line 885)

### Integration tests (`tests/integration/commands/proxy.test.ts`)

**Address parsing (line 55-86):**
- `PROXY ADDRESS=proxy.example.com:8080` — sends `setProxy` with `proxyType=http`, host and port parsed correctly (line 56)
- `PROXY ADDRESS=proxy.example.com` — host-only defaults to port 8080 (line 72)

**Direct connection (line 90-122):**
- `PROXY ADDRESS=` — sends `proxyType=direct` with no host/port (line 91)
- `PROXY ADDRESS=DIRECT` — sends `proxyType=direct` (line 107)

**TYPE parameter (line 126-156):**
- `PROXY ADDRESS=proxy:3128 TYPE=SOCKS5` — sends `proxyType=socks5` (line 127)
- `PROXY ADDRESS=proxy:3128 TYPE=HTTPS` — sends `proxyType=https` (line 142)

**BYPASS parameter (line 160-175):**
- `PROXY ADDRESS=proxy:3128 BYPASS=localhost,127.0.0.1` — sends bypass list as array (line 161)

**Authentication (line 179-195):**
- `PROXY ADDRESS=proxy:3128 USER=admin PASSWORD=secret` — sends username and password (line 180)

**Parameter validation (line 199-208):**
- `PROXY TYPE=SOCKS5` (missing ADDRESS) — returns `MISSING_PARAMETER` (line 200)

**Bridge error handling (line 212-238):**
- Bridge returns failure — returns `SCRIPT_ERROR` with error message (line 213)
- Bridge throws exception — returns `SCRIPT_ERROR` with exception message (line 226)

**No bridge configured (line 242-255):**
- No bridge — returns success (testing/development mode) (line 243)

**Variable expansion (line 259-279):**
- `SET !VAR1 proxy.example.com:9090` then `PROXY ADDRESS={{!VAR1}}` — expands variable before sending (line 260)

**`__default__` and `__none__` (line 283-327):**
- `PROXY ADDRESS=__default__` — sends `proxyType=system` (line 284)
- `PROXY ADDRESS=__DEFAULT__` — case-insensitive (line 297)
- `PROXY ADDRESS=__none__` — sends `proxyType=direct` (line 306)
- `PROXY ADDRESS=__NONE__` — case-insensitive (line 319)

**Protocol-prefixed addresses (line 331-363):**
- `PROXY ADDRESS=http=proxy.example.com:8080` — parses protocol and sends `protocol=http` (line 332)
- `PROXY ADDRESS=https=proxy.example.com:443` — parses protocol and sends `protocol=https` (line 348)

**BYPASS append and null clearing (line 367-397):**
- Normal bypass — `bypassAppend=true` (line 368)
- `BYPASS=null` — empty array with `bypassAppend=false` (line 378)
- `BYPASS=NULL` — case-insensitive (line 388)

**Proxy settings backup/restore lifecycle (line 401-426):**
- First proxy command — `backupFirst=true` (line 402)
- Second proxy command in same macro — `backupFirst=false` (line 411)
