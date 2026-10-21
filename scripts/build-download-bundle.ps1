# Build the "SketchUp and Revit" download from the two published artifacts in
# apps/web/private. File names come from apps/web/src/lib/pluginRelease.ts, so
# run this after changing PLUGIN_VERSION or REVIT_VERSION.
#
#   powershell -ExecutionPolicy Bypass -File scripts/build-download-bundle.ps1
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$release = Get-Content (Join-Path $root "apps\web\src\lib\pluginRelease.ts") -Raw
function Const($name) { ([regex]::Match($release, "export const $name = `"([^`"]+)`"")).Groups[1].Value }
$su = Const "PLUGIN_VERSION"; $rv = Const "REVIT_VERSION"
$private = Join-Path $root "apps\web\private"
$rbz = Join-Path $private "DiroryLibrary-$su.rbz"
$setup = Join-Path $private "Dirory-Revit-Setup-$rv.exe"
foreach ($f in @($rbz, $setup)) { if (-not (Test-Path $f)) { throw "Missing $f" } }

$stage = Join-Path ([IO.Path]::GetTempPath()) ("dirory-bundle-" + [guid]::NewGuid())
New-Item -ItemType Directory -Force -Path (Join-Path $stage "SketchUp"), (Join-Path $stage "Revit") | Out-Null
Copy-Item $rbz (Join-Path $stage "SketchUp")
Copy-Item $setup (Join-Path $stage "Revit")
@"
Dirory for SketchUp and Revit
=============================

SketchUp (2019 or newer)
  In SketchUp: Window > Extension Manager > Install Extension, choose
  SketchUp\DiroryLibrary-$su.rbz, restart SketchUp, then
  Extensions > Dirory > Open Library Panel.

Revit 2024-2027 (Windows)
  Close Revit and double-click Revit\Dirory-Revit-Setup-$rv.exe. It finds
  each Revit 2024-2027 on this PC and installs for it. If Windows says
  "Windows protected your PC", click More info, then Run anyway. Then start
  Revit and open the Dirory tab > Library.

Full guide: https://dirory.com/how-to-install
"@ | Set-Content -Path (Join-Path $stage "README.txt") -Encoding UTF8

$out = Join-Path $private "Dirory-SketchUp-$su-Revit-$rv.zip"
. (Join-Path $PSScriptRoot "zip-folder.ps1")
New-ZipFromFolder -Folder $stage -Zip $out
Remove-Item $stage -Recurse -Force
Write-Host "Built $out"
