# Dirory cloud API — as observed, not as documented

Everything here was captured by calling the live Edge Functions, not copied from
the Ruby client. Capture date **12 Oct 2026**, project `ajlmncbzufagplbaaukv`.

Base URL: `https://ajlmncbzufagplbaaukv.supabase.co/functions/v1`

The brief asked me to call `/catalog` and write the real response shape here. It
did, and it turned up three things the Ruby client never had to care about —
marked **⚠ CORS**, **⚠ expiry** and **⚠ size** below.

---

## 1. Authentication headers

```
apikey: sb_publishable_…        always (public by design)
content-type: application/json  always
authorization: Bearer <token>   only when signed in
```

**Do not** put the publishable key on `Authorization` — Supabase answers
`Invalid JWT`. Only legacy `eyJ…` keys belong there.

---

## 2. `GET /catalog` — anonymous, no token needed

Returns the whole catalogue in one response. No pagination.

```
top-level keys: updated_at, count, items, brand_logos
updated_at : 2026-10-12T06:19:30.322Z
count      : 1360          (== items.length)
brand_logos: 8 entries, keyed by lower-case brand name
```

Composition:

| | |
|---|---|
| items | **1360** — 1330 `material`, 30 `model` |
| categories | **30** |
| brands | **13** — TACO, NIRO GRANITE, Nippon, Propan, Trilliunware, WOOD1, Toto, ROMAN, Ellis, ALPHAMAX, Tromso, MATERIUM, Dirory |
| `brand_logos` keys | taco, niro granite, nippon, propan, trilliunware, toto, roman, materium |

⚠ **CORS — `/catalog` is the one endpoint that cannot be called from a browser
with the `apikey` header.** It is the only function that does not answer
`OPTIONS`; it returns **405**, which fails the preflight, and Chrome reports
`TypeError: Failed to fetch`. Verified in a real browser with a control
(`/download` with the same header resolves). Two ways out:

- call it with **no custom headers at all** — it is public and answers `200`
  (works today, but silently depends on the function never requiring the key), or
- add an `OPTIONS` branch to `supabase/functions/catalog/index.ts`, as the other
  six functions already have. **This needs the founder's approval** (brief §0.2).

### Item shape

Every item has all of these keys (verified: the same key set on both a model and
a material). Fields that do not apply are `null`, not absent.

| Field | Type | Notes |
|---|---|---|
| `id` | string | equals `asset_id` and `key` in every item observed |
| `key` | string | legacy-compatible key |
| `name` | string | e.g. `Chrysolite`, `ES 307 W - flat` |
| `type` | `model` \| `material` | |
| `category` | string | 30 distinct |
| `brand` | string | display form, e.g. `NIRO GRANITE` |
| `sample` | boolean | Dirory's own samples |
| `tags` | string[] | brand and category are usually repeated inside |
| `thumbnail` | string | storage path, not a URL |
| `thumbnail_url` | string | **signed URL** — see expiry below |
| `model_path` | string \| null | set on `model` items |
| `material_path` | string \| null | set on `material` items |
| `asset_id` | string (uuid) | what `/download/<id>` takes |
| `version` | number | |
| `tile_size_cm` | [w,h] \| null | present on **274** items — the materials that carry a real-world size |
| `sku` | string \| null | **null on all 1360** |
| `product_url` | string \| null | |
| `dimensions` | any \| null | **null on all 1360** |
| `su_version` | string \| null | present on all 30 models (`"2018"`) |
| `legacy_key` | string | original library path |
| `brand_logo` | string | public storage URL |
| `vendor_id` | string (uuid) | |

Two consequences worth stating plainly:

- `sku`, `product_url` and `dimensions` are **empty across the entire
  catalogue**, so the Inspector has nothing to show for them yet. It must hide
  those rows rather than render "null".
- `tile_size_cm` exists on only 274 of 1330 materials. For the other ~1056 there
  is no real-world size to apply — relevant because the JSA has no texture-size
  API anyway (see `GAPS.md`).

⚠ **Expiry — `thumbnail_url` is signed and short-lived.** It is a
`/storage/v1/object/sign/…?token=…` URL of ~552 characters. A catalogue cached
for offline browsing will show broken thumbnails once the token expires. Options:
re-fetch `/catalog` (2.1 MB — see below), or resolve each thumbnail through
`/download/<asset_id>` when it is actually needed.

⚠ **Size — 2,126,620 bytes uncompressed.** On iPad this is a real cost. Cache it
in IndexedDB and refresh on `updated_at`. Worth confirming that the Edge Function
is served gzipped through the iframe (Supabase generally compresses; JSON of this
shape compresses well because of the repeated keys).

---

## 3. `GET /download/<asset_id>` — needs a token

Returns a short-lived signed URL and the original filename.

```
{ "url": "https://…/storage/v1/object/sign/…?token=…", "file_name": "Chrysolite.skp" }
```

Without a token: **HTTP 401**. So insert, paint and quote are gated on sign-in,
exactly as the brief says.

Open question for the spike: whether the JSA component loader accepts this URL
(it is public HTTPS, so it should) and whether it needs the `apikey` header on
the request — `op.componentsLoadFromUrl(request, init, opts)` takes a fetch
`init`, so we can pass headers if required.

---

## 4. `POST /auth-device/start`

```
→ { install_id, plugin_version, platform }
← { device_code, user_code, verification_url, interval: 5, expires_in: 900 }
```

Verified against the live function on 12 Oct 2026. **The response does not
include `verification_url_complete`**, although both the build brief (§3) and the
Ruby client (`cloud.rb:361`) name it. The Ruby client survives because it reads
`verification_url_complete || verification_url`; `verification_url` is always
populated, e.g. `https://dirory.com/auth/device?code=T432-VG8K`.

`interval` and `expires_in` (seconds) are returned and should be honoured rather
than hardcoding a 5-second poll and a 15-minute deadline — the two happen to
agree today, which is exactly why hardcoding them would go unnoticed when they
change.

## 5. `POST /auth-device/poll`

```
→ { device_code, install_id, plugin_version }     every 5 s, ≤ 15 min
← { status: "approved" | "expired" | "denied", token, user }
```

## 6. `GET`/`POST /favourites`

```
POST → { favourites, recent }
```

## 7. `POST /quotes`

```
→ { install_id, project_name, city, timeline, note, phone_shared, brands, items }
```

## 8. `POST /events`

```
→ { install_id, user, plugin_version, su_version, platform,
    events: [{ id, kind, ts, data }] }
```

---

## 9. Preflight status, endpoint by endpoint

Measured with a real `OPTIONS` preflight carrying
`Access-Control-Request-Headers: apikey,authorization,content-type`:

| Endpoint | OPTIONS | ACAO | Usable from the iframe |
|---|---|---|---|
| `/catalog` | **405** | `*` | **NO** with the `apikey` header |
| `/download/<id>` | 200 | `*` | yes |
| `/auth-device/start` | 200 | `*` | yes |
| `/auth-device/poll` | 200 | `*` | yes |
| `/favourites` | 200 | `*` | yes |
| `/quotes` | 200 | `*` | yes |
| `/events` | 200 | `*` | yes |

`Access-Control-Allow-Origin: *` everywhere, and the allow-headers list already
includes `apikey`, `authorization` and `content-type`. The platform adds those
headers; the functions must still return a success status to `OPTIONS`, and
`catalog` is the one that does not.
