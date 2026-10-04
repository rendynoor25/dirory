# Dirory — Privacy Policy

**Status: DRAFT — not yet reviewed by a lawyer. Do not publish as-is.**
Version 0.1 · 4 Oct 2026 · applies to the Dirory SketchUp plugin (RBZ v0.5.1 and
later), the Dirory vendor portal and the Dirory admin back-office.

This draft is written to be *accurate about what the software actually transmits*,
not to be aspirational. Every claim below was checked against the source
(`dirory_library/cloud.rb` and `ui/panel.html`, RBZ v0.5.1). Where the software
does not yet support a right, that is stated plainly rather than promised.

Governed by the **Personal Data Protection Law (UU No. 27/2022, "UU PDP")** and its
implementing regulations.

---

## 1. Who we are

Dirory ("we") operates a multi-vendor library of 3D product models and materials
for architects, delivered inside SketchUp, and a web portal for brands.

- **Data controller:** [LEGAL ENTITY NAME], [ADDRESS], Indonesia
- **Contact for privacy matters:** [privacy@dirory.id] — *to be created*
- **Data protection officer:** [REQUIRED IF APPLICABLE under UU PDP Art. 53]

*This placeholder must be completed before launch. A controller must be a
identifiable legal person or entity.*

## 2. What this policy covers

It covers:

- **Architects** — designers who install the Dirory plugin in SketchUp. The plugin
  is free. Browsing and search work without an account.
- **Vendors** — brands that publish products through the vendor portal.
- **Visitors** — anyone browsing the Dirory website.

## 3. The short version

- Browsing and searching the catalogue is **anonymous**. We do not know who you are.
- Creating an account (to insert, paint or ask for a quote) gives us your name,
  email, and optionally your phone and firm.
- The plugin sends a **list of Dirory products used in your SketchUp file** so
  brands can see how their products are used. This contains **no geometry, no file
  contents and no file paths**.
- Your **contact details never reach a brand unless you send that brand a quote
  request**.
- Sending the **project title** is a **separate, opt-in** choice, off by default.
- You can turn sharing off, and you can ask us to delete your data.

## 4. What we collect, why, and our lawful basis

### 4.1 If you browse without an account

| Data | Why | Lawful basis |
|---|---|---|
| A random install ID (UUID) | Distinguish installations without identifying you | Legitimate interest (service integrity) |
| Plugin version, SketchUp version, OS | Compatibility and support | Legitimate interest |
| Search terms that return **zero** results | Tell us what the library is missing | **Consent** (see §5) |

We do **not** collect your name, email, IP-derived identity, or what you browsed.
A search that returns results is never reported; only searches that return nothing.

### 4.2 If you create an account

| Data | Required? | Why | Basis |
|---|---|---|---|
| Name | Yes | Identify you in the panel and on quotes | Contract |
| Email | Yes | Account, support, and lead delivery | Contract |
| Phone | No | Only to help a brand reach you about a quote you sent | Consent |
| Firm | No | Shown to a brand on a quote you sent | Consent |

The plugin's sign-in is currently **unverified** (v0.5.1): we store what you type
without confirming the address belongs to you. A verified login is planned. Until
then, **do not treat a Dirory account as proof of identity.**

### 4.3 Usage snapshots — what a SketchUp file reports

While signed in, and while "Share usage" is on, the plugin reads the open
SketchUp model and sends a **table of Dirory items in it**:

