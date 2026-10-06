"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n";
import { setLocale } from "@/app/locale-action";

/**
 * EN / ID switch. Writes the `locale` cookie through a server action and then
 * refreshes, so server-rendered text updates immediately.
 */
export function LanguageToggle({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const choose = (next: Locale) => {
    if (next === locale) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  };

  return (
    <div
      role="group"
      aria-label="Language"
      className="inline-flex items-center rounded-full border border-slate-300 bg-white p-0.5 text-xs font-semibold"
    >
      {LOCALES.map((code) => {
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            onClick={() => choose(code)}
            disabled={pending}
            aria-pressed={active}
            title={code === "en" ? "English" : "Bahasa Indonesia"}
            className={`rounded-full px-2.5 py-1 transition disabled:opacity-60 ${
              active ? "bg-brand-700 text-white" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {LOCALE_LABELS[code]}
          </button>
        );
      })}
    </div>
  );
}
