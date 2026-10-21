# Build Dirory for Rhino 8 (rhino/DiroryRhino) without an SDK or NuGet.
#
# Compiles with the Roslyn csc that ships with Visual Studio Build Tools, for
# .NET Framework 4.8 against the Rhino 8 install's own RhinoCommon, Eto and
# WebView2 DLLs. Rhino 8 loads a .NET Framework 4.8 plug-in in both of its
# runtimes (.NET Core, the default, and .NET Framework), and Rhino loads its own
# copies of those DLLs, so none is shipped.
#
# Packages:
#   dist/rhino/build/            Dirory.rhp, dirory.ico, ui/ (the shared panel
#                                from plugin/dirory_library/ui), manifest.yml
#   dist/rhino/dirory-<version>-rh8_*-win.yak   for Rhino's Package Manager
#   dist/rhino/DiroryRhino-<version>.zip        the same files + README.txt
#
#   powershell -ExecutionPolicy Bypass -File scripts/build-rhino.ps1 [-Install]
#
# -Install installs the .yak with Rhino's yak.exe, as the Package Manager would
# (into %APPDATA%\McNeel\Rhinoceros\packages\8.0\dirory), replacing an older
# Dirory. Close Rhino first if it has Dirory loaded (the .rhp is locked), then
# start Rhino to load it.
param([switch]$Install)
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$rhino = "C:\Program Files\Rhino 8\System"
if (-not (Test-Path "$rhino\RhinoCommon.dll")) { throw "Rhino 8 not found at $rhino." }
$csc = @(
  "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\BuildTools\MSBuild\Current\Bin\Roslyn\csc.exe",
  "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\Community\MSBuild\Current\Bin\Roslyn\csc.exe",
  "${env:ProgramFiles}\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\Roslyn\csc.exe",
  "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\Roslyn\csc.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $csc) { throw "No Roslyn csc.exe found (install Visual Studio Build Tools)." }

$src = Join-Path $root "rhino\DiroryRhino"
$version = (Select-String -Path "$src\src\App.cs" -Pattern 'const string Version = "([^"]+)"').Matches[0].Groups[1].Value
$dist = Join-Path $root "dist\rhino"
$out = Join-Path $dist "build"
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force -Path $out | Out-Null

$fw = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319"
$refs = @(
  "$rhino\RhinoCommon.dll", "$rhino\Eto.dll", "$rhino\Eto.Wpf.dll",
  "$rhino\Microsoft.Web.WebView2.Core.dll", "$rhino\Microsoft.Web.WebView2.Wpf.dll",
  "$fw\WPF\PresentationCore.dll", "$fw\WPF\PresentationFramework.dll", "$fw\WPF\WindowsBase.dll",
  "$fw\System.Xaml.dll", "$fw\System.Net.Http.dll", "$fw\System.Drawing.dll", "$fw\System.Windows.Forms.dll",
  "$fw\System.dll", "$fw\System.Core.dll", "$fw\mscorlib.dll", "$fw\netstandard.dll",
  "$fw\System.Runtime.dll", "$fw\Facades\netstandard.dll"
) | Where-Object { Test-Path $_ } | Select-Object -Unique
$refArgs = $refs | ForEach-Object { "/reference:`"$_`"" }
$files = Get-ChildItem "$src\src" -Filter *.cs | ForEach-Object { "`"$($_.FullName)`"" }

& $csc /nologo /noconfig /nostdlib+ /target:library /platform:anycpu /optimize+ /langversion:latest `
  /nowarn:1701,1702 /out:"$out\Dirory.rhp" @refArgs @files
if ($LASTEXITCODE -ne 0) { throw "Compile failed." }

Copy-Item (Join-Path $root "plugin\dirory_library\ui") (Join-Path $out "ui") -Recurse
Get-ChildItem (Join-Path $out "ui") -Filter "_test*" | Remove-Item -Force
Copy-Item "$src\assets\dirory.ico" $out
Copy-Item "$src\assets\dirory64.png" (Join-Path $out "icon.png")
$manifest = [IO.File]::ReadAllText("$src\package\manifest.yml").Replace("__VERSION__", $version)
[IO.File]::WriteAllText((Join-Path $out "manifest.yml"), $manifest, (New-Object Text.UTF8Encoding $false))

# The Package Manager's .yak (yak names it from the manifest and RhinoCommon).
Get-ChildItem $dist -Filter "dirory-$version-*.yak" -ErrorAction SilentlyContinue | Remove-Item -Force
Push-Location $out
try {
  & "$rhino\Yak.exe" build --platform win
  if ($LASTEXITCODE -ne 0) { throw "yak build failed." }
  Get-ChildItem $out -Filter *.yak | Move-Item -Destination $dist -Force
} finally { Pop-Location }
$yak = Get-ChildItem $dist -Filter "dirory-$version-*.yak" | Select-Object -First 1

# The zip: the same files plus install steps.
$zipDir = Join-Path $env:TEMP "dirory-rhino-zip"
if (Test-Path $zipDir) { Remove-Item $zipDir -Recurse -Force }
Copy-Item $out $zipDir -Recurse
$readme = [IO.File]::ReadAllText("$src\package\README.txt").Replace("__VERSION__", $version)
[IO.File]::WriteAllText((Join-Path $zipDir "README.txt"), $readme, (New-Object Text.UTF8Encoding $false))
$zip = Join-Path $dist "DiroryRhino-$version.zip"
. (Join-Path $PSScriptRoot "zip-folder.ps1")
New-ZipFromFolder -Folder $zipDir -Zip $zip
Remove-Item $zipDir -Recurse -Force

Write-Host "Built Dirory for Rhino $version -> $out"
Write-Host "Package: $($yak.FullName)"
Write-Host "Zip:     $zip"

if ($Install) {
  # Through yak, as the Package Manager does: Rhino deletes a package folder
  # copied by hand (it has no manifest.txt) at the next start.
  & "$rhino\Yak.exe" uninstall dirory 2>$null | Out-Null
  & "$rhino\Yak.exe" install $yak.FullName
  if ($LASTEXITCODE -ne 0) { throw "yak install failed (close Rhino if it has Dirory loaded)." }
  Write-Host "Installed $($yak.Name) (restart Rhino)."
}
