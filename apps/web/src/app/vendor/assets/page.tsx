import { Badge, Card, CardHeader, Empty, SubmitButton, Table, Td, statusTone } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { archiveAsset, createAsset, submitNewVersion } from "../actions";
import { FileUpload } from "../_components/FileUpload";

export const dynamic = "force-dynamic";

export default async function VendorAssets() {
  const { supabase, memberships } = await getSession();
  const membership = memberships[0];
  if (!membership) {
    return <Empty>Register your brand first (Dashboard → Register your brand).</Empty>;
  }

  const vendorId = membership.vendor_id;

  const [{ data: assets }, { data: categories }] = await Promise.all([
    supabase
      .from("assets")
      .select(
        "id, name, type, status, tags, sku, product_url, tile_w_cm, tile_h_cm, created_at, updated_at, current_version_id, " +
          "categories(name), asset_versions(id, version, review_status, review_note, created_at)",
      )
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false }),
    supabase.from("categories").select("id, name, type").order("name"),
  ]);

  const modelCategories = (categories ?? []).filter((c) => c.type === "model");
  const materialCategories = (categories ?? []).filter((c) => c.type === "material");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Products"
          subtitle="FR-V3 · draft → pending_review → approved | rejected → archived. Editing an approved product creates a new version; the old one stays live until the new one is approved."
        />
        {assets?.length ? (
          <Table head={["Product", "Type", "Category", "Versions", "Status", ""]}>
            {assets.map((a: any) => {
              const versions = (a.asset_versions ?? []).sort((x: any, y: any) => y.version - x.version);
              const latest = versions[0];
              const rejected = versions.find((v: any) => v.review_status === "rejected" && v.review_note);
              return (
                <tr key={a.id} className="align-top hover:bg-slate-50/60">
                  <Td>
                    <div className="font-medium text-slate-900">{a.name}</div>
                    {a.sku ? <div className="text-xs text-slate-500">SKU {a.sku}</div> : null}
                    {a.tags?.length ? (
                      <div className="text-xs text-slate-400">{a.tags.join(", ")}</div>
                    ) : null}
                  </Td>
                  <Td>
                    <Badge tone={a.type === "material" ? "blue" : "gray"}>{a.type}</Badge>
                  </Td>
                  <Td className="text-xs">{a.categories?.name ?? "—"}</Td>
                  <Td className="text-xs">
                    v{latest?.version ?? "—"} · {latest?.review_status ?? "—"}
                  </Td>
                  <Td>
                    <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                    {rejected ? (
                      <div className="mt-1 max-w-[16rem] text-xs text-rose-700">
                        Rejected: {rejected.review_note}
                      </div>
                    ) : null}
                  </Td>
                  <Td>
                    <div className="space-y-2">
                      <form action={submitNewVersion} className="space-y-1">
                        <input type="hidden" name="asset_id" value={a.id} />
                        <FileUpload vendorId={vendorId} type={a.type} />
                        <SubmitButton variant="ghost">Upload new version</SubmitButton>
                      </form>
                      <form action={archiveAsset}>
                        <input type="hidden" name="asset_id" value={a.id} />
                        <SubmitButton variant="danger">Archive</SubmitButton>
                      </form>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty>No products yet. Add your first one below.</Empty>
        )}
      </Card>

      <Card>
        <CardHeader title="Add a product" subtitle="Single upload. Bulk upload with the filename as the default name is FR-V3." />
        <form action={createAsset} className="grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-slate-600">Type</label>
            <select
              name="type"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="model">Model (.skp)</option>
              <option value="material">Material (image)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Name</label>
            <input
              name="name"
              required
              placeholder="CW 630 PJ"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Category</label>
            <select
              name="category_id"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">— none —</option>
              <optgroup label="Models">
                {modelCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Materials">
                {materialCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Tags (comma separated)</label>
            <input
              name="tags"
              placeholder="closet, white, toto"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">SKU</label>
            <input
              name="sku"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Product URL</label>
            <input
              name="product_url"
              placeholder="https://…"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600">Tile W (cm)</label>
              <input
                name="tile_w_cm"
                type="number"
                step="0.1"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Tile H (cm)</label>
              <input
                name="tile_h_cm"
                type="number"
                step="0.1"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <FileUpload vendorId={vendorId} type="model" />
          </div>
          <div className="sm:col-span-2">
            <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Submit for review
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
