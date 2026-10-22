# Dirory for Rhino 8

A RhinoCommon plug-in (`Dirory.rhp`, C#, .NET Framework 4.8; it also loads in
Rhino 8's default .NET Core runtime) that opens the shared Dirory panel
(`plugin/dirory_library/ui`) in a dockable Rhino panel, as the SketchUp plugin
and the Revit add-in do.

## What it does

- **Library**: the Models and Materials tabs, search and filters (the shared panel).
  Models are the products that have a SketchUp file; Rhino imports it.
- **Sign-in**: device sign-in (`auth-device/start|poll`, `plugin_version` `rhino-<version>`),
  token kept in `%APPDATA%\Dirory\rhino.json`.
- **Place a model** (`DiroryPlace`): `GET /download/<asset_id>` → the `.skp`, imported once per
  asset version into a block `Dirory - <brand> <name>`, then placed at picked points
  (Enter to finish). The block's description carries `dirory:<asset_id>:v<version>`, so
  clicking the card again reuses it. Each instance has user text `Dirory.asset_id`,
  `Dirory.name`, `Dirory.brand`, `Dirory.category`, `Dirory.type`, `Dirory.version`, ...
- **Paint a material** (`DiroryPaint`): the image becomes a Custom render material
  `Dirory - <brand> <name>` whose texture uses a WCS box projection with repeat
  `100 / tile_size_cm` per metre, i.e. the real tile size in any model units. The same
  `Dirory.*` tags are on the material (user text) and in its notes (with the marker that
  reuses it). It is assigned to the selected objects; with nothing selected, Rhino asks
  for objects (Enter adds only the material).
- **Not yet**: Quantifier and BoQ (RAB) are hidden in Rhino (`DIRORY_HOST = 'rhino'`).
  No usage data, search misses or quotes are sent.

## Source

| File | |
|---|---|
| `DiroryRhino/src/App.cs` | plug-in, panel registration, `Dirory` command, version |
| `DiroryRhino/src/PanelHost.cs` | Eto panel with a WPF WebView2 on `https://dirory.panel/` (the `ui` folder) |
| `DiroryRhino/src/Bridge.cs` | the panel's `sketchup.*` actions: account, catalogue, download |
| `DiroryRhino/src/Commands.cs` | `DiroryPlace`, `DiroryPaint` (block import, material) |
| `DiroryRhino/src/Cloud.cs`, `Json.cs`, `Lang.cs` | copied from the Revit add-in |
| `DiroryRhino/package/` | Package Manager `manifest.yml` and the zip's `README.txt` |

## Build and install

Needs Rhino 8 and Visual Studio Build Tools (Roslyn `csc.exe`); no SDK or NuGet.

```
powershell -ExecutionPolicy Bypass -File scripts/build-rhino.ps1 -Install
```

Writes `dist/rhino/dirory-<version>-rh8_<sr>-win.yak` (Package Manager),
`dist/rhino/DiroryRhino-<version>.zip` and `dist/rhino/build/`. `-Install` installs the
`.yak` with Rhino's `Yak.exe` into `%APPDATA%\McNeel\Rhinoceros\packages\8.0\dirory`
(Rhino deletes a hand-copied package folder at start-up: it lacks yak's `manifest.txt`).
Close Rhino first if it has Dirory loaded, then start Rhino and type `Dirory`.
Bump `App.Version` for every build.

The `.yak` is tagged with the Rhino 8 service release it was built against
(`rh8_36` = Rhino 8.36 or newer).
