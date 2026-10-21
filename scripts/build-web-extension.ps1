# Build Dirory for SketchUp for Web: zip jsa/extension with
# manifest.json at the root, forward-slash entry names, no README.
#
#   powershell -ExecutionPolicy Bypass -File scripts/build-web-extension.ps1
#
# Writes dist/web/Dirory-SketchUp-Web-<version>.zip (version from manifest.json).
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$src = Join-Path $root "jsa\extension"
$manifest = Get-Content (Join-Path $src "manifest.json") -Raw | ConvertFrom-Json
$outDir = Join-Path $root "dist\web"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$out = Join-Path $outDir ("Dirory-SketchUp-Web-" + $manifest.version + ".zip")
if (Test-Path $out) { Remove-Item $out -Force }

$files = Get-ChildItem $src -File | Where-Object { $_.Name -ne "README.md" } | Sort-Object Name
$stream = [System.IO.File]::Create($out)
try {
  $zip = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create)
  foreach ($f in $files) {
    $entry = $zip.CreateEntry($f.Name, [System.IO.Compression.CompressionLevel]::Optimal)
    $in = [System.IO.File]::OpenRead($f.FullName)
    $w = $entry.Open()
    try { $in.CopyTo($w) } finally { $w.Dispose(); $in.Dispose() }
  }
  $zip.Dispose()
} finally { $stream.Dispose() }
Write-Host "Built $out ($($files.Count) files)"
