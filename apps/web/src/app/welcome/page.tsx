import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale-server";
import { t } from "@/lib/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";
import { OccupationPicker } from "@/components/OccupationPicker";

export const dynamic = "force-dynamic";
export const metadata = { title: "Welcome" };

/**
 * One-time question after a user first signs in.
 *
 * The answer is optional and stored on the profile so the admin dashboard can
 * show how many architects / designers / students / others use Dirory. If the
 * user has already answered, or skips, they continue to `next`.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; edit?: string }>;
}) {
  const [params, locale] = await Promise.all([searchParams, getLocale()]);

  const candidate = params.next ?? "/";
  const next = candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/";
  // `?edit=1` (from the account menu) lets a user change an answer they already
  // gave; the plain link only ever asks once.
  const editing = params.edit === "1";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/welcome?next=${next}`)}`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("occupation")
    .eq("id", user.id)
    .maybeSingle();

  // Already answered — do not ask again unless explicitly editing.
  if (profile?.occupation && !editing) redirect(next);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8f9fc] px-6 py-16">
      <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 text-sm font-semibold text-slate-900">
            <Image src="/dirory-mark.png" alt="" width={30} height={33} className="h-8 w-auto" /> Dirory
          </Link>
          <LanguageToggle locale={locale} />
        </div>

        <p className="mt-8 text-xs font-bold uppercase tracking-[.2em] text-brand-600">{t(locale, "welcome.tag")}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t(locale, "welcome.title")}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{t(locale, "welcome.lead")}</p>

        <div className="mt-6">
          <OccupationPicker locale={locale} next={next} />
        </div>
      </section>
    </main>
  );
}
