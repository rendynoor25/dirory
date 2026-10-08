import Link from "next/link";

export const metadata = { title: "No access" };

/**
 * Shown to a signed-in user who reaches an area their role does not allow
 * (brief §48: a clear "no access" page, with no data on it).
 */
export default function NoAccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-[#465bb8]">Dirory</p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">You don&apos;t have access to this area</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Your account is signed in, but it is not an administrator account. If you are a vendor,
          your workspace is the vendor portal. If you believe this is a mistake, ask the Dirory team
          to grant your account the admin role.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/vendor"
            className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Go to the vendor portal
          </Link>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
