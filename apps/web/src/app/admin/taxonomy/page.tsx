import { Badge, Card, CardHeader, SubmitButton, Table, Td } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createCategory } from "../actions";

export default async function AdminTaxonomy() {
  const { supabase } = await requireAdmin();

  const { data: categories } = await supabase
    .from("categories")
    .select("id, type, name, sort, parent_id")
    .order("type")
    .order("sort");

  const models = (categories ?? []).filter((c) => c.type === "model");
  const materials = (categories ?? []).filter((c) => c.type === "material");
  const byId = new Map((categories ?? []).map((c) => [c.id, c]));

  const label = (c: any) => (c.parent_id ? `${byId.get(c.parent_id)?.name ?? "?"} › ${c.name}` : c.name);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {(["model", "material"] as const).map((type) => {
        const rows = type === "model" ? models : materials;
        return (
          <Card key={type}>
            <CardHeader
              title={type === "model" ? "Model categories" : "Material categories"}
              subtitle="FR-M3 · two separate trees"
            />
            {rows.length ? (
              <Table head={["Name", "Parent", "Sort"]}>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <Td className="font-medium text-slate-900">{c.name}</Td>
                    <Td className="text-xs text-slate-500">
                      {c.parent_id ? byId.get(c.parent_id)?.name ?? "—" : "—"}
                    </Td>
                    <Td>{c.sort}</Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <div className="px-5 py-4 text-sm text-slate-500">No categories yet.</div>
            )}

            <div className="border-t border-slate-100 px-5 py-4">
              <form action={createCategory} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="type" value={type} />
                <div className="flex-1">
                  <label className="text-xs font-medium text-slate-600">New {type} category</label>
                  <input
                    name="name"
                    required
                    placeholder="e.g. Sanitary"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Parent</label>
                  <select
                    name="parent_id"
                    className="mt-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">— none —</option>
                    {rows.map((c) => (
                      <option key={c.id} value={c.id}>
                        {label(c)}
                      </option>
                    ))}
                  </select>
                </div>
                <SubmitButton>Add</SubmitButton>
              </form>
            </div>
          </Card>
        );
      })}
    </div>
  );
}