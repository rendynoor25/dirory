import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export default function Home() {
  const configured = isSupabaseConfigured();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">Dirory</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">
        Multi-vendor product library for SketchUp
      </h1>
      <p className="mt-4 text-lg text-slate-600">
        Architects browse and insert branded models and materials for free. Vendors publish their
        catalogue and see how architects use it. Admins curate the library and watch demand.
      </p>

      {!configured ? (
        <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Supabase is not configured yet.</p>
          <p className="mt-1">
            Copy <code className="rounded bg-amber-100 px-1">apps/web/.env.example</code> to{" "}
            <code className="rounded bg-amber-100 px-1">.env.local</code> and fill in your project
            URL and anon key, then run <code className="rounded bg-amber-100 px-1">supabase db push</code>.
            See <code className="rounded bg-amber-100 px-1">docs/SETUP.md</code>.
          </p>
        </div>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/login"
          className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          Sign in
        </Link>
        <Link
          href="/vendor"
          className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
        >
          Vendor portal
        </Link>
        <Link
          href="/admin"
          className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
        >
          Admin back-office
        </Link>
      </div>
    </main>
  );
}