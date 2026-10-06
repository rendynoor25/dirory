import Link from "next/link";
import { Card, CardHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { ProductForm, type CategoryOption, type VendorOption } from "../ProductForm";

export const dynamic = "force-dynamic";

/**
 * FR-M12 / FR-V3 — upload a product file and describe it.
 *
 * The form mirrors what the plugin's Inspector shows: name, brand, category,
 * tags, SKU, product URL, dimensions (models) or tile size (materials). It also
 * reads the SketchUp version out of the `.skp` so a file newer than the
 * architect's SketchUp can be flagged.
 *
 * `?brand=<uuid>` preselects a brand — the Dirory samples screen links here with
 * the platform brand already chosen.
 */
export default async function NewProduct({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { supabase } = await requireAdmin();
  const { brand } = await searchParams;

  const [{ data: vendors }, { data: categories }] = await Promise.all([
    supabase
      .from("vendors")
      .select("id, brand_name, is_platform")
      .or("is_platform.eq.true,status.eq.approved")
      .order("is_platform", { ascending: false })
      .order("brand_name"),
    supabase.from("categories").select("id, name, type").order("name"),
  ]);

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href="/admin/products" className="text-slate-500 hover:text-slate-800">
          ← Products
        </Link>
      </div>
      <Card>
        <CardHeader
          title="Upload a product"
          subtitle="The file is uploaded straight to secure storage. The product appears on the website and in the plugin once saved."
        />
        <ProductForm
          vendors={(vendors ?? []) as VendorOption[]}
          categories={(categories ?? []) as CategoryOption[]}
          defaultVendorId={brand}
        />
      </Card>
    </div>
  );
}
