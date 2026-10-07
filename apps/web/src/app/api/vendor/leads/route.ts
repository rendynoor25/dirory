import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** FR-V5 — export the leads inbox. Only consented fields are included. */
function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export async function GET() {
  const { supabase, memberships } = await getSession();
  const membership = memberships[0];
  if (!membership) {
    return new Response("Not a vendor", { status: 403 });
  }

  const { data } = await supabase
    .from("quote_requests")
    .select("created_at, project_name, city, timeline, note, phone_shared, items, status")
    .eq("vendor_id", membership.vendor_id)
    .order("created_at", { ascending: false });

  const rows: unknown[][] = [
    ["Received", "Project", "City", "Timeline", "Status", "Items", "Note"],
  ];
  for (const l of (data ?? []) as any[]) {
    const items = (l.items ?? [])
      .map((i: any) => {
        const qty = i.qty ? ` x${i.qty}` : i.area_m2 ? ` ${i.area_m2}m2` : "";
        return `${i.name ?? ""}${qty}`;
      })
      .join("; ");
    rows.push([l.created_at, l.project_name, l.city, l.timeline, l.status, items, l.note]);
  }

  return new Response(csv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="dirory-leads.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
