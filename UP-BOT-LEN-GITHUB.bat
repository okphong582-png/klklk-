@echo off
setlocal DisableDelayedExpansion
chcp 65001 >nul
set "UPLOAD_PS=%~dp0Push-Bot-GitHub.ps1"
if exist "%UPLOAD_PS%" goto found
set "UPLOAD_PS=%~dp0telegram-key-bot\Push-Bot-GitHub.ps1"
if exist "%UPLOAD_PS%" goto found
set "UPLOAD_PS=C:\Users\A thuy SG\Desktop\New folder (18)\telegram-key-bot\Push-Bot-GitHub.ps1"
if exist "%UPLOAD_PS%" goto found
echo Khong tim thay Push-Bot-GitHub.ps1. Giai nen goi day du roi chay lai file BAT.
pause
exit /b 1
:found
set "UPLOAD_CHECK="
if "%~1"=="" goto run
if /i "%~1"=="--check" set "UPLOAD_CHECK=-CheckOnly"
if defined UPLOAD_CHECK goto run
echo Cach dung: UP-BOT-LEN-GITHUB.bat [--check]
exit /b 2
:run
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%UPLOAD_PS%" %UPLOAD_CHECK%
set "UPLOAD_RESULT=%ERRORLEVEL%"
echo.
if defined UPLOAD_CHECK exit /b %UPLOAD_RESULT%
if not "%UPLOAD_RESULT%"=="0" echo Chua upload thanh cong. Xem dong loi phia tren.
pause
exit /b %UPLOAD_RESULT%
