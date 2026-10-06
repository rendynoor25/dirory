"use client";

import { useState } from "react";
import { t, type Locale } from "@/lib/i18n";

/**
 * "Check your SketchUp version" widget.
 *
 * Dirory needs SketchUp 2021 or newer, because it uses `Sketchup::Http::Request`
 * for cloud browsing (introduced in 2021). Older versions do not expose that API,
 * so the plugin cannot reach the catalogue — better to say so up front than after
 * installing.
 */
const SUPPORTED = ["2026", "2025", "2024", "2023", "2022", "2021"];
const OLDER = ["2020", "2019", "2018", "2017", "older"];

export function VersionCheck({ locale }: { locale: Locale }) {
  const [version, setVersion] = useState<string>("");

  const isSupported = SUPPORTED.includes(version);
  const isOlder = OLDER.includes(version);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <label htmlFor="su-version" className="text-sm font-semibold text-slate-800">
        {t(locale, "install.versionQuestion")}
      </label>
      <p className="mt-1 text-xs text-slate-500">{t(locale, "install.versionHelp")}</p>

      <select
        id="su-version"
        value={version}
        onChange={(e) => setVersion(e.target.value)}
        className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      >
        <option value="">{t(locale, "install.versionSelect")}</option>
        <optgroup label={t(locale, "install.versionSupportedGroup")}>
          {SUPPORTED.map((v) => (
            <option key={v} value={v}>
              SketchUp {v}
            </option>
          ))}
        </optgroup>
        <optgroup label={t(locale, "install.versionUnsupportedGroup")}>
          {OLDER.map((v) => (
            <option key={v} value={v}>
              {v === "older" ? t(locale, "install.versionOlder") : `SketchUp ${v}`}
            </option>
          ))}
        </optgroup>
      </select>

      {isSupported ? (
        <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
          <strong>{t(locale, "install.versionOk", { version })}</strong> {t(locale, "install.versionOkBody")}
        </div>
      ) : null}

      {isOlder ? (
        <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          <strong>
            {t(locale, "install.versionBad", {
              version: version === "older" ? t(locale, "install.versionOlder") : version,
            })}
          </strong>{" "}
          {t(locale, "install.versionBadBody")}
        </div>
      ) : null}
    </div>
  );
}
