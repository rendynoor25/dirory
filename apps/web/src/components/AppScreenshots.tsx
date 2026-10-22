"use client";

import Image from "next/image";
import { useState } from "react";

export type AppShot = {
  app: string;
  src: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
};

/**
 * Landing-page screenshot of the Dirory panel, one tab per design app
 * (SketchUp, Revit, Rhino). Copy comes from the server so the EN/ID toggle
 * still works.
 */
export function AppScreenshots({ shots, tabsLabel }: { shots: AppShot[]; tabsLabel: string }) {
  const [active, setActive] = useState(0);
  const shot = shots[active];

  return (
    <figure className="relative">
      <div className="absolute -inset-4 rounded-[2rem] bg-brand-50" aria-hidden="true" />
      <div role="tablist" aria-label={tabsLabel} className="relative mb-3 inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
        {shots.map((s, i) => (
          <button
            key={s.app}
            type="button"
            role="tab"
            id={`app-shot-tab-${i}`}
            aria-selected={i === active}
            aria-controls="app-shot-panel"
            onClick={() => setActive(i)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              i === active ? "bg-brand-700 text-white" : "text-slate-600 hover:text-slate-950"
            }`}
          >
            {s.app}
          </button>
        ))}
      </div>
      <div id="app-shot-panel" role="tabpanel" aria-labelledby={`app-shot-tab-${active}`} className="relative">
        {/* All three stay mounted so switching tabs is instant; only the active one is visible. */}
        {shots.map((s, i) => (
          <Image
            key={s.src}
            src={s.src}
            alt={s.alt}
            width={s.width}
            height={s.height}
            sizes="(min-width: 1024px) 640px, 100vw"
            aria-hidden={i !== active}
            className={`w-full rounded-2xl border border-slate-200 shadow-[0_28px_80px_-40px_rgba(33,48,108,.5)] ${
              i === active ? "relative" : "absolute inset-0 invisible"
            }`}
          />
        ))}
      </div>
      <figcaption className="relative mt-3 text-center text-xs text-slate-400">{shot.caption}</figcaption>
    </figure>
  );
}
