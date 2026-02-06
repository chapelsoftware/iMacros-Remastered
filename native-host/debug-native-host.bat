@echo off
cd /d "%~dp0dist-electron\win-unpacked"
echo Starting native host manually...
echo Output will be logged to debug.log
"iMacros Native Host.exe" 2> debug.log
echo.
echo Exit code: %ERRORLEVEL%
echo.
echo === Debug log contents ===
type debug.log
pause
