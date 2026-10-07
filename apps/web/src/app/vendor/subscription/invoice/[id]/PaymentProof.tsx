"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * FR-M5 — attach a transfer receipt to an invoice.
 *
 * Uploads straight to the private `materials` bucket under the vendor's own
 * prefix (`<vendor_id>/proofs/<invoice_id>/…`), which the storage policy allows
 * for a vendor editor. The path is written into a hidden field the server action
 * reads; the admin signs it to view.
 */
export function PaymentProof({
  vendorId,
  invoiceId,
  name = "proof_path",
}: {
  vendorId: string;
  invoiceId: string;
  name?: string;
}) {
  const [path, setPath] = useState("");
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [error, setError] = useState("");

  const maxBytes = 10 * 1024 * 1024;

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > maxBytes) {
      setState("error");
      setError("File is larger than 10 MB.");
      return;
    }

    setState("uploading");
    setError("");

    const supabase = createSupabaseBrowserClient();
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${vendorId}/proofs/${invoiceId}/${safe}`;

    const { error: uploadError } = await supabase.storage
      .from("materials")
      .upload(key, file, { upsert: true, contentType: file.type || undefined });

    if (uploadError) {
      setState("error");
      setError(uploadError.message);
      return;
    }

    setPath(key);
    setState("done");
  }

  return (
    <div>
      <label className="text-xs font-medium text-slate-600">
        Proof of payment (image or PDF, max 10 MB)
      </label>
      <input
        type="file"
        accept="image/*,application/pdf"
        onChange={onChange}
        className="mt-1 block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
      />
      <input type="hidden" name={name} value={path} />
      {state === "uploading" ? <p className="mt-1 text-xs text-slate-500">Uploading…</p> : null}
      {state === "done" ? (
        <p className="mt-1 text-xs text-emerald-700">Receipt attached.</p>
      ) : null}
      {state === "error" ? <p className="mt-1 text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
