@echo off
rem Dirory for Revit - installs for the current Windows user (no admin needed).
setlocal
set "SRC=%~dp0"
set "DEST=%APPDATA%\Autodesk\Revit\Addins\2024"
if not exist "%DEST%" mkdir "%DEST%"
copy /Y "%SRC%Dirory.addin" "%DEST%\" >nul
if exist "%DEST%\Dirory" rmdir /S /Q "%DEST%\Dirory"
xcopy /E /I /Q /Y "%SRC%Dirory" "%DEST%\Dirory" >nul
echo.
echo Dirory for Revit 2024 is installed.
echo Restart Revit, then open the Dirory tab and click Library.
echo.
pause
