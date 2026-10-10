import { Shell } from "@/components/Shell";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile } = await requireAdmin();

  const [
    { count: pendingVendors },
    { count: pendingAssets },
    { count: newMissing },
    { count: newQuotes },
    { count: serviceQueue },
  ] = await Promise.all([
    supabase.from("vendors").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("asset_versions").select("id", { count: "exact", head: true }).eq("review_status", "pending"),
    supabase.from("missing_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("quote_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
    // Jobs needing a quote — the first thing the vendor waits on.
    supabase.from("service_requests").select("id", { count: "exact", head: true }).eq("status", "requested"),
  ]);

  return (
    <Shell
      title="Dirory Admin"
      subtitle={profile?.full_name ?? "Back-office"}
      topbarTitle="Admin back-office"
      items={[
        { href: "/admin", label: "Overview" },
        { href: "/admin/analytics", label: "Analytics" },
        { href: "/admin/vendors", label: "Vendors", badge: pendingVendors ?? undefined },
        { href: "/admin/reviews", label: "Review queue", badge: pendingAssets ?? undefined },
        { href: "/admin/products", label: "Products" },
        { href: "/admin/samples", label: "Dirory samples" },
        { href: "/admin/taxonomy", label: "Taxonomy" },
        { href: "/admin/plans", label: "Plans & pricing" },
        { href: "/admin/payments", label: "Payments" },
        { href: "/admin/services", label: "Modelling", badge: serviceQueue ?? undefined },
        { href: "/admin/missing-requests", label: "Missing requests", badge: newMissing ?? undefined },
        { href: "/admin/usage", label: "Usage explorer" },
        { href: "/admin/quotes", label: "Quotes", badge: newQuotes ?? undefined },
        { href: "/admin/users", label: "Users" },
      ]}
      footer="Dirory admin · PRD v1.2"
    >
      {children}
    </Shell>
  );
}
