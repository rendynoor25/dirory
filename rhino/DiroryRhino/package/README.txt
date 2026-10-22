Dirory for Rhino 8 — version __VERSION__
=========================================

Install (Package Manager file, recommended)
  1. Drag the dirory-__VERSION__-...-win.yak file onto a Rhino 8 window, or
     close Rhino and install it from a command prompt:
       "C:\Program Files\Rhino 8\System\Yak.exe" install <path to the .yak>
     (Updating: close Rhino first, run  Yak.exe uninstall dirory, then install.)
  2. Restart Rhino, then type  Dirory  and press Enter to open the panel.

Install (zip)
  1. Close Rhino.
  2. Right-click the .zip, choose Properties, tick Unblock, OK. Extract it.
  3. Start Rhino 8 and drag Dirory.rhp from the extracted folder onto the
     Rhino window (keep the ui folder next to it; Rhino remembers the
     plug-in from then on).
  4. Type  Dirory  to open the panel.

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
