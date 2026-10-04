"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * FR-V3 — uploads a file straight to the private `models` / `materials`
 * bucket under the vendor's own prefix, then writes the resulting storage path
 * into a hidden field the server action reads. The browser never touches the
 * server-only keys.
 */
export function FileUpload({
  vendorId,
  type,
  name = "file_path",
}: {
  vendorId: string;
  type: "model" | "material";
  name?: string;
}) {
  const [path, setPath] = useState("");
  const [size, setSize] = useState(0);
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [error, setError] = useState("");

  const bucket = type === "material" ? "materials" : "models";
  const maxBytes = type === "material" ? 10 * 1024 * 1024 : 50 * 1024 * 1024;

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > maxBytes) {
      setState("error");
      setError(`File is larger than ${maxBytes / 1024 / 1024} MB.`);
      return;
    }

    setState("uploading");
    setError("");

    const supabase = createSupabaseBrowserClient();
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${vendorId}/${crypto.randomUUID()}/${safe}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(key, file, { upsert: false, contentType: file.type || undefined });

    if (uploadError) {
      setState("error");
      setError(uploadError.message);
      return;
    }

    setPath(key);
    setSize(file.size);
    setState("done");
  }

  return (
    <div>
      <label className="text-xs font-medium text-slate-600">
        {type === "material" ? "Image (jpg/png, max 10 MB)" : "Model (.skp, max 50 MB)"}
      </label>
      <input
        type="file"
        accept={type === "material" ? "image/*" : ".skp"}
        onChange={onChange}
        className="mt-1 block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
      />
      <input type="hidden" name={name} value={path} />
      <input type="hidden" name="file_size" value={size} />
      {state === "uploading" ? <p className="mt-1 text-xs text-slate-500">Uploading…</p> : null}
      {state === "done" ? (
        <p className="mt-1 text-xs text-emerald-700">Uploaded. It will be reviewed before going live.</p>
      ) : null}
      {state === "error" ? <p className="mt-1 text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
