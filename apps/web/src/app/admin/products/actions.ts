"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";

/**
 * Server actions for the admin Products section (FR-M12 / FR-V3).
 *
 * The file itself is uploaded straight from the browser to the private
 * `models` / `materials` bucket (see `ProductForm.tsx`), because a `.skp` can be
 * tens of megabytes and must not be buffered through a server action. These
 * actions only resolve the brand and category, then write the database rows.
 *
 * Every action re-checks `requireAdmin()`; the storage policy independently
 * allows an admin to write under any vendor prefix.
 */

const BrandSchema = z.object({
  brand_name: z.string().trim().min(1).max(80),
});

/** Find or create an approved vendor for a brand typed into the upload form. */
export async function createBrandForUpload(input: { brand_name: string }) {
  const { supabase } = await requireAdmin();
  const parsed = BrandSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Enter a brand name." };

  const brand = parsed.data.brand_name;
  const { data: existing } = await supabase
    .from("vendors")
    .select("id")
    .eq("brand_name", brand)
    .maybeSingle();
  if (existing) return { ok: true as const, id: existing.id as string };

  const { data, error } = await supabase
    .from("vendors")
    .insert({
      name: brand,
      brand_name: brand,
      is_platform: false,
      status: "approved",
      approved_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false as const, error: error?.message ?? "Could not create the brand." };
  }

  revalidatePath("/admin/vendors");
  return { ok: true as const, id: data.id as string };
}

const CategorySchema = z.object({
  type: z.enum(["model", "material"]),
  name: z.string().trim().min(1).max(80),
});

/** Find or create a top-level category for the chosen type. */
export async function createCategoryForUpload(input: {
  type: "model" | "material";
  name: string;
}) {
  const { supabase } = await requireAdmin();
  const parsed = CategorySchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Enter a category name." };

  const { data: existing } = await supabase
    .from("categories")
    .select("id")
    .eq("type", parsed.data.type)
    .eq("name", parsed.data.name)
    .is("parent_id", null)
    .maybeSingle();
  if (existing) return { ok: true as const, id: existing.id as string };

  const { data, error } = await supabase
    .from("categories")
    .insert({ type: parsed.data.type, name: parsed.data.name })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false as const, error: error?.message ?? "Could not create the category." };
  }

  revalidatePath("/admin/taxonomy");
  return { ok: true as const, id: data.id as string };
}

const ProductSchema = z.object({
  vendor_id: z.string().uuid(),
  type: z.enum(["model", "material"]),
  name: z.string().trim().min(1).max(200),
  category_id: z.string().uuid().nullable(),
  tags: z.array(z.string().trim().min(1)).max(40),
  sku: z.string().trim().max(80).nullable(),
  product_url: z.string().trim().max(400).nullable(),
  dimensions: z.string().trim().max(120).nullable(),
  tile_w_cm: z.number().positive().nullable(),
  tile_h_cm: z.number().positive().nullable(),
  file_path: z.string().min(1).max(400),
  thumbnail_path: z.string().min(1).max(400).nullable(),
  file_size: z.number().int().nonnegative().nullable(),
  su_version: z.string().trim().max(12).nullable(),
  su_version_raw: z.string().trim().max(40).nullable(),
  publish: z.boolean(),
});

export type RegisterProductInput = z.input<typeof ProductSchema>;

/**
 * Register an uploaded file as an asset + first version.
 *
 * `publish` true (the default) makes it live immediately — an admin upload is
 * trusted, so it skips the review queue, exactly like a Dirory sample (FR-M12).
 * `publish` false leaves it in `pending_review` for the Review queue.
 */
export async function registerProduct(input: RegisterProductInput) {
  const { supabase } = await requireAdmin();
  const parsed = ProductSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const d = parsed.data;

  // Accept "example.com" as well as a full URL: the plugin opens this with the
  // system browser, which needs a scheme.
  const productUrl = d.product_url
    ? /^https?:\/\//i.test(d.product_url)
      ? d.product_url
      : `https://${d.product_url}`
    : null;

  // Both storage paths must live under the chosen vendor, so a bad path cannot
  // attach a product to the wrong brand's file. The form always builds them so.
  const prefix = `${d.vendor_id}/`;
  if (!d.file_path.startsWith(prefix)) {
    return { ok: false as const, error: "The uploaded file does not belong to that brand." };
  }
  if (d.thumbnail_path && !d.thumbnail_path.startsWith(prefix)) {
    return { ok: false as const, error: "The preview image does not belong to that brand." };
  }

  const { data: asset, error: assetError } = await supabase
    .from("assets")
    .insert({
      vendor_id: d.vendor_id,
      type: d.type,
      name: d.name,
      category_id: d.category_id,
      tags: d.tags,
      sku: d.sku,
      product_url: productUrl,
      dimensions: d.type === "model" ? d.dimensions : null,
      tile_w_cm: d.type === "material" ? d.tile_w_cm : null,
      tile_h_cm: d.type === "material" ? d.tile_h_cm : null,
      status: d.publish ? "approved" : "pending_review",
    })
    .select("id")
    .single();
  if (assetError || !asset) {
    return { ok: false as const, error: assetError?.message ?? "Could not create the product." };
  }

  const { data: version, error: versionError } = await supabase
    .from("asset_versions")
    .insert({
      asset_id: asset.id,
      version: 1,
      file_path: d.file_path,
      thumbnail_path: d.thumbnail_path,
      file_size: d.file_size,
      review_status: d.publish ? "approved" : "pending",
      su_version: d.type === "model" ? d.su_version : null,
      su_version_raw: d.type === "model" ? d.su_version_raw : null,
    })
    .select("id")
    .single();
  if (versionError || !version) {
    // Do not leave a versionless asset behind.
    await supabase.from("assets").delete().eq("id", asset.id);
    return { ok: false as const, error: versionError?.message ?? "Could not save the file record." };
  }

  if (d.publish) {
    await supabase.from("assets").update({ current_version_id: version.id }).eq("id", asset.id);
  }

  await supabase.rpc("write_audit", {
    p_action: "asset.created",
    p_entity: "assets",
    p_entity_id: asset.id,
    p_meta: {
      type: d.type,
      name: d.name,
      vendor_id: d.vendor_id,
      published: d.publish,
      su_version: d.su_version,
    },
  });

  revalidatePath("/admin/products");
  revalidatePath("/admin/samples");
  revalidatePath("/admin/reviews");
  return { ok: true as const, id: asset.id as string };
}
