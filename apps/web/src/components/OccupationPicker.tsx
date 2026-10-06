"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveOccupation } from "@/lib/actions/occupation";
import { OCCUPATIONS, type Occupation } from "@/lib/occupations";
import { t, type Locale } from "@/lib/i18n";

/**
 * "What best describes you?" — asked once, after a user first signs in.
 *
 * Used on `/welcome` (web sign-in) and inside the device-approval page (plugin
 * sign-in), so the founder can see the mix of architects, designers, students
 * and others. Answering is optional; nothing is guessed.
 */
export function OccupationPicker({
  locale,
  next,
  compact = false,
}: {
  locale: Locale;
  /** Where to go after answering. Omitted on the compact (device) variant. */
  next?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<Occupation | null>(null);
  const [error, setError] = useState("");

  const choose = (value: Occupation) => {
    setError("");
    startTransition(async () => {
      const result = await saveOccupation(value);
      if (!result.ok) {
        setError(t(locale, "welcome.error"));
        return;
      }
      setSaved(value);
      if (next) {
        router.push(next);
      } else {
        router.refresh();
      }
    });
  };

  const skip = () => {
    if (next) router.push(next);
    else router.refresh();
  };

  if (saved) {
    return (
      <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
        {t(locale, "welcome.thanks")}
      </p>
    );
  }

  return (
    <div>
      <div className={`grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
        {OCCUPATIONS.map((value) => (
          <button
            key={value}
            type="button"
            disabled={pending}
            onClick={() => choose(value)}
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-brand-400 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t(locale, `welcome.${value}`)}
          </button>
        ))}
      </div>

      {pending ? <p className="mt-3 text-xs text-slate-500">{t(locale, "welcome.saving")}</p> : null}
      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}

      <button
        type="button"
        onClick={skip}
        disabled={pending}
        className="mt-4 text-xs text-slate-500 underline underline-offset-2 hover:text-slate-800 disabled:opacity-60"
      >
        {t(locale, "welcome.skip")}
      </button>
    </div>
  );
}
