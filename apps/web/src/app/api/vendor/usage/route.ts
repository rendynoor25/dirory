import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** FR-V4 — export the per-product table for the selected range. */
function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export async function GET(request: Request) {
  const { supabase, memberships } = await getSession();
  const membership = memberships[0];
  if (!membership) {
    return new Response("Not a vendor", { status: 403 });
  }

  const url = new URL(request.url);
  const to = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
  const fromDefault = new Date();
  fromDefault.setDate(fromDefault.getDate() - 30);
  const from = url.searchParams.get("from") ?? fromDefault.toISOString().slice(0, 10);

  const { data } = await supabase.rpc("vendor_usage_by_asset", {
    p_vendor: membership.vendor_id,
    p_from: from,
    p_to: to,
  });

  const rows: unknown[][] = [["Product", "Type", "Projects", "Units", "Area m2", "Quote requests"]];
  for (const r of (data ?? []) as {
    name: string;
    type: string;
    projects: number;
    units: number;
    area_m2: number | null;
    quotes: number;
    suppressed: boolean;
  }[]) {
    // Fewer than 5 architects: the figures are withheld (UU PDP A6, migration 0035).
    rows.push(
      r.suppressed
        ? [r.name, r.type, "withheld (<5 architects)", "", "", r.quotes]
        : [r.name, r.type, r.projects, r.units, Number(r.area_m2 ?? 0).toFixed(2), r.quotes],
    );
  }

  return new Response(csv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dirory-usage-${from}_${to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
