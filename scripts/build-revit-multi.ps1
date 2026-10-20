# Build the one "Revit 2025-2027" download: each year's build (from
# scripts/build-revit.ps1) in its own "Revit <year>" folder, plus one
# Install-Dirory.cmd that installs the matching build for every Revit year it
# finds (templates in revit/DiroryRevit/package-multi).
# Output: dist/revit/DiroryRevit-<first>-<last>-<version>.zip
#
#   powershell -ExecutionPolicy Bypass -File scripts/build-revit-multi.ps1 [-Years 2025,2026,2027]
param([string[]]$Years = @("2025", "2026", "2027"))
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$version = (Select-String -Path (Join-Path $root "revit\DiroryRevit\src\App.cs") -Pattern 'Version = "([^"]+)"').Matches[0].Groups[1].Value
$label = "$($Years[0])-$($Years[-1])"

$stage = Join-Path $root "dist\revit\$label"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null
foreach ($y in $Years) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "build-revit.ps1") -Revit $y
  if ($LASTEXITCODE -ne 0) { throw "Build for Revit $y failed." }
  $dest = Join-Path $stage "Revit $y"
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item (Join-Path $root "dist\revit\$y\Dirory.addin") $dest
  Copy-Item (Join-Path $root "dist\revit\$y\Dirory") (Join-Path $dest "Dirory") -Recurse
}
Get-ChildItem (Join-Path $root "revit\DiroryRevit\package-multi") -File | ForEach-Object {
  $text = [IO.File]::ReadAllText($_.FullName).Replace("__YEARS__", $label).Replace("__LIST__", ($Years -join " "))
  [IO.File]::WriteAllText((Join-Path $stage $_.Name), $text, (New-Object Text.UTF8Encoding $false))
}
$zip = Join-Path $root "dist\revit\DiroryRevit-$label-$version.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip
Write-Host "Package: $zip"
