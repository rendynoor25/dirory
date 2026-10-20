# Fetch reference DLLs so scripts/build-revit.ps1 can compile for Revit
# 2025+ without an SDK or that Revit installed. From nuget.org:
#   - the newest Nice3point.Revit.Api.RevitAPI / .RevitAPIUI <year>.x packages
#     -> RevitAPI.dll, RevitAPIUI.dll in .cache/revit-refs/<year>
#     (skipped when C:\Program Files\Autodesk\Revit <year> is installed)
#   - Microsoft.NETCore.App.Ref and Microsoft.WindowsDesktop.App.Ref for the
#     year's .NET (8.0 for Revit 2025-2026, 10.0 for 2027+)
#     -> .cache/dotnet-refs/<net>/*.dll, so the build references the public
#     .NET surface rather than the installed runtime's internals.
# .cache/ is git-ignored. Reference DLLs only: nothing here ships with the add-in.
#
#   powershell -ExecutionPolicy Bypass -File scripts/fetch-revit-refs.ps1 -Revit 2026
param([Parameter(Mandatory = $true)][string]$Revit)
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$dest = Join-Path $root ".cache\revit-refs\$Revit"
Add-Type -AssemblyName System.IO.Compression.FileSystem

# Download the newest stable <id> whose version starts with <prefix>, and
# extract the DLLs whose zip path matches <filter> into <to>.
function Fetch($id, $prefix, $filter, $to) {
  $id = $id.ToLower()
  $versions = (Invoke-RestMethod "https://api.nuget.org/v3-flatcontainer/$id/index.json").versions |
    Where-Object { $_ -like "$prefix.*" -and $_ -notmatch "-" }
  if (-not $versions) { throw "No stable $id $prefix.x package on nuget.org." }
  $version = $versions | Sort-Object { [version]$_ } | Select-Object -Last 1
  New-Item -ItemType Directory -Force -Path $to | Out-Null
  $nupkg = Join-Path $to "$id.$version.nupkg"
  Write-Host "Downloading $id $version"
  Invoke-WebRequest "https://api.nuget.org/v3-flatcontainer/$id/$version/$id.$version.nupkg" -OutFile $nupkg -UseBasicParsing
  $zip = [IO.Compression.ZipFile]::OpenRead($nupkg)
  try {
    $entries = @($zip.Entries | Where-Object { $_.FullName -match $filter })
    if (-not $entries) { throw "Nothing matching $filter in $id $version." }
    foreach ($e in $entries) { [IO.Compression.ZipFileExtensions]::ExtractToFile($e, (Join-Path $to $e.Name), $true) }
  } finally { $zip.Dispose() }
  Remove-Item $nupkg -Force
  Add-Content -Path (Join-Path $to "versions.txt") -Value "$id $version"
}

if (Test-Path "C:\Program Files\Autodesk\Revit $Revit\RevitAPI.dll") {
  Write-Host "Revit $Revit is installed; the build uses its own API DLLs."
} else {
  Remove-Item (Join-Path $dest "versions.txt") -ErrorAction SilentlyContinue
  foreach ($name in "RevitAPI", "RevitAPIUI") {
    Fetch "Nice3point.Revit.Api.$name" $Revit "(^|/)$name\.dll$" $dest
  }
  Write-Host "Revit $Revit reference DLLs in $dest"
}

$net = if ([int]$Revit -ge 2027) { "10.0" } else { "8.0" }
$dotnet = Join-Path $root ".cache\dotnet-refs\$net"
if (-not (Test-Path "$dotnet\System.Runtime.dll")) {
  $filter = "^ref/net$([regex]::Escape($net))/[^/]+\.dll$"
  Fetch "Microsoft.NETCore.App.Ref" $net $filter $dotnet
  Fetch "Microsoft.WindowsDesktop.App.Ref" $net $filter $dotnet
  Write-Host ".NET $net reference assemblies in $dotnet"
}
