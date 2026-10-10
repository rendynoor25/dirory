"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
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

// ---------------------------------------------------------------------------
// Service requests — the modelling queue
// ---------------------------------------------------------------------------

const QuoteSchema = z.object({
  request_id: z.string().uuid(),
  quoted_idr: z.coerce.number().int().min(0).max(10_000_000_000),
  admin_note: z.string().trim().max(2000).optional(),
});

/** Set the price on a requested job. This is what turns `requested` into `quoted`. */
export async function quoteServiceRequest(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = QuoteSchema.safeParse({
    request_id: formData.get("request_id"),
    quoted_idr: formData.get("quoted_idr"),
    admin_note: formData.get("admin_note") ?? "",
  });
  if (!parsed.success) return;

  await supabase
    .from("service_requests")
    .update({
      quoted_idr: parsed.data.quoted_idr,
      admin_note: parsed.data.admin_note || null,
      status: "quoted",
    })
    .eq("id", parsed.data.request_id)
    .eq("status", "requested");

  revalidatePath("/admin/services");
}

const ServiceStatusSchema = z.object({
  request_id: z.string().uuid(),
  status: z.enum(["in_progress", "delivered", "cancelled"]),
  admin_note: z.string().trim().max(2000).optional(),
});

/** Advance a job: start modelling, mark it delivered, or cancel it. */
export async function setServiceStatus(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = ServiceStatusSchema.safeParse({
    request_id: formData.get("request_id"),
    status: formData.get("status"),
    admin_note: formData.get("admin_note") ?? "",
  });
  if (!parsed.success) return;

  const patch: Record<string, unknown> = {
    status: parsed.data.status,
    admin_note: parsed.data.admin_note || null,
  };
  if (parsed.data.status === "in_progress") patch.started_at = new Date().toISOString();
  if (parsed.data.status === "delivered") patch.delivered_at = new Date().toISOString();

  await supabase.from("service_requests").update(patch).eq("id", parsed.data.request_id);

  revalidatePath("/admin/services");
  revalidatePath("/vendor/services");
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

/** FR-M5 — confirm a manual bank transfer.
 *
 * Delegates to `mark_invoice_paid()`, the same function the Midtrans webhook
 * calls, so the two paths cannot drift: both mark the invoice paid and extend
 * the subscription by exactly one period, idempotently.
 */
export async function markInvoicePaid(formData: FormData) {
  const { supabase } = await requireAdmin();
  const invoiceId = String(formData.get("invoice_id") ?? "");
  if (!invoiceId) return;

  const { error } = await supabase.rpc("mark_invoice_paid", {
    p_invoice: invoiceId,
    p_gateway: "manual",
    p_reference: null,
  });
  if (error) {
    console.error("markInvoicePaid failed", error);
    return;
  }

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