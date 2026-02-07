# iMacros Remastered - COMPREHENSIVE Feature Gap Report

## Complete Analysis: Original 8.9.7 vs Remastered

Generated: 2026-02-06

---

## EXECUTIVE SUMMARY

| Category | Original | Remastered | Gap Count |
|----------|----------|------------|-----------|
| **Macro Commands** | 39 | 34 fully + 5 partial | 5 |
| **Recording System** | Fully integrated | Built but NOT wired | **CRITICAL** |
| **UI/File Management** | 8 operations | 3 operations | 5 |
| **Dialogs** | 6 dialogs | 1 (settings page) | 5 |
| **Settings/Options** | 25+ options | 15 options | 10+ |
| **Scripting Interface** | Full TCP + JS sandbox | TCP only | 1 |
| **Bookmarks/Sharing** | 7 features | 0 | 7 |
| **Keyboard Shortcuts** | 5+ | 3 | 2+ |

---

## PART 1: CRITICAL GAPS (Broken/Non-functional)

### 1.1 RECORDING SYSTEM - NOT WIRED

**Status: CODE EXISTS BUT DOES NOT WORK**

The macro recorder (`macro-recorder.ts`) is fully implemented (869 lines) but clicking the Record button does nothing because:

| Component | Built | Wired |
|-----------|-------|-------|
| `MacroRecorder` class | ✅ | - |
| Click/input/change handlers | ✅ | - |
| TAG command generation | ✅ | - |
| Message handlers (RECORD_START/STOP) | ✅ | - |
| Panel sends `START_RECORDING` | ✅ | ❌ |
| Background handles `START_RECORDING` | ❌ | ❌ |
| Content script listener initialized | ? | ? |

**The Problem:**
```
Panel sends: START_RECORDING
Background expects: RECORD_START (different message!)
Background doesn't forward to content script
```

**Fix Required:**
1. Add `case 'START_RECORDING':` to background.ts message handler
2. Forward `RECORD_START` to content script via `chrome.tabs.sendMessage()`
3. Add `case 'SAVE_RECORDING':` to get recorded macro and save via native host
4. Ensure `setupRecordingMessageListener()` is called in content.ts

---

### 1.2 FILE MANAGEMENT - UI EXISTS BUT NOT WIRED

| Feature | UI Exists | Works |
|---------|-----------|-------|
| Create New Folder | ❌ | ❌ |
| Rename File/Folder | ✅ context menu | ❌ |
| Delete File/Folder | ✅ context menu | ❌ |
| Move (Drag & Drop) | ❌ | ❌ |

**The Problem:**
- Context menu shows "Rename" and "Delete" options
- Clicking them does nothing - no handler connected
- Native host has `FileService` with all operations ready
- No message routing from panel → background → native host

**Fix Required:**
1. Add handlers in `panel.ts` for context menu actions
2. Add message types: `RENAME_FILE`, `DELETE_FILE`, `CREATE_FOLDER`, `MOVE_FILE`
3. Add cases in `background.ts` to forward to native host
4. Add handlers in native host `command-handlers.js`

---

## PART 2: MISSING FEATURES (Not Implemented)

### 2.1 Original Recording Features NOT in Remastered

| Feature | Original File | Status |
|---------|---------------|--------|
| **Recording Modes** | recordPrefDlg.js | ❌ |
| - Conventional (TAG-based) | | ❌ |
| - Event mode | | ❌ |
| - XY coordinate mode | | ❌ |
| - Auto mode | | ❌ |
| **Expert mode** (full HTML tag) | recordPrefDlg.js | ❌ |
| **Favor element IDs** option | recordPrefDlg.js | ❌ |
| **Dialog recording** | commonDialogHook.js | ❌ |
| - Alert recording | | ❌ |
| - Confirm recording | | ❌ |
| - Prompt recording | | ❌ |
| - Login dialog recording | | ❌ |
| **Download dialog recording** | downloadOverlay.js | ❌ |
| **History recording** (back/refresh) | MacroRecorder.js | ❌ |
| **Tab open/close/switch recording** | MacroRecorder.js | ❌ |
| **Frame navigation recording** | MacroRecorder.js | ❌ |
| **Element highlighting during record** | MacroRecorder.js | ❌ |

