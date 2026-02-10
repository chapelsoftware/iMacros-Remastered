# iMacros Command Comparison Documentation

This documentation compares the original iMacros 8.9.7 browser extension with iMacros Remastered, ensuring 100% backwards compatibility with existing macros.

## Methodology

Each command and JS API function is documented with:
- **Syntax**: Original regex pattern or function signature
- **Parameters**: Complete parameter documentation
- **Internal Logic**: Step-by-step breakdown of the original implementation
- **Output**: Variables modified, return values, side effects
- **Differences**: Any behavioral differences between implementations
- **Test Coverage**: Existing tests for the command

## Reference Files

| Purpose | Path |
|---------|------|
| Old commands | `reference/imacros-8.9.7/chrome-extracted/content/MacroPlayer.js` |
| Old JS API | `reference/imacros-8.9.7/chrome-extracted/content/jsplayer.js` |
| New command handlers | `shared/src/commands/*.ts` |
| New scripting interface | `native-host/src/services/scripting-interface.ts` |
| New JS debugger | `native-host/src/debugger/js-debugger.ts` |

---

## Macro Commands (42)

| # | Command | Status | File |
|---|---------|--------|------|
| 1 | [ADD](commands/ADD.md) | Complete | commands/ADD.md |
| 2 | [BACK](commands/BACK.md) | Complete | commands/BACK.md |
| 3 | [CLEAR](commands/CLEAR.md) | Complete | commands/CLEAR.md |
| 4 | [CLICK](commands/CLICK.md) | Pending | |
| 5 | [CMDLINE](commands/CMDLINE.md) | Pending | |
| 6 | [DISCONNECT](commands/DISCONNECT.md) | Pending | |
| 7 | [DS](commands/DS.md) | Pending | |
| 8 | [EVENT](commands/EVENT.md) | Pending | |
| 9 | [EVENTS](commands/EVENTS.md) | Pending | |
| 10 | [EXTRACT](commands/EXTRACT.md) | Pending | |
| 11 | [FILEDELETE](commands/FILEDELETE.md) | Pending | |
| 12 | [FILTER](commands/FILTER.md) | Pending | |
| 13 | [FRAME](commands/FRAME.md) | Pending | |
| 14 | [IMAGECLICK](commands/IMAGECLICK.md) | Pending | |
| 15 | [IMAGESEARCH](commands/IMAGESEARCH.md) | Complete | commands/IMAGESEARCH.md |
| 16 | [ONCERTIFICATEDIALOG](commands/ONCERTIFICATEDIALOG.md) | Complete | commands/ONCERTIFICATEDIALOG.md |
| 17 | [ONDIALOG](commands/ONDIALOG.md) | Pending | |
| 18 | [ONDOWNLOAD](commands/ONDOWNLOAD.md) | Pending | |
| 19 | [ONERRORDIALOG](commands/ONERRORDIALOG.md) | Pending | |
| 20 | [ONLOGIN](commands/ONLOGIN.md) | Pending | |
| 21 | [ONPRINT](commands/ONPRINT.md) | Pending | |
| 22 | [ONSECURITYDIALOG](commands/ONSECURITYDIALOG.md) | Pending | |
| 23 | [ONWEBPAGEDIALOG](commands/ONWEBPAGEDIALOG.md) | Pending | |
| 24 | [PAUSE](commands/PAUSE.md) | Pending | |
| 25 | [PRINT](commands/PRINT.md) | Pending | |
| 26 | [PROMPT](commands/PROMPT.md) | Pending | |
| 27 | [PROXY](commands/PROXY.md) | Pending | |
| 28 | [REDIAL](commands/REDIAL.md) | Pending | |
| 29 | [REFRESH](commands/REFRESH.md) | Complete | commands/REFRESH.md |
| 30 | [SAVEAS](commands/SAVEAS.md) | Pending | |
| 31 | [SAVEITEM](commands/SAVEITEM.md) | Pending | |
| 32 | [SCREENSHOT](commands/SCREENSHOT.md) | Pending | |
| 33 | [SEARCH](commands/SEARCH.md) | Pending | |
| 34 | [SET](commands/SET.md) | Pending | |
| 35 | [SIZE](commands/SIZE.md) | Pending | |
| 36 | [STOPWATCH](commands/STOPWATCH.md) | Pending | |
| 37 | [TAB](commands/TAB.md) | Pending | |
| 38 | [TAG](commands/TAG.md) | Pending | |
| 39 | [URL](commands/URL.md) | Pending | |
| 40 | [VERSION](commands/VERSION.md) | Pending | |
| 41 | [WAIT](commands/WAIT.md) | Pending | |
| 42 | [WINCLICK](commands/WINCLICK.md) | Pending | |

---

## JS API Functions (15)

| # | Function | Status | File |
|---|----------|--------|------|
| 1 | [iimPlay](js-api/iimPlay.md) | Pending | |
| 2 | [iimPlayCode](js-api/iimPlayCode.md) | Pending | |
| 3 | [iimDisplay](js-api/iimDisplay.md) | Pending | |
| 4 | [iimExit](js-api/iimExit.md) | Pending | |
| 5 | [iimClose](js-api/iimClose.md) | Pending | |
| 6 | [iimGetLastError](js-api/iimGetLastError.md) | Pending | |
| 7 | [iimGetErrorText](js-api/iimGetErrorText.md) | Pending | |
| 8 | [iimGetLastPerformance](js-api/iimGetLastPerformance.md) | Pending | |
| 9 | [iimSet](js-api/iimSet.md) | Pending | |
| 10 | [iimGetLastExtract](js-api/iimGetLastExtract.md) | Pending | |
| 11 | [iimGetExtract](js-api/iimGetExtract.md) | Pending | |
| 12 | [window (global)](js-api/global-window.md) | Pending | |
| 13 | [content (global)](js-api/global-content.md) | Pending | |
| 14 | [prompt (global)](js-api/global-prompt.md) | Pending | |
| 15 | [alert (global)](js-api/global-alert.md) | Pending | |
| 16 | [confirm (global)](js-api/global-confirm.md) | Pending | |

---

## Completion Progress

- Commands: 6/42 complete
- JS API: 0/16 complete
- **Total: 6/58 complete**
