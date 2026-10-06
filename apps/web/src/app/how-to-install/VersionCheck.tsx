"use client";

import { useState } from "react";

/**
 * "Check your SketchUp version" widget.
 *
 * Dirory needs SketchUp 2021 or newer, because it uses `Sketchup::Http::Request`
 * for cloud browsing (introduced in 2021). Older versions simply do not expose
 * that API, so the plugin cannot reach the catalogue — worth telling people up
 * front rather than after they have installed it.
 */
const SUPPORTED = ["2026", "2025", "2024", "2023", "2022", "2021"];
const OLDER = ["2020", "2019", "2018", "2017", "2016 or older"];

export function VersionCheck() {
  const [version, setVersion] = useState<string>("");

  const isSupported = SUPPORTED.includes(version);
  const isOlder = OLDER.includes(version);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <label htmlFor="su-version" className="text-sm font-semibold text-slate-800">
        Which SketchUp version do you have?
      </label>
      <p className="mt-1 text-xs text-slate-500">
        Find it under <strong>Help → About SketchUp</strong> (Windows) or{" "}
        <strong>SketchUp → About SketchUp</strong> (macOS).
      </p>

      <select
        id="su-version"
        value={version}
        onChange={(e) => setVersion(e.target.value)}
        className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      >
        <option value="">Select your version…</option>
        <optgroup label="Supported">
          {SUPPORTED.map((v) => (
            <option key={v} value={v}>
              SketchUp {v}
            </option>
          ))}
        </optgroup>
        <optgroup label="Not supported">
          {OLDER.map((v) => (
            <option key={v} value={v}>
              {v === "2016 or older" ? v : `SketchUp ${v}`}
            </option>
          ))}
        </optgroup>
      </select>

      {isSupported ? (
        <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
          <strong>SketchUp {version} works.</strong> Follow the steps below — the
          install is the same on Windows and macOS.
        </div>
      ) : null}

      {isOlder ? (
        <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          <strong>SketchUp {version.replace("SketchUp ", "")} is not supported.</strong> Dirory needs
          SketchUp <strong>2021 or newer</strong>: the plugin uses SketchUp&rsquo;s modern HTTP API to
          reach the cloud library, and that API does not exist in older versions. Upgrade SketchUp,
          then come back — your Dirory account and favourites are unaffected.
        </div>
      ) : null}
    </div>
  );
}
