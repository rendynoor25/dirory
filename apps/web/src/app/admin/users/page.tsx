import { Badge, Card, CardHeader, Empty, Kpi, Table, Td } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Users" };

/**
 * Users — brief §4.6 (FR-M9) plus the occupation mix.
 *
 * `profiles` carries a mirrored `email` because `auth.users` is not reachable
 * through PostgREST with the anon key, and an `occupation` the user answers once
 * after their first sign-in.
 *
 * RLS restricts this to admins, so a non-admin sees nothing even if they reach
 * the URL.
 */
const OCCUPATION_LABELS: Record<string, string> = {
  architect: "Architect",
  designer: "Designer",
  student: "Student",
  other: "Other",
  unknown: "Not answered",
};

const OCCUPATION_TONES: Record<string, "blue" | "green" | "amber" | "purple" | "gray"> = {
  architect: "blue",
  designer: "green",
  student: "amber",
  other: "purple",
  unknown: "gray",
};

const ROLE_LABELS: Record<string, string> = {
  architect: "Architect",
  vendor_owner: "Vendor owner",
  vendor_staff: "Vendor staff",
  admin: "Admin",
};

export default async function AdminUsers() {
  const { supabase } = await requireAdmin();

  const [{ data: profiles }, { data: installs }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, role, occupation, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("installs")
      .select("profile_id, last_seen")
      .not("profile_id", "is", null)
      .order("last_seen", { ascending: false })
      .limit(2000),
  ]);

  const rows = profiles ?? [];

  // Latest "last seen" per profile, from the plugin installs.
  const lastSeen = new Map<string, string>();
  for (const install of installs ?? []) {
    if (install.profile_id && !lastSeen.has(install.profile_id)) {
      lastSeen.set(install.profile_id, install.last_seen);
    }
  }

  // Counts by occupation. Recomputed here rather than trusting a stored counter.
  const counts = new Map<string, number>();
  for (const p of rows) {
    const key = p.occupation ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const ordered = ["architect", "designer", "student", "other", "unknown"];
  const answered = rows.filter((p) => p.occupation).length;

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const newUsers = rows.filter((p) => new Date(p.created_at).getTime() >= thirtyDaysAgo).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Total users" value={rows.length} hint={`${newUsers} joined in the last 30 days`} />
        <Kpi label="Architects" value={counts.get("architect") ?? 0} />
        <Kpi label="Designers" value={counts.get("designer") ?? 0} />
        <Kpi
          label="Students"
          value={counts.get("student") ?? 0}
          hint={`${answered} of ${rows.length} answered`}
        />
      </div>

      <Card>
        <CardHeader title="Who uses Dirory" subtitle="Self-reported, asked once after the first sign-in" />
        <div className="flex flex-wrap gap-2 px-5 py-4">
          {ordered.map((key) => (
            <span key={key} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm">
              <Badge tone={OCCUPATION_TONES[key] ?? "gray"}>{OCCUPATION_LABELS[key] ?? key}</Badge>
              <span className="font-semibold text-slate-800">{counts.get(key) ?? 0}</span>
            </span>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Accounts" subtitle={`${rows.length} account${rows.length === 1 ? "" : "s"}`} />
        {rows.length ? (
          <Table head={["Name", "Email", "Occupation", "Role", "Joined", "Last seen"]}>
            {rows.map((p) => (
              <tr key={p.id}>
                <Td className="font-medium text-slate-900">{p.full_name || "—"}</Td>
                <Td>{p.email ?? "—"}</Td>
                <Td>
                  <Badge tone={OCCUPATION_TONES[p.occupation ?? "unknown"] ?? "gray"}>
                    {OCCUPATION_LABELS[p.occupation ?? "unknown"] ?? "Not answered"}
                  </Badge>
                </Td>
                <Td>{ROLE_LABELS[p.role] ?? p.role}</Td>
                <Td>{formatDateTime(p.created_at)}</Td>
                <Td>
                  {lastSeen.get(p.id) ? formatDateTime(lastSeen.get(p.id)!) : <span className="text-slate-400">—</span>}
                </Td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>No accounts yet.</Empty>
        )}
      </Card>
    </div>
  );
}
