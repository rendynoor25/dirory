import Link from "next/link";
import { Badge, Card, CardHeader, Empty, Kpi, Table, Td, statusTone } from "@/components/ui";
import { Sparkline } from "@/components/Sparkline";
import { getSession } from "@/lib/auth";
import { formatDate, formatIDR } from "@/lib/format";
import { registerVendor } from "./actions";

export const dynamic = "force-dynamic";

const SORTS = ["units", "area", "projects", "quotes", "name"] as const;
type Sort = (typeof SORTS)[number];

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function dayAxis(from: string, to: string): string[] {
  const days: string[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (let d = start; d <= end && days.length < 400; d = new Date(d.getTime() + 86400000)) {
    days.push(isoDate(d));
  }
  return days;
}

/**
 * FR-V4 — the vendor dashboard, the screen the marketing and sales team lives in.
 *
 * All numbers come from `vendor_usage_totals` / `vendor_usage_by_asset` /
 * `vendor_usage_daily`, which are SECURITY DEFINER aggregates: a vendor sees
 * counts and never a project name or an architect identity (PRD §9).
 *
 * Computed live from the snapshot tables, so it no longer depends on the nightly
 * rollup (which needs pg_cron and was never scheduled).
 */
export default async function VendorHome({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    from?: string;
    to?: string;
    sort?: string;
    error?: string;
    registered?: string;
  }>;
}) {
  const { supabase, memberships } = await getSession();
  const membership = memberships[0];
  const sp = await searchParams;

  // ---------------------------------------------------------------- onboarding
  if (!membership) {
    return (
      <Card>
        <CardHeader
          title="Register your brand"
          subtitle="FR-V1 · your account stays pending until the Dirory team approves it."
        />
        {sp.error ? (
          <p className="mx-5 mt-5 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {sp.error}
          </p>
        ) : sp.registered ? (
          <p className="mx-5 mt-5 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Your registration was received. Reload this page — your details are being looked up.
          </p>
        ) : null}
        <form action={registerVendor} className="grid gap-4 p-5 sm:grid-cols-2">
          <Field name="name" label="Company name" required />
          <Field name="brand_name" label="Brand name" required />
          <Field name="email" label="Contact email" type="email" required />
          <Field name="whatsapp" label="Phone / WhatsApp" required />
          <Field name="website" label="Website" />
          <Field name="npwp" label="NPWP (optional)" />
          <div className="sm:col-span-2">
            <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Submit registration
            </button>
          </div>
        </form>
      </Card>
    );
  }

  const vendorId = membership.vendor_id;

  // ---------------------------------------------------------------- status
  // A registered vendor is `pending` until the Dirory team approves it, and used
  // to land on a dashboard full of zeros with no explanation. The status is now
  // the first thing the page says.
  const { data: vendorRow } = await supabase
    .from("vendors")
    .select("name, brand_name, email, whatsapp, status, approved_at")
    .eq("id", vendorId)
    .maybeSingle();
  const vendorStatus = vendorRow?.status ?? membership.vendor?.status ?? "pending";

  if (vendorStatus === "pending") {
    return (
      <div className="space-y-6">
        {sp.registered ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Registration received — thank you.
          </p>
        ) : null}
        <Card>
          <CardHeader
            title="Your registration is being reviewed"
            subtitle="FR-V1 · nothing else is needed from you right now."
          />
          <div className="space-y-4 p-5 text-sm text-slate-700">
            <p>
              We review every brand by hand, to keep the catalogue credible for architects. Your
              details are with the Dirory team.
            </p>
            <table className="w-full text-left">
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-2 text-slate-500">Company</td>
                  <td className="py-2 font-medium">{vendorRow?.name ?? "—"}</td>
                </tr>
                <tr>
                  <td className="py-2 text-slate-500">Brand</td>
                  <td className="py-2 font-medium">{vendorRow?.brand_name ?? "—"}</td>
                </tr>
                <tr>
                  <td className="py-2 text-slate-500">Contact</td>
                  <td className="py-2">
                    {vendorRow?.email ?? "—"}
                    {vendorRow?.whatsapp ? ` · ${vendorRow.whatsapp}` : ""}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 text-slate-500">Status</td>
                  <td className="py-2">
                    <Badge tone="amber">pending review</Badge>
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="rounded-lg bg-slate-50 p-4 text-slate-600">
              <p className="font-medium text-slate-800">How you will know</p>
              <p className="mt-1">
                Sign in here again after we approve you: this screen becomes your dashboard. There is
                no separate notification yet — this page is the notification.
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (vendorStatus === "suspended") {
    return (
      <Card>
        <CardHeader title="This account is suspended" subtitle="Please contact the Dirory team." />
        <div className="p-5 text-sm text-slate-700">
          <p>
            Your brand <strong>{vendorRow?.brand_name ?? "—"}</strong> is suspended, so its products
            are not shown to architects. Contact Dirory to resolve it.
          </p>
        </div>
      </Card>
    );
  }

  // Recently approved: say so, once, so the vendor knows the wait is over.
  const approvedRecently =
    vendorRow?.approved_at != null &&
    Date.now() - new Date(vendorRow.approved_at).getTime() < 30 * 864e5;

  const rangeDays = Number(sp.range ?? 30) || 30;
  const to = sp.to ?? isoDate(new Date());
  const fromDefault = new Date();
  fromDefault.setDate(fromDefault.getDate() - rangeDays);
  const from = sp.from ?? isoDate(fromDefault);
  const sort: Sort = (SORTS as readonly string[]).includes(sp.sort ?? "")
    ? (sp.sort as Sort)
    : "units";

  const [totalsRes, byAssetRes, dailyRes, leadsRes, subRes, assetsRes, shareRes] = await Promise.all([
    supabase.rpc("vendor_usage_totals", { p_vendor: vendorId, p_from: from, p_to: to }),
    supabase.rpc("vendor_usage_by_asset", { p_vendor: vendorId, p_from: from, p_to: to }),
    supabase.rpc("vendor_usage_daily", { p_vendor: vendorId, p_from: from, p_to: to }),
    supabase
      .from("quote_requests")
      .select("id, project_name, city, status, created_at, items")
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("subscriptions")
      .select("status, current_period_end, plans(name)")
      .eq("vendor_id", vendorId)
      .maybeSingle(),
    supabase.from("assets").select("id, status").eq("vendor_id", vendorId),
    // Category benchmark: the vendor's own units plus a category total, never a
    // competitor's figures (migration 0017).
    supabase.rpc("vendor_category_share", { p_vendor: vendorId, p_from: from, p_to: to }),
  ]);

  const totals = (totalsRes.data?.[0] ?? {
    projects: 0,
    units: 0,
    area_m2: 0,
    architects: 0,
    quotes: 0,
  }) as { projects: number; units: number; area_m2: number; architects: number; quotes: number };

  type Row = {
    asset_id: string;
    name: string;
    type: string;
    projects: number;
    units: number;
    area_m2: number;
    quotes: number;
  };
  const rows = (byAssetRes.data ?? []) as Row[];

  // Daily series → a full day axis, per asset and vendor-wide.
  const days = dayAxis(from, to);
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const seriesByAsset = new Map<string, number[]>();
  const vendorSeries = new Array(days.length).fill(0);
  for (const p of (dailyRes.data ?? []) as { asset_id: string; day: string; units: number; area_m2: number }[]) {
    const i = dayIndex.get(p.day);
    if (i === undefined) continue;
    const value = Number(p.units || 0) + Number(p.area_m2 || 0);
    if (!seriesByAsset.has(p.asset_id)) seriesByAsset.set(p.asset_id, new Array(days.length).fill(0));
    seriesByAsset.get(p.asset_id)![i] += value;
    vendorSeries[i] += value;
  }

  const sorted = [...rows].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "area") return Number(b.area_m2) - Number(a.area_m2);
    if (sort === "projects") return b.projects - a.projects;
    if (sort === "quotes") return b.quotes - a.quotes;
    return b.units - a.units;
  });

  const published = (assetsRes.data ?? []).filter((a) => a.status === "approved").length;
  const categoryShare = (shareRes.data ?? []) as {
    category: string;
    type: string;
    vendor_units: number;
    category_units: number;
    share_pct: number;
  }[];
  const catalog = (assetsRes.data ?? []).reduce(
    (acc: Record<string, number>, a) => {
      acc[a.status] = (acc[a.status] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const subscription = subRes.data as { status: string; current_period_end: string | null; plans: { name: string } | null } | null;

  const rangeHref = (over: Record<string, string | undefined>) => {
    const q = new URLSearchParams({ range: String(rangeDays), from, to, sort, ...over });
    return `/vendor?${q.toString()}`;
  };
  const csvHref = `/api/vendor/usage?from=${from}&to=${to}`;

  return (
    <div className="space-y-6">
      {approvedRecently ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <strong>{vendorRow?.brand_name ?? "Your brand"} is approved.</strong> This dashboard is
          live. Upload products and each one appears to architects once it passes review.
        </div>
      ) : null}

      {/* ---- range picker ------------------------------------------------ */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Range</span>
          {[7, 30, 90].map((d) => (
            <Link
              key={d}
              href={`/vendor?range=${d}&sort=${sort}`}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                rangeDays === d && !sp.from ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {d} days
            </Link>
          ))}
        </div>
        <form method="get" className="flex items-end gap-2">
          <input type="hidden" name="range" value={rangeDays} />
          <input type="hidden" name="sort" value={sort} />
          <div>
            <label className="text-xs font-medium text-slate-600">From</label>
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="mt-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">To</label>
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="mt-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
            />
          </div>
          <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
            Apply
          </button>
        </form>
        <a
          href={csvHref}
          className="ml-auto rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          ⭳ Export CSV
        </a>
      </div>

      {/* ---- KPIs -------------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Projects using" value={totals.projects} hint="distinct SketchUp files" />
        <Kpi label="Units placed" value={totals.units} hint="models" />
        <Kpi label="Painted area" value={`${Number(totals.area_m2).toFixed(1)} m²`} hint="materials" />
        <Kpi label="Architects" value={totals.architects} hint="signed in" />
        <Kpi label="Quote requests" value={totals.quotes} />
        <Kpi label="Published products" value={`${published} / ${(assetsRes.data ?? []).length}`} />
      </div>

      {/* ---- trend ------------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Activity trend"
          subtitle={`Units + painted area per day, ${formatDate(from)} → ${formatDate(to)}.`}
        />
        <div className="px-5 py-5">
          {vendorSeries.some((v) => v > 0) ? (
            <Sparkline points={vendorSeries} width={900} height={70} />
          ) : (
            <p className="text-sm text-slate-500">
              No activity recorded in this range yet. Numbers appear once architects insert your
              products in SketchUp and the usage snapshots arrive.
            </p>
          )}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Products"
            subtitle="FR-V4 · per-product performance. You never see project names or architect identities here."
          />
          {sorted.length ? (
            <Table head={["Product", "Type", "Projects", "Units", "Area m²", "Quotes", "Trend"]}>
              {sorted.map((r) => (
                <tr key={r.asset_id} className="hover:bg-slate-50/60">
                  <Td className="font-medium text-slate-900">{r.name}</Td>
                  <Td>
                    <Badge tone={r.type === "material" ? "blue" : "gray"}>{r.type}</Badge>
                  </Td>
                  <Td>{r.projects}</Td>
                  <Td>{r.units || "—"}</Td>
                  <Td>{r.area_m2 ? Number(r.area_m2).toFixed(1) : "—"}</Td>
                  <Td>{r.quotes || "—"}</Td>
                  <Td>
                    <Sparkline points={seriesByAsset.get(r.asset_id) ?? []} />
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>
              No products yet. Add them under <Link href="/vendor/assets" className="text-brand-600">Products</Link>.
            </Empty>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            <span className="font-medium">Sort by</span>
            {SORTS.map((s) => (
              <Link
                key={s}
                href={rangeHref({ sort: s })}
                className={`rounded-full px-2.5 py-0.5 ${
                  sort === s ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {s}
              </Link>
            ))}
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Subscription"
              action={
                <Link href="/vendor/subscription" className="text-xs font-medium text-brand-600">
                  Manage →
                </Link>
              }
            />
            <div className="p-5 text-sm">
              {subscription ? (
                <>
                  <Badge tone={statusTone(subscription.status)}>{subscription.status}</Badge>
                  <p className="mt-2 text-slate-700">
                    {subscription.plans?.name ?? "No plan"} · renews{" "}
                    {formatDate(subscription.current_period_end)}
                  </p>
                </>
              ) : (
                <p className="text-slate-500">
                  No plan yet.{" "}
                  <Link href="/vendor/subscription" className="text-brand-600">
                    Choose one →
                  </Link>
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Category share"
              subtitle="Your share of all usage in the categories you sell into, for the selected range. Aggregate only — never another brand's figures."
            />
            {categoryShare.length ? (
              <Table head={["Category", "You", "Category", "Share"]}>
                {categoryShare.map((c, i) => (
                  <tr key={`${c.category}-${c.type}-${i}`}>
                    <Td className="font-medium text-slate-900">
                      {c.category}
                      <span className="ml-1 text-xs text-slate-400">{c.type}</span>
                    </Td>
                    <Td>{Number(c.vendor_units).toFixed(0)}</Td>
                    <Td className="text-slate-500">{Number(c.category_units).toFixed(0)}</Td>
                    <Td>
                      <span className="font-medium text-slate-800">{Number(c.share_pct)}%</span>
                    </Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>
                No comparable usage yet. This fills in once architects use products in your
                categories.
              </Empty>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Catalog status"
              subtitle="Where your products sit in the review flow."
              action={
                <Link href="/vendor/assets" className="text-xs font-medium text-brand-600">
                  Manage →
                </Link>
              }
            />
            <div className="grid grid-cols-2 gap-3 p-5 text-sm">
              <CatalogStat label="Live" value={catalog.approved ?? 0} />
              <CatalogStat label="In review" value={catalog.pending_review ?? 0} />
              <CatalogStat label="Draft" value={catalog.draft ?? 0} />
              <CatalogStat label="Rejected" value={catalog.rejected ?? 0} />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Latest leads"
              action={
                <Link href="/vendor/leads" className="text-xs font-medium text-brand-600">
                  Inbox →
                </Link>
              }
            />
            {leadsRes.data?.length ? (
              <ul className="divide-y divide-slate-50">
                {leadsRes.data.map((l: any) => (
                  <li key={l.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800">{l.project_name ?? "—"}</p>
                      <Badge tone={statusTone(l.status)}>{l.status}</Badge>
                    </div>
                    <p className="text-xs text-slate-500">
                      {l.city ?? ""} · {(l.items ?? []).length} items · {formatDate(l.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No leads yet.</Empty>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  required = false,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
    </div>
  );
}

function CatalogStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}
