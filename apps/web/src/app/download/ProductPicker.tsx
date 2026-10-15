"use client";

import { useState } from "react";

export type Product = "sketchup" | "revit" | "both";

type Option = { id: Product; title: string; body: string; button: string; href: string };

/**
 * SketchUp only, Revit only, or both. The download button, its label and the
 * file it serves follow the choice.
 *
 * In `form` mode (first download, inside the consent form) the choice travels
 * as the `product` field and the form's own submit button does the download.
 */
export function ProductPicker({
  options,
  mode,
  initial = "sketchup",
}: {
  options: Option[];
  mode: "link" | "form";
  initial?: Product;
}) {
  const [picked, setPicked] = useState<Product>(initial);
  const current = options.find((o) => o.id === picked) ?? options[0];

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        {options.map((o) => (
          <label
            key={o.id}
            className={`cursor-pointer rounded-xl border p-4 text-sm transition ${
              picked === o.id ? "border-brand-600 ring-2 ring-brand-600/20" : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <input
              type="radio"
              name="product"
              value={o.id}
              checked={picked === o.id}
              onChange={() => setPicked(o.id)}
              className="sr-only"
            />
            <span className="block font-semibold text-slate-900">{o.title}</span>
            <span className="mt-1 block text-xs leading-5 text-slate-500">{o.body}</span>
          </label>
        ))}
      </div>
      {mode === "link" ? (
        <a
          href={current.href}
          className="mt-6 inline-flex rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800"
        >
          {current.button}
        </a>
      ) : null}
    </div>
  );
}
