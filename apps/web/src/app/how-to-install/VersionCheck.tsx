"use client";

import { useState } from "react";
import { t, type Locale } from "@/lib/i18n";

/**
 * "Check your SketchUp version" widget.
 *
 * Dirory needs SketchUp **2019 or newer**. The reason is not the HTTP API, which
 * is commonly assumed: `Sketchup::Http::Request` and `UI::HtmlDialog` both arrived
 * in **2017**, and the panel runs on CEF (2017 = CEF 52), which parses the modern
 * JavaScript in `panel.js` without trouble. What rules out 2017 and 2018 is the
 * Ruby version. `updater.rb` uses squiggly heredocs (`<<~`, Ruby 2.3+) and
 * `main.rb` uses `String#match?` and `Array#sum` (Ruby 2.4+), while SketchUp 2017
 * and 2018 shipped Ruby 2.2 — so on those versions the plugin is not merely
 * unsupported, it fails to parse and does not load at all. SketchUp 2019 upgraded
 * to Ruby 2.5, which is where these start working.
 *
 * Do not lower this without checking those three constructs: a syntax error means
 * no friendly message, just Ruby noise in the console.
 */
const SUPPORTED = ["2026", "2025", "2024", "2023", "2022", "2021", "2020", "2019"];
const OLDER = ["2018", "2017", "older"];

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
