import { Badge, Card, CardHeader, Empty, Kpi, Table, Td, statusTone } from "@/components/ui";
import { Sparkline } from "@/components/Sparkline";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Vendor dashboard — demo",
  robots: { index: false, follow: false },
};

/**
 * A demonstration vendor dashboard for sales proposals.
 *
 * EVERY NUMBER ON THIS PAGE IS INVENTED. It reads nothing from the database and
 * requires no sign-in, so it is safe to show a prospective brand without
 * exposing anyone's real data — and it cannot be confused with the live
 * dashboard, which is what `/vendor` shows to a signed-in vendor.
 *
 * It reuses the real `Card`, `Kpi`, `Table`, `Badge` and `Sparkline` components,
 * so what a brand sees in a proposal is what they actually get.
 *
 * Why it does not use the shared `Shell`: that shell hides the sidebar below the
 * `lg` breakpoint, so a screenshot taken in a narrow browser window collapses to
 * the phone layout. A proposal image should always show the desktop layout, so
 * this page renders its own fixed-width frame. It is demo-only markup.
 *
 * The brand name is fictional. Substitute the prospect's own brand when
 * presenting.
 */

const BRAND = "Contoh Sanitari";

// A plausible activity series (units + painted area per day, 90 days).
const TREND = [
  6, 9, 7, 12, 10, 14, 11, 16, 13, 9, 15, 18, 14, 20, 17, 13, 19, 22, 18, 15,
  24, 21, 19, 26, 23, 18, 27, 25, 21, 30, 28, 24, 31, 29, 26, 22, 33, 30, 27,
  35, 32, 28, 24, 37, 34, 31, 27, 39, 36, 33, 29, 41, 38, 34, 30, 43, 40, 36,
  32, 45, 42, 38, 34, 47, 44, 40, 36, 49, 46, 42, 38, 51, 48, 44, 40, 53, 50,
  46, 42, 55, 52, 48, 44, 57, 54, 50, 46, 59, 56, 52,
];

type Product = {
  name: string;
  type: "model" | "material";
  projects: number;
  units: number;
  area: number;
  quotes: number;
  trend: number[];
};

const PRODUCTS: Product[] = [
  { name: "CW 630 PJ", type: "model", projects: 168, units: 412, area: 0, quotes: 14, trend: [2, 3, 5, 4, 7, 6, 9, 8, 11, 10] },
  { name: "CE9", type: "model", projects: 121, units: 287, area: 0, quotes: 9, trend: [1, 2, 3, 3, 5, 4, 6, 7, 6, 8] },
  { name: "Ottium", type: "model", projects: 74, units: 156, area: 0, quotes: 5, trend: [0, 1, 2, 2, 3, 3, 4, 4, 5, 5] },
  { name: "Dark Grey01", type: "material", projects: 96, units: 0, area: 342.5, quotes: 6, trend: [3, 4, 3, 6, 5, 8, 7, 9, 8, 11] },
  { name: "U104", type: "model", projects: 58, units: 98, area: 0, quotes: 3, trend: [0, 1, 1, 2, 2, 3, 3, 3, 4, 4] },
  { name: "NP PB 1546T", type: "material", projects: 61, units: 0, area: 218.0, quotes: 4, trend: [2, 2, 3, 4, 3, 5, 4, 6, 5, 7] },
  { name: "Arabian", type: "model", projects: 41, units: 74, area: 0, quotes: 2, trend: [0, 1, 1, 1, 2, 2, 2, 3, 3, 3] },
  { name: "SAPPHIRA", type: "model", projects: 33, units: 61, area: 0, quotes: 1, trend: [0, 0, 1, 1, 1, 2, 2, 2, 2, 3] },
];

const CATEGORY_SHARE = [
  { category: "Sanitary", type: "model", you: 1284, total: 3378, share: 38.0 },
  { category: "Tiles", type: "material", you: 342, total: 1120, share: 30.5 },
  { category: "Paint", type: "material", you: 218, total: 1640, share: 13.3 },
];

const LEADS = [
  { project: "Rumah Ibu Rina", city: "Jakarta Selatan", items: 3, status: "won", date: "2 Okt 2026" },
  { project: "Apartemen Sudirman Park", city: "Jakarta Pusat", items: 5, status: "contacted", date: "28 Sep 2026" },
  { project: "Rumah Pak Budi", city: "Bandung", items: 2, status: "new", date: "26 Sep 2026" },
  { project: "Kantor Wijaya", city: "Surabaya", items: 4, status: "new", date: "21 Sep 2026" },
];

const NAV = [
  { label: "Dashboard", active: true },
  { label: "Products", active: false },
  { label: "Leads inbox", active: false, badge: 2 },
  { label: "Subscription", active: false },
  { label: "Team", active: false },
];

