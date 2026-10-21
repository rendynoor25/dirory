# Dirory for SketchUp Web and iPad (JSA)

A second, separate client: the **SketchUp JavaScript API (JSA)** extension that
runs in **SketchUp for Web** and **SketchUp for iPad**.

The Ruby plugin in `../plugin/` is untouched and stays the desktop product. This
directory is a new project that reuses the same backend.

> **Status: M1 — `extension/` is the first working extension** (library,
> sign-in, place models, paint materials), for SketchUp Web JSA Labs: build it
> with `scripts/build-web-extension.ps1` (from the repo root) and see
> `extension/README.md`. `spike/` is the earlier M0 probe. See `docs/GAPS.md`
> for what the JSA cannot do (texture size, interactive paint).
>
> **iPad:** SketchUp for iPad does not load extensions, so there is no iPad
> version yet. The JSA docs list iOS as a future host; when SketchUp for iPad
> loads extensions, this same extension is meant to run there.

---

## What is here

```
jsa/
  spike/            the M0 probe bundle — upload this to SketchUp for Web
    manifest.json
    index.html
    spike.js        the eleven checks
  docs/
    SPIKE.md        M0 results table (brief §6)
    GAPS.md         what the JSA cannot do, and the fallbacks (brief §0.4, §5)
    API.md          the real backend contract, captured from the live functions
  scripts/
    pack-spike.ps1  zips the bundle
```

## Run the spike

```powershell
powershell -ExecutionPolicy Bypass -File jsa/scripts/pack-spike.ps1
```

Then, in **SketchUp for Web**: `Extensions → Extension Manager → upload
dist/dirory-spike-0.0.1.zip`, and open **Dirory Spike (M0)** from the Extensions
menu. Press **Run all checks**, then **Copy results** and paste them into
`docs/SPIKE.md` §2.

The spike also has a **Sign in** button, because several checks need a token —
`/download` returns 401 anonymously. It probes where the Tools API lives rather
than assuming, and prints a member dump for anything whose shape is uncertain.

## Read before changing anything

1. **No secret may enter this directory.** Only the publishable key, which is
   public by design and already in the Ruby client.
2. **`SketchUpApi` is capital-U.** A grep of the SDK bundle for `SketchupApi`
   returns zero matches. Guessed names throw `undefined is not an object`.
3. **When this becomes real code, every SketchUp call moves behind
   `src/sketchup/`** and nothing else may import the SDK — brief §0.3. The spike
   does not follow that rule on purpose: it is disposable, and one file is easier
   to read while we are still finding out what the API does.
4. **If the JSA cannot do something, it goes in `GAPS.md`.** No silent fallbacks.

## Two blockers awaiting a decision

- **`/catalog` returns 405 to the CORS preflight**, so it cannot be called from
  the extension with the `apikey` header. Needs either a one-branch change to
  `supabase/functions/catalog/index.ts` (ask first — brief §0.2) or calling it
  header-free. See `docs/GAPS.md` B1.
- **No texture-size API**, which puts the "m² painted" figure at risk on web and
  iPad. See `docs/GAPS.md` B2.
