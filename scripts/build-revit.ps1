# Build Dirory for Revit (revit/DiroryRevit) without an SDK or NuGet.
#
# Compiles with the Roslyn csc that ships with Visual Studio Build Tools,
# against the .NET Framework 4.8 runtime assemblies and the Revit install's own
# RevitAPI / RevitAPIUI / WebView2 DLLs (not copied: Revit loads its own).
# Packages dist/revit/<version>/ as:
#   Dirory.addin
#   Dirory/DiroryRevit.dll
#   Dirory/ui/...        (the shared panel from plugin/dirory_library/ui)
#
#   powershell -ExecutionPolicy Bypass -File scripts/build-revit.ps1 [-Revit 2024] [-Install]
param(
  [string]$Revit = "2024",
  [switch]$Install
)
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$revitDir = "C:\Program Files\Autodesk\Revit $Revit"
$fw = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319"
$csc = @(
  "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\BuildTools\MSBuild\Current\Bin\Roslyn\csc.exe",
  "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\Community\MSBuild\Current\Bin\Roslyn\csc.exe",
  "${env:ProgramFiles}\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\Roslyn\csc.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $csc) { throw "No Roslyn csc.exe found (install Visual Studio Build Tools)." }
if (-not (Test-Path "$revitDir\RevitAPI.dll")) { throw "Revit $Revit not found at $revitDir" }

$out = Join-Path $root "dist\revit\$Revit"
$pkg = Join-Path $out "Dirory"
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force -Path $pkg | Out-Null

$refs = @(
  "$revitDir\RevitAPI.dll", "$revitDir\RevitAPIUI.dll",
  "$revitDir\Microsoft.Web.WebView2.Core.dll", "$revitDir\Microsoft.Web.WebView2.Wpf.dll",
  "$fw\WPF\PresentationCore.dll", "$fw\WPF\PresentationFramework.dll", "$fw\WPF\WindowsBase.dll",
  "$fw\System.Xaml.dll", "$fw\System.Web.Extensions.dll", "$fw\System.Net.Http.dll",
  "$fw\System.Drawing.dll", "$fw\System.Windows.Forms.dll", "$fw\System.dll", "$fw\System.Core.dll",
  "$fw\mscorlib.dll", "$fw\netstandard.dll" | Where-Object { Test-Path $_ }
) | Where-Object { Test-Path $_ }
$refArgs = $refs | ForEach-Object { "/reference:`"$_`"" }
$src = Get-ChildItem (Join-Path $root "revit\DiroryRevit\src") -Filter *.cs | ForEach-Object { "`"$($_.FullName)`"" }

& $csc /nologo /noconfig /nostdlib+ /target:library /platform:x64 /optimize+ /langversion:latest `
  /nowarn:1701,1702 /out:"$pkg\DiroryRevit.dll" @refArgs @src
if ($LASTEXITCODE -ne 0) { throw "Compile failed." }

Copy-Item (Join-Path $root "revit\DiroryRevit\Dirory.addin") $out
Copy-Item (Join-Path $root "plugin\dirory_library\ui") (Join-Path $pkg "ui") -Recurse
Get-ChildItem (Join-Path $pkg "ui") -Filter "_test*" | Remove-Item -Force
Copy-Item (Join-Path $root "revit\DiroryRevit\package\*") $out
$version = (Select-String -Path (Join-Path $root "revit\DiroryRevit\src\App.cs") -Pattern 'Version = "([^"]+)"').Matches[0].Groups[1].Value
$zip = Join-Path $root "dist\revit\DiroryRevit-$Revit-$version.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $out "*") -DestinationPath $zip
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
