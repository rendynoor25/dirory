# JSA gaps — what the web/iPad plugin cannot do

Brief §0.4: *"If the JSA cannot do something the Ruby plugin does, say so and
propose a fallback. Don't fake it."* This is that list.

Evidence is labelled: **[docs]** = Trimble's published documentation,
**[sdk]** = extracted from `sketchup-js-api.js` v2.37.1 itself (API 2.37.1),
**[live]** = measured against the running backend, **[unverified]** = needs the
spike to run inside SketchUp.

---

## Blockers (need a decision before M1)

### B1. `/catalog` cannot be fetched from a browser with the `apikey` header

> **Resolved 16 Oct 2026.** `catalog/index.ts` now answers the `OPTIONS`
> preflight like the other functions (fix 1 below), deployed and verified:
> preflight 200 with `Access-Control-Allow-Headers: … apikey …`, and
> `GET /catalog` with the key from `Origin: https://app.sketchup.com` returns
> 200 with every item. The desktop plugin's response is unchanged.

| | |
|---|---|
| Evidence | **[live]** — `OPTIONS /catalog` → **405**, every other endpoint → 200 |
| Browser result | `TypeError: Failed to fetch`, reproduced in headless Chrome from a real HTTP origin |
| Control | `GET /download/<uuid>` with the identical header → resolves (http 401), so CORS itself is configured fine |

The extension is a browser; the Ruby plugin was not. A 405 to the preflight
fails the request before it is ever sent.

**Two fixes, both needing your approval (brief §0.2 says do not touch the
backend):**

1. **Add an `OPTIONS` branch to `supabase/functions/catalog/index.ts`**, matching
   the pattern the other six functions already use. One small change, and it is
   the only correct long-term fix.
2. **Call `/catalog` with no custom headers.** This works *today* — verified
   `200` with 1360 items — because the function is public and `--no-verify-jwt`
   is passed at deploy. It avoids the preflight entirely. But it silently depends
   on the function never requiring the key, so it is a workaround, not a fix.

**Recommendation: do (1).** I have not touched the backend.

### B2. No texture size API — this breaks the m² number

| | |
|---|---|
| Evidence | **[docs]** Capabilities: Texture — *"Properties accessible; export as data URL; **size manipulation is future**"* |
| Evidence | **[sdk]** `Texture` exposes `getImage`, `export`, `textureExportAsImage` and `imageWidth`/`imageHeight` (pixel dimensions). No `width=`, `height=`, `size=`, `tileSize` or equivalent exists anywhere in the bundle |

