import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  role: "architect" | "vendor_owner" | "vendor_staff" | "admin";
  full_name: string | null;
  phone: string | null;
  firm: string | null;
  verified: boolean;
};

export type VendorMembership = {
  vendor_id: string;
  role: "owner" | "editor";
  vendor: {
    id: string;
    name: string;
    brand_name: string;
    status: "pending" | "approved" | "suspended";
    is_platform: boolean;
    logo_url: string | null;
  };
};

export async function getSession() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null, profile: null, memberships: [] as VendorMembership[] };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, full_name, phone, firm, verified")
    .eq("id", user.id)
    .maybeSingle();

  const { data: memberships } = await supabase
    .from("vendor_members")
    .select("vendor_id, role, vendors(id, name, brand_name, status, is_platform, logo_url)")
    .eq("profile_id", user.id);

  return {
    supabase,
    user,
    profile: (profile as Profile | null) ?? null,
    memberships: (memberships ?? []).map((m: any) => ({
      vendor_id: m.vendor_id,
      role: m.role,
      vendor: m.vendors,
    })) as VendorMembership[],
  };
}

export async function requireAdmin() {
  const session = await getSession();
  if (!session.user) redirect("/login?next=/admin");
  if (session.profile?.role !== "admin") redirect("/vendor");
  return session;
}

export async function requireVendor() {
  const session = await getSession();
  if (!session.user) redirect("/login?next=/vendor");
  return session;
}