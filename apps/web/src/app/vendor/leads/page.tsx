import { Badge, Card, CardHeader, Empty, SubmitButton, Table, Td, statusTone } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { updateLeadStatus } from "../actions";

export const dynamic = "force-dynamic";

/** FR-V5 — leads inbox. A vendor only sees what the architect consented to share. */
export default async function VendorLeads() {
  const { supabase, memberships } = await getSession();
  const membership = memberships[0];
  if (!membership) return <Empty>Register your brand first.</Empty>;

  const { data: leads } = await supabase
    .from("quote_requests")
    .select("id, project_name, city, timeline, note, phone_shared, items, status, created_at")
    .eq("vendor_id", membership.vendor_id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Leads inbox"
          subtitle="FR-V5 · quote requests containing only your products. Status: new → contacted → won / lost."
        />
        {leads?.length ? (
          <Table head={["Project", "City", "Items", "Note", "Received", "Status"]}>
            {leads.map((l: any) => (
              <tr key={l.id} className="align-top hover:bg-slate-50/60">
                <Td>
                  <div className="font-medium text-slate-900">{l.project_name ?? "—"}</div>
                  {l.timeline ? (
                    <div className="text-xs text-slate-500">Timeline: {l.timeline}</div>
                  ) : null}
                </Td>
                <Td className="text-xs">{l.city ?? "—"}</Td>
                <Td className="text-xs">
                  {(l.items ?? []).map((i: any, idx: number) => (
                    <div key={idx}>
                      {i.name}{" "}
                      <span className="text-slate-400">
                        {i.qty ? `×${i.qty}` : i.area_m2 ? `${i.area_m2} m²` : ""}
                      </span>
                    </div>
                  ))}
                </Td>
                <Td className="max-w-[14rem] text-xs">{l.note ?? "—"}</Td>
                <Td className="text-xs text-slate-500">{formatDateTime(l.created_at)}</Td>
                <Td>
                  <div className="space-y-2">
                    <Badge tone={statusTone(l.status)}>{l.status}</Badge>
                    <form action={updateLeadStatus} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={l.id} />
                      <select
                        name="status"
                        defaultValue={l.status}
                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                      >
                        <option value="new">new</option>
                        <option value="contacted">contacted</option>
                        <option value="won">won</option>
                        <option value="lost">lost</option>
                      </select>
                      <SubmitButton variant="ghost">Save</SubmitButton>
                    </form>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>No leads yet. They arrive when an architect sends a quote request for your brand.</Empty>
        )}
      </Card>
    </div>
  );
}