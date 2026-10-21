# library-additions

Source files for items added to the catalogue after the main import, kept in the
repo so they can be re-uploaded or regenerated.

Upload everything here with:

```bash
node scripts/upload-library.mjs --root library-additions
```

The folder follows the same convention as the main library:

```
Materials/<Category>/<file>            -> a Dirory free sample (no brand folder)
Materials/<Category>/<Brand>/<file>    -> that brand's product
Model/<Category>/<file>.skp            -> a Dirory sample model
```

`meta.json` in a folder applies to the images beside it. It can set `brand`,
`category` and `tags`. **Materials take their display name from the filename**,
so name the file the way it should appear (`Kerikil Sungai.png`, not
`kerikil_sungai.png`).

## Contents

The five board materials are **seamless** and published at a real size (version 2):
`scripts/tile-board-materials.py` crops brick and roof tile to whole pattern repeats, hides the wrap seam with a
minimum-error cut, and rebuilds the AAC block as 60 x 20 cm blocks. Sizes are in `tiled-sizes.json`; publish a
changed image with `node scripts/publish-material-version.mjs --root library-additions --spec library-additions/tiled-sizes.json`.


| Item | Why |
|---|---|
| `Materials/Brick/Brick.jpg` | Bata merah. Cut from the *Material Texture Catalog Board* (`sample_library/Materials`), as are the four below. |
| `Materials/Roof/Clay Tile Roof.jpg` | Genteng tanah liat. |
| `Materials/Concrete/Concrete Lightweight Block.jpg` | Bata ringan / AAC (hebel). |
| `Materials/Stone/River Stone.jpg` | Batu kali. |
| `Materials/Stone/Kerikil.jpg` | Gravel. Replaces the generated `Kerikil Sungai.png` placeholder — an architect had searched "kerikil" / "batu" and found nothing. |
| `Materials/Glass/*.png` (Clear, Car Windshield, Car Rear (Tinted), Frosted, Reflective) | Transparent materials. The PNG is only the card picture; SketchUp 0.10.10+ and Revit 0.1.21+ build the glass from the `appearance` in `overrides.json` (tint, opacity, reflectivity, frost; migration 0046). Older plugins paint the picture as an opaque texture. Pictures come from a one-off PIL script, not a vendor. |
| `Materials/Roof/Zinc Roof.png` | Roofing was thin: a clay tile, a concrete tile and one generic "metal" sheet. Zinc and Spandek are what Indonesian projects actually specify, and neither resolved a search. |
| `Materials/Roof/Spandek Roof.png` | As above — the trapezoidal rib profile, clearly distinct from the corrugated zinc sheet. |
| `Materials/Ceiling/Ceiling Tile.png` | No ceiling category existed at all. |
| `Materials/Board/Gypsum Board.png` | Gypsum and GRC boards are specified constantly and had no home in the taxonomy. |
| `Materials/Board/GRC Board.png` | As above. |

The five roof/ceiling/board textures come from
`scripts/generate-material-textures.mjs` and are **placeholders, not
photographs**:

```bash
# regenerate the textures
node scripts/generate-material-textures.mjs

# then register whatever is new (already-present items are skipped)
node scripts/upload-library.mjs --root library-additions --overrides library-additions/overrides.json
```

The generator is deterministic, so re-running produces identical files.

Their tags carry Indonesian and English terms (`Atap`, `Seng`, `Plafon`,
`Langit-langit`, `Papan Gipsum`), because architects search in either language.
Per-item tags for the board materials are in `overrides.json` (pass it with
`--overrides`), since `meta.json` applies to a whole folder.

Note that `upload-library.mjs` names a material after its **filename**. For the
item above, the filename is already the display name. If an item needs a name that
is not a valid filename, rename it afterwards (see
`scripts/normalise-sample-names.mjs`, which did this in bulk for the first
import's `snake_case` samples).
