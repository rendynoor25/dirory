Dirory for Rhino 8 — version __VERSION__
=========================================

Install (Package Manager file, recommended)
  1. Close Rhino.
  2. Drag the dirory-__VERSION__-...-win.yak file onto an open Rhino 8 window,
     or install it from a command prompt:
       "C:\Program Files\Rhino 8\System\Yak.exe" install <path to the .yak>
  3. Restart Rhino, then type  Dirory  and press Enter to open the panel.

Install (zip)
  1. Close Rhino.
  2. Right-click the .zip, choose Properties, tick Unblock, OK. Extract it.
  3. Copy the extracted folder to
       %APPDATA%\McNeel\Rhinoceros\packages\8.0\dirory\__VERSION__
     (Dirory.rhp, manifest.yml and the ui folder must be directly inside it).
  4. Start Rhino 8 and type  Dirory  to open the panel.
  Or: start Rhino, drag Dirory.rhp onto the window (keep the ui folder next to it).

Use
  Sign in    The panel's account button; your browser opens to approve.
  Models     Click a model card, then click in the model to place it (Enter to
             finish). Each product becomes a block named "Dirory - <brand> <name>"
             (Block Manager / Insert for more copies). Rhino imports the
             product's SketchUp file.
  Materials  Select objects, then click a material card (or click the card and
             select objects, then Enter). The material is in the Materials panel
             with its texture at the real tile size (WCS box projection).
  Commands   Dirory (open the panel), DiroryPlace, DiroryPaint (used by the panel).

Not in Rhino yet: Quantifier (Usage) and BoQ (RAB) — use SketchUp or Revit.
Needs the Microsoft Edge WebView2 Runtime (already on Windows 10/11).
