import { Badge, Card, CardHeader, Empty, SubmitButton, Table, Td } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatBytes, formatDateTime } from "@/lib/format";
import { reviewAsset } from "../actions";

export default async function AdminReviews() {
  const { supabase } = await requireAdmin();

  const { data: queue } = await supabase
    .from("asset_versions")
    .select(
      "id, version, file_path, thumbnail_path, file_size, created_at, " +
        "assets(id, name, type, tags, sku, product_url, tile_w_cm, tile_h_cm, status, " +
        "categories(name), vendors(brand_name, name))",
    )
    .eq("review_status", "pending")
    .order("created_at", { ascending: true });

  // Private buckets: hand the reviewer short-lived links (PRD §11: ≤ 10 min).
  const rows = await Promise.all(
    (queue ?? []).map(async (row: any) => {
      const bucket = row.assets?.type === "material" ? "materials" : "models";
      const { data: signed } = row.file_path
        ? await supabase.storage.from(bucket).createSignedUrl(row.file_path, 600)
        : { data: null };
      const { data: thumb } = row.thumbnail_path
        ? await supabase.storage.from("materials").createSignedUrl(row.thumbnail_path, 600)
        : { data: null };
      return { ...row, file_url: signed?.signedUrl ?? null, thumb_url: thumb?.signedUrl ?? null };
    }),
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Review queue"
          subtitle="FR-M2 · checklist: file opens, correct scale, sensible name/category, no unrelated branding, size within limit."
        />
        {rows.length ? (
          <Table head={["Asset", "Vendor", "Metadata", "File", "Decision"]}>
            {rows.map((row: any) => (
              <tr key={row.id} className="align-top hover:bg-slate-50/60">
                <Td>
                  <div className="flex items-start gap-3">
                    {row.thumb_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.thumb_url}
                        alt=""
                        className="h-14 w-14 rounded-lg border border-slate-200 object-cover"
                      />
                    ) : (
                      <div className="h-14 w-14 rounded-lg border border-dashed border-slate-300" />
                    )}
                    <div>
                      <div className="font-medium text-slate-900">{row.assets?.name}</div>
                      <div className="mt-1 flex gap-1.5">
                        <Badge tone={row.assets?.type === "material" ? "blue" : "gray"}>
                          {row.assets?.type}
                        </Badge>
                        <Badge>v{row.version}</Badge>
                      </div>
                    </div>
                  </div>
                </Td>
                <Td>
                  <div className="text-sm">{row.assets?.vendors?.brand_name}</div>
                  <div className="text-xs text-slate-500">{row.assets?.vendors?.name}</div>
                </Td>
                <Td>
                  <div className="text-xs">Category: {row.assets?.categories?.name ?? "—"}</div>
                  <div className="text-xs">SKU: {row.assets?.sku ?? "—"}</div>
                  {row.assets?.tile_w_cm ? (
                    <div className="text-xs">
                      Tile: {row.assets.tile_w_cm}×{row.assets.tile_h_cm} cm
                    </div>
                  ) : null}
                  {row.assets?.tags?.length ? (
                    <div className="text-xs text-slate-500">{row.assets.tags.join(", ")}</div>
                  ) : null}
                </Td>
                <Td>
                  <div className="text-xs">{formatBytes(row.file_size)}</div>
                  {row.file_url ? (
                    <a
                      href={row.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-brand-600"
                    >
                      Download ↓
                    </a>
                  ) : null}
                  <div className="mt-1 text-xs text-slate-400">{formatDateTime(row.created_at)}</div>
                </Td>
                <Td>
                  <div className="space-y-2">
                    <form action={reviewAsset} className="flex items-center gap-2">
                      <input type="hidden" name="version_id" value={row.id} />
                      <input type="hidden" name="decision" value="approved" />
                      <SubmitButton>Approve</SubmitButton>
                    </form>
                    <form action={reviewAsset} className="space-y-1">
                      <input type="hidden" name="version_id" value={row.id} />
                      <input type="hidden" name="decision" value="rejected" />
                      <input
                        name="note"
                        required
                        placeholder="Reason (required)"
                        className="w-40 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                      />
                      <SubmitButton variant="danger">Reject</SubmitButton>
                    </form>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>Nothing waiting for review.</Empty>
        )}
      </Card>
    </div>
  );
}