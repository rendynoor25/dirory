import Link from "next/link";

export const metadata = {
  title: "Privacy Policy",
  description: "How Dirory handles account and SketchUp plugin data.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-14">
      <Link href="/" className="text-sm font-semibold text-[#3549a7]">â† Dirory home</Link>
      <p className="mt-8 text-xs font-bold uppercase tracking-[.2em] text-[#465bb8]">Privacy Â· Draft</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-4 text-sm leading-6 text-slate-600">This draft describes the current Dirory website and SketchUp extension. It must be reviewed by Indonesian privacy counsel and the placeholders completed before public launch.</p>
      <div className="mt-8 space-y-7 text-sm leading-7 text-slate-700">
        <section><h2 className="text-lg font-semibold text-slate-900">Account sign-in</h2><p>Enter an email address, including Gmail, and Supabase Auth sends a one-time sign-in link. The first successful sign-in creates an architect account. Dirory does not ask for or store your email password. Your account email and profile details are used to provide the service and support.</p></section>
        <section><h2 className="text-lg font-semibold text-slate-900">Plugin download</h2><p>The RBZ download requires a signed-in account. The current v0.8.3 plugin browses the cloud catalogue, downloads models and materials on demand, syncs favourites and uses a verified browser sign-in. A local library folder still works when no server URL is set.</p></section>
        <section><h2 className="text-lg font-semibold text-slate-900">Plugin sharing controls</h2><p>The current plugin has a switch for sharing anonymous usage snapshots and searches with no results. Project-title sharing is a separate choice, off by default. Usage reports may include Dirory product names, brands, categories, quantities, painted area, and a SketchUp model identifier. They do not include geometry, the SketchUp file, or filesystem paths. Turn sharing off in the plugin account dialog to stop future reports.</p></section>
        <section><h2 className="text-lg font-semibold text-slate-900">Quotes and vendors</h2><p>Your contact information and project details are shared with a vendor only when you choose to send that vendor a quote request. Vendors do not get access to raw usage snapshots, project names, architect identities, or search misses.</p></section>
        <section><h2 className="text-lg font-semibold text-slate-900">Storage, retention and your requests</h2><p>Dirory uses Supabase for authentication, database and storage. The project is hosted in Singapore. To request access, correction or deletion, contact <a className="underline" href="mailto:hello@dirory.com">hello@dirory.com</a> with the subject "Privacy request". Retention and deletion automation are still being implemented; this is a draft, not a final legal notice.</p></section>
        <section><h2 className="text-lg font-semibold text-slate-900">Controller</h2><p>Before launch, this page must be updated with the legal entity name, postal address, privacy contact and any required data protection officer information under Indonesia's Personal Data Protection Law (UU No. 27/2022).</p></section>
      </div>
    </main>
  );
}
