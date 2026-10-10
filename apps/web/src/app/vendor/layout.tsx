import { BareTopbar, Shell } from "@/components/Shell";
import { getSession, requireVendor } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  await requireVendor();
  const { supabase, user, memberships } = await getSession();
  const membership = memberships[0];

  // No vendor yet → onboarding. The page itself renders the registration form.
  if (!membership) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <BareTopbar>Vendor onboarding</BareTopbar>
        <main className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-8">{children}</main>
      </div>
    );
  }

  const { count: newLeads } = await supabase
    .from("quote_requests")
    .select("id", { count: "exact", head: true })
    .eq("vendor_id", membership.vendor_id)
    .eq("status", "new");

  return (
    <Shell
      title={membership.vendor.brand_name}
      subtitle={
        membership.vendor.status === "approved"
          ? "Vendor portal"
          : `Status: ${membership.vendor.status}`
      }
      topbarTitle={membership.vendor.brand_name}
      items={[
        { href: "/vendor", label: "Dashboard" },
        { href: "/vendor/assets", label: "Products" },
        { href: "/vendor/leads", label: "Leads inbox", badge: newLeads ?? undefined },
        { href: "/vendor/services", label: "Modelling" },
        { href: "/vendor/subscription", label: "Subscription" },
        { href: "/vendor/team", label: "Team" },
      ]}
      footer={user?.email ?? ""}
    >
      {children}
    </Shell>
  );
}
