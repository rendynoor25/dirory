import Image from "next/image";
import Link from "next/link";
import { AccountMenu } from "@/components/AccountMenu";
import { VersionCheck } from "./VersionCheck";

export const metadata = {
  title: "How to install",
  description:
    "Install the Dirory plugin in SketchUp: check your version, download the RBZ, add it in Extension Manager, and sign in.",
};

const STEPS = [
  {
    n: "01",
    title: "Create a free account",
    body: (
      <>
        The plugin download needs an account. Go to{" "}
        <Link href="/login?next=%2Fdownload" className="font-medium text-brand-700 underline">
          Sign in
        </Link>{" "}
        and use <strong>Continue with Google</strong> or an email link. No password is stored.
      </>
    ),
  },
  {
    n: "02",
    title: "Download the extension",
    body: (
      <>
        On the{" "}
        <Link href="/download" className="font-medium text-brand-700 underline">
          download page
        </Link>
        , click <strong>Download RBZ</strong>. You get one file, for example{" "}
        <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">DiroryLibrary-0.9.0.rbz</code>.
        Keep it somewhere easy to find — your Downloads folder is fine.
      </>
    ),
  },
  {
    n: "03",
    title: "Open Extension Manager in SketchUp",
    body: (
      <>
        In SketchUp, open the <strong>Window</strong> menu and choose{" "}
        <strong>Extension Manager</strong>. This is the same on Windows and macOS.
      </>
    ),
  },
  {
    n: "04",
    title: "Install the RBZ",
    body: (
      <>
        Click <strong>Install Extension</strong>, select the <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">.rbz</code>{" "}
        file you downloaded, and confirm. SketchUp may warn that the extension is not
        from the Extension Warehouse — that is normal for third-party plugins; choose{" "}
        <strong>Install</strong> / <strong>Yes</strong> to continue.
      </>
    ),
  },
  {
    n: "05",
    title: "Restart SketchUp",
    body: (
      <>
        Close and reopen SketchUp so the new menu and toolbar load. You will then see{" "}
        <strong>Extensions → Dirory</strong> and a Dirory toolbar button.
      </>
    ),
  },
  {
    n: "06",
    title: "Open the panel and sign in",
    body: (
      <>
        Click <strong>Extensions → Dirory → Open Library Panel</strong>. Click the account
        button (👤) and choose <strong>Sign in with Google</strong>. Your browser opens, you pick
        your account, and the panel connects by itself. Your name then appears at the top right.
      </>
    ),
  },
];

export default function HowToInstallPage() {
  return (
    <main className="min-h-screen bg-[#f8f9fc] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="Dirory home">
            <Image src="/dirory-mark.png" alt="" width={34} height={37} priority className="h-9 w-auto" />
            <span className="text-lg font-semibold tracking-tight">Dirory</span>
          </Link>
          <nav className="flex items-center gap-3 sm:gap-5" aria-label="Main navigation">
            <Link href="/library" className="text-sm text-slate-600 hover:text-slate-950">
              Library
            </Link>
            <Link href="/how-to-install" className="text-sm font-semibold text-brand-700">
              How to install
            </Link>
            <AccountMenu />
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-brand-500">Setup guide</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          How to install Dirory in SketchUp
        </h1>
        <p className="mt-4 text-sm leading-7 text-slate-600">
          It takes about two minutes. You need <strong>SketchUp 2021 or newer</strong> on Windows or
          macOS, an internet connection, and a free Dirory account.
        </p>

        <div className="mt-8">
          <VersionCheck />
        </div>

        <h2 className="mt-12 text-xl font-semibold tracking-tight">Step by step</h2>
        <ol className="mt-5 space-y-4">
          {STEPS.map((step) => (
            <li key={step.n} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                {step.n}
              </span>
              <div>
                <h3 className="text-base font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight">Where to find it afterwards</h2>
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">What</th>
                  <th className="px-4 py-3 font-semibold">Where</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                <tr>
                  <td className="px-4 py-3">Open the product library</td>
                  <td className="px-4 py-3">
                    Extensions → Dirory → <strong>Open Library Panel</strong>
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Sign in or out</td>
                  <td className="px-4 py-3">The 👤 button in the panel, or Extensions → Dirory → Sign in</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Check the connection</td>
                  <td className="px-4 py-3">Extensions → Dirory → <strong>Test Connection</strong></td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Update the plugin</td>
                  <td className="px-4 py-3">The ⬆ badge in the panel, then restart SketchUp</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight">Updating</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            You do not need to reinstall by hand. When a new version is published, an{" "}
            <strong>Update</strong> badge appears in the panel. Click it, then restart SketchUp —
            the plugin replaces itself and keeps your settings and sign-in.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight">If something goes wrong</h2>
          <dl className="mt-4 space-y-3">
            {[
              [
                "SketchUp says the extension is not signed",
                "Normal for plugins outside the Extension Warehouse. Choose Install / Yes. The file comes from dirory.com over HTTPS.",
              ],
              [
                "No Dirory menu after installing",
                "Restart SketchUp. If it still does not appear, open Window → Ruby Console and check for a red error, then reinstall the RBZ.",
              ],
              [
                "The panel opens but shows no products",
                "Sign in first (👤). Browsing is free, but the catalogue needs the cloud connection.",
              ],
              [
                "“HTTP 0” or cannot reach the server",
                "Extensions → Dirory → Test Connection shows the exact cause. A network filter or firewall blocking the connection is the usual reason.",
              ],
              [
                "Sign-in opens a browser page that will not load",
                "The browser step must reach dirory.com. If it cannot, the panel keeps waiting — check the address in the browser window.",
              ],
              [
                "SketchUp 2020 or older",
                "Not supported. The plugin needs SketchUp 2021+ for its HTTP API. Upgrade SketchUp; your Dirory account stays the same.",
              ],
            ].map(([q, a]) => (
              <div key={q} className="rounded-2xl border border-slate-200 bg-white p-5">
                <dt className="text-sm font-semibold text-slate-900">{q}</dt>
                <dd className="mt-1 text-sm leading-6 text-slate-600">{a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="mt-12 rounded-2xl border border-brand-200 bg-brand-50/60 p-6 text-center">
          <h2 className="text-lg font-semibold text-slate-900">Ready?</h2>
          <p className="mt-1 text-sm text-slate-600">
            Create your free account, then download the extension.
          </p>
          <Link
            href="/login?next=%2Fdownload"
            className="mt-4 inline-flex rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800"
          >
            Get the plugin
          </Link>
        </div>
      </div>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2 font-semibold text-slate-800">
            <Image src="/dirory-mark.png" alt="" width={20} height={22} className="h-5 w-auto" /> Dirory
          </Link>
          <p>Product library for architects and designers.</p>
          <div className="flex gap-5">
            <Link href="/library" className="hover:text-slate-900">Library</Link>
            <Link href="/how-to-install" className="hover:text-slate-900">How to install</Link>
            <Link href="/privacy" className="hover:text-slate-900">Privacy</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
