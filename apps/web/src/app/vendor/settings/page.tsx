import { Card, CardHeader } from "@/components/ui";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function VendorSettings() {
  const { memberships, user, profile } = await getSession();
  const membership = memberships[0];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Account" subtitle="Your sign-in identity (FR-V1)" />
        <dl className="grid gap-4 p-5 sm:grid-cols-2 text-sm">
          <Row label="Email" value={user?.email ?? "—"} />
          <Row label="Name" value={profile?.full_name ?? "—"} />
          <Row label="Phone" value={profile?.phone ?? "—"} />
          <Row label="Firm" value={profile?.firm ?? "—"} />
        </dl>
      </Card>

      {membership ? (
        <Card>
          <CardHeader title="Brand" subtitle="Contact the Dirory team to change brand details or your NPWP." />
          <dl className="grid gap-4 p-5 sm:grid-cols-2 text-sm">
            <Row label="Brand name" value={membership.vendor.brand_name} />
            <Row label="Company" value={membership.vendor.name} />
            <Row label="Status" value={membership.vendor.status} />
            <Row label="Your role" value={membership.role} />
          </dl>
        </Card>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-900">{value}</dd>
    </div>
  );
}