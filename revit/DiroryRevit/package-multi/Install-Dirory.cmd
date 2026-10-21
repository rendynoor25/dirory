@echo off
rem Dirory for Revit __YEARS__ - installs for the current Windows user (no admin needed).
rem Installs the matching build into %APPDATA%\Autodesk\Revit\Addins\<year> for
rem every Revit __YEARS__ found on this PC (all of them if none is found).
setlocal
set "SRC=%~dp0"
set "FOUND="
set "FAILED="
rem Double-clicking this file inside the .zip runs it alone from a temp folder,
rem without the "Revit <year>" folders beside it. Stop before touching an
rem existing install.
for %%Y in (__LIST__) do if not exist "%SRC%Revit %%Y\Dirory\DiroryRevit.dll" goto :notextracted
for %%Y in (__LIST__) do if exist "%ProgramFiles%\Autodesk\Revit %%Y\Revit.exe" call :install %%Y
if not defined FOUND if not defined FAILED (
  echo No Revit __YEARS__ found in "%ProgramFiles%\Autodesk". Installing for all of them.
  for %%Y in (__LIST__) do call :install %%Y
)
echo.
if defined FAILED (
  echo Some versions could not be installed. Close Revit and run Install-Dirory.cmd again.
) else (
  echo Restart Revit, then open the Dirory tab and click Library.
)
echo.
pause
goto :eof

:install
set "DEST=%APPDATA%\Autodesk\Revit\Addins\%1"
if not exist "%DEST%" mkdir "%DEST%"
copy /Y "%SRC%Revit %1\Dirory.addin" "%DEST%\" >nul || goto :installfailed
if exist "%DEST%\Dirory" rmdir /S /Q "%DEST%\Dirory"
xcopy /E /I /Q /Y "%SRC%Revit %1\Dirory" "%DEST%\Dirory" >nul || goto :installfailed
if not exist "%DEST%\Dirory\DiroryRevit.dll" goto :installfailed
rem Files extracted from a downloaded .zip carry Windows' "downloaded from the
rem internet" mark, and Revit refuses to load a marked add-in DLL
rem (FileLoadException 0x80131515). Clear the mark on Dirory's own files only.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath '%DEST%\Dirory' -Recurse -File | Unblock-File; Unblock-File -LiteralPath '%DEST%\Dirory.addin'"
echo Dirory for Revit %1 is installed.
set "FOUND=1"
goto :eof

:installfailed
echo Could not copy Dirory for Revit %1 into "%DEST%".
set "FAILED=1"
goto :eof

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
