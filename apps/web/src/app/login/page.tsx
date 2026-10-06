import { SignInForm } from "./SignInForm";
import { googleEnabled } from "@/lib/providers";
import { getLocale } from "@/lib/locale-server";
import { t } from "@/lib/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";

/**
 * Sign-in page — a server component.
 *
 * Next.js 15 delivers `searchParams` as a Promise, so it is awaited here. The
 * interactive form lives in `SignInForm` because a client component cannot be
 * `async`; doing so triggered React error #321 (invalid hook call).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const [params, locale, withGoogle] = await Promise.all([searchParams, getLocale(), googleEnabled()]);

  // A visitor signing in from the public page should return home, not be sent to
  // the vendor portal. Protected destinations (e.g. /admin or /download) arrive
  // explicitly via `next` and are preserved.
  const candidate = params.next ?? "/";
  const next = candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/";

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">Dirory</p>
          <LanguageToggle locale={locale} />
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">{t(locale, "login.title")}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {withGoogle ? t(locale, "login.leadGoogle") : t(locale, "login.leadEmail")}
        </p>

        <SignInForm next={next} error={params.error} googleEnabled={withGoogle} locale={locale} />

        <p className="mt-6 text-xs text-slate-500">{t(locale, "login.footer")}</p>
      </div>
    </main>
  );
}
