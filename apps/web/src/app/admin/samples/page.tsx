import { Badge, Card, CardHeader, Empty, Table, Td, statusTone } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

/** FR-M12 — the "Dirory" platform brand. Samples skip the review queue. */
export default async function AdminSamples() {
  const { supabase } = await requireAdmin();

  const { data: samples } = await supabase
    .from("assets")
    .select(
      "id, name, type, status, tags, created_at, current_version_id, categories(name), " +
        "asset_versions(id, version, file_path, review_status)",
    )
    .eq("vendor_id", "00000000-0000-0000-0000-0000000000d1")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Dirory samples"
          subtitle="FR-M12 / FR-A8 · free samples owned by the platform. Always visible, never quotable, excluded from vendor dashboards."
          action={
            <a
              href="/admin/products/new?brand=00000000-0000-0000-0000-0000000000d1"
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
            >
              New sample
            </a>
          }
        />
        {samples?.length ? (
          <Table head={["Name", "Type", "Category", "Versions", "Status", "Created"]}>
            {samples.map((s: any) => (
              <tr key={s.id}>
                <Td className="font-medium text-slate-900">{s.name}</Td>
                <Td>
                  <Badge tone={s.type === "material" ? "blue" : "gray"}>{s.type}</Badge>
                </Td>
                <Td>{s.categories?.name ?? "—"}</Td>
                <Td>{s.asset_versions?.length ?? 0}</Td>
                <Td>
                  <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                </Td>
                <Td className="text-xs text-slate-500">{formatDateTime(s.created_at)}</Td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>
            No samples yet. Upload one — samples are visible to architects without a subscription.
          </Empty>
        )}
      </Card>
    </div>
  );
}