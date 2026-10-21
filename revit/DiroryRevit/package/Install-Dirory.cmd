@echo off
rem Dirory for Revit - installs for the current Windows user (no admin needed).
setlocal
set "SRC=%~dp0"
set "DEST=%APPDATA%\Autodesk\Revit\Addins\__REVIT__"
rem Double-clicking this file inside the .zip runs it alone from a temp folder,
rem without Dirory.addin and the Dirory folder beside it. Stop before touching
rem an existing install.
if not exist "%SRC%Dirory.addin" goto :notextracted
if not exist "%SRC%Dirory\DiroryRevit.dll" goto :notextracted
if not exist "%DEST%" mkdir "%DEST%"
copy /Y "%SRC%Dirory.addin" "%DEST%\" >nul || goto :failed
if exist "%DEST%\Dirory" rmdir /S /Q "%DEST%\Dirory"
xcopy /E /I /Q /Y "%SRC%Dirory" "%DEST%\Dirory" >nul || goto :failed
if not exist "%DEST%\Dirory\DiroryRevit.dll" goto :failed
rem Files extracted from a downloaded .zip carry Windows' "downloaded from the
rem internet" mark, and Revit refuses to load a marked add-in DLL
rem (FileLoadException 0x80131515). Clear the mark on Dirory's own files only.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath '%DEST%\Dirory' -Recurse -File | Unblock-File; Unblock-File -LiteralPath '%DEST%\Dirory.addin'"
echo.
echo Dirory for Revit __REVIT__ is installed.
echo Restart Revit, then open the Dirory tab and click Library.
echo.
pause
exit /b 0

:notextracted
echo.
echo Dirory's files are not next to this installer.
echo This happens when Install-Dirory.cmd is opened from inside the .zip.
echo.
echo   1. Close this window.
echo   2. Right-click the downloaded .zip and choose "Extract All...".
echo   3. Open the extracted folder and double-click Install-Dirory.cmd there.
echo.
echo Nothing was changed.
echo.
pause
exit /b 1

:failed
echo.
echo Could not copy Dirory into "%DEST%".
echo Close Revit and run Install-Dirory.cmd again.
echo.
pause
exit /b 1
