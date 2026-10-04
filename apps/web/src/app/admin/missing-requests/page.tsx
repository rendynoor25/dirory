import { Badge, Card, CardHeader, Empty, SubmitButton, Table, Td, statusTone } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { updateMissingRequest } from "../actions";

/** FR-M10 — searches that returned nothing across the whole library. */
export default async function AdminMissingRequests({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; sort?: string }>;
}) {
  const { supabase } = await requireAdmin();
  const { status: statusParam, sort: sortParam } = await searchParams;
  const status = statusParam ?? "open";
  const sort = sortParam === "recent" ? "last_seen" : "miss_count";

  let query = supabase
    .from("missing_requests")
    .select("id, query_norm, miss_count, distinct_installs, status, note, first_seen, last_seen");
  if (status === "open") query = query.in("status", ["new", "planned"]);
  else if (status !== "all") query = query.eq("status", status);

  const { data: rows } = await query.order(sort, { ascending: false }).limit(200);

  const tabs = [
    { key: "open", label: "Open" },
    { key: "new", label: "New" },
    { key: "planned", label: "Planned" },
    { key: "added", label: "Added" },
    { key: "ignored", label: "Ignored" },
    { key: "all", label: "All" },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Missing requests"
          subtitle="FR-M10 · every 0-result search, grouped by normalised query. Use it to decide which sample to create or which brand to recruit."
        />
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
          {tabs.map((t) => (
            <a
              key={t.key}
              href={`/admin/missing-requests?status=${t.key}&sort=${sortParam ?? "count"}`}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                status === t.key ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {t.label}
            </a>
          ))}
          <span className="mx-2 text-slate-300">|</span>
          <a
            href={`/admin/missing-requests?status=${status}&sort=${sort === "miss_count" ? "recent" : "count"}`}
            className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
          >
            Sort: {sort === "miss_count" ? "most searched" : "most recent"}
          </a>
        </div>

        {rows?.length ? (
          <Table head={["Query", "Searches", "Installs", "First seen", "Last seen", "Status", "Note"]}>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/60">
                <Td className="font-medium text-slate-900">{r.query_norm}</Td>
                <Td>{r.miss_count}</Td>
                <Td>{r.distinct_installs}</Td>
                <Td className="text-xs text-slate-500">{formatDateTime(r.first_seen)}</Td>
                <Td className="text-xs text-slate-500">{formatDateTime(r.last_seen)}</Td>
                <Td>
                  <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                </Td>
                <Td>
                  <form action={updateMissingRequest} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <input
                      name="note"
                      defaultValue={r.note ?? ""}
                      placeholder="note…"
                      className="w-32 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                    />
                    <select
                      name="status"
                      defaultValue={r.status}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                    >
                      <option value="new">new</option>
                      <option value="planned">planned</option>
                      <option value="added">added</option>
                      <option value="ignored">ignored</option>
                    </select>
                    <SubmitButton variant="ghost">Save</SubmitButton>
                  </form>
                </Td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>
            Nothing here. Requests arrive as soon as plugin v0.5.0 is pointed at the ingest function.
          </Empty>
        )}
      </Card>
    </div>
  );
}