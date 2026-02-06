# iMacros for Firefox - User Guide

## Introduction

iMacros for Firefox is a browser automation extension that allows you to record and replay repetitive tasks. Whether you need to fill forms, test web applications, scrape data, or automate workflows, iMacros provides a simple scripting language to accomplish these tasks.

This version is a modern rewrite of the classic iMacros extension, built with TypeScript and designed for the latest Firefox browser APIs.

## Table of Contents

1. [Installation](#installation)
2. [Getting Started](#getting-started)
3. [The iMacros Panel](#the-imacros-panel)
4. [Recording Macros](#recording-macros)
5. [Playing Macros](#playing-macros)
6. [Editing Macros](#editing-macros)
7. [Variables](#variables)
8. [Data Sources](#data-sources)
9. [Error Handling](#error-handling)
10. [Tips and Best Practices](#tips-and-best-practices)

---

## Installation

### Browser Extension

1. Download the iMacros extension package (`.xpi` file for Firefox)
2. In Firefox, go to `about:addons`
3. Click the gear icon and select "Install Add-on From File..."
4. Select the downloaded `.xpi` file
5. Click "Add" when prompted to confirm the installation

### Native Host (Required for File Access)

The native host component is required for:
- Reading and writing macro files on disk
- Executing system commands (CMDLINE)
- File operations (FILEDELETE, SAVEAS)

To install the native host:

1. Download the native host installer for your operating system
2. Run the installer
3. Restart Firefox

**Windows:**
```
imacros-native-host-setup.exe
```

**macOS/Linux:**
```bash
chmod +x install-native-host.sh
./install-native-host.sh
```

---

## Getting Started

### Opening the iMacros Panel

Click the iMacros icon in the Firefox toolbar to open the side panel. The panel contains:

- **File Tree**: Browse and manage your macro files
- **Play Controls**: Play, pause, and stop macros
- **Record Button**: Start/stop recording
- **Loop Controls**: Set how many times to repeat a macro
- **Status Area**: View execution progress and messages

### Your First Macro

1. Click the **Record** button
2. Navigate to a website
3. Perform the actions you want to automate (click links, fill forms, etc.)
4. Click **Stop** to end recording
5. Enter a name for your macro and save it
6. Click **Play** to replay your actions

### Example Macro

Here's a simple macro that opens Google and searches for "iMacros":

```
VERSION BUILD=8.9.7
URL GOTO=https://www.google.com
TAG POS=1 TYPE=INPUT ATTR=NAME:q CONTENT=iMacros
TAG POS=1 TYPE=INPUT ATTR=NAME:btnK CONTENT=<SUBMIT>
```

---

## The iMacros Panel

### File Tree

The file tree displays your macro files and folders. Files are stored in the iMacros folder configured in settings.

- **Single-click**: Select a macro
- **Double-click**: Open in editor
- **Right-click**: Context menu (Rename, Delete, Create folder)

### Control Bar

| Button | Function |
|--------|----------|
| Play | Execute the selected macro |
| Pause | Pause execution (click again to resume) |
| Stop | Stop execution immediately |
| Record | Start/stop recording |
| Edit | Open the selected macro in the editor |
| Refresh | Reload the file tree |

### Loop Settings

- **Current**: Shows which loop iteration is running
- **Max**: Set the maximum number of loops (1 = run once)
- Use the **!LOOP** variable in your macro to access the current loop number

---

## Recording Macros

### What Gets Recorded

The recorder captures:
- Page navigation (URL changes)
- Clicks on links and buttons
- Form input (text fields, checkboxes, dropdowns)
- Tab operations

### Recording Tips

1. **Slow down**: Perform actions deliberately to ensure accurate recording
2. **Wait for pages**: Let pages fully load before interacting
3. **Use unique identifiers**: Click on elements with unique IDs or names when possible
4. **Review and edit**: Always review recorded macros and clean up unnecessary lines

### Recording Options

Access recording options in Settings:
- **Record navigation**: Include URL commands
- **Record waits**: Add WAIT commands after page loads
- **Direct recording**: Record to editor instead of file

---

## Playing Macros

### Basic Playback

1. Select a macro from the file tree
2. Click **Play**
3. Watch the macro execute

### Loop Playback

To run a macro multiple times:

1. Set the **Max** loop value (e.g., 10)
2. Click **Play**
3. The macro runs repeatedly until:
   - Max loops reached
   - An error occurs
   - You click **Stop**

### Playback Speed

Adjust execution speed with the **!TIMEOUT_STEP** variable:

```
' Fast playback (1 second wait for elements)
SET !TIMEOUT_STEP 1

' Slow playback (10 second wait for elements)
SET !TIMEOUT_STEP 10
```

---

## Editing Macros

### The Editor

Open the editor by:
- Double-clicking a macro
- Selecting a macro and clicking **Edit**
- Using the keyboard shortcut (Ctrl+E / Cmd+E)

### Editor Features

- **Syntax highlighting**: Commands, parameters, and values are color-coded
- **Auto-completion**: Press Tab to complete commands
- **Error checking**: Syntax errors are highlighted
- **Line numbers**: Reference specific lines easily

### Macro Syntax

Each line contains one command:

```
COMMAND PARAM1=value1 PARAM2=value2
```

Comments start with a single quote:

```
' This is a comment
URL GOTO=https://example.com
```

---

## Variables

### Built-in Variables

| Variable | Description |
|----------|-------------|
| `!VAR0` - `!VAR9` | General-purpose variables |
| `!LOOP` | Current loop iteration (1-based) |
| `!EXTRACT` | Last extracted data |
| `!URLCURRENT` | Current page URL |
| `!NOW` | Current date/time |
| `!CLIPBOARD` | System clipboard content |
| `!COL1` - `!COL10` | Data source columns |

### Setting Variables

```
' Set a variable
SET !VAR1 "Hello World"

' Set with expression
SET !VAR2 EVAL({{!VAR1}} + " from iMacros")

' Set from extracted data
TAG POS=1 TYPE=SPAN ATTR=ID:result EXTRACT=TXT
SET !VAR3 {{!EXTRACT}}
```

### Using Variables

Reference variables with double curly braces:

```
URL GOTO=https://example.com/page/{{!LOOP}}
TAG POS=1 TYPE=INPUT ATTR=NAME:username CONTENT={{!VAR1}}
```

### Date/Time Variables

The `!NOW` variable supports formatting:

```
' Default format: YYYYMMDD_HHMMSS
SET !VAR1 {{!NOW}}

' Custom format
SET !VAR2 {{!NOW:yyyy-mm-dd}}
SET !VAR3 {{!NOW:hh:nn:ss}}
```

Format tokens:
- `yyyy` - 4-digit year
- `yy` - 2-digit year
- `mm` - Month (01-12)
- `dd` - Day (01-31)
- `hh` - Hour (00-23)
- `nn` - Minutes (00-59)
- `ss` - Seconds (00-59)

---

## Data Sources

### Using CSV Data

Load data from a CSV file:

```
' Set the data source
SET !DATASOURCE users.csv
SET !DATASOURCE_LINE {{!LOOP}}

' Use column data
TAG POS=1 TYPE=INPUT ATTR=NAME:username CONTENT={{!COL1}}
TAG POS=1 TYPE=INPUT ATTR=NAME:email CONTENT={{!COL2}}
```

### CSV Format

```csv
username,email,password
john,john@example.com,pass123
jane,jane@example.com,pass456
```

### Looping Through Data

```
' Loop through all rows
SET !DATASOURCE data.csv
SET !DATASOURCE_LINE {{!LOOP}}

' Check for end of data
' (macro will error at end of file unless !ERRORIGNORE is YES)
SET !ERRORIGNORE YES
```

---

## Error Handling

### Error Variables

| Variable | Description |
|----------|-------------|
| `!ERRORIGNORE` | YES = continue on errors, NO = stop (default) |
| `!ERRORLOOP` | YES = skip to next loop on error |

### Common Error Codes

| Code | Description |
|------|-------------|
| 0 | Success |
| -920 | Element not found |
| -921 | Element not visible |
| -930 | Timeout |
| -960 | File error |

### Error Handling Examples

```
' Ignore all errors
SET !ERRORIGNORE YES
TAG POS=1 TYPE=BUTTON ATTR=TXT:Submit

' Only ignore errors for this line, then stop
SET !ERRORIGNORE YES
TAG POS=1 TYPE=BUTTON ATTR=TXT:Submit
SET !ERRORIGNORE NO

' Skip to next loop on error
SET !ERRORLOOP YES
```

---

## Tips and Best Practices

### 1. Use Descriptive Names

Name macros clearly:
- `login-to-site.iim` (good)
- `macro1.iim` (bad)

### 2. Add Comments

Document your macros:

```
' Login Macro
' Author: John Doe
' Date: 2024-01-15
' Description: Logs into the admin panel

VERSION BUILD=8.9.7

' Navigate to login page
URL GOTO=https://admin.example.com/login

' Enter credentials
TAG POS=1 TYPE=INPUT ATTR=NAME:username CONTENT={{!VAR1}}
TAG POS=1 TYPE=INPUT ATTR=NAME:password CONTENT={{!VAR2}}
```

### 3. Use Timeouts Wisely

```
' Increase timeout for slow pages
SET !TIMEOUT_PAGE 120

' Decrease step timeout for faster execution
SET !TIMEOUT_STEP 3
```

### 4. Handle Dynamic Content

For pages that load content dynamically:

```
' Wait for element to appear
SET !TIMEOUT_STEP 10
TAG POS=1 TYPE=DIV ATTR=ID:dynamic-content EXTRACT=TXT
```

### 5. Use WAIT for Timing

```
' Wait 2 seconds
WAIT SECONDS=2

' Wait for page to settle after AJAX
WAIT SECONDS=1
TAG POS=1 TYPE=BUTTON ATTR=TXT:Submit
```

### 6. Test in Small Steps

- Record small portions
- Test each part
- Combine into larger macros

### 7. Back Up Your Macros

- Store macros in a version-controlled folder
- Keep copies of important macros

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| F5 / Ctrl+R | Play selected macro |
| Shift+F5 | Stop macro |
| F6 | Pause/Resume |
| F7 | Record |
| Ctrl+E | Edit selected macro |
| Ctrl+N | New macro |
| Ctrl+S | Save macro (in editor) |

---

## Troubleshooting

### Macro Doesn't Run

1. Check if the native host is installed
2. Verify the macro has no syntax errors
3. Try running with `SET !ERRORIGNORE YES`

### Element Not Found

1. Increase `!TIMEOUT_STEP`
2. Check if the element still exists on the page
3. Try using XPATH or CSS selectors instead of ATTR

### Recording Doesn't Capture Actions

1. Make sure recording is started (red icon)
2. Some sites block recording - try direct DOM interaction
3. Check for frames - use FRAME command

### Native Host Connection Failed

1. Reinstall the native host
2. Check browser permissions
3. Verify the native host manifest is correctly placed

---

## Getting Help

- Check the Command Reference for detailed command syntax
- Review example macros in the Macros folder
- Visit the iMacros community forums

---

*iMacros for Firefox v8.9.7*
