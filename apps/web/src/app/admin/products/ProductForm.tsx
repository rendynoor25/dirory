"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { parseSuVersion, SU_VERSION_CHOICES, type SuVersion } from "@/lib/su-version";
import {
  createBrandForUpload,
  createCategoryForUpload,
  registerProduct,
  type RegisterProductInput,
} from "./actions";

export type VendorOption = { id: string; brand_name: string; is_platform: boolean };
export type CategoryOption = { id: string; name: string; type: "model" | "material" };

const NEW_BRAND = "__new__";
const NEW_CATEGORY = "__new__";

/**
 * Admin product upload (FR-M12 / FR-V3).
 *
 * Modelled on Thudio's product detail form: the fields here are exactly what the
 * plugin's Inspector shows once the product is placed in a model.
 *
 * The file goes straight from the browser to the private `models` / `materials`
 * bucket — a `.skp` is tens of megabytes and must not pass through a server
 * action. Only the metadata goes through `registerProduct`. The brand and
 * category can be created inline, so the admin never has to leave the page.
 *
 * The SketchUp version is read from the `.skp` header as soon as the file is
 * chosen: a model saved in a newer SketchUp cannot be opened by an older one, so
 * it is recorded and later shown on the website and checked by the plugin.
 */
export function ProductForm({
  vendors,
  categories,
  defaultVendorId,
  defaultPublish = true,
}: {
  vendors: VendorOption[];
  categories: CategoryOption[];
  defaultVendorId?: string;
  defaultPublish?: boolean;
}) {
  const router = useRouter();

  const [type, setType] = useState<"model" | "material">("model");
  const [vendorChoice, setVendorChoice] = useState(
    defaultVendorId ?? vendors.find((v) => v.is_platform)?.id ?? vendors[0]?.id ?? NEW_BRAND,
  );
  const [newBrand, setNewBrand] = useState("");
  const [categoryChoice, setCategoryChoice] = useState("");
  const [newCategory, setNewCategory] = useState("");

  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [sku, setSku] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [tileW, setTileW] = useState("");
  const [tileH, setTileH] = useState("");
  const [publish, setPublish] = useState(defaultPublish);

  const [file, setFile] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [detected, setDetected] = useState<SuVersion | null>(null);
  const [suOverride, setSuOverride] = useState("");

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const typeCategories = useMemo(
    () => categories.filter((c) => c.type === type),
    [categories, type],
  );

  // The effective version: the admin's explicit choice, else what the file says.
  const suVersion = suOverride || detected?.label || "";
  const suRaw = suOverride ? "" : detected?.raw ?? "";

  async function onFileChosen(chosen: File | null) {
    setFile(chosen);
    setDetected(null);
    setSuOverride("");
    setError("");
    if (!chosen || type !== "model") return;
    try {
      const head = new Uint8Array(await chosen.slice(0, 64).arrayBuffer());
      setDetected(parseSuVersion(head));
    } catch {
      setDetected(null);
    }
  }

  function onTypeChange(next: "model" | "material") {
    setType(next);
    setCategoryChoice("");
    setDetected(null);
    setSuOverride("");
    if (next === "material") setThumbnail(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    if (!name.trim()) {
      setError("Give the product a name.");
      return;
    }
    if (vendorChoice === NEW_BRAND && !newBrand.trim()) {
      setError("Type the new brand's name.");
      return;
    }

    const maxBytes = type === "material" ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(`The file is larger than ${maxBytes / 1024 / 1024} MB.`);
      return;
    }

    setBusy(true);
    try {
      // 1. Brand — create it first so the storage path uses the right prefix.
      setStatus("Resolving the brand…");
      let vendorId = vendorChoice;
      if (vendorChoice === NEW_BRAND) {
        const created = await createBrandForUpload({ brand_name: newBrand.trim() });
        if (!created.ok) throw new Error(created.error);
        vendorId = created.id;
      }

      // 2. Category (optional).
      setStatus("Resolving the category…");
      let categoryId: string | null = categoryChoice || null;
      if (categoryChoice === NEW_CATEGORY && newCategory.trim()) {
        const created = await createCategoryForUpload({ type, name: newCategory.trim() });
        if (!created.ok) throw new Error(created.error);
        categoryId = created.id;
      }

      // 3. Upload the file straight to Storage under the vendor's prefix.
      setStatus("Uploading the file…");
      const supabase = createSupabaseBrowserClient();
      const assetId = crypto.randomUUID();
      const safe = (f: File) => f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const bucket = type === "material" ? "materials" : "models";
      const filePath = `${vendorId}/${assetId}/${safe(file)}`;

      const { error: fileError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, { upsert: false, contentType: file.type || undefined });
      if (fileError) throw new Error(`Upload failed: ${fileError.message}`);

      // A model's preview is a separate image; a material's preview is itself.
      let thumbnailPath: string | null = type === "material" ? filePath : null;
      if (type === "model" && thumbnail) {
        setStatus("Uploading the preview…");
        thumbnailPath = `${vendorId}/${assetId}/${safe(thumbnail)}`;
        const { error: thumbError } = await supabase.storage
          .from("materials")
          .upload(thumbnailPath, thumbnail, {
            upsert: false,
            contentType: thumbnail.type || undefined,
          });
        if (thumbError) throw new Error(`Preview upload failed: ${thumbError.message}`);
      }

      // 4. Write the database rows.
      setStatus("Saving…");
      const payload: RegisterProductInput = {
        vendor_id: vendorId,
        type,
        name: name.trim(),
        category_id: categoryId,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        sku: sku.trim() || null,
        product_url: productUrl.trim() || null,
        dimensions: dimensions.trim() || null,
        tile_w_cm: type === "material" && tileW ? Number(tileW) : null,
        tile_h_cm: type === "material" && tileH ? Number(tileH) : null,
        file_path: filePath,
        thumbnail_path: thumbnailPath,
        file_size: file.size,
        su_version: type === "model" ? suVersion || null : null,
        su_version_raw: type === "model" ? suRaw || null : null,
        publish,
      };
      const saved = await registerProduct(payload);
      if (!saved.ok) throw new Error(saved.error);

      setStatus("Done. Opening the product list…");
      router.push("/admin/products");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
      setStatus("");
    }
  }

  const inputClass =
    "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none";

  return (
    <form onSubmit={submit} className="grid gap-5 p-5 sm:grid-cols-2">
      {/* ---- what it is ------------------------------------------------ */}
      <div>
        <label className="text-xs font-medium text-slate-600">Type</label>
        <select
          value={type}
          onChange={(e) => onTypeChange(e.target.value as "model" | "material")}
          className={inputClass}
        >
          <option value="model">3D model (.skp)</option>
          <option value="material">Material (image)</option>
        </select>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-600">Brand</label>
        <select
          value={vendorChoice}
          onChange={(e) => setVendorChoice(e.target.value)}
          className={inputClass}
        >
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.brand_name}
              {v.is_platform ? " (Dirory sample)" : ""}
            </option>
          ))}
          <option value={NEW_BRAND}>➕ New brand…</option>
        </select>
        {vendorChoice === NEW_BRAND ? (
          <input
            value={newBrand}
            onChange={(e) => setNewBrand(e.target.value)}
            placeholder="Brand name, e.g. ALPHAMAX"
            className={inputClass}
          />
        ) : null}
      </div>

      <div>
        <label className="text-xs font-medium text-slate-600">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. CW 630 PJ"
          className={inputClass}
        />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-600">Category</label>
        <select
          value={categoryChoice}
          onChange={(e) => setCategoryChoice(e.target.value)}
          className={inputClass}
        >
          <option value="">— none —</option>
          {typeCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value={NEW_CATEGORY}>➕ New category…</option>
        </select>
        {categoryChoice === NEW_CATEGORY ? (
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="New category name"
            className={inputClass}
          />
        ) : null}
      </div>

      <div>
        <label className="text-xs font-medium text-slate-600">Tags (comma separated)</label>
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="closet, white, toto"
          className={inputClass}
        />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-600">SKU / code</label>
        <input value={sku} onChange={(e) => setSku(e.target.value)} className={inputClass} />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-600">Product URL</label>
        <input
          value={productUrl}
          onChange={(e) => setProductUrl(e.target.value)}
          placeholder="https://…"
          className={inputClass}
        />
      </div>

      {type === "model" ? (
        <div>
          <label className="text-xs font-medium text-slate-600">Dimensions</label>
          <input
            value={dimensions}
            onChange={(e) => setDimensions(e.target.value)}
            placeholder="e.g. 120 × 60 × 75 cm"
            className={inputClass}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600">Tile W (cm)</label>
            <input
              type="number"
              step="0.1"
              value={tileW}
              onChange={(e) => setTileW(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Tile H (cm)</label>
            <input
              type="number"
              step="0.1"
              value={tileH}
              onChange={(e) => setTileH(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      )}

      {/* ---- the files -------------------------------------------------- */}
      <div>
        <label className="text-xs font-medium text-slate-600">
          {type === "material" ? "Image (jpg/png, max 10 MB)" : "Model (.skp, max 50 MB)"}
        </label>
        <input
          type="file"
          accept={type === "material" ? "image/*" : ".skp"}
          onChange={(e) => onFileChosen(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
        />
      </div>

      {type === "model" ? (
        <div>
          <label className="text-xs font-medium text-slate-600">
            Preview image (optional, jpg/png)
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setThumbnail(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700"
          />
        </div>
      ) : null}

      {/* ---- SketchUp compatibility (models only) ----------------------- */}
      {type === "model" ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:col-span-2">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-xs font-medium text-slate-600">SketchUp version</label>
              <select
                value={suOverride}
                onChange={(e) => setSuOverride(e.target.value)}
                className={inputClass}
              >
                <option value="">
                  {detected ? `Detected from the file (${detected.label})` : "Not detected — choose one"}
                </option>
                {SU_VERSION_CHOICES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="pb-2 text-xs">
              {suVersion ? (
                <p className="text-slate-700">
                  <span className="font-medium">Opens in SketchUp {suVersion} and later.</span>
                  {detected ? (
                    <span className="text-slate-400"> · header {detected.raw}</span>
                  ) : null}
                </p>
              ) : (
                <p className="text-slate-500">
                  Choose the version if the file header could not be read.
                </p>
              )}
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            A model saved in a newer SketchUp cannot be opened by an older one. If your audience
            uses older versions, save the model in the oldest version they use, then upload that.
          </p>
        </div>
      ) : null}

      {/* ---- publish ---------------------------------------------------- */}
      <div className="sm:col-span-2">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={publish}
            onChange={(e) => setPublish(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Publish now — visible in the website and the plugin straight away. Untick to send it to
          the review queue instead.
        </label>
      </div>

      {/* ---- actions ---------------------------------------------------- */}
      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Upload product"}
        </button>
        {status ? <span className="text-xs text-slate-500">{status}</span> : null}
        {error ? <span className="text-xs text-rose-700">{error}</span> : null}
      </div>
    </form>
  );
}