| Sent | Not sent |
|---|---|
| Product name, category, brand | Model geometry, meshes, or components |
| Quantity of each model placed | The `.skp` file itself |
| Painted area (m²) and face count per material | File paths or folder names |
| A model GUID (SketchUp's own identifier for the file) | Screenshots or thumbnails |
| Totals (`models`, `area_m2`) | Your undo history or edits |
| **Project title — opt-in, off by default** (§5.2) | |

Purpose: let a brand see that its products are used, and how much. Vendors see
**aggregates only** — a vendor never sees your project name, your identity, or
your file.

Cadence: at most every 5 minutes, and **only if the file changed** since the last
check and the resulting table differs from the previous one. If you remove
everything, one empty table is sent so our copy is cleared.

### 4.4 Quote requests

When you ask a brand for a quote, we send **that brand, and only that brand**, the
items of theirs in your file plus the details you choose to enter (project name,
city, timeline, note). This is you directing your data to them — a disclosure you
initiate, not one we make on your behalf. Your name, email, phone and firm reach
the brand only here, and only if you complete the form.

### 4.5 If you are a vendor

We collect company name, brand name, logo, contact person, phone/WhatsApp, email,
website and (optionally) NPWP, plus the products you upload. Basis: contract.
NPWP is used for invoicing and tax compliance. Keep it out of product images.

### 4.6 What we never collect

Passwords or tokens (authentication is delegated to Supabase Auth; we never see a
password), credit card numbers (payment gateways handle them), the contents of
your SketchUp files, or your filesystem paths.

## 5. Consent — the switches, and what each one covers

### 5.1 "Share usage" — anonymous usage and search reports

One switch, on by default, covering:

1. **Usage snapshots** — the table in §4.3, *without* the project title.
2. **Search misses** — zero-result search terms, anonymously.

Turning it off stops both immediately and the data stays on your computer (the
plugin queues locally and only sends when the switch is on). You can also switch it
off in the account dialog at any time.

### 5.2 "Send project name" — opt-in, OFF by default

A **separate** switch, because a project title is often personal data: it can
contain a client's name or a site address, whereas "bathtub gold" does not. When
off — the default — snapshots carry **no project title**.

We know this split is not yet in plugin v0.5.1, which sends the project title under
the same single switch. **The consent dialog and the separate switch ship in
RBZ v0.5.2**; until you upgrade, the deployed plugin sends the title whenever
"Share usage" is on. If that matters to you, turn "Share usage" off until v0.5.2,
or install v0.5.2 when it is available.

### 5.3 Withdrawing consent

Turning a switch off is as easy as turning it on, and we do not penalise you for
it. You keep full use of the library. Withdrawing consent stops *future* sharing;
to remove what was already sent, use the deletion route in §8.

## 6. What we do NOT do

We do **not**: sell your data; use it for advertising or profiling; send you
marketing without separate consent; share your project names with vendors; let a
vendor see another vendor's leads, statistics or products; or read your SketchUp
files.

## 7. Who we share it with (processors)

| Processor | Role | Location |
|---|---|---|
| Supabase | Database, authentication, file storage, Edge Functions | Singapore |
| [Hosting provider — Sumopod] | Runs the web applications | [Indonesia] |
| [Vercel or Cloudflare] | Serves the website | [Confirm before launch] |
| [Midtrans / Xendit] | Vendor subscription payments | Indonesia |
| [Resend / Supabase SMTP] | Transactional email | [Confirm] |

Each is bound by a data-processing agreement. **Cross-border note (UU PDP Art. 56):**
Supabase stores data in **Singapore**. Transferring personal data outside Indonesia
requires an adequate protection level or appropriate safeguards; confirm this with
counsel, or choose an Indonesian region if one becomes available.

## 8. Your rights under UU PDP

You have the right to: be informed; access your data; correct it; request erasure;
withdraw consent; object to processing; restrict processing; port your data; and
lodge a complaint with the supervisory authority.

**How to exercise them today:** email [privacy@dirory.id]. We respond within
**14 working days** (target) and complete erasure requests within **30 days**,
except where we must retain records for tax or legal reasons, in which case we
say so and explain why.

**Honest limitation:** the vendor portal and admin back-office do **not yet** have
self-service export or deletion screens. Requests are handled manually. Self-service
is planned. We would rather tell you this than promise a button that does not exist.

## 9. How long we keep it

| Data | Retention | Notes |
|---|---|---|
| Usage snapshot history | **12 months** | Then deleted or anonymised |
| Latest snapshot state per file | While the account is active | Cleared on deletion |
| Raw search misses | **24 months** | Then deleted or aggregated |
| Aggregated demand (`missing_requests`) | Indefinite | No personal data after aggregation |
| Account data | While active, then 30 days after deletion | Then erased |
| Invoices and payment records | **10 years** | Indonesian tax law requires retention |
| Audit log | 24 months | Records admin actions, not your content |

These match PRD §292. Where the code does not yet enforce a limit, deletion is
manual and these periods are the commitment we will meet.

## 10. Security

Row Level Security is enforced on every table, so a vendor can only ever reach its
own rows. Model and material files sit in **private** storage and are served only
via short-lived signed URLs (≤ 10 minutes) for approved products. Only brand logos
are public. The service-role key exists only on the server and is never shipped in
anything a user downloads. Soft sign-in is unverified, as noted in §4.2.

## 11. Children

The service is a professional tool for architects and is **not directed at anyone
under 18**. We do not knowingly collect children's data. If you believe a child has
provided data, contact us and we will delete it.

## 12. Changes to this policy

We will post changes here with a new version number and date, and notify account
holders by email for anything material. Continuing to use the service after a
material change requires renewed consent where consent is the basis.

## 13. Contact and complaints

[privacy@dirory.id] · [POSTAL ADDRESS]

If you are unsatisfied, you may complain to the Indonesian data protection
supervisory authority under UU PDP.

---

## Appendix A — Exact payloads (for verification)

This appendix exists so a technical reviewer or regulator can check the claims
above against the wire format. It is the reconciling document between this policy
and the plugin.

**`POST /events`** envelope (plugin v0.5.x, `cloud.rb#envelope`):

```json
{
  "install_id": "uuid",
  "user": { "name": "…", "email": "…", "phone": "", "firm": "" },
  "plugin_version": "0.5.1", "su_version": "24.0.553", "platform": "win",
  "events": [ /* up to 50 */ ]
}
```

`user` is `null` when signed out.

**Event kinds and their fields:**

| Kind | Fields sent | Contains personal data? |
|---|---|---|
| `account` | `action` (`sign_in`/`sign_out`) | No (the envelope already carries identity) |
| `search_miss` | `query`, `tab` | No — a search term, unattributed |
| `usage_snapshot` | `model_id`, `project` *(opt-in, v0.5.2+)*, `items[]`, `totals` | **Project title only**, and only with consent |
| `quote_request` | `model_id`, `project`, `brands[]`, `items[]` | Yes — disclosed to the chosen brand |

**Not present anywhere in the wire format, verified by inspection:**
file contents, geometry, mesh data, file paths, thumbnails, IP addresses,
browser fingerprints, or any field not listed in the table above.

**Verification instruction.** To confirm what your installation sends, set
Connection Settings to a URL you control and inspect the JSON, or read
`~/.dirory/outbox.json`, which holds the exact queued payloads before sending.
