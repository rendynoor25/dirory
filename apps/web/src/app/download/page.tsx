import Image from "next/image";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { PLUGIN_VERSION } from "@/lib/pluginRelease";

export const dynamic = "force-dynamic";

export default async function DownloadPage() {
  const { user } = await getSession();

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8f9fc] px-6 py-16">
      <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <Link href="/" className="flex items-center gap-3 text-sm font-semibold text-slate-900">
          <Image src="/dirory-mark.png" alt="" width={30} height={33} className="h-8 w-auto" /> Dirory
        </Link>
        <p className="mt-8 text-xs font-bold uppercase tracking-[.2em] text-brand-600">SketchUp extension</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Get Dirory for SketchUp</h1>

        {user ? (
          <>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Signed in as <strong className="text-slate-800">{user.email}</strong>. Download the
              extension, then add it in SketchUp&rsquo;s Extension Manager.
            </p>

            <a
              href="/api/download/rbz"
              className="mt-7 inline-flex rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800"
            >
              Download RBZ (v{PLUGIN_VERSION})
            </a>

            <div className="mt-7 rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
              <strong>Requires SketchUp 2021 or newer.</strong> The plugin browses the cloud library
              inside SketchUp: search models and materials, click to place or paint, and update
              itself when a new version ships.
            </div>

            <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm text-slate-600">
              <li>In SketchUp, open <strong>Window → Extension Manager</strong>.</li>
              <li>
                Choose <strong>Install Extension</strong> and select the downloaded{" "}
                <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">.rbz</code>.
              </li>
              <li>Restart SketchUp, then open <strong>Extensions → Dirory → Open Library Panel</strong>.</li>
              <li>Sign in with Google from the panel&rsquo;s account button.</li>
            </ol>

            <p className="mt-5 text-sm">
              <Link href="/how-to-install" className="font-medium text-brand-700 underline">
                See the full install guide →
              </Link>
            </p>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Create a free architect account or sign in to download the plugin. We send a one-time
              link to your email; Gmail addresses are supported.
            </p>
            <Link
              href="/login?next=%2Fdownload"
              className="mt-7 inline-flex rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800"
            >
              Sign up or sign in
            </Link>
            <p className="mt-5 text-sm">
              <Link href="/how-to-install" className="font-medium text-brand-700 underline">
                How to install →
              </Link>
            </p>
          </>
        )}

        <p className="mt-7 text-xs text-slate-500">
          <Link href="/privacy" className="underline">Privacy Policy</Link> · Free for architects and designers.
        </p>
      </section>
    </main>
  );
}
