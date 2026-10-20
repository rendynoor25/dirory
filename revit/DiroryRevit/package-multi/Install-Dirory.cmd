@echo off
rem Dirory for Revit __YEARS__ - installs for the current Windows user (no admin needed).
rem Installs the matching build into %APPDATA%\Autodesk\Revit\Addins\<year> for
rem every Revit __YEARS__ found on this PC (all of them if none is found).
setlocal
set "SRC=%~dp0"
set "FOUND="
for %%Y in (__LIST__) do if exist "%ProgramFiles%\Autodesk\Revit %%Y\Revit.exe" call :install %%Y
if not defined FOUND (
  echo No Revit __YEARS__ found in "%ProgramFiles%\Autodesk". Installing for all of them.
  for %%Y in (__LIST__) do call :install %%Y
)
echo.
echo Restart Revit, then open the Dirory tab and click Library.
echo.
pause
goto :eof

:install
set "DEST=%APPDATA%\Autodesk\Revit\Addins\%1"
if not exist "%DEST%" mkdir "%DEST%"
copy /Y "%SRC%Revit %1\Dirory.addin" "%DEST%\" >nul
if exist "%DEST%\Dirory" rmdir /S /Q "%DEST%\Dirory"
xcopy /E /I /Q /Y "%SRC%Revit %1\Dirory" "%DEST%\Dirory" >nul
rem Files extracted from a downloaded .zip carry Windows' "downloaded from the
rem internet" mark, and Revit refuses to load a marked add-in DLL
rem (FileLoadException 0x80131515). Clear the mark on Dirory's own files only.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath '%DEST%\Dirory' -Recurse -File | Unblock-File; Unblock-File -LiteralPath '%DEST%\Dirory.addin'"
echo Dirory for Revit %1 is installed.
set "FOUND=1"
goto :eof
