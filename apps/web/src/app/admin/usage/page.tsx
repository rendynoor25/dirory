import { Badge, Card, CardHeader, Empty, Table, Td } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

/**
 * FR-M11 — usage explorer. INTERNAL ONLY: this is the one place where project
 * names and architect identities are shown. Vendors never see this data.
 */
export default async function AdminUsage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; q?: string }>;
}) {
  const { supabase } = await requireAdmin();
  const params = await searchParams;

  const { data: snaps } = await supabase
    .from("usage_snapshots")
    .select(
      "id, install_id, model_id, project, totals, taken_at, " +
        "profiles(full_name, firm), usage_snapshot_items(type, name, category, brand, qty, faces, area_m2)",
    )
    .order("taken_at", { ascending: false })
    .limit(50);

  const brand = (params.brand ?? "").toLowerCase();
  const rows = (snaps ?? []).filter((s: any) => {
    if (!brand) return true;
    return (s.usage_snapshot_items ?? []).some((i: any) =>
      (i.brand ?? "").toLowerCase().includes(brand),
    );
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Usage explorer"
          subtitle="FR-M11 · latest snapshot per (install, project). Admin only — never exposed to vendors."
          action={
            <form className="flex items-center gap-2">
              <input
                name="brand"
                defaultValue={params.brand ?? ""}
                placeholder="Filter by brand"
                className="w-40 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
              />
              <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white">
                Filter
              </button>
            </form>
          }
        />
        {rows.length ? (
          <div className="divide-y divide-slate-100">
            {rows.map((s: any) => (
              <div key={s.id} className="px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {s.project || "(untitled model)"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {s.profiles?.full_name ?? "anonymous"}
                      {s.profiles?.firm ? ` · ${s.profiles.firm}` : ""} · install{" "}
                      {String(s.install_id).slice(0, 8)} · {formatDateTime(s.taken_at)}
                    </p>
                  </div>
                  <div className="text-xs text-slate-500">
                    {s.totals?.models ?? 0} models · {s.totals?.area_m2 ?? 0} m²
                  </div>
                </div>
                {s.usage_snapshot_items?.length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {s.usage_snapshot_items.map((i: any, idx: number) => (
                      <span
                        key={idx}
                        className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600"
                      >
                        {i.name}
                        <span className="text-slate-400">
                          {" "}
                          · {i.brand ?? "Dirory"} · {i.type === "material" ? `${i.area_m2} m²` : `×${i.qty}`}
                        </span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-400">empty snapshot (project cleared)</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Empty>No snapshots received yet.</Empty>
        )}
      </Card>
    </div>
  );
}