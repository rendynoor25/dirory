# Supabase egress: what happened and how to recover

## What the dashboard said

- Egress **13.2 GB / 5 GB** (Free plan)
- File storage **1.68 GB / 1 GB**
- The project was restricted. The API answered:

```json
{
  "message": "Service for this project is restricted due to the following violations: exceed_egress_quota, exceed_storage_size_quota. The project owner must upgrade their plan or remove spend caps to restore service."
}
```

Data is not lost. Supabase restricts the project; it does not delete it.

## Why it happened

Egress is bytes leaving Supabase: Storage downloads, Edge Function responses,
Auth/Database responses. The two biggest sources were in our code:

1. **Full-size images on every card.** `/api/thumb/<asset_id>` signed and
   streamed the original file. A material texture can be several MB, and the
   library grid opens 60 cards at a time. Browsers cached for a day, but every
   new visitor and every cache-busting reload downloaded the originals again.
   Bots crawling 1,300 product pages did the same.
2. **The catalogue on every panel open.** The SketchUp panel asked for
   `/catalog` each time it opened. That response was ~1.9 MB (including ~700 KB
   of signed thumbnail URLs), and native panels loaded the signed originals
   from storage.

Secondary: a 5-minute catalogue revalidation (now 60 minutes), and
`middleware.ts` refreshing the session for every image request.

## Recover now

1. **Restore the project.** On the Free plan the only immediate way is to
   upgrade the organisation to Pro (or another paid plan). Pro includes far more
   than the current 13.2 GB egress and 1.68 GB storage; check the current plan
   page in the dashboard. Upgrading also removes the storage pause.
   - If you cannot upgrade, the project stays restricted until the billing
     cycle resets **and** usage is back under the limits. Egress is already
     counted, so deleting files alone does not clear the egress violation.
2. **Deploy the fixes in this repository** (see below).
3. **Free storage space** (needed even on Free). After the project is restored,
   run the read-only audit:

   ```bash
   npm run storage:report
   ```

   It prints per-bucket totals, the largest objects, old asset versions and
   unreferenced uploads. Then delete the safe things:

   ```bash
   npm run rbz:prune            # dry run: old plugin releases
   npm run rbz:prune -- --yes   # keep the newest 2, delete the rest
   node scripts/remove-library-item.mjs <asset_id>
   ```

   The SQL equivalent, if you prefer the dashboard:

   ```sql
   select bucket_id, name, (metadata->>'size')::bigint as bytes
   from storage.objects
   order by bytes desc nulls last
   limit 30;
   ```

   Keep the current version of each asset; only old versions, superseded
   installers and unreferenced uploads are safe to remove. Never delete a
   `models`/`materials` object that the report lists as referenced.
4. **Deploy the updated plugin** so users stop downloading the full catalogue
   on every panel open. Until they update, old panels keep the old behaviour.

### Deploy

```bash
# web (image cache, hourly catalogue, /api/thumb route)
./scripts/deploy.sh

# catalogue function (proxy URLs instead of signed storage URLs)
supabase functions deploy catalog

# plugin: build/sign/release the RBZ as usual
npm run rbz:build
```

The web container needs the `thumb_cache` volume from `docker-compose.yml`.
Without it, images still work, but the cache is lost on every rebuild.

### Verify

- `curl -I https://dirory.com/api/thumb/<asset_id>?v=1` returns
  `Content-Type: image/webp`, `ETag`, and `Cache-Control: ... immutable`.
- The second request is fast and Supabase's Storage egress chart stays flat.
- `https://<project>.supabase.co/functions/v1/catalog` is ~1.2 MB, not ~1.9 MB,
  and `thumbnail_url` starts with `https://dirory.com/api/thumb/`.
- Opening the SketchUp panel twice does not download the catalogue the second
  time. The ⟳ button forces a fresh copy.

## Staying under the Free limits

The usage numbers are cumulative for the billing cycle. Deploying the fixes
stops new growth, but it does not subtract what has already been used. Only an
upgrade or the next cycle resets the counters.

### File storage — 1 GB

