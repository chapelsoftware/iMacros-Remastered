# iMacros Command Reference

Complete reference for all 40+ iMacros commands supported in iMacros for Firefox.

## Table of Contents

- [Navigation Commands](#navigation-commands)
- [Interaction Commands](#interaction-commands)
- [Data Commands](#data-commands)
- [Flow Control Commands](#flow-control-commands)
- [Dialog Commands](#dialog-commands)
- [Download Commands](#download-commands)
- [Browser Commands](#browser-commands)
- [System Commands](#system-commands)
- [File Commands](#file-commands)
- [Built-in Variables](#built-in-variables)

---

## Navigation Commands

### URL

Navigate to a URL or get the current URL.

**Syntax:**
```
URL GOTO=<url>
URL CURRENT
```

**Parameters:**
| Parameter | Description |
|-----------|-------------|
| `GOTO` | URL to navigate to |
| `CURRENT` | Flag to get current URL (stored in `!URLCURRENT`) |

**Examples:**
```
URL GOTO=https://www.google.com
URL GOTO={{!VAR1}}
URL CURRENT
```

---

### TAB

Manage browser tabs.

**Syntax:**
```
TAB T=<number>
TAB OPEN [URL=<url>]
TAB CLOSE
TAB CLOSEALLOTHERS
```

**Parameters:**
| Parameter | Description |
|-----------|-------------|
| `T` | Tab number to switch to (1-based) |
| `OPEN` | Open a new tab |
| `URL` | URL for the new tab (with OPEN) |
| `CLOSE` | Close the current tab |
| `CLOSEALLOTHERS` | Close all tabs except current |

**Examples:**
```
TAB T=1
TAB T=2
TAB OPEN
TAB OPEN URL=https://example.com
TAB CLOSE
TAB CLOSEALLOTHERS
```

---

### FRAME

Select a frame or iframe for subsequent commands.

**Syntax:**
```
FRAME F=<number>
FRAME NAME=<name>
```

**Parameters:**
| Parameter | Description |
|-----------|-------------|
| `F` | Frame index (0 = main document, 1+ = frames) |
| `NAME` | Frame name attribute |

**Examples:**
```
FRAME F=0
FRAME F=1
FRAME NAME=content_frame
```

---

### BACK

Navigate to the previous page in browser history.

**Syntax:**
```
BACK
```

**Examples:**
```
URL GOTO=https://example.com
URL GOTO=https://example.com/page2
BACK
' Now on example.com
```

---

### REFRESH

Reload the current page.

**Syntax:**
```
REFRESH
```

**Examples:**
```
REFRESH
WAIT SECONDS=2
```

---

## Interaction Commands

### TAG

Find and interact with page elements. The most powerful and commonly used command.

**Syntax:**
```
TAG POS=<pos> TYPE=<type> ATTR=<attributes> [CONTENT=<value>] [EXTRACT=<what>]
TAG XPATH=<xpath> [CONTENT=<value>] [EXTRACT=<what>]
TAG CSS=<selector> [CONTENT=<value>] [EXTRACT=<what>]
```

**Parameters:**
| Parameter | Description |
|-----------|-------------|
| `POS` | Element position (1 = first, -1 = last, R1 = random) |
| `TYPE` | HTML tag name (INPUT, A, DIV, *, etc.) |
| `ATTR` | Attribute selector (see below) |
| `XPATH` | XPath expression |
| `CSS` | CSS selector |
| `CONTENT` | Value to enter/action to perform |
| `EXTRACT` | What to extract (TXT, HTM, HREF, etc.) |

**ATTR Syntax:**
```
NAME:value           - Match name attribute
ID:value             - Match id attribute
TXT:value            - Match inner text
CLASS:value          - Match class name
HREF:value           - Match href attribute
NAME:a&&CLASS:b      - Multiple conditions (AND)
NAME:*               - Wildcard match
```

**CONTENT Special Values:**
| Value | Description |
|-------|-------------|
| `<SP>` | Space character |
| `<BR>` | Newline/line break |
| `<TAB>` | Tab character |
| `<ENTER>` | Enter key |
| `<SUBMIT>` | Submit the form |
| `<RESET>` | Reset the form |
| `%value` | Select dropdown option by value |
| `#index` | Select dropdown option by index |

**EXTRACT Types:**
| Type | Description |
|------|-------------|
| `TXT` | Inner text content |
| `HTM` | Inner HTML |
| `HREF` | href attribute |
| `SRC` | src attribute |
| `ALT` | alt attribute |
| `TITLE` | title attribute |
| `VALUE` | value attribute |
| `ID` | id attribute |
| `CLASS` | class attribute |
| `NAME` | name attribute |

**Examples:**
```
' Click a link by text
TAG POS=1 TYPE=A ATTR=TXT:Click<SP>Here

' Fill a text input
TAG POS=1 TYPE=INPUT ATTR=NAME:username CONTENT=john_doe

' Select dropdown option
TAG POS=1 TYPE=SELECT ATTR=NAME:country CONTENT=%US

' Extract text
TAG POS=1 TYPE=SPAN ATTR=ID:result EXTRACT=TXT

' Extract link URL
TAG POS=1 TYPE=A ATTR=TXT:More* EXTRACT=HREF

' Using XPath
TAG XPATH=//input[@id='search'] CONTENT=query

' Using CSS selector
TAG CSS=.btn-primary CONTENT=<CLICK>

' Submit a form
TAG POS=1 TYPE=FORM ATTR=ID:login-form CONTENT=<SUBMIT>
```

---

### CLICK

Click at specific screen coordinates.

**Syntax:**
```
CLICK X=<x> Y=<y> [CONTENT=<button>]
```

**Parameters:**
| Parameter | Description |
|-----------|-------------|
| `X` | X coordinate |
| `Y` | Y coordinate |
| `CONTENT` | Mouse button (left, middle, right) |

**Examples:**
```
CLICK X=100 Y=200
CLICK X=50 Y=50 CONTENT=right
```

---

### EVENT

Dispatch DOM events to elements.

**Syntax:**
```
EVENT TYPE=<event> [SELECTOR=<sel>] [XPATH=<xpath>] [CSS=<css>]
EVENT TYPE=<event> [KEY=<key>] [MODIFIERS=<mods>]
EVENT TYPE=<event> [POINT=<x,y>] [BUTTON=<num>]
```

**Parameters:**
| Parameter | Description |
|-----------|-------------|
| `TYPE` | Event type (click, keydown, mouseover, etc.) |
| `SELECTOR` | Element selector (CSS:... or XPATH:...) |
| `XPATH` | XPath expression |
| `CSS` | CSS selector |
| `KEY` | Key name for keyboard events |
| `CHAR` | Character for keypress events |
| `POINT` | Coordinates for mouse events (x,y) |
| `BUTTON` | Mouse button number (0, 1, 2) |
| `MODIFIERS` | Modifier keys (ctrl+shift, alt, etc.) |

**Event Types:**
- Mouse: click, dblclick, mousedown, mouseup, mouseover, mouseout, mousemove, mouseenter, mouseleave, contextmenu
- Keyboard: keydown, keyup, keypress
- Form: focus, blur, change, input, submit, reset
- Touch: touchstart, touchend, touchmove, touchcancel
- Other: scroll, wheel

**Examples:**
```
' Hover over an element
EVENT TYPE=mouseover CSS=.dropdown-trigger

' Send keyboard event
EVENT TYPE=keydown KEY=Enter

' Send key with modifiers
EVENT TYPE=keydown KEY=a MODIFIERS=ctrl

' Trigger scroll
EVENT TYPE=scroll CSS=.scrollable-div
```

---

## Data Commands

### SET

Set a variable value.

**Syntax:**
```
SET <variable> <value>
SET <variable> EVAL(<expression>)
```

**Parameters:**
| Parameter | Description |
|-----------|-------------|
| `variable` | Variable name (e.g., !VAR1) |
| `value` | Value to set |
| `EVAL()` | Evaluate arithmetic expression |

**Examples:**
```
SET !VAR1 "Hello World"
SET !VAR2 {{!VAR1}}
SET !VAR3 EVAL({{!LOOP}} * 10)
SET !TIMEOUT_STEP 5
SET !ERRORIGNORE YES
```

---

### ADD

Add a numeric value to a variable.

**Syntax:**
```
ADD <variable> <value>
```

**Examples:**
```
SET !VAR1 10
ADD !VAR1 5
' !VAR1 is now 15

ADD !VAR1 -3
' !VAR1 is now 12
```

---

### EXTRACT

Extract data and store in `!EXTRACT`.

**Syntax:**
```
EXTRACT <data>
```

**Note:** Usually used via TAG with EXTRACT parameter. Direct EXTRACT stores literal data.

**Examples:**
```
' Direct extraction
EXTRACT "some literal data"

' Via TAG command (more common)
TAG POS=1 TYPE=DIV ATTR=ID:content EXTRACT=TXT
```

---

### SEARCH

Search page content for text or patterns.

**Syntax:**
```
SEARCH SOURCE=TXT:<pattern>
SEARCH SOURCE=REGEXP:<pattern> [EXTRACT=<template>]
SEARCH SOURCE=<type>:<pattern> IGNORE_CASE=YES
```

**Parameters:**
| Parameter | Description |
|-----------|-------------|
| `SOURCE` | Search pattern (TXT: or REGEXP:) |
| `EXTRACT` | Extraction template (e.g., $1) |
| `IGNORE_CASE` | YES or NO |

**Examples:**
```
' Find literal text
SEARCH SOURCE=TXT:Order Confirmed

' Find with regex
SEARCH SOURCE=REGEXP:Order\s+#(\d+)

' Extract capture group
SEARCH SOURCE=REGEXP:Total:\s*\$([0-9.]+) EXTRACT=$1
```

---

### PROMPT

Display an input dialog and store user input.

**Syntax:**
```
PROMPT <message> [VAR=<variable>] [DEFAULT=<value>]
```

**Parameters:**
| Parameter | Description |
|-----------|-------------|
| `message` | Prompt message |
| `VAR` | Variable to store input (default: !INPUT) |
| `DEFAULT` | Default value |

**Examples:**
```
PROMPT "Enter your username:"
PROMPT "Enter search term:" VAR=!VAR1
PROMPT "Enter count:" VAR=!VAR2 DEFAULT=10
```

---

## Flow Control Commands

### WAIT

Pause execution for a specified time.

**Syntax:**
```
WAIT SECONDS=<seconds>
```

**Examples:**
```
WAIT SECONDS=2
WAIT SECONDS=0.5
WAIT SECONDS={{!VAR1}}
```

---

### PAUSE

Pause execution and wait for user to click Continue.

**Syntax:**
```
PAUSE
```

**Examples:**
```
' Pause for manual verification
TAG POS=1 TYPE=BUTTON ATTR=TXT:Submit
PAUSE
' User clicks Continue
TAG POS=1 TYPE=DIV ATTR=ID:result EXTRACT=TXT
```

---

### STOPWATCH

Measure execution time.

**Syntax:**
```
STOPWATCH ID=<name> ACTION=START
STOPWATCH ID=<name> ACTION=STOP
STOPWATCH ID=<name> ACTION=LAP
STOPWATCH ID=<name> ACTION=READ
```

**Parameters:**
| Parameter | Description |
|-----------|-------------|
| `ID` | Stopwatch identifier |
| `ACTION` | START, STOP, LAP, or READ |

Time is stored in `!STOPWATCH_<ID>` variable in milliseconds.

**Examples:**
```
STOPWATCH ID=timer1 ACTION=START
URL GOTO=https://example.com
STOPWATCH ID=timer1 ACTION=LAP
' Check !STOPWATCH_TIMER1 for lap time
URL GOTO=https://example.com/page2
STOPWATCH ID=timer1 ACTION=STOP
' Check !STOPWATCH_TIMER1 for total time
```

---

## Dialog Commands

### ONDIALOG

Configure automatic handling of alert/confirm/prompt dialogs.

**Syntax:**
```
ONDIALOG POS=<pos> BUTTON=<button> [CONTENT=<response>]
```

**Parameters:**
| Parameter | Description |
|-----------|-------------|
| `POS` | Dialog position (usually 1) |
| `BUTTON` | OK, CANCEL, YES, or NO |
| `CONTENT` | Response for prompt dialogs |

**Examples:**
```
' Click OK on alert
ONDIALOG POS=1 BUTTON=OK

' Click Cancel on confirm
ONDIALOG POS=1 BUTTON=CANCEL

' Enter text in prompt
ONDIALOG POS=1 BUTTON=OK CONTENT="my response"
```

---

### ONLOGIN

Configure HTTP authentication credentials.

**Syntax:**
```
ONLOGIN USER=<username> PASSWORD=<password>
```

**Examples:**
```
ONLOGIN USER=admin PASSWORD=secret123
URL GOTO=https://protected.example.com
```

---

### ONCERTIFICATEDIALOG

Handle SSL certificate dialogs.

**Syntax:**
```
ONCERTIFICATEDIALOG BUTTON=<button>
```

**Examples:**
```
ONCERTIFICATEDIALOG BUTTON=OK
```

---

### ONERRORDIALOG

Handle error dialogs.

**Syntax:**
```
ONERRORDIALOG BUTTON=<button>
```

---

### ONSECURITYDIALOG

Handle security dialogs.

**Syntax:**
```
ONSECURITYDIALOG BUTTON=<button>
```

---

### ONWEBPAGEDIALOG

Handle web page modal dialogs.

**Syntax:**
```
ONWEBPAGEDIALOG BUTTON=<button> [CONTENT=<response>]
```

---

### ONPRINT

Handle print dialogs.

**Syntax:**
```
ONPRINT BUTTON=<button>
```

---

## Download Commands

### ONDOWNLOAD

Set download destination for subsequent downloads.

**Syntax:**
```
ONDOWNLOAD FOLDER=<path> FILE=<filename>
ONDOWNLOAD FOLDER=* FILE=+
```

**Parameters:**
| Parameter | Description |
|-----------|-------------|
| `FOLDER` | Download folder path (* = default) |
| `FILE` | Filename (+ = auto-generate) |
| `WAIT` | YES to wait for download completion |

**Examples:**
```
ONDOWNLOAD FOLDER=C:\Downloads FILE=report.pdf
ONDOWNLOAD FOLDER={{!FOLDER_DOWNLOAD}} FILE=data_{{!LOOP}}.csv
ONDOWNLOAD FOLDER=* FILE=+
```

---

### SAVEAS

Save page content to a file.

**Syntax:**
```
SAVEAS TYPE=<type> FOLDER=<path> FILE=<filename> [QUALITY=<0-100>]
```

**Parameters:**
| Parameter | Description |
|-----------|-------------|
| `TYPE` | TXT, HTM, PNG, JPG, PDF, CPL, MHT, EXTRACT |
| `FOLDER` | Output folder |
| `FILE` | Output filename |
| `QUALITY` | JPEG quality (0-100) |

**Types:**
| Type | Description |
|------|-------------|
| `TXT` | Plain text |
| `HTM` | HTML source |
| `PNG` | Screenshot (PNG) |
| `JPG` | Screenshot (JPEG) |
| `PDF` | Page as PDF |
| `CPL` | Complete page (HTML + resources) |
| `MHT` | MHTML archive |
| `EXTRACT` | Extracted data |

**Examples:**
```
SAVEAS TYPE=PNG FOLDER=C:\Screenshots FILE=page_{{!LOOP}}.png
SAVEAS TYPE=HTM FOLDER=C:\Pages FILE=source.html
SAVEAS TYPE=EXTRACT FOLDER=C:\Data FILE=data.txt
SAVEAS TYPE=JPG FOLDER=C:\Images FILE=photo.jpg QUALITY=85
```

---

### SAVEITEM

Save a specific item (link target, image).

**Syntax:**
```
SAVEITEM [URL=<url>] [FOLDER=<path>] [FILE=<filename>]
```

**Examples:**
```
' Save using ONDOWNLOAD settings
SAVEITEM

' Save specific URL
SAVEITEM URL=https://example.com/image.jpg FOLDER=C:\Images FILE=saved.jpg
```

---

## Browser Commands

### CLEAR

Clear browser data.

**Syntax:**
```
CLEAR
CLEAR COOKIES
CLEAR CACHE
CLEAR HISTORY
CLEAR ALL
```

**Examples:**
```
' Clear cookies only
CLEAR COOKIES

' Clear everything
CLEAR ALL
```

---

### FILTER

Control content filtering (block images, popups, etc.).

**Syntax:**
```
FILTER TYPE=<type> STATUS=<on/off>
FILTER TYPE=NONE
```

**Parameters:**
| Parameter | Description |
|-----------|-------------|
| `TYPE` | IMAGES, FLASH, POPUPS, or NONE |
| `STATUS` | ON (block) or OFF (allow) |

**Examples:**
```
' Block images for faster loading
FILTER TYPE=IMAGES STATUS=ON

' Block popups
FILTER TYPE=POPUPS STATUS=ON

' Disable all filters
FILTER TYPE=NONE
```

---

### PROXY

Configure proxy settings.

**Syntax:**
```
PROXY ADDRESS=<host:port> [TYPE=<type>] [BYPASS=<list>]
PROXY ADDRESS=DIRECT
```

**Parameters:**
| Parameter | Description |
|-----------|-------------|
| `ADDRESS` | Proxy address (host:port) or DIRECT |
| `TYPE` | HTTP, HTTPS, SOCKS4, SOCKS5 |
| `USER` | Proxy username |
| `PASSWORD` | Proxy password |
| `BYPASS` | Comma-separated list of hosts to bypass |

**Examples:**
```
' Set HTTP proxy
PROXY ADDRESS=192.168.1.1:8080

' Set SOCKS5 proxy
PROXY ADDRESS=proxy.example.com:1080 TYPE=SOCKS5

' Authenticated proxy
PROXY ADDRESS=proxy.example.com:8080 USER=admin PASSWORD=secret

' Clear proxy
PROXY ADDRESS=DIRECT
```

---

### SCREENSHOT

Capture a screenshot.

**Syntax:**
```
SCREENSHOT TYPE=<type> FOLDER=<path> FILE=<filename> [QUALITY=<0-100>]
```

**Parameters:**
| Parameter | Description |
|-----------|-------------|
| `TYPE` | BROWSER (viewport) or PAGE (full page) |
| `FOLDER` | Output folder |
| `FILE` | Output filename |
| `QUALITY` | JPEG quality |

**Examples:**
```
SCREENSHOT TYPE=BROWSER FOLDER=C:\Shots FILE=screen.png
SCREENSHOT TYPE=PAGE FOLDER=C:\Shots FILE=fullpage.png
```

---

## System Commands

### VERSION

Check/set minimum version requirement.

**Syntax:**
```
VERSION BUILD=<version>
```

**Examples:**
```
VERSION BUILD=8.9.7
```

---

### CMDLINE

Execute a shell command (requires native host).

**Syntax:**
```
CMDLINE CMD=<command> [WAIT=YES|NO] [TIMEOUT=<seconds>]
```

**Parameters:**
| Parameter | Description |
|-----------|-------------|
| `CMD` | Command to execute |
| `WAIT` | Wait for completion (default: YES) |
| `TIMEOUT` | Maximum execution time in seconds |

**Output Variables:**
| Variable | Description |
|----------|-------------|
| `!CMDLINE_EXITCODE` | Exit code |
| `!CMDLINE_STDOUT` | Standard output |
| `!CMDLINE_STDERR` | Standard error |

**Examples:**
```
' Run a command
CMDLINE CMD="dir /b"

' Run without waiting
CMDLINE CMD="notepad.exe" WAIT=NO

' With timeout
CMDLINE CMD="ping -n 5 localhost" TIMEOUT=30
```

---

### DISCONNECT

Disconnect from network (requires native host).

**Syntax:**
```
DISCONNECT
```

---

### REDIAL

Reconnect to network (requires native host).

**Syntax:**
```
REDIAL [CONNECTION=<name>]
```

---

## File Commands

### FILEDELETE

Delete a file or directory (requires native host).

**Syntax:**
```
FILEDELETE NAME=<path>
```

**Examples:**
```
FILEDELETE NAME=C:\temp\old_file.txt
FILEDELETE NAME={{!FOLDER_DOWNLOAD}}output.csv
```

---

## Built-in Variables

### General Variables

| Variable | Description | Read/Write |
|----------|-------------|------------|
| `!VAR0` - `!VAR9` | General-purpose variables | R/W |
| `!LOOP` | Current loop iteration (1-based) | R |
| `!EXTRACT` | Last extracted value | R/W |
| `!EXTRACTADD` | All extractions (concatenated) | R |
| `!CLIPBOARD` | System clipboard | R/W |

### URL Variables

| Variable | Description | Read/Write |
|----------|-------------|------------|
| `!URLSTART` | URL at macro start | R |
| `!URLCURRENT` | Current page URL | R |

### Data Source Variables

| Variable | Description | Read/Write |
|----------|-------------|------------|
| `!DATASOURCE` | Data source file path | R/W |
| `!DATASOURCE_LINE` | Current line number | R/W |
| `!DATASOURCE_COLUMNS` | Number of columns | R |
| `!COL1` - `!COL10` | Column values | R |

### Timeout Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `!TIMEOUT` | General timeout (seconds) | 60 |
| `!TIMEOUT_PAGE` | Page load timeout (seconds) | 60 |
| `!TIMEOUT_STEP` | Element wait timeout (seconds) | 6 |

### Error Handling Variables

| Variable | Description | Values |
|----------|-------------|--------|
| `!ERRORIGNORE` | Ignore errors | YES/NO |
| `!ERRORLOOP` | Skip to next loop on error | YES/NO |
| `!SINGLESTEP` | Single-step mode | YES/NO |

### Folder Variables

| Variable | Description |
|----------|-------------|
| `!FOLDER_MACROS` | Macros folder path |
| `!FOLDER_DATASOURCE` | Data source folder path |
| `!FOLDER_DOWNLOAD` | Download folder path |

### Date/Time Variables

| Variable | Format |
|----------|--------|
| `!NOW` | YYYYMMDD_HHMMSS |
| `!NOW:yyyy-mm-dd` | Custom format |

**Format Tokens:**
- `yyyy` - 4-digit year
- `yy` - 2-digit year
- `mm` - Month (01-12)
- `dd` - Day (01-31)
- `hh` - Hour (00-23)
- `nn` - Minutes (00-59)
- `ss` - Seconds (00-59)
- `dow` - Day of week (0-6)
- `doy` - Day of year (001-366)

---

## Error Codes

| Code | Description |
|------|-------------|
| 0 | OK - Success |
| -910 | Syntax error |
| -911 | Invalid command |
| -912 | Invalid parameter |
| -913 | Missing required parameter |
| -920 | Element not found |
| -921 | Element not visible |
| -922 | Element not enabled |
| -923 | Multiple elements matched |
| -930 | Timeout |
| -931 | Page load timeout |
| -932 | Step timeout |
| -940 | Frame error |
| -941 | Frame not found |
| -950 | Download error |
| -951 | Download failed |
| -952 | Download timeout |
| -960 | File error |
| -961 | File not found |
| -962 | File access denied |
| -963 | File write error |
| -970 | Script error |
| -971 | Script exception |
| -980 | Data source error |
| -981 | Data source not found |
| -982 | Data source parse error |
| -983 | End of data source |
| -990 | Loop limit reached |
| -991 | Loop error |
| -100 | Aborted by user |
| -101 | Paused by user |

---

*iMacros for Firefox v8.9.7 - Command Reference*
