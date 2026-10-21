Dirory for Revit __YEARS__ (beta)
=================================

Install
  1. Close Revit.
  2. Right-click the downloaded .zip, choose "Extract All...", open the
     extracted folder and double-click Install-Dirory.cmd there (installs for
     your Windows user only). Opened from inside the .zip it cannot find
     Dirory's files and stops without changing anything.
     It finds each Revit __YEARS__ on this PC and installs the matching build.
  3. Start Revit, open the "Dirory" tab and click "Library".
     If Revit warns that "Dirory" is not signed by a known publisher, choose
     Always Load.
  4. Sign in from the panel's account button (your browser opens).

Use
  Materials  Click a material card, then click faces in the model (walls, floors,
             ceilings, roofs) to paint it. Press Esc to finish. Dirory creates a
             Revit material with the real texture size and the tile grid pattern.
  Models     Products with a Revit family (.rfa) load and are placed like any
             family. More families are being added.
  RAB        Usage tab -> Measure model -> Estimate cost (RAB). Needs Dirory Pro
             (dirory.com/pro).

The folders "Revit 2025", "Revit 2026" and "Revit 2027" hold one build each.
To install by hand, copy Dirory.addin and the Dirory folder from the folder for
your Revit into %APPDATA%\Autodesk\Revit\Addins\<year>.

If Revit says "cannot run the external application Dirory" (FileLoadException,
0x80131515), Windows has blocked the downloaded files. Run Install-Dirory.cmd
again (it unblocks Dirory's files), or right-click the .zip, choose Properties,
tick Unblock, then extract and install again.

Uninstall
  Delete Dirory.addin and the Dirory folder from
  %APPDATA%\Autodesk\Revit\Addins\<year>

Needs the Microsoft Edge WebView2 Runtime (included with Windows 11 and Revit).
For Revit 2024 use the separate "Revit 2024" download.
