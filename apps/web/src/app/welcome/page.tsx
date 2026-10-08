import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale-server";
import { t } from "@/lib/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";
import { OccupationPicker } from "@/components/OccupationPicker";
import { GeographyForm } from "@/components/GeographyForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Welcome" };

/**
 * Two-step, optional onboarding after a first sign-in.
 *
 *   step 1 (default)  - occupation
 *   step 2 (?step=geo) - optional city / province
 *
 * Both answers are optional and stored on the profile for aggregate admin
 * reporting. The occupation step is only asked once; the geography step is only
 * reached straight after it, so a returning user is not interrupted again.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; edit?: string; step?: string }>;
}) {
  const [params, locale] = await Promise.all([searchParams, getLocale()]);

  const candidate = params.next ?? "/";
  const next = candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/";
  const editing = params.edit === "1";
  const step = params.step === "geo" ? "geo" : "occupation";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/welcome?next=${next}`)}`);

  // Already answered — do not ask the occupation question again unless editing.
  if (step === "occupation") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("occupation")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.occupation && !editing) redirect(next);
  }

  const geoNext = `/welcome?step=geo&next=${encodeURIComponent(next)}`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8f9fc] px-6 py-16">
      <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 text-sm font-semibold text-slate-900">
            <Image src="/dirory-mark.png" alt="" width={30} height={33} className="h-8 w-auto" /> Dirory
          </Link>
          <LanguageToggle locale={locale} />
        </div>

        {step === "geo" ? (
          <>
            <p className="mt-8 text-xs font-bold uppercase tracking-[.2em] text-brand-600">
              {t(locale, "welcome.geoTag")}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              {t(locale, "welcome.geoTitle")}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t(locale, "welcome.geoLead")}</p>
            <div className="mt-6">
              <GeographyForm locale={locale} next={next} />
            </div>
          </>
        ) : (
          <>
            <p className="mt-8 text-xs font-bold uppercase tracking-[.2em] text-brand-600">
              {t(locale, "welcome.tag")}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t(locale, "welcome.title")}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t(locale, "welcome.lead")}</p>
            <div className="mt-6">
              {/* Answering the occupation moves on to the optional geography step. */}
              <OccupationPicker locale={locale} next={editing ? next : geoNext} />
            </div>
          </>
        )}
      </section>
    </main>
  );
}
