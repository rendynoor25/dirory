"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { addPeriod } from "@/lib/billing";
import { z } from "zod";

const StatusSchema = z.object({
  vendor_id: z.string().uuid(),
  status: z.enum(["approved", "rejected", "suspended", "pending"]),
});

/**
 * FR-M1 — approve / reject / suspend a vendor. The RPC also writes audit_log.
 * `rejected` maps onto the enum by keeping the vendor pending but recorded in
 * the audit trail; explicitly rejected vendors are suspended so their assets
 * stop being visible.
 */
export async function setVendorStatus(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = StatusSchema.safeParse({
    vendor_id: formData.get("vendor_id"),
    status: formData.get("status"),
  });
  if (!parsed.success) return;

  const mapped =
    parsed.data.status === "rejected" ? "suspended" : parsed.data.status;

  await supabase.rpc("set_vendor_status", {
    p_vendor: parsed.data.vendor_id,
    p_status: mapped,
  });

  revalidatePath("/admin/vendors");
  revalidatePath("/admin");
}

const ReviewSchema = z.object({
  version_id: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().optional(),
});

/** FR-M2 — approve or reject an asset version with a mandatory reason on reject. */
export async function reviewAsset(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = ReviewSchema.safeParse({
    version_id: formData.get("version_id"),
    decision: formData.get("decision"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return;

  await supabase.rpc("review_asset", {
    p_version: parsed.data.version_id,
    p_decision: parsed.data.decision,
    p_note: parsed.data.note || null,
  });

  revalidatePath("/admin/reviews");
  revalidatePath("/admin");
}

const CategorySchema = z.object({
  type: z.enum(["model", "material"]),
  name: z.string().min(1).max(80),
  parent_id: z.string().uuid().optional().or(z.literal("")),
});

/** FR-M3 — taxonomy. */
export async function createCategory(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = CategorySchema.safeParse({
    type: formData.get("type"),
    name: formData.get("name"),
    parent_id: formData.get("parent_id") ?? "",
  });
  if (!parsed.success) return;

  await supabase.from("categories").insert({
    type: parsed.data.type,
    name: parsed.data.name.trim(),
    parent_id: parsed.data.parent_id || null,
  });
  revalidatePath("/admin/taxonomy");
}

const PlanSchema = z.object({
  name: z.string().min(1).max(60),
  price_idr: z.coerce.number().int().min(0),
  period: z.enum(["monthly", "yearly"]),
  max_assets: z.coerce.number().int().min(1),
});

/** FR-M4 — plans and pricing. */
export async function createPlan(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = PlanSchema.safeParse({
    name: formData.get("name"),
    price_idr: formData.get("price_idr"),
    period: formData.get("period"),
    max_assets: formData.get("max_assets"),
  });
  if (!parsed.success) return;

  await supabase.from("plans").insert(parsed.data);
  revalidatePath("/admin/plans");
}

/** FR-M5 — confirm a manual bank transfer. */
export async function markInvoicePaid(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const invoiceId = String(formData.get("invoice_id") ?? "");
  if (!invoiceId) return;

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, subscription_id, vendor_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) return;

  await supabase
    .from("invoices")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", invoiceId);

  // Extend the subscription by one billing period (FR-V6 / FR-M8). The length
  // comes from the plan (monthly or yearly), and it extends from the later of
  // now and the current period end — so renewing early keeps the paid days and
  // renewing late does not start the new period in the past.
  if (invoice.subscription_id) {
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id, current_period_end, plans(period)")
      .eq("id", invoice.subscription_id)
      .maybeSingle();
    if (sub) {
      const now = new Date();
      const currentEnd = sub.current_period_end ? new Date(sub.current_period_end) : null;
      const base = currentEnd && currentEnd > now ? currentEnd : now;
      const until = addPeriod(base, (sub as any).plans?.period);
      await supabase
        .from("subscriptions")
        .update({
          status: "active",
          current_period_start: now.toISOString(),
          current_period_end: until.toISOString(),
        })
        .eq("id", sub.id);
    }
  }

  await supabase.from("audit_log").insert({
    actor_id: user!.id,
    action: "invoice.marked_paid",
    entity: "invoices",
    entity_id: invoiceId,
  });

  revalidatePath("/admin/payments");
}

const MissingSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "planned", "added", "ignored"]),
  note: z.string().optional(),
});

/** FR-M10 — triage a missing request. */
export async function updateMissingRequest(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = MissingSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return;

  await supabase
    .from("missing_requests")
    .update({ status: parsed.data.status, note: parsed.data.note || null })
    .eq("id", parsed.data.id);

  revalidatePath("/admin/missing-requests");
}