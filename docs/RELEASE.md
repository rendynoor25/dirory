# Releasing the SketchUp plugin

Every release follows these steps, in this order. The signing step makes the
extension show as **Signed** in SketchUp's Extension Manager instead of
**Unsigned**, so it also loads under the *Identified Extensions Only* loading
policy.

> A signature covers every file in the extension. Change one byte after signing
> and SketchUp reports the extension as modified. So **sign last**: build, test,
> sign, then publish the signed file and nothing else. Every release, including
> a one-line fix, is signed again.

## 1. Bump the version

- `plugin/dirory_library/cloud.rb` → `PLUGIN_VERSION = 'x.y.z'`
- `docs/CHANGELOG.md` → an entry for the release

## 2. Build and check

```bash
npm run rb:check
```

```bash
powershell -ExecutionPolicy Bypass -File scripts/build-rbz.ps1 -Output dist/DiroryLibrary-x.y.z.rbz
```

Install the unsigned build in SketchUp (Extension Manager → Install Extension),
restart, and try it on a real model before signing.

## 3. Sign it (Extension Warehouse Developer Center)

1. Sign in at **extensions.sketchup.com** with Dirory's Trimble ID.
2. Open **Developer Center → Extension Signing**. The first time, accept the
   developer terms.
3. Upload `dist/DiroryLibrary-x.y.z.rbz`.
4. Choose **Sign** (encryption is optional and not needed).
5. Download the signed archive and **replace** `dist/DiroryLibrary-x.y.z.rbz`
   with it. Keep the same file name.
6. Install the signed file once in SketchUp and check that Extension Manager
   shows **Signed**.

## 4. Publish

The auto-updater (Update badge and popup in the panel):

```bash
node scripts/upload-plugin-release.mjs --file dist/DiroryLibrary-x.y.z.rbz --notes "First note;Second note" --notes-id "Catatan pertama;Catatan kedua"
```

The website download (`/download`):

- copy the signed file to `apps/web/private/DiroryLibrary-x.y.z.rbz`
- set `PLUGIN_VERSION` in `apps/web/src/lib/pluginRelease.ts` to `x.y.z`
- commit, push to `main`, then deploy on the server:

```bash
ssh dirory-vps 'cd ~/dirory && ./scripts/deploy.sh'
```

## How updates stay signed

The updater (`plugin/dirory_library/updater.rb`) downloads the published
archive, refuses it unless it holds the whole extension (`dirory_library.rb`
and `dirory_library/`), and on the next SketchUp start **replaces** the
installed extension instead of copying over it: the old `dirory_library`
folder is backed up to `~/.dirory/previous_version`, deleted, and the new one
copied in whole. A file a release removed therefore cannot linger and break
the signature. If the copy fails, the backup is put back.

Architects' sign-in and settings are unaffected: they live in SketchUp's
preferences and `~/.dirory`, never inside the extension folder.

## Revit add-in

Two downloads on `/download`, same version (`REVIT_VERSION` in
`apps/web/src/lib/pluginRelease.ts`):

- **Revit 2024** (.NET Framework 4.8): `scripts/build-revit.ps1` builds
  `dist/revit/DiroryRevit-2024-x.y.z.zip`, served by `/api/download/revit`.
- **Revit 2025-2027** (.NET 8 / .NET 10): `scripts/build-revit-multi.ps1` builds
  each year and packs `dist/revit/DiroryRevit-2025-2027-x.y.z.zip`, with one
  Install-Dirory.cmd that installs for every Revit 2025-2027 it finds. Served
  by `/api/download/revit-2025`. Years not installed on the build PC need
  `scripts/fetch-revit-refs.ps1 -Revit <year>` once (reference DLLs from
  nuget.org into `.cache/`).

**Windows installer (all years in one .exe):**
`scripts/build-revit-installer.ps1` builds 2024-2027 and compiles
`revit/DiroryRevit/installer/Dirory.iss` with Inno Setup 6
(`winget install JRSoftware.InnoSetup`) into
`dist/revit/Dirory-Revit-Setup-x.y.z.exe`. It installs for the current user
(no admin) into the same `%APPDATA%\Autodesk\Revit\Addins\<year>` folders as
the zips, so it upgrades a zip install. It offers only the Revit years found,
waits for Revit to close, and adds "Dirory for Revit" to Apps & features.
Set `DIRORY_SIGN_CERT` / `DIRORY_SIGN_PASSWORD` to sign the DLLs and the .exe.
The artwork comes from `D:\Dirory\brand` via `scripts/make-installer-art.ps1`.

Then copy both zips to `apps/web/private/`, set `REVIT_VERSION`, run
`scripts/build-download-bundle.ps1` (the "Both" download carries both Revit
folders), commit and deploy as above. Revit does not require signed add-ins;
it asks once and the architect chooses Always Load.
