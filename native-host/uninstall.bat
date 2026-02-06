@echo off
setlocal

echo Removing native messaging registration...

:: Remove from Chrome
reg delete "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.imacros.nativehost" /f 2>nul

:: Remove from Vivaldi
reg delete "HKCU\Software\Vivaldi\NativeMessagingHosts\com.imacros.nativehost" /f 2>nul

:: Remove from Edge
reg delete "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.imacros.nativehost" /f 2>nul

echo.
echo Uninstallation complete.
echo.
pause