export default function DemoVendorDashboard() {
  return (
    // Fixed desktop width: the screenshot is the deliverable, so the layout must
    // not collapse to the phone breakpoint.
    <div className="flex min-h-screen w-[1440px] bg-slate-50">
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <p className="text-sm font-semibold text-slate-900">{BRAND}</p>
          <p className="mt-0.5 text-xs text-slate-500">Vendor portal</p>
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {NAV.map((item) => (
            <div
              key={item.label}
              className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm ${
                item.active ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600"
              }`}
            >
              <span>{item.label}</span>
              {item.badge ? (
                <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
                  {item.badge}
                </span>
              ) : null}
            </div>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-4 text-xs text-slate-500">demo@contoh.co.id</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
          <span className="text-sm text-slate-500">{BRAND}</span>
          <span className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600">
            Sign out
          </span>
        </header>

        <main className="flex-1 p-6">
          <div className="space-y-6">
            {/* Demo banner — must stay visible so nobody mistakes this for live data. */}
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
              <strong>Halaman contoh (demo).</strong> Semua angka di halaman ini adalah ilustrasi,
              bukan data nyata. Tampilan dan metriknya sama dengan yang Anda dapatkan di portal
              vendor Dirory.
            </div>

            {/* ---- range picker -------------------------------------------- */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500">Range</span>
                {[7, 30, 90].map((d) => (
                  <span
                    key={d}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      d === 30 ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {d} days
                  </span>
                ))}
              </div>
              <span className="ml-auto rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700">
                Export CSV
              </span>
            </div>

            {/* ---- KPIs ---------------------------------------------------- */}
            <div className="grid grid-cols-6 gap-4">
              <Kpi label="Projects using" value="216" hint="distinct SketchUp files" />
              <Kpi label="Units placed" value="1,284" hint="models" />
              <Kpi label="Painted area" value="892.4 m²" hint="materials" />
              <Kpi label="Architects" value="143" hint="signed in" />
              <Kpi label="Quote requests" value="38" />
              <Kpi label="Published products" value="12 / 15" />
            </div>

            {/* ---- trend --------------------------------------------------- */}
            <Card>
              <CardHeader
                title="Activity trend"
                subtitle="Units + painted area per day, last 90 days."
              />
              <div className="px-5 py-5">
                <Sparkline points={TREND} width={1040} height={70} />
              </div>
            </Card>

            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader
                  title="Products"
                  subtitle="Per-product performance. Project names and architect identities are never shown here."
                />
                <Table head={["Product", "Type", "Projects", "Units", "Area m²", "Quotes", "Trend"]}>
                  {PRODUCTS.map((p) => (
                    <tr key={p.name} className="hover:bg-slate-50/60">
                      <Td className="font-medium text-slate-900">{p.name}</Td>
                      <Td>
                        <Badge tone={p.type === "material" ? "blue" : "gray"}>{p.type}</Badge>
                      </Td>
                      <Td>{p.projects}</Td>
                      <Td>{p.units || "—"}</Td>
                      <Td>{p.area ? p.area.toFixed(1) : "—"}</Td>
                      <Td>{p.quotes || "—"}</Td>
                      <Td>
                        <Sparkline points={p.trend} />
                      </Td>
                    </tr>
                  ))}
                </Table>
              </Card>

              <div className="space-y-6">
                <Card>
                  <CardHeader
                    title="Category share"
                    subtitle="Your share of all usage in your categories. Aggregate only — never another brand's figures."
                  />
                  <Table head={["Category", "You", "Category", "Share"]}>
                    {CATEGORY_SHARE.map((c) => (
                      <tr key={c.category}>
                        <Td className="font-medium text-slate-900">
                          {c.category}
                          <span className="ml-1 text-xs text-slate-400">{c.type}</span>
                        </Td>
                        <Td>{c.you.toLocaleString("id-ID")}</Td>
                        <Td className="text-slate-500">{c.total.toLocaleString("id-ID")}</Td>
                        <Td>
                          <span className="font-medium text-slate-800">{c.share}%</span>
                        </Td>
                      </tr>
                    ))}
                  </Table>
                </Card>

                <Card>
                  <CardHeader
                    title="Catalog status"
                    subtitle="Where your products sit in the review flow."
                  />
                  <div className="grid grid-cols-2 gap-3 p-5 text-sm">
                    <Stat label="Live" value="12" />
                    <Stat label="In review" value="2" />
                    <Stat label="Draft" value="1" />
                    <Stat label="Rejected" value="0" />
                  </div>
                </Card>

                <Card>
                  <CardHeader title="Subscription" />
                  <div className="p-5 text-sm">
                    <Badge tone={statusTone("active")}>active</Badge>
                    <p className="mt-2 text-slate-700">Growth · renews 30 Sep 2027</p>
                    <p className="mt-1 text-xs text-slate-500">12 of 30 products used</p>
                  </div>
                </Card>

                <Card>
                  <CardHeader title="Latest leads" />
                  {LEADS.length ? (
                    <ul className="divide-y divide-slate-50">
                      {LEADS.map((l) => (
                        <li key={l.project} className="px-5 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-slate-800">{l.project}</p>
                            <Badge tone={statusTone(l.status)}>{l.status}</Badge>
                          </div>
                          <p className="text-xs text-slate-500">
                            {l.city} · {l.items} items · {l.date}
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
        </main>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}
