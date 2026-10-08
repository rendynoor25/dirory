import { Card, CardHeader, Empty, Kpi, Table, Td } from "@/components/ui";
import { Sparkline } from "@/components/Sparkline";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Admin analytics (document §1: Growth, Users, Content, Library usage).
 *
 * Everything here is admin-only and reads the `admin_*` functions in migration
 * 0017. The vendor benchmark lives on the vendor dashboard, not here, because it
 * must stay aggregate.
 *
 * If migration 0017 has not been applied, each RPC returns an error and the
 * sections render their empty state rather than throwing.
 */
export default async function AdminAnalytics() {
  const { supabase } = await requireAdmin();

  const TARGET = 250;
  const [growthRes, weeklyRes, contentRes, catRes, searchRes, geoRes, cityRes] =
    await Promise.all([
      supabase.rpc("admin_growth_summary"),
      supabase.rpc("admin_installs_weekly", { p_weeks: 12 }),
      supabase.rpc("admin_content_coverage", { p_target: TARGET }),
      supabase.rpc("admin_top_categories", { p_days: 30 }),
      supabase.rpc("admin_searches_daily", { p_days: 30 }),
      supabase.rpc("admin_users_by_geography"),
      supabase.rpc("admin_users_by_city", { p_limit: 20 }),
    ]);

  type Growth = {
    installs_total: number;
    installs_new_7d: number;
    installs_new_30d: number;
    active_dau: number;
    active_wau: number;
    active_mau: number;
    installs_used: number;
    first_use_pct: number;
    retained_30d: number;
    retention_pct: number;
  };
  const growth = (growthRes.data?.[0] ?? null) as Growth | null;

  type Content = {
    published: number;
    samples: number;
    pending_review: number;
    draft: number;
    rejected: number;
    archived: number;
    with_thumbnail: number;
    without_thumbnail: number;
    idle_30d: number;
  };
  const content = (contentRes.data?.[0] ?? null) as Content | null;

  const weekly = (weeklyRes.data ?? []) as { week_start: string; installs: number }[];
  const categories = (catRes.data ?? []) as {
    category: string;
    type: string;
    inserts: number;
    area_m2: number;
    assets_used: number;
  }[];
  const searches = (searchRes.data ?? []) as { day: string; misses: number }[];
  const totalMisses = searches.reduce((s, d) => s + Number(d.misses), 0);

  const byProvince = (geoRes.data ?? []) as { province: string; users: number; answered: number }[];
  const byCity = (cityRes.data ?? []) as { city: string; province: string | null; users: number }[];
  const answered = byProvince.find((p) => p.province === "unknown")?.answered ?? 0;

  const thumbTotal = content ? Number(content.with_thumbnail) + Number(content.without_thumbnail) : 0;
  const thumbPct = thumbTotal ? Math.round((100 * Number(content!.with_thumbnail)) / thumbTotal) : 0;

  return (
    <div className="space-y-6">
      {/* ---- Growth ------------------------------------------------------ */}
      <Card>
        <CardHeader
          title="Growth and engagement"
          subtitle="Installs and activity. 'Active' means the install sent a usage snapshot in the window."
        />
        {growth ? (
          <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-5">
            <Kpi label="Installs" value={growth.installs_total} hint={`${growth.installs_new_30d} in 30 days`} />
            <Kpi label="New (7 days)" value={growth.installs_new_7d} />
            <Kpi label="DAU / WAU" value={`${growth.active_dau} / ${growth.active_wau}`} hint={`${growth.active_mau} monthly`} />
            <Kpi label="First-use" value={`${Number(growth.first_use_pct)}%`} hint={`${growth.installs_used} of ${growth.installs_total} ever used a product`} />
            <Kpi label="30-day retention" value={`${Number(growth.retention_pct)}%`} hint={`${growth.retained_30d} still active`} />
          </div>
        ) : (
          <Empty>Not available yet. Apply migration 0017 to enable these metrics.</Empty>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---- New installs per week ------------------------------------- */}
        <Card>
          <CardHeader title="New installs per week" subtitle="Last 12 weeks." />
          <div className="p-5">
            {weekly.length ? (
              <Sparkline points={weekly.map((w) => Number(w.installs))} width={520} height={70} />
            ) : (
              <Empty>No installs recorded in this window.</Empty>
            )}
          </div>
        </Card>

        {/* ---- Demand over time ------------------------------------------ */}
        <Card>
          <CardHeader
            title="Searches with no results"
            subtitle={`Last 30 days. ${totalMisses} in total.`}
          />
          <div className="p-5">
            {searches.length ? (
              <Sparkline points={searches.map((d) => Number(d.misses))} width={520} height={70} />
            ) : (
              <Empty>No unmet searches recorded.</Empty>
            )}
          </div>
        </Card>
      </div>

      {/* ---- Content coverage -------------------------------------------- */}
      <Card>
        <CardHeader
          title="Content coverage"
          subtitle={`Published products against the ${TARGET}-model target. Samples are Dirory's own free assets and are excluded from the target.`}
        />
        {content ? (
          <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Published" value={content.published} hint={`target ${TARGET}`} />
            <Kpi label="Dirory samples" value={content.samples} />
            <Kpi label="Thumbnails" value={`${thumbPct}%`} hint={`${content.without_thumbnail} missing`} />
            <Kpi label="In review" value={content.pending_review} />
            <Kpi label="Draft" value={content.draft} />
            <Kpi label="Idle 30 days" value={content.idle_30d} hint="published, no usage" />
          </div>
        ) : (
          <Empty>Not available yet. Apply migration 0017 to enable these metrics.</Empty>
        )}
      </Card>

      {/* ---- Users by location -------------------------------------------- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Users by province"
            subtitle={`Optional, self-reported. ${answered} of ${
              byProvince.reduce((s, p) => s + Number(p.users), 0)
            } accounts answered.`}
          />
          {byProvince.length ? (
            <Table head={["Province", "Users"]}>
              {byProvince.map((p) => (
                <tr key={p.province}>
                  <Td className="font-medium text-slate-900">{p.province}</Td>
                  <Td>{p.users}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>No accounts yet.</Empty>
          )}
        </Card>

        <Card>
          <CardHeader title="Users by city" subtitle="Top 20, optional and self-reported." />
          {byCity.length ? (
            <Table head={["City", "Province", "Users"]}>
              {byCity.map((c, i) => (
                <tr key={`${c.city}-${i}`}>
                  <Td className="font-medium text-slate-900">{c.city}</Td>
                  <Td className="text-slate-500">{c.province ?? "—"}</Td>
                  <Td>{c.users}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>Nobody has added a city yet. It is optional.</Empty>
          )}
        </Card>
      </div>

      {/* ---- Library usage ------------------------------------------------ */}
      <Card>
        <CardHeader
          title="Top categories"
          subtitle="Inserts and painted area in the last 30 days. Models count as units, materials as m²."
        />
        {categories.length ? (
          <Table head={["Category", "Type", "Inserts", "Area m²", "Assets used"]}>
            {categories.map((c, i) => (
              <tr key={`${c.category}-${c.type}-${i}`}>
                <Td className="font-medium text-slate-900">{c.category}</Td>
                <Td className="text-xs">{c.type}</Td>
                <Td>{Number(c.inserts) || "—"}</Td>
                <Td>{Number(c.area_m2) ? Number(c.area_m2).toFixed(1) : "—"}</Td>
                <Td>{c.assets_used}</Td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>No usage recorded in the last 30 days.</Empty>
        )}
      </Card>
    </div>
  );
}
