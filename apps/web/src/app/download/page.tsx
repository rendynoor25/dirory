import Image from "next/image";
import Link from "next/link";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DownloadPage() {
  const { user } = await getSession();

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8f9fc] px-6 py-16">
      <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <Link href="/" className="flex items-center gap-3 text-sm font-semibold text-slate-900">
          <Image src="/dirory-mark.png" alt="" width={30} height={33} className="h-8 w-auto" /> Dirory
        </Link>
        <p className="mt-8 text-xs font-bold uppercase tracking-[.2em] text-[#465bb8]">SketchUp extension</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Get Dirory for SketchUp</h1>
        {user ? (
          <>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Signed in as <strong className="text-slate-800">{user.email}</strong>. Download the extension,
              then install the RBZ in SketchUp Extension Manager.
            </p>
            <a href="/api/download/rbz" className="mt-7 inline-flex rounded-full bg-[#3549a7] px-6 py-3 text-sm font-semibold text-white hover:bg-[#293b91]">
              Download RBZ (v0.8.0)
            </a>
            <div className="mt-7 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              <strong>Current release note:</strong> this RBZ browses the library configured on your computer.
              Cloud catalogue downloads and verified plugin sign-in are still being built. Do not expect
              cloud product downloads inside SketchUp yet.
            </div>
            <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm text-slate-600">
              <li>In SketchUp, open Extension Manager.</li>
              <li>Choose Install Extension and select the downloaded <code>.rbz</code>.</li>
              <li>Restart SketchUp if requested, then open Extensions &gt; Dirory.</li>
            </ol>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Create a free architect account or sign in to download the plugin. We send a one-time link
              to your email; Gmail addresses are supported.
            </p>
            <Link href="/login?next=%2Fdownload" className="mt-7 inline-flex rounded-full bg-[#3549a7] px-6 py-3 text-sm font-semibold text-white hover:bg-[#293b91]">
              Sign up or sign in
            </Link>
          </>
        )}
        <p className="mt-7 text-xs text-slate-500"><Link href="/privacy" className="underline">Privacy Policy</Link> Â· Free for architects and designers.</p>
      </section>
    </main>
  );
}
