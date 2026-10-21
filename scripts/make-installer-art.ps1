# Make the Revit installer's artwork from the Dirory logo (D:\Dirory\brand).
# Writes into revit/DiroryRevit/installer/:
#   dirory.ico                    setup + uninstall icon (16-256 px)
#   wizard-large-100/200.bmp      left side of the Welcome / Finished pages
#   wizard-small-100/200.bmp      top-right corner of the other pages
# The outputs are committed; run this again only when the logo changes.
#
#   powershell -ExecutionPolicy Bypass -File scripts/make-installer-art.ps1 [-Brand D:\Dirory\brand]
param([string]$Brand = (Join-Path $PSScriptRoot "..\..\brand"))
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$out = Join-Path $root "revit\DiroryRevit\installer"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$mark = [Drawing.Image]::FromFile((Resolve-Path (Join-Path $Brand "logo only.png")))
$full = [Drawing.Image]::FromFile((Resolve-Path (Join-Path $Brand "Logo-vertical.png")))

# Draw $img centred in a $w x $h canvas, scaled to fit inside $pad px margins.
function New-Canvas($img, [int]$w, [int]$h, [int]$pad, $bg) {
  $bmp = New-Object Drawing.Bitmap $w, $h, ([Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear($bg)
  $s = [Math]::Min(($w - 2 * $pad) / $img.Width, ($h - 2 * $pad) / $img.Height)
  $dw = [int]($img.Width * $s); $dh = [int]($img.Height * $s)
  $g.DrawImage($img, [int](($w - $dw) / 2), [int](($h - $dh) / 2), $dw, $dh)
  $g.Dispose()
  $bmp
}

# Inno Setup wants 24-bit BMPs; 100% and 200% sizes let it pick per DPI.
function Save-Bmp($bmp, $path) {
  $rgb = $bmp.Clone((New-Object Drawing.Rectangle 0, 0, $bmp.Width, $bmp.Height), [Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $rgb.Save($path, [Drawing.Imaging.ImageFormat]::Bmp)
  $rgb.Dispose(); $bmp.Dispose()
}
$white = [Drawing.Color]::White
foreach ($k in 1, 2) {
  Save-Bmp (New-Canvas $full (164 * $k) (314 * $k) (18 * $k) $white) (Join-Path $out "wizard-large-$($k)00.bmp")
  Save-Bmp (New-Canvas $mark (55 * $k) (55 * $k) (2 * $k) $white) (Join-Path $out "wizard-small-$($k)00.bmp")
}

# .ico: 32-bit bitmap entries up to 128 px (what every Windows icon reader
# understands), PNG for 256 px.
$sizes = 16, 24, 32, 48, 64, 128, 256
$pngs = foreach ($s in $sizes) {
  $bmp = New-Canvas $mark $s $s 0 ([Drawing.Color]::Transparent)
  $ms = New-Object IO.MemoryStream
  if ($s -ge 256) {
    $bmp.Save($ms, [Drawing.Imaging.ImageFormat]::Png)
  } else {
    $bw = New-Object IO.BinaryWriter $ms
    $bw.Write([UInt32]40); $bw.Write([Int32]$s); $bw.Write([Int32]($s * 2))
    $bw.Write([UInt16]1); $bw.Write([UInt16]32); $bw.Write([UInt32]0)
    $bw.Write([UInt32]0); $bw.Write([Int32]0); $bw.Write([Int32]0); $bw.Write([UInt32]0); $bw.Write([UInt32]0)
    for ($y = $s - 1; $y -ge 0; $y--) {
      for ($x = 0; $x -lt $s; $x++) {
        $c = $bmp.GetPixel($x, $y)
        $bw.Write([byte]$c.B); $bw.Write([byte]$c.G); $bw.Write([byte]$c.R); $bw.Write([byte]$c.A)
      }
    }
    # AND mask: all zero (alpha does the work), rows padded to 4 bytes.
    $bw.Write((New-Object byte[] ([Math]::Ceiling($s / 32) * 4 * $s)))
    $bw.Flush()
  }
  $bmp.Dispose()
  , $ms.ToArray()
}
$ico = New-Object IO.MemoryStream
$w = New-Object IO.BinaryWriter $ico
$w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $d = if ($sizes[$i] -ge 256) { 0 } else { $sizes[$i] }
  $w.Write([byte]$d); $w.Write([byte]$d); $w.Write([byte]0); $w.Write([byte]0)
  $w.Write([UInt16]1); $w.Write([UInt16]32)
  $w.Write([UInt32]$pngs[$i].Length); $w.Write([UInt32]$offset)
  $offset += $pngs[$i].Length
}
foreach ($p in $pngs) { $w.Write($p) }
$w.Flush()
[IO.File]::WriteAllBytes((Join-Path $out "dirory.ico"), $ico.ToArray())
$mark.Dispose(); $full.Dispose()
Write-Host "Installer artwork -> $out"
