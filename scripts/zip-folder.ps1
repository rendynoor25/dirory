# Zip a folder's contents with standard "/" entry paths.
#
# Windows PowerShell 5.1's Compress-Archive writes "\" separators, which the zip
# format does not allow; some extractors then make flat files named
# "Revit 2025\Dirory.addin" instead of folders. Dot-source and call:
#
#   . (Join-Path $PSScriptRoot "zip-folder.ps1")
#   New-ZipFromFolder -Folder <dir> -Zip <file.zip>
function New-ZipFromFolder([string]$Folder, [string]$Zip) {
  Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
  $Folder = (Resolve-Path $Folder).Path.TrimEnd('\')
  if (Test-Path $Zip) { Remove-Item $Zip -Force }
  $archive = [IO.Compression.ZipFile]::Open($Zip, [IO.Compression.ZipArchiveMode]::Create)
  try {
    Get-ChildItem $Folder -Recurse -File | ForEach-Object {
      $name = $_.FullName.Substring($Folder.Length + 1).Replace('\', '/')
      [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $name, [IO.Compression.CompressionLevel]::Optimal)
    }
  } finally { $archive.Dispose() }
}
