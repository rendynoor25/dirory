import { Sidebar, Topbar } from "@/components/Sidebar";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile } = await requireAdmin();

  const [{ count: pendingVendors }, { count: pendingAssets }, { count: newMissing }, { count: newQuotes }] =
    await Promise.all([
      supabase.from("vendors").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("asset_versions").select("id", { count: "exact", head: true }).eq("review_status", "pending"),
      supabase.from("missing_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
      supabase.from("quote_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
    ]);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        title="Dirory Admin"
        subtitle={profile?.full_name ?? "Back-office"}
        items={[
          { href: "/admin", label: "Overview" },
          { href: "/admin/vendors", label: "Vendors", badge: pendingVendors ?? undefined },
          { href: "/admin/reviews", label: "Review queue", badge: pendingAssets ?? undefined },
          { href: "/admin/products", label: "Products" },
          { href: "/admin/samples", label: "Dirory samples" },
          { href: "/admin/taxonomy", label: "Taxonomy" },
          { href: "/admin/plans", label: "Plans & pricing" },
          { href: "/admin/payments", label: "Payments" },
          { href: "/admin/missing-requests", label: "Missing requests", badge: newMissing ?? undefined },
          { href: "/admin/usage", label: "Usage explorer" },
          { href: "/admin/quotes", label: "Quotes", badge: newQuotes ?? undefined },
          { href: "/admin/users", label: "Users" },
        ]}
        footer="Dirory v0.1 · PRD v1.1"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar>Admin back-office</Topbar>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}