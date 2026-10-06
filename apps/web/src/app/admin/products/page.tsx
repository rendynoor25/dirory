import Link from "next/link";
import { Badge, Card, CardHeader, Empty, Table, Td, statusTone } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/**
 * FR-M12 — the Products section. Every asset in the catalogue, newest first,
 * with a search box and a type filter. Uploading happens on `/admin/products/new`.
 *
 * The "SU" column is the SketchUp version a model was saved in: a file saved in
 * a newer SketchUp cannot be opened by an older one, so it is worth seeing at a
 * glance before a product goes live.
 */
export default async function AdminProducts({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; page?: string }>;
}) {
  const { supabase } = await requireAdmin();
  const params = await searchParams;

  const q = (params.q ?? "").trim();
  const type = params.type === "model" || params.type === "material" ? params.type : "";
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from("assets")
    .select(
      "id, name, type, status, sku, dimensions, created_at, " +
        "vendors(brand_name, is_platform), categories(name), " +
        "asset_versions!assets_current_version_fk(su_version)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (type) query = query.eq("type", type);
  if (q) query = query.ilike("name", `%${q}%`);

  const { data: assets, count } = await query;
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const href = (over: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { q, type, page: String(page), ...over };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    const s = sp.toString();
    return `/admin/products${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Products"
          subtitle="FR-M12 / FR-V3 · upload a file and fill in the detail the plugin's Inspector shows. New products are published immediately unless you send them to review."
          action={
            <Link
              href="/admin/products/new"
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
            >
              Upload product
            </Link>
          }
        />

        <form method="get" className="flex flex-wrap items-end gap-2 border-b border-slate-100 px-5 py-4">
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-600">Search by name</label>
            <input
              name="q"
              defaultValue={q}
              placeholder="e.g. CW 630"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Type</label>
            <select
              name="type"
              defaultValue={type}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">All</option>
              <option value="model">Models</option>
              <option value="material">Materials</option>
            </select>
          </div>
          <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
            Filter
          </button>
        </form>

        {assets?.length ? (
          <Table head={["Product", "Type", "Brand", "Category", "SKU", "SU", "Status", "Added"]}>
            {assets.map((a: any) => {
              const vendor = Array.isArray(a.vendors) ? a.vendors[0] : a.vendors;
              const version = Array.isArray(a.asset_versions) ? a.asset_versions[0] : a.asset_versions;
              return (
                <tr key={a.id} className="hover:bg-slate-50/60">
                  <Td>
                    <Link
                      href={`/product/${a.id}`}
                      className="font-medium text-slate-900 hover:text-brand-700"
                    >
                      {a.name}
                    </Link>
                    {a.dimensions ? (
                      <div className="text-xs text-slate-400">{a.dimensions}</div>
                    ) : null}
                  </Td>
                  <Td>
                    <Badge tone={a.type === "material" ? "blue" : "gray"}>{a.type}</Badge>
                  </Td>
                  <Td className="text-xs">
                    {vendor?.brand_name ?? "—"}
                    {vendor?.is_platform ? (
                      <span className="ml-1 text-emerald-700">sample</span>
                    ) : null}
                  </Td>
                  <Td className="text-xs">{a.categories?.name ?? "—"}</Td>
                  <Td className="text-xs">{a.sku ?? "—"}</Td>
                  <Td className="text-xs">{version?.su_version ?? "—"}</Td>
                  <Td>
                    <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                  </Td>
                  <Td className="text-xs text-slate-500">{formatDateTime(a.created_at)}</Td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty>
            {q || type ? "No products match that filter." : "No products yet. Upload the first one."}
          </Empty>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          <span>
            {total.toLocaleString()} product{total === 1 ? "" : "s"}
            {q || type ? " matching" : ""}
          </span>
          {pages > 1 ? (
            <span className="flex items-center gap-2">
              <Link
                href={href({ page: String(page - 1) })}
                aria-disabled={page <= 1}
                className={page <= 1 ? "pointer-events-none opacity-40" : "hover:text-slate-800"}
              >
                ← Previous
              </Link>
              <span>
                Page {page} of {pages}
              </span>
              <Link
                href={href({ page: String(page + 1) })}
                aria-disabled={page >= pages}
                className={page >= pages ? "pointer-events-none opacity-40" : "hover:text-slate-800"}
              >
                Next →
              </Link>
            </span>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
