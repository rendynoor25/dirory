# Dirory — Privacy Policy

The published, authoritative policy is the page at **dirory.com/privacy**, whose
text lives in `apps/web/src/app/privacy/page.tsx` (English and Bahasa Indonesia).

- **Version 1.1** (16 October 2026): v1.0 plus the model hash kept for the two free RAB estimates. Under UU No. 27 Tahun 2022 (UU PDP).
- Controller: Rendy Noor Chandra (Dirory), contact hello@dirory.com and WhatsApp.
- It replaces the internal draft v0.1 (4 Oct 2026), which described plugin
  v0.5.1 (unverified sign-in, usage sharing on by default). That draft is in git
  history.

## Keeping it true

Every statement in the policy describes what the software does. When a change
adds data, a purpose or a recipient:

1. Update both languages in `apps/web/src/app/privacy/page.tsx` and bump `VERSION`.
2. Bump `PLUGIN_CONSENT_VERSION` in `apps/web/src/lib/consent.ts` and
   `CONSENT_VERSION` in `plugin/dirory_library/cloud.rb`, so the download page and
   the plugin ask everyone again.
3. Note it in `docs/CHANGELOG.md`.

The facts the policy relies on, and where they are enforced:

| Claim | Enforced in |
|---|---|
| Nothing shared before consent; project name separate | `plugin/dirory_library/cloud.rb` (`consent_answered?`), `/download` |
| Search misses anonymous, emails/phones removed | `supabase/functions/events` (`scrubQuery`), migrations 0031, 0033 |
| Consent log, token-verified | `supabase/functions/events`, migrations 0031, 0033, 0034 |
| Vendors see figures only from 5+ architects | migration 0035 |
| Retention 12 / 24 months, daily | migrations 0036, 0037 (`run_retention`) |
| Revit add-in sends no usage data | `revit/DiroryRevit/src/Bridge.cs` |
| Payments via Midtrans; project pass and free estimates store only a model hash | migrations 0039, 0044, `supabase/functions/rab` |
