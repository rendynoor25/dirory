import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale-server";
import { t } from "@/lib/i18n";

/**
 * Header account control for the public site.
 *
 * Signed out: "Sign in" + "Get the plugin".
 * Signed in:  the user's name/email with a menu (download, dashboard, sign out).
 *
 * A server component, so the session and the language both come from cookies —
 * no client-side flash of the wrong state.
 */
export async function AccountMenu() {
  const [{ user, profile, memberships }, locale] = await Promise.all([getSession(), getLocale()]);

  if (!user) {
    return (
      <>
        <Link href="/login?next=%2Fdownload" className="text-sm font-medium text-slate-700 hover:text-slate-950">
          {t(locale, "nav.signIn")}
        </Link>
        <Link
          href="/login?next=%2Fdownload"
          className="rounded-full bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800"
        >
          {t(locale, "nav.getPlugin")}
        </Link>
      </>
    );
  }

  const label = profile?.full_name?.trim() || user.email || "Account";
  const isAdmin = profile?.role === "admin";
  const isVendor = memberships.length > 0;

  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
          {label.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden max-w-[140px] truncate sm:inline">{label}</span>
        <span className="text-slate-400" aria-hidden="true">▾</span>
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl shadow-slate-900/10">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="truncate text-xs font-semibold text-slate-800">{label}</p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
        </div>
        <Link href="/download" className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
          {t(locale, "account.download")}
        </Link>
        {isAdmin ? (
          <a href="/admin" className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            {t(locale, "account.admin")}
          </a>
        ) : null}
        {isVendor ? (
          <Link href="/vendor" className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            {t(locale, "account.vendor")}
          </Link>
        ) : null}
        <Link href="/privacy" className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
          {t(locale, "account.privacy")}
        </Link>
        <form action="/auth/signout" method="post" className="border-t border-slate-100">
          <button type="submit" className="w-full px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50">
            {t(locale, "account.signOut")}
          </button>
        </form>
      </div>
    </details>
  );
}
