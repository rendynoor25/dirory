import { Sidebar, Topbar } from "@/components/Sidebar";
import { getSession, requireVendor } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  await requireVendor();
  const { supabase, user, memberships } = await getSession();
  const membership = memberships[0];

  // No vendor yet → onboarding. The page itself renders the registration form.
  if (!membership) {
    return (
      <div className="flex min-h-screen flex-col">
        <Topbar>Vendor onboarding</Topbar>
        <main className="mx-auto w-full max-w-3xl flex-1 p-8">{children}</main>
      </div>
    );
  }

  const { count: newLeads } = await supabase
    .from("quote_requests")
    .select("id", { count: "exact", head: true })
    .eq("vendor_id", membership.vendor_id)
    .eq("status", "new");

  return (
    <div className="flex min-h-screen">
      <Sidebar
        title={membership.vendor.brand_name}
        subtitle={
          membership.vendor.status === "approved"
            ? "Vendor portal"
            : `Status: ${membership.vendor.status}`
        }
        items={[
          { href: "/vendor", label: "Dashboard" },
          { href: "/vendor/assets", label: "Products" },
          { href: "/vendor/leads", label: "Leads inbox", badge: newLeads ?? undefined },
          { href: "/vendor/subscription", label: "Subscription" },
          { href: "/vendor/team", label: "Team" },
        ]}
        footer={user?.email ?? ""}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar>{membership.vendor.brand_name}</Topbar>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}