### 2.2 Original Playback Features NOT in Remastered

| Feature | Original File | Status |
|---------|---------------|--------|
| **Line highlighting** during playback | ControlPanel.js | ❌ |
| **Message box** with Edit/Help/Close | ControlPanel.js | ❌ |
| **Jump to error line** | ControlPanel.js | ❌ |
| **Error-specific help** links | ControlPanel.js | ❌ |
| **Visual effects** | options.js | ❌ |
| - Scroll to element | | ❌ |
| - Highlight element | | ❌ |
| **Replay speed** (Fast/Medium/Slow) | options.js | ❌ |

### 2.3 Original UI/Dialogs NOT in Remastered

| Dialog | Original File | Status |
|--------|---------------|--------|
| **Save Dialog** | save.js/xul | ❌ Uses prompt() |
| **Bookmark Dialog** | bookmark.js/xul | ❌ |
| **Share Dialog** | share.js/xul | ❌ |
| **Recording Preferences** | recordPrefDlg.js/xul | ❌ |
| **Extract Data Display** | extract.js/xul | ❌ |
| **Password Dialogs** (4 variants) | keydlg1-4.js/xul | ⚠️ Simplified |
| **Loop Warning** | loopwarning.js/xul | ❌ |
| **Run Warning** (security) | runwarning.js/xul | ❌ |

### 2.4 Original Settings NOT in Remastered

| Setting | Original | Remastered |
|---------|----------|------------|
| Replay speed (Fast/Medium/Slow) | ✅ | ❌ |
| Scroll to element | ✅ | ❌ |
| Highlight element | ✅ | ❌ |
| Toggle sidebar hotkey | ✅ | ❌ |
| Show JavaScript steps | ✅ | ❌ |
| Macro profiler | ✅ | ❌ |
| Recording mode selection | ✅ | ❌ |
| Favor element IDs | ✅ | ❌ |
| External editor path | ✅ | ❌ |
| Trusted sites list | ✅ | ❌ |

### 2.5 Bookmark Feature (Entirely Missing)

| Feature | Status |
|---------|--------|
| Create local macro bookmark | ❌ |
| Create bookmarklet | ❌ |
| Bookmark location selection | ❌ |
| Bookmark tags | ❌ |
| `imacros://run/?m=macro.iim` URLs | ⚠️ Protocol handler exists in native host but not registered |

### 2.6 Share Feature (Entirely Missing)

| Feature | Status |
|---------|--------|
| Copy macro URL to clipboard | ❌ |
| Send macro via email | ❌ |
| Social bookmarking | ❌ |

### 2.7 Tree/Sidebar Features Missing

| Feature | Original | Remastered |
|---------|----------|------------|
| Create new folder | `MPopup_CreateFolder()` | ❌ |
| Drag & drop move | `onDragStart/Over/Drop()` | ❌ |
| Rename item | `MPopup_renameItem()` | ❌ Not wired |
| Delete item | `MPopup_removeItem()` | ❌ Not wired |
| Tree state persistence | `queryState()/applyState()` | ❌ |
| Add bookmark from tree | `MPopup_AddBookmark()` | ❌ |

---

## PART 3: COMMAND PARITY

### 3.1 Fully Implemented Commands (34)

