"use client";

import { useState } from "react";

export type Product = "sketchup" | "revit" | "revitNew" | "both";

type Option = { id: Product; title: string; body: string; button: string; href: string };

/** Shown but not selectable: a product that has no download yet. */
type Upcoming = { id: string; title: string; body: string; badge: string };

/**
 * SketchUp only, Revit 2024, Revit 2025-2027, or SketchUp and Revit. The download button, its label and the
 * file it serves follow the choice.
 *
 * In `form` mode (first download, inside the consent form) the choice travels
 * as the `product` field and the form's own submit button does the download.
 */
export function ProductPicker({
  options,
  upcoming = [],
  mode,
  initial = "sketchup",
}: {
  options: Option[];
  upcoming?: Upcoming[];
  mode: "link" | "form";
  initial?: Product;
}) {
  const [picked, setPicked] = useState<Product>(initial);
  const current = options.find((o) => o.id === picked) ?? options[0];

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
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
      {upcoming.length ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {upcoming.map((u) => (
            <div
              key={u.id}
              aria-disabled="true"
              className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500"
            >
              <span className="flex items-center gap-2 font-semibold text-slate-700">
                {u.title}
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                  {u.badge}
                </span>
              </span>
              <span className="mt-1 block text-xs leading-5">{u.body}</span>
            </div>
          ))}
        </div>
      ) : null}
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
