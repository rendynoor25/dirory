"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveGeography } from "@/lib/actions/geography";
import { t, type Locale } from "@/lib/i18n";

/**
 * Optional city and province, asked once right after the occupation question.
 *
 * Both fields are optional and only feed an aggregate admin report; the copy
 * says so, and says it is never shown to a brand. Skipping is a first-class
 * action, not a hidden link.
 */
export function GeographyForm({ locale, next }: { locale: Locale; next: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await saveGeography({ city, province });
      if (!result.ok) {
        setError(t(locale, "welcome.geoError"));
        return;
      }
      router.push(next);
    });
  };

  const skip = () => router.push(next);

  return (
    <form onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="geo-city" className="text-xs font-medium text-slate-600">
            {t(locale, "welcome.city")}
          </label>
          <input
            id="geo-city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            maxLength={80}
            autoComplete="address-level2"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="geo-province" className="text-xs font-medium text-slate-600">
            {t(locale, "welcome.province")}
          </label>
          <input
            id="geo-province"
            value={province}
            onChange={(e) => setProvince(e.target.value)}
            maxLength={80}
            autoComplete="address-level1"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t(locale, "welcome.geoSave")}
        </button>
        <button
          type="button"
          onClick={skip}
          disabled={pending}
          className="text-xs text-slate-500 underline underline-offset-2 hover:text-slate-800 disabled:opacity-60"
        >
          {t(locale, "welcome.geoSkip")}
        </button>
      </div>
    </form>
  );
}
