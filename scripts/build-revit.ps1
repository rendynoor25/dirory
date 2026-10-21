# Build Dirory for Revit (revit/DiroryRevit) without an SDK or NuGet.
#
# Compiles with the Roslyn csc that ships with Visual Studio Build Tools, from
# one source tree, for two runtimes:
#   Revit 2024        .NET Framework 4.8 runtime assemblies
#   Revit 2025-2026   .NET 8 reference assemblies  (.cache/dotnet-refs/8.0)
#   Revit 2027+       .NET 10 reference assemblies (.cache/dotnet-refs/10.0)
#                     (both from scripts/fetch-revit-refs.ps1), defining
#                     REVIT2025_OR_GREATER
# The Revit API comes from the Revit install's own RevitAPI / RevitAPIUI DLLs, or,
# for a year that isn't installed, from .cache/revit-refs/<year> (filled by
# scripts/fetch-revit-refs.ps1 from the Nice3point.Revit.Api NuGet reference
# packages). WebView2 comes from that Revit install, or any installed Revit
# 2024+: Revit loads its own copy (same or newer), so none is shipped.
# Packages dist/revit/<year>/ as:
#   Dirory.addin
#   Dirory/DiroryRevit.dll
#   Dirory/ui/...        (the shared panel from plugin/dirory_library/ui)
#   Install-Dirory.cmd, README.txt (installs into Addins\<year>)
# and dist/revit/DiroryRevit-<year>-<version>.zip.
#
#   powershell -ExecutionPolicy Bypass -File scripts/build-revit.ps1 [-Revit 2024] [-Install]
param(
  [string]$Revit = "2024",
  [switch]$Install
)
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$year = [int]$Revit
$netCore = $year -ge 2025
# Revit 2025-2026 run on .NET 8, Revit 2027 on .NET 10.
$dotnetVer = if ($year -ge 2027) { "10.0" } else { "8.0" }
$revitDir = "C:\Program Files\Autodesk\Revit $Revit"
$csc = @(
  "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\BuildTools\MSBuild\Current\Bin\Roslyn\csc.exe",
  "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\Community\MSBuild\Current\Bin\Roslyn\csc.exe",
  "${env:ProgramFiles}\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\Roslyn\csc.exe",
  "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\Roslyn\csc.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $csc) { throw "No Roslyn csc.exe found (install Visual Studio Build Tools)." }

# Revit API: the install, else the NuGet reference DLLs.
$apiDir = $revitDir
if (-not (Test-Path "$apiDir\RevitAPI.dll")) { $apiDir = Join-Path $root ".cache\revit-refs\$Revit" }
if (-not (Test-Path "$apiDir\RevitAPI.dll")) {
  throw "Revit $Revit not found at $revitDir, and no reference DLLs in $apiDir. Run scripts/fetch-revit-refs.ps1 -Revit $Revit."
}
# WebView2: the target install, else the oldest installed Revit 2024+ (its
# version is the floor every later Revit already meets), else the refs folder.
$wv2Dir = @($revitDir) + (2024..2030 | ForEach-Object { "C:\Program Files\Autodesk\Revit $_" }) + @($apiDir) |
  Where-Object { Test-Path "$_\Microsoft.Web.WebView2.Wpf.dll" } | Select-Object -First 1
if (-not $wv2Dir) { throw "No Microsoft.Web.WebView2.Wpf.dll found (install Revit 2024+ or put it in $apiDir)." }

$out = Join-Path $root "dist\revit\$Revit"
$pkg = Join-Path $out "Dirory"
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force -Path $pkg | Out-Null

$refs = @(
  "$apiDir\RevitAPI.dll", "$apiDir\RevitAPIUI.dll",
  "$wv2Dir\Microsoft.Web.WebView2.Core.dll", "$wv2Dir\Microsoft.Web.WebView2.Wpf.dll"
)
$defines = @("REVIT$Revit")
if ($netCore) {
  # .NET reference assemblies (scripts/fetch-revit-refs.ps1), else the
  # installed Desktop Runtime's implementation assemblies (compiles, but
  # binds to runtime internals such as System.Private.CoreLib).
  $dotnetRefs = Join-Path $root ".cache\dotnet-refs\$dotnetVer"
  $managed = { param($f) try { [void][Reflection.AssemblyName]::GetAssemblyName($f.FullName); $true } catch { $false } }
  if (Test-Path "$dotnetRefs\System.Runtime.dll") {
    $refs += Get-ChildItem $dotnetRefs -Filter *.dll | ForEach-Object { $_.FullName }
    $runtime = "reference assemblies in $dotnetRefs"
  } else {
    $shared = "$env:ProgramFiles\dotnet\shared"
    $pick = { param($name) Get-ChildItem "$shared\$name" -Directory -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -like "$dotnetVer.*" } | Sort-Object { [version]$_.Name } | Select-Object -Last 1 }
    $core = & $pick "Microsoft.NETCore.App"
    $desktop = & $pick "Microsoft.WindowsDesktop.App"
    if (-not $core -or -not $desktop) { throw "No .NET $dotnetVer references: run scripts/fetch-revit-refs.ps1 -Revit $Revit, or install the .NET $dotnetVer Desktop Runtime." }
    $desktopDlls = Get-ChildItem $desktop.FullName -Filter *.dll
    $desktopNames = $desktopDlls | ForEach-Object { $_.Name }
    $refs += Get-ChildItem $core.FullName -Filter *.dll | Where-Object { $desktopNames -notcontains $_.Name -and (& $managed $_) } | ForEach-Object { $_.FullName }
    $refs += $desktopDlls | Where-Object { & $managed $_ } | ForEach-Object { $_.FullName }
    $runtime = "runtime $($core.Name)/$($desktop.Name) (WARNING: no reference assemblies; run scripts/fetch-revit-refs.ps1)"
  }
  $defines += "REVIT2025_OR_GREATER", "NET8_0_OR_GREATER"
  Write-Host "Revit $Revit (.NET $dotnetVer): API from $apiDir, $runtime"
} else {
  $fw = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319"
  $refs += @(
    "$fw\WPF\PresentationCore.dll", "$fw\WPF\PresentationFramework.dll", "$fw\WPF\WindowsBase.dll",
    "$fw\System.Xaml.dll", "$fw\System.Net.Http.dll",
    "$fw\System.Drawing.dll", "$fw\System.Windows.Forms.dll", "$fw\System.dll", "$fw\System.Core.dll",
    "$fw\mscorlib.dll", "$fw\netstandard.dll"
  ) | Where-Object { Test-Path $_ }
  Write-Host "Revit $Revit (.NET Framework 4.8): API from $apiDir"
}
$refArgs = $refs | ForEach-Object { "/reference:`"$_`"" }
$src = Get-ChildItem (Join-Path $root "revit\DiroryRevit\src") -Filter *.cs | ForEach-Object { "`"$($_.FullName)`"" }

& $csc /nologo /noconfig /nostdlib+ /target:library /platform:x64 /optimize+ /langversion:latest `
  /nowarn:1701,1702 /define:$($defines -join ';') /out:"$pkg\DiroryRevit.dll" @refArgs @src
if ($LASTEXITCODE -ne 0) { throw "Compile failed." }

Copy-Item (Join-Path $root "revit\DiroryRevit\Dirory.addin") $out
Copy-Item (Join-Path $root "plugin\dirory_library\ui") (Join-Path $pkg "ui") -Recurse
Copy-Item (Join-Path $root "revit\DiroryRevit\assets\*.png") $pkg
Get-ChildItem (Join-Path $pkg "ui") -Filter "_test*" | Remove-Item -Force
# Installer and readme name the Revit year (__REVIT__ in the templates).
Get-ChildItem (Join-Path $root "revit\DiroryRevit\package") -File | ForEach-Object {
  $text = [IO.File]::ReadAllText($_.FullName).Replace("__REVIT__", $Revit)
  [IO.File]::WriteAllText((Join-Path $out $_.Name), $text, (New-Object Text.UTF8Encoding $false))
}
$version = (Select-String -Path (Join-Path $root "revit\DiroryRevit\src\App.cs") -Pattern 'Version = "([^"]+)"').Matches[0].Groups[1].Value
$zip = Join-Path $root "dist\revit\DiroryRevit-$Revit-$version.zip"
. (Join-Path $PSScriptRoot "zip-folder.ps1")
New-ZipFromFolder -Folder $out -Zip $zip
Write-Host "Built Dirory for Revit $Revit -> $out"
Write-Host "Package: $zip"

if ($Install) {
  $addins = Join-Path $env:APPDATA "Autodesk\Revit\Addins\$Revit"
  New-Item -ItemType Directory -Force -Path $addins | Out-Null
  Copy-Item (Join-Path $out "Dirory.addin") $addins -Force
  if (Test-Path (Join-Path $addins "Dirory")) { Remove-Item (Join-Path $addins "Dirory") -Recurse -Force }
  Copy-Item $pkg (Join-Path $addins "Dirory") -Recurse
  Write-Host "Installed to $addins (restart Revit)."
}