| Command | Params | Status |
|---------|--------|--------|
| URL | GOTO, CURRENT | ✅ |
| BACK | - | ✅ |
| REFRESH | - | ✅ |
| TAB | T, OPEN, CLOSE, CLOSEALLOTHERS | ✅ |
| FRAME | F, NAME | ✅ |
| TAG | POS, TYPE, ATTR, XPATH, CSS, FORM, CONTENT, EXTRACT | ✅ |
| CLICK | X, Y, BUTTON | ✅ |
| EVENT | TYPE, SELECTOR, KEY, MODIFIERS | ✅ |
| EVENTS | (alias for EVENT) | ✅ |
| SET | variable, value | ✅ |
| ADD | variable, value | ✅ |
| EXTRACT | - | ✅ |
| SEARCH | SOURCE, EXTRACT | ✅ |
| WAIT | SECONDS | ✅ |
| PAUSE | - | ✅ |
| PROMPT | MESSAGE, VAR, DEFAULT | ✅ |
| ONDIALOG | POS, BUTTON, CONTENT | ✅ |
| ONLOGIN | USER, PASSWORD | ✅ |
| ONDOWNLOAD | FOLDER, FILE, WAIT | ✅ |
| SAVEAS | TYPE, FOLDER, FILE, QUALITY | ✅ |
| SAVEITEM | URL, FOLDER, FILE | ✅ |
| CLEAR | type | ✅ |
| FILTER | TYPE, STATUS | ✅ |
| PROXY | ADDRESS, TYPE, USER, PASSWORD, BYPASS | ✅ |
| SCREENSHOT | TYPE, FOLDER, FILE, QUALITY | ✅ |
| VERSION | BUILD | ✅ |
| STOPWATCH | ID, ACTION | ✅ |
| CMDLINE | CMD, WAIT, TIMEOUT | ✅ |
| DS | CMD (NEXT, RESET, READ) | ✅ |
| FILEDELETE | NAME | ✅ |
| EVAL | expression | ✅ |
| ONCERTIFICATEDIALOG | BUTTON | ✅ |
| ONERRORDIALOG | BUTTON | ✅ |
| ONSECURITYDIALOG | BUTTON | ✅ |
| ONWEBPAGEDIALOG | BUTTON, CONTENT | ✅ |
| ONPRINT | BUTTON | ✅ |

### 3.2 Partially Implemented / Platform Limited (5)

| Command | Limitation |
|---------|------------|
| SIZE | Chrome cannot resize extension windows reliably |
| PRINT | Chrome print dialog cannot be fully automated |
| IMAGECLICK | Native host has image search but needs integration |
| IMAGESEARCH | Native host has service but needs integration |
| WINCLICK | Native host has nut.js service but needs integration |

### 3.3 Deprecated / Not Applicable (2)

| Command | Reason |
|---------|--------|
| DISCONNECT | Legacy modem dial-up |
| REDIAL | Legacy modem dial-up |

---

## PART 4: SCRIPTING INTERFACE GAPS

### 4.1 TCP Scripting Interface

| Feature | Original | Remastered |
|---------|----------|------------|
| TCP server on port 4951 | ✅ | ✅ |
| `iimPlay()` | ✅ | ✅ |
| `iimPlayCode()` | ✅ | ⚠️ via CODE: prefix |
| `iimSet()` | ✅ | ✅ |
| `iimGetLastExtract()` | ✅ | ✅ |
| `iimGetLastError()` | ✅ | ✅ |
| `iimDisplay()` | ✅ | ✅ |
| `iimStop()` | ✅ | ✅ |
| `iimExit()` | ✅ | ✅ |
| `iimGetLastPerformance()` | ✅ | ❌ |

### 4.2 JavaScript Macro Execution (.js files)

| Feature | Original | Remastered |
|---------|----------|------------|
| Run .js files with iim* API | ✅ jsplayer.js | ✅ js-debugger.ts |
| `iimPlay()` in sandbox | ✅ | ✅ |
| `iimSet()` in sandbox | ✅ | ✅ |
| `iimGetLastExtract()` in sandbox | ✅ | ✅ |
| `iimGetLastError()` in sandbox | ✅ | ✅ |
| `window` object access | ✅ | ❌ (runs in Node, not browser) |
| `prompt()`, `alert()`, `confirm()` | ✅ | ❌ |
| Step-through debugging | ✅ | ✅ |
| Breakpoints | ❌ | ✅ |
| Variable inspection | ❌ | ✅ |

**Key Difference:** Original runs JS in browser sandbox with DOM access. Remastered runs in Node.js native host - no direct DOM access, must use message passing.

---

## PART 5: ARCHITECTURE GAPS

### 5.1 Image Recognition

| Component | Original | Remastered |
|-----------|----------|------------|
| Native library (ctypes) | ✅ imr_worker.js | ❌ |
| JavaScript implementation | ❌ | ✅ image-search.ts |
| Template matching | ✅ | ✅ |
| IMAGECLICK command | ✅ | ⚠️ Service exists, not wired |
| IMAGESEARCH command | ✅ | ⚠️ Service exists, not wired |

