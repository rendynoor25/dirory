"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";

/** FR-V1 — vendor registration. Creates a `pending` vendor + owner membership. */
const RegisterSchema = z.object({
  name: z.string().min(2),
  brand_name: z.string().min(1),
  email: z.string().email(),
  whatsapp: z.string().min(6),
  website: z.string().optional(),
  npwp: z.string().optional(),
});

export async function registerVendor(formData: FormData) {
  const { supabase, user } = await getSession();
  if (!user) return;

  const parsed = RegisterSchema.safeParse({
    name: formData.get("name"),
    brand_name: formData.get("brand_name"),
    email: formData.get("email"),
    whatsapp: formData.get("whatsapp"),
    website: formData.get("website") ?? "",
    npwp: formData.get("npwp") ?? "",
  });
  if (!parsed.success) return;

  const { data: vendor, error } = await supabase
    .from("vendors")
    .insert({ ...parsed.data, status: "pending" })
    .select("id")
    .single();
  if (error || !vendor) return;

  // The bootstrap policy lets the creator claim ownership of their pending row.
  await supabase.from("vendor_members").insert({
    vendor_id: vendor.id,
    profile_id: user.id,
    role: "owner",
  });

  revalidatePath("/vendor");
}

const AssetSchema = z.object({
  type: z.enum(["model", "material"]),
  name: z.string().min(1),
  category_id: z.string().uuid().optional().or(z.literal("")),
  tags: z.string().optional(),
  sku: z.string().optional(),
  product_url: z.string().optional(),
  tile_w_cm: z.coerce.number().optional(),
  tile_h_cm: z.coerce.number().optional(),
  file_path: z.string().min(1),
  file_size: z.coerce.number().optional(),
});

/** FR-V3 — create an asset and submit its first version for review. */
export async function createAsset(formData: FormData) {
  const { supabase, memberships } = await getSession();
  const vendor = memberships[0];
  if (!vendor) return;

  const parsed = AssetSchema.safeParse({
    type: formData.get("type"),
    name: formData.get("name"),
    category_id: formData.get("category_id") ?? "",
    tags: formData.get("tags") ?? "",
    sku: formData.get("sku") ?? "",
    product_url: formData.get("product_url") ?? "",
    tile_w_cm: formData.get("tile_w_cm") || undefined,
    tile_h_cm: formData.get("tile_h_cm") || undefined,
    file_path: formData.get("file_path"),
    file_size: formData.get("file_size") || undefined,
  });
  if (!parsed.success) return;

  const tags = (parsed.data.tags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const { data: asset, error } = await supabase
    .from("assets")
    .insert({
      vendor_id: vendor.vendor_id,
      type: parsed.data.type,
      name: parsed.data.name.trim(),
      category_id: parsed.data.category_id || null,
      tags,
      sku: parsed.data.sku || null,
      product_url: parsed.data.product_url || null,
      tile_w_cm: parsed.data.tile_w_cm ?? null,
      tile_h_cm: parsed.data.tile_h_cm ?? null,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !asset) return;

  await supabase.rpc("submit_asset_version", {
    p_asset: asset.id,
    p_file_path: parsed.data.file_path,
    p_thumbnail_path: null,
    p_file_size: parsed.data.file_size ?? null,
  });

  revalidatePath("/vendor/assets");
}

/** FR-V3 — bump an approved asset to a new version that goes through review. */
export async function submitNewVersion(formData: FormData) {
  const { supabase } = await getSession();
  const assetId = String(formData.get("asset_id") ?? "");
  const filePath = String(formData.get("file_path") ?? "");
  if (!assetId || !filePath) return;

  await supabase.rpc("submit_asset_version", {
    p_asset: assetId,
    p_file_path: filePath,
    p_thumbnail_path: null,
    p_file_size: Number(formData.get("file_size") ?? 0) || null,
  });

  revalidatePath("/vendor/assets");
}

/** FR-V3 — archive an asset (never a hard delete). */
export async function archiveAsset(formData: FormData) {
  const { supabase } = await getSession();
  const assetId = String(formData.get("asset_id") ?? "");
  if (!assetId) return;

  await supabase.from("assets").update({ status: "archived" }).eq("id", assetId);
  revalidatePath("/vendor/assets");
}

/** FR-V5 — move a lead through the pipeline. */
export async function updateLeadStatus(formData: FormData) {
  const { supabase } = await getSession();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["new", "contacted", "won", "lost"].includes(status)) return;

  await supabase.from("quote_requests").update({ status }).eq("id", id);
  revalidatePath("/vendor/leads");
}
