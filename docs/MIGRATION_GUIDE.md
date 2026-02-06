# Migration Guide: Firefox iMacros to iMacros-new

This guide helps you migrate from the legacy Firefox iMacros extension to the new iMacros for Firefox implementation.

## Table of Contents

1. [Overview](#overview)
2. [Key Differences](#key-differences)
3. [Installation Changes](#installation-changes)
4. [Command Compatibility](#command-compatibility)
5. [Breaking Changes](#breaking-changes)
6. [Migrating Macros](#migrating-macros)
7. [Feature Comparison](#feature-comparison)
8. [Common Issues](#common-issues)
9. [FAQ](#faq)

---

## Overview

The new iMacros for Firefox (iMacros-new) is a complete rewrite of the classic iMacros extension. It was rebuilt to:

- Support modern Firefox WebExtension APIs (Manifest V3)
- Improve performance and stability
- Maintain compatibility with existing macro scripts
- Add new features while preserving the familiar workflow

### Why a New Version?

Firefox deprecated the legacy extension API (XUL/XPCOM) that the original iMacros relied on. This new version uses:

- **WebExtension APIs** for browser integration
- **Native Messaging** for file system access
- **TypeScript** for improved code quality
- **Modern build tools** (Vite, Vitest)

---

## Key Differences

### Architecture

| Aspect | Legacy iMacros | iMacros-new |
|--------|---------------|-------------|
| API | XUL/XPCOM | WebExtension (MV3) |
| File Access | Direct | Native Messaging Host |
| UI | XUL Sidebar | Side Panel (HTML/CSS) |
| Language | JavaScript | TypeScript |
| Background | Always running | Service Worker |

### User Interface

| Feature | Legacy | New |
|---------|--------|-----|
| Panel Location | Sidebar (left) | Side Panel (right) |
| Panel Toggle | View Menu | Toolbar button |
| Editor | Modal window | New tab |
| Recording Indicator | Status bar | Panel indicator |

### Folder Structure

The default macro folder locations have changed:

**Windows:**
```
Legacy:   %APPDATA%\iMacros\Macros
New:      %USERPROFILE%\Documents\iMacros\Macros
```

**macOS:**
```
Legacy:   ~/Library/Application Support/iMacros/Macros
New:      ~/Documents/iMacros/Macros
```

**Linux:**
```
Legacy:   ~/.imacros/Macros
New:      ~/Documents/iMacros/Macros
```

---

## Installation Changes

### Native Host Requirement

The new version requires a native messaging host for:
- File system operations (reading/writing macros)
- CMDLINE command execution
- SAVEAS/ONDOWNLOAD file saving

**Installation Steps:**

1. Install the Firefox extension
2. Download the native host installer
3. Run the installer for your platform
4. Restart Firefox

### First-Time Setup

On first launch:
1. Open the iMacros panel (click toolbar icon)
2. Configure your macro folder in Settings
3. Import existing macros if needed

---

## Command Compatibility

### Fully Supported Commands

These commands work identically to the legacy version:

| Category | Commands |
|----------|----------|
| Navigation | URL, TAB, FRAME, BACK, REFRESH |
| Interaction | TAG, CLICK, EVENT |
| Variables | SET, ADD |
| Data | EXTRACT, SEARCH, PROMPT |
| Flow Control | WAIT, PAUSE, STOPWATCH |
| Dialogs | ONDIALOG, ONLOGIN, ONCERTIFICATEDIALOG |
| Downloads | ONDOWNLOAD, SAVEAS, SAVEITEM |
| Browser | CLEAR, FILTER, PROXY, SCREENSHOT |
| System | VERSION, CMDLINE, FILEDELETE |

### Modified Commands

These commands work but have minor differences:

#### TAG Command

- XPath expressions now use standard XPath 1.0 (no Firefox-specific extensions)
- CSS selectors are now fully supported as an alternative to ATTR

```iim
' Legacy (still works)
TAG POS=1 TYPE=INPUT ATTR=NAME:username CONTENT=test

' New alternative (recommended for complex selectors)
TAG CSS=input[name="username"] CONTENT=test
```

#### SCREENSHOT Command

- Full page screenshots now use scrolling capture instead of Firefox internal APIs
- Quality parameter is now supported for JPEG format

```iim
' Legacy
SCREENSHOT TYPE=PAGE FOLDER=C:\Shots FILE=page.png

' New (same syntax, different implementation)
SCREENSHOT TYPE=PAGE FOLDER=C:\Shots FILE=page.png
```

#### PROXY Command

- Proxy settings now use Firefox's proxy API
- System proxy detection is improved

```iim
' Same syntax as legacy
PROXY ADDRESS=192.168.1.1:8080

' New TYPE parameter
PROXY ADDRESS=proxy.com:1080 TYPE=SOCKS5
```

### Deprecated Commands

These commands are not supported in the new version:

| Command | Reason | Alternative |
|---------|--------|-------------|
| IMAGECLICK | Requires desktop access | Use TAG with coordinates |
| IMAGESEARCH | Requires desktop access | Use CSS/XPath selectors |
| WINCLICK | Desktop automation | Use browser automation only |
| SIZE | Window sizing limited | Use browser dev tools |
| PRINT | Printing API limited | Use browser print function |

---

## Breaking Changes

### 1. Native Host Required

File operations now require the native messaging host:

```iim
' These commands require native host:
SAVEAS TYPE=TXT FOLDER=C:\Data FILE=output.txt
CMDLINE CMD="dir"
FILEDELETE NAME=C:\temp\file.txt
```

**Solution:** Install the native messaging host component.

### 2. Frame Handling

Frame selection is now more strict:

```iim
' Legacy (might work with partial matches)
FRAME F=contentFrame

' New (exact name required)
FRAME NAME=contentFrame

' Or use index
FRAME F=1
```

### 3. Dialog Timing

Dialog handling is now asynchronous:

```iim
' Configure dialog handler BEFORE triggering it
ONDIALOG POS=1 BUTTON=OK
TAG POS=1 TYPE=BUTTON ATTR=TXT:Show Alert
```

### 4. Variable Scope

Variables are now reset between separate macro runs (not loop iterations):

```iim
' Variables persist across loop iterations
SET !VAR1 "initial"
' ... loop runs ...
' !VAR1 still has value from previous iteration

' But reset when macro is re-run from Play button
```

### 5. Extract Accumulation

`!EXTRACTADD` behavior is now consistent:

```iim
' Multiple extractions
TAG POS=1 TYPE=SPAN ATTR=CLASS:item EXTRACT=TXT
' !EXTRACT has latest value
' !EXTRACTADD has all values separated by [EXTRACT]
```

---

## Migrating Macros

### Step 1: Copy Macro Files

Copy your `.iim` files to the new macro folder:

```bash
# Windows
copy "%APPDATA%\iMacros\Macros\*.iim" "%USERPROFILE%\Documents\iMacros\Macros\"

# macOS/Linux
cp ~/Library/Application\ Support/iMacros/Macros/*.iim ~/Documents/iMacros/Macros/
```

### Step 2: Update Folder Paths

If your macros use absolute paths, update them:

```iim
' Legacy path
SET !DATASOURCE "C:\Users\John\AppData\Roaming\iMacros\Datasources\data.csv"

' New path (use variable for portability)
SET !DATASOURCE "{{!FOLDER_DATASOURCE}}data.csv"
```

### Step 3: Test and Fix

1. Open each macro in the editor
2. Run with `SET !ERRORIGNORE YES` initially
3. Note any errors
4. Fix issues based on error codes

### Step 4: Handle Deprecated Commands

Replace deprecated commands:

```iim
' Legacy IMAGECLICK
IMAGECLICK button.png

' New approach - use coordinates or selectors
TAG POS=1 TYPE=IMG ATTR=SRC:*button.png*
' or
CLICK X=100 Y=200
```

---

## Feature Comparison

### Supported Features

| Feature | Legacy | New | Notes |
|---------|--------|-----|-------|
| Record/Playback | Yes | Yes | Improved recording |
| Loop Execution | Yes | Yes | Same behavior |
| Data Sources (CSV) | Yes | Yes | Same format |
| Variable System | Yes | Yes | Same syntax |
| Error Handling | Yes | Yes | Same variables |
| Encrypted Variables | Yes | Yes | Same encryption |
| Scheduling | External | External | Use OS scheduler |
| Multi-tab | Yes | Yes | Improved |
| Frame Support | Yes | Yes | Stricter matching |
| XPath Selectors | Yes | Yes | Standard XPath 1.0 |
| CSS Selectors | Limited | Full | New feature |
| HTTP Auth | Yes | Yes | Improved |
| Proxy Support | Yes | Yes | More options |
| Screenshots | Yes | Yes | Better quality |
| Downloads | Yes | Yes | Native host required |

### New Features

| Feature | Description |
|---------|-------------|
| CSS Selectors | Full CSS selector support in TAG command |
| Code Editor | Syntax highlighting, autocomplete |
| Side Panel | Modern UI in browser side panel |
| TypeScript | Better error handling |
| Improved Recording | More accurate event capture |
| Better XPath | Standard XPath with fallback matching |

### Removed Features

| Feature | Reason | Workaround |
|---------|--------|------------|
| Image Recognition | No desktop access | Use selectors |
| Desktop Automation | WebExtension limitation | Use other tools |
| Direct File Access | Security model | Native host |
| XUL UI | Deprecated | HTML/CSS UI |

---

## Common Issues

### Issue: Macro folder not found

**Symptom:** "Cannot access macro folder" error

**Solution:**
1. Open Settings
2. Set the correct macro folder path
3. Ensure native host is installed

### Issue: Element not found

**Symptom:** -920 error on TAG commands that worked before

**Solution:**
1. Check if page structure changed
2. Use more specific selectors
3. Increase `!TIMEOUT_STEP`
4. Try CSS or XPath selectors

```iim
' Add timeout
SET !TIMEOUT_STEP 10

' Use more specific selector
TAG POS=1 TYPE=INPUT ATTR=NAME:username&&ID:user CONTENT=test
```

### Issue: Frame commands fail

**Symptom:** -941 error on FRAME command

**Solution:**
1. Use FRAME F=0 to return to main document first
2. Check exact frame name/index
3. Wait for frame to load

```iim
FRAME F=0
WAIT SECONDS=1
FRAME NAME=content_frame
```

### Issue: CMDLINE not working

**Symptom:** "No executor configured" error

**Solution:**
1. Install native messaging host
2. Restart Firefox
3. Check host installation

### Issue: Recording misses clicks

**Symptom:** Some clicks not recorded

**Solution:**
1. Click more slowly
2. Avoid rapid clicks
3. Use TAG command for better reliability
4. Edit recorded macro to add missing commands

---

## FAQ

### Q: Can I use my existing macros?

**A:** Yes, most macros will work without changes. Test each macro and fix any compatibility issues.

### Q: Why do I need a native host?

**A:** WebExtension security model prevents direct file system access. The native host provides secure file operations.

### Q: Where are my macros stored now?

**A:** Default location is `Documents/iMacros/Macros`. You can change this in Settings.

### Q: Can I run macros from the command line?

**A:** Yes, via the native host CLI interface. See the Developer documentation.

### Q: Is the scripting language the same?

**A:** Yes, the iMacros scripting language is unchanged. All commands use the same syntax.

### Q: What about encryption?

**A:** Variable encryption works the same way. Encrypted values from legacy macros are compatible.

### Q: Can I import settings from the old version?

**A:** Settings must be reconfigured. Export important settings before uninstalling legacy version.

### Q: Does it support Firefox Multi-Account Containers?

**A:** Yes, macros can work within container tabs.

### Q: Is there a Chrome version?

**A:** This version is Firefox-specific. Chrome has a separate iMacros extension.

### Q: How do I report bugs?

**A:** Use the issue tracker or community forums. Include:
- Firefox version
- iMacros version
- Macro code (sanitized)
- Error messages
- Steps to reproduce

---

## Migration Checklist

- [ ] Install new iMacros extension
- [ ] Install native messaging host
- [ ] Configure macro folder in Settings
- [ ] Copy macro files to new location
- [ ] Update absolute paths in macros
- [ ] Test each macro
- [ ] Fix deprecated commands
- [ ] Update frame handling if needed
- [ ] Verify file operations work
- [ ] Check recording functionality
- [ ] Remove legacy extension (optional)

---

## Support Resources

- **Documentation:** See USER_GUIDE.md and COMMAND_REFERENCE.md
- **Community:** iMacros forums
- **Issues:** GitHub issue tracker
- **Examples:** Sample macros in the Macros folder

---

*Migration Guide - iMacros for Firefox v8.9.7*