The bulk of the 1.68 GB is almost certainly the material textures: ~1,300
textures at ~1 MB each is already ~1.3 GB. Thumbnails are small once the image
proxy shrinks them, but the **original** `materials` files are what the plugin
downloads and applies, so the code cannot silently discard them.

1. Run `npm run storage:report`. It shows the real split per bucket, the 25
   largest objects, current vs old asset versions, and unreferenced uploads.
2. `npm run rbz:prune` (dry run, then `-- --yes`). The update function only ever
   serves the newest RBZ; old installers are pure waste. Keeping two allows a
   rollback.
3. Remove retired products with `node scripts/remove-library-item.mjs <asset_id>`
   rather than deleting objects by hand — it removes the rows and the files.
4. For **new** uploads, keep textures at 1024–2048 px and JPEG/PNG rather than
   multi-megabyte TIFF/PNG exports. That stops the library growing past the plan
   again.
5. If the library genuinely needs more than 1 GB, the Free plan is the wrong
   home for it: Pro gives 100 GB, or move `models`/`materials` to Cloudflare R2
   and keep the metadata in Postgres.

The report's "unreferenced" list can include an upload that is still in progress
(its database row is written after the file). Check the timestamp before deleting.

### Log ingestion — 1 GB

Log ingestion is the platform's log lines for API gateway, Auth, Storage,
Postgres and Edge Functions. There is **no log-level switch** on the Free plan;
you reduce it by reducing requests, errors and noisy logging.

The fixes in this repository remove the largest producers:

- The old catalogue signed ~1,300 thumbnail URLs **per fetch**, and each signed
  URL is logged. The catalogue now carries `/api/thumb/...` paths instead.
- The old `/api/thumb` signed one URL per image request; cache hits now make no
  Supabase request at all, and `middleware.ts` no longer calls `auth.getUser()`
  for images.
- The catalogue is revalidated hourly instead of every five minutes, and the
  plugin reuses its copy for 24 hours.
- The Edge Functions contain no `console.log` on the success path; keep it that
  way. Only log errors.

Remaining, and acceptable: device sign-in polls every 5 seconds for at most
15 minutes **only while signing in**, and the cron jobs (`expire_subscriptions`
hourly, `run_retention` daily) write a few lines. If log ingestion is still over
1 GB with normal traffic, use Log Explorer to see which service dominates; 1 GB
per month is very small and Pro is the practical answer.

`Log Query 7.74 / 100 GB` in the dashboard is the size of queries you run in the
Log Explorer, not ingestion. It is not a problem.

## Do not reintroduce the leak

- Never return signed storage URLs in the catalogue. They are large, expire in
  an hour, and bypass the image cache.
- Keep `thumbnail_url` pointed at `/api/thumb/...?v=<version>`.
- Do not serve `file_path` when `thumbnail_path` is null. A `.skp` is not an
  image; the route now returns 404 and the card shows its placeholder.
- Do not mount the web container without the `thumb_cache` volume.
- Keep `middleware.ts` from running on `/api/thumb`.

## Optional next step: a CDN in front of the images

The cache above is per web container. A CDN (Cloudflare in front of
`dirory.com`, caching `/api/thumb/*`) removes even the first download per
visitor and survives container rebuilds. If media keeps growing, move the big
files to Cloudflare R2 (no egress fee) and keep Supabase for Postgres, Auth and
RLS. Neither is needed at today's size.

## Should we migrate to Firebase?

No. It does not fix the cause, and it is not cheaper for this workload:

- Firebase Cloud Storage bills bandwidth per GB on the Blaze plan, the same
  shape as Supabase egress. Firestore also bills per document read; our
  catalogue is one big read of ~1,300 rows, which would become thousands of
  document reads per page unless duplicated into one document.
- We would rewrite Auth, RLS policies (Firebase Security Rules are a different
  model), Storage paths, Edge Functions, the web app, the plugin, the Revit and
  Rhino add-ins, and every test. That is weeks of work and new risk.
- The 13.2 GB was mostly full-size images and repeated catalogue downloads.
  Those are fixed here in a few hundred lines.

If you outgrow Supabase later, the cheapest move is media to R2, not a full
backend rewrite.
