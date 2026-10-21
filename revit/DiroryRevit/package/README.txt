Dirory for Revit __REVIT__ (beta)
============================

Install
  1. Close Revit.
  2. Right-click the downloaded .zip, choose "Extract All...", open the
     extracted folder and double-click Install-Dirory.cmd there (installs for
     your Windows user only). Opened from inside the .zip it cannot find
     Dirory's files and stops without changing anything.
  3. Start Revit __REVIT__, open the "Dirory" tab and click "Library".
  4. Sign in from the panel's account button (your browser opens).

Use
  Materials  Click a material card, then click faces in the model (walls, floors,
             ceilings, roofs) to paint it. Press Esc to finish. Dirory creates a
             Revit material with the real texture size and the tile grid pattern.
  Models     Products with a Revit family (.rfa) load and are placed like any
             family. More families are being added.
  RAB        Usage tab -> Measure model -> Estimate cost (RAB). Needs Dirory Pro
             (dirory.com/pro).

If Chrome says the download "isn't commonly downloaded" or is suspicious:
Dirory for Revit is new and not yet signed, so few people have downloaded
each version. Open Chrome's downloads (the arrow or the three dots next to
the file) and choose Keep.

If Revit says "cannot run the external application Dirory" (FileLoadException,
0x80131515), Windows has blocked the downloaded files. Run Install-Dirory.cmd
from this version again (it unblocks Dirory's files), or right-click the .zip,
choose Properties, tick Unblock, then extract and install again.

Uninstall
  Delete Dirory.addin and the Dirory folder from
  %APPDATA%\Autodesk\Revit\Addins\__REVIT__

Needs the Microsoft Edge WebView2 Runtime (included with Windows 11 and Revit __REVIT__).
