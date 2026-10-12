# Pack the M0 spike into a zip the Extension Manager will accept.
#
# Same reasoning as scripts/build-rbz.ps1: PowerShell's ZipFile::CreateFromDirectory
# writes BACKSLASH entry names on Windows, which the ZIP spec does not allow and
# SketchUp then reads as one file literally called "spike\spike.js". Entries are
# written one at a time instead, with "/" separators.
#
#   powershell -ExecutionPolicy Bypass -File jsa/scripts/pack-spike.ps1
#
# Output: dist/dirory-spike-<version>.zip

param(
  [string]$Source = (Join-Path $PSScriptRoot "..\spike"),
  [string]$OutputDir = (Join-Path $PSScriptRoot "..\..\dist")
)

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$Source = (Resolve-Path $Source).Path

$manifestPath = Join-Path $Source "manifest.json"
if (-not (Test-Path $manifestPath)) { throw "manifest.json not found in $Source" }
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$version = $manifest.version
if (-not $version) { throw "manifest.json has no version" }

$Output = Join-Path $OutputDir "dirory-spike-$version.zip"
if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null }
if (Test-Path $Output) { Remove-Item $Output -Force }

$files = Get-ChildItem $Source -Recurse -File | Sort-Object FullName
if (-not $files) { throw "No files found under $Source" }

$stream = [System.IO.File]::Create($Output)
try {
  $zip = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create)
  foreach ($f in $files) {
    $rel = $f.FullName.Substring($Source.Length + 1).Replace('\', '/')
    $entry = $zip.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)
    # Fixed timestamp so repeated builds are byte-identical.
    $entry.LastWriteTime = [System.DateTimeOffset]::new([datetime]'2026-10-12T00:00:00Z')
    $es = $entry.Open()
    $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
    $es.Write($bytes, 0, $bytes.Length)
    $es.Dispose()
  }
  $zip.Dispose()
} finally {
  $stream.Dispose()
}

# Verify from a fresh read of the produced file.
$vs = [System.IO.File]::OpenRead($Output)
$verify = New-Object System.IO.Compression.ZipArchive($vs, [System.IO.Compression.ZipArchiveMode]::Read)
$names = @()
$bad = @()
foreach ($e in $verify.Entries) {
  $names += $e.FullName
  if ($e.FullName.Contains('\')) { $bad += $e.FullName }
}
$verify.Dispose()
$vs.Dispose()

Write-Output "Output : $Output"
Write-Output "Size   : $((Get-Item $Output).Length) bytes"
Write-Output "Entries: $($names.Count)"
$names | ForEach-Object { "  $_" }
Write-Output ""

if ($bad.Count -gt 0) {
  Write-Error "FAIL: $($bad.Count) entry name(s) contain a backslash: $($bad -join ', ')"
  exit 1
}
foreach ($required in @("manifest.json", "index.html", "spike.js")) {
  if ($names -notcontains $required) {
    Write-Error "FAIL: '$required' is not at the archive root. SketchUp loads manifest.json from the root."
    exit 1
  }
}
Write-Output "OK: forward-slash names, manifest.json at root."
Write-Output "Install: SketchUp for Web -> Extensions -> Extension Manager -> upload this zip."
