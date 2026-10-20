# Build the "SketchUp and Revit" download from the two published artifacts in
# apps/web/private. File names come from apps/web/src/lib/pluginRelease.ts, so
# run this after changing PLUGIN_VERSION or REVIT_VERSION.
#
#   powershell -ExecutionPolicy Bypass -File scripts/build-download-bundle.ps1
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$release = Get-Content (Join-Path $root "apps\web\src\lib\pluginRelease.ts") -Raw
function Const($name) { ([regex]::Match($release, "export const $name = `"([^`"]+)`"")).Groups[1].Value }
$su = Const "PLUGIN_VERSION"; $rv = Const "REVIT_VERSION"; $rfor = Const "REVIT_FOR"; $rnew = Const "REVIT_NEW_FOR"
$private = Join-Path $root "apps\web\private"
$rbz = Join-Path $private "DiroryLibrary-$su.rbz"
$revitZip = Join-Path $private "DiroryRevit-$rfor-$rv.zip"
$revitNewZip = Join-Path $private "DiroryRevit-$rnew-$rv.zip"
foreach ($f in @($rbz, $revitZip, $revitNewZip)) { if (-not (Test-Path $f)) { throw "Missing $f" } }

$stage = Join-Path ([IO.Path]::GetTempPath()) ("dirory-bundle-" + [guid]::NewGuid())
New-Item -ItemType Directory -Force -Path (Join-Path $stage "SketchUp") | Out-Null
Copy-Item $rbz (Join-Path $stage "SketchUp")
Expand-Archive $revitZip -DestinationPath (Join-Path $stage "Revit $rfor")
Expand-Archive $revitNewZip -DestinationPath (Join-Path $stage "Revit $rnew")
@"
Dirory for SketchUp and Revit
=============================

SketchUp (2019 or newer)
  In SketchUp: Window > Extension Manager > Install Extension, choose
  SketchUp\DiroryLibrary-$su.rbz, restart SketchUp, then
  Extensions > Dirory > Open Library Panel.

Revit (Windows)
  Close Revit, open the folder for your Revit ("Revit $rfor" or
  "Revit $rnew") and double-click Install-Dirory.cmd, then start Revit and
  open the Dirory tab > Library.

Full guide: https://dirory.com/how-to-install
"@ | Set-Content -Path (Join-Path $stage "README.txt") -Encoding UTF8

$out = Join-Path $private "Dirory-SketchUp-$su-Revit-$rv.zip"
if (Test-Path $out) { Remove-Item $out -Force }
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $out
Remove-Item $stage -Recurse -Force
Write-Host "Built $out"
