# Build a SketchUp .rbz (a ZIP) with correct forward-slash entry names.
#
# Why this file exists: PowerShell's ZipFile::CreateFromDirectory writes entry
# names with BACKSLASHES on Windows. A backslash is a legal filename character on
# macOS/Linux, so SketchUp then extracts a single file literally named
# "dirory_library\cloud.rb" and the extension fails to load. This script writes
# entries one by one so the names use "/" as the ZIP specification requires.
param(
  [string]$Source = (Join-Path $PSScriptRoot "..\plugin"),
  [string]$Output = (Join-Path $PSScriptRoot "..\dist\DiroryLibrary-0.5.2.rbz")
)

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$Source = (Resolve-Path $Source).Path
$outDir = Split-Path $Output -Parent
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }
if (Test-Path $Output) { Remove-Item $Output -Force }

$files = Get-ChildItem $Source -Recurse -File | Sort-Object FullName
if (-not $files) { throw "No files found under $Source" }

$stream = [System.IO.File]::Create($Output)
try {
  $zip = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create)
  foreach ($f in $files) {
    $rel = $f.FullName.Substring($Source.Length + 1).Replace('\', '/')
    # Fixed timestamp so builds are reproducible.
    $entry = $zip.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)
    $entry.LastWriteTime = [System.DateTimeOffset]::new([datetime]'2026-10-04T00:00:00Z')
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
$verifyStream = [System.IO.File]::OpenRead($Output)
$verify = New-Object System.IO.Compression.ZipArchive($verifyStream, [System.IO.Compression.ZipArchiveMode]::Read)
$bad = @()
$names = @()
foreach ($e in $verify.Entries) {
  $names += $e.FullName
  if ($e.FullName.Contains('\')) { $bad += $e.FullName }
}
$verify.Dispose()
$verifyStream.Dispose()

Write-Output "Output : $Output"
Write-Output "Size   : $((Get-Item $Output).Length) bytes"
Write-Output "Entries: $($names.Count)"
$names | ForEach-Object { "  $_" }
Write-Output ""
if ($bad.Count -gt 0) {
  Write-Error "FAIL: $($bad.Count) entry name(s) still contain a backslash: $($bad -join ', ')"
  exit 1
}
if ($names -notcontains 'dirory_library.rb') {
  Write-Error "FAIL: extension loader 'dirory_library.rb' is not at the archive root"
  exit 1
}
Write-Output "OK: forward-slash entry names, loader at root."
