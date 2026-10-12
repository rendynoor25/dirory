# M0 — spike results

Brief §6 M0 asks for eight things to be **proven inside SketchUp for Web**, with
results written here as a table.

**Status: partially done, and I have to be straight about which part.**

I have no SketchUp-for-Web session and no JSA Labs access, so **nothing that
requires running inside SketchUp has been run**. Everything that could be
established outside it has been, and it is not nothing — one blocker and two
product-affecting gaps came out of it. The spike bundle in `../spike/` is built
and ready for you to upload; when you run it, press **Copy results** and paste
the output under §2.

---

## 1. Verified here (no SketchUp needed)

| # | Claim | Result | How it was checked |
|---|---|---|---|
| — | `/catalog` answers `OPTIONS` | **FAILS** — 405 | `curl -X OPTIONS` with `Origin`, `Access-Control-Request-Method` and `Access-Control-Request-Headers` |
| — | …and therefore blocks the browser | **CONFIRMED** | headless Chrome from a real `http://127.0.0.1` origin: `GET /catalog` + `apikey` → `TypeError: Failed to fetch` |
| — | CORS is otherwise fine | **WORKS** | same header set on `/download/<uuid>` → resolved, and `/auth-device/*`, `/favourites`, `/quotes`, `/events` all preflight 200 |
| — | `/catalog` without custom headers | **WORKS** — 200, 1360 items | plain `fetch(FN + '/catalog')` |
| — | Real catalogue shape | **CAPTURED** | see `API.md` — 1360 items, 1330 material / 30 model, 30 categories, 13 brands |
| — | `/download` needs a token | **CONFIRMED** — 401 without one | `GET /download/<uuid>` with `apikey` only |
| — | `/auth-device/start` response | **CAPTURED** — returns `device_code`, `user_code`, `verification_url`, `interval`, `expires_in`; **no `verification_url_complete`**, contrary to brief §3 | live `POST` |
| — | SDK exposure name | **CAPTURED** — `window.SketchUpApi` (capital U) | extracted from `sketchup-js-api.js` v2.37.1, API 2.37.1 |
| — | Texture size API | **ABSENT** | searched the whole 2.6 MB bundle: no size/width/tile setter on `Texture`; docs say "size manipulation is future" |
| — | Custom tools | **ABSENT** | docs: "not yet available in the production version" |
| — | `contextMenuItems` | **IGNORED** | docs: "No SketchUp host renders `contextMenuItems` today" |
| — | Extension Warehouse publishing | **still "coming soon"** | as of 12 Oct 2026 |

Full detail and consequences: `GAPS.md`.

---

## 2. To be proven in SketchUp for Web — run the spike

Upload the zip from `../spike/` via **Extensions → Extension Manager**, then open
**Dirory Spike (M0)** and press **Run all checks**. Paste the copied table here.

| # | Brief item | Expected | Result | Exact call the spike uses |
|---|---|---|---|---|
| 1 | Manifest + window opens, `connect()` works, `platform` read | — | **PENDING** | `SketchUpApi.connect()`, `SketchUpApi.platform` |
| 2 | `fetch('/catalog')` with the publishable key | **expected to FAIL** (B1) | **PENDING** | `fetch(FN + '/catalog', { headers: { apikey } })` |
| 3 | Load one real `.skp` from a signed URL | — | **PENDING** | `op.componentsLoadFromUrl(new Request(url), undefined, { addOperationError: true })` |
| 4 | Write + read attribute dictionary `Dirory` | — | **PENDING** | `op.entitySetAttribute(model, defId, 'Dirory', k, v)` → `definition.attributes.findDictionary('Dirory')` |
| 5 | Textured material from a signed URL + set tile size | **size expected to FAIL** (B2) | **PENDING** | `op.createMaterial(name)`, `model.getMaterials()`; then dump `Texture` members |
| 6 | Paint a selected face; native Paint Bucket | — | **PENDING** | `model.getSelection()`, `op.drawingElementSetMaterialName(entity, name)`, `op.materialsSetCurrent` |
| 7 | Open a link; trigger a download | — | **PENDING** | `SketchUpApi.UI.openURL(url)`, blob anchor |
| 8 | Count instances in a 1,000+ model, timed | — | **PENDING** | `model.getDefinitions()` → `definition.getInstances()` |
| + | Device sign-in from the iframe | — | **PENDING** | `POST /auth-device/start`, poll every 5 s |
| + | Interactive placement | — | **PENDING** | `tools.placeComponentRepeatedly({ sketchupId })` — spike probes `model.tools` / `model.getTools()` / `SketchUpApi.tools` and reports which exists |

### Two things the spike deliberately does **not** guess

- **Which object owns the Tools API.** The bundle shows a `Tools` class with
  `placeComponentOnce` / `placeComponentRepeatedly`, but not how to reach an
  instance of it. The spike tries three plausible paths and prints
  `model.tools`, `model.getTools()`, `SketchUpApi.tools` plus a full member dump
  of whichever it finds, so the answer is recorded rather than assumed.
- **`materialSetTextureImageRep`.** It takes ten arguments and may be the escape
  hatch for texture scale. The spike dumps the `Texture` prototype so we can see
  what is actually settable.

### Sidebar vs floating

The brief wants a **sidebar** window. The spike ships as **`floating`** on
purpose: if the window fails to open there are no results at all, and eleven
answers beat one. To test the sidebar as well, change one line in
`../spike/manifest.json` and re-zip:

```json
"window": { "type": "sidebar" }
```

If it opens, we have the answer for the sidebar too. If it does not, that is also
the answer — and it would change the iPad design.

---

## 3. M0 verdict

**Not complete.** One blocker needs your call before M1:

> **B1 — `/catalog` returns 405 to the preflight**, so it cannot be called from
> the extension with the `apikey` header. Fix the function (one `OPTIONS`
> branch), or call it header-free as a workaround. Your call, because brief §0.2
> says the backend is off-limits without asking.

And two gaps change what the product can promise:

> **B2 — no texture size API**, so "m² painted" is not reliable on web/iPad until
> we find a route (`.skm` pre-scaling is the most promising).
> **B3 — no interactive paint tool**, so the fallback is the native Paint Bucket
> pre-loaded with the Dirory material, or Apply-to-selection.

Per the brief, stopping here for your go-ahead.
