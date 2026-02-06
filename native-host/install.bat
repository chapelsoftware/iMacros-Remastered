@echo off
setlocal enabledelayedexpansion

:: Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"

:: Check for extension ID argument or prompt
set "EXT_ID=%~1"

if "%EXT_ID%"=="" (
    echo.
    echo ========================================
    echo  iMacros Native Host Installer
    echo ========================================
    echo.
    echo To find your extension ID:
    echo   1. Open Chrome and go to: chrome://extensions
    echo   2. Enable "Developer mode" ^(toggle in top right^)
    echo   3. Load the extension from: %SCRIPT_DIR%..\extension\dist
    echo   4. Copy the ID shown under the extension name
    echo.
    set /p EXT_ID="Enter your extension ID: "
)

if "%EXT_ID%"=="" (
    echo Error: Extension ID is required.
    exit /b 1
)

echo.
echo Using extension ID: %EXT_ID%
echo.

:: Determine host path - prefer Electron build, fall back to Node.js
set "ELECTRON_PATH=%SCRIPT_DIR%dist-electron\win-unpacked\iMacros Native Host.exe"
set "NODE_HOST_PATH=%SCRIPT_DIR%native-host.js"

if exist "%ELECTRON_PATH%" (
    set "HOST_PATH=%ELECTRON_PATH%"
    set "HOST_TYPE=electron"
    echo Using Electron host: %ELECTRON_PATH%
) else (
    :: Use Node.js wrapper for development
    set "HOST_PATH=%SCRIPT_DIR%native-host-wrapper.bat"
    set "HOST_TYPE=node"
    echo Electron build not found, using Node.js wrapper

    :: Create the wrapper batch file
    echo @echo off > "%SCRIPT_DIR%native-host-wrapper.bat"
    echo node "%NODE_HOST_PATH%" >> "%SCRIPT_DIR%native-host-wrapper.bat"
)

set "MANIFEST_PATH=%SCRIPT_DIR%com.imacros.nativehost.json"

:: Create the native messaging manifest
echo.
echo Creating native messaging manifest...
(
echo {
echo   "name": "com.imacros.nativehost",
echo   "description": "iMacros Native Messaging Host",
echo   "path": "%HOST_PATH:\=\\%",
echo   "type": "stdio",
echo   "allowed_origins": [
echo     "chrome-extension://%EXT_ID%/"
echo   ]
echo }
) > "%MANIFEST_PATH%"

echo Created: %MANIFEST_PATH%

:: Register in Windows Registry for Chrome
echo.
echo Registering with browsers...
reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.imacros.nativehost" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f >nul 2>&1
if %errorlevel%==0 (echo   [OK] Chrome) else (echo   [SKIP] Chrome)

:: Register for Chromium
reg add "HKCU\Software\Chromium\NativeMessagingHosts\com.imacros.nativehost" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f >nul 2>&1
if %errorlevel%==0 (echo   [OK] Chromium) else (echo   [SKIP] Chromium)

:: Register for Vivaldi
reg add "HKCU\Software\Vivaldi\NativeMessagingHosts\com.imacros.nativehost" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f >nul 2>&1
if %errorlevel%==0 (echo   [OK] Vivaldi) else (echo   [SKIP] Vivaldi)

:: Register for Edge (Chromium)
reg add "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.imacros.nativehost" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f >nul 2>&1
if %errorlevel%==0 (echo   [OK] Edge) else (echo   [SKIP] Edge)

:: Register for Brave
reg add "HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.imacros.nativehost" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f >nul 2>&1
if %errorlevel%==0 (echo   [OK] Brave) else (echo   [SKIP] Brave)

:: Save the extension ID for future reference
echo %EXT_ID% > "%SCRIPT_DIR%.extension-id"

echo.
echo ========================================
echo  Installation complete!
echo ========================================
echo.
echo Extension ID: %EXT_ID%
echo Host type: %HOST_TYPE%
echo Manifest: %MANIFEST_PATH%
echo.
if "%HOST_TYPE%"=="node" (
    echo NOTE: Using Node.js for development.
    echo For production, build the Electron app:
    echo   cd native-host ^&^& npm run build
    echo.
)
echo To reinstall with a different extension ID:
echo   install.bat YOUR_EXTENSION_ID
echo.
pause
