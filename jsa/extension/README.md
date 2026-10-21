# Dirory for SketchUp for Web

The Dirory library inside SketchUp's browser version, built on the SketchUp
JavaScript API (JSA). Same Dirory cloud as the desktop plugin.

- **Models / Materials** with search, category and brand filters.
- **Sign in** with the same code-on-dirory.com flow as the desktop plugin.
- **Click a model** to download it, load it as a component and start
  SketchUp's placement tool (a second click reuses the loaded component).
- **Click a material** to add it to the model: it paints the selected faces,
  groups and components, or, with nothing selected, becomes the Paint
  Bucket's material.
- Products are tagged with the `Dirory` attribute dictionary like the desktop
  plugin, so SketchUp desktop still recognises them.

Not yet: real-world tile size (SketchUp for Web exposes no texture-size
setting, so SketchUp's default size is used), Quantifier and BoQ.

## Install (SketchUp Web JSA Labs)

1. Build the zip (repo root): `powershell -File scripts/build-web-extension.ps1`
   (writes `dist/web/Dirory-SketchUp-Web-<version>.zip`).
2. Open https://jsa-labs.sketchup.com and open a model.
3. Extensions > Extension Manager > Upload an Extension, then drop the zip.
4. Open it from the Extensions menu (or the Dirory toolbar button).

Extensions are only available in JSA Labs for now; SketchUp's regular web
version does not load them yet.
