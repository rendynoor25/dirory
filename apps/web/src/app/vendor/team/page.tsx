import { Badge, Card, CardHeader, Empty, Table, Td } from "@/components/ui";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** FR-V2 — one owner plus optional staff logins (owner / editor). */
export default async function VendorTeam() {
  const { supabase, memberships, user } = await getSession();
  const membership = memberships[0];
  if (!membership) return <Empty>Register your brand first.</Empty>;

  const { data: members } = await supabase
    .from("vendor_members")
    .select("profile_id, role, created_at, profiles(full_name, phone)")
    .eq("vendor_id", membership.vendor_id);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Team"
          subtitle="FR-V2 · you are the owner. Invite staff by having them sign in and then add their profile id below (email invites are wired to Resend in M9)."
        />
        {members?.length ? (
          <Table head={["Member", "Role", "Added", ""]}>
            {members.map((m: any) => (
              <tr key={m.profile_id}>
                <Td className="font-medium text-slate-900">
                  {m.profiles?.full_name ?? m.profile_id.slice(0, 8)}
                  {m.profile_id === user?.id ? (
                    <span className="ml-2 text-xs text-slate-400">(you)</span>
                  ) : null}
                </Td>
                <Td>
                  <Badge tone={m.role === "owner" ? "purple" : "gray"}>{m.role}</Badge>
                </Td>
                <Td className="text-xs text-slate-500">
                  {new Date(m.created_at).toLocaleDateString("id-ID")}
                </Td>
                <Td><span className="text-xs text-slate-400">owner-managed</span></Td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>No members.</Empty>
        )}
      </Card>
    </div>
  );
}