### 5.2 Security Features

| Feature | Original | Remastered |
|---------|----------|------------|
| Trusted sites list | ✅ | ❌ |
| Run warning dialog | ✅ runwarning.js | ❌ |
| Request watcher | ✅ nsiMacros.js | ❌ |
| Macro origin validation | ✅ | ❌ |

### 5.3 Protocol Handler

| Feature | Original | Remastered |
|---------|----------|------------|
| `imacros://` URL scheme | ✅ | ⚠️ Parser exists, not registered |
| `imacros://run/?m=macro` | ✅ | ⚠️ |
| Browser registration | ✅ XPCOM | ❌ |

---

## PART 6: COMPLETE TODO LIST

### Priority 1: Critical (Broken Features)

- [ ] **Wire recording system**
  - [ ] Add `START_RECORDING` handler in background.ts
  - [ ] Forward `RECORD_START` to content script
  - [ ] Add `SAVE_RECORDING` handler
  - [ ] Test end-to-end recording flow

- [ ] **Wire file management**
  - [ ] Add `RENAME_FILE` message handler
  - [ ] Add `DELETE_FILE` message handler
  - [ ] Add `CREATE_FOLDER` message handler
  - [ ] Add `MOVE_FILE` message handler
  - [ ] Implement drag & drop in file-tree.ts

### Priority 2: High (Missing Core Features)

- [ ] **Recording preferences dialog**
  - [ ] Recording mode selection (conventional, event, XY, auto)
  - [ ] Expert mode toggle
  - [ ] Favor element IDs toggle

- [ ] **Playback visual feedback**
  - [ ] Line highlighting during playback
  - [ ] Message box with Edit/Help/Close
  - [ ] Jump to error line
  - [ ] Scroll to element option
  - [ ] Highlight element option

- [ ] **Tree state persistence**
  - [ ] Save expanded folders to chrome.storage
  - [ ] Save selected item
  - [ ] Restore on panel open

### Priority 3: Medium (Quality of Life)

- [ ] **Settings additions**
  - [ ] Replay speed (Fast/Medium/Slow)
  - [ ] Visual effects toggles
  - [ ] Toggle sidebar hotkey
  - [ ] External editor path

- [ ] **Save dialog**
  - [ ] Proper dialog with folder browser
  - [ ] Bookmark checkbox option

- [ ] **Image recognition integration**
  - [ ] Wire IMAGECLICK to image-search.ts
  - [ ] Wire IMAGESEARCH to image-search.ts

- [ ] **WINCLICK integration**
  - [ ] Wire to winclick-service.ts

### Priority 4: Low (Nice to Have)

- [ ] **Bookmark feature**
  - [ ] Bookmark dialog
  - [ ] Browser bookmark creation
  - [ ] Bookmarklet generation

- [ ] **Share feature**
  - [ ] Share dialog
  - [ ] Copy URL to clipboard
  - [ ] Email sharing

- [ ] **Protocol handler**
  - [ ] Register imacros:// scheme
  - [ ] Handle run requests

- [ ] **Security features**
  - [ ] Trusted sites list
  - [ ] Run warning dialog
  - [ ] Origin validation

### Priority 5: Enhancements

- [ ] **Recording enhancements**
  - [ ] Dialog recording (alert, confirm, prompt)
  - [ ] Download dialog recording
  - [ ] Tab/frame recording
  - [ ] Element highlighting during record

- [ ] **Scripting interface**
  - [ ] `iimGetLastPerformance()`
  - [ ] Browser window access for JS macros (if possible in Chrome)

---

## SUMMARY STATISTICS

| Metric | Count |
|--------|-------|
| **Critical bugs** | 2 |
| **Missing features** | 35+ |
| **Partially implemented** | 5 |
| **Total TODO items** | 50+ |

**Estimated effort to reach full parity:** 2-4 weeks of focused development

---

*Report generated from comprehensive audit of all source files in both original and remastered codebases*
