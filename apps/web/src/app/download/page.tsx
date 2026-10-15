import Image from "next/image";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale-server";
import { t } from "@/lib/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";
import { PLUGIN_VERSION } from "@/lib/pluginRelease";
import { PLUGIN_CONSENT_VERSION } from "@/lib/consent";
import { acceptPluginConsent } from "./actions";
import { ShareChoices } from "./ShareChoices";

export const dynamic = "force-dynamic";

/**
 * Plugin download.
 *
 * The RBZ is served only to a signed-in account that has accepted the privacy
 * notice (UU 27/2022). This is also where the architect makes the three sharing
 * choices (UU PDP A3); the plugin adopts them when it signs in, so it never has
 * to interrupt work in SketchUp to ask. The version is compared exactly, so
 * revising the policy asks everyone to choose again.
 */
export default async function DownloadPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; edit?: string }>;
}) {
  const [{ supabase, user }, locale, sp] = await Promise.all([
    getSession(),
    getLocale(),
    searchParams,
  ]);

  let consented = false;
  let choices = { usage: false, project: false, searchMiss: true };
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("plugin_consent_version, consent_version, share_usage, share_project, share_search_miss")
      .eq("id", user.id)
      .maybeSingle();
    consented =
      data?.plugin_consent_version === PLUGIN_CONSENT_VERSION &&
      data?.consent_version === PLUGIN_CONSENT_VERSION;
    if (data?.consent_version) {
      choices = {
        usage: !!data.share_usage,
        project: !!data.share_project,
        searchMiss: !!data.share_search_miss,
      };
    }
  }
  const editing = consented && sp.edit === "1";
  const onOff = (on: boolean) => t(locale, on ? "download.on" : "download.off");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8f9fc] px-6 py-16">
      <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 text-sm font-semibold text-slate-900">
            <Image src="/dirory-mark.png" alt="" width={30} height={33} className="h-8 w-auto" /> Dirory
          </Link>
          <LanguageToggle locale={locale} />
        </div>
        <p className="mt-8 text-xs font-bold uppercase tracking-[.2em] text-brand-600">{t(locale, "download.tag")}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t(locale, "download.title")}</h1>

        {sp.error === "consent" ? (
          <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            We could not record your agreement. Please try again.
          </p>
        ) : null}

        {user ? (
          <>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {t(locale, "download.signedInAs")} <strong className="text-slate-800">{user.email}</strong>.{" "}
              {t(locale, "download.signedInBody")}
            </p>

            {consented && !editing ? (
              <>
                <a
                  href="/api/download/rbz"
                  className="mt-7 inline-flex rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800"
                >
                  {t(locale, "download.button")} (v{PLUGIN_VERSION})
                </a>
                <p className="mt-4 text-xs leading-5 text-slate-500">
                  {t(locale, "download.yourChoices")}: {t(locale, "download.shareUsage")}{" "}
                  {onOff(choices.usage)} · {t(locale, "download.shareProject")} {onOff(choices.project)} ·{" "}
                  {t(locale, "download.shareSearchMiss")} {onOff(choices.searchMiss)}.{" "}
                  <Link href="/download?edit=1" className="font-medium text-brand-700 underline">
                    {t(locale, "download.changeChoices")}
                  </Link>
                </p>
              </>
            ) : (
              <form action={acceptPluginConsent} className="mt-6">
                {editing ? <input type="hidden" name="stay" value="1" /> : null}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">
                    {t(locale, "download.consentTitle")}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {t(locale, "download.consentBody")}
                  </p>
                </div>
                <ShareChoices
                  initial={choices}
                  labels={{
                    usage: t(locale, "download.shareUsage"),
                    usageBody: t(locale, "download.shareUsageBody"),
                    project: t(locale, "download.shareProject"),
                    projectBody: t(locale, "download.shareProjectBody"),
                    searchMiss: t(locale, "download.shareSearchMiss"),
                    searchMissBody: t(locale, "download.shareSearchMissBody"),
                  }}
                />
                <label className="mt-4 flex items-start gap-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name="agree"
                    required
                    className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300"
                  />
                  <span>
                    {t(locale, "download.consentAgree")}{" "}
                    <Link href="/privacy" className="font-medium text-brand-700 underline">
                      {t(locale, "download.privacy")}
                    </Link>
                  </span>
                </label>
                <button
                  type="submit"
                  className="mt-5 inline-flex rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800"
                >
                  {editing
                    ? t(locale, "download.saveChoices")
                    : `${t(locale, "download.consentButton")} (v${PLUGIN_VERSION})`}
                </button>
              </form>
            )}

            <div className="mt-7 rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
              <strong>{t(locale, "download.requires")}</strong> {t(locale, "download.requiresBody")}
            </div>

            <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm text-slate-600">
              <li>{t(locale, "download.step1")}</li>
              <li>
                {t(locale, "download.step2")}{" "}
                <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">.rbz</code>
              </li>
              <li>{t(locale, "download.step3")}</li>
              <li>{t(locale, "download.step4")}</li>
            </ol>

            <p className="mt-5 text-sm">
              <Link href="/how-to-install" className="font-medium text-brand-700 underline">
                {t(locale, "download.fullGuide")} →
              </Link>
            </p>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm leading-6 text-slate-600">{t(locale, "download.signInLead")}</p>
            <Link
              href="/login?next=%2Fdownload"
              className="mt-7 inline-flex rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800"
            >
              {t(locale, "download.signUpOrIn")}
            </Link>
            <p className="mt-5 text-sm">
              <Link href="/how-to-install" className="font-medium text-brand-700 underline">
                {t(locale, "download.howToInstall")} →
              </Link>
            </p>
          </>
        )}

        <p className="mt-7 text-xs text-slate-500">
          <Link href="/privacy" className="underline">{t(locale, "download.privacy")}</Link> ·{" "}
          {t(locale, "download.footerNote")}
        </p>
      </section>
    </main>
  );
}
