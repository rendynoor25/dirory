# Demo material for vendor proposals

## `vendor-dashboard.png`

A screenshot of the vendor dashboard, for use in a proposal to a prospective
brand. 1440 × 2148.

**Every number in it is invented.** It is a mock, not a capture of live data —
no real brand's figures appear anywhere in it, which is what makes it safe to
send to another brand.

It is generated from `/demo/vendor`, a page in the web app that reads nothing
from the database and needs no sign-in. That page reuses the real `Card`, `Kpi`,
`Table`, `Badge` and `Sparkline` components, so the mock shows what a brand
actually gets rather than an artist's impression.

## Re-taking the screenshot

```bash
cd apps/web
npm run build
npx next start -p 3146        # or: npm run dev
```

Then open <http://localhost:3146/demo/vendor> and capture the full page. The page
is a fixed 1440 px wide on purpose: a narrow browser window would otherwise
collapse it to the phone layout, because the shared shell hides the sidebar below
the `lg` breakpoint.

## Before sending it

1. **Replace the brand name.** It currently reads *Contoh Sanitari*. Put the
   prospect's own brand in `BRAND` at the top of
   `apps/web/src/app/demo/vendor/page.tsx` — a dashboard showing their name is far
   more persuasive than a generic one.
2. **Keep the "Halaman contoh (demo)" banner.** It is what stops the image being
   mistaken for real data, and it is honest about what the page is.
3. **Substitute real product names** if you know the brand's range — the current
   list mixes TOTO, Nippon and ROMAN-style names as placeholders.

## What the numbers illustrate

| Metric | What it proves to a brand |
|---|---|
| Projects using, Units placed | Reach: their products are in real projects |
| Painted area (m²) | Material usage, not just clicks |
| Architects | Distinct people, not repeat opens |
| Quote requests | Leads, not just exposure |
| Category share | Where they stand against the category, anonymously |
| Catalog status | What is live, in review, or still a draft |
| Latest leads | The pipeline, with project and city from consented quotes |

No project names, architect identities or file contents appear anywhere — the
dashboard is aggregate by design, and the screenshot reflects that.