The Ruby plugin's material feature is not "apply an image" — it is *"apply an
image at its real-world size"*: `texture.size = (tile_w*10 + grout_mm,
tile_h*10 + grout_mm)`. In SketchUp a texture's scale is what makes a paint
operation measurable. **Without a size setter, the Usage tab's "m² painted"
figure is not trustworthy**, and that figure is the entire vendor-side value
proposition.

Exact Ruby behaviour to port (`main.rb`): millimetres = `tile_size_cm * 10`, plus
a grout allowance, with the "only if distorted" 2% rule.

**Fallbacks, best first:**

1. **Ship a pre-scaled texture** — resample the image server-side so that the
   material's default 1:1 mapping lands at the right size. Fragile: it depends on
   SketchUp's default texture mapping being predictable, which we cannot control.
2. **Use `op.loadMaterial()` with a `.skm`** — `Material.getSkm()` exists (2.30.3),
   so a material *file* can be authored with the correct scale on desktop and
   loaded on web. Requires us to generate `.skm` files at upload time. Plausible
   and worth a spike.
3. **Apply the material without a guaranteed scale, and label the m² figure as
   approximate.** Honest, but weakens the core claim — I would rather not.
4. **Report it as a limitation** and keep the m² number for desktop only.

**This is the single biggest open question in the port.** I need to know whether
`materialSetTextureImageRep()` (which takes 10 arguments and looks like it sets a
texture representation rather than just an image) allows a size. **[unverified]**
— that is spike item 8.

### B3. Interactive paint is not in the production JSA

| | |
|---|---|
| Evidence | **[docs]** *"Tools — We have prototyped first-class Tools support … but it is not yet available in the production version of the JSA."* |

Confirmed by **[sdk]**: the only tool primitives are
`placeComponentOnce`, `placeComponentRepeatedly`, `clearActiveTool`,
`getActiveTool`, `observeToolChanges`. There is no custom-tool class and no mouse
or pick event.

So the Ruby plugin's `MaterialPaintTool` (hover a face, click to paint) cannot be
reproduced.

**Fallbacks, in the order the brief asked for:**

- **(a) Native Paint Bucket pre-loaded.** `op.materialsSetCurrent(material)` exists
  **[sdk]**, so we may be able to make the Dirory material the active one and then
  ask the user to use SketchUp's own Paint tool. This would preserve the real
  painting experience — one extra click. **Best outcome. Spike item 9.**
- **(b) "Apply to selection"**. `op.drawingElementSetMaterialName(entity, name)` and
  `op.faceSetFrontMaterial(face, ref)` exist **[sdk]**. The user selects faces or a
  group, presses Apply, done. Worse for a big floor, fine for a wall.
- Ship (a) if the spike proves it, and (b) always as the explicit path.

---

## Gaps (work needed, nothing blocked)

### G1. `sku`, `product_url` and `dimensions` are empty catalogue-wide

**[live]** `dimensions`: null on all 1360 items. `sku`: null on all 1360.
The Inspector must therefore hide those rows rather than print "null". Not a JSA
gap — a data gap, and worth knowing before anyone demoes the Inspector.

### G2. `thumbnail_url` expires

**[live]** Signed `/storage/v1/object/sign/…?token=…`, ~552 chars. An offline
cached catalogue will show broken thumbnails. Refresh, or re-sign via
`/download/<asset_id>`.

### G3. No context menus

**[docs]** *"No SketchUp host renders `contextMenuItems` today. The field is
accepted, then ignored."* Do not design any flow that needs right-click — which
suits iPad anyway.

### G4. Export returns data URLs, not files

**[docs]** No file-system access. `Material.getSkm()` and `exportThumbnail()` both
return base64. CSV must be built in JS and handed over as a blob URL. Whether a
download actually lands inside the sandboxed iframe on iPad is **[unverified]** —
spike item 10.

### G5. Selected window type

**[docs]** `"tab"` (full-tab extensions) is *"coming soon"*. Available now:
`headless`, `floating`, `modal`, `sidebar`. The brief wants a **sidebar**; the
spike ships as `floating` so the panel is guaranteed to open and the other ten
checks can run. Swapping is one line — see `SPIKE.md`.

### G6. Extension Warehouse publishing

**[docs]** *"Extension Warehouse for publishing (**Coming soon**)"*. So the
install story today is: zip the bundle → **Extensions → Extension Manager → upload**
in SketchUp for Web. Self-hosting works by supplying only `manifest.json` with a
`baseUrl` pointing at our server — worth planning for, because it means we can
ship updates without a store review. **This is still true as of 12 Oct 2026.**

### G7. No per-entity observers

**[docs]** Use the streams instead — and note `observeInstanceChanges(callback)`
(2.30.0+) is exactly what the usage report needs, returning added instances and
removed ids with a change `source`. The 5-minute snapshot timer should hang off
the model revision rather than a blind interval.

### G8. Privacy link inconsistency (brief §8)

The Ruby plugin points at `https://dirory.id/privacy`; the product site is
`dirory.com`. **`dirory.id` is not a domain Dirory uses for the product** — the
marketing site is `dirory.com` and its privacy page is `https://dirory.com/privacy`.
The JSA port uses `dirory.com/privacy`. Flagged rather than decided, per the
brief.

---

## Names verified from the SDK (so nobody guesses)

A case-sensitive grep for `SketchupApi` in the bundle returns **zero** matches.
The global is **`SketchUpApi`** — capital U. Anything written from memory as
`SketchupApi` will throw `undefined is not an object`.

Confirmed members, extracted from the bundle:

```
SketchUpApi  connect, platform, getActiveModel, features, UI,
             streamActiveModel, observeActiveModel, serverProtocolVersion,
             extension, closeWindow, disconnect
model        performOperation, getDefinitions, getMaterials, getSelection,
             getSelectionMetadata, getTagManager, findEntities, getFacesAreas,
             getFaceUVs, getCurrentMaterial, getBounds
operation    createDefinition, createInstance, componentsLoad,
             componentsLoadFromUrl, loadDefinition, createMaterial,
             loadMaterial, materialsLoadFromUrl, materialsLoadDataUrl,
             materialSetColor, materialSetAlpha, materialSetName,
             materialSetTexture, materialSetTextureDataBase64,
             materialSetTextureImageRep, materialsSetCurrent,
             entitySetAttribute, entityDeleteAttribute, drawingElementSetTagName,
             drawingElementSetMaterial, drawingElementSetMaterialName,
             faceSetFrontMaterial, createTag, tagSetName, tagSetColor,
             drawingElementErase
tools        placeComponentOnce, placeComponentRepeatedly, clearActiveTool,
             getActiveTool, observeToolChanges
```

`window.SketchUpApi`, `window.SketchupChannel` and `window.sketchup` are what the
SDK attaches; `SketchupChannel` and `sketchup` are internal.

---

## Still to be answered by the spike (cannot be done without SketchUp)

| # | Question | Why it matters |
|---|---|---|
| 5 | Does `componentsLoadFromUrl` accept a Supabase signed URL, and does it need the `apikey` header in `init`? | Insert is the whole product |
| 6 | Where does the Tools object live (`model.tools`? `SketchUpApi.tools`? something else) and is placement interactive on iPad? | **[unverified]** — the spike probes three paths and reports which works |
| 8 | Is there *any* route to a real-world texture scale? | B2 — the m² number |
| 9 | Can `materialsSetCurrent` hand the native Paint Bucket a Dirory material? | B3 — the paint UX |
| 10 | Does `SketchUpApi.UI.openURL` and a blob download work inside the sandboxed iframe? | Sign-in and CSV export |
| 11 | Timing for 1,000+ instances | Whether the usage report needs chunking |
