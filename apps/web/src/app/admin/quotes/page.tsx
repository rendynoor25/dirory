import { Badge, Card, CardHeader, Empty, Table, Td, statusTone } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export default async function AdminQuotes() {
  const { supabase } = await requireAdmin();

  const { data: quotes } = await supabase
    .from("quote_requests")
    .select(
      "id, project_name, city, timeline, note, phone_shared, items, status, created_at, " +
        "vendors(brand_name), profiles(full_name, firm)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Quote requests"
          subtitle="One row per vendor. Project name and architect identity appear because the architect consented to share them."
        />
        {quotes?.length ? (
          <Table head={["Vendor", "Architect", "Project", "Items", "Status", "Received"]}>
            {quotes.map((q: any) => (
              <tr key={q.id}>
                <Td className="font-medium text-slate-900">{q.vendors?.brand_name ?? "—"}</Td>
                <Td>
                  {q.profiles?.full_name ?? "—"}
                  <div className="text-xs text-slate-500">{q.profiles?.firm ?? ""}</div>
                </Td>
                <Td>
                  {q.project_name ?? "—"}
                  <div className="text-xs text-slate-500">{q.city ?? ""}</div>
                </Td>
                <Td className="text-xs">
                  {(q.items ?? []).slice(0, 3).map((i: any, idx: number) => (
                    <div key={idx}>
                      {i.name} {i.qty ? `×${i.qty}` : i.area_m2 ? `${i.area_m2} m²` : ""}
                    </div>
                  ))}
                  {(q.items ?? []).length > 3 ? (
                    <div className="text-slate-400">+{(q.items ?? []).length - 3} more</div>
                  ) : null}
                </Td>
                <Td>
                  <Badge tone={statusTone(q.status)}>{q.status}</Badge>
                </Td>
                <Td className="text-xs text-slate-500">{formatDateTime(q.created_at)}</Td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>No quote requests yet.</Empty>
        )}
      </Card>
    </div>
  );
}