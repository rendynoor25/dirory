# Build Dirory-Revit-Setup-<version>.exe: one installer for Revit 2024-2027.
#
# Builds each year with scripts/build-revit.ps1 (into dist/revit/<year>/), then
# compiles revit/DiroryRevit/installer/Dirory.iss with Inno Setup 6
# (winget install JRSoftware.InnoSetup). Years not installed on this PC need
# scripts/fetch-revit-refs.ps1 -Revit <year> once.
# Output: dist/revit/Dirory-Revit-Setup-<version>.exe
#
# Code signing (optional): set DIRORY_SIGN_CERT to the .pfx path and
# DIRORY_SIGN_PASSWORD to its password, and signtool.exe (Windows SDK) signs
# every DiroryRevit.dll and the setup .exe, timestamped by DigiCert.
#
#   powershell -ExecutionPolicy Bypass -File scripts/build-revit-installer.ps1 [-SkipBuild]
param([switch]$SkipBuild)
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$years = "2024", "2025", "2026", "2027"
$version = (Select-String -Path (Join-Path $root "revit\DiroryRevit\src\App.cs") -Pattern 'Version = "([^"]+)"').Matches[0].Groups[1].Value
$dist = Join-Path $root "dist\revit"

$iscc = @(
  "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw "Inno Setup 6 not found. Install it: winget install JRSoftware.InnoSetup" }

$signtool = $null
if ($env:DIRORY_SIGN_CERT) {
  $signtool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName | Select-Object -Last 1 -ExpandProperty FullName
  if (-not $signtool) { throw "DIRORY_SIGN_CERT is set but signtool.exe was not found (install the Windows SDK)." }
}
function Sign-File($path) {
  if (-not $signtool) { return }
  & $signtool sign /f $env:DIRORY_SIGN_CERT /p $env:DIRORY_SIGN_PASSWORD /fd sha256 /tr http://timestamp.digicert.com /td sha256 /d "Dirory for Revit" $path
  if ($LASTEXITCODE -ne 0) { throw "Signing $path failed." }
}

foreach ($y in $years) {
  if (-not $SkipBuild) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "build-revit.ps1") -Revit $y
    if ($LASTEXITCODE -ne 0) { throw "Build for Revit $y failed." }
  }
  $dll = Join-Path $dist "$y\Dirory\DiroryRevit.dll"
  if (-not (Test-Path $dll)) { throw "Missing $dll (run without -SkipBuild)." }
  Sign-File $dll
}

& $iscc /Q "/DAppVersion=$version" "/DDist=$dist" "/DOutDir=$dist" (Join-Path $root "revit\DiroryRevit\installer\Dirory.iss")
if ($LASTEXITCODE -ne 0) { throw "Inno Setup compile failed." }
$exe = Join-Path $dist "Dirory-Revit-Setup-$version.exe"
Sign-File $exe
if (-not $signtool) { Write-Host "Not signed (set DIRORY_SIGN_CERT to sign)." }
Write-Host "Installer: $exe"
